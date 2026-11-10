import { n, tabOf, type Tab } from "@guitar/core";
import { asciiTabToSpec } from "@danzw777/tab-score/ascii";
import { specToAlphaTex } from "@danzw777/tab-score/spec";

const STORAGE_KEY = "guitar.scores.v1";

/** 自己粘进来的一条谱（只存原文与标题，谱面每次打开现画）。 */
export interface MyScore {
  id: string;
  title: string;
  ascii: string;
  createdAt: number;
}

interface SpecNote {
  string: number;
  fret: number | string;
}

interface SpecHit {
  at: number;
  dur: number;
  notes: SpecNote[];
}

interface ScoreSpec {
  title?: string;
  tempo?: number;
  timeSignature?: [number, number];
  bars: { hits: SpecHit[] }[];
}

export interface ParsedScore {
  title: string;
  tex: string;
  tab: Tab | null;
  meter: string;
  bpm: number;
  error?: string;
}

function meterOf([numerator, denominator]: [number, number]): string {
  return `${numerator}/${denominator}`;
}

/** 一拍等于几个四分音符：常见拍号是 1，6/8 是 0.5。 */
function quartersPerBeat(denominator: number): number {
  return denominator === 8 ? 0.5 : 1;
}

/**
 * ASCII 六线谱 → alphaTex（给谱面）和 Tab（给试听/跟练）。
 * 解析失败只返回 error，不抛异常。
 */
export function parseScore(text: string): ParsedScore {
  const fallback: ParsedScore = {
    title: "我的谱",
    tex: "",
    tab: null,
    meter: "4/4",
    bpm: 80,
  };
  if (text.trim().length === 0) {
    return { ...fallback, error: "先粘一段六线谱进来（六行弦线，用 | 分小节）" };
  }

  let spec: ScoreSpec;
  try {
    spec = asciiTabToSpec(text) as ScoreSpec;
  } catch (error) {
    return { ...fallback, error: (error as Error).message };
  }

  const timeSignature = spec.timeSignature ?? ([4, 4] as [number, number]);
  const [numerator, denominator] = timeSignature;
  const beatsPerBar = numerator;
  const unit = quartersPerBeat(denominator);

  const title = spec.title?.trim() || "我的谱";
  const bpm = spec.tempo && spec.tempo > 0 ? Math.round(spec.tempo) : 80;

  const notes = spec.bars.flatMap((bar, barIndex) =>
    bar.hits.flatMap((hit) =>
      hit.notes
        .filter((note) => note.fret !== "x" && note.fret !== "X")
        .map((note) =>
          n(
            note.string,
            Number(note.fret),
            barIndex * beatsPerBar + hit.at / unit,
            Math.max(0.0625, hit.dur / unit),
          ),
        ),
    ),
  );

  const tab =
    notes.length > 0
      ? tabOf(notes, {
          bars: spec.bars.length,
          beatsPerBar,
          caption: `${meterOf(timeSignature)} · ${bpm} BPM`,
        })
      : null;

  if (!tab) {
    return { ...fallback, title, bpm, error: "这段谱里没有音，只画了横线和竖线" };
  }

  return {
    title,
    tex: specToAlphaTex({ ...spec, title: undefined, tempo: undefined, bars: spec.bars }),
    tab,
    meter: meterOf(timeSignature),
    bpm,
  };
}

export function loadScores(): MyScore[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MyScore[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.id === "string" && typeof item.ascii === "string")
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function persist(scores: MyScore[]): MyScore[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 40)));
  } catch {
    // 存储满了就先不管：这一次的操作结果仍然返回给界面。
  }
  return scores;
}

export function addScore(input: { title: string; ascii: string }): MyScore[] {
  const score: MyScore = {
    id: `my-${Date.now().toString(36)}`,
    title: input.title.trim() || "我的谱",
    ascii: input.ascii,
    createdAt: Date.now(),
  };
  return persist([score, ...loadScores().filter((item) => item.ascii !== input.ascii)]);
}

export function removeScore(id: string): MyScore[] {
  return persist(loadScores().filter((item) => item.id !== id));
}
