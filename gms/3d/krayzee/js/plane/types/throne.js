import * as THREE from 'three';
import { Builder, naca, airfoilLoop, sweepRings, circle, latheRings, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { createInstruments } from '../instruments.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan, noiseFill, contrast } from './kit.js';
import { propProxy } from './jetkit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';

// "Divine Right": a gilded throne on shopping-trolley castors, a velvet cushion, a crown finial, gilt angel wings, a
// sceptre tail boom, and a twin jet pack slung under the seat whose nozzles swivel from aft (0) to straight down (1)
// for the hover (rig.setNozzle, driven by the flight core's STOVL state). Build frame: y = height above ground (castors
// on y = 0), z = station aft of the front of the footstool, x = right.
export const CG = { s: 0.75, y: 0.95 };
export const SEAT = { x: 0, y: 0.72, s: 0.86 };
export const EYE = { x: 0, y: 1.38, s: 0.8, pitch: -0.16 };
const BASE = { s: 0.71, hx: 0.44, hz: 0.39, y0: 0.42, y1: 0.62 };
const BACK = { s: 1.04, t: 0.1, y0: 0.6, y1: 1.78, arch: 0.3, hx: 0.42, tilt: 0.12 };
const ARM = { x: 0.48, y: 0.92, s0: 0.36, s1: 1.02 };
const CASTERS = [[-0.42, 0.25], [0.42, 0.25], [-0.42, 1.05], [0.42, 1.05]];
const WHEEL = { r: 0.07, w: 0.035 };
export const PACK = { y: 0.33, r: 0.088, x: 0.17, s0: 0.38, pivot: 0.98, noz: 0.15 };
export const WING = { root: [0.44, 1.42, 1.1], half: 1.8, tipY: 2.0, le0: 0.96, le1: 1.3, c0: 0.72, c1: 0.36, ail: [0.95, 1.62], hinge: 0.66 };
export const STAB = { y: 0.74, half: 0.52, le: 2.42, hinge: 2.66, te: 2.86 };
export const FIN = { base: 0.76, top: 1.3, le0: 2.36, le1: 2.62, hinge: 2.72 };
const BOOM = [[0, 0.56, 1.08], [0, 0.66, 1.9], [0, 0.74, 2.5]];
const LECTERN = { s: -0.04, y: 1.0, tilt: -0.95 };

// back of the backrest outline in (x, y): straight sides, an ogee arch on top
function backOutline(N = 24) {
  const B = BACK, pts = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, a = Math.PI * t, x = B.hx * Math.cos(a);
    const rise = B.arch * Math.sin(a) ** 0.8 + 0.06 * Math.sin(a) ** 12;
    pts.push([x, B.y1 + rise]);
  }
  return [[B.hx, B.y0], ...pts, [-B.hx, B.y0]];
}
const tiltZ = (y) => BACK.s + (y - BACK.y0) * Math.tan(BACK.tilt);

// ---------- livery: velvet in the player's primary, gold leaf (metal), the name embroidered on the back ----------
const REG = {
  backR: { x0: 0, x1: 0.5, y0: 0, y1: 0.42, s0: -0.5, s1: 0.5, h0: 0.55, h1: 2.15, flip: false },
  backF: { x0: 0.5, x1: 1, y0: 0, y1: 0.42, s0: -0.5, s1: 0.5, h0: 0.55, h1: 2.15, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.42, y1: 0.62, a0: -1.9, a1: 1.9, s0: 0.9, s1: 1.75, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.62, y1: 0.82, a0: -1.9, a1: 1.9, s0: 0.9, s1: 1.75, flip: true },
  finL: { x0: 0, x1: 0.33, y0: 0.82, y1: 0.97, s0: 2.3, s1: 3.0, h0: 0.7, h1: 1.4, flip: false },
  finR: { x0: 0.33, x1: 0.66, y0: 0.82, y1: 0.97, s0: 2.3, s1: 3.0, h0: 0.7, h1: 1.4, flip: true },
  tail: { x0: 0.66, x1: 1, y0: 0.82, y1: 0.97, a0: -0.6, a1: 0.6, s0: 2.35, s1: 2.95, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'gold', 'white', 'dark', 'primaryDark', 'black'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const GOLD = '#d4a743', GOLD_D = '#8c661f', GOLD_L = '#f5d77e';

function createThroneLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const mr = document.createElement('canvas'); mr.width = mr.height = 1024;
  const mrTex = new THREE.CanvasTexture(mr);
  const mctx = mr.getContext('2d');
  const MA = atlas(1024);
  const VELVET = 'rgb(0,235,0)', METAL = 'rgb(0,70,255)';
  const gilt = (c, y0 = 2, y1 = 0) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, GOLD_L); g.addColorStop(0.5, GOLD); g.addColorStop(1, GOLD_D); return g; };
  const backPath = (c, inset) => { const o = backOutline(32); c.beginPath(); o.forEach(([x, y], i) => { const xx = x - Math.sign(x) * inset * (Math.abs(x) > 0.01 ? 1 : 0), yy = y > BACK.y1 ? y - inset : y + (y <= BACK.y0 + 1e-6 ? inset : 0); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }); c.closePath(); };
  function back(c, T, L, mask, rear) {
    c.fillStyle = mask ? METAL : gilt(c); c.fillRect(-1, 0, 2, 3);
    backPath(c, 0.06); c.fillStyle = mask ? VELVET : L.primary; c.fill();
    if (!mask) {
      // tufted velvet: soft diamond shading and gold buttons
      c.save(); backPath(c, 0.06); c.clip();
      const g = c.createRadialGradient(0, 1.3, 0.05, 0, 1.3, 0.9); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
      c.fillStyle = g; c.fillRect(-1, 0, 2, 3);
      for (let y = 0.72; y < 2.1; y += 0.14) for (let x = -0.42; x <= 0.42; x += 0.14) {
        const ox = (Math.round((y - 0.72) / 0.14) % 2) * 0.07;
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + ox, y, 0.05, 0.05, 0, 0, 7); c.fill();
        if (!rear) { c.fillStyle = GOLD_L; c.beginPath(); c.arc(x + ox, y, 0.009, 0, 7); c.fill(); }
      }
      c.restore();
    }
    // an inner gold cord
    c.lineWidth = 0.016; c.strokeStyle = mask ? METAL : GOLD; backPath(c, 0.1); c.stroke();
    if (!rear) return;
    if (mask) { c.fillStyle = METAL; c.beginPath(); c.ellipse(0, 1.5, 0.18, 0.23, 0, 0, 7); c.fill(); return; }
    crest(c, T, 0, 1.52, 0.48, { field: shade(L.secondary, 0.75), field2: '#a3162a', gold: GOLD });
    const nameCol = pick(L.primary, [GOLD_L, GOLD, '#ffffff'], 2.2);
    A.text(c, T, L.display, 0, 1.08, 0.7, 0.13, { font: 'italic 700', family: "Georgia, 'Times New Roman', serif", fill: nameCol, stroke: contrast(nameCol, '#2a1d08') > 2.5 ? '#2a1d08' : null, strokeW: 5 });
    A.text(c, T, L.registration, 0, 0.82, 0.42, 0.075, { font: '700', fill: nameCol });
  }
  function wing(c, T, L, mask, top) {
    c.fillStyle = mask ? METAL : gilt(c, 1.0, 1.8); c.fillRect(-3, 0, 6, 3);
    if (!mask) {
      // feathers: rows of overlapping gold scales toward the root, long primaries with tips in the player's secondary
      for (const sg of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x = sg * (0.5 + i * 0.15), w = WING;
          const k = (Math.abs(x) - w.root[0]) / (w.half - w.root[0]), le = lerp(w.le0, w.le1, k), te = le + lerp(w.c0, w.c1, k);
          c.strokeStyle = 'rgba(90,60,10,0.55)'; c.lineWidth = 0.008;
          c.beginPath(); c.moveTo(x, le + 0.06); c.quadraticCurveTo(x + sg * 0.05, (le + te) / 2, x + sg * 0.09, te + 0.04); c.stroke();
          c.fillStyle = L.secondary; c.globalAlpha = 0.85;
          c.beginPath(); c.ellipse(x + sg * 0.07, te - 0.02, 0.05, 0.07, sg * 0.4, 0, 7); c.fill(); c.globalAlpha = 1;
        }
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { const x = sg * (0.5 + i * 0.12 + r * 0.04), y = 1.02 + r * 0.06; c.strokeStyle = 'rgba(120,80,20,0.4)'; c.lineWidth = 0.005; c.beginPath(); c.arc(x, y, 0.05, 0.2, Math.PI - 0.2); c.stroke(); }
      }
      if (!top) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-3, 0, 6, 3); }
    }
  }
  function banner(c, T, L, mask) {
    c.fillStyle = mask ? VELVET : L.primary; c.fillRect(2, 0, 2, 2);
    if (mask) return;
    c.fillStyle = L.secondary; c.fillRect(2, 0.7, 2, 0.12);
    crest(c, T, 2.6, 1.05, 0.26, { field: shade(L.secondary, 0.7), field2: '#a3162a', gold: GOLD });
  }
  function draw(L) {
    for (const [cc, AA, mask] of [[ctx, A, false], [mctx, MA, true]]) {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.fillStyle = mask ? VELVET : '#000'; cc.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
      AA.region(cc, REG.backR, AA.side(REG.backR), (c, T) => back(c, T, L, mask, true));
      AA.region(cc, REG.backF, AA.side(REG.backF), (c, T) => back(c, T, L, mask, false));
      AA.region(cc, REG.wingT, AA.plan(REG.wingT), (c, T) => wing(c, T, L, mask, true));
      AA.region(cc, REG.wingB, AA.plan(REG.wingB), (c, T) => wing(c, T, L, mask, false));
      AA.region(cc, REG.finL, AA.side(REG.finL), (c, T) => banner(c, T, L, mask));
      AA.region(cc, REG.finR, AA.side(REG.finR), (c, T) => banner(c, T, L, mask));
      AA.region(cc, REG.tail, AA.plan(REG.tail), (c) => { c.fillStyle = mask ? VELVET : L.primary; c.fillRect(-1, 2, 2, 1.2); if (!mask) { c.fillStyle = L.secondary; c.fillRect(-1, STAB.hinge - 0.01, 2, 0.02); } });
      const W = cc.canvas.width, w = W / SW.length;
      const cols = mask ? { gold: METAL, accent: METAL, white: 'rgb(0,120,0)', dark: 'rgb(0,140,0)', black: 'rgb(0,140,0)' } : { primary: L.primary, secondary: L.secondary, accent: L.accent, gold: GOLD, white: '#f6f4ee', dark: '#202328', primaryDark: shade(L.primary, 0.7), black: '#0b0c0e' };
      SW.forEach((k, i) => { cc.fillStyle = cols[k] || VELVET; cc.fillRect(i * w, W * 0.98, w, W * 0.02); });
    }
    texture.needsUpdate = true; mrTex.needsUpdate = true;
  }
  return { texture, mrTex, draw, owns: (t) => t === texture || t === mrTex, dispose() { texture.dispose(); mrTex.dispose(); } };
}

function createThroneMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.mrTex, metalnessMap: livery.mrTex, roughness: 1, metalness: 1, envMapIntensity: 1.2 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0xffffff }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('throne-trim', { envMapIntensity: 1.3 });
  const flame = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: 0 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, flame, disc, lights, beacon];
  return { paint, trim, flame, disc, lights, beacon, all: () => list };
}

const C = {
  gold: srgb(GOLD), goldD: srgb(GOLD_D), goldL: srgb(GOLD_L), chrome: srgb('#d9dde1'), rubber: srgb('#151517'), steel: srgb('#8c9298'), dark: srgb('#2a2c30'),
  ruby: [0.6, 0.02, 0.05], sapphire: [0.04, 0.12, 0.6], pearl: srgb('#f3eee4'), ermine: srgb('#f6f3ec'), wood: srgb('#4e2410'), hot: [3, 1.6, 0.6],
  brass: srgb('#c79a45'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

// a rounded-rectangle (superellipse) ring at height y
function sring(cx, cz, hx, hz, y, N, e = 6) {
  const r = [];
  for (let j = 0; j < N; j++) { const a = (j / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); r.push([cx + hx * Math.sign(c) * Math.abs(c) ** (2 / e), y, cz + hz * Math.sign(s) * Math.abs(s) ** (2 / e)]); }
  return r;
}

export function buildThroneExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder();
  const swP = () => sw('primary'), swG = () => sw('gold');
  const gold = (B) => ({ color: C.gold, uv: () => RM.gold });

  // ---------- seat base: velvet panels between gilt bands; the cushion with tassels ----------
  {
    const N = T.n(32, 12), ys = [BASE.y0, BASE.y0 + 0.02, BASE.y1 - 0.02, BASE.y1];
    body.loft(ys.map((y) => sring(0, BASE.s, BASE.hx - (y === BASE.y0 || y === BASE.y1 ? 0.01 : 0), BASE.hz - (y === BASE.y0 || y === BASE.y1 ? 0.01 : 0), y, N)), { out: (p) => [p[0], 0, p[2] - BASE.s], uv: swP });
    fan(body, sring(0, BASE.s, BASE.hx - 0.01, BASE.hz - 0.01, BASE.y0, N).reverse(), [0, -1, 0], sw('primaryDark'));
    for (const y of [BASE.y0 + 0.012, BASE.y1 - 0.012]) {
      const ring = sring(0, BASE.s, BASE.hx + 0.005, BASE.hz + 0.005, y, N); ring.push(ring[0], ring[1]);
      trim.loft(sweepRings(ring, circle(T.n(8, 4), 0.022)), gold());
    }
    // the cushion: a plump superellipsoid in the player's velvet, gold piping, a tassel at each corner
    const cy = BASE.y1 + 0.06, ch = 0.075, K = T.i(6, 3), rings = [];
    for (let k = 0; k <= K; k++) { const v = -1 + (2 * k) / K, f = Math.max(0.3, (1 - Math.abs(v) ** 3)) ** 0.5; rings.push(sring(0, BASE.s - 0.03, (BASE.hx - 0.04) * (0.9 + 0.1 * f), (BASE.hz - 0.06) * (0.9 + 0.1 * f), cy + v * ch * f, N)); }
    body.loft(rings, { out: (p) => [p[0], (p[1] - cy) * 3, p[2] - BASE.s], uv: swP, capStart: true, capEnd: true, capUV: swP });
    { const ring = sring(0, BASE.s - 0.03, BASE.hx - 0.035, BASE.hz - 0.055, cy, N); ring.push(ring[0], ring[1]); if (!T.lod2) trim.loft(sweepRings(ring, circle(T.n(6, 4), 0.01)), gold()); }
    if (T.detail) for (const [sx, sz] of [[-1, -1], [1, -1]]) {
      const p = [sx * (BASE.hx - 0.06), cy, BASE.s - 0.03 + sz * (BASE.hz - 0.08)];
      trim.addGeo(new THREE.ConeGeometry(0.03, 0.12, T.n(10, 6), 1, true), M4(p[0] + sx * 0.03, p[1] - 0.09, p[2] + sz * 0.03), RM.goldSatin, C.gold);
      trim.addGeo(new THREE.SphereGeometry(0.022, T.n(8, 4), T.n(6, 3)), M4(p[0] + sx * 0.03, p[1] - 0.02, p[2] + sz * 0.03), RM.gold, C.gold);
    }
  }

  // ---------- cabriole legs on shopping-trolley castors ----------
  for (const [x, s] of CASTERS) {
    const sg = Math.sign(x), front = s < BASE.s;
    const top = [x * 0.93, BASE.y0 + 0.02, s + (front ? 0.1 : -0.04)], knee = [x * 1.04, BASE.y0 - 0.1, lerp(top[2], s, 0.3) + (front ? -0.05 : 0.05)], foot = [x, 0.2, s];
    const path = [], K = T.i(10, 4);
    for (let k = 0; k <= K; k++) {
      const t = k / K, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      path.push([0, 1, 2].map((i) => a * top[i] + b * knee[i] + c * [x * 0.98, 0.25, s][i] + d * foot[i]));
    }
    const rad = (t) => 0.032 + 0.03 * (1 - t) ** 2 + 0.02 * Math.exp(-(((t - 0.35) / 0.12) ** 2)) + (t > 0.85 ? 0.018 * ((t - 0.85) / 0.15) : 0);
    trim.loft(sweepRings(path, circle(T.n(10, 4), 1), { scale: (i, n) => rad(i / (n - 1)) }), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
    if (T.detail) trim.addGeo(new THREE.SphereGeometry(1, T.n(12, 6), T.n(8, 4)), M4(top[0], top[1] + 0.01, top[2], 0.07, 0.04, 0.06), RM.gold, C.gold);
    // the castor: swivel plate, chrome fork, a grey rubber wheel that has seen a car park or two
    trim.addGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.012, T.n(12, 6)), M4(x, 0.19, s), RM.chrome, C.chrome);
    for (const k of [-1, 1]) trim.addGeo(new THREE.BoxGeometry(0.006, 0.13, 0.05), M4(x + k * (WHEEL.w / 2 + 0.008), 0.125, s + 0.012, 1, 1, 1, -0.2, 0, 0), RM.chrome, C.chrome);
    const tire = new THREE.CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.w, T.n(18, 8));
    trim.addGeo(tire, M4(x, WHEEL.r, s + 0.02, 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, srgb('#3a3c40'));
    trim.addGeo(new THREE.CylinderGeometry(0.025, 0.025, WHEEL.w + 0.01, T.n(10, 6)), M4(x, WHEEL.r, s + 0.02, 1, 1, 1, 0, 0, Math.PI / 2), RM.chrome, C.chrome);
  }

  // ---------- the backrest: an ogee-arched panel, velvet both faces, a carved gilt frame, the crown finial ----------
  const outline = backOutline(T.n(24, 10));
  {
    const zf = (y) => tiltZ(y), zr = (y) => tiltZ(y) + BACK.t;
    const front = outline.map(([x, y]) => [x, y, zf(y)]), rear = outline.map(([x, y]) => [x, y, zr(y)]);
    fan(body, front, [0, 0, -1], (p) => uvSide(REG.backF, p[0], p[1]));
    fan(body, rear, [0, 0, 1], (p) => uvSide(REG.backR, p[0], p[1]));
    const edge = [...outline, outline[0]].map(([x, y]) => [x, y]);
    const side = edge.map(([x, y]) => [[x, y, zf(y)], [x, y, zr(y)]]);
    body.loft([side.map((p) => p[0]), side.map((p) => p[1])], { closed: false, out: (p) => [p[0], p[1] - 1.3, 0], uv: swG });
    if (!T.lod2) for (const z of [zf, zr]) {
      const ring = outline.map(([x, y]) => [x * 1.005, y + (y > BACK.y1 ? 0.005 : 0), z(y) + (z === zf ? -0.012 : 0.012)]);
      trim.loft(sweepRings([...ring, ring[0], ring[1]], circle(T.n(8, 4), 0.026)), gold());
    }
    // carved scrolls at the shoulders and a pair of gilt finials either side of the arch
    if (T.detail) for (const sg of [-1, 1]) {
      trim.addGeo(new THREE.TorusGeometry(0.06, 0.018, T.n(8, 4), T.n(16, 8), Math.PI * 1.5), M4(sg * (BACK.hx + 0.02), BACK.y1 + 0.02, tiltZ(BACK.y1) + 0.05, 1, 1, 1, 0, Math.PI / 2, 0), RM.gold, C.gold);
      trim.addGeo(new THREE.SphereGeometry(0.04, T.n(10, 6), T.n(8, 4)), M4(sg * (BACK.hx + 0.02), BACK.y1 + 0.12, tiltZ(BACK.y1 + 0.1) + 0.05), RM.gold, C.gold);
      trim.addGeo(new THREE.ConeGeometry(0.03, 0.12, T.n(10, 6)), M4(sg * (BACK.hx + 0.02), BACK.y1 + 0.21, tiltZ(BACK.y1 + 0.2) + 0.05), RM.gold, C.gold);
    }
    // the crown on top: gilt band, five points with pearls, a red velvet cap, an orb and cross
    const cy = BACK.y1 + BACK.arch + 0.06, cz = tiltZ(cy) + BACK.t / 2, cr = 0.11;
    trim.addGeo(new THREE.CylinderGeometry(cr, cr * 0.92, 0.08, T.n(20, 10), 1, true), M4(0, cy, cz), RM.gold, C.gold);
    trim.addGeo(new THREE.SphereGeometry(cr * 0.9, T.n(16, 8), T.n(8, 4), 0, Math.PI * 2, 0, Math.PI / 2), M4(0, cy + 0.02, cz, 1, 0.9, 1), RM.cloth, C.ruby);
    if (!T.lod2) for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * cr, z = cz + Math.sin(a) * cr;
      trim.addGeo(new THREE.ConeGeometry(0.03, 0.09, T.n(8, 4)), M4(x, cy + 0.08, z), RM.gold, C.gold);
      if (T.detail) trim.addGeo(new THREE.SphereGeometry(0.014, T.n(8, 4), T.n(6, 3)), M4(x, cy + 0.13, z), RM.enamel, C.pearl);
      if (T.detail) trim.addGeo(new THREE.SphereGeometry(0.016, T.n(8, 4), T.n(6, 3)), M4(Math.cos(a + 0.63) * cr * 1.01, cy, cz + Math.sin(a + 0.63) * cr * 1.01), RM.glass, i % 2 ? C.ruby : C.sapphire);
    }
    trim.addGeo(new THREE.SphereGeometry(0.035, T.n(12, 6), T.n(8, 4)), M4(0, cy + 0.13, cz), RM.gold, C.gold);
    trim.addGeo(new THREE.BoxGeometry(0.018, 0.08, 0.018), M4(0, cy + 0.2, cz), RM.gold, C.gold);
    trim.addGeo(new THREE.BoxGeometry(0.055, 0.018, 0.018), M4(0, cy + 0.21, cz), RM.gold, C.gold);
  }

  // ---------- armrests: gilt beams on turned balusters, lion-head scrolls ----------
  for (const sg of [-1, 1]) {
    const x = sg * ARM.x, path = [[x, ARM.y, ARM.s0], [x, ARM.y + 0.01, (ARM.s0 + ARM.s1) / 2], [x * 0.98, ARM.y - 0.02, ARM.s1]];
    trim.loft(sweepRings(path, circle(T.n(10, 4), 1).map(([a, b]) => [a * 0.045, b * 0.03])), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
    body.addGeo(new THREE.BoxGeometry(0.07, 0.025, ARM.s1 - ARM.s0 - 0.1), M4(x, ARM.y + 0.035, (ARM.s0 + ARM.s1) / 2 + 0.03), swP);
    const bal = latheRings([[0, 0.025], [0.04, 0.035], [0.08, 0.022], [0.15, 0.03], [0.2, 0.02], [0.27, 0.03], [0.3, 0.035]].map(([y, r]) => [y, r]), T.n(10, 6));
    trim.loft(bal.map((ring) => ring.map(([a, b, y]) => [x + a, BASE.y1 + y, ARM.s0 + 0.04 + b])), { color: C.gold, uv: () => RM.gold });
    trim.addGeo(new THREE.SphereGeometry(0.05, T.n(12, 6), T.n(8, 4)), M4(x, ARM.y + 0.01, ARM.s0 - 0.03, 1, 0.9, 1.1), RM.gold, C.gold);
    if (T.detail) { trim.addGeo(new THREE.TorusGeometry(0.035, 0.012, T.n(6, 4), T.n(12, 6), Math.PI * 1.4), M4(x + sg * 0.04, ARM.y, ARM.s0 - 0.03, 1, 1, 1, 0, Math.PI / 2, 0), RM.gold, C.gold); for (const k of [-1, 1]) trim.addGeo(new THREE.SphereGeometry(0.008, 6, 4), M4(x + k * 0.02, ARM.y + 0.03, ARM.s0 - 0.075), RM.black, C.dark); }
  }

  // ---------- footstool: a velvet pouffe on gilt brackets from the front legs ----------
  {
    const N = T.n(20, 8), cy = 0.4;
    body.loft([0.33, 0.35, 0.45, 0.47].map((y, i) => sring(0, 0.03, i === 0 || i === 3 ? 0.2 : 0.22, i === 0 || i === 3 ? 0.11 : 0.13, y, N, 4)), { out: (p) => [p[0], (p[1] - cy) * 2, p[2] - 0.03], uv: swP, capStart: true, capEnd: true, capUV: swP });
    for (const sg of [-1, 1]) { rod(trim, [sg * 0.18, 0.36, 0.1], [sg * 0.4, 0.3, 0.25], 0.012, T.n(6, 4), RM.gold, C.gold); if (T.detail) trim.addGeo(new THREE.SphereGeometry(0.03, T.n(8, 4), T.n(6, 3)), M4(sg * 0.18, 0.33, 0.03), RM.gold, C.gold); }
  }

  // ---------- the jet pack: twin gilt pods under the seat; the nozzles swivel on one shaft ----------
  for (const sg of [-1, 1]) {
    const x = sg * PACK.x, prof = [[PACK.s0 - 0.04, 0.05], [PACK.s0 - 0.03, 0.085], [PACK.s0, PACK.r], [PACK.s0 + 0.15, PACK.r + 0.004], [PACK.pivot - 0.12, PACK.r], [PACK.pivot - 0.02, PACK.r * 0.8], [PACK.pivot, PACK.r * 0.72]];
    const rings = latheRings(prof, T.n(16, 8), x, PACK.y);
    trim.loft(rings, { out: (p) => [p[0] - x, p[1] - PACK.y, 0], color: (p) => (Math.abs(p[2] - (PACK.s0 + 0.2)) < 0.03 || Math.abs(p[2] - (PACK.pivot - 0.15)) < 0.03 ? C.gold : C.brass), uv: () => RM.brass });
    trim.addGeo(new THREE.CircleGeometry(0.05, T.n(14, 6)), M4(x, PACK.y, PACK.s0 - 0.035, 1, 1, 1, Math.PI, 0, 0), RM.black, C.dark);
    if (T.detail) for (const k of [-1, 1]) rod(trim, [x, PACK.y + PACK.r - 0.01, PACK.s0 + 0.15 + k * 0.15], [x * 0.95, BASE.y0, PACK.s0 + 0.15 + k * 0.15], 0.01, T.n(6, 4), RM.gold, C.gold);
  }
  const nozzle = new Builder();
  for (const sg of [-1, 1]) {
    const x = sg * PACK.x;
    const rings = latheRings([[0, PACK.r * 0.72], [0.03, PACK.r * 0.74], [0.09, PACK.r * 0.66], [PACK.noz, PACK.r * 0.6]], T.n(16, 8), x, 0);
    nozzle.loft(rings, { out: (p) => [p[0] - x, p[1], 0], color: (p) => (p[2] > PACK.noz - 0.02 ? C.gold : C.steel), uv: (p) => (p[2] > PACK.noz - 0.02 ? RM.gold : RM.steel) });
    const inner = latheRings([[PACK.noz, PACK.r * 0.55], [0.02, PACK.r * 0.4]], T.n(12, 6), x, 0);
    nozzle.loft(inner, { out: (p) => [-(p[0] - x), -p[1], 0], color: [0.6, 0.25, 0.08], uv: () => RM.darkMetal });
  }
  nozzle.addGeo(new THREE.CylinderGeometry(0.018, 0.018, PACK.x * 2 + 0.05, T.n(8, 4)), M4(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), RM.gold, C.gold);
  const flame = new Builder();
  if (!T.far) for (const sg of [-1, 1]) {
    const x = sg * PACK.x;
    flame.addGeo(new THREE.ConeGeometry(PACK.r * 0.5, 1, T.n(12, 6), 1, true), M4(x, 0, 0.5, 1, 1, 1, Math.PI / 2, 0, 0), [0, 0], (p) => { const t = clamp(p[2], 0, 1); return [1.25 * (1 - t), 0.5 * (1 - t) ** 1.4, 0.16 * (1 - t) ** 2.5]; });
    flame.addGeo(new THREE.ConeGeometry(PACK.r * 0.32, 0.45, T.n(10, 6), 1, true), M4(x, 0, 0.225, 1, 1, 1, Math.PI / 2, 0, 0), [0, 0], (p) => { const t = clamp(p[2] / 0.45, 0, 1); return [0.55 * (1 - t), 0.6 * (1 - t), 1.1 * (1 - t)]; });
  }

  // ---------- the sceptre tail boom, banner tail surfaces ----------
  trim.loft(sweepRings(BOOM, circle(T.n(10, 4), 0.022)), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
  if (T.detail) for (const t of [0.2, 0.5, 0.8]) { const p = [0, lerp(BOOM[0][1], BOOM[2][1], t), lerp(BOOM[0][2], BOOM[2][2], t)]; trim.addGeo(new THREE.SphereGeometry(0.034, T.n(10, 6), T.n(8, 4)), M4(...p, 1, 1, 1.3), RM.gold, C.gold); trim.addGeo(new THREE.SphereGeometry(0.02, T.n(8, 4), T.n(6, 3)), M4(p[0], p[1] + 0.03, p[2]), RM.glass, t === 0.5 ? C.sapphire : C.ruby); }
  const pieces = {};
  const sym = naca(0, 0.4, 0.1);
  const stabSec = (x) => { const ax = Math.abs(x), k = clamp((ax - (STAB.half - 0.2)) / 0.2, 0, 1); const le = STAB.le + 0.05 * (ax / STAB.half) + 0.12 * k ** 2, te = STAB.te - 0.04 * k ** 2; return { le, te, c: te - le, thk: Math.sqrt(Math.max(0.05, 1 - k ** 3)) }; };
  const tailRing = (x, f0, f1, rn) => { const s = stabSec(x), fh = (STAB.hinge - s.le) / s.c; const { loop } = airfoilLoop(sym, T.n(12, 6), f0 === 'h' ? fh + 0.015 : f0, f1 === 'h' ? fh : f1, rn); return loop.map(([xc, yv]) => [x, STAB.y + yv * s.c * s.thk, s.le + xc * s.c]); };
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  const stabXs = []; { const K = T.n(10, 4); for (let k = 0; k <= K; k++) stabXs.push(-STAB.half + 2 * STAB.half * (0.5 - 0.5 * Math.cos(Math.PI * k / K))); }
  body.loft(stabXs.map((x) => tailRing(x, 0, 'h', false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  const elev = new Builder();
  for (const sg of [1, -1]) { const xs = stabXs.filter((x) => x * sg >= 0.05); if (sg > 0) xs.unshift(0.05); else xs.push(-0.05); elev.loft(xs.map((x) => tailRing(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP }); }
  pieces.elevator = { B: elev, a: [-1, STAB.y, STAB.hinge + 0.015], b: [1, STAB.y, STAB.hinge + 0.015] };
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const ys = [], K = T.i(6, 3); for (let k = 0; k <= K; k++) ys.push(lerp(FIN.base, FIN.top, k / K));
    body.loft(ys.map((y) => { const u = (y - FIN.base) / (FIN.top - FIN.base), le = lerp(FIN.le0, FIN.le1, u ** 1.3), c = Math.max(0.03, FIN.hinge - 0.012 - le); const { loop } = airfoilLoop(sym, T.n(10, 6), 0, 1, false); return loop.map(([xc, yv]) => [yv * c, y, le + xc * c]); }), { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    const rud = new Builder(), ry = []; const K2 = T.i(10, 4); for (let k = 0; k <= K2; k++) ry.push(lerp(FIN.base, FIN.top, 0.5 - 0.5 * Math.cos(Math.PI * k / K2)));
    rud.loft(ry.map((y) => { const t = (y - FIN.base) / (FIN.top - FIN.base), te = FIN.hinge + 0.06 + 0.16 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.8) ** 2)) - 0.05 * Math.sin(t * Math.PI * 3) ** 2, c = Math.max(0.02, te - FIN.hinge - 0.012); const { loop } = airfoilLoop(sym, T.n(10, 6), 0, 1, false); return loop.map(([xc, yv]) => [yv * c * 0.9, y, FIN.hinge + 0.012 + xc * c]); }), { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    pieces.rudder = { B: rud, a: [0, FIN.base, FIN.hinge + 0.012], b: [0, FIN.top, FIN.hinge + 0.012] };
    if (!T.lod2) trim.addGeo(new THREE.ConeGeometry(0.03, 0.1, T.n(8, 4)), M4(0, FIN.top + 0.05, FIN.hinge), RM.gold, C.gold);
  }

  // ---------- the gilt angel wings: feathered, swept up and back off the backrest ----------
  {
    const W = WING, foil = naca(0.04, 0.35, 0.08), nC = T.n(14, 6);
    const sec = (x) => {
      const ax = Math.abs(x), k = clamp((ax - W.root[0]) / (W.half - W.root[0]), 0, 1);
      const le = lerp(W.le0, W.le1, k ** 1.3), c = lerp(W.c0, W.c1, k ** 0.9) * (k > 0.88 ? Math.sqrt(Math.max(0.05, 1 - ((k - 0.88) / 0.12) ** 2)) : 1);
      const y = lerp(W.root[1], W.tipY, k ** 1.15), scal = 0.045 * Math.abs(Math.sin(k * Math.PI * 4.5));   // the feathered trailing edge
      return { le, c: c + scal, y, k };
    };
    const ring = (x, loop) => { const w = sec(x); return loop.map(([xc, yv]) => [x, w.y + yv * w.c, w.le + xc * w.c]); };
    const xsOf = (a, b) => { const n = Math.max(2, Math.ceil(Math.abs(b - a) / T.step(0.07))); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
    const panel = (B, xs, cFrom, cTo, rn) => {
      const { loop, topCount } = airfoilLoop(foil, nC, cFrom, cTo, rn), top = topCount - 1 + (cFrom > 0 && rn ? 3 : 0);
      B.loft(xs.map((x) => ring(x, loop)), { out: () => [0, 1, 0], splits: [[0, top, (p) => uvPlan(REG.wingT, p[0], p[2])], [top, loop.length, (p) => uvPlan(REG.wingB, p[0], p[2])]], capStart: true, capEnd: true, capUV: swG });
    };
    for (const sg of [1, -1]) {
      const S = (a) => a.map((x) => x * sg);
      panel(body, S(xsOf(W.root[0], W.ail[0])), 0, 1, false);
      panel(body, S(xsOf(W.ail[0], W.ail[1])), 0, W.hinge, false);
      panel(body, S(xsOf(W.ail[1], W.half)), 0, 1, false);
      const B = new Builder(), a = W.ail[0] + 0.01, b = W.ail[1] - 0.01;
      panel(B, S(xsOf(a, b)), W.hinge + 0.006, 1, true);
      const hp = (x) => { const w = sec(x); return [x, w.y, w.le + (W.hinge + 0.012) * w.c]; };
      pieces[sg > 0 ? 'ailR' : 'ailL'] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
      // root fairing: a gilt scroll where the wing meets the backrest
      if (!T.lod2) trim.addGeo(new THREE.SphereGeometry(1, T.n(12, 6), T.n(8, 4)), M4(sg * (W.root[0] - 0.01), W.root[1], W.le0 + 0.25, 0.05, 0.09, 0.26), RM.gold, C.gold);
    }
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
    const p = [sg * (WING.half - 0.02), WING.tipY, WING.le1 + 0.05];
    lights.addGeo(new THREE.SphereGeometry(0.025, T.n(8, 4), T.n(6, 3)), M4(...p, 0.8, 0.8, 1.3), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const p = [0, FIN.top + 0.12, FIN.hinge]; lights.addGeo(new THREE.SphereGeometry(0.02, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }

  // ---------- assemble ----------
  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  const nozzleGroup = new THREE.Group();
  nozzleGroup.position.set(0, PACK.y, PACK.pivot);
  const nozMesh = mkMesh('nozzle', nozzle, mats.trim);
  nozzleGroup.add(nozMesh);
  let flameMesh = null;
  if (!T.far) { flameMesh = mkMesh('flame', flame, mats.flame, { cast: false, receive: false }); flameMesh.renderOrder = 3; flameMesh.frustumCulled = false; flameMesh.position.z = PACK.noz; nozzleGroup.add(flameMesh); }
  group.add(nozzleGroup);
  // no propeller: inert stand-ins for the rig's prop bookkeeping
  const propGroup = new THREE.Group(), propMesh = propProxy(), disc = propProxy();
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, nozzleGroup, flameMesh };
}

// ---------- 'cockpit': the lectern of state between the royal feet, the sceptre stick, the orb throttle ----------
function lecternCanvas(quality) {
  const W = quality === 'low' ? 512 : 1024, H = W / 3.4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const wood = g.createLinearGradient(0, 0, 0, H); wood.addColorStop(0, '#5a2c14'); wood.addColorStop(1, '#3a1a0a');
  g.fillStyle = wood; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 30},25,${0.05 + Math.random() * 0.08})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 4, W * 0.7, y - 6, W, y + 2); g.stroke(); }
  noiseFill(g, 0, 0, W, H, 3000 * (W / 1024), 0.1);
  g.strokeStyle = GOLD; g.lineWidth = W * 0.008; g.strokeRect(W * 0.012, H * 0.05, W * 0.976, H * 0.9);
  g.fillStyle = '#f0e6c8'; g.font = `italic 700 ${W * 0.026}px Georgia, serif`; g.textAlign = 'center';
  ['VELOCITY', 'ALTITUDE', 'HORIZON', 'ASCENT'].forEach((l, i) => g.fillText(l, W * (0.125 + i * 0.25), H * 0.92));
  g.font = `700 ${W * 0.022}px Georgia, serif`; g.fillText('BY DIVINE RIGHT · NO REFUNDS', W * 0.5, H * 0.14);
  return canvasTexture(c);
}
const ORB = { x: -ARM.x, y: ARM.y + 0.03, s: 0.5, len: 0.11 };
export const orbKnob = (th) => { const a = (0.5 - th) * 1.0; return [ORB.x, ORB.y + Math.cos(a) * ORB.len, ORB.s + Math.sin(a) * ORB.len]; };

function buildThroneCockpit(quality, mats, ctx) {
  const high = quality === 'high';
  const group = new THREE.Group();
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const B = new Builder();
  // the lectern: a gilt pole off the footstool, a walnut board tilted to the royal eye
  rod(B, [0, 0.46, LECTERN.s], [0, LECTERN.y - 0.04, LECTERN.s], 0.014, n(8), RM.gold, C.gold);
  B.addGeo(new THREE.SphereGeometry(0.026, n(10), n(8)), M4(0, (0.46 + LECTERN.y) / 2, LECTERN.s), RM.gold, C.gold);
  const board = new THREE.Group();
  board.position.set(0, LECTERN.y, LECTERN.s);
  board.rotation.x = LECTERN.tilt;
  const tex = lecternCanvas(quality), bw = 0.5, bh = bw / 3.4;
  const pb = new Builder();
  const v = (x, y, u, w) => pb.v([x, y, 0.012], [0, 0, 1], [u, w]);
  const a = v(-bw / 2, -bh / 2, 0, 0), b = v(bw / 2, -bh / 2, 1, 0), c = v(bw / 2, bh / 2, 1, 1), d = v(-bw / 2, bh / 2, 0, 1);
  pb.t(a, b, c); pb.t(a, c, d);
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0, emissiveMap: tex, emissive: 0x000000 });
  board.add(new THREE.Mesh(pb.build(), boardMat));
  const bb = new Builder();
  bb.addGeo(new THREE.BoxGeometry(bw + 0.03, bh + 0.03, 0.02), M4(0, 0, 0), RM.wood, C.wood);
  const gx = (i) => -bw / 2 + bw * (0.125 + i * 0.25), gy = bh * 0.05, gd = 0.085, keys = ['asi', 'alt', 'ai', 'vsi'];
  keys.forEach((k, i) => bb.addGeo(new THREE.TorusGeometry(gd / 2 + 0.004, 0.006, n(6), n(22)), M4(gx(i), gy, 0.016), RM.gold, C.gold));
  for (const sg of [-1, 1]) bb.addGeo(new THREE.SphereGeometry(0.018, n(8), n(6)), M4(sg * (bw / 2 + 0.02), bh / 2 + 0.01, 0.01), RM.gold, C.gold);
  const cpMat = pbrMaterial('throne-cockpit');
  board.add(new THREE.Mesh(bb.build(), cpMat));
  const inst = createInstruments({ quality });
  const gq = new Builder();
  keys.forEach((k, i) => {
    const [u0, v0, u1, v1] = inst.cells[k], r = gd / 2, x = gx(i), z = 0.014;
    const A = gq.v([x - r, gy - r, z], [0, 0, 1], [u0, v0]), Bq = gq.v([x + r, gy - r, z], [0, 0, 1], [u1, v0]);
    const Cq = gq.v([x + r, gy + r, z], [0, 0, 1], [u1, v1]), D = gq.v([x - r, gy + r, z], [0, 0, 1], [u0, v1]);
    gq.t(A, Bq, Cq); gq.t(A, Cq, D);
  });
  const gaugeMat = new THREE.MeshStandardMaterial({ map: inst.texture, emissiveMap: inst.texture, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0, alphaTest: 0.5 });
  {
    const m = document.createElement('canvas'); m.width = 256; m.height = 128;
    const mg = m.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, 256, 128); mg.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { mg.beginPath(); mg.arc(32 + i * 64, 32 + j * 64, 31.5, 0, 7); mg.fill(); }
    gaugeMat.alphaMap = new THREE.CanvasTexture(m);
  }
  const gauges = new THREE.Mesh(gq.build(), gaugeMat);
  gauges.name = 'gauges';
  board.add(gauges);
  inst.attach?.(gauges);
  group.add(board);
  // the orb throttle's quadrant on the left armrest
  B.addGeo(new THREE.CylinderGeometry(0.028, 0.032, 0.02, n(12)), M4(ORB.x, ORB.y - 0.005, ORB.s), RM.gold, C.gold);
  const stand = new THREE.Mesh(B.build(), cpMat);
  stand.name = 'lectern'; stand.receiveShadow = true;
  group.add(stand);

  // the sceptre: gilt rod, ruby collar, a jewelled orb on top (it is the control stick)
  const sb = new Builder();
  sb.addGeo(new THREE.CylinderGeometry(0.011, 0.014, 0.26, n(10)), M4(0, 0.13, 0), RM.gold, C.gold);
  sb.addGeo(new THREE.TorusGeometry(0.016, 0.006, n(6), n(12)), M4(0, 0.18, 0, 1, 1, 1, Math.PI / 2, 0, 0), RM.glass, C.ruby);
  sb.addGeo(new THREE.SphereGeometry(0.026, n(12), n(8)), M4(0, 0.28, 0), RM.gold, C.gold);
  sb.addGeo(new THREE.SphereGeometry(0.012, n(8), n(6)), M4(0, 0.31, 0), RM.glass, C.sapphire);
  const stickMesh = new THREE.Mesh(sb.build(), cpMat);
  stickMesh.name = 'stick';
  ctx.stick.add(stickMesh);
  const throttle = new THREE.Group();
  throttle.position.set(ORB.x, ORB.y, ORB.s);
  { const tb = new Builder(); tb.addGeo(new THREE.CylinderGeometry(0.007, 0.007, ORB.len, 8), M4(0, ORB.len / 2, 0), RM.gold, C.gold); tb.addGeo(new THREE.SphereGeometry(0.026, 12, 10), M4(0, ORB.len + 0.01, 0), RM.gold, C.gold); tb.addGeo(new THREE.TorusGeometry(0.027, 0.004, 6, 16), M4(0, ORB.len + 0.01, 0), RM.glass, C.sapphire); throttle.add(new THREE.Mesh(tb.build(), cpMat)); }
  group.add(throttle);

  function setNight(nn) { nn = Math.max(0, Math.min(1, nn)); gaugeMat.emissiveIntensity = 0.25 + nn * 0.8; boardMat.emissive.setRGB(0.6, 0.45, 0.25); boardMat.emissiveIntensity = nn * 0.35; }
  return {
    group, instruments: inst, setNight, setDetail() {},
    update(dt, cur) { throttle.rotation.x = (0.5 - cur.throttle) * 1.0; inst.update(dt); },
    dispose() { tex.dispose(); boardMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); cpMat.dispose(); inst.dispose(); stickMesh.geometry.dispose(); stickMesh.removeFromParent(); },
  };
}

const D2R = Math.PI / 180;
const MAX = { aileron: 24 * D2R, elevUp: 28 * D2R, elevDown: 24 * D2R, rudder: 28 * D2R };
export const THRONE_DIMS = { length: 2.9, span: 3.6, height: 2.6, gearHeight: CG.y };

export async function createThrone(opts = {}) {
  const st = { noz: 0, nozT: 0, fan: 0, fanT: 0 };
  const def = {
    id: 'throne', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.06, pitch: -0.12 },
    portrait: { center: [0, 0.06, 0.16], cockpit: [0, 0.05, 0.14], fov: 90, pitch: -0.16 },
    dims: { ...THRONE_DIMS }, lod: [200, 120], rpm: { idle: 0, max: 0 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createThroneLivery(q),
    createMaterials: (q, l) => createThroneMaterials(q, l),
    buildExterior: (q, mats) => buildThroneExterior(q, mats),
    buildCockpit: (q, mats, ctx) => buildThroneCockpit(q, mats, ctx),
    stick: { pos: [ARM.x, ARM.y + 0.03, ARM.s0 + 0.06], move(stick, cur) { stick.rotation.set(cur.elevator * 0.3, 0, -cur.aileron * 0.3); } },
    createPilot: (q, cfg, ctx) => {
      const av = createAviator({ quality: q, cfg, seat: SEAT, outfit: 'flyer', gripLocal: [0, 0.2, 0], elbowOut: 0.35, crownTilt: -0.05, leftHand: (cur) => orbKnob(cur.throttle) });
      // the backrest is right behind the royal neck: the scarf stays tucked in (its ribbon is the run of vertices the
      // aviator lays out at the origin in the scarf's colour; they are folded into the collar every frame)
      const pctx = { stick: ctx.stick, airspeed: 0, rpm: 0 }, sc = srgb('#5b2a86');
      let run = null;
      const find = () => {
        const g = av.mesh.geometry, P = g.attributes.position.array, Cc = g.attributes.color.array;
        let s0 = -1; run = null;
        for (let i = 0; i <= P.length / 3; i++) {
          const z = i < P.length / 3 && P[i * 3] === 0 && P[i * 3 + 1] === 0 && P[i * 3 + 2] === 0 && Math.abs(Cc[i * 3] - sc[0]) < 0.01;
          if (z) { if (s0 < 0) s0 = i; } else if (s0 >= 0) { if (!run || i - s0 > run[1]) run = [s0, i - s0]; s0 = -1; }
        }
      };
      const tuck = () => {
        if (!run) return;
        const P = av.mesh.geometry.attributes.position;
        for (let i = run[0]; i < run[0] + run[1]; i++) P.setXYZ(i, SEAT.x, SEAT.y + 0.5, SEAT.s + 0.02);
        P.needsUpdate = true;
      };
      find();
      return { get mesh() { return av.mesh; }, update: (dt, cur) => { av.update(dt, cur, pctx); tuck(); }, setHideBody: av.setHideBody, setConfig: (c) => { av.setConfig(c); find(); }, get config() { return av.config; }, dispose: av.dispose };
    },
    animate(ext, cur, dt, ctx) {
      const h = ext.hinges;
      h.ailR.rotation.x = -cur.aileron * MAX.aileron;
      h.ailL.rotation.x = cur.aileron * MAX.aileron;
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
      st.noz += (st.nozT - st.noz) * (1 - Math.exp(-dt * 2.5));
      const ang = (Math.PI / 2) * (0.5 - 0.5 * Math.cos(Math.PI * clamp(st.noz, 0, 1)));
      if (ext.nozzleGroup) ext.nozzleGroup.rotation.x = ang;
      if (ext.flameMesh) {
        const p = clamp(cur.throttle, 0, 1), k = ctx.wantCockpit === false ? 0.85 : 1;
        const len = (0.25 + 0.9 * p + 0.35 * st.noz) * (0.92 + 0.08 * Math.sin(performance.now() * 0.05));
        ext.flameMesh.scale.set(1, 1, len);
        ext.flameMesh.material.opacity = k * clamp(0.25 + 0.75 * p + 0.4 * st.noz, 0, 1);
        ext.flameMesh.visible = p > 0.02 || st.noz > 0.05;
      }
    },
  };
  const rig = await assembleRig(def, opts);
  rig.setNozzle = (v, immediate = false) => { st.nozT = clamp(+v || 0, 0, 1); if (immediate) st.noz = st.nozT; };
  rig.setLiftFan = (v) => { st.fanT = clamp(+v || 0, 0, 1); };
  rig.jetState = () => ({ nozzle: st.noz, nozzleDeg: 90 * st.noz, liftFan: st.fanT });
  rig.exhaust = (pos = new THREE.Vector3(), dir = new THREE.Vector3()) => {
    const a = (Math.PI / 2) * st.noz;
    pos.set(0, PACK.y - CG.y - Math.sin(a) * PACK.noz, PACK.pivot - CG.s + Math.cos(a) * PACK.noz);
    dir.set(0, -Math.sin(a), Math.cos(a));
    return { pos, dir };
  };
  rig.fxPoints = { exhaust: [0, PACK.y - CG.y, PACK.pivot + PACK.noz - CG.s], prop: [0, PACK.y - CG.y, PACK.pivot - CG.s], tail: [0, STAB.y - CG.y, STAB.te - CG.s] };
  return rig;
}
