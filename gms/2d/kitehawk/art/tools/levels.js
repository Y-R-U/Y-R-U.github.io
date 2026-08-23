// levels.js — fit a shared, ramp-mapped plate's luminance into the band the LUT can use.
//
// This is NOT in the P3 brief's list of seven tools. It is here because ART.md §11 names the
// ramp-map's failure mode and tells you to check it, and the check failed on measurement:
//
//   cL01 L 0.111-1.000  2.18% of opaque pixels at L > 0.98
//   cL08 L 0.126-1.000  3.00%
//   cS20 L 0.221-1.000  1.07%
//
// §11's target is a spread of roughly 0.15-0.90 with no clipping at either end. Every pixel
// above 0.98 indexes the same LUT texel, so a clipped sunlit cloud top gradient-maps to one
// flat colour — which is precisely the "too much range and they band" half of the warning.
// Fighting it in the prompt is the wrong move (D22/D37's lesson); it is deterministic to fix.
//
// The fit is percentile-based, not min/max: a handful of stray pixels must not set the
// scale. A soft shoulder at each end keeps the compression out of the midtones, so the
// value STRUCTURE the ramp-map reads survives — which is the entire reason the plate exists.
//
//   node levels.js in.png out.png [--lo 0.15] [--hi 0.90]
//   node levels.js --report a.png b.png ...
const { Img, readPNG, writePNG } = require('./img.js');

const LUMA = (r, g, b) => (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

function stats(img, aMin = 200) {
  const v = [];
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] < aMin) continue;
    v.push(LUMA(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]));
  }
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const clipHi = v.filter(x => x > 0.98).length / v.length;
  const clipLo = v.filter(x => x < 0.02).length / v.length;
  return { n: v.length, min: v[0], max: v[v.length - 1], p1: q(0.01), p99: q(0.99), mean: v.reduce((a, b) => a + b, 0) / v.length, clipLo, clipHi };
}

/** Smooth compression toward the ends, identity through the middle. */
const shoulder = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

/**
 * Remap luminance so [p1, p99] lands on [lo, hi], preserving hue and saturation exactly
 * (the whole pixel is scaled by one gain), then round the ends with a shoulder so nothing
 * outside the percentiles clips at the new limits either.
 */
// lo was 0.15, from ART.md §11's "spread of roughly 0.15-0.90". Measured against the
// reference plates that floor is too deep: p03_cloud_deck's 2nd percentile is 0.419 and
// p08's is 0.262, while ours was being authored down to 0.15 and then crushed further by the
// LUT. §11's range is about having ENOUGH range, not about reaching zero; the top clip was
// the real defect it was written for. 0.28 keeps the spread wide and stops the shadow side
// of every cutout being dragged below anything in the references.
function fitLuma(img, { lo = 0.28, hi = 0.94, aMin = 200 } = {}) {
  const s = stats(img, aMin);
  if (!s) return { img, before: null, after: null };
  const span = Math.max(1e-4, s.p99 - s.p1);
  const out = new Img(img.w, img.h);
  out.data.set(img.data);
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.data[i * 4 + 3];
    if (!a) continue;
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    const L = LUMA(r, g, b);
    let t = (L - s.p1) / span;                       // 0..1 across the useful range
    // shoulders: anything past the percentiles is squeezed into the last 8% of the target
    if (t < 0) t = -0.08 * (1 - shoulder(1 + Math.max(-1, t)));
    else if (t > 1) t = 1 + 0.08 * shoulder(Math.min(1, t - 1));
    const target = Math.max(0.004, Math.min(1, lo + t * (hi - lo)));
    const gain = target / Math.max(1e-4, L);
    out.data[i * 4] = Math.max(0, Math.min(255, Math.round(r * gain)));
    out.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * gain)));
    out.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * gain)));
  }
  return { img: out, before: s, after: stats(out, aMin) };
}

/** Gate A6: everything on FG_OCCLUDE must sit at or below 12% luminance (ART.md P3). */
function crushToSilhouette(img, { p90 = 0.09, aMin = 200 } = {}) {
  const s = stats(img, aMin);
  if (!s) return { img, before: null, after: null };
  const v = [];
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] < aMin) continue;
    v.push(LUMA(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]));
  }
  v.sort((a, b) => a - b);
  const cur = v[Math.round(0.90 * (v.length - 1))];
  const k = p90 / Math.max(1e-4, cur);
  const out = new Img(img.w, img.h);
  out.data.set(img.data);
  for (let i = 0; i < img.w * img.h; i++) {
    if (!img.data[i * 4 + 3]) continue;
    for (let c = 0; c < 3; c++)
      out.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(img.data[i * 4 + c] * k)));
  }
  return { img: out, before: s, after: stats(out, aMin), gain: k };
}

/**
 * deRim — kill the painted light collar this model draws around an isolated cutout.
 *
 * Worth being precise about what this is, because the obvious diagnosis is wrong. The pale
 * outline on a keyed cloud looks exactly like the halo D57 warns about, so the first move is
 * to shrink the matte or raise the key tolerance. Measured at shrink 0.12 / 0.20 / 0.28 /
 * 0.36 the outline does not move at all — it is PAINTED INTO THE PLATE, a soft echo of the
 * die-cut border D55 measured at 1024. Shrinking only eats the cloud.
 *
 * So it is fixed the way every other generation artefact in this project is fixed: after the
 * fact, deterministically. Any pixel inside a `collar`-wide band of the silhouette that is
 * brighter than the interior it borders is pulled back toward that interior. Interior pixels
 * are never touched, so a genuinely rim-lit edge in the middle of the form survives.
 */
function deRim(img, { collar = 5, ref = 14, strength = 0.85, aMin = 200 } = {}) {
  const { w, h } = img, n = w * h;
  // distance from the outside, in whole pixels, by two-pass chamfer over the alpha matte
  const D = new Int32Array(n).fill(1e6);
  const solid = i => img.data[i * 4 + 3] >= aMin;
  for (let i = 0; i < n; i++) if (!solid(i)) D[i] = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue;
    if (x) D[i] = Math.min(D[i], D[i - 1] + 1);
    if (y) D[i] = Math.min(D[i], D[i - w] + 1);
    if (y && x) D[i] = Math.min(D[i], D[i - w - 1] + 1);
    if (y && x < w - 1) D[i] = Math.min(D[i], D[i - w + 1] + 1);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue;
    if (x < w - 1) D[i] = Math.min(D[i], D[i + 1] + 1);
    if (y < h - 1) D[i] = Math.min(D[i], D[i + w] + 1);
    if (y < h - 1 && x < w - 1) D[i] = Math.min(D[i], D[i + w + 1] + 1);
    if (y < h - 1 && x) D[i] = Math.min(D[i], D[i + w - 1] + 1);
  }
  // For each collar pixel, find the nearest pixel DEEP inside the form. A global collar-vs-
  // interior median does not work and the measurement says so: on cL01 the collar median is
  // 0.688 against an interior of 0.815, because the collar also contains the cloud's dark
  // undersides. The bright rim is a LOCAL excess over the form it borders, so it has to be
  // compared locally or the test never fires at all.
  const deep = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (solid(i) && D[i] > collar) deep[i] = i;
  for (let pass = 0; pass < collar + 2; pass++) {
    let changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid(i) || deep[i] >= 0) continue;
      for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && deep[j] >= 0) { deep[i] = deep[j]; changed++; break; }
    }
    if (!changed) break;
  }
  const out = new Img(w, h);
  out.data.set(img.data);
  let touched = 0, excessBefore = 0, excessAfter = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (!solid(i) || D[i] > collar) continue;
    const src = deep[i];
    if (src < 0) continue;
    const L = LUMA(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    const Ld = LUMA(img.data[src * 4], img.data[src * 4 + 1], img.data[src * 4 + 2]);
    cnt++;
    excessBefore += Math.max(0, L - Ld);
    if (L <= Ld + 0.02) { excessAfter += Math.max(0, L - Ld); continue; }
    // fade the correction out over the collar so there is no new hard line at D == collar
    const f = strength * (1 - (D[i] - 1) / Math.max(1, collar + 1));
    const target = L * (1 - f) + Ld * f;
    const gain = target / Math.max(1e-4, L);
    for (let c = 0; c < 3; c++)
      out.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(img.data[i * 4 + c] * gain)));
    excessAfter += Math.max(0, target - Ld);
    touched++;
  }
  return {
    img: out, touched,
    before: { rimExcess: cnt ? excessBefore / cnt : 0 },
    after: { rimExcess: cnt ? excessAfter / cnt : 0 },
  };
}

/** The number gate A6 actually asks for. */
function p90Luma(img, aMin = 200) {
  const v = [];
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] < aMin) continue;
    v.push(LUMA(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]));
  }
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.round(0.90 * (v.length - 1))];
}

module.exports = { fitLuma, crushToSilhouette, deRim, stats, p90Luma, LUMA };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--report') {
    for (const f of argv.slice(1)) {
      const s = stats(readPNG(f));
      console.log(`${f} L ${s.min.toFixed(3)}-${s.max.toFixed(3)} p1/p99 ${s.p1.toFixed(3)}/${s.p99.toFixed(3)} mean ${s.mean.toFixed(3)} clip ${(s.clipLo * 100).toFixed(2)}%/${(s.clipHi * 100).toFixed(2)}%`);
    }
    process.exit(0);
  }
  const [src, dst, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, '')] = +rest[i + 1];
  const r = fitLuma(readPNG(src), o);
  writePNG(dst, r.img, { forceAlpha: true });
  console.log(`${dst} p1/p99 ${r.before.p1.toFixed(3)}/${r.before.p99.toFixed(3)} -> ${r.after.p1.toFixed(3)}/${r.after.p99.toFixed(3)} clipHi ${(r.before.clipHi * 100).toFixed(2)}% -> ${(r.after.clipHi * 100).toFixed(2)}%`);
}
