// 把 alphaTex 渲染成图片。
//
// 这里走的是 alphaTab 的「低层 API」：不挂 DOM、不开浏览器，
// 直接 ScoreLoader → ScoreRenderer，用 alphaSkia 把每一块渲染成位图再拼起来。
// 官方的 Node.js 指南：https://alphatab.net/docs/guides/nodejs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import * as alphaTab from "@coderline/alphatab";
import * as alphaSkia from "@coderline/alphaskia";

const require = createRequire(import.meta.url);

/**
 * alphaSkia 的原生二进制按平台分包，默认只在自己的 node_modules 附近找。
 * pnpm 的嵌套安装（比如被别的 workspace 包引用）会让它找不到，这里把已知位置补进去。
 */
function addPlatformSearchPaths() {
  if (typeof alphaSkia.addSearchPaths !== "function") return;
  for (const platform of ["windows", "linux", "macos"]) {
    try {
      const pkg = require.resolve(`@coderline/alphaskia-${platform}/package.json`);
      alphaSkia.addSearchPaths(path.join(path.dirname(pkg), "lib"));
    } catch {
      // 这个平台没装，跳过
    }
  }
}

/** 主题：深色和浅色两套，颜色名与 alphaTab 的 resources 一一对应。 */
export const THEMES = {
  dark: {
    background: "#0d1117",
    staffLineColor: "#3d444d",
    barSeparatorColor: "#4b535d",
    mainGlyphColor: "#c9d1d9",
    secondaryGlyphColor: "#8b949e",
    scoreInfoColor: "#8b949e",
  },
  light: {
    background: "#ffffff",
    staffLineColor: "#9aa4ae",
    barSeparatorColor: "#6e7681",
    mainGlyphColor: "#1f2328",
    secondaryGlyphColor: "#57606a",
    scoreInfoColor: "#57606a",
  },
  transparent: {
    background: null,
    staffLineColor: "#4b535d",
    barSeparatorColor: "#6e7681",
    mainGlyphColor: "#1f2328",
    secondaryGlyphColor: "#57606a",
    scoreInfoColor: "#57606a",
  },
};

let skiaReady = false;

/** 把 Bravura 交给 alphaSkia。只做一次，重复调用无害。 */
export function initSkia(fontPath) {
  if (skiaReady) return;
  addPlatformSearchPaths();
  // 字体跟着 alphaTab 包走，不另外拷贝：dist/font/Bravura.otf
  const resolvedFont =
    fontPath ??
    path.join(
      path.dirname(fileURLToPath(import.meta.resolve("@coderline/alphatab"))),
      "font/Bravura.otf",
    );
  const fontData = fs.readFileSync(resolvedFont);
  // enableAlphaSkia 要 ArrayBuffer，且必须精确切片（Node 的 Buffer 底下是共享的 pool）
  const buffer = fontData.buffer.slice(
    fontData.byteOffset,
    fontData.byteOffset + fontData.byteLength,
  );
  alphaTab.Environment.enableAlphaSkia(buffer, alphaSkia);
  skiaReady = true;
}

function applyColor(color, hex) {
  // alphaTab 的 Color 是「raw = 0xAARRGGBB」，直接赋字符串会被当成非法值画成透明。
  color.raw = (0xff000000 | parseInt(hex.slice(1), 16)) | 0;
  color.updateRgba();
}

function makeSettings({
  scale = 1,
  pixelRatio = 2,
  theme = "dark",
  titleSize = 20,
  transparent = false,
} = {}) {
  const base = THEMES[theme] ?? THEMES.dark;
  // transparent：不铺底色，PNG 留透明，方便贴在任意背景上（页面上就是这种情况）
  const colors = transparent ? { ...base, background: null } : base;
  const settings = new alphaTab.Settings();
  settings.core.engine = "skia";
  settings.core.logLevel = "error";
  settings.display.scale = scale;
  settings.display.layoutMode = alphaTab.LayoutMode.Page;
  const resources = settings.display.resources;
  applyColor(resources.staffLineColor, colors.staffLineColor);
  applyColor(resources.barSeparatorColor, colors.barSeparatorColor);
  applyColor(resources.mainGlyphColor, colors.mainGlyphColor);
  applyColor(resources.secondaryGlyphColor, colors.secondaryGlyphColor);
  applyColor(resources.scoreInfoColor, colors.scoreInfoColor);
  // 默认标题是 32px Georgia，压在卡片上太抢，可以按需要调小。
  const Font = alphaTab.model?.Font;
  if (Font && Number.isFinite(titleSize)) {
    resources.elementFonts.set(
      alphaTab.NotationElement.ScoreTitle,
      new Font("Arial, sans-serif", titleSize),
    );
  }
  alphaTab.Environment.highDpiFactor = pixelRatio;
  return { settings, colors };
}

/** 只画六线谱：关掉五线谱、力度、速度记号、曲名、音准名。 */
function prepareScore(score, settings, opts = {}) {
  const notation = settings.notation;
  notation.elements.set(alphaTab.NotationElement.EffectDynamics, false);
  notation.elements.set(alphaTab.NotationElement.EffectTempo, false);
  notation.elements.set(alphaTab.NotationElement.TrackNames, false);
  notation.elements.set(alphaTab.NotationElement.GuitarTuning, false);
  if (opts.title === false) {
    notation.elements.set(alphaTab.NotationElement.ScoreTitle, false);
  }
  // 符梁离弦线太远会显得「飘」，默认 25 压缩到 14（和应用里一致）。
  notation.rhythmHeight = opts.rhythmHeight ?? 14;
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      staff.showTablature = true;
      staff.showStandardNotation = false;
      // 六线谱的拍号会被画进 TAB 谱号里（alphaTab 量谱号宽度偏小），
      // 卡片/标题里已经写了拍号，这里干脆不画；小节号同理。
      staff.tabConfig = {
        ...(staff.tabConfig ?? {}),
        timeSignature: { isVisible: false },
        barNumber: 2, // BarNumberDisplay.Hide（这个枚举没导出，只能写字面量）
      };
    }
  }
}

export function parseTex(tex, opts = {}) {
  initSkia(opts.fontPath);
  const { settings } = makeSettings(opts);
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, settings);
  prepareScore(score, settings, opts);
  return { score, settings };
}

/**
 * 每一拍之间那条细竖线（读谱时数拍子用）。
 *
 * alphaTab 自己不画，但它算好了每一拍的 `boundsLookup`。
 * 注意 `beats` 是「同一时刻的一组音」，不是「拍」：一串八分音符会给出 8 个 beat，
 * 所以要先按拍号把一小节切成 num 拍（用 playbackStart 的 tick 数算），
 * 再取「这一拍之前的最后一个音」和「这一拍上的第一个音」的中点当线的位置——
 * 直接画在音上会划过品数。
 *
 * 返回的是逻辑像素坐标，调用方按自己的缩放去画。
 */
function beatLines(renderer, color = "#6e7681", alpha = 0.55) {
  const lines = [];
  for (const system of renderer.boundsLookup?.staffSystems ?? []) {
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        const beats = (barBounds.beats ?? [])
          .filter((beat) => beat.beat)
          .sort((a, b) => a.beat.playbackStart - b.beat.playbackStart);
        if (beats.length < 2) continue;
        const master = beats[0].beat.voice?.bar?.masterBar;
        if (!master) continue;
        const barTicks = master.calculateDuration();
        const perBar = master.timeSignatureNumerator;
        if (!(barTicks > 0) || !(perBar > 1)) continue;
        const ticksPerBeat = barTicks / perBar;
        const barStart = beats[0].beat.playbackStart;
        const y1 = barBounds.visualBounds.y;
        const y2 = y1 + barBounds.visualBounds.h;
        for (let k = 1; k < perBar; k += 1) {
          const target = barStart + k * ticksPerBeat;
          const nextIndex = beats.findIndex((beat) => beat.beat.playbackStart >= target);
          if (nextIndex <= 0) continue;
          const prev = beats[nextIndex - 1].visualBounds;
          const next = beats[nextIndex].visualBounds;
          lines.push({ x: (prev.x + prev.w + next.x) / 2, y1, y2, color, alpha });
        }
      }
    }
  }
  return lines;
}

function hexToRgba(hex, alpha = 1) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: Math.round(Math.max(0, Math.min(1, alpha)) * 255),
  };
}

/**
 * 渲染成 PNG。
 * @returns {Promise<{ data: Buffer, width: number, height: number, background: string | null }>}
 */
export async function renderPng(tex, opts = {}) {
  initSkia(opts.fontPath);
  const { settings, colors } = makeSettings(opts);
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, settings);
  prepareScore(score, settings, opts);

  const renderer = new alphaTab.rendering.ScoreRenderer(settings);
  renderer.width = opts.width ?? 900;

  const parts = [];
  const problems = [];

  // 布局出来的每一块立刻渲染（否则 alphaTab 会等「视口」再来要）。
  renderer.partialLayoutFinished.on((args) => renderer.renderResult(args.id));
  renderer.partialRenderFinished.on((args) => {
    parts.push({
      image: args.renderResult,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      totalWidth: args.totalWidth,
      totalHeight: args.totalHeight,
    });
  });
  renderer.error.on((error) => problems.push(error));

  renderer.renderScore(score, [0]);

  if (problems.length > 0) {
    throw problems[0];
  }
  if (parts.length === 0) {
    throw new Error("alphaTab 没有产出任何图块（alphaTex 可能有语法错误）");
  }

  // alphaTab 给的 totalWidth/totalHeight 是「还没画完」时的高度，不可靠；
  // 每块图的像素尺寸已经按 highDpiFactor 放大过，坐标还是逻辑像素，所以要乘回去。
  const dpi = opts.pixelRatio ?? 2;
  const total = parts.reduce(
    (acc, part) => ({
      width: Math.max(acc.width, part.x + part.width),
      height: Math.max(acc.height, part.y + part.height),
    }),
    { width: 0, height: 0 },
  );

  const canvas = new alphaSkia.AlphaSkiaCanvas();
  canvas.beginRender(total.width * dpi, total.height * dpi, 1);
  if (colors.background) {
    canvas.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(
      parseInt(colors.background.slice(1, 3), 16),
      parseInt(colors.background.slice(3, 5), 16),
      parseInt(colors.background.slice(5, 7), 16),
      255,
    );
    canvas.fillRect(0, 0, total.width * dpi, total.height * dpi);
  }
  for (const part of parts) {
    if (!part.image) continue;
    canvas.drawImage(
      part.image,
      part.x * dpi,
      part.y * dpi,
      part.width * dpi,
      part.height * dpi,
    );
  }
  // 每拍之间的分割线：alphaTab 不画，按 boundsLookup 补，和网页里数拍子对齐用。
  if (opts.beatLines) {
    const color = opts.beatLineColor ?? "#6e7681";
    const { r, g, b, a } = hexToRgba(color, opts.beatLineAlpha ?? 0.55);
    canvas.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(r, g, b, a);
    // 图会被浏览器缩到卡片宽度（约 520 CSS px），1 物理像素的线缩完就看不见了，
    // 按 dpi 放大到 1.4 逻辑像素。
    canvas.lineWidth = Math.max(1, Math.round(1.4 * dpi));
    for (const line of beatLines(renderer, color)) {
      const x = line.x * dpi;
      const top = line.y1 * dpi;
      const bottom = line.y2 * dpi;
      // alphaSkia 没有虚线，按 2 实 5 空自己切段
      for (let y = top; y < bottom; y += 7 * dpi) {
        canvas.beginPath();
        canvas.moveTo(x, y);
        canvas.lineTo(x, Math.min(y + 2 * dpi, bottom));
        canvas.stroke();
      }
    }
  }
  const image = canvas.endRender();
  if (!image) {
    throw new Error("alphaSkia 合成图片失败");
  }
  const png = image.toPng();
  if (!png) {
    throw new Error("alphaSkia 编码 PNG 失败");
  }
  return {
    data: Buffer.from(png),
    width: image.width,
    height: image.height,
    background: colors.background,
  };
}

/**
 * 渲染成 SVG 文本（矢量，字体会内嵌成 data URI，方便单独打开看）。
 * @returns {Promise<string>}
 */
export async function renderSvg(tex, opts = {}) {
  const { settings, colors } = makeSettings(opts);
  settings.core.engine = "svg";
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, settings);
  prepareScore(score, settings, opts);

  const renderer = new alphaTab.rendering.ScoreRenderer(settings);
  renderer.width = opts.width ?? 900;

  const parts = [];
  const problems = [];
  renderer.partialLayoutFinished.on((args) => renderer.renderResult(args.id));
  renderer.partialRenderFinished.on((args) => {
    parts.push({
      markup: String(args.renderResult ?? ""),
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
    });
  });
  renderer.error.on((error) => problems.push(error));
  renderer.renderScore(score, [0]);

  if (problems.length > 0) {
    throw problems[0];
  }
  if (parts.length === 0) {
    throw new Error("alphaTab 没有产出任何图块（alphaTex 可能有语法错误）");
  }

  const total = parts.reduce(
    (acc, part) => ({
      width: Math.max(acc.width, part.x + part.width),
      height: Math.max(acc.height, part.y + part.height),
    }),
    { width: 0, height: 0 },
  );

  const fontCss = opts.embedFont === false ? "" : fontFaceCss(opts.fontPath);
  const style = `${fontCss}${colors.background ? `svg{background:${colors.background}}` : ""}.at{font-family:alphaTab}.beat-line{stroke:#6e7681;stroke-opacity:.55;stroke-width:1;stroke-dasharray:2 5}`;
  const lines = opts.beatLines
    ? beatLines(renderer, opts.beatLineColor ?? "#6e7681")
        .map(
          (line) =>
            `<line class="beat-line" x1="${line.x}" y1="${line.y1}" x2="${line.x}" y2="${line.y2}"/>`,
        )
        .join("")
    : "";
  const body = parts
    .map((part) => {
      if (!part.markup) return "";
      if (part.markup.startsWith("<svg")) {
        // 子 svg 自带 width/height，先摘掉再按块的位置塞回去
        const end = part.markup.indexOf(">");
        const head = part.markup
          .slice(0, end)
          .replace(/\swidth="[^"]*"/, "")
          .replace(/\sheight="[^"]*"/, "")
          .replace(/\sviewBox="[^"]*"/, "");
        return `${head} x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}">${part.markup.slice(end + 1)}`;
      }
      return `<g transform="translate(${part.x},${part.y})">${part.markup}</g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total.width}" height="${total.height}" viewBox="0 0 ${total.width} ${total.height}"><style>${style}</style>${body}${lines}</svg>`;
}

let fontCssCache = null;
let fontCssKey = null;

/** 把 Bravura 内嵌成 data URI，SVG 单独打开也能显示符号。 */
function fontFaceCss(fontPath) {
  const key = fontPath ?? "default";
  if (fontCssKey === key && fontCssCache !== null) return fontCssCache;
  const dir = fontPath
    ? path.dirname(fontPath)
    : path.dirname(
        path.dirname(fileURLToPath(import.meta.resolve("@coderline/alphatab"))),
      ) + "/dist/font";
  const woff2 = path.join(dir, "Bravura.woff2");
  if (!fs.existsSync(woff2)) {
    fontCssCache = "";
    return fontCssCache;
  }
  const base64 = fs.readFileSync(woff2).toString("base64");
  fontCssCache = `@font-face{font-family:'alphaTab';src:url(data:font/woff2;base64,${base64}) format('woff2');font-weight:normal;font-style:normal}`;
  fontCssKey = key;
  return fontCssCache;
}
