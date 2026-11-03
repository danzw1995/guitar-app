import { useMemo, useState } from "react";
import { mulberry32, type TheoryQuestion } from "@guitar/core";

export interface TheoryQuizProps {
  title: string;
  /** 用 seed 生成一道题；同一个 seed 必须同题。 */
  make: (rng: () => number) => TheoryQuestion;
  onClose: () => void;
}

const TOTAL = 5;

/** 五道四选一的乐理小练习：答完一题立刻给解释，最后报分。 */
export default function TheoryQuiz({ title, make, onClose }: TheoryQuizProps) {
  const [index, setIndex] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const question = useMemo(
    () => make(mulberry32(seed + index)),
    [make, seed, index],
  );

  function choose(choice: string) {
    if (picked !== null) return;
    setPicked(choice);
    if (choice === question.answer) setScore((n) => n + 1);
  }

  function next() {
    if (index + 1 >= TOTAL) {
      setDone(true);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
  }

  return (
    <div className="quiz-backdrop" onClick={onClose}>
      <div
        className="quiz"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quiz-head">
          <b>{title}</b>
          <span className="muted">
            {done ? `${TOTAL} / ${TOTAL}` : `${index + 1} / ${TOTAL}`} · 答对 {score}
          </span>
        </div>

        {done ? (
          <div className="quiz-done">
            <p>
              答对 <b>{score}</b> / {TOTAL}
            </p>
            <p className="muted">
              {score === TOTAL
                ? "全对，这个知识点可以过了。"
                : score >= TOTAL - 1
                  ? "基本稳了，再练一轮把最后一个补上。"
                  : "看一遍上面的表格，再来一轮会快很多。"}
            </p>
            <div className="quiz-actions">
              <button className="btn primary" type="button" onClick={onClose}>
                完成
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="quiz-prompt">{question.prompt}</p>
            <div className="quiz-choices">
              {question.choices.map((choice) => {
                const isAnswer = choice === question.answer;
                const isPicked = choice === picked;
                const state = picked === null ? "" : isAnswer ? " right" : isPicked ? " wrong" : " dim";
                return (
                  <button
                    key={choice}
                    type="button"
                    className={`quiz-choice${state}`}
                    onClick={() => choose(choice)}
                    disabled={picked !== null}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {picked !== null && (
              <div className="quiz-explain" role="status">
                <b>{picked === question.answer ? "对了" : "不对"}</b>
                <span>{question.explain}</span>
              </div>
            )}

            <div className="quiz-actions">
              <button className="btn ghost" type="button" onClick={onClose}>
                退出
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={next}
                disabled={picked === null}
              >
                {index + 1 >= TOTAL ? "看结果" : "下一题"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
