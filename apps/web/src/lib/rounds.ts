import { dateKeyOf } from "@guitar/core";

/**
 * 跟练轮次流水（v0.171.0）。
 *
 * 跟练现在一轮一轮往下练（记一次成绩算一轮），「这一轮不加码」时速度是定格住的，
 * 光看那条「最高 BPM」的曲线看不出「不加码这几轮稳住了没有」——所以单独记一份
 * 轮次流水：第几轮、多少 BPM、几分钟、是不是不加码。
 *
 * 与 `guitar.steady.v1`（稳不稳，带录音与标准差）分开存：这里只有几十字节一条。
 */
export const ROUNDS_KEY = "guitar.rounds.v1";
/** 每条练习最多留几轮（够看出「这几轮」的趋势就行）。 */
export const MAX_ROUNDS = 24;

export interface RoundEntry {
  /** YYYY-MM-DD。 */
  date: string;
  /** HH:mm。 */
  at: string;
  round: number;
  bpm: number;
  minutes: number;
  /** 这一轮是不是「不加码」（只求稳）。 */
  hold: boolean;
}

export type RoundsLog = Record<string, RoundEntry[]>;

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clockOf(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function parseEntry(value: unknown): RoundEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const round = Number(item.round);
  const bpm = Number(item.bpm);
  const minutes = Number(item.minutes);
  if (!isDateKey(item.date)) return null;
  if (!Number.isInteger(round) || round < 1 || round > 99) return null;
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 200) return null;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) return null;
  return {
    date: item.date,
    at: typeof item.at === "string" && /^\d{2}:\d{2}$/.test(item.at) ? item.at : "00:00",
    round,
    bpm: Math.round(bpm),
    minutes: Math.round(minutes),
    hold: item.hold === true,
  };
}

function parseLog(value: unknown): RoundsLog {
  if (typeof value !== "object" || value === null) return {};
  const log: RoundsLog = {};
  for (const [id, rows] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    const parsed = rows
      .map(parseEntry)
      .filter((row): row is RoundEntry => row !== null)
      .slice(-MAX_ROUNDS);
    if (parsed.length > 0) log[id] = parsed;
  }
  return log;
}

function persist(log: RoundsLog): RoundsLog {
  try {
    window.localStorage.setItem(ROUNDS_KEY, JSON.stringify(log));
  } catch {
    // 存不下就算了，界面上的这一份还在
  }
  return log;
}

export function loadRounds(): RoundsLog {
  try {
    return parseLog(JSON.parse(window.localStorage.getItem(ROUNDS_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveRounds(log: RoundsLog): void {
  persist(log);
}

/** 某一条练习的轮次（按时间先后）。 */
export function roundsOf(id: string): RoundEntry[] {
  return loadRounds()[id] ?? [];
}

/** 记一轮（v0.171.0）：同一条最多留 `MAX_ROUNDS` 轮。 */
export function pushRound(
  id: string,
  entry: { round: number; bpm: number; minutes: number; hold: boolean },
  now = new Date(),
): RoundsLog {
  const log = loadRounds();
  const rows = [...(log[id] ?? []), {
    date: dateKeyOf(now),
    at: clockOf(now),
    round: Math.round(entry.round),
    bpm: Math.round(entry.bpm),
    minutes: Math.max(1, Math.round(entry.minutes)),
    hold: entry.hold,
  }].slice(-MAX_ROUNDS);
  return persist({ ...log, [id]: rows });
}
