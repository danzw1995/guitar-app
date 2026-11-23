import test from "node:test";
import assert from "node:assert/strict";
import { backupFileName, mergeBackup, parseBackup } from "../src/lib/backup.ts";

const empty = () => ({ app: "guitar-lab", version: 1, exportedAt: "", data: {} });

test("合并关卡进度：星多的赢，星一样比最快用时", () => {
  const current = {
    ...empty(),
    data: {
      "guitar.progress.v1": {
        "level-1": { stars: 2, bestMs: 9000, completed: true },
        "level-2": { stars: 3, bestMs: 5000, completed: true },
      },
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.progress.v1": {
        "level-1": { stars: 2, bestMs: 7000, completed: true },
        "level-2": { stars: 1, bestMs: 1000, completed: true },
      },
    },
  };
  const { next, summary } = mergeBackup(current, incoming);
  const progress = next.data["guitar.progress.v1"];
  assert.equal(progress["level-1"].bestMs, 7000, "同星取更快的");
  assert.equal(progress["level-2"].stars, 3, "星少的不覆盖");
  assert.equal(summary.levels, 2);
});

test("合并打卡：分钟取大、练过的条目取并集", () => {
  const current = {
    ...empty(),
    data: {
      "guitar.practice.v1": {
        "2026-11-01": { minutes: 20, stage: 2, done: ["a"], feel: "ok" },
      },
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.practice.v1": {
        "2026-11-01": { minutes: 35, stage: 3, done: ["b"], bpmMax: 88 },
      },
    },
  };
  const day = mergeBackup(current, incoming).next.data["guitar.practice.v1"]["2026-11-01"];
  assert.equal(day.minutes, 35);
  assert.equal(day.stage, 3);
  assert.deepEqual([...day.done].sort(), ["a", "b"]);
  assert.equal(day.feel, "ok", "原来有的 feel 保留");
  assert.equal(day.bpmMax, 88);
});

test("合并跟练成绩：最高 BPM 取大、日期取更晚", () => {
  const current = {
    ...empty(),
    data: {
      "guitar.rhythm.v1": { "sd-01": { bestBpm: 80, sessions: 2, minutes: 6, lastAt: "2026-11-10" } },
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.rhythm.v1": { "sd-01": { bestBpm: 92, sessions: 1, minutes: 9, lastAt: "2026-11-12" } },
    },
  };
  const merged = mergeBackup(current, incoming).next.data["guitar.rhythm.v1"]["sd-01"];
  assert.equal(merged.bestBpm, 92);
  assert.equal(merged.minutes, 9);
  assert.equal(merged.lastAt, "2026-11-12");
});

test("合并我的谱：按 id 去重，有图的优先，最多 40 条", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    id: `s-${i}`,
    title: `谱 ${i}`,
    ascii: "e|--0--|",
    createdAt: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  const current = { ...empty(), data: { "guitar.scores.v1": many } };
  const incoming = {
    ...empty(),
    data: { "guitar.scores.v1": [{ id: "s-44", title: "改过的", image: "data:image/png;base64,AAA" }] },
  };
  const scores = mergeBackup(current, incoming).next.data["guitar.scores.v1"];
  assert.equal(scores.length, 40, "上限 40 条");
  const target = scores.find((item) => item.id === "s-44");
  assert.ok(target.image, "导入的那份带图，应该保留图");
});

test("不是备份的文件要报人话", () => {
  assert.throws(() => parseBackup("not json"), /不是一个 JSON 文件/);
  assert.throws(() => parseBackup('{"hello":1}'), /不像 Guitar Lab 的备份/);
  const ok = parseBackup('{"app":"guitar-lab","version":1,"data":{"guitar.rhythm.v1":{}}}');
  assert.equal(ok.app, "guitar-lab");
});

test("备份文件名带日期", () => {
  assert.equal(backupFileName(new Date(2026, 10, 12)), "guitar-lab-backup-2026-11-12.json");
});

test("合并跳过表：同一天取并集，坏日期不进", () => {
  const current = {
    ...empty(),
    data: { "guitar.skips.v1": { "2026-11-14": ["s0-crawl"], "2026-11-13": ["rd-01"] } },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.skips.v1": {
        "2026-11-14": ["rd-01", "s0-crawl"],
        "2026-11-12": ["rt-rest"],
        "不是日期": ["x"],
        "2026-11-11": "不是数组",
      },
    },
  };
  const { next } = mergeBackup(current, incoming);
  const skips = next.data["guitar.skips.v1"];
  assert.deepEqual(skips["2026-11-14"].sort(), ["rd-01", "s0-crawl"], "同一天要并起来，不能重复");
  assert.deepEqual(skips["2026-11-13"], ["rd-01"], "本机有、备份没有的那天要留着");
  assert.deepEqual(skips["2026-11-12"], ["rt-rest"], "备份里多的那天要进来");
  assert.equal(skips["不是日期"], undefined, "坏日期不进");
  assert.equal(skips["2026-11-11"], undefined, "不是数组的不进");
});

test("合并每周目标：同一周以导入的为准，坏周次不进", () => {
  const current = {
    ...empty(),
    data: { "guitar.goals.v1": { "2026-11-09": 60, "2026-11-02": 30 } },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.goals.v1": {
        "2026-11-09": 90,
        "2026-10-26": 45,
        "不是周": 60,
        "2026-10-19": 0,
      },
    },
  };
  const { next } = mergeBackup(current, incoming);
  const goals = next.data["guitar.goals.v1"];
  assert.equal(goals["2026-11-09"], 90, "同一周以导入的为准");
  assert.equal(goals["2026-11-02"], 30, "本机有、备份没有的周要留着");
  assert.equal(goals["2026-10-26"], 45, "备份里多出来的周要进来");
  assert.equal(goals["不是周"], undefined, "坏周次不进");
  assert.equal(goals["2026-10-19"], undefined, "0 分钟不算目标");
});

test("合并压后表：同一条取更晚的截止日，坏日期不进", () => {
  const current = {
    ...empty(),
    data: { "guitar.pauses.v1": { "s0-crawl": "2026-11-20", "rd-01": "2026-11-15" } },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.pauses.v1": {
        "s0-crawl": "2026-11-17",
        "rd-01": "2026-11-18",
        "rt-triplet": "2026-11-16",
        "坏": "不是日期",
      },
    },
  };
  const { next } = mergeBackup(current, incoming);
  const pauses = next.data["guitar.pauses.v1"];
  assert.equal(pauses["s0-crawl"], "2026-11-20", "本机的截止日更晚就留着");
  assert.equal(pauses["rd-01"], "2026-11-18", "备份的截止日更晚就用它");
  assert.equal(pauses["rt-triplet"], "2026-11-16", "备份里多出来的那条要进来");
  assert.equal(pauses["坏"], undefined, "坏日期不进");
});

test("合并和弦转换：最快速度取高的，日期取晚的", () => {
  const current = {
    ...empty(),
    data: {
      "guitar.chords.v1": {
        "pg-1645": { bestBpm: 92, sessions: 3, minutes: 3, lastAt: "2026-11-10" },
        "pg-folk": { bestBpm: 70, sessions: 1, minutes: 1, lastAt: "2026-11-12" },
      },
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.chords.v1": {
        "pg-1645": { bestBpm: 104, sessions: 5, minutes: 5, lastAt: "2026-11-14" },
        "pg-1564": { bestBpm: 80, sessions: 1, minutes: 1, lastAt: "2026-11-13" },
      },
    },
  };
  const { next } = mergeBackup(current, incoming);
  const chords = next.data["guitar.chords.v1"];
  assert.equal(chords["pg-1645"].bestBpm, 104, "最快的速度取高的");
  assert.equal(chords["pg-1645"].lastAt, "2026-11-14", "日期取更晚的");
  assert.equal(chords["pg-1645"].sessions, 5, "练过几次取大的");
  assert.equal(chords["pg-folk"].bestBpm, 70, "本机独有的要留着");
  assert.equal(chords["pg-1564"].bestBpm, 80, "备份里多出来的要进来");
});

test("合并我存的进行：按 id 去重，两边都留着", () => {
  const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 5, f: 3, beat: 0, dur: 4 }] };
  const current = {
    ...empty(),
    data: {
      "guitar.patterns.v1": [
        { id: "p1", title: "和弦进行 · C–Am", tab, meter: "4/4", bpm: 70, createdAt: 2 },
        { id: "p2", title: "和弦进行 · G–D", tab, meter: "4/4", bpm: 80, createdAt: 1 },
      ],
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.patterns.v1": [
        { id: "p1", title: "和弦进行 · C–Am", tab, meter: "4/4", bpm: 70, createdAt: 2 },
        { id: "p3", title: "和弦进行 · Em–C", tab, meter: "4/4", bpm: 90, createdAt: 3 },
      ],
    },
  };
  const { next } = mergeBackup(current, incoming);
  const patterns = next.data["guitar.patterns.v1"];
  assert.equal(patterns.length, 3, "同一条不重复，三条都在");
  assert.deepEqual(
    patterns.map((item) => item.id),
    ["p3", "p1", "p2"],
    "按存下来的时间倒序",
  );
});

test("合并今日加餐：按 id 去重，两边都留着", () => {
  const tab = { beatsPerBar: 4, bars: 1, notes: [{ s: 5, f: 3, beat: 0, dur: 4 }] };
  const current = {
    ...empty(),
    data: {
      "guitar.plan.v1": [
        { id: "extra-a", date: "2026-11-21", title: "单弦爬格子", tab, meter: "4/4", bpm: 70, addedAt: 1 },
        { id: "extra-b", date: "2026-11-21", title: "另一条", tab, meter: "4/4", bpm: 80, addedAt: 2 },
      ],
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.plan.v1": [
        { id: "extra-b", date: "2026-11-21", title: "另一条", tab, meter: "4/4", bpm: 80, addedAt: 2 },
        { id: "extra-c", date: "2026-11-21", title: "和声", tab, meter: "4/4", bpm: 90, addedAt: 3 },
        { id: "", date: "2026-11-21", title: "没 id 的进不来", tab, meter: "4/4", bpm: 60, addedAt: 4 },
      ],
    },
  };
  const extras = mergeBackup(current, incoming).next.data["guitar.plan.v1"];
  assert.deepEqual(
    extras.map((item) => item.id),
    ["extra-a", "extra-b", "extra-c"],
    "同一条不重复，三条都在，按加入时间排",
  );
});

test("合并存的组合：同名以更新的为准，最多留 5 套", () => {
  const item = { title: "单弦爬格子", tab: { beatsPerBar: 4, bars: 1, notes: [] }, meter: "4/4", bpm: 70 };
  const current = {
    ...empty(),
    data: {
      "guitar.plan.sets.v1": [
        { id: "set-1", name: "早课", items: [item], addedAt: 10 },
        { id: "set-2", name: "晚课", items: [item], addedAt: 20 },
      ],
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.plan.sets.v1": [
        { id: "set-1", name: "早课", items: [item, item], addedAt: 30 },
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `set-x${i}`,
          name: `加练${i}`,
          items: [item],
          addedAt: 40 + i,
        })),
      ],
    },
  };
  const sets = mergeBackup(current, incoming).next.data["guitar.plan.sets.v1"];
  assert.equal(sets.length, 5, "上限 5 套");
  const morning = sets.find((set) => set.name === "早课");
  assert.equal(morning.id, "set-1");
  assert.equal(morning.items.length, 2, "同名的取更新那份（两条）");
  assert.equal(
    sets.some((set) => set.name === "晚课"),
    false,
    "超出 5 套时按时间留新的，最老的落选",
  );
});

test("合并「今天练过」：同一天取并集，不同天取更晚的那天", () => {
  const sameDay = mergeBackup(
    { ...empty(), data: { "guitar.plan.done.v1": { date: "2026-11-21", titles: ["a"] } } },
    { ...empty(), data: { "guitar.plan.done.v1": { date: "2026-11-21", titles: ["b", "a"] } } },
  ).next.data["guitar.plan.done.v1"];
  assert.equal(sameDay.date, "2026-11-21");
  assert.deepEqual([...sameDay.titles].sort(), ["a", "b"], "同一天两份要并起来");

  const newer = mergeBackup(
    { ...empty(), data: { "guitar.plan.done.v1": { date: "2026-11-20", titles: ["旧的"] } } },
    { ...empty(), data: { "guitar.plan.done.v1": { date: "2026-11-21", titles: ["新的"] } } },
  ).next.data["guitar.plan.done.v1"];
  assert.equal(newer.date, "2026-11-21", "跨天以更晚的为准");
  assert.deepEqual(newer.titles, ["新的"], "旧那天的标记不该混进来");

  const broken = mergeBackup(
    { ...empty(), data: { "guitar.plan.done.v1": { date: "不是日期", titles: ["x"] } } },
    { ...empty(), data: {} },
  ).next.data["guitar.plan.done.v1"];
  assert.equal(broken, undefined, "坏日期整条丢掉");
});

test("合并存的视角：按 id 去重，同一个名字只留一枚", () => {
  const current = {
    ...empty(),
    data: {
      "guitar.stats.views.v1": [
        { id: "v-1", name: "我的弱项", label: "第 5 级", addedAt: 10 },
        { id: "v-2", label: "第 2 阶段", addedAt: 20 },
      ],
    },
  };
  const incoming = {
    ...empty(),
    data: {
      "guitar.stats.views.v1": [
        { id: "v-1", name: "我的弱项", label: "第 5 级", addedAt: 10 },
        { id: "v-9", name: "我的弱项", label: "第 2 阶段", addedAt: 30 },
        { id: "v-3", label: "第 3 级", addedAt: 40 },
        { id: "v-4", label: "第 4 级", addedAt: 50 },
        { id: "v-5", label: "第 5 级", addedAt: 60 },
      ],
    },
  };
  const views = mergeBackup(current, incoming).next.data["guitar.stats.views.v1"];
  assert.equal(views.length, 5, "上限 5 个");
  assert.equal(
    views.filter((view) => view.name === "我的弱项").length,
    1,
    "同名只看成一枚",
  );
  assert.deepEqual(
    views.map((view) => view.id),
    ["v-1", "v-2", "v-3", "v-4", "v-5"],
    "按存下来的时间排，最新的一批留下",
  );
});

test("合并收起的分组：哪边收起就算收起", () => {
  const merged = mergeBackup(
    { ...empty(), data: { "guitar.extras.closed.v1": { "stage-0": true } } },
    { ...empty(), data: { "guitar.extras.closed.v1": { other: true, "stage-1": false } } },
  ).next.data["guitar.extras.closed.v1"];
  assert.deepEqual(merged, { "stage-0": true, other: true }, "false 不该把收起改回展开");
});

test("合并「稳不稳」的记录：按 id 去重，只留最近 24 遍", () => {
  const base = { date: "2026-11-21", bpm: 70, bars: 4, stdevMs: 12, meanAbsMs: 10, driftMsPerBeat: 0, hits: 16 };
  const mine = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `s-mine-${index}` }));
  const theirs = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `s-theirs-${index}`, stdevMs: 9 }));
  // 两边有同一条：只留一份
  const shared = { ...base, id: "s-shared" };
  const merged = mergeBackup(
    { ...empty(), data: { "guitar.steady.v1": [...mine, shared] } },
    { ...empty(), data: { "guitar.steady.v1": [shared, ...theirs] } },
  ).next.data["guitar.steady.v1"];
  assert.ok(Array.isArray(merged));
  assert.equal(merged.length, 24, "上限 24 遍");
  assert.equal(merged.filter((item) => item.id === "s-shared").length, 1, "同一条只留一份");
  assert.equal(merged[merged.length - 1].id, "s-theirs-19", "保留导入那份里最新的");
});

test("合并稳度曲线：同一天取更稳的那个，连它「只弹 2–3 小节」的区间一起带过来", () => {
  const merged = mergeBackup(
    {
      ...empty(),
      data: {
        "guitar.rhythm.v1": {
          "s0-crawl": {
            bestBpm: 76,
            sessions: 2,
            minutes: 5,
            lastAt: "2026-11-20",
            steadyHistory: [
              { date: "2026-11-20", bpm: 76, stdevMs: 18, fromBar: 1, toBar: 4 },
              { date: "2026-11-18", bpm: 70, stdevMs: 24 },
            ],
          },
        },
      },
    },
    {
      ...empty(),
      data: {
        "guitar.rhythm.v1": {
          "s0-crawl": {
            bestBpm: 80,
            sessions: 3,
            minutes: 9,
            lastAt: "2026-11-21",
            steadyHistory: [{ date: "2026-11-20", bpm: 60, stdevMs: 9, fromBar: 2, toBar: 3 }],
          },
        },
      },
    },
  ).next.data["guitar.rhythm.v1"]["s0-crawl"].steadyHistory;
  assert.equal(merged.length, 2, "同一天只留一个点");
  const day = merged.find((item) => item.date === "2026-11-20");
  assert.equal(day.stdevMs, 9, "取更稳的那个");
  assert.equal(day.fromBar, 2, "区间跟着胜出的那个点走");
  assert.equal(day.toBar, 3, "区间跟着胜出的那个点走");
});

test("合并循环流水：按 id 去重，按时间排好，只留最近 40 条", () => {
  const entry = (id, rounds) => ({ id, date: "2026-11-23", at: "21:03", bpm: 60, fromBar: 2, toBar: 3, rounds });
  const mine = Array.from({ length: 30 }, (_, index) => entry(`loop-m${index}`, 3));
  const theirs = Array.from({ length: 30 }, (_, index) => entry(`loop-t${index}`, 2));
  const shared = entry("loop-shared", 5);
  const merged = mergeBackup(
    { ...empty(), data: { "guitar.steady.loops.v1": [...mine, shared] } },
    { ...empty(), data: { "guitar.steady.loops.v1": [shared, ...theirs] } },
  ).next.data["guitar.steady.loops.v1"];
  assert.ok(Array.isArray(merged));
  assert.equal(merged.length, 40, "上限 40 条");
  assert.equal(merged.filter((item) => item.id === "loop-shared").length, 1, "同一条只留一份");
  assert.equal(merged[merged.length - 1].id, "loop-t29", "按 id 排，最新的在最后");
});
