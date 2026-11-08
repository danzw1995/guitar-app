// 时值换算：四分音符为 1，换算成 alphaTex 的「基本时值 + 附点」。
// alphaTab 认的写法是 `.4` `.8` `.16` 这类，附点另外用 {d} 标，
// 所以这里只负责把 1.5 拆成「基本值 + 要不要附点」。

/** alphaTab 认得的标准时值（从长到短）。 */
export const STANDARD_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125, 0.0625];

const BASE_VALUES = [4, 2, 1, 0.5, 0.25, 0.125];

/** 1 → `.4`；0.5 → `.8`；0.25 → `.16`。 */
export function tokenOf(value) {
  const denominator = Math.round(4 / value);
  return `.${denominator}`;
}

/**
 * 把一个时值拆成 alphaTex 能写的若干段：
 * 1.75 → [1.5, 0.25]，1.5 → [1.5]（附点四分），0.375 → [0.375]。
 */
export function chunkValue(quarters) {
  const parts = [];
  let left = quarters;
  while (left > 1e-6) {
    let picked = 0;
    for (const value of STANDARD_VALUES) {
      if (value <= left + 1e-6) {
        picked = value;
        break;
      }
    }
    if (picked === 0) {
      // 比 1/64 还碎的音，凑到最近的 1/64，避免死循环
      picked = 0.0625;
    }
    parts.push(picked);
    left -= picked;
  }
  return parts.length > 0 ? parts : [0.25];
}

/** 时值 → { token, dotted }；附点写成 1.5 倍的基本时值。 */
export function durationParts(quarters) {
  for (const base of BASE_VALUES) {
    if (Math.abs(base - quarters) < 1e-6) {
      return { token: tokenOf(base), dotted: false };
    }
    if (Math.abs(base * 1.5 - quarters) < 1e-6) {
      return { token: tokenOf(base), dotted: true };
    }
  }
  // 三连音之类的非标准时值：取最接近的八分，让调用方知道要补 {tu}
  return { token: ".8", dotted: false };
}
