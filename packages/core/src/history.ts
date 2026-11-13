/**
 * 跟练的进步曲线：一天一个点，记那天最快练到多少 BPM。
 *
 * 数据存在跟练记录里（`guitar.rhythm.v1` 的 `history`），这里只放两个纯函数：
 * 往曲线上加点、把点换算成一条折线——都在 core 里，方便单测。
 */

/** 曲线上的一个点：那天最快练到多少。 */
export interface BpmPoint {
  /** `YYYY-MM-DD`。 */
  date: string;
  bpm: number;
}

/**
 * 往曲线上加一个点：同一天只留最快的，最多留 `cap` 个（丢了最早的）。
 * 纯函数，返回新数组。
 */
export function pushBpmPoint(
  points: BpmPoint[] | undefined,
  date: string,
  bpm: number,
  cap = 60,
): BpmPoint[] {
  const list = [...(points ?? [])];
  const value = Math.round(bpm);
  if (!date || !Number.isFinite(value) || value <= 0) return list;

  const at = list.findIndex((point) => point.date === date);
  if (at >= 0) list[at] = { date, bpm: Math.max(list[at].bpm, value) };
  else list.push({ date, bpm: value });

  list.sort((a, b) => a.date.localeCompare(b.date));
  return list.length > cap ? list.slice(list.length - cap) : list;
}

export interface Spark {
  /** 折线的 SVG `d`。 */
  d: string;
  /** 每个点的坐标（用来画最后一个点的小圆）。 */
  dots: { x: number; y: number }[];
  min: number;
  max: number;
}

/**
 * 把一串数值换算成一条折线（宽度/高度是逻辑像素）。
 * 只有一个点时画在正中间；数值全相同时贴底（免得除零）。
 */
export function sparklineOf(values: number[], width: number, height: number, pad = 3): Spark {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return { d: "", dots: [], min: 0, max: 0 };

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const step = clean.length > 1 ? innerW / (clean.length - 1) : 0;

  const dots = clean.map((value, index) => ({
    x: round(pad + (clean.length === 1 ? innerW / 2 : index * step)),
    y: round(height - pad - ((value - min) / span) * innerH),
  }));
  const d = dots.map((dot, index) => `${index === 0 ? "M" : "L"}${dot.x} ${dot.y}`).join(" ");
  return { d, dots, min, max };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
