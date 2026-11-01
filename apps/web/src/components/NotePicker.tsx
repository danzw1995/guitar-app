import { useEffect, useMemo, useRef, useState } from "react";
import { NOTE_NAMES, nextNoteQuery, noteCandidates, type Cell } from "@guitar/core";

export interface NotePickerProps {
  /** 正在编辑的格子。 */
  cell: Cell;
  /** 选中一个音名（空串表示清除）。 */
  onPick: (value: string) => void;
  onClose: () => void;
}

/**
 * 音名选择器（底部弹层）+ 键盘输入。
 *
 * 打开时接管键盘：Esc 关闭、Backspace 删除、方向键换候选、Enter 确认、
 * 字母输入音名（`B` 后接 `b` 是 `Bb`，`C` 后接 `#` 是 `C#`）。
 */
export default function NotePicker({ cell, onPick, onClose }: NotePickerProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const candidates = useMemo(() => noteCandidates(query), [query]);
  const activeIndex = candidates.length ? Math.min(cursor, candidates.length - 1) : -1;
  const activeNote = activeIndex >= 0 ? candidates[activeIndex] : null;

  // 用 ref 存回调，避免父组件每次渲染都让键盘监听重新订阅。
  const pickRef = useRef(onPick);
  const closeRef = useRef(onClose);
  useEffect(() => {
    pickRef.current = onPick;
    closeRef.current = onClose;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key;

      if (key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        setQuery((q) => q.slice(0, -1));
        setCursor(0);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        const note = candidates[Math.min(cursor, Math.max(0, candidates.length - 1))];
        if (note) pickRef.current(note);
        return;
      }
      if (key === "ArrowDown" || key === "ArrowRight") {
        e.preventDefault();
        setCursor((c) => (candidates.length ? (c + 1) % candidates.length : 0));
        return;
      }
      if (key === "ArrowUp" || key === "ArrowLeft") {
        e.preventDefault();
        setCursor((c) => (candidates.length ? (c - 1 + candidates.length) % candidates.length : 0));
        return;
      }
      // 音名输入（含 # / b）走 core 的纯函数，规则只写一份。
      const nextQuery = nextNoteQuery(query, key);
      if (nextQuery !== null) {
        e.preventDefault();
        setQuery(nextQuery);
        setCursor(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidates, cursor, query]);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span>
            {cell.s + 1} 弦 · {cell.f} 品
            {query && ` · 输入 ${query}`}
          </span>
          <button className="btn ghost" onClick={() => onPick("")}>
            清除
          </button>
        </div>
        <div className="picker-grid">
          {NOTE_NAMES.map((n) => (
            <button
              key={n}
              className={n === activeNote ? "note-btn active" : "note-btn"}
              onClick={() => onPick(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {candidates.length === 0 && <p className="picker-hint">没有匹配的音名</p>}
        <p className="picker-hint">
          键盘：输入音名（可加 # 或 b）· 方向键选择 · Enter 确认 · Esc 关闭
        </p>
      </div>
    </div>
  );
}
