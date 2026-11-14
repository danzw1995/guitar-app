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
  /** 额外加的紧迫度（天），没加就是 0。 */
  boost: number;
}

export interface DueOptions {
  /** 额外加的紧迫度（天）：退步过的条目加几天，让它先回来。 */
  boost?: Map<string, number>;
  /** 今天先不练的（手动「换一条」）；还有别的候选时跳过它。 */
  exclude?: Set<string>;
  /**
   * 压后到哪天为止（`id → 释放日`）：压后的那几天不算「多久没练」，
   * 释放当天按 0 天算，免得一放出来就又被排到最前面。
   */
  freeze?: Map<string, string>;
}

/**
 * 从一堆候选里挑一条：先挑最久没练的；一样久时按 `offset` 轮换，
 * 保证「同一天刷新不跳、第二天换一条」，也不至于永远卡在第一条。
 *
 * `boost` 给某几条加几天紧迫度（退步了、或者上次卡住没练完）；
 * `exclude` 是「今天不想练这条」，但整池都被排除时忽略它，免得空手；
 * `freeze` 是压后到哪天——压后期间时钟停住，释放那天从 0 天重新算。
 */
export function pickDue<T extends { id: string }>(
  pool: readonly T[],
  lastAt: Map<string, string>,
  today: string,
  offset: number,
  options: DueOptions = {},
): DuePick<T> {
  if (pool.length === 0) throw new Error("pickDue: 候选是空的");

  const left = options.exclude?.size
    ? pool.filter((item) => !options.exclude?.has(item.id))
    : pool;
  const usable = left.length > 0 ? left : pool;

  const ranked = usable.map((item) => {
    const seen = lastAt.get(item.id);
    const released = options.freeze?.get(item.id);
    // 压后过的条目从释放日重新算：`released` 比上次练更晚时以它为准
    const anchor = released && (!seen || released > seen) ? released : seen;
    const boost = options.boost?.get(item.id) ?? 0;
    const index = pool.indexOf(item);
    return {
      item,
      lastAt: seen,
      days: dueDaysOf(anchor, today),
      boost,
      // 同分时按 offset 轮换：offset 天天变，所以第二天会轮到下一条
      rank: (index - offset + pool.length * 8) % pool.length,
    };
  });

  ranked.sort((a, b) => b.days + b.boost - (a.days + a.boost) || a.rank - b.rank);
  const best = ranked[0];
  return { item: best.item, lastAt: best.lastAt, days: best.days, boost: best.boost };
}
