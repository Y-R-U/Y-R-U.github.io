// Geometry primitives shared by the kits: boxes and cylinders that carry a baked cavity term as
// vertex colour, world-scaled plate UVs, and the attribute whitelist mergeGeometries needs.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M4 = new THREE.Matrix4();
const EU = new THREE.Euler();
const V3 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

export const UV = 4.4;

export const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

export function paint(g, v) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  if (Array.isArray(v)) for (let i = 0; i < n; i++) { c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  else c.fill(v);
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

// BoxGeometry's uv is 0..1 per face, so a 40 m panel and a 0.4 m greeble block would carry the
// same plate density without this.
export function scaleUV(g, w, h, d) {
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * sizes[f][0] / UV, uv.getY(k) * sizes[f][1] / UV);
    }
  }
}

export function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, ao = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleUV(g, w, h, d);
  paint(g, ao);
  g.applyMatrix4(M4.compose(V3.set(x, y, z), Q.setFromEuler(EU.set(rx, ry, rz)), ONE));
  return g;
}

// CylinderGeometry's axis is Y: rx = π/2 lays it along Z, rz = π/2 along X.
export function cyl(r0, r1, h, seg, x, y, z, rx = 0, rz = 0, ao = 1, open = false) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  // CylinderGeometry wraps 0..1 once round the whole circumference, so on a 260 m drum one plate
  // covers thirty metres and the hull reads as a grid of huge panels. Rescale by world size.
  scaleTubeUV(g, Math.PI * (r0 + r1), h);
  paint(g, ao);
  g.applyMatrix4(M4.compose(V3.set(x, y, z), Q.setFromEuler(EU.set(rx, 0, rz)), ONE));
  return g;
}

function scaleTubeUV(g, circ, len) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / UV, uv.getY(i) * len / UV);
}

export function ring(r, tube, seg, x, y, z, rx = 0, ao = 1) {
  const g = new THREE.TorusGeometry(r, tube, 6, seg);
  scaleTubeUV(g, 2 * Math.PI * r, 2 * Math.PI * tube);
  paint(g, ao);
  g.applyMatrix4(M4.compose(V3.set(x, y, z), Q.setFromEuler(EU.set(rx, 0, 0)), ONE));
  return g;
}

// mergeGeometries refuses a set whose attributes differ, and Box/Plane/Cylinder/Torus do not
// agree on which of uv/uv1/normal/color they ship with.
export function strip(g) {
  const want = ['position', 'normal', 'uv', 'color'];
  for (const k of Object.keys(g.attributes)) if (!want.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3); c.fill(1);
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function mergeAll(geos) {
  if (!geos.length) return null;
  const m = geos.length === 1 ? strip(geos[0]) : mergeGeometries(geos.map(g => strip(g)), false);
  if (m) for (const g of geos) if (g !== m) g.dispose();
  return m;
}
