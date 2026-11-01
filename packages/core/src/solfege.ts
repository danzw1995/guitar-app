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
