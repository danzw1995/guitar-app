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
  log(
    today.meters.length === 4 && today.meters.every((text) => /^已练 \d+\/\d+$/.test(text)),
    "每块练习的标题上都有「已练 N/M」",
    today.meters.join(" / "),
  );

  const jumped = js(
    "(() => { window.scrollTo(0, 0); const b = document.querySelector('.today-item .btn'); if (!b) return 'no'; b.click(); return 'ok'; })()",
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
  // 9) 我的谱：粘一段六线谱 → 预览出图 → 存下后卡片里也有图 → 删掉
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

} finally {
  ab(["close"]);
  console.log(
    failed === 0
      ? "\n浏览器冒烟检查通过（声音本身听不到，出声还得人来听）"
      : `\n浏览器冒烟检查失败：${failed} 项`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
