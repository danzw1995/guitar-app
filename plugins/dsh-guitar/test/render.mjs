/**
 * 无浏览器验证：把构建出来的 client.js 当成宿主加载，渲染三页面板，
 * 并把渲染出的圆点数量和 @guitar/core 算出来的位置逐个对齐。
 *
 *   node plugins/dsh-guitar/test/render.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const url = (p) => new URL(p, import.meta.url);
const webRequire = createRequire(here("../../../apps/web/package.json"));
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");
const core = await import(url("../../../packages/core/dist/index.js"));

// —— 加载 bundle，模拟宿主的模块加载器 ——
let loaded = null;
const code = readFileSync(here("../client.js"), "utf8");
new Function("window", code)({ __ModuleLoader__: { load: (m) => { loaded = m; } } });
assert.ok(loaded, "client.js 没有调用 window.__ModuleLoader__.load");
assert.equal(loaded.id, "@local/guitar-lab");

const mod = loaded.factory((name) => {
  if (name === "react") return React;
  throw new Error(`unexpected require: ${name}`);
});
assert.equal(typeof mod.apply, "function");
assert.deepEqual(mod.inject, ["slots"]);

// —— 注册进哪个 slot ——
let entry = null;
mod.apply({
  locale: { t: () => undefined },
  slots: { inject: (key, fn) => fn(), register: (options, Component) => { entry = { options, Component }; } },
});
assert.ok(entry, "apply 没有注册任何东西");
assert.equal(entry.options.name, "conversation.view", "面板要挂在 list 类型的整页插槽");
assert.equal(entry.options.id, "guitar-lab");
assert.equal(typeof entry.options.label, "function", "整页插槽需要 label（标签页标题）");
assert.equal(entry.options.label(), "Guitar Lab");

const t = (_key, fallback) => fallback;
const mount = (initialTab) =>
  renderToStaticMarkup(React.createElement(mod.Panel, { t, initialTab }));
const count = (html, needle) => html.split(needle).length - 1;

// —— 和弦页：C 大三（x32010）——
const chordHtml = mount("chord");
assert.ok(chordHtml.includes("<style>"), "面板没有注入 <style>，样式会完全丢失");
assert.ok(chordHtml.includes("--dsw-alias-label-primary"), "样式里没有用宿主的文字色 token");
assert.ok(chordHtml.includes("--dsw-alias-border-l1"), "样式里没有用宿主的边框 token");
assert.equal((chordHtml.match(/viewBox="[^"]+"/) || [])[0], 'viewBox="0 0 238 152"');
// 品位数字：1..5 各一个
for (const f of [1, 2, 3, 4, 5]) assert.ok(chordHtml.includes(`>${f}</text>`), `缺少品位数字 ${f}`);
// 弦名在最左（x=4），○/× 在 x=34，两者不能再重叠
assert.ok(chordHtml.includes('x="4"'), "缺少弦名");
assert.ok(chordHtml.includes('x="34"'), "缺少 ○/× 标记列");
// C: A 弦 3 品 = C（根音）、D 弦 2 品 = E、B 弦 1 品 = C（根音）
assert.equal(count(chordHtml, 'fill="#d4a72c"'), 2, "C 和弦应有两个根音点");
assert.equal(count(chordHtml, 'fill="#3b82f6"'), 1, "C 和弦应有一个三音点");
assert.equal(count(chordHtml, ">×<"), 1, "C 和弦低音 E 弦应标 ×");
assert.ok(chordHtml.includes("x32010"));
assert.ok(chordHtml.includes("大三和弦"));
console.log("chord page: ok");

// —— 音阶页：G 大调，1–12 品 ——
const scaleHtml = mount("scale");
const pcs = core.scalePcs(core.KEY_BY_ID.get("G"), core.SCALE_BY_ID.get("major"));
let rootN = 0;
let toneN = 0;
for (let s = 0; s < 6; s++) {
  for (let f = 1; f <= 12; f++) {
    const pc = core.pitchClassAt(core.STANDARD_TUNING, s, f);
    if (!pcs.includes(pc)) continue;
    if (pc === 7) rootN++;
    else toneN++;
  }
}
assert.equal(count(scaleHtml, 'fill="#d4a72c"'), rootN, "音阶主音点数量不对");
assert.equal(count(scaleHtml, 'fill="#3b82f6"'), toneN, "音阶非主音点数量不对");
assert.equal((scaleHtml.match(/viewBox="[^"]+"/) || [])[0], 'viewBox="0 0 486 152"');
assert.ok(scaleHtml.includes(">12</text>"), "音阶指板缺少 12 品数字");
console.log(`scale page: ok (root ${rootN}, tones ${toneN})`);

// —— 今日页：按当天 spec 出题，带 ? 和「显示答案」 ——
const spec = core.dailySpecFor(core.dateKeyOf(new Date()));
const todayHtml = mount("today");
assert.ok(todayHtml.includes(spec.dateKey), "今日页没有日期");
assert.ok(todayHtml.includes("A 小调") || todayHtml.includes(core.KEY_BY_ID.get(spec.keyId).name), "今日页没有调名");
assert.ok(todayHtml.includes("?"), "今日页应该有待填的 ?");
assert.ok(todayHtml.includes("显示答案"), "今日页缺少「显示答案」按钮");
const frets = spec.fretMax - spec.fretMin + 1;
assert.equal((todayHtml.match(/viewBox="[^"]+"/) || [])[0], `viewBox="0 0 ${30 + frets * 38} 152"`);
console.log("today page: ok");

console.log("styles injected: ok");
console.log("all plugin render checks passed");
