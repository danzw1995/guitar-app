/**
 * 和弦级数：某个和弦在某个调里是第几级、该用大写还是小写。
 *
 * 大调的七级和弦性质是固定的：
 * I 大三 · ii 小三 · iii 小三 · IV 大三 · V 大三 · vi 小三 · vii° 减三
 * 所以「级数」不只表示位置，还自带「这里应该是什么性质」。
 */
import { KEY_BY_ID, LETTERS, LETTER_PC, SCALE_BY_ID, scaleNames, scalePcs } from "./theory.ts";

export interface ChordDegree {
  /** 1–7。 */
  degree: number;
  /** 罗马数字，大小写表示性质：I / ii / vii°。 */
  roman: string;
  /** 这个级数「应该」是什么性质。 */
  expectedQuality: "major" | "minor" | "diminished";
  /** 实际和弦的性质是否和该级数相符（比如 C 大调里的 V 应该是大三，如果是 Gm 就不符）。 */
  matches: boolean;
  /** 这个级数常见的作用。 */
  role: string;
}

const ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const QUALITIES: ChordDegree["expectedQuality"][] = [
  "major",
  "minor",
  "minor",
  "major",
  "major",
  "minor",
  "diminished",
];
const QUALITY_LABELS = ["大三和弦", "小三和弦", "小三和弦", "大三和弦", "大三和弦", "小三和弦", "减三和弦"];
const QUALITY_SUFFIX = ["", "m", "m", "", "", "m", "dim"];
const ROLES = [
  "主和弦，最稳",
  "常代替 IV，色彩柔和",
  "常代替 I，情绪偏暗",
  "下属和弦，往前推",
  "属和弦，最想回到 I",
  "关系小调的主和弦",
  "减三和弦，很紧张",
];

/** 从和弦名里取根音的音高类（`F#dim` → 6，`Bbm` → 10）。 */
function rootPcOf(name: string): number | null {
  const match = /^([A-G])([#b]*)/.exec(name);
  if (!match) return null;
  const base = LETTER_PC[LETTERS.indexOf(match[1] as (typeof LETTERS)[number])];
  const sharps = (match[2].match(/#/g) ?? []).length;
  const flats = (match[2].match(/b/g) ?? []).length;
  return ((base + sharps - flats) % 12 + 12) % 12;
}

/** 和弦本身的性质（大三 / 小三 / 减三 / 其他）。 */
export function chordKind(chordName: string): "major" | "minor" | "diminished" | "other" {
  const match = /^[A-G][#b]?/.exec(chordName);
  if (!match) return "other";
  const suffix = chordName.slice(match[0].length);
  if (suffix === "") return "major";
  if (suffix === "m") return "minor";
  if (suffix === "dim" || suffix === "°") return "diminished";
  return "other";
}

/**
 * 和弦在调内的级数。不在调内返回 `null`。
 *
 * 例：`chordDegreeInKey("C", "Dm")` → ii 级、小三和弦、match。
 * `chordDegreeInKey("C", "D")` → 也是 ii 级，但 `matches: false`（大调二级应该是小三和弦）。
 */
export function chordDegreeInKey(keyId: string, chordName: string): ChordDegree | null {
  const key = KEY_BY_ID.get(keyId);
  if (!key) return null;
  const rootPc = rootPcOf(chordName);
  if (rootPc === null) return null;

  const pcs = scalePcs(key, SCALE_BY_ID.get("major")!);
  const index = pcs.indexOf(rootPc);
  if (index < 0) return null;

  return {
    degree: index + 1,
    roman: ROMANS[index],
    expectedQuality: QUALITIES[index],
    matches: chordKind(chordName) === QUALITIES[index],
    role: ROLES[index],
  };
}

/** 某个调的七个级数（根音拼写跟着调走，例如 G 大调第七级是 F#dim）。 */
export function degreesOfKey(keyId: string): {
  roman: string;
  root: string;
  quality: string;
  role: string;
}[] {
  const key = KEY_BY_ID.get(keyId);
  if (!key) return [];
  const names = scaleNames(key, SCALE_BY_ID.get("major")!);
  return names.map((name, index) => ({
    roman: ROMANS[index],
    root: `${name}${QUALITY_SUFFIX[index]}`,
    quality: QUALITY_LABELS[index],
    role: ROLES[index],
  }));
}
