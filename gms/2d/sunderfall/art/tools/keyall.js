// Key every raw render once and cache the result, so the compositor never re-does it.
//   node keyall.js [--force]
const fs = require('fs');
const path = require('path');
const { readPNG, writePNG, trim } = require('./img.js');
const { key } = require('./key.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'work', 'keyed');

// glow art is rendered on black and keyed by brightness instead
const LUMA = /^(el_barrier|el_shaft)/;
// near-black silhouette art: key on darkness, so a painted backdrop glow cannot survive
const INVLUMA = /^(el_canopy|el_fern_b)/;
// skies and seamless textures are full-frame images with no matte at all
const OPAQUE = /^(sky_|tx_forestfloor|tx_rock|tx_masonry|tx_dirt|t_full)/;

/** Ramp alpha to zero over the outer `frac` of each axis. */
function fadeBorder(im, frac) {
  const fx = Math.max(1, im.w * frac), fy = Math.max(1, im.h * frac);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const kx = Math.min(1, Math.min(x, im.w - 1 - x) / fx);
    const ky = Math.min(1, Math.min(y, im.h - 1 - y) / fy);
    const k = Math.min(kx, ky);
    const i = (y * im.w + x) * 4;
    im.data[i + 3] = Math.round(im.data[i + 3] * k * k * (3 - 2 * k));
  }
  return im;
}

const force = process.argv.includes('--force');
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(RAW).sort()) {
  if (!f.endsWith('.png') || f.startsWith('t_')) continue;
  const dst = path.join(OUT, f);
  if (!force && fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(path.join(RAW, f)).mtimeMs) continue;
  const src = readPNG(path.join(RAW, f));
  if (OPAQUE.test(f)) { writePNG(dst, src); n++; continue; }
  let im = LUMA.test(f)
    ? key(src, { mode: 'luma', lo: 10, hi: 120 })
    : INVLUMA.test(f)
    ? trim(key(src, { mode: 'invluma', lo: 30, hi: 105 }), 2).img
    : trim(key(src, { lo: 8, hi: 26, shrink: 0.06 }), 2).img;
  if (/^el_shaft/.test(f)) im = fadeBorder(im, 0.22);   // otherwise the render's rectangle shows
  writePNG(dst, im, { forceAlpha: true });
  n++;
  console.log(f, im.w + 'x' + im.h);
}
console.log(`keyed ${n}`);
