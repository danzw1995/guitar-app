import { useEffect, useMemo, useState } from "react";
import {
  SCALE_BY_ID,
  STANDARD_TUNING,
  applyAttempt,
  cellKey,
  checkAnswer,
  completedCount,
  expectedNameMap,
  generatePuzzle,
  isPerfect,
  isUnlocked,
  pitchClassAt,
  starsForAttempt,
  totalStars,
  type AttemptResult,
  type Cell,
  type ProgressMap,
} from "@guitar/core";
import { LEVELS, LEVEL_IDS, MAX_TOTAL_STARS, parMsOf } from "../lib/levels";
import {
  clearProgress,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  type Settings,
} from "../lib/storage";
import Fretboard from "../components/Fretboard";
import Stars, { starText } from "../components/Stars";

const NOTE_CHOICES = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

function fmt(ms: number): string {
  if (ms <= 0) return "0:00.0";
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const d = Math.floor((total * 10) % 10);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

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

export default function Game() {
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [levelId, setLevelId] = useState(() => pickStartLevel(loadProgress()));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Cell | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [gain, setGain] = useState<Gain | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);
  const parMs = parMsOf(level);
  const record = progress[level.id];

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
  const next = LEVELS[levelIndex + 1];

  function choose(cell: Cell, value: string) {
    if (result) return;
    if (!startedAt) setStartedAt(Date.now());
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

    const before = progress[level.id];
    const after = applyAttempt(before, r, {
      elapsedMs,
      strictSpelling: settings.strictSpelling,
      parMs,
    });
    const nextProgress = { ...progress, [level.id]: after };
    setProgress(nextProgress);
    saveProgress(nextProgress);

    const nextIdx = levelIndex + 1;
    const beforeBest = before?.bestMs ?? null;
    setGain({
      // 显示这一把的星，不是历史最高；历史最高在下拉和「最快全对」里。
      stars: starsForAttempt(r, { elapsedMs, strictSpelling: settings.strictSpelling, parMs }),
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
    if (!window.confirm("重置会清空 40 关的星级和最快成绩，确定吗？")) return;
    clearProgress();
    setProgress({});
    setLevelId(LEVEL_IDS[0]);
    reset();
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
      <div className="game-top">
        <div className="game-title">
          <h2>{level.title}</h2>
          <p>
            {scaleName(level.scaleId)} · 给定 {puzzle.givens.length} / 目标 {puzzle.target.length} ·{" "}
            <span className="progress-line">
              已通关 {done}/{LEVELS.length} · ★ {stars}/{MAX_TOTAL_STARS}
            </span>
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
        <button className="btn ghost" onClick={reset}>
          重来
        </button>
        <button className="btn primary" onClick={submit} disabled={!!result}>
          提交
        </button>
        {next && (
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

      <p className="hint">? = 待填 · 灰格 = 非音阶 · 点 ? 选音名；第一次选择开始计时。</p>

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
            {next ? (
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
              </span>
              <button className="btn ghost" onClick={() => choose(picker, "")}>
                清除
              </button>
            </div>
            <div className="picker-grid">
              {NOTE_CHOICES.map((n) => (
                <button key={n} className="note-btn" onClick={() => choose(picker, n)}>
                  {n}
                </button>
              ))}
            </div>
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
