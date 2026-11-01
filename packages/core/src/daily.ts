import { generatePuzzle } from "./puzzle.ts";
import { MAX_STARS, type ProgressMap } from "./progress.ts";
import { KEYS } from "./theory.ts";
import type { Puzzle } from "./types.ts";

/**
 * 每日挑战的题目参数。同一天同一时区的人拿到同一套参数，
 * 也就是同题；跨时区会错开一天，这是已知且可接受的行为。
 */
export interface DailySpec {
  /** 本地日期，`YYYY-MM-DD`。 */
  dateKey: string;
  seed: number;
  keyId: string;
  scaleId: string;
  fretMin: number;
  fretMax: number;
  givenRatio: number;
}

const DAY_MS = 86_400_000;

/** 本地日期键；刻意用本地时区，玩家看到的「今天」就是他所在时区的今天。 */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 真实存在的日期（排除 2026-02-30 这种）。 */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return dateKeyFromDayNumber(dayNumberOf(key)) === key;
}

function shiftDateKey(key: string, days: number): string {
  return dateKeyFromDayNumber(dayNumberOf(key) + days);
}

function delimitersCheck(key: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`bad dateKey: ${key}`);
}

function dateKeyFromDayNumber(dayNumber: number): string {
  const dt = new Date(dayNumber * DAY_MS);
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${m}-${d}`;
}

/** 距 1970-01-01 的天数；用它做「第几天」，跨时区也稳定。 */
export function dayNumberOf(dateKey: string): number {
  delimitersCheck(dateKey);
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export const previousDateKey = (key: string): string => shiftDateKey(key, -1);
export const nextDateKey = (key: string): string => shiftDateKey(key, 1);

/** 最近 n 天（含今天），按时间升序。 */
export function lastNDays(today: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDateKey(today, -i));
  return out;
}

/** 品域与给定比例的轮换表；指数越大越难。 */
const RANGES = [
  { fretMin: 1, fretMax: 5, givenRatio: 0.55 },
  { fretMin: 1, fretMax: 7, givenRatio: 0.45 },
  { fretMin: 0, fretMax: 12, givenRatio: 0.35 },
];

/**
 * 用日期推导当天题目：
 * - 调：`dayNumber % 22` 在 22 个调里轮换（12 大调 + 10 小调）；
 * - 音阶：跟着调走（大调用 major，小调用自然小调），不做调外音；
 * - 品域：`dayNumber % 3` 轮换 1–5 / 1–7 / 0–12；
 * - seed 就是 dayNumber，出题与给定格都随日期不同。
 *
 * 22 与 3 互质，所以 66 天内 22 个调 × 3 个品域的组合会全部出现。
 */
export function dailySpecFor(dateKey: string): DailySpec {
  const day = dayNumberOf(dateKey);
  const key = KEYS[((day % KEYS.length) + KEYS.length) % KEYS.length];
  const range = RANGES[((day % RANGES.length) + RANGES.length) % RANGES.length];
  return {
    dateKey,
    seed: day,
    keyId: key.id,
    scaleId: key.mode === "minor" ? "naturalMinor" : "major",
    fretMin: range.fretMin,
    fretMax: range.fretMax,
    givenRatio: range.givenRatio,
  };
}

export function dailyPuzzle(spec: DailySpec): Puzzle {
  return generatePuzzle({
    id: `daily:${spec.dateKey}`,
    seed: spec.seed,
    keyId: spec.keyId,
    scaleId: spec.scaleId,
    fretMin: spec.fretMin,
    fretMax: spec.fretMax,
    givenRatio: spec.givenRatio,
  });
}

export interface StreakInfo {
  /** 到今天为止的连续天数；今天没做但昨天做了，仍显示到昨天为止的连续。 */
  current: number;
  /** 历史最长连续。 */
  longest: number;
  /** 今天是否已完成。 */
  todayDone: boolean;
}

/**
 * 由「完成过的日期集合」算连续天数，不单独存状态，避免和记录打架。
 */
export function streakOf(doneDates: Iterable<string>, today: string): StreakInfo {
  const set = new Set(doneDates);
  const todayDone = set.has(today);

  let current = 0;
  let cursor = todayDone ? today : previousDateKey(today);
  while (set.has(cursor)) {
    current++;
    cursor = previousDateKey(cursor);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of [...set].sort()) {
    if (!isValidDateKey(date)) continue;
    run = prev !== null && nextDateKey(prev) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = date;
  }

  return { current, longest, todayDone };
}

export interface ProgressSummary {
  /** 已通关关卡数。 */
  completed: number;
  /** 关卡总数。 */
  total: number;
  /** 星星合计。 */
  stars: number;
  /** 星星上限 = total × 3。 */
  maxStars: number;
  /** 已通关关卡的平均星级（未通关的不计入），未通关时为 0。 */
  averageStars: number;
  /** 提交次数合计。 */
  attempts: number;
  /** 各位「最快全对」之和；没全对过的关卡不计。 */
  bestSumMs: number;
  /** 全对过的关卡数。 */
  perfectCount: number;
  /** 累计练习时长（每关每把用时之和）。 */
  totalMs: number;
}

export function summarizeProgress(
  levelIds: readonly string[],
  progress: ProgressMap,
): ProgressSummary {
  let completed = 0;
  let stars = 0;
  let attempts = 0;
  let bestSumMs = 0;
  let perfectCount = 0;
  let totalMs = 0;

  for (const id of levelIds) {
    const p = progress[id];
    if (!p) continue;
    if (p.completed) completed++;
    stars += Math.max(0, Math.min(MAX_STARS, p.stars));
    attempts += Math.max(0, p.attempts);
    totalMs += Math.max(0, p.totalMs);
    if (p.bestMs !== null) {
      bestSumMs += p.bestMs;
      perfectCount++;
    }
  }

  return {
    completed,
    total: levelIds.length,
    stars,
    maxStars: levelIds.length * MAX_STARS,
    averageStars: completed ? Math.round((stars / completed) * 10) / 10 : 0,
    attempts,
    bestSumMs,
    perfectCount,
    totalMs,
  };
}
