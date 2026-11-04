import { parMsFor, type LevelDef } from "@guitar/core";
import levelsJson from "../../../../packages/core/data/levels.json";

/**
 * 关卡数据沿用现有做法：Vite 直接 import JSON，
 * 不经过 core 的 `levels.ts`（那个只给 Node 脚本/测试用）。
 */
const data = levelsJson as {
  chapters?: { id: number; title: string }[];
  levels: LevelDef[];
};

export const LEVELS = data.levels;

export const LEVEL_IDS: string[] = LEVELS.map((l) => l.id);

/**
 * 章节列表（id + 标题）来自 `data/levels.json`。
 *
 * 不要再在 UI 里写死 `[1,2,3,4]` 或「第 N 章」：加章时写死会让后面的关**静默消失**，
 * 或者标题和内容对不上（之前踩过）。
 */
export const CHAPTERS: { id: number; title: string }[] =
  data.chapters ??
  [...new Set(LEVELS.map((l) => l.chapter))]
    .sort((a, b) => a - b)
    .map((id) => ({ id, title: `第 ${id} 章` }));

export const MAX_TOTAL_STARS = LEVELS.length * 3;

/** 该关的三星达标时间；`LevelDef` 自带 targetCount 和 difficulty，不用重算 puzzle。 */
export function parMsOf(level: LevelDef): number {
  return parMsFor({ targetCount: level.targetCount, difficulty: level.difficulty });
}

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
