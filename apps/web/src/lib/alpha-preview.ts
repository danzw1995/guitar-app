// 自己粘进来的谱只在浏览器里现画一次，所以这里按需加载 alphaTab
// （约 300KB gzip，点「预览」才会下载；内置的 85 张谱仍然是预渲染好的 PNG）。
//
// 三条硬约束，都是踩过的坑：
// 1. 全页只养一个 AlphaTabApi 实例：多个实例会互相清掉图形，24 张并行只剩最后 3 张。
// 2. 每次 tex() 后 alphaTab 自己替换 surface，绝对不能手动 host.innerHTML = ""，否则实例废掉。
// 3. 等 <svg> 出现且内容稳定再取快照；renderFinished 早于 svg 进 DOM，不能当信号。
import type { AlphaTabApi } from "@coderline/alphatab";

const SCALE = 1.15;

const COLORS = {
  staffLineColor: "#3d444d",
  barSeparatorColor: "#4b535d",
  mainGlyphColor: "#c9d1d9",
  secondaryGlyphColor: "#8b949e",
  scoreInfoColor: "#8b949e",
};

interface Engine {
  host: HTMLDivElement;
  api: AlphaTabApi;
  errors: string[];
  finishedAt: number;
}

let engine: Engine | null = null;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load("16px alphaTab");
  } catch {
    // 字体加载失败也继续：alphaTab 会退回其它字形，不至于整块空白。
  }
}

async function ensureEngine(): Promise<Engine> {
  if (engine) return engine;
  const alphaTab = await import("@coderline/alphatab");

  const host = document.createElement("div");
  host.className = "alpha-host";
  // 必须留在排版流里、有真实宽高，否则 alphaTab 一张图都不画。
  host.style.cssText =
    "position:fixed;top:0;left:0;width:700px;height:720px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;";
  document.body.appendChild(host);

  const api = new alphaTab.AlphaTabApi(host, {
    core: {
      fontDirectory: `${import.meta.env.BASE_URL}font/`,
      useWorkers: false,
      logLevel: "error",
    },
    display: {
      layoutMode: alphaTab.LayoutMode.Page,
      scale: SCALE,
      resources: COLORS,
      systemPaddingBottom: 34,
      lastSystemPaddingBottom: 26,
    },
    player: {
      enablePlayer: false,
      enableCursor: false,
      enableUserInteraction: false,
    },
  } as never);

  const state: Engine = { host, api, errors: [], finishedAt: 0 };
  api.error.on((error) => {
    state.errors.push(String((error as { message?: string })?.message ?? error));
  });
  api.scoreLoaded.on((score) => {
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        staff.showTablature = true;
        staff.showStandardNotation = false;
        // 拍号会被画进 TAB 谱号里（alphaTab 量谱号宽度偏小），预览上方已写了拍号；
        // 小节号也不需要。这两条和工具里 render.mjs 的做法保持一致。
        const staffWithTab = staff as unknown as {
          tabConfig?: Record<string, unknown>;
        };
        staffWithTab.tabConfig = {
          ...(staffWithTab.tabConfig ?? {}),
          timeSignature: { isVisible: false },
          barNumber: 2, // BarNumberDisplay.Hide（这个枚举没导出，只能写字面量）
        };
      }
    }
    api.render();
  });
  api.renderFinished.on(() => {
    state.finishedAt = performance.now();
  });

  const notation = api.settings.notation as unknown as {
    rhythmHeight: number;
    extendLineEffectsToBeatEnd: boolean;
    elements: Map<number, boolean>;
  };
  notation.rhythmHeight = 14;
  notation.extendLineEffectsToBeatEnd = true;
  for (const name of ["EffectDynamics", "EffectTempo", "TrackNames", "GuitarTuning"]) {
    const element = (alphaTab.NotationElement as unknown as Record<string, number>)[name];
    if (typeof element === "number") notation.elements.set(element, false);
  }

  // 和应用里预渲染的谱图用同一套比例：默认值按整页五线谱定的，塞进卡片太笨重。
  const resources = api.settings.display.resources as unknown as {
    engravingSettings: Record<string, number>;
    tablatureFont: { size: number };
  };
  resources.tablatureFont.size = 15;
  Object.assign(resources.engravingSettings, {
    musicFontSize: 26,
    beamThickness: 2.6,
    stemThickness: 0.8,
    tabLineSpacing: 18,
    preNoteEffectPadding: 6,
  });

  engine = state;
  return state;
}

function svgCount(host: HTMLDivElement): number {
  return host.querySelectorAll("svg").length;
}

async function waitForPaint(state: Engine, before: string): Promise<void> {
  const start = performance.now();
  let stable = 0;
  let last = -1;
  while (performance.now() - start < 8000) {
    await sleep(50);
    const count = svgCount(state.host);
    const changed = state.host.innerHTML !== before;
    if (count === last) stable += 1;
    else {
      last = count;
      stable = 0;
    }
    if (count >= 1 && stable >= 6 && changed) return;
    if (
      count >= 1 &&
      changed &&
      state.finishedAt > 0 &&
      performance.now() - state.finishedAt > 400 &&
      stable >= 3
    ) {
      return;
    }
  }
  throw new Error("谱面渲染超时");
}

/** alphaTab 默认把小节号画成红色，贴到深色卡片上太跳。 */
function restyle(markup: string): string {
  return markup.replace(/#C80000/gi, "#6e7681");
}

/** 谱面渲染成 SVG 标记（同一份 tex 只画一次）。 */
export async function renderTexToMarkup(tex: string): Promise<string> {
  const hit = cache.get(tex);
  if (hit) return hit;

  const task = async (): Promise<string> => {
    const state = await ensureEngine();
    await waitForFonts();
    state.errors.length = 0;
    state.finishedAt = 0;
    const before = state.host.innerHTML;
    state.api.tex(tex);
    await waitForPaint(state, before);
    if (state.errors.length > 0) throw new Error(state.errors[0]);
    const markup = restyle(state.host.innerHTML);
    cache.set(tex, markup);
    return markup;
  };

  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
