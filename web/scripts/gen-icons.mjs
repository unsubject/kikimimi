#!/usr/bin/env node
// Generate the two PWA icons as valid PNGs with no external deps.
// Design: dark rounded field + amber "ear" arc mark. Purely geometric.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [0x1b, 0x1b, 0x1f];
const AMBER = [0xe8, 0xa3, 0x3d];

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const rOuter = size * 0.30;
  const rInner = size * 0.15;
  const corner = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let [r, g, b] = BG;
      let a = 255;

      // Rounded-rect mask (maskable-safe: full-bleed background).
      if (outsideRoundedRect(x, y, size, corner)) {
        a = 0;
      } else {
        const d = Math.hypot(x - cx, y - cy);
        // Amber ring (the "listening ear" arc), open on the right side.
        const angle = Math.atan2(y - cy, x - cx);
        const onRing = d > rInner && d < rOuter;
        const openGap = angle > -0.6 && angle < 0.6; // gap facing right
        if (onRing && !openGap) {
          [r, g, b] = AMBER;
        } else if (d <= rInner * 0.55) {
          // inner dot
          [r, g, b] = AMBER;
        }
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return px;
}

function outsideRoundedRect(x, y, size, corner) {
  const nx = Math.min(x, size - 1 - x);
  const ny = Math.min(y, size - 1 - y);
  if (nx >= corner || ny >= corner) return false;
  return Math.hypot(corner - nx, corner - ny) > corner;
}

function toPng(size, rgba) {
  // Add filter byte (0) per scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), toPng(size, render(size)));
  console.log(`wrote icon-${size}.png`);
}
