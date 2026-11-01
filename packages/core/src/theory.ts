import type { Cell, KeyDef, Mode, ScaleType, Tuning } from "./types.ts";

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** 降号拼写，用来给黑键标出等音的另一种叫法（C# 也是 Db）。 */
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

/** v1 只支持标准调弦；index 0 = 1 弦（高音 e）。 */
export const STANDARD_TUNING: Tuning = {
  id: "standard",
  name: "标准调弦 EADGBE",
  strings: [64, 59, 55, 50, 45, 40],
};

export const TUNINGS: Tuning[] = [STANDARD_TUNING];

export const KEYS: KeyDef[] = [
  { id: "C", name: "C 大调", tonicPc: 0, mode: "major", letter: "C" },
  { id: "G", name: "G 大调", tonicPc: 7, mode: "major", letter: "G" },
  { id: "D", name: "D 大调", tonicPc: 2, mode: "major", letter: "D" },
  { id: "A", name: "A 大调", tonicPc: 9, mode: "major", letter: "A" },
  { id: "E", name: "E 大调", tonicPc: 4, mode: "major", letter: "E" },
  { id: "B", name: "B 大调", tonicPc: 11, mode: "major", letter: "B" },
  { id: "F", name: "F 大调", tonicPc: 5, mode: "major", letter: "F" },
  { id: "Bb", name: "Bb 大调", tonicPc: 10, mode: "major", letter: "B" },
  { id: "Eb", name: "Eb 大调", tonicPc: 3, mode: "major", letter: "E" },
  { id: "Ab", name: "Ab 大调", tonicPc: 8, mode: "major", letter: "A" },
  { id: "Db", name: "Db 大调", tonicPc: 1, mode: "major", letter: "D" },
  { id: "F#", name: "F# 大调", tonicPc: 6, mode: "major", letter: "F" },
  { id: "Am", name: "A 小调", tonicPc: 9, mode: "minor", letter: "A" },
  { id: "Em", name: "E 小调", tonicPc: 4, mode: "minor", letter: "E" },
  { id: "Bm", name: "B 小调", tonicPc: 11, mode: "minor", letter: "B" },
  { id: "F#m", name: "F# 小调", tonicPc: 6, mode: "minor", letter: "F" },
  { id: "C#m", name: "C# 小调", tonicPc: 1, mode: "minor", letter: "C" },
  { id: "Dm", name: "D 小调", tonicPc: 2, mode: "minor", letter: "D" },
  { id: "Gm", name: "G 小调", tonicPc: 7, mode: "minor", letter: "G" },
  { id: "Cm", name: "C 小调", tonicPc: 0, mode: "minor", letter: "C" },
  { id: "Fm", name: "F 小调", tonicPc: 5, mode: "minor", letter: "F" },
  { id: "Bbm", name: "Bb 小调", tonicPc: 10, mode: "minor", letter: "B" },
];

export const KEY_BY_ID = new Map(KEYS.map((k) => [k.id, k]));

export const SCALES: ScaleType[] = [
  { id: "major", name: "大调", parent: "major", degrees: [0, 1, 2, 3, 4, 5, 6] },
  { id: "naturalMinor", name: "自然小调", parent: "minor", degrees: [0, 1, 2, 3, 4, 5, 6] },
  { id: "majorPentatonic", name: "大调五声", parent: "major", degrees: [0, 1, 2, 4, 5] },
  { id: "minorPentatonic", name: "小调五声", parent: "minor", degrees: [0, 2, 3, 4, 6] },
];

export const SCALE_BY_ID = new Map(SCALES.map((s) => [s.id, s]));

export function accidentalToString(diff: number): string {
  if (diff === 0) return "";
  if (diff === 1) return "#";
  if (diff === 2) return "##";
  if (diff === -1) return "b";
  if (diff === -2) return "bb";
  throw new Error(`accidental out of range: ${diff}`);
}

/** 用指定主音字母和调式，拼出 7 个级数的音名。 */
export function diatonicNamesFor(tonicPc: number, letter: string, mode: Mode): string[] {
  const steps = mode === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const start = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  if (start < 0) throw new Error(`bad letter: ${letter}`);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    const letterPc = LETTER_PC[(start + i) % 7];
    const want = (tonicPc + steps[i]) % 12;
    let diff = (want - letterPc + 12) % 12;
    if (diff > 6) diff -= 12;
    names.push(LETTERS[(start + i) % 7] + accidentalToString(diff));
  }
  return names;
}

export function diatonicNames(key: KeyDef): string[] {
  return diatonicNamesFor(key.tonicPc, key.letter, key.mode);
}

/** 某个音阶在某个调里的音名（按级数顺序）。 */
export function scaleNames(key: KeyDef, scale: ScaleType): string[] {
  const names = diatonicNamesFor(key.tonicPc, key.letter, scale.parent);
  return scale.degrees.map((d) => names[d]);
}

/** 某个音阶在某个调里的音高类（按级数顺序）。 */
export function scalePcs(key: KeyDef, scale: ScaleType): number[] {
  const steps = scale.parent === "major" ? MAJOR_STEPS : MINOR_STEPS;
  return scale.degrees.map((d) => (key.tonicPc + steps[d]) % 12);
}

export function midiAt(tuning: Tuning, s: number, f: number): number {
  return tuning.strings[s] + f;
}

export function pitchClassAt(tuning: Tuning, s: number, f: number): number {
  return ((midiAt(tuning, s, f) % 12) + 12) % 12;
}

export function cellKey(cell: Cell): string {
  return `${cell.s}:${cell.f}`;
}

export function parseNote(name: string): number | null {
  const m = /^([A-G])([#b]{0,2})$/.exec(name.trim());
  if (!m) return null;
  const base = LETTER_PC[LETTERS.indexOf(m[1] as (typeof LETTERS)[number])];
  let acc = 0;
  for (const ch of m[2]) acc += ch === "#" ? 1 : -1;
  return ((base + acc) % 12 + 12) % 12;
}

/** 不在音阶里的音，用升号拼写（v1 很少用到）。 */
export function fallbackName(pc: number): string {
  return SHARP_NAMES[((pc % 12) + 12) % 12];
}

/** 目标格：品范围内、属于该音阶的所有格子。 */
export function targetCells(
  tuning: Tuning,
  key: KeyDef,
  scale: ScaleType,
  fretMin: number,
  fretMax: number,
): Cell[] {
  const pcs = new Set(scalePcs(key, scale));
  const out: Cell[] = [];
  for (let s = 0; s < tuning.strings.length; s++) {
    for (let f = fretMin; f <= fretMax; f++) {
      if (pcs.has(pitchClassAt(tuning, s, f))) out.push({ s, f });
    }
  }
  return out;
}

export function accidentalCount(key: KeyDef): number {
  return diatonicNames(key).filter((n) => n.includes("#") || n.includes("b")).length;
}

/**
 * 音名选择器的候选列表（含等音），数组顺序就是按钮顺序。
 * 点按钮和键盘输入共用这一份，避免两套名字对不上。
 */
export const NOTE_NAMES = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb",
  "G", "G#", "Ab", "A", "A#", "Bb", "B",
];

/** 前缀过滤；精确匹配排最前（输 "B" 得到 ["B", "Bb"]）。 */
export function noteCandidates(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...NOTE_NAMES];
  return NOTE_NAMES.filter((n) => n.toLowerCase().startsWith(q)).sort(
    (a, b) => Number(b.toLowerCase() === q) - Number(a.toLowerCase() === q),
  );
}

/**
 * 键盘按下一键后的音名查询串；`null` 表示这个键不归音名输入管。
 *
 * - 字母 a–g 起头（转大写）；
 * - 已有一个字母时再按 `b` 当降号：`B` + `b` = `Bb`、`E` + `b` = `Eb`；
 * - 已有一个字母时再按 `#` 当升号：`C` + `#` = `C#`；
 * - 其他位置按 `#`/`b` 不改变查询，避免出现 `C##` 这种无意义输入。
 */
export function nextNoteQuery(current: string, key: string): string | null {
  if (key === "#") return current.length === 1 ? `${current}#` : current;
  if (/^[a-g]$/i.test(key)) {
    const isFlat = key === "b";
    return isFlat && current.length === 1 ? `${current}b` : key.toUpperCase();
  }
  return null;
}
