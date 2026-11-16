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

/**
 * 改拍号时重切小节（v0.92.0）：拍位不动，但**时值不能跨过小节线**。
 *
 * 4/4 里一个和弦按满四拍，改成 3/4 之后它就会横跨小节线——alphaTab 会画成延音线，
 * 看起来像谱子坏了。所以每个和弦的时值改成「到下一个和弦为止」和「一小节」里更短的那个。
 */
function retime(tab: Tab, beatsPerBar: number): Tab {
  const beats = [...new Set(tab.notes.map((note) => note.beat))].sort((a, b) => a - b);
  const notes = tab.notes.map((note) => {
    const next = beats.find((beat) => beat > note.beat);
    const room = (next === undefined ? note.dur : next - note.beat) || note.dur;
    return { ...note, dur: Math.max(1, Math.min(Math.round(room), beatsPerBar)) };
  });
  const end = notes.reduce((most, note) => Math.max(most, note.beat + note.dur), 0);
  return {
    ...tab,
    notes,
    beatsPerBar,
    bars: Math.max(1, Math.ceil((end - 1e-6) / beatsPerBar)),
  };
}

/**
 * 改一条已存的进行（v0.92.0）：速度、拍号、标题。
 *
 * 速度只是「跟练从哪儿起步」，不写进谱头的话下一次打开又回到旧值；
 * 拍号会真的重切小节——六线谱上的小节线是照着 `beatsPerBar` 画的。
 */
export function updatePattern(
  id: string,
  patch: { bpm?: number; beatsPerBar?: number; title?: string },
): SavedPattern[] {
  const next = loadPatterns().map((item) => {
    if (item.id !== id) return item;
    const bpm =
      patch.bpm === undefined ? item.bpm : Math.min(200, Math.max(40, Math.round(patch.bpm)));
    const beats = patch.beatsPerBar ?? item.tab.beatsPerBar;
    const title = patch.title?.trim() || item.title;
    return {
      ...item,
      title,
      bpm,
      meter: `${beats}/4`,
      tab: beats === item.tab.beatsPerBar ? item.tab : retime(item.tab, beats),
    };
  });
  savePatterns(next);
  return next;
}
