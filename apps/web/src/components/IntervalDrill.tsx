import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INTERVAL_KEYS,
  KEY_BY_ID,
  intervalDrillAnswerText,
  intervalDrillQuestion,
  intervalQualityRows,
  intervalTableOf,
} from "@guitar/core";
import { useTone } from "../hooks/useTone";

/** 音程闯关的成绩：最长连对、一共答过多少、对了多少（存着，下次接着来） */
const STORE_KEY = "guitar.intervals.v1";

interface IntervalStats {
  best: number;
  total: number;
  right: number;
}

export function loadIntervalStats(): IntervalStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<IntervalStats>;
    const num = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    return { best: num(raw.best), total: num(raw.total), right: Math.min(num(raw.right), num(raw.total)) };
  } catch {
    return { best: 0, total: 0, right: 0 };
  }
}

function saveIntervalStats(next: IntervalStats): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // 存不下就算了，闯关还能接着玩
  }
}

export default function IntervalDrill() {
  const [tableKey, setTableKey] = useState("C");
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [seed, setSeed] = useState(1);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState<IntervalStats>(() => loadIntervalStats());
  const [answered, setAnswered] = useState<string | null>(null);
  const [run, setRun] = useState({ asked: 0, right: 0 });
  const timer = useRef<number | null>(null);
  const { play } = useTone();

  const question = useMemo(() => intervalDrillQuestion(index, seed), [index, seed]);
  const table = useMemo(() => intervalTableOf(tableKey), [tableKey]);
  const qualities = useMemo(() => intervalQualityRows(), []);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const next = useCallback(() => {
    clearTimer();
    setAnswered(null);
    setIndex((value) => value + 1);
  }, []);

  const answer = (option: string) => {
    if (answered !== null) return;
    setAnswered(option);
    const right = option === question.answer;
    const nextStats: IntervalStats = {
      best: Math.max(stats.best, right ? streak + 1 : streak),
      total: stats.total + 1,
      right: stats.right + (right ? 1 : 0),
    };
    setStats(nextStats);
    saveIntervalStats(nextStats);
    setRun((value) => ({ asked: value.asked + 1, right: value.right + (right ? 1 : 0) }));
    setStreak((value) => (right ? value + 1 : 0));
    // 答对了停一下再出下一题，让人看清答案；答错就停在这儿，等手动「下一题」
    if (right) timer.current = window.setTimeout(() => next(), 750);
  };

  const start = () => {
    clearTimer();
    setSeed((Date.now() % 100000) + 1);
    setIndex(0);
    setStreak(0);
    setRun({ asked: 0, right: 0 });
    setAnswered(null);
    setPlaying(true);
  };

  const stop = () => {
    clearTimer();
    setPlaying(false);
    setAnswered(null);
  };

  /** 键盘 1–4 也能答 */
  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      const slot = Number(event.key);
      if (slot >= 1 && slot <= 4) {
        const option = question.options[slot - 1];
        if (option) {
          event.preventDefault();
          answer(option);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const rightRate = run.asked > 0 ? Math.round((run.right / run.asked) * 100) : 0;

  return (
    <div className="interval-block">
      <h3 className="stat-sub">音程表<span className="stat-sub-note">一个调里，往上数到第几度是哪个音</span></h3>
      <div className="interval-toolbar">
        <label>
          调
          <select value={tableKey} onChange={(event) => setTableKey(event.target.value)} aria-label="看哪个调的音程表">
            {INTERVAL_KEYS.map((id) => (
              <option key={id} value={id}>{KEY_BY_ID.get(id)?.name ?? id}</option>
            ))}
          </select>
        </label>
        <span className="muted">
          {table.root} 往上：{table.rows.map((row) => row.note).join(" · ")}
        </span>
      </div>

      <table className="interval-table">
        <thead>
          <tr>
            <th scope="col">度数</th>
            <th scope="col">音程</th>
            <th scope="col">半音</th>
            <th scope="col">{table.root} 往上</th>
            <th scope="col">唱名</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.degree}>
              <th scope="row">{row.degree === 8 ? "八度" : `${row.degree} 度`}</th>
              <td>{row.label}</td>
              <td className="interval-semi">{row.semitones}</td>
              <td><b>{row.note}</b></td>
              <td className="muted">{row.solfege}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="interval-quality">
        <summary>同一个度数还有别的说法（小 / 增 / 减）</summary>
        <ul>
          {qualities.map((row) => (
            <li key={row.degree}>
              <span className="muted">{row.degree === 8 ? "八度" : `${row.degree} 度`}</span>
              {row.items.map((item) => (
                <span key={item.short} className="interval-qchip">
                  {item.name} <em>{item.semitones}</em>
                </span>
              ))}
            </li>
          ))}
        </ul>
        <p className="muted">
          大调音阶里只会出现「大 / 纯」这几档；换成小调、布鲁斯，就会多出小六度、小七度这些。
        </p>
      </details>

      <h3 className="stat-sub">
        音程闯关
        <span className="stat-sub-note">随机根音 + 二度到八度，答对接着下一题，随时能停</span>
      </h3>

      {!playing ? (
        <div className="interval-start">
          <button type="button" className="btn primary" onClick={start} aria-label="开始音程闯关">
            开始闯关
          </button>
          <span className="muted">
            最长连对 {stats.best} · 一共答过 {stats.total} 题{stats.total > 0 ? `（对 ${Math.round((stats.right / stats.total) * 100)}%）` : ""}
          </span>
        </div>
      ) : (
        <div className="interval-quiz">
          <p className="interval-meta">
            <span>第 {run.asked + 1} 题</span>
            <span>连对 {streak}</span>
            <span>正确率 {rightRate}%</span>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => play([48 + (KEY_BY_ID.get(question.keyId)?.tonicPc ?? 0)])}
              aria-label="听一下根音"
            >
              听根音
            </button>
            <button type="button" className="btn-quiet interval-stop" onClick={stop} aria-label="停下这一轮">
              停一下
            </button>
          </p>

          <p className="interval-question">
            以 <b>{question.root}</b> 为根音，<b>{question.label}</b>是哪个音？
          </p>

          <div className="interval-options" role="group" aria-label="四个选项">
            {question.options.map((option, slot) => {
              const state =
                answered === null
                  ? ""
                  : option === question.answer
                    ? " right"
                    : option === answered
                      ? " wrong"
                      : " dim";
              return (
                <button
                  key={`${option}-${slot}`}
                  type="button"
                  className={`interval-option${state}`}
                  onClick={() => answer(option)}
                  disabled={answered !== null && option !== question.answer && option !== answered}
                  aria-label={`${slot + 1}. ${option}`}
                >
                  <i>{slot + 1}</i>
                  {option}
                </button>
              );
            })}
          </div>

          {answered !== null && (
            <p className={answered === question.answer ? "interval-feedback right" : "interval-feedback wrong"} role="status">
              {answered === question.answer ? "对了。" : `对了是 ${question.answer}。`}
              <span className="muted"> {intervalDrillAnswerText(question)}</span>
              {answered !== question.answer && (
                <button type="button" className="btn-quiet interval-next" onClick={next}>
                  下一题
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
