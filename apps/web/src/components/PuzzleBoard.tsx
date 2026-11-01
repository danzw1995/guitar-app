import { useMemo } from "react";
import {
  STANDARD_TUNING,
  cellKey,
  expectedNameMap,
  midiAt,
  pitchClassAt,
  type AttemptResult,
  type Cell,
  type Puzzle,
} from "@guitar/core";
import Fretboard from "./Fretboard";
import { cellLabel, octaveShiftFor } from "../lib/labels";
import type { Settings } from "../lib/storage";

export type BoardMode = "levels" | "daily" | "recall";

export interface PuzzleBoardProps {
  puzzle: Puzzle;
  mode: BoardMode;
  answers: Record<string, string>;
  result: AttemptResult | null;
  settings: Settings;
  /** 当前调的主音，用于首调唱名。 */
  tonicPc: number;
  /** 推算模式那一格提示的级数（`1` / `do` …）。 */
  anchorLabel: string;
  onPickCell: (cell: Cell) => void;
}

/**
 * 题目板：把 puzzle + 作答状态渲染成指板。
 *
 * 三种模式的差别只在这里：
 * - 主线/每日：非目标格不显示、不可点，目标格显示 `?`；
 * - 推算模式：不画 `?`，所有格子可点，提示格显示级数。
 */
export default function PuzzleBoard({
  puzzle,
  mode,
  answers,
  result,
  settings,
  tonicPc,
  anchorLabel,
  onPickCell,
}: PuzzleBoardProps) {
  const expected = useMemo(() => expectedNameMap(puzzle), [puzzle]);
  const givenKeys = useMemo(() => new Set(puzzle.givens.map(cellKey)), [puzzle]);
  const targetKeys = useMemo(() => new Set(puzzle.target.map(cellKey)), [puzzle]);
  const statusByKey = useMemo(() => {
    const m = new Map<string, AttemptResult["cells"][number]["status"]>();
    result?.cells.forEach((c) => m.set(cellKey(c.cell), c.status));
    return m;
  }, [result]);

  return (
    <Fretboard
      fretMin={puzzle.fretMin}
      fretMax={puzzle.fretMax}
      renderCell={(s, f) => {
        const k = `${s}:${f}`;
        if (givenKeys.has(k)) {
          // 推算模式：那一格显示的是级数（1 / do），不是音名——给了音名就没得推了
          if (mode === "recall") return anchorLabel;
          const pc = pitchClassAt(STANDARD_TUNING, s, f);
          return cellLabel(expected.get(pc) ?? "", pc, tonicPc, settings).main;
        }
        if (answers[k]) return answers[k];
        if (mode === "recall") return "";
        if (targetKeys.has(k)) return "?";
        return "";
      }}
      renderCellSub={(s, f) => {
        if (mode === "recall") return null;
        const k = `${s}:${f}`;
        if (!givenKeys.has(k)) return null;
        const pc = pitchClassAt(STANDARD_TUNING, s, f);
        return cellLabel(expected.get(pc) ?? "", pc, tonicPc, settings).sub;
      }}
      octaveShift={(s, f) => {
        if (mode === "recall") return 0;
        const k = `${s}:${f}`;
        if (!givenKeys.has(k)) return 0;
        return octaveShiftFor(midiAt(STANDARD_TUNING, s, f), tonicPc, settings);
      }}
      cellClass={(s, f) => {
        const k = `${s}:${f}`;
        if (givenKeys.has(k)) return mode === "recall" ? "anchor" : "given";
        if (result && statusByKey.has(k)) {
          const st = statusByKey.get(k)!;
          return st === "correct" ? "ok" : st === "spelling" ? "spell" : st === "wrong" ? "bad" : "empty";
        }
        if (answers[k]) return "filled";
        if (mode === "recall") return "blank";
        if (targetKeys.has(k)) return "target";
        return "off";
      }}
      isDisabled={(s, f) => {
        const k = `${s}:${f}`;
        if (givenKeys.has(k) || !!result) return true;
        // 推算模式每格都能填；其它模式只开放目标格
        return mode === "recall" ? false : !targetKeys.has(k);
      }}
      onCellClick={(s, f) => {
        const k = `${s}:${f}`;
        if (givenKeys.has(k) || result) return;
        if (mode !== "recall" && !targetKeys.has(k)) return;
        onPickCell({ s, f });
      }}
    />
  );
}
