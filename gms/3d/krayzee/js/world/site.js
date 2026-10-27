// MAP (D26/D29): the world for every airport except C-Tower 1, built from its data file (data/airports/<id>.js,
// props/mown/pond/windsocks in docs/MAP.md). Same API as js/world/airport.js buildWorld, plus dispose().
import * as THREE from 'three';
import { Builder, col, mat, rng, fbm, ribbon, arc, inRect, segInRect } from './util.js';
import { createSky, createLights, bakeEnvironment, setShadowFocus, SUN_DIR } from './env.js';
import { createTerrain, createLake, inLake, lakeDist, SHADE_EXTENT, setTerrainSite } from './terrain.js';
import { buildTrees, shadeTexture } from './trees.js';
import { BlockGrid } from './land.js';
import { asphaltTexture } from './textures.js';
import { runwaySurface, clipPolyline, dashed, holdLines } from './pavement.js';
import { headingToVec, threshold } from './layout.js';
import { disposeWorld } from './dispose.js';

const Y_PAVE = 0.04, Y_MARK = 0.06, PAD_LEN = 45;
const WHITE = col('#f4f4ef', 0.92), YELLOW = col('#f2c21b', 0.95);
const tone = (v, w = 0) => [v * (1 + w), v, v * (1 - w)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- geometry from the def (the same shapes js/world/geom.js derives for C-Tower 1) ----------
function framesOf(def) {
  return def.runways.map((rw) => {
    const [dx, dz] = headingToVec(rw.heading), W = rw.width, L = rw.length, grass = rw.surface === 'grass';
    const shoulder = grass ? 0 : W >= 30 ? 6 : 4, pad = grass ? 30 : PAD_LEN;
    return {
      rw, id: rw.id, cx: rw.center[0], cz: rw.center[2], dx, dz, rx: -dz, rz: dx, L, W, shoulder, grass,
      rect: { cx: rw.center[0], cz: rw.center[2], dx, dz, len: L, wid: W },
      strip: { cx: rw.center[0], cz: rw.center[2], dx, dz, len: L + 2 * pad, wid: W + 2 * (shoulder || 4) },
    };
  });
}
const rwPt = (F, e, a, tp) => { const sg = e === 0 ? 1 : -1, s = sg * (a - F.L / 2), t = sg * tp; return [F.cx + F.dx * s + F.rx * t, F.cz + F.dz * s + F.rz * t]; };
const rwDir = (F, e) => (e === 0 ? [F.dx, F.dz] : [-F.dx, -F.dz]);
function segmentsOf(def) {
  const tw = def.taxiwayWidth ?? 15, out = [];
  for (const t of def.taxiways) for (let i = 1; i < t.points.length; i++) {
    const p0 = t.points[i - 1], p1 = t.points[i], len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const dx = (p1[0] - p0[0]) / len, dz = (p1[1] - p0[1]) / len;
    out.push({ id: t.id, p0, p1, dx, dz, len, rect: { cx: (p0[0] + p1[0]) / 2, cz: (p0[1] + p1[1]) / 2, dx, dz, len: len + tw, wid: tw } });
  }
  return out;
}
function holdsOf(def, FR, SG) {
  const D = def.holdOffset ?? 50, out = [];
  for (const S of SG) for (const F of FR) {
    if (!segInRect(S.p0, S.p1, F.rect)) continue;
    const d0 = (S.p0[0] - F.cx) * F.rx + (S.p0[1] - F.cz) * F.rz, d1 = (S.p1[0] - F.cx) * F.rx + (S.p1[1] - F.cz) * F.rz;
    for (const target of [-D, D]) {
      if (Math.abs(d1 - d0) < 1e-6) continue;
      const t = (target - d0) / (d1 - d0);
      if (t < 0 || t > 1) continue;
      const toward = Math.sign(-target * (d1 - d0)) > 0 ? 1 : -1;
      out.push({ x: S.p0[0] + (S.p1[0] - S.p0[0]) * t, z: S.p0[1] + (S.p1[1] - S.p0[1]) * t, hx: S.dx * toward, hz: S.dz * toward, runway: F.id, taxiway: S.id });
    }
  }
  return out;
}
// { center, size, heading } footprint helpers (heading 0 = size[0] along +X)
const axes = (h = 0) => [headingToVec(90 + h), headingToVec(180 + h)];
function footprint(r) { const [u, v] = axes(r.heading); return { cx: r.center[0], cz: r.center[2], u, v, a: r.size[0] / 2, b: r.size[1] / 2 }; }
function fpDist(f, x, z, shrink = 0) {
  const dx = x - f.cx, dz = z - f.cz;
  const p = Math.abs(dx * f.u[0] + dz * f.u[1]) - (f.a - shrink), q = Math.abs(dx * f.v[0] + dz * f.v[1]) - (f.b - shrink);
  return Math.hypot(Math.max(p, 0), Math.max(q, 0)) + Math.min(Math.max(p, q), 0);
}
const inFp = (f, x, z) => fpDist(f, x, z) <= 0;
const local = (f) => (lx, lz) => [f.cx + lx * f.u[0] + lz * f.v[0], f.cz + lx * f.u[1] + lz * f.v[1]];
function aabb(f, h, kind) {
  const ex = Math.abs(f.u[0]) * f.a + Math.abs(f.v[0]) * f.b, ez = Math.abs(f.u[1]) * f.a + Math.abs(f.v[1]) * f.b;
  return { min: [f.cx - ex, 0, f.cz - ez], max: [f.cx + ex, h, f.cz + ez], kind };
}

// ---------- small builders ----------
// quad/triangle with the normal turned to face `out`
function face(B, pts, color, out) {
  const [a, b, c] = pts;
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  const P = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...pts].reverse() : pts;
  if (P.length === 4) { B.quad(P[0], P[1], P[2], P[3], color); return; }
  const [p, q, r] = P;
  const l = Math.hypot(...n) || 1, s = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? -1 : 1;
  const i = B.v(...p, s * n[0] / l, s * n[1] / l, s * n[2] / l, color);
  B.v(...q, s * n[0] / l, s * n[1] / l, s * n[2] / l, color); B.v(...r, s * n[0] / l, s * n[1] / l, s * n[2] / l, color);
  B.tri(i, i + 1, i + 2);
}
// a pitched roof over footprint f from height y0, ridge `rise` higher, along the long side (size[0])
function gable(B, f, y0, rise, color, gableColor = color, over = 0.6) {
  const L = local(f), a = f.a + over, b = f.b + over, top = y0 + rise;
  const P = (lx, y, lz) => { const [x, z] = L(lx, lz); return [x, y, z]; };
  const up = (sg) => [f.v[0] * sg * 0.6, 0.8, f.v[1] * sg * 0.6];
  face(B, [P(-a, y0, -b), P(a, y0, -b), P(a, top, 0), P(-a, top, 0)], color, up(-1));
  face(B, [P(-a, y0, b), P(a, y0, b), P(a, top, 0), P(-a, top, 0)], color, up(1));
  for (const sx of [-1, 1]) face(B, [P(sx * f.a, y0, -f.b), P(sx * f.a, y0, f.b), P(sx * f.a, top, 0)], gableColor, [f.u[0] * sx, 0, f.u[1] * sx]);
}
const ry = (f) => Math.atan2(-f.u[1], f.u[0]);
function boxAt(B, f, lx, lz, y, sx, sy, sz, color) { const [x, z] = local(f)(lx, lz); B.box(x, y + sy / 2, z, sx, sy, sz, color, ry(f)); }

// Canvas labels (runway numbers, building signs): { texture, uv: { key: [u0, v0, u1, v1] } }
function labelAtlas(entries, renderer) {
  const S = 1024, c = document.createElement('canvas');
  c.width = S; c.height = 512;
  const g = c.getContext('2d'), uv = {};
  let x = 0, y = 0;
  for (const e of entries) {
    const w = e.w || 512, h = e.h || 96;
    if (x + w > S) { x = 0; y += 104; }
    g.save(); g.translate(x + 4, y + 4);
    if (e.bg) { g.fillStyle = e.bg; g.fillRect(0, 0, w - 8, h - 8); }
    g.fillStyle = e.color || '#fff';
    g.font = `700 ${e.size || 64}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e.text, (w - 8) / 2, (h - 8) / 2 + 4, w - 24);
    g.restore();
    uv[e.key] = [(x + 4) / S, 1 - (y + h - 4) / 512, (x + w - 4) / S, 1 - (y + 4) / 512];
    x += w;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return { texture: t, uv };
}
const uvQuad = (r) => [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]];
// a vertical sign facing (fx, fz) centred at (x, y, z)
function signQuad(D, r, x, y, z, w, h, fx, fz) {
  const rx = fz, rz = -fx, hw = w / 2, hh = h / 2, o = 0.05;
  D.quad([x - rx * hw + fx * o, y - hh, z - rz * hw + fz * o], [x + rx * hw + fx * o, y - hh, z + rz * hw + fz * o], [x + rx * hw + fx * o, y + hh, z + rz * hw + fz * o], [x - rx * hw + fx * o, y + hh, z - rz * hw + fz * o], [1, 1, 1], [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]]);
}

// ---------- buildings ----------
function barn(M, D, f, h, A, label) {
  const wall = col('#8e2b22'), trim = col('#e9e1cf'), roof = col('#4d4f52');
  boxAt(M, f, 0, 0, 0, f.a * 2, h * 0.62, f.b * 2, wall);
  gable(M, f, h * 0.62, h * 0.38, roof, wall);
  boxAt(M, f, 0, f.b + 0.05, 0, f.a * 0.5, h * 0.5, 0.3, col('#5a1a14'));
  boxAt(M, f, 0, f.b + 0.2, h * 0.5, f.a * 0.56, 0.4, 0.4, trim);
  if (label) { const [x, z] = local(f)(0, f.b + 0.45); signQuad(D, A.uv[label], x, h * 0.5 + 1.8, z, Math.min(f.a * 1.4, 26), 2.6, f.v[0], f.v[1]); }
}
function house(M, f, h) {
  boxAt(M, f, 0, 0, 0, f.a * 2, h * 0.62, f.b * 2, col('#efe6d2'));
  gable(M, f, h * 0.62, h * 0.38, col('#56463c'));
  boxAt(M, f, f.a * 0.55, 0, h * 0.62, 1.2, h * 0.5, 1.2, col('#8a5a44'));
  for (const lx of [-f.a * 0.5, 0, f.a * 0.5]) boxAt(M, f, lx, f.b + 0.05, h * 0.3, 1.4, 1.3, 0.2, col('#2f3d48'));
}
function shed(M, f, h) {
  boxAt(M, f, 0, 0, 0, f.a * 2, h * 0.75, f.b * 2, col('#8b8f86'));
  gable(M, f, h * 0.75, h * 0.25, col('#6b6e70'), col('#8b8f86'), 0.4);
}
function silo(T, f, h) {
  const r = Math.min(f.a, f.b);
  T.geo(new THREE.CylinderGeometry(r, r, h, 16, 1, true), mat(f.cx, h / 2, f.cz), col('#b9bec2'));
  T.geo(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(f.cx, h, f.cz), col('#9aa0a6'));
}
function bales(M, f, h, rnd) {
  const L = local(f);
  for (let i = 0; i < 18; i++) {
    const [x, z] = L((rnd() - 0.5) * f.a * 1.8, (rnd() - 0.5) * f.b * 1.8);
    M.geo(new THREE.CylinderGeometry(h / 2, h / 2, 1.6, 12), mat(x, h / 2, z, 0, rnd() * Math.PI, Math.PI / 2), col('#d8b35a', 0.85 + rnd() * 0.2));
  }
}
function tractor(M, f) {
  boxAt(M, f, 0, 0, 0.7, 3.4, 1.0, 1.4, col('#2f7d32'));
  boxAt(M, f, -0.7, 0, 1.5, 1.4, 1.4, 1.3, col('#2f7d32'));
  boxAt(M, f, -0.7, 0, 2.9, 1.6, 0.12, 1.5, col('#e0e0d8'));
  const L = local(f);
  for (const [lx, lz, r] of [[-1.1, -0.85, 0.75], [-1.1, 0.85, 0.75], [1.2, -0.75, 0.45], [1.2, 0.75, 0.45]]) {
    const [x, z] = L(lx, lz);
    M.geo(new THREE.CylinderGeometry(r, r, 0.45, 12), mat(x, r, z, Math.PI / 2, ry(f), 0), col('#1c1c1c'));
  }
}
function waterTower(M, T, G, D, A, tw, label) {
  const [x, , z] = tw.position, h = tw.height, leg = col('#6d6a63'), tank = col('#cfd3d0');
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) M.beam([x + sx * 3.2, 0, z + sz * 3.2], [x + sx * 2.2, h - 3, z + sz * 2.2], 0.35, leg);
  for (const k of [0.33, 0.66]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const r = 3.2 - k; M.beam([x + a[0] * r, h * k, z + a[1] * r], [x + b[0] * r, h * k, z + b[1] * r], 0.18, leg);
  }
  T.geo(new THREE.CylinderGeometry(4.2, 4.2, 4.5, 18), mat(x, h - 0.75, z), tank);
  T.geo(new THREE.ConeGeometry(4.5, 2.2, 18), mat(x, h + 2.6, z), col('#7c3a2c'));
  M.box(x, h - 3.2, z, 9.6, 0.25, 9.6, col('#5b544a'));
  // the "cab": a garden shed with windows on the tank's walkway
  M.box(x + 2.6, h - 1.9, z + 2.6, 3.2, 2.4, 3.2, col('#7a5a3a'));
  G.box(x + 2.6, h - 1.5, z + 2.6, 3.3, 0.9, 3.3, [1, 1, 1]);
  signQuad(D, A.uv[label], x, h - 0.6, z + 4.25, 6.4, 1.2, 0, 1);
  return { colliders: [{ min: [x - 4.6, 0, z - 4.6], max: [x + 4.6, h + 3.7, z + 4.6], kind: 'tower' }], cab: new THREE.Vector3(x + 2.6, h - 1.5, z + 2.6) };
}
function militaryTower(M, G, D, A, tw, label) {
  const [x, , z] = tw.position, h = tw.height, conc = col('#b8b4aa');
  M.box(x, (h - 5) / 2, z, 9, h - 5, 9, conc);
  M.box(x, h - 5.2, z, 13, 0.5, 13, col('#8f8b82'));
  G.box(x, h - 3, z, 11.5, 3.6, 11.5, [1, 1, 1]);
  M.box(x, h - 0.9, z, 13, 0.6, 13, col('#8f8b82'));
  M.geo(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), mat(x + 4, h + 2.4, z - 4), col('#d0d0d0'));
  M.box(x - 7.5, 3.5, z, 6, 7, 16, conc);
  signQuad(D, A.uv[label], x, h - 6.8, z + 4.55, 7.2, 1.35, 0, 1);
  return { colliders: [{ min: [x - 6.5, 0, z - 8], max: [x + 6.5, h + 5.5, z + 8], kind: 'tower' }, { min: [x - 10.5, 0, z - 8], max: [x - 4.5, 7, z + 8], kind: 'building' }], cab: new THREE.Vector3(x, h - 3, z) };
}
function opsBlock(M, G, D, A, f, h, label) {
  boxAt(M, f, 0, 0, 0, f.a * 2, h, f.b * 2, col('#c9c2b2'));
  boxAt(M, f, 0, 0, h, f.a * 2 + 0.6, 0.6, f.b * 2 + 0.6, col('#7d786d'));
  for (const y of [2.2, 6.2]) { const [x, z] = local(f)(0, f.b + 0.05); G.box(x, y + 1, z, f.a * 1.9, 1.6, 0.3, [1, 1, 1], ry(f)); }
  if (label) { const [x, z] = local(f)(0, f.b + 0.35); signQuad(D, A.uv[label], x, h - 1.4, z, Math.min(f.a * 1.2, 40), 2.6, f.v[0], f.v[1]); }
}
// arched hangar / hardened shelter: a half cylinder along size[1], the door on the +size[1] side (south for heading 0)
function arch(M, f, h, color, door) {
  const R = Math.min(f.a, h);
  const g = new THREE.CylinderGeometry(R, R, f.b * 2, 20, 1, false, -Math.PI / 2, Math.PI);
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  g.scale(f.a / R, h / R, 1);
  M.geo(g, mat(f.cx, 0, f.cz, 0, ry(f)), color);
  const [x, z] = local(f)(0, f.b);
  M.box(x, h * 0.42, z, f.a * 1.5, h * 0.84, 0.4, door, ry(f));
}

// windsocks: an instanced orange sock per spot (props.js style)
function windsocks(M, spots) {
  for (const [x, z] of spots) {
    M.geo(new THREE.CylinderGeometry(0.09, 0.14, 6.5, 6), mat(x, 3.25, z), col('#e6e6e6'));
    M.geo(new THREE.TorusGeometry(0.42, 0.03, 4, 12), mat(x + 0.42, 6.4, z, 0, Math.PI / 2, 0), col('#888'));
  }
  const b = new Builder();
  for (let k = 0; k < 5; k++) b.geo(new THREE.CylinderGeometry(0.42 - 0.05 * (k + 1), 0.42 - 0.05 * k, 0.72, 10, 1, true), mat(0, 0, 0.36 + k * 0.72, Math.PI / 2, 0, 0), k % 2 ? col('#f5f5f0') : col('#ff5a12'));
  const socks = new THREE.InstancedMesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), Math.max(1, spots.length));
  socks.count = spots.length;
  socks.castShadow = true; socks.name = 'windsocks';
  const base = spots.map(([x, z]) => new THREE.Vector3(x, 6.4, z));
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), one = new THREE.Vector3(1, 1, 1), mm = new THREE.Matrix4();
  function update(t, from, kt) {
    const toward = (from + 180) * Math.PI / 180, lift = Math.min(1, kt / 15);
    for (let i = 0; i < spots.length; i++) {
      e.set(-(1 - lift) * 1.25 + Math.sin(t * 3.1 + i) * 0.04, Math.PI - toward + Math.sin(t * (6 + i) + i) * 0.06 * (0.3 + lift), 0);
      socks.setMatrixAt(i, mm.compose(base[i], q.setFromEuler(e), one));
    }
    socks.instanceMatrix.needsUpdate = true;
  }
  update(0, 250, 8);
  socks.computeBoundingSphere();
  return { mesh: socks, update };
}

// livestock: one instanced mesh per species, scattered in each flock's area, all grazing in random directions
function flocks(list, rnd, heightAt) {
  const meshes = [];
  const sheep = new Builder(), cow = new Builder();
  sheep.box(0, 0.75, 0, 1.15, 0.7, 0.75, col('#ece8dc'));
  sheep.box(0.72, 0.85, 0, 0.36, 0.38, 0.34, col('#262321'));
  for (const [x, z] of [[-0.4, -0.25], [-0.4, 0.25], [0.38, -0.25], [0.38, 0.25]]) sheep.box(x, 0.2, z, 0.12, 0.4, 0.12, col('#262321'));
  cow.box(0, 1.2, 0, 2.2, 1.0, 0.95, [1, 1, 1]);
  cow.box(1.3, 1.35, 0, 0.6, 0.55, 0.5, [0.85, 0.85, 0.85]);
  cow.box(-0.55, 1.45, 0.49, 0.7, 0.5, 0.02, col('#1d1b1a'));
  cow.box(0.4, 1.1, -0.49, 0.6, 0.45, 0.02, col('#1d1b1a'));
  for (const [x, z] of [[-0.8, -0.32], [-0.8, 0.32], [0.75, -0.32], [0.75, 0.32]]) cow.box(x, 0.36, z, 0.18, 0.72, 0.18, [0.9, 0.9, 0.9]);
  const geo = { sheep: sheep.build(), cow: cow.build() };
  const matr = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const type of ['sheep', 'cow']) {
    const spots = [];
    for (const f of list.filter((p) => p.type === type)) {
      const F = footprint(f), L = local(F);
      for (let i = 0; i < f.count; i++) spots.push([...L((rnd() - 0.5) * F.a * 1.9, (rnd() - 0.5) * F.b * 1.9), rnd() * Math.PI * 2]);
    }
    if (!spots.length) { geo[type].dispose(); continue; }
    const m = new THREE.InstancedMesh(geo[type], matr, spots.length);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
    const tint = new THREE.Color();
    spots.forEach(([x, z, a], i) => {
      m.setMatrixAt(i, mm.compose(new THREE.Vector3(x, heightAt(x, z), z), q.setFromAxisAngle(up, a), s.setScalar(0.9 + rnd() * 0.25)));
      m.setColorAt(i, type === 'cow' ? tint.set(rnd() < 0.5 ? '#f2efe8' : '#7a4a2c') : tint.setRGB(1, 1, 1));
    });
    m.castShadow = true; m.receiveShadow = true; m.name = `flock-${type}`;
    m.computeBoundingSphere();
    meshes.push(m);
  }
  return meshes;
}

function hedges(list, quality) {
  const H = new Builder(), trees = [], r = rng(57);
  for (const p of list) for (let i = 1; i < p.pts.length; i++) {
    const [a, b] = [p.pts[i - 1], p.pts[i]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / (quality === 'low' ? 8 : 4)));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      const h = p.h * (0.8 + 0.4 * fbm(x0 / 9, z0 / 9, 2)), c = col('#46672d', 0.8 + 0.35 * fbm(x0 / 7, z0 / 7, 2));
      H.geo(new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0) + 0.4, h, 2.2 + r() * 0.6), mat((x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0)), c, 3);
    }
    for (let s = 12; s < len; s += 26) if (r() < 0.4) trees.push([a[0] + (b[0] - a[0]) * s / len + (r() - 0.5) * 3, a[1] + (b[1] - a[1]) * s / len + (r() - 0.5) * 3, r() < 0.15 ? 2 : 0, 11 + r() * 6]);
  }
  const g = H.build(), N = g.attributes.normal;
  for (let i = 0; i < N.count; i++) { const nx = N.getX(i), ny = Math.abs(N.getY(i)) + 2.2, nz = N.getZ(i), l = Math.hypot(nx, ny, nz); N.setXYZ(i, nx / l, ny / l, nz / l); }
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = quality !== 'low'; mesh.receiveShadow = true; mesh.name = 'hedges';
  return { mesh, trees };
}

// ---------- ground: grass strip + tracks + farmyard, or asphalt runway + taxiways + apron ----------
function grassGround(def, FR, SG) {
  const G = new Builder(), r = rng(13), tw = def.taxiwayWidth ?? 10;
  for (const F of FR.filter((x) => x.grass)) {
    const n = Math.ceil(F.L / 20), lanes = 4, lw = F.W / lanes;
    for (let i = 0; i < n; i++) for (let k = 0; k < lanes; k++) {
      const s = -F.L / 2 + (i + 0.5) * F.L / n, t = -F.W / 2 + (k + 0.5) * lw, v = (k % 2 ? 0.9 : 1.04) * (0.98 + (fbm(s / 60, F.W + k, 2) - 0.5) * 0.1);
      G.rect(F.cx + F.dx * s + F.rx * t, F.cz + F.dz * s + F.rz * t, F.dx, F.dz, F.L / n + 0.1, lw + 0.05, Y_PAVE, col('#a9bd5e', v));
    }
    for (const e of [0, 1]) {
      const [dx, dz] = rwDir(F, e);
      for (const t of [-1.7, 1.7]) {
        const p0 = rwPt(F, e, 60, t), p1 = rwPt(F, e, F.L * 0.62, t);
        ribbon(G, [p0, p1], 0.9, Y_PAVE + 0.004, col('#6b6040', 0.95 + r() * 0.1));
      }
      for (let k = -3; k <= 3; k++) {   // white threshold boards (painted planks on the grass)
        const [x, z] = rwPt(F, e, 4, k * (F.W / 7.5));
        G.rect(x, z, dx, dz, 3.5, 0.9, Y_PAVE + 0.008, WHITE);
      }
    }
  }
  for (const S of SG) {
    G.rect(S.p0[0] + S.dx * S.len / 2, S.p0[1] + S.dz * S.len / 2, S.dx, S.dz, S.len + tw * 0.6, tw * 0.85, Y_PAVE - 0.004, col('#87994d'));
    for (const t of [-1.2, 1.2]) ribbon(G, [[S.p0[0] - S.dz * t, S.p0[1] + S.dx * t], [S.p1[0] - S.dz * t, S.p1[1] + S.dx * t]], 0.8, Y_PAVE, col('#6f6142'));
  }
  for (const a of def.aprons || []) {
    const f = footprint(a), L = local(f), n = 6;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const lx = -f.a + (i + 0.5) * 2 * f.a / n, lz = -f.b + (j + 0.5) * 2 * f.b / n, [x, z] = L(lx, lz);
      G.rect(x, z, f.u[0], f.u[1], 2 * f.a / n + 0.1, 2 * f.b / n + 0.1, Y_PAVE - 0.006, col('#9a8f6e', 0.9 + 0.15 * fbm(x / 30, z / 30, 2)));
    }
  }
  return G;
}

function asphaltGround(def, FR, SG, HO, A) {
  const P = new Builder(true), M = new Builder(false), D = new Builder(true), tw = def.taxiwayWidth ?? 15, r = rng(5);
  for (const F of FR) {
    for (const side of [-1, 1]) P.rect(F.cx + F.rx * side * (F.W / 2 + F.shoulder / 2), F.cz + F.rz * side * (F.W / 2 + F.shoulder / 2), F.dx, F.dz, F.L, F.shoulder, Y_PAVE - 0.005, tone(0.42, 0.03));
    for (const e of [0, 1]) { const [px, pz] = rwPt(F, e, -PAD_LEN / 2, 0); P.rect(px, pz, F.dx, F.dz, PAD_LEN, F.W + 2 * F.shoulder, Y_PAVE - 0.005, tone(0.4, 0.03)); }
  }
  for (const a of def.aprons || []) { const f = footprint(a); P.rect(f.cx, f.cz, f.u[0], f.u[1], f.a * 2, f.b * 2, Y_PAVE - 0.003, tone(0.56, 0.02)); }
  for (const S of SG) P.rect(S.p0[0] + S.dx * S.len / 2, S.p0[1] + S.dz * S.len / 2, S.dx, S.dz, S.len + tw, tw, Y_PAVE, tone(0.31 * (0.95 + r() * 0.1)));
  for (const F of FR) runwaySurface(P, F);
  for (let k = 0; k < P.count; k++) { P.u[k * 2] = P.p[k * 3] / 9; P.u[k * 2 + 1] = -P.p[k * 3 + 2] / 9; }
  const rects = FR.map((F) => F.rect);
  for (const F of FR) {
    const W = F.W, L = F.L, edgeW = W >= 30 ? 0.9 : 0.45;
    const mark = (e, a0, a1, t0, t1) => ribbon(M, [rwPt(F, e, a0, (t0 + t1) / 2), rwPt(F, e, a1, (t0 + t1) / 2)], Math.abs(t1 - t0), Y_MARK, WHITE);
    for (const s of [-1, 1]) mark(0, 0, L, s * (W / 2 - edgeW), s * W / 2);
    const per = (W >= 45 ? 12 : W >= 30 ? 8 : 6) / 2;
    for (const e of [0, 1]) {
      for (let k = 0; k < per; k++) { const t = 2.7 + k * 3.6; for (const s of [-1, 1]) mark(e, 6, 36, s * (t - 0.9), s * (t + 0.9)); }
      const p = rwPt(F, e, 52.5, 0), [dx, dz] = rwDir(F, e), key = 'rw' + F.rw.ends[e];
      if (A.uv[key]) D.rect(p[0], p[1], dx, dz, 9, 7.5, Y_MARK + 0.002, [1, 1, 1], uvQuad(A.uv[key]));
      for (const s of [-1, 1]) mark(e, 300, 345, s * 6, s * 10);
      for (const [a, bars] of [[150, 3], [450, 2], [600, 1]]) for (let k = 0; k < bars; k++) for (const s of [-1, 1]) mark(e, a, a + 22.5, s * (6 + k * 3.3), s * (7.8 + k * 3.3));
    }
    for (let a = 69; a + 30 < L - 69; a += 50) mark(0, a, a + 30, -0.45, 0.45);
  }
  for (const S of SG) clipPolyline(M, [S.p0, S.p1], 0.3, Y_MARK, YELLOW, rects);
  for (const h of HO) holdLines(M, h, tw);
  for (const st of def.stands) {
    const [x, , z] = st.position, [fx, fz] = headingToVec(st.heading);
    ribbon(M, [[x + fx * 60, z + fz * 60], [x, z]], 0.3, Y_MARK, YELLOW);
    clipPolyline(M, arc(x, z, 9, 0, Math.PI * 2, 32), 0.3, Y_MARK, YELLOW, []);
    ribbon(M, [[x - fz * 2.2 - fx * 6, z + fx * 2.2 - fz * 6], [x + fz * 2.2 - fx * 6, z - fx * 2.2 - fz * 6]], 0.45, Y_MARK, YELLOW);
  }
  const RED = col('#c0182c', 0.9);
  for (const a of def.aprons || []) {
    const f = footprint(a), L = local(f);
    dashed(M, [L(-f.a + 6, -f.b + 30), L(f.a - 6, -f.b + 30)], 0.3, Y_MARK, RED, 3, 2);
  }
  return { P, M, D };
}

// ---------- the world ----------
export async function buildSite(scene, renderer, def, opts = {}) {
  let quality = ['low', 'medium', 'high'].includes(opts.quality) ? opts.quality : 'high';
  const timings = {};
  let tm = performance.now();
  const mark = (k) => { const n = performance.now(); timings[k] = Math.round(n - tm); tm = n; };
  const yields = !!(opts.onProgress || opts.yield);
  const step = async (f, label) => {
    try { opts.onProgress?.(f, label); } catch (e) { /* */ }
    if (!yields) return;
    const y0 = performance.now();
    await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
    tm += performance.now() - y0;
  };
  const FR = framesOf(def), SG = segmentsOf(def), HO = holdsOf(def, FR, SG);
  const mown = (def.scenery?.mown || []).map(footprint);
  const pond = def.scenery?.pond || null;
  const flat = (def.flat || []).map(({ rect: [[x0, z0], [x1, z1]] }) => ({ x0, x1, z0, z1 }));
  setTerrainSite({ flat, lake: pond, castle: null, town: null, longRoadZ: null,
    mask: (x, z) => { let d = 1e9; for (const f of mown) d = Math.min(d, fpDist(f, x, z, 30) - 30); return 1 - Math.min(1, Math.max(0, d / 10)); } });

  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const sky = createSky(quality);
  root.add(sky);
  const env = bakeEnvironment(renderer, sky);
  const { hemi, sun } = createLights(scene, quality);
  mark('sky');
  await step(0.03, 'terrain');
  const terrain = createTerrain(renderer, quality);
  root.add(terrain.mesh);
  const lake = pond ? createLake(renderer, env, pond) : null;
  if (lake) root.add(lake.mesh);
  mark('terrain');
  await step(0.25, 'runway');

  const asphalt = FR.some((F) => !F.grass);
  const labels = [
    ...FR.flatMap((F) => (F.grass ? [] : F.rw.ends.map((n) => ({ key: 'rw' + n, text: n, w: 256, h: 300, size: 280, color: '#ffffff' })))),
    { key: 'tower', text: def.towerName ? def.towerName.split('·')[0].trim().toUpperCase() : `C-TOWER ${def.n}`, w: 512, h: 96, size: 60, bg: def.scenery?.biome === 'farm' ? '#3d2a18' : '#14304d', color: '#f7dc7a' },
    ...(def.terminal?.label ? [{ key: 'terminal', text: def.terminal.label, w: 1024, h: 96, size: 64, bg: def.scenery?.biome === 'farm' ? '#efe3c2' : '#1f2a33', color: def.scenery?.biome === 'farm' ? '#5a1a14' : '#f2f2f2' }] : []),
  ];
  const A = labelAtlas(labels, renderer);
  const ground = [];
  if (asphalt) {
    const { P, M, D } = asphaltGround(def, FR, SG, HO, A);
    const pave = new THREE.Mesh(P.build(), new THREE.MeshStandardMaterial({ map: asphaltTexture(renderer), vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    pave.receiveShadow = true; pave.renderOrder = -8; pave.name = 'pavement';
    const marks = new THREE.Mesh(M.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
    marks.receiveShadow = true; marks.renderOrder = -7; marks.name = 'markings';
    const nums = new THREE.Mesh(D.build(), new THREE.MeshStandardMaterial({ map: A.texture, transparent: true, roughness: 0.75, color: '#ebebe6', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
    nums.receiveShadow = true; nums.renderOrder = -6; nums.name = 'groundDecals';
    ground.push(pave, marks, nums);
  } else {
    const G = grassGround(def, FR, SG);
    const m = new THREE.Mesh(G.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    m.receiveShadow = true; m.renderOrder = -8; m.name = 'strip';
    ground.push(m);
  }
  root.add(...ground);
  mark('ground');
  await step(0.4, 'buildings');

  const M = new Builder(), T = new Builder(), Gl = new Builder(), D = new Builder(true);
  const colliders = [], r = rng(def.n * 97 + 3);
  const tw = def.tower, tr = tw.kind === 'watertank' ? waterTower(M, T, Gl, D, A, tw, 'tower') : militaryTower(M, Gl, D, A, tw, 'tower');
  colliders.push(...tr.colliders);
  if (def.terminal) {
    const f = footprint(def.terminal), h = def.terminal.height;
    if (def.terminal.kind === 'barn') barn(M, D, f, h, A, def.terminal.label && 'terminal'); else opsBlock(M, Gl, D, A, f, h, def.terminal.label && 'terminal');
    colliders.push(aabb(f, h, 'terminal'));
  }
  const hedgeProps = [], flockProps = [];
  for (const p of def.props || []) {
    if (p.kind === 'hedge') { hedgeProps.push(p); continue; }
    if (p.kind === 'flock') { flockProps.push(p); continue; }
    const f = footprint(p), h = p.h ?? 4;
    if (p.kind === 'house') house(M, f, h);
    else if (p.kind === 'shed') shed(M, f, h);
    else if (p.kind === 'silo') silo(T, f, h);
    else if (p.kind === 'bales') { bales(M, f, h, r); continue; }
    else if (p.kind === 'tractor') { tractor(M, f); continue; }
    else if (p.kind === 'hangar') arch(T, f, h, col('#8d949a'), col('#5d646a'));
    else if (p.kind === 'shelter') arch(M, f, h, col('#7d8270'), col('#4f5448'));
    else if (p.kind === 'fueltank') T.geo(new THREE.CylinderGeometry(f.a, f.a, h, 18), mat(f.cx, h / 2, f.cz), col('#d7d9d4'));
    else if (p.kind === 'radar') {
      M.beam([f.cx, 0, f.cz], [f.cx, h - 4, f.cz], 1.6, col('#9c9c96'));
      T.geo(new THREE.SphereGeometry(4.5, 16, 10), mat(f.cx, h, f.cz), col('#f1f1ee'));
    }
    colliders.push(aabb(f, h, p.kind === 'hangar' || p.kind === 'shelter' ? 'hangar' : 'building'));
  }
  for (const F of FR.filter((x) => x.grass)) for (let a = 0; a <= F.L + 0.1; a += 40) for (const side of [-1, 1]) {
    const [x, z] = rwPt(F, 0, a, side * (F.W / 2 + 1.5));
    M.box(x, 0.25, z, 1.4, 0.5, 0.5, col('#f4f2ea'), Math.atan2(-F.dz, F.dx));
  }
  const socks = windsocks(M, def.windsocks || []);
  const hedge = hedges(hedgeProps, quality);
  const animals = flocks(flockProps, r, terrain.heightAt);
  const matteMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7, envMap: env, envMapIntensity: 1.0 });
  const matte = new THREE.Mesh(M.build(), matteMat); matte.name = 'buildings';
  const metal = new THREE.Mesh(T.build(), metalMat); metal.name = 'metal';
  for (const m of [matte, metal]) { m.castShadow = m.receiveShadow = true; }
  const glass = new THREE.Mesh(Gl.build(), new THREE.MeshStandardMaterial({ color: '#4d6a70', roughness: 0.05, metalness: 0.3, envMap: env, envMapIntensity: 1.4, transparent: true, opacity: 0.5, depthWrite: false }));
  glass.renderOrder = 2; glass.name = 'glass';
  const signs = new THREE.Mesh(D.build(), new THREE.MeshStandardMaterial({ map: A.texture, roughness: 0.6, emissive: '#ffffff', emissiveMap: A.texture, emissiveIntensity: 0.2, side: THREE.DoubleSide }));
  signs.name = 'signs';
  root.add(matte, metal, glass, signs, socks.mesh, hedge.mesh, ...animals);
  const applyShadowTier = (q) => { matte.castShadow = metal.castShadow = q !== 'low'; hedge.mesh.castShadow = q !== 'low'; };
  applyShadowTier(quality);
  mark('buildings');
  await step(0.55, 'trees');

  const block = new BlockGrid();
  for (const c of colliders) block.rect(c.min[0] - 6, c.min[2] - 6, c.max[0] + 6, c.max[2] + 6);
  for (const p of flockProps) { const f = footprint(p); block.disc(f.cx, f.cz, Math.max(f.a, f.b)); }
  const noGo = (x, z) => {
    for (const f of mown) if (fpDist(f, x, z) < 25) return true;
    for (const F of FR) {
      const rx = x - F.cx, rz = z - F.cz;
      const a = Math.abs(rx * F.dx + rz * F.dz) - F.L / 2, b = Math.abs(-rx * F.dz + rz * F.dx);
      if (a > 0 && a < 3200 && b < 160 + a * 0.15) return true;
    }
    if (pond && lakeDist(x, z) < 1.1) return true;
    return block.has(x, z);
  };
  const trees = await buildTrees(renderer, quality, { heightAt: terrain.heightAt, noGo, extra: hedge.trees, pause: (f) => step(0.55 + 0.33 * f, 'trees') });
  root.add(trees.group);
  mark('trees');
  await step(0.9, 'shade');
  terrain.uniforms.uShade.value = shadeTexture(SHADE_EXTENT, quality === 'low' ? 1024 : 2048, trees, colliders);
  mark('shade');

  const buildingBoxes = colliders;
  const aprons = (def.aprons || []).map(footprint);
  function surfaceAt(x, z) {
    for (const c of buildingBoxes) if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) return 'building';
    for (const F of FR) if (inRect(x, z, F.rect)) return 'runway';
    for (const S of SG) if (inRect(x, z, S.rect)) return 'taxiway';
    for (const F of FR) if (inRect(x, z, F.strip)) return 'runway';
    for (const a of aprons) if (inFp(a, x, z)) return 'apron';
    if (pond && inLake(x, z)) return 'water';
    return 'grass';
  }
  function runwayAt(x, z) { for (const F of FR) if (inRect(x, z, F.rect)) return F.id; return null; }

  const wind = { from: opts.windFrom ?? def.wind?.from ?? 250, kt: opts.windKt ?? def.wind?.kt ?? 8 };
  const setWind = (from, kt) => { wind.from = from; wind.kt = kt; };
  let time = 0;
  function update(dt, camera) {
    time += dt;
    if (camera) { sky.position.copy(camera.position); trees.update(camera); }
    sky.material.uniforms.uTime.value = time;
    if (lake) lake.uniforms.uTime.value = time;
    socks.update(time, wind.from, wind.kt);
  }
  function setQuality(q) {
    if (!['low', 'medium', 'high'].includes(q) || q === quality) return;
    quality = q;
    trees.setQuality(q);
    applyShadowTier(q);
    terrain.uniforms.uBump.value = q === 'low' ? 0 : 1;
    const size = q === 'low' ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  }
  setShadowFocus(sun, def.stands[0]?.position[0] ?? 0, def.stands[0]?.position[2] ?? 0, 430);
  try { opts.onProgress?.(1, 'done'); } catch (e) { /* */ }
  return {
    update, setQuality, get quality() { return quality; },
    treeStats: trees.stats, groundHeightAt: terrain.heightAt, surfaceAt, runwayAt, colliders, sun, hemi, envMap: env, wind, setWind,
    setShadowFocus: (x, z, rad) => setShadowFocus(sun, x, z, rad), sunDir: SUN_DIR.clone(),
    tower: { cab: tr.cab, crew: null }, papi: null, root, airport: def.id,
    dispose: () => { trees.dispose(); disposeWorld(scene, root, { lights: [hemi, sun], uniformSets: [terrain.uniforms, lake?.uniforms], textures: [env, A.texture] }); },
    debug: { terrain, trees, lake, timings },
  };
}
