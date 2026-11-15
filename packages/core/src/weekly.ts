/**
 * 「这一周」：统计页最上面那四张卡片要的数字。
 *
 * 口径（故意写得死一点，免得以后各页面自己解释）：
 * - 一周从**周一**起算，到今天为止（不是最近 7 天——「这周」和「上周同期」才比得出来）。
 * - 上周同期 = 上周一 … 上周的同一天（等长），不是整周，否则周一打开永远是负数。
 * - 练了几天：当天有分钟数或有完成条目就算，光打开页面不算。
 */
import { addDays, dayNumberOf } from "./daily.ts";
import type { PracticeLog } from "./practice.ts";

export interface WeekSummary {
  /** 本周一 */
  from: string;
  /** 今天 */
  to: string;
  days: number;
  minutes: number;
  /** 本周完成过的条目数（按 id 去重，`p:` 跟练也算一条） */
  items: number;
  prevDays: number;
  prevMinutes: number;
  prevItems: number;
  deltaMinutes: number;
  deltaDays: number;
}

/** 周一 = 0（1970-01-01 是周四，所以 +3） */
export function mondayOf(dateKey: string): string {
  const weekday = (((dayNumberOf(dateKey) + 3) % 7) + 7) % 7;
  return addDays(dateKey, -weekday);
}

function windowOf(log: PracticeLog, from: string, to: string) {
  const end = dayNumberOf(to);
  let days = 0;
  let minutes = 0;
  const items = new Set<string>();
  for (const [date, entry] of Object.entries(log)) {
    const day = dayNumberOf(date);
    if (!Number.isFinite(day) || day < dayNumberOf(from) || day > end) continue;
    const mins = Math.max(0, Math.round(entry.minutes ?? 0));
    const done = entry.done ?? [];
    if (mins > 0 || done.length > 0) days += 1;
    minutes += mins;
    for (const id of done) items.add(id);
  }
  return { days, minutes, items: items.size };
}

export function weekSummaryOf(log: PracticeLog, today: string): WeekSummary {
  const from = mondayOf(today);
  const prevFrom = addDays(from, -7);
  const prevTo = addDays(today, -7);
  const now = windowOf(log, from, today);
  const prev = windowOf(log, prevFrom, prevTo);
  return {
    from,
    to: today,
    days: now.days,
    minutes: now.minutes,
    items: now.items,
    prevDays: prev.days,
    prevMinutes: prev.minutes,
    prevItems: prev.items,
    deltaMinutes: now.minutes - prev.minutes,
    deltaDays: now.days - prev.days,
  };
}

export interface GoalProgress {
  /** 每周目标分钟数；0 表示没设 */
  goal: number;
  done: number;
  /** 0–100，超出也封顶在 100 */
  percent: number;
  /** 还差多少分钟；达成了就是 0 */
  remaining: number;
  reached: boolean;
}

/**
 * 本周目标：把「这周练了多少」换算成进度条要的三个数。
 * 没设目标（goal <= 0）时 percent / remaining 都是 0，页面据此不画进度条。
 */
export function goalProgress(done: number, goal: number): GoalProgress {
  const total = Math.max(0, Math.round(done));
  const target = Number.isFinite(goal) ? Math.max(0, Math.round(goal)) : 0;
  if (target === 0) return { goal: 0, done: total, percent: 0, remaining: 0, reached: false };
  const remaining = Math.max(0, target - total);
  return {
    goal: target,
    done: total,
    percent: Math.min(100, Math.round((total / target) * 100)),
    remaining,
    reached: remaining === 0,
  };
}

export interface WeekPace {
  /** 这周已经过去几天（周一 = 1 … 周日 = 7，含今天） */
  elapsed: number;
  /** 今天之后还剩几天 */
  left: number;
  /** 这周到目前为止平均每天练了多少分钟 */
  perDay: number;
  /** 按现在的节奏，这周大概能练到多少分钟 */
  projected: number;
  /** 要达成目标，剩下每天（含今天）还得练多少分钟；已达成或没设目标为 0 */
  perDayNeeded: number;
  reached: boolean;
}

/**
 * 「还差 5 分钟」不好判断今天要不要加练，换成「剩下 3 天，每天 2 分钟」。
 * 周从周一起算，今天也算进去（周日就是最后一天）。
 */
export function weekPace(week: WeekSummary, today: string, goal: number): WeekPace {
  const weekday = (((dayNumberOf(today) + 3) % 7) + 7) % 7;
  const elapsed = Math.min(7, weekday + 1);
  const left = 7 - elapsed;
  const minutes = Math.max(0, Math.round(week.minutes));
  const perDay = Math.round((minutes / elapsed) * 10) / 10;
  const state = goalProgress(minutes, goal);
  const daysIncludingToday = left + 1;
  const perDayNeeded =
    state.goal === 0 || state.reached ? 0 : Math.ceil(state.remaining / daysIncludingToday);
  return {
    elapsed,
    left,
    perDay,
    projected: Math.round(perDay * 7),
    perDayNeeded,
    reached: state.reached,
  };
}
