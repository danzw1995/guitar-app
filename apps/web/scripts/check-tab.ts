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
import { layoutTab } from "../src/lib/tab-layout.ts";

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
  for (const drill of DRILLS) {
    const scene = layoutTab(drill.tab);
    if (scene.width < 120) throw new Error(`${drill.id} 太窄：${scene.width}`);
    if (scene.els.length < 12) throw new Error(`${drill.id} 元素太少：${scene.els.length}`);
    if (!scene.ariaLabel.includes("六线谱")) throw new Error(`${drill.id} 缺少读屏描述`);
  }
});

check("品数字不会叠在一起（同一行最小间距 ≥ 13px）", () => {
  for (const drill of DRILLS) {
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
  for (const drill of DRILLS) {
    const scene = layoutTab(drill.tab);
    for (const el of scene.els) {
      if (el.t === "text" && (el.x < 0 || el.x > scene.width || el.y < 0 || el.y > scene.height)) {
        throw new Error(`${drill.id}: "${el.text}" 跑到画布外 (${el.x}, ${el.y})`);
      }
    }
  }
});

check("弦线止于最后一根小节线，右端不留毛边", () => {
  for (const drill of DRILLS) {
    const scene = layoutTab(drill.tab);
    const lines = scene.els.filter((el) => el.t === "line" && el.cls === "tab-string");
    const bars = scene.els.filter((el) => el.t === "line" && el.cls === "tab-bar");
    if (lines.length !== 6) throw new Error(`${drill.id}: 应该有 6 条弦线，实际 ${lines.length}`);
    const lastBar = Math.max(...bars.map((bar) => (bar as { x1: number }).x1));
    for (const line of lines) {
      const x2 = (line as { x2: number }).x2;
      if (Math.abs(x2 - lastBar) > 0.5) {
        throw new Error(`${drill.id}: 弦线画到 ${x2}，最后一根小节线在 ${lastBar}`);
      }
    }
  }
});

check("第一个音不会贴着起始小节线", () => {
  for (const drill of DRILLS) {
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

check("有节奏轨：符头、符干、符梁对得上时值", () => {
  const quarter = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 1 },
      { s: 5, f: 3, beat: 1, dur: 1 },
    ],
  });
  const count = (scene: typeof quarter, cls: string) =>
    scene.els.filter((el) => el.cls === cls).length;
  if (count(quarter, "tab-rhythm-line") !== 1) throw new Error("缺少节奏轨横线");
  if (count(quarter, "tab-notehead") !== 2) throw new Error("四分音符应有 2 个符头");
  if (count(quarter, "tab-beam") !== 0) throw new Error("四分音符不该有符梁");

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

  // 单个八分（不在任何符梁组里）要有符尾，否则和四分音符长得一样
  const lone = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [
      { s: 5, f: 3, beat: 0, dur: 0.5 },
      { s: 5, f: 5, beat: 2, dur: 1 },
    ],
  });
  if (count(lone, "tab-flag") < 1) throw new Error("独立的八分音符缺少符尾");

  // 二分音符：空心符头，不带符干
  const half = layoutTab({
    beatsPerBar: 4,
    bars: 1,
    notes: [{ s: 3, f: 7, beat: 0, dur: 2 }],
  });
  if (count(half, "tab-notehead open") !== 1) throw new Error("二分音符应是空心符头");
  if (count(half, "tab-stem") !== 0) throw new Error("二分音符不该有符干");
});

if (failed > 0) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\n六线谱排版检查通过");
