import {
  STANDARD_TUNING,
  degreeInKey,
  noteNameOf,
  type Tab,
} from "@guitar/core";

export interface TabDegree {
  /** 这一级的起始拍。 */
  beat: number;
  /** 第几级（调外是 0）。 */
  degree: number;
  /** 这一拍的音名（低音）。 */
  name: string;
  /** 低音的 MIDI，画低音线、比高低用得到。 */
  midi: number;
}

/**
 * 每个起音拍是第几级（v0.96.0）。
 *
 * 低音（每个起音拍上最低那个音）当根音，主音取第一个起音的低音——
 * 低音走线、和弦谱卡的角标、跟练提示、导出的级数条都用这一套，
 * 四处显示不会打架。
 */
export function degreesOf(tab: Tab): TabDegree[] {
  const onsets = [...new Set(tab.notes.map((note) => note.beat))].sort((a, b) => a - b);
  const rows = onsets.map((beat) => {
    const midis = tab.notes
      .filter((note) => note.beat === beat)
      .map((note) => (STANDARD_TUNING.strings[note.s - 1] ?? 0) + note.f);
    return { beat, midi: midis.length ? Math.min(...midis) : null };
  });
  const first = rows.find((row) => row.midi !== null)?.midi;
  if (first === undefined || first === null) return [];
  return rows
    .filter((row): row is { beat: number; midi: number } => row.midi !== null)
    .map((row) => ({
      beat: row.beat,
      degree: degreeInKey(((row.midi % 12) + 12) % 12, ((first % 12) + 12) % 12),
      name: noteNameOf(row.midi),
      midi: row.midi,
    }));
}

/** 「1 → 6 → 5」这种一句话，导出的图底下写一行。 */
export function degreeLine(tab: Tab): string {
  const degrees = degreesOf(tab);
  if (degrees.length < 2) return "";
  return degrees.map((row) => (row.degree > 0 ? String(row.degree) : "?" )).join(" → ");
}
