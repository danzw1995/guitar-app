import { useEffect, useMemo, useRef, useState } from "react";
import type { Tab } from "@guitar/core";
import { METERS, SUBDIVISION_LABEL, sliceTab, type Subdivision } from "@guitar/core";
import { degreeName, degreesOf } from "../lib/degrees";
import { useMetronome } from "../hooks/useMetronome";
import { useAudioVolume, volumeLabel } from "../lib/audio-bus";
import { loadRhythm } from "../lib/storage";
import { addScore } from "../lib/my-scores";
import { addExtra } from "../lib/plan";
import TabScore from "./TabScore";

export interface FollowTarget {
  id: string;
  name: string;
  bpm: [number, number];
  tab: Tab;
  /** 练习自己的拍号（2/4、3/4、6/8…），节拍器按它数拍。 */
  meter?: string;
}

/** 只练某几小节时，练满几遍自动接回整段（v0.99.0；v0.100.0 起遍数可选）。 */
const LOOP_PASS_CHOICES = [1, 2, 3] as const;
const LOOP_PASSES = 2;

/** 跟练时「最卡的一级」：用户点级数方块单独去练的那一处（v0.99.0）。 */
export interface FollowHardest {
  bar: number;
  degree: number;
  name: string;
  /** 点了几次。 */
  count: number;
}

export interface FollowAlongProps {
  target: FollowTarget;
  /** 之前练到过的最高速度（没有就不显示）。 */
  best?: number;
  onFinish: (result: { bpm: number; minutes: number; hardest?: FollowHardest }) => void;
  onClose: () => void;
  /** 点了「只练这一处」（v0.113.0）：父组件记一笔「这一处单独练过几次」。 */
  onSpot?: (spot: FollowHardest) => void;
  /** 一打开就圈住这一小节并开练（v0.129.0）：从统计页曲线上双击过来时用。 */
  startBar?: number;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 按谱子的内容挑一个默认的「每拍数几下」。
 *
 * 6/8 的谱一拍本来就是八分，按一拍一下数；
 * 其余拍子看最短的音——有八分/十六分就按八分提示，纯四分就只数拍点。
 * 太细的细分（十六分）在慢速时反而吵，所以默认不选它。
 */
function defaultSubdivision(tab: Tab, meter: string): Subdivision {
  if (meter === "6/8") return 1;
  const finest = tab.notes.length
    ? Math.min(...tab.notes.map((note) => note.dur))
    : 1;
  return finest <= 0.51 ? 2 : 1;
}

/**
 * 跟练：选一条练习，节拍器按练习自己的拍号起速，隔几小节往上加一点。
 *
 * 为什么要自动加速：练节奏最容易"待在舒服的速度里"。把提速交给节拍器，
 * 人只需要判断「刚才那遍稳不稳」；结束时记下当前速度，下次从这儿接着来。
 *
 * 起始速度、每次加多少、几小节加一次都可以改——每个人的"卡点"不一样，
 * 有人 86 就能稳，有人得从 60 起。
 */
export default function FollowAlong({
  target,
  best,
  onFinish,
  onClose,
  onSpot,
  startBar,
}: FollowAlongProps) {
  const meter = target.meter ?? "4/4";
  const [startBpm, setStartBpm] = useState(target.bpm[0]);
  const [bpm, setBpm] = useState(target.bpm[0]);
  const [ramp, setRamp] = useState(true);
  const [step, setStep] = useState(5);
  const [bars, setBars] = useState(4);
  const [subdivision, setSubdivision] = useState<Subdivision>(() =>
    defaultSubdivision(target.tab, meter),
  );
  const [countIn, setCountIn] = useState(1);
  const [loopOn, setLoopOn] = useState(false);
  const [loopPasses, setLoopPasses] = useState(LOOP_PASSES);
  const [loopFrom, setLoopFrom] = useState(1);
  const [loopTo, setLoopTo] = useState(target.tab.bars);
  const [seconds, setSeconds] = useState(0);
  const [volume, setVolume] = useAudioVolume();
  /** 记录成绩之后显示的那一句（含「最卡的一级」）。 */
  const [done, setDone] = useState<{
    bpm: number;
    hardest: FollowHardest | null;
    spots: FollowHardest[];
  } | null>(null);
  /** 点级数方块单独去练的次数：点得最多的那一处就是「最卡的」。 */
  const hardRef = useRef(new Map<string, FollowHardest>());
  const loopPassRef = useRef(0);
  /** 上次记成绩时留下的「最卡的一处」：练到那一小节时提醒一下（v0.101.0）。 */
  const remembered = useMemo(() => loadRhythm()[target.id]?.hardest ?? null, [target.id]);
  /** 这一次记录过成绩的那几处（v0.111.0）：一次跟练可能点了不止一小节，按处记状态。 */
  const [savedSpots, setSavedSpots] = useState<string[]>([]);
  const [planSpots, setPlanSpots] = useState<string[]>([]);
  /** 「这次还点了另外 N 处」要不要展开（v0.111.0）：默认收起，先看最卡的那一处。 */
  const [spotsOpen, setSpotsOpen] = useState(false);
  /**
   * 每一处「只练这一处」单独练过几次（v0.113.0）。
   * 跟 `hardest.count`（跟练里点级数方块的次数）分开：一个是「卡住了」，一个是「回头单独练」。
   */
  const [spotTimes, setSpotTimes] = useState<Record<string, number>>(() => {
    const rows = loadRhythm()[target.id]?.spots ?? [];
    return Object.fromEntries(rows.map((row) => [`${row.bar}-${row.degree}`, row.times]));
  });

  const totalBars = target.tab.bars;
  const loop = loopOn
    ? { from: Math.min(loopFrom, loopTo), to: Math.max(loopFrom, loopTo) }
    : null;

  /**
   * 带着「第几小节」进来（v0.129.0）：先把那一小节圈住再开练。
   *
   * 只按挂载那一刻的值跑一次——父组件把这一小节设进去之后就不再管它，
   * 用户进去自己改 A-B 也不会被拽回来。`count: false`：这不是用户手点的，不算「卡住」。
   *
   * **不能单独写一个 effect**：下面「换一条练习就重置」那个 effect 挂在 `[target.id]` 上，
   * 挂载时也会跑一遍，会把这里设好的 A-B 清回 1…末小节再 `stop()`。所以并进那一个。
   */

  /** 点级数方块：只反复练那一小节（v0.98.0）。没在跑就顺手开始。 */
  function practiceBar(wanted: number, count = true): void {
    const next = Math.min(Math.max(1, wanted), totalBars);
    setLoopOn(true);
    setLoopFrom(next);
    setLoopTo(next);
    loopPassRef.current = 0;
    // 点得最多的小节 = 最卡的地方（v0.99.0），记录成绩时一起存
    const row = degrees.find(
      (item) => Math.floor(item.beat / target.tab.beatsPerBar) + 1 === next,
    );
    if (row && count) {
      const key = String(next);
      const previous = hardRef.current.get(key);
      hardRef.current.set(key, {
        bar: next,
        degree: row.degree,
        name: row.name,
        count: (previous?.count ?? 0) + 1,
      });
    }
    if (!running) start();
  }

  /**
   * 把「最卡的那一小节」单独切出来存进「我的谱」（v0.101.0）。
   *
   * 存的是一小节切片、不是整段：下次想单练不用再进跟练、也不用自己数小节。
   */
  function sliceOf(hit: FollowHardest): { tab: ReturnType<typeof sliceTab>; title: string } {
    const width = target.tab.beatsPerBar;
    return {
      tab: sliceTab(target.tab, (hit.bar - 1) * width, width),
      title: `最卡的一小节 · ${target.name} 第 ${hit.bar} 小节`,
    };
  }

  /** 一处「卡住的地方」的键：同一小节里不同级数算两处（v0.111.0）。 */
  function spotKey(hit: FollowHardest): string {
    return `${hit.bar}-${hit.degree}`;
  }

  function saveHardestBar(hit: FollowHardest): void {
    const { tab, title } = sliceOf(hit);
    addScore({
      title,
      ascii: "",
      source: "slice",
      tab,
      meter: `${tab.beatsPerBar}/4`,
      bpm,
    });
    setSavedSpots((list) => (list.includes(spotKey(hit)) ? list : [...list, spotKey(hit)]));
    window.dispatchEvent(new Event("guitar:scores"));
  }

  /** 加进「今日计划」（v0.102.0）：练习页顶部会多出一块，练完也算今天的量。 */
  function addHardestToPlan(hit: FollowHardest): void {
    const { tab, title } = sliceOf(hit);
    addExtra({ title, tab, meter: `${tab.beatsPerBar}/4`, bpm });
    setPlanSpots((list) => (list.includes(spotKey(hit)) ? list : [...list, spotKey(hit)]));
    window.dispatchEvent(new Event("guitar:plan"));
  }

  /**
   * 回执里直接「只练这一处」（v0.112.0）。
   *
   * 以前要单练某小节得回上面的级数方块再点一下；回执关掉就看不到那些方块的当前状态了，
   * 手指上还记着刚才是哪一小节，所以在这里给一个入口：收起回执、把 A-B 循环挪到这一小节。
   */
  function practiceSpot(hit: FollowHardest): void {
    setDone(null);
    setSpotsOpen(false);
    // 只练这一处也算一次「回头练」（v0.113.0）：记在父组件的 records 里，面板上也立刻显示
    onSpot?.(hit);
    setSpotTimes((before) => {
      const key = `${hit.bar}-${hit.degree}`;
      return { ...before, [key]: (before[key] ?? 0) + 1 };
    });
    // 只是把循环挪过去，不再给「卡了几次」加一——刚才那一下已经记过了
    practiceBar(hit.bar, false);
  }

  const { running, bar, pass, active, countingIn, start, stop } = useMetronome({
    bpm,
    meterId: meter,
    subdivision,
    ramp: ramp ? { bars, step } : undefined,
    onBpm: setBpm,
    countIn,
    loop,
  });

  // 现在弹到第几级（v0.96.0）：按起音拍往后找，找不到就退回第一个
  const degrees = useMemo(() => degreesOf(target.tab), [target.tab]);
  /** 圈住的那一小节里有哪些音（放大块的标题里点一下是第几级）。 */
  const zoomDegree = useMemo(() => {
    if (!loopOn || loopFrom !== loopTo) return null;
    return (
      degrees.find(
        (item) => Math.floor(item.beat / target.tab.beatsPerBar) + 1 === loopFrom,
      ) ?? null
    );
    // loopFrom / loopTo 是变化源，degrees 跟着 target 走
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [degrees, loopOn, loopFrom, loopTo, target.tab.beatsPerBar]);
  const beatNow = bar * target.tab.beatsPerBar + Math.max(0, active);
  const degreeIndex = degrees.length
    ? Math.max(
        0,
        degrees.reduce((acc, row, index) => (row.beat <= beatNow ? index : acc), 0),
      )
    : -1;
  const degreeNow = degreeIndex >= 0 ? degrees[degreeIndex] : null;
  // 下一级预告（v0.97.0）：练到最后一个就不再往后指
  const degreeNext =
    degreeIndex >= 0 && degreeIndex + 1 < degrees.length ? degrees[degreeIndex + 1] : null;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  /**
   * 只练某几小节时，练满 `loopPasses` 遍就自动接回整段（v0.99.0，v0.100.0 起遍数可选）。
   *
   * 用节拍器给的 `pass`（循环里第几遍）数圈：单小节循环时 `bar` 一直是同一个值，
   * 靠小节读数根本数不出圈（v0.100.0 踩到的 bug——只练一小节时一挂上就白算一遍）。
   */
  useEffect(() => {
    if (!running || !loop) {
      loopPassRef.current = 0;
      return;
    }
    if (pass < 1) return;
    if (pass <= loopPassRef.current) return;
    loopPassRef.current = pass;
    if (pass < loopPasses) return;
    loopPassRef.current = 0;
    // 只有「只练一部分」才需要接回整段；本来就在整段里打圈就让它继续
    if (loop.to - loop.from + 1 < totalBars) setLoopOn(false);
  }, [pass, running, loop, totalBars, loopPasses]);

  /** 这一段里最卡的一处：点级数方块点得最多的那一小节。 */
  function hardestSoFar(): FollowHardest | null {
    let best: FollowHardest | null = null;
    for (const item of hardRef.current.values()) {
      if (!best || item.count > best.count) best = item;
    }
    return best;
  }

  /** 这一次点过的所有处，按点得多的在前（v0.111.0）。 */
  function spotsSoFar(): FollowHardest[] {
    return [...hardRef.current.values()]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.bar - b.bar || b.degree - a.degree);
  }

  function finish() {
    // 这一遍没点过方块时退回「上次记下的那一处」（v0.101.0）：
    // 不然「把第 N 小节存成练习」只在点过方块的这一遍里才有，等于白做。
    const spots = spotsSoFar();
    const hardest = spots[0] ?? remembered;
    onFinish({ bpm, minutes: Math.max(1, Math.round(seconds / 60)), hardest: hardest ?? undefined });
    setDone({ bpm, hardest, spots });
    setSpotsOpen(false);
    stop();
    setSeconds(0);
  }

  // 换一条练习就重置速度与计时（卸载时由 useMetronome 自己收尾）
  useEffect(() => {
    setStartBpm(target.bpm[0]);
    setBpm(target.bpm[0]);
    setSeconds(0);
    setSubdivision(defaultSubdivision(target.tab, meter));
    setLoopFrom(1);
    setLoopTo(target.tab.bars);
    setLoopOn(false);
    setDone(null);
    setSavedSpots([]);
    setPlanSpots([]);
    setSpotsOpen(false);
    // 换练习时把「单独练过几次」也换成这一条的
    const rows = loadRhythm()[target.id]?.spots ?? [];
    setSpotTimes(Object.fromEntries(rows.map((row) => [`${row.bar}-${row.degree}`, row.times])));
    hardRef.current.clear();
    loopPassRef.current = 0;
    stop();
    // 带着小节进来（v0.129.0）：重置完再圈，别被上面的 reset 清掉
    if (startBar) practiceBar(startBar, false);
  }, [target.id]);

  /** 谱面显示用的小节号：不循环时一直往下数，数到末尾绕回第 1 小节（v0.99.0）。 */
  const currentBar = loop ? bar : (bar % totalBars) + 1;

  return (
    <section className="follow" aria-label={`跟练：${target.name}`}>
      <header className="follow-head">
        <div>
          <h3>跟练 · {target.name}</h3>
          <p>
            {meter} · 起始 {bpm} BPM，目标 {target.bpm[1]} BPM
            {best ? ` · 之前最高 ${best} BPM` : ""}
          </p>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          收起
        </button>
      </header>

      <div className="follow-main">
        <div className="follow-tempo">
          <b>{bpm}</b>
          <span>BPM</span>
          {running ? (
            <em className="follow-bar">
              {countingIn ? "预备…" : `第 ${currentBar} 小节`}
            </em>
          ) : null}
          {running && !countingIn && degreeNow && degreeNow.degree > 0 ? (
            <em className="follow-degree">
              第 {degreeNow.degree} 级 · {degreeNow.name}
            </em>
          ) : null}
          {/* 读屏也听得到「现在第几级、下一个第几级」（v0.98.0） */}
          <span className="visually-hidden" role="status" aria-live="polite">
            {running && !countingIn && degreeNow && degreeNow.degree > 0
              ? `现在第 ${degreeNow.degree} 级${
                  degreeNext && degreeNext.degree > 0 ? `，下一个第 ${degreeNext.degree} 级` : ""
                }`
              : ""}
          </span>
        </div>

        {/* 级数方块单独一行（v0.98.0）：塞在 .follow-tempo 里会被挤成一条 */}
        {running && !countingIn && degrees.length >= 2 ? (
          <div className="follow-degrees" role="group" aria-label="这一段的级数，点一个就从那一小节反复练">
            {degrees.map((row, index) => {
              const bar = Math.floor(row.beat / target.tab.beatsPerBar) + 1;
              const active = index === degreeIndex;
              const hard =
                remembered !== null && remembered.bar === bar && remembered.degree === row.degree;
              const nowHard = hard && active;
              const base = active
                ? "follow-degree-chip on"
                : row.degree === 1
                  ? "follow-degree-chip lv1"
                  : row.degree === 5
                    ? "follow-degree-chip lv5"
                    : "follow-degree-chip";
              const className = `${base}${hard ? " hard" : ""}${nowHard ? " now-hard" : ""}`;
              return (
                <button
                  key={`${row.beat}-${index}`}
                  type="button"
                  className={className}
                  aria-pressed={active}
                  aria-label={`第 ${bar} 小节${row.degree > 0 ? `，第 ${row.degree} 级` : "，调外音"}${
                    hard ? "（上次最卡的地方）" : ""
                  }；点一下只反复练这一小节`}
                  onClick={() => practiceBar(bar)}
                >
                  {row.degree > 0 ? `${bar}·${row.degree}` : `${bar}·?`}
                </button>
              );
            })}
            {degreeNext ? (
              <em className="follow-next">
                下一个 {degreeNext.degree > 0 ? `第 ${degreeNext.degree} 级` : "调外音"}
              </em>
            ) : null}
            {remembered && running && !countingIn && currentBar === remembered.bar ? (
              <em className="follow-hard-note">
                就是这里：第 {remembered.bar} 小节第 {remembered.degree} 级（{remembered.name}）
                {remembered.count > 0 ? `，上次单独练了 ${remembered.count} 次` : ""}
              </em>
            ) : null}
            {loop && (loop.to - loop.from + 1) < totalBars ? (
              <em className="follow-loop-note">
                只练第 {loop.from === loop.to ? loop.from : `${loop.from}–${loop.to}`} 小节 · 练完{" "}
                {loopPasses} 遍自动接回整段
              </em>
            ) : null}
          </div>
        ) : null}

        <div className="follow-controls">
          <button
            type="button"
            className={running ? "btn primary" : "btn"}
            onClick={() => (running ? stop() : start())}
          >
            {running ? "停止" : "开始跟练"}
          </button>

          <label className="follow-field">
            <span>起始</span>
            <input
              type="number"
              min={30}
              max={220}
              step={1}
              value={startBpm}
              aria-label="起始速度（每分钟拍数）"
              onChange={(event) => {
                const value = Number(event.target.value);
                setStartBpm(value);
                setBpm(value);
              }}
            />
          </label>

          <label className="follow-field">
            <span>速度</span>
            <input
              type="range"
              min={30}
              max={220}
              step={1}
              value={bpm}
              aria-label="跟练速度（每分钟拍数）"
              onChange={(event) => setBpm(Number(event.target.value))}
            />
          </label>

          <label className="follow-field">
            <span>数拍</span>
            <select
              value={subdivision}
              aria-label="节拍器按几分音符数拍"
              onChange={(event) => setSubdivision(Number(event.target.value) as Subdivision)}
            >
              {([1, 2, 3, 4] as Subdivision[]).map((value) => (
                <option key={value} value={value}>
                  {SUBDIVISION_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="follow-check">
            <input
              type="checkbox"
              checked={ramp}
              onChange={(event) => {
                setRamp(event.target.checked);
                setBpm(startBpm);
              }}
            />
            自动加速
          </label>

          <label className="follow-field">
            <span>每</span>
            <select
              value={bars}
              aria-label="每几小节加速一次"
              disabled={!ramp}
              onChange={(event) => setBars(Number(event.target.value))}
            >
              {[2, 4, 8, 16].map((value) => (
                <option key={value} value={value}>
                  {value} 小节
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>加</span>
            <select
              value={step}
              aria-label="每次加速多少"
              disabled={!ramp}
              onChange={(event) => setStep(Number(event.target.value))}
            >
              {[2, 3, 5, 8, 10].map((value) => (
                <option key={value} value={value}>
                  {value} BPM
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>预备</span>
            <select
              value={countIn}
              aria-label="开始前空打几小节"
              onChange={(event) => setCountIn(Number(event.target.value))}
            >
              {[0, 1, 2].map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "不用" : `${value} 小节`}
                </option>
              ))}
            </select>
          </label>

          <label className="follow-check">
            <input
              type="checkbox"
              checked={loopOn}
              onChange={(event) => setLoopOn(event.target.checked)}
            />
            只练
          </label>

          <label className="follow-field">
            <span>练</span>
            <select
              value={loopPasses}
              aria-label="只练几遍后自动接回整段"
              disabled={!loopOn}
              onChange={(event) => setLoopPasses(Number(event.target.value))}
            >
              {LOOP_PASS_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value} 遍
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>第</span>
            <select
              value={loopFrom}
              aria-label="循环从第几小节开始"
              disabled={!loopOn}
              onChange={(event) => setLoopFrom(Number(event.target.value))}
            >
              {Array.from({ length: totalBars }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>到第</span>
            <select
              value={loopTo}
              aria-label="循环到第几小节结束"
              disabled={!loopOn}
              onChange={(event) => setLoopTo(Number(event.target.value))}
            >
              {Array.from({ length: totalBars }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="follow-field">
            <span>音量</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              aria-label="节拍器音量"
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
            />
            <b className="follow-volume">{volumeLabel(volume)}</b>
          </label>

          <span className="follow-clock" role="timer" aria-live="off">
            {clock(seconds)}
          </span>

          <button type="button" className="btn" onClick={finish} disabled={seconds === 0}>
            记录成绩
          </button>
        </div>
      </div>

      {done ? (
        <div className="follow-done" role="status">
          <p className="follow-done-text">
            记下了：{done.bpm} BPM
            {done.hardest
              ? ` · 这段最卡的是第 ${done.hardest.bar} 小节${degreeName(done.hardest.degree)}（${done.hardest.name}），点了 ${done.hardest.count} 次`
              : " · 这一段没有单独去练哪一小节"}
          </p>
          {done.hardest ? (
            <div className="follow-done-actions">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => saveHardestBar(done.hardest!)}
                disabled={savedSpots.includes(spotKey(done.hardest))}
              >
                {savedSpots.includes(spotKey(done.hardest))
                  ? "已存进「我的谱」"
                  : `把第 ${done.hardest.bar} 小节存成练习`}
              </button>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => addHardestToPlan(done.hardest!)}
                disabled={planSpots.includes(spotKey(done.hardest))}
              >
                {planSpots.includes(spotKey(done.hardest)) ? "已加进今日计划" : "加进今日计划"}
              </button>
              <span className="follow-done-note">
                存成练习的会进「我的谱」（能单独试听、跟练、导出）；加进计划的会出现在
                「练习」页最上面，练完也算今天的量。
              </span>
            </div>
          ) : null}

          {/* 这一次点了不止一处（v0.111.0）：其余几处收在下面，按小节分组，一处一份按钮 */}
          {done.spots.length > 1 ? (
            <div className="follow-spots">
              <button
                type="button"
                className="follow-spots-toggle"
                aria-expanded={spotsOpen}
                onClick={() => setSpotsOpen((open) => !open)}
              >
                <span>这次还点了另外 {done.spots.length - 1} 处</span>
                <span className="follow-spots-go">{spotsOpen ? "收起" : "展开"}</span>
              </button>
              {spotsOpen ? (
                <ol className="follow-spot-list">
                  {done.spots.slice(1).map((spot) => (
                    <li key={spotKey(spot)} className="follow-spot">
                      <span className="follow-spot-where">
                        第 {spot.bar} 小节 · {degreeName(spot.degree)}（{spot.name}）
                      </span>
                      <span className="follow-spot-count">点了 {spot.count} 次</span>
                      {(spotTimes[spotKey(spot)] ?? 0) > 0 ? (
                        <span className="follow-spot-times">
                          单独练过 {spotTimes[spotKey(spot)]} 次
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => practiceSpot(spot)}
                        title="把这一小节单独反复练，不用再回上面点方块"
                      >
                        只练这一处
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => saveHardestBar(spot)}
                        disabled={savedSpots.includes(spotKey(spot))}
                      >
                        {savedSpots.includes(spotKey(spot)) ? "已存" : "存成练习"}
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => addHardestToPlan(spot)}
                        disabled={planSpots.includes(spotKey(spot))}
                      >
                        {planSpots.includes(spotKey(spot)) ? "已加进计划" : "加进计划"}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <TabScore id={target.id} tab={target.tab} />

      {/*
        只圈一小节时，把那一小节单独放大一份（v0.130.0）。
        整条谱在跟练里常常要横向扫，眼睛跟不上；圈住的这一小节单独排一遍，看清该落哪根弦。
        `sliceTab` 按时值切，跨行的谱也只取这一段。
      */}
      {loopOn && loopFrom === loopTo ? (
        <div className="follow-zoom" data-zoom-bar={loopFrom}>
          <p className="follow-zoom-head">
            第 {loopFrom} 小节单独放大
            {zoomDegree ? ` · ${degreeName(zoomDegree.degree)}（${zoomDegree.name}）` : ""}
          </p>
          <TabScore
            id={`${target.id}-bar-${loopFrom}`}
            tab={sliceTab(target.tab, (loopFrom - 1) * target.tab.beatsPerBar, target.tab.beatsPerBar)}
            fluid
          />
        </div>
      ) : null}

      <p className="follow-hint">
        先跟着节拍器把这一遍弹稳；稳不住就按「停止」，把速度退回去再练。
        「记录成绩」只记当前速度，不判分——判断稳不稳的还是你的耳朵。拍号跟着练习走（
        {METERS.find((item) => item.id === meter)?.label ?? meter}）。
      </p>
    </section>
  );
}
