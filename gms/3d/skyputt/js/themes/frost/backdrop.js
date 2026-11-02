// Frost Fair theme — backdrop set pieces: an ice palace on its crag (warm windows, wreath, giant tree,
// fairy lights), and small snowy crags with Christmas trees / a giant snowman / presents / a gingerbread
// village / candy canes. Merged into buckets by the caller.
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { roundRock, spikes } from './island.js';
import { christmasTree, snowyPine, snowman, presentPile, candyCane, gingerbreadHouse, wreath, icicleRow, BULB_COLS } from './props.js';

const ICE = 0xf0f0fa, ICE2 = 0xd0d8f2, ROOF = 0x5a7ec4, ROOF2 = 0x4a68b0, SNOW = 0xf4f8ff;

const put = (b, key, geo, color, M, local) => b.add(key, geo, color, local ? M.clone().multiply(local) : M);

function spire(b, M, x, z, y0, r, h, hi, glows, opts = {}) {
  const seg = hi ? 10 : 7;
  put(b, 'vc', new THREE.CylinderGeometry(r, r * 1.06, h, seg), opts.stone ?? ICE, M, mat(x, y0 + h / 2, z));
  put(b, 'metal', new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.2 * r + 0.06, seg), 0xe8b84a, M, mat(x, y0 + h, z));
  const rh = opts.roofH ?? r * 3.4;
  put(b, 'vc', new THREE.ConeGeometry(r * 1.2, rh, seg), opts.roof ?? ROOF, M, mat(x, y0 + h + rh / 2 + 0.05, z));
  // snow on the roof tip half
  put(b, 'snow', new THREE.ConeGeometry(r * 0.62, rh * 0.5, seg), SNOW, M, mat(x, y0 + h + rh * 0.76 + 0.05, z));
  put(b, 'metal', new THREE.ConeGeometry(r * 0.1, r * 1.1, 5), 0xe8b84a, M, mat(x, y0 + h + rh + r * 0.5, z));
  const rows = Math.max(1, Math.floor(h / (r * 2.3)));
  for (let i = 0; i < rows; i++) {
    const wy = y0 + h * (0.32 + 0.58 * (i + 0.5) / rows);
    put(b, 'win', new THREE.BoxGeometry(r * 0.3, r * 0.6, 0.08), null, M, mat(x, wy, z + r * 0.99));
    if (glows && i === rows - 1) glows.push(new THREE.Vector3(x, wy, z + r * 1.1).applyMatrix4(M));
  }
}

/** Ice palace at local origin facing +z, ~24 m tall. Returns glow points (world). */
export function buildPalace(b, M, hi) {
  const r = rng(1224);
  const glows = [];
  put(b, 'snow', new THREE.CylinderGeometry(10, 10.4, 1.0, hi ? 20 : 12), SNOW, M, mat(0, 0.5, 0));
  for (let i = 0; i < 4; i++) put(b, 'snow', new THREE.BoxGeometry(3.2 - i * 0.3, 0.25, 0.6), SNOW, M, mat(0, 1.0 + i * 0.25, 7.6 - i * 0.6));
  // great hall + keep
  put(b, 'vc', new THREE.BoxGeometry(9, 5, 3.6), ICE, M, mat(0, 3.5, 3.4));
  put(b, 'vc', new THREE.ConeGeometry(5.8, 3, 4), ROOF2, M, mat(0, 7.5, 3.4, 0, Math.PI / 4, 0, [1, 1, 0.42]));
  put(b, 'snow', new THREE.ConeGeometry(4.2, 1.6, 4), SNOW, M, mat(0, 8.3, 3.4, 0, Math.PI / 4, 0, [1, 1, 0.42]));
  put(b, 'vc', new THREE.BoxGeometry(7, 8.5, 6), ICE2, M, mat(0, 5.2, -1.2));
  put(b, 'vc', new THREE.ConeGeometry(5.2, 4.2, 4), ROOF, M, mat(0, 11.5, -1.2, 0, Math.PI / 4, 0));
  put(b, 'snow', new THREE.ConeGeometry(3.4, 2.2, 4), SNOW, M, mat(0, 12.5, -1.2, 0, Math.PI / 4, 0));
  // gate, windows, rose window
  put(b, 'win', new THREE.BoxGeometry(1.6, 2.4, 0.1), null, M, mat(0, 2.2, 5.25));
  put(b, 'metal', new THREE.TorusGeometry(0.85, 0.12, 6, 12, Math.PI), 0xe8b84a, M, mat(0, 3.4, 5.27));
  wreath(b, M.clone().multiply(mat(0, 4.7, 5.3)), 0.75, 14);
  glows.push(new THREE.Vector3(0, 2.4, 5.6).applyMatrix4(M));
  for (const x of [-3.2, -1.8, 1.8, 3.2]) put(b, 'win', new THREE.BoxGeometry(0.5, 1.2, 0.1), null, M, mat(x, 3.6, 5.25));
  put(b, 'win', new THREE.CylinderGeometry(1.0, 1.0, 0.1, 12), null, M, mat(0, 7.0, 1.85, Math.PI / 2, 0, 0));
  glows.push(new THREE.Vector3(0, 7.0, 2.2).applyMatrix4(M));
  for (const x of [-2.2, 2.2]) for (const y of [6.2, 8.4]) put(b, 'win', new THREE.BoxGeometry(0.55, 1.1, 0.1), null, M, mat(x, y, 1.85));
  // icicles along the hall eaves
  icicleRow(b, M.clone().multiply(mat(0, 6.0, 5.3)), 9, 0.9, hi ? 18 : 9, r);
  // spires
  spire(b, M, 0, -1.6, 9.5, 1.5, 7.5, hi, glows, { roofH: 7, roof: ROOF2, stone: ICE2 });
  const T = [[-5.4, 3.0, 1.2, 10], [5.4, 3.0, 1.2, 10], [-3.8, -4.0, 1.0, 14], [3.8, -4.0, 1.0, 14],
    [-8.2, -0.6, 0.9, 7.5], [8.2, -0.6, 0.9, 7.5], [-6.6, 5.8, 0.7, 5.5], [6.6, 5.8, 0.7, 5.5]];
  for (const [x, z, rr, h] of T) spire(b, M, x, z, 1.0, rr, h, hi, glows);
  for (const [x, z] of [[-3.4, 2.0], [3.4, 2.0], [-3.4, -4.0], [3.4, -4.0]]) spire(b, M, x, z, 9.4, 0.55, 2.2, hi, null, { roof: ROOF2 });
  // curtain walls with snowy tops and a string of fairy lights
  const wallSeg = (x0, z0, x1, z1, h, t) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    put(b, 'vc', new THREE.BoxGeometry(len, h, t), ICE2, M, mat(cx, 1.0 + h / 2, cz, 0, -ang, 0));
    put(b, 'snow', new THREE.BoxGeometry(len * 1.02, 0.3, t * 1.25), SNOW, M, mat(cx, 1.0 + h + 0.12, cz, 0, -ang, 0));
    const n = Math.max(2, Math.floor(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const u = i / n - 0.5, sag = Math.sin((i / n) * Math.PI * 3) * 0.15;
      put(b, i % 2 ? 'bulbA' : 'bulbB', new THREE.OctahedronGeometry(0.12, 0), BULB_COLS[i % BULB_COLS.length], M,
        mat(cx + Math.cos(ang) * u * len, 1.0 + h - 0.35 - Math.abs(sag), cz + Math.sin(ang) * u * len + t * 0.55));
    }
  };
  wallSeg(-5.4, 3.0, -6.6, 5.8, 3.2, 0.7);
  wallSeg(5.4, 3.0, 6.6, 5.8, 3.2, 0.7);
  wallSeg(-6.6, 5.8, -1.0, 5.8, 2.4, 0.6);
  wallSeg(1.0, 5.8, 6.6, 5.8, 2.4, 0.6);
  wallSeg(-8.2, -0.6, -5.4, 3.0, 3.6, 0.7);
  wallSeg(8.2, -0.6, 5.4, 3.0, 3.6, 0.7);
  // giant decorated tree beside the gate, presents at its foot, snowy pines around the terrace
  glows.push(...christmasTree(b, M.clone().multiply(mat(-7.8, 1.0, 6.6)), 7.5, { detail: 1, rnd: r }));
  presentPile(b, M.clone().multiply(mat(-6.2, 1.0, 8.2)), 0.9, r, 4, 0);
  presentPile(b, M.clone().multiply(mat(2.6, 1.0, 7.6)), 0.7, r, 3, 0);
  for (const [x, z, s] of [[8.4, 5.6, 4.2], [9.0, 2.6, 3.4], [-9.2, 1.8, 3.6], [7.2, 8.0, 2.6]]) snowyPine(b, M.clone().multiply(mat(x, 1.0, z, 0, r() * 6, 0)), s, hi ? 8 : 6);
  candyCane(b, M.clone().multiply(mat(-1.8, 1.0, 8.3, 0, 0.3, 0)), 1.6, 0.09, 2);
  candyCane(b, M.clone().multiply(mat(1.8, 1.0, 8.3, 0, Math.PI - 0.3, 0)), 1.6, 0.09, 2);
  return glows;
}

/** Small snowy crag with decor. kind: 'trees' | 'snowman' | 'presents' | 'village' | 'canes'. Returns glow points. */
export function buildCrag(b, rocks, ices, M0, lp, R, D, kind, seed, hi) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const rock = roundRock(R, D, seed, hi);
  rock.applyMatrix4(M);
  rocks.push(rock);
  const sp = []; spikes(sp, 0, -D * 0.1, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  // icicles round the rim
  const nI = hi ? 18 : 8;
  for (let i = 0; i < nI; i++) {
    const a = (i / nI) * Math.PI * 2 + r() * 0.3, l = R * (0.15 + r() * 0.35);
    const g = new THREE.ConeGeometry(l * 0.14, l, 5, 1, true);
    g.rotateX(Math.PI); g.translate(Math.cos(a) * R * 0.92, -0.25 - l / 2, Math.sin(a) * R * 0.92);
    g.applyMatrix4(M);
    ices.push(g);
  }
  const glows = [];
  const at = (rad, ry = null) => { const a = r() * Math.PI * 2, d = R * rad * (0.3 + r() * 0.7); return M.clone().multiply(mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, ry ?? r() * 6.28, 0)); };
  const nP = kind === 'trees' ? 3 + (r() * 3 | 0) : 1 + (r() * 2 | 0);
  for (let i = 0; i < nP; i++) snowyPine(b, at(0.75), R * (0.5 + r() * 0.5), hi ? 7 : 5);
  if (kind === 'trees') glows.push(...christmasTree(b, M.clone().multiply(mat(0, 0, 0)), R * 1.1, { detail: 0, rnd: r }));
  if (kind === 'snowman') { snowman(b, M.clone().multiply(mat(0, 0, 0, 0, 0, 0)), R * 1.3, { detail: hi ? 1 : 0 }); presentPile(b, at(0.6), R * 0.18, r, 3, 0); }
  if (kind === 'presents') { for (let i = 0; i < (hi ? 3 : 2); i++) presentPile(b, at(0.55), R * (0.14 + r() * 0.06), r, 4, 0); glows.push(...christmasTree(b, at(0.4), R * 0.8, { detail: 0, rnd: r })); }
  if (kind === 'village') for (let i = 0; i < (hi ? 3 : 2); i++) gingerbreadHouse(b, at(0.55), R * 0.36, R * 0.42, R * 0.28, r);
  if (kind === 'canes') for (let i = 0; i < (hi ? 5 : 3); i++) candyCane(b, at(0.7), R * (0.4 + r() * 0.3), R * 0.03, 2);
  return glows;
}
