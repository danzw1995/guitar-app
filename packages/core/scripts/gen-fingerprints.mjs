/**
 * 生成「节奏指纹」基线：每条练习的起音序列（拍位 + 时值 + 方向）。
 *
 * 指纹比快照更窄：只记"第几拍响、响多久、朝哪边"，不记颜色、编号说明这些无关的东西。
 * 改数据时 `pnpm test` 会逐条 diff，一眼看出"第 6 条从 8 个音变成 7 个音"。
 *
 *   pnpm run gen:fingerprints      # 确认改动是有意的，再更新基线
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STRUM_DRILLS } from "../src/strum-drills.ts";
import { READING_DRILLS } from "../src/reading-drills.ts";
import { RHYTHM_DRILLS } from "../src/rhythm-drills.ts";
import { ACCOMPANIMENTS } from "../src/accompaniment.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "rhythm-fingerprints.json");

/** 把一个谱子压成 `[拍位, 时值, 方向]` 的序列，同一拍只记一次。 */
function fingerprint(tab) {
  const first = new Map();
  for (const note of tab.notes) {
    const key = Math.round(note.beat * 1000) / 1000;
    if (!first.has(key)) first.set(key, note);
  }
  return [...first.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beat, note]) => [beat, Math.round(note.dur * 1000) / 1000, note.arrow ?? null]);
}

const pick = (drills) =>
  Object.fromEntries(
    drills.map((drill) => [
      drill.id,
      { bars: drill.tab.bars, beatsPerBar: drill.tab.beatsPerBar, onsets: fingerprint(drill.tab) },
    ]),
  );

const data = {
  note: "节奏指纹：改了这个文件说明练习的节奏真的变了。确认有意之后再跑 pnpm run gen:fingerprints 更新基线。",
  strum: pick(STRUM_DRILLS),
  reading: pick(READING_DRILLS),
  rhythm: pick(RHYTHM_DRILLS),
  accompaniment: pick(ACCOMPANIMENTS),
};

/** 每条练习压成一行：改一条数据，diff 里就只有一行，review 得动。 */
function serialize(obj) {
  const groups = Object.entries(obj)
    .filter(([, value]) => value && typeof value === "object")
    .map(([group, rows]) => {
      const body = Object.entries(rows)
        .map(([id, value]) => `    ${JSON.stringify(id)}: ${JSON.stringify(value)}`)
        .join(",\n");
      return `  ${JSON.stringify(group)}: {\n${body}\n  }`;
    })
    .join(",\n");
  return `{\n  "note": ${JSON.stringify(obj.note)},\n${groups}\n}\n`;
}

writeFileSync(OUT, serialize(data), "utf8");
const count = (group) => Object.keys(group).length;
console.log(
  `已写入 ${OUT}\n  扫弦 ${count(data.strum)} 条、跟读 ${count(data.reading)} 条、时值 ${count(data.rhythm)} 条`,
);
