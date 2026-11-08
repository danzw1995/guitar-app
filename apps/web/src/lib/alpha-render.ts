/**
 * 一条 alphaTex → 一块静态 SVG（字符串）。
 *
 * 为什么要有这一层：alphaTab 的 `AlphaTabApi` **不能一页开几十个**。实测
 * 同时存活 6 个实例只有前 3 个出图，24 个串行创建也只有最后 3 个还留着图形
 * （后创建的会把先创建的那个 surface 清空）。所以这里只养**一个**实例，
 * 每渲染完一条就把 DOM 序列化成字符串，页面上留下的全是静态 SVG。
 *
 * **不要清空宿主的 innerHTML**：alphaTab 每次 `tex()` 会自己替换 surface 内容（不会累积），
 * 而手动清空会把它的内部引用打断，之后这条实例再也画不出东西（实测）。
 *
 * 串行还有个附带好处：alphaTab 的排版引擎、字体测量都是全局共享的，
 * 多个实例交叉渲染时偶发「一张图都没画出来」，单实例排队后就没再出现。
 */

import { AlphaTabApi, LayoutMode, NotationElement } from "@coderline/alphatab";

/** 跟站内的深色主色对齐，别让 alphaTab 用它的白底黑字默认值。 */
const COLORS = {
  staffLineColor: "#3d444d",
  barSeparatorColor: "#4b535d",
  mainGlyphColor: "#c9d1d9",
  secondaryGlyphColor: "#8b949e",
  scoreInfoColor: "#8b949e",
};

/** 卡片里用不上的谱面元素：默认力度 `f`、曲名、音准名、速度记号。 */
const HIDDEN_ELEMENTS = [
  NotationElement.EffectDynamics,
  NotationElement.EffectTempo,
  NotationElement.TrackNames,
  NotationElement.GuitarTuning,
];

/** 拍号字形（`E080`–`E08F`）。卡片头部已经写了「拍号：4/4」，谱面里再画一次会和 TAB 谱号叠在一起。 */
function isTimeSignatureGlyph(text: string): boolean {
  return [...text].every((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 0xe080 && code <= 0xe08f;
  });
}

/**
 * 渲染完之后做两件小事：
 * - 去掉第一小节的拍号字形（alphaTab 算 TAB 谱号的宽度偏小，拍号会压在谱号上）；
 * - 把 alphaTab 默认的红色小节号换成站内的弱化色。
 */
function cleanup(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  for (const node of [...holder.querySelectorAll("text")]) {
    if (isTimeSignatureGlyph(node.textContent ?? "")) {
      node.parentElement?.remove();
      continue;
    }
    if (node.getAttribute("fill")?.toUpperCase() === "#C80000") {
      node.setAttribute("fill", "#6e7681");
    }
  }
  return holder.innerHTML;
}

interface Engine {
  host: HTMLDivElement;
  api: AlphaTabApi;
  /** 这一轮渲染里出过的错误。 */
  errors: string[];
  /** `renderFinished` 的时间戳（0 表示还没触发）。 */
  finishedAt: number;
}

let engine: Engine | null = null;
let fontsReady: Promise<void> | null = null;

function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    // 谱号、休止、附点都是 SMuFL 私有区字形，字体没量好就排版会错位。
    // `document.fonts.ready` 只等已发起的加载，所以先主动 load 一次。
    const load = document.fonts?.load?.("16px alphaTab").catch(() => undefined) ?? Promise.resolve();
    fontsReady = Promise.resolve(load).then(() => undefined);
  }
  return fontsReady;
}

function ensureEngine(scale: number): Engine {
  if (engine) return engine;

  const host = document.createElement("div");
  // 必须留在正常排版流里：alphaTab 靠容器的宽高算系统高度，`display:none` 或者
  // 高度为 0 的容器它一张图都不画（实测：走出屏幕 + 高度 0 → 6 秒超时）。
  // 所以给它固定尺寸、透明、压在页面下面，人看不见但排版照常。
  host.style.cssText =
    "position:fixed;top:0;left:0;width:482px;height:720px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;";
  document.body.appendChild(host);

  const api = new AlphaTabApi(host, {
    core: { fontDirectory: `${import.meta.env.BASE_URL}font/`, useWorkers: false, logLevel: 0 },
    display: { layoutMode: LayoutMode.Page, scale, resources: COLORS },
    player: { enablePlayer: false, enableCursor: false, enableUserInteraction: false },
  });

  for (const element of HIDDEN_ELEMENTS) {
    api.settings.notation.elements.set(element, false);
  }

  // 六线谱下方的节奏符梁默认离谱面 25（差不多一条弦距），压到 14 更紧凑，
  // 符干也不至于拖得太长——卡片里一块谱就 200 多像素高。
  api.settings.notation.rhythmHeight = 14;

  // 六线谱优先：默认 profile + staff 开关（用 `StaveProfile.Tab` 会没有符干）。
  api.scoreLoaded.on((score) => {
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        staff.showTablature = true;
        staff.showStandardNotation = false;
      }
    }
    api.render();
  });

  const current: Engine = { host, api, errors: [], finishedAt: 0 };
  api.error.on((err) => {
    current.errors.push(err?.message ?? String(err));
  });
  api.renderFinished.on(() => {
    current.finishedAt = Date.now();
  });

  engine = current;
  return current;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function staffExtent(svg: SVGSVGElement): { top: number; bottom: number } | null {
  // 弦线是一堆很细的 rect（高 1–2px）。用它们定上下沿，比拍边界靠谱：
  // 拍边界的 y 是容器坐标，减偏移后会差几个像素，线会冒出谱面。
  const ys = [...svg.querySelectorAll("rect")]
    .filter((rect) => Number(rect.getAttribute("height") ?? 0) <= 2.5)
    .map((rect) => Number(rect.getAttribute("y") ?? 0))
    .filter((value) => Number.isFinite(value));
  if (ys.length === 0) return null;
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

/**
 * 每拍之间补一条细虚线。
 *
 * alphaTab 自己不画拍线，但数拍子时没有它就只能靠音对齐去猜第几拍（用户明确要过）。
 * 拍位置从 `api.boundsLookup` 拿：分支是 staffSystem → masterBar → bar（每轨一条）→ beat，
 * 每层的 `visualBounds` 是容器坐标，所以要减去对应 svg 的偏移才是 svg 自己的坐标。
 */
function addBeatLines(current: Engine): void {
  const lookup = current.api.boundsLookup;
  if (!lookup) return;
  const svgs = [...current.host.querySelectorAll("svg")];
  if (svgs.length === 0) return;

  lookup.staffSystems.forEach((system, index) => {
    // 一个 system 画在自己的 svg 里；数量对不上时退到最后一个（单 system 的谱）。
    const svg = svgs[index] ?? svgs[svgs.length - 1];
    const extent = staffExtent(svg);
    for (const masterBar of system.bars) {
      for (const bar of masterBar.bars) {
        const beats = bar.beats;
        for (let i = 1; i < beats.length; i++) {
          const prev = beats[i - 1].visualBounds;
          const cur = beats[i].visualBounds;
          // 两拍之间的空档中点，比贴在某一拍上更像「分割线」。
          const x = (prev.x + prev.w + cur.x) / 2;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", String(x));
          line.setAttribute("x2", String(x));
          if (extent) {
            line.setAttribute("y1", String(extent.top));
            line.setAttribute("y2", String(extent.bottom));
          } else {
            line.setAttribute("y1", String(bar.visualBounds.y));
            line.setAttribute("y2", String(bar.visualBounds.y + bar.visualBounds.h));
          }
          line.setAttribute("class", "tab-beat-line");
          svg.appendChild(line);
        }
      }
    }
  });
}

/** 等这一个 surface 画完：至少两张 svg（曲名 + 谱面），并且连续 300ms 不再增加。 */
async function waitForPaint(current: Engine): Promise<boolean> {
  const startedAt = Date.now();
  let last = 0;
  let stable = 0;
  while (Date.now() - startedAt < 6000) {
    await sleep(50);
    const count = current.host.querySelectorAll("svg").length;
    if (count > 0 && count === last) stable += 1;
    else stable = 0;
    last = count;
    const renderSettled = current.finishedAt > 0 && Date.now() - current.finishedAt >= 400;
    if (count >= 2 && stable >= 6) return true;
    if (renderSettled && count >= 2 && stable >= 3) return true;
    if (count >= 1 && stable >= 40) return true;
  }
  return false;
}

let queue: Promise<unknown> = Promise.resolve();

async function renderOnce(tex: string, scale: number): Promise<string> {
  await ensureFonts();
  const current = ensureEngine(scale);
  if (current.api.settings.display.scale !== scale) current.api.settings.display.scale = scale;

  for (let attempt = 0; attempt < 3; attempt++) {
    current.errors.length = 0;
    current.finishedAt = 0;
    current.api.tex(tex);
    if (await waitForPaint(current)) {
      addBeatLines(current);
      // 不清空容器：alphaTab 每次渲染会自己替换 surface 里的内容（实测不累积），
      // 而 innerHTML = "" 会把它的内部引用打断，之后这条实例再也画不出东西。
      return cleanup(current.host.innerHTML);
    }
    if (current.errors.length > 0) break;
  }
  throw new Error(current.errors[0] ?? "alphaTab 渲染超时");
}

/** 同一条 tex 只渲染一次；渲染是排队的，所以一页几十张也不会互相踩。 */
const cache = new Map<string, string>();

export function alphaScoreCacheKey(tex: string, scale: number): string {
  return `${scale}::${tex}`;
}

export function renderAlphaScore(tex: string, scale = 1.15): Promise<string> {
  const key = alphaScoreCacheKey(tex, scale);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const task = queue.then(async () => {
    const markup = await renderOnce(tex, scale);
    cache.set(key, markup);
    return markup;
  });
  queue = task.catch(() => undefined);
  return task;
}
