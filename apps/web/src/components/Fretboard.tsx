import type { ReactNode } from "react";

/** 简谱的八度记号：上点/下点，最多画三个。绝对定位，不参与文字排版。 */
function OctaveDots({ n, dir }: { n: number; dir: "up" | "down" }) {
  const count = Math.min(3, Math.abs(n));
  return (
    <span className={`fb-oct ${dir}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** 指板的几何常量；SVG 背景与按钮网格共用，保证像素级对齐。 */
export const FRET_W = 54;
export const STRING_H = 40;
export const LABEL_W = 36;
export const TOP_H = 26;
export const DOT = 36;

/** 1 弦（高音）在上；统一大写，靠位置区分 6 弦的低音 E。 */
const STRING_LABELS = ["E", "B", "G", "D", "A", "E"];
/** 低音弦画粗一点，视觉上像真琴。 */
const STRING_WIDTH = [1.2, 1.5, 1.9, 2.3, 2.7, 3.2];
/** 品位记号：3/5/7/9 单点，12 双点。 */
const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17];

export interface FretboardProps {
  fretMin: number;
  fretMax: number;
  renderCell: (s: number, f: number) => ReactNode;
  /** 副标签（「音名 + 唱名」模式下放唱名）。 */
  renderCellSub?: (s: number, f: number) => string | null;
  /** 八度偏移：>0 在圆点上方画点，<0 在下方画点（简谱的八度记号）。 */
  octaveShift?: (s: number, f: number) => number;
  cellClass?: (s: number, f: number) => string;
  onCellClick?: (s: number, f: number) => void;
  isDisabled?: (s: number, f: number) => boolean;
}

/**
 * 横轴是品、纵轴是弦（1 弦在上），画法按真琴来：
 * 6 条弦线 + 品丝 + 0 品琴枕 + 品位记号，音是坐在弦上的圆点。
 *
 * 视觉层（SVG）在下面，交互层是上面一层透明按钮，所以 Tab 键、禁用态、
 * 点按热区都和原来一样，只是看起来像指板而不是表格。
 * 弦名列在滚动容器之外，横向滚动时不会跑掉。
 */
export default function Fretboard({
  fretMin,
  fretMax,
  renderCell,
  renderCellSub,
  octaveShift,
  cellClass,
  onCellClick,
  isDisabled,
}: FretboardProps) {
  const frets: number[] = [];
  for (let f = fretMin; f <= fretMax; f++) frets.push(f);

  const boardW = frets.length * FRET_W;
  const boardH = TOP_H + 6 * STRING_H;
  const stringY = (s: number) => TOP_H + (s + 0.5) * STRING_H;
  const fretCenterX = (f: number) => (f - fretMin) * FRET_W + FRET_W / 2;

  return (
    <div className="fretboard">
      <div className="fb-labels" style={{ height: boardH }} aria-hidden="true">
        <div className="fb-labels-top" style={{ height: TOP_H }} />
        {STRING_LABELS.map((label, s) => (
          <div key={s} className="fb-string-label" style={{ height: STRING_H }}>
            {label}
          </div>
        ))}
      </div>

      <div className="fb-scroll">
        <div className="fb-board" style={{ width: boardW, height: boardH }}>
          <svg
            className="fb-bg"
            width={boardW}
            height={boardH}
            viewBox={`0 0 ${boardW} ${boardH}`}
            aria-hidden="true"
            focusable="false"
          >
            {/* 品号从 1 开始：0 品是琴枕左侧的空弦区，不占「一格」，所以不标号 */}
            {frets.map((f) =>
              f === 0 ? null : (
                <text key={`n${f}`} className="fb-fret-num" x={fretCenterX(f)} y={TOP_H / 2}>
                  {f}
                </text>
              ),
            )}

            {/* 品位记号 */}
            {INLAY_FRETS.filter((f) => f >= fretMin && f <= fretMax).map((f) =>
              f === 12 ? (
                <g key={`i${f}`}>
                  <circle className="fb-inlay" cx={fretCenterX(f)} cy={TOP_H + 2 * STRING_H} r={3.5} />
                  <circle className="fb-inlay" cx={fretCenterX(f)} cy={TOP_H + 4 * STRING_H} r={3.5} />
                </g>
              ) : (
                <circle key={`i${f}`} className="fb-inlay" cx={fretCenterX(f)} cy={TOP_H + 3 * STRING_H} r={3.5} />
              ),
            )}

            {/* 弦 */}
            {STRING_LABELS.map((_, s) => (
              <line
                key={`s${s}`}
                className="fb-string"
                x1={0}
                y1={stringY(s)}
                x2={boardW}
                y2={stringY(s)}
                strokeWidth={STRING_WIDTH[s]}
              />
            ))}

            {/* 品丝；fretMin = 0 时，琴枕画在空弦区与 1 品之间，左边缘不画线 */}
            {Array.from({ length: frets.length + 1 }, (_, i) => {
              if (fretMin === 0 && i === 0) return null;
              const x = i * FRET_W;
              const isNut = fretMin === 0 && i === 1;
              return (
                <line
                  key={`w${i}`}
                  className={isNut ? "fb-nut" : "fb-wire"}
                  x1={x}
                  y1={TOP_H}
                  x2={x}
                  y2={boardH}
                />
              );
            })}
          </svg>

          <div
            className="fb-grid"
            style={{
              gridTemplateColumns: `repeat(${frets.length}, ${FRET_W}px)`,
              gridTemplateRows: `${TOP_H}px repeat(6, ${STRING_H}px)`,
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((s) =>
              frets.map((f, i) => {
                const disabled = isDisabled ? isDisabled(s, f) : !onCellClick;
                const cls = ["fb-cell", cellClass ? cellClass(s, f) : ""].filter(Boolean).join(" ");
                const sub = renderCellSub ? renderCellSub(s, f) : null;
                const shift = octaveShift ? octaveShift(s, f) : 0;
                return (
                  <button
                    key={`${s}-${f}`}
                    type="button"
                    className={cls}
                    disabled={disabled}
                    style={{ gridColumn: i + 1, gridRow: s + 2 }}
                    onClick={() => onCellClick?.(s, f)}
                  >
                    <span className="fb-dot">
                      {shift > 0 && <OctaveDots n={shift} dir="up" />}
                      <span className="fb-main">{renderCell(s, f)}</span>
                      {sub ? <span className="fb-sub">{sub}</span> : null}
                      {shift < 0 && <OctaveDots n={-shift} dir="down" />}
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
