// 冒烟测试：不比对像素，只确认「能出图、尺寸合理、JSON 输入转得对」。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { renderPng, renderSvg } from "../src/render.mjs";
import { specToAlphaTex } from "../src/spec.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tex = fs.readFileSync(`${root}samples/demo.tex`, "utf8");

test("alphaTex 渲染成 PNG：有内容、尺寸是 2 倍图", async () => {
  const png = await renderPng(tex, { width: 720, theme: "dark" });
  assert.ok(png.data.length > 5_000, `PNG 太小：${png.data.length} 字节`);
  assert.equal(png.width % 2, 0, "pixelRatio 2 时宽度应为偶数");
  assert.ok(png.width >= 1400, `宽度不对：${png.width}`);
  assert.ok(png.height >= 200, `高度不对：${png.height}`);
});

test("alphaTex 渲染成 SVG：单个文件、带嵌套谱面", async () => {
  const svg = await renderSvg(tex, { width: 720, theme: "light", embedFont: false });
  assert.ok(svg.startsWith("<svg"), "SVG 开头不对");
  assert.ok(svg.includes("@font-face") === false, "没要求内嵌字体却内嵌了");
  assert.ok((svg.match(/<svg /g) ?? []).length >= 2, "缺谱面块");
  assert.ok(svg.length > 3_000, `SVG 太小：${svg.length} 字节`);
});

test("每拍分割线：SVG 里每条拍子之间都有 beat-line，PNG 也会变胖", async () => {
  const plain = await renderSvg(tex, { width: 720, theme: "light", embedFont: false });
  const lined = await renderSvg(tex, {
    width: 720,
    theme: "light",
    embedFont: false,
    beatLines: true,
  });
  const lines = (lined.match(/class="beat-line"/g) ?? []).length;
  assert.ok(lines >= 4, `拍线太少：${lines}`);
  assert.ok(lined.length > plain.length, "加了拍线 SVG 应该更大");
  // 4/4 两小节 = 8 拍，每小节 3 条拍线（小节线自己已经画了）
  assert.equal(lines, 6, `拍线数量不对：${lines}`);
});

test("JSON 谱面转 alphaTex：方向、切音、小节分隔都在", () => {
  const spec = JSON.parse(fs.readFileSync(`${root}samples/spec.json`, "utf8"));
  const out = specToAlphaTex(spec);
  assert.ok(out.includes("\\ts (4 4)"), "缺拍号");
  assert.ok(out.includes("{bd}"), "缺下扫");
  assert.ok(out.includes("{bu}"), "缺上扫");
  assert.ok(out.includes("|"), "缺小节分隔");
  assert.equal(out.split("|").length, spec.bars.length, "小节数对不上");
});

test("JSON 切音：mute=dead 时音头写成 x", () => {
  const spec = {
    timeSignature: [4, 4],
    mute: "dead",
    bars: [[{ at: 0, dur: 4, notes: [{ string: 5, fret: 3 }] }]],
  };
  const out = specToAlphaTex(spec);
  assert.ok(out.includes("x.5"), `没有死音音头：${out}`);
});

test("留白：默认给四周留 6，底部留 12，最下一行的品数不会贴边", async () => {
  const tight = await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1, padding: 0 });
  const padded = await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1 });
  assert.equal(padded.width - tight.width, 12, "左右各留 6");
  assert.equal(padded.height - tight.height, 18, "上留 6、下留 12");
  assert.equal(
    (await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1, padding: 4 })).height -
      tight.height,
    12,
    "上下留白应该跟着 padding 走",
  );
});

test("engraving：TAB 谱号调小会改变画面，写错参数会报错", async () => {
  // 注意：谱号只影响字形大小，不影响画布高度（系统高度由六条弦线定死），
  // 所以这里比的是像素内容，不是尺寸。
  const big = await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1 });
  const small = await renderPng(tex, {
    width: 720,
    theme: "dark",
    pixelRatio: 1,
    engraving: { musicFontSize: 24 },
  });
  assert.equal(small.width, big.width, "谱号不该改变画布宽度");
  assert.notEqual(
    Buffer.compare(small.data, big.data),
    0,
    "调整谱号大小后图像应该不一样",
  );
  await assert.rejects(
    () => renderPng(tex, { engraving: { noSuchMetric: 1 } }),
    /未知的 engraving 参数/,
  );
});
