/**
 * Generates media/icon.png (128x128): violet rounded square + white sparkle.
 * Pure Node (zlib PNG encoding) — no image deps. Run: node scripts/make-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const W = 128;
const H = 128;
const R = 28; // corner radius

const px = Buffer.alloc(W * H * 4);

function inRoundedRect(x, y) {
  const cx = Math.min(Math.max(x, R), W - R);
  const cy = Math.min(Math.max(y, R), H - R);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}

function inSparkle(x, y, cx, cy, s) {
  const dx = Math.abs(x - cx) / s;
  const dy = Math.abs(y - cy) / s;
  return Math.sqrt(dx) + Math.sqrt(dy) <= 1;
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!inRoundedRect(x, y)) {
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 0;
      continue;
    }
    // violet gradient: #8B5CF6 top → #6D28D9 bottom
    const t = y / H;
    let r = Math.round(139 - 30 * t);
    let g = Math.round(92 - 20 * t);
    let b = Math.round(246 - 45 * t);

    // main sparkle
    if (inSparkle(x, y, 64, 60, 42)) {
      r = 255;
      g = 255;
      b = 255;
    }
    // small companion dot
    const ddx = x - 92;
    const ddy = y - 92;
    if (ddx * ddx + ddy * ddy <= 49) {
      r = 255;
      g = 255;
      b = 255;
    }

    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
}

// PNG encode
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// filter bytes: one 0 per row
const raw = Buffer.concat(
  Array.from({ length: H }, () => {
    const row = Buffer.alloc(1 + W * 4);
    px.copy(row, 1, 0, W * 4); // placeholder copy; replaced below
    return row;
  })
);
// rebuild properly (rows advance by W*4)
{
  let off = 0;
  for (let y = 0; y < H; y++) {
    raw[off] = 0;
    px.copy(raw, off + 1, y * W * 4, (y + 1) * W * 4);
    off += 1 + W * 4;
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("media", { recursive: true });
writeFileSync("media/icon.png", png);
console.log(`media/icon.png written (${png.length} bytes)`);
