import * as THREE from 'three';
import { Builder, rng, col, fbm } from './util.js';

// Rounded-rect boundary of the mown airfield (matches airfieldMask), walked anticlockwise from the north-west.
function boundary(off, step) {
  const X = 820, Z0 = -460, Z1 = 450, R = 40 + off;
  const pts = [];
  for (const [cx, cz, a0] of [[-X, Z0, Math.PI], [X, Z0, 1.5 * Math.PI], [X, Z1, 0], [-X, Z1, 0.5 * Math.PI]]) {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * Math.PI / 2;
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
  }
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % pts.length];
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
    for (let i = 0; i < n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
  }
  return out;
}

const gap = (x, z) => z < -480 && Math.abs(x + 80) < 22;

// The airfield's boundary hedge (real geometry, so it reads from the cockpit on the ground) and the gravel
// perimeter track just inside it. Returns trees to plant along the hedge.
export function buildAirfieldEdge(quality) {
  const r = rng(31);
  const H = new Builder();
  const pts = boundary(7, quality === 'low' ? 8 : 3.5);
  const leaf = (x, z, k) => col('#4a6b30', 0.78 + 0.4 * fbm(x / 9, z / 9, 2) * k);
  for (let k = 0; k < pts.length; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % pts.length];
    if (gap(x0, z0) || gap(x1, z1)) continue;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const h0 = 1.7 + fbm(x0 / 7, z0 / 7, 2) * 1.3, h1 = 1.7 + fbm(x1 / 7, z1 / 7, 2) * 1.3;
    const w0 = 0.9 + fbm(x0 / 5 + 3, z0 / 5, 2) * 0.6, w1 = 0.9 + fbm(x1 / 5 + 3, z1 / 5, 2) * 0.6;
    const c0 = leaf(x0, z0, 1), c1 = leaf(x1, z1, 1);
    const P = (x, z, n, w, y) => [x + nx * n * w, y, z + nz * n * w];
    H.quad(P(x0, z0, 1, w0 + 0.25, -0.1), P(x1, z1, 1, w1 + 0.25, -0.1), P(x1, z1, 1, w1, h1 * 0.85), P(x0, z0, 1, w0, h0 * 0.85), c0);
    H.quad(P(x0, z0, 1, w0, h0 * 0.85), P(x1, z1, 1, w1, h1 * 0.85), P(x1, z1, 0.3, w1, h1), P(x0, z0, 0.3, w0, h0), c1.map((v) => v * 1.15));
    H.quad(P(x0, z0, 0.3, w0, h0), P(x1, z1, 0.3, w1, h1), P(x1, z1, -1, w1, h1 * 0.88), P(x0, z0, -1, w0, h0 * 0.88), c0.map((v) => v * 1.08));
    H.quad(P(x0, z0, -1, w0, h0 * 0.88), P(x1, z1, -1, w1, h1 * 0.88), P(x1, z1, -1, w1 + 0.25, -0.1), P(x0, z0, -1, w0 + 0.25, -0.1), c1.map((v) => v * 0.9));
  }
  const hg = H.build();
  // a hedge is a rounded mass of leaves: bend every normal toward the sky so the shaded side reads dark green, not black
  const N = hg.attributes.normal;
  for (let i = 0; i < N.count; i++) {
    const nx = N.getX(i), ny = Math.abs(N.getY(i)) + 2.2, nz = N.getZ(i), l = Math.hypot(nx, ny, nz);
    N.setXYZ(i, nx / l, ny / l, nz / l);
  }
  const hedge = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  hedge.castShadow = quality !== 'low';
  hedge.receiveShadow = true;
  hedge.name = 'boundaryHedge';

  const Tk = new Builder();
  const tp = boundary(-14, 6);
  for (let k = 0; k < tp.length; k++) {
    const [x0, z0] = tp[k], [x1, z1] = tp[(k + 1) % tp.length];
    if (gap(x0, z0 - 20)) continue;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1, dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    Tk.rect((x0 + x1) / 2, (z0 + z1) / 2, dx, dz, L + 0.6, 3.6, 0.03, col('#9a8c6c', 0.85 + r() * 0.2));
  }
  const track = new THREE.Mesh(Tk.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
  track.receiveShadow = true;
  track.renderOrder = -8;
  track.name = 'perimeterTrack';

  const trees = [];
  for (const [x, z] of boundary(16, 31)) if (r() < 0.45 && !gap(x, z)) trees.push([x + (r() - 0.5) * 6, z + (r() - 0.5) * 6, r() < 0.12 ? 2 : 0, 12 + r() * 7]);
  return { objects: [hedge, track], trees };
}

// Coarse raster of places trees must not grow (roads, houses, yards).
export class BlockGrid {
  constructor(half = 6400, cell = 8) {
    this.half = half; this.cell = cell; this.n = Math.ceil(2 * half / cell);
    this.g = new Uint8Array(this.n * this.n);
  }
  disc(x, z, rad) {
    const c = this.cell, n = this.n;
    const i0 = Math.max(0, Math.floor((x - rad + this.half) / c)), i1 = Math.min(n - 1, Math.floor((x + rad + this.half) / c));
    const j0 = Math.max(0, Math.floor((z - rad + this.half) / c)), j1 = Math.min(n - 1, Math.floor((z + rad + this.half) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.g[j * n + i] = 1;
  }
  line(pts, rad) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / (this.cell * 0.7)));
      for (let i = 0; i <= n; i++) this.disc(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, rad);
    }
  }
  rect(x0, z0, x1, z1) {
    const c = this.cell, n = this.n;
    for (let j = Math.max(0, Math.floor((z0 + this.half) / c)); j <= Math.min(n - 1, Math.floor((z1 + this.half) / c)); j++)
      for (let i = Math.max(0, Math.floor((x0 + this.half) / c)); i <= Math.min(n - 1, Math.floor((x1 + this.half) / c)); i++) this.g[j * n + i] = 1;
  }
  has(x, z) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return false;
    return this.g[j * this.n + i] === 1;
  }
}
