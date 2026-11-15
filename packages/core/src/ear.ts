import { SHARP_NAMES } from "./theory.ts";
import { INTERVALS as INTERVAL_TABLE, intervalOf } from "./intervals.ts";
import { positionsFor } from "./transcribe.ts";

/**
 * 听辨练习（v0.72.0）：「扒谱」模块里「练」那一段的题库。
 *
 * 题目是**纯数据**：一段要播的 MIDI 序列、几个选项、一个正确答案、答完的一句解释。
 * 页面只负责播和判对错——这样题目本身可以单测（选项里一定有答案、干扰项不重复、
 * 同一个种子出同一套题）。
 */

export type EarKind = "position" | "interval";

export interface EarOption {
  id: string;
  label: string;
}

export interface EarQuestion {
  id: string;
  kind: EarKind;
  /** 题干。 */
  prompt: string;
  /** 要播的音（MIDI，按顺序）。 */
  play: number[];
  options: EarOption[];
  /** 正确选项的 id。 */
  answer: string;
  /** 答完之后的一句话，讲清楚为什么。 */
  hint: string;
}

/** 半音数 → 音程名；表外的直接说「N 个半音」。 */
export function intervalName(semitones: number): string {
  if (semitones < 0 || semitones > 12) return `${semitones} 个半音`;
  return intervalOf(semitones).name;
}

/** MIDI → `E2` / `C#4` 这种带八度的名字。 */
export function noteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${SHARP_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
}

/** 位置的说法：`2 弦 5 品`；空弦说 `1 弦空弦`。 */
export function positionLabel(position: { s: number; f: number }): string {
  return position.f === 0 ? `${position.s} 弦空弦` : `${position.s} 弦 ${position.f} 品`;
}

/** 音名 → MIDI（`C4` = 60、`Bb3` = 58）。题库里写例子用。 */
export function midiOf(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!match) throw new Error(`midiOf: 认不出 ${name}`);
  const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const pc = (((letters[match[1]] + accidental) % 12) + 12) % 12;
  return (Number(match[3]) + 1) * 12 + pc;
}

/** 小整数哈希（mulberry32），同一个种子出同一套题，测试才稳。 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 听音辨位：给一个音，问它落在哪根弦的第几品（品域内取最低品）。 */
export function earPositionQuestion(midi: number, seed = 1, maxFret = 5): EarQuestion {
  const positions = positionsFor(midi, maxFret);
  if (positions.length === 0) {
    throw new Error(`earPositionQuestion: ${noteName(midi)} 在 ${maxFret} 品内按不出来`);
  }
  const answer = positions[0];
  const correct = positionLabel(answer);
  const random = rng(seed);
  const pool = new Map<string, { s: number; f: number }>();
  const add = (s: number, f: number): void => {
    if (s < 1 || s > 6 || f < 0 || f > maxFret) return;
    pool.set(positionLabel({ s, f }), { s, f });
  };
  for (const position of positions) add(position.s, position.f);
  add(answer.s, answer.f + 1);
  add(answer.s, answer.f - 1);
  add(answer.s + 1, answer.f);
  add(answer.s - 1, answer.f);
  const distractors = shuffle(
    [...pool.keys()].filter((label) => label !== correct),
    random,
  ).slice(0, 3);

  const others = positions
    .slice(1)
    .map((position) => positionLabel(position))
    .join("、");

  return {
    id: `pos-${midi}-${seed}`,
    kind: "position",
    prompt: "听这个音，它在吉他上落在哪根弦的第几品？",
    play: [midi],
    options: shuffle([correct, ...distractors], random).map((label) => ({ id: label, label })),
    answer: correct,
    hint: `这是 ${noteName(midi)}，最省手的位置是 ${correct}${others ? `（也能在 ${others} 按出来）` : ""}。`,
  };
}

/** 音程判断：播两个音，问它们之间是什么音程。 */
export function earIntervalQuestion(root: number, semitones: number, seed = 1): EarQuestion {
  const name = intervalName(semitones);
  const random = rng(seed);
  const pool = INTERVAL_TABLE.filter((item) => item.semitones !== semitones).map((item) => item.name);
  const distractors = shuffle(pool, random).slice(0, 3);

  return {
    id: `int-${root}-${semitones}-${seed}`,
    kind: "interval",
    prompt: "听这两个音，它们之间是什么音程？",
    play: [root, root + semitones],
    options: shuffle([name, ...distractors], random).map((label) => ({ id: label, label })),
    answer: name,
    hint: `从 ${noteName(root)} 到 ${noteName(root + semitones)}，跨 ${semitones} 个半音，就是${name}。`,
  };
}

/** 一组题：`kind` 决定题型，`seed` 决定具体是哪些音。 */
export function earRound(kind: EarKind, seed: number, count = 8): EarQuestion[] {
  const random = rng(seed);
  const out: EarQuestion[] = [];

  if (kind === "position") {
    // C3–E4 之间、5 品以内按得出来的音；先铺一遍再打乱，避免同一个音连着出。
    const pool: number[] = [];
    for (let midi = 48; midi <= 64; midi += 1) {
      if (positionsFor(midi, 5).length > 0) pool.push(midi);
    }
    const picked = shuffle(pool, random);
    for (let i = 0; i < count; i += 1) {
      out.push(earPositionQuestion(picked[i % picked.length], seed * 31 + i, 5));
    }
    return out;
  }

  const roots = [60, 62, 64, 65, 67];
  const steps = [2, 3, 4, 5, 7, 9, 12];
  for (let i = 0; i < count; i += 1) {
    const root = roots[Math.floor(random() * roots.length)];
    const step = steps[Math.floor(random() * steps.length)];
    out.push(earIntervalQuestion(root, step, seed * 31 + i));
  }
  return out;
}
