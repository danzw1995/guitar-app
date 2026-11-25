/**
 * 按技能生成谱 v1（v0.163.0）。
 *
 * 「我的谱」里一个初学用户写不出、也编配不好，所以给他「选一个技能 + 选长度，
 * 系统生成一段能弹的谱」这条最小闭环。生成器全是确定性算法，不联网、不用模型：
 *
 *   - 所有谱都由「乐理约束 + 可弹性规则」拼出来，同一个种子每次都一样；
 *   - 每个技能都带自己的可行性检查（滑音要同一根弦、品差 2–4；击勾弦的第二个音
 *     右手不拨），`checkPiece()` 把这些问题列出来，单测里跑遍所有技能 × 种子；
 *   - 音高落在 1–3 弦 0–12 品，和弦只从库里的进行里挑——不会生成弹不出来的谱。
 */

import { chordTab, n, progressionTab, tabOf, type Tab, type TabNote } from "./tab.ts";
import { FAMILIAR } from "./melody-rhythm.ts";
import type { Level } from "./rhythm-drills.ts";

export type SkillId = "quarter" | "eighth" | "slide" | "hammer" | "strum";

export interface Skill {
  id: SkillId;
  label: string;
  level: Level;
  /** 这个技能练什么（露在卡片上的一句话）。 */
  trains: string;
  /** 怎么练。 */
  tip: string;
  bpm: [number, number];
}

export const SKILLS: Skill[] = [
  {
    id: "quarter",
    label: "四分音符",
    level: 1,
    trains: "每拍一个音、稳稳落在拍点上",
    tip: "先数四拍，一拍一个音；下拨，每一拍都落在拍点上，不快不慢。",
    bpm: [60, 80],
  },
  {
    id: "eighth",
    label: "八分音符",
    level: 2,
    trains: "一拍两下的均匀",
    tip: "八分是「一拍两下」——最容易越弹越快，跟着节拍器数「一 二」再弹。",
    bpm: [56, 76],
  },
  {
    id: "slide",
    label: "滑音",
    level: 3,
    trains: "同一根弦上滑动的准头",
    tip: "滑音：前一个音拨响后手指不抬起，滑到目标品才让后一个音响，中间不断。",
    bpm: [50, 70],
  },
  {
    id: "hammer",
    label: "击勾弦",
    level: 3,
    trains: "左手发力与两个音的连贯",
    tip: "击勾弦：第二个音右手不拨——击弦用手指砸下去，勾弦靠手指往侧下方勾开。",
    bpm: [50, 70],
  },
  {
    id: "strum",
    label: "扫弦",
    level: 2,
    trains: "右手方向与和弦转换",
    tip: "扫弦：先慢速把每一下方向弹清楚，手一直保持摆动，空拍也别停手。",
    bpm: [60, 80],
  },
];

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

/** 1–6 弦空弦音高（1 = 高音 E）。 */
const OPEN = [64, 59, 55, 50, 45, 40];

function randomOf(seed: number): () => number {
  let state = Math.abs(Math.round(seed)) % 4294967296 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

interface Spot {
  s: number;
  f: number;
  midi: number;
}

/** 一个音高落到哪根弦的哪个品：1–3 弦、0–12 品里挑最低的（并列时挑高音弦）。 */
function place(midi: number): Spot {
  let best: Spot | null = null;
  for (let s = 1; s <= 3; s += 1) {
    const fret = midi - OPEN[s - 1];
    if (fret < 0 || fret > 12) continue;
    if (!best || fret < best.f) best = { s, f: fret, midi };
  }
  return best ?? { s: 1, f: 0, midi: OPEN[0] };
}

/** C 大调一个八度的七个音级（0 = C4），下标就是调内级数。 */
const DEGREES = [60, 62, 64, 65, 67, 69, 71, 72];

/** 级进为主的旋律走位：在调内级数上走，撞到边界就往回走。 */
function walk(seed: number, count: number): Spot[] {
  const rng = randomOf(seed);
  const spots: Spot[] = [];
  let degree = 2;
  let direction = 1;
  let sameRun = 0;
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      if (sameRun === 0 && rng() < 0.16) {
        spots.push(place(DEGREES[degree])); // 偶尔停在同一拍上（连停两次就强制走开）
        sameRun += 1;
        continue;
      }
      if (rng() < 0.45) direction = -direction;
      const jump = rng() < 0.18 ? 2 : 1;
      let next = degree + direction * jump;
      if (next < 0 || next > 7) {
        direction = -direction;
        next = degree + direction * jump;
      }
      degree = Math.max(0, Math.min(7, next));
      sameRun = 0;
    }
    spots.push(place(DEGREES[degree]));
  }
  return spots;
}

/** 同一根弦上找一个 2–4 品的滑音目标；往后伸会出 12 品就往前滑。 */
function slideTarget(spot: Spot, rng: () => number, up = true): Spot {
  const span = 2 + Math.floor(rng() * 3); // 2–4 品
  let fret = up ? spot.f + span : spot.f - span;
  if (fret < 0 || fret > 12) fret = up ? spot.f - span : spot.f + span;
  fret = Math.max(0, Math.min(12, fret));
  return { s: spot.s, f: fret, midi: OPEN[spot.s - 1] + fret };
}

/** 击弦要往上留 2–4 品：太靠上就把起点挪下来。 */
function liftLow(spot: Spot, span: number): Spot {
  const fret = spot.f + span > 12 ? Math.max(0, 12 - span) : spot.f;
  return { s: spot.s, f: fret, midi: OPEN[spot.s - 1] + fret };
}

/** 勾弦要往下留 2–4 品：太靠下就把起点挪上去。 */
function lowerHigh(spot: Spot, span: number): Spot {
  const fret = spot.f - span < 0 ? Math.min(12, span) : spot.f;
  return { s: spot.s, f: fret, midi: OPEN[spot.s - 1] + fret };
}

const PROGRESSIONS: string[][] = [
  ["C", "G", "Am", "F", "C", "G", "Am", "F"],
  ["Am", "F", "C", "G", "Am", "F", "C", "G"],
  ["C", "Am", "F", "G", "C", "Am", "F", "G"],
  ["Em", "C", "G", "D", "Em", "C", "G", "D"],
];

const STRUM_PATTERNS: ("D" | "U" | null)[][] = [
  ["D", null, "U", null, "D", "U", null, "U"],
  ["D", null, "D", null, "U", null, "U", null],
  ["D", "U", "D", "U", "D", "U", "D", "U"],
  ["D", null, "U", "U", "D", "U", null, "U"],
];

export interface GeneratedPiece {
  id: string;
  /** "melody" = 熟悉旋律做骨架那一支（v0.164.0）。 */
  skill: SkillId | "melody";
  seed: number;
  bars: number;
  meter: "4/4";
  bpm: [number, number];
  title: string;
  hint: string;
  tab: Tab;
}

function melodicNotes(skill: SkillId, spots: Spot[], bars: number, rng: () => number): TabNote[] {
  const notes: TabNote[] = [];
  if (skill === "quarter") {
    spots.forEach((spot, index) => {
      notes.push(n(spot.s, spot.f, index, 1));
    });
    return notes;
  }
  if (skill === "eighth") {
    spots.forEach((spot, index) => {
      notes.push(n(spot.s, spot.f, index * 0.5, 0.5));
    });
    return notes;
  }
  // 滑音 / 击勾弦：一小节 6 个音，节拍点铺满四拍
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    const [a, b, c, d] = [
      spots[bar * 4 % spots.length],
      spots[(bar * 4 + 1) % spots.length],
      spots[(bar * 4 + 2) % spots.length],
      spots[(bar * 4 + 3) % spots.length],
    ];
    notes.push(n(a.s, a.f, base, 1));
    if (skill === "slide") {
      const first = slideTarget(b, rng, rng() < 0.7);
      const second = slideTarget(c, rng, rng() < 0.5);
      notes.push(n(b.s, b.f, base + 1, 0.5));
      notes.push(n(first.s, first.f, base + 1.5, 0.5, { tech: "s" }));
      notes.push(n(c.s, c.f, base + 2, 0.5));
      notes.push(n(second.s, second.f, base + 2.5, 0.5, { tech: "s" }));
    } else {
      const upSpan = 2 + Math.floor(rng() * 3);
      const downSpan = 2 + Math.floor(rng() * 3);
      const low = liftLow(b, upSpan);
      const high = { s: low.s, f: low.f + upSpan, midi: OPEN[low.s - 1] + low.f + upSpan };
      const top = lowerHigh(c, downSpan);
      const back = { s: top.s, f: top.f - downSpan, midi: OPEN[top.s - 1] + top.f - downSpan };
      notes.push(n(low.s, low.f, base + 1, 0.5));
      notes.push(n(high.s, high.f, base + 1.5, 0.5, { tech: "h" }));
      notes.push(n(top.s, top.f, base + 2, 0.5));
      notes.push(n(back.s, back.f, base + 2.5, 0.5, { tech: "p" }));
    }
    notes.push(n(d.s, d.f, base + 3, 1));
  }
  return notes;
}

export function generatePiece(skillId: SkillId = "quarter", seed = 1, bars = 8): GeneratedPiece {
  const skill = SKILL_BY_ID.get(skillId) ?? SKILLS[0];
  const count = Math.max(2, Math.min(16, Math.round(bars) || 8));
  const rng = randomOf(seed + skill.id.length * 7919);

  let tab: Tab;
  if (skill.id === "strum") {
    const names = (PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)] ?? PROGRESSIONS[0]).slice(0, count);
    // 4 小节也能用：取前四小节，和弦进行刚好是 C–G–Am–F 那种一轮
    while (names.length < count) names.push(names[names.length % 4]);
    const strums = pick(rng, STRUM_PATTERNS);
    tab = progressionTab({ names, beatsEach: 4, step: 0.5, strums, beatsPerBar: 4 });
  } else {
    const spots = walk(seed + 13, skill.id === "eighth" ? count * 8 : skill.id === "quarter" ? count * 4 : count * 4);
    tab = tabOf(melodicNotes(skill.id, spots, count, rng), {
      beatsPerBar: 4,
      bars: count,
      bpm: [skill.bpm[0], skill.bpm[0]],
      caption: `${skill.label} · ${count} 小节`,
    });
  }

  return {
    id: `gen-${skill.id}-${seed}-${count}`,
    skill: skill.id,
    seed,
    bars: count,
    meter: "4/4",
    bpm: skill.bpm,
    title: `生成 · ${skill.label} · ${count} 小节`,
    hint: `${skill.trains}。${skill.tip}`,
    tab,
  };
}

/** 熟悉旋律那一支能叠的技巧。 */
export type MelodyTech = "slide" | "hammer";

/** 难度档：候选里挑几成。 */
export type MelodyDensity = 1 | 2 | 3;

export interface MelodyPieceOptions {
  melodyId: string;
  tech: MelodyTech;
  density: MelodyDensity;
  seed: number;
  bars: number;
}

export const MELODY_TECH_LABEL: Record<MelodyTech, string> = {
  slide: "滑音",
  hammer: "击勾弦",
};

export const MELODY_DENSITY_LABEL: Record<MelodyDensity, string> = {
  1: "轻松",
  2: "标准",
  3: "加密",
};

/** 面板上的旋律选项（短标签是 chips 里那行小字）。 */
export const MELODY_CHOICES = FAMILIAR.map((melody) => ({
  id: melody.id,
  name: melody.name,
  short:
    melody.id === "star" ? "传统儿歌" : melody.id === "joy" ? "贝多芬主题" : melody.id === "tiger" ? "法国民歌" : "熟悉旋律",
}));

/**
 * 熟悉旋律做骨架、技巧叠上去（v0.164.0）。
 *
 * 旋律每轮 2 小节（一拍一个音），重复到要的长度；整条放在同一根弦上，
 * 击勾弦才有「同一根弦的前一个音」可接。候选分两种：
 *   - 相邻两个音品差 2–4：击弦（往上）/ 勾弦（往下）；
 *   - 品 ≥ 2 的音：从下面 2–3 品滑进来。
 * 密度是「候选里挑几成」：轻松 1/3、标准 2/3、加密全上——加密档
 * 两种技巧都叠（被击勾弦吃掉的音就不再滑音进）。
 */
export function generateMelodyPiece(options: MelodyPieceOptions): GeneratedPiece {
  const melody = FAMILIAR.find((item) => item.id === options.melodyId) ?? FAMILIAR[0];
  const tech: MelodyTech = options.tech === "hammer" ? "hammer" : "slide";
  const density: MelodyDensity = options.density === 3 ? 3 : options.density === 2 ? 2 : 1;
  const skill = SKILL_BY_ID.get(tech) ?? SKILLS[0];
  const reps = Math.max(1, Math.min(8, Math.round(options.bars / 2) || 1));
  const bars = reps * 2;
  const rng = randomOf(Math.abs(Math.round(options.seed)) + melody.id.length * 613);

  // 整条旋律放同一根弦（3 弦优先试试，放不下换 2 弦）：击勾弦要「同一根弦的前一个音」
  const midis: number[] = [];
  for (let rep = 0; rep < reps; rep += 1) {
    for (const degree of melody.degrees) midis.push(DEGREES[Math.max(0, Math.min(7, degree))]);
  }
  const onString = (s: number) => midis.every((midi) => {
    const fret = midi - OPEN[s - 1];
    return fret >= 0 && fret <= 12;
  });
  const usable = [3, 2].filter(onString);
  const string = usable.length > 0 ? usable[Math.floor(rng() * usable.length)] : 0;
  const spots: Spot[] = string
    ? midis.map((midi) => ({ s: string, f: midi - OPEN[string - 1], midi }))
    : midis.map((midi) => place(midi));

  // 击勾弦候选：相邻两个音品差 2–4（往上=击弦、往下=勾弦）
  const legato: { index: number; tech: "h" | "p" }[] = [];
  for (let index = 0; index < spots.length - 1; index += 1) {
    const a = spots[index];
    const b = spots[index + 1];
    if (a.s !== b.s) continue;
    const delta = b.f - a.f;
    if (delta >= 2 && delta <= 4) legato.push({ index: index + 1, tech: "h" });
    if (delta <= -2 && delta >= -4) legato.push({ index: index + 1, tech: "p" });
  }
  // 滑音候选：品 ≥ 2 的音都能从下面 2–3 品滑进来
  const slides: number[] = [];
  spots.forEach((spot, index) => {
    if (spot.f >= 2) slides.push(index);
  });

  const shuffledLegato = [...legato];
  for (let i = shuffledLegato.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledLegato[i], shuffledLegato[j]] = [shuffledLegato[j], shuffledLegato[i]];
  }
  const shuffledSlides = [...slides];
  for (let i = shuffledSlides.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledSlides[i], shuffledSlides[j]] = [shuffledSlides[j], shuffledSlides[i]];
  }

  const legatoCount =
    density === 3
      ? shuffledLegato.length
      : Math.ceil(shuffledLegato.length * (density === 1 ? 1 / 3 : 2 / 3));
  const legatoMap = new Map<number, "h" | "p">();
  for (const item of shuffledLegato.slice(0, legatoCount)) legatoMap.set(item.index, item.tech);

  const legatoUsed = new Set(legatoMap.keys());
  const slideCount =
    density === 3
      ? shuffledSlides.length
      : tech === "slide"
        ? Math.ceil(shuffledSlides.length * (density === 1 ? 1 / 3 : 2 / 3))
        : 0;
  const slideSet = new Set<number>();
  for (const index of shuffledSlides.slice(0, slideCount)) {
    if (!legatoUsed.has(index)) slideSet.add(index);
  }

  const notes: TabNote[] = [];
  spots.forEach((spot, index) => {
    const beat = index;
    const legatoTech = legatoMap.get(index);
    if (legatoTech) {
      notes.push(n(spot.s, spot.f, beat, 1, { tech: legatoTech }));
      return;
    }
    if (slideSet.has(index)) {
      const gap = rng() < 0.5 ? 2 : 3;
      const from = Math.max(0, spot.f - gap);
      notes.push(n(spot.s, from, beat, 0.5));
      notes.push(n(spot.s, spot.f, beat + 0.5, 0.5, { tech: "s" }));
      return;
    }
    notes.push(n(spot.s, spot.f, beat, 1));
  });

  const tab = tabOf(notes, {
    beatsPerBar: 4,
    bars,
    bpm: [skill.bpm[0], skill.bpm[0]],
    caption: `${melody.name} · ${MELODY_TECH_LABEL[tech]}`,
  });

  return {
    id: `genm-${melody.id}-${tech}-${density}-${options.seed}-${bars}`,
    skill: "melody",
    seed: options.seed,
    bars,
    meter: "4/4",
    bpm: skill.bpm,
    title: `生成 · ${melody.name} · ${MELODY_TECH_LABEL[tech]} · ${bars} 小节`,
    hint: `${melody.source}的骨架。${skill.tip}${density === 3 ? "加密档击勾弦和滑音都叠上了。" : ""}`,
    tab,
  };
}

export interface PieceCheck {
  ok: boolean;
  problems: string[];
}

/**
 * 这首生成的谱弹得出来吗——单测里跑遍所有技能 × 种子。
 *
 * 查的是「错了一定弹不出来」的硬规则：时值填满、音落在弦上、
 * 同弦同拍不叠音、连奏记号（滑 / 击 / 勾）都跟着同一根弦的前一个音。
 */
export function checkPiece(piece: GeneratedPiece): PieceCheck {
  const problems: string[] = [];
  const { tab } = piece;
  const width = tab.beatsPerBar;
  // 一个小节「填了几拍」按**起音**算：和弦是一堆同时响的音，不能把每个音的时值都累加
  const onsetDur = new Map<string, number>();
  const seen = new Set<string>();

  const notes = [...tab.notes].sort((a, b) => a.beat - b.beat || a.s - b.s);

  for (const note of notes) {
    if (!Number.isInteger(note.s) || note.s < 1 || note.s > 6) {
      problems.push(`弦号不对：${note.s}`);
    }
    if (!Number.isInteger(note.f) || note.f < 0 || note.f > 24) {
      problems.push(`品位不对：${note.f}`);
    }
    const key = `${note.beat}|${note.s}`;
    if (seen.has(key)) problems.push(`同一拍同一根弦有两个音：第 ${note.beat} 拍 ${note.s} 弦`);
    seen.add(key);
    const bar = Math.floor(note.beat / width);
    const onset = `${bar}|${note.beat}`;
    onsetDur.set(onset, Math.max(onsetDur.get(onset) ?? 0, note.dur));
    if (note.beat + note.dur > (bar + 1) * width + 1e-9) {
      problems.push(`第 ${note.beat} 拍的音跨过了小节线`);
    }
  }

  // 扫弦的节奏型里有空拍（休止），只要求每小节不超过四拍
  const filled = new Map<number, number>();
  for (const [onset, dur] of onsetDur) {
    const bar = Number(onset.split("|")[0]);
    filled.set(bar, (filled.get(bar) ?? 0) + dur);
  }
  for (let bar = 0; bar < tab.bars; bar += 1) {
    const total = filled.get(bar) ?? 0;
    if (piece.skill === "strum") {
      if (total > width + 1e-9) problems.push(`第 ${bar + 1} 小节超过 ${width} 拍（${total}）`);
    } else if (Math.abs(total - width) > 1e-9) {
      problems.push(`第 ${bar + 1} 小节只有 ${total} 拍（应该 ${width}）`);
    }
  }
  if (notes.length === 0) problems.push("一个音都没有");

  // 连奏记号：必须有同一根弦的前一个音，且品差 2–4
  const previous = new Map<number, TabNote>();
  for (const note of notes) {
    if (note.tech === "h" || note.tech === "p" || note.tech === "s") {
      const origin = previous.get(note.s);
      if (!origin) {
        problems.push(`第 ${note.beat} 拍的 ${note.tech} 前面没有同一根弦的音`);
      } else {
        const delta = note.f - origin.f;
        if (Math.abs(delta) < 2 || Math.abs(delta) > 5) {
          problems.push(`第 ${note.beat} 拍的 ${note.tech} 品差 ${delta}，不好按`);
        }
        if (note.tech === "h" && delta <= 0) problems.push(`第 ${note.beat} 拍的击弦没有往高品走`);
        if (note.tech === "p" && delta >= 0) problems.push(`第 ${note.beat} 拍的勾弦没有往低品走`);
      }
    }
    previous.set(note.s, note);
  }

  if (piece.skill === "strum") {
    for (const note of notes) {
      if (!note.arrow) problems.push(`第 ${note.beat} 拍的扫弦没有方向`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/** 和弦扫弦那一类用的现成进行（卡片上要显示「哪几个和弦」）。 */
export function progressionOf(piece: GeneratedPiece): string[] {
  return piece.tab.range ? piece.tab.range.split(" → ") : [];
}

// 让「扫弦」这一支也走一遍和弦库：库里没有的名字会画不出谱
export function skillOf(id: SkillId): Skill {
  return SKILL_BY_ID.get(id) ?? SKILLS[0];
}

/** 和弦扫弦以外，其余技能都是单音。 */
export function chordTabForCheck(name: string, tab: Tab): Tab {
  return tab ?? chordTab({ name });
}
