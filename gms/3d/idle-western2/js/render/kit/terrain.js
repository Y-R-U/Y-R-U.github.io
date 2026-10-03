// Faceted ground for the whole town: one jittered, alternating-diagonal grid; heights from a land/sea/river field.
import * as THREE from 'three';
import * as S from './shape.js?v=20261004b';
import { noise2 } from './rng.js?v=20261004b';

export const WATER_Y = -0.55;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function polyDist(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
  }
  return best;
}
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    const s = t * t * (3 - 2 * t);
    return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * s;
  }
  return pts[pts.length - 1][1];
}

// geo: { bounds, core:{x0,x1,z0,z1}, shore:[[x,z]..] (sea is north of it), coast:[[x,z]..] (land again north of it),
//        river:[[x,z]..], riverW, quays:[{x0,x1,z}] (hard edge: land south of z) }
export function createField(geo) {
  const n = noise2(11);
  const core = geo.core;
  const field = {
    geo,
    seaDepth(x, z) {
      const zs = interp(geo.shore, x), zc = interp(geo.coast, x);
      const inSea = Math.min(smooth(0, 14, zs - z), smooth(0, 12, z - zc));
      return inSea;
    },
    riverDepth(x, z) {
      const d = polyDist(x, z, geo.river);
      return 1 - smooth(geo.riverW * 0.5, geo.riverW * 0.5 + 5, d);
    },
    wet(x, z) {
      let w = Math.max(field.seaDepth(x, z), field.riverDepth(x, z));
      for (const q of geo.quays) if (x > q.x0 && x < q.x1 && z < q.z) w = Math.max(w, smooth(q.z, q.z - 3, z) * (1 - smooth(q.x1 - 4, q.x1 + 2, x)) * smooth(q.x0 - 2, q.x0 + 4, x));
      return w;
    },
    height(x, z) {
      const out = Math.max(core.x0 - x, x - core.x1, core.z0 - z, z - core.z1, 0);
      const hills = smooth(0, 70, out);
      const nn = n.fbm(x * 0.012, z * 0.012, 4) * 0.5 + 0.5;
      let h = hills * (0.6 + nn * 4 + Math.max(0, n.fbm(x * 0.004 + 3, z * 0.004, 2)) * 7);
      h += (1 - hills) * n.fbm(x * 0.05, z * 0.05, 2) * 0.25 * smooth(30, 46, Math.abs(z - 4));
      const w = field.wet(x, z);
      h = h * (1 - w) + (-3.2 - nn * 2) * w;
      if (w < 0.05 && x > core.x0 && x < core.x1 && z > -46 && z < 52) h = Math.min(h, -0.012);
      return h;
    },
  };
  return field;
}

export function buildTerrain(field, pal, { cell = 5, seed = 3 } = {}) {
  const { x0, x1, z0, z1 } = field.geo.bounds;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const V = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || j === 0 || i === nx || j === nz;
    const x = x0 + i * cell + (edge ? 0 : (rnd() - 0.5) * cell * 0.55);
    const z = z0 + j * cell + (edge ? 0 : (rnd() - 0.5) * cell * 0.55);
    V.push([x, field.height(x, z), z]);
  }
  const n = noise2(5);
  const grass = S.rgb(pal.grass), grass2 = S.rgb(pal.grass2), grassD = S.rgb(pal.grassDark), sand = S.rgb(pal.sand), bed = S.rgb('#b9a98c'), rock = S.rgb(pal.stone2);
  const colAt = (x, y, z) => {
    const v = n.fbm(x * 0.03, z * 0.03, 3);
    let c = S.mix(grass, v > 0 ? grass2 : grassD, Math.min(1, Math.abs(v) * 1.6));
    if (y > 9) c = S.mix(c, grassD, Math.min(1, (y - 9) / 12) * 0.5);
    const w = field.wet(x, z);
    if (w > 0.001 || y < -0.3) c = S.mix(c, y < -1.0 ? bed : sand, Math.min(1, Math.max(smooth(0.0, 0.25, w), smooth(-0.3, -0.8, y))));
    else {
      const near = Math.max(field.wet(x + 6, z), field.wet(x - 6, z), field.wet(x, z + 6), field.wet(x, z - 6));
      if (near > 0.05) c = S.mix(c, sand, 0.6 * smooth(0.05, 0.4, near));
    }
    return c;
  };
  const m = new S.Mesh();
  const idx = (i, j) => V[j * (nx + 1) + i];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = idx(i, j), b2 = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
    const tri = (p, q, s) => {
      const cx = (p[0] + q[0] + s[0]) / 3, cy = (p[1] + q[1] + s[1]) / 3, cz = (p[2] + q[2] + s[2]) / 3;
      const steep = Math.abs(Math.max(p[1], q[1], s[1]) - Math.min(p[1], q[1], s[1])) / cell;
      let col = colAt(cx, cy, cz);
      if (steep > 0.9 && cy > 0) col = S.mix(col, rock, 0.6);
      const k = 1 + (rnd() - 0.5) * 0.06;
      m.tri(p, s, q, [col[0] * k, col[1] * k, col[2] * k]);
    };
    if ((i + j) % 2) { tri(a, b2, c); tri(a, c, d); } else { tri(a, b2, d); tri(b2, c, d); }
  }
  const g = m.geo();
  const pp = g.attributes.position.array, n4 = pp.length / 3, a = new Float32Array(n4 * 4);
  for (let i = 0; i < n4; i++) { a[i * 4] = 0.92; a[i * 4 + 3] = pp[i * 3 + 1] > -0.25 && field.wet(pp[i * 3], pp[i * 3 + 2]) < 0.02 ? -1 : 1; }
  g.setAttribute('aPbr', new THREE.BufferAttribute(a, 4));
  return g;
}

export function buildWater(field, pal, { cell = 5 } = {}) {
  const { x0, x1, z0, z1 } = field.geo.bounds;
  const m = new S.Mesh();
  const deep = S.rgb(pal.waterDeep), shallow = S.rgb(pal.water);
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const y = WATER_Y;
  const colAt = (x, z) => S.mix(shallow, deep, smooth(-0.8, -3.5, field.height(x, z)));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const xa = x0 + i * cell, za = z0 + j * cell, xb = xa + cell, zb = za + cell;
    const hs = [field.height(xa, za), field.height(xb, za), field.height(xb, zb), field.height(xa, zb), field.height(xa + cell / 2, za + cell / 2)];
    if (Math.min(...hs) > y + 0.6) continue;
    const A = [xa, y, za], B = [xb, y, za], C = [xb, y, zb], D = [xa, y, zb];
    m.tri(A, D, C, colAt((xa + xb) / 2 - 1, (za + zb) / 2)).tri(A, C, B, colAt((xa + xb) / 2 + 1, (za + zb) / 2));
  }
  const g = m.geo();
  const p = g.attributes.position.array, c = g.attributes.color.array;
  for (let i = 0; i < p.length; i += 3) {
    const cc = colAt(p[i], p[i + 2]);
    c[i] = cc[0]; c[i + 1] = cc[1]; c[i + 2] = cc[2];
  }
  S.setPbr(g, 0.1, 0, 0);
  return g;
}

export function terrainMesh(geo, material) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
