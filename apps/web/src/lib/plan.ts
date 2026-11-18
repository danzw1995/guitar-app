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
  input: { title: string; tab: Tab; meter: string; bpm: number },
  today: string = dateKeyOf(new Date()),
): PlanExtra[] {
  const all = readAll().filter((item) => item.date === today);
  const same = all.find((item) => item.title === input.title);
  if (same) return all;
  const extra: PlanExtra = {
    id: `extra-${Date.now().toString(36)}`,
    date: today,
    title: input.title,
    tab: input.tab,
    meter: input.meter,
    bpm: input.bpm,
    addedAt: Date.now(),
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
