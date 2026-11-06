/**
 * 六线谱的排版：把 `Tab` 算成一组「线 / 文字 / 路径」，不含任何 React 或 DOM。
 *
 * 拆出来的原因：排版对不对（数字压没压线、小节线在不在拍上、箭头有没有跟拍）
 * 是可以用单测和截图验证的；组件只负责把结果贴出去。
 *
 * 版式约定（尽量贴近常见的吉他谱）：
 * - 左侧是**弦号 1–6**（1 = 高音 e 弦），不写 e/E，避免大小写看不出区别；
 * - 音符按**拍位**等比排开，八分、十六分的疏密看得出来；
 * - 时值**从音自己身上拉出来**：每个音一根符干朝上，同一拍内用符梁连起来，
 *   不再单独画一条「节奏轨」——那样会看起来像多了第七根弦；
 * - 拍子长到一行放不下时**换行**（分「行」排），不做横向滚动；
 * - 数字直接压在线上的位置，靠描边（和背景同色的粗描边）把弦线「断开」。
 */

import type { Tab, TabNote } from "@guitar/core";

export type TabEl =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; cls: string }
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      cls: string;
      anchor: "start" | "middle" | "end";
    }
  | { t: "path"; d: string; cls: string }
  | { t: "circle"; cx: number; cy: number; r: number; cls: string };

export interface TabScene {
  width: number;
  height: number;
  els: TabEl[];
  ariaLabel: string;
}

const STRING_LABELS = ["1", "2", "3", "4", "5", "6"];
/** 弦距：要放得下数字、技巧字母和连奏弧线。 */
const STRING_GAP = 22;
/** 顶部留给小节号和符梁。 */
const TOP = 42;
const LEFT = 22;
const PAD = 16;
/** 一拍最窄多宽（四分音符的谱子不能挤成一团）。 */
const MIN_BEAT = 48;
/** 同一根弦上两个音的最小中心距。 */
const GAP = 26;
const BAR_OFFSET = 10;
/** 弦线到符梁线的距离（符梁画在弦线下方）。 */
const RHYTHM_GAP = 20;
/** 两行谱之间的距离。 */
const SYSTEM_GAP = 18;
/** 一行最多多宽——超过就换行，不横滚。 */
const MAX_SYSTEM_WIDTH = 460;

/** 六线谱场景。 */
export function layoutTab(tab: Tab): TabScene {
  const { notes, beatsPerBar, bars } = tab;
  const beatWidth = Math.max(MIN_BEAT, GAP / closestGap(notes));
  const beatsInSystem = Math.max(
    beatsPerBar,
    Math.floor((MAX_SYSTEM_WIDTH - LEFT - PAD) / beatWidth / beatsPerBar) * beatsPerBar,
  );
  const barsPerSystem = Math.max(1, beatsInSystem / beatsPerBar);
  const systemCount = Math.ceil(bars / barsPerSystem);

  const systemHeight = TOP + 5 * STRING_GAP + RHYTHM_GAP + 34;
  const xIn = (offset: number) => LEFT + PAD + offset * beatWidth;
  const yIn = (s: number, base: number) => base + TOP + (s - 1) * STRING_GAP;

  const els: TabEl[] = [];
  let width = 0;

  for (let system = 0; system < systemCount; system++) {
    const base = system * systemHeight;
    const firstBar = system * barsPerSystem;
    const barCount = Math.min(barsPerSystem, bars - firstBar);
    const firstBeat = firstBar * beatsPerBar;
    const lastBeat = (firstBar + barCount) * beatsPerBar;
    const staffStart = LEFT;
    const staffEnd = xIn(lastBeat - firstBeat) - BAR_OFFSET;
    width = Math.max(width, staffEnd + 12);

    // 弦线与弦号
    for (let s = 1; s <= 6; s++) {
      els.push({
        t: "line",
        x1: staffStart,
        y1: yIn(s, base),
        x2: staffEnd,
        y2: yIn(s, base),
        cls: "tab-string",
      });
      els.push({
        t: "text",
        x: LEFT - 7,
        y: yIn(s, base),
        text: STRING_LABELS[s - 1],
        cls: "tab-string-name",
        anchor: "end",
      });
    }

    // 小节线 + 小节号
    for (let bar = 0; bar <= barCount; bar++) {
      const bx = xIn(bar * beatsPerBar) - BAR_OFFSET;
      els.push({
        t: "line",
        x1: bx,
        y1: yIn(1, base),
        x2: bx,
        y2: yIn(6, base),
        cls: "tab-bar",
      });
      if (bar < barCount) {
        els.push({
          t: "text",
          x: (bx + xIn((bar + 1) * beatsPerBar) - BAR_OFFSET) / 2,
          y: base + 14,
          text: String(firstBar + bar + 1),
          cls: "tab-count",
          anchor: "middle",
        });
      }
    }

    // 这一行里的音
    const local = notes.filter((note) => note.beat >= firstBeat && note.beat < lastBeat);
    const onsets = groupOnsets(local);
    const beamY = yIn(6, base) + RHYTHM_GAP;

    for (const onset of onsets) {
      const nx = xIn(onset.beat - firstBeat);
      const note = onset.note;

      // 时值：符干**朝下**从音上拉出来（吉他谱的习惯），统一落到下面那条符梁线上
      const top = Math.min(...onset.strings);
      if (note.dur < 2) {
        els.push({
          t: "line",
          x1: nx,
          y1: yIn(top, base) + 2,
          x2: nx,
          y2: beamY,
          cls: "tab-stem",
        });
      }

      for (const item of onset.notes) {
        if (item.arrow) {
          els.push({
            t: "text",
            x: nx,
            y: yIn(6, base) + RHYTHM_GAP + 22,
            text: item.arrow === "D" ? "↓" : "↑",
            cls: "tab-arrow",
            anchor: "middle",
          });
        }

        const label =
          item.tech === "b" && item.bend
            ? `${item.f}↗${item.f + item.bend}`
            : item.tech === "v"
              ? `${item.f}~`
              : String(item.f);
        els.push({
          t: "text",
          x: nx,
          y: yIn(item.s, base),
          text: label,
          cls: "tab-fret",
          anchor: "middle",
        });

        if (item.tech === "h" || item.tech === "p" || item.tech === "s") {
          const previous = previousOnString(local, item);
          if (previous) {
            const px = xIn(previous.beat - firstBeat);
            const py = yIn(item.s, base);
            els.push({
              t: "text",
              x: (px + nx) / 2,
              y: py,
              text: item.tech,
              cls: "tab-tech",
              anchor: "middle",
            });
            if (nx - 6 > px + 6) {
              els.push({
                t: "path",
                d: `M ${px + 6} ${py - 5} Q ${(px + nx) / 2} ${py - 11} ${nx - 6} ${py - 5}`,
                cls: "tab-slur",
              });
            }
          }
        }
      }
    }

    // 符梁与符尾：同一拍内的八分/十六分连起来（符梁在弦线下方）
    for (const group of beamGroups(onsets, beatsPerBar)) {
      if (group.length < 2) {
        const only = group[0];
        if (only.note.dur < 1) {
          const x = xIn(only.beat - firstBeat);
          els.push({
            t: "path",
            d: `M ${x} ${beamY} q 7 -1 6 -8`,
            cls: "tab-flag",
          });
          if (only.note.dur <= 0.3) {
            els.push({
              t: "path",
              d: `M ${x} ${beamY - 4} q 7 -1 6 -8`,
              cls: "tab-flag",
            });
          }
        }
        continue;
      }
      const xs = group.map((onset) => xIn(onset.beat - firstBeat));
      els.push({
        t: "line",
        x1: xs[0],
        y1: beamY,
        x2: xs[xs.length - 1],
        y2: beamY,
        cls: "tab-beam",
      });
      const shortest = Math.min(...group.map((onset) => onset.note.dur));
      if (shortest <= 0.3) {
        els.push({
          t: "line",
          x1: xs[0],
          y1: beamY + 4,
          x2: xs[xs.length - 1],
          y2: beamY + 4,
          cls: "tab-beam",
        });
      }
      if (shortest > 0.3 && shortest < 0.4) {
        els.push({
          t: "text",
          x: (xs[0] + xs[xs.length - 1]) / 2,
          y: beamY + 14,
          text: "3",
          cls: "tab-count",
          anchor: "middle",
        });
      }
    }
  }

  return {
    width,
    height: systemCount * systemHeight,
    els,
    ariaLabel: `六线谱${tab.range ? `（${tab.range}）` : ""}，${bars} 小节，共 ${notes.length} 个音${
      tab.caption ? `。${tab.caption}` : ""
    }`,
  };
}

interface Onset {
  beat: number;
  note: TabNote;
  notes: TabNote[];
  strings: number[];
}

/** 把同一拍上的音合成一个「起音」（和弦就是一拍多个音）。 */
function groupOnsets(notes: TabNote[]): Onset[] {
  const map = new Map<number, Onset>();
  for (const note of notes) {
    const key = Math.round(note.beat * 1000) / 1000;
    const existing = map.get(key);
    if (existing) {
      existing.notes.push(note);
      existing.strings.push(note.s);
      if (note.dur < existing.note.dur) existing.note = note;
    } else {
      map.set(key, { beat: key, note, notes: [note], strings: [note.s] });
    }
  }
  return [...map.values()].sort((a, b) => a.beat - b.beat);
}

/** 按拍分组做符梁；四分以上不连。 */
function beamGroups(onsets: Onset[], beatsPerBar: number): Onset[][] {
  const groups = new Map<number, Onset[]>();
  for (const onset of onsets) {
    if (onset.note.dur >= 1) continue;
    const key = Math.floor(onset.beat + 1e-9);
    const list = groups.get(key) ?? [];
    list.push(onset);
    groups.set(key, list);
  }
  void beatsPerBar;
  return [...groups.values()];
}

/** 同一根弦上、这个音之前最近的那个音。 */
function previousOnString(notes: TabNote[], note: TabNote): TabNote | null {
  let best: TabNote | null = null;
  for (const candidate of notes) {
    if (candidate.s !== note.s || candidate.beat >= note.beat) continue;
    if (!best || candidate.beat > best.beat) best = candidate;
  }
  return best;
}

/** 同一根弦上最近的两个音隔几拍——用来决定一拍的宽度。 */
function closestGap(notes: TabNote[]): number {
  const byString = new Map<number, number[]>();
  for (const note of notes) {
    const list = byString.get(note.s) ?? [];
    list.push(note.beat);
    byString.set(note.s, list);
  }
  let min = 1;
  for (const beats of byString.values()) {
    beats.sort((a, b) => a - b);
    for (let i = 1; i < beats.length; i++) {
      const gap = beats[i] - beats[i - 1];
      if (gap > 0 && gap < min) min = gap;
    }
  }
  return Math.max(min, 1 / 8);
}
