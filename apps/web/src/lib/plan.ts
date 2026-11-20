import { dateKeyOf, type Tab } from "@guitar/core";

/** 「今天自己加的」那几条练习（v0.102.0）。 */
export const PLAN_KEY = "guitar.plan.v1";

export interface PlanExtra {
  id: string;
  /** 加进哪一天的计划；只留当天，第二天自动没了。 */
  date: string;
  title: string;
  tab: Tab;
  meter: string;
  bpm: number;
  /** 从练习库加进来的那一条属于哪个阶段（v0.107.0）；别处加进来的没有这个字段。 */
  stage?: number;
  /** 从哪一套组合加进来的（v0.115.0）——列表里同一套的条目就能归到一起。 */
  setName?: string;
  addedAt: number;
}

/** 一天最多加几条——加太多等于没有计划。 */
const MAX_PER_DAY = 6;

function isTab(value: unknown): value is Tab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<Tab>;
  return (
    typeof tab.beatsPerBar === "number" &&
    typeof tab.bars === "number" &&
    Array.isArray(tab.notes) &&
    tab.notes.every(
      (note) =>
        note &&
        typeof note.s === "number" &&
        typeof note.f === "number" &&
        typeof note.beat === "number" &&
        typeof note.dur === "number",
    )
  );
}

function parse(raw: unknown): PlanExtra[] {
  if (!Array.isArray(raw)) return [];
  const list: PlanExtra[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const extra = item as Partial<PlanExtra>;
    if (typeof extra.id !== "string" || typeof extra.date !== "string") continue;
    if (!isTab(extra.tab)) continue;
    list.push({
      id: extra.id,
      date: extra.date,
      title: typeof extra.title === "string" ? extra.title : "自己加的练习",
      tab: extra.tab,
      meter: typeof extra.meter === "string" ? extra.meter : `${extra.tab.beatsPerBar}/4`,
      bpm: typeof extra.bpm === "number" && extra.bpm > 0 ? Math.min(200, Math.round(extra.bpm)) : 70,
      ...(typeof extra.stage === "number" && extra.stage >= 0 && extra.stage < 6
        ? { stage: Math.round(extra.stage) }
        : {}),
      ...(typeof extra.setName === "string" && extra.setName.trim()
        ? { setName: extra.setName.trim().slice(0, 12) }
        : {}),
      addedAt: typeof extra.addedAt === "number" ? extra.addedAt : 0,
    });
  }
  return list;
}

function readAll(): PlanExtra[] {
  try {
    return parse(JSON.parse(localStorage.getItem(PLAN_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeAll(list: PlanExtra[]): PlanExtra[] {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(list));
  } catch {
    // 存不下就算了：这几条只是今天顺手加的，不影响计划本身。
  }
  return list;
}

/** 今天自己加的那几条，按加入顺序。 */
export function loadExtras(today: string = dateKeyOf(new Date())): PlanExtra[] {
  return readAll()
    .filter((item) => item.date === today)
    .sort((a, b) => a.addedAt - b.addedAt);
}

/** 加一条进今天的计划；同一条（同标题同谱）已经加过就不重复加。 */
export function addExtra(
  input: {
    title: string;
    tab: Tab;
    meter: string;
    bpm: number;
    stage?: number;
    setName?: string;
  },
  today: string = dateKeyOf(new Date()),
): PlanExtra[] {
  const all = readAll().filter((item) => item.date === today);
  const same = all.find((item) => item.title === input.title);
  if (same) return all;
  // 时间戳既是 id 也是排序键（v0.114.0）：一批一起加进来时 `Date.now()` 可能是同一毫秒，
  // 那样 id 会撞、`addedAt` 也分不出先后（组合一次加 3 条就踩到）。至少比上一条大 1。
  const stamp = Math.max(Date.now(), (all[all.length - 1]?.addedAt ?? 0) + 1);
  const extra: PlanExtra = {
    id: `extra-${stamp.toString(36)}`,
    date: today,
    title: input.title,
    tab: input.tab,
    meter: input.meter,
    bpm: input.bpm,
    ...(typeof input.stage === "number" ? { stage: input.stage } : {}),
    ...(typeof input.setName === "string" && input.setName.trim()
      ? { setName: input.setName.trim().slice(0, 12) }
      : {}),
    addedAt: stamp,
  };
  const next = [...all, extra].slice(-MAX_PER_DAY);
  return writeAll([...readAll().filter((item) => item.date !== today), ...next]);
}

/** 删掉一条；顺手清掉不是今天的旧记录。 */
export function removeExtra(id: string, today: string = dateKeyOf(new Date())): PlanExtra[] {
  const rest = readAll().filter((item) => item.id !== id);
  const next = rest.filter((item) => item.date === today);
  writeAll(next);
  return next;
}

/**
 * 调整今天自己加的那几条的先后（v0.105.0）。
 *
 * 顺序就是 `addedAt` 的顺序（`loadExtras()` 按它排），所以这里把整排重排后
 * 重新发一遍递增的 `addedAt`——不用额外加一个 `order` 字段，也不会和旧的记录打架。
 */
export function moveExtra(
  id: string,
  delta: number,
  today: string = dateKeyOf(new Date()),
): PlanExtra[] {
  const all = readAll().filter((item) => item.date === today);
  const from = all.findIndex((item) => item.id === id);
  if (from < 0) return all;
  const to = Math.min(all.length - 1, Math.max(0, from + delta));
  if (to === from) return all;
  const list = [...all];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  const base = all.reduce((min, item) => Math.min(min, item.addedAt || Date.now()), Date.now());
  const stamped = list.map((item, index) => ({ ...item, addedAt: base + index }));
  writeAll(stamped);
  return stamped;
}

/** 拖拽排序：按给定的 id 顺序重排（v0.105.0）。 */
export function reorderExtras(
  ids: string[],
  today: string = dateKeyOf(new Date()),
): PlanExtra[] {
  const all = readAll().filter((item) => item.date === today);
  const byId = new Map(all.map((item) => [item.id, item]));
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is PlanExtra => Boolean(item));
  for (const item of all) if (!ids.includes(item.id)) ordered.push(item);
  const base = all.reduce((min, item) => Math.min(min, item.addedAt || Date.now()), Date.now());
  const stamped = ordered.map((item, index) => ({ ...item, addedAt: base + index }));
  writeAll(stamped);
  return stamped;
}

/** 哪些分组被收起来了（v0.110.0）——纯界面状态，和计划本身无关。 */
const CLOSED_KEY = "guitar.extras.closed.v1";

/** 只认 `stage-N` / `set-名字` / `other` 这几种键，其余一律当没写过。 */
function isGroupKey(key: string): boolean {
  return key === "other" || /^stage-[0-9]$/.test(key) || /^set-.+$/.test(key);
}

export function loadClosedGroups(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    const closed: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === true && isGroupKey(key)) closed[key] = true;
    }
    return closed;
  } catch {
    return {};
  }
}

export function saveClosedGroups(closed: Record<string, boolean>): void {
  try {
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(closed)) if (value && isGroupKey(key)) next[key] = true;
    if (Object.keys(next).length === 0) localStorage.removeItem(CLOSED_KEY);
    else localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
  } catch {
    // 存不下就还是默认全展开，不影响练习。
  }
}

/**
 * 今天练过的那几条的**标题**（v0.113.0）。
 *
 * 为什么按标题记：一套组合里存的是标题 + 谱（没有 id），而加餐的 id 是运行时生成的；
 * 另外「练过」的那一条可能已经从计划里删掉了，光看计划表就丢了。只留当天，第二天清空。
 */
const DONE_KEY = "guitar.plan.done.v1";

export function loadDoneTitles(today: string = dateKeyOf(new Date())): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    if (record.date !== today || !Array.isArray(record.titles)) return [];
    return record.titles.filter((title): title is string => typeof title === "string");
  } catch {
    return [];
  }
}

export function markDoneTitle(title: string, today: string = dateKeyOf(new Date())): void {
  const clean = title.trim();
  if (!clean) return;
  const titles = loadDoneTitles(today);
  if (titles.includes(clean)) return;
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify({ date: today, titles: [...titles, clean] }));
  } catch {
    // 存不下就下次多点一条，不影响练习。
  }
}

/** 撤回「今天练过」这一笔（v0.116.0）：点那枚标签时用，免得「只加没练过的」还把它当练过。 */
export function unmarkDoneTitle(title: string, today: string = dateKeyOf(new Date())): void {
  const clean = title.trim();
  if (!clean) return;
  const titles = loadDoneTitles(today);
  if (!titles.includes(clean)) return;
  try {
    const rest = titles.filter((item) => item !== clean);
    if (rest.length === 0) localStorage.removeItem(DONE_KEY);
    else localStorage.setItem(DONE_KEY, JSON.stringify({ date: today, titles: rest }));
  } catch {
    // 同上：撤不掉只是多记了一笔，练习本身不受影响。
  }
}
