// Jungle Temple theme — small props built into Buckets: carved stelae with gold caps, stone braziers and
// bamboo torches (flame points for the flicker billboards), squat idol statues, broken columns, clay
// urns, mossy boulders, ferns, broad-leaf plants, banana plants and leaf bushes.
// Every builder takes a Buckets `b` and a placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc (wood, clay, bark), stone (flat-shaded carved stone), gold (gold + jade, glossy),
// leaf (alpha-tested atlas, uv kept), glow (unlit). Builders return local flame / glow points.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  stone: 0xa4a69a, stone2: 0x8a8e84, dark: 0x5a5c52, moss: 0x5a7a34, gold: 0xe0b048, jade: 0x3aa878,
  wood: 0x7a5434, bamboo: 0xb8a060, clay: 0xb4683a, clay2: 0x8a4a2a, red: 0xb83a2a, flame: 0xffb040,
  ember: 0xff7a20, leaf: 0xffffff, leaf2: 0xd8ecb8, leaf3: 0xb8d898, eye: 0x70ffb0,
};
const K = COLORS;
const at = (M, m) => M.clone().multiply(m);

/** An upright quad textured with one cell of the foliage atlas (0 monstera, 1 fern, 2 cluster, 3 banana). Stem at y = 0. */
export function leafQuad(cell, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 1, 2);
  g.translate(0, h / 2, 0);
  const u0 = (cell % 2) * 0.5, v0 = 0.5 - Math.floor(cell / 2) * 0.5;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  // a little cup so the leaf is not a flat card
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / w, y = p.getY(i) / h; p.setZ(i, (x * x) * w * 0.4 - y * y * h * 0.2); }
  g.computeVertexNormals();
  return g;
}

/** A spray of leaves from one point: n quads fanned round Y, tilted outward. */
export function leafSpray(b, M, cell, n, w, h, tilt = 0.7, tint = K.leaf, yaw0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = yaw0 + i / n * Math.PI * 2;
    b.add('leaf', leafQuad(cell, w, h), i % 2 ? tint : K.leaf2, at(M, mat(0, 0, 0, 0, a, 0).multiply(mat(0, 0, 0, -tilt, 0, 0))), true);
  }
}

/** A fern: a ring of fronds. */
export function fern(b, M, s = 0.3, lo = false) {
  leafSpray(b, M, 1, lo ? 4 : 6, s * 0.6, s, 0.9, K.leaf3);
}

/** A broad-leaf plant (monstera): a few big split leaves on short stalks. */
export function broadLeaf(b, M, s = 0.4, lo = false) {
  leafSpray(b, M.clone().multiply(mat(0, s * 0.1, 0)), 0, lo ? 3 : 5, s * 0.7, s * 0.8, 1.0, K.leaf);
}

/** A banana plant: a green stem with long arching blades. Returns the top point. */
export function banana(b, M, h = 0.8, lo = false) {
  b.add('vc', new THREE.CylinderGeometry(0.03, 0.045, h, 6), 0x5a7a34, at(M, mat(0, h / 2, 0)));
  leafSpray(b, M.clone().multiply(mat(0, h, 0)), 3, lo ? 4 : 6, h * 0.35, h * 0.9, 1.15, K.leaf2, 0.3);
  return new THREE.Vector3(0, h, 0);
}

/** A leaf bush: a few cluster cards crossed round a centre. */
export function bush(b, M, s = 0.4, lo = false) {
  const n = lo ? 3 : 4;
  for (let i = 0; i < n; i++) b.add('leaf', leafQuad(2, s * 1.3, s), i % 2 ? K.leaf3 : K.leaf2, at(M, mat(0, -s * 0.1, 0, 0, i / n * Math.PI, 0)), true);
  leafSpray(b, M, 2, lo ? 3 : 4, s, s * 0.7, 1.2, K.leaf);
}

/** A carved stele: a stone slab with glyph bands, a gold cap and a moss foot. Returns the top point. */
export function stele(b, M, h = 0.6) {
  const w = h * 0.32;
  b.add('stone', new THREE.BoxGeometry(w, h, w * 0.55), K.stone, at(M, mat(0, h / 2, 0)));
  for (const f of [0.3, 0.55, 0.8]) b.add('stone', new THREE.BoxGeometry(w * 1.06, h * 0.05, w * 0.6), K.stone2, at(M, mat(0, h * f, 0)));
  b.add('stone', new THREE.BoxGeometry(w * 0.5, h * 0.12, w * 0.58), K.dark, at(M, mat(0, h * 0.67, 0)));   // carved face panel
  b.add('gold', new THREE.BoxGeometry(w * 1.2, h * 0.07, w * 0.7), K.gold, at(M, mat(0, h + h * 0.035, 0)));
  b.add('gold', new THREE.ConeGeometry(w * 0.3, h * 0.12, 4), K.gold, at(M, mat(0, h + h * 0.13, 0, 0, Math.PI / 4, 0)));
  b.add('stone', new THREE.BoxGeometry(w * 1.3, h * 0.08, w * 0.85), K.moss, at(M, mat(0, h * 0.04, 0)));
  return new THREE.Vector3(0, h + 0.12, 0);
}

/** A stone brazier: a pedestal and a bowl of embers. Returns the flame point. */
export function brazier(b, M, h = 0.36, lo = false) {
  const seg = lo ? 6 : 8;
  b.add('stone', new THREE.CylinderGeometry(h * 0.16, h * 0.24, h * 0.7, seg), K.stone2, at(M, mat(0, h * 0.35, 0)));
  b.add('stone', new THREE.CylinderGeometry(h * 0.34, h * 0.18, h * 0.22, seg), K.stone, at(M, mat(0, h * 0.8, 0)));
  b.add('gold', new THREE.TorusGeometry(h * 0.33, h * 0.025, 3, seg * 2), K.gold, at(M, mat(0, h * 0.9, 0, Math.PI / 2, 0, 0)));
  b.add('glow', new THREE.CylinderGeometry(h * 0.28, h * 0.28, 0.01, seg), K.ember, at(M, mat(0, h * 0.9, 0)));
  return new THREE.Vector3(0, h * 1.02, 0);
}

/** A bamboo torch: a lashed pole with a bowl on top. Returns the flame point. */
export function torch(b, M, h = 0.6) {
  b.add('vc', new THREE.CylinderGeometry(0.014, 0.018, h, 5), K.bamboo, at(M, mat(0, h / 2, 0)));
  for (const f of [0.3, 0.6, 0.85]) b.add('vc', new THREE.CylinderGeometry(0.02, 0.02, 0.012, 5), 0x8a7440, at(M, mat(0, h * f, 0)));
  b.add('vc', new THREE.CylinderGeometry(0.045, 0.02, 0.05, 6), K.wood, at(M, mat(0, h + 0.02, 0)));
  b.add('glow', new THREE.ConeGeometry(0.03, 0.06, 5), K.flame, at(M, mat(0, h + 0.07, 0)));
  return new THREE.Vector3(0, h + 0.08, 0);
}

/** A squat idol statue: a block body, a big head with jade eyes, a gold headdress. Returns the eyes' midpoint. */
export function idol(b, M, s = 0.35) {
  b.add('stone', new THREE.BoxGeometry(s * 0.5, s * 0.4, s * 0.4), K.stone2, at(M, mat(0, s * 0.2, 0)));
  b.add('stone', new THREE.BoxGeometry(s * 0.6, s * 0.46, s * 0.46), K.stone, at(M, mat(0, s * 0.63, 0)));
  b.add('stone', new THREE.BoxGeometry(s * 0.5, s * 0.08, s * 0.1), K.dark, at(M, mat(0, s * 0.72, s * 0.22)));   // brow
  b.add('stone', new THREE.BoxGeometry(s * 0.3, s * 0.06, s * 0.06), K.dark, at(M, mat(0, s * 0.5, s * 0.23)));   // mouth
  for (const sx of [-1, 1]) b.add('glow', new THREE.BoxGeometry(s * 0.1, s * 0.06, 0.01), K.eye, at(M, mat(sx * s * 0.13, s * 0.64, s * 0.235)));
  b.add('gold', new THREE.BoxGeometry(s * 0.7, s * 0.08, s * 0.5), K.gold, at(M, mat(0, s * 0.9, 0)));
  for (let i = -2; i <= 2; i++) b.add('vc', new THREE.BoxGeometry(s * 0.08, s * 0.28, 0.02), i % 2 ? K.red : 0x3a8a4a, at(M, mat(i * s * 0.12, s * 1.06, -s * 0.12, -0.2, 0, i * 0.18)));
  return new THREE.Vector3(0, s * 0.64, s * 0.24);
}

/** A broken column: fluted drum stumps, a fallen drum beside, moss. */
export function brokenColumn(b, M, h = 0.5, lo = false) {
  const seg = lo ? 7 : 10, r = h * 0.18;
  b.add('stone', new THREE.CylinderGeometry(r * 1.4, r * 1.5, h * 0.1, seg), K.stone2, at(M, mat(0, h * 0.05, 0)));
  b.add('stone', new THREE.CylinderGeometry(r, r * 1.05, h * 0.9, seg), K.stone, at(M, mat(0, h * 0.55, 0, 0.04, 0, 0.03)));
  b.add('stone', new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.06, seg), K.moss, at(M, mat(0, h * 0.98, 0)));
  b.add('stone', new THREE.CylinderGeometry(r, r, h * 0.4, seg), K.stone2, at(M, mat(r * 2.6, r, 0.05, 0, 0.4, Math.PI / 2)));
}

/** Clay urns: one or two round pots with a red band. */
export function urns(b, M, s = 0.22, n = 2, lo = false) {
  const seg = lo ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * s * 0.7, k = 1 - i * 0.2;
    b.add('vc', new THREE.SphereGeometry(s * 0.32 * k, seg, 5), i % 2 ? K.clay2 : K.clay, at(M, mat(x, s * 0.3 * k, 0, 0, 0, 0, [1, 1.1, 1])));
    b.add('vc', new THREE.CylinderGeometry(s * 0.14 * k, s * 0.18 * k, s * 0.14 * k, seg), K.clay2, at(M, mat(x, s * 0.64 * k, 0)));
    b.add('vc', new THREE.CylinderGeometry(s * 0.325 * k, s * 0.325 * k, s * 0.06, seg), K.red, at(M, mat(x, s * 0.34 * k, 0)));
  }
}

/** A mossy boulder (stone bucket, flat shaded). */
export function boulder(b, M, s = 0.25) {
  const g = new THREE.IcosahedronGeometry(s, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.max(p.getY(i), -s * 0.3) * 0.75);
  b.add('stone', g, K.stone2, at(M, mat(0, s * 0.2, 0)));
  b.add('stone', new THREE.IcosahedronGeometry(s * 0.7, 0), K.moss, at(M, mat(s * 0.1, s * 0.52, 0, 0, 0, 0, [1, 0.35, 1])));
}
