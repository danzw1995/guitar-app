import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHORD_BY_NAME,
  SHARP_NAMES,
  STANDARD_TUNING,
  degreeInKey,
  noteName,
  positionsFor,
  tabToAlphaTex,
  type Tab,
  type TabNote,
} from "@guitar/core";
import type { FollowTarget } from "./FollowAlong";
import type { ScoreImage } from "../lib/score-image";
import { renderScoreImage } from "../lib/score-image";
import { useScoreImage } from "../hooks/useScoreImage";
import BassOverlay from "./BassOverlay";
import { useTone } from "../hooks/useTone";
import { goTo } from "../lib/nav";
import { retimeTab } from "../lib/retime";
import Generate from "./Generate";
import ChordDiagram from "./ChordDiagram";
import PlanButton from "./PlanButton";
import { degreeLine } from "../lib/degrees";
import {
  addScore,
  loadScores,
  parseScore,
  removeScore,
  scoreFileName,
  setScoreImage,
  updateScore,
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

/**
 * 内置示例：都是公有领域的老曲子，正好当「怎么写六线谱」的样例。
 * 每条都是单独一块六行弦线（分两块的话，第二块会把第一块的弦覆盖掉）。
 */
const EXAMPLES: { name: string; text: string }[] = [
  { name: "八分分解", text: SAMPLE },
  {
    name: "小星星",
    text: `title: 小星星
tempo: 88
ts: 4/4

e|--------3---3---|5---5---3-------|1---1---0---0---|----------------|
B|1---1-----------|----------------|----------------|3---3---1-------|
G|----------------|----------------|----------------|----------------|
D|----------------|----------------|----------------|----------------|
A|----------------|----------------|----------------|----------------|
E|----------------|----------------|----------------|----------------|
`,
  },
  {
    name: "欢乐颂",
    text: `title: 欢乐颂
tempo: 96
ts: 4/4

e|0---0---1---3---|3---1---0-------|------------0---|0---0-----------|
B|----------------|------------3---|1---1---3-------|--------3-------|
G|----------------|----------------|----------------|----------------|
D|----------------|----------------|----------------|----------------|
A|----------------|----------------|----------------|----------------|
E|----------------|----------------|----------------|----------------|
`,
  },
  {
    name: "两只老虎",
    text: `title: 两只老虎
tempo: 100
ts: 4/4

e|--------0-------|--------0-------|0---1---3-------|0---1---3-------|
B|1---3-------1---|1---3-------1---|----------------|----------------|
G|----------------|----------------|----------------|----------------|
D|----------------|----------------|----------------|----------------|
A|----------------|----------------|----------------|----------------|
E|----------------|----------------|----------------|----------------|
`,
  },
];

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

function ScoreFigure({
  image,
  error,
  title,
  meter,
  bpm,
  beat,
  bassTab,
  bassKey,
}: {
  image?: ScoreImage;
  error?: string;
  title: string;
  meter: string;
  bpm: number;
  /** 正在播第几拍（0 起）；null / undefined 表示没在播。 */
  beat?: number | null;
  /** 和弦谱才传：在谱上叠一条低音走线（v0.93.0）。 */
  bassTab?: Tab;
  /** 低音点的级数按哪个调算（v0.95.0）。 */
  bassKey?: number;
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
          {bassTab && <BassOverlay tab={bassTab} image={image} keyPc={bassKey} />}
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
  onEdit,
  onImage,
}: {
  score: MyScore;
  audition: Props["audition"];
  follow: Props["follow"];
  best: Props["best"];
  beatOf: Props["beatOf"];
  onRemove: (id: string) => void;
  onEdit: (score: MyScore) => void;
  onImage: (id: string, image: ScoreImage) => void;
}) {
  const storedSource =
    score.source === "transcribe" ||
    score.source === "chord" ||
    score.source === "progression" ||
    score.source === "slice" ||
    score.source === "generated"
      ? score.source
      : null;
  const earTab = storedSource && score.tab ? score.tab : null;
  // 和弦卡（听和弦存下来的）：顺手把指法图也画出来，不用再跳页去看
  const chordShape =
    storedSource === "chord" && score.chordName ? CHORD_BY_NAME.get(score.chordName) : undefined;
  const parsed = useMemo(() => (earTab ? null : parseScore(score.ascii)), [earTab, score.ascii]);
  // 扒谱 / 听和弦存下的没有 ASCII 原文，音符和拍号直接存在记录里。
  const tab = earTab ?? parsed?.tab ?? null;
  const meter = earTab ? (score.meter ?? `${earTab.beatsPerBar}/4`) : (parsed?.meter ?? "4/4");
  const bpm = earTab ? (score.bpm ?? 90) : (parsed?.bpm ?? 80);
  /**
   * 加进今日计划时的名字（v0.106.0）：带上级数，「练习页」那边一眼看出这是 1–6–5。
   * 单音那种没有级数行，`degreeLine()` 返回空串，名字就是标题本身。
   */
  const planTitle = (() => {
    if (!tab) return score.title;
    const line = degreeLine(tab);
    return line ? `${score.title} · ${line}` : score.title;
  })();
  const tex = earTab ? tabToAlphaTex(earTab) : (parsed?.tex ?? "");
  const stored = useMemo<ScoreImage | undefined>(
    () =>
      score.image
        ? {
            dataUrl: score.image,
            width: score.imageWidth ?? 0,
            height: score.imageHeight ?? 0,
            beats: score.beats,
          }
        : undefined,
    [score.image, score.imageWidth, score.imageHeight, score.beats],
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
  // 旧记录没有存图、或者存图时还没有拍位（v0.29.2 之前）：进视口后现画一张，
  // 画完把图和拍位一起写回 localStorage，之后打开就只显示图。
  const needsRender = visible && (!stored || !stored.beats || stored.beats.length === 0) && Boolean(tab);
  const rendered = useScoreImage(needsRender ? tex : null);
  const image = stored ?? rendered.image;
  useEffect(() => {
    // 没存图，或存了图但没有拍位（旧记录）：把新画出来的图和拍位一起写回去。
    if (!rendered.image) return;
    if (!stored || !stored.beats || stored.beats.length === 0) onImage(score.id, rendered.image);
  }, [rendered.image, stored, onImage, score.id]);
  const high = best(score.id);
  const { play } = useTone();
  // 和弦谱卡也能改速度 / 拍号（v0.94.0）：改拍号会真的重切小节，六线谱的小节线跟着动。
  const [editing, setEditing] = useState(false);
  const [draftBpm, setDraftBpm] = useState(bpm);
  const [draftBeats, setDraftBeats] = useState(tab?.beatsPerBar ?? 4);
  const canEditTiming = storedSource === "progression" && !!earTab;

  function saveTiming() {
    if (!earTab) return;
    const beats = Math.max(2, Math.min(4, Math.round(draftBeats)));
    const nextBpm = Math.max(40, Math.min(200, Math.round(draftBpm) || bpm));
    updateScore(score.id, {
      title: score.title,
      ascii: score.ascii,
      tab: beats === earTab.beatsPerBar ? earTab : retimeTab(earTab, beats),
      meter: `${beats}/4`,
      bpm: nextBpm,
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setEditing(false);
  }

  // 扒出来的谱可以逐音改（v0.134.0）：扒错一个音没必要整条重来
  const canEditNotes = storedSource === "transcribe" && !!earTab && !!tab;
  const [fixing, setFixing] = useState(false);
  const [draftNotes, setDraftNotes] = useState<TabNote[] | null>(null);
  const editingNotes = fixing && draftNotes ? draftNotes : null;

  function openFix() {
    if (!tab) return;
    setDraftNotes(tab.notes.map((note) => ({ ...note })));
    setFixing(true);
  }

  function patchNote(index: number, patch: Partial<TabNote> | null) {
    setDraftNotes((list) => {
      if (!list) return list;
      const next = list.slice();
      if (patch === null) next.splice(index, 1);
      else next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  /** 同一个音高在别的弦上按是什么样（换弦要把品一起换，否则音就变了） */
  function otherShape(s: number, f: number): { s: number; f: number } | null {
    const midi = STANDARD_TUNING.strings[s - 1] + f;
    const options = positionsFor(midi, 15).filter((item) => item.s !== s || item.f !== f);
    return options[0] ?? null;
  }

  function saveNotes() {
    if (!earTab || !draftNotes) return;
    const notes = draftNotes
      .slice()
      .sort((left, right) => left.beat - right.beat || left.s - right.s);
    updateScore(score.id, {
      title: score.title,
      ascii: score.ascii,
      tab: { ...earTab, notes },
      meter,
      bpm,
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setFixing(false);
    setDraftNotes(null);
  }

  /** 级数按哪个调算：null = 跟着第一个和弦的根音（v0.95.0）；选过的记在这条记录上（v0.96.0）。 */
  const [keyPick, setKeyPick] = useState<number | null>(score.keyPc ?? null);
  // 和弦谱：按拍把音归回一个个和弦，点一下单独听那一个（v0.87.0）；级数跟着调走（v0.94.0）
  const chordsOfTab = useMemo(() => {
    if (storedSource !== "progression" || !tab) return [];
    const labels = (tab.caption ?? "").split("–").filter(Boolean);
    const byBeat = new Map<number, number[]>();
    for (const note of tab.notes) {
      const midi = STANDARD_TUNING.strings[note.s - 1] + note.f;
      const list = byBeat.get(note.beat) ?? [];
      list.push(midi);
      byBeat.set(note.beat, list);
    }
    const grouped = [...byBeat.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, midis], index) => ({
        label: labels[index] ?? `第 ${index + 1} 个`,
        midis,
        root: Math.min(...midis) % 12,
      }));
    const keyPc = keyPick ?? grouped[0]?.root ?? 0;
    return grouped.map((item) => ({ ...item, degree: degreeInKey(item.root, keyPc) }));
  }, [storedSource, tab, keyPick]);
  const cardKey = keyPick ?? chordsOfTab[0]?.root ?? 0;

  return (
    <article className="drill-card my-card" ref={boxRef}>
      <header className="drill-head">
        <h4>{score.title}</h4>
        <span className="rhythm-bpm">
          {meter} · {bpm} BPM
        </span>
      </header>
      {earTab && (
        <p className="my-source">
          {storedSource === "chord"
            ? "从听和弦存下的 · 只能试听、导出，不能编辑"
            : storedSource === "progression"
              ? "从一段扫弦切出来的和弦谱 · 只能试听、导出，不能编辑"
              : storedSource === "slice"
                ? "从跟练里切出来的一小节 · 只能试听、导出，不能编辑"
                : storedSource === "generated"
                  ? "系统按技能生成的 · 只能试听、导出，不能编辑"
                  : "扒出来的 · 能试听、导出，也能逐音改（点「改音」）"}
        </p>
      )}
      {storedSource === "generated" && score.goal ? (
        <p className="my-goal">
          <span className="generate-goal-tag">小目标</span>
          {score.goal.text}
          {score.goal.muscle ? <span className="generate-muscle">这条练的是：{score.goal.muscle}</span> : null}
          {score.goal.bar !== undefined && tab ? (
            <button
              type="button"
              className="btn-quiet my-goal-go"
              onClick={() => {
                follow({
                  id: score.id,
                  name: score.title,
                  bpm: [bpm, bpm + 40],
                  tab: tab as Tab,
                  meter,
                  startBar: score.goal!.bar,
                });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              title="打开跟练，直接圈住这一小节"
            >
              只练第 {score.goal.bar} 小节
            </button>
          ) : null}
        </p>
      ) : null}
      {storedSource === "chord" && score.chordName ? (
        <p className="my-source">
          <button
            type="button"
            className="btn-quiet my-chord-jump"
            onClick={() => goTo("chords", `chord-${score.chordName}`)}
          >
            去和弦页看 {score.chordName} 的指法
          </button>
        </p>
      ) : null}
      {chordShape && (
        <div className="my-chord-diagram">
          <ChordDiagram chord={chordShape} />
          <p className="my-chord-note">
            同一个和弦的两种说法：上面是手指放哪，下面是这几根弦同时响是什么样。
          </p>
        </div>
      )}
      {tab && (
        <p className="my-beats">
          {meter} · ♩={bpm} · 每小节 {tab.beatsPerBar} 拍 · 共 {tab.bars} 小节
          {canEditTiming && (
            <button
              type="button"
              className="btn-quiet my-timing-edit"
              onClick={() => {
                setDraftBpm(bpm);
                setDraftBeats(tab.beatsPerBar);
                setEditing((value) => !value);
              }}
            >
              {editing ? "收起" : "改速度 / 拍号"}
            </button>
          )}
        </p>
      )}
      {editing && canEditTiming && (
        <div className="my-timing">
          <label className="cl-save-field">
            <span>速度</span>
            <input
              type="number"
              min={40}
              max={200}
              step={1}
              value={draftBpm}
              onChange={(event) => setDraftBpm(Number(event.target.value))}
              aria-label="这条谱的速度"
            />
          </label>
          <label className="cl-save-field">
            <span>拍号</span>
            <select
              value={draftBeats}
              onChange={(event) => setDraftBeats(Number(event.target.value))}
              aria-label="这条谱的拍号"
            >
              <option value={4}>4/4</option>
              <option value={3}>3/4</option>
              <option value={2}>2/4</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={saveTiming}>
            存
          </button>
        </div>
      )}
      {canEditNotes && (
        <div className="my-note-edit">
          {!fixing ? (
            <button type="button" className="btn-quiet my-note-open" onClick={openFix}>
              改音
            </button>
          ) : (
            <>
              <p className="my-note-head">
                哪个音不对就改哪个：品数错了调品，弦按错了换弦。改完点「存下改动」，图会重画。
              </p>
              <ol className="my-note-list">
                {(editingNotes ?? []).map((note, index) => {
                  const midi = STANDARD_TUNING.strings[note.s - 1] + note.f;
                  const alt = otherShape(note.s, note.f);
                  return (
                    <li key={`${note.s}-${note.f}-${note.beat}-${index}`} className="my-note-row">
                      <span className="my-note-at">第 {Math.floor(note.beat) + 1} 拍</span>
                      <span className="my-note-pos">
                        {note.s} 弦 {note.f === 0 ? "空弦" : `${note.f} 品`}
                      </span>
                      <span className="my-note-pitch">{noteName(midi)}</span>
                      <span className="my-note-buttons">
                        <button
                          type="button"
                          className="btn-quiet my-note-btn"
                          aria-label={`第 ${Math.floor(note.beat) + 1} 拍降一品`}
                          disabled={note.f === 0}
                          onClick={() => patchNote(index, { f: Math.max(0, note.f - 1) })}
                        >
                          − 品
                        </button>
                        <button
                          type="button"
                          className="btn-quiet my-note-btn"
                          aria-label={`第 ${Math.floor(note.beat) + 1} 拍升一品`}
                          disabled={note.f >= 15}
                          onClick={() => patchNote(index, { f: Math.min(15, note.f + 1) })}
                        >
                          + 品
                        </button>
                        <button
                          type="button"
                          className="btn-quiet my-note-btn"
                          aria-label={`第 ${Math.floor(note.beat) + 1} 拍换到别的弦上`}
                          disabled={!alt}
                          onClick={() => alt && patchNote(index, alt)}
                        >
                          换弦
                        </button>
                        <button
                          type="button"
                          className="btn-quiet my-note-btn"
                          aria-label={`删掉第 ${Math.floor(note.beat) + 1} 拍这个音`}
                          onClick={() => patchNote(index, null)}
                        >
                          去掉
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="my-note-actions">
                <button type="button" className="btn primary" onClick={saveNotes}>
                  存下改动
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => {
                    setFixing(false);
                    setDraftNotes(null);
                  }}
                >
                  不改了
                </button>
                <span className="my-note-count">共 {(editingNotes ?? []).length} 个音</span>
              </div>
            </>
          )}
        </div>
      )}
      {parsed?.error ? (
        <p className="my-error">{parsed.error}</p>
      ) : (
        <ScoreFigure
          image={image}
          error={rendered.error}
          title={score.title}
          meter={meter}
          bpm={bpm}
          beat={beatOf(score.id)}
          bassTab={storedSource === "progression" ? earTab ?? undefined : undefined}
          bassKey={cardKey}
        />
      )}
      {chordsOfTab.length > 0 && (
        <div className="my-chord-chips" role="group" aria-label={`${score.title} 的和弦，点一下单独听`}>
          <span className="my-chord-chips-label">单独听：</span>
          {chordsOfTab.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              className="chip"
              aria-label={`试听 ${item.label}${item.degree > 0 ? `，第 ${item.degree} 级` : ""}`}
              onClick={() => play(item.midis, 0.04)}
            >
              {item.label}
              {item.degree > 0 && <em className="cl-degree">{item.degree}</em>}
            </button>
          ))}
        </div>
      )}
      {chordsOfTab.length > 0 && (
        <label className="cl-key my-key">
          <span>按哪个调算级数</span>
          <select
            value={cardKey}
            onChange={(event) => {
              const pc = Number(event.target.value);
              setKeyPick(pc);
              // 记住这个调（v0.96.0）：刷新、重开都还是它
              updateScore(score.id, {
                title: score.title,
                ascii: score.ascii,
                image: score.image,
                imageWidth: score.imageWidth,
                imageHeight: score.imageHeight,
                beats: score.beats,
                keyPc: pc,
              });
            }}
            aria-label={`${score.title} 按哪个调算级数`}
          >
            {SHARP_NAMES.map((name, pc) => (
              <option key={name} value={pc}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="drill-actions">
        {tab && (
          <>
            <button
              type="button"
              className="btn"
              aria-label={`试听 ${score.title}`}
              onClick={() => audition(score.id, tab as Tab, bpm)}
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
                  bpm: [bpm, bpm + 40],
                  tab: tab as Tab,
                  meter,
                });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              跟练
            </button>
            {high !== undefined && <span className="best-badge">最高 {high} BPM</span>}
            <PlanButton
              title={planTitle}
              tab={tab as Tab}
              bpm={bpm}
              meter={meter}
            />
          </>
        )}
        {!earTab && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onEdit(score)}
            aria-label={`编辑 ${score.title}`}
          >
            编辑
          </button>
        )}
        {image && (
          <a
            className="btn btn-quiet"
            href={image.dataUrl}
            download={scoreFileName(score.title)}
            aria-label={`导出 ${score.title} 的 PNG`}
          >
            导出 PNG
          </a>
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
  /** 正在改哪一条（null = 新写一条）。 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const preview = useScoreImage(parsed?.tab ? parsed.tex : null);

  const handleImage = useCallback((id: string, image: ScoreImage) => {
    setScores(setScoreImage(id, image));
  }, []);

  // 扒谱那边存下一条时发事件过来，这里立刻重读，不用刷新页面。
  useEffect(() => {
    const reload = (): void => setScores(loadScores());
    window.addEventListener("guitar:scores", reload);
    return () => window.removeEventListener("guitar:scores", reload);
  }, []);

  /** 把存下的谱放回编辑区，改完再存回同一条。 */
  function startEdit(score: MyScore) {
    if (score.source === "transcribe" || score.source === "chord") return;
    setEditingId(score.id);
    setText(score.ascii);
    setParsed(null);
    setNote(`正在改「${score.title}」，改完点「保存修改」`);
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelEdit() {
    setEditingId(null);
    setText(SAMPLE);
    setParsed(null);
    setNote(null);
  }

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
      const payload = {
        title: next.title,
        ascii: text,
        image: image.dataUrl,
        imageWidth: image.width,
        imageHeight: image.height,
        beats: image.beats,
      };
      if (editingId) {
        setScores(updateScore(editingId, payload));
        setNote(`已保存「${next.title}」`);
      } else {
        setScores(addScore(payload));
        setNote(`已存下「${next.title}」`);
      }
      setEditingId(null);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`my-scores${editingId ? " editing" : ""}`}>
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
      <Generate follow={follow} best={best} scores={scores} />
      <div className="my-examples">
        <span className="my-examples-label">不会写？先拿一个改：</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.name}
            type="button"
            className="chip"
            onClick={() => {
              setEditingId(null);
              setText(example.text);
              setParsed(null);
              setNote(null);
            }}
          >
            {example.name}
          </button>
        ))}
      </div>
      <div className="my-editor" ref={editorRef}>
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
            {saving ? "存图中…" : editingId ? "保存修改" : "存下这条"}
          </button>
          {editingId && (
            <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
              取消修改
            </button>
          )}
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
              onRemove={(id) => {
                setScores(removeScore(id));
                if (editingId === id) setEditingId(null);
              }}
              onEdit={startEdit}
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
