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
import ChordListen from "../components/ChordListen";
import { useMediaQuery } from "../hooks/useMediaQuery";
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
  {
    no: 5,
    title: "先找主音：它决定了一切",
    body: [
      "一段旋律听起来「完了」「落地了」的那个音，通常就是主音。它最稳，别的音都想回到它。",
      "另一个办法：看这段用了哪几个音，把它们排成音阶，最像「家」的那个就是主音。",
      "主音没定，级数就没法算——同一个 G，在 C 调里是 5 级，在 G 调里是 1 级。",
    ],
    example: {
      caption: "C 大调走一遍，最后回到 C——听着就「落地」了",
      play: [midiOf("C4"), midiOf("D4"), midiOf("E4"), midiOf("F4"), midiOf("G4"), midiOf("A4"), midiOf("B4"), midiOf("C5")],
      step: 0.34,
    },
    check: {
      prompt: "一段旋律最后停在 G，听起来很稳，它最可能是什么调？",
      options: ["G 调", "C 调", "D 调"],
      answer: "G 调",
      hint: "旋律最后停下来的音通常就是主音；停在 G，就是 G 调。",
    },
  },
  {
    no: 6,
    title: "级数：把音换成数字",
    body: [
      "级数是「相对主音的位置」，用 1–7 表示：C 调里 C=1、D=2、E=3……G 调里 G=1、A=2、B=3。",
      "用级数记和弦走向，换调时不用改：1–5–6–4 在 C 调是 C–G–Am–F，在 G 调是 G–D–Em–C，听起来是同一件事。",
      "所以扒歌的顺序是：先定调 → 把听到的音换成级数 → 最后才落回具体的和弦。",
    ],
    example: {
      caption: "C 调：1 2 3 4 5 6 7（C D E F G A B）",
      play: [midiOf("C4"), midiOf("D4"), midiOf("E4"), midiOf("F4"), midiOf("G4"), midiOf("A4"), midiOf("B4")],
      step: 0.38,
    },
    check: {
      prompt: "C 调里的 5 级是哪个音？",
      options: ["G", "F", "A"],
      answer: "G",
      hint: "C 是 1，往上数：D=2、E=3、F=4、G=5。",
    },
  },
  {
    no: 7,
    title: "三和弦：三个音，两种颜色",
    body: [
      "三和弦是三个音：根音、三度、五度。**大三和弦**是根音 + 4 个半音 + 3 个半音（C–E–G）；**小三和弦**是 + 3 + 4（C–E♭–G）。",
      "差别只在中间那个音：大三度听起来亮，小三度听起来暗。先听这一个音，比听整个和弦容易得多。",
      "吉他上最常用的开放和弦：C、G、D、A、E 是大三，Am、Em、Dm 是小三。",
    ],
    example: {
      caption: "C 大三（C–E–G）→ C 小三（C–E♭–G），只差中间那个音",
      play: [midiOf("C4"), midiOf("E4"), midiOf("G4"), midiOf("C4"), midiOf("Eb4"), midiOf("G4")],
      step: 0.42,
    },
    check: {
      prompt: "C–E♭–G 是什么和弦？",
      options: ["C 小三和弦", "C 大三和弦", "C 减三和弦"],
      answer: "C 小三和弦",
      hint: "根音到三度 3 个半音（C→E♭），三度到五度 4 个半音——这是小三和弦。",
    },
  },
  {
    no: 8,
    title: "听根音：先抓最低那个音",
    body: [
      "听一个和弦，先抓最低的音——通常就是根音。扒和弦的顺序：先定低音，再听它是大三还是小三。",
      "吉他上低音常在 6、5、4 弦：C 的根音在 5 弦 3 品，G 在 6 弦 3 品，F 在 4 弦 3 品。",
      "低音听错，整个和弦名就错了：C/E 和 C 只差一个低音，功能却不一样。",
    ],
    example: {
      caption: "C 和弦从低到高：根音 C3 在最下面",
      play: [midiOf("C3"), midiOf("E3"), midiOf("G3"), midiOf("C4"), midiOf("E4"), midiOf("G4")],
      step: 0.4,
    },
    check: {
      prompt: "低音是 A，上面是小三度，最可能是什么和弦？",
      options: ["Am", "A", "F"],
      answer: "Am",
      hint: "低音 A 是根音，上面是小三度 → 小三和弦 Am。",
    },
  },
  {
    no: 9,
    title: "和弦性质：大、小、减",
    body: [
      "三和弦按「两个三度」叠起来分三种：**大三**（4+3 个半音）、**小三**（3+4）、**减三**（3+3）。",
      "根音到五度都是 7 个半音（纯五度），所以区别全在中间那个三度——听性质就盯这一个音。",
      "C 调里的七级和弦：1 C 大三、2 Dm、3 Em、4 F 大三、5 G 大三、6 Am、7 Bdim 减三。",
    ],
    example: {
      caption: "C 大三 → C 小三 → C 减三：中间那个音一路往下压",
      play: [midiOf("C4"), midiOf("E4"), midiOf("G4"), midiOf("C4"), midiOf("Eb4"), midiOf("G4"), midiOf("C4"), midiOf("Eb4"), midiOf("Gb4")],
      step: 0.34,
    },
    check: {
      prompt: "C–E–G♭ 是什么和弦？",
      options: ["C 减三和弦", "C 小三和弦", "C 大三和弦"],
      answer: "C 减三和弦",
      hint: "C 到 E 是 4 个半音，E 到 G♭ 是 3 个半音——两个小三度叠起来就是减三和弦。",
    },
  },
  {
    no: 10,
    title: "级数走向：四个和弦的故事",
    body: [
      "流行歌最常见的走向是 **1–5–6–4**（C–G–Am–F），听起来「往前推、再回到原点」。",
      "**6–4–1–5**（Am–F–C–G）更抒情；**1–6–4–5** 是老派甜歌的套路。走向一样，换调只换主音。",
      "听走向别听具体和弦名，先听「哪个亮、哪个暗」：1、4、5 级是大三（亮），2、3、6 级是小三（暗）。",
    ],
    example: {
      caption: "C 调 1–5–6–4：C–G–Am–F，每个和弦从低到高拆开弹",
      play: [
        midiOf("C4"), midiOf("E4"), midiOf("G4"),
        midiOf("G3"), midiOf("B3"), midiOf("D4"),
        midiOf("A3"), midiOf("C4"), midiOf("E4"),
        midiOf("F3"), midiOf("A3"), midiOf("C4"),
      ],
      step: 0.26,
    },
    check: {
      prompt: "C 调里的 1–5–6–4 是哪四个和弦？",
      options: ["C–G–Am–F", "C–F–G–Am", "Am–F–C–G"],
      answer: "C–G–Am–F",
      hint: "1 级 C、5 级 G、6 级 Am、4 级 F。",
    },
  },
  {
    no: 11,
    title: "节奏拍点：什么时候响",
    body: [
      "扒谱不只有音高，还有时间：一个音在第几拍、占多长。先数拍子（1 2 3 4），再看重音落在哪。",
      "4/4 里第 1 拍最重、第 3 拍次重；重音落在 2、4 拍就是「反拍」，听起来会往前推。",
      "吉他上最好用的判断：右手下扫通常落在正拍，上扫落在反拍。",
    ],
    example: {
      caption: "一拍一个，四拍走一遍——第 1 拍最重",
      play: [midiOf("C3"), midiOf("C3"), midiOf("C3"), midiOf("C3")],
      step: 0.5,
    },
    check: {
      prompt: "4/4 拍里，重音通常落在哪几拍？",
      options: ["第 1 拍和第 3 拍", "第 2 拍和第 4 拍", "每拍一样重"],
      answer: "第 1 拍和第 3 拍",
      hint: "第 1 拍最重、第 3 拍次重；重音落在 2、4 拍就是反拍。",
    },
  },
  {
    no: 12,
    title: "完整扒一段：四步串起来",
    body: [
      "完整流程：① 数清有几个音 → ② 定主音 → ③ 把音换成级数 → ④ 对齐拍子，最后按小节写下来。",
      "先扒一句（两小节），扒对了再往下；一句一句接起来，比一次听一整段可靠得多。",
      "扒完唱一遍：唱得出来，说明真听清了；唱不出来，多半是猜的。",
    ],
    example: {
      caption: "一句旋律：C D E G E D C（扒完唱一遍）",
      play: [midiOf("C4"), midiOf("D4"), midiOf("E4"), midiOf("G4"), midiOf("E4"), midiOf("D4"), midiOf("C4")],
      step: 0.36,
    },
    check: {
      prompt: "扒完一句，最该做的一件事是？",
      options: ["唱一遍，确认自己听清了", "马上扒下一句", "先把和弦写上"],
      answer: "唱一遍，确认自己听清了",
      hint: "唱得出来才是真听清；唱不出来，写下的谱多半是猜的。",
    },
  },
];

const KIND_LABEL: Record<EarKind, string> = {
  position: "听音辨位",
  interval: "音程判断",
  degree: "级数判断",
  progression: "级数走向",
  quality: "和弦性质",
};

function percentOf(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

/** 播放间隔：走向题 12 个音要快；和弦性质要「一起响」；其余一音一拍。 */
function stepOf(question: EarQuestion): number {
  if (question.kind === "progression") return 0.28;
  if (question.kind === "quality") return 0.02;
  return question.play.length > 1 ? 0.6 : 0.7;
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
  const narrow = useMediaQuery("(max-width: 900px)");
  const [openLesson, setOpenLesson] = useState<number | null>(null);
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

  const heard = useMemo(() => {
    if (!question) return "";
    // 走向题 12 个音，逐个念出来像报菜名；只报每个和弦的根音，那才是「走向」本身
    if (question.kind === "progression") {
      const roots = question.play.filter((_, i) => i % 3 === 0).map((midi) => noteName(midi));
      return `根音 ${roots.join(" → ")}`;
    }
    // 和弦性质是三个音一起响，用「+」而不是「→」
    if (question.kind === "quality") {
      return question.play.map((midi) => noteName(midi)).join(" + ");
    }
    return question.play.map((midi) => noteName(midi)).join(" → ");
  }, [question]);

  useEffect(() => {
    if (!question || finished) return;
    // 走向题是 12 个音（四个和弦各三个），拍子要短，不然一题要听七八秒；
    // 和弦性质反过来，三个音要「一起」响（20ms 间隔听感上就是一下扫下去）
    play(question.play, stepOf(question));
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
          听到一段，把它写下来。这一页分三块：先学怎么听（十二节），再练听辨（五种题型），最后用录音扒一段真的。
        </p>
      </header>

      <h3 className="stat-sub">学 · 十二节</h3>
      {narrow && openLesson !== null && (
        <button type="button" className="btn-quiet ear-back" onClick={() => setOpenLesson(null)}>
          ← 回到十二节课的目录
        </button>
      )}
      <ol className="ear-lessons">
        {LESSONS.map((lesson) => (
          <li
            className="ear-lesson"
            key={lesson.no}
            data-lesson={lesson.no}
          >
            <h4>
              <button
                type="button"
                className="ear-lesson-toggle"
                aria-expanded={!narrow || openLesson === lesson.no}
                onClick={() => setOpenLesson(openLesson === lesson.no ? null : lesson.no)}
              >
                <span className="ear-no">{lesson.no}</span>
                {lesson.title}
              </button>
            </h4>
            <div className="ear-lesson-body" hidden={narrow && openLesson !== lesson.no}>
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
            </div>
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
              <button type="button" className="btn" onClick={() => play(question.play, stepOf(question))}>
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

      <h3 className="stat-sub">用 · 听和弦</h3>
      <ChordListen />
    </section>
  );
}
