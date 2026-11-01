import type { ChordShape } from "@guitar/core";

const W = 200;
const H = 250;
const LEFT = 30;
const TOP = 45;
const GAP_X = 28;
const GAP_Y = 30;
const FRETS = 5;

/** 从左到右：6 弦（低音 E）到 1 弦（高音 E），统一大写。 */
const STRING_NAMES = ["E", "A", "D", "G", "B", "E"];

export default function ChordDiagram({ chord }: { chord: ChordShape }) {
  const positive = chord.frets.filter((f) => f > 0);
  const maxFret = positive.length ? Math.max(...positive) : 1;
  const minFret = positive.length ? Math.min(...positive) : 1;
  const base = maxFret > FRETS ? minFret : 1;
  const nut = base === 1;

  const stringX = (i: number) => LEFT + i * GAP_X;
  const fretY = (f: number) => TOP + (f - base + 0.5) * GAP_Y;

  const dots: { i: number; fret: number; finger?: number }[] = [];
  chord.frets.forEach((f, i) => {
    if (f > 0) dots.push({ i, fret: f, finger: chord.fingers?.[i] });
  });

  const barreDots = dots.filter((d) => d.fret === chord.barre);
  const barreFrom = barreDots.length ? Math.min(...barreDots.map((d) => d.i)) : -1;
  const barreTo = barreDots.length ? Math.max(...barreDots.map((d) => d.i)) : -1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chord-svg" role="img" aria-label={`${chord.name} 和弦图`}>
      {nut ? (
        <rect x={stringX(0) - 2} y={TOP - 4} width={stringX(5) - stringX(0) + 4} height={5} fill="#e6edf3" rx={1} />
      ) : (
        <text x={4} y={fretY(base)} className="chord-fretnum">
          {base}
        </text>
      )}

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={`s${i}`} x1={stringX(i)} y1={TOP} x2={stringX(i)} y2={TOP + FRETS * GAP_Y} stroke="#7d8590" strokeWidth={1} />
      ))}
      {Array.from({ length: FRETS + 1 }).map((_, k) => (
        <line key={`f${k}`} x1={stringX(0)} y1={TOP + k * GAP_Y} x2={stringX(5)} y2={TOP + k * GAP_Y} stroke="#30363d" strokeWidth={1} />
      ))}

      {chord.frets.map((f, i) => {
        if (f === 0) return <circle key={`o${i}`} cx={stringX(i)} cy={TOP - 16} r={5} fill="none" stroke="#e6edf3" strokeWidth={1.5} />;
        if (f < 0) {
          return (
            <g key={`x${i}`} stroke="#8b949e" strokeWidth={2}>
              <line x1={stringX(i) - 5} y1={TOP - 21} x2={stringX(i) + 5} y2={TOP - 11} />
              <line x1={stringX(i) - 5} y1={TOP - 11} x2={stringX(i) + 5} y2={TOP - 21} />
            </g>
          );
        }
        return null;
      })}

      {barreFrom >= 0 && (
        <rect
          x={stringX(barreFrom) - 8}
          y={fretY(chord.barre!) - 8}
          width={stringX(barreTo) - stringX(barreFrom) + 16}
          height={16}
          rx={8}
          fill="#e8b04b"
          opacity={0.9}
        />
      )}

      {dots.map((d) => (
        <g key={`d${d.i}`}>
          <circle cx={stringX(d.i)} cy={fretY(d.fret)} r={9} fill="#e8b04b" />
          {d.finger ? (
            <text x={stringX(d.i)} y={fretY(d.fret) + 4} textAnchor="middle" className="chord-finger">
              {d.finger}
            </text>
          ) : null}
        </g>
      ))}

      {/* 弦名：标在图下方，方便对上 ○ / × 是哪一根弦 */}
      {STRING_NAMES.map((name, i) => (
        <text
          key={`sn${i}`}
          x={stringX(i)}
          y={TOP + FRETS * GAP_Y + 18}
          textAnchor="middle"
          className="chord-string-name"
        >
          {name}
        </text>
      ))}
    </svg>
  );
}
