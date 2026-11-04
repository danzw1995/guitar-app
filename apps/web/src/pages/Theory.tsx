import { useMemo, useState } from "react";
import {
  CHORD_BY_NAME,
  CHORD_QUALITIES,
  INTERVALS,
  KEY_BY_ID,
  SCALE_BY_ID,
  chordInfo,
  degreesOfKey,
  fingeringOf,
  intervalOf,
  intervalQuestion,
  scaleNames,
  scalePcs,
  stackThirds,
  thirdQuestion,
  type ChordQuality,
  type TheoryQuestion,
} from "@guitar/core";
import PianoStrip from "../components/PianoStrip";
import StringStrip from "../components/StringStrip";
import ScaleMap from "../components/ScaleMap";
import CagedBoard from "../components/CagedBoard";
import ChordDiagram from "../components/ChordDiagram";
import TheoryQuiz from "../components/TheoryQuiz";

const C_MAJOR = scalePcs(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!);
const C_MAJOR_NAMES = scaleNames(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!);
const A_MINOR = scalePcs(KEY_BY_ID.get("Am")!, SCALE_BY_ID.get("naturalMinor")!);
const A_MINOR_NAMES = scaleNames(KEY_BY_ID.get("Am")!, SCALE_BY_ID.get("naturalMinor")!);

/** 同一品（3 品）跨六根弦的实际音，用来展示「+3 级」的规律。 */
const SAME_FRET = [
  { string: 6, note: "G", degree: "5" },
  { string: 5, note: "C", degree: "1" },
  { string: 4, note: "F", degree: "4" },
  { string: 3, note: "Bb", degree: "降7" },
  { string: 2, note: "D", degree: "2" },
  { string: 1, note: "G", degree: "5" },
];

/** 相邻弦的空弦音程。 */
const STRING_GAPS = [
  { from: "6 弦 E", to: "5 弦 A", interval: "纯四度", frets: 5 },
  { from: "5 弦 A", to: "4 弦 D", interval: "纯四度", frets: 5 },
  { from: "4 弦 D", to: "3 弦 G", interval: "纯四度", frets: 5 },
  { from: "3 弦 G", to: "2 弦 B", interval: "大三度", frets: 4 },
  { from: "2 弦 B", to: "1 弦 E", interval: "纯四度", frets: 5 },
];

/** 八度形状。 */
const OCTAVE_SHAPES = [
  { rule: "同一根弦 +12 品", example: "5 弦 3 品 C = 5 弦 15 品 C" },
  { rule: "隔一根弦、多 2 品（低音侧）", example: "6 弦 3 品 G = 4 弦 5 品 G；5 弦 3 品 C = 3 弦 5 品 C" },
  { rule: "隔一根弦、多 3 品（高音侧）", example: "4 弦 3 品 F = 2 弦 6 品 F；3 弦 5 品 C = 1 弦 8 品 C" },
  { rule: "跨两根弦、少 3 品", example: "6 弦 3 品 G = 3 弦 0 品 G" },
];

const SEVENTHS = [
  { id: "major7" as ChordQuality, label: "大七", suffix: "maj7", mood: "明亮、悬浮，常做色彩和弦" },
  { id: "dominant7" as ChordQuality, label: "属七", suffix: "7", mood: "最紧张，强烈想解决到主和弦" },
  { id: "minor7" as ChordQuality, label: "小七", suffix: "m7", mood: "柔和、偏暗，爵士与流行都常用" },
];

/**
 * 乐理入门：一条从「音」走到「CAGED」的路径。
 *
 * 每一节都是同一个结构：一句话 → 钢琴上看 → 吉他上看。
 * 钢琴负责解释「为什么」，吉他负责回答「那我怎么按」。
 */
export default function Theory() {
  const [chordName, setChordName] = useState("C");
  const [quiz, setQuiz] = useState<"interval" | "third" | null>(null);
  const [mapNames, setMapNames] = useState(false);
  const [cagedChord, setCagedChord] = useState("C");
  const [seventhId, setSeventhId] = useState<ChordQuality>("major7");

  const seventhStack = useMemo(
    () => stackThirds("C", CHORD_QUALITIES[seventhId].intervals),
    [seventhId],
  );
  const seventhPcs = useMemo(
    () => CHORD_QUALITIES[seventhId].intervals.map((step) => step % 12),
    [seventhId],
  );
  const seventhSuffix = SEVENTHS.find((item) => item.id === seventhId)?.suffix ?? "";

  const cagedShape = CHORD_BY_NAME.get(cagedChord);
  const cagedRootPc = useMemo(
    () => (cagedShape ? chordInfo(cagedShape).rootPc : 0),
    [cagedShape],
  );

  const chord = CHORD_BY_NAME.get(chordName);
  const info = useMemo(() => (chord ? chordInfo(chord) : null), [chord]);
  const stack = useMemo(
    () => (info ? stackThirds(info.rootName, info.quality.intervals) : null),
    [info],
  );
  const degrees = useMemo(() => degreesOfKey("C"), []);

  const quizConfig: Record<"interval" | "third", { title: string; make: (rng: () => number) => TheoryQuestion }> = {
    interval: { title: "音程练习", make: intervalQuestion },
    third: { title: "三度叠置练习", make: thirdQuestion },
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>乐理入门</h2>
        <p>
          从「一个音」走到「指板规律」。每节都是：一句话 → 钢琴上看 → 吉他上看。
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

      {/* ---------- 4. 音阶公式（大调 + 小调） ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">4</span>音阶公式：大调与小调
        </h3>
        <p className="lesson-lead">
          <b>大调</b>不是随便挑 7 个音，而是按固定的间距取：<b>全 全 半 全 全 全 半</b>。
          从 C 开始取，刚好全在白键上（所以 C 大调没有升降号）；从 G 开始取，就要把 F 升半音。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={C_MAJOR} root={0} showSteps />
          <p className="lesson-cap">{C_MAJOR_NAMES.join(" ")}，间距正好是全全半全全全半</p>
        </div>
        <div className="lesson-guitar">
          <StringStrip stringIndex={1} frets={12} highlight={C_MAJOR} root={0} showSteps />
          <p className="lesson-cap">
            在吉他上：2 弦上 C 大调是 <b>1、3、5、6、8、10、12</b> 品——
            把「全全半」翻译成「隔几品」就是这张图。
          </p>
        </div>

        <h4 className="lesson-sub">小调：同一堆音，换个主音</h4>
        <p className="lesson-lead">
          自然小调的公式是 <b>全 半 全 全 半 全 全</b>。A 小调用的音和 C 大调<b>完全一样</b>，
          只是把 A 当成「1」——这叫 <b>关系小调</b>（每个大调的第 6 级，就是它的关系小调主音：
          C↔Am、G↔Em、D↔Bm）。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={A_MINOR} root={9} showSteps />
          <p className="lesson-cap">{A_MINOR_NAMES.join(" ")}，但主音是 A，所以听起来是另一种情绪</p>
        </div>
        <p className="lesson-note">
          为什么听起来「忧郁」？看第三个音：大调的三音在主音上方 <b>4 个半音</b>（大三度），
          小调只有 <b>3 个半音</b>（小三度）。就这一个半音的差别，决定了整首歌的色彩。
        </p>
      </section>

      {/* ---------- 5. 音程 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">5</span>音程：两个音隔多远
        </h3>
        <p className="lesson-lead">
          两个音之间的半音数决定了它们「隔多远」，再给它一个名字（三度、五度……）。
          名字里的「大 / 小 / 纯」是<b>性质</b>：大三度听起来明亮，小三度听起来忧郁。
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
              <b>{chordName}</b>
              {stack ? ` = ${stack.text} → ${stack.notes.join(" – ")}` : "（这个和弦不在指法库里）"}
            </p>
            {chord ? <ChordDiagram chord={chord} /> : null}
            {chord ? (
              <p className="lesson-cap">
                指法 <code>{fingeringOf(chord)}</code>
              </p>
            ) : null}
          </div>
          <div className="lesson-compare">
            <p>
              <b>换一个对比</b>
            </p>
            <p className="muted">
              C 大三：C – E – G（大三度在前）
              <br />
              A 小三：A – C – E（小三度在前）
            </p>
            <div className="lesson-buttons">
              {["C", "Am", "F", "G"].map((name) => (
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
            {info ? (
              <p className="muted">
                {info.quality.name}：{info.tones.map((t) => `${t.name}(${t.degree})`).join(" ")}
              </p>
            ) : null}
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
          <b>点一行</b>可以看它的指法。
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
              {degrees.map((degree) => {
                const has = CHORD_BY_NAME.has(degree.root);
                return (
                  <tr
                    key={degree.roman}
                    className={degree.root === chordName ? "theory-row-on" : ""}
                    style={has ? { cursor: "pointer" } : undefined}
                    onClick={has ? () => setChordName(degree.root) : undefined}
                  >
                    <td>{degree.roman}</td>
                    <td>
                      {degree.root}
                      {has ? "" : "（未收录指法）"}
                    </td>
                    <td>{degree.quality}</td>
                    <td className="muted">{degree.role}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="lesson-note">
          换个调，级数不变、和弦变：G 大调的 I 是 G、IV 是 C、V 是 D。
          这也解释了为什么很多歌「听起来一样」——它们用的是同一套级数进行。
        </p>
      </section>

      <section className="lesson">
        <h3>
          <span className="lesson-no">8</span>指板规律：把上面的东西变成「形状」
        </h3>
        <p className="lesson-lead">
          前面学的音程、级数，在吉他上会变成几条固定的<b>形状</b>。记住它们，
          就不用每次从空弦一个一个数品了。下面这一张图里同时藏着三条规律。
        </p>

        <div className="lesson-figure">
          <ScaleMap showNames={mapNames} showOctaves highlightFret={3} />
          <div className="lesson-map-bar">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setMapNames((v) => !v)}
            >
              {mapNames ? "显示级数" : "显示音名"}
            </button>
            <span className="lesson-cap">
              圆点里是<b>级数</b>（1 = 主音 C），金色的是 1；灰线连起来的两个点是<b>同一个音</b>。
              右侧「相邻弦差」的数字：<b>低音弦往上几品 = 相邻高音弦的空弦</b>
              （例如 5 弦 5 品 = 4 弦空弦 D）。那个红色的 <b>4 品</b> 是唯一例外——2 弦与 3 弦之间。
            </span>
          </div>
          <ul className="lesson-read">
            <li>
              <b>纵向看同一列</b>（同一个品）：级数往上走 <b>+3</b>（1→4→降7→2→5），
              只有 3→2 弦那格是 <b>+2</b>。
            </li>
            <li>
              <b>横向看同一行</b>（同一根弦）：品距是 <b>2 2 1 2 2 2 1</b>，就是"全全半全全全半"。
            </li>
            <li>
              <b>斜着看灰线</b>（八度）：低音侧 <b>+2 品</b>、高音侧 <b>+3 品</b>、跨两根 <b>−3 品</b>。
            </li>
          </ul>
        </div>

        <h4 className="lesson-sub">规律一：相邻弦差 5 品（除了 3→2 弦）</h4>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>从</th>
                <th>到</th>
                <th>音程</th>
                <th>差几品</th>
              </tr>
            </thead>
            <tbody>
              {STRING_GAPS.map((gap) => (
                <tr key={gap.from} className={gap.frets === 4 ? "theory-row-on" : ""}>
                  <td>{gap.from}</td>
                  <td>{gap.to}</td>
                  <td>{gap.interval}</td>
                  <td>{gap.frets} 品</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lesson-cap">
          所以 <b>6 弦 5 品 = 5 弦空弦</b>（都是 A），5 弦 5 品 = 4 弦空弦……
          只有 <b>3 弦 4 品 = 2 弦空弦</b>——标准调弦为了让和弦好按，把 2 弦调低了半音。
        </p>

        <h4 className="lesson-sub">规律二：同一品往高音弦走，级数 +3</h4>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>弦</th>
                <th>3 品上的音</th>
                <th>相对 C 的级数</th>
              </tr>
            </thead>
            <tbody>
              {SAME_FRET.map((item) => (
                <tr key={item.string}>
                  <td>{item.string} 弦</td>
                  <td>{item.note}</td>
                  <td>{item.degree}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lesson-cap">
          5 弦 3 品是 1（C），4 弦 3 品就是 4（F）；再往上 3 弦 3 品是 降7（Bb）——注意这里只 +2，
          因为跨过了 3→2 弦的大三度。知道一根弦上的级数，<b>同品换弦就是 +3 级</b>（mod 7）。
        </p>

        <h4 className="lesson-sub">规律三：八度形状</h4>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>形状</th>
                <th>例子</th>
              </tr>
            </thead>
            <tbody>
              {OCTAVE_SHAPES.map((shape) => (
                <tr key={shape.rule}>
                  <td>{shape.rule}</td>
                  <td className="muted">{shape.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lesson-sub">规律四：同一根弦上，音阶的品距是 2 2 1 2 2 2 1</h4>
        <p className="lesson-cap">
          这就是「全全半全全全半」的另一种写法：<b>2 = 全音、1 = 半音</b>。
          所以只要知道某个音在第几品，后面几个音的位置就能顺着数出来——
          这也是为什么同一个调的音阶在琴颈上会形成 <b>五个"把位"</b>（每 3 到 4 品一团）。
        </p>

        <h4 className="lesson-sub">规律五：和弦也是这些形状——CAGED 五把位</h4>
        <p className="lesson-cap">
          同一个大三和弦，在琴颈上有 <b>5 种按法</b>，分别叫 <b>C、A、G、E、D</b>（就是五个开放和弦的形状），
          沿着琴颈往上平移、用横按替换空弦即可。它们之间的位移，就是前面那条「八度 +2 / +3」和
          「相邻弦差 5 品」决定的。<b>下一节</b>可以点着看这五个形状。
        </p>

        <p className="lesson-note">
          三条规律 + 空弦音 <b>E A D G B E</b>，就能推任意一个音：先找到最近的空弦或已知音，
          再用「同弦 + 半音」「同品跨弦 +3 级」「八度 +2/+3」走两步就到了。
        </p>
      </section>

      {/* ---------- 9. CAGED ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">9</span>CAGED：一个和弦的几种按法
        </h3>
        <p className="lesson-lead">
          同一个大三和弦在琴颈上有 <b>5 个位置</b>，来自五个开放和弦的形状：
          <b>C、A、G、E、D</b>（连起来读就是 CAGED）。把开放形状整块往上平移、
          空弦处改成横按，就得到同一个和弦在别的把位。点下面的和弦换一个，再点形状按钮看它怎么挪。
        </p>
        <div className="lesson-buttons">
          {["C", "A", "G", "E", "D"].map((name) => (
            <button
              key={name}
              type="button"
              className={name === cagedChord ? "chip on" : "chip"}
              onClick={() => setCagedChord(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="lesson-figure">
          <CagedBoard rootPc={cagedRootPc} rootName={cagedChord} />
        </div>
        <p className="lesson-note">
          为什么正好五个、为什么位置是 <b>0 / 3 / 5 / 8 / 10</b> 品（以 C 为例）？
          因为它们之间的间距就是前面那些形状：相邻形状的根音在弦上相差 3 品或 2 品，
          一圈下来正好 12 品回到原样。练熟这几个形状，换把、找和弦、改调都不用重新学。
        </p>
        <p className="lesson-note">
          小和弦只给 <b>E / A / D</b> 三个形状：C 形、G 形的大三音在两根弦上各出现一次，
          降一个仍然是「大三 + 小三」混着，教材里 Cm、Gm 本来用的就是 A 形 / E 形的横按。
        </p>
      </section>

      {/* ---------- 10. 七和弦 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">10</span>七和弦：再往上叠一个三度
        </h3>
        <p className="lesson-lead">
          三和弦是「根音 + 三音 + 五音」。再往上叠一个三度，就是<b>七音</b>，四个音一起响——这就是七和弦。
          七音离根音 10 或 11 个半音，它几乎决定了这个和弦的"味道"。
        </p>
        <div className="lesson-figure">
          <PianoStrip highlight={seventhPcs} root={0} />
          <p className="lesson-cap">
            C{seventhSuffix} = {seventhStack.notes.join(" – ")}（{seventhStack.text}）
          </p>
        </div>
        <div className="lesson-buttons">
          {SEVENTHS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === seventhId ? "chip on" : "chip"}
              onClick={() => setSeventhId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>和弦</th>
                <th>构成音（以 C 为例）</th>
                <th>七音距根音</th>
                <th>听起来</th>
              </tr>
            </thead>
            <tbody>
              {SEVENTHS.map((item) => {
                const stack = stackThirds("C", CHORD_QUALITIES[item.id].intervals);
                const top = CHORD_QUALITIES[item.id].intervals[3];
                return (
                  <tr key={item.id} className={item.id === seventhId ? "theory-row-on" : ""}>
                    <td>
                      C{item.suffix} <span className="muted">{item.label}</span>
                    </td>
                    <td>{stack.notes.join(" ")}</td>
                    <td>{top} 个半音（{intervalOf(top).name}）</td>
                    <td className="muted">{item.mood}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="lesson-note">
          为什么叫"七"？因为七音是音阶的第 7 级。**大七**的七音距根音 11 个半音（导音，很想回主音），
          **属七**是 10 个半音（小七度，最不稳定，所以最想"解决"到别的和弦），
          **小七**在小三和弦上加 10 个半音，听起来最柔和。流行歌里 Cmaj7、G7、Dm7 就是这么来的。
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
