import { useMemo, useState } from "react";
import {
  CHORD_BY_NAME,
  CHORD_QUALITIES,
  CIRCLE,
  INTERVALS,
  KEY_BY_ID,
  NOTE_VALUES,
  SCALE_BY_ID,
  STRUM_PATTERNS,
  SUBDIVISION_LABEL,
  THEORY_TABS,
  chordInfo,
  circleKey,
  countLine,
  degreesOfKey,
  fingeringOf,
  intervalOf,
  neighborKeys,
  scaleNames,
  scalePcs,
  stackThirds,
  strumPatternById,
  type ChordQuality,
  type Subdivision,
} from "@guitar/core";
import PianoStrip from "../components/PianoStrip";
import StringStrip from "../components/StringStrip";
import ScaleMap from "../components/ScaleMap";
import CagedBoard from "../components/CagedBoard";
import TheoryGame from "../components/TheoryGame";
import ChordDiagram from "../components/ChordDiagram";
import RhythmStrip from "../components/RhythmStrip";
import Metronome from "../components/Metronome";
import TabScore from "../components/TabScore";
import { useTone } from "../hooks/useTone";

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

/** 时值在表格里的说法：半拍、1/4 拍、1/3 拍…… */
function beatsLabel(beats: number): string {
  if (beats === 0.5) return "半拍";
  if (beats === 0.25) return "1/4 拍";
  if (beats === 0.75) return "3/4 拍";
  if (Math.abs(beats - 1 / 3) < 1e-9) return "1/3 拍";
  if (beats === 1.5) return "1.5 拍（一拍半）";
  return `${beats} 拍`;
}

/**
 * 乐理入门：一条从「音」走到「CAGED」的路径。
 *
 * 每一节都是同一个结构：一句话 → 钢琴上看 → 吉他上看。
 * 钢琴负责解释「为什么」，吉他负责回答「那我怎么按」。
 */
export default function Theory() {
  const { playTab } = useTone();
  const [playhead, setPlayhead] = useState<{ id: string; beat: number } | null>(null);

  /** 试听一节课的示范谱：和节奏页同一套播放头，谱上会跟着走一条竖条。 */
  function auditionTheory(id: string, tab: (typeof THEORY_TABS)[number]["tab"]) {
    setPlayhead({ id, beat: 0 });
    playTab(tab, 72, {
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { id, beat }),
    });
  }

  const beatOf = (id: string) => (playhead?.id === id ? playhead.beat : null);
  const [chordName, setChordName] = useState("C");
  const [mapNames, setMapNames] = useState(false);
  const [cagedChord, setCagedChord] = useState("C");
  const [seventhId, setSeventhId] = useState<ChordQuality>("major7");
  const [circleId, setCircleId] = useState("C");
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const [strumId, setStrumId] = useState("folk");

  const circle = circleKey(circleId);
  const circleKeyDef = KEY_BY_ID.get(circleId);
  const circlePcs = useMemo(
    () => (circleKeyDef ? scalePcs(circleKeyDef, SCALE_BY_ID.get("major")!) : []),
    [circleKeyDef],
  );
  const circleTonic = circleKeyDef?.tonicPc ?? 0;

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
  const strum = strumPatternById(strumId) ?? STRUM_PATTERNS[0];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>乐理入门</h2>
        <p>
          从「一个音」走到「节奏」：前十节讲音高与音和音的关系，第 11 节讲调号从哪来，
          第 12 节讲「一个音要待多久」——音高加时值才是音乐。每节都是：一句话 → 钢琴上看 →
          吉他上看。看不懂名词没关系，先看图——读完可以到页面底部的
          <a className="inline-link" href="#theory-game">
            「乐理挑战」
          </a>
          里动手。
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
        <div className="lesson-tab">
          <TabScore id="th-01" tab={THEORY_TABS[0].tab} beat={beatOf("th-01")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[0].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-01", THEORY_TABS[0].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <p className="lesson-cap">
          音有高低，也有长短——长短那套东西叫「时值」，在<a className="inline-link" href="#lesson-12">第 12 节</a>。
        </p>
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
        <div className="lesson-tab">
          <TabScore id="th-02" tab={THEORY_TABS[1].tab} beat={beatOf("th-02")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[1].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-02", THEORY_TABS[1].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <div className="lesson-tab">
          <TabScore id="th-03" tab={THEORY_TABS[2].tab} beat={beatOf("th-03")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[2].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-03", THEORY_TABS[2].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <div className="lesson-tab">
          <TabScore id="th-04" tab={THEORY_TABS[3].tab} beat={beatOf("th-04")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[3].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-04", THEORY_TABS[3].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <div className="lesson-tab">
          <TabScore id="th-05" tab={THEORY_TABS[4].tab} beat={beatOf("th-05")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[4].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-05", THEORY_TABS[4].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <a className="btn ghost lesson-practice" href="#theory-game">
          去「乐理挑战」练音程（T09–T12）
        </a>
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
        <div className="lesson-tab">
          <TabScore id="th-06" tab={THEORY_TABS[5].tab} beat={beatOf("th-06")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[5].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-06", THEORY_TABS[5].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <a className="btn ghost lesson-practice" href="#theory-game">
          去「乐理挑战」练三和弦（T01–T04）
        </a>
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
        <div className="lesson-tab">
          <TabScore id="th-07" tab={THEORY_TABS[6].tab} beat={beatOf("th-07")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[6].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-07", THEORY_TABS[6].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <div className="lesson-tab">
          <TabScore id="th-08" tab={THEORY_TABS[7].tab} beat={beatOf("th-08")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[7].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-08", THEORY_TABS[7].tab)}
            >
              试听
            </button>
          </div>
        </div>

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
        <div className="lesson-tab">
          <TabScore id="th-09" tab={THEORY_TABS[8].tab} beat={beatOf("th-09")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[8].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-09", THEORY_TABS[8].tab)}
            >
              试听
            </button>
          </div>
        </div>
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
        <div className="lesson-tab">
          <TabScore id="th-10" tab={THEORY_TABS[9].tab} beat={beatOf("th-10")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[9].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-10", THEORY_TABS[9].tab)}
            >
              试听
            </button>
          </div>
        </div>
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

      {/* ---------- 11. 五度圈 ---------- */}
      <section className="lesson">
        <h3>
          <span className="lesson-no">11</span>五度圈：调号是从哪来的
        </h3>
        <p className="lesson-lead">
          把 12 个调按「上行纯五度」排成一个圈：<b>C → G → D → A → E → B → F#</b>，
          再往前用等音写法继续 <b>Db → Ab → Eb → Bb → F</b>，正好一圈 12 个。
          每走一格，调号就多一个升号（或减一个降号）——这就是「G 大调为什么要升 F」的答案。
        </p>
        <div className="lesson-tab">
          <TabScore id="th-11" tab={THEORY_TABS[10].tab} beat={beatOf("th-11")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[10].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-11", THEORY_TABS[10].tab)}
            >
              试听
            </button>
          </div>
        </div>
        <div className="lesson-buttons">
          {CIRCLE.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === circleId ? "chip on" : "chip"}
              onClick={() => setCircleId(entry.id)}
            >
              {entry.id}
            </button>
          ))}
        </div>
        <div className="lesson-figure">
          <PianoStrip highlight={circlePcs} root={circleTonic} />
          <p className="lesson-cap">
            {circle?.name}：{circle?.accidentalsLabel}
            {circle ? `，音阶 ${circle.scale.join(" ")}` : ""}
          </p>
        </div>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>调</th>
                <th>调号</th>
                <th>关系小调</th>
                <th>上行纯五度</th>
              </tr>
            </thead>
            <tbody>
              {CIRCLE.map((entry) => {
                const up = neighborKeys(entry.id)?.up;
                return (
                  <tr
                    key={entry.id}
                    className={entry.id === circleId ? "theory-row-on" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => setCircleId(entry.id)}
                  >
                    <td>{entry.id}</td>
                    <td>{entry.accidentalsLabel}</td>
                    <td className="muted">{entry.minorName}</td>
                    <td className="muted">{up ? up.name : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="lesson-note">
          为什么 G 大调要升 F？大调公式要求第 6 级到第 7 级是<b>全音</b>，
          从 G 往上数 E 到 F 只有半音，把 F 升成 F# 才凑够全音。五度圈就是
          「哪些音要升、要升几个」的一张总表：升号调的升序永远是 <b>F C G D A E B</b>。
        </p>
      </section>

      {/* ---------- 12. 时值 ---------- */}
      <section className="lesson" id="lesson-12">
        <h3>
          <span className="lesson-no">12</span>时值：一个音要待多久
        </h3>
        <p className="lesson-lead">
          前面十一节都在讲「哪个音」，这一节讲「这个音待多久」。同样一个 C，
          弹四拍是长音，弹半拍是过门——<b>音高决定它是什么音，时值决定它像不像一首歌</b>。
          4/4 拍里以四分音符为一拍，一小节四拍；所有音符都是在这一小节里「分蛋糕」。
        </p>
        <div className="lesson-tab">
          <TabScore id="th-12" tab={THEORY_TABS[11].tab} beat={beatOf("th-12")} />
          <div className="lesson-tab-foot">
            <p className="lesson-cap">{THEORY_TABS[11].caption}</p>
            <button
              type="button"
              className="btn-quiet lesson-play"
              onClick={() => auditionTheory("th-12", THEORY_TABS[11].tab)}
            >
              试听
            </button>
          </div>
        </div>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>音符</th>
                <th>占几拍</th>
                <th>手上怎么动</th>
              </tr>
            </thead>
            <tbody>
              {NOTE_VALUES.map((value) => (
                <tr key={value.id}>
                  <td>{value.label}</td>
                  <td className="muted">{beatsLabel(value.beats)}</td>
                  <td className="muted">{value.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lesson-sub">一拍里动几下：把时值摊开看</h4>
        <div className="lesson-buttons">
          {([1, 2, 3, 4] as Subdivision[]).map((value) => (
            <button
              key={value}
              type="button"
              className={value === subdivision ? "chip on" : "chip"}
              onClick={() => setSubdivision(value)}
            >
              每拍 {SUBDIVISION_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="lesson-figure">
          <RhythmStrip meterId="4/4" subdivision={subdivision} />
          <p className="lesson-cap">
            数拍：{countLine("4/4", subdivision)}——嘴里念的数，要和手上落的音对上
          </p>
        </div>

        <h4 className="lesson-sub">节拍器：节奏只能跟出来，不能想出来</h4>
        <p className="lesson-lead">
          下面这个是现场合成的（没有任何音频文件），所以它能任意变速、任意切分。
          先只跟着听、跟着数，不弹；稳了再一拍弹一下，最后才加细分。
        </p>
        <Metronome />

        <h4 className="lesson-sub">附点与三连音：一拍为什么能变成 1.5 份或 3 份</h4>
        <p className="lesson-lead">
          附点 = 原来的时值再加一半，所以附点四分是 1.5 拍；八分三连音是把一拍
          <b>平均三等分</b>，三个正好一拍。三连音不是「弹快点」，是「三等分」——
          这两者听起来完全不同。
        </p>
        <div className="lesson-figure">
          <RhythmStrip meterId="4/4" subdivision={3} />
          <p className="lesson-cap">三连音：{countLine("4/4", 3)}，每拍平均三下</p>
        </div>

        <h4 className="lesson-sub">拍号：分子是每小节几拍，分母是以什么音符为一拍</h4>
        <div className="lesson-table-wrap">
          <table className="theory-table">
            <thead>
              <tr>
                <th>拍号</th>
                <th>怎么数</th>
                <th>听感</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>4/4</td>
                <td className="muted">1 2 3 4（强 弱 次强 弱）</td>
                <td className="muted">最常用：流行、摇滚、民谣</td>
              </tr>
              <tr>
                <td>3/4</td>
                <td className="muted">1 2 3（强 弱 弱）</td>
                <td className="muted">圆舞曲，「嘭 恰 恰」</td>
              </tr>
              <tr>
                <td>2/4</td>
                <td className="muted">1 2（强 弱）</td>
                <td className="muted">进行曲，短促有力</td>
              </tr>
              <tr>
                <td>6/8</td>
                <td className="muted">1 2 3 4 5 6，但听成两个大拍（1 和 4 重）</td>
                <td className="muted">复拍子，每个大拍三下，像慢速的三连音</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="lesson-sub">落到吉他上：扫弦型 = 时值 + 方向</h4>
        <p className="lesson-lead">
          八分音符的一拍是「下上」，真正常用的节奏型会空掉几下一一空拍时手照样挥，
          只是不碰弦。手不停、弦少响，节奏才不断。
        </p>
        <div className="lesson-buttons">
          {STRUM_PATTERNS.map((pattern) => (
            <button
              key={pattern.id}
              type="button"
              className={pattern.id === strum.id ? "chip on" : "chip"}
              onClick={() => setStrumId(pattern.id)}
            >
              {pattern.name}
            </button>
          ))}
        </div>
        <div className="lesson-figure">
          <RhythmStrip meterId={strum.meterId} subdivision={2} arrows={strum.slots} />
          <p className="lesson-cap">
            {strum.name}：{strum.hint}
          </p>
        </div>
        <p className="lesson-note">
          练节奏最容易犯的错是<b>一卡就加速</b>。把节拍器降到 60，慢到能听见每一拍，
          稳了再加 5——稳不下来的速度就不是你的速度。
        </p>
      </section>

      <TheoryGame />

      <p className="lesson-cta">
        想再练练指板？去「和弦」页按一遍，或去「音阶游戏」把音名填出来。
      </p>
    </section>
  );
}
