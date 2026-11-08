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
  tabFontSize,
  transparent = false,
  engraving = {},
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
  // 六线谱的比例尺：符梁/符干的粗细、谱号（就是那个大大的 TAB）的大小都在这儿。
  // 默认值是给整页五线谱用的，缩到卡片宽度时会显得笨重。
  for (const [key, value] of Object.entries(engraving)) {
    if (value === undefined || value === null) continue;
    if (!(key in resources.engravingSettings)) {
      throw new Error(`未知的 engraving 参数：${key}`);
    }
    resources.engravingSettings[key] = value;
  }
  applyColor(resources.staffLineColor, colors.staffLineColor);
  applyColor(resources.barSeparatorColor, colors.barSeparatorColor);
  applyColor(resources.mainGlyphColor, colors.mainGlyphColor);
  applyColor(resources.secondaryGlyphColor, colors.secondaryGlyphColor);
  applyColor(resources.scoreInfoColor, colors.scoreInfoColor);
  // 品数是从 tablatureFont 画出来的（默认 14），弦距是 tabLineSpacing（默认 13）。
  // 图会缩到卡片宽度，字太小就糊成一片，所以两个一起调。
  if (Number.isFinite(tabFontSize)) resources.tablatureFont.size = tabFontSize;
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
  // 扫弦方向：alphaTab 默认把箭头画在六线谱里面，竖线正好穿过品数、
  // 箭头尖又落在 1 弦那行，把 1 弦的 0 压掉一半（缩到卡片宽度后尤其明显）。
  // 所以先把方向从模型里取出来、把箭头清掉，渲染完再自己画到谱面下方。
  const arrows = new Map();
  const brush = alphaTab.model?.BrushType;
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (!beat.brushType) continue;
            const down = brush ? beat.brushType === brush.BrushDown : beat.brushType === 2;
            arrows.set(beat, down ? "down" : "up");
            beat.brushType = brush ? brush.None : 0;
          }
        }
      }
    }
  }
  return arrows;
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

/**
 * 扫弦箭头：位置用渲染后的 `onNotesX`（这一拍音符的正中），方向用模型里记下的。
 * 只返回逻辑坐标，具体画在哪儿由调用方决定。
 */
function strumArrows(renderer, arrows) {
  const out = [];
  if (!arrows || arrows.size === 0) return out;
  for (const system of renderer.boundsLookup?.staffSystems ?? []) {
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        for (const beatBounds of barBounds.beats ?? []) {
          const dir = arrows.get(beatBounds.beat);
          if (dir) out.push({ x: beatBounds.onNotesX, dir });
        }
      }
    }
  }
  return out;
}

/**
 * 谱面真正占用的矩形。
 *
 * alphaTab 的图块宽度等于 `renderer.width`，但两小节的谱往往只画到一半，
 * 直接按图块尺寸出图会留下大片空白，缩到卡片宽度后字就小了。
 * 这里按 `boundsLookup` 把系统、小节、音的可见范围并起来，只留真正有内容的部分。
 */
function contentBounds(renderer) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (bounds) => {
    if (!bounds) return;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  };
  for (const system of renderer.boundsLookup?.staffSystems ?? []) {
    take(system.visualBounds);
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        take(barBounds.visualBounds);
        for (const beatBounds of barBounds.beats ?? []) take(beatBounds.visualBounds);
      }
    }
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
  const arrows = prepareScore(score, settings, opts);

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
  if (process.env.TAB_SCORE_DEBUG) {
    console.error("parts", JSON.stringify(parts.map((p) => ({ x: p.x, y: p.y, w: p.width, h: p.height, tw: p.totalWidth, th: p.totalHeight }))));
    for (const system of renderer.boundsLookup?.staffSystems ?? []) {
      console.error("system", JSON.stringify(system.visualBounds));
      for (const mb of system.bars ?? []) {
        console.error(" master", JSON.stringify(mb.visualBounds));
        for (const bar of mb.bars ?? []) console.error("  bar", JSON.stringify(bar.visualBounds));
      }
    }
  }

  if (problems.length > 0) {
    throw problems[0];
  }
  if (parts.length === 0) {
    throw new Error("alphaTab 没有产出任何图块（alphaTex 可能有语法错误）");
  }

  // alphaTab 给的 totalWidth/totalHeight 是「还没画完」时的高度，不可靠；
  // 每块图的像素尺寸已经按 highDpiFactor 放大过，坐标还是逻辑像素，所以要乘回去。
  const dpi = opts.pixelRatio ?? 2;
  // 谱面自己的高度只到「谱线 + 符梁」为止，第 6 弦上贴着底边的品数会被压到画布最外一行，
  // 在浏览器里缩到卡片宽度后看着就像被切掉一半（第 6 弦的 0 尤其明显）。
  // 所以四周留一圈白，底部给多一点。
  const pad = opts.padding ?? 6;
  const arrowList = strumArrows(renderer, arrows);
  // 扫弦箭头画在整块谱面下方，所以底部还要多留一行。
  const padBottom =
    opts.paddingBottom ?? (arrowList.length > 0 ? pad + 18 : pad * 2);
  const total = parts.reduce(
    (acc, part) => ({
      width: Math.max(acc.width, part.x + part.width),
      height: Math.max(acc.height, part.y + part.height),
    }),
    { width: 0, height: 0 },
  );
  // 只保留真正有内容的那块（图块宽度常常是整个 renderer.width，右边一大片空白）。
  const content =
    contentBounds(renderer) ?? { x: 0, y: 0, w: total.width, h: total.height };
  // bounds 记的是「字形盒子」的边，品数字形还会向上/向下探出去一点，
  // 不补的话 1 弦和 6 弦的品数会被裁掉小半截（这正是用户看到的「0 显示不全」）。
  const inflate = (opts.tabFontSize ?? 14) * 0.85;
  // 横向只补 3px 容纳字形探出，真正的留白由下面的 outWidth 加 pad*2 提供。
  const overhang = 3;
  content.x -= overhang;
  content.w += overhang * 2;
  content.y -= inflate;
  content.h += inflate * 2;
  // 内容窄的谱（比如两小节 2/4 只有 4 拍）裁完会变得很窄，卡片里按宽度一拉就放大一倍多，
  // 和别的卡不是一个字号。给它补到 minWidth，让同一批图在页面里大小一致；补出来的空白两边分。
  const outWidth = Math.max(content.w, opts.minWidth ?? 0) + pad * 2;
  const outHeight = content.h + pad + padBottom;
  const slack = Math.max(0, (opts.minWidth ?? 0) - content.w) / 2;
  const shiftX = pad + slack - content.x;
  const shiftY = pad - content.y;

  const canvas = new alphaSkia.AlphaSkiaCanvas();
  canvas.beginRender(outWidth * dpi, outHeight * dpi, 1);
  if (colors.background) {
    canvas.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(
      parseInt(colors.background.slice(1, 3), 16),
      parseInt(colors.background.slice(3, 5), 16),
      parseInt(colors.background.slice(5, 7), 16),
      255,
    );
    canvas.fillRect(0, 0, outWidth * dpi, outHeight * dpi);
  }
  for (const part of parts) {
    if (!part.image) continue;
    canvas.drawImage(
      part.image,
      (part.x + shiftX) * dpi,
      (part.y + shiftY) * dpi,
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
      const x = (line.x + shiftX) * dpi;
      const top = (line.y1 + shiftY) * dpi;
      const bottom = (line.y2 + shiftY) * dpi;
      // alphaSkia 没有虚线，按 2 实 5 空自己切段
      for (let y = top; y < bottom; y += 7 * dpi) {
        canvas.beginPath();
        canvas.moveTo(x, y);
        canvas.lineTo(x, Math.min(y + 2 * dpi, bottom));
        canvas.stroke();
      }
    }
  }
  // 扫弦方向：画在谱面下方，一根短竖线 + 箭头尖。
  // 下扫画成朝上的箭头（六线谱 1 弦在上，下扫是从 6 弦扫到 1 弦），和板书一致。
  if (arrowList.length > 0) {
    const { r, g, b, a } = hexToRgba(opts.arrowColor ?? "#8b949e", 1);
    canvas.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(r, g, b, a);
    canvas.lineWidth = Math.max(1, Math.round(1.4 * dpi));
    const top = (content.h + pad + 7) * dpi;
    const bottom = top + 13 * dpi;
    for (const arrow of arrowList) {
      const x = (arrow.x + shiftX) * dpi;
      canvas.beginPath();
      canvas.moveTo(x, top);
      canvas.lineTo(x, bottom);
      canvas.stroke();
      const down = arrow.dir === "down";
      const tip = down ? top : bottom;
      const sign = down ? 1 : -1;
      for (const side of [-1, 1]) {
        canvas.beginPath();
        canvas.moveTo(x + side * 3.4 * dpi, tip + sign * 5 * dpi);
        canvas.lineTo(x, tip);
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
  const arrows = prepareScore(score, settings, opts);

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

  const pad = opts.padding ?? 6;
  const arrowList = strumArrows(renderer, arrows);
  const padBottom =
    opts.paddingBottom ?? (arrowList.length > 0 ? pad + 18 : pad * 2);
  const content =
    contentBounds(renderer) ?? { x: 0, y: 0, w: total.width, h: total.height };
  const inflate = (opts.tabFontSize ?? 14) * 0.85;
  // 横向只补 3px 容纳字形探出，真正的留白由下面的 outWidth 加 pad*2 提供。
  const overhang = 3;
  content.x -= overhang;
  content.w += overhang * 2;
  content.y -= inflate;
  content.h += inflate * 2;
  const outWidth = Math.max(content.w, opts.minWidth ?? 0) + pad * 2;
  const outHeight = content.h + pad + padBottom;

  const fontCss = opts.embedFont === false ? "" : fontFaceCss(opts.fontPath);
  const style = `${fontCss}${colors.background ? `svg{background:${colors.background}}` : ""}.at{font-family:alphaTab}.beat-line{stroke:#6e7681;stroke-opacity:.55;stroke-width:1;stroke-dasharray:2 5}.strum-arrow{stroke:#8b949e;stroke-width:1.4;stroke-linecap:round;fill:none}`;
  // 下面的坐标都用 alphaTab 的逻辑坐标，外层统一平移到留白之后。
  const arrowTop = content.y + content.h + 7;
  const arrowBottom = arrowTop + 13;
  const arrowMarks = arrowList
    .map((arrow) => {
      const x = arrow.x.toFixed(2);
      const top = arrowTop.toFixed(2);
      const bottom = arrowBottom.toFixed(2);
      const down = arrow.dir === "down";
      const tip = down ? arrowTop : arrowBottom;
      const sign = down ? 1 : -1;
      const head = [-1, 1]
        .map(
          (side) =>
            `M ${(arrow.x + side * 3.4).toFixed(2)} ${(tip + sign * 5).toFixed(2)} L ${x} ${tip.toFixed(2)}`,
        )
        .join(" ");
      return `<path class="strum-arrow" d="M ${x} ${top} L ${x} ${bottom} ${head}"/>`;
    })
    .join("");
  const lines = opts.beatLines
    ? beatLines(renderer, opts.beatLineColor ?? "#6e7681")
        .map(
          (line) =>
            `<line class="beat-line" x1="${line.x.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x.toFixed(2)}" y2="${line.y2.toFixed(2)}"/>`,
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

  const shiftX = (pad + Math.max(0, (opts.minWidth ?? 0) - content.w) / 2 - content.x).toFixed(2);
  const shiftY = (pad - content.y).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}"><style>${style}</style><g transform="translate(${shiftX},${shiftY})">${body}${lines}${arrowMarks}</g></svg>`;
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
