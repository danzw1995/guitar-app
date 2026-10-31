import type { ReactNode } from "react";

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

export interface FretboardProps {
  fretMin: number;
  fretMax: number;
  renderCell: (s: number, f: number) => ReactNode;
  cellClass?: (s: number, f: number) => string;
  onCellClick?: (s: number, f: number) => void;
  isDisabled?: (s: number, f: number) => boolean;
}

/**
 * 传统六线谱方向：纵轴 = 1–6 弦（1 弦在上），横轴 = 品（左到右）。
 */
export default function Fretboard({
  fretMin,
  fretMax,
  renderCell,
  cellClass,
  onCellClick,
  isDisabled,
}: FretboardProps) {
  const frets: number[] = [];
  for (let f = fretMin; f <= fretMax; f++) frets.push(f);

  return (
    <div
      className="fretboard"
      style={{ gridTemplateColumns: `34px repeat(${frets.length}, minmax(40px, 1fr))` }}
    >
      <div className="fb-corner" />
      {frets.map((f) => (
        <div key={`h${f}`} className="fb-fret-label">
          {f}
        </div>
      ))}

      {[0, 1, 2, 3, 4, 5].map((s) => (
        <div key={`row${s}`} className="fb-row">
          <div className="fb-string-label">{STRING_LABELS[s]}</div>
          {frets.map((f) => {
            const disabled = isDisabled ? isDisabled(s, f) : !onCellClick;
            const cls = ["fb-cell", cellClass ? cellClass(s, f) : ""].filter(Boolean).join(" ");
            return (
              <button
                key={`${s}-${f}`}
                type="button"
                className={cls}
                disabled={disabled}
                onClick={() => onCellClick?.(s, f)}
              >
                {renderCell(s, f)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
