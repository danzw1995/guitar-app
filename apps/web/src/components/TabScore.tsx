import { useMemo } from "react";
import { tabAriaLabel, tabToAlphaTex, type Tab } from "@guitar/core";
import { SCORES_VERSION } from "../lib/scores-version";
import { useScoreBeats, useScoreBeatsReady } from "../lib/score-beats";
import { useScoreImage } from "../hooks/useScoreImage";

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
 * 读屏的那句话从 `tabAriaLabel()` 取（core 里的纯函数）——图片本身没有语义。
 * `?v=` 是 `gen:scores` 写进去的内容指纹：谱面重新生成后文件名不变，
 * 不加这个参数浏览器会一直用旧的缓存图。
 *
 * `beat` 有值时叠一条半透明竖条（当前位置）。位置来自 `scores/beats.json`：
 * 图片是死的，哪一拍画在哪个像素只有生成时才量得准。
 *
 * **没有预渲染图的谱**（「我存的进行」「我的谱」里的条目、扒出来的谱，id 都是运行时
 * 生成的）在这里退回现画一张（v0.98.0）——以前会去拿一个不存在的 PNG，跟练面板上
 * 就是一块碎图。现画的图没有 `beats.json` 的拍位置，所以不画竖条。
 */
export default function TabScore({ id, tab, className, beat }: Props) {
  const label = useMemo(() => tabAriaLabel(tab), [tab]);
  const beats = useScoreBeats();
  const beatsReady = useScoreBeatsReady();
  const info = beats[id];
  // 只有「拍位表已经拉到、里面又没有这张谱」才现画——否则 103 张卡会在表到之前
  // 全部挤进渲染队列（v0.98.0 的教训）。
  const tex = useMemo(
    () => (beatsReady && !info ? tabToAlphaTex(tab) : null),
    [beatsReady, info, tab],
  );
  const generated = useScoreImage(tex);
  const band = beat !== null && beat !== undefined ? info?.beats[beat] : undefined;
  const width = info?.width ?? 0;
  const height = info?.height ?? 0;
  // 长谱会折成两三行：高亮条只覆盖「这一拍所在的那一行」，否则每一行的同一列都会被照亮。
  const bandTop = band && height > 0 && band.y !== undefined ? (band.y / height) * 100 : null;
  const bandHeight = band && height > 0 && band.h !== undefined ? (band.h / height) * 100 : null;

  return (
    <span className={className ? `tab-score-wrap ${className}` : "tab-score-wrap"}>
      {info || !beatsReady ? (
        <img
          className="tab-score"
          src={`${import.meta.env.BASE_URL}scores/${id}.png?v=${SCORES_VERSION}`}
          alt={label}
          loading="lazy"
          decoding="async"
        />
      ) : generated.image ? (
        <img
          className="tab-score"
          src={generated.image.dataUrl}
          alt={label}
          style={{ width: `${generated.image.width * 2}px`, height: "auto" }}
          decoding="async"
        />
      ) : (
        <span className="tab-score-placeholder">{label}</span>
      )}
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
