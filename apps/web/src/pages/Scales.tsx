import { useMemo, useState } from "react";
import {
  KEYS,
  SCALES,
  STANDARD_TUNING,
  KEY_BY_ID,
  SCALE_BY_ID,
  pitchClassAt,
  scaleNames,
  scalePcs,
} from "@guitar/core";
import Fretboard from "../components/Fretboard";

export default function Scales() {
  const [keyId, setKeyId] = useState("C");
  const [scaleId, setScaleId] = useState("major");
  const [showNames, setShowNames] = useState(true);

  const key = KEY_BY_ID.get(keyId)!;
  const scale = SCALE_BY_ID.get(scaleId)!;

  const { byPc, rootName } = useMemo(() => {
    const names = scaleNames(key, scale);
    const pcs = scalePcs(key, scale);
    const map = new Map<number, string>();
    pcs.forEach((pc, i) => map.set(pc, names[i]));
    return { byPc: map, rootName: names[0] };
  }, [keyId, scaleId]);

  const isScale = (s: number, f: number) => byPc.has(pitchClassAt(STANDARD_TUNING, s, f));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>音阶指板</h2>
        <p>标准调弦，0–12 品。红色是主音，蓝色是音阶音。</p>
      </div>

      <div className="toolbar">
        <label>
          调
          <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
            {KEYS.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </label>
        <label>
          音阶
          <select value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
          显示音名
        </label>
      </div>

      <div className="legend">
        <span><i className="dot root" /> 主音 {rootName}</span>
        <span><i className="dot scale" /> 音阶音</span>
        <span><i className="dot muted" /> 非音阶</span>
      </div>

      <Fretboard
        fretMin={0}
        fretMax={12}
        renderCell={(s, f) => {
          const pc = pitchClassAt(STANDARD_TUNING, s, f);
          if (!byPc.has(pc)) return "";
          return showNames ? byPc.get(pc) : "";
        }}
        cellClass={(s, f) => {
          const pc = pitchClassAt(STANDARD_TUNING, s, f);
          if (!byPc.has(pc)) return "off";
          return pc === key.tonicPc ? "root" : "scale";
        }}
      />
    </section>
  );
}
