/**
 * The sky column: the altitude ramp, the sun and its glare, `fx.setRays`, the tiling
 * strip layers, and the per-band haze/ramp crossfade.
 *
 * Two things about this module are load-bearing and easy to get wrong.
 *
 * 1. **The sky ramp is drawn once, spanning the whole 10,000 wu column, through
 *    `R.skyRamp`.** It is NOT re-evaluated per frame from the camera. `R.skyRamp` puts the
 *    LUT's u coordinate on a vertex attribute rotated onto world -Y, so the fragment shader
 *    samples it from its OWN world Y and the result is zoom-proof (P1_NOTES §4, R4:
 *    0/255 delta across the zoom range). A per-frame gradient from camera Y flattens the
 *    sky the moment the camera pulls out, and ART.md §4 calls it the most likely zoom bug
 *    in the renderer.
 *
 * 2. **Nothing in this game changes at a line.** Every band boundary is a crossfade, and
 *    gate A7 puts a number on it: crossing a boundary at best climb rate must take
 *    1.0-3.0 s. That is not a free parameter — `BAND_FEATHER_WU` is derived from it and
 *    the derivation is in the constant's comment.
 *
 * Ramp LUTs are ordinary sRGB 256x1 strips; the renderer squares them into linear (D49).
 */

import { LAYER } from './renderer.js';
import { BANDS, CEILING_WU, GROUND_WU, bandAt } from '../core/bands.js';

/**
 * Gate A7. Best climb rate is 13.5 m/s (R-01's envelope, which may not move), i.e.
 * 13.5 / 0.15 = 90 wu/s.
 *
 * BAND_FEATHER_WU is a HALF-width: the boundary is approached from below over one feather
 * and left from above over another, so a full crossfade spans 2x it. The admissible window
 * 1.0-3.0 s is therefore a total span of 90-270 wu, i.e. a half-width of 45-135. 90 sits at
 * 2.0 s, dead centre, which leaves the whole tolerance in hand for the +-1.0 m/s the climb
 * rate itself is allowed to move at P4.
 *
 * Getting this wrong once is what the first measurement caught: at 180 the full span was
 * 4.0 s, outside the window, while a broken metric was reporting 0.00 s and hiding it.
 *
 * Sanity: 180 wu total is 27 m, and the thinnest band (Mud) is 700 wu, so no two crossfades
 * can ever overlap.
 */
export { BEST_CLIMB_WU_S } from '../core/bands.js';
export const BAND_FEATHER_WU = 90;

// Overridable ONLY so a deliberately broken control can exist: setting it near zero makes
// every band change at a line, which is what gate A7 is written to forbid. No shipped build
// ever calls this. P4/P16 may also want it as a tuning knob, but the number above is derived
// from A7's window and should not be moved without redoing that arithmetic.
let FEATHER = BAND_FEATHER_WU;
export const setBandFeather = v => { FEATHER = Math.max(0.5, v); };
export const getBandFeather = () => FEATHER;

const SUN_PX = 0.02, SUN_PY = 0.04;

/**
 * FG_OCCLUDE's layer multiply. Exported because gate A6 measures the shipped atlas THROUGH
 * it, and a second copy of this number in verify.js silently drifted once already: sky.js
 * moved to 0.20 while the gate went on measuring 0.55, so A6 was reporting a frame that is
 * not the one the game draws. It happened to be conservative, which is exactly why nothing
 * caught it. verify.js now reads this line out of this file and fails loudly if it cannot.
 */
export const FG_OCCLUDE_MUL = [0.20, 0.22, 0.28];

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = t => t * t * (3 - 2 * t);
const srgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/**
 * ART.md §4's per-layer haze DEPTH weight. This is the thing that makes the layers separate
 * by colour temperature rather than by fog density alone, and the first build computed the
 * haze term every frame and then never applied it -- the renderer kept A's flat per-layer
 * constants (CLOUD_MID 0.38 against the 0.18 the formula asks for at 540 m), so every cloud
 * sat behind twice the atmosphere it should have and the frame read as one wash.
 */
const HAZE_DEPTH = {
  [LAYER.SKY]: 0.06, [LAYER.CLOUD_FAR]: 1.00, [LAYER.HORIZON]: 0.95,
  [LAYER.GROUND_FAR]: 0.80, [LAYER.GROUND_MID]: 0.55, [LAYER.CLOUD_MID]: 0.30,
  [LAYER.GROUND]: 0.18, [LAYER.ACTORS_BACK]: 0.06, [LAYER.ACTORS]: 0.06,
  [LAYER.CLOUD_NEAR]: 0.10, [LAYER.FG_OCCLUDE]: 0.00,
};

/**
 * Per-band haze weight and cloud population, keyed on D19's frozen names. This is ART.md
 * §3's six-band table restated on R-02's edges: warm/dirty/hazy at the bottom, cold/clean/
 * empty at the top, with Deck as the bright crown in the middle.
 */
export const BAND_STYLE = {
  mud: { haze: 1.00, sat: 0.55, cloudMid: 0.05, cloudNear: 0.30, fg: 0.70 },
  belt: { haze: 0.78, sat: 0.70, cloudMid: 0.25, cloudNear: 0.55, fg: 0.40 },
  floor: { haze: 0.48, sat: 0.85, cloudMid: 0.55, cloudNear: 0.70, fg: 0.20 },
  deck: { haze: 0.42, sat: 1.00, cloudMid: 1.00, cloudNear: 1.00, fg: 0.06 },
  lane: { haze: 0.20, sat: 1.00, cloudMid: 0.45, cloudNear: 0.35, fg: 0.00 },
  blue: { haze: 0.08, sat: 0.75, cloudMid: 0.10, cloudNear: 0.10, fg: 0.00 },
};

/**
 * The band term, feathered. Returns the blend of the band styles either side of the nearest
 * boundary, plus the diagnostics gate A7 measures. Everything downstream reads this, so
 * there is exactly one place where a boundary is softened and no caller can accidentally
 * step at a line.
 */
export function bandBlend(y) {
  const b = bandAt(y);
  const i = BANDS.indexOf(b);
  let other = null, t = 0;
  // distance to whichever boundary is nearer, in wu (y is negative upward)
  const dTop = Math.abs(y - b.y1), dBot = Math.abs(y - b.y0);
  if (dTop < FEATHER && i < BANDS.length - 1) { other = BANDS[i + 1]; t = 0.5 * (1 - dTop / FEATHER); }
  else if (dBot < FEATHER && i > 0) { other = BANDS[i - 1]; t = 0.5 * (1 - dBot / FEATHER); }
  const s = BAND_STYLE[b.id];
  if (!other) return { band: b.id, mix: null, t: 0, ...s };
  const o = BAND_STYLE[other.id], k = smooth(t);
  const out = { band: b.id, mix: other.id, t: k };
  for (const key of Object.keys(s)) out[key] = s[key] + (o[key] - s[key]) * k;
  return out;
}

/* ------------------------------------------------------------------- LUT loading */

/**
 * ramps.png is one image, 256 wide, two rows per (act, sky-state) — a sky row and a tone
 * row. It is sliced here into 256x1 textures rather than shipped as 32 separate files:
 * 32 requests for 200 bytes each is worse than one request for 4 KB, and the row layout
 * keeps every LUT in the same file as its index.
 */
export async function loadRamps(R, base = 'assets/') {
  const meta = await fetch(base + 'sky/ramps.json').then(r => r.json());
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej;
    im.src = base + 'sky/ramps.png';
  });
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  const rowTex = y => {
    const row = new Uint8Array(256 * 4);
    row.set(px.subarray(y * img.width * 4, y * img.width * 4 + 256 * 4));
    return R.createTexture(row, { width: 256, height: 1, smooth: true, name: 'ramp' + y });
  };
  const luts = {};
  for (const [k, v] of Object.entries(meta.luts))
    luts[k] = { ...v, sky: rowTex(v.skyRow), tone: rowTex(v.toneRow) };
  return { meta, luts };
}

/* ------------------------------------------------------------------- the module */

/**
 * `strips` is the manifest's strips block plus loaded textures:
 *   { s2_gm_a: {tex, worldW, h, layer, act, variant}, ... }
 * Strips alternate A and B. **Never mirror** — `R.backdrop`'s `mirror` flag exists and is
 * banned here: a mirror axis in a 1500 px-tall viewport is instantly visible and gate A4
 * counts it as a repeat. Alternating two distinct variants gives an 8192 wu period with no
 * symmetry anywhere in it.
 */
export function createSky(R, assets) {
  // The sun disc and its bloom are procedural. ATLAS_SKY §7 measured that this model cannot
  // paint a smooth radial falloff: asked for a soft bloom it paints a disc-shaped OBJECT
  // with a visible brush ring, the same failure mode as a single FX mark generated alone.
  // A blob and a disc from texture.js cost nothing and are correct at every zoom.
  const bloomTex = R.blob, discTex = R.disc;
  let lutKey = '2d';
  let lut = null;
  let sunAngle = -1.15;          // radians, measured from +x, y down: up-left by default
  let sunDist = 430;   // world units from frame centre, not a distance to a star
  const state = { haze: [0, 0, 0], hazeAmt: 0, band: 'deck', ramp: null, sun: { x: 0, y: 0, r: 1, g: 1, b: 1 } };

  /** Ground anchor for each strip layer, in wu. HORIZON sits highest, GROUND_MID lowest. */
  const STRIP_Y = { HORIZON: -150, GROUND_FAR: -90, GROUND_MID: 0 };
  const STRIP_H = { HORIZON: 420, GROUND_FAR: 520, GROUND_MID: 760 };

  /**
   * R-05: ARCHITECTURE §2.4's parallax/parallaxY table is agent A's STARTING set and the art
   * agent may retune within it, with ART.md §4's px/py as the target. Retuned here, and the
   * one that mattered was measured rather than argued: A's HORIZON parallaxY is **0.14**,
   * which glues the horizon to the camera and puts a ridge line across the middle of the
   * frame at 540 m. ART.md §4 states the rule A's table breaks -- "py must be ~1.0 for
   * anything that has a real altitude" -- and a horizon ridge has one.
   *
   *   layer        A's px/py      ART.md §4      shipped
   *   CLOUD_FAR    0.06 / 0.30    0.06 / 0.55    0.06 / 0.55   cirrus is far above the ceiling
   *   CLOUD_MID    0.22 / 0.78    0.55 / 1.00    0.55 / 1.00   the deck has a real altitude
   *   HORIZON      0.10 / 0.14    0.10 / 0.85    0.10 / 0.85   the one that was visibly wrong
   *   GROUND_FAR   0.26 / 0.55    0.18 / 0.95    0.18 / 0.95
   *   GROUND_MID   0.58 / 0.82    0.35 / 1.00    0.35 / 1.00
   *   CLOUD_NEAR   1.35 / 1.15    1.35 / 1.00    1.35 / 1.00
   *   FG_OCCLUDE   1.55 / 1.25    1.70 / 1.00    1.70 / 1.00
   *
   * And SKY's haze. P1 shipped SKY at haze 0.70 and flagged it: a skyRamp drawn on SKY is
   * 70% washed toward the haze colour before it reaches the light buffer, which is why the
   * first frame captured here was one flat pale wash with no act colour in it at all. The
   * gradient IS the atmosphere; it must not also be fogged by it.
   */
  function applyLayerTable() {
    // SKY's parallaxY must be 1.00, and this one is not a taste call -- it is a correctness
    // condition that a screenshot made obvious and arithmetic confirms.
    //
    // ART.md §4 lists SKY_GRAD at px 0.00 / py 0.00 because it imagines a screen-locked
    // full-screen quad. P1 did not build that: R.skyRamp draws ONE quad spanning the whole
    // 10,000 wu column IN WORLD SPACE, with the LUT's u on a vertex attribute rotated onto
    // world -Y (P1_NOTES change 8). A world-space quad at py 0.06 barely moves with the
    // camera, so at 540 m its centre sits 4,784 wu off the top of the frame: the bottom
    // third of the screen was uncovered black and the covered part sampled a thin slice of
    // the LUT, which is what the "flat pale wash with no act colour" actually was.
    //
    // At py 1.00 the quad is pinned to world altitude, which is the only thing that makes
    // "the ramp is evaluated per fragment from that fragment's own world Y" true.
    R.setLayerParallax(LAYER.SKY, 0.00, 1.00);
    R.setLayer(LAYER.SKY, { haze: 0.06, shade: 0.02, grainAmt: 0.55 });
    // **The painted layers are SELF-LIT.** That is the whole of D5: a painted sprite has its
    // light baked in and can only be tinted, which is exactly why the world is painted and
    // the actors are code. A's `shade` values were written for a scene with dynamic lights
    // in it, and the sky scene has none -- `illum = ambient + L*response` with L = 0 and
    // ambient [0.20,0.24,0.34] multiplied CLOUD_MID by mix(1, 0.24, 0.58) = 0.56 in linear,
    // i.e. 0.75 in display, on top of everything else. Measured: dropping shade alone moved
    // the frame's p99 from 0.676 to 0.778.
    //
    // A small residual shade is kept so the act's ambient still touches the painted world --
    // that is how a night act darkens its clouds without a muddy palette -- but it is a
    // tint, not a lighting model.
    R.setLayer(LAYER.CLOUD_FAR, { shade: 0.12, grainAmt: 0.40 });
    R.setLayer(LAYER.CLOUD_MID, { shade: 0.14, grainAmt: 0.45 });
    R.setLayer(LAYER.CLOUD_NEAR, { shade: 0.12, grainAmt: 0.40 });
    R.setLayer(LAYER.HORIZON, { shade: 0.16, grainAmt: 0.35 });
    R.setLayer(LAYER.GROUND_FAR, { shade: 0.18, grainAmt: 0.40 });
    R.setLayer(LAYER.GROUND_MID, { shade: 0.22, grainAmt: 0.45 });
    // FG_OCCLUDE was being held near-black by the OLD ambient: shade 1.00 against
    // [0.20,0.24,0.34] multiplied it by 0.24. Raising the ambient to a daylight value
    // removed that for free and the Act 1 near-occluders came back as pale grey-blue. Its
    // darkness has to be its own property, not a side effect of the scene having no lights
    // in it -- so the shade comes off and the layer multiply does the work.
    // Darker still. Raising the ambient took away the accidental darkening FG_OCCLUDE had
    // been relying on, and the Act 1 frame came back with "everything crushed UPWARD into a
    // narrow pale grey-beige midtone band, no deep shadow anywhere to anchor the range" --
    // the exact inverse of the defect this pass set out to fix, and worth stating as such
    // rather than quietly rebalancing. P3's near layer is the frame's darkest note and has
    // to be dark enough to be one.
    R.setLayer(LAYER.FG_OCCLUDE, { shade: 0.10, grainAmt: 0.30, mul: FG_OCCLUDE_MUL });
    R.setLayerParallax(LAYER.CLOUD_FAR, 0.06, 0.55);
    R.setLayerParallax(LAYER.CLOUD_MID, 0.55, 1.00);
    R.setLayerParallax(LAYER.HORIZON, 0.10, 0.85);
    R.setLayerParallax(LAYER.GROUND_FAR, 0.18, 0.95);
    R.setLayerParallax(LAYER.GROUND_MID, 0.35, 1.00);
    R.setLayerParallax(LAYER.CLOUD_NEAR, 1.35, 1.00);
    R.setLayerParallax(LAYER.FG_OCCLUDE, 1.70, 1.00);
  }
  applyLayerTable();

  function setAct(act, skyState) {
    const k = `${act}${skyState}`;
    lutKey = assets.luts[k] ? k : `${act}d`;
    lut = assets.luts[lutKey] || Object.values(assets.luts)[0];
    R.setRamp(lut.tone);
    // Opt the shared painted layers into the gradient map. rampAmt starts at 0 on every
    // layer (P1_NOTES §2 change 6) precisely so this is an explicit art decision.
    //
    // FG_OCCLUDE is deliberately NOT ramped, and the reason is gate A6. Its 90th-percentile
    // luminance must stay below 0.12; run it through the act 's' (storm) LUT, whose shadow
    // end is #5A76A0 at luminance 0.19, and the layer would fail the gate outright while
    // every other act passed. A near-black silhouette wants a multiply, not a remap.
    R.setLayer(LAYER.CLOUD_FAR, { rampAmt: 0.92 });
    R.setLayer(LAYER.CLOUD_MID, { rampAmt: 0.88 });
    R.setLayer(LAYER.CLOUD_NEAR, { rampAmt: 0.80 });
    R.setLayer(LAYER.GROUND, { rampAmt: 0.55 });     // TERRAIN props, per D53
    R.setLayer(LAYER.FG_OCCLUDE, { rampAmt: 0 });
    const h = srgb(lut.haze);
    R.setHaze(h[0], h[1], h[2]);
    // The renderer's default grade is tuned for a dark game: bloom 0.85 over threshold 0.72
    // turns a cream gouache sky into white paper. A painted sky wants very little bloom and
    // no extra contrast; what carries the image is the ramp, not the post.
    R.fx.bloom = lut.act === 4 ? 0.42 : 0.16;
    R.fx.threshold = 0.86;
    R.fx.exposure = 0.98;
    // **Contrast must be 1.0 here, and this is the second independent cause of the crushed
    // cores.** post.js applies `col = (col - 0.5) * u_contrast + 0.5` in LINEAR space, after
    // the tonemap. At 1.02 everything below linear 0.0098 -- i.e. below 0.099 DISPLAY
    // luminance -- goes negative and clamps to pure black. Measured on act 4: the sky LUT
    // texel is [24,33,51] and the framebuffer read [0,0,35], with red and green crushed to
    // zero while blue survived, which is the signature of a per-channel clamp rather than a
    // darkening. The whole night act and the shadow side of every cloud were below that line.
    // The LUTs carry the act's contrast; the grade must not add any.
    R.fx.contrast = 1.0;
    R.fx.saturation = lut.sat;
    // Paper grain has to come down on a dark act. At a fixed amplitude it is invisible on a
    // cream sky and reads as sensor noise on a near-black one -- two blind critics named
    // "visible sensor-style noise across the flat dark field" on the Act 4 frame. Scaling on
    // the act's own gamma is the cheapest correct dial: the acts that crush are the acts
    // whose grain shows.
    R.fx.grain = 0.030 / Math.max(1, lut.gamma || 1);
    R.setLayer(LAYER.SKY, { grainAmt: 0.55 / Math.max(1, lut.gamma || 1) });
    R.fx.vignetteAmt = 0.34;
    // The ambient is the scene's light level with no lights in it, so it is a property of
    // the ACT, not a constant. A daylit painted world sits near 1.0 tinted by its key; act 4
    // at night sits far below. Deriving it from the act's own gamma keeps the two in step,
    // and it is also what will make a code-drawn aeroplane at shade 1.0 read correctly when
    // P4/P5 add it -- with A's fixed [0.20,0.24,0.34] a daylight aircraft would be black.
    const kc = srgb(lut.key), amb = Math.min(1, Math.max(0.18, 1.05 / Math.pow(lut.gamma || 1, 2.2)));
    R.setAmbient(amb * (0.72 + 0.28 * kc[0]), amb * (0.72 + 0.28 * kc[1]), amb * (0.72 + 0.28 * kc[2]));
    R.fx.gLoadRebase();
    state.hazeBase = lut.hazeBase;
    state.sat = lut.sat;
    return lutKey;
  }

  function setSun(angle, dist) { sunAngle = angle; if (dist !== undefined) sunDist = dist; }

  /**
   * Per-frame update. `y` is the camera's world Y.
   * ART.md §4: haze rises 12% on zoom-out, because when objects get smaller they stop
   * separating by size and have to separate by value instead.
   */
  function update(camX, camY, zoom, dt) {
    const b = bandBlend(camY);
    state.band = b.band; state.mix = b.mix; state.t = b.t;
    // ART.md §4: hazeAmount(alt, depth) = clamp(depth * actHazeBase * (1 - 0.8*alt)), with
    // alt normalised on D28's 1,500 m ceiling (R-03), times the band's own weight, times the
    // zoom-out lift -- at 0.78x everything is smaller and stops separating by size, so let
    // it separate by value instead. Capped at 1.12 as §4 specifies.
    const zoomHaze = Math.min(1.12, Math.max(1.0, 1 + 0.12 * (1 - zoom)));
    // `b.haze` was being multiplied in on TOP of (1 - 0.8*alt), and the two are the same
    // quantity expressed twice -- the band table's haze column IS the altitude term. The
    // double count fogged the Act 1 ground strip at 0.61 and bleached the whole act. §4's
    // formula is used as written and the band table now only trims it.
    const alt = Math.min(1, Math.max(0, -camY / 10000));
    const base = (state.hazeBase || 1) * (1 - 0.8 * alt) * (0.55 + 0.45 * b.haze) * zoomHaze;
    state.hazeAmt = base;
    for (const [layer, depth] of Object.entries(HAZE_DEPTH))
      R.setLayer(+layer, { haze: Math.min(0.95, depth * base) });
    // A body at effective infinity must sit at a FIXED screen position, so its world
    // position has to track the camera's own parallax offset. Written as `camX + ...` the
    // sun's screen x is camX*(1 - SUN_PX) + offset, i.e. it slides out of frame the moment
    // you fly anywhere -- which is what the first night frame showed: an empty sky with no
    // moon in it.
    state.sun.x = camX * SUN_PX + Math.cos(sunAngle) * sunDist;
    state.sun.y = camY * SUN_PY + Math.sin(sunAngle) * sunDist;
    const k = srgb(lut ? lut.key : '#ffffff');
    state.sun.r = k[0]; state.sun.g = k[1]; state.sun.b = k[2];
    return b;
  }

  /** Layer 0: the ramp itself, then the sun and its painted glare. */
  function drawSky() {
    if (!lut) return;
    R.skyRamp(GROUND_WU, CEILING_WU, lut.sky, LAYER.SKY, { a: 1 });
    // The sun disc and its bloom are code, not paint: ATLAS_SKY §7 measured that this model
    // cannot paint a smooth radial falloff -- asked for a soft bloom it paints a
    // disc-shaped OBJECT with a brush ring, the same failure as a single FX mark generated
    // alone. Three concentric additive quads beat any plate.
    const s = state.sun, night = lut.act === 4 || lut.sky === 'n';
    // A hazy act does not get a hard disc. Act I is "weak green-white daylight diffused
    // through cloud -- barely a key at all" (ART.md §6) and was drawing a bright white sun
    // that a blind critic called a sticker sitting on top of the image. Diffusion scales on
    // the act's own hazeBase, so the overcast and storm sky-states inherit it for free.
    const clear = Math.max(0.12, Math.min(1, 1.35 - (lut.hazeBase || 1)));
    // Glare radius measured, not guessed: at 7.5x a 150 wu disc the outer quad is 1,125 wu
    // across in a 462 wu frame, so the "sun" was a full-screen additive wash and the whole
    // sky read as blown paper. A glare that fills the frame is not a light source, it is an
    // exposure error.
    const disc = night ? 84 : 130, glare = disc * (night ? 2.4 : 3.4);
    for (let i = 3; i >= 1; i--) {
      const t = i / 3;
      R.sprite({
        tex: bloomTex, x: s.x, y: s.y, w: glare * t, h: glare * t, layer: LAYER.SKY, add: true,
        r: s.r, g: s.g, b: s.b, a: (0.13 * (1 - t) + 0.035) * (night ? 0.5 : 1) * (0.35 + 0.65 * clear),
        parallax: SUN_PX, parallaxY: SUN_PY,
      });
    }
    R.sprite({
      tex: clear > 0.55 ? discTex : bloomTex, x: s.x, y: s.y, w: disc * (clear > 0.55 ? 1 : 1.8), h: disc * (clear > 0.55 ? 1 : 1.8), layer: LAYER.SKY, add: true,
      r: s.r, g: s.g, b: s.b, a: 0.30 + 0.60 * clear, parallax: SUN_PX, parallaxY: SUN_PY,
    });
    // God rays are a screen-space post effect and want the sun in UV space. worldToUV knows
    // nothing about parallax, so the sun's world position has to be pre-shifted by its own
    // camera offset before it is projected -- otherwise the rays sit where a parallax-1.0
    // object would be and slide away from the disc as the camera moves.
    const cam = R.cam;
    const uv = R.worldToUV(s.x - cam.x * SUN_PX + cam.x, s.y - cam.y * SUN_PY + cam.y);
    R.fx.setRays(uv.x, uv.y, state.hazeAmt * (night ? 0.08 : 0.30));
  }

  /**
   * One tiling strip layer, drawn as alternating A/B copies.
   * `alpha` fades the whole layer out with altitude — a ground band has no business being
   * opaque at 1,200 m, and the fade is per-object from its own altitude so zoom never makes
   * anything pop (ART.md §4's zoom rules).
   */
  function drawStrip(key, camX, camY) {
    const A = assets.strips[key + '_a'], B = assets.strips[key + '_b'];
    if (!A || !A.tex) return 0;
    const layer = LAYER[A.layer];
    const cfg = R.getLayer(layer);
    const W = A.worldW || 4096;
    const H = STRIP_H[A.layer], anchor = STRIP_Y[A.layer];
    const fadeTop = -6000, fadeEnd = -8200;
    const a = clamp01((camY - fadeEnd) / (fadeTop - fadeEnd));
    if (a <= 0.004) return 0;
    const half = R.worldW * 0.5;
    const left = camX * cfg.parallax - half, right = camX * cfg.parallax + half;
    let n = 0;
    for (let i = Math.floor(left / W); i <= Math.floor(right / W); i++) {
      const tex = (((i % 2) + 2) % 2) === 0 ? A.tex : (B && B.tex ? B.tex : A.tex);
      R.sprite({
        tex, x: (i + 0.5) * W, y: anchor - H * 0.5, w: W, h: H, layer, a,
        parallax: cfg.parallax, parallaxY: cfg.parallaxY,
      });
      n++;
    }
    return n;
  }

  /** CLOUD_FAR cirrus: the same alternating construction, placed at an altitude. */
  function drawCirrus(camX, camY) {
    const A = assets.strips.cirrus_a, B = assets.strips.cirrus_b;
    if (!A || !A.tex) return 0;
    const cfg = R.getLayer(LAYER.CLOUD_FAR);
    const W = A.worldW || 8192, H = 1400, y = -9200;
    // cirrus is far above the ceiling, so it only really reads in the top two bands
    const a = clamp01((-camY - 3000) / 3000) * 0.85;
    if (a <= 0.004) return 0;
    const half = R.worldW * 0.5;
    const left = camX * cfg.parallax - half, right = camX * cfg.parallax + half;
    let n = 0;
    for (let i = Math.floor(left / W); i <= Math.floor(right / W); i++) {
      R.sprite({
        tex: (((i % 2) + 2) % 2) === 0 ? A.tex : (B && B.tex ? B.tex : A.tex),
        x: (i + 0.5) * W, y, w: W, h: H, layer: LAYER.CLOUD_FAR, a,
        parallax: cfg.parallax, parallaxY: cfg.parallaxY,
      });
      n++;
    }
    return n;
  }

  function drawGround(camX, camY, act) {
    let n = 0;
    n += drawCirrus(camX, camY);
    for (const l of ['hor', 'gf', 'gm']) n += drawStrip(`s${act}_${l}`, camX, camY);
    return n;
  }

  return {
    setAct, setSun, update, drawSky, drawGround, drawStrip, drawCirrus, bandBlend,
    hazeRGB: () => srgb(lut ? lut.haze : '#808080'),
    get state() { return state; },
    get lutKey() { return lutKey; },
    get lut() { return lut; },
    get sun() { return state.sun; },
  };
}
