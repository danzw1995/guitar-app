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
  solfegeLabel,
} from "../../../packages/core/dist/index.js";

/**
 * Host 工具背后的纯函数：只依赖 @guitar/core 的构建产物，不碰 DSH 的任何 API，
 * 所以可以在 Node 里直接单测（见 test/host.mjs）。
 */

const invalid = (message) => {
  const error = new Error(message);
  error.code = "INVALID_ARGS";
  return error;
};

/**
 * `key.name` 本身已经带调式（"G 大调"、"A 小调"），再拼 `scale.name` 就会出现
 * "G 大调 大调"。已经包含就只留调名，否则加括号补充。
 */
function describeKeyScale(key, scale) {
  const keyLabel = key?.name ?? key?.id ?? "";
  const scaleLabel = scale?.name ?? scale?.id ?? "";
  if (!scaleLabel || keyLabel.includes(scaleLabel)) return keyLabel;
  return `${keyLabel}（${scaleLabel}）`;
}

/** 和弦：性质、构成音、常用指法。 */
export function chordLookup(name) {
  const shape = CHORD_BY_NAME.get(String(name).trim());
  if (!shape) {
    throw invalid(`没有内置和弦「${name}」，可用：${CHORDS.map((c) => c.name).join("、")}`);
  }
  const info = chordInfo(shape);
  const fingering = fingeringOf(shape);
  return {
    name: shape.name,
    quality: info.quality.name,
    root: info.rootName,
    fingering,
    frets: shape.frets,
    tones: info.tones.map((tone) => ({ note: tone.name, degree: tone.degree })),
    text: `${shape.name} ${info.quality.name}：${info.tones
      .map((tone) => `${tone.name}(${tone.degree})`)
      .join(" ")}；标准调弦指法 ${fingering}`,
  };
}

/** 音阶：音名、级数唱名、音高类。 */
export function scaleLookup(keyId, scaleId = "major") {
  const key = KEY_BY_ID.get(String(keyId));
  const scale = SCALE_BY_ID.get(String(scaleId));
  if (!key) throw invalid(`没有这个调「${keyId}」，可用：${KEYS.map((k) => k.id).join("、")}`);
  if (!scale) throw invalid(`没有这个音阶「${scaleId}」，可用：${SCALES.map((s) => s.id).join("、")}`);

  const names = scaleNames(key, scale);
  const pcs = scalePcs(key, scale);
  const solfege = pcs.map((pc) =>
    solfegeLabel(pc, key.tonicPc, { system: "movable", style: "number" }),
  );
  return {
    key: key.id,
    keyName: key.name,
    scale: scale.id,
    scaleName: scale.name,
    notes: names,
    solfege,
    pcs,
    text: `${describeKeyScale(key, scale)}：${names.join(" ")}（首调唱名 ${solfege.join(" ")}）`,
  };
}

/** 今日一题：日期、调、品域、要填格数。 */
export function dailyLookup(dateStr) {
  const dateKey = dateStr ? String(dateStr) : dateKeyOf(new Date());
  let spec;
  try {
    spec = dailySpecFor(dateKey);
  } catch (error) {
    throw invalid(`日期格式应为 YYYY-MM-DD，收到「${dateStr}」`);
  }
  const puzzle = dailyPuzzle(spec);
  const key = KEY_BY_ID.get(spec.keyId);
  const scale = SCALE_BY_ID.get(spec.scaleId);
  const toFill = puzzle.target.length - puzzle.givens.length;
  return {
    dateKey: spec.dateKey,
    key: spec.keyId,
    keyName: key?.name ?? spec.keyId,
    scale: spec.scaleId,
    scaleName: scale?.name ?? spec.scaleId,
    fretMin: spec.fretMin,
    fretMax: spec.fretMax,
    targets: puzzle.target.length,
    givens: puzzle.givens.length,
    toFill,
    text: `${spec.dateKey} 每日一题：${describeKeyScale(key, scale)}，${spec.fretMin}–${spec.fretMax} 品，共 ${puzzle.target.length} 格、已给 ${puzzle.givens.length} 格，要填 ${toFill} 格。`,
  };
}

/** 某一格是什么音：给「6 弦 3 品」这种问法直接用。 */
export function noteAt(stringNo, fret) {
  const s = Number(stringNo);
  const f = Number(fret);
  if (!Number.isInteger(s) || s < 1 || s > 6) throw invalid(`弦号应为 1–6（1 是最细的高音 E），收到「${stringNo}」`);
  if (!Number.isInteger(f) || f < 0 || f > 24) throw invalid(`品号应为 0–24，收到「${fret}」`);
  const idx = 6 - s; // 1 弦 -> index 5
  const pc = pitchClassAt(STANDARD_TUNING, idx, f);
  const fixed = solfegeLabel(pc, 0, { system: "fixed", style: "number" });
  return {
    string: s,
    fret: f,
    pc,
    fixedSolfege: fixed,
    text: `${s} 弦 ${f} 品：音高类 ${pc}（固定唱名 ${fixed}）`,
  };
}
