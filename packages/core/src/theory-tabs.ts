import { progressionTab, sequence, tabOf, n, type Tab } from "./tab.ts";

/**
 * 乐理页 12 节课，每节配一条示范谱。
 *
 * 这些谱不是练习，是「把这一节说的话在指板上指给你看」：
 * 一条谱 1–2 小节，能在卡片里一眼看完。
 */
export interface TheoryTab {
  /** `th-01` … `th-12`，和课的编号对齐，也是谱图文件名。 */
  id: string;
  no: number;
  /** 谱下面那行说明。 */
  caption: string;
  tab: Tab;
}

const scale = (positions: [number, number][], step = 0.5) =>
  sequence(
    positions.map(([s, f]) => ({ s, f })),
    { step },
  );

export const THEORY_TABS: TheoryTab[] = [
  {
    id: "th-01",
    no: 1,
    caption: "同一个八度里的 12 个音：6 弦从空弦一路按到 12 品",
    tab: scale(
      Array.from({ length: 13 }, (_, index) => [6, index] as [number, number]),
      0.25,
    ),
  },
  {
    id: "th-02",
    no: 2,
    caption: "半音是一品、全音是两品：E–F 半音，F–G 全音",
    tab: scale([
      [6, 0],
      [6, 1],
      [6, 3],
    ]),
  },
  {
    id: "th-03",
    no: 3,
    caption: "12 品就是高八度：6 弦空弦和 6 弦 12 品是同一个音名",
    tab: tabOf([n(6, 0, 0, 2), n(6, 12, 2, 2)], { beatsPerBar: 4, bars: 1 }),
  },
  {
    id: "th-04",
    no: 4,
    caption: "大三度（C–E）和小三度（C–Eb）只差一品，情绪完全不同",
    tab: tabOf(
      [
        n(5, 3, 0, 1),
        n(4, 2, 1, 1),
        n(5, 3, 2, 1),
        n(4, 1, 3, 1),
      ],
      { beatsPerBar: 4, bars: 1 },
    ),
  },
  {
    id: "th-05",
    no: 5,
    caption: "C 大调音阶（第一把位）：C D E F G A B C",
    tab: scale([
      [5, 3],
      [4, 0],
      [4, 2],
      [4, 3],
      [3, 0],
      [3, 2],
      [2, 0],
      [2, 1],
    ]),
  },
  {
    id: "th-06",
    no: 6,
    caption: "A 自然小调：和 C 大调同一批音，只是从 A 开始",
    tab: scale([
      [5, 0],
      [5, 2],
      [5, 3],
      [4, 0],
      [4, 2],
      [4, 3],
      [3, 0],
      [3, 2],
    ]),
  },
  {
    id: "th-07",
    no: 7,
    caption: "C 大调五声音阶：去掉 4 度和 7 度，怎么弹都不难听",
    tab: scale([
      [5, 3],
      [4, 0],
      [4, 2],
      [3, 0],
      [3, 2],
      [2, 1],
    ]),
  },
  {
    id: "th-08",
    no: 8,
    caption: "C 大三和弦：根音 + 大三度 + 纯五度，一个八度分解",
    tab: tabOf([n(5, 3, 0, 1), n(4, 2, 1, 1), n(3, 0, 2, 1), n(2, 1, 3, 1)], {
      beatsPerBar: 4,
      bars: 1,
    }),
  },
  {
    id: "th-09",
    no: 9,
    caption: "Cmaj7：在三和弦上面再加一个大七度（B），声音立刻「爵士」",
    tab: tabOf([n(5, 3, 0, 1), n(4, 2, 1, 1), n(3, 0, 2, 1), n(2, 0, 3, 1)], {
      beatsPerBar: 4,
      bars: 1,
    }),
  },
  {
    id: "th-10",
    no: 10,
    caption: "五度关系：C 走到 G（属和弦），再回 C 就是「解决」",
    tab: progressionTab({ names: ["C", "G"], beatsEach: 4, step: 1 }),
  },
  {
    id: "th-11",
    no: 11,
    caption: "同一个 C 和弦的高把位按法（8 品附近），指型来自 E 型横按",
    tab: tabOf(
      [n(6, 8, 0, 1), n(4, 10, 1, 1), n(3, 9, 2, 1), n(2, 8, 3, 1)],
      { beatsPerBar: 4, bars: 1 },
    ),
  },
  {
    id: "th-12",
    no: 12,
    caption: "时值：一拍一个、一拍两个、一拍四个，最后一拍空着",
    tab: tabOf(
      [
        n(5, 3, 0, 1),
        n(5, 3, 1, 0.5),
        n(5, 3, 1.5, 0.5),
        n(5, 3, 2, 0.25),
        n(5, 3, 2.25, 0.25),
        n(5, 3, 2.5, 0.25),
        n(5, 3, 2.75, 0.25),
      ],
      { beatsPerBar: 4, bars: 1 },
    ),
  },
];

export function theoryTabOf(no: number): TheoryTab | undefined {
  return THEORY_TABS.find((item) => item.no === no);
}
