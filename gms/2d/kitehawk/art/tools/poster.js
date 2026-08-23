// poster.js — the deterministic "make it painted" bake step for TERRAIN props.
//
// WHY THIS EXISTS (DECISIONS D37, ART_AB_FINDINGS §4). Small mechanical props come out of Flux as
// photoreal renders. Four separate prompt-level levers were tried and all four failed: edit mode
// with a style ref, explicit brush language, generating at native atlas size, and "two flat tones".
// So we stop prompting and post-process, exactly as the §8A crop lesson says.
//
// Runs between key.js and trim.js. D37 named four passes; all four are here, two of them working
// by a different mechanism than the finding assumed, plus two that the first results made necessary.
//
//   1. dropShadow — the residual cast shadow. It does NOT key as a low-alpha blob; it keys fully
//                   opaque, and is found instead as an achromatic darkening of the backdrop that is
//                   wide, flat and low in the content bbox. Measured, not guessed — see the note on
//                   the function. despeckle() then sweeps the crumbs the backdrop's own paper grain
//                   leaves behind.
//   2. quantise   — luminance to N bands across the prop's OWN value range, so a smooth barrel
//                   gradient becomes the two-or-three flat tones the prompt refused to give. Applied
//                   as a gain on RGB, so hue rides along. Bands follow the FORM: a small bilateral
//                   runs first, or the quantiser promotes surface mottle into blobs. And the dither
//                   is the PAPER GRAIN itself, not Bayer — band boundaries then break along paper
//                   fibres the way gouache pools, instead of on a visible 4x4 grid.
//   3. splitTone  — ADDED. Warm key / cool shadow as a luma-PRESERVING tint leaning the top bands
//                   cream and the bottom bands violet. This is the D39 answer: §7's neutral-light
//                   clause strips the warm/cool contrast that makes a plate read as painted, and
//                   this puts it back downstream of a render that is still LUT-compatible.
//                   Measured lift, across every prop plate: split 10-35 -> 44-74, against
//                   references p08 45.5 and p04 81.9. See docs/ART_PROPS.md.
//   3b. wet edge  — ADDED. A dark accent on the darker side of each band boundary, the way gouache
//                   pools where one flat tone meets the next.
//   4. grain      — multiply the shared paper field (art/tools/paper_grain.png, extracted by
//                   grain.js from our own p01 plate) so a prop carries the same tooth as the
//                   painted layers it will sit against.
//   5. roughEdge  — displace the OUTER alpha boundary along a noise field so the silhouette is
//                   hand-cut, not a clean vector boundary (P5's edge clause). "Outer" is
//                   load-bearing; see the note on the function.
//
// No npm, no native deps: img.js is the whole raster layer.
//
//   node poster.js in.png out.png --bgfrom raw.png [--preset mech|struct] [--maxdim 320] [...]
const path = require('path');
const { readPNG, writePNG, trim, resize, alphaBBox } = require('./img.js');
const { loadField } = require('./grain.js');

const DEFAULTS = {
  bands: 5,        // 5-7 per D37. 5 gives the clearest two-tone read on a gun barrel.
  dither: 0.30,    // band-boundary break-up, in units of one band. 0 = hard posterise.
  temp: 0.6,       // split-tone strength. 0 = leave the neutral render alone.
  grain: 0.10,     // paper multiply opacity.
  edge: 0.30,      // alpha-boundary wander, roughly +-1 px at this value.
  collar: 4,       // how far in from the silhouette the edge pass is allowed to reach, in px.
  sat: 1.15,       // chroma lift after quantising.
  ink: 0.32,       // wet-edge accent on the dark side of a band boundary. 0 = off.
  smooth: 3,       // bilateral radius used to find the FORM before banding. 0 = band raw luma.
  smoothRange: 20, // bilateral value tolerance. Above this a difference counts as an edge, not tex.
  detail: 0.35,    // how much of the original surface texture to add back over the flat bands.
  maxdim: 0,       // downscale the longest side to this BEFORE grain/edge, so the paper tooth and
                   // the hand-cut silhouette land at the size the atlas actually ships. D37's
                   // "generate large, downscale into the atlas" makes this the correct order.
  shadow: 1,       // drop the residual cast shadow.
  speck: 120,      // kill opaque islands smaller than this many px. Debris specks and colour
                   // confetti in the backdrop were both named by a blind critic at 40.
  veil: 10,        // colour distance from the backdrop within which a pixel is treated as a keying
                   // artefact rather than paint, and is left untinted.
  seed: 0,
  grainFile: path.join(__dirname, 'paper_grain.png'),
};

// Two presets, because one set of numbers does not fit both prop classes and pretending it does
// was visibly wrong. MECH is for rounded rendered metal — a gun barrel, a bowser, a wire spool —
// where the whole point is to break a smooth gradient into flat tones. STRUCT is for large flat
// planes carrying surface texture — a hangar, a hut, a water tower — where hard banding fights the
// texture instead of the lighting, so it wants more bands, more of its own detail back, and a
// gentler edge because an architectural silhouette that gets chewed reads as damage, not as brush.
const PRESETS = {
  mech:   { bands: 5, dither: 0.30, smooth: 3, smoothRange: 20, detail: 0.52, ink: 0.20,
            temp: 0.60, sat: 1.15, grain: 0.10, edge: 0.22 },
  struct: { bands: 7, dither: 0.25, smooth: 4, smoothRange: 30, detail: 0.70, ink: 0.14,
            temp: 0.50, sat: 1.05, grain: 0.12, edge: 0.16 },
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const luma = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;

// ---------------------------------------------------------------- 1. shadow + speckle

/** 4-connected components over a boolean mask; calls fn(pixelIndexArray) per component. */
function components(mask, w, h, fn) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || !mask[s]) continue;
    const comp = [s]; seen[s] = 1; stack.length = 0; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && mask[j]) { seen[j] = 1; comp.push(j); stack.push(j); }
    }
    fn(comp);
  }
}

function morph(mask, w, h, r, grow) {
  // Separable min/max over a (2r+1) box — erode when grow is false, dilate when true.
  const pass = (src, W, H) => {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = grow ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const xx = clamp(x + k, 0, W - 1);
        const s = src[y * W + xx];
        if (grow) { if (s) { v = 1; break; } } else if (!s) { v = 0; break; }
      }
      dst[y * W + x] = v;
    }
    return dst;
  };
  const tr = (src, W, H) => { const d = new Uint8Array(src.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[x * H + y] = src[y * W + x]; return d; };
  let m = pass(mask, w, h);
  m = tr(m, w, h);
  m = pass(m, h, w);
  return tr(m, h, w);
}

/**
 * Drop the residual cast shadow.
 *
 * A cast shadow keys OPAQUE, not partial — it is 80-90 luma below the backdrop, well past key.js's
 * threshold — so "it will be a low-alpha blob" turns out to be wrong and a partial-alpha rule finds
 * nothing. Three measured properties do separate it, and they separate it cleanly (numbers in
 * docs/ART_PROPS.md):
 *
 *   1. it is an ACHROMATIC DARKENING OF THE BACKDROP. Project the pixel onto the backdrop colour
 *      ray: p ~= s*bg with s in (0.30, 0.965) and a small residual. A painted object almost always
 *      leaves a big residual, because it has a hue of its own.
 *   2. it is WIDE AND FLAT — measured aspect 5.6 / 6.3 / 10.6 on the three prop plates that have
 *      one. Real prop geometry in the same candidate set runs 0.6-1.8.
 *   3. it sits in the BOTTOM of the content bbox — measured topFrac 0.84-0.91.
 *
 * Test 1 alone is not enough and this is the trap: a grey building IS a scaled copy of a grey
 * backdrop, so t01's hangar wall (34,823 px) passes it. Adding 2 and 3 rejects the wall and every
 * other false positive across t01/t02/t03/t08/t10, p04 and z10, while still catching every shadow.
 *
 * Needs the backdrop colour, so `bg` must be supplied (bake.js passes what key.js estimated).
 * Without it the pass no-ops rather than guessing.
 *
 * `resMax` stays TIGHT at 16 on purpose. Raising it to 45 catches a chromatic (violet) shadow — but
 * it also lets the gun's brass shell stack qualify, and it removed the bottom third of the stack.
 * The stats did not show that; only looking at the output did. A tinted cast shadow only appears
 * when the prompt asks for directional light, which is the option D39 rejects, so the tight value
 * is the right trade. Raise it per-asset if you know the plate has no warm content low in frame.
 */
function dropShadow(img, opts = {}) {
  const { w, h, data } = img;
  const n = w * h;
  const bg = opts.bg;
  if (!bg) return -1;
  const bb = bg[0]*bg[0] + bg[1]*bg[1] + bg[2]*bg[2];
  const sLo = opts.sLo ?? 0.30, sHi = opts.sHi ?? 0.965, resMax = opts.resMax ?? 16;
  const minArea = opts.minArea ?? 200;
  const minAspect = opts.minAspect ?? 2.5;
  const minTopFrac = opts.minTopFrac ?? 0.72;
  // A cast shadow is also THIN. Measured heights, as a fraction of the content bbox: 0.06 / 0.09 /
  // 0.06. Without this cap a loose residual tolerance let the component grow up into the gun's
  // brass shell stack and take its lower half — caught by looking at the output, not by the stats.
  const maxHeightFrac = opts.maxHeightFrac ?? 0.15;

  const box = alphaBBox(img, 64);
  if (!box) return 0;

  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (data[i*4+3] < 128) continue;
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    const s = (r*bg[0] + g*bg[1] + b*bg[2]) / bb;
    if (s <= sLo || s >= sHi) continue;
    const dr = r - s*bg[0], dg = g - s*bg[1], db = b - s*bg[2];
    if (Math.sqrt(dr*dr + dg*dg + db*db) > resMax) continue;
    cand[i] = 1;
  }

  let dropped = 0;
  const hit = new Uint8Array(n);
  components(cand, w, h, comp => {
    if (comp.length < minArea) return;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (const i of comp) {
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (cw / ch < minAspect) return;
    if (ch / box.h > maxHeightFrac) return;
    if ((y0 - box.y) / box.h < minTopFrac) return;
    for (const i of comp) { data[i*4+3] = 0; hit[i] = 1; dropped++; }
  });

  // The shadow's own soft outer rim keyed partial and got colour-decontaminated, so it is no longer
  // near-neutral and the component test missed it. Sweep it with a small dilation.
  if (dropped) {
    const grown = morph(hit, w, h, 4, true);
    for (let i = 0; i < n; i++) if (grown[i] && !hit[i] && data[i*4+3] > 0 && data[i*4+3] < 210) { data[i*4+3] = 0; dropped++; }
  }
  return dropped;
}

function despeckle(img, minArea) {
  const { w, h, data } = img, n = w * h;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (data[i*4+3] > 96) solid[i] = 1;
  let killed = 0;
  components(solid, w, h, comp => {
    if (comp.length >= minArea) return;
    for (const i of comp) { data[i*4+3] = 0; killed++; }
  });
  return killed;
}

// ---------------------------------------------------------------- 2-4. value, temperature, tooth

/** Cheap bilateral on the luma channel: box neighbourhood, gaussian weight on value distance. */
function bilateralLuma(img, radius, range, passes) {
  const { w, h, data } = img, n = w * h;
  let L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = luma(data[i*4], data[i*4+1], data[i*4+2]);
  if (!radius || radius < 1) return L;
  const inv = 1 / (2 * range * range);
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i*4+3] === 0) { out[i] = L[i]; continue; }
      const c = L[i];
      let sum = 0, wsum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (data[j*4+3] === 0) continue;
          const d = L[j] - c;
          const wt = Math.exp(-d * d * inv);
          sum += L[j] * wt; wsum += wt;
        }
      }
      out[i] = wsum > 0 ? sum / wsum : c;
    }
    L = out;
  }
  return L;
}

// Luma-preserving temperature directions: 0.299*dr + 0.587*dg + 0.114*db == 0 for both, so the
// split-tone moves colour and leaves the value structure the quantiser just built exactly alone.
const WARM = [ 0.220, -0.062, -0.260];
const COOL = [-0.200,  0.052,  0.260];

function repaint(img, o, field) {
  const { w, h, data } = img, n = w * h;

  // Robust value range over the prop only. Percentiles, not min/max: one blown highlight or one
  // black bolt would otherwise squash every band into the middle.
  const ls = [];
  for (let i = 0; i < n; i++) if (data[i*4+3] > 128) ls.push(luma(data[i*4], data[i*4+1], data[i*4+2]));
  if (ls.length < 16) return;
  ls.sort((a, b) => a - b);
  const lo = ls[Math.floor(ls.length * 0.02)];
  const hi = ls[Math.floor(ls.length * 0.98)];
  const span = Math.max(8, hi - lo);
  const B = Math.max(2, o.bands | 0);

  // Band the FORM, not the surface. Quantising raw luminance turns the hangar's weathered wall
  // mottle into big white blobs — a textbook "posterise filter" artefact, and it looked exactly
  // that bad. A small bilateral flattens the texture while keeping real edges, so the bands follow
  // the lighting; the texture is then added back at reduced amplitude as `detail`.
  const Lsm = bilateralLuma(img, o.smooth, o.smoothRange, 2);

  // --- 2. quantise, dithered by the paper itself.
  // Two band maps, deliberately: `bandOf` carries the dither and drives colour, `clean` has none
  // and drives the wet edge. Running the ink off the dithered map scatters it as dark speckle
  // instead of drawing a contour — that was visibly wrong on the first pass.
  const bandOf = new Int8Array(n);
  const clean = new Int8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (data[i+3] === 0) { bandOf[p] = -1; clean[p] = -1; continue; }
    const L = Lsm[p];
    const gr = field ? field.at(x + o._ox, y + o._oy) : 0;
    // Band CENTRES, not endpoints. Snapping to lo/hi pushed whole wall panels to the 98th
    // percentile and blew them white on the hangar; centres keep the ends off the rails.
    const u = (L - lo) / span * B;
    bandOf[p] = clamp(Math.floor(u + gr * o.dither), 0, B - 1);
    clean[p] = clamp(Math.floor(u), 0, B - 1);
  }

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (bandOf[p] < 0) continue;
    let r = data[i], g = data[i+1], b = data[i+2];
    const L = luma(r, g, b);
    const gr = field ? field.at(x + o._ox, y + o._oy) : 0;

    const band = bandOf[p];
    const t = B > 1 ? band / (B - 1) : 0;
    const target = lo + (band + 0.5) / B * span + (L - Lsm[p]) * o.detail;
    const gain = clamp(target / Math.max(6, L), 0.5, 1.6);
    r *= gain; g *= gain; b *= gain;

    // Backdrop-coloured opaque pixels are a keying artefact (a filled hole), not paint. Warming
    // them is how the wagon's wheel gaps came out salmon pink. Leave them alone.
    const veiled = o.bg && Math.abs(r - o.bg[0]) < o.veil && Math.abs(g - o.bg[1]) < o.veil
                          && Math.abs(b - o.bg[2]) < o.veil;

    // --- 3. split tone
    if (o.temp && !veiled) {
      // Taper the cool end. At full strength the darkest band went saturated navy while its parent
      // body stayed olive, and a blind critic called that out as "the single most obvious processed
      // tell on the sheet" — a levels error, not a paint decision. The warm end keeps full strength;
      // the bottom of the ramp gets 40% rising to full by t = 0.35.
      const k = o.temp * (t < 0.35 ? 0.40 + 0.60 * (t / 0.35) : 1);
      r *= 1 + k * (COOL[0] + (WARM[0] - COOL[0]) * t);
      g *= 1 + k * (COOL[1] + (WARM[1] - COOL[1]) * t);
      b *= 1 + k * (COOL[2] + (WARM[2] - COOL[2]) * t);
    }

    // --- chroma lift (the neutral-light clause flattens saturation; the LUT expects value, not grey)
    if (o.sat !== 1 && !veiled) {
      const l2 = luma(r, g, b);
      r = l2 + (r - l2) * o.sat; g = l2 + (g - l2) * o.sat; b = l2 + (b - l2) * o.sat;
    }

    // --- 3b. wet edge. Gouache and poster work pool pigment where one flat tone meets the next;
    // that dark accent is a lot of what the eye reads as "painted" rather than "rendered". Draw it
    // on the DARKER side of every band boundary, so it follows the form the quantiser just found
    // instead of being a traced outline.
    if (o.ink) {
      const cb = clean[p];
      let lower = 0;
      if (x > 0 && clean[p-1] > cb) lower++;
      if (x < w-1 && clean[p+1] > cb) lower++;
      if (y > 0 && clean[p-w] > cb) lower++;
      if (y < h-1 && clean[p+w] > cb) lower++;
      if (lower) {
        const k = 1 - o.ink * Math.min(1, lower / 2) * (0.75 + 0.25 * gr);
        r *= k; g *= k; b *= k;
      }
    }

    // --- 4. paper tooth, multiplied
    if (o.grain && field) {
      const m = 1 + o.grain * gr;
      r *= m; g *= m; b *= m;
    }

    data[i] = clamp(Math.round(r), 0, 255);
    data[i+1] = clamp(Math.round(g), 0, 255);
    data[i+2] = clamp(Math.round(b), 0, 255);
  }
}

// ---------------------------------------------------------------- 5. hand-cut edge

/** Box-blur one float plane in place-ish. Cheap, and three passes is gaussian enough. */
function blurPlane(src, w, h, r, passes = 2) {
  let cur = src;
  const run = (s, W, H) => {
    const d = new Float32Array(s.length), win = r * 2 + 1;
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += s[y * W + clamp(k, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        d[y * W + x] = sum / win;
        sum -= s[y * W + clamp(x - r, 0, W - 1)];
        sum += s[y * W + clamp(x + r + 1, 0, W - 1)];
      }
    }
    return d;
  };
  const tr = (s, W, H) => { const d = new Float32Array(s.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[x * H + y] = s[y * W + x]; return d; };
  for (let p = 0; p < passes; p++) {
    cur = tr(run(cur, w, h), w, h);
    cur = tr(run(cur, h, w), h, w);
  }
  return cur;
}

/**
 * Push the OUTER alpha boundary in and out along a noise field. Soften first so there IS a ramp to
 * move (a hard key has none), displace, then re-sharpen. Two octaves: a coarse wander that makes
 * the outline wobble like a brush, and a fine one that makes it slightly ragged pixel to pixel.
 *
 * "Outer" is load-bearing and was the bug: a grey prop on a grey backdrop keys with genuine
 * semi-transparent patches INSIDE it (the hangar's pale wall panels sit within a few units of the
 * backdrop colour), and re-sharpening those pushed them to zero — the prop came out full of white
 * holes. So the displacement is confined to a collar around the silhouette, found by flood-filling
 * the true outside from the frame edge. Interior alpha is never touched.
 */
function roughEdge(img, o, field) {
  const { w, h, data } = img, n = w * h;

  // True outside = transparent AND reachable from the frame border.
  const outside = new Uint8Array(n);
  const stack = [];
  const push = i => { if (!outside[i] && data[i*4+3] < 128) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const collar = morph(outside, w, h, o.collar ?? 4, true);

  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = data[i*4+3] / 255;
  const soft = blurPlane(a, w, h, 2, 2);
  const cf = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    cf[y*w+x] = field ? field.at(x * 0.25 + o._ox, y * 0.25 + o._oy) : 0;
  const coarse = blurPlane(cf, w, h, 3, 2);
  let cmax = 1e-6;
  for (let i = 0; i < n; i++) cmax = Math.max(cmax, Math.abs(coarse[i]));

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!collar[i]) continue;
    const fine = field ? field.at(x + o._ox + 91, y + o._oy + 37) : 0;
    // Mostly the coarse wander. A big fine-noise term made the boundary a dithered speckle ring
    // rather than a brush edge, which read as a broken matte.
    const nse = (coarse[i] / cmax) * 0.88 + fine * 0.12;
    const v = clamp((soft[i] - 0.5 + o.edge * nse) * 2.8 + 0.5, 0, 1);
    data[i*4+3] = Math.round(v * 255);
  }
}

// ---------------------------------------------------------------- entry

function poster(img, opts = {}) {
  const preset = PRESETS[opts.preset || 'mech'];
  const o = { ...DEFAULTS, ...(preset || {}), ...opts };
  let out = img.clone();
  const stats = {};
  if (o.shadow) stats.shadowPx = dropShadow(out, o);
  if (o.speck) stats.speckPx = despeckle(out, o.speck);
  let field = null;
  const s0 = (o.seed | 0);
  try { field = loadField(o.grainFile, o.orient !== undefined ? o.orient : s0); } catch (e) { stats.grainMissing = String(e.message); }
  // A per-prop offset into the shared grain, so forty props do not all wear the same fibre.
  o._ox = ((s0 * 977) % 4093 + 4093) % 4093;
  o._oy = ((s0 * 1597) % 3571 + 3571) % 3571;
  if (o.maxdim) {
    const m = Math.max(out.w, out.h);
    if (m > o.maxdim) {
      const k = o.maxdim / m;
      out = trim(out, 2).img;
      out = resize(out, Math.max(1, Math.round(out.w * k)), Math.max(1, Math.round(out.h * k)));
      stats.resized = `${out.w}x${out.h}`;
    }
  }
  if (!o.bypass) {
    repaint(out, o, field);
    if (o.edge) roughEdge(out, o, field);
  }
  return { img: out, stats };
}

module.exports = { poster, dropShadow, despeckle, roughEdge, DEFAULTS, PRESETS };

if (require.main === module) {
  const [src, dst, ...rest] = process.argv.slice(2);
  if (!src || !dst) { console.error('usage: node poster.js in.png out.png [--bands 6] [--temp 0.55] ...'); process.exit(1); }
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, ''), v = rest[i+1];
    o[k] = v === undefined || isNaN(+v) ? v : +v;
  }
  if (typeof o.bg === 'string') o.bg = o.bg.split(',').map(Number);
  if (o.bgfrom) o.bg = require('./key.js').estimateBg(readPNG(o.bgfrom));
  const { img, stats } = poster(readPNG(src), o);
  const final = o.trim !== undefined ? trim(img, o.trim || 0).img : img;
  writePNG(dst, final, { forceAlpha: true });
  console.log(`${path.basename(dst)} ${final.w}x${final.h} ${JSON.stringify(stats)}`);
}
