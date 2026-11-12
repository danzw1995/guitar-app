import { useEffect, useRef, useState } from "react";
import { clicksPerBar, gridSlots, type Subdivision } from "@guitar/core";
import { claimAudio, getVolume, releaseAudio } from "../lib/audio-bus";

export interface MetronomeOptions {
  bpm: number;
  meterId: string;
  subdivision: Subdivision;
  /** 每 `bars` 小节加速 `step`（不传 = 不加速）。 */
  ramp?: { bars: number; step: number; max?: number };
  /** 自动加速时的回调（父组件用它更新显示）。 */
  onBpm?: (bpm: number) => void;
  /** 正式开练前先空打几小节（0 = 不打）。 */
  countIn?: number;
  /** 只练第 from 到第 to 小节（1 起，含两端），打完回头。 */
  loop?: { from: number; to: number } | null;
}

export interface MetronomeHandle {
  running: boolean;
  /** 当前响到一小节里的第几格。 */
  active: number;
  /** 当前第几小节（预备阶段是 0）。 */
  bar: number;
  /** 还在预备拍里（正式那遍没开始）。 */
  countingIn: boolean;
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
 *
 * 预备拍与 A-B 循环都在这里算：它们改的是"第 index 下属于哪一小节"，
 * 交给同一个排程循环，声音才不会断。
 */
export function useMetronome({
  bpm,
  meterId,
  subdivision,
  ramp,
  onBpm,
  countIn,
  loop,
}: MetronomeOptions): MetronomeHandle {
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(-1);
  const [bar, setBar] = useState(0);
  const [countingIn, setCountingIn] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const dotsRef = useRef<Set<number>>(new Set());
  const cursor = useRef({ time: 0, index: 0 });
  // 音频时钟起点的对照：有些环境（无声卡的浏览器、被挂起的上下文）currentTime 不走，
  // 这时退回墙钟，界面至少还能一节一节往下走。
  const clockRef = useRef({ audio: 0, wall: 0 });
  const ownerRef = useRef<symbol | null>(null);
  const owner = () => {
    ownerRef.current ??= Symbol("metronome");
    return ownerRef.current;
  };

  const bpmRef = useRef(bpm);
  const meterRef = useRef(meterId);
  const subRef = useRef(subdivision);
  const rampRef = useRef(ramp);
  const onBpmRef = useRef(onBpm);
  const countInRef = useRef(countIn ?? 0);
  const loopRef = useRef(loop ?? null);
  const slotsRef = useRef(gridSlots(meterId, subdivision));

  bpmRef.current = bpm;
  meterRef.current = meterId;
  subRef.current = subdivision;
  rampRef.current = ramp;
  onBpmRef.current = onBpm;
  countInRef.current = countIn ?? 0;
  loopRef.current = loop ?? null;
  slotsRef.current = gridSlots(meterId, subdivision);

  function clearDots() {
    for (const id of dotsRef.current) window.clearTimeout(id);
    dotsRef.current.clear();
  }

  function stop() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    clearDots();
    releaseAudio(owner());
    setRunning(false);
    setActive(-1);
    setBar(0);
    setCountingIn(false);
  }

  useEffect(() => stop, []);

  /** 一声"哒"：重音高、细分音低。 */
  function click(ctx: AudioContext, when: number, accent: boolean, offBeat: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // 音量滑杆：0 就彻底不响，1 是原来的默认响度
    const volume = getVolume();
    osc.type = offBeat ? "sine" : "square";
    osc.frequency.value = accent ? 1568 : offBeat ? 660 : 1046;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(
      (accent ? 0.3 : offBeat ? 0.1 : 0.17) * volume,
      when + 0.002,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.07);
  }

  /**
   * 第 index 下落在哪：预备拍阶段 bar 记 0；
   * 循环时 bar 在 [from, to] 里来回走，pass 是第几遍。
   */
  function plan(index: number, perBar: number) {
    const countInBars = countInRef.current;
    const countInClicks = countInBars * perBar;
    if (index < countInClicks) {
      return { counting: true, bar: 0, inBar: index % perBar, pass: 0, last: false };
    }
    const practice = index - countInClicks;
    const range = loopRef.current;
    if (range) {
      const length = Math.max(1, range.to - range.from + 1);
      const pass = Math.floor(practice / (perBar * length));
      const offset = practice % (perBar * length);
      const step = Math.floor(offset / perBar);
      return {
        counting: false,
        bar: range.from + step,
        inBar: offset % perBar,
        pass,
        last: step === length - 1,
      };
    }
    const bar = Math.floor(practice / perBar);
    return { counting: false, bar, inBar: practice % perBar, pass: 0, last: false };
  }

  function tick() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const perBar = clicksPerBar(meterRef.current, subRef.current);
    const step = 60 / bpmRef.current / subRef.current;
    const current = rampRef.current;
    // 正常环境用音频时钟；上下文被挂起时 currentTime 不动，用墙钟兜底
    const wallNow = clockRef.current.audio + (performance.now() - clockRef.current.wall) / 1000;
    const now = Math.max(ctx.currentTime, wallNow);

    while (cursor.current.time < now + 0.12) {
      const { time, index } = cursor.current;
      const where = plan(index, perBar);
      const slot = slotsRef.current[where.inBar];
      click(ctx, time, slot.accent, !slot.onBeat);

      // 界面同步：等到该响的时候再点亮（不能用 schedule 时间直接 setState）
      const delay = Math.max(0, (time - now) * 1000);
      const id = window.setTimeout(() => {
        dotsRef.current.delete(id);
        setActive(where.inBar);
        setBar(where.bar);
        setCountingIn(where.counting);
      }, delay);
      dotsRef.current.add(id);

      cursor.current = { time: time + step, index: index + 1 };

      // 加速：循环时按「整遍」数小节，否则按小节数
      const loopLength = loopRef.current
        ? Math.max(1, loopRef.current.to - loopRef.current.from + 1)
        : 0;
      const unit = loopLength || 1;
      const done =
        current && where.inBar === perBar - 1
          ? loopLength
            ? where.last && where.pass % current.bars === current.bars - 1
            : Math.floor((index - countInRef.current * perBar) / perBar) % current.bars ===
              current.bars - 1
          : false;
      if (current && done && unit >= 0) {
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
    clockRef.current = { audio: ctx.currentTime, wall: performance.now() };
    cursor.current = { time: ctx.currentTime + 0.08, index: 0 };
    setRunning(true);
    setActive(-1);
    setBar(0);
    setCountingIn((countInRef.current ?? 0) > 0);
    // 同一时刻只响一路：把正在试听的那边掐掉
    claimAudio(owner(), stop);
    timerRef.current = window.setInterval(tick, 25);
  }

  return { running, active, bar, countingIn, start, stop };
}
