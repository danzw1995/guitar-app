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
} from "../../../packages/core/dist/index.js";

/**
 * Guitar Lab 的对话侧面板：和弦构成音、音阶音、今日一题。
 * 只读 @guitar/core 的纯函数；进度与存档仍留在 Web 应用里。
 */

const SLOT = "conversation.composer.dock";
const ID = "guitar-lab";

const CSS = `
.gl-panel {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-subtle, #30363d);
  background: var(--dsw-alias-bg-elevated, rgba(22, 27, 34, 0.55));
  color: var(--dsw-alias-text-primary, #e6edf3);
  font-size: 13px; line-height: 1.5;
}
.gl-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gl-title {
  font-weight: 700; font-size: 11px; letter-spacing: 0.14em;
  color: var(--dsw-alias-accent-primary, #d4a72c);
}
.gl-tabs { display: flex; gap: 4px; }
.gl-tab {
  border: 1px solid transparent; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-text-secondary, #8b949e);
  font-size: 12px; padding: 3px 10px; cursor: pointer; min-height: 28px;
}
.gl-tab:hover { background: var(--dsw-alias-bg-hover, rgba(255, 255, 255, 0.06)); }
.gl-tab[aria-selected='true'] {
  color: var(--dsw-alias-text-primary, #e6edf3);
  border-color: var(--dsw-alias-border-subtle, #30363d);
  background: var(--dsw-alias-bg-base, rgba(255, 255, 255, 0.04));
}
.gl-stack { display: flex; flex-direction: column; gap: 6px; }
.gl-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gl-select {
  background: var(--dsw-alias-bg-base, #0d1117);
  color: var(--dsw-alias-text-primary, #e6edf3);
  border: 1px solid var(--dsw-alias-border-subtle, #30363d);
  border-radius: 6px; padding: 4px 8px; font-size: 12px; min-height: 30px;
}
.gl-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.gl-chip {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-subtle, #30363d);
  background: var(--dsw-alias-bg-base, rgba(255, 255, 255, 0.03));
  font-variant-numeric: tabular-nums;
}
.gl-chip b { font-weight: 600; }
.gl-chip i { font-style: normal; color: var(--dsw-alias-text-secondary, #8b949e); font-size: 11px; }
.gl-note { color: var(--dsw-alias-text-secondary, #8b949e); font-size: 12px; }
.gl-strong { font-weight: 600; letter-spacing: 0.06em; }
`;

function Chip({ name, sub }) {
  return h("span", { className: "gl-chip" }, h("b", null, name), sub ? h("i", null, sub) : null);
}

function ChordView({ t }) {
  const [name, setName] = useState("C");
  const data = useMemo(() => {
    const shape = CHORD_BY_NAME.get(name);
    return shape ? { info: chordInfo(shape), fingering: fingeringOf(shape) } : null;
  }, [name]);

  return h(
    "div",
    { className: "gl-stack" },
    h(
      "div",
      { className: "gl-row" },
      h("span", { className: "gl-note" }, t("chord", "和弦")),
      h(
        "select",
        { className: "gl-select", value: name, onChange: (e) => setName(e.target.value) },
        CHORDS.map((c) => h("option", { key: c.name, value: c.name }, c.name)),
      ),
      data ? h("span", { className: "gl-note" }, data.info.quality.name) : null,
      data ? h("span", { className: "gl-strong" }, data.fingering) : null,
    ),
    data
      ? h(
          "div",
          { className: "gl-chips" },
          data.info.tones.map((tone, i) =>
            h(Chip, { key: `${tone.name}-${i}`, name: tone.name, sub: tone.degree }),
          ),
        )
      : null,
  );
}

function ScaleView({ t }) {
  const [keyId, setKeyId] = useState("C");
  const [scaleId, setScaleId] = useState("major");
  const data = useMemo(() => {
    const key = KEY_BY_ID.get(keyId);
    const scale = SCALE_BY_ID.get(scaleId);
    if (!key || !scale) return null;
    return { names: scaleNames(key, scale), label: scale.name };
  }, [keyId, scaleId]);

  return h(
    "div",
    { className: "gl-stack" },
    h(
      "div",
      { className: "gl-row" },
      h(
        "select",
        { className: "gl-select", value: keyId, onChange: (e) => setKeyId(e.target.value) },
        KEYS.map((k) => h("option", { key: k.id, value: k.id }, k.id)),
      ),
      h(
        "select",
        { className: "gl-select", value: scaleId, onChange: (e) => setScaleId(e.target.value) },
        SCALES.map((s) => h("option", { key: s.id, value: s.id }, s.name)),
      ),
      data ? h("span", { className: "gl-note" }, data.label) : null,
    ),
    data ? h("div", { className: "gl-chips" }, data.names.map((n) => h(Chip, { key: n, name: n }))) : null,
  );
}

function TodayView({ t }) {
  const spec = useMemo(() => dailySpecFor(dateKeyOf(new Date())), []);
  const puzzle = useMemo(() => dailyPuzzle(spec), [spec]);
  const tonicCells = useMemo(() => {
    const key = KEY_BY_ID.get(spec.keyId);
    if (!key) return [];
    const out = [];
    for (let s = 0; s < 6; s++) {
      for (let f = spec.fretMin; f <= spec.fretMax; f++) {
        if (pitchClassAt(STANDARD_TUNING, s, f) === key.tonicPc) out.push(`${s + 1} 弦 ${f} 品`);
      }
    }
    return out;
  }, [spec]);

  return h(
    "div",
    { className: "gl-stack" },
    h(
      "div",
      { className: "gl-chips" },
      h(Chip, { name: spec.dateKey, sub: t("today", "今日") }),
      h(Chip, { name: spec.keyId, sub: t("key", "调") }),
      h(Chip, { name: `${spec.fretMin}–${spec.fretMax}`, sub: t("frets", "品") }),
      h(Chip, {
        name: String(puzzle.target.length - puzzle.givens.length),
        sub: t("toFill", "要填"),
      }),
    ),
    h(
      "div",
      { className: "gl-note" },
      `${t("tonic", "主音位置")}：${tonicCells.length ? tonicCells.join(" · ") : "—"}`,
    ),
  );
}

function Panel({ t }) {
  const [tab, setTab] = useState("chord");
  const tabs = [
    ["chord", t("tab.chord", "和弦")],
    ["scale", t("tab.scale", "音阶")],
    ["today", t("tab.today", "今日")],
  ];

  return h(
    "div",
    { className: "gl-panel" },
    h("style", null, CSS),
    h(
      "div",
      { className: "gl-head" },
      h("span", { className: "gl-title" }, "GUITAR LAB"),
      h(
        "div",
        { className: "gl-tabs", role: "tablist" },
        tabs.map(([id, label]) =>
          h(
            "button",
            {
              key: id,
              role: "tab",
              type: "button",
              className: "gl-tab",
              "aria-selected": tab === id,
              onClick: () => setTab(id),
            },
            label,
          ),
        ),
      ),
    ),
    tab === "chord" ? h(ChordView, { t }) : null,
    tab === "scale" ? h(ScaleView, { t }) : null,
    tab === "today" ? h(TodayView, { t }) : null,
  );
}

/** 文案走宿主的 locale 服务；拿不到就用中文兜底。 */
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

export function apply(ctx) {
  const t = makeT(ctx);
  const Component = () => h(Panel, { t });
  ctx.slots.inject(SLOT, () =>
    ctx.slots.register({ name: SLOT, id: ID, order: 5 }, Component),
  );
}
