import { sparklineOf, type Spark } from "@guitar/core";
import type { EarStats } from "./storage";

/**
 * 听辨正确率按天记的那份，换算成一条折线。
 *
 * 横轴是**练过的日子**，不是日历天：中间空三天不该把线拉成一条假的平台。
 * 少于两个点就没有趋势可言，`spark` 返回 `null`（调用方别画）。
 */
export interface EarTrend {
  /** `[日期, 当天对错]`，按日期升序，最多 `max` 个。 */
  days: [string, { correct: number; total: number }][];
  /** 每天的正确率（整数百分比），与 `days` 一一对应。 */
  rates: number[];
  spark: Spark | null;
}

export function earTrendOf(ear: EarStats, max = 14): EarTrend {
  const days = Object.entries(ear.days ?? {})
    .filter(([, item]) => item.total > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-max);
  const rates = days.map(([, item]) => Math.round((item.correct / item.total) * 100));
  const spark = rates.length >= 2 ? sparklineOf(rates, 120, 30) : null;
  return { days, rates, spark };
}
