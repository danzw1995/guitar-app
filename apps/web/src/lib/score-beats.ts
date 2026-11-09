import { useEffect, useState } from "react";
import { SCORES_VERSION } from "./scores-version";

/** 一拍在图上的横向区间（图片像素）。 */
export interface ScoreBeat {
  x: number;
  w: number;
}

export interface ScoreBeatMap {
  width: number;
  beats: ScoreBeat[];
}

/** `public/scores/beats.json` 的形状：跟图片同一次生成，`version` 是内容指纹。 */
interface BeatFile {
  version: string;
  beats: Record<string, ScoreBeatMap>;
}

type BeatIndex = Record<string, ScoreBeatMap>;

/**
 * 每张谱图的「第几拍在哪里」。
 *
 * 由 `pnpm --filter @guitar/web run gen:scores` 跟图片一起生成（`public/scores/beats.json`），
 * 播放时拿它画一条跟着走的竖条——静态图没法自己知道拍子在哪。
 *
 * 模块级缓存：68 张谱共用一次请求，切页面回来不重新拉。
 */
let cache: BeatIndex | null = null;
let pending: Promise<BeatIndex> | null = null;

async function loadBeats(): Promise<BeatIndex> {
  if (cache) return cache;
  pending ??= fetch(`${import.meta.env.BASE_URL}scores/beats.json?v=${SCORES_VERSION}`)
    .then((response) => (response.ok ? (response.json() as Promise<BeatFile>) : null))
    .then((data) => {
      cache = data?.beats ?? {};
      return cache;
    })
    .catch(() => {
      cache = {};
      return cache;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** 读谱图的拍位；没生成或还没拉到时返回空表（高亮不画，不影响其它功能）。 */
export function useScoreBeats(): BeatIndex {
  const [index, setIndex] = useState<BeatIndex>(() => cache ?? {});
  useEffect(() => {
    let alive = true;
    void loadBeats().then((data) => {
      if (alive) setIndex(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  return index;
}
