import { generatePuzzle, expectedNameMap } from "../src/index.ts";
import { loadLevels } from "../src/levels.ts";
import { KEY_BY_ID, SCALE_BY_ID, TUNINGS, cellKey, pitchClassAt } from "../src/theory.ts";

const levels = loadLevels();
const which = process.argv[2] ?? "L01";
const level = levels.find((l) => l.id === which) ?? levels[0];
const puzzle = generatePuzzle({
  id: level.id,
  seed: level.seed,
  keyId: level.keyId,
  scaleId: level.scaleId,
  fretMin: level.fretMin,
  fretMax: level.fretMax,
  givenRatio: level.givenRatio,
});

const key = KEY_BY_ID.get(puzzle.keyId)!;
const scale = SCALE_BY_ID.get(puzzle.scaleId)!;
const tuning = TUNINGS.find((t) => t.id === puzzle.tuningId)!;
const expected = expectedNameMap(puzzle);
const given = new Set(puzzle.givens.map(cellKey));
const target = new Set(puzzle.target.map(cellKey));

console.log(`${level.id}  ${level.title}  (${scale.name})  givens ${puzzle.givens.length}/${puzzle.target.length}`);
console.log("     1   2   3   4   5   6   <- 弦（1=高音 e）");
for (let f = puzzle.fretMin; f <= puzzle.fretMax; f++) {
  const cells: string[] = [];
  for (let s = 0; s < 6; s++) {
    const k = `${s}:${f}`;
    if (given.has(k)) {
      const name = expected.get(pitchClassAt(tuning, s, f))!;
      cells.push(name.padEnd(3));
    } else if (target.has(k)) {
      cells.push("?".padEnd(3));
    } else {
      cells.push("·".padEnd(3));
    }
  }
  console.log(`${String(f).padStart(2)} | ${cells.join("")}`);
}
console.log("\n? = 待填   · = 非音阶  给定格直接显示音名");
