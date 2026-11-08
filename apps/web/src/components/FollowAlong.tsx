import { useEffect, useState } from "react";
import type { Tab } from "@guitar/core";
import { useMetronome } from "../hooks/useMetronome";
import TabScore from "./TabScore";

export interface FollowTarget {
  id: string;
  name: string;
  bpm: [number, number];
  tab: Tab;
}

export interface FollowAlongProps {
  target: FollowTarget;
  /** 之前练到过的最高速度（没有就不显示）。 */
  best?: number;
  onFinish: (result: { bpm: number; minutes: number }) => void;
  onClose: () => void;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 跟练：选一条练习，节拍器起速 `bpm`，每 4 小节自动 +5，练到卡住为止。
 *
 * 为什么要自动加速：练节奏最容易"待在舒服的速度里"。把提速交给节拍器，
 * 人只需要判断「刚才那遍稳不稳」；结束时记下当前速度，下次从这儿接着来。
 */
export default function FollowAlong({ target, best, onFinish, onClose }: FollowAlongProps) {
  const [bpm, setBpm] = useState(target.bpm[0]);
  const [ramp, setRamp] = useState(true);
  const [seconds, setSeconds] = useState(0);

  const { running, start, stop } = useMetronome({
    bpm,
    meterId: "4/4",
    subdivision: 1,
    ramp: ramp ? { bars: 4, step: 5 } : undefined,
    onBpm: setBpm,
  });

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // 换一条练习就重置速度与计时（卸载时由 useMetronome 自己收尾）
  useEffect(() => {
    setBpm(target.bpm[0]);
    setSeconds(0);
    stop();
  }, [target.id]);

  function finish() {
    onFinish({ bpm, minutes: Math.max(1, Math.round(seconds / 60)) });
    stop();
    setSeconds(0);
  }

  return (
    <section className="follow" aria-label={`跟练：${target.name}`}>
      <header className="follow-head">
        <div>
          <h3>跟练 · {target.name}</h3>
          <p>
            起始 {target.bpm[0]} BPM，目标 {target.bpm[1]} BPM
            {best ? ` · 之前最高 ${best} BPM` : ""}
          </p>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          收起
        </button>
      </header>

      <div className="follow-main">
        <div className="follow-tempo">
          <b>{bpm}</b>
          <span>BPM</span>
        </div>

        <div className="follow-controls">
          <button
            type="button"
            className={running ? "btn primary" : "btn"}
            onClick={() => (running ? stop() : start())}
          >
            {running ? "停止" : "开始跟练"}
          </button>

          <label className="follow-field">
            <span>速度</span>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={bpm}
              aria-label="跟练速度（每分钟拍数）"
              onChange={(event) => setBpm(Number(event.target.value))}
            />
          </label>

          <label className="follow-check">
            <input
              type="checkbox"
              checked={ramp}
              onChange={(event) => {
                setRamp(event.target.checked);
                setBpm(target.bpm[0]);
              }}
            />
            每 4 小节 +5
          </label>

          <span className="follow-clock" role="timer" aria-live="off">
            {clock(seconds)}
          </span>

          <button type="button" className="btn" onClick={finish} disabled={seconds === 0}>
            记录成绩
          </button>
        </div>
      </div>

      <TabScore tab={target.tab} bpm={bpm} />

      <p className="follow-hint">
        先跟着节拍器把这一遍弹稳；稳不住就按「停止」，把速度退回去再练。
        「记录成绩」只记当前速度，不判分——判断稳不稳的还是你的耳朵。
      </p>
    </section>
  );
}
