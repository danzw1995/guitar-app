// ASCII 六线谱 → JSON 谱面（再由 specToAlphaTex 变成 alphaTex）。
//
// 认得的写法就是最常见的那种「六个字母 + 六行短横线」：
//
//   e|--0---1---|
//   B|--1---1---|
//   G|--0---2---|
//   D|--2---3---|
//   A|--3---3---|
//   E|-------1---|
//
// - 行首的弦名可以是 e/B/G/D/A/E（小写 e 是 1 弦、大写 E 是 6 弦），也可以是 1–6；
//   没有弦名时按「从上到下 = 1 弦到 6 弦」。
// - `|` 是小节线；`||` 也算，只是会多切出一个空小节，会被丢掉。
// - 同一列上的数字算一个和弦（一起拨）。
// - `-` 是延音（占位，不发音）；`x` 是闷音（死音）；其它符号（h/p/~/\\ 等技巧）先忽略。
// - 时值不是「看符号」而是「看列距」：按小节宽度均分，再吸附到最近的常用时值。
// - 文件开头可以写 `title: 练习 1`、`tempo: 80`、`ts: 4/4` 这样的头信息。
import { STANDARD_VALUES } from "./duration.mjs";

const LABELS = {
  e: 1,
  b: 2,
  g: 3,
  d: 4,
  a: 5,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

const HEADER_KEYS = {
  title: "title",
  标题: "title",
  subtitle: "subtitle",
  artist: "artist",
  tempo: "tempo",
  bpm: "tempo",
  ts: "timeSignature",
  time: "timeSignature",
  timesignature: "timeSignature",
  拍号: "timeSignature",
};

function isTabLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (!trimmed.includes("|")) return false;
  // 只允许「弦名 + 弦线 + 数字/技巧符」这些字符，免得把普通段落误当谱
  return /^[eEbBgGdDaA1-6]?\s*[|:][-0-9|hpbxXH PB~/\\+.(),'"]*$/.test(trimmed);
}

/** 把一行拆成「弦名」和「弦线内容」两部分。 */
function splitLabel(line) {
  const withBar = /^\s*([eEbBgGdDaA1-6])?\s*[|:](.*)$/.exec(line);
  if (withBar) {
    return { label: withBar[1], body: withBar[2] };
  }
  return { label: null, body: line };
}

function stringOfLabel(label, fallback) {
  if (!label) return fallback;
  const key = label.toLowerCase();
  if (key in LABELS) return LABELS[key];
  return fallback;
}

function parseHeader(line) {
  const match = /^\s*([A-Za-z\u4e00-\u9fa5]+)\s*[:=]\s*(.+?)\s*$/.exec(line);
  if (!match) return null;
  const field = HEADER_KEYS[match[1].toLowerCase()];
  if (!field) return null;
  return { field, value: match[2] };
}

function parseTimeSignature(value) {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function snapQuarters(value) {
  if (!(value > 0)) return 0.0625;
  let best = STANDARD_VALUES[0];
  let bestError = Infinity;
  for (const candidate of STANDARD_VALUES) {
    const error = Math.abs(candidate - value);
    if (error < bestError) {
      bestError = error;
      best = candidate;
    }
  }
  // 差得太多（比如三连音的位置）就不吸附，交给 barText 去拆
  return bestError <= value * 0.2 ? best : value;
}

/**
 * 扫一段弦线，挑出每一列上的音。
 * @param {string[]} rows 六行弦线（1 弦在上），等长
 * @returns {{ at: number, notes: { string: number, fret: number | "x" }[] }[]}
 */
function onsetsOfBar(rows) {
  const columns = new Map();
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

  rows.forEach((row, index) => {
    const string = index + 1;
    for (let column = 0; column < row.length; column += 1) {
      const char = row[column];
      if (char === "x" || char === "X") {
        if (!columns.has(column)) columns.set(column, []);
        columns.get(column).push({ string, fret: "x" });
        continue;
      }
      if (!/[0-9]/.test(char)) continue;
      // 两位数的品数（10–24）占两列
      const next = row[column + 1];
      let fret = Number(char);
      let span = 1;
      if (next !== undefined && /[0-9]/.test(next)) {
        const twoDigit = Number(`${char}${next}`);
        if (twoDigit >= 10 && twoDigit <= 24) {
          fret = twoDigit;
          span = 2;
        }
      }
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column).push({ string, fret });
      column += span - 1;
    }
  });

  return [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, notes]) => ({ at, notes, width }));
}

/**
 * ASCII 六线谱 → JSON 谱面。
 * @param {string} text
 * @returns {{ timeSignature: [number, number], tempo?: number, title?: string, bars: { hits: any[] }[] }}
 */
export function asciiTabToSpec(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const meta = { timeSignature: [4, 4] };

  // 1. 头信息 + 谱块
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) blocks.push(current);
    current = [];
  };

  for (const line of lines) {
    if (isTabLine(line)) {
      current.push(line);
      continue;
    }
    flush();
    const header = parseHeader(line);
    if (!header) continue;
    if (header.field === "timeSignature") {
      const parsed = parseTimeSignature(header.value);
      if (parsed) meta.timeSignature = parsed;
    } else if (header.field === "tempo") {
      const tempo = Number(header.value);
      if (Number.isFinite(tempo)) meta.tempo = tempo;
    } else if (header.field === "title") {
      meta.title = header.value;
    } else if (header.field === "subtitle") {
      meta.subtitle = header.value;
    } else if (header.field === "artist") {
      meta.artist = header.value;
    }
  }
  flush();

  if (blocks.length === 0) {
    throw new Error("没找到六线谱：六行弦线里至少要有一行带 | 和 -");
  }

  const [numerator, denominator] = meta.timeSignature;
  const quartersPerBar = numerator * (4 / denominator);

  // 2. 每一块：去掉弦名、对齐、按 | 切成小节
  const bars = [];
  for (const block of blocks) {
    const bodies = block.map((line) => splitLabel(line).body);
    const width = bodies.reduce((max, body) => Math.max(max, body.length), 0);
    const padded = bodies.map((body) => body.padEnd(width, "-"));

    // 小节线的列：取所有行里出现 | 的列
    const cuts = new Set();
    for (const row of padded) {
      for (let index = 0; index < row.length; index += 1) {
        if (row[index] === "|") cuts.add(index);
      }
    }
    const stops = [0, ...[...cuts].sort((a, b) => a - b), width];

    for (let index = 0; index + 1 < stops.length; index += 1) {
      const from = index === 0 ? stops[0] : stops[index] + 1;
      const to = stops[index + 1];
      if (to <= from) continue;
      const segment = padded.map((row, rowIndex) => ({
        string: stringOfLabel(splitLabel(block[rowIndex]).label, rowIndex + 1),
        text: row.slice(from, to),
      }));
      // 按弦号排回 1 弦在上
      segment.sort((a, b) => a.string - b.string);
      const rows = [];
      for (const entry of segment) rows[entry.string - 1] = entry.text;
      for (let string = 0; string < 6; string += 1) {
        if (rows[string] === undefined) rows[string] = "".padEnd(to - from, "-");
      }
      const onsets = onsetsOfBar(rows);
      if (onsets.length === 0) continue; // 只是小节线挨着小节线，跳过

      const barQuarters = quartersPerBar;
      const columnQuarters = barQuarters / Math.max(1, to - from);
      const hits = onsets.map((onset, order) => {
        const next = onsets[order + 1];
        const end = next ? next.at : to - from;
        const raw = (end - onset.at) * columnQuarters;
        return {
          at: Number((onset.at * columnQuarters).toFixed(4)),
          dur: snapQuarters(raw),
          notes: onset.notes,
        };
      });
      bars.push({ hits });
    }
  }

  if (bars.length === 0) {
    throw new Error("谱块里没有音：检查一下弦线是不是只有横线");
  }

  return { ...meta, bars };
}

/**
 * ASCII 六线谱 → alphaTex 文本。
 * @param {string} text
 * @param {(spec: object) => string} toTex
 * @returns {string}
 */
export function asciiTabToAlphaTex(text, toTex) {
  return toTex(asciiTabToSpec(text));
}
