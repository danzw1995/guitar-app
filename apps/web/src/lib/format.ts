/** 计时显示：`m:ss.d`，用于游戏计时与成绩。 */
export function fmt(ms: number): string {
  if (ms <= 0) return "0:00.0";
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const d = Math.floor((total * 10) % 10);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

/** 累计时长显示：`H小时M分` / `M分S秒` / `S秒`，用于统计页。 */
export function fmtSpan(ms: number): string {
  if (ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
