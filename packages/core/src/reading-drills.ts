/**
 * 跟读练习（整理自「酷音小伟《节奏与节拍》」BV1DA411b7nb 的板书）。
 *
 * 这批练习的重点**不是上琴**，而是老师反复强调的那套方法：
 * **嘴念变化的节奏型，脚/手打固定的拍子**。所以谱面用一条节奏线 + X，
 * 和视频板书一致，而不是六线谱。
 *
 * 版权：节奏型与练习方法是通用知识，可以转录；这里只保留编号与出处，
 * 不复用视频里的任何截图或音频。
 */

import { n, tabOf, type Tab } from "./tab.ts";
import type { Level } from "./rhythm-drills.ts";

export interface ReadingDrill {
  id: string;
  /** 视频里的练习编号（1–17）。 */
  no: number;
  name: string;
  meter: "2/4" | "3/4" | "4/4" | "6/8";
  level: Level;
  focus: string;
  /** 数拍词，跟着念。 */
  count: string;
  bpm: [number, number];
  tips: string[];
  pass: string;
  /** 一条节奏线 + X。 */
  tab: Tab;
}

/** 把「一拍之内」的音型重复成整小节，再重复成整条练习。 */
function bar(pattern: [number, number][], beats: number, bars: number): [number, number][] {
  const out: [number, number][] = [];
  for (let b = 0; b < beats; b++) {
    for (const [offset, dur] of pattern) out.push([b + offset, dur]);
  }
  const full: [number, number][] = [];
  for (let i = 0; i < bars; i++) {
    for (const [beat, dur] of out) full.push([beat + i * beats, dur]);
  }
  return full;
}

/** 朗读谱：单线 + X。 */
function line(
  beats: [number, number][],
  opts: { beatsPerBar: number; bars: number },
): Tab {
  return tabOf(
    beats.map(([beat, dur]) => n(6, 0, beat, dur)),
    {
      beatsPerBar: opts.beatsPerBar,
      bars: opts.bars,
      display: "rhythm",
    },
  );
}

const SOURCE = "BV1DA411b7nb";

export const READING_DRILLS: ReadingDrill[] = [
  {
    id: "rd-01",
    no: 1,
    name: "2/4 四分音符",
    meter: "2/4",
    level: 1,
    focus: "一拍一下，先分清强和弱",
    count: "哒 哒（强 弱）",
    bpm: [65, 80],
    tips: [
      "脚踩下去是前半拍，抬起来是后半拍；一拍 = 踩下 + 抬起",
      "嘴里念「哒 哒」，第一下重一点，第二下轻",
    ],
    pass: "65 BPM，2 小节 4 下，强弱能听出来",
    tab: line(bar([[0, 1]], 2, 2), { beatsPerBar: 2, bars: 2 }),
  },
  {
    id: "rd-02",
    no: 2,
    name: "3/4 四分音符",
    meter: "3/4",
    level: 1,
    focus: "三拍一组，强 弱 弱",
    count: "哒 哒 哒（强 弱 弱）",
    bpm: [65, 80],
    tips: ["每小节第一拍重、后两拍轻，像「嘭 恰 恰」", "脚不要乱，一直是均匀的三下"],
    pass: "65 BPM，两小节不断拍",
    tab: line(bar([[0, 1]], 3, 2), { beatsPerBar: 3, bars: 2 }),
  },
  {
    id: "rd-03",
    no: 3,
    name: "4/4 四分音符",
    meter: "4/4",
    level: 1,
    focus: "四拍一组，强 弱 次强 弱",
    count: "哒 哒 哒 哒",
    bpm: [65, 80],
    tips: ["第 3 拍是「次强」，比第 2、4 拍稍重一点", "这是后面所有 4/4 节奏型的骨架"],
    pass: "65 BPM，两小节强弱分明",
    tab: line(bar([[0, 1]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-04",
    no: 4,
    name: "4/4 八分音符",
    meter: "4/4",
    level: 2,
    focus: "一拍两下：哒哒 哒哒",
    count: "哒哒 哒哒 哒哒 哒哒",
    bpm: [65, 85],
    tips: ["脚还是每拍一次，嘴里一拍念两下", "不要跟着八分音符把脚也踩成两下——这是最容易犯的错"],
    pass: "65 BPM，两小节念得均匀、脚不乱",
    tab: line(bar([[0, 0.5], [0.5, 0.5]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-05",
    no: 5,
    name: "前八后十六",
    meter: "4/4",
    level: 2,
    focus: "一拍三下：哒 哒哒",
    count: "哒 哒哒 ×4",
    bpm: [65, 80],
    tips: ["前半拍一下（八分），后半拍两下（两个十六分）", "后半拍的两下要快而均匀，别抢到前面"],
    pass: "65 BPM，一拍里的三下分得清",
    tab: line(bar([[0, 0.5], [0.5, 0.25], [0.75, 0.25]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-06",
    no: 6,
    name: "前十六后八（也是切分感）",
    meter: "4/4",
    level: 2,
    focus: "一拍三下：哒哒 哒",
    count: "哒哒 哒 ×4",
    bpm: [65, 80],
    tips: ["和练习 5 反过来：前半拍两下、后半拍一下", "视频里练习 6 与 11 用的是同一个音型，这里合并成一条"],
    pass: "65 BPM，与练习 5 交替念也不乱",
    tab: line(bar([[0, 0.25], [0.25, 0.25], [0.5, 0.5]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-07",
    no: 7,
    name: "连续十六分音符",
    meter: "4/4",
    level: 3,
    focus: "一拍四下：1哒哒哒 2哒哒哒",
    count: "1哒哒哒 2哒哒哒 3哒哒哒 4哒哒哒",
    bpm: [60, 75],
    tips: ["先把「1」念重一点，后面三下轻", "四下之间必须完全等距，慢比快重要"],
    pass: "60 BPM，一小节 16 下均匀",
    tab: line(bar([[0, 0.25], [0.25, 0.25], [0.5, 0.25], [0.75, 0.25]], 4, 2), {
      beatsPerBar: 4,
      bars: 2,
    }),
  },
  {
    id: "rd-08",
    no: 8,
    name: "八分 + 休止",
    meter: "4/4",
    level: 3,
    focus: "第 3 拍前半空出来：哒哒 哒哒 空哒 哒哒",
    count: "哒哒 哒哒 空哒 哒哒",
    bpm: [65, 80],
    tips: ["空出来的地方嘴里念「空」，脚照样踩", "空拍最容易抢——念出来就不会早"],
    pass: "65 BPM，空拍处不提前",
    tab: line(
      [
        [0, 0.5], [0.5, 0.5],
        [1, 0.5], [1.5, 0.5],
        [2.5, 0.5],
        [3, 0.5], [3.5, 0.5],
        [4, 0.5], [4.5, 0.5],
        [5, 0.5], [5.5, 0.5],
        [6.5, 0.5],
        [7, 0.5], [7.5, 0.5],
      ],
      { beatsPerBar: 4, bars: 2 },
    ),
  },
  {
    id: "rd-09",
    no: 9,
    name: "附点节奏型",
    meter: "4/4",
    level: 3,
    focus: "长-短：一拍的前 3/4 给第一个音",
    count: "哒——哒 ×4（长 短）",
    bpm: [65, 80],
    tips: ["附点的本质是「延长」，第二个音被挤到一拍的最后一小节", "听起来有拖沓感，别把第二下提前"],
    pass: "65 BPM，长短比例稳定",
    tab: line(bar([[0, 0.75], [0.75, 0.25]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-10",
    no: 10,
    name: "附点节奏型（反向）",
    meter: "4/4",
    level: 3,
    focus: "短-长：第一个音在拍点，第二个音拖过下一拍",
    count: "哒 哒—— ×4（短 长）",
    bpm: [65, 80],
    tips: ["后半拍那个音会延续到下一拍的开头，所以听起来像「抢」", "脚只管踩拍，别跟着音走"],
    pass: "65 BPM，拖过去的那一下不断",
    tab: line(bar([[0, 0.5], [0.5, 0.75]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-12",
    no: 12,
    name: "加入休止符",
    meter: "4/4",
    level: 3,
    focus: "整拍空出来：哒哒 空 哒哒 空",
    count: "哒哒 空 哒哒 空｜空 哒哒 空 哒哒",
    bpm: [65, 80],
    tips: ["0 就是空拍，嘴里念「空」，脚不能停", "第二小节把空拍挪到第 1、3 拍，注意别慌"],
    pass: "65 BPM，两小节空拍位置不错",
    tab: line(
      [
        [0, 0.5], [0.5, 0.5],
        [2, 0.5], [2.5, 0.5],
        [5, 0.5], [5.5, 0.5],
        [7, 0.5], [7.5, 0.5],
      ],
      { beatsPerBar: 4, bars: 2 },
    ),
  },
  {
    id: "rd-13",
    no: 13,
    name: "休止 + 切分",
    meter: "4/4",
    level: 4,
    focus: "空出来的前半拍里，后半拍有三下",
    count: "哒哒哒 空哒哒 哒哒哒 空哒哒",
    bpm: [60, 75],
    tips: ["每一组是：八分 + 两个十六分；带「空」的那组开头空出八分", "先念「空哒哒」，再上琴"],
    pass: "60 BPM，两组交替不乱",
    tab: line(
      [
        [0, 0.5], [0.5, 0.25], [0.75, 0.25],
        [1.5, 0.25], [1.75, 0.25],
        [2, 0.5], [2.5, 0.25], [2.75, 0.25],
        [3.5, 0.25], [3.75, 0.25],
        [4, 0.5], [4.5, 0.25], [4.75, 0.25],
        [5.5, 0.25], [5.75, 0.25],
        [6, 0.5], [6.5, 0.25], [6.75, 0.25],
        [7.5, 0.25], [7.75, 0.25],
      ],
      { beatsPerBar: 4, bars: 2 },
    ),
  },
  {
    id: "rd-14",
    no: 14,
    name: "三连音",
    meter: "4/4",
    level: 4,
    focus: "一拍平均三等分",
    count: "哒哒哒 哒哒哒 哒哒哒 哒哒哒",
    bpm: [60, 75],
    tips: ["先把一拍分成三份念匀，再加快", "三下要一样长，不能「哒哒—哒」"],
    pass: "60 BPM，一小节 12 下均匀",
    tab: line(bar([[0, 1 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3]], 4, 2), { beatsPerBar: 4, bars: 2 }),
  },
  {
    id: "rd-15",
    no: 15,
    name: "四分音符三连音（二对三）",
    meter: "4/4",
    level: 5,
    focus: "三个音占两拍：一组跨两拍",
    count: "1 2 3｜4 5 6（两拍三下）",
    bpm: [50, 65],
    tips: ["这是「二对三」：脚踩两下，嘴里念三下", "最容易不稳，先慢速把两拍打成三下，再回原速"],
    pass: "50 BPM，两组各三下，和脚的二拍对得上",
    tab: line(
      [
        [0, 2 / 3], [2 / 3, 2 / 3], [4 / 3, 2 / 3],
        [2, 2 / 3], [8 / 3, 2 / 3], [10 / 3, 2 / 3],
        [4, 2 / 3], [14 / 3, 2 / 3], [16 / 3, 2 / 3],
        [6, 2 / 3], [20 / 3, 2 / 3], [22 / 3, 2 / 3],
      ],
      { beatsPerBar: 4, bars: 2 },
    ),
  },
  {
    id: "rd-16",
    no: 16,
    name: "十六分 + 休止",
    meter: "4/4",
    level: 4,
    focus: "一半是空的：哒哒 空空 空空 哒空",
    count: "哒哒 空空 空空 哒空",
    bpm: [60, 75],
    tips: ["十六分里的空拍也要念出来（「空」）", "脚还是每拍一次，别被空拍带跑"],
    pass: "60 BPM，两小节的空位都对",
    tab: line(
      [
        [0, 0.25], [0.25, 0.25], [1.5, 0.25],
        [2, 0.25], [2.25, 0.25], [3.5, 0.25],
        [4, 0.25], [4.25, 0.25], [5.5, 0.25],
        [6, 0.25], [6.25, 0.25], [7.5, 0.25],
      ],
      { beatsPerBar: 4, bars: 2 },
    ),
  },
  {
    id: "rd-17",
    no: 17,
    name: "6/8 拍",
    meter: "6/8",
    level: 4,
    focus: "以八分音符为一拍，手要比 4/4 快一倍",
    count: "123 456（两大拍，每拍三下）",
    bpm: [65, 80],
    tips: ["6/8 的「一拍」是八分音符，所以同样的速度下手要快一倍", "听成两个大拍：123 456，重音在 1 和 4"],
    pass: "65 BPM，两小节都能念成 123 456",
    tab: line(
      [
        [0, 0.5], [0.5, 0.5], [1, 0.5],
        [1.5, 0.5], [2, 0.5], [2.5, 0.5],
        [3, 0.5], [3.5, 0.5], [4, 0.5],
        [4.5, 0.5], [5, 0.5], [5.5, 0.5],
      ],
      { beatsPerBar: 3, bars: 2 },
    ),
  },
];

/** 出处标注（卡片上显示）。 */
export const READING_SOURCE = SOURCE;

export function readingDrillById(id: string): ReadingDrill | undefined {
  return READING_DRILLS.find((drill) => drill.id === id);
}
