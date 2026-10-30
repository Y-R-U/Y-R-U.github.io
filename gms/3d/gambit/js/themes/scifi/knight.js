// Sci-fi Knight: "Strider". A chicken-walker mech (think AT-ST / a scout mech): the whole
// body is one long armoured cockpit hull pointing -z (its "head"), with a wrap-around glass
// canopy, glowing visor slits down both sides, a glowing light-line along the spine, two
// sensor-blade "ears" at the back, side sensor pods, chin cannons and twin jump-jet nozzles.
// It stands on two reverse-jointed legs (knees bend backward) with big bevelled feet on a
// round deck pad with a light channel.
// Overhead read: a long hull (0.61 long x 0.27 wide) pointing sideways with a bright spine
// line, two ear dots at the back, pods at the shoulders. Authored facing -z (MODEL_GUIDE §2).
import { hsLathe, prep, assemble, loft, chamferRect, strut } from './common.js';

const { PI } = Math;

/**
 * Hull cross-section (CCW, 22 points): chamfered box with a side panel groove at ~45% height
 * (`slot` finish on its floor: dark, or glowing visor slits at the front) and a recessed spine
 * channel on top (`spine` finish on its floor: the light-line).
 */
function hullSec(w, yb, yt, c, { up = 'trim', top = 'body', spine = 'line', slot = 'dark', bot = 'shade', side = 'body' } = {}) {
  const x = w / 2, ym = yb + (yt - yb) * 0.45, gs = Math.min(0.013, (yt - yb) * 0.09), gd = 0.008;
  const g = Math.min(0.016, (x - c) * 0.55);
  return [
    [0, yb, bot], [x - c, yb, bot], [x, yb + c, 'trim'], [x, ym - gs, side],
    [x - gd, ym - gs * 0.5, 'dark'], [x - gd, ym + gs * 0.5, slot], [x, ym + gs, 'dark'],
    [x, yt - c, side], [x - c, yt, up], [g, yt, top], [g * 0.6, yt - gd, 'dark'],
    [-g * 0.6, yt - gd, spine], [-g, yt, 'dark'], [-(x - c), yt, top], [-x, yt - c, up],
    [-x, ym + gs, side], [-(x - gd), ym + gs * 0.5, 'dark'], [-(x - gd), ym - gs * 0.5, slot], [-x, ym - gs, 'dark'],
    [-x, yb + c, side], [-(x - c), yb, 'trim'],
  ];
}

/** Joint hub: a bevelled disc of radius r, thickness t, centred at (x,y,z), face toward ±x. */
function hub(THREE, color, r, t, x, y, z, s, seg = 16) {
  const g = hsLathe(THREE, color, [
    [0, -t / 2, 'dark'], [r * 0.9, -t / 2, 'dark'], [r, -t / 2 + r * 0.1, 'trim'], [r, t / 2 - r * 0.15, 'body'],
    [r * 0.85, t / 2, 'trim'], [r * 0.6, t / 2, 'trim'], [r * 0.55, t / 2 - 0.004, 'dark'], [r * 0.4, t / 2 - 0.004, 'line'], [r * 0.32, t / 2 + 0.002, 'trim'], [0, t / 2 + 0.004, 'trim'],
  ], { seg });
  g.rotateZ(-s * PI / 2); g.translate(x, y, z);
  return g;
}

export function knight(THREE, kit, { color }) {
  const parts = [];

  // ---- deck pad: chamfered disc with a recessed light channel ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.305, 0, 'dark'], [0.33, 0.02, 'shade'], [0.33, 0.046, 'body'],
    [0.315, 0.062, 'trim'], [0.296, 0.062, 'body'],
    [0.296, 0.052, 'dark'], [0.292, 0.05, 'line'], [0.26, 0.05, 'line'], [0.256, 0.052, 'line'], [0.256, 0.064, 'dark'],
    [0.23, 0.068, 'deck'], [0, 0.068, 'deck'],
  ], { seg: 40 }));

  // ---- cockpit hull (the "head"), back (+z) to nose (-z) ----
  const S = (z, w, yb, yt, c, o = {}, key) => ({ z, pts: hullSec(w, yb, yt, c, o), key, smooth: !key });
  const visor = { up: 'canopy', slot: 'lineHi' }, screen = { top: 'canopy', up: 'canopy', slot: 'lineHi' };
  parts.push(loft(THREE, color, [
    S(0.226, 0.15, 0.6, 0.77, 0.03),
    S(0.206, 0.21, 0.565, 0.81, 0.04, {}, 'trim'),
    S(0.17, 0.236, 0.55, 0.83, 0.045),
    S(0.112, 0.25, 0.541, 0.845, 0.05),
    S(0.104, 0.236, 0.55, 0.834, 0.047, {}, 'dark'),           // transverse panel groove
    S(0.088, 0.236, 0.55, 0.834, 0.047, {}, 'dark'),
    S(0.08, 0.252, 0.54, 0.848, 0.05, {}, 'dark'),
    S(-0.02, 0.27, 0.535, 0.86, 0.05),
    S(-0.11, 0.27, 0.54, 0.86, 0.05),
    S(-0.128, 0.268, 0.542, 0.858, 0.05, {}, 'trim'),          // canopy frame band
    S(-0.14, 0.266, 0.545, 0.856, 0.05, { up: 'canopy' }),
    S(-0.235, 0.236, 0.56, 0.824, 0.048, visor),
    S(-0.315, 0.178, 0.594, 0.768, 0.04, screen),
    S(-0.362, 0.122, 0.624, 0.727, 0.03, { top: 'canopy', up: 'canopy' }),
    S(-0.386, 0.074, 0.645, 0.7, 0.02, {}, 'trim'),
  ], { capStart: 'deck', capEnd: 'dark' }));
  // nose sensor eye
  parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.014, 10, 6), { y: 0.672, z: -0.386 }), color, 'lineHi'));

  // ---- ears: two swept sensor blades at the back, glowing tips ----
  for (const s of [-1, 1]) {
    parts.push(strut(THREE, color, [s * 0.068, 0.83, 0.125], [s * 0.094, 0.995, 0.205],
      t => chamferRect(0.024 - 0.01 * t, 0.056 - 0.026 * t, 0.006, { side: 'body', top: 'shade', bot: 'shade' }),
      [0, 0.78, { t: 0.8, key: 'dark' }, { t: 1, key: 'lineHi' }], { capStart: 'dark', capEnd: 'lineHi' }));
  }

  // ---- side sensor pods with a glowing top strip and a 2x2 emitter face ----
  for (const s of [-1, 1]) {
    const pod = (z, w, yb, yt, c, key) => ({ z, pts: hullSec(w, yb, yt, c, { slot: 'dark' }).map(p => [p[0] + s * 0.166, p[1], p[2]]), key });
    parts.push(loft(THREE, color, [
      pod(0.085, 0.04, 0.68, 0.745, 0.012), pod(0.07, 0.058, 0.666, 0.762, 0.015, 'trim'),
      pod(-0.06, 0.058, 0.666, 0.762, 0.015), pod(-0.075, 0.052, 0.672, 0.756, 0.014, 'trim'),
    ], { capStart: 'deck', capEnd: 'dark' }));
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      const e = prep(THREE, new THREE.BoxGeometry(0.013, 0.013, 0.006), color, 'lineHi');
      parts.push(kit.place(e, { x: s * 0.166 + dx * 0.012, y: 0.714 + dy * 0.016, z: -0.076 }));
    }
  }

  // ---- chin cannons ----
  for (const s of [-1, 1]) {
    const b = prep(THREE, new THREE.CylinderGeometry(0.013, 0.016, 0.2, 10), color, 'trim');
    parts.push(kit.place(b, { x: s * 0.058, y: 0.572, z: -0.24, rx: PI / 2 }));
    const m = prep(THREE, new THREE.CylinderGeometry(0.009, 0.009, 0.004, 10), color, 'lineHi');
    parts.push(kit.place(m, { x: s * 0.058, y: 0.572, z: -0.341, rx: PI / 2 }));
  }

  // ---- jump-jet nozzles on the back, glowing throats, angled down and back ----
  for (const s of [-1, 1]) {
    const nz = hsLathe(THREE, color, [
      [0, -0.03, 'shade'], [0.02, -0.03, 'shade'], [0.036, 0.046, 'body'], [0.032, 0.052, 'trim'],
      [0.026, 0.052, 'trim'], [0.016, 0.004, 'dark'], [0, 0.004, 'lineHi'],
    ], { seg: 14 });
    nz.rotateX(PI); nz.rotateX(-0.75);                       // bell opens down and back (+z)
    parts.push(kit.place(nz, { x: s * 0.068, y: 0.6, z: 0.215 }));
  }

  // ---- pelvis + hip axle ----
  parts.push(loft(THREE, color, [
    { z: 0.09, pts: chamferRect(0.13, 0.06, 0.014, { cy: 0.505 }) },
    { z: -0.07, pts: chamferRect(0.13, 0.06, 0.014, { cy: 0.505 }) },
  ], { capStart: 'shade', capEnd: 'shade' }));
  {
    const ax = hsLathe(THREE, color, [[0.026, -0.15, 'trim'], [0.026, 0.15, 'trim']], { seg: 12 });
    ax.rotateZ(PI / 2); ax.translate(0, 0.49, 0.02); parts.push(ax);
  }

  // ---- reverse-jointed legs ----
  for (const s of [-1, 1]) {
    const x = s * 0.15;
    const H = [x, 0.49, 0.02], K = [x, 0.31, 0.15], A = [x, 0.148, 0.005];
    // thigh: thick armoured plate, slightly tapered, with a dark groove band
    parts.push(strut(THREE, color, H, K, t => chamferRect(0.056 - 0.008 * t, 0.084 - 0.02 * t, 0.013, { side: 'body', top: 'shade', bot: 'shade' }),
      [0, 0.45, { t: 0.5, key: 'dark' }, { t: 0.56, key: 'dark' }, 1], { capStart: false, capEnd: false }));
    // shin: slimmer, a light-line on the outer face
    parts.push(strut(THREE, color, K, A, t => {
      const p = chamferRect(0.042, 0.056 - 0.012 * t, 0.01, { side: 'shade', top: 'body', bot: 'body' });
      p[s > 0 ? 2 : 6][2] = 'line';
      return p;
    }, [0, 1], { capStart: false, capEnd: false }));
    // joints
    parts.push(hub(THREE, color, 0.05, 0.075, x, 0.49, 0.02, s));
    parts.push(hub(THREE, color, 0.042, 0.066, x, 0.31, 0.15, s));
    parts.push(hub(THREE, color, 0.03, 0.054, x, 0.148, 0.005, s, 12));
    // foot: bevelled wedge, metal toe cap, glowing toe tip
    const F = (z, w, h, cy, key) => ({ z, pts: chamferRect(w, h, Math.min(0.014, h * 0.3), { cx: x, cy, top: 'body', side: 'shade', bot: 'dark' }), key });
    parts.push(loft(THREE, color, [
      F(0.1, 0.06, 0.036, 0.094), F(0.084, 0.078, 0.052, 0.098, 'trim'), F(0.02, 0.086, 0.064, 0.104),
      F(-0.09, 0.086, 0.056, 0.1), F(-0.1, 0.084, 0.052, 0.098, 'dark'), F(-0.155, 0.074, 0.032, 0.088, 'trim'),
      F(-0.172, 0.058, 0.02, 0.083, 'trim'),
    ], { capStart: 'shade', capEnd: 'line' }));
  }

  return assemble(kit, color, parts);
}
