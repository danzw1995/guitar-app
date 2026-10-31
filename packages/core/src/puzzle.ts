import type { AttemptResult, Cell, CellResult, Puzzle } from "./types.ts";
import {
  KEY_BY_ID,
  SCALE_BY_ID,
  TUNINGS,
  cellKey,
  accidentalCount,
  parseNote,
  pitchClassAt,
  scaleNames,
  scalePcs,
  targetCells,
} from "./theory.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCALE_WEIGHT: Record<string, number> = {
  major: 0,
  naturalMinor: 0.15,
  majorPentatonic: 0.05,
  minorPentatonic: 0.1,
};

export interface GenerateOptions {
  id?: string;
  seed: number;
  keyId: string;
  scaleId: string;
  tuningId?: string;
  fretMin: number;
  fretMax: number;
  givenRatio: number;
}

export function difficultyOf(p: {
  keyId: string;
  scaleId: string;
  fretMin: number;
  fretMax: number;
  givens: Cell[];
  target: Cell[];
}): number {
  const key = KEY_BY_ID.get(p.keyId);
  if (!key) throw new Error(`unknown key ${p.keyId}`);
  const coverage = 1 - p.givens.length / Math.max(1, p.target.length);
  const keys = Math.min(1, accidentalCount(key) / 7);
  const span = Math.min(1, (p.fretMax - p.fretMin) / 12);
  const strings = new Set(p.givens.map((g) => g.s)).size / 6;
  const weight = SCALE_WEIGHT[p.scaleId] ?? 0.1;
  const score = 0.45 * coverage + 0.2 * keys + 0.15 * span + 0.1 * strings + 0.1 * weight;
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

export function generatePuzzle(opts: GenerateOptions): Puzzle {
  const key = KEY_BY_ID.get(opts.keyId);
  const scale = SCALE_BY_ID.get(opts.scaleId);
  const tuning = TUNINGS.find((t) => t.id === (opts.tuningId ?? "standard"));
  if (!key) throw new Error(`unknown key ${opts.keyId}`);
  if (!scale) throw new Error(`unknown scale ${opts.scaleId}`);
  if (!tuning) throw new Error(`unknown tuning ${opts.tuningId}`);

  const target = targetCells(tuning, key, scale, opts.fretMin, opts.fretMax);
  if (target.length < 2) throw new Error("target too small");

  const rng = mulberry32(opts.seed);
  const wanted = Math.max(1, Math.min(target.length - 1, Math.round(target.length * opts.givenRatio)));
  const chosen = new Map<string, Cell>();
  const add = (c: Cell) => { if (!chosen.has(cellKey(c))) chosen.set(cellKey(c), c); };

  // 每条弦至少给一个，避免整弦空白
  for (let s = 0; s < tuning.strings.length; s++) {
    const list = target.filter((c) => c.s === s);
    if (list.length) add(list[Math.floor(rng() * list.length)]);
  }
  // 补足数量
  let guard = 0;
  while (chosen.size < wanted && guard++ < 10000) {
    add(target[Math.floor(rng() * target.length)]);
  }

  const givens = [...chosen.values()].sort((a, b) => a.s - b.s || a.f - b.f).slice(0, wanted);
  const id = opts.id ?? `${opts.keyId}-${opts.scaleId}-${opts.fretMin}-${opts.fretMax}-${opts.seed}`;

  return {
    id,
    keyId: opts.keyId,
    scaleId: opts.scaleId,
    tuningId: tuning.id,
    fretMin: opts.fretMin,
    fretMax: opts.fretMax,
    seed: opts.seed,
    givens,
    target,
    difficulty: difficultyOf({ ...opts, givens, target }),
  };
}

export function expectedNameMap(puzzle: Puzzle): Map<number, string> {
  const key = KEY_BY_ID.get(puzzle.keyId)!;
  const scale = SCALE_BY_ID.get(puzzle.scaleId)!;
  const names = scaleNames(key, scale);
  const pcs = scalePcs(key, scale);
  const map = new Map<number, string>();
  pcs.forEach((pc, i) => { if (!map.has(pc)) map.set(pc, names[i]); });
  return map;
}

export function checkAnswer(puzzle: Puzzle, answers: Record<string, string>): AttemptResult {
  const key = KEY_BY_ID.get(puzzle.keyId)!;
  const tuning = TUNINGS.find((t) => t.id === puzzle.tuningId)!;
  const expected = expectedNameMap(puzzle);

  const cells: CellResult[] = puzzle.target.map((cell) => {
    const answer = (answers[cellKey(cell)] ?? "").trim();
    const pc = pitchClassAt(tuning, cell.s, cell.f);
    const expectedName = expected.get(pc) ?? "";
    let status: CellResult["status"];
    if (!answer) status = "empty";
    else if (parseNote(answer) !== pc) status = "wrong";
    else if (answer !== expectedName) status = "spelling";
    else status = "correct";
    return { cell, expected: expectedName, answer, status };
  });

  const count = (s: CellResult["status"]) => cells.filter((c) => c.status === s).length;
  const correct = count("correct");
  const spelling = count("spelling");
  const wrong = count("wrong");
  const empty = count("empty");
  const total = cells.length;
  return {
    cells,
    correct,
    spelling,
    wrong,
    empty,
    total,
    accuracy: total ? correct / total : 0,
    finished: empty === 0,
  };
}
