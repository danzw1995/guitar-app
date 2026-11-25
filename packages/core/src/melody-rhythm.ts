/**
 * 旋律节奏（v0.162.0）。
 *
 * 节奏卡片原来只有箭头和时值，练起来像节拍器——没有音高就没有「像一首歌」的
 * 感觉。这一批把**公有领域的熟悉旋律**（小星星 / 欢乐颂 / 两只老虎）拆成
 * 「一拍一个音」的骨架，再用三种节奏型去套：
 *
 *   1. 全四分：骨架原样弹。
 *   2. 全八分：每拍拆成两个八分，音高不变（像把旋律「点数加倍」）。
 *   3. 前八后十六：每拍后半拍拆成两个十六分，第二个十六分取**上邻音**——
 *      这一下是真正的旋律装饰，练的是「后半拍要动起来」。
 *
 * 版权：小星星、两只老虎是传统儿歌，欢乐颂的旋律（贝多芬，1824）早已进入
 * 公有领域；这里只写音名与时值，不引用任何录音、乐谱排版或教程的谱面。
 */

import { n, tabOf, type Tab, type TabNote } from "./tab.ts";
import type { Level } from "./rhythm-drills.ts";

/** 一拍之内怎么切：`step` 是相对这一拍骨架音的调内级数偏移。 */
interface Cell {
  offset: number;
  dur: number;
  step: number;
}

interface Rhythm {
  id: string;
  label: string;
  /** 一拍的切法。 */
  cells: Cell[];
  level: Level;
}

const RHYTHMS: Rhythm[] = [
  {
    id: "quarter",
    label: "四分音符",
    cells: [{ offset: 0, dur: 1, step: 0 }],
    level: 1,
  },
  {
    id: "eighth",
    label: "八分音符（同音重复）",
    cells: [
      { offset: 0, dur: 0.5, step: 0 },
      { offset: 0.5, dur: 0.5, step: 0 },
    ],
    level: 2,
  },
  {
    id: "mixed",
    label: "前八后十六（后半拍加上邻音）",
    cells: [
      { offset: 0, dur: 0.5, step: 0 },
      { offset: 0.5, dur: 0.25, step: 0 },
      { offset: 0.75, dur: 0.25, step: 1 },
    ],
    level: 3,
  },
];

/** C 大调从 C4 起的一个八度，下标就是「调内级数」。 */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];

/** 1–3 弦的空弦音高（1 = 高音 E）。 */
const OPEN: Record<number, number> = { 1: 64, 2: 59, 3: 55 };

/** 一条旋律骨架：`degrees` 是「每拍一个调内级数（0 = C4）」。 */
export interface Melody {
  id: string;
  name: string;
  source: string;
  /** 每拍一个调内级数（0 = C4），共 8 拍 = 2 小节 4/4。 */
  degrees: number[];
  /** 生成出来的旋律给一句说明。 */
  note?: string;
}

/** 公有领域的熟悉旋律（v0.164.0 起给「按技能生成」当骨架用，所以导出）。 */
export const FAMILIAR: Melody[] = [
  {
    id: "star",
    name: "小星星",
    source: "传统儿歌",
    degrees: [0, 0, 4, 4, 5, 5, 4, 4],
  },
  {
    id: "joy",
    name: "欢乐颂",
    source: "贝多芬《第九交响曲》主题（公有领域）",
    degrees: [2, 2, 3, 4, 4, 3, 2, 1],
  },
  {
    id: "tiger",
    name: "两只老虎",
    source: "传统儿歌（法国民歌《Frère Jacques》）",
    degrees: [0, 1, 2, 0, 0, 1, 2, 0],
  },
];

/** 确定性随机：同一个种子生成同一条旋律。 */
function makeRandom(seed: number): () => number {
  let state = seed % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** 级进为主的骨架：偶尔跳三度，不许连着三个同音，收在 C 上。 */
function skeleton(seed: number, jumpy: boolean): number[] {
  const random = makeRandom(seed);
  const degrees: number[] = [0];
  let current = 0;
  let same = 0;
  for (let index = 1; index < 7; index += 1) {
    const roll = random();
    let move: number;
    if (roll < 0.12 && jumpy) move = random() < 0.5 ? 2 : -2;
    else if (roll < 0.32) move = 0;
    else move = random() < 0.5 ? 1 : -1;
    let next = current + move;
    if (next < 0) next = 1;
    if (next > 5) next = 4;
    if (next === current) {
      same += 1;
      if (same >= 2) {
        next = current + (current < 3 ? 1 : -1);
        same = 0;
      }
    } else {
      same = 0;
    }
    degrees.push(next);
    current = next;
  }
  degrees.push(0);
  return degrees;
}

const GENERATED: Melody[] = [
  {
    id: "step",
    name: "级进到底",
    source: "算法生成（种子 20261124）",
    degrees: skeleton(20261124, false),
    note: "全是相邻音级，先把「音高跟着拍子走」练顺。",
  },
  {
    id: "jump",
    name: "偶尔跳一下",
    source: "算法生成（种子 61124）",
    degrees: skeleton(61124, true),
    note: "大体级进，偶尔跳三度——第二遍再练的时候注意别抢拍。",
  },
];

/** 音高落在哪根弦的哪个品：1–3 弦、0–12 品里挑最低的。 */
function positionOf(midi: number): { s: number; f: number } {
  let best: { s: number; f: number } | null = null;
  for (const s of [1, 2, 3]) {
    const fret = midi - OPEN[s];
    if (fret < 0 || fret > 12) continue;
    if (!best || fret < best.f) best = { s, f: fret };
  }
  return best ?? { s: 1, f: Math.max(0, Math.min(12, midi - OPEN[1])) };
}

function tabOfMelody(melody: Melody, rhythm: Rhythm, bpm: number): Tab {
  const notes: TabNote[] = [];
  melody.degrees.forEach((degree, beatIndex) => {
    for (const cell of rhythm.cells) {
      const step = Math.max(0, Math.min(7, degree + cell.step));
      const midi = 60 + MAJOR_STEPS[step];
      const spot = positionOf(midi);
      notes.push(n(spot.s, spot.f, beatIndex + cell.offset, cell.dur));
    }
  });
  return tabOf(notes, {
    beatsPerBar: 4,
    bars: 2,
    bpm: [bpm, bpm],
    caption: `${melody.name} · ${rhythm.label}`,
  });
}

export interface MelodyDrill {
  id: string;
  no: number;
  name: string;
  /** 旋律出处（传统儿歌 / 公有领域 / 算法生成）。 */
  source: string;
  rhythm: string;
  level: Level;
  bpm: [number, number];
  meter: "4/4";
  tip: string;
  tab: Tab;
}

const LEVEL_BPM: Partial<Record<Level, [number, number]>> = {
  1: [60, 80],
  2: [56, 76],
  3: [50, 70],
};

const RHYTHM_TIP: Record<string, string> = {
  quarter: "第一遍只看音高、不看节奏，心里数四拍；每一拍落一个音。",
  eighth: "每拍两个音是同一个音高——和弦乐器上这条最容易抢快，跟着节拍器数「一 二」。",
  mixed: "后半拍的两个十六分里，第二个音是上邻音：手指要提前预备好，别等落下去再找。",
};

function build(no: number, melody: Melody, rhythm: Rhythm): MelodyDrill {
  const level = rhythm.level;
  const bpm = LEVEL_BPM[level] ?? [56, 76];
  const tip =
    melody.note !== undefined
      ? `${melody.note}${RHYTHM_TIP[rhythm.id]}`
      : RHYTHM_TIP[rhythm.id];
  return {
    id: `md-${String(no).padStart(2, "0")}`,
    no,
    name: `${melody.name} · ${rhythm.label}`,
    source: melody.source,
    rhythm: rhythm.label,
    level,
    bpm,
    meter: "4/4",
    tip,
    tab: tabOfMelody(melody, rhythm, bpm[0]),
  };
}

export const MELODY_DRILLS: MelodyDrill[] = (() => {
  const drills: MelodyDrill[] = [];
  let no = 1;
  for (const melody of FAMILIAR) {
    for (const rhythm of RHYTHMS) {
      drills.push(build(no, melody, rhythm));
      no += 1;
    }
  }
  for (const melody of GENERATED) {
    for (const rhythm of RHYTHMS.filter((item) => item.id !== "quarter")) {
      drills.push(build(no, melody, rhythm));
      no += 1;
    }
  }
  return drills;
})();

export function melodyDrillById(id: string): MelodyDrill | undefined {
  return MELODY_DRILLS.find((drill) => drill.id === id);
}
