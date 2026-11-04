import fs from "node:fs";
import { generatePuzzle } from "../src/puzzle.ts";
import { KEY_BY_ID } from "../src/theory.ts";
import type { LevelDef } from "../src/types.ts";

interface ChapterSpec {
  chapter: number;
  /** 章节标题：写进 data/levels.json，UI 直接渲染，不再写死「第 N 章」。 */
  title: string;
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
    title: "C 大调 · 1–5 品",
    keys: [{ id: "C", count: 8 }],
    scaleId: "major",
    fretMin: 1,
    fretMax: 5,
    ratioFrom: 0.65,
    ratioTo: 0.45,
    seedBase: 1000,
  },
  {
    chapter: 2,
    title: "大调换把 · 1–7 品",
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
    title: "降号调 · 1–7 品",
    keys: [
      { id: "F", count: 3 },
      { id: "Bb", count: 3 },
      { id: "Eb", count: 2 },
    ],
    scaleId: "major",
    fretMin: 1,
    fretMax: 7,
    ratioFrom: 0.5,
    ratioTo: 0.32,
    seedBase: 3000,
  },
  {
    // 小调入门：先用窄品域（1–5）熟悉小三度、降 6、降 7，给定比例偏高
    chapter: 4,
    title: "小调入门 · 1–5 品",
    keys: [
      { id: "Am", count: 3 },
      { id: "Em", count: 2 },
      { id: "Dm", count: 2 },
    ],
    scaleId: "naturalMinor",
    fretMin: 1,
    fretMax: 5,
    ratioFrom: 0.6,
    ratioTo: 0.45,
    seedBase: 4000,
  },
  {
    // 小调进阶：再扩到 9 品（12 品全板留给「推算模式」）
    chapter: 5,
    title: "小调进阶 · 1–9 品",
    keys: [
      { id: "Am", count: 2 },
      { id: "Em", count: 2 },
      { id: "Dm", count: 2 },
      { id: "Bm", count: 1 },
    ],
    scaleId: "naturalMinor",
    fretMin: 1,
    fretMax: 9,
    ratioFrom: 0.45,
    ratioTo: 0.25,
    seedBase: 5000,
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

// 章节标题也写进数据：UI 直接渲染，不再写死「第 N 章」
const chapters = CHAPTERS.map((ch) => ({ id: ch.chapter, title: ch.title }));
fs.writeFileSync(
  new URL("../data/levels.json", import.meta.url),
  JSON.stringify({ version: 1, chapters, levels }, null, 2),
);
console.log(`wrote ${levels.length} levels in ${chapters.length} chapters`);
for (const l of levels) {
  console.log(`${l.id} ch${l.chapter} ${l.keyId} ${l.fretMin}-${l.fretMax} givens=${l.givens.length}/${l.targetCount} diff=${l.difficulty}`);
}
