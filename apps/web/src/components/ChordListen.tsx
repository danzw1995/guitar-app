import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHORD_BY_NAME,
  STANDARD_TUNING,
  chordMidis,
  chordVoicingTab,
  chromaOfSpectrum,
  detectChord,
  detectChordFromChroma,
  noteNameOf,
  segmentChords,
  sequenceTabOf,
  type ChordSegment,
  type ChordShape,
  type DetectedChord,
} from "@guitar/core";
import ChordDiagram from "./ChordDiagram";
import { addScore } from "../lib/my-scores";
import { useTone } from "../hooks/useTone";

const FFT_SIZE = 4096;
const LISTEN_MS = 2400;
const SEQUENCE_MS = 15000;
const FRAME_MS = 80;

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

/** 一次听一个和弦，还是一段扫弦里切出好几个。 */
type Mode = "single" | "sequence";

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
  const [mode, setMode] = useState<Mode>("single");
  const [reading, setReading] = useState<ChordReading | null>(null);
  const [segments, setSegments] = useState<ChordSegment[] | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [seqSaved, setSeqSaved] = useState(false);
  const { play, stop: stopTone } = useTone();
  // 改名字时能选的和弦：只列「和弦库里有、而且认得出性质」的那些，
  // 免得选完名字变了、谱上还是老按法。
  const nameOptions = useMemo(
    () =>
      [...CHORD_BY_NAME.values()]
        .filter((shape) => {
          const midis = shape.frets
            .map((fret, spot) => ({ fret, string: 6 - spot }))
            .filter((item) => item.fret >= 0)
            .map((item) => STANDARD_TUNING.strings[item.string - 1] + item.fret);
          return Boolean(detectChord(midis));
        })
        .map((shape) => shape.name)
        .sort(),
    [],
  );

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const accRef = useRef<number[]>(new Array(12).fill(0));
  /** 一段模式的原始帧：每一帧 12 个音级，按时间顺序排。 */
  const chromasRef = useRef<number[][]>([]);
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
    const frames = framesRef.current;
    if (mode === "sequence") {
      // 一段模式：交给 core 按「像不像上一个和弦」切开，页面不自己判断
      setSegments(segmentChords(chromasRef.current, FRAME_MS / 1000));
      setPhase("idle");
      setProgress(0);
      return;
    }
    const chroma = accRef.current;
    const peak = Math.max(...chroma);
    if (peak <= 0) {
      setReading({ chord: null, frames, bassPc: null });
    } else {
      const normalized = chroma.map((value) => value / peak);
      setReading({ chord: detectChordFromChroma(normalized), frames, bassPc: null });
    }
    setPhase("idle");
    setProgress(0);
  }, [mode]);

  /**
   * 把这个和弦的按法存进「我的谱」：一整小节一个全音符和弦，
   * 六条弦按 `frets` 摆上去（`frets[0]` 是 6 弦，`TabNote.s` 反过来是 1 弦）。
   */
  function saveAsScore(shape: ChordShape) {
    const tab = chordVoicingTab(shape);
    addScore({
      title: `和弦 · ${shape.name}`,
      ascii: "",
      source: "chord",
      chordName: shape.name,
      tab,
      meter: "4/4",
      bpm: 70,
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setSaved(true);
  }

  /**
   * 切出来的几个和弦存成一张「和弦谱」：一个和弦一小节，整小节按满。
   * 认不出来的段（`chord` 是 null）直接跳过——谱上不能有一格空着。
   */
  function saveSequence() {
    if (!segments) return;
    const chords = segments
      .map((segment) => segment.chord)
      .filter((chord): chord is DetectedChord => Boolean(chord));
    if (chords.length === 0) return;
    addScore({
      title: `和弦谱 · ${chords.map((chord) => chord.label).join("–")}`,
      ascii: "",
      source: "progression",
      tab: sequenceTabOf(chords),
      meter: "4/4",
      bpm: 70,
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setSeqSaved(true);
  }

  function playSegment(chord: DetectedChord) {
    stopTone();
    // 0.04 秒一个音：听感上就是「一下扫下去」，不是一个一个拨
    play(chordMidis(chord), 0.04);
  }

  /**
   * 改一段的名字（v0.87.0）：认错了很正常，尤其是低把位。
   *
   * 选了和弦库里的哪个，就把那个和弦的按法还原成音、再走一遍 `detectChord()`，
   * 这样谱上的按法和名字是同一套，不会出现「名字是 Am、谱按的是 C」。
   */
  function renameSegment(index: number, name: string) {
    setSegments((current) => {
      if (!current) return current;
      const next = current.slice();
      const shape = CHORD_BY_NAME.get(name);
      if (!shape) return current;
      const midis = shape.frets
        .map((fret, spot) => ({ fret, string: 6 - spot }))
        .filter((item) => item.fret >= 0)
        .map((item) => STANDARD_TUNING.strings[item.string - 1] + item.fret);
      const chord = detectChord(midis);
      // 名字以用户选的为准：E 的按法里有大三度也有五度，检测器可能报成 E5，
      // 但用户选的是「E」——谱子标题、caption 都跟着用户走。
      next[index] = { ...next[index], chord: chord ? { ...chord, label: name } : null };
      return next;
    });
    setSeqSaved(false);
  }

  /** 删掉一段（v0.87.0）：切多了、或者只是蹭到的一下。 */
  function dropSegment(index: number) {
    setSegments((current) => (current ? current.filter((_, spot) => spot !== index) : current));
    setSeqSaved(false);
  }

  const start = useCallback(async () => {
    setError("");
    setReading(null);
    setSegments(null);
    setProgress(0);
    setSaved(false);
    setSeqSaved(false);
    setPhase("starting");
    accRef.current = new Array(12).fill(0);
    chromasRef.current = [];
    framesRef.current = 0;
    doneRef.current = false;
    const limit = mode === "sequence" ? SEQUENCE_MS : LISTEN_MS;

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
        setProgress(Math.min(1, elapsed / limit));
        if (elapsed >= limit) {
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
            chromasRef.current.push(chroma);
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
      ? "麦克风被拒绝了。地址栏左边把权限打开，再点一次。"
      : phase === "unsupported"
        ? "这个浏览器不给用麦克风（或者不是 https）。换 Chrome / Safari 试试。"
        : phase === "error"
          ? error
          : listening
            ? mode === "sequence"
              ? "在听… 把一段扫弦弹完（最多 15 秒），中途换和弦也没关系。"
              : "在听… 按住一个和弦别动，两秒后出结果。"
            : reading && !chord
              ? "没听清。一次只按一个和弦、每根弦都按实，别扫得太快。"
              : reading && chord
                ? "认出来了。再点一次就换下一个——这个结果会被替换掉。"
                : segments && segments.length > 0
                  ? `切出 ${segments.length} 段。再点一次就重录——这次的结果会被替换掉。`
                  : mode === "sequence"
                    ? "点「听一段」，弹一小段（C → Am → F → G 都行），十五秒后告诉你中间换了哪几个和弦。"
                    : "点「听一个和弦」，按住一个和弦（比如 C），两秒后告诉你它是什么。";

  return (
    <section className="panel chord-listen" id="chord-listen">
      <div className="panel-head">
        <h2>听和弦</h2>
        <p>
          按住一个和弦，这里把频谱折成 12 个音级，再和和弦模板比。认的是「哪几个音一起响」，
          所以扫弦、分解都行；单音听不出和弦。切到「一段扫弦」还能听出这一串里换了哪几个。
        </p>
      </div>

      <div className="cl-modes" role="group" aria-label="听一个和弦还是一段">
        <button
          type="button"
          className={mode === "single" ? "chip on" : "chip"}
          aria-pressed={mode === "single"}
          onClick={() => {
            if (listening) finish();
            setMode("single");
          }}
        >
          一个和弦
        </button>
        <button
          type="button"
          className={mode === "sequence" ? "chip on" : "chip"}
          aria-pressed={mode === "sequence"}
          onClick={() => {
            if (listening) finish();
            setMode("sequence");
          }}
        >
          一段扫弦
        </button>
      </div>

      <div className="cl-controls">
        <button
          type="button"
          className={listening ? "btn" : "btn primary"}
          onClick={listening ? finish : start}
        >
          {listening ? "停" : mode === "sequence" ? "听一段（15 秒）" : "听一个和弦"}
        </button>
        <span className="cl-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
        {reading && <span className="cl-frames">收了 {reading.frames} 帧</span>}
        {segments && segments.length > 0 && <span className="cl-frames">切出 {segments.length} 段</span>}
      </div>

      <p className={listening ? "cl-hint live" : "cl-hint"} role="status">
        {hint}
      </p>

      {segments && segments.length === 0 && (
        <p className="cl-hint">这一段里没听出完整的和弦——弹得再实一点，或者每段多按一会儿。</p>
      )}

      {segments && segments.length > 0 && (
        <div className="cl-result cl-sequence">
          <p className="cl-seq-head">这一段里听到 {segments.length} 个和弦：</p>
          <ol className="cl-seq-list">
            {segments.map((segment, index) => (
              <li key={`${segment.start}-${index}`} className="cl-seq-item">
                <b>{segment.chord?.label ?? "没认出来"}</b>
                <span>
                  {segment.start.toFixed(1)}–{segment.end.toFixed(1)} 秒
                </span>
                {segment.chord && <em>{QUALITY_TEXT[segment.chord.quality] ?? segment.chord.name}</em>}
                {segment.chord && (
                  <>
                    <select
                      className="cl-seq-name"
                      value={segment.chord.label}
                      aria-label={`第 ${index + 1} 段的和弦名`}
                      onChange={(event) => renameSegment(index, event.target.value)}
                    >
                      {!nameOptions.includes(segment.chord.label) && (
                        <option value={segment.chord.label}>{segment.chord.label}</option>
                      )}
                      {nameOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-quiet cl-seq-play"
                      onClick={() => playSegment(segment.chord as DetectedChord)}
                      aria-label={`试听第 ${index + 1} 段 ${segment.chord.label}`}
                    >
                      试听
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn-quiet cl-seq-drop"
                  aria-label={`删掉第 ${index + 1} 段`}
                  onClick={() => dropSegment(index)}
                >
                  删掉
                </button>
              </li>
            ))}
          </ol>
          <div className="cl-save">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={saveSequence}
              disabled={seqSaved || !segments.some((segment) => segment.chord)}
            >
              {seqSaved ? "已存进「我的谱」" : "存成和弦谱"}
            </button>
            {seqSaved && (
              <span className="cl-save-note">去「节奏」页最下面的「我的谱」找它——能试听、跟练、导出 PNG。</span>
            )}
          </div>
          <p className="cl-tip">
            切段靠的是「音级分布变了没有」，所以换和弦要弹清楚；同一个和弦按住不放会被算成一段。
          </p>
        </div>
      )}

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
          <div className="cl-save">
            {library ? (
              <button type="button" className="btn btn-quiet" onClick={() => saveAsScore(library)} disabled={saved}>
                {saved ? "已存进「我的谱」" : "存成练习"}
              </button>
            ) : (
              <span className="cl-save-note">和弦库里没有「{chord.label}」，按它的组成音自己找位置吧。</span>
            )}
            {saved && (
              <span className="cl-save-note">去「节奏」页最下面的「我的谱」找它——那里能试听、跟练、导出 PNG。</span>
            )}
          </div>
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
