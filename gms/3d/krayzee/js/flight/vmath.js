// Tiny three-free vector maths so the flight core runs in node (tools/flight-sim.mjs).
export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  len() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.len(); if (l > 1e-9) this.scale(1 / l); return this; }
  applyQuat(q) {
    const { x, y, z } = this, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  applyQuatInv(q) {
    const c = _qc.set(-q.x, -q.y, -q.z, q.w);
    return this.applyQuat(c);
  }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  setAxisAngle(ax, ay, az, a) {
    const s = Math.sin(a / 2);
    this.x = ax * s; this.y = ay * s; this.z = az * s; this.w = Math.cos(a / 2); return this;
  }
  // this = this * b
  multiply(b) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    this.x = ax * b.w + aw * b.x + ay * b.z - az * b.y;
    this.y = ay * b.w + aw * b.y + az * b.x - ax * b.z;
    this.z = az * b.w + aw * b.z + ax * b.y - ay * b.x;
    this.w = aw * b.w - ax * b.x - ay * b.y - az * b.z;
    return this;
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this;
  }
  // Integrate a body-frame angular velocity (rad/s) over dt.
  integrateBody(w, dt) {
    const a = Math.hypot(w.x, w.y, w.z) * dt;
    if (a < 1e-12) return this;
    const s = Math.sin(a / 2) / (a / dt);
    _qd.set(w.x * s, w.y * s, w.z * s, Math.cos(a / 2));
    return this.multiply(_qd).normalize();
  }
  // heading deg (0 = north, clockwise), pitch rad (nose up +), roll rad (right wing down +)
  setFromHPR(headingDeg, pitch = 0, roll = 0) {
    const y = new Quat().setAxisAngle(0, 1, 0, -headingDeg * Math.PI / 180);
    const p = new Quat().setAxisAngle(1, 0, 0, pitch);
    const r = new Quat().setAxisAngle(0, 0, 1, -roll);
    return this.copy(y).multiply(p).multiply(r);
  }
  slerpQuats(a, b, t) {
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    let c = a.x * bx + a.y * by + a.z * bz + a.w * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (c > 0.9995) {
      return this.set(a.x + (bx - a.x) * t, a.y + (by - a.y) * t, a.z + (bz - a.z) * t, a.w + (bw - a.w) * t).normalize();
    }
    const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return this.set(a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
  }
}

const _qc = new Quat();
const _qd = new Quat();

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;
export const KT = 0.514444;
export const FT = 0.3048;
export const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Ground bearing (deg) from a→b in the world frame (0 = north/-Z).
export const bearing = (ax, az, bx, bz) => (Math.atan2(bx - ax, -(bz - az)) / DEG + 360) % 360;
export const moveTo = (v, t, rate) => (v < t ? Math.min(t, v + rate) : Math.max(t, v - rate));
