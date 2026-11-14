import { useEffect, useState } from "react";
import { PROGRESSIONS, chordAt, changesIn, dateKeyOf, drillBeats } from "@guitar/core";
import { loadChords, saveChords, type RhythmRecords } from "../lib/storage";
import { useMetronome } from "../hooks/useMetronome";

/** 换和弦的间隔（拍）：两拍换得快一点，四拍是「一小节一个」。 */
const GAPS = [2, 4] as const;

/**
 * 转换练习：一组和弦、每 N 拍换一个、跟着节拍器走一分钟。
 *
 * 和弦页原来只能「查」和「听」，转换是初学者最卡的地方——这里把它变成能计时的练习：
 * 跟得上就加速，跟不上就减速，成绩只记「跟得上的最快速度」。
 */
export default function ChordDrill() {
  const [progId, setProgId] = useState(PROGRESSIONS[0].id);
  const [bpm, setBpm] = useState(70);
  const [gap, setGap] = useState<number>(2);
  const [records, setRecords] = useState<RhythmRecords>(() => loadChords());
  const [result, setResult] = useState<{ changes: number; bpm: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const progression = PROGRESSIONS.find((item) => item.id === progId) ?? PROGRESSIONS[0];
  const metronome = useMetronome({ bpm, meterId: "4/4", subdivision: 1 });

  /** 一分钟正好是 `bpm` 拍。 */
  const total = drillBeats(bpm);
  const beat =
    metronome.running && metronome.active >= 0 ? metronome.bar * 4 + metronome.active : -1;
  const step = beat >= 0 ? chordAt(progression.chords, gap, beat) : null;
  const changed = beat >= 0 ? changesIn(beat + 1, gap) : 0;
  const finished = metronome.running && beat >= total;
  const best = records[progId]?.bestBpm ?? 0;

  // 走满一分钟就停：拍数就是时间，不用另开一个计时器（两个时钟早晚会漂）
  useEffect(() => {
    if (!finished) return;
    metronome.stop();
    setResult({ changes: changesIn(total, gap), bpm });
  }, [finished]);

  function startDrill() {
    setSaved(false);
    setResult(null);
    metronome.start();
  }

  function saveResult() {
    if (!result) return;
    const previous = records[progId];
    const next: RhythmRecords = {
      ...records,
      [progId]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + 1,
        lastAt: dateKeyOf(new Date()),
      },
    };
    setRecords(next);
    saveChords(next);
    setSaved(true);
  }

  return (
    <section className="panel chord-drill">
      <div className="panel-head">
        <h2>转换练习</h2>
        <p>
          挑一组进行，跟着节拍器每{gap === 2 ? "两" : "四"}拍换一个和弦，走一分钟。
          一分钟换 {changesIn(total, gap)} 次——跟不上就减速，跟得上就加速。
        </p>
      </div>

      <div className="cd-controls">
        <div className="cd-progs" role="group" aria-label="和弦进行">
          {PROGRESSIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === progId ? "chip on" : "chip"}
              aria-pressed={item.id === progId}
              onClick={() => {
                setProgId(item.id);
                setResult(null);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>

        <label className="cd-field">
          速度
          <input
            type="number"
            min={40}
            max={160}
            step={5}
            value={bpm}
            onChange={(e) => setBpm(Math.min(160, Math.max(40, Number(e.target.value) || 40)))}
          />
          BPM
        </label>

        <label className="cd-field">
          每
          <select value={gap} onChange={(e) => setGap(Number(e.target.value))}>
            {GAPS.map((value) => (
              <option key={value} value={value}>
                {value} 拍
              </option>
            ))}
          </select>
          换一个
        </label>

        <button
          type="button"
          className={metronome.running ? "btn" : "btn primary"}
          onClick={metronome.running ? metronome.stop : startDrill}
        >
          {metronome.running ? "停" : "开始"}
        </button>
      </div>

      {metronome.running && step ? (
        <div className="cd-display">
          <div className="cd-now">{step.chord}</div>
          <div className="cd-next">
            下一个 <b>{step.next}</b>
          </div>
          <div className="cd-stat">
            已换 {changed} 次 · 还剩 {Math.max(0, total - beat)} 拍
          </div>
          <div className="cd-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (beat / total) * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="cd-result" role="status">
          <p>
            一分钟换了 <b>{result.changes}</b> 次（{result.bpm} BPM，每 {gap} 拍换一个）。
          </p>
          {saved ? (
            <p className="cd-saved">记下了 · 最快 {best} BPM</p>
          ) : (
            <button type="button" className="btn primary" onClick={saveResult}>
              记成绩
            </button>
          )}
        </div>
      ) : null}

      {!metronome.running && !result ? (
        <p className="cd-hint muted">
          {best > 0 ? `这组进行的最好成绩：${best} BPM。` : "这组还没记过成绩。"}
          一分钟一局，练完点「记成绩」。
        </p>
      ) : null}
    </section>
  );
}
