import { useMemo, useState } from "react";
import {
  CHORD_QUALITIES,
  CIRCLE,
  FLAT_NAMES,
  INTERVALS,
  SHARP_NAMES,
  circleKey,
  frequencyOf,
  intervalOf,
  intervalQuestion,
  neighborKeys,
  spellInterval,
  stackThirds,
  thirdQuestion,
  circleQuestion,
  twelveToneTable,
  type ChordQuality,
  type TheoryQuestion,
} from "@guitar/core";
import TheoryQuiz from "../components/TheoryQuiz";

type QuizKind = "interval" | "third" | "circle" | null;

const TONICS = Array.from({ length: 12 }, (_, pc) => ({
  pc,
  name: SHARP_NAMES[pc],
  flat: FLAT_NAMES[pc],
}));

const QUALITY_ORDER: ChordQuality[] = ["major", "minor", "dominant7", "major7", "minor7"];

/** 乐理页：12 平均律 / 音程 / 三度叠置 / 五度圈，每节都能「练一练」。 */
export default function Theory() {
  const [tonic, setTonic] = useState(0);
  const [root, setRoot] = useState("C");
  const [semitones, setSemitones] = useState(4);
  const [quality, setQuality] = useState<ChordQuality>("major");
  const [circleId, setCircleId] = useState("C");
  const [quiz, setQuiz] = useState<QuizKind>(null);

  const tuning = useMemo(() => twelveToneTable(tonic), [tonic]);
  const interval = intervalOf(semitones);
  const spelled = useMemo(() => {
    try {
      return spellInterval(root, semitones);
    } catch {
      return "?";
    }
  }, [root, semitones]);
  const stack = useMemo(
    () => stackThirds(root, CHORD_QUALITIES[quality].intervals),
    [root, quality],
  );
  const circle = circleKey(circleId);
  const neighbors = neighborKeys(circleId);

  const quizConfig: Record<Exclude<QuizKind, null>, { title: string; make: (rng: () => number) => TheoryQuestion }> = {
    interval: { title: "音程练习", make: intervalQuestion },
    third: { title: "三度叠置练习", make: thirdQuestion },
    circle: { title: "五度圈练习", make: circleQuestion },
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>乐理</h2>
        <p>12 平均律、音程、三度叠置、五度圈——都是纯计算，点一下就能看到关系。</p>
      </div>

      {/* ---------- 12 平均律 ---------- */}
      <div className="theory-block">
        <div className="theory-head">
          <h3>12 平均律</h3>
          <div className="theory-tools">
            <label className="theory-field">
              主音
              <select value={tonic} onChange={(e) => setTonic(Number(e.target.value))}>
                {TONICS.map((t) => (
                  <option key={t.pc} value={t.pc}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="theory-lead">
          一个八度切成 12 个等宽半音，每半音 100 音分；频率按 2 的 12 次方根递增。
        </p>
        <div className="theory-scroll">
          <table className="theory-table">
            <thead>
              <tr>
                <th>半音</th>
                <th>音名</th>
                <th>级数</th>
                <th>音分</th>
                <th>频率比</th>
                <th>频率</th>
              </tr>
            </thead>
            <tbody>
              {tuning.map((step) => (
                <tr key={step.semitones}>
                  <td>{step.semitones}</td>
                  <td>
                    {step.sharpName}
                    {step.sharpName !== step.flatName ? ` / ${step.flatName}` : ""}
                  </td>
                  <td>{step.degree}</td>
                  <td>{step.cents}</td>
                  <td>{step.ratio.toFixed(4)}</td>
                  <td>{frequencyOf(60 + tonic + step.semitones).toFixed(2)} Hz</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- 音程 ---------- */}
      <div className="theory-block">
        <div className="theory-head">
          <h3>音程</h3>
          <div className="theory-tools">
            <label className="theory-field">
              根音
              <select value={root} onChange={(e) => setRoot(e.target.value)}>
                {TONICS.map((t) => (
                  <option key={t.pc} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="theory-field">
              音程
              <select value={semitones} onChange={(e) => setSemitones(Number(e.target.value))}>
                {INTERVALS.slice(1, 13).map((i) => (
                  <option key={i.semitones} value={i.semitones}>
                    {i.name}（{i.short}）
                  </option>
                ))}
              </select>
            </label>
            <button className="btn ghost" type="button" onClick={() => setQuiz("interval")}>
              练一练
            </button>
          </div>
        </div>
        <p className="theory-result">
          <b>{root}</b> 上行 <b>{semitones}</b> 个半音 = <b>{spelled}</b>，是
          <b> {interval.name}</b>（{interval.short}），{interval.cents} 音分、
          <span className={interval.consonance === "dissonant" ? "theory-bad" : "theory-good"}>
            {interval.consonance === "perfect"
              ? "完全协和"
              : interval.consonance === "imperfect"
                ? "不完全协和"
                : "不协和"}
          </span>
          。
        </p>
        <div className="theory-scroll">
          <table className="theory-table">
            <thead>
              <tr>
                <th>音程</th>
                <th>缩写</th>
                <th>半音</th>
                <th>音分</th>
                <th>协和度</th>
              </tr>
            </thead>
            <tbody>
              {INTERVALS.slice(1, 13).map((i) => (
                <tr key={i.semitones} className={i.semitones === semitones ? "theory-row-on" : ""}>
                  <td>{i.name}</td>
                  <td>{i.short}</td>
                  <td>{i.semitones}</td>
                  <td>{i.cents}</td>
                  <td>
                    {i.consonance === "perfect"
                      ? "完全协和"
                      : i.consonance === "imperfect"
                        ? "不完全协和"
                        : "不协和"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- 三度叠置 ---------- */}
      <div className="theory-block">
        <div className="theory-head">
          <h3>三度叠置</h3>
          <div className="theory-tools">
            <label className="theory-field">
              根音
              <select value={root} onChange={(e) => setRoot(e.target.value)}>
                {TONICS.map((t) => (
                  <option key={t.pc} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="theory-field">
              和弦
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as ChordQuality)}
              >
                {QUALITY_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {CHORD_QUALITIES[id].name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn ghost" type="button" onClick={() => setQuiz("third")}>
              练一练
            </button>
          </div>
        </div>
        <p className="theory-lead">
          和弦不是「同时按几个音」这么简单：它是**三度一层层叠上去**的。
        </p>
        <div className="theory-chips">
          {stack.notes.map((note, index) => (
            <span key={`${note}-${index}`} className={index === 0 ? "theory-chip root" : "theory-chip"}>
              {note}
              <i>{CHORD_QUALITIES[quality].degrees[index]}</i>
            </span>
          ))}
        </div>
        <div className="theory-chain">
          {stack.steps.map((step, index) => (
            <span key={`${step.from}-${step.to}`} className="theory-step">
              {index === 0 ? <b>{step.from}</b> : null}
              <i>{step.name}</i>
              <b>{step.to}</b>
            </span>
          ))}
        </div>
        <p className="theory-result">
          {root} {CHORD_QUALITIES[quality].name} = {stack.text}（{stack.notes.join(" – ")}）
        </p>
      </div>

      {/* ---------- 五度圈 ---------- */}
      <div className="theory-block">
        <div className="theory-head">
          <h3>五度圈</h3>
          <div className="theory-tools">
            <button className="btn ghost" type="button" onClick={() => setQuiz("circle")}>
              练一练
            </button>
          </div>
        </div>
        <p className="theory-lead">顺时针每走一格加一个升号，一圈 12 个调正好转完。</p>
        <div className="circle-wrap">
          <svg viewBox="0 0 260 260" className="circle-svg" role="img" aria-label="五度圈">
            <circle cx="130" cy="130" r="92" fill="none" stroke="currentColor" opacity="0.15" />
            {CIRCLE.map((key) => {
              const angle = ((key.position * 30 - 90) * Math.PI) / 180;
              const x = 130 + 92 * Math.cos(angle);
              const y = 130 + 92 * Math.sin(angle);
              const active = key.id === circleId;
              return (
                <g
                  key={key.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${key.name}，${key.accidentalsLabel}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setCircleId(key.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCircleId(key.id);
                    }
                  }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={active ? 17 : 15}
                    className={active ? "circle-node active" : "circle-node"}
                  />
                  <text x={x} y={y + 4} textAnchor="middle" className="circle-label">
                    {key.id}
                  </text>
                </g>
              );
            })}
            <text x="130" y="126" textAnchor="middle" className="circle-center-main">
              {circle?.id}
            </text>
            <text x="130" y="146" textAnchor="middle" className="circle-center-sub">
              {circle?.accidentalsLabel}
            </text>
          </svg>

          {circle && (
            <div className="circle-detail">
              <p>
                <b>{circle.name}</b> · {circle.accidentalsLabel}
              </p>
              <p className="muted">关系小调：{circle.minorName}</p>
              <p className="muted">音阶：{circle.scale.join(" ")}</p>
              {neighbors && (
                <p className="muted">
                  上行纯五度：{neighbors.up.name} · 下行：{neighbors.down.name}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {quiz && (
        <TheoryQuiz
          title={quizConfig[quiz].title}
          make={quizConfig[quiz].make}
          onClose={() => setQuiz(null)}
        />
      )}
    </section>
  );
}
