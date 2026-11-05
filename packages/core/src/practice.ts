/**
 * 练习计划：阶段、练习库、按分钟数生成每日计划。
 *
 * 设计说明见 `docs/practice.md`。这里只放纯数据与纯函数：
 * - `STAGES` 六个阶段（S0 生存 → S5 应用），每个阶段说清「这一步新增什么」；
 * - `DRILLS` 练习库，**每条练习只属于一个阶段**，并且自带六线谱（`tab`）；
 * - `buildSession` 把「今天有多少分钟 + 在哪个阶段」变成一份带时长的块列表。
 *
 * 两条原则：
 * 1. **阶段之间必须有肉眼可见的差别**——不同的品域、不同的时值、不同的技巧，
 *    而不是同一批练习换个时间配比。
 * 2. **每条练习都要有谱子**。文字说"击弦 3→5"不如直接把 TAB 画出来。
 */

import { previousDateKey, streakOf } from "./daily.ts";
import {
  arpeggioTab,
  bendTab,
  chordTab,
  chromaticAcrossTab,
  chromaticTab,
  hammerTab,
  lickTab,
  pullTab,
  scaleRun,
  slideTab,
  trillTab,
  vibratoTab,
  type Tab,
} from "./tab.ts";
import { progressionTab } from "./tab.ts";

export type BlockId = "warmup" | "technique" | "chords" | "rhythm" | "apply" | "song";

export interface Block {
  id: BlockId;
  label: string;
  hint: string;
}

/** 块的固定顺序：先热身，最后才是"整段输出"。 */
export const BLOCKS: Block[] = [
  { id: "warmup", label: "热身", hint: "把手指叫醒，别一上来就提速" },
  { id: "technique", label: "基本功", hint: "当阶段的重点，慢练为主" },
  { id: "chords", label: "和弦与伴奏", hint: "转换与节奏型" },
  { id: "rhythm", label: "节奏", hint: "跟节拍器，只求稳不求快" },
  { id: "apply", label: "应用", hint: "把今天的和弦和节奏合起来" },
  { id: "song", label: "曲目与即兴", hint: "长时间练习才有的整段输出" },
];

export function blockOf(id: BlockId): Block {
  return BLOCKS.find((block) => block.id === id) ?? BLOCKS[0];
}

export interface Stage {
  id: number;
  name: string;
  /** 一句话：这一阶段在练什么。 */
  focus: string;
  /** 和上一阶段比，新增了什么（页面上直接列出来）。 */
  newSkills: string[];
  /** 品域与音域。 */
  range: string;
  /** 建议速度。 */
  bpm: string;
  /** 升级门槛。 */
  gate: string;
}

export const STAGES: Stage[] = [
  {
    id: 0,
    name: "生存",
    focus: "先让每个音都干净：按稳、不碰邻弦、拨弦不虚",
    newSkills: ["第一次拿琴：姿势与拨弦", "1–4 品，不换把", "四分 / 八分", "两个和弦 C→G"],
    range: "0–4 品",
    bpm: "50–70",
    gate: "60 BPM 四分，C 大调 1–5 品上下行一个八度，每个音都响",
  },
  {
    id: 1,
    name: "开放和弦",
    focus: "换和弦不看指板：四个开放和弦随手到位",
    newSkills: ["8 个开放和弦", "4 拍 → 2 拍换", "八分扫弦与空拍", "分解和弦 53231323"],
    range: "0–5 品",
    bpm: "60–80",
    gate: "任意两和弦 60 BPM 每 2 拍换，连续 1 分钟不错",
  },
  {
    id: 2,
    name: "节奏",
    focus: "拍子不掉：手一直在动，只是有的下不碰弦",
    newSkills: ["八分 / 十六分 / 三连音", "闷音", "3/4 与 6/8", "盲换与跨弦"],
    range: "0–7 品",
    bpm: "60–100",
    gate: "40–100 BPM 跟拍不掉；八分扫弦用手腕不用整条胳膊",
  },
  {
    id: 3,
    name: "左手技巧",
    focus: "连奏不塌：击、勾、滑、推每个音都清楚",
    newSkills: ["击弦 / 勾弦 / 击勾连奏", "滑音与推弦", "小调五声 1–5 品", "乐句意识"],
    range: "1–8 品",
    bpm: "60–90",
    gate: "80 BPM 八分，击勾连奏 2 小节不错音",
  },
  {
    id: 4,
    name: "换把与速度",
    focus: "把手放到该放的位置：十六分均匀，五个把位随手找到",
    newSkills: ["CAGED 五把位", "十六分与跨弦", "横按 F / Bm", "经济拨弦"],
    range: "0–12 品",
    bpm: "80–120",
    gate: "100 BPM 十六分连续 2 分钟；任意调五把位 1 分钟内找齐",
  },
  {
    id: 5,
    name: "应用",
    focus: "把练过的东西连成一段能听的东西",
    newSkills: ["12 小节布鲁斯", "转调伴奏", "shuffle", "即兴与录音对比"],
    range: "0–12 品",
    bpm: "70–100",
    gate: "2 分钟伴奏 + 即兴，录音回听没有明显塌拍",
  },
];

export function stageOf(id: number): Stage {
  return STAGES.find((stage) => stage.id === id) ?? STAGES[0];
}

/** 按主线的通关数推断阶段（40 关五章）。S5 只能手选。 */
export function stageForCompleted(completed: number): number {
  if (completed < 8) return 0;
  if (completed < 18) return 1;
  if (completed < 26) return 2;
  if (completed < 33) return 3;
  return 4;
}

export interface Drill {
  id: string;
  name: string;
  block: BlockId;
  /** **只属于一个阶段**——阶段之间的差别要一眼看出来。 */
  stage: number;
  bpm?: [number, number];
  /** 2–4 步练法。 */
  steps: string[];
  /** 常见错误，一句话。 */
  mistake: string;
  /** 验收：什么算练完了。 */
  pass: string;
  /** 六线谱。 */
  tab: Tab;
}

/** 练习库：每个阶段 8–9 条，每条都带谱子。 */
export const DRILLS: Drill[] = [
  // ───────── S0 生存 ─────────
  {
    id: "s0-crawl",
    name: "单弦爬格子（1-2-3-4）",
    block: "warmup",
    stage: 0,
    bpm: [50, 70],
    steps: [
      "6 弦从 1 品开始，食指、中指、无名指、小指依次按下，每个音都要响",
      "四根手指按完再从 1 品重来，循环 8 遍",
      "换到 5 弦、4 弦……顺序不变",
    ],
    mistake: "手指抬得太高、越弹越快。慢到能听见每个音。",
    pass: "50 BPM 十六分，六根弦各一轮，没有闷音",
    tab: chromaticTab({ s: 6, from: 1, step: 0.25, bars: 1 }),
  },
  {
    id: "s0-crawl-across",
    name: "跨弦爬格子（6→1 弦）",
    block: "warmup",
    stage: 0,
    bpm: [50, 60],
    steps: [
      "每根弦弹 1-2-3-4，然后换到下一根弦",
      "换弦时手型不变，只动手腕",
      "先从 6 弦走到 3 弦，再走完 6 根",
    ],
    mistake: "换弦时整只手抬起来重新找位置。",
    pass: "50 BPM 八分，6 弦走到 1 弦，每个音都清楚",
    tab: chromaticAcrossTab({ from: 1, step: 0.5, bars: 2 }),
  },
  {
    id: "s0-press",
    name: "单音按弦检查",
    block: "technique",
    stage: 0,
    bpm: [50, 60],
    steps: [
      "每根弦按 0、1、2、3 品各拨一下，听有没有杂音",
      "手指尽量靠近品丝，但不要压在品丝上",
      "按不住就检查：是不是指肚碰到了下面的弦",
    ],
    mistake: "手指躺在品格中间，指肚压到邻弦。立起来，用指尖。",
    pass: "六根弦 0–3 品全部试一遍，每个音都干净",
    tab: lickTab(
      [
        { s: 6, f: 0 },
        { s: 6, f: 1 },
        { s: 6, f: 2 },
        { s: 6, f: 3 },
        { s: 5, f: 0 },
        { s: 5, f: 1 },
        { s: 5, f: 2 },
        { s: 5, f: 3 },
      ],
      { step: 0.5, range: "0–3 品", caption: "每根弦都这样走一遍" },
    ),
  },
  {
    id: "s0-scale",
    name: "C 大调一个八度",
    block: "technique",
    stage: 0,
    bpm: [50, 70],
    steps: [
      "从 5 弦 3 品 C 开始，一个音一个音往上走",
      "每弹一个音，心里念一下唱名（1 2 3 4 5 6 7 1）",
      "到高音 C 再原路走回来",
    ],
    mistake: "把音阶当爬格子跑。音阶是音的距离，要念出来。",
    pass: "60 BPM 四分，一个八度上下行两遍，节奏不塌",
    tab: scaleRun({ keyId: "C", startString: 5, startFret: 3, fretMax: 3, step: 1 }),
  },
  {
    id: "s0-two-chords",
    name: "C → G（每 4 拍换）",
    block: "chords",
    stage: 0,
    bpm: [50, 60],
    steps: [
      "C 按好，右手每拍下扫一次，四拍后换 G",
      "换的时候手不离弦太远，先移动要动的指头",
      "稳定后再把换和弦提前半拍准备",
    ],
    mistake: "换和弦时整个人停下来等。宁可慢，也别停拍。",
    pass: "50 BPM，C 与 G 各 4 拍，连续 8 小节不错拍",
    tab: progressionTab({ names: ["C", "G"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s0-quarter-eighth",
    name: "四分与八分切换",
    block: "rhythm",
    stage: 0,
    bpm: [50, 70],
    steps: [
      "第一小节每拍一下（下扫），第二小节一拍两下（下上）",
      "脚或头一直打拍子，用身体定住速度",
      "来回切 4 遍",
    ],
    mistake: "切到八分时手忙脚乱、速度变了。",
    pass: "50 BPM，两种各 4 小节，切换处不断拍",
    tab: chordTab({
      name: "Em",
      step: 0.5,
      bars: 2,
      strums: [
        ["D", null, "D", null, "D", null, "D", null],
        ["D", "U", "D", "U", "D", "U", "D", "U"],
      ],
    }),
  },
  {
    id: "s0-riff",
    name: "两小节单音 riff",
    block: "apply",
    stage: 0,
    bpm: [50, 60],
    steps: [
      "照谱子弹这 8 个音，每个音一拍",
      "弹完一遍再从头，连续 8 遍",
      "熟了之后不看了，凭手感弹",
    ],
    mistake: "一开始就想弹快。先把四个音弹准、弹匀。",
    pass: "50 BPM，8 个音连续 8 遍，节奏一样、音都干净",
    tab: lickTab(
      [
        { s: 5, f: 3 },
        { s: 5, f: 5 },
        { s: 4, f: 2 },
        { s: 4, f: 3 },
        { s: 5, f: 3 },
        { s: 5, f: 5 },
        { s: 4, f: 2 },
        { s: 5, f: 3 },
      ],
      { step: 1, range: "2–5 品", caption: "C 大调里的四个音，一小句就够" },
    ),
  },
  {
    id: "s0-record",
    name: "录音回听 30 秒",
    block: "apply",
    stage: 0,
    steps: [
      "用手机录 30 秒，弹上面那条 riff",
      "回听三件事：拍子、杂音、换音时的缝",
      "只挑一个问题，明天练它",
    ],
    mistake: "只听「好不好听」。要听具体的：哪一拍快了。",
    pass: "录一遍、听一遍，写下 1 个要改的点",
    tab: lickTab(
      [
        { s: 5, f: 3 },
        { s: 5, f: 5 },
        { s: 4, f: 2 },
        { s: 4, f: 3 },
        { s: 5, f: 3 },
        { s: 5, f: 3 },
        { s: 5, f: 5 },
        { s: 4, f: 2 },
      ],
      { step: 1, range: "2–5 品", caption: "录这一段就够了" },
    ),
  },

  // ───────── S1 开放和弦 ─────────
  {
    id: "s1-scale",
    name: "C 大调上下行",
    block: "warmup",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "从 5 弦 3 品 C 走到高音 C，再走回来",
      "每弹一个音念一个唱名",
      "只用节拍器的拍点，不要凭感觉",
    ],
    mistake: "上行稳、下行乱。下行更需要提前看下一个音。",
    pass: "60 BPM 四分，上下行两遍，节奏不塌",
    tab: scaleRun({ keyId: "C", startString: 5, startFret: 3, fretMax: 3, step: 0.5 }),
  },
  {
    id: "s1-shape",
    name: "和弦指型一次到位",
    block: "technique",
    stage: 1,
    bpm: [50, 70],
    steps: [
      "按住 C，松开（手不离弦），再按回去",
      "每次按回去都逐弦检查：有没有闷音、有没有按错",
      "C、G、Am、D 各做 10 次",
    ],
    mistake: "每次都要在弦上摸半天才按对。手指要记形状。",
    pass: "四个和弦各 10 次，按回去后六根弦全响",
    tab: chordTab({ name: "C", step: 1, bars: 1 }),
  },
  {
    id: "s1-pick",
    name: "拨片角度与握法",
    block: "technique",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "拨片露出 2–3 毫米，斜 10–20 度",
      "在 6 弦空弦上八分上下交替，听每个音是否干净",
      "握太紧声音硬，握太松会掉——找到中间那个力度",
    ],
    mistake: "整片平拍下去，声音「啪」一下，还容易卡弦。",
    pass: "60 BPM 八分，单弦 8 小节没有卡弦和杂音",
    tab: lickTab(
      Array.from({ length: 8 }, () => ({ s: 6, f: 0 })),
      { step: 0.5, range: "空弦", caption: "只管右手：下上下上，音量要一样" },
    ),
  },
  {
    id: "s1-two-chord",
    name: "两和弦转换 4 拍 → 2 拍",
    block: "chords",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "先每 4 拍换（一小节一个），稳了改每 2 拍",
      "换的时候只移动要动的指头，手指不要全抬起来",
      "先 C→G，再 C→Am、G→D",
    ],
    mistake: "换和弦时右手停下来等左手。右手不能停。",
    pass: "60 BPM 每 2 拍换，1 分钟不错",
    tab: progressionTab({ names: ["C", "G"], beatsEach: 2, step: 1 }),
  },
  {
    id: "s1-cycle",
    name: "四和弦循环 C–G–Am–F",
    block: "chords",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "每个和弦一小节，循环 4 遍",
      "右手先用最简单的四分下扫，只管左手",
      "左手稳了再加节奏型",
    ],
    mistake: "右手花样太多，左手反而更卡。先把左手练盲。",
    pass: "60 BPM 循环 4 遍（16 小节），每次换都落在拍点",
    tab: progressionTab({ names: ["C", "G", "Am", "F"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s1-strum",
    name: "八分扫弦（下上下上）",
    block: "rhythm",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "手上不停地上下挥，空拍也挥，只是不碰弦",
      "手腕带动，胳膊尽量不动",
      "先空手挥 8 小节，再上弦",
    ],
    mistake: "空拍时手停住，下一拍就赶不上。手是钟摆。",
    pass: "70 BPM 8 小节，每一拍都在",
    tab: chordTab({
      name: "Em",
      step: 0.5,
      bars: 1,
      strums: [["D", "U", "D", "U", "D", "U", "D", "U"]],
    }),
  },
  {
    id: "s1-folk",
    name: "民谣节奏型 D·DU·UDU",
    block: "rhythm",
    stage: 1,
    bpm: [60, 70],
    steps: [
      "先在 C 一个和弦上练：下、空、下上、空、上、下上",
      "用嘴数：1 · 2& · &4&",
      "稳了再换和弦，最后放进歌里",
    ],
    mistake: "第 3、5 格手停了。空拍必须继续挥。",
    pass: "60 BPM 4 小节循环 4 遍，节奏型完整不走样",
    tab: chordTab({
      name: "C",
      step: 0.5,
      bars: 1,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },
  {
    id: "s1-arpeggio",
    name: "分解和弦 53231323",
    block: "apply",
    stage: 1,
    bpm: [60, 80],
    steps: [
      "C 和弦：5-3-2-3-1-3-2-3，八分音符",
      "拇指管 5 弦，食指 3 弦，中指 2 弦，无名指 1 弦",
      "换到 G、Am、F 重复",
    ],
    mistake: "拇指和三指抢弦，或者某根弦特别轻。",
    pass: "60 BPM，四个和弦各一遍，每根弦都清楚",
    tab: arpeggioTab({ name: "C", pattern: "53231323", step: 0.5, bars: 1 }),
  },

  // ───────── S2 节奏 ─────────
  {
    id: "s2-alt-warmup",
    name: "交替拨弦热身",
    block: "warmup",
    stage: 2,
    bpm: [70, 90],
    steps: [
      "5 弦 3 品，八分上下交替，一次都不能省",
      "手腕动，不是整条胳膊动",
      "每 8 个音停一下，检查力度是否一致",
    ],
    mistake: "一快就变成全下扫。慢到能数清上下。",
    pass: "80 BPM 八分连续 1 分钟，音量和间隔都均匀",
    tab: lickTab(
      Array.from({ length: 8 }, () => ({ s: 5, f: 3 })),
      { step: 0.5, range: "3 品", caption: "下 上 下 上，手腕像钟摆" },
    ),
  },
  {
    id: "s2-cross",
    name: "跨弦 6→3→5→2",
    block: "technique",
    stage: 2,
    bpm: [60, 80],
    steps: [
      "6 弦空弦 → 3 弦空弦 → 5 弦 → 2 弦，顺序循环",
      "眼睛看目标弦，手跟着到",
      "低音弦用拇指，高音弦用其余手指",
    ],
    mistake: "跨弦时找弦，多拨一下或者拨错弦。",
    pass: "60 BPM，跨弦循环 8 遍不错弦",
    tab: lickTab(
      [
        { s: 6, f: 0 },
        { s: 3, f: 0 },
        { s: 5, f: 0 },
        { s: 2, f: 0 },
        { s: 6, f: 0 },
        { s: 3, f: 0 },
        { s: 5, f: 0 },
        { s: 2, f: 0 },
      ],
      { step: 0.5, range: "空弦", caption: "跨弦靠手记住距离，不要用眼睛找" },
    ),
  },
  {
    id: "s2-mute",
    name: "闷音八分（palm mute）",
    block: "technique",
    stage: 2,
    bpm: [70, 90],
    steps: [
      "掌根放在琴桥附近，压住弦但不要压死",
      "八分上下扫，听「嚓嚓」的短音",
      "前后移动 1 厘米，找到最干净的位置",
    ],
    mistake: "压得太靠前，变成闷死、没有音高。",
    pass: "80 BPM 8 小节，每个音都短而清楚",
    tab: chordTab({
      name: "Em",
      step: 0.5,
      bars: 1,
      strums: [["D", "U", "D", "U", "D", "U", "D", "U"]],
    }),
  },
  {
    id: "s2-blind",
    name: "盲换（不看左手）",
    block: "chords",
    stage: 2,
    bpm: [60, 80],
    steps: [
      "眼睛看节拍器或右手，强迫左手凭感觉找位置",
      "错了也不许低头，等这一轮结束再看",
      "先两个和弦，再加到四个",
    ],
    mistake: "一错就低头看。宁可慢，也要练出手感。",
    pass: "60 BPM 八小节盲换，最多错 1 次",
    tab: progressionTab({ names: ["C", "G", "Am", "F"], beatsEach: 2, step: 1 }),
  },
  {
    id: "s2-strum",
    name: "八分扫弦含空拍",
    block: "rhythm",
    stage: 2,
    bpm: [60, 80],
    steps: [
      "G 和弦，D·D U·U D U（空拍手照样挥）",
      "用嘴数：1 · 2& · &4&",
      "稳了之后换 C 和 Am 重复",
    ],
    mistake: "空拍手停住，下一拍赶不上。",
    pass: "70 BPM 8 小节，节奏型完整、不塌拍",
    tab: chordTab({
      name: "G",
      step: 0.5,
      bars: 1,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },
  {
    id: "s2-waltz",
    name: "3/4 圆舞曲",
    block: "rhythm",
    stage: 2,
    bpm: [70, 90],
    steps: [
      "每小节三拍：强、弱、弱",
      "第一拍下扫重一点，后两拍轻",
      "用同一段和弦进行，先 3/4 再回 4/4",
    ],
    mistake: "后两拍也扫得很重，听起来像 4/4。",
    pass: "70 BPM 8 小节，重音永远在第一拍",
    tab: chordTab({
      name: "C",
      step: 1,
      bars: 2,
      beatsPerBar: 3,
      strums: [["D", "D", "D"]],
    }),
  },
  {
    id: "s2-triplet",
    name: "三连音与附点对比",
    block: "rhythm",
    stage: 2,
    bpm: [60, 80],
    steps: [
      "一拍三下（1 ta ta）弹两小节",
      "再弹附点感觉（长-短）两小节，体会拖着走",
      "两者交替，听区别",
    ],
    mistake: "把三连音弹成「快一点的四分」。要三等分。",
    pass: "60 BPM，两种各 2 小节，切换时刻不乱",
    tab: lickTab(
      [
        { s: 5, f: 3 },
        { s: 4, f: 0 },
        { s: 4, f: 2 },
        { s: 4, f: 3 },
        { s: 3, f: 0 },
        { s: 3, f: 2 },
        { s: 5, f: 3 },
        { s: 4, f: 0 },
        { s: 4, f: 2 },
      ],
      { step: 1 / 3, range: "0–3 品", caption: "每拍三下，均匀是第一位的" },
    ),
  },
  {
    id: "s2-loop",
    name: "一段进行 + 今天的节奏型",
    block: "apply",
    stage: 2,
    bpm: [60, 80],
    steps: [
      "C–G–Am–F，每小节一个和弦，用八分扫弦",
      "中间错了不要停，继续往下走",
      "弹完再回头修错的那一小节",
    ],
    mistake: "一错就重来。表演能力是错了也能接上。",
    pass: "连续 3 遍完整弹完，不中途停",
    tab: progressionTab({
      names: ["C", "G", "Am", "F"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },

  // ───────── S3 左手技巧 ─────────
  {
    id: "s3-pentatonic",
    name: "A 小调五声（5 品把位）",
    block: "warmup",
    stage: 3,
    bpm: [60, 80],
    steps: [
      "从 6 弦 5 品 A 开始，走到 1 弦的高音 A",
      "这是最常用的五声把位，记住指型",
      "上下行各一遍，再打乱顺序弹",
    ],
    mistake: "只记形状不记音。要能说出哪几个音是根音。",
    pass: "70 BPM 八分，上下行两遍，每个音都干净",
    tab: scaleRun({
      keyId: "Am",
      scaleId: "minorPentatonic",
      startString: 6,
      startFret: 5,
      fretMax: 8,
      step: 0.5,
    }),
  },
  {
    id: "s3-hammer",
    name: "击弦 3→5",
    block: "technique",
    stage: 3,
    bpm: [60, 85],
    steps: [
      "5 弦 3 品拨一下，无名指砸到 5 品，不拨第二下",
      "砸下去要快、贴住品丝，声音才亮",
      "两个音一样响才算过关",
    ],
    mistake: "落指太慢、力度不够，第二个音很虚。",
    pass: "80 BPM 八分，第二音和第一音一样响",
    tab: hammerTab({ s: 5, from: 3, to: 5, pairs: 4, step: 0.5 }),
  },
  {
    id: "s3-pull",
    name: "勾弦 5→3",
    block: "technique",
    stage: 3,
    bpm: [60, 85],
    steps: [
      "按住 5 品拨响，手指往侧下方勾开，让 3 品自己响",
      "勾的时候指腹顺带拨一下，别只是抬手指",
      "和击弦连起来练",
    ],
    mistake: "只是把手指拿开，第二个音几乎没声。",
    pass: "80 BPM，勾 8 次，每个音都清楚",
    tab: pullTab({ s: 5, from: 5, to: 3, pairs: 4, step: 0.5 }),
  },
  {
    id: "s3-trill",
    name: "击勾连奏",
    block: "technique",
    stage: 3,
    bpm: [60, 80],
    steps: [
      "3 品拨一下，然后 3→5 击、5→3 勾，连续往返",
      "只拨第一下，后面全靠左右手配合",
      "速度先慢，均匀比快重要",
    ],
    mistake: "越弹越赶，两个音粘在一起。",
    pass: "70 BPM，往返 2 小节，每个音都清楚",
    tab: trillTab({ s: 5, low: 3, high: 5, times: 3 }),
  },
  {
    id: "s3-slide",
    name: "滑音 3→5",
    block: "technique",
    stage: 3,
    bpm: [60, 80],
    steps: [
      "5 弦 3 品拨响，手指不抬，滑到 5 品",
      "滑的过程中保持按压力度",
      "再练反向：5 滑回 3，落点要准",
    ],
    mistake: "滑到目标品时音高不准，或者中途松掉。",
    pass: "60 BPM，上下滑各 8 次，落点准、不断音",
    tab: slideTab({ s: 5, from: 3, to: 5, times: 2, step: 1 }),
  },
  {
    id: "s3-bend",
    name: "推弦（全音）",
    block: "technique",
    stage: 3,
    bpm: [60, 70],
    steps: [
      "3 弦 7 品，三个手指一起往高音方向推，推到 9 品的音高",
      "用调音器或 2 弦 8 品对比确认",
      "推上去停 2 拍再放回，保持音高不抖",
    ],
    mistake: "只用一根手指，推到一半没力气。",
    pass: "推一个全音，音高和下一个品一致",
    tab: bendTab({ s: 3, f: 7, semis: 2, beats: 4 }),
  },
  {
    id: "s3-progression",
    name: "级数进行 I–V–vi–IV",
    block: "chords",
    stage: 3,
    bpm: [60, 80],
    steps: [
      "C 调弹 C–G–Am–F，心里想着 1–5–6–4",
      "换到 G 调弹 G–D–Em–C，级数不变",
      "最后不看和弦名，只按级数找位置",
    ],
    mistake: "只背和弦名，换调就重新背一遍。",
    pass: "两个调各循环 2 遍，换和弦不掉拍",
    tab: progressionTab({ names: ["C", "G", "Am", "F"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s3-rhythm",
    name: "五声上的三连音",
    block: "rhythm",
    stage: 3,
    bpm: [60, 75],
    steps: [
      "每拍三下（1 ta ta），在 5 品把位里弹",
      "只弹 4 个音循环，别跑整条音阶",
      "跟节拍器数出声：数得对才弹得对",
    ],
    mistake: "三下不平均，第一下重后面赶。数出声能治好。",
    pass: "60 BPM，三连音 4 小节，三下均匀",
    tab: lickTab(
      [
        { s: 6, f: 5 },
        { s: 5, f: 7 },
        { s: 5, f: 5 },
        { s: 4, f: 7 },
        { s: 6, f: 5 },
        { s: 5, f: 7 },
        { s: 5, f: 5 },
        { s: 4, f: 7 },
        { s: 4, f: 7 },
      ],
      { step: 1 / 3, range: "5–8 品", caption: "一拍三下，三个音要一样长" },
    ),
  },
  {
    id: "s3-lick",
    name: "五声连奏乐句",
    block: "apply",
    stage: 3,
    bpm: [60, 80],
    steps: [
      "在一拍里塞三个音（三连音），用击弦连起来",
      "每句结束留一拍空白",
      "慢速弹 4 遍，再提速",
    ],
    mistake: "一路往上爬音阶，没有句子感。",
    pass: "60 BPM，4 小节 4 句，每句都有停顿",
    tab: lickTab(
      [
        { s: 4, f: 5 },
        { s: 3, f: 5 },
        { s: 3, f: 7, tech: "h" },
        { s: 2, f: 5 },
        { s: 2, f: 8, tech: "s" },
        { s: 1, f: 5 },
      ],
      { step: 0.5, range: "5–8 品", caption: "h = 击弦，s = 滑音" },
    ),
  },

  // ───────── S4 换把与速度 ─────────
  {
    id: "s4-alt-speed",
    name: "交替拨弦提速（十六分）",
    block: "warmup",
    stage: 4,
    bpm: [80, 110],
    steps: [
      "5 弦 3 品，十六分上下交替，80 BPM 起",
      "每 4 小节 +5 BPM，到 110 为止",
      "只在不卡的速度上待着，卡了就退回去",
    ],
    mistake: "一快就乱、节奏变形。速度是练出来的，不是冲出来的。",
    pass: "100 BPM 十六分连续 30 秒，节奏不变形",
    tab: lickTab(
      Array.from({ length: 8 }, () => ({ s: 5, f: 3 })),
      { step: 0.25, range: "3 品", caption: "一拍四下，下上下上" },
    ),
  },
  {
    id: "s4-caged",
    name: "CAGED 五把位（C 和弦）",
    block: "technique",
    stage: 4,
    bpm: [50, 70],
    steps: [
      "C 和弦的五个形状：0、3、5、8、10 品",
      "每个形状先找根音，再按其余手指",
      "五个形状一轮 60 秒",
    ],
    mistake: "只记形状不记根音，换调就找不到。",
    pass: "五个把位 1 分钟内找齐并都按响",
    tab: lickTab(
      [
        { s: 5, f: 3 },
        { s: 4, f: 2 },
        { s: 3, f: 0 },
        { s: 2, f: 1 },
        { s: 1, f: 0 },
        { s: 6, f: 8 },
        { s: 5, f: 10 },
        { s: 4, f: 10 },
        { s: 3, f: 9 },
        { s: 2, f: 8 },
        { s: 1, f: 8 },
      ],
      { step: 0.5, range: "0 品 / 8 品", caption: "C 形与 E 形：同一个和弦的两种按法" },
    ),
  },
  {
    id: "s4-16th",
    name: "单弦十六分",
    block: "technique",
    stage: 4,
    bpm: [80, 110],
    steps: [
      "从 90 BPM 开始，一拍四下",
      "只练一根弦，右手不能省任何一下",
      "每 4 小节停一下，听均匀度",
    ],
    mistake: "前两下清楚，后两下糊。把十六分拆成两组练。",
    pass: "100 BPM 十六分 2 分钟，间隔均匀",
    tab: chromaticTab({ s: 5, from: 5, step: 0.25, bars: 2 }),
  },
  {
    id: "s4-cross16",
    name: "跨弦十六分",
    block: "technique",
    stage: 4,
    bpm: [70, 90],
    steps: [
      "相邻两弦交替：5 弦 2 个音、4 弦 2 个音",
      "换弦时拨片方向不要乱",
      "慢速确认轨迹，再上速度",
    ],
    mistake: "换弦时停一下再拨，速度就断了。",
    pass: "80 BPM，跨弦十六分 8 小节不断",
    tab: lickTab(
      [
        { s: 5, f: 5 },
        { s: 5, f: 7 },
        { s: 4, f: 5 },
        { s: 4, f: 7 },
        { s: 5, f: 5 },
        { s: 5, f: 7 },
        { s: 4, f: 5 },
        { s: 4, f: 7 },
      ],
      { step: 0.25, range: "5–7 品", caption: "两组两个音，换弦不停" },
    ),
  },
  {
    id: "s4-economy",
    name: "经济拨弦",
    block: "technique",
    stage: 4,
    bpm: [70, 90],
    steps: [
      "相邻弦弹双音，换弦时拨片继续同一方向",
      "慢到能看清轨迹，再上节拍器",
      "只在相邻弦上用，跳弦还是交替",
    ],
    mistake: "换弦时手停了半拍。", 
    pass: "80 BPM 八分，跨弦处不断拍",
    tab: lickTab(
      [
        { s: 6, f: 3 },
        { s: 5, f: 3 },
        { s: 4, f: 3 },
        { s: 3, f: 3 },
        { s: 5, f: 3 },
        { s: 4, f: 3 },
        { s: 3, f: 3 },
        { s: 2, f: 3 },
      ],
      { step: 0.5, range: "3 品", caption: "同品跨弦：拨片走最短的路" },
    ),
  },
  {
    id: "s4-barre",
    name: "横按 F / Bm",
    block: "chords",
    stage: 4,
    bpm: [50, 70],
    steps: [
      "食指横按 1 品，先把 1、2、6 弦按响",
      "拇指在琴颈背面中间偏上，手腕往前送",
      "按不住就换到 5 品试，越靠琴身越省力",
    ],
    mistake: "用食指指肚按。要偏侧面一点的硬处。",
    pass: "F 和 Bm 各按响一次，六根弦都不闷",
    tab: progressionTab({ names: ["F", "Bm"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s4-16strum",
    name: "十六分扫弦",
    block: "rhythm",
    stage: 4,
    bpm: [60, 80],
    steps: [
      "一拍四下：下上下上，先空手挥",
      "上弦后只在 1、3 拍加力度",
      "稳了再和八分切换",
    ],
    mistake: "十六分扫成一片噪声。手腕幅度要小。",
    pass: "70 BPM 8 小节，每一拍四下清楚",
    tab: chordTab({
      name: "Am",
      step: 0.25,
      bars: 1,
      strums: [
        ["D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U", "D", "U"],
      ],
    }),
  },
  {
    id: "s4-full",
    name: "跟节拍器完整弹 2 分钟",
    block: "apply",
    stage: 4,
    bpm: [70, 90],
    steps: [
      "C–G–Am–F 循环，八分扫弦，弹满 2 分钟",
      "中途不许停、不许降速",
      "结束后看有没有越弹越快",
    ],
    mistake: "前 30 秒稳，后面越弹越快。体力也是基本功。",
    pass: "2 分钟不停、不加速，节拍器一直在拍上",
    tab: progressionTab({
      names: ["C", "G", "Am", "F"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", "U", "D", "U", "D", "U", "D", "U"],
    }),
  },

  {
    id: "s4-song",
    name: "会唱的一段（8 小节）",
    block: "song",
    stage: 4,
    bpm: [60, 80],
    steps: [
      "挑一首你会唱的歌里最简单的 8 小节",
      "先只弹和弦，不加节奏型",
      "稳了再加扫弦，最后跟原曲一起弹",
    ],
    mistake: "整首从头磕。只练 8 小节，练到能连起来。",
    pass: "8 小节能跟原曲一起弹完，不抢不拖",
    tab: progressionTab({ names: ["C", "G", "Am", "F"], beatsEach: 4, step: 1 }),
  },

  // ───────── S5 应用 ─────────
  {
    id: "s5-blues-scale",
    name: "A 小调五声热身（两个把位）",
    block: "warmup",
    stage: 5,
    bpm: [70, 90],
    steps: [
      "5 品把位与 12 品把位各走一遍",
      "两个把位之间用滑音连接",
      "只在能用上力的速度上练",
    ],
    mistake: "只练一个把位，换把就断。",
    pass: "70 BPM，两个把位各一遍，连接处不断音",
    tab: scaleRun({
      keyId: "Am",
      scaleId: "minorPentatonic",
      startString: 6,
      startFret: 5,
      fretMax: 8,
      step: 0.5,
    }),
  },
  {
    id: "s5-improv",
    name: "五声即兴（三音一句）",
    block: "technique",
    stage: 5,
    bpm: [60, 80],
    steps: [
      "每次只用 3 个音造句，中间要有停顿",
      "一句结束留一小节空白再弹下一句",
      "先慢、先少，别把音阶从头跑到尾",
    ],
    mistake: "一路往上爬音阶。即兴是句子，要有呼吸。",
    pass: "8 小节里弹出 4 句，每句都有停顿",
    tab: lickTab(
      [
        { s: 4, f: 5 },
        { s: 3, f: 7 },
        { s: 2, f: 5 },
        { s: 3, f: 7 },
        { s: 4, f: 5 },
        { s: 4, f: 7, tech: "b", bend: 1 },
      ],
      { step: 1, range: "5–7 品", caption: "三音一句，句尾用推弦收" },
    ),
  },
  {
    id: "s5-vibrato",
    name: "揉弦与推弦综合",
    block: "technique",
    stage: 5,
    bpm: [60, 70],
    steps: [
      "推到目标音高，停住，再揉 4 拍",
      "推放的过程音高不能掉",
      "录下来对比：揉得均匀吗",
    ],
    mistake: "揉得又快又抖，像发抖。",
    pass: "推弦音准 + 揉弦 4 拍均匀",
    tab: bendTab({ s: 3, f: 7, semis: 2, beats: 4 }),
  },
  {
    id: "s5-blues",
    name: "12 小节布鲁斯（A）",
    block: "chords",
    stage: 5,
    bpm: [70, 90],
    steps: [
      "A7–D7–A7–E7–D7–A7，12 小节循环",
      "先只弹和弦，再加 shuffle 节奏",
      "稳了以后用五声即兴",
    ],
    mistake: "和弦进行记不住就即兴。先把 12 小节走顺。",
    pass: "12 小节循环 3 遍不错，能加一句即兴",
    tab: progressionTab({ names: ["G7", "G7", "C7", "G7"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s5-transpose",
    name: "转调伴奏（C → G）",
    block: "chords",
    stage: 5,
    bpm: [70, 90],
    steps: [
      "C 调：C–G–Am–F",
      "G 调：G–D–Em–C（同样的 1-5-6-4）",
      "两遍一换调，中间不停",
    ],
    mistake: "换调时重新背和弦名。记住级数就不用背。",
    pass: "两个调各循环 2 遍，换调不掉拍",
    tab: progressionTab({ names: ["G", "D", "Em", "C"], beatsEach: 4, step: 1 }),
  },
  {
    id: "s5-shuffle",
    name: "shuffle 节奏",
    block: "rhythm",
    stage: 5,
    bpm: [70, 90],
    steps: [
      "把八分弹成长-短（三连音去掉中间那个）",
      "先跟节拍器，再跟鼓点",
      "配 12 小节布鲁斯用",
    ],
    mistake: "长-短比例不一致，听起来像散拍。",
    pass: "80 BPM，shuffle 8 小节，长短比例稳定",
    tab: chordTab({
      name: "G7",
      step: 0.5,
      bars: 1,
      strums: [["D", null, "D", "U", null, "U", "D", null]],
    }),
  },
  {
    id: "s5-record",
    name: "录音对比（本周 vs 上周）",
    block: "apply",
    stage: 5,
    steps: [
      "录一段 30 秒的伴奏 + 即兴",
      "和上周的录音对比：拍子、音色、句子",
      "只挑一个改进点，写进明天的目标",
    ],
    mistake: "只顾着听「好不好听」，不听具体的。",
    pass: "两段录音对比，写出 1 个进步和 1 个问题",
    tab: progressionTab({
      names: ["C", "G", "Am", "F"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },
  {
    id: "s5-song",
    name: "副歌 8 小节",
    block: "song",
    stage: 5,
    bpm: [60, 80],
    steps: [
      "挑一首你会唱的歌，只练副歌 8 小节",
      "先确认和弦与节奏型，再一句一句接",
      "最后跟原曲一起弹",
    ],
    mistake: "整首从头磕。只练 8 小节，练到能连起来。",
    pass: "8 小节能跟原曲一起弹完，不抢不拖",
    tab: progressionTab({
      names: ["C", "G", "Am", "F"],
      beatsEach: 4,
      step: 0.5,
      strums: ["D", null, "D", "U", null, "U", "D", "U"],
    }),
  },
];

export function drillById(id: string): Drill | undefined {
  return DRILLS.find((drill) => drill.id === id);
}

/** 某个阶段、某一块可选的练习。 */
export function drillsFor(stage: number, block: BlockId): Drill[] {
  return DRILLS.filter((drill) => drill.block === block && drill.stage === stage);
}

/** 某个阶段的全部练习（按块的顺序排）。 */
export function drillsOfStage(stage: number): Drill[] {
  return BLOCKS.flatMap((block) => drillsFor(stage, block.id));
}

/**
 * 各阶段的时间配比（热身 / 基本功 / 和弦 / 节奏 / 应用 / 曲目）。
 *
 * 阶段越靠前，和弦与节奏占比越大；到 S3 基本功吃掉最多时间（技巧必须慢练）；
 * S4 之后才把时间花在"整段输出"上。
 */
const WEIGHTS: Record<number, Record<BlockId, number>> = {
  0: { warmup: 0.15, technique: 0.25, chords: 0.25, rhythm: 0.2, apply: 0.15, song: 0 },
  1: { warmup: 0.12, technique: 0.18, chords: 0.3, rhythm: 0.22, apply: 0.18, song: 0 },
  2: { warmup: 0.12, technique: 0.15, chords: 0.22, rhythm: 0.33, apply: 0.18, song: 0 },
  3: { warmup: 0.12, technique: 0.34, chords: 0.2, rhythm: 0.17, apply: 0.17, song: 0 },
  4: { warmup: 0.12, technique: 0.3, chords: 0.16, rhythm: 0.14, apply: 0.2, song: 0.08 },
  5: { warmup: 0.1, technique: 0.22, chords: 0.16, rhythm: 0.1, apply: 0.2, song: 0.22 },
};

/** 可选的总时长。 */
export const SESSION_MINUTES = [30, 45, 60, 90, 120];

/**
 * 按权重切分钟数：用「最大余数法」，保证加起来**正好**等于总时长。
 * 时间比块数还少时，优先给权重大的块，剩下的给 0——不硬凑 1 分钟。
 */
export function allocateMinutes(total: number, weights: number[]): number[] {
  const result = weights.map(() => 0);
  const active = weights
    .map((weight, index) => ({ weight, index }))
    .filter((item) => item.weight > 0);
  if (active.length === 0 || total <= 0) return result;

  if (total < active.length) {
    [...active]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, total)
      .forEach((item) => {
        result[item.index] = 1;
      });
    return result;
  }

  const sum = active.reduce((acc, item) => acc + item.weight, 0);
  const exact = active.map((item) => (item.weight / sum) * total);
  const alloc = exact.map((value) => Math.max(1, Math.floor(value)));
  let used = alloc.reduce((a, b) => a + b, 0);

  while (used > total) {
    let pick = -1;
    let slack = -Infinity;
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] <= 1) continue;
      const over = alloc[i] - exact[i];
      if (over > slack) {
        slack = over;
        pick = i;
      }
    }
    if (pick < 0) break;
    alloc[pick] -= 1;
    used -= 1;
  }

  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  let cursor = 0;
  while (used < total && order.length > 0) {
    alloc[order[cursor % order.length].index] += 1;
    used += 1;
    cursor += 1;
  }

  active.forEach((item, index) => {
    result[item.index] = alloc[index];
  });
  return result;
}

export interface SessionBlock {
  block: BlockId;
  drill: Drill;
  minutes: number;
}

export interface Session {
  date: string;
  minutes: number;
  stage: number;
  /** 今天的唯一目标（默认取阶段重点，页面里可改）。 */
  goal: string;
  blocks: SessionBlock[];
}

export interface BuildOptions {
  minutes: number;
  stage: number;
  /** `YYYY-MM-DD`，同一天生成同一份计划。 */
  date: string;
}

/** 同一天、同一阶段、同样时长 → 同一份计划（练习内容按日期轮换）。 */
export function buildSession({ minutes, stage, date }: BuildOptions): Session {
  const stageDef = stageOf(stage);
  const weights = WEIGHTS[stageDef.id] ?? WEIGHTS[0];
  const effective = { ...weights };

  // 短时间不给"曲目"块；没有曲目练习的阶段也不给
  if (minutes < 90 || drillsFor(stageDef.id, "song").length === 0) effective.song = 0;

  const blocks = BLOCKS.map((block) => block.id).filter((id) => effective[id] > 0);
  const alloc = allocateMinutes(
    minutes,
    blocks.map((id) => effective[id]),
  );

  const day = dayIndex(date);
  const sessionBlocks: SessionBlock[] = blocks.map((id, index) => {
    const pool = drillsFor(stageDef.id, id);
    const drill = pool[(day + index) % pool.length];
    return { block: id, drill, minutes: alloc[index] };
  });

  return {
    date,
    minutes,
    stage: stageDef.id,
    goal: stageDef.focus,
    blocks: sessionBlocks,
  };
}

/** `YYYY-MM-DD` → 一个稳定的天数序号，用来轮换练习内容。 */
function dayIndex(date: string): number {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed) return 0;
  const utc = Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
  return Math.floor(utc / 86_400_000);
}

export type Feel = "steady" | "ok" | "shaky";

export const FEELS: { id: Feel; label: string }[] = [
  { id: "steady", label: "稳" },
  { id: "ok", label: "一般" },
  { id: "shaky", label: "不稳" },
];

/** 一天练了什么（存进 localStorage，键 `guitar.practice.v1`）。 */
export interface DayLog {
  minutes: number;
  stage: number;
  done: string[];
  feel?: Feel;
  goal?: string;
  bpmMax?: number;
}

export type PracticeLog = Record<string, DayLog>;

export interface PracticeStats {
  streak: number;
  longest: number;
  todayMinutes: number;
  weekMinutes: number[];
  weekTotal: number;
  totalMinutes: number;
  days: number;
}

/** 统计练习量：连续天数、本周分钟数、总时长。 */
export function practiceStats(log: PracticeLog, today: string): PracticeStats {
  const active = Object.entries(log)
    .filter(([, day]) => day.minutes > 0)
    .map(([date]) => date)
    .sort();
  const info = streakOf(active, today);

  const week: string[] = [];
  let cursor = today;
  for (let i = 0; i < 7; i++) {
    week.unshift(cursor);
    cursor = previousDateKey(cursor);
  }

  const weekMinutes = week.map((date) => log[date]?.minutes ?? 0);
  return {
    streak: info.current,
    longest: info.longest,
    todayMinutes: log[today]?.minutes ?? 0,
    weekMinutes,
    weekTotal: weekMinutes.reduce((a, b) => a + b, 0),
    totalMinutes: Object.values(log).reduce((sum, day) => sum + day.minutes, 0),
    days: active.length,
  };
}

/** 把一次「练完了一块」写进当天的记录（纯函数，返回新对象）。 */
export function recordBlock(
  log: PracticeLog,
  date: string,
  entry: { drill: string; minutes: number; stage: number; feel?: Feel; goal?: string },
): PracticeLog {
  const day = log[date] ?? { minutes: 0, stage: entry.stage, done: [] };
  const done = day.done.includes(entry.drill) ? day.done : [...day.done, entry.drill];
  return {
    ...log,
    [date]: {
      ...day,
      stage: entry.stage,
      minutes: day.minutes + Math.max(0, Math.round(entry.minutes)),
      done,
      feel: entry.feel ?? day.feel,
      goal: entry.goal ?? day.goal,
    },
  };
}
