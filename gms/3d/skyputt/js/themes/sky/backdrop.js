// Sky Isles theme — backdrop set pieces: fairy-tale castle, small floating islands, trees, ruins, bridge.
// Everything is merged into a few buckets (vc, vcRock, gold, glow) by the caller.
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { roundRock, spikes } from './island.js';

const STONE = 0xdcd0bf, STONE2 = 0xb8a994, ROOF = 0x3f5a9a, ROOF2 = 0x2d447f, IRON = 0x34323a;

/** Adds a geometry already in local space, transformed by M (frame matrix). */
function put(b, key, geo, color, local, M) {
  const m = local ? M.clone().multiply(local) : M;
  b.add(key, geo, color, m);
}

function tower(b, M, x, z, y0, r, h, opts = {}, hi = true) {
  const seg = hi ? 12 : 8;
  put(b, 'vc', new THREE.CylinderGeometry(r, r * 1.06, h, seg), opts.stone ?? STONE, mat(x, y0 + h / 2, z), M);
  put(b, 'gold', new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.22 * r + 0.08, seg), null, mat(x, y0 + h, z), M);
  // crenellated ring (simple: a slightly wider short cylinder)
  put(b, 'vc', new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.35 * r, seg), STONE2, mat(x, y0 + h + 0.17 * r, z), M);
  const rh = opts.roofH ?? r * 3.1;
  put(b, 'vc', new THREE.ConeGeometry(r * 1.18, rh, seg), opts.roof ?? ROOF, mat(x, y0 + h + 0.35 * r + rh / 2, z), M);
  put(b, 'gold', new THREE.ConeGeometry(r * 0.12, r * 1.2, 6), null, mat(x, y0 + h + 0.35 * r + rh + r * 0.5, z), M);
  // windows facing +z (toward the course)
  const rows = Math.max(1, Math.floor(h / (r * 2.2)));
  for (let i = 0; i < rows; i++) {
    const wy = y0 + h * (0.35 + 0.55 * (i + 0.5) / rows);
    put(b, 'glow', new THREE.BoxGeometry(r * 0.28, r * 0.55, 0.08), null, mat(x, wy, z + r * 0.99), M);
  }
}

function wall(b, M, x0, z0, x1, z1, y0, h, t, hi) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  put(b, 'vc', new THREE.BoxGeometry(len, h, t), STONE2, mat(cx, y0 + h / 2, cz, 0, -ang, 0), M);
  const n = Math.floor(len / 0.7);
  if (!hi) return;
  for (let i = 0; i < n; i += 2) {
    const u = (i + 0.5) / n - 0.5;
    put(b, 'vc', new THREE.BoxGeometry(len / n, 0.4, t * 1.05), STONE2,
      mat(cx + Math.cos(ang) * u * len, y0 + h + 0.2, cz + Math.sin(ang) * u * len, 0, -ang, 0), M);
  }
}

/** Fairy-tale castle at local origin, facing +z. ~22 m tall. */
export function buildCastle(b, M, hi) {
  // terraces
  put(b, 'vc', new THREE.CylinderGeometry(9.5, 10, 1.2, hi ? 20 : 12), STONE2, mat(0, 0.6, 0), M);
  put(b, 'gold', new THREE.CylinderGeometry(9.6, 9.6, 0.12, hi ? 20 : 12), null, mat(0, 1.2, 0), M);
  // keep + great hall
  put(b, 'vc', new THREE.BoxGeometry(7, 8, 6), STONE, mat(0, 5.2, -0.5), M);
  put(b, 'vc', new THREE.BoxGeometry(9, 4.5, 3.4), STONE, mat(0, 3.45, 3.6), M);
  put(b, 'vc', new THREE.ConeGeometry(5.6, 3, 4), ROOF2, mat(0, 7.2, 3.6, 0, Math.PI / 4, 0, [1.0, 1, 0.42]), M);
  put(b, 'vc', new THREE.ConeGeometry(5.1, 4, 4), ROOF, mat(0, 11.2, -0.5, 0, Math.PI / 4, 0), M);
  // gate + tall window
  put(b, 'glow', new THREE.BoxGeometry(1.4, 2.2, 0.1), null, mat(0, 2.3, 5.32), M);
  put(b, 'gold', new THREE.TorusGeometry(0.75, 0.12, 6, 12, Math.PI), null, mat(0, 3.4, 5.33), M);
  for (const x of [-3, -1.5, 1.5, 3]) put(b, 'glow', new THREE.BoxGeometry(0.42, 1.1, 0.1), null, mat(x, 4.1, 5.32), M);
  for (const x of [-2.2, 0, 2.2]) for (const y of [6.2, 8.2]) put(b, 'glow', new THREE.BoxGeometry(0.5, 1.2, 0.1), null, mat(x, y, 2.55), M);
  // central spire
  tower(b, M, 0, -1.2, 9, 1.5, 7.5, { roofH: 6.5, roof: ROOF2 }, hi);
  // tower ring
  const T = [[-5.2, 2.6, 1.15, 9.5], [5.2, 2.6, 1.15, 9.5], [-3.6, -3.6, 1.0, 13], [3.6, -3.6, 1.0, 13],
    [-8.0, -0.6, 0.85, 7], [8.0, -0.6, 0.85, 7], [-6.2, 5.2, 0.7, 5.5], [6.2, 5.2, 0.7, 5.5]];
  for (const [x, z, r, h] of T) tower(b, M, x, z, 1.2, r, h, {}, hi);
  // turrets on the keep corners
  for (const [x, z] of [[-3.3, 2.3], [3.3, 2.3], [-3.3, -3.3], [3.3, -3.3]]) tower(b, M, x, z, 9.2, 0.55, 2.2, { roof: ROOF2 }, hi);
  // curtain walls between front towers
  wall(b, M, -5.2, 2.6, -6.2, 5.2, 1.2, 3.2, 0.7, hi);
  wall(b, M, 5.2, 2.6, 6.2, 5.2, 1.2, 3.2, 0.7, hi);
  wall(b, M, -6.2, 5.2, 6.2, 5.2, 1.2, 2.4, 0.6, hi);
  wall(b, M, -8.0, -0.6, -5.2, 2.6, 1.2, 3.6, 0.7, hi);
  wall(b, M, 8.0, -0.6, 5.2, 2.6, 1.2, 3.6, 0.7, hi);
  wall(b, M, -3.6, -3.6, 3.6, -3.6, 1.2, 5, 0.8, hi);
  // gate glow in the front wall
  put(b, 'glow', new THREE.BoxGeometry(1.0, 1.5, 0.1), null, mat(0, 1.95, 5.52), M);
  // a few banners (blue cloth with gold)
  for (const x of [-2.5, 2.5]) {
    put(b, 'vc', new THREE.BoxGeometry(0.7, 1.8, 0.05), 0x2a4a9a, mat(x, 6.5, 5.35), M);
    put(b, 'gold', new THREE.BoxGeometry(0.75, 0.1, 0.07), null, mat(x, 7.4, 5.35), M);
  }
}

function tree(b, M, x, y, z, s, r) {
  put(b, 'vc', new THREE.CylinderGeometry(0.08 * s, 0.14 * s, 1.1 * s, 5), 0x6b4a32, mat(x, y + 0.55 * s, z), M);
  const greens = [0x4f9a3a, 0x3f8a36, 0x6cb04a, 0x5aa040];
  const n = 2 + (r() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const cs = s * (0.55 + r() * 0.3);
    put(b, 'vc', new THREE.IcosahedronGeometry(cs, 1), greens[(r() * 4) | 0],
      mat(x + (r() - 0.5) * s * 0.6, y + s * (1.1 + i * 0.35), z + (r() - 0.5) * s * 0.6, 0, r() * 3, 0, [1, 0.85, 1]), M);
  }
}

function column(b, M, x, y, z, h, rad, broken) {
  put(b, 'vc', new THREE.BoxGeometry(rad * 2.6, rad * 0.8, rad * 2.6), STONE2, mat(x, y + rad * 0.4, z), M);
  put(b, 'vc', new THREE.CylinderGeometry(rad, rad * 1.05, h, 8), STONE, mat(x, y + h / 2 + rad * 0.8, z, broken ? 0.05 : 0, 0, broken ? 0.06 : 0), M);
  if (!broken) put(b, 'gold', new THREE.BoxGeometry(rad * 2.5, rad * 0.5, rad * 2.5), null, mat(x, y + h + rad, z), M);
}

/**
 * Small floating island with decor. kind: 'trees' | 'temple' | 'ruins' | 'arch' | 'tower'
 * lp = world position of the island top centre, M0 = frame basis matrix (rotation only).
 */
export function buildSmallIsland(b, rocks, M0, lp, R, D, kind, seed, hi) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const rock = roundRock(R, D, seed, hi);
  rock.applyMatrix4(M);
  rocks.push(rock);
  const sp = [];
  spikes(sp, 0, -D * 0.1, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  const nTrees = kind === 'trees' ? 4 + (r() * 4 | 0) : 1 + (r() * 3 | 0);
  for (let i = 0; i < nTrees; i++) {
    const a = r() * Math.PI * 2, rad = R * (0.35 + r() * 0.45);
    tree(b, M, Math.cos(a) * rad, 0, Math.sin(a) * rad, 0.6 + r() * 0.6 * (R / 4), r);
  }
  if (kind === 'temple') {
    const n = 6, cr = Math.min(R * 0.45, 2.2);
    put(b, 'vc', new THREE.CylinderGeometry(cr * 1.25, cr * 1.35, 0.4, 16), STONE2, mat(0, 0.2, 0), M);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; column(b, M, Math.cos(a) * cr, 0.4, Math.sin(a) * cr, cr * 1.4, 0.16, false); }
    put(b, 'vc', new THREE.CylinderGeometry(cr * 1.15, cr * 1.15, 0.3, 16), STONE, mat(0, 0.4 + cr * 1.4 + 0.45, 0), M);
    put(b, 'gold', new THREE.SphereGeometry(cr * 1.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), null, mat(0, 0.4 + cr * 1.4 + 0.6, 0), M);
    put(b, 'gold', new THREE.ConeGeometry(0.12, 0.7, 6), null, mat(0, 0.4 + cr * 2.5 + 0.9, 0), M);
  } else if (kind === 'ruins') {
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, rad = R * (0.2 + r() * 0.4);
      column(b, M, Math.cos(a) * rad, 0, Math.sin(a) * rad, 0.8 + r() * 2.2, 0.22, r() < 0.6);
    }
    put(b, 'vc', new THREE.TorusGeometry(1.2, 0.28, 6, 12, Math.PI), STONE, mat(0, 2.3, 0, 0, r() * 3, 0), M);
  } else if (kind === 'arch') {
    const w = Math.min(R * 0.55, 3);
    for (const sx of [-1, 1]) {
      put(b, 'vc', new THREE.BoxGeometry(0.9, w * 2, 0.9), STONE, mat(sx * w, w, 0), M);
      put(b, 'gold', new THREE.BoxGeometry(1.0, 0.18, 1.0), null, mat(sx * w, w * 2, 0), M);
    }
    put(b, 'vc', new THREE.TorusGeometry(w, 0.45, 6, 16, Math.PI), STONE, mat(0, w * 2, 0), M);
    put(b, 'glow', new THREE.TorusGeometry(w - 0.48, 0.06, 4, 16, Math.PI), null, mat(0, w * 2, 0.0), M);
  } else if (kind === 'tower') {
    tower(b, M, 0, 0, 0, Math.min(R * 0.28, 1.4), R * 1.4, { roof: r() < 0.5 ? ROOF : ROOF2 }, hi);
    put(b, 'vc', new THREE.BoxGeometry(R * 0.7, R * 0.5, R * 0.6), STONE, mat(R * 0.35, R * 0.25, 0.3), M);
    put(b, 'vc', new THREE.ConeGeometry(R * 0.5, R * 0.4, 4), ROOF2, mat(R * 0.35, R * 0.7, 0.3, 0, Math.PI / 4, 0, [1, 1, 0.85]), M);
  }
}

/** Stone arch bridge between two world points (deck top at the endpoints' y). */
export function buildBridge(b, a, c, hi) {
  const d = new THREE.Vector3().subVectors(c, a);
  const len = d.length();
  const yaw = Math.atan2(d.x, d.z);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const M = new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const pitch = -Math.asin(d.y / len);
  put(b, 'vc', new THREE.BoxGeometry(1.6, 0.5, len), STONE2, mat(0, -0.25, 0, pitch, 0, 0), M);
  for (const sx of [-0.75, 0.75]) put(b, 'gold', new THREE.BoxGeometry(0.1, 0.08, len), null, mat(sx, 0.25, 0, pitch, 0, 0), M);
  for (const sx of [-0.75, 0.75]) put(b, 'vc', new THREE.BoxGeometry(0.12, 0.4, len), STONE, mat(sx, 0.05, 0, pitch, 0, 0), M);
  const n = Math.max(2, Math.round(len / 4));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const z = t * len, y = -Math.tan(pitch) * z;
    const R = len / n / 2;
    put(b, 'vc', new THREE.TorusGeometry(R, 0.3, 4, hi ? 10 : 6, Math.PI), STONE2, mat(0, y - 0.5 - R, z, 0, Math.PI / 2, 0, [1, 1, 2.4]), M);
  }
}

export { IRON };
