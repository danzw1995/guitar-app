import { useEffect, useRef } from "react";
import { STANDARD_TUNING, frequencyOf, midiAt } from "@guitar/core";

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
  const voices = useRef<OscillatorNode[]>([]);
  const timers = useRef<number[]>([]);

  function ensure(): AudioContext | null {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  /** 一声拨弦：`at` 是 AudioContext 时间轴上的绝对时间。 */
  function pluck(ctx: AudioContext, at: number, midi: number, dur = 1.2, level = 0.13) {
    if (at < ctx.currentTime) at = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    gain.connect(ctx.destination);

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
    for (const osc of voices.current) {
      try {
        osc.stop();
      } catch {
        // 已经停过就算了
      }
    }
    voices.current = [];
  }

  /**
   * 按顺序拨若干根弦。`frets` 的 0 号下标是 6 弦（与和弦库一致），
   * `strings` 是 1–6 的弦号，按要弹的顺序给。
   */
  function playStrings(frets: number[], strings: number[], opts: PlayOptions = {}) {
    const ctx = ensure();
    if (!ctx) return;
    stop();
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
    const start = ctx.currentTime + 0.05;
    midis.forEach((midi, index) => pluck(ctx, start + index * step, midi, 1));
  }

  useEffect(() => stop, []);

  return { strum, arpeggio, play, stop };
}

/** 分解和弦的弦序：低音弦 + 3-2-3-1-3-2-3（最常用的 53231323）。 */
export function arpeggioPattern(frets: number[]): number[] {
  const bassIndex = frets.findIndex((fret) => fret >= 0);
  const bass = bassIndex >= 0 ? 6 - bassIndex : 5;
  return [bass, 3, 2, 3, 1, 3, 2, 3];
}
