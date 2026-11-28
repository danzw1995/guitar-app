// 「练一首」曲目库（v0.174.0）
//
// 目的：把碎片练习串成「能弹一首」的落点。每首都是 8 小节：
//   - 旋律：调内级数 + 时值，落到 1–3 弦 0–12 品（初学者把位）
//   - 伴奏：每小节一个和弦，用 progressionTab() 铺成扫弦
// 旋律都取自公有领域的传统曲调（小星星 / 两只老虎 / 欢乐颂 / 划船歌 /
// 玛丽有只小羊羔 / 伦敦桥），和弦进行、扫弦型、把位是这里自己编的，
// 不抄任何现成编配与录音。

import { n, progressionTab, tabOf, type Tab } from "./tab.ts";

/** 调内级数：0 = 主音（C4），7 = 高八度主音。 */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
/** 空弦音高（6→1 弦），旋律只落在 1–3 弦。 */
const OPEN = { 1: 64, 2: 59, 3: 55 } as const;

/** 一个音：第几拍（0 起）、几拍长、调内第几级。 */
interface Tone {
  beat: number;
  dur: number;
  degree: number;
}

export interface Song {
  id: string;
  /** 练习编号，卡片上写「第 1 首 · 小星星」 */
  no: number;
  title: string;
  source: string;
  level: 1 | 2 | 3;
  keyId: "C";
  keyLabel: string;
  meter: "4/4";
  bpm: [number, number];
  /** 每小节一个和弦名（8 小节） */
  chords: string[];
  melody: Tab;
  strum: Tab;
  tip: string;
}

/** 在 1–3 弦 0–12 品里找最低的按法（同一品优先高音弦）。 */
function place(midi: number): { s: number; f: number } {
  let best: { s: number; f: number } | null = null;
  for (const s of [1, 2, 3] as const) {
    const fret = midi - OPEN[s];
    if (fret < 0 || fret > 12) continue;
    if (!best || fret < best.f) best = { s, f: fret };
  }
  if (best) return best;
  return { s: 1, f: Math.max(0, Math.min(12, midi - OPEN[1])) };
}

/** 旋律 → 六线谱（8 小节 4/4）。 */
function melodyTab(titles: string, tones: Tone[], bpm: number): Tab {
  const notes = tones.map((tone) => {
    const midi = 60 + MAJOR_STEPS[Math.max(0, Math.min(7, tone.degree))];
    const spot = place(midi);
    return n(spot.s, spot.f, tone.beat, tone.dur);
  });
  return tabOf(notes, {
    beatsPerBar: 4,
    bars: 8,
    bpm: [bpm, bpm],
    caption: `${titles} · 旋律`,
  });
}

/** 每小节一个和弦，铺成四分扫弦（下 下 上 上，慢速好跟）。 */
const STRUMS: ("D" | "U" | null)[] = ["D", "D", "U", "U"];

function strumTab(titles: string, chords: string[], bpm: number): Tab {
  return {
    ...progressionTab({
      names: chords,
      beatsEach: 4,
      step: 1,
      strums: STRUMS,
      beatsPerBar: 4,
    }),
    bpm: [bpm, bpm],
    caption: `${titles} · 伴奏`,
  };
}

function song(input: {
  no: number;
  id: string;
  title: string;
  source: string;
  level: 1 | 2 | 3;
  bpm: [number, number];
  chords: string[];
  tones: Tone[];
  tip: string;
}): Song {
  return {
    id: input.id,
    no: input.no,
    title: input.title,
    source: input.source,
    level: input.level,
    keyId: "C",
    keyLabel: "C 大调",
    meter: "4/4",
    bpm: input.bpm,
    chords: input.chords,
    melody: melodyTab(input.title, input.tones, input.bpm[0]),
    strum: strumTab(input.title, input.chords, input.bpm[0]),
    tip: input.tip,
  };
}

// 下面六首的旋律都写成 [第几拍, 几拍长, 第几级]，一拍一个音为主，
// 偶尔两个音（两只老虎那句「跑得快」）和落在两拍上的长音。
const q = (beat: number, degree: number): Tone => ({ beat, dur: 1, degree });
const h = (beat: number, degree: number): Tone => ({ beat, dur: 2, degree });
const w = (beat: number, degree: number): Tone => ({ beat, dur: 4, degree });
const e = (beat: number, degree: number): Tone => ({ beat, dur: 0.5, degree });

export const SONGS: Song[] = [
  song({
    no: 1,
    id: "song-star",
    title: "小星星",
    source: "传统儿歌",
    level: 1,
    bpm: [64, 84],
    chords: ["C", "C", "F", "C", "F", "C", "G", "C"],
    tones: [
      q(0, 0), q(1, 0), q(2, 4), q(3, 4),
      q(4, 5), q(5, 5), h(6, 4),
      q(8, 3), q(9, 3), q(10, 2), q(11, 2),
      q(12, 1), q(13, 1), h(14, 0),
      q(16, 4), q(17, 4), q(18, 3), q(19, 3),
      q(20, 2), q(21, 2), h(22, 1),
      q(24, 4), q(25, 4), q(26, 3), q(27, 3),
      q(28, 2), q(29, 2), h(30, 0),
    ],
    tip: "第一遍只弹旋律、嘴里跟着唱；第二遍换成伴奏扫弦，旋律在心里唱。",
  }),
  song({
    no: 2,
    id: "song-tiger",
    title: "两只老虎",
    source: "法国民歌",
    level: 1,
    bpm: [66, 88],
    chords: ["C", "C", "C", "C", "F", "C", "G", "C"],
    tones: [
      q(0, 0), q(1, 1), q(2, 2), q(3, 0),
      q(4, 0), q(5, 1), q(6, 2), q(7, 0),
      q(8, 2), q(9, 3), h(10, 4),
      q(12, 2), q(13, 3), h(14, 4),
      e(16, 4), e(16.5, 5), e(17, 4), e(17.5, 3), q(18, 2), q(19, 0),
      e(20, 4), e(20.5, 5), e(21, 4), e(21.5, 3), q(22, 2), q(23, 0),
      q(24, 0), q(25, 4), h(26, 0),
      w(28, 0),
    ],
    tip: "「跑得快」那一句是八分音符，右手要提前准备好，别抢。",
  }),
  song({
    no: 3,
    id: "song-joy",
    title: "欢乐颂",
    source: "贝多芬《第九交响曲》主题",
    level: 2,
    bpm: [60, 80],
    chords: ["C", "G", "C", "G", "C", "G", "G", "C"],
    tones: [
      q(0, 2), q(1, 2), q(2, 3), q(3, 4),
      q(4, 4), q(5, 3), q(6, 2), q(7, 1),
      q(8, 0), q(9, 0), q(10, 1), q(11, 2),
      q(12, 1), q(13, 0), h(14, 0),
      q(16, 2), q(17, 2), q(18, 3), q(19, 4),
      q(20, 4), q(21, 3), q(22, 2), q(23, 1),
      q(24, 0), q(25, 0), q(26, 1), q(27, 2),
      h(28, 1), h(30, 0),
    ],
    tip: "长音（两拍）上别急着走，数满两拍再换下一个音。",
  }),
  song({
    no: 4,
    id: "song-row",
    title: "划船歌",
    source: "美国传统歌曲",
    level: 2,
    bpm: [64, 84],
    chords: ["C", "C", "C", "C", "C", "C", "G", "C"],
    tones: [
      q(0, 0), q(1, 0), q(2, 0), q(3, 1),
      h(4, 2), q(6, 2), q(7, 1),
      q(8, 2), q(9, 3), h(10, 4),
      h(12, 7), h(14, 4),
      q(16, 7), q(17, 7), q(18, 7), q(19, 4),
      q(20, 4), q(21, 4), q(22, 2), q(23, 2),
      q(24, 0), q(25, 0), q(26, 0), q(27, 1),
      h(28, 2), h(30, 0),
    ],
    tip: "「划船」那两句音高一样，靠左手换弦别停拍子。",
  }),
  song({
    no: 5,
    id: "song-mary",
    title: "玛丽有只小羊羔",
    source: "美国传统儿歌",
    level: 1,
    bpm: [62, 82],
    chords: ["C", "C", "G", "C", "C", "C", "G", "C"],
    tones: [
      q(0, 2), q(1, 1), q(2, 0), q(3, 1),
      q(4, 2), q(5, 2), h(6, 2),
      q(8, 1), q(9, 1), h(10, 1),
      q(12, 2), q(13, 4), h(14, 4),
      q(16, 2), q(17, 1), q(18, 0), q(19, 1),
      q(20, 2), q(21, 2), q(22, 2), q(23, 2),
      q(24, 1), q(25, 1), q(26, 2), q(27, 1),
      w(28, 0),
    ],
    tip: "全曲只有 C–E–G 三个音，先把这三个音的按法练顺。",
  }),
  song({
    no: 6,
    id: "song-london",
    title: "伦敦桥",
    source: "英国传统儿歌",
    level: 3,
    bpm: [66, 88],
    chords: ["C", "C", "G", "C", "C", "C", "G", "C"],
    tones: [
      q(0, 4), q(1, 5), q(2, 4), q(3, 3),
      q(4, 2), q(5, 3), h(6, 4),
      q(8, 1), q(9, 2), h(10, 3),
      q(12, 2), q(13, 3), h(14, 4),
      q(16, 4), q(17, 5), q(18, 4), q(19, 3),
      q(20, 2), q(21, 3), h(22, 4),
      q(24, 1), q(25, 4), q(26, 2), q(27, 0),
      w(28, 0),
    ],
    tip: "倒数第二小节要换到 G 弦再回来，慢速先把这个换弦练熟。",
  }),
];

export const SONG_BY_ID = new Map(SONGS.map((item) => [item.id, item]));

export function songById(id: string): Song | undefined {
  return SONG_BY_ID.get(id);
}

/** 各曲目的谱图 id（gen-scores 生成两张：旋律 + 伴奏）。 */
export function songScoreIds(song: Song): { melody: string; strum: string } {
  return { melody: `${song.id}-melody`, strum: `${song.id}-strum` };
}
