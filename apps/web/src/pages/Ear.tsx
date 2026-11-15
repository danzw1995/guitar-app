import { useEffect, useMemo, useState } from "react";
import {
  dateKeyOf,
  earRound,
  midiOf,
  noteName,
  type EarKind,
  type EarQuestion,
} from "@guitar/core";
import Transcribe from "../components/Transcribe";
import { useTone } from "../hooks/useTone";
import { loadEar, saveEar, type EarStats } from "../lib/storage";

/** 每轮几道题。 */
const ROUND = 8;

interface Lesson {
  no: number;
  title: string;
  body: string[];
  example: { caption: string; play: number[]; step?: number };
  check: { prompt: string; options: string[]; answer: string; hint: string };
}

const LESSONS: Lesson[] = [
  {
    no: 1,
    title: "扒谱到底在扒什么",
    body: [
      "一段音乐里同时有三件事：**音高**（是哪些音）、**节奏**（什么时候响、响多久）、**结构**（几小节、哪一段重复）。",
      "扒谱就是按这个顺序把它们写下来：先数出有几个音，再认出是哪几个音，最后把时值对齐到拍子上。",
      "一开始不要想「整首歌」，就听一小节——四个音以内，听清楚比听得多重要。",
    ],
    example: { caption: "三个音：C4 → E4 → G4（先数出 3 个，再认音）", play: [midiOf("C4"), midiOf("E4"), midiOf("G4")] },
    check: {
      prompt: "听到一小段旋律，第一步该做什么？",
      options: ["数清一共有几个音", "先猜是什么调", "先把和弦写下来"],
      answer: "数清一共有几个音",
      hint: "音都数不清就写和弦，等于还没看清字就猜句子。",
    },
  },
  {
    no: 2,
    title: "一个音的三件事：音名、八度、位置",
    body: [
      "同一个音高在吉他上往往不止一个位置：E4 既是 1 弦空弦，也是 2 弦 5 品、3 弦 9 品、4 弦 14 品。",
      "所以「听出是什么音」和「在哪儿按」是两件事。扒谱时先认音名，再挑一个省手的位置。",
      "八度也要听：E4 和 E2 是同一个音名，差了两个八度，听起来完全不同。",
    ],
    example: { caption: "同一个 E4，两遍——音高一样，位置不同", play: [midiOf("E4"), midiOf("E4")], step: 0.8 },
    check: {
      prompt: "E4 除了 1 弦空弦，还能在哪按出来？",
      options: ["2 弦 5 品", "2 弦 4 品", "3 弦 5 品"],
      answer: "2 弦 5 品",
      hint: "2 弦空弦是 B3，往上 5 个半音正好是 E4。",
    },
  },
  {
    no: 3,
    title: "在指板上找音",
    body: [
      "六根空弦从粗到细是 E2 A2 D3 G3 B3 E4。同一根弦上，**12 品是高八度**，**5 品是纯四度**（只有 3 弦到 2 弦是大三度，4 品）。",
      "所以先记空弦和 5 品这两个锚点，别的音都能从它们推：6 弦 5 品 = A2，7 品 = B2，8 品 = C3。",
      "找音慢是正常的，扒谱练的就是这个「慢」——慢到不用想。",
    ],
    example: { caption: "6 弦：空弦 E2 → 5 品 A2 → 12 品 E3", play: [midiOf("E2"), midiOf("A2"), midiOf("E3")], step: 0.6 },
    check: {
      prompt: "6 弦 5 品是什么音？",
      options: ["A2", "G2", "B2"],
      answer: "A2",
      hint: "6 弦空弦 E2 往上 5 个半音：F2 F#2 G2 G#2 A2。",
    },
  },
  {
    no: 4,
    title: "音程：两个音之间的距离",
    body: [
      "两个音差几个半音，就是几度的音程：2 个半音是大二度（《小星星》开头的 C–D），4 个是大三度（C–E），7 个是纯五度（C–G），12 个是纯八度（C–C）。",
      "扒旋律时先听「跨度」：跳得远还是挨着走。大二度是级进，三度以上是跳进，纯八度一听就是同一个音名。",
      "听不准就先哼：把两个音哼成「啊—啊」，距离感比盯着音名更容易抓。",
    ],
    example: { caption: "先听大二度 C–D，再听纯五度 C–G", play: [midiOf("C4"), midiOf("D4"), midiOf("C4"), midiOf("G4")], step: 0.5 },
    check: {
      prompt: "C 到 G 是什么音程？",
      options: ["纯五度", "纯四度", "大六度"],
      answer: "纯五度",
      hint: "C 到 G 是 7 个半音：C D E F G，数白键正好五个音级。",
    },
  },
];

const KIND_LABEL: Record<EarKind, string> = {
  position: "听音辨位",
  interval: "音程判断",
};

function percentOf(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

/** 正文里用 **…** 标重点，渲染成 <strong>（不引 markdown 库）。 */
function emphasize(text: string) {
  const parts = text.split("**");
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  );
}

/** 课里那道小题：点一个选项，立刻说对错。 */
function LessonCheck({ check }: { check: Lesson["check"] }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="ear-check">
      <p className="ear-check-q">{check.prompt}</p>
      <div className="ear-check-options">
        {check.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${picked === option ? (option === check.answer ? " on" : " wrong") : ""}`}
            onClick={() => setPicked(option)}
            aria-pressed={picked === option}
          >
            {option}
          </button>
        ))}
      </div>
      {picked && (
        <p className={picked === check.answer ? "ear-feedback ok" : "ear-feedback bad"} role="status">
          {picked === check.answer ? `对。${check.hint}` : `再想想——${check.hint}`}
        </p>
      )}
    </div>
  );
}

export default function Ear() {
  const { play } = useTone();
  const [kind, setKind] = useState<EarKind>("position");
  const [stats, setStats] = useState<EarStats>(() => loadEar());
  const [seed, setSeed] = useState(1);
  const [questions, setQuestions] = useState<EarQuestion[]>(() => earRound("position", 1, ROUND));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const answered = picked !== null;
  const today = useMemo(() => dateKeyOf(new Date()), []);

  const heard = useMemo(
    () => (question ? question.play.map((midi) => noteName(midi)).join(" → ") : ""),
    [question],
  );

  useEffect(() => {
    if (!question || finished) return;
    play(question.play, question.play.length > 1 ? 0.6 : 0.7);
    // 只在换题时播一次：play 每次渲染都是新函数，放进依赖会一直重播
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  function startRound(nextKind: EarKind = kind, nextSeed = seed) {
    setKind(nextKind);
    setQuestions(earRound(nextKind, nextSeed, ROUND));
    setIndex(0);
    setPicked(null);
    setCorrect(0);
    setFinished(false);
  }

  function choose(option: string) {
    if (answered) return;
    setPicked(option);
    if (option === question.answer) setCorrect((value) => value + 1);
  }

  function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    // 最后一题的对错已经在 choose() 里计进 correct 了
    const total = correct;
    const nextStats: EarStats = {
      rounds: stats.rounds + 1,
      best: Math.max(stats.best, total),
      lastAt: today,
      byKind: {
        ...stats.byKind,
        [kind]: {
          correct: (stats.byKind[kind]?.correct ?? 0) + total,
          total: (stats.byKind[kind]?.total ?? 0) + questions.length,
        },
      },
    };
    setStats(nextStats);
    saveEar(nextStats);
    setFinished(true);
  }

  const bestOfKind = stats.byKind[kind];

  return (
    <section className="panel ear" id="ear">
      <header className="panel-head">
        <h2>扒谱</h2>
        <p>
          听到一段，把它写下来。这一页分三块：先学怎么听（四节），再练听辨（两种题型），最后用录音扒一段真的。
        </p>
      </header>

      <h3 className="stat-sub">学 · 四节</h3>
      <ol className="ear-lessons">
        {LESSONS.map((lesson) => (
          <li className="ear-lesson" key={lesson.no} data-lesson={lesson.no}>
            <h4>
              <span className="ear-no">{lesson.no}</span>
              {lesson.title}
            </h4>
            {lesson.body.map((line) => (
              <p key={line}>{emphasize(line)}</p>
            ))}
            <div className="ear-example">
              <button type="button" className="btn-quiet" onClick={() => play(lesson.example.play, lesson.example.step ?? 0.45)}>
                听一下
              </button>
              <span className="ear-caption">{lesson.example.caption}</span>
            </div>
            <LessonCheck check={lesson.check} />
          </li>
        ))}
      </ol>

      <h3 className="stat-sub">练 · 听辨</h3>
      <div className="ear-practice">
        <div className="ear-kinds" role="group" aria-label="题型">
          {(Object.keys(KIND_LABEL) as EarKind[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${kind === id ? " on" : ""}`}
              aria-pressed={kind === id}
              onClick={() => startRound(id, seed)}
            >
              {KIND_LABEL[id]}
            </button>
          ))}
          <button type="button" className="btn-quiet ear-new" onClick={() => {
            const nextSeed = seed + 1;
            setSeed(nextSeed);
            startRound(kind, nextSeed);
          }}>
            换一套题
          </button>
        </div>

        <p className="ear-stats">
          {stats.rounds === 0
            ? `还没练过 · 这一轮 ${ROUND} 题`
            : `最好 ${stats.best} / ${ROUND} · 练了 ${stats.rounds} 轮`}
          {bestOfKind ? ` · ${KIND_LABEL[kind]}正确率 ${percentOf(bestOfKind.correct, bestOfKind.total)}` : ""}
        </p>

        {finished ? (
          <div className="ear-result" role="status">
            <p className="ear-score">
              这一轮 {correct} / {questions.length}
            </p>
            <p className="ear-feedback">
              {correct === questions.length
                ? "全对。下一套题换个题型试试。"
                : correct >= questions.length - 2
                  ? "不错。错的那几道再听一遍，注意音程的跨度。"
                  : "先回到上面第 4 节，把大二度、大三度、纯五度、纯八度听熟。"}
            </p>
            <button type="button" className="btn primary" onClick={() => startRound(kind, seed + 1)}>
              再来一轮
            </button>
          </div>
        ) : (
          <div className="ear-question">
            <p className="ear-progress">
              第 {index + 1} / {questions.length} 题 · 对 {correct}
            </p>
            <p className="ear-prompt">{question.prompt}</p>
            <div className="ear-actions">
              <button type="button" className="btn" onClick={() => play(question.play, question.play.length > 1 ? 0.6 : 0.7)}>
                再听一遍
              </button>
              {answered && <span className="ear-heard">听到的是 {heard}</span>}
            </div>
            <div className="ear-options">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`chip ear-option${
                    answered && option.id === question.answer
                      ? " on"
                      : answered && option.id === picked
                        ? " wrong"
                        : ""
                  }`}
                  onClick={() => choose(option.id)}
                  aria-pressed={picked === option.id}
                  disabled={answered}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {answered && (
              <div className="ear-after" role="status">
                <p className={picked === question.answer ? "ear-feedback ok" : "ear-feedback bad"}>
                  {picked === question.answer ? "对。" : "不对。"}
                  {question.hint}
                </p>
                <button type="button" className="btn primary" onClick={next}>
                  {index + 1 < questions.length ? "下一题" : "看结果"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="stat-sub">用 · 录音扒谱</h3>
      <Transcribe />
    </section>
  );
}
