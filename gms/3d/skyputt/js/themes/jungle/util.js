// Jungle Temple theme — shared helpers (copied from star/util.js): seeded random, value noise, canvas textures, geometry merging, voids.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- random + noise ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Value noise in [0,1]. `period` (optional) makes it tile in x/y with that integer period. */
export function noise3(x, y, z = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const w = (v) => (period ? ((v % period) + period) % period : v);
  const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
  const c = (a, b, cz) => hash3(a, b, cz);
  return lerp(
    lerp(lerp(c(x0, y0, zi), c(x1, y0, zi), xf), lerp(c(x0, y1, zi), c(x1, y1, zi), xf), yf),
    lerp(lerp(c(x0, y0, zi + 1), c(x1, y0, zi + 1), xf), lerp(c(x0, y1, zi + 1), c(x1, y1, zi + 1), xf), yf),
    zf);
}
export function fbm3(x, y, z = 0, oct = 4, period = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f, period ? period * f : 0);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

// ---------- canvas textures ----------
export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Fill a canvas pixel by pixel. fn(u, v, x, y) → [r,g,b] or [r,g,b,a] in 0..255. */
export function paintPixels(canvas, fn) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const c = fn(x / w, y / h, x, y);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  return g;
}

export function toTexture(canvas, { repeat = true, srgb = true, aniso = 4, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  if (!mips) t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------- geometry helpers ----------
const _c = new THREE.Color();

/** Strip a geometry to position/normal(/uv) and paint a flat vertex colour. Returns a non-indexed-safe clone. */
export function paint(geo, color, matrix = null, keepUv = false) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (matrix) g.applyMatrix4(matrix);
  if (color !== null && color !== undefined) {
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  geo.dispose();
  return g;
}

/** Merge a list of geometries (already painted / same attribute set); disposes the inputs. */
export function merge(list) {
  if (!list.length) return null;
  // buckets can be aliased together (Buckets alias): keep only the attributes every part has
  const keys = Object.keys(list[0].attributes).filter(k => list.every(g => g.attributes[k]));
  if (list.some(g => Object.keys(g.attributes).length !== keys.length)) for (const g of list) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
  const idx = list.filter(g => g.index).length;
  if (idx && idx !== list.length) for (let i = 0; i < list.length; i++) if (list[i].index) { const n = list[i].toNonIndexed(); list[i].dispose(); list[i] = n; }
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Compose a matrix from position, euler rotation (x,y,z) and scale (number or [x,y,z]). */
export function mat(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _p.set(px, py, pz);
  _q.setFromEuler(_e.set(rx, ry, rz));
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
  return _m.clone().compose(_p, _q, _s);
}

/** A "bucket" collects painted geometry per material key, then builds one mesh per key. */
const NO_SHADOW = new Set(['glow', 'win']);
// Bucket aliases: materials that look the same at that distance / quality share one draw call.
// Jungle keys: vc (wood, bark, cloth), stone (flat-shaded carved stone), gold (gold + jade, glossy), leaf
// (alpha-tested foliage atlas, keeps uv), glow (unlit). Low quality folds stone + gold into vc.
export const ALIAS_HI = {};
export const ALIAS_LO = { stone: 'vc', gold: 'vc' };   // low: one lit vertex-colour draw per object
export class Buckets {
  constructor(alias = null) { this.map = new Map(); this.alias = alias; }
  add(key, geo, color, matrix, keepUv = false) {
    key = this.alias?.[key] ?? key;
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(paint(geo, color, matrix, keepUv));
  }
  addRaw(key, geo) {
    key = this.alias?.[key] ?? key;
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(geo);
  }
  build(materials, parent, opts = {}) {
    const out = {};
    for (const [key, list] of this.map) {
      const g = merge(list);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, materials[key]);
      mesh.castShadow = !!opts.castShadow && !NO_SHADOW.has(key);   // emissive parts never cast (saves a shadow draw per skin)
      mesh.receiveShadow = !!opts.receiveShadow;
      mesh.name = key;
      parent.add(mesh);
      out[key] = mesh;
    }
    this.map.clear();
    return out;
  }
}

/** Distance in XZ from (x,z) to the polyline `path`. Returns { d, i } (nearest segment index). */
export function distToPath(path, x, z) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z;
    const d = ex * ex + ez * ez;
    if (d < best) { best = d; bi = i; }
  }
  return { d: Math.sqrt(best), i: bi };
}

/** Recursively dispose geometries / materials / textures under obj (skipping `keep` materials). */
export function disposeTree(obj, keep = new Set()) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (keep.has(m)) continue;
      for (const v of Object.values(m)) if (v && v.isTexture && !keep.has(v)) v.dispose();
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture && !keep.has(u.value)) u.value.dispose();
      m.dispose();
    }
  });
}

/** Engine M2 info.voids: polygons [[x, z], ...] that must stay empty. True if (x, z) is inside one
 *  (or within `pad` metres of its edge). */
export function inVoid(voids, x, z, pad = 0) {
  if (!voids || !voids.length) return false;
  for (const poly of voids) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      if (pad > 0) {   // distance to this edge
        const dx = xj - xi, dz = zj - zi, l2 = dx * dx + dz * dz || 1e-9;
        let t = ((x - xi) * dx + (z - zi) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(xi + dx * t - x, zi + dz * t - z) < pad) return true;
      }
    }
    if (inside) return true;
  }
  return false;
}
/** Distance from (x, z) to the nearest of several polylines ([[x, y, z], ...]). */
export function distToLines(lines, x, z) {
  let best = Infinity;
  for (const L of lines || []) for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - a[0]) * dx + (z - a[2]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z));
  }
  return best;
}
