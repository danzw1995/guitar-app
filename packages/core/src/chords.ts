import { LETTERS, LETTER_PC, accidentalToString } from "./theory.ts";
import { n, tabOf, type Tab } from "./tab.ts";

export interface ChordShape {
  name: string;
  /** 低音 E → 高音 e，-1 = 不弹，0 = 空弦。 */
  frets: number[];
  /** 可选的指法（1=食指 … 4=小指，0=空弦）。 */
  fingers?: number[];
  /** 横按品位。 */
  barre?: number;
  /** 难度标签。 */
  level?: "beginner" | "intermediate";
}

export type ChordQuality = "major" | "minor" | "dominant7" | "major7" | "minor7";

export interface ChordQualityInfo {
  id: ChordQuality;
  /** 中文名。 */
  name: string;
  /** 相对根音的半音数。 */
  intervals: number[];
  /** 每个音相对根音的级数（简谱式，变化音带升/降）。 */
  degrees: string[];
}

export const CHORD_QUALITIES: Record<ChordQuality, ChordQualityInfo> = {
  major: { id: "major", name: "大三和弦", intervals: [0, 4, 7], degrees: ["1", "3", "5"] },
  minor: { id: "minor", name: "小三和弦", intervals: [0, 3, 7], degrees: ["1", "降3", "5"] },
  dominant7: { id: "dominant7", name: "属七和弦", intervals: [0, 4, 7, 10], degrees: ["1", "3", "5", "降7"] },
  major7: { id: "major7", name: "大七和弦", intervals: [0, 4, 7, 11], degrees: ["1", "3", "5", "7"] },
  minor7: { id: "minor7", name: "小七和弦", intervals: [0, 3, 7, 10], degrees: ["1", "降3", "5", "降7"] },
};

/** 后缀优先匹配，长后缀先试（`Fmaj7` 不能被当成 `F` + `m`）。 */
const SUFFIXES: Array<[string, ChordQuality]> = [
  ["maj7", "major7"],
  ["m7", "minor7"],
  ["m", "minor"],
  ["7", "dominant7"],
  ["", "major"],
];

/** 每个和弦音相对根音跨了几个字母（三音跨 2 个字母、五音 4 个、七音 6 个）。 */
const LETTER_STEPS = [0, 2, 4, 6];

export interface ChordTone {
  /** 按调式拼写的音名，如 C7 的七音是 Bb 而不是 A#。 */
  name: string;
  pc: number;
  /** 相对根音的级数：1 / 3 / 5 / 降7 … */
  degree: string;
}

export interface ChordInfo {
  rootName: string;
  rootPc: number;
  quality: ChordQualityInfo;
  tones: ChordTone[];
}

function spellTone(rootLetterIndex: number, rootPc: number, semitones: number, letters: number): string {
  const letterIndex = (rootLetterIndex + letters) % 7;
  const letterPc = LETTER_PC[letterIndex];
  const want = ((rootPc + semitones) % 12 + 12) % 12;
  let diff = ((want - letterPc) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  return LETTERS[letterIndex] + accidentalToString(diff);
}

/** 从和弦名解析根音与性质。 */
export function parseChordName(name: string): { rootName: string; rootPc: number; quality: ChordQualityInfo } {
  const match = /^([A-G][#b]?)/.exec(name);
  if (!match) throw new Error(`bad chord name: ${name}`);
  const rootName = match[1];
  const suffix = name.slice(rootName.length);

  const found = SUFFIXES.find(([text]) => suffix === text);
  if (!found) throw new Error(`unknown chord suffix: ${suffix}`);

  const letterIndex = LETTERS.indexOf(rootName[0] as (typeof LETTERS)[number]);
  const rootPc = (LETTER_PC[letterIndex] + (rootName.endsWith("#") ? 1 : rootName.endsWith("b") ? -1 : 0) + 12) % 12;
  return { rootName, rootPc, quality: CHORD_QUALITIES[found[1]] };
}

/** 和弦的构成音：根音、三音、五音（七和弦再加七音）。 */
export function chordInfo(chord: ChordShape): ChordInfo {
  const { rootName, rootPc, quality } = parseChordName(chord.name);
  const letterIndex = LETTERS.indexOf(rootName[0] as (typeof LETTERS)[number]);
  const tones = quality.intervals.map((semitones, i) => ({
    name: spellTone(letterIndex, rootPc, semitones, LETTER_STEPS[i]),
    pc: ((rootPc + semitones) % 12 + 12) % 12,
    degree: quality.degrees[i],
  }));
  return { rootName, rootPc, quality, tones };
}

/** 六线谱式的指法串：`x32010`，从 6 弦到 1 弦，`x` 表示不弹。 */
export function fingeringOf(chord: ChordShape): string {
  return chord.frets.map((f) => (f < 0 ? "x" : String(f))).join("");
}

/**
 * 把一个和弦的按法写成一张谱：一整小节一个全音符和弦。
 *
 * `frets[0]` 是低音 E（6 弦），`TabNote.s` 反过来是 1 = 高音 e，所以要 `6 - index`。
 * 不弹的弦（`-1`）不进谱。
 */
export function chordVoicingTab(chord: ChordShape, beatsPerBar = 4): Tab {
  const notes = chord.frets
    .map((fret, index) => ({ fret, string: 6 - index }))
    .filter((item) => item.fret >= 0)
    .map((item) => n(item.string, item.fret, 0, beatsPerBar));
  return tabOf(notes, {
    beatsPerBar,
    bpm: [60, 80],
    caption: `${chord.name} · ${fingeringOf(chord)}`,
  });
}

/** 同一个和弦的两种弹法（v0.87.0）：一下扫下去，还是把弦一根根拨出来。 */
export type ChordPattern = "strum" | "arpeggio";

/**
 * 把一个和弦按两种弹法写成谱（v0.87.0）。
 *
 * - `strum`：所有弦落在同一拍上，全音符——谱面就是「一下扫过去」。
 * - `arpeggio`：一根弦一拍，从低音往高音走，四分音符——「分解」的样子。
 *   弦多于 4 根时会折到下一小节（4/4 一小节四拍），所以 `bars` 可能是 2。
 */
export function chordPatternTab(
  chord: ChordShape,
  pattern: ChordPattern = "strum",
  beatsPerBar = 4,
): Tab {
  const spots = chord.frets
    .map((fret, index) => ({ fret, string: 6 - index }))
    .filter((item) => item.fret >= 0);
  const notes =
    pattern === "strum"
      ? spots.map((item) => n(item.string, item.fret, 0, beatsPerBar))
      : spots.map((item, index) => n(item.string, item.fret, index, 1));
  return tabOf(notes, {
    beatsPerBar,
    bpm: [60, 80],
    caption: `${chord.name} · ${fingeringOf(chord)} · ${pattern === "strum" ? "扫弦" : "分解"}`,
  });
}

export const CHORDS: ChordShape[] = [
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], level: "beginner" },
  { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4], level: "beginner" },
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], level: "beginner" },
  { name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], level: "beginner" },
  { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], level: "beginner" },
  { name: "A", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], level: "beginner" },
  { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], level: "beginner" },
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], level: "beginner" },
  { name: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], level: "beginner" },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1, level: "intermediate" },
  { name: "G7", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], level: "intermediate" },
  { name: "C7", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], level: "intermediate" },
  { name: "Bm", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2, level: "intermediate" },
  { name: "B7", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], level: "intermediate" },
  { name: "Am7", frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], level: "intermediate" },
  { name: "Em7", frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], level: "intermediate" },
];

export const CHORD_BY_NAME = new Map(CHORDS.map((c) => [c.name, c]));
