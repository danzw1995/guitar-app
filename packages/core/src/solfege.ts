/**
 * 唱名（solfège）映射。
 *
 * 两个维度：
 * - 体系：`fixed`（固定唱名，C=do，与调无关）或 `movable`（首调唱名，当前调主音=1/do）；
 * - 写法：`number`（简谱数字 1–7）或 `syllable`（do re mi）。
 *
 * 变化音一律带「升 / 降」前缀——这是用户要的重点：不能只写 3，要能看出是降 3。
 * 采用「以大三度音阶为参照」的级数：
 * 0=1, 1=升1, 2=2, 3=降3, 4=3, 5=4, 6=升4, 7=5, 8=降6, 9=6, 10=降7, 11=7。
 *
 * 所以自然小调在主音参照下会显示 降3 / 降6 / 降7，正好把调式特征标出来。
 */
export type SolfegeSystem = "movable" | "fixed";
export type SolfegeStyle = "number" | "syllable";

export interface SolfegeOptions {
  system: SolfegeSystem;
  style: SolfegeStyle;
}

const DEGREES: Record<number, { number: string; syllable: string }> = {
  0: { number: "1", syllable: "do" },
  1: { number: "升1", syllable: "升do" },
  2: { number: "2", syllable: "re" },
  3: { number: "降3", syllable: "降mi" },
  4: { number: "3", syllable: "mi" },
  5: { number: "4", syllable: "fa" },
  6: { number: "升4", syllable: "升fa" },
  7: { number: "5", syllable: "sol" },
  8: { number: "降6", syllable: "降la" },
  9: { number: "6", syllable: "la" },
  10: { number: "降7", syllable: "降si" },
  11: { number: "7", syllable: "si" },
};

/** 某个音高类在给定体系下的唱名。 */
export function solfegeLabel(pc: number, tonicPc: number, opts: SolfegeOptions): string {
  const reference = opts.system === "fixed" ? 0 : tonicPc;
  const diff = ((pc - reference) % 12 + 12) % 12;
  const entry = DEGREES[diff];
  return opts.style === "number" ? entry.number : entry.syllable;
}

/** 唱名表的全部 12 个，便于 UI/测试遍历。 */
export function solfegeTable(opts: SolfegeOptions, tonicPc = 0): string[] {
  return Array.from({ length: 12 }, (_, pc) => solfegeLabel(pc, tonicPc, opts));
}

/**
 * 等音写法：同一个黑键，升的叫法和降的叫法各一个。
 * 返回 `primary`（当前显示用的）与 `alternate`（另一种），自然音没有对照。
 */
const ENHARMONIC_NUMBER: Record<number, [string, string]> = {
  1: ["升1", "降2"],
  3: ["升2", "降3"],
  6: ["升4", "降5"],
  8: ["升5", "降6"],
  10: ["升6", "降7"],
};

const ENHARMONIC_SYLLABLE: Record<number, [string, string]> = {
  1: ["升do", "降re"],
  3: ["升re", "降mi"],
  6: ["升fa", "降sol"],
  8: ["升sol", "降la"],
  10: ["升la", "降si"],
};

export interface SolfegeAlternatives {
  primary: string;
  /** 另一个等音写法；自然音为 null。 */
  alternate: string | null;
}

export function solfegeAlternatives(
  pc: number,
  tonicPc: number,
  opts: SolfegeOptions,
): SolfegeAlternatives {
  const reference = opts.system === "fixed" ? 0 : tonicPc;
  const diff = ((pc - reference) % 12 + 12) % 12;
  const primary = solfegeLabel(pc, tonicPc, opts);
  const pair = (opts.style === "number" ? ENHARMONIC_NUMBER : ENHARMONIC_SYLLABLE)[diff];
  if (!pair) return { primary, alternate: null };
  return { primary, alternate: pair[0] === primary ? pair[1] : pair[0] };
}

/**
 * 唱名的八度偏移，单位是八度：`0` 不标点、`+1` 上面一个点、`-1` 下面一个点。
 *
 * 基准是「中央 C 附近的 1」：固定唱名取 C4(MIDI 60)，首调取主音在 4 组
 * （如 G 大调取 G4）。升号/降号不影响基准，只决定级数。
 *
 * 例子（C 大调）：F3(MIDI 53) → -1（下面一个点），F2(41) → -2（下面两个点），
 * 而 C4(60) → 0（不标点）。G 大调里 F#5(78) 与 G4(67) 同属一组，都是 0。
 */
export function solfegeOctaveShift(
  midi: number,
  tonicPc: number,
  opts: Pick<SolfegeOptions, "system">,
): number {
  const base = opts.system === "fixed" ? 60 : 60 + ((tonicPc % 12) + 12) % 12;
  return Math.floor((midi - base) / 12);
}
