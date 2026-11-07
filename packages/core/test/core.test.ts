import test from "node:test";
import assert from "node:assert/strict";
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
  stageForCompleted,
  techniqueById,
  techniquesOf,
  RHYTHM_DRILLS,
  READING_DRILLS,
  STRUM_LIBRARY,
  STRUM_DRILLS,
  SONG_SNIPPETS,
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

test("跟读练习：来自视频板书，单线 X，拍位合法", () => {
  assert.ok(READING_DRILLS.length >= 16, `跟读练习太少：${READING_DRILLS.length}`);
  assert.equal(
    new Set(READING_DRILLS.map((drill) => drill.id)).size,
    READING_DRILLS.length,
    "id 不能重复",
  );

  for (const drill of READING_DRILLS) {
    assert.equal(drill.tab.display, "rhythm", `${drill.name} 应该用单线 X`);
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

test("扫弦练习：24 条，格子数与拍号一致，切音位置合法", () => {
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
    assert.ok(drill.level >= 1 && drill.level <= 5);
    assert.ok(drill.mutes.length > 0 || drill.no !== 1, "练习 1 应该有切音");
    for (const index of drill.mutes) {
      assert.ok(index >= 0 && index < drill.slots.length, `${drill.name} 切音位置越界`);
      assert.ok(drill.slots[index], `${drill.name} 切音必须落在扫弦格上`);
    }
    // 6/8 以八分音符为一拍：一小节 6 格、每格一拍
    const perBar = drill.meter === "6/8" ? 6 : drill.beatsPerBar * 2;
    assert.equal(drill.slots.length, perBar, `${drill.name} 格子数应该等于一小节的格数`);
    assert.ok(drill.slots.some(Boolean), `${drill.name} 一个扫都没有`);

    const limit = drill.tab.bars * drill.tab.beatsPerBar;
    const onsets = new Set<number>();
    for (const note of drill.tab.notes) {
      assert.ok(note.beat >= 0 && note.beat < limit, `${drill.name} 有音跑出小节`);
      assert.ok(note.dur > 0);
      assert.ok(note.arrow === "D" || note.arrow === "U", `${drill.name} 弦上没有箭头`);
      onsets.add(note.beat);
    }
    const strums = drill.slots.filter(Boolean).length * drill.tab.bars;
    assert.equal(onsets.size, strums, `${drill.name} 扫的次数对不上格子`);
  }

  // 6/8 那条：每格一拍，节拍器正好一下一格
  const six = STRUM_DRILLS.find((drill) => drill.no === 14)!;
  assert.equal(six.meter, "6/8");
  assert.equal(six.beatsPerBar, 6);
  assert.equal(six.bpm, 80);

  // 2/4 那条：一小节 4 个八分
  const two = STRUM_DRILLS.find((drill) => drill.no === 1)!;
  assert.equal(two.beatsPerBar, 2);
  assert.equal(two.slots.length, 4);
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


