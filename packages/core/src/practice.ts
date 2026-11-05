/**
 * 练习计划：阶段、练习库、按分钟数生成每日计划。
 *
 * 设计说明见 `docs/practice.md`。这里只放纯数据与纯函数：
 * - `STAGES` 六个阶段（S0 生存 → S5 应用），每个阶段给「重点 / 必修 / 升级门槛」；
 * - `DRILLS` 练习库，每条带练法、常见错误与验收标准；
 * - `buildSession` 把「今天有多少分钟 + 在哪个阶段」变成一份带时长的块列表。
 *
 * 一条原则：**时间盒只是容器，验收标准才是内容**。所以每条 drill 都必须有 `pass`。
 */

import { previousDateKey, streakOf } from "./daily.ts";

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
  /** 一句话重点，也是默认的「今天的唯一目标」。 */
  focus: string;
  /** 升级门槛（人话）。 */
  gate: string;
}

export const STAGES: Stage[] = [
  {
    id: 0,
    name: "生存",
    focus: "每个音都干净：按稳、不碰邻弦、拨弦不虚",
    gate: "60 BPM 四分音符，C 大调 1–5 品上下行一个八度，每个音都响",
  },
  {
    id: 1,
    name: "和弦",
    focus: "换和弦时不看指板也不卡：四个开放和弦随手到位",
    gate: "任意两和弦 60 BPM 每 4 拍换，连续 1 分钟不错",
  },
  {
    id: 2,
    name: "节奏",
    focus: "拍子不掉：手一直在动，只是有的下不碰弦",
    gate: "40–100 BPM 跟拍不掉；八分扫弦用手腕不用整条胳膊",
  },
  {
    id: 3,
    name: "左手技巧",
    focus: "连奏不塌：击、勾、滑、推每个音都清楚",
    gate: "80 BPM 八分，击勾连奏 2 小节不错音",
  },
  {
    id: 4,
    name: "右手与换把",
    focus: "速度与把位：十六分均匀，五个把位随手能找到",
    gate: "100 BPM 十六分连续 2 分钟；任意调 CAGED 五把位 1 分钟内找齐",
  },
  {
    id: 5,
    name: "应用",
    focus: "把练过的东西连成一段能听的东西",
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
  /** 属于哪些阶段（一条练习可以跨阶段复用）。 */
  stages: number[];
  bpm?: [number, number];
  /** 3–5 步练法。 */
  steps: string[];
  /** 常见错误，一句话。 */
  mistake: string;
  /** 验收：什么算练完了。 */
  pass: string;
}

/** 练习库。覆盖每个阶段的每一块（有测试守着，别删漏）。 */
export const DRILLS: Drill[] = [
  // —— 热身 ——
  {
    id: "w-crawl",
    name: "爬格子 1-2-3-4",
    block: "warmup",
    stages: [0, 1, 2, 3, 4, 5],
    bpm: [60, 80],
    steps: [
      "从 6 弦 1 品开始，1-2-3-4 指依次按下，每指都要响",
      "换弦时手型不变，只动手腕和手指，别整只手抬起来",
      "六根弦走完再往回走，速度用 60 BPM 八分",
    ],
    mistake: "越弹越快、手指抬太高。慢下来，听见每个音。",
    pass: "60 BPM 八分，六根弦来回两遍，没有闷音和杂音",
  },
  {
    id: "w-spider",
    name: "蜘蛛练习（跨弦 1-3-2-4）",
    block: "warmup",
    stages: [0, 1, 2, 3, 4, 5],
    bpm: [50, 70],
    steps: [
      "6 弦 1 品（食指）→ 5 弦 3 品（无名指）→ 6 弦 2 品（中指）→ 5 弦 4 品（小指）",
      "每按一个音都要拨响，别用手指「蹭」过去",
      "16 个音一组，一组一组往上挪",
    ],
    mistake: "小指按不实、手掌贴住琴颈。手腕往前送一点。",
    pass: "50 BPM，一组 16 个音不断不错",
  },
  {
    id: "w-scale",
    name: "慢速音阶（C 大调 1–5 品）",
    block: "warmup",
    stages: [0, 1, 2, 3, 4, 5],
    bpm: [60, 90],
    steps: [
      "从 5 弦 3 品 C 开始，一个八度上下行",
      "每弹一个音，心里念一下唱名（1 2 3 4 5 6 7）",
      "只用节拍器的拍点，不要凭感觉",
    ],
    mistake: "把音阶当爬格子跑。音阶是「音的距离」，要念出来。",
    pass: "60 BPM 四分，一个八度上下行两遍，节奏不塌",
  },

  // —— 基本功：单音 / 拨弦 / 左手技巧 / 换把 ——
  {
    id: "t-press",
    name: "单音按弦（每根弦 0–3 品）",
    block: "technique",
    stages: [0],
    bpm: [50, 60],
    steps: [
      "从 6 弦空弦开始，每一品按下去拨一下，听有没有杂音",
      "手指尽量靠近品丝，但不要按在品丝上",
      "按的时候看右手：是不是每次都拨在同一个位置",
    ],
    mistake: "手指躺在品格中间、指肚碰到下面的弦。立起来，用指尖。",
    pass: "六根弦 0–3 品全部试一遍，每个音都干净",
  },
  {
    id: "t-chord-shape",
    name: "和弦指型一次到位",
    block: "technique",
    stages: [1, 2],
    bpm: [50, 70],
    steps: [
      "按住 C，松开（手不离弦、只抬起来一点），再按回去",
      "每次按回去都逐弦检查：有没有闷音、有没有按错",
      "换成 G、D、Am 各做 10 次",
    ],
    mistake: "每次都要在弦上「摸」半天才按对。手指应该记形状，不是找位置。",
    pass: "四个和弦各 10 次，按回去后六根弦全响",
  },
  {
    id: "t-alt",
    name: "交替拨弦（单弦八分）",
    block: "technique",
    stages: [2, 3, 4, 5],
    bpm: [70, 110],
    steps: [
      "在 5 弦 3 品反复弹，下上下上，一次都不能省",
      "手腕动，不是整条胳膊动",
      "每 8 个音停一下，检查力度是不是一样",
    ],
    mistake: "遇到换弦就变成「全下扫」。慢到能数清上下。",
    pass: "90 BPM 八分连续 1 分钟，音量和间隔都均匀",
  },
  {
    id: "t-hammer",
    name: "击弦（hammer-on）",
    block: "technique",
    stages: [3, 4],
    bpm: [60, 85],
    steps: [
      "5 弦 3 品按住拨响，再用无名指「砸」到 5 品，不拨第二下",
      "砸下去要快、要贴住品丝，声音才亮",
      "两个音一组，练 3→5、5→7",
    ],
    mistake: "击下去太慢，听起来像两个断开的音。",
    pass: "80 BPM 八分，两个音一组，第二音和第一音一样响",
  },
  {
    id: "t-pull",
    name: "勾弦（pull-off）",
    block: "technique",
    stages: [3, 4],
    bpm: [60, 85],
    steps: [
      "按住 5 品拨响，手指往侧下方「勾」开，让 3 品自己响",
      "勾的时候指腹顺带拨一下下面那根弦的方向",
      "和击弦连着练：3→5 击，5→3 勾",
    ],
    mistake: "只是把手指拿开，第二个音几乎没声。",
    pass: "80 BPM，击勾往返 2 小节，每个音都清楚",
  },
  {
    id: "t-slide",
    name: "滑音（slide）",
    block: "technique",
    stages: [3, 4, 5],
    bpm: [60, 90],
    steps: [
      "5 弦 3 品拨响，手指不抬，滑到 5 品",
      "滑的过程中保持按压力度，别松",
      "再练反向：5 品滑回 3 品，落点要准",
    ],
    mistake: "滑到目标品时音高不准、或者中途断掉。",
    pass: "60 BPM 四分，上下滑各 8 次，落点准、不断音",
  },
  {
    id: "t-bend",
    name: "推弦（bend）",
    block: "technique",
    stages: [3, 4, 5],
    bpm: [60, 70],
    steps: [
      "3 弦 7 品，用三个手指一起把弦往高音方向推，推到 8 品的音高",
      "用调音器或对比 2 弦 8 品来听准不准",
      "先练全音推弦，再练半音推弦",
    ],
    mistake: "只用一根手指推，推到一半没力气。三指一起发力，手腕转。",
    pass: "推一个全音，音高和下一个品一致（能听出来、也能被调音器确认）",
  },
  {
    id: "t-vibrato",
    name: "揉弦（vibrato）",
    block: "technique",
    stages: [3, 4, 5],
    bpm: [60, 70],
    steps: [
      "按一个长音（比如 3 弦 7 品），每拍揉 2 次，均匀",
      "手腕转，不是手指抖",
      "开节拍器：每拍四下、两下各练一遍",
    ],
    mistake: "揉得太快太抖，像发抖。先慢、先均匀。",
    pass: "一个音揉 8 拍，节拍器上每拍次数一致",
  },
  {
    id: "t-caged",
    name: "CAGED 五把位换把",
    block: "technique",
    stages: [4, 5],
    bpm: [50, 70],
    steps: [
      "任选一个和弦（比如 C），把五个形状分别在 0/3/5/8/10 品按出来",
      "每换一个形状先找根音，再按其余手指",
      "五个形状一轮 60 秒，卡住就重来",
    ],
    mistake: "只记形状不记根音，换调就找不到。",
    pass: "任意调，五个把位 1 分钟内找齐并都按响",
  },
  {
    id: "t-economy",
    name: "经济拨弦（跨弦时少动一下）",
    block: "technique",
    stages: [4, 5],
    bpm: [70, 100],
    steps: [
      "在相邻两根弦上弹双音，注意换弦时拨片继续同一方向",
      "先慢到能看清拨片轨迹",
      "熟练后跟节拍器八分",
    ],
    mistake: "换弦时手停了半拍。慢练，让轨迹连起来。",
    pass: "80 BPM 八分，跨弦处不断拍",
  },

  // —— 和弦与伴奏 ——
  {
    id: "c-two",
    name: "两和弦转换（4 拍 → 2 拍 → 1 拍）",
    block: "chords",
    stages: [0, 1, 2, 3],
    bpm: [60, 80],
    steps: [
      "选两个和弦（先 C 和 G），每 4 拍换一次",
      "稳了改成每 2 拍，再改成每 1 拍",
      "换的时候手不离弦，只移动需要动的指头",
    ],
    mistake: "换和弦时整个人停下来等。先按「最省动作」的顺序换。",
    pass: "60 BPM 每 2 拍换，1 分钟不错",
  },
  {
    id: "c-cycle",
    name: "四和弦循环（C–G–Am–F）",
    block: "chords",
    stages: [1, 2, 3, 4],
    bpm: [60, 90],
    steps: [
      "每个和弦 4 拍，一小节一个，循环 4 遍",
      "右手先用最简单的四分下扫，只管左手",
      "左手稳了再加节奏型",
    ],
    mistake: "右手花样太多，左手反而更卡。先把左手练盲。",
    pass: "60 BPM 循环 4 遍（16 小节），每次换都落在拍点",
  },
  {
    id: "c-blind",
    name: "盲换（眼睛看节奏，不看左手）",
    block: "chords",
    stages: [2, 3, 4],
    bpm: [60, 80],
    steps: [
      "把眼睛看向右手或节拍器，强迫左手凭感觉找位置",
      "错了也不许低头，等这一轮结束再看",
      "先练两个和弦，再加到四个",
    ],
    mistake: "一错就低头看。宁可慢，也要练出「手感」。",
    pass: "60 BPM 八小节盲换，最多错 1 次",
  },
  {
    id: "c-basic",
    name: "横按和弦（F / Bm）",
    block: "chords",
    stages: [3, 4, 5],
    bpm: [50, 70],
    steps: [
      "食指横按 1 品，先把 1、2、6 弦按响",
      "拇指放在琴颈背面中间偏上，手腕往前送",
      "按不住就换到 5 品再试，位置越靠琴身越省力",
    ],
    mistake: "食指用指肚按。要偏食指侧面一点的硬处。",
    pass: "F 和 Bm 各按响一次，六根弦都不闷",
  },
  {
    id: "c-progression",
    name: "级数进行（I–V–vi–IV）",
    block: "chords",
    stages: [3, 4, 5],
    bpm: [60, 90],
    steps: [
      "在 C 调弹 C–G–Am–F，心里想着 1–5–6–4",
      "换到 G 调弹 G–D–Em–C，级数不变，位置变了",
      "最后不看和弦名，只按级数找位置",
    ],
    mistake: "只背和弦名，换调就重新背一遍。级数才是通用语言。",
    pass: "两个调各循环 2 遍，换和弦不掉拍",
  },

  // —— 节奏 ——
  {
    id: "r-subdiv",
    name: "四分 / 八分切换",
    block: "rhythm",
    stages: [0, 1, 2],
    bpm: [60, 80],
    steps: [
      "先每拍一下（下扫），稳定 8 小节",
      "再一拍两下（下上），同样 8 小节",
      "来回切：4 小节四分、4 小节八分",
    ],
    mistake: "切到八分时手忙脚乱。脚或头继续打拍子，用身体定住速度。",
    pass: "60 BPM，四分与八分各 8 小节，切换处不断拍",
  },
  {
    id: "r-strum8",
    name: "八分扫弦（下上下上）",
    block: "rhythm",
    stages: [1, 2, 3],
    bpm: [60, 90],
    steps: [
      "手上不停地上下挥，空拍也挥，只是不碰弦",
      "手腕带动，胳膊尽量不动",
      "先空手挥 8 小节，再上弦",
    ],
    mistake: "空拍时手停住，下一拍就赶不上。手是钟摆，不能停。",
    pass: "70 BPM 8 小节，每一拍都在",
  },
  {
    id: "r-folk",
    name: "民谣扫弦 D·DU·UDU",
    block: "rhythm",
    stages: [2, 3, 4],
    bpm: [60, 80],
    steps: [
      "先在 1 个和弦上练：下、空、下上、空、上、下上",
      "数拍：1 · 2& · &4&（用嘴念出来）",
      "稳了再换和弦，最后加进歌里",
    ],
    mistake: "第 3、5 格手停了。空拍必须继续挥。",
    pass: "60 BPM 4 小节循环 4 遍，节奏型完整不走样",
  },
  {
    id: "r-mute",
    name: "闷音八分（palm mute）",
    block: "rhythm",
    stages: [2, 3, 4],
    bpm: [70, 100],
    steps: [
      "右手掌根轻放在琴桥附近，压住弦但不要压死",
      "八分上下扫，听「嚓嚓」的短音",
      "压的位置前后移动，找到最干净的那个点",
    ],
    mistake: "压太靠前，变成闷死。靠近琴桥，压一点就够。",
    pass: "80 BPM 8 小节，每个音都短、都清楚",
  },
  {
    id: "r-triplet",
    name: "三连音与附点对比",
    block: "rhythm",
    stages: [3, 4, 5],
    bpm: [60, 80],
    steps: [
      "一拍三下（1 ta ta）弹 4 小节",
      "再弹附点感觉（长-短）4 小节，体会「拖着走」",
      "两者交替，听区别",
    ],
    mistake: "把三连音弹成「快一点的四分」。要三等分，不是加速。",
    pass: "60 BPM，两种感觉各 4 小节，切换时刻不乱",
  },
  {
    id: "r-meter",
    name: "3/4 与 6/8",
    block: "rhythm",
    stages: [3, 4, 5],
    bpm: [60, 90],
    steps: [
      "3/4：强 弱 弱，每小节三下",
      "6/8：两个大拍，每大拍三下",
      "用同一段和弦进行，先 3/4 再 6/8",
    ],
    mistake: "把 6/8 数成六下平拍。要听出两个大拍。",
    pass: "两种拍号各 8 小节，重音位置对",
  },

  // —— 应用 ——
  {
    id: "a-riff",
    name: "两小节单音 riff",
    block: "apply",
    stages: [0, 1],
    bpm: [50, 70],
    steps: [
      "用 C 大调 1–5 品里的 4 个音，编一小句（比如 3-5-6-5）",
      "每个音都用四分音符弹，跟着节拍器重复 8 遍",
      "稳了再改成八分，或者加一个简单的节奏停顿",
    ],
    mistake: "一开始就想弹快、弹花。先把四个音弹准、弹匀。",
    pass: "50 BPM，同一句重复 8 遍，节奏一样、音都干净",
  },
  {
    id: "a-loop",
    name: "一段进行弹完整",
    block: "apply",
    stages: [1, 2, 3],
    bpm: [60, 80],
    steps: [
      "用今天的节奏型 + 今天的和弦进行，从头到尾弹 8 小节",
      "中间错了不要停，继续往下走",
      "弹完再回头修错的那一小节",
    ],
    mistake: "一错就重来。表演能力是「错了也能接上」。",
    pass: "连续 3 遍完整弹完，不中途停",
  },
  {
    id: "a-record",
    name: "录音回听 30 秒",
    block: "apply",
    stages: [2, 3, 4, 5],
    steps: [
      "用手机录 30 秒，尽量录完整一段",
      "回听三件事：拍子、杂音、换和弦的缝",
      "只挑一个问题，明天练它",
    ],
    mistake: "只听「好不好听」。要听具体的：哪一拍快了。",
    pass: "录一遍、听一遍，写下 1 个要改的点",
  },
  {
    id: "a-full",
    name: "跟节拍器完整弹 2 分钟",
    block: "apply",
    stages: [3, 4, 5],
    bpm: [70, 90],
    steps: [
      "选一段 8 小节的进行，循环弹满 2 分钟",
      "中途不许停、不许降速",
      "结束后看有没有越弹越快",
    ],
    mistake: "前 30 秒稳，后面越弹越快。体力也是基本功。",
    pass: "2 分钟不停、不加速，节拍器一直在拍上",
  },
  {
    id: "a-improv",
    name: "五声即兴（三音一句）",
    block: "apply",
    stages: [4, 5],
    bpm: [60, 80],
    steps: [
      "在 A 小调五声 1–5 品里，每次只用 3 个音造句",
      "一句结束留白一小节，再弹下一句",
      "先慢、先少，别把音阶从头跑到尾",
    ],
    mistake: "一路往上爬音阶。即兴是「句子」，要有停顿。",
    pass: "在 8 小节里弹出 4 句，每句都有停顿",
  },
  {
    id: "s-song",
    name: "自选歌的副歌 8 小节",
    block: "song",
    stages: [4, 5],
    bpm: [60, 80],
    steps: [
      "挑一首你会唱的歌，只练副歌 8 小节",
      "先确认和弦与节奏型，再一句一句接",
      "最后跟原曲一起弹（能跟住就说明节奏对了）",
    ],
    mistake: "整首从头磕。只练 8 小节，练到能连起来。",
    pass: "8 小节能跟原曲一起弹完，不抢不拖",
  },
  {
    id: "s-blues",
    name: "12 小节布鲁斯",
    block: "song",
    stages: [5],
    bpm: [70, 90],
    steps: [
      "A 调 12 小节：A7–D7–A7–E7–D7–A7",
      "先只弹和弦，再加 shuffle 节奏",
      "稳了以后用 A 小调五声即兴",
    ],
    mistake: "和弦进行记不住就即兴。先把 12 小节走顺。",
    pass: "12 小节循环 3 遍不错，能加一句即兴",
  },
];

export function drillById(id: string): Drill | undefined {
  return DRILLS.find((drill) => drill.id === id);
}

/** 某个阶段、某一块可选的练习。 */
export function drillsFor(stage: number, block: BlockId): Drill[] {
  return DRILLS.filter((drill) => drill.block === block && drill.stages.includes(stage));
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
  3: { warmup: 0.12, technique: 0.38, chords: 0.18, rhythm: 0.15, apply: 0.17, song: 0 },
  4: { warmup: 0.12, technique: 0.28, chords: 0.16, rhythm: 0.14, apply: 0.2, song: 0.1 },
  5: { warmup: 0.1, technique: 0.2, chords: 0.14, rhythm: 0.1, apply: 0.19, song: 0.27 },
};

/** 可选的总时长。 */
export const SESSION_MINUTES = [30, 45, 60, 90, 120];

/**
 * 按权重切分钟数：用「最大余数法」，保证加起来**正好**等于总时长。
 * 每块至少 1 分钟，否则 30 分钟会切出 0 分钟的块。
 */
export function allocateMinutes(total: number, weights: number[]): number[] {
  const result = weights.map(() => 0);
  const active = weights
    .map((weight, index) => ({ weight, index }))
    .filter((item) => item.weight > 0);
  if (active.length === 0 || total <= 0) return result;

  // 时间比块数还少：优先给权重大的，剩下的块给 0（别硬凑成 1 分钟）
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

  // floor + 「至少 1 分钟」可能给多了：从超出精确值最多的地方扣回来
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

  // 还有余量就按小数部分从大到小补
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
  /** 今天能练多久（分钟）。 */
  minutes: number;
  /** 阶段 0–5。 */
  stage: number;
  /** `YYYY-MM-DD`，同一天生成同一份计划。 */
  date: string;
}

/** 同一天、同一阶段、同样时长 → 同一份计划（练习内容按日期轮换）。 */
export function buildSession({ minutes, stage, date }: BuildOptions): Session {
  const stageDef = stageOf(stage);
  const weights = WEIGHTS[stageDef.id] ?? WEIGHTS[0];
  const effective = { ...weights };

  // 时长太短时不给"曲目"块：那 20 分钟不如留给基本功
  if (minutes < 90) effective.song = 0;

  const blocks = BLOCKS.map((block) => block.id).filter((id) => effective[id] > 0);
  const alloc = allocateMinutes(
    minutes,
    blocks.map((id) => effective[id]),
  );

  const day = dayIndex(date);
  const sessionBlocks: SessionBlock[] = blocks.map((id, index) => {
    const pool = drillsFor(stageDef.id, id);
    const candidates = pool.length > 0 ? pool : DRILLS.filter((drill) => drill.block === id);
    const drill = candidates[(day + index * 3) % candidates.length];
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
  /** 练完的 drill id。 */
  done: string[];
  feel?: Feel;
  goal?: string;
  /** 当天摸到的最高速度。 */
  bpmMax?: number;
}

export type PracticeLog = Record<string, DayLog>;

export interface PracticeStats {
  /** 连续练习天数（今天没练则算到昨天）。 */
  streak: number;
  longest: number;
  todayMinutes: number;
  /** 最近 7 天（含今天）的分钟数，从早到晚。 */
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
