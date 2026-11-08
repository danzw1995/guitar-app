/**
 * 六线谱排版的静态检查。
 *
 * 排版错了在浏览器里一眼能看出来，但没法在 CI 里"看"——所以把能算的都算一遍：
 * 数字有没有叠在一起、有没有跑出画布、弦线有没有超出最后一根小节线、
 * 和第一个音有没有贴着起始小节线。
 *
 *   node apps/web/scripts/check-tab.ts
 */
import { DRILLS } from "../../../packages/core/src/practice.ts";
import {
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_LIBRARY,
} from "../../../packages/core/src/rhythm-drills.ts";
import { READING_DRILLS } from "../../../packages/core/src/reading-drills.ts";
import { STRUM_DRILLS } from "../../../packages/core/src/strum-drills.ts";
import { layoutTab } from "../src/lib/tab-layout.ts";

/** 五处内容（综合练习、节奏专项、朗读练习、扫弦练习、风格片段）用同一套排版检查。 */
const ALL: { id: string; tab: Parameters<typeof layoutTab>[0] }[] = [
  ...DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab })),
  ...RHYTHM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab })),
  ...READING_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab })),
  ...STRUM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab })),
  ...STRUM_LIBRARY.map((item) => ({ id: item.id, tab: item.tab })),
  ...SONG_SNIPPETS.map((item) => ({ id: item.id, tab: item.tab })),
];

let failed = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (error) {
    failed++;
    console.log(`✖ ${label}\n    ${(error as Error).message}`);
  }
};

check("每条练习都能排出非空谱面", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    if (scene.width < 120) throw new Error(`${drill.id} 太窄：${scene.width}`);
    if (scene.els.length < 12) throw new Error(`${drill.id} 元素太少：${scene.els.length}`);
    if (!scene.ariaLabel.includes("六线谱")) throw new Error(`${drill.id} 缺少读屏描述`);
  }
});

check("品数字不会叠在一起（同一行最小间距 ≥ 13px）", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    const frets = scene.els.filter((el) => el.t === "text" && el.cls === "tab-fret");
    for (let i = 0; i < frets.length; i++) {
      for (let j = i + 1; j < frets.length; j++) {
        const a = frets[i] as { x: number; y: number; text: string };
        const b = frets[j] as { x: number; y: number; text: string };
        if (Math.abs(a.y - b.y) > 2) continue;
        const dx = Math.abs(a.x - b.x);
        if (dx > 0.1 && dx < 13) {
          throw new Error(`${drill.id}: "${a.text}" 与 "${b.text}" 只隔 ${dx.toFixed(1)}px`);
        }
      }
    }
  }
});

check("所有元素都在画布内", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    for (const el of scene.els) {
      if (el.t === "text" && (el.x < 0 || el.x > scene.width || el.y < 0 || el.y > scene.height)) {
        throw new Error(`${drill.id}: "${el.text}" 跑到画布外 (${el.x}, ${el.y})`);
      }
    }
  }
});

check("弦线止于小节线，右端不留毛边（多行谱逐行检查）", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    const lines = scene.els.filter((el) => el.t === "line" && el.cls === "tab-string");
    const bars = scene.els.filter((el) => el.t === "line" && el.cls === "tab-bar");
    // 朗读谱每行只有一条线，六线谱每行六条
    const perSystem = drill.tab.display === "rhythm" ? 1 : 6;
    if (lines.length % perSystem !== 0) {
      throw new Error(`${drill.id}: 弦线数量 ${lines.length} 不是 ${perSystem} 的倍数`);
    }
    const barXs = new Set(bars.map((bar) => Math.round((bar as { x1: number }).x1)));
    for (const line of lines) {
      const x2 = (line as { x2: number }).x2;
      if (!barXs.has(Math.round(x2))) {
        throw new Error(`${drill.id}: 弦线画到 ${x2}，那里没有小节线`);
      }
    }
  }
});

check("换行而不是横向滚动：一行不超过 480px", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    if (scene.width > 480) {
      throw new Error(`${drill.id}: 谱面宽 ${scene.width}，应该换行而不是横滚`);
    }
  }
});

check("第一个音不会贴着起始小节线", () => {
  for (const drill of ALL) {
    const scene = layoutTab(drill.tab);
    const first = scene.els.find((el) => el.t === "text" && el.cls === "tab-fret");
    const bars = scene.els.filter((el) => el.t === "line" && el.cls === "tab-bar");
    if (!first || bars.length === 0) continue;
    const start = Math.min(...bars.map((bar) => (bar as { x1: number }).x1));
    const gap = (first as { x: number }).x - start;
    if (gap < 10) throw new Error(`${drill.id}: 第一个音离起始小节线只有 ${gap.toFixed(1)}px`);
  }
});

check("十六分音符的间距比四分音符大（看得出快慢）", () => {
  const quarter = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [{ s: 6, f: 0, beat: 0, dur: 1 }],
  });
  const sixteenth = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: Array.from({ length: 16 }, (_, i) => ({
      s: 6,
      f: i % 4,
      beat: i / 4,
      dur: 0.25,
    })),
  });
  if (sixteenth.width <= quarter.width) {
    throw new Error(`十六分谱宽 ${sixteenth.width} 不应小于四分谱宽 ${quarter.width}`);
  }
});

check("时值画在音自己身上：符干、符梁、符尾对得上", () => {
  const count = (scene: ReturnType<typeof layoutTab>, cls: string) =>
    scene.els.filter((el) => el.cls === cls).length;

  const quarter = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 1 },
      { s: 5, f: 3, beat: 1, dur: 1 },
    ],
  });
  if (count(quarter, "tab-stem") !== 2) throw new Error("四分音符应有 2 根符干");
  if (count(quarter, "tab-beam") !== 0) throw new Error("四分音符不该有符梁");
  if (count(quarter, "tab-rhythm-line") !== 0) {
    throw new Error("不应该再有单独的「节奏轨」（会被看成第七根弦）");
  }

  const eighths = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 0.5 },
      { s: 5, f: 5, beat: 0.5, dur: 0.5 },
      { s: 5, f: 3, beat: 1, dur: 0.5 },
      { s: 5, f: 5, beat: 1.5, dur: 0.5 },
    ],
  });
  if (count(eighths, "tab-beam") < 2) throw new Error("八分音符应该两两连符梁");

  const sixteenths = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: Array.from({ length: 4 }, (_, i) => ({ s: 6, f: i, beat: i / 4, dur: 0.25 })),
  });
  if (count(sixteenths, "tab-beam") < 2) throw new Error("十六分音符应该有两条符梁");

  // 前八后十六：第二条符梁只该盖住后两个十六分，不能从八分那儿开始——
  // 否则「前八后十六」看起来和「四个十六分」一模一样，练习就没意义了。
  const dotted = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 0.5 },
      { s: 5, f: 3, beat: 0.5, dur: 0.25 },
      { s: 5, f: 3, beat: 0.75, dur: 0.25 },
    ],
  });
  const beamLines = dotted.els.filter((el) => el.cls === "tab-beam" && el.t === "line");
  if (beamLines.length < 2) throw new Error("前八后十六应该有主、次两条符梁");
  const xs = dotted.els.filter((el) => el.cls === "tab-fret").map((el) => el.x);
  const ys = [...new Set(beamLines.map((el) => el.y1))].sort((a, b) => a - b);
  const secondary = beamLines.filter((el) => el.y1 === ys[ys.length - 1]);
  for (const beam of secondary) {
    if (beam.x1 < xs[1] - 0.5) {
      throw new Error("次级符梁从八分那儿就开始了，八分和十六分会看起来一样");
    }
  }

  // 附点：旋律里写了附点，谱上就得有那个点，否则「长—短」看不出来
  const dotDrill = READING_DRILLS.find((drill) => drill.id === "rd-09")!;
  const dotScene = layoutTab(dotDrill.tab);
  const dots = dotScene.els.filter((el) => el.cls === "tab-dot");
  if (dots.length !== 8) {
    throw new Error(`附点节奏型应该有 8 个附点（两小节 × 4 拍），读到 ${dots.length}`);
  }

  // 休止：空出来的地方要画休止符，否则看着像漏了音
  const restDrill = READING_DRILLS.find((drill) => drill.id === "rd-08")!;
  const restScene = layoutTab(restDrill.tab);
  const restEls = restScene.els.filter((el) => el.cls === "tab-rest");
  if (restEls.length === 0) throw new Error("八分+休止那条没有画出休止符");
  if (!restScene.ariaLabel.includes("休止")) {
    throw new Error("读屏描述里没有提休止");
  }
  // 休止要落在空出来的那半拍上：第 3 拍前半（beat 2.0–2.5）
  const fretXs = restScene.els
    .filter((el) => el.cls.startsWith("tab-fret"))
    .map((el) => el.x);
  const restBoxes = restEls
    .map((el) => (el.t === "rect" ? [el.x, el.x + el.width] : el.t === "circle" ? [el.cx, el.cx] : null))
    .filter((box): box is number[] => box !== null);
  const emptyHalf = restBoxes.some(([a, b]) => a > Math.min(...fretXs) && b < Math.max(...fretXs));
  if (!emptyHalf) throw new Error("休止符没落在音符之间的空档上");

  // 全是音符的谱子不该冒出休止符
  const solid = READING_DRILLS.find((drill) => drill.id === "rd-03")!;
  if (layoutTab(solid.tab).els.some((el) => el.cls === "tab-rest")) {
    throw new Error("没有空拍的练习却画了休止符");
  }
  const lone = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 0.5 },
      { s: 5, f: 5, beat: 2, dur: 1 },
    ],
  });
  if (count(lone, "tab-flag") < 1) throw new Error("独立的八分音符缺少符尾");

  // 休止符要按标准形状分档：四分是折线，二分是坐在线上的块，全休止是挂在线上方的块
  const restOf = (notes: { s: number; f: number; beat: number; dur: number }[]) =>
    layoutTab({ beatsPerBar: 4, bars: 1, notes }).els.filter((el) => el.cls === "tab-rest");
  const quarterRest = restOf([
    { s: 5, f: 3, beat: 0, dur: 1 },
    { s: 5, f: 3, beat: 2, dur: 1 },
  ]);
  if (!quarterRest.some((el) => el.t === "path")) {
    throw new Error("一拍休止应该是折线的四分休止符，不该画成方块");
  }
  const halfRest = restOf([
    { s: 5, f: 3, beat: 0, dur: 1 },
    { s: 5, f: 3, beat: 3, dur: 1 },
  ]);
  if (!halfRest.some((el) => el.t === "rect")) throw new Error("两拍休止应该是二分休止符（方块）");
  const wholeRest = restOf([{ s: 5, f: 3, beat: 0, dur: 1 }]);
  if (!wholeRest.some((el) => el.t === "rect")) throw new Error("整小节休止应该是全休止符");

  // 三连音：0.333 的拍位会算出 0.001 的空档，那不是休止；另外要让「3」出现在符梁下面
  const tripletScene = layoutTab(READING_DRILLS.find((drill) => drill.id === "rd-14")!.tab);
  if (tripletScene.els.some((el) => el.cls === "tab-rest")) {
    throw new Error("三连音里没有空拍，不该冒出休止符（多半是拍位取整的误差）");
  }
  if (
    !tripletScene.els.some((el) => el.cls === "tab-tuplet" && el.t === "text" && el.text === "3")
  ) {
    throw new Error("三连音缺少「3」的标记");
  }

  // 八分三连音：一条符梁（不能因为 0.333 拍被当成十六分而画成两条）
  const eighthTrip = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [0, 1 / 3, 2 / 3].map((beat) => ({ s: 5, f: 3, beat, dur: 1 / 3 })),
  });
  const eighthBeams = eighthTrip.els.filter((el) => el.cls === "tab-beam");
  if (eighthBeams.length !== 1) {
    throw new Error(`八分三连音应该只有一条符梁，实际 ${eighthBeams.length} 条（被当成十六分了）`);
  }

  // 四分三连音：不连梁，用括号标「3」
  const quarterTrip = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [0, 2 / 3, 4 / 3].map((beat) => ({ s: 5, f: 3, beat, dur: 2 / 3 })),
  });
  if (quarterTrip.els.some((el) => el.cls === "tab-beam")) {
    throw new Error("四分音符不连梁，四分三连音不该出现符梁");
  }
  if (!quarterTrip.els.some((el) => el.cls === "tab-tuplet-bracket")) {
    throw new Error("四分三连音缺少连音括号");
  }

  // 全音符：没有符干（二分音符有，符干长度固定）
  const whole = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [{ s: 3, f: 7, beat: 0, dur: 4 }],
  });
  if (count(whole, "tab-stem") !== 0) throw new Error("全音符不该有符干");
  const half = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [{ s: 3, f: 7, beat: 0, dur: 2 }],
  });
  const halfStem = half.els.find((el) => el.cls === "tab-stem");
  if (!halfStem) throw new Error("二分音符应该有符干");
  if (halfStem.t === "line" && halfStem.y2 - halfStem.y1 < 20) {
    throw new Error("符干太短了，标准记法里符干是一个固定长度");
  }
});

check("长谱换行：多行谱的弦线在每一行都重新开始", () => {
  const long = layoutTab({
    beatsPerBar: 4,
    bars: 8,
    notes: Array.from({ length: 32 }, (_, i) => ({ s: 5, f: 3, beat: i / 2, dur: 0.5 })),
  });
  const lines = long.els.filter((el) => el.t === "line" && el.cls === "tab-string");
  if (lines.length <= 6) throw new Error("8 小节的谱应该折成多行");
  const bars = long.els.filter((el) => el.t === "line" && el.cls === "tab-bar");
  if (bars.length <= 9) throw new Error("每行都要有自己的小节线");
});

if (failed > 0) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\n六线谱排版检查通过");
