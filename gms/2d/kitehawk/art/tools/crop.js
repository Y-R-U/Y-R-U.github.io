// crop.js — step 1 of the bake, and it is not housekeeping.
//
// This model paints a photograph of a printed artefact: a cream paper mount, a painted
// signature, sometimes a caption (ART.md §8A). Negatives are close to inert (D22), so the
// removal is a fixed deterministic inset — 4% every edge, 8% top and bottom on a wide strip.
//
// D57 is the correction that matters: `f08_varied` has marks INSIDE the 4% zone, so a
// mandatory crop would slice the reference plate's own outer marks off. **Crop the cutouts,
// key the sheets.** `mode: 'none'` is therefore a first-class option and every FX sheet uses
// it. `inspect()` reports whether a plate can afford the crop, so the choice is measured
// rather than assumed.
//
//   node crop.js in.png out.png [--inset 0.04] [--insetY 0.08] [--mode auto|none]
//   node crop.js --inspect in.png ...
const { readPNG, writePNG, crop } = require('./img.js');

/** A plate is "wide" (and gets the bigger vertical inset) at 2.5:1 or flatter. */
const isWide = img => img.w / img.h >= 2.5;

/**
 * How much content sits inside the crop zone, as the worst per-channel deviation from the
 * sampled backdrop anywhere in the ring that would be discarded. Small = safe to crop.
 * This is `keycheck.py`'s `grain` measure, moved into the bake so the decision is not a
 * separate manual step.
 */
function ringContent(img, ix, iy) {
  const patch = 24, s = [];
  for (const [cx, cy] of [[0, 0], [img.w - patch, 0], [0, img.h - patch], [img.w - patch, img.h - patch]])
    for (let y = cy; y < cy + patch; y++)
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * img.w + x) * 4;
        s.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
      }
  const med = c => { const v = s.map(p => p[c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  let worst = 0;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (x >= ix && x < img.w - ix && y >= iy && y < img.h - iy) continue;
      const i = (y * img.w + x) * 4;
      worst = Math.max(worst,
        Math.abs(img.data[i] - bg[0]), Math.abs(img.data[i + 1] - bg[1]), Math.abs(img.data[i + 2] - bg[2]));
    }
  return { bg, worst };
}

/**
 * opts: { inset = 0.04, insetY, mode = 'auto'|'none', safe }
 *  auto — 4% every edge, insetY (default 8%) top and bottom when the plate is wide
 *  none — pass through. Use for any multi-mark sheet (D57).
 *  safe — refuse the crop and pass through if ring content exceeds this deviation.
 */
function cropPlate(img, opts = {}) {
  const mode = opts.mode || 'auto';
  if (mode === 'none' || opts.inset === 0) return { img, ix: 0, iy: 0, mode: 'none', ring: null };
  const inset = opts.inset ?? 0.04;
  const insetY = opts.insetY ?? (isWide(img) ? 0.08 : inset);
  const ix = Math.round(img.w * inset), iy = Math.round(img.h * insetY);
  const ring = ringContent(img, ix, iy);
  if (opts.safe !== undefined && ring.worst > opts.safe)
    return { img, ix: 0, iy: 0, mode: 'refused', ring };
  return { img: crop(img, ix, iy, img.w - 2 * ix, img.h - 2 * iy), ix, iy, mode, ring };
}

module.exports = { cropPlate, ringContent, isWide };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--inspect') {
    for (const f of argv.slice(1)) {
      const im = readPNG(f);
      const ix = Math.round(im.w * 0.04), iy = Math.round(im.h * (isWide(im) ? 0.08 : 0.04));
      const r = ringContent(im, ix, iy);
      console.log(`${f} ${im.w}x${im.h} bg=${r.bg} ringContent=${r.worst}` +
        (r.worst > 40 ? '  <-- CONTENT IN THE CROP ZONE, crop would cut it (D57)' : ''));
    }
    process.exit(0);
  }
  const [src, dst, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, ''), v = rest[i + 1];
    o[k] = v === undefined || isNaN(+v) ? v : +v;
  }
  const r = cropPlate(readPNG(src), o);
  writePNG(dst, r.img, { forceAlpha: false });
  console.log(`${dst} ${r.img.w}x${r.img.h} mode=${r.mode} inset=${r.ix},${r.iy}`);
}
