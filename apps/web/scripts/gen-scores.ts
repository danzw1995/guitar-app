// 把应用里所有要展示的六线谱预渲染成 PNG，放进 apps/web/public/scores/。
//
// 为什么要预渲染：alphaTab 在浏览器里跑一份要 ~300KB，还要养一个 Web Worker 级别的实例，
// 卡片的谱面其实一辈子不变。改成一个命令生成静态图片，前端就只剩 <img>。
//
// 用法：pnpm --filter @guitar/web run gen:scores
import fs from "node:fs";
import path from "node:path";
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

const WIDTH = 600; // 卡片里谱面的实际宽度约 480 CSS px；留点余量，十六分密集型也不会被压缩
const seen = new Set<string>();
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
    // 每拍之间那条细虚线：卡片上要能对着数拍子
    beatLines: true,
    beatLineColor: "#8b949e",
    beatLineAlpha: 0.32,
  });
  fs.writeFileSync(path.join(outDir, `${item.id}.png`), png.data);
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

console.log(`生成 ${items.length} 张谱面 → ${path.relative(process.cwd(), outDir)}（${(bytes / 1024 / 1024).toFixed(2)} MB）`);
