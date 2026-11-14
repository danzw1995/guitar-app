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

  // 2) 主导航 8 个 Tab，能切到「节奏」
  const tabs = js("document.querySelectorAll('nav.tabs button').length");
  log(tabs === "8", `主导航有 8 个 Tab（读到 ${tabs}）`);

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
  const deep = JSON.parse(
    String(
      js(
        "(() => { const el = document.getElementById('drill-s1-cycle'); const r = el?.getBoundingClientRect(); return JSON.stringify({ found: Boolean(el), inView: r ? r.top >= 0 && r.bottom <= window.innerHeight : false }); })()",
      ),
    )
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"'),
  );
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

  // 13b2) 统计页：「这一周 vs 上周同期」——种两天记录，卡片上要有正数差和起算日
  js(
    "(() => { const log = { '2026-11-10': { minutes: 30, stage: 0, done: ['s0-crawl'] }, '2026-11-13': { minutes: 25, stage: 0, done: ['s0-scale'] }, '2026-11-05': { minutes: 20, stage: 0, done: ['s0-press'] } }; localStorage.setItem('guitar.practice.v1', JSON.stringify(log)); return 'ok'; })()",
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
        "(() => { const bar = document.querySelector('.goal-bar'); const num = document.querySelector('.goal-num'); const s = JSON.parse(localStorage.getItem('guitar.settings.v1') || '{}'); return JSON.stringify({ bar: !!bar, now: bar?.getAttribute('aria-valuenow') ?? '', num: num?.textContent?.trim() ?? '', saved: s.weeklyGoal ?? 0 }); })()",
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
