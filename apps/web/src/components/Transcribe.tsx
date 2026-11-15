import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectPitch,
  tabToAlphaTex,
  transcribeFrames,
  type PitchFrame,
  type TranscribeResult,
} from "@guitar/core";
import { renderScoreImage, type ScoreImage } from "../lib/score-image";
import { addScore } from "../lib/my-scores";
import { useTone } from "../hooks/useTone";

const MAX_SECONDS = 20;
const DETECT_MS = 55;
/** 导入文件时最多分析这么多秒：一首歌三五分钟，整首跑完要几十秒，也没人扒整首。 */
const MAX_FILE_SECONDS = 30;
/** 文件分析时每次取样的窗口长度（采样点）。 */
const WINDOW = 4096;

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

/**
 * 扒谱（v0.71.0）：弹一段单音旋律，把它变成六线谱。
 *
 * 页面只负责「收帧」——每 55ms 从麦克风取一次基频，连同时间戳塞进 `frames`；
 * 切音、量化、落到弦品上全在 core 的 `transcribe.ts` 里，那边有单测。
 * 这样即使麦克风权限、浏览器差异出问题，扒谱本身的行为也是可测的。
 */
export default function Transcribe() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [bpm, setBpm] = useState(90);
  const [subdivision, setSubdivision] = useState<1 | 2 | 4>(2);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [image, setImage] = useState<ScoreImage | null>(null);
  const [error, setError] = useState("");
  const [frameCount, setFrameCount] = useState(0);
  const [heard, setHeard] = useState(0);
  const [saved, setSaved] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; seconds: number } | null>(null);
  const [fileError, setFileError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<PitchFrame[]>([]);
  const startedAtRef = useRef(0);
  const lastDetectRef = useRef(0);
  const { playTab, stop: stopTone } = useTone();

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const frames = framesRef.current;
    const next = transcribeFrames(frames, { bpm, subdivision });
    setResult(next);
    setPhase("idle");
    setFrameCount(frames.filter((frame) => frame.freq > 0).length);
  }, [bpm, subdivision]);

  /**
   * 从音频文件扒（v0.79.0）：解码 → 降成单声道 → 每 55ms 算一帧基频 → 走同一条流水线。
   *
   * 和麦克风那条路唯一的区别是「帧从哪来」：那边实时收，这边一次算完，所以中途要让出
   * 主线程（每 16 帧一次）——不然一个 30 秒的文件会把页面卡住好几秒，进度条也动不了。
   */
  const importFile = useCallback(
    async (file: File) => {
      setFileError("");
      setFileInfo(null);
      setFileBusy(true);
      setFileProgress(0);
      setResult(null);
      setImage(null);
      setSaved(false);
      stopTone();
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error("这个浏览器不支持解码音频");
        const ctx = new Ctor();
        const audio = await ctx.decodeAudioData(await file.arrayBuffer());
        const limit = Math.min(audio.length, Math.round(audio.sampleRate * MAX_FILE_SECONDS));
        const mono = new Float32Array(limit);
        for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
          const data = audio.getChannelData(channel);
          for (let i = 0; i < limit; i += 1) mono[i] += data[i] / audio.numberOfChannels;
        }
        setFileInfo({ name: file.name, seconds: Math.round((limit / audio.sampleRate) * 10) / 10 });
        const hop = Math.max(1, Math.round((audio.sampleRate * DETECT_MS) / 1000));
        const frames: PitchFrame[] = [];
        const slice = new Float32Array(WINDOW);
        for (let start = 0; start + WINDOW <= limit; start += hop) {
          slice.set(mono.subarray(start, start + WINDOW));
          frames.push({ time: start / audio.sampleRate, freq: detectPitch(slice, audio.sampleRate) });
          if (frames.length % 16 === 0) {
            setFileProgress(Math.min(0.99, (start + WINDOW) / limit));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
        setFileProgress(1);
        setResult(transcribeFrames(frames, { bpm, subdivision }));
        setFrameCount(frames.filter((frame) => frame.freq > 0).length);
        void ctx.close().catch(() => undefined);
      } catch (err) {
        setFileError((err as Error)?.message ?? "这个文件读不出来");
      } finally {
        setFileBusy(false);
      }
    },
    [bpm, subdivision, stopTone],
  );

  const start = useCallback(async () => {
    setError("");
    setResult(null);
    setImage(null);
    setFrameCount(0);
    setHeard(0);
    setSaved(false);
    framesRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        stream.getTracks().forEach((track) => track.stop());
        setPhase("unsupported");
        return;
      }
      const ctx = new Ctor();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      streamRef.current = stream;
      ctxRef.current = ctx;
      startedAtRef.current = performance.now();
      lastDetectRef.current = 0;
      const buffer = new Float32Array(analyser.fftSize);
      setPhase("listening");

      const tick = (): void => {
        const now = performance.now();
        const elapsed = (now - startedAtRef.current) / 1000;
        if (elapsed >= MAX_SECONDS) {
          finish();
          return;
        }
        setSeconds(Math.floor(elapsed));
        if (now - lastDetectRef.current >= DETECT_MS) {
          lastDetectRef.current = now;
          analyser.getFloatTimeDomainData(buffer);
          const freq = detectPitch(buffer, ctx.sampleRate);
          framesRef.current.push({ time: Math.round(elapsed * 1000) / 1000, freq });
          if (freq > 0) setHeard((count) => count + 1);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      teardown();
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setPhase("denied");
      else {
        setError((err as Error)?.message ?? "打不开麦克风");
        setPhase("error");
      }
    }
  }, [finish, teardown]);

  const stopListening = useCallback(() => {
    finish();
  }, [finish]);

  useEffect(() => {
    if (!result || result.tab.notes.length === 0) {
      setImage(null);
      return;
    }
    let alive = true;
    renderScoreImage(tabToAlphaTex(result.tab))
      .then((next) => {
        if (alive) setImage(next);
      })
      .catch((err: unknown) => {
        if (alive) setError((err as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [result]);

  /** 把这一遍扒出来的谱存进「我的谱」（图 + 音符一起存，之后能试听、导出、跟练）。 */
  const saveToScores = useCallback(() => {
    if (!result || !image) return;
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, "0");
    const title = `扒谱 · ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    addScore({
      title,
      ascii: "",
      source: "transcribe",
      tab: result.tab,
      meter: `${result.tab.beatsPerBar}/4`,
      bpm,
      image: image.dataUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      beats: image.beats,
    });
    setSaved(true);
    window.dispatchEvent(new Event("guitar:scores"));
  }, [result, image, bpm]);

  const listening = phase === "listening";
  const hint =
    phase === "denied"
      ? "麦克风被拒绝了。地址栏左边把权限打开，再点一次「开始听」。"
      : phase === "unsupported"
        ? "这个浏览器不给用麦克风（或者不是 https）。换 Chrome / Safari 试试。"
        : phase === "error"
          ? error
          : listening
            ? `在听… ${seconds} 秒 / 最多 ${MAX_SECONDS} 秒（收到 ${heard} 帧有声）· 一次弹一个音，别扫和弦。`
            : fileBusy
              ? "在读文件… 30 秒以内，几秒钟就好。"
              : fileInfo
                ? ""
                : "点「开始听」，然后弹一段单音旋律（比如小星星的开头），弹完点「停」。";

  return (
    <section className="panel transcribe" id="transcribe">
      <div className="panel-head">
        <h2>扒谱</h2>
        <p>
          弹一段单音旋律，这里把它记成六线谱：先按 55ms 一次听音高，再把音吸到节拍网格上。
          只认单音，和弦与扫弦听不出来。
        </p>
      </div>

      <div className="tr-controls">
        <button type="button" className={listening ? "btn" : "btn primary"} onClick={listening ? stopListening : start}>
          {listening ? "停" : "开始听"}
        </button>
        <label className="tr-field">
          速度
          <input
            type="number"
            min={40}
            max={200}
            value={bpm}
            onChange={(event) => setBpm(Math.max(40, Math.min(200, Number(event.target.value) || 90)))}
          />
          BPM
        </label>
        <label className="tr-field">
          网格
          <select value={subdivision} onChange={(event) => setSubdivision(Number(event.target.value) as 1 | 2 | 4)}>
            <option value={1}>四分音符</option>
            <option value={2}>八分音符</option>
            <option value={4}>十六分音符</option>
          </select>
        </label>
      </div>

      <div className="tr-file">
        <label className={fileBusy ? "btn" : "btn-quiet"}>
          {fileBusy ? `分析中 ${Math.round(fileProgress * 100)}%` : "导入音频文件"}
          <input
            type="file"
            accept="audio/*"
            hidden
            disabled={fileBusy || listening}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) void importFile(picked);
              event.target.value = "";
            }}
          />
        </label>
        <span className="tr-file-note">
          {fileError
            ? fileError
            : fileInfo
              ? `${fileInfo.name} · 分析前 ${fileInfo.seconds} 秒`
              : `mp3 / wav / m4a，只取前 ${MAX_FILE_SECONDS} 秒；单音旋律才认得出`}
        </span>
      </div>

      {hint ? (
        <p className={listening ? "tr-hint live" : "tr-hint"} role="status">
          {hint}
        </p>
      ) : null}

      {result && result.tab.notes.length > 0 && (
        <div className="tr-result">
          <div className="alpha-preview" aria-busy={!image ? "true" : undefined}>
            {image ? (
              <span className="tab-score-wrap">
                <img
                  className="tab-score"
                  src={image.dataUrl}
                  alt={`扒出来的六线谱，共 ${result.tab.notes.length} 个音`}
                  width={image.width || undefined}
                  height={image.height || undefined}
                />
              </span>
            ) : (
              <span className="muted">正在画谱…</span>
            )}
          </div>
          <div className="tr-meta">
            <span>
              {result.tab.notes.length} 个音 · {result.tab.bars} 小节 · 收帧 {frameCount}
            </span>
            <button type="button" className="btn" onClick={() => playTab(result.tab, bpm)}>
              试听
            </button>
            <button type="button" className="btn-quiet" onClick={() => stopTone()}>
              停
            </button>
            <button
              type="button"
              className={saved ? "btn-quiet" : "btn"}
              onClick={saveToScores}
              disabled={!image || saved}
            >
              {saved ? "已存进「我的谱」" : "存进「我的谱」"}
            </button>
          </div>
          {saved && <p className="tr-saved">存好了，往下翻「我的谱」最上面就是它——那里能试听、跟练、导出 PNG。</p>}
          {result.warnings.length > 0 && (
            <ul className="tr-warnings">
              {result.warnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && result.tab.notes.length === 0 && (
        <p className="tr-hint">{result.warnings[0] ?? "没听到清楚的音。"}</p>
      )}

      <p className="tr-tip">
        建议：安静的房间、戴耳机（外放会把伴奏再收一遍）、用拨片弹单音。速度先填你实际弹的速度，
        填错了音会挤在一起——谱上看着别扭，就调一下速度再扒一次。
      </p>
    </section>
  );
}
