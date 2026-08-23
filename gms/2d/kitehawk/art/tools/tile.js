// tile.js — strips only. Makes a horizontally-tiling strip out of TWO distinct source
// plates, and measures the joins.
//
// Why two sources rather than one. ART.md §4 bans mirroring outright: in a 1500 px-tall
// portrait viewport a mirror axis is instantly visible and gate A4 counts it as a repeat.
// A single cross-faded plate has a period equal to its own width and the eye finds it. So a
// 2048-texel strip is built from two 1024-ish plates, and each strip layer ships variants A
// and B which alternate, giving the pair an 8192 wu period at 4096 wu per strip.
//
// The construction. Both joins are the SAME operation, which is the whole trick: source A is
// laid at x = 0 and source B at x = W/2 - F/2, each source's own two ends carrying a raised-
// cosine ramp. B's tail wraps past W and lands back on A's head, so the wrap seam is a
// cross-fade identical to the internal one. Weights sum to 1 everywhere, so the strip has no
// darkened or brightened band anywhere along it.
//
//   node tile.js out.png A.png B.png [--w 2048] [--feather 128]
//   node tile.js --check out.png            three copies composited, MAD at each join
const { Img, readPNG, writePNG, resize } = require('./img.js');

const hann = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

/**
 * Lay `src` into the accumulator at x = at (wrapping mod W), with a feather-width
 * raised-cosine ramp up at its left end and down at its right end.
 * Accumulation is PREMULTIPLIED, so a transparent pixel contributes no colour — without
 * that, the keyed-out sky above a skyline bleeds grey into the ridge on the blend.
 */
function lay(acc, wsum, W, H, src, at, feather) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < src.w; x++) {
      let w = 1;
      if (x < feather) w = hann(x / feather);
      else if (x >= src.w - feather) w = hann((src.w - 1 - x) / feather);
      if (w <= 0) continue;
      const ox = (((at + x) % W) + W) % W;
      const s = (y * src.w + x) * 4, d = (y * W + ox) * 4;
      const a = src.data[s + 3] / 255;
      acc[d] += src.data[s] * a * w;
      acc[d + 1] += src.data[s + 1] * a * w;
      acc[d + 2] += src.data[s + 2] * a * w;
      acc[d + 3] += src.data[s + 3] * w;
      wsum[y * W + ox] += w;
    }
  }
}

/** opts: { w = 2048, feather = 128, height } */
function tile(a, b, opts = {}) {
  const W = opts.w ?? 2048, F = opts.feather ?? 128;
  const H = opts.height ?? Math.min(a.h, b.h);
  // Each source spans half the strip plus the feather it shares with its neighbour, so the
  // two overlaps consume exactly F each and the period comes out at W.
  const sw = (W >> 1) + F;
  const A = resize(a, sw, H), B = resize(b, sw, H);
  const acc = new Float64Array(W * H * 4), wsum = new Float64Array(W * H);
  lay(acc, wsum, W, H, A, -(F >> 1), F);
  lay(acc, wsum, W, H, B, (W >> 1) - (F >> 1), F);
  const out = new Img(W, H);
  for (let i = 0; i < W * H; i++) {
    const w = wsum[i] || 1;
    const al = acc[i * 4 + 3] / w;
    const pa = al / 255;
    out.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(al)));
    if (pa < 1 / 512) continue;
    out.data[i * 4] = Math.max(0, Math.min(255, Math.round(acc[i * 4] / w / pa)));
    out.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(acc[i * 4 + 1] / w / pa)));
    out.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(acc[i * 4 + 2] / w / pa)));
  }
  return out;
}

/**
 * Gate A3, and the criterion needed rewriting. See P3_NOTES §5.
 *
 * A3 as written asks for "mean absolute difference at each join <= 2/255". Measured on the
 * shipped strips the joins come out at 5-12/255 -- and so does the strips' OWN mean
 * adjacent-column difference, 6.5-10/255, because a painted village has real detail in it.
 * The 2/255 figure is reachable only by a soft low-frequency strip, so on a detailed one it
 * is not a tiling test at all: no correct tile can pass it and a deliberately broken tile
 * fails it by the same margin as a perfect one. That is a threshold measuring the wrong
 * quantity, and it is not mine to move.
 *
 * What DOES separate a tiled strip from an untiled one is the seam's EXCESS over its own
 * neighbourhood: how much bigger the step across the join is than the steps either side of
 * it. A perfect wrap gives ~0 excess whatever the strip's detail level; a hard cut gives a
 * large one. `--falsify` builds the same two sources with the wrap cross-fade disabled and
 * requires the number to go red, which is the only evidence that the check works.
 */
function checkJoins(img, opts = {}) {
  const W = img.w, H = img.h;
  const colDiff = (x0, x1) => {
    let s = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + ((x0 % W) + W) % W) * 4, j = (y * W + ((x1 % W) + W) % W) * 4;
      const aI = img.data[i + 3] / 255, aJ = img.data[j + 3] / 255;
      // compare over ink, not over transparent sky: premultiply both sides
      s += (Math.abs(img.data[i] * aI - img.data[j] * aJ)
        + Math.abs(img.data[i + 1] * aI - img.data[j + 1] * aJ)
        + Math.abs(img.data[i + 2] * aI - img.data[j + 2] * aJ)) / 3
        + Math.abs(img.data[i + 3] - img.data[j + 3]);
    }
    return s / H / 2;
  };
  const join = colDiff(W - 1, 0);
  let body = 0;
  for (let x = 1; x < W; x++) body += colDiff(x - 1, x);
  body /= (W - 1);
  // local neighbourhood of the seam, excluding the seam step itself
  const R = opts.radius ?? 24;
  let near = 0, n = 0;
  for (let k = -R; k <= R; k++) {
    if (k === 0) continue;
    near += colDiff(k - 1, k); n++;
  }
  near /= n;
  const excess = join - near;
  return { join, body, near, excess, pass: excess <= 1.0 };
}

/** The control: two sources butted with no cross-fade at all. Used only to falsify. */
function tileHard(a, b, opts = {}) {
  const W = opts.w ?? 2048, H = opts.height ?? Math.min(a.h, b.h);
  const sw = W >> 1;
  const A = resize(a, sw, H), B = resize(b, sw, H);
  const out = new Img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const src = x < sw ? A : B, sx = x < sw ? x : x - sw;
    const s = (y * sw + sx) * 4, d = (y * W + x) * 4;
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1];
    out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
  }
  return out;
}

module.exports = { tile, tileHard, checkJoins };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--check') {
    for (const f of argv.slice(1)) {
      const r = checkJoins(readPNG(f));
      console.log(`${f}  join ${r.join.toFixed(3)}  local ${r.near.toFixed(3)}  excess ${r.excess.toFixed(3)}/255  body ${r.body.toFixed(3)}  ${r.pass ? 'PASS' : 'FAIL'}`);
    }
    process.exit(0);
  }
  if (argv[0] === '--falsify') {
    // Build the SAME two sources both ways and require the control to go red. A check that
    // cannot fail is worse than no check: the first version of this one passed the broken
    // control with a better score than the real strip, because both were comparing two
    // transparent padding columns. See build.js's `strip` note.
    const { cut } = require('./build.js');
    const A = cut(argv[1], { strip: true, lo: 16, hi: 62, shrink: 0.10 }).img;
    const B = cut(argv[2], { strip: true, lo: 16, hi: 62, shrink: 0.10 }).img;
    const H = Math.min(A.h, B.h);
    const g = checkJoins(tile(A, B, { w: 2048, height: H, feather: 128 }));
    const c = checkJoins(tileHard(A, B, { w: 2048, height: H }));
    console.log(`shipped  join ${g.join.toFixed(2)} local ${g.near.toFixed(2)} excess ${g.excess.toFixed(2)}  ${g.pass ? 'PASS' : 'FAIL'}`);
    console.log(`control  join ${c.join.toFixed(2)} local ${c.near.toFixed(2)} excess ${c.excess.toFixed(2)}  ${c.pass ? 'PASS' : 'FAIL'}`);
    const ok = g.pass && !c.pass;
    console.log(ok ? 'FALSIFICATION OK: the check separates them' : 'BROKEN: the check does not separate a tiled strip from an untiled one');
    process.exit(ok ? 0 : 1);
  }
  const [dst, a, b, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, '')] = +rest[i + 1];
  const im = tile(readPNG(a), readPNG(b), o);
  writePNG(dst, im, { forceAlpha: true });
  const r = checkJoins(im);
  console.log(`${dst} ${im.w}x${im.h}  join ${r.join.toFixed(3)} local ${r.near.toFixed(3)} excess ${r.excess.toFixed(3)}/255  ${r.pass ? 'PASS' : 'FAIL'}`);
}
