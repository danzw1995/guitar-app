/**
 * 生成 PWA 图标（192 / 512 PNG）。
 *
 * 不装 sharp / canvas：直接画像素 + 手写 PNG 编码（zlib deflate + CRC32），
 * 因此在没有原生依赖、也起不了子进程的环境里同样能跑。
 *
 *   node apps/web/scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [13, 17, 23, 255]; // #0d1117
const BOARD = [22, 27, 34, 255]; // #161b22
const EDGE = [48, 54, 61, 255]; // #30363d
const STRING = [139, 148, 158, 255]; // #8b949e
const GOLD = [212, 167, 44, 255]; // #d4a72c
const BLUE = [59, 130, 246, 255]; // #3b82f6

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const insideRounded = (x, y, size, radius) => {
  const r = radius;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= size - r) || (y >= r && y <= size - r);
};

/** 画一张 size×size 的图标：深色底 + 指板（弦/品丝）+ 两个音点。 */
function drawIcon(size, { rounded = true } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = color[3];
  };

  const radius = rounded ? size * 0.22 : 0;
  const pad = size * 0.16;
  const boardX = pad;
  const boardY = size * 0.2;
  const boardW = size - pad * 2;
  const boardH = size * 0.6;
  const boardR = size * 0.08;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!insideRounded(x, y, size, radius)) {
        put(x, y, [0, 0, 0, 0]);
        continue;
      }
      put(x, y, BG);
      // 指板底板
      const bx = x - boardX;
      const by = y - boardY;
      if (bx >= 0 && by >= 0 && bx <= boardW && by <= boardH) {
        const cornerR = boardR;
        const ccx = Math.min(Math.max(bx, cornerR), boardW - cornerR);
        const ccy = Math.min(Math.max(by, cornerR), boardH - cornerR);
        const inBoard = (bx - ccx) ** 2 + (by - ccy) ** 2 <= cornerR * cornerR
          || (bx >= cornerR && bx <= boardW - cornerR)
          || (by >= cornerR && by <= boardH - cornerR);
        if (inBoard) {
          const onEdgeX = bx <= 1.5 || bx >= boardW - 1.5;
          const onEdgeY = by <= 1.5 || by >= boardH - 1.5;
          put(x, y, onEdgeX || onEdgeY ? EDGE : BOARD);
        }
      }
    }
  }

  // 品丝（横向）
  const fretThickness = Math.max(1, Math.round(size * 0.008));
  for (const ratio of [0.25, 0.5, 0.75]) {
    const y = Math.round(boardY + boardH * ratio);
    for (let t = 0; t < fretThickness; t++) {
      for (let x = Math.round(boardX); x <= Math.round(boardX + boardW); x++) put(x, y + t, EDGE);
    }
  }

  // 琴弦（纵向，6 根，粗细递增）
  const strings = 6;
  for (let s = 0; s < strings; s++) {
    const x = Math.round(boardX + (boardW * (s + 1)) / (strings + 1));
    const thickness = Math.max(1, Math.round(size * (0.004 + s * 0.0016)));
    for (let t = 0; t < thickness; t++) {
      for (let y = Math.round(boardY); y <= Math.round(boardY + boardH); y++) put(x + t, y, STRING);
    }
  }

  // 两个音点：主音（金）+ 音阶音（蓝）
  const dot = (cx, cy, r, color) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, color);
      }
    }
  };
  dot(boardX + boardW * 0.38, boardY + boardH * 0.3, size * 0.075, GOLD);
  dot(boardX + boardW * 0.66, boardY + boardH * 0.58, size * 0.075, BLUE);

  return encodePng(size, size, px);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = drawIcon(size);
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote icon-${size}.png (${size}×${size}, ${png.length} bytes)`);
}

// maskable 版本：Android 启动器会自己裁形状，所以提供一张全出血、无透明边角的图
const maskable = drawIcon(512, { rounded: false });
writeFileSync(join(OUT_DIR, "icon-maskable-512.png"), maskable);
console.log(`wrote icon-maskable-512.png (512×512, ${maskable.length} bytes)`);
