import { useEffect, useMemo, useRef, useState } from "react";
import {
  MELODY_CHOICES,
  MELODY_DENSITY_LABEL,
  MELODY_TECH_LABEL,
  SKILLS,
  checkPiece,
  generateMelodyLinePiece,
  generateMelodyPiece,
  generatePiece,
  melodySegmentsOf,
  practiceGoalOf,
  tabAriaLabel,
  tabEvents,
  tabToAlphaTex,
  type MelodyDensity,
  type MelodyLine,
  type MelodyTech,
  type SkillId,
} from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";
import { useTone } from "../hooks/useTone";
import { loadSettings, saveSettings } from "../lib/storage";
import { addScore, loadScores, type MyScore } from "../lib/my-scores";
import type { FollowTarget } from "./FollowAlong";

/**
 * 按技能生成谱（v0.163.0；v0.164.0 加了「熟悉旋律」一支和「跟练」入口；
 * v0.165.0 加了「我存的谱」当骨架、跟练前顺手存一份、记住上次选的）。
 *
 * 「我的谱」这一页对初学者其实很难：写不出、也编配不好。所以这里给一条更短的路：
 *   - 自己生成：选一个技能（四分、八分、滑音、击勾弦、扫弦），选长度，系统按乐理
 *     约束生成一段能弹的谱；
 *   - 熟悉旋律：小星星 / 欢乐颂 / 两只老虎做骨架，在上面叠滑音或击勾弦——
 *     旋律是现成的，只需要管新技巧；
 *   - 我存的谱：拿自己扒的 / 写的那条当骨架，同一套叠法。
 *
 * 谱是本地算出来的（同一个种子每次都一样），不联网、不用模型；生成完还要过一遍
 * `checkPiece()` 的可弹性检查，出问题会直接说出来而不是悄悄画上去。
 * 生成完可以直接进跟练（没存过就顺手存一份，练完最高速度记在这条谱自己的记录里），
 * 上次选的素材 / 技能 / 档位都记在设置里。
 */
const LENGTHS = [4, 8];
const MELODY_LENGTHS = [2, 4, 8];
/** 长谱切段的一段几拍（v0.166.0）：4 小节一段。 */
const SEGMENT_BEATS = 16;
/** 「按这条再变一变」轮换的顺序（v0.166.0）：滑音轻松 → 标准 → 加密，再击勾弦一轮。 */
const VARIANT_ORDER: { tech: MelodyTech; density: MelodyDensity }[] = [
  { tech: "slide", density: 1 },
  { tech: "slide", density: 2 },
  { tech: "slide", density: 3 },
  { tech: "hammer", density: 1 },
  { tech: "hammer", density: 2 },
  { tech: "hammer", density: 3 },
];

const LEVEL_LABEL: Record<number, string> = {
  1: "入门",
  2: "基础",
  3: "进阶",
  4: "提高",
  5: "挑战",
};

/** 一条存下来的谱能不能当骨架：要有谱、至少四拍。 */
function lineOfScore(score: MyScore): MelodyLine | null {
  if (!score.tab) return null;
  const events = tabEvents(score.tab, 60);
  if (events.length === 0) return null;
  // 一拍取最高的那个音（和弦取冠音当旋律线），休止的那拍拿前一个音顶上
  const perBeat = new Map<number, number>();
  for (const event of events) {
    const beat = Math.floor(event.at);
    const current = perBeat.get(beat);
    if (current === undefined || event.midi > current) perBeat.set(beat, event.midi);
  }
  const beats = [...perBeat.keys()].sort((a, b) => a - b);
  if (beats.length === 0) return null;
  const last = Math.min(beats[beats.length - 1], 63);
  if (last < 3) return null;
  let prev = perBeat.get(beats[0]) ?? 60;
  const midis: number[] = [];
  for (let beat = 0; beat <= last; beat += 1) {
    const midi = perBeat.get(beat) ?? prev;
    midis.push(midi);
    prev = midi;
  }
  return { id: score.id, name: score.title, midis };
}

interface Props {
  /** 进跟练（v0.164.0）：「我的谱」那一页已经有一份现成的 follow。 */
  follow?: (target: FollowTarget) => void;
  /** 这条谱练到的最高速度（v0.164.0）。 */
  best?: (id: string) => number | undefined;
  /** 存下来的谱（v0.165.0）：「我存的谱」当骨架要从这里挑。 */
  scores?: MyScore[];
}

export default function Generate({ follow, best, scores }: Props) {
  const saved = useMemo(() => loadSettings(), []);
  // 「素材」从哪来：自己生成，还是拿旋律当骨架（v0.164.0；v0.165.0 加「我存的谱」）
  const [mode, setMode] = useState<"skill" | "melody" | "my">(saved.genMode);
  const [skill, setSkill] = useState<SkillId>(saved.genSkill as SkillId);
  const [bars, setBars] = useState(saved.genBars);
  const [melodyId, setMelodyId] = useState<string>(saved.genMelody || MELODY_CHOICES[0]?.id || "star");
  const [tech, setTech] = useState<MelodyTech>(saved.genTech);
  const [density, setDensity] = useState<MelodyDensity>(saved.genDensity);
  const [melodyBars, setMelodyBars] = useState(saved.genMelodyBars);
  const [myId, setMyId] = useState<string | null>(null);
  // 长谱切成段落后选第几段（v0.166.0）：换一条骨架时回到第一段
  const [mySegment, setMySegment] = useState(0);
  const [seed, setSeed] = useState(3);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // 点了「编一段」才画谱：节奏页上有一百多张卡，同一条 alphaTab 流水线先画这张会拖慢别的卡
  const [started, setStarted] = useState(false);
  const tone = useTone();
  // `useTone()` 每次渲染都返回一个新对象，不能直接当 effect 的依赖（否则每帧都 stop 一次）
  const toneRef = useRef(tone);
  toneRef.current = tone;
  const stopTimer = useRef<number | null>(null);

  const lines = useMemo(
    () =>
      (scores ?? [])
        .map(lineOfScore)
        .filter((item): item is MelodyLine => item !== null)
        .slice(0, 8),
    [scores],
  );
  const activeLine = lines.find((item) => item.id === myId) ?? lines[0];
  // 长谱（超过 16 拍）切成 4 小节一段让你挑（v0.166.0）；短谱就一条
  const segments = useMemo(
    () => (mode === "my" && activeLine ? melodySegmentsOf(activeLine, SEGMENT_BEATS) : []),
    [mode, activeLine],
  );
  const activeSegment =
    segments.length > 0 ? segments[Math.max(0, Math.min(mySegment, segments.length - 1))] : undefined;
  const myReady = mode !== "my" || activeLine !== undefined;

  const piece = useMemo(() => {
    if (mode === "melody") return generateMelodyPiece({ melodyId, tech, density, seed, bars: melodyBars });
    if (mode === "my" && activeLine) {
      const base = activeSegment ?? activeLine;
      return generateMelodyLinePiece(base, { tech, density, seed, bars: melodyBars });
    }
    return generatePiece(skill, seed, bars);
  }, [mode, melodyId, tech, density, seed, melodyBars, skill, bars, activeLine, activeSegment]);
  const check = useMemo(() => checkPiece(piece), [piece]);
  // 画布给宽一点：四小节一行放得下，八小节折成两行（窄画布会被折成三行，卡片长得离谱）
  const tex = useMemo(() => tabToAlphaTex(piece.tab), [piece]);
  const label = useMemo(() => tabAriaLabel(piece.tab), [piece]);
  const { image, error: imageError } = useScoreImage(started ? tex : null, 820, 1000);
  const info = SKILLS.find((item) => item.id === piece.skill) ?? SKILLS[0];
  const melody = MELODY_CHOICES.find((item) => item.id === melodyId) ?? MELODY_CHOICES[0];
  const high = best ? best(piece.id) : undefined;

  // 离开这一页 / 换技能换速度时把正在响的停下，否则会跟新的一条叠在一起
  useEffect(() => () => {
    toneRef.current.stop();
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
  }, []);

  useEffect(() => {
    toneRef.current.stop();
    setPlaying(false);
  }, [piece]);

  function pickMode(value: "skill" | "melody" | "my") {
    setMode(value);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genMode: value });
  }

  function pickSkill(value: SkillId) {
    setSkill(value);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genSkill: value });
  }

  function pickMelody(value: string) {
    setMelodyId(value);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genMelody: value });
  }

  function pickTech(value: MelodyTech) {
    setTech(value);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genTech: value });
  }

  function pickDensity(value: MelodyDensity) {
    setDensity(value);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genDensity: value });
  }

  function pickBars(value: number) {
    if (mode === "skill") {
      setBars(value);
      saveSettings({ ...loadSettings(), genBars: value });
    } else {
      setMelodyBars(value);
      saveSettings({ ...loadSettings(), genMelodyBars: value });
    }
    setStarted(true);
    setNote(null);
  }

  function nextSeed() {
    setStarted(true);
    setSeed((current) => {
      const next = (current + 37 + Math.floor(Math.random() * 900)) % 100000;
      return next === current ? current + 1 : next;
    });
    setNote(null);
  }

  /** 按这条再变一变（v0.166.0）：骨架不动，轮换「技巧 × 档位」，号也换一个。 */
  function nextVariant() {
    const index = VARIANT_ORDER.findIndex((item) => item.tech === tech && item.density === density);
    const next = VARIANT_ORDER[(index + 1 + VARIANT_ORDER.length) % VARIANT_ORDER.length];
    setTech(next.tech);
    setDensity(next.density);
    setStarted(true);
    setNote(null);
    saveSettings({ ...loadSettings(), genTech: next.tech, genDensity: next.density });
    setSeed((current) => (current + 37 + Math.floor(Math.random() * 900)) % 100000);
  }

  function audition() {
    if (playing) {
      tone.stop();
      setPlaying(false);
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      return;
    }
    tone.playTab(piece.tab, piece.bpm[0]);
    setPlaying(true);
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    const seconds = (60 / piece.bpm[0]) * piece.tab.bars * 4 + 1.2;
    stopTimer.current = window.setTimeout(() => setPlaying(false), seconds * 1000);
  }

  function practice() {
    if (!follow) return;
    // 没存过就顺手存一份（v0.165.0）：跟练的成绩挂在谱自己的 id 上，列表里留一条才找得回来
    const title = `${piece.title} · ${seed} 号`;
    if (!loadScores().some((item) => item.title === title)) {
      addScore({
        title,
        ascii: "",
        source: "generated",
        tab: piece.tab,
        meter: piece.meter,
        bpm: piece.bpm[0],
      });
      window.dispatchEvent(new Event("guitar:scores"));
      setNote(`顺手存进「我的谱」了：${title}`);
    }
    follow({
      id: piece.id,
      name: piece.title,
      bpm: [piece.bpm[0], piece.bpm[1]],
      tab: piece.tab,
      meter: piece.meter,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    addScore({
      title: `${piece.title} · ${seed} 号`,
      ascii: "",
      source: "generated",
      tab: piece.tab,
      meter: piece.meter,
      bpm: piece.bpm[0],
    });
    window.dispatchEvent(new Event("guitar:scores"));
    setNote(`存好了：「${piece.title} · ${seed} 号」`);
  }

  return (
    <div className="generate" data-generate="">
      <p className="generate-hint">
        写不出也没关系：选一个技能，系统按乐理规则编一段能弹的谱；也可以拿熟悉的旋律、或者自己存的谱当骨架，往上叠技巧。
      </p>
      <div className="generate-skills" role="group" aria-label="素材从哪来">
        {(
          [
            ["skill", "自己生成", "选技能"],
            ["melody", "熟悉旋律", "叠技巧"],
            ["my", "我存的谱", "拿自己的当骨架"],
          ] as const
        ).map(([value, text, sub]) => (
          <button
            key={value}
            type="button"
            className={`chip${mode === value ? " on" : ""}`}
            aria-pressed={mode === value}
            onClick={() => pickMode(value)}
          >
            {text}
            <span className="generate-lv">{sub}</span>
          </button>
        ))}
      </div>

      {mode === "skill" ? (
        <div className="generate-skills" role="group" aria-label="想练哪个技能">
          {SKILLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${skill === item.id ? " on" : ""}`}
              aria-pressed={skill === item.id}
              onClick={() => pickSkill(item.id)}
            >
              {item.label}
              <span className="generate-lv">{LEVEL_LABEL[item.level] ?? ""}</span>
            </button>
          ))}
        </div>
      ) : mode === "melody" ? (
        <>
          <div className="generate-skills" role="group" aria-label="拿哪条旋律当骨架">
            {MELODY_CHOICES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${melodyId === item.id ? " on" : ""}`}
                aria-pressed={melodyId === item.id}
                onClick={() => pickMelody(item.id)}
              >
                {item.name}
                <span className="generate-lv">{item.short}</span>
              </button>
            ))}
          </div>
          <div className="generate-skills" role="group" aria-label="往上叠哪种技巧">
            {(Object.keys(MELODY_TECH_LABEL) as MelodyTech[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${tech === id ? " on" : ""}`}
                aria-pressed={tech === id}
                onClick={() => pickTech(id)}
              >
                {MELODY_TECH_LABEL[id]}
              </button>
            ))}
          </div>
          <div className="generate-skills" role="group" aria-label="技巧叠多密">
            {[1, 2, 3].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${density === value ? " on" : ""}`}
                aria-pressed={density === value}
                onClick={() => pickDensity(value as MelodyDensity)}
              >
                {MELODY_DENSITY_LABEL[value as MelodyDensity]}
                <span className="generate-lv">{value === 1 ? "三分之一" : value === 2 ? "三分之二" : "全上"}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="generate-skills" role="group" aria-label="拿哪条自己存的谱当骨架">
            {lines.map((line) => (
              <button
                key={line.id}
                type="button"
                className={`chip${activeLine?.id === line.id ? " on" : ""}`}
                aria-pressed={activeLine?.id === line.id}
                onClick={() => {
                  setMyId(line.id);
                  setMySegment(0);
                  setStarted(true);
                  setNote(null);
                }}
              >
                {line.name}
                <span className="generate-lv">{line.midis.length} 拍</span>
              </button>
            ))}
          </div>
          {segments.length > 1 && (
            <div className="generate-skills generate-segments" role="group" aria-label="练这一条的哪一段">
              {segments.map((segment, index) => (
                <button
                  key={`${segment.id}-${index}`}
                  type="button"
                  className={`chip${activeSegment === segment ? " on" : ""}`}
                  aria-pressed={activeSegment === segment}
                  onClick={() => {
                    setMySegment(index);
                    setStarted(true);
                    setNote(null);
                  }}
                >
                  {`第 ${(index * SEGMENT_BEATS) / 4 + 1}–${(index * SEGMENT_BEATS + segment.midis.length) / 4} 小节`}
                </button>
              ))}
            </div>
          )}
          <div className="generate-skills" role="group" aria-label="往上叠哪种技巧">
            {(Object.keys(MELODY_TECH_LABEL) as MelodyTech[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${tech === id ? " on" : ""}`}
                aria-pressed={tech === id}
                onClick={() => pickTech(id)}
              >
                {MELODY_TECH_LABEL[id]}
              </button>
            ))}
          </div>
          <div className="generate-skills" role="group" aria-label="技巧叠多密">
            {[1, 2, 3].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${density === value ? " on" : ""}`}
                aria-pressed={density === value}
                onClick={() => pickDensity(value as MelodyDensity)}
              >
                {MELODY_DENSITY_LABEL[value as MelodyDensity]}
                <span className="generate-lv">{value === 1 ? "三分之一" : value === 2 ? "三分之二" : "全上"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!myReady ? (
        <p className="generate-none">
          还没有能当骨架的谱——先在下面扒一段或写一段存进「我的谱」，再来拿它当骨架。
        </p>
      ) : (
        <>
          <div className="generate-row">
            <label className="generate-field">
              <span>长度</span>
              <select
                aria-label="生成几小节"
                value={mode === "skill" ? bars : melodyBars}
                onChange={(event) => pickBars(Number(event.target.value))}
              >
                {(mode === "skill" ? LENGTHS : MELODY_LENGTHS).map((value) => (
                  <option key={value} value={value}>
                    {value} 小节
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-quiet generate-next"
              onClick={mode === "skill" ? nextSeed : nextVariant}
            >
              {mode === "skill" ? "换一条" : "按这条再变一变"}
            </button>
            <span className="generate-meta">
              {mode === "skill"
                ? `C 大调 · ${piece.meter} · ${piece.bpm[0]}–${piece.bpm[1]} BPM · 第 ${seed} 号`
                : `${piece.title.replace(/^生成 · /, "").replace(/ · [^·]+ 小节$/, "")} · ${piece.meter} · ${piece.bpm[0]}–${piece.bpm[1]} BPM · 第 ${seed} 号`}
            </span>
          </div>

          <span className="generate-score">
            {!started ? (
              <button type="button" className="btn primary generate-start" onClick={() => setStarted(true)}>
                编一段试试
              </button>
            ) : image ? (
              <img className="tab-score" src={image.dataUrl} alt={label} width={image.width} />
            ) : (
              <span className="generate-loading">{imageError ? "这张谱没画出来" : "画谱中…"}</span>
            )}
          </span>

          <p className="generate-tip">{piece.hint}</p>
          <p className="generate-goal">
            <span className="generate-goal-tag">小目标</span>
            {practiceGoalOf(piece)}
          </p>
          {!check.ok && (
            <p className="generate-bad" role="alert">
              这条生成得有问题：{check.problems.slice(0, 2).join("；")}
            </p>
          )}
          <div className="generate-actions">
            <button type="button" className="btn primary" onClick={audition}>
              {playing ? "停" : "试听"}
            </button>
            {follow && (
              <button type="button" className="btn" onClick={practice}>
                跟练
              </button>
            )}
            <button type="button" className="btn" onClick={save}>
              存进我的谱
            </button>
            {high !== undefined && <span className="best-badge">最高 {high} BPM</span>}
            <span className="generate-note" role="status">
              {note ??
                (mode === "skill"
                  ? `${info.trains}`
                  : mode === "melody"
                    ? `${melody.name}的骨架 · ${MELODY_TECH_LABEL[tech]}叠上去`
                    : "自己存的谱当骨架 · 技巧叠上去")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
