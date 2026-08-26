// Geometry construction kit. Everything in the game is built from these, in code, flat-shaded,
// with vertex colours, then merged into ONE BufferGeometry per model so a prop is one draw call
// (and an InstancedMesh of that prop is still one draw call for all of them).
//
// Convention: STRUCTURES are authored in x[-1,1], y[0,2], z[-1,1] and scaled by the ent's
// half-extents at instance time. AIRCRAFT are authored nose-right in x[-0.5,0.5] and scaled by
// `len`. Nothing here allocates per frame.

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

const cacheBox = new THREE.BoxGeometry(1, 1, 1);

export function builder() {
  const chunks = [];
  let count = 0;

  function push(geo, hex, tint) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(hex);
    for (let i = 0; i < n; i++) {
      let r = _c.r, gg = _c.g, b = _c.b;
      if (tint) {
        // a touch of vertical shading so a flat box still reads as lit
        const y = g.attributes.position.getY(i);
        const k = 1 + Math.max(-0.35, Math.min(0.35, y * tint));
        r *= k; gg *= k; b *= k;
      }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    chunks.push(g);
    count += n;
    return api;
  }

  const api = {
    /** w,h,d are FULL sizes; x,y,z is the centre. */
    box(w, h, d, x, y, z, hex, o = {}) {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      _q.setFromEuler(_e);
      _v.set(w, h, d);
      _m.compose(new THREE.Vector3(x, y, z), _q, _v);
      return push(cacheBox, hex, o.tint ?? 0.10);
    },
    cyl(rTop, rBot, h, seg, x, y, z, hex, o = {}) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!o.open);
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      _q.setFromEuler(_e);
      _v.set(1, 1, 1);
      _m.compose(new THREE.Vector3(x, y, z), _q, _v);
      push(g, hex, o.tint ?? 0.08);
      g.dispose();
      return api;
    },
    sphere(r, x, y, z, hex, o = {}) {
      const g = new THREE.SphereGeometry(r, o.seg || 8, o.rings || 6);
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      _q.setFromEuler(_e);
      _v.set(o.sx || 1, o.sy || 1, o.sz || 1);
      _m.compose(new THREE.Vector3(x, y, z), _q, _v);
      push(g, hex, o.tint ?? 0.08);
      g.dispose();
      return api;
    },
    cone(r, h, seg, x, y, z, hex, o = {}) {
      const g = new THREE.ConeGeometry(r, h, seg || 6, 1);
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      _q.setFromEuler(_e);
      _v.set(1, 1, 1);
      _m.compose(new THREE.Vector3(x, y, z), _q, _v);
      push(g, hex, o.tint ?? 0.08);
      g.dispose();
      return api;
    },
    /** A flat plate in the XY plane, `d` deep — the workhorse for wings and fins. */
    plate(pts, d, z, hex, o = {}) {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 2 });
      g.translate(0, 0, z - d / 2);
      _m.identity();
      if (o.rx || o.ry || o.rz) {
        _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
        _q.setFromEuler(_e);
        _m.compose(new THREE.Vector3(0, 0, 0), _q, new THREE.Vector3(1, 1, 1));
      }
      push(g, hex, o.tint ?? 0.06);
      g.dispose();
      return api;
    },
    /** A symmetric pair about z. */
    pair(fn) { fn(1); fn(-1); return api; },

    vertCount() { return count; },

    done() {
      if (!chunks.length) return new THREE.BufferGeometry();
      let total = 0;
      for (const g of chunks) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      const col = new Float32Array(total * 3);
      let o = 0;
      for (const g of chunks) {
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      }
      chunks.length = 0;
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.computeBoundingSphere();
      out.computeBoundingBox();
      return out;
    },
  };
  return api;
}

/** Scale a finished geometry so its bounding box fits a target box, keeping the base at y=0. */
export function normaliseStructure(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const sx = 2 / Math.max(0.001, bb.max.x - bb.min.x);
  const sy = 2 / Math.max(0.001, bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, 0);
  geo.scale(sx, sy, 1);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
