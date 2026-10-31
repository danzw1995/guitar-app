import type { AttemptResult } from "./types.ts";

/**
 * 每关进度。存 localStorage，一次只写一条。
 *
 * 星级是「完成度 + 完美用时」的唯一真相：
 * - 0 星：没做完（有空格）；
 * - 1 星：做完但没全对；
 * - 2 星：全对，但比达标时间慢（或还没刷新过完美成绩）；
 * - 3 星：全对，且用时 ≤ 达标时间。
 *
 * 所以 3 星 ⇔ `bestMs !== null && bestMs <= parMs`，2 星 ⇔ 全对但慢，
 * 1 星 ⇔ `completed`，0 星 ⇔ 什么都没做。`stars` 字段只是缓存，规则在 `starsOf`。
 */
export interface LevelProgress {
  /** 至少完成过一次（无空格）。 */
  completed: boolean;
  /** 0–3，见文件头。 */
  stars: number;
  /** 最快「全对」用时（毫秒）；从未全对过是 null。 */
  bestMs: number | null;
  /** 提交次数（含未完成就提交的）。 */
  attempts: number;
  /** 最后一次提交时间戳；旧数据迁移来的是 null。 */
  lastAt: number | null;
}

export type ProgressMap = Record<string, LevelProgress>;

export const MAX_STARS = 3;

export const EMPTY_PROGRESS: LevelProgress = {
  completed: false,
  stars: 0,
  bestMs: null,
  attempts: 0,
  lastAt: null,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 三星达标时间：每个目标格 2 秒，再按难度最多加 3 秒/格。
 *
 * ```
 * parMs = targetCount * (2 + 3 * difficulty) * 1000
 * ```
 *
 * 参考值：L01（18 格、难度 0.300）≈ 52s，L40（48 格、难度 0.678）≈ 194s。
 */
export function parMsFor(input: { targetCount: number; difficulty: number }): number {
  const perCell = 2 + 3 * clamp01(input.difficulty);
  return Math.round(Math.max(0, input.targetCount) * perCell * 1000);
}

/** 宽松判定下拼写错误算对；严格判定下算错。 */
export function isPerfect(result: AttemptResult, strictSpelling: boolean): boolean {
  if (result.total <= 0) return false;
  const ok = strictSpelling ? result.correct : result.correct + result.spelling;
  return ok === result.total;
}

/** 由「完成 + 最快全对用时」推星级：唯一入口，避免各处各写一套。 */
export function starsOf(
  p: Pick<LevelProgress, "completed" | "bestMs">,
  parMs: number,
): number {
  if (!p.completed) return 0;
  if (p.bestMs === null) return 1;
  return p.bestMs <= parMs ? 3 : 2;
}

export interface AttemptContext {
  elapsedMs: number;
  /** 严格拼写：拼写错误不算完美，拿不到 2 星以上。 */
  strictSpelling: boolean;
  /** 该关的三星达标时间，见 `parMsFor`。 */
  parMs: number;
  /** 提交时间戳，默认 `Date.now()`；测试时传入固定值。 */
  at?: number;
}

/**
 * 这一把能拿几星（用于结果页展示，不代表历史最高）。
 *
 * 与 `applyAttempt` 从空进度出发时的星级一致，规则只有这一份。
 */
export function starsForAttempt(
  result: AttemptResult,
  ctx: Pick<AttemptContext, "elapsedMs" | "strictSpelling" | "parMs">,
): number {
  if (!result.finished) return 0;
  if (!isPerfect(result, ctx.strictSpelling)) return 1;
  return ctx.elapsedMs > 0 && ctx.elapsedMs <= ctx.parMs ? 3 : 2;
}

/**
 * 合并一次提交。纯函数：相同输入永远相同输出，不改 `prev`。
 *
 * `elapsedMs <= 0` 视为无效用时（没开始就提交），不参与最快成绩。
 */
export function applyAttempt(
  prev: LevelProgress | undefined,
  result: AttemptResult,
  ctx: AttemptContext,
): LevelProgress {
  const base = prev ?? EMPTY_PROGRESS;
  let bestMs = base.bestMs;

  const perfect = isPerfect(result, ctx.strictSpelling);
  if (result.finished && perfect && ctx.elapsedMs > 0) {
    if (bestMs === null || ctx.elapsedMs < bestMs) bestMs = ctx.elapsedMs;
  }

  const completed = base.completed || result.finished;
  return {
    completed,
    stars: starsOf({ completed, bestMs }, ctx.parMs),
    bestMs,
    attempts: base.attempts + 1,
    lastAt: ctx.at ?? Date.now(),
  };
}

/** 第一关永远解锁；其余关需要上一关至少 1 星。 */
export function isUnlocked(
  levelIds: readonly string[],
  index: number,
  progress: ProgressMap,
): boolean {
  if (index <= 0) return true;
  const prev = progress[levelIds[index - 1]];
  return !!prev && prev.completed;
}

export function completedCount(levelIds: readonly string[], progress: ProgressMap): number {
  let n = 0;
  for (const id of levelIds) if (progress[id]?.completed) n++;
  return n;
}

export function totalStars(progress: ProgressMap): number {
  let n = 0;
  for (const p of Object.values(progress)) n += Math.max(0, Math.min(MAX_STARS, p.stars));
  return n;
}

/**
 * 旧版只有 `localStorage["guitar.best.<levelId>"]`（全对才会写入），
 * 迁移成完整进度：至少 2 星，用时达标则直接 3 星。
 */
export function fromLegacyBest(bestMs: number, parMs: number): LevelProgress {
  const completed = true;
  return {
    completed,
    stars: starsOf({ completed, bestMs }, parMs),
    bestMs,
    attempts: 1,
    lastAt: null,
  };
}

function toNumber(v: unknown, fallback: number | null): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function clampStars(raw: unknown, completed: boolean): number {
  if (!completed) return 0;
  const n = toNumber(raw, 0) ?? 0;
  return Math.min(MAX_STARS, Math.round(n));
}

/**
 * 把 localStorage 里读到的东西变回可信的 `ProgressMap`。
 * 手改过、旧版本、写坏的数据都不该让页面崩，坏条目直接丢掉。
 *
 * 传了 `parMsOf` 就用 `starsOf` 重算星级（唯一真相）；没传则沿用存档里的
 * 星级并夹到 0–3，避免不知道怎么算的时候把三星降成两星。
 */
export function parseProgress(
  raw: unknown,
  parMsOf?: (levelId: string) => number | null,
): ProgressMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProgressMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const completed = v.completed === true;
    const bestMs = toNumber(v.bestMs, null);
    const attempts = toNumber(v.attempts, 0) ?? 0;
    if (!completed && bestMs === null && attempts === 0) continue;

    const parMs = parMsOf ? parMsOf(id) : null;
    out[id] = {
      completed,
      stars: parMs !== null
        ? starsOf({ completed, bestMs }, parMs)
        : clampStars(v.stars, completed),
      bestMs,
      attempts,
      lastAt: toNumber(v.lastAt, null),
    };
  }
  return out;
}
