// C3: the River Krumble. It comes down from the north-west hills, fills the lake west of C-Tower 1, and wanders off south-west
// under the 09 approach. One water ribbon draped on the terrain, merged into the lake's mesh (no extra draw call), with
// the lake's PBR water. riverDist() is a precomputed distance field (40 m cells), cheap enough for terrain, masks and trees.
import * as THREE from 'three';
import royal from '../../data/airports/royal.js';

const LAKE = royal.scenery.lake;

const CTRL = [
  [-6400, -4300, 12], [-5300, -3700, 13], [-4500, -3150, 14], [-3800, -2700, 15], [-3250, -2050, 16], [-2700, -1650, 17],
  [-2350, -1180, 18], [-2150, -900, 19], [LAKE.x - LAKE.rx * 0.6, LAKE.z - 40, 20],
];
const OUT = [
  [LAKE.x - 60, LAKE.z + LAKE.rz * 0.7, 20], [-1880, -150, 19], [-2120, 380, 18], [-2550, 900, 18], [-2950, 1450, 19],
  [-3650, 2000, 20], [-4600, 2450, 21], [-5800, 2800, 22], [-7000, 3300, 22],
];
// Catmull-Rom through the control points, sampled every ~20 m: [x, z, halfWidth]
function smooth(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 20));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(P[P.length - 1]);
  return out.map(([x, z, hw]) => [x, z, hw * 0.72]);
}
// meanders: a lateral wave on the smoothed line, calm where it meets the lake
function meander(R, atStart, phase) {
  const s = [0];
  for (let k = 1; k < R.length; k++) s.push(s[k - 1] + Math.hypot(R[k][0] - R[k - 1][0], R[k][1] - R[k - 1][1]));
  const L = s[s.length - 1];
  return R.map(([x, z, hw], k) => {
    const a = R[Math.max(0, k - 1)], b = R[Math.min(R.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const lake = atStart ? s[k] : L - s[k], taper = Math.min(1, lake / 500);
    const o = taper * (62 * Math.sin(s[k] / 560 * 6.283 + phase) + 22 * Math.sin(s[k] / 210 * 6.283 + phase * 2.3));
    return [x - dz / l * o, z + dx / l * o, hw];
  });
}
export const RIVERS = [meander(smooth(CTRL), false, 0.7), meander(smooth(OUT), true, 2.1)];
// willows and alders along the banks: [x, z, species, height] for js/world/trees.js extras
export function bankTrees() {
  const out = [];
  let r = 0x2b1d;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const R of RIVERS) for (let k = 2; k < R.length - 2; k += 2) {
    if (rnd() > 0.42) continue;
    const [x, z, hw] = R[k], a = R[k - 1], b = R[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, side = rnd() < 0.5 ? -1 : 1, off = hw + 7 + rnd() * 9;
    out.push([x - dz / l * off * side, z + dx / l * off * side, rnd() < 0.25 ? 2 : 0, 9 + rnd() * 7]);
  }
  return out;
}

// distance field: metres from the water's edge (negative in the water), out to 900 m
const CELL = 40, RANGE = 900;
let F = null;
function field() {
  if (F) return F;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const R of RIVERS) for (const [x, z] of R) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 -= RANGE; z0 -= RANGE; x1 += RANGE; z1 += RANGE;
  const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1, d = new Float32Array(nx * nz).fill(RANGE);
  const r = Math.ceil(RANGE / CELL);
  for (const R of RIVERS) for (let k = 0; k < R.length - 1; k++) {
    const [ax, az, hw] = R[k], [bx, bz] = R[k + 1], L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const ci = Math.round((ax - x0) / CELL), cj = Math.round((az - z0) / CELL);
    for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
      const px = x0 + i * CELL, pz = z0 + j * CELL, t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2));
      const v = Math.hypot(px - ax - t * (bx - ax), pz - az - t * (bz - az)) - hw, o = j * nx + i;
      if (v < d[o]) d[o] = v;
    }
  }
  return (F = { x0, z0, nx, nz, d });
}
export function riverDist(x, z) {
  const f = field(), fx = (x - f.x0) / CELL, fz = (z - f.z0) / CELL;
  if (fx < 0 || fz < 0 || fx >= f.nx - 1 || fz >= f.nz - 1) return RANGE;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, d = f.d, n = f.nx, o = j * n + i;
  return (d[o] * (1 - u) + d[o + 1] * u) * (1 - v) + (d[o + n] * (1 - u) + d[o + n + 1] * u) * v;
}
export const inRiver = (x, z) => riverDist(x, z) < 0;

// Water ribbon draped on the terrain: position, normal, shore (0 mid-stream, 1 at the banks), index. Into the lake mesh.
export function riverGeometry(heightAt, y0 = 0.15) {
  const pos = [], nor = [], shore = [], idx = [];
  for (const R of RIVERS) {
    const base = pos.length / 3;
    for (let k = 0; k < R.length; k++) {
      const [x, z, hw] = R[k], a = R[Math.max(0, k - 1)], b = R[Math.min(R.length - 1, k + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, rx = -dz / L, rz = dx / L;
      for (const s of [-1, -0.5, 0, 0.5, 1]) {
        const px = x + rx * hw * s * 1.08, pz = z + rz * hw * s * 1.08;
        pos.push(px, Math.max(heightAt(px, pz), heightAt(x, z)) + y0, pz);
        nor.push(0, 1, 0); shore.push(Math.abs(s));
      }
    }
    for (let k = 0; k < R.length - 1; k++) for (let c = 0; c < 4; c++) {
      const a = base + k * 5 + c, b = a + 1, d = a + 5, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('shore', new THREE.Float32BufferAttribute(shore, 1));
  g.setIndex(idx);
  return g;
}

// where a straight east-west road at z crosses a river: [{ x, z, heading of the water }]
export function crossingsZ(z) {
  const out = [];
  for (const R of RIVERS) for (let k = 0; k < R.length - 1; k++) {
    const [ax, az] = R[k], [bx, bz] = R[k + 1];
    if ((az - z) * (bz - z) > 0 || az === bz) continue;
    const t = (z - az) / (bz - az);
    out.push({ x: ax + (bx - ax) * t, z, hw: R[k][2], dir: Math.atan2(bx - ax, bz - az) });
  }
  return out;
}

// Stone hump bridges wherever a road, lane or farm track crosses the water (C-Tower 1's paths: town.js)
export function buildBridges(M, paths, heightAt, col) {
  const STONE = col('#b9ab8c'), STONE2 = col('#a29475'), ROAD = col('#55575a'), out = [];
  for (const p of paths) for (let k = 0; k < p.pts.length - 1; k++) {
    const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1], sl = Math.hypot(bx - ax, bz - az) + 60;
    if (riverDist(ax, az) > sl && riverDist(bx, bz) > sl) continue;   // nowhere near the water
    for (const R of RIVERS) for (let j = 0; j < R.length - 1; j++) {
      const [cx, cz, hw] = R[j], [dx, dz] = R[j + 1];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 40)) continue;
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const sin = Math.abs(ux * (dz - cz) - uz * (dx - cx)) / Math.hypot(dx - cx, dz - cz);
      const span = Math.min(90, (hw * 2 + 8) / Math.max(0.35, sin)), w = p.w + 2, y = heightAt(x, z), rise = p.w >= 9 ? 2.6 : 1.8;
      const ry = Math.atan2(-uz, ux);
      const sh = new THREE.Shape([new THREE.Vector2(-span / 2 - 14, -0.4), new THREE.Vector2(-span / 2, rise), new THREE.Vector2(span / 2, rise), new THREE.Vector2(span / 2 + 14, -0.4)]);
      const deck = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
      deck.translate(0, 0, -w / 2);
      M.geo(deck, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z), STONE);
      const at = (a, b) => new THREE.Matrix4().makeRotationY(ry).setPosition(x + ux * a - uz * 0 + 0, y + b, z + uz * a);
      M.geo(new THREE.BoxGeometry(span, 0.12, w - 2.4), at(0, rise + 0.06), ROAD);                       // road surface
      for (const sd of [-1, 1]) {                                                                         // parapets + end piers
        const px = -uz * sd * (w / 2 - 0.3), pz = ux * sd * (w / 2 - 0.3);
        M.geo(new THREE.BoxGeometry(span + 4, 0.9, 0.6), new THREE.Matrix4().makeRotationY(ry).setPosition(x + px, y + rise + 0.45, z + pz), STONE2);
        for (const e of [-1, 1]) M.geo(new THREE.BoxGeometry(1.2, 1.4, 1.2), new THREE.Matrix4().makeRotationY(ry).setPosition(x + px + ux * e * (span / 2 + 2), y + rise + 0.7, z + pz + uz * e * (span / 2 + 2)), STONE);
      }
      for (const e of [-1, 1]) M.geo(new THREE.BoxGeometry(2.4, rise + 1.5, w), new THREE.Matrix4().makeRotationY(ry).setPosition(x + ux * e * span * 0.32, y + (rise - 1.5) / 2, z + uz * e * span * 0.32), STONE2);   // piers in the water
      out.push({ x, z, span, ry, rise });
    }
  }
  return out;
}
