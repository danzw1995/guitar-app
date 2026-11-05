import { useEffect, useRef, useState } from "react";
import {
  METERS,
  SUBDIVISION_LABEL,
  clicksPerBar,
  gridSlots,
  type Subdivision,
} from "@guitar/core";

/**
 * 节拍器：用 Web Audio 现场合成"哒"，不需要任何音频文件。
 *
 * 排程用「提前量」的方式（每 25ms 看一眼未来 120ms），而不是 `setInterval` 直接发声——
 * 后者会被主线程卡顿拖歪，练节奏最怕的就是节拍器自己不稳。
 */
export default function Metronome() {
  const [bpm, setBpm] = useState(70);
  const [meterId, setMeterId] = useState("4/4");
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(-1);
  const [ramp, setRamp] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const dotsRef = useRef<Set<number>>(new Set());
  const cursor = useRef({ time: 0, index: 0 });
  const bpmRef = useRef(bpm);
  const meterRef = useRef(meterId);
  const subRef = useRef(subdivision);
  const rampRef = useRef(ramp);

  bpmRef.current = bpm;
  meterRef.current = meterId;
  subRef.current = subdivision;
  rampRef.current = ramp;

  const slots = gridSlots(meterId, subdivision);
  // 排程回调里要用最新的一格数据，但又不能让它成为 effect 依赖
  const gridSlotsRef = useRef(slots);
  gridSlotsRef.current = slots;

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
    gain.gain.linearRampToValueAtTime(accent ? 0.4 : offBeat ? 0.12 : 0.22, when + 0.002);
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

    while (cursor.current.time < ctx.currentTime + 0.12) {
      const { time, index } = cursor.current;
      const inBar = index % perBar;
      const slot = gridSlotsRef.current[inBar];
      click(ctx, time, slot.accent, !slot.onBeat);

      // 跟界面同步：等到该响的时候再点亮（不能用 schedule 时间直接 setState）
      const delay = Math.max(0, (time - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        dotsRef.current.delete(id);
        setActive(inBar);
      }, delay);
      dotsRef.current.add(id);

      cursor.current = { time: time + step, index: index + 1 };

      // 每 4 小节的最后一格提速——先练"稳",再练"跟得上"
      const bar = Math.floor(index / perBar);
      if (rampRef.current && inBar === perBar - 1 && bar % 4 === 3) {
        bpmRef.current = Math.min(200, bpmRef.current + 5);
        setBpm(bpmRef.current);
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

  const perBar = clicksPerBar(meterId, subdivision);

  return (
    <div className="metronome">
      <div className="metro-dots" aria-hidden="true">
        {slots.map((slot) => (
          <span
            key={slot.index}
            className={[
              "metro-dot",
              slot.accent ? "accent" : "",
              slot.onBeat ? "" : "sub",
              active === slot.index ? "on" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>

      <div className="metro-row">
        <button
          type="button"
          className={running ? "btn primary" : "btn"}
          onClick={() => (running ? stop() : start())}
        >
          {running ? "停止" : "开始"}
        </button>

        <label className="metro-field">
          <span>速度</span>
          <input
            type="range"
            min={40}
            max={200}
            step={1}
            value={bpm}
            aria-label="速度（每分钟拍数）"
            onChange={(event) => {
              const next = Number(event.target.value);
              bpmRef.current = next;
              setBpm(next);
            }}
          />
          <b className="metro-bpm">{bpm}</b>
        </label>

        <label className="metro-field">
          <span>拍号</span>
          <select
            value={meterId}
            aria-label="拍号"
            onChange={(event) => {
              meterRef.current = event.target.value;
              setMeterId(event.target.value);
              setActive(-1);
            }}
          >
            {METERS.map((meter) => (
              <option key={meter.id} value={meter.id}>
                {meter.id}
              </option>
            ))}
          </select>
        </label>

        <label className="metro-field">
          <span>细分</span>
          <select
            value={subdivision}
            aria-label="每拍几下"
            onChange={(event) => {
              subRef.current = Number(event.target.value) as Subdivision;
              setSubdivision(subRef.current);
              setActive(-1);
            }}
          >
            {([1, 2, 3, 4] as Subdivision[]).map((value) => (
              <option key={value} value={value}>
                {SUBDIVISION_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="metro-check">
          <input
            type="checkbox"
            checked={ramp}
            onChange={(event) => {
              rampRef.current = event.target.checked;
              setRamp(event.target.checked);
            }}
          />
          每 4 小节 +5
        </label>
      </div>

      <p className="metro-status" role="status">
        {meterId} · 每拍 {subdivision} 下（共 {perBar} 下）· {bpm} BPM
        {running ? " · 正在响" : " · 已停止"}
      </p>
    </div>
  );
}
