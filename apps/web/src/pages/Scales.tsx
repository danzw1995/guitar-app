import { useMemo, useState } from "react";
import {
  KEYS,
  SCALES,
  SHARP_NAMES,
  STANDARD_TUNING,
  KEY_BY_ID,
  SCALE_BY_ID,
  fallbackName,
  midiAt,
  pitchClassAt,
  scaleNames,
  scalePcs,
  solfegeAlternatives,
} from "@guitar/core";
import Fretboard from "../components/Fretboard";
import LabelControls from "../components/LabelControls";
import { cellLabel, octaveShiftFor } from "../lib/labels";
import { loadSettings, saveSettings, type Settings } from "../lib/storage";

export default function Scales() {
  const [keyId, setKeyId] = useState("C");
  const [scaleId, setScaleId] = useState("major");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  /** 打开后把调外音也画出来（暗一点），这样 C 大调里也能看到 升1 / 降3 这类唱名。 */
  const [showChromatic, setShowChromatic] = useState(false);

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

  /** 0 品是空弦区，只靠左侧的弦名就够了，不画音点。 */
  const cellNote = (s: number, f: number): { name: string; state: string; pc: number } | null => {
    if (f === 0) return null;
    const pc = pitchClassAt(STANDARD_TUNING, s, f);
    const scaleName = byPc.get(pc);
    if (scaleName) {
      return { name: scaleName, state: pc === key.tonicPc ? "root" : "scale", pc };
    }
    if (!showChromatic) return null;
    return { name: fallbackName(pc), state: "chromatic", pc };
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>音阶指板</h2>
        <p>标准调弦，1–12 品。金色是主音，蓝色是音阶音。</p>
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
        <label className="check">
          <input
            type="checkbox"
            checked={showChromatic}
            onChange={(e) => setShowChromatic(e.target.checked)}
          />
          显示调外音（带升降）
        </label>
      </div>

      <div className="legend">
        <span><i className="dot root" /> 主音 {rootName}</span>
        <span><i className="dot scale" /> 音阶音</span>
        {showChromatic && <span><i className="dot muted" /> 调外音</span>}
      </div>

      <Fretboard
        fretMin={1}
        fretMax={12}
        renderCell={(s, f) => {
          const note = cellNote(s, f);
          if (!note) return "";
          return cellLabel(note.name, note.pc, key.tonicPc, settings).main;
        }}
        renderCellSub={(s, f) => {
          const note = cellNote(s, f);
          if (!note) return null;
          return cellLabel(note.name, note.pc, key.tonicPc, settings).sub;
        }}
        cellClass={(s, f) => cellNote(s, f)?.state ?? "off"}
        octaveShift={(s, f) =>
          octaveShiftFor(midiAt(STANDARD_TUNING, s, f), key.tonicPc, settings)
        }
      />

      {settings.labels !== "name" && (
        <div className="solfege-strip">
          <span className="muted">
            唱名对照 · {settings.solfegeSystem === "movable" ? "首调" : "固定"} ·
            {settings.solfegeStyle === "number" ? " 数字" : " do re mi"}
          </span>
          {Array.from({ length: 12 }, (_, pc) => {
            const { primary, alternate } = solfegeAlternatives(pc, key.tonicPc, {
              system: settings.solfegeSystem,
              style: settings.solfegeStyle,
            });
            return (
              <span key={pc} className={byPc.has(pc) ? "solfege-cell on" : "solfege-cell"}>
                <b>{SHARP_NAMES[pc]}</b>
                {alternate ? `${primary} / ${alternate}` : primary}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
