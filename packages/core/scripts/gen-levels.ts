import fs from "node:fs";
import { generatePuzzle } from "../src/puzzle.ts";
import { KEY_BY_ID } from "../src/theory.ts";
import type { LevelDef } from "../src/types.ts";

interface ChapterSpec {
  chapter: number;
  keys: { id: string; count: number }[];
  scaleId: string;
  fretMin: number;
  fretMax: number;
  ratioFrom: number;
  ratioTo: number;
  seedBase: number;
}

const CHAPTERS: ChapterSpec[] = [
  {
    chapter: 1,
    keys: [{ id: "C", count: 10 }],
    scaleId: "major",
    fretMin: 1,
    fretMax: 5,
    ratioFrom: 0.65,
    ratioTo: 0.45,
    seedBase: 1000,
  },
  {
    chapter: 2,
    keys: [
      { id: "G", count: 3 },
      { id: "D", count: 3 },
      { id: "A", count: 2 },
      { id: "E", count: 2 },
    ],
    scaleId: "major",
    fretMin: 1,
    fretMax: 7,
    ratioFrom: 0.55,
    ratioTo: 0.35,
    seedBase: 2000,
  },
  {
    chapter: 3,
    keys: [
      { id: "F", count: 4 },
      { id: "Bb", count: 3 },
      { id: "Eb", count: 3 },
    ],
    scaleId: "major",
    fretMin: 1,
    fretMax: 7,
    ratioFrom: 0.5,
    ratioTo: 0.3,
    seedBase: 3000,
  },
  {
    chapter: 4,
    keys: [
      { id: "Am", count: 4 },
      { id: "Em", count: 3 },
      { id: "Dm", count: 2 },
      { id: "Bm", count: 1 },
    ],
    scaleId: "naturalMinor",
    // 不用空弦：空弦在指板上是琴枕左侧的特殊列，混在关卡里既不好看也不好填
    fretMin: 1,
    fretMax: 12,
    ratioFrom: 0.4,
    ratioTo: 0.2,
    seedBase: 4000,
  },
];

const levels: LevelDef[] = [];
let n = 0;

for (const ch of CHAPTERS) {
  const keys: string[] = [];
  for (const k of ch.keys) for (let i = 0; i < k.count; i++) keys.push(k.id);

  for (let i = 0; i < keys.length; i++) {
    n++;
    const t = keys.length > 1 ? i / (keys.length - 1) : 0;
    const ratio = Math.round((ch.ratioFrom + (ch.ratioTo - ch.ratioFrom) * t) * 100) / 100;
    const keyId = keys[i];
    const seed = ch.seedBase + i + 1;
    const puzzle = generatePuzzle({
      seed,
      keyId,
      scaleId: ch.scaleId,
      fretMin: ch.fretMin,
      fretMax: ch.fretMax,
      givenRatio: ratio,
    });
    const key = KEY_BY_ID.get(keyId)!;
    levels.push({
      id: `L${String(n).padStart(2, "0")}`,
      chapter: ch.chapter,
      index: i + 1,
      title: `${key.name} · ${ch.fretMin}–${ch.fretMax} 品`,
      keyId,
      scaleId: ch.scaleId,
      tuningId: "standard",
      fretMin: ch.fretMin,
      fretMax: ch.fretMax,
      seed,
      givenRatio: ratio,
      givens: puzzle.givens,
      targetCount: puzzle.target.length,
      difficulty: puzzle.difficulty,
    });
  }
}

fs.writeFileSync(new URL("../data/levels.json", import.meta.url), JSON.stringify({ version: 1, levels }, null, 2));
console.log(`wrote ${levels.length} levels`);
for (const l of levels) {
  console.log(`${l.id} ch${l.chapter} ${l.keyId} ${l.fretMin}-${l.fretMax} givens=${l.givens.length}/${l.targetCount} diff=${l.difficulty}`);
}
