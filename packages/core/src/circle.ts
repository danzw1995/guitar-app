/**
 * 五度圈（circle of fifths）。
 *
 * 顺时针每步 +7 个半音，调号随之加一个升号；到第 6 步是 F#（6 个升号），
 * 再往前用等音写法 Db（5 个降号）继续，所以一圈 12 个调正好用尽。
 */
import { KEY_BY_ID, SCALE_BY_ID, scaleNames } from "./theory.ts";
import type { TheoryQuestion } from "./intervals.ts";

export interface CircleKey {
  /** 调名，如 `C`、`F#`。 */
  id: string;
  /** 顺时针位置，0 = C。 */
  position: number;
  name: string;
  minorName: string;
  /** 正数 = 升号个数，负数 = 降号个数。 */
  accidentals: number;
  accidentalsLabel: string;
  /** 该调大调音阶的 7 个音名。 */
  scale: string[];
}

/** 顺时针 12 个调；F# 与 Db 是等音的两个位置，这里都保留。 */
const ORDER = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

/** 相对小调（下行小三度）；KEYS 里没有的调（G#m / D#m）也照样给出名字。 */
const RELATIVE_MINOR: Record<string, string> = {
  C: "A 小调",
  G: "E 小调",
  D: "B 小调",
  A: "F# 小调",
  E: "C# 小调",
  B: "G# 小调",
  "F#": "D# 小调",
  Db: "Bb 小调",
  Ab: "F 小调",
  Eb: "C 小调",
  Bb: "G 小调",
  F: "D 小调",
};

function accidentalsLabel(count: number): string {
  if (count === 0) return "没有升降号";
  return count > 0 ? `${count} 个升号` : `${-count} 个降号`;
}

export const CIRCLE: CircleKey[] = ORDER.map((id, position) => {
  const key = KEY_BY_ID.get(id);
  const major = SCALE_BY_ID.get("major")!;
  const scale = key ? scaleNames(key, major) : [];
  // 直接从调内音名数升降号：正数是升号、负数是降号（`accidentalCount` 只给绝对值）
  const accidentals = scale.reduce(
    (count, name) =>
      count + (name.match(/#/g)?.length ?? 0) - (name.match(/b/g)?.length ?? 0),
    0,
  );
  return {
    id,
    position,
    name: `${id} 大调`,
    minorName: RELATIVE_MINOR[id] ?? "",
    accidentals,
    accidentalsLabel: accidentalsLabel(accidentals),
    scale,
  };
});

const BY_ID = new Map(CIRCLE.map((entry) => [entry.id, entry]));

export function circleKey(keyId: string): CircleKey | null {
  return BY_ID.get(keyId) ?? null;
}

/** 纯五度上方 / 下方的调（顺时针 +1 / 逆时针 -1）。 */
export function neighborKeys(keyId: string): { up: CircleKey; down: CircleKey } | null {
  const entry = BY_ID.get(keyId);
  if (!entry) return null;
  return {
    up: CIRCLE[(entry.position + 1) % 12],
    down: CIRCLE[(entry.position + 11) % 12],
  };
}

/** 两个调在五度圈上的距离（0–6，取近的那边）。 */
export function fifthsDistance(a: string, b: string): number | null {
  const first = BY_ID.get(a);
  const second = BY_ID.get(b);
  if (!first || !second) return null;
  const diff = Math.abs(first.position - second.position);
  return Math.min(diff, 12 - diff);
}

/** 五度圈练习：调号数量、相邻调、相对小调。 */
export function circleQuestion(rng: () => number): TheoryQuestion {
  const entry = CIRCLE[Math.floor(rng() * CIRCLE.length) % CIRCLE.length];
  const kind = Math.floor(rng() * 3);

  if (kind === 0) {
    const answer = String(entry.accidentals);
    const pool = ["-5", "-4", "-3", "-2", "-1", "0", "1", "2", "3", "4", "5", "6"];
    return {
      prompt: `${entry.name}有几个升降号？（升号为正、降号为负）`,
      answer,
      choices: choicesFor(answer, pool, rng),
      explain: `${entry.name}：${entry.accidentalsLabel}。`,
    };
  }

  if (kind === 1) {
    const { up } = neighborKeys(entry.id)!;
    const answer = up.id;
    return {
      prompt: `${entry.name}往上一个纯五度是哪个调？`,
      answer,
      choices: choicesFor(answer, CIRCLE.map((c) => c.id), rng),
      explain: `顺时针一格是 ${up.name}（${up.accidentalsLabel}）。`,
    };
  }

  const answer = entry.minorName;
  return {
    prompt: `${entry.name}的关系小调是？`,
    answer,
    choices: choicesFor(answer, CIRCLE.map((c) => c.minorName).filter(Boolean), rng),
    explain: `${entry.name}的关系小调用相同的音，主音低小三度，就是 ${entry.minorName}。`,
  };
}

function choicesFor(answer: string, pool: string[], rng: () => number): string[] {
  const others = pool.filter((item) => item !== answer);
  const picked: string[] = [];
  while (picked.length < 3 && others.length > 0) {
    const index = Math.floor(rng() * others.length) % others.length;
    picked.push(others.splice(index, 1)[0]);
  }
  const all = [answer, ...picked];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
