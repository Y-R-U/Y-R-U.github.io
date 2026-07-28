// props.js — every object on a planet is generated here, from primitives.
//
// A "proto" is a merged, vertex-coloured BufferGeometry normalised so that its
// footprint radius is exactly the radius its tier demands and its base sits on
// y=0. Each proto is drawn with an InstancedMesh, so a sector with 900 objects
// still costs well under 200 draw calls.
//
// Builders emit into two buckets: `solid` (lambert, lit) and `glow` (basic,
// unlit) so windows/energy read properly at night without per-part materials.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIER_R, TIER_VALUE } from './config.js';
import { TAU, makeRng } from './utils.js';

// ── tiny geometry builder ───────────────────────────────────────────────────

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _col = new THREE.Color();

const GEO = {};
function cachedBox() { return (GEO.box ||= new THREE.BoxGeometry(1, 1, 1)); }
function cachedCyl(seg) { return (GEO['c' + seg] ||= new THREE.CylinderGeometry(0.5, 0.5, 1, seg)); }
function cachedSph(seg) { return (GEO['s' + seg] ||= new THREE.SphereGeometry(0.5, seg, Math.max(3, seg >> 1))); }
function cachedCone(seg) { return (GEO['k' + seg] ||= new THREE.ConeGeometry(0.5, 1, seg)); }
function cachedTorus(seg) { return (GEO['t' + seg] ||= new THREE.TorusGeometry(0.4, 0.1, 5, seg)); }

class B {
  constructor(pal, rng) {
    this.pal = pal;
    this.rng = rng;
    this.solid = [];
    this.glow = [];
  }
  /** palette colour by index, with a little per-object variation */
  c(i, jitter) {
    const hex = this.pal.mats[((i % this.pal.mats.length) + this.pal.mats.length) % this.pal.mats.length];
    _col.setHex(hex);
    const j = jitter == null ? 0.07 : jitter;
    if (j > 0) {
      const f = 1 + (this.rng() - 0.5) * j * 2;
      _col.multiplyScalar(f);
    }
    return _col.getHex();
  }
  flora(i) { return this.pal.flora[i % this.pal.flora.length]; }

  _push(src, sx, sy, sz, x, y, z, color, rx, ry, rz, bucket) {
    const g = src.clone();
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _v.set(sx, sy, sz);
    _m.compose(new THREE.Vector3(x, y, z), _q, _v);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _col.setHex(color);
    // three r152+ works in linear space; convert so authored hex reads true
    _col.convertSRGBToLinear();
    for (let i = 0; i < n; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    (bucket === 'glow' ? this.glow : this.solid).push(g);
    return this;
  }

  box(w, h, d, x, y, z, color, ry, bucket, rx) { return this._push(cachedBox(), w, h, d, x, y, z, color, rx, ry, 0, bucket); }
  cyl(r, h, x, y, z, color, seg, ry, bucket, rx, rz) { return this._push(cachedCyl(seg || 8), r * 2, h, r * 2, x, y, z, color, rx, ry, rz, bucket); }
  cylT(rTop, rBot, h, x, y, z, color, seg, bucket) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg || 8);
    return this._pushRaw(g, x, y, z, color, bucket);
  }
  sph(r, x, y, z, color, seg, bucket, sy) { return this._push(cachedSph(seg || 8), r * 2, (sy || 1) * r * 2, r * 2, x, y, z, color, 0, 0, 0, bucket); }
  cone(r, h, x, y, z, color, seg, ry, bucket, rx) { return this._push(cachedCone(seg || 6), r * 2, h, r * 2, x, y, z, color, rx, ry, 0, bucket); }
  torus(r, t, x, y, z, color, seg, bucket, rx) {
    const g = new THREE.TorusGeometry(r, t, 4, seg || 10);
    return this._pushRaw(g, x, y, z, color, bucket, rx == null ? Math.PI / 2 : rx);
  }
  _pushRaw(g, x, y, z, color, bucket, rx, ry) {
    _e.set(rx || 0, ry || 0, 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _col.setHex(color); _col.convertSRGBToLinear();
    for (let i = 0; i < n; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    (bucket === 'glow' ? this.glow : this.solid).push(g);
    return this;
  }

  /**
   * Rows of lit windows up the faces of a block. These are the single biggest
   * source of vertices in a sector, so low detail halves the rows and skips
   * the two narrow faces entirely.
   */
  windows(w, d, h, y0, floors, color, inset) {
    if (this.lowDetail) floors = Math.max(1, Math.round(floors / 2));
    const step = h / floors;
    const per = Math.max(1, Math.min(this.lowDetail ? 3 : 5, Math.round(w / 1.6)));
    const perD = this.lowDetail ? 0 : Math.max(1, Math.min(5, Math.round(d / 1.6)));
    for (let f = 0; f < floors; f++) {
      const y = y0 + step * (f + 0.5);
      for (let i = 0; i < per; i++) {
        if (this.rng() < 0.35) continue;
        const x = (i - (per - 1) / 2) * (w / per) * 0.92;
        this.box(w / per * 0.5, step * 0.42, 0.06, x, y, d / 2 + (inset || 0.02), color, 0, 'glow');
        this.box(w / per * 0.5, step * 0.42, 0.06, x, y, -d / 2 - (inset || 0.02), color, 0, 'glow');
      }
      for (let i = 0; i < perD; i++) {
        if (this.rng() < 0.35) continue;
        const z = (i - (perD - 1) / 2) * (d / perD) * 0.92;
        this.box(0.06, step * 0.42, d / perD * 0.5, w / 2 + (inset || 0.02), y, z, color, 0, 'glow');
        this.box(0.06, step * 0.42, d / perD * 0.5, -w / 2 - (inset || 0.02), y, z, color, 0, 'glow');
      }
    }
    return this;
  }

  /** merge, drop to y=0, centre in xz, then scale so footprint radius === r */
  finish(targetR) {
    const out = {};
    for (const key of ['solid', 'glow']) {
      const list = this[key];
      if (!list.length) { out[key] = null; continue; }
      out[key] = list.length === 1 ? list[0] : mergeGeometries(list, false);
    }
    // normalise using the solid bucket's bounds (plus glow, so nothing pokes out)
    const boxAll = new THREE.Box3();
    for (const key of ['solid', 'glow']) {
      if (!out[key]) continue;
      out[key].computeBoundingBox();
      boxAll.union(out[key].boundingBox);
    }
    const cx = (boxAll.min.x + boxAll.max.x) / 2;
    const cz = (boxAll.min.z + boxAll.max.z) / 2;
    const halfX = (boxAll.max.x - boxAll.min.x) / 2;
    const halfZ = (boxAll.max.z - boxAll.min.z) / 2;
    const foot = Math.max(0.001, Math.max(halfX, halfZ));
    const s = targetR / foot;
    const my = boxAll.min.y;
    _m.makeTranslation(-cx, -my, -cz);
    const scaleM = new THREE.Matrix4().makeScale(s, s, s).multiply(_m);
    for (const key of ['solid', 'glow']) {
      if (!out[key]) continue;
      out[key].applyMatrix4(scaleM);
      out[key].computeBoundingBox();
      out[key].computeVertexNormals();
    }
    out.height = (boxAll.max.y - boxAll.min.y) * s;
    return out;
  }
}

// ── builders ────────────────────────────────────────────────────────────────
// Each takes (b, rng, pal) and draws in arbitrary units; finish() rescales.

const BUILD = {
  rubble(b, r) {
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const s = r.range(0.4, 1.0);
      b.box(s, s * r.range(0.5, 0.9), s * r.range(0.7, 1.2),
        r.range(-0.6, 0.6), s * 0.3, r.range(-0.6, 0.6), b.c(6, 0.25), r.range(0, TAU));
    }
  },
  canister(b, r) {
    b.cyl(0.35, 1.0, 0, 0.5, 0, b.c(3), 8);
    b.cyl(0.4, 0.12, 0, 1.02, 0, b.c(6), 8);
    b.cyl(0.4, 0.1, 0, 0.18, 0, b.c(6), 8);
  },
  crateSmall(b, r) {
    b.box(0.9, 0.8, 0.9, 0, 0.4, 0, b.c(1));
    b.box(0.98, 0.1, 0.15, 0, 0.4, 0, b.c(6));
    b.box(0.15, 0.1, 0.98, 0, 0.4, 0, b.c(6));
  },
  sign(b, r) {
    b.cyl(0.07, 1.3, 0, 0.65, 0, b.c(6), 6);
    b.box(1.0, 0.55, 0.08, 0, 1.2, 0, b.c(3));
    b.box(0.7, 0.22, 0.04, 0, 1.2, 0.07, b.c(5), 0, 'glow');
  },
  bush(b, r) {
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const s = r.range(0.4, 0.75);
      b.sph(s, r.range(-0.35, 0.35), s * r.range(0.6, 0.9), r.range(-0.35, 0.35), b.flora(i), 6, null, 0.85);
    }
  },
  marker(b, r) {
    b.box(0.7, 0.08, 0.7, 0, 0.04, 0, b.c(6));
    b.cone(0.28, 0.9, 0, 0.5, 0, b.c(4), 6);
    b.cyl(0.2, 0.1, 0, 0.55, 0, b.c(0), 6);
  },
  pipe(b, r) {
    const L = r.range(1.2, 2.0);
    b.cyl(0.22, L, 0, 0.22, 0, b.c(2), 8, 0, null, 0, Math.PI / 2);
    b.cyl(0.26, 0.1, -L / 2, 0.22, 0, b.c(6), 8, 0, null, 0, Math.PI / 2);
    b.cyl(0.26, 0.1, L / 2, 0.22, 0, b.c(6), 8, 0, null, 0, Math.PI / 2);
  },
  dronelet(b, r) {
    b.sph(0.34, 0, 0.5, 0, b.c(0), 6, null, 0.8);
    b.sph(0.16, 0, 0.5, 0.28, b.c(5), 6, 'glow');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.box(0.5, 0.05, 0.08, Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35, b.c(6), -a);
      b.cyl(0.2, 0.03, Math.cos(a) * 0.6, 0.56, Math.sin(a) * 0.6, b.c(3), 6);
    }
  },
  crate(b, r) {
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const w = r.range(0.8, 1.1);
      b.box(w, 0.8, w, r.range(-0.4, 0.4), 0.4 + i * 0.82, r.range(-0.4, 0.4), b.c(i % 3), r.range(-0.3, 0.3));
    }
  },
  barrel(b, r) {
    b.cyl(0.5, 1.3, 0, 0.65, 0, b.c(4), 10);
    b.cyl(0.54, 0.1, 0, 0.35, 0, b.c(6), 10);
    b.cyl(0.54, 0.1, 0, 0.95, 0, b.c(6), 10);
    b.cyl(0.45, 0.06, 0, 1.32, 0, b.c(6), 8);
  },
  rock(b, r) {
    const n = r.int(2, 3);
    for (let i = 0; i < n; i++) {
      const s = r.range(0.7, 1.3);
      b.sph(s * 0.6, r.range(-0.4, 0.4), s * 0.35, r.range(-0.4, 0.4), b.c(6, 0.3), 5, null, r.range(0.6, 1.0));
    }
  },
  pod(b, r) {
    b.sph(0.62, 0, 0.85, 0, b.c(0), 8, null, 1.15);
    b.sph(0.3, 0, 0.95, 0.5, b.c(5), 6, 'glow');
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.4;
      b.cyl(0.08, 0.7, Math.cos(a) * 0.42, 0.35, Math.sin(a) * 0.42, b.c(6), 6);
    }
  },
  bench(b, r) {
    b.box(1.8, 0.12, 0.55, 0, 0.5, 0, b.c(1));
    b.box(1.8, 0.5, 0.1, 0, 0.75, -0.22, b.c(1));
    b.box(0.12, 0.5, 0.5, -0.7, 0.25, 0, b.c(6));
    b.box(0.12, 0.5, 0.5, 0.7, 0.25, 0, b.c(6));
  },
  lamp(b, r) {
    b.cyl(0.2, 0.2, 0, 0.1, 0, b.c(6), 8);
    b.cyl(0.1, 2.6, 0, 1.3, 0, b.c(2), 6);
    b.box(0.5, 0.15, 0.5, 0.14, 2.6, 0, b.c(2));
    b.box(0.42, 0.12, 0.42, 0.22, 2.48, 0, b.c(5), 0, 'glow');
  },
  critter(b, r) {
    const body = b.flora(0);
    b.sph(0.5, 0, 0.6, 0, body, 7, null, 0.85);
    b.sph(0.28, 0, 0.75, 0.45, body, 6);
    b.sph(0.1, 0.1, 0.85, 0.62, 0xffffff, 5, 'glow');
    b.sph(0.1, -0.1, 0.85, 0.62, 0xffffff, 5, 'glow');
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -0.3 : 0.3, sz = i % 2 ? -0.28 : 0.28;
      b.cyl(0.08, 0.45, sx, 0.22, sz, b.c(6), 5);
    }
  },
  antenna(b, r) {
    b.box(0.8, 0.16, 0.8, 0, 0.08, 0, b.c(6));
    b.cyl(0.09, 2.8, 0, 1.4, 0, b.c(2), 6);
    for (let i = 0; i < 3; i++) b.box(0.9 - i * 0.2, 0.06, 0.06, 0, 1.6 + i * 0.4, 0, b.c(2));
    b.sph(0.14, 0, 2.85, 0, b.c(4), 5, 'glow');
  },
  cart(b, r) {
    b.box(1.9, 0.7, 1.1, 0, 0.75, 0, b.c(0));
    b.box(1.4, 0.35, 0.9, -0.1, 1.25, 0, b.c(3));
    for (let i = 0; i < 4; i++) {
      b.cyl(0.34, 0.18, i < 2 ? -0.65 : 0.65, 0.34, i % 2 ? -0.5 : 0.5, b.c(6), 8, 0, null, 0, Math.PI / 2);
    }
  },
  hovercar(b, r) {
    const body = b.c(r.int(3, 4), 0.18);
    b.box(3.0, 0.5, 1.35, 0, 0.75, 0, body);
    b.box(1.7, 0.45, 1.2, -0.15, 1.15, 0, b.c(5, 0.1), 0, 'glow');
    b.box(2.6, 0.2, 1.1, 0, 0.5, 0, b.c(6));
    b.box(0.5, 0.12, 1.0, 1.5, 0.75, 0, b.c(5), 0, 'glow');
    b.box(0.4, 0.12, 1.0, -1.5, 0.75, 0, 0xff4a3a, 0, 'glow');
    for (let i = 0; i < 2; i++) b.cyl(0.3, 0.16, i ? 1.0 : -1.0, 0.35, 0, b.c(6), 8);
  },
  kiosk(b, r) {
    b.box(2.0, 2.2, 1.8, 0, 1.1, 0, b.c(0));
    b.box(2.3, 0.18, 2.2, 0, 2.3, 0.1, b.c(3));
    b.box(1.5, 0.9, 0.1, 0, 1.5, 0.92, b.c(5), 0, 'glow');
    b.box(1.6, 0.3, 0.12, 0, 2.5, 0.2, b.c(4), 0, 'glow');
  },
  tree(b, r, pal, tall) {
    const h = tall ? r.range(3.4, 4.6) : r.range(2.2, 3.0);
    b.cylT(0.16, 0.3, h, 0, h / 2, 0, b.c(6, 0.2), 6);
    const layers = r.int(2, 4);
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const rad = (1.5 - t * 0.7) * (tall ? 1.25 : 1);
      b.sph(rad, r.range(-0.2, 0.2), h * (0.7 + t * 0.32), r.range(-0.2, 0.2), b.flora(i), 6, null, 0.8);
    }
  },
  treeBig(b, r, pal) { BUILD.tree(b, r, pal, true); },
  spireTree(b, r) {
    const h = r.range(4, 6);
    b.cylT(0.1, 0.45, h, 0, h / 2, 0, b.c(6, 0.2), 6);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      b.cone(1.5 - t * 1.1, 1.6, 0, h * (0.42 + t * 0.19), 0, b.flora(i), 7);
    }
  },
  statue(b, r) {
    b.box(1.6, 0.5, 1.6, 0, 0.25, 0, b.c(2));
    b.box(1.2, 0.35, 1.2, 0, 0.66, 0, b.c(1));
    b.cyl(0.35, 1.6, 0, 1.65, 0, b.c(0), 7);
    b.sph(0.36, 0, 2.6, 0, b.c(0), 7);
    b.box(1.5, 0.14, 0.16, 0, 2.15, 0, b.c(0), r.range(-0.4, 0.4));
  },
  generator(b, r) {
    b.box(2.2, 0.4, 2.2, 0, 0.2, 0, b.c(6));
    b.cyl(0.75, 2.4, -0.5, 1.4, 0, b.c(2), 10);
    b.cyl(0.5, 1.7, 0.75, 1.05, 0.4, b.c(1), 8);
    for (let i = 0; i < 3; i++) b.torus(0.8, 0.09, -0.5, 0.8 + i * 0.6, 0, b.c(4), 10, 'glow');
    b.sph(0.22, 0.75, 2.0, 0.4, b.c(5), 6, 'glow');
  },
  stall(b, r) {
    for (let i = 0; i < 4; i++) b.cyl(0.07, 2.0, i < 2 ? -1.1 : 1.1, 1.0, i % 2 ? -0.8 : 0.8, b.c(6), 5);
    b.box(2.6, 0.14, 2.0, 0, 2.05, 0, b.c(4));
    b.box(2.4, 0.5, 0.6, 0, 0.9, -0.6, b.c(0));
    for (let i = 0; i < 3; i++) b.box(0.3, 0.3, 0.3, -0.7 + i * 0.7, 1.3, 0.3, b.flora(i), r.range(0, 1));
  },
  bus(b, r) {
    const body = b.c(r.int(3, 4), 0.15);
    b.box(6.4, 1.9, 2.3, 0, 1.5, 0, body);
    b.box(6.5, 0.5, 2.35, 0, 2.6, 0, b.c(0));
    for (let i = 0; i < 5; i++) b.box(0.9, 0.75, 0.08, -2.4 + i * 1.2, 1.85, 1.18, b.c(5), 0, 'glow');
    for (let i = 0; i < 5; i++) b.box(0.9, 0.75, 0.08, -2.4 + i * 1.2, 1.85, -1.18, b.c(5), 0, 'glow');
    b.box(0.3, 0.7, 1.9, 3.25, 1.8, 0, b.c(5), 0, 'glow');
    for (let i = 0; i < 4; i++) b.cyl(0.55, 0.4, i < 2 ? -2.1 : 2.1, 0.55, i % 2 ? -1.05 : 1.05, b.c(6), 10, 0, null, 0, Math.PI / 2);
  },
  hut(b, r) {
    const w = r.range(3.4, 4.4), d = r.range(3.0, 4.0);
    b.box(w, 2.4, d, 0, 1.2, 0, b.c(0));
    b.cone(Math.max(w, d) * 0.78, 1.7, 0, 3.2, 0, b.c(3), 4, Math.PI / 4);
    b.box(0.9, 1.5, 0.12, 0, 0.75, d / 2 + 0.05, b.c(6));
    b.box(0.8, 0.8, 0.1, w / 2 + 0.03, 1.5, 0, b.c(5), 0, 'glow');
  },
  siloSmall(b, r) {
    b.cyl(1.3, 4.0, 0, 2.0, 0, b.c(1), 12);
    b.sph(1.3, 0, 4.0, 0, b.c(3), 10, null, 0.55);
    for (let i = 0; i < 2; i++) b.torus(1.35, 0.1, 0, 1.2 + i * 1.5, 0, b.c(6), 12);
    b.box(0.6, 3.6, 0.2, 1.35, 1.8, 0, b.c(6));
  },
  dish(b, r) {
    b.box(2.4, 0.4, 2.4, 0, 0.2, 0, b.c(2));
    b.cyl(0.4, 2.2, 0, 1.3, 0, b.c(1), 8);
    b.cylT(2.0, 0.35, 1.3, 0, 3.1, 0, b.c(0), 12);
    b.cyl(0.12, 1.2, 0, 3.4, 0, b.c(6), 5);
    b.sph(0.25, 0, 4.0, 0, b.c(5), 6, 'glow');
  },
  mech(b, r) {
    b.box(2.2, 1.6, 1.8, 0, 3.2, 0, b.c(0));
    b.box(1.4, 0.6, 1.2, 0, 4.2, 0, b.c(2));
    b.box(0.9, 0.35, 0.12, 0, 4.2, 0.62, b.c(5), 0, 'glow');
    for (let i = 0; i < 2; i++) {
      const sx = i ? 1.0 : -1.0;
      b.cyl(0.28, 1.6, sx * 1.3, 3.4, 0, b.c(6), 6);
      b.cyl(0.3, 1.8, sx * 0.7, 1.5, 0, b.c(2), 6);
      b.cyl(0.26, 1.5, sx * 0.7, 0.75, 0.3, b.c(6), 6);
      b.box(0.7, 0.24, 1.2, sx * 0.7, 0.12, 0.2, b.c(6));
    }
  },
  containers(b, r) {
    const n = r.int(3, 6);
    for (let i = 0; i < n; i++) {
      const x = r.range(-1.2, 1.2), y = 0.9 + Math.floor(i / 2) * 1.85, z = r.range(-0.8, 0.8);
      b.box(4.6, 1.8, 2.0, x, y, z, b.c(r.int(0, 4), 0.2), r.range(-0.15, 0.15));
      b.box(0.1, 1.5, 1.9, x + 2.3, y, z, b.c(6), 0);
    }
  },
  house(b, r) {
    const w = r.range(5, 7), d = r.range(4.5, 6);
    const floors = r.int(2, 3);
    b.box(w, floors * 2.4, d, 0, floors * 1.2, 0, b.c(r.int(0, 2)));
    b.windows(w, d, floors * 2.4, 0, floors, b.c(5, 0), 0.03);
    if (r.chance(0.6)) {
      b.box(w * 1.06, 0.5, d * 1.06, 0, floors * 2.4 + 0.25, 0, b.c(3));
      b.cone(Math.max(w, d) * 0.72, 1.9, 0, floors * 2.4 + 1.3, 0, b.c(3), 4, Math.PI / 4);
    } else {
      b.box(w * 1.04, 0.35, d * 1.04, 0, floors * 2.4 + 0.18, 0, b.c(6));
      b.box(0.8, 1.2, 0.8, w * 0.28, floors * 2.4 + 0.7, d * 0.2, b.c(2));
    }
    b.box(1.1, 2.0, 0.14, 0, 1.0, d / 2 + 0.05, b.c(4));
  },
  silo(b, r) {
    const n = r.int(2, 3);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 3.1;
      b.cyl(1.5, 7.0, x, 3.5, 0, b.c(i % 2), 12);
      b.cone(1.6, 1.5, x, 7.7, 0, b.c(3), 12);
      b.torus(1.55, 0.11, x, 5.4, 0, b.c(6), 12);
    }
    b.box(n * 3.1, 0.5, 0.6, 0, 7.2, 0, b.c(6));
  },
  shuttle(b, r) {
    b.cylT(0.5, 1.5, 7.5, 0, 3.9, 0, b.c(0), 10);
    b.cone(1.5, 2.0, 0, 8.3, 0, b.c(3), 10);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      b.box(0.3, 2.6, 1.8, Math.cos(a) * 1.5, 1.3, Math.sin(a) * 1.5, b.c(2), -a);
      b.cyl(0.45, 0.9, Math.cos(a) * 1.0, 0.5, Math.sin(a) * 1.0, b.c(6), 8);
      b.sph(0.35, Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0, b.c(4), 6, 'glow');
    }
    for (let i = 0; i < 3; i++) b.box(0.9, 0.5, 0.1, 0, 5.5 + i * 0.9, 1.35, b.c(5), 0, 'glow');
  },
  watchtower(b, r) {
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -1.4 : 1.4, sz = i % 2 ? -1.4 : 1.4;
      b.cyl(0.22, 8.0, sx * 0.8, 4.0, sz * 0.8, b.c(2), 6);
    }
    for (let j = 1; j < 4; j++) {
      b.box(2.8, 0.2, 0.2, 0, j * 2.0, -1.1, b.c(6));
      b.box(0.2, 0.2, 2.8, -1.1, j * 2.0, 0, b.c(6));
    }
    b.box(4.0, 1.8, 4.0, 0, 8.9, 0, b.c(0));
    b.box(4.3, 0.3, 4.3, 0, 9.9, 0, b.c(3));
    b.box(3.4, 0.8, 0.1, 0, 9.1, 2.05, b.c(5), 0, 'glow');
    b.box(0.1, 0.8, 3.4, 2.05, 9.1, 0, b.c(5), 0, 'glow');
  },
  arch(b, r) {
    const w = 7;
    b.box(1.4, 7.0, 1.6, -w / 2, 3.5, 0, b.c(0));
    b.box(1.4, 7.0, 1.6, w / 2, 3.5, 0, b.c(0));
    b.box(w + 1.6, 1.4, 1.8, 0, 7.6, 0, b.c(1));
    b.box(w - 1, 0.5, 0.2, 0, 7.6, 0.95, b.c(5), 0, 'glow');
    b.cone(0.9, 1.4, -w / 2, 7.9, 0, b.c(3), 6);
    b.cone(0.9, 1.4, w / 2, 7.9, 0, b.c(3), 6);
  },
  blockhouse(b, r) {
    const w = r.range(7, 10), d = r.range(6, 9), floors = r.int(4, 7);
    const h = floors * 2.6;
    b.box(w, h, d, 0, h / 2, 0, b.c(r.int(0, 2)));
    b.windows(w, d, h, 0, floors, b.c(5, 0), 0.04);
    b.box(w * 1.05, 0.5, d * 1.05, 0, h + 0.25, 0, b.c(6));
    b.box(w * 0.35, 1.4, d * 0.35, w * 0.2, h + 1.0, 0, b.c(2));
    b.cyl(0.08, 3.0, -w * 0.3, h + 1.5, d * 0.3, b.c(6), 5);
  },
  hangar(b, r) {
    const L = 14, W = 9;
    b.box(L, 3.0, W, 0, 1.5, 0, b.c(1));
    b.cyl(W / 2, L, 0, 3.0, 0, b.c(0), 12, 0, null, 0, Math.PI / 2);
    b.box(0.4, 4.5, W * 0.75, L / 2, 2.25, 0, b.c(6));
    for (let i = 0; i < 6; i++) b.box(0.1, 0.9, 1.0, -L / 2 - 0.02, 2.0, -W * 0.35 + i * (W * 0.14), b.c(5), 0, 'glow');
    b.box(3.0, 0.6, 3.0, -L * 0.2, 6.4, 0, b.c(2));
    b.sph(0.3, -L * 0.2, 7.0, 0, b.c(4), 6, 'glow');
  },
  refinery(b, r) {
    for (let i = 0; i < 4; i++) {
      const x = r.range(-4, 4), z = r.range(-4, 4), h = r.range(6, 13);
      b.cyl(r.range(0.6, 1.2), h, x, h / 2, z, b.c(i % 3), 8);
      b.torus(1.0, 0.12, x, h * 0.7, z, b.c(4), 10, 'glow');
      if (r.chance(0.5)) b.cone(0.7, 1.0, x, h + 0.5, z, b.c(4), 6, 0, 'glow');
    }
    b.box(11, 0.5, 11, 0, 0.25, 0, b.c(6));
    for (let i = 0; i < 3; i++) b.box(9, 0.3, 0.3, 0, 3 + i * 3, -3 + i * 3, b.c(2));
    b.box(3.0, 2.5, 3.0, 4.0, 1.25, -4.0, b.c(0));
  },
  domeBuilding(b, r) {
    b.cyl(6.0, 3.5, 0, 1.75, 0, b.c(0), 16);
    b.sph(6.0, 0, 3.5, 0, b.c(5, 0.05), 14, null, 0.75);
    b.torus(6.1, 0.25, 0, 3.5, 0, b.c(3), 16);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      b.box(0.25, 3.6, 0.25, Math.cos(a) * 6.0, 1.8, Math.sin(a) * 6.0, b.c(2), -a);
    }
    b.box(3.0, 2.4, 1.0, 0, 1.2, 6.0, b.c(2));
    b.box(2.2, 1.6, 0.1, 0, 1.2, 6.55, b.c(4), 0, 'glow');
  },
  hauler(b, r) {
    b.box(13, 2.6, 4.2, 0, 2.6, 0, b.c(1));
    b.box(4.0, 2.4, 4.0, -5.6, 4.6, 0, b.c(0));
    b.box(3.2, 1.2, 0.12, -5.6, 4.9, 2.05, b.c(5), 0, 'glow');
    for (let i = 0; i < 3; i++) b.box(3.6, 2.2, 3.8, 0.5 + i * 3.8 - 3.0, 4.6, 0, b.c(r.int(3, 4), 0.2));
    for (let i = 0; i < 8; i++) {
      b.cyl(0.85, 0.6, -5.5 + i * 1.7, 0.85, i % 2 ? -2.0 : 2.0, b.c(6), 10, 0, null, 0, Math.PI / 2);
    }
  },
  tower(b, r) {
    const floors = r.int(9, 16);
    const w = r.range(6.5, 9), d = r.range(6, 8.5);
    let y = 0, cw = w, cd = d;
    const steps = r.int(2, 3);
    for (let s = 0; s < steps; s++) {
      const f = Math.max(3, Math.round(floors / steps));
      const h = f * 3.0;
      b.box(cw, h, cd, 0, y + h / 2, 0, b.c(s % 3));
      b.windows(cw, cd, h, y, f, b.c(5, 0), 0.05);
      b.box(cw * 1.04, 0.4, cd * 1.04, 0, y + h + 0.2, 0, b.c(6));
      y += h + 0.4;
      cw *= r.range(0.7, 0.85); cd *= r.range(0.7, 0.85);
    }
    b.cyl(0.12, 6, 0, y + 3, 0, b.c(6), 5);
    b.sph(0.35, 0, y + 6, 0, 0xff3a3a, 6, 'glow');
  },
  spire(b, r) {
    b.box(8, 5, 8, 0, 2.5, 0, b.c(0));
    b.box(6, 4, 6, 0, 7.0, 0, b.c(1));
    b.cylT(1.2, 3.6, 12, 0, 15.0, 0, b.c(0), 8);
    b.cone(1.4, 6, 0, 24, 0, b.c(3), 8);
    b.sph(0.5, 0, 27.2, 0, b.c(4), 6, 'glow');
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.78;
      b.cylT(0.5, 1.0, 8, Math.cos(a) * 3.6, 4, Math.sin(a) * 3.6, b.c(2), 6);
      b.cone(0.9, 2.4, Math.cos(a) * 3.6, 9.2, Math.sin(a) * 3.6, b.c(3), 6);
    }
    for (let i = 0; i < 6; i++) b.box(1.0, 2.2, 0.15, -3 + i * 1.2, 3.2, 4.05, b.c(5), 0, 'glow');
  },
  colossus(b, r) {
    b.cyl(5.0, 2.0, 0, 1.0, 0, b.c(2), 8);
    b.box(6.0, 1.5, 6.0, 0, 2.7, 0, b.c(1));
    b.cyl(1.4, 9.0, -1.6, 8.0, 0, b.c(0), 8);
    b.cyl(1.4, 9.0, 1.6, 8.0, 0, b.c(0), 8);
    b.box(5.4, 7.0, 3.2, 0, 15.5, 0, b.c(0));
    b.box(4.2, 1.4, 3.4, 0, 19.5, 0, b.c(2));
    b.sph(1.8, 0, 21.0, 0, b.c(0), 8);
    b.box(2.2, 0.5, 0.4, 0, 21.2, 1.5, b.c(4), 0, 'glow');
    b.cyl(1.0, 8.0, -3.6, 16.0, 0, b.c(0), 7, 0, null, 0, 0.35);
    b.cyl(1.0, 9.5, 3.9, 17.5, 0, b.c(0), 7, 0, null, 0, -0.25);
    b.cyl(0.5, 7.0, 5.6, 23.0, 0, b.c(4), 6, 0, 'glow');
  },
  gantry(b, r) {
    b.box(12, 1.0, 12, 0, 0.5, 0, b.c(6));
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -4.5 : 4.5, sz = i % 2 ? -4.5 : 4.5;
      b.cyl(0.4, 22, sx, 11, sz, b.c(2), 6);
    }
    for (let j = 1; j < 6; j++) {
      b.box(9.4, 0.3, 0.3, 0, j * 3.6, -4.5, b.c(6));
      b.box(9.4, 0.3, 0.3, 0, j * 3.6, 4.5, b.c(6));
      b.box(0.3, 0.3, 9.4, -4.5, j * 3.6, 0, b.c(6));
    }
    b.cylT(1.0, 2.6, 20, 0, 11, 0, b.c(0), 10);
    b.cone(2.6, 6, 0, 24, 0, b.c(3), 10);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.78;
      b.box(0.5, 5, 1.6, Math.cos(a) * 2.4, 2.5, Math.sin(a) * 2.4, b.c(2), -a);
    }
    b.sph(1.6, 0, 0.6, 0, b.c(4), 8, 'glow');
    b.box(4.0, 2.5, 4.0, 7.5, 1.25, 7.5, b.c(1));
  },
};

// ── landmarks: one signature megastructure per act ──────────────────────────

const LANDMARK = {
  scrap(b, r) { // the Breaker Crane
    b.box(16, 2, 16, 0, 1, 0, b.c(6));
    b.cyl(2.4, 26, 0, 13, 0, b.c(2), 10);
    b.box(30, 2.2, 3.0, 6, 26, 0, b.c(3));
    b.box(3, 2.4, 3, 18, 24.5, 0, b.c(1));
    b.cyl(0.25, 9, 18, 20, 0, b.c(6), 5);
    b.sph(3.0, 18, 13.5, 0, b.c(6), 8);
    b.box(6, 5, 6, -9, 27, 0, b.c(0));
    b.box(4, 2, 0.2, -9, 27, 3.1, b.c(5), 0, 'glow');
    for (let i = 0; i < 5; i++) b.box(3, 2, 3, r.range(-7, 7), 2.5, r.range(-7, 7), b.c(r.int(0, 4), 0.3), r.range(0, 1));
  },
  colony(b, r) { // the Seed Ark
    b.cyl(11, 4, 0, 2, 0, b.c(2), 16);
    b.cylT(6, 11, 14, 0, 11, 0, b.c(0), 16);
    b.sph(7.5, 0, 20, 0, b.c(5, 0.05), 14, null, 0.9);
    b.torus(9.0, 0.5, 0, 17.5, 0, b.c(3), 18);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      b.box(2.0, 12, 1.2, Math.cos(a) * 10, 6, Math.sin(a) * 10, b.c(1), -a);
      b.sph(0.7, Math.cos(a) * 10, 12.6, Math.sin(a) * 10, b.c(4), 6, 'glow');
    }
    b.cone(3.0, 8, 0, 30, 0, b.c(3), 12);
    b.sph(1.0, 0, 34.5, 0, b.c(4), 8, 'glow');
  },
  hive(b, r) { // the Broadcast Needle
    b.box(18, 3, 18, 0, 1.5, 0, b.c(6));
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? -6 : 6, sz = i % 2 ? -6 : 6;
      b.cylT(1.0, 2.2, 22, sx, 11, sz, b.c(2), 8);
    }
    b.box(15, 3, 15, 0, 23, 0, b.c(1));
    b.cylT(1.4, 5.0, 30, 0, 39, 0, b.c(0), 12);
    b.sph(5.0, 0, 44, 0, b.c(3), 12, null, 0.8);
    b.torus(6.5, 0.4, 0, 44, 0, b.c(4), 20, 'glow');
    b.cyl(0.4, 14, 0, 56, 0, b.c(6), 6);
    b.sph(1.2, 0, 63, 0, 0xff3355, 8, 'glow');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      b.box(0.5, 0.5, 5, Math.cos(a) * 6.5, 30 + (i % 3) * 6, Math.sin(a) * 6.5, b.c(5), -a, 'glow');
    }
  },
  sanctum(b, r) { // the World Tree
    b.cylT(2.0, 7.0, 22, 0, 11, 0, b.c(6, 0.15), 10);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r.range(-0.3, 0.3);
      const rad = r.range(7, 12), y = r.range(16, 26);
      b.sph(r.range(4, 7), Math.cos(a) * rad, y, Math.sin(a) * rad, b.flora(i), 8, null, 0.75);
      b.cyl(0.6, rad * 1.1, Math.cos(a) * rad * 0.5, y * 0.75, Math.sin(a) * rad * 0.5, b.c(6), 6, -a + Math.PI / 2, null, 0, 0.9);
    }
    b.sph(8, 0, 30, 0, b.flora(1), 10, null, 0.7);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      b.sph(0.5, Math.cos(a) * r.range(6, 11), r.range(18, 30), Math.sin(a) * r.range(6, 11), b.c(4), 5, 'glow');
    }
  },
  verge(b, r) { // the Guild Core
    b.cyl(14, 3, 0, 1.5, 0, b.c(6), 12);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      b.box(4, 20, 4, Math.cos(a) * 11, 10, Math.sin(a) * 11, b.c(0), -a);
      b.box(3, 1, 3, Math.cos(a) * 11, 20.5, Math.sin(a) * 11, b.c(3));
      b.sph(0.8, Math.cos(a) * 11, 21.5, Math.sin(a) * 11, b.c(4), 6, 'glow');
    }
    b.sph(7, 0, 22, 0, b.c(6), 12);
    b.torus(10, 0.7, 0, 22, 0, b.c(3), 22, 'glow');
    b.torus(10, 0.7, 0, 22, 0, b.c(4), 22, 'glow', 0);
    b.cylT(1.0, 3.0, 16, 0, 30, 0, b.c(0), 10);
    b.sph(2.5, 0, 40, 0, b.c(5), 10, 'glow');
  },
};

// ── the catalogue ───────────────────────────────────────────────────────────
// weight = how common; acts = which acts it appears in (0-based, 5 = events)

export const PROP_DEFS = [
  { kind: 'rubble', tier: 1, build: BUILD.rubble, weight: 10, acts: [0, 1, 2, 3, 4] },
  { kind: 'canister', tier: 1, build: BUILD.canister, weight: 7, acts: [0, 1, 2, 4] },
  { kind: 'crateSmall', tier: 1, build: BUILD.crateSmall, weight: 8, acts: [0, 1, 2, 4] },
  { kind: 'sign', tier: 1, build: BUILD.sign, weight: 6, acts: [0, 1, 2, 3, 4] },
  { kind: 'bush', tier: 1, build: BUILD.bush, weight: 9, acts: [0, 1, 3] },
  { kind: 'marker', tier: 1, build: BUILD.marker, weight: 5, acts: [0, 2, 4] },
  { kind: 'pipe', tier: 1, build: BUILD.pipe, weight: 5, acts: [0, 2, 4] },
  { kind: 'dronelet', tier: 1, build: BUILD.dronelet, weight: 4, acts: [1, 2, 3, 4], mover: 'hover' },

  { kind: 'crate', tier: 2, build: BUILD.crate, weight: 8, acts: [0, 1, 2, 4] },
  { kind: 'barrel', tier: 2, build: BUILD.barrel, weight: 8, acts: [0, 1, 2, 4] },
  { kind: 'rock', tier: 2, build: BUILD.rock, weight: 8, acts: [0, 1, 3] },
  { kind: 'pod', tier: 2, build: BUILD.pod, weight: 5, acts: [0, 1, 3, 4] },
  { kind: 'bench', tier: 2, build: BUILD.bench, weight: 4, acts: [1, 2, 3] },
  { kind: 'lamp', tier: 2, build: BUILD.lamp, weight: 7, acts: [1, 2, 3, 4] },
  { kind: 'critter', tier: 2, build: BUILD.critter, weight: 5, acts: [0, 1, 3], mover: 'walk' },
  { kind: 'antenna', tier: 2, build: BUILD.antenna, weight: 5, acts: [0, 2, 4] },

  { kind: 'cart', tier: 3, build: BUILD.cart, weight: 5, acts: [0, 1] },
  { kind: 'hovercar', tier: 3, build: BUILD.hovercar, weight: 9, acts: [1, 2, 3, 4], mover: 'drive' },
  { kind: 'kiosk', tier: 3, build: BUILD.kiosk, weight: 5, acts: [1, 2, 3] },
  { kind: 'tree', tier: 3, build: BUILD.tree, weight: 9, acts: [0, 1, 3] },
  { kind: 'spireTree', tier: 3, build: BUILD.spireTree, weight: 6, acts: [3] },
  { kind: 'statue', tier: 3, build: BUILD.statue, weight: 3, acts: [1, 2, 3, 4] },
  { kind: 'generator', tier: 3, build: BUILD.generator, weight: 5, acts: [0, 2, 4] },
  { kind: 'stall', tier: 3, build: BUILD.stall, weight: 4, acts: [1, 3] },

  { kind: 'bus', tier: 4, build: BUILD.bus, weight: 5, acts: [1, 2, 3], mover: 'drive' },
  { kind: 'hut', tier: 4, build: BUILD.hut, weight: 6, acts: [0, 1, 3] },
  { kind: 'treeBig', tier: 4, build: BUILD.treeBig, weight: 6, acts: [1, 3] },
  { kind: 'siloSmall', tier: 4, build: BUILD.siloSmall, weight: 5, acts: [0, 1, 2, 4] },
  { kind: 'dish', tier: 4, build: BUILD.dish, weight: 4, acts: [0, 2, 4] },
  { kind: 'mech', tier: 4, build: BUILD.mech, weight: 3, acts: [2, 4], mover: 'walk' },
  { kind: 'containers', tier: 4, build: BUILD.containers, weight: 6, acts: [0, 2, 4] },

  { kind: 'house', tier: 5, build: BUILD.house, weight: 9, acts: [1, 2, 3] },
  { kind: 'silo', tier: 5, build: BUILD.silo, weight: 4, acts: [0, 1, 2, 4] },
  { kind: 'shuttle', tier: 5, build: BUILD.shuttle, weight: 4, acts: [0, 2, 4] },
  { kind: 'watchtower', tier: 5, build: BUILD.watchtower, weight: 4, acts: [0, 2, 3, 4] },
  { kind: 'arch', tier: 5, build: BUILD.arch, weight: 3, acts: [1, 3, 4] },

  { kind: 'blockhouse', tier: 6, build: BUILD.blockhouse, weight: 8, acts: [1, 2, 4] },
  { kind: 'hangar', tier: 6, build: BUILD.hangar, weight: 5, acts: [0, 2, 4] },
  { kind: 'refinery', tier: 6, build: BUILD.refinery, weight: 5, acts: [0, 2, 4] },
  { kind: 'domeBuilding', tier: 6, build: BUILD.domeBuilding, weight: 5, acts: [1, 3] },
  { kind: 'hauler', tier: 6, build: BUILD.hauler, weight: 3, acts: [0, 2, 4], mover: 'drive' },

  { kind: 'tower', tier: 7, build: BUILD.tower, weight: 8, acts: [1, 2, 4] },
  { kind: 'spire', tier: 7, build: BUILD.spire, weight: 5, acts: [2, 3, 4] },
  { kind: 'colossus', tier: 7, build: BUILD.colossus, weight: 3, acts: [2, 3, 4] },
  { kind: 'gantry', tier: 7, build: BUILD.gantry, weight: 4, acts: [0, 2, 4] },
];

export const DEF_BY_KIND = Object.fromEntries(PROP_DEFS.map((d) => [d.kind, d]));

/** footprint radius a prop of this tier gets */
export function tierRadius(tier) { return TIER_R[tier] * 0.62; }

/**
 * Build every proto needed for a theme. Returns
 *   { protos: { kind: [ {solid, glow, height}, ... ] }, defs }
 * `variants` geometry variations per kind keeps a sector from looking stamped.
 */
export function buildProtos(themeObj, seed, kinds, variants, lowDetail) {
  const protos = {};
  const rng = makeRng(seed);
  for (const kind of kinds) {
    const def = DEF_BY_KIND[kind];
    if (!def) continue;
    const list = [];
    const n = variants || 3;
    for (let v = 0; v < n; v++) {
      const b = new B(themeObj, makeRng(seed + kind.length * 977 + v * 31 + kind.charCodeAt(0) * 13));
      b.lowDetail = !!lowDetail;
      def.build(b, b.rng, themeObj);
      list.push(b.finish(tierRadius(def.tier)));
    }
    protos[kind] = list;
  }
  return protos;
}

/** The act's landmark (tier 8). */
export function buildLandmark(themeKey, themeObj, seed) {
  const fn = LANDMARK[themeKey] || LANDMARK.scrap;
  const b = new B(themeObj, makeRng(seed));
  fn(b, b.rng, themeObj);
  return b.finish(tierRadius(8));
}

export function propValue(tier) { return TIER_VALUE[tier]; }

// ── materials shared by every instanced field ───────────────────────────────

export function makeSolidMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
export function makeGlowMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
}
