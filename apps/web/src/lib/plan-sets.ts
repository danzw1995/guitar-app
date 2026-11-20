import { dateKeyOf, type Tab } from "@guitar/core";
import { addExtra, loadExtras, type PlanExtra } from "./plan";

/**
 * 「今天这一套」存成组合（v0.112.0）。
 *
 * 计划表每天清空，加餐本来是一次性的；但「先热身、再练这两小节、最后过一遍和弦」
 * 这种安排明天大概还想要一遍。存的是条目本身（谱 + 速度 + 拍号），不是 id——
 * 明天点一下就能把同一套重新加进当天的计划。
 */
export const SETS_KEY = "guitar.plan.sets.v1";

/** 最多存几套——再多就成第二个练习库了。 */
export const MAX_SETS = 5;

/** 一套里最多几条，和计划一天的上限对齐。 */
const MAX_ITEMS = 6;

export interface PlanSetItem {
  title: string;
  tab: Tab;
  meter: string;
  bpm: number;
  /** 从练习库加进来的那条属于哪个阶段（保留着，计划里还能按阶段分组）。 */
  stage?: number;
}

export interface PlanSet {
  id: string;
  name: string;
  items: PlanSetItem[];
  addedAt: number;
}

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

/** 名字截到 12 个字，空名字就不收。 */
export function cleanSetName(name: string): string {
  return name.trim().slice(0, 12);
}

function parseItem(raw: unknown): PlanSetItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PlanSetItem>;
  if (!isTab(item.tab)) return null;
  return {
    title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "这一条",
    tab: item.tab,
    meter: typeof item.meter === "string" ? item.meter : `${item.tab.beatsPerBar}/4`,
    bpm:
      typeof item.bpm === "number" && item.bpm > 0 ? Math.min(200, Math.round(item.bpm)) : 70,
    ...(typeof item.stage === "number" && item.stage >= 0 && item.stage < 6
      ? { stage: Math.round(item.stage) }
      : {}),
  };
}

function parse(raw: unknown): PlanSet[] {
  if (!Array.isArray(raw)) return [];
  const list: PlanSet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const set = item as Partial<PlanSet>;
    if (typeof set.id !== "string") continue;
    const name = typeof set.name === "string" ? cleanSetName(set.name) : "";
    if (!name) continue;
    const items = Array.isArray(set.items)
      ? set.items.map(parseItem).filter((one): one is PlanSetItem => Boolean(one))
      : [];
    if (items.length === 0) continue;
    list.push({
      id: set.id,
      name,
      items: items.slice(0, MAX_ITEMS),
      addedAt: typeof set.addedAt === "number" ? set.addedAt : 0,
    });
  }
  return list.sort((a, b) => a.addedAt - b.addedAt);
}

function persist(list: PlanSet[]): PlanSet[] {
  try {
    if (list.length === 0) localStorage.removeItem(SETS_KEY);
    else localStorage.setItem(SETS_KEY, JSON.stringify(list));
  } catch {
    // 存不下就当没存，不影响今天练什么。
  }
  return list;
}

export function loadSets(): PlanSet[] {
  try {
    return parse(JSON.parse(localStorage.getItem(SETS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** 存一套（同名就覆盖），最多 5 套，超出丢最早的。不填名字就用「今天的 N 条」兜住。 */
export function saveSet(name: string, items: PlanSetItem[]): PlanSet[] {
  if (items.length === 0) return loadSets();
  const typed = cleanSetName(name);
  const clean = typed || `今天的 ${items.length} 条`;
  const list = loadSets().filter((set) => set.name !== clean);
  const next: PlanSet[] = [
    ...list,
    {
      id: `set-${Date.now().toString(36)}`,
      name: clean,
      items: items.slice(0, MAX_ITEMS),
      addedAt: Date.now(),
    },
  ].slice(-MAX_SETS);
  return persist(next);
}

export function removeSet(id: string): PlanSet[] {
  return persist(loadSets().filter((set) => set.id !== id));
}

export function renameSet(id: string, name: string): PlanSet[] {
  const clean = cleanSetName(name);
  if (!clean) return loadSets();
  return persist(loadSets().map((set) => (set.id === id ? { ...set, name: clean } : set)));
}

/** 把一套里没加过的条目加进今天的计划，返回加进去几条。 */
export function applySet(set: PlanSet, today: string = dateKeyOf(new Date())): number {
  const before = loadExtras(today).length;
  for (const item of set.items) addExtra(item, today);
  return Math.max(0, loadExtras(today).length - before);
}
