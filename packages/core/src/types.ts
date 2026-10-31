export type Mode = "major" | "minor";

/** 标准调弦：index 0 = 1 弦（高音 e），index 5 = 6 弦（低音 E）；值为 MIDI。 */
export interface Tuning {
  id: string;
  name: string;
  strings: number[];
}

export interface KeyDef {
  id: string;
  name: string;
  tonicPc: number;
  mode: Mode;
  /** 主音字母，用于拼写（Bb 的 letter 是 B）。 */
  letter: string;
}

export interface ScaleType {
  id: string;
  name: string;
  /** 以哪个调式拼写：大调或小调。 */
  parent: Mode;
  /** 相对父调式音阶的级数下标（0-based）。 */
  degrees: number[];
}

/** s: 0..5（0 = 1 弦高音 e），f: 品。 */
export interface Cell {
  s: number;
  f: number;
}

export type CellStatus = "correct" | "spelling" | "wrong" | "empty";

export interface CellResult {
  cell: Cell;
  expected: string;
  answer: string;
  status: CellStatus;
}

export interface Puzzle {
  id: string;
  keyId: string;
  scaleId: string;
  tuningId: string;
  fretMin: number;
  fretMax: number;
  seed: number;
  givens: Cell[];
  target: Cell[];
  difficulty: number;
}

export interface AttemptResult {
  cells: CellResult[];
  correct: number;
  spelling: number;
  wrong: number;
  empty: number;
  total: number;
  /** correct / total（拼写错误不算正确）。 */
  accuracy: number;
  finished: boolean;
}

export interface LevelDef {
  id: string;
  chapter: number;
  index: number;
  title: string;
  keyId: string;
  scaleId: string;
  tuningId: string;
  fretMin: number;
  fretMax: number;
  seed: number;
  givenRatio: number;
  givens: Cell[];
  targetCount: number;
  difficulty: number;
}
