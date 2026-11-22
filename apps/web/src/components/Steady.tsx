import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeTiming, detectOnsets, type TimingReport } from "@guitar/core";
import { recordRun, loadRuns, bestRun, STEADY_EVENT, type SteadyRun } from "../lib/steady";
import { loadRhythm, loadSettings, saveRhythm, saveSettings } from "../lib/storage";
import { parseHash } from "../lib/nav";

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
    return {
      bpm: Number.isFinite(bpmValue) && bpmValue >= 40 && bpmValue <= 200 ? Math.round(bpmValue) : null,
      bars: [2, 4, 6, 8].includes(barsValue) ? barsValue : null,
    };
  }, []);
  const [bpm, setBpm] = useState(seeded.bpm ?? initial.steadyBpm);
  const [bars, setBars] = useState(seeded.bars ?? initial.steadyBars);
  // 只弹、只判其中几小节（v0.143.0）：默认整段
  const [fromBar, setFromBar] = useState(1);
  const [toBar, setToBar] = useState(seeded.bars ?? initial.steadyBars);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [report, setReport] = useState<TimingReport | null>(null);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<SteadyRun[]>(() => loadRuns());
  const [justSaved, setJustSaved] = useState(false);

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
    if (seeded.bpm === null && seeded.bars === null) return;
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
  const previewSame = useCallback(async () => {
    stopPreview();
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    await ctx.resume();
    previewRef.current = ctx;
    const spanBars = Math.max(1, Math.min(toBar, bars) - Math.max(1, fromBar) + 1);
    const interval = 60 / bpm;
    const beats = spanBars * BAR_BEATS + 1;
    const startAt = ctx.currentTime + 0.15;
    for (let index = 0; index < beats; index += 1) {
      clickAt(ctx, startAt + interval * index, index % BAR_BEATS === 0);
    }
    setPreviewing(true);
    previewTimer.current = window.setTimeout(
      stopPreview,
      Math.ceil(((beats - 1) * interval + 0.35) * 1000),
    );
  }, [bars, bpm, fromBar, stopPreview, toBar]);

  const start = useCallback(async () => {
    cleanup();
    const spanBars = Math.max(1, Math.min(toBar, bars) - Math.max(1, fromBar) + 1);
    setReport(null);
    setError("");
    setJustSaved(false);
    // 开跑就把这组设置记下来，下次进来还是这一组
    saveSettings({ ...loadSettings(), steadyBpm: bpm, steadyBars: bars });
    setElapsed(0);
    chunksRef.current = [];
    framesRef.current = 0;
    clickRef.current = [];

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
  }, [bars, bpm, cleanup, fromBar, toBar]);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    const frames = framesRef.current;
    const clicks = clickRef.current;
    const sampleRate = ctx?.sampleRate ?? 48000;
    const now = ctx?.currentTime ?? 0;

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
          }
        : null,
    );
    setRuns(
      recordRun({
        date: new Date().toISOString().slice(0, 10),
        bpm,
        bars: spanBars,
        fromBar: startBar,
        toBar: endBar,
        stdevMs: next.stdevMs,
        meanAbsMs: next.meanAbsMs,
        driftMsPerBeat: next.driftMsPerBeat,
        hits: next.hits.length,
      }),
    );
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

  const [delta, setDelta] = useState<number | null>(null);
  // 同速的上一遍（v0.144.0）：速度一样才好比，加速之后抖得多一点是正常的
  const [same, setSame] = useState<{
    stdevMs: number;
    date: string;
    fromBar?: number;
    toBar?: number;
    bars: number;
    sameRange: boolean;
  } | null>(null);

  const busy = phase === "starting" || phase === "listening";
  const best = bestRun(runs);
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

      <p className="st-hint" role="status">
        {phase === "listening"
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
