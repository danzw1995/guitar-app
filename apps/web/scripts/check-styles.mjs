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

// 9. 节奏格：十六分音符一小节 16 格，窄屏必须能横向滚动，格子不能被压成一条线
{
  const strip = narrowDecls(".rhythm-strip");
  const slot = narrowDecls(".rhythm-slot");
  const minWidth = px(slot.get("min-width"));
  expect(
    ".rhythm-strip 横向滚动（16 分音符一小节 16 格，窄屏放不下）",
    strip.get("overflow-x") === "auto",
    `overflow-x = ${strip.get("overflow-x") ?? "未设置"}`,
  );
  expect(
    ".rhythm-slot 最小宽度 ≥ 32px（数拍词 + 扫弦箭头要放得下）",
    minWidth !== null && minWidth >= 32,
    `min-width = ${slot.get("min-width") ?? "未设置"}`,
  );
}

// 10. 节拍器的拍点要看得出来：非零尺寸 + 圆形 + 有「正在响」的状态样式
{
  const dot = narrowDecls(".metro-dot");
  const w = px(dot.get("width"));
  const on = narrowDecls(".metro-dot.on");
  expect(
    ".metro-dot 是可见的圆点（≥ 8px）",
    w !== null && w >= 8 && dot.get("border-radius") === "50%",
    `width = ${dot.get("width")}, border-radius = ${dot.get("border-radius")}`,
  );
  expect(
    ".metro-dot.on 有高亮状态（否则节拍器没有视觉反馈）",
    (on.get("background") ?? "") !== "",
    `background = ${on.get("background") ?? "未设置"}`,
  );
}

// 11. 乐理课时数：12 节（第 12 节是时值）
{
  const theory = readFileSync(new URL("../src/pages/Theory.tsx", import.meta.url), "utf8");
  const lessonNos = [...theory.matchAll(/className="lesson-no">(\d+)</g)].map((m) => Number(m[1]));
  expect(
    "乐理页有 12 节课，编号连续",
    lessonNos.length === 12 && lessonNos.every((n, i) => n === i + 1),
    `找到的编号：${lessonNos.join(", ") || "无"}`,
  );
}

// 12. 练习页：窄屏下七个 Tab 要能换行，计时器和控件不能被压扁
{
  const tabs = narrowDecls(".tabs");
  expect(
    ".tabs 窄屏换行（七个 Tab 一行放不下）",
    tabs.get("flex-wrap") === "wrap",
    `flex-wrap = ${tabs.get("flex-wrap") ?? "未设置"}`,
  );

  const field = narrowDecls(".practice-field select");
  const minHeight = px(field.get("min-height"));
  expect(
    ".practice-field select 最小高度 ≥ 40px",
    minHeight !== null && minHeight >= 40,
    `min-height = ${field.get("min-height") ?? "未设置"}`,
  );

  const timer = narrowDecls(".pb-timer");
  expect(
    ".pb-timer 用等宽数字（计时跳秒时不左右抖）",
    timer.get("font-variant-numeric") === "tabular-nums",
    `font-variant-numeric = ${timer.get("font-variant-numeric") ?? "未设置"}`,
  );

  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  expect(
    "练习页挂进了导航（TABS + 渲染）",
    app.includes('{ id: "practice"') && app.includes("<Practice />"),
    "App.tsx 里没找到 practice 标签或页面",
  );
}

// 13. 六线谱：宽谱要能横向滚动，品数字号不能太小，弦线必须可见
{
  const scroll = narrowDecls(".tab-scroll");
  const fret = narrowDecls(".tab-fret");
  const string = narrowDecls(".tab-string");
  const size = px(fret.get("font-size"));
  expect(
    ".tab-scroll 横向滚动（跨把位的谱子会超出屏宽）",
    scroll.get("overflow-x") === "auto",
    `overflow-x = ${scroll.get("overflow-x") ?? "未设置"}`,
  );
  expect(
    ".tab-fret 字号 ≥ 12px（品数字要看得清）",
    size !== null && size >= 12,
    `font-size = ${fret.get("font-size") ?? "未设置"}`,
  );
  expect(
    ".tab-string 有描边色（弦线不能透明）",
    (string.get("stroke") ?? "") !== "",
    `stroke = ${string.get("stroke") ?? "未设置"}`,
  );
}

// 14. 阶段条：六个阶段的按钮要够大、能横向滚动
{
  const btn = narrowDecls(".stage-btn");
  const track = narrowDecls(".stage-track");
  const height = px(btn.get("min-height"));
  expect(
    ".stage-btn 最小高度 ≥ 44px",
    height !== null && height >= 44,
    `min-height = ${btn.get("min-height") ?? "未设置"}`,
  );
  expect(
    ".stage-track 横向滚动（六个阶段放不下一行）",
    track.get("overflow-x") === "auto",
    `overflow-x = ${track.get("overflow-x") ?? "未设置"}`,
  );
  expect(
    ".stage-btn.on 有选中样式",
    (narrowDecls(".stage-btn.on").get("border-color") ?? "") !== "",
    "选中态没有视觉区别",
  );
}

console.log(`\n${checked - failures.length}/${checked} 项通过`);
if (failures.length) {
  console.log(`失败：${failures.join("、")}`);
  process.exit(1);
}
