import type { Tab } from "@guitar/core";

/** 自己存下来的「和弦进行」——听和弦切出来、觉得值得练的那几段。 */
export interface SavedPattern {
  id: string;
  title: string;
  tab: Tab;
  meter: string;
  bpm: number;
  createdAt: number;
}

const STORAGE_KEY = "guitar.patterns.v1";
const LIMIT = 40;

function isTab(value: unknown): value is Tab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Tab;
  return typeof tab.beatsPerBar === "number" && Array.isArray(tab.notes) && tab.notes.length > 0;
}

function parse(raw: unknown): SavedPattern[] {
  if (!Array.isArray(raw)) return [];
  const list: SavedPattern[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<SavedPattern>;
    if (typeof entry.id !== "string" || !isTab(entry.tab)) continue;
    list.push({
      id: entry.id,
      title: typeof entry.title === "string" && entry.title ? entry.title : "没名字的和弦进行",
      tab: entry.tab,
      meter: typeof entry.meter === "string" ? entry.meter : `${entry.tab.beatsPerBar}/4`,
      bpm: typeof entry.bpm === "number" && entry.bpm > 0 ? Math.round(entry.bpm) : 70,
      createdAt: typeof entry.createdAt === "number" ? entry.createdAt : 0,
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMIT);
}

export function loadPatterns(): SavedPattern[] {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return [];
    return parse(JSON.parse(text));
  } catch {
    return [];
  }
}

export function savePatterns(list: SavedPattern[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // 存不下就算了：内存里的列表还在，用户能看到
  }
}

export function addPattern(input: Omit<SavedPattern, "id" | "createdAt">): SavedPattern {
  const pattern: SavedPattern = {
    ...input,
    id: `pattern-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  savePatterns([pattern, ...loadPatterns()]);
  return pattern;
}

export function removePattern(id: string) {
  savePatterns(loadPatterns().filter((item) => item.id !== id));
}
