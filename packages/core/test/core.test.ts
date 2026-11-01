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
  assert.equal(slowWrong.lastAt, 111);

  // 全对但超时 -> 2 星，并且记下用时
  const slowPerfect = applyAttempt(slowWrong, fakeResult(18, 0, 0, 0), {
    elapsedMs: 120000, strictSpelling: false, parMs: L01_PAR, at: 222,
  });
  assert.equal(slowPerfect.stars, 2);
  assert.equal(slowPerfect.bestMs, 120000);

  // 再次全对且更快 -> 3 星
  const fastPerfect = applyAttempt(slowPerfect, fakeResult(18, 0, 0, 0), {
    elapsedMs: 40000, strictSpelling: false, parMs: L01_PAR, at: 333,
  });
  assert.equal(fastPerfect.stars, 3);
  assert.equal(fastPerfect.bestMs, 40000);
  assert.equal(fastPerfect.attempts, 3);
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
    L01: { completed: true, stars: 3, bestMs: 40000, attempts: 2, lastAt: 1 },
    L02: { completed: true, stars: 1, bestMs: null, attempts: 3, lastAt: 2 },
    L03: { ...EMPTY_PROGRESS, attempts: 1 },
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

  const empty = summarizeProgress(ids, {});
  assert.equal(empty.completed, 0);
  assert.equal(empty.averageStars, 0);
  assert.equal(empty.maxStars, 9);
});
