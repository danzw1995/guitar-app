import { useEffect, useMemo, useState } from "react";
import {
  FEELS,
  SESSION_MINUTES,
  STAGES,
  blockOf,
  buildSession,
  dateKeyOf,
  drillsOfStage,
  practiceStats,
  pushBpmPoint,
  recordBlock,
  REGRESS_BOOST_DAYS,
  regressedIds,
  stageForCompleted,
  stageOf,
  techniquesOf,
  type DayLog,
  type Drill,
  type Feel,
  type PracticeLog,
} from "@guitar/core";
import {
  addPause,
  addSkip,
  loadPauses,
  pauseUntilOf,
  loadPractice,
  loadProgress,
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
import Metronome from "../components/Metronome";
import TabScore from "../components/TabScore";
import FollowAlong, { type FollowTarget } from "../components/FollowAlong";
import UndoToast from "../components/UndoToast";
import { useTone } from "../hooks/useTone";
import { meterOfTab } from "../lib/meter";

/** 秒 → mm:ss。 */
function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 今日练习：先选阶段，再按「今天有多少时间」生成计划。
 *
 * 三个刻意的设计：
 * 1. 阶段是**内容的差别**，不是时间配比的差别——每个阶段有自己的品域、时值和技巧；
 * 2. 每条练习都带六线谱，不用看文字猜"3→5"是什么意思；
 * 3. 页面下半部分是**这个阶段的全部练习**，计划只是今天从里面挑的几条。
 */
export default function Practice() {
  const today = dateKeyOf(new Date());

  const [log, setLog] = useState<PracticeLog>(() => loadPractice());
  const [minutes, setMinutes] = useState(60);
  const [stage, setStage] = useState(() => {
    const progress = loadProgress();
    const completed = Object.values(progress).filter((item) => item.completed).length;
    return stageForCompleted(completed);
  });
  const [hand, setHand] = useState<"left" | "right">("left");

  const [runningId, setRunningId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const { playTab } = useTone();
  const [playhead, setPlayhead] = useState<{ id: string; beat: number } | null>(null);
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  const [follow, setFollow] = useState<FollowTarget | null>(null);
  const [skips, setSkips] = useState<SkipLog>(() => loadSkips());
  const [pauses, setPauses] = useState<PauseLog>(() => loadPauses());
  /** 刚跳过的哪一条（底部提示 + 撤销）。`paused` = 已经升级成「这一周先不练」。 */
  const [undo, setUndo] = useState<{ id: string; label: string; paused?: boolean } | null>(null);

  /** 试听一条练习：谱面上会跟着走一条「当前拍」竖条，和节奏页同一套播放头。 */
  function audition(id: string, tab: (typeof library)[number]["tab"], bpm: number) {
    setPlayhead({ id, beat: 0 });
    playTab(tab, bpm, {
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { id, beat }),
    });
  }

  const beatOf = (id: string) => (playhead?.id === id ? playhead.beat : null);

  /**
   * 跟练：节拍器起速、每几小节往上加，练完记下当前速度。
   *
   * 成绩存在节奏页同一张表里，但键加了 `p:` 前缀——练习页的条目和节奏页的
   * 103 条分开数，统计页的「节奏与伴奏」也不会把它们算进去。
   */
  const followKey = (id: string) => `p:${id}`;
  const best = (key: string) => records[key]?.bestBpm;

  function openFollow(drill: Drill) {
    setFollow({
      id: followKey(drill.id),
      name: drill.name,
      bpm: drill.bpm ?? [70, 90],
      tab: drill.tab,
      meter: meterOfTab(drill.tab),
    });
  }

  /** 「换一条」：今天先不练这条，计划会从同一块里挑下一条。 */
  function swapBlock(id: string) {
    const label = session.blocks.find((block) => block.drill.id === id)?.drill.name ?? id;
    const next = addSkip(skips, today, id);
    saveSkips(next);
    setSkips(next);
    setUndo({ id, label });
  }

  /** 提示里的第二条出路：这条这一周都别再排进来。 */
  function pauseBlock() {
    if (!undo) return;
    const next = addPause(pauses, undo.id, today);
    savePauses(next);
    setPauses(next);
    setUndo({ ...undo, paused: true });
  }

  /** 点错了就撤销：跳过和压后一起撤，计划马上回到原来那条。 */
  function undoSkip() {
    if (!undo) return;
    const nextSkip = removeSkip(skips, today, undo.id);
    const nextPause = removePause(pauses, undo.id);
    saveSkips(nextSkip);
    savePauses(nextPause);
    setSkips(nextSkip);
    setPauses(nextPause);
    setUndo(null);
  }

  function recordFollow(result: { bpm: number; minutes: number }) {
    if (!follow) return;
    const previous = records[follow.id];
    const next: RhythmRecords = {
      ...records,
      [follow.id]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + result.minutes,
        lastAt: today,
        history: pushBpmPoint(previous?.history, today, result.bpm),
      },
    };
    setRecords(next);
    saveRhythm(next);

    // 跟练的时长也算今天的练习量：用 `p:` 这个块记，和「计时/完成」记的不冲突
    commit(
      recordBlock(log, today, {
        drill: follow.id,
        minutes: result.minutes,
        stage,
      }),
    );
  }

  const stageDef = stageOf(stage);
  const library = useMemo(() => drillsOfStage(stage), [stage]);
  // 跟练速度退步的练习（`p:` 前缀的记录）加几天紧迫度，让它们先回来
  const boost = useMemo(() => {
    const map = new Map<string, number>();
    for (const key of regressedIds(records)) {
      if (key.startsWith("p:")) map.set(key.slice(2), REGRESS_BOOST_DAYS);
    }
    return map;
  }, [records]);
  // 今天点了「换一条」的练习，加上「这一周先不练」的：计划里都先跳过
  const skip = useMemo(
    () => new Set([...skipsOf(skips, today), ...pausedOf(pauses, today)]),
    [skips, pauses, today],
  );
  const session = useMemo(
    () =>
      buildSession({
        minutes,
        stage,
        date: today,
        log,
        boost,
        skip,
        freeze: pauseUntilOf(pauses),
      }),
    [minutes, stage, today, log, boost, skip, pauses],
  );
  const stats = useMemo(() => practiceStats(log, today), [log, today]);

  const day: DayLog | undefined = log[today];
  const done = new Set(day?.done ?? []);
  const goal = day?.goal ?? "";
  const feel = day?.feel;
  const doneCount = session.blocks.filter((block) => done.has(block.drill.id)).length;

  useEffect(() => {
    if (!runningId) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [runningId]);

  function commit(next: PracticeLog) {
    setLog(next);
    savePractice(next);
  }

  /** 改当天的目标或感受：不动练习时长。 */
  function patchDay(patch: Partial<DayLog>) {
    const current = log[today] ?? { minutes: 0, stage, done: [] };
    commit({ ...log, [today]: { ...current, ...patch, stage } });
  }

  function start(id: string) {
    if (runningId === id) {
      setRunningId(null);
      return;
    }
    setRunningId(id);
    setSeconds(0);
  }

  function finish(drillId: string, planned: number) {
    // 没用计时器也允许打勾：按计划时长记，别惩罚"忘了按开始"的人
    const used = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : planned;
    commit(recordBlock(log, today, { drill: drillId, minutes: used, stage }));
    setRunningId(null);
    setSeconds(0);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>今日练习</h2>
        <p>
          六个阶段，从「每个音都干净」到「能完整弹一段」。每个阶段有自己的品域、时值和技巧，
          每条练习都配六线谱——先看谱，再上手。
        </p>
      </div>

      {follow && (
        <FollowAlong
          target={follow}
          best={best(follow.id)}
          onFinish={recordFollow}
          onClose={() => setFollow(null)}
        />
      )}

      {/* ---------- 阶段 ---------- */}
      <ol className="stage-track" aria-label="练习阶段">
        {STAGES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === stage ? "stage-btn on" : "stage-btn"}
              aria-current={item.id === stage ? "step" : undefined}
              onClick={() => setStage(item.id)}
            >
              <span className="stage-no">S{item.id}</span>
              <span className="stage-name">{item.name}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="stage-info">
        <p className="stage-focus">{stageDef.focus}</p>
        <ul className="stage-new">
          {stageDef.newSkills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
        <p className="stage-meta">
          品域 <b>{stageDef.range}</b> · 速度 <b>{stageDef.bpm}</b> BPM · 本阶段 {library.length} 条练习
          <br />
          升级门槛：{stageDef.gate}
        </p>
      </div>

      {/* ---------- 今天的计划 ---------- */}
      <h3 className="practice-h3">今天的计划</h3>
      <div className="practice-bar">
        <label className="practice-field">
          <span>今天能练</span>
          <select
            value={minutes}
            aria-label="今天能练多少分钟"
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {SESSION_MINUTES.map((value) => (
              <option key={value} value={value}>
                {value} 分钟
              </option>
            ))}
          </select>
        </label>

        <label className="practice-field grow">
          <span>今天的唯一目标</span>
          <input
            type="text"
            value={goal}
            placeholder={stageDef.focus}
            onChange={(event) => patchDay({ goal: event.target.value })}
          />
        </label>

        <label className="practice-field">
          <span>手感</span>
          <select
            value={feel ?? ""}
            aria-label="今天的手感"
            onChange={(event) =>
              patchDay({ feel: (event.target.value || undefined) as Feel | undefined })
            }
          >
            <option value="">还没评</option>
            {FEELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="practice-summary">
        <span>
          连续 <b>{stats.streak}</b> 天
        </span>
        <span>
          本周 <b>{stats.weekTotal}</b> 分钟
        </span>
        <span>
          今天 <b>{day?.minutes ?? 0}</b> 分钟
        </span>
        <span>
          {doneCount}/{session.blocks.length} 块
        </span>
      </div>

      <div
        className="practice-progress"
        role="progressbar"
        aria-label="今天完成了几块"
        aria-valuemin={0}
        aria-valuemax={session.blocks.length}
        aria-valuenow={doneCount}
      >
        <span style={{ width: `${(doneCount / session.blocks.length) * 100}%` }} />
      </div>

      <details className="practice-metronome" open>
        <summary>节拍器（每一块都该开）</summary>
        <Metronome />
      </details>

      <ol className="practice-list">
        {session.blocks.map((block, index) => {
          const drill = block.drill;
          const isDone = done.has(drill.id);
          const running = runningId === drill.id;
          return (
            <li
              key={drill.id}
              className={`practice-block${isDone ? " done" : ""}${running ? " running" : ""}`}
            >
              <div className="pb-head">
                <span className="pb-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="pb-title">
                  <h4>
                    {blockOf(block.block).label} · {drill.name}
                  </h4>
                  <p className="pb-meta">
                    {block.minutes} 分钟
                    {drill.bpm ? ` · ${drill.bpm[0]}–${drill.bpm[1]} BPM` : ""}
                    {isDone ? " · 已完成" : ""}
                  </p>
                  <p className="pb-due">
                    {[
                      block.lastAt ? `上次练 ${block.days} 天前` : "还没练过，今天先见一面",
                      block.boost ? "跟练速度退步了，先补上" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="pb-timer" role="timer" aria-live="off">
                  {clock(running ? seconds : 0)}
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => audition(drill.id, drill.tab, drill.bpm ? drill.bpm[0] : 70)}
                >
                  试听
                </button>
                <button type="button" className="btn-quiet" onClick={() => openFollow(drill)}>
                  跟练
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => swapBlock(drill.id)}
                  title="今天先不练这条，换一条"
                >
                  换一条
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => start(drill.id)}
                  aria-pressed={running}
                >
                  {running ? "暂停" : "计时"}
                </button>
                <button
                  type="button"
                  className={isDone ? "btn" : "btn primary"}
                  onClick={() => finish(drill.id, block.minutes)}
                  disabled={isDone}
                >
                  {isDone ? "已勾" : "完成"}
                </button>
              </div>

              <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />

              <div className="pb-side">
                <p className="pb-line">
                  <b>验收</b>：{drill.pass}
                </p>
                <details className="pb-more">
                  <summary>怎么练 · 常见错误</summary>
                  <ol className="pb-steps">
                    {drill.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="pb-line">
                    <b>常见错误</b>：{drill.mistake}
                  </p>
                </details>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ---------- 本阶段全部练习 ---------- */}
      <h3 className="practice-h3">
        这一阶段的 {library.length} 条练习
        <span className="practice-h3-hint">计划每天从里面挑几条，剩下的当备选</span>
      </h3>
      <div className="drill-grid">
        {library.map((drill) => (
          <article key={drill.id} className="drill-card">
            <header className="drill-head">
              <h4>{drill.name}</h4>
              <span className="drill-block">{blockOf(drill.block).label}</span>
            </header>
            <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => audition(drill.id, drill.tab, drill.bpm ? drill.bpm[0] : 70)}
              >
                试听
              </button>
              <button type="button" className="btn-quiet" onClick={() => openFollow(drill)}>
                跟练
              </button>
              {best(followKey(drill.id)) !== undefined && (
                <span className="best-badge">最高 {best(followKey(drill.id))} BPM</span>
              )}
            </div>
            <details className="pb-more">
              <summary>练法与验收</summary>
              <ol className="pb-steps">
                {drill.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>常见错误</b>：{drill.mistake}
              </p>
              <p className="pb-line">
                <b>验收</b>：{drill.pass}
              </p>
            </details>
          </article>
        ))}
      </div>

      {/* ---------- 技巧库 ---------- */}
      <section className="techniques">
        <h3>技巧库</h3>
        <p className="practice-note">
          14 张卡：左手 7 项、右手 7 项。每张都是「是什么 / 要领 / 常见错误 / 练法 / 验收」，
          卡右上角的 S 编号是建议开始练的阶段。
        </p>
        <div className="lesson-buttons">
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={hand === side ? "chip on" : "chip"}
              aria-pressed={hand === side}
              onClick={() => setHand(side)}
            >
              {side === "left" ? "左手" : "右手"}
            </button>
          ))}
        </div>

        <div className="technique-list">
          {techniquesOf(hand).map((technique) => (
            <details key={technique.id} className="technique">
              <summary>
                <b>{technique.name}</b>
                <span className="technique-stage">S{technique.stage}</span>
              </summary>
              <p className="tech-summary">{technique.summary}</p>
              <ul className="tech-keys">
                {technique.keys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
              <p className="pb-line">
                <b>常见错误</b>：{technique.mistake}
              </p>
              <ol className="pb-steps">
                {technique.how.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>验收</b>：{technique.pass}
              </p>
            </details>
          ))}
        </div>
      </section>

      <p className="practice-foot">
        练习和「音阶游戏」是两条线：这里练手，那里考音。两边都做，进度才完整。
      </p>

      {undo && (
        <UndoToast
          message={undo.paused ? `这一周不再出现「${undo.label}」` : `已跳过「${undo.label}」`}
          action={undo.paused ? undefined : { label: "这一周别出现", onClick: pauseBlock }}
          onUndo={undoSkip}
          onClose={() => setUndo(null)}
        />
      )}
    </section>
  );
}
