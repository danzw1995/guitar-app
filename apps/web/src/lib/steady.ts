/**
 * 「稳不稳」的练习记录：只留最近 24 次，够画一条趋势线、够知道最好的一次。
 *
 * 存的是**标准差**（越小越稳），不是 BPM——这项练的不是速度，是「每一拍都不抢不拖」。
 */
import { wavePngDataUrl } from "./wave";

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
  /** 那一遍整段一共几小节（v0.148.0）：只弹局部时 bars 记的是段落长度，重弹要靠它还原面板上的档位 */
  totalBars?: number;
  /** 每拍偏差的标准差（毫秒） */
  stdevMs: number;
  /** 平均绝对偏差（毫秒） */
  meanAbsMs: number;
  /** 每拍漂移（毫秒 / 拍） */
  driftMsPerBeat: number;
  /** 打中的拍数 */
  hits: number;
  /** 整体偏早/偏晚的中位数（毫秒，负=抢、正=拖）（v0.147.0） */
  medianOffsetMs?: number;
  /** 前半段 / 后半段各自的中位数（v0.148.0）：整段会互相抵消，分开看才知道是不是越弹越拖 */
  medianFirstHalfMs?: number;
  medianSecondHalfMs?: number;
  /**
   * 这一遍的录音（v0.149.0，data URL）。
   * 只有手动打开「录下这一遍」才有；一条几十 KB，所以只留最近几遍（见 AUDIO_RUNS）。
   */
  audio?: string;
  /** 每拍偏了多少毫秒（v0.150.0，负=抢、正=拖）：录音旁边那条参考线靠它画 */
  offsets?: number[];
  /**
   * 录音里第一下点击声的位置（毫秒，v0.151.0）。
   * 波形上要把节拍器画在真实位置上，光有 bpm 不够——录音从按下开始那一刻就在走了。
   */
  originMs?: number;
}

/** 录音只留最近几遍：本地存储放不下更多（每遍约 30–80KB 的 base64） */
export const AUDIO_RUNS = 3;
/** 单条录音的上限，超了就不存——宁可没有，也不要把存储写爆 */
export const AUDIO_MAX_CHARS = 900_000;

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
  // 只弹某几小节的才存区间（v0.144.0）：读的时候也要带上，否则刷新一下就丢了
  const fromRaw = Number(item.fromBar);
  const toRaw = Number(item.toBar);
  const fromBar = Number.isInteger(fromRaw) && fromRaw >= 1 && fromRaw <= 24 ? fromRaw : 0;
  const toBar = Number.isInteger(toRaw) && toRaw >= fromBar && toRaw <= 24 ? toRaw : 0;
  const totalRaw = Number(item.totalBars);
  const totalBars =
    Number.isInteger(totalRaw) && totalRaw >= 1 && totalRaw <= 24 ? totalRaw : undefined;
  const medianRaw = Number(item.medianOffsetMs);
  const medianOffsetMs =
    Number.isFinite(medianRaw) && Math.abs(medianRaw) <= 200 ? Math.round(medianRaw * 10) / 10 : 0;
  // 前后半段（v0.148.0）：老记录没有，缺了就当没有
  const half = (value: unknown): number | undefined => {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= 200 ? Math.round(number * 10) / 10 : undefined;
  };
  const medianFirstHalfMs = half(item.medianFirstHalfMs);
  const medianSecondHalfMs = half(item.medianSecondHalfMs);
  // 录音（v0.149.0）：只认 data:audio/ 开头的短串，超大的一律不要
  const audio =
    typeof item.audio === "string" && item.audio.startsWith("data:audio/") && item.audio.length <= AUDIO_MAX_CHARS
      ? item.audio
      : undefined;
  // 逐拍偏差（v0.150.0）：只用来画参考线，整数毫秒、最多 64 拍
  const offsets = Array.isArray(item.offsets)
    ? item.offsets
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && Math.abs(value) <= 500)
        .map((value) => Math.round(value))
        .slice(0, 64)
    : [];
  // 第一下点击声的位置（v0.151.0）：波形上要靠它把节拍器画在真实的位置
  const originRaw = Number(item.originMs);
  const originMs =
    Number.isFinite(originRaw) && originRaw >= 0 && originRaw <= 10_000 ? Math.round(originRaw) : undefined;
  return {
    id: item.id,
    date: item.date,
    bpm,
    bars: Number.isFinite(bars) && bars > 0 ? Math.round(bars) : 4,
    ...(fromBar && toBar ? { fromBar, toBar } : {}),
    ...(totalBars ? { totalBars } : {}),
    stdevMs: Math.round(stdevMs * 10) / 10,
    meanAbsMs: Number.isFinite(meanAbsMs) ? Math.round(meanAbsMs * 10) / 10 : 0,
    driftMsPerBeat: Number.isFinite(driftMsPerBeat) ? Math.round(driftMsPerBeat * 10) / 10 : 0,
    hits: Number.isFinite(hits) && hits > 0 ? Math.round(hits) : 0,
    ...(medianOffsetMs ? { medianOffsetMs } : {}),
    ...(medianFirstHalfMs !== undefined ? { medianFirstHalfMs } : {}),
    ...(medianSecondHalfMs !== undefined ? { medianSecondHalfMs } : {}),
    ...(audio ? { audio } : {}),
    ...(offsets.length ? { offsets } : {}),
    ...(originMs !== undefined ? { originMs } : {}),
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
  // 录音只留最近几遍（v0.149.0）：一条几十 KB，留多了会把 5MB 的本地存储写爆
  const keep = new Set(runs.slice(-AUDIO_RUNS).map((run) => run.id));
  const trimmed = runs.map((run) => (run.audio && !keep.has(run.id) ? { ...run, audio: undefined } : run));
  try {
    if (trimmed.length === 0) window.localStorage.removeItem(STEADY_KEY);
    else window.localStorage.setItem(STEADY_KEY, JSON.stringify(trimmed));
  } catch {
    // 存不下就算了，别让一次练习因为配额报错整块崩掉
  }
}

/** 把录下来的那一段挂到某一遍上（v0.149.0）：MediaRecorder 收尾是异步的，记录先落、录音后补 */
export function attachAudio(runId: string, audio: string): void {
  if (!audio.startsWith("data:audio/") || audio.length > AUDIO_MAX_CHARS) return;
  const runs = loadRuns().map((run) => (run.id === runId ? { ...run, audio } : run));
  persist(runs);
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

/** 录音的扩展名跟着 mime 走（v0.150.0）：Chrome 录 webm、Safari 录 mp4，别都写成 .webm */
export function audioExtOf(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return "wav";
}

/** 存录音 / 存说明只要这几样：面板上「同速那一遍」手里没有完整的 SteadyRun */
export interface AudioSource {
  audio?: string;
  date: string;
  bpm: number;
  stdevMs: number;
  bars?: number;
  fromBar?: number;
  toBar?: number;
  totalBars?: number;
  meanAbsMs?: number;
  driftMsPerBeat?: number;
  hits?: number;
  medianOffsetMs?: number;
  medianFirstHalfMs?: number;
  medianSecondHalfMs?: number;
  offsets?: number[];
}

/** 一份说明文件（v0.151.0）：音频本身带不了元信息，就并排放一个 .md
 *  v0.152.0：有录音就把波形缩略图内嵌进去（canvas → PNG data URL），一个文件带图 */
export async function runMetaMarkdown(run: AudioSource): Promise<string> {
  const range =
    run.fromBar && run.toBar ? `第 ${run.fromBar}–${run.toBar} 小节` : `整段 ${run.bars ?? 4} 小节`;
  const lines = [
    `# 稳不稳 · ${run.date} · ${run.bpm} BPM`,
    "",
    `- 范围：${range}${run.totalBars ? `（整段共 ${run.totalBars} 小节）` : ""}`,
    `- 标准差：±${run.stdevMs.toFixed(1)} 毫秒（越小越稳）`,
  ];
  // 缩略波形（v0.152.0）：解码不出来就只是少一张图，说明文字照旧
  const thumb = run.audio ? await wavePngDataUrl(run.audio) : null;
  if (thumb) {
    lines.push("", `![这一遍的波形](${thumb})`);
  }
  if (run.meanAbsMs !== undefined) lines.push(`- 平均绝对偏差：${run.meanAbsMs.toFixed(1)} 毫秒`);
  if (run.driftMsPerBeat !== undefined) {
    lines.push(`- 每拍漂移：${run.driftMsPerBeat >= 0 ? "+" : ""}${run.driftMsPerBeat.toFixed(1)} 毫秒/拍`);
  }
  if (run.hits !== undefined) lines.push(`- 踩到的拍：${run.hits} 下`);
  if (run.medianOffsetMs !== undefined) {
    lines.push(
      `- 整体方向：${run.medianOffsetMs <= -8 ? `抢 ${Math.abs(run.medianOffsetMs).toFixed(0)} 毫秒` : run.medianOffsetMs >= 8 ? `拖 ${run.medianOffsetMs.toFixed(0)} 毫秒` : "基本在拍上"}`,
    );
  }
  if (run.medianFirstHalfMs !== undefined && run.medianSecondHalfMs !== undefined) {
    lines.push(
      `- 前半段 / 后半段：${run.medianFirstHalfMs.toFixed(0)} / ${run.medianSecondHalfMs.toFixed(0)} 毫秒`,
    );
  }
  if (run.offsets?.length) {
    lines.push("", `## 每一拍（负=抢，正=拖，毫秒）`, "", run.offsets.join("、"));
  }
  lines.push("", "> 由 Guitar Lab「稳不稳」导出；录音是麦克风原声，只在本地。");
  return `${lines.join("\n")}\n`;
}

/** 下载一段文本（v0.151.0）：说明文件靠它 */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 把这一遍的录音存成文件（v0.150.0）：data URL → Blob → 点一下临时链接 */
export function downloadAudio(run: AudioSource): boolean {
  if (!run.audio) return false;
  const [head, body] = run.audio.split(",");
  if (!head || !body) return false;
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? "audio/webm";
  try {
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `稳不稳-${run.date}-${run.bpm}BPM-${Math.round(run.stdevMs)}ms.${audioExtOf(mime)}`;
    document.body.append(link);
    link.click();
    link.remove();
    // 给浏览器一点时间去拿这个 blob，再回收
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch {
    return false;
  }
}
