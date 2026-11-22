import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  dateKeyOf,
  dayNumberOf,
  DRILLS,
  FEELS,
  hardestTally,
  heatmapOf,
  isValidDateKey,
  lastNDays,
  practiceStats,
  PROGRESSIONS,
  sparklineOf,
  stageOf,
  streakOf,
  summarizeProgress,
  THEORY_LEVEL_IDS,
  weekdayIndex,
  weekSummaryOf,
  goalProgress,
  weekPace,
  weekReportOf,
  weekStreak,
  mondayOf,
  type EarKind,
} from "@guitar/core";
import { LEVELS, LEVEL_IDS, MAX_TOTAL_STARS } from "../lib/levels";
import { loadChords, loadDaily, loadEar, loadGoals, loadPauses, loadPractice, loadProgress, loadRhythm, loadSettings, loadSkips, removePause, saveGoals, savePauses, saveSettings, skipsOf, type DailyMap } from "../lib/storage";
import { bestRun, loadRuns, restoreRuns, steadyTrend, steadyWindow, type SteadyRun } from "../lib/steady";
import { goTo, parseHash } from "../lib/nav";
import { earTrendOf } from "../lib/ear-trend";
import { RHYTHM_GROUPS, RHYTHM_ITEMS, rhythmItemById, rhythmItemsOf } from "../lib/rhythm-index";
import { loadPatterns } from "../lib/patterns";
import { loadExtras } from "../lib/plan";
import { loadSets } from "../lib/plan-sets";
import { fmt, fmtSpan } from "../lib/format";
import {
  loadViews,
  promoteView,
  removeView,
  saveView,
  viewLabel,
  viewShortLabel,
  type StatsView,
} from "../lib/stats-views";
import { degreeName } from "../lib/degrees";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Stars from "../components/Stars";
import UndoToast from "../components/UndoToast";

/** 统计页：全部来自本机 localStorage，没有账号也没有上报。 */
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEK_KIND_LABEL = { practice: "练习页的关卡", follow: "跟练", rhythm: "节奏页的条目" } as const;
/** 「按级数筛」的那一个数字存在哪儿（v0.109.0）：地址栏 + 一个会话级的备份键。 */
const DEGREE_FILTER_KEY = "guitar.stats.degree";
/** 按阶段筛的值（v0.111.0）：和级数一样两头都写，`?s=1`。 */
const STAGE_FILTER_KEY = "guitar.stats.stage";
/** 「单独练过几次」那排（v0.115.0）：`?p=3`。 */
const SPOT_FILTER_KEY = "guitar.stats.spot";
/** 只看某一套组合（v0.119.0）：`?g=早课`。存名字不存 id——记录里是运行时生成的。 */
const SET_FILTER_KEY = "guitar.stats.set";
/** 「卡了几次」那排（v0.123.0）：`?c=2`，只认 2 / 4 两档。 */
const COUNT_FILTER_KEY = "guitar.stats.count";

/** 读「卡了几次」：只认 2 / 4，其余一律当「全部」。 */
function readCountFilter(): 0 | 2 | 4 {
  const value = readFilter("c", COUNT_FILTER_KEY, 2, 4);
  return value === 2 || value === 4 ? value : 0;
}

/** 读「单独练过几次」：只认 1 / 3，其余一律当「全部」。 */
function readSpotFilter(): 0 | 1 | 3 {
  const value = readFilter("p", SPOT_FILTER_KEY, 1, 3);
  return value === 1 || value === 3 ? value : 0;
}

/** 读「只看这套」：地址栏 `?g=` 优先，否则读这次会话留下的。 */
function readSetFilter(): string | null {
  const clean = (raw: string | null | undefined): string | null => {
    const text = (raw ?? "").trim().slice(0, 12);
    return text ? text : null;
  };
  return (
    clean(parseHash(window.location.hash)?.query.g) ??
    clean(window.sessionStorage.getItem(SET_FILTER_KEY))
  );
}

/** 读筛选：地址栏 `#stats?d=5&s=1` 优先（刷新 / 分享都还在），否则读这次会话留下的数。 */
function readFilter(param: string, sessionKey: string, min: number, max: number): number | null {
  // 注意不能直接 Number(...)：阶段的最小值是 0，而 Number("") === 0，
  // 「没存过」会被读成「按第 1 阶段筛」，点一下那个 chip 反而把筛选关掉（v0.111.0 踩过）。
  const pick = (raw: string | null | undefined): number | null => {
    if (raw === null || raw === undefined || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  };
  return pick(parseHash(window.location.hash)?.query[param]) ?? pick(window.sessionStorage.getItem(sessionKey));
}

/**
 * 写筛选（v0.109.0 / v0.111.0 加了阶段）。
 *
 * 地址栏用 `replaceState`：点 chip 不该往历史里塞一条记录（后退键会变成一步步退筛选）。
 * 地址栏不是统计页时（说明用户已经在别的页面）就不动它，只更新 sessionStorage——
 * 从练习页点回「统计」时 Tab 会把 hash 换成 `#stats`，那时靠这两个数还原。
 */
function saveFilters(
  degree: number | null,
  stage: number | null,
  spot: 0 | 1 | 3 = 0,
  set: string | null = null,
  count: 0 | 2 | 4 = 0,
): void {
  if (degree === null) window.sessionStorage.removeItem(DEGREE_FILTER_KEY);
  else window.sessionStorage.setItem(DEGREE_FILTER_KEY, String(degree));
  if (stage === null) window.sessionStorage.removeItem(STAGE_FILTER_KEY);
  else window.sessionStorage.setItem(STAGE_FILTER_KEY, String(stage));
  if (spot === 0) window.sessionStorage.removeItem(SPOT_FILTER_KEY);
  else window.sessionStorage.setItem(SPOT_FILTER_KEY, String(spot));
  if (set) window.sessionStorage.setItem(SET_FILTER_KEY, set);
  else window.sessionStorage.removeItem(SET_FILTER_KEY);
  if (count === 0) window.sessionStorage.removeItem(COUNT_FILTER_KEY);
  else window.sessionStorage.setItem(COUNT_FILTER_KEY, String(count));

  const route = parseHash(window.location.hash);
  if (!route || route.tab !== "stats") return;
  const query = { ...route.query };
  if (degree === null) delete query.d;
  else query.d = String(degree);
  if (stage === null) delete query.s;
  else query.s = String(stage);
  if (spot === 0) delete query.p;
  else query.p = String(spot);
  if (set) query.g = set;
  else delete query.g;
  if (count === 0) delete query.c;
  else query.c = String(count);
  const search = new URLSearchParams(query).toString();
  const next = `#stats${route.target ? `/${route.target}` : ""}${search ? `?${search}` : ""}`;
  if (window.location.hash !== next) window.history.replaceState(null, "", next);
}

const EAR_KINDS: { id: EarKind; label: string }[] = [
  { id: "position", label: "听音辨位" },
  { id: "interval", label: "音程判断" },
  { id: "degree", label: "级数判断" },
  { id: "progression", label: "级数走向" },
  { id: "quality", label: "和弦性质" },
];
/** 一轮听辨有几题（和扒谱页的 `ROUND` 保持一致）。 */
const EAR_ROUND = 8;

export default function Stats() {
  const progress = loadProgress();
  const daily = loadDaily() as DailyMap;
  const practiceLog = loadPractice();
  const practice = practiceStats(practiceLog, dateKeyOf(new Date()));
  const today = dateKeyOf(new Date());
  // 这一周 vs 上周同期（周一起算，core 的 weekSummaryOf）
  const weekStats = weekSummaryOf(practiceLog, today);
  // 周报：这周练了几天、最勤哪天、哪块落下了（只读练习日志）
  const weekReport = weekReportOf(practiceLog, today);
  // 每周目标：存在设置里，0 = 不设（进度条不出现）
  const [goal, setGoal] = useState(() => loadSettings().weeklyGoal);
  const goalState = goalProgress(weekStats.minutes, goal);
  const pace = weekPace(weekStats, today, goal);
  // 每周目标的历史（周一 → 分钟）：改目标不重判过去几周，连续达成才数得对
  const [goalLog, setGoalLog] = useState(() => loadGoals());
  const goalStreak = weekStreak(practiceLog, goalLog, today);
  const setGoalTo = (minutes: number) => {
    saveSettings({ ...loadSettings(), weeklyGoal: minutes });
    setGoal(minutes);
    const next = { ...goalLog };
    const week = mondayOf(today);
    if (minutes > 0) next[week] = minutes;
    else delete next[week];
    saveGoals(next);
    setGoalLog(next);
  };
  // 热力图：宽屏放一整年（52 周），中等屏幕半年，手机上 18 周，免得横向塞不下
  const narrow = useMediaQuery("(max-width: 900px)");
  const wide = useMediaQuery("(min-width: 1100px)");
  const heat = heatmapOf(practiceLog, today, narrow ? 18 : wide ? 52 : 26);

  // 点热力图里的一格 → 展开那天练了什么。键盘用方向键在格子间走（左右一周、上下一天）。
  const drillNames = useMemo(() => new Map(DRILLS.map((drill) => [drill.id, drill.name])), []);

  // 跳过表：「今天跳过的」与「最近一周最常跳过的」（表里本来就只留 7 天）
  const skips = loadSkips(today);
  /** 和弦谱跟练的 id 是 `seq:C-Am-G`（v0.89.0），不是节奏页的条目，得自己翻译一下。 */
  const nameOf = (id: string) =>
    id.startsWith("seq:")
      ? `和弦谱 ${id.slice(4).split("-").join("–")}`
      : (drillNames.get(id.replace(/^p:/, "")) ?? rhythmItemById(id)?.label ?? id);
  const skipName = nameOf;

  /** 「我存的进行」的 id 是 `pattern-…`，名字存在 `guitar.patterns.v1` 里，不在节奏页的条目表里。 */
  const patternNames = useMemo(() => new Map(loadPatterns().map((item) => [item.id, item.title])), []);
  const titleOf = (id: string) => rhythm[id]?.title ?? patternNames.get(id) ?? nameOf(id);

  /**
   * 点「最卡的地方」里的一条 → 跳回那一段（v0.102.0）。
   *
   * 三种来源各回各的家：和弦谱跟练回扒谱页、我存的进行回节奏页那张卡、
   * 练习页的关卡回练习库那条；剩下的（我的谱、节奏页条目）回节奏页顶上。
   */
  const jumpTo = (id: string) => {
    if (id.startsWith("seq:")) {
      goTo("ear", "chord-listen");
      return;
    }
    if (id.startsWith("pattern-")) {
      goTo("rhythm", id);
      return;
    }
    if (DRILLS.some((drill) => drill.id === id.replace(/^p:/, ""))) {
      goTo("practice", `drill-${id.replace(/^p:/, "")}`);
      return;
    }
    goTo("rhythm");
  };
  const todaySkips = [...skipsOf(skips, today)];
  const skipCounts = new Map<string, number>();
  for (const ids of Object.values(skips)) {
    for (const id of ids) skipCounts.set(id, (skipCounts.get(id) ?? 0) + 1);
  }
  const topSkips = [...skipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 压后表：「这一周先不练」的那几条，按回来的日子排；点「恢复」立刻放回来
  const [pauses, setPauses] = useState(() => loadPauses(today));
  const pausedItems = Object.entries(pauses)
    .filter(([, until]) => until >= today)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const resume = (id: string) => {
    const next = removePause(pauses, id);
    savePauses(next);
    setPauses(next);
  };
  const [day, setDay] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const todayIndex = heat.weeks.length * 7 - 7 + weekdayIndex(today);
  const activeIndex = Math.min(cursor ?? todayIndex, heat.weeks.length * 7 - 1);
  const dayLog = day ? practiceLog[day] : undefined;

  useEffect(() => {
    if (cursor === null) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-heat-index="${cursor}"]`)
      ?.focus();
  }, [cursor]);

  const moveCursor = (delta: number) => {
    const from = cursor ?? todayIndex;
    setCursor(Math.max(0, Math.min(todayIndex, from + delta)));
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowLeft"
        ? -7
        : event.key === "ArrowRight"
          ? 7
          : event.key === "ArrowUp"
            ? -1
            : event.key === "ArrowDown"
              ? 1
              : 0;
    if (delta !== 0) {
      event.preventDefault();
      moveCursor(delta);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(todayIndex);
    }
  };

  // 节奏页的跟练成绩：每条练习最快练到多少 BPM、练过几次、上次是哪天。
  // 练习页的跟练用 `p:` 前缀存在同一张表里，这里只数节奏页那 103 条。
  const rhythm = loadRhythm();
  const rhythmItems = Object.entries(rhythm).filter(([id]) => !id.startsWith("p:"));
  // 只跟「稳不稳」进来过的那条也会留记录（v0.142.0），没跟练过就不算一条
  const practiceFollows = Object.keys(rhythm).filter(
    (id) => id.startsWith("p:") && ((rhythm[id]?.sessions ?? 0) > 0 || (rhythm[id]?.bestBpm ?? 0) > 0),
  );
  const rhythmMinutes = Math.round(rhythmItems.reduce((sum, [, item]) => sum + item.minutes, 0));
  const rhythmSessions = rhythmItems.reduce((sum, [, item]) => sum + item.sessions, 0);
  const topRhythm = rhythmItems
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => b.bestBpm - a.bestBpm || b.sessions - a.sessions)
    .slice(0, 5);

  // 和弦转换：四组进行各自练到多快（`guitar.chords.v1`，v0.59.0 起）
  const chords = loadChords();
  const chordDone = PROGRESSIONS.filter((progression) => chords[progression.id]).length;
  const chordBest = Math.max(0, ...Object.values(chords).map((item) => item.bestBpm));
  const chordMinutes = Math.round(Object.values(chords).reduce((sum, item) => sum + item.minutes, 0));

  // 跟练进步：只有两天以上记录的条目才画得出曲线（练习页的 p: 条目也算）
  const curves = Object.entries(rhythm)
    .map(([id, item]) => ({ id, points: item.history ?? [] }))
    .filter((item) => item.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 6);
  // 「今天自己加的」（v0.103.0）：跟练里切出来的一小节、或练习库里手动加的。
  // 它们不进计划的分母，但既然记在同一个 done 表里，就该在这儿看得出练没练。
  const todayExtras = loadExtras(today);
  const todayDoneIds = new Set(practiceLog[today]?.done ?? []);
  const extrasDone = todayExtras.filter((extra) => todayDoneIds.has(extra.id)).length;
  /**
   * 加餐的完成度按阶段拆一行（v0.111.0）。
   *
   * 总数 `1/3` 说明不了「哪一块还欠着」；阶段取 `PlanExtra.stage`（当天有效），
   * 老计划里没这个字段的用名字回查 `DRILLS`，再查不到就归「其他」。
   */
  const extrasByStage = (() => {
    const map = new Map<number | "other", { done: number; total: number }>();
    for (const extra of todayExtras) {
      const stage =
        typeof extra.stage === "number"
          ? extra.stage
          : DRILLS.find((drill) => drill.name === extra.title)?.stage;
      const key = stage === undefined ? "other" : stage;
      const cell = map.get(key) ?? { done: 0, total: 0 };
      cell.total += 1;
      if (todayDoneIds.has(extra.id)) cell.done += 1;
      map.set(key, cell);
    }
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === "other") return 1;
        if (b[0] === "other") return -1;
        return a[0] - b[0];
      })
      .map(([stage, cell]) => ({
        stage,
        done: cell.done,
        total: cell.total,
        label: stage === "other" ? "其他" : `第 ${stage + 1} 阶段`,
      }));
  })();

  /**
   * 加餐一共练了多久、分在哪些阶段（v0.107.0）。
   *
   * 分阶段的依据是名字对回练习库（`DRILLS`）：计划表第二天就清空，`PlanExtra.stage` 留不下来；
   * 名字是当初加计划时存下的（v0.104.0 起跟着记录走），对不上练习库的就归「其他」。
   */
  const extraRows = Object.entries(rhythm)
    .filter(([id]) => id.startsWith("p:extra-"))
    .map(([, record]) => ({
      title: record.title ?? "",
      minutes: record.minutes ?? 0,
      stage: DRILLS.find((drill) => drill.name === record.title)?.stage,
    }))
    .filter((row) => row.minutes > 0);
  const extraTotalMinutes = extraRows.reduce((sum, row) => sum + row.minutes, 0);
  const extraByStage = (() => {
    const map = new Map<number | "other", number>();
    for (const row of extraRows) {
      const key = row.stage === undefined ? "other" : row.stage;
      map.set(key, (map.get(key) ?? 0) + row.minutes);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "other") return 1;
      if (b[0] === "other") return -1;
      return a[0] - b[0];
    });
  })();
  const extraStageLine = extraByStage
    .map(([key, minutes]) => `${key === "other" ? "其他" : `第 ${key + 1} 阶段`} ${minutes} 分钟`)
    .join(" · ");

  /**
   * 加餐按「组合」分组（v0.114.0）：同一套里的条目今天加进来几条、勾了几条。
   *
   * 只算今天确实在计划里的那些（`total` 是加进来的条数，不是这一套存了几条）——
   * 一套里有 6 条、今天只加进来 2 条，写成 1/2 才对；写成 1/6 等于怪用户没加。
   */
  const setProgress = loadSets()
    .map((set) => {
      const inPlan = todayExtras.filter((extra) =>
        set.items.some((item) => item.title === extra.title),
      );
      return {
        name: set.name,
        done: inPlan.filter((extra) => todayDoneIds.has(extra.id)).length,
        total: inPlan.length,
      };
    })
    .filter((row) => row.total > 0);

  // 按级数筛「最卡的条目」（v0.107.0）：null = 全部
  // 筛选状态写进地址栏（`#stats?d=5&s=1`，v0.109.0 起、v0.111.0 加了阶段），另外在 sessionStorage
  // 里留一份——从统计页跳到练习页再点回来时地址栏被 Tab 用 replaceState 换成了 `#stats`，
  // 只靠 hash 会丢；两处都写，回来时先读 hash、退回去读 sessionStorage。
  const [degreeFilter, setDegreeFilter] = useState<number | null>(() =>
    readFilter("d", DEGREE_FILTER_KEY, 1, 7),
  );
  const [stageFilter, setStageFilter] = useState<number | null>(() =>
    readFilter("s", STAGE_FILTER_KEY, 0, 5),
  );
  // 单独练过几次（v0.114.0）：0 = 全部，1 / 3 = 至少那么多次。
  // v0.115.0 起它也算视角的一部分，跟着一起进地址栏（`?p=3`）和 sessionStorage。
  const [spotFilter, setSpotFilter] = useState<0 | 1 | 3>(() => readSpotFilter());
  // 按组合筛（v0.118.0）：点「组合 · 早课」那一行小标题，只看这一套的条目。
  // v0.119.0 起它也进地址栏（`?g=早课`）和视角——既然能存，就该跟着一起存。
  const [setFilter, setSetFilter] = useState<string | null>(() => readSetFilter());
  // 卡了几次（v0.123.0）：0 = 全部，2 / 4 = 至少卡过那么多次。跟「单独练过几次」不是一回事——
  // 那个数是跟练里主动点「只练这一处」的次数，这个是跟练时卡住被记下来的次数。
  const [countFilter, setCountFilter] = useState<0 | 2 | 4>(() => readCountFilter());
  useEffect(() => {
    saveFilters(degreeFilter, stageFilter, spotFilter, setFilter, countFilter);
  }, [degreeFilter, stageFilter, spotFilter, setFilter, countFilter]);
  // 曲线上的某一天（v0.128.0）：点曲线选中一个点，下面多一行那天的日期 / BPM / 跟上次差多少。
  const [curvePoint, setCurvePoint] = useState<{ id: string; index: number } | null>(null);
  // 放宽一档之后有多少条（v0.128.0）：空列表点一下「放宽到 ≥2 次」，得立刻知道现在剩几条。
  // 提示跟着筛选快照走——再动别的筛选就自动失效，不会留下一句过期的话。
  const [relaxNotice, setRelaxNotice] = useState<{ text: string; key: string } | null>(null);
  // 存下的视角（v0.111.0）：把「第 5 级 · 第 1 阶段」这种组合存一排，一键复原
  const [views, setViews] = useState<StatsView[]>(() => loadViews());

  // 最卡的地方（v0.100.0）：跟练时点级数方块单练过的那一小节，按级数归堆。
  // 只看最近 7 天练过的条目——一个月前那条不该影响这周的结论。
  const hardTally = hardestTally(rhythm, addDays(today, -6));
  // 同一份数据按「条目」再排一遍（v0.101.0）：哪一段最卡、卡在哪一小节
  // 最卡的地方按条目排（v0.105.0）：今天计划里的那几条按练习页的顺序排在最前（v0.106.0），
  // 计划和统计页两份列表顺序对得上；剩下的才按「单独练过几次」排。
  const planOrder = new Map(todayExtras.map((extra, index) => [extra.id, index]));
  // 同属一套组合的条目也挨在一起（v0.116.0）：练习页按「组合 · 早课」分组，统计页这里跟着排，
  // 两边的相对顺序才不打架。序号取组合今天第一次出现在计划里的位置。
  // 注意两套键：`setRankById` 给还在计划里的加餐用，`setRankByTitle` 给记录用——
  // 记录的 id 是 `p:extra-…` 运行时生成的，跟计划里的 id 对不上，只能靠标题回查。
  const setRankById = new Map<string, number>();
  const setRankByName = new Map<string, number>();
  const setRankByTitle = new Map<string, number>();
  const setNameByTitle = new Map<string, string>();
  for (const extra of todayExtras) {
    if (!extra.setName) continue;
    if (!setRankByName.has(extra.setName)) setRankByName.set(extra.setName, setRankByName.size);
    const rank = setRankByName.get(extra.setName)!;
    setRankById.set(extra.id, rank);
    if (!setRankByTitle.has(extra.title)) setRankByTitle.set(extra.title, rank);
    if (!setNameByTitle.has(extra.title)) setNameByTitle.set(extra.title, extra.setName);
  }
  // 按阶段筛（v0.110.0）：练习库里的直接按 id 查，加餐 / 跟练里切出来的记录靠 `title` 回查 DRILLS。
  const stageById = new Map(DRILLS.map((drill) => [drill.id, drill.stage]));
  const stageByName = new Map(DRILLS.map((drill) => [drill.name, drill.stage]));
  const hardSorted = Object.entries(rhythm)
    .filter(([, record]) => record.hardest && record.lastAt && record.lastAt >= addDays(today, -6))
    .map(([id, record]) => {
      const bare = id.replace(/^p:/, "");
      return {
        id,
        hardest: record.hardest!,
        order: planOrder.get(bare),
        setRank:
          setRankById.get(bare) ?? (record.title ? setRankByTitle.get(record.title) : undefined),
        setName: record.title ? setNameByTitle.get(record.title) : undefined,
        // 「单独练过几次」（v0.114.0）：跟练里点「只练这一处」的次数合计，和 hardest.count 不是一回事
        spots: (record.spots ?? []).reduce((sum, spot) => sum + spot.times, 0),
        bpm: record.bestBpm ?? 0,
        stage: stageById.get(bare) ?? (record.title ? stageByName.get(record.title) ?? null : null),
      };
    })
    .sort((a, b) => {
      // 先按组合归堆：同一套的条目相邻，组合之间按它们今天进计划的先后
      const setA = a.setRank ?? Number.MAX_SAFE_INTEGER;
      const setB = b.setRank ?? Number.MAX_SAFE_INTEGER;
      if (setA !== setB) return setA - setB;
      if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
        return a.order - b.order;
      }
      if (a.order !== undefined && b.order === undefined) return -1;
      if (b.order !== undefined && a.order === undefined) return 1;
      // 卡得一样狠的时候，先看练得快的（v0.122.0）：同样的次数，快的说明这一步已经吃透了
      if (b.hardest.count !== a.hardest.count) return b.hardest.count - a.hardest.count;
      return b.bpm - a.bpm;
    });
  const stageOptions = [...new Set(hardSorted.map((item) => item.stage))]
    .filter((stage): stage is number => typeof stage === "number")
    .sort((a, b) => a - b);
  const hardItems = hardSorted
    .filter(
      (item) =>
        (degreeFilter === null || item.hardest.degree === degreeFilter) &&
        (stageFilter === null || item.stage === stageFilter) &&
        (spotFilter === 0 || item.spots >= spotFilter) &&
        (countFilter === 0 || item.hardest.count >= countFilter) &&
        (setFilter === null || item.setName === setFilter),
    )
    .slice(0, 4);
  // 只看某一套时，「跟练进步」也只留这一套的曲线（v0.128.0）：
  // 上面筛了、下面还列别人的曲线，等于两处说的不是一件事。
  // 按练习的「稳度」曲线（v0.143.0）：只有从练习页「顺手弹一遍」进去弹的才留点
  const steadyCurves = Object.entries(rhythm)
    .map(([id, item]) => ({ id, points: item.steadyHistory ?? [] }))
    .filter((item) => item.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 6);
  const visibleCurves = setFilter
    ? curves.filter((curve) => {
        const title = rhythm[curve.id]?.title;
        return !!title && setNameByTitle.get(title) === setFilter;
      })
    : curves;
  const visibleSteadyCurves = setFilter
    ? steadyCurves.filter((curve) => {
        const title = rhythm[curve.id]?.title;
        return !!title && setNameByTitle.get(title) === setFilter;
      })
    : steadyCurves;
  // 每套组合「整体卡在哪一级」（v0.119.0）：把这一套所有条目的「卡了几次」按级数加总，
  // 加总最多的那一级就是这套的短板。它是「这套要不要一起补」的线索，不是单条的结论。
  const setWeak = new Map<string, { degree: number; count: number }>();
  {
    const buckets = new Map<string, Map<number, number>>();
    for (const item of hardSorted) {
      if (!item.setName) continue;
      const bucket = buckets.get(item.setName) ?? new Map<number, number>();
      bucket.set(item.hardest.degree, (bucket.get(item.hardest.degree) ?? 0) + item.hardest.count);
      buckets.set(item.setName, bucket);
    }
    for (const [name, bucket] of buckets) {
      let best: { degree: number; count: number } | null = null;
      for (const [degree, count] of bucket) {
        if (!best || count > best.count) best = { degree, count };
      }
      if (best) setWeak.set(name, best);
    }
  }
  // 每套组合「练了几次 / 平均 BPM / 最近一次」（v0.120.0 / v0.123.0）：只算有记录的条目，
  // 没练过的不拉低平均；「最近一次」取这一套里最新的那个 lastAt。
  const setMeta = new Map<
    string,
    { sessions: number; bpmSum: number; bpmCount: number; lastAt: string }
  >();
  for (const record of Object.values(rhythm)) {
    const name = record.title ? setNameByTitle.get(record.title) : undefined;
    if (!name) continue;
    const stat = setMeta.get(name) ?? { sessions: 0, bpmSum: 0, bpmCount: 0, lastAt: "" };
    stat.sessions += record.sessions ?? 0;
    if (record.bestBpm > 0) {
      stat.bpmSum += record.bestBpm;
      stat.bpmCount += 1;
    }
    if (record.lastAt && record.lastAt > stat.lastAt) stat.lastAt = record.lastAt;
    setMeta.set(name, stat);
  }
  // 这套比上周快还是慢（v0.124.0 / 加权 v0.126.0）：跟练曲线里一天一个点，
  // 近 7 天跟前 7 天各算一个平均；**每个条目按它的练习次数加权**——
  // 一条练了 6 次的和一条练了 1 次的，不该各自占一半。
  const todayNumber = dayNumberOf(today);
  const setPace = new Map<
    string,
    { recentSum: number; recentWeight: number; beforeSum: number; beforeWeight: number }
  >();
  for (const record of Object.values(rhythm)) {
    const name = record.title ? setNameByTitle.get(record.title) : undefined;
    if (!name) continue;
    const stat = setPace.get(name) ?? { recentSum: 0, recentWeight: 0, beforeSum: 0, beforeWeight: 0 };
    const weight = Math.max(1, record.sessions ?? 0);
    let recentSum = 0;
    let recentCount = 0;
    let beforeSum = 0;
    let beforeCount = 0;
    for (const point of record.history ?? []) {
      if (!isValidDateKey(point.date) || point.bpm <= 0) continue;
      const daysAgo = todayNumber - dayNumberOf(point.date);
      if (daysAgo >= 0 && daysAgo <= 6) {
        recentSum += point.bpm;
        recentCount += 1;
      } else if (daysAgo >= 7 && daysAgo <= 13) {
        beforeSum += point.bpm;
        beforeCount += 1;
      }
    }
    if (recentCount > 0) {
      stat.recentSum += (recentSum / recentCount) * weight;
      stat.recentWeight += weight;
    }
    if (beforeCount > 0) {
      stat.beforeSum += (beforeSum / beforeCount) * weight;
      stat.beforeWeight += weight;
    }
    setPace.set(name, stat);
  }
  /** 这套的「比上周」详情（v0.126.0 起按练习次数加权）；两个窗口缺一个就返回 null（不硬比）。 */
  const setPaceInfoOf = (
    name: string,
  ): { delta: number; recentBpm: number; beforeBpm: number; recentWeight: number; beforeWeight: number } | null => {
    const stat = setPace.get(name);
    if (!stat || stat.recentWeight === 0 || stat.beforeWeight === 0) return null;
    const recentBpm = stat.recentSum / stat.recentWeight;
    const beforeBpm = stat.beforeSum / stat.beforeWeight;
    return {
      delta: Math.round(recentBpm - beforeBpm),
      recentBpm: Math.round(recentBpm),
      beforeBpm: Math.round(beforeBpm),
      recentWeight: stat.recentWeight,
      beforeWeight: stat.beforeWeight,
    };
  };
  /** 这套的「比上周快 / 慢 N BPM」；没得比就是 null。 */
  const setPaceOf = (name: string): number | null => setPaceInfoOf(name)?.delta ?? null;
  /** 点「练了 7 次」跳到下面「跟练进步」里这一套的那条曲线（v0.127.0）：
   *  光看数字不知道它长什么样，能跳过去看一眼趋势才算闭环。 */
  const jumpToCurve = (name: string) => {
    const first = Object.entries(rhythm).find(
      ([, record]) =>
        record.title &&
        setNameByTitle.get(record.title) === name &&
        (record.history ?? []).length >= 2,
    )?.[0];
    const row = first
      ? document.querySelector<HTMLElement>(`[data-curve-id="${CSS.escape(first)}"]`)
      : null;
    // 这一套还没有曲线（比如只练过一次）：退回到整块「跟练进步」
    const target = row ?? document.querySelector<HTMLElement>(".curve-list");
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("flash");
    window.setTimeout(() => target.classList.remove("flash"), 1200);
  };
  /** 点曲线：选中离点击位置最近的那个点（v0.128.0）。再点同一个点就收起来。 */
  const pickCurvePoint = (
    event: { currentTarget: SVGSVGElement; clientX: number },
    id: string,
    count: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
    const index = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
    setCurvePoint((prev) => (prev?.id === id && prev.index === index ? null : { id, index }));
  };
  /** 键盘上按回车 / 空格：往后翻一天（v0.128.0）——曲线是画出来的，键盘也得有一条路。 */
  const cycleCurvePoint = (id: string, count: number) => {
    setCurvePoint((prev) =>
      prev?.id === id ? { id, index: (prev.index + 1) % count } : { id, index: count - 1 },
    );
  };
  /**
   * 双击某一天：去练那天的小节（v0.129.0），并且在那天有多条记录时挑「速度最接近」的那一条
   * （v0.130.0——同一套里两条曲线常在同一天都有点，双击的是哪条得看那天的速度）。
   *
   * 记录里只有「最卡的是第几小节、第几级」，谱子在本页拿不到（`RhythmRecord` 不存 tab），
   * 所以交给条目所在的页面：带 `?follow=1&bar=N&item=<id>` 过去，那边挂上跟练面板、
   * 直接圈住那一小节。只有「那天的点正好是最卡的那天」才带小节，别的日子只把人送到条目上。
   */
  /** 按已经算好的那一天跳过去（曲线双击、圈上的小字点一下都走这里）。 */
  const jumpToDay = (id: string, index: number) => {
    const day = rhythm[id]?.history?.[index];
    if (!day) return;
    // 同一天可能有好几条记录都留了点：去「那天最快」的那条——双击的用意是「我想复现那天」，
    // 一天里最快的那次最值得复现；一样快就留在你点的这条上。
    // 只在「有套」的前提下跨条目找：没套的条目彼此无关，乱跳会把人送到别的练习上。
    const setName = rhythm[id]?.title ? (setNameByTitle.get(rhythm[id].title ?? "") ?? "") : "";
    const candidates = (setName
      ? Object.entries(rhythm).map(([key, record]) => ({ key, record }))
      : [{ key: id, record: rhythm[id] }])
      .map((entry) => {
        if (!entry.record) return null;
        if (setName && setNameByTitle.get(entry.record.title ?? "") !== setName) return null;
        const point = entry.record.history?.find((item) => item.date === day.date);
        if (!point) return null;
        return { key: entry.key, record: entry.record, bpm: point.bpm };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => right.bpm - left.bpm || (left.key === id ? -1 : right.key === id ? 1 : 0));
    const chosen = candidates[0] ?? { key: id, record: rhythm[id] };
    const practice = chosen.key.startsWith("p:");
    const bare = practice ? chosen.key.slice(2) : chosen.key;
    const targetBar =
      chosen.record?.hardest?.bar && chosen.record.hardest.at === day.date
        ? chosen.record.hardest.bar
        : undefined;
    if (practice) {
      const query: Record<string, string> = { item: bare };
      if (targetBar) {
        query.follow = "1";
        query.bar = String(targetBar);
      }
      // 不传锚点：`#practice/<id>` 会把页面滚到下面那张卡上，而人是奔着面板来的（v0.129.0）
      goTo("practice", undefined, query);
      return;
    }
    goTo("rhythm", bare);
  };

  /** 曲线上的双击：按指针位置取最近的一天，再交给 `jumpToDay`。 */
  const openCurveDay = (
    event: { currentTarget: SVGSVGElement; clientX: number },
    id: string,
    count: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
    jumpToDay(id, Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  };
  // 「卡了几次」那排 chip 上写「有 N 条」（v0.124.0）：点之前就知道能筛出几条，
  // 数的是「如果现在点它」会剩几条——即先套上其它几排筛选，再按次数数。
  const countPool = hardSorted.filter(
    (item) =>
      (degreeFilter === null || item.hardest.degree === degreeFilter) &&
      (stageFilter === null || item.stage === stageFilter) &&
      (spotFilter === 0 || item.spots >= spotFilter) &&
      (setFilter === null || item.setName === setFilter),
  );
  const countTally = ([2, 4] as const).map(
    (times) => countPool.filter((item) => item.hardest.count >= times).length,
  );
  // 存下的视角（v0.111.0）：现在这组筛选有没有存过 / 能不能存
  const currentWeak = setFilter ? (setWeak.get(setFilter)?.degree ?? 0) : 0;
  const currentMeta = setFilter ? setMeta.get(setFilter) : undefined;
  const currentSessions = currentMeta?.sessions ?? 0;
  const currentAvgBpm =
    currentMeta && currentMeta.bpmCount > 0
      ? Math.round(currentMeta.bpmSum / currentMeta.bpmCount)
      : 0;
  // 存这一套时它「比上周快 / 慢几 BPM」（v0.125.0）——7 天窗口会滚，这个差值得跟着视角一起存
  const currentPace = setFilter ? (setPaceOf(setFilter) ?? 0) : 0;
  const hasFilter =
    degreeFilter !== null ||
    stageFilter !== null ||
    spotFilter !== 0 ||
    countFilter !== 0 ||
    setFilter !== null;
  /** 筛空时给一个「放宽一步」的按钮（v0.127.0）：空列表里最需要的是下一步怎么走，
   *  一次只放宽一档——直接「看全部」会把用户刚选的那几排一起清掉。
   *  v0.128.0：点完顺手报一句「放宽之后有几条」，别让人再自己数。 */
  const filterKeyOf = (
    degree: number | null,
    stage: number | null,
    spot: 0 | 1 | 3,
    count: 0 | 2 | 4,
    set: string | null,
  ) => [degree ?? "-", stage ?? "-", spot, count, set ?? "-"].join("|");
  const filterKey = filterKeyOf(degreeFilter, stageFilter, spotFilter, countFilter, setFilter);
  /** 换一组筛选之后还剩几条（只数「最卡的地方」那张列表）。 */
  const countWith = (
    degree: number | null,
    stage: number | null,
    spot: 0 | 1 | 3,
    count: 0 | 2 | 4,
    set: string | null,
  ) =>
    hardSorted.filter(
      (item) =>
        (degree === null || item.hardest.degree === degree) &&
        (stage === null || item.stage === stage) &&
        (spot === 0 || item.spots >= spot) &&
        (count === 0 || item.hardest.count >= count) &&
        (set === null || item.setName === set),
    ).length;
  const relaxStep = (() => {
    if (!hasFilter) return null;
    const relax = (
      label: string,
      next: { degree: number | null; stage: number | null; spot: 0 | 1 | 3; count: 0 | 2 | 4; set: string | null },
      apply: () => void,
    ) => ({
      label,
      run: () => {
        apply();
        const left = countWith(next.degree, next.stage, next.spot, next.count, next.set);
        setRelaxNotice({
          text: `${label}之后有 ${left} 条。`,
          key: filterKeyOf(next.degree, next.stage, next.spot, next.count, next.set),
        });
      },
    });
    if (countFilter === 4)
      return relax(
        "放宽到 ≥2 次",
        { degree: degreeFilter, stage: stageFilter, spot: spotFilter, count: 2, set: setFilter },
        () => setCountFilter(2),
      );
    if (countFilter === 2)
      return relax(
        "不限次数",
        { degree: degreeFilter, stage: stageFilter, spot: spotFilter, count: 0, set: setFilter },
        () => setCountFilter(0),
      );
    if (spotFilter !== 0)
      return relax(
        "不限「单独练过」",
        { degree: degreeFilter, stage: stageFilter, spot: 0, count: countFilter, set: setFilter },
        () => setSpotFilter(0),
      );
    return relax("看全部", { degree: null, stage: null, spot: 0, count: 0, set: null }, () => {
      setDegreeFilter(null);
      setStageFilter(null);
      setSpotFilter(0);
      setCountFilter(0);
      setSetFilter(null);
    });
  })();
  const currentSaved = views.some(
    (view) =>
      view.degree === degreeFilter &&
      view.stage === stageFilter &&
      (view.spot ?? 0) === spotFilter &&
      (view.count ?? 0) === countFilter &&
      (view.set ?? "") === (setFilter ?? "") &&
      (view.weak ?? 0) === currentWeak &&
      (view.pace ?? 0) === currentPace,
  );
  // 起名字（v0.112.0）：点「存下这组筛选」先出一个输入框，名字可以不填（不填就用拼出来的那串）
  const [namingView, setNamingView] = useState(false);
  const [viewName, setViewName] = useState("");
  function applyView(view: StatsView): void {
    setDegreeFilter(view.degree);
    setStageFilter(view.stage);
    setSpotFilter(view.spot ?? 0);
    setCountFilter(view.count ?? 0);
    setSetFilter(view.set ?? null);
    // 用过的视角挪到最后 = 渲染时排在最前（v0.113.0）
    setViews(promoteView(view.id));
  }
  function storeCurrentView(): void {
    setViews(
      saveView(
        degreeFilter,
        stageFilter,
        spotFilter,
        viewName,
        setFilter ?? "",
        currentWeak,
        setFilter ? (setWeak.get(setFilter)?.count ?? 0) : 0,
        currentSessions,
        currentAvgBpm,
        countFilter,
        currentPace,
      ),
    );
    setNamingView(false);
    setViewName("");
  }
  function cancelNaming(): void {
    setNamingView(false);
    setViewName("");
  }
  function dropView(id: string): void {
    setViews(removeView(id));
  }

  // 听辨（扒谱页「练」）：`guitar.ear.v1` 存最好成绩、轮数与四种题型各自的正确率
  // 清空 / 撤销之后要让这一块重新读一遍存储
  const [steadyBump, setSteadyBump] = useState(0);
  const [steadyPick, setSteadyPick] = useState<number | null>(null);
  const [steadyUndo, setSteadyUndo] = useState<SteadyRun[] | null>(null);
  /** 清掉多少遍：`all` 或者最近 N 遍（v0.141.0） */
  const [steadyClear, setSteadyClear] = useState<"all" | 5 | 10>(() => loadSettings().steadyClear);
  const [steadyRemoved, setSteadyRemoved] = useState(0);
  const steadyRuns = useMemo(() => loadRuns(), [steadyBump]);
  const steadyBest = bestRun(steadyRuns);
  const steadyLast = steadyRuns[steadyRuns.length - 1] ?? null;
  const steadyPoints = steadyTrend(steadyRuns);
  const steadySpark = steadyPoints.length >= 2 ? sparklineOf(steadyPoints, 120, 30) : null;
  const steadyWindowRuns = steadyWindow(steadyRuns);
  const steadyWinRuns = steadyWindowRuns;
  // 趋势窗里最稳的一遍（标准差最小）和最快的一遍（BPM 最高）
  const steadyBestIndex = steadyPoints.length
    ? steadyPoints.reduce((best, value, index) => (value < steadyPoints[best] ? index : best), 0)
    : -1;
  /** 点趋势线：按横坐标取最近的那一遍（和跟练曲线的点法保持一致） */
  function pickSteadyPoint(event: { currentTarget: SVGSVGElement; clientX: number }): void {
    if (steadyWinRuns.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.max(0, Math.min(steadyWinRuns.length - 1, Math.round(ratio * (steadyWinRuns.length - 1))));
    setSteadyPick((current) => (current === index ? null : index));
  }

  const steadyPicked =
    steadyPick !== null && steadyWinRuns[steadyPick] ? steadyWinRuns[steadyPick] : null;
  // 这一遍跟上一遍比（v0.142.0）：速度快慢 + 同速时标准差的变化
  const steadyPickedIndex = steadyPicked ? steadyPick ?? -1 : -1;
  const steadyPrev = steadyPickedIndex > 0 ? steadyWinRuns[steadyPickedIndex - 1] : undefined;
  const steadyBpmDelta = steadyPicked && steadyPrev ? steadyPicked.bpm - steadyPrev.bpm : null;
  const steadySameBpm =
    steadyPicked && steadyPickedIndex > 0
      ? [...steadyWinRuns.slice(0, steadyPickedIndex)].reverse().find((run) => run.bpm === steadyPicked.bpm)
      : undefined;
  const steadyCompare = !steadyPicked
    ? ""
    : [
        steadyBpmDelta === null || steadyBpmDelta === 0
          ? steadyBpmDelta === null
            ? ""
            : "和上一遍同速"
          : steadyBpmDelta > 0
            ? `比上一遍快 ${steadyBpmDelta} BPM`
            : `比上一遍慢 ${-steadyBpmDelta} BPM`,
        steadySameBpm
          ? (() => {
              const diff = Math.round(steadySameBpm.stdevMs - steadyPicked.stdevMs);
              const tail = diff === 0 ? "一样稳" : diff > 0 ? `稳了 ${diff} 毫秒` : `散了 ${-diff} 毫秒`;
              return `同速的那遍 ±${Math.round(steadySameBpm.stdevMs)} 毫秒 → 这次 ±${Math.round(steadyPicked.stdevMs)} 毫秒（${tail}）`;
            })()
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
  const steadyFastIndex = steadyWindowRuns.length
    ? steadyWindowRuns.reduce((fast, run, index) => (run.bpm > steadyWindowRuns[fast].bpm ? index : fast), 0)
    : -1;

  const ear = loadEar();
  const earKinds = EAR_KINDS.map((kind) => {
    const item = ear.byKind[kind.id];
    return {
      ...kind,
      correct: item?.correct ?? 0,
      total: item?.total ?? 0,
      rate: item && item.total > 0 ? Math.round((item.correct / item.total) * 100) : null,
    };
  });
  const earTotal = earKinds.reduce((sum, item) => sum + item.total, 0);
  const earCorrect = earKinds.reduce((sum, item) => sum + item.correct, 0);
  const earRate = earTotal > 0 ? Math.round((earCorrect / earTotal) * 100) : null;

  // 正确率按天记的那份：只画最近 14 个练过的日子（有空档就跳过，不补 0）
  const earTrend = earTrendOf(ear);
  const earDays = earTrend.days;
  const earRates = earTrend.rates;
  const earSpark = earTrend.spark;

  const summary = summarizeProgress(LEVEL_IDS, progress);
  const theory = summarizeProgress(THEORY_LEVEL_IDS, progress);
  const streak = streakOf(Object.keys(daily), today);
  const week = lastNDays(today, 7);

  const dailyDone = Object.values(daily).filter((d) => d.completed).length;
  const dailyStars = Object.values(daily).reduce((n, d) => n + Math.max(0, Math.min(3, d.stars)), 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>统计</h2>
        <p>只记录在这台设备上，清浏览器数据会一起清掉。</p>
      </div>

      {summary.attempts === 0 && (
        <p className="empty-hint">
          还没有记录。去「音阶游戏」玩第一关，这里就会出现星级、正确率和练习时长。
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <b>
            {summary.completed}/{summary.total}
          </b>
          <span>已通关关卡</span>
        </div>
        <div className="stat-card">
          <b>
            ★ {summary.stars}/{MAX_TOTAL_STARS}
          </b>
          <span>星星合计</span>
        </div>
        <div className="stat-card">
          <b>{summary.completed ? summary.averageStars.toFixed(1) : "—"}</b>
          <span>平均星级（按已通关）</span>
        </div>
        <div className="stat-card">
          <b>{summary.attempts}</b>
          <span>提交次数</span>
        </div>
        <div className="stat-card">
          <b>{summary.perfectCount}</b>
          <span>全对过的关卡</span>
        </div>
        <div className="stat-card">
          <b>{fmtSpan(summary.bestSumMs)}</b>
          <span>最佳成绩合计</span>
        </div>
        <div className="stat-card">
          <b>{fmtSpan(summary.totalMs)}</b>
          <span>累计练习时长</span>
        </div>
      </div>

      <h3 className="stat-sub">每日挑战</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>{streak.current} 天</b>
          <span>当前连续{streak.todayDone ? " · 今天已完成" : " · 今天还没做"}</span>
        </div>
        <div className="stat-card">
          <b>{streak.longest} 天</b>
          <span>历史最长连续</span>
        </div>
        <div className="stat-card">
          <b>{dailyDone}</b>
          <span>完成过的每日挑战</span>
        </div>
        <div className="stat-card">
          <b>★ {dailyStars}</b>
          <span>每日挑战星星合计</span>
        </div>
      </div>

      <h3 className="stat-sub">乐理挑战</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>
            {theory.completed}/{theory.total}
          </b>
          <span>已通关的乐理关</span>
        </div>
        <div className="stat-card">
          <b>
            ★ {theory.stars}/{theory.maxStars}
          </b>
          <span>乐理星星合计</span>
        </div>
        <div className="stat-card">
          <b>{theory.bestSumMs > 0 ? fmtSpan(theory.bestSumMs) : "—"}</b>
          <span>最快成绩合计</span>
        </div>
      </div>

      <div className="week">
        {week.map((date) => {
          const rec = daily[date];
          const done = !!rec?.completed;
          return (
            <div key={date} className={done ? "week-day done" : "week-day"} title={date}>
              <div>{date.slice(5)}</div>
              {done ? <Stars n={rec.stars} /> : <div className="week-empty">—</div>}
            </div>
          );
        })}
      </div>

      <h3 className="stat-sub">练习（练习页的打卡）</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>{practice.streak} 天</b>
          <span>连续练习{practice.todayMinutes > 0 ? " · 今天已练" : " · 今天还没练"}</span>
        </div>
        <div className="stat-card">
          <b>{practice.longest} 天</b>
          <span>历史最长连续</span>
        </div>
        <div className="stat-card">
          <b>{practice.weekTotal} 分钟</b>
          <span>最近 7 天</span>
        </div>
        <div className="stat-card">
          <b className={weekStats.deltaMinutes > 0 ? "stat-up" : undefined}>
            {weekStats.deltaMinutes > 0 ? "+" : ""}
            {weekStats.deltaMinutes} 分钟
          </b>
          <span>比上周同期（{weekStats.prevMinutes} → {weekStats.minutes}）</span>
        </div>
        <div className="stat-card">
          <b>{practice.totalMinutes} 分钟</b>
          <span>累计练习</span>
        </div>
        <div className="stat-card">
          <b>{practice.days}</b>
          <span>练过的天数</span>
        </div>
        <div className="stat-card">
          <b>{practiceFollows.length}</b>
          <span>练习页跟练过的条目</span>
        </div>
        {todayExtras.length > 0 && (
          <button
            type="button"
            className="stat-card stat-card-link"
            onClick={() =>
              // 多条时直接落到还没勾的那一条（v0.105.0），全勾完了就落到那一块标题
              goTo(
                "practice",
                todayExtras.find((extra) => !todayDoneIds.has(extra.id))?.id ?? "practice-extras",
              )
            }
            title="去练习页看看今天自己加的那几条"
            aria-label={`今天自己加的 ${todayExtras.length} 条，已勾 ${extrasDone} 条；点一下去练习页`}
          >
            <b>
              {extrasDone}/{todayExtras.length}
            </b>
            <span>今天自己加的（加餐）</span>
          </button>
        )}
      </div>
      {/* 加餐的完成度按阶段 / 按组合各拆一行（v0.111.0 / v0.114.0）。
          不塞进那张卡里：卡只有一百多像素宽，两行小字会被折成「第 1 阶段 1/1 · 第 2 / 阶段 1/2」这样。 */}
      {(extrasByStage.length > 1 || setProgress.length > 0) && (
        <p className="hint extra-by">
          {extrasByStage.length > 1 && (
            <span>
              按阶段：
              {extrasByStage.map((row) => `${row.label} ${row.done}/${row.total}`).join(" · ")}
            </span>
          )}
          {setProgress.length > 0 && (
            <span>
              按组合：
              {setProgress.map((row) => `「${row.name}」${row.done}/${row.total}`).join(" · ")}
            </span>
          )}
        </p>
      )}
      <p className="hint week-hint">
        这一周从 {weekStats.from.slice(5).replace("-", "/")} 起算：练了 {weekStats.days} 天、{weekStats.items} 条；
        上周同期 {weekStats.prevDays} 天、{weekStats.prevMinutes} 分钟。
      </p>
      {extraTotalMinutes > 0 && (
        <p className="hint extra-time">
          <b>加餐练了 {extraTotalMinutes} 分钟</b>
          {extraStageLine ? ` · ${extraStageLine}` : ""}
        </p>
      )}
      <div className="goal">
        <div className="goal-head">
          <b>本周目标</b>
          {goal > 0 && goalStreak.weeks >= 2 && (
            <span className="goal-streak">连续 {goalStreak.weeks} 周达成</span>
          )}
          {goal > 0 && goalStreak.weeks === 0 && goalStreak.lastWeeks >= 2 && (
            <span className="goal-last" title={`上一串到 ${goalStreak.lastUntil}`}>
              上次连续 {goalStreak.lastWeeks} 周
            </span>
          )}
          <span className="goal-num">
            {goal > 0 ? `${goalState.done} / ${goalState.goal} 分钟` : "还没设"}
          </span>
        </div>
        {goal > 0 && (
          <div
            className="goal-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goalState.percent}
            aria-label={`本周目标 ${goalState.goal} 分钟，已完成 ${goalState.percent}%`}
          >
            <span style={{ width: `${goalState.percent}%` }} />
          </div>
        )}
        <div className="goal-foot">
          <span className="muted">
            {goal === 0
              ? weekStats.minutes > 0
                ? `按现在的节奏，这周大约 ${pace.projected} 分钟 · 设一个数，进度条就出来了`
                : "设一个数，进度条就出来了"
              : goalState.reached
                ? "这周目标达成了"
                : pace.left === 0
                  ? `这周就剩今天了，还差 ${goalState.remaining} 分钟`
                  : `还差 ${goalState.remaining} 分钟 · 接下来每天 ${pace.perDayNeeded} 分钟就够`}
          </span>
          <div className="goal-chips">
            {[30, 60, 90, 120].map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`chip${goal === minutes ? " on" : ""}`}
                aria-pressed={goal === minutes}
                onClick={() => setGoalTo(minutes)}
              >
                {minutes} 分钟
              </button>
            ))}
            {goal > 0 && (
              <button type="button" className="chip" onClick={() => setGoalTo(0)}>
                不设
              </button>
            )}
          </div>
        </div>
      </div>
      <div
        className="heat"
        role="img"
        aria-label={`练习热力图：最近 ${heat.weeks.length} 周练了 ${heat.days} 天，共 ${heat.total} 分钟`}
      >
        <div className="heat-days" aria-hidden="true">
          {["一", "", "三", "", "五", "", "日"].map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div className="heat-col">
          <div
            className="heat-months"
            aria-hidden="true"
            style={{ gridTemplateColumns: `repeat(${heat.weeks.length}, var(--heat-cell))` }}
          >
            {heat.months.map((month) => (
              <span key={month.week} style={{ gridColumn: month.week + 1 }}>
                {month.label}
              </span>
            ))}
          </div>
          <div
            className="heat-grid"
            ref={gridRef}
            role="group"
            aria-label="点一格看那天练了什么；方向键移动，左右一周、上下一天"
            onKeyDown={onGridKey}
          >
            {heat.weeks.flatMap((column, week) =>
              column.map((cell, weekday) => {
                const index = week * 7 + weekday;
                const on = cell.date === day;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    data-heat-index={index}
                    tabIndex={cell.future || index !== activeIndex ? -1 : 0}
                    disabled={cell.future}
                    aria-pressed={on}
                    aria-label={`${cell.date}，${cell.minutes > 0 ? `${cell.minutes} 分钟` : "没练"}`}
                    className={`heat-cell lv${cell.level}${cell.future ? " future" : ""}${on ? " on" : ""}`}
                    onClick={() => {
                      setCursor(index);
                      setDay(on ? null : cell.date);
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
        <p className="heat-legend">
          <span>
            最近 {heat.weeks.length} 周 · {heat.days} 天 · {heat.total} 分钟
          </span>
          <span className="heat-scale" aria-hidden="true">
            少
            {[0, 1, 2, 3, 4].map((level) => (
              <i key={level} className={`heat-cell lv${level}`} />
            ))}
            多
          </span>
        </p>
        <p className="heat-hint">点一格看那天练了什么</p>

        {day && (
          <div className="heat-detail">
            <div className="heat-detail-head">
              <b>{day}</b>
              <span>{WEEKDAYS[weekdayIndex(day)]}</span>
              <button type="button" className="btn-quiet" onClick={() => setDay(null)}>
                关掉
              </button>
            </div>
            {dayLog && dayLog.minutes > 0 ? (
              <>
                <p className="heat-detail-meta">
                  {dayLog.minutes} 分钟 · 第 {dayLog.stage + 1} 阶段「{stageOf(dayLog.stage).name}」
                  {dayLog.feel
                    ? ` · 感觉：${FEELS.find((feel) => feel.id === dayLog.feel)?.label ?? ""}`
                    : ""}
                </p>
                <ul className="heat-detail-list">
                  {dayLog.done.map((id) => (
                    <li key={id}>
                      {drillNames.get(id.replace(/^p:/, "")) ?? id}
                      {id.startsWith("p:") && <em>跟练</em>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="heat-detail-meta">那天没练。</p>
            )}
          </div>
        )}
      </div>

      <p className="heat-note">最近 7 天（分钟）</p>
      <div className="practice-week">
        {practice.weekMinutes.map((minutes, index) => (
          <div key={index} className={minutes > 0 ? "practice-day done" : "practice-day"}>
            <span
              className="practice-day-bar"
              style={{ height: `${Math.min(100, (minutes / 120) * 100)}%` }}
            />
            <span className="practice-day-label">{minutes > 0 ? `${minutes}` : "—"}</span>
          </div>
        ))}
      </div>

      <h3 className="stat-sub">这周</h3>
      <div className="report">
        <p className="report-line">
          <b>
            练了 {weekReport.days} 天 · {weekReport.minutes} 分钟 · {weekReport.items} 条
          </b>{" "}
          <span className={weekReport.deltaMinutes >= 0 ? "muted" : "muted"}>
            比上周同期 {weekReport.deltaMinutes >= 0 ? "+" : ""}
            {weekReport.deltaMinutes} 分钟
          </span>
        </p>
        <p className="report-line">
          {weekReport.busiest
            ? `最勤的是${WEEKDAYS[weekdayIndex(weekReport.busiest.date)]}（${weekReport.busiest.minutes} 分钟）`
            : "这周还没有练习记录"}
        </p>
        <p className="report-line">
          练习 {weekReport.kinds.practice} 条 · 跟练 {weekReport.kinds.follow} 条 · 节奏{" "}
          {weekReport.kinds.rhythm} 条
        </p>
        {weekReport.weak && (
          <p className="report-line report-next">
            下周先补：{WEEK_KIND_LABEL[weekReport.weak]}
          </p>
        )}
        {weekReport.missed.length > 0 && (
          <p className="report-line muted">
            这周还没练：
            {weekReport.missed.map((date) => WEEKDAYS[weekdayIndex(date)]).join("、")}
          </p>
        )}
      </div>

      {(todaySkips.length > 0 || topSkips.length > 0) && (
        <div className="skip-summary">
          <p className="skip-line">
            <b>今天跳过的</b>{" "}
            {todaySkips.length === 0
              ? "一条也没跳过"
              : `${todaySkips.length} 条：${todaySkips.map(skipName).join("、")}`}
          </p>
          {topSkips.length > 0 && (
            <p className="skip-line muted">
              最近一周最常跳过：{topSkips.map(([id, count]) => `${skipName(id)} ×${count}`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {pausedItems.length > 0 && (
        <div className="pause-summary">
          <p className="skip-line">
            <b>先不练的</b> {pausedItems.length} 条：
          </p>
          <ul className="pause-list">
            {pausedItems.map(([id, until]) => (
              <li className="pause-item" key={id} data-pause={id}>
                <span className="pause-name">{skipName(id)}</span>
                <span className="pause-until">{until.slice(5).replace("-", "/")} 回来</span>
                <button type="button" className="btn-quiet pause-resume" onClick={() => resume(id)}>
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="stat-sub">节奏与伴奏</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>
            {rhythmItems.length}/{RHYTHM_ITEMS.length}
          </b>
          <span>跟练过的条目</span>
        </div>
        <div className="stat-card">
          <b>{rhythmSessions}</b>
          <span>跟练次数</span>
        </div>
        <div className="stat-card">
          <b>{rhythmMinutes} 分钟</b>
          <span>跟练累计</span>
        </div>
        <div className="stat-card">
          <b>{topRhythm[0] ? `${topRhythm[0].bestBpm} BPM` : "—"}</b>
          <span>最高速度</span>
        </div>
      </div>

      <div className="stat-groups">
        {RHYTHM_GROUPS.map((group) => {
          const items = rhythmItemsOf(group);
          const done = items.filter((item) => rhythm[item.id]).length;
          const percent = items.length > 0 ? (done / items.length) * 100 : 0;
          return (
            <div className="stat-group" key={group}>
              <span className="stat-group-name">{group}</span>
              <span className="practice-progress">
                <span style={{ width: `${percent}%` }} />
              </span>
              <span className="stat-group-count">
                {done}/{items.length}
              </span>
            </div>
          );
        })}
      </div>

      {topRhythm.length > 0 ? (
        <ul className="stat-list">
          {topRhythm.map((item) => (
            <li key={item.id}>
              <span>{nameOf(item.id)}</span>
              <span className="muted">
                {item.bestBpm} BPM · 练 {item.sessions} 次
                {item.lastAt ? ` · ${item.lastAt.slice(5)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">还没有跟练记录。去节奏页点任意一条的「跟练」，练完点「记录成绩」。</p>
      )}

      {visibleCurves.length > 0 && (
        <>
          <h3 className="stat-sub">
            跟练进步
            {/* 只看某一套时，这里也只列这一套的曲线（v0.128.0） */}
            {setFilter && <span className="stat-sub-note">只看「{setFilter}」</span>}
          </h3>
          <ul className="curve-list">
            {visibleCurves.map((curve) => {
              const values = curve.points.map((point) => point.bpm);
              const spark = sparklineOf(values, 120, 30);
              const first = curve.points[0];
              const last = curve.points[curve.points.length - 1];
              const head = spark.dots[spark.dots.length - 1];
              const practice = curve.id.startsWith("p:");
              // 加餐的 id 是运行时生成的（`p:extra-<base36>`），`drillNames` 里没有它——
              // 记录里存了标题就先用标题，否则那一行只剩一串机器名（v0.127.1）
              const recordTitle = rhythm[curve.id]?.title;
              const name = recordTitle
                ? `${recordTitle} · 练习页`
                : practice
                  ? `${drillNames.get(curve.id.slice(2)) ?? curve.id.slice(2)} · 练习页`
                  : nameOf(curve.id);
              const picked = curvePoint?.id === curve.id ? curve.points[curvePoint.index] : null;
              const pickedIndex = picked ? curvePoint!.index : -1;
              const pickedDelta =
                picked && pickedIndex > 0 ? picked.bpm - curve.points[pickedIndex - 1].bpm : 0;
              // 这套记录里记下的「最卡的一处」：它发生在哪一天，那天的点就加一圈圈（v0.129.0）
              const record = rhythm[curve.id];
              const hardest = record?.hardest;
              const hardestDay = hardest?.at ?? "";
              const pickedIsHardest = !!picked && !!hardestDay && picked.date === hardestDay;
              const label = setFilter ? `${name}（只看「${setFilter}」）` : name;
              return (
                <li key={curve.id} data-curve-id={curve.id}>
                  <span className="curve-name" title={label}>
                    {name}
                  </span>
                  <svg
                    className="curve-svg"
                    viewBox="0 0 120 30"
                    // 点一下选最近的某一天（v0.128.0）；键盘上是 Tab 到这里再按回车 / 空格往下翻
                    role="button"
                    tabIndex={0}
                    aria-label={`${label}：${first.date} 的 ${first.bpm} BPM，到 ${last.date} 的 ${last.bpm} BPM，共 ${curve.points.length} 天。点一下看某一天，双击去练那天卡住的小节。`}
                    onClick={(event) => pickCurvePoint(event, curve.id, curve.points.length)}
                    onDoubleClick={(event) => openCurveDay(event, curve.id, curve.points.length)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      cycleCurvePoint(curve.id, curve.points.length);
                    }}
                  >
                    <title>{label}</title>
                    <path d={spark.d} />
                    {/* 透明底：不然点空白处（没压在线条上）不算点中这张图（v0.128.0） */}
                    <rect x={0} y={0} width={120} height={30} fill="transparent" />
                    <circle cx={head.x} cy={head.y} r={2} />
                    {/* 最卡的那一天的标记（v0.129.0）：空心圈叠在点上，不和「选中的点」抢位置。
                        v0.131.0：小数字本身就能点——直接去练那一小节（键盘回车也一样）。 */}
                    {spark.dots.map((dot, index) =>
                      hardestDay && curve.points[index]?.date === hardestDay ? (
                        <g
                          className="curve-hard-mark"
                          key={`hard-${dot.x}-${dot.y}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`卡了 ${hardest!.count} 次的那天，点一下直接去练第 ${hardest!.bar} 小节`}
                          onClick={(event) => {
                            // 别让这次点击同时落到整张图的「选中这一天」上
                            event.stopPropagation();
                            jumpToDay(curve.id, index);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            jumpToDay(curve.id, index);
                          }}
                        >
                          {/* 点击范围：空心圈只有 1px 描边，鼠标点在中间会穿过去落到图上的透明底 */}
                          <circle className="curve-hard-hit" cx={dot.x} cy={dot.y} r={7} />
                          <circle className="curve-hard" cx={dot.x} cy={dot.y} r={3.4} />
                          {/* 卡了几次（v0.130.0）：小字贴着圈，y 太靠上就写到下面，别被裁掉 */}
                          <text
                            className="curve-hard-n"
                            x={dot.x}
                            y={dot.y < 9 ? dot.y + 10 : dot.y - 5}
                          >
                            {hardest!.count}
                          </text>
                        </g>
                      ) : null,
                    )}
                    {picked && spark.dots[pickedIndex] && (
                      <circle
                        className="curve-picked"
                        cx={spark.dots[pickedIndex].x}
                        cy={spark.dots[pickedIndex].y}
                        r={2.6}
                      />
                    )}
                  </svg>
                  <span className="muted">
                    {first.bpm} → {last.bpm} BPM · {curve.points.length} 天
                  </span>
                  {picked && (
                    <span className="curve-day" role="status">
                      {picked.date.slice(5).replace("-", "/")} · {picked.bpm} BPM
                      {pickedDelta !== 0 && ` · 比上一次 ${pickedDelta > 0 ? "+" : ""}${pickedDelta}`}
                      {pickedIsHardest &&
                        ` · 那天卡在第 ${hardest!.bar} 小节${degreeName(hardest!.degree)}`}
                      {pickedIsHardest && "（双击去练）"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {visibleCurves.length === 0 && setFilter && (
        <p className="hint">
          「{setFilter}」这一套还没有曲线——跟练两天以上才会画出来。
        </p>
      )}

      {visibleSteadyCurves.length > 0 && (
        <>
          <h3 className="stat-sub">
            这几条的稳度
            <span className="stat-sub-note">越低越稳</span>
          </h3>
          <ul className="steady-curves">
            {visibleSteadyCurves.map((curve) => {
              // 标准差越小越稳，取负号让「稳」画在上面
              const spark = sparklineOf(
                curve.points.map((point) => -point.stdevMs),
                120,
                30,
              );
              const first = curve.points[0];
              const last = curve.points[curve.points.length - 1];
              const head = spark.dots[spark.dots.length - 1];
              const practice = curve.id.startsWith("p:");
              const recordTitle = rhythm[curve.id]?.title;
              const name = recordTitle
                ? `${recordTitle} · 练习页`
                : practice
                  ? `${drillNames.get(curve.id.slice(2)) ?? curve.id.slice(2)} · 练习页`
                  : nameOf(curve.id);
              return (
                <li key={curve.id}>
                  <span className="curve-name" title={name}>
                    {name}
                  </span>
                  <svg
                    className="curve-svg steady-curve-svg"
                    viewBox="0 0 120 30"
                    role="img"
                    aria-label={`${name} 的稳度：${first.date} ±${first.stdevMs.toFixed(0)} 毫秒，到 ${last.date} ±${last.stdevMs.toFixed(0)} 毫秒，共 ${curve.points.length} 遍，越低越稳。`}
                  >
                    <title>{name}</title>
                    <path d={spark.d} />
                    <circle cx={head.x} cy={head.y} r={2} />
                  </svg>
                  <span className="muted">
                    ±{first.stdevMs.toFixed(0)} → ±{last.stdevMs.toFixed(0)} 毫秒 ·{" "}
                    {curve.points.length} 遍
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* 最卡的地方（v0.100.0）：跟练时点开单练最多的那一级，按级数归堆 */}
      {hardTally.length > 0 && (
        <>
          <h3 className="stat-sub">最卡的地方</h3>
          {/* 按级数筛（v0.107.0）：只看第 5 级的条目，修的时候就盯这一种 */}
          <div className="hardest-filter" role="group" aria-label="按级数筛选最卡的条目">
            <button
              type="button"
              className={`chip${degreeFilter === null ? " on" : ""}`}
              aria-pressed={degreeFilter === null}
              onClick={() => setDegreeFilter(null)}
            >
              全部
            </button>
            {hardTally.slice(0, 7).map((item) => (
              <button
                key={item.degree}
                type="button"
                className={`chip${degreeFilter === item.degree ? " on" : ""}`}
                aria-pressed={degreeFilter === item.degree}
                onClick={() =>
                  setDegreeFilter((current) => (current === item.degree ? null : item.degree))
                }
              >
                {degreeName(item.degree)}
              </button>
            ))}
          </div>
          {/* 按阶段筛（v0.110.0）：级数之外再按「第几阶段的练习」筛，两种筛法叠在一起 */}
          {stageOptions.length > 1 && (
            <div className="hardest-filter" role="group" aria-label="按阶段筛选最卡的条目">
              <span className="hardest-filter-label">按阶段</span>
              <button
                type="button"
                className={`chip${stageFilter === null ? " on" : ""}`}
                aria-pressed={stageFilter === null}
                onClick={() => setStageFilter(null)}
              >
                全部
              </button>
              {stageOptions.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={`chip${stageFilter === stage ? " on" : ""}`}
                  aria-pressed={stageFilter === stage}
                  title={stageOf(stage).name}
                  onClick={() =>
                    setStageFilter((current) => (current === stage ? null : stage))
                  }
                >
                  第 {stage + 1} 阶段
                </button>
              ))}
            </div>
          )}
          {stageFilter !== null && (
            <p className="hardest-note">上面的归堆还是全部数据；阶段只筛下面按条目的列表。</p>
          )}
          {/* 按「卡了几次」筛（v0.123.0）：卡一两次的算手滑 / 没热开，四五次以上才是真卡住 */}
          <div className="hardest-count" role="group" aria-label="按卡住的次数筛选最卡的条目">
            <span className="hardest-filter-label">卡了几次</span>
            <button
              type="button"
              className={`chip${countFilter === 0 ? " on" : ""}`}
              aria-pressed={countFilter === 0}
              onClick={() => setCountFilter(0)}
            >
              全部
            </button>
            {([2, 4] as const).map((times, index) => (
              <button
                key={times}
                type="button"
                className={`chip${countFilter === times ? " on" : ""}${
                  countTally[index] === 0 ? " chip-empty" : ""
                }`}
                aria-pressed={countFilter === times}
                title={`只显示跟练时卡过 ${times} 次以上的条目（现在这组筛选里有 ${countTally[index]} 条）`}
                onClick={() => setCountFilter((current) => (current === times ? 0 : times))}
              >
                ≥{times} 次
                <span className="chip-n" aria-hidden="true">
                  {countTally[index]}
                </span>
              </button>
            ))}
          </div>
          {countFilter !== 0 && (
            <p className="hardest-note">只留跟练时卡过 {countFilter} 次以上的条目——跟下面「单独练过」不是一回事。</p>
          )}
          {/* 按「单独练过几次」筛（v0.114.0）：回头单练过的那几处，未必是卡得最狠的——分开看 */}
          <div className="hardest-spot" role="group" aria-label="按单独练过的次数筛选最卡的条目">
            <span className="hardest-filter-label">单独练过</span>
            <button
              type="button"
              className={`chip${spotFilter === 0 ? " on" : ""}`}
              aria-pressed={spotFilter === 0}
              onClick={() => setSpotFilter(0)}
            >
              全部
            </button>
            {([1, 3] as const).map((times) => (
              <button
                key={times}
                type="button"
                className={`chip${spotFilter === times ? " on" : ""}`}
                aria-pressed={spotFilter === times}
                title={`只显示单独练过 ${times} 次以上的条目`}
                onClick={() => setSpotFilter((current) => (current === times ? 0 : times))}
              >
                ≥{times} 次
              </button>
            ))}
          </div>
          {spotFilter !== 0 && (
            <p className="hardest-note">
              只留「只练这一处」点过 {spotFilter} 次以上的条目——跟上面「卡了几次」不是一回事。
            </p>
          )}
          {/* 存下的视角（v0.111.0）：两排叠起来的组合存一次，以后一键复原；v0.112.0 起能起名字 */}
          {(hasFilter || views.length > 0) && (
            <div className="hardest-views">
              <span className="hardest-filter-label">存的视角</span>
              {views.map((view) => {
                const on =
                  view.degree === degreeFilter &&
                  view.stage === stageFilter &&
                  (view.spot ?? 0) === spotFilter &&
                  (view.count ?? 0) === countFilter &&
                  (view.set ?? "") === (setFilter ?? "") &&
                  (view.weak ?? 0) === currentWeak;
                return (
                  <span key={view.id} className={`view-pill${on ? " on" : ""}`}>
                    <button
                      type="button"
                      className="view-apply"
                      aria-pressed={on}
                      title={view.name ? `${view.name} · ${view.label}` : view.label}
                      onClick={() => applyView(view)}
                    >
                      {viewShortLabel(view)}
                    </button>
                    {(view.sessions ?? 0) > 0 && (
                      <span className="view-meta" aria-hidden="true">
                        练了 {view.sessions} 次
                      </span>
                    )}
                    {(view.pace ?? 0) !== 0 && (
                      <span
                        className={`view-pace${(view.pace ?? 0) > 0 ? " up" : " down"}`}
                        aria-hidden="true"
                      >
                        {(view.pace ?? 0) > 0 ? `快 ${view.pace}` : `慢 ${Math.abs(view.pace ?? 0)}`}
                      </span>
                    )}
                    <button
                      type="button"
                      className="view-del"
                      aria-label={`删掉视角「${view.name ?? view.label}」`}
                      onClick={() => dropView(view.id)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {hasFilter && !currentSaved && !namingView && (
                <button
                  type="button"
                  className="chip view-save"
                  onClick={() => setNamingView(true)}
                >
                  存下这组筛选
                </button>
              )}
              {namingView && (
                <span className="view-namer">
                  <input
                    type="text"
                    className="view-name"
                    value={viewName}
                    maxLength={12}
                    placeholder={viewLabel(
                      degreeFilter,
                      stageFilter,
                      spotFilter,
                      setFilter ?? "",
                      currentWeak,
                      currentSessions,
                      currentAvgBpm,
                      countFilter,
                      currentPace,
                    )}
                    aria-label="给这组筛选起个名字（可以不填）"
                    onChange={(event) => setViewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") storeCurrentView();
                      if (event.key === "Escape") cancelNaming();
                    }}
                  />
                  <button type="button" className="chip view-save" onClick={storeCurrentView}>
                    存
                  </button>
                  <button type="button" className="btn-quiet view-cancel" onClick={cancelNaming}>
                    取消
                  </button>
                </span>
              )}
            </div>
          )}
          <ul className="hardest-list">
            {hardTally.slice(0, 5).map((item) => (
              <li
                key={item.degree}
                data-hardest={item.degree}
                className={
                  degreeFilter !== null && degreeFilter !== item.degree ? "hardest-dim" : undefined
                }
              >
                <button
                  type="button"
                  className="hardest-row"
                  data-hardest-row={item.degree}
                  aria-pressed={degreeFilter === item.degree}
                  onClick={() =>
                    setDegreeFilter(degreeFilter === item.degree ? null : item.degree)
                  }
                  title={degreeFilter === item.degree ? "取消筛选" : `只看第 ${item.degree} 级`}
                >
                  <b>
                    {degreeName(item.degree)}
                    {item.name ? `（${item.name}）` : ""}
                  </b>
                  <span className="muted">
                    {item.items} 条练习里单独练过 {item.count} 次
                  </span>
                  <span className="hardest-row-go">
                    {degreeFilter === item.degree ? "已筛" : "只看这级"} →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {setFilter !== null && (
            <p className="hardest-note hardest-set-note">
              只看「{setFilter}」这一套。
              <button type="button" className="btn-quiet" onClick={() => setSetFilter(null)}>
                看全部
              </button>
            </p>
          )}
          {hardItems.length === 0 && hasFilter && (
            <p className="hardest-note hardest-empty">
              {/* 空列表要说清是「没有」，不是「没加载出来」（v0.126.0）；
                  后面再给一个放宽一档的按钮（v0.127.0） */}
              {countFilter !== 0
                ? `这组筛选里没有跟练时卡过 ${countFilter} 次以上的条目。`
                : "这组筛选下没有条目。"}
              {relaxStep && (
                <button
                  type="button"
                  className="hardest-empty-action"
                  onClick={() => relaxStep.run()}
                >
                  {relaxStep.label}
                </button>
              )}
            </p>
          )}
          {relaxNotice && relaxNotice.key === filterKey && (
            <p className="hardest-note hardest-relax" role="status">
              {relaxNotice.text}
            </p>
          )}
          {hardItems.length > 0 && (
            <ul className="hardest-items">
              {hardItems.map((item, index) => {
                // 同一套组合的条目之间插一行小标题（v0.117.0）：靠相邻顺序说话不够直白
                const groupHead =
                  item.setName && item.setName !== hardItems[index - 1]?.setName ? item.setName : null;
                // 这一套的「比上周」详情（v0.126.0）：标题里要把加权用的次数写清楚
                const pace = groupHead ? setPaceInfoOf(groupHead) : null;
                return (
                  <Fragment key={item.id}>
                    {groupHead && (
                      <li className="hardest-set">
                        <span className="hardest-set-row">
                          <button
                            type="button"
                            className="hardest-set-btn"
                            data-hardest-set={groupHead}
                            aria-pressed={setFilter === groupHead}
                            onClick={() =>
                              setSetFilter(setFilter === groupHead ? null : groupHead)
                            }
                            title={
                              setFilter === groupHead
                                ? "取消筛选，看全部条目"
                                : `只看「${groupHead}」这一套`
                            }
                          >
                            <span className="hardest-set-name">组合 · {groupHead}</span>
                          </button>
                          {setWeak.get(groupHead) && (
                            <button
                              type="button"
                              className="hardest-set-weak"
                              aria-pressed={
                                degreeFilter === setWeak.get(groupHead)!.degree &&
                                setFilter === groupHead
                              }
                              onClick={() => {
                                const weak = setWeak.get(groupHead)!.degree;
                                // 这枚按钮在「这一套」的行里，所以第一次点先把范围收窄到这套，
                                // 第二次点退回「这套全部」——而不是把级数清掉变成看全部条目（v0.121.0）
                                if (degreeFilter === weak) {
                                  setDegreeFilter(null);
                                  return;
                                }
                                setSetFilter(groupHead);
                                setDegreeFilter(weak);
                              }}
                              title="只看这一级——这一套里卡得最多的那一级"
                              data-short={`第 ${setWeak.get(groupHead)!.degree} 级 ×${
                                setWeak.get(groupHead)!.count
                              } 次`}
                            >
                              <span className="hardest-set-weak-long">
                                整体卡在
                                {degreeName(setWeak.get(groupHead)!.degree)} ×
                                {setWeak.get(groupHead)!.count} 次
                              </span>
                            </button>
                          )}
                          {setMeta.get(groupHead) && setMeta.get(groupHead)!.sessions > 0 && (
                            <button
                              type="button"
                              className="hardest-set-meta"
                              // 点一下跳到下面「跟练进步」里这一套的那条曲线（v0.127.0）：
                              // 「练了 7 次」这种数字光看没用，得能看见它长什么样。
                              aria-label={`跳到「${groupHead}」的跟练曲线`}
                              title="看这一套的进步曲线"
                              onClick={() => jumpToCurve(groupHead)}
                              data-short={`${setMeta.get(groupHead)!.sessions} 次${
                                setMeta.get(groupHead)!.bpmCount > 0
                                  ? ` · ${Math.round(
                                      setMeta.get(groupHead)!.bpmSum / setMeta.get(groupHead)!.bpmCount,
                                    )} BPM`
                                  : ""
                              }${
                                setMeta.get(groupHead)!.lastAt
                                  ? ` · ${setMeta.get(groupHead)!.lastAt.slice(5).replace("-", "/")}`
                                  : ""
                              }`}
                            >
                              <span className="hardest-set-meta-long">
                                练了 {setMeta.get(groupHead)!.sessions} 次
                                {setMeta.get(groupHead)!.bpmCount > 0
                                  ? ` · 平均 ${Math.round(
                                      setMeta.get(groupHead)!.bpmSum /
                                        setMeta.get(groupHead)!.bpmCount,
                                    )} BPM`
                                  : ""}
                                {setMeta.get(groupHead)!.lastAt
                                  ? ` · 最近 ${setMeta.get(groupHead)!.lastAt.slice(5).replace("-", "/")}`
                                  : ""}
                              </span>
                            </button>
                          )}
                          {pace && (
                            <span
                              className={`hardest-set-pace${pace.delta > 0 ? " up" : pace.delta < 0 ? " down" : ""}`}
                              // 加权怎么算的写进 title（v0.127.0）：数字有出处才可信
                              title={`近 7 天 ${pace.recentWeight} 次练习的加权平均 ${pace.recentBpm} BPM，前 7 天 ${pace.beforeWeight} 次 ${pace.beforeBpm} BPM——差 ${
                                pace.delta > 0 ? "+" : ""
                              }${pace.delta} BPM（按练习次数加权，不是两边各占一半）`}
                              data-short={
                                pace.delta > 0
                                  ? `快 ${pace.delta}`
                                  : pace.delta < 0
                                    ? `慢 ${Math.abs(pace.delta)}`
                                    : "持平"
                              }
                            >
                              {/* 窄屏只写「快 10」（v0.125.0）——整句留着会把组合那行顶到第二行 */}
                              <span className="hardest-set-pace-long">
                                {pace.delta > 0
                                  ? `比上周快 ${pace.delta} BPM`
                                  : pace.delta < 0
                                    ? `比上周慢 ${Math.abs(pace.delta)} BPM`
                                    : "跟上周一样"}
                              </span>
                            </span>
                          )}
                          <span className="hardest-set-go">
                            {/* 窄屏把「只看这套」四个字收起来，只留箭头（v0.123.0）——
                                这一行改成单行排了，四个字挤不下 */}
                            <span className="hardest-set-go-long">
                              {setFilter === groupHead ? "已筛" : "只看这套"}
                            </span>
                            {/* 窄屏只留一个「看」字（v0.125.0）：纯箭头看不出是能点的 */}
                            <span className="hardest-set-go-short" aria-hidden="true">
                              看
                            </span>
                            <span aria-hidden="true">→</span>
                          </span>
                        </span>
                      </li>
                    )}
                    <li data-hardest-item={item.id}>
                      <button
                        type="button"
                        className="hardest-jump"
                        onClick={() => jumpTo(item.id)}
                        title="跳到那一段"
                      >
                        <span>{titleOf(item.id)}</span>
                        <span className="muted">
                          第 {item.hardest.bar} 小节{degreeName(item.hardest.degree)}
                          {item.hardest.name ? `（${item.hardest.name}）` : ""} · 单独练过{" "}
                          {item.hardest.count} 次
                        </span>
                        <span className="hardest-go" aria-hidden="true">
                          →
                        </span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
          <p className="hint hardest-hint">
            统计最近 7 天练过的条目：上面按级数归堆（该补哪种和声），下面按条目排（哪一段最卡）。
          </p>
        </>
      )}

      <h3 className="stat-sub">和弦转换</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>
            {chordDone}/{PROGRESSIONS.length}
          </b>
          <span>练过的进行</span>
        </div>
        <div className="stat-card">
          <b>{chordBest > 0 ? `${chordBest} BPM` : "—"}</b>
          <span>最快速度</span>
        </div>
        <div className="stat-card">
          <b>{chordMinutes} 分钟</b>
          <span>转换累计</span>
        </div>
      </div>
      <ul className="stat-list">
        {PROGRESSIONS.map((progression) => {
          const record = chords[progression.id];
          return (
            <li key={progression.id} data-chord={progression.id}>
              <span>{progression.name}</span>
              <span className="muted">
                {record
                  ? `${record.bestBpm} BPM · 练 ${record.sessions} 次${record.lastAt ? ` · ${record.lastAt.slice(5)}` : ""}`
                  : "还没练过"}
              </span>
            </li>
          );
        })}
      </ul>
      {chordDone === 0 ? (
        <p className="hint">去和弦页最下面的「转换练习」，一分钟一局，练完点「记成绩」。</p>
      ) : null}

      <h3 className="stat-sub">扒谱 · 听辨</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <b>{ear.rounds > 0 ? `${ear.best}/${EAR_ROUND}` : "—"}</b>
          <span>最好成绩</span>
        </div>
        <div className="stat-card">
          <b>{ear.rounds} 轮</b>
          <span>练过的轮数</span>
        </div>
        <div className="stat-card">
          <b>{earRate === null ? "—" : `${earRate}%`}</b>
          <span>总正确率（{earCorrect}/{earTotal} 题）</span>
        </div>
      </div>
      <ul className="stat-list">
        {earKinds.map((kind) => (
          <li key={kind.id} data-ear={kind.id}>
            <span>{kind.label}</span>
            <span className="muted">
              {kind.total > 0 ? `${kind.correct}/${kind.total} · ${kind.rate}%` : "还没练过"}
            </span>
          </li>
        ))}
      </ul>
      {ear.rounds === 0 ? (
        <p className="hint">去扒谱页的「练 · 听辨」，一轮 8 题，五种题型挑一种就能开始。</p>
      ) : (
        <p className="hint">
          上次练是 {ear.lastAt ? ear.lastAt.slice(5).replace("-", "/") : "—"}
          {" · "}
          <button type="button" className="btn-quiet" onClick={() => goTo("ear")}>
            再去练一轮
          </button>
        </p>
      )}
      {earSpark && (
        <div className="ear-trend">
          <svg
            className="curve-svg"
            viewBox="0 0 120 30"
            role="img"
            aria-label={`最近 ${earDays.length} 个练习日的正确率：从 ${earRates[0]}% 到 ${earRates[earRates.length - 1]}%`}
          >
            <path d={earSpark.d} />
            <circle cx={earSpark.dots[earSpark.dots.length - 1].x} cy={earSpark.dots[earSpark.dots.length - 1].y} r={2} />
          </svg>
          <span className="muted">
            最近 {earDays.length} 个练习日正确率 {earRates[0]}% → {earRates[earRates.length - 1]}%
            （{earDays[0][0].slice(5).replace("-", "/")} → {earDays[earDays.length - 1][0].slice(5).replace("-", "/")}）
          </span>
        </div>
      )}

      <h3 className="stat-sub">稳不稳</h3>
      {steadyRuns.length === 0 ? (
        <p className="hint">
          去练习页最下面的「稳不稳」，跟着节拍器弹四小节，会算出每拍偏差的标准差。
          <button type="button" className="btn-quiet" onClick={() => goTo("practice", "steady")}>
            去练一遍
          </button>
        </p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <b>{steadyBest ? steadyBest.stdevMs.toFixed(0) + " 毫秒" : "—"}</b>
              <span>最稳的一次 标准差</span>
            </div>
            <div className="stat-card">
              <b>{steadyLast ? steadyLast.stdevMs.toFixed(0) + " 毫秒" : "—"}</b>
              <span>最近一次 标准差</span>
            </div>
            <div className="stat-card">
              <b>{steadyRuns.length} 遍</b>
              <span>练过的遍数</span>
            </div>
          </div>
          {steadySpark && (
            <div className="ear-trend" data-steady-trend>
              <svg
                className="curve-svg steady-svg"
                viewBox="0 0 120 30"
                role="button"
                tabIndex={0}
                onClick={(event) => pickSteadyPoint(event)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSteadyPick((current) =>
                    current === null || current >= steadyWinRuns.length - 1 ? 0 : current + 1,
                  );
                }}
                aria-label={
                  "最近 " + steadyPoints.length + " 遍的标准差：从 " + Math.round(steadyPoints[0]) + " 毫秒到 " + Math.round(steadyPoints[steadyPoints.length - 1]) + " 毫秒，越低越稳；" +
                  "最稳的是第 " + (steadyBestIndex + 1) + " 遍（" + Math.round(steadyPoints[steadyBestIndex]) + " 毫秒），最快的一遍是 " + (steadyWindowRuns[steadyFastIndex]?.bpm ?? 0) + " BPM"
                }
              >
                <path d={steadySpark.d} />
                <circle cx={steadySpark.dots[steadySpark.dots.length - 1].x} cy={steadySpark.dots[steadySpark.dots.length - 1].y} r={2} />
                {steadyFastIndex >= 0 && (
                  <rect
                    className="curve-fast"
                    x={steadySpark.dots[steadyFastIndex].x - 2}
                    y={steadySpark.dots[steadyFastIndex].y - 2}
                    width={4}
                    height={4}
                  >
                    <title>最快的一遍：{steadyWindowRuns[steadyFastIndex]?.bpm ?? 0} BPM</title>
                  </rect>
                )}
                {steadyPick !== null && steadySpark.dots[steadyPick] && (
                  <circle
                    className="curve-picked"
                    cx={steadySpark.dots[steadyPick].x}
                    cy={steadySpark.dots[steadyPick].y}
                    r={2.6}
                  />
                )}
                {steadyBestIndex >= 0 && (
                  <circle
                    className="curve-best"
                    cx={steadySpark.dots[steadyBestIndex].x}
                    cy={steadySpark.dots[steadyBestIndex].y}
                    r={2.8}
                  >
                    <title>最稳的一遍：{Math.round(steadyPoints[steadyBestIndex] ?? 0)} 毫秒</title>
                  </circle>
                )}
              </svg>
              <span className="muted">
                最近 {steadyPoints.length} 遍：{Math.round(steadyPoints[0])} → {Math.round(steadyPoints[steadyPoints.length - 1])} 毫秒（越低越稳）
                <span className="steady-marks">
                  <i className="mark-best" aria-hidden="true" /> 最稳
                  <i className="mark-fast" aria-hidden="true" /> 最快
                </span>
              </span>
              {steadyPicked && (
                <>
                  <span className="steady-day" role="status">
                    {steadyPicked.date.slice(5).replace("-", "/")} · {steadyPicked.bpm} BPM ·{" "}
                    {/* v0.143.0：只弹了几小节的，写清是哪一段，别让人以为是整段 */}
                    {steadyPicked.fromBar && steadyPicked.toBar
                      ? `第 ${steadyPicked.fromBar}–${steadyPicked.toBar} 小节`
                      : `${steadyPicked.bars} 小节`}{" "}
                    · ±
                    {Math.round(steadyPicked.stdevMs)} 毫秒 · 漂移 {steadyPicked.driftMsPerBeat > 0 ? "+" : ""}
                    {steadyPicked.driftMsPerBeat} 毫秒/拍 · {steadyPicked.hits} 下
                  </span>
                  {steadyCompare && <span className="steady-vs">{steadyCompare}</span>}
                  <button
                    type="button"
                    className="btn-quiet steady-again"
                    onClick={() =>
                      goTo("practice", "steady", {
                        sb: String(steadyPicked.bpm),
                        sbar: String(steadyPicked.bars),
                      })
                    }
                  >
                    按这个速度再弹一遍
                  </button>
                </>
              )}
            </div>
          )}
          <p className="hint">
            {steadyBest ? "最稳的一遍是 " + steadyBest.bpm + " BPM、" + steadyBest.bars + " 小节。" : ""}
            <button type="button" className="btn-quiet" onClick={() => goTo("practice", "steady")}>
              再弹一遍
            </button>
            <span className="steady-clear">
              <select
                className="steady-clear-pick"
                aria-label="清掉多少遍「稳不稳」的记录"
                value={steadyClear}
                onChange={(event) => {
                  const raw = event.target.value;
                  const next: "all" | 5 | 10 = raw === "all" ? "all" : (Number(raw) as 5 | 10);
                  setSteadyClear(next);
                  saveSettings({ ...loadSettings(), steadyClear: next });
                }}
              >
                <option value="all">全部 {steadyRuns.length} 遍</option>
                <option value="5">最近 5 遍</option>
                <option value="10">最近 10 遍</option>
              </select>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                  if (steadyRuns.length === 0) return;
                  const removeCount = steadyClear === "all" ? steadyRuns.length : Math.min(steadyClear, steadyRuns.length);
                  setSteadyUndo(steadyRuns);
                  setSteadyRemoved(removeCount);
                  restoreRuns(steadyRuns.slice(0, steadyRuns.length - removeCount));
                  setSteadyBump((value) => value + 1);
                  setSteadyPick(null);
                }}
              >
                清掉
              </button>
            </span>
          </p>
        </>
      )}

      {steadyUndo && (
        <UndoToast
          message={`清掉了 ${steadyRemoved} 遍「稳不稳」的记录（还剩 ${Math.max(0, steadyUndo.length - steadyRemoved)} 遍）`}
          onUndo={() => {
            restoreRuns(steadyUndo);
            setSteadyUndo(null);
            setSteadyBump((value) => value + 1);
          }}
          onClose={() => setSteadyUndo(null)}
        />
      )}

      <h3 className="stat-sub">最近战绩</h3>
      {summary.perfectCount === 0 && summary.completed === 0 ? (
        <p className="hint">还没有记录。去「音阶游戏」打一关，这里就会长出来。</p>
      ) : (
        <ul className="stat-list">
          {LEVELS.filter((l) => progress[l.id]?.completed)
            .slice(-5)
            .reverse()
            .map((l) => {
              const p = progress[l.id]!;
              return (
                <li key={l.id}>
                  <span>
                    {l.id} · {l.title}
                  </span>
                  <span className="muted">
                    <Stars n={p.stars} /> {p.bestMs !== null ? fmt(p.bestMs) : "未全对"} · 尝试 {p.attempts} 次
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
