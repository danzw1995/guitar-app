import { useMemo } from "react";
import { CHORD_BY_NAME, chordVoicingTab, tabToAlphaTex } from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";

/**
 * 同一个和弦的六线谱版：一整小节的全音符，五根或四根弦一起响。
 *
 * 指法图讲的是「手指放哪」，六线谱讲的是「这几根弦同时响是什么样」——
 * 两样对着看，才知道自己弹出来的和弦该有几根弦在响。
 */
export default function ChordVoicing({ name }: { name: string }) {
  const tex = useMemo(() => {
    const chord = CHORD_BY_NAME.get(name);
    // 一整小节的全音符：和弦在谱上就是「按住不放」的一格，和指法图对得上
    return chord ? tabToAlphaTex(chordVoicingTab(chord)) : null;
  }, [name]);
  const { image, error } = useScoreImage(tex, 160);

  if (error) {
    return (
      <p className="chord-voicing-note" role="status">
        这张谱没画出来：{error}
      </p>
    );
  }

  if (!image) {
    return <p className="chord-voicing-note">六线谱正在画…</p>;
  }

  return (
    <div className="chord-voicing">
      <img
        className="tab-score chord-voicing-img"
        src={image.dataUrl}
        width={image.width}
        height={image.height}
        // 图是按 2 倍像素画的：按位图本身的大小显示（1:1）最清楚，也不会小到看不清品数。
        style={{ width: `${image.width * 2}px`, height: "auto" }}
        alt={`${name} 和弦的六线谱版：${CHORD_BY_NAME.get(name)?.frets.join(" ") ?? ""}`}
        loading="lazy"
      />
      <p className="chord-voicing-note">
        六线谱上的样子：同一拍上几根弦一起响。<code>x</code> 的弦不出现——谱上只有真会响的音。
      </p>
    </div>
  );
}
