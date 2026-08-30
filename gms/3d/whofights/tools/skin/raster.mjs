// A 200-line RGBA canvas with a PNG writer, because the template has to be emitted by a plain node
// script and this project has no dependencies and no build step. Only what the guide needs:
// polygon fill, polyline stroke, and a 5×7 bitmap font.

import { deflateSync, inflateSync } from 'node:zlib';

const F = [
  ['A', '.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  ['B', '####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  ['C', '.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  ['D', '####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  ['E', '#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  ['F', '#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  ['G', '.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
  ['H', '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  ['I', '#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  ['J', '....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  ['K', '#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  ['L', '#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  ['M', '#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  ['N', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  ['O', '.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['P', '####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  ['Q', '.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  ['R', '####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  ['S', '.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  ['T', '#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  ['U', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['V', '#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  ['W', '#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  ['X', '#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  ['Y', '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  ['Z', '#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ['0', '.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  ['1', '..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  ['2', '.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  ['3', '####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  ['4', '...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  ['5', '#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ['6', '.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  ['7', '#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  ['8', '.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  ['9', '.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  [' ', '.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  ['-', '.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ['.', '.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  [':', '.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ['/', '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ['(', '..##.', '.#...', '#....', '#....', '#....', '.#...', '..##.'],
  [')', '.##..', '...#.', '....#', '....#', '....#', '...#.', '.##..'],
  ['+', '.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ['<', '...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  ['>', '.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
];
const GLYPHS = Object.fromEntries(F.map(r => [r[0], r.slice(1).join('')]));

// Every glyph is 5 wide, 7 tall, packed row-major as '#' and '.'; the table above is written
// loosely, so anything short is padded and anything long is trimmed.
function glyph(ch) {
  const s = (GLYPHS[ch] || GLYPHS[' '] || '').padEnd(35, '.').slice(0, 35);
  return s;
}

export class Canvas {
  constructor(w, h, bg = [255, 255, 255, 255]) {
    this.w = w; this.h = h;
    this.d = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) this.d.set(bg, i * 4);
  }

  px(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 1) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; return; }
    for (let k = 0; k < 3; k++) this.d[i + k] = Math.round(this.d[i + k] * (1 - a) + c[k] * a);
    this.d[i + 3] = 255;
  }

  rect(x0, y0, x1, y1, c) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1 | 0); x++) this.px(x, y, c);
  }

  // Even-odd scanline fill of any simple polygon, so a slanted limb quad fills correctly.
  fill(pts, c, a = 1) {
    if (pts.length < 3) return;
    const ys = pts.map(p => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        if ((p[1] > yc) === (q[1] > yc)) continue;
        xs.push(p[0] + (yc - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.px(x, y, c, a);
    }
  }

  line(p, q, c, wide = 1, a = 1) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
    const r = (wide - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = p[0] + dx * i / n, y = p[1] + dy * i / n;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) this.px(x + ox, y + oy, c, a);
    }
  }

  poly(pts, c, wide = 1, a = 1) {
    for (let i = 0; i < pts.length; i++) this.line(pts[i], pts[(i + 1) % pts.length], c, wide, a);
  }

  text(str, x, y, c, scale = 2, align = 'left') {
    const s = String(str).toUpperCase();
    const wpx = s.length * 6 * scale - scale;
    const ox = align === 'centre' ? x - wpx / 2 : align === 'right' ? x - wpx : x;
    for (let i = 0; i < s.length; i++) {
      const g = glyph(s[i]);
      for (let r = 0; r < 7; r++) for (let cc = 0; cc < 5; cc++) {
        if (g[r * 5 + cc] !== '#') continue;
        this.rect(ox + (i * 6 + cc) * scale, y + r * scale,
          ox + (i * 6 + cc + 1) * scale, y + (r + 1) * scale, c);
      }
    }
    return wpx;
  }

  png() {
    const { w, h } = this;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      this.d.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Minimal PNG reader for the checks that read a generated skin back — 8-bit RGB/RGBA, no
// interlacing, which is everything mflux writes.
export function readPNG(buf) {
  let i = 8, w = 0, h = 0, ct = 0, bits = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bits = data[8]; ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    i += 12 + len;
  }
  if (bits !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported PNG (bits ${bits}, colour ${ct})`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  const prev = Buffer.alloc(stride);
  let cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = cur[x * bpp];
      out[(y * w + x) * 4 + 1] = cur[x * bpp + 1];
      out[(y * w + x) * 4 + 2] = cur[x * bpp + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    cur.copy(prev);
  }
  return { w, h, d: out };
}
