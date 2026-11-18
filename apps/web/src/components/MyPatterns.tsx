import { useEffect, useState } from "react";
import { tabToAlphaTex, type Tab } from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";
import { loadPatterns, removePattern, updatePattern, type SavedPattern } from "../lib/patterns";
import { scoreFileName } from "../lib/my-scores";
import { renderScoreImage } from "../lib/score-image";
import { withDegreeStrip } from "../lib/degree-image";
import { degreeLine } from "../lib/degrees";
import type { FollowTarget } from "./FollowAlong";

interface Props {
  audition: (id: string, tab: Tab, bpm: number) => void;
  follow: (target: FollowTarget) => void;
  best: (id: string) => number | undefined;
  /** 跟练时记下的「最卡的一处」（v0.100.0）。 */
  hardest: (id: string) => { bar: number; degree: number; name: string; count: number } | undefined;
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
export default function MyPatterns({ audition, follow, best, hardest }: Props) {
  const [patterns, setPatterns] = useState<SavedPattern[]>(() => loadPatterns());
  /** 正在改的那一条（v0.92.0）：只允许改速度、拍号、标题，谱子跟着重画。 */
  const [editing, setEditing] = useState<string | null>(null);
  const [draftBpm, setDraftBpm] = useState(70);
  const [draftBeats, setDraftBeats] = useState(4);
  const [draftTitle, setDraftTitle] = useState("");

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

  function startEdit(pattern: SavedPattern) {
    setEditing(pattern.id);
    setDraftBpm(pattern.bpm);
    setDraftBeats(pattern.tab.beatsPerBar);
    setDraftTitle(pattern.title);
  }

  function saveEdit(id: string) {
    setPatterns(updatePattern(id, { bpm: draftBpm, beatsPerBar: draftBeats, title: draftTitle }));
    setEditing(null);
  }

  /** 导出成 PNG（v0.93.0）：跟「我的谱」同一套渲染，只是不用先存进「我的谱」。 */
  async function exportPng(pattern: SavedPattern) {
    const image = await renderScoreImage(tabToAlphaTex(pattern.tab));
    // 图底下补一行级数（v0.97.0），分享出去看得出走向
    const dataUrl = await withDegreeStrip(image.dataUrl, pattern.tab);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = scoreFileName(pattern.title);
    link.click();
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
          const open = editing === pattern.id;
          return (
            <article key={pattern.id} className="drill-card my-pattern">
              <header className="drill-head">
                <h4>
                  {pattern.title}
                  {/* 级数写进标题（v0.98.0）：一眼看出这是 1–6–5 还是别的走向 */}
                  {degreeLine(pattern.tab) ? (
                    <span className="my-degree-line"> · {degreeLine(pattern.tab)}</span>
                  ) : null}
                </h4>
                <span className="rhythm-bpm">
                  {pattern.meter} · {bpm} BPM
                </span>
              </header>
              <PatternFigure tab={pattern.tab} />
              <p className="my-beats">
                {pattern.meter} · ♩={bpm} · 每小节 {pattern.tab.beatsPerBar} 拍 · 共{" "}
                {pattern.tab.bars} 小节
              </p>
              {/* 跟练时记下的「最卡的一处」（v0.100.0）：点开过就写在卡上，不用进跟练才知道 */}
              {hardest(pattern.id) ? (
                <p className="my-hardest">
                  最卡：第 {hardest(pattern.id)!.bar} 小节第 {hardest(pattern.id)!.degree} 级
                  {hardest(pattern.id)!.name ? `（${hardest(pattern.id)!.name}）` : ""} · 单独练过{" "}
                  {hardest(pattern.id)!.count} 次
                </p>
              ) : null}
              {open ? (
                <div className="my-pattern-edit">
                  <label className="cl-save-field">
                    速度
                    <input
                      type="number"
                      min={40}
                      max={200}
                      value={draftBpm}
                      aria-label="这条进行的速度"
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setDraftBpm(Number.isFinite(next) ? Math.min(200, Math.max(40, Math.round(next))) : 70);
                      }}
                    />
                    BPM
                  </label>
                  <label className="cl-save-field">
                    拍号
                    <select
                      value={draftBeats}
                      aria-label="这条进行的拍号"
                      onChange={(event) => setDraftBeats(Number(event.target.value))}
                    >
                      <option value={4}>4/4</option>
                      <option value={3}>3/4</option>
                      <option value={2}>2/4</option>
                    </select>
                  </label>
                  <label className="cl-save-field">
                    名字
                    <input
                      type="text"
                      value={draftTitle}
                      aria-label="这条进行的名字"
                      onChange={(event) => setDraftTitle(event.target.value)}
                    />
                  </label>
                  <button type="button" className="btn" onClick={() => saveEdit(pattern.id)}>
                    存
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => setEditing(null)}>
                    取消
                  </button>
                </div>
              ) : (
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
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => void exportPng(pattern)}
                  >
                    导出 PNG
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => startEdit(pattern)}>
                    改
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => drop(pattern.id)}>
                    删掉
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
