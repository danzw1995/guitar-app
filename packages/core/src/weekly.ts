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

export interface WeekStreak {  /** 连续达成的周数（含这一周，如果已经达成） */
  weeks: number;
  /** 这一周本身达成了没有 */
  currentDone: boolean;
  /** 历史最长连续（含当前这串） */
  best: number;
  /** 这串断了之后，上一串有几周；没断过就是 0 */
  lastWeeks: number;
  /** 上一串最后一周的周一；没断过就是空串 */
  lastUntil: string;
}

function minutesOfWeek(log: PracticeLog, monday: string): number {
  return windowOf(log, monday, addDays(monday, 6)).minutes;
}

/**
 * 连续达成：从这周往回数，连着几周都练够了当时的目标。
 *
 * 目标按周记（`guitar.goals.v1` 里 `周一 → 分钟`），不然改了目标以后历史会被重新判一遍：
 * 上个月 30 分钟算达成，这个月改成 90，回头就说你没达成，这不讲理。
 * 这一周还没练够不算断（周中当然还没够）；再往前遇到没记目标的周就停——那时候的
 * 目标不知道，不能瞎猜。
 *
 * 断了的时候（这周和上周都没练够）把上一串也带出来（`lastWeeks` / `lastUntil`），
 * 页面上写「上次连续 4 周」，别让记录凭空消失。
 */
export function weekStreak(
  log: PracticeLog,
  goalsByWeek: Record<string, number>,
  today: string,
  maxWeeks = 52,
): WeekStreak {
  const monday = mondayOf(today);
  const runs: { monday: string; reached: boolean }[] = [];
  for (let i = 0; i < maxWeeks; i++) {
    const start = addDays(monday, -7 * i);
    const goal = Math.max(0, Math.round(Number(goalsByWeek[start]) || 0));
    if (goal === 0) {
      if (i === 0) continue;
      break;
    }
    runs.push({ monday: start, reached: minutesOfWeek(log, start) >= goal });
  }

  // 这周达成了就从这周开始数；没达成不算断，从上周开始数
  let currentDone = false;
  let index = 0;
  if (runs.length > 0 && runs[0].monday === monday) {
    currentDone = runs[0].reached;
    if (!runs[0].reached) index = 1;
  }
  let weeks = 0;
  while (index < runs.length && runs[index].reached) {
    weeks += 1;
    index += 1;
  }

  // 断在这一周（index 指向第一个没达成的周），后面那串就是「上次连续」
  let lastWeeks = 0;
  let lastUntil = "";
  if (index < runs.length) {
    let j = index + 1;
    while (j < runs.length && runs[j].reached) {
      lastWeeks += 1;
      j += 1;
    }
    if (lastWeeks > 0) lastUntil = runs[index + 1].monday;
  }

  let best = 0;
  let run = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].reached) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return { weeks, currentDone, best, lastWeeks, lastUntil };
}

/** 周报里按块分的三堆：练习页的关卡、练习页的跟练（`p:` 前缀）、节奏页的条目。 */
export type WeekKind = "practice" | "follow" | "rhythm";

export interface WeekReport {
  from: string;
  to: string;
  /** 这周练了几天 */
  days: number;
  minutes: number;
  /** 这周完成过的条目（按 id 去重） */
  items: number;
  prevMinutes: number;
  deltaMinutes: number;
  /** 这周练得最久的那天 */
  busiest: { date: string; minutes: number } | null;
  /** 这周过去的日子里一条都没练的（含今天；只到 7 个） */
  missed: string[];
  kinds: Record<WeekKind, number>;
  /** 哪一块这周最少；三块都练过就是空串 */
  weak: WeekKind | "";
}

function kindOf(id: string): WeekKind {
  if (id.startsWith("p:")) return "follow";
  // 练习页的关卡 id 是 s0-crawl、s1-chord 这种；其余（rd-/rt-/sd-/ac-/sn-、节奏型名字）算节奏
  return /^s\d/.test(id) ? "practice" : "rhythm";
}

/**
 * 周报：这周练了几天、最勤的是哪天、哪一块落下了。
 *
 * 只读 `guitar.practice.v1`——跟练、节奏页的条目练完都会往当天的 `done` 里写一条，
 * 所以这三堆能在一个地方数清楚，不用再去翻别的表。
 */
export function weekReportOf(log: PracticeLog, today: string): WeekReport {
  const from = mondayOf(today);
  const week = weekSummaryOf(log, today);
  const kinds: Record<WeekKind, number> = { practice: 0, follow: 0, rhythm: 0 };
  const seen = new Set<string>();
  const byDate = new Map<string, number>();
  for (const [date, entry] of Object.entries(log)) {
    const day = dayNumberOf(date);
    if (!Number.isFinite(day) || day < dayNumberOf(from) || day > dayNumberOf(today)) continue;
    byDate.set(date, Math.max(0, Math.round(entry.minutes ?? 0)));
    for (const id of entry.done ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      kinds[kindOf(id)] += 1;
    }
  }

  let busiest: { date: string; minutes: number } | null = null;
  for (const [date, minutes] of byDate) {
    if (!busiest || minutes > busiest.minutes) busiest = { date, minutes };
  }

  const missed: string[] = [];
  for (let d = from; d <= today && missed.length < 7; d = addDays(d, 1)) {
    if (!byDate.has(d)) missed.push(d);
  }

  let weak: WeekKind | "" = "";
  const order: WeekKind[] = ["practice", "follow", "rhythm"];
  let least = Number.POSITIVE_INFINITY;
  for (const kind of order) {
    if (kinds[kind] < least) {
      least = kinds[kind];
      weak = kind;
    }
  }
  if (least > 0) weak = "";

  return {
    from,
    to: today,
    days: week.days,
    minutes: week.minutes,
    items: week.items,
    prevMinutes: week.prevMinutes,
    deltaMinutes: week.deltaMinutes,
    busiest,
    missed,
    kinds,
    weak,
  };
}
