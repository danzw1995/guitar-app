import { useMemo } from "react";
import type { Tab } from "@guitar/core";
import { layoutTab } from "../lib/tab-layout";

export interface TabDiagramProps {
  tab: Tab;
}

/**
 * 六线谱（TAB）。
 *
 * 几何全部来自 `layoutTab`（纯函数、可单测、可截图验证），这里只负责贴成 SVG。
 * 数字压在弦线上的那一层，靠 `paint-order: stroke` 用背景色描边把线「断开」——
 * 这是纸谱的常见做法，比在数字后面挖洞简单，也不会错位。
 */
export default function TabDiagram({ tab }: TabDiagramProps) {
  const scene = useMemo(() => layoutTab(tab), [tab]);

  return (
    <figure className="tab">
      <div className="tab-scroll">
        <svg
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          width={scene.width}
          height={scene.height}
          className="tab-svg"
          role="img"
          aria-label={scene.ariaLabel}
        >
          {scene.els.map((el, index) => {
            if (el.t === "line") {
              return (
                <line
                  key={index}
                  x1={el.x1}
                  y1={el.y1}
                  x2={el.x2}
                  y2={el.y2}
                  className={el.cls}
                />
              );
            }
            if (el.t === "path") {
              return <path key={index} d={el.d} className={el.cls} />;
            }
            if (el.t === "circle") {
              return <circle key={index} cx={el.cx} cy={el.cy} r={el.r} className={el.cls} />;
            }
            return (
              <text
                key={index}
                x={el.x}
                y={el.y}
                textAnchor={el.anchor}
                dominantBaseline="central"
                className={el.cls}
              >
                {el.text}
              </text>
            );
          })}
        </svg>
      </div>
      {(tab.range || tab.caption) && (
        <figcaption className="tab-cap">
          {tab.range && <span className="tab-range">{tab.range}</span>}
          {tab.caption}
        </figcaption>
      )}
    </figure>
  );
}
