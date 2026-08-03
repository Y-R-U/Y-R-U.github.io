// A spiral stair and the loft it climbs to, for the houses whose exterior already draws two rows
// of windows. The stair core is a no-go volume except where the flight is actually at your feet,
// which is what stops you walking into the well from the middle of the room.

import * as THREE from 'three';
import { T, flat } from './details.js';

const R = 0.85;                       // outer radius of a tread
export const WELL = R / Math.SQRT2;   // half-side of the square hole, inscribed so it is all stair
const GAP = 0.30;                     // gap from the stair to the +z wall it backs onto
const A0 = -Math.PI / 2;              // both landings face -z, into the room
const TAU = Math.PI * 2;
const REACH = 0.7;                    // how far from a tread still counts as standing on it

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const wrap = a => { const t = a % TAU; return t < 0 ? t + TAU : t; };

// Backed into the +z wall beside the chimney breast, whose mantel is the widest thing on the -x
// wall. Clear of the doorway in the middle of +z, and with floor left to walk round the well.
export function stairPos(I) {
  return { x: -I.rx + 0.62 + R + 0.08, z: I.rz - R - GAP };
}

export function stairFits(I) {
  return I.rx > 2 * R + 1.45 && I.rz > 2 * R + 0.9;
}

// Height of the flight under a point, or null outside the core. Exactly one turn, so the angle
// alone gives the height and the seam is the one place two heights meet.
export function stairFloor(I, lx, lz) {
  const { x: sx, z: sz } = stairPos(I);
  const dx = lx - sx, dz = lz - sz;
  if (dx * dx + dz * dz > R * R) return null;
  return I.fy + (I.deck - I.fy) * (wrap(Math.atan2(dz, dx) - A0) / TAU);
}

// Pushed back out to the rim when you are beside the flight rather than on it, and told whether
// you ended up on it. `ref` is the flight height you were on last frame, or null if you were off:
// getting on needs a tread at your feet, staying on only needs the height to be continuous. A
// sprint up runs ahead of the eased position and would fail an at-your-feet test half way up, and
// the seam — where the top of the flight meets the bottom — fails the continuity test, so it stays
// a wall you have to walk round rather than a three metre drop you can step across.
export function stairBlock(I, p, y, ref) {
  const { x: sx, z: sz } = stairPos(I);
  const dx = p.x - sx, dz = p.z - sz;
  const d = Math.hypot(dx, dz);
  if (d > R) return false;
  const h = stairFloor(I, p.x, p.z);
  if (ref === null ? Math.abs(h - y) < REACH : Math.abs(h - ref) < 0.6) return true;
  const k = (R + 0.02) / Math.max(d, 1e-3);
  p.x = sx + dx * k;
  p.z = sz + dz * k;
  return false;
}

export function build(b, I, rand) {
  const { x: sx, z: sz } = stairPos(I);
  const rise = I.deck - I.fy;
  const n = Math.max(12, Math.round(rise / 0.2));
  const dA = TAU / n;
  const step = rise / n;

  // three's cylinder sweeps from +z toward +x, so its theta is pi/2 minus ours.
  for (let i = 0; i < n; i++) {
    const a0 = A0 + dA * i, am = a0 + dA / 2;
    const y = I.fy + step * (i + 1);
    b.add('wood', new THREE.CylinderGeometry(R, R, 0.055, 4, 1, false, Math.PI / 2 - a0 - dA, dA),
      T(sx, y - 0.027, sz));
    b.add('wood', box(R - 0.1, step, 0.055),
      T(sx + Math.cos(am) * (R + 0.1) / 2, y - step / 2 - 0.027, sz + Math.sin(am) * (R + 0.1) / 2, -am));
  }

  b.add('wood', new THREE.CylinderGeometry(0.085, 0.095, rise + 1.02, 7),
    T(sx, I.fy + (rise + 1.02) / 2, sz));

  // one baluster per tread with a rail cap sloping to the next: a handrail for a quarter of what
  // a swept tube costs
  const rh = 0.92, pitch = Math.atan2(step, R * dA);
  for (let i = 0; i < n; i++) {
    const a = A0 + dA * (i + 0.6);
    const y = I.fy + step * (i + 1);
    const px = sx + Math.cos(a) * (R - 0.09), pz = sz + Math.sin(a) * (R - 0.09);
    b.add('wood', box(0.045, rh, 0.045), T(px, y + rh / 2, pz));
    b.add('wood', box(0.075, 0.055, R * dA + 0.12), T(px, y + rh, pz, -a, -pitch));
  }

  loft(b, I, rand, sx, sz);
}

function loft(b, I, rand, sx, sz) {
  const { rx, rz, deck } = I;
  const x0 = sx - WELL, x1 = sx + WELL, z0 = sz - WELL, z1 = sz + WELL;
  const strip = (ax, az, hw, hd) => b.add('wood', box(hw * 2, 0.12, hd * 2), T(ax, deck - 0.06, az));

  // deck as four strips around the well, so the stair comes up through a real opening
  strip(0, (z0 - rz) / 2, rx, (z0 + rz) / 2);
  strip(0, (z1 + rz) / 2, rx, (rz - z1) / 2);
  strip((x0 - rx) / 2, sz, (x0 + rx) / 2, WELL);
  strip((x1 + rx) / 2, sz, (rx - x1) / 2, WELL);

  const joists = Math.max(2, Math.round(rx * 2 / 1.5));
  for (let i = 0; i < joists; i++) {
    const x = -rx + rx * 2 * (i + 0.5) / joists;
    if (x > x0 - 0.12 && x < x1 + 0.12) continue;
    b.add('wood', box(0.16, 0.19, rz * 2), T(x, deck - 0.21, 0));
  }

  // railed on three sides; the gate is the -z side, which is where the flight tops out
  const rail = (ax, az, len, along) => {
    const posts = Math.max(2, Math.round(len / 0.4));
    for (let i = 0; i <= posts; i++) {
      const u = -len / 2 + len * i / posts;
      b.add('wood', box(0.05, 0.86, 0.05), T(ax + (along ? u : 0), deck + 0.43, az + (along ? 0 : u)));
    }
    b.add('wood', box(len + 0.09, 0.07, 0.09), T(ax, deck + 0.89, az, along ? 0 : Math.PI / 2));
  };
  rail(sx, z1, WELL * 2, true);
  rail(x0, sz, WELL * 2, false);
  rail(x1, sz, WELL * 2, false);

  // Walls stop at the eaves, where the sloping ceiling comes down to meet them.
  const rise = gableRise(I);
  storey(b, I, deck, I.roomH2 - rise);
  gableCeiling(b, I, rise);
  furnish(b, I, rand, deck);
}

function furnish(b, I, rand, fy) {
  const { rx, rz } = I;
  const bl = Math.min(rz * 0.75, 1.75);
  b.add('wood', box(0.82, 0.17, bl), T(rx - 0.55, fy + 0.26, -rz + bl / 2 + 0.3));
  b.add('cloth', box(0.78, 0.15, bl - 0.1), T(rx - 0.55, fy + 0.42, -rz + bl / 2 + 0.3));
  b.add('wood', box(0.86, 0.62, 0.1), T(rx - 0.55, fy + 0.32, -rz + 0.33));
  b.add('cloth', box(0.72, 0.09, 0.4), T(rx - 0.55, fy + 0.53, -rz + 0.64));

  b.add('wood', box(0.5, 0.44, 0.86), T(rx - 0.35, fy + 0.23, rz * 0.55));
  b.add('wood', box(0.54, 0.09, 0.9), T(rx - 0.35, fy + 0.49, rz * 0.55));

  b.add('cloth', box(Math.min(rx * 1.1, 1.5), 0.014, Math.min(rz * 0.7, 1.5)), T(rx * 0.2, fy + 0.128, 0));

  b.add('wood', box(1.1, 0.07, 0.34), T(0, fy + 0.47, -rz + 0.36));
  for (const s of [-1, 1]) b.add('wood', box(0.09, 0.44, 0.3), T(s * 0.46, fy + 0.25, -rz + 0.36));

  if (rand() < 0.6) {
    b.add('wood', box(0.3, 0.05, 0.9), T(-rx + 0.2, fy + 1.25, -rz * 0.4));
    for (const s of [-1, 1]) b.add('wood', box(0.26, 0.2, 0.06), T(-rx + 0.2, fy + 1.14, -rz * 0.4 + s * 0.38));
  }
}

// The ground floor's four faces again, minus the doorway.
function storey(b, I, y0, h) {
  const { rx, rz } = I;
  const panelH = y0 + h * 0.5;
  const face = [
    { m: T(0, 0, -rz), sx: rx },
    { m: T(0, 0, rz, Math.PI), sx: rx },
    { m: T(rx, 0, 0, Math.PI / 2), sx: rz },
    { m: T(-rx, 0, 0, -Math.PI / 2), sx: rz },
  ];
  for (const [fi, f] of face.entries()) {
    const wide = f.sx * 2;
    b.add('wood', box(wide, h, 0.05), f.m.clone().multiply(T(0, y0 + h / 2, 0.025)));
    if (fi !== 0) b.add('wood', box(wide * 0.99, panelH - y0, 0.06), f.m.clone().multiply(T(0, (y0 + panelH) / 2, 0.075)));
    b.add('wood', box(wide, 0.16, 0.11), f.m.clone().multiply(T(0, y0 + 0.08, 0.055)));
  }
}

export function gableRise(I) { return Math.min(Math.min(I.rx, I.rz) * 0.4, 0.85); }

// The loft eats into the roof void, which is what makes a low ceiling up here read as a loft
// rather than as a second identical room.
function gableCeiling(b, I, rise) {
  const { rx, rz, ceil2 } = I;
  const alongX = rx >= rz;
  const half = alongX ? rz : rx;
  const run = alongX ? rx : rz;
  const slope = Math.atan2(rise, half);
  const len = Math.hypot(half, rise);

  for (const s of [-1, 1]) {
    b.add('wood',
      alongX ? box(run * 2, 0.1, len) : box(len, 0.1, run * 2),
      alongX ? T(0, ceil2 - rise / 2, s * half / 2, 0, s * slope)
             : T(s * half / 2, ceil2 - rise / 2, 0, 0, 0, -s * slope));
  }
  b.add('wood', alongX ? box(run * 2, 0.16, 0.18) : box(0.18, 0.16, run * 2), T(0, ceil2 + 0.06, 0));

  const tri = new THREE.Shape([
    new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise),
  ]);
  for (const s of [-1, 1]) {
    b.add('wood', flat(tri), alongX
      ? T(s * run, ceil2 - rise, 0, -s * Math.PI / 2)
      : T(0, ceil2 - rise, s * run, s > 0 ? Math.PI : 0));
  }
}
