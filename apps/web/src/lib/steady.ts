/**
 * 「稳不稳」的练习记录：只留最近 24 次，够画一条趋势线、够知道最好的一次。
 *
 * 存的是**标准差**（越小越稳），不是 BPM——这项练的不是速度，是「每一拍都不抢不拖」。
 */
import { waveClipWavDataUrl, waveComparePngDataUrl, wavePngDataUrl } from "./wave";

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

/**
 * 「循环听」的流水（v0.156.0）：转了几轮自动停，就记一条。
 *
 * 跟 SteadyRun 分开存：那一条记的是「这一遍弹得稳不稳」，这里记的是「这一段我循环了多久」，
 * 没有录音、没有标准差，只有范围、速度、轮数——几十字节一条，可以多留一些。
 */
export const LOOPS_KEY = "guitar.steady.loops.v1";
export const MAX_LOOPS = 40;

export interface LoopEntry {
  id: string;
  /** 哪天（YYYY-MM-DD） */
  date: string;
  /** 几点（HH:mm） */
  at: string;
  bpm: number;
  fromBar: number;
  toBar: number;
  rounds: number;
  /** 这一遍录音的标准差（v0.160.0，没录就没有） */
  stdevMs?: number;
  /** 和同速上一遍比稳了多少（v0.160.0，正=稳了，负=散了） */
  deltaMs?: number;
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseLoop(value: unknown): LoopEntry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  const bpm = Number(item.bpm);
  const fromBar = Number(item.fromBar);
  const toBar = Number(item.toBar);
  const rounds = Number(item.rounds);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 200) return null;
  if (!Number.isInteger(fromBar) || fromBar < 1 || fromBar > 24) return null;
  if (!Number.isInteger(toBar) || toBar < fromBar || toBar > 24) return null;
  if (!Number.isFinite(rounds) || rounds < 1 || rounds > 99) return null;
  const date = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : "";
  if (!date) return null;
  const at = typeof item.at === "string" && /^\d{2}:\d{2}$/.test(item.at) ? item.at : "00:00";
  const stdevRaw = Number(item.stdevMs);
  const stdevMs =
    Number.isFinite(stdevRaw) && stdevRaw > 0 && stdevRaw <= 500
      ? Math.round(stdevRaw * 10) / 10
      : undefined;
  const deltaRaw = Number(item.deltaMs);
  const deltaMs =
    Number.isFinite(deltaRaw) && Math.abs(deltaRaw) <= 500
      ? Math.round(deltaRaw * 10) / 10
      : undefined;
  return {
    id: item.id,
    date,
    at,
    bpm: Math.round(bpm),
    fromBar,
    toBar,
    rounds: Math.round(rounds),
    ...(stdevMs !== undefined ? { stdevMs } : {}),
    ...(deltaMs !== undefined ? { deltaMs } : {}),
  };
}

export function loadLoops(): LoopEntry[] {
  try {
    const raw = window.localStorage.getItem(LOOPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseLoop)
      .filter((item): item is LoopEntry => item !== null)
      .slice(-MAX_LOOPS);
  } catch {
    return [];
  }
}

function persistLoops(loops: LoopEntry[]): void {
  try {
    if (loops.length === 0) window.localStorage.removeItem(LOOPS_KEY);
    else window.localStorage.setItem(LOOPS_KEY, JSON.stringify(loops));
  } catch {
    // 存不下就算了
  }
}

/** 记一条「这一段循环了几轮」；返回记完之后的全部（面板直接拿来渲染） */
export function pushLoop(input: {
  bpm: number;
  fromBar: number;
  toBar: number;
  rounds: number;
  stdevMs?: number;
  deltaMs?: number;
}): LoopEntry[] {
  const now = new Date();
  const entry: LoopEntry = {
    id: `loop-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    date: dateKey(now),
    at: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    bpm: Math.round(input.bpm),
    fromBar: Math.round(input.fromBar),
    toBar: Math.round(input.toBar),
    rounds: Math.round(input.rounds),
    ...(Number.isFinite(input.stdevMs) && (input.stdevMs ?? 0) > 0
      ? { stdevMs: Math.round((input.stdevMs as number) * 10) / 10 }
      : {}),
    ...(Number.isFinite(input.deltaMs)
      ? { deltaMs: Math.round((input.deltaMs as number) * 10) / 10 }
      : {}),
  };
  const next = [...loadLoops(), entry].slice(-MAX_LOOPS);
  persistLoops(next);
  return next;
}

/** 同速、在这之前最近的一遍（v0.156.0）：说明文件里拿它当对照 */
export function compareRunOf(
  run: { id: string; bpm: number; date: string },
  runs: SteadyRun[] = loadRuns(),
): SteadyRun | undefined {
  return [...runs].reverse().find((item) => item.id !== run.id && item.bpm === run.bpm && item.date <= run.date);
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
  /** 第一下点击声在录音里的位置（毫秒，v0.153.0）：缩略波形上标节拍线要对齐 */
  originMs?: number;
}

/** 录音文件叫什么（v0.157.0）：说明文件里要写清「哪一遍存成了哪个文件」，跟下载时保持一致 */
export function audioFileName(run: { date: string; bpm: number; stdevMs: number; audio?: string }): string {
  const mime = run.audio ? (/data:([^;,]+)/.exec(run.audio)?.[1] ?? "audio/webm") : "audio/webm";
  return `稳不稳-${run.date}-${run.bpm}BPM-${Math.round(run.stdevMs)}ms.${audioExtOf(mime)}`;
}

/**
 * 偏得最多的三拍落在录音的哪一段（秒，v0.159.0）：
 * 说明文件里的放大图、裁出来的小音频都用它，免得两处算得不一样。
 */
export function worstWindowOf(run: {
  offsets?: number[];
  bpm: number;
  originMs?: number;
}): { from: number; to: number } | null {
  if (!run.offsets?.length) return null;
  const top = run.offsets
    .map((offset, index) => ({ offset, index }))
    .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
    .slice(0, 3);
  if (top.length === 0) return null;
  const beatSeconds = 60 / Math.max(1, run.bpm);
  const times = top.map(
    (item) => (run.originMs ?? 0) / 1000 + item.index * beatSeconds + item.offset / 1000,
  );
  return { from: Math.max(0, Math.min(...times) - 0.3), to: Math.max(...times) + 0.3 };
}

/** 这三拍单独裁成一小段 WAV（v0.159.0）：和 Markdown 一起下载，点开就听 */
export async function worstClipOf(
  run: AudioSource,
): Promise<{ name: string; dataUrl: string } | null> {
  if (!run.audio) return null;
  const window = worstWindowOf(run);
  if (!window) return null;
  const dataUrl = await waveClipWavDataUrl(run.audio, window);
  if (!dataUrl) return null;
  return { name: `稳不稳-${run.date}-${run.bpm}BPM-worst.wav`, dataUrl };
}

/** 一份说明文件（v0.151.0）：音频本身带不了元信息，就并排放一个 .md
 *  v0.152.0：有录音就把波形缩略图内嵌进去（canvas → PNG data URL），一个文件带图
 *  v0.156.0：带上「同速的上一遍」时，多一节对照数字
 *  v0.157.0：两遍各自存成的音频文件名也写进去（对着文件夹找）
 *  v0.159.0：`clipName` 给了就写一句「三拍的片段存成了哪个文件」 */
export async function runMetaMarkdown(
  run: AudioSource,
  compare?: AudioSource,
  clipName?: string,
): Promise<string> {
  const rangeOf = (item: AudioSource) =>
    item.fromBar && item.toBar ? `第 ${item.fromBar}–${item.toBar} 小节` : `整段 ${item.bars ?? 4} 小节`;
  const range = rangeOf(run);
  const lines = [
    `# 稳不稳 · ${run.date} · ${run.bpm} BPM`,
    "",
    `- 范围：${range}${run.totalBars ? `（整段共 ${run.totalBars} 小节）` : ""}`,
    `- 标准差：±${run.stdevMs.toFixed(1)} 毫秒（越小越稳）`,
  ];
  if (run.audio) lines.push(`- 录音文件：${audioFileName(run)}`);
  // 偏得最多的三拍（v0.154.0）：文字里点一句；v0.158.0 还给这三拍单独裁一条波形
  const top = (run.offsets ?? [])
    .map((offset, index) => ({ offset, index }))
    .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
    .slice(0, 3);
  // 缩略波形（v0.152.0；v0.153.0 把节拍线和落点也标在图上）：解不出来就只是少一张图，说明文字照旧
  const thumb = run.audio
    ? await wavePngDataUrl(run.audio, {
        offsets: run.offsets ?? [],
        bpm: run.bpm,
        originMs: run.originMs ?? 0,
      })
    : null;
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
  // 和同速的上一遍对照（v0.156.0）：光说「这次 ±9」不知道是好是坏，摆在一起才有意义。
  // 放到最后单独一节，免得把上面那串「这一遍」的要点打断
  const compareLines: string[] = [];
  if (compare) {
    const diff = compare.stdevMs - run.stdevMs;
    const verdict =
      diff >= 1 ? `稳了 ${diff.toFixed(1)} 毫秒` : diff <= -1 ? `散了 ${Math.abs(diff).toFixed(1)} 毫秒` : "差不多稳";
    compareLines.push("", "## 和同速的上一遍比（v0.156.0）", "");
    compareLines.push(
      `- 上一遍：${compare.date} · ${compare.bpm} BPM · ${rangeOf(compare)} · ±${compare.stdevMs.toFixed(1)} 毫秒`,
    );
    compareLines.push(`- 这一遍：${run.date} · ±${run.stdevMs.toFixed(1)} 毫秒 → ${verdict}`);
    if (compare.audio) compareLines.push(`- 上一遍的录音：${audioFileName(compare)}`);
    if (run.meanAbsMs !== undefined && compare.meanAbsMs !== undefined) {
      compareLines.push(
        `- 平均绝对偏差：这次 ${run.meanAbsMs.toFixed(1)} / 上次 ${compare.meanAbsMs.toFixed(1)} 毫秒`,
      );
    }
    if (
      run.medianFirstHalfMs !== undefined &&
      run.medianSecondHalfMs !== undefined &&
      compare.medianFirstHalfMs !== undefined &&
      compare.medianSecondHalfMs !== undefined
    ) {
      compareLines.push(
        `- 前半段 / 后半段：这次 ${run.medianFirstHalfMs.toFixed(0)} / ${run.medianSecondHalfMs.toFixed(0)} 毫秒，` +
          `上次 ${compare.medianFirstHalfMs.toFixed(0)} / ${compare.medianSecondHalfMs.toFixed(0)} 毫秒`,
      );
    }
  }
  if (run.offsets?.length) {
    const worst = top.map(
      (item) => `第 ${item.index + 1} 拍${item.offset < 0 ? "抢" : "拖"} ${Math.abs(item.offset)} 毫秒`,
    );
    lines.push(`- 偏得最多的三拍：${worst.join("、")}`);
    // 这三拍单独裁一条波形（v0.158.0）；v0.160.0 改成「左边整段框出位置 + 右边放大」并排
    const window = worstWindowOf(run);
    if (run.audio && window) {
      const worstThumb = await waveComparePngDataUrl(run.audio, {
        from: window.from,
        to: window.to,
        offsets: run.offsets,
        bpm: run.bpm,
        originMs: run.originMs ?? 0,
      });
      if (worstThumb) {
        lines.push("", `![偏得最多的三拍：左边是整段里的位置，右边是放大](${worstThumb})`);
      }
    }
    // 这三拍还能单独存成一小段音频（v0.159.0）：说明文件里先写清名字
    if (clipName) lines.push(`- 偏得最多的三拍录音：${clipName}`);
    // 下次练什么（v0.155.0）：把上面这几拍翻成一句能照着做的话
    const late = top.filter((item) => item.offset > 8).length;
    const early = top.filter((item) => item.offset < -8).length;
    const bars = top.map((item) => `第 ${item.index + 1} 拍`).join("、");
    const values = top.map((item) => Math.abs(item.offset)).join(" / ");
    if (late >= 2) {
      lines.push(
        `- 下次练：${bars}偏拖（${values} 毫秒）——数到这几拍时手早点动、往前顶一点，别等拍子落下来再动。`,
      );
    } else if (early >= 2) {
      lines.push(
        `- 下次练：${bars}偏抢（${values} 毫秒）——按住一点，让音落在拍子后面一点点，不用赶在拍子前面。`,
      );
    } else {
      lines.push(`- 下次练：这几拍基本在拍上，保持这个感觉，可以试着再快 5 BPM 看看还稳不稳。`);
    }
    lines.push("", `## 每一拍（负=抢，正=拖，毫秒）`, "", run.offsets.join("、"));
  }
  lines.push(...compareLines);
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

/** 把一段 data URL 存成文件（v0.159.0）：整段录音、裁出来的三拍片段都走这里 */
export function downloadDataUrl(name: string, dataUrl: string): boolean {
  const [head, body] = dataUrl.split(",");
  if (!head || !body) return false;
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? "application/octet-stream";
  try {
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
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

/** 把这一遍的录音存成文件（v0.150.0）：data URL → Blob → 点一下临时链接 */
export function downloadAudio(run: AudioSource): boolean {
  if (!run.audio) return false;
  return downloadDataUrl(audioFileName(run), run.audio);
}
