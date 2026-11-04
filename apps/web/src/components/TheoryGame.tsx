import { useMemo, useState } from "react";
import {
  SHARP_NAMES,
  STANDARD_TUNING,
  THEORY_LEVELS,
  applyAttempt,
  judgeTask,
  parMsFor,
  pitchClassAt,
  starsOf,
  theoryAttempt,
  theoryTargetCount,
  theoryTasks,
  type AttemptContext,
  type LevelProgress,
  type ProgressMap,
  type TheoryLevelDef,
  type TheoryTask,
} from "@guitar/core";
import Fretboard from "./Fretboard";
import Stars from "./Stars";
import { fmt } from "../lib/format";
import { loadProgress, saveProgress } from "../lib/storage";

const CHAPTERS = ["三和弦", "七和弦", "音程"];

/**
 * 乐理挑战：12 个固定关卡，每关 4 题。
 *
 * 玩法是「在指板上点亮所有答案格」——不是填空、不是选择题。
 * 进度与星级复用 `guitar.progress.v1`，所以统计页和最快成绩都能看到。
 */
export default function TheoryGame() {
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [active, setActive] = useState<TheoryLevelDef | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [judged, setJudged] = useState<ReturnType<typeof judgeTask> | null>(null);
  const [judgements, setJudgements] = useState<ReturnType<typeof judgeTask>[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finished, setFinished] = useState<{ stars: number; ms: number; accuracy: number } | null>(null);
  const [reveal, setReveal] = useState(false);

  const tasks = useMemo(() => (active ? theoryTasks(active) : []), [active]);
  const task: TheoryTask | undefined = tasks[taskIndex];

  function start(level: TheoryLevelDef) {
    setActive(level);
    setTaskIndex(0);
    setSelected(new Set());
    setJudged(null);
    setJudgements([]);
    setFinished(null);
    setReveal(false);
    setStartedAt(Date.now());
  }

  function toggle(s: number, f: number) {
    if (judged || finished) return;
    const key = `${s}:${f}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submitTask() {
    if (!task || judged) return;
    const judgement = judgeTask(task, [...selected]);
    setJudged(judgement);
    setJudgements((prev) => [...prev, judgement]);
  }

  function nextTask() {
    if (!active) return;
    if (taskIndex + 1 < tasks.length) {
      setTaskIndex((i) => i + 1);
      setSelected(new Set());
      setJudged(null);
      return;
    }
    // 最后一题：合成结果、算星级、存档
    const result = theoryAttempt(judgements);
    const ctx: AttemptContext = {
      elapsedMs: startedAt ? Date.now() - startedAt : 0,
      strictSpelling: false,
      parMs: parMsFor({ targetCount: theoryTargetCount(active), difficulty: active.difficulty }),
    };
    const prev: LevelProgress | undefined = progress[active.id];
    const after = applyAttempt(prev, result, ctx);
    const nextProgress = { ...progress, [active.id]: after };
    setProgress(nextProgress);
    saveProgress(nextProgress);
    setFinished({ stars: starsOf(after, ctx.parMs), ms: ctx.elapsedMs, accuracy: result.accuracy });
  }

  function close() {
    setActive(null);
    setFinished(null);
  }

  return (
    <div className="theory-game" id="theory-game">
      <div className="theory-game-head">
        <h3>乐理挑战</h3>
        <p className="muted">
          在指板上点亮全部答案格。12 关、每关 4 题，和 40 关共用一套星级进度。
        </p>
      </div>

      {CHAPTERS.map((chapter, chapterIndex) => (
        <div key={chapter} className="theory-chapter">
          <span className="theory-chapter-name">{chapter}</span>
          <div className="theory-levels">
            {THEORY_LEVELS.filter((level) => level.chapter === chapterIndex + 1).map((level) => {
              const record = progress[level.id];
              return (
                <button
                  key={level.id}
                  type="button"
                  className={record?.completed ? "theory-tile done" : "theory-tile"}
                  onClick={() => start(level)}
                >
                  <b>{level.id}</b>
                  <i>{level.title}</i>
                  <Stars n={record?.stars ?? 0} />
                  <span className="theory-tile-time">
                    {record?.bestMs != null ? fmt(record.bestMs) : `${level.fretMin}–${level.fretMax} 品`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {active && (
        <div className="quiz-backdrop" onClick={close}>
          <div
            className="quiz theory-player"
            role="dialog"
            aria-modal="true"
            aria-label={`${active.id} ${active.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="quiz-head">
              <b>
                {active.id} · {active.title}
              </b>
              <span className="muted">
                {Math.min(taskIndex + 1, tasks.length)} / {tasks.length} 题
              </span>
            </div>

            {finished ? (
              <div className="quiz-done">
                <p>
                  <Stars n={finished.stars} size="lg" />
                </p>
                <p>
                  用时 <b>{fmt(finished.ms)}</b> · 正确率{" "}
                  <b>{Math.round(finished.accuracy * 100)}%</b>
                </p>
                <p className="muted">
                  三星目标 {fmt(parMsFor({ targetCount: theoryTargetCount(active), difficulty: active.difficulty }))}
                </p>
                <div className="quiz-actions">
                  <button className="btn ghost" type="button" onClick={() => start(active)}>
                    再练一次
                  </button>
                  <button className="btn primary" type="button" onClick={close}>
                    完成
                  </button>
                </div>
              </div>
            ) : task ? (
              <>
                <p className="quiz-prompt">{task.prompt}</p>
                {reveal && !judged && (
                  <p className="lesson-cap">
                    需要点亮：{task.pcs.map((pc) => SHARP_NAMES[pc]).join("、")}
                  </p>
                )}

                <Fretboard
                  fretMin={task.fretMin}
                  fretMax={task.fretMax}
                  renderCell={(s, f) => {
                    if (judged) return "";
                    if (reveal) return SHARP_NAMES[pitchClassAt(STANDARD_TUNING, s, f)];
                    return "";
                  }}
                  cellClass={(s, f) => {
                    const key = `${s}:${f}`;
                    if (judged) {
                      const inAnswer = task.cells.some((cell) => cell.s === s && cell.f === f);
                      if (inAnswer) return selected.has(key) ? "ok" : "empty";
                      return selected.has(key) ? "bad" : "blank";
                    }
                    return selected.has(key) ? "filled" : "blank";
                  }}
                  isDisabled={() => Boolean(judged)}
                  onCellClick={toggle}
                />

                {judged && (
                  <div className="quiz-explain" role="status">
                    <b>
                      {judged.ok
                        ? "对了"
                        : judged.missing.length > 0
                          ? `漏了 ${judged.missing.length} 格`
                          : `多点了 ${judged.extra.length} 格`}
                    </b>
                    <span>{task.explain}</span>
                  </div>
                )}

                <div className="quiz-actions">
                  <button className="btn ghost" type="button" onClick={() => setReveal((v) => !v)}>
                    {reveal ? "隐藏音名" : "显示音名（提示）"}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setSelected(new Set())}>
                    清空
                  </button>
                  {judged ? (
                    <button className="btn primary" type="button" onClick={nextTask}>
                      {taskIndex + 1 < tasks.length ? "下一题" : "看结果"}
                    </button>
                  ) : (
                    <button className="btn primary" type="button" onClick={submitTask}>
                      提交本题
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
