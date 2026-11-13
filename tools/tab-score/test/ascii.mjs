// ASCII 六线谱解析的测试：和弦列、弦名、两位数品、闷音、头信息、能出图。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { renderPng } from "../src/render.mjs";
import { specToAlphaTex } from "../src/spec.mjs";
import { asciiTabToSpec, asciiTabToAlphaTex } from "../src/ascii.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const DEMO = [
  "title: 试写",
  "tempo: 72",
  "ts: 4/4",
  "",
  "e|--------0-------|",
  "B|----1-------1---|",
  "G|--0---0---0---0-|",
  "D|----------------|",
  "A|3-------3-------|",
  "E|----------------|",
].join("\n");

test("ASCII 六线谱：弦名按 e/B/G/D/A/E 排，列距决定时值", () => {
  const spec = asciiTabToSpec(DEMO);
  assert.equal(spec.title, "试写");
  assert.equal(spec.tempo, 72);
  assert.deepEqual(spec.timeSignature, [4, 4]);
  assert.equal(spec.bars.length, 1, "一个小节");

  const hits = spec.bars[0].hits;
  assert.equal(hits.length, 8, "八分音符共 8 个");
  // 第一列写在 A 弦上（A 就是 5 弦），3 品
  assert.deepEqual(hits[0].notes, [{ string: 5, fret: 3 }]);
  assert.equal(hits[0].at, 0);
  assert.equal(hits[0].dur, 0.5, "八分音符应该是半个四分");
  for (const hit of hits) assert.equal(hit.dur, 0.5, "列距一样，时值应该一样");
});

test("ASCII 六线谱：同一列上的音算一个和弦", () => {
  const text = [
    "|--------|",
    "|--1-----|",
    "|--0-----|",
    "|--2-----|",
    "|--------|",
    "|--------|",
  ].join("\n");
  const hits = asciiTabToSpec(text).bars[0].hits;
  assert.equal(hits.length, 1, "同一列应该合成一个音");
  assert.equal(hits[0].notes.length, 3, "三根弦一起拨");
  assert.deepEqual(
    hits[0].notes.map((note) => note.string),
    [2, 3, 4],
    "和弦里的弦号应该按弦排好",
  );
});

test("ASCII 六线谱：两位数品、x 闷音、没有弦名时按 1–6 排", () => {
  const text = [
    "|--------|",
    "|--------|",
    "|--10----|",
    "|--------|",
    "|------x-|",
    "|--------|",
  ].join("\n");

  const spec = asciiTabToSpec(text);
  const hits = spec.bars[0].hits;
  assert.equal(hits.length, 2, "两列两个音");
  const byString = new Map();
  for (const hit of hits) {
    for (const note of hit.notes) byString.set(note.string, note.fret);
  }
  assert.equal(byString.get(3), 10, "两位数的品数要认成 10");
  assert.equal(byString.get(5), "x", "x 是闷音");
});

test("ASCII 六线谱：样例文件能直接渲染成 PNG", async () => {
  const text = fs.readFileSync(`${root}samples/demo.tab`, "utf8");
  const tex = asciiTabToAlphaTex(text, specToAlphaTex);
  assert.ok(tex.includes("\\ts (4 4)"), "缺拍号");
  assert.ok(tex.includes("3.5.8"), `八分音符没写对：${tex}`);
  const png = await renderPng(tex, { width: 720, theme: "dark" });
  assert.ok(png.width >= 600 && png.height >= 150, "尺寸不对");
  assert.equal(png.beats.length, 8, "两小节 4/4 应该有 8 拍");
});

test("ASCII 六线谱：小写 e 是 1 弦、大写 E 是 6 弦（别把 E 行覆盖掉）", () => {
  const text = [
    "e|0---------------|",
    "B|----------------|",
    "G|----------------|",
    "D|----------------|",
    "A|----------------|",
    "E|3---------------|",
  ].join("\n");
  const spec = asciiTabToSpec(text);
  const notes = spec.bars[0].hits.flatMap((hit) => hit.notes);
  assert.equal(notes.length, 2, "两根弦上各一个音，不能被覆盖成一个");
  const byString = new Map(notes.map((note) => [note.string, note.fret]));
  assert.equal(byString.get(1), 0, "小写 e 是 1 弦空弦");
  assert.equal(byString.get(6), 3, "大写 E 是 6 弦 3 品");
});

test("ASCII 六线谱：空文件要报错，不能悄悄出空白谱", () => {
  assert.throws(() => asciiTabToSpec("hello\nworld"), /没找到六线谱/);
  assert.throws(
    () => asciiTabToSpec(["e|------|", "B|------|", "G|------|", "D|------|", "A|------|", "E|------|"].join("\n")),
    /没有音/,
  );
});
