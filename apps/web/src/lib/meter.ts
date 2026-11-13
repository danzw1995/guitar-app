/**
 * 从谱子反推拍号：能直接读到就用它，否则按一小节几拍反推。
 *
 * 6/8 的谱 `beatsPerBar` 是 6（一拍一个八分），3 是 3/4，2 是 2/4。
 * 节拍器与跟练都靠这个数拍，所以放一处共用，别两边各写一份。
 */
export function meterOfTab(tab: { beatsPerBar: number }): string {
  if (tab.beatsPerBar === 6) return "6/8";
  if (tab.beatsPerBar === 3) return "3/4";
  if (tab.beatsPerBar === 2) return "2/4";
  return "4/4";
}
