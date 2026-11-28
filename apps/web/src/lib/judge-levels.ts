/**
 * 判稳的松紧（v0.178.0）
 *
 * 跟练面板的「判稳」原来只有一个全局值（`guitar.settings.v1` 的 `judgeTolerance`）。
 * 六首小曲与练习页那些碎片的合适松紧不一样，所以再存一张「哪一条用哪一档」的表：
 * 面板会先看这张表里的值，没有才回落到全局默认。
 *
 * 仍然是纯前端、纯 localStorage——不联网、不上传。
 */

export type JudgeLevel = "wide" | "normal" | "tight";

export const JUDGE_LEVELS_KEY = "guitar.judgeLevels.v1";

export const JUDGE_LEVEL_LABEL: Record<JudgeLevel, string> = {
  wide: "宽松",
  normal: "标准",
  tight: "严格",
};

/** `analyzeTiming` 的容差（拍长占比）：越大越松。 */
export const JUDGE_LEVEL_TOLERANCE: Record<JudgeLevel, number> = {
  wide: 0.6,
  normal: 0.42,
  tight: 0.28,
};

export const JUDGE_LEVEL_ORDER: JudgeLevel[] = ["wide", "normal", "tight"];

function isLevel(value: unknown): value is JudgeLevel {
  return value === "wide" || value === "normal" || value === "tight";
}

/** 每条练习/曲目各自的档位；坏数据直接跳过。 */
export function loadJudgeLevels(): Record<string, JudgeLevel> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(JUDGE_LEVELS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, JudgeLevel> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && key.length > 0 && key.length <= 120 && isLevel(value)) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveJudgeLevels(levels: Record<string, JudgeLevel>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(JUDGE_LEVELS_KEY, JSON.stringify(levels));
}

/** 这一条练习自己选的档位；没选过给 null（调用方回落到全局默认）。 */
export function judgeLevelOf(id: string): JudgeLevel | null {
  return loadJudgeLevels()[id] ?? null;
}

export function setJudgeLevel(id: string, level: JudgeLevel): void {
  const levels = loadJudgeLevels();
  levels[id] = level;
  saveJudgeLevels(levels);
}

export function clearJudgeLevel(id: string): void {
  const levels = loadJudgeLevels();
  if (!(id in levels)) return;
  delete levels[id];
  saveJudgeLevels(levels);
}
