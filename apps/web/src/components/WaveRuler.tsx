/**
 * 录音 + 节拍参考线（v0.151.0；v0.152.0 加叠影与拖选）
 *
 * 波形画出来，节拍器的位置画竖线、每一拍的落点画圆点。
 * - `ghost`：把另一遍（通常是「最稳的一遍」）的波形淡淡叠在后面，错开一点就能看出哪遍更齐
 * - 拖动可以选一段：`onPick` 给回「第几拍到第几拍」，面板据此只弹那几小节
 *
 * 解码失败就退回 BeatRuler 那条示意图，起码还能看出是抢还是拖。
 */
import { useEffect, useRef, useState } from "react";
import {
  WAVE_AMP,
  WAVE_CENTER,
  WAVE_HEIGHT,
  WAVE_WIDTH,
  decodeWave,
  waveCached,
  waveShapePath,
  type WavePeaks,
} from "../lib/wave";
import BeatRuler from "./BeatRuler";

export interface WaveLayer {
  /** 那一遍的录音（data URL） */
  audio: string;
  /** 每拍偏差（毫秒，负=抢、正=拖） */
  offsets: number[];
  bpm: number;
  /** 录音里第一下点击声的位置（毫秒） */
  originMs?: number;
}

export interface WaveRulerProps extends WaveLayer {
  /** 叠在后面那一条（同一条时间轴上错开一点，看得出齐不齐） */
  ghost?: WaveLayer;
  /** 叠的是哪一遍（写进提示文字，v0.153.0 起可选「同速的上一遍」） */
  ghostLabel?: string;
  /** 拖选结束：第 from 拍到第 to 拍（0 起） */
  onPick?: (fromBeat: number, toBeat: number) => void;
  /** 点落点差那个小字：听那一拍附近（v0.157.0）。给的是这一遍那一拍的时刻（秒） */
  onSeek?: (seconds: number) => void;
  className?: string;
}

interface Pick {
  fromX: number;
  toX: number;
}

export default function WaveRuler({
  audio,
  offsets,
  bpm,
  originMs = 0,
  ghost,
  ghostLabel = "最稳的一遍",
  onPick,
  onSeek,
  className,
}: WaveRulerProps) {
  const [wave, setWave] = useState<WavePeaks | null>(() => waveCached(audio));
  const [ghostWave, setGhostWave] = useState<WavePeaks | null>(() =>
    ghost ? waveCached(ghost.audio) : null,
  );
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  // 长按往下听时跟着走的竖线（v0.159.0）：只有声音在动，看不见就更不知道听到第几拍了
  const [marker, setMarker] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  // 竖线拖动（v0.160.0）：抓住那根线拖到哪儿就从哪儿听
  const seekDragRef = useRef(false);
  // 长按落点差：按住不放就一拍一拍往下听（v0.158.0）
  const holdRef = useRef<{ delay: number | null; timer: number | null; index: number; stepped: boolean }>({
    delay: null,
    timer: null,
    index: 0,
    stepped: false,
  });

  // 卸载时把长按的定时器收掉。**必须放在任何 early return 之前**：
  // 放下面的 `if (!wave) return …` 之后，等波形解码完 hook 数就变了（Rendered more hooks than during the previous render）。
  useEffect(
    () => () => {
      const hold = holdRef.current;
      if (hold.delay !== null) window.clearTimeout(hold.delay);
      if (hold.timer !== null) window.clearInterval(hold.timer);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    void decodeWave(audio).then((next) => {
      if (!alive) return;
      if (next) setWave(next);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [audio]);

  useEffect(() => {
    if (!ghost) {
      setGhostWave(null);
      return;
    }
    let alive = true;
    void decodeWave(ghost.audio).then((next) => {
      if (alive) setGhostWave(next);
    });
    return () => {
      alive = false;
    };
  }, [ghost]);

  if (failed) return <BeatRuler offsets={offsets} className={className} />;
  if (!wave) {
    return (
      <div className={`beat-ruler-wrap${className ? ` ${className}` : ""}`}>
        <span className="wave-ruler-loading">在解码录音…</span>
      </div>
    );
  }

  const seconds = Math.max(0.001, wave.seconds);
  const beatMs = 60000 / Math.max(1, bpm);
  const xOf = (t: number) => Math.max(0, Math.min(WAVE_WIDTH, (t / seconds) * WAVE_WIDTH));
  const clockTimes = offsets.map((_, index) => (originMs + index * beatMs) / 1000);
  const hitTimes = offsets.map((offset, index) => clockTimes[index] + offset / 1000);
  const beatCount = Math.max(1, offsets.length);
  const worst = offsets.reduce(
    (best, offset, index) => (Math.abs(offset) > Math.abs(offsets[best]) ? index : best),
    0,
  );
  const worstOffset = offsets[worst] ?? 0;
  const aria =
    `录音波形和每一拍的落点：${offsets.length} 拍，` +
    `偏得最多的是第 ${worst + 1} 拍，${worstOffset < 0 ? "抢" : "拖"} ${Math.abs(Math.round(worstOffset))} 毫秒` +
    (onPick ? "。横着拖动可以选中几拍。" : "");

  const shape = waveShapePath(wave.peaks);
  // 叠影：第二遍按它自己的节拍画，稍微压扁一点（上下各留 2px），两条才分得开
  const ghostShape = ghost && ghostWave ? waveShapePath(ghostWave.peaks, WAVE_WIDTH, WAVE_CENTER, WAVE_AMP - 3) : "";
  // 叠影的每拍落点（v0.154.0）：只描边，跟这一遍的实心点分开；
  // v0.155.0 起只把偏得最多的三拍留亮，其余淡下去，圈不至于糊成一片
  const ghostDots = (() => {
    if (!ghost || !ghostWave) return [];
    const dots = ghost.offsets
      .map((offset, index) => {
        const clock = ((ghost.originMs ?? 0) + index * (60000 / Math.max(1, ghost.bpm))) / 1000;
        const hit = clock + offset / 1000;
        if (clock > ghostWave.seconds + 0.02) return null;
        return {
          key: `ghost-dot-${index}`,
          index,
          offset,
          x: hit <= 0 ? 0 : hit >= ghostWave.seconds ? WAVE_WIDTH : (hit / ghostWave.seconds) * WAVE_WIDTH,
          mark: Math.abs(offset) <= 8 ? "on" : offset < 0 ? "early" : "late",
        };
      })
      .filter((dot): dot is NonNullable<typeof dot> => dot !== null);
    const keep = new Set(
      [...dots]
        .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
        .slice(0, 3)
        .map((dot) => dot.index),
    );
    return dots.map((dot) => ({ ...dot, dim: dots.length > 3 && !keep.has(dot.index) }));
  })();

  // 跟叠影那一遍的差距（v0.156.0）：同一拍落点差多少毫秒——挑最偏的三拍连一条线、标个数，
  // 光看两个圈谁左谁右看不出「差 38 毫秒」这种量
  const diffs = (() => {
    if (!ghost) return [];
    const items = offsets
      .map((offset, index) => {
        const other = ghost.offsets[index];
        if (other === undefined) return null;
        if (hitTimes[index] > seconds + 0.02) return null;
        const clock = ((ghost.originMs ?? 0) + index * (60000 / Math.max(1, ghost.bpm))) / 1000;
        const otherTime = clock + other / 1000;
        return {
          key: `diff-${index}`,
          index,
          delta: offset - other,
          from: xOf(otherTime),
          to: xOf(hitTimes[index]),
          // 这一遍那一拍落在录音的哪一秒（点小字时从这里往前放两秒）
          at: clockTimes[index],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return [...items].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  })();

  const xToPick = (clientX: number, rect: DOMRect): number => {    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return ratio * WAVE_WIDTH;
  };

  // 长按：先等 420 毫秒，然后每隔 850 毫秒往下走一拍，松手就停
  const clearHold = () => {
    const hold = holdRef.current;
    if (hold.delay !== null) {
      window.clearTimeout(hold.delay);
      hold.delay = null;
    }
    if (hold.timer !== null) {
      window.clearInterval(hold.timer);
      hold.timer = null;
    }
  };

  const startHold = (index: number) => {
    if (!onSeek) return;
    clearHold();
    const hold = holdRef.current;
    hold.index = index;
    hold.stepped = false;
    hold.delay = window.setTimeout(() => {
      hold.stepped = true;
      hold.timer = window.setInterval(() => {
        const next = Math.min(beatCount - 1, hold.index + 1);
        if (next === hold.index) {
          clearHold();
          return;
        }
        hold.index = next;
        setMarker(clockTimes[next]);
        onSeek(clockTimes[next]);
      }, 850);
    }, 420);
  };

  const finishPick = (current: Pick) => {
    const fromX = Math.min(current.fromX, current.toX);
    const toX = Math.max(current.fromX, current.toX);
    if (toX - fromX < 3) {
      setPick(null);
      return;
    }
    const fromBeat = Math.max(0, Math.min(beatCount - 1, Math.round((fromX / WAVE_WIDTH) * beatCount)));
    const toBeat = Math.max(fromBeat, Math.min(beatCount - 1, Math.round((toX / WAVE_WIDTH) * beatCount)));
    setPick({ fromX, toX });
    onPick?.(fromBeat, toBeat);
  };

  // 那根竖线也能拖：拖到哪儿就从哪儿接着听
  const secondsAt = (clientX: number, rect: DOMRect) =>
    Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))) * seconds;
  const nearPlayhead = (clientX: number, rect: DOMRect) =>
    Boolean(onSeek) && marker !== null && Math.abs(secondsAt(clientX, rect) - marker) < 0.35;

  return (
    <div className={`wave-ruler-wrap${className ? ` ${className}` : ""}`}>
      <svg
        className={`wave-ruler${onPick ? " wave-ruler-dragging" : ""}`}
        viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
        role="img"
        aria-label={aria}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          // 落在竖线附近就抓住竖线，不再起框选
          if (nearPlayhead(event.clientX, rect)) {
            seekDragRef.current = true;
            setMarker(secondsAt(event.clientX, rect));
            event.currentTarget.setPointerCapture?.(event.pointerId);
            return;
          }
          if (!onPick) return;
          const x = xToPick(event.clientX, rect);
          dragRef.current = x;
          setPick({ fromX: x, toX: x });
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (seekDragRef.current) {
            const rect = event.currentTarget.getBoundingClientRect();
            setMarker(secondsAt(event.clientX, rect));
            return;
          }
          if (!onPick || dragRef.current === null) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setPick({ fromX: dragRef.current, toX: xToPick(event.clientX, rect) });
        }}
        onPointerUp={(event) => {
          if (seekDragRef.current) {
            seekDragRef.current = false;
            const rect = event.currentTarget.getBoundingClientRect();
            const secondsAtPointer = secondsAt(event.clientX, rect);
            setMarker(secondsAtPointer);
            onSeek?.(secondsAtPointer);
            return;
          }
          if (!onPick || dragRef.current === null) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const current = { fromX: dragRef.current, toX: xToPick(event.clientX, rect) };
          dragRef.current = null;
          finishPick(current);
        }}
        onPointerCancel={() => {
          seekDragRef.current = false;
          dragRef.current = null;
          setPick(null);
        }}
      >
        <line className="wave-ruler-mid" x1={0} y1={WAVE_CENTER} x2={WAVE_WIDTH} y2={WAVE_CENTER} />
        {ghostShape && <path className="wave-ruler-ghost" d={ghostShape} />}
        <path className="wave-ruler-shape" d={shape} />
        {clockTimes.map((time, index) =>
          // 录音只录到这一段：超出录音长度的拍不画（不然会全挤在最右边）
          time <= seconds + 0.02 ? (
            <line
              key={`clock-${index}-${Math.round(time * 1000)}`}
              className="wave-ruler-tick"
              x1={xOf(time)}
              y1={3}
              x2={xOf(time)}
              y2={WAVE_HEIGHT - 3}
            />
          ) : null,
        )}
        {hitTimes.map((time, index) => {
          if (time > seconds + 0.02) return null;
          const offset = offsets[index];
          const mark = Math.abs(offset) <= 8 ? "on" : offset < 0 ? "early" : "late";
          return (
            <circle
              key={`hit-${index}-${Math.round(time * 1000)}`}
              className={`wave-ruler-dot ${mark}`}
              cx={xOf(time)}
              cy={WAVE_CENTER}
              r={2.4}
            />
          );
        })}
        {ghostDots.map((dot) => (
          <circle
            key={dot.key}
            className={`wave-ruler-ghost-dot ${dot.mark}${dot.dim ? " dim" : ""}`}
            cx={dot.x}
            cy={WAVE_CENTER}
            r={2.9}
          />
        ))}
        {diffs.map((diff, order) => {
          const label = diff.delta > 0 ? `+${Math.round(diff.delta)}` : `${Math.round(diff.delta)}`;
          const body = (
            <>
              <line
                className="wave-ruler-diff"
                x1={diff.from}
                y1={WAVE_CENTER}
                x2={diff.to}
                y2={WAVE_CENTER}
              />
              <text
                className="wave-ruler-diff-label"
                // 靠边时别让数字被切掉
                x={Math.max(10, Math.min(WAVE_WIDTH - 10, (diff.from + diff.to) / 2))}
                // 三个数分开摆：前两个在上方两行，第三个挪到下面，免得叠在一起
                y={order === 2 ? WAVE_CENTER + 10 : 6 + order * 6}
                textAnchor="middle"
              >
                {label}
              </text>
            </>
          );
          // 点小字就听那一拍附近（v0.157.0）：不接 onSeek 时还是纯标注
          if (!onSeek) return <g key={diff.key}>{body}</g>;
          return (
            <g
              key={diff.key}
              className="wave-ruler-diff-hit"
              role="button"
              tabIndex={0}
              aria-label={`第 ${diff.index + 1} 拍的落点差 ${label} 毫秒，点一下听这一拍附近，长按一拍一拍往下听`}
              onPointerDown={(event) => {
                event.stopPropagation();
                startHold(diff.index);
              }}
              onPointerUp={clearHold}
              onPointerLeave={clearHold}
              onPointerCancel={clearHold}
              onClick={() => {
                // 长按已经走过了，松手那一下不再从头放
                if (holdRef.current.stepped) {
                  holdRef.current.stepped = false;
                  return;
                }
                setMarker(diff.at);
                onSeek(diff.at);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSeek(diff.at);
                }
              }}
            >
              {body}
            </g>
          );
        })}
        {pick && (
          <rect
            className="wave-ruler-pick"
            x={Math.min(pick.fromX, pick.toX)}
            y={1}
            width={Math.abs(pick.toX - pick.fromX)}
            height={WAVE_HEIGHT - 2}
          />
        )}
        {marker !== null && marker >= 0 && marker <= seconds + 0.02 && (
          <>
            <line
              className="wave-ruler-playhead-hit"
              x1={xOf(marker)}
              x2={xOf(marker)}
              y1={2}
              y2={WAVE_HEIGHT - 2}
            />
            <line
              className="wave-ruler-playhead"
              x1={xOf(marker)}
              x2={xOf(marker)}
              y1={2}
              y2={WAVE_HEIGHT - 2}
            />
          </>
        )}
      </svg>
      <span className="beat-ruler-hint">
        {ghost ? `淡的那条是${ghostLabel}，深的是这一遍` : "波形上是这一遍，竖线是节拍器"}
        {onPick ? "；横着拖能选几拍" : ""}
        {ghost && diffs.length > 0 ? "；小字是这一遍比它晚（+）或早（−）多少毫秒" : ""}
        {onSeek && diffs.length > 0 ? "，小字点一下能听那一拍附近，长按顺着往下听，竖线也能拖着走" : ""}
      </span>
    </div>
  );
}
