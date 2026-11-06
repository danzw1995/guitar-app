/**
 * 六线谱（TAB）的数据模型与生成器。
 *
 * 这里只算「第几弦第几品、在第几拍」，不画图——画图在 `apps/web/src/components/TabDiagram.tsx`。
 * 拆开的好处：谱子的正确性（音高、拍位）可以在 Node 里单测，不依赖浏览器。
 *
 * 约定：
 * - 弦号 1–6，**1 = 高音 E**（和吉他谱、指板组件一致）；
 * - `beat` 以「拍」为单位，0 起；4/4 一小节 4 拍；
 * - `tech` 标在这一串里的**后一个音**上（击弦目标、勾弦后的低音、滑音终点、推弦的那个音）。
 */

import { CHORD_BY_NAME, type ChordShape } from "./chords.ts";
import { KEY_BY_ID, SCALE_BY_ID, STANDARD_TUNING, pitchClassAt, scalePcs } from "./theory.ts";

export type Tech = "h" | "p" | "s" | "b" | "v" | "x";

export interface TabNote {
  /** 1–6，1 = 高音 E。 */
  s: number;
  /** 品；0 = 空弦。 */
  f: number;
  /** 起拍（0 起，单位一拍）。 */
  beat: number;
  /** 时值（拍）。 */
  dur: number;
  tech?: Tech;
  /** 推弦目标：推高几个半音（只有 `tech === "b"` 用）。 */
  bend?: number;
  /** 扫弦方向（画在谱子下方）。 */
  arrow?: "D" | "U";
}

export interface Tab {
  beatsPerBar: number;
  bars: number;
  notes: TabNote[];
  bpm?: [number, number];
  /** 左上角的品域提示，如 `1–5 品`。 */
  range?: string;
  /** 谱子下面的一句话。 */
  caption?: string;
}

/** 建一个音：少写重复字段。 */
export function n(
  s: number,
  f: number,
  beat: number,
  dur = 1,
  extra: Partial<TabNote> = {},
): TabNote {
  return { s, f, beat, dur, ...extra };
}

function make(notes: TabNote[], opts: Partial<Tab> = {}): Tab {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const lastBeat = notes.reduce((max, note) => Math.max(max, note.beat + note.dur), 0);
  return {
    beatsPerBar,
    bars: opts.bars ?? Math.max(1, Math.ceil(lastBeat / beatsPerBar)),
    notes,
    bpm: opts.bpm,
    range: opts.range,
    caption: opts.caption,
  };
}

/** 直接给音符与拍位（节奏专项里手写各种时值用）。 */
export function tabOf(notes: TabNote[], opts: Partial<Tab> = {}): Tab {
  return make(notes, opts);
}

/** 一串音按等间隔排开（八分、十六分都靠它）。 */
export function sequence(  positions: { s: number; f: number; tech?: Tech; bend?: number }[],
  opts: { step?: number; start?: number; dur?: number } & Partial<Tab> = {},
): Tab {
  const step = opts.step ?? 0.5;
  const start = opts.start ?? 0;
  const notes = positions.map((item, index) =>
    n(item.s, item.f, start + index * step, opts.dur ?? step, {
      tech: item.tech,
      bend: item.bend,
    }),
  );
  return make(notes, opts);
}

/** 和弦的六个按法（6 弦 → 1 弦；-1 = 不弹）。 */
function shapeFrets(chord: ChordShape | undefined): number[] {
  return chord ? chord.frets : [];
}

/** 半音阶爬格子：同一根弦上 from、from+1、from+2… 循环。 */
export function chromaticTab(opts: {
  s: number;
  from?: number;
  span?: number;
  step?: number;
  bars?: number;
}): Tab {
  const { s, from = 1, span = 4, step = 0.25 } = opts;
  const perBar = Math.round(4 / step);
  const bars = opts.bars ?? 1;
  const notes: TabNote[] = [];
  for (let i = 0; i < perBar * bars; i++) {
    notes.push(n(s, from + (i % span), i * step, step));
  }
  return make(notes, {
    bars,
    range: `${from}–${from + span - 1} 品`,
    caption: "指型不变，往上挪就是换把",
  });
}

/** 跨弦爬格子：每根弦四音，6 弦往 1 弦走。 */
export function chromaticAcrossTab(opts: { from?: number; step?: number; bars?: number } = {}): Tab {
  const from = opts.from ?? 1;
  const step = opts.step ?? 0.5;
  const bars = opts.bars ?? 2;
  const perBar = Math.round(4 / step);
  const notes: TabNote[] = [];
  let index = 0;
  for (let s = 6; s >= 1 && index < perBar * bars; s--) {
    for (let k = 0; k < 4 && index < perBar * bars; k++) {
      notes.push(n(s, from + k, index * step, step));
      index++;
    }
  }
  return make(notes, { bars, range: `${from}–${from + 3} 品`, caption: "6 → 1 弦，每弦四音" });
}

/**
 * 音阶跑动：从起点往上走，走到高八度主音就停。
 * 「C 大调一个八度」这类谱子都靠它——起点决定手型。
 */
export function scaleRun(opts: {
  keyId: string;
  scaleId?: string;
  startString?: number;
  startFret?: number;
  fretMax?: number;
  step?: number;
}): Tab {
  const { keyId, scaleId = "major", startString = 5, startFret = 0, fretMax = 5, step = 0.5 } = opts;
  const key = KEY_BY_ID.get(keyId);
  const scale = SCALE_BY_ID.get(scaleId);
  if (!key || !scale) return make([], { range: "—" });

  const pcs = scalePcs(key, scale);
  const tonic = key.tonicPc;
  // 弦号 s（1 = 高音 E）→ STANDARD_TUNING.strings 的下标是 s - 1
  const midiOf = (s: number, f: number) => STANDARD_TUNING.strings[s - 1] + f;
  const startMidi = midiOf(startString, startFret);

  const positions: { s: number; f: number }[] = [];
  let lastMidi = -Infinity;
  let done = false;
  for (let s = startString; s >= 1 && !done; s--) {
    const firstFret = s === startString ? startFret : 0;
    for (let f = firstFret; f <= fretMax; f++) {
      const midi = midiOf(s, f);
      // 音阶跑动必须**严格上行**：换弦后的空弦可能和上一个音同高，不能重复
      if (midi <= lastMidi) continue;
      if (!pcs.includes(((midi % 12) + 12) % 12)) continue;
      positions.push({ s, f });
      lastMidi = midi;
      if (midi > startMidi && ((midi % 12) + 12) % 12 === tonic) {
        done = true;
        break;
      }
    }
  }

  const notes = positions.map((item, index) => n(item.s, item.f, index * step, step));
  return make(notes, {
    range: `${startFret}–${fretMax} 品`,
    caption: "从主音出发走到高八度，中间不停",
  });
}

/** 和弦型：一个和弦按一下，或按节奏型反复扫。 */
export function chordTab(opts: {
  name: string;
  /**
   * 扫弦型：`D` 下扫、`U` 上扫、`null` 空拍。
   * 一维 = 每小节都一样；元素是数组 = 一小节一行（前后对比用）。
   */
  strums?: (("D" | "U" | null) | ("D" | "U" | null)[])[];
  bars?: number;
  step?: number;
  beatsPerBar?: number;
}): Tab {
  const frets = shapeFrets(CHORD_BY_NAME.get(opts.name));
  const step = opts.step ?? 1;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const perBar = Math.round(beatsPerBar / step);
  const bars = opts.bars ?? 1;
  const notes: TabNote[] = [];

  const raw = opts.strums;
  const isPerBar = Array.isArray(raw) && Array.isArray(raw[0]);
  const patterns: ("D" | "U" | null)[][] = !raw
    ? [Array.from({ length: perBar }, () => "D" as const)]
    : isPerBar
      ? (raw as ("D" | "U" | null)[][])
      : [raw as ("D" | "U" | null)[]];
  for (let bar = 0; bar < bars; bar++) {
    const pattern = patterns[Math.min(bar, patterns.length - 1)];
    for (let i = 0; i < perBar; i++) {
      const arrow = pattern[i % pattern.length];
      if (!arrow) continue;
      const beat = bar * beatsPerBar + i * step;
      frets.forEach((fret, index) => {
        if (fret < 0) return;
        notes.push(n(6 - index, fret, beat, step, { arrow }));
      });
    }
  }

  return make(notes, {
    bars,
    beatsPerBar,
    range: `${opts.name} 和弦`,
    caption: "箭头是手的方向，空拍时手照样挥",
  });
}

/** 一串和弦：每个和弦占 beatsEach 拍。 */
export function progressionTab(opts: {
  names: string[];
  beatsEach?: number;
  step?: number;
  strums?: ("D" | "U" | null)[];
}): Tab {
  const beatsEach = opts.beatsEach ?? 4;
  const step = opts.step ?? 1;
  const notes: TabNote[] = [];
  let beat = 0;
  for (const name of opts.names) {
    const frets = shapeFrets(CHORD_BY_NAME.get(name));
    const count = Math.max(1, Math.round(beatsEach / step));
    for (let i = 0; i < count; i++) {
      const arrow = opts.strums ? opts.strums[i % opts.strums.length] : "D";
      if (!arrow) continue;
      frets.forEach((fret, index) => {
        if (fret < 0) return;
        notes.push(n(6 - index, fret, beat + i * step, step, { arrow }));
      });
    }
    beat += beatsEach;
  }
  return make(notes, {
    range: opts.names.join(" → "),
    caption: "换和弦都落在小节的第一拍",
  });
}

/** 击弦：低品拨一次，高品用手指砸出来。 */
export function hammerTab(opts: { s: number; from: number; to: number; pairs?: number; step?: number }): Tab {
  const { s, from, to } = opts;
  const pairs = opts.pairs ?? 4;
  const step = opts.step ?? 0.5;
  const notes: TabNote[] = [];
  for (let i = 0; i < pairs; i++) {
    notes.push(n(s, from, i * 2 * step, step));
    notes.push(n(s, to, i * 2 * step + step, step, { tech: "h" }));
  }
  return make(notes, { range: `${from}→${to} 品`, caption: "第二个音右手不拨，靠手指砸出来" });
}

/** 勾弦：高品拨一次，手指勾开让低品响。 */
export function pullTab(opts: { s: number; from: number; to: number; pairs?: number; step?: number }): Tab {
  const { s, from, to } = opts;
  const pairs = opts.pairs ?? 4;
  const step = opts.step ?? 0.5;
  const notes: TabNote[] = [];
  for (let i = 0; i < pairs; i++) {
    notes.push(n(s, from, i * 2 * step, step));
    notes.push(n(s, to, i * 2 * step + step, step, { tech: "p" }));
  }
  return make(notes, { range: `${from}→${to} 品`, caption: "第二个音靠手指往侧下方勾出来" });
}

/** 击勾往返：低 → 高（击）→ 低（勾）。 */
export function trillTab(opts: { s: number; low: number; high: number; times?: number }): Tab {
  const { s, low, high } = opts;
  const times = opts.times ?? 3;
  const notes: TabNote[] = [n(s, low, 0, 0.5)];
  let beat = 0.5;
  for (let i = 0; i < times; i++) {
    notes.push(n(s, high, beat, 0.5, { tech: "h" }));
    beat += 0.5;
    notes.push(n(s, low, beat, 0.5, { tech: "p" }));
    beat += 0.5;
  }
  return make(notes, { range: `${low}⇄${high} 品`, caption: "h = 击弦，p = 勾弦" });
}

/** 滑音：同一个音滑到目标品，中间不能断。 */
export function slideTab(opts: { s: number; from: number; to: number; times?: number; step?: number }): Tab {
  const { s, from, to } = opts;
  const times = opts.times ?? 2;
  const step = opts.step ?? 1;
  const notes: TabNote[] = [];
  for (let i = 0; i < times; i++) {
    notes.push(n(s, from, i * 2 * step, step));
    notes.push(n(s, to, i * 2 * step + step, step, { tech: "s" }));
  }
  return make(notes, { range: `${from}→${to} 品`, caption: "滑的过程中不能松手，否则音会断" });
}

/** 推弦：按一个音，把它推到更高的音高。 */
export function bendTab(opts: { s: number; f: number; semis: 1 | 2; beats?: number }): Tab {
  const beats = opts.beats ?? 2;
  return make([n(opts.s, opts.f, 0, beats, { tech: "b", bend: opts.semis })], {
    range: `${opts.f} 品`,
    caption: `推高${opts.semis === 1 ? "半" : "全"}音，推到目标音高再停住`,
  });
}

/** 揉弦：长音上做小幅度的推放。 */
export function vibratoTab(opts: { s: number; f: number; beats?: number }): Tab {
  const beats = opts.beats ?? 4;
  return make([n(opts.s, opts.f, 0, beats, { tech: "v" })], {
    range: `${opts.f} 品`,
    caption: "长音全程揉弦，每拍次数要一致",
  });
}

/** 分解和弦：按弦序一根一根拨（如 53231323）。 */
export function arpeggioTab(opts: {
  name: string;
  pattern?: string;
  step?: number;
  bars?: number;
}): Tab {
  const pattern = opts.pattern ?? "53231323";
  const frets = shapeFrets(CHORD_BY_NAME.get(opts.name));
  const step = opts.step ?? 0.5;
  const bars = opts.bars ?? 1;
  const perBar = Math.round(4 / step);
  const notes: TabNote[] = [];
  for (let i = 0; i < perBar * bars; i++) {
    const s = Number(pattern[i % pattern.length]);
    const fret = frets[6 - s];
    notes.push(n(s, fret === undefined || fret < 0 ? 0 : fret, i * step, step));
  }
  return make(notes, {
    bars,
    range: `${opts.name} · ${pattern}`,
    caption: "拇指管低音弦，其余手指管高音弦",
  });
}

/** 直接给一串位置（乐句、riff 用）。 */
export function lickTab(
  positions: { s: number; f: number; tech?: Tech; bend?: number }[],
  opts: { step?: number } & Partial<Tab> = {},
): Tab {
  return sequence(positions, opts);
}
