/**
 * 节奏专项：时值练习、扫弦节奏型、风格片段。
 *
 * 和「练习页」的区别：那里是每天按时间排的综合计划，这里是**针对一个弱点的专项**——
 * 时值不稳就练时值，扫弦型不够就挑节奏型，想直接上手就弹片段。
 *
 * 所有条目都带六线谱（`Tab`），和练习页共用同一套渲染。
 */

import { chordTab, n, progressionTab, tabOf, type Tab } from "./tab.ts";

export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVEL_LABEL: Record<Level, string> = {
  1: "入门",
  2: "基础",
  3: "进阶",
  4: "较难",
  5: "挑战",
};

export interface RhythmDrill {
  id: string;
  name: string;
  level: Level;
  /** 练的是什么时值/感觉。 */
  focus: string;
  bpm: [number, number];
  /** 数拍词，跟着念。 */
  count: string;
  tips: string[];
  pass: string;
  tab: Tab;
}

/** 在 5 弦 3 品上按 [拍位, 时值] 摆音，专门练时值。 */
function rhythm(
  fret: number,
  beats: [number, number][],
  opts: { s?: number; bars?: number; beatsPerBar?: number } = {},
): Tab {
  return tabOf(
    beats.map(([beat, dur]) => n(opts.s ?? 5, fret, beat, dur)),
    { bars: opts.bars ?? 1, beatsPerBar: opts.beatsPerBar ?? 4 },
  );
}


export const RHYTHM_DRILLS: RhythmDrill[] = [
  {
    id: "rt-quarter-eighth",
    name: "四分 → 八分",
    level: 1,
    focus: "先数稳，再切细：一拍一下 → 一拍两下",
    bpm: [60, 80],
    count: "1 2 3 4 | 1 & 2 & 3 & 4 &",
    tips: [
      "第一小节每拍一下，第二小节每拍两下；脚一直打拍子",
      "切到八分时手（或拨片）不要突然加速，只是同一拍里多动一下",
    ],
    pass: "60 BPM 连弹 4 遍，两小节之间不卡",
    tab: rhythm(
      3,
      [
        [0, 1], [1, 1], [2, 1], [3, 1],
        [4, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 0.5], [6.5, 0.5], [7, 0.5], [7.5, 0.5],
      ],
      { bars: 2 },
    ),
  },
  {
    id: "rt-sixteenth",
    name: "十六分均匀",
    level: 2,
    focus: "一拍四下，四下的间隔必须一样",
    bpm: [60, 90],
    count: "1 e & a 2 e & a 3 e & a 4 e & a",
    tips: [
      "先用嘴念 `1 e & a`，念对了再上琴",
      "每 4 个音停一下，听第 3、4 下有没有赶",
    ],
    pass: "80 BPM 一小节 16 下，均匀不错位",
    tab: rhythm(
      3,
      Array.from({ length: 16 }, (_, i) => [i / 4, 0.25] as [number, number]),
    ),
  },
  {
    id: "rt-switch",
    name: "八分 → 十六分切换",
    level: 3,
    focus: "同一首曲子里最常见的变化：一小节 8 分、一小节 16 分",
    bpm: [60, 80],
    count: "1 & 2 & | 1 e & a 2 e & a",
    tips: [
      "脚（或头）永远打四分拍，切到十六分时脚不要跟着变快",
      "切换的那一拍最容易抢，慢到能听见自己",
    ],
    pass: "70 BPM 两小节一轮，切换处不断拍",
    tab: rhythm(
      3,
      [
        [0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5],
        ...Array.from({ length: 16 }, (_, i) => [4 + i / 4, 0.25] as [number, number]),
      ],
      { bars: 2 },
    ),
  },
  {
    id: "rt-triplet",
    name: "三连音基础",
    level: 2,
    focus: "一拍平均三等分——不是「弹快一点」",
    bpm: [60, 80],
    count: "1 ta ta 2 ta ta 3 ta ta 4 ta ta",
    tips: [
      "先把一拍分成三份念出来：`1-ta-ta`，三下之间完全等距",
      "跟节拍器：拍点和每组的第一个音重合，后面两个音不要挤到最后",
    ],
    pass: "60 BPM 一小节 12 个音，三下均匀",
    tab: rhythm(
      3,
      Array.from({ length: 12 }, (_, i) => [(i * 1) / 3, 1 / 3] as [number, number]),
    ),
  },
  {
    id: "rt-triplet-vs-eighth",
    name: "三连音 vs 八分",
    level: 3,
    focus: "两组听起来很像，但一组三下、一组两下",
    bpm: [60, 75],
    count: "1 ta ta 2 ta ta | 1 & 2 &",
    tips: [
      "先交替：一小节三连音、一小节八分，各 2 遍",
      "念拍词是唯一可靠的办法，别凭手感",
    ],
    pass: "60 BPM 交替 4 轮，两种感觉分得清",
    tab: rhythm(
      3,
      [
        [0, 1 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3],
        [1, 1 / 3], [4 / 3, 1 / 3], [5 / 3, 1 / 3],
        [2, 1 / 3], [7 / 3, 1 / 3], [8 / 3, 1 / 3],
        [3, 1 / 3], [10 / 3, 1 / 3], [11 / 3, 1 / 3],
        [4, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 0.5], [6.5, 0.5], [7, 0.5], [7.5, 0.5],
      ],
      { bars: 2 },
    ),
  },
  {
    id: "rt-dotted",
    name: "附点八分（长短）",
    level: 3,
    focus: "长-短、长-短，像走路一样一瘸一拐",
    bpm: [60, 80],
    count: "1 . & | 2 . & | 3 . & | 4 . &",
    tips: [
      "每拍里第一个音占 3/4，第二个音只占 1/4",
      "先念「长—短」，短的那个音不要提前",
    ],
    pass: "70 BPM 一小节 8 下，长短比例稳定",
    tab: rhythm(3, [
      [0, 0.75], [0.75, 0.25],
      [1, 0.75], [1.75, 0.25],
      [2, 0.75], [2.75, 0.25],
      [3, 0.75], [3.75, 0.25],
    ]),
  },
  {
    id: "rt-syncopation",
    name: "切分（弱拍起）",
    level: 4,
    focus: "音落在「&」上，拍点上反而不弹",
    bpm: [60, 75],
    count: "1 ( & ) 2 & ( 3 ) & 4 &",
    tips: [
      "脚照常打 1 2 3 4，音故意错开半拍",
      "先空手拍腿：拍点不拍、半拍拍",
    ],
    pass: "60 BPM 8 小节，脚和手的错位稳住",
    tab: rhythm(3, [
      [0.5, 0.5],
      [1, 0.5],
      [2.5, 0.5],
      [3, 0.5],
      [3.5, 0.5],
    ]),
  },
  {
    id: "rt-rest",
    name: "空拍与休止",
    level: 3,
    focus: "该不弹的地方不弹，手不能停",
    bpm: [60, 80],
    count: "1 & ( ) & 3 & ( ) &",
    tips: [
      "空出来的地方手照样挥，只是不碰弦——这是扫弦好看的关键",
      "数出声，把空拍也数出来",
    ],
    pass: "70 BPM 8 小节，空拍处手不停、拍不掉",
    tab: rhythm(3, [
      [0, 0.5], [0.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5],
    ]),
  },
  {
    id: "rt-6-8",
    name: "6/8 复拍子",
    level: 4,
    focus: "六下听成两个大拍，每大拍三下",
    bpm: [70, 90],
    count: "1 2 3 4 5 6（重音在 1 和 4）",
    tips: [
      "不要数成六个平拍，要听出「咚-哒-哒 咚-哒-哒」",
      "先拍腿：两个大拍，每个大拍三下",
    ],
    pass: "80 BPM 一小节 6 下，重音在 1 和 4",
    tab: rhythm(
      3,
      [
        [0, 0.5], [0.5, 0.5], [1, 0.5],
        [1.5, 0.5], [2, 0.5], [2.5, 0.5],
      ],
      { beatsPerBar: 3 },
    ),
  },
  {
    id: "rt-mixed",
    name: "混合：8 分 + 16 分 + 三连音",
    level: 5,
    focus: "真实曲子里的样子：一小节里换三种时值",
    bpm: [60, 75],
    count: "1 & 2 e & a 3 ta ta 4 &",
    tips: [
      "拆开练：先把 16 分那半拍单独练，再接起来",
      "脚的拍点不能变，变的只是手上动的次数",
    ],
    pass: "60 BPM 两小节一轮，三种时值都不塌",
    tab: rhythm(3, [
      [0, 0.5], [0.5, 0.5], [1, 0.25], [1.25, 0.25], [1.5, 0.25], [1.75, 0.25], [2, 1 / 3], [2 + 1 / 3, 1 / 3], [2 + 2 / 3, 1 / 3], [3, 0.5], [3.5, 0.5],
    ]),
  },
];

export interface StrumPatternItem {
  id: string;
  name: string;
  level: Level;
  chord: string;
  /** 每小节的扫弦（8 分或 16 分格子）。 */
  slots: (("D" | "U" | null))[];
  step: number;
  beatsPerBar?: number;
  count: string;
  tip: string;
  tab: Tab;
}

function strum(
  chord: string,
  slots: (("D" | "U" | null))[],
  step: number,
  beatsPerBar = 4,
): Tab {
  return chordTab({ name: chord, strums: slots, step, beatsPerBar, bars: 1 });
}

/** 常用扫弦节奏型：从四分到放克十六分。 */
export const STRUM_LIBRARY: StrumPatternItem[] = [
  {
    id: "st-quarter",
    name: "四分下扫",
    level: 1,
    chord: "C",
    slots: ["D", null, "D", null, "D", null, "D", null],
    step: 0.5,
    count: "1 2 3 4",
    tip: "只动手腕，每一下都落在拍点上。所有扫弦的起点。",
    tab: strum("C", ["D", null, "D", null, "D", null, "D", null], 0.5),
  },
  {
    id: "st-eighth",
    name: "八分上下",
    level: 1,
    chord: "Em",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    step: 0.5,
    count: "1 & 2 & 3 & 4 &",
    tip: "手像钟摆，上下都要碰弦。先空手挥 8 小节再上弦。",
    tab: strum("Em", ["D", "U", "D", "U", "D", "U", "D", "U"], 0.5),
  },
  {
    id: "st-folk",
    name: "民谣经典 D · DU · UDU",
    level: 2,
    chord: "C",
    slots: ["D", null, "D", "U", null, "U", "D", "U"],
    step: 0.5,
    count: "1 · 2& · &4&",
    tip: "弹唱最常用。难点在第 3、5 格：手要挥、弦不碰。",
    tab: strum("C", ["D", null, "D", "U", null, "U", "D", "U"], 0.5),
  },
  {
    id: "st-walk",
    name: "下 · 下上 · 下上",
    level: 2,
    chord: "G",
    slots: ["D", null, "D", "U", null, "D", "U", null],
    step: 0.5,
    count: "1 · 2& · 3& ·",
    tip: "比民谣型少一下，适合慢歌；第 6 格是弱起，别抢。",
    tab: strum("G", ["D", null, "D", "U", null, "D", "U", null], 0.5),
  },
  {
    id: "st-ballad",
    name: "抒情慢歌（8 分 + 空拍）",
    level: 2,
    chord: "Am",
    slots: ["D", null, "D", null, "D", "U", "D", null],
    step: 0.5,
    count: "1 · 2 · 3& 4·",
    tip: "每小节最后留空，给下一句呼吸。",
    tab: strum("Am", ["D", null, "D", null, "D", "U", "D", null], 0.5),
  },
  {
    id: "st-sixteenth",
    name: "十六分扫弦",
    level: 3,
    chord: "C",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U"],
    step: 0.25,
    count: "1 e & a 2 e & a 3 e & a 4 e & a",
    tip: "手腕幅度要小，不然一秒就酸。先 60 BPM。",
    tab: strum("C", ["D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U"], 0.25),
  },
  {
    id: "st-sync",
    name: "切分扫弦",
    level: 3,
    chord: "Em",
    slots: [null, "D", "U", null, "D", "U", null, "D"],
    step: 0.5,
    count: "· 1& · 2& · 3",
    tip: "重音落在「&」上，拍点反而轻。流行歌里到处都是。",
    tab: strum("Em", [null, "D", "U", null, "D", "U", null, "D"], 0.5),
  },
  {
    id: "st-palm",
    name: "闷音八分",
    level: 3,
    chord: "E",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    step: 0.5,
    count: "1 & 2 & 3 & 4 &",
    tip: "掌根压在琴桥附近，扫出来是短促的「嚓」。压太前会闷死。",
    tab: strum("E", ["D", "U", "D", "U", "D", "U", "D", "U"], 0.5),
  },
  {
    id: "st-waltz",
    name: "3/4 圆舞曲",
    level: 3,
    chord: "C",
    slots: ["D", null, "D", "U", null, "U"],
    step: 0.5,
    beatsPerBar: 3,
    count: "1 · 2& · &",
    tip: "第一拍重、后两拍轻，像「嘭 恰 恰」。",
    tab: strum("C", ["D", null, "D", "U", null, "U"], 0.5, 3),
  },
  {
    id: "st-six-eight",
    name: "6/8 民谣",
    level: 4,
    chord: "G",
    slots: ["D", "U", "U", "D", "U", "U"],
    step: 0.5,
    beatsPerBar: 3,
    count: "1 2 3 | 4 5 6",
    tip: "两个大拍，每拍三下；第二、三下轻一点。",
    tab: strum("G", ["D", "U", "U", "D", "U", "U"], 0.5, 3),
  },
  {
    id: "st-funk",
    name: "放克十六分（单音切分）",
    level: 5,
    chord: "Am",
    slots: ["D", null, "D", "U", null, "U", "D", null, "D", "U", null, "U", "D", "U", null, "U"],
    step: 0.25,
    count: "1 · 2& · & 3 · 4· · &",
    tip: "很多格是空的，重音都在弱位；先慢速把「空」数清楚。",
    tab: strum("Am", ["D", null, "D", "U", null, "U", "D", null, "D", "U", null, "U", "D", "U", null, "U"], 0.25),
  },
  {
    id: "st-reggae",
    name: "雷鬼 skank（反拍）",
    level: 5,
    chord: "D",
    slots: [null, "U", null, "U", null, "U", null, "U"],
    step: 0.5,
    count: "· & · & · & · &",
    tip: "只扫反拍，正拍留空；上扫要短、要干。",
    tab: strum("D", [null, "U", null, "U", null, "U", null, "U"], 0.5),
  },
];

export interface SongSnippet {
  id: string;
  name: string;
  /** 风格说明，不引用具体作品名。 */
  style: string;
  level: Level;
  bpm: [number, number];
  chords: string[];
  tip: string;
  tab: Tab;
}

/** 风格片段：常见曲子里反复出现的那几种进行 + 节奏。 */
export const SONG_SNIPPETS: SongSnippet[] = [
  {
    id: "sn-folk",
    name: "民谣四和弦（C–G–Am–F）",
    style: "流行 / 民谣最常见的进行，副歌几乎都是它",
    level: 2,
    bpm: [60, 80],
    chords: ["C", "G", "Am", "F"],
    tip: "一小节一个和弦，配「D · DU · UDU」；换和弦都落在第 1 拍。",
    tab: progressionTab({
      names: ["C", "G", "Am", "F"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },
  {
    id: "sn-blues",
    name: "12 小节布鲁斯（前四小节）",
    style: "布鲁斯 / 摇滚的骨架",
    level: 3,
    bpm: [70, 90],
    chords: ["G7", "G7", "C7", "G7"],
    tip: "完整 12 小节是 A A A A | D D A A | E D A E；谱例只画前四小节。",
    tab: progressionTab({
      names: ["G7", "G7", "C7", "G7"],
      beatsEach: 4,
      step: 1,
    }),
  },
  {
    id: "sn-shuffle",
    name: "Shuffle 布鲁斯节奏",
    style: "长-短的三连音感觉",
    level: 4,
    bpm: [70, 90],
    chords: ["G7", "C7"],
    tip: "把八分弹成「长-短」（三连音去掉中间那个），听起来会「摇摆」。",
    tab: progressionTab({
      names: ["G7", "C7"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", "U", null, "U", "D", null],
    }),
  },
  {
    id: "sn-power",
    name: "摇滚五和弦（8 分推进）",
    style: "朋克 / 摇滚的八分音符墙",
    level: 3,
    bpm: [90, 120],
    chords: ["E", "E", "A", "B"],
    tip: "只用低音两根弦，全部下扫，跟着底鼓走；稳了再提速。",
    tab: progressionTab({
      names: ["E", "E", "A", "B"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", null, "D", null, "D", null],
    }),
  },
  {
    id: "sn-ballad",
    name: "抒情分解（53231323）",
    style: "慢歌前奏最常见的分解",
    level: 3,
    bpm: [60, 80],
    chords: ["Am", "F", "C", "G"],
    tip: "拇指管低音，其余三指管高音；每一根都要一样响。",
    tab: progressionTab({
      names: ["Am", "F", "C", "G"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", null, "D", null, "D", null],
    }),
  },
  {
    id: "sn-six-eight",
    name: "6/8 叙事曲",
    style: "「咚-哒-哒」的三拍子感觉",
    level: 4,
    bpm: [70, 90],
    chords: ["G"],
    tip: "六下听成两大拍；一小节换一个和弦，重音在 1 和 4。",
    tab: chordTab({
      name: "G",
      strums: ["D", null, "D", "U", null, "U"],
      step: 0.5,
      beatsPerBar: 3,
      bars: 1,
    }),
  },
];

export function rhythmDrillById(id: string): RhythmDrill | undefined {
  return RHYTHM_DRILLS.find((drill) => drill.id === id);
}

export function strumLibraryById(id: string): StrumPatternItem | undefined {
  return STRUM_LIBRARY.find((item) => item.id === id);
}

export function snippetById(id: string): SongSnippet | undefined {
  return SONG_SNIPPETS.find((item) => item.id === id);
}
