import { useMemo, useState } from "react";
import {
  CHORD_BY_NAME,
  INTERVALS,
  KEY_BY_ID,
  SCALE_BY_ID,
  chordInfo,
  fingeringOf,
  intervalQuestion,
  scaleNames,
  scalePcs,
  stackThirds,
  thirdQuestion,
  type TheoryQuestion,
} from "@guitar/core";
import PianoStrip from "../components/PianoStrip";
import StringStrip from "../components/StringStrip";
import ChordDiagram from "../components/ChordDiagram";
import TheoryQuiz from "../components/TheoryQuiz";

/** C 大调的七个音（高亮用）。 */
const C_MAJOR = scalePcs(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!);
const C_MAJOR_NAMES = scaleNames(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!);

/** C 大调各级和弦（vii° 是减三和弦，吉他上不常用，标出来但不给指法）。 */
const DEGREES: { roman: string; chord: string; quality: string; note: string }[] = [
  { roman: "I", chord: "C", quality: "大三和弦", note: "最常见的主和弦" },
  { roman: "ii", chord: "Dm", quality: "小三和弦", note: "小写表示小三和弦" },
  { roman: "iii", chord: "Em", quality: "小三和弦", note: "常代替 I" },
  { roman: "IV", chord: "F", quality: "大三和弦", note: "下属和弦" },
  { roman: "V", chord: "G", quality: "大三和弦", note: "属和弦，最想回到 I" },
  { roman: "vi", chord: "Am", quality: "小三和弦", note: "关系小调的主和弦" },
  { roman: "vii°", chord: "Bdim", quality: "减三和弦", note: "带 ° 的是减三和弦，很少单独用" },
];

/**
 * 乐理入门：一条从「音」走到「和弦级数」的路径。
 *
 * 每一节都是同一个结构：一句话 → 钢琴上看 → 吉他上看。
 * 钢琴负责解释「为什么」，吉他负责回答「那我怎么按」。
 */
export default function Theory() {
  const [chordName, setChordName] = useState("C");
  const [quiz, setQuiz] = useState<"interval" | "third" | null>(null);

  const quizConfig: Record<"interval" | "third", { title: string; make: (rng: () => number) => TheoryQuestion }> = {
    interval: { title: "音程练习", make: intervalQuestion },
    third: { title: "三度叠置练习", make: thirdQuestion },
  };

  const chord = CHORD_BY_NAME.get(chordName) ?? CHORD_BY_NAME.get("C")!;
  const info = useMemo(() => chordInfo(chord), [chord]);
  const stack = useMemo(
    () => stackThirds(info.rootName, info.quality.intervals),
    [info],
  );
  const pickedDegree = DEGREES.find((d) => d.chord === chord.name) ?? DEGREES[0];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>乐理入门</h2>
        <p>
          从「一个音」一路走到「和弦级数」。每节都是：一句话 → 钢琴上看 → 吉他上看。
          看不懂名词没关系，先看图。
        </p>
      </div>

      {/* ---------- 1. 音 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">1</span>音：只有 7 个名字，却有 12 个音
        </h3>
        <p className="lesson-lead">
          音名只有 <b>C D E F G A B</b> 七个字母，但一个八度里能按出 <b>12</b> 个不同的音高——
          多出来的 5 个用「升 / 降」表示（<code>C#</code> 就是 <code>C</code> 升高一个半音，也叫 <code>Db</code>）。
        </p>
        <div className="lesson-figure">
          <PianoStrip />
          <p className="lesson-cap">钢琴一个八度：7 个白键 + 5 个黑键 = 12 个音</p>
        </div>
        <div className="lesson-guitar">
          <StringStrip stringIndex={4} frets={12} />
          <p className="lesson-cap">
            在吉他上：同一根弦每往右一格（一品），音就升高一个半音；数到第 12 品，音名回到起点（高八度）。
          </p>
        </div>
      </section>

      {/* ---------- 2. 半音 / 全音 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">2</span>半音与全音：相邻，还是隔一个
        </h3>
        <p className="lesson-lead">
          两个相邻的音（中间没有别的键）差 <b>1 个半音</b>；中间夹着一个黑键的，差 <b>1 个全音</b>
          （= 2 个半音）。注意 <b>E–F</b> 和 <b>B–C</b> 之间没有黑键——所以它们天生就是半音。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={[0, 2, 4, 5]} root={0} showSteps />
          <p className="lesson-cap">C→D 是全音，E→F 是半音（白键之间没有黑键）</p>
        </div>
        <div className="lesson-guitar">
          <StringStrip stringIndex={4} frets={7} highlight={[0, 2, 4, 5]} root={0} showSteps />
          <p className="lesson-cap">
            在吉他上：半音 = 挪一品，全音 = 挪两品。C 在 5 弦 3 品，D 就在 5 品，E 在 7 品。
          </p>
        </div>
      </section>

      {/* ---------- 3. 12 平均律 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">3</span>12 平均律：把八度平均切成 12 份
        </h3>
        <p className="lesson-lead">
          一个八度平均分成 12 份，每一份叫 <b>100 音分</b>。好处是：不管从哪个音开始，
          同一套间距都能用——吉他一个八度正好 12 个品，就是这个道理。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]} />
          <p className="lesson-cap">12 个键 = 12 个半音 = 一个八度</p>
        </div>
        <p className="lesson-note">
          纯五度听起来特别协和，但 12 平均律里的纯五度（7 个半音）是 700 音分，
          和数学上完美的 3:2（约 702 音分）差一点点——这点误差换来的是
          <b>任意调都能自由转调</b>。
        </p>
      </section>

      {/* ---------- 4. 音阶公式 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">4</span>音阶公式：全 全 半 全 全 全 半
        </h3>
        <p className="lesson-lead">
          大调不是随便挑 7 个音，而是按固定的间距取：<b>全 全 半 全 全 全 半</b>。
          从 C 开始取，刚好全在白键上（所以 C 大调没有升降号）；从 G 开始取，就要把 F 升半音。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={C_MAJOR} root={0} showSteps />
          <p className="lesson-cap">
            {C_MAJOR_NAMES.join(" ")}，间距正好是全全半全全全半
          </p>
        </div>
        <div className="lesson-guitar">
          <StringStrip stringIndex={1} frets={12} highlight={C_MAJOR} root={0} showSteps />
          <p className="lesson-cap">
            在吉他上：2 弦上 C 大调是 <b>1、3、5、6、8、10、12</b> 品——
            把「全全半」翻译成「隔几品」就是这张图。
          </p>
        </div>
      </section>

      {/* ---------- 5. 音程 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">5</span>音程：两个音隔多远
        </h3>
        <p className="lesson-lead">
          两个音之间的半音数决定了它们「隔多远」，再给它一个名字（三度、五度……）。
          名字里的「大 / 小 / 纯」是<b>性质</b>：大三度听起来明亮，小三度听起来忧郁——
          这就是大调和小调的区别来源。
        </p>
        <div className="lesson-figure">
          <StringStrip stringIndex={4} frets={12} highlight={[0, 7]} root={0} />
          <p className="lesson-cap">5 弦上 C（3 品）到 G（10 品）差 7 品 = 纯五度</p>
        </div>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>音程</th>
                <th>半音</th>
                <th>在吉他上</th>
                <th>听感</th>
              </tr>
            </thead>
            <tbody>
              {INTERVALS.slice(1, 13).map((item) => (
                <tr key={item.semitones}>
                  <td>
                    {item.name} <span className="muted">{item.short}</span>
                  </td>
                  <td>{item.semitones}</td>
                  <td>同弦隔 {item.semitones} 品</td>
                  <td>
                    {item.consonance === "perfect"
                      ? "很协和"
                      : item.consonance === "imperfect"
                        ? "较协和"
                        : "紧张 / 不协和"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn ghost lesson-practice" type="button" onClick={() => setQuiz("interval")}>
          练一练：音程
        </button>
      </section>

      {/* ---------- 6. 和弦 = 三度叠置 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">6</span>和弦：隔一个音取一个，叠两次
        </h3>
        <p className="lesson-lead">
          从根音开始，<b>隔一个音取一个</b>（这就是「三度」），取三个音就是三和弦。
          大三和弦 = 大三度 + 小三度；小三和弦 = 小三度 + 大三度。就差这一个顺序，
          听起来一个明亮、一个忧郁。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={[0, 4, 7]} root={0} />
          <p className="lesson-cap">C 大三和弦：C（根音）→ E（隔开 D）→ G（隔开 F）</p>
        </div>
        <div className="lesson-pair">
          <div>
            <p className="lesson-cap">
              <b>{chord.name}</b> = {stack.text} → {stack.notes.join(" – ")}
            </p>
            <ChordDiagram chord={chord} />
            <p className="lesson-cap">
              指法 <code>{fingeringOf(chord)}</code>
            </p>
          </div>
          <div className="lesson-compare">
            <p>
              <b>换一个听听区别</b>
            </p>
            <p className="muted">
              C 大三：C – E – G（大三度在前）
              <br />
              A 小三：A – C – E（小三度在前）
            </p>
            <div className="lesson-buttons">
              {["C", "Am"].map((name) => (
                <button
                  key={name}
                  type="button"
                  className={name === chordName ? "chip on" : "chip"}
                  onClick={() => setChordName(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="muted">
              {info.quality.name}：{info.tones.map((t) => `${t.name}(${t.degree})`).join(" ")}
            </p>
          </div>
        </div>
        <p className="lesson-note">
          全部 16 个和弦的指法在「和弦」页；这一节只讲清楚<b>为什么是这三个音</b>。
        </p>
        <button className="btn ghost lesson-practice" type="button" onClick={() => setQuiz("third")}>
          练一练：三度叠置
        </button>
      </section>

      {/* ---------- 7. 和弦级数 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">7</span>和弦级数：在一个调里排座位
        </h3>
        <p className="lesson-lead">
          在 C 大调的 7 个音上，每个音都能叠一个三和弦，用罗马数字标位置：
          <b> I ii iii IV V vi vii°</b>。大写 = 大三和弦，小写 = 小三和弦，带 ° = 减三和弦。
          流行歌里绝大多数进行都是这几个的组合。
        </p>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>级数</th>
                <th>和弦</th>
                <th>性质</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {DEGREES.map((degree) => (
                <tr
                  key={degree.roman}
                  className={degree.chord === pickedDegree.chord ? "theory-row-on" : ""}
                >
                  <td>{degree.roman}</td>
                  <td>{degree.chord}</td>
                  <td>{degree.quality}</td>
                  <td className="muted">{degree.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lesson-note">
          换个调，级数不变、和弦变：G 大调的 I 是 G、IV 是 C、V 是 D。
          这也解释了为什么很多歌「听起来一样」——它们用的是同一套级数进行。
        </p>
      </section>

      <p className="lesson-cta">
        想练手？去「和弦」页按一遍，或去「音阶游戏」把音名填出来。
      </p>

      {quiz && (
        <TheoryQuiz
          title={quizConfig[quiz].title}
          make={quizConfig[quiz].make}
          onClose={() => setQuiz(null)}
        />
      )}
    </section>
  );
}
