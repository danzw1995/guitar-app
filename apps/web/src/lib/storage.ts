import {
  addDays,
  dateKeyOf,
  fromLegacyBest,
  isValidDateKey,
  parseProgress,
  type BpmPoint,
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
/** 跟练记录：练习 id -> 最高速度与次数。 */
export const RHYTHM_KEY = "guitar.rhythm.v1";
/** 今天先不练的条目：日期 -> id 列表（只留最近 7 天）。 */
export const SKIPS_KEY = "guitar.skips.v1";
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

/** 跟练成绩：这条练习最快练到多少 BPM、练过几次。 */
export interface RhythmRecord {
  bestBpm: number;
  sessions: number;
  minutes: number;
  /** 最后一次练的日期（`YYYY-MM-DD`）。 */
  lastAt: string;
  /** 最高速度的变化：一天一个点，最多 60 个（v0.45.0 起记录）。 */
  history?: BpmPoint[];
}

export type RhythmRecords = Record<string, RhythmRecord>;

/** 曲线上的点只收合法日期与正数 BPM，按日期排好、最多留 60 个。 */
function parseHistory(value: unknown): BpmPoint[] {
  if (!Array.isArray(value)) return [];
  const points: BpmPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const point = raw as Record<string, unknown>;
    const date = typeof point.date === "string" ? point.date : "";
    const bpm = Number(point.bpm);
    if (!isValidDateKey(date) || !Number.isFinite(bpm) || bpm <= 0) continue;
    points.push({ date, bpm: Math.round(bpm) });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points.slice(-60);
}

export function loadRhythm(): RhythmRecords {
  const raw = readJson(RHYTHM_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const records: RhythmRecords = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const bestBpm = Number(item.bestBpm);
    if (!Number.isFinite(bestBpm) || bestBpm <= 0) continue;
    records[id] = {
      bestBpm: Math.round(bestBpm),
      sessions: Number.isFinite(Number(item.sessions)) ? Number(item.sessions) : 1,
      minutes: Number.isFinite(Number(item.minutes)) ? Math.max(0, Number(item.minutes)) : 0,
      lastAt: typeof item.lastAt === "string" ? item.lastAt : "",
      history: parseHistory(item.history),
    };
  }
  return records;
}

export function saveRhythm(records: RhythmRecords): void {
  writeJson(RHYTHM_KEY, records);
}

/** `日期 → 今天点了「换一条」的 id`。 */
export type SkipLog = Record<string, string[]>;

/** 只留最近 7 天：再早的跳过没有意义，也不需要一直占着存储。 */
const SKIP_DAYS = 7;

export function loadSkips(today = dateKeyOf(new Date())): SkipLog {
  const raw = readJson(SKIPS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const log: SkipLog = {};
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDateKey(date) || !Array.isArray(value)) continue;
    const ids = value.filter((id): id is string => typeof id === "string" && id !== "");
    if (ids.length === 0) continue;
    log[date] = ids;
  }
  return pruneSkips(log, today);
}

export function saveSkips(log: SkipLog): void {
  writeJson(SKIPS_KEY, log);
}

/** 那天点了「换一条」的 id（没有就是空集合）。 */
export function skipsOf(log: SkipLog, date: string): Set<string> {
  return new Set(log[date] ?? []);
}

/** 加一条跳过，返回新的表（不改原对象）。 */
export function addSkip(log: SkipLog, date: string, id: string): SkipLog {
  const ids = log[date] ?? [];
  if (ids.includes(id)) return log;
  return { ...log, [date]: [...ids, id] };
}

/** 去掉 `today` 往前 7 天以外的记录。 */
function pruneSkips(log: SkipLog, today: string): SkipLog {
  const keep = new Set<string>();
  for (let back = 0; back < SKIP_DAYS; back += 1) keep.add(addDays(today, -back));
  const out: SkipLog = {};
  for (const [date, ids] of Object.entries(log)) {
    if (keep.has(date)) out[date] = ids;
  }
  return out;
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
