import { STANDARD_TUNING, degreeInKey, noteNameOf, type Tab } from "@guitar/core";
import type { ScoreImage } from "../lib/score-image";

export interface BassPoint {
  x: number;
  y: number;
  moved: boolean;
  /** 低音在这个调里的级数（1–7），调外是 0（v0.95.0 起按级数着色）。 */
  degree: number;
}

/**
 * 谱上低音走线的坐标（v0.93.0）。
 *
 * 每个「起音拍」上取**最低**那个音当低音——和弦谱就是每个和弦的低音，
 * 音高映射到那一拍的纵向范围里：高的在上、低的在下。
 *
 * `keyPc` 是算级数用的主音（v0.95.0）：不传就按第一个低音当主音。
 */
export function bassPointsOf(tab: Tab, image: ScoreImage, keyPc?: number): BassPoint[] | null {
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
  const key = keyPc ?? heard[0] % 12;

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
      degree: degreeInKey(((midi % 12) + 12) % 12, key),
    });
  });

  return points.length >= 2 ? points : null;
}

/**
 * 把低音走线叠在已经渲染好的谱图上（绝对定位，不改变谱的尺寸）。
 *
 * 点按级数着色（v0.95.0）：1 级最亮、5 级次之，其余压暗——
 * 一眼就能看出这段是不是「1 → 5 → 6 → 4」这种走向。
 */
export default function BassOverlay({
  tab,
  image,
  keyPc,
}: {
  tab: Tab;
  image: ScoreImage;
  keyPc?: number;
}) {
  const points = bassPointsOf(tab, image, keyPc);
  if (!points) return null;
  const names = bassNamesOf(tab);
  const degrees = points.map((point) => point.degree);
  return (
    <svg
      className="cl-basschart cl-basschart-overlay"
      viewBox={`0 0 ${image.width} ${image.height}`}
      role="img"
      aria-label={`谱上的低音走线：${names.join(" → ")}${degrees.some((d) => d > 0) ? `（级数 ${degrees.map((d) => (d > 0 ? d : "·")).join(" ")}）` : ""}`}
    >
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
      {/* 线段按级数上色（v0.96.0）：走到 1 级、5 级的那一段跟着变亮 */}
      {points.slice(1).map((point, index) => (
        <line
          key={`seg-${index}`}
          x1={points[index].x}
          y1={points[index].y}
          x2={point.x}
          y2={point.y}
          className={point.degree === 1 ? "lv1" : point.degree === 5 ? "lv5" : undefined}
        />
      ))}
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={point.moved ? 2.4 : 1.8}
          className={point.degree === 1 ? "lv1" : point.degree === 5 ? "lv5" : undefined}
        />
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
