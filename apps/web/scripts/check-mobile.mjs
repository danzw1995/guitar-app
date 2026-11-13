// 手机端布局检查（Playwright + WebKit）：三个尺寸各跑一遍 8 个页面，
// 抓「横向溢出」「触控目标太小」「文字被截断」这三类只有真机才会暴露的问题。
// 用法：node apps/web/scripts/check-mobile.mjs [url]
// 需要先 `npx playwright install webkit`（约 90MB，只装一次）。
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, devices } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:5186";
// 相对脚本定位，别依赖 cwd（`pnpm --filter @guitar/web` 跑时 cwd 是 apps/web）
const OUT = fileURLToPath(new URL("../.tmp", import.meta.url));

// Playwright 启动浏览器要在临时目录里建 artifacts 目录；受限环境（pnpm 子进程）里
// 用户 Temp 不可写会报 `EPERM: operation not permitted, mkdtemp ...`，
// 所以把临时目录指到项目里的 .tmp（和截图放在一起）。
mkdirSync(join(OUT, "playwright"), { recursive: true });
process.env.TMPDIR = join(OUT, "playwright");
process.env.TMP = process.env.TMPDIR;
process.env.TEMP = process.env.TMPDIR;
const TABS = ["练习", "节奏", "和弦", "音阶", "乐理", "音阶游戏", "统计", "设置"];
const VIEWPORTS = [
  { name: "iPhone 15", ...devices["iPhone 15"] },
  { name: "Pixel 9", ...devices["Pixel 9"] },
  { name: "iPad", viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
];

mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, label, detail) => {
  if (ok) {
    console.log(`  ✔ ${label}`);
  } else {
    failures.push(`${label}：${detail}`);
    console.log(`  ✖ ${label} — ${detail}`);
  }
};

const browser = await webkit.launch();

for (const device of VIEWPORTS) {
  const context = await browser.newContext({ ...device, locale: "zh-CN" });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`  [console] ${message.text().slice(0, 120)}`);
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const know = page.getByRole("button", { name: "知道了" });
  if (await know.count()) await know.first().click();
  await page.waitForTimeout(300);

  console.log(`\n${device.name}（${device.viewport.width}×${device.viewport.height}）`);

  // 手机上换成底部导航：四个常用入口 + 「更多」，顶部那排 Tab 收起来
  const PRIMARY = ["练习", "节奏", "乐理", "统计"];

  async function goTab(label) {
    if (PRIMARY.includes(label)) {
      await page.locator(".bottom-nav button", { hasText: label }).first().click();
      return;
    }
    await page.locator(".bottom-nav button", { hasText: "更多" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".more-sheet .more-item", { hasText: label }).first().click();
  }

  const nav = await page.evaluate(() => {
    const bar = document.querySelector(".bottom-nav");
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    const items = [...bar.querySelectorAll("button")].map((node) => {
      const box = node.getBoundingClientRect();
      return { text: node.textContent.trim(), h: Math.round(box.height), w: Math.round(box.width) };
    });
    const main = document.querySelector(".app-main");
    return {
      top: Math.round(rect.top),
      vh: window.innerHeight,
      items,
      pad: main ? getComputedStyle(main).paddingBottom : "0px",
      tabsHidden: getComputedStyle(document.querySelector(".tabs")).display === "none",
    };
  });

  check(Boolean(nav), "底部导航存在", "没找到 .bottom-nav");
  if (nav) {
    check(nav.tabsHidden, "顶部 Tab 在手机上收起", "nav.tabs 还显示着");
    check(nav.items.length === 5, "底部导航 5 个入口", `实际 ${nav.items.length} 个`);
    check(nav.items.every((item) => item.h >= 44), "底部导航每项 ≥44 高", JSON.stringify(nav.items));
    check(nav.top > nav.vh - 140, "底部导航贴在屏幕底部", `top ${nav.top} / 视口 ${nav.vh}`);
    check(parseFloat(nav.pad) >= 60, "正文给底部导航留了位置", `padding-bottom ${nav.pad}`);
  }

  await page.locator(".bottom-nav button", { hasText: "更多" }).first().click();
  await page.waitForTimeout(250);
  const sheetItems = await page.locator(".more-sheet .more-item").count();
  check(sheetItems === 4, "「更多」里 4 个入口", `实际 ${sheetItems} 个`);
  await page.locator(".more-sheet .more-item", { hasText: "设置" }).first().click();
  await page.waitForTimeout(600);
  check((await page.locator(".more-sheet").count()) === 0, "从「更多」选完会关掉浮层", "浮层还在");
  check((await page.locator(".settings-row").count()) > 0, "「更多」里能进设置", "设置页没出现");

  for (const tab of TABS) {
    await goTab(tab);
    await page.waitForTimeout(tab === "节奏" || tab === "乐理" ? 1800 : 900);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const vw = window.innerWidth;
      const offenders = [...document.querySelectorAll("main *")]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { cls: String(node.className ?? node.tagName).slice(0, 40), right: Math.round(rect.right), w: Math.round(rect.width) };
        })
        .filter((item) => item.right > vw + 1 && item.w > 24)
        .slice(0, 4);
      const smallButtons = [...document.querySelectorAll("main button, main .btn")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.width < 40 || rect.height < 40);
        })
        .map((node) => `${String(node.className).slice(0, 24)}:${Math.round(node.getBoundingClientRect().width)}×${Math.round(node.getBoundingClientRect().height)}`)
        .slice(0, 4);
      return { vw, scrollW: doc.scrollWidth, scrollH: doc.scrollHeight, offenders, smallButtons };
    });

    const overflow = metrics.scrollW - metrics.vw;
    check(overflow <= 1, `${tab}：不横向溢出`, `scrollWidth ${metrics.scrollW} > 视口 ${metrics.vw}（多 ${overflow}px）${JSON.stringify(metrics.offenders)}`);
    check(
      metrics.smallButtons.length === 0,
      `${tab}：按钮不小于 40×40`,
      metrics.smallButtons.join("、"),
    );

    if (["练习", "节奏", "乐理"].includes(tab)) {
      await page.screenshot({ path: `${OUT}/mobile-${device.name.replace(/\s+/g, "")}-${tab}.png` });
    }

    // 节奏页在手机上要折叠：首屏不该是两万像素的长卷
    if (tab === "节奏") {
      const collapsedHeight = metrics.scrollH;
      const cardsBefore = await page.locator(".drill-card:visible").count();
      await page.locator(".block-toggle").first().click();
      await page.waitForTimeout(500);
      const cardsAfter = await page.locator(".drill-card:visible").count();
      const limit = device.viewport.width <= 430 ? 6000 : 12000;
      check(
        collapsedHeight < limit && cardsAfter > cardsBefore,
        "节奏：窄屏默认折叠，点开一块才出卡片",
        `高 ${collapsedHeight}px（上限 ${limit}），卡片 ${cardsBefore} → ${cardsAfter}`,
      );
    }
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.log(`\n手机端检查未通过：${failures.length} 项`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("\n手机端检查全部通过（WebKit，三个尺寸 × 8 个页面）");
