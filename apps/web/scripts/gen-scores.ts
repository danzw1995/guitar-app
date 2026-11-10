// 把应用里所有要展示的六线谱预渲染成 PNG，放进 apps/web/public/scores/。
//
// 为什么要预渲染：alphaTab 在浏览器里跑一份要 ~300KB，还要养一个 Web Worker 级别的实例，
// 卡片的谱面其实一辈子不变。改成一个命令生成静态图片，前端就只剩 <img>。
//
// 用法：pnpm --filter @guitar/web run gen:scores
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ACCOMPANIMENTS,
  DRILLS,
  READING_DRILLS,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
  tabToAlphaTex,
  type Tab,
} from "@guitar/core";
import { renderPng } from "@danzw777/tab-score";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/scores");

/** 每条谱：id 就是文件名，bpm 影响不到图形（谱面不画速度），只取 tab。 */
type Item = { id: string; tab: Tab; bpm?: number };

/** 练习页的速度写成「50–70」这种区间，谱面只关心个位数，取第一个数字。 */
function bpmOf(value: string): number {
  const found = /(\d+)/.exec(value);
  return found ? Number(found[1]) : 80;
}

const items: Item[] = [
  ...READING_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm[0] })),
  ...RHYTHM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm[0] })),
  ...STRUM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm })),
  ...STRUM_LIBRARY.map((pattern) => ({ id: pattern.id, tab: pattern.tab, bpm: 70 })),
  ...SONG_SNIPPETS.map((snippet) => ({ id: snippet.id, tab: snippet.tab, bpm: snippet.bpm[0] })),
  ...ACCOMPANIMENTS.map((item) => ({ id: item.id, tab: item.tab, bpm: item.bpm })),
  // 练习页的 50 关：以前是页面里现画的六线谱，现在也走同一条预渲染管线。
  ...DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: bpmOf(drill.bpm) })),
];

const WIDTH = 720;
// 卡片里谱面的实际宽度约 500 CSS px。用 720 排版再缩下来，字不会跟着变小，
// 但留白变多、看起来更细腻（600 那档显得挤，480 会把两小节挤成两行）。
// 下面的 engraving 是「别太粗」的关键：alphaTab 的默认值是给整页五线谱的，
// TAB 谱号 36 号字、符梁 4.5 厚，缩到卡片上就糊成一块。
const seen = new Set<string>();
const hash = createHash("sha1");
let bytes = 0;

/** 每条谱每一拍的横向区间（图片像素），播放时用来高亮当前拍。 */
const beats: Record<string, { width: number; beats: { x: number; w: number }[] }> = {};

fs.mkdirSync(outDir, { recursive: true });

for (const item of items) {
  if (seen.has(item.id)) {
    throw new Error(`重复的谱面 id：${item.id}`);
  }
  seen.add(item.id);
  const tex = tabToAlphaTex(item.tab, item.bpm ? { bpm: item.bpm } : {});
  // 五小节的伴奏型：一行排五小节会挤到看不清品数（720 宽时字只缩到 10px 左右），
  // 改成 520 宽排成两行（3+2），品数在卡片里约 17px，和别的块一致。
  const wide = item.tab.bars >= 5;
  const png = await renderPng(tex, {
    width: wide ? 520 : WIDTH,
    scale: 1,
    pixelRatio: 2,
    theme: "dark",
    transparent: true,
    title: false,
    // 品数字号 + 弦距：默认 14/13 时字几乎顶到上下两条弦，读起来挤；
    // 15/18 的比例（≈0.85）和纸质六线谱接近。
    tabFontSize: wide ? 17 : 15,
    // 谱面裁掉空白后，窄一些的谱（两小节 2/4）会被卡片拉大，
    // 补到 420 逻辑像素，68 张图在页面里的字号就基本一致了。
    minWidth: wide ? 380 : 420,
    engraving: {
      // TAB 谱号的大小（默认 36，缩到卡片里太大）。它同时决定「谱号占多宽」，
      // 太小时第一拍的品数会压到谱号上——五小节的伴奏型品数更大，所以给到 32。
      musicFontSize: wide ? 32 : 26,
      beamThickness: 2.6, // 符梁（八分/十六分下面那几条横线，默认 4.5 太粗）
      stemThickness: 0.8, // 符干（默认 1.08）
      tabLineSpacing: wide ? 19 : 18, // 六条弦的间距（默认 13）
      preNoteEffectPadding: 6, // 扫弦箭头已经挪到谱面下方，不用再留大缝
    },
    // 每拍之间那条细虚线：卡片上要能对着数拍子
    beatLines: true,
    beatLineColor: "#8b949e",
    beatLineAlpha: 0.32,
  });
  fs.writeFileSync(path.join(outDir, `${item.id}.png`), png.data);
  // 拍数必须和谱面对得上：竖条的位置是按「第几拍」取的，多一拍少一拍都会画错地方。
  const expected = item.tab.bars * item.tab.beatsPerBar;
  if (png.beats.length !== expected) {
    throw new Error(`${item.id} 的拍数是 ${png.beats.length}，谱面应该是 ${expected} 拍`);
  }
  beats[item.id] = { width: png.width, beats: png.beats ?? [] };
  hash.update(item.id).update(png.data);
  bytes += png.data.length;
}

// 顺手清掉已经不在列表里的旧图，避免改名后留下孤儿文件
for (const file of fs.readdirSync(outDir)) {
  if (!file.endsWith(".png")) continue;
  const id = file.slice(0, -4);
  if (!seen.has(id)) {
    fs.rmSync(path.join(outDir, file));
    console.log(`清理：${file}`);
  }
}

// 每拍的横向区间单独存一份：网页里播放时按它画一条跟着走的竖条。
// 和图片一起带内容指纹（同一个 ?v=），改了谱面数据两边会一起更新。
fs.writeFileSync(
  path.join(outDir, "beats.json"),
  `${JSON.stringify({ version: hash.copy().digest("hex").slice(0, 8), beats })}\n`,
);

// 内容指纹写进源码：`TabScore` 用它给图片地址加 `?v=`，否则重新生成后
// 浏览器会一直拿缓存里的旧图（文件名没变）。
const version = hash.digest("hex").slice(0, 8);
const versionFile = path.resolve(here, "../src/lib/scores-version.ts");
fs.writeFileSync(
  versionFile,
  `// 由 \`pnpm --filter @guitar/web run gen:scores\` 生成，不要手改。\n` +
    `// 谱面图片的内容指纹：图片地址带上它，重新生成后浏览器才会重新下载。\n` +
    `export const SCORES_VERSION = "${version}";\n`,
);

console.log(`生成 ${items.length} 张谱面 → ${path.relative(process.cwd(), outDir)}（${(bytes / 1024 / 1024).toFixed(2)} MB）`);
console.log(`内容指纹：${version}（写入 src/lib/scores-version.ts）`);
