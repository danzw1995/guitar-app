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
    title: "选一关",
    body: "默认从 L01 开始（C 大调 1–5 品）。关卡下拉里能看到每关的难度和要填几格。",
  },
  {
    n: "2",
    title: "填一格",
    body: "点带 ? 的格子选音名；桌面也可以用键盘直接打 E、Eb、C#。第一次填写才开始计时。",
  },
  {
    n: "3",
    title: "提交看结果",
    body: "全对且够快是 3 星，慢一点是 2 星，做完就 1 星——拿到 1 星就解锁下一关。",
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
          其他五个页面：<b>练习</b>（按今天有多少分钟生成计划，附 14 张技巧卡和节拍器）、
          <b>乐理</b>（十二节课，从「音」讲到「时值」，页面底部还有 12 关的<b>乐理挑战</b>）、
          <b>和弦</b>（16 个指法 + 级数）、<b>统计</b>、<b>设置</b>。
          游戏页除了主线，还有<b>每日挑战</b>和没有提示的<b>推算模式</b>。
        </p>

        <div className="onboard-actions">
          <button
            type="button"
            className="btn primary"
            ref={firstButtonRef}
            onClick={finish}
          >
            开始第一关
          </button>
          <button type="button" className="btn ghost" onClick={finish}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
