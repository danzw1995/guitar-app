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
    <div className="fretboard" style={{ gridTemplateColumns: `34px repeat(6, minmax(42px, 1fr))` }}>
      <div className="fb-corner" />
      {STRING_LABELS.map((label, i) => (
        <div key={`h${i}`} className="fb-string-label">
          {label}
        </div>
      ))}

      {frets.map((f) => (
        <div key={`row${f}`} className="fb-row-contents">
          <div className="fb-fret-label">{f === 0 ? "0" : f}</div>
          {[0, 1, 2, 3, 4, 5].map((s) => {
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
