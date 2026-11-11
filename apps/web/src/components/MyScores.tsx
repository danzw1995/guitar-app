import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tab } from "@guitar/core";
import type { FollowTarget } from "./FollowAlong";
import { renderScoreImage, type ScoreImage } from "../lib/score-image";
import {
  addScore,
  loadScores,
  parseScore,
  removeScore,
  setScoreImage,
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
  /** 正在播第几拍（0 起），没在播就是 null；和内置谱用同一个播放头。 */
  beatOf: (id: string) => number | null;
}

interface ImageState {
  image?: ScoreImage;
  error?: string;
}

/** 一份 tex → 一张 PNG（失败只记错误，不抛）。 */
function useScoreImage(tex: string | null): ImageState {
  const [state, setState] = useState<ImageState>({});
  useEffect(() => {
    if (!tex) {
      setState({});
      return;
    }
    let alive = true;
    setState({});
    renderScoreImage(tex)
      .then((image) => {
        if (alive) setState({ image });
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

function ScoreFigure({
  image,
  error,
  title,
  meter,
  bpm,
  beat,
}: {
  image?: ScoreImage;
  error?: string;
  title: string;
  meter: string;
  bpm: number;
  /** 正在播第几拍（0 起）；null / undefined 表示没在播。 */
  beat?: number | null;
}) {
  const band =
    image && typeof beat === "number" && beat >= 0 ? image.beats?.[beat] : undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  return (
    <div className="alpha-preview" aria-busy={!image && !error ? "true" : undefined}>
      {image ? (
        <span className="tab-score-wrap">
          <img
            className="tab-score"
            src={image.dataUrl}
            alt={`${title} 的六线谱，${meter}，${bpm} BPM`}
            width={image.width || undefined}
            height={image.height || undefined}
          />
          {band && width > 0 && height > 0 && (
            <span
              className="tab-score-beat"
              aria-hidden="true"
              style={{
                left: `${(band.x / width) * 100}%`,
                width: `${(band.w / width) * 100}%`,
                top: `${(band.y / height) * 100}%`,
                height: `${(band.h / height) * 100}%`,
              }}
            />
          )}
        </span>
      ) : (
        <span className="alpha-score-note">{error ?? "谱面渲染中…"}</span>
      )}
    </div>
  );
}

function ScoreCard({
  score,
  audition,
  follow,
  best,
  beatOf,
  onRemove,
  onImage,
}: {
  score: MyScore;
  audition: Props["audition"];
  follow: Props["follow"];
  best: Props["best"];
  beatOf: Props["beatOf"];
  onRemove: (id: string) => void;
  onImage: (id: string, image: ScoreImage) => void;
}) {
  const parsed = useMemo(() => parseScore(score.ascii), [score.ascii]);
  const stored = useMemo<ScoreImage | undefined>(
    () =>
      score.image
        ? { dataUrl: score.image, width: score.imageWidth ?? 0, height: score.imageHeight ?? 0 }
        : undefined,
    [score.image, score.imageWidth, score.imageHeight],
  );
  // 旧记录没有存图：进视口后现画一张，画完补写回 localStorage。
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
  const needsRender = visible && !stored && Boolean(parsed.tab);
  const rendered = useScoreImage(needsRender ? parsed.tex : null);
  const image = stored ?? rendered.image;
  useEffect(() => {
    if (image && !stored) onImage(score.id, image);
  }, [image, stored, onImage, score.id]);
  const high = best(score.id);

  return (
    <article className="drill-card my-card" ref={boxRef}>
      <header className="drill-head">
        <h4>{score.title}</h4>
        <span className="rhythm-bpm">
          {parsed.meter} · {parsed.bpm} BPM
        </span>
      </header>
      {parsed.error ? (
        <p className="my-error">{parsed.error}</p>
      ) : (
        <ScoreFigure
          image={image}
          error={rendered.error}
          title={score.title}
          meter={parsed.meter}
          bpm={parsed.bpm}
          beat={beatOf(score.id)}
        />
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

export default function MyScores({ audition, follow, best, beatOf }: Props) {
  const [text, setText] = useState(SAMPLE);
  const [note, setNote] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseScore> | null>(null);
  const [scores, setScores] = useState<MyScore[]>(() => loadScores());
  const [saving, setSaving] = useState(false);
  const preview = useScoreImage(parsed?.tab ? parsed.tex : null);

  const handleImage = useCallback((id: string, image: ScoreImage) => {
    setScores(setScoreImage(id, image));
  }, []);

  function doPreview() {
    const next = parseScore(text);
    setParsed(next);
    setNote(next.error ?? null);
  }

  async function doSave() {
    const next = parseScore(text);
    if (next.error || !next.tab) {
      setParsed(next);
      setNote(next.error ?? "这段谱里没有音");
      return;
    }
    setParsed(next);
    setSaving(true);
    try {
      const image = await renderScoreImage(next.tex);
      setScores(
        addScore({
          title: next.title,
          ascii: text,
          image: image.dataUrl,
          imageWidth: image.width,
          imageHeight: image.height,
          beats: image.beats,
        }),
      );
      setNote(`已存下「${next.title}」`);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setSaving(false);
    }
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
          <button type="button" className="btn" onClick={() => void doSave()} disabled={saving}>
            {saving ? "存图中…" : "存下这条"}
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
          <ScoreFigure
            image={preview.image}
            error={preview.error}
            title={parsed.title}
            meter={parsed.meter}
            bpm={parsed.bpm}
            beat={beatOf("my-preview")}
          />
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
              beatOf={beatOf}
              onRemove={(id) => setScores(removeScore(id))}
              onImage={handleImage}
            />
          ))}
        </div>
      ) : (
        <p className="my-empty">还没有自己的谱。上面写完点「存下这条」，会一直留着。</p>
      )}
    </section>
  );
}
