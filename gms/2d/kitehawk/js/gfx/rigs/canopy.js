/**
 * The parachute canopy — ART.md §5: "the signature mechanic must be the
 * best-drawn object in the game".
 *
 * TWELVE segments of a hemisphere-in-profile, drawn as a part tree through
 * `R.drawRig`, plus eight shroud lines with a catenary sag. Each segment
 * declares its own screen-space normal, so a canopy has a lit crown and a
 * shadowed skirt for free and every moving light in the scene falls on it —
 * which is the whole of D5 and the reason silk is code and not paint.
 *
 * On the BUILD_PLAN's "6-segment strip of rotated sprite quads sampling a canopy
 * atlas": that is not what shipped and there are no seams to report, because
 * there are no quads. `R.drawRig` emits per-vertex-coloured triangles onto the
 * existing stream (P1_NOTES), so twelve segments cost twelve fans and one draw
 * call rather than twelve texture quads with twelve edges to line up. D49
 * already deferred `R.mesh` on the strength of "the 6-segment canopy works";
 * this is the same conclusion reached with twelve, and ART.md §5 asked for
 * twelve. Nothing in `js/gfx/parts.js` or the renderer is touched.
 *
 * Units are world units: the canopy is 84 wu across (ARCHITECTURE §3.4's 12.6 m)
 * and the shrouds run 40 wu (§4.2's 6 m) down to the crate.
 */

import { createRig } from '../parts.js';

const SEGMENTS = 12;
const SPAN = 84;          // wu — ARCHITECTURE §3.4
const RISE = 30;          // wu — profile height of the dome
const SKIRT = 6;          // wu — how far the hem hangs below the rim
const LINES = 8;
const DROP = 40;          // wu — §4.2's L = 6 m of shroud

/** Silk in daylight: warm at the crown, cool and thin at the skirt. */
const CROWN = [0.92, 0.88, 0.78];
const HEM = [0.66, 0.63, 0.60];
const CORD = [0.40, 0.36, 0.31];

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * One wedge of the dome, from angle `a0` to `a1` measured from the left rim.
 * The outer edge follows the dome; the inner edge is the hem it hangs from.
 */
function segmentPoly(a0, a1) {
  const rx = SPAN * 0.5, ry = RISE;
  const x0 = -Math.cos(a0) * rx, y0 = -Math.sin(a0) * ry;
  const x1 = -Math.cos(a1) * rx, y1 = -Math.sin(a1) * ry;
  const hx0 = x0 * 0.995, hy0 = y0 * 0.60 + SKIRT;
  const hx1 = x1 * 0.995, hy1 = y1 * 0.60 + SKIRT;
  return [x0, y0, x1, y1, hx1, hy1, hx0, hy0];
}

export function makeCanopyRig() {
  const parts = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * Math.PI;
    const a1 = ((i + 1) / SEGMENTS) * Math.PI;
    const mid = (a0 + a1) * 0.5;
    // The segment faces out and up along the dome. This is the single line that
    // makes twelve flat wedges read as a curved, lit surface.
    // A hemisphere seen in profile: the outer gores face sideways, the crown
    // faces the sky. Twelve of these is what makes twelve flat wedges read as a
    // curved lit surface, and it is the entire reason silk is code (D5).
    const nx = -Math.cos(mid) * 1.15, ny = -Math.sin(mid) * 0.55 - 0.55;
    const nl = Math.hypot(nx, ny) || 1;
    // the crown is the brightest silk and the outer gores are seen edge-on
    const t = Math.abs(Math.cos(mid));
    parts.push({
      id: 'gore' + i, z: 10 + (i < SEGMENTS / 2 ? i : SEGMENTS - i),
      x: 0, y: 0, color: lerp3(CROWN, HEM, t * 0.7),
      normal: [nx / nl, ny / nl],
      poly: segmentPoly(a0, a1),
      jitterRel: 0.035,
      edge: i === 0 || i === SEGMENTS - 1 ? 1.2 : 0.5,
    });
  }

  /**
   * Shroud lines: eight cords with a catenary sag. TWO convex quads each, not
   * one six-sided wedge — `createRig` triangulates a part as a fan from vertex
   * 0, so a sagged outline is non-convex and fans into long spurious rays that
   * shoot right across the sky. Straight segments, convex, sag between them.
   */
  for (let i = 0; i < LINES; i++) {
    const t = (i + 0.5) / LINES;
    const a = t * Math.PI;
    const ax = -Math.cos(a) * SPAN * 0.5 * 0.99;
    const ay = -Math.sin(a) * RISE * 0.60 + SKIRT;
    const sag = 2.4 * Math.sin(Math.PI * t);
    const mx = ax * 0.5 + sag * 0.5, my = (ay + DROP) * 0.5 + sag;
    const seg = (id, x0, y0, x1, y1, z) => parts.push({
      id, z, x: 0, y: 0, color: CORD, normal: [0, -1], edge: 0, jitterRel: 0.006, alpha: 0.9,
      poly: [x0 - 0.55, y0, x0 + 0.55, y0, x1 + 0.55, y1, x1 - 0.55, y1],
    });
    // stop at the YOKE on top of the crate (11 wu of half-height), not at the
    // crate's centre — eight cords converging inside the box fan out below it
    const yoke = DROP - 12;
    seg('cord' + i, ax, ay, mx, my, 30 + i);
    seg('cordb' + i, mx, my, Math.sign(ax) * 1.6, yoke, 30 + i);
  }

  return createRig({
    jitterRel: 0.035,
    edge: 0.8,
    edgeDark: 0.50,
    maxEdges: 2,
    // Silk is thin: its shadow never goes as dark as doped linen, and its lit
    // side blows out. That value range is most of what says "fabric".
    tones: { lit: 1.34, mid: 1.0, shadow: 0.66 },
    terminator: { hi: 0.34, lo: -0.06 },
    parts,
    poses: collapsePoses(),
  });
}

/**
 * ART.md §5: "it collapses asymmetrically from the segment nearest the hit".
 * One pose per gore, rolled to that gore's side, so `rig.pose('hit7', t)` folds
 * the canopy inwards from segment 7 as `t` runs 0 -> 1.
 */
function collapsePoses() {
  const poses = {};
  for (let h = 0; h < SEGMENTS; h++) {
    const p = {};
    for (let i = 0; i < SEGMENTS; i++) {
      // distance around the dome from the hit, 0..1
      const d = Math.abs(i - h) / SEGMENTS;
      const fold = (1 - d) * (1 - d) * 1.5 * (i < h ? 1 : -1);
      p['gore' + i] = fold;
    }
    for (let i = 0; i < LINES; i++) { p['cord' + i] = 0; p['cordb' + i] = 0; }
    poses['hit' + h] = p;
  }
  return poses;
}

/**
 * The canopy BREATHES: §4.2's low-amplitude sine along the segment index. Call
 * it once a frame with the crate's own age so two canopies in the same sky are
 * never in step. Writes angles only — no allocation.
 */
export function breathe(rig, t, amp = 0.035) {
  for (let i = 0; i < SEGMENTS; i++) {
    const p = rig.get('gore' + i);
    if (p) p.angle = p.rest + Math.sin(t * 1.7 + i * 0.52) * amp;
  }
  return rig;
}

/** Which gore a world-space hit landed nearest, for `pose('hit' + n, t)`. */
export function goreAt(dxWu) {
  const t = (dxWu / SPAN) + 0.5;
  return Math.max(0, Math.min(SEGMENTS - 1, Math.floor(t * SEGMENTS)));
}

export const CANOPY = Object.freeze({ SEGMENTS, SPAN, RISE, LINES, DROP });
