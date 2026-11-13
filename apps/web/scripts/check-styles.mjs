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
}

console.log(`\n${checked - failures.length}/${checked} 项通过`);
if (failures.length) {
  console.log(`失败：${failures.join("、")}`);
  process.exit(1);
}
