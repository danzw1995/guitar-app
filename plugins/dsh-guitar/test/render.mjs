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
assert.equal(entry.options.name, "conversation.header", "面板要挂在全宽的 header，不是 composer.dock");
assert.equal(entry.options.id, "guitar-lab");

const t = (_key, fallback) => fallback;
const mount = (initialTab) =>
  renderToStaticMarkup(React.createElement(mod.Panel, { t, initialTab }));
const count = (html, needle) => html.split(needle).length - 1;

// —— 和弦页：C 大三（x32010）——
const chordHtml = mount("chord");
assert.ok(chordHtml.includes("<svg"), "和弦页没有指板");
assert.ok(chordHtml.includes("x32010"), "和弦页没有指法串");
assert.ok(chordHtml.includes("大三和弦"), "和弦页没有性质");
// C: A 弦 3 品 = C（根音）、D 弦 2 品 = E、B 弦 1 品 = C（根音）
assert.equal(count(chordHtml, 'fill="#d4a72c"'), 2, "C 和弦应有两个根音点");
assert.equal(count(chordHtml, 'fill="#3b82f6"'), 1, "C 和弦应有一个三音点");
assert.equal(count(chordHtml, ">×<"), 1, "C 和弦低音 E 弦应标 ×");
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
assert.equal((scaleHtml.match(/viewBox="[^"]+"/) || [])[0], 'viewBox="0 0 480 132"');
console.log(`scale page: ok (root ${rootN}, tones ${toneN})`);

// —— 今日页 ——
const spec = core.dailySpecFor(core.dateKeyOf(new Date()));
const todayHtml = mount("today");
assert.ok(todayHtml.includes(spec.dateKey), "今日页没有日期");
assert.ok(todayHtml.includes(spec.keyId), "今日页没有调");
assert.ok(todayHtml.includes("<svg"), "今日页没有指板");
console.log("today page: ok");

// —— 样式只依赖 currentColor / 明确的音点颜色，不猜主题变量 ——
assert.ok(!code.includes("--dsw-alias"), "不要再猜主题变量名");
console.log("theme: uses currentColor, no token guessing");
console.log("all plugin render checks passed");
