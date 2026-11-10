/**
 * 六线谱 → alphaTex（alphaTab 的文本记谱语言）。
 *
 * 为什么要这一层：`tab-layout.ts` 自己画 SVG 时，符梁、休止、三连音、附点全靠手算，
 * 一处一处和标准记法对不上（用户连着挑了三轮）。alphaTab 是成熟的六线谱渲染器，
 * 把这些交给它，我们只负责把 `Tab` 翻译成它能读的文本。
 *
 * 这个文件是**纯函数**：不碰 DOM、不 import alphaTab，所以能在 Node 里单测。
 *
 * 换算约定：
 * - `Tab.beat` 的单位是「拍」；4/4 里一拍是四分音符，6/8 里一拍是八分音符（`beatsPerBar === 6`）；
 * - alphaTex 的时值写成 `.4`（四分）、`.8`（八分）、`.1`（全音符），附点加一个尾点 `.8.`；
 * - 三连音写 `{tu 3}` 挂在组里第一拍，时值按「记谱时值」写（实际 1/3 拍写成八分）。
 */

import type { Tab, TabNote } from "./tab.ts";

export interface AlphaTexOptions {
  /** 速度；不填用 `tab.bpm` 的第一个数，再不行 80。 */
  bpm?: number;
  /** 谱面标题（alphaTab 会画在左上角）；不填就不写。 */
  title?: string;
  /**
   * 切音（右手把弦闷掉）怎么标。
   * - `palm`：制谱软件的写法——保留品数，在音符上加 `{pm}`，alphaTab 会在谱面上方写
   *   `P.M.` 并拉一条虚线到闷音结束（Guitar Pro 就是这么标的），默认值；
   * - `dead`：音头画成 ×（`x.5`），只在不想用 P.M. 时才用；
   * - `plain`：不标，谱面只有扫弦箭头。
   *
   * 注意 `{pm}` 是**音符属性**，要写在音符后面、时值前面：`3.5{pm}.4`、`(3.5{pm} 2.4{pm}).8`。
   * 写成 `(3.5 2.4).8{pm}` 会被当成 beat property，alphaTab 白名单里没有它，整条 tex 解析失败。
   */
  mute?: "palm" | "dead" | "plain";
}

/** 一拍等于几个四分音符：4/4 是 1，6/8 是 0.5。 */
function quartersPerBeat(tab: Tab): number {
  return tab.beatsPerBar === 6 ? 0.5 : 1;
}

const EPS = 1e-3;

function isPowerOfTwo(n: number): boolean {
  const v = Math.round(n);
  return v > 0 && Math.abs(n - v) < EPS && (v & (v - 1)) === 0;
}

/**
 * 四分音符时值 → alphaTex 时值：基础后缀（`.4`、`.8`）+ 是否附点。
 *
 * 附点**不用尾点写法**（`.8.`）：它本身合法，但后面紧跟拍属性时会变成语法错
 * （`.8. {bu}` → `Error parsing alphaTex`）。统一写成 `.8 {d}` 更稳，而且能和
 * 扫弦方向合进同一个花括号（`{d bu}`）。
 */
export function durationParts(quarters: number): { token: string; dotted: boolean } {
  const dottedValue = 4 / (quarters / 1.5);
  if (isPowerOfTwo(dottedValue) && dottedValue >= 1 && dottedValue <= 64) {
    return { token: `.${dottedValue}`, dotted: true };
  }
  const value = 4 / quarters;
  if (isPowerOfTwo(value) && value >= 1 && value <= 64) {
    return { token: `.${value}`, dotted: false };
  }
  // 落到这里说明数据不是标准时值；取最近的一档，宁可视而不见也不要崩。
  return { token: `.${Math.max(1, Math.min(64, Math.round(4 / quarters)))}`, dotted: false };
}

/** 只要后缀的旧接口（休止之类拿不到附点标记的场合用）。 */
export function durationToken(quarters: number): string {
  return durationParts(quarters).token;
}

/** 标准时值，从长到短（含附点形式），用来把「凑不成一档」的时值拆开。 */
const STANDARD_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125, 0.0625];

/**
 * 把任意时值拆成若干标准时值（从长到短贪心）。
 *
 * 为什么需要：最后一拍常常「响到小节末」，时值是 1.75 这样凑不成一档的数。
 * 直接取最近的一档（以前的做法）会让小节多出 0.25 拍，alphaTab 判定小节对不上、
 * 整张谱空白。拆开再用连音线连起来，时值正好、样子也是标准记法。
 */
export function chunkQuarters(quarters: number): number[] {
  const parts: number[] = [];
  let left = quarters;
  while (left > EPS && parts.length < 8) {
    const value = STANDARD_VALUES.find((candidate) => candidate <= left + EPS);
    if (value === undefined) break;
    parts.push(value);
    left -= value;
  }
  return parts.length > 0 ? parts : [quarters];
}

/** 这个时值是不是三连音（1/3 或 2/3 拍）。 */
export function isTripletDuration(dur: number): boolean {
  return Math.abs(dur - 1 / 3) < 0.01 || Math.abs(dur - 2 / 3) < 0.01;
}

interface Onset {
  beat: number;
  dur: number;
  notes: TabNote[];
}

/** 把「第几拍响」相同的音归成一个起音（和弦、扫弦就是一个起音多根弦）。 */
export function onsetsOf(notes: TabNote[]): Onset[] {
  const byBeat = new Map<number, TabNote[]>();
  for (const note of notes) {
    const key = Math.round(note.beat * 1000) / 1000;
    const list = byBeat.get(key);
    if (list) list.push(note);
    else byBeat.set(key, [note]);
  }
  return [...byBeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beat, list]) => ({
      beat,
      dur: list[0].dur,
      notes: [...list].sort((a, b) => b.s - a.s),
    }));
}

function noteText(note: TabNote, mute: "palm" | "dead" | "plain", props?: string): string {
  // 音符属性写在品数后面、时值前面（时值由上层统一追加）。
  const suffix = props ? `{${props}}` : "";
  if (note.muted) {
    if (mute === "palm") return `${note.f}.${note.s}{pm}`;
    if (mute === "dead") return `x.${note.s}`;
  }
  return `${note.f}.${note.s}${suffix}`;
}

/** 连奏记号在 alphaTab 里标在「前一个音」上，而我们的数据标在后一个音上。 */
const TECH_PROPERTY: Record<string, string> = { h: "h", p: "p", s: "sl" };

function techniqueOf(onsets: Onset[]): Map<TabNote, string> {
  const map = new Map<TabNote, string>();
  const previous = new Map<number, TabNote>();
  for (const onset of onsets) {
    for (const note of onset.notes) {
      const property = note.tech ? TECH_PROPERTY[note.tech] : undefined;
      if (property) {
        const origin = previous.get(note.s);
        if (origin) map.set(origin, property);
      }
      if (note.bend !== undefined) {
        const semitones = Math.max(1, Math.round(note.bend));
        map.set(note, `b (0 ${semitones} 4)`);
      }
      previous.set(note.s, note);
    }
  }
  return map;
}

function beatText(
  onset: Onset,
  token: string,
  opts: {
    dotted: boolean;
    tuplet: boolean;
    mute: "palm" | "dead" | "plain";
    technique?: Map<TabNote, string>;
  },
): string {
  const text = (note: TabNote) =>
    noteText(note, opts.mute, opts.technique?.get(note));
  const body =
    onset.notes.length > 1
      ? `(${onset.notes.map(text).join(" ")})`
      : text(onset.notes[0]);
  // 一拍只能带一个花括号：`{bd} {d}` 是语法错，必须合成 `{bd d}`（实测）。
  const props: string[] = [];
  if (opts.tuplet) props.push("tu 3");
  const arrow = onset.notes[0].arrow;
  if (arrow === "D") props.push("bd");
  if (arrow === "U") props.push("bu");
  if (opts.dotted) props.push("d");
  const suffix = props.length > 0 ? ` {${props.join(" ")}}` : "";
  return `${body}${token}${suffix}`;
}

/**
 * 连音线的后半段：音高不写品数，写 `-`（alphaTex 里 `-` 就是 tie destination）。
 *
 * `(3.5 2.4).4 (-.5 -.4).16` —— 前半截一个四分、后半截一个十六分，中间画连音线。
 */
function tieText(onset: Onset, token: string, dotted: boolean): string {
  const notes = onset.notes.map((note) => `-.${note.s}`);
  const body = notes.length > 1 ? `(${notes.join(" ")})` : notes[0];
  return `${body}${token}${dotted ? " {d}" : ""}`;
}

/**
 * 把一条 `Tab` 翻成 alphaTex。
 *
 * 返回的文本可以直接丢给 `new alphaTab.AlphaTabApi(el, { core: { tex } })`。
 */
export function tabToAlphaTex(tab: Tab, options: AlphaTexOptions = {}): string {
  const mute = options.mute ?? "palm";
  const bpm = options.bpm ?? tab.bpm?.[0] ?? 80;
  const perBeat = quartersPerBeat(tab);
  const onsets = onsetsOf(tab.notes);

  const lines: string[] = [];
  if (options.title) lines.push(`\\title "${options.title.replace(/"/g, "'")}"`);
  lines.push(`\\tempo ${Math.round(bpm)}`);
  const denominator = tab.beatsPerBar === 6 ? 8 : 4;
  lines.push(`\\ts (${tab.beatsPerBar} ${denominator})`);

  // 三连音得先成组，才能在组里第一拍写 `{tu 3}`——所以先扫一遍标出组头和组员，再逐拍生成。
  const tupletHead = new Set<Onset>();
  const tupletMember = new Set<Onset>();
  let run: Onset[] = [];
  const closeRun = () => {
    for (let i = 0; i + 2 < run.length; i += 3) {
      tupletHead.add(run[i]);
      tupletMember.add(run[i]).add(run[i + 1]).add(run[i + 2]);
    }
    run = [];
  };
  for (const onset of onsets) {
    if (isTripletDuration(onset.dur)) run.push(onset);
    else closeRun();
  }
  closeRun();

  const rest = (quarters: number): string => {
    const { token, dotted } = durationParts(quarters);
    return `r${token}${dotted ? " {d}" : ""}`;
  };

  const technique = techniqueOf(onsets);
  const beats: string[] = [];
  for (let bar = 0; bar < tab.bars; bar++) {
    const start = bar * tab.beatsPerBar;
    const end = start + tab.beatsPerBar;
    const inBar = onsets.filter((onset) => onset.beat >= start - EPS && onset.beat < end - EPS);
    let cursor = start;
    for (const onset of inBar) {
      const gap = onset.beat - cursor;
      if (gap > 0.12) beats.push(rest(gap * perBeat));
      // 三连音按「记谱时值」写：实际的 1/3 拍写成八分，`{tu 3}` 负责压缩。
      const written = (tupletMember.has(onset) ? onset.dur * 1.5 : onset.dur) * perBeat;
      // 凑不成一档的时值拆成几截，用连音线接起来（不打散就凑不满小节）。
      const parts = chunkQuarters(written);
      for (const [index, part] of parts.entries()) {
        const { token, dotted } = durationParts(part);
        beats.push(
          index === 0
            ? beatText(onset, token, {
                dotted,
                tuplet: tupletHead.has(onset),
                mute,
                technique,
              })
            : tieText(onset, token, dotted),
        );
      }
      cursor = onset.beat + onset.dur;
    }
    if (end - cursor > 0.12) beats.push(rest((end - cursor) * perBeat));
    if (bar < tab.bars - 1) beats.push("|");
  }

  return `${lines.join("\n")}\n${beats.join(" ")}`;
}
