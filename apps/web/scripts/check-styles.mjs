// 移动端样式的静态检查：只保证「规则在」，不保证渲染出来的像素。
// 真实设备的表现仍要人眼看着，但规则被删/被覆盖时这里会红。
import { readFileSync } from "node:fs";

const CSS_PATH = new URL("../src/styles.css", import.meta.url);
const NARROW_MAX = 720;
const TAP_MIN = 40;
const IOS_NO_ZOOM_FONT = 16;

const css = readFileSync(CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** 递归解析出所有规则（含 @media 内的），按源码顺序返回。 */
function parseRules(src, media = "") {
  const rules = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const selector = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (selector.startsWith("@media")) {
      rules.push(...parseRules(body, selector));
    } else if (!selector.startsWith("@")) {
      const decls = new Map();
      for (const part of body.split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        decls.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
      rules.push({ selector, decls, media });
    }
    i = j;
  }
  return rules;
}

const rules = parseRules(css);

const mediaMax = (media) => {
  const m = /max-width:\s*(\d+)px/.exec(media || "");
  return m ? Number(m[1]) : Infinity;
};

const selectorsOf = (rule) => rule.selector.split(",").map((s) => s.trim());

/**
 * 合并某选择器在「窄屏（≤720px）」下的有效声明：先基础规则，再窄屏媒体块，
 * 后出现的覆盖前面的，跟浏览器层叠顺序一致。
 */
function narrowDecls(selector) {
  const merged = new Map();
  for (const rule of rules) {
    if (!selectorsOf(rule).includes(selector)) continue;
    // 没有媒体查询的规则始终生效；只在 max-width > 720 的块里才跳过
    if (rule.media && mediaMax(rule.media) > NARROW_MAX) continue;
    for (const [prop, value] of rule.decls) merged.set(prop, value);
  }
  return merged;
}

const px = (value) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) : null;
};

const failures = [];
let checked = 0;

function expect(label, ok, detail) {
  checked++;
  if (ok) {
    console.log(`✔ ${label}`);
  } else {
    console.log(`✖ ${label} — ${detail}`);
    failures.push(label);
  }
}

// 1. 点按目标 ≥ 40px（窄屏也不能被媒体查询压小）
for (const selector of [".fb-cell", ".btn", ".tab", ".toolbar select", ".note-btn", ".settings-row"]) {
  const decls = narrowDecls(selector);
  const minHeight = px(decls.get("min-height"));
  expect(
    `${selector} 最小高度 ≥ ${TAP_MIN}px`,
    minHeight !== null && minHeight >= TAP_MIN,
    `窄屏下 min-height = ${decls.get("min-height") ?? "未设置"}`,
  );
}

// 2. 指板格子的最小宽度同样 ≥ 40px
{
  const decls = narrowDecls(".fb-cell");
  const minWidth = px(decls.get("min-width"));
  expect(
    `.fb-cell 最小宽度 ≥ ${TAP_MIN}px`,
    minWidth !== null && minWidth >= TAP_MIN,
    `窄屏下 min-width = ${decls.get("min-width") ?? "未设置"}`,
  );
}

// 3. 横向滚动时弦名列固定
for (const selector of [".fb-string-label", ".fb-corner"]) {
  const decls = narrowDecls(selector);
  expect(
    `${selector} 固定在左侧（sticky）`,
    decls.get("position") === "sticky" && /^0(px)?$/.test(decls.get("left") ?? ""),
    `position = ${decls.get("position") ?? "未设置"}, left = ${decls.get("left") ?? "未设置"}`,
  );
}

// 4. iOS Safari：表单控件字号 ≥ 16px，否则聚焦会放大页面
for (const selector of ["select", "input", "textarea"]) {
  const decls = narrowDecls(selector);
  const size = px(decls.get("font-size"));
  expect(
    `${selector} 窄屏字号 ≥ ${IOS_NO_ZOOM_FONT}px（避免 iOS 聚焦缩放）`,
    size !== null && size >= IOS_NO_ZOOM_FONT,
    `窄屏下 font-size = ${decls.get("font-size") ?? "未设置（继承）"}`,
  );
}

console.log(`\n${checked - failures.length}/${checked} 项通过`);
if (failures.length) {
  console.log(`失败：${failures.join("、")}`);
  process.exit(1);
}
