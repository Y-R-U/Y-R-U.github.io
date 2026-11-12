import * as THREE from 'three';

// Non-indexed flat-shaded writer: position, normal, color (linear), aEmit.
export class GeoWriter {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; }
  tri(a, b, c, col, emit = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz);
      this.c.push(col.r, col.g, col.b); this.e.push(emit);
    }
  }
  // counter-clockwise seen from the front
  quad(a, b, c, d, col, emit = 0) { this.tri(a, b, c, col, emit); this.tri(a, c, d, col, emit); }
  poly(pts, col, emit = 0) { for (let k = 1; k < pts.length - 1; k++) this.tri(pts[0], pts[k], pts[k + 1], col, emit); }
  // axis-aligned box, sides: which faces (t,b,n,s,e,w)
  box(x0, y0, z0, x1, y1, z1, col, opts = {}) {
    const top = opts.top ?? col, side = opts.side ?? col, emit = opts.emit ?? 0;
    const skip = opts.skip || '';
    if (!skip.includes('t')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top, emit);
    if (!skip.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side, emit);
    if (!skip.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], opts.south ?? side, emit);
    if (!skip.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], opts.north ?? side, emit);
    if (!skip.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], opts.east ?? side, emit);
    if (!skip.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], opts.west ?? side, emit);
  }
  // frustum between rects at y0 (w0,d0) and y1 (w1,d1) centred cx,cz
  frustum(cx, cz, y0, y1, w0, d0, w1, d1, col, opts = {}) {
    const b = [[cx - w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz + d0 / 2], [cx - w0 / 2, y0, cz + d0 / 2]];
    const t = [[cx - w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz + d1 / 2], [cx - w1 / 2, y1, cz + d1 / 2]];
    const emit = opts.emit ?? 0;
    if (!opts.noTop && (w1 > 0.01 || d1 > 0.01)) this.quad(t[0], t[3], t[2], t[1], opts.top ?? col, emit);
    this.quad(b[3], b[2], t[2], t[3], col, emit);
    this.quad(b[1], b[0], t[0], t[1], col, emit);
    this.quad(b[2], b[1], t[1], t[2], col, emit);
    this.quad(b[0], b[3], t[3], t[0], col, emit);
  }
  // n-gon prism / frustum ring around (cx,cz)
  cyl(cx, cz, y0, y1, r0, r1, n, col, opts = {}) {
    const emit = opts.emit ?? 0, a0 = opts.a0 ?? 0;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2, b = a0 + ((k + 1) / n) * Math.PI * 2;
      const p = (an, y, r) => [cx + Math.cos(an) * r, y, cz + Math.sin(an) * r];
      const c = opts.colFn ? opts.colFn(k) : col;
      this.quad(p(b, y0, r0), p(a, y0, r0), p(a, y1, r1), p(b, y1, r1), c, emit);
    }
    if (opts.top !== false && r1 > 0.001) {
      const pts = [];
      for (let k = n - 1; k >= 0; k--) { const a = a0 + (k / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1]); }
      this.poly(pts, opts.topCol ?? col, opts.topEmit ?? emit);
    }
  }
  // annulus wall (fountain basin)
  basin(cx, cz, y0, y1, rIn, rOut, n, col, topCol) {
    this.cyl(cx, cz, y0, y1, rOut, rOut, n, col, { top: false });
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      const p = (an, r, y) => [cx + Math.cos(an) * r, y, cz + Math.sin(an) * r];
      this.quad(p(a, rIn, y1), p(b, rIn, y1), p(b, rOut, y1), p(a, rOut, y1), topCol);
      this.quad(p(a, rIn, y0), p(b, rIn, y0), p(b, rIn, y1), p(a, rIn, y1), col);
    }
  }
  dome(cx, cy, cz, r, n, rings, col, opts = {}) {
    const ry = opts.ry ?? r;
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI / 2, t1 = ((j + 1) / rings) * Math.PI / 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
        const p = (an, t) => [cx + Math.cos(an) * Math.cos(t) * r, cy + Math.sin(t) * ry, cz + Math.sin(an) * Math.cos(t) * r];
        const c = opts.ribs && k % 2 ? opts.ribs : col;
        if (j === rings - 1) this.tri(p(b, t0), p(a, t0), p(a, t1), c);
        else this.quad(p(b, t0), p(a, t0), p(a, t1), p(b, t1), c);
      }
    }
  }
  blob(cx, cy, cz, r, col, rnd, sq = 1) {
    const ico = new THREE.IcosahedronGeometry(r, 1);
    const pos = ico.attributes.position;
    const jit = new Map();
    const v = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!jit.has(key)) jit.set(key, 0.85 + rnd() * 0.3);
      const j = jit.get(key);
      v.push([cx + x * j, cy + y * j * sq, cz + z * j]);
    }
    for (let i = 0; i < v.length; i += 3) {
      const yy = (v[i][1] + v[i + 1][1] + v[i + 2][1]) / 3 - cy;
      const k = 0.8 + 0.35 * (yy / r) + (rnd() - 0.5) * 0.12;
      const c = { r: col.r * k, g: col.g * k, b: col.b * k };
      this.tri(v[i], v[i + 1], v[i + 2], c);
    }
    ico.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.e, 1));
    g.computeBoundingSphere();
    return g;
  }
  get verts() { return this.p.length / 3; }
}

export function mulberry(a) {
  a = (a >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const C = (hex, k = 1) => {
  const c = new THREE.Color(hex);
  return { r: c.r * k, g: c.g * k, b: c.b * k };
};
export const mul = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k });
export const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
