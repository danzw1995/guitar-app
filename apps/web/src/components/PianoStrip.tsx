import { SHARP_NAMES } from "@guitar/core";

export interface PianoStripProps {
  /** 要高亮的音高类（0–11）。 */
  highlight?: number[];
  /** 主音：用强调色区分。 */
  root?: number;
  /** 是否在键上写音名。 */
  labels?: boolean;
  /** 相邻高亮音之间标注「全 / 半」。 */
  showSteps?: boolean;
  /** 点击某个键。 */
  onPick?: (pc: number) => void;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = [1, 3, 6, 8, 10];
/** 黑键挂在哪个白键的右边界上。 */
const BLACK_OFFSET: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

const WHITE_W = 44;
const WHITE_H = 130;
const BLACK_W = 26;
const BLACK_H = 82;

/**
 * 钢琴键盘：一个八度 7 个白键 + 5 个黑键。
 *
 * 为什么用钢琴讲半音/全音：白键之间**本来就不等距**——E–F、B–C 中间没有黑键，
 * 所以它们天生是半音；其余白键之间夹着黑键，是大二度。这比背定义直观。
 */
export default function PianoStrip({
  highlight = [],
  root,
  labels = true,
  showSteps = false,
  onPick,
}: PianoStripProps) {
  const lit = new Set(highlight);
  const width = WHITE_PCS.length * WHITE_W;

  /** 相邻两个高亮音之间的半音数 → 「全 / 半」。 */
  const steps: { x: number; label: string }[] = [];
  if (showSteps && highlight.length > 1) {
    const sorted = [...new Set(highlight)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1] - sorted[i];
      const a = keyCenterX(sorted[i]);
      const b = keyCenterX(sorted[i + 1]);
      steps.push({ x: (a + b) / 2, label: gap === 2 ? "全" : gap === 1 ? "半" : "3" });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${WHITE_H + 26}`}
      className="piano"
      role="img"
      aria-label="一个八度的钢琴键盘"
    >
      {WHITE_PCS.map((pc, index) => {
        const active = lit.has(pc);
        const isRoot = pc === root;
        return (
          <g
            key={pc}
            onClick={onPick ? () => onPick(pc) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <rect
              x={index * WHITE_W}
              y={0}
              width={WHITE_W - 1}
              height={WHITE_H}
              rx={4}
              className={
                isRoot ? "piano-white root" : active ? "piano-white on" : "piano-white"
              }
            />
            {labels && (
              <text
                x={index * WHITE_W + (WHITE_W - 1) / 2}
                y={WHITE_H - 10}
                textAnchor="middle"
                className="piano-label"
              >
                {SHARP_NAMES[pc]}
              </text>
            )}
          </g>
        );
      })}

      {BLACK_PCS.map((pc) => {
        const active = lit.has(pc);
        const isRoot = pc === root;
        const left = BLACK_OFFSET[pc] * WHITE_W + WHITE_W - BLACK_W / 2 - 1;
        return (
          <g
            key={pc}
            onClick={onPick ? () => onPick(pc) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <rect
              x={left}
              y={0}
              width={BLACK_W}
              height={BLACK_H}
              rx={3}
              className={
                isRoot ? "piano-black root" : active ? "piano-black on" : "piano-black"
              }
            />
            {labels && active && (
              <text
                x={left + BLACK_W / 2}
                y={BLACK_H - 8}
                textAnchor="middle"
                className="piano-label black"
              >
                {SHARP_NAMES[pc]}
              </text>
            )}
          </g>
        );
      })}

      {steps.map((step, index) => (
        <text
          key={index}
          x={step.x}
          y={WHITE_H + 18}
          textAnchor="middle"
          className="piano-step"
        >
          {step.label}
        </text>
      ))}
    </svg>
  );
}

/** 白键中心 x（同一八度内）。 */
function keyCenterX(pc: number): number {
  const index = WHITE_PCS.indexOf(pc);
  if (index >= 0) return index * WHITE_W + (WHITE_W - 1) / 2;
  const offset = BLACK_OFFSET[pc] ?? 0;
  return offset * WHITE_W + WHITE_W;
}
