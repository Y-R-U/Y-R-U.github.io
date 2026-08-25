/**
 * The aeroplane — the shipped part tree.
 *
 * The 16-part scout `tools/pages/parts.html` has been driving since P1 lived in
 * that page and in a JSON dump beside it, so nothing in `js/` could draw an
 * aeroplane. This is that rig, promoted to shipped code and parameterised by
 * palette so the eight hostile types read apart at 66 wu without a second tree
 * (ART §5: the actors are CODE, which is the whole of D5 — a painted sprite has
 * its light baked in and cannot take the moving light the crate above it does).
 *
 * The def is a literal here rather than a `fetch` of `rigdef.json`: a rig that
 * has to be loaded is a rig the title screen has to wait for, and D6's rule
 * about anything that can silently fail to arrive applies to a same-origin JSON
 * exactly as it does to a CDN.
 *
 * Units are the rig's own; `NOSE_TO_TAIL` is how many of them the aeroplane is,
 * so a caller scales by `hullWu / NOSE_TO_TAIL` and gets R-10's drawn hull.
 */

import { createRig } from '../parts.js';

/** The def is ~66 units nose to tail — the same number `hud.html` uses. */
export const NOSE_TO_TAIL = 66;

const FAB = [0.74, 0.68, 0.55];        // doped linen
const METAL = [0.46, 0.49, 0.53];
const WOOD = [0.52, 0.38, 0.23];
const SKIN = [0.78, 0.58, 0.44];

const mul = (c, k) => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];

/**
 * ART §3.4's silhouette floor is a SIZE rule, not a colour one, so the types are
 * told apart by value and hue at the wing rather than by shape here. `fab` is
 * the multiplier applied to the doped-linen colour; everything else follows so a
 * scheme is one triple rather than five.
 */
export const SCHEME = Object.freeze({
  player:  [1.00, 1.00, 1.00],
  kestrel: [0.86, 0.82, 0.72],
  wasp:    [1.06, 0.92, 0.52],
  shrike:  [0.72, 0.74, 0.82],
  drover:  [0.80, 0.72, 0.60],
  ox:      [0.68, 0.70, 0.66],
  marlin:  [0.62, 0.66, 0.72],
  nightjar:[0.50, 0.52, 0.60],
  anvil:   [0.58, 0.56, 0.54],
  wreck:   [0.42, 0.40, 0.38],
});

function def(tint) {
  const fab = mul(FAB, tint), metal = mul(METAL, tint), wood = mul(WOOD, tint);
  return {
    jitterRel: 0.05,
    edge: 1.15,
    edgeDark: 0.44,
    maxEdges: 2,
    tones: { lit: 1.24, mid: 0.94, shadow: 0.46 },
    terminator: { hi: 0.26, lo: -0.16 },
    parts: [
      { id: 'wing_lower_far', side: 'far', z: 1, x: -1, y: 10, color: fab, normal: [0.08, 0.99],
        poly: [-24, -3.4, 24, -4.4, 25, 2.4, -25, 3.4] },
      { id: 'wing_upper_far', side: 'far', z: 2, x: 2, y: -15, color: fab, normal: [0.05, 0.99],
        poly: [-27, -3.6, 26, -4.6, 27, 2.2, -28, 3.2] },
      { id: 'strut_far', side: 'far', z: 4, x: 10, y: -3, color: wood, normal: [0.30, -0.95],
        poly: [-1.4, -12, 1.6, -12, 2.2, 12, -0.9, 12] },
      { id: 'fin', z: 5, x: -29, y: -2, color: fab, normal: [-0.86, -0.51],
        poly: [-3.0, -12, 4.5, -7.0, 6.0, 1.0, -3.4, 1.6] },
      { id: 'fuselage', z: 6, x: 0, y: 0, color: fab, normal: [0.06, -1],
        poly: [26, -7.2, 33, -1.4, 31, 4.0, 2, 7.4, -22, 5.4, -33, 2.0, -30, -2.4, 5, -7.8] },
      { id: 'engine_cowl', parent: 'fuselage', z: 7, x: 29, y: -1.6, color: metal, normal: [0.80, -0.60],
        poly: [-5, -6.0, 5, -4.6, 5.5, 4.0, -5, 5.2] },
      { id: 'prop_disc', parent: 'engine_cowl', z: 8, x: 6.0, y: 0, color: [0.36, 0.34, 0.31],
        normal: [0.94, -0.34], alpha: 0.22, edge: 0, jitterRel: 0.01,
        poly: [-1.2, -21, 1.4, -19, 2.0, 0, 1.4, 19, -1.2, 21, -1.8, 0] },
      { id: 'coaming', parent: 'fuselage', z: 9, x: -4, y: -6.4, color: wood, normal: [-0.08, -1],
        poly: [-7, -2.6, 8, -1.8, 8, 1.8, -7, 2.2] },
      { id: 'pilot_head', parent: 'coaming', z: 10, x: -1.5, y: -5.0, color: SKIN, normal: [-0.36, -0.93],
        poly: [-3.2, -4.0, 3.4, -3.4, 3.2, 2.6, -3.4, 2.4] },
      { id: 'tail_near', z: 11, x: -26, y: 1.0, color: fab, normal: [-0.10, -0.99],
        poly: [-7, -2.8, 11, -3.8, 11, 1.4, -7, 2.4] },
      { id: 'rudder', parent: 'fin', z: 12, x: -2.5, y: -6, color: fab, normal: [-0.90, -0.44],
        poly: [-4.2, -6.0, 1.4, -5.0, 1.6, 6.5, -4.6, 5.0] },
      { id: 'strut_near', z: 13, x: 10, y: -4, color: wood, normal: [0.26, -0.97],
        poly: [-1.6, -12.5, 1.8, -12.5, 2.4, 12.5, -1.1, 12.5] },
      { id: 'wing_lower_near', z: 14, x: -1, y: 11, color: fab, normal: [0.08, -0.99],
        poly: [-24, -3.6, 24, -4.6, 25, 2.2, -25, 3.2] },
      { id: 'wing_upper_near', z: 15, x: 2, y: -17, color: fab, normal: [0.04, -1],
        poly: [-27, -3.8, 26, -4.8, 27, 2.0, -28, 3.0] },
    ],
    poses: { bank: { wing_upper_near: 0.10, wing_lower_near: -0.10, rudder: 0.25 } },
  };
}

const cache = new Map();

/**
 * One rig per scheme, cached. A rig is stateless between draws except for its
 * pose, so sharing one across every `wasp` in the sky costs one tree instead of
 * twelve — and `createRig` does real work (per-vertex jitter, edge normals) that
 * has no business happening on a spawn.
 */
export function planeRig(scheme = 'player') {
  const key = SCHEME[scheme] ? scheme : 'player';
  let r = cache.get(key);
  if (!r) { r = createRig(def(SCHEME[key])); cache.set(key, r); }
  return r;
}

/** Reset the cache. Only a harness that reloads palettes needs this. */
export function clearPlaneRigs() { cache.clear(); }

export default planeRig;
