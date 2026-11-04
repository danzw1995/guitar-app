import { useMemo, useState } from "react";
import { SHARP_NAMES, cagedShapes, type CagedQuality, type CagedShape } from "@guitar/core";

export interface CagedBoardProps {
  /** 根音的音高类（0 = C）。 */
  rootPc: number;
  /** 根音拼写（如 `Bb`）；不传就用升号名。 */
  rootName?: string;
}

const LEFT = 34;
const CELL = 44;
const TOP = 22;
const ROW = 26;
const STRING_NAMES = ["E", "B", "G", "D", "A", "E"];

/**
 * CAGED 五把位：同一和弦在琴颈上的 5 种按法。
 *
 * 上方是「位置条」（每个形状从第几品开始），下方是选中形状的按法图。
 * 点位置条上的标记就切换形状。
 */
export default function CagedBoard({ rootPc, rootName }: CagedBoardProps) {
  const [quality, setQuality] = useState<CagedQuality>("major");
  const [selected, setSelected] = useState<CagedShape["id"]>("C");

  // 一次算出两种性质的形状：画布宽度取两者的最大值，
  // 这样切换「大三 / 小三」时 SVG 的宽高不变，页面不会跳一下。
  const majorShapes = useMemo(() => cagedShapes(rootPc, "major"), [rootPc]);
  const minorShapes = useMemo(() => cagedShapes(rootPc, "minor"), [rootPc]);
  const shapes = quality === "minor" ? minorShapes : majorShapes;
  const shape = shapes.find((s) => s.id === selected) ?? shapes[0];
  const maxFret = Math.max(
    12,
    ...majorShapes.map((s) => s.span[1]),
    ...minorShapes.map((s) => s.span[1]),
  );
  const width = LEFT + (maxFret + 1) * CELL + 16;
  const height = TOP + 5 * ROW + 30;
  const x = (fret: number) => LEFT + fret * CELL + CELL / 2;
  const wire = (fret: number) => LEFT + fret * CELL;
  const y = (string: number) => TOP + string * ROW;
  const base = rootName ?? SHARP_NAMES[rootPc];
  const chordLabel = `${base}${quality === "minor" ? "m" : ""}`;

  return (
    <div className="caged">
      <div className="caged-quality">
        {(["major", "minor"] as CagedQuality[]).map((value) => (
          <button
            key={value}
            type="button"
            className={value === quality ? "chip on" : "chip"}
            onClick={() => setQuality(value)}
          >
            {value === "major" ? "大三和弦" : "小三和弦"}
          </button>
        ))}
        <span className="lesson-cap">
          {quality === "minor"
            ? "小和弦只有 E / A / D 三个形状：C 形、G 形的大三音出现两次，降一个还是大三和弦（教材里 Cm、Gm 用的就是 A 形 / E 形的横按）。"
            : "五个形状：C、A、G、E、D，沿琴颈依次排开。"}
        </span>
      </div>

      <div className="caged-strip">
        {shapes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === shape.id ? "caged-tab on" : "caged-tab"}
            onClick={() => setSelected(item.id)}
          >
            <b>{item.id} 形</b>
            <i>第 {item.baseFret} 品</i>
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="caged-svg"
        role="img"
        aria-label={`${chordLabel} 和弦的 ${shape.name}，覆盖 ${shape.span[0]} 到 ${shape.span[1]} 品`}
      >
        {/* 形状覆盖区 */}
        <rect
          x={wire(shape.span[0])}
          y={y(0) - 11}
          width={(shape.span[1] - shape.span[0] + 1) * CELL}
          height={5 * ROW + 22}
          className="caged-range"
        />

        {Array.from({ length: maxFret + 2 }, (_, fret) => (
          <line
            key={`w${fret}`}
            x1={wire(fret)}
            y1={y(0) - 11}
            x2={wire(fret)}
            y2={y(5) + 11}
            className={fret === 0 ? "scale-map-nut" : "scale-map-wire"}
          />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line
            key={`s${s}`}
            x1={LEFT}
            y1={y(s)}
            x2={LEFT + (maxFret + 1) * CELL}
            y2={y(s)}
            className="scale-map-string"
            strokeWidth={s === 5 ? 2.4 : 1.2}
          />
        ))}
        {STRING_NAMES.map((name, s) => (
          <text key={`n${s}`} x={6} y={y(s) + 4} className="scale-map-string-name">
            {name}
          </text>
        ))}
        {Array.from({ length: maxFret + 1 }, (_, fret) => (
          <text key={`f${fret}`} x={x(fret)} y={height - 6} className="scale-map-fret">
            {fret}
          </text>
        ))}

        {/* 按法 */}
        {shape.frets.map((fret, s) => {
          if (fret < 0) {
            return (
              <text
                key={`x${s}`}
                x={LEFT - 14}
                y={y(s) + 4}
                textAnchor="middle"
                className="caged-mute"
              >
                ×
              </text>
            );
          }
          const isRoot = shape.rootStrings.includes(s);
          return (
            <g key={`d${s}`}>
              <circle
                cx={x(fret)}
                cy={y(s)}
                r={12}
                className={isRoot ? "caged-dot root" : "caged-dot"}
              />
              <text
                x={x(fret)}
                y={y(s) + 3.5}
                textAnchor="middle"
                className={isRoot ? "caged-label root" : "caged-label"}
              >
                {fret === 0 ? "0" : fret}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="lesson-cap">
        <b>{shape.name}</b>：覆盖 {shape.span[0]}–{shape.span[1]} 品
        {shape.shift === 0
          ? "，就是开放形状，空弦可以直接用"
          : `，第 ${shape.shift} 品是横按`}
        ；根音在 {shape.rootStrings.map((s) => `${6 - s} 弦`).join("、")}。金色是根音。
      </p>
    </div>
  );
}
