import { useMemo, useState } from "react";
import {
  ACCOMPANIMENTS,
  LEVEL_LABEL,
  READING_DRILLS,
  READING_SOURCE,
  readingPitch,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_DRILLS,
  STRUM_LIBRARY,
  dateKeyOf,
  dueDaysOf,
  pickDue,
  pushBpmPoint,
  recordBlock,
  REGRESS_BOOST_DAYS,
  regressedIds,
  stageForCompleted,
  type Level,
  type Tab,
} from "@guitar/core";
import Metronome from "../components/Metronome";
import TabScore from "../components/TabScore";
import FollowAlong, { type FollowTarget } from "../components/FollowAlong";
import MyScores from "../components/MyScores";
import UndoToast from "../components/UndoToast";
import { useTone } from "../hooks/useTone";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RHYTHM_PICKS } from "../lib/rhythm-index";
import { meterOfTab } from "../lib/meter";
import {
  addSkip,
  loadPractice,
  loadProgress,
  addPause,
  loadPauses,
  loadRhythm,
  loadSkips,
  pausedOf,
  removePause,
  removeSkip,
  savePauses,
  savePractice,
  saveRhythm,
  saveSkips,
  skipsOf,
  type PauseLog,
  type RhythmRecords,
  type SkipLog,
} from "../lib/storage";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

function meterOfDrill(drill: { tab: { beatsPerBar: number }; meter?: string }): string {
  return drill.meter ?? meterOfTab(drill.tab);
}

/** 一条能被「今日三条」点名的练习（跨三块内容统一成一种形状）。 */
interface Pickable {
  id: string;
  label: string;
  group: string;
}

function hashOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 今日三条：和练习页用同一套「多久没练」的挑选（core 的 `pickDue`）。
 *
 * 最久没碰的先回来，今天已经练过的算 0 天、自动排到最后（练完打勾，明天再回来）。
 * offset 取「日期哈希」，所以同一天刷新不变、第二天换一批；三条按块各取一条
 * （跟读 / 时值 / 扫弦各一），不然可能三条都是时值。
 */
function dailyPicks(
  items: Pickable[],
  today: string,
  records: RhythmRecords,
  boost: Map<string, number>,
  skip: Set<string>,
): Pickable[] {
  const lastAt = new Map<string, string>();
  for (const [id, record] of Object.entries(records)) {
    if (record.lastAt) lastAt.set(id, record.lastAt);
  }
  const offset = hashOf(today) % 97;
  const groups = new Map<string, Pickable[]>();
  for (const item of items) {
    const list = groups.get(item.group);
    if (list) list.push(item);
    else groups.set(item.group, [item]);
  }
  const picked: Pickable[] = [];
  for (const list of groups.values()) {
    picked.push(pickDue(list, lastAt, today, offset, { boost, exclude: skip }).item);
  }
  return picked;
}

/** 今日三条每行右边那句话：今天练过 / 上次练几天前 / 还没练过。 */
function dueLabel(record: { lastAt?: string } | undefined, today: string): string {
  if (!record?.lastAt) return "还没练过";
  if (record.lastAt === today) return "今天练过";
  const days = dueDaysOf(record.lastAt, today);
  return days === 0 ? "今天练过" : `上次练 ${days} 天前`;
}

/** 某一块里练过（有成绩记录）的比例，用来画进度条。 */
function doneRatio(ids: string[], records: RhythmRecords): { done: number; total: number } {
  return { done: ids.filter((id) => records[id]).length, total: ids.length };
}

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
  /** 搜索词：在六块练习里按名字、音型、数拍词、和弦找。 */
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<FollowTarget | null>(null);
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  const [skips, setSkips] = useState<SkipLog>(() => loadSkips());
  const [pauses, setPauses] = useState<PauseLog>(() => loadPauses());
  /** 刚跳过的哪一条（底部提示 + 撤销）。`paused` = 已经升级成「这一周先不练」。 */
  const [undo, setUndo] = useState<{ id: string; label: string; paused?: boolean } | null>(null);
  /** 正在试听哪一条、播到第几拍（`null` = 没在播）。 */
  const [playhead, setPlayhead] = useState<{ id: string; beat: number } | null>(null);
  const narrow = useMediaQuery("(max-width: 900px)");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => !narrow || expanded[key] === true;
  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
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
  const accompaniments = useMemo(
    () => ACCOMPANIMENTS.filter((item) => level === 0 || item.level === level),
    [level],
  );

  // 搜索：只在六块练习里筛（今日三条与等级筛选是另一回事）
  const q = query.trim().toLowerCase();
  const hit = (...parts: (string | number | undefined)[]) =>
    q === "" || parts.join(" ").toLowerCase().includes(q);
  const shownDrills = drills.filter((drill) => hit("时值", drill.name, drill.focus, drill.count, ...drill.tips));
  const shownReading = reading.filter((drill) =>
    hit("跟读 朗读", drill.no, drill.name, drill.focus, drill.meter, drill.count, ...drill.tips),
  );
  const shownStrums = strums.filter((drill) =>
    hit("扫弦", drill.no, drill.name, drill.figure, drill.count, drill.tip),
  );
  const shownAccompaniments = accompaniments.filter((item) =>
    hit("伴奏 分解", item.no, item.name, item.figure, item.pattern, item.chords.join(" "), item.tip),
  );
  const shownPatterns = patterns.filter((item) => hit("扫弦 节奏型", item.name, item.count, item.tip));
  const shownSnippets = SONG_SNIPPETS.filter((item) =>
    hit("片段 曲子", item.name, item.style, item.chords.join(" "), item.tip),
  );
  const shownTotal =
    shownDrills.length +
    shownReading.length +
    shownStrums.length +
    shownAccompaniments.length +
    shownPatterns.length +
    shownSnippets.length;

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
        history: pushBpmPoint(previous?.history, today, result.bpm),
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

  const today = dateKeyOf(new Date());
  // 跟练速度退步的加几天紧迫度，让它们先回来
  const boost = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of regressedIds(records)) map.set(id, REGRESS_BOOST_DAYS);
    return map;
  }, [records]);
  /** 今天不再出现的条目：跳过表 + 这一周先不练的，合成一个集合交给 pickDue。 */
  const skip = useMemo(
    () => new Set([...skipsOf(skips, today), ...pausedOf(pauses, today)]),
    [skips, pauses, today],
  );
  const picks = useMemo(
    () => dailyPicks(RHYTHM_PICKS, today, records, boost, skip),
    [today, records, boost, skip],
  );
  /** 「换一条」：把这条记进今天的跳过表，三条会重新挑一次（今天不再出现）。 */
  const swapPick = (id: string) => {
    const label = picks.find((pick) => pick.id === id)?.label ?? id;
    const next = addSkip(skips, today, id);
    saveSkips(next);
    setSkips(next);
    setUndo({ id, label });
  };
  /** 提示里的第二条出路：这条这一周都别再排进来。 */
  const pausePick = () => {
    if (!undo) return;
    const next = addPause(pauses, undo.id, today);
    savePauses(next);
    setPauses(next);
    setUndo({ ...undo, paused: true });
  };
  /** 点错了就撤销：跳过和压后一起撤，它马上回到三条里。 */
  const undoSkip = () => {
    if (!undo) return;
    const nextSkip = removeSkip(skips, today, undo.id);
    const nextPause = removePause(pauses, undo.id);
    saveSkips(nextSkip);
    savePauses(nextPause);
    setSkips(nextSkip);
    setPauses(nextPause);
    setUndo(null);
  };
  const picksDone = picks.filter((pick) => records[pick.id]?.lastAt === today).length;
  const readingDone = doneRatio(READING_DRILLS.map((drill) => drill.id), records);
  const rhythmDone = doneRatio(RHYTHM_DRILLS.map((drill) => drill.id), records);
  const strumDone = doneRatio(STRUM_DRILLS.map((drill) => drill.id), records);
  const accompDone = doneRatio(ACCOMPANIMENTS.map((item) => item.id), records);

  function jumpTo(id: string) {
    const card = document.getElementById(`drill-${id}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** 试听一条谱：同时把「播到第几拍」喂给卡片上的谱面，画一条跟着走的竖条。 */
  function audition(id: string, tab: Tab, bpm: number) {
    setPlayhead({ id, beat: 0 });
    playTab(tab, bpm, {
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { id, beat }),
    });
  }

  const beatOf = (id: string) => (playhead?.id === id ? playhead.beat : null);

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

      <details className="practice-metronome" open={!narrow}>
        <summary>节拍器（先开起来，再看谱）</summary>
        <Metronome />
      </details>

      <div className="today-box">
        <div className="today-head">
          <h3>今天先练这 3 条</h3>
          <span className="today-count">
            {picksDone}/{picks.length}
          </span>
        </div>
        <div className="practice-progress" aria-hidden="true">
          <span style={{ width: `${(picksDone / Math.max(1, picks.length)) * 100}%` }} />
        </div>
        <ul className="today-list">
          {picks.map((pick) => {
            const done = records[pick.id]?.lastAt === today;
            return (
              <li key={pick.id} data-pick={pick.id} className={done ? "today-item done" : "today-item"}>
                <span className="today-mark" aria-hidden="true">
                  {done ? "✓" : "○"}
                </span>
                <span className="today-group">{pick.group}</span>
                <span className="today-label">{pick.label}</span>
                <span className="today-due">
                  {dueLabel(records[pick.id], today)}
                  {boost.has(pick.id) ? " · 速度掉了" : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-quiet today-swap"
                  onClick={() => swapPick(pick.id)}
                  title="今天先不练这条，换一条"
                  aria-label={`换一条：${pick.label}`}
                >
                  换一条
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => jumpTo(pick.id)}
                >
                  {done ? "再练一遍" : "去练"}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="today-hint">
          三条按「多久没练」挑：最久没碰的先回来，练过的排后面（在跟练里点「记录成绩」就会打勾）。
          今天不想练哪条就点「换一条」，它今天不会再出现。
        </p>
      </div>

      <div className="rhythm-search">
        <input
          id="rhythm-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="找练习：切音、三连音、6/8、C–Am–F、前八后十六…"
          aria-label="搜索节奏练习"
        />
        {query ? (
          <button type="button" className="btn-quiet" onClick={() => setQuery("")}>
            清掉
          </button>
        ) : null}
        <span className="rhythm-search-note">
          {query ? `找到 ${shownTotal} 条` : `共 ${READING_DRILLS.length + RHYTHM_DRILLS.length + STRUM_DRILLS.length + ACCOMPANIMENTS.length + STRUM_LIBRARY.length + SONG_SNIPPETS.length} 条`}
        </span>
      </div>
      {query && shownTotal === 0 ? (
        <p className="rhythm-search-empty">
          没找到。试试：切音、十六分、三连音、6/8、扫弦、伴奏、附点、前八后十六。
        </p>
      ) : null}

      <h3 className="practice-h3">
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("reading")}
          aria-controls={`block-${"reading"}`}
          onClick={() => toggle("reading")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("reading") ? "\u25be" : "\u25b8"}
          </span>
          跟读练习
        </button>
        <span className="practice-h3-hint">
          整理自《节奏与节拍》{READING_SOURCE}：先念会，再上琴
        </span>
        <span className="block-meter">
          已练 {readingDone.done}/{readingDone.total}
        </span>
      </h3>
      <div
        id={`block-${"reading"}`}
        className={`drill-grid ${isOpen("reading") ? "" : "block-closed"}`}
      >
        {shownReading.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownReading.map((drill) => (
          <article key={drill.id} id={`drill-${drill.id}`} className="drill-card">
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
            <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${drill.name}`}
                onClick={() => audition(drill.id, drill.tab, drill.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({ ...drill, meter: meterOfDrill(drill) });
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
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("rhythm")}
          aria-controls={`block-${"rhythm"}`}
          onClick={() => toggle("rhythm")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("rhythm") ? "\u25be" : "\u25b8"}
          </span>
          时值练习
        </button>
        <span className="practice-h3-hint">先跟着数拍词念，再点「跟练」一段一段加</span>
        <span className="block-meter">
          已练 {rhythmDone.done}/{rhythmDone.total}
        </span>
      </h3>
      <div
        id={`block-${"rhythm"}`}
        className={`drill-grid ${isOpen("rhythm") ? "" : "block-closed"}`}
      >
        {shownDrills.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownDrills.map((drill) => (
          <article key={drill.id} id={`drill-${drill.id}`} className="drill-card">
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
            <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${drill.name}（含节拍器）`}
                onClick={() => audition(drill.id, drill.tab, drill.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({ ...drill, meter: meterOfDrill(drill) });
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
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("strum")}
          aria-controls={`block-${"strum"}`}
          onClick={() => toggle("strum")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("strum") ? "\u25be" : "\u25b8"}
          </span>
          扫弦练习
        </button>
        <span className="practice-h3-hint">
          整理自《节奏与节拍》{READING_SOURCE} 的 24 条扫弦
        </span>
        <span className="block-meter">
          已练 {strumDone.done}/{strumDone.total}
        </span>
      </h3>
      <p className="rhythm-focus">
        板书把方向画在六线谱上（1 弦在最上面），所以谱面上的上箭头是「下扫」——这里已经按
        下 / 上 换算好了。每条都按板上的符干位置读：十六分就画成十六分，前八后十六、十六分四连、
        附点切分都是原样，没有被压成一样的格子。
      </p>
      <p className="rhythm-legend">
        看图：<b>↑</b> 下扫（6 弦 → 1 弦）、<b>↓</b> 上扫（1 弦 → 6 弦）；
        <b>P.M.</b> 是切音（palm mute，右手掌根压在琴桥上，那一拍按死发「嗒」）；
        C 和弦第 6 弦不弹，按六线谱惯例<b>留空</b>，不是闷音。
      </p>
      <div
        id={`block-${"strum"}`}
        className={`drill-grid ${isOpen("strum") ? "" : "block-closed"}`}
      >
        {shownStrums.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownStrums.map((drill) => {
          const mutes = new Set(
            drill.tab.notes
              .filter((note) => note.muted && note.beat < drill.tab.beatsPerBar)
              .map((note) => note.beat),
          ).size;
          return (
            <article key={drill.id} id={`drill-${drill.id}`} className="drill-card">
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
              <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />
              <div className="drill-actions">
                <button
                  type="button"
                  className="btn"
                  aria-label={`试听 练习 ${drill.no}`}
                  onClick={() => audition(drill.id, drill.tab, drill.bpm ?? 70)}
                >
                  试听
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setTarget({
                      id: drill.id,
                      name: `练习 ${drill.no}`,
                      bpm: [drill.bpm ?? 70, 110],
                      tab: drill.tab,
                      meter: meterOfDrill(drill),
                    });
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
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("accomp")}
          aria-controls={`block-${"accomp"}`}
          onClick={() => toggle("accomp")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("accomp") ? "\u25be" : "\u25b8"}
          </span>
          伴奏型
        </button>
        <span className="practice-h3-hint">
          整理自《节奏与节拍》{READING_SOURCE} 的 17 条分解伴奏
        </span>
        <span className="block-meter">
          已练 {accompDone.done}/{accompDone.total}
        </span>
      </h3>
      <p className="rhythm-focus">
        板书是「上面五个和弦图 + 下面五小节六线谱」，谱上只画 x 标弦、不写品数——
        这里照原样：五小节依次配 C → Am → F → G → C，谱面上的数字就是弦号。
        分解型练熟以后，换成任何一首这四个和弦的歌都能用。
      </p>
      <div
        id={`block-${"accomp"}`}
        className={`drill-grid ${isOpen("accomp") ? "" : "block-closed"}`}
      >
        {shownAccompaniments.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownAccompaniments.map((item) => (
          <article key={item.id} id={`drill-${item.id}`} className="drill-card">
            <header className="drill-head">
              <h4>
                练习 {item.no} · {item.name}
              </h4>
              <span className={`level-badge lv${item.level}`}>{LEVEL_LABEL[item.level]}</span>
            </header>
            <p className="rhythm-count">
              和弦：<b>{item.chords.join(" → ")}</b>
              <span className="rhythm-bpm">
                {item.meter} · {item.bpm} BPM
              </span>
            </p>
            <p className="rhythm-focus">{item.figure}</p>
            <p className="rhythm-count">
              弦号：<b>{item.pattern}</b>
            </p>
            <TabScore id={item.id} tab={item.tab} beat={beatOf(item.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 练习 ${item.no}`}
                onClick={() => audition(item.id, item.tab, item.bpm)}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({
                    id: item.id,
                    name: `练习 ${item.no} · ${item.name}`,
                    bpm: [item.bpm, item.bpm + 40],
                    tab: item.tab,
                    meter: item.meter,
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                跟练
              </button>
              {best(item.id) !== undefined && (
                <span className="best-badge">最高 {best(item.id)} BPM</span>
              )}
            </div>
            {item.tip && <p className="pb-line">{item.tip}</p>}
            {item.inferred && (
              <p className="pb-line">板书这一帧看不清，这条是按同一块板上其它小节推断的。</p>
            )}
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("patterns")}
          aria-controls={`block-${"patterns"}`}
          onClick={() => toggle("patterns")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("patterns") ? "\u25be" : "\u25b8"}
          </span>
          扫弦节奏型
        </button>
        <span className="practice-h3-hint">手上真正要做的动作，箭头是方向</span>
      </h3>
      <div
        id={`block-${"patterns"}`}
        className={`drill-grid ${isOpen("patterns") ? "" : "block-closed"}`}
      >
        {shownPatterns.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownPatterns.map((pattern) => (
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
            <TabScore id={pattern.id} tab={pattern.tab} beat={beatOf(pattern.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${pattern.name}（含节拍器）`}
                onClick={() => audition(pattern.id, pattern.tab, 70)}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({
                    ...pattern,
                    bpm: [60, 90] as [number, number],
                    meter: meterOfTab(pattern.tab),
                  });
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
        <button
          type="button"
          className="block-toggle"
          aria-expanded={isOpen("snippets")}
          aria-controls={`block-${"snippets"}`}
          onClick={() => toggle("snippets")}
        >
          <span className="block-caret" aria-hidden="true">
            {isOpen("snippets") ? "\u25be" : "\u25b8"}
          </span>
          风格片段
        </button>
        <span className="practice-h3-hint">连着和弦弹，最接近真实曲子的样子</span>
      </h3>
      <div
        id={`block-${"snippets"}`}
        className={`drill-grid ${isOpen("snippets") ? "" : "block-closed"}`}
      >
        {shownSnippets.length === 0 ? <p className="rhythm-empty">这一块没有匹配的</p> : null}
        {shownSnippets.map((snippet) => (
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
            <TabScore id={snippet.id} tab={snippet.tab} beat={beatOf(snippet.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn"
                aria-label={`试听 ${snippet.name}（含节拍器）`}
                onClick={() => audition(snippet.id, snippet.tab, snippet.bpm[0])}
              >
                试听
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget({ ...snippet, meter: meterOfTab(snippet.tab) });
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

      <MyScores audition={audition} best={best} follow={setTarget} beatOf={beatOf} />

      <p className="practice-foot">
        时值练不稳时只有一个办法：<b>把 BPM 降到能听见每一拍</b>，稳了再加 5。
        跟着这套顺序走：数拍词 → 60 BPM 单音 → 加到 80 → 再换到和弦上。
      </p>

      {undo && (
        <UndoToast
          message={undo.paused ? `这一周不再出现「${undo.label}」` : `已跳过「${undo.label}」`}
          action={undo.paused ? undefined : { label: "这一周别出现", onClick: pausePick }}
          onUndo={undoSkip}
          onClose={() => setUndo(null)}
        />
      )}
    </section>
  );
}
