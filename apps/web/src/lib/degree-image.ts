import type { Tab } from "@guitar/core";
import { degreeLine } from "./degrees";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图读不出来"));
    image.src = src;
  });
}

/**
 * 导出的 PNG 底下加一条「级数 1 → 6 → 5」（v0.97.0）。
 *
 * 谱图上只有音高和指法，分享出去别人看不出走向；底下补一行级数，
 * 一眼就知道这是 1–5–6–4 还是 6–4–1–5。算不出级数（只有一个和弦、
 * 或者全是调外音）就不加，图保持原样。
 */
export async function withDegreeStrip(
  dataUrl: string,
  tab: Tab,
  label = "级数",
): Promise<string> {
  const line = degreeLine(tab);
  if (!line) return dataUrl;

  const image = await loadImage(dataUrl);
  const scale = 2;
  const strip = 26 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + strip;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  ctx.fillStyle = "#e8b04b";
  ctx.font = `600 ${11 * scale}px "Noto Sans SC", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`${label} ${line}`, 10 * scale, image.naturalHeight + strip / 2);

  return canvas.toDataURL("image/png");
}
