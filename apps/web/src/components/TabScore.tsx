import { useMemo } from "react";
import AlphaTabScore from "./AlphaTabScore";
import { tabToAlphaTex, type Tab } from "@guitar/core";
import { layoutTab } from "../lib/tab-layout";

interface Props {
  tab: Tab;
  /** 试听/跟练用的速度，写进谱面，跟节拍器对得上。 */
  bpm?: number;
  scale?: number;
}

/**
 * 把 `Tab` 翻成 alphaTex 再交给 `AlphaTabScore`，省得每处都写转换。
 *
 * 这里必须 `useMemo`：`AlphaTabScore` 的 effect 依赖 tex 字符串，
 * 父组件每重渲染一次就重新拼一个内容相同但引用不同的字符串，
 * effect 会跟着重跑一遍（先清理再重建实例），偶尔就会漏掉一张卡。
 *
 * 读屏用的那句话仍然从 `layoutTab` 取——alphaTab 画出来的 SVG 里只有字形，
 * 没有语义，整张谱得靠外面这层 `role="img"` 加一句话说明。
 */
export default function TabScore({ tab, bpm, scale }: Props) {
  const tex = useMemo(() => tabToAlphaTex(tab, bpm ? { bpm } : {}), [tab, bpm]);
  const label = useMemo(() => layoutTab(tab).ariaLabel, [tab]);
  return <AlphaTabScore tex={tex} scale={scale} label={label} />;
}
