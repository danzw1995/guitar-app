import { useEffect, useRef, useState } from "react";
import { clicksPerBar, gridSlots, type Subdivision } from "@guitar/core";

export interface MetronomeOptions {
  bpm: number;
  meterId: string;
  subdivision: Subdivision;
  /** 每 `bars` 小节加速 `step`（不传 = 不加速）。 */
  ramp?: { bars: number; step: number; max?: number };
  /** 自动加速时的回调（父组件用它更新显示）。 */
  onBpm?: (bpm: number) => void;
}

export interface MetronomeHandle {
  running: boolean;
  /** 当前响到一小节里的第几格。 */
  active: number;
  start: () => void;
  stop: () => void;
}

/**
 * 节拍器的排程内核：用 Web Audio 现场合成"哒"，不需要任何音频文件。
 *
 * 排程用「提前量」（每 25ms 看一眼未来 120ms），而不是 `setInterval` 直接发声——
 * 后者会被主线程卡顿拖歪，练节奏最怕的就是节拍器自己不稳。
 *
 * 抽成 hook 是为了让「节拍器面板」和「跟练」共用同一套时钟：
 * 两边各写一份，早晚会漂。
 */
export function useMetronome({
  bpm,
  meterId,
  subdivision,
  ramp,
  onBpm,
}: MetronomeOptions): MetronomeHandle {
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(-1);

  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const dotsRef = useRef<Set<number>>(new Set());
  const cursor = useRef({ time: 0, index: 0 });

  const bpmRef = useRef(bpm);
  const meterRef = useRef(meterId);
  const subRef = useRef(subdivision);
  const rampRef = useRef(ramp);
  const onBpmRef = useRef(onBpm);
  const slotsRef = useRef(gridSlots(meterId, subdivision));

  bpmRef.current = bpm;
  meterRef.current = meterId;
  subRef.current = subdivision;
  rampRef.current = ramp;
  onBpmRef.current = onBpm;
  slotsRef.current = gridSlots(meterId, subdivision);

  function clearDots() {
    for (const id of dotsRef.current) window.clearTimeout(id);
    dotsRef.current.clear();
  }

  function stop() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    clearDots();
    setRunning(false);
    setActive(-1);
  }

  useEffect(() => stop, []);

  /** 一声"哒"：重音高、细分音低。 */
  function click(ctx: AudioContext, when: number, accent: boolean, offBeat: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = offBeat ? "sine" : "square";
    osc.frequency.value = accent ? 1568 : offBeat ? 660 : 1046;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(accent ? 0.3 : offBeat ? 0.1 : 0.17, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.07);
  }

  function tick() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const perBar = clicksPerBar(meterRef.current, subRef.current);
    const step = 60 / bpmRef.current / subRef.current;
    const current = rampRef.current;

    while (cursor.current.time < ctx.currentTime + 0.12) {
      const { time, index } = cursor.current;
      const inBar = index % perBar;
      const slot = slotsRef.current[inBar];
      click(ctx, time, slot.accent, !slot.onBeat);

      // 界面同步：等到该响的时候再点亮（不能用 schedule 时间直接 setState）
      const delay = Math.max(0, (time - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        dotsRef.current.delete(id);
        setActive(inBar);
      }, delay);
      dotsRef.current.add(id);

      cursor.current = { time: time + step, index: index + 1 };

      // 每 N 小节的最后一格提速
      const bar = Math.floor(index / perBar);
      if (current && inBar === perBar - 1 && bar % current.bars === current.bars - 1) {
        const next = Math.min(current.max ?? 200, bpmRef.current + current.step);
        if (next !== bpmRef.current) {
          bpmRef.current = next;
          onBpmRef.current?.(next);
        }
      }
    }
  }

  function start() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = audioRef.current ?? new Ctor();
    audioRef.current = ctx;
    void ctx.resume();
    cursor.current = { time: ctx.currentTime + 0.08, index: 0 };
    setRunning(true);
    setActive(-1);
    timerRef.current = window.setInterval(tick, 25);
  }

  return { running, active, start, stop };
}
