import fs from "node:fs";
import type { LevelDef } from "./types.ts";

export function loadLevels(): LevelDef[] {
  const url = new URL("../data/levels.json", import.meta.url);
  const raw = JSON.parse(fs.readFileSync(url, "utf8")) as { version: number; levels: LevelDef[] };
  return raw.levels;
}
