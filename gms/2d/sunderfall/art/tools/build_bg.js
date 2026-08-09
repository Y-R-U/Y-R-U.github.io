// Compose the four locations' five parallax bands from keyed cutouts.
//
// Every band is 1536px wide and tiles horizontally: Band.place() draws a wrap copy of
// anything crossing an edge, so there is no seam to hide. Bands are drawn in world at
// the sizes recorded in the manifest (see BANDS below) — the texture is deliberately
// lower resolution than the world span it covers; these are soft painted backdrops and
// the budget is 12 MB for everything.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readPNG, writeSmallest, writePNG, resize, grade, mapPixels, Img, blur, composite, trim } = require('./img.js');
const { Band, flipX } = require('./compose.js');
const { rng, fbm, makeNoise, polyCoverage, paintCoverage } = require('./raster.js');
const { sculpt, soften, bandedHaze, pool, halo, KEY } = require('./light.js');

const ROOT = path.resolve(__dirname, '..');
const KEYED = path.join(ROOT, 'work', 'keyed');
const OUT = path.join(ROOT, '..', 'game', 'assets', 'bg');
fs.mkdirSync(OUT, { recursive: true });

// Recipes are authored in a 1536-wide space; UP is how much bigger the shipped texture
// is. Raise UP for sharper backdrops at a linear cost in payload.
const W = 1536;
const UP = 4 / 3;
// each band's aspect must equal its worldW/worldH below, or the texture is stretched
const H = { sky: 448, far: 384, mid: 512, near: 640, fg: 864 };
const outW = Math.round(W * UP / 4) * 4;
const outH = k => Math.round(H[k] * UP / 4) * 4;

// Where world y = 0 (the ground line) falls in each band's AUTHOR space, derived from
// BANDS below: world(a) = anchorY + a * worldH / H[band]. Anything authored below these
// numbers is buried in the terrain and will never be seen — the old near-band undergrowth
// sat 120px under the ground, which is why the play plane had nothing in front of it.
const GY = { far: 384, mid: 480, near: 564, fg: 712 };

// World placement of ONE TILE of each band. anchorY is the tile's TOP edge in world
// units (ground is y = 0, up is negative); worldW x worldH is one tile's world size.
// `skirtTo` is how far below the ground line the finished band must reach — bands are
// grown downward to that depth so their bottom edge is never on screen. A band edge
// that stops at the ground reads as a ruled line and looks exactly like a renderer bug.
const BANDS = {
  sky:  { parallax: 0.05, worldW: 4608, worldH: 1344, anchorY: -1290, skirtTo: 1000 },
  far:  { parallax: 0.18, worldW: 3840, worldH:  960, anchorY:  -960, skirtTo:  900 },
  mid:  { parallax: 0.38, worldW: 3072, worldH: 1024, anchorY:  -960, skirtTo:  820 },
  near: { parallax: 0.62, worldW: 2560, worldH: 1067, anchorY:  -940, skirtTo:  740 },
  fg:   { parallax: 1.32, worldW: 2048, worldH: 1152, anchorY:  -950, skirtTo:  520 },
};

/**
 * Grow a band downward so its bottom edge sits `skirtTo` world px under the ground.
 * Opaque bands ramp into a solid deep-fog colour; the foreground occluder just gets
 * transparent rows, because anything solid down there would hide the player.
 */
function addSkirt(img, band, deep, transparent) {
  const b = BANDS[band];
  const perTexel = b.worldH / img.h;                    // world px per texture px
  const bottomNow = b.anchorY + b.worldH;
  const extraWorld = Math.max(0, b.skirtTo - bottomNow);
  const extra = Math.round(extraWorld / perTexel);
  if (extra <= 0) return { img, worldH: b.worldH };
  const out = new Img(img.w, img.h + extra);
  out.data.set(img.data);
  if (!transparent) {
    const ramp = Math.min(56, Math.round(img.h * 0.12));
    for (let y = img.h - ramp; y < img.h; y++) {
      const t = (y - (img.h - ramp)) / ramp;
      const k = t * t;
      for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * 4;
        const a = out.data[i + 3] / 255;
        const na = a + (1 - a) * k;
        for (let c = 0; c < 3; c++)
          out.data[i + c] = Math.round((out.data[i + c] * a * (1 - k) + deep[c] * k) / na);
        out.data[i + 3] = Math.round(na * 255);
      }
    }
    for (let y = img.h; y < out.h; y++) {
      const f = 1 - Math.min(1, (y - img.h) / extra) * 0.45;   // sinks into the dark
      for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * 4;
        out.data[i] = Math.round(deep[0] * f);
        out.data[i+1] = Math.round(deep[1] * f);
        out.data[i+2] = Math.round(deep[2] * f);
        out.data[i+3] = 255;
      }
    }
  }
  return { img: out, worldH: b.worldH + extra * perTexel };
}

const cache = new Map();
function A(name) {
  if (!cache.has(name)) {
    const p = path.join(KEYED, name + '.png');
    if (!fs.existsSync(p)) { console.warn('  MISSING ' + name); return null; }
    let im = readPNG(p);
    // sculpt cost is quadratic in pixels and nothing is ever placed above ~900px wide
    if (Math.max(im.w, im.h) > 900) {
      const s = 900 / Math.max(im.w, im.h);
      im = resize(im, Math.round(im.w * s), Math.round(im.h * s));
    }
    cache.set(name, im);
  }
  return cache.get(name);
}

// ---------------------------------------------------------------- the key light
//
// ONE key for the whole game (light.KEY, upper-left), and every band element obeys it.
// Strength falls off with depth: the far band is almost pure atmosphere and carries only a
// hint of form, the near band gets the full treatment. This is defect #1, and it is the
// reason the shafts in the old frames lit nothing — they were the only thing in the image
// that knew where the light was.
const DEPTH = {
  far:  { keyAmt: 0.14, shadowSide: 0.20, rim: 0.12, cavity: 0.18, contact: 0.14, planar: 0.75, broad: 0.22 },
  mid:  { keyAmt: 0.30, shadowSide: 0.44, rim: 0.30, cavity: 0.36, contact: 0.26, planar: 0.68 },
  near: { keyAmt: 0.42, shadowSide: 0.50, rim: 0.50, cavity: 0.50, contact: 0.38, planar: 0.58 },
};
// Three discrete atmosphere steps per band instead of one smooth airbrush (defect #4a) —
// but the step lines must be broken in x, or a plateau boundary is a ruled line across the
// whole screen and looks exactly like a renderer bug. The value separation that actually
// reads as depth comes from the DIFFERENCE between far / mid / near, not from the steps.
const HAZE_STOPS = {
  far:  [[0.00, 0.58], [0.40, 0.60], [0.58, 0.72], [0.78, 0.74], [0.90, 0.88], [1.00, 0.88]],
  mid:  [[0.00, 0.14], [0.38, 0.17], [0.56, 0.30], [0.76, 0.33], [0.90, 0.54], [1.00, 0.54]],
  near: [[0.00, 0.04], [0.44, 0.05], [0.64, 0.12], [0.84, 0.14], [0.94, 0.30], [1.00, 0.30]],
};
function depthHaze(img, color, band, seed) {
  const n = makeNoise(seed, 5), n2 = makeNoise(seed + 13, 17);
  const amp = img.h * 0.055;
  return bandedHaze(img, color, HAZE_STOPS[band], {
    hardness: 0.92,
    jitter: u => (n(u, 0.3) - 0.5) * 2 * amp + (n2(u, 0.7) - 0.5) * amp * 0.5,
  });
}

/**
 * Ramp a cutout's alpha to zero over its lower `frac`.
 *
 * The keyed treeline renders are a ragged silhouette on top of a SOLID RECTANGLE. At the
 * old fog levels that rectangle was invisible; the moment the depth bands were given real
 * value separation it appeared as a lit block with a hard vertical edge in the middle of
 * the frame. Anything sitting on the horizon has to dissolve into the haze, not stop.
 */
function fadeBottom(img, frac = 0.45, curve = 1.6) {
  const { w, h } = img;
  const y0 = h * (1 - frac);
  return mapPixels(img, (r, g, b, a, x, y) => {
    if (!a || y < y0) return null;
    const t = Math.min(1, (y - y0) / (h - y0));
    return [r, g, b, a * (1 - t ** curve)];
  });
}

/**
 * Feather a panorama's left and right ends.
 *
 * `el_treeline_*` and friends are 1536px-wide panoramas, not objects. Placed at any scale
 * other than exactly the band width they leave a HARD VERTICAL CUT down the frame — the
 * single most obvious "this is a texture" tell in the round-1 art. Two feathered panoramas
 * at different scales overlap into one continuous horizon instead.
 */
function fadeSides(img, frac = 0.16, curve = 1.3) {
  const { w } = img;
  const e = Math.max(2, w * frac);
  return mapPixels(img, (r, g, b, a, x) => {
    if (!a) return null;
    const d = Math.min(x, w - 1 - x);
    if (d >= e) return null;
    return [r, g, b, a * (d / e) ** curve];
  });
}

const litCache = new Map();
/** A(name) lit for a given depth band. Cached — sculpt is the expensive step in this file. */
const HORIZON = /^(el_treeline_|el_ruin_far|el_village_far|el_burnt_far)/;
function L(name, depth, extra = null) {
  const k = `${name}|${depth}|${extra ? JSON.stringify(extra) : ''}`;
  if (!litCache.has(k)) {
    let src = A(name);
    // trim first: these renders carry transparent padding, so a fraction of the IMAGE
    // height is not a fraction of the silhouette and the solid base survives the fade
    if (src && depth === 'far' && HORIZON.test(name))
      src = fadeSides(fadeBottom(trim(src, 0).img, name.startsWith('el_treeline_') ? 0.62 : 0.40, 1.15), 0.20);
    litCache.set(k, src ? sculpt(src, { ...DEPTH[depth], ...(extra || {}) }) : null);
  }
  return litCache.get(k);
}

/**
 * A mid-depth content layer at knee-to-shoulder height: receding logs, bracken, fallen
 * masonry, a ridge. Defect #4 — the gap between the far band and the play plane was a flat
 * fog wash carrying no information. Placed in clumps with real gaps, never evenly.
 */
function midContent(b, names, o = {}) {
  const { y, seed = 5, clumps = 4, per = 3, scale = 0.2, spread = 190, fog = 0.4,
          fogColor = [70, 84, 96], sat = 0.45, dark = 0.2, depth = 'mid' } = o;
  const r = rng(seed);
  const src = names.map(n => L(n, depth)).filter(Boolean);
  if (!src.length) return b;
  for (let c = 0; c < clumps; c++) {
    // clump centres jittered hard so the rhythm is broken, not stepped
    const cx = (c + 0.15 + r() * 0.7) * (W / clumps);
    const n = 1 + Math.floor(r() * per);
    for (let i = 0; i < n; i++) {
      const im = src[Math.floor(r() * src.length) % src.length];
      const s = scale * (0.6 + r() * 0.85);
      b.place(im, { x: cx + (r() - 0.5) * spread, y: y + (r() - 0.5) * 26,
                    scale: s, flip: r() < 0.5, fog: fog + (r() - 0.5) * 0.14,
                    fogColor, sat, dark: dark + r() * 0.16 });
    }
  }
  return b;
}

/**
 * Structure for a backdrop that was otherwise an airbrush gradient (defect #11): a moon or
 * hazy sun placed AT THE KEY'S ORIGIN so the light in the scene is motivated, a cloud mass
 * with a lit edge on the key side, and two ridgelines that give the horizon some logic.
 * Everything is periodic in x or wrap-drawn, because the sky band tiles.
 */
// NOTE ON `moon`: the sky band is 4608 world px wide at parallax 0.05, so it barely moves
// and the moon's SCREEN position is set almost entirely by where it sits in the texture.
// At the reference cameras the visible window starts around u = 0.80, so u ~ 0.86 puts the
// moon in the upper LEFT of frame — which is where light.KEY says the light comes from.
// Put it anywhere else and the frame contradicts its own key.
function skyStructure(img, o = {}) {
  const { moon = [0.86, 0.20], moonR = 0.026, moonCol = [232, 240, 255], moonStrength = 1,
          glowR = 0.30, glowCol = [92, 118, 150], glowStrength = 0.55,
          cloud = [150, 170, 196], cloudAmt = 0.42, cloudY = 0.30, seed = 3,
          ridge = [[0.63, [32, 40, 52], 0.42, 14], [0.76, [20, 27, 36], 0.55, 7]] } = o;
  const { w, h } = img;
  const out = img.clone();

  // --- cloud mass: a density field, then lit on the key side so it has a form
  const n = fbm(seed, 3, 4), n2 = fbm(seed + 41, 6, 3);
  const dens = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const vy = y / h;
    const prof = Math.exp(-(((vy - cloudY) / 0.17) ** 2) * 1.6);
    if (prof < 0.01) continue;
    for (let x = 0; x < w; x++) {
      const v = n(x / w, vy * 1.9) * 0.72 + n2(x / w, vy * 2.6) * 0.28;
      dens[y * w + x] = Math.max(0, (v - 0.46) / 0.5) * prof;
    }
  }
  const cl = new Img(w, h);
  for (let i = 0; i < dens.length; i++) {
    const d = Math.min(1, dens[i] * 1.7);
    if (d <= 0.004) continue;
    cl.data[i*4] = cloud[0]; cl.data[i*4+1] = cloud[1]; cl.data[i*4+2] = cloud[2];
    cl.data[i*4+3] = Math.round(d * 255);
  }
  const clLit = sculpt(cl, { keyAmt: 0.55, shadowSide: 0.42, rim: 0.60, cavity: 0.10,
                             contact: 0, planar: 0.35, broad: 0.10, edge: 0.02 });
  composite(out, clLit, 0, 0, cloudAmt);

  // --- ridgelines. These have to sit a long way back: a crisp, contrasty ridge across the
  // whole frame is a ruled line and reads as a texture bug, not as land. Low opacity, heavy
  // blur, three noise octaves so the profile is a landscape rather than one hill.
  for (const [ry, col, alpha, softR] of ridge) {
    const s1 = seed + Math.round(ry * 1000);
    const rn = makeNoise(s1, 3), rn2 = makeNoise(s1 + 77, 7), rn3 = makeNoise(s1 + 311, 19);
    const pts = [];
    for (let x = 0; x <= w; x += 6) {
      const u = x / w;
      pts.push([x, h * ry - (rn(u, 0.4) - 0.5) * h * 0.085
                          - (rn2(u, 0.6) - 0.5) * h * 0.040
                          - (rn3(u, 0.2) - 0.5) * h * 0.014]);
    }
    pts.push([w, h], [0, h]);
    const cov = polyCoverage(w, h, pts, 3);
    const layer = new Img(w, h);
    for (let i = 0; i < cov.length; i++) {
      if (cov[i] <= 0.002) continue;
      layer.data[i*4] = col[0]; layer.data[i*4+1] = col[1]; layer.data[i*4+2] = col[2];
      layer.data[i*4+3] = Math.round(Math.min(1, cov[i]) * 255);
    }
    composite(out, blur(layer, softR, 2), 0, 0, alpha);
  }

  // --- the light source itself, and the halo that says the air is thick
  const mx = moon[0] * w, my = moon[1] * h;
  halo(out, mx, my, glowR * w, glowCol, glowStrength, 2.4, true);
  if (moonStrength > 0) {
    const mr = moonR * w;
    for (let y = Math.floor(my - mr - 2); y <= my + mr + 2; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = Math.floor(mx - mr - 2); x <= mx + mr + 2; x++) {
        if (x < 0 || x >= w) continue;
        const d = Math.hypot(x - mx, y - my) / mr;
        const k = Math.max(0, Math.min(1, (1.06 - d) / 0.10)) * moonStrength;
        if (k <= 0) continue;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out.data[i + c] = out.data[i + c] + (moonCol[c] - out.data[i + c]) * k;
      }
    }
  }
  return out;
}

/**
 * Stretch a sky render to the band size and make it loop.
 * The source is resized to W+OVERLAP and the overlap column is cross-faded back over
 * the start, which is the only version of this that actually closes the seam: out(0)
 * equals src(W), so tile n's last column meets tile n+1's first column exactly.
 */
function skyBand(name, tintOpts) {
  const src = A(name);
  if (!src) return Img.blank(outW, outH('sky'), 10, 12, 20, 255);
  const B = 200;
  const SW = outW, SH = outH('sky');
  const wide = resize(src, SW + B, SH);
  const img = new Img(SW, SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const o = (y * SW + x) * 4;
    const a = (y * (SW + B) + x) * 4;
    if (x >= B) {
      for (let c = 0; c < 3; c++) img.data[o + c] = wide.data[a + c];
    } else {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * x / B);
      const b = (y * (SW + B) + SW + x) * 4;
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(wide.data[b + c] * (1 - t) + wide.data[a + c] * t);
    }
    img.data[o + 3] = 255;
  }
  return tintOpts ? grade(img, tintOpts) : img;
}

const LOC = {};

// ---------------------------------------------------------------- thornmere
LOC.thornmere = {
  fogFar: [96, 92, 118], fogMid: [72, 68, 96], deep: [26, 22, 36],
  sky: () => skyStructure(skyBand('sky_thornmere'), {
    moon: [0.865, 0.17], moonR: 0.020, moonCol: [250, 236, 214], glowCol: [126, 104, 118],
    glowStrength: 0.62, glowR: 0.34, cloud: [172, 150, 168], cloudAmt: 0.40, cloudY: 0.34, seed: 4,
    ridge: [[0.63, [62, 56, 78], 0.42, 14], [0.76, [40, 35, 52], 0.55, 7]],
  }),
  far() {
    const b = new Band(outW, outH('far'), W);
    const tl = L('el_treeline_c', 'far'), v = L('el_village_far', 'far');
    if (tl) for (let i = 0; i < 2; i++)
      b.place(tl, { x: 300 + i * 880, y: GY.far, scale: 0.58 + i * 0.1, flip: i === 1, fog: 0.82, fogColor: this.fogFar, sat: 0.45 });
    if (v) b.place(v, { x: 760, y: GY.far + 6, scale: 0.7, fog: 0.6, fogColor: this.fogFar, sat: 0.6 });
    b.mist([132, 118, 140], { amount: 0.45, seed: 5, yCentre: 0.86, ySpread: 0.28 });
    return depthHaze(b.img, [104, 96, 124], 'far', 21);
  },
  mid() {
    const b = new Band(outW, outH('mid'), W);
    const trees = [L('el_oak_c', 'mid'), L('el_deadtree_a', 'mid')].filter(Boolean);
    trees.forEach((t, i) => b.place(t, { x: 120 + i * 1180, y: GY.mid + 30, scale: 0.34, fog: 0.55, fogColor: this.fogMid, sat: 0.5, flip: i === 1 }));
    const homes = [['el_cottage_a', 300, 0.52], ['el_barn_a', 700, 0.42], ['el_cottage_b', 1030, 0.46], ['el_cottage_c', 1330, 0.44]];
    for (const [n, x, sc] of homes) { const im = L(n, 'mid'); if (im) b.place(im, { x, y: GY.mid + 8, scale: sc, fog: 0.3, fogColor: this.fogMid, sat: 0.8 }); }
    midContent(b, ['el_fence_a', 'el_bush_a', 'el_rubble_a', 'el_log_a'],
               { y: GY.mid - 26, seed: 111, clumps: 4, per: 3, scale: 0.17, fog: 0.34, fogColor: this.fogMid, sat: 0.5 });
    const sh = A('el_shaft_b');
    if (sh) b.place(sh, { x: 500, y: GY.mid + 30, scale: 0.8, flip: true, alpha: 0.35, tint: [1.0, 0.78, 0.45] });
    b.glow([70, 40, 12], 0.46, 0.78, 0.42, 0.85);
    b.mist([120, 104, 122], { amount: 0.4, seed: 9, yCentre: 0.9, ySpread: 0.22 });
    return depthHaze(b.img, [70, 62, 92], 'mid', 33);
  },
  near() {
    const b = new Band(outW, outH('near'), W);
    const f = L('el_fence_a', 'near'), lp = L('el_lantern_post', 'near', { keyAmt: 0.24 }),
          wl = L('el_well_a', 'near'), bs = L('el_bush_a', 'near'), fn = L('el_fern_a', 'near');
    if (f) for (let i = 0; i < 3; i++) b.place(f, { x: 150 + i * 560, y: GY.near - 6 + (i % 2) * 14, scale: 0.46 + i * 0.06, flip: i === 1, fog: 0.14, fogColor: this.fogMid, sat: 0.75 });
    if (wl) b.place(wl, { x: 980, y: GY.near + 2, scale: 0.5, fog: 0.14, sat: 0.75 });
    if (lp) b.place(lp, { x: 430, y: GY.near + 2, scale: 0.62, fog: 0.08, sat: 0.9 });
    clumpScatter(b, [bs, fn], { count: 22, seed: 71, clumps: 6, y: GY.near + 4, ySpread: 16,
                                scale: [0.15, 0.28], dark: 0.46, sat: 0.45 });
    // the lantern is a light, so it lights the ground it stands on and its neighbours
    pool(b.img, 430 * b.k, (GY.near + 4) * b.k, 210 * b.k, 44 * b.k, [126, 78, 26], 0.9, { wrap: true });
    halo(b.img, 430 * b.k, (GY.near - 120) * b.k, 150 * b.k, [110, 68, 22], 0.55, 2.6, true);
    b.glow([56, 30, 8], 0.28, 0.6, 0.2, 0.7);
    return depthHaze(b.img, [48, 42, 66], 'near', 45);
  },
  fg: () => fgBand(['el_canopy_e', 'el_canopy_c', 'el_canopy_d'], ['el_under_c', 'el_under_a', 'el_under_b'], 0.9, 3, [10, 9, 16]),
};

// ---------------------------------------------------------------- sunderwood
LOC.sunderwood = {
  fogFar: [76, 106, 116], fogMid: [46, 76, 88], deep: [16, 28, 34],
  sky: () => skyStructure(skyBand('sky_sunderwood'), {
    moon: [0.860, 0.15], moonR: 0.024, moonCol: [236, 246, 255], glowCol: [96, 138, 164],
    glowStrength: 0.72, glowR: 0.36, cloud: [146, 178, 196], cloudAmt: 0.44, cloudY: 0.31, seed: 9,
    ridge: [[0.62, [48, 68, 80], 0.42, 14], [0.75, [30, 46, 55], 0.55, 7]],
  }),
  far() {
    const b = new Band(outW, outH('far'), W);
    const a = L('el_treeline_a', 'far'), c = L('el_treeline_b', 'far');
    if (a) b.place(a, { x: 400, y: GY.far + 8, scale: 0.66, fog: 0.86, fogColor: this.fogFar, sat: 0.3 });
    if (c) b.place(c, { x: 1150, y: GY.far + 4, scale: 0.6, flip: true, fog: 0.8, fogColor: this.fogFar, sat: 0.3 });
    b.mist([150, 190, 200], { amount: 0.5, seed: 17, yCentre: 0.8, ySpread: 0.32 });
    return depthHaze(b.img, [84, 118, 128], 'far', 12);
  },
  mid() {
    const b = new Band(outW, outH('mid'), W);
    const oaks = ['el_oak_a', 'el_oak_b', 'el_oak_c', 'el_deadtree_a'].map(n => L(n, 'mid')).filter(Boolean);
    const r = rng(404);
    // clumped, not evenly spaced: three stands with real gaps between them
    let x = 60;
    for (let i = 0; i < 7; i++) {
      const t = oaks[i % oaks.length];
      b.place(t, { x, y: GY.mid + 34, scale: 0.30 + r() * 0.17,
                   flip: r() < 0.5, fog: 0.42 + r() * 0.22, fogColor: this.fogMid, sat: 0.45 });
      x += (i % 3 === 2 ? 330 : 150) + r() * 90;
    }
    midContent(b, ['el_log_a', 'el_fern_b', 'el_stump_a', 'el_rock_a', 'el_bush_a'],
               { y: GY.mid - 18, seed: 222, clumps: 5, per: 4, scale: 0.19, fog: 0.36,
                 fogColor: this.fogMid, sat: 0.42, dark: 0.24 });
    const sh = A('el_shaft_a');
    // flipped: the source leans down-left, and the key comes from the upper LEFT
    if (sh) for (let i = 0; i < 2; i++)
      b.place(sh, { x: 300 + i * 720, y: GY.mid + 40, scale: 0.85 + i * 0.15, flip: true, alpha: 0.46 - i * 0.1, tint: [0.78, 0.92, 1.0] });
    b.glow([30, 48, 60], 0.24, 0.22, 0.5, 0.6);
    b.mist([160, 200, 210], { amount: 0.5, seed: 23, yCentre: 0.78, ySpread: 0.3 });
    return depthHaze(b.img, [44, 74, 86], 'mid', 8);
  },
  near() {
    const b = new Band(outW, outH('near'), W);
    const oaks = ['el_oak_a', 'el_oak_b'].map(n => L(n, 'near')).filter(Boolean);
    oaks.forEach((t, i) => b.place(t, { x: 200 + i * 940, y: GY.near + 46, scale: 0.56 + i * 0.09, flip: i === 1, fog: 0.06, fogColor: this.fogMid, sat: 0.55, dark: 0.10 }));
    const un = ['el_stump_a', 'el_mushroom_a', 'el_fern_a', 'el_fern_b'].map(n => L(n, 'near')).filter(Boolean);
    clumpScatter(b, un, { count: 26, seed: 91, clumps: 6, y: GY.near + 6, ySpread: 18,
                          scale: [0.16, 0.30], dark: 0.44, sat: 0.45 });
    b.mist([150, 195, 205], { amount: 0.4, seed: 31, yCentre: 0.9, ySpread: 0.2 });
    return depthHaze(b.img, [34, 60, 70], 'near', 55);
  },
  fg: () => fgBand(['el_canopy_c', 'el_canopy_f', 'el_canopy_d', 'el_canopy_e'], ['el_under_a', 'el_under_b', 'el_under_c'], 0.92, 7, [8, 14, 16]),
};

// ---------------------------------------------------------------- glyphglade
LOC.glyphglade = {
  fogFar: [118, 104, 82], fogMid: [80, 68, 56], deep: [30, 24, 18],
  sky: () => skyStructure(skyBand('sky_glyphglade'), {
    moon: [0.870, 0.19], moonR: 0.030, moonCol: [255, 238, 206], moonStrength: 0.55,
    glowCol: [150, 108, 52], glowStrength: 0.80, glowR: 0.40,
    cloud: [186, 158, 124], cloudAmt: 0.46, cloudY: 0.33, seed: 13,
    ridge: [[0.64, [74, 62, 48], 0.42, 14], [0.77, [46, 38, 30], 0.55, 7]],
  }),
  far() {
    const b = new Band(outW, outH('far'), W);
    const bf = L('el_burnt_far', 'far'), tl = L('el_treeline_a', 'far');
    if (tl) b.place(tl, { x: 900, y: GY.far, scale: 0.6, fog: 0.9, fogColor: this.fogFar, sat: 0.2 });
    if (bf) b.place(bf, { x: 500, y: GY.far + 6, scale: 0.7, fog: 0.62, fogColor: this.fogFar, sat: 0.5 });
    b.mist([196, 176, 140], { amount: 0.5, seed: 13, yCentre: 0.82, ySpread: 0.3 });
    return depthHaze(b.img, [126, 110, 88], 'far', 61);
  },
  mid() {
    const b = new Band(outW, outH('mid'), W);
    const bar = A('el_barrier_a');
    if (bar) {
      const g = grade(resize(bar, Math.round(bar.w * 0.9), Math.round(bar.h * 0.9)), { tint: [1.1, 0.95, 0.62] });
      b.place(g, { x: 768, y: GY.mid + 70, alpha: 0.85 });
    }
    const trees = ['el_burnt_a', 'el_burnt_b', 'el_deadtree_a'].map(n => L(n, 'mid')).filter(Boolean);
    const r = rng(77);
    let x = 90;
    for (let i = 0; i < 6; i++) {
      b.place(trees[i % trees.length], { x, y: GY.mid + 34, scale: 0.38 + r() * 0.18,
                   flip: r() < 0.5, fog: 0.35 + r() * 0.22, fogColor: this.fogMid, sat: 0.5 });
      x += (i === 2 ? 420 : 190) + r() * 110;
    }
    midContent(b, ['el_scorch_a', 'el_rubble_a', 'el_stump_a', 'el_log_a'],
               { y: GY.mid - 20, seed: 333, clumps: 4, per: 3, scale: 0.2, fog: 0.32,
                 fogColor: this.fogMid, sat: 0.44, dark: 0.26 });
    const sh = A('el_shaft_b');
    if (sh) b.place(sh, { x: 560, y: GY.mid + 40, scale: 0.9, flip: true, alpha: 0.5, tint: [1.0, 0.8, 0.5] });
    b.glow([84, 56, 16], 0.3, 0.5, 0.45, 0.9);
    b.mist([200, 176, 132], { amount: 0.45, seed: 41, yCentre: 0.8, ySpread: 0.3 });
    return depthHaze(b.img, [78, 64, 50], 'mid', 90);
  },
  near() {
    const b = new Band(outW, outH('near'), W);
    const trees = ['el_burnt_a', 'el_burnt_b'].map(n => L(n, 'near')).filter(Boolean);
    trees.forEach((t, i) => b.place(t, { x: 250 + i * 900, y: GY.near + 52, scale: 0.58 + i * 0.1, flip: i === 1, fog: 0.08, sat: 0.65 }));
    const sc = L('el_scorch_a', 'near', { rim: 0.2, keyAmt: 0.2 });
    if (sc) for (let i = 0; i < 4; i++) b.place(sc, { x: 160 + i * 400 + (i % 2) * 60, y: GY.near + 10, scale: 0.48 + (i % 3) * 0.09, flip: i % 2 === 1, dark: 0.25 });
    const un = ['el_stump_a', 'el_rubble_a', 'el_rock_a'].map(n => L(n, 'near')).filter(Boolean);
    clumpScatter(b, un, { count: 18, seed: 55, clumps: 5, y: GY.near + 8, ySpread: 14,
                          scale: [0.18, 0.30], dark: 0.44, sat: 0.45 });
    b.glow([74, 38, 8], 0.5, 0.85, 0.55, 0.7);
    return depthHaze(b.img, [58, 46, 36], 'near', 22);
  },
  fg: () => fgBand(['el_canopy_e', 'el_canopy_c'], ['el_under_c', 'el_under_a'], 0.95, 11, [16, 10, 6]),
};

// ---------------------------------------------------------------- ruinreach
LOC.ruinreach = {
  fogFar: [110, 122, 136], fogMid: [66, 80, 92], deep: [20, 26, 32],
  sky: () => skyStructure(skyBand('sky_ruinreach', { tint: [0.60, 0.64, 0.74], contrast: 1.12, saturation: 0.85 }), {
    moon: [0.858, 0.16], moonR: 0.022, moonCol: [244, 246, 255], glowCol: [104, 122, 152],
    glowStrength: 0.66, glowR: 0.34, cloud: [158, 172, 196], cloudAmt: 0.44, cloudY: 0.30, seed: 21,
    ridge: [[0.63, [54, 64, 80], 0.42, 14], [0.76, [34, 41, 52], 0.55, 7]],
  }),
  far() {
    const b = new Band(outW, outH('far'), W);
    const rf = L('el_ruin_far', 'far'), tl = L('el_treeline_c', 'far');
    if (tl) b.place(tl, { x: 500, y: GY.far + 4, scale: 0.6, fog: 0.85, fogColor: this.fogFar, sat: 0.25, dark: 0.2 });
    if (rf) b.place(rf, { x: 980, y: GY.far + 4, scale: 0.8, fog: 0.6, fogColor: this.fogFar, sat: 0.4, dark: 0.22 });
    b.mist([132, 148, 166], { amount: 0.45, seed: 19, yCentre: 0.82, ySpread: 0.3 });
    return depthHaze(b.img, [72, 84, 100], 'far', 71);
  },
  mid() {
    const b = new Band(outW, outH('mid'), W);
    const items = [['el_ruinwall_a', 140, 0.78], ['el_arch_a', 520, 0.72], ['el_buttress_a', 900, 0.66],
                   ['el_ruinwall_a', 1210, 0.55], ['p_pillar', 1430, 0.62]];
    for (const [n, x, sc] of items) { const im = L(n, 'mid'); if (im) b.place(im, { x, y: GY.mid + 26, scale: sc, fog: 0.28, fogColor: this.fogMid, sat: 0.5, dark: 0.22 }); }
    const t = L('el_oak_c', 'mid');
    if (t) for (let i = 0; i < 3; i++) b.place(t, { x: 340 + i * 540, y: GY.mid + 26, scale: 0.32 + i * 0.05, flip: i === 1, fog: 0.5, fogColor: this.fogMid, sat: 0.4, dark: 0.2 });
    midContent(b, ['el_rubble_a', 'el_rock_a', 'el_bush_a', 'el_log_a'],
               { y: GY.mid - 22, seed: 444, clumps: 5, per: 3, scale: 0.19, fog: 0.3,
                 fogColor: this.fogMid, sat: 0.42, dark: 0.24 });
    const sh = A('el_shaft_a');
    if (sh) b.place(sh, { x: 640, y: GY.mid + 40, scale: 0.9, flip: true, alpha: 0.45, tint: [0.8, 0.88, 1.0] });
    b.glow([42, 54, 68], 0.28, 0.3, 0.4, 0.6);
    b.mist([146, 164, 182], { amount: 0.42, seed: 29, yCentre: 0.78, ySpread: 0.3 });
    return depthHaze(b.img, [44, 56, 70], 'mid', 15);
  },
  near() {
    const b = new Band(outW, outH('near'), W);
    const bu = L('el_buttress_a', 'near'), pi = L('p_pillar', 'near'), rw = L('el_ruinwall_a', 'near');
    if (bu) b.place(bu, { x: 240, y: GY.near + 40, scale: 0.78, fog: 0.08, sat: 0.55 });
    if (rw) b.place(rw, { x: 1180, y: GY.near + 30, scale: 0.8, flip: true, fog: 0.1, sat: 0.55 });
    const un = ['el_rubble_a', 'el_bush_a', 'el_fern_a', 'el_rock_a'].map(n => L(n, 'near')).filter(Boolean);
    clumpScatter(b, un, { count: 22, seed: 63, clumps: 6, y: GY.near + 6, ySpread: 18,
                          scale: [0.16, 0.28], dark: 0.44, sat: 0.45 });
    b.mist([176, 194, 206], { amount: 0.4, seed: 37, yCentre: 0.9, ySpread: 0.2 });
    return depthHaze(b.img, [48, 60, 72], 'near', 35);
  },
  fg() {
    return fgBand(['el_canopy_d', 'el_canopy_f', 'el_canopy_c'], ['el_under_b', 'el_under_c', 'el_under_a'], 0.93, 13, [10, 13, 16]);
  },
};

/**
 * Scatter in clumps with gaps, at varied scale and mirroring. Even spacing at one scale is
 * the thing that made the old undergrowth read as a repeated stamp (defect #6 and #7).
 */
function clumpScatter(b, srcs, o) {
  const { count, seed, clumps = 4, y, ySpread = 12, scale = [0.15, 0.22], dark = 0.5, sat = 0.4 } = o;
  const list = srcs.filter(Boolean);
  if (!list.length) return b;
  const r = rng(seed);
  const centres = [];
  for (let c = 0; c < clumps; c++) centres.push((c + 0.1 + r() * 0.8) * (W / clumps));
  for (let i = 0; i < count; i++) {
    const cx = centres[i % clumps];
    const im = list[Math.floor(r() * list.length) % list.length];
    b.place(im, { x: cx + (r() - 0.5) * (W / clumps) * 0.8, y: y + r() * ySpread,
                  scale: scale[0] + r() * (scale[1] - scale[0]), flip: r() < 0.5,
                  dark: dark + (r() - 0.5) * 0.18, sat });
  }
  return b;
}

/** The near-black occluder band: canopy across the top, undergrowth along the bottom. */
function fgBand(canopies, unders, dark, seed, tint) {
  const b = new Band(outW, outH('fg'), W);
  const r = rng(seed);
  const can = canopies.map(c => A(Array.isArray(c) ? c[0] : c)).filter(Boolean);
  for (let i = 0; i < 4; i++) {
    const im = can[i % can.length];
    if (!im) break;
    const target = H.fg * (0.20 + r() * 0.09);
    // pushed up past the top edge: the source's branches merge into a solid bar up there,
    // and a solid bar across the band reads as a black rectangle on screen
    b.place(im, { x: 150 + i * 384 + (r() - 0.5) * 190, y: -Math.round(target * 0.22),
                  anchor: 'top', scale: target / im.h, flip: r() < 0.5, dark, sat: 0.25 });
  }
  const un = unders.map(A).filter(Boolean);
  for (let i = 0; i < un.length && i < 12; i++) {
    for (let k = 0; k < 2; k++) {
      const im = un[i];
      // keep the occluding grass under ~150 world px: it frames the shot, it must not
      // fill the play space
      const target = H.fg * (0.07 + r() * 0.06);
      // the ground line sits at 0.824 of this band; undergrowth roots just below it
      b.place(im, { x: r() * W, y: H.fg * 0.87 + r() * H.fg * 0.05, scale: target / im.h,
                    flip: r() < 0.5, dark, sat: 0.2 });
    }
  }
  // a whisper of colour so the occluder is not a dead black hole, and a hard alpha
  // floor so no faint veil survives to paint a rectangle across the screen
  return mapPixels(b.img, (rr, gg, bb, a) => {
    if (!a) return null;
    const v = a / 255;
    const na = v < 0.28 ? 0 : Math.min(1, (v - 0.28) / 0.5) * 255;
    return [rr * 0.55 + tint[0], gg * 0.55 + tint[1], bb * 0.55 + tint[2], na];
  });
}

// ---------------------------------------------------------------- run

const TONE = {
  far:  { contrast: 0.86, brightness: 6,   saturation: 0.68 },
  mid:  { contrast: 1.00, brightness: -6,  saturation: 0.86 },
  near: { contrast: 1.10, brightness: -2,  saturation: 0.84 },
};
const SOFT = { far: 3.2, mid: 1.6, near: 0.7 };

const only = process.argv[2];
const manifest = {};
for (const [loc, rec] of Object.entries(LOC)) {
  if (only && only !== loc) continue;
  manifest[loc] = { bands: [] };
  for (const band of ['sky', 'far', 'mid', 'near', 'fg']) {
    let img = rec[band].call(rec);
    if (band === 'near') img = grade(img, { tint: [0.58, 0.63, 0.70], saturation: 0.82, contrast: 1.06 });
    // Value separation between the depths is what actually reads as three bands: the far
    // band is light and flat, the near band is dark and contrasty. Then edge softness by
    // depth (defect #10) — razor cut-outs at every distance flatten the stack on their own,
    // independently of the fog. Only the foreground occluder stays crisp.
    if (TONE[band]) img = grade(img, TONE[band]);
    if (SOFT[band]) img = soften(img, SOFT[band], 1);
    // The renderer works pseudo-linear (colour squared on sample) and multiplies by a
    // tinted ambient, so saturated backdrop colour compounds twice and goes nuclear.
    // Ship the bands a notch flatter and let the engine's lighting do the colouring.
    if (band !== 'fg') img = grade(img, { saturation: 0.86 });
    const skirted = addSkirt(img, band, rec.deep || [16, 20, 24], band === 'fg');
    img = skirted.img;
    // the sky is fully opaque and almost all gradient: JPEG is a third the size of a
    // dithered palette PNG and looks better doing it
    let file = `${loc}_${band}.png`, bytes;
    if (band === 'sky') {
      const tmp = path.join(OUT, `_${loc}_sky.tmp.png`);
      writePNG(tmp, img);
      file = `${loc}_sky.jpg`;
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '74',
                            tmp, '--out', path.join(OUT, file)], { stdio: 'ignore' });
      fs.unlinkSync(tmp);
      bytes = fs.statSync(path.join(OUT, file)).size;
    } else {
      bytes = writeSmallest(path.join(OUT, file), img, 255);
    }
    manifest[loc].bands.push({
      id: `${loc}_${band}`, image: `bg/${file}`, w: img.w, h: img.h,
      tile: true, ...BANDS[band], worldH: Math.round(skirted.worldH), bytes,
    });
    console.log(`${file}  ${img.w}x${img.h}  ${(bytes / 1024).toFixed(0)}KB`);
  }
}
fs.writeFileSync(path.join(ROOT, 'work', 'bg_manifest.json'), JSON.stringify(manifest, null, 1));
const total = Object.values(manifest).flatMap(m => m.bands).reduce((s, b) => s + b.bytes, 0);
console.log(`bg total ${(total / 1048576).toFixed(2)} MB`);
