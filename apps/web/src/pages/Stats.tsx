import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { goTo } from "../lib/nav";
import { earTrendOf } from "../lib/ear-trend";
import { RHYTHM_GROUPS, RHYTHM_ITEMS, rhythmItemById, rhythmItemsOf } from "../lib/rhythm-index";
import { fmt, fmtSpan } from "../lib/format";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Stars from "../components/Stars";

/** 统计页：全部来自本机 localStorage，没有账号也没有上报。 */
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEK_KIND_LABEL = { practice: "练习页的关卡", follow: "跟练", rhythm: "节奏页的条目" } as const;
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

  // 最卡的地方（v0.100.0）：跟练时点级数方块单练过的那一小节，按级数归堆。
  // 只看最近 7 天练过的条目——一个月前那条不该影响这周的结论。
  const hardTally = hardestTally(rhythm, addDays(today, -6));
  // 同一份数据按「条目」再排一遍（v0.101.0）：哪一段最卡、卡在哪一小节
  const hardItems = Object.entries(rhythm)
    .filter(([, record]) => record.hardest && record.lastAt && record.lastAt >= addDays(today, -6))
    .map(([id, record]) => ({ id, hardest: record.hardest! }))
    .sort((a, b) => b.hardest.count - a.hardest.count)
    .slice(0, 4);

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
      </div>
      <p className="hint week-hint">
        这一周从 {weekStats.from.slice(5).replace("-", "/")} 起算：练了 {weekStats.days} 天、{weekStats.items} 条；
        上周同期 {weekStats.prevDays} 天、{weekStats.prevMinutes} 分钟。
      </p>
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
          <ul className="hardest-list">
            {hardTally.slice(0, 5).map((item) => (
              <li key={item.degree} data-hardest={item.degree}>
                <b>
                  第 {item.degree} 级{item.name ? `（${item.name}）` : ""}
                </b>
                <span className="muted">
                  {item.items} 条练习里单独练过 {item.count} 次
                </span>
              </li>
            ))}
          </ul>
          {hardItems.length > 0 && (
            <ul className="hardest-items">
              {hardItems.map((item) => (
                <li key={item.id} data-hardest-item={item.id}>
                  <span>{nameOf(item.id)}</span>
                  <span className="muted">
                    第 {item.hardest.bar} 小节第 {item.hardest.degree} 级
                    {item.hardest.name ? `（${item.hardest.name}）` : ""} · 单独练过{" "}
                    {item.hardest.count} 次
                  </span>
                </li>
              ))}
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
