import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}

const _c = new THREE.Color();
export function col(hex, k = 1) {
  _c.set(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Accumulates triangles (position/normal/colour[/uv]) into one BufferGeometry so whole classes of scenery are one draw call.
export class Builder {
  constructor(uv = false) { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.hasUv = uv; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, c, u = 0, w = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c[0], c[1], c[2]);
    if (this.hasUv) this.u.push(u, w);
    return this.count - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  // a,b,c,d: [x,y,z] counter-clockwise seen from the front.
  quad(a, b, c, d, color, uv = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const q = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this.v(...a, nx, ny, nz, color, q[0], q[1]);
    this.v(...b, nx, ny, nz, color, q[2], q[3]);
    this.v(...c, nx, ny, nz, color, q[4], q[5]);
    this.v(...d, nx, ny, nz, color, q[6], q[7]);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // Flat ground rectangle centred at (cx,cz), long axis along unit (dx,dz).
  rect(cx, cz, dx, dz, len, wid, y, color, uv = null) {
    const hx = dx * len / 2, hz = dz * len / 2, rx = -dz * wid / 2, rz = dx * wid / 2;
    this.quad([cx - hx - rx, y, cz - hz - rz], [cx - hx + rx, y, cz - hz + rz], [cx + hx + rx, y, cz + hz + rz], [cx + hx - rx, y, cz + hz - rz], color, uv);
  }
  // Ground polygon (convex or star-shaped from first point), points [[x,z],...].
  fan(pts, y, color, uvScale = 0) {
    const base = this.count;
    for (const [x, z] of pts) this.v(x, y, z, 0, 1, 0, color, x * uvScale, -z * uvScale);
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[0], b = pts[k], c = pts[k + 1];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross < 0) this.i.push(base, base + k, base + k + 1); else this.i.push(base, base + k + 1, base + k);
    }
  }
  box(cx, cy, cz, sx, sy, sz, color, ry = 0, bottom = false) {
    this.geo(new THREE.BoxGeometry(sx, sy, sz), mat(cx, cy, cz, 0, ry), color, bottom ? null : 3);
  }
  beam(p0, p1, t, color) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const L = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > L * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition(a.add(b).multiplyScalar(0.5));
    this.geo(new THREE.BoxGeometry(t, t, L), m, color);
  }
  // Append any three geometry transformed by m. skipFace: BoxGeometry group index to drop (3 = bottom).
  geo(g, m, color, skipFace = null) {
    if (m) g.applyMatrix4(m);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, colA = g.attributes.color;
    const base = this.count;
    for (let k = 0; k < pos.count; k++) {
      const c = colA ? [colA.getX(k), colA.getY(k), colA.getZ(k)] : color;
      this.v(pos.getX(k), pos.getY(k), pos.getZ(k), nor.getX(k), nor.getY(k), nor.getZ(k), c, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
    }
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    let skip = null;
    if (skipFace !== null && g.groups.length > skipFace) skip = g.groups[skipFace];
    for (let k = 0; k < idx.length; k++) {
      if (skip && k >= skip.start && k < skip.start + skip.count) continue;
      this.i.push(base + idx[k]);
    }
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.hasUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Ribbon along a polyline on the ground.
export function ribbon(b, pts, width, y, color) {
  const h = width / 2;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-4) continue;
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const ext = k < pts.length - 2 ? h * 0.5 : 0;
    b.rect((x0 + x1) / 2 + dx * ext / 2, (z0 + z1) / 2 + dz * ext / 2, dx, dz, L + ext, width, y, color);
  }
}

export function arc(cx, cz, r, a0, a1, n = 12) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * k / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

// Parametric interval [t0,t1] of segment P0->P1 inside an oriented rectangle, or null.
export function segInRect(p0, p1, R) {
  let t0 = 0, t1 = 1;
  const axes = [[R.dx, R.dz, R.len / 2], [-R.dz, R.dx, R.wid / 2]];
  for (const [ax, az, half] of axes) {
    const a = (p0[0] - R.cx) * ax + (p0[1] - R.cz) * az;
    const d = (p1[0] - p0[0]) * ax + (p1[1] - p0[1]) * az;
    if (Math.abs(d) < 1e-9) { if (Math.abs(a) > half) return null; continue; }
    let ta = (-half - a) / d, tb = (half - a) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

export function inRect(x, z, R, pad = 0) {
  const a = (x - R.cx) * R.dx + (z - R.cz) * R.dz;
  const b = -(x - R.cx) * R.dz + (z - R.cz) * R.dx;
  return Math.abs(a) <= R.len / 2 + pad && Math.abs(b) <= R.wid / 2 + pad;
}
