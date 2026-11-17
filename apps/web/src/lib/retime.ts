import type { Tab } from "@guitar/core";

/**
 * 改拍号时重切小节（v0.92.0，v0.94.0 抽成共用）。
 *
 * 拍位不动，但**时值不能跨过小节线**：4/4 里一个和弦按满四拍，改成 3/4 之后它就会横跨小节线，
 * alphaTab 会画成延音线，看起来像谱子坏了。所以每个和弦的时值改成「到下一个和弦为止」
 * 和「一小节」里更短的那个。
 */
export function retimeTab(tab: Tab, beatsPerBar: number): Tab {
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
