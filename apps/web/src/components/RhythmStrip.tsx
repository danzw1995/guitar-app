import { gridSlots, meterOf, type Subdivision, type StrumArrow } from "@guitar/core";

export interface RhythmStripProps {
  /** 拍号，如 `4/4`。 */
  meterId: string;
  /** 每拍切几份：1 四分 / 2 八分 / 3 三连音 / 4 十六分。 */
  subdivision: Subdivision;
  /** 扫弦箭头（长度必须和格子数一致，否则忽略）。 */
  arrows?: (StrumArrow | null)[];
  /** 当前响到第几格（节拍器联动，0 起）。 */
  active?: number;
}

/**
 * 一小节的节拍格：数拍词 + 强弱拍 + 可选的扫弦箭头。
 *
 * 为什么用横条而不是五线谱：初学者的第一道坎不是认谱，而是「一拍里到底动几下」。
 * 横向格子 + 数拍词（1 & / 1 e & a / 1 ta ta）能直接对上节拍器的声音。
 */
export default function RhythmStrip({
  meterId,
  subdivision,
  arrows,
  active,
}: RhythmStripProps) {
  const meter = meterOf(meterId);
  const slots = gridSlots(meterId, subdivision);
  const arrowsFit = arrows && arrows.length === slots.length ? arrows : undefined;
  const beats = slots.filter((slot) => slot.onBeat).length;

  return (
    <div
      className="rhythm-strip"
      role="img"
      aria-label={`${meter.label}，每小节 ${beats} 拍，每拍 ${subdivision} 下：${slots
        .map((slot) => slot.label)
        .join(" ")}`}
    >
      {slots.map((slot) => {
        const arrow = arrowsFit?.[slot.index];
        return (
          <div
            key={slot.index}
            className={[
              "rhythm-slot",
              slot.accent ? "accent" : "",
              slot.onBeat ? "on-beat" : "",
              active === slot.index ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            <span className="rhythm-label">{slot.label}</span>
            <span className={arrow ? "rhythm-arrow" : "rhythm-arrow empty"}>
              {arrow === "D" ? "↓" : arrow === "U" ? "↑" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
