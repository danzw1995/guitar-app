import { useEffect, useRef, useState } from "react";

const KEY = "guitar.onboarded.v1";

/** 只在这台设备上弹一次；「设置 → 再看一遍新手引导」会清掉这个标记。 */
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // 读不了 localStorage 就当看过，别挡人
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略：隐私模式下写不进去也没关系
  }
}

const STEPS = [
  {
    n: "1",
    title: "今天练什么",
    body: "打开就是「今日练习」：按今天有多少分钟排出几块，每块都配六线谱和节拍器。",
  },
  {
    n: "2",
    title: "一条一条来",
    body: "点「试听」先听一遍，点「跟练」跟着节拍器从慢到快；练完点「完成」，连续天数就涨了。",
  },
  {
    n: "3",
    title: "卡住了看谱",
    body: "每条练习都带六线谱；「我的谱」在节奏页最下面，贴一段六线谱就能画出来存下来。",
  },
];

export interface OnboardingProps {
  /** 关掉后要做什么（例如切到游戏页）。 */
  onFinish?: () => void;
  /** 外部强制打开（设置页「再看一遍」用）。 */
  forced?: boolean;
}

/** 首次进入的三步引导。 */
export default function Onboarding({ onFinish, forced = false }: OnboardingProps) {
  const [open, setOpen] = useState(() => forced || !hasSeenOnboarding());
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    firstButtonRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function finish() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // 写不进去就下次再弹，不影响使用
    }
    setOpen(false);
    onFinish?.();
  }

  if (!open) return null;

  return (
    <div className="onboard-backdrop" onClick={finish}>
      <div
        className="onboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="onboard-title">三步开始练习</h2>
        <p className="onboard-lead">不用注册，进度只存在这台设备上。</p>

        <ol className="onboard-steps">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="onboard-num" aria-hidden="true">
                {step.n}
              </span>
              <div>
                <b>{step.title}</b>
                <span>{step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        <p className="onboard-more">
          其他页面：<b>节奏</b>（103 张卡：跟读、时值、扫弦、伴奏型、节奏型、风格片段）、
          <b>乐理</b>（十二节课，从「音」讲到「时值」）、<b>和弦</b>（16 个指法 + 级数）、
          <b>音阶</b>、<b>音阶游戏</b>（填空 + 每日挑战 + 推算模式）、<b>统计</b>、<b>设置</b>。
        </p>

        <div className="onboard-actions">
          <button
            type="button"
            className="btn primary"
            ref={firstButtonRef}
            onClick={finish}
          >
            开始练习
          </button>
          <button type="button" className="btn ghost" onClick={finish}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
