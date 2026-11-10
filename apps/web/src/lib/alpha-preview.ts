// 自己粘进来的谱要在浏览器里画一次，所以这里按需加载 alphaTab
// （约 300KB gzip，点「预览」/ 存下时才下载；内置的 85 张谱仍然是预渲染好的 PNG）。
//
// 画完的谱会拼成一张独立 SVG（内嵌 Bravura 字体 + 每拍分割线），再栅格化成 PNG
// 存起来，页面上显示的就是和内置谱一样的 <img>，不是活着的 alphaTab DOM。
//
// 四条硬约束，都是踩过的坑：
// 1. 全页只养一个 AlphaTabApi 实例：多个实例会互相清掉图形，24 张并行只剩最后 3 张。
// 2. 每次 tex() 后 alphaTab 自己替换 surface，绝对不能手动 host.innerHTML = ""，否则实例废掉。
// 3. 等 <svg> 出现且内容稳定再取快照；renderFinished 早于 svg 进 DOM，不能当信号。
// 4. SMuFL 字形靠 font-family: alphaTab，独立 SVG 里必须内嵌字体，否则谱号变方框。
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

/** SMuFL 字形（谱号、拍号、三连音的 3）靠 font-family: alphaTab，独立 SVG 里必须内嵌字体。 */
let fontCssPromise: Promise<string> | null = null;

async function bravuraCss(): Promise<string> {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}font/Bravura.woff2`);
        if (!response.ok) return "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        const base64 = btoa(binary);
        return `@font-face{font-family:"alphaTab";src:url(data:font/woff2;base64,${base64}) format("woff2")}`;
      } catch {
        return "";
      }
    })();
  }
  return fontCssPromise;
}

/** 六条弦线的上下沿：高度不到 2.5 的 rect 就是弦线。 */
function staffExtent(svg: SVGSVGElement): { top: number; bottom: number } | null {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of Array.from(svg.querySelectorAll("rect"))) {
    const height = rect.height.baseVal.value;
    if (height > 2.5) continue;
    const y = rect.y.baseVal.value;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + height);
  }
  return Number.isFinite(top) && bottom > top ? { top, bottom } : null;
}

interface VisualBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BeatBounds {
  beat?: { playbackStart: number; voice?: { bar?: { masterBar?: { calculateDuration(): number; timeSignatureNumerator: number } } } };
  visualBounds?: VisualBounds;
}

interface BarBounds {
  beats?: BeatBounds[];
  visualBounds?: VisualBounds;
}

interface MasterBarBounds {
  bars?: BarBounds[];
}

interface StaffSystemBounds {
  bars?: MasterBarBounds[];
}

interface BoundsLookup {
  staffSystems?: StaffSystemBounds[];
}

/**
 * 每拍的分割线（和 tab-score 生成的图用同一套算法）。
 * 注意 beats 是「同一时刻的一组音」，不是「拍」：先按 ticks 算拍点，再取相邻音的中点。
 */
function beatEdges(bounds: BoundsLookup | undefined): number[] {
  const edges: number[] = [];
  for (const system of bounds?.staffSystems ?? []) {
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        const beats = (barBounds.beats ?? [])
          .filter((beat) => beat.beat && beat.visualBounds)
          .sort((a, b) => (a.beat as { playbackStart: number }).playbackStart - (b.beat as { playbackStart: number }).playbackStart);
        const bar = barBounds.visualBounds;
        if (!bar || beats.length === 0) continue;
        const master = beats[0].beat?.voice?.bar?.masterBar;
        if (!master) continue;
        const barTicks = master.calculateDuration();
        const perBar = master.timeSignatureNumerator;
        if (!(barTicks > 0) || !(perBar > 1)) continue;
        const ticksPerBeat = barTicks / perBar;
        const barStart = (beats[0].beat as { playbackStart: number }).playbackStart;
        const slot = bar.w / perBar;
        for (let k = 1; k < perBar; k += 1) {
          const target = barStart + k * ticksPerBeat;
          const nextIndex = beats.findIndex(
            (beat) => ((beat.beat as { playbackStart: number }).playbackStart) >= target,
          );
          let at: number;
          if (nextIndex === -1) {
            at = bar.x + slot * k;
          } else {
            const prev = nextIndex > 0 ? (beats[nextIndex - 1].visualBounds as VisualBounds) : bar;
            const next = beats[nextIndex].visualBounds as VisualBounds;
            at = prev === bar ? next.x : (prev.x + prev.w + next.x) / 2;
          }
          at = Math.min(Math.max(at, bar.x + slot * (k - 0.35)), bar.x + slot * (k + 0.35));
          if (edges.length === 0 || at > edges[edges.length - 1] + 2) edges.push(at);
        }
      }
    }
  }
  return edges;
}

const BEAT_LINE_COLOR = "#8b949e";
const BEAT_LINE_OPACITY = 0.32;

/** 把 alphaTab 画在页面里的 DOM 拼成一张独立 SVG：自带字体、自带拍线，可单独转成图片。 */
async function composeSvg(state: Engine): Promise<string> {
  const svg = state.host.querySelector("svg") as SVGSVGElement | null;
  if (!svg) throw new Error("谱面渲染超时");
  const width = svg.width.baseVal.value;
  const height = svg.height.baseVal.value;
  if (!(width > 0) || !(height > 0)) throw new Error("谱面渲染超时");

  const extent = staffExtent(svg);
  const lookup = (state.api as unknown as { boundsLookup?: BoundsLookup }).boundsLookup;
  const lines = extent
    ? beatEdges(lookup)
        .map(
          (x) =>
            `<line x1="${x.toFixed(2)}" y1="${extent.top.toFixed(2)}" x2="${x.toFixed(2)}" y2="${extent.bottom.toFixed(2)}" stroke="${BEAT_LINE_COLOR}" stroke-opacity="${BEAT_LINE_OPACITY}" stroke-width="1" stroke-dasharray="2 5" />`,
        )
        .join("")
    : "";
  const css = await bravuraCss();
  // alphaTab 给 <svg> 的宽高只包住谱线，符梁、箭头、品数会画出这个框被裁掉，
  // 所以按真实内容（getBBox）重开一块画布，四周留一圈余量。
  let box = { x: 0, y: 0, width, height };
  try {
    const measured = svg.getBBox();
    if (measured.width > 0 && measured.height > 0) {
      box = {
        x: Math.min(0, measured.x),
        y: Math.min(0, measured.y),
        width: Math.max(measured.x + measured.width, width) - Math.min(0, measured.x),
        height: Math.max(measured.y + measured.height, height) - Math.min(0, measured.y),
      };
    }
  } catch {
    // 量不到就退回 svg 自己的宽高。
  }
  const margin = 8;
  const viewX = box.x - margin;
  const viewY = box.y - margin;
  const viewWidth = box.width + margin * 2;
  const viewHeight = box.height + margin * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${viewHeight}" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" style="font-family:'alphaTab'">` +
    (css ? `<style>${css}</style>` : "") +
    restyle(svg.innerHTML) +
    lines +
    `</svg>`
  );
}

const svgCache = new Map<string, string>();

/** 谱面画成一张独立 SVG（同一份 tex 只画一次）。 */
export async function renderTexToSvg(tex: string): Promise<string> {
  const hit = svgCache.get(tex);
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
    const svg = await composeSvg(state);
    svgCache.set(tex, svg);
    return svg;
  };

  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
