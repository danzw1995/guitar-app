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

      <p className={listening ? "tr-hint live" : "tr-hint"} role="status">
        {hint}
      </p>

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
