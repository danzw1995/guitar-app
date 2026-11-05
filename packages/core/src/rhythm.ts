/**
 * 时值、拍号与节奏型。
 *
 * 纯数据 + 纯函数：不碰 DOM、不碰 Web Audio，方便单测，也方便插件复用。
 *
 * 约定：
 * - **拍 = 四分音符**（4/4、3/4、2/4 的"一拍"）。6/8 在数据里按 8 分音符数格子，
 *   但 `accents` 标出两个大拍（第 1、第 4 个 8 分），这是复拍子的听感。
 * - `bpm` 一律指"每分钟多少拍"，与扫弦时脚打的拍子一致。
 */

export interface NoteValue {
  id: string;
  label: string;
  /** 占几个四分音符（附点四分 1.5、八分三连音 1/3）。 */
  beats: number;
  /** 换算成"几分音符"的说法，用来解释比例。 */
  fraction: string;
  hint?: string;
}

/** 全音符 → 十六分，外加附点与三连音。 */
export const NOTE_VALUES: NoteValue[] = [
  { id: "whole", label: "全音符", beats: 4, fraction: "1/1", hint: "一小节只有一下" },
  { id: "half", label: "二分音符", beats: 2, fraction: "1/2", hint: "两拍一下" },
  { id: "quarter", label: "四分音符", beats: 1, fraction: "1/4", hint: "一拍一下，最常用" },
  { id: "eighth", label: "八分音符", beats: 0.5, fraction: "1/8", hint: "一拍两下（下上）" },
  { id: "sixteenth", label: "十六分音符", beats: 0.25, fraction: "1/16", hint: "一拍四下（下上下上）" },
  {
    id: "dottedQuarter",
    label: "附点四分",
    beats: 1.5,
    fraction: "1.5/4",
    hint: "一拍半 = 一拍 + 半拍，听起来「拖着走」",
  },
  { id: "dottedEighth", label: "附点八分", beats: 0.75, fraction: "0.75/4", hint: "半拍再拖一点，常见于节奏型" },
  {
    id: "tripletEighth",
    label: "八分三连音",
    beats: 1 / 3,
    fraction: "1/3 拍",
    hint: "一拍平均三下，三个正好一拍",
  },
];

export function noteValueById(id: string): NoteValue | undefined {
  return NOTE_VALUES.find((value) => value.id === id);
}

/** 一小节里各音的时值加起来必须正好填满——教学里最该讲的一件事。 */
export function beatsOf(values: string[]): number {
  return values.reduce((sum, id) => sum + (noteValueById(id)?.beats ?? 0), 0);
}

export type MeterId = "4/4" | "3/4" | "2/4" | "6/8";

export interface Meter {
  id: MeterId;
  label: string;
  /** 一小节几个"格"。4/4 是 4 拍，6/8 是 6 个八分。 */
  perBar: number;
  /** 分母：以几分音符为一格。 */
  unit: 2 | 4 | 8;
  /** 重音落在第几格（0 起）。6/8 是 1 和 4——两个大拍。 */
  accents: number[];
  note: string;
}

export const METERS: Meter[] = [
  { id: "4/4", label: "4/4（四四拍）", perBar: 4, unit: 4, accents: [0], note: "最常用。强、弱、次强、弱。" },
  { id: "3/4", label: "3/4（三四拍）", perBar: 3, unit: 4, accents: [0], note: "圆舞曲：强、弱、弱。" },
  { id: "2/4", label: "2/4（二四拍）", perBar: 2, unit: 4, accents: [0], note: "进行曲：强、弱。" },
  {
    id: "6/8",
    label: "6/8（六八拍）",
    perBar: 6,
    unit: 8,
    accents: [0, 3],
    note: "复拍子：两个大拍，每大拍三下（三连音的感觉）。",
  },
];

export function meterOf(id: string): Meter {
  return METERS.find((meter) => meter.id === id) ?? METERS[0];
}

/** 每拍切成几份：1 = 四分，2 = 八分，3 = 三连音，4 = 十六分。 */
export type Subdivision = 1 | 2 | 3 | 4;

export const SUBDIVISION_LABEL: Record<Subdivision, string> = {
  1: "四分",
  2: "八分",
  3: "三连音",
  4: "十六分",
};

/** 一拍里的数拍词（八分用 &，十六分用 e & a，三连音用 ta）。 */
export const SUBDIVISION_COUNTS: Record<Subdivision, string[]> = {
  1: [""],
  2: ["", "&"],
  3: ["", "ta", "ta"],
  4: ["", "e", "&", "a"],
};

export interface GridSlot {
  /** 第几格（一整小节连续编号）。 */
  index: number;
  /** 属于第几拍（0 起）。 */
  beat: number;
  /** 数拍词：`1`、`&`、`e`、`ta`。 */
  label: string;
  /** 是不是重音（强拍的第一下）。 */
  accent: boolean;
  /** 是不是拍点（每拍的头上）。 */
  onBeat: boolean;
}

/** 把一小节铺成格子：节拍器的高亮和扫弦图共用这一份数据。 */
export function gridSlots(meterId: string, subdivision: Subdivision): GridSlot[] {
  const meter = meterOf(meterId);
  const slots: GridSlot[] = [];
  for (let beat = 0; beat < meter.perBar; beat++) {
    for (let k = 0; k < subdivision; k++) {
      slots.push({
        index: slots.length,
        beat,
        label: k === 0 ? String(beat + 1) : SUBDIVISION_COUNTS[subdivision][k],
        accent: k === 0 && meter.accents.includes(beat),
        onBeat: k === 0,
      });
    }
  }
  return slots;
}

/** 一小节会响几下（含细分）。 */
export function clicksPerBar(meterId: string, subdivision: Subdivision): number {
  return meterOf(meterId).perBar * subdivision;
}

/** 每分钟拍的时长（毫秒）。 */
export function bpmToMs(bpm: number): number {
  return 60000 / Math.max(1, bpm);
}

/** 每个细分格子的间隔（毫秒）——节拍器排程用。 */
export function stepMs(bpm: number, subdivision: Subdivision): number {
  return bpmToMs(bpm) / Math.max(1, subdivision);
}

/** 数拍词连起来，例如 4/4 八分 → `1 & 2 & 3 & 4 &`。 */
export function countLine(meterId: string, subdivision: Subdivision): string {
  return gridSlots(meterId, subdivision)
    .map((slot) => slot.label)
    .join(" ");
}

export type StrumArrow = "D" | "U";

export interface StrumPattern {
  id: string;
  name: string;
  meterId: MeterId;
  /** 按八分音符铺格子：`null` 表示这一下不弹（手上的"虚拨"）。 */
  slots: (StrumArrow | null)[];
  hint: string;
}

/** 常用扫弦型。8 格 = 4/4 的八分音符，6 格 = 3/4。 */
export const STRUM_PATTERNS: StrumPattern[] = [
  {
    id: "quarter-down",
    name: "四分：每拍一下（全下扫）",
    meterId: "4/4",
    slots: ["D", null, "D", null, "D", null, "D", null],
    hint: "先练这个：只动手腕，每一下都落在拍点上。",
  },
  {
    id: "eighth-alt",
    name: "八分：下上下上",
    meterId: "4/4",
    slots: ["D", "U", "D", "U", "D", "U", "D", "U"],
    hint: "手上不停（空拍也照样挥），只是有一半不碰弦。",
  },
  {
    id: "folk",
    name: "民谣经典：D · DU · UDU",
    meterId: "4/4",
    slots: ["D", null, "D", "U", null, "U", "D", "U"],
    hint: "弹唱最常用。难点在第 3、5 格：手要挥，弦不碰。",
  },
  {
    id: "mixed",
    name: "混合：D · D · DU DU",
    meterId: "4/4",
    slots: ["D", null, "D", null, "D", "U", "D", "U"],
    hint: "前两拍稳，后两拍密——练「变速不变拍」。",
  },
  {
    id: "waltz",
    name: "3/4：强 弱 弱",
    meterId: "3/4",
    slots: ["D", null, "D", "U", null, null],
    hint: "第一拍下扫重一点，后两拍轻。",
  },
];

export function strumPatternById(id: string): StrumPattern | undefined {
  return STRUM_PATTERNS.find((pattern) => pattern.id === id);
}

/**
 * 时值练习的一条阶梯：同一个音，从全音符一路缩到十六分。
 * 用来回答"我节奏不稳，从哪儿开始"——从最长的音开始，能听出自己什么时候抢拍。
 */
export const VALUE_LADDER = [
  { id: "whole", exercise: "一小节一下：数 1 2 3 4，数到 1 才弹" },
  { id: "half", exercise: "两拍一下：数 1 2 3 4，落在 1 和 3" },
  { id: "quarter", exercise: "一拍一下：每一拍都弹，先能跟住再求快" },
  { id: "eighth", exercise: "一拍两下：下、上，手不要停" },
  { id: "sixteenth", exercise: "一拍四下：下上下上，慢速也要均匀" },
  { id: "tripletEighth", exercise: "一拍三下：一、二、三，三下正好一拍" },
];
