// Extract the SHARED paper grain from one of our own plates.
//
// P5 says the texture of paint is visible at rest, and the painted plates already carry it for
// free. Props do not. Rather than invent a synthetic noise that looks like film grain, this pulls
// the actual paper tooth out of p08 (the hero plate) with a high-pass, throws away the paint
// strokes and the object edges, and writes a zero-mean grey field that `poster.js` multiplies back
// in. So a baked prop carries literally the same tooth as the painted layers it will sit against.
//
// Donor default is p01_sky_dawn: its best window is bare washed paper, where p08's best window
// still carries two cloud rims (compare /tmp scratch renders in the ART_PROPS.md notes). Any of
// our own probe plates works — it is the same paper prior in all of them.
//
//   node grain.js [srcPlate] [outPng] [tileSize]
//
// Deterministic: same plate in, same tile out.
const { readPNG, writePNG, Img, crop, blur } = require('./img.js');
const path = require('path');

/** Zero-mean high-pass luma of an image, as a Float32Array in units of its own sigma. */
function highpass(img, radius = 3) {
  const lo = blur(img, radius, 3);
  const n = img.w * img.h;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = img.data[i*4] * 0.299 + img.data[i*4+1] * 0.587 + img.data[i*4+2] * 0.114;
    const b = lo.data[i*4] * 0.299 + lo.data[i*4+1] * 0.587 + lo.data[i*4+2] * 0.114;
    f[i] = a - b;
  }
  return f;
}

/**
 * Pick the tile-sized window with the fewest hard edges. A window over the wing or a cloud rim is
 * full of ±40 spikes that are drawing, not paper; a window over washed sky is all tooth.
 */
function bestWindow(f, w, h, tile, step = 16) {
  let sigma = 0;
  for (let i = 0; i < f.length; i++) sigma += f[i] * f[i];
  sigma = Math.sqrt(sigma / f.length);
  // "Structure" = local mean of |highpass| at a scale well above the paper tooth. Paper is
  // uniform at that scale; a cloud rim or a strut is not. Minimising it finds bare paper.
  const structure = new Img(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(255, Math.abs(f[i]) * 6);
    structure.data[i*4] = structure.data[i*4+1] = structure.data[i*4+2] = v;
    structure.data[i*4+3] = 255;
  }
  const sm = blur(structure, 8, 2);
  let best = null, bestScore = Infinity;
  for (let y = 0; y + tile <= h; y += step) {
    for (let x = 0; x + tile <= w; x += step) {
      let s = 0, n = 0;
      for (let yy = y; yy < y + tile; yy += 4)
        for (let xx = x; xx < x + tile; xx += 4) { s += sm.data[(yy * w + xx) * 4]; n++; }
      s /= n;
      if (s < bestScore) { bestScore = s; best = { x, y }; }
    }
  }
  return { win: best, sigma, spike: sigma * 2, score: bestScore };
}

function build(srcPath, tile = 384) {
  const src = readPNG(srcPath);
  const f = highpass(src, 2);
  const { win, sigma, spike } = bestWindow(f, src.w, src.h, tile);
  const out = new Img(tile, tile);
  // Clip the residual spikes, then renormalise so the field is ±1 at 2 sigma.
  for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
    let v = f[(win.y + y) * src.w + (win.x + x)];
    if (v > spike) v = spike; else if (v < -spike) v = -spike;
    const g = Math.max(0, Math.min(255, Math.round(128 + v / (2 * sigma) * 127)));
    const i = (y * tile + x) * 4;
    out.data[i] = out.data[i+1] = out.data[i+2] = g;
    out.data[i+3] = 255;
  }
  return { img: out, win, sigma };
}

/**
 * Load a grain PNG as a zero-mean Float32 field, sampled with MIRRORED wrap so it never seams.
 *
 * `orient` (0-7) applies one of the eight square symmetries before sampling. A blind critic looking
 * at eight baked props called out "the brush streaks run in the same near-vertical direction on
 * every object regardless of that object's form" — which is exactly what one shared grain tile
 * applied at one orientation does. Varying it per prop breaks that read at no cost.
 */
function loadField(p, orient = 0) {
  const im = readPNG(p);
  const n = im.w * im.h;
  const f = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) { f[i] = im.data[i*4] / 127 - 1; mean += f[i]; }
  mean /= n;
  for (let i = 0; i < n; i++) f[i] -= mean;
  const mirror = (v, m) => {
    const p2 = 2 * m;
    v = ((v % p2) + p2) % p2;
    return v < m ? v : p2 - 1 - v;
  };
  const o = ((orient | 0) % 8 + 8) % 8;
  const swap = o & 4, fx = o & 1, fy = o & 2;
  return {
    w: im.w, h: im.h, data: f,
    at(x, y) {
      let u = Math.round(x), v = Math.round(y);
      if (swap) { const t = u; u = v; v = t; }
      if (fx) u = -u;
      if (fy) v = -v;
      return f[mirror(v, im.h) * im.w + mirror(u, im.w)];
    },
  };
}

module.exports = { build, loadField, highpass };

if (require.main === module) {
  const src = process.argv[2] || path.join(__dirname, '../../docs/refs/probes/p01_sky_dawn.png');
  const dst = process.argv[3] || path.join(__dirname, 'paper_grain.png');
  const tile = +(process.argv[4] || 384);
  const { img, win, sigma } = build(src, tile);
  writePNG(dst, img);
  console.log(`grain ${tile}x${tile} from ${path.basename(src)} @ (${win.x},${win.y}) sigma=${sigma.toFixed(2)} -> ${dst}`);
}
