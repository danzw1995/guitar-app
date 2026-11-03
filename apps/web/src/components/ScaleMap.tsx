import { useMemo } from "react";
import {
  KEY_BY_ID,
  SCALE_BY_ID,
  SHARP_NAMES,
  STANDARD_TUNING,
  midiAt,
  pitchClassAt,
  scaleNames,
  scalePcs,
} from "@guitar/core";

export interface ScaleMapProps {
  keyId?: string;
  scaleId?: string;
  /** 画到第几品。 */
  frets?: number;
  /** 圆点里写音名（默认写级数，方便看「同列 +3 级」）。 */
  showNames?: boolean;
  /** 画主音的八度连线。 */
  showOctaves?: boolean;
  /** 高亮某一列（同品跨弦的示范）。 */
  highlightFret?: number;
}

const LEFT = 34;
const CELL = 44;
const TOP = 20;
const ROW = 26;
const STRING_NAMES = ["E", "B", "G", "D", "A", "E"];
/** 相邻弦空弦差几品（用于右侧标注）。 */
const GAPS = ["5 品", "5 品", "5 品", "4 品", "5 品"];

/**
 * 一张完整的音阶指板图，同时把三条规律画出来：
 *
 * - 纵向（同一列 = 同品）：往高音弦走级数 +3，只有 3→2 那格是 +2；
 * - 横向（同一行 = 同一根弦）：品距是 2 2 1 2 2 2 1；
 * - 斜向（八度）：同音的连线，低音侧 +2 品、高音侧 +3 品。
 */
export default function ScaleMap({
  keyId = "C",
  scaleId = "major",
  frets = 12,
  showNames = false,
  showOctaves = true,
  highlightFret,
}: ScaleMapProps) {
  const data = useMemo(() => {
    const key = KEY_BY_ID.get(keyId);
    const scale = SCALE_BY_ID.get(scaleId);
    if (!key || !scale) return null;
    const pcs = scalePcs(key, scale);
    const names = scaleNames(key, scale);
    const degreeByPc = new Map<number, string>();
    pcs.forEach((pc, index) => degreeByPc.set(pc, String(index + 1)));
    const nameByPc = new Map<number, string>();
    pcs.forEach((pc, index) => nameByPc.set(pc, names[index]));
    return { key, pcs, degreeByPc, nameByPc };
  }, [keyId, scaleId]);

  if (!data) return null;

  const width = LEFT + (frets + 1) * CELL + 46;
  const height = TOP + 5 * ROW + 30;
  const x = (fret: number) => LEFT + fret * CELL + CELL / 2;
  const wire = (fret: number) => LEFT + fret * CELL;
  const y = (string: number) => TOP + string * ROW;

  /** 主音的八度连线：相同 MIDI 相差 12 的相邻位置。 */
  const octaveLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (showOctaves) {
    const root = data.key.tonicPc;
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= frets; f++) {
        if (pitchClassAt(STANDARD_TUNING, s, f) !== root) continue;
        const midi = midiAt(STANDARD_TUNING, s, f);
        // 往高音弦找同一个音高、或高八度的最近一个
        for (let s2 = s + 1; s2 < 6; s2++) {
          for (let f2 = 0; f2 <= frets; f2++) {
            if (pitchClassAt(STANDARD_TUNING, s2, f2) !== root) continue;
            const midi2 = midiAt(STANDARD_TUNING, s2, f2);
            if (midi2 === midi || midi2 === midi + 12) {
              octaveLines.push({ x1: x(f), y1: y(s), x2: x(f2), y2: y(s2) });
            }
          }
        }
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="scale-map"
      role="img"
      aria-label={`${keyId} ${SCALE_BY_ID.get(scaleId)?.name ?? scaleId} 的指板图，含级数与八度连线`}
    >
      {/* 高亮列 */}
      {highlightFret !== undefined && highlightFret >= 0 && highlightFret <= frets ? (
        <rect
          x={wire(highlightFret)}
          y={TOP - 10}
          width={CELL}
          height={5 * ROW + 20}
          className="scale-map-col"
        />
      ) : null}

      {/* 品丝 */}
      {Array.from({ length: frets + 2 }, (_, fret) => (
        <line
          key={`w${fret}`}
          x1={wire(fret)}
          y1={y(0) - 10}
          x2={wire(fret)}
          y2={y(5) + 10}
          className={fret === 0 ? "scale-map-nut" : "scale-map-wire"}
        />
      ))}

      {/* 弦 */}
      {Array.from({ length: 6 }, (_, s) => (
        <line
          key={`s${s}`}
          x1={LEFT}
          y1={y(s)}
          x2={LEFT + (frets + 1) * CELL}
          y2={y(s)}
          className="scale-map-string"
          strokeWidth={s === 5 ? 2.4 : 1.2}
        />
      ))}

      {/* 弦名 + 相邻弦差几品 */}
      {STRING_NAMES.map((name, s) => (
        <text key={`n${s}`} x={6} y={y(s) + 4} className="scale-map-string-name">
          {name}
        </text>
      ))}
      {GAPS.map((gap, index) => (
        <text
          key={`g${index}`}
          x={LEFT + (frets + 1) * CELL + 8}
          y={(y(index) + y(index + 1)) / 2 + 4}
          className="scale-map-gap"
        >
          {gap}
        </text>
      ))}

      {/* 品位数字 */}
      {Array.from({ length: frets + 1 }, (_, fret) => (
        <text key={`f${fret}`} x={x(fret)} y={height - 6} className="scale-map-fret">
          {fret}
        </text>
      ))}

      {/* 八度连线（画在圆点下面） */}
      {octaveLines.map((line, index) => (
        <line
          key={`o${index}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className="scale-map-octave"
        />
      ))}

      {/* 音点 */}
      {Array.from({ length: 6 }, (_, s) =>
        Array.from({ length: frets + 1 }, (_, f) => {
          const pc = pitchClassAt(STANDARD_TUNING, s, f);
          const degree = data.degreeByPc.get(pc);
          if (!degree) return null;
          const isRoot = pc === data.key.tonicPc;
          return (
            <g key={`d${s}-${f}`}>
              <circle
                cx={x(f)}
                cy={y(s)}
                r={11}
                className={isRoot ? "scale-map-dot root" : "scale-map-dot"}
              />
              <text
                x={x(f)}
                y={y(s) + 3.5}
                textAnchor="middle"
                className={isRoot ? "scale-map-label root" : "scale-map-label"}
              >
                {showNames ? data.nameByPc.get(pc) : degree}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
