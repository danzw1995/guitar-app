import {
  ACCOMPANIMENTS,
  MELODY_DRILLS,
  READING_DRILLS,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
} from "@guitar/core";
import type { FollowTarget } from "../components/FollowAlong";
import { meterOfTab } from "./meter";
import { loadScores } from "./my-scores";

/** 没有写速度的那些（扫弦型这类）：给一个能起步的速度。 */
const FALLBACK_BPM = 70;

/**
 * 按 id 找回那条练习的跟练目标（v0.172.0）。
 *
 * 统计页「不加码那几轮」里点一行，要按那条最近的速度直接再来一轮——那边只有 id
 * （`guitar.rounds.v1` 的键），所以这里把节奏页六块 + 我的谱都翻一遍。
 * 找不到就返回 null（点那一行就只是回到节奏页，不乱开面板）。
 */
export function lookupFollow(id: string): FollowTarget | null {
  const reading = READING_DRILLS.find((item) => item.id === id);
  if (reading) {
    return {
      id: reading.id,
      name: reading.name,
      bpm: reading.bpm,
      tab: reading.tab,
      meter: meterOfTab(reading.tab),
    };
  }

  const rhythm = RHYTHM_DRILLS.find((item) => item.id === id);
  if (rhythm) {
    return {
      id: rhythm.id,
      name: rhythm.name,
      bpm: rhythm.bpm,
      tab: rhythm.tab,
      meter: meterOfTab(rhythm.tab),
    };
  }

  const melody = MELODY_DRILLS.find((item) => item.id === id);
  if (melody) {
    return {
      id: melody.id,
      name: melody.name,
      bpm: melody.bpm,
      tab: melody.tab,
      meter: meterOfTab(melody.tab),
    };
  }

  const strum = STRUM_DRILLS.find((item) => item.id === id);
  if (strum) {
    const bpm = strum.bpm ?? FALLBACK_BPM;
    return {
      id: strum.id,
      name: strum.name,
      bpm: [bpm, bpm + 30],
      tab: strum.tab,
      meter: strum.meter ?? meterOfTab(strum.tab),
    };
  }

  const accomp = ACCOMPANIMENTS.find((item) => item.id === id);
  if (accomp) {
    return {
      id: accomp.id,
      name: accomp.name,
      bpm: [accomp.bpm, accomp.bpm + 30],
      tab: accomp.tab,
      meter: accomp.meter ?? meterOfTab(accomp.tab),
    };
  }

  const library = STRUM_LIBRARY.find((item) => item.id === id);
  if (library) {
    return {
      id: library.id,
      name: library.name,
      bpm: [FALLBACK_BPM, FALLBACK_BPM + 30],
      tab: library.tab,
      meter: meterOfTab(library.tab),
    };
  }

  const song = SONG_SNIPPETS.find((item) => item.id === id);
  if (song) {
    return {
      id: song.id,
      name: song.name,
      bpm: song.bpm,
      tab: song.tab,
      meter: meterOfTab(song.tab),
    };
  }

  // 「我的谱」里那些（生成谱、扒出来的谱、切出来的一小节）：id 由记录自己带着
  const score = loadScores().find((item) => item.id === id && item.tab);
  if (score && score.tab) {
    const bpm = score.bpm ?? FALLBACK_BPM;
    return {
      id: score.id,
      name: score.title,
      bpm: [bpm, bpm + 40],
      tab: score.tab,
      meter: score.meter ?? meterOfTab(score.tab),
    };
  }

  return null;
}
