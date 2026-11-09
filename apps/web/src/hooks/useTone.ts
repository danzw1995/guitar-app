import { useEffect, useRef } from "react";
import { STANDARD_TUNING, frequencyOf, midiAt, tabEvents, type Tab } from "@guitar/core";
import { claimAudio, getVolume, releaseAudio } from "../lib/audio-bus";

export interface PlayOptions {
  /** 相邻两个音之间隔多久（秒）。 */
  step?: number;
  /** 每响一个音回调一次（用来点亮对应的弦）。 */
  onNote?: (stringNumber: number) => void;
}

/**
 * 试听：用 Web Audio 现场合成"拨弦"，不需要任何音频文件。
 *
 * 音色刻意做得简单：三角波 + 一个八度泛音，短促的起音 + 指数衰减。
 * 目的不是好听，是**能听出区别**——大三还是小三、有没有七音。
 */
export function useTone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const volumeRef = useRef<GainNode | null>(null);
  const voices = useRef<OscillatorNode[]>([]);
  const timers = useRef<number[]>([]);
  const ownerRef = useRef<symbol | null>(null);
  const rafRef = useRef<number | null>(null);
  const beatRef = useRef<((beat: number) => void) | null>(null);
  const owner = () => {
    ownerRef.current ??= Symbol("tone");
    return ownerRef.current;
  };

  function ensure(): AudioContext | null {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    if (!masterRef.current) {
      // 扫弦是一下子 5–6 个音同时响，直接怼到 destination 会爆音；
      // 中间挂一个压缩器，既压住峰值又把整体响度提上来（不然比节拍器还小）。
      const master = ctx.createGain();
      master.gain.value = 1.15;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      master.connect(comp);
      const volume = ctx.createGain();
      volume.gain.value = getVolume();
      comp.connect(volume);
      volume.connect(ctx.destination);
      masterRef.current = master;
      volumeRef.current = volume;
    }
    if (volumeRef.current) volumeRef.current.gain.value = getVolume();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  /** 一声拨弦：`at` 是 AudioContext 时间轴上的绝对时间。 */
  function pluck(ctx: AudioContext, at: number, midi: number, dur = 1.2, level = 0.3) {
    if (at < ctx.currentTime) at = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    gain.connect(masterRef.current ?? ctx.destination);

    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = frequencyOf(midi);

    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = frequencyOf(midi) * 2;

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.25;

    body.connect(gain);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(gain);

    const stop = at + dur + 0.05;
    body.start(at);
    shimmer.start(at);
    body.stop(stop);
    shimmer.stop(stop);
    voices.current.push(body, shimmer);
  }

  /** 全部停掉（换和弦、离开页面时）。 */
  function stop() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // 播放被打断时也要把「当前拍」收回去，不然高亮条会停在半路
    const notify = beatRef.current;
    beatRef.current = null;
    notify?.(-1);
    for (const osc of voices.current) {
      try {
        osc.stop();
      } catch {
        // 已经停过就算了
      }
    }
    voices.current = [];
    releaseAudio(owner());
  }

  /**
   * 按顺序拨若干根弦。`frets` 的 0 号下标是 6 弦（与和弦库一致），
   * `strings` 是 1–6 的弦号，按要弹的顺序给。
   */
  function playStrings(frets: number[], strings: number[], opts: PlayOptions = {}) {
    const ctx = ensure();
    if (!ctx) return;
    stop();
    claimAudio(owner(), stop);
    const step = opts.step ?? 0.04;
    const start = ctx.currentTime + 0.05;

    strings.forEach((stringNumber, order) => {
      const fret = frets[6 - stringNumber];
      if (fret === undefined || fret < 0) return;
      const at = start + order * step;
      pluck(ctx, at, midiAt(STANDARD_TUNING, stringNumber - 1, fret), 1.4);
      if (opts.onNote) {
        const delay = Math.max(0, (at - ctx.currentTime) * 1000);
        const id = window.setTimeout(() => opts.onNote?.(stringNumber), delay);
        timers.current.push(id);
      }
    });
  }

  /** 扫弦：从低音弦到高音弦，`x` 的弦跳过。 */
  function strum(frets: number[], opts: PlayOptions = {}) {
    const strings = [6, 5, 4, 3, 2, 1].filter((s) => (frets[6 - s] ?? -1) >= 0);
    playStrings(frets, strings, { step: 0.04, ...opts });
  }

  /** 分解和弦：按给的弦序一根一根拨（如 `[5,3,2,3,1,3,2,3]`）。 */
  function arpeggio(frets: number[], strings: number[], opts: PlayOptions = {}) {
    playStrings(frets, strings, { step: 0.3, ...opts });
  }

  /** 音阶 / 一串音：按顺序拨。 */
  function play(midis: number[], step = 0.24) {
    const ctx = ensure();
    if (!ctx) return;
    stop();
    claimAudio(owner(), stop);
    const start = ctx.currentTime + 0.05;
    midis.forEach((midi, index) => pluck(ctx, start + index * step, midi, 1));
  }

  /** 一声节拍器的"哒"（试听谱子时用来定拍）。 */
  function tick(ctx: AudioContext, at: number, accent: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(accent ? 0.12 : 0.07, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain);
    gain.connect(masterRef.current ?? ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
    voices.current.push(osc);
  }

  /**
   * 试听一条谱子：按 `tabEvents` 算出的时间轴把音符弹出来，同一时刻的音错开 12ms
   * （听起来是扫弦）。**不叠节拍器**——试听要听的是这条节奏本身，
   * 要跟拍就用跟练模式。需要时可以把 `click` 打开，给一小节预备拍。
   */
  function playTab(
    tab: Tab,
    bpm: number,
    opts: { click?: boolean; onBeat?: (beat: number) => void } = {},
  ) {
    const ctx = ensure();
    if (!ctx) return;
    stop();
    claimAudio(owner(), stop);
    const start = ctx.currentTime + 0.08;
    const secondsPerBeat = 60 / Math.max(20, bpm);

    const seen = new Map<number, number>();
    for (const event of tabEvents(tab, bpm)) {
      const key = Math.round(event.at * 1000);
      const order = seen.get(key) ?? 0;
      seen.set(key, order + 1);
      const at = start + event.at + order * 0.012;
      // 衰减跟着时值走：十六分不该响得跟二分一样长，否则节奏糊成一团
      const decay = Math.max(0.32, Math.min(1.6, event.dur * 1.8));
      pluck(ctx, at, event.midi, decay, 0.32);
    }

    if (opts.click) {
      const beats = tab.bars * tab.beatsPerBar;
      for (let beat = 0; beat < beats; beat++) {
        tick(ctx, start + beat * secondsPerBeat, beat % tab.beatsPerBar === 0);
      }
    }

    // 「现在播到第几拍」：用墙钟算，不用 AudioContext 的时间轴——
    // 有些浏览器（或没声卡的机器）AudioContext 一直是 suspended，
    // currentTime 不动，高亮就会永远停在第一拍。音符是提前排好的，
    // 两者起点都取「现在 + 80ms 预备」，几小节之内不会看出差。
    if (opts.onBeat) {
      const onBeat = opts.onBeat;
      const total = tab.bars * tab.beatsPerBar;
      beatRef.current = onBeat;
      const t0 = performance.now() + 80;
      let last = -1;
      const step = () => {
        if (beatRef.current !== onBeat) return;
        const beat = Math.floor((performance.now() - t0) / 1000 / secondsPerBeat);
        if (beat >= total) {
          beatRef.current = null;
          rafRef.current = null;
          onBeat(-1);
          return;
        }
        if (beat >= 0 && beat !== last) {
          last = beat;
          onBeat(beat);
        }
        rafRef.current = window.requestAnimationFrame(step);
      };
      rafRef.current = window.requestAnimationFrame(step);
    }
  }

  useEffect(() => stop, []);

  return { strum, arpeggio, play, playTab, stop };
}

/** 分解和弦的弦序：低音弦 + 3-2-3-1-3-2-3（最常用的 53231323）。 */
export function arpeggioPattern(frets: number[]): number[] {
  const bassIndex = frets.findIndex((fret) => fret >= 0);
  const bass = bassIndex >= 0 ? 6 - bassIndex : 5;
  return [bass, 3, 2, 3, 1, 3, 2, 3];
}
