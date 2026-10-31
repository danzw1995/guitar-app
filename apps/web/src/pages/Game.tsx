import { useEffect, useMemo, useState } from "react";
import {
  NOTE_NAMES,
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
  isPerfect,
  isUnlocked,
  nextNoteQuery,
  noteCandidates,
  parMsFor,
  pitchClassAt,
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
  clearProgress,
  loadDaily,
  loadProgress,
  loadSettings,
  saveDaily,
  saveProgress,
  saveSettings,
  type DailyMap,
  type Settings,
} from "../lib/storage";
import Fretboard from "../components/Fretboard";
import Stars, { starText } from "../components/Stars";
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

type Mode = "levels" | "daily";

export default function Game() {
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [levelId, setLevelId] = useState(() => pickStartLevel(loadProgress()));
  const [mode, setMode] = useState<Mode>("levels");
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 键盘输入的音名前缀，如 "E" / "Eb" / "C#"；空表示没输入。 */
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

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

  const level = mode === "daily" ? dailyLevel : (LEVELS.find((l) => l.id === levelId) ?? LEVELS[0]);
  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);

  const puzzle = useMemo(
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

  const parMs =
    mode === "daily"
      ? parMsFor({ targetCount: puzzle.target.length, difficulty: puzzle.difficulty })
      : parMsOf(level);
  const record = mode === "daily" ? daily[todayKey] : progress[level.id];
  const streak = useMemo(() => streakOf(Object.keys(daily), todayKey), [daily, todayKey]);

  const expected = useMemo(() => expectedNameMap(puzzle), [puzzle]);

  const givenKeys = useMemo(() => new Set(puzzle.givens.map(cellKey)), [puzzle]);
  const targetKeys = useMemo(() => new Set(puzzle.target.map(cellKey)), [puzzle]);
  const statusByKey = useMemo(() => {
    const m = new Map<string, AttemptResult["cells"][number]["status"]>();
    result?.cells.forEach((c) => m.set(cellKey(c.cell), c.status));
    return m;
  }, [result]);

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

  /** 键盘候选：前缀过滤，精确匹配排最前（输 "B" 时 B 在 Bb 前面）。 */
  const candidates = useMemo(() => noteCandidates(query), [query]);

  const activeIndex = candidates.length ? Math.min(cursor, candidates.length - 1) : -1;
  const activeNote = activeIndex >= 0 ? candidates[activeIndex] : null;

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

  // 键盘：音名选择器打开时接管按键。Tab 到目标格 -> Enter 打开 -> 输入音名 -> Enter 确认。
  useEffect(() => {
    if (!picker) return;

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key;

      if (key === "Escape") {
        e.preventDefault();
        setPicker(null);
        return;
      }
      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        setQuery((q) => q.slice(0, -1));
        setCursor(0);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        const note = candidates[Math.min(cursor, Math.max(0, candidates.length - 1))];
        if (note) choose(picker!, note);
        return;
      }
      if (key === "ArrowDown" || key === "ArrowRight") {
        e.preventDefault();
        setCursor((c) => (candidates.length ? (c + 1) % candidates.length : 0));
        return;
      }
      if (key === "ArrowUp" || key === "ArrowLeft") {
        e.preventDefault();
        setCursor((c) => (candidates.length ? (c - 1 + candidates.length) % candidates.length : 0));
        return;
      }
      // 音名输入（含 # / b）走 core 的纯函数，规则只写一份。
      const nextQuery = nextNoteQuery(query, key);
      if (nextQuery !== null) {
        e.preventDefault();
        setQuery(nextQuery);
        setCursor(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picker, candidates, cursor, query]);

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

  function toggleStrict(next: boolean) {
    const s = { ...settings, strictSpelling: next };
    setSettings(s);
    saveSettings(s);
  }

  function wipeProgress() {
    if (!window.confirm("重置会清空 40 关的星级、最快成绩和每日挑战记录，确定吗？")) return;
    clearProgress();
    setProgress({});
    setDaily({});
    setLevelId(LEVEL_IDS[0]);
    reset();
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setPicker(null);
  }

  function selectLevel(id: string) {
    const idx = LEVELS.findIndex((l) => l.id === id);
    if (idx < 0 || !isUnlocked(LEVEL_IDS, idx, progress)) return;
    setLevelId(id);
  }

  const perfect = result ? isPerfect(result, settings.strictSpelling) : false;
  const headline = !result
    ? ""
    : !result.finished
      ? `还差 ${result.empty} 格`
      : perfect
        ? "全对！"
        : "完成";

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
        <span className="muted daily-streak">
          连续 {streak.current} 天{streak.current > 0 && !streak.todayDone ? "（今天还没做）" : ""}
        </span>
      </div>

      <div className="game-top">
        <div className="game-title">
          <h2>{level.title}</h2>
          <p>
            {scaleName(level.scaleId)} · 给定 {puzzle.givens.length} / 目标 {puzzle.target.length} ·{" "}
            {mode === "daily" ? (
              <span className="progress-line">每日挑战不影响主线解锁</span>
            ) : (
              <span className="progress-line">
                已通关 {done}/{LEVELS.length} · ★ {stars}/{MAX_TOTAL_STARS}
              </span>
            )}
          </p>
        </div>
        <div className="game-clock" aria-live="polite">
          <span className="clock">{fmt(elapsed)}</span>
          <span className="muted">
            {record?.bestMs != null ? `最快全对 ${fmt(record.bestMs)}` : "还没全对过"}
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
                    return (
                      <option key={l.id} value={l.id} disabled={!open}>
                        {l.id} · {l.title}
                        {open ? ` ${starText(stars)}` : " · 未解锁"}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <button className="btn ghost" onClick={reset}>
          重来
        </button>
        <button className="btn primary" onClick={submit} disabled={!!result}>
          提交
        </button>
        {mode === "levels" && next && (
          <button
            className="btn ghost"
            onClick={() => selectLevel(next.id)}
            disabled={!isUnlocked(LEVEL_IDS, levelIndex + 1, progress)}
          >
            下一关 →
          </button>
        )}
        <button className="btn ghost" onClick={() => setSettingsOpen((v) => !v)}>
          设置
        </button>
      </div>

      {settingsOpen && (
        <div className="settings">
          <label className="settings-row">
            <span>
              严格拼写
              <span className="muted"> · 拼错算错，拿不到 2 星以上</span>
            </span>
            <input
              type="checkbox"
              checked={settings.strictSpelling}
              onChange={(e) => toggleStrict(e.target.checked)}
            />
          </label>
          <div className="settings-row">
            <span className="muted">重置会清空星级和最快成绩（只影响本机）。</span>
            <button className="btn ghost" onClick={wipeProgress}>
              重置进度
            </button>
          </div>
        </div>
      )}

      <p className="hint">
        ? = 待填 · 灰格 = 非音阶 · 点 ? 选音名；第一次选择开始计时。桌面可用 Tab 选格，Enter 打开后直接输入音名。
      </p>

      <Fretboard
        fretMin={puzzle.fretMin}
        fretMax={puzzle.fretMax}
        renderCell={(s, f) => {
          const k = `${s}:${f}`;
          if (givenKeys.has(k)) return expected.get(pitchClassAt(STANDARD_TUNING, s, f)) ?? "";
          if (answers[k]) return answers[k];
          if (targetKeys.has(k)) return "?";
          return "";
        }}
        cellClass={(s, f) => {
          const k = `${s}:${f}`;
          if (givenKeys.has(k)) return "given";
          if (result && statusByKey.has(k)) {
            const st = statusByKey.get(k)!;
            return st === "correct" ? "ok" : st === "spelling" ? "spell" : st === "wrong" ? "bad" : "empty";
          }
          if (targetKeys.has(k)) return answers[k] ? "filled" : "target";
          return "off";
        }}
        isDisabled={(s, f) => {
          const k = `${s}:${f}`;
          return !targetKeys.has(k) || givenKeys.has(k) || !!result;
        }}
        onCellClick={(s, f) => {
          const k = `${s}:${f}`;
          if (!targetKeys.has(k) || givenKeys.has(k) || result) return;
          setQuery("");
          setCursor(0);
          setPicker({ s, f });
        }}
      />

      {result && (
        <div className="result">
          <div className="result-head">
            <h3>{headline}</h3>
            <Stars n={gain?.stars ?? 0} size="lg" />
          </div>
          <div className="result-grid">
            <div>
              <b>{fmt(formatDuration(result, startedAt, endedAt))}</b>
              <span>用时</span>
            </div>
            <div>
              <b>{result.correct}/{result.total}</b>
              <span>正确</span>
            </div>
            <div>
              <b>{result.spelling}</b>
              <span>拼写提示</span>
            </div>
            <div>
              <b>{result.wrong + result.empty}</b>
              <span>错误/空</span>
            </div>
            <div>
              <b>{Math.round(result.accuracy * 100)}%</b>
              <span>准确率</span>
            </div>
          </div>

          <div className="result-meta">
            <span>三星目标 {fmt(parMs)}</span>
            <span>{record?.bestMs != null ? `最快全对 ${fmt(record.bestMs)}` : "还没全对过"}</span>
            {gain?.newBest && <span className="badge">新纪录</span>}
            {gain?.unlocked && <span className="badge">已解锁 {gain.unlocked}</span>}
          </div>

          {errorByString.length > 0 && (
            <div className="result-dist">
              <span className="muted">错误分布</span>
              {errorByString.map(([s, n]) => (
                <span key={s} className="chip">
                  {s + 1} 弦 ×{n}
                </span>
              ))}
            </div>
          )}

          <div className="result-actions">
            {mode === "daily" ? (
              <span className="muted">
                每日挑战 · 连续 {streak.current} 天{streak.todayDone ? "（今天已完成）" : ""}
              </span>
            ) : next ? (
              <button
                className="btn primary"
                onClick={() => selectLevel(next.id)}
                disabled={!isUnlocked(LEVEL_IDS, levelIndex + 1, progress)}
              >
                下一关：{next.title}
              </button>
            ) : (
              <span className="muted">已是最后一关</span>
            )}
            <button className="btn ghost" onClick={reset}>
              再练一次
            </button>
          </div>
        </div>
      )}

      {picker && (
        <div className="picker-backdrop" onClick={() => setPicker(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head">
              <span>
                {picker.s + 1} 弦 · {picker.f} 品
                {query && ` · 输入 ${query}`}
              </span>
              <button className="btn ghost" onClick={() => choose(picker, "")}>
                清除
              </button>
            </div>
            <div className="picker-grid">
              {NOTE_NAMES.map((n) => (
                <button
                  key={n}
                  className={n === activeNote ? "note-btn active" : "note-btn"}
                  onClick={() => choose(picker, n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {candidates.length === 0 && <p className="picker-hint">没有匹配的音名</p>}
            <p className="picker-hint">
              键盘：输入音名（可加 # 或 b）· 方向键选择 · Enter 确认 · Esc 关闭
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDuration(r: AttemptResult, startedAt: number | null, endedAt: number | null): number {
  if (!startedAt || !endedAt) return 0;
  return endedAt - startedAt;
}
