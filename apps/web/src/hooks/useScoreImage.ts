import { useEffect, useState } from "react";
import { renderScoreImage, type ScoreImage } from "../lib/score-image";

export interface ImageState {
  image?: ScoreImage;
  error?: string;
}

/**
 * 一份 alphaTex → 一张 PNG（失败只记错误，不抛）。
 *
 * `tex` 为 `null` 时清空——调用方靠这个在「还没到要画的时候」省掉一次渲染。
 * `minWidth` 透传给 `renderScoreImage`：单个和弦那种一格的谱可以画窄一点。
 */
export function useScoreImage(tex: string | null, minWidth?: number): ImageState {
  const [state, setState] = useState<ImageState>({});
  useEffect(() => {
    if (!tex) {
      setState({});
      return;
    }
    let alive = true;
    setState({});
    renderScoreImage(tex, minWidth === undefined ? {} : { minWidth })
      .then((image) => {
        if (alive) setState({ image });
      })
      .catch((error: unknown) => {
        if (alive) setState({ error: (error as Error).message });
      });
    return () => {
      alive = false;
    };
  }, [tex, minWidth]);
  return state;
}
