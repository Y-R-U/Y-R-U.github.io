import * as THREE from 'three';
import { arcSlab, arcWall, arcTube, box, cyl, D2R } from './geo.js';
import { addTree, addShrubs } from './foliage.js';
import { arcRailing } from './plaza.js';

// The curved, terraced "Atrium" wrapping the plaza's west side (ref 1's gold-cream balconies).
export function buildAtrium(ctx) {
  const { batch, M, col, layout } = ctx;
  const { cx, cz, th0, th1 } = layout.atrium;
  const T = new THREE.Matrix4().makeTranslation(cx, 0, cz);
  const add = (g, m, o = {}) => batch.add(g, m, { matrix: T, ...o });
  const tiers = [
    { face: 48.6, y0: 0, y1: 5.6, slabIn: 45.2 },
    { face: 49.8, y0: 6.4, y1: 11.2, slabIn: 46.8 },
    { face: 51.4, y0: 12.0, y1: 16.8, slabIn: 48.6 },
    { face: 53.2, y0: 17.6, y1: 22.4, slabIn: 50.4 },
    { face: 56.0, y0: 23.2, y1: 29.6, slabIn: 54.8 },
  ];
  const R1 = 66;
  tiers.forEach((t, i) => {
    // interior glow wall, glass skin with chrome mullions
    add(arcWall(t.face + 1.6, th0, th1, t.y0, t.y1, 72, true), i === 0 ? M.shopGlow : M.shopGlow, { cast: false });
    add(arcWall(t.face, th0, th1, t.y0 + 0.02, t.y1, 72, true), M.glassRail, { cast: false, reflect: false });
    const step = 2.2 / t.face;
    for (let a = th0 + step; a < th1; a += step) batch.put(box(0.08, t.y1 - t.y0, 0.12), M.chrome, new THREE.Vector3(cx + t.face * Math.sin(a), (t.y0 + t.y1) / 2, cz + t.face * Math.cos(a)), a, null, { cast: false });
    // slab above this tier
    const sy = t.y1, st = i === 4 ? 1.1 : 0.8;
    const next = tiers[i + 1];
    const slabIn = next ? next.slabIn : t.slabIn;
    add(arcSlab(slabIn, R1, th0, th1, sy, sy + st, 72), M.stoneUpper);
    add(arcWall(slabIn - 0.01, th0, th1, sy + st * 0.45, sy + st, 72, true), M.gold, { cast: false });
    add(arcTube(slabIn + 0.25, th0, th1, sy - 0.04, 0.07, 96), M.warmGlow, { cast: false });
    if (next || i === 4) {
      if (next) arcRailing(ctx, cx, cz, slabIn + 0.35, th0, th1, sy + st, 1.05);
      // balcony planters with trailing greenery
      const pr = slabIn + 1.2;
      for (let a = th0 + 0.05; a < th1 - 0.04; a += 7.5 / pr) {
        const x = cx + pr * Math.sin(a), z = cz + pr * Math.cos(a);
        batch.put(box(0.9, 0.5, 2.8), M.stoneUpper, new THREE.Vector3(x, sy + st + 0.25, z), a);
        addShrubs(batch, M, x, sy + st + 0.5, z, 2.6, 0.8, a + Math.PI / 2, (a * 100) | 0, 4);
      }
    }
  });
  // roof garden + crown
  for (let a = th0 + 0.06; a < th1; a += 9 / 58) addTree(batch, M, cx + 58.5 * Math.sin(a), 30.7, cz + 58.5 * Math.cos(a), (a * 50) | 0, 1.3);
  add(arcWall(64, th0, th1, 30.7, 33.2, 72, true), M.stoneUpper);
  add(arcTube(64, th0, th1, 33.2, 0.12, 96), M.gold);
  // gold ground-floor colonnade
  for (let a = th0 + 0.02; a < th1; a += 6 * D2R) {
    const x = cx + 46.2 * Math.sin(a), z = cz + 46.2 * Math.cos(a);
    batch.add(cyl(0.34, 0.4, 5.6, x, 0, z, 16), M.gold);
    batch.add(cyl(0.5, 0.5, 0.3, x, 0, z, 16), M.darkMetal);
    col.circle(x, z, 0.45, 'column');
  }
  // radial ribs through the tiers (structural fins)
  for (let a = th0 + 20 * D2R; a < th1 - 10 * D2R; a += 40 * D2R) {
    const rIn = 45.0, rOut = 60, len = rOut - rIn, rm = (rIn + rOut) / 2;
    batch.put(box(0.45, 30.5, len), M.stoneUpper, new THREE.Vector3(cx + rm * Math.sin(a), 15.25, cz + rm * Math.cos(a)), a);
    batch.put(box(0.5, 30.5, 0.35), M.gold, new THREE.Vector3(cx + rIn * Math.sin(a), 15.25, cz + rIn * Math.cos(a)), a);
  }
  // end walls, dressed as a facade on both faces (with free look they fill the frame from the terrace)
  for (const a of [th0, th1]) {
    const rm = 55, len = 20, ex = cx + rm * Math.sin(a), ez = cz + rm * Math.cos(a);
    const c = Math.cos(a), sn = Math.sin(a);
    const at = (lx, y, lz) => new THREE.Vector3(ex + lx * c + lz * sn, y, ez - lx * sn + lz * c);
    batch.put(box(1.2, 31, len), M.stone, at(0, 15.5, 0), a);
    for (const sd of [-1, 1]) {
      tiers.forEach((t, i) => {
        const h = t.y1 - t.y0 - 1.0;
        batch.put(box(0.1, h, len - 3), M.shopGlow, at(sd * 0.62, t.y0 + 0.3 + h / 2, 0), a, null, { cast: false });
        for (let z = -(len - 3) / 2; z <= (len - 3) / 2 + 0.01; z += (len - 3) / 7) batch.put(box(0.16, h, 0.14), M.chrome, at(sd * 0.68, t.y0 + 0.3 + h / 2, z), a, null, { cast: false });
        batch.put(box(0.6, 0.8, len + 0.4), M.stoneUpper, at(sd * 0.72, t.y1 + 0.4, 0), a);
        batch.put(box(0.62, 0.12, len + 0.42), M.gold, at(sd * 0.72, t.y1 + 0.06, 0), a, null, { cast: false });
        batch.put(box(0.06, 0.06, len - 3), M.warmGlow, at(sd * 1.0, t.y1 - 0.04, 0), a, null, { cast: false });
      });
      for (const z of [-len / 2, len / 2]) batch.put(box(0.5, 31.2, 0.5), M.gold, at(sd * 0.5, 15.6, z), a, null, { cast: false });
    }
  }
  col.arc(cx, cz, 47.9, 90, th0 - 0.01, th1 + 0.01, 'atrium');
}
