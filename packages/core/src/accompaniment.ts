/**
 * 伴奏型（整理自「酷音小伟《节奏与节拍》」BV1DA411b7nb 的板块③，28:48 – 44:28）。
 *
 * 板书样式：上面五个和弦图 C–Am–F–G–C，下面五小节的六线谱，弦上用 `x` 标出
 * 「这一拍拨这根弦」，品数不写（由上面的和弦图决定）。所以这里的数据是
 * 「每小节配哪个和弦 + 每拍拨第几根弦」，谱子由 `accompanimentTab()` 拼出来。
 *
 * 版权：分解型与和弦进行是通用知识，可以转录；这里只保留编号与出处，
 * 不复用视频里的任何截图或音频。
 */

import { accompanimentTab, type Tab } from "./tab.ts";
import type { Level } from "./rhythm-drills.ts";

export interface Accompaniment {
  id: string;
  /** 视频里的练习编号（1–17）。 */
  no: number;
  name: string;
  /** 这一条在练什么音型，一句话。 */
  figure: string;
  level: Level;
  bpm: number;
  meter: string;
  beatsPerBar: number;
  /** 和弦进行，和板书上五个和弦图一致。 */
  chords: string[];
  /** 弦号序列的一小节版本，比如 `5-3-2-3-1-3-2-3`。 */
  pattern: string;
  tip: string;
  /** 板书没拍到、按老师讲的内容整理的条目。 */
  inferred?: boolean;
  tab: Tab;
}

interface Spec {
  no: number;
  name: string;
  figure: string;
  bpm: number;
  meter: string;
  beatsPerBar: number;
  level: Level;
  tip: string;
  /** 每小节：和弦 + `[拍位, 弦号]`。 */
  bars: { chord: string; hits: [number, number][] }[];
  inferred?: boolean;
}

/** 低音弦：C 走 5 弦、Am 走 5 弦、F 走 4 弦、G 走 6 弦。 */
const ROOT_STRING: Record<string, number> = { C: 5, Am: 5, F: 4, G: 6 };

/** 一拍的弦号序列，写成 `5-3+2+1`；同一拍上有多根弦（齐奏/琶音）用 `+` 连。 */
export function patternOf(hits: [number, number][]): string {
  const byBeat = new Map<number, number[]>();
  for (const [at, s] of hits) {
    const list = byBeat.get(at) ?? [];
    list.push(s);
    byBeat.set(at, list);
  }
  return [...byBeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, strings]) => strings.join("+"))
    .join("-");
}

function build(spec: Spec): Accompaniment {
  const id = `ac-${String(spec.no).padStart(2, "0")}`;
  const chords = spec.bars.map((bar) => bar.chord);
  const tab = accompanimentTab({
    bars: spec.bars,
    beatsPerBar: spec.beatsPerBar,
    caption: chords.join(" → "),
  });
  return {
    id,
    no: spec.no,
    name: spec.name,
    figure: spec.figure,
    level: spec.level,
    bpm: spec.bpm,
    meter: spec.meter,
    beatsPerBar: spec.beatsPerBar,
    chords,
    pattern: patternOf(spec.bars[0]?.hits ?? []),
    tip: spec.tip,
    inferred: spec.inferred,
    tab,
  };
}

/** 收尾小节：整个和弦从上到下扫一遍。 */
const CLOSE: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
];

/** 一小节里每拍重复同一个音型。 */
function bars(
  first: [number, number][],
  last: [number, number][] = CLOSE,
): { chord: string; hits: [number, number][] }[] {
  return PROGRESSION.map((chord, index) => ({
    chord,
    hits: index === PROGRESSION.length - 1 ? last : first,
  }));
}

/** 音型里写 `0` 当「根音」占位，按小节的和弦换成真实弦号（5/5/4/6）。 */
function withRoots(
  groups: [number, number][][],
): { chord: string; hits: [number, number][] }[] {
  const group = groups.flat();
  return PROGRESSION.map((chord, index) => ({
    chord,
    hits:
      index === PROGRESSION.length - 1
        ? CLOSE
        : group.map(([at, s]): [number, number] => [
            at,
            s === 0 ? ROOT_STRING[chord] : s,
          ]),
  }));
}

/** 五个和弦：前四小节按进行走，末小节固定回到 C。 */
const PROGRESSION = ["C", "Am", "F", "G", "C"] as const;

const SPECS: Spec[] = [
  {
    no: 1,
    name: "二拍分解起步",
    figure: "低音、高音三弦齐拨、四弦、高音三弦齐拨（2/4）",
    bpm: 65,
    meter: "2/4",
    beatsPerBar: 2,
    level: 1,
    tip: "四二拍，一小节只有两个八分位置：先拨低音，再把一、二、三弦一起拨，听完再换下一个和弦。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [0.5, 2],
        [0.5, 1],
        [1, 4],
        [1.5, 3],
        [1.5, 2],
        [1.5, 1],
      ],
    ]),
  },
  {
    no: 2,
    name: "三拍分解",
    figure: "低音 + 两次高音三弦齐拨（3/4）",
    bpm: 80,
    meter: "3/4",
    beatsPerBar: 3,
    level: 1,
    tip: "四三拍，比练习 1 多一拍：低音永远在第一拍，二、三拍都是高音三弦一起拨。",
    bars: withRoots([
      [
        [0, 0],
        [1, 3],
        [1, 2],
        [1, 1],
        [2, 3],
        [2, 2],
        [2, 1],
      ],
    ]),
  },
  {
    no: 3,
    name: "四分音符分解",
    figure: "每拍：低音 + 高音三弦（第一拍）／高音三弦（其余拍）",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 2,
    tip: "一拍一下，先把每拍的位置弹准，再看换和弦时左手有没有提前按好。",
    bars: withRoots([
      [
        [0, 0],
        [0, 3],
        [0, 2],
        [0, 1],
        [1, 3],
        [1, 2],
        [1, 1],
        [2, 3],
        [2, 2],
        [2, 1],
        [3, 3],
        [3, 2],
        [3, 1],
      ],
    ]),
  },
  {
    no: 4,
    name: "八分分解 5323",
    figure: "5-3-2-3-1-3-2-3",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 2,
    tip: "最常见的一条八分分解，右手像钟摆一样来回，速度先稳住再提速。",
    bars: bars([
      [0, 5],
      [0.5, 3],
      [1, 2],
      [1.5, 3],
      [2, 1],
      [2.5, 3],
      [3, 2],
      [3.5, 3],
    ]),
  },
  {
    no: 5,
    name: "八分加十六分",
    figure: "两组「低音、3、1-2、3」，末尾带十六分",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 3,
    tip: "注意第二拍后半的两个十六分（1-2 弦、3 弦）要弹得紧，别拖成八分。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [1, 2],
        [1, 1],
        [1.5, 3],
        [1.75, 2],
        [2, 0],
        [2.5, 3],
        [3, 2],
        [3, 1],
        [3.5, 3],
        [3.75, 2],
      ],
    ]),
  },
  {
    no: 6,
    name: "十六分提前",
    figure: "练习 5 的反向：十六分提前，半拍后补 2 弦",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 3,
    tip: "和练习 5 对照着弹：这条是「十六分在前、半拍在后」，容易和上一条混。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [1, 1],
        [1.25, 3],
        [1.5, 2],
        [2, 0],
        [2.5, 3],
        [3, 2],
        [3.5, 3],
      ],
    ]),
  },
  {
    no: 7,
    name: "附点八分",
    figure: "附点八分 + 十六分，两拍一组",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 4,
    inferred: true,
    tip: "每对音是「长、短」：附点八分占四分之三拍，十六分紧跟在后面。板书右侧第五小节被裁掉，末小节按整和弦扫弦补。",
    bars: withRoots([
      [
        [0, 0],
        [0, 1],
        [0.75, 3],
        [1, 2],
        [1.75, 3],
        [2, 0],
        [2, 1],
        [2.75, 3],
        [3, 2],
        [3.75, 3],
      ],
    ]),
  },
  {
    no: 8,
    name: "附点加延音",
    figure: "5-3-2-1 两组，1 弦带延音",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 4,
    inferred: true,
    tip: "F、G 段的 1 弦两个音上方有延音线（⌒），后一个不重拨，让它和下去。末小节 C 是琶音。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [1, 2],
        [1.75, 1],
        [2, 0],
        [2.5, 3],
        [3, 2],
        [3.75, 1],
      ],
    ]),
  },
  {
    no: 9,
    name: "十六分分解",
    figure: "根音、3、2、1、3 的十六分分解",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 4,
    tip: "每两拍一组，根音落在第 1、3 拍；十六分要匀，别把 2 弦和 1 弦弹成一团。",
    bars: withRoots([
      [
        [0, 0],
        [0.25, 3],
        [0.75, 2],
        [1, 1],
        [1.5, 3],
        [2, 0],
        [2.25, 3],
        [2.75, 2],
        [3, 1],
        [3.5, 3],
      ],
    ]),
  },
  {
    no: 10,
    name: "三连音分解",
    figure: "每拍三等分：根音、3、2 ／ 1、2、3",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 4,
    inferred: true,
    tip: "板书每组音下都标了「3」，一拍要平分成三下，念「da-da-da」而不是「哒哒」。",
    bars: withRoots([
      [
        [0, 0],
        [0.333, 3],
        [0.667, 2],
        [1, 1],
        [1.333, 2],
        [1.667, 3],
        [2, 0],
        [2.333, 3],
        [2.667, 2],
        [3, 1],
        [3.333, 2],
        [3.667, 3],
      ],
    ]),
  },
  {
    no: 11,
    name: "全十六分分解",
    figure: "每拍四个十六分：根音、3、2、1／根音、3、2、3",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 5,
    inferred: true,
    tip: "全是十六分，右手几乎不停；先按 50 的速度把每拍的四个点弹匀，再往 65 走。",
    bars: withRoots([
      [
        [0, 0],
        [0.25, 3],
        [0.5, 2],
        [0.75, 1],
        [1, 0],
        [1.25, 3],
        [1.5, 2],
        [1.75, 3],
        [2, 0],
        [2.25, 3],
        [2.5, 2],
        [2.75, 1],
        [3, 0],
        [3.25, 3],
        [3.5, 2],
        [3.75, 3],
      ],
    ]),
  },
  {
    no: 12,
    name: "八分加休止",
    figure: "5-3-2-1，第三拍后半空出来",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 3,
    inferred: true,
    tip: "第 2 拍后半到第 3 拍之间有一处空拍，手别停、心里继续数，空完再进。",
    bars: [
      { chord: "C", hits: [[0, 5], [0.5, 3], [1, 2], [1.5, 1], [2.5, 3], [3, 2], [3.5, 3]] },
      { chord: "Am", hits: [[0, 5], [0.5, 3], [1, 2], [1.5, 1], [2.5, 3], [3, 2], [3.5, 3]] },
      { chord: "F", hits: [[0, 4], [0.5, 3], [1, 2], [1.5, 1], [2.5, 3], [3, 2], [3.5, 3]] },
      { chord: "G", hits: [[0, 6], [0.5, 3], [1, 2], [1.5, 1], [2.5, 3], [3, 2], [3.5, 3]] },
      { chord: "C", hits: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] },
    ],
  },
  {
    no: 13,
    name: "低音与高音组",
    figure: "根音、高音三弦齐拨，各来两次",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 3,
    tip: "低音单独一下、高音三弦一起一下，像「咚—啦—咚—啦」，只在第 1、3 拍出手。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [0.5, 2],
        [0.5, 1],
        [2, 0],
        [2.5, 3],
        [2.5, 2],
        [2.5, 1],
      ],
    ]),
  },
  {
    no: 14,
    name: "拍弦分解",
    figure: "十六分分解，右手掌根拍弦代替重音",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 5,
    inferred: true,
    tip: "板书在这个位置标了「拍弦」：右手掌根拍一下琴弦当重音，拍完马上接着分解。听不出来就先只弹分解。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [0.75, 2],
        [1, 1],
        [1.5, 2],
        [1.75, 3],
        [2, 0],
        [2.5, 3],
        [2.75, 2],
        [3, 1],
        [3.5, 2],
        [3.75, 3],
      ],
    ]),
  },
  {
    no: 15,
    name: "切分击弦",
    figure: "根音 + 高音三弦，按十六分切分",
    bpm: 65,
    meter: "4/4",
    beatsPerBar: 4,
    level: 5,
    inferred: true,
    tip: "重音不落在正拍上：先响一下、后半拍再补两下，数拍子时把「空」念出来。",
    bars: withRoots([
      [
        [0, 0],
        [0.25, 1],
        [0.25, 2],
        [0.25, 3],
        [1.5, 1],
        [1.5, 2],
        [1.5, 3],
        [2, 0],
        [2.25, 1],
        [2.25, 2],
        [2.25, 3],
        [3.5, 1],
        [3.5, 2],
        [3.5, 3],
      ],
    ]),
  },
  {
    no: 16,
    name: "提速十六分",
    figure: "16 分分解，第 3 拍经过 4 弦",
    bpm: 80,
    meter: "4/4",
    beatsPerBar: 4,
    level: 5,
    inferred: true,
    tip: "这条是 80 的速度，第 3 拍从 4 弦经过一下再回到 1 弦，容易抢拍，先慢速对一遍。",
    bars: withRoots([
      [
        [0, 0],
        [0.5, 3],
        [0.75, 2],
        [1, 1],
        [1.5, 2],
        [1.75, 3],
        [2, 0],
        [2.25, 3],
        [2.5, 1],
      ],
    ]),
  },
  {
    no: 17,
    name: "二四拍综合",
    figure: "2/4 拍上排旋律、下排节奏",
    bpm: 80,
    meter: "2/4",
    beatsPerBar: 2,
    level: 5,
    inferred: true,
    tip: "板书是上下两排：上排是旋律，下排是伴奏节奏。这里只收了下排的节奏型，按二四拍一小节两拍走。",
    bars: withRoots([
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0.5, 1],
        [0.5, 2],
        [0.5, 3],
        [1, 1],
        [1, 2],
        [1, 3],
        [1.5, 1],
        [1.5, 2],
        [1.5, 3],
      ],
    ]),
  },
];

export const ACCOMPANIMENTS: Accompaniment[] = SPECS.map(build);

export function accompanimentById(id: string): Accompaniment | undefined {
  return ACCOMPANIMENTS.find((item) => item.id === id);
}

/** 板书统一用 C–Am–F–G–C，个别条目的最后一小节仍是 C。 */
export { PROGRESSION as ACCOMPANIMENT_CHORDS };
