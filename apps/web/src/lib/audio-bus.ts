import { useEffect, useState } from "react";

/**
 * 全站只有一条「声音线」：正在响的那一路要能被别处掐掉。
 *
 * 为什么需要：节拍器（跟练、练习页）和试听是两套独立的 Web Audio 图，
 * 各有各的 `AudioContext` 和排程。用户点「跟练」再点「试听」，两边会同时响，
 * 节拍器还在"哒"，谱子也在弹，听起来就是两首歌叠在一起。
 *
 * 做法很轻：谁开始出声谁就先登记一个"怎么让我停下"的函数，
 * 登记时顺手把之前那位停掉。停的时候自己销号。
 */

const STORAGE_KEY = "guitar.audio.v1";

type Stopper = () => void;

const owners = new Map<symbol, Stopper>();

/** 登记这一路声音；会把别人停掉。返回一个「我停了」的收尾函数。 */
export function claimAudio(owner: symbol, stop: Stopper): () => void {
  for (const [key, stopper] of owners) {
    if (key === owner) continue;
    owners.delete(key);
    try {
      stopper();
    } catch {
      // 对方已经卸掉了，忽略
    }
  }
  owners.set(owner, stop);
  return () => {
    if (owners.get(owner) === stop) owners.delete(owner);
  };
}

/** 主动让出（例如组件卸载）。 */
export function releaseAudio(owner: symbol): void {
  owners.delete(owner);
}

/* ---------------------------------- 音量 ---------------------------------- */

function readVolume(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0.8;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0.8;
    return Math.min(1, Math.max(0, value));
  } catch {
    return 0.8;
  }
}

let volume = typeof window === "undefined" ? 0.8 : readVolume();
const listeners = new Set<(value: number) => void>();

export function getVolume(): number {
  return volume;
}

export function setVolume(next: number): void {
  const value = Math.min(1, Math.max(0, next));
  if (value === volume) return;
  volume = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // 存不了就只在本次会话里生效
  }
  for (const listener of listeners) listener(value);
}

/** 音量状态（0–1），节拍器和试听共用。 */
export function useAudioVolume(): [number, (value: number) => void] {
  const [value, setValue] = useState(getVolume);
  useEffect(() => {
    const listener = (next: number) => setValue(next);
    listeners.add(listener);
    setValue(getVolume());
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return [value, setVolume];
}

/** 音量滑杆的文案：留个百分比，不然只有一根条看不出调了多少。 */
export function volumeLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}
