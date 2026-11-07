/**
 * 扫弦练习（整理自「酷音小伟《节奏与节拍》」BV1DA411b7nb 的板书，44:39 – 57:53）。
 *
 * 板书是六线谱 + ↓↑ 方向图 + 速度，没有和弦；这里统一用 C 和弦弹，
 * 重点在右手节奏型本身。带圆点的地方是**右手切音**（闷掉），不是装饰。
 *
 * 方向约定（重要）：板书把方向画在六线谱上，1 弦在最上面，所以
 * 「下扫」在谱面上是**朝上**的箭头。本文件里 D = 下扫、U = 上扫，
 * 转录时已经按这个约定换算过，不是照箭头尖朝哪数。
 *
 * 简化：板书里有几条是十六分（一拍两下以上），这里统一按八分格整理，
 * 先把骨架练准；速度上来后再把十六分补进去。
 *
 * 版权：节奏型是通用知识，可以转录；这里只保留编号与出处，
 * 不复用视频里的任何截图或音频。
 */

import { chordTab, type Tab } from "./tab.ts";
import type { Level } from "./rhythm-drills.ts";

export type StrumMeter = "2/4" | "3/4" | "4/4" | "6/8";

export interface StrumDrill {
  id: string;
  /** 视频里的练习编号（1–24）。 */
  no: number;
  name: string;
  level: Level;
  bpm: number | null;
  meter: StrumMeter;
  /** 一小节几拍（拍号的下半部分换算成四分音符数）。 */
  beatsPerBar: number;
  /** 一小节内按八分音符切的格子：D 下扫 / U 上扫 / null 空拍。 */
  slots: ("D" | "U" | null)[];
  /** 切音的格子下标。 */
  mutes: number[];
  /** 数拍词。 */
  count: string;
  tip: string;
  /** 板书没拍到、按老师口诀整理的条目。 */
  inferred?: boolean;
  tab: Tab;
}

const UP = "上";
const DOWN = "下";

/** 把箭头序列读成人话：↓ → 下，↑ → 上，null → ·。 */
export function slotsLabel(slots: ("D" | "U" | null)[]): string {
  return slots.map((slot) => (slot === "D" ? DOWN : slot === "U" ? UP : "·")).join(" ");
}

/** 数拍词：按拍分组念（4/4 两格一拍，6/8 三格一组）。 */
export function countOf(slots: ("D" | "U" | null)[], per = 2): string {
  const beats: string[] = [];
  for (let i = 0; i < slots.length; i += per) {
    beats.push(
      slots
        .slice(i, i + per)
        .map((slot) => (slot === "D" ? DOWN : slot === "U" ? UP : "空"))
        .join(""),
    );
  }
  return beats.join(" ");
}

const CHORD = "C";

interface Spec {
  no: number;
  name: string;
  bpm: number;
  meter: StrumMeter;
  slots: ("D" | "U" | null)[];
  mutes?: number[];
  level: Level;
  tip: string;
  inferred?: boolean;
}

function beatsOf(meter: StrumMeter): number {
  if (meter === "2/4") return 2;
  if (meter === "3/4") return 3;
  if (meter === "4/4") return 4;
  return 6;
}

function build(spec: Spec): StrumDrill {
  // 6/8 以八分音符为一拍：一小节 6 格，每格算一拍，节拍器正好一下一格。
  const six = spec.meter === "6/8";
  const beatsPerBar = beatsOf(spec.meter);
  const step = six ? 1 : 0.5;
  return {
    id: `sd-${String(spec.no).padStart(2, "0")}`,
    no: spec.no,
    name: spec.name,
    level: spec.level,
    bpm: spec.bpm,
    meter: spec.meter,
    beatsPerBar,
    slots: spec.slots,
    mutes: spec.mutes ?? [],
    count: countOf(spec.slots, six ? 3 : 2),
    tip: spec.tip,
    inferred: spec.inferred,
    tab: chordTab({
      name: CHORD,
      strums: spec.slots,
      mutes: spec.mutes ?? [],
      step,
      beatsPerBar,
      bars: 2,
    }),
  };
}

export const STRUM_DRILLS: StrumDrill[] = [
  build({
    no: 1,
    name: "2/4 八分上下",
    bpm: 80,
    meter: "2/4",
    slots: ["D", "U", "D", "U"],
    mutes: [2],
    level: 1,
    tip: "第一课就是下上交替；第 2 拍的下扫扫完立刻放松手掌侧缘压弦，就是切音。",
  }),
  build({
    no: 2,
    name: "3/4 三拍子",
    bpm: 80,
    meter: "3/4",
    slots: ["D", null, "D", "U", "D", "U"],
    level: 2,
    tip: "四三拍：第 1 拍一个四分，二、三拍各一组八分。和弦按 C–Am–F–G 走一圈更接近实际用法。",
  }),
  build({
    no: 3,
    name: "4/4 四分下扫",
    bpm: 70,
    meter: "4/4",
    slots: ["D", null, "D", null, "D", null, "D", null],
    level: 1,
    tip: "一下一拍，先把手腕彻底放松；第 1、3 拍重，第 2、4 拍轻。",
    inferred: true,
  }),
  build({
    no: 4,
    name: "4/4 经典：下·下上·下上·下上",
    bpm: 70,
    meter: "4/4",
    slots: ["D", null, "D", "U", "D", "U", "D", "U"],
    level: 2,
    tip: "最常用的四四拍节奏型，扫弦、分解都从这里长出来。上扫只扫 1–3 弦，别一把扫平。",
  }),
  build({
    no: 5,
    name: "4/4 切音练习",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "D", "U", "D", "D", "D", null],
    mutes: [2],
    level: 2,
    tip: "第 3 格是切音：扫下去的同时手掌已经贴住弦，出「嚓」不出音。这一段是全片唯一专门讲切音的。",
  }),
  build({
    no: 6,
    name: "4/4 前八后十六",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "D", "U", "D", "D", "D", "U"],
    level: 3,
    tip: "每拍都是「下 下上」；第 2 拍和第 4 拍的第二下是十六分，先当八分练，稳了再加速。",
  }),
  build({
    no: 7,
    name: "4/4 八分平均",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    level: 3,
    tip: "八下均匀上下交替，老师说这条「哒哒哒哒哒哒哒哒」一口气念完，中间不许停。",
    inferred: true,
  }),
  build({
    no: 8,
    name: "4/4 上扫为主",
    bpm: 70,
    meter: "4/4",
    slots: ["D", null, "D", "U", "U", "U", "D", "U"],
    level: 3,
    tip: "第 2 拍的上扫用连线延续到第 3 拍——连线的意思是「前面响、后面不弹」。这条专门练上扫的落点。",
  }),
  build({
    no: 9,
    name: "4/4 下上下下",
    bpm: 70,
    meter: "4/4",
    slots: ["D", null, "U", null, "D", null, "D", null],
    level: 2,
    tip: "口诀是「下 上 下 下」——全片唯一一条第 2 拍就上扫的基础型。念的时候可以读「空 哒 哒 哒」。",
    inferred: true,
  }),
  build({
    no: 10,
    name: "4/4 七下全下扫",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "D", "D", "D", "D", "D", null],
    level: 3,
    tip: "七下全是下扫，最后一格空出来换方向；第 5 格那个带符杆的八分音符只是写法不同，时值一样。",
  }),
  build({
    no: 11,
    name: "4/4 切分（十六分）",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "U", "D", "U", "D", "D", "U"],
    level: 4,
    tip: "后半段是十六分扫弦，谱面按八分格压缩了；先把强弱关系对上，再回到原速补十六分。",
  }),
  build({
    no: 12,
    name: "4/4 连线与十六分",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "U", "U", "D", "U", "D", "U"],
    level: 4,
    tip: "十三下几乎全是十六分，中间有圆弧连线：连线前方弹响，后方空出来。可以读「空」或读「N」。",
  }),
  build({
    no: 13,
    name: "4/4 附点节奏",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "U", "D", "U", "D", "U", null],
    level: 3,
    tip: "附点在节奏线上（下面那个点），是「延长」不是切音——别当成闷音弹。附点的拖沓感就是这条的难点。",
  }),
  build({
    no: 14,
    name: "6/8 下下上",
    bpm: 80,
    meter: "6/8",
    slots: ["D", "D", "U", "D", "D", "U"],
    level: 3,
    tip: "全片唯一一条 6/8、速度 80：以八分音符为一拍，手要比 4/4 快一倍。两组「下 下 上」，中间还夹一个扫过不占拍的上扫。",
  }),
  build({
    no: 15,
    name: "4/4 前紧后松",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "D", "U", "D", "U", "D", "U"],
    level: 3,
    tip: "前两拍十六分、后两拍八分，速度一变就容易抢；数拍词按拍念，别按音念。",
  }),
  build({
    no: 16,
    name: "4/4 十六分组合",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "U", "D", "U", "D", "U", "U"],
    level: 4,
    tip: "十二下十六分混合，先把它当成四个「下 下上」的变形来记，比硬背箭头快。",
  }),
  build({
    no: 17,
    name: "4/4 十六分上下",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    level: 4,
    tip: "严格等距的上下交替，是十六分扫弦的基本功；手腕放松、幅度小，别用胳膊。",
  }),
  build({
    no: 18,
    name: "4/4 十六分与八分混合",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "D", "U", "D", "D", "U", "D", "U"],
    level: 4,
    tip: "两拍十六分、两拍八分；每换一次密度就检查一次强弱，密的地方最容易糊。",
  }),
  build({
    no: 19,
    name: "4/4 附点＋切分",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "D", "U", "D", "U", "U"],
    level: 4,
    tip: "节奏行有两处附点（下面的圆点），不是切音；先把附点的「长—短」念顺，再上琴。",
  }),
  build({
    no: 20,
    name: "4/4 十六分连续",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    level: 5,
    tip: "十二下全交替，中间带附点；它是练习 17 加密的版本（板书十二下，这里给八分骨架），速度先压到 60。",
  }),
  build({
    no: 21,
    name: "4/4 附点＋切分（进阶）",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "U", "U", "D", "D", "U"],
    level: 5,
    tip: "后半段间距拉大，是切分的位置；跟着节拍器数「1 & 2 &」，脚不能停。",
  }),
  build({
    no: 22,
    name: "4/4 附点切分",
    bpm: 70,
    meter: "4/4",
    slots: ["D", null, "D", "U", "D", "U", "U", "U"],
    level: 4,
    tip: "第一个音带附点，是典型的附点切分节奏型；老师原话：「这个节奏型到处都是，要好好练」。",
  }),
  build({
    no: 23,
    name: "4/4 空扫过渡",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "U", "D", "D", "U", "U", "D"],
    level: 5,
    tip: "箭头间距很不均，就是老师说的「扫过但不占拍」——空扫也要扫出来，只是不出音。",
  }),
  build({
    no: 24,
    name: "4/4 五组上下",
    bpm: 70,
    meter: "4/4",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    level: 5,
    tip: "五组上下、组内是十六分（板书十下，这里给八分骨架）；最后一条，练到 90 BPM 不塌就算过了。",
  }),
];

export function strumDrillById(id: string): StrumDrill | undefined {
  return STRUM_DRILLS.find((drill) => drill.id === id);
}
