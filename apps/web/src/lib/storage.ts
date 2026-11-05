import {
  fromLegacyBest,
  isValidDateKey,
  parseProgress,
  type LevelProgress,
  type PracticeLog,
  type ProgressMap,
  type SolfegeStyle,
  type SolfegeSystem,
} from "@guitar/core";
import { LEVELS, parMsOf } from "./levels";

export const PROGRESS_KEY = "guitar.progress.v1";
export const SETTINGS_KEY = "guitar.settings.v1";
/** 每日挑战记录：日期 -> 进度（复用同一套星级规则）。 */
export const DAILY_KEY = "guitar.daily.v1";
/** 练习记录：日期 -> 当天练了什么。 */
export const PRACTICE_KEY = "guitar.practice.v1";
/** v0.2.x 只存每关最佳时间，迁移时读一次。 */
const LEGACY_BEST_PREFIX = "guitar.best.";

export type DailyMap = Record<string, LevelProgress>;

/** 指板上显示什么：音名 / 唱名 / 两者。 */
export type LabelMode = "name" | "solfege" | "both";

export interface Settings {
  /** 严格拼写：拼错算错，拿不到 2 星以上。 */
  strictSpelling: boolean;
  labels: LabelMode;
  solfegeSystem: SolfegeSystem;
  solfegeStyle: SolfegeStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  strictSpelling: false,
  labels: "name",
  solfegeSystem: "movable",
  solfegeStyle: "number",
};

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

/**
 * 每日挑战记录：`{ "2026-10-31": LevelProgress }`。
 * 复用 `parseProgress` 校验（这里传不了 parMs，星级沿用存档值），坏条目直接丢。
 */
export function loadDaily(): DailyMap {
  return parseProgress(readJson(DAILY_KEY)) as DailyMap;
}

export function saveDaily(daily: DailyMap): void {
  writeJson(DAILY_KEY, daily);
}

/** 清空进度，并顺手删掉旧版键，避免下次启动又被迁移回来。 */
export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(DAILY_KEY);
    for (const level of LEVELS) localStorage.removeItem(LEGACY_BEST_PREFIX + level.id);
  } catch {
    // 忽略：清不掉时 refresh 后旧值会回来，但不影响当前会话。
  }
}

/**
 * 练习记录。坏数据整个键丢掉而不是让页面崩——
 * 练习历史比进度更容易被手改，宽容一点更安全。
 */
export function loadPractice(): PracticeLog {
  const raw = readJson(PRACTICE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const log: PracticeLog = {};
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDateKey(date)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const day = value as Record<string, unknown>;
    const minutes = Number(day.minutes);
    if (!Number.isFinite(minutes) || minutes < 0) continue;

    const stage = Number(day.stage);
    const bpmMax = Number(day.bpmMax);
    log[date] = {
      minutes: Math.round(minutes),
      stage: Number.isInteger(stage) && stage >= 0 && stage <= 5 ? stage : 0,
      done: Array.isArray(day.done)
        ? day.done.filter((id): id is string => typeof id === "string")
        : [],
      feel:
        day.feel === "steady" || day.feel === "ok" || day.feel === "shaky"
          ? day.feel
          : undefined,
      goal: typeof day.goal === "string" ? day.goal : undefined,
      bpmMax: Number.isFinite(bpmMax) && bpmMax > 0 ? bpmMax : undefined,
    };
  }
  return log;
}

export function savePractice(log: PracticeLog): void {
  writeJson(PRACTICE_KEY, log);
}

export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const v = raw as Record<string, unknown>;

  const labels: LabelMode =
    v.labels === "solfege" || v.labels === "both" ? v.labels : "name";
  const solfegeSystem: SolfegeSystem = v.solfegeSystem === "fixed" ? "fixed" : "movable";
  const solfegeStyle: SolfegeStyle = v.solfegeStyle === "syllable" ? "syllable" : "number";

  return { strictSpelling: v.strictSpelling === true, labels, solfegeSystem, solfegeStyle };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, {
    strictSpelling: settings.strictSpelling,
    labels: settings.labels,
    solfegeSystem: settings.solfegeSystem,
    solfegeStyle: settings.solfegeStyle,
  });
}
