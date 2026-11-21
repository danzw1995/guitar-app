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

// 13. 六线谱：桌面端不横滑（靠换行），只有手机才允许
{
  const scroll = narrowDecls(".tab-scroll");
  const wide = rules.find(
    (rule) => !rule.media && selectorsOf(rule).includes(".tab-scroll"),
  );
  const fret = narrowDecls(".tab-fret");
  const string = narrowDecls(".tab-string");
  const size = px(fret.get("font-size"));
  expect(
    ".tab-scroll 桌面端不滚动（放开滚动条）",
    (wide?.decls.get("overflow") ?? "") === "visible",
    `overflow = ${wide?.decls.get("overflow") ?? "未设置"}`,
  );
  expect(
    ".tab-scroll 手机端才允许横滑",
    scroll.get("overflow-x") === "auto",
    `窄屏 overflow-x = ${scroll.get("overflow-x") ?? "未设置"}`,
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

// 15. 顶部导航：七个 Tab 必须能换行，按钮不折字
{
  const tabs = narrowDecls(".tabs");
  const tab = narrowDecls(".tab");
  expect(
    ".tabs 允许换行（七个 Tab 一行放不下时不要溢出）",
    tabs.get("flex-wrap") === "wrap",
    `flex-wrap = ${tabs.get("flex-wrap") ?? "未设置"}`,
  );
  expect(
    ".tab 不折字（white-space: nowrap）",
    tab.get("white-space") === "nowrap",
    `white-space = ${tab.get("white-space") ?? "未设置"}`,
  );
}

// 16. 时值：符干、符梁、符尾都要有颜色，不能不可见
{
  const stem = narrowDecls(".tab-stem");
  const beam = narrowDecls(".tab-beam");
  const flag = narrowDecls(".tab-flag");
  expect(
    ".tab-stem / .tab-beam 有描边色",
    (stem.get("stroke") ?? "") !== "" && (beam.get("stroke") ?? "") !== "",
    "符干或符梁没有描边色",
  );
  expect(
    ".tab-flag 有描边色（独立八分音符的符尾）",
    (flag.get("stroke") ?? "") !== "",
    `stroke = ${flag.get("stroke") ?? "未设置"}`,
  );
  expect(
    "谱面不再有单独的节奏轨横线",
    !readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").includes(
      ".tab-rhythm-line",
    ),
    "styles.css 里还留着 .tab-rhythm-line",
  );
}

// 17. 节奏专项：难度标签与数拍词
{
  const badge = narrowDecls(".level-badge");
  expect(
    ".level-badge 不折行（难度标签）",
    badge.get("white-space") === "nowrap",
    `white-space = ${badge.get("white-space") ?? "未设置"}`,
  );
  const count = narrowDecls(".rhythm-count b");
  expect(
    ".rhythm-count b 用等宽字体（数拍词要对齐）",
    (count.get("font-family") ?? "").includes("monospace"),
    `font-family = ${count.get("font-family") ?? "未设置"}`,
  );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  expect(
    "节奏页挂进了导航",
    app.includes('{ id: "rhythm"') && app.includes("<Rhythm />"),
    "App.tsx 里没有 rhythm 标签或页面",
  );
}

// 18. 试听：点亮的弦要看得出，两个按钮横排
{
  const on = narrowDecls(".chord-string.on");
  const audition = narrowDecls(".chord-audition");
  const width = Number(String(on.get("stroke-width") ?? "").replace("px", ""));
  expect(
    ".chord-string.on 有高亮（试听时点亮正在响的弦）",
    (on.get("stroke") ?? "") !== "" && Number.isFinite(width) && width >= 2,
    `stroke = ${on.get("stroke") ?? "未设置"}, stroke-width = ${on.get("stroke-width") ?? "未设置"}`,
  );
  expect(
    ".chord-audition 是横排按钮组",
    audition.get("display") === "flex",
    `display = ${audition.get("display") ?? "未设置"}`,
  );
}

// 18b. 和弦转换：当前和弦要一眼看得见，进度条要撑满
{
  const now = narrowDecls(".cd-now");
  const size = Number(String(now.get("font-size") ?? "").replace("px", ""));
  expect(
    ".cd-now 是整块里最大的字（≥ 36px）",
    Number.isFinite(size) && size >= 36,
    `font-size = ${now.get("font-size") ?? "未设置"}`,
  );
  const bar = narrowDecls(".cd-bar span");
  expect(
    ".cd-bar span 用强调色画进度",
    (bar.get("background") ?? "").includes("var(--accent)") && bar.get("display") === "block",
    `background = ${bar.get("background") ?? "未设置"}`,
  );
}

// 18c. 乐理课末尾的「练一练」按钮：点得着（≥ 40px），跳过去要有反馈（.flash 动画）
{
  const go = narrowDecls(".lesson-go");
  const height = Number(String(go.get("min-height") ?? "").replace("px", ""));
  expect(
    ".lesson-go 的点击高度不小于 40px",
    Number.isFinite(height) && height >= 40,
    `min-height = ${go.get("min-height") ?? "未设置"}`,
  );
  expect(
    ".flash 是动画（跳过去时闪一下边框）",
    css.includes(".flash {") && css.includes("@keyframes flash-ring"),
    css.includes("@keyframes flash-ring") ? "有 flash-ring" : "缺 @keyframes flash-ring",
  );
}

// 19. 朗读谱：X 要比品数更醒目
{
  const x = narrowDecls(".tab-fret.rhythm");
  const size = Number(String(x.get("font-size") ?? "").replace("px", ""));
  expect(
    ".tab-fret.rhythm 字号 ≥ 15px（朗读时一眼认出 X）",
    Number.isFinite(size) && size >= 15,
    `font-size = ${x.get("font-size") ?? "未设置"}`,
  );
}

// 20. 切音点：箭头上面那一点要看得出
{
  const mute = narrowDecls(".tab-mute");
  const size = Number(String(mute.get("font-size") ?? "").replace("px", ""));
  expect(
    ".tab-mute 有颜色且字号 ≥ 12px（切音点）",
    (mute.get("fill") ?? "") !== "" && Number.isFinite(size) && size >= 12,
    `fill = ${mute.get("fill") ?? "未设置"}, font-size = ${mute.get("font-size") ?? "未设置"}`,
  );
}

// 21. 附点与休止：都要看得出是"另一个东西"，不能和音符一个样
{
  const dot = narrowDecls(".tab-dot");
  const dotSize = Number(String(dot.get("font-size") ?? "").replace("px", ""));
  expect(
    ".tab-dot 有颜色且比音符大（附点）",
    (dot.get("fill") ?? "") !== "" && Number.isFinite(dotSize) && dotSize >= 14,
    `fill = ${dot.get("fill") ?? "未设置"}, font-size = ${dot.get("font-size") ?? "未设置"}`,
  );

  const rest = narrowDecls(".tab-rest");
  expect(
    ".tab-rest 有填充也有描边（休止符）",
    (rest.get("fill") ?? "") !== "" && (rest.get("stroke") ?? "") !== "",
    `fill = ${rest.get("fill") ?? "未设置"}, stroke = ${rest.get("stroke") ?? "未设置"}`,
  );
  // 折线画的休止符（四分、八分）不能填充，填了就是一块实心波浪
  const restLine = narrowDecls(".tab-rest-line");
  expect(
    ".tab-rest-line 只描边不填充（四分/八分休止符的折线）",
    restLine.get("fill") === "none" && (restLine.get("stroke") ?? "") !== "",
    `fill = ${restLine.get("fill") ?? "未设置"}, stroke = ${restLine.get("stroke") ?? "未设置"}`,
  );

  // 三连音的「3」和括号：太小就看不见，等于没标
  const tuplet = narrowDecls(".tab-tuplet");
  const tupletSize = Number(String(tuplet.get("font-size") ?? "").replace("px", ""));
  expect(
    ".tab-tuplet 有颜色且不小于 12px（三连音的数字）",
    (tuplet.get("fill") ?? "") !== "" && Number.isFinite(tupletSize) && tupletSize >= 12,
    `fill = ${tuplet.get("fill") ?? "未设置"}, font-size = ${tuplet.get("font-size") ?? "未设置"}`,
  );
  const bracket = narrowDecls(".tab-tuplet-bracket");
  expect(
    ".tab-tuplet-bracket 有描边（四分三连音的括号）",
    (bracket.get("stroke") ?? "") !== "",
    `stroke = ${bracket.get("stroke") ?? "未设置"}`,
  );

  // 每拍之间的分割线：要是虚线、要比小节线淡，不然整张谱会像表格
  const beatLine = narrowDecls(".tab-beat-line");
  expect(
    ".tab-beat-line 有描边而且是虚线（拍与拍的分割线）",
    (beatLine.get("stroke") ?? "") !== "" && (beatLine.get("stroke-dasharray") ?? "") !== "",
    `stroke = ${beatLine.get("stroke") ?? "未设置"}, dasharray = ${beatLine.get("stroke-dasharray") ?? "未设置"}`,
  );

  // 今日三条：进度条与「已练 N/M」得排在标题右边，不能把标题挤下去
  const todayBox = narrowDecls(".today-box");
  expect(
    ".today-box 有边框和底色（今日三条）",
    (todayBox.get("border") ?? "") !== "" && (todayBox.get("background") ?? "") !== "",
    `border = ${todayBox.get("border") ?? "未设置"}, background = ${todayBox.get("background") ?? "未设置"}`,
  );
  const blockMeter = narrowDecls(".block-meter");
  expect(
    ".block-meter 靠右显示（每块的完成度）",
    blockMeter.get("margin-left") === "auto",
    `margin-left = ${blockMeter.get("margin-left") ?? "未设置"}`,
  );

  // 我的谱：输入框要能和卡片区分开，预览里的谱不能溢出去
  const myInput = narrowDecls(".my-input");
  expect(
    ".my-input 有边框、等宽字体（粘谱用的输入框）",
    (myInput.get("border") ?? "") !== "" &&
      (myInput.get("font-family") ?? "").includes("monospace"),
    `border = ${myInput.get("border") ?? "未设置"}, font-family = ${myInput.get("font-family") ?? "未设置"}`,
  );
  const previewImage = narrowDecls(".alpha-preview img.tab-score");
  expect(
    "预览里的谱和内置谱同一个尺寸上限（600，不撑破卡片）",
    previewImage.get("max-width") === "600px" && previewImage.get("height") === "auto",
    `max-width = ${previewImage.get("max-width") ?? "未设置"}, height = ${previewImage.get("height") ?? "未设置"}`,
  );
  expect(
    "预览区和内置谱用同一个 .tab-score 尺寸（600 上限）",
    (narrowDecls(".tab-score").get("max-width") ?? "") === "600px",
    `.tab-score max-width = ${narrowDecls(".tab-score").get("max-width") ?? "未设置"}`,
  );

  // 统计页「节奏与伴奏」的分组进度条：名字、条、计数三列对齐
  const group = narrowDecls(".stat-group");
  expect(
    ".stat-group 是三列网格（名字 / 进度条 / 计数）",
    (group.get("display") ?? "") === "grid" &&
      (group.get("grid-template-columns") ?? "").split(/\s+/).length === 3,
    `display = ${group.get("display") ?? "未设置"}, columns = ${group.get("grid-template-columns") ?? "未设置"}`,
  );
  const groupBar = narrowDecls(".stat-group .practice-progress");
  expect(
    "统计页分组进度条不吃掉行距（margin 归零）",
    (groupBar.get("margin-bottom") ?? "") === "0",
    `margin-bottom = ${groupBar.get("margin-bottom") ?? "未设置"}`,
  );

  // 节奏页搜索框：能看清边界（有边框与底色）
  const searchInput = narrowDecls(".rhythm-search input");
  expect(
    "节奏页搜索框有边框和底色（不是一条裸线）",
    Boolean(searchInput.get("border")) && Boolean(searchInput.get("background")),
    `border = ${searchInput.get("border") ?? "未设置"}, background = ${searchInput.get("background") ?? "未设置"}`,
  );
  const emptyNote = narrowDecls(".rhythm-empty");
  expect(
    "搜不到的提示用弱化色，不抢卡片",
    (emptyNote.get("color") ?? "") === "#6e7681",
    `color = ${emptyNote.get("color") ?? "未设置"}`,
  );

  // 手机上跟练与我的谱编辑器改成整屏面板（窄屏媒体查询里）
  const narrowBlock = (selector) => {
    const index = css.indexOf(selector);
    if (index < 0) return "";
    const open = css.indexOf("{", index);
    const close = css.indexOf("}", open);
    return open < 0 || close < 0 ? "" : css.slice(open + 1, close);
  };
  const followNarrow = narrowBlock(".follow {\n    position: fixed");
  expect(
    "窄屏下跟练是整屏面板（fixed + 贴边）",
    followNarrow.includes("inset: 0") && followNarrow.includes("position: fixed"),
    "没找到 @media (max-width: 900px) 里 .follow 的 fixed/inset",
  );
  const editorNarrow = narrowBlock(".my-scores.editing .my-editor {\n    position: fixed");
  expect(
    "窄屏下编辑我的谱是整屏面板（fixed + 贴边）",
    editorNarrow.includes("inset: 0") && editorNarrow.includes("position: fixed"),
    "没找到 @media (max-width: 900px) 里 .my-scores.editing .my-editor 的 fixed/inset",
  );

  // 新版本提示：贴底固定，不随页面滚走
  const toast = narrowDecls(".update-toast");
  expect(
    "新版本提示固定在底部（position: fixed + bottom）",
    (toast.get("position") ?? "") === "fixed" && Boolean(toast.get("bottom")),
    `position = ${toast.get("position") ?? "未设置"}, bottom = ${toast.get("bottom") ?? "未设置"}`,
  );
  const toastButton = narrowDecls(".update-toast-refresh");
  expect(
    "新版本提示的「刷新」按钮是主按钮（有底色）",
    Boolean(toastButton.get("background")),
    `background = ${toastButton.get("background") ?? "未设置"}`,
  );

  // 撤销提示（v0.52.0）：贴底固定，「撤销」按钮手指点得到
  const undoToast = narrowDecls(".undo-toast");
  expect(
    "撤销提示固定在底部（position: fixed + bottom）",
    (undoToast.get("position") ?? "") === "fixed" && Boolean(undoToast.get("bottom")),
    `position = ${undoToast.get("position") ?? "未设置"}, bottom = ${undoToast.get("bottom") ?? "未设置"}`,
  );
  const undoButton = narrowDecls(".undo-toast-btn");
  expect(
    "撤销按钮高 40px、不折行",
    (undoButton.get("min-height") ?? "") === "40px" &&
      (undoButton.get("white-space") ?? "") === "nowrap",
    `min-height = ${undoButton.get("min-height") ?? "未设置"}, white-space = ${undoButton.get("white-space") ?? "未设置"}`,
  );

  // 先不练的（v0.55.0）：一行三格（名字 / 回来的日子 / 恢复），名字长了省略
  const pauseItem = narrowDecls(".pause-item");
  const pauseCols = pauseItem.get("grid-template-columns") ?? "";
  expect(
    "压后条目是一行三格（名字、日子、恢复）",
    (pauseItem.get("display") ?? "") === "grid" &&
      pauseCols.startsWith("minmax(0, 1fr)") &&
      pauseCols.endsWith("auto auto"),
    `display = ${pauseItem.get("display") ?? "未设置"}, columns = ${pauseCols || "未设置"}`,
  );
  const pauseName = narrowDecls(".pause-name");
  expect(
    "压后条目的名字长了省略，不把「恢复」挤出去",
    (pauseName.get("min-width") ?? "") === "0" &&
      (pauseName.get("text-overflow") ?? "") === "ellipsis",
    `min-width = ${pauseName.get("min-width") ?? "未设置"}, text-overflow = ${pauseName.get("text-overflow") ?? "未设置"}`,
  );

  // 乐理目录：12 节排成可换行的网格；手机上看单节时其余要收起来
  const tocList = narrowDecls(".lesson-toc-list");
  expect(
    "乐理目录是会自动换行的网格",
    (tocList.get("display") ?? "") === "grid" &&
      (tocList.get("grid-template-columns") ?? "").includes("auto-fill"),
    `display = ${tocList.get("display") ?? "未设置"}, columns = ${tocList.get("grid-template-columns") ?? "未设置"}`,
  );
  const hiddenLesson = narrowDecls(".theory .lesson[hidden]");
  expect(
    "手机上看单节时其余小节收起来",
    (hiddenLesson.get("display") ?? "") === "none",
    `display = ${hiddenLesson.get("display") ?? "未设置"}`,
  );

  // 统计页热力图：一列一周、一行一天；五档深浅各不相同；手机格子更小
  const heatGrid = narrowDecls(".heat-grid");
  expect(
    "热力图是一列一周的七行网格",
    (heatGrid.get("display") ?? "") === "grid" &&
      (heatGrid.get("grid-template-rows") ?? "").includes("repeat(7") &&
      (heatGrid.get("grid-auto-flow") ?? "") === "column",
    `display = ${heatGrid.get("display") ?? "未设置"}, rows = ${heatGrid.get("grid-template-rows") ?? "未设置"}`,
  );
  const heatLevels = [1, 2, 3, 4].map((level) => narrowDecls(`.heat-cell.lv${level}`).get("background") ?? "");
  expect(
    "热力图五档颜色由浅到深",
    heatLevels.every((color) => color.startsWith("rgba(232, 176, 75")) &&
      new Set(heatLevels).size === 4,
    heatLevels.join(" / "),
  );
  const heatNarrow = narrowDecls(".heat");
  expect(
    "手机上热力图的格子更小",
    px(heatNarrow.get("--heat-cell")) !== null && px(heatNarrow.get("--heat-cell")) < 13,
    `--heat-cell = ${heatNarrow.get("--heat-cell") ?? "未设置"}`,
  );

  // 本周目标：进度条是细长圆角，填充条是强调色
  const goalBar = narrowDecls(".goal-bar");
  const goalFill = narrowDecls(".goal-bar span");
  expect(
    "本周目标的进度条是细长圆角",
    px(goalBar.get("height")) !== null && px(goalBar.get("height")) <= 10 && /999px|50%/.test(goalBar.get("border-radius") ?? ""),
    `height=${goalBar.get("height") ?? "未设置"} radius=${goalBar.get("border-radius") ?? "未设置"}`,
  );
  expect(
    "本周目标的填充条是强调色",
    goalFill.get("display") === "block" && (goalFill.get("background") ?? "").includes("var(--accent)"),
    `display=${goalFill.get("display") ?? "未设置"} background=${goalFill.get("background") ?? "未设置"}`,
  );
  const goalStreak = narrowDecls(".goal-streak");
  expect(
    "「连续 N 周达成」是圆角小标签，不抢进度条的视线",
    /999px|50%/.test(goalStreak.get("border-radius") ?? "") && (px(goalStreak.get("font-size")) ?? 99) <= 12,
    `radius=${goalStreak.get("border-radius") ?? "未设置"} size=${goalStreak.get("font-size") ?? "未设置"}`,
  );

  // 练习页顶部那条：比统计页的更细，一行放得下「本周 x / y 分钟」+ 进度 + 「还差 z 分钟」
  const weekGoal = narrowDecls(".week-goal");
  const weekFill = narrowDecls(".week-goal-bar span");
  expect(
    "练习页的本周目标是一行三格",
    (weekGoal.get("display") ?? "") === "grid" && (weekGoal.get("grid-template-columns") ?? "").startsWith("auto "),
    `display=${weekGoal.get("display") ?? "未设置"} columns=${weekGoal.get("grid-template-columns") ?? "未设置"}`,
  );
  expect(
    "练习页的本周目标进度条更细",
    px(narrowDecls(".week-goal-bar").get("height")) !== null &&
      px(narrowDecls(".week-goal-bar").get("height")) <= 8 &&
      (weekFill.get("background") ?? "").includes("var(--accent)"),
    `height=${narrowDecls(".week-goal-bar").get("height") ?? "未设置"}`,
  );

  // 调音器：指针是按音分百分比定位的，轨道得能当定位基准；六根弦的按钮要够手指点
  const needle = narrowDecls(".tuner-needle");
  expect(
    "调音器的指针浮在轨道上（按音分定位）",
    (needle.get("position") ?? "") === "absolute" && needle.get("left") === undefined,
    `position=${needle.get("position") ?? "未设置"} left=${needle.get("left") ?? "(运行时给)"}`,
  );
  expect(
    "调音器的轨道是定位容器",
    (narrowDecls(".tuner-track").get("position") ?? "") === "relative",
    `position=${narrowDecls(".tuner-track").get("position") ?? "未设置"}`,
  );
  const tunerString = narrowDecls(".tuner-string");
  expect(
    "调音器六根弦的按钮不小于 40 高",
    (px(tunerString.get("min-height")) ?? 0) >= 40,
    `min-height=${tunerString.get("min-height") ?? "未设置"}`,
  );

  // 扒谱页：四节课是网格卡片，练习的四个选项要够手指点
  const earLessons = narrowDecls(".ear-lessons");
  expect(
    "扒谱页的课程是网格排列",
    (earLessons.get("display") ?? "") === "grid",
    `display=${earLessons.get("display") ?? "未设置"}`,
  );
  const earOption = narrowDecls(".ear-option");
  expect(
    "扒谱练习的选项不小于 44 高（手指点得准）",
    (px(earOption.get("min-height")) ?? 0) >= 44,
    `min-height=${earOption.get("min-height") ?? "未设置"}`,
  );
  const earPractice = narrowDecls(".ear-practice");
  expect(
    "扒谱练习区有底色，和课程卡片分得开",
    (earPractice.get("background") ?? "").includes("var(--panel-2)"),
    `background=${earPractice.get("background") ?? "未设置"}`,
  );
  expect(
    "手机上收起的课真的不占位置",
    (narrowDecls(".ear-lesson-body[hidden]").get("display") ?? "") === "none",
    `display=${narrowDecls(".ear-lesson-body[hidden]").get("display") ?? "未设置"}`,
  );

  // 听和弦（v0.76.0）
  const clName = narrowDecls(".cl-name");
  expect(
    "听和弦认出来的和弦名是大字（一眼看到）",
    (px(clName.get("font-size")) ?? 0) >= 28,
    `font-size=${clName.get("font-size") ?? "未设置"}`,
  );
  // v0.82.0：缺了哪个音要显眼（强调色），不能和「多出来的音」一样灰
  const clMissing = narrowDecls(".cl-missing b");
  expect(
    "听和弦「少了哪个音」用强调色，不和次要说明混在一起",
    (clMissing.get("color") ?? "").includes("var(--accent)"),
    `color=${clMissing.get("color") ?? "未设置"}`,
  );
  const clBar = narrowDecls(".cl-progress");
  expect(
    "听和弦的进度是细长圆角条",
    (px(clBar.get("height")) ?? 99) <= 10 && (clBar.get("border-radius") ?? "").includes("999px"),
    `height=${clBar.get("height") ?? "未设置"}`,
  );
  const clFill = narrowDecls(".cl-progress > span");
  expect(
    "听和弦的进度填充是强调色",
    (clFill.get("background") ?? "").includes("var(--accent)"),
    `background=${clFill.get("background") ?? "未设置"}`,
  );
  // v0.85.0：一段扫弦切出来的和弦，一行三段（名字 / 时间 / 性质），不能挤成一坨
  const seqItem = narrowDecls(".cl-seq-item");
  const seqCols = seqItem.get("grid-template-columns") ?? "";
  expect(
    "听和弦切出来的每一段是「名字 / 时间 / 性质」三格",
    (seqItem.get("display") ?? "") === "grid" && seqCols.includes("1fr") && seqCols.includes("auto"),
    `display=${seqItem.get("display") ?? "未设置"} columns=${seqCols || "未设置"}`,
  );
  // v0.88.0：调顺序的两个箭头也是手指点的，得够 40×40
  const seqMove = narrowDecls(".cl-seq-move-btn");
  const moveH = parseFloat(seqMove.get("min-height") ?? "0");
  const moveW = parseFloat(seqMove.get("min-width") ?? "0");
  expect(
    "切段调顺序的箭头按钮不小于 40×40",
    moveH >= 40 && moveW >= 40,
    `min-height=${seqMove.get("min-height") ?? "未设置"} min-width=${seqMove.get("min-width") ?? "未设置"}`,
  );
  // v0.88.0：存谱时的速度 / 拍号输入框也得够高
  const saveField = narrowDecls(".cl-save-field input");
  expect(
    "存和弦谱的速度 / 拍号输入框不小于 40px 高",
    parseFloat(saveField.get("min-height") ?? "0") >= 40,
    `min-height=${saveField.get("min-height") ?? "未设置"}`,
  );
  // v0.90.0：低音走线里「换了低音」的那几段要能一眼看出来
  const bassStep = narrowDecls(".cl-bass-step.alt");
  expect(
    "低音走线里换过低音的那段用强调色",
    (bassStep.get("color") ?? "").includes("var(--accent)"),
    `color=${bassStep.get("color") ?? "未设置"}`,
  );
  // v0.90.0：和弦谱的节拍标记是给眼睛扫的小字，别抢标题
  const myBeats = narrowDecls(".my-beats");
  expect(
    "和弦谱卡上的节拍标记是小号等宽数字",
    parseFloat(myBeats.get("font-size") ?? "0") <= 13 &&
      (myBeats.get("font-variant-numeric") ?? "").includes("tabular-nums"),
    `font-size=${myBeats.get("font-size") ?? "未设置"} numeric=${myBeats.get("font-variant-numeric") ?? "未设置"}`,
  );
  const voicingImg = narrowDecls(".chord-voicing-img");
  expect(
    "和弦页的六线谱图按原尺寸显示，不拉宽也不超出",
    (voicingImg.get("width") ?? "") === "auto" && (voicingImg.get("max-width") ?? "") === "100%",
    `width=${voicingImg.get("width") ?? "未设置"} max=${voicingImg.get("max-width") ?? "未设置"}`,
  );
  // v0.86.0：切段结果里每段一个「试听」，按钮不能小于 40 高
  const seqPlay = narrowDecls(".cl-seq-play");
  expect(
    "听和弦每一段的「试听」按钮够大",
    Number.parseInt(seqPlay.get("min-height") ?? "0", 10) >= 40,
    `min-height=${seqPlay.get("min-height") ?? "未设置"}`,
  );
  // v0.86.0：我的谱里和弦卡的指法图是固定小图，别跟谱抢地方
  const chordDiagram = narrowDecls(".my-chord-diagram .chord-svg");
  expect(
    "我的谱和弦卡的指法图是 132px 的小图",
    Number.parseInt(chordDiagram.get("width") ?? "0", 10) === 132,
    `width=${chordDiagram.get("width") ?? "未设置"}`,
  );

  // v0.83.0：听辨正确率曲线是个小图，别占满整行
  const earTrend = narrowDecls(".ear-trend");
  const earTrendSvg = narrowDecls(".ear-trend .curve-svg");
  expect(
    "听辨正确率曲线是一行「小图 + 一句话」，图不撑满",
    (earTrend.get("display") ?? "") === "flex" &&
      (px(earTrendSvg.get("width")) ?? 999) <= 140 &&
      (px(earTrendSvg.get("height")) ?? 999) <= 40,
    `width=${earTrendSvg.get("width") ?? "未设置"} height=${earTrendSvg.get("height") ?? "未设置"}`,
  );

  // v0.91.0：低音走线的折线是个小图；v0.96.0 起底下的折线压成灰的，颜色交给线段
  const bassChart = narrowDecls(".cl-basschart");
  const bassLine = narrowDecls(".cl-basschart polyline");
  expect(
    "低音走线是一条小折线，颜色交给线段",
    (px(bassChart.get("height")) ?? 999) <= 40 &&
      (bassLine.get("stroke") ?? "").includes("var(--muted)"),
    `height=${bassChart.get("height") ?? "未设置"} stroke=${bassLine.get("stroke") ?? "未设置"}`,
  );

  // v0.96.0：折线的线段按级数上色（1 级强调色、5 级绿色）
  const segLv1 = narrowDecls(".cl-basschart line.lv1");
  const segLv5 = narrowDecls(".cl-basschart line.lv5");
  expect(
    "低音折线的线段按级数上色",
    (segLv1.get("stroke") ?? "").includes("var(--accent)") &&
      (segLv5.get("stroke") ?? "").includes("var(--green)"),
    `lv1=${segLv1.get("stroke") ?? "未设置"} lv5=${segLv5.get("stroke") ?? "未设置"}`,
  );

  // v0.91.0：我存的进行里的谱图不能撑出卡片
  const patternImg = narrowDecls(".my-pattern .tab-score");
  expect(
    "我存的进行里的谱图有最大宽度，不会撑出卡片",
    (patternImg.get("max-width") ?? "") === "100%",
    `max-width=${patternImg.get("max-width") ?? "未设置"}`,
  );

  // v0.92.0：低音折线叠在谱上是绝对定位，不把谱撑大
  const overlay = narrowDecls(".cl-basschart-overlay");
  const overlayWrap = narrowDecls(".cl-score-wrap");
  expect(
    "低音折线叠在谱上是绝对定位，不把谱撑大",
    (overlay.get("position") ?? "") === "absolute" &&
      (overlayWrap.get("position") ?? "") === "relative",
    `overlay=${overlay.get("position") ?? "未设置"} wrap=${overlayWrap.get("position") ?? "未设置"}`,
  );

  // v0.94.0：级数是贴在和弦后面的小角标，不能抢和弦名的视线
  const degree = narrowDecls(".cl-degree");
  expect(
    "级数角标是小字号、带一点强调色底",
    Number((degree.get("font-size") ?? "99px").replace("px", "")) <= 11 &&
      (degree.get("background") ?? "").includes("rgba(232, 176, 75"),
    `font-size=${degree.get("font-size") ?? "未设置"} background=${degree.get("background") ?? "未设置"}`,
  );

  // v0.94.0：和弦谱卡改速度 / 拍号的那一行是自动换行的，手机上不挤成一条
  const timing = narrowDecls(".my-timing");
  expect(
    "改速度 / 拍号那一行会自动换行",
    (timing.get("display") ?? "") === "flex" && (timing.get("flex-wrap") ?? "") === "wrap",
    `display=${timing.get("display") ?? "未设置"} wrap=${timing.get("flex-wrap") ?? "未设置"}`,
  );

  // v0.95.0：低音点按级数着色（1 级强调色、5 级绿色、其余压暗）
  const lv1 = narrowDecls(".cl-basschart circle.lv1");
  const lv5 = narrowDecls(".cl-basschart circle.lv5");
  expect(
    "低音点按级数着色：1 级亮、5 级次亮",
    (lv1.get("fill") ?? "").includes("var(--accent)") &&
      (lv5.get("fill") ?? "").includes("var(--green)"),
    `lv1=${lv1.get("fill") ?? "未设置"} lv5=${lv5.get("fill") ?? "未设置"}`,
  );

  // v0.97.0：跟练面板里那一排级数
  const degreeRow = narrowDecls(".follow-degrees");
  const degreeOn = narrowDecls(".follow-degree-chip.on");
  expect(
    "跟练里的级数序列是一排会换行的小方块，当前那个高亮",
    (degreeRow.get("display") ?? "") === "flex" &&
      (degreeRow.get("flex-wrap") ?? "") === "wrap" &&
      (degreeOn.get("color") ?? "").includes("var(--accent)"),
    `display=${degreeRow.get("display") ?? "未设置"} wrap=${degreeRow.get("flex-wrap") ?? "未设置"} on=${degreeOn.get("color") ?? "未设置"}`,
  );

  // v0.98.0：级数方块能点（要够得着）
  const degreeChip = narrowDecls(".follow-degree-chip");
  expect(
    "跟练里的级数方块是能点的，够 40×40",
    (px(degreeChip.get("min-width")) ?? 0) >= 40 && (px(degreeChip.get("min-height")) ?? 0) >= 40,
    `min-width=${degreeChip.get("min-width") ?? "未设置"} min-height=${degreeChip.get("min-height") ?? "未设置"}`,
  );

  // v0.99.0：记完成绩那句回执要说清「最卡的是哪一小节」，所以得显眼
  const doneLine = narrowDecls(".follow-done");
  expect(
    "跟练记完成绩的回执用绿色，和错误提示区分开",
    (doneLine.get("color") ?? "").includes("var(--green)"),
    `color=${doneLine.get("color") ?? "未设置"}`,
  );

  // v0.99.0：「练完两遍自动接回整段」这句是说明文字，不能抢节拍器读数
  const loopNote = narrowDecls(".follow-loop-note");
  expect(
    "跟练里「只练几小节」的说明是小字，不抢读数",
    (px(loopNote.get("font-size")) ?? 99) <= 12,
    `font-size=${loopNote.get("font-size") ?? "未设置"}`,
  );

  // v0.100.0：最卡的那一处——卡上是强调色小字，统计页是一行一级的列表
  const myHardest = narrowDecls(".my-hardest");
  expect(
    "「我存的进行」卡上的最卡一处用强调色，一眼能看到",
    (myHardest.get("color") ?? "").includes("var(--accent)"),
    `color=${myHardest.get("color") ?? "未设置"}`,
  );
  const hardestList = narrowDecls(".hardest-list");
  expect(
    "统计页「最卡的地方」是一列网格，不是挤成一段话",
    (hardestList.get("display") ?? "") === "grid",
    `display=${hardestList.get("display") ?? "未设置"}`,
  );

  // v0.101.0：上次最卡的那一处用虚线框标出来；按条目列的那份也是一列
  const hardChip = narrowDecls(".follow-degree-chip.hard");
  expect(
    "跟练里「上次最卡的那一处」用虚线框标出来，不跟当前小节抢高亮",
    (hardChip.get("border-style") ?? "") === "dashed",
    `border-style=${hardChip.get("border-style") ?? "未设置"}`,
  );
  const hardItems = narrowDecls(".hardest-items");
  expect(
    "统计页按条目列的那份也是一列网格",
    (hardItems.get("display") ?? "") === "grid",
    `display=${hardItems.get("display") ?? "未设置"}`,
  );

  // v0.102.0：练习页那句「最近最卡的是第几级」整行是按钮；统计页的条目也是按钮
  const hardestBar = narrowDecls(".practice-hardest");
  expect(
    "练习页「最近最卡的是第几级」整行是能点的，够 40 高",
    (px(hardestBar.get("min-height")) ?? 0) >= 40 && (hardestBar.get("width") ?? "") === "100%",
    `min-height=${hardestBar.get("min-height") ?? "未设置"} width=${hardestBar.get("width") ?? "未设置"}`,
  );
  const hardestJump = narrowDecls(".hardest-jump");
  expect(
    "统计页按条目那条整行是按钮，点一下跳回那一段",
    (px(hardestJump.get("min-height")) ?? 0) >= 40 && (hardestJump.get("width") ?? "") === "100%",
    `min-height=${hardestJump.get("min-height") ?? "未设置"} width=${hardestJump.get("width") ?? "未设置"}`,
  );

  // v0.104.0：「今天自己加的」那张统计卡也能点，回练习页
  const linkCard = narrowDecls(".stat-card-link");
  expect(
    "统计页「加餐」那张卡是能点的，够 40 高",
    (px(linkCard.get("min-height")) ?? 0) >= 40 && (linkCard.get("cursor") ?? "") === "pointer",
    `min-height=${linkCard.get("min-height") ?? "未设置"} cursor=${linkCard.get("cursor") ?? "未设置"}`,
  );

  // v0.105.0：加餐的 ↑↓ 够 40×40，拖动时整块变淡
  const moveBtn = narrowDecls(".pb-move-btn");
  expect(
    "加餐的 ↑↓ 按钮够 40×40",
    (px(moveBtn.get("min-width")) ?? 0) >= 40 && (px(moveBtn.get("min-height")) ?? 0) >= 40,
    `min-width=${moveBtn.get("min-width") ?? "未设置"} min-height=${moveBtn.get("min-height") ?? "未设置"}`,
  );
  const dragging = narrowDecls(".practice-extra.dragging");
  expect(
    "拖动中的那一块会变淡，看得出在拖哪条",
    (dragging.get("opacity") ?? "") === "0.55",
    `opacity=${dragging.get("opacity") ?? "未设置"}`,
  );

  // v0.106.0：拖拽落点那条插入线用强调色，贴在块的上下边
  const dropLine = narrowDecls(".pb-drop-line");
  expect(
    "拖拽落点画一条强调色的插入线",
    dropLine.get("position") === "absolute" &&
      (dropLine.get("background") ?? "").includes("var(--accent)") &&
      dropLine.get("top") === "-1px",
    `position=${dropLine.get("position") ?? "未设置"} background=${dropLine.get("background") ?? "未设置"}`,
  );
  const dropLineAfter = narrowDecls(".pb-drop-line.after");
  expect(
    "插在后面的那条线贴下边",
    dropLineAfter.get("bottom") === "-1px" && dropLineAfter.get("top") === "auto",
    `top=${dropLineAfter.get("top") ?? "未设置"} bottom=${dropLineAfter.get("bottom") ?? "未设置"}`,
  );

  // v0.107.0：拖到末尾那条落点平时是虚线，拖上去变强调色
  const dropEnd = narrowDecls(".practice-drop-end");
  const dropEndOn = narrowDecls(".practice-drop-end.on");
  expect(
    "拖到末尾的落点是虚线框，拖上去变强调色",
    (dropEnd.get("border") ?? "").includes("dashed") &&
      (dropEndOn.get("border-color") ?? "") === "var(--accent)",
    `border=${dropEnd.get("border") ?? "未设置"} hover=${dropEndOn.get("border-color") ?? "未设置"}`,
  );

  // v0.108.0：加餐按阶段分组的小标题不能像正文一样抢眼；拿起来的那条要有强调色外框
  const extrasGroup = narrowDecls(".extras-group");
  const heldExtra = narrowDecls(".practice-extra.held");
  expect(
    "加餐的分组小标题是灰色小字，拿起来的那条有强调色外框",
    (extrasGroup.get("color") ?? "") === "var(--muted)" &&
      parseFloat(extrasGroup.get("font-size") ?? "0") <= 12 &&
      (heldExtra.get("border-color") ?? "") === "var(--accent)" &&
      extrasGroup.get("list-style") === "none",
    `group color=${extrasGroup.get("color") ?? "未设置"} size=${extrasGroup.get("font-size") ?? "未设置"} held=${heldExtra.get("border-color") ?? "未设置"}`,
  );

  // v0.108.0：归堆那几行也做成能点的行，高度够手指点
  const hardestRow = narrowDecls(".hardest-row");
  const hardestRowOn = narrowDecls('.hardest-row[aria-pressed="true"]');
  expect(
    "归堆那几行是能点的整行按钮，选中有强调色外框",
    parseFloat(hardestRow.get("min-height") ?? "0") >= 40 &&
      (hardestRow.get("cursor") ?? "") === "pointer" &&
      (hardestRowOn.get("border-color") ?? "") === "var(--accent)",
    `min-height=${hardestRow.get("min-height") ?? "未设置"} cursor=${hardestRow.get("cursor") ?? "未设置"} pressed=${hardestRowOn.get("border-color") ?? "未设置"}`,
  );

  // v0.109.0：拿起来的时候其余几条淡虚线提示可以放这儿；分组标题是 40 高的按钮；收起的整块真的不占位置
  const droppable = narrowDecls(".practice-extra.droppable");
  const groupToggle = narrowDecls(".extras-group-toggle");
  const hiddenExtra = narrowDecls(".practice-extra[hidden]");
  expect(
    "拿着一条时其余几条是淡虚线，分组标题够 40 高，收起的块不占位置",
    (droppable.get("border-style") ?? "") === "dashed" &&
      (droppable.get("border-color") ?? "").startsWith("rgba(232, 176, 75") &&
      parseFloat(groupToggle.get("min-height") ?? "0") >= 40 &&
      (hiddenExtra.get("display") ?? "") === "none",
    `droppable=${droppable.get("border-color") ?? "未设置"} toggle=${groupToggle.get("min-height") ?? "未设置"} hidden=${hiddenExtra.get("display") ?? "未设置"}`,
  );

  // v0.110.0：分组标题右边那枚「几条 · 多少分钟」是小药丸，数字不跳；第二种筛法前面有小字标签
  const groupMeta = narrowDecls(".extras-group-meta");
  const filterLabel = narrowDecls(".hardest-filter-label");
  expect(
    "分组标题的「几条 · 多少分钟」是小药丸，按阶段筛选有标签",
    (groupMeta.get("white-space") ?? "") === "nowrap" &&
      (groupMeta.get("font-variant-numeric") ?? "") === "tabular-nums" &&
      (filterLabel.get("color") ?? "") === "var(--muted)",
    `meta=${groupMeta.get("white-space") ?? "未设置"} label=${filterLabel.get("color") ?? "未设置"}`,
  );

  // v0.111.0：存下的视角是一枚圆角胶囊（里面还有删除的 ×）；跟练里「这次还点了另外 N 处」整行够 40 高
  const viewPill = narrowDecls(".view-pill");
  const viewDel = narrowDecls(".view-del");
  const spotsToggle = narrowDecls(".follow-spots-toggle");
  expect(
    "存的视角是圆角胶囊、「另外 N 处」那行够 40 高",
    (viewPill.get("border-radius") ?? "") === "999px" &&
      parseFloat(viewDel.get("min-height") ?? "0") >= 40 &&
      parseFloat(spotsToggle.get("min-height") ?? "0") >= 40,
    `pill=${viewPill.get("border-radius") ?? "未设置"} del=${viewDel.get("min-height") ?? "未设置"} spots=${spotsToggle.get("min-height") ?? "未设置"}`,
  );

  // v0.112.0：「今天这一套」存成的组合也是胶囊；起名字那个输入框够 40 高，手机上点得到
  const setPill = narrowDecls(".set-pill");
  const setName = narrowDecls(".set-name");
  const viewName = narrowDecls(".view-name");
  expect(
    "存成组合是圆角胶囊，起名字的输入框够 40 高",
    (setPill.get("border-radius") ?? "") === "999px" &&
      parseFloat(setName.get("height") ?? "0") >= 40 &&
      parseFloat(viewName.get("height") ?? "0") >= 40,
    `set=${setPill.get("border-radius") ?? "未设置"} set-name=${setName.get("height") ?? "未设置"} view-name=${viewName.get("height") ?? "未设置"}`,
  );

  // v0.113.0：「只加没练过的」是按下去的开关；「单独练过 N 次」用强调色、字号比正文小
  const setSkip = narrowDecls(".set-skip");
  const setSkipOn = narrowDecls('.set-skip[aria-pressed="true"]');
  const spotTimes = narrowDecls(".follow-spot-times");
  expect(
    "「只加没练过的」是按下去的开关，「单独练过 N 次」用强调色",
    parseFloat(setSkip.get("min-height") ?? "0") >= 40 &&
      (setSkipOn.get("color") ?? "") === "var(--accent)" &&
      (spotTimes.get("color") ?? "") === "var(--accent)" &&
      parseFloat(spotTimes.get("font-size") ?? "0") <= 12,
    `skip=${setSkip.get("min-height") ?? "未设置"} on=${setSkipOn.get("color") ?? "未设置"} times=${spotTimes.get("color") ?? "未设置"}/${spotTimes.get("font-size") ?? "未设置"}`,
  );

  // v0.114.0：加餐的「按阶段 / 按组合」两行是一条能折的行；「单独练过」那排单独一个类、chip 够 40 高
  const extraBy = narrowDecls(".extra-by");
  const spotChip = narrowDecls(".hardest-spot .chip");
  expect(
    "加餐的阶段 / 组合两行能并排折行，「单独练过」那排的 chip 够 40 高",
    (extraBy.get("display") ?? "") === "flex" &&
      (extraBy.get("flex-wrap") ?? "") === "wrap" &&
      parseFloat(spotChip.get("min-height") ?? "0") >= 40,
    `by=${extraBy.get("display") ?? "未设置"}/${extraBy.get("flex-wrap") ?? "未设置"} spot=${spotChip.get("min-height") ?? "未设置"}`,
  );

  // v0.115.0：练过的那条标题淡下去 + 一枚小标签（只淡标题，谱子和按钮不动）
  const extraDone = narrowDecls(".practice-extra.done h4");
  const doneTag = narrowDecls(".pb-done-tag");
  expect(
    "组合里练过的那条只淡标题，「今天练过」是小圆角标签",
    (extraDone.get("color") ?? "") === "var(--muted)" &&
      (doneTag.get("border-radius") ?? "") === "999px" &&
      parseFloat(doneTag.get("font-size") ?? "0") <= 12,
    `done=${extraDone.get("color") ?? "未设置"} tag=${doneTag.get("border-radius") ?? "未设置"}/${doneTag.get("font-size") ?? "未设置"}`,
  );

  // v0.116.0：「今天练过」能点（撤回），所以要去掉浏览器默认的按钮外观
  const tagButton = narrowDecls(".pb-done-tag");
  expect(
    "「今天练过」那枚标签是按钮：去掉默认边框、鼠标变手",
    (tagButton.get("border") ?? "") === "0" && (tagButton.get("cursor") ?? "") === "pointer",
    `border=${tagButton.get("border") ?? "未设置"} cursor=${tagButton.get("cursor") ?? "未设置"}`,
  );

  // v0.117.0：组合的小标题（统计页）+ 手机上标签独占一行
  const setHead = narrowDecls(".hardest-set");
  const tagNarrow = narrowDecls(".pb-done-tag");
  expect(
    "统计页的组合小标题是灰色小字，手机上「今天练过」单独占一行",
    (setHead.get("list-style") ?? "") === "none" &&
      parseFloat(setHead.get("font-size") ?? "0") <= 12 &&
      (tagNarrow.get("display") ?? "") === "block",
    `set=${setHead.get("font-size") ?? "未设置"}/${setHead.get("list-style") ?? "未设置"} tag=${tagNarrow.get("display") ?? "未设置"}`,
  );

  // v0.118.0：组合那行小标题变成了按钮（点一下只看这一套）
  const setBtn = narrowDecls(".hardest-set-btn");
  const setBtnOn = narrowDecls('.hardest-set-btn[aria-pressed="true"]');
  expect(
    "组合小标题能点：整行够 40 高、按下去用强调色",
    parseFloat(setBtn.get("min-height") ?? "0") >= 40 &&
      (setBtn.get("border") ?? "") === "0" &&
      (setBtnOn.get("color") ?? "") === "var(--accent)",
    `min-height=${setBtn.get("min-height") ?? "未设置"} border=${setBtn.get("border") ?? "未设置"} on=${setBtnOn.get("color") ?? "未设置"}`,
  );

  // v0.118.1：手机上提示条撑满宽度、文字独占一行（否则折行后缩成一条窄柱）
  const toastNarrow = narrowDecls(".undo-toast");
  const toastText = narrowDecls(".undo-toast-text");
  expect(
    "手机上提示条撑满宽度，文字不截断",
    (toastNarrow.get("flex-wrap") ?? "") === "wrap" &&
      (toastNarrow.get("left") ?? "") === "12px" &&
      String(toastText.get("flex") ?? "").replace(/\s+/g, " ").trim() === "1 1 100%",
    `toast=${toastNarrow.get("left") ?? "未设置"}/${toastNarrow.get("flex-wrap") ?? "未设置"} text=${toastText.get("flex") ?? "未设置"}`,
  );

  // v0.119.0：「这套整体卡在第几级」是灰字附注，别跟「只看这套」抢
  const setWeakDecl = narrowDecls(".hardest-set-weak");
  expect(
    "组合标题里的「整体卡在第几级」是灰色小字",
    parseFloat(setWeakDecl.get("font-size") ?? "0") <= 12 &&
      (setWeakDecl.get("color") ?? "") === "var(--muted)",
    `font-size=${setWeakDecl.get("font-size") ?? "未设置"} color=${setWeakDecl.get("color") ?? "未设置"}`,
  );

  // v0.120.0：它是能点的（够 40 高、按下去用强调色），旁边那句「练了几次」是等宽灰字
  const setMetaDecl = narrowDecls(".hardest-set-meta");
  expect(
    "「整体卡在第几级」能点，旁边「练了几次」用等宽数字",
    (setWeakDecl.get("min-height") ?? "") === "40px" &&
      (setWeakDecl.get("cursor") ?? "") === "pointer" &&
      (setMetaDecl.get("font-variant-numeric") ?? "") === "tabular-nums",
    `min-height=${setWeakDecl.get("min-height") ?? "未设置"} cursor=${setWeakDecl.get("cursor") ?? "未设置"} num=${setMetaDecl.get("font-variant-numeric") ?? "未设置"}`,
  );

  // v0.121.0 折两行 → v0.123.0 并回一行：窄屏用 flex 单行排（挤不下才自动折），
  // 触屏没有 hover，右端那个箭头得一直显形；「只看这套」四个字在窄屏收起来
  const setRowNarrow = narrowDecls(".hardest-set-row");
  const setGoNarrow = narrowDecls(".hardest-set-go");
  const setGoLongNarrow = narrowDecls(".hardest-set-go-long");
  expect(
    "手机上组合那行并回一行，右端箭头一直显形",
    (setRowNarrow.get("display") ?? "") === "flex" &&
      (setRowNarrow.get("flex-wrap") ?? "") === "wrap" &&
      (setGoNarrow.get("opacity") ?? "") === "1" &&
      (setGoLongNarrow.get("display") ?? "") === "none",
    `display=${setRowNarrow.get("display") ?? "未设置"} wrap=${setRowNarrow.get("flex-wrap") ?? "未设置"} go=${setGoNarrow.get("opacity") ?? "未设置"} long=${setGoLongNarrow.get("display") ?? "未设置"}`,
  );

  // v0.122.0：视角胶囊上顺手写「练了 N 次」（10px，不能挤掉名字）；
  // 手机上把「整体卡在」省掉，换成「第 5 级 ×6 次」——用 ::after + attr(data-short)，
  // 完整那句仍留在 DOM 里，读屏和既有断言都不受影响
  const viewMetaDecl = narrowDecls(".view-meta");
  const weakLongNarrow = narrowDecls(".hardest-set-weak-long");
  const weakShortNarrow = narrowDecls(".hardest-set-weak::after");
  expect(
    "视角胶囊上写着练了几次，手机上的弱点换成短文案",
    (viewMetaDecl.get("font-size") ?? "") === "10px" &&
      (weakLongNarrow.get("display") ?? "") === "none" &&
      String(weakShortNarrow.get("content") ?? "").includes("attr(data-short)"),
    `meta=${viewMetaDecl.get("font-size") ?? "未设置"} long=${weakLongNarrow.get("display") ?? "未设置"} short=${weakShortNarrow.get("content") ?? "未设置"}`,
  );

  // v0.123.0：「卡了几次」那排是独立的类（不混进上面两排的计数），chip 一样要够 40 高
  const countRowDecl = narrowDecls(".hardest-count");
  const countChipDecl = narrowDecls(".hardest-count .chip");
  expect(
    "「卡了几次」是第三排筛选，chip 够 40 高",
    (countRowDecl.get("display") ?? "") === "flex" &&
      (countRowDecl.get("flex-wrap") ?? "") === "wrap" &&
      (px(countChipDecl.get("min-height")) ?? 0) >= 40,
    `display=${countRowDecl.get("display") ?? "未设置"} wrap=${countRowDecl.get("flex-wrap") ?? "未设置"} chip=${countChipDecl.get("min-height") ?? "未设置"}`,
  );

  // v0.124.0：组合行上的「比上周快 / 慢」用强调色（只有变快才亮），chip 角上的条数是小药丸；
  // 手机上练习量换成「4 次 · 80 BPM · 11/18」——同样用 ::after + attr(data-short)
  const paceUpDecl = narrowDecls(".hardest-set-pace.up");
  const chipNDecl = narrowDecls(".chip-n");
  const metaLongNarrow = narrowDecls(".hardest-set-meta-long");
  const metaShortNarrow = narrowDecls(".hardest-set-meta::after");
  expect(
    "「比上周快」用强调色，chip 上的条数是小药丸，手机上练习量换短文案",
    (paceUpDecl.get("color") ?? "") === "var(--accent)" &&
      (px(chipNDecl.get("font-size")) ?? 99) <= 10 &&
      (metaLongNarrow.get("display") ?? "") === "none" &&
      String(metaShortNarrow.get("content") ?? "").includes("attr(data-short)"),
    `pace=${paceUpDecl.get("color") ?? "未设置"} chipN=${chipNDecl.get("font-size") ?? "未设置"} long=${metaLongNarrow.get("display") ?? "未设置"} short=${metaShortNarrow.get("content") ?? "未设置"}`,
  );

  // v0.125.0：一条都筛不出来的 chip 淡下去；窄屏把「比上周快 10 BPM」压成「快 10」、
  // 「只看这套」压成一个「看」字——两者都用 ::after + attr(data-short)
  const emptyChipDecl = narrowDecls(".chip-empty");
  // narrowDecls 会把基础规则与窄屏块合并，所以这里读到的是「窄屏下的有效值」
  const goShortNarrow = narrowDecls(".hardest-set-go-short");
  const paceLongNarrow = narrowDecls(".hardest-set-pace-long");
  const paceShortNarrow = narrowDecls(".hardest-set-pace::after");
  expect(
    "一条都筛不出来的 chip 淡下去，手机上「快 10」「看 →」用短文案",
    (emptyChipDecl.get("opacity") ?? "") === "0.55" &&
      (goShortNarrow.get("display") ?? "") === "inline" &&
      (paceLongNarrow.get("display") ?? "") === "none" &&
      String(paceShortNarrow.get("content") ?? "").includes("attr(data-short)"),
    `empty=${emptyChipDecl.get("opacity") ?? "未设置"} goShort=${goShortNarrow.get("display") ?? "未设置"} paceLong=${paceLongNarrow.get("display") ?? "未设置"} paceShort=${paceShortNarrow.get("content") ?? "未设置"}`,
  );

  // v0.126.0：胶囊上那枚「快 26」是等宽小字（变快才亮）；筛空了那句是灰色说明，不该抢眼
  const viewPaceDecl = narrowDecls(".view-pace");
  const hardestEmptyDecl = narrowDecls(".hardest-empty");
  expect(
    "视角胶囊上的「快 26」是等宽小字，筛空了那句是灰色说明",
    (px(viewPaceDecl.get("font-size")) ?? 99) <= 10 &&
      viewPaceDecl.get("font-variant-numeric") === "tabular-nums" &&
      (viewPaceDecl.get("color") ?? "") === "var(--muted)" &&
      (narrowDecls(".view-pace.up").get("color") ?? "") === "var(--accent)" &&
      (hardestEmptyDecl.get("color") ?? "") === "var(--muted)" &&
      (px(hardestEmptyDecl.get("font-size")) ?? 99) <= 12,
    `pace=${viewPaceDecl.get("font-size") ?? "未设置"} empty=${hardestEmptyDecl.get("color") ?? "未设置"}/${hardestEmptyDecl.get("font-size") ?? "未设置"}`,
  );

  // v0.127.0：「练了 N 次」能点（去掉默认边框、够 40 高）；空结果那个「放宽一档」是小药丸
  const setMetaBtnDecl = narrowDecls(".hardest-set-meta");
  const emptyActionDecl = narrowDecls(".hardest-empty-action");
  expect(
    "「练了 N 次」能点，「放宽一档」是小药丸",
    setMetaBtnDecl.get("border") === "0" &&
      (px(setMetaBtnDecl.get("min-height")) ?? 0) >= 40 &&
      setMetaBtnDecl.get("cursor") === "pointer" &&
      (px(emptyActionDecl.get("min-height")) ?? 0) >= 40 &&
      emptyActionDecl.get("border-radius") === "999px",
    `meta=${setMetaBtnDecl.get("min-height") ?? "未设置"} cursor=${setMetaBtnDecl.get("cursor") ?? "未设置"} action=${emptyActionDecl.get("min-height") ?? "未设置"}/${emptyActionDecl.get("border-radius") ?? "未设置"}`,
  );

  // v0.128.0：曲线点得动（鼠标变手）；选中的那一天占满整行，不把三列网格挤歪
  const curveHitDecl = narrowDecls(".curve-list .curve-svg");
  const curveDayDecl = narrowDecls(".curve-day");
  const relaxNoteDecl = narrowDecls(".hardest-relax");
  expect(
    "曲线点得动，选中的那天占满整行",
    curveHitDecl.get("cursor") === "pointer" &&
      (curveDayDecl.get("grid-column") ?? "") === "1 / -1" &&
      (relaxNoteDecl.get("color") ?? "") === "var(--accent)" &&
      (px(relaxNoteDecl.get("font-size")) ?? 99) <= 12,
    `cursor=${curveHitDecl.get("cursor") ?? "未设置"} day=${curveDayDecl.get("grid-column") ?? "未设置"} relax=${relaxNoteDecl.get("color") ?? "未设置"}`,
  );

  // v0.129.0：最卡那一天的圈只是描边，不填满——它和「选中的点」会叠在一起
  const hardDotDecl = narrowDecls(".curve-hard");
  expect(
    "最卡那天的点画成空心圈",
    hardDotDecl.get("fill") === "none" &&
      (hardDotDecl.get("stroke") ?? "") === "var(--accent)" &&
      Number.parseFloat(hardDotDecl.get("stroke-width") ?? "9") <= 1.5,
    `fill=${hardDotDecl.get("fill") ?? "未设置"} stroke=${hardDotDecl.get("stroke") ?? "未设置"} width=${hardDotDecl.get("stroke-width") ?? "未设置"}`,
  );

  // v0.130.0：圈上「卡了几次」是小字、先描一圈底色（压在折线上也看得清）；
  // 单独放大那一小节用虚线圆角框，谱图拉满这块宽度
  const hardCountDecl = narrowDecls(".curve-hard-n");
  const zoomBoxDecl = narrowDecls(".follow-zoom");
  const zoomFluidDecl = narrowDecls(".follow-zoom .tab-score.fluid");
  expect(
    "圈上的次数是小字带底色，放大那一小节是虚线框里拉满的谱",
    (px(hardCountDecl.get("font-size")) ?? 99) <= 7 &&
      String(hardCountDecl.get("paint-order") ?? "") === "stroke" &&
      (hardCountDecl.get("stroke") ?? "") === "#0d1117" &&
      String(zoomBoxDecl.get("border") ?? "").includes("dashed") &&
      (px(zoomBoxDecl.get("border-radius")) ?? 0) >= 8 &&
      (zoomFluidDecl.get("width") ?? "") === "100%",
    `count=${hardCountDecl.get("font-size") ?? "未设置"}/${hardCountDecl.get("paint-order") ?? "未设置"} zoom=${zoomBoxDecl.get("border") ?? "未设置"} fluid=${zoomFluidDecl.get("width") ?? "未设置"}`,
  );

  // v0.131.0：放大块里那三个小按钮够高；圈上的小字有块透明命中区（空心圈只有 1px 描边）
  const zoomBtnDecl = narrowDecls(".follow-zoom .btn-quiet");
  const hitDecl = narrowDecls(".curve-hard-hit");
  expect(
    "放大块的小按钮够 40 高，圈上的小字有透明命中区",
    (px(zoomBtnDecl.get("min-height")) ?? 0) >= 40 &&
      String(hitDecl.get("fill") ?? "") === "transparent",
    `btn=${zoomBtnDecl.get("min-height") ?? "未设置"} hit=${hitDecl.get("fill") ?? "未设置"}`,
  );

  // v0.132.0：放大块标题边上的「上次最卡 / 单独练过」是灰色小字，窄屏各占一行
  const zoomNoteDecl = narrowDecls(".follow-zoom-note");
  expect(
    "放大块的「上次最卡 / 单独练过」是小字，手机上各占一行",
    (px(zoomNoteDecl.get("font-size")) ?? 99) <= 12 &&
      String(zoomNoteDecl.get("color") ?? "") === "var(--muted)" &&
      String(zoomNoteDecl.get("display") ?? "") === "block" &&
      String(zoomNoteDecl.get("white-space") ?? "") === "normal",
    `note=${zoomNoteDecl.get("font-size") ?? "未设置"}/${zoomNoteDecl.get("display") ?? "未设置"}/${zoomNoteDecl.get("white-space") ?? "未设置"}`,
  );

  // v0.133.0：试听时「正在响：第 N 弦」那几枚是小圆片
  const nowDecl = narrowDecls(".follow-zoom-now");
  const nowChipDecl = narrowDecls(".follow-zoom-note-chip");
  expect(
    "试听时「正在响」那行能折行，弦号是强调色小圆片",
    String(nowDecl.get("display") ?? "") === "flex" &&
      String(nowDecl.get("flex-wrap") ?? "") === "wrap" &&
      (px(nowChipDecl.get("border-radius")) ?? 0) >= 999 &&
      String(nowChipDecl.get("color") ?? "") === "var(--accent)",
    `row=${nowDecl.get("display") ?? "未设置"}/${nowDecl.get("flex-wrap") ?? "未设置"} chip=${nowChipDecl.get("border-radius") ?? "未设置"}/${nowChipDecl.get("color") ?? "未设置"}`,
  );
}

console.log(`\n${checked - failures.length}/${checked} 项通过`);
if (failures.length) {
  console.log(`失败：${failures.join("、")}`);
  process.exit(1);
}
