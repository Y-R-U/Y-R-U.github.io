// The pieces an authored town is written out of, shared by whitewall.js and longacre.js. No
// `three` import and no zone anywhere: every function here returns plain scene objects, so a node
// test can walk a whole town as data and the zone is still the only thing that makes two towns
// look different.
//
// Lifted verbatim out of whitewall.js when the second town needed them. `whitewall()`'s 139
// objects are byte-identical across the move; `stagger` is the one addition, and it is 0 for
// Whitewall.

import { HOUSE_MIN_W } from './scene.js';

export const P2 = Math.PI / 2;

export const r3 = v => Math.round(v * 1000) / 1000;

export const put = (out, type, x, z, ry, p, extra) => {
  out.push({ type, x: r3(x), z: r3(z), ry: r3(ry), p, ...extra });
  return out;
};

export const tower = (out, x, z, radius, height, sides, extra) =>
  put(out, 'tower', x, z, 0, { radius, height, sides }, extra);
export const house = (out, x, z, ry, w, d, h, extra) =>
  put(out, 'house', x, z, ry, { w: Math.max(w, HOUSE_MIN_W), d, h }, extra);
export const mass = (out, x, z, ry, w, d, h) => put(out, 'mass', x, z, ry, { w, d, h });
export const arcade = (out, x, z, ry, length, height, depth, bays) =>
  put(out, 'arcade', x, z, ry, { length, height, depth, bays });
export const pen = (out, x, z, ry, w, d, h) => put(out, 'pen', x, z, ry, { w, d, h });

// The shortest stretch worth emitting: `retaining`'s own schema minimum in scene.js, under which
// the object does not normalise.
export const WALL_MIN = 6;

// What is left of `a0..a1` once the gaps are cut out of it.
export function segments(a0, a1, gaps) {
  let cuts = [[a0, a1]];
  for (const [g0, g1] of gaps) {
    const next = [];
    for (const [s0, s1] of cuts) {
      if (g1 <= s0 || g0 >= s1) { next.push([s0, s1]); continue; }
      if (g0 > s0) next.push([s0, g0]);
      if (g1 < s1) next.push([g1, s1]);
    }
    cuts = next;
  }
  return cuts;
}

// One straight wall, split into runs no longer than `max`. `axis` is the axis the wall runs
// along; `fixed` is its other coordinate.
export function wallLine(out, { axis, fixed, from, to, gaps = [], max, min, make }) {
  for (const [s0, s1] of segments(from, to, gaps)) {
    const total = s1 - s0;
    if (total < min) continue;
    const n = Math.ceil(total / max);
    const len = total / n;
    for (let i = 0; i < n; i++) {
      const c = s0 + len * (i + 0.5);
      const x = axis === 'x' ? c : fixed;
      const z = axis === 'x' ? fixed : c;
      make(out, x, z, axis === 'x' ? 0 : P2, len);
    }
  }
}

export const retWall = (h, batter = 0.05) => (o, x, z, ry, length) =>
  put(o, 'retaining', x, z, ry, { length, height: h, batter });

// A room at ground level: four `retaining` runs round the plot with a gap where each door goes.
// `retaining`, not `wallRun`, because a granary has no business with a crenellated parapet — and
// because a run of it is two orders of magnitude cheaper. `doors` are keyed by side and given in
// world coordinates along that side.
export function room(out, r, { h, batter = 0.05, max = 20, doors = {} }) {
  const g = side => (doors[side] || []).map(([at, w]) => [at - w / 2, at + w / 2]);
  const make = retWall(h, batter);
  const side = (axis, fixed, from, to, gaps) =>
    wallLine(out, { axis, fixed, from, to, gaps, max, min: WALL_MIN, make });
  side('x', r.z0, r.x0, r.x1, g('n'));
  side('x', r.z1, r.x0, r.x1, g('s'));
  side('z', r.x0, r.z0, r.z1, g('w'));
  side('z', r.x1, r.z0, r.z1, g('e'));
}

// A line of dwellings fronting a street at a fixed set-back, with a cheaper block behind every
// second one — the same trade the seeded districts make, authored.
//
// `real` is how many of the `n` get the full `house` builder, with its openings, quoins, dormer
// and door. The rest are `mass` — the same silhouette, the same lit windows, 190 triangles
// against a house's 6.5k. That ratio is a town's whole perf story; see
// docs/NOTES_A8_WHITEWALL.md.
//
// `stagger` pushes alternate plots that many metres further back off the street. A terrace wants
// 0; a village row of crofts does not stand in a line.
export function row(out, { axis, front, facing, from, to, n, w, d, h, back, real = 1, stagger = 0 }) {
  const step = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const along = from + step * (i + 0.5);
    const off = front + facing * (d / 2 + (i % 2 ? stagger : 0));
    const ry = axis === 'z'
      ? (facing < 0 ? P2 : -P2)
      : (facing < 0 ? 0 : Math.PI);
    const x = axis === 'z' ? off : along;
    const z = axis === 'z' ? along : off;
    const ww = Math.min(w, step - 1.5);
    const hh = h + (i % 3) * 1.5;
    // offset so the detailed one lands mid-row, where the street is looked along rather than at
    if ((i * real + (n >> 1)) % n < real) house(out, x, z, ry, ww, d, hh);
    else mass(out, x, z, ry, ww, d, hh);
    if (!back || i % 2) continue;
    const bx = axis === 'z' ? off + facing * (d / 2 + 5) : along;
    const bz = axis === 'z' ? along : off + facing * (d / 2 + 5);
    mass(out, bx, bz, ry, Math.min(w - 2, step - 3), 8, h - 1.5);
  }
}
