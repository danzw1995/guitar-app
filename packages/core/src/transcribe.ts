import { STANDARD_TUNING } from "./theory.ts";
import { n, tabOf, type Tab, type TabNote } from "./tab.ts";

/**
 * 扒谱（v0.71.0）：把「一串检测到的频率」变成一张六线谱。
 *
 * 分三步，每步都是纯函数、可单测：
 *
 * 1. `detectNotes()` —— 把帧序列切成音：频率连续、间隔够密的一段算一个音，
 *    取中位数定音高，顺带算出平均偏差（音分）。
 * 2. `quantizeNotes()` —— 把秒换成拍，吸到节拍网格上（第一音落在 0 拍）。
 * 3. `tabFromNotes()` —— 把 MIDI 落到弦和品上，生成 `Tab`。
 *
 * 这里不做音频解码、不碰麦克风——那是页面的事。这样测试只需要造几帧数据，
 * 不用真的录一段声音。
 */

/** 一帧检测结果：`time` 秒时听到 `freq` 赫兹；0 表示这一帧没声音。 */
export interface PitchFrame {
  time: number;
  freq: number;
}

/** 切出来的一个音。 */
export interface DetectedNote {
  /** 起止时间（秒）。 */
  start: number;
  end: number;
  /** 最近的十二平均律音高（MIDI）。 */
  midi: number;
  /** 平均偏差（音分），正数偏高、负数偏低。 */
  cents: number;
  /** 这个音由多少帧拼成（太少的不算，见 `minFrames`）。 */
  frames: number;
}

export interface DetectOptions {
  /** 至少几帧才算一个音（默认 3，约 0.15 秒 @55ms 一帧）。 */
  minFrames?: number;
  /** 同一段里允许的频率漂移（音分，默认 60）。 */
  centsTolerance?: number;
  /** 两帧间隔超过这个秒数就算断开（默认 0.15：页面用 rAF 取帧，帧率抖动不能把音切碎）。 */
  minGap?: number;
  /** 有效音高范围（MIDI，默认 40–88，也就是 E2–E6）。 */
  minMidi?: number;
  maxMidi?: number;
}

const freqToMidi = (freq: number): number => 69 + 12 * Math.log2(freq / 440);
const centsOf = (a: number, b: number): number => 1200 * Math.log2(a / b);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 把帧序列切成一个个音。 */
export function detectNotes(frames: PitchFrame[], options: DetectOptions = {}): DetectedNote[] {
  const minFrames = Math.max(1, Math.round(options.minFrames ?? 3));
  const tolerance = Math.max(5, options.centsTolerance ?? 60);
  const minGap = Math.max(0, options.minGap ?? 0.15);
  const minMidi = options.minMidi ?? 40;
  const maxMidi = options.maxMidi ?? 88;

  const notes: DetectedNote[] = [];
  let run: PitchFrame[] = [];

  const flush = (): void => {
    if (run.length >= minFrames) {
      const freqs = run.map((frame) => frame.freq);
      const freq = median(freqs);
      const midi = freqToMidi(freq);
      const rounded = Math.round(midi);
      if (rounded >= minMidi && rounded <= maxMidi) {
        notes.push({
          start: run[0].time,
          end: run[run.length - 1].time,
          midi: rounded,
          cents: Math.round((midi - rounded) * 1000) / 10,
          frames: run.length,
        });
      }
    }
    run = [];
  };

  for (const frame of frames) {
    if (!(frame.freq > 0)) {
      flush();
      continue;
    }
    const last = run[run.length - 1];
    if (last && (frame.time - last.time > minGap || Math.abs(centsOf(frame.freq, last.freq)) > tolerance)) {
      flush();
    }
    run.push(frame);
  }
  flush();

  return notes;
}

export interface QuantizeOptions {
  /** 每分钟多少拍。 */
  bpm: number;
  /** 网格：1 = 一拍、2 = 八分、4 = 十六分（默认 2）。 */
  subdivision?: 1 | 2 | 4;
}

/** 吸到节拍网格上的音：`startBeat` 从 0 起，`beats` 是时值（拍）。 */
export interface QuantizedNote {
  startBeat: number;
  beats: number;
  midi: number;
  cents: number;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * 秒 → 拍。
 *
 * 第一个音落在 0 拍（用户弹的第一个音就是第 1 拍，不要求他踩着节拍器起手），
 * 后面的音按它到第一个音的间隔算。挤到同一格的音只留第一个。
 */
export function quantizeNotes(notes: DetectedNote[], options: QuantizeOptions): QuantizedNote[] {
  const bpm = Math.max(20, options.bpm);
  const grid = 1 / Math.max(1, options.subdivision ?? 2);
  const secondsPerBeat = 60 / bpm;
  if (notes.length === 0) return [];

  const origin = notes[0].start;
  const out: QuantizedNote[] = [];
  let prevEnd = 0;

  for (const note of notes) {
    const rawStart = (note.start - origin) / secondsPerBeat;
    const snapped = Math.max(0, Math.round(rawStart / grid) * grid);
    const rawLength = Math.max(0, note.end - note.start) / secondsPerBeat;
    const beats = Math.max(grid, Math.round(rawLength / grid) * grid);

    const last = out[out.length - 1];
    if (last && snapped <= last.startBeat + 1e-6) {
      // 同一格已经有一个音了：留长的那个，短的丢掉。
      if (beats > last.beats) {
        last.beats = round3(beats);
        last.midi = note.midi;
        last.cents = note.cents;
      }
      prevEnd = Math.max(prevEnd, last.startBeat + last.beats);
      continue;
    }

    const startBeat = snapped < prevEnd ? prevEnd : snapped;
    out.push({ startBeat: round3(startBeat), beats: round3(beats), midi: note.midi, cents: note.cents });
    prevEnd = startBeat + beats;
  }

  return out;
}

/** 一个 MIDI 音在标准调弦上的所有按法（品域内）。 */
export function positionsFor(midi: number, maxFret = 15): { s: number; f: number }[] {
  const out: { s: number; f: number }[] = [];
  for (let s = 1; s <= 6; s += 1) {
    const f = midi - STANDARD_TUNING.strings[s - 1];
    if (f >= 0 && f <= maxFret) out.push({ s, f });
  }
  return out.sort((a, b) => a.f - b.f || a.s - b.s);
}

/**
 * 挑一个按法：优先空弦、低把位；同样低的品，优先离上一个音近的弦，
 * 免得同一段旋律在 1 弦和 6 弦之间来回跳。
 */
export function pickPosition(
  midi: number,
  previousString = 0,
  maxFret = 15,
): { s: number; f: number } | null {
  const options = positionsFor(midi, maxFret);
  if (options.length === 0) return null;
  const lowest = options[0].f;
  const near = options.filter((option) => option.f === lowest);
  if (previousString > 0) {
    near.sort((a, b) => Math.abs(a.s - previousString) - Math.abs(b.s - previousString) || a.s - b.s);
  }
  return near[0];
}

export interface TranscribeOptions extends QuantizeOptions {
  /** 最高到几品（默认 15）。 */
  maxFret?: number;
  beatsPerBar?: number;
}

export interface TranscribeResult {
  tab: Tab;
  notes: QuantizedNote[];
  /** 太高的音（超出品域）没能落到弦上，被丢掉了。 */
  dropped: number;
  warnings: string[];
}

/** 量化后的音 → 六线谱。 */
export function tabFromNotes(notes: QuantizedNote[], options: TranscribeOptions): TranscribeResult {
  const maxFret = options.maxFret ?? 15;
  const beatsPerBar = options.beatsPerBar ?? 4;
  const tabNotes: TabNote[] = [];
  let dropped = 0;
  let previousString = 0;

  for (const note of notes) {
    const position = pickPosition(note.midi, previousString, maxFret);
    if (!position) {
      dropped += 1;
      continue;
    }
    previousString = position.s;
    tabNotes.push(n(position.s, position.f, note.startBeat, note.beats));
  }

  const tab = tabOf(tabNotes, { bpm: [Math.round(options.bpm * 0.9), Math.round(options.bpm * 1.1)], beatsPerBar });
  return { tab, notes, dropped, warnings: warningsFor(notes, dropped, maxFret) };
}

function warningsFor(notes: QuantizedNote[], dropped: number, maxFret: number): string[] {
  const warnings: string[] = [];
  if (notes.length === 0) {
    warnings.push("没听到清楚的音——一次只弹一个音，拨响一点。");
  }
  const worst = notes.reduce((max, note) => Math.max(max, Math.abs(note.cents)), 0);
  if (worst >= 25) {
    warnings.push(`有几个音不太准（最大偏 ${Math.round(worst)} 音分），照着弹的时候自己校正一下。`);
  }
  if (dropped > 0) {
    warnings.push(`有 ${dropped} 个音超出 ${maxFret} 品，没画到谱上。`);
  }
  return warnings;
}

/** 一条龙：帧 → 音 → 拍 → 谱。 */
export function transcribeFrames(frames: PitchFrame[], options: TranscribeOptions): TranscribeResult {
  const detected = detectNotes(frames);
  const quantized = quantizeNotes(detected, options);
  return tabFromNotes(quantized, options);
}
