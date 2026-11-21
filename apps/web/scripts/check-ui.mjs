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

  // 1b) 落地页就是「练习」：新打开的人第一眼看到今日三条，不是先落在音阶游戏里
  const landing = js(
    "(() => { const cur = document.querySelector('nav.tabs button[aria-current=\"page\"]'); const h = document.querySelector('.panel-head h2'); return (cur?.textContent ?? '') + '|' + (h?.textContent ?? ''); })()",
  );
  log(
    landing === '"练习|今日练习"',
    "打开就是「练习」页（今日练习）",
    landing === '"练习|今日练习"' ? "" : String(landing),
  );

  // 2) 主导航 10 个 Tab，能切到「节奏」
  const tabs = js("document.querySelectorAll('nav.tabs button').length");
  log(tabs === "10", `主导航有 10 个 Tab（读到 ${tabs}）`);

  const switched = js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  log(switched === '"ok"', "能切到「节奏」页", switched === '"ok"' ? "" : String(switched));

  // 3) 节奏页六块内容：跟读 16 + 时值 10 + 扫弦 24 + 伴奏 17 + 扫弦型 12 + 风格 6 = 85
  const cards = js("document.querySelectorAll('.drill-card').length");
  log(cards === "103", `节奏页 6 块内容共 103 张卡（读到 ${cards}）`);

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

  // 3a) 伴奏型 17 条：每条都有「变速」三档（慢速 / 原速 / 快一点），点一下直接开跟练
  const speedInfo = JSON.parse(
    String(
      js(
        "(() => { const g = [...document.querySelectorAll('.drill-grid')][3]; if (!g) return JSON.stringify({ rows: -1 }); const cards = [...g.querySelectorAll('.drill-card')]; const rows = cards.filter(c => c.querySelectorAll('.speed-row .chip').length === 3).length; const first = cards[0]?.querySelectorAll('.speed-row .chip'); const labels = first ? [...first].map(b => b.textContent.trim()) : []; return JSON.stringify({ cards: cards.length, rows, labels }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    speedInfo.cards === 17 && speedInfo.rows === 17 && speedInfo.labels.length === 3,
    "伴奏型 17 条每条都有变速三档",
    `${speedInfo.rows}/${speedInfo.cards} · ${(speedInfo.labels || []).join(" / ")}`,
  );

  // 谱是懒加载的图片（进视口才请求），这里先数占位，滚完整页再验有没有真的加载出来。
  const boxes = js(
    "(() => { const g = [...document.querySelectorAll('.drill-grid')][2]; return g ? g.querySelectorAll('.tab-score').length : -1; })()",
  );
  log(boxes === "24", `每条扫弦练习都有一个谱位（读到 ${boxes} 个）`);

  // 3b) 谱图是 `loading="lazy"`，一步步滚完整页，再看每张卡的图有没有加载出来。
  let scrolled = 0;
  for (let step = 0; step < 80; step++) {
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

  // 6) 同一时刻只响一路：节拍器在响的时候点试听，节拍器要自己停下来
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const metroButton = () =>
    js(
      "(() => { const b = document.querySelector('.metronome .btn'); return b ? b.textContent.trim() : 'none'; })()",
    );
  js(
    "(() => { const b = [...document.querySelectorAll('.metronome button')].find(n => n.textContent.trim() === '开始'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const runningText = String(await metroButton());
  log(runningText.includes("停止"), "节拍器能开始（按钮变成「停止」）", runningText);
  js(
    "(() => { const b = [...document.querySelectorAll('.drill-card button')].find(n => n.textContent.trim() === '试听'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const afterTone = String(await metroButton());
  log(
    afterTone.includes("开始") && !afterTone.includes("停止"),
    "点试听时正在响的节拍器会自己停（同一时刻只响一路）",
    afterTone,
  );

  // 7) 今日三条：三条都在，点「去练」能滚到那张卡；每块标题上有「已练 N/M」
  const todayRaw = js(
    "(() => { const items = [...document.querySelectorAll('.today-item')]; return JSON.stringify({ n: items.length, meters: [...document.querySelectorAll('.block-meter')].map((n) => n.textContent.trim()) }); })()",
  );
  let today = { n: 0, meters: [] };
  try {
    today = JSON.parse(JSON.parse(todayRaw));
  } catch {
    today = { n: 0, meters: [] };
  }
  log(today.n === 3, "「今天先练这 3 条」里有 3 条", `读到 ${today.n} 条`);

  const dues = String(
    js(
      "(() => [...document.querySelectorAll('.today-item .today-due')].map(n => n.textContent.trim()).join('|'))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    dues.split("|").length === 3 && dues.split("|").every((text) => /^(还没练过|今天练过|上次练 \d+ 天前)( · 速度掉了)?$/.test(text)),
    "三条都写着「为什么今天练它」（多久没练）",
    dues,
  );
  log(
    today.meters.length === 4 && today.meters.every((text) => /^已练 \d+\/\d+$/.test(text)),
    "每块练习的标题上都有「已练 N/M」",
    today.meters.join(" / "),
  );

  // 7b) 换一条：点完这条今天不再出现，三条还是三条
  const pickIds = () =>
    String(
      js(
        "(() => [...document.querySelectorAll('.today-item')].map(n => n.dataset.pick).join('|'))()",
      ),
    ).replace(/^"|"$/g, "");
  const idsBefore = pickIds();
  const firstId = idsBefore.split("|")[0];
  js("(() => { document.querySelector('.today-item .today-swap')?.click(); return 'ok'; })()");
  await sleep(400);
  const idsAfter = pickIds();
  log(
    idsAfter.split("|").length === 3 && !idsAfter.split("|").includes(firstId),
    "点「换一条」这条今天就不再出现",
    `${idsBefore} → ${idsAfter}`,
  );

  // 7c) 撤销：底部那条提示里点「撤销」，刚跳过的那条马上回来
  const swapToast = String(js("document.querySelector('.undo-toast')?.textContent ?? ''")).replace(
    /^"|"$/g,
    "",
  );
  log(swapToast.includes("已跳过"), "跳过后底部有「已跳过」的提示", swapToast.trim());
  js("(() => { document.querySelector('.undo-toast-btn')?.click(); return 'ok'; })()");
  await sleep(400);
  const idsUndo = pickIds();
  log(
    idsUndo === idsBefore && Number(js("document.querySelectorAll('.undo-toast').length")) === 0,
    "点「撤销」那条回来，提示收掉",
    `${idsAfter} → ${idsUndo}`,
  );
  // 清掉跳过表，免得影响后面的断言
  js("localStorage.removeItem('guitar.skips.v1')");

  // 7d) 这一周先不练：提示里的第二条出路，点完写进压后表，撤销能把两边一起撤掉
  js("(() => { document.querySelector('.today-item .today-swap')?.click(); return 'ok'; })()");
  await sleep(300);
  js("(() => { document.querySelector('.undo-toast-more')?.click(); return 'ok'; })()");
  await sleep(400);
  const pauseToast = String(js("document.querySelector('.undo-toast')?.textContent ?? ''")).replace(
    /^"|"$/g,
    "",
  );
  const pausedIds = String(
    js("localStorage.getItem('guitar.pauses.v1') ?? ''"),
  ).replace(/^"|"$/g, "");
  log(
    pauseToast.includes("这一周") && pausedIds.includes(firstId),
    "点「这一周别出现」后写进压后表，提示改成「这一周」",
    `${pauseToast.trim()} · ${pausedIds}`,
  );
  js("(() => { document.querySelector('.undo-toast-btn')?.click(); return 'ok'; })()");
  await sleep(400);
  const pausesAfterUndo = String(
    js("localStorage.getItem('guitar.pauses.v1') ?? ''"),
  ).replace(/^"|"$/g, "");
  log(
    pickIds() === idsBefore && !pausesAfterUndo.includes(firstId),
    "撤销把跳过和压后一起撤掉，那条回到三条里",
    `${pausesAfterUndo || "{}"} · ${pickIds()}`,
  );
  js("localStorage.removeItem('guitar.skips.v1')");
  js("localStorage.removeItem('guitar.pauses.v1')");

  // 7e) 压后不攒紧迫度：一个月没练的那条刚放出来，不该马上又被排到最前
  js(
    "(() => { const d = new Date(); const k = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'rd-01': { bestBpm: 70, sessions: 2, minutes: 9, lastAt: k(-30) } })); localStorage.setItem('guitar.pauses.v1', JSON.stringify({ 'rd-01': k(-2) })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(1400);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const frozenPick = Number(js("document.querySelectorAll('.today-item[data-pick=\"rd-01\"]').length"));
  log(
    frozenPick === 0,
    "压后过的条目刚放出来不会马上又排进今日三条",
    `rd-01 在三条里出现 ${frozenPick} 次`,
  );
  js("localStorage.removeItem('guitar.pauses.v1')");
  js("localStorage.removeItem('guitar.rhythm.v1')");

  const jumped = js(
    "(() => { window.scrollTo(0, 0); const b = document.querySelector('.today-item .btn:not(.today-swap)'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(700);
  const scrolledTo = Number(js("Math.round(window.scrollY)"));
  log(jumped === '"ok"' && scrolledTo > 0, "点「去练」会滚到那张卡", `scrollY = ${scrolledTo}`);

  // 8) 视听同步：试听时谱面上有一条跟着拍走的竖条
  js("window.scrollTo(0, 0)");
  await sleep(300);
  js(
    "(() => { const b = [...document.querySelectorAll('.drill-card button')].find(n => n.textContent.trim() === '试听'); b?.click(); return 'ok'; })()",
  );
  const beatLeft = () =>
    String(
      js(
        "(() => { const b = document.querySelector('.tab-score-beat'); return b ? b.style.left : 'none'; })()",
      ),
    ).replace(/^"|"$/g, "");
  await sleep(260);
  const firstLeft = String(beatLeft());
  log(firstLeft !== "none" && firstLeft.includes("%"), "试听时谱面上出现「当前拍」竖条", firstLeft);
  await sleep(900);
  const secondLeft = String(beatLeft());
  log(
    secondLeft !== "none" && secondLeft !== firstLeft,
    "竖条跟着拍往前走到下一拍",
    `${firstLeft} → ${secondLeft}`,
  );
  await sleep(3200);
  const afterEnd = String(beatLeft());
  log(afterEnd === "none", "放完竖条自己消失", afterEnd);
  // 9) 我的谱：内置示例一键填进编辑区
  const exampleNames = String(
    js(
      "(() => [...document.querySelectorAll('.my-examples .chip')].map(n => n.textContent.trim()).join('|'))()",
    ),
  );
  log(
    exampleNames.includes("小星星") && exampleNames.includes("欢乐颂"),
    "我的谱：有内置示例（小星星 / 欢乐颂 / 两只老虎）",
    exampleNames,
  );
  js(
    "(() => { const b = [...document.querySelectorAll('.my-examples .chip')].find(n => n.textContent.trim() === '小星星'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(300);
  const exampleFilled = String(
    js(
      "(() => { const t = document.querySelector('#my-score-input'); return t ? t.value.split('\\n')[0] : 'none'; })()",
    ),
  );
  log(exampleFilled.includes("小星星"), "我的谱：点示例会把谱填进编辑区", exampleFilled);

  // 9a) 我的谱：粘一段六线谱 → 预览出图 → 存下后卡片里也有图 → 删掉
  js(
    "(() => { document.querySelector('.my-scores')?.scrollIntoView({ block: 'end' }); return 'ok'; })()",
  );
  await sleep(400);
  const previewClick = js(
    "(() => { const b = [...document.querySelectorAll('.my-actions button')].find(n => n.textContent.trim() === '预览'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  let previewImages = 0;
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    previewImages = Number(
      String(
        js(
          "(() => String([...document.querySelectorAll('.my-preview img.tab-score')].filter(n => n.complete && n.naturalWidth > 0).length))()",
        ),
      ).replace(/"/g, ""),
    );
    if (previewImages > 0) break;
  }
  log(
    previewClick === '"ok"' && previewImages > 0,
    "我的谱：点「预览」能画出一张和内置谱一样的图",
    `读到 ${previewImages} 张图`,
  );
  // 9a2) 四小节的谱要画成两行：alphaTab 每行谱是一个独立的 <svg>，只取第一块就会少一半
  const previewShape = String(
    js(
      "(() => { const img = document.querySelector('.my-preview img.tab-score'); return img ? `${img.naturalWidth}x${img.naturalHeight}` : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  const [previewW, previewH] = previewShape.split("x").map(Number);
  log(
    previewW > 0 && previewH / previewW > 0.3,
    "我的谱：四小节的谱预览出来是两行（不是只剩第一行）",
    previewShape,
  );

  // 9b) 预览里点试听，谱上也要有跟着拍走的竖条（和内置谱同一个播放头）
  js(
    "(() => { const b = [...document.querySelectorAll('.my-preview button')].find(n => n.textContent.trim() === '试听'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  let previewBand = "none";
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    previewBand = String(
      js(
        "(() => { const b = document.querySelector('.my-preview .tab-score-beat'); return b ? `${b.style.left}|${b.style.top}|${b.style.height}` : 'none'; })()",
      ),
    ).replace(/^"|"$/g, "");
    if (previewBand !== "none") break;
  }
  const bandParts = previewBand.split("|");
  log(
    previewBand !== "none" && bandParts.length === 3 && bandParts[1] !== "",
    "我的谱：预览试听时也有跟着拍走的高亮",
    previewBand === "none" ? "没看到竖条" : previewBand,
  );

  const saved = js(
    "(() => { const b = [...document.querySelectorAll('.my-actions button')].find(n => n.textContent.trim() === '存下这条'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(400);
  js(
    "(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()",
  );
  let cardImages = 0;
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    cardImages = Number(
      String(
        js(
          "(() => String([...document.querySelectorAll('.my-card img.tab-score')].filter(n => n.complete && n.naturalWidth > 0).length))()",
        ),
      ).replace(/"/g, ""),
    );
    if (cardImages > 0) break;
  }
  log(
    saved === '"ok"' && cardImages > 0,
    "我的谱：存下之后卡片里直接是图（刷新也不用再画）",
    `读到 ${cardImages} 张图`,
  );

  // 9d) 点「编辑」把这条放回编辑区，按钮变成「保存修改」；改完能存回同一条
  const editClick = js(
    "(() => { const b = [...document.querySelectorAll('.my-card button')].find(n => n.textContent.trim() === '编辑'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(400);
  const editState = String(
    js(
      "(() => { const t = document.querySelector('#my-score-input'); const b = [...document.querySelectorAll('.my-actions button')].find(n => n.textContent.trim() === '保存修改'); return `${t && t.value.length > 0 ? 'filled' : 'empty'}|${b ? 'save' : 'nosave'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    editClick === '"ok"' && editState === "filled|save",
    "我的谱：点「编辑」把谱放回编辑区，按钮变成「保存修改」",
    editState,
  );
  const editedSave = js(
    "(() => { const b = [...document.querySelectorAll('.my-actions button')].find(n => n.textContent.trim() === '保存修改'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(1200);
  const afterEdit = String(
    js(
      "(() => `${document.querySelectorAll('.my-card').length}|${[...document.querySelectorAll('.my-actions button')].some(n => n.textContent.trim() === '存下这条') ? 'new' : 'edit'}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    editedSave === '"ok"' && afterEdit === "1|new",
    "我的谱：保存修改后还是同一条（不会多出一条）",
    afterEdit,
  );

  // 9e) 卡片上有「导出 PNG」，指向这张图的 data URL
  const exportLink = String(
    js(
      "(() => { const a = document.querySelector('.my-card a[download]'); return a ? `${a.getAttribute('href')?.slice(0, 14)}|${a.getAttribute('download')?.endsWith('.png') ? 'png' : 'x'}` : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    exportLink.startsWith("data:image/png") && exportLink.endsWith("|png"),
    "我的谱：卡片上有「导出 PNG」，文件名是 .png",
    exportLink,
  );

  // 收尾：把刚存的那条删掉，别把下次跑的环境弄脏
  // 9c) 存下的卡片点试听，谱上也要有跟着拍走的竖条
  const cardPlay = js(
    "(() => { const b = [...document.querySelectorAll('.my-card button')].find(n => n.textContent.trim() === '试听'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  let cardBand = "none";
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    cardBand = String(
      js(
        "(() => { const b = document.querySelector('.my-card .tab-score-beat'); return b ? `${b.style.left}|${b.style.top}` : 'none'; })()",
      ),
    ).replace(/^"|"$/g, "");
    if (cardBand !== "none") break;
  }
  log(
    cardPlay === '"ok"' && cardBand !== "none" && cardBand.includes("|"),
    "我的谱：存下的卡片点试听也有当前拍竖条",
    cardBand === "none" ? "没看到竖条" : cardBand,
  );

  const removed = js(
    "(() => { const b = [...document.querySelectorAll('.my-card button')].find(n => n.textContent.trim() === '删掉'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(400);
  const leftCards = Number(
    String(js("(() => String(document.querySelectorAll('.my-card').length))()")).replace(/"/g, ""),
  );
  log(removed === '"ok"' && leftCards === 0, "我的谱：删掉之后卡片消失", `还剩 ${leftCards} 条`);

  // 9a2) 我的谱：扒谱存下的谱也在这里（只读，带「扒出来的」说明，没有「编辑」）
  js(
    `(() => { localStorage.setItem('guitar.scores.v1', JSON.stringify([{ id: 'my-ear1', title: '扒谱 · 测试', ascii: '', source: 'transcribe', tab: { beatsPerBar: 4, bars: 1, notes: [{ s: 2, f: 1, beat: 0, dur: 1 }, { s: 1, f: 0, beat: 1, dur: 1 }, { s: 1, f: 3, beat: 2, dur: 1 }] }, meter: '4/4', bpm: 90, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js(
    "(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()",
  );
  let earCard = "";
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    js(
      "(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()",
    );
    earCard = String(
      js(
        "(() => { const card = document.querySelector('.my-card'); if (!card) return 'none'; const src = card.querySelector('.my-source')?.textContent ?? ''; const btns = [...card.querySelectorAll('.drill-actions button, .drill-actions a')].map(n => n.textContent.trim()).join(','); const img = Boolean(card.querySelector('img.tab-score')); return [src.includes('扒出来的') ? 'ear' : 'plain', img ? 'img' : 'noimg', btns].join('|'); })()",
      ),
    ).replace(/^"|"$/g, "");
    if (earCard !== "none" && earCard.includes("img")) break;
  }
  log(
    earCard.startsWith("ear|img|") &&
      earCard.includes("试听") &&
      earCard.includes("导出 PNG") &&
      !earCard.includes("编辑"),
    "我的谱：扒出来的谱也在列表里，只读（没有「编辑」）",
    earCard,
  );
  js("(() => { localStorage.removeItem('guitar.scores.v1'); return 'ok'; })()");

  // 9a3) 我的谱里的和弦卡能跳回和弦页看指法（#chords/chord-Am）
  js(
    `(() => { localStorage.setItem('guitar.scores.v1', JSON.stringify([{ id: 'my-chord1', title: '和弦 · Am', ascii: '', source: 'chord', chordName: 'Am', tab: { beatsPerBar: 4, bars: 1, notes: [{ s: 5, f: 0, beat: 0, dur: 4 }, { s: 4, f: 2, beat: 0, dur: 4 }, { s: 3, f: 2, beat: 0, dur: 4 }, { s: 2, f: 1, beat: 0, dur: 4 }, { s: 1, f: 0, beat: 0, dur: 4 }] }, meter: '4/4', bpm: 70, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js(
    "(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()",
  );
  await sleep(600);
  const jumpText = String(
    js(
      "(() => { const btn = document.querySelector('.my-chord-jump'); return btn ? btn.textContent.trim() : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  const chordDiagram = String(
    js(
      "(() => { const svg = document.querySelector('.my-chord-diagram svg'); const note = document.querySelector('.my-chord-note')?.textContent ?? ''; return [svg ? 'svg' : 'none', svg?.getAttribute('aria-label') ?? '', note.includes('两种说法') ? 'note' : 'nonote'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    chordDiagram.startsWith("svg|") && chordDiagram.includes("和弦图") && chordDiagram.endsWith("note"),
    "我的谱：和弦卡直接画出指法图（跟六线谱并排）",
    chordDiagram,
  );
  js("(() => { document.querySelector('.my-chord-jump')?.click(); return 'ok'; })()");
  await sleep(1000);
  const jumpLanding = String(
    js(
      "(() => { const name = document.querySelector('.chord-detail h3')?.textContent?.trim() ?? ''; const active = document.querySelector('.chord-tile.active .chord-tile-name')?.textContent?.trim() ?? ''; return [location.hash, name, active].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    jumpText.includes("Am") && jumpLanding.startsWith("#chords/chord-Am|Am"),
    "我的谱：和弦卡能跳回和弦页看同一个和弦的指法",
    `${jumpText} · ${jumpLanding}`,
  );
  js("(() => { localStorage.removeItem('guitar.scores.v1'); return 'ok'; })()");

  // 9a5) 和弦谱卡：每个和弦一个 chip，点一下单独听
  js(
    `(() => { localStorage.setItem('guitar.scores.v1', JSON.stringify([{ id: 'my-prog1', title: '和弦谱 · C–Am', ascii: '', source: 'progression', tab: { beatsPerBar: 4, bars: 1, caption: 'C–Am', notes: [{ s: 5, f: 3, beat: 0, dur: 2 }, { s: 4, f: 2, beat: 0, dur: 2 }, { s: 3, f: 0, beat: 0, dur: 2 }, { s: 3, f: 2, beat: 2, dur: 2 }, { s: 2, f: 1, beat: 2, dur: 2 }, { s: 1, f: 0, beat: 2, dur: 2 }] }, meter: '4/4', bpm: 70, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js("(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()");
  await sleep(600);
  const chordChips = String(
    js(
      "(() => { const chips = [...document.querySelectorAll('.my-chord-chips .chip')].map(n => n.textContent.replace(/\\s+/g, '').trim()); const label = document.querySelector('.my-chord-chips-label')?.textContent?.trim() ?? ''; return [chips.join(','), label].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    // v0.94.0 起 chip 上还带级数（C1 / Am6），所以只比对和弦名和「单独听」
    chordChips === "C1,Am6|单独听：" || chordChips === "C,Am|单独听：",
    "我的谱：和弦谱卡每个和弦一个 chip，能单独听",
    chordChips,
  );
  // 9a5b0) v0.93.0：和弦谱卡上叠一条低音走线（谱图和「听和弦」那边共用一套）
  const bassOverlay = String(
    js(
      "(() => { const overlay = document.querySelector('.my-card .cl-basschart-overlay'); if (!overlay) return 'none'; const points = overlay.querySelector('polyline')?.getAttribute('points') ?? ''; const dots = overlay.querySelectorAll('circle').length; return `${points ? 'line' : 'noline'}|${dots}|${overlay.getAttribute('aria-label') ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    bassOverlay.startsWith("line|2|") && bassOverlay.includes("低音走线"),
    "我的谱：和弦谱卡上叠着低音走线",
    bassOverlay,
  );

  // 9a5b0b) v0.105.0：「我的谱」里也能把这一条加进今日计划
  const scorePlan = JSON.parse(
    String(
      js(
        "(() => { const card = document.querySelector('.my-card'); const btn = [...(card?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === '加进今日计划'); btn?.click(); const plan = JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]'); return JSON.stringify({ had: Boolean(btn), titles: plan.map(p => p.title) }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  await sleep(500);
  const scorePlanAfter = JSON.parse(
    String(
      js(
        "(() => { const plan = JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]'); return JSON.stringify({ titles: plan.map(p => p.title) }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    scorePlan.had && scorePlanAfter.titles.includes("和弦谱 · C–Am · 1 → 6"),
    "我的谱：卡上能加进今日计划（名字带级数）",
    scorePlanAfter.titles.join("/"),
  );
  js("localStorage.removeItem('guitar.plan.v1')");

  // 9a5b1) v0.95.0：和弦谱卡的级数能换调算（C–Am 在 C 调是 1–6，在 G 调是 4–2）
  const keyBefore = String(
    js(
      "(() => [...document.querySelectorAll('.my-card .my-chord-chips .chip')].map(n => n.textContent.replace(/\\s+/g, '').trim()).join(',') )()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    `(() => { const select = document.querySelector('.my-card .my-key select'); if (!select) return 'no'; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '7'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(400);
  const keyAfter = String(
    js(
      "(() => { const chips = [...document.querySelectorAll('.my-card .my-chord-chips .chip')].map(n => n.textContent.replace(/\\s+/g, '').trim()); const dots = document.querySelectorAll('.my-card .cl-basschart-overlay circle').length; return [chips.join(','), dots].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    `(() => { const select = document.querySelector('.my-card .my-key select'); if (!select) return 'no'; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '0'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(400);
  const dotsBack = String(
    js(
      "(() => { const dots = [...document.querySelectorAll('.my-card .cl-basschart-overlay circle')].map(n => n.getAttribute('class') ?? 'plain'); return dots.join(','); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    keyBefore === "C1,Am6" &&
      keyAfter === "C4,Am2|2" &&
      dotsBack.includes("lv1"),
    "我的谱：级数能按别的调算，低音点跟着着色",
    `${keyBefore} → ${keyAfter} → ${dotsBack}`,
  );

  // 9a5b2) v0.96.0：选的调要记住（刷新之后还是 G 调）
  js(
    `(() => { const select = document.querySelector('.my-card .my-key select'); if (!select) return 'no'; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '7'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(500);
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js("(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()");
  await sleep(700);
  const keyRemembered = String(
    js(
      "(() => { const card = document.querySelector('.my-card'); const select = card?.querySelector('.my-key select'); const chips = [...(card?.querySelectorAll('.my-chord-chips .chip') ?? [])].map(n => n.textContent.replace(/\\s+/g, '').trim()); const stored = JSON.parse(localStorage.getItem('guitar.scores.v1') || '[]')[0] ?? {}; return [select?.value ?? '', chips.join(','), stored.keyPc].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    keyRemembered === "7|C4,Am2|7",
    "我的谱：选过的调会记住，刷新后还在",
    keyRemembered,
  );
  js(
    `(() => { const select = document.querySelector('.my-card .my-key select'); if (!select) return 'no'; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '0'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(400);
  // 9a5b) v0.90.0：和弦谱卡上要写清拍号 / 速度 / 每小节几拍
  const beatMark = String(
    js(
      "(() => { const el = document.querySelector('.my-beats'); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : ''; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    beatMark.includes("4/4") && beatMark.includes("♩=70") && beatMark.includes("每小节 4 拍"),
    "我的谱：和弦谱卡上写着拍号、速度和每小节几拍",
    beatMark,
  );
  js("(() => { localStorage.removeItem('guitar.scores.v1'); return 'ok'; })()");

  // 9a6) v0.91.0：我存的进行——节奏页有一块，卡上直接能试听、跟练
  js(
    `(() => { localStorage.setItem('guitar.patterns.v1', JSON.stringify([{ id: 'pattern-test1', title: '和弦进行 · C–Am', tab: { beatsPerBar: 4, bars: 1, notes: [{ s: 5, f: 3, beat: 0, dur: 2 }, { s: 4, f: 2, beat: 0, dur: 2 }, { s: 3, f: 0, beat: 0, dur: 2 }, { s: 3, f: 2, beat: 2, dur: 2 }, { s: 2, f: 1, beat: 2, dur: 2 }, { s: 1, f: 0, beat: 2, dur: 2 }] }, meter: '4/4', bpm: 72, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js("(() => { document.querySelector('.my-pattern')?.scrollIntoView({ block: 'center' }); return 'ok'; })()");
  await sleep(700);
  const patternInfo = String(
    js(
      "(() => { const head = [...document.querySelectorAll('.practice-h3')].map(n => n.textContent.replace(/\\s+/g, ' ').trim()).find(t => t.includes('我存的进行')) ?? ''; const card = document.querySelector('.my-pattern'); const title = card?.querySelector('h4')?.textContent?.trim() ?? ''; const beats = card?.querySelector('.my-beats')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''; const buttons = [...(card?.querySelectorAll('.drill-actions button') ?? [])].map(n => n.textContent.trim()).join(','); return [head ? 'head' : 'nohead', title, beats, buttons].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    patternInfo.startsWith("head|和弦进行 · C–Am · 1 → 6|") &&
      patternInfo.includes("♩=72") &&
      patternInfo.includes("试听") &&
      patternInfo.includes("跟练"),
    "节奏页：我存的进行能直接试听、跟练（标题带级数）",
    patternInfo,
  );
  // 9a6c) v0.99.0：跟练里点级数方块只练那一小节，方块上带小节号
  js(
    "(() => { const card = document.querySelector('.my-pattern'); const b = [...(card?.querySelectorAll('.drill-actions button') ?? [])].find(n => n.textContent.trim() === '跟练'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('.follow-controls button')].find(n => n.textContent.trim() === '开始跟练'); b?.click(); return 'ok'; })()",
  );
  // 级数方块要等预备拍走完、真的在跑才出现
  let followChips = "";
  for (let i = 0; i < 24; i += 1) {
    followChips = String(
      js(
        "(() => [...document.querySelectorAll('.follow-degree-chip')].map(n => n.textContent.trim()).join(','))()",
      ),
    ).replace(/^"|"$/g, "");
    if (followChips) break;
    await sleep(400);
  }
  log(
    /^\d+·\d+(,\d+·\d+)*$/.test(followChips),
    "跟练：级数方块上带小节号（3·5 这种）",
    followChips || "还没出现",
  );
  js("(() => { document.querySelectorAll('.follow-degree-chip')[0]?.click(); return 'ok'; })()");
  await sleep(700);
  const loopNote = String(
    js(
      "(() => { const label = [...document.querySelectorAll('.follow-controls label')].find(n => n.textContent.includes('只练')); const box = label?.querySelector('input[type=checkbox]'); const note = document.querySelector('.follow-loop-note')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''; return `${box?.checked ? 'on' : 'off'}|${note}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  // 这条种子进行只有一小节，所以「练完自动接回整段」那句不该出现（整段就是那一小节）；
  // 多小节的自动接回由探针 probe-v99 覆盖
  log(
    loopNote.startsWith("on|") && loopNote.endsWith("|"),
    "跟练：点级数方块会把「只练」勾到那一小节",
    loopNote,
  );
  js(
    "(() => { const b = [...document.querySelectorAll('.follow button')].find(n => n.textContent.trim() === '收起'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);

  // 9a6b) v0.93.0：我存的进行能导出 PNG
  const patternButtons = String(    js(
      "(() => [...document.querySelectorAll('.my-pattern .drill-actions button')].map(n => n.textContent.trim()).join(','))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    patternButtons.includes("导出 PNG"),
    "节奏页：我存的进行能导出 PNG",
    patternButtons,
  );
  js("(() => { localStorage.removeItem('guitar.patterns.v1'); return 'ok'; })()");

  // 9a7) v0.92.0：我存的进行能改速度、改拍号（谱子跟着重切小节）
  js(
    `(() => { localStorage.setItem('guitar.patterns.v1', JSON.stringify([{ id: 'pattern-edit1', title: '和弦进行 · C–Am', tab: { beatsPerBar: 4, bars: 1, notes: [{ s: 5, f: 3, beat: 0, dur: 2 }, { s: 3, f: 0, beat: 2, dur: 2 }] }, meter: '4/4', bpm: 72, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js("(() => { document.querySelector('.my-pattern')?.scrollIntoView({ block: 'center' }); return 'ok'; })()");
  await sleep(600);
  js(
    "(() => { const card = document.querySelector('.my-pattern'); const edit = [...card.querySelectorAll('button')].find(n => n.textContent.trim() === '改'); edit?.click(); return 'ok'; })()",
  );
  await sleep(500);
  js(
    `(() => { const wrap = document.querySelector('.my-pattern-edit'); if (!wrap) return 'noedit'; const input = wrap.querySelector('input[type=number]'); const select = wrap.querySelector('select'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '96'); input.dispatchEvent(new Event('input', { bubbles: true })); const pick = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; pick.call(select, '3'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(400);
  js(
    "(() => { const btn = [...document.querySelectorAll('.my-pattern-edit button')].find(n => n.textContent.trim() === '存'); btn?.click(); return 'ok'; })()",
  );
  await sleep(800);
  const edited = String(
    js(
      "(() => { const raw = JSON.parse(localStorage.getItem('guitar.patterns.v1') || '[]')[0] ?? {}; const beats = document.querySelector('.my-pattern .my-beats')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''; return `${raw.bpm}|${raw.meter}|${raw.tab?.beatsPerBar}|${beats.includes('♩=96') ? 'bpm' : 'nobpm'}|${beats.includes('3/4') ? 'meter' : 'nometer'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    edited.startsWith("96|3/4|3|bpm|meter"),
    "节奏页：我存的进行能改速度、改拍号",
    edited,
  );
  js("(() => { localStorage.removeItem('guitar.patterns.v1'); return 'ok'; })()");

  // 9a8) v0.94.0：和弦谱卡也能改速度 / 拍号（改拍号会真的重切小节）
  js(
    `(() => { localStorage.setItem('guitar.scores.v1', JSON.stringify([{ id: 'my-seq1', title: '和弦谱 · C–Am', ascii: '', source: 'progression', tab: { beatsPerBar: 4, bars: 2, notes: [{ s: 5, f: 3, beat: 0, dur: 4 }, { s: 3, f: 0, beat: 4, dur: 4 }] }, meter: '4/4', bpm: 80, createdAt: Date.now() }])); return 'ok'; })()`,
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js("(() => { document.querySelector('.my-card')?.scrollIntoView({ block: 'center' }); return 'ok'; })()");
  await sleep(700);
  const hasTimingEdit = String(
    js(
      "(() => { const card = document.querySelector('.my-card'); const btn = [...(card?.querySelectorAll('button') ?? [])].find(n => n.textContent.trim() === '改速度 / 拍号'); if (!btn) return 'nobtn'; btn.click(); return 'btn'; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(500);
  js(
    `(() => { const wrap = document.querySelector('.my-card .my-timing'); if (!wrap) return 'noedit'; const input = wrap.querySelector('input[type=number]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '96'); input.dispatchEvent(new Event('input', { bubbles: true })); const select = wrap.querySelector('select'); const pick = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; pick.call(select, '3'); select.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`,
  );
  await sleep(400);
  js(
    "(() => { const btn = [...document.querySelectorAll('.my-card .my-timing button')].find(n => n.textContent.trim() === '存'); btn?.click(); return 'ok'; })()",
  );
  await sleep(900);
  const timing = String(
    js(
      "(() => { const raw = JSON.parse(localStorage.getItem('guitar.scores.v1') || '[]')[0] ?? {}; const beats = document.querySelector('.my-card .my-beats')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''; return `${raw.bpm}|${raw.meter}|${raw.tab?.beatsPerBar}|${beats.includes('♩=96') ? 'bpm' : 'nobpm'}|${beats.includes('3/4') ? 'meter' : 'nometer'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hasTimingEdit === "btn" && timing.startsWith("96|3/4|3|bpm|meter"),
    "我的谱：和弦谱卡能改速度 / 拍号",
    `${hasTimingEdit} · ${timing}`,
  );
  js("(() => { localStorage.removeItem('guitar.scores.v1'); return 'ok'; })()");


  // 9b) 扒谱（v0.72.0 独立成页）：四节课、练听辨、录音工具都在
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '扒谱'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const earInfo = String(
    js(
      "(() => { const panel = document.querySelector('.ear'); if (!panel) return 'none'; const lessons = panel.querySelectorAll('.ear-lesson').length; const kinds = panel.querySelectorAll('.ear-kinds .chip').length; const options = panel.querySelectorAll('.ear-option').length; const play = [...panel.querySelectorAll('button')].some(n => n.textContent.trim() === '再听一遍'); const tr = panel.querySelector('.transcribe'); const start = tr ? [...tr.querySelectorAll('button')].some(n => n.textContent.trim() === '开始听') : false; return [lessons, kinds, options, play ? 'play' : 'noplay', start ? 'tr' : 'notr'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    earInfo.startsWith("12|5|4|play|tr"),
    "扒谱页：十二节课 + 五种题型 + 四个选项 + 录音工具",
    earInfo,
  );

  // 9b2) 第五种题型「和弦性质」：点它换一套题，三个音一起响、四个选项是四种性质
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-kinds .chip')].find(n => n.textContent.trim() === '和弦性质'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const qualityInfo = String(
    js(
      "(() => { const panel = document.querySelector('.ear'); if (!panel) return 'none'; const prompt = panel.querySelector('.ear-prompt')?.textContent ?? ''; const options = [...panel.querySelectorAll('.ear-option')].map(n => n.textContent.trim()); const kinds = [...panel.querySelectorAll('.ear-kinds .chip')].map(n => n.textContent.trim()); return [prompt.includes('哪一种') ? 'prompt' : 'noprompt', options.length, kinds.includes('和弦性质') ? 'kind' : 'nokind', options.filter(n => /和弦$/.test(n)).length].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    qualityInfo === "prompt|4|kind|4",
    "扒谱练习：和弦性质问「哪一种」，四个选项都是和弦名",
    qualityInfo,
  );

  // 9b3) 和弦性质分两档：切到七和弦，选项换成三种七和弦，题干不变
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-sets .chip')].find(n => n.textContent.includes('七和弦')); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const seventhInfo = String(
    js(
      "(() => { const panel = document.querySelector('.ear'); if (!panel) return 'none'; const prompt = panel.querySelector('.ear-prompt')?.textContent ?? ''; const options = [...panel.querySelectorAll('.ear-option')].map(n => n.textContent.trim()); const on = [...panel.querySelectorAll('.ear-sets .chip')].find(n => n.getAttribute('aria-pressed') === 'true')?.textContent ?? ''; return [prompt.includes('哪一种') ? 'prompt' : 'noprompt', options.length, options.every(n => /七和弦$/.test(n)) ? 'seventh' : 'mixed', on.includes('七和弦') ? 'on' : 'off'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    seventhInfo === "prompt|3|seventh|on",
    "扒谱练习：和弦性质第二档是七和弦（三个选项都是七和弦）",
    seventhInfo,
  );
  // 9b4) 第三档「挂留与强力」：选项是挂二 / 挂四 / 强力，没有大小之分
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-sets .chip')].find(n => n.textContent.includes('挂留')); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const openInfo = String(
    js(
      "(() => { const panel = document.querySelector('.ear'); if (!panel) return 'none'; const chips = [...panel.querySelectorAll('.ear-sets .chip')].length; const options = [...panel.querySelectorAll('.ear-option')].map(n => n.textContent.trim()); const on = [...panel.querySelectorAll('.ear-sets .chip')].find(n => n.getAttribute('aria-pressed') === 'true')?.textContent ?? ''; const kinds = options.every(n => /挂二|挂四|强力/.test(n)) ? 'open' : 'mixed'; return [chips, options.length, kinds, on.includes('挂留') ? 'on' : 'off'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(openInfo === "3|3|open|on", "扒谱练习：和弦性质第三档是挂留与强力（挂二 / 挂四 / 强力）", openInfo);
  // 切回三和弦，免得影响后面的断言
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-sets .chip')].find(n => n.textContent.includes('三和弦')); b?.click(); return 'ok'; })()",
  );
  await sleep(300);

  // 9b5) 听和弦能切到「一段扫弦」模式（按钮文案跟着变）
  const seqInfo = String(
    js(
      "(() => { const panel = document.querySelector('.chord-listen'); if (!panel) return 'none'; const chips = [...panel.querySelectorAll('.cl-modes .chip')]; const before = [...panel.querySelectorAll('.cl-controls button')][0]?.textContent.trim() ?? ''; chips.find(n => n.textContent.includes('一段'))?.click(); return [chips.length, before].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(400);
  const seqAfter = String(
    js(
      "(() => { const panel = document.querySelector('.chord-listen'); if (!panel) return 'none'; const btn = [...panel.querySelectorAll('.cl-controls button')][0]?.textContent.trim() ?? ''; const on = [...panel.querySelectorAll('.cl-modes .chip')].find(n => n.getAttribute('aria-pressed') === 'true')?.textContent ?? ''; return [btn, on.includes('一段') ? 'on' : 'off'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    seqInfo === "3|听一个和弦" && seqAfter.includes("听一段") && seqAfter.endsWith("|on"),
    "听和弦：能切成「一段扫弦」，按钮跟着变成「听一段（15 秒）」",
    `${seqInfo} → ${seqAfter}`,
  );

  // 9b6) 第三种模式「按住不放」：结果一直跟着变，按钮文案跟着换
  js(
    "(() => { const b = [...document.querySelectorAll('.cl-modes .chip')].find(n => n.textContent.includes('按住不放')); b?.click(); return 'ok'; })()",
  );
  await sleep(300);
  const holdInfo = String(
    js(
      "(() => { const panel = document.querySelector('.chord-listen'); const btn = [...panel.querySelectorAll('.cl-controls button')][0]?.textContent.trim() ?? ''; const on = [...panel.querySelectorAll('.cl-modes .chip')].find(n => n.getAttribute('aria-pressed') === 'true')?.textContent ?? ''; const hint = panel.querySelector('.cl-hint')?.textContent?.trim() ?? ''; return [btn, on.includes('按住不放') ? 'on' : 'off', hint.includes('按住') ? 'hint' : 'nohint'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    holdInfo.includes("按住不放") && holdInfo.endsWith("|on|hint"),
    "听和弦：有第三种模式「按住不放」，提示也跟着换",
    holdInfo,
  );
  // 切回「一个和弦」
  js(
    "(() => { const b = [...document.querySelectorAll('.cl-modes .chip')].find(n => n.textContent.includes('一个和弦')); b?.click(); return 'ok'; })()",
  );
  await sleep(300);

  // 9c) 扒谱练习：答一题，对错都有反馈，答完能进下一题
  js("(() => { [...document.querySelectorAll('.ear-option')][0]?.click(); return 'ok'; })()");
  await sleep(400);
  const earAnswer = String(
    js(
      "(() => { const feedback = document.querySelector('.ear-after .ear-feedback'); const nextBtn = [...document.querySelectorAll('.ear-after button')].find(n => n.textContent.includes('下一题') || n.textContent.includes('看结果')); return [feedback ? (feedback.className.includes('ok') ? 'ok' : 'bad') : 'nofeedback', nextBtn ? 'next' : 'nonext'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(earAnswer === "ok|next" || earAnswer === "bad|next", "扒谱练习：点一个选项立刻给对错，并出现「下一题」", earAnswer);

  // 9d) 扒谱页的录音工具：速度默认 90、网格三档、有提示
  const trInfo = String(
    js(
      "(() => { const panel = document.querySelector('.transcribe'); if (!panel) return 'none'; const start = [...panel.querySelectorAll('button')].find(n => n.textContent.trim() === '开始听'); const bpm = panel.querySelector('.tr-field input'); const grid = panel.querySelector('.tr-field select'); const hint = panel.querySelector('.tr-hint'); return [start ? 'start' : 'nostart', bpm ? bpm.value : 'nobpm', grid ? grid.options.length : 'nogrid', (hint?.textContent || '').includes('开始听') ? 'hint' : 'nohint'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    trInfo.startsWith("start|90|") && trInfo.endsWith("|hint"),
    "扒谱页的录音工具：速度默认 90、网格三档、有提示",
    trInfo,
  );

  // 9d2) 扒谱页能从音频文件导入（v0.79.0）：按钮是个 label，里面藏着 file input
  const fileInfo = String(
    js(
      "(() => { const panel = document.querySelector('.transcribe'); if (!panel) return 'none'; const label = panel.querySelector('.tr-file label'); const input = panel.querySelector('.tr-file input[type=file]'); const note = panel.querySelector('.tr-file-note'); return [label ? label.textContent.trim() : 'nolabel', input ? input.accept : 'noinput', (note?.textContent || '').includes('前 30 秒') ? 'note' : 'nonote'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    fileInfo === "导入音频文件|audio/*|note",
    "扒谱页：能从音频文件导入（只取前 30 秒）",
    fileInfo,
  );

  // 9e) 换成「级数判断」：题干会先让你听主音
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-kinds .chip')].find(n => n.textContent.trim() === '级数判断'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const degreeInfo = String(
    js(
      "(() => { const prompt = document.querySelector('.ear-prompt')?.textContent ?? ''; const options = document.querySelectorAll('.ear-option').length; const on = [...document.querySelectorAll('.ear-kinds .chip')].find(n => n.getAttribute('aria-pressed') === 'true')?.textContent ?? ''; return [prompt.includes('主音') ? 'tonic' : 'notonic', options, on].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(degreeInfo === "tonic|4|级数判断", "扒谱练习：级数判断会先让你听主音，四个选项", degreeInfo);

  // 9f) 听和弦：面板在「用」区，有按钮和提示（v0.76.0）
  const clInfo = String(
    js(
      "(() => { const panel = document.querySelector('.chord-listen'); if (!panel) return 'none'; const start = [...panel.querySelectorAll('button')].some(n => n.textContent.trim() === '听一个和弦'); const hint = panel.querySelector('.cl-hint')?.textContent ?? ''; const name = panel.querySelector('.cl-name'); return [start ? 'start' : 'nostart', hint.includes('按住一个和弦') ? 'hint' : 'nohint', name ? 'result' : 'noresult'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    clInfo === "start|hint|noresult",
    "扒谱页：有「听和弦」，没听过时只显示一句提示",
    clInfo,
  );

  // 9g) 级数走向：题干问「走向」，四个选项都是「1–5–6–4」这种写法（v0.77.0）
  js(
    "(() => { const b = [...document.querySelectorAll('.ear-kinds .chip')].find(n => n.textContent.trim() === '级数走向'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const progInfo = String(
    js(
      "(() => { const prompt = document.querySelector('.ear-prompt')?.textContent ?? ''; const options = [...document.querySelectorAll('.ear-option')].map(n => n.textContent.trim()); const dashed = options.every(t => /\\d–\\d/.test(t)); return [prompt.includes('走向') ? 'prog' : 'noprog', options.length, dashed ? 'dash' : 'nodash'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(progInfo === "prog|4|dash", "扒谱练习：级数走向的选项是「1–5–6–4」这种写法", progInfo);

  // 10) 乐理页：12 节课各配一张示范谱，滚完整页都加载出来
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '乐理'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const theoryBoxes = Number(
    String(js("(() => String(document.querySelectorAll('.lesson-tab').length))()")).replace(/"/g, ""),
  );
  // 一节一节滚过去：图是懒加载的，一口气滚到底有些图来不及进视口。
  for (let i = 0; i < theoryBoxes; i++) {
    js(`document.querySelectorAll('.lesson-tab')[${i}]?.scrollIntoView({ block: 'center' })`);
    await sleep(450);
  }
  let theoryImages = 0;
  for (let i = 0; i < 24; i++) {
    theoryImages = Number(
      String(
        js(
          "(() => String([...document.querySelectorAll('.lesson-tab img.tab-score')].filter(n => n.complete && n.naturalWidth > 0).length))()",
        ),
      ).replace(/"/g, ""),
    );
    if (theoryImages >= theoryBoxes && theoryBoxes > 0) break;
    await sleep(400);
  }
  log(
    theoryBoxes === 12 && theoryImages === 12,
    "乐理 12 节课各有一张示范谱",
    `读到 ${theoryImages}/${theoryBoxes}`,
  );

  // 11) 示范谱也能试听：点第 1 节的「试听」，谱上出现当前拍竖条
  const theoryPlay = js(
    "(() => { const b = document.querySelector('.lesson-tab .lesson-play'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  let theoryBand = "none";
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    theoryBand = String(
      js(
        "(() => { const b = document.querySelector('.lesson-tab .tab-score-beat'); return b ? `${b.style.left}|${b.style.top}` : 'none'; })()",
      ),
    ).replace(/^"|"$/g, "");
    if (theoryBand !== "none") break;
  }
  log(
    theoryPlay === '"ok"' && theoryBand !== "none" && theoryBand.includes("|"),
    "乐理：示范谱点「试听」也有当前拍竖条",
    theoryBand === "none" ? "没看到竖条" : theoryBand,
  );

  // 11b) 每节课末尾有「练一练」：点最后一节跳到节奏页那一条，并滚到眼前
  const goCount = Number(String(js("(() => String(document.querySelectorAll('.lesson-go').length))()")).replace(/^"|"$/g, ""));
  const goText = String(
    js("(() => { const list = [...document.querySelectorAll('.lesson-go')]; return list[list.length - 1]?.textContent?.trim() ?? ''; })()"),
  )
    .replace(/^"|"$/g, "")
    .replace(/\\"/g, '"');
  js("(() => { const list = [...document.querySelectorAll('.lesson-go')]; list[list.length - 1]?.click(); return 'ok'; })()");
  await sleep(1200);
  const goJump = JSON.parse(
    String(
      js(
        "(() => { const el = document.getElementById('drill-rd-01'); const r = el?.getBoundingClientRect(); return JSON.stringify({ hash: location.hash, inView: r ? r.top < window.innerHeight && r.bottom > 0 : false, flash: el?.classList.contains('flash') ?? false, h: r ? Math.round(r.height) : 0, vh: window.innerHeight }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    goCount === 12 && goText.includes("跟读练习") && goJump.hash === "#rhythm/drill-rd-01" && goJump.inView && goJump.flash,
    "乐理每节课末尾的「练一练」跳到那一条练习，并闪一下边框",
    `按钮 ${goCount} 个 · ${goJump.hash} · 在视口内 ${goJump.inView} · 闪烁 ${goJump.flash}`,
  );

  // 11c) 深链接进来也能定位（练习页那条在别的阶段，得先切阶段）
  ab(["open", `${URL}#practice/drill-s1-cycle`]);
  await sleep(1000);
  // 平滑滚动不一定在 1 秒内停稳（图还在加载时页面还会长高），轮询到稳定为止
  let deep = { found: false, inView: false };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    deep = JSON.parse(
      String(
        js(
          "(() => { const el = document.getElementById('drill-s1-cycle'); const r = el?.getBoundingClientRect(); return JSON.stringify({ found: Boolean(el), inView: r ? r.top >= 0 && r.bottom <= window.innerHeight : false }); })()",
        ),
      )
        .replace(/^"|"$/g, "")
        .replace(/\\"/g, '"'),
    );
    if (deep.found && deep.inView) break;
    await sleep(200);
  }
  log(
    deep.found && deep.inView,
    "深链接 #practice/drill-s1-cycle 直接落在那一条练习上",
    `找到 ${deep.found} · 在视口内 ${deep.inView}`,
  );
  ab(["open", URL]);
  await sleep(600);

  // 12) 练习页：节拍器默认是展开的，练习卡片能试听并出竖条
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '练习'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  const metronomeOpen = js(
    "(() => { const d = document.querySelector('.practice-metronome'); return d ? (d.hasAttribute('open') && d.querySelector('.metronome') ? 'ok' : 'closed') : 'none'; })()",
  );
  log(
    metronomeOpen === '"ok"',
    "练习页：节拍器默认就在页面上（不用点开）",
    metronomeOpen,
  );

  const practicePlay = js(
    "(() => { const b = document.querySelector('.practice-list .btn-quiet'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  let practiceBand = "none";
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    practiceBand = String(
      js(
        "(() => { const b = document.querySelector('.practice-list .tab-score-beat'); return b ? `${b.style.left}|${b.style.top}` : 'none'; })()",
      ),
    ).replace(/^"|"$/g, "");
    if (practiceBand !== "none") break;
  }
  log(
    practicePlay === '"ok"' && practiceBand !== "none" && practiceBand.includes("|"),
    "练习页：点试听也有当前拍竖条",
    practiceBand === "none" ? "没看到竖条" : practiceBand,
  );

  // 12b) 练习页也能跟练：计划里的每一块、卡片上的每一条都有「跟练」
  const practiceFollowBtns = Number(
    String(
      js(
        "(() => String([...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '跟练').length))()",
      ),
    ).replace(/^"|"$/g, ""),
  );
  log(practiceFollowBtns >= 9, "练习页：每条练习都有「跟练」按钮", `读到 ${practiceFollowBtns} 个`);

  const practiceFollowOpen = js(
    "(() => { const b = [...document.querySelectorAll('.practice-block .btn-quiet')].find((n) => n.textContent.trim() === '跟练'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(700);
  const followTitle = String(
    js("(() => { const h = document.querySelector('.follow-head h3'); return h ? h.textContent : 'none'; })()"),
  ).replace(/^"|"$/g, "");
  const followMeta = String(
    js("(() => { const p = document.querySelector('.follow-head p'); return p ? p.textContent : 'none'; })()"),
  ).replace(/^"|"$/g, "");
  log(
    practiceFollowOpen === '"ok"' && followTitle.startsWith("跟练 ·") && followMeta.includes("目标"),
    "练习页：点「跟练」能打开面板，带这条练习的起始与目标速度",
    `${followTitle} | ${followMeta}`,
  );

  const practiceFollowClose = js(
    "(() => { const b = [...document.querySelectorAll('.follow-head button')].find((n) => n.textContent.trim() === '收起'); if (!b) return 'no'; b.click(); return 'ok'; })()",
  );
  await sleep(500);
  const followGone = js("(() => (document.querySelector('.follow') ? 'still' : 'gone'))()");
  log(
    practiceFollowClose === '"ok"' && followGone === '"gone"',
    "练习页：点「收起」跟练面板就消失",
    followGone,
  );

  // 12c) 练习页：每块计划都写着「为什么今天练这条」（上次练几天前 / 还没练过）
  const dueInfo = String(
    js(
      "(() => { const blocks = document.querySelectorAll('.practice-block').length; const dues = [...document.querySelectorAll('.practice-block .pb-due')]; const ok = dues.filter(n => /^(上次练 \\d+ 天前|还没练过)/.test(n.textContent.trim())).length; return `${blocks}|${dues.length}|${ok}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  const [planBlocks, dueLines, dueOk] = dueInfo.split("|");
  log(
    Number(planBlocks) >= 4 && dueLines === planBlocks && dueOk === planBlocks,
    "练习页：每块计划都写了「上次练几天前 / 还没练过」",
    dueInfo,
  );

  // 12d) 练习页：「换一条」把这一块换成同组的另一条，块数不变
  const planNames = () =>
    String(
      js(
        "(() => [...document.querySelectorAll('.practice-block .pb-title h4')].map(n => n.textContent.trim()).join('|'))()",
      ),
    ).replace(/^"|"$/g, "");
  const planBefore = planNames();
  const swapped = String(
    js(
      "(() => { const swap = [...document.querySelectorAll('.practice-block button')].find(n => n.textContent.trim() === '换一条'); if (!swap) return 'no'; swap.click(); return 'ok'; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(500);
  const planAfter = planNames();
  log(
    swapped === "ok" &&
      planAfter.split("|").length === planBefore.split("|").length &&
      planAfter.split("|")[0] !== planBefore.split("|")[0],
    "练习页：点「换一条」这一块换人，块数不变",
    `${planBefore.split("|")[0]} → ${planAfter.split("|")[0]}`,
  );

  // 12e) 练习页：撤销把刚跳过的那块换回来
  const planToast = String(
    js("document.querySelector('.undo-toast')?.textContent ?? ''"),
  ).replace(/^"|"$/g, "");
  log(planToast.includes("已跳过"), "练习页跳过后也有「已跳过」的提示", planToast.trim());
  js("(() => { document.querySelector('.undo-toast-btn')?.click(); return 'ok'; })()");
  await sleep(500);
  const planUndo = planNames();
  log(
    planUndo === planBefore && Number(js("document.querySelectorAll('.undo-toast').length")) === 0,
    "练习页：点「撤销」这一块换回来",
    `${planAfter.split("|")[0]} → ${planUndo.split("|")[0]}`,
  );
  js("localStorage.removeItem('guitar.skips.v1')");

  // 12f) 练习页：勾完一块就滚到下一块，并亮一下（1.6 秒后自己褪掉）
  js("(() => { window.scrollTo(0, 0); return 'ok'; })()");
  await sleep(200);
  const beforeFinish = js("Math.round(window.scrollY)");
  js(
    "(() => { const b = document.querySelector('.practice-block .pb-head .btn.primary'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const finishState = JSON.parse(
    String(
      js(
        "(() => { const li = document.querySelector('.practice-block.next'); return JSON.stringify({ y: Math.round(window.scrollY), id: li?.getAttribute('data-block') ?? '' }); })()",
      ),
    ).replace(/^"|"$/g, "").replace(/\\"/g, '"'),
  );
  log(
    finishState.id !== "" && Number(finishState.y) > Number(beforeFinish),
    "练习页：勾完一块就滚到下一块，那一块会亮一下",
    `滚了 ${beforeFinish} → ${finishState.y}，高亮 ${finishState.id}`,
  );
  await sleep(1400);
  log(
    Number(js("document.querySelectorAll('.practice-block.next').length")) === 0,
    "练习页：高亮 1.6 秒后自己褪掉",
  );
  js("localStorage.removeItem('guitar.practice.v1')");

  // 12g) 练习页顶部：设了本周目标才出现那条进度，没设就不占地方
  const goalBefore = String(
    js("document.querySelectorAll('.week-goal').length"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const s = JSON.parse(localStorage.getItem('guitar.settings.v1') || '{}'); s.weeklyGoal = 60; localStorage.setItem('guitar.settings.v1', JSON.stringify(s)); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  const practiceGoal = JSON.parse(
    String(
      js(
        "(() => { const g = document.querySelector('.week-goal'); const bar = document.querySelector('.week-goal-bar'); return JSON.stringify({ present: !!g, text: document.querySelector('.week-goal-text')?.textContent?.trim() ?? '', percent: bar?.getAttribute('data-percent') ?? '', label: g?.getAttribute('aria-label') ?? '', note: document.querySelector('.week-goal-note')?.textContent?.trim() ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    goalBefore === "0" && practiceGoal.present && practiceGoal.text.endsWith("/ 60 分钟") && Number(practiceGoal.percent) >= 0,
    "练习页：设了本周目标，顶部就有那条进度",
    `设之前 ${goalBefore} 条 · 现在「${practiceGoal.text}」${practiceGoal.percent}% · ${practiceGoal.note}`,
  );
  // 点这一行能去统计页（改目标）
  js("(() => { document.querySelector('.week-goal')?.click(); return 'ok'; })()");
  await sleep(600);
  const goalJump = String(
    js(
      "(() => { const cur = document.querySelector('nav.tabs button[aria-current=\"page\"]'); return `${location.hash}|${cur?.textContent?.trim() ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(goalJump === "#stats|统计", "练习页：点那条本周目标会跳到统计页", goalJump);
  js(
    "(() => { const s = JSON.parse(localStorage.getItem('guitar.settings.v1') || '{}'); s.weeklyGoal = 0; localStorage.setItem('guitar.settings.v1', JSON.stringify(s)); return 'ok'; })()",
  );

  // 12h) 练习页也放一条听辨正确率（省得为了看趋势切到统计页）
  js(
    "(() => { localStorage.setItem('guitar.ear.v1', JSON.stringify({ rounds: 4, best: 6, lastAt: '2026-11-14', days: { '2026-11-09': { correct: 3, total: 8 }, '2026-11-14': { correct: 6, total: 8 } }, byKind: { position: { correct: 9, total: 16 } } })); return 'ok'; })()",
  );
  ab(["open", `${URL}#practice`]);
  await sleep(900);
  const practiceTrend = JSON.parse(
    String(
      js(
        "(() => { const t = document.querySelector('.ear-trend-compact'); if (!t) return JSON.stringify({ present: false }); return JSON.stringify({ present: true, text: t.innerText.replace(/\\s+/g, ' ').trim(), path: t.querySelector('path')?.getAttribute('d')?.slice(0, 1) ?? '', jump: !!t.querySelector('button') }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    practiceTrend.present && practiceTrend.text.includes("38% → 75%") && practiceTrend.path === "M" && practiceTrend.jump,
    "练习页：顶部也有一条听辨正确率（还带「去练听辨」）",
    practiceTrend.text,
  );
  js("localStorage.removeItem('guitar.ear.v1')");

  // 12i) v0.102.0：练习页顶部提一句「最近最卡的是第几级」
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'pattern-h1': { bestBpm: 90, sessions: 2, minutes: 3, lastAt: now, hardest: { bar: 3, degree: 5, name: 'G', count: 4 } }, 'pattern-h2': { bestBpm: 88, sessions: 1, minutes: 2, lastAt: now, hardest: { bar: 1, degree: 5, name: 'G', count: 1 } } })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  const practiceHard = JSON.parse(
    String(
      js(
        "(() => { const el = document.querySelector('.practice-hardest'); if (!el) return JSON.stringify({ present: false }); return JSON.stringify({ present: true, text: el.innerText.replace(/\\s+/g, ' ').trim(), tag: el.tagName }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    practiceHard.present &&
      practiceHard.text.includes("第 5 级（G）") &&
      practiceHard.text.includes("2 条练习") &&
      practiceHard.tag === "BUTTON",
    "练习页：顶部提一句最近最卡的是第几级（整行是按钮）",
    practiceHard.text,
  );

  // 12j) v0.102.0：跟练里「加进今日计划」的那一条会出现在练习页
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = { beatsPerBar: 4, bars: 1, bpm: [120, 120], caption: 'C–Am–G', notes: [{ s: 3, f: 0, beat: 0, dur: 4 }, { s: 2, f: 0, beat: 0, dur: 4 }, { s: 2, f: 3, beat: 0, dur: 4 }] }; localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-t1', date: now, title: '最卡的一小节 · 和弦进行 · C–Am–G 第 3 小节', tab, meter: '4/4', bpm: 120, addedAt: Date.now() }])); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  const extraInfo = JSON.parse(
    String(
      js(
        "(() => { const list = document.querySelector('.practice-extras'); const head = [...document.querySelectorAll('.practice-h3')].map(h => h.innerText.replace(/\\s+/g, ' ').trim()).find(t => t.includes('今天自己加的')) ?? ''; return JSON.stringify({ cards: list ? list.querySelectorAll('.practice-extra').length : 0, head, buttons: list ? [...list.querySelectorAll('button')].map(b => b.textContent.trim()) : [] }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    extraInfo.cards === 1 &&
      extraInfo.head.includes("今天自己加的 1 条") &&
      extraInfo.buttons.includes("跟练") &&
      extraInfo.buttons.includes("删掉"),
    "练习页：跟练里加进来的那一条在「今天自己加的」里",
    `${extraInfo.cards} 张 · ${extraInfo.buttons.join("/")}`,
  );

  // 12k) v0.103.0：那条能勾掉，勾完进当天日志（统计页的「加餐」就是读这个）
  js(
    "(() => { const btn = [...document.querySelectorAll('.practice-extra button')].find(b => b.textContent.trim() === '完成'); btn?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const extraDone = JSON.parse(
    String(
      js(
        "(() => { const card = document.querySelector('.practice-extra'); const log = JSON.parse(localStorage.getItem('guitar.practice.v1') || '{}'); const days = Object.values(log); const done = days.some((day) => (day?.done ?? []).includes('extra-t1')); return JSON.stringify({ done: card?.classList.contains('done') ?? false, logged: done, label: card ? [...card.querySelectorAll('button')].map(b => b.textContent.trim()).join('/') : '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    extraDone.done && extraDone.logged && extraDone.label.includes("已勾"),
    "练习页：自己加的那条能勾掉，勾完写进当天日志",
    `${extraDone.done ? "done" : "no-done"} · ${extraDone.logged ? "logged" : "unlogged"} · ${extraDone.label}`,
  );

  // 12l) v0.103.0：练习库里任意一条都能手动加进今日计划
  const addPlan = JSON.parse(
    String(
      js(
        "(() => { const card = document.querySelector('.drill-card'); const btn = [...(card?.querySelectorAll('.drill-actions button') ?? [])].find(b => b.textContent.trim() === '加进今日计划'); const name = card?.querySelector('h4')?.textContent?.trim() ?? ''; btn?.click(); return JSON.stringify({ name, had: Boolean(btn) }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  await sleep(700);
  const extrasAfter = JSON.parse(
    String(
      js(
        "(() => { const list = document.querySelector('.practice-extras'); const titles = [...(list?.querySelectorAll('.practice-extra h4') ?? [])].map(h => h.textContent.trim()); return JSON.stringify({ titles }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    addPlan.had && extrasAfter.titles.length === 2 && extrasAfter.titles.includes(addPlan.name),
    "练习页：练习库里任意一条都能加进今日计划",
    `${addPlan.name} → ${extrasAfter.titles.join("/")}`,
  );

  // 12m) v0.103.0：统计页「加餐」那张卡看得到今天加了几条、勾了几条
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const extraCard = String(
    js(
      "(() => { const card = [...document.querySelectorAll('.stat-card')].find(c => c.textContent.includes('今天自己加的')); return card ? card.textContent.replace(/\\s+/g, ' ').trim() : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    extraCard.includes("2") && extraCard.includes("今天自己加的"),
    "统计页：今天自己加的练了几条，完成度看得见",
    extraCard,
  );

  // 12n) v0.104.0：「加餐」那张卡能点，回练习页那一段
  // v0.105.0 起：多条时直接落到还没勾的那一条，所以这里只要求落在练习页、目标在视口内
  js(
    "(() => { const card = [...document.querySelectorAll('.stat-card-link')].find(c => c.textContent.includes('今天自己加的')); card?.click(); return 'ok'; })()",
  );
  await sleep(900);
  const extrasJump = String(
    js(
      "(() => { const anchor = document.getElementById('practice-extras'); const extra = [...document.querySelectorAll('.practice-extra')].find(li => location.hash.endsWith(`#practice/${li.id}`) || location.hash.endsWith(`/${li.id}`)); const target = extra ?? anchor; const tab = [...document.querySelectorAll('nav.tabs button')].find(n => n.getAttribute('aria-current') === 'page'); const rect = target?.getBoundingClientRect(); return `${location.hash}|${tab?.textContent?.trim() ?? ''}|${rect ? (rect.top < innerHeight && rect.bottom > 0 ? 'inview' : 'out') : 'missing'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    extrasJump.startsWith("#practice/") && extrasJump.includes("|练习|inview"),
    "统计页：点「加餐」那张卡回练习页那一段",
    extrasJump,
  );

  // 12o) v0.104.0：节奏页 103 条也能加进今日计划
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const rhythmAdd = JSON.parse(
    String(
      js(
        "(() => { const card = document.querySelector('.drill-card'); const btn = [...(card?.querySelectorAll('.drill-actions button') ?? [])].find(b => b.textContent.trim() === '加进今日计划'); const title = card?.querySelector('h4')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''; btn?.click(); const plan = JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]'); return JSON.stringify({ had: Boolean(btn), title, plan: plan.map(p => p.title), disabled: [...(card?.querySelectorAll('.drill-actions button') ?? [])].some(b => b.textContent.trim() === '已在计划里') }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  await sleep(600);
  const rhythmPlan = JSON.parse(
    String(
      js(
        "(() => { const plan = JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]'); return JSON.stringify({ titles: plan.map(p => p.title) }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    rhythmAdd.had && rhythmPlan.titles.includes(rhythmAdd.title),
    "节奏页：任意一条都能加进今日计划",
    `${rhythmAdd.title} → ${rhythmPlan.titles.join("/")}`,
  );

  // 12p) v0.104.0：加餐的名字跟着记录走，统计页不显示 `p:extra-…` 这种 id
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const record = { 'p:extra-t9': { bestBpm: 96, sessions: 1, minutes: 2, lastAt: today, title: '最卡的一小节 · 和弦进行 · C–Am–G 第 3 小节', hardest: { bar: 3, degree: 5, name: 'G', count: 3 } } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(record)); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(800);
  const extraName = String(
    js(
      "(() => { const row = document.querySelector('[data-hardest-item=\"p:extra-t9\"]'); return row ? row.textContent.replace(/\\s+/g, ' ').trim() : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    extraName.includes("最卡的一小节") && !extraName.includes("p:extra-t9"),
    "统计页：加餐的名字跟着记录走，不显示 id",
    extraName.slice(0, 48),
  );

  // 12q) v0.105.0：加餐能调顺序（↑↓），顺序写回 guitar.plan.v1
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = (name) => ({ beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: name, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }); const base = Date.now(); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-a', date: today, title: '甲 · 一小节', tab: tab('甲'), meter: '4/4', bpm: 90, addedAt: base }, { id: 'extra-b', date: today, title: '乙 · 一小节', tab: tab('乙'), meter: '4/4', bpm: 90, addedAt: base + 1 }])); return 'ok'; })()",
  );
  ab(["open", `${URL}#practice`]);
  await sleep(900);
  js(
    "(() => { const btn = [...document.querySelectorAll('.practice-extra')].find(li => li.id === 'extra-a')?.querySelector('.pb-move-btn[aria-label*=\"往后\"]'); btn?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const orderInfo = JSON.parse(
    String(
      js(
        "(() => { const dom = [...document.querySelectorAll('.practice-extra')].map(li => li.id); const plan = JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]').map(p => p.id); return JSON.stringify({ dom, plan }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    orderInfo.dom.join(",") === "extra-b,extra-a" && orderInfo.plan.join(",") === "extra-b,extra-a",
    "练习页：加餐能调顺序，顺序写回计划",
    `${orderInfo.dom.join("/")} · ${orderInfo.plan.join("/")}`,
  );

  // 12r) v0.105.0：统计页加餐卡落到还没勾的那一条
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; localStorage.setItem('guitar.practice.v1', JSON.stringify({ [today]: { minutes: 3, stage: 0, done: ['extra-b'] } })); return 'ok'; })()",
  );
  ab(["open", `${URL}#stats`]);
  await sleep(900);
  js(
    "(() => { const card = document.querySelector('.stat-card-link'); card?.click(); return 'ok'; })()",
  );
  await sleep(900);
  const jumpInfo = String(
    js(
      "(() => { const target = document.getElementById('extra-a'); const rect = target?.getBoundingClientRect(); return `${location.hash}|${target ? (rect.top < innerHeight && rect.bottom > 0 ? 'inview' : 'out') : 'missing'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    jumpInfo.startsWith("#practice/extra-a|inview"),
    "统计页：加餐卡落到还没勾的那一条",
    jumpInfo,
  );

  // 12s) v0.106.0：拖到另一条身上会画一条插入线，松手就按落点重排
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = (name) => ({ beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: name, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }); const base = Date.now(); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-a', date: today, title: '甲 · 一小节', tab: tab('甲'), meter: '4/4', bpm: 90, addedAt: base }, { id: 'extra-b', date: today, title: '乙 · 一小节', tab: tab('乙'), meter: '4/4', bpm: 90, addedAt: base + 1 }])); localStorage.removeItem('guitar.practice.v1'); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  const dragStartInfo = String(
    js(
      "(() => { const items = [...document.querySelectorAll('.practice-extra')]; const a = items[0]; const rect = a.getBoundingClientRect(); a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, clientX: rect.left + 40, clientY: rect.top + 4 })); return items.map(li => li.id).join(','); })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(250);
  js(
    "(() => { const b = [...document.querySelectorAll('.practice-extra')][1]; const rect = b.getBoundingClientRect(); b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 40, clientY: rect.top + rect.height - 6 })); return 'ok'; })()",
  );
  await sleep(300);
  const lineClass = String(
    js(
      "(() => { const b = [...document.querySelectorAll('.practice-extra')][1]; const line = b.querySelector('.pb-drop-line'); return line ? line.className : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.practice-extra')][1]; const rect = b.getBoundingClientRect(); b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 40, clientY: rect.top + rect.height - 6 })); return 'ok'; })()",
  );
  await sleep(600);
  const dropAfter = String(
    js("(() => [...document.querySelectorAll('.practice-extra')].map(li => li.id).join(','))()"),
  ).replace(/^"|"$/g, "");
  log(
    lineClass.includes("pb-drop-line") &&
      lineClass.includes("after") &&
      dropAfter === "extra-b,extra-a",
    "练习页：拖到另一条身上有插入线，松手按落点重排",
    `${dragStartInfo} · ${lineClass} · ${dropAfter}`,
  );

  // 12t) v0.107.0：拖到列表末尾那条落点上，直接排到最后
  const draggedId = String(
    js(
      "(() => { const a = document.querySelectorAll('.practice-extra')[0]; const rect = a.getBoundingClientRect(); a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, clientX: rect.left + 40, clientY: rect.top + 4 })); return a.id; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(250);
  const dropEndShown = String(
    js(
      "(() => { const zone = document.querySelector('.practice-drop-end'); if (!zone) return 'none'; zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true })); return 'shown'; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(300);
  js(
    "(() => { const zone = document.querySelector('.practice-drop-end.on'); zone?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true })); return 'ok'; })()",
  );
  await sleep(600);
  const endOrder = String(
    js("(() => [...document.querySelectorAll('.practice-extra')].map(li => li.id).join(','))()"),
  ).replace(/^"|"$/g, "");
  log(
    dropEndShown === "shown" &&
      endOrder.split(",").length === 2 &&
      endOrder.endsWith(draggedId),
    "练习页：拖到列表末尾的落点上，直接排最后",
    `${draggedId} · ${dropEndShown} · ${endOrder}`,
  );

  // 12u) v0.108.0：加餐按阶段分组（顺序不动，只在换组的地方插一行小标题）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = (name) => ({ beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: name, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }); const base = Date.now(); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-a', date: today, title: '单弦爬格子', tab: tab('甲'), meter: '4/4', bpm: 90, addedAt: base, stage: 0 }, { id: 'extra-b', date: today, title: '和弦谱 · C–Am', tab: tab('乙'), meter: '4/4', bpm: 90, addedAt: base + 1 }, { id: 'extra-c', date: today, title: '换把练习', tab: tab('丙'), meter: '4/4', bpm: 90, addedAt: base + 2, stage: 2 }])); localStorage.removeItem('guitar.practice.v1'); return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(1100);
  js("document.getElementById('practice-extras')?.scrollIntoView({ block: 'start' })");
  await sleep(300);
  const groupInfo = String(
    js("(() => [...document.querySelectorAll('.extras-group')].map(el => el.textContent.trim()).join(' / '))()"),
  ).replace(/^"|"$/g, "");
  log(
    groupInfo.includes("第 1 阶段") && groupInfo.includes("其他") && groupInfo.includes("第 3 阶段"),
    "练习页：加餐按阶段分组，换组的地方插一行小标题",
    groupInfo,
  );

  // 12v) v0.108.0：长按拿起来，再点另一条就插到它前面
  const heldInfo = String(
    js(
      "(() => { const li = document.querySelectorAll('.practice-extra')[0]; const head = li.querySelector('h4'); const id = li.id; head.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); return id; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(650);
  const heldState = String(
    js(
      "(() => { const held = document.querySelector('.practice-extra.held'); const hint = document.querySelector('.extras-held'); return `${held ? held.id : 'none'}|${hint ? 'hint' : 'nohint'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const target = document.querySelectorAll('.practice-extra')[2]; target.querySelector('h4').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return 'ok'; })()",
  );
  await sleep(600);
  const heldOrder = String(
    js("(() => [...document.querySelectorAll('.practice-extra')].map(li => li.id).join(','))()"),
  ).replace(/^"|"$/g, "");
  const heldPlan = String(
    js("(() => JSON.parse(localStorage.getItem('guitar.plan.v1') || '[]').map(p => p.id).join(','))()"),
  ).replace(/^"|"$/g, "");
  log(
    heldState === `${heldInfo}|hint` &&
      heldOrder.split(",")[1] === heldInfo &&
      heldPlan === heldOrder,
    "练习页：长按拿起一条，点另一条就插到它前面",
    `${heldInfo} · ${heldState} · ${heldOrder}`,
  );

  // 12w) v0.109.0：拿着一条时，其余几条淡虚线提示「可以放这儿」
  const firstExtra = String(
    js("(() => document.querySelectorAll('.practice-extra')[0]?.id ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const li = document.querySelectorAll('.practice-extra')[0]; li.querySelector('h4').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); return 'ok'; })()",
  );
  await sleep(650);
  const droppableInfo = String(
    js(
      "(() => { const held = document.querySelector('.practice-extra.held')?.id ?? 'none'; const rest = [...document.querySelectorAll('.practice-extra.droppable')].map(li => li.id).join(','); const dashed = [...document.querySelectorAll('.practice-extra.droppable')].every(li => getComputedStyle(li).borderStyle === 'dashed'); return `${held}|${rest}|${dashed ? 'dashed' : 'solid'}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    droppableInfo === `${firstExtra}|${["extra-a", "extra-b", "extra-c"].filter((id) => id !== firstExtra).join(",")}|dashed`,
    "练习页：拿着一条时，其余几条淡虚线提示可以放这儿",
    droppableInfo,
  );
  // 放下（点自己取消），免得影响下面
  js(
    "(() => { document.querySelector('.practice-extra.held h4')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return 'ok'; })()",
  );
  await sleep(400);

  // 12x) v0.109.0：分组标题能收起这一组，再点展开还在原来的位置
  const orderBefore = String(
    js("(() => [...document.querySelectorAll('.practice-extra')].map(li => li.id).join(','))()"),
  ).replace(/^"|"$/g, "");
  const firstGroupId = orderBefore.split(",")[0];
  const groupToggleInfo = String(
    js(
      "(() => { const btns = [...document.querySelectorAll('.extras-group-toggle')]; return btns.map(b => b.getAttribute('aria-expanded')).join(','); })()",
    ),
  ).replace(/^"|"$/g, "");
  js("document.querySelectorAll('.extras-group-toggle')[0]?.click()");
  await sleep(400);
  const collapsedInfo = String(
    js(
      "(() => { const expanded = [...document.querySelectorAll('.extras-group-toggle')].map(b => b.getAttribute('aria-expanded')).join(','); const visible = [...document.querySelectorAll('.practice-extra')].filter(li => !li.hidden).map(li => li.id).join(','); return `${expanded}|${visible}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("document.querySelectorAll('.extras-group-toggle')[0]?.click()");
  await sleep(400);
  const expandedAgain = String(
    js(
      "(() => [...document.querySelectorAll('.practice-extra')].filter(li => !li.hidden).map(li => li.id).join(','))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    groupToggleInfo === "true,true,true" &&
      collapsedInfo === `false,true,true|${orderBefore.split(",").slice(1).join(",")}` &&
      expandedAgain === orderBefore &&
      !expandedAgain.split(",").includes("") ,
    "练习页：分组能收起，再点展开顺序不变",
    `${orderBefore} → 收起 ${firstGroupId}: ${collapsedInfo} → ${expandedAgain}`,
  );

  // 12y) v0.110.0：分组标题带「几条 · 多少分钟」，收起的组刷新之后还是收着的
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'p:extra-a': { bestBpm: 90, sessions: 1, minutes: 12, lastAt: today }, 'p:extra-c': { bestBpm: 70, sessions: 1, minutes: 8, lastAt: today } })); localStorage.removeItem('guitar.extras.closed.v1'); return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(1000);
  js("document.getElementById('practice-extras')?.scrollIntoView({ block: 'start' })");
  await sleep(300);
  const groupMeta = String(
    js(
      "(() => [...document.querySelectorAll('.extras-group-toggle')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()).join(' / '))()",
    ),
  ).replace(/^"|"$/g, "");
  const stageIndex = Number(
    String(
      js(
        "(() => [...document.querySelectorAll('.extras-group-toggle')].findIndex(b => b.textContent.includes('第 1 阶段')))()",
      ),
    ).replace(/^"|"$/g, ""),
  );
  js(`document.querySelectorAll('.extras-group-toggle')[${stageIndex}]?.click()`);
  await sleep(400);
  const closedStored = String(
    js(
      "(() => { const v = JSON.parse(localStorage.getItem('guitar.extras.closed.v1') || '{}'); return `${Object.keys(v).join(',')}|${String(v['stage-0'])}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  await ab(["reload"]);
  await sleep(1000);
  js("document.getElementById('practice-extras')?.scrollIntoView({ block: 'start' })");
  await sleep(300);
  const afterReload = String(
    js(
      `(() => { const btn = document.querySelectorAll('.extras-group-toggle')[${stageIndex}]; return \`\${btn?.getAttribute('aria-expanded')}|\${document.querySelectorAll('.practice-extra[hidden]').length}\`; })()`,
    ),
  ).replace(/^"|"$/g, "");
  log(
    groupMeta.includes("1 条 · 12 分钟") &&
      groupMeta.includes("1 条 · 8 分钟") &&
      closedStored === "stage-0|true" &&
      afterReload === "false|1",
    "练习页：分组标题带「几条 · 多少分钟」，收起的组刷新后还在",
    `${groupMeta} · ${closedStored} · ${afterReload}`,
  );
  // 还原：再展开、清掉记下的收起状态，别影响后面的用例
  js(`document.querySelectorAll('.extras-group-toggle')[${stageIndex}]?.click()`);
  await sleep(300);
  js("localStorage.removeItem('guitar.extras.closed.v1')");

  js("localStorage.removeItem('guitar.plan.v1')");
  js("localStorage.removeItem('guitar.practice.v1')");
  js("localStorage.removeItem('guitar.rhythm.v1')");

  // 13) 统计页：节奏与伴奏那一段（六块完成度 + 最高速度）
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const statsInfo = String(
    js(
      "(() => { const groups = document.querySelectorAll('.stat-group').length; const head = [...document.querySelectorAll('.stat-sub')].some(n => n.textContent.trim() === '节奏与伴奏'); const card = [...document.querySelectorAll('.stat-card')].find(n => n.textContent.includes('最高速度')); const bpm = card ? card.querySelector('b').textContent.trim() : 'none'; return `${groups}|${head ? 'head' : 'nohead'}|${/^(\\d+ BPM|—)$/.test(bpm) ? 'bpm' : bpm}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    statsInfo === "6|head|bpm",
    "统计页：有「节奏与伴奏」，六块完成度与最高速度都在",
    statsInfo,
  );

  // 13b) 统计页：练习热力图（一列一周 × 7 行，共 N 周）
  const heatInfo = String(
    js(
      "(() => { const heat = document.querySelector('.heat'); if (!heat) return 'none'; const cells = heat.querySelectorAll('.heat-grid .heat-cell').length; const weeks = heat.querySelectorAll('.heat-grid').length ? Math.round(cells / 7) : 0; const label = heat.getAttribute('aria-label') || ''; const levels = new Set([...heat.querySelectorAll('.heat-grid .heat-cell')].map((c) => c.className.match(/lv(\\d)/)[1])).size; return `${cells}|${weeks}|${label.includes('热力图') ? 'label' : 'nolabel'}|${levels}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  const [heatCells, heatWeeks, heatLabel] = heatInfo.split("|");
  log(
    Number(heatCells) % 7 === 0 && Number(heatWeeks) >= 18 && heatLabel === "label",
    "统计页：练习热力图是「一列一周」的格子图",
    heatInfo,
  );

  // 13b2) 统计页：「这一周 vs 上周同期」——种记录，卡片上要有正数差和起算日
  // 日期按「今天」算：写死日期一到下一周就会假失败（2026-11-16 就踩过）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const today = new Date(); const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return iso(d); }; const monday = (today.getDay() + 6) % 7; const log = {}; for (let i = 0; i <= monday; i += 1) { log[day(-i)] = { minutes: 30, stage: 0, done: ['s0-crawl'] }; log[day(-i - 7)] = { minutes: 20, stage: 0, done: ['s0-crawl'] }; } localStorage.setItem('guitar.practice.v1', JSON.stringify(log)); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const weekInfo = JSON.parse(
    String(
      js(
        "(() => { const up = document.querySelector('.stat-card b.stat-up'); const hint = document.querySelector('.week-hint'); return JSON.stringify({ up: up?.textContent?.trim() ?? '', hint: hint?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    weekInfo.up.startsWith("+") && weekInfo.hint.includes("起算") && weekInfo.hint.includes("上周同期"),
    "统计页：「这一周」跟上周同期比，多练了会标绿",
    `${weekInfo.up} · ${weekInfo.hint.slice(0, 40)}`,
  );

  // 13b3) 统计页：本周目标——点一个分钟数就出进度条，点「不设」收回去
  js(
    "(() => { const chip = [...document.querySelectorAll('.goal-chips .chip')].find(c => c.textContent.trim() === '60 分钟'); chip?.click(); return 'ok'; })()",
  );
  await sleep(400);
  const goalOn = JSON.parse(
    String(
      js(
        "(() => { const bar = document.querySelector('.goal-bar'); const num = document.querySelector('.goal-num'); const s = JSON.parse(localStorage.getItem('guitar.settings.v1') || '{}'); return JSON.stringify({ bar: !!bar, now: bar?.getAttribute('aria-valuenow') ?? '', num: num?.textContent?.trim() ?? '', foot: document.querySelector('.goal-foot .muted')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '', saved: s.weeklyGoal ?? 0 }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    goalOn.bar && Number(goalOn.now) >= 0 && goalOn.num.endsWith("/ 60 分钟") && goalOn.saved === 60,
    "统计页：点「60 分钟」出本周目标进度条，并记进设置",
    `${goalOn.num} · ${goalOn.now}% · saved=${goalOn.saved}`,
  );
  // 「还差 30 分钟」后面要跟一句「接下来每天 X 分钟」（周日则换成「这周就剩今天了」）
  log(
    /(接下来每天 \d+ 分钟就够|这周就剩今天了|这周目标达成了)/.test(goalOn.foot),
    "统计页：还差多少会摊到每天（不是只报一个总数）",
    goalOn.foot,
  );
  js(
    "(() => { const chip = [...document.querySelectorAll('.goal-chips .chip')].find(c => c.textContent.trim() === '不设'); chip?.click(); return 'ok'; })()",
  );
  await sleep(400);
  const goalOff = String(
    js(
      "(() => { const bar = document.querySelector('.goal-bar'); const num = document.querySelector('.goal-num'); return `${bar ? 'bar' : 'nobar'}|${num?.textContent?.trim() ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(goalOff === "nobar|还没设", "统计页：点「不设」把进度条收回去", goalOff);

  // 13b4) 统计页：连着两周都练够，头上挂一个「连续 2 周达成」
  js(
    "(() => { localStorage.setItem('guitar.goals.v1', JSON.stringify({ '2026-11-02': 30, '2026-11-09': 30 })); localStorage.setItem('guitar.practice.v1', JSON.stringify({ '2026-11-05': { minutes: 40, stage: 0, done: ['s0-crawl'] }, '2026-11-13': { minutes: 40, stage: 0, done: ['s0-scale'] } })); localStorage.setItem('guitar.settings.v1', JSON.stringify({ weeklyGoal: 30 })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const streakText = String(
    js(
      "(() => { const el = document.querySelector('.goal-streak'); return el ? el.textContent.trim() : ''; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    streakText.includes("连续 2 周达成"),
    "统计页：连着两周都练够，头上挂「连续 2 周达成」",
    streakText || "(没有)",
  );
  js(
    "(() => { localStorage.removeItem('guitar.goals.v1'); localStorage.removeItem('guitar.practice.v1'); localStorage.removeItem('guitar.settings.v1'); return 'ok'; })()",
  );

  // 13b5) 统计页：这串断了，也要把上一串说出来（「上次连续 3 周」）
  // 同样按今天算：往前第 1/2/3 周达成，这周不达成
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const today = new Date(); const monday = new Date(today); monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7)); const week = (back) => { const d = new Date(monday); d.setDate(d.getDate() - back * 7); return iso(d); }; const goals = {}; const log = {}; goals[week(1)] = 30; log[week(1)] = { minutes: 5, stage: 0, done: [] }; for (const back of [2, 3, 4]) { goals[week(back)] = 30; log[week(back)] = { minutes: 40, stage: 0, done: [] }; } localStorage.setItem('guitar.goals.v1', JSON.stringify(goals)); localStorage.setItem('guitar.practice.v1', JSON.stringify(log)); localStorage.setItem('guitar.settings.v1', JSON.stringify({ weeklyGoal: 30 })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const lastStreak = String(
    js("(() => { const el = document.querySelector('.goal-last'); return el ? el.textContent.trim() : ''; })()"),
  ).replace(/^"|"$/g, "");
  log(
    lastStreak.includes("上次连续 3 周"),
    "统计页：这串断了，也要把「上次连续 3 周」说出来",
    lastStreak || "(没有)",
  );
  js(
    "(() => { localStorage.removeItem('guitar.goals.v1'); localStorage.removeItem('guitar.practice.v1'); localStorage.removeItem('guitar.settings.v1'); return 'ok'; })()",
  );

  // 13b6) 统计页：周报——这周练了几天、最勤哪天、哪块落下了
  // 种「从周一到现在」的每天记录：数字随今天是周几变，所以断言只看结构
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const today = new Date(); const monday = (today.getDay() + 6) % 7; const log = {}; for (let i = 0; i <= monday; i += 1) { const d = new Date(today); d.setDate(d.getDate() - i); log[iso(d)] = { minutes: 20, stage: 0, done: i % 2 === 0 ? ['s0-crawl', 's0-scale'] : ['s1-chord'] }; } localStorage.setItem('guitar.practice.v1', JSON.stringify(log)); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const reportText = String(
    js("(() => document.querySelector('.report')?.innerText?.replace(/\\n/g, ' | ') ?? '')()"),
  ).replace(/^"|"$/g, "");
  log(
    reportText.includes("练了") &&
      reportText.includes("分钟") &&
      reportText.includes("最勤的是周") &&
      reportText.includes("下周先补"),
    "统计页：周报说清这周练了几天、最勤哪天、哪块落下了",
    reportText,
  );
  js("(() => { localStorage.removeItem('guitar.practice.v1'); return 'ok'; })()");

  // 13c) 统计页：点热力图的一格，展开那天练了什么；再点一次收起
  const heatDate = String(
    js(
      "(() => { const cells = [...document.querySelectorAll('.heat-grid .heat-cell')].filter(c => !c.disabled); const cell = cells.at(-1); if (!cell) return 'noday'; const date = (cell.getAttribute('aria-label') || '').slice(0, 10); cell.click(); return date; })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(300);
  const heatDetail = String(
    js(
      "(() => { const d = document.querySelector('.heat-detail'); return d ? d.innerText.replace(/\\n/g, ' ') : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    /^\d{4}-\d{2}-\d{2}$/.test(heatDate) && heatDetail.includes(heatDate),
    "统计页：点一格能看到那天练了什么",
    heatDetail,
  );
  js("document.querySelector('.heat-detail .btn-quiet')?.click() ?? null");
  await sleep(250);
  const heatClosed = String(
    js("String(document.querySelectorAll('.heat-detail').length)"),
  ).replace(/^"|"$/g, "");
  log(heatClosed === "0", "统计页：关掉后明细就消失", heatClosed);

  // 13d) 统计页：跟练进步曲线（两天以上才画；这里塞一条三天的记录再刷一次）
  js(
    "(() => { localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'rd-01': { bestBpm: 96, sessions: 4, minutes: 20, lastAt: '2026-11-12', history: [{ date: '2026-10-01', bpm: 62 }, { date: '2026-10-20', bpm: 80 }, { date: '2026-11-12', bpm: 96 }] } })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(1400);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const curveInfo = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('.curve-list li')]; if (!rows.length) return 'none'; const d = rows[0].querySelector('.curve-svg path')?.getAttribute('d') || ''; const label = rows[0].querySelector('.curve-svg')?.getAttribute('aria-label') || ''; const name = rows[0].querySelector('.curve-name')?.textContent || ''; return `${rows.length}|${d.startsWith('M') ? 'path' : 'nopath'}|${label.includes('BPM') ? 'bpm' : 'nobpm'}|${name}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  const [curveCount, curvePath, curveLabel, curveName] = curveInfo.split("|");
  log(
    curveCount === "1" && curvePath === "path" && curveLabel === "bpm" && curveName.includes("练习 1"),
    "统计页：跟练进步画成一条折线",
    curveInfo,
  );

  // 13f) 跳过小结：今天跳过的两条、最近一周最常跳过的
  js(
    "(() => { const k = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(); const old = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(); localStorage.setItem('guitar.skips.v1', JSON.stringify({ [k]: ['rd-01', 's0-crawl'], [old]: ['rd-01'] })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(1400);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const skipInfo = String(
    js(
      "(() => [...document.querySelectorAll('.skip-line')].map(n => n.textContent.trim()).join(' | '))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    skipInfo.includes("今天跳过的") &&
      skipInfo.includes("2 条") &&
      skipInfo.includes("最常跳过") &&
      skipInfo.includes("×2"),
    "统计页：今天跳过的两条、最常跳过的都在",
    skipInfo,
  );
  js("localStorage.removeItem('guitar.skips.v1')");

  // 13g) 先不练的：统计页列出来，点「恢复」提前放回来
  js(
    "(() => { const d = new Date(); const k = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }; localStorage.setItem('guitar.pauses.v1', JSON.stringify({ 's0-crawl': k(6), 'rd-01': k(3) })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(1400);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const pauseRows = String(
    js(
      "(() => [...document.querySelectorAll('.pause-item')].map(n => n.textContent.trim().replace(/\\s+/g, ' ')).join(' | '))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    Number(js("document.querySelectorAll('.pause-item').length")) === 2 &&
      pauseRows.includes("单弦爬格子（1-2-3-4）") &&
      pauseRows.includes("练习 1 · 2/4 四分音符") &&
      !pauseRows.includes("s0-crawl"),
    "统计页：先不练的两条按名字列出来（不是 id）",
    pauseRows,
  );
  js("(() => { document.querySelector('.pause-item .pause-resume')?.click(); return 'ok'; })()");
  await sleep(500);
  const pausesLeft = String(
    js("localStorage.getItem('guitar.pauses.v1') ?? ''"),
  ).replace(/^"|"$/g, "");
  log(
    Number(js("document.querySelectorAll('.pause-item').length")) === 1 &&
      !pausesLeft.includes("rd-01"),
    "点「恢复」这条提前回来，压后表里也没了",
    `${pausesLeft} · 剩 ${js("document.querySelectorAll('.pause-item').length")}`,
  );
  js("localStorage.removeItem('guitar.pauses.v1')");

  // 13e) 退步加急：rd-01 练到过 96、5 天前只有 86 → 挤进今日三条并标「速度掉了」
  js(
    "(() => { const d = new Date(); d.setDate(d.getDate() - 5); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'rd-01': { bestBpm: 96, sessions: 4, minutes: 20, lastAt: k, history: [{ date: '2026-10-01', bpm: 62 }, { date: '2026-10-20', bpm: 96 }, { date: k, bpm: 86 }] } })); return 'ok'; })()",
  );
  ab(["reload"]);
  await sleep(1400);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(800);
  const regressDue = String(
    js(
      "(() => { const row = document.querySelector('.today-item[data-pick=\"rd-01\"] .today-due'); return row ? row.textContent.trim() : 'missing'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    regressDue.endsWith("· 速度掉了") && regressDue.includes("上次练"),
    "退步的那条会挤进今日三条，并标「速度掉了」",
    regressDue,
  );

  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '设置'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const hasBackupButtons = String(
    js(
      "(() => { const texts = [...document.querySelectorAll('.backup-actions button')].map(n => n.textContent.trim()); return texts.join('+'); })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.backup-actions button')].find(n => n.textContent.trim() === '导出备份'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const backupNote = String(
    js(
      "(() => { const n = document.querySelector('.backup-note'); return n ? n.textContent.trim() : 'none'; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hasBackupButtons === "导出备份+导入备份" && /^已导出 guitar-lab-backup-\d{4}-\d{2}-\d{2}\.json/.test(backupNote),
    "设置页：能导出备份，并提示导出的文件名",
    `${hasBackupButtons} / ${backupNote}`,
  );

  // 15) 跟练：预备拍与 A-B 循环（开始先数预备小节，再进「第 N 小节」）
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js(
    "(() => { document.querySelectorAll('.drill-card')[26]?.scrollIntoView({ block: 'center' }); return 'ok'; })()",
  );
  await sleep(400);
  js(
    "(() => { const c = document.querySelectorAll('.drill-card')[26]; const b = [...c.querySelectorAll('button')].find(n => n.textContent.trim() === '跟练'); b?.click(); return 'ok'; })()",
  );
  await sleep(800);
  const followFields = String(
    js(
      "(() => [...document.querySelectorAll('.follow select')].map(n => n.getAttribute('aria-label') || '').join('|'))()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const l = [...document.querySelectorAll('.follow-check')].find(n => n.textContent.includes('只练')); l?.querySelector('input')?.click(); return 'ok'; })()",
  );
  await sleep(200);
  const loopOn = String(
    js(
      "(() => { const l = [...document.querySelectorAll('.follow-check')].find(n => n.textContent.includes('只练')); return l?.querySelector('input')?.checked ? 'on' : 'off'; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.follow button')].find(n => n.textContent.trim() === '开始跟练'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  const countInText = String(
    js("(() => document.querySelector('.follow-bar')?.textContent ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  await sleep(4200);
  const barText = String(
    js("(() => document.querySelector('.follow-bar')?.textContent ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.follow button')].find(n => n.textContent.trim() === '停止'); b?.click(); return 'ok'; })()",
  );
  log(
    followFields.includes("开始前空打几小节") &&
      followFields.includes("循环从第几小节开始") &&
      followFields.includes("循环到第几小节结束") &&
      loopOn === "on" &&
      countInText === "预备…" &&
      /^第 \d+ 小节$/.test(barText),
    "跟练：有预备拍与 A-B 循环，开始先数预备小节再进第 N 小节",
    `${followFields} / ${loopOn} / ${countInText} / ${barText}`,
  );

  // 16) 搜索：输入「切音」只剩几条，清掉后恢复 103 条
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(900);
  js(
    "(() => { const i = document.querySelector('#rhythm-search'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, '切音'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()",
  );
  await sleep(500);
  const searchState = String(
    js(
      "(() => { const n = document.querySelector('.rhythm-search-note'); return (n ? n.textContent : 'none') + '|' + document.querySelectorAll('.drill-card').length; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.rhythm-search button')].find(n => n.textContent.trim() === '清掉'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const clearedCards = Number(
    String(js("(() => String(document.querySelectorAll('.drill-card').length))()")).replace(/^"|"$/g, ""),
  );
  const [searchNote, searchedCards] = searchState.split("|");
  log(
    /^找到 \d+ 条$/.test(searchNote) && Number(searchedCards) > 0 && Number(searchedCards) < 103 && clearedCards === 103,
    "搜索：输入「切音」只剩几条，清掉后恢复全部",
    `${searchState} / 清掉后 ${clearedCards}`,
  );

  // 16b) 只看没练过的：练过一条后打开筛选，它就不在列表里了
  js(
    "(() => { localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'rt-quarter-eighth': { bestBpm: 88, sessions: 1, minutes: 3, lastAt: '2026-11-12' } })); return 'ok'; })()",
  );
  await sleep(100);
  ab(["reload"]);
  await sleep(800);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  js("(() => { document.querySelector('.rhythm-search .chip')?.click(); return 'ok'; })()");
  await sleep(500);
  const onlyNewState = JSON.parse(
    String(
      js(
        "(() => { const chip = document.querySelector('.rhythm-search .chip'); const note = document.querySelector('.rhythm-search-note'); return JSON.stringify({ on: chip?.getAttribute('aria-pressed'), text: chip?.textContent?.trim() ?? '', note: note?.textContent?.trim() ?? '', cards: document.querySelectorAll('.drill-card').length, gone: !document.body.textContent.includes('练习 1 · 2/4 四分音符') }); })()",
      ),
    ).replace(/^"|"$/g, "").replace(/\\"/g, '"'),
  );
  log(
    onlyNewState.on === "true" &&
      onlyNewState.text.includes("只看没练过的") &&
      onlyNewState.cards === 102 &&
      onlyNewState.note === "没练过的 102 条",
    "节奏页：打开「只看没练过的」就只剩没练过的（练过那条不见了）",
    `${onlyNewState.cards} 张 / ${onlyNewState.note}`,
  );
  js("(() => { document.querySelector('.rhythm-search .chip')?.click(); return 'ok'; })()");
  await sleep(400);
  js("localStorage.removeItem('guitar.rhythm.v1')");

  // 16c) 和弦页：转换练习（四组进行 + 开始按钮 + 没成绩时的提示）
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '和弦'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const chordDrill = JSON.parse(
    String(
      js(
        "(() => { const sec = document.querySelector('.chord-drill'); const chips = [...document.querySelectorAll('.cd-progs .chip')]; const on = chips.find(c => c.getAttribute('aria-pressed') === 'true'); return JSON.stringify({ has: Boolean(sec), chips: chips.length, on: on?.textContent?.trim() ?? '', btn: document.querySelector('.cd-controls .btn')?.textContent?.trim() ?? '', hint: document.querySelector('.cd-hint')?.textContent?.trim() ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    chordDrill.has &&
      chordDrill.chips === 4 &&
      chordDrill.on === "C–Am–F–G" &&
      chordDrill.btn === "开始" &&
      chordDrill.hint.includes("还没记过成绩"),
    "和弦页：转换练习有四组进行，默认第一组，没成绩时提示「这组还没记过成绩」",
    `${chordDrill.chips} 组 / ${chordDrill.btn}`,
  );

  js("(() => { document.querySelectorAll('.cd-progs .chip')[1]?.click(); return 'ok'; })()");
  await sleep(300);
  const progState = JSON.parse(
    String(
      js(
        "(() => { const chips = [...document.querySelectorAll('.cd-progs .chip')]; return JSON.stringify({ second: chips[1]?.getAttribute('aria-pressed') ?? '', first: chips[0]?.getAttribute('aria-pressed') ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    progState.second === "true" && progState.first === "false",
    "和弦页：点第二组进行，选中态跟着走",
    `${progState.first} → ${progState.second}`,
  );

  // 16c2) 和弦页的六线谱版：扫弦 / 分解两种弹法可切，切完图会重画
  const voicingBefore = String(
    js(
      "(() => { const chips = [...document.querySelectorAll('.chord-voicing-modes .chip')].map(n => n.textContent.trim()); const img = document.querySelector('.chord-voicing-img'); return [chips.join(','), img?.getAttribute('alt') ?? 'none'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.chord-voicing-modes .chip')].find(n => n.textContent.trim() === '分解'); b?.click(); return 'ok'; })()",
  );
  await sleep(1600);
  const voicingAfter = String(
    js(
      "(() => { const on = document.querySelector('.chord-voicing-modes .chip[aria-pressed=\\'true\\']')?.textContent?.trim() ?? ''; const img = document.querySelector('.chord-voicing-img'); return [on, img?.getAttribute('alt') ?? 'none'].join('|'); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    voicingBefore.startsWith("扫弦,分解|") &&
      voicingBefore.includes("（扫弦）") &&
      voicingAfter.startsWith("分解|") &&
      voicingAfter.includes("（分解）"),
    "和弦页：六线谱版能切「扫弦 / 分解」，切完图跟着换",
    `${voicingBefore.slice(-16)} → ${voicingAfter.slice(-16)}`,
  );
  js(
    "(() => { const b = [...document.querySelectorAll('.chord-voicing-modes .chip')].find(n => n.textContent.trim() === '扫弦'); b?.click(); return 'ok'; })()",
  );
  await sleep(400);

  // 16d) 统计页：和弦转换的成绩（练过哪组、最快多快）
  js(
    "(() => { localStorage.setItem('guitar.chords.v1', JSON.stringify({ 'pg-1645': { bestBpm: 96, sessions: 2, minutes: 2, lastAt: '2026-11-14' } })); return 'ok'; })()",
  );
  await sleep(100);
  ab(["reload"]);
  await sleep(800);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const chordStats = JSON.parse(
    String(
      js(
        "(() => { const row = document.querySelector('[data-chord=\"pg-1645\"]'); const cards = [...document.querySelectorAll('.stat-card')].map(c => c.innerText.replace(/\\n/g, ' ')); return JSON.stringify({ row: row?.innerText?.replace(/\\n/g, ' ') ?? '', cards }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    chordStats.row.includes("C–Am–F–G") &&
      chordStats.row.includes("96 BPM") &&
      chordStats.cards.some((text) => text.includes("1/4")),
    "统计页：和弦转换列出四组进行，练过的那组带最快速度",
    chordStats.row,
  );
  js("localStorage.removeItem('guitar.chords.v1')");

  // 16d2) 统计页：扒谱的听辨成绩（五种题型各自的正确率 + 正确率曲线，v0.78.0 / v0.83.0）
  js(
    "(() => { localStorage.setItem('guitar.ear.v1', JSON.stringify({ rounds: 6, best: 7, lastAt: '2026-11-14', days: { '2026-11-10': { correct: 4, total: 8 }, '2026-11-12': { correct: 5, total: 8 }, '2026-11-14': { correct: 7, total: 8 } }, byKind: { position: { correct: 20, total: 24 }, interval: { correct: 12, total: 16 }, degree: { correct: 9, total: 16 }, progression: { correct: 3, total: 8 } } })); return 'ok'; })()",
  );
  await sleep(100);
  ab(["reload"]);
  await sleep(800);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const earStats = JSON.parse(
    String(
      js(
        "(() => { const rows = [...document.querySelectorAll('[data-ear]')].map(li => li.innerText.replace(/\\n/g, ' ')); const cards = [...document.querySelectorAll('.stat-card')].map(c => c.innerText.replace(/\\n/g, ' ')); const trend = document.querySelector('.ear-trend'); const trendText = trend ? trend.innerText.replace(/\\n/g, ' ') : ''; const path = trend ? (trend.querySelector('path')?.getAttribute('d') ?? '') : ''; return JSON.stringify({ rows, cards, trendText, path }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    earStats.rows.length === 5 &&
      earStats.rows.some((text) => text.includes("级数走向") && text.includes("3/8")) &&
      earStats.rows.some((text) => text.includes("和弦性质")) &&
      earStats.cards.some((text) => text.includes("7/8")) &&
      earStats.cards.some((text) => text.includes("69%")),
    "统计页：听辨成绩列出五种题型，带总正确率",
    earStats.rows.join(" | "),
  );
  log(
    earStats.trendText.includes("3 个练习日") &&
      earStats.trendText.includes("50% → 88%") &&
      earStats.path.startsWith("M"),
    "统计页：听辨正确率按天画成一条曲线",
    earStats.trendText,
  );
  js("localStorage.removeItem('guitar.ear.v1')");

  // 16d3) v0.100.0：统计页「最卡的地方」——跟练时点开单练的级数按周归堆
  js(
    "(() => { const today = new Date(); const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const now = key(today); localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'pattern-h1': { bestBpm: 90, sessions: 2, minutes: 3, lastAt: now, hardest: { bar: 3, degree: 5, name: 'G', count: 4 } }, 'pattern-h2': { bestBpm: 88, sessions: 1, minutes: 2, lastAt: now, hardest: { bar: 2, degree: 6, name: 'Am', count: 2 } }, 'pattern-h3': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: now, hardest: { bar: 1, degree: 5, name: 'G', count: 1 } } })); return 'ok'; })()",
  );
  await sleep(100);
  ab(["reload"]);
  await sleep(800);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const hardInfo = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest]')].map(li => li.innerText.replace(/\\n/g, ' ').trim()); const hint = document.querySelector('.hardest-hint')?.innerText?.replace(/\\n/g, ' ').trim() ?? ''; return `${rows.join(' | ')}##${hint}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hardInfo.startsWith("第 5 级（G）") &&
      hardInfo.includes("2 条练习里单独练过 5 次") &&
      hardInfo.includes("第 6 级（Am）") &&
      hardInfo.includes("最近 7 天"),
    "统计页：最卡的地方按级数归堆，次数多的排前面",
    hardInfo.slice(0, 90),
  );
  // 16d4) v0.101.0：同一份数据按「条目」再列一份——哪一段最卡、卡在哪一小节
  const hardItemInfo = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest-item]')].map(li => li.innerText.replace(/\\n/g, ' ').trim()); return rows.join(' | '); })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hardItemInfo.includes("第 3 小节第 5 级（G）") &&
      hardItemInfo.includes("单独练过 4 次") &&
      hardItemInfo.includes("第 2 小节第 6 级（Am）"),
    "统计页：最卡的地方还按条目列一份，能看出是哪一段",
    hardItemInfo.slice(0, 90),
  );

  // 16d5) v0.102.0：点其中一条要跳回那一段（pattern 回节奏页那张卡，hash 带 id）
  const jumpHash = String(
    js(
      "(() => { const btn = document.querySelector('.hardest-jump'); if (!btn) return 'none'; btn.click(); return location.hash; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    jumpHash.startsWith("#rhythm") || jumpHash.startsWith("#practice") || jumpHash.startsWith("#ear"),
    "统计页：点最卡的一条会跳回那一段",
    jumpHash,
  );

  // 16d6) v0.106.0：今天计划里的那几条按计划顺序排在最前，别被「次数多」顶到后面
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = (name) => ({ beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: name, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }); const base = Date.now(); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-z', date: today, title: '计划里的', tab: tab('计划'), meter: '4/4', bpm: 90, addedAt: base }])); const record = { 'p:extra-z': { bestBpm: 90, sessions: 1, minutes: 2, lastAt: today, title: '计划里的', hardest: { bar: 1, degree: 1, name: 'C', count: 1 } }, 'pattern-h9': { bestBpm: 120, sessions: 2, minutes: 4, lastAt: today, hardest: { bar: 2, degree: 6, name: 'Am', count: 9 } }, 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, hardest: { bar: 1, degree: 5, name: 'G', count: 5 } } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(record)); return 'ok'; })()",
  );
  ab(["open", `${URL}#stats`]);
  await sleep(1000);
  const hardOrder = String(
    js(
      "(() => [...document.querySelectorAll('[data-hardest-item]')].map(li => li.getAttribute('data-hardest-item')).join(','))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hardOrder.startsWith("p:extra-z,pattern-h9,s0-crawl"),
    "统计页：计划里的条目按计划顺序排最前",
    hardOrder,
  );

  // 16d7) v0.107.0：按级数筛选 + 加餐练了多久按阶段算
  const hardSeed = String(
    js(
      "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const record = { 'p:extra-z': { bestBpm: 90, sessions: 1, minutes: 12, lastAt: today, title: '单弦爬格子（1-2-3-4）', hardest: { bar: 1, degree: 1, name: 'C', count: 1 } }, 'pattern-h9': { bestBpm: 120, sessions: 2, minutes: 4, lastAt: today, hardest: { bar: 2, degree: 6, name: 'Am', count: 9 } }, 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, hardest: { bar: 1, degree: 5, name: 'G', count: 5 } } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(record)); delete localStorage['guitar.plan.v1']; localStorage.removeItem('guitar.plan.v1'); return 'ok'; })()",
    ),
  ).replace(/^"|"$/g, "");
  ab(["open", `${URL}#stats`]);
  await sleep(1000);
  const filterInfo = String(
    js(
      "(() => { const chips = [...document.querySelectorAll('.hardest-filter .chip')].map(c => c.textContent.trim()); const six = [...document.querySelectorAll('.hardest-filter .chip')].find(c => c.textContent.includes('第 6 级')); six?.click(); return chips.join(','); })()",
    ),
  ).replace(/^"|"$/g, "");
  await sleep(500);
  const filtered = String(
    js(
      "(() => { const items = [...document.querySelectorAll('[data-hardest-item]')].map(li => li.getAttribute('data-hardest-item')); const dim = document.querySelectorAll('.hardest-dim').length; const pressed = [...document.querySelectorAll('.hardest-filter .chip')].filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.textContent.trim()).join(','); return `${items.join('/')}|${dim}|${pressed}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    filterInfo.startsWith("全部,第") && filtered === "pattern-h9|2|第 6 级",
    "统计页：最卡的地方能按级数筛条目",
    `${filterInfo} → ${filtered}`,
  );

  const extraTime = String(
    js("(() => document.querySelector('.extra-time')?.textContent?.replace(/\\s+/g, ' ').trim() ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  log(
    extraTime.includes("加餐练了 12 分钟") && extraTime.includes("第 1 阶段 12 分钟"),
    "统计页：加餐练了多久，按阶段分开算",
    extraTime,
  );

  // 16d8) v0.108.0：点归堆那一行也能筛，和上面那排 chip 共用同一个选中态
  js(
    "(() => { const row = [...document.querySelectorAll('.hardest-row')].find(el => el.textContent.includes('第 5 级')); row?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const rowFilter = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('.hardest-row')].filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.getAttribute('data-hardest-row')).join(','); const chips = [...document.querySelectorAll('.hardest-filter .chip')].filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.textContent.trim()).join(','); const items = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join('/'); return `${rows}|${chips}|${items}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    rowFilter === "5|第 5 级|s0-crawl",
    "统计页：点归堆那一行也能筛，和上面的 chip 联动",
    rowFilter,
  );

  // 16d9) v0.109.0：筛选状态写进地址栏，离开再回来还在
  const hashAfterFilter = String(js("location.hash")).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '练习'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '统计'); b?.click(); return 'ok'; })()",
  );
  await sleep(700);
  const hashBack = String(
    js(
      "(() => { const pressed = [...document.querySelectorAll('.hardest-filter .chip')].find(c => c.getAttribute('aria-pressed') === 'true')?.textContent.trim() ?? 'none'; const items = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join('/'); return `${location.hash}|${pressed}|${items}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    hashAfterFilter === "#stats?d=5" && hashBack === "#stats?d=5|第 5 级|s0-crawl",
    "统计页：筛选写进地址栏，跳到别的页再回来还在",
    `${hashAfterFilter} → ${hashBack}`,
  );

  // 16d10) v0.110.0：按阶段也能筛，和级数筛叠在一起
  js(
    "(() => { const b = [...document.querySelectorAll('.hardest-filter')[0].querySelectorAll('.chip')].find(c => c.textContent.trim() === '全部'); b?.click(); return 'ok'; })()",
  );
  await sleep(400);
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const raw = JSON.parse(localStorage.getItem('guitar.rhythm.v1') || '{}'); raw['s1-scale'] = { bestBpm: 75, sessions: 1, minutes: 3, lastAt: today, hardest: { bar: 2, degree: 3, name: 'E', count: 4 } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(raw)); return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(1000);
  const stageChips = String(
    js(
      "(() => [...document.querySelectorAll('.hardest-filter')].map(row => [...row.querySelectorAll('.chip')].map(c => c.textContent.trim()).join(',')).join(' | '))()",
    ),
  ).replace(/^"|"$/g, "");
  const stageLabel = String(
    js("(() => document.querySelector('.hardest-filter-label')?.textContent.trim() ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const rows = document.querySelectorAll('.hardest-filter'); const row = rows[1]; [...row.querySelectorAll('.chip')].find(c => c.textContent.includes('第 2 阶段'))?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const stageFiltered = String(
    js(
      "(() => { const items = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join('/'); const pressed = [...document.querySelectorAll('.hardest-filter')[1].querySelectorAll('.chip')].find(c => c.getAttribute('aria-pressed') === 'true')?.textContent.trim() ?? 'none'; const note = document.querySelector('.hardest-note') ? 'note' : 'nonote'; return `${items}|${pressed}|${note}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    stageLabel === "按阶段" &&
      stageChips.includes("全部,第 1 阶段,第 2 阶段") &&
      stageFiltered === "s1-scale|第 2 阶段|note",
    "统计页：最卡的地方能按阶段筛，和级数筛叠在一起",
    `${stageLabel} · ${stageChips} · ${stageFiltered}`,
  );

  // 16d11) v0.111.0：两排筛选叠起来能存成一个「视角」，清掉筛选点回来能复原
  js(
    "(() => { const rows = document.querySelectorAll('.hardest-filter'); const deg = [...rows[0].querySelectorAll('.chip')].find(c => c.textContent.includes('第 5 级')); deg?.click(); return 'ok'; })()",
  );
  await sleep(350);
  js(
    "(() => { const rows = document.querySelectorAll('.hardest-filter'); const st = [...rows[1].querySelectorAll('.chip')].find(c => c.textContent.includes('第 1 阶段')); st?.click(); return 'ok'; })()",
  );
  await sleep(400);
  js("(() => { document.querySelector('.view-save')?.click(); return 'ok'; })()");
  await sleep(400);
  // v0.112.0：点「存下这组筛选」先出输入框；不填名字直接回车，就存成系统拼出来的那串
  js(
    "(() => { document.querySelector('.view-name')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'ok'; })()",
  );
  await sleep(400);
  const viewSaved = String(
    js(
      "(() => { const pills = [...document.querySelectorAll('.view-pill')].map(p => p.textContent.trim()).join('/'); const stored = (JSON.parse(localStorage.getItem('guitar.stats.views.v1') || '[]')[0] || {}).label || 'none'; const save = document.querySelectorAll('.view-save').length; return `${pills}|${stored}|${save}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const rows = document.querySelectorAll('.hardest-filter'); rows[0].querySelectorAll('.chip')[0]?.click(); rows[1].querySelectorAll('.chip')[0]?.click(); return 'ok'; })()",
  );
  await sleep(450);
  js("(() => { document.querySelector('.view-apply')?.click(); return 'ok'; })()");
  await sleep(500);
  const viewRestored = String(
    js(
      "(() => { const rows = document.querySelectorAll('.hardest-filter'); const pressed = [...rows].map(row => [...row.querySelectorAll('.chip')].find(c => c.getAttribute('aria-pressed') === 'true')?.textContent.trim() || 'none').join('/'); const items = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join('/'); return `${location.hash}|${pressed}|${items}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    viewSaved === "第 5 级 · 第 1 阶段×|第 5 级 · 第 1 阶段|0" &&
      viewRestored === "#stats?d=5&s=0|第 5 级/第 1 阶段|s0-crawl",
    "统计页：两排筛选能存成「视角」，清掉后点一下复原",
    `${viewSaved} · ${viewRestored}`,
  );
  js("localStorage.removeItem('guitar.stats.views.v1')");
  js("sessionStorage.removeItem('guitar.stats.degree')");
  js("sessionStorage.removeItem('guitar.stats.stage')");

  // 16d12) v0.112.0：「存下这组筛选」先出输入框，起完名字胶囊上就是自己的名字，tooltip 里带系统标签
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const rec = { 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, hardest: { bar: 1, degree: 5, name: 'G', count: 5 } } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(rec)); localStorage.removeItem('guitar.stats.views.v1'); sessionStorage.removeItem('guitar.stats.degree'); sessionStorage.removeItem('guitar.stats.stage'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const rows = document.querySelectorAll('.hardest-filter'); const deg = [...rows[0].querySelectorAll('.chip')].find(c => c.textContent.includes('第 5 级')); deg?.click(); return 'ok'; })()",
  );
  await sleep(400);
  js("(() => { document.querySelector('.view-save')?.click(); return 'ok'; })()");
  await sleep(400);
  const namerUi = String(
    js(
      "(() => { const input = document.querySelector('.view-name'); return `${Boolean(input)}|${input?.getAttribute('placeholder') ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const input = document.querySelector('.view-name'); if (!input) return 'none'; const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(input, '我的弱项'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'ok'; })()",
  );
  await sleep(500);
  const viewNamed = String(
    js(
      "(() => { const apply = document.querySelector('.view-apply'); const stored = (JSON.parse(localStorage.getItem('guitar.stats.views.v1') || '[]')[0] || {}).name || 'none'; return `${apply?.textContent.trim() ?? ''}|${apply?.getAttribute('title') ?? ''}|${stored}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    namerUi === "true|第 5 级" && viewNamed === "我的弱项|我的弱项 · 第 5 级|我的弱项",
    "统计页：视角能起自己的名字，系统地记着它是什么",
    `${namerUi} · ${viewNamed}`,
  );
  js("localStorage.removeItem('guitar.stats.views.v1')");

  // 16d13) v0.112.0：练习页「今天这一套」——存成组合，清空加餐之后点一下还能加回来
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = { beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: '甲', notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }; localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-s1', date: today, title: '存组合用的一条', tab, meter: '4/4', bpm: 90, addedAt: Date.now(), stage: 0 }])); localStorage.removeItem('guitar.plan.sets.v1'); location.hash = '#practice'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js("(() => { document.querySelector('.set-save')?.click(); return 'ok'; })()");
  await sleep(350);
  const setNameUi = String(
    js("(() => { const input = document.querySelector('.set-name'); return `${Boolean(input)}|${input?.getAttribute('maxLength') ?? ''}`; })()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const input = document.querySelector('.set-name'); if (!input) return 'none'; const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(input, '热身后两小节'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'ok'; })()",
  );
  await sleep(500);
  const setSaved = String(
    js(
      "(() => { const pill = document.querySelector('.set-pill'); const stored = JSON.parse(localStorage.getItem('guitar.plan.sets.v1') || '[]')[0] || {}; const note = document.querySelector('.plan-sets-note')?.textContent?.trim() ?? ''; return `${pill?.textContent.trim() ?? ''}|${stored.name ?? ''}|${stored.items?.length ?? 0}|${note}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("localStorage.removeItem('guitar.plan.v1')");
  await ab(["reload"]);
  await sleep(900);
  const afterClear = String(
    js(
      "(() => `${document.querySelectorAll('.practice-extra').length}|${document.querySelectorAll('.set-apply').length}`)()",
    ),
  ).replace(/^"|"$/g, "");
  js("(() => { document.querySelector('.set-apply')?.click(); return 'ok'; })()");
  await sleep(700);
  const afterApply = String(
    js(
      "(() => `${document.querySelectorAll('.practice-extra').length}|${[...document.querySelectorAll('.practice-extra h4')].map(h => h.textContent.trim()).join(',')}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    setNameUi === "true|12" &&
      setSaved.startsWith("热身后两小节×|热身后两小节|1|") &&
      afterClear === "0|1" &&
      afterApply === "1|存组合用的一条",
    "练习页：今天这一套能存成组合，清空之后点一下加回来",
    `${setNameUi} · ${setSaved} · ${afterClear} → ${afterApply}`,
  );
  js("localStorage.removeItem('guitar.plan.sets.v1')");

  // 16d14) v0.113.0：组合能「只加没练过的」——今天已经练过的那条跳过去
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = { beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: '甲', notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }; const items = [{ title: '已经练过的', tab, meter: '4/4', bpm: 90, stage: 0 }, { title: '还没练的', tab, meter: '4/4', bpm: 90 }]; localStorage.setItem('guitar.plan.sets.v1', JSON.stringify([{ id: 'set-skip', name: '两小节热身', items, addedAt: Date.now() }])); localStorage.removeItem('guitar.plan.v1'); localStorage.setItem('guitar.plan.done.v1', JSON.stringify({ date: today, titles: ['已经练过的'] })); location.hash = '#practice'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js("(() => { document.querySelector('.set-skip')?.click(); return 'ok'; })()");
  await sleep(300);
  const skipPressed = String(js("(() => document.querySelector('.set-skip')?.getAttribute('aria-pressed') ?? 'none')()")).replace(
    /^"|"$/g,
    "",
  );
  js("(() => { document.querySelector('.set-apply')?.click(); return 'ok'; })()");
  await sleep(700);
  const skipApplied = String(
    js(
      "(() => `${[...document.querySelectorAll('.practice-extra h4')].map(h => h.textContent.trim()).join(',')}|${document.querySelector('.plan-sets-note')?.textContent?.trim() ?? ''}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    skipPressed === "true" && skipApplied === "还没练的|「两小节热身」加进来 1 条（跳过今天练过的）。",
    "练习页：组合能只加今天还没练过的那几条",
    `${skipPressed} · ${skipApplied}`,
  );
  js("localStorage.removeItem('guitar.plan.sets.v1')");
  js("localStorage.removeItem('guitar.plan.done.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");

  // 16d15) v0.113.0：用过的视角挪到最前（常用的排在前面）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const now = Date.now(); localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, hardest: { bar: 1, degree: 5, name: 'G', count: 5 } } })); localStorage.setItem('guitar.stats.views.v1', JSON.stringify([{ id: 'v-a', degree: 5, stage: null, label: '第 5 级', name: '我的弱项', addedAt: now - 2000 }, { id: 'v-b', degree: 3, stage: null, label: '第 3 级', name: '常用', addedAt: now - 1000 }])); sessionStorage.removeItem('guitar.stats.degree'); sessionStorage.removeItem('guitar.stats.stage'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  const viewOrderBefore = String(
    js("(() => [...document.querySelectorAll('.view-apply')].map(b => b.textContent.trim()).join(','))()"),
  ).replace(/^"|"$/g, "");
  js("(() => { document.querySelector('.view-apply')?.click(); return 'ok'; })()");
  await sleep(600);
  const viewOrderAfter = String(
    js(
      "(() => `${[...document.querySelectorAll('.view-apply')].map(b => b.textContent.trim()).join(',')}|${JSON.parse(localStorage.getItem('guitar.stats.views.v1') || '[]').map(v => v.id).join(',')}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    viewOrderBefore === "我的弱项,常用" && viewOrderAfter === "常用,我的弱项|v-b,v-a",
    "统计页：用过的视角会挪到最前面",
    `${viewOrderBefore} → ${viewOrderAfter}`,
  );
  js("localStorage.removeItem('guitar.stats.views.v1')");

  // 16d16) v0.114.0：最卡的条目还能按「单独练过几次」筛——和「卡了几次」分开算
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const rec = { 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, title: '单弦爬格子（1-2-3-4）', hardest: { bar: 1, degree: 5, name: 'G', count: 5 }, spots: [{ bar: 2, degree: 5, name: 'G', times: 4, lastAt: today }] }, 'p:extra-spot': { bestBpm: 70, sessions: 1, minutes: 3, lastAt: today, title: '另一条', hardest: { bar: 1, degree: 1, name: 'C', count: 2 }, spots: [{ bar: 1, degree: 1, name: 'C', times: 1, lastAt: today }] } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(rec)); sessionStorage.removeItem('guitar.stats.degree'); sessionStorage.removeItem('guitar.stats.stage'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  const spotRowsBefore = String(
    js("(() => document.querySelectorAll('[data-hardest-item]').length)()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const row = document.querySelector('.hardest-spot'); const chip = [...(row?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === '≥3 次'); chip?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const spotRowsAfter = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','); const pressed = [...document.querySelectorAll('.hardest-spot button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()).join('/'); const note = document.querySelectorAll('.hardest-note').length; return `${rows}|${pressed}|${note}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    spotRowsBefore === "2" && spotRowsAfter === "s0-crawl|≥3 次|1",
    "统计页：最卡的条目能按「单独练过几次」筛",
    `${spotRowsBefore} → ${spotRowsAfter}`,
  );
  js("localStorage.removeItem('guitar.rhythm.v1')");

  // 16d17) v0.114.0：组合里今天已经练过的排到最后（一条不少，只是先练新的）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = { beatsPerBar: 4, bars: 1, bpm: [90, 90], caption: '甲', notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }; const items = [{ title: '练过的', tab, meter: '4/4', bpm: 90, stage: 0 }, { title: '没练的', tab, meter: '4/4', bpm: 90, stage: 0 }]; localStorage.setItem('guitar.plan.sets.v1', JSON.stringify([{ id: 'set-order', name: '早课', items, addedAt: Date.now() }])); localStorage.removeItem('guitar.plan.v1'); localStorage.setItem('guitar.plan.done.v1', JSON.stringify({ date: today, titles: ['练过的'] })); location.hash = '#practice'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js("(() => { document.querySelector('.set-apply')?.click(); return 'ok'; })()");
  await sleep(800);
  const freshOrder = String(
    js(
      "(() => `${[...document.querySelectorAll('.practice-extra h4')].map(h => h.textContent.trim()).join(',')}|${document.querySelector('.plan-sets-note')?.textContent?.trim() ?? ''}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    freshOrder === "没练的,练过的|「早课」加进来 2 条（今天练过的排到了后面）。",
    "练习页：组合里今天练过的排到最后，一条不少",
    freshOrder,
  );

  // 12z) v0.115.0：从组合加进来的归到「组合 · 名字」一组，勾掉的那条标题淡下去 + 「今天练过」
  const comboGroup = String(
    js(
      "(() => { const head = document.querySelector('.extras-group')?.textContent?.trim().replace(/\\s+/g, ' ') ?? ''; const meta = document.querySelector('.practice-extra .pb-meta')?.textContent?.trim() ?? ''; return `${head}|${meta.includes('来自「早课」')}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const btn = document.querySelector('.practice-extra .btn.primary'); btn?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const comboDone = String(
    js(
      "(() => { const block = document.querySelector('.practice-extra.done'); if (!block) return 'none'; const tag = block.querySelector('.pb-done-tag')?.textContent?.trim() ?? ''; const color = getComputedStyle(block.querySelector('h4')).color; return `${tag}|${color}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    comboGroup === "组合 · 早课2 条收起|true" && comboDone === "今天练过|rgb(139, 148, 158)",
    "练习页：组合的条目归到一起，练过的淡下去并标「今天练过」",
    `${comboGroup} · ${comboDone}`,
  );

  // 12aa) v0.116.0：点那枚「今天练过」能撤回——标签消失、按钮回到「完成」、今天的标记也不算了
  const undoneTitle = String(
    js(
      "(() => { const block = document.querySelector('.practice-extra.done'); return block?.querySelector('h4')?.textContent?.replace('今天练过', '').trim() ?? ''; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("(() => { document.querySelector('.pb-done-tag')?.click(); return 'ok'; })()");
  await sleep(600);
  const undoneTag = String(
    js(
      `(() => { const tags = document.querySelectorAll('.pb-done-tag').length; const allDone = [...document.querySelectorAll('.practice-extra .btn.primary')].every(b => b.textContent.trim() === '完成'); const titles = JSON.parse(localStorage.getItem('guitar.plan.done.v1') ?? '{}').titles ?? []; return \`\${tags}|\${allDone}|\${titles.includes(${JSON.stringify(undoneTitle)})}\`; })()`,
    ),
  ).replace(/^"|"$/g, "");
  log(
    undoneTag === "0|true|false",
    "练习页：点「今天练过」能撤回，按钮变回「完成」",
    `${undoneTitle} · ${undoneTag}`,
  );

  // 12ab) v0.117.0：撤回之后底部有提示条，点「撤销」能把勾打回去
  const undoToastText = String(
    js("(() => document.querySelector('.undo-toast-text')?.textContent?.trim() ?? '')()"),
  ).replace(/^"|"$/g, "");
  js("(() => { document.querySelector('.undo-toast-btn')?.click(); return 'ok'; })()");
  await sleep(600);
  const undoToastBack = String(
    js(
      `(() => { const tags = document.querySelectorAll('.pb-done-tag').length; const titles = JSON.parse(localStorage.getItem('guitar.plan.done.v1') ?? '{}').titles ?? []; return \`\${tags}|\${titles.includes(${JSON.stringify(undoneTitle)})}\`; })()`,
    ),
  ).replace(/^"|"$/g, "");
  log(
    undoToastText === `已撤回「${undoneTitle}」今天的完成` && undoToastBack === "1|true",
    "练习页：撤回后有提示条，点「撤销」能把勾打回去",
    `${undoToastText} · ${undoToastBack}`,
  );

  // 12ac) v0.118.0：提示条上还有「去练这一条」——撤回是为了重练，不是为了藏起来
  js("document.querySelector('.pb-done-tag')?.click()");
  await sleep(400);
  const undoMore = String(
    js("(() => document.querySelector('.undo-toast-more')?.textContent?.trim() ?? '')()"),
  ).replace(/^"|"$/g, "");
  js("document.querySelector('.undo-toast-more')?.click()");
  await sleep(500);
  const undoMoreAfter = String(
    js(
      "(() => `${document.querySelectorAll('.undo-toast').length}|${document.querySelectorAll('.practice-extra.flash').length}|${[...document.querySelectorAll('.practice-extra .btn')].some(b => b.textContent.trim() === '暂停')}`)()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    undoMore === "去练这一条" && undoMoreAfter === "0|1|true",
    "练习页：撤回提示条上的「去练这一条」会滚到那一块并开始计时",
    `${undoMore} · ${undoMoreAfter}`,
  );

  // 16d18) v0.115.0：视角把「单独练过几次」也一起存下来
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const rec = { 's0-crawl': { bestBpm: 80, sessions: 1, minutes: 2, lastAt: today, title: '单弦爬格子（1-2-3-4）', hardest: { bar: 1, degree: 5, name: 'G', count: 5 }, spots: [{ bar: 2, degree: 5, name: 'G', times: 4, lastAt: today }] } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(rec)); localStorage.removeItem('guitar.stats.views.v1'); sessionStorage.removeItem('guitar.stats.degree'); sessionStorage.removeItem('guitar.stats.stage'); sessionStorage.removeItem('guitar.stats.spot'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js(
    "(() => { const row = document.querySelector('.hardest-spot'); const chip = [...(row?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === '≥3 次'); chip?.click(); return 'ok'; })()",
  );
  await sleep(500);
  js("(() => { document.querySelector('.view-save')?.click(); return 'ok'; })()");
  await sleep(300);
  const spotPlaceholder = String(
    js("(() => document.querySelector('.view-name')?.getAttribute('placeholder') ?? '')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const input = document.querySelector('.view-name'); if (!input) return 'missing'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; setter?.call(input, '常卡'); input.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()",
  );
  await sleep(300);
  js(
    "(() => { document.querySelector('.view-name')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'ok'; })()",
  );
  await sleep(600);
  const spotStored = String(
    js(
      "(() => { const v = JSON.parse(localStorage.getItem('guitar.stats.views.v1') ?? '[]'); const pill = document.querySelector('.view-pill .view-apply'); return `${v.length}|${v[0]?.spot}|${v[0]?.label}|${pill?.getAttribute('title') ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const all = [...document.querySelectorAll('.hardest-spot button')].find(b => b.textContent.trim() === '全部'); all?.click(); return 'ok'; })()",
  );
  await sleep(500);
  js("(() => { document.querySelector('.view-apply')?.click(); return 'ok'; })()");
  await sleep(500);
  const spotRestored = String(
    js(
      "(() => { const pressed = [...document.querySelectorAll('.hardest-spot button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()).join('/'); const hash = location.hash.endsWith('p=3'); return `${pressed}|${hash}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    spotPlaceholder === "单独练过 ≥3 次" &&
      spotStored === "1|3|单独练过 ≥3 次|常卡 · 单独练过 ≥3 次" &&
      spotRestored === "≥3 次|true",
    "统计页：「单独练过几次」也能存进视角，一键还原",
    `${spotPlaceholder} · ${spotStored} · ${spotRestored}`,
  );
  js("localStorage.removeItem('guitar.stats.views.v1')");
  js("sessionStorage.removeItem('guitar.stats.spot')");

  // 16d19) v0.116.0：同一套组合的条目在「最卡的地方」挨在一起，不在组合里的排在后面
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }; const plan = [{ id: 'extra-g1', date: today, title: '单弦爬格子', tab, meter: '4/4', bpm: 60, stage: 0, setName: '早课', addedAt: 1 }, { id: 'extra-g2', date: today, title: '另一条', tab, meter: '4/4', bpm: 70, stage: 2, setName: '早课', addedAt: 2 }]; localStorage.setItem('guitar.plan.v1', JSON.stringify(plan)); const rec = { 'p:extra-m1': { bestBpm: 70, sessions: 1, minutes: 2, lastAt: today, title: '另一条', hardest: { bar: 1, degree: 1, name: 'C', count: 9 } }, 'p:extra-m2': { bestBpm: 70, sessions: 1, minutes: 2, lastAt: today, title: '单弦爬格子', hardest: { bar: 1, degree: 5, name: 'G', count: 2 } }, 'p:extra-house': { bestBpm: 60, sessions: 1, minutes: 2, lastAt: today, title: '不在组合里的', hardest: { bar: 1, degree: 3, name: 'E', count: 5 } } }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify(rec)); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  const comboRows = String(
    js(
      "(() => [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','))()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    comboRows.split(",").length === 3 && comboRows.endsWith("p:extra-house"),
    "统计页：同一套组合的条目挨在一起，不在组合里的排在后面",
    comboRows,
  );

  // 16d20) v0.117.0：组合那一堆上面有一行小标题，说明「为什么挨在一起」
  const comboHead = String(
    js("(() => [...document.querySelectorAll('.hardest-set-btn')].map(el => el.textContent.trim()).join('|'))()"),
  ).replace(/^"|"$/g, "");
  log(
    comboHead.startsWith("组合 · 早课"),
    "统计页：组合的条目上面有一行「组合 · 早课」",
    comboHead,
  );

  // 16d21) v0.118.0：点这行小标题就只看这一套，点「看全部」放开
  js("document.querySelector('.hardest-set-btn')?.click()");
  await sleep(400);
  const setFiltered = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','); const pressed = document.querySelector('.hardest-set-btn')?.getAttribute('aria-pressed') ?? ''; const note = document.querySelector('.hardest-set-note')?.textContent?.trim() ?? ''; return `${pressed}|${rows}|${note.length > 0}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("document.querySelector('.hardest-set-note .btn-quiet')?.click()");
  await sleep(400);
  const setCleared = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest-item]')].length; const note = document.querySelectorAll('.hardest-set-note').length; return `${rows}|${note}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    setFiltered === "true|p:extra-m1,p:extra-m2|true" && setCleared === "3|0",
    "统计页：点「组合 · 早课」只看这一套，点「看全部」放开",
    `${setFiltered} · ${setCleared}`,
  );

  // 16d22) v0.119.0：这一套也能存进视角（地址栏写 `?g=`），刷新后还在
  js("document.querySelector('.hardest-set-btn')?.click()");
  await sleep(300);
  const setHash = String(js("location.hash")).replace(/^"|"$/g, "");
  js("document.querySelector('.view-save')?.click()");
  await sleep(300);
  const setPlaceholder = String(
    js("(() => document.querySelector('.view-name')?.getAttribute('placeholder') ?? '')()"),
  ).replace(/^"|"$/g, "");
  js("(() => { const input = document.querySelector('.view-name'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; setter?.call(input, '早课短板'); input?.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()");
  await sleep(250);
  js("document.querySelector('.view-namer .view-save')?.click()");
  await sleep(400);
  const setStored = String(
    js(
      "(() => { const list = JSON.parse(localStorage.getItem('guitar.stats.views.v1') ?? '[]'); const last = list[list.length - 1] ?? {}; return `${last.set ?? ''}|${last.name ?? ''}|${last.label ?? ''}|${last.weak ?? 0}|${last.weakCount ?? 0}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("location.hash = '#stats'");
  await ab(["reload"]);
  await sleep(800);
  js("document.querySelector('.view-apply')?.click()");
  await sleep(400);
  const setRestored = String(
    js(
      "(() => { const rows = [...document.querySelectorAll('[data-hardest-item]')].length; const pressed = document.querySelector('.hardest-set-btn')?.getAttribute('aria-pressed') ?? ''; const meta = document.querySelector('.view-meta')?.textContent?.trim() ?? ''; return `${location.hash.includes('g=')}|${rows}|${pressed}|${meta}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    setHash.includes("g=") &&
      setPlaceholder === "「早课」这套 · 整体卡在第 1 级 · 练了 2 次 · 平均 70 BPM" &&
      setStored ===
        "早课|早课短板|「早课」这套 · 整体卡在第 1 级 · 练了 2 次 · 平均 70 BPM|1|9" &&
      setRestored === "true|2|true|练了 2 次",
    "统计页：只看这套也能存进视角，刷新后还在",
    `${setHash} · ${setPlaceholder} · ${setStored} · ${setRestored}`,
  );

  // 16d23) v0.120.0：这行里的「整体卡在第 1 级」也是按钮，点一下直接筛那一级；
  // 后面还跟一句「练了 N 次 · 平均 M BPM」
  const setMetaText = String(
    js("(() => document.querySelector('.hardest-set-meta')?.textContent?.trim() ?? '')()"),
  ).replace(/^"|"$/g, "");
  js("document.querySelector('.hardest-set-weak')?.click()");
  await sleep(400);
  const weakFiltered = String(
    js(
      "(() => { const weak = document.querySelector('.hardest-set-weak'); const pressed = weak?.getAttribute('aria-pressed') ?? ''; const rows = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','); const setPressed = document.querySelector('.hardest-set-btn')?.getAttribute('aria-pressed') ?? ''; return `${pressed}|${rows}|${setPressed}|${location.hash.includes('d=1')}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("document.querySelector('.hardest-set-weak')?.click()");
  await sleep(400);
  const weakBacked = String(
    js(
      "(() => { const pressed = document.querySelector('.hardest-set-weak')?.getAttribute('aria-pressed') ?? ''; const rows = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','); const setPressed = document.querySelector('.hardest-set-btn')?.getAttribute('aria-pressed') ?? ''; return `${pressed}|${rows}|${setPressed}|${location.hash.includes('d=')}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("location.hash = '#stats'");
  await ab(["reload"]);
  await sleep(700);
  log(
    setMetaText.startsWith("练了 2 次 · 平均 70 BPM") &&
      weakFiltered === "true|p:extra-m1|true|true" &&
      weakBacked === "false|p:extra-m1,p:extra-m2|true|false",
    "统计页：「整体卡在第几级」点一下筛这一级、再点退回这套全部，旁边写着练了几次、平均多快",
    `${setMetaText} · ${weakFiltered} · ${weakBacked}`,
  );
  // 16d24) v0.122.0：不在计划里的两条卡得一样狠，练得快的排前面
  js(
    "(() => { const key = 'guitar.rhythm.v1'; const store = JSON.parse(localStorage.getItem(key) ?? '{}'); const base = { sessions: 1, minutes: 1, lastAt: '2026-11-20', hardest: { bar: 1, degree: 3, name: 'E', count: 6 } }; store['p:extra-slow'] = { ...base, bestBpm: 60, title: '慢的' }; store['p:extra-fast'] = { ...base, bestBpm: 100, title: '快的' }; localStorage.setItem(key, JSON.stringify(store)); return 'ok'; })()",
  );
  js("location.hash = '#stats'");
  js("(() => { for (const key of ['degree', 'stage', 'spot', 'set']) sessionStorage.removeItem(`guitar.stats.${key}`); return 'ok'; })()");
  await ab(["reload"]);
  await sleep(900);
  const bpmOrder = String(
    js(
      "(() => { const ids = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item') ?? ''); const fast = ids.indexOf('p:extra-fast'); const slow = ids.indexOf('p:extra-slow'); return `${fast >= 0}|${slow >= 0}|${fast < slow}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    bpmOrder === "true|true|true",
    "统计页：不在计划里的条目卡得一样狠时，练得快的排前面",
    bpmOrder,
  );

  // 16d25) v0.123.0：「卡了几次」是第三排筛选，能叠在其它筛选上，也能存进视角
  js(
    "(() => { for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js("(() => { const chip = [...document.querySelectorAll('.hardest-count .chip')].find(el => el.textContent.trim().startsWith('≥4 次')); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const countMeta = String(
    js(
      "(() => { const row = document.querySelector('.hardest-set-meta')?.textContent?.trim() ?? ''; const rows = [...document.querySelectorAll('[data-hardest-item]')].map(el => el.getAttribute('data-hardest-item')).join(','); return `${location.hash.includes('c=4')}|${row.includes('最近 ')}|${rows}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  js("document.querySelector('.view-save')?.click()");
  await sleep(300);
  const countPlaceholder = String(
    js("(() => document.querySelector('.view-name')?.getAttribute('placeholder') ?? '')()"),
  ).replace(/^"|"$/g, "");
  js("(() => { const input = document.querySelector('.view-name'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; setter?.call(input, '反复卡'); input?.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()");
  await sleep(250);
  js("document.querySelector('.view-namer .view-save')?.click()");
  await sleep(400);
  const countStored = String(
    js(
      "(() => { const list = JSON.parse(localStorage.getItem('guitar.stats.views.v1') ?? '[]'); const last = list[list.length - 1] ?? {}; return `${last.count ?? 0}|${last.label ?? ''}`; })()",
    ),
  ).replace(/^"|"$/g, "");
  log(
    countMeta.endsWith("|true|p:extra-m1,p:extra-fast,p:extra-slow,p:extra-house") &&
      countPlaceholder === "卡过 ≥4 次" &&
      countStored === "4|卡过 ≥4 次",
    "统计页：「卡了几次」是第三排筛选，也能存进视角",
    `${countMeta} · ${countPlaceholder} · ${countStored}`,
  );
  js("localStorage.removeItem('guitar.stats.views.v1')");
  js("(() => { for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); return 'ok'; })()");

  js("localStorage.removeItem('guitar.rhythm.v1')");
  js("localStorage.removeItem('guitar.plan.sets.v1')");
  js("localStorage.removeItem('guitar.plan.done.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");

  // 16d26) 统计页：「卡了几次」的 chip 上写着能筛出几条，组合行写着比上周快还是慢（v0.124.0）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const day = (n) => { const x = new Date(d); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }; const today = day(0); const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 3, f: 0, beat: 0, dur: 1 }] }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'p:extra-n1': { bestBpm: 80, sessions: 2, minutes: 6, lastAt: day(1), history: [{ date: day(12), bpm: 70 }, { date: day(11), bpm: 70 }, { date: day(2), bpm: 80 }, { date: day(1), bpm: 80 }], hardest: { bar: 2, degree: 5, name: 'G', count: 6, at: day(1) }, title: '单弦爬格子', spots: [] }, 'p:extra-n2': { bestBpm: 70, sessions: 1, minutes: 3, lastAt: day(0), history: [], hardest: { bar: 1, degree: 3, name: 'E', count: 2, at: day(0) }, title: '另一条', spots: [] } })); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-n1', date: today, title: '单弦爬格子', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 3000, setName: '早课' }, { id: 'extra-n2', date: today, title: '另一条', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 2000, setName: '早课' }])); for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); localStorage.removeItem('guitar.stats.views.v1'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  const paceInfo = JSON.parse(
    String(
      js(
        "(() => { const pace = document.querySelector('.hardest-set-pace'); const chips = [...document.querySelectorAll('.hardest-count .chip')].map(el => el.textContent.replace(/\\s+/g, '').trim()); return JSON.stringify({ pace: pace?.textContent ?? '', color: pace ? getComputedStyle(pace).color : '', chips }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    /^比上周快 10 BPM$/.test(paceInfo.pace.trim()) &&
      paceInfo.color === "rgb(232, 176, 75)" &&
      paceInfo.chips.join("|") === "全部|≥2次2|≥4次1",
    "统计页：组合行写「比上周快 10 BPM」，次数 chip 上带着能筛出几条",
    `${paceInfo.pace} · ${paceInfo.color} · ${paceInfo.chips.join("|")}`,
  );
  js("localStorage.removeItem('guitar.rhythm.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");

  // 16d27) 统计页：视角里记着「比上周快 10 BPM」，一条都筛不出来的 chip 淡下去（v0.125.0）
  js(
    "(() => { const pad = (n) => String(n).padStart(2, '0'); const d = new Date(); const day = (n) => { const x = new Date(d); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }; const today = day(0); const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 3, f: 0, beat: 0, dur: 1 }] }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'p:extra-p1': { bestBpm: 80, sessions: 2, minutes: 6, lastAt: day(1), history: [{ date: day(12), bpm: 70 }, { date: day(11), bpm: 70 }, { date: day(2), bpm: 80 }, { date: day(1), bpm: 80 }], hardest: { bar: 2, degree: 5, name: 'G', count: 6, at: day(1) }, title: '单弦爬格子', spots: [] }, 'p:extra-p2': { bestBpm: 70, sessions: 1, minutes: 3, lastAt: day(0), history: [], hardest: { bar: 1, degree: 3, name: 'E', count: 2, at: day(0) }, title: '另一条', spots: [] } })); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-p1', date: today, title: '单弦爬格子', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 3000, setName: '早课' }, { id: 'extra-p2', date: today, title: '另一条', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 2000, setName: '早课' }])); for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); localStorage.removeItem('guitar.stats.views.v1'); location.hash = '#stats'; return 'ok'; })()",
  );
  await ab(["reload"]);
  await sleep(900);
  js("document.querySelector('.hardest-set-btn')?.click()");
  await sleep(400);
  js("document.querySelector('.view-save')?.click()");
  await sleep(300);
  js("document.querySelector('.view-namer .view-save')?.click()");
  await sleep(400);
  const paceView = JSON.parse(
    String(
      js(
        "(() => { const list = JSON.parse(localStorage.getItem('guitar.stats.views.v1') ?? '[]'); const last = list[list.length - 1] ?? {}; return JSON.stringify({ pace: last.pace ?? 0, label: last.label ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 胶囊上不该把「练了 7 次 · 比上周快 10 BPM」再印一遍——那是右边两枚小字的事（v0.126.0）
  const pillInfo = JSON.parse(
    String(
      js(
        "(() => { const pill = document.querySelector('.view-pill'); return JSON.stringify({ text: pill?.querySelector('.view-apply')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '', pace: pill?.querySelector('.view-pace')?.textContent?.trim() ?? '', meta: pill?.querySelector('.view-meta')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 只看「第 3 级」：那一条只卡过 2 次，≥4 次 这枚一条都筛不出来
  js("(() => { const chip = [...document.querySelectorAll('.hardest-filter .chip')].find(el => el.textContent.trim() === '第 3 级'); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const emptyChip = JSON.parse(
    String(
      js(
        "(() => { const el = document.querySelector('.hardest-count .chip-empty'); const chips = [...document.querySelectorAll('.hardest-count .chip')].map(c => c.textContent.replace(/\\s+/g, '').trim()); return JSON.stringify({ empties: document.querySelectorAll('.hardest-count .chip-empty').length, opacity: el ? getComputedStyle(el).opacity : '', chips, emptyNote: document.querySelector('.hardest-empty')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    paceView.pace === 10 &&
      paceView.label.includes("比上周快 10 BPM") &&
      emptyChip.empties === 1 &&
      emptyChip.opacity === "0.55" &&
      emptyChip.chips.join("|") === "全部|≥2次1|≥4次0",
    "统计页：视角里记着「比上周快 10 BPM」，一条都筛不出来的 chip 淡下去",
    `pace=${paceView.pace} label=${paceView.label} · ${emptyChip.chips.join("|")} opacity=${emptyChip.opacity}`,
  );
  // 16d28) 统计页：胶囊不再重复练习量，快慢单独一枚；筛空时说一句人话（v0.126.0）
  js("(() => { const chip = [...document.querySelectorAll('.hardest-count .chip')].find(el => el.textContent.trim().startsWith('≥4 次')); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const emptyNote = String(
    js(
      "document.querySelector('.hardest-empty')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''",
    ),
  )
    .replace(/^"|"$/g, "")
    .replace(/\\"/g, '"');
  const emptyRows = Number(
    String(js("document.querySelectorAll('[data-hardest-item]').length"))
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    !pillInfo.text.includes("练了") &&
      !pillInfo.text.includes("比上周") &&
      pillInfo.pace === "快 10" &&
      pillInfo.meta.startsWith("练了 ") &&
      emptyRows === 0 &&
      emptyNote.includes("卡过 4 次以上"),
    "统计页：胶囊上快慢单独一枚，筛空时说一句「没有卡过 N 次以上的」",
    `pill=${pillInfo.text} pace=${pillInfo.pace} meta=${pillInfo.meta} rows=${emptyRows} note=${emptyNote}`,
  );
  // 16d29) 统计页：筛空时给一个「放宽一档」的按钮；「比上周」的 title 写清加权怎么算；
  // 「练了 N 次」点一下跳到跟练曲线（v0.127.0）
  // 先把筛选放开——上一条用例结束时列表是空的，那一排「组合 · 早课」就不渲染了
  js("(() => { for (const sel of ['.hardest-filter', '.hardest-count']) { const all = [...document.querySelectorAll(`${sel} .chip`)].find(c => c.textContent.trim() === '全部'); all?.click(); } return 'ok'; })()");
  await sleep(500);
  const relaxInfo = JSON.parse(
    String(
      js(
        "(() => { const paceEl = document.querySelector('.hardest-set-pace'); const meta = document.querySelector('.hardest-set-meta'); return JSON.stringify({ paceTitle: paceEl?.getAttribute('title') ?? '', metaTag: meta?.tagName ?? '', metaLabel: meta?.getAttribute('aria-label') ?? '', curves: document.querySelectorAll('.curve-list li').length }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 点「练了 N 次」：曲线那一行滚进视口并闪一下
  js("document.querySelector('.hardest-set-meta')?.click()");
  await sleep(900);
  const curveJump = JSON.parse(
    String(
      js(
        "(() => { const row = document.querySelector('.curve-list li'); const box = row?.getBoundingClientRect(); return JSON.stringify({ flashed: row?.classList.contains('flash') ?? false, inView: !!box && box.top >= 0 && box.top < innerHeight }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 再筛成空，点「放宽一档」
  js("(() => { const chip = [...document.querySelectorAll('.hardest-filter .chip')].find(el => el.textContent.trim() === '第 3 级'); chip?.click(); return 'ok'; })()");
  await sleep(300);
  js("(() => { const chip = [...document.querySelectorAll('.hardest-count .chip')].find(el => el.textContent.trim().startsWith('≥4 次')); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const emptyAction = JSON.parse(
    String(
      js(
        "(() => { const btn = document.querySelector('.hardest-empty-action'); return JSON.stringify({ label: btn?.textContent?.trim() ?? '', h: btn ? Math.round(btn.getBoundingClientRect().height) : 0, rows: document.querySelectorAll('[data-hardest-item]').length }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  js("document.querySelector('.hardest-empty-action')?.click()");
  await sleep(500);
  const relaxed = JSON.parse(
    String(
      js(
        "(() => { const rows = document.querySelectorAll('[data-hardest-item]').length; return JSON.stringify({ rows, hash: location.hash }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    emptyAction.label === "放宽到 ≥2 次" &&
      emptyAction.h >= 40 &&
      emptyAction.rows === 0 &&
      relaxInfo.paceTitle.includes("加权平均") &&
      relaxInfo.metaTag === "BUTTON" &&
      relaxInfo.metaLabel.includes("跟练曲线") &&
      relaxed.rows === 1 &&
      relaxed.hash.includes("c=2") &&
      curveJump.flashed &&
      curveJump.inView,
    "统计页：筛空能放宽一档、快慢写明加权、「练了 N 次」跳到曲线",
    `relax=${emptyAction.label}/${emptyAction.h} paceTitle=${relaxInfo.paceTitle} meta=${relaxInfo.metaTag} rows=${relaxed.rows} hash=${relaxed.hash} curve=${curveJump.flashed}/${curveJump.inView}`,
  );
  js("localStorage.removeItem('guitar.rhythm.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");
  js("localStorage.removeItem('guitar.stats.views.v1')");
  js("(() => { for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); return 'ok'; })()");

  // 16d30) 统计页：点曲线某一天能看那天的涨幅；「只看某套」时曲线也跟着筛；
  // 放宽一档之后说清剩几条（v0.128.0）
  js(
    "(() => { const pad = n => String(n).padStart(2, '0'); const day = n => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }; const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 3, f: 0, beat: 0, dur: 1 }] }; const base = Date.now(); localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'p:extra-q1': { bestBpm: 90, sessions: 3, minutes: 20, lastAt: day(1), history: [{ date: day(12), bpm: 60 }, { date: day(5), bpm: 70 }, { date: day(1), bpm: 90 }], hardest: { bar: 2, degree: 5, name: 'G', count: 6, at: day(1) }, title: '单弦爬格子' }, 'p:extra-q2': { bestBpm: 60, sessions: 2, minutes: 6, lastAt: day(0), history: [{ date: day(10), bpm: 60 }, { date: day(0), bpm: 60 }], hardest: { bar: 1, degree: 3, name: 'E', count: 2, at: day(0) }, title: '另一条' }, 'p:extra-q3': { bestBpm: 70, sessions: 1, minutes: 5, lastAt: day(2), history: [{ date: day(9), bpm: 65 }, { date: day(2), bpm: 70 }], hardest: { bar: 3, degree: 3, name: 'E', count: 3, at: day(2) } } })); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-q1', date: day(0), title: '单弦爬格子', tab, meter: '4/4', bpm: 70, addedAt: base - 3000, setName: '早课' }, { id: 'extra-q2', date: day(0), title: '另一条', tab, meter: '4/4', bpm: 70, addedAt: base - 2000, setName: '晚课' }])); localStorage.removeItem('guitar.stats.views.v1'); for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); return 'ok'; })()",
  );
  // 先把地址栏上的筛选清掉——上一条用例留在 `?d=3&c=2`，reload 会把它们带回来
  js("location.hash = '#stats'");
  await sleep(200);
  ab(["reload"]);
  await sleep(1000);
  js("document.querySelector('.curve-svg')?.scrollIntoView({ block: 'center' })");
  await sleep(300);
  js(
    "(() => { const svg = document.querySelector('.curve-svg'); const box = svg.getBoundingClientRect(); svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + box.width * 0.5, clientY: box.top + box.height * 0.5 })); return 'ok'; })()",
  );
  await sleep(400);
  const curveHit = JSON.parse(
    String(
      js(
        "(() => { const svg = document.querySelector('.curve-svg'); return JSON.stringify({ day: document.querySelector('.curve-day')?.textContent?.trim() ?? '', dots: document.querySelectorAll('.curve-picked').length, role: svg?.getAttribute('role') ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 键盘：Tab 过来按回车也能翻（曲线是画出来的，键盘得有路）
  js("document.querySelector('.curve-svg')?.focus()");
  js(
    "(() => { document.querySelector('.curve-svg')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'ok'; })()",
  );
  await sleep(350);
  const curveKey = JSON.parse(
    String(js("(() => JSON.stringify({ day: document.querySelector('.curve-day')?.textContent?.trim() ?? '' }))()"))
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 只看「早课」：曲线也跟着只剩这一套的
  js("(() => { document.querySelector('.hardest-set-btn')?.click(); return 'ok'; })()");
  await sleep(500);
  const curveSet = JSON.parse(
    String(
      js(
        "(() => { const head = [...document.querySelectorAll('.stat-sub')].find(n => n.textContent?.includes('跟练进步')); return JSON.stringify({ head: head?.textContent?.replace(/\\s+/g, ' ').trim() ?? '', curves: document.querySelectorAll('.curve-list li').length, note: document.querySelector('.stat-sub-note')?.textContent ?? '' }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  // 清掉套筛，筛到空再放宽一档：提示里要说还剩几条
  js("(() => { document.querySelector('.hardest-set-btn')?.click(); return 'ok'; })()");
  await sleep(400);
  const v128Clear = JSON.parse(
    String(js("(() => JSON.stringify({ rows: document.querySelectorAll('[data-hardest-item]').length, hash: location.hash }))()"))
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  js("(() => { const chip = [...document.querySelectorAll('.hardest-filter .chip')].find(el => el.textContent.trim() === '第 3 级'); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const v128Degree = JSON.parse(
    String(js("(() => JSON.stringify({ rows: document.querySelectorAll('[data-hardest-item]').length, hash: location.hash }))()"))
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  js("(() => { const chip = [...document.querySelectorAll('.hardest-count .chip')].find(el => el.textContent.trim().startsWith('≥4 次')); chip?.click(); return 'ok'; })()");
  await sleep(400);
  const v128Count = JSON.parse(
    String(js("(() => JSON.stringify({ rows: document.querySelectorAll('[data-hardest-item]').length, hash: location.hash }))()"))
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  const relaxEmptyRows = Number(
    String(js("(() => String(document.querySelectorAll('[data-hardest-item]').length))()")).replace(/^"|"$/g, ""),
  );
  js("document.querySelector('.hardest-empty-action')?.click()");
  await sleep(600);
  const relaxNote = JSON.parse(
    String(
      js(
        "(() => JSON.stringify({ note: document.querySelector('.hardest-relax')?.textContent?.trim() ?? '', rows: document.querySelectorAll('[data-hardest-item]').length }))()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    curveHit.role === "button" &&
      curveHit.day.includes("BPM") &&
      curveHit.dots === 1 &&
      curveKey.day.includes("BPM") &&
      curveSet.curves === 1 &&
      curveSet.note.includes("只看") &&
      relaxEmptyRows === 0 &&
      relaxNote.note.includes("之后有 2 条") &&
      relaxNote.rows === 2,
    "统计页：曲线点一天能看那天的涨幅，只看某套时曲线也筛，放宽后说清剩几条",
    `hit=${curveHit.role}/${curveHit.day}/${curveHit.dots} key=${curveKey.day} set=${curveSet.curves}/${curveSet.note} empty=${relaxEmptyRows} relax=${relaxNote.note}/${relaxNote.rows} steps=${v128Clear.rows}@${v128Clear.hash} → ${v128Degree.rows}@${v128Degree.hash} → ${v128Count.rows}@${v128Count.hash}`,
  );
  js("localStorage.removeItem('guitar.rhythm.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");
  js("(() => { for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); return 'ok'; })()");

  // 16d31) 统计页：最卡那天的点上有圈，双击那天直接去练那一小节（v0.129.0）
  js(
    "(() => { const pad = n => String(n).padStart(2, '0'); const day = n => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }; const tab = { beatsPerBar: 4, bars: 4, notes: [{ s: 3, f: 0, beat: 0, dur: 1 }] }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'p:extra-h1': { bestBpm: 90, sessions: 3, minutes: 20, lastAt: day(1), history: [{ date: day(12), bpm: 60 }, { date: day(2), bpm: 70 }, { date: day(1), bpm: 90 }], hardest: { bar: 3, degree: 5, name: 'G', count: 6, at: day(2) }, title: '单弦爬格子', spots: [] } })); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-h1', date: day(0), title: '单弦爬格子', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 3000, setName: '早课' }])); localStorage.removeItem('guitar.stats.views.v1'); for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); location.hash = '#stats'; return 'ok'; })()",
  );
  await sleep(200);
  ab(["reload"]);
  await sleep(1000);
  js("document.querySelector('.curve-svg')?.scrollIntoView({ block: 'center' })");
  await sleep(300);
  const hardMark = Number(
    String(js("(() => String(document.querySelectorAll('.curve-hard').length))()")).replace(/^"|"$/g, ""),
  );
  js(
    "(() => { const svg = document.querySelector('.curve-svg'); const box = svg.getBoundingClientRect(); const x = box.left + box.width * 0.5; const y = box.top + box.height * 0.5; svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); return 'ok'; })()",
  );
  await sleep(400);
  const hardDay = String(
    js("(() => document.querySelector('.curve-day')?.textContent?.trim() ?? '')()"),
  ).replace(/^"|"$/g, "");
  // 圈上的「卡了几次」要在双击跳走之前读——跳走之后这张图就不在页面上了
  const hardCountText = String(
    js("(() => document.querySelector('.curve-hard-n')?.textContent ?? '')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const svg = document.querySelector('.curve-svg'); const box = svg.getBoundingClientRect(); const x = box.left + box.width * 0.5; const y = box.top + box.height * 0.5; svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y })); return 'ok'; })()",
  );
  await sleep(1400);
  const jumpFollow = JSON.parse(
    String(
      js(
        "(() => JSON.stringify({ hash: location.hash, tab: document.querySelector('nav.tabs button[aria-current=\"page\"]')?.textContent ?? '', follow: !!document.querySelector('.follow'), title: document.querySelector('.follow h3')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '', from: document.querySelector('select[aria-label=\"循环从第几小节开始\"]')?.value ?? '', to: document.querySelector('select[aria-label=\"循环到第几小节结束\"]')?.value ?? '' }))()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    hardMark === 1 &&
      hardDay.includes("那天卡在第 3 小节") &&
      jumpFollow.tab === "练习" &&
      jumpFollow.follow &&
      jumpFollow.title.includes("单弦爬格子") &&
      jumpFollow.from === "3" &&
      jumpFollow.to === "3",
    "统计页：最卡那天的点上有圈，双击那天直接去练那一小节",
    `圈=${hardMark} day=${hardDay} → ${jumpFollow.hash} ${jumpFollow.tab}/${jumpFollow.follow}/${jumpFollow.from}-${jumpFollow.to}`,
  );

  // 16d32) 圈上写着「卡了几次」，面板里把那一小节单独放大一份（v0.130.0）
  const hardCountInfo = JSON.parse(
    String(
      js(
        "(() => JSON.stringify({ zoom: document.querySelector('.follow-zoom-head')?.textContent?.trim() ?? '', zoomImg: !!document.querySelector('.follow-zoom img') }))()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    hardCountText === "6" && hardCountInfo.zoom.includes("第 3 小节单独放大") && hardCountInfo.zoomImg,
    "统计页：圈上写着卡了几次，面板里那一小节单独放大",
    `${hardCountText} 次 · ${hardCountInfo.zoom}`,
  );

  // 16d33) 双击普通一天（不是最卡那天）→ 去那套里那天最快的那一条
  js(
    "(() => { const pad = n => String(n).padStart(2, '0'); const day = n => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }; const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 3, f: 0, beat: 0, dur: 4 }] }; localStorage.setItem('guitar.rhythm.v1', JSON.stringify({ 'r-a': { bestBpm: 70, sessions: 2, minutes: 12, lastAt: day(3), history: [{ date: day(9), bpm: 50 }, { date: day(3), bpm: 70 }], title: '曲甲', spots: [] }, 'r-b': { bestBpm: 88, sessions: 1, minutes: 6, lastAt: day(3), history: [{ date: day(3), bpm: 88 }], title: '曲乙', spots: [] } })); localStorage.setItem('guitar.plan.v1', JSON.stringify([{ id: 'extra-qa', date: day(0), title: '曲甲', tab, meter: '4/4', bpm: 70, addedAt: Date.now() - 3000, setName: '晚课' }, { id: 'extra-qb', date: day(0), title: '曲乙', tab, meter: '4/4', bpm: 88, addedAt: Date.now() - 2000, setName: '晚课' }])); localStorage.removeItem('guitar.stats.views.v1'); for (const key of ['degree', 'stage', 'spot', 'set', 'count']) sessionStorage.removeItem(`guitar.stats.${key}`); location.hash = '#stats'; return 'ok'; })()",
  );
  await sleep(200);
  ab(["reload"]);
  await sleep(1000);
  js("document.querySelector('.curve-svg')?.scrollIntoView({ block: 'center' })");
  await sleep(300);
  js(
    "(() => { const svg = document.querySelector('.curve-svg'); const box = svg.getBoundingClientRect(); const x = box.left + box.width - 2; const y = box.top + box.height * 0.5; svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y })); return 'ok'; })()",
  );
  await sleep(1400);
  const fastest = String(js("location.hash")).replace(/^"|"$/g, "");
  log(
    fastest.includes("r-b"),
    "统计页：双击普通一天，去那套里那天最快的那条",
    `→ ${fastest}`,
  );
  js("localStorage.removeItem('guitar.rhythm.v1')");
  js("localStorage.removeItem('guitar.plan.v1')");
  js("location.hash = '#stats'");
  await sleep(300);

  // 16e) 调音页：六根空弦都在、点「开始」拿不到麦克风时要有一句人话
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '调音'); b?.click(); return 'ok'; })()",
  );
  await sleep(500);
  const tunerInfo = JSON.parse(
    String(
      js(
        "(() => { const btns = [...document.querySelectorAll('.tuner-string')]; const head = document.querySelector('.panel-head h2')?.textContent ?? ''; const hint = document.querySelector('.tuner-hint')?.textContent ?? ''; return JSON.stringify({ head, strings: btns.length, labels: btns.map(b => b.getAttribute('aria-label')), hint }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
  log(
    tunerInfo.head === "调音器" &&
      tunerInfo.strings === 6 &&
      tunerInfo.labels[0].includes("6 弦 E2") &&
      tunerInfo.hint.includes("拨一根空弦"),
    "调音页：六根空弦都在，先教你怎么用",
    `${tunerInfo.strings} 根 · ${tunerInfo.hint}`,
  );

  // 无头浏览器没有麦克风：点「开始」之后必须落到一句解释上，而不是一直转圈
  js(
    "(() => { const b = [...document.querySelectorAll('.tuner-actions button')].find(n => n.textContent.trim() === '开始'); b?.click(); return 'ok'; })()",
  );
  await sleep(1200);
  const tunerAfter = String(
    js(
      "(() => { const tip = document.querySelector('.tuner-tip')?.textContent ?? ''; const hint = document.querySelector('.tuner-hint')?.textContent ?? ''; return JSON.stringify({ tip, hint }); })()",
    ),
  )
    .replace(/^"|"$/g, "")
    .replace(/\\"/g, '"');
  const tunerState = JSON.parse(tunerAfter);
  log(
    tunerState.tip.includes("麦克风") || tunerState.hint.includes("在听"),
    "调音页：点「开始」后要么在听，要么说清为什么听不了",
    tunerState.tip.slice(0, 40) || tunerState.hint,
  );



  // 17) 新版本提示：触发后出现在底部，「稍后」能收掉
  js(
    "(() => { const b = [...document.querySelectorAll('nav.tabs button')].find(n => n.textContent === '节奏'); b?.click(); return 'ok'; })()",
  );
  await sleep(600);
  const beforeToast = String(js("(() => String(document.querySelectorAll('.update-toast').length))()")).replace(
    /^"|"$/g,
    "",
  );
  js("(() => { window.__guitarNotifyUpdate?.(); return 'ok'; })()");
  await sleep(400);
  const toastText = String(
    js("(() => document.querySelector('.update-toast')?.textContent ?? 'none')()"),
  ).replace(/^"|"$/g, "");
  js(
    "(() => { const b = [...document.querySelectorAll('.update-toast button')].find(n => n.textContent.trim() === '稍后'); b?.click(); return 'ok'; })()",
  );
  await sleep(300);
  const afterToast = String(js("(() => String(document.querySelectorAll('.update-toast').length))()")).replace(
    /^"|"$/g,
    "",
  );
  log(
    beforeToast === "0" && toastText.includes("新版本") && toastText.includes("刷新") && afterToast === "0",
    "新版本提示：默认不出现，收到更新后弹在底部，「稍后」能收掉",
    `前 ${beforeToast} / ${toastText} / 后 ${afterToast}`,
  );

} catch (error) {
  // 断言脚本自己报错也要算失败：以前只有 finally，异常会被吞掉还打印「通过」
  failed += 1;
  console.error("\n检查脚本自己出错了：", error);
} finally {
  ab(["close"]);
  console.log(
    failed === 0
      ? "\n浏览器冒烟检查通过（声音本身听不到，出声还得人来听）"
      : `\n浏览器冒烟检查失败：${failed} 项`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
