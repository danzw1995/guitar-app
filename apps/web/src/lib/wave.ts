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
 * 从录音里裁一小段，转成 16 位单声道 WAV（v0.159.0）。
 * 「存成说明」时把偏得最多的那三拍裁出来，和 Markdown 放一个文件夹里对着听——
 * 整段录音可能有十几秒，光听整段不容易一次听出那三拍。
 */
export async function waveClipWavDataUrl(
  audio: string,
  options: { from: number; to: number },
): Promise<string | null> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const buffer = bytesOfDataUrl(audio);
  if (!Ctor || !buffer) return null;
  const context = new Ctor();
  try {
    const decoded = await context.decodeAudioData(buffer);
    const rate = decoded.sampleRate;
    const total = decoded.duration;
    const from = Math.max(0, Math.min(options.from, total - 0.05));
    const to = Math.max(from + 0.05, Math.min(options.to, total));
    const start = Math.max(0, Math.floor(from * rate));
    const end = Math.min(decoded.length, Math.ceil(to * rate));
    if (end <= start) return null;
    return wavDataUrl(decoded.getChannelData(0).subarray(start, end), rate);
  } catch {
    return null;
  } finally {
    void context.close();
  }
}

/** 16 位单声道 WAV 的 data URL：浏览器里想给一段采样一个「能下载的文件」就这么办 */
function wavDataUrl(samples: Float32Array, sampleRate: number): string {
  const frames = samples.length;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let index = 0; index < frames; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, Math.round(value * 32767), true);
  }
  // btoa 一次吞几 MB 会爆栈，分块拼
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

/**
 * 缩略波形图（PNG data URL）：给「存成说明」的 Markdown 用。
 * 不引第三方库，直接画到 canvas 上再 toDataURL——Markdown 里 `![](data:...)` 各家都能读。
 * 给了 offsets / bpm / originMs 就把节拍线和每一拍的落点也标上去（v0.153.0），
 * 不然一张只有波形的图看不出「稳不稳」。
 */
export async function wavePngDataUrl(
  audio: string,
  options: {
    width?: number;
    height?: number;
    offsets?: number[];
    bpm?: number;
    originMs?: number;
    /** 只画这一段（秒，v0.158.0）：说明文件里给「最偏的三拍」单独裁一小条 */
    trim?: { from: number; to: number };
  } = {},
): Promise<string | null> {
  const { width = 240, height = 48, offsets = [], bpm = 0, originMs = 0, trim } = options;
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
  const total = Math.max(0.001, wave.seconds);
  // 裁一段时：只取那一段对应的列，横轴换成「这一段里的相对位置」
  const fromSec = trim ? Math.max(0, Math.min(trim.from, total - 0.05)) : 0;
  const toSec = trim ? Math.max(fromSec + 0.05, Math.min(trim.to, total)) : total;
  const startCol = trim ? Math.floor((fromSec / total) * columns) : 0;
  const endCol = trim ? Math.max(startCol + 1, Math.ceil((toSec / total) * columns)) : columns;
  const visible = wave.peaks.slice(startCol, endCol);
  const step = width / Math.max(1, visible.length);
  context.fillStyle = "rgba(139,148,158,0.35)";
  for (let column = 0; column < visible.length; column += 1) {
    const half = Math.max(0.5, visible[column] * amp);
    context.fillRect(column * step, center - half, Math.max(1, step * 0.8), half * 2);
  }
  context.strokeStyle = "rgba(139,148,158,0.55)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, center);
  context.lineTo(width, center);
  context.stroke();

  // 节拍器位置 + 每一拍的落点（v0.153.0）
  if (bpm > 0 && offsets.length > 0) {
    const beatMs = 60000 / Math.max(1, bpm);
    const xOf = (time: number) =>
      Math.max(0, Math.min(width, ((time - fromSec) / Math.max(0.05, toSec - fromSec)) * width));
    const inRange = (time: number) => time >= fromSec - 0.02 && time <= toSec + 0.02;
    context.strokeStyle = "rgba(200,205,210,0.45)";
    for (let index = 0; index < offsets.length; index += 1) {
      const clock = (originMs + index * beatMs) / 1000;
      if (!inRange(clock)) continue;
      context.beginPath();
      context.moveTo(xOf(clock), 2);
      context.lineTo(xOf(clock), height - 2);
      context.stroke();
    }
    for (let index = 0; index < offsets.length; index += 1) {
      const hit = (originMs + index * beatMs + offsets[index]) / 1000;
      if (!inRange(hit)) continue;
      const offset = offsets[index];
      context.fillStyle = Math.abs(offset) <= 8 ? "#3fb950" : offset < 0 ? "#58a6ff" : "#e8b04b";
      context.beginPath();
      context.arc(xOf(hit), center, 2, 0, Math.PI * 2);
      context.fill();
    }
  }
  return canvas.toDataURL("image/png");
}
