import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHORDS,
  CHORD_BY_NAME,
  KEYS,
  chordDegreeInKey,
  chordInfo,
  fingeringOf,
  stackThirds,
} from "@guitar/core";
import ChordDiagram from "../components/ChordDiagram";
import ChordDrill from "../components/ChordDrill";
import { arpeggioPattern, useTone } from "../hooks/useTone";

/** 指法数字的含义（1=食指 … 4=小指）。 */
const FINGER_LEGEND = "1 食指 · 2 中指 · 3 无名指 · 4 小指";

/** 只有大调才用来算级数（小调的关系大调与它共用一套音）。 */
const MAJOR_KEYS = KEYS.filter((key) => key.mode === "major");

export default function Chords() {
  const [selected, setSelected] = useState("C");
  const [keyId, setKeyId] = useState("C");
  const chord = CHORD_BY_NAME.get(selected)!;
  const info = chordInfo(chord);
  const fingering = fingeringOf(chord);
  const stack = stackThirds(info.rootName, info.quality.intervals);
  const degree = useMemo(() => chordDegreeInKey(keyId, chord.name), [keyId, chord.name]);
  const { strum, arpeggio } = useTone();
  /** 试听时正在响的弦（1–6），在指法图上点亮。 */
  const [lit, setLit] = useState<number[]>([]);
  const flashes = useRef<number[]>([]);

  function light(stringNumber: number) {
    setLit((prev) => (prev.includes(stringNumber) ? prev : [...prev, stringNumber]));
    const id = window.setTimeout(() => {
      setLit((prev) => prev.filter((item) => item !== stringNumber));
    }, 260);
    flashes.current.push(id);
  }

  useEffect(
    () => () => {
      for (const id of flashes.current) window.clearTimeout(id);
    },
    [],
  );

  return (
    <>
      <section className="panel">
      <div className="panel-head">
        <h2>常用和弦</h2>
        <p>
          点一个和弦看指法。六位数字从 6 弦（低音 E）到 1 弦（高音 E）：<code>x</code> 表示不弹，
          <code>0</code> 表示空弦。
        </p>
      </div>

      <div className="chord-layout">
        <div className="chord-grid">
          {CHORDS.map((c) => (
            <button
              key={c.name}
              className={c.name === selected ? "chord-tile active" : "chord-tile"}
              onClick={() => setSelected(c.name)}
            >
              <span className="chord-tile-name">{c.name}</span>
              <span className="chord-tile-tag">{c.level === "beginner" ? "入门" : "进阶"}</span>
            </button>
          ))}
        </div>

        <div className="chord-detail">
          <div className="chord-detail-head">
            <h3>{chord.name}</h3>
            <code>{fingering}</code>
            <div className="chord-audition">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${chord.name} 的扫弦`}
                onClick={() =>
                  strum(chord.frets, {
                    onNote: light,
                  })
                }
              >
                扫弦
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${chord.name} 的分解和弦`}
                onClick={() =>
                  arpeggio(chord.frets, arpeggioPattern(chord.frets), {
                    onNote: light,
                  })
                }
              >
                分解
              </button>
            </div>
          </div>
          <p className="chord-quality">
            {info.quality.name} · 根音 {info.rootName}
          </p>

          <div className="chord-degree">
            <label className="theory-field">
              在
              <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                {MAJOR_KEYS.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name}
                  </option>
                ))}
              </select>
              里是
            </label>
            {degree ? (
              <span className={degree.matches ? "degree-badge" : "degree-badge off"}>
                <b>{degree.roman}</b>
                <i>{degree.role}</i>
              </span>
            ) : (
              <span className="degree-badge off">
                <b>调外</b>
                <i>这个调的音阶里没有 {info.rootName}</i>
              </span>
            )}
            {degree && !degree.matches ? (
              <span className="degree-warn">
                （该级数通常应是{degree.expectedQuality === "major" ? "大三和弦" : degree.expectedQuality === "minor" ? "小三和弦" : "减三和弦"}）
              </span>
            ) : null}
          </div>

          <ChordDiagram chord={chord} active={lit} />

          <div className="chord-tones">
            {info.tones.map((tone) => (
              <span key={tone.degree} className="tone-chip">
                <b>{tone.name}</b>
                <i>{tone.degree}</i>
              </span>
            ))}
          </div>
          <p className="chord-explain">
            {chord.name} 是{info.quality.name}，由 {info.tones.map((t) => t.name).join(" ")} 组成
            （{info.tones.map((t) => t.degree).join(" ")}）。图上标记的每个音都来自这几个音。
          </p>
          <p className="chord-explain">
            三度叠置：{info.rootName} <b>{stack.text}</b> → {stack.notes.join(" – ")}。
            <span className="muted">（为什么是三度？见「乐理」页）</span>
          </p>

          <p className="hint chord-hint">
            圆点里的数字是建议指法：{FINGER_LEGEND}。
            <br />
            弦上方的 <b>○</b> 是空弦，发音且属于构成音；<b>×</b> 是这根弦不弹——通常因为它不是构成音，
            少数是为了按法方便（例如 D 和弦的 5 弦 A 虽是构成音也常省略）。
            {chord.barre ? ` 这个和弦需要横按 ${chord.barre} 品。` : ""}
          </p>
        </div>
      </div>
      </section>

      <ChordDrill />
    </>
  );
}
