// Minimal PNG codec + raster ops. No native deps: node zlib does the compression,
// everything else is hand-rolled because this machine has no PIL and no ImageMagick.
const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

class Img {
  constructor(w, h, data) {
    this.w = w; this.h = h;
    this.data = data || new Uint8Array(w * h * 4);
  }
  static blank(w, h, r = 0, g = 0, b = 0, a = 0) {
    const im = new Img(w, h);
    for (let i = 0; i < w * h; i++) { im.data[i*4]=r; im.data[i*4+1]=g; im.data[i*4+2]=b; im.data[i*4+3]=a; }
    return im;
  }
  clone() { return new Img(this.w, this.h, Uint8Array.from(this.data)); }
  idx(x, y) { return (y * this.w + x) * 4; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0,0,0,0];
    const i = this.idx(x, y), d = this.data;
    return [d[i], d[i+1], d[i+2], d[i+3]];
  }
}

// ---------- decode ----------

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, w = 0, h = 0, depth = 8, ctype = 6, pal = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
    } else if (type === 'PLTE') pal = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit png supported, got ' + depth);
  const chan = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (chan === undefined) throw new Error('bad colour type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chan;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const x = raw[rp + i];
      const a = i >= chan ? cur[i - chan] : 0;
      const b = prev[i];
      const c = i >= chan ? prev[i - chan] : 0;
      cur[i] = filter === 0 ? x : filter === 1 ? (x + a) : filter === 2 ? (x + b)
             : filter === 3 ? (x + ((a + b) >> 1)) : (x + paeth(a, b, c));
    }
    rp += stride;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 6) { out[o]=cur[x*4]; out[o+1]=cur[x*4+1]; out[o+2]=cur[x*4+2]; out[o+3]=cur[x*4+3]; }
      else if (ctype === 2) { out[o]=cur[x*3]; out[o+1]=cur[x*3+1]; out[o+2]=cur[x*3+2]; out[o+3]=255; }
      else if (ctype === 0) { const v=cur[x]; out[o]=out[o+1]=out[o+2]=v; out[o+3]=255; }
      else if (ctype === 4) { const v=cur[x*2]; out[o]=out[o+1]=out[o+2]=v; out[o+3]=cur[x*2+1]; }
      else { const p=cur[x]; out[o]=pal[p*3]; out[o+1]=pal[p*3+1]; out[o+2]=pal[p*3+2];
             out[o+3]= trns && p < trns.length ? trns[p] : 255; }
    }
    prev.set(cur);
  }
  return new Img(w, h, out);
}

const readPNG = p => decodePNG(fs.readFileSync(p));

/** readPNG, but tolerates the JPEG skies by bouncing them through ffmpeg. */
function readImage(p) {
  if (p.toLowerCase().endsWith('.png')) return readPNG(p);
  const os = require('os'), pathm = require('path'), { execFileSync } = require('child_process');
  const tmp = pathm.join(os.tmpdir(), `sfimg_${process.pid}_${Math.random().toString(36).slice(2)}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', p, tmp]);
  const im = readPNG(tmp);
  fs.unlinkSync(tmp);
  return im;
}

// ---------- encode ----------

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Adaptive per-row filtering (the standard minimum-sum-of-absolute-differences heuristic).
function filterRows(px, w, h, chan) {
  const stride = w * chan;
  const out = Buffer.alloc((stride + 1) * h);
  const prev = new Uint8Array(stride);
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride),
                new Uint8Array(stride), new Uint8Array(stride)];
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * stride, y * stride + stride);
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = row[i];
        const a = i >= chan ? row[i - chan] : 0;
        const b = prev[i];
        const cc = i >= chan ? prev[i - chan] : 0;
        const v = f === 0 ? x : f === 1 ? x - a : f === 2 ? x - b
                : f === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, cc);
        c[i] = v & 0xff;
        score += c[i] < 128 ? c[i] : 256 - c[i];
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    out[y * (stride + 1)] = best;
    Buffer.from(cand[best].buffer, 0, stride).copy(out, y * (stride + 1) + 1);
    prev.set(row);
  }
  return out;
}

function writePNG(path, img, opts = {}) {
  const { w, h } = img;
  let chan = 4, px;
  const opaque = !opts.forceAlpha && isOpaque(img);
  if (opaque) {
    chan = 3;
    px = new Uint8Array(w * h * 3);
    for (let i = 0, o = 0; i < w * h; i++) { px[o++]=img.data[i*4]; px[o++]=img.data[i*4+1]; px[o++]=img.data[i*4+2]; }
  } else {
    px = img.data;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = chan === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = filterRows(px, w, h, chan);
  const z = zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', Buffer.alloc(0)),
  ]));
  return fs.statSync(path).size;
}

function isOpaque(img) {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) return false;
  return true;
}

// ---------- PNG8: median-cut palette with alpha, Floyd-Steinberg dither ----------

function quantize(img, maxColors = 255, dither = true) {
  const n = img.w * img.h, d = img.data;
  // Fully transparent pixels all collapse to one palette slot.
  const boxes = [];
  const pixels = [];
  for (let i = 0; i < n; i++) if (d[i*4+3] > 8) pixels.push(i);
  if (!pixels.length) return { pal: [[0,0,0,0]], idx: new Uint8Array(n) };
  let cuts = [{ list: pixels }];
  const chanOf = (i, c) => d[i*4+c];
  while (cuts.length < maxColors) {
    let bi = -1, bestRange = -1;
    for (let k = 0; k < cuts.length; k++) {
      const box = cuts[k];
      if (box.list.length < 2) continue;
      if (box.range === undefined) {
        let r = 0, which = 0;
        for (let c = 0; c < 4; c++) {
          let lo = 255, hi = 0;
          for (const i of box.list) { const v = chanOf(i, c); if (v < lo) lo = v; if (v > hi) hi = v; }
          const w = (hi - lo) * (c === 3 ? 1.4 : 1);
          if (w > r) { r = w; which = c; }
        }
        box.range = r; box.axis = which;
      }
      if (box.range > bestRange) { bestRange = box.range; bi = k; }
    }
    if (bi < 0 || bestRange <= 0) break;
    const box = cuts[bi];
    const ax = box.axis;
    box.list.sort((p, q) => chanOf(p, ax) - chanOf(q, ax));
    const mid = box.list.length >> 1;
    cuts.splice(bi, 1, { list: box.list.slice(0, mid) }, { list: box.list.slice(mid) });
  }
  const pal = [[0, 0, 0, 0]];
  for (const box of cuts) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const i of box.list) { r += d[i*4]; g += d[i*4+1]; b += d[i*4+2]; a += d[i*4+3]; }
    const L = box.list.length;
    pal.push([Math.round(r/L), Math.round(g/L), Math.round(b/L), Math.round(a/L)]);
  }
  const nearest = (r, g, b, a) => {
    if (a <= 8) return 0;
    let best = 1, bd = Infinity;
    for (let k = 1; k < pal.length; k++) {
      const p = pal[k];
      const da = p[3] - a;
      const dr = p[0]-r, dg = p[1]-g, db = p[2]-b;
      const dist = dr*dr*0.3 + dg*dg*0.59 + db*db*0.11 + da*da*1.6;
      if (dist < bd) { bd = dist; best = k; }
    }
    return best;
  };
  const idx = new Uint8Array(n);
  const err = dither ? new Float32Array(n * 4) : null;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      let r = d[i*4], g = d[i*4+1], b = d[i*4+2], a = d[i*4+3];
      if (err) {
        r = Math.max(0, Math.min(255, r + err[i*4]));
        g = Math.max(0, Math.min(255, g + err[i*4+1]));
        b = Math.max(0, Math.min(255, b + err[i*4+2]));
        a = Math.max(0, Math.min(255, a + err[i*4+3]));
      }
      const k = nearest(r, g, b, a);
      idx[i] = k;
      if (err) {
        const p = pal[k];
        const e = [r - p[0], g - p[1], b - p[2], a - p[3]];
        const spread = (nx, ny, f) => {
          if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) return;
          const j = (ny * img.w + nx) * 4;
          for (let c = 0; c < 4; c++) err[j + c] += e[c] * f;
        };
        spread(x+1, y, 7/16); spread(x-1, y+1, 3/16); spread(x, y+1, 5/16); spread(x+1, y+1, 1/16);
      }
    }
  }
  return { pal, idx };
}

function writePNG8(path, img, maxColors = 255, dither = true) {
  const { pal, idx } = quantize(img, maxColors, dither);
  const { w, h } = img;
  const plte = Buffer.alloc(pal.length * 3);
  const trns = Buffer.alloc(pal.length);
  let anyAlpha = false;
  pal.forEach((p, i) => { plte[i*3]=p[0]; plte[i*3+1]=p[1]; plte[i*3+2]=p[2]; trns[i]=p[3]; if (p[3] !== 255) anyAlpha = true; });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3;
  const raw = filterRows(idx, w, h, 1);
  const z = zlib.deflateSync(raw, { level: 9, memLevel: 9 });
  const parts = [Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (anyAlpha) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', z), chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(path, Buffer.concat(parts));
  return fs.statSync(path).size;
}

/** Write whichever of truecolour / palette PNG is smaller. */
function writeSmallest(path, img, maxColors = 255) {
  const a = path + '.a.tmp', b = path + '.b.tmp';
  const sa = writePNG(a, img);
  let sb = Infinity;
  try { sb = writePNG8(b, img, maxColors); } catch (e) { /* fall through */ }
  if (sb < sa) { fs.renameSync(b, path); try { fs.unlinkSync(a); } catch {} }
  else { fs.renameSync(a, path); try { fs.unlinkSync(b); } catch {} }
  return fs.statSync(path).size;
}

// ---------- raster ops ----------

function resize(img, nw, nh) {
  const out = new Img(nw, nh);
  const sx = img.w / nw, sy = img.h / nh;
  const d = img.data, o = out.data;
  for (let y = 0; y < nh; y++) {
    const y0 = y * sy, y1 = Math.min(img.h, (y + 1) * sy);
    const iy0 = Math.floor(y0), iy1 = Math.max(iy0 + 1, Math.ceil(y1));
    for (let x = 0; x < nw; x++) {
      const x0 = x * sx, x1 = Math.min(img.w, (x + 1) * sx);
      const ix0 = Math.floor(x0), ix1 = Math.max(ix0 + 1, Math.ceil(x1));
      let r=0,g=0,b=0,a=0,wsum=0;
      for (let yy = iy0; yy < iy1 && yy < img.h; yy++) {
        const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = ix0; xx < ix1 && xx < img.w; xx++) {
          const fx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const wgt = Math.max(0, fx) * Math.max(0, fy);
          if (wgt <= 0) continue;
          const i = (yy * img.w + xx) * 4;
          const al = d[i+3] / 255;
          r += d[i] * al * wgt; g += d[i+1] * al * wgt; b += d[i+2] * al * wgt;
          a += d[i+3] * wgt; wsum += wgt;
        }
      }
      const j = (y * nw + x) * 4;
      if (wsum <= 0 || a <= 0) { o[j]=o[j+1]=o[j+2]=o[j+3]=0; continue; }
      const alpha = a / wsum;
      const norm = alpha / 255 * wsum;
      o[j] = Math.round(r / norm); o[j+1] = Math.round(g / norm); o[j+2] = Math.round(b / norm);
      o[j+3] = Math.round(alpha);
    }
  }
  return out;
}

function crop(img, x, y, w, h) {
  const out = new Img(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sxp = x + xx, syp = y + yy;
      const j = (yy * w + xx) * 4;
      if (sxp < 0 || syp < 0 || sxp >= img.w || syp >= img.h) continue;
      const i = (syp * img.w + sxp) * 4;
      out.data[j]=img.data[i]; out.data[j+1]=img.data[i+1]; out.data[j+2]=img.data[i+2]; out.data[j+3]=img.data[i+3];
    }
  }
  return out;
}

/** src over dst at (dx,dy), straight (non-premultiplied) alpha. */
function composite(dst, src, dx, dy, globalAlpha = 1) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      const si = (y * src.w + x) * 4, di = (ty * dst.w + tx) * 4;
      const sa = src.data[si+3] / 255 * globalAlpha;
      if (sa <= 0) continue;
      const da = dst.data[di+3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[di+c] = Math.round((src.data[si+c] * sa + dst.data[di+c] * da * (1 - sa)) / oa);
      }
      dst.data[di+3] = Math.round(oa * 255);
    }
  }
  return dst;
}

function alphaBBox(img, threshold = 4) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y*img.w+x)*4+3] > threshold) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function trim(img, pad = 0) {
  const bb = alphaBBox(img);
  if (!bb) return { img: new Img(1, 1), off: { x: 0, y: 0 } };
  const x = bb.x - pad, y = bb.y - pad, w = bb.w + pad * 2, h = bb.h + pad * 2;
  return { img: crop(img, x, y, w, h), off: { x, y } };
}

/** Separable box blur on premultiplied alpha, `passes` iterations approximates a gaussian. */
function blur(img, radius, passes = 3) {
  if (radius < 1) return img.clone();
  const n = img.w * img.h;
  let r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const al = img.data[i*4+3] / 255;
    r[i] = img.data[i*4] * al; g[i] = img.data[i*4+1] * al; b[i] = img.data[i*4+2] * al; a[i] = img.data[i*4+3];
  }
  const chans = [r, g, b, a];
  const run = (src, w, h) => {
    const dst = new Float32Array(src.length);
    const win = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[y*w + Math.max(0, Math.min(w-1, k))];
      for (let x = 0; x < w; x++) {
        dst[y*w+x] = sum / win;
        sum -= src[y*w + Math.max(0, Math.min(w-1, x - radius))];
        sum += src[y*w + Math.max(0, Math.min(w-1, x + radius + 1))];
      }
    }
    return dst;
  };
  const transpose = (src, w, h) => {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dst[x*h+y] = src[y*w+x];
    return dst;
  };
  for (let p = 0; p < passes; p++) {
    for (let c = 0; c < 4; c++) {
      let t = run(chans[c], img.w, img.h);
      t = transpose(t, img.w, img.h);
      t = run(t, img.h, img.w);
      chans[c] = transpose(t, img.h, img.w);
    }
  }
  const out = new Img(img.w, img.h);
  for (let i = 0; i < n; i++) {
    const al = chans[3][i];
    out.data[i*4+3] = Math.max(0, Math.min(255, Math.round(al)));
    if (al <= 0.5) continue;
    const s = 255 / al;
    out.data[i*4] = Math.max(0, Math.min(255, Math.round(chans[0][i] * s)));
    out.data[i*4+1] = Math.max(0, Math.min(255, Math.round(chans[1][i] * s)));
    out.data[i*4+2] = Math.max(0, Math.min(255, Math.round(chans[2][i] * s)));
  }
  return out;
}

const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;

/**
 * Colour grade in place-ish. opts:
 *  gamma, brightness (add), contrast (1=none), saturation (1=none),
 *  tint [r,g,b] multiplier, mix {color:[r,g,b], amount} flat colour blend,
 *  levels {inLo,inHi,outLo,outHi}
 */
function grade(img, opts = {}) {
  const out = img.clone();
  const d = out.data;
  const { gamma = 1, brightness = 0, contrast = 1, saturation = 1, tint = null, mix = null, levels = null } = opts;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] === 0) continue;
    let c = [d[i], d[i+1], d[i+2]];
    if (levels) {
      const { inLo = 0, inHi = 255, outLo = 0, outHi = 255 } = levels;
      c = c.map(v => outLo + (outHi - outLo) * Math.max(0, Math.min(1, (v - inLo) / (inHi - inLo))));
    }
    if (gamma !== 1) c = c.map(v => 255 * Math.pow(v / 255, gamma));
    if (contrast !== 1) c = c.map(v => 128 + (v - 128) * contrast);
    if (brightness) c = c.map(v => v + brightness);
    if (saturation !== 1) {
      const l = c[0]*0.299 + c[1]*0.587 + c[2]*0.114;
      c = c.map(v => l + (v - l) * saturation);
    }
    if (tint) c = c.map((v, k) => v * tint[k]);
    if (mix) c = c.map((v, k) => v + (mix.color[k] - v) * mix.amount);
    d[i] = clamp255(Math.round(c[0])); d[i+1] = clamp255(Math.round(c[1])); d[i+2] = clamp255(Math.round(c[2]));
  }
  return out;
}

/** Per-pixel callback: fn(r,g,b,a,x,y) -> [r,g,b,a]. */
function mapPixels(img, fn) {
  const out = img.clone(), d = out.data;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    const v = fn(d[i], d[i+1], d[i+2], d[i+3], x, y);
    if (v) { d[i]=clamp255(v[0]); d[i+1]=clamp255(v[1]); d[i+2]=clamp255(v[2]); d[i+3]=clamp255(v[3]); }
  }
  return out;
}

function multiplyAlphaMask(img, maskFn) {
  return mapPixels(img, (r, g, b, a, x, y) => [r, g, b, a * maskFn(x, y)]);
}

module.exports = {
  Img, readPNG, readImage, decodePNG, writePNG, writePNG8, writeSmallest, quantize,
  resize, crop, composite, alphaBBox, trim, blur, grade, mapPixels, multiplyAlphaMask, isOpaque, clamp255,
};
