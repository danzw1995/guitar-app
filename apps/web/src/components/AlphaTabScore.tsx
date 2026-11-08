/**
 * 用 alphaTab 渲染一条六线谱，渲染完剩下静态 SVG。
 *
 * 为什么换成 alphaTab：自绘 SVG 在符梁、休止、三连音这些地方连着三轮和标准记法
 * 对不上（用户连着挑）。布局规则太多，交给成熟渲染器更靠谱。
 *
 * 具体怎么渲染、为什么只养一个实例，见 `../lib/alpha-render.ts` 的说明。
 *
 * 这个组件只负责显示，不接管播放：试听还是走 `useTone` 的 Web Audio 合成。
 * 另外，alphaTab 的 MPL-2.0 许可证要求谱面上保留「♪ alphaTab.net」署名，
 * 它是渲染输出的一部分，不要裁掉、遮住或去掉。
 */

import { useEffect, useRef, useState } from "react";
import { alphaScoreCacheKey, renderAlphaScore } from "../lib/alpha-render";

interface Props {
  /** alphaTex 文本，来自 `tabToAlphaTex()`。 */
  tex: string;
  /** 谱面缩放，卡片里默认 1.15。 */
  scale?: number;
  /** 读屏用的一句话说明（alphaTab 的 SVG 里没有语义）。 */
  label?: string;
  className?: string;
}

/** 已经渲染好的谱面，按 tex 缓存；滚动来回也不会重画。 */
const rendered = new Map<string, string>();

export default function AlphaTabScore({ tex, scale = 1.15, label, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = alphaScoreCacheKey(tex, scale);
  const [markup, setMarkup] = useState(() => rendered.get(key) ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cached = rendered.get(key);
    if (cached) {
      setMarkup(cached);
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const run = () => {
      renderAlphaScore(tex, scale)
        .then((html) => {
          if (cancelled) return;
          rendered.set(key, html);
          setMarkup(html);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn("alphaTab 渲染失败", err);
          setFailed(true);
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      run();
    } else {
      // 进视口（提前 300px）再渲染：一页 68 张，没必要一挂载就全排上。
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          observer = null;
          run();
        },
        { rootMargin: "300px" },
      );
      observer.observe(host);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [key, tex, scale]);

  return (
    <div
      ref={hostRef}
      className={`alpha-score ${className ?? ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      // 渲染结果是 alphaTab 自己的 SVG 标记，只有这一处需要注入。
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
      data-failed={failed ? "1" : undefined}
    />
  );
}
