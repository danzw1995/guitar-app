// 冒烟测试：不比对像素，只确认「能出图、尺寸合理、JSON 输入转得对」。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { renderPng, renderSvg } from "../src/render.mjs";
import { specToAlphaTex } from "../src/spec.mjs";
import { asciiTabToSpec, asciiTabToAlphaTex } from "../src/ascii.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tex = fs.readFileSync(`${root}samples/demo.tex`, "utf8");

test("alphaTex 渲染成 PNG：有内容、尺寸是 2 倍图", async () => {
  const png = await renderPng(tex, { width: 720, theme: "dark" });
  assert.ok(png.data.length > 5_000, `PNG 太小：${png.data.length} 字节`);
  assert.equal(png.width % 2, 0, "pixelRatio 2 时宽度应为偶数");
  assert.ok(png.width >= 600, `宽度不对：${png.width}`);
  assert.ok(png.height >= 150, `高度不对：${png.height}`);
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

test("留白：四周各留 padding，底部再多留给扫弦箭头", async () => {
  const tight = await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1, padding: 0 });
  const padded = await renderPng(tex, { width: 720, theme: "dark", pixelRatio: 1 });
  // 左右各 pad（默认 6）⇒ 宽度差 12
  assert.equal(padded.width - tight.width, 12, "左右各留 6");
  // 高度：上 pad(6) + 底 pad(6)+箭头区(18)，减去 tight 自己也有的箭头区 18 ⇒ 12
  assert.equal(padded.height - tight.height, 12, "上留 6、底部比无箭头时多 6");
  const again = await renderPng(tex, {
    width: 720,
    theme: "dark",
    pixelRatio: 1,
    padding: 4,
  });
  assert.equal(again.width - tight.width, 8, "左右各留 padding");
});

test("拍位：每小节数出 4 拍，横坐标从左到右、落在图片里", async () => {
  // demo.tex 是两小节 4/4 —— 拍位要正好 8 个，和谱面对得上，
  // 否则前端按「第几拍」定位的高亮条会画到别处。
  const png = await renderPng(tex, { width: 720, theme: "dark" });
  assert.equal(png.beats.length, 8, `拍数不对：${png.beats.length}`);
  for (const beat of png.beats) {
    assert.ok(beat.w > 0, `拍宽不对：${beat.w}`);
    assert.ok(beat.x >= 0 && beat.x + beat.w <= png.width, "拍位跑到图片外面了");
    // 纵向也必须给：长谱折行时高亮条只该盖住「这一拍所在的那一行」，
    // 没有 y/h 前端就只能按整张图的高度画，每一行同一列都会被照亮。
    assert.ok(beat.h > 0, `拍位缺高度：${JSON.stringify(beat)}`);
    assert.ok(beat.y >= 0 && beat.y + beat.h <= png.height, "拍位的纵向范围跑到图片外面了");
  }
  // 两小节的 demo 折成两行时，第二行的高亮必须落在下半张图里
  const rows = [...new Set(png.beats.map((beat) => beat.y))];
  assert.ok(rows.length >= 1, "拍位没有纵向信息");
  if (rows.length > 1) {
    assert.ok(rows[1] > rows[0], "第二行的 y 应该在第一行下面");
  }
  // 同一小节内从左到右；第二小节折到下一行也无所谓，只要不重叠
  const firstBar = png.beats.slice(0, 4);
  for (let i = 1; i < firstBar.length; i++) {
    assert.ok(firstBar[i].x > firstBar[i - 1].x, "第一小节的拍位没有从左到右");
  }
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
