import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHORD_BY_NAME,
  chromaOfSpectrum,
  detectChordFromChroma,
  fingeringOf,
  noteNameOf,
  type DetectedChord,
} from "@guitar/core";
import ChordDiagram from "./ChordDiagram";

const FFT_SIZE = 4096;
const LISTEN_MS = 2400;
const FRAME_MS = 80;

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

interface ChordReading {
  chord: DetectedChord | null;
  frames: number;
  /** 最低的那个强峰（音级），用来判断转位。 */
  bassPc: number | null;
}

const QUALITY_TEXT: Record<string, string> = {
  major: "大三和弦",
  minor: "小三和弦",
  dominant7: "属七和弦",
  major7: "大七和弦",
  minor7: "小七和弦",
  sus4: "挂四和弦",
  dim: "减三和弦",
  aug: "增三和弦",
  m7b5: "半减七和弦",
  power: "强力和弦",
};

const INVERSION_TEXT = ["原位", "第一转位", "第二转位", "第三转位"];

/** 和弦音在「缺了哪个」里怎么念：说「五度」比说「纯五度」更像人话。 */
const STEP_TEXT: Record<number, string> = {
  0: "根音",
  2: "二度",
  3: "小三度",
  4: "大三度",
  5: "四度",
  6: "减五度",
  7: "五度",
  8: "增五度",
  9: "六度",
  10: "小七度",
  11: "大七度",
};

/**
 * 听和弦（v0.76.0）：按住一个和弦，页面把频谱折成 12 个音级，再和和弦模板比。
 *
 * 和调音器、扒谱一样，页面只管「收帧 + 折 chroma」，认和弦全在 core 的
 * `chord-detect.ts`（有单测）。这里只把麦克风的三件事（回声消除/降噪/自动增益）
 * 关掉——它们会削掉泛音，而泛音正是人耳分辨大三/小三的依据。
 */
export default function ChordListen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reading, setReading] = useState<ChordReading | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const accRef = useRef<number[]>(new Array(12).fill(0));
  const framesRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastFrameRef = useRef(0);
  const doneRef = useRef(false);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const chroma = accRef.current;
    const frames = framesRef.current;
    const peak = Math.max(...chroma);
    if (peak <= 0) {
      setReading({ chord: null, frames, bassPc: null });
    } else {
      const normalized = chroma.map((value) => value / peak);
      setReading({ chord: detectChordFromChroma(normalized), frames, bassPc: null });
    }
    setPhase("idle");
    setProgress(0);
  }, []);

  const start = useCallback(async () => {
    setError("");
    setReading(null);
    setProgress(0);
    setPhase("starting");
    accRef.current = new Array(12).fill(0);
    framesRef.current = 0;
    doneRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        stream.getTracks().forEach((track) => track.stop());
        setPhase("unsupported");
        return;
      }
      const ctx = new Ctor();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      streamRef.current = stream;
      ctxRef.current = ctx;
      startedAtRef.current = performance.now();
      lastFrameRef.current = 0;
      const buffer = new Float32Array(analyser.frequencyBinCount);
      setPhase("listening");

      const tick = (): void => {
        const now = performance.now();
        const elapsed = now - startedAtRef.current;
        setProgress(Math.min(1, elapsed / LISTEN_MS));
        if (elapsed >= LISTEN_MS) {
          finish();
          return;
        }
        if (now - lastFrameRef.current >= FRAME_MS) {
          lastFrameRef.current = now;
          analyser.getFloatFrequencyData(buffer);
          let loudest = -Infinity;
          for (let i = 0; i < buffer.length; i += 1) {
            if (buffer[i] > loudest) loudest = buffer[i];
          }
          // 太安静就别往统计里塞噪声（-70 dB 以下当作没弹）
          if (loudest > -70) {
            const linear = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i += 1) {
              const db = buffer[i];
              linear[i] = Number.isFinite(db) ? Math.pow(10, db / 20) : 0;
            }
            const chroma = chromaOfSpectrum(linear, ctx.sampleRate, FFT_SIZE);
            for (let pc = 0; pc < 12; pc += 1) accRef.current[pc] += chroma[pc];
            framesRef.current += 1;
          }
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

  const listening = phase === "listening";
  const chord = reading?.chord ?? null;
  const library = chord ? CHORD_BY_NAME.get(chord.label) : undefined;
  const hint =
    phase === "denied"
      ? "麦克风被拒绝了。地址栏左边把权限打开，再点一次「听一个和弦」。"
      : phase === "unsupported"
        ? "这个浏览器不给用麦克风（或者不是 https）。换 Chrome / Safari 试试。"
        : phase === "error"
          ? error
          : listening
            ? "在听… 按住一个和弦别动，两秒后出结果。"
            : reading && !chord
              ? "没听清。一次只按一个和弦、每根弦都按实，别扫得太快。"
              : reading && chord
                ? "认出来了。再点一次「听一个和弦」就换下一个——这个结果会被替换掉。"
                : "点「听一个和弦」，按住一个和弦（比如 C），两秒后告诉你它是什么。";

  return (
    <section className="panel chord-listen" id="chord-listen">
      <div className="panel-head">
        <h2>听和弦</h2>
        <p>
          按住一个和弦，这里把频谱折成 12 个音级，再和和弦模板比。认的是「哪几个音一起响」，
          所以扫弦、分解都行；单音听不出和弦。
        </p>
      </div>

      <div className="cl-controls">
        <button
          type="button"
          className={listening ? "btn" : "btn primary"}
          onClick={listening ? finish : start}
        >
          {listening ? "停" : "听一个和弦"}
        </button>
        <span className="cl-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
        {reading && <span className="cl-frames">收了 {reading.frames} 帧</span>}
      </div>

      <p className={listening ? "cl-hint live" : "cl-hint"} role="status">
        {hint}
      </p>

      {chord && (
        <div className="cl-result">
          <div className="cl-head">
            <b className="cl-name">{chord.label}</b>
            <span className="cl-quality">
              {QUALITY_TEXT[chord.quality] ?? chord.name}
              {chord.inversion > 0 ? ` · ${INVERSION_TEXT[chord.inversion] ?? "转位"}` : ""}
            </span>
          </div>
          <ul className="cl-tones">
            {toneNames(chord).map((tone) => (
              <li key={tone}>{tone}</li>
            ))}
          </ul>
          {chord.missing.length > 0 && (
            <p className="cl-missing">
              少了
              <b>
                {chord.missing
                  .map(
                    (step) =>
                      `${STEP_TEXT[step] ?? `${step} 个半音`}（${noteNameOf((chord.root + step) % 12)}）`,
                  )
                  .join("、")}
              </b>
              ——那根弦可能没按实，或者被别的指头闷住了。
            </p>
          )}
          {chord.extra.length > 0 && (
            <p className="cl-extra">
              还听到不属于它的音：{chord.extra.map((pc) => noteNameOf(pc)).join("、")}
              ——多半是相邻的弦没闷住。
            </p>
          )}
          {library && (
            <div className="cl-diagram">
              <ChordDiagram chord={library} />
            </div>
          )}
          <p className="cl-tip">
            置信 {Math.round(chord.score * 100)}%。
            {chord.missing.length > 0 || chord.extra.length > 0
              ? "先照上面缺的、多的音检查一遍手指，再听一次会准得多。"
              : "听错多半是因为按得不实（有杂音）或者扫得太快（前一个和弦还在响）。"}
          </p>
        </div>
      )}
    </section>
  );
}

/** 和弦里听到的音：按根音往上排。 */
function toneNames(chord: DetectedChord): string[] {
  const template: Record<string, number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    sus4: [0, 5, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    power: [0, 7],
    dominant7: [0, 4, 7, 10],
    major7: [0, 4, 7, 11],
    minor7: [0, 3, 7, 10],
    m7b5: [0, 3, 6, 10],
  };
  const intervals = template[chord.quality] ?? [0, 4, 7];
  return intervals.map((step) => noteNameOf((chord.root + step) % 12));
}
