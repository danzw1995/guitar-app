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
 * - 和弦转换：跟跟练同一套规则（最快速度取高、日期取晚）；
 * - 今日加餐：按 id 去重（两边都留，最多 20 条）；
 * - 存的组合：同名以更新那份为准（跟 `saveSet` 的覆盖语义一致），最多 5 套；
 * - 今天练过哪几条：同一天取并集，不同天取更晚的；
 * - 存的视角：按 id 去重、同名只留一枚，最多 5 个；
 * - 收起的分组：哪边收起就算收起（不会因为导入又弹开）；
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
  "guitar.chords.v1",
  "guitar.goals.v1",
  "guitar.ear.v1",
  "guitar.patterns.v1",
  "guitar.steady.v1",
  "guitar.steady.loops.v1",
  "guitar.plan.v1",
  "guitar.plan.sets.v1",
  "guitar.plan.done.v1",
  "guitar.stats.views.v1",
  "guitar.extras.closed.v1",
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

/** 按日期合并一条曲线：同一天用 pick 取更极端的那个值，按日期排好、只留 cap 个。 */
function mergePoints(
  current: unknown,
  incoming: unknown,
  field: string,
  pick: (a: number, b: number) => number,
  cap: number,
): Dict[] {
  const map = new Map<string, Dict>();
  const list = [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ];
  for (const raw of list) {
    if (!isDict(raw)) continue;
    const date = typeof raw.date === "string" ? raw.date : "";
    const value = num(raw[field], Number.NaN);
    if (!date || !Number.isFinite(value)) continue;
    const previous = map.get(date);
    if (!previous) {
      map.set(date, { ...raw, date });
      continue;
    }
    // 哪边极端就整条用哪边：只换数值会把胜出那一天的 fromBar / toBar 换成功另一边（v0.144.0）
    const keepPrevious = num(previous[field], Number.NaN) === pick(num(previous[field]), value);
    map.set(date, keepPrevious ? { ...previous, date } : { ...previous, ...raw, date });
  }
  return [...map.values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-cap);
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
    const stdevs = [num(mine.steadyStdev), num(value.steadyStdev)].filter((item) => item > 0);
    merged[id] = {
      ...mine,
      bestBpm: Math.max(num(mine.bestBpm), num(value.bestBpm)),
      sessions: Math.max(num(mine.sessions), num(value.sessions)),
      minutes: Math.max(num(mine.minutes), num(value.minutes)),
      lastAt: lastAt ?? "",
      history: mergePoints(mine.history, value.history, "bpm", Math.max, 60),
      steadyHistory: mergePoints(mine.steadyHistory, value.steadyHistory, "stdevMs", Math.min, 24),
      ...(stdevs.length ? { steadyStdev: Math.min(...stdevs) } : {}),
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

/** 每周目标：同一周以导入的为准（改目标多半是最近一次说了算），坏周次与坏数字跳过。 */
function mergeGoals(a: unknown, b: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const source of [a, b]) {
    if (!isDict(source)) continue;
    for (const [week, minutes] of Object.entries(source)) {
      if (!isValidDateKey(week)) continue;
      const value = Number(minutes);
      if (!Number.isFinite(value) || value <= 0) continue;
      out[week] = Math.min(600, Math.round(value));
    }
  }
  return out;
}

/** 听辨记录：轮数、最好成绩取大的；两种题型取练得多的那一份（对错数不累加，否则会超过总题数）。 */
/**
 * 合并「我存的进行」：按 `id` 去重，两边都留着（谁也别丢），最多 40 条。
 *
 * 这些是自己存下来的素材，不是计数器——没有「取大取小」的道理，合并就是并集。
 */
function mergePatterns(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.id !== "string") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out
    .sort((left, right) => Number((right as { createdAt?: number }).createdAt ?? 0) - Number((left as { createdAt?: number }).createdAt ?? 0))
    .slice(0, 40);
}

function mergeSteady(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.id !== "string") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out.slice(-24);
}

function mergeLoops(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.id !== "string") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  // 按出现顺序留着（本机的在前、导入的在后），只留最近 40 条
  return out.slice(-40);
}

function mergeEar(a: unknown, b: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const left = isDict(a) ? a : {};
  const right = isDict(b) ? b : {};

  const rounds = Math.max(Number(left.rounds) || 0, Number(right.rounds) || 0);
  const best = Math.max(Number(left.best) || 0, Number(right.best) || 0);
  const lastAt = [left.lastAt, right.lastAt]
    .filter((value): value is string => typeof value === "string" && isValidDateKey(value))
    .sort()
    .pop();

  const byKind: Record<string, { correct: number; total: number }> = {};
  for (const source of [left.byKind, right.byKind]) {
    if (!isDict(source)) continue;
    for (const [kind, value] of Object.entries(source)) {
      if (!isDict(value)) continue;
      const correct = Math.max(0, Math.round(Number(value.correct) || 0));
      const total = Math.max(0, Math.round(Number(value.total) || 0));
      if (total === 0) continue;
      const prev = byKind[kind];
      // 同一题型两边都有：取练得多的那一份，不把对错数加起来（加起来会超过总题数）
      if (!prev || total > prev.total) byKind[kind] = { correct: Math.min(correct, total), total };
    }
  }

  if (rounds > 0) out.rounds = Math.round(rounds);
  if (best > 0) out.best = Math.round(best);
  if (lastAt) out.lastAt = lastAt;
  if (Object.keys(byKind).length) out.byKind = byKind;
  return out;
}

/** 今日加餐：按 id 去重，两边都留（读的时候按当天筛，历史日期留着也无害）。 */
function mergePlanExtras(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.id !== "string" || item.id === "") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out
    .sort(
      (left, right) =>
        num((left as { addedAt?: number }).addedAt) - num((right as { addedAt?: number }).addedAt),
    )
    .slice(-20);
}

/** 存的组合：同一个名字以更新那份为准（跟 `saveSet` 的覆盖语义一致），最多 5 套。 */
function mergePlanSets(a: unknown, b: unknown): unknown[] {
  const byName = new Map<string, Dict>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.name !== "string") continue;
      const name = item.name.trim().slice(0, 12);
      if (name === "") continue;
      const mine = byName.get(name);
      if (!mine || num(item.addedAt) >= num(mine.addedAt)) byName.set(name, item);
    }
  }
  return [...byName.values()]
    .sort((left, right) => num(left.addedAt) - num(right.addedAt))
    .slice(-5);
}

/** 今天练过哪几条：同一天取并集；不是同一天就以更晚的那份为准（这个标记只对当天有意义）。 */
function mergePlanDone(a: unknown, b: unknown): Dict {
  const left = isDict(a) ? a : {};
  const right = isDict(b) ? b : {};
  const dateOf = (source: Dict): string =>
    typeof source.date === "string" && isValidDateKey(source.date) ? source.date : "";
  const date = dateOf(left) >= dateOf(right) ? dateOf(left) : dateOf(right);
  if (date === "") return {};
  const titles = new Set<string>();
  for (const source of [left, right]) {
    if (dateOf(source) !== date || !Array.isArray(source.titles)) continue;
    for (const title of source.titles) {
      if (typeof title === "string" && title !== "") titles.add(title);
    }
  }
  return { date, titles: [...titles] };
}

/** 存下的视角：按 id 去重，同一个名字只留一枚，最多 5 个。 */
function mergeStatsViews(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const source of [a, b]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!isDict(item) || typeof item.id !== "string" || item.id === "") continue;
      if (ids.has(item.id)) continue;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (name !== "" && names.has(name)) continue;
      ids.add(item.id);
      if (name !== "") names.add(name);
      out.push(item);
    }
  }
  return out
    .sort((left, right) => num((left as { addedAt?: number }).addedAt) - num((right as { addedAt?: number }).addedAt))
    .slice(-5);
}

/** 收起的分组：哪边收起就算收起（不会因为导入又弹开）。 */
function mergeClosedGroups(a: unknown, b: unknown): Record<string, true> {
  const out: Record<string, true> = {};
  for (const source of [a, b]) {
    if (!isDict(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === true) out[key] = true;
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

  // 和弦转换跟跟练同一套形状：最快速度取高的，日期取晚的
  const chords = mergeRhythm(a["guitar.chords.v1"], b["guitar.chords.v1"]);
  if (Object.keys(chords).length) data["guitar.chords.v1"] = chords;

  // 每周目标：同一周以导入的为准（改目标多半是最近一次说了算）
  const goals = mergeGoals(a["guitar.goals.v1"], b["guitar.goals.v1"]);
  if (Object.keys(goals).length) data["guitar.goals.v1"] = goals;

  // 听辨记录：取两边更全的那一份
  const ear = mergeEar(a["guitar.ear.v1"], b["guitar.ear.v1"]);
  if (Object.keys(ear).length) data["guitar.ear.v1"] = ear;

  // 我存的进行：按 id 合并（两边都是自己存的，谁也别丢）
  const steady = mergeSteady(a["guitar.steady.v1"], b["guitar.steady.v1"]);
  if (steady.length) data["guitar.steady.v1"] = steady;
  const loops = mergeLoops(a["guitar.steady.loops.v1"], b["guitar.steady.loops.v1"]);
  if (loops.length) data["guitar.steady.loops.v1"] = loops;
  else delete data["guitar.steady.loops.v1"];
  const patterns = mergePatterns(a["guitar.patterns.v1"], b["guitar.patterns.v1"]);
  if (patterns.length) data["guitar.patterns.v1"] = patterns;

  // 今日计划 / 组合 / 今天练过哪几条：都是自己攒的，合并就是「并集 + 同名以新的为准」
  // 合完是空的就把键删掉——`data` 是从本机那份摊开的，留着原样会把坏数据又写回去
  const extras = mergePlanExtras(a["guitar.plan.v1"], b["guitar.plan.v1"]);
  if (extras.length) data["guitar.plan.v1"] = extras;
  else delete data["guitar.plan.v1"];

  const planSets = mergePlanSets(a["guitar.plan.sets.v1"], b["guitar.plan.sets.v1"]);
  if (planSets.length) data["guitar.plan.sets.v1"] = planSets;
  else delete data["guitar.plan.sets.v1"];

  const planDone = mergePlanDone(a["guitar.plan.done.v1"], b["guitar.plan.done.v1"]);
  if (Object.keys(planDone).length) data["guitar.plan.done.v1"] = planDone;
  else delete data["guitar.plan.done.v1"];

  const views = mergeStatsViews(a["guitar.stats.views.v1"], b["guitar.stats.views.v1"]);
  if (views.length) data["guitar.stats.views.v1"] = views;
  else delete data["guitar.stats.views.v1"];

  const closed = mergeClosedGroups(a["guitar.extras.closed.v1"], b["guitar.extras.closed.v1"]);
  if (Object.keys(closed).length) data["guitar.extras.closed.v1"] = closed;
  else delete data["guitar.extras.closed.v1"];

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
