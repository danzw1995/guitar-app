import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeTiming, detectOnsets, type TimingReport } from "@guitar/core";
import { recordRun, loadRuns, bestRun, attachAudio, downloadAudio, downloadDataUrl, downloadText, runMetaMarkdown, worstClipOf, compareRunOf, loadLoops, pushLoop, STEADY_EVENT, type SteadyRun, type LoopEntry } from "../lib/steady";
import { loadRhythm, loadSettings, saveRhythm, saveSettings } from "../lib/storage";
import { parseHash } from "../lib/nav";
import BeatRuler from "./BeatRuler";
import WaveRuler from "./WaveRuler";

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

const MAX_SECONDS = 30;
const LEAD_IN = 0.45;
const BAR_BEATS = 4;

function clickAt(ctx: AudioContext, at: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = accent ? 1560 : 1180;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(accent ? 0.22 : 0.13, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.08);
}

/**
 * 「整体偏哪边」（v0.147.0）：偏差中位数在 ±8 毫秒以内算基本在拍上，
 * 负数是抢在节拍器前面、正数是拖在后面——标准差说不清方向，这一句补上。
 */
function sideText(medianOffsetMs: number | undefined): string {
  const value = medianOffsetMs ?? 0;
  if (Math.abs(value) <= 8) return "基本在拍上";
  return value < 0 ? `偏抢 ${Math.round(-value)} 毫秒` : `偏拖 ${Math.round(value)} 毫秒`;
}

/**
 * 前半段 / 后半段各自偏哪边（v0.148.0）：整体中位数会把「前半抢、后半拖」抵成 0，
 * 而「越弹越退」恰恰是要单独说出来的那种毛病。
 */
function halvesText(firstHalfMs: number, secondHalfMs: number): string {
  const gap = secondHalfMs - firstHalfMs;
  const drift = Math.abs(gap) > 10 && Math.abs(firstHalfMs) > 8 && Math.abs(secondHalfMs) > 8;
  const tail = drift ? (gap > 0 ? "——越弹越拖" : "——越弹越抢") : "";
  return `前半${sideText(firstHalfMs)}、后半${sideText(secondHalfMs)}${tail}`;
}

export default function Steady() {
  // 记住上次的速度与小节数：每次打开都要重填，练同一段时很烦
  const initial = loadSettings();
  /**
   * 从统计页那枚「按这个速度再弹一遍」带过来的种子（`#practice/steady?sb=80&sbar=4`）。
   * 读一次就好——挂载时的 hash 就是全部依据。
   */
  const seeded = useMemo(() => {
    const query = parseHash(window.location.hash)?.query ?? {};
    const bpmValue = Number(query.sb);
    const barsValue = Number(query.sbar);
    const bars = [2, 4, 6, 8].includes(barsValue) ? barsValue : null;
    // 绝对小节号（v0.148.0）：双击「只弹 2–3 小节」那条线时带过来，落地就是 2 到 3 而不是 1 到 2
    const fromValue = Number(query.sfrom);
    const toValue = Number(query.sto);
    const fromBar =
      Number.isInteger(fromValue) && fromValue >= 1 && fromValue <= (bars ?? 8) ? fromValue : null;
    const toBar =
      Number.isInteger(toValue) && toValue >= (fromBar ?? 1) && toValue <= (bars ?? 8) ? toValue : null;
    // 从统计页「长按循环流水那一行」过来会带 srounds=N：循环轮数直接用那组上次的轮数（v0.159.0）
    const roundsValue = Number(query.srounds);
    return {
      bpm: Number.isFinite(bpmValue) && bpmValue >= 40 && bpmValue <= 200 ? Math.round(bpmValue) : null,
      bars,
      fromBar,
      toBar,
      rounds:
        Number.isInteger(roundsValue) && roundsValue >= 1 && roundsValue <= 99 ? roundsValue : null,
      // 从统计页双击过来的会带 auto=1：等三秒自动开弹（v0.147.0）
      auto: query.auto === "1" || query.auto === "true",
    };
  }, []);
  // 上次弹的是哪几小节，下次进来还是那几小节（v0.149.0）：磨同一段时不用每次重选
  const lastRun = useMemo(() => loadRuns().slice(-1)[0], []);
  const lastBars =
    lastRun?.totalBars && [2, 4, 6, 8].includes(lastRun.totalBars) ? lastRun.totalBars : null;
  const [bpm, setBpm] = useState(seeded.bpm ?? initial.steadyBpm);
  const [bars, setBars] = useState(seeded.bars ?? lastBars ?? initial.steadyBars);
  // 只弹、只判其中几小节（v0.143.0）：默认整段
  const [fromBar, setFromBar] = useState(seeded.fromBar ?? lastRun?.fromBar ?? 1);
  const [toBar, setToBar] = useState(
    seeded.toBar ?? lastRun?.toBar ?? seeded.bars ?? lastBars ?? initial.steadyBars,
  );
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [report, setReport] = useState<TimingReport | null>(null);
  // 第一下点击声在录音里的位置（v0.151.0）：TimingReport 里没有这个，单独记一份给波形用
  const [originMs, setOriginMs] = useState<number | null>(null);
  // 在波形上拖出来的那几拍（v0.152.0）——面板只认小节，所以换算出小节号再说明一句
  const [pickNote, setPickNote] = useState("");
  /** 拖选出来的拍区间（v0.153.0）：循环听这一小段要用 */
  const [pickBeats, setPickBeats] = useState<{ from: number; to: number } | null>(null);
  const [looping, setLooping] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 点落点差听那一拍附近：放两秒就停，别跟循环/录音抢（v0.157.0）
  const seekTimer = useRef<number | null>(null);
  /** 叠在波形后面的那条，选最稳的一遍还是同速的上一遍（v0.153.0） */
  const [ghostMode, setGhostMode] = useState<"best" | "same" | "off">("best");
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<SteadyRun[]>(() => loadRuns());
  const [justSaved, setJustSaved] = useState(false);

  // 录下这一遍（v0.149.0）：默认不录（一条几十 KB，只留最近 3 遍），开了才向麦克风要录音
  const [audioOn, setAudioOn] = useState(false);
  const [audioNote, setAudioNote] = useState("");
  const [lastAudio, setLastAudio] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunks = useRef<Blob[]>([]);
  const pendingAudio = useRef<string | null>(null);
  const pendingRunId = useRef<string | null>(null);

  const linkedRef = useRef<string | null>(null);
  const [linkedNote, setLinkedNote] = useState("");

  // 同页喂参数：练习页那条「顺手弹一遍」不用换页，直接改这组数
  useEffect(() => {
    function onSeed(event: Event): void {
      const detail = (event as CustomEvent<{ bpm?: number; bars?: number; id?: string }>).detail ?? {};
      linkedRef.current = typeof detail.id === "string" && detail.id ? detail.id : null;
      setLinkedNote("");
      if (Number.isFinite(detail.bpm) && detail.bpm! >= 40 && detail.bpm! <= 200) {
        setBpm(Math.round(detail.bpm!));
      }
      if (detail.bars && [2, 4, 6, 8].includes(detail.bars)) {
        setBars(detail.bars);
        setFromBar(1);
        setToBar(detail.bars);
      }
      document.getElementById("steady")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    window.addEventListener(STEADY_EVENT, onSeed);
    return () => window.removeEventListener(STEADY_EVENT, onSeed);
  }, []);

  // 小节数调小了，区间跟着收回来，别停在「第 7 小节」这种不存在的位置
  useEffect(() => {
    setFromBar((value) => Math.min(value, bars));
    setToBar((value) => Math.min(value, bars));
  }, [bars]);

  // 种子只用一次：留着 `?sb=&sbar=`，刷新会又把它盖回上次存的值
  useEffect(() => {
    if (seeded.bpm === null && seeded.bars === null && !seeded.auto && seeded.fromBar === null) return;
    if (window.location.hash !== "#practice/steady") {
      window.history.replaceState(null, "", "#practice/steady");
    }
  }, [seeded]);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const framesRef = useRef(0);
  const startRef = useRef(0);
  const clickRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /**
   * 先听一遍同速的节拍（v0.145.0）：没有录音可放，所以放的是那次的速度——
   * 耳朵先对上「这个速度大概多快」，再听自己这次有没有跟上。
   */
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<AudioContext | null>(null);
  const previewTimer = useRef<number | null>(null);
  const stopPreview = useCallback(() => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    const ctx = previewRef.current;
    previewRef.current = null;
    if (ctx) void ctx.close().catch(() => {});
    setPreviewing(false);
  }, []);
  useEffect(() => stopPreview, [stopPreview]);
  /** 循环听的时候配一串点击声（v0.154.0）：录音在放，节拍器也得在，否则没有参照拍 */
  const loopCtxRef = useRef<AudioContext | null>(null);
  const stopLoopClicks = useCallback(() => {
    const ctx = loopCtxRef.current;
    loopCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => {});
  }, []);
  useEffect(() => stopLoopClicks, [stopLoopClicks]);
  const scheduleLoopClicks = useCallback(
    (range: { from: number; to: number }, speed: number, firstBeat: number) => {
      stopLoopClicks();
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      loopCtxRef.current = ctx;
      const beatSeconds = 60 / Math.max(40, speed);
      const count = Math.max(1, Math.round((range.to - range.from) / beatSeconds));
      const startAt = ctx.currentTime + 0.05;
      for (let index = 0; index < count; index += 1) {
        clickAt(ctx, startAt + index * beatSeconds, (firstBeat + index) % BAR_BEATS === 0);
      }
    },
    [stopLoopClicks],
  );
  /** 按给定速度排一串点击声（v0.148.0：倒计时那三秒也用它，落地就能对上速度） */
  const previewBeats = useCallback(
    async (beatCount: number, speed: number, mark?: boolean) => {
      stopPreview();
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      await ctx.resume();
      previewRef.current = ctx;
      const interval = 60 / speed;
      const beats = Math.max(2, Math.round(beatCount)) + 1;
      const startAt = ctx.currentTime + 0.15;
      for (let index = 0; index < beats; index += 1) {
        clickAt(ctx, startAt + interval * index, index % BAR_BEATS === 0);
      }
      if (mark) setPreviewing(true);
      previewTimer.current = window.setTimeout(
        () => {
          if (mark) stopPreview();
          else {
            const current = previewRef.current;
            previewRef.current = null;
            if (current) void current.close().catch(() => {});
          }
        },
        Math.ceil(((beats - 1) * interval + 0.35) * 1000),
      );
    },
    [stopPreview],
  );
  const previewSame = useCallback(async () => {
    const spanBars = Math.max(1, Math.min(toBar, bars) - Math.max(1, fromBar) + 1);
    await previewBeats(spanBars * BAR_BEATS, bpm, true);
  }, [bars, bpm, fromBar, previewBeats, toBar]);

  const start = useCallback(async () => {
    cleanup();
    const spanBars = Math.max(1, Math.min(toBar, bars) - Math.max(1, fromBar) + 1);
    setReport(null);
    setOriginMs(null);
    setPickNote("");
    setPickBeats(null);
    setLooping(false);
    audioRef.current?.pause();
    setError("");
    setJustSaved(false);
    // 开跑就把这组设置记下来，下次进来还是这一组
    saveSettings({ ...loadSettings(), steadyBpm: bpm, steadyBars: bars });
    setElapsed(0);
    chunksRef.current = [];
    framesRef.current = 0;
    clickRef.current = [];
    setAudioNote("");
    setLastAudio("");
    pendingAudio.current = null;
    pendingRunId.current = null;

    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new Ctor();
      await ctx.resume();
      streamRef.current = stream;
      ctxRef.current = ctx;

      // 开了「录下这一遍」才录：MediaRecorder 不在就安静地退回不录
      if (audioOn && typeof MediaRecorder !== "undefined") {
        recorderChunks.current = [];
        const options: MediaRecorderOptions = {};
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options.mimeType = "audio/webm;codecs=opus";
        }
        try {
          const recorder = new MediaRecorder(stream, options);
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) recorderChunks.current.push(event.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(recorderChunks.current, { type: recorder.mimeType || "audio/webm" });
            recorderChunks.current = [];
            if (blob.size === 0) return;
            const reader = new FileReader();
            reader.onloadend = () => {
              const data = typeof reader.result === "string" ? reader.result : "";
              if (!data) return;
              const runId = pendingRunId.current;
              pendingRunId.current = null;
              if (!runId) {
                // 记录还没落盘：先攥着，等 stop() 里拿到 id 再挂上去
                pendingAudio.current = data;
                return;
              }
              attachAudio(runId, data);
              setLastAudio(data);
              setAudioNote("这一遍录下来了");
              setRuns(loadRuns());
            };
            reader.readAsDataURL(blob);
          };
          recorder.start();
          recorderRef.current = recorder;
        } catch {
          recorderRef.current = null;
        }
      }

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(ctx.destination);
      sourceRef.current = source;
      processorRef.current = processor;
      startRef.current = ctx.currentTime + LEAD_IN;

      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
        framesRef.current += data.length;
      };

      const interval = 60 / bpm;
      const beats = spanBars * BAR_BEATS + 1;
      for (let index = 0; index < beats; index += 1) {
        const at = startRef.current + interval * index;
        clickRef.current.push(at);
        clickAt(ctx, at, index % BAR_BEATS === 0);
      }

      setPhase("listening");
      const began = performance.now();
      timerRef.current = window.setInterval(() => {
        const seconds = (performance.now() - began) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 200);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      cleanup();
      if (name === "NotAllowedError" || name === "SecurityError") setPhase("denied");
      else if (name === "NotFoundError") setError("没找到麦克风：插上耳机麦，或者换台机器。");
      else {
        setPhase("error");
        setError(cause instanceof Error ? cause.message : "打不开麦克风。");
      }
    }
    // stop 在下面定义，这里通过 ref 调用；写成函数提升会让依赖数组抖动
  }, [audioOn, bars, bpm, cleanup, fromBar, toBar]);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    const frames = framesRef.current;
    const clicks = clickRef.current;
    const sampleRate = ctx?.sampleRate ?? 48000;
    const now = ctx?.currentTime ?? 0;

    // 先把录音收掉，再 cleanup（cleanup 会把音轨关掉，MediaRecorder 就没戏了）
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // 已经停了就算了
      }
    }

    cleanup();
    setPhase("idle");
    setElapsed(0);

    if (frames < sampleRate * 0.5 || chunks.length === 0) {
      setError("这段太短了：跟着节拍器弹满四小节再点停。");
      return;
    }

    const all = new Float32Array(frames);
    let cursor = 0;
    for (const chunk of chunks) {
      all.set(chunk.subarray(0, Math.min(chunk.length, frames - cursor)), cursor);
      cursor += chunk.length;
      if (cursor >= frames) break;
    }

    const recordStart = now - frames / sampleRate;
    const origin = clicks.length > 0 ? clicks[0] - recordStart : 0;

    const startBar = Math.max(1, Math.min(fromBar, bars));
    const endBar = Math.max(startBar, Math.min(toBar, bars));
    const spanBars = endBar - startBar + 1;
    setRange({ from: startBar, to: endBar });

    const onsets = detectOnsets(all, sampleRate);
    const next = analyzeTiming(onsets, bpm, { beatsPerBar: BAR_BEATS, origin });
    if (!next) {
      setError("听得不太清：换个安静点的地方，或者把音量弹大一点再来一遍。");
      return;
    }
    // 从存储里读，别用 state：这个回调的依赖里没有 runs，闭包里那份是挂载时的空数组
    const history = loadRuns();
    const previous = history.slice(-1)[0];
    // 同速的上一遍（v0.144.0）：先找「同样速度、同样只弹这一小段」的，那才是真能对照的
    // （v0.146.0：把当时弹的是哪几小节也带出来，对照时说得清）
    const sameRange = (item: SteadyRun): boolean =>
      (item.fromBar ?? 1) === startBar && (item.toBar ?? item.bars) === endBar;
    const sameRun =
      [...history].reverse().find((item) => item.bpm === bpm && sameRange(item)) ??
      [...history].reverse().find((item) => item.bpm === bpm);
    setReport(next);
    setOriginMs(Math.round(origin * 1000));
    setDelta(previous ? previous.stdevMs - next.stdevMs : null);
    setSame(
      sameRun
        ? {
            stdevMs: sameRun.stdevMs,
            date: sameRun.date,
            fromBar: sameRun.fromBar,
            toBar: sameRun.toBar,
            bars: sameRun.bars,
            sameRange: sameRange(sameRun),
            medianOffsetMs: sameRun.medianOffsetMs,
            meanAbsMs: sameRun.meanAbsMs,
            medianFirstHalfMs: sameRun.medianFirstHalfMs,
            medianSecondHalfMs: sameRun.medianSecondHalfMs,
            // 同速那一遍如果录过，直接放给人听（v0.149.0）
            audio: sameRun.audio,
          }
        : null,
    );
    const saved = recordRun({
      date: new Date().toISOString().slice(0, 10),
      bpm,
      bars: spanBars,
      fromBar: startBar,
      toBar: endBar,
      // 那一遍整段是几小节（v0.148.0）：只弹 2–3 时 bars 只有 2，重弹要还原面板档位
      totalBars: bars,
      stdevMs: next.stdevMs,
      meanAbsMs: next.meanAbsMs,
      driftMsPerBeat: next.driftMsPerBeat,
      hits: next.hits.length,
      medianOffsetMs: next.medianOffsetMs,
      // 前后半段各自的偏早/偏晚（v0.148.0）：统计页分开画
      medianFirstHalfMs: next.medianFirstHalfMs,
      medianSecondHalfMs: next.medianSecondHalfMs,
      // 逐拍落点（v0.150.0）：录音旁边那条参考线靠它画
      offsets: next.offsets.map((offset) => Math.round(offset)),
      // 第一下点击声在录音里的位置（v0.151.0）：波形上要按真实时间标节拍器
      originMs: Math.round(origin * 1000),
    });
    setRuns(saved);
    // 录音是异步收尾的：先记下这一遍的 id，等 onstop 里把 data URL 挂上去（v0.149.0）
    const runId = saved[saved.length - 1]?.id ?? null;
    if (runId) {
      pendingRunId.current = runId;
      if (pendingAudio.current) {
        attachAudio(runId, pendingAudio.current);
        setLastAudio(pendingAudio.current);
        setAudioNote("这一遍录下来了");
        pendingAudio.current = null;
        pendingRunId.current = null;
        setRuns(loadRuns());
      }
    }
    // 从练习页那条进来的，把这次的标准差写回那条练习（v0.142.0）
    const linkId = linkedRef.current;
    if (linkId) {
      const all = loadRhythm();
      const previous = all[linkId];
      const today = new Date().toISOString().slice(0, 10);
      const bestStdev = Math.min(previous?.steadyStdev ?? Number.POSITIVE_INFINITY, next.stdevMs);
      // 只弹某几小节时把区间一起记下（v0.144.0）：统计页要标出「这一遍是只弹 2–3」
      const partial = startBar !== 1 || endBar !== bars;
      const point = {
        date: today,
        bpm,
        stdevMs: Math.round(next.stdevMs * 10) / 10,
        ...(partial ? { fromBar: startBar, toBar: endBar } : {}),
        totalBars: bars,
      };
      const steadyHistory = [
        ...(previous?.steadyHistory ?? []).filter((item) => item.date !== point.date),
        point,
      ]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-24);
      all[linkId] = {
        ...previous,
        bestBpm: previous?.bestBpm ?? 0,
        sessions: previous?.sessions ?? 0,
        minutes: previous?.minutes ?? 0,
        lastAt: previous?.lastAt || today,
        steadyStdev: Math.round(bestStdev * 10) / 10,
        steadyHistory,
      };
      saveRhythm(all);
      setLinkedNote(`已记到这条练习：最稳 ±${Math.round(bestStdev)} 毫秒`);
    }
    setJustSaved(true);
  }, [bpm, bars, cleanup, fromBar, toBar]);

  // 从统计页双击过来：停三秒让人看清速度和「只弹哪几小节」，然后自己开弹（v0.147.0）。
  // 只跑一次：`start` 的依赖一变它就会重建，靠 autoRanRef 挡住。
  const [autoIn, setAutoIn] = useState<number | null>(seeded.auto ? 3 : null);
  const autoRanRef = useRef(false);
  const autoTempoRef = useRef(false);
  useEffect(() => {
    if (autoIn === null || autoRanRef.current) return;
    if (autoIn > 0) {
      // 倒计时一开始先敲一小节同速的点击声：三秒够耳朵挂上这个速度（v0.148.0）
      if (!autoTempoRef.current) {
        autoTempoRef.current = true;
        void previewBeats(BAR_BEATS, bpm);
      }
      const timer = window.setTimeout(
        () => setAutoIn((value) => (value === null ? null : value - 1)),
        1000,
      );
      return () => window.clearTimeout(timer);
    }
    autoRanRef.current = true;
    setAutoIn(null);
    void start();
    return undefined;
  }, [autoIn, bpm, previewBeats, start]);

  const [delta, setDelta] = useState<number | null>(null);
  // 同速的上一遍（v0.144.0）：速度一样才好比，加速之后抖得多一点是正常的
  const [same, setSame] = useState<{
    stdevMs: number;
    date: string;
    fromBar?: number;
    toBar?: number;
    bars: number;
    sameRange: boolean;
    medianOffsetMs?: number;
    meanAbsMs?: number;
    medianFirstHalfMs?: number;
    medianSecondHalfMs?: number;
    /** 同速那一遍的录音（v0.149.0）：录过才有 */
    audio?: string;
  } | null>(null);

  const busy = phase === "starting" || phase === "listening";
  const best = bestRun(runs);
  // 叠影（v0.152.0）：把另一遍的波形淡淡叠在这一次后面；v0.153.0 起能选「最稳的一遍」还是「同速的上一遍」
  const latest = runs[runs.length - 1];
  const sameSpeedRun =
    latest && !busy
      ? [...runs].reverse().find((run) => run.id !== latest.id && run.bpm === latest.bpm && run.audio)
      : undefined;
  const ghostSource =
    ghostMode === "off"
      ? undefined
      : ghostMode === "same"
        ? sameSpeedRun
        : best && latest && best.id !== latest.id
          ? best
          : undefined;
  const ghostLayer =
    lastAudio && ghostSource && ghostSource.audio
      ? {
          audio: ghostSource.audio,
          offsets: (ghostSource.offsets ?? []).map((offset) => Math.round(offset)),
          bpm: ghostSource.bpm,
          originMs: ghostSource.originMs,
        }
      : undefined;
  const ghostChoices: { id: "best" | "same" | "off"; label: string; ready: boolean }[] = [
    { id: "best", label: "最稳的一遍", ready: Boolean(best && latest && best.id !== latest.id && best.audio) },
    { id: "same", label: "同速的上一遍", ready: Boolean(sameSpeedRun) },
    { id: "off", label: "不叠", ready: true },
  ];
  // 循环听拖选的那一小段（v0.153.0）：录音里按时间轴回放；v0.155.0 起可以定几轮，转完自己停
  const [loopRounds, setLoopRounds] = useState(
    // 只认下拉里有的档位，别把 4 这种值塞进 <select>
    seeded.rounds !== null && [0, 2, 3, 5].includes(seeded.rounds) ? seeded.rounds : 3,
  );
  const [loopPass, setLoopPass] = useState(0);
  const passRef = useRef(0);
  const roundsRef = useRef(loopRounds);
  roundsRef.current = loopRounds;
  // 循环听完记一条（v0.156.0）：这一段转了几轮、什么速度——「今天练了几段」看得出量
  const [loops, setLoops] = useState<LoopEntry[]>(() => loadLoops());
  const logLoopRef = useRef<(rounds: number) => void>(() => {});
  logLoopRef.current = (rounds: number) => {
    if (!pickBeats || rounds < 1) return;
    setLoops(
      pushLoop({
        bpm,
        fromBar: Math.floor(pickBeats.from / BAR_BEATS) + 1,
        toBar: Math.floor(pickBeats.to / BAR_BEATS) + 1,
        rounds,
      }),
    );
  };
  // 用秒数（而不是每次渲染新建的对象）当依赖，否则每转一轮 effect 就重来、轮次永远数不到
  const loopBeatMs = 60000 / Math.max(1, bpm);
  const loopFromSec = pickBeats && originMs !== null ? (originMs + pickBeats.from * loopBeatMs) / 1000 : null;
  const loopToSec = pickBeats && originMs !== null ? (originMs + (pickBeats.to + 1) * loopBeatMs) / 1000 : null;
  const loopFirstBeat = pickBeats?.from ?? 0;
  const loopRange = loopFromSec !== null && loopToSec !== null ? { from: loopFromSec, to: loopToSec } : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !looping || loopFromSec === null || loopToSec === null) return;
    // 选的那几拍可能超出录音长度（录音只录到一半）：收进录音范围内，否则放到结尾就卡住不动了
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY;
    const from = Math.max(0, Math.min(loopFromSec, duration - 0.05));
    const to = Math.max(from + 0.2, Math.min(loopToSec, duration));
    const range = { from, to };
    let lastTime = audio.currentTime;
    const firstBeat = loopFirstBeat;
    passRef.current = 1;
    setLoopPass(1);
    scheduleLoopClicks(range, bpm, firstBeat);
    const onTime = () => {
      if (audio.currentTime >= range.to - 0.01 || (Number.isFinite(audio.duration) && audio.ended)) {
        const rounds = roundsRef.current;
        if (rounds > 0 && passRef.current >= rounds) {
          // 转够了：停下来，免得一直响着还得手动按停
          audio.pause();
          stopLoopClicks();
          setLooping(false);
          setLoopPass(0);
          // 转满了几轮就记一条（v0.156.0）：这一段算练过了
          logLoopRef.current(passRef.current);
          passRef.current = 0;
          return;
        }
        audio.currentTime = range.from;
        passRef.current += 1;
        setLoopPass(passRef.current);
        // 跳回开头就把点击声重排一遍：每一轮都从同一拍起，不会越漂越远
        scheduleLoopClicks(range, bpm, firstBeat);
        lastTime = range.from;
        return;
      }
      if (audio.currentTime < lastTime - 0.2) {
        scheduleLoopClicks(range, bpm, firstBeat);
      }
      lastTime = audio.currentTime;
    };
    audio.addEventListener("timeupdate", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      stopLoopClicks();
    };
  }, [bpm, loopFirstBeat, loopFromSec, loopToSec, looping, scheduleLoopClicks, stopLoopClicks]);

  // 点落点差的小字：从那一拍往前 0.4 秒开始放两秒，能直接对着听「差 38 毫秒」是什么感觉
  const playAround = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (looping) {
      audio.pause();
      stopLoopClicks();
      setLooping(false);
      passRef.current = 0;
      setLoopPass(0);
    }
    audio.currentTime = Math.max(0, seconds - 0.4);
    void audio.play().catch(() => {});
    if (seekTimer.current !== null) window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(() => {
      audio.pause();
      seekTimer.current = null;
    }, 2000);
  };

  useEffect(
    () => () => {
      if (seekTimer.current !== null) window.clearTimeout(seekTimer.current);
    },
    [],
  );

  const toggleLoop = () => {
    const audio = audioRef.current;
    if (!audio || !loopRange) return;
    if (looping) {
      audio.pause();
      stopLoopClicks();
      setLooping(false);
      // 手动停：只记已经转完的那几轮（正在转的这一轮不算）
      const done = Math.max(0, passRef.current - 1);
      if (done >= 1) logLoopRef.current(done);
      passRef.current = 0;
      setLoopPass(0);
      return;
    }
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : loopRange.to;
    audio.currentTime = Math.max(0, Math.min(loopRange.from, duration - 0.05));
    void audio.play().catch(() => setLooping(false));
    setLooping(true);
  };

  // 满格 = 偏差 60 毫秒；再大就顶到头，不至于因为某一下特别离谱把别的挤成一条线
  const SCALE_MS = 60;

  return (
    <section className="panel steady" id="steady">
      <div className="panel-head">
        <h2>稳不稳</h2>
        <p>开着节拍器弹几小节（默认四小节），麦克风听你每一下落在哪儿：是抢了、拖了，还是越弹越急。</p>
      </div>

      <div className="st-controls">
        <label className="st-field">
          速度
          <input
            type="number"
            min={40}
            max={160}
            value={bpm}
            onChange={(event) => setBpm(Math.min(160, Math.max(40, Number(event.target.value) || 70)))}
            disabled={busy}
          />
          BPM
        </label>
        <label className="st-field">
          共
          <select
            aria-label="整段共几小节"
            value={bars}
            onChange={(event) => setBars(Number(event.target.value))}
            disabled={busy}
          >
            {[2, 4, 6, 8].map((value) => (
              <option key={value} value={value}>
                {value} 小节
              </option>
            ))}
          </select>
        </label>
        <div className="st-field st-range">
          <span>只弹</span>
          <select
            aria-label="从第几小节开始"
            value={fromBar}
            onChange={(event) => {
              const next = Math.min(Number(event.target.value), bars);
              setFromBar(next);
              setToBar((value) => Math.max(value, next));
            }}
            disabled={busy}
          >
            {Array.from({ length: bars }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span>到</span>
          <select
            aria-label="到第几小节结束"
            value={toBar}
            onChange={(event) => {
              const next = Math.min(Number(event.target.value), bars);
              setToBar(next);
              setFromBar((value) => Math.min(value, next));
            }}
            disabled={busy}
          >
            {Array.from({ length: bars }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span>小节</span>
        </div>
        <button type="button" className={busy ? "btn" : "btn primary"} onClick={busy ? stop : start}>
          {phase === "starting" ? "开麦克风…" : phase === "listening" ? "停，看结果" : "开始"}
        </button>
      </div>

      {typeof MediaRecorder !== "undefined" && (
        <label className="st-audio-toggle">
          <input
            type="checkbox"
            checked={audioOn}
            onChange={(event) => setAudioOn(event.target.checked)}
            disabled={busy}
          />
          录下这一遍
          <span className="st-audio-note">只留最近 3 遍，方便跟同速的上一遍对着听</span>
        </label>
      )}

      <p className="st-hint" role="status">
        {autoIn !== null
          ? `${autoIn} 秒后自动开始（从统计页双击过来的）；不想等就点「开始」。`
          : phase === "listening"
          ? `在听… ${elapsed.toFixed(1)} 秒（最多 ${MAX_SECONDS} 秒）· 第 ${fromBar}–${toBar} 小节。节拍器响了就跟上，弹完点「停」。`
          : phase === "denied"
            ? "麦克风被拒绝了：地址栏左边的图标里允许一下，再点「开始」。"
            : phase === "unsupported"
              ? "这个浏览器没有麦克风接口（需要 https 或 localhost）。"
              : phase === "error"
                ? error
                : phase === "starting"
                  ? "正在要麦克风权限…"
                  : report
                    ? "结果在下面。再弹一遍可以对比标准差有没有变小。"
                    : "建议戴耳机：外放的节拍器声会被麦克风一起录进去。"}
      </p>

      {report && (
        <div className={`st-result${report.steady ? " ok" : ""}`}>
          <p className="st-verdict">{report.verdict}</p>
          <div className="st-numbers">
            <span>
              <b>{report.meanAbsMs.toFixed(0)}</b>
              <i>平均偏差 毫秒</i>
            </span>
            <span>
              <b>{report.stdevMs.toFixed(0)}</b>
              <i>标准差 毫秒</i>
            </span>
            <span>
              <b>{report.driftMsPerBeat.toFixed(1)}</b>
              <i>每拍漂移 毫秒</i>
            </span>
            <span>
              <b>{report.hits.length}</b>
              <i>踩到的拍{report.dropped > 0 ? `（丢 ${report.dropped} 下）` : ""}</i>
            </span>
          </div>
          <div className="st-bars" aria-hidden="true">
            {report.offsets.map((offset, index) => (
              <span
                key={`${index}-${offset.toFixed(1)}`}
                className={`st-bar${offset < 0 ? " early" : " late"}`}
                style={{ width: `${Math.min(50, (Math.abs(offset) / SCALE_MS) * 50)}%` }}
                title={`第 ${index + 1} 拍：${offset > 0 ? "+" : ""}${offset.toFixed(0)} 毫秒`}
              />
            ))}
          </div>
          <p className="st-scale">每条是一拍：往左 = 抢在节拍器前面，往右 = 拖在后面。</p>
          {report.worstBar && report.barStdevsMs.length > 1 && (
            <p className="st-bars-note">
              最散的是第 {(range?.from ?? fromBar) + report.worstBar.bar - 1} 小节（±
              {report.worstBar.stdevMs.toFixed(0)} 毫秒）
              {report.stdevMs > 0 && report.worstBar.stdevMs > report.stdevMs * 1.6
                ? "——重弹时先盯这一小节。"
                : "。"}
            </p>
          )}
                    {report.stdevFirstHalfMs > 0 && report.stdevSecondHalfMs > 0 && (
            <p className="st-halves">
              前半段 ±{report.stdevFirstHalfMs.toFixed(0)} 毫秒 · 后半段 ±
              {report.stdevSecondHalfMs.toFixed(0)} 毫秒
              {report.stdevSecondHalfMs > report.stdevFirstHalfMs * 1.8 ? "（后半段开始散了）" : ""}
            </p>
          )}
          <p className="st-suggestion">{report.suggestion}</p>
          {delta !== null && (
            <p className="st-delta">
              {delta >= 1
                ? `比上次稳了 ${delta.toFixed(0)} 毫秒`
                : delta <= -1
                  ? `比上次散了 ${Math.abs(delta).toFixed(0)} 毫秒`
                  : "跟上次差不多稳"}
            </p>
          )}
                    {justSaved && <p className="st-saved">这一遍已经记下了。</p>}
                    {linkedNote && <p className="st-linked">{linkedNote}</p>}
          {audioNote && (
            <p className="st-audio">
              {audioNote}
              {lastAudio && (
                <audio
                  ref={audioRef}
                  className="st-audio-play"
                  controls
                  preload="metadata"
                  src={lastAudio}
                  aria-label="这一遍的录音"
                />
              )}
              {lastAudio && (
                <>
                  <button
                    type="button"
                    className="btn-quiet st-audio-export"
                    onClick={() => {
                      const run = runs[runs.length - 1];
                      if (run) downloadAudio(run);
                    }}
                    title="把这一遍的录音存成音频文件"
                  >
                    存成文件
                  </button>
                  <button
                    type="button"
                    className="btn-quiet st-audio-export"
                    onClick={async () => {
                      const run = runs[runs.length - 1];
                      if (run) {
                        // 最偏的三拍顺手裁成一小段（v0.159.0）：和说明放一个文件夹里点开就听
                        const clip = await worstClipOf(run);
                        const markdown = await runMetaMarkdown(run, compareRunOf(run), clip?.name);
                        downloadText(`稳不稳-${run.date}-${run.bpm}BPM.md`, markdown);
                        if (clip) downloadDataUrl(clip.name, clip.dataUrl);
                      }
                    }}
                    title="存一份说明：速度、范围、标准差、每一拍偏多少"
                  >
                    存成说明
                  </button>
                </>
              )}
            </p>
          )}
          {report.offsets.length > 0 &&
            (lastAudio && originMs !== null ? (
              <WaveRuler
                audio={lastAudio}
                offsets={report.offsets.map((offset) => Math.round(offset))}
                bpm={bpm}
                originMs={originMs}
                ghost={ghostLayer}
                ghostLabel={ghostMode === "same" ? "同速的上一遍" : "最稳的一遍"}
                onSeek={playAround}
                onPick={(fromBeat, toBeat) => {
                  const start = Math.max(1, Math.min(bars, Math.floor(fromBeat / BAR_BEATS) + 1));
                  const end = Math.max(start, Math.min(bars, Math.floor(toBeat / BAR_BEATS) + 1));
                  setFromBar(start);
                  setToBar(end);
                  setPickBeats({ from: fromBeat, to: toBeat });
                  setLooping(false);
                  setPickNote(
                    `你选的是第 ${fromBeat + 1}–${toBeat + 1} 拍，已经改成只弹${
                      start === end ? `第 ${start} 小节` : `第 ${start}–${end} 小节`
                    }`,
                  );
                }}
                className="st-audio-ruler"
              />
            ) : (
              <BeatRuler offsets={report.offsets} className="st-audio-ruler" />
            ))}
          {lastAudio && (
            <p className="st-ghost-pick">
              <span>后面那条淡的叠的是</span>
              <select
                className="st-ghost-select"
                aria-label="波形后面叠哪一遍的轮廓"
                value={ghostMode}
                onChange={(event) => setGhostMode(event.target.value as "best" | "same" | "off")}
              >
                {ghostChoices.map((choice) => (
                  <option key={choice.id} value={choice.id} disabled={!choice.ready}>
                    {choice.label}
                    {choice.ready ? "" : "（还没有）"}
                  </option>
                ))}
              </select>
            </p>
          )}
          {pickNote && (
            <p className="st-pick-note">
              {pickNote}
              {" "}
              {loopRange && (
                <>
                  <label className="st-loop-rounds">
                    循环
                    <select
                      aria-label="循环听几轮"
                      value={loopRounds}
                      onChange={(event) => setLoopRounds(Number(event.target.value))}
                    >
                      {[2, 3, 5, 0].map((rounds) => (
                        <option key={rounds} value={rounds}>
                          {rounds === 0 ? "一直" : `${rounds} 轮`}
                        </option>
                      ))}
                    </select>
                    听
                  </label>
                  <button
                    type="button"
                    className="btn-quiet st-pick-go"
                    onClick={toggleLoop}
                    aria-pressed={looping}
                  >
                    {looping ? "停，不循环了" : "循环听这一小段"}
                  </button>
                  {looping && loopRounds > 0 && (
                    <span className="st-loop-count">
                      第 {loopPass}/{loopRounds} 轮
                    </span>
                  )}
                </>
              )}
              <button type="button" className="btn-quiet st-pick-go" onClick={start} disabled={busy}>
                就弹这几小节
              </button>
            </p>
          )}
          {loops.length > 0 && (
            <p className="st-loops" aria-label="最近循环听过的几段">
              <span>最近循环：</span>
              {[...loops]
                .slice(-3)
                .reverse()
                .map((entry) => (
                  <span key={entry.id} className="st-loop-item">
                    {entry.fromBar === entry.toBar
                      ? `第 ${entry.fromBar} 小节`
                      : `第 ${entry.fromBar}–${entry.toBar} 小节`}{" "}
                    · {entry.rounds} 轮 · {entry.bpm} BPM · {entry.date.slice(5)} {entry.at}
                  </span>
                ))}
            </p>
          )}
          {/* 这一次和最稳的一次并排（v0.151.0）：数字看不出差别时，耳朵能听出来 */}
          {(() => {
            const current = runs[runs.length - 1];
            const goal = bestRun(runs);
            if (!current || !goal || !goal.audio || goal.id === current.id) return null;
            if (!lastAudio && !goal.audio) return null;
            return (
              <div className="st-compare" data-st-compare>
                <div className="st-compare-item">
                  <span className="st-compare-head">
                    这一遍 · ±{report.stdevMs.toFixed(0)} 毫秒
                  </span>
                  {lastAudio ? (
                    <audio
                      className="st-audio-play"
                      controls
                      preload="metadata"
                      src={lastAudio}
                      aria-label="这一遍的录音（对比）"
                    />
                  ) : (
                    <span className="st-compare-none">这一遍没录</span>
                  )}
                </div>
                <div className="st-compare-item">
                  <span className="st-compare-head">
                    最稳的一遍 · {goal.date.slice(5)} · ±{goal.stdevMs.toFixed(0)} 毫秒
                  </span>
                  <audio
                    className="st-audio-play"
                    controls
                    preload="metadata"
                    src={goal.audio}
                    aria-label="最稳那一遍的录音"
                  />
                </div>
              </div>
            );
          })()}
          {report && same && (
            <p className="st-same">
              同速的上一遍 ±{same.stdevMs.toFixed(0)} 毫秒（{same.date.slice(5)} ·{" "}
              {same.fromBar && same.toBar ? `只弹 ${same.fromBar}–${same.toBar} 小节` : `整段 ${same.bars} 小节`}
              {same.sameRange ? "" : "，不是这一段"}）· 这次 ±
              {report.stdevMs.toFixed(0)} 毫秒
              {same.stdevMs - report.stdevMs >= 1
                ? `（稳了 ${(same.stdevMs - report.stdevMs).toFixed(0)} 毫秒）`
                : same.stdevMs - report.stdevMs <= -1
                  ? `（散了 ${Math.abs(same.stdevMs - report.stdevMs).toFixed(0)} 毫秒）`
                  : "（差不多）"}
              {" · 方向："}这次{sideText(report.medianOffsetMs)}（
              {halvesText(report.medianFirstHalfMs, report.medianSecondHalfMs)}），上次
              {sideText(same.medianOffsetMs)}
              {same.audio && (
                <audio
                  className="st-audio-play"
                  controls
                  preload="metadata"
                  src={same.audio}
                  aria-label="同速那一遍的录音"
                />
              )}
              {same.audio && (
                <button
                  type="button"
                  className="btn-quiet st-audio-export"
                  onClick={() =>
                    downloadAudio({ date: same.date, bpm, stdevMs: same.stdevMs, audio: same.audio })
                  }
                  title="把同速那一遍的录音存成音频文件"
                >
                  存成文件
                </button>
              )}
              <button
                type="button"
                className="btn-quiet st-same-listen"
                onClick={() => void (previewing ? stopPreview() : previewSame())}
                disabled={busy}
                title="只放节拍，不放录音；先听清那个速度再弹"
              >
                {previewing ? "停" : "先听同速的节拍"}
              </button>
              <button type="button" className="btn-quiet st-same-go" onClick={start} disabled={busy}>
                同速再来一遍
              </button>
            </p>
          )}
        </div>
      )}

      {best && (
        <p className="st-best">
          最稳的一遍：标准差 {best.stdevMs.toFixed(0)} 毫秒 · {best.bpm} BPM · {runs.length} 遍里最好的一次
        </p>
      )}

      <p className="st-tip">安静的房间、戴耳机、用拨片；速度填你实际能稳住的那个，别一上来就追快。</p>
    </section>
  );
}
