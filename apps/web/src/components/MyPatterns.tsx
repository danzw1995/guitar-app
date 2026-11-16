import { useEffect, useState } from "react";
import { tabToAlphaTex, type Tab } from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";
import { loadPatterns, removePattern, type SavedPattern } from "../lib/patterns";
import type { FollowTarget } from "./FollowAlong";

interface Props {
  audition: (id: string, tab: Tab, bpm: number) => void;
  follow: (target: FollowTarget) => void;
  best: (id: string) => number | undefined;
}

/** 一张卡的图：和「我的谱」同一套渲染（浏览器里现画、2 倍像素）。 */
function PatternFigure({ tab }: { tab: Tab }) {
  const { image, error } = useScoreImage(tabToAlphaTex(tab));
  if (error) return <p className="my-error">{error}</p>;
  if (!image) return <p className="my-hint">正在画谱…</p>;
  return (
    <img
      className="tab-score"
      src={image.dataUrl}
      width={image.width}
      height={image.height}
      style={{ width: `${image.width * 2}px`, height: "auto" }}
      alt={`和弦进行，${tab.bars} 小节，每小节 ${tab.beatsPerBar} 拍`}
      loading="lazy"
    />
  );
}

/**
 * 我存的「和弦进行」（v0.91.0）：听和弦切出来、觉得值得反复练的那几段。
 *
 * 和「我的谱」不同，这些不是一张静态谱，而是**拿来跟练的素材**：
 * 每张卡上直接有「试听 / 跟练」，跟练成绩和节奏页其它条目共用一套记录。
 */
export default function MyPatterns({ audition, follow, best }: Props) {
  const [patterns, setPatterns] = useState<SavedPattern[]>(() => loadPatterns());

  useEffect(() => {
    const reload = () => setPatterns(loadPatterns());
    window.addEventListener("guitar:patterns", reload);
    return () => window.removeEventListener("guitar:patterns", reload);
  }, []);

  if (patterns.length === 0) return null;

  function drop(id: string) {
    removePattern(id);
    setPatterns(loadPatterns());
  }

  return (
    <>
      <h3 className="practice-h3">
        <span>
          我存的进行 <span className="muted">（{patterns.length}）</span>
        </span>
        <span className="practice-h3-hint">听和弦切出来的那几段，直接拿来跟练</span>
      </h3>
      <div className="drill-grid">
        {patterns.map((pattern) => {
          const bpm = pattern.bpm;
          return (
            <article key={pattern.id} className="drill-card my-pattern">
              <header className="drill-head">
                <h4>{pattern.title}</h4>
                <span className="rhythm-bpm">
                  {pattern.meter} · {bpm} BPM
                </span>
              </header>
              <PatternFigure tab={pattern.tab} />
              <p className="my-beats">
                {pattern.meter} · ♩={bpm} · 每小节 {pattern.tab.beatsPerBar} 拍 · 共{" "}
                {pattern.tab.bars} 小节
              </p>
              <div className="drill-actions">
                <button
                  type="button"
                  className="btn"
                  aria-label={`试听 ${pattern.title}`}
                  onClick={() => audition(pattern.id, pattern.tab, bpm)}
                >
                  试听
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    follow({
                      id: pattern.id,
                      name: pattern.title,
                      bpm: [bpm, bpm + 40],
                      tab: pattern.tab,
                      meter: pattern.meter,
                    })
                  }
                >
                  跟练
                </button>
                {best(pattern.id) !== undefined && (
                  <span className="best-badge">最高 {best(pattern.id)} BPM</span>
                )}
                <button type="button" className="btn-quiet" onClick={() => drop(pattern.id)}>
                  删掉
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
