/**
 * 「稳不稳」的练习记录：只留最近 24 次，够画一条趋势线、够知道最好的一次。
 *
 * 存的是**标准差**（越小越稳），不是 BPM——这项练的不是速度，是「每一拍都不抢不拖」。
 */

export const STEADY_KEY = "guitar.steady.v1";
/** 在页面内给「稳不稳」面板喂一组速度 / 小节数（v0.141.0） */
export const STEADY_EVENT = "guitar:steady";
export const MAX_RUNS = 24;

export interface SteadyRun {
  id: string;
  /** 哪天练的（YYYY-MM-DD） */
  date: string;
  bpm: number;
  bars: number;
  /** 这一遍只弹了第几小节到第几小节（v0.143.0）；整段弹的不写。 */
  fromBar?: number;
  toBar?: number;
  /** 每拍偏差的标准差（毫秒） */
  stdevMs: number;
  /** 平均绝对偏差（毫秒） */
  meanAbsMs: number;
  /** 每拍漂移（毫秒 / 拍） */
  driftMsPerBeat: number;
  /** 打中的拍数 */
  hits: number;
}

function parseRun(value: unknown): SteadyRun | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.date !== "string") return null;
  const bpm = Number(item.bpm);
  const bars = Number(item.bars);
  const stdevMs = Number(item.stdevMs);
  const meanAbsMs = Number(item.meanAbsMs);
  const driftMsPerBeat = Number(item.driftMsPerBeat);
  const hits = Number(item.hits);
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  if (!Number.isFinite(stdevMs) || stdevMs < 0) return null;
  return {
    id: item.id,
    date: item.date,
    bpm,
    bars: Number.isFinite(bars) && bars > 0 ? Math.round(bars) : 4,
    stdevMs: Math.round(stdevMs * 10) / 10,
    meanAbsMs: Number.isFinite(meanAbsMs) ? Math.round(meanAbsMs * 10) / 10 : 0,
    driftMsPerBeat: Number.isFinite(driftMsPerBeat) ? Math.round(driftMsPerBeat * 10) / 10 : 0,
    hits: Number.isFinite(hits) && hits > 0 ? Math.round(hits) : 0,
  };
}

export function loadRuns(): SteadyRun[] {
  try {
    const raw = window.localStorage.getItem(STEADY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseRun)
      .filter((item): item is SteadyRun => item !== null)
      .slice(-MAX_RUNS);
  } catch {
    return [];
  }
}

function persist(runs: SteadyRun[]): void {
  try {
    if (runs.length === 0) window.localStorage.removeItem(STEADY_KEY);
    else window.localStorage.setItem(STEADY_KEY, JSON.stringify(runs));
  } catch {
    // 存不下就算了，别让一次练习因为配额报错整块崩掉
  }
}

export function recordRun(input: Omit<SteadyRun, "id">): SteadyRun[] {
  const run: SteadyRun = { id: `steady-${Date.now().toString(36)}`, ...input };
  const next = [...loadRuns(), run].slice(-MAX_RUNS);
  persist(next);
  return next;
}

/** 标准差最小的那一次——「最稳的一遍」 */
export function bestRun(runs: SteadyRun[] = loadRuns()): SteadyRun | null {
  if (runs.length === 0) return null;
  return runs.reduce((best, item) => (item.stdevMs < best.stdevMs ? item : best), runs[0]);
}

/** 最近几次的标准差，旧 → 新；少于两个点画不出线 */
export function steadyTrend(runs: SteadyRun[] = loadRuns(), count = 12): number[] {
  return steadyWindow(runs, count).map((item) => item.stdevMs);
}

/** 画趋势用的那一段（旧 → 新），要单独标「最稳」「最快」时用它 */
export function steadyWindow(runs: SteadyRun[] = loadRuns(), count = 12): SteadyRun[] {
  return runs.slice(-Math.max(2, count));
}

/** 清空全部记录（误录、玩过之后想重新开始） */
export function clearRuns(): void {
  persist([]);
}

/** 把一份旧记录写回去（配合「撤销」） */
export function restoreRuns(runs: SteadyRun[]): SteadyRun[] {
  const next = runs.slice(-MAX_RUNS);
  persist(next);
  return next;
}

export function seedSteady(bpm: number, bars: number, id?: string): void {
  window.dispatchEvent(new CustomEvent(STEADY_EVENT, { detail: { bpm, bars, id } }));
}
