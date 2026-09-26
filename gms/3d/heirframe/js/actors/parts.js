import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { BI } from './rig.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

export function mat4(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  if (typeof s === 'number') s = [s, s, s];
  _e.set(r[0], r[1], r[2], 'XYZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.fromArray(p), _q, _s.fromArray(s));
}

// Collects rigid parts per bone and material slot, merges them into one skinned geometry.
export class PartBuilder {
  constructor(rig, quality = 'high', lod = 'near') {
    this.rig = rig;
    this.q = lod === 'far' || lod === 'tiny' ? 'low' : quality;
    this.far = lod === 'far' || lod === 'tiny';
    this.k = lod === 'tiny' ? 0.26 : this.q === 'high' ? 0.8 : this.q === 'med' ? 0.6 : 0.42;
    this.slots = new Map();
    this.pre = null;
  }
  n(x) { return Math.max(3, Math.round(x * this.k)); }

  scope(p, r, s, fn) { const old = this.pre; this.pre = mat4(p, r, s); fn(); this.pre = old; }

  add(geom, bone, slot, p, r, s) { this._push(geom, bone, slot, mat4(p, r, s), false); return this; }

  // Left-side part mirrored onto the right bone automatically. `bone` is the base name ('thigh') or a centre bone
  // (mirrors across the body's x = 0 plane, so only use centre bones that sit on x = 0).
  sym(geom, bone, slot, p, r, s) {
    const m = mat4(p, r, s);
    const center = !(bone + 'L' in BI);
    this._push(geom.clone(), center ? bone : bone + 'L', slot, m, false);
    this._push(geom, center ? bone : bone + 'R', slot, m, true, center ? bone : bone + 'L');
    return this;
  }

  _push(g, bone, slot, local, mirror, srcBone) {
    const w = this.rig.world[srcBone || bone];
    const m = new THREE.Matrix4().makeTranslation(w[0], w[1], w[2]);
    if (this.pre) m.multiply(this.pre);
    m.multiply(local);
    if (mirror) m.premultiply(MIRROR);
    if (!g.index) {
      const n = g.attributes.position.count, idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    }
    const bi = BI[bone];
    if (bi === undefined) throw new Error('robots: unknown bone ' + bone);
    if (!this.slots.has(slot)) this.slots.set(slot, []);
    this.slots.get(slot).push({ g, bi });
  }

  build(order) {
    const used = order.filter((s) => this.slots.has(s));
    for (const s of this.slots.keys()) if (!used.includes(s)) throw new Error('robots: slot not in order ' + s);
    let nv = 0, ni = 0;
    for (const s of used) for (const { g } of this.slots.get(s)) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const out = new THREE.BufferGeometry();
    let vo = 0, io = 0;
    for (const s of used) {
      const start = io;
      for (const { g, bi } of this.slots.get(s)) {
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
        for (let i = 0; i < n; i++) {
          const j = vo + i;
          pos[j * 3] = P.getX(i); pos[j * 3 + 1] = P.getY(i); pos[j * 3 + 2] = P.getZ(i);
          nor[j * 3] = N.getX(i); nor[j * 3 + 1] = N.getY(i); nor[j * 3 + 2] = N.getZ(i);
          if (U) { uv[j * 2] = U.getX(i); uv[j * 2 + 1] = U.getY(i); }
          si[j * 4] = bi; sw[j * 4] = 1;
        }
        const a = g.index.array;
        for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
        vo += n; io += a.length;
        g.dispose();
      }
      out.addGroup(start, io - start, used.indexOf(s));
    }
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    this.slots.clear();
    return { geometry: out, slots: used, tris: ni / 3 };
  }

  // ---- primitives (all centred on their own origin) ----
  sph(ws = 20, hs = 14, pS, pL, tS, tL) { return new THREE.SphereGeometry(1, this.n(ws), this.n(hs), pS, pL, tS, tL); }
  cyl(rt, rb, h, seg = 16, open = false, tS, tL) { return new THREE.CylinderGeometry(rt, rb, h, this.n(seg), 1, open, tS, tL); }
  cap(r, len, seg = 12) { return new THREE.CapsuleGeometry(r, len, this.n(4), this.n(seg), 1); }
  tor(R, r, ts = 24, rs = 8, arc) { return new THREE.TorusGeometry(R, r, this.n(rs), this.n(ts), arc); }
  box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  lathe(pts, seg = 20, pS, pL) { return new THREE.LatheGeometry(V2(pts), this.n(seg), pS, pL); }
  tube(pts, r, seg = 10, rs = 6) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.TubeGeometry(c, this.n(seg), r, this.n(rs), false);
  }
  // Rounded box: rounded-rect extrude with a bevel on the faces.
  rbox(w, h, d, r = 0.02) {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const x = w / 2 - r, y = h / 2 - r, cr = Math.min(r, x, y) * 0.9;
    const s = new THREE.Shape();
    s.moveTo(-x + cr, -y);
    s.lineTo(x - cr, -y); s.quadraticCurveTo(x, -y, x, -y + cr);
    s.lineTo(x, y - cr); s.quadraticCurveTo(x, y, x - cr, y);
    s.lineTo(-x + cr, y); s.quadraticCurveTo(-x, y, -x, y - cr);
    s.lineTo(-x, -y + cr); s.quadraticCurveTo(-x, -y, -x + cr, -y);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r,
      bevelSegments: this.q === 'low' ? 1 : 2, curveSegments: this.q === 'low' ? 1 : 3,
    });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return g;
  }
  // Flat plane with its UVs remapped to an atlas rect [u0,v0,u1,v1].
  decal(w, h, rect) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
    return g;
  }
}
