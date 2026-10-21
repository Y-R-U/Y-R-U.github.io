import * as THREE from 'three';
import { Builder, rng, col, mat } from './util.js';
import { TOWN, CASTLE } from './terrain.js';
import { buildCrown } from './terminal.js';

// Village roads (axis-aligned, flat — drawn by pavement.js through ROADS) and country lanes (draped polylines).
export const TOWN_ROADS = [
  { x0: -85, x1: -75, z0: -1890, z1: -1240 },
  { x0: -560, x1: 360, z0: -1555, z1: -1545 },
  { x0: -430, x1: -75, z0: -1745, z1: -1736 },
];
export const CASTLE_GATE = [CASTLE.x, CASTLE.z + 80];

function bez(pts, n) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const p0 = pts[s], p1 = pts[s + 1];
    const m0 = s > 0 ? [(p1[0] - pts[s - 1][0]) / 2, (p1[1] - pts[s - 1][1]) / 2] : [p1[0] - p0[0], p1[1] - p0[1]];
    const m1 = s < pts.length - 2 ? [(pts[s + 2][0] - p0[0]) / 2, (pts[s + 2][1] - p0[1]) / 2] : [p1[0] - p0[0], p1[1] - p0[1]];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const k = Math.max(2, Math.ceil(L / n));
    for (let i = 0; i < k; i++) {
      const t = i / k, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0], h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const LANES = [
  { w: 7, kind: 'lane', pts: bez([[355, -1550], [520, -1600], [700, -1760], [760, -1980], CASTLE_GATE.slice(), [CASTLE.x, CASTLE.z]], 8) },
  { w: 9, kind: 'road', pts: bez([[-9000, 1900], [-6000, 1650], [-3600, 1420], [-1500, 1300], [0, 1250], [1600, 1330], [3600, 1500], [6000, 1450], [9000, 1800]], 12) },
  { w: 12, kind: 'road', pts: bez([[3600, -1240], [5200, -1300], [7000, -1100], [9500, -1400]], 14) },
  { w: 12, kind: 'road', pts: bez([[-3600, -1240], [-5200, -1180], [-7200, -1450], [-9500, -1300]], 14) },
  { w: 7, kind: 'lane', pts: bez([[-2350, -1240], [-2420, -700], [-2250, -100], [-2380, 600], [-2300, 1352]], 10) },
  { w: 7, kind: 'lane', pts: bez([[2250, -1240], [2350, -600], [2200, 200], [2420, 900], [2380, 1420]], 10) },
];
export const FARMS = [
  { x: 1650, z: -820, ry: 0.3, to: [2290, -820] },
  { x: -2950, z: -260, ry: -0.2, to: [-2290, -260] },
  { x: -1150, z: 1650, ry: 0.1, to: [-1150, 1300] },
  { x: 1300, z: 1720, ry: -0.4, to: [1300, 1330] },
  { x: 3100, z: 420, ry: 0.6, to: [2300, 420] },
  { x: -3300, z: -1900, ry: 0.2, to: [-3300, -1240] },
  { x: 2700, z: -2200, ry: -0.3, to: [2700, -1260] },
];

// ---------- house archetypes: walls / roof / fixed-colour parts, tinted per instance ----------
const GLASS = col('#262d33'), FRAME = col('#ece8de'), DOOR = [col('#2d4a3a'), col('#5a1f24'), col('#23324f')], CHIM = col('#8a4c3a'), POT = col('#b0603e');

function gable(W, R, w, d, eave, rh, ov = 0.4, alongZ = false) {
  const q = (a, b, c, e, bld) => bld.quad(a, b, c, e, [1, 1, 1]);
  if (!alongZ) {
    const x0 = -w / 2 - ov, x1 = w / 2 + ov, z0 = -d / 2 - ov, z1 = d / 2 + ov, yr = eave + rh, ye = eave - ov * rh / (d / 2);
    q([x0, ye, z1], [x1, ye, z1], [x1, yr, 0], [x0, yr, 0], R);
    q([x1, ye, z0], [x0, ye, z0], [x0, yr, 0], [x1, yr, 0], R);
    q([x0, ye, z1], [x0, yr, 0], [x1, yr, 0], [x1, ye, z1], R);
    q([x1, ye, z0], [x1, yr, 0], [x0, yr, 0], [x0, ye, z0], R);
    q([w / 2, eave, d / 2], [w / 2, eave, -d / 2], [w / 2, yr, 0], [w / 2, yr, 0], W);
    q([-w / 2, eave, -d / 2], [-w / 2, eave, d / 2], [-w / 2, yr, 0], [-w / 2, yr, 0], W);
  } else {
    const z0 = -d / 2 - ov, z1 = d / 2 + ov, x0 = -w / 2 - ov, x1 = w / 2 + ov, yr = eave + rh, ye = eave - ov * rh / (w / 2);
    q([x1, ye, z1], [x1, ye, z0], [0, yr, z0], [0, yr, z1], R);
    q([x0, ye, z0], [x0, ye, z1], [0, yr, z1], [0, yr, z0], R);
    q([x1, ye, z1], [0, yr, z1], [0, yr, z0], [x1, ye, z0], R);
    q([x0, ye, z0], [0, yr, z0], [0, yr, z1], [x0, ye, z1], R);
    q([-w / 2, eave, d / 2], [w / 2, eave, d / 2], [0, yr, d / 2], [0, yr, d / 2], W);
    q([w / 2, eave, -d / 2], [-w / 2, eave, -d / 2], [0, yr, -d / 2], [0, yr, -d / 2], W);
  }
}
function gableAt(M, x, y, z, w, d, eave, rh, ov, wallC, roofC, ry = 0) {
  const W = new Builder(), R = new Builder();
  gable(W, R, w, d, eave, rh, ov);
  W.c.forEach((_, i) => { W.c[i] = wallC[i % 3]; });
  R.c.forEach((_, i) => { R.c[i] = roofC[i % 3]; });
  M.geo(W.build(), mat(x, y, z, 0, ry), wallC);
  M.geo(R.build(), mat(x, y, z, 0, ry), roofC);
}
function hip(R, w, d, eave, rh, ov = 0.45) {
  const x0 = -w / 2 - ov, x1 = w / 2 + ov, z0 = -d / 2 - ov, z1 = d / 2 + ov, yr = eave + rh, ye = eave - 0.3;
  const hx = Math.max(0, w / 2 - d / 2);
  const q = (a, b, c, e) => R.quad(a, b, c, e, [1, 1, 1]);
  q([x0, ye, z1], [x1, ye, z1], [hx, yr, 0], [-hx, yr, 0]);
  q([x1, ye, z0], [x0, ye, z0], [-hx, yr, 0], [hx, yr, 0]);
  q([x1, ye, z1], [x1, ye, z0], [hx, yr, 0], [hx, yr, 0]);
  q([x0, ye, z0], [x0, ye, z1], [-hx, yr, 0], [-hx, yr, 0]);
}
// Flat window: frame quad + glass quad, on a wall facing +z (face 1) or -z (face -1).
function windowAt(F, x, y, z, w, h, face = 1) {
  const q = (hw, hh, off, c) => {
    const zz = z + face * off;
    if (face > 0) F.quad([x - hw, y - hh, zz], [x + hw, y - hh, zz], [x + hw, y + hh, zz], [x - hw, y + hh, zz], c);
    else F.quad([x + hw, y - hh, zz], [x - hw, y - hh, zz], [x - hw, y + hh, zz], [x + hw, y + hh, zz], c);
  };
  q(w / 2 + 0.12, h / 2 + 0.12, 0.03, FRAME);
  q(w / 2, h / 2, 0.05, GLASS);
}
function windowSide(F, x, y, z, w, h, face = 1) {
  const q = (hw, hh, off, c) => {
    const xx = x + face * off;
    if (face > 0) F.quad([xx, y - hh, z + hw], [xx, y - hh, z - hw], [xx, y + hh, z - hw], [xx, y + hh, z + hw], c);
    else F.quad([xx, y - hh, z - hw], [xx, y - hh, z + hw], [xx, y + hh, z + hw], [xx, y + hh, z - hw], c);
  };
  q(w / 2 + 0.12, h / 2 + 0.12, 0.03, FRAME);
  q(w / 2, h / 2, 0.05, GLASS);
}
function chimney(F, x, y, z, h = 1.8) {
  F.box(x, y + h / 2, z, 0.9, h, 0.7, CHIM);
  F.box(x - 0.18, y + h + 0.2, z, 0.22, 0.4, 0.22, POT);
  F.box(x + 0.18, y + h + 0.2, z, 0.22, 0.4, 0.22, POT);
}

const ARCH = {
  cottage: (W, R, F) => {
    const w = 8.6, d = 6.8, e = 5.0, rh = 3.3;
    W.box(0, e / 2, 0, w, e, d, [1, 1, 1], 0, false);
    gable(W, R, w, d, e, rh);
    chimney(F, w / 2 - 0.6, e + rh - 0.6, 0);
    for (const x of [-2.4, 2.4]) { windowAt(F, x, 1.5, d / 2, 1.3, 1.2); windowAt(F, x, 3.8, d / 2, 1.2, 1.1); windowAt(F, x, 1.5, -d / 2, 1.2, 1.1, -1); }
    windowAt(F, 0, 3.8, -d / 2, 1.0, 1.0, -1);
    F.box(0, 1.05, d / 2 + 0.05, 1.0, 2.1, 0.1, DOOR[0]);
    return { w, d, h: e + rh };
  },
  terrace: (W, R, F) => {
    const w = 19, d = 8, e = 5.8, rh = 3.4;
    W.box(0, e / 2, 0, w, e, d, [1, 1, 1], 0, false);
    gable(W, R, w, d, e, rh, 0.35);
    for (const x of [-w / 2 + 0.6, -w / 6, w / 6, w / 2 - 0.6]) chimney(F, x, e + rh - 0.4, 0, 1.4);
    for (let k = 0; k < 3; k++) {
      const cx = -w / 3 + k * w / 3;
      F.box(cx - 1.5, 1.05, d / 2 + 0.05, 1.0, 2.1, 0.1, DOOR[k % 3]);
      windowAt(F, cx + 1.2, 1.5, d / 2, 1.6, 1.3);
      windowAt(F, cx - 1.5, 4.1, d / 2, 1.1, 1.1); windowAt(F, cx + 1.2, 4.1, d / 2, 1.3, 1.1);
      windowAt(F, cx, 1.5, -d / 2, 1.3, 1.1, -1); windowAt(F, cx, 4.1, -d / 2, 1.3, 1.1, -1);
    }
    return { w, d, h: e + rh };
  },
  manor: (W, R, F) => {
    const w = 13, d = 10, e = 6.4, rh = 3.8;
    W.box(0, e / 2, 0, w, e, d, [1, 1, 1], 0, false);
    hip(R, w, d, e, rh);
    chimney(F, -w / 4, e + rh - 1.2, 0, 2.2); chimney(F, w / 4, e + rh - 1.2, 0, 2.2);
    for (const x of [-4.4, -1.8, 1.8, 4.4]) { windowAt(F, x, 4.4, d / 2, 1.2, 1.5); windowAt(F, x, 4.4, -d / 2, 1.2, 1.5, -1); if (Math.abs(x) > 2) windowAt(F, x, 1.7, d / 2, 1.3, 1.7); }
    for (const z of [-2.2, 2.2]) { windowSide(F, w / 2, 1.7, z, 1.2, 1.5); windowSide(F, -w / 2, 1.7, z, 1.2, 1.5, -1); }
    F.box(0, 1.25, d / 2 + 0.05, 1.4, 2.5, 0.1, DOOR[1]);
    F.box(0, 2.7, d / 2 + 0.7, 2.6, 0.2, 1.4, FRAME);
    return { w, d, h: e + rh };
  },
  shop: (W, R, F) => {
    const w = 9.5, d = 11, e = 6.6, rh = 3.6;
    W.box(0, e / 2, 0, w, e, d, [1, 1, 1], 0, false);
    gable(W, R, w, d, e, rh, 0.35, true);
    chimney(F, w / 2 - 1, e + rh * 0.5, -d / 4, 1.8);
    F.box(0, 1.4, d / 2 + 0.06, w - 1.6, 2.2, 0.1, GLASS);
    F.box(0, 2.9, d / 2 + 0.12, w - 0.8, 0.7, 0.16, DOOR[2]);
    windowAt(F, -2.2, 4.6, d / 2, 1.3, 1.4); windowAt(F, 2.2, 4.6, d / 2, 1.3, 1.4); windowAt(F, 0, 7.3, d / 2, 1.0, 1.0);
    return { w, d, h: e + rh };
  },
  barn: (W, R, F) => {
    const w = 22, d = 11, e = 5.2, rh = 2.6;
    W.box(0, e / 2, 0, w, e, d, [1, 1, 1], 0, false);
    gable(W, R, w, d, e, rh, 0.5);
    F.box(0, 2.3, d / 2 + 0.05, 5, 4.6, 0.1, col('#3a2c22'));
    return { w, d, h: e + rh };
  },
};

function archetypeGeometry(name) {
  const W = new Builder(), R = new Builder(), F = new Builder();
  const dims = ARCH[name](W, R, F);
  const parts = [W.build(), R.build(), F.build()];
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3), part = new Float32Array(n);
  const idx = [];
  let o = 0;
  parts.forEach((g, p) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    colr.set(g.attributes.color.array, o * 3);
    part.fill(p, o, o + g.attributes.position.count);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
    g.dispose();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('part', new THREE.BufferAttribute(part, 1));
  g.setIndex(idx);
  return { geo: g, dims };
}

function houseMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part; attribute vec3 iWall; attribute vec3 iRoof;')
      .replace('#include <color_vertex>', 'vColor = color * (part < 0.5 ? iWall : part < 1.5 ? iRoof : vec3(1.0));');
  };
  return m;
}

const WALLS = ['#e9dfc9', '#efe8dc', '#d9c49c', '#a65a42', '#94503c', '#b86e4e', '#f2efe8', '#cfc6b6', '#e3cf9e', '#8f7f6a'];
const ROOFS = ['#4a4d55', '#3d4148', '#8b4632', '#9a5536', '#7a3e2c', '#56545a', '#a8915a'];

// Plots along each village road; returns house instances + garden tree spots.
function layoutVillage(r, heightAt) {
  const houses = [], trees = [];
  const green = { x0: -74, x1: 70, z0: -1640, z1: -1556 };
  const church = { x: 125, z: -1605 };
  const blocked = (x, z, rad) => (x > green.x0 - rad && x < green.x1 + rad && z > green.z0 - rad && z < green.z1 + rad) || Math.hypot(x - church.x, z - church.z) < 42 + rad;
  const fronts = [];
  for (const rd of [...TOWN_ROADS, { x0: -640, x1: 380, z0: -1246, z1: -1234 }]) {
    const horiz = rd.x1 - rd.x0 > rd.z1 - rd.z0;
    const len = horiz ? rd.x1 - rd.x0 : rd.z1 - rd.z0;
    for (const side of [-1, 1]) {
      let s = 8 + r() * 6;
      while (s < len - 8) {
        const cx = horiz ? rd.x0 + s : (rd.x0 + rd.x1) / 2, cz = horiz ? (rd.z0 + rd.z1) / 2 : rd.z0 + s;
        const central = Math.hypot(cx + 80, cz + 1550) < 170;
        const pick = r();
        const type = central ? (pick < 0.35 ? 'shop' : pick < 0.8 ? 'terrace' : 'cottage') : (pick < 0.5 ? 'cottage' : pick < 0.72 ? 'terrace' : pick < 0.92 ? 'manor' : 'cottage');
        fronts.push({ type, cx, cz, horiz, side, rd, s, central });
        const w = { cottage: 8.6, terrace: 19, manor: 13, shop: 9.5 }[type];
        s += w + (central ? 1 + r() * 2 : 4 + r() * 9);
      }
    }
  }
  for (const f of fronts) {
    const w = { cottage: 8.6, terrace: 19, manor: 13, shop: 9.5 }[f.type], d = { cottage: 6.8, terrace: 8, manor: 10, shop: 11 }[f.type];
    const half = f.horiz ? (f.rd.z1 - f.rd.z0) / 2 : (f.rd.x1 - f.rd.x0) / 2;
    const set = half + (f.central ? 2.5 : 5 + r() * 5) + d / 2;
    const x = f.horiz ? f.cx + (f.type === 'terrace' ? w / 2 - 4 : 0) : f.cx + f.side * set;
    const z = f.horiz ? f.cz + f.side * set : f.cz + (f.type === 'terrace' ? w / 2 - 4 : 0);
    const ry = f.horiz ? (f.side > 0 ? 0 : Math.PI) : (f.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    if (x < TOWN.x0 + 10 || x > TOWN.x1 - 10 || z < TOWN.z0 + 10 || z > TOWN.z1) continue;
    if (blocked(x, z, Math.max(w, d) / 2)) continue;
    const cr = Math.max(w, d) / 2 + 1.5;
    let clash = false;
    for (const h of houses) if (Math.abs(h.x - x) < (cr + h.cr) * 0.8 && Math.abs(h.z - z) < (cr + h.cr) * 0.8) { clash = true; break; }
    for (const rd of [...TOWN_ROADS, { x0: -640, x1: 380, z0: -1246, z1: -1234 }]) {
      if (x + cr * 0.7 > rd.x0 && x - cr * 0.7 < rd.x1 && z + cr * 0.7 > rd.z0 && z - cr * 0.7 < rd.z1) clash = true;
    }
    if (clash) continue;
    houses.push({ type: f.type, x, z, ry, cr, y: heightAt(x, z), w, d });
    const bx = -Math.sin(ry), bz = -Math.cos(ry);
    if (r() < 0.6) trees.push([x + bx * (d / 2 + 9 + r() * 8) + (r() - 0.5) * 8, z + bz * (d / 2 + 9 + r() * 8) + (r() - 0.5) * 8, r() < 0.15 ? 1 : 0, 9 + r() * 6]);
  }
  for (let k = 0; k < 9; k++) trees.push([green.x0 + 8 + r() * (green.x1 - green.x0 - 16), (r() < 0.5 ? green.z0 + 5 : green.z1 - 5), 0, 14 + r() * 5]);
  for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2; trees.push([church.x + Math.cos(a) * 30, church.z + Math.sin(a) * 30, 1, 9 + r() * 4]); }
  return { houses, trees, green, church };
}

function buildChurch(M, c, y0) {
  const STONE = col('#b9b1a0'), ROOF = col('#5a5e66');
  const L = 26, Wd = 10, e = 9;
  M.box(c.x + 2, y0 + e / 2, c.z, L, e, Wd, STONE);
  gableAt(M, c.x + 2, y0, c.z, L, Wd, e, 5.2, 0.4, STONE, ROOF);
  M.box(c.x + 14, y0 + 3.5, c.z, 7, 7, 8, STONE);
  const tx = c.x - 14;
  M.box(tx, y0 + 11, c.z, 7, 22, 7, STONE);
  for (const [ox, oz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) M.box(tx + ox, y0 + 22.8, c.z + oz, 0.8, 1.6, 0.8, STONE);
  M.geo(new THREE.ConeGeometry(3.6, 17, 8), mat(tx, y0 + 30.5, c.z, 0, Math.PI / 8), col('#6b7078'));
  M.geo(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 4), mat(tx, y0 + 40, c.z), col('#d9b13a'));
  for (const z of [-1, 1]) for (let k = 0; k < 4; k++) M.box(c.x - 6 + k * 6, y0 + 4.5, c.z + z * (Wd / 2 + 0.05), 1.3, 4.2, 0.1, col('#3a3f52'));
  M.box(tx, y0 + 15, c.z + 3.56, 1.6, 1.6, 0.1, col('#e8e2d0'));
  return [{ min: [c.x - 18, y0, c.z - Wd / 2], max: [c.x + 18, y0 + e + 5.2, c.z + Wd / 2], kind: 'house' }, { min: [tx - 3.6, y0, c.z - 3.6], max: [tx + 3.6, y0 + 41, c.z + 3.6], kind: 'house' }];
}

// Krayzee Castle: curtain wall, drum towers with purple spires, palace block, great tower with a gold crown.
const CASTLE_SCALE = 1.4;
function buildCastle(B0, atlas) {
  const B = { matte: new Builder(), metal: new Builder(), flags: [] };
  const M = B.matte, T = B.metal;
  const STONE = col('#d6c59b'), STONE2 = col('#c4b186'), DARK = col('#2a2622'), SLATE = col('#4a2f6e'), GOLD = col('#e2ac2c'), ROOF = col('#545a66');
  const cx = CASTLE.x, cz = CASTLE.z, y0 = CASTLE.top;
  const W = 130, D = 100, H = 11, th = 3;
  M.box(cx, y0 - 7, cz, W + 16, 14.5, D + 16, col('#b7a882'));
  M.box(cx, y0 + 0.3, cz, W, 0.6, D, col('#b9b39e'));
  const wall = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    M.box((x0 + x1) / 2, y0 + H / 2, (z0 + z1) / 2, L, H, th, STONE, ry);
    M.box((x0 + x1) / 2, y0 + 1, (z0 + z1) / 2, L + 0.6, 2, th + 0.8, STONE2, ry);
    const n = Math.floor(L / 2.6);
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * L / n - L / 2;
      M.box((x0 + x1) / 2 + dx * s, y0 + H + 0.7, (z0 + z1) / 2 + dz * s, 1.3, 1.4, th + 0.2, STONE, ry);
    }
  };
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  wall(x0, z0, x1, z0); wall(x1, z0, x1, z1); wall(x0, z0, x0, z1);
  wall(x0, z1, cx - 9, z1); wall(cx + 9, z1, x1, z1);
  const drum = (x, z, r, h, spire, sides = 12) => {
    M.geo(new THREE.CylinderGeometry(r, r * 1.08, h, sides), mat(x, y0 + h / 2, z), STONE);
    M.geo(new THREE.CylinderGeometry(r + 0.6, r + 0.6, 1.4, sides), mat(x, y0 + h + 0.2, z), STONE2);
    M.geo(new THREE.ConeGeometry(r + 0.9, spire, sides), mat(x, y0 + h + 0.9 + spire / 2, z), SLATE);
    T.geo(new THREE.SphereGeometry(0.7, 8, 6), mat(x, y0 + h + 1 + spire, z), GOLD);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.4;
      M.box(x + Math.cos(a) * (r + 0.02), y0 + h * 0.62, z + Math.sin(a) * (r + 0.02), 0.5, 1.8, 0.5, DARK, -a);
    }
  };
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) drum(x, z, 7, 19, 11);
  drum(cx - 9, z1 + 1, 5, 16, 8, 10); drum(cx + 9, z1 + 1, 5, 16, 8, 10);
  M.box(cx, y0 + 10.5, z1 + 1, 13, 5, 7, STONE);
  M.box(cx, y0 + 3.6, z1 + 4.55, 6, 7.2, 0.1, DARK);
  for (let k = -2; k <= 2; k++) T.box(cx + k * 1.1, y0 + 4.2, z1 + 4.62, 0.12, 6, 0.08, GOLD);
  // palace block on the north side of the courtyard
  const pz = z0 + 22, pw = 64, pd = 24, ph = 17;
  M.box(cx, y0 + ph / 2, pz, pw, ph, pd, STONE);
  gableAt(M, cx, y0, pz, pw, pd, ph, 7, 0.6, STONE, ROOF);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 12; k++) {
    const x = cx - pw / 2 + 4 + k * (pw - 8) / 11;
    M.box(x, y0 + 3.2 + row * 4.8, pz + pd / 2 + 0.06, 1.5, 2.6, 0.1, col('#2c3140'));
  }
  for (let k = 0; k < 5; k++) M.box(cx - 24 + k * 12, y0 + ph + 2.2, pz + pd / 2 - 1.2, 2.2, 2.6, 2.2, STONE);
  M.box(cx, y0 + 3, pz + pd / 2 + 2, 10, 6, 4, STONE2);
  T.box(cx, y0 + 6.2, pz + pd / 2 + 4.05, 10.4, 0.4, 0.2, GOLD);
  for (const sx of [-1, 1]) drum(cx + sx * (pw / 2), pz + pd / 2, 3.2, 25, 9, 8);
  // great tower
  const gx = cx, gz = pz - 2;
  M.geo(new THREE.CylinderGeometry(8.5, 9.5, 44, 8), mat(gx, y0 + 22, gz, 0, Math.PI / 8), STONE);
  M.geo(new THREE.CylinderGeometry(10, 10, 2, 8), mat(gx, y0 + 44.5, gz, 0, Math.PI / 8), STONE2);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8;
    M.box(gx + Math.cos(a) * 9.6, y0 + 46.2, gz + Math.sin(a) * 9.6, 2.2, 1.8, 1.2, STONE, -a + Math.PI / 2);
    for (let row = 0; row < 3; row++) M.box(gx + Math.cos(a) * 8.75, y0 + 14 + row * 10, gz + Math.sin(a) * 8.75, 1.2, 3.2, 0.3, DARK, -a + Math.PI / 2);
  }
  M.geo(new THREE.ConeGeometry(8.8, 24, 8), mat(gx, y0 + 45.5 + 12, gz, 0, Math.PI / 8), SLATE);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8;
    T.beam([gx + Math.cos(a) * 8.8, y0 + 45.6, gz + Math.sin(a) * 8.8], [gx, y0 + 69.4, gz], 0.25, GOLD);
  }
  buildCrown(T, M, gx, y0 + 69.5, gz, 3.2);
  T.geo(new THREE.CylinderGeometry(0.15, 0.2, 10, 6), mat(gx, y0 + 81, gz), col('#e8e8e8'));
  B.flags.push({ x: gx + 0.1, y: y0 + 85.5, z: gz, w: 9, h: 6, rect: atlas.uv.flag, phase: 0.7 });
  for (const [x, z] of [[x0, z0], [x1, z0]]) {
    T.geo(new THREE.CylinderGeometry(0.1, 0.12, 6, 5), mat(x, y0 + 34, z), col('#e8e8e8'));
    B.flags.push({ x: x + 0.1, y: y0 + 36.6, z, w: 4.8, h: 3.2, rect: atlas.uv.flag2, phase: x > cx ? 1.3 : 2.1 });
  }
  const k = CASTLE_SCALE;
  const S = (x, y, z) => [cx + (x - cx) * k, y0 + (y - y0) * k, cz + (z - cz) * k];
  const m4 = new THREE.Matrix4().makeTranslation(cx, y0, cz).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-cx, -y0, -cz));
  B0.matte.geo(M.build(), m4, [1, 1, 1]);
  B0.metal.geo(T.build(), m4, [1, 1, 1]);
  for (const f of B.flags) { const [x, y, z] = S(f.x, f.y, f.z); B0.flags.push({ ...f, x, y, z, w: f.w * k, h: f.h * k }); }
  const box = (a, b) => { const p = S(...a), q = S(...b); return { min: p, max: q, kind: 'castle' }; };
  return [
    box([x0 - 8, y0 - 14, z0 - 8], [x1 + 8, y0 + H + 2, z1 + 8]),
    box([cx - pw / 2, y0, pz - pd / 2], [cx + pw / 2, y0 + ph + 7, pz + pd / 2]),
    box([gx - 10, y0, gz - 10], [gx + 10, y0 + 86, gz + 10]),
  ];
}

// Ribbon draped over the terrain.
function drape(b, pts, width, heightAt, lift, color, shade) {
  const h = width / 2;
  const base = b.count;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], a = pts[Math.max(0, k - 1)], c = pts[Math.min(pts.length - 1, k + 1)];
    let dx = c[0] - a[0], dz = c[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const rx = -dz * h, rz = dx * h;
    const cl = shade ? shade(p[0], p[1]) : color;
    b.v(p[0] + rx, heightAt(p[0] + rx, p[1] + rz) + lift, p[1] + rz, 0, 1, 0, cl);
    b.v(p[0] - rx, heightAt(p[0] - rx, p[1] - rz) + lift, p[1] - rz, 0, 1, 0, cl);
  }
  for (let k = 0; k < pts.length - 1; k++) {
    const i = base + k * 2;
    b.i.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  }
}
function dashes(pts, on, off) {
  const out = [];
  let acc = 0, cur = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 1.5) {
      const t = s / L, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const ph = (acc + s) % (on + off);
      if (ph < on) cur.push([x, z]); else if (cur.length > 1) { out.push(cur); cur = []; } else cur = [];
    }
    acc += L;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export function buildTown(B, atlas, quality, heightAt) {
  const r = rng(77);
  const colliders = [];
  const objects = [];
  const village = layoutVillage(r, heightAt);
  const byType = {};
  for (const h of village.houses) (byType[h.type] ||= []).push(h);
  const farmHouses = [];
  for (const f of FARMS) {
    const c = Math.cos(f.ry), s = Math.sin(f.ry);
    const place = (lx, lz, type, dry = 0) => {
      const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
      farmHouses.push({ type, x, z, ry: f.ry + dry, y: heightAt(x, z), w: { cottage: 8.6, manor: 13, barn: 22 }[type], d: { cottage: 6.8, manor: 10, barn: 11 }[type] });
    };
    place(0, 0, r() < 0.5 ? 'manor' : 'cottage');
    place(26, -14, 'barn', Math.PI / 2);
    place(-4, -30, 'barn');
    if (r() < 0.6) place(30, 18, 'barn');
  }
  for (const h of farmHouses) (byType[h.type] ||= []).push(h);

  const mtl = houseMaterial();
  const boxes = [];
  for (const [type, list] of Object.entries(byType)) {
    const { geo, dims } = archetypeGeometry(type);
    const n = list.length;
    const im = new THREE.InstancedMesh(geo, mtl, n);
    const iWall = new Float32Array(n * 3), iRoof = new Float32Array(n * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c3 = new THREE.Color();
    list.forEach((h, i) => {
      const sx = 0.9 + r() * 0.25, sy = 0.95 + r() * 0.12;
      q.setFromAxisAngle(up, h.ry);
      m4.compose(new THREE.Vector3(h.x, h.y - 0.2, h.z), q, new THREE.Vector3(sx, sy, 1));
      im.setMatrixAt(i, m4);
      const wl = type === 'barn' ? (r() < 0.5 ? '#5a4234' : '#7c3a2c') : WALLS[(r() * WALLS.length) | 0];
      const rf = type === 'barn' ? (r() < 0.5 ? '#6e7276' : '#8b4632') : ROOFS[(r() * ROOFS.length) | 0];
      c3.set(wl).toArray(iWall, i * 3);
      c3.set(rf).toArray(iRoof, i * 3);
      const ex = Math.abs(Math.cos(h.ry)) > 0.5 ? dims.w * sx : dims.d, ez = Math.abs(Math.cos(h.ry)) > 0.5 ? dims.d : dims.w * sx;
      const box = { min: [h.x - ex / 2, h.y, h.z - ez / 2], max: [h.x + ex / 2, h.y + dims.h * sy, h.z + ez / 2], kind: 'house' };
      colliders.push(box); boxes.push(box);
    });
    geo.setAttribute('iWall', new THREE.InstancedBufferAttribute(iWall, 3));
    geo.setAttribute('iRoof', new THREE.InstancedBufferAttribute(iRoof, 3));
    im.castShadow = quality !== 'low'; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'houses-' + type;
    objects.push(im);
  }
  colliders.push(...buildChurch(B.matte, village.church, 0));
  boxes.push(...colliders.slice(-2));
  const castle = buildCastle(B, atlas);
  colliders.push(...castle);

  // lanes, tracks and their markings
  const L = new Builder();
  const asphalt = (x, z) => col('#5d5d5a', 0.85 + 0.15 * ((Math.sin(x * 0.05) * Math.cos(z * 0.043) + 1) / 2));
  const tracks = [];
  for (const f of FARMS) tracks.push({ w: 3.4, pts: bez([[f.x, f.z], [(f.x + f.to[0]) / 2 + 40, (f.z + f.to[1]) / 2 - 30], f.to], 8) });
  for (const ln of LANES) {
    drape(L, ln.pts, ln.w, heightAt, 0.3, null, asphalt);
    if (ln.kind === 'road') for (const d of dashes(ln.pts, 4, 8)) drape(L, d, 0.15, heightAt, 0.34, col('#e8e6df'));
  }
  for (const t of tracks) drape(L, t.pts, t.w, heightAt, 0.28, null, (x, z) => col('#8a7a5c', 0.85 + 0.2 * ((Math.sin(x * 0.11 + z * 0.07) + 1) / 2)));
  const lanes = new THREE.Mesh(L.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  lanes.receiveShadow = true;
  lanes.renderOrder = -8;
  lanes.name = 'lanes';
  objects.push(lanes);

  const treeSpots = [...village.trees];
  for (const ln of LANES) {
    if (ln.kind !== 'road') continue;
    for (let k = 0; k < ln.pts.length - 1; k += 2) {
      if (r() > 0.22) continue;
      const [x0, z0] = ln.pts[k], [x1, z1] = ln.pts[k + 1];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, side = r() < 0.5 ? -1 : 1;
      treeSpots.push([x0 - (z1 - z0) / l * side * (ln.w / 2 + 6), z0 + (x1 - x0) / l * side * (ln.w / 2 + 6), r() < 0.2 ? 2 : 0, 13 + r() * 7]);
    }
  }
  for (const f of FARMS) for (let k = 0; k < 6; k++) treeSpots.push([f.x + (r() - 0.5) * 90, f.z + (r() - 0.5) * 90, r() < 0.3 ? 2 : 0, 12 + r() * 8]);

  return {
    objects, colliders, boxes: [...boxes, ...castle], treeSpots,
    paths: [...LANES, ...tracks],
    houses: [...village.houses, ...farmHouses],
    green: village.green,
  };
}
