import { dayNumberOf } from "./daily.ts";

/**
 * 今天该练哪条：按「多久没练」挑，而不是按日期轮换。
 *
 * 纯函数，只吃「每天练过哪些 id」这张表；页面和 core 的 buildSession 共用。
 * 一条练习练完之后，第二天它的「多久没练」只有 1 天，自然会被挤到后面；
 * 隔了一周没碰的会先回来——这就是最朴素的间隔复习。
 */

/** 每天的记录里我们只关心「练过哪些 id」。 */
export interface DoneDay {
  done?: string[];
}

/** `日期 → 那天练过什么`。 */
export type DoneLog = Record<string, DoneDay | undefined>;

/** 从没练过的条目，按「已经放了几天」算——比刚练过的靠前，但不如一周没碰的。 */
export const FRESH_DAYS = 4;

/**
 * 每条练习最后一次练是哪天（**不含今天**：今天的记录不参与，
 * 这样同一天里练完一条，计划不会跟着变）。
 */
export function lastPracticed(log: DoneLog, today: string): Map<string, string> {
  const last = new Map<string, string>();
  for (const [date, day] of Object.entries(log)) {
    if (!day?.done || date >= today) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const id of day.done) {
      const previous = last.get(id);
      if (!previous || date > previous) last.set(id, date);
    }
  }
  return last;
}

/** 距上次练了几天；从没练过返回 `FRESH_DAYS`。 */
export function dueDaysOf(lastAt: string | undefined, today: string): number {
  if (!lastAt) return FRESH_DAYS;
  const days = dayNumberOf(today) - dayNumberOf(lastAt);
  return days > 0 ? days : 0;
}

export interface DuePick<T> {
  item: T;
  /** 上次练的日期；从没练过就没有这个字段。 */
  lastAt?: string;
  /** 距上次几天；从没练过是 `FRESH_DAYS`。 */
  days: number;
}

/**
 * 从一堆候选里挑一条：先挑最久没练的；一样久时按 `offset` 轮换，
 * 保证「同一天刷新不跳、第二天换一条」，也不至于永远卡在第一条。
 */
export function pickDue<T extends { id: string }>(
  pool: readonly T[],
  lastAt: Map<string, string>,
  today: string,
  offset: number,
): DuePick<T> {
  if (pool.length === 0) throw new Error("pickDue: 候选是空的");

  const ranked = pool.map((item, index) => {
    const seen = lastAt.get(item.id);
    return {
      item,
      lastAt: seen,
      days: dueDaysOf(seen, today),
      // 同分时按 offset 轮换：offset 天天变，所以第二天会轮到下一条
      rank: (index - offset + pool.length * 8) % pool.length,
    };
  });

  ranked.sort((a, b) => b.days - a.days || a.rank - b.rank);
  const best = ranked[0];
  return { item: best.item, lastAt: best.lastAt, days: best.days };
}
