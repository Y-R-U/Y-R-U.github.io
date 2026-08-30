// A spiral stair and the loft it climbs to, for the houses whose exterior already draws two rows
// of windows. The stair core is a no-go volume except where the flight is actually at your feet,
// which is what stops you walking into the well from the middle of the room.

import * as THREE from 'three';
import { T, flat } from './details.js';

const R = 1.15;                       // outer radius of a tread, and of the hole it comes up through
const GAP = 0.45;                     // gap from the stair to the +z wall it backs onto
const A0 = -Math.PI / 2;              // the foot of the flight faces -z, into the room
const TAU = Math.PI * 2;
const REACH = 1.05;                   // how far from a tread still counts as standing on it
const WALK_R = 0.70;                  // radius the scripted walk follows: the middle of a tread
const LEAD = 0.87;                    // how far beyond the rim a landing sits

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const wrap = a => { const t = a % TAU; return t < 0 ? t + TAU : t; };

// Backed into the +z wall beside the chimney breast, whose mantel is the widest thing on the -x
// wall. Clear of the doorway in the middle of +z, and with floor left to walk round the well.
export function stairPos(I) {
  return { x: -I.rx + 0.93 + R + 0.12, z: I.rz - R - GAP };
}

// The stair itself scales; the room you have to have left over to walk round it does not, so
// these are 2R plus the (scaled) offsets in stairPos plus an unscaled 0.75/0.60 of shoulder.
// A flat ×1.5 would put the threshold at 4.48 and lock the 10 m minimum house out of a loft.
export function stairFits(I) {
  return I.rx > 2 * R + 1.80 && I.rz > 2 * R + 1.05;
}

// Height of the flight under a point, or null outside the core. Exactly one turn, so the angle
// alone gives the height and the seam is the one place two heights meet.
export function stairFloor(I, lx, lz) {
  const { x: sx, z: sz } = stairPos(I);
  const dx = lx - sx, dz = lz - sz;
  if (dx * dx + dz * dz > R * R) return null;
  return I.fy + (I.deck - I.fy) * (wrap(Math.atan2(dz, dx) - A0) / TAU);
}

// The arc of rim you are allowed to step onto the flight from at deck level: anywhere else the
// tread below you is more than a stride down. The loft railing is built to exactly this opening,
// so the rail you can see and the rule you can feel are the same thing.
export function gateArc(I) {
  return THREE.MathUtils.clamp(TAU * REACH / (I.deck - I.fy), 0.6, 1.6);
}

// Where you stand to use the stair. The foot is just past the first tread; the head is inside the
// gate, a little short of the seam so the last step onto the deck is a step and not a scramble.
export function stairLanding(I, top) {
  const { x: sx, z: sz } = stairPos(I);
  const a = top ? headAngle(I) : A0 + 0.25;
  return { x: sx + Math.cos(a) * (R + LEAD), z: sz + Math.sin(a) * (R + LEAD), y: top ? I.deck : I.fy };
}

const headAngle = I => A0 + TAU - Math.min(gateArc(I) / 2, 0.35);

// The scripted walk, as local waypoints from the foot landing to the head one.
export function stairPath(I, up) {
  const { x: sx, z: sz } = stairPos(I);
  const rise = I.deck - I.fy;
  const a0 = A0 + 0.25, a1 = headAngle(I);
  const pts = [stairLanding(I, false)];
  for (let i = 0; i <= 26; i++) {
    const a = a0 + (a1 - a0) * i / 26;
    pts.push({ x: sx + Math.cos(a) * WALK_R, z: sz + Math.sin(a) * WALK_R, y: I.fy + rise * (a - A0) / TAU });
  }
  pts.push(stairLanding(I, true));
  return up ? pts : pts.reverse();
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
  if (d > R) {
    // Mid-flight the rim is the handrail, so the two landings are the only ways off.
    if (ref === null || ref < I.fy + 0.35 || ref > I.deck - 0.35) return false;
    const k = (R - 0.02) / d;
    p.x = sx + dx * k;
    p.z = sz + dz * k;
    return true;
  }
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
    b.add('wood', box(R - 0.15, step, 0.055),
      T(sx + Math.cos(am) * (R + 0.1) / 2, y - step / 2 - 0.027, sz + Math.sin(am) * (R + 0.1) / 2, -am));
  }

  b.add('wood', new THREE.CylinderGeometry(0.085, 0.095, rise + 1.02, 7),
    T(sx, I.fy + (rise + 1.02) / 2, sz));

  // one baluster per tread with a rail cap sloping to the next: a handrail for a quarter of what
  // a swept tube costs. The cap spans the chord to the next baluster, not the arc — an arc-length
  // cap is half as long again as the gap it bridges and the run comes out a pile of crossed sticks.
  const rr = R - 0.14;
  const rh = 0.92, chord = Math.hypot(2 * rr * Math.sin(dA / 2), step);
  const pitch = Math.atan2(step, 2 * rr * Math.sin(dA / 2));
  for (let i = 0; i < n; i++) {
    const y = I.fy + step * (i + 1);
    if (y + rh > I.deck) break;   // above the deck the loft railing takes over; two rails read as a tangle
    const a = A0 + dA * (i + 0.6);
    const px = sx + Math.cos(a) * rr, pz = sz + Math.sin(a) * rr;
    b.add('wood', box(0.045, rh, 0.045), T(px, y + rh / 2, pz));
    b.add('wood', box(0.075, 0.055, chord + 0.05), T(px, y + rh, pz, -a - dA / 2, -pitch));
  }

  loft(b, I, rand, sx, sz);
}

function loft(b, I, rand, sx, sz) {
  const { rx, rz, deck } = I;

  // The opening is the stair circle itself, so every point of it has a tread under it and the rim
  // is the same line the collision uses. A square well big enough to clear the handrail would put
  // its corners out past the treads, leaving holes you cannot stand in and cannot fall through.
  const slab = new THREE.Shape([
    new THREE.Vector2(-rx, -rz), new THREE.Vector2(rx, -rz),
    new THREE.Vector2(rx, rz), new THREE.Vector2(-rx, rz),
  ]);
  const hole = new THREE.Path();
  hole.absarc(sx, sz, R, 0, TAU, true);
  slab.holes.push(hole);
  b.add('wood', new THREE.ExtrudeGeometry(slab, { depth: 0.18, bevelEnabled: false, curveSegments: 16 }),
    T(0, deck, 0, 0, Math.PI / 2));

  const joists = Math.max(2, Math.round(rx * 2 / 2.25));
  for (let i = 0; i < joists; i++) {
    const x = -rx + rx * 2 * (i + 0.5) / joists;
    if (Math.abs(x - sx) < R + 0.18) continue;
    b.add('wood', box(0.24, 0.29, rz * 2), T(x, deck - 0.325, 0));
  }

  // Railed right round the opening bar the gate, which starts at the seam — the post there is what
  // stands between the loft and a four metre drop to the foot of the flight.
  const rr = R + 0.165;
  const span = TAU - gateArc(I);
  const posts = Math.max(4, Math.round(span / 0.42));
  for (let i = 0; i <= posts; i++) {
    const a = A0 + span * i / posts;
    b.add('wood', box(0.05, 0.9, 0.05), T(sx + Math.cos(a) * rr, deck + 0.45, sz + Math.sin(a) * rr));
  }
  // caps sit on the chord between two posts, which is inboard of the posts themselves
  const half = span / posts / 2, cr = rr * Math.cos(half);
  for (let i = 0; i < posts; i++) {
    const a = A0 + span * (i + 0.5) / posts;
    b.add('wood', box(0.08, 0.07, 2 * rr * Math.sin(half) + 0.05),
      T(sx + Math.cos(a) * cr, deck + 0.92, sz + Math.sin(a) * cr, -a));
  }

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
    b.add('wood', box(wide, h, 0.075), f.m.clone().multiply(T(0, y0 + h / 2, 0.038)));
    if (fi !== 0) b.add('wood', box(wide * 0.99, panelH - y0, 0.09), f.m.clone().multiply(T(0, (y0 + panelH) / 2, 0.113)));
    b.add('wood', box(wide, 0.24, 0.165), f.m.clone().multiply(T(0, y0 + 0.12, 0.083)));
  }
}

export function gableRise(I) { return Math.min(Math.min(I.rx, I.rz) * 0.4, 1.28); }

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
      alongX ? box(run * 2, 0.15, len) : box(len, 0.15, run * 2),
      alongX ? T(0, ceil2 - rise / 2, s * half / 2, 0, s * slope)
             : T(s * half / 2, ceil2 - rise / 2, 0, 0, 0, -s * slope));
  }
  b.add('wood', alongX ? box(run * 2, 0.24, 0.27) : box(0.27, 0.24, run * 2), T(0, ceil2 + 0.09, 0));

  const tri = new THREE.Shape([
    new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise),
  ]);
  for (const s of [-1, 1]) {
    b.add('wood', flat(tri), alongX
      ? T(s * run, ceil2 - rise, 0, -s * Math.PI / 2)
      : T(0, ceil2 - rise, s * run, s > 0 ? Math.PI : 0));
  }
}
