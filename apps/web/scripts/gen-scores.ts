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
  READING_DRILLS,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
  tabToAlphaTex,
  type Tab,
} from "@guitar/core";
import { renderPng } from "@danzw/tab-score";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/scores");

/** 每条谱：id 就是文件名，bpm 影响不到图形（谱面不画速度），只取 tab。 */
type Item = { id: string; tab: Tab; bpm?: number };

const items: Item[] = [
  ...READING_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm[0] })),
  ...RHYTHM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm[0] })),
  ...STRUM_DRILLS.map((drill) => ({ id: drill.id, tab: drill.tab, bpm: drill.bpm })),
  ...STRUM_LIBRARY.map((pattern) => ({ id: pattern.id, tab: pattern.tab, bpm: 70 })),
  ...SONG_SNIPPETS.map((snippet) => ({ id: snippet.id, tab: snippet.tab, bpm: snippet.bpm[0] })),
];

const WIDTH = 720;
// 卡片里谱面的实际宽度约 500 CSS px。用 720 排版再缩下来，字不会跟着变小，
// 但留白变多、看起来更细腻（600 那档显得挤，480 会把两小节挤成两行）。
// 下面的 engraving 是「别太粗」的关键：alphaTab 的默认值是给整页五线谱的，
// TAB 谱号 36 号字、符梁 4.5 厚，缩到卡片上就糊成一块。
const seen = new Set<string>();
const hash = createHash("sha1");
let bytes = 0;

fs.mkdirSync(outDir, { recursive: true });

for (const item of items) {
  if (seen.has(item.id)) {
    throw new Error(`重复的谱面 id：${item.id}`);
  }
  seen.add(item.id);
  const tex = tabToAlphaTex(item.tab, item.bpm ? { bpm: item.bpm } : {});
  const png = await renderPng(tex, {
    width: WIDTH,
    scale: 1,
    pixelRatio: 2,
    theme: "dark",
    transparent: true,
    title: false,
    engraving: {
      musicFontSize: 32, // TAB 谱号（默认 36，缩到卡片里太大）
      beamThickness: 2.8, // 符梁（八分/十六分下面那几条横线，默认 4.5 太粗）
      stemThickness: 0.8, // 符干（默认 1.08）
    },
    // 每拍之间那条细虚线：卡片上要能对着数拍子
    beatLines: true,
    beatLineColor: "#8b949e",
    beatLineAlpha: 0.32,
  });
  fs.writeFileSync(path.join(outDir, `${item.id}.png`), png.data);
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
