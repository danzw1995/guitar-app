import { useMemo } from "react";
import { type Tab } from "@guitar/core";
import { layoutTab } from "../lib/tab-layout";
import { SCORES_VERSION } from "../lib/scores-version";

interface Props {
  /** 谱面在 `public/scores/` 里的名字，由 `pnpm run gen:scores` 生成。 */
  id: string;
  tab: Tab;
  className?: string;
}

/**
 * 一张六线谱。
 *
 * 谱面不是运行时画的：`apps/web/scripts/gen-scores.ts` 把所有练习预渲染成
 * 2 倍图放进 `public/scores/`，这里只负责挑图和写无障碍说明。
 * 这样做前端不用背 alphaTab 那 ~300KB，也不用在浏览器里排队渲染，
 * 卡片上就是一张普通的 `<img>`，能交给浏览器懒加载。
 *
 * 读屏的那句话从 `layoutTab` 取——图片本身没有语义。
 * `?v=` 是 `gen:scores` 写进去的内容指纹：谱面重新生成后文件名不变，
 * 不加这个参数浏览器会一直用旧的缓存图。
 */
export default function TabScore({ id, tab, className }: Props) {
  const label = useMemo(() => layoutTab(tab).ariaLabel, [tab]);
  return (
    <img
      className={className ? `tab-score ${className}` : "tab-score"}
      src={`${import.meta.env.BASE_URL}scores/${id}.png?v=${SCORES_VERSION}`}
      alt={label}
      loading="lazy"
      decoding="async"
    />
  );
}
