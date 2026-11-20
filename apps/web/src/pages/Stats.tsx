import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  dateKeyOf,
  DRILLS,
  FEELS,
  hardestTally,
  heatmapOf,
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
import { goTo, parseHash } from "../lib/nav";
import { earTrendOf } from "../lib/ear-trend";
import { RHYTHM_GROUPS, RHYTHM_ITEMS, rhythmItemById, rhythmItemsOf } from "../lib/rhythm-index";
import { loadPatterns } from "../lib/patterns";
import { loadExtras } from "../lib/plan";
import { loadSets } from "../lib/plan-sets";
import { fmt, fmtSpan } from "../lib/format";
import { loadViews, promoteView, removeView, saveView, viewLabel, type StatsView } from "../lib/stats-views";
import { degreeName } from "../lib/degrees";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Stars from "../components/Stars";

/** 统计页：全部来自本机 localStorage，没有账号也没有上报。 */
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEK_KIND_LABEL = { practice: "练习页的关卡", follow: "跟练", rhythm: "节奏页的条目" } as const;
/** 「按级数筛」的那一个数字存在哪儿（v0.109.0）：地址栏 + 一个会话级的备份键。 */
const DEGREE_FILTER_KEY = "guitar.stats.degree";
/** 按阶段筛的值（v0.111.0）：和级数一样两头都写，`?s=1`。 */
const STAGE_FILTER_KEY = "guitar.stats.stage";
/** 「单独练过几次」那排（v0.115.0）：`?p=3`。 */
const SPOT_FILTER_KEY = "guitar.stats.spot";

/** 读「单独练过几次」：只认 1 / 3，其余一律当「全部」。 */
function readSpotFilter(): 0 | 1 | 3 {
  const value = readFilter("p", SPOT_FILTER_KEY, 1, 3);
  return value === 1 || value === 3 ? value : 0;
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
function saveFilters(degree: number | null, stage: number | null, spot: 0 | 1 | 3 = 0): void {
  if (degree === null) window.sessionStorage.removeItem(DEGREE_FILTER_KEY);
  else window.sessionStorage.setItem(DEGREE_FILTER_KEY, String(degree));
  if (stage === null) window.sessionStorage.removeItem(STAGE_FILTER_KEY);
  else window.sessionStorage.setItem(STAGE_FILTER_KEY, String(stage));
  if (spot === 0) window.sessionStorage.removeItem(SPOT_FILTER_KEY);
  else window.sessionStorage.setItem(SPOT_FILTER_KEY, String(spot));

  const route = parseHash(window.location.hash);
  if (!route || route.tab !== "stats") return;
  const query = { ...route.query };
  if (degree === null) delete query.d;
  else query.d = String(degree);
  if (stage === null) delete query.s;
  else query.s = String(stage);
  if (spot === 0) delete query.p;
  else query.p = String(spot);
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
  const practiceFollows = Object.keys(rhythm).filter((id) => id.startsWith("p:"));
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
  // 不进地址栏、不进视角——它是一次性的「这套我认得的」临时筛选，不是长期视角。
  const [setFilter, setSetFilter] = useState<string | null>(null);
  useEffect(() => {
    saveFilters(degreeFilter, stageFilter, spotFilter);
  }, [degreeFilter, stageFilter, spotFilter]);
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
        stage: stageById.get(bare) ?? (record.title ? stageByName.get(record.title) ?? null : null),
      };
    })
    .sort((a, b) => {
      // 先按组合归堆：同一套的条目相邻，组合之间按它们今天进计划的先后
      const setA = a.setRank ?? Number.MAX_SAFE_INTEGER;
      const setB = b.setRank ?? Number.MAX_SAFE_INTEGER;
      if (setA !== setB) return setA - setB;
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return b.hardest.count - a.hardest.count;
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
        (setFilter === null || item.setName === setFilter),
    )
    .slice(0, 4);
  // 存下的视角（v0.111.0）：现在这组筛选有没有存过 / 能不能存
  const hasFilter = degreeFilter !== null || stageFilter !== null || spotFilter !== 0;
  const currentSaved = views.some(
    (view) =>
      view.degree === degreeFilter &&
      view.stage === stageFilter &&
      (view.spot ?? 0) === spotFilter,
  );
  // 起名字（v0.112.0）：点「存下这组筛选」先出一个输入框，名字可以不填（不填就用拼出来的那串）
  const [namingView, setNamingView] = useState(false);
  const [viewName, setViewName] = useState("");
  function applyView(view: StatsView): void {
    setDegreeFilter(view.degree);
    setStageFilter(view.stage);
    setSpotFilter(view.spot ?? 0);
    // 用过的视角挪到最后 = 渲染时排在最前（v0.113.0）
    setViews(promoteView(view.id));
  }
  function storeCurrentView(): void {
    setViews(saveView(degreeFilter, stageFilter, spotFilter, viewName));
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

      {curves.length > 0 && (
        <>
          <h3 className="stat-sub">跟练进步</h3>
          <ul className="curve-list">
            {curves.map((curve) => {
              const values = curve.points.map((point) => point.bpm);
              const spark = sparklineOf(values, 120, 30);
              const first = curve.points[0];
              const last = curve.points[curve.points.length - 1];
              const head = spark.dots[spark.dots.length - 1];
              const practice = curve.id.startsWith("p:");
              const name = practice
                ? `${drillNames.get(curve.id.slice(2)) ?? curve.id.slice(2)} · 练习页`
                : nameOf(curve.id);
              return (
                <li key={curve.id}>
                  <span className="curve-name">{name}</span>
                  <svg
                    className="curve-svg"
                    viewBox="0 0 120 30"
                    role="img"
                    aria-label={`${first.date} 的 ${first.bpm} BPM，到 ${last.date} 的 ${last.bpm} BPM，共 ${curve.points.length} 天`}
                  >
                    <path d={spark.d} />
                    <circle cx={head.x} cy={head.y} r={2} />
                  </svg>
                  <span className="muted">
                    {first.bpm} → {last.bpm} BPM · {curve.points.length} 天
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
                  (view.spot ?? 0) === spotFilter;
                return (
                  <span key={view.id} className={`view-pill${on ? " on" : ""}`}>
                    <button
                      type="button"
                      className="view-apply"
                      aria-pressed={on}
                      title={view.name ? `${view.name} · ${view.label}` : view.label}
                      onClick={() => applyView(view)}
                    >
                      {view.name ?? view.label}
                    </button>
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
                    placeholder={viewLabel(degreeFilter, stageFilter, spotFilter)}
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
          {hardItems.length > 0 && (
            <ul className="hardest-items">
              {hardItems.map((item, index) => {
                // 同一套组合的条目之间插一行小标题（v0.117.0）：靠相邻顺序说话不够直白
                const groupHead =
                  item.setName && item.setName !== hardItems[index - 1]?.setName ? item.setName : null;
                return (
                  <Fragment key={item.id}>
                    {groupHead && (
                      <li className="hardest-set">
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
                          组合 · {groupHead}
                          <span className="hardest-set-go">
                            {setFilter === groupHead ? "已筛" : "只看这套"} →
                          </span>
                        </button>
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
