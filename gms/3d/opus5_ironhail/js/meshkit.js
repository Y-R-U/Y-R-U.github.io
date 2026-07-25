// Every prop and tank is authored as a pile of primitives and then merged into
// a single vertex-coloured geometry, so one object = one draw call. With ~70
// props plus a dozen tanks on screen that is the difference between a phone
// holding 60fps and not.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Opaque, lit, faceted — the house style.
export const solidMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.12,
});

// Same but a touch shinier, for tank plate. Metalness stays low — painted
// steel, not chrome, and high metalness reads as black under a low sun.
export const plateMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.72, metalness: 0.16,
});

// Unlit accent material for glowing trim (picked up by bloom).
export const emitMat = new THREE.MeshBasicMaterial({ vertexColors: true });

export class Parts {
  constructor() { this.geos = []; }

  // pos/rot/scale are arrays or numbers; colour is a hex int.
  add(geo, colour, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    // Polyhedra come non-indexed and boxes come indexed; mergeGeometries needs
    // one or the other, so everything is flattened here before painting.
    let g = geo.clone();
    if (g.index) g = g.toNonIndexed();
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    _q.setFromEuler(_e);
    _m.compose(
      new THREE.Vector3(pos[0] || 0, pos[1] || 0, pos[2] || 0), _q,
      new THREE.Vector3(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    paint(g, colour);
    this.geos.push(g);
    return this;
  }

  get empty() { return this.geos.length === 0; }

  merge() {
    if (!this.geos.length) return null;
    const cleaned = this.geos.map(stripExtras);
    const merged = mergeGeometries(cleaned, false);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (merged) merged.computeBoundingSphere();
    return merged;
  }

  mesh(material = solidMat, { shadow = true } = {}) {
    const geo = this.merge();
    if (!geo) return null;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  }
}

// mergeGeometries needs identical attribute sets; primitives all carry
// position/normal/uv, so normalise to exactly those plus colour.
function stripExtras(g) {
  const keep = ['position', 'normal', 'uv', 'color'];
  for (const name of Object.keys(g.attributes)) {
    if (!keep.includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function paint(geo, colour, jitter = 0.035) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(colour);
  for (let i = 0; i < n; i++) {
    const v = 1 + (Math.random() - 0.5) * jitter;
    arr[i * 3] = _c.r * v;
    arr[i * 3 + 1] = _c.g * v;
    arr[i * 3 + 2] = _c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Shared primitive cache — cloned by Parts.add, so never mutated in place.
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export const G = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 8) => cached('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  cone: (seg = 6) => cached('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg)),
  taper: (seg = 8) => cached('taper' + seg, () => new THREE.CylinderGeometry(0.32, 0.5, 1, seg)),
  ico: (d = 0) => cached('ico' + d, () => new THREE.IcosahedronGeometry(0.5, d)),
  sphere: (w = 8, h = 6) => cached(`sph${w}_${h}`, () => new THREE.SphereGeometry(0.5, w, h)),
  tetra: () => cached('tetra', () => new THREE.TetrahedronGeometry(0.6, 0)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
  tri: () => cached('tri', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 3)),
};

export function tintOf(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex();
}

export function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
