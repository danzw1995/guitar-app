/**
 * 乐理挑战：在指板上「点出答案」的小关卡。
 *
 * 和 40 关的区别：
 * - 40 关是「填音名」（给调内音，填名字）；
 * - 乐理挑战是「点亮格子」（给和弦/音程，点亮所有构成音）。
 *
 * 复用同一套进度与星级：每关 4 题，全部作答后合成一个 `AttemptResult` 交给
 * `applyAttempt`，所以星级、最快成绩、统计页都不用改。
 */
import { CHORD_BY_NAME, CHORD_QUALITIES, chordInfo } from "./chords.ts";
import { mulberry32 } from "./puzzle.ts";
import { LETTERS, LETTER_PC, SHARP_NAMES, STANDARD_TUNING, cellKey, pitchClassAt } from "./theory.ts";
import type { AttemptResult, Cell } from "./types.ts";

export type TheoryKind = "triad" | "seventh" | "interval";

export interface TheoryTask {
  /** 题面。 */
  prompt: string;
  /** 作答范围。 */
  fretMin: number;
  fretMax: number;
  /** 需要点亮的音高类。 */
  pcs: number[];
  /** 所有正确格子（范围内的 pcs）。 */
  cells: Cell[];
  /** 解析。 */
  explain: string;
}

export interface TheoryLevelDef {
  id: string;
  title: string;
  chapter: number;
  kind: TheoryKind;
  tasks: number;
  seed: number;
  fretMin: number;
  fretMax: number;
  difficulty: number;
}

const NAMES = ["C", "D", "E", "F", "G", "A", "B"];

/** 三和弦题用的常用和弦（都在和弦库里）。 */
const TRIAD_POOL = ["C", "Am", "F", "G", "Dm", "Em", "D", "A", "E"];

const SEVENTH_POOL: { quality: keyof typeof CHORD_QUALITIES; suffix: string; label: string }[] = [
  { quality: "major7", suffix: "△7", label: "大七" },
  { quality: "dominant7", suffix: "7", label: "属七" },
  { quality: "minor7", suffix: "m7", label: "小七" },
];

/** 音程题用的音程（半音数）。 */
const INTERVAL_POOL = [3, 4, 5, 7, 9];

const pick = <T>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length) % items.length];

const pcOf = (name: string): number => {
  const letter = name[0] as (typeof LETTERS)[number];
  const rest = name.slice(1);
  const sharps = (rest.match(/#/g) ?? []).length;
  const flats = (rest.match(/b/g) ?? []).length;
  return ((LETTER_PC[LETTERS.indexOf(letter)] + sharps - flats) % 12 + 12) % 12;
};

/** 把音高类集合铺到指板范围内，得到所有正确格子。 */
export function cellsFor(pcs: number[], fretMin: number, fretMax: number): Cell[] {
  const wanted = new Set(pcs);
  const cells: Cell[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretMin; f <= fretMax; f++) {
      if (wanted.has(pitchClassAt(STANDARD_TUNING, s, f))) cells.push({ s, f });
    }
  }
  return cells;
}

function makeTask(kind: TheoryKind, rng: () => number, fretMin: number, fretMax: number): TheoryTask {
  if (kind === "triad") {
    const name = pick(TRIAD_POOL, rng);
    const shape = CHORD_BY_NAME.get(name)!;
    const info = chordInfo(shape);
    const pcs = info.tones.map((tone) => tone.pc);
    return {
      prompt: `点亮 ${name}（${info.quality.name}）的所有构成音`,
      fretMin,
      fretMax,
      pcs,
      cells: cellsFor(pcs, fretMin, fretMax),
      explain: `${name} = ${info.tones.map((t) => `${t.name}(${t.degree})`).join(" ")}。`,
    };
  }

  if (kind === "seventh") {
    const rootName = pick(NAMES, rng);
    const pool = pick(SEVENTH_POOL, rng);
    const rootPc = pcOf(rootName);
    const pcs = CHORD_QUALITIES[pool.quality].intervals.map((step) => (rootPc + step) % 12);
    return {
      prompt: `点亮 ${rootName}${pool.suffix}（${pool.label}和弦）的所有构成音`,
      fretMin,
      fretMax,
      pcs,
      cells: cellsFor(pcs, fretMin, fretMax),
      explain: `${rootName}${pool.suffix} 的七音距根音 ${CHORD_QUALITIES[pool.quality].intervals[3]} 个半音。`,
    };
  }

  const base = pick(NAMES, rng);
  const semitones = pick(INTERVAL_POOL, rng);
  const basePc = pcOf(base);
  const targetPc = (basePc + semitones) % 12;
  const intervalName =
    semitones === 3 ? "小三度" : semitones === 4 ? "大三度" : semitones === 5 ? "纯四度" : semitones === 7 ? "纯五度" : "大六度";
  const targetName = SHARP_NAMES[targetPc];
  return {
    prompt: `点亮所有 ${base} 和 ${targetName}（${intervalName}）`,
    fretMin,
    fretMax,
    pcs: [basePc, targetPc],
    cells: cellsFor([basePc, targetPc], fretMin, fretMax),
    explain: `${base} 上方 ${semitones} 个半音是 ${targetName}，也就是${intervalName}。`,
  };
}

/** 12 个乐理关卡：三和弦 4 关、七和弦 4 关、音程 4 关。 */
export const THEORY_LEVELS: TheoryLevelDef[] = [
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `T0${i + 1}`,
    title: `三和弦 ${i + 1}`,
    chapter: 1,
    kind: "triad" as TheoryKind,
    tasks: 4,
    seed: 1100 + i,
    fretMin: 1,
    fretMax: 5,
    difficulty: 0.25 + i * 0.05,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `T0${i + 5}`,
    title: `七和弦 ${i + 1}`,
    chapter: 2,
    kind: "seventh" as TheoryKind,
    tasks: 4,
    seed: 2200 + i,
    fretMin: 1,
    fretMax: 5,
    difficulty: 0.5 + i * 0.05,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `T${String(i + 9).padStart(2, "0")}`,
    title: `音程 ${i + 1}`,
    chapter: 3,
    kind: "interval" as TheoryKind,
    tasks: 4,
    seed: 3300 + i,
    fretMin: 1,
    fretMax: 7,
    difficulty: 0.6 + i * 0.05,
  })),
];

export const THEORY_LEVEL_IDS = THEORY_LEVELS.map((level) => level.id);
export const THEORY_BY_ID = new Map(THEORY_LEVELS.map((level) => [level.id, level]));

/** 同一关每次都出同一组题（seed 固定），方便反复练；同一关内不重复。 */
export function theoryTasks(level: TheoryLevelDef): TheoryTask[] {
  const rng = mulberry32(level.seed);
  const tasks: TheoryTask[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (tasks.length < level.tasks && guard < level.tasks * 40) {
    guard++;
    const task = makeTask(level.kind, rng, level.fretMin, level.fretMax);
    if (seen.has(task.prompt)) continue;
    seen.add(task.prompt);
    tasks.push(task);
  }
  return tasks;
}

export interface TaskJudgement {
  ok: boolean;
  missing: Cell[];
  extra: Cell[];
  total: number;
}

/** 判一题：选中的格子集合必须和正确集合完全相等。 */
export function judgeTask(task: TheoryTask, selected: readonly string[]): TaskJudgement {
  const expected = new Set(task.cells.map(cellKey));
  const picked = new Set(selected);
  const missing = task.cells.filter((cell) => !picked.has(cellKey(cell)));
  const extra: Cell[] = [];
  for (const key of picked) {
    if (expected.has(key)) continue;
    const [s, f] = key.split(":").map(Number);
    extra.push({ s, f });
  }
  return { ok: missing.length === 0 && extra.length === 0, missing, extra, total: task.cells.length };
}

/**
 * 把一关的判定结果合成为 `AttemptResult`，直接喂给 `applyAttempt`。
 *
 * 以「题」为单位统计：全对 → correct；有漏 → empty；有多点 → wrong。
 */
export function theoryAttempt(judgements: readonly TaskJudgement[]): AttemptResult {
  let correct = 0;
  let empty = 0;
  let wrong = 0;
  const cells: AttemptResult["cells"] = [];
  judgements.forEach((judgement, index) => {
    if (judgement.ok) correct++;
    else if (judgement.missing.length > 0) empty++;
    else wrong++;
    cells.push({
      cell: { s: 0, f: index },
      status: judgement.ok ? "correct" : judgement.missing.length > 0 ? "empty" : "wrong",
      expected: "",
      answer: "",
    });
  });
  return {
    cells,
    correct,
    spelling: 0,
    wrong,
    empty,
    total: judgements.length,
    accuracy: judgements.length ? correct / judgements.length : 0,
    finished: true,
  };
}

/** 关卡的总格数（用于算三星时间）。 */
export function theoryTargetCount(level: TheoryLevelDef): number {
  return theoryTasks(level).reduce((sum, task) => sum + task.cells.length, 0);
}
