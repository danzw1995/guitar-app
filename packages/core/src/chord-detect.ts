import { SHARP_NAMES } from "./theory.ts";

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
