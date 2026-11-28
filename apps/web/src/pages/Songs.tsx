import { useMemo, useState } from "react";
import {
  SONGS,
  dateKeyOf,
  noteJudge,
  pushBpmPoint,
  recordBlock,
  stageForCompleted,
  type Tab,
  type Song,
} from "@guitar/core";
import FollowAlong from "../components/FollowAlong";
import PlanButton from "../components/PlanButton";
import TabScore from "../components/TabScore";
import { useTone } from "../hooks/useTone";
import {
  loadPractice,
  loadProgress,
  loadRhythm,
  loadSettings,
  savePractice,
  saveRhythm,
  saveSettings,
  type RhythmRecords,
} from "../lib/storage";
import { pushRound } from "../lib/rounds";

const LEVEL_LABEL = { 1: "入门", 2: "基础", 3: "进阶" } as const;

interface FollowTarget {
  id: string;
  name: string;
  bpm: [number, number];
  tab: Tab;
  meter: string;
}

/** 曲目页（v0.174.0）：把碎片练习串成「能弹一首」。 */
export default function Songs() {
  const { playTab, playTabs, stop } = useTone();
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  const [playhead, setPlayhead] = useState<{ ids: string[]; beat: number } | null>(null);
  const [target, setTarget] = useState<FollowTarget | null>(null);
  /** 每首练哪一段（v0.175.0）：整首 / A 段 1–4 / B 段 5–8 */
  const [sections, setSections] = useState<Record<string, "all" | "A" | "B">>({});
  /** 伴奏当背景时压到多少（0–100，v0.176.0）：旋律永远 100。 */
  const [balance, setBalance] = useState(() => loadSettings().songBalance);
  const today = dateKeyOf(new Date());

  const best = (id: string) => records[id]?.bestBpm;
  const previousOf = (id: string) => (records[id]?.history ?? []).slice(-1)[0];
  const beatOf = (id: string) => (playhead && playhead.ids.includes(id) ? playhead.beat : null);

  const doneCount = useMemo(
    () => SONGS.filter((song) => (records[`${song.id}-melody`]?.sessions ?? 0) > 0).length,
    [records],
  );
  /** 旋律和伴奏都跟练过的首数（v0.177.0）：卡片上的「整首都练过」徽章与这句进度都读它。 */
  const wholeCount = useMemo(
    () =>
      SONGS.filter(
        (song) =>
          (records[`${song.id}-melody`]?.bestBpm ?? 0) > 0 &&
          (records[`${song.id}-strum`]?.bestBpm ?? 0) > 0,
      ).length,
    [records],
  );

  function audition(id: string, tab: Tab, bpm: number): void {
    stop();
    setPlayhead({ ids: [id], beat: 0 });
    playTab(tab, bpm, {
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { ids: [id], beat }),
    });
  }

  /** 两个声部一起听：旋律 + 伴奏叠在同一条时间轴上（v0.175.0）。 */
  function auditionBoth(song: Song): void {
    stop();
    const ids = [`${song.id}-melody`, `${song.id}-strum`];
    setPlayhead({ ids, beat: 0 });
    playTabs([song.melody, song.strum], song.bpm[0], {
      gains: [1, balance / 100],
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { ids, beat }),
    });
  }

  function changeBalance(next: number): void {
    setBalance(next);
    saveSettings({ ...loadSettings(), songBalance: next });
  }

  /** 自动判稳出结果（v0.177.0）：补到那条跟练曲线的当天点上。 */
  function judgeTarget(entry: { bpm: number; stdevMs: number }): void {
    if (!target) return;
    const previous = records[target.id];
    if (!previous) return;
    const next: RhythmRecords = {
      ...records,
      [target.id]: {
        ...previous,
        history: noteJudge(previous.history, today, entry.bpm, entry.stdevMs),
      },
    };
    setRecords(next);
    saveRhythm(next);
  }

  function record(result: { bpm: number; minutes: number }): void {
    if (!target) return;
    const previous = records[target.id];
    const next: RhythmRecords = {
      ...records,
      [target.id]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + result.minutes,
        lastAt: today,
        title: target.name,
        history: pushBpmPoint(previous?.history, today, result.bpm),
      },
    };
    setRecords(next);
    saveRhythm(next);

    const progress = loadProgress();
    const completed = Object.values(progress).filter((item) => item.completed).length;
    const log = loadPractice();
    savePractice(
      recordBlock(log, today, {
        drill: `rhythm:${target.id}`,
        minutes: result.minutes,
        stage: stageForCompleted(completed),
      }),
    );
  }

  function follow(song: Song, part: "melody" | "strum"): void {
    stop();
    const id = `${song.id}-${part}`;
    const section = sections[song.id] ?? "all";
    const loopRange =
      section === "A" ? { from: 1, to: 4 } : section === "B" ? { from: 5, to: 8 } : null;
    setTarget({
      id,
      name: `${song.title} · ${part === "melody" ? "旋律" : "伴奏"}${
        section === "all" ? "" : ` · ${section} 段`
      }`,
      bpm: [song.bpm[0], song.bpm[0] + 24],
      tab: part === "melody" ? song.melody : song.strum,
      meter: song.meter,
      ...(loopRange ? { loopRange } : {}),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>曲目</h2>
        <p>
          练到这里，可以试着弹一整首了。每首八小节：先只弹旋律、嘴里跟着唱，
          再把伴奏扫弦套进去。谱子都是标准调弦、前三个把位。
        </p>
      </div>

      <p className="song-progress" aria-label="曲目完成度">
        六首里已经跟练过 <b>{doneCount}</b> 首，整首（旋律 + 伴奏都练过）的 <b>{wholeCount}</b> 首
        {doneCount === 0 ? "——从第 1 首开始，慢速先把旋律走顺。" : "，挑下一首没练过的接着来。"}
      </p>

      <div className="song-grid">
        {SONGS.map((song) => {
          const melodyId = `${song.id}-melody`;
          const strumId = `${song.id}-strum`;
          const melodyBest = best(melodyId);
          const strumBest = best(strumId);
          const melodyDone = melodyBest !== undefined;
          const strumDone = strumBest !== undefined;
          const badge = melodyDone && strumDone
            ? { text: "整首都练过", tone: "both" }
            : melodyDone
              ? { text: "还差伴奏", tone: "half" }
              : strumDone
                ? { text: "还差旋律", tone: "half" }
                : { text: "还没练过", tone: "none" };
          return (
            <article className="song-card" id={`song-${song.id}`} key={song.id}>
              <div className="song-head">
                <span className="song-no">第 {song.no} 首</span>
                <h3>{song.title}</h3>
                <span className={`level-badge lv${song.level}`}>{LEVEL_LABEL[song.level]}</span>
                <span className={`song-badge ${badge.tone}`} data-song-badge={badge.tone}>
                  {badge.text}
                </span>
              </div>
              <p className="song-meta">
                {song.source} · {song.keyLabel} · {song.meter} · {song.bpm[0]}–{song.bpm[1]} BPM
              </p>
              <p className="song-chords">和弦：{song.chords.join(" – ")}</p>

              <div className="song-parts">
                <div className="song-part">
                  <h4>旋律</h4>
                  <TabScore id={melodyId} tab={song.melody} beat={beatOf(melodyId)} />
                  <p className="song-best">
                    {melodyBest === undefined ? "还没跟练过" : `最高 ${melodyBest} BPM`}
                  </p>
                </div>
                <div className="song-part">
                  <h4>伴奏</h4>
                  <TabScore id={strumId} tab={song.strum} beat={beatOf(strumId)} />
                  <p className="song-best">
                    {strumBest === undefined ? "还没跟练过" : `最高 ${strumBest} BPM`}
                  </p>
                </div>
              </div>

              <div className="song-sections">
                <label>
                  练哪一段
                  <select
                    aria-label={`${song.title} 练哪一段`}
                    value={sections[song.id] ?? "all"}
                    onChange={(event) =>
                      setSections((current) => ({
                        ...current,
                        [song.id]: event.target.value as "all" | "A" | "B",
                      }))
                    }
                  >
                    <option value="all">整首 8 小节</option>
                    <option value="A">A 段 1–4 小节</option>
                    <option value="B">B 段 5–8 小节</option>
                  </select>
                </label>
                <button type="button" className="btn-quiet" onClick={() => auditionBoth(song)}>
                  听两个声部一起
                </button>
                <label className="song-balance">
                  伴奏音量
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={balance}
                    aria-label="两个声部一起听时伴奏的音量"
                    onChange={(event) => changeBalance(Number(event.target.value))}
                  />
                  <span className="song-balance-value">{balance}%</span>
                </label>
              </div>

              <div className="song-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => audition(melodyId, song.melody, song.bpm[0])}
                >
                  试听旋律
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => audition(strumId, song.strum, song.bpm[0])}
                >
                  试听伴奏
                </button>
                <button type="button" className="btn primary" onClick={() => follow(song, "melody")}>
                  跟练旋律
                </button>
                <button type="button" className="btn" onClick={() => follow(song, "strum")}>
                  跟练伴奏
                </button>
                <PlanButton
                  title={`${song.title} · 旋律`}
                  tab={song.melody}
                  bpm={song.bpm[0]}
                  meter={song.meter}
                  suffix="旋律"
                />
                <PlanButton
                  title={`${song.title} · 伴奏`}
                  tab={song.strum}
                  bpm={song.bpm[0]}
                  meter={song.meter}
                  suffix="伴奏"
                />
              </div>

              <p className="song-tip">{song.tip}</p>
            </article>
          );
        })}
      </div>

      {target && (
        <FollowAlong
          target={target}
          onFinish={record}
          onClose={() => setTarget(null)}
          onRound={(entry) => pushRound(target.id, entry)}
          onJudge={judgeTarget}
          previous={previousOf(target.id)}
        />
      )}
    </section>
  );
}
