import { useState } from "react";
import { CHORDS, CHORD_BY_NAME } from "@guitar/core";
import ChordDiagram from "../components/ChordDiagram";

export default function Chords() {
  const [selected, setSelected] = useState("C");
  const chord = CHORD_BY_NAME.get(selected)!;

  const fingering = chord.frets.map((f) => (f < 0 ? "x" : String(f))).join("");

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>常用和弦</h2>
        <p>点一个和弦看指法。数字从低音 E 到高音 e，x 表示不弹。</p>
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
          <ChordDiagram chord={chord} />
          <p className="muted">
            {chord.barre ? `横按 ${chord.barre} 品 · ` : ""}
            {chord.fingers ? "圆点内数字为建议指法" : "左手指法"}
          </p>
        </div>
      </div>
    </section>
  );
}
