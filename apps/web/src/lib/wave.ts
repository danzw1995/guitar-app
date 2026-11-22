/**
 * 录音波形（v0.152.0）：把 data URL 的录音解码成「每列峰值」，给三处共用——
 * 波形组件、并排/叠着对比、以及「存成说明」里内嵌的缩略图。
 *
 * 解码一次就缓存（只留峰值，不留原始采样）：一条 10 秒的 opus 录音解出来是几十万个浮点数，
 * 留 110 列够画了。
 */

export interface WavePeaks {
  peaks: number[];
  seconds: number;
}

export const WAVE_COLUMNS = 110;
export const WAVE_WIDTH = 220;
export const WAVE_HEIGHT = 34;
export const WAVE_CENTER = 17;
export const WAVE_AMP = 13;

const cache = new Map<string, WavePeaks>();

/** data URL 前缀都在 `data:audio/webm;base64,` 这一段上一样，得靠长度 + 尾巴区分 */
export function waveCacheKey(audio: string): string {
  return `${audio.length}:${audio.slice(-32)}`;
}

export function bytesOfDataUrl(dataUrl: string): ArrayBuffer | null {
  const body = dataUrl.split(",")[1];
  if (!body) return null;
  try {
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  }
}

function peaksOf(samples: Float32Array, columns: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / columns));
  const peaks: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    let peak = 0;
    const from = column * size;
    const to = Math.min(samples.length, from + size);
    for (let index = from; index < to; index += 1) {
      const value = Math.abs(samples[index]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }
  const max = peaks.reduce((best, peak) => Math.max(best, peak), 0.0001);
  return peaks.map((peak) => peak / max);
}

export function waveCached(audio: string): WavePeaks | null {
  return cache.get(waveCacheKey(audio)) ?? null;
}

/** 解码成峰值；浏览器不认这个格式（或录音坏了）时给 null，调用方自己决定退回什么 */
export async function decodeWave(audio: string): Promise<WavePeaks | null> {
  const key = waveCacheKey(audio);
  const cached = cache.get(key);
  if (cached) return cached;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const buffer = bytesOfDataUrl(audio);
  if (!Ctor || !buffer) return null;
  const context = new Ctor();
  try {
    const decoded = await context.decodeAudioData(buffer);
    const next = {
      peaks: peaksOf(decoded.getChannelData(0), WAVE_COLUMNS),
      seconds: decoded.duration,
    };
    cache.set(key, next);
    return next;
  } catch {
    return null;
  } finally {
    void context.close();
  }
}

/** 波形轮廓：上沿一遍、再下沿倒着回来，围成一块能填充的形状 */
export function waveShapePath(
  peaks: number[],
  width = WAVE_WIDTH,
  center = WAVE_CENTER,
  amp = WAVE_AMP,
): string {
  const columns = Math.max(1, peaks.length);
  const top = peaks.map((peak, index) => {
    const x = (index / (columns - 1)) * width;
    const y = center - Math.max(0.04, peak) * amp;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const bottom = [...peaks].reverse().map((peak, index) => {
    const column = columns - 1 - index;
    const x = (column / (columns - 1)) * width;
    const y = center + Math.max(0.04, peak) * amp;
    return `L${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `${[...top, ...bottom].join(" ")} Z`;
}

/**
 * 缩略波形图（PNG data URL）：给「存成说明」的 Markdown 用。
 * 不引第三方库，直接画到 canvas 上再 toDataURL——Markdown 里 `![](data:...)` 各家都能读。
 */
export async function wavePngDataUrl(audio: string, width = 240, height = 48): Promise<string | null> {
  const wave = await decodeWave(audio);
  if (!wave || wave.peaks.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const center = height / 2;
  const amp = height / 2 - 2;
  const columns = wave.peaks.length;
  const step = width / columns;
  context.fillStyle = "rgba(139,148,158,0.35)";
  for (let column = 0; column < columns; column += 1) {
    const half = Math.max(0.5, wave.peaks[column] * amp);
    context.fillRect(column * step, center - half, Math.max(1, step * 0.8), half * 2);
  }
  context.strokeStyle = "rgba(139,148,158,0.55)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, center);
  context.lineTo(width, center);
  context.stroke();
  return canvas.toDataURL("image/png");
}
