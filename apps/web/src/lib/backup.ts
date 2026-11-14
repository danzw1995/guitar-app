import { isValidDateKey } from "@guitar/core";

/**
 * 数据备份：把本机 localStorage 里 `guitar.*` 的几把键导出成一个 JSON，
 * 导入时**按记录合并**（不是覆盖）——换设备或清缓存之前存一份。
 *
 * 合并规则（都是「留更好的那个」，不会因为导入而丢成绩）：
 * - 关卡进度：星多的赢，星一样比最快全对用时；
 * - 每日挑战：星多的赢；
 * - 练习打卡：分钟取大、练过的条目取并集、stage/bpmMax 取大；
 * - 跟练成绩：bestBpm / sessions / minutes 取大，lastAt 取更晚的；
 * - 我的谱：按 id 去重，最多留 40 条（按创建时间取新的）；
 * - 今天跳过的练习：同一天取并集（不因为导入把「今天不想练」又冒出来）；
 * - 这一周先不练：同一条取更晚的截止日（不会因为导入提前恢复）；
 * - 设置 / 音量 / 新手引导：以导入的为准（换设备时要恢复的就是这些）。
 */

export const BACKUP_KEYS = [
  "guitar.progress.v1",
  "guitar.settings.v1",
  "guitar.daily.v1",
  "guitar.practice.v1",
  "guitar.rhythm.v1",
  "guitar.scores.v1",
  "guitar.audio.v1",
  "guitar.onboarded.v1",
  "guitar.skips.v1",
  "guitar.pauses.v1",
] as const;

export type BackupKey = (typeof BACKUP_KEYS)[number];

export interface BackupFile {
  app: "guitar-lab";
  version: 1;
  exportedAt: string;
  data: Partial<Record<BackupKey, unknown>>;
}

export interface BackupSummary {
  levels: number;
  practiceDays: number;
  rhythmItems: number;
  scores: number;
}

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** 导出：读 localStorage，坏值直接跳过（备份不因为一条坏数据整个失败）。 */
export function buildBackup(now: Date = new Date()): BackupFile {
  const data: BackupFile["data"] = {};
  for (const key of BACKUP_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      data[key] = JSON.parse(raw) as unknown;
    } catch {
      // 坏 JSON 就不进备份，其余照常导出。
    }
  }
  return { app: "guitar-lab", version: 1, exportedAt: now.toISOString(), data };
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `guitar-lab-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** 读进来的东西是不是一份备份；不是就抛一句人话。 */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("这不是一个 JSON 文件");
  }
  if (!isDict(parsed) || parsed.app !== "guitar-lab" || !isDict(parsed.data)) {
    throw new Error("这不像 Guitar Lab 的备份（缺少 app / data）");
  }
  return {
    app: "guitar-lab",
    version: 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    data: parsed.data as BackupFile["data"],
  };
}

/** 关卡进度 / 每日挑战共用同一套形状：星多的赢，星一样比用时。 */
function mergeProgressMap(current: unknown, incoming: unknown): Dict {
  const merged: Dict = { ...(isDict(current) ? current : {}) };
  if (!isDict(incoming)) return merged;
  for (const [id, value] of Object.entries(incoming)) {
    if (!isDict(value)) continue;
    const mine = merged[id];
    if (!isDict(mine)) {
      merged[id] = value;
      continue;
    }
    const myStars = num(mine.stars);
    const theirStars = num(value.stars);
    const myBest = num(mine.bestMs, Number.POSITIVE_INFINITY);
    const theirBest = num(value.bestMs, Number.POSITIVE_INFINITY);
    const better =
      theirStars > myStars || (theirStars === myStars && theirBest < myBest);
    if (better) merged[id] = value;
  }
  return merged;
}

function mergePracticeLog(current: unknown, incoming: unknown): Dict {
  const merged: Dict = { ...(isDict(current) ? current : {}) };
  if (!isDict(incoming)) return merged;
  for (const [date, value] of Object.entries(incoming)) {
    if (!isValidDateKey(date) || !isDict(value)) continue;
    const mine = merged[date];
    if (!isDict(mine)) {
      merged[date] = value;
      continue;
    }
    const done = new Set<string>();
    for (const list of [mine.done, value.done]) {
      if (!Array.isArray(list)) continue;
      for (const id of list) if (typeof id === "string") done.add(id);
    }
    merged[date] = {
      minutes: Math.max(num(mine.minutes), num(value.minutes)),
      stage: Math.max(num(mine.stage), num(value.stage)),
      done: [...done],
      feel: mine.feel ?? value.feel,
      goal: mine.goal ?? value.goal,
      bpmMax: Math.max(num(mine.bpmMax), num(value.bpmMax)) || undefined,
    };
  }
  return merged;
}

function mergeRhythm(current: unknown, incoming: unknown): Dict {
  const merged: Dict = { ...(isDict(current) ? current : {}) };
  if (!isDict(incoming)) return merged;
  for (const [id, value] of Object.entries(incoming)) {
    if (!isDict(value)) continue;
    const mine = merged[id];
    if (!isDict(mine)) {
      merged[id] = value;
      continue;
    }
    const lastAt = [mine.lastAt, value.lastAt]
      .filter((item): item is string => typeof item === "string")
      .sort()
      .pop();
    merged[id] = {
      bestBpm: Math.max(num(mine.bestBpm), num(value.bestBpm)),
      sessions: Math.max(num(mine.sessions), num(value.sessions)),
      minutes: Math.max(num(mine.minutes), num(value.minutes)),
      lastAt: lastAt ?? "",
    };
  }
  return merged;
}

function mergeScores(current: unknown, incoming: unknown): unknown[] {
  const list = [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].filter(isDict);
  const byId = new Map<string, Dict>();
  for (const item of list) {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    const mine = byId.get(id);
    if (!mine) {
      byId.set(id, item);
      continue;
    }
    // 同一条谱：哪份有图就用哪份（图比原文重）
    byId.set(id, { ...mine, ...item, image: item.image ?? mine.image });
  }
  return [...byId.values()]
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, 40);
}

/** 跳过表：同一天取并集（导入不会把「今天不想练」的那条又变回来）。 */
function mergeSkips(a: unknown, b: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const source of [a, b]) {
    if (!isDict(source)) continue;
    for (const [date, value] of Object.entries(source)) {
      if (!isValidDateKey(date) || !Array.isArray(value)) continue;
      const ids = new Set(out[date] ?? []);
      for (const id of value) {
        if (typeof id === "string" && id !== "") ids.add(id);
      }
      if (ids.size) out[date] = [...ids];
    }
  }
  return out;
}

/** 压后表：同一条取更晚的「到哪天为止」（不会因为导入把恢复时间提前）。 */
function mergePauses(a: unknown, b: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of [a, b]) {
    if (!isDict(source)) continue;
    for (const [id, until] of Object.entries(source)) {
      if (id === "" || typeof until !== "string" || !isValidDateKey(until)) continue;
      const seen = out[id];
      if (!seen || until > seen) out[id] = until;
    }
  }
  return out;
}

/** 纯函数：把导入的备份合进当前的，返回合并后的备份与摘要。 */
export function mergeBackup(
  current: BackupFile,
  incoming: BackupFile,
): { next: BackupFile; summary: BackupSummary } {
  const a = current.data;
  const b = incoming.data;
  const data: BackupFile["data"] = { ...a };

  const progress = mergeProgressMap(a["guitar.progress.v1"], b["guitar.progress.v1"]);
  if (Object.keys(progress).length) data["guitar.progress.v1"] = progress;

  const daily = mergeProgressMap(a["guitar.daily.v1"], b["guitar.daily.v1"]);
  if (Object.keys(daily).length) data["guitar.daily.v1"] = daily;

  const practice = mergePracticeLog(a["guitar.practice.v1"], b["guitar.practice.v1"]);
  if (Object.keys(practice).length) data["guitar.practice.v1"] = practice;

  const rhythm = mergeRhythm(a["guitar.rhythm.v1"], b["guitar.rhythm.v1"]);
  if (Object.keys(rhythm).length) data["guitar.rhythm.v1"] = rhythm;

  const scores = mergeScores(a["guitar.scores.v1"], b["guitar.scores.v1"]);
  if (scores.length) data["guitar.scores.v1"] = scores;

  const skips = mergeSkips(a["guitar.skips.v1"], b["guitar.skips.v1"]);
  if (Object.keys(skips).length) data["guitar.skips.v1"] = skips;

  const pauses = mergePauses(a["guitar.pauses.v1"], b["guitar.pauses.v1"]);
  if (Object.keys(pauses).length) data["guitar.pauses.v1"] = pauses;

  for (const key of ["guitar.settings.v1", "guitar.audio.v1", "guitar.onboarded.v1"] as const) {
    if (b[key] !== undefined) data[key] = b[key];
  }

  return {
    next: { app: "guitar-lab", version: 1, exportedAt: new Date().toISOString(), data },
    summary: {
      levels: Object.keys(progress).length,
      practiceDays: Object.keys(practice).length,
      rhythmItems: Object.keys(rhythm).length,
      scores: scores.length,
    },
  };
}

/** 把合并结果写回 localStorage（只在浏览器里调用）。 */
export function applyBackup(backup: BackupFile): void {
  for (const key of BACKUP_KEYS) {
    const value = backup.data[key];
    try {
      if (value === undefined) continue;
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 配额满了就停在这一把键上，前面写进去的仍然有效。
    }
  }
}
