/**
 * Host 侧纯函数的单元测试（不需要 DSH，直接在 Node 跑）。
 *
 *   node plugins/dsh-guitar/test/host.mjs
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chordLookup, dailyLookup, noteAt, scaleLookup } from "../lib/guitar.js";
import { apply, makeTool, TOOL_SPECS } from "../index.js";

const url = (p) => new URL(p, import.meta.url);

// —— 注册：模拟 ctx.tools.register 的契约（见 dsh-tools 的 register 实现）——
const registered = [];
const fakeCtx = {
  tools: {
    register(definition) {
      // 真实实现会做这两条校验
      assert.ok(definition.name, "工具必须有 name");
      assert.equal(typeof definition.output?.render, "function", "工具必须声明 output.render");
      registered.push(definition);
      return () => {};
    },
  },
};
apply(fakeCtx);
assert.equal(registered.length, 4, "应该注册 4 个工具");
assert.deepEqual(
  registered.map((d) => d.name).sort(),
  ["guitar_chord", "guitar_daily", "guitar_note_at", "guitar_scale"],
);

for (const tool of registered) {
  assert.ok(tool.description.length > 10, `${tool.name} 缺少描述`);
  assert.equal(tool.parameters.type, "object", `${tool.name} 的 parameters 必须是 object 根`);
  assert.ok(tool.parameters.properties, `${tool.name} 缺少 properties`);
}

const scaleTool = registered.find((d) => d.name === "guitar_scale");
assert.deepEqual(scaleTool.parameters.required, ["key"], "只有 key 是必填");
const noteTool = registered.find((d) => d.name === "guitar_note_at");
assert.deepEqual(noteTool.parameters.required.sort(), ["fret", "string"]);

// render 必须返回内容块数组
const blocks = scaleTool.output.render({ key: "G" }, { text: "G 大调：G A B C D E F#" });
assert.deepEqual(blocks, [{ type: "text", text: "G 大调：G A B C D E F#" }]);

// execute 走真实逻辑
const result = await scaleTool.execute({ key: "G" });
assert.equal(result.notes.join(""), "GABCDEF#");
assert.ok(result.text.includes("G 大调"));
console.log("register: 4 个工具，参数与 render 形状正确");

// —— 和弦 ——
const c = chordLookup("C");
assert.equal(c.quality, "大三和弦");
assert.deepEqual(c.tones, [
  { note: "C", degree: "1" },
  { note: "E", degree: "3" },
  { note: "G", degree: "5" },
]);
assert.equal(c.fingering, "x32010");
assert.ok(c.text.includes("大三和弦"));
console.log("chord:", c.text);

const am = chordLookup("Am");
assert.equal(am.quality, "小三和弦");
assert.deepEqual(am.tones.map((t) => t.note), ["A", "C", "E"]);
console.log("chord Am:", am.text);

assert.throws(() => chordLookup("H7"), /没有内置和弦/);

// —— 音阶 ——
const g = scaleLookup("G", "major");
assert.deepEqual(g.notes, ["G", "A", "B", "C", "D", "E", "F#"]);
assert.deepEqual(g.solfege, ["1", "2", "3", "4", "5", "6", "7"]);
assert.ok(!g.text.includes("大调 大调"), "调名里已经有大调，不能再拼一次");
assert.ok(g.text.startsWith("G 大调"));
console.log("scale:", g.text);

const amScale = scaleLookup("Am", "naturalMinor");
assert.deepEqual(amScale.notes, ["A", "B", "C", "D", "E", "F", "G"]);
assert.equal(amScale.scaleName, "自然小调");
assert.ok(amScale.text.includes("A 小调（自然小调）"), "非默认音阶要用括号补充");
console.log("scale Am:", amScale.text);

assert.throws(() => scaleLookup("H"), /没有这个调/);
assert.throws(() => scaleLookup("C", "blues"), /没有这个音阶/);

// —— 今日一题 ——
const today = dailyLookup();
assert.match(today.dateKey, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(today.toFill > 0);
assert.ok(today.targets > today.givens);
console.log("daily:", today.text);

const fixed = dailyLookup("2026-11-01");
assert.equal(fixed.dateKey, "2026-11-01");
assert.equal(fixed.key, "Am", "2026-11-01 的每日挑战是 A 小调");
assert.equal(fixed.fretMax, 7);
console.log("daily 2026-11-01:", fixed.text);

// 同一天必须稳定（同题）
assert.deepEqual(dailyLookup("2026-11-01"), fixed);

// —— 单格音 ——
const n = noteAt(6, 3);
assert.equal(n.pc, 7, "6 弦 3 品是 G");
assert.equal(n.fixedSolfege, "5");
console.log("note:", n.text);
assert.throws(() => noteAt(7, 3), /弦号应为 1–6/);
assert.throws(() => noteAt(1, 99), /品号应为 0–24/);

console.log("all host checks passed");
