import { useEffect, useMemo, useRef, useState } from "react";
import { SKILLS, checkPiece, generatePiece, tabAriaLabel, tabToAlphaTex, type SkillId } from "@guitar/core";
import { useScoreImage } from "../hooks/useScoreImage";
import { useTone } from "../hooks/useTone";
import { addScore } from "../lib/my-scores";

/**
 * 按技能生成谱（v0.163.0）。
 *
 * 「我的谱」这一页对初学者其实很难：写不出、也编配不好。所以这里给一条更短的路：
 * 先选一个技能（四分、八分、滑音、击勾弦、扫弦），选长度，系统按乐理约束生成一段
 * 能弹的谱——看完不满意就「换一条」，觉得有意思就存进「我的谱」接着跟练。
 *
 * 谱是本地算出来的（`generatePiece()`，同一个种子每次都一样），不联网、不用模型；
 * 生成完还要过一遍 `checkPiece()` 的可弹性检查，出问题会直接说出来而不是悄悄画上去。
 */
const LENGTHS = [4, 8];

const LEVEL_LABEL: Record<number, string> = {
  1: "入门",
  2: "基础",
  3: "进阶",
  4: "提高",
  5: "挑战",
};

export default function Generate() {
  const [skill, setSkill] = useState<SkillId>("quarter");
  const [bars, setBars] = useState(4);
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

  const piece = useMemo(() => generatePiece(skill, seed, bars), [skill, seed, bars]);
  const check = useMemo(() => checkPiece(piece), [piece]);
  // 画布给宽一点：四小节一行放得下，八小节折成两行（窄画布会被折成三行，卡片长得离谱）
  const tex = useMemo(() => tabToAlphaTex(piece.tab), [piece]);
  const label = useMemo(() => tabAriaLabel(piece.tab), [piece]);
  const { image, error: imageError } = useScoreImage(started ? tex : null, 820, 1000);
  const info = SKILLS.find((item) => item.id === skill) ?? SKILLS[0];

  // 离开这一页 / 换技能换速度时把正在响的停下，否则会跟新的一条叠在一起
  useEffect(() => () => {
    toneRef.current.stop();
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
  }, []);

  useEffect(() => {
    toneRef.current.stop();
    setPlaying(false);
  }, [skill, seed, bars]);

  function nextSeed() {
    setStarted(true);
    setSeed((current) => {
      const next = (current + 37 + Math.floor(Math.random() * 900)) % 100000;
      return next === current ? current + 1 : next;
    });
    setNote(null);
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
        写不出也没关系：选一个技能，系统按乐理规则编一段能弹的谱给你。
      </p>
      <div className="generate-skills" role="group" aria-label="想练哪个技能">
        {SKILLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${skill === item.id ? " on" : ""}`}
            aria-pressed={skill === item.id}
            onClick={() => {
              setSkill(item.id);
              setStarted(true);
              setNote(null);
            }}
          >
            {item.label}
            <span className="generate-lv">{LEVEL_LABEL[item.level] ?? ""}</span>
          </button>
        ))}
      </div>
      <div className="generate-row">
        <label className="generate-field">
          <span>长度</span>
          <select
            aria-label="生成几小节"
            value={bars}
            onChange={(event) => {
              setBars(Number(event.target.value));
              setStarted(true);
              setNote(null);
            }}
          >
            {LENGTHS.map((value) => (
              <option key={value} value={value}>
                {value} 小节
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-quiet generate-next" onClick={nextSeed}>
          换一条
        </button>
        <span className="generate-meta">
          C 大调 · {piece.meter} · {piece.bpm[0]}–{piece.bpm[1]} BPM · 第 {seed} 号
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
      {!check.ok && (
        <p className="generate-bad" role="alert">
          这条生成得有问题：{check.problems.slice(0, 2).join("；")}
        </p>
      )}
      <div className="generate-actions">
        <button type="button" className="btn primary" onClick={audition}>
          {playing ? "停" : "试听"}
        </button>
        <button type="button" className="btn" onClick={save}>
          存进我的谱
        </button>
        <span className="generate-note" role="status">
          {note ?? `${info.trains}`}
        </span>
      </div>
    </div>
  );
}
