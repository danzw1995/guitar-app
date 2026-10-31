import {
  fromLegacyBest,
  parseProgress,
  type ProgressMap,
} from "@guitar/core";
import { LEVELS, parMsOf } from "./levels";

export const PROGRESS_KEY = "guitar.progress.v1";
export const SETTINGS_KEY = "guitar.settings.v1";
/** v0.2.x 只存每关最佳时间，迁移时读一次。 */
const LEGACY_BEST_PREFIX = "guitar.best.";

export interface Settings {
  /** 严格拼写：拼错算错，拿不到 2 星以上。 */
  strictSpelling: boolean;
}

export const DEFAULT_SETTINGS: Settings = { strictSpelling: false };

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 配额满：本次会话内进度仍在内存里，不阻断练习。
  }
}

function readLegacyBest(levelId: string): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_BEST_PREFIX + levelId);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

function parOf(levelId: string): number | null {
  const level = LEVELS.find((l) => l.id === levelId);
  return level ? parMsOf(level) : null;
}

/**
 * 读进度，并把 v0.2.x 的 `guitar.best.<levelId>` 迁移过来。
 *
 * 旧值只在「全对」时写入，所以迁移结果是「已完成 + 最快全对用时」，
 * 星级由 `fromLegacyBest` 按达标时间重算（可能直接三星）。
 */
export function loadProgress(): ProgressMap {
  const merged = parseProgress(readJson(PROGRESS_KEY), parOf);
  for (const level of LEVELS) {
    if (merged[level.id]) continue;
    const legacy = readLegacyBest(level.id);
    if (legacy !== null) merged[level.id] = fromLegacyBest(legacy, parMsOf(level));
  }
  return merged;
}

export function saveProgress(progress: ProgressMap): void {
  writeJson(PROGRESS_KEY, progress);
}

/** 清空进度，并顺手删掉旧版键，避免下次启动又被迁移回来。 */
export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    for (const level of LEVELS) localStorage.removeItem(LEGACY_BEST_PREFIX + level.id);
  } catch {
    // 忽略：清不掉时 refresh 后旧值会回来，但不影响当前会话。
  }
}

export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const v = raw as Record<string, unknown>;
  return { strictSpelling: v.strictSpelling === true };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, { strictSpelling: settings.strictSpelling });
}
