/**
 * 音程与 12 平均律。
 *
 * 两条原则：
 * 1. **半音数与名称绑定，拼写由字母步进决定**：C→E 是大三度（4 个半音），
 *    C→Fb 也是 4 个半音但写成减四度。所以音程名 = 半音数 + 字母距离，两者都不能省。
 * 2. 这个模块不碰 DOM、不碰 Node API，纯函数，便于单测与多端复用。
 */
import { LETTER_PC, LETTERS } from "./theory.ts";

export type IntervalQuality = "perfect" | "major" | "minor" | "augmented" | "diminished";
export type Consonance = "perfect" | "imperfect" | "dissonant";

export interface IntervalInfo {
  /** 0–12，12 是纯八度。 */
  semitones: number;
  /** 音级距离：2 = 二度、3 = 三度……8 = 八度。 */
  degree: number;
  /** 中文名，如「大三度」。 */
  name: string;
  /** 国际缩写，如 `M3`。 */
  short: string;
  quality: IntervalQuality;
  consonance: Consonance;
  /** 12 平均律下的音分（半音 = 100）。 */
  cents: number;
}

/**
 * 12 个半音对应的**基准**音程名。第 6 个半音写「三全音」——
 * 它既可以是增四度（C–F#）也可以是减五度（C–Gb），单独一个名字会骗人，
 * 所以拼写层面用 `spellInterval` 另行判断。
 */
export const INTERVALS: IntervalInfo[] = [
  { semitones: 0, degree: 1, name: "纯一度", short: "P1", quality: "perfect", consonance: "perfect", cents: 0 },
  { semitones: 1, degree: 2, name: "小二度", short: "m2", quality: "minor", consonance: "dissonant", cents: 100 },
  { semitones: 2, degree: 2, name: "大二度", short: "M2", quality: "major", consonance: "dissonant", cents: 200 },
  { semitones: 3, degree: 3, name: "小三度", short: "m3", quality: "minor", consonance: "imperfect", cents: 300 },
  { semitones: 4, degree: 3, name: "大三度", short: "M3", quality: "major", consonance: "imperfect", cents: 400 },
  { semitones: 5, degree: 4, name: "纯四度", short: "P4", quality: "perfect", consonance: "perfect", cents: 500 },
  { semitones: 6, degree: 4, name: "三全音", short: "TT", quality: "augmented", consonance: "dissonant", cents: 600 },
  { semitones: 7, degree: 5, name: "纯五度", short: "P5", quality: "perfect", consonance: "perfect", cents: 700 },
  { semitones: 8, degree: 6, name: "小六度", short: "m6", quality: "minor", consonance: "imperfect", cents: 800 },
  { semitones: 9, degree: 6, name: "大六度", short: "M6", quality: "major", consonance: "imperfect", cents: 900 },
  { semitones: 10, degree: 7, name: "小七度", short: "m7", quality: "minor", consonance: "dissonant", cents: 1000 },
  { semitones: 11, degree: 7, name: "大七度", short: "M7", quality: "major", consonance: "dissonant", cents: 1100 },
  { semitones: 12, degree: 8, name: "纯八度", short: "P8", quality: "perfect", consonance: "perfect", cents: 1200 },
];

/** 半音数 → 音程（12 取八度，超过 12 按八度折回）。 */
export function intervalOf(semitones: number): IntervalInfo {
  const n = ((Math.round(semitones) % 12) + 12) % 12;
  if (semitones === 12) return INTERVALS[12];
  return INTERVALS[n];
}

/** 两个音高类之间的**上行**音程（0–11）。 */
export function intervalBetween(fromPc: number, toPc: number): IntervalInfo {
  return intervalOf(((toPc - fromPc) % 12 + 12) % 12);
}

const LETTER_INDEX = new Map(LETTERS.map((letter, index) => [letter, index]));

/**
 * 按**字母步进**拼出根音上方某音程的音名。
 *
 * 例：`spellInterval("C", 4)` → `E`（三度，letters +2）；`spellInterval("C", 3)` → `Eb`。
 * 半音数与字母距离冲突时，以字母距离为准，用升降号补齐——
 * 所以 `spellInterval("C", 6)` 得 `F#`（四度），`spellInterval("F", 6)` 得 `B`。
 */
export function spellInterval(rootName: string, semitones: number, degree?: number): string {
  const match = /^([A-G])([#b]*)$/.exec(rootName);
  if (!match) throw new Error(`bad note name: ${rootName}`);
  const letter = match[1];
  const accidentals = match[2];
  const rootPc = ((LETTER_PC[LETTERS.indexOf(letter as (typeof LETTERS)[number])] +
    (accidentals.match(/#/g)?.length ?? 0) -
    (accidentals.match(/b/g)?.length ?? 0)) % 12 + 12) % 12;

  const steps = (degree ?? intervalOf(semitones).degree) - 1;
  const from = LETTER_INDEX.get(letter as (typeof LETTERS)[number])!;
  const toLetter = LETTERS[(from + steps) % 7];
  const naturalPc = LETTER_PC[(from + steps) % 7];
  const targetPc = (rootPc + semitones) % 12;
  let diff = ((targetPc - naturalPc) % 12 + 12) % 12;
  if (diff > 6) diff -= 12; // 就近取升降，最多 6 个
  if (diff > 0) return toLetter + "#".repeat(diff);
  if (diff < 0) return toLetter + "b".repeat(-diff);
  return toLetter;
}

/** 12 平均律：给定主音，列出 12 个半音的升号名、降号名、音分与频率比。 */
export interface TuningStep {
  semitones: number;
  sharpName: string;
  flatName: string;
  degree: string;
  cents: number;
  /** 相对主音的频率比（2^(n/12)）。 */
  ratio: number;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const DEGREE_LABELS = ["1", "降2", "2", "降3", "3", "4", "升4", "5", "降6", "6", "降7", "7"];

export function twelveToneTable(tonicPc: number): TuningStep[] {
  return Array.from({ length: 12 }, (_, semitones) => {
    const pc = (tonicPc + semitones) % 12;
    return {
      semitones,
      sharpName: SHARP_NAMES[pc],
      flatName: FLAT_NAMES[pc],
      degree: DEGREE_LABELS[semitones],
      cents: semitones * 100,
      ratio: 2 ** (semitones / 12),
    };
  });
}

/** MIDI 音高 → 频率（Hz），默认 A4 = 440。 */
export function frequencyOf(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** 两个 MIDI 音高之间的音分差（不是音程名，只是数值）。 */
export function centsBetween(fromMidi: number, toMidi: number): number {
  return (toMidi - fromMidi) * 100;
}

/* ---------- 三度叠置 ---------- */

export interface ThirdStep {
  from: string;
  to: string;
  semitones: number;
  /** 这一段是什么音程，如「大三度」。 */
  name: string;
}

export interface ThirdStack {
  root: string;
  notes: string[];
  steps: ThirdStep[];
  /** 「大三度 + 小三度」这种描述。 */
  text: string;
}

/**
 * 从根音开始按三度叠置，`semitones` 是相对根音的半音数组（如大三和弦 `[0, 4, 7]`）。
 *
 * 步骤之间也各算一个音程——这正是「和弦 = 三度叠置」的可视化依据。
 */
export function stackThirds(rootName: string, semitones: number[]): ThirdStack {
  const notes = [rootName, ...semitones.slice(1).map((n) => spellInterval(rootName, n))];
  const steps: ThirdStep[] = [];
  for (let i = 1; i < semitones.length; i++) {
    const gap = semitones[i] - semitones[i - 1];
    steps.push({
      from: notes[i - 1],
      to: notes[i],
      semitones: gap,
      name: intervalOf(gap).name,
    });
  }
  return {
    root: rootName,
    notes,
    steps,
    text: steps.map((step) => step.name).join(" + "),
  };
}

/* ---------- 练习（B：每个概念都能练） ---------- */

export interface TheoryQuestion {
  prompt: string;
  answer: string;
  choices: string[];
  explain: string;
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 每次给 4 个选项，正确答案一定在里面。 */
function withChoices(answer: string, pool: string[], rng: () => number): string[] {
  const others = pool.filter((item) => item !== answer);
  const picked = shuffle(others, rng).slice(0, 3);
  return shuffle([answer, ...picked], rng);
}

const NOTE_POOL = ["C", "D", "E", "F", "G", "A", "B"];

/** 音程题：有时问「C 到 E 是什么音程」，有时问「大三度是几个半音」。 */
export function intervalQuestion(rng: () => number): TheoryQuestion {
  const root = pick(NOTE_POOL, rng);
  const semitones = 1 + Math.floor(rng() * 11); // 1..11
  const info = intervalOf(semitones);
  const target = spellInterval(root, semitones);

  if (rng() < 0.5) {
    return {
      prompt: `${root} 到 ${target} 是什么音程？`,
      answer: info.name,
      choices: withChoices(info.name, INTERVALS.slice(1, 12).map((i) => i.name), rng),
      explain: `${root} 到 ${target} 相距 ${semitones} 个半音，是${info.name}（${info.short}）。`,
    };
  }
  return {
    prompt: `${info.name}是几个半音？`,
    answer: String(semitones),
    choices: withChoices(
      String(semitones),
      Array.from({ length: 11 }, (_, i) => String(i + 1)),
      rng,
    ),
    explain: `${info.name}（${info.short}）= ${semitones} 个半音 = ${semitones * 100} 音分。`,
  };
}

const THIRD_CHORDS: { name: string; intervals: number[] }[] = [
  { name: "大三和弦", intervals: [0, 4, 7] },
  { name: "小三和弦", intervals: [0, 3, 7] },
  { name: "大七和弦", intervals: [0, 4, 7, 11] },
  { name: "属七和弦", intervals: [0, 4, 7, 10] },
  { name: "小七和弦", intervals: [0, 3, 7, 10] },
];

/** 三度叠置题：给根音 + 和弦性质，问第 n 个音。 */
export function thirdQuestion(rng: () => number): TheoryQuestion {
  const root = pick(NOTE_POOL, rng);
  const chord = pick(THIRD_CHORDS, rng);
  const stack = stackThirds(root, chord.intervals);
  const index = 1 + Math.floor(rng() * (stack.notes.length - 1));
  const answer = stack.notes[index];
  const pool = ["C", "D", "E", "F", "G", "A", "B", "C#", "Eb", "F#", "Bb"];
  return {
    prompt: `${root} ${chord.name}的${["", "根音", "三音", "五音", "七音"][index]}是哪个音？`,
    answer,
    choices: withChoices(answer, pool, rng),
    explain: `${root} ${chord.name}：${stack.notes.join(" ")}，由${stack.text}叠出来。`,
  };
}
