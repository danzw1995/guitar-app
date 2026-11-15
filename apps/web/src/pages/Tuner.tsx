import { useCallback, useEffect, useRef, useState } from "react";
import {
  TUNER_STRINGS,
  detectPitch,
  frequencyOfMidi,
  smoothFreqs,
  tunerReading,
  type TunerReading,
} from "@guitar/core";
import { useTone } from "../hooks/useTone";

/** 指针条的左右范围：±50 音分，再多就看不出来了（耳朵也听不出来） */
const SCALE_CENTS = 50;
/** 每 90ms 画一次：比人眼需要的快，又不会把主线程占满 */
const PAINT_MS = 90;
/** 检测频率：不用每帧都算（一次自相关要跑几十万次乘加），20Hz 已经跟得上手指 */
const DETECT_MS = 55;

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

export default function Tuner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [level, setLevel] = useState(0);
  const [activeString, setActiveString] = useState<number | null>(null);
  const { play } = useTone();

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const freqsRef = useRef<number[]>([]);
  const lastDetectRef = useRef(0);
  const lastPaintRef = useRef(0);

  const teardown = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) {
      // close() 是异步的，失败了也不影响下一次开始
      void ctx.close().catch(() => undefined);
    }
    freqsRef.current = [];
    setLevel(0);
    setReading(null);
  }, []);

  // 离开这一页就一定要把麦克风关掉：浏览器地址栏那个红点在用户心里就是「被偷听」
  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    teardown();
    setPhase("starting");
    setErrorText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // 这三个开关都是为语音设计的，会把乐器的泛音削掉、把音量自动拉平
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        setPhase("unsupported");
        teardown();
        return;
      }
      const ctx = new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      const tick = (now: number) => {
        rafRef.current = window.requestAnimationFrame(tick);
        analyser.getFloatTimeDomainData(buffer);

        if (now - lastDetectRef.current >= DETECT_MS) {
          lastDetectRef.current = now;
          const freq = detectPitch(buffer, ctx.sampleRate);
          freqsRef.current.push(freq);
          if (freqsRef.current.length > 10) freqsRef.current.shift();

          if (now - lastPaintRef.current >= PAINT_MS) {
            lastPaintRef.current = now;
            const smoothed = smoothFreqs(freqsRef.current, 5);
            setReading(smoothed > 0 ? tunerReading(smoothed) : null);
            let peak = 0;
            for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]));
            setLevel(Math.min(1, peak * 3));
          }
        }
      };
      rafRef.current = window.requestAnimationFrame(tick);
      setPhase("listening");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPhase("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setPhase("error");
        setErrorText("没找到麦克风。插一个耳麦，或者换一台带麦克风的设备。");
      } else {
        setPhase("error");
        setErrorText(error instanceof Error ? error.message : String(error));
      }
      teardown();
    }
  }, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
  }, [teardown]);

  // 记住最近一次「离哪根弦最近」，松手之后指针别乱跳
  useEffect(() => {
    if (reading?.string) setActiveString(reading.string.string);
  }, [reading]);

  const string = reading?.string ?? null;
  const cents = string ? Math.max(-SCALE_CENTS, Math.min(SCALE_CENTS, string.cents)) : 0;
  const inTune = Boolean(reading?.inTune);
  const phaseText =
    phase === "listening"
      ? reading
        ? inTune
          ? "准了"
          : string
            ? string.cents < 0
              ? "偏低，拧紧一点"
              : "偏高，松一点"
            : "弹单根空弦试试"
        : "在听……拨一下弦"
      : "";

  return (
    <section className="panel tuner">
      <div className="panel-head">
        <h2>调音器</h2>
        <p>标准调弦 EADGBE。拨一根空弦，指针在中间就是准的（±5 音分以内算准）。</p>
      </div>

      <div className={`tuner-stage${phase === "listening" ? " live" : ""}`}>
        <div className="tuner-note" aria-hidden={phase !== "listening"}>
          {string ? (
            <>
              <span className="tuner-string-no">{string.string}</span>
              <span className="tuner-string-name">
                {string.name}
                <span className="tuner-oct">{string.octave}</span>
              </span>
            </>
          ) : (
            <span className="tuner-string-name muted">{phase === "listening" ? "—" : "EADGBE"}</span>
          )}
        </div>

        <div className={`tuner-scale${inTune ? " in-tune" : ""}`} aria-hidden="true">
          <div className="tuner-ticks">
            <span>−50</span>
            <span>−25</span>
            <span>0</span>
            <span>+25</span>
            <span>+50</span>
          </div>
          <div className="tuner-track">
            <span className="tuner-zone" />
            <span className="tuner-center" />
            <span
              className="tuner-needle"
              style={{ left: `calc(50% + ${(cents / SCALE_CENTS) * 50}%)` }}
            />
          </div>
        </div>

        <p className={`tuner-hint${inTune ? " ok" : ""}`} role="status">
          {phaseText || (phase === "idle" ? "点「开始」，允许麦克风，然后拨一根空弦" : "")}
        </p>
        <p className="tuner-cents" aria-hidden="true">
          {string ? `${string.cents > 0 ? "+" : ""}${string.cents} 音分 · ${Math.round(reading?.freq ?? 0)} Hz` : ""}
        </p>

        <div className="tuner-level" aria-hidden="true">
          <span style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>

      <div className="tuner-strings" role="group" aria-label="六根空弦">
        {TUNER_STRINGS.map((item) => (
          <button
            key={item.string}
            type="button"
            className={
              activeString === item.string ? "tuner-string active" : "tuner-string"
            }
            aria-pressed={activeString === item.string}
            aria-label={`${item.string} 弦 ${item.name}${item.octave}，点一下听标准音`}
            onClick={() => {
              setActiveString(item.string);
              // 响三下，够把弦拧到位；一声太短，听不出有没有对上
              play([item.midi, item.midi, item.midi], 0.7);
            }}
          >
            <b>{item.name}</b>
            <span>{item.string}</span>
          </button>
        ))}
      </div>

      <div className="tuner-actions">
        {phase === "listening" ? (
          <button type="button" className="btn" onClick={stop}>
            停止
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={start} disabled={phase === "starting"}>
            {phase === "starting" ? "正在请求麦克风…" : "开始"}
          </button>
        )}
        <span className="tuner-tip">
          {phase === "denied"
            ? "浏览器没给麦克风权限。允许之后再点一次「开始」。"
            : phase === "unsupported"
              ? "这个浏览器不支持麦克风输入（需要 https 或 localhost）。"
              : phase === "error"
                ? errorText
                : "建议戴耳机：外放的声音会被麦克风再收一遍，指针会跟着音箱抖。"}
        </span>
      </div>

      <p className="tuner-foot">
        标准音是 A4 = 440Hz，六根空弦分别是 E2 {Math.round(frequencyOfMidi(40))}Hz、A2{" "}
        {Math.round(frequencyOfMidi(45))}Hz、D3 {Math.round(frequencyOfMidi(50))}Hz、G3{" "}
        {Math.round(frequencyOfMidi(55))}Hz、B3 {Math.round(frequencyOfMidi(59))}Hz、E4{" "}
        {Math.round(frequencyOfMidi(64))}Hz。
      </p>
    </section>
  );
}
