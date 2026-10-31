import { MAX_STARS } from "@guitar/core";

export interface StarsProps {
  /** 0–3。 */
  n: number;
  size?: "sm" | "lg";
  /** 无障碍标签里说明满星数；关卡选择里用 sm 不显示文字。 */
  label?: string;
}

/** 星级展示：满星金色，空星灰色；同时给屏幕阅读器一句人话。 */
export default function Stars({ n, size = "sm", label }: StarsProps) {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(n)));
  return (
    <span
      className={`stars stars-${size}`}
      role="img"
      aria-label={label ?? `${filled} 星（满 ${MAX_STARS} 星）`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i} className={i < filled ? "star on" : "star"} aria-hidden="true">
          {i < filled ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

/** 纯文本版本，给 `<option>` / 标题这种放不了 DOM 的地方。 */
export function starText(n: number): string {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(n)));
  return "★".repeat(filled) + "☆".repeat(MAX_STARS - filled);
}
