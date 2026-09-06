// The Adventure Society's grand stair, drawn. Every number it places comes out of
// js/world/stairplan.js, which is where the same numbers are answered to the player.
//
// js/world/stairs.js stays what it is — one turn, two floors, a 1.15 m well you edge round in a
// cottage. Nothing here is a variant of it: at four times the radius and five storeys the tread
// count, the balustrade pitch and the newel are all different decisions.

import * as THREE from 'three';
import { T } from './details.js';
import { TAU, A0, gateArc, wellR } from './stairplan.js';

const RAIL = 0.16;   // handrails inboard of each rim, so a rail is never over the drop

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function build(b, S, { wood = 'wood', stone = 'stone' } = {}) {
  const perTurn = Math.max(18, Math.round(S.rise / 0.19));
  const dA = TAU / perTurn;
  const step = S.rise / perTurn;
  const width = S.r1 - S.r0;
  const top = S.ys[S.ys.length - 1];

  // A pie slice rather than an annular wedge: everything inside `r0` is buried in the newel, and
  // a slice is one primitive where a ring is a lathe. The same trade stairs.js makes, at four
  // times the radius — and the reason the newel below is solid rather than a post.
  for (let k = 0; k < S.turns; k++) {
    for (let i = 0; i < perTurn; i++) {
      const a0 = A0 + dA * i, am = a0 + dA / 2;
      const y = S.y0 + k * S.rise + step * (i + 1);
      b.add(stone, new THREE.CylinderGeometry(S.r1, S.r1, 0.10, 3, 1, false, Math.PI / 2 - a0 - dA, dA),
        T(S.x, y - 0.05, S.z));
      b.add(stone, box(width, step, 0.09),
        T(S.x + Math.cos(am) * S.rw, y - step / 2 - 0.05, S.z + Math.sin(am) * S.rw, -am));
    }
  }

  b.add(stone, new THREE.CylinderGeometry(S.r0, S.r0 * 1.05, top - S.y0 + 0.5, 18),
    T(S.x, S.y0 + (top - S.y0 + 0.5) / 2, S.z));

  // One baluster every few treads on each rim. At this radius one per tread is six hundred posts
  // for a run nobody stands close to, and they read as a balustrade either way.
  for (const [r, every] of [[S.r1 - RAIL, 4], [S.r0 + RAIL, 5]]) {
    const chord = 2 * r * Math.sin(dA * every / 2);
    const pitch = Math.atan2(step * every, chord);
    const cap = Math.hypot(chord, step * every);
    for (let k = 0; k < S.turns; k++) {
      for (let i = 0; i + every <= perTurn; i += every) {
        const y = S.y0 + k * S.rise + step * (i + 1);
        const a = A0 + dA * (i + 0.5);
        const px = S.x + Math.cos(a) * r, pz = S.z + Math.sin(a) * r;
        b.add(wood, box(0.08, 1.0, 0.08), T(px, y + 0.5, pz));
        b.add(wood, box(0.13, 0.09, cap + 0.06), T(px, y + 1.0, pz, -a - dA * every / 2, -pitch));
      }
    }
  }
}

// The railing round one floor's well, with the gate left open where the flight arrives.
export function railFloor(b, S, y, surface = 'wood') {
  const r = wellR(S) + 0.18;
  const gap = gateArc(S) * 2;
  const span = TAU - gap;
  const posts = Math.max(6, Math.round(span / 0.55));
  const a0 = A0 + gap / 2;
  for (let i = 0; i <= posts; i++) {
    const a = a0 + span * i / posts;
    b.add(surface, box(0.09, 1.04, 0.09), T(S.x + Math.cos(a) * r, y + 0.52, S.z + Math.sin(a) * r));
  }
  const half = span / posts / 2, cr = r * Math.cos(half);
  for (let i = 0; i < posts; i++) {
    const a = a0 + span * (i + 0.5) / posts;
    b.add(surface, box(0.14, 0.10, 2 * r * Math.sin(half) + 0.07),
      T(S.x + Math.cos(a) * cr, y + 1.06, S.z + Math.sin(a) * cr, -a));
  }
}

// A storey's floor, with the well cut out of it. Above the ground floor only — the ground floor
// is the room's own plinth and has nothing under it to fall through.
export function slab(b, S, rx, rz, y, { surface = 'stone', th = 0.34, joist = 'wood' } = {}) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-rx, -rz), new THREE.Vector2(rx, -rz),
    new THREE.Vector2(rx, rz), new THREE.Vector2(-rx, rz),
  ]);
  const hole = new THREE.Path();
  hole.absarc(S.x, S.z, wellR(S), 0, TAU, true);
  shape.holes.push(hole);
  b.add(surface, new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 32 }),
    T(0, y - th, 0, 0, Math.PI / 2));

  // Beams under it, so from the floor below the ceiling is structure rather than a flat lid.
  const n = Math.max(3, Math.round(rx * 2 / 3.4));
  for (let i = 0; i < n; i++) {
    const x = -rx + rx * 2 * (i + 0.5) / n;
    if (Math.abs(x - S.x) < wellR(S) + 0.3) continue;
    b.add(joist, box(0.34, 0.44, rz * 2), T(x, y - th - 0.22, 0));
  }
}
