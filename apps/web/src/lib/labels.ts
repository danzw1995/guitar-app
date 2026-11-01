import { solfegeLabel } from "@guitar/core";
import type { Settings } from "./storage";

export interface CellLabel {
  /** 主要文字（音名或唱名）。 */
  main: string;
  /** 副文字（「音名 + 唱名」模式下才是唱名，否则 null）。 */
  sub: string | null;
}

/**
 * 一个音在指板上显示什么。
 *
 * - `name`：只显示音名（带调号拼写，如 F 大调的 Bb）；
 * - `solfege`：只显示唱名（首调或固定，数字或 do re mi，变化音带升/降）；
 * - `both`：音名为主，唱名小字在下。
 */
export function cellLabel(noteName: string, pc: number, tonicPc: number, settings: Settings): CellLabel {
  if (settings.labels === "name") return { main: noteName, sub: null };

  const solfege = solfegeLabel(pc, tonicPc, {
    system: settings.solfegeSystem,
    style: settings.solfegeStyle,
  });

  return settings.labels === "solfege"
    ? { main: solfege, sub: null }
    : { main: noteName, sub: solfege };
}
