/**
 * 六线谱的排版：把 `Tab` 算成一组「线 / 文字 / 路径」，不含任何 React 或 DOM。
 *
 * 拆出来的原因：排版对不对（数字压没压线、小节线在不在拍上、箭头有没有跟拍）
 * 是可以用单测和截图验证的；组件只负责把结果贴出去。
 *
 * 版式约定（尽量贴近常见的吉他谱）：
 * - 左侧是六根弦的名字（e B G D A E），最上面是 1 弦；
 * - 音符按**拍位**等比排开，所以八分、十六分的疏密看得出来；
 * - 小节线画在拍位前 6px，不会压在音符上；
 * - 数字直接压在线上的位置，靠描边（和背景同色的粗描边）把弦线「断开」；
 * - 小节号在两小节之间居中，扫弦箭头画在谱子下方。
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

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
/** 弦距：要放得下数字、技巧字母和连奏弧线，18 太挤。 */
const STRING_GAP = 24;
const TOP = 30;
const LEFT = 24;
const PAD = 18;
/** 一拍最窄多宽（四分音符的谱子不能挤成一团）。 */
const MIN_BEAT = 48;
/** 同一根弦上两个音的最小中心距。 */
const GAP = 26;
const BAR_OFFSET = 12;
/** 弦线下面留给时值（符干 + 符尾）的高度。 */
const RHYTHM_TOP = 24;
const STEM = 13;

/** 六线谱场景。 */
export function layoutTab(tab: Tab): TabScene {
  const { notes, beatsPerBar, bars } = tab;
  const totalBeats = Math.max(1, beatsPerBar * bars);
  const beatWidth = Math.max(MIN_BEAT, GAP / closestGap(notes));
  const x = (beat: number) => LEFT + PAD + beat * beatWidth;
  const y = (s: number) => TOP + (s - 1) * STRING_GAP;
  // 谱面在最后一根小节线处收尾，右边只留一点白
  const staffStart = LEFT;
  const staffEnd = x(totalBeats) - BAR_OFFSET;
  const width = staffEnd + 12;
  // 弦线下面是一条「节奏轨」：符干朝下，八分/十六分用符梁连起来
  const rhythmY = y(6) + RHYTHM_TOP;
  const arrowY = rhythmY + STEM + 20;
  const height = arrowY + 12;

  const els: TabEl[] = [];

  // 弦线与弦名：线只画到最后一根小节线，右端不留一截
  for (let s = 1; s <= 6; s++) {
    els.push({
      t: "line",
      x1: staffStart,
      y1: y(s),
      x2: staffEnd,
      y2: y(s),
      cls: "tab-string",
    });
    els.push({
      t: "text",
      x: LEFT - 8,
      y: y(s),
      text: STRING_LABELS[s - 1],
      cls: "tab-string-name",
      anchor: "end",
    });
  }

  // 小节线（起点、每小节、终点）+ 小节号
  for (let bar = 0; bar <= bars; bar++) {
    const bx = x(bar * beatsPerBar) - BAR_OFFSET;
    els.push({ t: "line", x1: bx, y1: y(1), x2: bx, y2: rhythmY, cls: "tab-bar" });
    if (bar < bars) {
      els.push({
        t: "text",
        x: (bx + x((bar + 1) * beatsPerBar) - BAR_OFFSET) / 2,
        y: 13,
        text: String(bar + 1),
        cls: "tab-count",
        anchor: "middle",
      });
    }
  }

  // 节奏轨：弦线下面一条横线，符干朝下；同拍内的八分/十六分用符梁连起来
  els.push({
    t: "line",
    x1: staffStart,
    y1: rhythmY,
    x2: staffEnd,
    y2: rhythmY,
    cls: "tab-rhythm-line",
  });
  const onsets = new Map<number, number>(); // 拍 → 最短时值
  for (const note of notes) {
    const key = Math.round(note.beat * 1000) / 1000;
    onsets.set(key, Math.min(onsets.get(key) ?? Number.POSITIVE_INFINITY, note.dur));
  }
  const beats = [...onsets.keys()].sort((a, b) => a - b);
  // 同一拍里的八分/十六分连成一组（四分以上不连）
  const groups = new Map<number, number[]>();
  for (const beat of beats) {
    if ((onsets.get(beat) ?? 1) >= 1) continue;
    const key = Math.floor(beat + 1e-9);
    const list = groups.get(key) ?? [];
    list.push(beat);
    groups.set(key, list);
  }
  const beamed = new Set<number>();
  for (const list of groups.values()) {
    if (list.length >= 2) list.forEach((beat) => beamed.add(beat));
  }

  for (const beat of beats) {
    const dur = onsets.get(beat) ?? 1;
    if (dur >= 2) {
      // 二分/全音符：空心符头，不带符干
      els.push({ t: "circle", cx: x(beat), cy: rhythmY, r: 3.2, cls: "tab-notehead open" });
      continue;
    }
    els.push({ t: "circle", cx: x(beat), cy: rhythmY, r: 2.4, cls: "tab-notehead" });
    els.push({
      t: "line",
      x1: x(beat),
      y1: rhythmY,
      x2: x(beat),
      y2: rhythmY + STEM,
      cls: "tab-stem",
    });
    // 没有符梁的八分/十六分要画符尾，否则看起来和四分音符一样
    if (dur < 1 && !beamed.has(beat)) {
      els.push({
        t: "path",
        d: `M ${x(beat)} ${rhythmY + STEM} q 7 -1 6 -8`,
        cls: "tab-flag",
      });
      if (dur <= 0.3) {
        els.push({
          t: "path",
          d: `M ${x(beat)} ${rhythmY + STEM - 4} q 7 -1 6 -8`,
          cls: "tab-flag",
        });
      }
    }
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const x1 = x(list[0]);
    const x2 = x(list[list.length - 1]);
    els.push({
      t: "line",
      x1,
      y1: rhythmY + STEM,
      x2,
      y2: rhythmY + STEM,
      cls: "tab-beam",
    });
    const shortest = Math.min(...list.map((beat) => onsets.get(beat) ?? 1));
    if (shortest <= 0.3) {
      els.push({
        t: "line",
        x1,
        y1: rhythmY + STEM - 4,
        x2,
        y2: rhythmY + STEM - 4,
        cls: "tab-beam",
      });
    }
    if (list.length === 3 && Math.abs(shortest - 1 / 3) < 1e-6) {
      els.push({
        t: "text",
        x: (x1 + x2) / 2,
        y: rhythmY + STEM + 10,
        text: "3",
        cls: "tab-count",
        anchor: "middle",
      });
    }
  }

  // 音
  for (const note of notes) {
    const nx = x(note.beat);
    const ny = y(note.s);

    if (note.arrow) {
      els.push({
        t: "text",
        x: nx,
        y: arrowY,
        text: note.arrow === "D" ? "↓" : "↑",
        cls: "tab-arrow",
        anchor: "middle",
      });
    }

    const label =
      note.tech === "b" && note.bend
        ? `${note.f}↗${note.f + note.bend}`
        : note.tech === "v"
          ? `${note.f}~`
          : String(note.f);

    els.push({ t: "text", x: nx, y: ny, text: label, cls: "tab-fret", anchor: "middle" });

    if (note.tech === "h" || note.tech === "p" || note.tech === "s") {
      const previous = previousOnString(notes, note);
      if (previous) {
        // 传统写法：字母夹在两个品数**中间**、压在同一条弦线上（`3h5`），
        // 上面再画一条小弧线。放在线上面会让人以为是上一根弦的标记。
        els.push({
          t: "text",
          x: (x(previous.beat) + nx) / 2,
          y: ny,
          text: note.tech,
          cls: "tab-tech",
          anchor: "middle",
        });
        const x1 = x(previous.beat) + 6;
        const x2 = nx - 6;
        if (x2 > x1) {
          els.push({
            t: "path",
            d: `M ${x1} ${ny - 5} Q ${(x1 + x2) / 2} ${ny - 11} ${x2} ${ny - 5}`,
            cls: "tab-slur",
          });
        }
      }
    }
  }

  return {
    width,
    height,
    els,
    ariaLabel: `六线谱${tab.range ? `（${tab.range}）` : ""}，${bars} 小节，共 ${notes.length} 个音${
      tab.caption ? `。${tab.caption}` : ""
    }`,
  };
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

/** 同一根弦上、这个音之前最近的那个音。 */
function previousOnString(notes: TabNote[], note: TabNote): TabNote | null {
  let best: TabNote | null = null;
  for (const candidate of notes) {
    if (candidate.s !== note.s || candidate.beat >= note.beat) continue;
    if (!best || candidate.beat > best.beat) best = candidate;
  }
  return best;
}
