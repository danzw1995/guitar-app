import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHORD_BY_NAME,
  SHARP_NAMES,
  STANDARD_TUNING,
  chordMidis,
  chordVoicingTab,
  chromaOfSpectrum,
  detectChord,
  detectChordFromChroma,
  degreeInKey,
  noteNameOf,
  positionsFor,
  segmentChords,
  segmentTabOf,
  bassLineOf,
  chordLabelOf,
  estimateTempo,
  snapSegments,
  sequenceTabOf,
  tabToAlphaTex,
  dateKeyOf,
  type ChordSegment,
  type ChordShape,
  type DetectedChord,
  type Tab,
  type TempoGuess,
} from "@guitar/core";
import ChordDiagram from "./ChordDiagram";
import BassOverlay from "./BassOverlay";
import FollowAlong, { type FollowTarget } from "./FollowAlong";
import { addScore, scoreFileName } from "../lib/my-scores";
import { addPattern } from "../lib/patterns";
import { loadRhythm, saveRhythm, type RhythmRecords } from "../lib/storage";
import { renderScoreImage } from "../lib/score-image";
import { withDegreeStrip } from "../lib/degree-image";
import { useTone } from "../hooks/useTone";
import { useScoreImage } from "../hooks/useScoreImage";

const FFT_SIZE = 4096;
const LISTEN_MS = 2400;
const SEQUENCE_MS = 15000;
const HOLD_MS = 30000;
/** 长音模式看最近多少帧（12 帧 × 80ms ≈ 1 秒的滑窗）。 */
const HOLD_WINDOW = 12;
const FRAME_MS = 80;

type Phase = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";

/** 一次听一个和弦、一段扫弦里切出好几个，或者按住不放一直跟着认。 */
type Mode = "single" | "sequence" | "hold";

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
  /** 存和弦谱时用的速度和拍号：谱头按这个画 ♩=bpm（v0.88.0）。 */
  const [saveBpm, setSaveBpm] = useState(70);
  const [saveBeats, setSaveBeats] = useState(4);
  /** 按你弹的速度估的 BPM（v0.91.0）；用户自己改过速度之后就不再自动填。 */
  const [tempoGuess, setTempoGuess] = useState<TempoGuess | null>(null);
  const bpmTouchedRef = useRef(false);
  const [patternSaved, setPatternSaved] = useState(false);
  /** 切出来的和弦谱直接跟练（v0.89.0）：不用先存进「我的谱」。 */
  const [follow, setFollow] = useState<FollowTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  /** 级数按哪个调算（v0.94.0）：null = 跟着第一个和弦的根音走。 */
  const [keyPick, setKeyPick] = useState<number | null>(null);
  const { play, playTab, stop: stopTone } = useTone();
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
  /**
   * 每一帧听到的最低音（音级），用来判断转位（v0.89.0）。
   * 12 个音级丢了八度，`bassPc` 得从频谱里单独找最低的那个响着的音。
   */
  const bassesRef = useRef<number[]>([]);
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
      const found = segmentChords(chromasRef.current, FRAME_MS / 1000, { basses: bassesRef.current });
      // 按你弹的速度估个 BPM（v0.91.0）：填过就不动，免得把用户改的数覆盖掉
      const guess = estimateTempo(found);
      // 再把边界挪到小节线上（v0.93.0）：切段只看音级分布，边界会落在换和弦的那一帧上
      setSegments(guess ? snapSegments(found, { bpm: guess.bpm, beatsPerChord: guess.beatsPerChord }) : found);
      setTempoGuess(guess);
      if (guess && !bpmTouchedRef.current) setSaveBpm(guess.bpm);
      setPhase("idle");
      setProgress(0);
      return;
    }
    if (mode === "hold") {
      // 长音模式：最后一秒的滑窗就是「你现在按着的那个和弦」
      const recent = chromasRef.current.slice(-HOLD_WINDOW);
      setReading(readChroma(recent, frames, bassOf(bassesRef.current.slice(-HOLD_WINDOW))));
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
      setReading({
        chord: detectChordFromChroma(normalized, bassOf(bassesRef.current) ?? undefined),
        frames,
        bassPc: bassOf(bassesRef.current),
      });
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
   * 切出来的几个和弦存成一张「和弦谱」：一小节两个和弦、各占两拍。
   * 认不出来的段（`chord` 是 null）直接跳过——谱上不能有一格空着。
   * 速度和拍号按上面那两个控件写进谱头（v0.88.0）。
   */
  /** 切出来的那几个和弦（跳过没认出来的段）。 */
  function sequenceChords(): DetectedChord[] {
    if (!segments) return [];
    return segments
      .map((segment) => segment.chord)
      .filter((chord): chord is DetectedChord => Boolean(chord));
  }

  /**
   * 这一段的谱（v0.90.0）：按每段的**真实时长**写拍子，不再平均分配。
   * 弹得快的和弦谱上就短、拖长的地方就长，小节线也按真实时间落。
   */
  function sequenceTab() {
    return segmentTabOf(segments ?? [], { bpm: saveBpm, beatsPerBar: saveBeats });
  }

  function saveSequence() {
    if (!segments) return;
    const chords = sequenceChords();
    if (chords.length === 0) return;
    addScore({
      title: `和弦谱 · ${chords.map((chord) => chordLabelOf(chord)).join("–")}`,
      ascii: "",
      source: "progression",
      tab: sequenceTab(),
      meter: `${saveBeats}/4`,
      bpm: saveBpm,
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setSeqSaved(true);
  }

  /**
   * 存成「我存的进行」（v0.91.0）：和存成和弦谱不同，这一条是**拿来跟练的素材**，
   * 会出现在节奏页，直接带「试听 / 跟练」两个按钮。
   *
   * v0.94.0 起**一小节一张卡**：一段扫弦常常就是「一小节一个和弦」，拆开才好单练那一个；
   * v0.95.0 起再顺手存一张**整段**的（`和弦进行 · C–Am–G`），想连着弹的时候不用自己拼。
   */
  function savePattern() {
    if (!segments) return;
    const chords = sequenceChords();
    if (chords.length === 0) return;
    addPattern({
      title: `和弦进行 · ${chords.map((chord) => chordLabelOf(chord)).join("–")}`,
      tab: sequenceTab(),
      meter: `${saveBeats}/4`,
      bpm: saveBpm,
    });
    for (const chord of chords) {
      addPattern({
        title: `${chordLabelOf(chord)}（${saveBeats}/4）`,
        tab: sequenceTabOf([chord], saveBeats, saveBpm),
        meter: `${saveBeats}/4`,
        bpm: saveBpm,
      });
    }
    window.dispatchEvent(new Event("guitar:patterns"));
    setPatternSaved(true);
  }

  /**
   * 直接跟练这一段和弦谱（v0.89.0）：不必先存进「我的谱」。
   * 速度就按上面填的那个，目标 +40；成绩记在 `guitar.rhythm.v1` 的 `seq:` 前缀下。
   */
  function startFollow() {
    const chords = sequenceChords();
    if (chords.length === 0) return;
    const labels = chords.map((chord) => chordLabelOf(chord)).join("–");
    setFollow({
      id: `seq:${chords.map((chord) => chordLabelOf(chord)).join("-")}`,
      name: `和弦谱 ${labels}`,
      bpm: [saveBpm, saveBpm + 40],
      tab: sequenceTab(),
      meter: `${saveBeats}/4`,
    });
  }

  function recordFollow(result: { bpm: number; minutes: number }) {
    if (!follow) return;
    const today = dateKeyOf(new Date());
    const previous = records[follow.id];
    const next: RhythmRecords = {
      ...records,
      [follow.id]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + result.minutes,
        lastAt: today,
      },
    };
    setRecords(next);
    saveRhythm(next);
  }

  /**
   * 把这一段和弦谱导出成 PNG（v0.89.0）：分享给一起练的人，或者存进相册。
   * 用和「我的谱」同一套渲染（2 倍像素、裁边），不是截屏。
   */
  async function exportImage() {
    const chords = sequenceChords();
    if (chords.length === 0 || exporting) return;
    setExportError("");
    setExporting(true);
    try {
      const tab = sequenceTab();
      const image = await renderScoreImage(tabToAlphaTex(tab), { minWidth: 420 });
      // 图底下补一行「级数 1 → 6 → 5」（v0.97.0），分享出去看得出走向
      const dataUrl = await withDegreeStrip(image.dataUrl, tab);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = scoreFileName(`和弦谱 ${chords.map((chord) => chordLabelOf(chord)).join("–")}`);
      link.click();
    } catch (err) {
      setExportError((err as Error)?.message ?? "导出失败");
    } finally {
      setExporting(false);
    }
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

  /**
   * 调顺序（v0.88.0）：切出来的先后不一定就是你要弹的顺序，
   * 尤其是先随手扫了两下再弹正题的时候。
   */
  function moveSegment(index: number, delta: number) {
    setSegments((current) => {
      if (!current) return current;
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setSeqSaved(false);
  }

  /**
   * 把这一段并进下一段（v0.88.0）：同一个和弦按了两下、被切成两段时用。
   * 时值取两段合起来的，和弦取先认出来的那个（认不出来的就往后借）。
   */
  function mergeWithNext(index: number) {
    setSegments((current) => {
      if (!current || index >= current.length - 1) return current;
      const first = current[index];
      const second = current[index + 1];
      const merged: ChordSegment = {
        // 调过顺序之后两段的先后可能反了，取区间并集才不会出现「2.0–2.0 秒」
        start: Math.min(first.start, second.start),
        end: Math.max(first.end, second.end),
        chord: first.chord ?? second.chord,
        frames: first.frames + second.frames,
      };
      const next = current.slice();
      next.splice(index, 2, merged);
      return next;
    });
    setSeqSaved(false);
  }

  const start = useCallback(async () => {
    setError("");
    setReading(null);
    setSegments(null);
    setProgress(0);
    setSaved(false);
    setSeqSaved(false);
    setPatternSaved(false);
    setKeyPick(null);
    setPhase("starting");
    accRef.current = new Array(12).fill(0);
    chromasRef.current = [];
    bassesRef.current = [];
    framesRef.current = 0;
    doneRef.current = false;
    const limit = mode === "sequence" ? SEQUENCE_MS : mode === "hold" ? HOLD_MS : LISTEN_MS;

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
            const bass = bassPcOf(linear, ctx.sampleRate, FFT_SIZE);
            for (let pc = 0; pc < 12; pc += 1) accRef.current[pc] += chroma[pc];
            chromasRef.current.push(chroma);
            bassesRef.current.push(bass ?? -1);
            framesRef.current += 1;
            // 长音模式：每两帧刷一次「最近一秒是什么和弦」，换和弦立刻跟上
            if (mode === "hold" && framesRef.current % 2 === 0) {
              setReading(
                readChroma(
                  chromasRef.current.slice(-HOLD_WINDOW),
                  framesRef.current,
                  bassOf(bassesRef.current.slice(-HOLD_WINDOW)),
                ),
              );
            }
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
              : mode === "hold"
                ? "在听… 按住一个和弦别动，结果会一直跟着变；按「停」结束。"
                : "在听… 按住一个和弦别动，两秒后出结果。"
            : reading && !chord
              ? "没听清。一次只按一个和弦、每根弦都按实，别扫得太快。"
              : reading && chord
                ? mode === "hold"
                  ? "认出来了。按住不放的时候结果会一直跟着你，按「停」结束。"
                  : "认出来了。再点一次就换下一个——这个结果会被替换掉。"
                : segments && segments.length > 0
                  ? `切出 ${segments.length} 段。再点一次就重录——这次的结果会被替换掉。`
                  : mode === "sequence"
                    ? "点「听一段」，弹一小段（C → Am → F → G 都行），十五秒后告诉你中间换了哪几个和弦。"
                    : mode === "hold"
                      ? "点「开始听」，按住一个和弦别动——画面一直跟着你，换和弦就跟着换。"
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

      <div className="cl-modes" role="group" aria-label="听一个和弦、一段扫弦，还是按住不放">
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
        <button
          type="button"
          className={mode === "hold" ? "chip on" : "chip"}
          aria-pressed={mode === "hold"}
          onClick={() => {
            if (listening) finish();
            setMode("hold");
          }}
        >
          按住不放
        </button>
      </div>

      <div className="cl-controls">
        <button
          type="button"
          className={listening ? "btn" : "btn primary"}
          onClick={listening ? finish : start}
        >
          {listening ? "停" : mode === "sequence" ? "听一段（15 秒）" : mode === "hold" ? "按住不放，开始听" : "听一个和弦"}
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
          <SequenceScore tab={sequenceTab()} />
          <BassLine
            chords={sequenceChords()}
            keyPc={keyPick ?? sequenceChords()[0]?.root ?? 0}
            onKey={setKeyPick}
          />
          <ol className="cl-seq-list">
            {segments.map((segment, index) => (
              <li key={`${segment.start}-${index}`} className="cl-seq-item">
                <b>{segment.chord?.label ?? "没认出来"}</b>
                <span>
                  {segment.start.toFixed(1)}–{segment.end.toFixed(1)} 秒
                </span>
                {segment.chord && <em>{QUALITY_TEXT[segment.chord.quality] ?? segment.chord.name}</em>}
                <div className="cl-seq-actions">
                  <div className="cl-seq-move">
                    <button
                      type="button"
                      className="btn-quiet cl-seq-move-btn"
                      aria-label={`第 ${index + 1} 段往前挪`}
                      disabled={index === 0}
                      onClick={() => moveSegment(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-quiet cl-seq-move-btn"
                      aria-label={`第 ${index + 1} 段往后挪`}
                      disabled={index === segments.length - 1}
                      onClick={() => moveSegment(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
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
                  {index < segments.length - 1 && (
                    <button
                      type="button"
                      className="btn-quiet cl-seq-merge"
                      aria-label={`把第 ${index + 1} 段并进下一段`}
                      onClick={() => mergeWithNext(index)}
                    >
                      并下一段
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-quiet cl-seq-drop"
                    aria-label={`删掉第 ${index + 1} 段`}
                    onClick={() => dropSegment(index)}
                  >
                    删掉
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="cl-save">
            <label className="cl-save-field">
              速度
              <input
                type="number"
                min={40}
                max={200}
                value={saveBpm}
                aria-label="和弦谱的速度"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  bpmTouchedRef.current = true;
                  setSaveBpm(Number.isFinite(next) ? Math.min(200, Math.max(40, Math.round(next))) : 70);
                  setSeqSaved(false);
                }}
              />
              BPM
            </label>
            <label className="cl-save-field">
              拍号
              <select
                value={saveBeats}
                aria-label="和弦谱的拍号"
                onChange={(event) => {
                  setSaveBeats(Number(event.target.value));
                  setSeqSaved(false);
                }}
              >
                <option value={4}>4/4</option>
                <option value={3}>3/4</option>
                <option value={2}>2/4</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => playTab(sequenceTab(), saveBpm)}
              disabled={!segments.some((segment) => segment.chord)}
            >
              按这个速度试听
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={startFollow}
              disabled={!segments.some((segment) => segment.chord)}
            >
              跟着练
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={exportImage}
              disabled={exporting || !segments.some((segment) => segment.chord)}
            >
              {exporting ? "导出中…" : "导出图片"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={saveSequence}
              disabled={seqSaved || !segments.some((segment) => segment.chord)}
            >
              {seqSaved ? "已存进「我的谱」" : "存成和弦谱"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={savePattern}
              disabled={patternSaved || !segments.some((segment) => segment.chord)}
            >
              {patternSaved ? "已存进「我存的进行」" : "存成节奏型"}
            </button>
            {exportError && <span className="cl-save-note">{exportError}</span>}
            {tempoGuess && (
              <span className="cl-tempo">
                按你弹的速度估的：≈{tempoGuess.bpm} BPM（一段 {tempoGuess.seconds} 秒，按{" "}
                {tempoGuess.beatsPerChord} 拍一个和弦算）——不准就改上面那个数。
                边界已经挪到小节线上，谱上的小节线就是你的拍子。
              </span>
            )}
            {seqSaved && (
              <span className="cl-save-note">去「节奏」页最下面的「我的谱」找它——能试听、跟练、导出 PNG。</span>
            )}
            {patternSaved && (
              <span className="cl-save-note">去「节奏」页的「我存的进行」找它——那里直接能试听、跟练。</span>
            )}
          </div>
          <p className="cl-tip">
            切段靠的是「音级分布变了没有」，所以换和弦要弹清楚；同一个和弦按住不放会被算成一段。
            速度和拍号会写进谱头（`♩=速度`），「我的谱」里的跟练也从这里起步。
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
          {chord.inversion > 0 && <p className="cl-bass">{bassHint(chord)}</p>}
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
          {/* 转位不画库里的指法图：库里存的是原位按法，画出来跟「第一转位」打架 */}
          {library && chord.inversion === 0 && (
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

      {follow && (
        <FollowAlong
          target={follow}
          best={records[follow.id]?.bestBpm}
          onFinish={recordFollow}
          onClose={() => setFollow(null)}
        />
      )}
    </section>
  );
}

/**
 * 转位的时候把「低音落在哪」说出来（v0.89.0）。
 *
 * 认成第一转位意味着最低的那个音不是根音——这正是初学者最容易按错的地方：
 * 同样是 C，`x32010` 是原位，`032010` 就是第一转位（低音变成 E）。
 * 所以这里不只报「第一转位」，还说清楚低音是哪个音、在几弦几品。
 */
function bassHint(chord: DetectedChord): string {
  const bassMidi = chordMidis(chord)[0];
  const name = noteNameOf(chord.bass);
  const spots = positionsFor(bassMidi, 12)
    .slice(0, 2)
    .map((spot) => `${spot.s} 弦 ${spot.f === 0 ? "空弦" : `${spot.f} 品`}`)
    .join(" 或 ");
  const text = `${INVERSION_TEXT[chord.inversion] ?? "转位"}：低音是 ${name}`;
  return spots ? `${text}（${spots}）。最低那个音换了，和弦的颜色就跟着变。` : `${text}。`;
}

/**
 * 把一串帧平均成一个和弦读数（v0.88.0）。
 *
 * 长音模式用它：按住不放的时候，画面一直显示「最近一秒是什么和弦」，
 * 换和弦了结果就跟着换——不用等一轮结束。
 */
function readChroma(chromas: number[][], frames: number, bassPc: number | null = null): ChordReading {
  if (chromas.length === 0) return { chord: null, frames, bassPc };
  const sum = new Array(12).fill(0);
  for (const chroma of chromas) {
    for (let pc = 0; pc < 12; pc += 1) sum[pc] += chroma[pc];
  }
  const peak = Math.max(...sum);
  if (peak <= 0) return { chord: null, frames, bassPc };
  const normalized = sum.map((value) => value / peak);
  return {
    chord: detectChordFromChroma(normalized, bassPc ?? undefined),
    frames,
    bassPc,
  };
}

/**
 * 频谱里最低的那个「响着的」音（v0.89.0）。
 *
 * 转位要靠低音判断，而 12 个音级把八度抹掉了——`detectChordFromChroma()`
 * 拿到 `bassPc` 才知道是原位还是第一/第二转位。这里取「超过最强音 1/4」的
 * 最低频点，避免把低频噪声当成低音。
 */
function bassPcOf(linear: Float32Array, sampleRate: number, fftSize: number): number | null {
  let peak = 0;
  for (let i = 0; i < linear.length; i += 1) if (linear[i] > peak) peak = linear[i];
  if (peak <= 0) return null;
  const bin = sampleRate / fftSize;
  const floor = Math.max(65, bin);
  for (let i = 1; i < linear.length; i += 1) {
    const freq = i * bin;
    if (freq < floor) continue;
    if (freq > 1600) break;
    if (linear[i] >= peak * 0.25) {
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      return ((midi % 12) + 12) % 12;
    }
  }
  return null;
}

/** 一窗帧里的低音：取出现最多的那个（跳过的记 -1）。 */
function bassOf(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) {
    if (value < 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [pc, count] of counts) {
    if (count > bestCount) {
      best = pc;
      bestCount = count;
    }
  }
  return best >= 0 ? best : null;
}

/**
 * 低音走线（v0.90.0）：把每一段的「最低那个音」摆成一排。
 *
 * `C`、`C/E`、`C/G` 三个和弦的组成音完全一样，只有最低音不同——写成
 * `C → C/E → C/G` 才能看出「低音在往下走」；只报和弦名会把这条线藏起来。
 */
/**
 * 切段结果的谱 + 叠在上面的低音走线（v0.92.0）。
 *
 * 折线要「对齐小节」就得知道每一拍在图上哪儿——`renderScoreImage` 返回的
 * `beats`（每拍一个 `{x,w,y,h}`）正好是这件事。低音的音高映射到那一拍的纵向范围里，
 * 高的在上、低的在下，于是「低音往上爬」在谱上也看得见。
 *
 * v0.93.0 起折线由 `BassOverlay` 统一画（「我的谱」的和弦谱卡用的是同一套）。
 */
function SequenceScore({ tab }: { tab: Tab }) {
  const { image, error } = useScoreImage(tabToAlphaTex(tab));

  if (error) return <p className="my-error">{error}</p>;
  if (!image) return <p className="my-hint">正在画谱…</p>;

  return (
    <div className="cl-score">
      <div className="cl-score-wrap" style={{ width: `${image.width}px` }}>
        <img
          className="tab-score"
          src={image.dataUrl}
          width={image.width}
          height={image.height}
          style={{ width: "100%", height: "auto" }}
          alt={`这一段和弦的六线谱，共 ${tab.bars} 小节`}
        />
        <BassOverlay tab={tab} image={image} />
      </div>
      <p className="cl-score-note">谱上那条线就是低音：点落在小节里，高低跟着音高走。</p>
    </div>
  );
}

/**
 * 低音走线（v0.91.0 起一条折线，v0.94.0 起带级数）。
 *
 * 级数要跟着调走：同一串 C–Am–G 在 C 调里是 1–6–5，在 G 调里是 4–2–1。
 * 默认按「第一个和弦的根音」当主音（多半就是调），也可以手动换。
 */
function BassLine({
  chords,
  keyPc,
  onKey,
}: {
  chords: DetectedChord[];
  keyPc: number;
  onKey: (pc: number) => void;
}) {
  const steps = bassLineOf(chords);
  if (steps.length < 2) return null;
  const moved = steps.filter((step) => step.moved).length;
  return (
    <div className="cl-bassline">
      <p className="cl-bassline-row">
        <span className="cl-bassline-label">低音走线</span>
        {steps.map((step, index) => {
          const degree = degreeInKey(step.midi % 12, keyPc);
          return (
            <span key={`${step.label}-${index}`} className="cl-bass-step-wrap">
              {index > 0 && <span className="cl-bass-arrow">→</span>}
              <span className={step.inversion > 0 ? "cl-bass-step alt" : "cl-bass-step"}>
                {step.inversion > 0 ? `${step.label}/${step.bassName}` : step.label}
                {degree > 0 && <em className="cl-degree">{degree}</em>}
              </span>
            </span>
          );
        })}
        <span className="cl-bassline-note">{moved > 0 ? `换了 ${moved} 次低音` : "低音一直没动"}</span>
      </p>
      <label className="cl-key">
        <span>按哪个调算级数</span>
        <select value={keyPc} onChange={(event) => onKey(Number(event.target.value))}>
          {SHARP_NAMES.map((name, pc) => (
            <option key={name} value={pc}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
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
