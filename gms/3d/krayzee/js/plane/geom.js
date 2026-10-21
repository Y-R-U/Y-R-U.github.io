import * as THREE from 'three';

export function monotone(xs, ys) {
  const n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const WHITE = [1, 1, 1];

export class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  v(p, n, uv = [0, 0], c = WHITE) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]); this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }
  t(a, b, c) { this.idx.push(a, b, c); }

  // rings: array (along the loft) of closed loops of [x,y,z]. Normals are computed over the full
  // loop, then each split [j0, j1, uvFn] is emitted as its own vertex strip so UV regions never blend.
  loft(rings, { closed = true, splits = null, out, uv, color = WHITE, capStart = false, capEnd = false, capUV } = {}) {
    const R = rings.length, L = rings[0].length;
    const N = [];
    for (let i = 0; i < R; i++) {
      N[i] = [];
      for (let j = 0; j < L; j++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(R - 1, i + 1);
        let j0 = j - 1, j1 = j + 1;
        if (closed) { j0 = (j0 + L) % L; j1 = j1 % L; } else { j0 = Math.max(0, j0); j1 = Math.min(L - 1, j1); }
        const du = sub(rings[i1][j], rings[i0][j]);
        const dv = sub(rings[i][j1], rings[i][j0]);
        N[i][j] = norm(cross(du, dv));
      }
    }
    let flip = false;
    if (!out && closed) out = (p, i) => { const r = rings[i]; let cx = 0, cy = 0, cz = 0; for (const q of r) { cx += q[0]; cy += q[1]; cz += q[2]; } return [p[0] - cx / L, p[1] - cy / L, p[2] - cz / L]; };
    if (out) {
      const i = R >> 1, j = Math.floor(L / 3);
      flip = dot(N[i][j], out(rings[i][j], i)) < 0;
    }
    if (flip) for (const row of N) for (let j = 0; j < L; j++) row[j] = [-row[j][0], -row[j][1], -row[j][2]];
    const parts = splits || [[0, closed ? L : L - 1, uv]];
    for (const [ja, jb, uvf] of parts) {
      const base = this.count, W = jb - ja + 1;
      for (let i = 0; i < R; i++) for (let k = 0; k < W; k++) {
        const j = (ja + k) % L;
        const p = rings[i][j];
        this.v(p, N[i][j], uvf ? uvf(p, i, j, N[i][j]) : [0, 0], typeof color === 'function' ? color(p, i, j) : color);
      }
      for (let i = 0; i < R - 1; i++) for (let k = 0; k < W - 1; k++) {
        const a = base + i * W + k, b = base + (i + 1) * W + k, c = b + 1, d = a + 1;
        if (flip) { this.t(a, c, b); this.t(a, d, c); } else { this.t(a, b, c); this.t(a, c, d); }
      }
    }
    const cap = (ring, sign) => {
      const c = [0, 0, 0];
      for (const p of ring) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      c[0] /= ring.length; c[1] /= ring.length; c[2] /= ring.length;
      let n = [0, 0, 0];
      for (let j = 0; j < ring.length; j++) {
        const cr = cross(sub(ring[j], c), sub(ring[(j + 1) % ring.length], c));
        n[0] += cr[0]; n[1] += cr[1]; n[2] += cr[2];
      }
      n = norm(n);
      const nn = sign ? n : [-n[0], -n[1], -n[2]];
      const ci = this.v(c, nn, capUV ? capUV(c) : [0, 0], typeof color === 'function' ? color(c, -1, -1) : color);
      const b0 = this.count;
      for (const p of ring) this.v(p, nn, capUV ? capUV(p) : [0, 0], typeof color === 'function' ? color(p, -1, -1) : color);
      for (let j = 0; j < ring.length; j++) {
        const a = b0 + j, b = b0 + (j + 1) % ring.length;
        if (sign) this.t(ci, a, b); else this.t(ci, b, a);
      }
    };
    // cap winding: decide by comparing loop orientation with the loft direction
    if (capStart || capEnd) {
      const dir = sub(rings[R - 1][0], rings[0][0]);
      const ring0 = rings[0];
      const c = ring0.reduce((a, p) => [a[0] + p[0] / L, a[1] + p[1] / L, a[2] + p[2] / L], [0, 0, 0]);
      const ln = cross(sub(ring0[0], c), sub(ring0[Math.floor(L / 4)], c));
      const loopAlongDir = dot(ln, dir) > 0;
      if (capStart) cap(rings[0], !loopAlongDir);
      if (capEnd) cap(rings[R - 1], loopAlongDir);
    }
    return this;
  }

  addGeo(geo, matrix, uv = [0, 0], color = WHITE) {
    const g = geo;
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    const nm = new THREE.Matrix3();
    if (matrix) nm.getNormalMatrix(matrix);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const base = this.count;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); if (matrix) v.applyMatrix4(matrix);
      if (Nn) { n.fromBufferAttribute(Nn, i); if (matrix) n.applyMatrix3(nm).normalize(); } else n.set(0, 1, 0);
      const u = typeof uv === 'function' ? uv([v.x, v.y, v.z], U ? [U.getX(i), U.getY(i)] : [0, 0]) : uv;
      this.v([v.x, v.y, v.z], [n.x, n.y, n.z], u, typeof color === 'function' ? color([v.x, v.y, v.z]) : color);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    const flipW = matrix && matrix.determinant() < 0;
    if (flipW) for (let i = this.idx.length - (g.index ? g.index.count : P.count); i < this.idx.length; i += 3) {
      const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t;
    }
    geo.dispose();
    return this;
  }

  append(b) {
    const base = this.count;
    this.pos.push(...b.pos); this.nrm.push(...b.nrm); this.uv.push(...b.uv); this.col.push(...b.col);
    for (const i of b.idx) this.idx.push(i + base);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// NACA 4-digit half-thickness and camber at x (0..1 of chord).
export function naca(m = 0.02, p = 0.4, t = 0.12) {
  return (x) => {
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = m === 0 ? 0 : x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
    return [yc + yt, yc - yt];
  };
}

export function cosSpace(n, a = 0, b = 1) {
  const r = [];
  for (let i = 0; i <= n; i++) r.push(a + (b - a) * (1 - Math.cos((Math.PI * i) / n)) / 2);
  return r;
}

// Closed airfoil loop in chord coords [xc, y], top TE->LE then bottom LE->TE (TE point shared once).
// From cFrom..1; when cFrom>0 a rounded nose closes the front (control surfaces).
export function airfoilLoop(foil, n, cFrom = 0, cTo = 1, roundNose = false) {
  const xs = cosSpace(n, cFrom, cTo);
  const top = [], bot = [];
  for (const x of xs) { const [u, l] = foil(x); top.push([x, u]); bot.push([x, l]); }
  // cTo < 1 leaves a blunt rear face (fixed wing ahead of a hinge)
  if (cTo >= 1) top[top.length - 1][1] = bot[bot.length - 1][1] = (top[top.length - 1][1] + bot[bot.length - 1][1]) / 2;
  const loop = [];
  for (let i = top.length - 1; i >= 0; i--) loop.push(top[i]);
  if (cFrom > 0 && roundNose) {
    const yu = top[0][1], yl = bot[0][1], r = (yu - yl) / 2, yc = (yu + yl) / 2;
    for (let k = 1; k < 6; k++) { const a = Math.PI / 2 + (Math.PI * k) / 6; loop.push([cFrom + Math.cos(a) * r, yc + Math.sin(a) * r]); }
  }
  for (let i = cFrom > 0 ? 0 : 1; i < bot.length - (cTo < 1 ? 0 : 1); i++) loop.push(bot[i]);
  return { loop, topCount: top.length };
}

// Ring (closed loop) of an ellipse/circle in a plane perpendicular to direction d at point c.
export function frame(d, upHint = [0, 1, 0]) {
  const t = norm(d);
  let u = upHint;
  if (Math.abs(dot(u, t)) > 0.95) u = [1, 0, 0];
  const r = norm(cross(t, u));
  const up = cross(r, t);
  return { t, r, up };
}

// Sweep a 2D profile (array of [a,b] around the path) along a polyline. scale(i) can taper.
export function sweepRings(path, profile, { scale = () => 1, upHint = [0, 1, 0] } = {}) {
  const rings = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const { r, up } = frame(sub(b, a), upHint);
    const s = scale(i, path.length);
    const sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s;
    const c = path[i];
    rings.push(profile.map(([x, y]) => [c[0] + r[0] * x * sx + up[0] * y * sy, c[1] + r[1] * x * sx + up[1] * y * sy, c[2] + r[2] * x * sx + up[2] * y * sy]));
  }
  return rings;
}

export function circle(n, rx, ry = rx) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
  return p;
}

// Teardrop / streamline section, chord along +b (aft), thickness along a.
export function streamline(n, chord, thick) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = (1 - Math.cos(a)) / 2;
    const yt = 5 * (thick / chord) * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) * chord;
    p.push([Math.sign(Math.sin(a)) * yt, x * chord - chord * 0.35]);
  }
  return p;
}

// Lathe about the Z axis: profile [[z, r], ...] -> rings centred on (cx, cy).
export function latheRings(profile, n, cx = 0, cy = 0) {
  return profile.map(([z, r]) => circle(n, r).map(([x, y]) => [cx + x, cy + y, z]));
}

export function srgb(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
