import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHORDS,
  CHORD_BY_NAME,
  EMPTY_PROGRESS,
  FLAT_NAMES,
  KEY_BY_ID,
  SCALE_BY_ID,
  SHARP_NAMES,
  STANDARD_TUNING,
  applyAttempt,
  cellKey,
  chordInfo,
  completedCount,
  dailyPuzzle,
  dailySpecFor,
  dateKeyOf,
  dayNumberOf,
  diatonicNames,
  expectedNameMap,
  fingeringOf,
  fromLegacyBest,
  generatePuzzle,
  isPerfect,
  isUnlocked,
  isValidDateKey,
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


