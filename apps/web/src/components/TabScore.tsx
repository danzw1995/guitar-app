import { useMemo } from "react";
import { type Tab } from "@guitar/core";
import { layoutTab } from "../lib/tab-layout";
import { SCORES_VERSION } from "../lib/scores-version";
import { useScoreBeats } from "../lib/score-beats";

interface Props {
  /** 谱面在 `public/scores/` 里的名字，由 `pnpm run gen:scores` 生成。 */
  id: string;
  tab: Tab;
  className?: string;
  /** 正在播第几拍（从 0 数）；播放时谱面上会有一条跟着走的竖条。 */
  beat?: number | null;
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
 *
 * `beat` 有值时叠一条半透明竖条（当前位置）。位置来自 `scores/beats.json`：
 * 图片是死的，哪一拍画在哪个像素只有生成时才量得准。
 */
export default function TabScore({ id, tab, className, beat }: Props) {
  const label = useMemo(() => layoutTab(tab).ariaLabel, [tab]);
  const beats = useScoreBeats();
  const info = beats[id];
  const band = beat !== null && beat !== undefined ? info?.beats[beat] : undefined;
  const width = info?.width ?? 0;
  const height = info?.height ?? 0;
  // 长谱会折成两三行：高亮条只覆盖「这一拍所在的那一行」，否则每一行的同一列都会被照亮。
  const bandTop = band && height > 0 && band.y !== undefined ? (band.y / height) * 100 : null;
  const bandHeight = band && height > 0 && band.h !== undefined ? (band.h / height) * 100 : null;

  return (
    <span className={className ? `tab-score-wrap ${className}` : "tab-score-wrap"}>
      <img
        className="tab-score"
        src={`${import.meta.env.BASE_URL}scores/${id}.png?v=${SCORES_VERSION}`}
        alt={label}
        loading="lazy"
        decoding="async"
      />
      {band && width > 0 && (
        <span
          className="tab-score-beat"
          style={{
            left: `${(band.x / width) * 100}%`,
            width: `${(band.w / width) * 100}%`,
            ...(bandTop !== null && bandHeight !== null
              ? { top: `${bandTop}%`, height: `${bandHeight}%` }
              : null),
          }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
