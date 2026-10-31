export interface ChordShape {
  name: string;
  /** 低音 E → 高音 e，-1 = 不弹，0 = 空弦。 */
  frets: number[];
  /** 可选的指法（1=食指 … 4=小指，0=空弦）。 */
  fingers?: number[];
  /** 横按品位。 */
  barre?: number;
  /** 难度标签。 */
  level?: "beginner" | "intermediate";
}

export const CHORDS: ChordShape[] = [
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], level: "beginner" },
  { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4], level: "beginner" },
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], level: "beginner" },
  { name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], level: "beginner" },
  { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], level: "beginner" },
  { name: "A", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], level: "beginner" },
  { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], level: "beginner" },
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], level: "beginner" },
  { name: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], level: "beginner" },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1, level: "intermediate" },
  { name: "G7", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], level: "intermediate" },
  { name: "C7", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], level: "intermediate" },
  { name: "Bm", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2, level: "intermediate" },
  { name: "B7", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], level: "intermediate" },
  { name: "Am7", frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], level: "intermediate" },
  { name: "Em7", frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], level: "intermediate" },
];

export const CHORD_BY_NAME = new Map(CHORDS.map((c) => [c.name, c]));
