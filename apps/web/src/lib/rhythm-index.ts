import {
  ACCOMPANIMENTS,
  READING_DRILLS,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
} from "@guitar/core";

/**
 * 节奏页里所有「能练一条」的东西，统一成一种形状。
 *
 * 以前这份清单在 `Rhythm.tsx` 里拼一遍、统计页再拼一遍，两处容易漂。
 * 现在只在这里拼一次：节奏页的「今日三条」、每块标题上的「已练 N/M」、
 * 统计页的分组完成度与最高 BPM 排行都读它。
 */
export interface RhythmItem {
  id: string;
  label: string;
  group: string;
}

/** 页面上的六块，顺序就是页面上的顺序。 */
export const RHYTHM_GROUPS = ["跟读", "时值", "扫弦", "伴奏", "节奏型", "片段"] as const;

export type RhythmGroup = (typeof RHYTHM_GROUPS)[number];

export const RHYTHM_ITEMS: RhythmItem[] = [
  ...READING_DRILLS.map((drill) => ({
    id: drill.id,
    label: `练习 ${drill.no} · ${drill.name}`,
    group: "跟读" as const,
  })),
  ...RHYTHM_DRILLS.map((drill) => ({
    id: drill.id,
    label: drill.name,
    group: "时值" as const,
  })),
  ...STRUM_DRILLS.map((drill) => ({
    id: drill.id,
    label: `练习 ${drill.no} · ${drill.name}`,
    group: "扫弦" as const,
  })),
  ...ACCOMPANIMENTS.map((item) => ({
    id: item.id,
    label: `练习 ${item.no} · ${item.name}`,
    group: "伴奏" as const,
  })),
  ...STRUM_LIBRARY.map((item) => ({
    id: item.id,
    label: item.name,
    group: "节奏型" as const,
  })),
  ...SONG_SNIPPETS.map((item) => ({
    id: item.id,
    label: item.name,
    group: "片段" as const,
  })),
];

/** 「今日三条」只从这三块里挑，保证一天里念、数、扫都碰到。 */
export const PICK_GROUPS: RhythmGroup[] = ["跟读", "时值", "扫弦"];

export const RHYTHM_PICKS: RhythmItem[] = RHYTHM_ITEMS.filter((item) =>
  PICK_GROUPS.includes(item.group as RhythmGroup),
);

const BY_ID = new Map(RHYTHM_ITEMS.map((item) => [item.id, item]));

export function rhythmItemById(id: string): RhythmItem | undefined {
  return BY_ID.get(id);
}

export function rhythmItemsOf(group: RhythmGroup): RhythmItem[] {
  return RHYTHM_ITEMS.filter((item) => item.group === group);
}
