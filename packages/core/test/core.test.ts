import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY_BY_ID,
  SCALE_BY_ID,
  STANDARD_TUNING,
  cellKey,
  diatonicNames,
  expectedNameMap,
  generatePuzzle,
  parseNote,
  pitchClassAt,
  scaleNames,
  targetCells,
  checkAnswer,
} from "../src/index.ts";
import { loadLevels } from "../src/levels.ts";

test("standard tuning open strings", () => {
  assert.equal(STANDARD_TUNING.strings[0], 64); // 1 弦 e
  assert.equal(STANDARD_TUNING.strings[5], 40); // 6 弦 E
  assert.equal(pitchClassAt(STANDARD_TUNING, 5, 0), 4); // E
  assert.equal(pitchClassAt(STANDARD_TUNING, 0, 1), 5); // F
});

test("key spelling", () => {
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("F")!), ["F", "G", "A", "Bb", "C", "D", "E"]);
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("Bb")!), ["Bb", "C", "D", "Eb", "F", "G", "A"]);
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("Am")!), ["A", "B", "C", "D", "E", "F", "G"]);
  assert.deepEqual(scaleNames(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("majorPentatonic")!), ["C", "D", "E", "G", "A"]);
});

test("note parsing", () => {
  assert.equal(parseNote("C"), 0);
  assert.equal(parseNote("Bb"), 10);
  assert.equal(parseNote("A#"), 10);
  assert.equal(parseNote("H"), null);
});

test("target cells for C major", () => {
  const cells = targetCells(STANDARD_TUNING, KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!, 0, 12);
  assert.ok(cells.length > 35);
  for (const c of cells) {
    assert.ok([0, 2, 4, 5, 7, 9, 11].includes(pitchClassAt(STANDARD_TUNING, c.s, c.f)));
  }
});

test("generate puzzle keeps givens inside target", () => {
  const p = generatePuzzle({ seed: 42, keyId: "F", scaleId: "major", fretMin: 1, fretMax: 7, givenRatio: 0.5 });
  const targetKeys = new Set(p.target.map(cellKey));
  assert.equal(p.givens.length, Math.round(p.target.length * 0.5));
  assert.equal(new Set(p.givens.map(cellKey)).size, p.givens.length);
  for (const g of p.givens) assert.ok(targetKeys.has(cellKey(g)));
  assert.ok(p.difficulty > 0 && p.difficulty < 1);
});

test("checkAnswer: all correct", () => {
  const p = generatePuzzle({ seed: 7, keyId: "G", scaleId: "major", fretMin: 1, fretMax: 5, givenRatio: 0.5 });
  const expected = expectedNameMap(p);
  const answers: Record<string, string> = {};
  for (const c of p.target) answers[cellKey(c)] = expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f))!;
  const r = checkAnswer(p, answers);
  assert.equal(r.correct, r.total);
  assert.equal(r.wrong, 0);
  assert.equal(r.finished, true);
  assert.equal(r.accuracy, 1);
});

test("checkAnswer: spelling warning and wrong", () => {
  const p = generatePuzzle({ seed: 9, keyId: "F", scaleId: "major", fretMin: 1, fretMax: 7, givenRatio: 0.5 });
  const expected = expectedNameMap(p);
  const answers: Record<string, string> = {};
  for (const c of p.target) answers[cellKey(c)] = expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f))!;

  const bb = p.target.find((c) => expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f)) === "Bb");
  assert.ok(bb, "F major should contain Bb");
  answers[cellKey(bb!)] = "A#";
  let r = checkAnswer(p, answers);
  const bbResult = r.cells.find((c) => cellKey(c.cell) === cellKey(bb!))!;
  assert.equal(bbResult.status, "spelling");
  assert.equal(r.spelling, 1);

  const other = p.target.find((c) => cellKey(c) !== cellKey(bb!))!;
  answers[cellKey(other)] = "H";
  r = checkAnswer(p, answers);
  assert.equal(r.wrong, 1);
  assert.equal(r.finished, true);
});

test("checkAnswer: empty cells", () => {
  const p = generatePuzzle({ seed: 3, keyId: "C", scaleId: "major", fretMin: 1, fretMax: 5, givenRatio: 0.5 });
  const r = checkAnswer(p, {});
  assert.equal(r.empty, r.total);
  assert.equal(r.finished, false);
});

test("40 levels are valid", () => {
  const levels = loadLevels();
  assert.equal(levels.length, 40);
  const seen = new Set<string>();
  for (const l of levels) {
    assert.ok(!seen.has(l.id));
    seen.add(l.id);
    const p = generatePuzzle({
      id: l.id,
      seed: l.seed,
      keyId: l.keyId,
      scaleId: l.scaleId,
      fretMin: l.fretMin,
      fretMax: l.fretMax,
      givenRatio: l.givenRatio,
    });
    assert.equal(p.target.length, l.targetCount, `${l.id} target count`);
    const targetKeys = new Set(p.target.map(cellKey));
    assert.equal(p.givens.length, l.givens.length, `${l.id} givens count`);
    for (const g of l.givens) {
      assert.ok(targetKeys.has(cellKey(g)), `${l.id} given ${cellKey(g)} not in target`);
    }
    assert.equal(new Set(l.givens.map(cellKey)).size, l.givens.length, `${l.id} duplicate givens`);
  }
});
