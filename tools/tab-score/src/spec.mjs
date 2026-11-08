// JSON 谱面 → alphaTex。
//
// JSON 是给程序用的：一个 `hits` 数组，每个 hit 自带位置（四分音符为 1）和时值。
// alphaTex 是给人用的：一段文本，alphaTab 直接吃。
// 这个文件只做「后者」，不碰渲染，所以可以单独测。
import { chunkValue, durationParts } from "./duration.mjs";

const EPS = 1e-6;

function beatsPerBarOf(timeSignature) {
  const [numerator, denominator] = timeSignature ?? [4, 4];
  return numerator * (4 / denominator);
}

function isTriplet(duration) {
  return Math.abs(duration - 1 / 3) < 0.01 || Math.abs(duration - 2 / 3) < 0.01;
}

function beatText(hit, token, { dotted, tuplet, mute }) {
  const notes = [...(hit.notes ?? [])].sort((a, b) => b.string - a.string);
  const body =
    notes.length === 0
      ? "r"
      : notes.length === 1
        ? `${mute ? "x" : notes[0].fret}.${notes[0].string}`
        : `(${notes
            .map((note) => `${mute ? "x" : note.fret}.${note.string}`)
            .join(" ")})`;
  const props = [];
  if (dotted) props.push("d");
  if (tuplet) props.push("tu 3");
  if (hit.dir === "D") props.push("bd");
  if (hit.dir === "U") props.push("bu");
  return `${body}${token}${props.length > 0 ? ` {${props.join(" ")}}` : ""}`;
}

function tieText(hit, token, { dotted }) {
  const notes = [...(hit.notes ?? [])].sort((a, b) => b.string - a.string);
  const body =
    notes.length === 0
      ? "r"
      : notes.length === 1
        ? `-.${notes[0].string}`
        : `(${notes.map((note) => `-.${note.string}`).join(" ")})`;
  return `${body}${token}${dotted ? " {d}" : ""}`;
}

function restText(quarters) {
  return chunkValue(quarters)
    .map((value) => {
      const { token, dotted } = durationParts(value);
      return `r${token}${dotted ? " {d}" : ""}`;
    })
    .join(" ");
}

/**
 * 把一个 hit 数组编成一个小节的 alphaTex 片段。
 * @param {Array} hits
 * @param {number} barQuarters 一小节有几分之几个四分音符
 */
function barText(hits, barQuarters, mute = false) {
  const sorted = [...hits].sort((a, b) => a.at - b.at);
  const tokens = [];
  let cursor = 0;

  // 三连音：连续三个非标准时值算一组，只在组头写一次 {tu 3}
  const tupletHeads = new Set();
  const tupletMembers = new Set();
  for (let index = 0; index < sorted.length; ) {
    if (!isTriplet(sorted[index].dur)) {
      index += 1;
      continue;
    }
    let run = 0;
    while (index + run < sorted.length && isTriplet(sorted[index + run].dur)) {
      run += 1;
    }
    for (let start = 0; start + 3 <= run; start += 3) {
      const group = sorted.slice(index + start, index + start + 3);
      tupletHeads.add(group[0]);
      tupletMembers.add(group[1]);
      tupletMembers.add(group[2]);
    }
    index += run;
  }

  for (const [order, hit] of sorted.entries()) {
    const next = sorted[order + 1];
    const end = next ? next.at : barQuarters;
    const written = hit.dur ?? end - hit.at;
    const gap = hit.at - cursor;
    if (gap > 0.12) {
      tokens.push(restText(gap));
    }
    const tuplet = tupletHeads.has(hit);
    const member = tupletMembers.has(hit);
    // 三连音在 alphaTex 里写「记谱时值」：1/3 拍写八分，2/3 拍写四分
    const parts = tuplet || member ? [written * 1.5] : chunkValue(written);
    parts.forEach((value, index) => {
      const { token, dotted } = durationParts(value);
      tokens.push(
        index === 0
          ? beatText(hit, token, { dotted, tuplet, mute })
          : tieText(hit, token, { dotted }),
      );
    });
    cursor = hit.at + written;
  }

  if (barQuarters - cursor > 0.12) {
    tokens.push(restText(barQuarters - cursor));
  }
  return tokens.join(" ");
}

/**
 * JSON 谱面 → alphaTex 文本。
 * @param {object} spec
 * @returns {string}
 */
export function specToAlphaTex(spec) {
  const [numerator, denominator] = spec.timeSignature ?? [4, 4];
  const barQuarters = beatsPerBarOf(spec.timeSignature);
  const lines = [];

  if (spec.title) lines.push(`\\title "${spec.title}"`);
  if (spec.subtitle) lines.push(`\\subtitle "${spec.subtitle}"`);
  if (spec.artist) lines.push(`\\artist "${spec.artist}"`);
  if (spec.tempo) lines.push(`\\tempo ${spec.tempo}`);
  lines.push(`\\ts (${numerator} ${denominator})`);

  const mute = spec.mute === "dead";
  const bars = (spec.bars ?? []).map((bar) => {
    const hits = Array.isArray(bar) ? bar : (bar.hits ?? []);
    return barText(hits, barQuarters, mute);
  });
  if (bars.length === 0) {
    bars.push(restText(barQuarters));
  }
  lines.push(bars.join(" | "));
  return lines.join("\n");
}
