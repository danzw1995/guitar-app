import { useEffect, useState } from "react";
import { dateKeyOf, type Tab } from "@guitar/core";
import { addExtra, loadExtras } from "../lib/plan";
import { meterOfTab } from "../lib/meter";

interface Props {
  /** 加进计划后显示的名字（和卡片标题一致，用来去重） */
  title: string;
  tab: Tab;
  bpm: number;
  /** 「我的谱」里的拍号可能不是 x/4（比如 6/8），传进来就用它 */
  meter?: string;
}

/**
 * 「加进今日计划」小按钮（v0.104.0）。
 *
 * 节奏页 103 条以前只能当场试听 / 跟练，练完什么也不留；这个按钮把那条写进
 * `guitar.plan.v1`，练习页「今天自己加的」里就能勾掉、能计时，统计页也会算进加餐。
 * 已经加过就显示「已在计划里」并禁用——同一标题只留一条。
 */
export default function PlanButton({ title, tab, bpm, meter }: Props) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const today = dateKeyOf(new Date());
    setAdded(loadExtras(today).some((extra) => extra.title === title));
  }, [title]);

  function add() {
    addExtra({ title, tab, meter: meter ?? meterOfTab(tab), bpm }, dateKeyOf(new Date()));
    setAdded(true);
  }

  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={add}
      disabled={added}
      title="加到练习页的「今天自己加的」里，之后能勾掉"
    >
      {added ? "已在计划里" : "加进今日计划"}
    </button>
  );
}
