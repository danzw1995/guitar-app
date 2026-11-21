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
/** 这一周先不练：id -> 到哪天为止（含当天）。 */
export const PAUSES_KEY = "guitar.pauses.v1";
/** 每周目标的历史：周一 -> 那一周的分钟目标（改目标不会重判过去的周）。 */
export const GOALS_KEY = "guitar.goals.v1";
/** 听辨练习的记录：练了几轮、最好一轮对几道、两种题型各自的对错数。 */
export const EAR_KEY = "guitar.ear.v1";
/** v0.2.x 只存每关最佳时间，迁移时读一次。 */
const LEGACY_BEST_PREFIX = "guitar.best.";

export type DailyMap = Record<string, LevelProgress>;

/** 指板上显示什么：音名 / 唱名 / 两者。 */
export type LabelMode = "name" | "solfege" | "both";

/** 主题：跟随系统 / 一直深色 / 一直浅色（v0.136.0）。 */
export type ThemeMode = "auto" | "dark" | "light";

export interface Settings {
  /** 严格拼写：拼错算错，拿不到 2 星以上。 */
  strictSpelling: boolean;
  labels: LabelMode;
  solfegeSystem: SolfegeSystem;
  solfegeStyle: SolfegeStyle;
  /** 每周目标分钟数；0 = 不设目标（统计页就不画进度条）。 */
  weeklyGoal: number;
  /** 调音器上次用的那套调弦（`TUNING_PRESETS` 的 id，认不出来当标准）。 */
  tuning: string;
  /** 深色 / 浅色 / 跟随系统。 */
  theme: ThemeMode;
  /** 「稳不稳」上次用的速度（40–200）。 */
  steadyBpm: number;
  /** 「稳不稳」清空时上次选的那档（v0.142.0）：`all` / 5 / 10 */
  steadyClear: "all" | 5 | 10;
  /** 「稳不稳」上次数的小节数。 */
  steadyBars: number;
}

export const DEFAULT_SETTINGS: Settings = {
  strictSpelling: false,
  labels: "name",
  solfegeSystem: "movable",
  solfegeStyle: "number",
  weeklyGoal: 0,
  tuning: "standard",
  theme: "auto",
  steadyBpm: 70,
  steadyClear: "all",
  steadyBars: 4,
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
  /**
   * 这一段里最卡的一处（v0.99.0）：跟练时点级数方块单独去练点得最多的那一小节。
   * 只记「用户自己标出来的」，不是猜的。
   */
  hardest?: { bar: number; degree: number; name: string; count: number; at?: string };
  /**
   * 「今天自己加的」那一条的名字（v0.104.0）。
   *
   * 加餐的 id 是运行时生成的（`p:extra-…`），计划表第二天就清空了；名字不跟着
   * 记录走的话，统计页「最卡的地方」过一天就只剩一串 id。
   */
  title?: string;
  /**
   * 单独练过的几处（v0.113.0）：跟练回执里点「只练这一处」时记一次。
   * 和 `hardest.count`（跟练时点级数方块的次数）分开算——一个是「卡」，一个是「回头练」。
   */
  spots?: SpotDrill[];
  /**
   * 这条练习「稳不稳」弹到过的最好成绩（v0.142.0）：标准差最小值，毫秒。
   * 只有从练习页那条「顺手弹一遍」进去弹的才写回来——面板里直接弹的不知道对应哪一条。
   */
  steadyStdev?: number;
  /**
   * 上次圈住练的那一段（v0.132.0）：第几小节到第几小节。
   *
   * 一圈几小节就是那天的练法，下次打开跟练直接照着圈回去，不用再从头挑一遍。
   */
  seg?: { from: number; to: number };
}

/** 某一处（第 N 小节第 M 级）单独练过几次。 */
export interface SpotDrill {
  bar: number;
  degree: number;
  name: string;
  times: number;
  lastAt: string;
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

/** 一张「id → 成绩」的表：跟练与和弦转换共用同一套形状。 */
/** 「最卡的一处」只收站得住的数：小节 ≥1、级数 0–7、名字是字符串、次数 ≥1。 */
function parseHardest(
  value: unknown,
): { bar: number; degree: number; name: string; count: number; at?: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const bar = Number(item.bar);
  const degree = Number(item.degree);
  const count = Number(item.count);
  if (!Number.isFinite(bar) || bar < 1) return undefined;
  if (!Number.isFinite(degree) || degree < 0 || degree > 7) return undefined;
  if (!Number.isFinite(count) || count < 1) return undefined;
  return {
    bar: Math.round(bar),
    degree: Math.round(degree),
    name: typeof item.name === "string" ? item.name : "",
    count: Math.round(count),
    // 是哪一天卡住的（v0.129.0）：曲线上那天的点要单独标出来。老记录没有就省掉。
    ...(typeof item.at === "string" && isValidDateKey(item.at) ? { at: item.at } : {}),
  };
}

/** 单独练过的那几处（v0.113.0）：只收站得住的行，按时间倒序留最近 6 处。 */
function parseSpots(value: unknown): SpotDrill[] {
  if (!Array.isArray(value)) return [];
  const spots: SpotDrill[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const bar = Number(item.bar);
    const degree = Number(item.degree);
    const times = Number(item.times);
    if (!Number.isFinite(bar) || bar < 1) continue;
    if (!Number.isFinite(degree) || degree < 0 || degree > 7) continue;
    if (!Number.isFinite(times) || times < 1) continue;
    spots.push({
      bar: Math.round(bar),
      degree: Math.round(degree),
      name: typeof item.name === "string" ? item.name : "",
      times: Math.round(times),
      lastAt: typeof item.lastAt === "string" ? item.lastAt : "",
    });
  }
  return spots.slice(-6);
}

/** 上次圈住练的那一段（v0.132.0）：两头都得是 1 起的小节号，且 from 不大于 to。 */
function parseSeg(value: unknown): { from: number; to: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const from = Number(item.from);
  const to = Number(item.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 1 || to < from || to > 99) return null;
  return { from, to };
}

function parseRecords(raw: unknown): RhythmRecords {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const records: RhythmRecords = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const bestBpm = Number(item.bestBpm);
    const spots = parseSpots(item.spots);
    const seg = parseSeg(item.seg);
    const steadyStdevRaw = Number(item.steadyStdev);
    const steadyStdev =
      Number.isFinite(steadyStdevRaw) && steadyStdevRaw > 0 && steadyStdevRaw < 500
        ? Math.round(steadyStdevRaw * 10) / 10
        : null;
    // 只单独练过某一处、还没整段练完时 bestBpm 会是 0——这种记录也得留住（v0.113.0）
    if (!Number.isFinite(bestBpm) || bestBpm < 0) continue;
    if (bestBpm <= 0 && spots.length === 0 && steadyStdev === null) continue;
    records[id] = {
      bestBpm: Math.round(bestBpm),
      sessions: Number.isFinite(Number(item.sessions)) ? Number(item.sessions) : 1,
      minutes: Number.isFinite(Number(item.minutes)) ? Math.max(0, Number(item.minutes)) : 0,
      lastAt: typeof item.lastAt === "string" ? item.lastAt : "",
      history: parseHistory(item.history),
      hardest: parseHardest(item.hardest),
      ...(spots.length ? { spots } : {}),
      ...(seg ? { seg } : {}),
      ...(steadyStdev !== null ? { steadyStdev } : {}),
      ...(typeof item.title === "string" && item.title.trim()
        ? { title: item.title.trim() }
        : {}),
    };
  }
  return records;
}

export function loadRhythm(): RhythmRecords {
  return parseRecords(readJson(RHYTHM_KEY));
}

/** 和弦转换的成绩：每组进行练到多快（v0.59.0 起）。 */
export const CHORDS_KEY = "guitar.chords.v1";

export function loadChords(): RhythmRecords {
  return parseRecords(readJson(CHORDS_KEY));
}

export function saveChords(records: RhythmRecords): void {
  writeJson(CHORDS_KEY, records);
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

/** 撤掉一条跳过（「撤销」用），那天没别的了就整天空着。 */
export function removeSkip(log: SkipLog, date: string, id: string): SkipLog {
  const ids = (log[date] ?? []).filter((item) => item !== id);
  const next = { ...log };
  if (ids.length === 0) delete next[date];
  else next[date] = ids;
  return next;
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

/** `id → 到哪天为止先不练`（含当天，日期格式 YYYY-MM-DD）。 */
export type PauseLog = Record<string, string>;

/** `周一 → 那一周的分钟目标`；只记设过目标的周，最早那周之前不算。 */
export type GoalLog = Record<string, number>;

export function loadGoals(): GoalLog {
  const raw = readJson(GOALS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const log: GoalLog = {};
  for (const [week, minutes] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDateKey(week)) continue;
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) continue;
    log[week] = Math.min(600, Math.round(value));
  }
  return log;
}

export function saveGoals(log: GoalLog): void {
  writeJson(GOALS_KEY, log);
}

/** 「这一周先不练」默认压后 7 天（含今天）。 */
const PAUSE_DAYS = 7;

export function loadPauses(today = dateKeyOf(new Date())): PauseLog {
  const raw = readJson(PAUSES_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const log: PauseLog = {};
  for (const [id, until] of Object.entries(raw as Record<string, unknown>)) {
    if (id === "" || typeof until !== "string" || !isValidDateKey(until)) continue;
    log[id] = until;
  }
  return prunePauses(log, today);
}

export function savePauses(log: PauseLog): void {
  writeJson(PAUSES_KEY, log);
}

/** 今天还压着的 id（`until` 到今天为止都算）。 */
export function pausedOf(log: PauseLog, today: string): Set<string> {
  const ids = new Set<string>();
  for (const [id, until] of Object.entries(log)) if (until >= today) ids.add(id);
  return ids;
}

/** 压后到 `today + days - 1`（默认 7 天，含今天）。 */
export function addPause(log: PauseLog, id: string, today: string, days = PAUSE_DAYS): PauseLog {
  return { ...log, [id]: addDays(today, days - 1) };
}

/** 撤掉压后（撤销 / 提前恢复）。 */
export function removePause(log: PauseLog, id: string): PauseLog {
  const next = { ...log };
  delete next[id];
  return next;
}

/** 过期的压后：释放后还留 7 天，用来算「压后那几天不攒紧迫度」，之后扔掉。 */
function prunePauses(log: PauseLog, today: string): PauseLog {
  const floor = addDays(today, -PAUSE_DAYS);
  const out: PauseLog = {};
  for (const [id, until] of Object.entries(log)) if (until >= floor) out[id] = until;
  return out;
}

/** `id → 释放日`：压后期间不算「多久没练」（含刚释放的那几天）。 */
export function pauseUntilOf(log: PauseLog): Map<string, string> {
  return new Map(Object.entries(log));
}

export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const v = raw as Record<string, unknown>;

  const labels: LabelMode =
    v.labels === "solfege" || v.labels === "both" ? v.labels : "name";
  const solfegeSystem: SolfegeSystem = v.solfegeSystem === "fixed" ? "fixed" : "movable";
  const solfegeStyle: SolfegeStyle = v.solfegeStyle === "syllable" ? "syllable" : "number";
  const goal = Number(v.weeklyGoal);
  const weeklyGoal = Number.isFinite(goal) && goal > 0 ? Math.min(600, Math.round(goal)) : 0;
  const tuning = typeof v.tuning === "string" && v.tuning !== "" ? v.tuning : "standard";
  const steadyClearRaw = v.steadyClear;
  const steadyClear: "all" | 5 | 10 =
    steadyClearRaw === 5 || steadyClearRaw === 10 ? steadyClearRaw : "all";
  const steadyBpmRaw = Number(v.steadyBpm);
  const steadyBpm = Number.isFinite(steadyBpmRaw) && steadyBpmRaw >= 40 && steadyBpmRaw <= 200
    ? Math.round(steadyBpmRaw)
    : DEFAULT_SETTINGS.steadyBpm;
  const steadyBarsRaw = Number(v.steadyBars);
  const steadyBars = [2, 4, 6, 8].includes(steadyBarsRaw) ? steadyBarsRaw : DEFAULT_SETTINGS.steadyBars;
  const theme: ThemeMode =
    v.theme === "dark" || v.theme === "light" ? v.theme : "auto";

  return {
    strictSpelling: v.strictSpelling === true,
    labels,
    solfegeSystem,
    solfegeStyle,
    weeklyGoal,
    tuning,
    steadyBpm,
    steadyClear,
    steadyBars,
    theme,
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, {
    strictSpelling: settings.strictSpelling,
    labels: settings.labels,
    solfegeSystem: settings.solfegeSystem,
    solfegeStyle: settings.solfegeStyle,
    weeklyGoal: settings.weeklyGoal,
    tuning: settings.tuning,
    steadyBpm: settings.steadyBpm,
    steadyClear: settings.steadyClear,
    steadyBars: settings.steadyBars,
    theme: settings.theme,
  });
}

/** 一种题型的累计对错。 */
export interface EarKindStats {
  correct: number;
  total: number;
}

export interface EarStats {
  /** 练过几轮。 */
  rounds: number;
  /** 一轮里最多对几道（每轮 8 道）。 */
  best: number;
  /** 最后一次练的日期。 */
  lastAt: string;
  /** 按天记的对错（v0.83.0 起），统计页用它画正确率曲线。 */
  days?: Record<string, EarKindStats>;
  byKind: Record<string, EarKindStats>;
}

const EMPTY_EAR: EarStats = { rounds: 0, best: 0, lastAt: "", byKind: {} };

export function loadEar(): EarStats {
  const raw = readJson(EAR_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_EAR, byKind: {} };
  const v = raw as Record<string, unknown>;

  const byKind: Record<string, EarKindStats> = {};
  const kinds = v.byKind && typeof v.byKind === "object" && !Array.isArray(v.byKind) ? (v.byKind as Record<string, unknown>) : {};
  for (const [kind, value] of Object.entries(kinds)) {
    if (kind === "" || !value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const correct = Math.max(0, Math.round(Number(entry.correct) || 0));
    const total = Math.max(0, Math.round(Number(entry.total) || 0));
    if (total === 0) continue;
    byKind[kind] = { correct: Math.min(correct, total), total };
  }

  // 按天记的那份：坏日期、坏数字直接跳过；只留最近 60 天
  const days: Record<string, EarKindStats> = {};
  const rawDays = v.days && typeof v.days === "object" && !Array.isArray(v.days) ? (v.days as Record<string, unknown>) : {};
  for (const [date, value] of Object.entries(rawDays)) {
    if (!isValidDateKey(date) || !value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const correct = Math.max(0, Math.round(Number(entry.correct) || 0));
    const total = Math.max(0, Math.round(Number(entry.total) || 0));
    if (total === 0) continue;
    days[date] = { correct: Math.min(correct, total), total };
  }
  const keptDays = Object.keys(days)
    .sort()
    .slice(-60)
    .reduce<Record<string, EarKindStats>>((acc, date) => {
      acc[date] = days[date];
      return acc;
    }, {});

  const rounds = Math.max(0, Math.round(Number(v.rounds) || 0));
  const best = Math.max(0, Math.round(Number(v.best) || 0));
  const lastAt = typeof v.lastAt === "string" && isValidDateKey(v.lastAt) ? v.lastAt : "";
  return { rounds, best, lastAt, days: keptDays, byKind };
}

export function saveEar(stats: EarStats): void {
  writeJson(EAR_KEY, stats);
}
