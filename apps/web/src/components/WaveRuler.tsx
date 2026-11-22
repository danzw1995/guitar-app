/**
 * 录音 + 节拍参考线（v0.151.0）：把波形画出来，再在波形上标出节拍器的位置和每一拍的落点。
 *
 * 解码一次就缓存下来（只留 110 列峰值，不留原始采样）；解不了的时候退回 BeatRuler 那条示意图，
 * 起码还能看出是抢还是拖。
 */
import { useEffect, useState } from "react";
import BeatRuler from "./BeatRuler";

export interface WaveRulerProps {
  /** 那一遍的录音（data URL） */
  audio: string;
  /** 每拍偏差（毫秒，负=抢、正=拖） */
  offsets: number[];
  bpm: number;
  /** 录音里第一下点击声的位置（毫秒） */
  originMs?: number;
  className?: string;
}

interface DecodedWave {
  peaks: number[];
  seconds: number;
}

const COLUMNS = 110;
const WIDTH = 220;
const HEIGHT = 34;
const CENTER = 17;
const AMP = 13;

const cache = new Map<string, DecodedWave>();

/** data URL 前缀都在 `data:audio/webm;base64,` 这一段上一样，得靠长度 + 尾巴区分 */
function cacheKeyOf(audio: string): string {
  return `${audio.length}:${audio.slice(-32)}`;
}

function bytesOf(dataUrl: string): ArrayBuffer | null {
  const body = dataUrl.split(",")[1];
  if (!body) return null;
  try {
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  }
}

function peaksOf(samples: Float32Array): number[] {
  const size = Math.max(1, Math.floor(samples.length / COLUMNS));
  const peaks: number[] = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    let peak = 0;
    const from = column * size;
    const to = Math.min(samples.length, from + size);
    for (let index = from; index < to; index += 1) {
      const value = Math.abs(samples[index]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }
  const max = peaks.reduce((best, peak) => Math.max(best, peak), 0.0001);
  return peaks.map((peak) => peak / max);
}

export default function WaveRuler({ audio, offsets, bpm, originMs = 0, className }: WaveRulerProps) {
  const [wave, setWave] = useState<DecodedWave | null>(() => cache.get(cacheKeyOf(audio)) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = cacheKeyOf(audio);
    const cached = cache.get(key);
    if (cached) {
      setWave(cached);
      return;
    }
    let alive = true;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const buffer = bytesOf(audio);
    if (!Ctor || !buffer) {
      setFailed(true);
      return;
    }
    const context = new Ctor();
    void context
      .decodeAudioData(buffer)
      .then((decoded) => {
        const samples = decoded.getChannelData(0);
        const next = { peaks: peaksOf(samples), seconds: decoded.duration };
        cache.set(key, next);
        if (alive) setWave(next);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        void context.close();
      });
    return () => {
      alive = false;
    };
  }, [audio]);

  if (failed) return <BeatRuler offsets={offsets} className={className} />;
  if (!wave) {
    return (
      <div className={`beat-ruler-wrap${className ? ` ${className}` : ""}`}>
        <span className="wave-ruler-loading">在解码录音…</span>
      </div>
    );
  }

  const seconds = Math.max(0.001, wave.seconds);
  const beatMs = 60000 / Math.max(1, bpm);
  const xOf = (t: number) => Math.max(0, Math.min(WIDTH, (t / seconds) * WIDTH));
  const clockTimes = offsets.map((_, index) => (originMs + index * beatMs) / 1000);
  const hitTimes = offsets.map((offset, index) => clockTimes[index] + offset / 1000);
  const worst = offsets.reduce(
    (pick, offset, index) => (Math.abs(offset) > Math.abs(offsets[pick]) ? index : pick),
    0,
  );
  const worstOffset = offsets[worst] ?? 0;
  const aria =
    `录音波形和每一拍的落点：${offsets.length} 拍，` +
    `偏得最多的是第 ${worst + 1} 拍，${worstOffset < 0 ? "抢" : "拖"} ${Math.abs(Math.round(worstOffset))} 毫秒`;

  // 波形轮廓：上沿一遍、再下沿倒着回来，围成一个可以填充的形状
  const top = wave.peaks.map((peak, index) => {
    const x = (index / (COLUMNS - 1)) * WIDTH;
    const y = CENTER - Math.max(0.04, peak) * AMP;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const bottom = [...wave.peaks].reverse().map((peak, index) => {
    const column = COLUMNS - 1 - index;
    const x = (column / (COLUMNS - 1)) * WIDTH;
    const y = CENTER + Math.max(0.04, peak) * AMP;
    return `L${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const shape = `${[...top, ...bottom].join(" ")} Z`;

  return (
    <div className={`wave-ruler-wrap${className ? ` ${className}` : ""}`}>
      <svg
        className="wave-ruler"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={aria}
      >
        <line className="wave-ruler-mid" x1={0} y1={CENTER} x2={WIDTH} y2={CENTER} />
        <path className="wave-ruler-shape" d={shape} />
        {clockTimes.map((time, index) =>
          // 录音只录到这一段：超出录音长度的拍不画（不然会全挤在最右边）
          time <= seconds + 0.02 ? (
            <line
              key={`clock-${index}-${Math.round(time * 1000)}`}
              className="wave-ruler-tick"
              x1={xOf(time)}
              y1={3}
              x2={xOf(time)}
              y2={HEIGHT - 3}
            />
          ) : null,
        )}
        {hitTimes.map((time, index) => {
          if (time > seconds + 0.02) return null;
          const offset = offsets[index];
          const mark = Math.abs(offset) <= 8 ? "on" : offset < 0 ? "early" : "late";
          return (
            <circle
              key={`hit-${index}-${Math.round(time * 1000)}`}
              className={`wave-ruler-dot ${mark}`}
              cx={xOf(time)}
              cy={CENTER}
              r={2.4}
            />
          );
        })}
      </svg>
      <span className="beat-ruler-hint">波形上是这一遍，竖线是节拍器</span>
    </div>
  );
}
