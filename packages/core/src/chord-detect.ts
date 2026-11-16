import { SHARP_NAMES } from "./theory.ts";
import { n, tabOf, type Tab, type TabNote } from "./tab.ts";
import { positionsFor } from "./transcribe.ts";

/**
 * 听和弦（v0.76.0）：把「一堆音」认成「一个和弦」。
 *
 * 扒谱时最难的不是听单音，是听**同时响的几个音**：麦克风拿到的是一段频谱，
 * 要先折成 12 个音级（chroma），再和和弦模板比。这里把这两步都写成纯函数：
 * `chromaOfSpectrum()` 负责「频谱 → 12 个音级」，`detectChord()` / `detectChordFromChroma()`
 * 负责「音级 → 和弦名」。页面只负责把麦克风的频谱递进来。
 */

export type DetectQuality =
  | "major"
  | "minor"
  | "dominant7"
  | "major7"
  | "minor7"
  | "sus4"
  | "dim"
  | "aug"
  | "m7b5"
  | "power";

interface ChordTemplate {
  quality: DetectQuality;
  /** 相对根音的半音数。 */
  intervals: number[];
  /** 中文名。 */
  name: string;
  /** 写和弦名时的后缀（大三和弦是空的）。 */
  suffix: string;
}

/**
 * 认得出的和弦形状。顺序就是「同样匹配时先信谁」的顺序：
 * 七和弦排在三和弦前面（四个音都在时别只报三和弦），挂四排在大小三前面
 * （有 5 没有 3 时只能是 sus4）。
 */
const TEMPLATES: ChordTemplate[] = [
  { quality: "major7", intervals: [0, 4, 7, 11], name: "大七和弦", suffix: "maj7" },
  { quality: "minor7", intervals: [0, 3, 7, 10], name: "小七和弦", suffix: "m7" },
  { quality: "dominant7", intervals: [0, 4, 7, 10], name: "属七和弦", suffix: "7" },
  { quality: "m7b5", intervals: [0, 3, 6, 10], name: "半减七和弦", suffix: "m7b5" },
  { quality: "sus4", intervals: [0, 5, 7], name: "挂四和弦", suffix: "sus4" },
  { quality: "dim", intervals: [0, 3, 6], name: "减三和弦", suffix: "dim" },
  { quality: "aug", intervals: [0, 4, 8], name: "增三和弦", suffix: "aug" },
  { quality: "major", intervals: [0, 4, 7], name: "大三和弦", suffix: "" },
  { quality: "minor", intervals: [0, 3, 7], name: "小三和弦", suffix: "m" },
  { quality: "power", intervals: [0, 7], name: "强力和弦", suffix: "5" },
];

export interface DetectedChord {
  /** 根音的音级 0–11（C = 0）。 */
  root: number;
  rootName: string;
  quality: DetectQuality;
  /** 和弦名：`C` / `Am` / `G7` / `F#m7b5`。 */
  label: string;
  /** 中文名，如「小三和弦」。 */
  name: string;
  /** 最低那个音的音级与名字。 */
  bass: number;
  bassName: string;
  /** 0 = 原位，1 = 第一转位……-1 = 最低音不在这个和弦里（大概是弹错了）。 */
  inversion: number;
  /** 匹配得分（0–1 左右，越高越像）。 */
  score: number;
  /** 这个和弦里没听到的音（半音数，相对根音）。 */
  missing: number[];
  /** 听到了但不属于这个和弦的音级。 */
  extra: number[];
}

/** 一个音级算「听到了」的门槛：chroma 已经归一化到最大 1。 */
const PRESENT = 0.3;
/** 不属于和弦的音级超过这个权重就要扣分。 */
const EXTRA = 0.5;
/** 得分低于这个数就当没认出来。 */
const MIN_SCORE = 0.32;

export function noteNameOf(pc: number): string {
  return SHARP_NAMES[((pc % 12) + 12) % 12];
}

/** 12 个音级，每个 0–1。 */
export function chromaOf(midis: number[]): number[] {
  const chroma = new Array<number>(12).fill(0);
  for (const midi of midis) {
    if (!Number.isFinite(midi)) continue;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += 1;
  }
  const max = Math.max(...chroma);
  return max > 0 ? chroma.map((value) => value / max) : chroma;
}

/**
 * 频谱 → 12 个音级。
 *
 * 只看 65–1600 Hz（低于 65 是噪音和箱体共振，高于 1600 泛音太密、折成音级只会更糊）；
 * 每个频点按 `mag²` 加权（能量而不是振幅，泛音才不会抢戏），折到最近的半音。
 */
export function chromaOfSpectrum(
  magnitudes: Float32Array | number[],
  sampleRate: number,
  fftSize = 4096,
  options: { minFreq?: number; maxFreq?: number } = {},
): number[] {
  const minFreq = options.minFreq ?? 65;
  const maxFreq = options.maxFreq ?? 1600;
  const chroma = new Array<number>(12).fill(0);
  const bins = Math.min(magnitudes.length, Math.floor(fftSize / 2));
  const binHz = sampleRate / fftSize;
  for (let i = 1; i < bins; i += 1) {
    const freq = i * binHz;
    if (freq < minFreq || freq > maxFreq) continue;
    const mag = magnitudes[i];
    if (!Number.isFinite(mag) || mag <= 0) continue;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag * mag;
  }
  const max = Math.max(...chroma);
  return max > 0 ? chroma.map((value) => value / max) : chroma;
}

interface Scored {
  template: ChordTemplate;
  root: number;
  score: number;
  missing: number[];
  extra: number[];
}

function scoreOf(chroma: number[], root: number, template: ChordTemplate): Scored {
  const inChord = new Set(template.intervals.map((step) => (root + step) % 12));
  let inside = 0;
  let heard = 0;
  const missing: number[] = [];
  for (const step of template.intervals) {
    const weight = chroma[(root + step) % 12] ?? 0;
    inside += weight;
    if (weight >= PRESENT) heard += 1;
    else missing.push(step);
  }
  let outside = 0;
  const extra: number[] = [];
  for (let pc = 0; pc < 12; pc += 1) {
    if (inChord.has(pc)) continue;
    const weight = chroma[pc] ?? 0;
    if (weight >= EXTRA) {
      outside += weight;
      extra.push(pc);
    }
  }
  // 听清几个音才算数：三音和弦要三个都在，四音和弦至少三个（少一个七音还能认），
  // 两个音的强力和弦两个都要在。只听清两个音就报「C#maj7」是瞎猜。
  const minPresent = Math.min(template.intervals.length, 3);
  if (heard < minPresent) return { template, root, score: -1, missing, extra };
  // 平均覆盖度减去「多余音」的惩罚。
  const coverage = inside / template.intervals.length;
  return { template, root, score: coverage - outside * 0.8, missing, extra };
}

function pickBest(chroma: number[], bassPc: number | null): DetectedChord | null {
  let best: Scored | null = null;
  for (let root = 0; root < 12; root += 1) {
    for (const template of TEMPLATES) {
      const scored = scoreOf(chroma, root, template);
      if (!best || scored.score > best.score + 1e-9) best = scored;
      else if (Math.abs(scored.score - best.score) < 1e-9) {
        // 同分时先信模板表里靠前的那个（七和弦、sus4 排在大小三前面）。
        const earlier = TEMPLATES.indexOf(scored.template) < TEMPLATES.indexOf(best.template);
        if (earlier) best = scored;
      }
    }
  }
  if (!best || best.score < MIN_SCORE) return null;
  const { template, root } = best;
  const rootName = noteNameOf(root);
  const bass = bassPc ?? root;
  const bassOffset = ((bass - root) % 12 + 12) % 12;
  const inversion = template.intervals.indexOf(bassOffset);
  return {
    root,
    rootName,
    quality: template.quality,
    label: `${rootName}${template.suffix}`,
    name: template.name,
    bass,
    bassName: noteNameOf(bass),
    inversion,
    score: Math.round(Math.max(0, Math.min(1, best.score)) * 100) / 100,
    missing: best.missing,
    extra: best.extra,
  };
}

/**
 * 从「同时响的音」认和弦（MIDI 号，可以是乱序、可以带重复八度）。
 * 最低音决定转位；只响一个音时返回 null——那不叫和弦。
 */
export function detectChord(midis: number[]): DetectedChord | null {
  const notes = midis.filter((midi) => Number.isFinite(midi));
  if (notes.length < 2) return null;
  const chroma = chromaOf(notes);
  const bass = Math.min(...notes);
  return pickBest(chroma, ((Math.round(bass) % 12) + 12) % 12);
}

/** 从 12 个音级认和弦（页面把频谱折成 chroma 之后走这里）。 */
export function detectChordFromChroma(chroma: number[], bassPc?: number): DetectedChord | null {
  if (chroma.length !== 12) return null;
  const total = chroma.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0);
  if (total <= 0) return null;
  const present = chroma.filter((value) => value >= PRESENT).length;
  if (present < 2) return null;
  const peak = Math.max(...chroma);
  const normalized = peak > 0 ? chroma.map((value) => Math.max(0, value) / peak) : chroma;
  return pickBest(normalized, typeof bassPc === "number" ? ((bassPc % 12) + 12) % 12 : null);
}

/** 一段录音里的一个和弦：从第几秒到第几秒、认成了什么。 */
export interface ChordSegment {
  start: number;
  end: number;
  chord: DetectedChord | null;
  /** 这个和弦占了几帧（帧率越高越准）。 */
  frames: number;
}

export interface SegmentOptions {
  /** 相邻两帧的相似度低于它就算「换和弦了」（0–1，越大越敏感）。 */
  threshold?: number;
  /** 一个和弦至少撑这么久才算数——换把位时那几帧过渡声音不像任何和弦。 */
  minSeconds?: number;
  /** 连续几帧都判成换才真的切（防抖，单帧噪声不该切）。 */
  holdFrames?: number;
  /**
   * 每一帧的「最低那个音」的音级（`null` = 这一帧没听出低音）。
   *
   * 12 个音级把八度抹掉了，光看音级分不出 `C` 和 `C/E`；把低音带上，
   * 切出来的每一段才能标成第一转位 / 第二转位（v0.90.0）。
   */
  basses?: Array<number | null>;
}

/** 把一帧 chroma 归一成单位向量，之后用点积当余弦相似度。 */
function unit(chroma: number[]): number[] {
  let sum = 0;
  for (const value of chroma) sum += value * value;
  const length = Math.sqrt(sum);
  if (!(length > 0)) return chroma.map(() => 0);
  return chroma.map((value) => value / length);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function meanOf(frames: number[][]): number[] {
  const out = new Array(12).fill(0);
  for (const frame of frames) for (let i = 0; i < 12; i += 1) out[i] += frame[i];
  return out.map((value) => value / Math.max(1, frames.length));
}

/**
 * 把一串按时间排好的 chroma 帧切成「一个和弦一段」。
 *
 * 做法：当前段维护一个平均向量，新帧和它的余弦相似度够高就并进来；连续
 * `holdFrames` 帧都不像了才真的切——扫弦一上一下、拨片换弦都会让单帧失真，
 * 只看一帧会切出满屏碎片。切完再把短于 `minSeconds` 的段丢掉（换把位的过渡），
 * 最后把认成同一个和弦的相邻段合起来。
 *
 * 帧里的全 0（没声音）直接断开：两段扫弦之间的空拍不该被算进任何一个和弦。
 */
export function segmentChords(
  chromas: number[][],
  frameSeconds: number,
  options: SegmentOptions = {},
): ChordSegment[] {
  const threshold = options.threshold ?? 0.86;
  const minSeconds = options.minSeconds ?? 0.35;
  const holdFrames = Math.max(1, Math.round(options.holdFrames ?? 2));
  if (!(frameSeconds > 0) || chromas.length === 0) return [];

  interface Run {
    from: number;
    to: number;
    frames: number[][];
  }
  const runs: Run[] = [];
  let current: Run | null = null;
  /** 已经不像当前段、但还没攒够帧数的那几帧；真切换时它们归到新的一段。 */
  let pending: number[][] = [];
  let divergeFrom = 0;
  /** 当前这一段听到的低音（音级）；低音换了也算换和弦，哪怕音级分布一模一样。 */
  let currentBass: number | null = null;
  const bassOf = (index: number): number | null => {
    const value = options.basses?.[index];
    return typeof value === "number" && value >= 0 ? value : null;
  };

  for (let index = 0; index < chromas.length; index += 1) {
    const frame = chromas[index];
    const loud = frame.length === 12 && frame.some((value) => value > 0);
    if (!loud) {
      if (current) {
        runs.push(current);
        current = null;
      }
      pending = [];
      currentBass = null;
      continue;
    }
    const vector = unit(frame);
    const frameBass = bassOf(index);
    if (!current) {
      current = { from: index, to: index, frames: [vector] };
      pending = [];
      currentBass = frameBass;
      continue;
    }
    const center = unit(meanOf(current.frames));
    // 低音换了（C → C/E）音级分布可能一模一样，得单独算一次「不像」
    const bassChanged = currentBass !== null && frameBass !== null && frameBass !== currentBass;
    if (dot(center, vector) >= threshold && !bassChanged) {
      current.frames.push(vector);
      current.to = index;
      pending = [];
      if (frameBass !== null) currentBass = frameBass;
      continue;
    }
    if (pending.length === 0) divergeFrom = index;
    pending.push(vector);
    if (pending.length < holdFrames) continue;
    // 切换点回到第一帧「不像」的地方：那几帧本来就属于新和弦
    current.to = divergeFrom - 1;
    if (current.to >= current.from) runs.push(current);
    current = { from: divergeFrom, to: index, frames: pending.slice() };
    currentBass = bassOf(divergeFrom);
    pending = [];
  }
  if (current) runs.push(current);

  const segments: ChordSegment[] = [];
  for (const run of runs) {
    const seconds = (run.to - run.from + 1) * frameSeconds;
    if (seconds + 1e-9 < minSeconds) continue;
    // 这一段的低音：取段内出现最多的那个（没听出低音的帧不投票）
    let bass: number | undefined;
    if (options.basses) {
      const counts = new Map<number, number>();
      for (let index = run.from; index <= run.to; index += 1) {
        const value = options.basses[index];
        if (typeof value === "number" && value >= 0) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      let best = 0;
      for (const [pc, count] of counts) {
        if (count > best) {
          best = count;
          bass = pc;
        }
      }
    }
    const chord = detectChordFromChroma(meanOf(run.frames), bass);
    const start = Number((run.from * frameSeconds).toFixed(2));
    const end = Number(((run.to + 1) * frameSeconds).toFixed(2));
    const previous = segments[segments.length - 1];
    // 同名的和弦也要看低音：C 和 C/E 是两段，不能并成一段
    if (previous && previous.chord?.label === chord?.label && previous.chord?.bass === chord?.bass) {
      previous.end = end;
      previous.frames += run.to - run.from + 1;
      continue;
    }
    segments.push({ start, end, chord, frames: run.to - run.from + 1 });
  }
  return segments;
}
﻿
/** 某种和弦性质相对根音的半音数（认和弦用的那套模板）。 */
export function qualityIntervals(quality: DetectQuality): number[] {
  const found = TEMPLATES.find((item) => item.quality === quality);
  return found ? [...found.intervals] : [0, 4, 7];
}

/**
 * 把认出来的和弦还原成一组 MIDI：根音落在 `octave` 这一层。
 *
 * 转位时把最低那个音挪到根音下面——不然 `C/E` 会被还原成原位 C，
 * 听起来就不像你刚才按的那个。
 */
export function chordMidis(chord: DetectedChord, octave = 3): number[] {
  const root = ((chord.root % 12) + 12) % 12;
  const base = 12 * (octave + 1) + root;
  const steps = qualityIntervals(chord.quality);
  // 转位：低音以上的音留在原位，低音以下的音抬高八度，最低那个音就成了低音
  const bassStep = chord.inversion > 0 ? (((chord.bass - root) % 12) + 12) % 12 : 0;
  const midis = steps.map((step) => base + step + (bassStep > 0 && step < bassStep ? 12 : 0));
  return midis.sort((a, b) => a - b);
}

/**
 * 一个和弦在指板上怎么按（v0.86.0）。
 *
 * 逐个音取「最低品」会出两种事故：两个音抢同一根弦（同一拍按不了两个品），
 * 或者落成 `3:0 2:0 4:12` 这种手指张不开的形状。所以这里把每个音的所有按法
 * 摆在一起穷举（最多 4⁴ 种），挑**品格跨度最小、整体位置最低**的那一组，
 * 而且保证一根弦只出一个音。认出来的和弦就是这么变成谱的。
 */
export function voicingOf(midis: number[], maxFret = 15): { s: number; f: number }[] {
  const options = midis.map((midi) => positionsFor(midi, maxFret));
  if (options.some((list) => list.length === 0)) return [];
  let best: { s: number; f: number }[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const picked: { s: number; f: number }[] = [];
  const used = new Set<number>();
  const walk = (index: number) => {
    if (index === options.length) {
      const frets = picked.map((item) => item.f);
      const span = Math.max(...frets) - Math.min(...frets);
      const sum = frets.reduce((total, fret) => total + fret, 0);
      // 跨度最要紧（手指张得开），其次整体别太高。
      const score = span * 3 + sum + Math.min(...frets) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = picked.slice();
      }
      return;
    }
    for (const option of options[index]) {
      if (used.has(option.s)) continue;
      used.add(option.s);
      picked.push(option);
      walk(index + 1);
      picked.pop();
      used.delete(option.s);
    }
  };
  walk(0);
  return best ?? [];
}

/**
 * 把一串认出来的和弦写成一页谱（v0.86.0）：一小节两个和弦，各占半小节。
 *
 * 一个小节只放一个全音符时，alphaTab 会把那个音画在小节中间（看着像空了一大截），
 * 所以改成「半小节一个和弦」——和弦落在每小节的第一拍和第三拍上，一眼能数出走向。
 * 按法是 `voicingOf()` 挑出来的，所以同一根弦不会撞车。
 */
export function sequenceTabOf(chords: DetectedChord[], beatsPerBar = 4, bpm = 70): Tab {
  if (chords.length === 0) throw new Error("sequenceTabOf: 没有和弦");
  const notes: TabNote[] = [];
  const perBar = 2;
  const span = beatsPerBar / perBar;
  chords.forEach((chord, index) => {
    const bar = Math.floor(index / perBar);
    const beat = bar * beatsPerBar + (index % perBar) * span;
    for (const spot of voicingOf(chordMidis(chord), 15)) {
      notes.push(n(spot.s, spot.f, beat, span));
    }
  });
  return tabOf(notes, {
    beatsPerBar,
    // 速度定死一个值（不是区间）：谱头会画出 ♩=bpm，跟练也从这里起步
    bpm: [bpm, bpm],
    caption: chords.map((chord) => chord.label).join("–"),
  });
}

export interface SegmentTabOptions {
  /** 切段时的速度：用它把「秒」换成「拍」。 */
  bpm?: number;
  beatsPerBar?: number;
  /** 对齐网格，单位是拍：0.5 = 八分音符。 */
  grid?: number;
}

/**
 * 按**真实时长**把切出来的和弦写成谱（v0.90.0）。
 *
 * `sequenceTabOf()` 是「一个和弦半小节」的平均分配，适合听不出节奏时先记下来；
 * 但一段扫弦里每个和弦占多久本来就有长短，平均分配会把节奏抹平。
 * 这里用每段的 `start` / `end` 乘以速度换成拍，再对齐到 `grid`（默认半拍），
 * 所以弹得快的地方谱上就短、拖长的地方就长，小节线也按真实时间落。
 *
 * 第一个和弦落在 0 拍（不要求踩着节拍器起手），后面的顺序按时间排；
 * 前面一段比后面一段长时不会被压回去（`startBeat` 至少等于上一段的结尾）。
 */
export function segmentTabOf(
  segments: { start: number; end: number; chord: DetectedChord | null }[],
  options: SegmentTabOptions = {},
): Tab {
  const bpm = Math.max(20, Math.round(options.bpm ?? 70));
  const beatsPerBar = Math.max(1, Math.round(options.beatsPerBar ?? 4));
  const grid = Math.max(0.25, options.grid ?? 0.5);
  const played = segments.filter(
    (segment): segment is { start: number; end: number; chord: DetectedChord } => Boolean(segment.chord),
  );
  if (played.length === 0) throw new Error("segmentTabOf: 没有和弦");

  const first = played[0].start;
  const notes: TabNote[] = [];
  let cursor = 0;
  for (const segment of played) {
    const rawStart = ((segment.start - first) * bpm) / 60;
    const rawLength = ((segment.end - segment.start) * bpm) / 60;
    const startBeat = Math.max(cursor, Math.round(rawStart / grid) * grid);
    const beats = Math.max(grid, Math.round(rawLength / grid) * grid);
    const spots = voicingOf(chordMidis(segment.chord), 15);
    for (const spot of spots) notes.push(n(spot.s, spot.f, startBeat, beats));
    cursor = startBeat + beats;
  }

  const bars = Math.max(1, Math.ceil((cursor - 1e-6) / beatsPerBar));
  return tabOf(notes, {
    beatsPerBar,
    bars,
    bpm: [bpm, bpm],
    caption: played.map((segment) => segment.chord.label).join("–"),
  });
}

export interface BassStep {
  label: string;
  /** 低音的音名（`C` / `E` / `G`）。 */
  bassName: string;
  /** 0 = 原位，>0 = 转位。 */
  inversion: number;
  /** 低音跟上一段不一样（第一段恒为 false）。 */
  moved: boolean;
}

/**
 * 低音走线（v0.90.0）：一串和弦的「最低那个音」怎么走。
 *
 * 认和弦时最容易被忽略的是低音：`C`、`C/E`、`C/G` 三个和弦的组成音完全一样，
 * 只有最低音不同——写成 `C–C/E–C/G` 才能看出「低音在往下走」这件事。
 * 这里只做数据，文案交给页面。
 */
export function bassLineOf(chords: DetectedChord[]): BassStep[] {
  return chords.map((chord, index) => {
    const previous = index > 0 ? chords[index - 1].bass : null;
    return {
      label: chord.label,
      bassName: noteNameOf(chord.bass),
      inversion: chord.inversion,
      moved: previous !== null && previous !== chord.bass,
    };
  });
}
