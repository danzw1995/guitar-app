import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHORDS,
  CHORD_BY_NAME,
  chordVoicingTab,
  chordPatternTab,
  EMPTY_PROGRESS,
  FLAT_NAMES,
  KEY_BY_ID,
  SCALE_BY_ID,
  SHARP_NAMES,
  STANDARD_TUNING,
  applyAttempt,
  cellKey,
  centsOff,
  chordInfo,
  chromaOfSpectrum,
  detectChord,
  detectChordFromChroma,
  segmentChords,
  chordMidis,
  qualityIntervals,
  sequenceTabOf,
  segmentTabOf,
  bassLineOf,
  chordLabelOf,
  estimateTempo,
  snapSegments,
  degreeInKey,
  voicingOf,
  completedCount,
  dailyPuzzle,
  dailySpecFor,
  dateKeyOf,
  dayNumberOf,
  detectPitch,
  diatonicNames,
  expectedNameMap,
  fingeringOf,
  frequencyOfMidi,
  fromLegacyBest,
  generatePuzzle,
  isPerfect,
  isUnlocked,
  isValidDateKey,
  midiOfFrequency,
  mondayOf,
  nearestString,
  smoothFreqs,
  stringsOf,
  tunerReading,
  tuningPreset,
  weekSummaryOf,
  goalProgress,
  weekPace,
  weekStreak,
  weekReportOf,
  detectNotes,
  quantizeNotes,
  positionsFor,
  pickPosition,
  tabFromNotes,
  transcribeFrames,
  earRound,
  earDegreeQuestion,
  degreeLabel,
  degreeChord,
  earProgressionQuestion,
  DEGREE_PROGRESSIONS,
  earQualityQuestion,
  EAR_QUALITIES,
  QUALITY_SETS,
  MAJOR_DEGREES,
  intervalName,
  earIntervalQuestion,
  midiOf,
  noteName,
  earPositionQuestion,
  lastNDays,
  nextDateKey,
  nextNoteQuery,
  noteCandidates,
  NOTE_NAMES,
  parMsFor,
  parseProgress,
  parseNote,
  pitchClassAt,
  previousDateKey,
  scaleNames,
  solfegeAlternatives,
  solfegeLabel,
  solfegeOctaveShift,
  solfegeTable,
  starsForAttempt,
  starsOf,
  streakOf,
  summarizeProgress,
  targetCells,
  totalStars,
  checkAnswer,
  type AttemptResult,
  PROGRESSIONS,
  chordAt,
  changesIn,
  drillBeats,
  hardestTally,
  sliceTab,
  analyzeTiming,
  detectOnsets,
} from "../src/index.ts";
import {
  CIRCLE,
  INTERVALS,
  CHORD_QUALITIES,
  circleKey,
  circleQuestion,
  fifthsDistance,
  frequencyOf,
  intervalBetween,
  intervalOf,
  intervalQuestion,
  mulberry32,
  neighborKeys,
  spellInterval,
  stackThirds,
  thirdQuestion,
  twelveToneTable,
  chordDegreeInKey,
  degreesOfKey,
  cagedShapes,
  THEORY_LEVELS,
  theoryTasks,
  theoryTargetCount,
  judgeTask,
  theoryAttempt,
  METERS,
  NOTE_VALUES,
  STRUM_PATTERNS,
  VALUE_LADDER,
  beatsOf,
  bpmToMs,
  clicksPerBar,
  countLine,
  gridSlots,
  meterOf,
  noteValueById,
  stepMs,
  strumPatternById,
  BLOCKS,
  DRILLS,
  SESSION_MINUTES,
  STAGES,
  TECHNIQUES,
  allocateMinutes,
  buildSession,
  drillById,
  drillsFor,
  chordTab,
  scaleRun,
  tabEvents,
  practiceStats,
  recordBlock,
  heatmapOf,
  heatLevel,
  weekdayIndex,
  pushBpmPoint,
  sparklineOf,
  regressedIds,
  lastPracticed,
  dueDaysOf,
  pickDue,
  FRESH_DAYS,
  stageForCompleted,
  techniqueById,
  techniquesOf,
  RHYTHM_DRILLS,
  READING_DRILLS,
  STRUM_LIBRARY,
  STRUM_DRILLS,
  ACCOMPANIMENTS,
  SONG_SNIPPETS,
  tabToAlphaTex,
  tabAriaLabel,
  tabOf,
  n,
} from "../src/index.ts";
import { loadLevels } from "../src/levels.ts";

test("standard tuning open strings", () => {
  assert.equal(STANDARD_TUNING.strings[0], 64); // 1 弦 e
  assert.equal(STANDARD_TUNING.strings[5], 40); // 6 弦 E
  assert.equal(pitchClassAt(STANDARD_TUNING, 5, 0), 4); // E
  assert.equal(pitchClassAt(STANDARD_TUNING, 0, 1), 5); // F
});

test("key spelling", () => {
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("F")!), ["F", "G", "A", "Bb", "C", "D", "E"]);
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("Bb")!), ["Bb", "C", "D", "Eb", "F", "G", "A"]);
  assert.deepEqual(diatonicNames(KEY_BY_ID.get("Am")!), ["A", "B", "C", "D", "E", "F", "G"]);
  assert.deepEqual(scaleNames(KEY_BY_ID.get("C")!, SCALE_BY_ID.get("majorPentatonic")!), ["C", "D", "E", "G", "A"]);
});

test("note parsing", () => {
  assert.equal(parseNote("C"), 0);
  assert.equal(parseNote("Bb"), 10);
  assert.equal(parseNote("A#"), 10);
  assert.equal(parseNote("H"), null);
});

test("target cells for C major", () => {
  const cells = targetCells(STANDARD_TUNING, KEY_BY_ID.get("C")!, SCALE_BY_ID.get("major")!, 0, 12);
  assert.ok(cells.length > 35);
  for (const c of cells) {
    assert.ok([0, 2, 4, 5, 7, 9, 11].includes(pitchClassAt(STANDARD_TUNING, c.s, c.f)));
  }
});

test("generate puzzle keeps givens inside target", () => {
  const p = generatePuzzle({ seed: 42, keyId: "F", scaleId: "major", fretMin: 1, fretMax: 7, givenRatio: 0.5 });
  const targetKeys = new Set(p.target.map(cellKey));
  assert.equal(p.givens.length, Math.round(p.target.length * 0.5));
  assert.equal(new Set(p.givens.map(cellKey)).size, p.givens.length);
  for (const g of p.givens) assert.ok(targetKeys.has(cellKey(g)));
  assert.ok(p.difficulty > 0 && p.difficulty < 1);
});

test("checkAnswer: all correct", () => {
  const p = generatePuzzle({ seed: 7, keyId: "G", scaleId: "major", fretMin: 1, fretMax: 5, givenRatio: 0.5 });
  const expected = expectedNameMap(p);
  const answers: Record<string, string> = {};
  for (const c of p.target) answers[cellKey(c)] = expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f))!;
  const r = checkAnswer(p, answers);
  assert.equal(r.correct, r.total);
  assert.equal(r.wrong, 0);
  assert.equal(r.finished, true);
  assert.equal(r.accuracy, 1);
});

test("checkAnswer: spelling warning and wrong", () => {
  const p = generatePuzzle({ seed: 9, keyId: "F", scaleId: "major", fretMin: 1, fretMax: 7, givenRatio: 0.5 });
  const expected = expectedNameMap(p);
  const answers: Record<string, string> = {};
  for (const c of p.target) answers[cellKey(c)] = expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f))!;

  const bb = p.target.find((c) => expected.get(pitchClassAt(STANDARD_TUNING, c.s, c.f)) === "Bb");
  assert.ok(bb, "F major should contain Bb");
  answers[cellKey(bb!)] = "A#";
  let r = checkAnswer(p, answers);
  const bbResult = r.cells.find((c) => cellKey(c.cell) === cellKey(bb!))!;
  assert.equal(bbResult.status, "spelling");
  assert.equal(r.spelling, 1);

  const other = p.target.find((c) => cellKey(c) !== cellKey(bb!))!;
  answers[cellKey(other)] = "H";
  r = checkAnswer(p, answers);
  assert.equal(r.wrong, 1);
  assert.equal(r.finished, true);
});

test("checkAnswer: empty cells", () => {
  const p = generatePuzzle({ seed: 3, keyId: "C", scaleId: "major", fretMin: 1, fretMax: 5, givenRatio: 0.5 });
  const r = checkAnswer(p, {});
  assert.equal(r.empty, r.total);
  assert.equal(r.finished, false);
});

test("40 levels are valid", () => {
  const levels = loadLevels();
  assert.equal(levels.length, 40);
  const seen = new Set<string>();
  for (const l of levels) {
    assert.ok(!seen.has(l.id));
    seen.add(l.id);
    const p = generatePuzzle({
      id: l.id,
      seed: l.seed,
      keyId: l.keyId,
      scaleId: l.scaleId,
      fretMin: l.fretMin,
      fretMax: l.fretMax,
      givenRatio: l.givenRatio,
    });
    assert.equal(p.target.length, l.targetCount, `${l.id} target count`);
    const targetKeys = new Set(p.target.map(cellKey));
    assert.equal(p.givens.length, l.givens.length, `${l.id} givens count`);
    for (const g of l.givens) {
      assert.ok(targetKeys.has(cellKey(g)), `${l.id} given ${cellKey(g)} not in target`);
    }
    assert.equal(new Set(l.givens.map(cellKey)).size, l.givens.length, `${l.id} duplicate givens`);
  }
});

// ---- 进度与星级 ----

/** 只关心计数，cells 内容不参与进度计算。 */
function fakeResult(correct: number, spelling: number, wrong: number, empty: number): AttemptResult {
  const total = correct + spelling + wrong + empty;
  return {
    cells: [],
    correct,
    spelling,
    wrong,
    empty,
    total,
    accuracy: total ? correct / total : 0,
    finished: empty === 0,
  };
}

const L01_PAR = parMsFor({ targetCount: 18, difficulty: 0.3 });

test("parMsFor: 参考关卡落在合理区间", () => {
  assert.equal(parMsFor({ targetCount: 18, difficulty: 0.3 }), 52200);
  assert.equal(parMsFor({ targetCount: 48, difficulty: 0.678 }), 193632);
  // 难度和格数都不该把达标时间推到 5 分钟以上
  for (const l of loadLevels()) {
    const par = parMsFor({ targetCount: l.targetCount, difficulty: l.difficulty });
    assert.ok(par >= 30000 && par <= 300000, `${l.id} par ${par}`);
  }
});

test("starsOf: 完成度 + 最快全对用时", () => {
  assert.equal(starsOf({ completed: false, bestMs: null }, L01_PAR), 0);
  assert.equal(starsOf({ completed: true, bestMs: null }, L01_PAR), 1);
  assert.equal(starsOf({ completed: true, bestMs: L01_PAR + 1 }, L01_PAR), 2);
  assert.equal(starsOf({ completed: true, bestMs: L01_PAR }, L01_PAR), 3);
  assert.equal(starsOf({ completed: true, bestMs: 1000 }, L01_PAR), 3);
});

test("isPerfect: 宽松算拼写对，严格不算", () => {
  const withSpelling = fakeResult(17, 1, 0, 0);
  assert.equal(isPerfect(withSpelling, false), true);
  assert.equal(isPerfect(withSpelling, true), false);
  assert.equal(isPerfect(fakeResult(18, 0, 0, 0), true), true);
  assert.equal(isPerfect(fakeResult(17, 0, 1, 0), false), false);
});

test("applyAttempt: 首次完成给 1 星，全对才记最快成绩", () => {
  const slowWrong = applyAttempt(undefined, fakeResult(15, 0, 3, 0), {
    elapsedMs: 90000, strictSpelling: false, parMs: L01_PAR, at: 111,
  });
  assert.equal(slowWrong.completed, true);
  assert.equal(slowWrong.stars, 1);
  assert.equal(slowWrong.bestMs, null);
  assert.equal(slowWrong.attempts, 1);
  assert.equal(slowWrong.totalMs, 90000, "累计时长要加上这一把");
  assert.equal(slowWrong.lastAt, 111);

  // 全对但超时 -> 2 星，并且记下用时
  const slowPerfect = applyAttempt(slowWrong, fakeResult(18, 0, 0, 0), {
    elapsedMs: 120000, strictSpelling: false, parMs: L01_PAR, at: 222,
  });
  assert.equal(slowPerfect.stars, 2);
  assert.equal(slowPerfect.bestMs, 120000);
  assert.equal(slowPerfect.totalMs, 210000, "累计时长跨多次尝试累加");

  // 再次全对且更快 -> 3 星
  const fastPerfect = applyAttempt(slowPerfect, fakeResult(18, 0, 0, 0), {
    elapsedMs: 40000, strictSpelling: false, parMs: L01_PAR, at: 333,
  });
  assert.equal(fastPerfect.stars, 3);
  assert.equal(fastPerfect.bestMs, 40000);
  assert.equal(fastPerfect.attempts, 3);
  assert.equal(fastPerfect.totalMs, 250000);
});

test("applyAttempt: 不改旧记录、更慢不覆盖最快、未完成不降级", () => {
  const best = applyAttempt(undefined, fakeResult(18, 0, 0, 0), {
    elapsedMs: 40000, strictSpelling: false, parMs: L01_PAR, at: 1,
  });
  const snapshot = { ...best };

  const slower = applyAttempt(best, fakeResult(18, 0, 0, 0), {
    elapsedMs: 80000, strictSpelling: false, parMs: L01_PAR, at: 2,
  });
  assert.equal(slower.bestMs, 40000, "更慢不该覆盖最快");
  assert.equal(slower.stars, 3);

  const unfinished = applyAttempt(best, fakeResult(10, 0, 2, 6), {
    elapsedMs: 5000, strictSpelling: false, parMs: L01_PAR, at: 3,
  });
  assert.equal(unfinished.completed, true, "已完成不会因为一次没做完而回退");
  assert.equal(unfinished.stars, 3);
  assert.equal(unfinished.bestMs, 40000);

  assert.deepEqual(best, snapshot, "applyAttempt 不应改动传入的 prev");
});

test("applyAttempt: 严格拼写拿不到 2 星以上", () => {
  const lenient = applyAttempt(undefined, fakeResult(17, 1, 0, 0), {
    elapsedMs: 30000, strictSpelling: false, parMs: L01_PAR, at: 1,
  });
  assert.equal(lenient.stars, 3);

  const strict = applyAttempt(undefined, fakeResult(17, 1, 0, 0), {
    elapsedMs: 30000, strictSpelling: true, parMs: L01_PAR, at: 1,
  });
  assert.equal(strict.stars, 1);
  assert.equal(strict.bestMs, null);
});

test("applyAttempt: 没开始就提交不产生最快成绩", () => {
  const r = applyAttempt(undefined, fakeResult(18, 0, 0, 0), {
    elapsedMs: 0, strictSpelling: false, parMs: L01_PAR, at: 1,
  });
  assert.equal(r.completed, true);
  assert.equal(r.bestMs, null);
  assert.equal(r.stars, 1);
});

test("isUnlocked: 逐关解锁，第一关常开", () => {
  const ids = loadLevels().map((l) => l.id);
  assert.equal(isUnlocked(ids, 0, {}), true);
  assert.equal(isUnlocked(ids, 1, {}), false);

  const firstDone = { [ids[0]]: { ...EMPTY_PROGRESS, completed: true, stars: 1 } };
  assert.equal(isUnlocked(ids, 1, firstDone), true);
  assert.equal(isUnlocked(ids, 2, firstDone), false, "跳关不行");

  // 只有尝试次数、没完成，不算解锁
  const tried = { [ids[0]]: { ...EMPTY_PROGRESS, attempts: 3 } };
  assert.equal(isUnlocked(ids, 1, tried), false);
});

test("completedCount / totalStars", () => {
  const ids = ["L01", "L02", "L03"];
  const progress = {
    L01: { completed: true, stars: 3, bestMs: 1000, attempts: 1, lastAt: null },
    L02: { completed: true, stars: 1, bestMs: null, attempts: 2, lastAt: null },
    L03: { ...EMPTY_PROGRESS, attempts: 1 },
  };
  assert.equal(completedCount(ids, progress), 2);
  assert.equal(totalStars(progress), 4);
});

test("fromLegacyBest: 旧版最佳时间迁成进度", () => {
  const fast = fromLegacyBest(30000, L01_PAR);
  assert.equal(fast.completed, true);
  assert.equal(fast.bestMs, 30000);
  assert.equal(fast.stars, 3, "达标时间内的旧成绩直接三星");
  assert.equal(fromLegacyBest(120000, L01_PAR).stars, 2);
});

test("parseProgress: 坏数据丢掉，星级按达标时间重算", () => {
  assert.deepEqual(parseProgress(null), {});
  assert.deepEqual(parseProgress("nope"), {});
  assert.deepEqual(parseProgress([1, 2]), {});
  assert.deepEqual(parseProgress({ L01: "x" }), {});
  assert.deepEqual(parseProgress({ L01: { completed: false } }), {}, "空记录丢弃");

  const raw = {
    L01: { completed: true, stars: 1, bestMs: 30000, attempts: 5, lastAt: 123 },
    L02: { completed: true, stars: 9, bestMs: null, attempts: 2, lastAt: null },
  };
  const withPar = parseProgress(raw, () => L01_PAR);
  assert.equal(withPar.L01.stars, 3, "30000ms 在达标时间内");
  assert.equal(withPar.L01.attempts, 5);
  assert.equal(withPar.L01.totalMs, 0, "旧存档没有 totalMs，补 0");
  assert.equal(withPar.L02.stars, 1, "没有全对记录就是 1 星");

  const noPar = parseProgress(raw);
  assert.equal(noPar.L01.stars, 1, "不知道达标时间时沿用存档星级，不擅自降级");
  assert.equal(noPar.L02.stars, 3, "星级夹到 0–3");
});

test("starsForAttempt: 本次得星与首次提交的结果一致", () => {
  const cases: Array<[AttemptResult, number]> = [
    [fakeResult(18, 0, 0, 0), 30000],
    [fakeResult(18, 0, 0, 0), 120000],
    [fakeResult(17, 0, 1, 0), 30000],
    [fakeResult(17, 1, 0, 0), 30000],
    [fakeResult(10, 0, 2, 6), 30000],
  ];
  for (const [result, elapsedMs] of cases) {
    for (const strictSpelling of [false, true]) {
      const ctx = { elapsedMs, strictSpelling, parMs: L01_PAR };
      const fresh = applyAttempt(undefined, result, { ...ctx, at: 1 });
      assert.equal(
        fresh.stars,
        starsForAttempt(result, ctx),
        `strict=${strictSpelling} elapsed=${elapsedMs}`,
      );
    }
  }
  // 没开始就提交：不算三星
  assert.equal(starsForAttempt(fakeResult(18, 0, 0, 0), { elapsedMs: 0, strictSpelling: false, parMs: L01_PAR }), 2);
});

test("进度可序列化：JSON 往返不丢字段", () => {
  const p = applyAttempt(undefined, fakeResult(18, 0, 0, 0), {
    elapsedMs: 40000, strictSpelling: false, parMs: L01_PAR, at: 777,
  });
  const round = parseProgress(JSON.parse(JSON.stringify({ L01: p })), () => L01_PAR).L01;
  assert.deepEqual(round, p);
});

// ---- 键盘音名输入 ----

test("nextNoteQuery: 字母 + 升降号", () => {
  assert.equal(nextNoteQuery("", "e"), "E");
  assert.equal(nextNoteQuery("", "B"), "B");
  assert.equal(nextNoteQuery("", "b"), "B", "没有前置字母时 b 就是音名 B");
  assert.equal(nextNoteQuery("B", "b"), "Bb");
  assert.equal(nextNoteQuery("E", "b"), "Eb");
  assert.equal(nextNoteQuery("C", "#"), "C#");
  assert.equal(nextNoteQuery("C#", "#"), "C#", "不叠加成 C##");
  assert.equal(nextNoteQuery("Bb", "d"), "D", "再按字母就是新音名");
  assert.equal(nextNoteQuery("", "#"), "", "没有字母时 # 不生效");
  assert.equal(nextNoteQuery("C", "x"), null);
  assert.equal(nextNoteQuery("C", "1"), null);
});

test("noteCandidates: 前缀过滤，精确优先", () => {
  assert.deepEqual(noteCandidates(""), NOTE_NAMES);
  assert.deepEqual(noteCandidates("B"), ["B", "Bb"]);
  assert.deepEqual(noteCandidates("bb"), ["Bb"], "大小写不敏感");
  assert.deepEqual(noteCandidates("E"), ["E", "Eb"]);
  assert.deepEqual(noteCandidates("z"), []);
  for (const n of NOTE_NAMES) assert.equal(parseNote(n) !== null, true, `${n} 应可解析`);
});

// ---- 和弦 ----

test("和弦构成音：性质与拼写", () => {
  const toneNames = (name: string) => chordInfo(CHORD_BY_NAME.get(name)!).tones.map((t) => t.name);
  assert.deepEqual(toneNames("C"), ["C", "E", "G"]);
  assert.deepEqual(toneNames("Am"), ["A", "C", "E"]);
  assert.deepEqual(toneNames("C7"), ["C", "E", "G", "Bb"], "七音用降号拼写");
  assert.deepEqual(toneNames("Fmaj7"), ["F", "A", "C", "E"]);
  assert.deepEqual(toneNames("Am7"), ["A", "C", "E", "G"]);
  assert.deepEqual(toneNames("Bm"), ["B", "D", "F#"]);
  assert.equal(chordInfo(CHORD_BY_NAME.get("Am")!).quality.name, "小三和弦");
  assert.equal(chordInfo(CHORD_BY_NAME.get("G7")!).quality.name, "属七和弦");
  assert.equal(chordInfo(CHORD_BY_NAME.get("Fmaj7")!).quality.name, "大七和弦");
});

test("每个和弦：按到的音都是构成音，且至少出现一次根音", () => {
  for (const chord of CHORDS) {
    const info = chordInfo(chord);
    const pcs = new Set(info.tones.map((t) => t.pc));
    assert.ok(pcs.has(info.rootPc), `${chord.name} 缺根音`);
    chord.frets.forEach((fret, i) => {
      if (fret < 0) return;
      const stringIndex = 5 - i; // frets[0] 是 6 弦
      const pc = ((STANDARD_TUNING.strings[stringIndex] + fret) % 12 + 12) % 12;
      assert.ok(pcs.has(pc), `${chord.name} 第 ${6 - i} 弦上的音不是构成音`);
    });
  }
});

test("指法串：x 表示不弹，0 表示空弦", () => {
  assert.equal(fingeringOf(CHORD_BY_NAME.get("C")!), "x32010");
  assert.equal(fingeringOf(CHORD_BY_NAME.get("F")!), "133211");
  assert.equal(fingeringOf(CHORD_BY_NAME.get("D")!), "xx0232");
});

// ---- 唱名 ----

test("solfegeLabel: 固定唱名（C=do）", () => {
  const opts = { system: "fixed", style: "number" } as const;
  assert.equal(solfegeLabel(0, 0, opts), "1");
  assert.equal(solfegeLabel(2, 0, opts), "2");
  assert.equal(solfegeLabel(1, 0, opts), "升1");
  assert.equal(solfegeLabel(10, 0, opts), "降7", "Bb 在固定唱名里是降 7");
  assert.equal(solfegeLabel(6, 0, opts), "升4");
  assert.equal(solfegeLabel(10, 5, opts), "降7", "固定唱名与调无关");
});

test("solfegeLabel: 首调（当前调主音=1）随调变化", () => {
  const opts = { system: "movable", style: "number" } as const;
  // F 大调：F=1、Bb=4、C=5
  assert.equal(solfegeLabel(5, 5, opts), "1");
  assert.equal(solfegeLabel(10, 5, opts), "4");
  assert.equal(solfegeLabel(6, 5, opts), "升1");
  assert.equal(solfegeLabel(0, 5, opts), "5");
  // A 小调：A=1、C=降3、F=降6、G=降7
  assert.equal(solfegeLabel(9, 9, opts), "1");
  assert.equal(solfegeLabel(0, 9, opts), "降3");
  assert.equal(solfegeLabel(5, 9, opts), "降6");
  assert.equal(solfegeLabel(7, 9, opts), "降7");
});

test("solfegeLabel: 12 个音全覆盖，do re mi 写法也带升降", () => {
  const table = solfegeTable({ system: "fixed", style: "number" });
  assert.equal(table.length, 12);
  assert.equal(new Set(table).size, 12, "12 个唱名不应重复");
  const syl = { system: "movable", style: "syllable" } as const;
  assert.equal(solfegeLabel(3, 0, syl), "降mi");
  assert.equal(solfegeLabel(6, 0, syl), "升fa");
  assert.equal(solfegeLabel(0, 0, syl), "do");
});

test("solfegeAlternatives: 黑键有升/降两种叫法", () => {
  const num = { system: "movable", style: "number" } as const;
  assert.deepEqual(solfegeAlternatives(1, 0, num), { primary: "升1", alternate: "降2" });
  assert.deepEqual(solfegeAlternatives(3, 0, num), { primary: "降3", alternate: "升2" });
  assert.deepEqual(solfegeAlternatives(6, 0, num), { primary: "升4", alternate: "降5" });
  assert.deepEqual(solfegeAlternatives(10, 0, num), { primary: "降7", alternate: "升6" });
  assert.deepEqual(solfegeAlternatives(0, 0, num), { primary: "1", alternate: null }, "自然音没有对照");

  const syl = { system: "movable", style: "syllable" } as const;
  assert.deepEqual(solfegeAlternatives(1, 0, syl), { primary: "升do", alternate: "降re" });
});

test("音名等音：SHARP_NAMES 与 FLAT_NAMES 一一对应", () => {
  assert.equal(SHARP_NAMES.length, 12);
  assert.equal(FLAT_NAMES.length, 12);
  for (let pc = 0; pc < 12; pc++) {
    assert.equal(parseNote(SHARP_NAMES[pc]), pc, `升号名 ${SHARP_NAMES[pc]}`);
    assert.equal(parseNote(FLAT_NAMES[pc]), pc, `降号名 ${FLAT_NAMES[pc]}`);
  }
  assert.equal(SHARP_NAMES[1], "C#");
  assert.equal(FLAT_NAMES[1], "Db");
});

test("solfegeOctaveShift: 八度按中央 C 附近的 1 为基准", () => {
  const movable = { system: "movable" } as const;
  // C 大调：C4 不标，C3 下面一点，C5 上面一点
  assert.equal(solfegeOctaveShift(60, 0, movable), 0);
  assert.equal(solfegeOctaveShift(48, 0, movable), -1);
  assert.equal(solfegeOctaveShift(72, 0, movable), 1);
  // 用户举的例子：4 弦 3 品 F3(53) 比 6 弦 1 品 F2(41) 高一个八度
  assert.equal(solfegeOctaveShift(53, 0, movable), -1);
  assert.equal(solfegeOctaveShift(41, 0, movable), -2);
  // G 大调：G4 与 F#5 同属一组
  assert.equal(solfegeOctaveShift(67, 7, movable), 0);
  assert.equal(solfegeOctaveShift(78, 7, movable), 0);
  assert.equal(solfegeOctaveShift(66, 7, movable), -1);
  // 固定唱名永远以 C4 为基准，与调无关
  const fixed = { system: "fixed" } as const;
  assert.equal(solfegeOctaveShift(70, 5, fixed), 0);
  assert.equal(solfegeOctaveShift(58, 5, fixed), -1);
});

// ---- 每日挑战与统计 ----

test("dateKeyOf: 本地日期补零", () => {
  assert.equal(dateKeyOf(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(dateKeyOf(new Date(2026, 9, 31)), "2026-10-31");
});

test("isValidDateKey: 拒绝不存在的日期", () => {
  assert.equal(isValidDateKey("2026-10-31"), true);
  assert.equal(isValidDateKey("2026-02-28"), true);
  assert.equal(isValidDateKey("2026-02-30"), false, "2 月没有 30 号");
  assert.equal(isValidDateKey("2026-13-01"), false);
  assert.equal(isValidDateKey("2026-1-5"), false, "必须补零");
  assert.equal(isValidDateKey("abc"), false);
});

test("日期前后移动跨月跨年", () => {
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
  assert.equal(previousDateKey("2026-01-01"), "2025-12-31");
  assert.equal(nextDateKey("2026-12-31"), "2027-01-01");
  assert.equal(nextDateKey("2024-02-28"), "2024-02-29", "闰年");
});

test("lastNDays: 升序且含今天", () => {
  const days = lastNDays("2026-10-31", 7);
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-10-25");
  assert.equal(days[6], "2026-10-31");
});

test("dailySpecFor: 同日期同题、参数自洽", () => {
  const a = dailySpecFor("2026-10-31");
  assert.deepEqual(a, dailySpecFor("2026-10-31"), "同一天必须完全一致");
  assert.equal(a.seed, dayNumberOf("2026-10-31"));

  const key = KEY_BY_ID.get(a.keyId)!;
  assert.equal(a.scaleId, key.mode === "minor" ? "naturalMinor" : "major", "音阶跟着调式走");
  assert.ok([[1, 5], [1, 7], [0, 12]].some(([lo, hi]) => a.fretMin === lo && a.fretMax === hi));
  assert.ok(a.givenRatio > 0 && a.givenRatio < 1);
});

test("dailySpecFor: 66 天内覆盖所有品域与多数调", () => {
  const keys = new Set<string>();
  const ranges = new Set<string>();
  let date = "2026-01-01";
  for (let i = 0; i < 66; i++) {
    const spec = dailySpecFor(date);
    keys.add(spec.keyId);
    ranges.add(`${spec.fretMin}-${spec.fretMax}`);
    assert.ok(dailyPuzzle(spec).target.length > 2, `${date} 出不来题`);
    date = nextDateKey(date);
  }
  assert.equal(ranges.size, 3, "三个品域都应出现");
  assert.ok(keys.size >= 20, `调覆盖不足：${keys.size}`);
});

test("dailyPuzzle: 可复现，不同日期不同", () => {
  const a = dailyPuzzle(dailySpecFor("2026-10-31"));
  const b = dailyPuzzle(dailySpecFor("2026-10-31"));
  const c = dailyPuzzle(dailySpecFor("2026-11-01"));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.givens, c.givens);
});

test("streakOf: 连续、隔天、今天未打卡", () => {
  const today = "2026-10-31";
  assert.deepEqual(
    streakOf(["2026-10-29", "2026-10-30", "2026-10-31"], today),
    { current: 3, longest: 3, todayDone: true },
  );

  // 今天没做，但昨天做了：连续仍算到昨天
  const s = streakOf(["2026-10-29", "2026-10-30"], today);
  assert.equal(s.current, 2);
  assert.equal(s.todayDone, false);

  // 前天做过、昨天断了：连续归零
  assert.equal(streakOf(["2026-10-29"], today).current, 0);

  // 最长连续不等于当前连续
  const g = streakOf(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-31"], today);
  assert.equal(g.current, 1);
  assert.equal(g.longest, 3);

  assert.deepEqual(streakOf([], today), { current: 0, longest: 0, todayDone: false });
});

test("summarizeProgress: 统计口径", () => {
  const ids = ["L01", "L02", "L03"];
  const progress = {
    L01: { completed: true, stars: 3, bestMs: 40000, attempts: 2, totalMs: 90000, lastAt: 1 },
    L02: { completed: true, stars: 1, bestMs: null, attempts: 3, totalMs: 30000, lastAt: 2 },
    L03: { ...EMPTY_PROGRESS, attempts: 1, totalMs: 5000 },
  };
  const s = summarizeProgress(ids, progress);
  assert.equal(s.completed, 2);
  assert.equal(s.total, 3);
  assert.equal(s.stars, 4);
  assert.equal(s.maxStars, 9);
  assert.equal(s.averageStars, 2, "4 星 / 2 关");
  assert.equal(s.attempts, 6);
  assert.equal(s.bestSumMs, 40000);
  assert.equal(s.perfectCount, 1);
  assert.equal(s.totalMs, 125000, "累计时长按关卡加总");

  const empty = summarizeProgress(ids, {});
  assert.equal(empty.completed, 0);
  assert.equal(empty.averageStars, 0);
  assert.equal(empty.maxStars, 9);
});

test("音程表：12 个半音 + 八度，音分与名称一致", () => {
  assert.equal(INTERVALS.length, 13);
  for (const info of INTERVALS) {
    assert.equal(info.cents, info.semitones * 100, `${info.short} 的音分`);
    assert.ok(info.name.length > 0 && info.short.length > 0);
  }
  assert.equal(intervalOf(4).name, "大三度");
  assert.equal(intervalOf(3).name, "小三度");
  assert.equal(intervalOf(7).name, "纯五度");
  assert.equal(intervalOf(6).name, "三全音");
  assert.equal(intervalOf(0).name, "纯一度");
  assert.equal(intervalOf(12).name, "纯八度");
  assert.equal(intervalOf(16).name, "大三度", "超过 12 个半音要折回");
  assert.equal(intervalOf(-1).name, "大七度", "负数取模也要落在 0–11");

  assert.deepEqual(intervalBetween(0, 4), intervalOf(4));
  assert.deepEqual(intervalBetween(9, 0), intervalOf(3), "A 到 C 是小三度（上行 3 个半音）");
});

test("音程拼写：字母步进决定升降号", () => {
  assert.equal(spellInterval("C", 4), "E", "C 的大三度是 E");
  assert.equal(spellInterval("C", 3), "Eb", "C 的小三度是 Eb");
  assert.equal(spellInterval("C", 6), "F#", "C 的三全音写成增四度 F#");
  assert.equal(spellInterval("F", 6), "B", "F 到 B 是增四度");
  assert.equal(spellInterval("B", 4), "D#", "B 的大三度是 D#");
  assert.equal(spellInterval("F#", 3), "A", "F# 的小三度是 A");
  assert.equal(spellInterval("C", 12), "C", "八度回到自己");
  assert.equal(spellInterval("Bb", 9), "G", "Bb 的大六度是 G");
  assert.throws(() => spellInterval("H", 4), /bad note name/);
});

test("12 平均律：音名、音分、频率比", () => {
  const table = twelveToneTable(0);
  assert.equal(table.length, 12);
  assert.equal(table[0].sharpName, "C");
  assert.equal(table[0].flatName, "C");
  assert.equal(table[1].sharpName, "C#");
  assert.equal(table[1].flatName, "Db", "同一个键位两个名字");
  assert.equal(table[1].cents, 100);
  assert.ok(Math.abs(table[1].ratio - 1.059463) < 1e-5, "半音是 2 的 12 次方根");
  assert.ok(Math.abs(table[7].ratio - 1.498307) < 1e-5, "纯五度约 1.4983");

  const fromG = twelveToneTable(7);
  assert.equal(fromG[0].sharpName, "G");
  assert.equal(fromG[5].sharpName, "C", "G 上方 5 个半音是 C");
  assert.equal(fromG[5].degree, "4");
});

test("频率与音分", () => {
  assert.equal(frequencyOf(69), 440, "A4 = 440Hz");
  assert.ok(Math.abs(frequencyOf(60) - 261.6256) < 1e-3, "中央 C 约 261.63Hz");
  assert.equal(frequencyOf(81), 880, "高八度翻倍");
  assert.equal(frequencyOf(69, 432), 432, "可以改基准");
});

test("三度叠置：和弦就是三度加三度", () => {
  const major = stackThirds("C", [0, 4, 7]);
  assert.deepEqual(major.notes, ["C", "E", "G"]);
  assert.deepEqual(major.steps.map((s) => s.name), ["大三度", "小三度"]);
  assert.equal(major.text, "大三度 + 小三度");

  const minor = stackThirds("A", [0, 3, 7]);
  assert.deepEqual(minor.notes, ["A", "C", "E"]);
  assert.deepEqual(minor.steps.map((s) => s.name), ["小三度", "大三度"]);

  const seventh = stackThirds("C", [0, 4, 7, 11]);
  assert.deepEqual(seventh.notes, ["C", "E", "G", "B"]);
  assert.deepEqual(seventh.steps.map((s) => s.name), ["大三度", "小三度", "大三度"]);

  // 拼写要跟字母走：B 的三音是 D#，不是 Eb
  assert.deepEqual(stackThirds("B", [0, 4, 7]).notes, ["B", "D#", "F#"]);

  // 和 chords.ts 的性质定义对得上
  for (const quality of Object.values(CHORD_QUALITIES)) {
    const stack = stackThirds("C", quality.intervals);
    assert.equal(stack.notes.length, quality.intervals.length);
  }
});

test("七和弦：四个音、三个三度", () => {  for (const id of ["major7", "dominant7", "minor7"] as const) {
    const intervals = CHORD_QUALITIES[id].intervals;
    assert.equal(intervals.length, 4, `${id} 应该有 4 个音`);
    const stack = stackThirds("C", intervals);
    assert.equal(stack.notes.length, 4);
    assert.equal(stack.steps.length, 3, "三个三度叠起来");
    for (const step of stack.steps) {
      assert.ok([3, 4].includes(step.semitones), `${id} 每一步都必须是三度：${step.name}`);
    }
  }
  assert.deepEqual(stackThirds("C", CHORD_QUALITIES.major7.intervals).notes, ["C", "E", "G", "B"]);
  assert.deepEqual(stackThirds("C", CHORD_QUALITIES.dominant7.intervals).notes, ["C", "E", "G", "Bb"]);
  assert.deepEqual(stackThirds("C", CHORD_QUALITIES.minor7.intervals).notes, ["C", "Eb", "G", "Bb"]);
});

test("五度圈：12 个调、调号、相邻调", () => {
  assert.equal(CIRCLE.length, 12);
  assert.deepEqual(
    CIRCLE.map((c) => c.id),
    ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"],
  );
  assert.equal(circleKey("C")!.accidentals, 0);
  assert.equal(circleKey("G")!.accidentals, 1);
  assert.equal(circleKey("F")!.accidentals, -1);
  assert.equal(circleKey("F#")!.accidentals, 6);
  assert.equal(circleKey("Db")!.accidentals, -5);
  assert.equal(circleKey("C")!.minorName, "A 小调");
  assert.equal(circleKey("C")!.scale.join(""), "CDEFGAB");
  assert.equal(circleKey("H"), null);

  assert.equal(neighborKeys("C")!.up.id, "G");
  assert.equal(neighborKeys("C")!.down.id, "F");
  assert.equal(neighborKeys("F")!.up.id, "C");
  assert.equal(neighborKeys("Db")!.down.id, "F#", "等音位置相邻");

  assert.equal(fifthsDistance("C", "G"), 1);
  assert.equal(fifthsDistance("C", "F"), 1);
  assert.equal(fifthsDistance("C", "F#"), 6, "最远是 6 格");
  assert.equal(fifthsDistance("C", "C"), 0);
});

test("乐理练习：题目自洽（答案在选项里、有解释、可复现）", () => {
  const generators = [intervalQuestion, thirdQuestion, circleQuestion];
  for (const generate of generators) {
    for (let seed = 1; seed <= 40; seed++) {
      const question = generate(mulberry32(seed));
      assert.ok(question.prompt.length > 0, "题目不能为空");
      assert.ok(question.explain.length > 0, "要有解释");
      assert.equal(question.choices.length, 4, "四选一");
      assert.ok(question.choices.includes(question.answer), `答案要在选项里：${question.answer}`);
      assert.equal(new Set(question.choices).size, 4, "选项不能重复");
      assert.deepEqual(generate(mulberry32(seed)), question, "同一 seed 必须同题");
    }
  }
});

test("和弦级数：C 大调 I–vii°、大小写与性质对得上", () => {
  const expected: [string, string][] = [
    ["C", "I"],
    ["Dm", "ii"],
    ["Em", "iii"],
    ["F", "IV"],
    ["G", "V"],
    ["Am", "vi"],
    ["Bdim", "vii°"],
  ];
  for (const [chord, roman] of expected) {
    const degree = chordDegreeInKey("C", chord);
    assert.ok(degree, `${chord} 应在 C 大调内`);
    assert.equal(degree!.roman, roman);
    assert.equal(degree!.matches, true, `${chord} 的性质应和该级数相符`);
  }

  // 调外和弦
  assert.equal(chordDegreeInKey("C", "Bb"), null, "Bb 不在 C 大调内");
  // 性质不符：C 大调的 ii 应该是小三和弦，D 是大三
  const wrongQuality = chordDegreeInKey("C", "D");
  assert.equal(wrongQuality!.roman, "ii");
  assert.equal(wrongQuality!.matches, false, "D 大三和弦不符合 ii 级的小三性质");

  // 换个调：G 大调
  assert.equal(chordDegreeInKey("G", "D")!.roman, "V");
  assert.equal(chordDegreeInKey("G", "F#dim")!.roman, "vii°");
  assert.equal(chordDegreeInKey("G", "F"), null, "F 自然音不在 G 大调内");

  // 表格：G 大调的七个级数，根音跟着调走（F# 而不是 F）
  const table = degreesOfKey("G");
  assert.equal(table.length, 7);
  assert.deepEqual(
    table.map((d) => d.roman),
    ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  );
  assert.equal(table[6].root, "F#dim");
});

test("CAGED：同一个和弦的五个把位", () => {
  const c = cagedShapes(0);
  assert.deepEqual(
    c.map((shape) => shape.id),
    ["C", "A", "G", "E", "D"],
    "顺序就是 CAGED",
  );
  assert.deepEqual(
    c.map((shape) => shape.shift),
    [0, 3, 5, 8, 10],
    "C 和弦的五个位置：0 / 3 / 5 / 8 / 10 品",
  );
  assert.deepEqual(c[0].frets, [-1, 3, 2, 0, 1, 0], "C 形就是开放的 C");
  assert.deepEqual(c[3].frets, [8, 10, 10, 9, 8, 8], "E 形横按在第 8 品");
  assert.deepEqual(c[3].rootStrings, [0, 2, 5], "E 形的根音在 6 / 4 / 1 弦");

  // G 和弦：G 形回到 0 品，E 形落在 3 品
  const g = cagedShapes(7);
  assert.equal(g.find((shape) => shape.id === "G")!.shift, 0);
  assert.equal(g.find((shape) => shape.id === "E")!.shift, 3);

  // 不变量：每个形状按到的音，都必须是大三和弦的构成音（根 / 三 / 五）
  for (const rootPc of [0, 2, 5, 7, 11]) {
    const allowed = [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12];
    for (const shape of cagedShapes(rootPc)) {
      assert.ok(shape.rootStrings.length > 0, `${shape.name} 必须能指出根音`);
      shape.frets.forEach((fret, index) => {
        if (fret < 0) return;
        const pc = pitchClassAt(STANDARD_TUNING, 5 - index, fret);
        assert.ok(
          allowed.includes(pc),
          `根音 ${rootPc} 的 ${shape.name}：${6 - index} 弦 ${fret} 品不该出现 ${pc}`,
        );
      });
    }
  }
});

test("CAGED：平移量归一化，不会出现负品", () => {
  // A 和弦的 C 形：根音在 5 弦空弦，C 形的锚点在第 3 品 → 原始算出来是 −3
  const aMajor = cagedShapes(9);
  const cShape = aMajor.find((shape) => shape.id === "C")!;
  assert.equal(cShape.shift, 9, "−3 应该归一化成 9（高八度）");
  assert.deepEqual(cShape.frets, [-1, 12, 11, 9, 10, 9]);

  for (const rootPc of [0, 2, 5, 7, 9, 11]) {
    for (const shape of cagedShapes(rootPc)) {
      assert.ok(shape.shift >= 0 && shape.shift <= 11, "shift 必须在 0–11");
      for (const fret of shape.frets) {
        assert.ok(fret >= -1, `不能出现负品：${fret}`);
      }
      assert.ok(shape.span[0] >= 0, "覆盖区间不能是负数");
    }
  }
});

test("CAGED 小和弦：E/A/D 三个形状，且都是小三和弦", () => {
  const cm = cagedShapes(0, "minor");
  assert.deepEqual(
    cm.map((shape) => shape.id).sort(),
    ["A", "D", "E"],
    "小和弦只用这三个形状",
  );
  // Cm 的 A 形就是经典的 x35543
  assert.deepEqual(cm.find((shape) => shape.id === "A")!.frets, [-1, 3, 5, 5, 4, 3]);
  // Am 的 A 形是开放的 Am
  const am = cagedShapes(9, "minor");
  assert.deepEqual(am.find((shape) => shape.id === "A")!.frets, [-1, 0, 2, 2, 1, 0]);

  // 不变量：每个按到的音都必须是 根 / 小三度 / 纯五度
  for (const rootPc of [0, 2, 5, 7, 9, 11]) {
    const allowed = [rootPc, (rootPc + 3) % 12, (rootPc + 7) % 12];
    for (const shape of cagedShapes(rootPc, "minor")) {
      for (const fret of shape.frets) assert.ok(fret >= -1, "不能出现负品");
      shape.frets.forEach((fret, index) => {
        if (fret < 0) return;
        const pc = pitchClassAt(STANDARD_TUNING, 5 - index, fret);
        assert.ok(
          allowed.includes(pc),
          `根音 ${rootPc} 的 ${shape.name}：${6 - index} 弦 ${fret} 品不该出现 ${pc}`,
        );
      });
    }
  }
});

test("乐理挑战：12 关、每关 4 道不重复的题", () => {
  assert.equal(THEORY_LEVELS.length, 12);
  assert.deepEqual(
    THEORY_LEVELS.map((level) => level.id),
    ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10", "T11", "T12"],
  );

  for (const level of THEORY_LEVELS) {
    const tasks = theoryTasks(level);
    assert.equal(tasks.length, 4, `${level.id} 应有 4 题`);
    assert.equal(new Set(tasks.map((task) => task.prompt)).size, 4, `${level.id} 的题不能重复`);
    assert.deepEqual(
      theoryTasks(level).map((task) => task.prompt),
      tasks.map((task) => task.prompt),
      "同关必须可复现",
    );

    for (const task of tasks) {
      assert.ok(task.cells.length > 0, `${level.id} 的题必须有点可点`);
      for (const cell of task.cells) {
        assert.ok(cell.f >= task.fretMin && cell.f <= task.fretMax, "格子必须在题目范围内");
        const pc = pitchClassAt(STANDARD_TUNING, cell.s, cell.f);
        assert.ok(task.pcs.includes(pc), `${level.id}：${cell.s + 1} 弦 ${cell.f} 品的音不属于答案`);
      }
      let expectedCount = 0;
      for (let s = 0; s < 6; s++) {
        for (let f = task.fretMin; f <= task.fretMax; f++) {
          if (task.pcs.includes(pitchClassAt(STANDARD_TUNING, s, f))) expectedCount++;
        }
      }
      assert.equal(task.cells.length, expectedCount, "目标格必须铺满整个范围");
    }

    const answerCount = { triad: 3, seventh: 4, interval: 2 } as const;
    assert.ok(
      tasks.every((task) => task.pcs.length === answerCount[level.kind]),
      `${level.id} 的答案音数不对`,
    );
    assert.ok(theoryTargetCount(level) > 0);
  }
});

test("乐理挑战：判定与合成 AttemptResult", () => {
  const level = THEORY_LEVELS[0];
  const tasks = theoryTasks(level);
  const first = tasks[0];
  const all = first.cells.map((cell) => `${cell.s}:${cell.f}`);

  assert.equal(judgeTask(first, all).ok, true, "全点亮就算对");
  const missingOne = judgeTask(first, all.slice(1));
  assert.equal(missingOne.ok, false);
  assert.equal(missingOne.missing.length, 1);
  assert.equal(missingOne.extra.length, 0);

  const extraOne = judgeTask(first, [...all, "0:1"]);
  assert.equal(extraOne.ok, false, "多点一格也算错");
  assert.equal(extraOne.extra.length, 1);

  const perfect = tasks.map((task) => judgeTask(task, task.cells.map((c) => `${c.s}:${c.f}`)));
  const result = theoryAttempt(perfect);
  assert.equal(result.total, 4);
  assert.equal(result.correct, 4);
  assert.equal(result.wrong, 0);
  assert.equal(result.empty, 0);
  assert.equal(result.finished, true);
  assert.equal(result.accuracy, 1);

  const mixed = [
    perfect[0],
    judgeTask(tasks[1], []),
    judgeTask(tasks[2], [...tasks[2].cells.map((c) => `${c.s}:${c.f}`), "0:1"]),
    perfect[3],
  ];
  const partial = theoryAttempt(mixed);
  assert.equal(partial.correct, 2);
  assert.equal(partial.empty, 1, "一格没点算空");
  assert.equal(partial.wrong, 1, "多点了算错");
  assert.equal(partial.accuracy, 0.5);
});

test("时值：全音符到十六分的比例，以及附点与三连音", () => {
  const quarter = noteValueById("quarter")!;
  assert.equal(quarter.beats, 1);

  // 二倍关系：一整小节能被任何时值整除
  assert.equal(noteValueById("whole")!.beats, quarter.beats * 4);
  assert.equal(noteValueById("half")!.beats, quarter.beats * 2);
  assert.equal(noteValueById("eighth")!.beats, quarter.beats / 2);
  assert.equal(noteValueById("sixteenth")!.beats, quarter.beats / 4);

  // 附点 = 原时值 × 1.5
  assert.equal(noteValueById("dottedQuarter")!.beats, 1.5);
  assert.equal(noteValueById("dottedEighth")!.beats, 0.75);

  // 三个八分三连音正好一拍——这是三连音最难解释的地方
  assert.ok(Math.abs(noteValueById("tripletEighth")!.beats * 3 - 1) < 1e-9);

  // 填空：一小节 4 拍的各种填法都必须正好是 4
  assert.equal(beatsOf(["whole"]), 4);
  assert.equal(beatsOf(["half", "half"]), 4);
  assert.equal(beatsOf(["quarter", "quarter", "quarter", "quarter"]), 4);
  assert.equal(beatsOf(Array(8).fill("eighth")), 4);
  assert.equal(beatsOf(Array(16).fill("sixteenth")), 4);
  assert.equal(beatsOf(["dottedQuarter", "eighth", "half"]), 4);
  assert.ok(Math.abs(beatsOf(Array(12).fill("tripletEighth")) - 4) < 1e-9, "12 个三连音 = 4 拍");
  assert.equal(beatsOf(["half", "quarter"]), 3, "没填满就是 3 拍");

  assert.ok(NOTE_VALUES.length >= 8, "时值表不能只有四分音符");
  assert.ok(VALUE_LADDER.every((step) => noteValueById(step.id)), "阶梯上的每一项都要有对应时值");
});

test("拍号：一小节几格、重音在哪、细分多少下", () => {
  assert.deepEqual(
    METERS.map((meter) => meter.id),
    ["4/4", "3/4", "2/4", "6/8"],
  );
  assert.equal(meterOf("3/4").perBar, 3);
  assert.equal(meterOf("6/8").perBar, 6);
  assert.deepEqual(meterOf("6/8").accents, [0, 3], "6/8 的两个大拍在第 1、第 4 个八分");
  assert.deepEqual(meterOf("4/4").accents, [0]);
  assert.equal(meterOf("不存在的拍号").id, "4/4", "认不出来就回到 4/4");

  // 格子数与数拍词
  assert.equal(clicksPerBar("4/4", 1), 4);
  assert.equal(clicksPerBar("4/4", 2), 8);
  assert.equal(clicksPerBar("4/4", 4), 16);
  assert.equal(clicksPerBar("3/4", 2), 6);
  assert.equal(clicksPerBar("6/8", 1), 6);

  assert.equal(countLine("4/4", 1), "1 2 3 4");
  assert.equal(countLine("4/4", 2), "1 & 2 & 3 & 4 &");
  assert.equal(countLine("4/4", 4), "1 e & a 2 e & a 3 e & a 4 e & a");
  assert.equal(countLine("4/4", 3), "1 ta ta 2 ta ta 3 ta ta 4 ta ta");
  assert.equal(countLine("3/4", 2), "1 & 2 & 3 &");

  const slots = gridSlots("6/8", 2);
  assert.equal(slots.length, 12);
  assert.deepEqual(
    slots.filter((slot) => slot.accent).map((slot) => slot.index),
    [0, 6],
    "6/8 的强拍在每大拍的第一下",
  );
  assert.deepEqual(
    slots.filter((slot) => slot.onBeat).map((slot) => slot.label),
    ["1", "2", "3", "4", "5", "6"],
  );
});

test("速度：BPM 换算与节拍器间隔", () => {
  assert.equal(bpmToMs(60), 1000);
  assert.equal(bpmToMs(120), 500);
  assert.equal(bpmToMs(90), 60000 / 90);
  assert.equal(stepMs(120, 2), 250, "120 BPM 的八分音符是 250ms");
  assert.equal(stepMs(120, 4), 125);
  assert.ok(Math.abs(stepMs(60, 3) - 1000 / 3) < 1e-9);
  assert.equal(bpmToMs(0), 60000, "0 或负数按 1 BPM 处理，不能除以 0");
});

test("扫弦型：箭头落在八分格子上，长度跟着拍号", () => {
  for (const pattern of STRUM_PATTERNS) {
    const meter = meterOf(pattern.meterId);
    assert.equal(
      pattern.slots.length,
      meter.perBar * 2,
      `${pattern.name} 应该按八分音符铺满一小节`,
    );
    assert.ok(
      pattern.slots.every((slot) => slot === "D" || slot === "U" || slot === null),
      "只能是下扫、上扫或空",
    );
    assert.ok(pattern.slots.some((slot) => slot !== null), "不能整小节都不弹");
    assert.ok(pattern.hint.length > 4, `${pattern.name} 要有练法提示`);
  }

  const folk = strumPatternById("folk")!;
  assert.deepEqual(folk.slots, ["D", null, "D", "U", null, "U", "D", "U"]);
  assert.equal(folk.slots.filter(Boolean).length, 6, "D·DU·UDU 一共六下");
  assert.equal(
    folk.slots[0],
    "D",
    "每一小节的第一下必须是下扫（不然拍点听不出来）",
  );
  for (const pattern of STRUM_PATTERNS) {
    assert.equal(pattern.slots[0], "D", `${pattern.name} 的第一下要在拍点上`);
  }

  // 八分全上下：格子和数拍词一一对应
  const eighth = strumPatternById("eighth-alt")!;
  assert.deepEqual(eighth.slots, ["D", "U", "D", "U", "D", "U", "D", "U"]);
  assert.equal(eighth.slots.length, countLine("4/4", 2).split(" ").length);
});

test("练习库：每个阶段的每一块都有练习，每条练习都能验收", () => {
  assert.equal(STAGES.length, 6, "S0–S5");
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    [0, 1, 2, 3, 4, 5],
  );

  // id 不重复
  const ids = DRILLS.map((drill) => drill.id);
  assert.equal(new Set(ids).size, ids.length, "drill id 不能重复");

  for (const drill of DRILLS) {
    assert.ok(drill.name.length > 2, `${drill.id} 缺名字`);
    assert.ok(
      Number.isInteger(drill.stage) && drill.stage >= 0 && drill.stage <= 5,
      `${drill.id} 的阶段越界`,
    );
    assert.ok(drill.steps.length >= 2, `${drill.id} 的练法至少两步`);
    assert.ok(drill.mistake.length > 4, `${drill.id} 要写常见错误`);
    assert.ok(drill.pass.length > 4, `${drill.id} 要写验收标准`);
    if (drill.bpm) assert.ok(drill.bpm[0] <= drill.bpm[1], `${drill.id} 的 BPM 区间反了`);
  }

  // 每一块（曲目块只给 S4/S5）都必须有可选练习，否则 buildSession 会拿到 undefined
  for (const stage of STAGES.map((item) => item.id)) {
    for (const block of BLOCKS) {
      if (block.id === "song" && stage < 4) continue;
      assert.ok(
        drillsFor(stage, block.id).length > 0,
        `S${stage} 的「${block.label}」没有练习`,
      );
    }
  }

  // 技巧库指向的练习必须存在
  for (const technique of TECHNIQUES) {
    if (!technique.drillId) continue;
    assert.ok(drillById(technique.drillId), `${technique.name} 指向了不存在的练习`);
  }
});

test("六线谱：每条练习都有谱子，弦品与拍位都合法", () => {
  assert.ok(DRILLS.length >= 45, `练习库太小：${DRILLS.length} 条`);

  for (const drill of DRILLS) {
    const tab = drill.tab;
    assert.ok(tab.notes.length > 0, `${drill.id} 没有谱子`);
    assert.ok(tab.bars >= 1, `${drill.id} 的小节数不对`);
    const limit = tab.bars * tab.beatsPerBar;
    for (const note of tab.notes) {
      assert.ok(note.s >= 1 && note.s <= 6, `${drill.id} 的弦号越界：${note.s}`);
      assert.ok(note.f >= 0 && note.f <= 15, `${drill.id} 的品号越界：${note.f}`);
      assert.ok(
        note.beat >= 0 && note.beat < limit,
        `${drill.id} 的音落在小节外：beat ${note.beat} / ${limit}`,
      );
      assert.ok(
        Number.isInteger(pitchClassAt(STANDARD_TUNING, note.s - 1, note.f)),
        `${drill.id} 的 ${note.s} 弦 ${note.f} 品算不出音高`,
      );
    }
  }

  // 技巧类练习必须真的标了技法，否则谱子看不出练什么
  for (const id of ["s3-hammer", "s3-pull", "s3-slide", "s3-trill", "s3-bend"]) {
    const drill = drillById(id)!;
    assert.ok(
      drill.tab.notes.some((note) => note.tech),
      `${id} 的谱子没有技法标记`,
    );
  }

  // 和弦类：同一拍上要有好几根弦
  const chord = drillById("s1-shape")!;
  const onBeat = chord.tab.notes.filter((note) => note.beat === 0);
  assert.ok(onBeat.length >= 4, "和弦谱第一拍应该同时按到多根弦");

  // 阶段之间的差别必须能看出来：每个阶段的谱子范围/时值不完全一样
  const signatures = STAGES.map((stage) => {
    const tabs = DRILLS.filter((drill) => drill.stage === stage.id).map(
      (drill) => `${drill.tab.range ?? ""}|${drill.tab.notes.length}`,
    );
    return tabs.join(",");
  });
  assert.equal(new Set(signatures).size, 6, "六个阶段的谱子不能长得一模一样");
});

test("谱子生成器：音阶、和弦、扫弦型都对得上", () => {
  // C 大调一个八度：5 弦 3 品起，正好 8 个音，最后回到 C
  const run = scaleRun({ keyId: "C", startString: 5, startFret: 3, fretMax: 3, step: 1 });
  assert.equal(run.notes.length, 8);
  assert.deepEqual(
    { s: run.notes[0].s, f: run.notes[0].f },
    { s: 5, f: 3 },
    "从 5 弦 3 品开始",
  );
  const last = run.notes[run.notes.length - 1];
  assert.equal(pitchClassAt(STANDARD_TUNING, last.s - 1, last.f), 0, "最后一个音是 C");

  // C 和弦：x32010，第一拍按到五根弦
  const cTab = chordTab({ name: "C", step: 1, bars: 1 });
  const firstBeat = cTab.notes.filter((note) => note.beat === 0);
  assert.equal(firstBeat.length, 5, "6 弦不弹，剩五根");
  assert.deepEqual(
    firstBeat.map((note) => note.f).sort((a, b) => a - b),
    [0, 0, 1, 2, 3],
  );

  // 八分扫弦：一小节 8 个拍位
  const strum = chordTab({
    name: "Em",
    step: 0.5,
    bars: 1,
    strums: ["D", "U", "D", "U", "D", "U", "D", "U"],
  });
  assert.equal(new Set(strum.notes.map((note) => note.beat)).size, 8);

  // 3/4：一小节 3 拍
  const waltz = chordTab({ name: "C", step: 1, bars: 2, beatsPerBar: 3, strums: ["D", "D", "D"] });
  assert.equal(waltz.beatsPerBar, 3);
  assert.equal(new Set(waltz.notes.map((note) => note.beat)).size, 6, "两小节六个拍位");
});

test("音阶谱必须严格上行：不能因为换弦空弦重复或回头", () => {
  const am = scaleRun({
    keyId: "Am",
    scaleId: "minorPentatonic",
    startString: 6,
    startFret: 5,
    fretMax: 8,
    step: 0.5,
  });
  const mids = am.notes.map((note) => STANDARD_TUNING.strings[note.s - 1] + note.f);
  assert.equal(mids.length, 6, "五声音阶一个八度是 6 个音（5 个音 + 回到主音）");
  for (let i = 1; i < mids.length; i++) {
    assert.ok(mids[i] > mids[i - 1], `第 ${i + 1} 个音比前一个低：${mids.join(",")}`);
  }
  assert.equal(mids[0] % 12, 9, "第一个音是 A");
  assert.equal(mids[mids.length - 1] % 12, 9, "最后一个音回到 A");

  const c = scaleRun({ keyId: "C", startString: 5, startFret: 3, fretMax: 3, step: 1 });
  const cMids = c.notes.map((note) => STANDARD_TUNING.strings[note.s - 1] + note.f);
  assert.equal(cMids.length, 8);
  for (let i = 1; i < cMids.length; i++) assert.ok(cMids[i] > cMids[i - 1]);
});

test("谱面的读屏描述：一句话说清几小节、几个音、几处休止", () => {
  const plain = tabOf([n(5, 3, 0), n(4, 0, 1), n(5, 3, 2), n(4, 0, 3)], { bars: 1 });
  const text = tabAriaLabel(plain);
  assert.match(text, /^六线谱/);
  assert.match(text, /1 小节/);
  assert.match(text, /共 4 个音/);
  assert.doesNotMatch(text, /休止/, "没有空拍就不提休止");

  // 第 2 拍空着 → 补一处休止；range 与 caption 也要带上
  const withRest = tabOf([n(5, 3, 0), n(4, 0, 2, 2)], {
    bars: 1,
    range: "1–5 品",
    caption: "C 大调音阶",
  });
  const restText = tabAriaLabel(withRest);
  assert.match(restText, /（1–5 品）/);
  assert.match(restText, /1 处休止/);
  assert.match(restText, /C 大调音阶$/);

  // 跟读练习里那条「八分 + 休止」必须报出休止处数
  const drill = READING_DRILLS.find((item) => item.id === "rd-08");
  assert.ok(drill);
  assert.match(tabAriaLabel(drill.tab), /处休止/);
});

test("谱子能摊成试听时间轴：拍位换秒、同拍低音弦在前", () => {
  const single = tabEvents(
    {
      beatsPerBar: 4,
      bars: 1,
      notes: [
        { s: 5, f: 3, beat: 0, dur: 1 },
        { s: 4, f: 0, beat: 2, dur: 1 },
      ],
    },
    60,
  );
  assert.equal(single.length, 2);
  assert.equal(single[0].at, 0);
  assert.equal(single[1].at, 2, "60 BPM 下第 3 拍就是第 2 秒");
  assert.equal(single[0].midi, 48, "5 弦 3 品是 C3");

  const chord = tabEvents(
    {
      beatsPerBar: 4,
      bars: 1,
      notes: [
        { s: 1, f: 0, beat: 0, dur: 0.5 },
        { s: 6, f: 3, beat: 0, dur: 0.5 },
        { s: 3, f: 0, beat: 0, dur: 0.5 },
      ],
    },
    60,
  );
  assert.deepEqual(chord.map((event) => event.string), [6, 3, 1], "同一拍按低音弦先排");
  assert.ok(chord.every((event) => event.at === 0));
  assert.ok(chord.every((event) => event.dur >= 0.12));
});

test("跟读练习：来自视频板书，写在六线谱的一根弦上，拍位合法", () => {
  assert.ok(READING_DRILLS.length >= 16, `跟读练习太少：${READING_DRILLS.length}`);
  assert.equal(
    new Set(READING_DRILLS.map((drill) => drill.id)).size,
    READING_DRILLS.length,
    "id 不能重复",
  );

  for (const drill of READING_DRILLS) {
    // 跟读谱现在按六线谱画：整条练习写在同一根弦的同一个品位上（节奏练的是拍子）
    assert.notEqual(drill.tab.display, "rhythm", `${drill.name} 不该再是单线 X`);
    const strings = new Set(drill.tab.notes.map((note) => note.s));
    const frets = new Set(drill.tab.notes.map((note) => note.f));
    assert.equal(strings.size, 1, `${drill.name} 应该只写在一根弦上`);
    assert.equal(frets.size, 1, `${drill.name} 应该只写在一个品位上`);
    const onlyString = [...strings][0];
    const onlyFret = [...frets][0];
    assert.ok(onlyString >= 1 && onlyString <= 6, `${drill.name} 弦号越界`);
    assert.ok(onlyFret >= 0 && onlyFret <= 24, `${drill.name} 品数越界`);
    assert.ok(drill.tab.notes.length > 0, `${drill.name} 没有音`);
    assert.ok(drill.count.length > 1, `${drill.name} 缺少数拍词`);
    assert.ok(drill.level >= 1 && drill.level <= 5);
    const limit = drill.tab.bars * drill.tab.beatsPerBar;
    for (const note of drill.tab.notes) {
      assert.ok(note.beat >= 0 && note.beat < limit, `${drill.name} 有音跑出小节`);
      assert.ok(note.dur > 0);
    }
    // 6/8 在模型里是 3 个四分音符一拍（6 个八分）
    if (drill.meter === "6/8") assert.equal(drill.tab.beatsPerBar, 3);
  }

  const dotted = READING_DRILLS.find((drill) => drill.id === "rd-09")!;
  assert.ok(Math.abs(dotted.tab.notes[0].dur - 0.75) < 1e-9, "附点应该是 3/4 拍");

  const triplets = READING_DRILLS.find((drill) => drill.id === "rd-14")!;
  assert.equal(triplets.tab.notes.length, 24, "两小节 × 每拍三下");
  const gap = triplets.tab.notes[1].beat - triplets.tab.notes[0].beat;
  assert.ok(Math.abs(gap - 1 / 3) < 1e-9, "三连音的间隔是 1/3 拍");
});

test("扫弦练习：24 条，十六分保留原样，时值对得上", () => {
  assert.equal(STRUM_DRILLS.length, 24, `扫弦练习应该是 24 条：${STRUM_DRILLS.length}`);
  assert.equal(
    new Set(STRUM_DRILLS.map((drill) => drill.no)).size,
    24,
    "练习编号不能重复",
  );
  assert.equal(
    new Set(STRUM_DRILLS.map((drill) => drill.id)).size,
    STRUM_DRILLS.length,
    "id 不能重复",
  );

  for (const drill of STRUM_DRILLS) {
    assert.ok(drill.count.length > 1, `${drill.name} 缺少数拍词`);
    assert.ok(drill.figure.length > 3, `${drill.name} 缺少音型说明`);
    assert.ok(drill.level >= 1 && drill.level <= 5);
    // 一小节的音数：每小节的第一拍都该落在 0
    const onsets = [
      ...new Set(
        drill.tab.notes
          .filter((note) => note.beat < drill.tab.beatsPerBar)
          .map((note) => Math.round(note.beat * 1000) / 1000),
      ),
    ].sort((a, b) => a - b);
    assert.ok(onsets.length > 0, `${drill.name} 一个扫都没有`);
    assert.equal(onsets[0], 0, `${drill.name} 第一下不在小节头`);
    const limit = drill.tab.beatsPerBar;
    for (const beat of onsets) {
      assert.ok(beat >= 0 && beat < limit, `${drill.name} 有音跑出小节`);
    }
    for (const note of drill.tab.notes) {
      assert.ok(note.dur > 0, `${drill.name} 有时值为 0 的音`);
      assert.ok(note.arrow === "D" || note.arrow === "U", `${drill.name} 弦上没有箭头`);
    }
    // 十六分不能被抹成八分：音型里只要写了十六分，谱上就得有 0.25 拍的音
    const hasSixteenthInFigure = /十六|后十六|后八/.test(drill.figure);
    if (hasSixteenthInFigure) {
      assert.ok(
        drill.tab.notes.some((note) => Math.abs(note.dur - 0.25) < 1e-9),
        `${drill.name}（${drill.figure}）在谱上找不到十六分音符`,
      );
    }
  }

  // 练习 6：前八后十六 —— 第 2 拍是 下(八分) 下(十六分) 上(十六分)
  const six = STRUM_DRILLS.find((drill) => drill.no === 6)!;
  const beat2 = six.tab.notes
    .filter((note) => note.beat >= 1 && note.beat < 2 && note.s === 1)
    .map((note) => [note.beat, note.dur, note.arrow]);
  assert.deepEqual(beat2, [
    [1, 0.5, "D"],
    [1.5, 0.25, "D"],
    [1.75, 0.25, "U"],
  ]);

  // 6/8 那条：一小节 6 拍（一拍一个八分），速度 80
  const sixEight = STRUM_DRILLS.find((drill) => drill.no === 14)!;
  assert.equal(sixEight.meter, "6/8");
  assert.equal(sixEight.beatsPerBar, 6);
  assert.equal(sixEight.bpm, 80);
  assert.equal(sixEight.tab.beatsPerBar, 6);

  // 2/4 那条：一小节 4 个八分，切音落在第 3 格
  const two = STRUM_DRILLS.find((drill) => drill.no === 1)!;
  assert.equal(two.beatsPerBar, 2);
  const muted = two.tab.notes.filter((note) => note.muted && note.beat < 2);
  assert.ok(muted.length > 0, "练习 1 的切音丢了");
  assert.equal(muted[0].beat, 1, "切音应该在第 2 拍下扫上");
});

test("伴奏型：17 条，五小节 C–Am–F–G–C，品数取自和弦按法", () => {
  assert.equal(ACCOMPANIMENTS.length, 17, `伴奏型应该是 17 条：${ACCOMPANIMENTS.length}`);
  assert.equal(
    new Set(ACCOMPANIMENTS.map((item) => item.no)).size,
    17,
    "练习编号不能重复",
  );
  assert.equal(
    new Set(ACCOMPANIMENTS.map((item) => item.id)).size,
    ACCOMPANIMENTS.length,
    "id 不能重复",
  );

  for (const item of ACCOMPANIMENTS) {
    assert.deepEqual(item.chords, ["C", "Am", "F", "G", "C"], `${item.name} 的和弦进行不对`);
    assert.equal(item.tab.bars, 5, `${item.name} 应该是五小节`);
    assert.ok(
      [2, 3, 4].includes(item.tab.beatsPerBar),
      `${item.name} 拍号不对：${item.tab.beatsPerBar}`,
    );
    assert.ok(item.pattern.length > 3, `${item.name} 缺少数弦号的序列`);
    assert.ok(item.figure.length > 3, `${item.name} 缺少音型说明`);
    assert.ok(item.tip.length > 3, `${item.name} 缺少提示`);
    assert.ok(item.level >= 1 && item.level <= 5);

    for (const note of item.tab.notes) {
      const bar = Math.floor(note.beat / item.tab.beatsPerBar);
      assert.ok(bar >= 0 && bar < 5, `${item.name} 有音跑出小节：第 ${note.beat} 拍`);
      const fret = CHORD_BY_NAME.get(item.chords[bar])!.frets[6 - note.s];
      assert.equal(
        note.f,
        fret,
        `${item.name} 第 ${bar + 1} 小节 ${note.s} 弦应按下 ${fret} 品，谱上写了 ${note.f}`,
      );
      assert.ok(note.dur > 0, `${item.name} 有时值为 0 的音`);
      const inBar = note.beat - bar * item.tab.beatsPerBar;
      assert.ok(inBar >= 0 && inBar < item.tab.beatsPerBar, `${item.name} 有音跑出小节`);
    }
  }

  // 练习 1 的第一小节：弦号复现成 pattern，第一下落在低音弦上
  const first = ACCOMPANIMENTS.find((item) => item.no === 1)!;
  const opening = first.tab.notes
    .filter((note) => note.beat < first.tab.beatsPerBar)
    .sort((a, b) => a.beat - b.beat);
  assert.equal(opening[0].beat, 0, "第一下应该在小节头");
  assert.ok(opening[0].s >= 4, "第一下应该是低音弦（5 或 6 弦），不是高音弦");
  assert.equal(first.pattern.split("-")[0], String(opening[0].s));
});

const HERE = dirname(fileURLToPath(import.meta.url));
const FINGERPRINTS = JSON.parse(
  readFileSync(join(HERE, "fixtures", "rhythm-fingerprints.json"), "utf8"),
) as Record<string, Record<string, { bars: number; beatsPerBar: number; onsets: unknown }>>;

/** 一个谱子的节奏指纹：`[拍位, 时值, 方向]`，同一拍只记一次。 */
function fingerprint(tab: { notes: { beat: number; dur: number; arrow?: "D" | "U" }[] }) {
  const first = new Map<number, { beat: number; dur: number; arrow?: "D" | "U" }>();
  for (const note of tab.notes) {
    const key = Math.round(note.beat * 1000) / 1000;
    if (!first.has(key)) first.set(key, note);
  }
  return [...first.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beat, note]) => [beat, Math.round(note.dur * 1000) / 1000, note.arrow ?? null]);
}

test("节奏指纹：练习的起音序列没有被意外改动", () => {
  const groups = [
    ["strum", STRUM_DRILLS],
    ["reading", READING_DRILLS],
    ["rhythm", RHYTHM_DRILLS],
    ["accompaniment", ACCOMPANIMENTS],
  ] as const;
  const problems: string[] = [];

  for (const [group, drills] of groups) {
    for (const drill of drills) {
      const want = FINGERPRINTS[group]?.[drill.id];
      const got = {
        bars: drill.tab.bars,
        beatsPerBar: drill.tab.beatsPerBar,
        onsets: fingerprint(drill.tab),
      };
      if (!want) {
        problems.push(`${group}/${drill.id}：基线里没有这条（新增了练习？跑 pnpm run gen:fingerprints）`);
        continue;
      }
      if (JSON.stringify(want) !== JSON.stringify(got)) {
        problems.push(
          `${group}/${drill.id}（${drill.name}）节奏变了：\n      原来 ${JSON.stringify(want.onsets)}\n      现在 ${JSON.stringify(got.onsets)}`,
        );
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `这些练习的节奏指纹和基线对不上（确认是有意改的，就跑 pnpm run gen:fingerprints）：\n  ${problems.join("\n  ")}`,
  );
});

test("时间分配：加起来必须正好是总时长", () => {
  // 最大余数法：不能多给一分钟，也不能少给
  const weights = [0.12, 0.38, 0.18, 0.15, 0.17];
  for (const total of SESSION_MINUTES) {
    const alloc = allocateMinutes(total, weights);
    assert.equal(
      alloc.reduce((a, b) => a + b, 0),
      total,
      `${total} 分钟分配后不相等`,
    );
    assert.ok(alloc.every((value) => value >= 1), "每块至少 1 分钟");
  }

  // 极端情况也不能崩
  assert.deepEqual(allocateMinutes(0, weights), [0, 0, 0, 0, 0]);
  assert.deepEqual(allocateMinutes(10, [0, 0]), [0, 0]);
  const tiny = allocateMinutes(3, [0.2, 0.2, 0.2, 0.2, 0.2]);
  assert.equal(tiny.reduce((a, b) => a + b, 0), 3);
});

test("每日计划：时长、顺序、可复现与阶段差异", () => {
  const date = "2026-11-05";

  for (const stage of [0, 1, 2, 3, 4, 5]) {
    for (const minutes of SESSION_MINUTES) {
      const session = buildSession({ minutes, stage, date });
      assert.equal(session.minutes, minutes);
      assert.equal(session.stage, stage);
      assert.equal(
        session.blocks.reduce((sum, block) => sum + block.minutes, 0),
        minutes,
        `S${stage} / ${minutes} 分钟的块加起来不对`,
      );
      // 顺序必须跟 BLOCKS 一致（热身在前，曲目在最后）
      const order = session.blocks.map((block) =>
        BLOCKS.findIndex((item) => item.id === block.block),
      );
      assert.deepEqual([...order].sort((a, b) => a - b), order, "块顺序乱了");
      // 每块都必须是当前阶段的练习
      for (const block of session.blocks) {
        assert.ok(
          block.drill.stage === stage,
          `${block.drill.id} 不属于 S${stage}`,
        );
        assert.ok(block.minutes >= 1);
      }
      assert.equal(session.goal, STAGES[stage].focus);
    }
  }

  // 同一天生成两次，内容一样
  const a = buildSession({ minutes: 60, stage: 3, date });
  const b = buildSession({ minutes: 60, stage: 3, date });
  assert.deepEqual(
    a.blocks.map((block) => block.drill.id),
    b.blocks.map((block) => block.drill.id),
  );

  // 曲目块：短时间不给，S5 的 120 分钟一定给
  const short = buildSession({ minutes: 60, stage: 5, date });
  assert.ok(!short.blocks.some((block) => block.block === "song"), "60 分钟不该有曲目块");
  const long = buildSession({ minutes: 120, stage: 5, date });
  assert.ok(long.blocks.some((block) => block.block === "song"), "120 分钟应该有曲目块");
  const lowStage = buildSession({ minutes: 120, stage: 0, date });
  assert.ok(!lowStage.blocks.some((block) => block.block === "song"), "S0 不排曲目块");

  // 一周之内练习内容会轮换（否则每天一成不变）
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((day) =>
    buildSession({ minutes: 60, stage: 3, date: day })
      .blocks.map((block) => block.drill.id)
      .join(","),
  );
  assert.ok(new Set(week).size > 1, "每天的计划不能完全一样");
});

test("阶段推断：40 关五章映射到 S0–S4", () => {
  assert.equal(stageForCompleted(0), 0);
  assert.equal(stageForCompleted(7), 0);
  assert.equal(stageForCompleted(8), 1, "第二章开始就是和弦阶段");
  assert.equal(stageForCompleted(17), 1);
  assert.equal(stageForCompleted(18), 2);
  assert.equal(stageForCompleted(26), 3);
  assert.equal(stageForCompleted(33), 4);
  assert.equal(stageForCompleted(40), 4, "S5 只能手选");
});

test("练习记录：连续天数、本周分钟数与去重", () => {
  let log = {};
  assert.deepEqual(practiceStats(log, "2026-11-05"), {
    streak: 0,
    longest: 0,
    todayMinutes: 0,
    weekMinutes: [0, 0, 0, 0, 0, 0, 0],
    weekTotal: 0,
    totalMinutes: 0,
    days: 0,
  });

  log = recordBlock(log, "2026-11-04", { drill: "w-crawl", minutes: 8, stage: 1 });
  log = recordBlock(log, "2026-11-05", { drill: "w-crawl", minutes: 8, stage: 1 });
  log = recordBlock(log, "2026-11-05", { drill: "c-two", minutes: 15, stage: 1 });
  // 同一块记两次只算一次练习，但时间照样累加
  log = recordBlock(log, "2026-11-05", { drill: "c-two", minutes: 5, stage: 1 });

  assert.deepEqual(log["2026-11-05"].done, ["w-crawl", "c-two"]);
  assert.equal(log["2026-11-05"].minutes, 28);

  const stats = practiceStats(log, "2026-11-05");
  assert.equal(stats.streak, 2);
  assert.equal(stats.todayMinutes, 28);
  assert.equal(stats.weekTotal, 36);
  assert.equal(stats.days, 2);
  assert.deepEqual(stats.weekMinutes, [0, 0, 0, 0, 0, 8, 28]);

  // 昨天没练、前天练了 → 连续天数断掉
  const gap = recordBlock({}, "2026-11-03", { drill: "w-crawl", minutes: 5, stage: 0 });
  assert.equal(practiceStats(gap, "2026-11-05").streak, 0);
});

test("热力图：一列一周、行从周一开始，最后一列是今天那周", () => {
  const heat = heatmapOf({}, "2026-11-05", 26);
  assert.equal(heat.weeks.length, 26);
  for (const column of heat.weeks) {
    assert.equal(column.length, 7);
    assert.equal(weekdayIndex(column[0].date), 0, "每列第一行必须是周一");
  }
  assert.equal(heat.from, heat.weeks[0][0].date);
  assert.equal(heat.to, "2026-11-05");

  const last = heat.weeks[25];
  const todayCell = last.find((cell) => cell.date === "2026-11-05");
  assert.ok(todayCell, "今天必须在最后一列里");
  assert.equal(todayCell.future, false, "今天不是未来");
  for (const column of heat.weeks) {
    for (const cell of column) {
      assert.equal(cell.future, cell.date > "2026-11-05", `${cell.date} 的未来标记`);
    }
  }
});

test("热力图：按分钟分四档，范围外的日子不算进来", () => {
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(1), 1);
  assert.equal(heatLevel(9), 1);
  assert.equal(heatLevel(10), 2);
  assert.equal(heatLevel(19), 2);
  assert.equal(heatLevel(20), 3);
  assert.equal(heatLevel(39), 3);
  assert.equal(heatLevel(40), 4);
  assert.equal(heatLevel(180), 4);

  const log = {
    "2026-11-04": { minutes: 12, stage: 0, done: ["a"] },
    "2026-11-05": { minutes: 45, stage: 0, done: ["b"] },
    "2020-01-01": { minutes: 99, stage: 0, done: ["c"] },
  };
  const heat = heatmapOf(log, "2026-11-05", 4);
  assert.equal(heat.days, 2);
  assert.equal(heat.total, 57);
  assert.equal(heat.max, 45);
  const cells = heat.weeks.flat();
  assert.equal(cells.find((cell) => cell.date === "2026-11-04").level, 2);
  assert.equal(cells.find((cell) => cell.date === "2026-11-05").level, 4);
});

test("热力图：月份标签落在换月的那一列，且不会挤在一起", () => {
  const heat = heatmapOf({}, "2026-11-05", 26);
  assert.ok(heat.months.length >= 5, `26 周至少跨半年，读到 ${heat.months.length} 个标签`);
  assert.equal(heat.months[0].week, 0);
  for (let i = 1; i < heat.months.length; i++) {
    assert.ok(heat.months[i].week - heat.months[i - 1].week >= 3, "两个标签至少隔 3 列");
  }
  for (const month of heat.months) {
    const monday = heat.weeks[month.week][0].date;
    assert.equal(month.label, `${Number(monday.slice(5, 7))}月`);
  }
});

test("跟练曲线：同一天只留最快的，点按日期排好，最多留 60 个", () => {
  let points = pushBpmPoint(undefined, "2026-11-01", 60);
  assert.deepEqual(points, [{ date: "2026-11-01", bpm: 60 }]);

  // 同一天练了两次，留快的
  points = pushBpmPoint(points, "2026-11-01", 52);
  assert.equal(points.length, 1);
  assert.equal(points[0].bpm, 60);
  points = pushBpmPoint(points, "2026-11-01", 72);
  assert.equal(points[0].bpm, 72);

  // 乱序写入也按日期排
  points = pushBpmPoint(points, "2026-10-30", 55);
  points = pushBpmPoint(points, "2026-11-03", 80);
  assert.deepEqual(
    points.map((point) => point.date),
    ["2026-10-30", "2026-11-01", "2026-11-03"],
  );

  // 超过上限时丢最早的
  let many: { date: string; bpm: number }[] = [];
  for (let i = 0; i < 70; i++) {
    many = pushBpmPoint(many, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, 40 + i, 10);
  }
  assert.equal(many.length, 10);

  // 非法输入不写进去
  assert.deepEqual(pushBpmPoint([], "", 60), []);
  assert.deepEqual(pushBpmPoint([], "2026-11-01", 0), []);
});

test("跟练曲线：数值换算成折线，首尾落在框内", () => {
  const spark = sparklineOf([60, 70, 92], 120, 30, 3);
  assert.equal(spark.dots.length, 3);
  assert.equal(spark.min, 60);
  assert.equal(spark.max, 92);
  assert.ok(spark.d.startsWith("M"), `折线应以 M 开头：${spark.d}`);
  assert.equal(spark.d.match(/L/g)?.length, 2, "三个点应该有两段线");

  for (const dot of spark.dots) {
    assert.ok(dot.x >= 3 && dot.x <= 117, `x 越界：${dot.x}`);
    assert.ok(dot.y >= 3 && dot.y <= 27, `y 越界：${dot.y}`);
  }
  // 速度越高越靠上
  assert.ok(spark.dots[2].y < spark.dots[0].y, "92 BPM 应该比 60 BPM 更靠上");
  assert.equal(spark.dots[0].x, 3);
  assert.equal(spark.dots[2].x, 117);

  // 只有一个点：画在正中间
  const single = sparklineOf([70], 120, 30, 3);
  assert.equal(single.dots.length, 1);
  assert.equal(single.dots[0].x, 60);

  // 全一样：不除零，贴底
  const flat = sparklineOf([80, 80, 80], 120, 30, 3);
  assert.ok(flat.dots.every((dot) => dot.y === 27), "一样高的时候贴底");

  assert.deepEqual(sparklineOf([], 120, 30), { d: "", dots: [], min: 0, max: 0 });
});

test("间隔复习：最久没练的先回来，今天练过的不算", () => {
  const log = {
    "2026-11-01": { minutes: 30, done: ["a"] },
    "2026-11-08": { minutes: 30, done: ["b"] },
    "2026-11-10": { minutes: 30, done: ["c"] },
  };
  const last = lastPracticed(log, "2026-11-10");
  assert.equal(last.get("a"), "2026-11-01", "a 只剩 11-01 那次（今天的记录不参与）");
  assert.equal(last.get("b"), "2026-11-08");
  assert.equal(last.get("c"), undefined, "今天练的 c 不进表，计划才不会当场变");

  assert.equal(dueDaysOf("2026-11-08", "2026-11-10"), 2);
  assert.equal(dueDaysOf(undefined, "2026-11-10"), FRESH_DAYS);

  // a 已经 9 天没练，b 才 2 天，c 没练过（按 FRESH_DAYS=4 算）→ 先挑 a
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const first = pickDue(pool, last, "2026-11-10", 0);
  assert.equal(first.item.id, "a");
  assert.equal(first.lastAt, "2026-11-01");
  assert.equal(first.days, 9);

  // 昨天把 a 练过之后，轮到没练过的 c；再把 c 练了，才轮到 b
  const afterA = lastPracticed({ ...log, "2026-11-09": { done: ["a"] } }, "2026-11-10");
  assert.equal(pickDue(pool, afterA, "2026-11-10", 0).item.id, "c");
  const afterC = lastPracticed({ ...log, "2026-11-09": { done: ["a", "c"] } }, "2026-11-10");
  assert.equal(pickDue(pool, afterC, "2026-11-10", 0).item.id, "b");

  // 一样久时按 offset 轮换：第二天换一条，不永远卡在第一条
  const tie = lastPracticed({ "2026-11-08": { done: ["a", "b"] } }, "2026-11-10");
  assert.equal(pickDue([{ id: "a" }, { id: "b" }], tie, "2026-11-10", 0).item.id, "a");
  assert.equal(pickDue([{ id: "a" }, { id: "b" }], tie, "2026-11-10", 1).item.id, "b");
});

test("退步的加急：跟练最高 BPM 掉下来，挑选时排在更前面", () => {
  const records = {
    // 练到过 96，最近只有 88 —— 掉了 8，算退步
    drop: { history: [{ date: "2026-11-01", bpm: 96 }, { date: "2026-11-09", bpm: 88 }] },
    // 一直在爬：80 → 92
    climb: { history: [{ date: "2026-11-01", bpm: 80 }, { date: "2026-11-09", bpm: 92 }] },
    // 只掉 4：一天的抖动，不算
    jitter: { history: [{ date: "2026-11-01", bpm: 90 }, { date: "2026-11-09", bpm: 86 }] },
    // 只有一天记录，没有基准
    once: { history: [{ date: "2026-11-09", bpm: 70 }] },
    // 没有曲线
    none: {},
  };
  const regressed = regressedIds(records);
  assert.ok(regressed.has("drop"), "掉 8 的算退步");
  assert.ok(!regressed.has("climb"));
  assert.ok(!regressed.has("jitter"), "只掉 4 不算");
  assert.ok(!regressed.has("once"));
  assert.ok(!regressed.has("none"));

  // 两条都练过同一天：b 没退步、a 退步了，boost 让 a 先回来
  const last = lastPracticed({ "2026-11-08": { done: ["a", "b"] } }, "2026-11-10");
  const pool = [{ id: "a" }, { id: "b" }];
  assert.equal(pickDue(pool, last, "2026-11-10", 0).item.id, "a", "一样久时先按 offset 轮");
  const boost = new Map([["b", 10]]);
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { boost }).item.id, "b", "加急之后 b 先");
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { boost }).boost, 10);

  // 今天先不练的跳过；整池都被排除时忽略排除，不至于空手
  const skip = new Set(["a"]);
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { exclude: skip }).item.id, "b");
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { exclude: new Set(["a", "b"]) }).item.id, "a");
});

test("压后不攒紧迫度：刚放出来的那条从释放日重新算，不会一放出来就排最前", () => {
  // a 一个月没练、b 五天前练过；没有压后时 a 先回来
  const last = new Map([
    ["a", "2026-10-11"],
    ["b", "2026-11-05"],
  ]);
  const pool = [{ id: "a" }, { id: "b" }];
  assert.equal(pickDue(pool, last, "2026-11-10", 0).item.id, "a", "没压过就按最久没练的来");

  // a 被压后到 11-08 释放：那一个月里有一周不算数，释放当天从 0 天起算
  const freeze = new Map([["a", "2026-11-08"]]);
  const frozen = pickDue(pool, last, "2026-11-10", 0, { freeze });
  assert.equal(frozen.item.id, "b", "压后过的 a 不该马上又被排上来");
  assert.equal(frozen.days, 5, "b 还是五天前练的");

  // 释放日比上次练更早时，仍然按上次练算（压后不能把时间往前推）
  const stale = new Map([["a", "2026-10-01"]]);
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { freeze: stale }).item.id, "a");

  // 当天释放、当天就挑：0 天，排最后
  const today = new Map([["a", "2026-11-10"]]);
  assert.equal(pickDue(pool, last, "2026-11-10", 0, { freeze: today }).item.id, "b");
});

test("今日计划：有练习记录时按「多久没练」挑，同一天同一份", () => {
  const date = "2026-11-10";
  const plain = buildSession({ minutes: 60, stage: 0, date });
  const same = buildSession({ minutes: 60, stage: 0, date });
  assert.deepEqual(
    plain.blocks.map((block) => block.drill.id),
    same.blocks.map((block) => block.drill.id),
    "同一天两次生成必须是同一份计划",
  );

  // 把今天的计划全练过（记到昨天），今天再生成：能换的都该换掉
  const done = plain.blocks.map((block) => block.drill.id);
  const log = { "2026-11-09": { minutes: 60, stage: 0, done } };
  const next = buildSession({ minutes: 60, stage: 0, date, log });
  for (const block of next.blocks) {
    const pool = drillsFor(0, block.block);
    const same = done.includes(block.drill.id);
    if (pool.length > 1) {
      assert.ok(!same, `${block.block} 有 ${pool.length} 条可选，不该还练昨天那条`);
    }
  }

  // 每块都带上「多久没练」，页面要显示
  for (const block of next.blocks) {
    assert.ok(block.days !== undefined && block.days >= 0, `${block.block} 没带上 days`);
  }
  assert.ok(
    next.blocks.some((block) => block.lastAt),
    "昨天练过的那批里，总有几条该带上 lastAt",
  );
});

test("今日计划：跳过的那条今天不再出现，跳光了也不会空手", () => {
  const date = "2026-11-10";
  const plain = buildSession({ minutes: 60, stage: 0, date });

  // 跳过第一块的那条：它必须换人，其他块不受影响
  const first = plain.blocks[0];
  const skip = new Set([first.drill.id]);
  const next = buildSession({ minutes: 60, stage: 0, date, skip });
  assert.equal(next.blocks.length, plain.blocks.length, "块数不该变");
  assert.notEqual(next.blocks[0].drill.id, first.drill.id, "跳过的那条不该还在");
  for (let i = 1; i < plain.blocks.length; i += 1) {
    assert.equal(next.blocks[i].drill.id, plain.blocks[i].drill.id, `第 ${i + 1} 块不该动`);
  }

  // 每一块都跳光：退回整块挑一条，不能抛错也不能少块
  const all = new Set(plain.blocks.map((block) => block.drill.id));
  for (const block of plain.blocks) {
    for (const drill of drillsFor(0, block.block)) all.add(drill.id);
  }
  const fallback = buildSession({ minutes: 60, stage: 0, date, skip: all });
  assert.equal(fallback.blocks.length, plain.blocks.length, "全跳过也要给出整份计划");
  for (const block of fallback.blocks) {
    assert.ok(block.drill, `${block.block} 全跳过时没挑出练习`);
  }
});

test("技巧库：左右手各 7 张，每张都有练法与验收", () => {
  assert.equal(TECHNIQUES.length, 14);
  assert.equal(techniquesOf("left").length, 7);
  assert.equal(techniquesOf("right").length, 7);
  assert.equal(new Set(TECHNIQUES.map((item) => item.id)).size, 14, "id 不能重复");

  for (const technique of TECHNIQUES) {
    assert.ok(technique.summary.length > 10, `${technique.name} 缺少说明`);
    assert.ok(technique.keys.length >= 2, `${technique.name} 的要领太少`);
    assert.ok(technique.how.length >= 2, `${technique.name} 的练法太少`);
    assert.ok(technique.mistake.length > 4, `${technique.name} 缺少常见错误`);
    assert.ok(technique.pass.length > 4, `${technique.name} 缺少验收`);
    assert.ok(technique.stage >= 0 && technique.stage <= 5, `${technique.name} 阶段越界`);
  }

  assert.equal(techniqueById("hammer")?.hand, "left");
  assert.equal(techniqueById("palm-mute")?.hand, "right");
  assert.equal(techniqueById("不存在"), undefined);
});

test("节奏专项：时值练习覆盖三连音、十六分与切换", () => {
  assert.ok(RHYTHM_DRILLS.length >= 8, `时值练习太少：${RHYTHM_DRILLS.length}`);
  assert.equal(
    new Set(RHYTHM_DRILLS.map((drill) => drill.id)).size,
    RHYTHM_DRILLS.length,
    "id 不能重复",
  );

  for (const drill of RHYTHM_DRILLS) {
    assert.ok(drill.level >= 1 && drill.level <= 5, `${drill.name} 难度越界`);
    assert.ok(drill.bpm[0] < drill.bpm[1], `${drill.name} 的 BPM 区间不对`);
    assert.ok(drill.count.length > 2, `${drill.name} 缺少数拍词`);
    assert.ok(drill.tips.length >= 1, `${drill.name} 缺少练法`);
    assert.ok(drill.pass.length > 4, `${drill.name} 缺少验收`);
    assert.ok(drill.tab.notes.length > 0, `${drill.name} 没有谱子`);
  }

  // 三连音必须是一拍三等分
  const triplet = RHYTHM_DRILLS.find((drill) => drill.id === "rt-triplet")!;
  const gaps = triplet.tab.notes.slice(1).map((note, i) => note.beat - triplet.tab.notes[i].beat);
  for (const gap of gaps) {
    assert.ok(Math.abs(gap - 1 / 3) < 1e-6, `三连音间隔不是 1/3 拍：${gap}`);
  }

  // 十六分练习正好 16 个音，时值 1/4
  const sixteenth = RHYTHM_DRILLS.find((drill) => drill.id === "rt-sixteenth")!;
  assert.equal(sixteenth.tab.notes.length, 16);
  assert.ok(sixteenth.tab.notes.every((note) => Math.abs(note.dur - 0.25) < 1e-9));

  // 混合练习里至少出现三种时值
  const mixed = RHYTHM_DRILLS.find((drill) => drill.id === "rt-mixed")!;
  const durs = new Set(mixed.tab.notes.map((note) => Math.round(note.dur * 1000)));
  assert.ok(durs.size >= 3, `混合练习只有 ${durs.size} 种时值`);
});

test("节奏专项：扫弦型与风格片段都有谱子", () => {
  assert.ok(STRUM_LIBRARY.length >= 10, `扫弦型太少：${STRUM_LIBRARY.length}`);
  for (const pattern of STRUM_LIBRARY) {
    assert.ok(pattern.level >= 1 && pattern.level <= 5, `${pattern.name} 难度越界`);
    assert.ok(pattern.count.length > 2, `${pattern.name} 缺少数拍词`);
    assert.ok(pattern.tip.length > 4, `${pattern.name} 缺少提示`);
    // 一维格子（不下分小节）长度必须正好填满一小节
    const perBar = Math.round((pattern.beatsPerBar ?? 4) / pattern.step);
    assert.equal(
      pattern.slots.length,
      perBar,
      `${pattern.name} 的格子数 ${pattern.slots.length} 和一小节 ${perBar} 对不上`,
    );
    assert.ok(pattern.tab.notes.length > 0, `${pattern.name} 没有谱子`);
    assert.ok(
      pattern.tab.notes.some((note) => note.arrow),
      `${pattern.name} 的谱子没有箭头`,
    );
  }

  assert.ok(SONG_SNIPPETS.length >= 5, `风格片段太少：${SONG_SNIPPETS.length}`);
  for (const snippet of SONG_SNIPPETS) {
    assert.ok(snippet.chords.length > 0, `${snippet.name} 没写和弦`);
    assert.ok(snippet.tip.length > 4, `${snippet.name} 缺少提示`);
    assert.ok(snippet.tab.notes.length > 0, `${snippet.name} 没有谱子`);
    assert.ok(snippet.bpm[0] < snippet.bpm[1]);
  }
});

/** 按空格切音，但括号（和弦）和花括号（属性）里的空格不算。 */
function alphaTokens(bar: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of bar) {
    if (ch === "(" || ch === "{") depth += 1;
    if (ch === ")" || ch === "}") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  // 拍属性写成 `(...).8 {bd}`，属性那一段和时值之间隔着空格，要并回前一个音。
  const merged: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("{") && merged.length > 0) merged[merged.length - 1] += ` ${token}`;
    else merged.push(token);
  }
  return merged;
}

/** alphaTex 一小节里所有音加起来等于几个四分音符（三连音按 2/3 折算）。 */
function alphaBarQuarters(bar: string): number {
  const tokens = alphaTokens(bar);
  const read = (token: string) => {
    const match = /\.(\d+)(?:\s*\{([^}]*)\})?$/.exec(token);
    if (!match) throw new Error(`看不懂的音符：${token}`);
    const props = (match[2] ?? "").split(/\s+/).filter(Boolean);
    const quarters = (4 / Number(match[1])) * (props.includes("d") ? 1.5 : 1);
    return { quarters, props };
  };
  let total = 0;
  for (let i = 0; i < tokens.length; i++) {
    const current = read(tokens[i]);
    if (current.props.includes("tu")) {
      // `{tu 3}` 写在组头，后面两个音是组员：三个音按记谱时值写，实际只占 2/3 的时间。
      let written = current.quarters;
      let next = i + 1;
      while (next < tokens.length && next <= i + 2) {
        written += read(tokens[next]).quarters;
        next += 1;
      }
      total += written * (2 / 3);
      i = next - 1;
    } else {
      total += current.quarters;
    }
  }
  return total;
}

test("alphaTex：每条谱的每一小节都被填满", () => {
  const tabs: { name: string; beatsPerBar: number; bars: number; tab: Parameters<typeof tabToAlphaTex>[0] }[] = [
    ...STRUM_DRILLS.map((drill) => ({
      name: `扫弦练习 ${drill.no}`,
      beatsPerBar: drill.tab.beatsPerBar,
      bars: drill.tab.bars,
      tab: drill.tab,
    })),
    ...READING_DRILLS.map((drill) => ({
      name: drill.name,
      beatsPerBar: drill.tab.beatsPerBar,
      bars: drill.tab.bars,
      tab: drill.tab,
    })),
    ...RHYTHM_DRILLS.map((drill) => ({
      name: drill.name,
      beatsPerBar: drill.tab.beatsPerBar,
      bars: drill.tab.bars,
      tab: drill.tab,
    })),
    ...STRUM_LIBRARY.map((pattern) => ({
      name: pattern.name,
      beatsPerBar: pattern.tab.beatsPerBar,
      bars: pattern.tab.bars,
      tab: pattern.tab,
    })),
    ...SONG_SNIPPETS.map((snippet) => ({
      name: snippet.name,
      beatsPerBar: snippet.tab.beatsPerBar,
      bars: snippet.tab.bars,
      tab: snippet.tab,
    })),
  ];

  for (const item of tabs) {
    const tex = tabToAlphaTex(item.tab, { bpm: 70 });
    const body = tex.split("\n").filter((line) => !line.startsWith("\\")).join(" ");
    const bars = body.split("|").map((bar) => bar.trim()).filter(Boolean);
    assert.equal(bars.length, item.bars, `${item.name} 的小节数不对`);
    // alphaTab 的硬约束：小节时值凑不齐就整张空白，所以这里必须一分不差。
    const perBeat = item.beatsPerBar === 6 || item.beatsPerBar === 12 ? 0.5 : 1;
    const expected = item.beatsPerBar * perBeat;
    for (const [index, bar] of bars.entries()) {
      const got = alphaBarQuarters(bar);
      assert.ok(
        Math.abs(got - expected) < 1e-6,
        `${item.name} 第 ${index + 1} 小节是 ${got} 个四分音符，应该是 ${expected}`,
      );
    }
  }
});

test("alphaTex：附点、切音、三连音都按 alphaTab 的语法写", () => {
  // 附点八分 + 十六分：附点写 `{d}`，和扫弦方向挤进同一个花括号
  const dotted = tabOf([
    n(5, 3, 0, 0.75, { arrow: "D" }),
    n(5, 3, 0.75, 0.25, { arrow: "U" }),
    n(5, 3, 1, 1),
    n(5, 3, 2, 1),
    n(5, 3, 3, 1),
  ]);
  const dottedTex = tabToAlphaTex(dotted);
  assert.ok(dottedTex.includes("{bd d}"), `附点+下扫没合成一个花括号：${dottedTex}`);
  assert.ok(dottedTex.includes("{bu}"), `上扫没写出来：${dottedTex}`);
  assert.ok(!dottedTex.includes(".8."), "不要再写尾点形式 `.8.`，它后面跟花括号会解析失败");
  assert.ok(!/\{\w+\}\s+\{/.test(dottedTex), "一拍不能带两个花括号");

  // 切音：默认按制谱软件写 P.M.（品数保留、音符属性 `{pm}`），只有显式 dead 才画 ×
  const muted = tabOf([n(5, 3, 0, 1, { muted: true }), n(4, 2, 1, 1), n(3, 0, 2, 1), n(2, 1, 3, 1)]);
  const mutedTex = tabToAlphaTex(muted);
  assert.ok(mutedTex.includes("3.5{pm}"), `切音没有写成 P.M. 音符属性：${mutedTex}`);
  assert.ok(!mutedTex.includes("x.5"), `默认不该再画死音：${mutedTex}`);
  assert.ok(!/\.4\{pm\}/.test(mutedTex), `{pm} 写在时值后面会被当成 beat property，解析失败：${mutedTex}`);
  // 和弦里每个音都要带 `{pm}`，否则那条 P.M. 虚线不完整
  const mutedChord = tabOf([n(5, 3, 0, 1, { muted: true }), n(4, 2, 0, 1, { muted: true }), n(3, 0, 0, 1, { muted: true })]);
  assert.ok(
    tabToAlphaTex(mutedChord).includes("(3.5{pm} 2.4{pm} 0.3{pm})"),
    `和弦切音没逐音写 {pm}：${tabToAlphaTex(mutedChord)}`,
  );
  assert.ok(tabToAlphaTex(muted, { mute: "dead" }).includes("x.5"), "显式 dead 模式才画死音");

  // 三连音：一组三个音，只在组头写一次 `{tu 3}`
  const triplets = tabOf([
    n(3, 0, 0, 1 / 3),
    n(3, 0, 1 / 3, 1 / 3),
    n(3, 0, 2 / 3, 1 / 3),
    n(3, 0, 1, 1),
    n(3, 0, 2, 1),
    n(3, 0, 3, 1),
  ]);
  const tripletTex = tabToAlphaTex(triplets);
  assert.equal(tripletTex.match(/\{tu 3\}/g)?.length, 1, `三连音标记数量不对：${tripletTex}`);
  // 记谱时值：1/3 拍写成八分（`.8`）
  assert.ok(tripletTex.includes(".8 {tu 3}"), `三连音组头没写记谱时值：${tripletTex}`);

  // 6/8 的拍号分母写 8，一拍按八分算
  const sixEight = tabOf([n(5, 3, 0, 1), n(5, 3, 1, 1), n(5, 3, 2, 1), n(5, 3, 3, 1), n(5, 3, 4, 1), n(5, 3, 5, 1)], {
    beatsPerBar: 6,
  });
  const sixTex = tabToAlphaTex(sixEight);
  assert.ok(sixTex.includes("\\ts (6 8)"), `6/8 拍号写错了：${sixTex}`);
});

test("和弦转换：每 N 拍换一个，循环着走，第一拍不算换", () => {
  const chords = ["C", "Am", "F", "G"];

  // 每 2 拍换：0、1 拍是 C；2、3 拍是 Am；一直循环
  assert.deepEqual(chordAt(chords, 2, 0), { chord: "C", next: "Am", index: 0 });
  assert.deepEqual(chordAt(chords, 2, 1), { chord: "C", next: "Am", index: 0 });
  assert.equal(chordAt(chords, 2, 2).chord, "Am");
  assert.equal(chordAt(chords, 2, 3).chord, "Am");
  assert.equal(chordAt(chords, 2, 6).chord, "G");
  assert.equal(chordAt(chords, 2, 6).next, "C", "最后一拍的下一个要绕回第一个");
  assert.equal(chordAt(chords, 2, 8).chord, "C", "8 拍正好绕一圈");

  // 每 4 拍换：一整小节一个和弦
  assert.equal(chordAt(chords, 4, 3).chord, "C");
  assert.equal(chordAt(chords, 4, 4).chord, "Am");

  // 负数、非整数、0 拍间隔都别炸
  assert.equal(chordAt(chords, 2, -3).chord, "C");
  assert.equal(chordAt(chords, 2, 2.7).chord, "Am");
  assert.equal(chordAt(chords, 0, 5).chord, "Am", "0 拍按 1 拍处理");

  // 换了几次：第一拍是「按上去」，不算换
  assert.equal(changesIn(4, 2), 1);
  assert.equal(changesIn(5, 2), 2);
  assert.equal(changesIn(8, 2), 3);
  assert.equal(changesIn(4, 4), 0);
  assert.equal(changesIn(1, 2), 0);
  assert.equal(changesIn(0, 2), 0);

  // 一分钟就是 BPM 那么多拍
  assert.equal(drillBeats(80), 80);
  assert.equal(drillBeats(0), 1);
});

test("和弦转换：四组进行里的和弦都在和弦库里", () => {
  assert.equal(PROGRESSIONS.length, 4);
  for (const progression of PROGRESSIONS) {
    assert.equal(progression.chords.length, 4, `${progression.id} 应该是四个和弦`);
    assert.equal(
      progression.name,
      progression.chords.join("–"),
      `${progression.id} 的名字要跟和弦对得上`,
    );
    for (const name of progression.chords) {
      assert.ok(CHORD_BY_NAME.has(name), `${progression.id} 里的 ${name} 不在和弦库里`);
    }
  }
});

test("这一周：从周一起算，上周只比到同一天", () => {
  // 2026-11-14 是周六；本周一 = 11-09
  assert.equal(mondayOf("2026-11-14"), "2026-11-09");
  assert.equal(mondayOf("2026-11-09"), "2026-11-09", "周一自己就是起点");
  assert.equal(mondayOf("2026-11-15"), "2026-11-09", "周日还算这一周");

  const log = {
    "2026-11-09": { minutes: 30, stage: 0, done: ["s0-crawl", "s0-scale"] },
    "2026-11-11": { minutes: 20, stage: 0, done: ["s0-crawl"] },
    // 上周同期（11-02 … 11-07）：两天，一条重复的
    "2026-11-03": { minutes: 15, stage: 0, done: ["s0-press"] },
    "2026-11-07": { minutes: 10, stage: 0, done: ["s0-crawl"] },
    // 上周日（11-08）不在「上周同期」里：它是上上周的尾巴
    "2026-11-08": { minutes: 99, stage: 0, done: ["s0-record"] },
    // 更早的、和未来的都不该算进来
    "2026-10-01": { minutes: 500, stage: 0, done: ["s0-riff"] },
    "2026-11-20": { minutes: 60, stage: 0, done: ["s0-riff"] },
  };

  const week = weekSummaryOf(log, "2026-11-14");
  assert.equal(week.from, "2026-11-09");
  assert.equal(week.to, "2026-11-14");
  assert.equal(week.days, 2);
  assert.equal(week.minutes, 50);
  assert.equal(week.items, 2, "s0-crawl 两天都练了，只算一条");
  assert.equal(week.prevDays, 2);
  assert.equal(week.prevMinutes, 25);
  assert.equal(week.deltaMinutes, 25);
  assert.equal(week.deltaDays, 0);
});

test("这一周：同一天只算一次，光打开没练的不算", () => {
  const log = {
    "2026-11-10": { minutes: 0, stage: 0, done: [] },
    "2026-11-12": { minutes: 40, stage: 1, done: ["s1-cycle"] },
  };
  const week = weekSummaryOf(log, "2026-11-14");
  assert.equal(week.days, 1, "0 分钟、0 条目的那天不算练过");
  assert.equal(week.minutes, 40);
  assert.equal(week.prevMinutes, 0);
  assert.equal(week.deltaMinutes, 40);
  assert.equal(week.deltaDays, 1);
});

test("本周目标：没设目标就不画进度，达成了不多算、没达成算出还差多少", () => {
  const off = goalProgress(50, 0);
  assert.deepEqual(off, { goal: 0, done: 50, percent: 0, remaining: 0, reached: false }, "没设目标");

  const half = goalProgress(30, 60);
  assert.equal(half.percent, 50);
  assert.equal(half.remaining, 30);
  assert.equal(half.reached, false);

  const done = goalProgress(60, 60);
  assert.deepEqual(done, { goal: 60, done: 60, percent: 100, remaining: 0, reached: true }, "刚好达成");

  const over = goalProgress(90, 60);
  assert.equal(over.percent, 100, "超了也只到 100，进度条别溢出");
  assert.equal(over.remaining, 0);
  assert.equal(over.reached, true);

  assert.equal(goalProgress(-5, 60).done, 0, "负的分钟数按 0 算");
  assert.equal(goalProgress(30, Number.NaN).goal, 0, "坏的目标值当成没设");
});

test("本周节奏：还差多少换成「剩下几天、每天几分钟」", () => {
  const log = { "2026-11-11": { minutes: 30, stage: 0, done: ["s0-crawl"] } };
  const midweek = weekPace(weekSummaryOf(log, "2026-11-11"), "2026-11-11", 60);
  assert.equal(midweek.elapsed, 3, "周三 = 这周第 3 天");
  assert.equal(midweek.left, 4, "今天之后还有 4 天");
  assert.equal(midweek.perDay, 10);
  assert.equal(midweek.projected, 70, "按这个节奏一周 70 分钟");
  assert.equal(midweek.perDayNeeded, 6, "还差 30 分钟，剩下 5 天（含今天）每天 6 分钟");
  assert.equal(midweek.reached, false);

  const sunday = weekPace(weekSummaryOf({ "2026-11-11": { minutes: 55, stage: 0, done: [] } }, "2026-11-15"), "2026-11-15", 60);
  assert.equal(sunday.elapsed, 7, "周日是最后一天");
  assert.equal(sunday.left, 0);
  assert.equal(sunday.perDayNeeded, 5, "只剩今天，还差 5 分钟就练 5 分钟");

  const reached = weekPace(weekSummaryOf({ "2026-11-11": { minutes: 80, stage: 0, done: [] } }, "2026-11-11"), "2026-11-11", 60);
  assert.equal(reached.reached, true);
  assert.equal(reached.perDayNeeded, 0, "达成了就不用再摊到每天");

  const noGoal = weekPace(weekSummaryOf(log, "2026-11-11"), "2026-11-11", 0);
  assert.equal(noGoal.perDayNeeded, 0, "没设目标就没有「每天还要练多少」");
});

test("连续达成：从这周往回数，周中还没练够不算断，没记目标就停", () => {
  const goals = { "2026-11-09": 60, "2026-11-02": 60, "2026-10-26": 60 };
  const log = {
    "2026-11-09": { minutes: 70, stage: 0, done: [] },
    "2026-11-03": { minutes: 80, stage: 0, done: [] },
    "2026-10-27": { minutes: 10, stage: 0, done: [] },
  };
  const two = weekStreak(log, goals, "2026-11-11");
  assert.equal(two.weeks, 2, "这周 + 上周达成，上上周只练了 10 分钟就断了");
  assert.equal(two.currentDone, true);

  const midweek = weekStreak({ ...log, "2026-11-09": { minutes: 30, stage: 0, done: [] } }, goals, "2026-11-11");
  assert.equal(midweek.currentDone, false);
  assert.equal(midweek.weeks, 1, "这周才周三，还没够不算断，只数上周");

  assert.equal(weekStreak(log, {}, "2026-11-11").weeks, 0, "没记过目标就谈不上连续");

  const skipped = weekStreak({ ...log, "2026-11-09": { minutes: 5, stage: 0, done: [] } }, { "2026-11-02": 60 }, "2026-11-11");
  assert.equal(skipped.weeks, 1, "这周没设目标：跳过这周，从上周算");
  assert.equal(skipped.currentDone, false);

  // 断了以后，上一串还要数得出来（页面写「上次连续 N 周」）
  const broken = weekStreak(
    {
      "2026-11-10": { minutes: 5, stage: 0, done: [] },
      "2026-11-03": { minutes: 5, stage: 0, done: [] },
      "2026-10-27": { minutes: 70, stage: 0, done: [] },
      "2026-10-20": { minutes: 70, stage: 0, done: [] },
      "2026-10-13": { minutes: 70, stage: 0, done: [] },
    },
    { "2026-11-09": 60, "2026-11-02": 60, "2026-10-26": 60, "2026-10-19": 60, "2026-10-12": 60 },
    "2026-11-11",
  );
  assert.equal(broken.weeks, 0, "这周和上周都没练够：当前这串是 0");
  assert.equal(broken.lastWeeks, 3, "上一串是 10-12 起那三周");
  assert.equal(broken.lastUntil, "2026-10-26", "上一串最后一根是 10-26 那周");
  assert.equal(broken.best, 3, "历史最长也是 3 周");

  const ongoing = weekStreak(log, goals, "2026-11-11");
  assert.equal(ongoing.lastWeeks, 0, "还没断的时候不显示「上次连续」");
  assert.equal(ongoing.lastUntil, "");
  assert.equal(ongoing.best, 2);
});

test("周报：这周练了几天、最勤哪天、哪块落下了", () => {
  const report = weekReportOf(
    {
      "2026-11-09": { minutes: 20, stage: 0, done: ["s0-crawl", "s0-scale"] },
      "2026-11-11": { minutes: 45, stage: 1, done: ["s1-chord"] },
      "2026-11-12": { minutes: 0, stage: 0, done: ["rt-quarter-eighth"] },
      "2026-11-08": { minutes: 99, stage: 0, done: ["s9-old"] },
      "2026-11-16": { minutes: 99, stage: 0, done: ["s9-future"] },
    },
    "2026-11-13",
  );
  assert.equal(report.from, "2026-11-09");
  assert.equal(report.days, 3, "有分钟或有条目都算练过");
  assert.equal(report.minutes, 65, "上周和下周的记录不算");
  assert.equal(report.items, 4, "四个 id 去重");
  assert.deepEqual(report.busiest, { date: "2026-11-11", minutes: 45 });
  assert.deepEqual(report.missed, ["2026-11-10", "2026-11-13"], "这周还没练的两天");
  assert.deepEqual(report.kinds, { practice: 3, follow: 0, rhythm: 1 });
  assert.equal(report.weak, "follow", "跟练一条都没练，下周先补它");

  const allDone = weekReportOf(
    { "2026-11-09": { minutes: 10, stage: 0, done: ["s0-crawl", "p:s0-crawl", "rt-quarter-eighth"] } },
    "2026-11-09",
  );
  assert.equal(allDone.weak, "", "三块都练过就不催了");
  assert.equal(allDone.missed.length, 0);
  assert.equal(allDone.busiest?.date, "2026-11-09");
});

/* ---------- 调音器 ---------- */

/** 造一段正弦波，当作麦克风采样（检测算法的输入） */
function sine(freq: number, sampleRate: number, seconds = 0.2, amplitude = 0.3): Float32Array {
  const size = Math.floor(sampleRate * seconds);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

test("调音器：频率、音分、最近的空弦", () => {
  assert.equal(Math.round(frequencyOfMidi(69)), 440, "A4 = 440");
  assert.equal(Math.round(frequencyOfMidi(40) * 100) / 100, 82.41, "6 弦 E2");
  assert.equal(Math.round(frequencyOfMidi(64) * 100) / 100, 329.63, "1 弦 E4");
  assert.equal(Math.round(midiOfFrequency(440)), 69);
  assert.equal(Math.round(centsOff(frequencyOfMidi(41), frequencyOfMidi(40))), 100, "半音 = 100 音分");

  const e2 = nearestString(frequencyOfMidi(40));
  assert.equal(e2?.string, 6);
  assert.equal(e2?.name, "E");
  assert.equal(e2?.octave, 2);
  assert.equal(e2?.cents, 0);

  // 高 12 音分的 6 弦，最近的仍然是 6 弦（不是 5 弦 A2）
  const sharp = nearestString(frequencyOfMidi(40) * Math.pow(2, 12 / 1200));
  assert.equal(sharp?.string, 6);
  assert.equal(sharp?.cents, 12);
});

test("调音器：读数以弦为准，音名只兜底", () => {
  const exact = tunerReading(frequencyOfMidi(40));
  assert.equal(exact?.string?.string, 6);
  assert.equal(exact?.inTune, true, "正好准");
  assert.equal(exact?.hint, "6 弦 E2 准了");

  // E2 高 60 音分：最近的音名已经是 F2，但要调的仍然是 6 弦
  const high = tunerReading(frequencyOfMidi(40) * Math.pow(2, 60 / 1200));
  assert.equal(high?.note, "F", "音名是 F2");
  assert.equal(high?.octave, 2);
  assert.equal(high?.string?.string, 6, "还是按 6 弦提示");
  assert.equal(high?.string?.cents, 60);
  assert.equal(high?.inTune, false);
  assert.equal(high?.hint, "6 弦 E2 偏高 60 音分，松一点");

  const low = tunerReading(frequencyOfMidi(45) * Math.pow(2, -30 / 1200));
  assert.equal(low?.string?.string, 5);
  assert.equal(low?.hint, "5 弦 A2 偏低 30 音分，拧紧一点");

  // 六根空弦之外（B1，离 6 弦 500 音分）就不硬说是哪根弦
  const between = tunerReading(frequencyOfMidi(30));
  assert.equal(between?.string, null);
  assert.ok(between?.hint.includes("弹单根空弦"));

  assert.equal(tunerReading(0), null);
  assert.equal(tunerReading(Number.NaN), null);
});

test("调音器：换一套调弦，6 弦就不是 E2 了", () => {
  const standard = stringsOf(tuningPreset("standard"));
  const dropD = stringsOf(tuningPreset("dropD"));
  assert.equal(standard.length, 6);
  assert.deepEqual(
    standard.map((item) => item.midi),
    [40, 45, 50, 55, 59, 64],
    "标准调弦从 6 弦到 1 弦：E2 A2 D3 G3 B3 E4",
  );

  const sixth = dropD.find((item) => item.string === 6);
  assert.equal(sixth?.midi, 38, "Drop D 的 6 弦降到 D2");
  assert.equal(sixth?.name, "D");
  assert.equal(sixth?.octave, 2);

  // 弹一个 D2：标准调弦里它是「6 弦偏低 200 音分」，Drop D 里就是准的
  const d2 = frequencyOfMidi(38);
  assert.equal(tunerReading(d2, 5, standard)?.string?.string, 6);
  assert.equal(tunerReading(d2, 5, standard)?.inTune, false);
  const dropped = tunerReading(d2, 5, dropD);
  assert.equal(dropped?.inTune, true);
  assert.equal(dropped?.hint, "6 弦 D2 准了");

  // 降半音：整套往下挪一个半音，1 弦成了 Eb4
  const half = stringsOf(tuningPreset("halfDown"));
  const first = half.find((item) => item.string === 1);
  assert.equal(first?.midi, 63);
  assert.equal(first?.name, "D#");

  // 开放 G：6 弦 D2、5 弦 G2、1 弦 D4
  const openG = stringsOf(tuningPreset("openG"));
  assert.deepEqual(
    openG.map((item) => item.midi),
    [38, 43, 50, 55, 59, 62],
  );

  // 认不出来的 id 退回标准（存下来的 id 可能来自旧版本）
  assert.equal(tuningPreset("不存在的调弦").id, "standard");
});

test("调音器：从采样里找基频（静音不硬给一个音）", () => {
  const rate = 8000;
  const e2 = detectPitch(sine(frequencyOfMidi(40), rate), rate);
  assert.ok(Math.abs(e2 - 82.4) < 1.5, `6 弦 E2 读到 ${e2}`);

  const e4 = detectPitch(sine(frequencyOfMidi(64), rate), rate);
  assert.ok(Math.abs(e4 - 329.6) < 3, `1 弦 E4 读到 ${e4}`);

  const silent = new Float32Array(2048);
  assert.equal(detectPitch(silent, rate), 0, "静音返回 0");

  const dc = new Float32Array(2048).fill(0.5);
  assert.equal(detectPitch(dc, rate), 0, "纯直流不算音高");

  // 太短的缓冲不猜
  assert.equal(detectPitch(new Float32Array(32), rate), 0);

  // 平滑：取中位数，去掉拨弦瞬间的跳变
  assert.equal(smoothFreqs([82, 500, 83, 82.5]), 82.8);
  assert.equal(smoothFreqs([82, 500, 83]), 83);
  assert.equal(smoothFreqs([0, 0, 110]), 110);
  assert.equal(smoothFreqs([]), 0);
});

/** 造一段「同一个音持续 from→to 秒」的帧。 */
function held(freq: number, from: number, to: number, step = 0.055) {
  const frames: { time: number; freq: number }[] = [];
  for (let t = from; t <= to + 1e-9; t += step) frames.push({ time: Math.round(t * 1000) / 1000, freq });
  return frames;
}

test("扒谱：一串频率切成音，抖动不拆、静音断开", () => {
  const frames = [
    ...held(440, 0, 0.44),
    { time: 0.5, freq: 0 },
    ...held(659.25, 0.55, 1.1),
  ];
  const notes = detectNotes(frames);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].midi, 69, "A4");
  assert.equal(notes[1].midi, 76, "E5");
  assert.ok(Math.abs(notes[0].cents) < 1);
  assert.ok(notes[0].frames >= 3);

  // 同一段里 ±20 音分的抖动算一个音（不拆）
  const jitter = [
    ...held(440, 0, 0.22),
    ...held(445, 0.22, 0.44),
  ];
  assert.equal(detectNotes(jitter).length, 1);

  // 差得太远（纯五度）就断开
  const jump = [...held(440, 0, 0.22), ...held(660, 0.22, 0.44)];
  assert.equal(detectNotes(jump).length, 2);

  // 太短的不算（默认 3 帧）
  assert.equal(detectNotes(held(440, 0, 0.05)).length, 0);

  // 超出 E2–E6 的音不算
  assert.equal(detectNotes(held(frequencyOfMidi(30), 0, 0.4)).length, 0);
});

test("扒谱：秒换成拍，第一个音落在 0 拍", () => {
  const notes = [
    { start: 0, end: 0.2, midi: 64, cents: 0, frames: 5 },
    { start: 0.5, end: 0.7, midi: 67, cents: 0, frames: 5 },
    { start: 1.0, end: 1.2, midi: 60, cents: 0, frames: 5 },
  ];
  // 120 BPM：一拍 0.5 秒，所以正好落在 0 / 1 / 2 拍
  const quantized = quantizeNotes(notes, { bpm: 120, subdivision: 2 });
  assert.deepEqual(
    quantized.map((note) => note.startBeat),
    [0, 1, 2],
  );

  // 没踩在网格上：0.26 秒 = 0.52 拍，吸到 0.5 拍
  const off = quantizeNotes([{ start: 0, end: 0.2, midi: 64, cents: 0, frames: 5 }, { start: 0.26, end: 0.4, midi: 67, cents: 0, frames: 5 }], {
    bpm: 120,
    subdivision: 2,
  });
  assert.equal(off[1].startBeat, 0.5);

  // 挤进同一格的两个音只留一个，不会叠在同一拍上
  const crowd = quantizeNotes(
    [
      { start: 0, end: 0.2, midi: 64, cents: 0, frames: 5 },
      { start: 0.02, end: 0.3, midi: 67, cents: 0, frames: 5 },
    ],
    { bpm: 120, subdivision: 1 },
  );
  assert.equal(crowd.length, 1);

  assert.deepEqual(quantizeNotes([], { bpm: 120 }), []);
});

test("扒谱：MIDI 落到弦和品上，优先低把位", () => {
  assert.deepEqual(positionsFor(64)[0], { s: 1, f: 0 }, "E4 最低的按法是 1 弦空弦");
  assert.equal(positionsFor(64).length, 4, "E4 在 15 品内有四种按法");
  const c4 = positionsFor(60);
  assert.deepEqual(c4[0], { s: 2, f: 1 }, "C4 最低的按法是 2 弦 1 品");
  assert.deepEqual(pickPosition(60, 3), { s: 2, f: 1 }, "低把位优先于「离上一根弦近」");
  assert.equal(pickPosition(100, 0, 15), null, "超出品域就没有按法");
  assert.deepEqual(pickPosition(67, 2), { s: 1, f: 3 }, "G4 是 1 弦 3 品");
});

test("扒谱：整条链路出一张谱，没听清会说出来", () => {
  const frames = [
    ...held(frequencyOfMidi(60), 0, 0.2),
    { time: 0.25, freq: 0 },
    ...held(frequencyOfMidi(64), 0.3, 0.5),
    { time: 0.55, freq: 0 },
    ...held(frequencyOfMidi(67), 0.6, 0.8),
  ];
  const result = transcribeFrames(frames, { bpm: 120, subdivision: 2 });
  assert.equal(result.notes.length, 3);
  assert.equal(result.tab.notes.length, 3);
  assert.deepEqual(
    result.tab.notes.map((note) => `${note.s}:${note.f}`),
    ["2:1", "1:0", "1:3"],
  );
  assert.equal(result.tab.beatsPerBar, 4);
  assert.ok(result.tab.bars >= 1);
  assert.equal(result.warnings.length, 0);

  // 什么都没听到：谱是空的，但话要说清楚
  const empty = transcribeFrames([{ time: 0, freq: 0 }], { bpm: 120 });
  assert.equal(empty.tab.notes.length, 0);
  assert.ok(empty.warnings[0].includes("没听到清楚的音"));

  // 偏得厉害的音会被提醒
  const off = transcribeFrames(held(440 * Math.pow(2, 40 / 1200), 0, 0.4), { bpm: 120 });
  assert.ok(off.warnings.some((line) => line.includes("音分")));
});

test("听辨：音名、音程名、题目里一定有正确答案", () => {
  assert.equal(noteName(64), "E4");
  assert.equal(noteName(40), "E2");
  assert.equal(noteName(61), "C#4");
  assert.equal(midiOf("C4"), 60);
  assert.equal(midiOf("E2"), 40);
  assert.equal(midiOf("Bb3"), 58);
  assert.equal(intervalName(7), "纯五度");
  assert.equal(intervalName(3), "小三度");
  assert.equal(intervalName(13), "13 个半音");

  // 听音辨位：E4 最省手是 1 弦空弦，选项里必须有它、且不重复
  const position = earPositionQuestion(64, 3);
  assert.equal(position.answer, "1 弦空弦");
  assert.equal(position.play[0], 64);
  assert.ok(position.options.some((option) => option.id === position.answer));
  assert.equal(new Set(position.options.map((option) => option.id)).size, position.options.length);
  assert.equal(position.options.length, 4);
  assert.ok(position.hint.includes("E4"));

  // 音程：C4 到 G4 是纯五度
  const interval = earIntervalQuestion(60, 7, 5);
  assert.equal(interval.answer, "纯五度");
  assert.deepEqual(interval.play, [60, 67]);
  assert.ok(interval.options.some((option) => option.id === "纯五度"));
  assert.equal(new Set(interval.options.map((option) => option.id)).size, 4);

  // 5 品内按不出来的音要直接报错，不能悄悄给个错的
  assert.throws(() => earPositionQuestion(36, 1), /按不出来/);
});

test("听辨：同一组题两次一模一样，相邻两题不重样", () => {
  const a = earRound("interval", 42, 6);
  const b = earRound("interval", 42, 6);
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  assert.ok(a.every((question) => question.options.some((option) => option.id === question.answer)));

  const positions = earRound("position", 7, 8);
  assert.equal(positions.length, 8);
  assert.ok(positions.every((question) => question.kind === "position" && question.play.length === 1));
  // 打乱后相邻题不是同一个音（同一套题里不重复出同一个位置）
  const ids = positions.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length);

  // 换种子就换一套题
  assert.notDeepEqual(earRound("interval", 1, 4), earRound("interval", 2, 4));
});

test("听辨：级数判断先给主音，第 3 级就是大三度", () => {
  assert.equal(degreeLabel(1), "第 1 级");
  assert.equal(degreeLabel(7), "第 7 级");
  assert.deepEqual([...MAJOR_DEGREES], [0, 2, 4, 5, 7, 9, 11]);

  // C4 主音，第 3 级是 E4（4 个半音）
  const third = earDegreeQuestion(60, 3, 2);
  assert.equal(third.kind, "degree");
  assert.equal(third.answer, "第 3 级");
  assert.deepEqual(third.play, [60, 64]);
  assert.equal(third.options.length, 4);
  assert.ok(third.options.some((option) => option.id === "第 3 级"));
  assert.equal(new Set(third.options.map((option) => option.id)).size, 4);
  assert.ok(third.hint.includes("E4"));
  assert.ok(third.hint.includes("4 个半音"));

  // 第 7 级是 B4（11 个半音），主音自己也在选项里能出现，但答案不会是 1 级
  const seventh = earDegreeQuestion(60, 7, 2);
  assert.deepEqual(seventh.play, [60, 71]);
  assert.equal(seventh.answer, "第 7 级");
  assert.ok(!seventh.options.some((option) => option.id === "第 7 级" && option.id !== seventh.answer));

  assert.throws(() => earDegreeQuestion(60, 8), /级数要 1–7/);

  const round = earRound("degree", 9, 8);
  assert.equal(round.length, 8);
  assert.ok(round.every((question) => question.kind === "degree" && question.play.length === 2));
  assert.ok(round.every((question) => question.play[1] > question.play[0]));
  assert.ok(round.every((question) => question.play[1] - question.play[0] <= 11));
  assert.ok(round.every((question) => question.options.some((option) => option.id === question.answer)));
  // 相邻两题的级数不重复
  for (let i = 1; i < round.length; i += 1) {
    assert.notEqual(round[i].answer, round[i - 1].answer);
  }
  assert.deepEqual(earRound("degree", 9, 8), round);
  assert.notDeepEqual(earRound("degree", 10, 8), round);
});

test("听辨：级数走向把和弦拆成三个音，1 级大三、6 级小三", () => {
  // 1 级是大三（C–E–G），6 级是小三（A–C–E）
  assert.deepEqual(degreeChord(48, 1), [48, 52, 55]);
  assert.deepEqual(degreeChord(48, 6), [57, 60, 64]);
  // 7 级是减三（B–D–F）
  assert.deepEqual(degreeChord(48, 7), [59, 62, 65]);

  const question = earProgressionQuestion(48, [1, 5, 6, 4], 3);
  assert.equal(question.kind, "progression");
  assert.equal(question.answer, "1–5–6–4");
  assert.equal(question.play.length, 12);
  assert.deepEqual(question.play.slice(0, 3), [48, 52, 55]);
  assert.deepEqual(question.play.slice(3, 6), [55, 59, 62]);
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options.map((option) => option.id)).size, 4);
  assert.ok(question.options.some((option) => option.id === "1–5–6–4"));
  assert.ok(question.hint.includes("1–5–6–4"));

  assert.throws(() => earProgressionQuestion(48, [1]), /至少要两个和弦/);

  // 一轮八题：每题的答案都在选项里、走向都来自表里、相邻两题不重样
  const round = earRound("progression", 11, 8);
  assert.equal(round.length, 8);
  assert.ok(round.every((item) => item.kind === "progression" && item.play.length % 3 === 0));
  assert.ok(
    round.every((item) => DEGREE_PROGRESSIONS.some((progression) => progression.label === item.answer)),
  );
  assert.ok(round.every((item) => item.options.some((option) => option.id === item.answer)));
  for (let i = 1; i < round.length; i += 1) {
    assert.notEqual(round[i].answer, round[i - 1].answer);
  }
  assert.deepEqual(earRound("progression", 11, 8), round);
  assert.notDeepEqual(earRound("progression", 12, 8), round);
});

test("听和弦：大三、小三、七和弦都认得，转位靠最低音", () => {
  const c = detectChord([60, 64, 67]);
  assert.ok(c);
  assert.equal(c.label, "C");
  assert.equal(c.name, "大三和弦");
  assert.equal(c.inversion, 0);
  assert.equal(c.bassName, "C");

  // 第一转位：最低音是 E，根音还是 C
  const first = detectChord([64, 67, 72]);
  assert.ok(first);
  assert.equal(first.label, "C");
  assert.equal(first.inversion, 1);
  assert.equal(first.bassName, "E");

  assert.equal(detectChord([57, 60, 64])?.label, "Am");
  assert.equal(detectChord([62, 65, 69])?.label, "Dm");
  assert.equal(detectChord([55, 59, 62, 65])?.label, "G7");
  assert.equal(detectChord([60, 64, 67, 71])?.label, "Cmaj7");
  assert.equal(detectChord([57, 60, 64, 67])?.label, "Am7");

  // 挂四、减三、强力和弦
  assert.equal(detectChord([60, 65, 67])?.label, "Csus4");
  assert.equal(detectChord([60, 63, 66])?.label, "Cdim");
  assert.equal(detectChord([40, 47])?.label, "E5");

  // 一个音不叫和弦；没听过的音级也认不出来
  assert.equal(detectChord([60]), null);
  assert.equal(detectChord([60, 61]), null);
});

test("听和弦：频谱折成 12 个音级，C 大三和弦认成 C", () => {
  const sampleRate = 48000;
  const fftSize = 4096;
  const bins = fftSize / 2;
  const spectrum = new Array<number>(bins).fill(0);
  // C3 / E3 / G3 的基频与两个泛音
  for (const freq of [130.81, 164.81, 196.0]) {
    for (const multiple of [1, 2, 3]) {
      const index = Math.round((freq * multiple * fftSize) / sampleRate);
      spectrum[index] += 1 / multiple;
    }
  }
  const chroma = chromaOfSpectrum(spectrum, sampleRate, fftSize);
  assert.equal(chroma.length, 12);
  assert.ok(Math.abs(Math.max(...chroma) - 1) < 1e-9);
  // 12 个音级里 C(0) / E(4) / G(7) 最亮
  const ranked = chroma
    .map((value, pc) => ({ pc, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => item.pc)
    .sort((a, b) => a - b);
  assert.deepEqual(ranked, [0, 4, 7]);

  const chord = detectChordFromChroma(chroma, 0);
  assert.ok(chord);
  assert.equal(chord.label, "C");
  assert.equal(chord.inversion, 0);

  // 静音：全 0 不能硬给一个和弦
  assert.equal(detectChordFromChroma(new Array(12).fill(0)), null);
  assert.equal(detectChordFromChroma([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), null);
});

test("听和弦：缺了哪个音要说得出来，多出来的音也要点出来", () => {
  // Cmaj7 的五度音很弱（0.2 < PRESENT 的 0.3）：三音和弦凑不齐（只剩 C/E 两个），
  // 四音和弦听到三个就够认，于是认成 Cmaj7，并指出缺的是五度
  const weakFifth = new Array<number>(12).fill(0);
  weakFifth[0] = 1;
  weakFifth[4] = 1;
  weakFifth[11] = 1;
  weakFifth[7] = 0.2;
  const chord = detectChordFromChroma(weakFifth, 0);
  assert.ok(chord);
  assert.equal(chord.label, "Cmaj7");
  assert.deepEqual(chord.missing, [7]);
  assert.deepEqual(chord.extra, []);

  // 多按了一个 F#（6）：和 C 大三和弦凑不成别的和弦，于是仍认 C，但把多出来的音报出来
  const withExtra = new Array<number>(12).fill(0);
  withExtra[0] = 1;
  withExtra[4] = 1;
  withExtra[7] = 1;
  withExtra[6] = 0.8;
  const noisy = detectChordFromChroma(withExtra, 0);
  assert.ok(noisy);
  assert.equal(noisy.label, "C");
  assert.deepEqual(noisy.extra, [6]);
  assert.ok(noisy.score < 0.5, "多出来的音要扣分");

  // 什么都不缺时两个数组都是空的
  const clean = new Array<number>(12).fill(0);
  clean[0] = 1;
  clean[4] = 1;
  clean[7] = 1;
  const full = detectChordFromChroma(clean, 0);
  assert.ok(full);
  assert.deepEqual(full.missing, []);
  assert.deepEqual(full.extra, []);
});

test("听辨：和弦性质听的是三个音一起响，四种性质轮着出", () => {
  // 四种性质的三度叠法
  const byId = new Map(EAR_QUALITIES.map((item) => [item.id, item.intervals]));
  assert.deepEqual(byId.get("major"), [0, 4, 7]);
  assert.deepEqual(byId.get("minor"), [0, 3, 7]);
  assert.deepEqual(byId.get("dim"), [0, 3, 6]);
  assert.deepEqual(byId.get("aug"), [0, 4, 8]);

  // C4 上的小三和弦：三个音一起给，选项是四种性质
  const minor = earQualityQuestion(60, "minor", 3);
  assert.equal(minor.kind, "quality");
  assert.deepEqual(minor.play, [60, 63, 67]);
  assert.equal(minor.answer, "小三和弦");
  assert.equal(minor.options.length, 4);
  assert.equal(new Set(minor.options.map((option) => option.id)).size, 4);
  assert.ok(minor.options.some((option) => option.id === "小三和弦"));
  assert.ok(minor.hint.includes("3 + 4"));

  // 同一个种子两次一模一样，换种子换选项顺序
  assert.deepEqual(earQualityQuestion(60, "dim", 5), earQualityQuestion(60, "dim", 5));

  assert.throws(() => earQualityQuestion(60, "whatever" as never), /没有这种性质/);

  // 一轮 8 题：都是三音、相邻两题不是同一种性质
  const round = earRound("quality", 11, 8);
  assert.equal(round.length, 8);
  assert.ok(round.every((question) => question.kind === "quality" && question.play.length === 3));
  assert.ok(round.every((question) => question.options.some((option) => option.id === question.answer)));
  for (let i = 1; i < round.length; i += 1) {
    assert.notEqual(round[i].answer, round[i - 1].answer);
  }
});

test("听辨：和弦性质第二档换成七和弦，四个音一起响", () => {
  // 七和弦的叠法：大三/小三 + 小七度或大七度
  const byId = new Map(EAR_QUALITIES.map((item) => [item.id, item.intervals]));
  assert.deepEqual(byId.get("major7"), [0, 4, 7, 11]);
  assert.deepEqual(byId.get("minor7"), [0, 3, 7, 10]);
  assert.deepEqual(byId.get("dominant7"), [0, 4, 7, 10]);

  // 两档互不串味：三和弦那档不会出七和弦，七和弦那档也不会出三和弦
  assert.deepEqual(
    QUALITY_SETS.triad.map((item) => item.id),
    ["major", "minor", "dim", "aug"],
  );
  assert.deepEqual(
    QUALITY_SETS.seventh.map((item) => item.id),
    ["major7", "minor7", "dominant7"],
  );

  // C4 上的属七：四个音一起给，选项只从七和弦里出
  const dominant = earQualityQuestion(60, "dominant7", 3, "seventh");
  assert.deepEqual(dominant.play, [60, 64, 67, 70]);
  assert.equal(dominant.answer, "属七和弦");
  assert.equal(dominant.options.length, 3);
  assert.ok(dominant.options.every((option) => /七和弦$/.test(option.id)));
  assert.ok(dominant.hint.includes("想解决"));

  // 一轮 8 题全是四个音，且相邻两题不考同一种
  const round = earRound("quality", 7, 8, { qualitySet: "seventh" });
  assert.equal(round.length, 8);
  assert.ok(round.every((question) => question.play.length === 4));
  assert.ok(round.every((question) => question.options.some((option) => option.id === question.answer)));
  for (let i = 1; i < round.length; i += 1) {
    assert.notEqual(round[i].answer, round[i - 1].answer);
  }
});

test("听辨：和弦性质第三档是挂留与强力，没有三度所以听不出大小", () => {
  // 挂二、挂四是三度被顶替，强力干脆只有根音和五度
  const byId = new Map(EAR_QUALITIES.map((item) => [item.id, item.intervals]));
  assert.deepEqual(byId.get("sus2"), [0, 2, 7]);
  assert.deepEqual(byId.get("sus4"), [0, 5, 7]);
  assert.deepEqual(byId.get("power"), [0, 7]);

  assert.deepEqual(
    QUALITY_SETS.open.map((item) => item.id),
    ["sus2", "sus4", "power"],
  );
  // 挂留不属于三和弦那档（它们不是三度叠起来的）
  assert.ok(!QUALITY_SETS.triad.some((item) => item.id === "sus4"));

  // C4 上的挂四：三个音一起给，选项只从这一档里出
  const sus = earQualityQuestion(60, "sus4", 5, "open");
  assert.deepEqual(sus.play, [60, 65, 67]);
  assert.equal(sus.answer, "挂四和弦");
  assert.equal(sus.options.length, 3);
  assert.ok(sus.options.every((option) => ["挂二和弦", "挂四和弦", "强力和弦"].includes(option.id)));

  // 强力只有两个音
  const power = earQualityQuestion(52, "power", 2, "open");
  assert.deepEqual(power.play, [52, 59]);

  const round = earRound("quality", 9, 8, { qualitySet: "open" });
  assert.equal(round.length, 8);
  assert.ok(round.every((question) => question.play.length === 2 || question.play.length === 3));
  assert.ok(round.every((question) => question.options.length === 3));
  for (let i = 1; i < round.length; i += 1) {
    assert.notEqual(round[i].answer, round[i - 1].answer);
  }
});

test("听和弦：把一个和弦的按法写成谱（不弹的弦不进谱，弦号是反的）", () => {
  const c = CHORD_BY_NAME.get("C")!;
  const tab = chordVoicingTab(c);
  // C 的按法是 x32010：6 弦不弹，所以谱上只有五根弦
  assert.equal(tab.notes.length, 5);
  assert.equal(tab.beatsPerBar, 4);
  assert.equal(tab.bars, 1);
  assert.ok(tab.notes.every((note) => note.beat === 0 && note.dur === 4));
  // frets[1] = 3（5 弦 3 品）→ TabNote.s 是 5
  const fifth = tab.notes.find((note) => note.s === 5);
  assert.equal(fifth?.f, 3);
  // 1 弦空弦（frets[5] = 0）→ s = 1、f = 0
  const first = tab.notes.find((note) => note.s === 1);
  assert.equal(first?.f, 0);
  // 谱子下面那句话带按法
  assert.ok(tab.caption?.includes("x32010"));

  // D 的按法是 xx0232：只有四根弦
  const d = chordVoicingTab(CHORD_BY_NAME.get("D")!);
  assert.equal(d.notes.length, 4);
  assert.deepEqual(d.notes.map((note) => note.s).sort(), [1, 2, 3, 4]);
});

test("听和弦：同一个和弦能写成扫弦，也能写成一根弦一拍的分解", () => {
  const c = CHORD_BY_NAME.get("C")!;
  const strum = chordPatternTab(c, "strum");
  assert.ok(strum.notes.every((note) => note.beat === 0));
  assert.ok(strum.caption?.endsWith("扫弦"));

  const arp = chordPatternTab(c, "arpeggio");
  assert.equal(arp.notes.length, 5);
  // 一根弦一拍，从低音往高音走
  assert.deepEqual(
    arp.notes.map((note) => note.beat),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    arp.notes.map((note) => note.s),
    [5, 4, 3, 2, 1],
  );
  assert.ok(arp.notes.every((note) => note.dur === 1));
  // 五根弦超过 4/4 一小节的四拍，所以折成两小节
  assert.equal(arp.bars, 2);
  assert.ok(arp.caption?.endsWith("分解"));
  // 默认还是扫弦
  assert.ok(chordPatternTab(c).notes.every((note) => note.beat === 0));
});

test("听和弦：一段扫弦按时间切成几个和弦，空拍不算进去", () => {
  // 一帧 = 一个和弦的组成音，值都是 1（页面里是归一化之后的频谱强度）
  const frame = (pcs: number[]) => {
    const out = new Array(12).fill(0);
    for (const pc of pcs) out[((pc % 12) + 12) % 12] = 1;
    return out;
  };
  const silent = new Array(12).fill(0);
  const C = frame([0, 4, 7]);
  const Am = frame([9, 0, 4]);
  const G = frame([7, 11, 2]);

  // 6 帧 C、1 帧过渡（两半混着）、6 帧 Am、3 帧静音、6 帧 G
  const mixed = C.map((value, index) => (value + Am[index]) / 2);
  const chromas = [
    ...Array.from({ length: 6 }, () => C),
    mixed,
    ...Array.from({ length: 6 }, () => Am),
    ...Array.from({ length: 3 }, () => silent),
    ...Array.from({ length: 6 }, () => G),
  ];
  const segments = segmentChords(chromas, 0.1);
  assert.deepEqual(
    segments.map((segment) => segment.chord?.label ?? "?"),
    ["C", "Am", "G"],
  );
  // 时间轴按帧算：C 从 0 到 0.7（那帧「过渡」两半混着，还是更像 C，被并进来），
  // Am 从 0.7 到 1.3
  assert.equal(segments[0].start, 0);
  assert.equal(segments[0].end, 0.7);
  assert.equal(segments[1].start, 0.7);
  assert.equal(segments[1].end, 1.3);
  // 静音那三帧之后才开始 G
  assert.ok(segments[2].start >= 1.6);

  // 太短的段不算：只有 2 帧（0.2 秒）的 Am 被丢掉
  const short = segmentChords([...Array.from({ length: 6 }, () => C), ...Array.from({ length: 2 }, () => Am)], 0.1);
  assert.deepEqual(short.map((segment) => segment.chord?.label), ["C"]);

  // 帧率不合法 / 没有帧
  assert.deepEqual(segmentChords([], 0.1), []);
  assert.deepEqual(segmentChords([C], 0), []);
});

test("听和弦：认出来的和弦能还原成音，一串和弦能写成一页谱", () => {
  const c = detectChord([48, 52, 55])!;
  // C 大三：根音落在第 3 八度（C3 = 48）
  assert.deepEqual(chordMidis(c), [48, 52, 55]);
  // 换一个八度整体上移 12
  assert.deepEqual(chordMidis(c, 4), [60, 64, 67]);
  // 第一转位（最低音是 E）：低音要挪到根音下面
  const first = detectChord([52, 55, 60])!;
  assert.equal(first.inversion, 1);
  assert.deepEqual(chordMidis(first), [52, 55, 60]);
  // 小三 / 属七的模板
  assert.deepEqual(qualityIntervals("minor"), [0, 3, 7]);
  assert.deepEqual(qualityIntervals("dominant7"), [0, 4, 7, 10]);
  assert.deepEqual(qualityIntervals("power"), [0, 7]);

  // 两个和弦 → 一小节两个半音符（第一拍、第三拍各一个）
  const am = detectChord([45, 48, 52])!;
  const tab = sequenceTabOf([c, am]);
  assert.equal(tab.beatsPerBar, 4);
  assert.equal(tab.bars, 1);
  assert.equal(tab.caption, "C–Am");
  const firstBar = tab.notes.filter((note) => note.beat === 0);
  const secondBar = tab.notes.filter((note) => note.beat === 2);
  assert.equal(firstBar.length, 3);
  assert.equal(secondBar.length, 3);
  assert.ok(firstBar.every((note) => note.dur === 2));
  // 根音落位：C 的根音在 5 弦 3 品，Am 的根音（A3）落在 3 弦 2 品
  assert.ok(firstBar.some((note) => note.s === 5 && note.f === 3));
  assert.ok(secondBar.some((note) => note.s === 3 && note.f === 2));
  // 没有和弦就不给谱
  assert.throws(() => sequenceTabOf([]), /没有和弦/);
  // 速度可以定：谱头按这个画 ♩=96，跟练也从这里起步（v0.88.0）
  const timed = sequenceTabOf([c, am], 4, 96);
  assert.deepEqual(timed.bpm, [96, 96]);
  assert.deepEqual(sequenceTabOf([c, am]).bpm, [70, 70]);
  assert.equal(sequenceTabOf([c, am], 3, 84).beatsPerBar, 3);
});

test("听和弦：一串和弦按成谱时，一根弦不会按两个品", () => {
  const c = detectChord([48, 52, 55])!;
  const am = detectChord([45, 48, 52])!;
  const g = detectChord([43, 47, 50])!;
  const tab = sequenceTabOf([c, am, g]);
  assert.equal(tab.bars, 2);
  // 每一小节里弦号不能重复（同一根弦同一拍按不了两个品）
  for (const beat of [0, 2, 4]) {
    const notes = tab.notes.filter((note) => note.beat === beat);
    const strings = notes.map((note) => note.s);
    assert.equal(new Set(strings).size, strings.length, `第 ${beat} 拍有重复的弦`);
    assert.ok(notes.length >= 3);
  }
  // C 和 Am 都该是「手不用张开」的常用按法：品格跨度不超过 3
  for (const beat of [0, 2]) {
    const frets = tab.notes.filter((note) => note.beat === beat).map((note) => note.f);
    assert.ok(Math.max(...frets) - Math.min(...frets) <= 3);
  }
  // voicingOf 也能单独用：C 大三落在 5:3 / 4:2 / 3:0
  assert.deepEqual(voicingOf([48, 52, 55]), [
    { s: 5, f: 3 },
    { s: 4, f: 2 },
    { s: 3, f: 0 },
  ]);
  // 超出品域的音就没有按法
  assert.deepEqual(voicingOf([20]), []);
});

test("听和弦：切段按真实时长写谱，拖长的地方谱上也长", () => {
  const c = detectChord([48, 52, 55])!;
  const am = detectChord([45, 48, 52])!;
  const g = detectChord([43, 47, 50])!;
  // 60 BPM：1 秒正好 1 拍
  const tab = segmentTabOf(
    [
      { start: 0, end: 1, chord: c },
      { start: 1, end: 2, chord: am },
      { start: 2, end: 4, chord: g },
    ],
    { bpm: 60, beatsPerBar: 4 },
  );
  assert.equal(tab.bpm?.[0], 60);
  assert.equal(tab.beatsPerBar, 4);
  // 三个和弦分别落在 0 / 1 / 2 拍，最后一个拖两拍
  const onsets = [...new Set(tab.notes.map((note) => note.beat))].sort((a, b) => a - b);
  assert.deepEqual(onsets, [0, 1, 2]);
  assert.deepEqual(
    onsets.map((beat) => tab.notes.find((note) => note.beat === beat)?.dur),
    [1, 1, 2],
  );
  // 总长 4 拍 → 一小节；拖到 5 拍就要两小节
  assert.equal(tab.bars, 1);
  const longer = segmentTabOf([{ start: 0, end: 5, chord: c }], { bpm: 60, beatsPerBar: 4 });
  assert.equal(longer.bars, 2);
  // 第一个和弦从 0 拍起，不管它实际在几秒
  const late = segmentTabOf([{ start: 3.2, end: 4.2, chord: c }], { bpm: 60 });
  assert.equal(late.notes[0].beat, 0);
  // 中间空一拍：后面的和弦不会被压到前一段结尾之前，但也不会挤在一起
  const gap = segmentTabOf(
    [
      { start: 0, end: 1, chord: c },
      { start: 3, end: 4, chord: am },
    ],
    { bpm: 60 },
  );
  assert.deepEqual(
    [...new Set(gap.notes.map((note) => note.beat))].sort((a, b) => a - b),
    [0, 3],
  );
  assert.throws(() => segmentTabOf([{ start: 0, end: 1, chord: null }]), /没有和弦/);
});

test("听和弦：切段带上低音，同一组音也能分出转位", () => {
  // 同样的 C 大三和弦，第一段低音是 C，第二段低音换成 E
  const cChroma = Array.from({ length: 12 }, (_, pc) => (pc === 0 || pc === 4 || pc === 7 ? 1 : 0));
  const chromas = [cChroma, cChroma, cChroma, cChroma, cChroma, cChroma, cChroma, cChroma];
  const basses = [0, 0, 0, 0, 4, 4, 4, 4];
  const segments = segmentChords(chromas, 0.1, { basses, threshold: 0.86 });
  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((segment) => segment.chord?.bass),
    [0, 4],
  );
  assert.deepEqual(
    segments.map((segment) => segment.chord?.inversion),
    [0, 1],
  );
  const steps = bassLineOf(segments.map((segment) => segment.chord!));
  assert.deepEqual(
    steps.map((step) => step.bassName),
    ["C", "E"],
  );
  assert.deepEqual(
    steps.map((step) => step.moved),
    [false, true],
  );
  // 不给低音就还是一段（同名和弦照旧合并）
  const withoutBass = segmentChords(chromas, 0.1);
  assert.equal(withoutBass.length, 1);
  // 写谱时的名字要带上低音，不然卡片上会是三个一模一样的 C
  const tab = segmentTabOf(segments, { bpm: 60 });
  assert.equal(tab.caption, "C–C/E");
  assert.equal(chordLabelOf(detectChord([48, 52, 55])!), "C");
  assert.equal(chordLabelOf(detectChord([52, 55, 60])!), "C/E");
});

test("听和弦：按你弹的速度估 BPM，太快太慢会换个「几拍一个和弦」", () => {
  const c = detectChord([48, 52, 55])!;
  const am = detectChord([45, 48, 52])!;
  // 每段 2 秒、按一小节 4 拍算 → 120 BPM
  const two = estimateTempo([
    { start: 0, end: 2, chord: c },
    { start: 2, end: 4, chord: am },
  ]);
  assert.equal(two?.bpm, 120);
  assert.equal(two?.beatsPerChord, 4);
  assert.equal(two?.seconds, 2);
  assert.equal(two?.confident, true);
  // 每段 4 秒 → 60 BPM
  assert.equal(estimateTempo([{ start: 0, end: 4, chord: c }])?.bpm, 60);
  // 每段 1 秒：按 4 拍算要 240（超过 200），改成 2 拍一个和弦 → 120
  const fast = estimateTempo([
    { start: 0, end: 1, chord: c },
    { start: 1, end: 2, chord: am },
  ]);
  assert.equal(fast?.bpm, 120);
  assert.equal(fast?.beatsPerChord, 2);
  // 每段 8 秒：按 4 拍算只有 30，翻倍成 8 拍一个和弦 → 60
  const slow = estimateTempo([
    { start: 0, end: 8, chord: c },
    { start: 8, end: 16, chord: am },
  ]);
  assert.equal(slow?.bpm, 60);
  assert.equal(slow?.beatsPerChord, 8);
  // 只有一段：能估但不可信；一段都没有 → null
  assert.equal(estimateTempo([{ start: 0, end: 2, chord: c }])?.confident, false);
  assert.equal(estimateTempo([]), null);
  assert.equal(estimateTempo([{ start: 0, end: 2, chord: null }]), null);
});

test("听和弦：低音走线说清哪几段换了低音", () => {
  const c = detectChord([48, 52, 55])!;
  const firstInversion = detectChord([52, 55, 60])!;
  const secondInversion = detectChord([55, 60, 64])!;
  const steps = bassLineOf([c, firstInversion, secondInversion]);
  assert.deepEqual(
    steps.map((step) => step.bassName),
    ["C", "E", "G"],
  );
  assert.deepEqual(
    steps.map((step) => step.inversion),
    [0, 1, 2],
  );
  // 第一段没有「换」这回事
  assert.deepEqual(
    steps.map((step) => step.moved),
    [false, true, true],
  );
  assert.deepEqual(bassLineOf([]), []);
});

test("听和弦：切段的边界挪到小节线上，同一格的两段并起来", () => {
  const c = detectChord([48, 52, 55])!;
  const am = detectChord([57, 60, 64])!;
  const g = detectChord([55, 59, 62])!;
  // 120 BPM、四拍一个和弦 → 一格 2 秒；起点故意偏一点
  const snapped = snapSegments(
    [
      { start: 0.3, end: 2.1, chord: c, frames: 5 },
      { start: 2.1, end: 4.4, chord: am, frames: 6 },
      { start: 4.4, end: 6.2, chord: g, frames: 5 },
    ],
    { bpm: 120, beatsPerChord: 4 },
  );
  assert.deepEqual(
    snapped.map((segment) => segment.start),
    [0.3, 2.3, 4.3],
  );
  assert.deepEqual(
    snapped.map((segment) => segment.end),
    [2.3, 4.3, 6.3],
  );
  assert.deepEqual(
    snapped.map((segment) => segment.chord?.label),
    ["C", "Am", "G"],
  );

  // 两段落在同一个格点上就并成一段，帧数相加
  const merged = snapSegments(
    [
      { start: 0, end: 0.9, chord: c, frames: 3 },
      { start: 0.4, end: 1.5, chord: c, frames: 4 },
    ],
    { bpm: 120, beatsPerChord: 4 },
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].frames, 7);
  assert.equal(merged[0].end, 2);

  // 没有和弦的段直接丢掉；空数组返回空
  assert.deepEqual(
    snapSegments([{ start: 0, end: 2, chord: null, frames: 2 }], { bpm: 120 }),
    [],
  );
  assert.deepEqual(snapSegments([], { bpm: 120 }), []);
});

test("听和弦：低音换成级数标注，跟着调走", () => {
  // C 大调里 C–Am–G 就是 1–6–5
  assert.equal(degreeInKey(0, 0), 1);
  assert.equal(degreeInKey(9, 0), 6);
  assert.equal(degreeInKey(7, 0), 5);
  assert.equal(degreeInKey(2, 0), 2);

  // 换成 G 调：G 是 1、E 是 6、D 是 5
  assert.equal(degreeInKey(7, 7), 1);
  assert.equal(degreeInKey(4, 7), 6);
  assert.equal(degreeInKey(2, 7), 5);

  // 调外音级返回 0（界面上只写音名，不写数字）
  assert.equal(degreeInKey(1, 0), 0);
  assert.equal(degreeInKey(6, 0), 0);

  // 跨八度、负数音级也要落回 0–11
  assert.equal(degreeInKey(12, 0), 1);
  assert.equal(degreeInKey(-3, 0), 6);
});

test("最卡的地方：按级数归堆，只算最近练过的条目", () => {
  const records = {
    "pattern-a": {
      lastAt: "2026-11-18",
      hardest: { bar: 3, degree: 5, name: "G", count: 4 },
    },
    "pattern-b": {
      lastAt: "2026-11-17",
      hardest: { bar: 1, degree: 5, name: "G", count: 1 },
    },
    "pattern-c": {
      lastAt: "2026-11-16",
      hardest: { bar: 2, degree: 6, name: "Am", count: 2 },
    },
    // 太久了，不算这周
    "pattern-old": {
      lastAt: "2026-10-01",
      hardest: { bar: 2, degree: 1, name: "C", count: 99 },
    },
    // 没记过最卡的地方
    "pattern-plain": { lastAt: "2026-11-18" },
  };

  const tally = hardestTally(records, "2026-11-12");
  // 5 级两次（4 + 1）、6 级一次（2）；1 级那条太旧被排除
  assert.deepEqual(tally, [
    { degree: 5, name: "G", count: 5, items: 2 },
    { degree: 6, name: "Am", count: 2, items: 1 },
  ]);

  // 同分时级数小的排前面（根音更值得先看）
  const tie = hardestTally(
    {
      x: { lastAt: "2026-11-18", hardest: { bar: 1, degree: 6, name: "Am", count: 2 } },
      y: { lastAt: "2026-11-18", hardest: { bar: 1, degree: 2, name: "Dm", count: 2 } },
    },
    "2026-11-01",
  );
  assert.deepEqual(
    tie.map((item) => item.degree),
    [2, 6],
  );

  // 空表、坏数据都不炸
  assert.deepEqual(hardestTally({}, "2026-11-12"), []);
  assert.deepEqual(
    hardestTally({ bad: { lastAt: "2026-11-18", hardest: { bar: 0, degree: 0, name: "", count: 0 } } }, "2026-11-01"),
    [],
  );
});

test("切一段：只留那几拍的音，拍位从 0 开始，时值不超出段尾", () => {
  const tab = tabOf(
    [
      n(5, 3, 0, 4),
      n(4, 2, 0, 4),
      n(3, 2, 4, 4),
      n(2, 1, 4, 4),
      n(6, 3, 8, 4),
      n(5, 2, 8, 4),
    ],
    { beatsPerBar: 4, bars: 3, caption: "C–Am–G" },
  );

  // 切第 2 小节（拍 4–7）
  const second = sliceTab(tab, 4, 4);
  assert.equal(second.bars, 1);
  assert.equal(second.beatsPerBar, 4);
  assert.deepEqual(
    second.notes.map((note) => [note.s, note.f, note.beat]),
    [
      [3, 2, 0],
      [2, 1, 0],
    ],
  );
  assert.equal(second.caption, "C–Am–G");

  // 切两拍：跨出段尾的时值被截到段长，不会画出比听见更长的音
  const head = sliceTab(tab, 0, 2);
  assert.equal(head.notes.length, 2);
  assert.equal(head.notes[0].dur, 2);

  // 空段也能切出一张空谱，不抛
  const empty = sliceTab(tab, 100, 4);
  assert.equal(empty.notes.length, 0);
  assert.equal(empty.bars, 1);
});

test("弹给节拍器听：从能量的上升沿找起音，一个音不会被切成好几个", () => {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * 2);
  const taps = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  for (const at of taps) {
    const start = Math.round(at * sampleRate);
    for (let index = 0; index < 240; index += 1) {
      // 短促的衰减：模拟一下拨弦
      samples[start + index] = Math.sin((index / 8000) * 2 * Math.PI * 440) * Math.exp(-index / 60) * 0.8;
    }
  }

  const onsets = detectOnsets(samples, sampleRate);
  assert.equal(onsets.length, taps.length);
  for (let index = 0; index < taps.length; index += 1) {
    // 上升沿会略微晚于第一个采样，允许 30 毫秒
    assert.ok(Math.abs(onsets[index] - taps[index]) < 0.03, `第 ${index + 1} 下偏了 ${onsets[index] - taps[index]}`);
  }

  // 全是静音：返回空表，不硬报一个「第 0 拍」
  assert.deepEqual(detectOnsets(new Float32Array(sampleRate), sampleRate), []);
});

test("弹给节拍器听：稳的一遍标准差小，越弹越快斜率是负的", () => {
  const bpm = 90;
  const interval = 60 / bpm;
  // 每拍晚 5 毫秒、抖动 ±8 毫秒：整体略拖、但稳
  const jitter = [0, 8, -8, 3, -3, 6, -6, 2];
  const steadyOnsets = jitter.map((offset, index) => index * interval + (5 + offset) / 1000);
  const steady = analyzeTiming(steadyOnsets, bpm, { origin: 0 });
  assert.ok(steady);
  assert.equal(steady!.hits.length, steadyOnsets.length);
  assert.ok(Math.abs(steady!.medianOffsetMs - 5) <= 3, `中位数 ${steady!.medianOffsetMs}`);
  assert.ok(steady!.stdevMs < 15, `标准差 ${steady!.stdevMs}`);
  assert.ok(Math.abs(steady!.driftMsPerBeat) < 2, `漂移 ${steady!.driftMsPerBeat}`);

  // 12 下、每拍提前 4 毫秒：越弹越快
  const rush = Array.from({ length: 12 }, (_, index) => index * interval - (index * 4) / 1000);
  const rushing = analyzeTiming(rush, bpm, { origin: 0 });
  assert.ok(rushing);
  assert.ok(rushing!.driftMsPerBeat < -3, `漂移 ${rushing!.driftMsPerBeat}`);
  assert.match(rushing!.verdict, /越弹越快/);
  assert.match(rushing!.suggestion, /慢一点|降 10 BPM/);

  // 不传原点 = 跟着自己弹：中位数只会在 0 附近，标准差和漂移仍有意义
  const selfPaced = analyzeTiming(steadyOnsets, bpm);
  assert.ok(selfPaced);
  assert.ok(Math.abs(selfPaced!.medianOffsetMs) <= 1, `中位数 ${selfPaced!.medianOffsetMs}`);
  assert.ok(selfPaced!.stdevMs < 15);
});

test("弹给节拍器听：预备拍不进统计，离谱的一下丢掉，太短不给结论", () => {
  const bpm = 120;
  const interval = 60 / bpm;
  const onsets = [0, interval, interval * 2, interval * 3];
  // 第 4 下之后插一下「手滑」（离拍子快半拍），再接上后面的
  onsets.push(interval * 5 - interval * 0.5);
  for (let index = 5; index < 10; index += 1) onsets.push(index * interval);

  const report = analyzeTiming(onsets, bpm, { beatsPerBar: 4 });
  assert.ok(report);
  assert.equal(report!.dropped, 1);
  assert.equal(report!.hits.length, onsets.length - 1);
  assert.deepEqual(
    report!.hits.map((hit) => [hit.beat, hit.bar, hit.beatInBar]),
    [
      [1, 1, 0],
      [2, 1, 1],
      [3, 1, 2],
      [4, 1, 3],
      [6, 2, 1],
      [7, 2, 2],
      [8, 2, 3],
      [9, 3, 0],
      [10, 3, 1],
    ],
  );

  // 预备拍：前两拍不计入 offsets
  const withCountIn = analyzeTiming(onsets, bpm, { beatsPerBar: 4, countInBeats: 2 });
  assert.equal(withCountIn!.offsets.length, report!.offsets.length - 2);

  // 忽早忽晚：抖动比整体偏移还大时，先说「稳」的问题，不要让用户以为自己只是拖了
  const wildOnsets = [0, 80, -70, 60, -75, 70, -60, 85].map((offset, index) => interval * index + offset / 1000);
  const wild = analyzeTiming(wildOnsets, bpm, { origin: 0 });
  assert.ok(wild);
  assert.ok(wild!.stdevMs > 28, `标准差 ${wild!.stdevMs}`);
  assert.match(wild!.verdict, /忽早忽晚/);
  assert.match(wild!.suggestion, /稳|慢一点/);

  // 前后两半各自的标准差：后半段开始抖，前半段是稳的
  const tired = [0, 3, -3, 2, -2, 30, -30, 28].map((offset, index) => interval * index + offset / 1000);
  const tiredReport = analyzeTiming(tired, bpm, { origin: 0 });
  assert.ok(tiredReport);
  assert.ok(tiredReport!.stdevFirstHalfMs < 5, `前半 ${tiredReport!.stdevFirstHalfMs}`);
  assert.ok(tiredReport!.stdevSecondHalfMs > 20, `后半 ${tiredReport!.stdevSecondHalfMs}`);

  // 少于 4 下：不给结论
  assert.equal(analyzeTiming([0, interval], bpm), null);
  assert.equal(analyzeTiming(onsets, 0), null);
});







