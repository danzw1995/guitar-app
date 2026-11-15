import { useMemo, useState } from "react";
import { CHORD_BY_NAME, chordPatternTab, tabToAlphaTex, type ChordPattern } from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";

const PATTERNS: { id: ChordPattern; label: string }[] = [
  { id: "strum", label: "扫弦" },
  { id: "arpeggio", label: "分解" },
];

/**
 * 同一个和弦的六线谱版（v0.85.0），两种弹法可切（v0.87.0）。
 *
 * 指法图讲的是「手指放哪」，六线谱讲的是「这几根弦怎么响」——
 * 扫弦是所有弦落在同一拍，分解是一根弦一拍，两种弹法在谱上完全不一样。
 */
export default function ChordVoicing({ name }: { name: string }) {
  const [pattern, setPattern] = useState<ChordPattern>("strum");
  const chord = CHORD_BY_NAME.get(name);
  const tex = useMemo(
    () => (chord ? tabToAlphaTex(chordPatternTab(chord, pattern)) : null),
    [chord, pattern],
  );
  const { image, error } = useScoreImage(tex, 160);

  if (error) {
    return (
      <p className="chord-voicing-note" role="status">
        这张谱没画出来：{error}
      </p>
    );
  }

  return (
    <div className="chord-voicing">
      <div className="chord-voicing-modes" role="group" aria-label={`${name} 的弹法`}>
        {PATTERNS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === pattern ? "chip on" : "chip"}
            aria-pressed={item.id === pattern}
            onClick={() => setPattern(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {image ? (
        <img
          className="tab-score chord-voicing-img"
          src={image.dataUrl}
          width={image.width}
          height={image.height}
          // 图是按 2 倍像素画的：按位图本身的大小显示（1:1）最清楚，也不会小到看不清品数。
          style={{ width: `${image.width * 2}px`, height: "auto" }}
          alt={`${name} 和弦的六线谱版（${pattern === "strum" ? "扫弦" : "分解"}）：${chord?.frets.join(" ") ?? ""}`}
          loading="lazy"
        />
      ) : (
        <p className="chord-voicing-note">六线谱正在画…</p>
      )}
      <p className="chord-voicing-note">
        {pattern === "strum"
          ? "扫弦：同一拍上几根弦一起响。"
          : "分解：一根弦一拍，从低音往高音走。"}
        <code>x</code> 的弦不出现——谱上只有真会响的音。
      </p>
    </div>
  );
}
