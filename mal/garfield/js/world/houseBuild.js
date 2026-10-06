import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { material } from './materials.js';

// near-identical looks folded together to save draw calls
const ALIAS = { ceramic: 'gloss', shadeGlow: 'glowShade', metal: 'gloss', wood: 'woodGloss' };
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

// Rounded box: segments concentrated in the corner radius, vertices pushed onto the rounded hull.
export function roundedBoxGeometry(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const N = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, N, N, N);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  const remap = (t, hh) => {
    const i = Math.round((t + 0.5) * N);
    if (i <= seg) return -hh + r * (i / seg);
    if (i >= N - seg) return hh - r * ((N - i) / seg);
    return 0;
  };
  for (let i = 0; i < pos.count; i++) {
    const p = [remap(pos.getX(i), half[0]), remap(pos.getY(i), half[1]), remap(pos.getZ(i), half[2])];
    const c = p.map((v, k) => Math.max(-half[k] + r, Math.min(half[k] - r, v)));
    _n.set(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    if (_n.lengthSq() < 1e-10) _n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    _n.normalize();
    pos.setXYZ(i, c[0] + _n.x * r, c[1] + _n.y * r, c[2] + _n.z * r);
    nor.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return g;
}

export class Builder {
  constructor(aoFn) {
    this.aoFn = aoFn || (() => 1);
    this.buckets = new Map();
    this.layer = 'ground';
    this.cast = true;
  }

  // Bakes matrix, world-space UVs (metres) and vertex colour (tint × AO) into a geometry and buckets it.
  geom(matKey, g, matrix, color = 0xffffff, opts = {}) {
    matKey = ALIAS[matKey] || matKey;
    g = g.index ? g : g;
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.index) {
      const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
    if (opts.uv !== 'keep') {
      const uv = new Float32Array(n * 2);
      const s = opts.uvScale || 1;
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        let u, v;
        if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
        else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
        else { u = pos.getX(i); v = pos.getY(i); }
        uv[i * 2] = u * s + (opts.uvOff || 0); uv[i * 2 + 1] = v * s;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    } else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const col = new Float32Array(n * 3);
    _c.set(color);
    const aoOn = opts.ao !== false;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
      let a = aoOn ? this.aoFn(_v, _n) : 1;
      if (opts.selfAO) a *= opts.selfAO(_v, _n);
      col[i * 3] = _c.r * a; col[i * 3 + 1] = _c.g * a; col[i * 3 + 2] = _c.b * a;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cast = opts.cast ?? this.cast;
    const key = `${opts.layer || this.layer}|${matKey}|${cast ? 1 : 0}|${opts.receive === false ? 0 : 1}`;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
    return g;
  }

  // Axis-aligned box from min to max corner. opts.r → rounded.
  box(matKey, x0, y0, z0, x1, y1, z1, color, opts = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = opts.r ? roundedBoxGeometry(w, h, d, opts.r, opts.seg || (opts.r < 0.021 ? 1 : 2)) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (opts.matrix) m.premultiply(opts.matrix);
    return this.geom(matKey, g, m, color, opts);
  }

  // Box defined in a local frame (centre, size) then transformed by `frame` matrix (for rotated furniture).
  lbox(matKey, frame, cx, cy, cz, w, h, d, color, opts = {}) {
    const g = opts.r ? roundedBoxGeometry(w, h, d, opts.r, opts.seg || (opts.r < 0.021 ? 1 : 2)) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
    if (opts.rot) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
    if (frame) m.premultiply(frame);
    return this.geom(matKey, g, m, color, opts);
  }

  cyl(matKey, frame, cx, cy, cz, rTop, rBot, h, color, opts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, opts.radial || 12, 1, !!opts.open);
    const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
    if (opts.rot) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
    if (frame) m.premultiply(frame);
    return this.geom(matKey, g, m, color, opts);
  }

  sphere(matKey, frame, cx, cy, cz, r, color, opts = {}) {
    const g = new THREE.SphereGeometry(r, opts.ws || (r < 0.04 ? 8 : 14), opts.hs || (r < 0.04 ? 5 : 10));
    const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
    if (opts.scale) m.scale(new THREE.Vector3(...opts.scale));
    if (frame) m.premultiply(frame);
    return this.geom(matKey, g, m, color, opts);
  }

  lathe(matKey, frame, cx, cy, cz, pts, color, opts = {}) {
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), opts.radial || 16);
    const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
    if (frame) m.premultiply(frame);
    return this.geom(matKey, g, m, color, opts);
  }

  // Flat grid quad patch with rectangular holes. map(u,v) → world Vector3. Dense enough for vertex AO.
  grid(matKey, u0, u1, v0, v1, holes, map, normal, color, opts = {}) {
    const step = opts.step || 0.3;
    const lines = (a, b, extra) => {
      const s = new Set([a, b]);
      const n = Math.max(1, Math.ceil((b - a) / step));
      for (let i = 1; i < n; i++) s.add(a + (b - a) * i / n);
      for (const e of extra) if (e > a && e < b) s.add(e);
      return [...s].sort((x, y) => x - y);
    };
    const us = lines(u0, u1, holes.flatMap(h => [h.u0, h.u1]));
    const vs = lines(v0, v1, holes.flatMap(h => [h.v0, h.v1]));
    const pos = [], nor = [], idx = [];
    for (const v of vs) for (const u of us) {
      const p = map(u, v); pos.push(p.x, p.y, p.z); nor.push(normal.x, normal.y, normal.z);
    }
    const W = us.length;
    let flip = null;
    for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
      if (holes.some(h => cu > h.u0 && cu < h.u1 && cv > h.v0 && cv < h.v1)) continue;
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (flip === null) {
        const A = new THREE.Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
        const B = new THREE.Vector3(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
        const C = new THREE.Vector3(pos[d * 3], pos[d * 3 + 1], pos[d * 3 + 2]);
        flip = B.sub(A).cross(C.sub(A)).dot(normal) < 0;
      }
      if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return this.geom(matKey, g, null, color, { cast: false, ...opts });
  }

  build(name = 'static') {
    // one mesh per layer+material: a cast/no-cast split costs a main-pass draw call, merging only adds shadow tris
    const merged = new Map();
    for (const [key, list] of this.buckets) {
      const [layer, matKey, cast, recv] = key.split('|');
      const k2 = `${layer}|${matKey}|${recv}`;
      if (!merged.has(k2)) merged.set(k2, { cast: '0', list: [] });
      const e = merged.get(k2);
      if (cast === '1') e.cast = '1';
      e.list.push(...list);
    }
    this.buckets = new Map([...merged].map(([k2, e]) => { const [l, m, r] = k2.split('|'); return [`${l}|${m}|${e.cast}|${r}`, e.list]; }));
    const root = new THREE.Group();
    root.name = name;
    const layers = {};
    for (const [key, list] of this.buckets) {
      const [layer, matKey, cast, recv] = key.split('|');
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material(matKey));
      mesh.name = `${layer}:${matKey}`;
      mesh.castShadow = cast === '1';
      mesh.receiveShadow = recv === '1' && matKey !== 'blob' && !matKey.startsWith('glow');
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (matKey === 'blob' || matKey === 'glass') mesh.renderOrder = 1;
      if (!layers[layer]) { layers[layer] = new THREE.Group(); layers[layer].name = layer; root.add(layers[layer]); }
      layers[layer].add(mesh);
    }
    this.buckets.clear();
    root.userData.layers = layers;
    return root;
  }
}

export function frameAt(x, y, z, rotY = 0) {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
}
