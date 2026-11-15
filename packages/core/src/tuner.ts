/**
 * 调音器：两件事——「这一段声音的基频是多少」和「离哪根弦差多少音分」。
 *
 * 都是纯函数，没有 DOM、没有麦克风：页面那边只负责拿采样、喂进来、把结果画出来。
 * 这样「音高检测准不准」可以用合成正弦波直接单测，不用真的弹一下。
 */

import { SHARP_NAMES, STANDARD_TUNING } from "./theory.ts";

/** 标准调弦的一根弦：`string` 是弦号（1 最细），`midi` 是十二平均律的编号 */
export interface TuningString {
  string: number;
  name: string;
  octave: number;
  midi: number;
}

/**
 * 标准调弦 EADGBE，从低到高排（6 弦 E2 … 1 弦 E4）。
 *
 * 弦号沿用谱面上的写法（1 最细），数据从 `theory.ts` 的 `STANDARD_TUNING.strings`
 * 推出来——那边是 index 0 = 1 弦，这里翻成弦号，免得两处各写一份。
 */
export const TUNER_STRINGS: TuningString[] = STANDARD_TUNING.strings
  .map((midi, index) => ({
    string: index + 1,
    name: SHARP_NAMES[midi % 12],
    octave: Math.floor(midi / 12) - 1,
    midi,
  }))
  .sort((a, b) => b.string - a.string);

/** MIDI 编号 → 频率（A4 = 69 = 440Hz） */
export function frequencyOfMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 频率 → 带小数的 MIDI 编号（没做四舍五入，cents 要从这里算） */
export function midiOfFrequency(freq: number): number {
  if (!(freq > 0)) return Number.NaN;
  return 69 + 12 * Math.log2(freq / 440);
}

/** 两个频率差多少音分：`freq` 比 `target` 高就是正数 */
export function centsOff(freq: number, target: number): number {
  if (!(freq > 0) || !(target > 0)) return Number.NaN;
  return 1200 * Math.log2(freq / target);
}

/** 四舍五入到整数音分（显示用，±0.4 以内都是 0） */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export interface StringReading {
  string: number;
  name: string;
  octave: number;
  /** 这根弦的目标频率 */
  target: number;
  /** 高了几个音分（负数 = 偏低） */
  cents: number;
}

/** 离这个频率最近的那根空弦（只看音分距离，跨八度也算） */
export function nearestString(freq: number): StringReading | null {
  if (!(freq > 0)) return null;
  let best: StringReading | null = null;
  for (const item of TUNER_STRINGS) {
    const target = frequencyOfMidi(item.midi);
    const cents = centsOff(freq, target);
    if (!best || Math.abs(cents) < Math.abs(best.cents)) {
      best = { string: item.string, name: item.name, octave: item.octave, target, cents: roundCents(cents) };
    }
  }
  return best;
}

export interface TunerReading {
  /** 检测到的频率 */
  freq: number;
  /** 最近的音名（不带弦号：可能正好在两根弦中间） */
  note: string;
  octave: number;
  /** 相对最近那根空弦的音分差；离所有空弦都太远时是 null */
  string: StringReading | null;
  /** ±5 音分以内算准了 */
  inTune: boolean;
  /** 给界面用的一句话 */
  hint: string;
}

/** 离最近的空弦超过这个音分距离，就不按「调这根弦」来提示（说明弹的不是空弦音） */
export const STRING_RANGE_CENTS = 250;

/**
 * 把频率翻成调音器读数。
 *
 * 注意「最近的音名」和「最近的空弦」不是一回事：E2 高了 60 音分，最近的音名已经是 F2，
 * 但你要调的仍然是 6 弦（偏低 60 音分）。所以提示以**弦**为准，音名只用来兜底。
 */
export function tunerReading(freq: number, toleranceCents = 5): TunerReading | null {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;

  const midi = midiOfFrequency(freq);
  const nearestMidi = Math.round(midi);
  const note = SHARP_NAMES[((nearestMidi % 12) + 12) % 12];
  const octave = Math.floor(nearestMidi / 12) - 1;

  const string = nearestString(freq);
  const usable = string && Math.abs(string.cents) <= STRING_RANGE_CENTS ? string : null;

  if (!usable) {
    return {
      freq,
      note,
      octave,
      string: null,
      inTune: false,
      hint: "离标准调弦的六根空弦都有点远——弹单根空弦试试",
    };
  }

  const cents = usable.cents;
  const inTune = Math.abs(cents) <= toleranceCents;
  const label = `${usable.string} 弦 ${usable.name}${usable.octave}`;
  let hint: string;
  if (inTune) {
    hint = `${label} 准了`;
  } else if (cents < 0) {
    hint = `${label} 偏低 ${Math.abs(cents)} 音分，拧紧一点`;
  } else {
    hint = `${label} 偏高 ${cents} 音分，松一点`;
  }

  return { freq, note, octave, string: usable, inTune, hint };
}

export interface PitchOptions {
  /** 低于这个频率当噪声（吉他最低是 E2 ≈ 82Hz，留点余量） */
  minFreq?: number;
  /** 高于这个频率当噪声（1 弦 E4 ≈ 330Hz，泛音到 2kHz 也够） */
  maxFreq?: number;
  /** NSDF 峰值阈值，越大越挑；0.5 在真实吉他上够用 */
  threshold?: number;
}

/**
 * 从时域采样里找基频（McLeod NSDF，比裸自相关抗倍频/半频）。
 *
 * 返回 0 表示「这一段没有明确的音高」——静音、噪声、拨片刮弦都会走到这里。
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): number {
  const { minFreq = 70, maxFreq = 1400, threshold = 0.5 } = options;
  if (!(sampleRate > 0) || samples.length < 64) return 0;

  // 去直流：麦克风常带一点偏置，不去掉会让自相关整体抬高
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i];
  mean /= samples.length;

  const size = samples.length;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / minFreq));
  if (maxLag <= minLag) return 0;

  // 峰值太小的段落直接当静音（不然噪声也会给出一个「音高」）
  let energy = 0;
  for (let i = 0; i < size; i++) {
    const value = samples[i] - mean;
    energy += value * value;
  }
  if (Math.sqrt(energy / size) < 0.005) return 0;

  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0;
    let norm = 0;
    const limit = size - lag;
    for (let i = 0; i < limit; i++) {
      const a = samples[i] - mean;
      const b = samples[i + lag] - mean;
      acf += a * b;
      norm += a * a + b * b;
    }
    nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
  }

  // 跳过开头那段（lag 太小，全是 1 附近的高值），找第一个过阈值的局部峰
  let start = minLag;
  while (start <= maxLag && nsdf[start] > 0) start++;

  let globalMax = 0;
  for (let lag = start; lag <= maxLag; lag++) {
    if (nsdf[lag] > globalMax) globalMax = nsdf[lag];
  }
  if (globalMax < threshold) return 0;

  // 取**第一个**够高的峰，不是最高的峰：纯音在周期的整数倍上峰值几乎一样高，
  // 挑最高那个会挑到 2 倍、4 倍周期（听起来低八度、低两个八度）。
  const need = Math.max(threshold, globalMax * 0.9);
  let bestLag = -1;
  for (let lag = start; lag <= maxLag; lag++) {
    const value = nsdf[lag];
    if (value >= need && value >= (nsdf[lag - 1] ?? 0) && value >= (nsdf[lag + 1] ?? 0)) {
      bestLag = lag;
      break;
    }
  }
  if (bestLag < 0) return 0;

  // 抛物线插值：峰值两边各取一点，把 lag 从整数细化到小数（否则高音区音分会跳）
  const left = nsdf[bestLag - 1] ?? 0;
  const center = nsdf[bestLag];
  const right = nsdf[bestLag + 1] ?? 0;
  const denom = left - 2 * center + right;
  const shift = denom === 0 ? 0 : (0.5 * (left - right)) / denom;
  const refined = bestLag + Math.max(-0.5, Math.min(0.5, shift));

  const freq = sampleRate / refined;
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) return 0;
  return Math.round(freq * 10) / 10;
}

/** 把最近几次读数取中位数，去掉拨弦瞬间那几个跳变 */
export function smoothFreqs(values: number[], keep = 5): number {
  const usable = values.filter((value) => value > 0).slice(-keep);
  if (usable.length === 0) return 0;
  const sorted = [...usable].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}
