/**
 * CAGED 五把位。
 *
 * 同一个大三和弦，吉他上有 5 种"形状"，分别来自五个开放和弦：C、A、G、E、D。
 * 把开放形状整块沿琴颈平移，空弦处变成横按，就得到同一个和弦在其他把位的按法。
 *
 * 关键只有一条：每个形状都有一个**根音锚点**（第几根弦、开放时在第几品）。
 * 想让这个形状变成某个和弦，只需要把它平移到"根音落在这个和弦的音高上"。
 */

export type CagedId = "C" | "A" | "G" | "E" | "D";

export interface CagedShape {
  id: CagedId;
  /** 形状名，如「E 形」。 */
  name: string;
  /** 平移量：向高把位移动几品（0 表示就是开放形状）。 */
  shift: number;
  /** 平移后的按法；索引 0 = 6 弦，-1 表示不弹。 */
  frets: number[];
  /** 覆盖的品位区间（含边界）；`shift` 处是横按。 */
  span: [number, number];
  /** 根音落在哪几根弦上（索引 0 = 6 弦）。 */
  rootStrings: number[];
  /** 这个形状里，横按 / 最低按弦在第几品。 */
  baseFret: number;
}

/** 六个索引（0 = 6 弦）对应的空弦音高类。 */
const OPEN_PCS = [4, 9, 2, 7, 11, 4];

/** 五个开放形状：按法（索引 0 = 6 弦）、根音所在的弦、以及根音在开放形状里的品。 */
const SHAPES: { id: CagedId; frets: number[]; rootString: number; rootFret: number }[] = [
  { id: "C", frets: [-1, 3, 2, 0, 1, 0], rootString: 1, rootFret: 3 },
  { id: "A", frets: [-1, 0, 2, 2, 2, 0], rootString: 1, rootFret: 0 },
  { id: "G", frets: [3, 2, 0, 0, 0, 3], rootString: 0, rootFret: 3 },
  { id: "E", frets: [0, 2, 2, 1, 0, 0], rootString: 0, rootFret: 0 },
  { id: "D", frets: [-1, -1, 0, 2, 3, 2], rootString: 2, rootFret: 0 },
];

/**
 * 求某个根音在五个形状下的按法。
 *
 * @param rootPc 根音的音高类（0 = C）。
 */
export function cagedShapes(rootPc: number): CagedShape[] {
  return SHAPES.map((shape) => {
    const openPc = OPEN_PCS[shape.rootString];
    // 根音在这个形状的锚点弦上，应该落在第几品
    const rootFret = ((rootPc - openPc) % 12 + 12) % 12;
    const shift = rootFret - shape.rootFret;

    const frets = shape.frets.map((fret) => (fret < 0 ? -1 : fret + shift));
    const played = frets.filter((fret) => fret >= 0);
    const lowest = Math.min(...played);
    const highest = Math.max(...played);

    const rootStrings: number[] = [];
    frets.forEach((fret, index) => {
      if (fret >= 0 && (OPEN_PCS[index] + fret) % 12 === rootPc) rootStrings.push(index);
    });

    return {
      id: shape.id,
      name: `${shape.id} 形`,
      shift,
      frets,
      span: [lowest, highest],
      rootStrings,
      baseFret: shift,
    };
  });
}

/** 五个形状里，哪个把位最低（用来在指板上标"最靠近琴枕"的那个）。 */
export function lowestShape(shapes: CagedShape[]): CagedShape {
  return shapes.reduce((best, shape) => (shape.span[0] < best.span[0] ? shape : best), shapes[0]);
}
