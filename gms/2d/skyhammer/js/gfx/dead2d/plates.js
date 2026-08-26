// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// The one door every BACKGROUND layer goes through for its pixels.
//
// Today every plate is baked procedurally at boot. Tomorrow a generated bitmap (Flux) can be
// injected with `setPlateSource(key, imgOrCanvas)` and the layer code does not change. The
// procedural baker is the PERMANENT fallback, not scaffolding: if a source is missing, still
// loading, the wrong size, or throws, `getPlate` silently returns the baked plate instead.
//
// Contract per key is documented in docs/ART_NOTES.md — dimensions, horizontal tiling
// requirement, parallax factor and tinting. Foreground art (props, aircraft, FX) is NOT a plate:
// it needs real alpha edges and per-piece damage states, so it stays polygonal.

import { makeCanvas, ctx2d } from './bake.js';

export const PLATE_SPECS = Object.freeze({
  sky:       { w: 4,    h: 1400, tileX: false, tileY: false, parallax: 0.00, tint: 'baked-per-palette', stretch: 'full-viewport' },
  stars:     { w: 512,  h: 512,  tileX: true,  tileY: true,  parallax: 0.03, tint: 'alpha-scaled' },
  sun:       { w: 256,  h: 256,  tileX: false, tileY: false, parallax: 0.08, tint: 'additive' },
  cloud:     { w: 384,  h: 132,  tileX: false, tileY: false, parallax: '0.06 / 0.18 / 0.55', tint: 'baked-per-palette', indexed: 16 },
  mountains: { w: 1600, h: 400,  tileX: true,  tileY: false, parallax: 0.14, tint: 'baked-per-palette' },
  hills:     { w: 1600, h: 260,  tileX: true,  tileY: false, parallax: 0.35, tint: 'baked-per-palette' },
  water:     { w: 512,  h: 512,  tileX: true,  tileY: true,  parallax: 1.00, tint: 'multiply-over-gradient' },
  earthtex:  { w: 128,  h: 128,  tileX: true,  tileY: true,  parallax: 1.00, tint: 'baked-per-palette' },
});

const bakers = new Map();     // key -> (pal, palKey, variant, index) => canvas
const sources = new Map();    // key -> HTMLImageElement | canvas  (or a Map for indexed keys)
const cache = new Map();
let missLog = new Set();

export function registerBaker(key, fn) { bakers.set(key, fn); }

/** Inject a generated plate. `index` for indexed keys such as `cloud`. */
export function setPlateSource(key, src, index = 0, variant = '*') {
  sources.set(`${key}|${index}|${variant}`, src);
  for (const k of [...cache.keys()]) if (k.startsWith(key + '|')) cache.delete(k);
}

export function clearPlateSources() { sources.clear(); cache.clear(); }

function usable(src, spec) {
  if (!src) return null;
  if (src.complete === false) return null;                 // <img> still loading
  const w = src.naturalWidth ?? src.width, h = src.naturalHeight ?? src.height;
  if (!w || !h) return null;
  if (spec && (w !== spec.w || h !== spec.h)) {
    const c = makeCanvas(spec.w, spec.h);
    try { ctx2d(c).drawImage(src, 0, 0, spec.w, spec.h); } catch { return null; }
    return c;
  }
  return src;
}

/**
 * @param key      one of PLATE_SPECS
 * @param pal      palette object
 * @param palKey   palette key, part of the cache identity
 * @param variant  extra cache discriminator (biome, weather, ...)
 * @param index    for indexed keys (cloud sprites)
 */
export function getPlate(key, pal, palKey, variant = '', index = 0) {
  const ck = `${key}|${index}|${palKey}|${variant}`;
  const hit = cache.get(ck);
  if (hit) return hit;

  const spec = PLATE_SPECS[key];
  const src = sources.get(`${key}|${index}|${palKey}`) || sources.get(`${key}|${index}|*`);
  const ok = usable(src, spec);
  if (ok) { cache.set(ck, ok); return ok; }

  const bake = bakers.get(key);
  if (!bake) {
    if (!missLog.has(key)) { missLog.add(key); console.warn('[plates] no baker for', key); }
    const c = makeCanvas(spec ? spec.w : 8, spec ? spec.h : 8);
    cache.set(ck, c);
    return c;
  }
  let c;
  try { c = bake(pal, palKey, variant, index); }
  catch (e) {
    console.warn('[plates] baker threw for', key, e.message);
    c = makeCanvas(spec ? spec.w : 8, spec ? spec.h : 8);
  }
  cache.set(ck, c);
  return c;
}

export function plateCacheSize() { return cache.size; }
