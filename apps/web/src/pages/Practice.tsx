import { useEffect, useMemo, useState } from "react";
import {
  BLOCKS,
  DRILLS,
  FEELS,
  SESSION_MINUTES,
  STAGES,
  buildSession,
  blockOf,
  dateKeyOf,
  practiceStats,
  recordBlock,
  stageForCompleted,
  stageOf,
  techniquesOf,
  type DayLog,
  type Feel,
  type PracticeLog,
} from "@guitar/core";
import { loadPractice, loadProgress, savePractice } from "../lib/storage";
import Metronome from "../components/Metronome";

/** 秒 → mm:ss。 */
function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 今日练习：按「有多少时间 + 在哪个阶段」生成一份时间盒计划。
 *
 * 为什么不是一张固定的周计划表：练什么取决于今天有多少分钟和卡在哪，
 * 固定表第二天就对不上。阶段固定、内容按日期轮换，才是能坚持的形态。
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

  const session = useMemo(
    () => buildSession({ minutes, stage, date: today }),
    [minutes, stage, today],
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

  function finish(blockId: string, drillId: string, planned: number) {
    // 没用计时器也允许打勾：按计划时长记，别惩罚"忘了按开始"的人
    const used = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : planned;
    commit(recordBlock(log, today, { drill: drillId, minutes: used, stage }));
    setRunningId(null);
    setSeconds(0);
    void blockId;
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>今日练习</h2>
        <p>
          先定「今天能练多久」和「在哪个阶段」，生成的计划按时间切好块：热身 → 基本功 → 和弦 →
          节奏 → 应用（够长再加曲目）。每块都有验收标准——练到标准算完，不是练到时间到。
          设计说明见 <code>docs/practice.md</code>。
        </p>
      </div>

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

        <label className="practice-field">
          <span>阶段</span>
          <select
            value={stage}
            aria-label="练习阶段"
            onChange={(event) => setStage(Number(event.target.value))}
          >
            {STAGES.map((item) => (
              <option key={item.id} value={item.id}>
                S{item.id} {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="practice-field grow">
          <span>今天的唯一目标</span>
          <input
            type="text"
            value={goal}
            placeholder={stageOf(stage).focus}
            onChange={(event) => patchDay({ goal: event.target.value })}
          />
        </label>
      </div>

      <p className="practice-note">
        {stageOf(stage).focus}。升级门槛：{stageOf(stage).gate}。
      </p>

      <div className="practice-summary">
        <span>
          连续 <b>{stats.streak}</b> 天
        </span>
        <span>
          本周 <b>{stats.weekTotal}</b> 分钟
        </span>
        <span>
          今天已练 <b>{day?.minutes ?? 0}</b> 分钟
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

      <details className="practice-metronome">
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
                  <h3>
                    {blockOf(block.block).label} · {drill.name}
                  </h3>
                  <p className="pb-meta">
                    {block.minutes} 分钟
                    {drill.bpm ? ` · ${drill.bpm[0]}–${drill.bpm[1]} BPM` : ""}
                    {isDone ? " · 已完成" : ""}
                  </p>
                </div>
                <span className="pb-timer" role="timer" aria-live="off">
                  {clock(running ? seconds : 0)}
                </span>
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
                  onClick={() => finish(block.block, drill.id, block.minutes)}
                  disabled={isDone}
                >
                  {isDone ? "已勾" : "完成"}
                </button>
              </div>

              <details className="pb-more">
                <summary>怎么练 · 常见错误 · 验收</summary>
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
            </li>
          );
        })}
      </ol>

      <div className="practice-feel">
        <span>今天手感：</span>
        {FEELS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={feel === item.id ? "chip on" : "chip"}
            aria-pressed={feel === item.id}
            onClick={() => patchDay({ feel: item.id as Feel })}
          >
            {item.label}
          </button>
        ))}
        <span className="practice-feel-hint">
          自评只给自己看——一周后回看「不稳」的那几天，比看练了几分钟有用。
        </span>
      </div>

      <section className="techniques">
        <h3>技巧库</h3>
        <p className="practice-note">
          14 张卡：左手 7 项、右手 7 项。每张都是「是什么 / 要领 / 常见错误 / 练法 / 验收」，
          按建议顺序排（S 编号对应上面的阶段）。
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
        练习库共 {DRILLS.length} 条、{BLOCKS.length} 个块。练完记得回到「音阶游戏」看看主线进度——
        练习和关卡是两条线，互相不替代。
      </p>
    </section>
  );
}
