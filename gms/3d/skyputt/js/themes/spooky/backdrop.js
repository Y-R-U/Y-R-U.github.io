// Spooky Hollow theme — backdrop set pieces: haunted mansion on a floating crag, the skull rock with its
// lava fall, small crags with graves / dead trees / a broken tower. Merged into buckets by the caller.
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { roundRock, spikes } from './island.js';
import { pumpkin, gravestone, deadTree, fence, skull, COLORS } from './props.js';

const STONE = 0x3e3850, STONE2 = 0x2e2a3c, ROOF = 0x261a3c, ROOF2 = 0x1c1430, TRIM = 0x5a4a6a;

const put = (b, key, geo, color, M, local) => b.add(key, geo, color, local ? M.clone().multiply(local) : M);

function spireTower(b, M, x, z, y0, r, h, hi, rnd) {
  const seg = hi ? 8 : 6;
  put(b, 'vc', new THREE.CylinderGeometry(r, r * 1.08, h, seg), STONE, M, mat(x, y0 + h / 2, z));
  put(b, 'vc', new THREE.CylinderGeometry(r * 1.15, r * 1.15, r * 0.3, seg), TRIM, M, mat(x, y0 + h, z));
  const rh = r * (3.6 + rnd() * 1.4);
  put(b, 'vc', new THREE.ConeGeometry(r * 1.22, rh, seg), ROOF, M, mat(x, y0 + h + r * 0.15 + rh / 2, z, 0, 0, (rnd() - 0.5) * 0.08));
  put(b, 'metal', new THREE.ConeGeometry(r * 0.08, r * 1.3, 4), COLORS.iron, M, mat(x, y0 + h + rh + r * 0.6, z));
  const rows = Math.max(1, Math.floor(h / (r * 2.4)));
  for (let i = 0; i < rows; i++) {
    const wy = y0 + h * (0.3 + 0.6 * (i + 0.5) / rows);
    if (rnd() < 0.8) put(b, rnd() < 0.15 ? 'green' : 'win', new THREE.BoxGeometry(r * 0.3, r * 0.6, 0.08), null, M, mat(x, wy, z + r * 0.99));
  }
}

function gableHouse(b, M, x, z, y0, w, h, d, hi, rnd) {
  put(b, 'vc', new THREE.BoxGeometry(w, h, d), STONE, M, mat(x, y0 + h / 2, z));
  put(b, 'vc', new THREE.BoxGeometry(w * 1.04, h * 0.05, d * 1.04), TRIM, M, mat(x, y0 + h, z));
  // steep roof: a 4-sided cone stretched along x
  const rh = w * 0.75;
  put(b, 'vc', new THREE.ConeGeometry(Math.max(w, d) * 0.74, rh, 4), ROOF2, M, mat(x, y0 + h + rh / 2, z, 0, Math.PI / 4, 0, [w / Math.max(w, d) * 1.02, 1, d / Math.max(w, d) * 1.02]));
  // windows facing +z, a grid with gothic tops
  const cols = Math.max(1, Math.floor(w / 1.1)), rows = Math.max(1, Math.floor(h / 1.6));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (rnd() < 0.18) continue;
    const wx = x - w / 2 + (i + 0.5) * w / cols, wy = y0 + (j + 0.55) * h / rows;
    const key = rnd() < 0.12 ? 'green' : 'win';
    put(b, key, new THREE.BoxGeometry(0.42, 0.8, 0.06), null, M, mat(wx, wy, z + d / 2 + 0.02));
    put(b, key, new THREE.ConeGeometry(0.3, 0.3, 4), null, M, mat(wx, wy + 0.53, z + d / 2 + 0.02, 0, Math.PI / 4, 0, [1, 1, 0.2]));
  }
  // chimney
  if (hi) put(b, 'vc', new THREE.BoxGeometry(0.5, rh * 0.8, 0.5), STONE2, M, mat(x + w * 0.3, y0 + h + rh * 0.45, z - d * 0.2));
}

/** Haunted mansion at local origin facing +z, ~20 m tall. */
export function buildMansion(b, M, hi) {
  const r = rng(404);
  put(b, 'vc', new THREE.CylinderGeometry(9.5, 10, 1.0, hi ? 18 : 10), STONE2, M, mat(0, 0.5, 0));
  // stairs to the door
  for (let i = 0; i < 4; i++) put(b, 'vc', new THREE.BoxGeometry(3 - i * 0.3, 0.25, 0.6), STONE2, M, mat(0, 1.0 + i * 0.25, 6.4 - i * 0.6));
  gableHouse(b, M, 0, 1.5, 1, 8, 7, 5, hi, r);           // main hall
  gableHouse(b, M, -6.2, 0.5, 1, 4.2, 5, 4, hi, r);      // wings
  gableHouse(b, M, 6.2, 0.5, 1, 4.2, 5.6, 4, hi, r);
  gableHouse(b, M, 0, -2.8, 8, 5, 4, 3.5, hi, r);        // upper storey
  // door
  put(b, 'win', new THREE.BoxGeometry(1.3, 2.0, 0.08), null, M, mat(0, 2.0, 4.06));
  put(b, 'vc', new THREE.TorusGeometry(0.7, 0.14, 5, 10, Math.PI), TRIM, M, mat(0, 3.0, 4.08));
  // towers
  for (const [x, z, y0, rr, h] of [[-4.2, 3.9, 1, 1.0, 10], [4.2, 3.9, 1, 1.0, 12], [-8.3, -1.5, 1, 0.8, 8], [8.3, -1.5, 1, 0.8, 9.5],
    [0, -1.5, 12, 0.9, 5], [-2.6, -2.8, 12, 0.5, 3], [2.6, -2.8, 12, 0.5, 3.4]]) spireTower(b, M, x, z, y0, rr, h, hi, r);
  // fence across the front terrace with a gate gap
  const at = (x, z) => new THREE.Vector3(x, 1.0, z).applyMatrix4(M);
  const S = new THREE.Vector3(); M.decompose(new THREE.Vector3(), new THREE.Quaternion(), S);
  if (hi) {
    const fb = { add: (k, g, c, m) => b.add(k, g, c, m) };
    // fence() works in world space (scale 1) — draw it bigger by scaling height and spacing
    fence(fb, at(-9, 7.2), at(-1.6, 7.2), 1.6, 0.5);
    fence(fb, at(1.6, 7.2), at(9, 7.2), 1.6, 0.5);
  }
  // dead trees + pumpkins on the terrace
  for (const [x, z, s] of [[-8, 5, 5], [8.5, 4.5, 4.4]]) deadTree(b, M.clone().multiply(mat(x, 1, z)), s, r);
  for (const [x, z] of [[-1.7, 6.6], [1.7, 6.6], [-3, 5.2], [3.2, 5.3]]) pumpkin(b, M.clone().multiply(mat(x, 1, z)), 0.45, { seg: 10 });
}

/** The skull rock: a giant skull on a crag, lava pouring from its mouth (fall spot returned). */
export function buildSkullRock(b, rocks, M, R, D, hi) {
  const rock = roundRock(R, D, 77, hi);
  rock.applyMatrix4(M);
  rocks.push(rock);
  const sp = []; spikes(sp, 0, -D * 0.1, 0, R, D, hi ? 4 : 2, 78);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  const s = R * 0.6;
  skull(b, M.clone().multiply(mat(0, -0.2, -R * 0.1, -0.08, 0, 0)), s, 'ember', 'vc', 0xb0a6a0);
  // smaller skulls piled at its feet
  const r = rng(12);
  for (let i = 0; i < (hi ? 5 : 2); i++) {
    const a = (r() - 0.5) * 2.2;
    skull(b, M.clone().multiply(mat(Math.sin(a) * R * 0.75, -0.05, Math.cos(a) * R * 0.6, 0, a + (r() - 0.5), 0)), R * (0.08 + r() * 0.06), r() < 0.5 ? 'ember' : null, 'vc', 0xb8ae9c);
  }
  deadTree(b, M.clone().multiply(mat(-R * 0.7, 0, -R * 0.3)), R * 0.9, r);
  // lava fall spot: from the jaw, out over the front edge
  // a glowing stream runs from the jaw to the crag edge, then falls
  const z0 = -R * 0.1 + s * 0.7, z1 = R * 0.92;
  put(b, 'ember', new THREE.BoxGeometry(s * 0.45, 0.06, z1 - z0), null, M, mat(0, 0.02, (z0 + z1) / 2));
  put(b, 'ember', new THREE.BoxGeometry(s * 0.4, s * 0.35, 0.1), null, M, mat(0, s * 0.15, z0, -0.5, 0, 0));
  const lip = new THREE.Vector3(0, -0.05, z1).applyMatrix4(M);
  const dir = new THREE.Vector3(0, 0, 1).transformDirection(M).setY(0).normalize();
  return { p: lip, dir, width: s * 0.55, length: D * 1.6 + 6 };
}

/** Small crag with decor. kind: 'graves' | 'trees' | 'tower' | 'pumpkins' */
export function buildCrag(b, rocks, M0, lp, R, D, kind, seed, hi) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const rock = roundRock(R, D, seed, hi);
  rock.applyMatrix4(M);
  rocks.push(rock);
  const sp = []; spikes(sp, 0, -D * 0.1, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  const at = (rad) => { const a = r() * Math.PI * 2, d = R * rad * (0.3 + r() * 0.7); return M.clone().multiply(mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, r() * 0.6 - 0.3, 0)); };
  const nT = kind === 'trees' ? 3 + (r() * 3 | 0) : 1 + (r() * 2 | 0);
  for (let i = 0; i < nT; i++) deadTree(b, at(0.7), R * (0.6 + r() * 0.5), r, COLORS.bark, 2);
  if (kind === 'graves') for (let i = 0; i < (hi ? 7 : 4); i++) gravestone(b, at(0.7).multiply(mat(0, 0, 0, (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2)), R * (0.14 + r() * 0.08), (r() * 3) | 0);
  if (kind === 'pumpkins' || kind === 'graves') for (let i = 0; i < (hi ? 4 : 2); i++) pumpkin(b, at(0.6), R * (0.06 + r() * 0.05), { seg: 10 });
  if (kind === 'tower') {
    const tr = Math.min(R * 0.26, 1.3), h = R * 1.5;
    put(b, 'vc', new THREE.CylinderGeometry(tr, tr * 1.1, h, 8), STONE, M, mat(0, h / 2, 0, 0, 0, 0.06));
    put(b, 'vc', new THREE.ConeGeometry(tr * 1.25, tr * 3.2, 8), ROOF, M, mat(Math.sin(0.06) * -h, h + tr * 1.5, 0, 0, 0, 0.06));
    put(b, 'win', new THREE.BoxGeometry(tr * 0.3, tr * 0.6, 0.08), null, M, mat(-h * 0.04, h * 0.7, tr * 0.98));
  }
}
