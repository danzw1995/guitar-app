import { useEffect, useMemo, useState } from "react";
import {
  STANDARD_TUNING,
  cellKey,
  checkAnswer,
  expectedNameMap,
  generatePuzzle,
  pitchClassAt,
  type AttemptResult,
  type Cell,
  type LevelDef,
} from "@guitar/core";
import levelsJson from "../../../../packages/core/data/levels.json";
import Fretboard from "../components/Fretboard";

const LEVELS = (levelsJson as { levels: LevelDef[] }).levels;
const NOTE_CHOICES = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

function fmt(ms: number): string {
  if (ms <= 0) return "0:00.0";
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const d = Math.floor((total * 10) % 10);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

export default function Game() {
  const [levelId, setLevelId] = useState("L01");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Cell | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [best, setBest] = useState<number | null>(null);

  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
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
    [levelId],
  );
  const expected = useMemo(() => expectedNameMap(puzzle), [puzzle]);

  const givenKeys = useMemo(() => new Set(puzzle.givens.map(cellKey)), [puzzle]);
  const targetKeys = useMemo(() => new Set(puzzle.target.map(cellKey)), [puzzle]);
  const statusByKey = useMemo(() => {
    const m = new Map<string, AttemptResult["cells"][number]["status"]>();
    result?.cells.forEach((c) => m.set(cellKey(c.cell), c.status));
    return m;
  }, [result]);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const g of puzzle.givens) {
      init[cellKey(g)] = expected.get(pitchClassAt(STANDARD_TUNING, g.s, g.f)) ?? "";
    }
    setAnswers(init);
    setResult(null);
    setStartedAt(null);
    setEndedAt(null);
    setPicker(null);
    const saved = Number(localStorage.getItem(`guitar.best.${level.id}`));
    setBest(Number.isFinite(saved) && saved > 0 ? saved : null);
  }, [puzzle]);

  useEffect(() => {
    if (!startedAt || endedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt, endedAt]);

  const elapsed = startedAt ? (endedAt ?? now) - startedAt : 0;

  function choose(cell: Cell, value: string) {
    if (result) return;
    if (!startedAt) setStartedAt(Date.now());
    setAnswers((prev) => ({ ...prev, [cellKey(cell)]: value }));
    setPicker(null);
  }

  function submit() {
    const t = startedAt ? Date.now() - startedAt : 0;
    if (!startedAt) setStartedAt(Date.now());
    const r = checkAnswer(puzzle, answers);
    setResult(r);
    setEndedAt(Date.now());
    if (r.correct === r.total && (!best || t < best)) {
      localStorage.setItem(`guitar.best.${level.id}`, String(t));
      setBest(t);
    }
  }

  function reset() {
    const init: Record<string, string> = {};
    for (const g of puzzle.givens) {
      init[cellKey(g)] = expected.get(pitchClassAt(STANDARD_TUNING, g.s, g.f)) ?? "";
    }
    setAnswers(init);
    setResult(null);
    setStartedAt(null);
    setEndedAt(null);
    setPicker(null);
  }

  const next = LEVELS[LEVELS.findIndex((l) => l.id === level.id) + 1];

  return (
    <section className="panel game">
      <div className="game-top">
        <div className="game-title">
          <h2>{level.title}</h2>
          <p>{level.scaleId === "major" ? "大调" : "自然小调"} · 给定 {puzzle.givens.length} / 目标 {puzzle.target.length}</p>
        </div>
        <div className="game-clock" aria-live="polite">
          <span className="clock">{fmt(elapsed)}</span>
          <span className="muted">{best ? `最佳 ${fmt(best)}` : "首次挑战"}</span>
        </div>
      </div>

      <div className="toolbar">
        <label>
          关卡
          <select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            {[1, 2, 3, 4].map((ch) => (
              <optgroup key={ch} label={`第 ${ch} 章`}>
                {LEVELS.filter((l) => l.chapter === ch).map((l) => (
                  <option key={l.id} value={l.id}>{l.id} · {l.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="btn ghost" onClick={reset}>重来</button>
        <button className="btn primary" onClick={submit} disabled={!!result}>提交</button>
        {next && <button className="btn ghost" onClick={() => setLevelId(next.id)}>下一关 →</button>}
      </div>

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
          <h3>{result.correct === result.total ? "全对！" : "完成"}</h3>
          <div className="result-grid">
            <div><b>{fmt(formatDuration(result, startedAt, endedAt))}</b><span>用时</span></div>
            <div><b>{result.correct}/{result.total}</b><span>正确</span></div>
            <div><b>{result.spelling}</b><span>拼写提示</span></div>
            <div><b>{result.wrong + result.empty}</b><span>错误/空</span></div>
            <div><b>{Math.round(result.accuracy * 100)}%</b><span>准确率</span></div>
          </div>
        </div>
      )}

      {picker && (
        <div className="picker-backdrop" onClick={() => setPicker(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head">
              <span>{picker.s + 1} 弦 · {picker.f} 品</span>
              <button className="btn ghost" onClick={() => choose(picker, "")}>清除</button>
            </div>
            <div className="picker-grid">
              {NOTE_CHOICES.map((n) => (
                <button key={n} className="note-btn" onClick={() => choose(picker, n)}>{n}</button>
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
