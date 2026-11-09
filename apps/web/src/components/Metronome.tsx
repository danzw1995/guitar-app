import { useState } from "react";
import {
  METERS,
  SUBDIVISION_LABEL,
  clicksPerBar,
  gridSlots,
  type Subdivision,
} from "@guitar/core";
import { useMetronome } from "../hooks/useMetronome";
import { useAudioVolume, volumeLabel } from "../lib/audio-bus";

/**
 * 节拍器面板：拍号、细分、速度、「每 4 小节 +5」。
 *
 * 发声与排程在 `useMetronome` 里（跟练模式共用同一套时钟）。
 */
export default function Metronome() {
  const [bpm, setBpm] = useState(70);
  const [meterId, setMeterId] = useState("4/4");
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const [ramp, setRamp] = useState(false);
  const [volume, setVolume] = useAudioVolume();

  const { running, active, start, stop } = useMetronome({
    bpm,
    meterId,
    subdivision,
    ramp: ramp ? { bars: 4, step: 5 } : undefined,
    onBpm: setBpm,
  });

  const slots = gridSlots(meterId, subdivision);
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
            onChange={(event) => setBpm(Number(event.target.value))}
          />
          <b className="metro-bpm">{bpm}</b>
        </label>

        <label className="metro-field">
          <span>拍号</span>
          <select
            value={meterId}
            aria-label="拍号"
            onChange={(event) => setMeterId(event.target.value)}
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
            onChange={(event) => setSubdivision(Number(event.target.value) as Subdivision)}
          >
            {([1, 2, 3, 4] as Subdivision[]).map((value) => (
              <option key={value} value={value}>
                {SUBDIVISION_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="metro-field">
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            aria-label="节拍器与试听的音量"
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
          />
          <b className="metro-bpm">{volumeLabel(volume)}</b>
        </label>

        <label className="metro-check">
          <input
            type="checkbox"
            checked={ramp}
            onChange={(event) => setRamp(event.target.checked)}
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
