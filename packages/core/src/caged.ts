/**
 * CAGED 五把位。
 *
 * 同一个和弦，吉他上有几种"形状"，来自几个开放和弦：C、A、G、E、D。
 * 把开放形状整块沿琴颈平移，空弦处变成横按，就得到同一个和弦在其他把位的按法。
 *
 * 两条实现要点：
 * 1. 每个形状只有一个**根音锚点**（第几根弦、开放时在第几品），平移量 = 目标根音品味 − 锚点品味；
 * 2. 平移量归一化到 0–11。`A` 和弦的 `C 形` 算出来是 −3，加 12 变成 9，
 *    否则会出现负品、图也被画歪。
 *
 * 小和弦只给 **E / A / D** 三个形状：
 * 大三音在 C 形、G 形里各出现两次（C 形有 4 弦 2 品和 1 弦空弦），降一个还是大三和弦；
 * 教材里 Cm、Gm 用的本来就是 A 形 / E 形的横按，所以这里不硬凑五个。
 */

export type CagedId = "C" | "A" | "G" | "E" | "D";
export type CagedQuality = "major" | "minor";

export interface CagedShape {
  id: CagedId;
  /** 形状名，如「E 形」。 */
  name: string;
  /** 平移量：向高把位移动几品（0 表示就是开放形状）。 */
  shift: number;
  /** 平移后的按法；索引 0 = 6 弦，-1 表示不弹。 */
  frets: number[];
  /** 覆盖的品位区间（含边界）。 */
  span: [number, number];
  /** 根音落在哪几根弦上（索引 0 = 6 弦）。 */
  rootStrings: number[];
  /** 横按所在的品（0 表示有开放弦可用）。 */
  baseFret: number;
}

/** 六个索引（0 = 6 弦）对应的空弦音高类。 */
const OPEN_PCS = [4, 9, 2, 7, 11, 4];

interface ShapeDef {
  id: CagedId;
  frets: number[];
  rootString: number;
  rootFret: number;
}

/** 五个大三开放形状。 */
const MAJOR_SHAPES: ShapeDef[] = [
  { id: "C", frets: [-1, 3, 2, 0, 1, 0], rootString: 1, rootFret: 3 },
  { id: "A", frets: [-1, 0, 2, 2, 2, 0], rootString: 1, rootFret: 0 },
  { id: "G", frets: [3, 2, 0, 0, 0, 3], rootString: 0, rootFret: 3 },
  { id: "E", frets: [0, 2, 2, 1, 0, 0], rootString: 0, rootFret: 0 },
  { id: "D", frets: [-1, -1, 0, 2, 3, 2], rootString: 2, rootFret: 0 },
];

/** 小和弦只用这三个形状（大三音唯一，能安全降 1 品）。 */
const MINOR_IDS: CagedId[] = ["E", "A", "D"];

/**
 * 求某个根音在五个形状下的按法。
 *
 * @param rootPc 根音的音高类（0 = C）。
 * @param quality 大三还是小三（默认大三）。
 */
export function cagedShapes(rootPc: number, quality: CagedQuality = "major"): CagedShape[] {
  const minor = quality === "minor";
  // 大三形状里先找到"大三音"（root + 4），把它降 1 品就得到小三音
  const majorThirdPc = (rootPc + 4) % 12;
  const pool = minor ? MAJOR_SHAPES.filter((shape) => MINOR_IDS.includes(shape.id)) : MAJOR_SHAPES;

  return pool.map((shape) => {
    const openPc = OPEN_PCS[shape.rootString];
    const rootFret = ((rootPc - openPc) % 12 + 12) % 12;
    let shift = ((rootFret - shape.rootFret) % 12 + 12) % 12;

    // 小三：找到大三音所在的弦，降 1 品；若它落在空弦（0 品），整体抬高八度再降
    let lowered: number[] = [];
    if (minor) {
      const thirdStrings: number[] = [];
      shape.frets.forEach((fret, index) => {
        if (fret < 0) return;
        if ((OPEN_PCS[index] + fret + shift) % 12 === majorThirdPc) thirdStrings.push(index);
      });
      if (thirdStrings.some((index) => shape.frets[index] + shift === 0)) shift += 12;
      lowered = thirdStrings;
    }

    const frets = shape.frets.map((fret, index) => {
      if (fret < 0) return -1;
      const raised = fret + shift;
      return lowered.includes(index) ? raised - 1 : raised;
    });

    const played = frets.filter((fret) => fret >= 0);
    const lowest = played.length > 0 ? Math.min(...played) : 0;
    const highest = played.length > 0 ? Math.max(...played) : 0;

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

/** 形状里把位最低的那个。 */
export function lowestShape(shapes: CagedShape[]): CagedShape {
  return shapes.reduce((best, shape) => (shape.span[0] < best.span[0] ? shape : best), shapes[0]);
}
