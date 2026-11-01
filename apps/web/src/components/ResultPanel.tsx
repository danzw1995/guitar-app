import type { ReactNode } from "react";
import { isPerfect, type AttemptResult, type LevelProgress } from "@guitar/core";
import Stars from "./Stars";
import { fmt } from "../lib/format";
import type { BoardMode } from "./PuzzleBoard";

/** 这一把的结果：本次星级、是否新纪录、刚解锁的关卡。 */
export interface ResultGain {
  stars: number;
  newBest: boolean;
  unlocked: string | null;
}

export interface ResultPanelProps {
  result: AttemptResult;
  mode: BoardMode;
  gain: ResultGain | null;
  record: LevelProgress | undefined;
  parMs: number;
  elapsedMs: number;
  strictSpelling: boolean;
  errorByString: [number, number][];
  anchorLabel: string;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  /** 主操作（下一关 / 换一题 / 每日说明）。 */
  actions: ReactNode;
}

/** 结果面板：标题 + 星级 + 数据格 + 元信息 + 错误分布 + 操作。 */
export default function ResultPanel({
  result,
  mode,
  gain,
  record,
  parMs,
  elapsedMs,
  strictSpelling,
  errorByString,
  anchorLabel,
  copied,
  onCopy,
  onRetry,
  actions,
}: ResultPanelProps) {
  const perfect = isPerfect(result, strictSpelling);
  const headline = !result.finished ? `还差 ${result.empty} 格` : perfect ? "全对！" : "完成";

  return (
    <div className="result">
      <div className="result-head">
        <h3>{headline}</h3>
        {mode === "recall" ? (
          <span className="muted">推算模式 · 不计星级</span>
        ) : (
          <Stars n={gain?.stars ?? 0} size="lg" />
        )}
      </div>

      <div className="result-grid">
        <div>
          <b>{fmt(elapsedMs)}</b>
          <span>用时</span>
        </div>
        <div>
          <b>{result.correct}/{result.total}</b>
          <span>正确</span>
        </div>
        <div>
          <b>{result.spelling}</b>
          <span>拼写提示</span>
        </div>
        <div>
          <b>{result.wrong + result.empty}</b>
          <span>错误/空</span>
        </div>
        <div>
          <b>{Math.round(result.accuracy * 100)}%</b>
          <span>准确率</span>
        </div>
      </div>

      <div className="result-meta">
        {mode === "recall" ? (
          <>
            <span>只校验调内音（{result.total} 格），调外格忽略</span>
            <span>提示格：{anchorLabel}</span>
          </>
        ) : (
          <>
            <span>三星目标 {fmt(parMs)}</span>
            <span>{record?.bestMs != null ? `最快全对 ${fmt(record.bestMs)}` : "还没全对过"}</span>
            {gain?.newBest && <span className="badge">新纪录</span>}
            {gain?.unlocked && <span className="badge">已解锁 {gain.unlocked}</span>}
          </>
        )}
      </div>

      {errorByString.length > 0 && (
        <div className="result-dist">
          <span className="muted">错误分布</span>
          {errorByString.map(([s, n]) => (
            <span key={s} className="chip">
              {s + 1} 弦 ×{n}
            </span>
          ))}
        </div>
      )}

      <div className="result-actions">
        {actions}
        <button className="btn ghost" onClick={onRetry}>
          再练一次
        </button>
        <button className="btn ghost" onClick={onCopy}>
          {copied ? "已复制 ✓" : "复制成绩"}
        </button>
      </div>
    </div>
  );
}
