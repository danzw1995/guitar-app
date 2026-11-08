/**
 * 浏览器端的冒烟检查：真的打开页面、真的点按钮。
 *
 * 静态检查（check:styles / check:tab / check:a11y）只能证明"代码里写了什么"，
 * 证明不了"页面上真的能点"。这里用 agent-browser 驱动一个真 Chrome：
 * 切到「节奏」页 → 数卡片 → 点「跟练」→ 面板出现 → 点「收起」→ 面板消失 →
 * 顺便把控制台报错抓出来。
 *
 *   pnpm dev                                   # 另开一个终端
 *   node apps/web/scripts/check-ui.mjs [url]
 *
 * 没装 agent-browser 或页面没起来时，只提示一句然后跳过（不挡 CI）。
 * 换浏览器入口：环境变量 AGENT_BROWSER_BIN。
 *
 * Windows 上如果经由 `pnpm run check:ui` 起，agent-browser 可能报
 * 「Socket directory '...\.agent-browser' is not writable」——是沙箱不让孩子进程写用户目录，
 * 直接用 `node apps/web/scripts/check-ui.mjs <url>` 跑就正常。
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const URL = process.argv[2] ?? process.env.UI_URL ?? "http://127.0.0.1:5173/";

let failed = 0;
const log = (ok, label, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✖"} ${label}${extra ? `\n    ${extra}` : ""}`);
};

/**
 * Windows 上 npm 只给了 .cmd / .ps1 壳，Node 18+ 不允许直接 exec .cmd（EINVAL），
 * 所以顺着 .cmd 找到真正的可执行文件再调。
 */
function resolveBin() {
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
    // where 也找不到就试默认安装位置
  }
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (root) candidates.push(join(root, "nodejs", "node_modules", "agent-browser", "bin", exe));
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

const BIN = resolveBin();
if (!BIN) {
  console.log(
    "跳过浏览器冒烟检查：没装 agent-browser（npm i -g agent-browser && agent-browser install）",
  );
  process.exit(0);
}

/** 调一次 agent-browser；失败返回 `{ error }`，不抛。 */
function ab(args) {
  try {
    return execFileSync(BIN, [...args, "--session", SESSION], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    }).trim();
  } catch (error) {
    if (error.code === "ENOENT") return { error: "ENOENT" };
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    return { error: out || error.message };
  }
}

const js = (code) => ab(["eval", code]);

let SESSION = "ui-check";
const id = ab(["session", "id", "--scope", "worktree", "--prefix", "ui-check"]);
if (typeof id === "string" && id) SESSION = id;

// 页面没起来就别开浏览器干等
try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.log(`跳过浏览器冒烟检查：${URL} 打不开（先运行 pnpm dev，或把地址作为参数传进来）`);
  process.exit(0);
}

const opened = ab(["open", URL]);
if (opened && typeof opened === "object" && opened.error) {
  console.log(`跳过浏览器冒烟检查：agent-browser 打不开浏览器\n    ${opened.error}`);
  process.exit(0);
}

try {
  // 1) 首次打开有新手引导，会挡住所有交互——真实用户也会先遇到它
  if (js("!!document.querySelector('.onboard')") === "true") {
    js("[...document.querySelectorAll('.onboard button')].at(-1)?.click() ?? null");
    const gone = js("!!document.querySelector('.onboard')");
    log(gone === "false", "新手引导能关掉（它盖住了整页）");
  }

  // 2) 主导航 8 个 Tab，能切到「节奏」
  const tabs = js("document.querySelectorAll('nav.tabs button').length");
  log(tabs === "8", `主导航有 8 个 Tab（读到 ${tabs}）`);

  const switched = js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  log(switched === '"ok"', "能切到「节奏」页", switched === '"ok"' ? "" : String(switched));

  // 3) 节奏页五块内容：跟读 16 + 时值 10 + 扫弦 24 + 扫弦型 12 + 风格 6 = 68
  const cards = js("document.querySelectorAll('.drill-card').length");
  log(cards === "68", `节奏页 5 块内容共 68 张卡（读到 ${cards}）`);

  const strum = js(
    "(() => { const g = [...document.querySelectorAll('.drill-grid')][2]; return g ? g.querySelectorAll('.drill-card').length : -1; })()",
  );
  log(strum === "24", `扫弦练习 24 条（读到 ${strum}）`);

  const first = js(
    "(() => { const g = [...document.querySelectorAll('.drill-grid')][2]; const t = g?.querySelector('.drill-card')?.innerText ?? ''; return t.split('\\n').slice(0, 4).join(' | '); })()",
  );
  const firstText = typeof first === "string" ? first : "";
  log(
    firstText.includes("练习 1") && firstText.includes("2/4"),
    "第一条是 2/4 的练习 1",
    firstText,
  );

  // 谱是懒加载的图片（进视口才请求），这里先数占位，滚完整页再验有没有真的加载出来。
  const boxes = js(
    "(() => { const g = [...document.querySelectorAll('.drill-grid')][2]; return g ? g.querySelectorAll('.tab-score').length : -1; })()",
  );
  log(boxes === "24", `每条扫弦练习都有一个谱位（读到 ${boxes} 个）`);

  // 3b) 谱图是 `loading="lazy"`，一步步滚完整页，再看每张卡的图有没有加载出来。
  let scrolled = 0;
  for (let step = 0; step < 60; step++) {
    const info = js(
      "(() => { const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollBy(0, 360); return JSON.stringify({ y: Math.round(window.scrollY), max }); })()",
    );
    try {
      const at = JSON.parse(JSON.parse(info));
      scrolled = at.y;
      if (at.y >= at.max - 10) break;
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  const countScores = () => {
    const raw = js(
      "(() => { const cards = [...document.querySelectorAll('.drill-card')]; const bad = cards.filter((c) => { const img = c.querySelector('.tab-score'); return !img || !img.complete || img.naturalWidth === 0; }).length; return JSON.stringify({ cards: cards.length, bad }); })()",
    );
    try {
      return JSON.parse(JSON.parse(raw));
    } catch {
      return { cards: 0, bad: -1 };
    }
  };
  let counts = countScores();
  for (let tick = 0; tick < 20 && counts.bad !== 0; tick++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    counts = countScores();
  }
  log(
    counts.bad === 0,
    `滚完整页后 ${counts.cards} 张卡都加载了谱图（没加载出来的 ${counts.bad} 张）`,
    `页面高度 ${scrolled}`,
  );

  // 4) 跟练：点开 → 面板出现，带着这条练习的起始速度
  const clicked = js(
    "(() => { const g = [...document.querySelectorAll('.drill-grid')][2]; const b = [...g.querySelectorAll('button')].find(n => n.textContent === '跟练'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  log(clicked === '"ok"', "能点开练习 1 的「跟练」");

  const panel = ab(["get", "text", ".follow"]);
  const panelText = typeof panel === "string" ? panel : "";
  log(
    panelText.includes("80") && panelText.includes("BPM"),
    "跟练面板显示起始 80 BPM",
    panelText ? panelText.split("\n").filter(Boolean).slice(0, 2).join(" / ") : String(panel),
  );

  const closed = js(
    "(() => { const b = [...document.querySelectorAll('.follow button')].find(n => n.textContent === '收起'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  const gone = js("document.querySelector('.follow') ? 'still' : 'gone'");
  log(closed === '"ok"' && String(gone).includes("gone"), "点「收起」后面板消失");

  // 5) 试听不报错（音是 Web Audio 现场合成的，起不来会抛异常）
  js(
    "(() => { const b = [...document.querySelectorAll('button')].find(n => n.getAttribute('aria-label')?.startsWith('试听')); b?.click(); return 'ok'; })()",
  );
  const errors = ab(["errors"]);
  const errorText = typeof errors === "string" ? errors : "";
  log(!errorText || /no (page )?errors/i.test(errorText), "试听之后页面没有报错", errorText.slice(0, 300));
} finally {
  ab(["close"]);
  console.log(
    failed === 0
      ? "\n浏览器冒烟检查通过（声音本身听不到，出声还得人来听）"
      : `\n浏览器冒烟检查失败：${failed} 项`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
