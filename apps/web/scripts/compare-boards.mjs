/**
 * 板书对照图：左边放视频截图的板书，右边放我们渲染出来的谱，一条一行。
 *
 * 为什么要有这个：转录视频板书时最容易犯的错是"看着对、其实不对"——
 * 之前两次都是（把十六分压成八分、符梁画成两层）。有了这张图，
 * 板书和我画的谱贴在一起，错一眼就能看出来，不用来回翻。
 *
 *   pnpm dev                                   # 另开一个终端
 *   pnpm run compare:boards                    # 输出 .tmp/boards.png
 *   GUITAR_VIDEO_DIR=D:\path\guitar pnpm run compare:boards
 *
 * 找不到视频工程目录时，只拼我们自己的谱（退化成"谱面总览"），不报错。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const URL = process.argv[2] ?? process.env.UI_URL ?? "http://127.0.0.1:5173/";
const OUT_DIR = join(ROOT, ".tmp");
const VIDEO_DIR =
  process.env.GUITAR_VIDEO_DIR ??
  "C:\\Users\\wangzhidan\\Documents\\deepseek-harness\\default-workspace\\guitar";

/** 练习编号 → 视频截图。7 与 9 的板书没被抽样到（同一块板连着讲了两条）。 */
const SLIDES = {
  1: "55_44m39s.jpg",
  2: "56_45m05s.jpg",
  3: "58_45m51s.jpg",
  4: "59_46m13s.jpg",
  5: "60_46m44s.jpg",
  6: "62_47m06s.jpg",
  7: "63_47m26s.jpg",
  8: "64_47m51s.jpg",
  9: "65_48m29s.jpg",
  10: "66_49m12s.jpg",
  11: "67_49m50s.jpg",
  12: "68_50m08s.jpg",
  13: "69_50m42s.jpg",
  14: "70_51m09s.jpg",
  15: "71_51m52s.jpg",
  16: "72_52m19s.jpg",
  17: "73_52m40s.jpg",
  18: "74_52m58s.jpg",
  19: "75_53m29s.jpg",
  20: "76_53m59s.jpg",
  21: "77_54m26s.jpg",
  22: "78_54m58s.jpg",
  23: "79_55m26s.jpg",
  24: "80_55m46s.jpg",
};

/** Windows 上 npm 只给 .cmd 壳，Node 不允许直接 exec，要顺着它找到真 exe。 */
function resolveBrowser() {
  if (process.env.AGENT_BROWSER_BIN) return process.env.AGENT_BROWSER_BIN;
  if (process.platform !== "win32") return "agent-browser";
  const exe = `agent-browser-win32-${process.arch}.exe`;
  const candidates = [];
  try {
    const shim = execFileSync("where", ["agent-browser.cmd"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)[0];
    if (shim) candidates.push(join(dirname(shim), "node_modules", "agent-browser", "bin", exe));
  } catch {
    // 没装就没装，下面会提示
  }
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (root) candidates.push(join(root, "nodejs", "node_modules", "agent-browser", "bin", exe));
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

const BIN = resolveBrowser();
if (!BIN) {
  console.log("跳过：没装 agent-browser（npm i -g agent-browser && agent-browser install）");
  process.exit(0);
}

try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.log(`跳过：${URL} 打不开（先运行 pnpm dev）`);
  process.exit(0);
}

let SESSION = "compare-boards";
const ab = (args) =>
  execFileSync(BIN, [...args, "--session", SESSION], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 90_000,
  }).trim();

const id = ab(["session", "id", "--scope", "worktree", "--prefix", "compare"]);
if (id) SESSION = id;

ab(["open", URL]);
// 新手引导会挡住整页
ab(["eval", "[...document.querySelectorAll('.onboard button')].at(-1)?.click() ?? null"]);
ab([
  "eval",
  "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
]);

// 取每条扫弦练习的谱（SVG 原样）和标题
const raw = ab([
  "eval",
  `JSON.stringify([...[...document.querySelectorAll('.drill-grid')][2].querySelectorAll('.drill-card')].map((card) => ({
      no: Number((card.querySelector('h4')?.innerText ?? '').match(/练习\\s*(\\d+)/)?.[1] ?? 0),
      title: card.querySelector('h4')?.innerText ?? '',
      figure: card.querySelector('.rhythm-focus')?.innerText ?? '',
      svg: card.querySelector('svg')?.outerHTML ?? '',
    })))`,
]);
// agent-browser 把结果按 JSON 打印，字符串会多一层引号
let rows = JSON.parse(raw);
if (typeof rows === "string") rows = JSON.parse(rows);

const css = readFileSync(join(ROOT, "apps", "web", "src", "styles.css"), "utf8");
const hasVideo = existsSync(join(VIDEO_DIR, "slides"));

const cells = rows.map((row) => {
  const slide = SLIDES[row.no];
  const path = slide ? join(VIDEO_DIR, "slides", slide) : null;
  const board =
    hasVideo && path && existsSync(path)
      ? `<img class="board" src="data:image/jpeg;base64,${readFileSync(path).toString("base64")}" alt="板书">`
      : `<p class="missing">${hasVideo ? "这一条没有截图" : "没找到视频工程目录"}</p>`;
  return `
  <section class="row">
    <div class="board-cell">${board}</div>
    <div class="ours-cell">
      <h2>${row.title}</h2>
      <p class="figure">${row.figure}</p>
      ${row.svg}
    </div>
  </section>`;
});

mkdirSync(OUT_DIR, { recursive: true });
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>扫弦练习对照</title>
<style>
${css}
body { background:#0d1117; color:#e6edf3; padding:16px; font-family: system-ui, sans-serif; }
.row { display:grid; grid-template-columns: 1fr 1fr; gap:16px; align-items:center;
  border-bottom:1px solid #30363d; padding:12px 0; break-inside: avoid; }
.board { width:100%; height:auto; border-radius:8px; background:#fff; }
.missing { color:#8b949e; font-size:13px; }
.ours-cell h2 { font-size:15px; margin:0 0 4px; }
.figure { font-size:12px; color:#8b949e; margin:0 0 8px; }
.ours-cell svg { max-width:100%; height:auto; }
</style></head><body>${cells.join("\n")}</body></html>`;

const htmlPath = join(OUT_DIR, "boards.html");
const pngPath = join(OUT_DIR, "boards.png");
writeFileSync(htmlPath, html, "utf8");

ab(["open", `file:///${htmlPath.replace(/\\/g, "/")}`]);
ab(["screenshot", pngPath, "--full"]);
ab(["close"]);

console.log(
  `已生成对照图：\n  ${pngPath}\n  ${htmlPath}${
    hasVideo ? "" : "\n（没找到视频工程目录，图里只有我们自己的谱；用 GUITAR_VIDEO_DIR 指过去就有板书）"
  }`,
);
