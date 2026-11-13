import { addDays, dayNumberOf } from "./daily.ts";
import type { PracticeLog } from "./practice.ts";

/**
 * 练习热力图（GitHub 那种格子图）。
 *
 * 一列是一周、一行是一周里的某一天，周一在最上面。格子深浅按那天练了多少分钟分档，
 * 这样"最近半年有没有断过"一眼就能看出来，比连续天数那个数字更有说服力。
 */
export interface HeatCell {
  date: string;
  minutes: number;
  /** 0 = 没练，1–4 越来越深。 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 还没到的日子（今天之后），画成空格子。 */
  future: boolean;
}

export interface HeatMonth {
  /** 第几列（0 起），用来把月份标签摆到那一周上面。 */
  week: number;
  label: string;
}

export interface Heatmap {
  /** `weeks[列][行]`，每列 7 天，行 0 是周一。 */
  weeks: HeatCell[][];
  months: HeatMonth[];
  /** 这段时间里练过的总分钟数。 */
  total: number;
  /** 这段时间里练过的天数。 */
  days: number;
  /** 单日最多多少分钟。 */
  max: number;
  from: string;
  to: string;
}

/** 每档的下限：1 / 10 / 20 / 40 分钟。 */
export const HEAT_STEPS = [1, 10, 20, 40] as const;

export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (minutes >= HEAT_STEPS[3]) return 4;
  if (minutes >= HEAT_STEPS[2]) return 3;
  if (minutes >= HEAT_STEPS[1]) return 2;
  return 1;
}

/** 周一算一周的第一天：0 = 周一 … 6 = 周日。1970-01-01 是周四，所以 +3。 */
export function weekdayIndex(dateKey: string): number {
  return (((dayNumberOf(dateKey) + 3) % 7) + 7) % 7;
}

/**
 * 生成最近 `weeks` 周的热力图，最后一列是今天所在的那一周。
 * `log` 就是练习页存的那张表（日期 → 当天练了几分钟），范围外的日子不会被算进来。
 */
export function heatmapOf(log: PracticeLog, today: string, weeks = 26): Heatmap {
  const span = Math.max(1, Math.floor(weeks));
  const todayNumber = dayNumberOf(today);
  const start = addDays(today, -(span - 1) * 7 - weekdayIndex(today));
  const startNumber = dayNumberOf(start);

  const cells: HeatCell[][] = [];
  const months: HeatMonth[] = [];
  let lastLabeledMonth = -1;
  let lastLabeledWeek = -99;

  for (let w = 0; w < span; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const number = startNumber + w * 7 + d;
      const future = number > todayNumber;
      const minutes = future ? 0 : Math.max(0, Math.round(log[date]?.minutes ?? 0));
      column.push({ date, minutes, level: heatLevel(minutes), future });
    }
    cells.push(column);

    // 月份标签：这一列的周一进了新的一个月，且离上一个标签至少 3 列，免得挤在一起
    const month = Number(column[0].date.slice(5, 7));
    if (month !== lastLabeledMonth && (w === 0 || w - lastLabeledWeek >= 3)) {
      months.push({ week: w, label: `${month}月` });
      lastLabeledMonth = month;
      lastLabeledWeek = w;
    }
  }

  let total = 0;
  let days = 0;
  let max = 0;
  for (const column of cells) {
    for (const cell of column) {
      if (cell.future) continue;
      total += cell.minutes;
      if (cell.minutes > 0) days++;
      if (cell.minutes > max) max = cell.minutes;
    }
  }

  return { weeks: cells, months, total, days, max, from: start, to: today };
}
