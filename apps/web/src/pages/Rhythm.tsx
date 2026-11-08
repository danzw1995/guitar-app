import { useMemo, useState } from "react";
import {
  LEVEL_LABEL,
  READING_DRILLS,
  READING_SOURCE,
  readingPitch,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
  dateKeyOf,
  recordBlock,
  stageForCompleted,
  type Level,
} from "@guitar/core";
import Metronome from "../components/Metronome";
import TabScore from "../components/TabScore";
import FollowAlong, { type FollowTarget } from "../components/FollowAlong";
import { useTone } from "../hooks/useTone";
import {
  loadPractice,
  loadProgress,
  loadRhythm,
  savePractice,
  saveRhythm,
  type RhythmRecords,
} from "../lib/storage";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

/**
 * 节奏专项：把「时值不稳」这件事拆开练。
 *
 * 三块内容对应三种练法：
 * 1. 时值练习——单音上练节奏，不受左手干扰；
 * 2. 扫弦节奏型——手上真正的伴奏动作，带数拍词；
 * 3. 风格片段——连着和弦弹，接近真实曲子的样子。
 *
 * 每条都能「跟练」：节拍器起速、每 4 小节 +5，练完记下当前速度。
 */
export default function Rhythm() {
  const [level, setLevel] = useState<Level | 0>(0);
  const [target, setTarget] = useState<FollowTarget | null>(null);
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  const { playTab } = useTone();

  const drills = useMemo(
    () => RHYTHM_DRILLS.filter((drill) => level === 0 || drill.level === level),
    [level],
  );
  const reading = useMemo(
    () => READING_DRILLS.filter((drill) => level === 0 || drill.level === level),
    [level],
  );
  const patterns = useMemo(
    () => STRUM_LIBRARY.filter((item) => level === 0 || item.level === level),
    [level],
  );
  const strums = useMemo(
    () => STRUM_DRILLS.filter((drill) => level === 0 || drill.level === level),
    [level],
  );

  /** 记成绩：跟练记录（最高速度）+ 当天练习时长（让连续天数也涨）。 */
  function record(result: { bpm: number; minutes: number }) {
    if (!target) return;
    const today = dateKeyOf(new Date());
    const previous = records[target.id];
    const next: RhythmRecords = {
      ...records,
      [target.id]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + result.minutes,
        lastAt: today,
      },
    };
    setRecords(next);
    saveRhythm(next);

    const progress = loadProgress();
    const completed = Object.values(progress).filter((item) => item.completed).length;
    const log = loadPractice();
    savePractice(
      recordBlock(log, today, {
        drill: `rhythm:${target.id}`,
        minutes: result.minutes,
        stage: stageForCompleted(completed),
      }),
    );
  }

  const best = (id: string) => records[id]?.bestBpm;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>节奏专项</h2>
        <p>
          时值不稳、三连音发虚、八分十六分切换乱——这些都能单独练。
          每条都带六线谱和数拍词：先跟着念，再点「跟练」让节拍器一段一段往上加。

        </p>
      </div>

      <div className="lesson-buttons">
        <button
          type="button"
          className={level === 0 ? "chip on" : "chip"}
          aria-pressed={level === 0}
          onClick={() => setLevel(0)}
        >
          全部
        </button>
        {LEVELS.map((item) => (
          <button
            key={item}
            type="button"
            className={level === item ? "chip on" : "chip"}
            aria-pressed={level === item}
            onClick={() => setLevel(item)}
          >
            {LEVEL_LABEL[item]}
          </button>
        ))}
      </div>

      {target && (
        <FollowAlong
          target={target}
          best={best(target.id)}
          onFinish={record}
          onClose={() => setTarget(null)}
        />
      )}

      <details className="practice-metronome" open>
        <summary>节拍器（先开起来，再看谱）</summary>
        <Metronome />
      </details>

      <h3 className="practice-h3">
        跟读练习
        <span className="practice-h3-hint">
          整理自《节奏与节拍》{READING_SOURCE}：先念会，再上琴
        </span>
      </h3>
      <div className="drill-grid">
        {reading.map((drill) => (
          <article key={drill.id} className="drill-card">
            <header className="drill-head">
              <h4>
                练习 {drill.no} · {drill.name}
              </h4>
              <span className={`level-badge lv${drill.level}`}>{LEVEL_LABEL[drill.level]}</span>
            </header>
            <p className="rhythm-count">
              拍号：<b>{drill.meter}</b>
              <span className="rhythm-bpm">
                {drill.bpm[0]}–{drill.bpm[1]} BPM
              </span>
            </p>
            <p className="rhythm-count">
              念：<b>{drill.count}</b>
              <span className="rhythm-bpm">写在 {readingPitch(drill)} 上</span>
            </p>
            <TabScore id={drill.id} tab={drill.tab} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${drill.name}`}
                onClick={() => playTab(drill.tab, drill.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget(drill);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                跟练
              </button>
              {best(drill.id) !== undefined && (
                <span className="best-badge">最高 {best(drill.id)} BPM</span>
              )}
            </div>
            <details className="pb-more">
              <summary>怎么练 · 验收</summary>
              <ol className="pb-steps">
                {drill.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>验收</b>：{drill.pass}
              </p>
            </details>
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        时值练习
        <span className="practice-h3-hint">先跟着数拍词念，再点「跟练」一段一段加</span>
      </h3>
      <div className="drill-grid">
        {drills.map((drill) => (
          <article key={drill.id} className="drill-card">
            <header className="drill-head">
              <h4>{drill.name}</h4>
              <span className={`level-badge lv${drill.level}`}>{LEVEL_LABEL[drill.level]}</span>
            </header>
            <p className="rhythm-focus">{drill.focus}</p>
            <p className="rhythm-count">
              数：<b>{drill.count}</b>
              <span className="rhythm-bpm">
                {drill.bpm[0]}–{drill.bpm[1]} BPM
              </span>
            </p>
            <TabScore id={drill.id} tab={drill.tab} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${drill.name}（含节拍器）`}
                onClick={() => playTab(drill.tab, drill.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget(drill);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                跟练
              </button>
              {best(drill.id) !== undefined && (
                <span className="best-badge">最高 {best(drill.id)} BPM</span>
              )}
            </div>
            <details className="pb-more">
              <summary>怎么练 · 验收</summary>
              <ol className="pb-steps">
                {drill.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>验收</b>：{drill.pass}
              </p>
            </details>
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        扫弦练习
        <span className="practice-h3-hint">
          整理自《节奏与节拍》{READING_SOURCE} 的 24 条扫弦；圆点是右手切音
        </span>
      </h3>
      <p className="rhythm-focus">
        板书把方向画在六线谱上（1 弦在最上面），所以谱面上的上箭头是「下扫」——这里已经按
        下 / 上 换算好了。每条都按板上的符干位置读：十六分就画成十六分，前八后十六、十六分四连、
        附点切分都是原样，没有被压成一样的格子。
      </p>
      <div className="drill-grid">
        {strums.map((drill) => {
          const mutes = new Set(
            drill.tab.notes
              .filter((note) => note.muted && note.beat < drill.tab.beatsPerBar)
              .map((note) => note.beat),
          ).size;
          return (
            <article key={drill.id} className="drill-card">
              <header className="drill-head">
                <h4>
                  练习 {drill.no} · {drill.name}
                </h4>
                <span className={`level-badge lv${drill.level}`}>{LEVEL_LABEL[drill.level]}</span>
              </header>
              <p className="rhythm-count">
                拍号：<b>{drill.meter}</b>
                <span className="rhythm-bpm">
                  {drill.bpm ? `${drill.bpm} BPM` : "—"}
                  {mutes > 0 ? ` · 切音 ${mutes} 处` : ""}
                </span>
              </p>
              <p className="rhythm-focus">{drill.figure}</p>
              <p className="rhythm-count">
                念：<b>{drill.count}</b>
              </p>
              <TabScore id={drill.id} tab={drill.tab} />
              <div className="drill-actions">
                <button
                  type="button"
                  className="btn"
                  aria-label={`试听 练习 ${drill.no}`}
                  onClick={() => playTab(drill.tab, drill.bpm ?? 70)}
                >
                  试听
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setTarget({ id: drill.id, name: `练习 ${drill.no}`, bpm: [drill.bpm ?? 70, 110], tab: drill.tab });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  跟练
                </button>
                {best(drill.id) !== undefined && (
                  <span className="best-badge">最高 {best(drill.id)} BPM</span>
                )}
              </div>
              {drill.tip && <p className="pb-line">{drill.tip}</p>}
              {drill.inferred && (
                <p className="pb-line">
                  板书这一帧是换页重影（或视频里同一块板连着讲了两条），这条按老师的口诀整理的。
                </p>
              )}
            </article>
          );
        })}
      </div>

      <h3 className="practice-h3">
        扫弦节奏型
        <span className="practice-h3-hint">手上真正要做的动作，箭头是方向</span>
      </h3>
      <div className="drill-grid">
        {patterns.map((pattern) => (
          <article key={pattern.id} className="drill-card">
            <header className="drill-head">
              <h4>{pattern.name}</h4>
              <span className={`level-badge lv${pattern.level}`}>
                {LEVEL_LABEL[pattern.level]}
              </span>
            </header>
            <p className="rhythm-count">
              数：<b>{pattern.count}</b>
              <span className="rhythm-bpm">{pattern.chord} 和弦</span>
            </p>
            <TabScore id={pattern.id} tab={pattern.tab} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${pattern.name}（含节拍器）`}
                onClick={() => playTab(pattern.tab, 70)}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({ ...pattern, bpm: [60, 90] as [number, number] });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                跟练
              </button>
              {best(pattern.id) !== undefined && (
                <span className="best-badge">最高 {best(pattern.id)} BPM</span>
              )}
            </div>
            <p className="pb-line">{pattern.tip}</p>
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        风格片段
        <span className="practice-h3-hint">连着和弦弹，最接近真实曲子的样子</span>
      </h3>
      <div className="drill-grid">
        {SONG_SNIPPETS.map((snippet) => (
          <article key={snippet.id} className="drill-card">
            <header className="drill-head">
              <h4>{snippet.name}</h4>
              <span className={`level-badge lv${snippet.level}`}>
                {LEVEL_LABEL[snippet.level]}
              </span>
            </header>
            <p className="rhythm-focus">{snippet.style}</p>
            <p className="rhythm-count">
              和弦：<b>{snippet.chords.join(" → ")}</b>
              <span className="rhythm-bpm">
                {snippet.bpm[0]}–{snippet.bpm[1]} BPM
              </span>
            </p>
            <TabScore id={snippet.id} tab={snippet.tab} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${snippet.name}（含节拍器）`}
                onClick={() => playTab(snippet.tab, snippet.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget(snippet);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                跟练
              </button>
              {best(snippet.id) !== undefined && (
                <span className="best-badge">最高 {best(snippet.id)} BPM</span>
              )}
            </div>
            <p className="pb-line">{snippet.tip}</p>
          </article>
        ))}
      </div>

      <p className="practice-foot">
        时值练不稳时只有一个办法：**把 BPM 降到能听见每一拍**，稳了再加 5。
        跟着这套顺序走：数拍词 → 60 BPM 单音 → 加到 80 → 再换到和弦上。
      </p>
    </section>
  );
}
