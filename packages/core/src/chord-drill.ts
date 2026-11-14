/**
 * 和弦转换练习：一组和弦、每 N 拍换一个、跟节拍器走。
 *
 * 这里只算「第几拍该按哪个和弦」，不碰音频也不碰 DOM——换和弦的时机必须跟节拍器
 * 同一个时钟，交给渲染去算会被主线程的抖动拖歪。
 */

export interface Progression {
  id: string;
  name: string;
  /** 按顺序循环的和弦名（都要能在 `CHORDS` 里找到）。 */
  chords: string[];
}

/**
 * 四组最常见的进行。
 *
 * 都在 C 大调 / 关系小调里，左手不用大搬家——初学者卡的是「换」，
 * 不是「找和弦」，先别让把位跳动掺进来。
 */
export const PROGRESSIONS: Progression[] = [
  { id: "pg-1645", name: "C–Am–F–G", chords: ["C", "Am", "F", "G"] },
  { id: "pg-1564", name: "C–G–Am–F", chords: ["C", "G", "Am", "F"] },
  { id: "pg-emoc", name: "Em–C–G–D", chords: ["Em", "C", "G", "D"] },
  { id: "pg-folk", name: "Am–F–C–G", chords: ["Am", "F", "C", "G"] },
];

export interface ChordStep {
  /** 这一拍该按的和弦。 */
  chord: string;
  /** 下一个和弦（提前看到，手才好准备）。 */
  next: string;
  /** 在进行里的序号（0 起）。 */
  index: number;
}

/** 第 `beat` 拍（0 起）该按哪个和弦。 */
export function chordAt(chords: string[], beatsPerChord: number, beat: number): ChordStep {
  if (chords.length === 0) throw new Error("chordAt: 进行是空的");
  const per = Math.max(1, Math.round(beatsPerChord));
  const at = Math.max(0, Math.floor(beat));
  const index = Math.floor(at / per) % chords.length;
  return { chord: chords[index], next: chords[(index + 1) % chords.length], index };
}

/**
 * 打了 `beats` 拍，中间一共换了几次和弦。
 *
 * 第一拍是「按上去」，不算换：4 拍、每 2 拍换一次，只换了 1 次（第 3 拍）。
 */
export function changesIn(beats: number, beatsPerChord: number): number {
  const per = Math.max(1, Math.round(beatsPerChord));
  return Math.floor(Math.max(0, beats - 1) / per);
}

/** 一分钟的练习有多少拍：BPM 本来就是「每分钟拍数」。 */
export function drillBeats(bpm: number): number {
  return Math.max(1, Math.round(bpm));
}
