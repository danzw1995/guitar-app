// 把 alphaTab 画出来的一张谱变成 PNG：和 apps/web/scripts/gen-scores.ts 生成的
// 内置谱图同一套规则——裁到内容、四周留白、两倍像素、透明底，页面里统一用 <img class="tab-score">。
import { renderTexToSvg } from "./alpha-preview";

/** 一倍像素下的留白与最小宽度，数值和 tools/tab-score 的默认值保持一致。 */
const PIXEL_RATIO = 2;
const PADDING = 6;
const PADDING_BOTTOM = 12;
const MIN_WIDTH = 420;
const ALPHA_THRESHOLD = 8;

export interface ScoreImage {
  /** `data:image/png;base64,…`，可以直接塞给 <img src>，也可以存进 localStorage。 */
  dataUrl: string;
  /** 一倍像素下的尺寸，用来给 <img> 定宽高比。 */
  width: number;
  height: number;
  /** 每一拍的区间（图片像素，含这一行谱的纵向范围），播放时画高亮条用。 */
  beats?: { x: number; w: number; y: number; h: number }[];
}

const cache = new Map<string, Promise<ScoreImage>>();

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("谱面转图片失败（SVG 没能解码）"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

interface Ink {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 扫描透明通道，找出真正画了东西的范围（裁掉四周空白）。 */
function inkBounds(data: Uint8ClampedArray, width: number, height: number): Ink | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] <= ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

async function rasterize(tex: string): Promise<ScoreImage> {
  const composed = await renderTexToSvg(tex);
  const image = await loadSvg(composed.svg);
  const width = Math.max(1, Math.round(image.naturalWidth || image.width));
  const height = Math.max(1, Math.round(image.naturalHeight || image.height));

  const source = document.createElement("canvas");
  source.width = width * PIXEL_RATIO;
  source.height = height * PIXEL_RATIO;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("这个浏览器画不了图（没有 canvas）");
  sourceContext.drawImage(image, 0, 0, source.width, source.height);

  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const ink = inkBounds(pixels, source.width, source.height);
  if (!ink) throw new Error("谱面是空白的");

  const padX = PADDING * PIXEL_RATIO;
  const padTop = PADDING * PIXEL_RATIO;
  const padBottom = PADDING_BOTTOM * PIXEL_RATIO;
  const outputWidth = Math.max(ink.w + padX * 2, MIN_WIDTH * PIXEL_RATIO + padX * 2);
  const outputHeight = ink.h + padTop + padBottom;
  const offsetX = Math.round((outputWidth - ink.w) / 2);

  const output = document.createElement("canvas");
  output.width = outputWidth;
  output.height = outputHeight;
  const context = output.getContext("2d");
  if (!context) throw new Error("这个浏览器画不了图（没有 canvas）");
  context.drawImage(
    source,
    ink.x,
    ink.y,
    ink.w,
    ink.h,
    offsetX,
    padTop,
    ink.w,
    ink.h,
  );

  // 拍位：SVG 用户单位 → 图片「一倍像素」坐标（和 width/height 同一套单位）。
  // 图是先乘 2 倍再裁边、加留白的，所以横向要减掉 (ink.x - 居中偏移)、纵向减掉 (ink.y - 上留白)，再除回 2。
  const shiftX = (ink.x - offsetX) / PIXEL_RATIO;
  const shiftY = (ink.y - padTop) / PIXEL_RATIO;
  const beats = composed.beats.map((beat) => {
    // 夹在图片范围内：谱线从 ink 的边上开始，四舍五入后可能差 1px。
    const x = Math.max(0, Math.min(Math.round(beat.x - shiftX), Math.round(outputWidth / PIXEL_RATIO) - 1));
    const w = Math.max(1, Math.min(Math.round(beat.w), Math.round(outputWidth / PIXEL_RATIO) - x));
    const y = Math.max(0, Math.min(Math.round(beat.y - shiftY), Math.round(outputHeight / PIXEL_RATIO) - 1));
    const h = Math.max(1, Math.min(Math.round(beat.h), Math.round(outputHeight / PIXEL_RATIO) - y));
    return { x, w, y, h };
  });

  return {
    dataUrl: output.toDataURL("image/png"),
    width: Math.round(outputWidth / PIXEL_RATIO),
    height: Math.round(outputHeight / PIXEL_RATIO),
    beats,
  };
}

/** 一份 alphaTex → 一张 PNG（同一份 tex 只画一次，失败不缓存）。 */
export function renderScoreImage(tex: string): Promise<ScoreImage> {
  const hit = cache.get(tex);
  if (hit) return hit;
  const run = rasterize(tex).catch((error: unknown) => {
    cache.delete(tex);
    throw error;
  });
  cache.set(tex, run);
  return run;
}
