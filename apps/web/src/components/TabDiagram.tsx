import type { Tab, TabNote } from "@guitar/core";

export interface TabDiagramProps {
  tab: Tab;
}

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const STRING_GAP = 17;
const TOP_PAD = 44;
const BOTTOM_PAD = 26;
const LEFT_PAD = 30;
const MIN_BEAT_WIDTH = 30;
const NOTE_GAP = 15;
const FONT = 13;

/**
 * 六线谱（TAB）。
 *
 * 只画三样东西：弦、品、拍。技巧（击/勾/滑/推/揉）标在数字上或数字之间，
 * 扫弦箭头画在最下面一行——初学时最需要的是「第几弦第几品、在第几拍」，
 * 时值符尾先不画，免得谱面比练习还难读。
 */
export default function TabDiagram({ tab }: TabDiagramProps) {
  const { notes, beatsPerBar, bars } = tab;
  const totalBeats = beatsPerBar * bars;

  // 同一根弦上相邻两个音最近的间隔（拍）——它决定一拍的宽度。
  // 和弦（同一拍、不同弦）不会让间距变宽，十六分和三连音才会。
  const byString = new Map<number, number[]>();
  for (const note of notes) {
    const list = byString.get(note.s) ?? [];
    list.push(note.beat);
    byString.set(note.s, list);
  }
  let minGap = 1;
  for (const beats of byString.values()) {
    beats.sort((a, b) => a - b);
    for (let i = 1; i < beats.length; i++) {
      const gap = beats[i] - beats[i - 1];
      if (gap > 0 && gap < minGap) minGap = gap;
    }
  }
  const beatWidth = Math.max(MIN_BEAT_WIDTH, NOTE_GAP / minGap);
  const width = LEFT_PAD + totalBeats * beatWidth + 14;
  const height = TOP_PAD + 5 * STRING_GAP + BOTTOM_PAD;

  const x = (beat: number) => LEFT_PAD + beat * beatWidth;
  const y = (s: number) => TOP_PAD + (s - 1) * STRING_GAP;

  return (
    <figure className="tab">
      <div className="tab-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="tab-svg"
          role="img"
          aria-label={`六线谱${tab.range ? `（${tab.range}）` : ""}，${bars} 小节，共 ${notes.length} 个音${tab.caption ? `。${tab.caption}` : ""}`}
        >
          {/* 弦线与左端弦名 */}
          {STRING_LABELS.map((label, index) => (
            <g key={label + index}>
              <line
                x1={LEFT_PAD}
                y1={y(index + 1)}
                x2={width - 14}
                y2={y(index + 1)}
                className="tab-string"
              />
              <text x={LEFT_PAD - 8} y={y(index + 1) + 4} textAnchor="end" className="tab-string-name">
                {label}
              </text>
            </g>
          ))}

          {/* 小节线 + 拍号数字 */}
          {Array.from({ length: bars + 1 }, (_, index) => {
            const beat = index * beatsPerBar;
            return (
              <line
                key={`bar-${index}`}
                x1={x(beat)}
                y1={y(1)}
                x2={x(beat)}
                y2={y(6)}
                className="tab-bar"
              />
            );
          })}
          {Array.from({ length: totalBeats }, (_, beat) =>
            beat % beatsPerBar === 0 ? (
              <text
                key={`count-${beat}`}
                x={x(beat + 0.08)}
                y={TOP_PAD - 26}
                className="tab-count"
              >
                {beat / beatsPerBar + 1}
              </text>
            ) : null,
          )}

          {/* 音 */}
          {notes.map((note, index) => (
            <g key={`${note.s}-${note.beat}-${index}`}>
              {note.arrow && (
                <text
                  x={x(note.beat + note.dur / 2)}
                  y={height - 8}
                  textAnchor="middle"
                  className="tab-arrow"
                >
                  {note.arrow === "D" ? "↓" : "↑"}
                </text>
              )}
              <text
                x={x(note.beat)}
                y={y(note.s) + 4}
                textAnchor="middle"
                className={note.tech === "b" ? "tab-fret bend" : "tab-fret"}
              >
                {note.tech === "b" && note.bend
                  ? `${note.f}b${note.f + note.bend}`
                  : note.tech === "v"
                    ? `${note.f}~`
                    : note.f}
              </text>
              {(note.tech === "h" || note.tech === "p" || note.tech === "s") && (
                <text
                  x={x(note.beat) - beatWidth * 0.22}
                  y={y(note.s) - 9}
                  textAnchor="middle"
                  className="tab-tech"
                >
                  {note.tech}
                </text>
              )}
              {note.tech === "h" || note.tech === "p" || note.tech === "s" ? (
                <Slur note={note} previous={previousOnString(notes, note, index)} x={x} y={y} />
              ) : null}
            </g>
          ))}
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

/** 同一根弦上、在这个音之前最近的那个音。 */
function previousOnString(notes: TabNote[], note: TabNote, index: number): TabNote | null {
  for (let i = index - 1; i >= 0; i--) {
    const candidate = notes[i];
    if (candidate.s === note.s && candidate.beat < note.beat) return candidate;
  }
  return null;
}

/** 两个音之间的小弧线（连奏标记）。 */
function Slur({
  note,
  previous,
  x,
  y,
}: {
  note: TabNote;
  previous: TabNote | null;
  x: (beat: number) => number;
  y: (s: number) => number;
}) {
  if (!previous) return null;
  const x1 = x(previous.beat);
  const x2 = x(note.beat);
  const y1 = y(note.s);
  const mid = (x1 + x2) / 2;
  return (
    <path
      d={`M ${x1 + 6} ${y1 - 6} Q ${mid} ${y1 - 14} ${x2 - 6} ${y1 - 6}`}
      className="tab-slur"
    />
  );
}
