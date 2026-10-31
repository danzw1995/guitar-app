import { parMsFor, type LevelDef } from "@guitar/core";
import levelsJson from "../../../../packages/core/data/levels.json";

/**
 * 关卡数据沿用现有做法：Vite 直接 import JSON，
 * 不经过 core 的 `levels.ts`（那个只给 Node 脚本/测试用）。
 */
export const LEVELS = (levelsJson as { levels: LevelDef[] }).levels;

export const LEVEL_IDS: string[] = LEVELS.map((l) => l.id);

export const MAX_TOTAL_STARS = LEVELS.length * 3;

/** 该关的三星达标时间；`LevelDef` 自带 targetCount 和 difficulty，不用重算 puzzle。 */
export function parMsOf(level: LevelDef): number {
  return parMsFor({ targetCount: level.targetCount, difficulty: level.difficulty });
}

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
