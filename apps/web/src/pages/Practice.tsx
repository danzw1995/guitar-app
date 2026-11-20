import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  DRILLS,
  FEELS,
  hardestTally,
  SESSION_MINUTES,
  STAGES,
  blockOf,
  buildSession,
  dateKeyOf,
  drillsOfStage,
  goalProgress,
  practiceStats,
  pushBpmPoint,
  recordBlock,
  REGRESS_BOOST_DAYS,
  regressedIds,
  stageForCompleted,
  stageOf,
  techniquesOf,
  weekSummaryOf,
  type DayLog,
  type Drill,
  type Feel,
  type PracticeLog,
} from "@guitar/core";
import {
  addPause,
  addSkip,
  loadPauses,
  pauseUntilOf,
  loadEar,
  loadPractice,
  loadProgress,
  loadRhythm,
  loadSettings,
  loadSkips,
  pausedOf,
  removePause,
  removeSkip,
  savePauses,
  savePractice,
  saveRhythm,
  saveSkips,
  skipsOf,
  type PauseLog,
  type RhythmRecords,
  type SkipLog,
} from "../lib/storage";
import { goTo, parseHash } from "../lib/nav";
import { earTrendOf } from "../lib/ear-trend";
import {
  addExtra,
  loadClosedGroups,
  loadDoneTitles,
  loadExtras,
  markDoneTitle,
  moveExtra,
  removeExtra,
  reorderExtras,
  saveClosedGroups,
  unmarkDoneTitle,
  type PlanExtra,
} from "../lib/plan";
import {
  applyItems,
  freshFirst,
  applySet,
  loadSets,
  removeSet,
  saveSet,
  type PlanSet,
} from "../lib/plan-sets";
import Metronome from "../components/Metronome";
import TabScore from "../components/TabScore";
import FollowAlong, { type FollowTarget } from "../components/FollowAlong";
import UndoToast from "../components/UndoToast";
import { useTone } from "../hooks/useTone";
import { meterOfTab } from "../lib/meter";

/** 秒 → mm:ss。 */
function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 一条加餐属于哪个分组（v0.109.0）。
 *
 * 练习库加进来的带 `stage`（v0.107.0 起），「我的谱」加的、跟练里切出来的小节没有，
 * 统一归到「其他」——分组只影响显示，`extras` 的顺序就是用户拖出来的顺序。
 * 从组合加进来的先按组合名归（v0.115.0）：同一套的条目摆在一起，比按阶段更贴近用户心里的分组。
 */
function groupKeyOf(extra: PlanExtra): string {
  if (extra.setName) return `set-${extra.setName}`;
  return typeof extra.stage === "number" ? `stage-${extra.stage}` : "other";
}

/**
 * 今日练习：先选阶段，再按「今天有多少时间」生成计划。
 *
 * 三个刻意的设计：
 * 1. 阶段是**内容的差别**，不是时间配比的差别——每个阶段有自己的品域、时值和技巧；
 * 2. 每条练习都带六线谱，不用看文字猜"3→5"是什么意思；
 * 3. 页面下半部分是**这个阶段的全部练习**，计划只是今天从里面挑的几条。
 */
export default function Practice() {
  const today = dateKeyOf(new Date());

  const [log, setLog] = useState<PracticeLog>(() => loadPractice());
  const [minutes, setMinutes] = useState(60);
  const [stage, setStage] = useState(() => {
    const progress = loadProgress();
    const completed = Object.values(progress).filter((item) => item.completed).length;
    return stageForCompleted(completed);
  });
  const [hand, setHand] = useState<"left" | "right">("left");

  const [runningId, setRunningId] = useState<string | null>(null);
  /** 刚勾完一块、被滚到眼前的那一块（亮一下边框，1.6 秒后恢复）。 */
  const [nextId, setNextId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const { playTab } = useTone();
  const [playhead, setPlayhead] = useState<{ id: string; beat: number } | null>(null);
  const [records, setRecords] = useState<RhythmRecords>(() => loadRhythm());
  const [follow, setFollow] = useState<FollowTarget | null>(null);
  const [skips, setSkips] = useState<SkipLog>(() => loadSkips());
  const [pauses, setPauses] = useState<PauseLog>(() => loadPauses());
  /** 今天自己加的计划（跟练里切出来的那一小节，v0.102.0）。 */
  const [extras, setExtras] = useState<PlanExtra[]>(() => loadExtras(today));
  /** 正在拖的那一条（v0.105.0）：拖到另一条身上就按落点重排。 */
  const [dragId, setDragId] = useState<string | null>(null);
  /** 拖到谁身上、插在它前面还是后面（v0.106.0）：用来画那条插入线。 */
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  /** 拖到列表末尾那条落点上（v0.107.0）。 */
  const [dropEnd, setDropEnd] = useState(false);
  /** 手机上长按「拿起来」的那一条（v0.108.0）：触摸屏没有拖拽，长按之后点另一条就挪过去。 */
  const [heldId, setHeldId] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  /** 存下来的「今天这一套」（v0.112.0）：明天点一下就能把同一套加回计划。 */
  const [sets, setSets] = useState<PlanSet[]>(() => loadSets());
  const [namingSet, setNamingSet] = useState(false);
  const [setName, setSetName] = useState("");
  const [setNotice, setSetNotice] = useState("");
  /** 点组合时只加今天还没练过的那几条（v0.113.0）。 */
  const [skipDone, setSkipDone] = useState(false);

  /** 今天已经练过的加餐标题：「只加没练过的」按标题比（组合里存的是标题 + 谱，没有 id）。 */
  const doneTitles = useMemo(() => {
    const done = new Set(log[today]?.done ?? []);
    const fromPlan = extras.filter((extra) => done.has(extra.id)).map((extra) => extra.title);
    return new Set([...loadDoneTitles(today), ...fromPlan]);
  }, [log, today, extras]);
  /** 刚跳过的哪一条（底部提示 + 撤销）。`paused` = 已经升级成「这一周先不练」。 */
  const [undo, setUndo] = useState<{ id: string; label: string; paused?: boolean } | null>(null);
  /** 刚撤回的「今天练过」（v0.117.0）：底部提示条里再点「撤销」能把它打回去。 */
  const [undoDone, setUndoDone] = useState<{ id: string; title: string } | null>(null);

  /** 试听一条练习：谱面上会跟着走一条「当前拍」竖条，和节奏页同一套播放头。 */
  function audition(id: string, tab: (typeof library)[number]["tab"], bpm: number) {
    setPlayhead({ id, beat: 0 });
    playTab(tab, bpm, {
      onBeat: (beat) => setPlayhead(beat < 0 ? null : { id, beat }),
    });
  }

  const beatOf = (id: string) => (playhead?.id === id ? playhead.beat : null);

  /**
   * 跟练：节拍器起速、每几小节往上加，练完记下当前速度。
   *
   * 成绩存在节奏页同一张表里，但键加了 `p:` 前缀——练习页的条目和节奏页的
   * 103 条分开数，统计页的「节奏与伴奏」也不会把它们算进去。
   */
  const followKey = (id: string) => `p:${id}`;
  const best = (key: string) => records[key]?.bestBpm;

  function openFollow(drill: Drill) {
    setFollow({
      id: followKey(drill.id),
      name: drill.name,
      bpm: drill.bpm ?? [70, 90],
      tab: drill.tab,
      meter: meterOfTab(drill.tab),
    });
  }

  /** 跟练「今天自己加的」那一条：键用 `p:` 前缀之外再加 `extra:`，免得和练习库的 id 撞。 */
  function openExtra(extra: PlanExtra) {
    setFollow({
      id: `p:${extra.id}`,
      name: extra.title,
      bpm: [extra.bpm, extra.bpm + 40],
      tab: extra.tab,
      meter: extra.meter,
    });
  }

  /**
   * 练习库里任意一条 → 「今天自己加的」（v0.103.0）。
   *
   * 计划每天只挑 4 条，剩下的想练就自己加：加进来的和跟练切出来的那条
   * 走同一套 `guitar.plan.v1`，一样能试听、跟练、勾掉，只是不进计划的分母。
   */
  function addToPlan(drill: Drill) {
    const next = addExtra(
      {
        title: drill.name,
        tab: drill.tab,
        meter: meterOfTab(drill.tab),
        bpm: drill.bpm ? drill.bpm[0] : 70,
        // 记下它属于哪个阶段（v0.107.0），统计页才能按阶段算「加餐练了多久」
        stage: drill.stage,
      },
      today,
    );
    setExtras(next);
  }

  /** 加餐调顺序（v0.105.0）：↑↓ 给键盘和手机，拖拽给鼠标。 */
  function moveExtraBy(id: string, delta: number) {
    setExtras(moveExtra(id, delta, today));
  }

  /** 把「今天这一套」存成一个组合（v0.112.0）：同名覆盖，最多 5 套。 */
  function storeSet() {
    if (extras.length === 0) return;
    setSets(
      saveSet(
        setName,
        extras.map((extra) => ({
          title: extra.title,
          tab: extra.tab,
          meter: extra.meter,
          bpm: extra.bpm,
          ...(typeof extra.stage === "number" ? { stage: extra.stage } : {}),
        })),
      ),
    );
    setNamingSet(false);
    setSetName("");
    setSetNotice("存好了——明天点一下这套，就能把同样的几条加回计划。");
  }

  /**
   * 点一套组合：把里面还没加过的加进今天的计划（v0.112.0）。
   * v0.113.0：开了「只加没练过的」就先筛掉今天已勾的。
   * v0.114.0：没开这个开关时，今天练过的排到最后（一条不少，只是先练新的）。
   */
  function useSet(set: PlanSet) {
    const ordered = freshFirst(set.items, doneTitles);
    const moved = ordered.filter((item) => doneTitles.has(item.title)).length;
    const items = skipDone
      ? ordered.filter((item) => !doneTitles.has(item.title))
      : ordered;
    const added = applyItems(items, today, set.name);
    setExtras(loadExtras(today));
    window.dispatchEvent(new Event("guitar:plan"));
    if (skipDone && added === 0) {
      setSetNotice(`「${set.name}」里今天已经都练过了。`);
      return;
    }
    setSetNotice(
      added > 0
        ? `「${set.name}」加进来 ${added} 条${
            skipDone ? "（跳过今天练过的）" : moved > 0 ? "（今天练过的排到了后面）" : ""
          }。`
        : `「${set.name}」里的几条今天已经在计划里了。`,
    );
  }

  function dropSet(id: string) {
    setSets(removeSet(id));
    setSetNotice("");
  }

  /** 拖到另一条身上：按落点重排，落点之后的整体后移。`after` 决定插在它前面还是后面。 */
  function dropExtraOn(targetId: string, after: boolean) {
    if (!dragId || dragId === targetId) return;
    const ids = extras.map((item) => item.id);
    const from = ids.indexOf(dragId);
    const anchor = ids.indexOf(targetId);
    if (from < 0 || anchor < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    const at = next.indexOf(targetId);
    next.splice(after ? at + 1 : at, 0, dragId);
    setExtras(reorderExtras(next, today));
    setDragId(null);
    setDropAt(null);
  }

  /** 拖到列表末尾（v0.107.0）：最后一块的下半部分往往够不到，单独留一条落点。 */
  function dropExtraAtEnd() {
    if (!dragId) return;
    const ids = extras.map((item) => item.id).filter((id) => id !== dragId);
    ids.push(dragId);
    setExtras(reorderExtras(ids, today));
    setDragId(null);
    setDropAt(null);
    setDropEnd(false);
  }

  /**
   * 长按「拿起来」（v0.108.0）。
   *
   * 触摸屏上 HTML5 拖拽基本用不了（要长按再拖，浏览器还会抢去做滚动 / 菜单），
   * 所以手机上换一套动作：按住 420ms 拿起来，再点另一条，那条就插到目标前面。
   * 按到按钮上不算——不然点「试听」也会误判成长按。
   */
  function startHold(id: string, target: EventTarget | null) {
    if (target instanceof Element && target.closest("button, input, select, textarea, a")) return;
    cancelHold();
    holdTimer.current = window.setTimeout(() => {
      setHeldId(id);
      holdTimer.current = null;
    }, 420);
  }

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  /** 拿着的那一条插到 `targetId` 前面。 */
  function moveHeldBefore(targetId: string) {
    if (!heldId) return;
    if (heldId === targetId) {
      setHeldId(null);
      return;
    }
    const ids = extras.map((item) => item.id).filter((id) => id !== heldId);
    const at = ids.indexOf(targetId);
    if (at < 0) return;
    ids.splice(at, 0, heldId);
    setExtras(reorderExtras(ids, today));
    setHeldId(null);
  }

  useEffect(() => cancelHold, []);

  /**
   * 加餐按阶段分组（v0.108.0）：列表顺序不动，只在换组的地方插一行小标题。
   * 小标题右边带这一组有几条、加起来练过几分钟（v0.110.0）——收起之后至少还知道这组多少量。
   */
  const extraGroups = useMemo(() => {
    const minutesOf = (id: string) => records[`p:${id}`]?.minutes ?? 0;
    return extras.map((extra, index) => {
      const key = groupKeyOf(extra);
      const previous = index === 0 ? null : groupKeyOf(extras[index - 1]);
      if (index === 0 || key !== previous) {
        let count = 0;
        let minutes = 0;
        for (let i = index; i < extras.length && groupKeyOf(extras[i]) === key; i += 1) {
          count += 1;
          minutes += minutesOf(extras[i].id);
        }
        return {
          key,
          count,
          minutes,
          heading:
            typeof extra.setName === "string" && extra.setName
              ? `组合 · ${extra.setName}`
              : typeof extra.stage === "number"
                ? `第 ${extra.stage + 1} 阶段 · ${stageOf(extra.stage).name}`
                : "其他 · 自己存的谱、跟练里切的",
        };
      }
      return null;
    });
  }, [extras, records]);

  /** 收起某一组（v0.109.0）：只影响显示，数据顺序不动，展开还是原来的位置。收起的组记在本机（v0.110.0）。 */
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>(() => loadClosedGroups());

  useEffect(() => {
    saveClosedGroups(closedGroups);
  }, [closedGroups]);

  function toggleGroup(key: string) {
    setClosedGroups((previous) => ({ ...previous, [key]: !previous[key] }));
    // 收起的时候如果手里还拿着这一组里的某一条，直接放下，免得它被藏起来之后没法放回去
    if (heldId && extras.some((item) => item.id === heldId && groupKeyOf(item) === key)) {
      setHeldId(null);
    }
  }

  /** 「换一条」：今天先不练这条，计划会从同一块里挑下一条。 */
  function swapBlock(id: string) {
    const label = session.blocks.find((block) => block.drill.id === id)?.drill.name ?? id;
    const next = addSkip(skips, today, id);
    saveSkips(next);
    setSkips(next);
    setUndo({ id, label });
  }

  /** 提示里的第二条出路：这条这一周都别再排进来。 */
  function pauseBlock() {
    if (!undo) return;
    const next = addPause(pauses, undo.id, today);
    savePauses(next);
    setPauses(next);
    setUndo({ ...undo, paused: true });
  }

  /** 点错了就撤销：跳过和压后一起撤，计划马上回到原来那条。 */
  function undoSkip() {
    if (!undo) return;
    const nextSkip = removeSkip(skips, today, undo.id);
    const nextPause = removePause(pauses, undo.id);
    saveSkips(nextSkip);
    savePauses(nextPause);
    setSkips(nextSkip);
    setPauses(nextPause);
    setUndo(null);
  }

  /**
   * 「只练这一处」记一笔（v0.113.0）：写在跟练那条记录的 `spots` 里。
   *
   * 不另开一条 `p:spot-…` 记录——那串 id 会跑进统计页的曲线和「最卡的地方」，
   * 名字解析不出来，只剩一串机器名。挂在原来那条下面，语义也对：这一处单独练过几次。
   */
  function recordSpot(hit: { bar: number; degree: number; name: string }) {
    if (!follow) return;
    const previous = records[follow.id];
    const spots = [...(previous?.spots ?? [])];
    const index = spots.findIndex((spot) => spot.bar === hit.bar && spot.degree === hit.degree);
    if (index >= 0) {
      spots[index] = { ...spots[index], times: spots[index].times + 1, lastAt: today };
    } else {
      spots.push({ bar: hit.bar, degree: hit.degree, name: hit.name, times: 1, lastAt: today });
    }
    const next: RhythmRecords = {
      ...records,
      [follow.id]: {
        bestBpm: previous?.bestBpm ?? 0,
        sessions: previous?.sessions ?? 0,
        minutes: previous?.minutes ?? 0,
        lastAt: previous?.lastAt ?? today,
        ...(previous?.history ? { history: previous.history } : {}),
        ...(previous?.hardest ? { hardest: previous.hardest } : {}),
        ...(previous?.title ? { title: previous.title } : {}),
        spots: spots.slice(-6),
      },
    };
    setRecords(next);
    saveRhythm(next);
  }

  function recordFollow(result: {
    bpm: number;
    minutes: number;
    hardest?: { bar: number; degree: number; name: string; count: number };
  }) {
    if (!follow) return;
    const previous = records[follow.id];
    const next: RhythmRecords = {
      ...records,
      [follow.id]: {
        bestBpm: Math.max(previous?.bestBpm ?? 0, result.bpm),
        sessions: (previous?.sessions ?? 0) + 1,
        minutes: (previous?.minutes ?? 0) + result.minutes,
        lastAt: today,
        history: pushBpmPoint(previous?.history, today, result.bpm),
        ...(result.hardest ? { hardest: result.hardest } : previous?.hardest ? { hardest: previous.hardest } : {}),
        // 加餐的名字跟着记录走（v0.104.0）：计划表第二天就清空，
        // 不存名字的话统计页「最卡的地方」过一天只剩 `p:extra-…` 这种 id
        ...(follow.id.startsWith("p:extra-") ? { title: follow.name } : {}),
      },
    };
    setRecords(next);
    saveRhythm(next);

    // 跟练的时长也算今天的练习量：用 `p:` 这个块记，和「计时/完成」记的不冲突
    commit(
      recordBlock(log, today, {
        drill: follow.id,
        minutes: result.minutes,
        stage,
      }),
    );

    // 「今天自己加的」那一条：跟练完直接算勾掉（v0.103.0），
    // 用户不用再回上去点一次「完成」——记成绩本身就是练完了。
    if (follow.id.startsWith("p:extra-")) {
      commit(
        recordBlock(log, today, {
          drill: follow.id.slice(2),
          minutes: result.minutes,
          stage,
        }),
      );
      markDoneTitle(follow.name, today);
    }
  }

  const stageDef = stageOf(stage);
  const library = useMemo(() => drillsOfStage(stage), [stage]);

  // 从乐理课「练一练」跳过来的：那条练习可能在别的阶段，先把阶段切过去，
  // 否则卡片根本没渲染，滚动就找不到目标。
  useEffect(() => {
    const route = parseHash(window.location.hash);
    const id = route?.target?.replace(/^drill-/, "");
    if (!id) return;
    const drill = DRILLS.find((item) => item.id === id);
    if (drill && drill.stage !== stage) setStage(drill.stage);
    // 只在进来时看一次 hash；之后用户自己切阶段不该被拉回去
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 跟练速度退步的练习（`p:` 前缀的记录）加几天紧迫度，让它们先回来
  const boost = useMemo(() => {
    const map = new Map<string, number>();
    for (const key of regressedIds(records)) {
      if (key.startsWith("p:")) map.set(key.slice(2), REGRESS_BOOST_DAYS);
    }
    return map;
  }, [records]);
  // 今天点了「换一条」的练习，加上「这一周先不练」的：计划里都先跳过
  const skip = useMemo(
    () => new Set([...skipsOf(skips, today), ...pausedOf(pauses, today)]),
    [skips, pauses, today],
  );
  const session = useMemo(
    () =>
      buildSession({
        minutes,
        stage,
        date: today,
        log,
        boost,
        skip,
        freeze: pauseUntilOf(pauses),
      }),
    [minutes, stage, today, log, boost, skip, pauses],
  );
  const stats = useMemo(() => practiceStats(log, today), [log, today]);
  // 本周目标（统计页设的）：练的时候也看得见，不然目标只在统计页当摆设
  const weekGoal = loadSettings().weeklyGoal;
  const weekGoalState = useMemo(
    () => goalProgress(weekSummaryOf(log, today).minutes, weekGoal),
    [log, weekGoal],
  );
  // 听辨正确率的走向：练习页也放一条，省得为了看趋势切到统计页
  const earTrend = earTrendOf(loadEar());
  // 最近一周最卡的那一级：跟练时单练得最多的那处，和统计页同一套归堆（core 的 hardestTally）
  const hardTally = useMemo(() => hardestTally(records, addDays(today, -6)), [records, today]);

  const day: DayLog | undefined = log[today];
  const done = new Set(day?.done ?? []);
  const goal = day?.goal ?? "";
  const feel = day?.feel;
  const doneCount = session.blocks.filter((block) => done.has(block.drill.id)).length;

  useEffect(() => {
    if (!runningId) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [runningId]);

  // 亮一下就走：滚过去的那一块 1.6 秒后恢复原样，免得整页一直有个高亮
  useEffect(() => {
    if (!nextId) return;
    const timer = window.setTimeout(() => setNextId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [nextId]);

  // 在跟练面板里点「加进今日计划」时，这一页要立刻多出那一条
  useEffect(() => {
    const reload = () => setExtras(loadExtras(today));
    window.addEventListener("guitar:plan", reload);
    return () => window.removeEventListener("guitar:plan", reload);
  }, [today]);

  function commit(next: PracticeLog) {
    setLog(next);
    savePractice(next);
  }

  /** 改当天的目标或感受：不动练习时长。 */
  function patchDay(patch: Partial<DayLog>) {
    const current = log[today] ?? { minutes: 0, stage, done: [] };
    commit({ ...log, [today]: { ...current, ...patch, stage } });
  }

  function start(id: string) {
    if (runningId === id) {
      setRunningId(null);
      return;
    }
    setRunningId(id);
    setSeconds(0);
  }

  /**
   * 勾掉「今天自己加的」那一条（v0.103.0）。
   *
   * 和计划里的块走同一本账（`done` 里存 id、分钟数进当天），所以统计页的
   * 「练了几天 / 多少分钟」都算上它；但它不进计划的分母，属于加餐。
   */
  function finishExtra(extra: PlanExtra) {
    const used = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 1;
    commit(recordBlock(log, today, { drill: extra.id, minutes: used, stage }));
    // 记一笔「今天练过这一条」（v0.113.0）：删掉之后点组合还能知道它练过
    markDoneTitle(extra.title, today);
    // 组合里的那条勾完挪到同组最后（v0.116.0）：没练的留在前面，眼动的顺序跟着走
    sinkInSet(extra);
    setRunningId(null);
    setSeconds(0);
  }

  /** 勾掉一条组合里的加餐之后，把它挪到同一套的最后面（v0.116.0）。 */
  function sinkInSet(extra: PlanExtra) {
    if (!extra.setName) return;
    const sameSet = extras.filter((item) => item.setName === extra.setName);
    const last = sameSet[sameSet.length - 1];
    if (!last || last.id === extra.id) return;
    const ids = extras.map((item) => item.id).filter((id) => id !== extra.id);
    ids.splice(ids.indexOf(last.id) + 1, 0, extra.id);
    setExtras(reorderExtras(ids, today));
  }

  /**
   * 撤回「今天练过」（v0.116.0）：点那枚标签就是「我还没练完 / 点错了」。
   *
   * 只把「做完」这个勾去掉，**分钟数不退回**——练的时间花都花了，退回分钟反而像在改账；
   * 同时把 `guitar.plan.done.v1` 里那条标题去掉，否则「只加没练过的」还会把它当练过。
   */
  function undoExtra(extra: PlanExtra) {
    const day = log[today];
    if (day?.done.includes(extra.id)) {
      const next = { ...log, [today]: { ...day, done: day.done.filter((id) => id !== extra.id) } };
      setLog(next);
      savePractice(next);
    }
    unmarkDoneTitle(extra.title, today);
    if (runningId === extra.id) {
      setRunningId(null);
      setSeconds(0);
    }
    // 撤错了还能点回来（v0.117.0）：提示条留 6 秒，撤销只把勾打回去，分钟数本来就没退
    setUndoDone({ id: extra.id, title: extra.title });
  }

  /** 「撤销」刚才那次撤回：把 id 打回当天日志、标题也记回「今天练过」。 */
  function redoExtraDone() {
    if (!undoDone) return;
    const day = log[today];
    const next = {
      ...log,
      [today]: day
        ? { ...day, done: [...day.done, undoDone.id] }
        : { minutes: 0, stage, done: [undoDone.id] },
    };
    setLog(next);
    savePractice(next);
    markDoneTitle(undoDone.title, today);
    setUndoDone(null);
  }

  /** 「去练这一条」（v0.118.0）：把撤回的那块滚到眼前——撤回是为了重练，不是为了把它藏起来。
   *  v0.119.0 起顺手按开始计时：既然下一步就是练，别再让人多点一次。 */
  function goUndone() {
    if (!undoDone) return;
    const el = document.getElementById(undoDone.id);
    setUndoDone(null);
    setRunningId(undoDone.id);
    setSeconds(0);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    window.setTimeout(() => el.classList.remove("flash"), 1200);
  }

  function finish(drillId: string, planned: number) {
    // 没用计时器也允许打勾：按计划时长记，别惩罚"忘了按开始"的人
    const used = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : planned;
    commit(recordBlock(log, today, { drill: drillId, minutes: used, stage }));
    setRunningId(null);
    setSeconds(0);
    // 勾完一块就滚到下一块：练的时候不用自己找「接下来练哪」
    const next = session.blocks.find((block) => block.drill.id !== drillId && !done.has(block.drill.id));
    if (next) {
      setNextId(next.drill.id);
      window.requestAnimationFrame(() => {
        document
          .querySelector(`[data-block="${next.drill.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>今日练习</h2>
        <p>
          六个阶段，从「每个音都干净」到「能完整弹一段」。每个阶段有自己的品域、时值和技巧，
          每条练习都配六线谱——先看谱，再上手。
        </p>
      </div>

      {weekGoal > 0 && (
        <button
          type="button"
          className="week-goal"
          onClick={() => goTo("stats")}
          title="去统计页改本周目标"
          aria-label={
            weekGoalState.reached
              ? `本周目标 ${weekGoalState.goal} 分钟已达成；点一下去统计页改`
              : `本周目标 ${weekGoalState.goal} 分钟，已完成 ${weekGoalState.percent}%，还差 ${weekGoalState.remaining} 分钟；点一下去统计页改`
          }
        >
          <span className="week-goal-text">
            本周 {weekGoalState.done} / {weekGoalState.goal} 分钟
          </span>
          <span
            className="week-goal-bar"
            aria-hidden="true"
            data-percent={weekGoalState.percent}
          >
            <span style={{ width: `${weekGoalState.percent}%` }} />
          </span>
          <span className="week-goal-note">
            {weekGoalState.reached ? "这周目标达成了" : `还差 ${weekGoalState.remaining} 分钟`}
          </span>
        </button>
      )}

      {earTrend.spark && (
        <div className="ear-trend ear-trend-compact">
          <svg
            className="curve-svg"
            viewBox="0 0 120 30"
            role="img"
            aria-label={`听辨最近 ${earTrend.days.length} 个练习日的正确率：从 ${earTrend.rates[0]}% 到 ${earTrend.rates[earTrend.rates.length - 1]}%`}
          >
            <path d={earTrend.spark.d} />
            <circle
              cx={earTrend.spark.dots[earTrend.spark.dots.length - 1].x}
              cy={earTrend.spark.dots[earTrend.spark.dots.length - 1].y}
              r={2}
            />
          </svg>
          <span className="muted">
            听辨 最近 {earTrend.days.length} 个练习日 {earTrend.rates[0]}% →{" "}
            {earTrend.rates[earTrend.rates.length - 1]}%
          </span>
          <button type="button" className="btn-quiet" onClick={() => goTo("ear")}>
            去练听辨
          </button>
        </div>
      )}

      {hardTally[0] && (
        <button
          type="button"
          className="practice-hardest"
          onClick={() => goTo("stats")}
          title="去统计页看最卡的地方"
        >
          <span>
            最近最卡的是<b>第 {hardTally[0].degree} 级（{hardTally[0].name}）</b> ·{" "}
            {hardTally[0].items} 条练习里单独练过 {hardTally[0].count} 次
          </span>
          <span className="practice-hardest-go" aria-hidden="true">
            看统计 →
          </span>
        </button>
      )}

      {follow && (
        <FollowAlong
          target={follow}
          best={best(follow.id)}
          onFinish={recordFollow}
          onSpot={recordSpot}
          onClose={() => setFollow(null)}
        />
      )}

      {/* ---------- 阶段 ---------- */}
      <ol className="stage-track" aria-label="练习阶段">
        {STAGES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === stage ? "stage-btn on" : "stage-btn"}
              aria-current={item.id === stage ? "step" : undefined}
              onClick={() => setStage(item.id)}
            >
              <span className="stage-no">S{item.id}</span>
              <span className="stage-name">{item.name}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="stage-info">
        <p className="stage-focus">{stageDef.focus}</p>
        <ul className="stage-new">
          {stageDef.newSkills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
        <p className="stage-meta">
          品域 <b>{stageDef.range}</b> · 速度 <b>{stageDef.bpm}</b> BPM · 本阶段 {library.length} 条练习
          <br />
          升级门槛：{stageDef.gate}
        </p>
      </div>

      {/* ---------- 今天的计划 ---------- */}
      <h3 className="practice-h3">今天的计划</h3>
      <div className="practice-bar">
        <label className="practice-field">
          <span>今天能练</span>
          <select
            value={minutes}
            aria-label="今天能练多少分钟"
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {SESSION_MINUTES.map((value) => (
              <option key={value} value={value}>
                {value} 分钟
              </option>
            ))}
          </select>
        </label>

        <label className="practice-field grow">
          <span>今天的唯一目标</span>
          <input
            type="text"
            value={goal}
            placeholder={stageDef.focus}
            onChange={(event) => patchDay({ goal: event.target.value })}
          />
        </label>

        <label className="practice-field">
          <span>手感</span>
          <select
            value={feel ?? ""}
            aria-label="今天的手感"
            onChange={(event) =>
              patchDay({ feel: (event.target.value || undefined) as Feel | undefined })
            }
          >
            <option value="">还没评</option>
            {FEELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="practice-summary">
        <span>
          连续 <b>{stats.streak}</b> 天
        </span>
        <span>
          本周 <b>{stats.weekTotal}</b> 分钟
        </span>
        <span>
          今天 <b>{day?.minutes ?? 0}</b> 分钟
        </span>
        <span>
          {doneCount}/{session.blocks.length} 块
        </span>
      </div>

      <div
        className="practice-progress"
        role="progressbar"
        aria-label="今天完成了几块"
        aria-valuemin={0}
        aria-valuemax={session.blocks.length}
        aria-valuenow={doneCount}
      >
        <span style={{ width: `${(doneCount / session.blocks.length) * 100}%` }} />
      </div>

      {doneCount === session.blocks.length && session.blocks.length > 0 && (
        <p className="practice-all-done">
          今天的计划做完了{weekGoalState.reached ? "，本周目标也达成了" : ""}。想再练一会儿，就去下面练习库里挑一条——明天的计划会按今天练过的重新排。
        </p>
      )}

      <details className="practice-metronome" open>
        <summary>节拍器（每一块都该开）</summary>
        <Metronome />
      </details>

      <ol className="practice-list">
        {session.blocks.map((block, index) => {
          const drill = block.drill;
          const isDone = done.has(drill.id);
          const running = runningId === drill.id;
          return (
            <li
              key={drill.id}
              data-block={drill.id}
              className={`practice-block${isDone ? " done" : ""}${running ? " running" : ""}${
                nextId === drill.id ? " next" : ""
              }`}
            >
              <div className="pb-head">
                <span className="pb-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="pb-title">
                  <h4>
                    {blockOf(block.block).label} · {drill.name}
                  </h4>
                  <p className="pb-meta">
                    {block.minutes} 分钟
                    {drill.bpm ? ` · ${drill.bpm[0]}–${drill.bpm[1]} BPM` : ""}
                    {isDone ? " · 已完成" : ""}
                  </p>
                  <p className="pb-due">
                    {[
                      block.lastAt ? `上次练 ${block.days} 天前` : "还没练过，今天先见一面",
                      block.boost ? "跟练速度退步了，先补上" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="pb-timer" role="timer" aria-live="off">
                  {clock(running ? seconds : 0)}
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => audition(drill.id, drill.tab, drill.bpm ? drill.bpm[0] : 70)}
                >
                  试听
                </button>
                <button type="button" className="btn-quiet" onClick={() => openFollow(drill)}>
                  跟练
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => swapBlock(drill.id)}
                  title="今天先不练这条，换一条"
                >
                  换一条
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => start(drill.id)}
                  aria-pressed={running}
                >
                  {running ? "暂停" : "计时"}
                </button>
                <button
                  type="button"
                  className={isDone ? "btn" : "btn primary"}
                  onClick={() => finish(drill.id, block.minutes)}
                  disabled={isDone}
                >
                  {isDone ? "已勾" : "完成"}
                </button>
              </div>

              <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />

              <div className="pb-side">
                <p className="pb-line">
                  <b>验收</b>：{drill.pass}
                </p>
                <details className="pb-more">
                  <summary>怎么练 · 常见错误</summary>
                  <ol className="pb-steps">
                    {drill.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="pb-line">
                    <b>常见错误</b>：{drill.mistake}
                  </p>
                </details>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 加餐为空时也留着这一块：存过的组合还得能点回来（v0.112.0） */}
      {(extras.length > 0 || sets.length > 0) && (
        <>
          <h3 className="practice-h3" id="practice-extras">
            {extras.length > 0 ? `今天自己加的 ${extras.length} 条` : "今天还没自己加"}
            <span className="practice-h3-hint">
              跟练里切出来的那一小节 / 练习库里加的，练完也算今天的量
            </span>
          </h3>
          {heldId && (
            <p className="extras-held" role="status">
              已拿起「{extras.find((item) => item.id === heldId)?.title ?? ""}」：点另一条放到它前面，点自己取消。
            </p>
          )}
          {/* 存成组合（v0.112.0）：计划表每天清空，这套安排明天大概还想要 */}
          <div className="plan-sets">
            <span className="plan-sets-label">今天这一套</span>
            {sets.map((set) => (
              <span key={set.id} className="set-pill">
                <button
                  type="button"
                  className="set-apply"
                  onClick={() => useSet(set)}
                  title={`把「${set.name}」里的 ${set.items.length} 条加进今天的计划`}
                >
                  {set.name}
                </button>
                <button
                  type="button"
                  className="set-del"
                  aria-label={`删掉组合「${set.name}」`}
                  onClick={() => dropSet(set.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {!namingSet && extras.length > 0 && (
              <button
                type="button"
                className="chip set-save"
                onClick={() => setNamingSet(true)}
              >
                存成组合
              </button>
            )}
            {sets.length > 0 && (
              <button
                type="button"
                className="chip set-skip"
                aria-pressed={skipDone}
                title="点组合时把今天已经勾掉的那几条跳过去"
                onClick={() => setSkipDone(!skipDone)}
              >
                只加没练过的
              </button>
            )}
            {namingSet && (
              <span className="set-namer">
                <input
                  type="text"
                  className="set-name"
                  value={setName}
                  maxLength={12}
                  placeholder={`${extras.length} 条`}
                  aria-label="给这一套起个名字"
                  onChange={(event) => setSetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") storeSet();
                    if (event.key === "Escape") {
                      setNamingSet(false);
                      setSetName("");
                    }
                  }}
                />
                <button type="button" className="chip set-save" onClick={storeSet}>
                  存
                </button>
                <button
                  type="button"
                  className="btn-quiet set-cancel"
                  onClick={() => {
                    setNamingSet(false);
                    setSetName("");
                  }}
                >
                  取消
                </button>
              </span>
            )}
          </div>
          {setNotice && <p className="plan-sets-note">{setNotice}</p>}
          <ol className="practice-list practice-extras">
            {extras.map((extra, index) => {
              const extraDone = done.has(extra.id);
              const extraRunning = runningId === extra.id;
              const heading = extraGroups[index];
              const held = heldId === extra.id;
              const collapsed = heading ? closedGroups[heading.key] === true : false;
              return (
                <Fragment key={extra.id}>
                  {heading && (
                    <li className="extras-group">
                      <button
                        type="button"
                        className="extras-group-toggle"
                        aria-expanded={!collapsed}
                        onClick={() => toggleGroup(heading.key)}
                      >
                        <span>{heading.heading}</span>
                        <span className="extras-group-meta">
                          {heading.count} 条
                          {heading.minutes > 0 ? ` · ${heading.minutes} 分钟` : ""}
                        </span>
                        <span className="extras-group-go">{collapsed ? "展开" : "收起"}</span>
                      </button>
                    </li>
                  )}
                <li
                  id={extra.id}
                  hidden={collapsed}
                  className={`practice-block practice-extra${extraDone ? " done" : ""}${
                    dragId === extra.id ? " dragging" : ""
                  }${held ? " held" : ""}${heldId && !held ? " droppable" : ""}`}
                  draggable
                  onDragStart={() => setDragId(extra.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropAt(null);
                  }}
                  onPointerDown={(event) => {
                    if (!heldId) startHold(extra.id, event.target);
                  }}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onClick={(event) => {
                    if (!heldId) return;
                    if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a")) {
                      setHeldId(null);
                      return;
                    }
                    moveHeldBefore(extra.id);
                  }}
                  onContextMenu={(event) => {
                    if (heldId) event.preventDefault();
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientY > rect.top + rect.height / 2;
                    if (dropAt?.id !== extra.id || dropAt.after !== after) {
                      setDropAt({ id: extra.id, after });
                    }
                  }}
                  onDragLeave={() => {
                    if (dropAt?.id === extra.id) setDropAt(null);
                  }}
                  onDrop={() => dropExtraOn(extra.id, dropAt?.id === extra.id ? dropAt.after : false)}
                >
                  {dropAt?.id === extra.id && !dropAt.after && (
                    <span className="pb-drop-line" aria-hidden="true" />
                  )}
                  <div className="pb-head">
                    <span className="pb-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="pb-title">
                      <h4>
                        {extra.title}
                        {extraDone && (
                          <button
                            type="button"
                            className="pb-done-tag"
                            onClick={() => undoExtra(extra)}
                            aria-label={`撤回「${extra.title}」今天的完成`}
                            title="点一下撤回：这条还没练完 / 点错了"
                          >
                            今天练过
                          </button>
                        )}
                      </h4>
                      <p className="pb-meta">
                        {extra.meter} · {extra.bpm} BPM · 自己加的
                        {extra.setName ? ` · 来自「${extra.setName}」` : ""}
                      </p>
                    </div>
                    <span className="pb-move">
                      <button
                        type="button"
                        className="btn-quiet pb-move-btn"
                        onClick={() => moveExtraBy(extra.id, -1)}
                        disabled={index === 0}
                        aria-label={`把「${extra.title}」往前挪一位`}
                        title="往前挪一位"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-quiet pb-move-btn"
                        onClick={() => moveExtraBy(extra.id, 1)}
                        disabled={index === extras.length - 1}
                        aria-label={`把「${extra.title}」往后挪一位`}
                        title="往后挪一位"
                      >
                        ↓
                      </button>
                    </span>
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => audition(extra.id, extra.tab, extra.bpm)}
                    >
                      试听
                    </button>
                    <button type="button" className="btn-quiet" onClick={() => openExtra(extra)}>
                      跟练
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => start(extra.id)}
                      aria-pressed={extraRunning}
                    >
                      {extraRunning ? "暂停" : "计时"}
                    </button>
                    <button
                      type="button"
                      className={extraDone ? "btn" : "btn primary"}
                      onClick={() => finishExtra(extra)}
                      disabled={extraDone}
                    >
                      {extraDone ? "已勾" : "完成"}
                    </button>
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => setExtras(removeExtra(extra.id, today))}
                    >
                      删掉
                    </button>
                  </div>
                  <TabScore id={extra.id} tab={extra.tab} beat={beatOf(extra.id)} />
                  {dropAt?.id === extra.id && dropAt.after && (
                    <span className="pb-drop-line after" aria-hidden="true" />
                  )}
                </li>
                </Fragment>
              );
            })}
            {dragId && (
              <li
                className={`practice-drop-end${dropEnd ? " on" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!dropEnd) setDropEnd(true);
                  setDropAt(null);
                }}
                onDragLeave={() => setDropEnd(false)}
                onDrop={dropExtraAtEnd}
              >
                拖到这里，排到最后
              </li>
            )}
          </ol>
        </>
      )}

      {/* ---------- 本阶段全部练习 ---------- */}
      <h3 className="practice-h3">
        这一阶段的 {library.length} 条练习
        <span className="practice-h3-hint">计划每天从里面挑几条，剩下的当备选</span>
      </h3>
      <div className="drill-grid">
        {library.map((drill) => (
          <article key={drill.id} id={`drill-${drill.id}`} className="drill-card">
            <header className="drill-head">
              <h4>{drill.name}</h4>
              <span className="drill-block">{blockOf(drill.block).label}</span>
            </header>
            <TabScore id={drill.id} tab={drill.tab} beat={beatOf(drill.id)} />
            <div className="drill-actions">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => audition(drill.id, drill.tab, drill.bpm ? drill.bpm[0] : 70)}
              >
                试听
              </button>
              <button type="button" className="btn-quiet" onClick={() => openFollow(drill)}>
                跟练
              </button>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => addToPlan(drill)}
                disabled={extras.some((extra) => extra.title === drill.name)}
                title="把这条加到「今天自己加的」里，之后能勾掉"
              >
                {extras.some((extra) => extra.title === drill.name) ? "已在计划里" : "加进今日计划"}
              </button>
              {best(followKey(drill.id)) !== undefined && (
                <span className="best-badge">最高 {best(followKey(drill.id))} BPM</span>
              )}
            </div>
            <details className="pb-more">
              <summary>练法与验收</summary>
              <ol className="pb-steps">
                {drill.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>常见错误</b>：{drill.mistake}
              </p>
              <p className="pb-line">
                <b>验收</b>：{drill.pass}
              </p>
            </details>
          </article>
        ))}
      </div>

      {/* ---------- 技巧库 ---------- */}
      <section className="techniques">
        <h3>技巧库</h3>
        <p className="practice-note">
          14 张卡：左手 7 项、右手 7 项。每张都是「是什么 / 要领 / 常见错误 / 练法 / 验收」，
          卡右上角的 S 编号是建议开始练的阶段。
        </p>
        <div className="lesson-buttons">
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={hand === side ? "chip on" : "chip"}
              aria-pressed={hand === side}
              onClick={() => setHand(side)}
            >
              {side === "left" ? "左手" : "右手"}
            </button>
          ))}
        </div>

        <div className="technique-list">
          {techniquesOf(hand).map((technique) => (
            <details key={technique.id} className="technique">
              <summary>
                <b>{technique.name}</b>
                <span className="technique-stage">S{technique.stage}</span>
              </summary>
              <p className="tech-summary">{technique.summary}</p>
              <ul className="tech-keys">
                {technique.keys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
              <p className="pb-line">
                <b>常见错误</b>：{technique.mistake}
              </p>
              <ol className="pb-steps">
                {technique.how.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>验收</b>：{technique.pass}
              </p>
            </details>
          ))}
        </div>
      </section>

      <p className="practice-foot">
        练习和「音阶游戏」是两条线：这里练手，那里考音。两边都做，进度才完整。
      </p>

      {undo && (
        <UndoToast
          message={undo.paused ? `这一周不再出现「${undo.label}」` : `已跳过「${undo.label}」`}
          action={undo.paused ? undefined : { label: "这一周别出现", onClick: pauseBlock }}
          onUndo={undoSkip}
          onClose={() => setUndo(null)}
        />
      )}
      {undoDone && (
        <UndoToast
          message={`已撤回「${undoDone.title}」今天的完成`}
          action={{ label: "去练这一条", onClick: goUndone }}
          onUndo={redoExtraDone}
          onClose={() => setUndoDone(null)}
        />
      )}
    </section>
  );
}
