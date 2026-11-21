/**
 * 弹给节拍器听：从录音里找「起音」，再对齐到拍子上，算出稳不稳。
 *
 * 分两步：
 * 1. `detectOnsets()` —— 只看音量的**上升**（能量差分），过一道自适应阈值，取局部峰。
 *    不用 `detectPitch()`：那是找音高的，扫弦时一堆音混在一起，音高没有意义。
 * 2. `analyzeTiming()` —— 拿第一个起音当原点，把每个起音换算成「第几拍」，
 *    算出每拍偏差的中位数 / 标准差 / 漂移。偏快是负数、偏慢是正数。
 */

export interface OnsetOptions {
  /** 每帧多长（毫秒），越小越准、越吃 CPU。默认 6 */
  frameMs?: number;
  /** 两个起音至少隔多久（毫秒），防止一个音被切成好几个。默认 110 */
  minGapMs?: number;
  /** 峰值要超过「全网最大差分」的这个比例。默认 0.12 */
  threshold?: number;
}

/**
 * 找出每一「下」开始的时间（秒）。
 *
 * 无头浏览器里 rAF 只有 ~15fps，但这里处理的是**已解码的音频**，不受帧率影响，
 * 所以可以把帧切得比实时检测更细。
 */
export function detectOnsets(
  samples: Float32Array,
  sampleRate: number,
  options: OnsetOptions = {},
): number[] {
  const { frameMs = 6, minGapMs = 110, threshold = 0.12 } = options;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];

  const hop = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const frames = Math.floor(samples.length / hop);
  if (frames < 4) return [];

  // 每帧的能量（RMS 的平方，省一次开方）
  const energy = new Float64Array(frames);
  for (let index = 0; index < frames; index += 1) {
    let sum = 0;
    const start = index * hop;
    for (let offset = 0; offset < hop; offset += 1) {
      const value = samples[start + offset] ?? 0;
      sum += value * value;
    }
    energy[index] = sum / hop;
  }

  // 上升沿：只留「比前两帧更响」的部分
  const rise = new Float64Array(frames);
  let peak = 0;
  for (let index = 2; index < frames; index += 1) {
    const value = energy[index] - energy[index - 2];
    if (value > 0) {
      rise[index] = value;
      if (value > peak) peak = value;
    }
  }
  if (peak <= 0) return [];

  // 自适应阈值：全局的 threshold，再叠一道局部均值（安静的段不硬报）
  const localWindow = Math.max(4, Math.round(500 / frameMs));
  const minGapFrames = Math.max(1, Math.round(minGapMs / frameMs));
  const globalBar = peak * threshold;

  const onsets: number[] = [];
  let lastFrame = -minGapFrames;
  for (let index = 2; index < frames; index += 1) {
    const value = rise[index];
    if (value < globalBar) continue;

    let sum = 0;
    let count = 0;
    for (let cursor = Math.max(0, index - localWindow); cursor < index; cursor += 1) {
      sum += rise[cursor];
      count += 1;
    }
    const localBar = count > 0 ? (sum / count) * 1.8 : 0;
    if (value < localBar) continue;

    // 要去掉这一小段里最高的那一帧，而不是「先碰到谁算谁」
    let best = index;
    const until = Math.min(frames - 1, index + minGapFrames);
    for (let cursor = index + 1; cursor <= until; cursor += 1) {
      if (rise[cursor] > rise[best]) best = cursor;
    }
    if (best !== index) continue;

    if (index - lastFrame < minGapFrames) continue;
    lastFrame = index;
    onsets.push((index * hop) / sampleRate);
  }

  return onsets;
}

export interface TimingOptions {
  /** 每小节几拍，默认 4 */
  beatsPerBar?: number;
  /** 前面留几拍空（预备拍），这些拍不进统计。默认 0 */
  countInBeats?: number;
  /** 偏差超过「一拍的这个比例」就不算这一拍（多半是弹错了 / 多弹了一下）。默认 0.42 */
  tolerance?: number;
  /**
   * 第 1 拍在录音里的时间（秒）。开着节拍器录的时候，用「第一下点击的时间」当原点，
   * 这样偏差是**相对节拍器**的，能看出整体抢了还是拖了。
   * 不传就拿第一个起音当原点——那是「跟着自己弹」的模式，中位数只会在 0 附近，
   * 有意义的只有标准差和漂移。
   */
  origin?: number;
}

export interface TimingHit {
  /** 第几个起音（0 起） */
  index: number;
  /** 这一下在第几拍（从 1 开始，含预备拍） */
  beat: number;
  /** 第几小节（从 1 开始） */
  bar: number;
  /** 拍内第几拍（0 起） */
  beatInBar: number;
  /** 偏差（毫秒）：负数 = 抢了，正数 = 拖了 */
  offset: number;
}

export interface TimingReport {
  bpm: number;
  intervalMs: number;
  hits: TimingHit[];
  /** 丢掉了几下（偏差太大，或者挤在一起） */
  dropped: number;
  /** 每一拍的偏差（毫秒），去掉预备拍 */
  offsets: number[];
  /** 中位数偏差：负数整体偏快、正数整体偏慢 */
  medianOffsetMs: number;
  /** 平均绝对偏差 */
  meanAbsMs: number;
  /** 标准差：越小越稳 */
  stdevMs: number;
  /** 每拍漂移（毫秒 / 拍）：负数 = 越弹越快 */
  driftMsPerBeat: number;
  /** 一共跨了几拍 */
  spanBeats: number;
  /** 稳不稳（中位数、标准差、漂移都在容忍范围内） */
  steady: boolean;
  /** 一句话结论 */
  verdict: string;
  /** 下一步该练什么 */
  suggestion: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * 把起音对齐到拍子上。
 *
 * 原点取**第一个起音**：谁也不会刚好在节拍器响的同一毫秒下拨，用第一下当基准，
 * 用户自己就是「第 1 拍」。
 */
export function analyzeTiming(
  onsets: number[],
  bpm: number,
  options: TimingOptions = {},
): TimingReport | null {
  const { beatsPerBar = 4, countInBeats = 0, tolerance = 0.42, origin: anchor } = options;
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const times = [...onsets].filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (times.length < 4) return null;

  const intervalMs = 60000 / bpm;
  const origin = Number.isFinite(anchor) ? (anchor as number) * 1000 : times[0] * 1000;
  const barBeats = Math.max(1, Math.round(beatsPerBar));
  const skip = Math.max(0, Math.round(countInBeats));

  const hits: TimingHit[] = [];
  const offsets: number[] = [];
  let dropped = 0;

  for (let index = 0; index < times.length; index += 1) {
    const delta = times[index] * 1000 - origin;
    const exact = delta / intervalMs;
    const step = Math.round(exact);
    const offset = delta - step * intervalMs;
    if (Math.abs(offset) > intervalMs * tolerance) {
      dropped += 1;
      continue;
    }
    const beat = step + 1;
    // 比第 1 拍还早的算「预备」，不进统计
    if (beat < 1) continue;
    hits.push({
      index,
      beat,
      bar: Math.floor((beat - 1) / barBeats) + 1,
      beatInBar: (beat - 1) % barBeats,
      offset,
    });
    if (beat > skip) offsets.push(offset);
  }

  if (hits.length < 4 || offsets.length < 3) return null;

  const n = offsets.length;
  const medianOffsetMs = median(offsets);
  const mean = offsets.reduce((sum, value) => sum + value, 0) / n;
  const meanAbsMs = offsets.reduce((sum, value) => sum + Math.abs(value), 0) / n;
  const variance = offsets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const stdevMs = Math.sqrt(variance);

  // 最小二乘斜率：拍序号 → 偏差
  const xs = offsets.map((_, index) => index + 1);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (xs[index] - meanX) * (offsets[index] - mean);
    denominator += (xs[index] - meanX) ** 2;
  }
  const driftMsPerBeat = denominator === 0 ? 0 : numerator / denominator;

  const steady = Math.abs(medianOffsetMs) <= 8 && stdevMs <= 28 && Math.abs(driftMsPerBeat) <= 2.5;

  return {
    bpm,
    intervalMs,
    hits,
    dropped,
    offsets,
    medianOffsetMs,
    meanAbsMs,
    stdevMs,
    driftMsPerBeat,
    spanBeats: hits[hits.length - 1].beat - hits[0].beat + 1,
    steady,
    verdict: verdictOf({ medianOffsetMs, stdevMs, driftMsPerBeat, steady }),
    suggestion: suggestionOf({ medianOffsetMs, stdevMs, driftMsPerBeat, steady }),
  };
}

interface Summary {
  medianOffsetMs: number;
  stdevMs: number;
  driftMsPerBeat: number;
  steady: boolean;
}

function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function verdictOf(summary: Summary): string {
  const { medianOffsetMs, stdevMs, driftMsPerBeat, steady } = summary;
  if (steady) return "挺稳的，每拍都踩在附近。";
  // 抖得比「整体偏移」还厉害时，先说抖：这时候告诉用户「你拖了」是误导
  if (stdevMs > 28 && stdevMs >= Math.abs(medianOffsetMs)) {
    return "每一下忽早忽晚，问题不在快慢而在稳。";
  }
  if (Math.abs(driftMsPerBeat) > 2.5) {
    return driftMsPerBeat < 0 ? "越弹越快。" : "越弹越慢。";
  }
  if (Math.abs(medianOffsetMs) > 8) {
    return medianOffsetMs < 0 ? "整体抢在节拍器前面。" : "整体拖在节拍器后面。";
  }
  return `每拍偏差中位数 ${signed(medianOffsetMs)} 毫秒。`;
}

function suggestionOf(summary: Summary): string {
  const { medianOffsetMs, stdevMs, driftMsPerBeat, steady } = summary;
  if (steady) return "把速度往上提 5 BPM 再听一次，稳到同样的标准差就算过。";
  if (stdevMs > 28 && stdevMs >= Math.abs(medianOffsetMs)) {
    return "慢一点练：把节拍器降到能弹匀的速度，先求每一下都不抢不拖，再逐步加回去。";
  }
  if (Math.abs(driftMsPerBeat) > 2.5) {
    return driftMsPerBeat < 0
      ? "前半段比后半段准，试着从一开始就慢一点，别越弹越急。"
      : "试着盯着节拍器把后半段顶住；也可以把速度降 10 BPM 再录一遍。";
  }
  if (Math.abs(medianOffsetMs) > 8) {
    return medianOffsetMs < 0
      ? "等一下再下拨：心里把「哒」数成「哒—弹」，让声音落在节拍器之后一点。"
      : "提前一点：听到节拍器就下拨，别等它响完。";
  }
  return "稳住单一速度练：把节拍器调慢 10 BPM，只求每一下都不抢不拖，再逐步加回去。";
}
