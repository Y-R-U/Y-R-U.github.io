import * as THREE from 'three';
import { Builder, naca, airfoilLoop, sweepRings, streamline, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { createInstruments } from '../instruments.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan, noiseFill, contrast } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';

// The Royal Flying Bathtub: a cast-iron clawfoot slipper tub with stubby wings, a towel-rail tail boom, a brass
// propeller on the tap spout, a rubber-duck co-pilot and a bath-plug-chain antenna. Build frame: y = height above
// ground (ball feet on y = 0), z = station aft of the prop hub, x = right.
export const CG = { s: 2.05, y: 1.05 };
export const THRUST_Y = 1.42;
const TUB = { sc: 1.78, y0: 0.6, L0: 1.0, W0: 0.38, L1: 1.24, W1: 0.53, e: 2.7, wall: 0.05, floor: 0.68 };
const rimY = (s) => 1.43 + 0.2 * clamp((s - 1.9) / 1.1, 0, 1) ** 1.8;
export const WATER_Y = 1.1;
const FEET = [[-1, 0.92], [1, 0.92], [-1, 2.64], [1, 2.64]];
const BALL = 0.11;
export const SEAT = { x: 0, y: 1.08, s: 2.5 };
export const EYE = { x: 0, y: 1.77, s: 2.45, pitch: -0.17 };
const CADDY_S = 2.0, CADDY_Y = rimY(2.0) + 0.04;
export const WING = { root: 0.47, half: 2.75, y: 0.8, le: 1.36, rootC: 1.02, tipC: 0.72, dihedral: Math.tan((5 * Math.PI) / 180), ail: [1.35, 2.38], hinge: 0.74 };
export const STAB = { y: 1.66, half: 1.0, le: 4.86, hinge: 5.26, te: 5.5 };
export const FIN = { base: 1.66, top: 2.46, leBase: 4.8, leTop: 5.28, hinge: 5.42, teBase: 5.74, teTop: 5.6 };
const BOOM = [[0.2, rimY(2.95) - 0.02, 2.97], [0.13, 1.66, 4.9]];
const THROTTLE = { x: -0.5, y: rimY(2.25) + 0.02, s: 2.25 };

// plan point of the tub at fraction u (0 bottom .. 1 rim) and plan angle a (0 = front, pi/2 = right)
function tubPt(u, a, inset = 0) {
  const k = u < 0.07 ? Math.sqrt(Math.max(0, 1 - (1 - u / 0.07) ** 2)) : 1;
  const f = 1 - (1 - u) ** 1.6;
  const L = (lerp(TUB.L0, TUB.L1, f) - inset) * (0.82 + 0.18 * k), W = (lerp(TUB.W0, TUB.W1, f) - inset) * (0.8 + 0.2 * k);
  const cs = Math.cos(a), sn = Math.sin(a), e = 2 / TUB.e;
  const s = TUB.sc - L * Math.sign(cs) * Math.abs(cs) ** e;
  const x = W * Math.sign(sn) * Math.abs(sn) ** e;
  const y0 = inset ? TUB.floor : TUB.y0;
  return [x, lerp(y0, rimY(s) - (inset ? 0.01 : 0), u) - (u < 0.07 && !inset ? 0.04 * (1 - k) : 0), s];
}

// ---------- livery ----------
const REG = {
  tubL: { x0: 0, x1: 1, y0: 0, y1: 0.24, s0: 0.4, s1: 3.15, h0: 0.45, h1: 1.72, flip: false },
  tubR: { x0: 0, x1: 1, y0: 0.24, y1: 0.48, s0: 0.4, s1: 3.15, h0: 0.45, h1: 1.72, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.48, y1: 0.66, s0: 4.75, s1: 5.85, h0: 1.55, h1: 2.55, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.48, y1: 0.66, s0: 4.75, s1: 5.85, h0: 1.55, h1: 2.55, flip: true },
  wingT: { x0: 0, x1: 0.7, y0: 0.66, y1: 0.82, a0: -2.85, a1: 2.85, s0: 1.25, s1: 2.5, flip: false },
  wingB: { x0: 0, x1: 0.7, y0: 0.82, y1: 0.975, a0: -2.85, a1: 2.85, s0: 1.25, s1: 2.5, flip: true },
  tail: { x0: 0.7, x1: 1, y0: 0.66, y1: 0.975, a0: -1.1, a1: 1.1, s0: 4.75, s1: 5.6, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'gold', 'white', 'dark', 'primaryDark', 'black'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const GOLD = '#d4a743', GOLD_D = '#9c7424', GOLD_L = '#f3d27a';

function createBathLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  // metalness (B) + roughness (G): the gilt lines are real gold, the enamel glossy
  const mr = document.createElement('canvas'); mr.width = mr.height = 1024;
  const mrTex = new THREE.CanvasTexture(mr);
  const mctx = mr.getContext('2d');
  const MA = atlas(1024);
  const gilt = (c, fill) => { c.fillStyle = fill ?? (() => { const g = c.createLinearGradient(0, 1.7, 0, 0.5); g.addColorStop(0, GOLD_L); g.addColorStop(0.5, GOLD); g.addColorStop(1, GOLD_D); return g; })(); };

  // tub side art drawn twice: colour pass and a metal/rough mask pass (mask=true draws gilt as metal)
  function tubSide(c, T, L, mask) {
    const base = mask ? 'rgb(0,70,0)' : L.primary;
    const gold = mask ? 'rgb(0,60,255)' : null;
    c.fillStyle = base; c.fillRect(0, 0, 4, 2);
    if (!mask) {
      // soft enamel shading toward the base
      const g = c.createLinearGradient(0, 1.6, 0, 0.55);
      g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = g; c.fillRect(0, 0, 4, 2);
    }
    const band = (y0, y1) => { c.beginPath(); for (let s = 0.3; s <= 3.2; s += 0.05) c.lineTo(s, rimY(s) - y0); for (let s = 3.2; s >= 0.3; s -= 0.05) c.lineTo(s, rimY(s) - y1); c.closePath(); };
    // gilt bands under the roll rim and above the base, secondary panel between
    if (!mask) { c.fillStyle = L.secondary; band(0.1, 0.13); c.fill(); }
    mask ? (c.fillStyle = gold) : gilt(c); band(0.075, 0.098); c.fill(); band(0.135, 0.145); c.fill();
    c.fillRect(0, 0.7, 4, 0.03); c.fillRect(0, 0.75, 4, 0.008);
    // coachlining: a double gilt pinline panel with curled corners, like a state carriage
    if (mask) c.strokeStyle = gold; else { const g = c.createLinearGradient(0, 1.4, 0, 0.75); g.addColorStop(0, GOLD_L); g.addColorStop(1, GOLD_D); c.strokeStyle = g; }
    c.lineCap = 'round'; c.lineJoin = 'round';
    const panelPath = (inset) => {
      const x0 = 0.62 + inset, x1 = 2.93 - inset, yb = 0.8 + inset, top = (s) => rimY(s) - 0.2 - inset, r = 0.09;
      c.beginPath();
      c.moveTo(x0 + r, yb);
      c.lineTo(x1 - r, yb); c.quadraticCurveTo(x1, yb, x1, yb + r);
      c.lineTo(x1, top(x1) - r); c.quadraticCurveTo(x1, top(x1), x1 - r, top(x1 - r));
      for (let s = x1 - r; s >= x0 + r; s -= 0.05) c.lineTo(s, top(s));
      c.quadraticCurveTo(x0, top(x0), x0, top(x0) - r);
      c.lineTo(x0, yb + r); c.quadraticCurveTo(x0, yb, x0 + r, yb);
    };
    c.lineWidth = 0.016; panelPath(0); c.stroke();
    c.lineWidth = 0.006; panelPath(0.04); c.stroke();
    // corner curls
    c.lineWidth = 0.011;
    for (const [x, y, dx, dy] of [[0.62, 0.8, 1, 1], [2.93, 0.8, -1, 1], [0.62, rimY(0.62) - 0.2, 1, -1], [2.93, rimY(2.93) - 0.2, -1, -1]]) {
      c.beginPath(); c.moveTo(x + dx * 0.04, y + dy * 0.12); c.bezierCurveTo(x + dx * 0.04, y + dy * 0.2, x + dx * 0.16, y + dy * 0.2, x + dx * 0.15, y + dy * 0.12); c.bezierCurveTo(x + dx * 0.14, y + dy * 0.07, x + dx * 0.09, y + dy * 0.09, x + dx * 0.1, y + dy * 0.12); c.stroke();
      c.beginPath(); c.moveTo(x + dx * 0.12, y + dy * 0.04); c.bezierCurveTo(x + dx * 0.2, y + dy * 0.04, x + dx * 0.2, y + dy * 0.16, x + dx * 0.12, y + dy * 0.15); c.stroke();
    }
    if (mask) { c.fillStyle = gold; c.beginPath(); c.ellipse(1.22, 1.1, 0.2, 0.25, 0, 0, 7); c.fill(); return; }
    crest(c, T, 1.22, 1.1, 0.5, { field: shade(L.secondary, 0.75), field2: '#a3162a', gold: GOLD });
    const nameCol = pick(L.primary, [GOLD_L, GOLD, '#ffffff', '#14171c'], 2.2);
    A.text(c, T, L.display, 2.22, 1.2, 1.05, 0.2, { font: 'italic 700', family: "Georgia, 'Times New Roman', serif", fill: nameCol, stroke: contrast(nameCol, '#2a1d08') > 2.5 ? '#2a1d08' : null, strokeW: 6 });
    const regCol = pick(L.primary, ['#15181d', '#ffffff'], 4);
    A.text(c, T, L.registration, 2.22, 1.04, 0.6, 0.085, { font: '700', fill: regCol });
  }
  function paintFin(c, T, L, mask) {
    c.fillStyle = mask ? 'rgb(0,90,0)' : L.secondary; c.fillRect(4.5, 1.4, 2, 1.4);
    if (mask) return;
    c.fillStyle = L.accent; c.fillRect(FIN.hinge - 0.01, 1.4, 0.02, 1.4);
    crest(c, T, 5.27, 2.08, 0.42, { field: shade(L.primary, 0.85), field2: '#a3162a', gold: GOLD });
    const col = pick(L.secondary, [L.primary, '#ffffff', GOLD_L], 3);
    A.text(c, T, L.display, 5.3, 1.77, 0.75, 0.13, { fill: col, font: 'italic 700', family: "Georgia, 'Times New Roman', serif" });
  }
  function paintWing(c, T, L, top, mask) {
    c.fillStyle = mask ? 'rgb(0,80,0)' : L.primary; c.fillRect(-3, 1, 6, 2);
    if (mask) { c.fillStyle = 'rgb(0,60,255)'; for (const sg of [-1, 1]) c.fillRect(sg > 0 ? 2.46 : -2.5, 1, 0.04, 2); return; }
    c.fillStyle = L.secondary; c.fillRect(-3, 1, 6, 2);
    c.fillStyle = L.primary; c.fillRect(2.1, 1, 1, 2); c.fillRect(-3.1, 1, 1, 2);
    gilt(c); for (const sg of [-1, 1]) c.fillRect(sg > 0 ? 2.06 : -2.1, 1, 0.04, 2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.007;
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * WING.ail[0], WING.le + WING.hinge * 0.9); c.lineTo(sg * WING.ail[1], WING.le + WING.hinge * 0.8 + 0.08); c.stroke(); }
    const col = pick(L.secondary, ['#15181d', L.primary], 4);
    A.text(c, T, L.registration, top ? 1.3 : -1.3, 1.82, 1.4, 0.42, { font: '700', fill: col, plan: true });
  }
  function draw(L) {
    for (const [cc, AA, mask] of [[ctx, A, false], [mctx, MA, true]]) {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.fillStyle = mask ? 'rgb(0,90,0)' : '#000'; cc.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
      AA.region(cc, REG.tubL, AA.side(REG.tubL), (c, T) => tubSide(c, T, L, mask));
      AA.region(cc, REG.tubR, AA.side(REG.tubR), (c, T) => tubSide(c, T, L, mask));
      AA.region(cc, REG.finL, AA.side(REG.finL), (c, T) => paintFin(c, T, L, mask));
      AA.region(cc, REG.finR, AA.side(REG.finR), (c, T) => paintFin(c, T, L, mask));
      AA.region(cc, REG.wingT, AA.plan(REG.wingT), (c, T) => paintWing(c, T, L, true, mask));
      AA.region(cc, REG.wingB, AA.plan(REG.wingB), (c, T) => paintWing(c, T, L, false, mask));
      AA.region(cc, REG.tail, AA.plan(REG.tail), (c) => { c.fillStyle = mask ? 'rgb(0,90,0)' : L.primary; c.fillRect(-2, 4, 4, 2); if (!mask) { c.fillStyle = L.secondary; c.fillRect(-2, STAB.hinge, 4, 1); } });
      const W = cc.canvas.width, w = W / SW.length;
      const cols = mask ? { gold: 'rgb(0,60,255)' } : { primary: L.primary, secondary: L.secondary, accent: L.accent, gold: GOLD, white: '#f6f4ee', dark: '#202328', primaryDark: shade(L.primary, 0.8), black: '#0b0c0e' };
      SW.forEach((k, i) => { cc.fillStyle = cols[k] || 'rgb(0,90,0)'; cc.fillRect(i * w, W * 0.98, w, W * 0.02); });
    }
    texture.needsUpdate = true; mrTex.needsUpdate = true;
  }
  return { texture, mrTex, draw, owns: (t) => t === texture || t === mrTex, dispose() { texture.dispose(); mrTex.dispose(); } };
}

function createBathMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.mrTex, metalnessMap: livery.mrTex, roughness: 1, metalness: 1, envMapIntensity: 1.1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 1, clearcoatRoughness: 0.06 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('bath-trim', { envMapIntensity: 1.2 });
  const prop = pbrMaterial('bath-prop', { envMapIntensity: 1.2 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, disc, lights, beacon];
  return { paint, trim, prop, disc, lights, beacon, all: () => list };
}

const C = {
  gold: srgb(GOLD), goldD: srgb(GOLD_D), chrome: srgb('#d9dde1'), enamel: srgb('#f7f5ef'), enamelShade: srgb('#e4e0d6'),
  water: srgb('#8fc3cf'), foamShade: srgb('#dfe9ec'), waterDeep: srgb('#5e9fb0'), foam: srgb('#fbfbf8'), rubber: srgb('#141416'), plug: srgb('#1b1b1d'),
  hot: srgb('#c0262b'), cold: srgb('#2457c5'), porcelain: srgb('#f4f1ea'), towel: srgb('#f3efe4'), towelStripe: srgb('#b3202e'),
  wood: srgb('#5d3018'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7], soap: srgb('#f2c8d6'), candle: srgb('#efe6cf'),
};

export function buildBathExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder();
  const swP = () => sw('primary'), swG = () => sw('gold');
  const NA = T.n(40, 10), NU = T.i(10, 3);
  const us = [0, 0.012, 0.03, 0.05, 0.07]; for (let k = 1; k <= NU; k++) us.push(0.07 + 0.93 * (k / NU));
  // outer shell (livery), right half then left so the side regions never blend
  const half = (a0, a1) => us.map((u) => { const r = []; for (let j = 0; j <= NA / 2; j++) r.push(tubPt(u, lerp(a0, a1, j / (NA / 2)))); return r; });
  const sideUV = (p) => uvSide(p[0] >= 0 ? REG.tubR : REG.tubL, p[2], p[1]);
  body.loft(half(0, Math.PI), { closed: false, out: (p) => [p[0], 0, p[2] - TUB.sc], uv: sideUV });
  body.loft(half(Math.PI, 2 * Math.PI), { closed: false, out: (p) => [p[0], 0, p[2] - TUB.sc], uv: sideUV });
  { const ring = []; for (let j = 0; j < NA; j++) ring.push(tubPt(0, (j / NA) * Math.PI * 2)); fan(body, ring, [0, -1, 0], sw('primaryDark')); }
  // inner enamel + floor
  const iu = [0, 0.04, 0.12, 0.3, 0.55, 0.8, 1].filter((u, i) => T.detail || i % 2 === 0 || u === 1);
  const inner = iu.map((u) => { const r = []; for (let j = 0; j < NA; j++) r.push(tubPt(u, (j / NA) * Math.PI * 2, TUB.wall)); return r; });
  trim.loft(inner, { out: (p) => [-(p[0]), 0, -(p[2] - TUB.sc)], color: (p) => (p[1] < WATER_Y ? C.enamelShade : C.enamel), uv: () => RM.enamel });
  fan(trim, inner[0], [0, 1, 0], RM.enamel, C.enamelShade);
  // gilded roll rim
  {
    const path = []; const N = T.n(56, 12);
    for (let j = 0; j <= N + 1; j++) { const a = (j / N) * Math.PI * 2, o = tubPt(1, a), i = tubPt(1, a, TUB.wall); path.push([(o[0] + i[0]) / 2, (o[1] + i[1]) / 2 + 0.012, (o[2] + i[2]) / 2]); }
    trim.loft(sweepRings(path, circle(T.n(12, 4), 0.042).map(([x, y]) => [x, y * 0.9])), { color: C.gold, uv: () => RM.gold });
  }
  // water with soap foam
  {
    const ring = []; for (let j = 0; j < NA; j++) { const a = (j / NA) * Math.PI * 2; let u = 0.5; for (let it = 0; it < 6; it++) { const p = tubPt(u, a, TUB.wall); u += (WATER_Y - p[1]) / (rimY(p[2]) - TUB.floor); } const p = tubPt(u, a, TUB.wall); ring.push([p[0] * 0.995, WATER_Y, p[2] + (TUB.sc - p[2]) * 0.005]); }
    fan(trim, ring, [0, 1, 0], RM.water, C.water);
    if (T.detail) {
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const NF = T.high ? 26 : 12;
      for (let i = 0; i < NF; i++) {
        const a = rnd() * Math.PI * 2, rr = 0.2 + 0.62 * Math.sqrt(rnd());
        const p = tubPt(0.5, a, TUB.wall + 0.1);
        const x = p[0] * rr, s = TUB.sc + (p[2] - TUB.sc) * rr;
        const r = 0.035 + rnd() * 0.045;
        for (let k = 0; k < 3; k++) {
          const ox = (rnd() - 0.5) * r * 2.2, oz = (rnd() - 0.5) * r * 2.2, rk = r * (0.55 + 0.45 * rnd());
          trim.addGeo(new THREE.SphereGeometry(1, T.high ? 10 : 7, T.high ? 5 : 3, 0, Math.PI * 2, 0, Math.PI / 2), M4(x + ox, WATER_Y - 0.008, s + oz, rk * 1.25, rk * 0.8, rk * 1.15), RM.foam, (p) => (p[1] > WATER_Y + rk * 0.45 ? C.foam : C.foamShade));
        }
      }
    }
  }
  // claw-and-ball feet (the balls are the wheels)
  for (const [sg, s] of FEET) {
    const top = [sg * 0.31, TUB.y0 + 0.05, s], ball = [sg * 0.43, BALL, s + (s < 1.5 ? -0.06 : 0.06)];
    const knee = [sg * 0.47, 0.44, lerp(top[2], ball[2], 0.4)], ankle = [sg * 0.44, BALL * 2.05, ball[2]];
    const path = []; const K = T.i(12, 4);
    for (let k = 0; k <= K; k++) {
      const t = k / K, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      path.push([0, 1, 2].map((i) => a * top[i] + b * knee[i] + c * ankle[i] + d * (ankle[i] + (i === 1 ? -0.04 : 0))));
    }
    const rad = (t) => 0.034 + 0.05 * (1 - t) ** 2.2 + 0.03 * Math.exp(-(((t - 0.45) / 0.12) ** 2)) * 0.5 + (t > 0.8 ? 0.03 * ((t - 0.8) / 0.2) : 0);
    trim.loft(sweepRings(path, circle(T.n(12, 4), 1), { scale: (i, n) => rad(i / (n - 1)) }), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
    // acanthus cap where the leg meets the tub
    trim.addGeo(new THREE.SphereGeometry(1, T.n(12, 4), T.n(8, 3)), M4(top[0], top[1] + 0.01, top[2], 0.11, 0.06, 0.1), RM.gold, C.gold);
    trim.addGeo(new THREE.SphereGeometry(BALL, T.n(16, 6), T.n(10, 4)), M4(...ball), RM.rubber, C.rubber);
    if (T.detail) for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, cl = [];
      for (let j = 0; j <= 4; j++) { const t = j / 4, ang = 0.3 + t * 1.9; cl.push([ball[0] + Math.cos(a) * Math.sin(ang) * (BALL + 0.012), ball[1] + Math.cos(ang) * (BALL + 0.012), ball[2] + Math.sin(a) * Math.sin(ang) * (BALL + 0.012)]); }
      trim.loft(sweepRings(cl, circle(6, 1), { scale: (i, n) => 0.018 * (1 - (i / (n - 1)) * 0.7) }), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
    }
  }

  // ---------- wings ----------
  const foil = naca(0.03, 0.4, 0.15), nC = T.n(18, 6);
  const wsec = (x) => {
    const ax = Math.abs(x), k = clamp((ax - WING.root) / (WING.half - WING.root), 0, 1);
    let c = lerp(WING.rootC, WING.tipC, k), le = WING.le + (WING.rootC - c) * 0.3, thk = 1, y = WING.y + (ax - WING.root) * WING.dihedral;
    const tip = WING.half - 0.18;
    if (ax > tip) { const q = (ax - tip) / 0.18; le += 0.18 * q * q; c -= 0.24 * q * q; thk = Math.sqrt(Math.max(0.04, 1 - q * q)); }
    return { le, c: Math.max(0.03, c), y, thk };
  };
  const panel = (B, xs, f0, f1, round, caps = [true, true]) => {
    const { loop, topCount } = airfoilLoop(foil, nC, f0, f1, round);
    const top = topCount - 1 + (f0 > 0 && round ? 3 : 0);
    B.loft(xs.map((x) => { const w = wsec(x); return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk, w.le + xc * w.c]); }), {
      out: () => [0, 1, 0], splits: [[0, top, (p) => uvPlan(REG.wingT, p[0], p[2])], [top, loop.length, (p) => uvPlan(REG.wingB, p[0], p[2])]],
      capStart: caps[0], capEnd: caps[1], capUV: swP,
    });
  };
  const sp = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const pieces = {};
  const H = WING.hinge;
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg);
    const r0 = WING.root - 0.08;
    panel(body, S(sp(r0, WING.ail[0], T.i(3, 1))), 0, 1, false);
    panel(body, S(sp(WING.ail[0], WING.ail[1], T.i(4, 2))), 0, H, false);
    const tipX = sp(WING.ail[1], WING.half - 0.18, 1); for (let k = 1; k <= T.i(5, 2); k++) tipX.push(WING.half - 0.18 + 0.18 * (k / T.i(5, 2)));
    panel(body, S(tipX), 0, 1, false);
    const B = new Builder(), a = WING.ail[0] + 0.012, b = WING.ail[1] - 0.012;
    panel(B, S(sp(a, b, T.i(4, 2))), H + 0.006, 1, true);
    const hp = (x) => { const w = wsec(x), [yu, yl] = foil(H + 0.012); return [x, w.y + ((yu + yl) / 2) * w.c, w.le + (H + 0.012) * w.c]; };
    pieces[sg > 0 ? 'ailR' : 'ailL'] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
    // gilded root fairing ring + wingtip finial
    const w0 = wsec(sg * (WING.root - 0.02));
    const fair = []; for (let k = 0; k <= T.n(16, 8); k++) { const t = k / T.n(16, 8); const [yu, yl] = foil(t); fair.push([sg * (WING.root - 0.02), w0.y + yu * w0.c + 0.012, w0.le + t * w0.c]); }
    for (let k = T.n(16, 8); k >= 0; k--) { const t = k / T.n(16, 8); const [, yl] = foil(t); fair.push([sg * (WING.root - 0.02), w0.y + yl * w0.c - 0.012, w0.le + t * w0.c]); }
    if (!T.lod2) trim.loft(sweepRings(fair, circle(T.n(6, 4), 0.016), { upHint: [1, 0, 0] }), { color: C.gold, uv: () => RM.gold });
    const wt = wsec(sg * (WING.half - 0.05));
    trim.addGeo(new THREE.SphereGeometry(0.035, T.n(10, 4), T.n(8, 3)), M4(sg * (WING.half - 0.03), wt.y, wt.le + wt.c * 0.45, 1, 0.8, 2.4), RM.gold, C.gold);
  }

  // ---------- towel-rail boom, towel, tail ----------
  const rails = [];
  for (const sg of [1, -1]) {
    const a = [sg * BOOM[0][0], BOOM[0][1], BOOM[0][2]], b = [sg * BOOM[1][0], BOOM[1][1], BOOM[1][2]];
    const path = []; const K = T.i(8, 3);
    for (let k = 0; k <= K; k++) { const t = k / K; path.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(t * Math.PI) * 0.05, lerp(a[2], b[2], t)]); }
    trim.loft(sweepRings(path, circle(T.n(10, 4), 0.045)), { color: C.gold, uv: () => RM.gold, capStart: true, capEnd: true });
    rails.push(path);
    // rail mounting rose on the rim
    if (!T.far) trim.addGeo(new THREE.CylinderGeometry(0.055, 0.065, 0.04, T.n(14, 8)), M4(a[0], a[1] - 0.01, a[2] - 0.02, 1, 1, 1, -0.5, 0, 0), RM.gold, C.gold);
  }
  for (const t of (T.detail ? [0.3, 0.55, 0.8] : [0.55])) {
    const K = rails[0].length - 1, i = Math.round(t * K);
    rod(trim, rails[0][i], rails[1][i], 0.017, T.n(8, 4), RM.gold, C.gold);
    if (T.detail) for (const r of rails) trim.addGeo(new THREE.SphereGeometry(0.03, 8, 6), M4(...r[i]), RM.gold, C.gold);
  }
  if (!T.lod2) {
    // towel draped over the rails, hanging straight down both sides
    const ts = 3.5, tw = 0.36, k = rails[0].length - 1, i = Math.round(((ts - BOOM[0][2]) / (BOOM[1][2] - BOOM[0][2])) * k);
    const yTop = rails[0][i][1] + 0.034, hx = Math.abs(rails[0][i][0]) + 0.036;
    const hang = [-0.3, -0.27, -0.262, -0.25, -0.235, -0.215, -0.2, -0.15, -0.09, -0.04];
    const prof = [...hang.map((dy) => [-hx + dy * 0.05, dy]), [-hx + 0.02, 0.0], [-hx * 0.5, -0.01], [0, -0.015], [hx * 0.5, -0.01], [hx - 0.02, 0.0], ...hang.slice().reverse().map((dy) => [hx - dy * 0.05, dy])];
    const rows = prof.map(([x, dy]) => [-0.5, -0.3, 0, 0.3, 0.5].map((f) => [x + (Math.abs(x) > hx - 0.01 ? Math.sign(x) * 0.018 * Math.sin(f * 9) * Math.min(1, -dy * 6) : 0), yTop + dy, ts + f * tw * (1 + Math.max(0, -dy - 0.1) * 0.25)]));
    const tb = new Builder();
    tb.loft(rows, { closed: false, out: () => [0, 1, 0], color: (p) => { const d = yTop - p[1]; return d > 0.2 && d < 0.235 || d > 0.25 && d < 0.262 ? C.towelStripe : C.towel; }, uv: () => RM.cloth });
    for (let j = 0, n0 = tb.idx.length; j < n0; j += 3) tb.idx.push(tb.idx[j], tb.idx[j + 2], tb.idx[j + 1]);
    trim.append(tb);
  }
  const sym = naca(0, 0.4, 0.1);
  const stabSec = (x) => { const ax = Math.abs(x), k = clamp((ax - (STAB.half - 0.25)) / 0.25, 0, 1); return { le: STAB.le + 0.05 * ax + 0.2 * k * k, te: STAB.te - 0.08 * k ** 2, thk: Math.sqrt(Math.max(0.05, 1 - k ** 2.5)) }; };
  const tring = (x, f0, f1, round) => {
    const s = stabSec(x), c = s.te - s.le, fh = (STAB.hinge - s.le) / c;
    const { loop } = airfoilLoop(sym, T.n(12, 6), f0 === 'h' ? fh + 0.012 : f0, f1 === 'h' ? fh : f1, round);
    return loop.map(([xc, yv]) => [x, STAB.y + yv * c * s.thk, s.le + xc * c]);
  };
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  const sx = []; { const K = T.n(10, 4); for (let k = 0; k <= K; k++) sx.push(-STAB.half + 2 * STAB.half * (0.5 - 0.5 * Math.cos(Math.PI * k / K))); }
  body.loft(sx.map((x) => tring(x, 0, 'h', false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  const elev = new Builder();
  for (const sg of [1, -1]) { const xs = sx.filter((x) => x * sg >= 0.05); if (sg > 0) xs.unshift(0.05); else xs.push(-0.05); elev.loft(xs.map((x) => tring(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP }); }
  pieces.elevator = { B: elev, a: [-1, STAB.y, STAB.hinge + 0.01], b: [1, STAB.y, STAB.hinge + 0.01] };
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  const finAt = (y) => { const t = clamp((y - FIN.base) / (FIN.top - FIN.base), 0, 1); return { le: lerp(FIN.leBase, FIN.leTop, t ** 0.8), hinge: FIN.hinge, te: lerp(FIN.teBase, FIN.teTop, t) - (t > 0.62 ? 0.17 * (1 - Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2))) : 0) }; };
  {
    const K = T.i(8, 3), R = [];
    for (let k = 0; k <= K; k++) { const y = lerp(FIN.base - 0.04, FIN.top, k / K), f = finAt(y), c = f.hinge - 0.01 - f.le, top = y > FIN.top - 0.08 ? Math.sqrt(Math.max(0.05, 1 - ((y - (FIN.top - 0.08)) / 0.08) ** 2)) : 1; const { loop } = airfoilLoop(sym, T.n(12, 6), 0, 1, false); R.push(loop.map(([xc, yv]) => [yv * c * top, y, f.le + xc * c])); }
    body.loft(R, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    const rud = new Builder(), RR = [];
    for (let k = 0; k <= K; k++) { const y = lerp(FIN.base - 0.02, FIN.top - 0.06, k / K), f = finAt(y), c = Math.max(0.04, f.te - f.hinge - 0.012); const { loop } = airfoilLoop(sym, T.n(12, 6), 0, 1, false); RR.push(loop.map(([xc, yv]) => [yv * c * 1.4, y, f.hinge + 0.012 + xc * c])); }
    rud.loft(RR, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    pieces.rudder = { B: rud, a: [0, FIN.base, FIN.hinge + 0.01], b: [0, FIN.top, FIN.hinge + 0.01] };
    // boom-to-tail gold fittings + finial
    for (const sg of [1, -1]) trim.addGeo(new THREE.SphereGeometry(0.05, T.n(10, 4), T.n(8, 3)), M4(sg * BOOM[1][0], BOOM[1][1], BOOM[1][2], 1, 1, 1.6), RM.gold, C.gold);
    rod(trim, [-BOOM[1][0], BOOM[1][1], BOOM[1][2]], [BOOM[1][0], BOOM[1][1], BOOM[1][2]], 0.03, 8, RM.gold, C.gold);
  }

  // ---------- taps, gooseneck spout, plug-chain antenna ----------
  const tapStart = trim.count;
  const front = tubPt(1, 0);
  const tapS = front[2] + 0.08, tapY = rimY(tapS) + 0.04;
  for (const sg of [1, -1]) {
    rod(trim, [sg * 0.12, tapY - 0.04, tapS], [sg * 0.12, tapY + 0.14, tapS], 0.022, T.n(10, 4), RM.chrome, C.chrome);
    if (!T.far) trim.addGeo(new THREE.CylinderGeometry(0.04, 0.05, 0.03, T.n(12, 6)), M4(sg * 0.12, tapY - 0.02, tapS), RM.chrome, C.chrome);
    // cross-head handle with porcelain HOT/COLD button
    const hy = tapY + 0.22;
    if (T.far) continue;
    rod(trim, [sg * 0.12, tapY + 0.14, tapS], [sg * 0.12, hy, tapS], 0.016, 8, RM.chrome, C.chrome);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.785; rod(trim, [sg * 0.12, hy, tapS], [sg * 0.12 + Math.cos(a) * 0.08, hy + 0.01, tapS + Math.sin(a) * 0.08], 0.011, 6, RM.chrome, C.chrome); trim.addGeo(new THREE.SphereGeometry(0.017, 8, 6), M4(sg * 0.12 + Math.cos(a) * 0.08, hy + 0.01, tapS + Math.sin(a) * 0.08), RM.chrome, C.chrome); }
    trim.addGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.016, T.n(12, 6)), M4(sg * 0.12, hy + 0.02, tapS), RM.enamel, C.porcelain);
    trim.addGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 10), M4(sg * 0.12, hy + 0.022, tapS), RM.enamel, sg > 0 ? C.cold : C.hot);
  }
  rod(trim, [-0.13, tapY + 0.12, tapS], [0.13, tapY + 0.12, tapS], 0.03, T.n(12, 4), RM.chrome, C.chrome);
  const spout = [[0, tapY + 0.12, tapS], [0, tapY + 0.3, tapS - 0.04], [0, tapY + 0.33, tapS - 0.2], [0, THRUST_Y + 0.1, 0.32], [0, THRUST_Y + 0.01, 0.22], [0, THRUST_Y, 0.13]];
  {
    const sm = []; for (let i = 0; i < spout.length - 1; i++) for (let k = 0; k < 4; k++) { const t = k / 4; sm.push([0, lerp(spout[i][1], spout[i + 1][1], t), lerp(spout[i][2], spout[i + 1][2], t)]); } sm.push(spout[spout.length - 1]);
    const sm2 = sm.map((p, i) => (i > 0 && i < sm.length - 1 ? [0, (sm[i - 1][1] + p[1] * 2 + sm[i + 1][1]) / 4, (sm[i - 1][2] + p[2] * 2 + sm[i + 1][2]) / 4] : p));
    trim.loft(sweepRings(sm2, circle(T.n(12, 4), 0.046), { scale: (i, n) => 1 + 0.4 * (i / (n - 1)) ** 3 }), { color: C.chrome, uv: () => RM.chrome, capStart: true, capEnd: true });
  }
  if (!T.far) trim.addGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.05, T.n(16, 8)), M4(0, THRUST_Y, 0.15, 1, 1, 1, Math.PI / 2, 0, 0), RM.gold, C.gold);
  const tapEnd = trim.count;
  // bath plug on its chain, standing up like a whip aerial
  const chainBase = (() => { const p = tubPt(1, Math.PI * 1.22); return [p[0] * 0.95, p[1] + 0.04, p[2]]; })();
  if (!T.far) {
    const N = T.high ? 26 : 12, len = 0.62;
    for (let i = 0; i < N; i++) {
      const t = i / N, p = [chainBase[0] - 0.02 * t, chainBase[1] + len * t, chainBase[2] + 0.06 * t * t];
      trim.addGeo(new THREE.TorusGeometry(0.011, 0.003, 4, T.high ? 8 : 5), M4(...p, 1, 1.5, 1, 0, i % 2 ? Math.PI / 2 : 0, 0), RM.chrome, C.chrome);
    }
    trim.addGeo(new THREE.CylinderGeometry(0.03, 0.04, 0.05, T.n(12, 6)), M4(chainBase[0] - 0.02, chainBase[1] + len + 0.03, chainBase[2] + 0.06), RM.rubber, C.plug);
    trim.addGeo(new THREE.TorusGeometry(0.012, 0.004, 4, 8), M4(chainBase[0] - 0.02, chainBase[1] + len + 0.065, chainBase[2] + 0.06), RM.chrome, C.chrome);
    trim.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M4(...chainBase), RM.chrome, C.chrome);
  }
  // overflow + drain escutcheons on the inside of the back end, soap dish on the rim
  if (T.detail) {
    const back = tubPt(0.75, Math.PI, TUB.wall - 0.005);
    trim.addGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), M4(back[0], back[1], back[2], 1, 1, 1, Math.PI / 2 - 0.3, 0, 0), RM.chrome, C.chrome);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
    const w = wsec(sg * (WING.half - 0.02));
    const p = [sg * (WING.half + 0.01), w.y, w.le + w.c * 0.2];
    lights.addGeo(new THREE.SphereGeometry(0.028, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const p = [0, FIN.base + 0.12, finAt(FIN.base + 0.12).te + 0.01]; lights.addGeo(new THREE.SphereGeometry(0.022, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  const beaconPos = [0, FIN.top + 0.04, finAt(FIN.top - 0.05).le + 0.12];
  const beaconGeo = new Builder();
  beaconGeo.addGeo(new THREE.SphereGeometry(0.04, T.n(12, 4), T.n(8, 3)), M4(...beaconPos), [0, 0]);
  trim.addGeo(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 10), M4(beaconPos[0], beaconPos[1] - 0.04, beaconPos[2]), RM.gold, C.gold);
  lightPts.push({ p: beaconPos, col: [1, 0.1, 0.05], kind: 'beacon' });

  // ---------- brass propeller on the spout, rose-head spinner ----------
  const prop = new Builder();
  {
    const PR = 0.78;
    const sp = []; const K = T.i(10, 4);
    for (let k = 0; k <= K; k++) { const u = k / K; sp.push([-0.17 * (1 - u), 0.075 * Math.sqrt(1 - (1 - u) ** 2) + 0.01]); }
    const spin = sp.map(([z, r]) => circle(T.n(20, 8), r).map(([x, y]) => [x, y, z]));
    prop.loft(spin, { out: (p) => [p[0], p[1], 0], color: C.gold, uv: () => RM.gold, capEnd: true });
    if (T.detail) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; prop.addGeo(new THREE.SphereGeometry(0.008, 6, 4), M4(Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.15), RM.gold, C.goldD); }
    const pfoil = (t) => naca(0.04, 0.4, t);
    const rs = []; const R = T.i(12, 4);
    for (let k = 0; k <= R; k++) rs.push(lerp(0.07, PR, k / R));
    rs.splice(rs.length - 1, 0, PR - 0.02);
    for (let b = 0; b < 3; b++) {
      const rot = (b / 3) * Math.PI * 2, rings = [];
      for (const r of rs) {
        const u = (r - 0.07) / (PR - 0.07);
        let c = 0.1 + 0.08 * Math.sin(Math.PI * Math.min(1, u * 1.1)) - 0.02 * u;
        if (r > PR - 0.06) c *= Math.sqrt(Math.max(0.1, 1 - ((r - (PR - 0.06)) / 0.062) ** 2));
        const t = lerp(0.3, 0.08, Math.min(1, u * 1.3)), phi = Math.atan(1.1 / (2 * Math.PI * Math.max(0.1, r)));
        const sweep = 0.06 * u * u;
        const { loop } = airfoilLoop(pfoil(t), T.n(10, 4), 0, 1, false);
        const cp = Math.cos(phi), spp = Math.sin(phi);
        rings.push(loop.map(([xc, yv]) => {
          const a = (xc - 0.4) * c - sweep, bb = yv * c;
          const x = -cp * a - spp * bb, z = spp * a - cp * bb - 0.06;
          return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z];
        }));
      }
      prop.loft(rings, { out: () => [0, 0, -1], capStart: true, capEnd: true, color: C.gold, uv: () => RM.brass });
    }
  }

  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  meshes.beacon = mkMesh('beacon', beaconGeo, mats.beacon, { cast: false, receive: false }); group.add(meshes.beacon);
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  const propGroup = new THREE.Group();
  propGroup.position.set(0, THRUST_Y, 0.08);
  const propMesh = new THREE.Mesh(prop.build(), mats.prop);
  propMesh.name = 'prop'; propMesh.castShadow = true;
  propGroup.add(propMesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.78, T.n(48, 16)), mats.disc);
  disc.position.z = -0.06; disc.renderOrder = 3; disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, taps: [tapStart, tapEnd] };
}

// ---------- 'cockpit': a gilded bath caddy across the tub carrying the gauges, back-brush stick, hot-tap throttle ----------
function caddyCanvas(quality) {
  const W = quality === 'low' ? 512 : 1024, H = W / 4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const wood = g.createLinearGradient(0, 0, 0, H); wood.addColorStop(0, '#5a2c14'); wood.addColorStop(1, '#3e1d0c');
  g.fillStyle = wood; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 30},25,${0.05 + Math.random() * 0.08})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 4, W * 0.7, y - 6, W, y + 2); g.stroke(); }
  noiseFill(g, 0, 0, W, H, 3000 * (W / 1024), 0.1);
  g.strokeStyle = GOLD; g.lineWidth = W * 0.006; g.strokeRect(W * 0.01, H * 0.04, W * 0.98, H * 0.92);
  g.fillStyle = '#f0e6c8'; g.font = `italic 700 ${W * 0.022}px Georgia, serif`; g.textAlign = 'center';
  const labels = ['AIRSPEED', 'ALTITUDE', 'HORIZON', 'PROP REVS', 'BATHWATER'];
  labels.forEach((l, i) => g.fillText(l, W * (0.1 + i * 0.2), H * 0.93));
  return canvasTexture(c);
}
const CADDY = { w: 1.04, h: 0.16, gauges: ['asi', 'alt', 'ai', 'tach', 'fuel'] };

function buildBathCockpit(quality, mats, ctx) {
  const high = quality === 'high';
  const group = new THREE.Group();
  const B = new Builder();
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const s = CADDY_S, y = CADDY_Y, half = CADDY.w / 2;
  // two gilt rails resting on the rim, slatted rack, a walnut instrument board tilted toward the bather
  for (const dz of [-0.09, 0.09]) rod(B, [-half - 0.04, y, s + dz], [half + 0.04, y, s + dz], 0.012, n(8), RM.gold, C.gold);
  if (high) for (let i = -4; i <= 4; i++) if (Math.abs(i) > 2) rod(B, [i * 0.11, y + 0.005, s - 0.09], [i * 0.11, y + 0.005, s + 0.09], 0.006, 6, RM.gold, C.gold);
  for (const sg of [-1, 1]) B.addGeo(new THREE.BoxGeometry(0.04, 0.03, 0.22), M4(sg * (half + 0.02), y - 0.015, s), RM.gold, C.gold);
  // soap on one end, a candle on the other
  B.addGeo(new THREE.BoxGeometry(0.1, 0.035, 0.06), M4(0.4, y + 0.03, s + 0.02), RM.leather, C.soap);
  if (high) { B.addGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10), M4(-0.42, y + 0.055, s + 0.03), RM.cloth, C.candle); B.addGeo(new THREE.ConeGeometry(0.006, 0.02, 6), M4(-0.42, y + 0.11, s + 0.03), RM.cloth, srgb('#ffb347')); }
  const tilt = -1.0;
  const board = new THREE.Group();
  board.position.set(0, y + 0.0, s + 0.03);
  board.rotation.x = tilt;
  const boardTex = caddyCanvas(quality);
  const bw = 0.62, bh = 0.155;
  const pb = new Builder();
  const v = (x, yy, u, vv) => pb.v([x, yy, 0.012], [0, 0, 1], [u, vv]);
  const a = v(-bw / 2, 0, 0, 0), b = v(bw / 2, 0, 1, 0), c = v(bw / 2, bh, 1, 1), d = v(-bw / 2, bh, 0, 1);
  pb.t(a, b, c); pb.t(a, c, d);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.35, metalness: 0, emissiveMap: boardTex, emissive: 0x000000 });
  const boardMesh = new THREE.Mesh(pb.build(), boardMat);
  board.add(boardMesh);
  const bb = new Builder();
  bb.addGeo(new THREE.BoxGeometry(bw + 0.03, bh + 0.03, 0.02), M4(0, bh / 2, 0), RM.wood, C.wood);
  const gx = (i) => -bw / 2 + bw * (0.1 + i * 0.2), gy = bh * 0.55, gd = 0.088;
  CADDY.gauges.forEach((k, i) => bb.addGeo(new THREE.TorusGeometry(gd / 2 + 0.004, 0.006, n(6), n(22)), M4(gx(i), gy, 0.016), RM.gold, C.gold));
  for (const sg of [-1, 1]) bb.addGeo(new THREE.BoxGeometry(0.018, 0.14, 0.018), M4(sg * (bw / 2 - 0.02), -0.06, 0.0, 1, 1, 1, -tilt, 0, 0), RM.gold, C.gold);
  const cpMat = pbrMaterial('bath-cockpit');
  board.add(new THREE.Mesh(bb.build(), cpMat));
  const inst = createInstruments({ quality });
  const gq = new Builder();
  CADDY.gauges.forEach((k, i) => {
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
  const caddy = new THREE.Mesh(B.build(), cpMat);
  caddy.name = 'caddy'; caddy.receiveShadow = true; caddy.castShadow = high;
  group.add(caddy);

  // back-brush control column: gilt handle, bristle head as the grip
  const sb = new Builder();
  sb.addGeo(new THREE.CylinderGeometry(0.016, 0.02, 0.56, n(10)), M4(0, 0.28, 0), RM.varnish, C.wood);
  sb.addGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.05, n(12)), M4(0, 0.5, 0), RM.gold, C.gold);
  sb.addGeo(new THREE.SphereGeometry(0.035, n(12), n(8)), M4(0, 0.6, 0, 1, 1.6, 0.8), RM.varnish, C.wood);
  if (high) for (let i = 0; i < 18; i++) { const yy = 0.55 + (i % 6) * 0.02, xx = ((i / 6) | 0) * 0.02 - 0.02; sb.addGeo(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), M4(xx, yy, 0.03, 1, 1, 1, Math.PI / 2, 0, 0), RM.cloth, srgb('#e8dcc0')); }
  const stickMesh = new THREE.Mesh(sb.build(), cpMat);
  stickMesh.name = 'stick';
  ctx.stick.add(stickMesh);
  // throttle: a gilt lever on the left rim with a red porcelain knob
  const throttle = new THREE.Group();
  throttle.position.set(THROTTLE.x, THROTTLE.y, THROTTLE.s);
  { const tb = new Builder(); tb.addGeo(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 10), M4(0, -0.01, 0), RM.gold, C.gold); tb.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), M4(0, 0.08, 0), RM.gold, C.gold); tb.addGeo(new THREE.SphereGeometry(0.022, 10, 8), M4(0, 0.165, 0), RM.enamel, C.hot); throttle.add(new THREE.Mesh(tb.build(), cpMat)); }
  group.add(throttle);

  function setNight(nn) {
    nn = Math.max(0, Math.min(1, nn));
    gaugeMat.emissiveIntensity = 0.25 + nn * 0.8;
    boardMat.emissive.setRGB(0.6, 0.45, 0.25); boardMat.emissiveIntensity = nn * 0.35;
  }
  const detail = [];
  return {
    group, instruments: inst, setNight, setDetail(on) { for (const o of detail) o.visible = on; },
    update(dt, cur) { throttle.rotation.x = (0.5 - cur.throttle) * 1.0; inst.update(dt); },
    dispose() { boardTex.dispose(); boardMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); cpMat.dispose(); inst.dispose(); stickMesh.geometry.dispose(); stickMesh.removeFromParent(); },
  };
}
const throttleKnob = (th) => { const a = (0.5 - th) * 1.0; return [THROTTLE.x, THROTTLE.y + Math.cos(a) * 0.165, THROTTLE.s + Math.sin(a) * 0.165]; };

const D2R = Math.PI / 180;
const MAX = { aileron: 22 * D2R, elevUp: 28 * D2R, elevDown: 22 * D2R, rudder: 25 * D2R };
export const BATH_DIMS = { length: 5.72, span: 5.5, height: 2.5, gearHeight: CG.y };

export function createBathtub(opts = {}) {
  const def = {
    id: 'bathtub', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.06, s: EYE.s + 0.08, pitch: -0.12 },
    portrait: { center: [0, 0.1, 0.22], cockpit: [0, 0.08, 0.2], fov: 90, pitch: -0.14 },
    dims: { ...BATH_DIMS }, lod: [220, 130], rpm: { idle: 700, max: 2000 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createBathLivery(q),
    createMaterials: (q, l) => createBathMaterials(q, l),
    buildExterior: (q, mats) => buildBathExterior(q, mats),
    buildCockpit: (q, mats, ctx) => buildBathCockpit(q, mats, ctx),
    stick: { pos: [0.16, 0.8, 2.2], move(stick, cur) { stick.rotation.set(cur.elevator * 0.22 - 0.12, 0, -cur.aileron * 0.22); } },
    createPilot: (q, cfg, ctx) => createAviator({
      quality: q, cfg, seat: SEAT, outfit: 'bather', legs: false, gripLocal: [0, 0.49, 0], elbowOut: 0.6,
      leftHand: (cur) => throttleKnob(cur.throttle),
      passengers: [{ kind: 'duck', at: [0.1, WATER_Y - 0.03, 1.12], scale: 1.32 }],
    }),
    onLivery(L, ext, fars) {
      // chrome taps, or gold ones once the player is an Emperor
      const col = srgb(L.goldTaps ? GOLD : '#d9dde1'), rm = L.goldTaps ? RM.gold : RM.chrome;
      for (const e of [ext, ...fars]) {
        const g = e.meshes.trim.geometry, [a, b] = e.taps, ua = g.attributes.uv;
        const tgt = e.merged ? e.merged.mesh.geometry.attributes.color : g.attributes.color, off = e.merged ? e.merged.ranges.trim?.[0] ?? 0 : 0;
        for (let i = a; i < b; i++) if (ua.getY(i) > 0.5) { tgt.setXYZ(i + off, col[0], col[1], col[2]); if (!e.merged) ua.setXY(i, rm[0], rm[1]); }
        tgt.needsUpdate = true; ua.needsUpdate = true;
      }
    },
    animate(ext, cur) {
      const h = ext.hinges;
      h.ailR.rotation.x = -cur.aileron * MAX.aileron;
      h.ailL.rotation.x = cur.aileron * MAX.aileron;
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
    },
  };
  return assembleRig(def, opts);
}
