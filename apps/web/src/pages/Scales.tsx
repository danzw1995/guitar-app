import { useMemo, useState } from "react";
import {
  KEYS,
  SCALES,
  SHARP_NAMES,
  STANDARD_TUNING,
  KEY_BY_ID,
  SCALE_BY_ID,
  pitchClassAt,
  scaleNames,
  scalePcs,
  solfegeTable,
} from "@guitar/core";
import Fretboard from "../components/Fretboard";
import LabelControls from "../components/LabelControls";
import { cellLabel } from "../lib/labels";
import { loadSettings, saveSettings, type Settings } from "../lib/storage";

export default function Scales() {
  const [keyId, setKeyId] = useState("C");
  const [scaleId, setScaleId] = useState("major");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const key = KEY_BY_ID.get(keyId)!;
  const scale = SCALE_BY_ID.get(scaleId)!;

  const { byPc, rootName } = useMemo(() => {
    const names = scaleNames(key, scale);
    const pcs = scalePcs(key, scale);
    const map = new Map<number, string>();
    pcs.forEach((pc, i) => map.set(pc, names[i]));
    return { byPc: map, rootName: names[0] };
  }, [keyId, scaleId]);

  function updateSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  const nameAt = (s: number, f: number) => byPc.get(pitchClassAt(STANDARD_TUNING, s, f));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>音阶指板</h2>
        <p>标准调弦，0–12 品。金色是主音，蓝色是音阶音。</p>
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
        <LabelControls settings={settings} onChange={updateSettings} />
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
          const name = nameAt(s, f);
          if (!name) return "";
          return cellLabel(name, pitchClassAt(STANDARD_TUNING, s, f), key.tonicPc, settings).main;
        }}
        renderCellSub={(s, f) => {
          const name = nameAt(s, f);
          if (!name) return null;
          return cellLabel(name, pitchClassAt(STANDARD_TUNING, s, f), key.tonicPc, settings).sub;
        }}
        cellClass={(s, f) => {
          const name = nameAt(s, f);
          if (!name) return "off";
          return pitchClassAt(STANDARD_TUNING, s, f) === key.tonicPc ? "root" : "scale";
        }}
      />

      {settings.labels !== "name" && (
        <div className="solfege-strip">
          <span className="muted">
            唱名对照 · {settings.solfegeSystem === "movable" ? "首调" : "固定"} ·
            {settings.solfegeStyle === "number" ? " 数字" : " do re mi"}
          </span>
          {solfegeTable(
            { system: settings.solfegeSystem, style: settings.solfegeStyle },
            key.tonicPc,
          ).map((label, pc) => (
            <span key={pc} className={byPc.has(pc) ? "solfege-cell on" : "solfege-cell"}>
              <b>{SHARP_NAMES[pc]}</b>
              {label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
