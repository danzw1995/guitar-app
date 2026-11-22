/**
 * 录音旁边那条「节拍参考线」（v0.150.0）：
 * 竖线是节拍器该响的位置，圆点是这一遍每一拍实际落下的位置——两下一比就知道是抢还是拖。
 * 只是个示意图，不是波形：波形得等能把录音解码出来（先不做）。
 */

export interface BeatRulerProps {
  /** 每拍偏差（毫秒，负=抢、正=拖） */
  offsets: number[];
  /** 一拍一个位置，横向按拍数等分 */
  className?: string;
}

/** 60 毫秒 = 7 像素，再远就顶到头，免得一笔画出老远 */
const SCALE = 7 / 60;
const MAX_SHIFT = 9;

export default function BeatRuler({ offsets, className }: BeatRulerProps) {
  if (offsets.length === 0) return null;
  const count = offsets.length;
  const step = count > 1 ? 196 / (count - 1) : 0;
  const x = (index: number) => (count > 1 ? 12 + index * step : 110);
  const shift = (offset: number) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, offset * SCALE));
  const worst = offsets.reduce(
    (pick, offset, index) => (Math.abs(offset) > Math.abs(offsets[pick]) ? index : pick),
    0,
  );
  const worstOffset = offsets[worst] ?? 0;
  const aria =
    `每一拍的落点（竖线是节拍器）：${count} 拍，偏得最多的是第 ${worst + 1} 拍，` +
    `${worstOffset < 0 ? "抢" : "拖"} ${Math.abs(Math.round(worstOffset))} 毫秒`;

  return (
    <div className={`beat-ruler-wrap${className ? ` ${className}` : ""}`}>
      <svg
        className="beat-ruler"
        viewBox="0 0 220 30"
        role="img"
        aria-label={aria}
      >
        <line className="beat-ruler-zero" x1={4} y1={15} x2={216} y2={15} />
        {offsets.map((offset, index) => {
          const center = x(index);
          const mark = Math.abs(offset) <= 8 ? "on" : offset < 0 ? "early" : "late";
          return (
            <g key={`${index}-${offset}`}>
              <line className="beat-ruler-tick" x1={center} y1={6} x2={center} y2={24} />
              <circle className={`beat-ruler-dot ${mark}`} cx={center + shift(offset)} cy={15} r={2.6} />
            </g>
          );
        })}
      </svg>
      <span className="beat-ruler-hint">竖线是节拍器，圆点是这一遍的落点</span>
    </div>
  );
}
