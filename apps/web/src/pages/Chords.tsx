import { useState } from "react";
import { CHORDS, CHORD_BY_NAME, chordInfo, fingeringOf } from "@guitar/core";
import ChordDiagram from "../components/ChordDiagram";

/** 指法数字的含义（1=食指 … 4=小指）。 */
const FINGER_LEGEND = "1 食指 · 2 中指 · 3 无名指 · 4 小指";

export default function Chords() {
  const [selected, setSelected] = useState("C");
  const chord = CHORD_BY_NAME.get(selected)!;
  const info = chordInfo(chord);
  const fingering = fingeringOf(chord);

  return (
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
          </div>
          <p className="chord-quality">
            {info.quality.name} · 根音 {info.rootName}
          </p>

          <ChordDiagram chord={chord} />

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
  );
}
