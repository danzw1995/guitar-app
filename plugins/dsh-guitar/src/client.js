import { createElement as h, useMemo, useState } from "react";
import {
  CHORDS,
  CHORD_BY_NAME,
  KEYS,
  KEY_BY_ID,
  SCALES,
  SCALE_BY_ID,
  STANDARD_TUNING,
  chordInfo,
  dateKeyOf,
  dailyPuzzle,
  dailySpecFor,
  fingeringOf,
  pitchClassAt,
  scaleNames,
  scalePcs,
} from "../../../packages/core/dist/index.js";

/**
 * Guitar Lab 的对话侧面板：和弦指法图 / 音阶指板 / 今日一题。
 *
 * 挂在 conversation.view —— 和 Chat / Trajectory 并列的整页标签（list 槽，可多注册）。
 * 不要挂 conversation.header：那是 single 槽，宿主自己占了，注册会直接抛
 * "single slot already has a registration"。
 * 也不要挂 conversation.composer.dock：那是输入框内放 token 统计的一行，塞不下指板。
 */

const SLOT = "conversation.view";
const ID = "guitar-lab";

const ROOT = "#d4a72c";
const TONE = "#3b82f6";
const INK = "#0d1117";

/* ---------- 几何：一个 SVG 单位 = 1，靠 viewBox 缩放 ---------- */
const LABEL_W = 24;
const FRET_W = 38;
const STRING_H = 22;
const PAD_TOP = 12;
const PAD_BOT = 10;
const STRINGS = 6;

function geometry(fretMin, fretMax) {
  const frets = fretMax - fretMin + 1;
  return {
    w: LABEL_W + frets * FRET_W,
    h: PAD_TOP + (STRINGS - 1) * STRING_H + PAD_BOT,
    // 第 f 品的左边界
    edge: (f) => LABEL_W + (f - fretMin) * FRET_W,
    // 第 f 品的中心
    center: (f) => LABEL_W + (f - fretMin + 0.5) * FRET_W,
    // 第 s 根弦的中心线（s = 0 是 1 弦，最上面）
    line: (s) => PAD_TOP + s * STRING_H,
  };
}

function StringLabels({ g }) {
  return h(
    "g",
    null,
    ["E", "B", "G", "D", "A", "E"].map((name, s) =>
      h(
        "text",
        {
          key: s,
          x: LABEL_W - 10,
          y: g.line(s) + 3.5,
          textAnchor: "end",
          fontSize: 10,
          fill: "currentColor",
          opacity: 0.55,
        },
        name,
      ),
    ),
  );
}

function Board({ g, fretMin, fretMax }) {
  const frets = [];
  for (let f = fretMin; f <= fretMax; f++) {
    frets.push(
      h("line", {
        key: `f${f}`,
        x1: g.edge(f),
        y1: g.line(0) - 6,
        x2: g.edge(f),
        y2: g.line(STRINGS - 1) + 6,
        stroke: "currentColor",
        strokeWidth: f === fretMin ? 3 : 0.8,
        opacity: f === fretMin ? 0.75 : 0.35,
      }),
    );
  }
  // 右边界
  frets.push(
    h("line", {
      key: "fEnd",
      x1: g.edge(fretMax + 1),
      y1: g.line(0) - 6,
      x2: g.edge(fretMax + 1),
      y2: g.line(STRINGS - 1) + 6,
      stroke: "currentColor",
      strokeWidth: 0.8,
      opacity: 0.35,
    }),
  );
  const inlays = [3, 5, 7, 9, 12].filter((f) => f >= fretMin && f <= fretMax);
  return h(
    "g",
    null,
    inlays.map((f) =>
      h("circle", {
        key: `i${f}`,
        cx: g.center(f),
        cy: (g.line(0) + g.line(STRINGS - 1)) / 2,
        r: 4.5,
        fill: "currentColor",
        opacity: 0.1,
      }),
    ),
    frets,
    Array.from({ length: STRINGS }, (_, s) =>
      h("line", {
        key: `s${s}`,
        x1: LABEL_W - 6,
        y1: g.line(s),
        x2: g.edge(fretMax + 1),
        y2: g.line(s),
        stroke: "currentColor",
        strokeWidth: s === STRINGS - 1 ? 1.7 : 0.9,
        opacity: 0.5,
      }),
    ),
    h(StringLabels, { g }),
  );
}

function Dot({ cx, cy, label, kind, r }) {
  const fill = kind === "root" ? ROOT : kind === "tone" ? TONE : "currentColor";
  return h(
    "g",
    null,
    h("circle", { cx, cy, r, fill, opacity: kind === "idle" ? 0.25 : 1 }),
    label
      ? h(
          "text",
          {
            x: cx,
            y: cy + 3.4,
            textAnchor: "middle",
            fontSize: label.length > 2 ? 7.5 : 9,
            fontWeight: 600,
            fill: kind === "idle" ? "currentColor" : INK,
          },
          label,
        )
      : null,
  );
}

/** 和弦指法图：0–5 品，空弦画空心圈、闷弦画 ×。 */
function ChordBoard({ shape }) {
  const g = geometry(1, 5);
  const info = useMemo(() => chordInfo(shape), [shape]);
  const toneByPc = useMemo(() => {
    const map = new Map();
    for (const tone of info.tones) map.set(tone.pc, tone);
    return map;
  }, [info]);

  const marks = [];
  for (let s = 0; s < STRINGS; s++) {
    const fret = shape.frets[STRINGS - 1 - s];
    const y = g.line(s);
    if (fret < 0) {
      marks.push(
        h(
          "text",
          { key: `x${s}`, x: LABEL_W - 8, y: y + 3.5, textAnchor: "middle", fontSize: 10, fill: "currentColor", opacity: 0.45 },
          "×",
        ),
      );
    } else if (fret === 0) {
      marks.push(
        h("circle", { key: `o${s}`, cx: LABEL_W - 8, cy: y, r: 3.4, fill: "none", stroke: "currentColor", strokeWidth: 1, opacity: 0.55 }),
      );
    } else if (fret >= 1 && fret <= 5) {
      const pc = pitchClassAt(STANDARD_TUNING, s, fret);
      const tone = toneByPc.get(pc);
      marks.push(
        h(Dot, {
          key: `d${s}`,
          cx: g.center(fret),
          cy: y,
          label: tone ? tone.name : null,
          kind: tone && tone.degree === "1" ? "root" : "tone",
          r: 8.5,
        }),
      );
    }
  }

  return h(
    "div",
    { className: "gl-board gl-chord-max" },
    h(
      "svg",
      {
        viewBox: `0 0 ${g.w} ${g.h}`,
        role: "img",
        "aria-label": `${shape.name} ${info.quality.name} ${fingeringOf(shape)}`,
      },
      h(Board, { g, fretMin: 1, fretMax: 5 }),
      marks,
    ),
  );
}

/** 音阶指板：1–12 品，主音金色、其余音阶音蓝色、调外音不画。 */
function ScaleBoard({ keyId, scaleId }) {
  const data = useMemo(() => {
    const key = KEY_BY_ID.get(keyId);
    const scale = SCALE_BY_ID.get(scaleId);
    if (!key || !scale) return null;
    const pcs = scalePcs(key, scale);
    const names = scaleNames(key, scale);
    const nameByPc = new Map();
    pcs.forEach((pc, i) => nameByPc.set(pc, names[i]));
    return { key, scale, nameByPc };
  }, [keyId, scaleId]);

  const g = geometry(1, 12);
  if (!data) return null;

  const dots = [];
  for (let s = 0; s < STRINGS; s++) {
    for (let f = 1; f <= 12; f++) {
      const pc = pitchClassAt(STANDARD_TUNING, s, f);
      const name = data.nameByPc.get(pc);
      if (!name) continue;
      dots.push(
        h(Dot, {
          key: `${s}:${f}`,
          cx: g.center(f),
          cy: g.line(s),
          label: name,
          kind: pc === data.key.tonicPc ? "root" : "tone",
          r: 7.5,
        }),
      );
    }
  }

  return h(
    "div",
    { className: "gl-board" },
    h(
      "svg",
      { viewBox: `0 0 ${g.w} ${g.h}`, role: "img", "aria-label": `${keyId} ${data.scale.name}` },
      h(Board, { g, fretMin: 1, fretMax: 12 }),
      dots,
    ),
  );
}

/* ---------- 面板 ---------- */

const CSS = `
.gl-page {
  box-sizing: border-box; width: 100%; height: 100%; overflow: auto;
  padding: 24px;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-xs-13, 13px/20px var(--dsw-font-family, inherit));
}
.gl-inner { max-width: 920px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.gl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.gl-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gl-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.gl-sub { color: var(--dsw-alias-label-tertiary, rgba(127, 127, 127, 0.8)); font-size: 12px; line-height: 18px; }
.gl-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gl-tabs {
  display: flex; align-items: center; gap: 2px; padding: 2px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
  border-radius: 999px;
}
.gl-tab {
  appearance: none; border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit; padding: 3px 12px; border-radius: 999px; cursor: pointer;
  min-height: 26px;
}
.gl-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12)); }
.gl-tab[aria-selected='true'] {
  color: var(--dsw-alias-label-primary, inherit);
  font-weight: 600;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14));
  border-color: var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3));
}
.gl-select {
  font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-1, transparent);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3));
  border-radius: 8px; padding: 3px 8px; min-height: 26px;
}
.gl-card {
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.gl-board { width: 100%; max-width: 760px; }
.gl-board svg { display: block; width: 100%; height: auto; }
.gl-chord-max { max-width: 340px; }
.gl-meta {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; line-height: 18px;
}
.gl-legend { display: flex; align-items: center; gap: 12px; }
.gl-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.gl-fingering { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0.12em; color: var(--dsw-alias-label-primary, inherit); }
`;

function Tabs({ tab, setTab, t }) {
  const items = [
    ["chord", t("tab.chord", "和弦")],
    ["scale", t("tab.scale", "音阶")],
    ["today", t("tab.today", "今日")],
  ];
  return h(
    "div",
    { className: "gl-tabs", role: "tablist" },
    items.map(([id, label]) =>
      h(
        "button",
        {
          key: id,
          type: "button",
          role: "tab",
          className: "gl-tab",
          "aria-selected": tab === id,
          onClick: () => setTab(id),
        },
        label,
      ),
    ),
  );
}

function Panel({ t, initialTab = "chord" }) {
  const [tab, setTab] = useState(initialTab);
  const [chordName, setChordName] = useState("C");
  const [keyId, setKeyId] = useState("G");
  const [scaleId, setScaleId] = useState("major");

  const shape = CHORD_BY_NAME.get(chordName);
  const info = useMemo(() => (shape ? chordInfo(shape) : null), [shape]);
  const spec = useMemo(() => dailySpecFor(dateKeyOf(new Date())), []);
  const today = useMemo(() => dailyPuzzle(spec), [spec]);

  return h(
    "div",
    { className: "gl-page", "data-guitar-lab": true },
    h("style", null, CSS),
    h(
      "div",
      { className: "gl-inner" },
      h(
        "div",
        { className: "gl-head" },
        h(
          "div",
          { className: "gl-heading" },
          h("h2", { className: "gl-title" }, "Guitar Lab"),
          h("span", { className: "gl-sub" }, t("subtitle", "标准调弦 · 音名")),
        ),
        h(
          "div",
          { className: "gl-controls" },
          h(Tabs, { tab, setTab, t }),
          tab === "chord"
            ? h(
                "select",
                { className: "gl-select", value: chordName, onChange: (e) => setChordName(e.target.value), "aria-label": t("chord", "和弦") },
                CHORDS.map((c) => h("option", { key: c.name, value: c.name }, c.name)),
              )
            : null,
          tab === "scale"
            ? [
                h(
                  "select",
                  { key: "k", className: "gl-select", value: keyId, onChange: (e) => setKeyId(e.target.value), "aria-label": t("key", "调") },
                  KEYS.map((k) => h("option", { key: k.id, value: k.id }, k.id)),
                ),
                h(
                  "select",
                  { key: "s", className: "gl-select", value: scaleId, onChange: (e) => setScaleId(e.target.value), "aria-label": t("scale", "音阶") },
                  SCALES.map((s) => h("option", { key: s.id, value: s.id }, s.name)),
                ),
              ]
            : null,
        ),
      ),
      h(
        "div",
        { className: "gl-card" },
        tab === "chord" && shape ? h(ChordBoard, { shape }) : null,
        tab === "scale" ? h(ScaleBoard, { keyId, scaleId }) : null,
        tab === "today" ? h(ScaleBoard, { keyId: spec.keyId, scaleId: spec.scaleId }) : null,
      ),
      tab === "chord" && shape && info
        ? h(
            "div",
            { className: "gl-meta" },
            h("span", null, `${info.rootName} ${info.quality.name}`),
            h("span", { className: "gl-fingering" }, fingeringOf(shape)),
            h(
              "span",
              { className: "gl-legend" },
              h("span", null, h("i", { className: "gl-swatch", style: { background: ROOT } }), t("legend.root", "根音")),
              h("span", null, h("i", { className: "gl-swatch", style: { background: TONE } }), t("legend.tone", "构成音")),
            ),
            h("span", null, info.tones.map((tone) => `${tone.name} ${tone.degree}`).join(" · ")),
          )
        : null,
      tab === "scale"
        ? h(
            "div",
            { className: "gl-meta" },
            h(
              "span",
              { className: "gl-legend" },
              h("span", null, h("i", { className: "gl-swatch", style: { background: ROOT } }), t("legend.root", "主音")),
              h("span", null, h("i", { className: "gl-swatch", style: { background: TONE } }), t("legend.tone", "音阶音")),
            ),
          )
        : null,
      tab === "today"
        ? h(
            "div",
            { className: "gl-meta" },
            h("span", null, spec.dateKey),
            h("span", null, spec.keyId),
            h("span", null, `${spec.fretMin}–${spec.fretMax} 品`),
            h("span", null, `${t("toFill", "要填")} ${today.target.length - today.givens.length} 格`),
          )
        : null,
    ),
  );
}

/** 文案走宿主 locale，取不到用中文兜底。 */
function makeT(ctx) {
  return (key, fallback) => {
    try {
      const value = ctx.locale?.t?.(key);
      return typeof value === "string" && value ? value : fallback;
    } catch {
      return fallback;
    }
  };
}

export const inject = ["slots"];

/** 也导出给无浏览器测试用（`initialTab` 可以指定渲染哪一页）。 */
export { Panel };

export function apply(ctx) {
  const t = makeT(ctx);
  const Component = () => h(Panel, { t });
  ctx.slots.inject(SLOT, () =>
    ctx.slots.register(
      {
        name: SLOT,
        id: ID,
        order: 10,
        label: () => t("view.label", "Guitar Lab"),
      },
      Component,
    ),
  );
}
