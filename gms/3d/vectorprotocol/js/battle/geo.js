import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function plane(w, h, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function merge(list) {
  const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of clean) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const m = mergeGeometries(clean, false);
  for (const g of list) g.dispose();
  return m;
}
export function onLayers(obj, ...layers) {
  obj.traverse((o) => { for (const l of layers) o.layers.enable(l); });
  return obj;
}
// Backdrop objects live only on this layer; the battle draws them with a near-level backdrop camera first,
// then clears depth and draws the board with the elevated board camera (two-perspective cheat, like the refs).
export const BACKDROP_LAYER = 3;
export function toLayer(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
  return obj;
}

// battle-10: Box3.expandByObject(o, true) with the per-vertex work inlined. three's precise path rebuilds bone x boneInverse for
// every weight of every vertex (Matrix4 multiply per weight) — ~70% of a wave's spawn cost. Same result (same objects, same maths:
// children included, instanced / position-less objects use their bounding box), ~10x faster.
const _pv = new THREE.Vector3(), _pb = new THREE.Box3(), _pm = new THREE.Matrix4();
function attrReader(A) {
  if (A && !A.isInterleavedBufferAttribute && !A.normalized) { const a = A.array, s = A.itemSize; return (i, c) => a[i * s + c]; }
  return (i, c) => (c === 0 ? A.getX(i) : c === 1 ? A.getY(i) : c === 2 ? A.getZ(i) : A.getW(i));
}
function expandVerts(o, P, bb, local = false) {
  const g = o.geometry, n = P.count;
  let x0 = bb.min.x, y0 = bb.min.y, z0 = bb.min.z, x1 = bb.max.x, y1 = bb.max.y, z1 = bb.max.z;
  const morph = o.isMesh && g.morphAttributes?.position && o.morphTargetInfluences;
  if (morph || (o.isSkinnedMesh && !o.skeleton)) {
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, _pv); if (!local) _pv.applyMatrix4(o.matrixWorld); bb.expandByPoint(_pv); }
    return;
  }
  const pos = attrReader(P);
  if (o.isSkinnedMesh) {
    const sk = o.skeleton, nb = sk.bones.length, D = new Float64Array(nb * 16), bm = o.bindMatrix;
    for (let b = 0; b < nb; b++) {
      if (!sk.bones[b]) continue;
      _pm.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]).multiply(bm);
      D.set(_pm.elements, b * 16);
    }
    const W = (local ? _pm.copy(o.bindMatrixInverse) : _pm.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse)).elements;
    const w00 = W[0], w01 = W[4], w02 = W[8], w03 = W[12], w10 = W[1], w11 = W[5], w12 = W[9], w13 = W[13], w20 = W[2], w21 = W[6], w22 = W[10], w23 = W[14];
    const si = attrReader(g.attributes.skinIndex), sw = attrReader(g.attributes.skinWeight);
    for (let i = 0; i < n; i++) {
      const px = pos(i, 0), py = pos(i, 1), pz = pos(i, 2);
      let sx = 0, sy = 0, sz = 0;
      for (let c = 0; c < 4; c++) {
        const w = sw(i, c); if (w === 0) continue;
        const k = si(i, c) * 16;
        sx += w * (D[k] * px + D[k + 4] * py + D[k + 8] * pz + D[k + 12]);
        sy += w * (D[k + 1] * px + D[k + 5] * py + D[k + 9] * pz + D[k + 13]);
        sz += w * (D[k + 2] * px + D[k + 6] * py + D[k + 10] * pz + D[k + 14]);
      }
      const x = w00 * sx + w01 * sy + w02 * sz + w03, y = w10 * sx + w11 * sy + w12 * sz + w13, z = w20 * sx + w21 * sy + w22 * sz + w23;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  } else {
    const W = local ? _pm.identity().elements : o.matrixWorld.elements;
    for (let i = 0; i < n; i++) {
      const px = pos(i, 0), py = pos(i, 1), pz = pos(i, 2);
      const x = W[0] * px + W[4] * py + W[8] * pz + W[12], y = W[1] * px + W[5] * py + W[9] * pz + W[13], z = W[2] * px + W[6] * py + W[10] * pz + W[14];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  bb.min.set(x0, y0, z0); bb.max.set(x1, y1, z1);
}
export function expandPrecise(bb, o) {
  o.updateWorldMatrix(false, false);
  const g = o.geometry;
  if (g !== undefined) {
    const P = g.getAttribute('position');
    if (P !== undefined && o.isInstancedMesh !== true) { if (P.count) expandVerts(o, P, bb); }
    else {
      if (o.boundingBox !== undefined) { if (o.boundingBox === null) o.computeBoundingBox(); _pb.copy(o.boundingBox); }
      else { if (g.boundingBox === null) g.computeBoundingBox(); _pb.copy(g.boundingBox); }
      _pb.applyMatrix4(o.matrixWorld); bb.union(_pb);
    }
  }
  for (const c of o.children) expandPrecise(bb, c);
  return bb;
}

// battle-10: three computes a SkinnedMesh's culling sphere lazily on its first visible frame by skinning every vertex the slow way
// (~10-60 ms a unit on M5, x4 on a phone): set it ahead from the current pose (box-derived sphere: a looser but valid bound)
export function primeSkinnedBounds(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh || o.boundingSphere || !o.skeleton) return;
    const P = o.geometry.getAttribute('position'); if (!P || !P.count) return;
    _pb.makeEmpty(); expandVerts(o, P, _pb, true);
    if (_pb.isEmpty()) return;
    o.boundingBox = _pb.clone();
    o.boundingSphere = _pb.getBoundingSphere(new THREE.Sphere());
  });
}
