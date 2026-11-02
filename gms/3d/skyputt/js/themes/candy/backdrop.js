// Candy Land theme — backdrop set pieces: a candy castle (pastel towers with soft-serve striped roofs and
// gumball finials, a three-tier cake keep with a giant cherry, icing crenellations, giant lollipops and
// candy canes at the gate) on its own cake island, and small cake islands with lollipop groves, gumdrop
// hills, a giant cupcake, ice-cream cones, a standing donut or candy canes. Merged into buckets by the caller.
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { roundCake, roundDrips, spikes, CAKE } from './island.js';
import { lollipop, cupcake, gumdrop, candyCane, iceCream, donut, cottonTree, scaleUv, COLORS, POP_COLS, GUM_COLS } from './props.js';

const WALL = 0xffb4d4, WALL2 = 0xcdb4ff, WALL3 = 0x9ee4c0, ICING = 0xfffafc;
const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

function tower(b, M, x, z, y0, r, h, color, hi, glows) {
  const seg = hi ? 12 : 8;
  put(b, 'frost', new THREE.CylinderGeometry(r, r * 1.05, h, seg), color, M, mat(x, y0 + h / 2, z));
  // icing band + scalloped drip ring at the top
  put(b, 'frost', new THREE.CylinderGeometry(r * 1.12, r * 1.12, r * 0.35, seg), ICING, M, mat(x, y0 + h, z));
  put(b, 'frost', new THREE.TorusGeometry(r * 1.08, r * 0.1, 4, seg), ICING, M, mat(x, y0 + h - r * 0.2, z, Math.PI / 2, 0, 0));
  // soft-serve roof: a candy-striped cone with spiral stripes, and a gumball on top
  const rh = r * 3.0;
  const cone = new THREE.ConeGeometry(r * 1.25, rh, seg, 1);
  scaleUv(cone, 4, 1.5);
  put(b, 'candy', cone, null, M, mat(x, y0 + h + r * 0.17 + rh / 2, z), true);
  put(b, 'gloss', new THREE.SphereGeometry(r * 0.32, 10, 8), POP_COLS[Math.abs(Math.round(x * 3 + z)) % POP_COLS.length], M, mat(x, y0 + h + r * 0.17 + rh + r * 0.2, z));
  // windows (heart-ish: round), facing +z
  const rows = Math.max(1, Math.floor(h / (r * 2.4)));
  for (let i = 0; i < rows; i++) {
    const wy = y0 + h * (0.3 + 0.55 * (i + 0.5) / rows);
    put(b, 'win', new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.08, 10), null, M, mat(x, wy, z + r * 0.99, Math.PI / 2, 0, 0));
    put(b, 'frost', new THREE.TorusGeometry(r * 0.25, r * 0.05, 4, 12), ICING, M, mat(x, wy, z + r * 1.0));
    if (glows && i === rows - 1) glows.push(new THREE.Vector3(x, wy, z + r * 1.1).applyMatrix4(M));
  }
}

/** Candy castle at local origin facing +z, ~24 m tall. Returns glow points (world). */
export function buildCastle(b, M, hi) {
  const r = rng(707);
  const glows = [];
  const seg = hi ? 18 : 12;
  // keep: three-tier cake with frosting drips and a giant cherry
  const tiers = [[5.2, 3.2, 0xfff0dc], [4.0, 3.0, 0xffc0da], [2.8, 2.8, 0xe8d4ff]];
  let y = 1.0;
  tiers.forEach(([R, H, c], k) => {
    put(b, 'frost', new THREE.CylinderGeometry(R, R, H, seg), c, M, mat(0, y + H / 2, -1.5));
    put(b, 'frost', new THREE.TorusGeometry(R, 0.22, 5, seg), ICING, M, mat(0, y + H, -1.5, Math.PI / 2, 0, 0));
    const nd = hi ? 10 : 6;
    for (let i = 0; i < nd; i++) {
      const a = (i / nd) * Math.PI * 2 + k * 0.4, l = 0.4 + r() * 1.1;
      put(b, 'frost', new THREE.CapsuleGeometry(0.16, l, 1, 5), ICING, M, mat(Math.cos(a) * R * 1.0, y + H - l / 2 - 0.1, -1.5 + Math.sin(a) * R * 1.0));
    }
    // pearl dots round the base
    for (let i = 0; i < (hi ? 12 : 8); i++) {
      const a = (i / (hi ? 12 : 8)) * Math.PI * 2;
      put(b, 'gloss', new THREE.SphereGeometry(0.2, 6, 4), POP_COLS[(i + k) % POP_COLS.length], M, mat(Math.cos(a) * R * 1.02, y + 0.2, -1.5 + Math.sin(a) * R * 1.02));
    }
    y += H;
  });
  put(b, 'frost', new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ICING, M, mat(0, y, -1.5, 0, 0, 0, [1, 0.6, 1]));
  put(b, 'gloss', new THREE.SphereGeometry(1.15, 14, 10), COLORS.cherry, M, mat(0, y + 1.6, -1.5));
  put(b, 'vc', new THREE.CylinderGeometry(0.08, 0.12, 1.6, 5), 0x5a7a2a, M, mat(0.3, y + 3.1, -1.5, 0, 0, -0.35));
  glows.push(new THREE.Vector3(0, y + 1.6, -1.5).applyMatrix4(M));
  // front hall with icing crenellations, chocolate door
  put(b, 'frost', new THREE.BoxGeometry(8.4, 4.2, 3.2), WALL, M, mat(0, 3.1, 3.6));
  for (let i = 0; i < 9; i++) put(b, 'frost', new THREE.BoxGeometry(0.6, 0.6, 3.3), i % 2 ? ICING : 0xffe36e, M, mat(-4 + i, 5.5, 3.6));
  put(b, 'gloss', new THREE.CylinderGeometry(1.0, 1.0, 0.2, 16, 1, false, -Math.PI / 2, Math.PI), COLORS.choc, M, mat(0, 2.6, 5.22, Math.PI / 2, 0, 0));
  put(b, 'gloss', new THREE.BoxGeometry(2.0, 1.6, 0.2), COLORS.choc, M, mat(0, 1.8, 5.22));
  put(b, 'frost', new THREE.TorusGeometry(1.1, 0.13, 5, 14, Math.PI), ICING, M, mat(0, 2.6, 5.32));
  glows.push(new THREE.Vector3(0, 2.4, 5.6).applyMatrix4(M));
  for (const x of [-3.0, -1.8, 1.8, 3.0]) {
    put(b, 'win', new THREE.CylinderGeometry(0.34, 0.34, 0.1, 10), null, M, mat(x, 3.6, 5.22, Math.PI / 2, 0, 0));
    put(b, 'frost', new THREE.TorusGeometry(0.38, 0.07, 4, 12), ICING, M, mat(x, 3.6, 5.28));
  }
  // towers
  const T = [[-5.4, 3.4, 1.25, 9, WALL2], [5.4, 3.4, 1.25, 9, WALL3], [-4.2, -4.6, 1.0, 13, WALL], [4.2, -4.6, 1.0, 13, WALL2],
    [-8.0, -0.4, 0.9, 7, WALL3], [8.0, -0.4, 0.9, 7, WALL], [-6.8, 6.2, 0.7, 5, WALL], [6.8, 6.2, 0.7, 5, WALL2]];
  for (const [x, z, rr, h, c] of T) tower(b, M, x, z, 1.0, rr, h, c, hi, glows);
  // curtain walls (wafer pink) with icing tops
  const wallSeg = (x0, z0, x1, z1, h, t) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    put(b, 'frost', new THREE.BoxGeometry(len, h, t), 0xf4a6c4, M, mat(cx, 1.0 + h / 2, cz, 0, -ang, 0));
    put(b, 'frost', new THREE.BoxGeometry(len * 1.02, 0.35, t * 1.3), ICING, M, mat(cx, 1.0 + h + 0.12, cz, 0, -ang, 0));
  };
  wallSeg(-5.4, 3.4, -6.8, 6.2, 3.0, 0.7);
  wallSeg(5.4, 3.4, 6.8, 6.2, 3.0, 0.7);
  wallSeg(-8.0, -0.4, -5.4, 3.4, 3.4, 0.7);
  wallSeg(8.0, -0.4, 5.4, 3.4, 3.4, 0.7);
  wallSeg(-8.0, -0.4, -4.2, -4.6, 3.6, 0.7);
  wallSeg(8.0, -0.4, 4.2, -4.6, 3.6, 0.7);
  // giant lollipops and candy canes at the gate, gumdrops and cotton-candy trees round the terrace
  lollipop(b, M.clone().multiply(mat(-2.6, 1.0, 7.6)), 4.4, 1.2, 0xff4f9a, { bow: true });
  lollipop(b, M.clone().multiply(mat(2.6, 1.0, 7.6)), 4.0, 1.1, 0x4cc9f0, { bow: true });
  candyCane(b, M.clone().multiply(mat(-4.4, 1.0, 8.4, 0, 0.3, 0)), 2.4, 0.14, 2);
  candyCane(b, M.clone().multiply(mat(4.4, 1.0, 8.4, 0, Math.PI - 0.3, 0)), 2.4, 0.14, 2);
  for (let i = 0; i < (hi ? 9 : 5); i++) {
    const a = 0.3 + (i / 9) * Math.PI * 1.4 - Math.PI * 0.2, d = 8.6 + r() * 1.2;
    gumdrop(b, M.clone().multiply(mat(Math.cos(a) * d, 1.0, Math.sin(a) * d)), 0.5 + r() * 0.5, GUM_COLS[i % GUM_COLS.length], !hi);
  }
  for (const [x, z, s, c] of [[-9.2, 2.6, 3.4, 0xffa6d2], [9.2, 3.0, 3.0, 0xa6dcff], [-8.6, 6.4, 2.6, 0xc6b4ff], [8.8, 7.0, 2.4, 0xffc4e6]]) {
    cottonTree(b, M.clone().multiply(mat(x, 1.0, z)), s, c, r, true);
  }
  return glows;
}

/** Small cake island with sweets. kind: 'lollipops' | 'gumdrops' | 'cupcake' | 'icecream' | 'donut' | 'canes'. Returns glow points. */
export function buildIsle(b, cakes, drips, M0, lp, R, D, kind, seed, hi) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const { geometry, L } = roundCake(R, D, seed, hi);
  geometry.applyMatrix4(M);
  cakes.push(geometry);
  const sp = []; spikes(sp, 0, -L * 1.5, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); cakes.push(g); }
  roundDrips(drips, M, R, L, hi ? 14 : 7, seed + 3);
  const at = (rad, ry = null) => { const a = r() * Math.PI * 2, d = R * rad * (0.3 + r() * 0.7); return M.clone().multiply(mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, ry ?? r() * 6.28, 0)); };
  const toward = (Mx) => Mx;   // lollipops face +z of the view frame already (M0 is the view basis)
  const lo = true;
  const nG = 1 + (r() * 2 | 0);
  for (let i = 0; i < nG; i++) gumdrop(b, at(0.8), R * (0.08 + r() * 0.06), GUM_COLS[(seed + i) % GUM_COLS.length], true);
  if (kind === 'lollipops') for (let i = 0; i < (hi ? 4 : 3); i++) { const Mx = at(0.6, 0); lollipop(b, toward(Mx), R * (0.6 + r() * 0.5), R * (0.16 + r() * 0.06), POP_COLS[(seed + i) % POP_COLS.length], { lo }); }
  if (kind === 'gumdrops') for (let i = 0; i < (hi ? 6 : 4); i++) gumdrop(b, at(0.6), R * (0.15 + r() * 0.15), GUM_COLS[(seed + i * 3) % GUM_COLS.length], true);
  if (kind === 'cupcake') { cupcake(b, M.clone(), R * 1.1, { rnd: r, lo }); for (let i = 0; i < 2; i++) cottonTree(b, at(0.8), R * 0.6, 0xffb4dc, r, true); }
  if (kind === 'icecream') for (let i = 0; i < (hi ? 3 : 2); i++) iceCream(b, at(0.5), R * (0.6 + r() * 0.4), { rnd: r, lo });
  if (kind === 'donut') { donut(b, M.clone().multiply(mat(0, 0, 0)), R * 0.6, { stand: true, rnd: r, lo, icing: 0xff7ab4 }); }
  if (kind === 'canes') for (let i = 0; i < (hi ? 5 : 3); i++) candyCane(b, at(0.7), R * (0.5 + r() * 0.3), R * 0.035, 2);
  if (kind !== 'cupcake' && kind !== 'gumdrops') for (let i = 0; i < 2; i++) cottonTree(b, at(0.85), R * (0.4 + r() * 0.3), [0xffa6d2, 0xa6dcff][i], r, true);
  return [];
}

export { CAKE };
