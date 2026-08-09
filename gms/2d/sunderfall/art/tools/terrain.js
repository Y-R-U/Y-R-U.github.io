// Painted ground slabs built from a Flux material texture plus a procedural top edge.
//
// The AI supplies the material; the silhouette, the rim light and the under-shadow are
// drawn here, because those three things are what make a platform read as solid and they
// have to line up exactly with the collision box the sim uses.
const { Img, resize, crop, composite, grade, mapPixels, blur } = require('./img.js');
const { rng, fbm, makeNoise, polyCoverage, strokeCoverage, paintCoverage, roughen } = require('./raster.js');

/** Blend a texture with itself half a tile away in both axes so it tiles with no seam. */
function makeSeamless(src) {
  const { w, h } = src;
  const out = new Img(w, h);
  const sample = (x, y) => {
    const i = (((y % h) + h) % h * w + ((x % w) + w) % w) * 4;
    return [src.data[i], src.data[i+1], src.data[i+2], src.data[i+3]];
  };
  for (let y = 0; y < h; y++) {
    const wy = 0.5 - 0.5 * Math.cos(2 * Math.PI * y / h);
    for (let x = 0; x < w; x++) {
      const wx = 0.5 - 0.5 * Math.cos(2 * Math.PI * x / w);
      const a = sample(x, y), b = sample(x + (w >> 1), y);
      const c = sample(x, y + (h >> 1)), d = sample(x + (w >> 1), y + (h >> 1));
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) {
        const top = a[k] * wx + b[k] * (1 - wx);
        const bot = c[k] * wx + d[k] * (1 - wx);
        out.data[o + k] = Math.round(top * wy + bot * (1 - wy));
      }
    }
  }
  return out;
}

/** Fill a w*h image by tiling `tex`, with a periodic large-scale tint so it does not read as a grid. */
function tileFill(tex, w, h, seed, tintAmt = 0.18) {
  const out = new Img(w, h);
  const n = fbm(seed, 3, 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y % tex.h) * tex.w + (x % tex.w)) * 4;
    const o = (y * w + x) * 4;
    const k = (n(x / w, y / h) - 0.5) * 2 * tintAmt;
    for (let c = 0; c < 3; c++) out.data[o + c] = Math.max(0, Math.min(255, Math.round(tex.data[si + c] * (1 + k))));
    out.data[o + 3] = 255;
  }
  return out;
}

/**
 * Height of the ground surface at x, periodic over `w` so slabs tile.
 * Returns a function x -> y (pixels from the top of the slab).
 */
function surfaceCurve(w, seed, base, amp) {
  const a = makeNoise(seed, 5), b = makeNoise(seed + 91, 13), c = makeNoise(seed + 411, 29);
  return x => {
    const u = x / w;
    return base + (a(u, 0.5) - 0.5) * amp + (b(u, 0.5) - 0.5) * amp * 0.45 + (c(u, 0.5) - 0.5) * amp * 0.2;
  };
}

const PALETTE = {
  forest: { surf: [78, 104, 58], surfDark: [30, 44, 28], rim: [196, 216, 148], moss: 26, mossCol: [96, 126, 62] },
  rock:   { surf: [88, 94, 102], surfDark: [36, 42, 50], rim: [188, 204, 220], moss: 0,  mossCol: [78, 100, 60] },
  stone:  { surf: [92, 94, 84], surfDark: [40, 44, 44], rim: [214, 202, 168], moss: 64, mossCol: [84, 108, 58] },
};

/**
 * buildSlab(tex, opts) -> Img
 *  w, h        slab size in world pixels
 *  kind        'forest' | 'rock' | 'stone'
 *  capL, capR  round off that end instead of running to the edge
 *  seed
 *  amp         surface roughness in pixels
 *  top         nominal surface y (collision top) in pixels from the slab's top
 */
function buildSlab(tex, opts) {
  const { w, h, kind = 'forest', capL = false, capR = false, seed = 1, amp = 10, top = 18,
          detailSeed = 0 } = opts;
  const pal = PALETTE[kind];
  // curve comes from `seed` alone so every variant of a kind abuts cleanly; only the
  // detail varies with detailSeed
  const dseed = seed + detailSeed * 1013;
  const body = tileFill(tex, w, h, dseed);
  const curve = surfaceCurve(w, seed, top, amp);
  const out = new Img(w, h);
  const r = rng(dseed + 77);

  // side profile: caps pull the silhouette inward toward the bottom
  const capW = Math.min(w * 0.28, h * 0.75);
  const sideIn = x => {
    let inset = 0;
    if (capL && x < capW) {
      const t = 1 - x / capW;
      inset = Math.max(inset, t * t * capW * 0.55);
    }
    if (capR && x > w - capW) {
      const t = 1 - (w - x) / capW;
      inset = Math.max(inset, t * t * capW * 0.55);
    }
    return inset;
  };
  const capped = capL || capR;
  const bottomBase = capped ? h * 0.80 : h - 4;
  const bottomWob = surfaceCurve(w, seed + 555, 0, capped ? amp * 2.4 : amp * 0.8);
  const bottomCurve = x => {
    let y = bottomBase + bottomWob(x);
    if (capL && x < capW) y -= (1 - x / capW) ** 2 * bottomBase * 0.45;
    if (capR && x > w - capW) y -= (1 - (w - x) / capW) ** 2 * bottomBase * 0.45;
    return y;
  };

  for (let x = 0; x < w; x++) {
    const ys = curve(x);
    const yb = capped ? Math.min(h - 1, bottomCurve(x)) : h;
    const inset = sideIn(x);
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      let a = 0;
      if (y >= ys - 1 && y <= yb) a = 1;
      if (a && (y - ys) < 1.5) a = Math.max(0, Math.min(1, y - ys + 1.5));
      if (a && capL && x < inset) a = 0;
      if (a && capR && x > w - 1 - inset) a = 0;
      if (a && (yb - y) < 2) a *= Math.max(0, Math.min(1, yb - y));
      if (a <= 0) continue;
      const b = (y * w + x) * 4;
      out.data[o] = body.data[b]; out.data[o+1] = body.data[b+1]; out.data[o+2] = body.data[b+2];
      out.data[o+3] = Math.round(a * 255);
    }
  }

  // Depth. The lower body of a run is a soil cross-section that the player never
  // interacts with; left evenly lit it is 20% of the frame carrying no information. It
  // goes much darker than before and picks up low-frequency strata, so it reads as a mass
  // receding into the dark rather than as a lit texture swatch.
  const strata = makeNoise(dseed + 707, 3);       // periodic in x -> still seamless
  const grit = makeNoise(dseed + 909, 7);
  const outImg = mapPixels(out, (rr, gg, bb, a, x, y) => {
    if (!a) return null;
    const ys = curve(x);
    const d = y - ys;
    const deep = Math.min(1, Math.max(0, (y - ys) / Math.max(1, h - ys)));
    let k = 0.10 + (0.28 + 0.38 * Math.min(1, h / 384)) * deep ** 1.35;
    k += (strata(x / w, deep * 2.2) - 0.5) * 0.30 * deep;
    k += (grit(x / w, deep * 4.5) - 0.5) * 0.16 * deep;
    if (d < 26) k += (1 - d / 26) * 0.26;          // contact shadow under the surface
    if (d < 4) k -= (1 - d / 4) * 0.22;
    const m = Math.max(0.10, 1 - k);
    // and it cools as it sinks — warm soil at the lip, near-black blue at the bottom
    const cool = 1 - 0.18 * deep;
    return [rr * m * cool, gg * m * (cool + 0.05 * deep), bb * m, a];
  });

  // surface band + rim light
  const surf = new Img(w, h);
  for (let x = 0; x < w; x++) {
    const ys = curve(x);
    const bandH = 12 + 8 * makeNoise(dseed + 12, 9)(x / w, 0.3);
    for (let y = Math.max(0, Math.floor(ys - 1)); y < Math.min(h, ys + bandH); y++) {
      const t = Math.max(0, Math.min(1, (y - ys) / bandH));
      const a = Math.pow(1 - t, 1.5);
      const col = [
        pal.surf[0] + (pal.surfDark[0] - pal.surf[0]) * t,
        pal.surf[1] + (pal.surfDark[1] - pal.surf[1]) * t,
        pal.surf[2] + (pal.surfDark[2] - pal.surf[2]) * t,
      ];
      const o = (y * w + x) * 4;
      surf.data[o] = col[0]; surf.data[o+1] = col[1]; surf.data[o+2] = col[2];
      surf.data[o+3] = Math.round(a * 165);
    }
  }
  const withSurf = outImg;
  composite(withSurf, surf, 0, 0);

  // rim: the bright top line that sells a solid platform
  const rimPts = [];
  for (let x = 0; x <= w; x += 2) rimPts.push([x, curve(Math.min(w - 1, x)) + 0.5]);
  const rimCov = strokeCoverage(w, h, rimPts, 2.4);
  const rimVar = makeNoise(dseed + 303, 11);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (rimCov[i]) rimCov[i] *= 0.35 + 0.9 * rimVar(x / w, 0.5);   // an even line reads as a UI stroke
  }
  const alphaMask = new Float32Array(w * h);
  for (let i = 0; i < alphaMask.length; i++) alphaMask[i] = withSurf.data[i*4+3] / 255;
  paintCoverage(withSurf, rimCov, pal.rim, 0.42, alphaMask);

  // tufts / chips along the edge
  if (pal.moss) {
    const count = Math.round(w / pal.moss);
    for (let i = 0; i < count; i++) {
      const x = r() * w;
      const ys = curve(Math.min(w - 1, Math.floor(x)));
      const bladeN = 3 + Math.floor(r() * 4);
      for (let bch = 0; bch < bladeN; bch++) {
        const bx = x + (r() - 0.5) * 14;
        const len = 6 + r() * 16;
        const lean = (r() - 0.5) * 12;
        const shade = 0.5 + r() * 0.55;
        const col = [pal.mossCol[0] * shade, pal.mossCol[1] * shade, pal.mossCol[2] * shade];
        for (const off of [0, -w, w]) {          // wrap so a tuft on the seam is not sliced
          const pts = [[bx + off, ys + 3], [bx + off + lean * 0.4, ys - len * 0.55], [bx + off + lean, ys - len]];
          if (pts[0][0] < -30 || pts[0][0] > w + 30) continue;
          paintCoverage(withSurf, strokeCoverage(w, h, pts, 2.2, t => 1 - t * 0.8), col, 0.9);
        }
      }
    }
  } else {
    // rock: chipped facets catching the light along the top
    const count = Math.round(w / 34);
    for (let i = 0; i < count; i++) {
      const x = r() * w, ys = curve(Math.min(w - 1, Math.floor(x)));
      const s = 6 + r() * 16;
      const pts = [[x, ys + 1], [x + s, ys + 2 + r() * 4], [x + s * 0.6, ys + s * 0.8], [x - s * 0.2, ys + s * 0.5]];
      const cov = polyCoverage(w, h, pts);
      paintCoverage(withSurf, cov, pal.rim, 0.14, alphaMask);
    }
  }
  return withSurf;
}

/**
 * Hang roots and vines off a slab's underside, and let a few grass blades flop over the
 * top lip. A platform whose bottom edge is a clean curve is a level-editor rectangle; the
 * broken edge is what makes it a place. Grows the canvas downward, so the returned image
 * is taller — the caller's anchor y is unchanged because growth is at the bottom.
 */
function addUnderFringe(img, o = {}) {
  const { seed = 1, kind = 'forest', len = 46, density = 0.020, vines = true } = o;
  const pal = PALETTE[kind];
  const r = rng(seed);
  const { w, h } = img;
  const grow = Math.round(len * 1.25);
  const out = new Img(w, h + grow);
  out.data.set(img.data);

  const bottomOf = x => {
    for (let y = h - 1; y >= 0; y--) if (img.data[(y * w + x) * 4 + 3] > 120) return y;
    return -1;
  };
  const count = Math.max(3, Math.round(w * density));
  const dark = [pal.surfDark[0] * 0.55, pal.surfDark[1] * 0.55, pal.surfDark[2] * 0.6];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(6 + r() * (w - 12));
    const yb = bottomOf(x);
    if (yb < h * 0.35) continue;
    const L = len * (0.35 + r() * 0.95);
    const sway = (r() - 0.5) * L * 0.55;
    const pts = [[x, yb - 6], [x + sway * 0.35, yb + L * 0.45], [x + sway, yb + L]];
    paintCoverage(out, strokeCoverage(w, h + grow, pts, 2.2 + r() * 3.4, t => 1 - t * 0.85), dark, 0.95);
    if (vines && r() < 0.45) {
      // a couple of leaves so the strand is a plant, not a wire
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const t = 0.35 + r() * 0.6;
        const lx = x + sway * t, ly = yb + L * t;
        const s = 3 + r() * 5;
        paintCoverage(out, polyCoverage(w, h + grow,
          [[lx, ly], [lx + s * (r() < 0.5 ? 1 : -1), ly - s * 0.5], [lx + s * 0.3, ly + s * 0.9]]),
          [pal.mossCol[0] * 0.5, pal.mossCol[1] * 0.5, pal.mossCol[2] * 0.5], 0.9);
      }
    }
  }
  return out;
}

/**
 * A rock shoulder shouldering up out of one end of a slab, in the slab's own material.
 * Breaks the ruled top line that makes every platform read as the same rectangle.
 * Must be painted with the body texture — a flat-colour polygon reads as a UI shape.
 */
function addTopLip(img, o = {}) {
  const { tex, seed = 1, kind = 'forest', side = 1, top = 18, reach = 0.28 } = o;
  const pal = PALETTE[kind];
  const r = rng(seed);
  const { w, h } = img;
  const rise = 10 + r() * 16;
  const x0 = side > 0 ? Math.round(w * (1 - reach)) : 0;
  const x1 = side > 0 ? w : Math.round(w * reach);
  const crest = side > 0 ? x1 - (x1 - x0) * 0.28 : x0 + (x1 - x0) * 0.28;
  const pts = roughen([[x0, top + 20], [x0 + (x1 - x0) * 0.14, top + 4],
                       [crest, top - rise], [x1, top - rise * 0.45], [x1, top + 34], [x0, top + 36]],
                      4.0, seed + 4, 2);
  const cov = polyCoverage(w, h, pts);

  const body = tex ? tileFill(tex, w, h, seed + 31, 0.22) : null;
  const lip = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cov[y * w + x];
    if (c <= 0.002) continue;
    const i = (y * w + x) * 4;
    // rounds off downward: the shoulder is a lump, not a slab
    const d = Math.max(0, Math.min(1, (y - (top - rise)) / (rise + 40)));
    const m = 0.92 - 0.55 * d;
    if (body) { lip.data[i] = body.data[i] * m; lip.data[i+1] = body.data[i+1] * m; lip.data[i+2] = body.data[i+2] * m; }
    else { lip.data[i] = pal.surfDark[0]; lip.data[i+1] = pal.surfDark[1]; lip.data[i+2] = pal.surfDark[2]; }
    lip.data[i+3] = Math.round(Math.min(1, c) * 255);
  }
  const out = img.clone();
  composite(out, lip, 0, 0);

  // crest rim + a few blades so the shoulder belongs to the same ground
  const crestPts = [[x0 + (x1 - x0) * 0.14, top + 4], [crest, top - rise + 1], [x1, top - rise * 0.45 + 1]];
  paintCoverage(out, strokeCoverage(w, h, crestPts, 2.2), pal.rim, 0.30);
  if (pal.moss) for (let i = 0; i < 8; i++) {
    const t = r(), bx = crestPts[0][0] + (x1 - crestPts[0][0]) * t;
    const by = top - rise * (0.35 + 0.65 * Math.sin(Math.PI * t)) + 3;
    const len = 5 + r() * 11, lean = (r() - 0.5) * 9;
    paintCoverage(out, strokeCoverage(w, h, [[bx, by + 3], [bx + lean, by - len]], 2.0, tt => 1 - tt * 0.8),
                  pal.mossCol.map(v => v * (0.45 + r() * 0.5)), 0.85);
  }
  return out;
}

module.exports = { makeSeamless, tileFill, buildSlab, surfaceCurve, addUnderFringe, addTopLip, PALETTE };
