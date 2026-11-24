/**
 * 音程表与音程闯关（v0.161.0）。
 *
 * 需求来自「推算」：知道 5 弦 3 品是 C、4 弦 3 品跟它是纯四度，还得能立刻说出那是 F。
 * 所以这里做两件事：
 * 1. 一个调里「根音 → 各度音名」的对照表（按调内拼写，Eb 调写 Ab 而不是 G#）；
 * 2. 一个无限出的题：随机根音 + 随机度数，四选一，答对继续、随时能停。
 *
 * 纯函数、带种子，便于单测与「同一题重放」。
 */
import { INTERVALS, type IntervalInfo } from "./intervals.ts";
import { KEYS, KEY_BY_ID, SCALE_BY_ID, scaleNames } from "./theory.ts";

export interface IntervalRow {
  /** 2–8：二度……八度 */
  degree: number;
  /** 中文名，如「小三度」 */
  label: string;
  /** 缩写，如 `m3` */
  short: string;
  semitones: number;
  /** 根音到这一度在那个调里的音名（C 大调：D / E / F / G / A / B / C） */
  note: string;
  /** 首调唱名 */
  solfege: string;
}

const MAJOR_ROWS: { degree: number; label: string; short: string; solfege: string }[] = [
  { degree: 2, label: "大二度", short: "M2", solfege: "re" },
  { degree: 3, label: "大三度", short: "M3", solfege: "mi" },
  { degree: 4, label: "纯四度", short: "P4", solfege: "fa" },
  { degree: 5, label: "纯五度", short: "P5", solfege: "sol" },
  { degree: 6, label: "大六度", short: "M6", solfege: "la" },
  { degree: 7, label: "大七度", short: "M7", solfege: "ti" },
  { degree: 8, label: "纯八度", short: "P8", solfege: "do" },
];

/** 大调里「根音 → 各度」的对照表；`degree` 索引 1 是二度、7 是八度 */
export function intervalTableOf(keyId: string): { keyId: string; root: string; rows: IntervalRow[] } {
  const key = KEY_BY_ID.get(keyId) ?? KEY_BY_ID.get("C") ?? KEYS[0];
  const major = SCALE_BY_ID.get("major")!;
  const names = scaleNames(key, major);
  const rows = MAJOR_ROWS.map((row) => ({
    ...row,
    // 八度回到主音：名字取 names[0]
    note: row.degree === 8 ? names[0] : names[row.degree - 1],
    semitones: INTERVALS.find((item) => item.degree === row.degree && item.quality === "major")?.semitones ??
      INTERVALS.find((item) => item.degree === row.degree && item.quality === "perfect")?.semitones ??
      0,
  }));
  return { keyId: key.id, root: names[0], rows };
}

export interface QualityRow {
  degree: number;
  items: IntervalInfo[];
}

/** 同一个度数上的几种可能（大/小/纯/增/减），给表格底下那一块用 */
export function intervalQualityRows(): QualityRow[] {
  return [2, 3, 4, 5, 6, 7, 8].map((degree) => ({
    degree,
    items: INTERVALS.filter((item) => item.degree === degree && item.semitones <= 12),
  }));
}

/** 可当根音的调：只用大调那 12 个（小调的主音在表里看「大调」那一列会混，不列） */
export const INTERVAL_KEYS = KEYS.filter((key) => key.mode === "major").map((key) => key.id);

export interface IntervalDrillQuestion {
  /** 第几题（从 0 开始），同一个种子出同一题 */
  index: number;
  keyId: string;
  root: string;
  degree: number;
  /** 「纯四度」 */
  label: string;
  short: string;
  semitones: number;
  /** 正确答案的音名 */
  answer: string;
  /** 四个选项，正确答案在其中 */
  options: string[];
}

/** 小的确定性随机数（同一个种子出同一串） */
function randomOf(seed: number): () => number {
  let state = (Math.floor(Math.abs(seed)) || 1) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * 出一题：随机调 + 二度到八度。
 * 选项从**同一个调**的音里挑，这样四个选项都在调内，考的是「几度是哪个音」而不是认不认识的音。
 */
export function intervalDrillQuestion(index: number, seed = 1): IntervalDrillQuestion {
  const random = randomOf(seed * 977 + index * 7919 + 13);
  const keyId = INTERVAL_KEYS[Math.floor(random() * INTERVAL_KEYS.length)] ?? "C";
  const table = intervalTableOf(keyId);
  const row = table.rows[Math.floor(random() * table.rows.length)] ?? table.rows[0];
  const pool = table.rows.map((item) => item.note).filter((note) => note !== row.note);
  const options = [row.note];
  while (options.length < 4 && pool.length > 0) {
    const pick = pool.splice(Math.floor(random() * pool.length), 1)[0];
    if (pick && !options.includes(pick)) options.push(pick);
  }
  // 调内音只有 7 个、去掉正确答案后至少 6 个，够填满 4 个；万一不够就补调外音名
  let fallback = 0;
  while (options.length < 4) {
    const guess = `?${fallback}`;
    if (!options.includes(guess)) options.push(guess);
    fallback += 1;
  }
  // 打乱（确定性）
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = options[i];
    options[i] = options[j];
    options[j] = a;
  }
  return {
    index,
    keyId,
    root: table.root,
    degree: row.degree,
    label: row.label,
    short: row.short,
    semitones: row.semitones,
    answer: row.note,
    options,
  };
}

/** 一句话答案（答错时显示） */
export function intervalDrillAnswerText(question: IntervalDrillQuestion): string {
  return `${question.root} 的${question.label}是 ${question.answer}（${question.semitones} 个半音）`;
}
