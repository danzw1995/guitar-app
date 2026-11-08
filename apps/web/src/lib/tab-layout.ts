/**
 * 六线谱的排版：把 `Tab` 算成一组「线 / 文字 / 路径」，不含任何 React 或 DOM。
 *
 * 拆出来的原因：排版对不对（数字压没压线、小节线在不在拍上、箭头有没有跟拍）
 * 是可以用单测和截图验证的；组件只负责把结果贴出去。
 *
 * 版式约定（尽量贴近常见的吉他谱）：
 * - 左侧是**弦号 1–6**（1 = 高音 e 弦），不写 e/E，避免大小写看不出区别；
 * - 音符按**拍位**等比排开，八分、十六分的疏密看得出来；
 * - 时值从音自己身上拉出来：符干朝下、长度固定，同一拍内的八分/十六分连符梁，
 *   符梁画在符干末端（连梁的一组取组里最靠下的音再往下拉），不另画「节奏轨」；
 * - 六线谱里符干画在品数**右边**，不压在数字上；
 * - 附点一个起音一个，休止符按标准形状分档（全/二分/四分/八分/十六分）；
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
  | { t: "circle"; cx: number; cy: number; r: number; cls: string }
  | { t: "rect"; x: number; y: number; width: number; height: number; cls: string };

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
/** 符干长度：从音身上往下拉这么长（标准记法里约三个半间）。 */
const STEM_LEN = 26;
/** 一级符梁和二级符梁之间的间距（够宽才看得出「八分 / 十六分」的区别）。 */
const BEAM_GAP = 7;
/** 两行谱之间的距离。 */
const SYSTEM_GAP = 18;
/** 一行最多多宽——超过就换行，不横滚。 */
const MAX_SYSTEM_WIDTH = 460;

/** 六线谱场景。 */
export function layoutTab(tab: Tab): TabScene {
  const { notes, beatsPerBar, bars } = tab;
  /** 朗读练习只有一条节奏线（画 X），不是六线谱。 */
  const rhythmStyle = tab.display === "rhythm";
  const lineCount = rhythmStyle ? 1 : 6;
  const beatWidth = Math.max(MIN_BEAT, GAP / closestGap(notes));
  const beatsInSystem = Math.max(
    beatsPerBar,
    Math.floor((MAX_SYSTEM_WIDTH - LEFT - PAD) / beatWidth / beatsPerBar) * beatsPerBar,
  );
  const barsPerSystem = Math.max(1, beatsInSystem / beatsPerBar);
  const systemCount = Math.ceil(bars / barsPerSystem);

  /** 有扫弦箭头时下面要多留一行；有括号三连音时也要留出「3」的位置。 */
  const hasArrows = notes.some((note) => note.arrow);
  const hasTuplets = notes.some((note) => isTriplet(note.dur));
  const bottom = hasArrows ? 40 : hasTuplets ? 26 : 14;
  const systemHeight = TOP + (lineCount - 1) * STRING_GAP + STEM_LEN + bottom;
  const xIn = (offset: number) => LEFT + PAD + offset * beatWidth;
  const yIn = (s: number, base: number) =>
    base + TOP + (rhythmStyle ? 0 : (s - 1) * STRING_GAP);

  const els: TabEl[] = [];
  let width = 0;
  let restCount = 0;

  for (let system = 0; system < systemCount; system++) {
    const base = system * systemHeight;
    const firstBar = system * barsPerSystem;
    const barCount = Math.min(barsPerSystem, bars - firstBar);
    const firstBeat = firstBar * beatsPerBar;
    const lastBeat = (firstBar + barCount) * beatsPerBar;
    const staffStart = LEFT;
    const staffEnd = xIn(lastBeat - firstBeat) - BAR_OFFSET;
    width = Math.max(width, staffEnd + 12);

    // 弦线与弦号（朗读谱只有一条线，也不用标弦号）
    for (let s = 1; s <= lineCount; s++) {
      els.push({
        t: "line",
        x1: staffStart,
        y1: yIn(s, base),
        x2: staffEnd,
        y2: yIn(s, base),
        cls: "tab-string",
      });
      if (!rhythmStyle) {
        els.push({
          t: "text",
          x: LEFT - 7,
          y: yIn(s, base),
          text: STRING_LABELS[s - 1],
          cls: "tab-string-name",
          anchor: "end",
        });
      }
    }

    // 小节线 + 小节号
    for (let bar = 0; bar <= barCount; bar++) {
      const bx = xIn(bar * beatsPerBar) - BAR_OFFSET;
      els.push({
        t: "line",
        x1: bx,
        y1: yIn(1, base),
        x2: bx,
        y2: yIn(lineCount, base),
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
    const groups = beamGroups(onsets, beatsPerBar);
    const tuplets = tupletGroups(onsets);

    // 符干末端：连梁的一组共用一条符梁线——取组里最靠下的音，再往下拉一根符干；
    // 不成组的音就挂在自己身上。以前全谱拉到同一条线上，高音弦的四分音符
    // 会拖一根特别长的符干，像挂在一条看不见的线上，那不是标准画法。
    const stemEnds = new Map<Onset, number>();
    const beamed = new Set<Onset>();
    for (const onset of onsets) {
      stemEnds.set(onset, yIn(Math.min(...onset.strings), base) + STEM_LEN);
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      const beam = Math.max(...group.map((onset) => yIn(Math.max(...onset.strings), base))) + STEM_LEN;
      for (const onset of group) {
        stemEnds.set(onset, beam);
        beamed.add(onset);
      }
    }
    const stemEndOf = (onset: Onset) => stemEnds.get(onset) ?? yIn(lineCount, base) + STEM_LEN;
    const maxStemEnd = Math.max(yIn(lineCount, base) + STEM_LEN, ...onsets.map(stemEndOf));
    /** 扫弦箭头画在所有符干下面。 */
    const arrowY = maxStemEnd + 18;
    /** 休止符：节奏谱画在那条线上，六线谱画在谱面中间。 */
    const restY = rhythmStyle ? yIn(1, base) : base + TOP + 2.5 * STRING_GAP;
    /** 符干不压在品数上：六线谱里符干画在数字右边（常见的吉他谱都是这么排的）。 */
    const stemXOf = (onset: Onset) => {
      const x = xIn(onset.beat - firstBeat);
      if (rhythmStyle) return x;
      const width = Math.max(...onset.notes.map((note) => String(note.f).length));
      return x + 8 + (width - 1) * 7;
    };

    for (const onset of onsets) {
      const nx = xIn(onset.beat - firstBeat);
      const note = onset.note;

      // 时值：符干从音身上往下拉，长度固定。连梁的一组共用一条符梁线，
      // 十六分的符干再往下探一层（否则第二条符梁会浮在符干外面）。
      const top = Math.min(...onset.strings);
      if (written(note.dur) < 4) {
        const stemEnd =
          stemEndOf(onset) + (beamed.has(onset) && written(note.dur) < 1 ? BEAM_GAP * (beamLevel(note.dur) - 1) : 0);
        els.push({
          t: "line",
          x1: stemXOf(onset),
          y1: yIn(top, base) + 2,
          x2: stemXOf(onset),
          y2: stemEnd,
          cls: "tab-stem",
        });
      }

      for (const item of onset.notes) {
        // 扫弦箭头和切音点一个起音只画一遍（和弦的每根弦都带着 arrow 标记）
        if (item.arrow && item === onset.notes.find((other) => other.arrow)) {
          els.push({
            t: "text",
            x: nx,
            y: arrowY,
            text: item.arrow === "D" ? "↓" : "↑",
            cls: "tab-arrow",
            anchor: "middle",
          });
          // 右手切音：箭头上面一个点，和视频板书一致
          if (onset.notes.some((other) => other.muted)) {
            els.push({
              t: "text",
              x: nx,
              y: arrowY - 12,
              text: "·",
              cls: "tab-mute",
              anchor: "middle",
            });
          }
        }

        const label = rhythmStyle
          ? "X"
          : item.tech === "b" && item.bend
            ? `${item.f}↗${item.f + item.bend}`
            : item.tech === "v"
              ? `${item.f}~`
              : String(item.f);
        els.push({
          t: "text",
          x: nx,
          y: yIn(item.s, base),
          text: label,
          cls: rhythmStyle ? "tab-fret rhythm" : "tab-fret",
          anchor: "middle",
        });

        // 附点：时值是基准的 1.5 倍就在音右边点一下。一个起音只点一个——
        // 和弦扫弦时每根弦都点一个会变成一串竖排的点。
        if (item === onset.notes[0] && isDotted(note.dur)) {
          els.push({
            t: "text",
            x: rhythmStyle ? nx + 9 : stemXOf(onset) + 7,
            y: yIn(top, base) + 1,
            text: "·",
            cls: "tab-dot",
            anchor: "middle",
          });
        }

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

    // 休止符：音符之间的空档要画出来，不然「整拍休止」看着就像忘了填
    {
      const rests: { beat: number; dur: number }[] = [];
      for (let bar = 0; bar < barCount; bar++) {
        const barStart = (firstBar + bar) * beatsPerBar;
        const barEnd = barStart + beatsPerBar;
        const inBar = onsets.filter((onset) => onset.beat >= barStart - 1e-6 && onset.beat < barEnd - 1e-6);
        let cursor = barStart;
        for (const onset of inBar) {
          // 留一点余量：三连音的拍位是 0.333 这种，相邻两下之间会算出 0.001 的空档，
          // 那不是休止，是换算误差
          if (onset.beat - cursor > 0.12) {
            rests.push({ beat: cursor, dur: onset.beat - cursor });
          }
          cursor = Math.max(cursor, onset.beat + onset.note.dur);
        }
        if (barEnd - cursor > 0.12) rests.push({ beat: cursor, dur: barEnd - cursor });
      }
      for (const rest of rests) {
        // 一个空档可能是「1.25 拍」这种不能用一个符号写出来的时值，
        // 拆成标准时值画几个，别硬画成方块
        const parts = restParts(rest.dur);
        parts.forEach((part, index) => {
          const center = rest.beat + ((index + 0.5) * rest.dur) / parts.length;
          drawRest(els, xIn(center - firstBeat), restY, part.len, part.dotted);
          restCount++;
        });
      }
    }

    // 符梁与符尾：同一拍内的八分/十六分连起来（符梁画在符干末端）
    for (const group of groups) {
      if (group.length < 2) {
        const only = group[0];
        const value = written(only.note.dur);
        if (value < 1) {
          const x = stemXOf(only);
          els.push({
            t: "path",
            d: `M ${x} ${stemEndOf(only)} q 8 -1 7 -9`,
            cls: "tab-flag",
          });
          if (beamLevel(only.note.dur) >= 2) {
            els.push({
              t: "path",
              d: `M ${x} ${stemEndOf(only) - 5} q 8 -1 7 -9`,
              cls: "tab-flag",
            });
          }
        }
        continue;
      }
      const xs = group.map(stemXOf);
      const levels = group.map((onset) => beamLevel(onset.note.dur));
      const beamY = stemEndOf(group[0]);
      // 主符梁：整组连起来
      els.push({
        t: "line",
        x1: xs[0],
        y1: beamY,
        x2: xs[xs.length - 1],
        y2: beamY,
        cls: "tab-beam",
      });
      // 次级符梁：只盖住真的更短的那些音，这样「前八后十六」里
      // 前面那个八分不会跟着被画成十六分
      for (let level = 2; level <= 3; level++) {
        let start = -1;
        for (let i = 0; i <= levels.length; i++) {
          const on = i < levels.length && levels[i] >= level;
          if (on && start < 0) start = i;
          if (!on && start >= 0) {
            const end = i - 1;
            const y = beamY + BEAM_GAP * (level - 1);
            if (end > start) {
              els.push({ t: "line", x1: xs[start], y1: y, x2: xs[end], y2: y, cls: "tab-beam" });
            } else {
              // 孤立的一个十六分：次级符梁往旁边那个符干上接——附点八分后面跟十六分时，
              // 标准画法就是一条从十六分拉回前面符干的短梁，不是悬在中间的小横线
              const toLeft = xs[start - 1];
              const toRight = xs[start + 1];
              const x1 = toLeft !== undefined ? toLeft : xs[start] - 11;
              const x2 = toRight !== undefined ? toRight : toLeft !== undefined ? xs[start] : xs[start] + 11;
              els.push({ t: "line", x1, y1: y, x2, y2: y, cls: "tab-beam" });
            }
            start = -1;
          }
        }
      }
    }

    // 三连音：连得起来的一组（八分三连音）在符梁下写「3」，
    // 连不起来的一组（四分三连音）就得画一条括号——四分音符本来就不连梁
    for (const tuplet of tuplets) {
      const xs = tuplet.map(stemXOf);
      const x1 = xs[0];
      const x2 = xs[xs.length - 1];
      if (tuplet.every((onset) => beamed.has(onset))) {
        els.push({
          t: "text",
          x: (x1 + x2) / 2,
          y: stemEndOf(tuplet[0]) + 13,
          text: "3",
          cls: "tab-tuplet",
          anchor: "middle",
        });
      } else {
        const top = Math.max(...tuplet.map(stemEndOf)) + 6;
        els.push({ t: "line", x1, y1: top, x2, y2: top, cls: "tab-tuplet-bracket" });
        els.push({ t: "line", x1, y1: top, x2: x1, y2: top + 5, cls: "tab-tuplet-bracket" });
        els.push({ t: "line", x1: x2, y1: top, x2, y2: top + 5, cls: "tab-tuplet-bracket" });
        els.push({ t: "text", x: (x1 + x2) / 2, y: top + 15, text: "3", cls: "tab-tuplet", anchor: "middle" });
      }
    }
  }

  return {
    width,
    height: systemCount * systemHeight,
    els,
    ariaLabel: `六线谱${tab.range ? `（${tab.range}）` : ""}，${bars} 小节，共 ${notes.length} 个音${
      restCount > 0 ? `、${restCount} 处休止` : ""
    }${tab.caption ? `。${tab.caption}` : ""}`,
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
    if (written(onset.note.dur) >= 1) continue;
    const key = Math.floor(onset.beat + 1e-9);
    const list = groups.get(key) ?? [];
    list.push(onset);
    groups.set(key, list);
  }
  void beatsPerBar;
  return [...groups.values()];
}

/** 谱面上「写得出来」的时值：三连音的实际时值（1/3、2/3 拍）乘 1.5 才是音符本身。 */
const WRITTEN_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.0625];

function written(dur: number): number {
  for (const factor of [1, 1.5, 2 / 3]) {
    const value = dur * factor;
    if (WRITTEN_VALUES.some((base) => Math.abs(base - value) < 2e-3)) return value;
  }
  return dur;
}

/** 这个时值是压缩过的（三连音一类），谱面上要靠「3」或括号说明。 */
function isTriplet(dur: number): boolean {
  return Math.abs(written(dur) - dur) > 1e-3;
}

/** 三连音一组：连着几个压缩时值的音，正好填满整拍（八分三连音占 1 拍，四分三连音占 2 拍）。 */
function tupletGroups(onsets: Onset[]): Onset[][] {
  const groups: Onset[][] = [];
  let current: Onset[] = [];
  let span = 0;
  for (const onset of onsets) {
    if (!isTriplet(onset.note.dur)) {
      current = [];
      span = 0;
      continue;
    }
    current.push(onset);
    span += onset.note.dur;
    if (span >= 0.9 && Math.abs(span - Math.round(span)) < 0.02) {
      if (current.length >= 3) groups.push(current);
      current = [];
      span = 0;
    }
  }
  return groups;
}

/** 符梁层数：八分 1 层，十六分 2 层，三十二分 3 层。 */
function beamLevel(dur: number): number {
  const value = written(dur);
  if (value <= 0.2) return 3;
  if (value <= 0.4) return 2;
  return 1;
}

/** 附点：时值正好是基准时值的 1.5 倍（0.375 / 0.75 / 1.5 / 3 拍）。 */
function isDotted(dur: number): boolean {
  const value = written(dur);
  const tolerance = 1e-3;
  return [0.25, 0.5, 1, 2, 3].some((base) => Math.abs(value - base * 1.5) < tolerance);
}

/** 能用标准休止符写出来的时值。 */
const REST_VALUES = [4, 2, 1, 0.5, 0.25];

/** 一个空档（可能是 1.25 拍这种）拆成几个标准休止符。 */
function restParts(dur: number): { len: number; dotted: boolean }[] {
  const parts: { len: number; dotted: boolean }[] = [];
  let left = dur;
  while (left > 1e-6 && parts.length < 8) {
    const dottedBase = REST_VALUES.find((base) => Math.abs(base * 1.5 - left) < 1e-6);
    if (dottedBase) {
      parts.push({ len: dottedBase, dotted: true });
      break;
    }
    const base = REST_VALUES.find((value) => value <= left + 1e-6) ?? 0.25;
    parts.push({ len: base, dotted: false });
    left -= base;
  }
  return parts;
}

/**
 * 休止符（按标准形状分档）：
 * 全休止 = 挂在线上方的方块，二分 = 坐在线上的方块，
 * 四分 = 一条折线，八分 = 一个点加一撇，十六分 = 两撇。
 */
function drawRest(els: TabEl[], x: number, y: number, len: number, dotted: boolean) {
  if (len >= 4) {
    // 全休止：挂在线上方（线下面那一小块）
    els.push({ t: "rect", x: x - 6.5, y: y + 1, width: 13, height: 5, cls: "tab-rest" });
  } else if (len >= 2) {
    // 二分休止：坐在线上
    els.push({ t: "rect", x: x - 6.5, y: y - 6, width: 13, height: 5, cls: "tab-rest" });
  } else if (len >= 1) {
    // 四分休止：一条折线（上下两个尖）
    els.push({
      t: "path",
      d: `M ${x - 4.2} ${y - 9.5} L ${x + 3.2} ${y - 2.6} L ${x - 4} ${y + 2.8} L ${x + 3.6} ${y + 9.5}`,
      cls: "tab-rest",
    });
  } else {
    // 八分休止：左上一点 + 一撇；十六分再加一个点
    els.push({ t: "circle", cx: x - 2.8, cy: y - 6.2, r: 2.2, cls: "tab-rest" });
    els.push({
      t: "path",
      d: `M ${x - 0.9} ${y - 6.2} q 5.4 4.6 1 10.2 q -1.6 2.2 1.3 4`,
      cls: "tab-rest",
    });
    if (len < 0.4) {
      els.push({ t: "circle", cx: x - 1.6, cy: y + 1.8, r: 2.2, cls: "tab-rest" });
    }
  }
  if (dotted) {
    els.push({ t: "text", x: x + 8, y, text: "·", cls: "tab-dot", anchor: "middle" });
  }
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

/** 相邻两个**起音**之间最近的间隔（拍）——决定一拍的宽度。
 *  只看时间、不看弦：跨弦的音也挨在同一行上，挤了一样看不清。 */
function closestGap(notes: TabNote[]): number {
  const beats = [...new Set(notes.map((note) => Math.round(note.beat * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
  let min = 1;
  for (let i = 1; i < beats.length; i++) {
    const gap = beats[i] - beats[i - 1];
    if (gap > 0 && gap < min) min = gap;
  }
  return Math.max(min, 1 / 8);
}
