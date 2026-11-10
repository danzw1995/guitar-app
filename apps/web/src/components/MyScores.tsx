import { useEffect, useMemo, useRef, useState } from "react";
import type { Tab } from "@guitar/core";
import type { FollowTarget } from "./FollowAlong";
import { renderTexToMarkup } from "../lib/alpha-preview";
import {
  addScore,
  loadScores,
  parseScore,
  removeScore,
  type MyScore,
} from "../lib/my-scores";

const SAMPLE = `title: 示例 · 八分分解
tempo: 72
ts: 4/4

e|--------0-------|--------0-------|
B|----1-------1---|----1-------1---|
G|--0---0---0---0-|--0---0---0---0-|
A|3-------3-------|3-------3-------|
`;

interface Props {
  audition: (id: string, tab: Tab, bpm: number) => void;
  follow: (target: FollowTarget) => void;
  best: (id: string) => number | undefined;
}

interface Preview {
  markup?: string;
  error?: string;
  busy?: boolean;
  title?: string;
  meter?: string;
  bpm?: number;
  tab?: Tab | null;
}

function usePreview(tex: string | null): Preview {
  const [state, setState] = useState<Preview>({});
  useEffect(() => {
    if (!tex) {
      setState({});
      return;
    }
    let alive = true;
    setState({ busy: true });
    renderTexToMarkup(tex)
      .then((markup) => {
        if (alive) setState({ markup });
      })
      .catch((error: unknown) => {
        if (alive) setState({ error: (error as Error).message });
      });
    return () => {
      alive = false;
    };
  }, [tex]);
  return state;
}

function ScoreCard({
  score,
  audition,
  follow,
  best,
  onRemove,
}: {
  score: MyScore;
  audition: Props["audition"];
  follow: Props["follow"];
  best: Props["best"];
  onRemove: (id: string) => void;
}) {
  const parsed = useMemo(() => parseScore(score.ascii), [score.ascii]);
  // 存下的谱可能有很多条：进视口才画，免得一屏之外也排队渲染。
  const [visible, setVisible] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const preview = usePreview(visible && parsed.tab ? parsed.tex : null);
  const high = best(score.id);

  return (
    <article className="drill-card my-card" ref={boxRef}>
      <header className="drill-head">
        <h4>{score.title}</h4>
        <span className="rhythm-bpm">
          {parsed.meter} · {parsed.bpm} BPM
        </span>
      </header>
      {parsed.error && <p className="my-error">{parsed.error}</p>}
      {!parsed.error && (
        <div className="alpha-preview" aria-busy={preview.busy ? "true" : undefined}>
          {preview.markup ? (
            <div dangerouslySetInnerHTML={{ __html: preview.markup }} />
          ) : (
            <span className="alpha-score-note">
              {preview.error ?? (preview.busy ? "谱面渲染中…" : "还没画出来")}
            </span>
          )}
        </div>
      )}
      <div className="drill-actions">
        {parsed.tab && (
          <>
            <button
              type="button"
              className="btn"
              aria-label={`试听 ${score.title}`}
              onClick={() => audition(score.id, parsed.tab as Tab, parsed.bpm)}
            >
              试听
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                follow({
                  id: score.id,
                  name: score.title,
                  bpm: [parsed.bpm, parsed.bpm + 40],
                  tab: parsed.tab as Tab,
                  meter: parsed.meter,
                });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              跟练
            </button>
            {high !== undefined && <span className="best-badge">最高 {high} BPM</span>}
          </>
        )}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => onRemove(score.id)}
          aria-label={`删掉 ${score.title}`}
        >
          删掉
        </button>
      </div>
    </article>
  );
}

export default function MyScores({ audition, follow, best }: Props) {
  const [text, setText] = useState(SAMPLE);
  const [note, setNote] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseScore> | null>(null);
  const [scores, setScores] = useState<MyScore[]>(() => loadScores());
  const preview = usePreview(parsed?.tab ? parsed.tex : null);

  function doPreview() {
    const next = parseScore(text);
    setParsed(next);
    setNote(next.error ?? null);
  }

  function doSave() {
    const next = parseScore(text);
    if (next.error) {
      setParsed(next);
      setNote(next.error);
      return;
    }
    setParsed(next);
    setScores(addScore({ title: next.title, ascii: text }));
    setNote(`已存下「${next.title}」`);
  }

  return (
    <section className="my-scores">
      <h3 className="practice-h3">
        我的谱
        <span className="practice-h3-hint">
          自己手写一段六线谱粘进来：预览、存下、试听、跟练
        </span>
      </h3>
      <p className="my-hint">
        六行弦线（<code>e B G D A E</code> 或 <code>1–6</code>），数字是品，<code>x</code> 是闷音，
        <code>-</code> 是延音，用 <code>|</code> 分小节；时值看列距，不写符号。
        开头可以写 <code>title:</code>、<code>tempo:</code>、<code>ts: 4/4</code>。
      </p>
      <div className="my-editor">
        <label className="visually-hidden" htmlFor="my-score-input">
          粘贴六线谱
        </label>
        <textarea
          id="my-score-input"
          className="my-input"
          spellCheck={false}
          rows={10}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setParsed(null);
            setNote(null);
          }}
        />
        <div className="my-actions">
          <button type="button" className="btn" onClick={doPreview}>
            预览
          </button>
          <button type="button" className="btn" onClick={doSave}>
            存下这条
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setText(SAMPLE);
              setParsed(null);
              setNote(null);
            }}
          >
            换成示例
          </button>
          {note && <span className="my-note">{note}</span>}
        </div>
      </div>

      {parsed && !parsed.error && (
        <div className="my-preview">
          <p className="rhythm-focus">
            {parsed.title} · {parsed.meter} · {parsed.bpm} BPM
          </p>
          <div className="alpha-preview" aria-busy={preview.busy ? "true" : undefined}>
            {preview.markup ? (
              <div dangerouslySetInnerHTML={{ __html: preview.markup }} />
            ) : (
              <span className="alpha-score-note">
                {preview.error ?? (preview.busy ? "谱面渲染中…" : "还没画出来")}
              </span>
            )}
          </div>
          {parsed.tab && (
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                onClick={() => audition("my-preview", parsed.tab as Tab, parsed.bpm)}
              >
                试听
              </button>
            </div>
          )}
        </div>
      )}

      {scores.length > 0 ? (
        <div className="drill-grid my-list">
          {scores.map((score) => (
            <ScoreCard
              key={score.id}
              score={score}
              audition={audition}
              follow={follow}
              best={best}
              onRemove={(id) => setScores(removeScore(id))}
            />
          ))}
        </div>
      ) : (
        <p className="my-empty">还没有自己的谱。上面写完点「存下这条」，会一直留着。</p>
      )}
    </section>
  );
}
