/**
 * 扫弦练习（整理自「酷音小伟《节奏与节拍》」BV1DA411b7nb 的板书，44:39 – 57:53）。
 *
 * 板书是六线谱 + ↓↑ 方向图 + 速度，没有和弦；这里统一用 C 和弦弹，
 * 重点在右手节奏型本身。带圆点的地方是**右手切音**（闷掉），不是装饰。
 *
 * 方向约定：板书把方向画在六线谱上，1 弦在最上面，所以谱面上「朝上」的箭头其实是**下扫**。
 * 本文件里 D = 下扫、U = 上扫，已经按这个约定换算过，不是照箭头尖朝哪数。
 *
 * 节奏怎么来的：每一条都按板上的**符干位置 + 符梁分组**读出来，
 * 十六分就是十六分（`at` 以十六分音符为单位，4 = 一拍），没有把十六分压成八分。
 * 板上「前八后十六」写作 [0, 2, 3]，十六分四连写作 [0, 1, 2, 3]，附点写作 [0, 3]。
 *
 * 版权：节奏型是通用知识，可以转录；这里只保留编号与出处，
 * 不复用视频里的任何截图或音频。
 */

import { strumTab, type StrumHit, type Tab } from "./tab.ts";
import type { Level } from "./rhythm-drills.ts";

export type StrumMeter = "2/4" | "3/4" | "4/4" | "6/8";

/** 板上的一下：`[十六分位置, 方向, 切音]`。 */
export type HitSpec = [number, "D" | "U"] | [number, "D" | "U", "mute"];

export interface StrumDrill {
  id: string;
  /** 视频里的练习编号（1–24）。 */
  no: number;
  name: string;
  /** 这一条在练什么音型，一句话。 */
  figure: string;
  level: Level;
  bpm: number | null;
  meter: StrumMeter;
  /** 一小节几拍（6/8 按八分音符算，一小节 6 拍）。 */
  beatsPerBar: number;
  /** 一小节几格十六分：4/4 十六格、3/4 十二格、2/4 八格、6/8 十二格。 */
  grid: number;
  /** 数拍词，按拍分组。 */
  count: string;
  tip: string;
  /** 板书没拍到、按老师口诀整理的条目。 */
  inferred?: boolean;
  tab: Tab;
}

const CHORD = "C";

const DIR_LABEL = { D: "下", U: "上" } as const;

/**
 * 数拍词：一拍一拍念。
 * 一拍一下念「下」，一拍两下念「下上」，十六分四连念「下上下上」。
 */
export function countOf(hits: { at: number; dir: "D" | "U" }[], beatsPerBar: number): string {
  const words: string[] = [];
  for (let beat = 0; beat < beatsPerBar; beat++) {
    const inBeat = hits
      .filter((hit) => hit.at >= beat && hit.at < beat + 1)
      .map((hit) => DIR_LABEL[hit.dir]);
    words.push(inBeat.length > 0 ? inBeat.join("") : "空");
  }
  return words.join(" ");
}

/** 十六分位置换算成一拍制的起拍：4/4 里 4 格 = 1 拍，6/8 里 2 格 = 1 拍（一拍一个八分）。 */
function beatOf(sixteenth: number, meter: StrumMeter): number {
  return meter === "6/8" ? sixteenth / 2 : sixteenth / 4;
}

interface Spec {
  no: number;
  name: string;
  figure: string;
  bpm: number;
  meter: StrumMeter;
  /** 一小节几格十六分。 */
  grid: number;
  /** 一小节几拍（6/8 按八分算）。 */
  beats: number;
  level: Level;
  hits: HitSpec[];
  tip: string;
  inferred?: boolean;
}

function build(spec: Spec): StrumDrill {
  const hits: StrumHit[] = spec.hits
    .map(([at, dir, flag]) => ({ at: beatOf(at, spec.meter), dir, muted: flag === "mute" }))
    .sort((a, b) => a.at - b.at);
  return {
    id: `sd-${String(spec.no).padStart(2, "0")}`,
    no: spec.no,
    name: spec.name,
    figure: spec.figure,
    level: spec.level,
    bpm: spec.bpm,
    meter: spec.meter,
    beatsPerBar: spec.beats,
    grid: spec.grid,
    count: countOf(hits, spec.beats),
    tip: spec.tip,
    inferred: spec.inferred,
    tab: strumTab({
      name: CHORD,
      beatsPerBar: spec.beats,
      bars: 2,
      hits,
    }),
  };
}

export const STRUM_DRILLS: StrumDrill[] = [
  build({
    no: 1,
    name: "2/4 八分上下",
    figure: "八分 下上 ×2（第 2 拍切音）",
    bpm: 80,
    meter: "2/4",
    grid: 8,
    beats: 2,
    level: 1,
    hits: [[0, "D"], [2, "U"], [4, "D", "mute"], [6, "U"]],
    tip: "第一课就是下上交替；第 2 拍下扫扫完立刻放松手掌侧缘压弦，就是切音。",
  }),
  build({
    no: 2,
    name: "3/4 三拍子",
    figure: "四分 + 八分 ×2（下 · 下上 · 下上）",
    bpm: 80,
    meter: "3/4",
    grid: 12,
    beats: 3,
    level: 2,
    hits: [[0, "D"], [4, "D"], [6, "U"], [8, "D"], [10, "U"]],
    tip: "四三拍：第 1 拍一个四分，二、三拍各一组八分。和弦按 C–Am–F–G 走一圈更接近实际用法。",
  }),
  build({
    no: 3,
    name: "4/4 四分下扫",
    figure: "四分 下 ×4",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 1,
    hits: [[0, "D"], [4, "D"], [8, "D"], [12, "D"]],
    tip: "一下一拍，先把手腕彻底放松；第 1、3 拍重，第 2、4 拍轻。",
    inferred: true,
  }),
  build({
    no: 4,
    name: "4/4 经典：下 · 下上 · 下上 · 下上",
    figure: "四分 + 八分 ×3",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 2,
    hits: [[0, "D"], [4, "D"], [6, "U"], [8, "D"], [10, "U"], [12, "D"], [14, "U"]],
    tip: "最常用的四四拍节奏型，扫弦、分解都从这里长出来。上扫只扫 1–3 弦，别一把扫平。",
  }),
  build({
    no: 5,
    name: "4/4 切音练习",
    figure: "八分 ×3 组 + 收尾四分（第 3 格切音）",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 2,
    hits: [[0, "D"], [2, "D"], [4, "D", "mute"], [6, "U"], [8, "D"], [10, "D"], [12, "D"]],
    tip: "第 3 格是切音：扫下去的同时手掌已经贴住弦，出「嚓」不出音。这一段是全片唯一专门讲切音的。",
  }),
  build({
    no: 6,
    name: "4/4 前八后十六",
    figure: "四分 + 前八后十六 ×2",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 3,
    hits: [
      [0, "D"],
      [4, "D"], [6, "D"], [7, "U"],
      [8, "D"],
      [12, "D"], [14, "D"], [15, "U"],
    ],
    tip: "第 2、4 拍是前八后十六：谱上能看到后两下明显挤在一起。先按十六分的间距数「1 &a」，再连起来。",
  }),
  build({
    no: 7,
    name: "4/4 八分平均",
    figure: "八分 上下交替 ×8",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 3,
    hits: [[0, "D"], [2, "U"], [4, "D"], [6, "U"], [8, "D"], [10, "U"], [12, "D"], [14, "U"]],
    tip: "八下均匀上下交替，老师说这条「哒哒哒哒哒哒哒哒」一口气念完，中间不许停。",
    inferred: true,
  }),
  build({
    no: 8,
    name: "4/4 上扫为主",
    figure: "四分 + 八分 ×3 组（第 3 拍连续上扫）",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 3,
    hits: [
      [0, "D"],
      [4, "D"], [6, "U"],
      [8, "U"], [10, "U"],
      [12, "D"], [14, "U"],
    ],
    tip: "第 2 拍的上扫用连线延续到第 3 拍——连线的意思是「前面响、后面不弹」。第 3 拍板上一连两个上扫，按板书弹，别顺手扫成下扫。",
  }),
  build({
    no: 9,
    name: "4/4 下上下下",
    figure: "四分 ×4（下 上 下 下）",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 2,
    hits: [[0, "D"], [4, "U"], [8, "D"], [12, "D"]],
    tip: "口诀是「下 上 下 下」——全片唯一一条第 2 拍就上扫的基础型。念的时候可以读「空 哒 哒 哒」。",
    inferred: true,
  }),
  build({
    no: 10,
    name: "4/4 十六分四连",
    figure: "四分 + 十六分四连 ×2",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"],
      [4, "D"], [5, "U"], [6, "D"], [7, "U"],
      [8, "D"],
      [12, "D"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "第 2、4 拍是标准的十六分四连（下上下上）；第 5 格那个带符杆的音只是写法不同，时值一样。",
  }),
  build({
    no: 11,
    name: "4/4 十六分四连（换向）",
    figure: "四分 + 十六分四连 ×2（上扫起）",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"],
      [4, "U"], [5, "D"], [6, "U"], [7, "D"],
      [8, "D"],
      [12, "U"], [13, "D"], [14, "U"], [15, "D"],
    ],
    tip: "同样是十六分四连，但第 2、4 拍从上扫起——换向的位置就是这条的难点，先慢慢数「上下上下」。",
  }),
  build({
    no: 12,
    name: "4/4 连线与十六分",
    figure: "八分 + 十六分四连 + 前八后十六 + 十六分四连",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 5,
    hits: [
      [0, "D"], [2, "U"],
      [4, "U"], [5, "U"], [6, "D"], [7, "U"],
      [8, "D"], [10, "D"], [11, "U"],
      [12, "U"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "中间有圆弧连线：连线前方弹响，后方空出来。可以读「空」或读「N」。十三下里只有一处是前八后十六。",
  }),
  build({
    no: 13,
    name: "4/4 八分三组",
    figure: "四分 + 八分 ×3 组",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 3,
    hits: [[0, "D"], [4, "D"], [6, "U"], [8, "D"], [10, "U"], [12, "D"], [14, "U"]],
    tip: "节奏行里的点不是切音，是「延长」的附点——别把它当闷音弹。第 1 拍一个长音，后面三拍各一组八分。",
  }),
  build({
    no: 14,
    name: "6/8 下下上",
    figure: "6/8：八分 下下上 ×2",
    bpm: 80,
    meter: "6/8",
    grid: 12,
    beats: 6,
    level: 3,
    hits: [[0, "D"], [2, "D"], [4, "U"], [6, "D"], [8, "D"], [10, "U"]],
    tip: "全片唯一一条 6/8、速度 80：以八分音符为一拍，手要比 4/4 快一倍。两组「下 下 上」，组间还有一下扫过不占拍的空扫。",
  }),
  build({
    no: 15,
    name: "4/4 前八后十六 + 前十六后八",
    figure: "四分 + 前八后十六 + 前十六后八 + 前八后十六",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"],
      [4, "D"], [6, "D"], [7, "U"],
      [8, "D"], [9, "U"], [10, "D"],
      [12, "D"], [14, "D"], [15, "U"],
    ],
    tip: "第 3 拍反过来写（两下十六分在前、八分在后）：先挤后松——这是和练习 6 最不一样的地方。",
  }),
  build({
    no: 16,
    name: "4/4 十六分组合",
    figure: "八分 + 前八后十六 + 十六分四连 + 前八后十六",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"], [2, "D"],
      [4, "D"], [6, "D"], [7, "U"],
      [8, "D"], [9, "U"], [10, "D"], [11, "U"],
      [12, "D"], [14, "D"], [15, "U"],
    ],
    tip: "一条里三种密度：八分、前八后十六、十六分四连。每换一次密度就检查一次强弱，密的地方最容易糊。",
  }),
  build({
    no: 17,
    name: "4/4 十六分上下",
    figure: "连续十六分 ×10（上下交替）",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"], [1, "U"], [2, "D"], [3, "U"],
      [4, "D"], [5, "U"], [6, "D"], [7, "U"],
      [8, "D"], [9, "U"],
    ],
    tip: "严格等距的上下交替，是十六分扫弦的基本功；手腕放松、幅度小，别用胳膊。板上一共十下，后半小节空出来换气。",
  }),
  build({
    no: 18,
    name: "4/4 十六分与八分混合",
    figure: "前八后十六 ×2 + 十六分四连 + 前八后十六",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"], [2, "D"], [3, "U"],
      [4, "D"], [6, "D"], [7, "U"],
      [8, "D"], [9, "U"], [10, "D"], [11, "U"],
      [12, "D"], [14, "D"], [15, "U"],
    ],
    tip: "两拍前八后十六、一拍十六分四连；慢速时把每一格都念出来，密的地方不要抢。",
  }),
  build({
    no: 19,
    name: "4/4 八分与十六分交替",
    figure: "八分 + 前八后十六 + 八分 + 前八后十六",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"], [2, "U"],
      [4, "D"], [6, "D"], [7, "U"],
      [8, "D"], [10, "U"],
      [12, "D"], [14, "D"], [15, "U"],
    ],
    tip: "节奏行有两处附点（下面的圆点），不是切音；先把附点的「长—短」念顺，再上琴。",
  }),
  build({
    no: 20,
    name: "4/4 十六分连续",
    figure: "八分 + 十六分四连 + 八分 + 十六分四连",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 5,
    hits: [
      [0, "D"], [2, "U"],
      [4, "D"], [5, "U"], [6, "D"], [7, "U"],
      [8, "D"], [10, "U"],
      [12, "D"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "十二下，中间两组是十六分四连；速度先压到 60，稳住了再加。",
  }),
  build({
    no: 21,
    name: "4/4 附点＋切分（进阶）",
    figure: "附点八分 + 跨拍切分",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 5,
    hits: [
      [0, "D"],
      [4, "U"], [6, "D"], [7, "U"],
      [10, "U"], [11, "D"],
      [14, "D"], [15, "U"],
    ],
    tip: "板上的点画在长音后面，音因此被拉长、下一拍往后挪——跨拍的那几下就是切分。跟着节拍器数「1 & 2 &」，脚不能停。",
  }),
  build({
    no: 22,
    name: "4/4 附点切分",
    figure: "四分 + 八分 + 前十六后八 + 十六分四连",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 4,
    hits: [
      [0, "D"],
      [4, "D"], [6, "U"],
      [8, "D"], [9, "U"], [10, "U"],
      [12, "D"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "第一个音带附点，是典型的附点切分节奏型；老师原话：「这个节奏型到处都是，要好好练」。",
  }),
  build({
    no: 23,
    name: "4/4 空扫过渡",
    figure: "前十六后八 ×2 + 八分 + 十六分四连",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 5,
    hits: [
      [0, "D"], [1, "U"], [2, "U"],
      [4, "D"], [6, "D"],
      [8, "D"], [9, "U"], [10, "U"],
      [12, "D"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "箭头间距很不均，就是老师说的「扫过但不占拍」——空扫也要扫出来，只是不出音。",
  }),
  build({
    no: 24,
    name: "4/4 前十六后八 + 十六分四连",
    figure: "前十六后八 ×3 + 十六分四连",
    bpm: 70,
    meter: "4/4",
    grid: 16,
    beats: 4,
    level: 5,
    hits: [
      [0, "D"], [1, "U"], [2, "D"],
      [4, "D"], [5, "U"], [6, "D"],
      [8, "D"], [9, "U"], [10, "D"],
      [12, "D"], [13, "U"], [14, "D"], [15, "U"],
    ],
    tip: "五组上下：前三拍「两下十六分 + 一下八分」，最后一拍换成十六分四连；练到 90 BPM 不塌就算过了。",
  }),
];

export function strumDrillById(id: string): StrumDrill | undefined {
  return STRUM_DRILLS.find((drill) => drill.id === id);
}
