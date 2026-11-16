import { STANDARD_TUNING, noteNameOf, type Tab } from "@guitar/core";
import type { ScoreImage } from "../lib/score-image";

export interface BassPoint {
  x: number;
  y: number;
  moved: boolean;
}

/**
 * 谱上低音走线的坐标（v0.93.0）。
 *
 * 每个「起音拍」上取**最低**那个音当低音——和弦谱就是每个和弦的低音，
 * 音高映射到那一拍的纵向范围里：高的在上、低的在下。
 */
export function bassPointsOf(tab: Tab, image: ScoreImage): BassPoint[] | null {
  const bands = image.beats;
  if (!bands?.length) return null;

  const onsets = [...new Set(tab.notes.map((note) => note.beat))].sort((a, b) => a - b);
  const bass = onsets.map((beat) => {
    const midis = tab.notes
      .filter((note) => note.beat === beat)
      .map((note) => (STANDARD_TUNING.strings[note.s - 1] ?? 0) + note.f);
    return midis.length ? Math.min(...midis) : null;
  });

  const heard = bass.filter((midi): midi is number => midi !== null);
  if (heard.length < 2) return null;
  const lows = Math.min(...heard);
  const highs = Math.max(...heard);
  const span = highs - lows || 1;

  const points: BassPoint[] = [];
  bass.forEach((midi, index) => {
    if (midi === null) return;
    const band = bands[onsets[index]];
    if (!band) return;
    const top = band.y + band.h * 0.18;
    const bottom = band.y + band.h * 0.82;
    const ratio = highs === lows ? 0.5 : (highs - midi) / span;
    const previous = points.length ? bass[index - 1] : null;
    points.push({
      x: Number((band.x + band.w / 2).toFixed(1)),
      y: Number((top + ratio * (bottom - top)).toFixed(1)),
      moved: previous !== null && previous !== undefined && previous !== midi,
    });
  });

  return points.length >= 2 ? points : null;
}

/** 把低音走线叠在已经渲染好的谱图上（绝对定位，不改变谱的尺寸）。 */
export default function BassOverlay({ tab, image }: { tab: Tab; image: ScoreImage }) {
  const points = bassPointsOf(tab, image);
  if (!points) return null;
  return (
    <svg
      className="cl-basschart cl-basschart-overlay"
      viewBox={`0 0 ${image.width} ${image.height}`}
      role="img"
      aria-label={`谱上的低音走线：${bassNamesOf(tab).join(" → ")}`}
    >
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={point.moved ? 2.4 : 1.8} />
      ))}
    </svg>
  );
}

/** 低音的音名序列（给读屏用）：每个起音拍上最低那个音。 */
export function bassNamesOf(tab: Tab): string[] {
  const onsets = [...new Set(tab.notes.map((note) => note.beat))].sort((a, b) => a - b);
  return onsets.map((beat) => {
    const midis = tab.notes
      .filter((note) => note.beat === beat)
      .map((note) => (STANDARD_TUNING.strings[note.s - 1] ?? 0) + note.f);
    return midis.length ? noteNameOf(Math.min(...midis)) : "";
  });
}
