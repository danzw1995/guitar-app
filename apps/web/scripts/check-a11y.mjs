/**
 * 可访问性 / 兜底的**静态**检查。
 *
 *   node apps/web/scripts/check-a11y.mjs
 *
 * 它证明"这些属性和结构还在源码里"，**不证明真实的读屏体验或对比度**——
 * 那需要人在浏览器 + 读屏软件里过一遍。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(APP, p), "utf8");

let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (error) {
    failed++;
    console.log(`✖ ${label}\n    ${error.message}`);
  }
};

const expect = (source, needles, file) => {
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${file} 里缺少 ${needle}`);
  }
};

check("index.html：语言、视口、标题", () => {
  const html = read("index.html");
  expect(html, ['lang="zh-CN"', 'name="viewport"', "<title>"], "index.html");
});

check("App：跳转链接 + 主区域 + 导航语义", () => {
  const src = read("src/App.tsx");
  expect(
    src,
    ['className="skip-link"', 'href="#main"', 'id="main"', 'aria-label="主导航"', "aria-current"],
    "src/App.tsx",
  );
  if (!src.includes("tabIndex={-1}")) throw new Error("主区域应可编程聚焦（tabIndex={-1}）");
});

check("App：挂了离线提示，main.tsx 挂了错误边界", () => {
  expect(read("src/App.tsx"), ["<OfflineBanner"], "src/App.tsx");
  expect(read("src/main.tsx"), ["<ErrorBoundary>"], "src/main.tsx");
});

check("指板：每格有 aria-label 和 data-cell，装饰性 SVG 对读屏隐藏", () => {
  const src = read("src/components/Fretboard.tsx");
  expect(src, ["aria-label={", "cellAriaLabel", "data-cell={"], "Fretboard.tsx");
  const svg = src.slice(src.indexOf("<svg"));
  if (!svg.slice(0, 300).includes('aria-hidden="true"')) {
    throw new Error("指板 SVG 应 aria-hidden（信息由按钮承载）");
  }
});

check("选音器：dialog 语义 + 焦点管理", () => {
  const src = read("src/components/NotePicker.tsx");
  expect(
    src,
    ['role="dialog"', 'aria-modal="true"', "aria-label=", "firstNoteRef.current?.focus()"],
    "NotePicker.tsx",
  );
  if (!src.includes("previous?.focus?.()")) throw new Error("关闭时应把焦点还给原元素");
});

check("错误边界与离线条有合适的 ARIA 角色", () => {
  expect(read("src/components/ErrorBoundary.tsx"), ['role="alert"'], "ErrorBoundary.tsx");
  expect(
    read("src/components/OfflineBanner.tsx"),
    ['role="status"', 'aria-live="polite"'],
    "OfflineBanner.tsx",
  );
});

check("统计页有空状态提示", () => {
  expect(read("src/pages/Stats.tsx"), ['className="empty-hint"'], "Stats.tsx");
});

check("新手引导：dialog 语义、焦点与 Esc 关闭", () => {
  const src = read("src/components/Onboarding.tsx");
  expect(
    src,
    ['role="dialog"', 'aria-modal="true"', "firstButtonRef.current?.focus()", '"Escape"'],
    "Onboarding.tsx",
  );
  if (!src.includes("previous?.focus?.()")) throw new Error("关闭时应把焦点还给原元素");
  if (!src.includes("guitar.onboarded.v1")) throw new Error("缺少「只看一次」的标记键");
  expect(read("src/App.tsx"), ["<Onboarding"], "src/App.tsx");
  expect(read("src/pages/Settings.tsx"), ["再看一遍新手引导", "resetOnboarding"], "Settings.tsx");
});

check("乐理：示意图对读屏有说明、练习弹层有 dialog 语义", () => {
  const piano = read("src/components/PianoStrip.tsx");
  const strip = read("src/components/StringStrip.tsx");
  const map = read("src/components/ScaleMap.tsx");
  for (const [name, src] of [
    ["PianoStrip.tsx", piano],
    ["StringStrip.tsx", strip],
    ["ScaleMap.tsx", map],
  ]) {
    expect(src, ['role="img"', "aria-label"], name);
  }
  const theory = read("src/pages/Theory.tsx");
  expect(theory, ["lesson-lead", "lesson-guitar"], "Theory.tsx");
  const game = read("src/components/TheoryGame.tsx");
  expect(
    game,
    [
      'role="dialog"',
      'aria-modal="true"',
      "aria-label=",
      'role="status"',
      "<Fretboard",
      '"Escape"',
      "ArrowRight",
      "modalRef.current?.querySelector",
    ],
    "TheoryGame.tsx",
  );
});

check("节奏：格子对读屏有整小节说明，节拍器的每个控件都有标签", () => {
  const strip = read("src/components/RhythmStrip.tsx");
  expect(strip, ['role="img"', "aria-label={`", 'aria-hidden="true"'], "RhythmStrip.tsx");

  const metro = read("src/components/Metronome.tsx");
  expect(
    metro,
    [
      'role="status"',
      'aria-label="速度（每分钟拍数）"',
      'aria-label="拍号"',
      'aria-label="每拍几下"',
      'type="range"',
    ],
    "Metronome.tsx",
  );
  // 拍点是纯装饰：不能让读屏每秒念一次
  const dots = metro.slice(metro.indexOf('className="metro-dots"'));
  if (!dots.slice(0, 120).includes('aria-hidden="true"')) {
    throw new Error("节拍点闪烁属于装饰，应 aria-hidden");
  }
  if (!metro.includes("window.clearInterval")) {
    throw new Error("停止时要清掉排程定时器，否则后台一直在响");
  }
});

check("练习页：进度条语义、计时器与按钮状态", () => {
  const src = read("src/pages/Practice.tsx");
  expect(
    src,
    [
      'role="progressbar"',
      "aria-valuenow={doneCount}",
      "aria-valuemax={session.blocks.length}",
      'aria-label="今天能练多少分钟"',
      'aria-label="练习阶段"',
      'role="timer"',
      "aria-pressed={running}",
      "<details",
      "<summary>",
    ],
    "Practice.tsx",
  );
  // 计时器每秒变化：不能设成礼貌播报，否则读屏会被刷屏
  if (!src.includes('aria-live="off"')) {
    throw new Error("计时器不应 aria-live 播报");
  }
  expect(read("src/lib/storage.ts"), ["guitar.practice.v1", "isValidDateKey"], "storage.ts");
});

check("六线谱：整张谱对读屏是一句话，练习页真的挂了谱子", () => {
  const tab = read("src/components/TabDiagram.tsx");
  expect(
    tab,
    ['role="img"', "aria-label={scene.ariaLabel}", "<figcaption", "layoutTab"],
    "TabDiagram.tsx",
  );

  const layout = read("src/lib/tab-layout.ts");
  expect(layout, ["ariaLabel", "六线谱", "tab-string"], "tab-layout.ts");

  const practice = read("src/pages/Practice.tsx");
  expect(practice, ["<TabDiagram", "<TabDiagram tab={drill.tab} />"], "Practice.tsx");
  expect(practice, ['aria-label="练习阶段"', "aria-current"], "Practice.tsx");
});

check("样式：跳转链接聚焦可见、尊重「减少动态效果」", () => {
  const css = read("src/styles.css");
  expect(css, [".skip-link:focus-visible", "prefers-reduced-motion"], "styles.css");
  if (!css.includes("transition-duration: 0.01ms")) {
    throw new Error("prefers-reduced-motion 里应把 transition 归零");
  }
});

if (failed > 0) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\n静态结构检查通过（真实读屏 / 对比度仍需人工验收）");
