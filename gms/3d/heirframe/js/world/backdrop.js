import * as THREE from 'three';
import { box, cyl } from './geo.js';
import { addTree } from './foliage.js';

// Mid-distance architecture so every camera yaw has something to look at (D16 free look):
// terraced residences south of the terrace, and stepped towers on the east bank.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Stepped building centred on (x, z), front facing `rot` (0 = +Z). tiers: [{h, glass, warm, setback, garden}]
export function tiered(ctx, x, y0, z, w, d, rot, tiers, seed = 1) {
  const { batch, M } = ctx;
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let y = y0, inset = 0;
  tiers.forEach((t, i) => {
    const tw = w - inset * 2, td = d - inset * 2;
    const mat = t.glass ? (t.warm ? M.facadeWarm : M.facade) : M.stoneUpper;
    batch.put(box(tw, t.h, td), mat, V(x, y + t.h / 2, z), rot, null, { cast: false });
    batch.put(box(tw + 0.5, 0.6, td + 0.5), M.stoneUpper, V(x, y + t.h + 0.3, z), rot, null, { cast: false });
    const [fx, fz] = at(0, td / 2 + 0.26);
    batch.put(box(tw + 0.5, 0.1, 0.06), i % 2 ? M.gold : M.warmGlow, V(fx, y + t.h + 0.5, fz), rot, null, { cast: false });
    if (!t.glass) {
      // stone tiers get rows of lit balcony slots
      for (let k = 1; k < t.h / 4.2; k++) {
        const [bx, bz] = at(0, td / 2 + 0.02);
        batch.put(box(tw * 0.86, 1.6, 0.1), M.shopGlow, V(bx, y + k * 4.2 - 1.2, bz), rot, null, { cast: false });
        batch.put(box(tw * 0.9, 0.16, 1.2), M.stoneUpper, V(...at3(at(0, td / 2 + 0.5), y + k * 4.2 - 2.1)), rot, null, { cast: false });
      }
    }
    y += t.h + 0.6;
    inset += t.setback || 0;
    if (t.garden) {
      const n = Math.max(1, Math.floor((w - inset * 2) / 6));
      for (let k = 0; k < n; k++) {
        const [tx, tz] = at((k - (n - 1) / 2) * 6, (d - inset * 2) / 2 - 2);
        addTree(ctx.batch, M, tx, y, tz, seed * 31 + k, 1.2);
      }
    }
  });
  return y;
}
const at3 = ([x, z], y) => [x, y, z];

export function buildBackdrop(ctx) {
  const { batch, M } = ctx;
  // South: a crescent of terraced residences rising behind the terrace wall.
  const south = [
    [-52, 112, 30, 24, [{ h: 12 }, { h: 16, glass: true, warm: true, setback: 2, garden: true }, { h: 14, glass: true, setback: 3 }]],
    [-18, 124, 34, 26, [{ h: 14 }, { h: 22, glass: true, setback: 2, garden: true }, { h: 20, glass: true, warm: true, setback: 3, garden: true }, { h: 14, glass: true }]],
    [20, 118, 30, 24, [{ h: 12 }, { h: 18, glass: true, warm: true, setback: 2 }, { h: 12, glass: true, setback: 3, garden: true }]],
    [54, 106, 26, 22, [{ h: 10 }, { h: 14, glass: true, setback: 2, garden: true }]],
    [-86, 96, 26, 22, [{ h: 10 }, { h: 12, glass: true, warm: true, setback: 2, garden: true }]],
  ];
  south.forEach(([x, z, w, d, tiers], i) => tiered(ctx, x, 0, z, w, d, Math.PI + (x > 0 ? 0.12 : -0.12), tiers, i + 1));
  // two slender gold-crowned spires anchoring the south view
  for (const [x, z, h] of [[-36, 150, 96], [40, 146, 78]]) {
    batch.add(cyl(5.5, 7, h, x, 0, z, 16), M.facade, { cast: false });
    for (let y = 18; y < h; y += 18) batch.add(cyl(7.4, 7.4, 1.2, x, y, z, 16), M.stoneUpper, { cast: false });
    batch.add(cyl(0.3, 5.5, 22, x, h, z, 12), M.goldSolid, { cast: false });
  }
}
