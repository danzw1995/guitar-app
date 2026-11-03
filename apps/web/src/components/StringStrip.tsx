import { SHARP_NAMES, STANDARD_TUNING, pitchClassAt } from "@guitar/core";

export interface StringStripProps {
  /** 弦号：0 = 1 弦（高音 E），5 = 6 弦（低音 E）。 */
  stringIndex?: number;
  /** 画到第几品，默认 12。 */
  frets?: number;
  /** 要高亮的音高类。 */
  highlight?: number[];
  /** 主音：挑出来用强调色。 */
  root?: number;
  /** 相邻高亮音之间标「全 / 半」。 */
  showSteps?: boolean;
  /** 点击某一品。 */
  onPick?: (fret: number) => void;
}

const STRING_NAMES = ["1 弦 E", "2 弦 B", "3 弦 G", "4 弦 D", "5 弦 A", "6 弦 E"];
const CELL_W = 44;
const HEIGHT = 64;
const DOT_R = 13;
const LEFT = 54;

/**
 * 一根弦的 0–12 品。
 *
 * 用途：把「12 个半音」翻译成「12 个品」——钢琴上的一格黑键/白键，
 * 在吉他上就是往右一品。这是乐理落到琴上的最短路径。
 */
export default function StringStrip({
  stringIndex = 4,
  frets = 12,
  highlight = [],
  root,
  showSteps = false,
  onPick,
}: StringStripProps) {
  const lit = new Set(highlight);
  const width = LEFT + (frets + 1) * CELL_W;
  const axisY = HEIGHT / 2;
  const x = (fret: number) => LEFT + fret * CELL_W + CELL_W / 2;
  const wire = (fret: number) => LEFT + fret * CELL_W;

  const pcs = Array.from({ length: frets + 1 }, (_, fret) =>
    pitchClassAt(STANDARD_TUNING, stringIndex, fret),
  );

  const steps: { x: number; label: string }[] = [];
  if (showSteps) {
    const highlighted = Array.from({ length: frets + 1 }, (_, fret) => fret).filter((fret) =>
      lit.has(pcs[fret]),
    );
    for (let i = 0; i < highlighted.length - 1; i++) {
      const gap = highlighted[i + 1] - highlighted[i];
      if (gap > 4) continue; // 跨八度的间隔不标
      steps.push({
        x: (x(highlighted[i]) + x(highlighted[i + 1])) / 2,
        label: gap === 2 ? "全" : gap === 1 ? "半" : String(gap),
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT + 6}`}
      className="string-strip"
      role="img"
      aria-label={`${STRING_NAMES[stringIndex]} 的 0 到 ${frets} 品`}
    >
      <text x={4} y={axisY + 4} className="string-strip-name">
        {STRING_NAMES[stringIndex]}
      </text>

      {/* 琴弦 */}
      <line
        x1={LEFT}
        y1={axisY}
        x2={LEFT + (frets + 1) * CELL_W}
        y2={axisY}
        className="string-strip-line"
      />

      {/* 品丝：0 是琴枕，画粗一点 */}
      {Array.from({ length: frets + 2 }, (_, fret) => (
        <line
          key={fret}
          x1={wire(fret)}
          y1={axisY - 16}
          x2={wire(fret)}
          y2={axisY + 16}
          className={fret === 0 ? "string-strip-nut" : "string-strip-wire"}
        />
      ))}

      {/* 每一格的音 */}
      {Array.from({ length: frets + 1 }, (_, fret) => {
        const pc = pcs[fret];
        const active = lit.has(pc);
        const isRoot = pc === root;
        return (
          <g
            key={fret}
            onClick={onPick ? () => onPick(fret) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <circle
              cx={x(fret)}
              cy={axisY}
              r={DOT_R}
              className={
                isRoot ? "ss-dot root" : active ? "ss-dot on" : "ss-dot"
              }
            />
            <text x={x(fret)} y={axisY + 4} textAnchor="middle" className="ss-label">
              {SHARP_NAMES[pc]}
            </text>
            <text x={x(fret)} y={HEIGHT - 2} textAnchor="middle" className="ss-fret">
              {fret}
            </text>
          </g>
        );
      })}

      {steps.map((step, index) => (
        <text key={index} x={step.x} y={axisY - 22} textAnchor="middle" className="piano-step">
          {step.label}
        </text>
      ))}
    </svg>
  );
}
