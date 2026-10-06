// Procedural Jon: skeleton + merged skinned meshes (one per material). Built in root space,
// feet at y=0, facing +Z, Jon's left = +X. Rigid parts are weight-1 to a bone.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { EYE, surfZ, headMesh } from './jon_head.js';
export { surfZ };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Face layout (shared with jon_face.js). Head is one shaped ellipsoid; surfZ() raycasts it.
export const FACE = { headC: [0, 1.635, 0.025], headR: [0.114, 0.162, 0.128], eyeR: 0.043, mouthY: 1.53, mouthW: 0.056 };
function headShape(p) {
  if (p.y < 0.1) {
    const d = Math.min(1, (0.1 - p.y) / 1.1);
    if (p.z > 0) p.z *= 1 + 0.4 * Math.min(1, d * 2.2) * (1 - 0.25 * d);
    p.x *= 1 - 0.3 * d * d;
  }
  if (p.y < -0.65) p.y = -0.65 + (p.y + 0.65) * 0.7;
  if (p.y < 0) p.y *= 1.17;
  if (p.z < 0) p.z *= 1.07;
}
FACE.eye = EYE.slice();
FACE.brow = [0.054, 1.738, surfZ(0.054, 1.738) + 0.003];
const E = FACE.eye, BR = FACE.brow;

// name, parent, bind position (root space)
export const BONE_DEFS = [
  ['hips', null, [0, 0.98, 0]],
  ['spine', 'hips', [0, 1.09, 0]],
  ['chest', 'spine', [0, 1.25, 0]],
  ['neck', 'chest', [0, 1.435, 0]],
  ['head', 'neck', [0, 1.52, 0.015]],
  ['jaw', 'head', [0, 1.575, 0.03]],
  ['eyeL', 'head', [E[0], E[1], E[2]]], ['eyeR', 'head', [-E[0], E[1], E[2]]],
  ['lidUL', 'head', [E[0], E[1], E[2]]], ['lidUR', 'head', [-E[0], E[1], E[2]]],
  ['lidLL', 'head', [E[0], E[1], E[2]]], ['lidLR', 'head', [-E[0], E[1], E[2]]],
  ['browL', 'head', [BR[0], BR[1], BR[2]]], ['browR', 'head', [-BR[0], BR[1], BR[2]]],
];
for (const [s, k] of [['L', 1], ['R', -1]]) {
  BONE_DEFS.push(
    ['clav' + s, 'chest', [0.035 * k, 1.40, 0]],
    ['uarm' + s, 'clav' + s, [0.19 * k, 1.385, -0.01]],
    ['farm' + s, 'uarm' + s, [0.19 * k, 1.09, -0.01]],
    ['hand' + s, 'farm' + s, [0.19 * k, 0.825, -0.01]],
    ['fing' + s, 'hand' + s, [0.19 * k, 0.738, 0.0]],
    ['fing2' + s, 'fing' + s, [0.19 * k, 0.698, 0.0]],
    ['thumb' + s, 'hand' + s, [0.182 * k, 0.80, 0.03]],
    ['thigh' + s, 'hips', [0.092 * k, 0.93, 0]],
    ['shin' + s, 'thigh' + s, [0.092 * k, 0.505, 0.0]],
    ['foot' + s, 'shin' + s, [0.092 * k, 0.088, -0.005]],
    ['toe' + s, 'foot' + s, [0.092 * k, 0.03, 0.115]],
  );
}

export const COLORS = {
  skin: 0xf2c2a0, blush: 0xf08a7a, skinShade: 0xe8a888, lip: 0xc9776a,
  shirt: 0xa6c8e6, shirtDark: 0x8fb3d4, collar: 0xc4def3, button: 0xf4f1e8,
  pants: 0x7d5634, pantsDark: 0x5f3c25, belt: 0x3d2716, buckle: 0xd8b25a,
  shoe: 0x5a3520, sole: 0x2e1d12, hair: 0x6a4127, hairDark: 0x4f2f1c, brow: 0x3e2414,
  white: 0xfbf8f2, iris: 0x5a3a22, pupil: 0x140c08, mouth: 0x5a1a1c, tongue: 0xd0605e, teeth: 0xfffdf6,
};

// ---------- geometry helpers ----------
const _c = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
function finish(geo, color, skin) {
  if (geo.index === null) geo = geo; // all builders produce indexed
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    _c.set(typeof color === 'function' ? color(p) : color);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    let w = typeof skin === 'function' ? skin(p) : [[skin, 1]];
    w = w.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = w.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = w[k] ? BONE_INDEX[w[k][0]] : 0;
      sw[i * 4 + k] = w[k] ? w[k][1] / tot : 0;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}

export const BONE_INDEX = {};
BONE_DEFS.forEach((d, i) => { BONE_INDEX[d[0]] = i; });

// piecewise-linear bone blend along an axis value (default y)
function blend(stops, axis = 'y') {
  return (p) => {
    const v = p[axis];
    if (v <= stops[0][0]) return [[stops[0][1], 1]];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ba] = stops[i], [b, bb] = stops[i + 1];
      if (v <= b) {
        let t = (v - a) / (b - a); t = t * t * (3 - 2 * t);
        return ba === bb ? [[ba, 1]] : [[ba, 1 - t], [bb, t]];
      }
    }
    return [[stops[stops.length - 1][1], 1]];
  };
}

function ellipsoid(c, r, seg, opt = {}) {
  const g = new THREE.SphereGeometry(1, seg, opt.h ?? Math.max(6, Math.round(seg * 0.7)),
    opt.phiStart ?? 0, opt.phiLength ?? Math.PI * 2, opt.thetaStart ?? 0, opt.thetaLength ?? Math.PI);
  const pos = g.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (opt.shape) opt.shape(p);
    p.multiply(V(r[0], r[1], r[2]));
    if (opt.rot) p.applyEuler(opt.rot);
    p.add(V(c[0], c[1], c[2]));
    if (opt.disp) opt.disp(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

// Tube through sections [{p:[x,y,z], r:[ra,rb]}], rounded caps, superellipse cross-section.
function loft(secs, { seg = 16, cap0 = 0, cap1 = 0, side = [1, 0, 0], exp = 2, capLen = 1 } = {}) {
  const P = secs.map(s => V(...s.p)), R = secs.map(s => s.r), n = P.length;
  const T = P.map((p, i) => P[Math.min(i + 1, n - 1)].clone().sub(P[Math.max(i - 1, 0)]).normalize());
  const sideV = V(...side);
  const frames = T.map(t => {
    let s = sideV.clone().sub(t.clone().multiplyScalar(sideV.dot(t)));
    if (s.lengthSq() < 1e-6) s = V(0, 0, 1).sub(t.clone().multiplyScalar(t.z));
    s.normalize();
    return [s, t.clone().cross(s)];
  });
  const rings = [];
  const ring = (p, s, b, ra, rb) => {
    const out = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / exp), sy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / exp);
      out.push(p.clone().addScaledVector(s, ra * cx).addScaledVector(b, rb * sy));
    }
    return out;
  };
  const capRings = (i, dir, K) => {
    const res = [];
    const len = Math.min(R[i][0], R[i][1]) * capLen;
    for (let k = 1; k < K; k++) {
      const ang = (k / K) * Math.PI / 2;
      res.push(ring(P[i].clone().addScaledVector(T[i], dir * len * Math.sin(ang)), frames[i][0], frames[i][1],
        R[i][0] * Math.cos(ang), R[i][1] * Math.cos(ang)));
    }
    return { rings: res, tip: P[i].clone().addScaledVector(T[i], dir * len) };
  };
  let tip0 = null, tip1 = null;
  if (cap0) { const c = capRings(0, -1, cap0); rings.push(...c.rings.reverse()); tip0 = c.tip; }
  for (let i = 0; i < n; i++) rings.push(ring(P[i], frames[i][0], frames[i][1], R[i][0], R[i][1]));
  if (cap1) { const c = capRings(n - 1, 1, cap1); rings.push(...c.rings); tip1 = c.tip; }
  const verts = [], idx = [];
  rings.forEach(r => r.forEach(v => verts.push(v.x, v.y, v.z)));
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
    idx.push(a, b, c, b, d, c);
  }
  if (tip0) {
    const t = verts.length / 3; verts.push(tip0.x, tip0.y, tip0.z);
    for (let j = 0; j < seg; j++) idx.push(t, (j + 1) % seg, j);
  }
  if (tip1) {
    const t = verts.length / 3, base = (rings.length - 1) * seg; verts.push(tip1.x, tip1.y, tip1.z);
    for (let j = 0; j < seg; j++) idx.push(base + j, base + (j + 1) % seg, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// simple value noise for lumpy hair
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  return r;
}

// ---------- mouth (morph targets) ----------
// u in [-1,1] across, v in [0,1] bottom->top. Params -> 2D (x,y) relative to mouth centre.
export const MOUTH_TARGETS = ['open', 'smile', 'frown', 'wide', 'o', 'grit'];
function mouthShape(u, v, m) {
  const w = FACE.mouthW * (1 + 0.28 * m.wide - 0.42 * m.o + 0.12 * m.smile + 0.12 * m.grit);
  const curve = (0.022 * m.smile - 0.02 * m.frown) * (1 - 0.4 * m.o);
  const k = 1 - u * u;
  const env = Math.pow(Math.max(k, 0), m.o > 0.01 ? 0.7 - 0.35 * m.o : 0.7);
  const c = curve * u * u - curve * 0.35;
  const top = c + (0.0025 + 0.016 * m.open + 0.008 * m.wide + 0.016 * m.o + 0.006 * m.grit) * env;
  const bot = c - (0.0035 + 0.008 * m.smile * (1 - m.frown) + 0.036 * m.open + 0.014 * m.wide + 0.022 * m.o + 0.008 * m.grit) * env;
  return [u * w, bot + (top - bot) * v];
}

function mouthGeometry(seg) {
  const cols = seg, rowsV = [0, 0.18, 0.3, 0.3, 0.5, 0.7, 0.72, 0.72, 0.86, 1];
  const colorOf = (ri) => ri < 3 ? COLORS.tongue : ri < 7 ? COLORS.mouth : COLORS.teeth;
  const project = (x, y) => [x, FACE.mouthY + y, surfZ(x, FACE.mouthY + y) + 0.0025];
  const base = { open: 0, smile: 0, frown: 0, wide: 0, o: 0, grit: 0 };
  const build = (m) => {
    const out = [];
    rowsV.forEach(v => {
      for (let i = 0; i <= cols; i++) {
        const u = -1 + 2 * i / cols, [x, y] = mouthShape(u, v, m);
        out.push(...project(x, y));
      }
    });
    return out;
  };
  const pos = build(base), idx = [], col = [];
  rowsV.forEach((v, ri) => { _c.set(colorOf(ri)); for (let i = 0; i <= cols; i++) col.push(_c.r, _c.g, _c.b); });
  for (let r = 0; r < rowsV.length - 1; r++) {
    if (rowsV[r] === rowsV[r + 1]) continue;
    for (let i = 0; i < cols; i++) {
      const a = r * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.morphTargetsRelative = true;
  g.morphAttributes.position = MOUTH_TARGETS.map(name => {
    const p2 = build({ ...base, [name]: 1 });
    return new THREE.Float32BufferAttribute(p2.map((v, i) => v - pos[i]), 3);
  });
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.2, 1);
  const si = new Uint16Array(g.attributes.position.count * 4), sw = new Float32Array(si.length);
  rowsV.forEach((v, ri) => {
    for (let i = 0; i <= cols; i++) {
      const k = (ri * (cols + 1) + i) * 4, wj = v < 0.5 ? 0.6 * (1 - v * 2) : 0;
      si[k] = BONE_INDEX.head; sw[k] = 1 - wj; si[k + 1] = BONE_INDEX.jaw; sw[k + 1] = wj;
    }
  });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

// ---------- body ----------
export function buildJon(quality = 'high') {
  const Q = { high: 1, medium: 0.7, low: 0.5 }[quality] ?? 1;
  const S = (n) => Math.max(6, Math.round(n * Q));
  const parts = { skin: [], cloth: [], shoe: [], hair: [], eye: [] };
  const add = (mat, geo, color, skin) => parts[mat].push(finish(geo, color, skin));

  // --- torso / shirt ---
  const torsoSecs = [
    [1.02, 0.118, 0.088, 0.01], [1.05, 0.13, 0.098, 0.012], [1.09, 0.15, 0.112, 0.014], [1.15, 0.154, 0.112, 0.012],
    [1.25, 0.17, 0.11, 0.008], [1.33, 0.198, 0.106, 0.0], [1.38, 0.21, 0.098, -0.006], [1.415, 0.19, 0.088, -0.008],
    [1.445, 0.10, 0.068, -0.006], [1.46, 0.062, 0.056, 0.0],
  ].map(([y, rx, rz, z]) => ({ p: [0, y, z], r: [rx, rz] }));
  const torsoSkin = blend([[1.06, 'hips'], [1.15, 'spine'], [1.22, 'spine'], [1.30, 'chest']]);
  add('cloth', loft(torsoSecs, { seg: S(20), cap0: 0, cap1: 0, side: [1, 0, 0], exp: 2.3 }), (p) => {
    // subtle placket stripe down the front
    return (Math.abs(p.x) < 0.012 && p.z > 0.05 && p.y < 1.43) ? COLORS.shirtDark : COLORS.shirt;
  }, torsoSkin);
  add('cloth', collarGeo(S(28)), COLORS.collar, blend([[1.45, 'chest'], [1.5, 'neck']]));
  // buttons
  for (const y of [1.36, 1.26, 1.16]) {
    const zf = y > 1.3 ? 0.108 : y > 1.2 ? 0.118 : 0.12;
    add('cloth', ellipsoid([0, y, zf], [0.009, 0.009, 0.004], 8), COLORS.button, torsoSkin);
  }
  // breast pocket (Jon's left)
  add('cloth', ellipsoid([0.075, 1.29, 0.104], [0.036, 0.034, 0.008], S(10), {
    shape: (p) => { p.x = Math.sign(p.x) * Math.pow(Math.abs(p.x), 0.6); p.y = Math.sign(p.y) * Math.pow(Math.abs(p.y), 0.6); },
    rot: new THREE.Euler(-0.1, 0.25, 0),
  }), COLORS.shirtDark, 'chest');

  // --- sleeves + hands ---
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    const x = 0.19 * k, z = -0.01;
    const sl = [[1.385, 0.056], [1.32, 0.057], [1.2, 0.054], [1.1, 0.051], [1.06, 0.05]]
      .map(([y, r]) => ({ p: [x, y, z], r: [r, r * 0.95] }));
    add('cloth', loft(sl, { seg: S(16), cap0: 5, cap1: 0, capLen: 1.0 }), COLORS.shirt,
      blend([[1.04, 'farm' + s], [1.14, 'uarm' + s]]));
    // rolled cuff just below the elbow
    add('cloth', loft([{ p: [x, 1.075, z], r: [0.054, 0.052] }, { p: [x, 1.05, z], r: [0.06, 0.058] }, { p: [x, 1.022, z], r: [0.056, 0.054] }],
      { seg: S(16), cap1: 2, capLen: 0.35 }), (p) => (p.y > 1.06 ? COLORS.shirt : COLORS.shirtDark), 'farm' + s);
    // bare forearm + wrist
    add('skin', loft([{ p: [x, 1.07, z], r: [0.036, 0.038] }, { p: [x, 0.96, z], r: [0.033, 0.035] }, { p: [x, 0.86, z], r: [0.027, 0.031] }, { p: [x, 0.8, z], r: [0.03, 0.036] }],
      { seg: S(12) }), COLORS.skin, blend([[0.835, 'hand' + s], [0.87, 'farm' + s]]));
    // palm: palm faces inward (-k X), fingers down
    add('skin', ellipsoid([0.19 * k, 0.782, 0.0], [0.034, 0.058, 0.056], S(12), {
      shape: (p) => { p.z = Math.sign(p.z) * Math.pow(Math.abs(p.z), 0.75); p.y = Math.sign(p.y) * Math.pow(Math.abs(p.y), 0.8); },
    }), COLORS.skin, 'hand' + s);
    // four fingers (mitten bones), each two segments
    for (let f = 0; f < 4; f++) {
      const fz = 0.036 - f * 0.024, fx = 0.19 * k + k * 0.002;
      const len1 = [0.042, 0.046, 0.044, 0.036][f], len2 = len1 * 0.85, r = 0.0148 - f * 0.0008;
      add('skin', loft([{ p: [fx, 0.75, fz], r: [r, r] }, { p: [fx, 0.75 - len1, fz], r: [r * 0.98, r] }],
        { seg: S(7), cap0: 1, cap1: 1 }), COLORS.skin, 'fing' + s);
      add('skin', loft([{ p: [fx, 0.75 - len1 + 0.004, fz], r: [r * 0.96, r * 0.96] }, { p: [fx, 0.75 - len1 - len2, fz], r: [r * 0.9, r * 0.92] }],
        { seg: S(7), cap0: 1, cap1: 3 }), COLORS.skin, 'fing2' + s);
    }
    add('skin', loft([{ p: [0.182 * k, 0.80, 0.03], r: [0.015, 0.015] }, { p: [0.17 * k, 0.765, 0.06], r: [0.014, 0.014] },
      { p: [0.165 * k, 0.738, 0.072], r: [0.013, 0.013] }], { seg: S(8), cap0: 2, cap1: 3 }), COLORS.skin, 'thumb' + s);

    // --- trouser leg ---
    const lx = 0.092 * k;
    const leg = [[1.055, 0.084, 0.108, 0.068], [0.98, 0.09, 0.112, 0.078], [0.9, 0.086, 0.1, 0.088], [0.8, 0.077, 0.084, 0.092], [0.7, 0.068, 0.07, 0.092],
      [0.55, 0.058, 0.06, 0.092], [0.5, 0.056, 0.058, 0.092], [0.4, 0.054, 0.056, 0.092], [0.25, 0.055, 0.057, 0.092], [0.14, 0.06, 0.062, 0.092], [0.115, 0.064, 0.066, 0.092]]
      .map(([y, rx, rz, x]) => ({ p: [x * k, y, 0.004], r: [rx, rz] }));
    add('cloth', loft(leg, { seg: S(17), cap0: 2, capLen: 0.3 }), COLORS.pants,
      blend([[0.45, 'shin' + s], [0.58, 'thigh' + s], [0.86, 'thigh' + s], [0.97, 'hips']]));
    // ankle/sock
    add('skin', loft([{ p: [lx, 0.17, 0], r: [0.033, 0.035] }, { p: [lx, 0.07, -0.005], r: [0.034, 0.036] }], { seg: S(10) }),
      0xe9e4da, blend([[0.1, 'foot' + s], [0.14, 'shin' + s]]));
    // shoe: rounded clown-ish loafer
    const shoe = ellipsoid([lx, 0.058, 0.055], [0.058, 0.06, 0.13], S(15), {
      shape: (p) => { if (p.y < -0.3) p.y = -0.3 - (p.y + 0.3) * 0.25; if (p.z > 0) p.x *= 1 + 0.15 * p.z; },
    });
    add('shoe', shoe, (p) => p.y < 0.025 ? COLORS.sole : COLORS.shoe,
      (p) => p.z > 0.1 ? [['toe' + s, 1]] : p.z > 0.06 ? [['toe' + s, (p.z - 0.06) / 0.04], ['foot' + s, 1 - (p.z - 0.06) / 0.04]] : [['foot' + s, 1]]);
  }

  // --- pelvis / belt ---
  add('cloth', loft([[1.065, 0.142, 0.108], [1.025, 0.144, 0.106], [1.0, 0.12, 0.08]]
    .map(([y, rx, rz]) => ({ p: [0, y, 0.004], r: [rx, rz] })), { seg: S(20), cap1: 3, capLen: 0.25, exp: 2.2 }),
    COLORS.pants, (p) => (p.y < 0.86 ? blend([[0.75, 'hips']])(p) : [['hips', 1]]));
  for (const k of [1, -1]) {
    add('cloth', ellipsoid([k * 0.056, 0.905, -0.045], [0.07, 0.08, 0.06], S(14)), COLORS.pants,
      () => [['hips', 0.55], ['thigh' + (k > 0 ? 'L' : 'R'), 0.45]]);
  }
  add('cloth', loft([{ p: [0, 1.064, 0.004], r: [0.168, 0.127] }, { p: [0, 1.03, 0.004], r: [0.171, 0.129] }],
    { seg: S(20), exp: 2.2 }), COLORS.belt, 'hips');
  add('cloth', ellipsoid([0, 1.047, 0.133], [0.022, 0.016, 0.006], 8), COLORS.buckle, 'hips');

  // --- neck + head ---
  add('skin', loft([{ p: [0, 1.40, -0.005], r: [0.047, 0.045] }, { p: [0, 1.5, 0.01], r: [0.044, 0.044] }, { p: [0, 1.59, 0.02], r: [0.05, 0.05] }],
    { seg: S(12) }), COLORS.skin, blend([[1.44, 'chest'], [1.48, 'neck'], [1.55, 'head']]));
  const ss = THREE.MathUtils.smoothstep;
  const hm = headMesh(quality);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hm.pos.slice(), 3));
  hg.setIndex(new THREE.BufferAttribute(hm.idx.slice(), 1));
  hg.computeVertexNormals();
  add('skin', hg, (p) => {
    if (Math.abs(p.x) > 0.112 && Math.abs(p.y - 1.632) < 0.03 && p.z > -0.02 && p.z < 0.03) return COLORS.skinShade;
    const d = Math.min(V(p.x - 0.07, p.y - 1.598, 0).length(), V(p.x + 0.07, p.y - 1.598, 0).length());
    return p.z > 0.05 && d < 0.042 ? _c2.set(COLORS.skin).lerp(_c3.set(COLORS.blush), 0.5 * (1 - d / 0.042) ** 1.5).getHex() : COLORS.skin;
  }, (p) => {
    const w = (1 - ss(p.y, 1.488, 1.535)) * ss(p.z, -0.03, 0.07);
    return [['head', 1 - w], ['jaw', w]];
  });
  // eyes (ball w/ painted iris+pupil), lids as shells around the eye centre
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    const c = [k * E[0], E[1], E[2]];
    const er = FACE.eyeR, toZ = new THREE.Euler(Math.PI / 2, 0, 0);
    add('eye', ellipsoid(c, [er, er, er], S(16), { rot: toZ }), COLORS.white, 'eye' + s);
    add('eye', ellipsoid(c, [er * 1.006, er * 1.006, er * 1.006], S(14), { rot: toZ, thetaLength: 0.36, h: 3 }), COLORS.iris, 'eye' + s);
    add('eye', ellipsoid(c, [er * 1.012, er * 1.012, er * 1.012], S(12), { rot: toZ, thetaLength: 0.2, h: 2 }), COLORS.pupil, 'eye' + s);
    add('eye', ellipsoid(c, [er * 1.018, er * 1.018, er * 1.018], 8, { rot: new THREE.Euler(Math.PI / 2 - 0.16, 0, 0.12 * k), thetaLength: 0.06, h: 1 }), 0xffffff, 'eye' + s);
    const lr = FACE.eyeR * 1.05;
    add('skin', ellipsoid(c, [lr, lr, lr], S(16), { thetaStart: 0, thetaLength: Math.PI * 0.56, h: 7 }), COLORS.skin, 'lidU' + s);
    // lash line along the upper lid edge
    add('hair', ellipsoid(c, [lr * 1.012, lr * 1.012, lr * 1.012], S(16), { thetaStart: Math.PI * 0.535, thetaLength: Math.PI * 0.03, h: 1 }), 0x2e1a10, 'lidU' + s);
    add('skin', ellipsoid(c, [lr * 0.995, lr * 0.995, lr * 0.995], S(16), { thetaStart: Math.PI * 0.52, thetaLength: Math.PI * 0.48, h: 6 }), COLORS.skin, 'lidL' + s);
    // brow
    const bc = [k * BR[0], BR[1], BR[2]];
    add('hair', loft([
      { p: [bc[0] - k * 0.03, bc[1] - 0.003, bc[2] - 0.004], r: [0.009, 0.007] },
      { p: [bc[0], bc[1] + 0.005, bc[2] + 0.004], r: [0.011, 0.008] },
      { p: [bc[0] + k * 0.032, bc[1] - 0.005, bc[2] - 0.01], r: [0.006, 0.005] },
    ], { seg: 8, cap0: 2, cap1: 2, side: [0, 0, 1] }), COLORS.brow, 'brow' + s);
  }

  // --- hair: lumpy cap + side-part swoop + messy back tufts ---
  const hc = FACE.headC, hr = FACE.headR;
  add('hair', ellipsoid(hc, [hr[0] + 0.015, hr[1] + 0.02, hr[2] + 0.015], S(22), {
    shape: (p) => {
      const line = p.y - (0.2 + 0.62 * p.z) - (p.z > 0 ? 0.12 * Math.max(0, -p.x) : 0);
      const part = Math.abs(p.x - 0.38);
      headShape(p);
      let sc = 0.6 + 0.4 * THREE.MathUtils.smoothstep(line, -0.12, 0.0);
      if (p.y > 0.55 && part < 0.08) sc -= 0.035 * (1 - part / 0.08);
      p.multiplyScalar(sc);
    },
    disp: (p) => {
      const d = V(p.x - hc[0], p.y - hc[1], p.z - hc[2]).normalize();
      p.addScaledVector(d, 0.007 * (noise3(p.x * 55, p.y * 55, p.z * 55) - 0.5) + 0.004 * Math.sin(Math.atan2(d.x, d.z) * 9 + d.y * 6));
    },
  }), (p) => (p.y > hc[1] + 0.06 ? COLORS.hair : COLORS.hairDark), 'head');
  // fringe swooping from the side part (Jon's left) across to his right
  const fr = [[0.045, 1.792], [0.0, 1.786], [-0.05, 1.772], [-0.094, 1.742]];
  add('hair', loft(fr.map(([x, y], i) => ({ p: [x, y, surfZ(x, y) + 0.008 - i * 0.002], r: [[0.02, 0.026, 0.022, 0.014][i], [0.014, 0.017, 0.015, 0.01][i]] })),
    { seg: S(12), cap0: 3, cap1: 4, side: [0, 1, 0] }), COLORS.hair, 'head');
  // quiff: volume swept up and over to his right from the part
  add('hair', ellipsoid([-0.012, 1.778, 0.06], [0.078, 0.036, 0.07], S(18), {
    rot: new THREE.Euler(0.4, 0, 0.14),
    disp: (p) => { const n = noise3(p.x * 70, p.y * 70, p.z * 70); p.y += 0.006 * (n - 0.5); },
  }), COLORS.hair, 'head');
  // swept locks over the shell give the hair clumps and direction (side part on his left)
  const hairR = [hr[0] + 0.018, hr[1] + 0.022, hr[2] + 0.018];
  const onHead = (d) => {
    const u = d.clone().normalize(), q = u.clone(); headShape(q);
    return V(hc[0] + q.x * hairR[0], hc[1] + q.y * hairR[1], hc[2] + q.z * hairR[2]);
  };
  const LOCKS = [
    [[0.42, 0.85, 0.32], [-0.55, 0.62, 0.58], 0.026], [[0.22, 0.95, 0.18], [-0.72, 0.6, 0.3], 0.026],
    [[0.46, 0.8, 0.38], [0.82, 0.48, 0.32], 0.02], [[0.1, 0.95, -0.1], [-0.5, 0.5, -0.72], 0.024],
    [[0.32, 0.9, -0.2], [0.55, 0.4, -0.75], 0.024], [[-0.1, 0.9, -0.3], [-0.15, 0.25, -0.96], 0.024],
    [[-0.45, 0.8, 0.15], [-0.86, 0.35, 0.2], 0.02], [[0.6, 0.75, 0.0], [0.8, 0.3, -0.45], 0.02],
  ];
  for (const [d0, d1, w] of LOCKS) {
    const a0 = V(...d0).normalize(), a1 = V(...d1).normalize(), n = 6, secs = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, d = a0.clone().lerp(a1, t).normalize();
      const p = onHead(d), out = p.clone().sub(V(...hc)).normalize();
      p.addScaledVector(out, 0.004 + 0.006 * Math.sin(t * Math.PI));
      secs.push({ p: [p.x, p.y, p.z], r: [0.006 + 0.004 * (1 - t), w * (1 - 0.75 * t)], side: out });
    }
    const mid = secs[3].side;
    add('hair', loft(secs, { seg: S(7), cap0: 1, cap1: 2, side: [mid.x, mid.y, mid.z] }), (p) => (p.y > hc[1] + 0.1 ? COLORS.hair : COLORS.hairDark), 'head');
  }
  // back of the head: overlapping soft tufts that break up the bowl-cut edge of the shell
  for (const [row, n, y0, y1, spread, w, lift] of [[0, 11, 0.18, -0.24, 1.3, 0.024, 0.004], [1, 8, 0.42, 0.0, 1.1, 0.026, 0.003]]) {
    for (let k = 0; k < n; k++) {
      const ph = (k / (n - 1) - 0.5) * 2 * spread + (row ? 0.1 : 0);
      const a0 = V(Math.sin(ph) * 0.9, y0, -Math.cos(ph) * 0.9).normalize();
      const a1 = V(Math.sin(ph * 1.04 + 0.06 * Math.sin(k * 1.7)) * 0.95, y1 - 0.05 * Math.cos(k * 2.3), -Math.cos(ph * 1.04) * 0.95).normalize();
      const m = 5, secs = [];
      for (let i = 0; i <= m; i++) {
        const t = i / m, d = a0.clone().lerp(a1, t).normalize();
        const p = onHead(d), out = p.clone().sub(V(...hc)).normalize();
        p.addScaledVector(out, 0.002 + lift * Math.sin(t * Math.PI));
        secs.push({ p: [p.x, p.y, p.z], r: [0.004 + 0.003 * (1 - t), w * (1 - 0.55 * t * t)], side: out });
      }
      const mid = secs[2].side;
      add('hair', loft(secs, { seg: S(7), cap0: 1, cap1: 2, side: [mid.x, mid.y, mid.z] }), (p) => (p.y > hc[1] + 0.02 ? COLORS.hair : COLORS.hairDark), 'head');
    }
  }
  // cowlick at the crown (the slightly messy bit)
  add('hair', loft([{ p: [0.0, 1.8, -0.05], r: [0.012, 0.008] }, { p: [0.01, 1.83, -0.07], r: [0.008, 0.006] }, { p: [0.03, 1.835, -0.08], r: [0.004, 0.003] }],
    { seg: 8, cap0: 2, cap1: 2 }), COLORS.hair, 'head');
  // ---------- assemble ----------
  const root = new THREE.Group();
  root.name = 'jon';
  const bones = {}, list = [];
  for (const [name, parent, p] of BONE_DEFS) {
    const b = new THREE.Bone(); b.name = name;
    const pp = parent ? BONE_DEFS.find(d => d[0] === parent)[2] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    b.userData.bind = b.position.clone();
    (parent ? bones[parent] : root).add(b);
    bones[name] = b; list.push(b);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  const mats = {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    shoe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 }),
    mouth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  // faint warm rim on skin to fake subsurface
  mats.skin.emissive = new THREE.Color(0x3a1408); mats.skin.emissiveIntensity = 0.18;
  const meshes = {};
  let tris = 0;
  for (const [k, arr] of Object.entries(parts)) {
    const geo = mergeGeometries(arr, false);
    const m = new THREE.SkinnedMesh(geo, mats[k]);
    m.name = 'jon_' + k; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    root.add(m); m.bind(skeleton, new THREE.Matrix4());
    meshes[k] = m; tris += geo.index.count / 3;
  }
  const mg = mouthGeometry(Math.max(8, Math.round(14 * Q)));
  const mouth = new THREE.SkinnedMesh(mg, mats.mouth);
  mouth.name = 'jon_mouth'; mouth.frustumCulled = false;
  root.add(mouth); mouth.bind(skeleton, new THREE.Matrix4());
  meshes.mouth = mouth; tris += mg.index.count / 3;
  return { root, bones, skeleton, meshes, mats, tris };
}

// pointed shirt collar: a folded strip around the neck with a gap at the front
function collarGeo(n) {
  const phi0 = 0.32, rows = [[1.455, 0.058, 0], [1.482, 0.062, 0], [1.462, 0.074, 1], [1.438, 0.092, 1]];
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const ph = phi0 + (Math.PI * 2 - 2 * phi0) * i / n;
    const fr = Math.exp(-(((Math.min(ph, Math.PI * 2 - ph) - phi0) / 0.45) ** 2));
    for (const [y, r, o] of rows) {
      const rr = r + o * 0.016 * fr, yy = y - o * 0.042 * fr;
      pos.push(Math.sin(ph) * rr, yy, Math.cos(ph) * rr * 0.92 - 0.004);
    }
  }
  const R = rows.length, nv = pos.length / 3;
  for (let i = 0; i < n; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + R;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g0.setIndex(idx); g0.computeVertexNormals();
  const nrm = Array.from(g0.attributes.normal.array);
  const pos2 = pos.concat(pos.map((v, i) => v - nrm[i] * 0.003)), nrm2 = nrm.concat(nrm.map(v => -v));
  const idx2 = idx.concat(idx.map((v, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]] + nv));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm2, 3));
  g.setIndex(idx2);
  return g;
}
