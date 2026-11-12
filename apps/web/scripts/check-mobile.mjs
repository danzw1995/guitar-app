// 手机端布局检查（Playwright + WebKit）：三个尺寸各跑一遍 8 个页面，
// 抓「横向溢出」「触控目标太小」「文字被截断」这三类只有真机才会暴露的问题。
// 用法：node apps/web/scripts/check-mobile.mjs [url]
// 需要先 `npx playwright install webkit`（约 90MB，只装一次）。
import { mkdirSync } from "node:fs";
import { webkit, devices } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:5186";
const OUT = "apps/web/.tmp";
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

  for (const tab of TABS) {
    const button = page.locator("nav.tabs button", { hasText: tab }).first();
    if (!(await button.count())) continue;
    await button.click();
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
