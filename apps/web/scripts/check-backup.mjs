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
