import { useEffect, useState } from "react";
import type { Tab } from "@guitar/core";
import { METERS, SUBDIVISION_LABEL, type Subdivision } from "@guitar/core";
import { useMetronome } from "../hooks/useMetronome";
import { useAudioVolume, volumeLabel } from "../lib/audio-bus";
import TabScore from "./TabScore";

export interface FollowTarget {
  id: string;
  name: string;
  bpm: [number, number];
  tab: Tab;
  /** 练习自己的拍号（2/4、3/4、6/8…），节拍器按它数拍。 */
  meter?: string;
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
 * 按谱子的内容挑一个默认的「每拍数几下」。
 *
 * 6/8 的谱一拍本来就是八分，按一拍一下数；
 * 其余拍子看最短的音——有八分/十六分就按八分提示，纯四分就只数拍点。
 * 太细的细分（十六分）在慢速时反而吵，所以默认不选它。
 */
function defaultSubdivision(tab: Tab, meter: string): Subdivision {
  if (meter === "6/8") return 1;
  const finest = tab.notes.length
    ? Math.min(...tab.notes.map((note) => note.dur))
    : 1;
  return finest <= 0.51 ? 2 : 1;
}

/**
 * 跟练：选一条练习，节拍器按练习自己的拍号起速，隔几小节往上加一点。
 *
 * 为什么要自动加速：练节奏最容易"待在舒服的速度里"。把提速交给节拍器，
 * 人只需要判断「刚才那遍稳不稳」；结束时记下当前速度，下次从这儿接着来。
 *
 * 起始速度、每次加多少、几小节加一次都可以改——每个人的"卡点"不一样，
 * 有人 86 就能稳，有人得从 60 起。
 */
export default function FollowAlong({ target, best, onFinish, onClose }: FollowAlongProps) {
  const meter = target.meter ?? "4/4";
  const [startBpm, setStartBpm] = useState(target.bpm[0]);
  const [bpm, setBpm] = useState(target.bpm[0]);
  const [ramp, setRamp] = useState(true);
  const [step, setStep] = useState(5);
  const [bars, setBars] = useState(4);
  const [subdivision, setSubdivision] = useState<Subdivision>(() =>
    defaultSubdivision(target.tab, meter),
  );
  const [seconds, setSeconds] = useState(0);
  const [volume, setVolume] = useAudioVolume();

  const { running, start, stop } = useMetronome({
    bpm,
    meterId: meter,
    subdivision,
    ramp: ramp ? { bars, step } : undefined,
    onBpm: setBpm,
  });

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // 换一条练习就重置速度与计时（卸载时由 useMetronome 自己收尾）
  useEffect(() => {
    setStartBpm(target.bpm[0]);
    setBpm(target.bpm[0]);
    setSeconds(0);
    setSubdivision(defaultSubdivision(target.tab, meter));
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
            {meter} · 起始 {bpm} BPM，目标 {target.bpm[1]} BPM
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
            <span>起始</span>
            <input
              type="number"
              min={30}
              max={220}
              step={1}
              value={startBpm}
              aria-label="起始速度（每分钟拍数）"
              onChange={(event) => {
                const value = Number(event.target.value);
                setStartBpm(value);
                setBpm(value);
              }}
            />
          </label>

          <label className="follow-field">
            <span>速度</span>
            <input
              type="range"
              min={30}
              max={220}
              step={1}
              value={bpm}
              aria-label="跟练速度（每分钟拍数）"
              onChange={(event) => setBpm(Number(event.target.value))}
            />
          </label>

          <label className="follow-field">
            <span>数拍</span>
            <select
              value={subdivision}
              aria-label="节拍器按几分音符数拍"
              onChange={(event) => setSubdivision(Number(event.target.value) as Subdivision)}
            >
              {([1, 2, 3, 4] as Subdivision[]).map((value) => (
                <option key={value} value={value}>
                  {SUBDIVISION_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="follow-check">
            <input
              type="checkbox"
              checked={ramp}
              onChange={(event) => {
                setRamp(event.target.checked);
                setBpm(startBpm);
              }}
            />
            自动加速
          </label>

          <label className="follow-field">
            <span>每</span>
            <select
              value={bars}
              aria-label="每几小节加速一次"
              disabled={!ramp}
              onChange={(event) => setBars(Number(event.target.value))}
            >
              {[2, 4, 8, 16].map((value) => (
                <option key={value} value={value}>
                  {value} 小节
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>加</span>
            <select
              value={step}
              aria-label="每次加速多少"
              disabled={!ramp}
              onChange={(event) => setStep(Number(event.target.value))}
            >
              {[2, 3, 5, 8, 10].map((value) => (
                <option key={value} value={value}>
                  {value} BPM
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>音量</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              aria-label="节拍器音量"
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
            />
            <b className="follow-volume">{volumeLabel(volume)}</b>
          </label>

          <span className="follow-clock" role="timer" aria-live="off">
            {clock(seconds)}
          </span>

          <button type="button" className="btn" onClick={finish} disabled={seconds === 0}>
            记录成绩
          </button>
        </div>
      </div>

      <TabScore id={target.id} tab={target.tab} />

      <p className="follow-hint">
        先跟着节拍器把这一遍弹稳；稳不住就按「停止」，把速度退回去再练。
        「记录成绩」只记当前速度，不判分——判断稳不稳的还是你的耳朵。拍号跟着练习走（
        {METERS.find((item) => item.id === meter)?.label ?? meter}）。
      </p>
    </section>
  );
}
