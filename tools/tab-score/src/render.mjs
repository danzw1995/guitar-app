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
  // 效果线（P.M. 虚线）默认只在跨拍时才画成「一组」；单拍的闷音就只剩一个 P.M. 文字，
  // 谱面上看不出闷到哪儿。打开这个开关，单拍也会画一条到拍尾的短线。
  settings.notation.extendLineEffectsToBeatEnd = true;
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
  // `P.M.` 默认是小号斜体衬线字（给五线谱用的），缩到卡片里几乎看不清，
  // 换成无衬线、放大到 11 号，和制谱软件的观感更接近。
  if (Font) {
    resources.elementFonts.set(
      alphaTab.NotationElement.EffectPalmMute,
      new Font("Arial, sans-serif", 11),
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
  if (arrows.size > 0) {
    // 箭头画在每行谱的下方，行距要留出这一行的高度，
    // 否则第一行的箭头会压在第二行的弦线上。
    settings.display.systemPaddingBottom = 34;
    settings.display.lastSystemPaddingBottom = 26;
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
 * 每一拍的横向区间（逻辑像素），按时间顺序平铺。
 *
 * 和 `beatLines()` 用的是同一套切分：先把一小节按拍号切成 num 拍，
 * 再取「拍与拍分界」的位置。这里返回的是**每一拍占的宽度**，
 * 网页上播放时用它画一条跟着走的竖条（高亮当前拍）。
 */
function beatBands(renderer) {
  const bands = [];
  for (const system of renderer.boundsLookup?.staffSystems ?? []) {
    // 每一行谱的纵向范围：高亮条只在自己那一行里画，不能贯穿整张图
    const systemBox = system.visualBounds;
    const systemY = systemBox?.y ?? 0;
    const systemH = systemBox?.h ?? 0;
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        const beats = (barBounds.beats ?? [])
          .filter((beat) => beat.beat)
          .sort((a, b) => a.beat.playbackStart - b.beat.playbackStart);
        const bar = barBounds.visualBounds;
        if (!bar || beats.length === 0) continue;
        const master = beats[0].beat.voice?.bar?.masterBar;
        if (!master) continue;
        const barTicks = master.calculateDuration();
        const perBar = master.timeSignatureNumerator;
        if (!(barTicks > 0) || !(perBar > 1)) continue;
        const ticksPerBeat = barTicks / perBar;
        const barStart = beats[0].beat.playbackStart;

        const edges = [bar.x];
        const slot = bar.w / perBar;
        for (let k = 1; k < perBar; k += 1) {
          const target = barStart + k * ticksPerBeat;
          const nextIndex = beats.findIndex((beat) => beat.beat.playbackStart >= target);
          let at;
          if (nextIndex === -1) {
            // 后面的拍上没有音（整小节和弦、延音），按比例切，别把两拍并成一拍
            at = bar.x + slot * k;
          } else {
            // 拍点落在两个音之间时取中点：画在音上会把品数盖住
            const prev = nextIndex > 0 ? beats[nextIndex - 1].visualBounds : bar;
            const next = beats[nextIndex].visualBounds;
            at = prev === bar ? next.x : (prev.x + prev.w + next.x) / 2;
          }
          // 夹在「这一拍该在的位置」附近，保证边界单调、每拍都分到一条
          at = Math.min(Math.max(at, bar.x + slot * (k - 0.35)), bar.x + slot * (k + 0.35));
          if (at > edges[edges.length - 1] + 2) edges.push(at);
        }
        edges.push(bar.x + bar.w);
        for (let k = 0; k + 1 < edges.length; k += 1) {
          const width = edges[k + 1] - edges[k];
          if (width > 0.5) bands.push({ x: edges[k], w: width, y: systemY, h: systemH });
        }
      }
    }
  }
  return bands;
}

/**
 * 扫弦箭头：位置用渲染后的 `onNotesX`（这一拍音符的正中），方向用模型里记下的。
 *
 * 箭头要画在**自己那一行谱**的下面：长谱会折成两三行系统，如果统一按整张图的高度去画，
 * 第一行的箭头就会跑到最后一行底下（`sn-folk` 那种四小节两行的谱尤其明显）。
 * 所以这里连「这一行谱的底边」一起返回，调用方按 `bottom + 8` 落笔。
 */
function strumArrows(renderer, arrows) {
  const out = [];
  if (!arrows || arrows.size === 0) return out;
  for (const system of renderer.boundsLookup?.staffSystems ?? []) {
    const beats = [];
    // 用整行系统的底边（比单小节高，含符干和符梁），否则箭头会插进符梁里。
    let bottom = system.visualBounds
      ? system.visualBounds.y + system.visualBounds.h
      : -Infinity;
    for (const masterBarBounds of system.bars ?? []) {
      for (const barBounds of masterBarBounds.bars ?? []) {
        const box = barBounds.visualBounds;
        if (box) bottom = Math.max(bottom, box.y + box.h);
        for (const beatBounds of barBounds.beats ?? []) {
          const dir = arrows.get(beatBounds.beat);
          if (dir) beats.push({ x: beatBounds.onNotesX, dir });
        }
      }
    }
    if (!Number.isFinite(bottom)) continue;
    for (const beat of beats) out.push({ ...beat, bottom });
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
 * 把四边的透明像素裁掉，只留真正画了东西的那块。
 *
 * 为什么不用 `boundsLookup` 算：那里面只有谱线和音，画在谱线上方的 P.M.、箭头、
 * 探出字盒的品数都不在内，按它裁就会缺一角。像素是最终的真相。
 * `readPixels()` 给的是原始 RGBA（每 4 字节一组），alpha 固定在第 4 个，和通道顺序无关。
 */
function trimTransparent(image) {
  const width = image.width;
  const height = image.height;
  const raw = image.readPixels();
  if (!raw) return null;
  const pixels = new Uint8Array(raw);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (pixels[row + x * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const from = ((minY + y) * width + minX) * 4;
    out.set(pixels.subarray(from, from + w * 4), y * w * 4);
  }
  const cropped = alphaSkia.AlphaSkiaImage.fromPixels(w, h, out.buffer);
  return cropped ? { image: cropped, width: w, height: h, x: minX, y: minY } : null;
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
  const pad = opts.padding ?? 6;
  const arrowList = strumArrows(renderer, arrows);
  const total = parts.reduce(
    (acc, part) => ({
      width: Math.max(acc.width, part.x + part.width),
      height: Math.max(acc.height, part.y + part.height),
    }),
    { width: 0, height: 0 },
  );
  // 只在真正画了东西的范围上合成：alphaTab 的图块就是「整行谱」的位图，
  // 它已经把 P.M.、符干符梁都包含在内了；右边的空白由下面的像素裁边去掉。
  // 四周再留一圈 margin，给探出图块的效果记号（P.M. 的虚线上边）和箭头留位。
  const margin = 48;
  const stage = new alphaSkia.AlphaSkiaCanvas();
  stage.beginRender(
    Math.ceil((total.width + margin * 2) * dpi),
    Math.ceil((total.height + margin * 2) * dpi),
    1,
  );
  const shiftX = margin;
  const shiftY = margin;
  for (const part of parts) {
    if (!part.image) continue;
    stage.drawImage(
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
    stage.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(r, g, b, a);
    // 图会被浏览器缩到卡片宽度（约 520 CSS px），1 物理像素的线缩完就看不见了，
    // 按 dpi 放大到 1.4 逻辑像素。
    stage.lineWidth = Math.max(1, Math.round(1.4 * dpi));
    for (const line of beatLines(renderer, color)) {
      const x = (line.x + shiftX) * dpi;
      const top = (line.y1 + shiftY) * dpi;
      const bottom = (line.y2 + shiftY) * dpi;
      // alphaSkia 没有虚线，按 2 实 5 空自己切段
      for (let y = top; y < bottom; y += 7 * dpi) {
        stage.beginPath();
        stage.moveTo(x, y);
        stage.lineTo(x, Math.min(y + 2 * dpi, bottom));
        stage.stroke();
      }
    }
  }
  // 扫弦方向：画在**各自那一行谱**的下方，一根短竖线 + 箭头尖。
  // 下扫画成朝上的箭头（六线谱 1 弦在上，下扫是从 6 弦扫到 1 弦），和板书一致。
  if (arrowList.length > 0) {
    const { r, g, b, a } = hexToRgba(opts.arrowColor ?? "#8b949e", 1);
    stage.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(r, g, b, a);
    stage.lineWidth = Math.max(1, Math.round(1.4 * dpi));
    for (const arrow of arrowList) {
      const x = (arrow.x + shiftX) * dpi;
      const top = (arrow.bottom + shiftY + 8) * dpi;
      const bottom = top + 13 * dpi;
      stage.beginPath();
      stage.moveTo(x, top);
      stage.lineTo(x, bottom);
      stage.stroke();
      const down = arrow.dir === "down";
      const tip = down ? top : bottom;
      const sign = down ? 1 : -1;
      for (const side of [-1, 1]) {
        stage.beginPath();
        stage.moveTo(x + side * 3.4 * dpi, tip + sign * 5 * dpi);
        stage.lineTo(x, tip);
        stage.stroke();
      }
    }
  }

  const stageImage = stage.endRender();
  if (!stageImage) {
    throw new Error("alphaSkia 合成图片失败");
  }
  const trimmed = trimTransparent(stageImage);
  if (!trimmed) {
    throw new Error("谱面上没有任何内容（alphaTex 可能解析成了空谱）");
  }
  // 内容窄的谱（比如两小节 2/4 只有 4 拍）裁完会变得很窄，卡片里按宽度一拉就放大一倍多，
  // 和别的卡不是一个字号。给它补到 minWidth，让同一批图在页面里大小一致；补出来的空白两边分。
  const minWidth = Math.max(0, opts.minWidth ?? 0) * dpi;
  const outWidth = Math.max(trimmed.width, minWidth) + pad * 2 * dpi;
  const outHeight = trimmed.height + pad * 2 * dpi;

  const canvas = new alphaSkia.AlphaSkiaCanvas();
  canvas.beginRender(outWidth, outHeight, 1);
  if (colors.background) {
    canvas.color = alphaSkia.AlphaSkiaCanvas.rgbaToColor(
      parseInt(colors.background.slice(1, 3), 16),
      parseInt(colors.background.slice(3, 5), 16),
      parseInt(colors.background.slice(5, 7), 16),
      255,
    );
    canvas.fillRect(0, 0, outWidth, outHeight);
  }
  const dx = pad * dpi + Math.max(0, (minWidth - trimmed.width) / 2);
  canvas.drawImage(trimmed.image, dx, pad * dpi, trimmed.width, trimmed.height);

  const image = canvas.endRender();
  if (!image) {
    throw new Error("alphaSkia 合成图片失败");
  }
  const png = image.toPng();
  if (!png) {
    throw new Error("alphaSkia 编码 PNG 失败");
  }
  // 每一拍的横向区间 + 所在那一行谱的纵向区间，换算成**最终图片**的像素坐标
  // （网页里按百分比定位高亮条；多行谱必须带上 y，否则每一行同一列都会被照亮）。
  const beats = (opts.beatBands === false ? [] : beatBands(renderer)).map((band) => ({
    x: Math.round((band.x + shiftX) * dpi - trimmed.x + dx),
    w: Math.round(band.w * dpi),
    y: Math.round((band.y + shiftY) * dpi - trimmed.y + pad * dpi),
    h: Math.round(band.h * dpi),
  }));
  return {
    data: Buffer.from(png),
    width: image.width,
    height: image.height,
    background: colors.background,
    beats,
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
