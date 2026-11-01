import { useEffect, useMemo, useState } from "react";
import {
  KEYS,
  KEY_BY_ID,
  SCALE_BY_ID,
  STANDARD_TUNING,
  applyAttempt,
  cellKey,
  checkAnswer,
  completedCount,
  dailySpecFor,
  dateKeyOf,
  expectedNameMap,
  generatePuzzle,
  isUnlocked,
  parMsFor,
  pitchClassAt,
  solfegeLabel,
  starsForAttempt,
  streakOf,
  totalStars,
  type AttemptResult,
  type Cell,
  type LevelDef,
  type ProgressMap,
} from "@guitar/core";
import { LEVELS, LEVEL_IDS, MAX_TOTAL_STARS, parMsOf } from "../lib/levels";
import {
  loadDaily,
  loadProgress,
  loadSettings,
  saveDaily,
  saveProgress,
  type DailyMap,
  type Settings,
} from "../lib/storage";
import { starText } from "../components/Stars";
import NotePicker from "../components/NotePicker";
import PuzzleBoard from "../components/PuzzleBoard";
import ResultPanel from "../components/ResultPanel";
import { copyText } from "../lib/clipboard";
import { fmt } from "../lib/format";

function scaleName(scaleId: string): string {
  return SCALE_BY_ID.get(scaleId)?.name ?? scaleId;
}

/** 开局落在「第一个没通关的已解锁关卡」，全通了就停在最后一关。 */
function pickStartLevel(progress: ProgressMap): string {
  for (let i = 0; i < LEVEL_IDS.length; i++) {
    if (!progress[LEVEL_IDS[i]]?.completed && isUnlocked(LEVEL_IDS, i, progress)) {
      return LEVEL_IDS[i];
    }
  }
  return LEVEL_IDS[LEVEL_IDS.length - 1] ?? "L01";
}

interface Gain {
  /** 这一把的星级（不是历史最高）。 */
  stars: number;
  newBest: boolean;
  /** 这一把刚刚解锁的下一关。 */
  unlocked: string | null;
}
type Mode = "levels" | "daily" | "recall";

interface RecallRound {
  keyId: string;
  seed: number;
  /** 唯一提示：某一根弦的某一品是主音（do / 1）。 */
  anchor: Cell;
}

/**
 * 推算模式：随机调 + 随机一个「调内音」位置作为唯一提示。
 * 锚点不一定是主音——给个三音、五音甚至降七，推起来更费脑子。
 */
function makeRecallRound(): RecallRound {
  const key = KEYS[Math.floor(Math.random() * KEYS.length)];
  const scaleId = key.mode === "minor" ? "naturalMinor" : "major";
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const probe = generatePuzzle({ seed, keyId: key.id, scaleId, fretMin: 1, fretMax: 12, givenRatio: 0.5 });
  const pool = probe.target;
  return { keyId: key.id, seed, anchor: pool[Math.floor(Math.random() * pool.length)] };
}

export default function Game() {
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [levelId, setLevelId] = useState(() => pickStartLevel(loadProgress()));
  const [mode, setMode] = useState<Mode>("levels");
  const [round, setRound] = useState<RecallRound>(() => makeRecallRound());
  /** 挂载时固定「今天」；跨零点继续开着的话切一下模式或刷新即可。 */
  const [todayKey] = useState(() => dateKeyOf(new Date()));
  const [daily, setDaily] = useState<DailyMap>(() => loadDaily());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Cell | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [gain, setGain] = useState<Gain | null>(null);
  /** 试玩：允许进入还没解锁的关卡，方便评估后面的难度。 */
  const [tryLocked, setTryLocked] = useState(false);
  const [copied, setCopied] = useState(false);

  /** 每日挑战用同一套渲染，只是题目参数来自日期。 */
  const dailyLevel = useMemo<LevelDef>(() => {
    const spec = dailySpecFor(todayKey);
    return {
      id: `daily:${todayKey}`,
      chapter: 0,
      index: 0,
      title: `每日挑战 · ${todayKey}`,
      keyId: spec.keyId,
      scaleId: spec.scaleId,
      tuningId: "standard",
      fretMin: spec.fretMin,
      fretMax: spec.fretMax,
      seed: spec.seed,
      givenRatio: spec.givenRatio,
      givens: [],
      // 每日题不是关卡，targetCount / difficulty 由出题结果决定（见下面的 parMs）
      targetCount: 0,
      difficulty: 0,
    };
  }, [todayKey]);

  /** 推算模式的「关卡」只是个壳，用来提供调、音阶、品域。 */
  const recallLevel = useMemo<LevelDef>(() => {
    const key = KEY_BY_ID.get(round.keyId)!;
    return {
      id: `recall:${round.seed}`,
      chapter: 0,
      index: 0,
      title: `推算模式 · ${key.name}`,
      keyId: key.id,
      scaleId: key.mode === "minor" ? "naturalMinor" : "major",
      tuningId: "standard",
      fretMin: 1,
      fretMax: 12,
      seed: round.seed,
      givenRatio: 0.5,
      givens: [],
      targetCount: 0,
      difficulty: 0,
    };
  }, [round]);

  const level = mode === "daily" ? dailyLevel : mode === "recall" ? recallLevel : (LEVELS.find((l) => l.id === levelId) ?? LEVELS[0]);
  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);

  const levelPuzzle = useMemo(
    () =>
      generatePuzzle({
        id: level.id,
        seed: level.seed,
        keyId: level.keyId,
        scaleId: level.scaleId,
        fretMin: level.fretMin,
        fretMax: level.fretMax,
        givenRatio: level.givenRatio,
      }),
    [level.id],
  );

  /** 推算模式：只把那个主音当作给定，其余格子都是空的；判定时排除这一格。 */
  const recallPuzzle = useMemo(() => {
    const base = generatePuzzle({
      id: recallLevel.id,
      seed: recallLevel.seed,
      keyId: recallLevel.keyId,
      scaleId: recallLevel.scaleId,
      fretMin: recallLevel.fretMin,
      fretMax: recallLevel.fretMax,
      givenRatio: recallLevel.givenRatio,
    });
    return {
      ...base,
      givens: [round.anchor],
      target: base.target.filter((c) => !(c.s === round.anchor.s && c.f === round.anchor.f)),
    };
  }, [recallLevel, round.anchor]);

  const puzzle = mode === "recall" ? recallPuzzle : levelPuzzle;

  const parMs =
    mode === "levels"
      ? parMsOf(level)
      : parMsFor({ targetCount: puzzle.target.length, difficulty: puzzle.difficulty });
  /** 首调唱名要按当前调的主音算。 */
  const tonicPc = KEY_BY_ID.get(level.keyId)?.tonicPc ?? 0;
  const record = mode === "daily" ? daily[todayKey] : mode === "recall" ? undefined : progress[level.id];
  const streak = useMemo(() => streakOf(Object.keys(daily), todayKey), [daily, todayKey]);
  const expected = useMemo(() => expectedNameMap(puzzle), [puzzle]);
  /** 难度按 0–10 显示；要填的格数 = 目标 − 给定。 */
  const difficulty10 = Math.round(puzzle.difficulty * 10);
  const fillCount = puzzle.target.length - puzzle.givens.length;

  /** 错误分布：按弦统计，告诉玩家该重点看哪根弦。 */
  const errorByString = useMemo(() => {
    if (!result) return [];
    const counts = new Map<number, number>();
    for (const c of result.cells) {
      if (c.status === "correct") continue;
      counts.set(c.cell.s, (counts.get(c.cell.s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [result]);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const g of puzzle.givens) {
      init[cellKey(g)] = expected.get(pitchClassAt(STANDARD_TUNING, g.s, g.f)) ?? "";
    }
    setAnswers(init);
    setResult(null);
    setGain(null);
    setStartedAt(null);
    setEndedAt(null);
    setPicker(null);
  }, [puzzle]);

  useEffect(() => {
    if (!startedAt || endedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt, endedAt]);

  const elapsed = startedAt ? (endedAt ?? now) - startedAt : 0;
  const done = completedCount(LEVEL_IDS, progress);
  const stars = totalStars(progress);
  const next = mode === "levels" ? LEVELS[levelIndex + 1] : undefined;

  function choose(cell: Cell, value: string) {
    if (result) return;
    // 用函数式更新：键盘 effect 的闭包里 startedAt 可能是旧值，别把计时重置掉。
    setStartedAt((prev) => prev ?? Date.now());
    setAnswers((prev) => ({ ...prev, [cellKey(cell)]: value }));
    setPicker(null);
  }

  function submit() {
    if (result) return;
    const r = checkAnswer(puzzle, answers);
    setResult(r);

    // 没开始填就提交（全是空格）：只展示判定，不污染进度统计。
    if (!startedAt) {
      setStartedAt(Date.now());
      setEndedAt(Date.now());
      setGain(null);
      return;
    }

    const elapsedMs = Date.now() - startedAt;
    setEndedAt(Date.now());
    const ctx = { elapsedMs, strictSpelling: settings.strictSpelling, parMs };

    // 推算模式：只判定这一把，不写进度、不算星级。
    if (mode === "recall") {
      setGain(null);
      return;
    }

    // 每日挑战：记到 guitar.daily.v1，不动主线进度、不算解锁。
    if (mode === "daily") {
      const beforeDaily = daily[todayKey];
      const afterDaily = applyAttempt(beforeDaily, r, ctx);
      const nextDaily = { ...daily, [todayKey]: afterDaily };
      setDaily(nextDaily);
      saveDaily(nextDaily);
      const beforeBest = beforeDaily?.bestMs ?? null;
      setGain({
        stars: starsForAttempt(r, ctx),
        newBest: afterDaily.bestMs !== null && (beforeBest === null || afterDaily.bestMs < beforeBest),
        unlocked: null,
      });
      return;
    }

    const before = progress[level.id];
    const after = applyAttempt(before, r, ctx);
    const nextProgress = { ...progress, [level.id]: after };
    setProgress(nextProgress);
    saveProgress(nextProgress);

    const nextIdx = levelIndex + 1;
    const beforeBest = before?.bestMs ?? null;
    setGain({
      // 显示这一把的星，不是历史最高；历史最高在下拉和「最快全对」里。
      stars: starsForAttempt(r, ctx),
      newBest: after.bestMs !== null && (beforeBest === null || after.bestMs < beforeBest),
      unlocked:
        nextIdx < LEVEL_IDS.length &&
        isUnlocked(LEVEL_IDS, nextIdx, nextProgress) &&
        !isUnlocked(LEVEL_IDS, nextIdx, progress)
          ? LEVEL_IDS[nextIdx]
          : null,
    });
  }

  function reset() {
    const init: Record<string, string> = {};
    for (const g of puzzle.givens) {
      init[cellKey(g)] = expected.get(pitchClassAt(STANDARD_TUNING, g.s, g.f)) ?? "";
    }
    setAnswers(init);
    setResult(null);
    setGain(null);
    setStartedAt(null);
    setEndedAt(null);
    setPicker(null);
  }


  /** 复制一条可分享的战绩文案。 */
  async function shareResult() {
    if (!result) return;
    const ms = formatDuration(result, startedAt, endedAt);
    const stars = gain?.stars ?? record?.stars ?? 0;
    const headlineText = mode === "levels" ? `${level.id} ${level.title}` : level.title;
    const scoreText = mode === "recall" ? `答对 ${result.correct}/${result.total}` : starText(stars);
    const ok = await copyText(`Guitar Lab · ${headlineText}｜${scoreText}｜用时 ${fmt(ms)}`);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setPicker(null);
  }

  function selectLevel(id: string) {
    const idx = LEVELS.findIndex((l) => l.id === id);
    if (idx < 0) return;
    if (!tryLocked && !isUnlocked(LEVEL_IDS, idx, progress)) return;
    setLevelId(id);
  }

  /** 推算模式里那唯一一格提示的级数（任意调内音，不一定是 1）。 */
  const anchorLabel = solfegeLabel(
    pitchClassAt(STANDARD_TUNING, round.anchor.s, round.anchor.f),
    tonicPc,
    { system: settings.solfegeSystem, style: settings.solfegeStyle },
  );

  return (
    <section className="panel game">
      <div className="mode-switch" role="tablist" aria-label="题目来源">
        <button
          role="tab"
          aria-selected={mode === "levels"}
          className={mode === "levels" ? "chip active" : "chip"}
          onClick={() => switchMode("levels")}
        >
          主线关卡
        </button>
        <button
          role="tab"
          aria-selected={mode === "daily"}
          className={mode === "daily" ? "chip active" : "chip"}
          onClick={() => switchMode("daily")}
        >
          今日挑战
          {streak.todayDone ? " ✓" : ""}
        </button>
        <button
          role="tab"
          aria-selected={mode === "recall"}
          className={mode === "recall" ? "chip active" : "chip"}
          onClick={() => switchMode("recall")}
        >
          推算模式
        </button>
        <span className="muted daily-streak">
          连续 {streak.current} 天{streak.current > 0 && !streak.todayDone ? "（今天还没做）" : ""}
        </span>
      </div>

      <div className="game-top">
        <div className="game-title">
          <h2>{level.title}</h2>
          {mode === "recall" ? (
            <p>
              只有一格提示：<b>{6 - round.anchor.s} 弦 {round.anchor.f} 品 = {anchorLabel}</b>
              {" · "}其余格子自己推，调外音可以空着（提交时只校验调内音）
            </p>
          ) : (
            <p>
              {scaleName(level.scaleId)} · 难度 {difficulty10}/10 · 给定 {puzzle.givens.length} / 目标{" "}
              {puzzle.target.length}（要填 {fillCount}） ·{" "}
              {mode === "daily" ? (
                <span className="progress-line">每日挑战不影响主线解锁</span>
              ) : (
                <span className="progress-line">
                  已通关 {done}/{LEVELS.length} · ★ {stars}/{MAX_TOTAL_STARS}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="game-clock" aria-live="polite">
          <span className="clock">{fmt(elapsed)}</span>
          <span className="muted">
            {mode === "recall"
              ? "本模式不记录成绩"
              : record?.bestMs != null
                ? `最快全对 ${fmt(record.bestMs)}`
                : "还没全对过"}
          </span>
        </div>
      </div>

      <div className="toolbar">
        {mode === "levels" && (
          <label>
            关卡
            <select value={level.id} onChange={(e) => selectLevel(e.target.value)}>
              {[1, 2, 3, 4].map((ch) => (
                <optgroup key={ch} label={`第 ${ch} 章`}>
                  {LEVELS.filter((l) => l.chapter === ch).map((l) => {
                    const idx = LEVELS.findIndex((x) => x.id === l.id);
                    const open = isUnlocked(LEVEL_IDS, idx, progress);
                    const stars = progress[l.id]?.stars ?? 0;
                    const d10 = Math.round(l.difficulty * 10);
                    const fill = l.targetCount - l.givens.length;
                    return (
                      <option key={l.id} value={l.id} disabled={!open && !tryLocked}>
                        {l.id} · {l.title} · 难度 {d10} · 填 {fill}
                        {open ? ` ${starText(stars)}` : " · 未解锁"}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {mode === "levels" && (
          <label className="check">
            <input
              type="checkbox"
              checked={tryLocked}
              onChange={(e) => setTryLocked(e.target.checked)}
            />
            试玩未解锁
          </label>
        )}
        <button className="btn ghost" onClick={reset}>
          重来
        </button>
        <button className="btn primary" onClick={submit} disabled={!!result}>
          提交
        </button>
        {mode === "recall" && (
          <button className="btn ghost" onClick={() => setRound(makeRecallRound())}>
            换一题
          </button>
        )}
        {mode === "levels" && next && (
          <button
            className="btn ghost"
            onClick={() => selectLevel(next.id)}
            disabled={!tryLocked && !isUnlocked(LEVEL_IDS, levelIndex + 1, progress)}
          >
            下一关 →
          </button>
        )}
      </div>

      <p className="hint">
        ? = 待填 · 灰格 = 非音阶 · 点 ? 选音名；第一次选择开始计时。桌面可用 Tab 选格，Enter 打开后直接输入音名。
      </p>

      <PuzzleBoard
        puzzle={puzzle}
        mode={mode}
        answers={answers}
        result={result}
        settings={settings}
        tonicPc={tonicPc}
        anchorLabel={anchorLabel}
        onPickCell={(cell) => setPicker(cell)}
      />

      {result && (
        <ResultPanel
          result={result}
          mode={mode}
          gain={gain}
          record={record}
          parMs={parMs}
          elapsedMs={formatDuration(result, startedAt, endedAt)}
          strictSpelling={settings.strictSpelling}
          errorByString={errorByString}
          anchorLabel={anchorLabel}
          copied={copied}
          onCopy={shareResult}
          onRetry={reset}
          actions={
            mode === "recall" ? (
              <button className="btn primary" onClick={() => setRound(makeRecallRound())}>
                换一题（随机调）
              </button>
            ) : mode === "daily" ? (
              <span className="muted">
                每日挑战 · 连续 {streak.current} 天{streak.todayDone ? "（今天已完成）" : ""}
              </span>
            ) : next ? (
              <button
                className="btn primary"
                onClick={() => selectLevel(next.id)}
                disabled={!tryLocked && !isUnlocked(LEVEL_IDS, levelIndex + 1, progress)}
              >
                下一关：{next.title}
              </button>
            ) : (
              <span className="muted">已是最后一关</span>
            )
          }
        />
      )}

      {picker && (
        <NotePicker
          cell={picker}
          onPick={(value) => choose(picker, value)}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}

function formatDuration(r: AttemptResult, startedAt: number | null, endedAt: number | null): number {
  if (!startedAt || !endedAt) return 0;
  return endedAt - startedAt;
}
