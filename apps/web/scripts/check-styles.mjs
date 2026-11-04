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
for (const selector of [".fb-cell", ".btn", ".tab", ".toolbar select", ".note-btn", ".settings-row", ".mode-switch .chip", ".settings-row select"]) {
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

// 3. 音点是圆形、尺寸足够看清（30px 直径，里面可能放两行字）
{
  const dot = narrowDecls(".fb-dot");
  const w = px(dot.get("width"));
  const h = px(dot.get("height"));
  expect(
    ".fb-dot 是 30px 左右的圆形音点",
    w !== null && w >= 26 && h !== null && h >= 26 && dot.get("border-radius") === "50%",
    `width = ${dot.get("width")}, height = ${dot.get("height")}, border-radius = ${dot.get("border-radius")}`,
  );
}

// 4. 弦名列在滚动容器外面（结构性，不靠 sticky）：.fb-labels 不参与横向滚动
{
  const labels = narrowDecls(".fb-labels");
  const scroll = narrowDecls(".fb-scroll");
  expect(
    ".fb-labels 固定宽度且不收缩",
    labels.get("flex") === "0 0 auto" && px(labels.get("width")) !== null,
    `flex = ${labels.get("flex")}, width = ${labels.get("width")}`,
  );
  expect(
    ".fb-scroll 才是横向滚动容器",
    scroll.get("overflow-x") === "auto",
    `overflow-x = ${scroll.get("overflow-x")}`,
  );
}

// 5. iOS Safari：表单控件字号 ≥ 16px，否则聚焦会放大页面
for (const selector of ["select", "input", "textarea"]) {
  const decls = narrowDecls(selector);
  const size = px(decls.get("font-size"));
  expect(
    `${selector} 窄屏字号 ≥ ${IOS_NO_ZOOM_FONT}px（避免 iOS 聚焦缩放）`,
    size !== null && size >= IOS_NO_ZOOM_FONT,
    `窄屏下 font-size = ${decls.get("font-size") ?? "未设置（继承）"}`,
  );
}

// 6. CAGED 形状按钮：宽度不能随「第 9 品 / 第 10 品」变化，否则切换时会跳
{
  const tab = narrowDecls(".caged-tab");
  const width = px(tab.get("min-width"));
  expect(
    ".caged-tab 固定最小宽度（切形状时不因位数变宽而跳动）",
    width !== null && width >= 70,
    `min-width = ${tab.get("min-width") ?? "未设置"}`,
  );
  expect(
    ".caged-tab 使用等宽数字（tabular-nums）",
    tab.get("font-variant-numeric") === "tabular-nums",
    `font-variant-numeric = ${tab.get("font-variant-numeric") ?? "未设置"}`,
  );
  expect(
    ".caged-tab 不换行（white-space: nowrap）",
    tab.get("white-space") === "nowrap",
    `white-space = ${tab.get("white-space") ?? "未设置"}`,
  );
}

// 7. 乐理挑战的答题弹层要够宽：7–9 品的指板宽度约 414–522px
{
  const player = narrowDecls(".quiz.theory-player");
  const width = px(player.get("max-width"));
  expect(
    ".quiz.theory-player 比普通弹窗宽（≥ 700px，7 品指板不出现横向滚动）",
    width !== null && width >= 700,
    `max-width = ${player.get("max-width") ?? "未设置"}`,
  );
}

// 8. 关卡下拉的章节必须来自数据：写死 [1,2,3,4] 会让新增章节的关卡静默消失
{
  const game = readFileSync(new URL("../src/pages/Game.tsx", import.meta.url), "utf8");
  expect(
    "关卡下拉用 CHAPTERS（章节号不写死）",
    game.includes("{CHAPTERS.map("),
    "Game.tsx 里没有用 CHAPTERS 遍历章节",
  );
}

console.log(`\n${checked - failures.length}/${checked} 项通过`);
if (failures.length) {
  console.log(`失败：${failures.join("、")}`);
  process.exit(1);
}
