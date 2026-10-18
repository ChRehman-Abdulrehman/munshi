import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let idx = 0;
  for (let y = 0; y < height; y++) {
    raw[idx++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[idx++] = r;
      raw[idx++] = g;
      raw[idx++] = b;
      raw[idx++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const EMERALD = [11, 107, 79];
const WHITE = [255, 255, 255];
const SAFFRON = [242, 169, 59];
const CREAM = [251, 247, 240];

function iconPixel(size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = maskable ? size * 0.22 : size * 0.08;
  const rOuter = size / 2 - pad;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rx = Math.abs(dx) / (size / 2);
    const ry = Math.abs(dy) / (size / 2);
    const cornerCut = Math.min(rx, ry) > 0.7 && rx * rx + ry * ry > 0.85;
    const bg = maskable ? EMERALD : cornerCut ? CREAM : EMERALD;

    const micR = rOuter * 0.55;
    if (dist <= micR) {
      const inMicBody = Math.abs(dx) < micR * 0.42 && dy > -micR * 0.75 && dy < micR * 0.55;
      const inMicArc = dy > micR * 0.42 && dy < micR * 0.72 && Math.abs(dx) < micR * 0.62;
      const inMicStem = Math.abs(dx) < micR * 0.1 && dy >= micR * 0.55 && dy < micR * 0.95;
      if (inMicBody || inMicArc || inMicStem) return [...EMERALD, 255];
      return [...WHITE, 255];
    }
    const dotDist = Math.sqrt((x - (cx + rOuter * 0.62)) ** 2 + (y - (cy - rOuter * 0.62)) ** 2);
    if (dotDist <= rOuter * 0.16) return [...SAFFRON, 255];
    return [...bg, 255];
  };
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["icon-180.png", 180, false],
]) {
  const buf = png(size, size, iconPixel(size, maskable));
  writeFileSync(join(outDir, name), buf);
  console.log("wrote", name);
}
