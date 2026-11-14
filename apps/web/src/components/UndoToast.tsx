import { useEffect } from "react";

interface Props {
  message: string;
  /** 可选：第二条出路（例如「这一周先不练」）。 */
  action?: { label: string; onClick: () => void };
  onUndo: () => void;
  onClose: () => void;
}

/**
 * 底部一条小提示，带「撤销」。
 *
 * 用在「换一条」之后：点错了能马上回来，不用等到明天。6 秒后自己收掉
 * （`role="status"` + `aria-live="polite"`，读屏会念一句，不抢焦点）。
 */
export default function UndoToast({ message, action, onUndo, onClose }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-text">{message}</span>
      {action && (
        <button type="button" className="undo-toast-more" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button type="button" className="undo-toast-btn" onClick={onUndo}>
        撤销
      </button>
      <button type="button" className="undo-toast-close" onClick={onClose} aria-label="关掉">
        ×
      </button>
    </div>
  );
}
