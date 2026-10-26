import * as THREE from 'three';
import { Builder, naca, airfoilLoop, sweepRings, circle, lerp, clamp, srgb, monotone } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, mix, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';
import { buildF35Cockpit, SEAT, STICK, throttleKnob } from './f35_cockpit.js';

// "Royal Tantrum": an F-35B-ish STOVL fighter. Build frame: y = height above ground (wheels on y = 0, datum level),
// z = station aft of the radome tip, x = right. Real size: length 15.6, span 10.7, height 4.25 (fin tips; real 4.36).
// Visual hooks (see docs/PLANES.md "f35"): setNozzle(0..1), setLiftFan(0..1), setAfterburner(0..1 | null), setGear(0..1).
const D2R = Math.PI / 180;
const RM_TI = [0.4, 0.45];
export const CG = { s: 8.6, y: 2.0 };

// fuselage sections [station, halfWidth, top, bottom, chine (waist) height, nTop, nBottom] (superellipse exponents)
const FUS = [
  [0.0, 0.02, 2.03, 1.99, 2.01, 1.9, 1.9],
  [0.35, 0.17, 2.15, 1.86, 1.99, 1.7, 1.8],
  [1.0, 0.34, 2.33, 1.68, 1.96, 1.8, 1.9],
  [1.8, 0.48, 2.5, 1.53, 1.93, 1.9, 2.0],
  [2.6, 0.58, 2.64, 1.43, 1.92, 2.0, 2.2],
  [3.4, 0.66, 2.74, 1.36, 1.94, 2.1, 2.4],
  [4.3, 0.78, 2.83, 1.31, 1.97, 2.2, 2.6],
  [5.2, 0.97, 2.93, 1.27, 2.0, 2.3, 2.8],
  [6.2, 1.3, 2.99, 1.23, 2.03, 2.6, 3.0],
  [7.4, 1.45, 2.97, 1.21, 2.05, 2.8, 3.2],
  [8.8, 1.55, 2.88, 1.2, 2.06, 3.0, 3.2],
  [10.4, 1.53, 2.75, 1.24, 2.06, 3.0, 3.0],
  [12.0, 1.44, 2.61, 1.36, 2.05, 2.8, 2.8],
  [13.4, 1.3, 2.49, 1.5, 2.04, 2.6, 2.6],
  [14.4, 1.14, 2.41, 1.6, 2.03, 2.4, 2.4],
];
export const FUS_END = 14.4;
const FS = FUS.map((r) => r[0]);
const col = (k) => monotone(FS, FUS.map((r) => r[k]));
const F = { hw: col(1), top: col(2), bot: col(3), w: col(4), nT: col(5), nB: col(6) };
export function sec(s) { s = clamp(s, 0, FUS_END); return { hw: F.hw(s), top: F.top(s), bot: F.bot(s), w: F.w(s), nT: F.nT(s), nB: F.nB(s) }; }
function fusPt(s, a, f = sec(s)) {
  const cs = Math.cos(a), sn = Math.sin(a), up = sn >= 0, n = up ? f.nT : f.nB;
  return [f.hw * Math.sign(cs) * Math.abs(cs) ** (2 / n), f.w + (up ? f.top - f.w : f.w - f.bot) * Math.sign(sn) * Math.abs(sn) ** (2 / n), s];
}
// height of the upper (or lower) skin at (s, x)
export function surfY(s, x, top = true) {
  const f = sec(s), n = top ? f.nT : f.nB;
  const cs = Math.min(1, Math.abs(x) / f.hw) ** (n / 2), sn = Math.sqrt(Math.max(0, 1 - cs * cs));
  return top ? f.w + (f.top - f.w) * sn ** (2 / n) : f.w - (f.w - f.bot) * sn ** (2 / n);
}

// bubble canopy (one piece, gold-tinted like the real ITO coating), sitting on the upper skin
const CAN = { s: [2.5, 2.9, 3.5, 4.2, 4.9, 5.5, 5.95], w: [0.2, 0.41, 0.52, 0.55, 0.54, 0.46, 0.3], top: [2.67, 3.0, 3.3, 3.45, 3.43, 3.29, 3.05] };
const canWf = monotone(CAN.s, CAN.w), canTf = monotone(CAN.s, CAN.top);
export const canW = (s) => canWf(clamp(s, CAN.s[0], CAN.s[CAN.s.length - 1]));
export const canTop = (s) => canTf(clamp(s, CAN.s[0], CAN.s[CAN.s.length - 1]));
// openings cut in the skin (only with a cockpit / at detail tiers); doors cover them
export const HOLE = {
  cockpit: { s0: 2.95, s1: 5.78, hw: (s) => Math.min(0.4, canW(s) - 0.07) },
  fanTop: { sc: 6.725, as: 0.675, ax: 0.5 },
  fanBot: { sc: 6.75, as: 0.55, ax: 0.44 },
};
const DOOR_M = 0.11;
const rrHalf = (h, s, n = 6) => h.ax * Math.max(0, 1 - Math.abs((s - h.sc) / h.as) ** n) ** (1 / n);
// closed rounded-rect outline in plan [x, s], counter-clockwise seen from above, starting at the front
function rrect(h, N, m = 0) {
  const pts = [], as = h.as + m, ax = h.ax + m;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    pts.push([ax * Math.sign(sn) * Math.abs(sn) ** (2 / 6), h.sc - as * Math.sign(c) * Math.abs(c) ** (2 / 6)]);
  }
  return pts;
}

const WING = { y: 2.24, root: 1.05, half: 5.35, le0: 6.1, leK: Math.tan(34 * D2R), te0: 12.3, teK: 0.16, dih: Math.tan(-2 * D2R), flap: [1.55, 4.9] };
const wsec = (x) => { const ax = Math.abs(x), le = WING.le0 + WING.leK * ax, te = WING.te0 - WING.teK * ax; return { le, c: te - le, y: WING.y + (ax - WING.root) * WING.dih }; };
const flapFrac = (x) => { const ax = Math.abs(x), w = wsec(x), fc = lerp(0.95, 0.55, clamp((ax - WING.flap[0]) / (WING.flap[1] - WING.flap[0]), 0, 1)); return 1 - fc / w.c; };
const STAB = { y: 2.0, root: 0.95, half: 3.35, le0: 12.85, leK: Math.tan(41 * D2R), te0: 15.35, teK: 0.104, pivot: 14.3 };
const ssec = (x) => { const ax = Math.abs(x) - STAB.root, le = STAB.le0 + STAB.leK * ax, te = STAB.te0 + STAB.teK * ax; return { le, c: te - le, y: STAB.y }; };
// twin canted fins: local (s, h) in the fin plane, h along the canted span from the base point
const FIN = { x: 1.08, y: 2.5, cant: 24 * D2R, h0: -0.38, h1: 1.9, le0: 11.75, leK: Math.tan(40 * D2R), te0: 14.45, teK: 0.026, rud: [0.12, 1.5] };
const finLE = (h) => FIN.le0 + FIN.leK * Math.max(0, h), finTE = (h) => FIN.te0 - FIN.teK * Math.max(0, h);
const finHinge = (h) => finTE(h) - lerp(0.68, 0.5, clamp(h / FIN.h1, 0, 1));
function finPt(sg, s, h, t) {
  const c = Math.cos(FIN.cant), sn = Math.sin(FIN.cant);
  return [sg * (FIN.x + h * sn + t * c), FIN.y + h * c - t * sn, s];
}
export const FIN_TOP_Y = FIN.y + FIN.h1 * Math.cos(FIN.cant);

// engine nozzle: fixed stub, then two swivelling segments (a simplified three-bearing swivel duct)
export const NOZ = { y: 1.98, r: 0.58, p1: 14.52, p2: 14.92, exit: 15.6, rExit: 0.46, maxDeg: 95 };
const INTAKE = { xc: 1.1, yc: 2.3, ax: 0.27, ay: 0.36, n: 3.6 };
const intakeLipS = (x, y) => 5.25 + (2.66 - y) * 0.42 + (Math.abs(x) - 0.83) * 0.28;
export const GEAR = { noseS: 3.75, noseR: 0.27, mainS: 9.55, mainR: 0.42, track: 3.3 };
export const EYE = { x: 0, y: 3.09, s: 4.7, pitch: -0.12 };
export const F35_DIMS = { length: 15.6, span: 10.7, height: 4.25, gearHeight: CG.y, restHeight: CG.y, groundPitch: 0 };

// ---------- livery atlas ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.15, s0: -0.1, s1: 15.8, h0: 1.05, h1: 3.45, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.15, y1: 0.3, s0: -0.1, s1: 15.8, h0: 1.05, h1: 3.45, flip: true },
  top: { x0: 0, x1: 1, y0: 0.3, y1: 0.5, s0: -0.1, s1: 15.8, h0: -1.8, h1: 1.8, flip: false }, // h = x
  bot: { x0: 0, x1: 1, y0: 0.5, y1: 0.68, s0: -0.1, s1: 15.8, h0: -1.8, h1: 1.8, flip: false }, // h = -x
  wingT: { x0: 0, x1: 0.5, y0: 0.68, y1: 0.83, a0: -5.5, a1: 5.5, s0: 5.9, s1: 12.6, flip: false },
  wingB: { x0: 0, x1: 0.5, y0: 0.83, y1: 0.98, a0: -5.5, a1: 5.5, s0: 5.9, s1: 12.6, flip: true },
  stabT: { x0: 0.5, x1: 0.66, y0: 0.68, y1: 0.83, a0: -3.5, a1: 3.5, s0: 12.6, s1: 15.8, flip: false },
  stabB: { x0: 0.5, x1: 0.66, y0: 0.83, y1: 0.98, a0: -3.5, a1: 3.5, s0: 12.6, s1: 15.8, flip: true },
  finRo: { x0: 0.66, x1: 0.83, y0: 0.68, y1: 0.83, s0: 11.4, s1: 14.7, h0: -0.42, h1: 2.0, flip: true },
  finRi: { x0: 0.83, x1: 1, y0: 0.68, y1: 0.83, s0: 11.4, s1: 14.7, h0: -0.42, h1: 2.0, flip: false },
  finLo: { x0: 0.66, x1: 0.83, y0: 0.83, y1: 0.98, s0: 11.4, s1: 14.7, h0: -0.42, h1: 2.0, flip: false },
  finLi: { x0: 0.83, x1: 1, y0: 0.83, y1: 0.98, s0: 11.4, s1: 14.7, h0: -0.42, h1: 2.0, flip: true },
};
const SW = ['grey', 'dark', 'gold', 'secondary', 'accent', 'black', 'white', 'greyD'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 0.01];
const GOLD = '#d4a743', GOLD_D = '#9c7424', GOLD_L = '#f3d27a', PURPLE = '#5b2a86', RED = '#a3162a';
const RAM = '#5c636b';
const MR = { ram: 'rgb(0,150,0)', gold: 'rgb(0,70,255)', dark: 'rgb(0,175,0)', flash: 'rgb(0,120,0)' };
export const uvF = {
  side: (p) => uvSide(p[0] >= 0 ? REG.fusR : REG.fusL, p[2], p[1]),
  top: (p) => uvSide(REG.top, p[2], p[0]),
  bot: (p) => uvSide(REG.bot, p[2], -p[0]),
};

function createF35Livery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const MS = quality === 'low' ? 512 : 1024;
  const mr = document.createElement('canvas'); mr.width = mr.height = MS;
  const mrTex = new THREE.CanvasTexture(mr);
  const mctx = mr.getContext('2d');
  const A = atlas(S), MA = atlas(MS);
  const goldGrad = (c, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, GOLD_L); g.addColorStop(0.5, GOLD); g.addColorStop(1, GOLD_D); return g; };

  // a royal roundel: gold ring, purple, white, red, little gold crown. up = +1 for side regions, -1 for plan.
  function roundel(c, T, cx, cy, r, up = 1) {
    for (const [k, f] of [[1, GOLD], [0.86, PURPLE], [0.62, '#f2efe8'], [0.36, RED]]) { c.fillStyle = f; c.beginPath(); c.arc(cx, cy, r * k, 0, 7); c.fill(); }
    c.save(); c.translate(cx, cy); c.scale((T.flip ? -1 : 1) * r, up * r);
    c.fillStyle = GOLD;
    c.beginPath(); c.moveTo(-0.22, -0.12); c.lineTo(0.22, -0.12); c.lineTo(0.27, 0.16); c.lineTo(0.13, 0.04); c.lineTo(0, 0.22); c.lineTo(-0.13, 0.04); c.lineTo(-0.27, 0.16); c.closePath(); c.fill();
    c.restore();
  }
  const panel = (c, pts, w = 0.008, a = 0.22) => { c.strokeStyle = `rgba(0,0,0,${a})`; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke(); };
  // stealth access panels with sawtooth ends
  const saw = (c, s0, s1, h0, h1, teeth = 3) => {
    const p = [[s0, h0]];
    for (let i = 0; i <= teeth * 2; i++) p.push([s0 + (s1 - s0) * (i / (teeth * 2)), i % 2 ? h0 - 0.05 : h0]);
    p.push([s1, h1]);
    for (let i = teeth * 2; i >= 0; i--) p.push([s0 + (s1 - s0) * (i / (teeth * 2)), i % 2 ? h1 + 0.05 : h1]);
    panel(c, p);
  };

  function paintSide(c, T, L, mask, base) {
    c.fillStyle = mask ? MR.ram : base; c.fillRect(-1, 0, 18, 5);
    // gold chine stripe + accent pinline
    const line = (off, w) => { c.beginPath(); for (let s = 0.9; s <= 14.2; s += 0.1) c.lineTo(s, sec(s).w + off); c.lineWidth = w; c.stroke(); };
    c.strokeStyle = mask ? MR.gold : goldGrad(c, 2.1, 1.9); line(0.04, 0.032);
    if (!mask) { c.strokeStyle = L.accent; line(0.085, 0.011); }
    if (mask) return;
    // subtle lighter coating patches + panel lines
    c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(4.6, 1.2, 1.6, 2); c.fillRect(9.2, 1.2, 1.2, 2);
    c.fillStyle = 'rgba(0,0,0,0.04)'; c.fillRect(12.2, 1.2, 1.6, 2);
    saw(c, 7.6, 8.8, 2.12, 2.42); saw(c, 11.0, 12.1, 2.1, 2.36, 2); saw(c, 1.2, 2.0, 1.72, 1.86, 2);
    panel(c, [[3.1, 1.55], [4.2, 1.55], [4.2, 1.8], [3.1, 1.8]]);
    // name in gilt italic serif under the canopy, registration (low-vis) on the intake
    const nameCol = pick(base, [GOLD_L, GOLD, '#ffffff'], 1.6);
    A.text(c, T, L.display, 2.85, 2.17, 2.0, 0.17, { font: 'italic 700', family: "Georgia, 'Times New Roman', serif", fill: nameCol, stroke: '#2a1d08', strokeW: 5 });
    A.text(c, T, L.registration, 6.95, 2.29, 1.1, 0.19, { font: '700', fill: shade(base, 0.62) });
    roundel(c, T, 10.75, 2.24, 0.17);
    // ejection warning triangle
    c.save(); c.translate(3.55, 2.27); c.scale(T.flip ? -1 : 1, 1);
    c.fillStyle = '#d82a1e'; c.beginPath(); c.moveTo(0, 0.08); c.lineTo(0.08, -0.06); c.lineTo(-0.08, -0.06); c.closePath(); c.fill();
    c.fillStyle = '#f5d33a'; c.beginPath(); c.moveTo(0, 0.045); c.lineTo(0.045, -0.035); c.lineTo(-0.045, -0.035); c.closePath(); c.fill();
    c.restore();
    A.text(c, T, 'ROYAL EJECTION', 3.95, 2.27, 0.42, 0.035, { font: '700', fill: '#2a2d31' });
  }
  function paintTop(c, T, L, mask, base) {
    c.fillStyle = mask ? MR.ram : base; c.fillRect(-1, -2, 18, 4);
    // twin gold spine lines
    c.fillStyle = mask ? MR.gold : GOLD;
    for (const sg of [-1, 1]) c.fillRect(8.4, sg * 0.13 - 0.012, 5.4, 0.024);
    if (mask) return;
    const door = rrect(HOLE.fanTop, 48, DOOR_M).map(([x, s]) => [s, x]);
    panel(c, door, 0.012, 0.35);
    for (const sg of [-1, 1]) panel(c, [[7.6, sg * 0.05], [8.15, sg * 0.05], [8.15, sg * 0.33], [7.6, sg * 0.33]], 0.01, 0.35);
    saw(c, 10.0, 11.6, -0.35, 0.35, 2);
    panel(c, [[12.2, -0.25], [13.4, -0.25], [13.4, 0.25], [12.2, 0.25]]);
    // gold crown on the lift-fan door
    c.save(); c.translate(6.6, 0); c.rotate(-Math.PI / 2); c.scale(0.5, -0.5);
    c.fillStyle = GOLD;
    c.beginPath(); c.moveTo(-0.4, -0.2); c.lineTo(0.4, -0.2); c.lineTo(0.5, 0.3); c.lineTo(0.25, 0.08); c.lineTo(0, 0.42); c.lineTo(-0.25, 0.08); c.lineTo(-0.5, 0.3); c.closePath(); c.fill();
    c.restore();
    A.text(c, T, 'HOVER DOOR - DO NOT SIT', 7.25, 0, 0.9, 0.06, { font: '700', fill: shade(base, 0.6), rot: 0 });
  }
  function paintBot(c, T, L, mask, base) {
    c.fillStyle = mask ? MR.ram : shade(base, 1.06); c.fillRect(-1, -2, 18, 4);
    if (mask) return;
    const fanB = rrect(HOLE.fanBot, 40, DOOR_M).map(([x, s]) => [s, -x]);
    panel(c, fanB, 0.012, 0.35);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.01; c.beginPath(); c.moveTo(6.1, 0); c.lineTo(7.4, 0); c.stroke();
    for (const sg of [-1, 1]) { saw(c, 7.8, 10.8, sg > 0 ? 0.3 : -0.82, sg > 0 ? 0.82 : -0.3, 3); panel(c, [[8.7, sg * 0.98], [10.3, sg * 0.98], [10.3, sg * 1.42], [8.7, sg * 1.42]]); }
    panel(c, [[3.2, -0.17], [4.4, -0.17], [4.4, 0.17], [3.2, 0.17]]);
  }
  function paintWing(c, T, L, top, mask, base) {
    c.fillStyle = mask ? MR.ram : top ? base : shade(base, 1.06); c.fillRect(-6, 5, 12, 8);
    // gold leading edges and tips
    c.fillStyle = mask ? MR.gold : GOLD;
    for (const sg of [-1, 1]) {
      c.beginPath(); c.moveTo(sg * 0.9, wsec(0.9).le - 0.05); c.lineTo(sg * 5.4, wsec(5.4).le - 0.05); c.lineTo(sg * 5.4, wsec(5.4).le + 0.12); c.lineTo(sg * 0.9, wsec(0.9).le + 0.15); c.closePath(); c.fill();
      c.fillRect(sg > 0 ? 5.22 : -5.42, 6, 0.2, 7);
    }
    if (mask) return;
    c.fillStyle = L.accent;
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 1.0, wsec(1.0).le + 0.17); c.lineTo(sg * 5.2, wsec(5.2).le + 0.14); c.lineTo(sg * 5.2, wsec(5.2).le + 0.16); c.lineTo(sg * 1.0, wsec(1.0).le + 0.19); c.closePath(); c.fill(); }
    for (const sg of [-1, 1]) {
      const p = []; for (let x = WING.flap[0]; x <= WING.flap[1] + 1e-6; x += 0.25) { const w = wsec(x); p.push([sg * x, w.le + flapFrac(x) * w.c]); }
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.012; c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke();
      saw(c, sg * 2.2, sg * 3.2, 9.0, 9.6, 2);
    }
    const rx = top ? -3.35 : 3.35, w = wsec(rx);
    roundel(c, T, rx, w.le + w.c * 0.42, 0.55, -1);
  }
  function paintStab(c, T, L, top, mask, base) {
    c.fillStyle = mask ? MR.ram : top ? base : shade(base, 1.06); c.fillRect(-4, 12, 8, 4);
    c.fillStyle = mask ? MR.gold : GOLD;
    for (const sg of [-1, 1]) { const a = ssec(STAB.root * sg), b = ssec(3.4 * sg); c.beginPath(); c.moveTo(sg * 0.9, a.le - 0.05); c.lineTo(sg * 3.4, b.le - 0.05); c.lineTo(sg * 3.4, b.le + 0.1); c.lineTo(sg * 0.9, a.le + 0.12); c.closePath(); c.fill(); }
  }
  function paintFin(c, T, L, outer, mask, base) {
    c.fillStyle = mask ? MR.ram : base; c.fillRect(11, -1, 4, 3.5);
    // secondary tail flash with an accent pinline, gold leading edge and tip
    c.fillStyle = mask ? MR.flash : L.secondary;
    c.beginPath(); c.moveTo(finLE(1.32), 1.32); c.lineTo(15, 1.32); c.lineTo(15, 2.1); c.lineTo(finLE(2.1), 2.1); c.closePath(); c.fill();
    if (!mask) { c.fillStyle = L.accent; c.fillRect(11, 1.27, 4, 0.03); }
    c.fillStyle = mask ? MR.gold : GOLD;
    c.beginPath(); c.moveTo(finLE(-0.5) - 0.05, -0.5); c.lineTo(finLE(2.0) - 0.05, 2.0); c.lineTo(finLE(2.0) + 0.11, 2.0); c.lineTo(finLE(-0.5) + 0.11, -0.5); c.closePath(); c.fill();
    c.fillRect(11, 1.8, 4, 0.2);
    if (mask) return;
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.01;
    c.beginPath(); c.moveTo(finHinge(FIN.rud[0]), FIN.rud[0]); c.lineTo(finHinge(FIN.rud[1]), FIN.rud[1]); c.lineTo(finTE(FIN.rud[1]) + 0.1, FIN.rud[1]); c.stroke();
    if (outer) {
      crest(c, T, 13.5, 0.93, 0.64, { field: shade(L.secondary, 0.8), field2: RED, gold: GOLD });
      const hrh = pick(base, [GOLD_L, GOLD, '#ffffff'], 1.5);
      A.text(c, T, 'HRH', 13.18, 0.3, 1.3, 0.3, { font: '900', family: "Georgia, 'Times New Roman', serif", fill: hrh, stroke: '#2a1d08', strokeW: 6 });
      A.text(c, T, L.registration, 13.9, 1.47, 0.9, 0.11, { font: '700', fill: pick(L.secondary, [GOLD_L, '#ffffff', '#15181d'], 3) });
    } else {
      c.save(); c.translate(13.7, 1.56); c.scale((T.flip ? -1 : 1) * 0.28, 0.28); c.fillStyle = GOLD;
      c.beginPath(); c.moveTo(-0.4, -0.2); c.lineTo(0.4, -0.2); c.lineTo(0.5, 0.3); c.lineTo(0.25, 0.08); c.lineTo(0, 0.42); c.lineTo(-0.25, 0.08); c.lineTo(-0.5, 0.3); c.closePath(); c.fill();
      c.restore();
    }
  }
  function draw(L) {
    const base = mix(RAM, L.primary, 0.12);
    for (const [cc, AA, mask] of [[ctx, A, false], [mctx, MA, true]]) {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.fillStyle = mask ? MR.ram : base; cc.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
      AA.region(cc, REG.fusL, AA.side(REG.fusL), (c, T) => paintSide(c, T, L, mask, base));
      AA.region(cc, REG.fusR, AA.side(REG.fusR), (c, T) => paintSide(c, T, L, mask, base));
      AA.region(cc, REG.top, AA.side(REG.top), (c, T) => paintTop(c, T, L, mask, base));
      AA.region(cc, REG.bot, AA.side(REG.bot), (c, T) => paintBot(c, T, L, mask, base));
      AA.region(cc, REG.wingT, AA.plan(REG.wingT), (c, T) => paintWing(c, T, L, true, mask, base));
      AA.region(cc, REG.wingB, AA.plan(REG.wingB), (c, T) => paintWing(c, T, L, false, mask, base));
      AA.region(cc, REG.stabT, AA.plan(REG.stabT), (c, T) => paintStab(c, T, L, true, mask, base));
      AA.region(cc, REG.stabB, AA.plan(REG.stabB), (c, T) => paintStab(c, T, L, false, mask, base));
      for (const k of ['finRo', 'finRi', 'finLo', 'finLi']) AA.region(cc, REG[k], AA.side(REG[k]), (c, T) => paintFin(c, T, L, k.endsWith('o'), mask, base));
      const W = cc.canvas.width, w = W / SW.length;
      const cols = mask
        ? { grey: MR.ram, dark: MR.dark, gold: MR.gold, secondary: MR.flash, accent: MR.flash, black: MR.dark, white: MR.ram, greyD: MR.ram }
        : { grey: base, dark: '#2b2f34', gold: GOLD, secondary: L.secondary, accent: L.accent, black: '#0c0d0f', white: '#f2efe8', greyD: shade(base, 0.8) };
      SW.forEach((k, i) => { cc.fillStyle = cols[k]; cc.fillRect(i * w, W * 0.98, w, W * 0.02); });
    }
    texture.needsUpdate = true; mrTex.needsUpdate = true;
  }
  return { texture, mrTex, draw, owns: (t) => t === texture || t === mrTex, dispose() { texture.dispose(); mrTex.dispose(); } };
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  // v = 0 at the nozzle (canvas bottom) .. 1 at the tail; bright core fading out with four shock diamonds
  for (let y = 0; y < 256; y++) {
    const v = 1 - y / 255;
    let k = (1 - v) ** 1.6;
    for (let i = 0; i < 4; i++) k += 0.55 * (1 - i * 0.22) * Math.exp(-(((v - 0.12 - i * 0.16) / 0.025) ** 2));
    k *= Math.min(1, v * 14 + 0.35);
    const q = Math.round(255 * Math.min(1, k));
    g.fillStyle = `rgb(${q},${q},${q})`; g.fillRect(0, y, 16, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createF35Materials(quality, livery, ctx) {
  const po = { map: livery.texture, roughnessMap: livery.mrTex, metalnessMap: livery.mrTex, roughness: 1, metalness: 1, envMapIntensity: 1.0 };
  const paint = new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('f35-trim', { envMapIntensity: 1.15 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xd8b45a, roughness: 0.04, metalness: 0.15, transparent: true, opacity: ctx.wantCockpit ? 0.3 : 0.55,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8,
  });
  glass.forceSinglePass = true;
  const flame = new THREE.MeshBasicMaterial({
    map: flameTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  flame.forceSinglePass = true;
  const disc = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, glass, flame, disc, lights, beacon];
  return { paint, trim, glass, flame, disc, lights, beacon, all: () => list };
}

const C = {
  dark: srgb('#2b2f34'), well: srgb('#1c1f23'), black: srgb('#0b0c0e'), gold: srgb(GOLD), goldD: srgb(GOLD_D), white: srgb('#e9e8e4'),
  tire: srgb('#141517'), strut: srgb('#c9ccd0'), chrome: srgb('#d8dce0'), gearGrey: srgb('#9a9fa5'), ram: srgb(RAM),
  noz: srgb('#7a746d'), nozFace: srgb('#2a2622'), nozHot: srgb('#8c6c50'), nozBlue: srgb('#6e7480'), canopyFar: srgb('#4a3d1e'), eots: srgb('#3a2c12'),
  lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

// drop triangles whose centroid lies in a skin opening
function cut(B, from, inside) {
  const P = B.pos, I = B.idx, keep = I.slice(0, from);
  for (let i = from; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const x = (P[a] + P[b] + P[c]) / 3, y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, s = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    if (!inside(x, y, s)) keep.push(I[i], I[i + 1], I[i + 2]);
  }
  B.idx = keep;
}
// a band following the skin around a plan outline (door sills / canopy rail); dy lifts it off the skin
function sill(B, outline, top, inner, outer, dy, rm, colr) {
  const n = outline.length, cx = outline.reduce((a, p) => a + p[0], 0) / n, cs = outline.reduce((a, p) => a + p[1], 0) / n;
  const nrm = outline.map((p, i) => {
    const a = outline[(i + n - 1) % n], b = outline[(i + 1) % n];
    let nx = b[1] - a[1], ns = -(b[0] - a[0]);
    const l = Math.hypot(nx, ns) || 1; nx /= l; ns /= l;
    if (nx * (p[0] - cx) + ns * (p[1] - cs) < 0) { nx = -nx; ns = -ns; }
    return [nx, ns];
  });
  const ring = (k) => outline.map(([x, s], i) => { const xx = x + nrm[i][0] * k, ss = s + nrm[i][1] * k; return [xx, surfY(ss, xx, top) + dy, ss]; });
  // several rings across the band so it follows the curved skin instead of cutting a chord under it
  B.loft([-inner, -inner / 2, 0, outer / 2, outer].map(ring), { out: () => [0, top ? 1 : -1, 0], uv: () => rm, color: colr });
}
// a curved plate over a plan outline, `lift` off the skin, `thk` thick (doors)
function plate(B, outline, top, lift, thk, uvTop, R = 4) {
  const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cs = outline.reduce((a, p) => a + p[1], 0) / outline.length;
  const sgn = top ? 1 : -1;
  const at = (k, off) => outline.map(([x, s]) => { const xx = cx + (x - cx) * k, ss = cs + (s - cs) * k; return [xx, surfY(ss, xx, top) + sgn * (lift + off), ss]; });
  const ringsT = [], ringsB = [];
  for (let r = 0; r < R; r++) { const k = 1 - r / R; ringsT.push(at(k, 0)); ringsB.push(at(k, -thk)); }
  B.loft(ringsT, { out: () => [0, sgn, 0], uv: uvTop });
  fan(B, ringsT[R - 1], [0, sgn, 0], uvTop);
  B.loft(ringsB, { out: () => [0, -sgn, 0], uv: () => sw('greyD') });
  fan(B, ringsB[R - 1], [0, -sgn, 0], sw('greyD'));
  B.loft([at(1, 0), at(1, -thk)], { uv: () => sw('greyD') });
}

export function buildF35Exterior(quality, mats, ctx = {}) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), glass = new Builder();
  const cockpitHole = T.detail && ctx.wantCockpit !== false;
  const holes = T.detail;

  // ---------- fuselage: chined upper and lower halves ----------
  const NU = T.low ? 22 : T.n(28, 6), j1 = Math.max(1, Math.round(NU * 0.2)), j2 = Math.max(1, Math.round(NU * 0.17));
  const st = [0, 0.06, 0.18, 0.35, 0.55, 0.8];
  const step = { high: 0.3, low: 0.5, lod: 0.9, lod2: 1.4 }[T.q];
  for (let s = 1.1; s < FUS_END - 0.05; s += step) st.push(+s.toFixed(3));
  st.push(FUS_END);
  if (holes) {
    const fine = T.high ? 0.1 : 0.15;
    const zones = [[HOLE.fanTop.sc - HOLE.fanTop.as - 0.15, HOLE.fanTop.sc + HOLE.fanTop.as + 0.25]];
    if (cockpitHole) zones.push([HOLE.cockpit.s0 - 0.15, HOLE.cockpit.s1 + 0.15]);
    for (const [a, b] of zones) for (let s = a; s <= b; s += fine) st.push(+s.toFixed(3));
  }
  st.sort((a, b) => a - b);
  const SS = st.filter((s, i) => i === 0 || s - st[i - 1] > 0.03);
  const secs = SS.map((s) => sec(s));
  const half = (a0) => SS.map((s, i) => { const r = []; for (let j = 0; j <= NU; j++) r.push(fusPt(s, a0 + (j / NU) * Math.PI, secs[i])); return r; });
  const outF = (p, i) => [p[0], p[1] - secs[i].w, 0];
  const up0 = body.idx.length;
  body.loft(half(0), { closed: false, out: outF, splits: [[0, j1, uvF.side], [j1, NU - j1, uvF.top], [NU - j1, NU, uvF.side]], capStart: true, capUV: () => sw('grey') });
  if (holes) {
    const fanT = HOLE.fanTop;
    cut(body, up0, (x, y, s) => {
      const f = sec(s);
      if (y < f.w + 0.15) return false;
      if (cockpitHole && s > HOLE.cockpit.s0 && s < HOLE.cockpit.s1 && Math.abs(x) < HOLE.cockpit.hw(s)) return true;
      return Math.abs(s - fanT.sc) < fanT.as && Math.abs(x) < rrHalf(fanT, s);
    });
  }
  const lo0 = body.idx.length;
  body.loft(half(Math.PI), { closed: false, out: outF, splits: [[0, j2, uvF.side], [j2, NU - j2, uvF.bot], [NU - j2, NU, uvF.side]], capStart: true, capUV: () => sw('grey') });
  if (holes) {
    const fb = HOLE.fanBot;
    cut(body, lo0, (x, y, s) => y < sec(s).w - 0.15 && Math.abs(s - fb.sc) < fb.as && Math.abs(x) < rrHalf(fb, s));
  }
  // flat aft deck around the nozzle
  {
    const ring = []; const NE = T.n(32, 10);
    for (let j = 0; j < NE; j++) ring.push(fusPt(FUS_END, (j / NE) * Math.PI * 2));
    fan(body, ring, [0, 0, 1], sw('greyD'));
  }

  // ---------- intakes (caret lips with a DSI bump ahead), gold lip rim, dark mouths ----------
  const NI = T.n(20, 8);
  for (const sg of [1, -1]) {
    const loop = []; for (let j = 0; j < NI; j++) { const a = (j / NI) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); loop.push([sg * (INTAKE.xc + INTAKE.ax * Math.sign(c) * Math.abs(c) ** (2 / INTAKE.n)), INTAKE.yc + INTAKE.ay * Math.sign(sn) * Math.abs(sn) ** (2 / INTAKE.n)]); }
    const ds = T.far ? [0, 2.8] : [0, 0.12, 0.45, 1.2, 2.2, 2.9];
    const rings = ds.map((d, k) => loop.map(([x, y]) => [x * (1 + 0.012 * Math.min(1, d)), y, intakeLipS(x, y) + d]));
    const q = Math.round(NI / 8);
    // outer wall = side region, top = top, bottom = bottom (inner wall is buried in the fuselage)
    const segs = sg > 0
      ? [[NI - q, NI + q, uvF.side], [q, 3 * q, uvF.top], [3 * q, 5 * q, uvF.side], [5 * q, NI - q, uvF.bot]]
      : [[NI - q, NI + q, uvF.side], [q, 3 * q, uvF.top], [3 * q, 5 * q, uvF.side], [5 * q, NI - q, uvF.bot]];
    body.loft(rings, { out: (p) => [p[0] - sg * INTAKE.xc, p[1] - INTAKE.yc, 0], splits: segs });
    if (!T.lod2) {
      const mouth = loop.map(([x, y]) => [sg * (INTAKE.xc + (Math.abs(x) - INTAKE.xc) * 0.86), INTAKE.yc + (y - INTAKE.yc) * 0.86, intakeLipS(x, y) + 0.16]);
      fan(trim, mouth, [0, 0, -1], RM.black, C.black);
      if (!T.far) {
        const lip = [...rings[0], rings[0][0]].map((p) => [p[0], p[1], p[2] - 0.005]);
        trim.loft(sweepRings(lip, circle(T.n(6, 4), 0.022), { upHint: [0, 0, 1] }), { color: C.gold, uv: () => RM.goldSatin });
      }
    }
    // diverterless supersonic inlet bump on the fuselage side
    if (!T.lod2) body.addGeo(new THREE.SphereGeometry(1, T.n(14, 6), T.n(10, 4)), M4(sg * 0.84, 2.33, 5.05, 0.11, 0.22, 0.55), uvF.side);
  }

  // ---------- canopy ----------
  {
    const NC = T.n(18, 6), cs = [];
    const K = T.i(14, 4);
    for (let k = 0; k <= K; k++) cs.push(lerp(CAN.s[0], CAN.s[CAN.s.length - 1], (1 - Math.cos((k / K) * Math.PI)) / 2));
    const rings = cs.map((s) => {
      const w = canW(s), base = surfY(s, w) - 0.03, tp = canTop(s), r = [];
      for (let j = 0; j <= NC; j++) { const a = (j / NC) * Math.PI, c = Math.cos(a), sn = Math.sin(a); r.push([w * Math.sign(c) * Math.abs(c) ** (2 / 2.3), base + (tp - base) * sn ** (2 / 2.4), s]); }
      return r;
    });
    if (T.far) trim.loft(rings, { closed: false, out: (p) => [p[0], 1, 0], color: C.canopyFar, uv: () => RM.glass, capStart: true, capEnd: true });
    else {
      glass.loft(rings, { closed: false, out: (p) => [p[0], 1, 0], capStart: true, capEnd: true });
      // gold canopy rail + aft frame arch
      const rail = []; const R = T.n(40, 12);
      for (let k = 0; k <= R; k++) { const s = lerp(2.6, 5.9, k / R), w = canW(s) + 0.01; rail.push([w, surfY(s, w) - 0.005, s]); }
      for (const sg of [1, -1]) trim.loft(sweepRings(rail.map(([x, y, s]) => [sg * x, y, s]), circle(T.n(8, 4), 1).map(([a, b]) => [a * 0.035, b * 0.022])), { color: C.gold, uv: () => RM.goldSatin, capStart: true, capEnd: true });
      const arch = []; const s0 = 5.62;
      for (let j = 0; j <= NC; j++) { const a = (j / NC) * Math.PI, w = canW(s0) + 0.012, base = surfY(s0, w) - 0.02, tp = canTop(s0) + 0.012; arch.push([w * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** (2 / 2.3), base + (tp - base) * Math.sin(a) ** (2 / 2.4), s0]); }
      trim.loft(sweepRings(arch, circle(T.n(8, 4), 1).map(([a, b]) => [a * 0.03, b * 0.045]), { upHint: [0, 0, 1] }), { color: C.gold, uv: () => RM.goldSatin, capStart: true, capEnd: true });
    }
    if (cockpitHole) {
      // hole outline: right side front->back, across the back, left side back->front, across the front
      const H = HOLE.cockpit, o = [], N = T.n(48, 16), M = 6;
      for (let k = 0; k <= N; k++) { const s = lerp(H.s0, H.s1, k / N); o.push([H.hw(s), s]); }
      for (let k = 1; k < M; k++) o.push([lerp(H.hw(H.s1), -H.hw(H.s1), k / M), H.s1]);
      for (let k = N; k >= 0; k--) { const s = lerp(H.s0, H.s1, k / N); o.push([-H.hw(s), s]); }
      for (let k = 1; k < M; k++) o.push([lerp(-H.hw(H.s0), H.hw(H.s0), k / M), H.s0]);
      sill(trim, o, true, 0.13, 0.1, 0.012, RM.black, C.dark);
    }
  }

  // ---------- lift-fan well (through the fuselage), sills ----------
  if (holes) {
    const N = T.n(36, 16);
    const oT = rrect(HOLE.fanTop, N), oB = rrect(HOLE.fanBot, N);
    const rings = [
      oT.map(([x, s]) => [x, surfY(s, x) + 0.004, s]),
      oT.map(([x, s]) => [x * 0.97, 2.45, s]),
      oB.map(([x, s]) => [x * 0.97, 1.75, s]),
      oB.map(([x, s]) => [x, surfY(s, x, false) - 0.004, s]),
    ];
    trim.loft(rings, { out: (p) => [-p[0], 0, -(p[2] - HOLE.fanTop.sc)], color: C.well, uv: () => RM.black });
    sill(trim, oT, true, 0.09, DOOR_M - 0.03, 0.01, RM.black, C.dark);
    sill(trim, oB, false, 0.09, DOOR_M - 0.03, -0.01, RM.black, C.dark);
    // dark inlet grilles under the auxiliary inlet doors (seen only when they open)
    for (const sg of [-1, 1]) {
      const rows = [7.62, 7.79, 7.96, 8.13].map((s2) => [0.07, 0.15, 0.23, 0.31].map((x) => [sg * x, surfY(s2, x) + 0.006, s2]));
      trim.loft(rows, { closed: false, out: () => [0, 1, 0], uv: () => RM.black, color: C.black });
      if (T.high) for (let k = 1; k < 5; k++) rod(trim, [sg * 0.07, surfY(7.62 + k * 0.1, 0.2) + 0.01, 7.62 + k * 0.1], [sg * 0.31, surfY(7.62 + k * 0.1, 0.2) + 0.01, 7.62 + k * 0.1], 0.006, 4, RM_TI, C.dark);
    }
    // stator struts across the duct under the fan
    for (const d of [-0.3, 0, 0.3]) rod(trim, [-0.47, 1.95, HOLE.fanTop.sc + d], [0.47, 1.95, HOLE.fanTop.sc + d], 0.018, 6, RM_TI, C.dark);
  }

  // ---------- wings ----------
  const foilW = naca(0, 0.4, 0.05), nC = T.n(16, 6);
  const surf = (B, xs, secFn, foil, f0, f1, round, uvT, uvB, caps = [false, false], capUV = () => sw('grey')) => {
    const fr = (v, x) => (typeof v === 'function' ? v(x) : v);
    let top = 0;
    const rings = xs.map((x) => {
      const w = secFn(x), a = fr(f0, x), { loop, topCount } = airfoilLoop(foil, nC, a, fr(f1, x), round);
      top = topCount - 1 + (a > 0 && round ? 3 : 0);
      return loop.map(([xc, yv]) => [x, w.y + yv * w.c, w.le + xc * w.c]);
    });
    B.loft(rings, { out: () => [0, 1, 0], splits: [[0, top, uvT], [top, rings[0].length, uvB]], capStart: caps[0], capEnd: caps[1], capUV });
  };
  const sp = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const wT = (p) => uvPlan(REG.wingT, p[0], p[2]), wB = (p) => uvPlan(REG.wingB, p[0], p[2]);
  const pieces = {};
  for (const sg of [1, -1]) {
    const S = (a) => (sg > 0 ? a : a.map((x) => -x).reverse());
    surf(body, S(sp(WING.root, WING.flap[0], T.i(2, 1))), wsec, foilW, 0, 1, false, wT, wB);
    surf(body, S(sp(WING.flap[0], WING.flap[1], T.i(5, 2))), wsec, foilW, 0, flapFrac, false, wT, wB);
    surf(body, S(sp(WING.flap[1], WING.half, T.i(2, 1))), wsec, foilW, 0, 1, false, wT, wB, sg > 0 ? [false, true] : [true, false]);
    const a = WING.flap[0] + 0.015, b = WING.flap[1] - 0.015, B = new Builder();
    surf(B, S(sp(a, b, T.i(5, 2))), wsec, foilW, (x) => flapFrac(x) + 0.006, 1, true, wT, wB, [true, true]);
    const hp = (x) => { const w = wsec(x); return [x, w.y, w.le + (flapFrac(x) + 0.012) * w.c]; };
    pieces[sg > 0 ? 'flapR' : 'flapL'] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
  }

  // ---------- all-moving stabilators ----------
  const foilS = naca(0, 0.4, 0.045);
  for (const sg of [1, -1]) {
    const B = new Builder(), xs = sp(STAB.root, STAB.half, T.i(4, 1));
    surf(B, sg > 0 ? xs : xs.map((x) => -x).reverse(), ssec, foilS, 0, 1, false, (p) => uvPlan(REG.stabT, p[0], p[2]), (p) => uvPlan(REG.stabB, p[0], p[2]), [true, true]);
    pieces[sg > 0 ? 'stabR' : 'stabL'] = { B, a: [sg > 0 ? STAB.root : -STAB.half, STAB.y, STAB.pivot], b: [sg > 0 ? STAB.half : -STAB.root, STAB.y, STAB.pivot] };
  }

  // ---------- twin canted fins + rudders ----------
  const foilF = naca(0, 0.4, 0.05), nF = T.n(14, 6);
  for (const sg of [1, -1]) {
    const regO = sg > 0 ? REG.finRo : REG.finLo, regI = sg > 0 ? REG.finRi : REG.finLi;
    const nrm = [sg * Math.cos(FIN.cant), -Math.sin(FIN.cant), 0];
    const build = (B, hs, chordFn) => {
      const { loop, topCount } = airfoilLoop(foilF, nF, 0, 1, false);
      const rings = hs.map((h) => { const [le, te] = chordFn(h), c = te - le; return loop.map(([xc, yv]) => finPt(sg, le + xc * c, h, yv * c)); });
      const uo = (p) => { const loc = toFin(sg, p); return uvSide(regO, loc[0], loc[1]); };
      const ui = (p) => { const loc = toFin(sg, p); return uvSide(regI, loc[0], loc[1]); };
      B.loft(rings, { out: () => nrm, splits: [[0, topCount - 1, uo], [topCount - 1, loop.length, ui]], capStart: true, capEnd: true, capUV: uo });
    };
    // fixed fin: full chord below/above the rudder, leading part along the rudder
    build(body, sp(FIN.h0, FIN.rud[0], 1), (h) => [finLE(h), finTE(h)]);
    build(body, sp(FIN.rud[0], FIN.rud[1], T.i(4, 1)), (h) => [finLE(h), finHinge(h)]);
    build(body, sp(FIN.rud[1], FIN.h1, 1), (h) => [finLE(h), finTE(h)]);
    const R = new Builder();
    build(R, sp(FIN.rud[0] + 0.01, FIN.rud[1] - 0.01, T.i(4, 1)), (h) => [finHinge(h) + 0.012, finTE(h)]);
    pieces[sg > 0 ? 'rudR' : 'rudL'] = { B: R, a: finPt(sg, finHinge(FIN.rud[0]), FIN.rud[0], 0), b: finPt(sg, finHinge(FIN.rud[1]), FIN.rud[1], 0) };
  }

  // ---------- nozzle stub + bearing ball (fixed), EOTS, antennas ----------
  const nozR = (s) => (s < NOZ.p2 ? NOZ.r : lerp(NOZ.r, NOZ.rExit, clamp((s - NOZ.p2) / (NOZ.exit - NOZ.p2), 0, 1)));
  const NN = T.n(28, 10);
  const nozCol = (p) => { const s = p[2]; return s > NOZ.exit - 0.15 ? C.nozHot : s > NOZ.p2 ? C.nozBlue : C.noz; };
  trim.loft(sweepRings([[0, NOZ.y, FUS_END - 0.12], [0, NOZ.y, NOZ.p1]], circle(NN, NOZ.r), { upHint: [0, 1, 0] }), { color: C.noz, uv: () => RM_TI });
  if (!T.far) trim.addGeo(new THREE.TorusGeometry(NOZ.r + 0.01, 0.025, T.n(6, 4), NN), M4(0, NOZ.y, NOZ.p1 - 0.05), RM.gold, C.gold);
  if (!T.lod2) trim.addGeo(new THREE.SphereGeometry(NOZ.r * 1.003, NN, T.n(12, 6)), M4(0, NOZ.y, NOZ.p1), RM_TI, C.noz);
  if (T.detail) {
    // EOTS: faceted sapphire window under the chin
    trim.addGeo(new THREE.ConeGeometry(0.15, 0.12, 8, 1), M4(0, 1.62, 1.85, 1, 1, 1.5, Math.PI, 0, 0), RM.glass, C.eots);
    for (const [s, y, up] of [[9.5, surfY(9.5, 0) - 0.01, 1], [11.3, surfY(11.3, 0) - 0.01, 1], [8.0, surfY(8.0, 0, false) + 0.01, -1], [4.6, surfY(4.6, 0, false) + 0.01, -1]]) {
      trim.addGeo(new THREE.BoxGeometry(0.012, 0.13, 0.22), M4(0, y + up * 0.06, s, 1, 1, 1, up * -0.35, 0, 0), RM.paint, C.ram);
    }
  }

  // ---------- gear (its own mesh so it can retract) ----------
  const gear = new Builder();
  {
    const W = (x, s, r, wd) => {
      gear.addGeo(new THREE.CylinderGeometry(r, r, wd, T.n(22, 10), 1), M4(x, r, s, 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, C.tire);
      if (!T.lod2) gear.addGeo(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wd + 0.02, T.n(14, 6), 1), M4(x, r, s, 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, C.gearGrey);
    };
    // nose: single wheel, raked oleo, torque links, doors
    const ns = GEAR.noseS, nr = GEAR.noseR, nTop = surfY(ns, 0, false) + 0.05;
    W(0, ns, nr, 0.2);
    for (const sg of [-1, 1]) rod(gear, [sg * 0.13, nr, ns], [sg * 0.13, nr + 0.32, ns - 0.08], 0.03, 8, RM.steel, C.strut);
    rod(gear, [0, nr + 0.32, ns - 0.08], [0, nTop, ns - 0.22], 0.075, T.n(10, 6), RM.paint, C.gearGrey);
    rod(gear, [0, nr + 0.28, ns - 0.07], [0, nr + 0.7, ns - 0.17], 0.05, T.n(10, 6), RM.chrome, C.chrome);
    rod(gear, [-0.13, nr + 0.3, ns - 0.08], [0.13, nr + 0.3, ns - 0.08], 0.03, 6, RM.steel, C.strut);
    if (T.detail) {
      rod(gear, [0, nr + 0.55, ns - 0.13], [0, nTop - 0.05, ns + 0.45], 0.03, 6, RM.steel, C.strut);
      for (const sg of [-1, 1]) gear.addGeo(new THREE.BoxGeometry(0.015, 0.42, 0.95), M4(sg * 0.2, nTop - 0.24, ns + 0.1), RM.paint, C.ram);
    }
    // mains: trailing-link legs from the fuselage underside, big main gear doors
    for (const sg of [-1, 1]) {
      const x = sg * GEAR.track / 2, r = GEAR.mainR, s = GEAR.mainS, top = surfY(s - 0.3, 1.2, false) + 0.06;
      W(x, s, r, 0.3);
      rod(gear, [x - sg * 0.2, r, s], [sg * 1.22, top, s - 0.35], 0.09, T.n(12, 6), RM.paint, C.gearGrey);
      rod(gear, [x - sg * 0.2, r, s], [x - sg * 0.2, r + 0.45, s - 0.12], 0.06, 8, RM.chrome, C.chrome);
      rod(gear, [x - sg * 0.15, r, s], [x + sg * 0.15, r, s], 0.05, 8, RM.steel, C.strut);
      if (T.detail) {
        rod(gear, [x - sg * 0.2, r + 0.4, s - 0.1], [sg * 0.75, top + 0.02, s - 0.1], 0.035, 6, RM.steel, C.strut);
        gear.addGeo(new THREE.BoxGeometry(0.02, 0.62, 1.35), M4(sg * 1.22, top - 0.3, s - 0.05, 1, 1, 1, 0, 0, sg * 0.12), RM.paint, C.ram);
      }
    }
  }

  // ---------- doors (one CPU-posed mesh: lift-fan top door, aux inlet doors, two belly doors) ----------
  let doorsMesh = null, doorInfo = null;
  if (holes) {
    const D = new Builder(), ranges = [];
    const mark = (fn) => { const a = D.count; fn(); ranges.push([a, D.count]); };
    const N = T.n(36, 16);
    const oT = rrect(HOLE.fanTop, N, DOOR_M);
    mark(() => plate(D, oT, true, 0.02, 0.03, uvF.top, T.high ? 5 : 3));
    mark(() => { for (const sg of [-1, 1]) plate(D, [[sg * 0.05, 7.6], [sg * 0.33, 7.6], [sg * 0.33, 8.15], [sg * 0.05, 8.15]], true, 0.012, 0.02, uvF.top, 2); });
    const oB = rrect(HOLE.fanBot, N, DOOR_M);
    for (const sg of [-1, 1]) mark(() => {
      // half outline: the outer edge (rrect half) then back along the centre line
      const h = N / 2, edge = sg > 0 ? oB.slice(0, h + 1) : [...oB.slice(h), oB[0]];
      const s0 = edge[edge.length - 1][1], s1 = edge[0][1], cen = [];
      for (let k = 1; k < 6; k++) cen.push([0, lerp(s0, s1, k / 6)]);
      plate(D, [...edge, ...cen], false, 0.02, 0.03, uvF.bot, 3);
    });
    const mT = HOLE.fanTop, mB = HOLE.fanBot;
    const hingeT = [0, surfY(mT.sc + mT.as + DOOR_M, 0) + 0.035, mT.sc + mT.as + DOOR_M];
    const hingeA = [0, surfY(8.15, 0) + 0.025, 8.15];
    const bx = mB.ax + DOOR_M;
    doorInfo = [
      { r: ranges[0], p: hingeT, axis: [1, 0, 0], max: 72 * D2R },
      { r: ranges[1], p: hingeA, axis: [1, 0, 0], max: 32 * D2R },
      { r: ranges[2], p: [-bx, surfY(mB.sc, bx, false) - 0.035, mB.sc], axis: [0, 0, 1], max: -86 * D2R },
      { r: ranges[3], p: [bx, surfY(mB.sc, bx, false) - 0.035, mB.sc], axis: [0, 0, 1], max: 86 * D2R },
    ];
    doorsMesh = mkMesh('doors', D, mats.paint);
  }

  // ---------- swivel nozzle (one CPU-posed mesh: segment 1 + the second bearing ball, segment 2 with the petals) ----------
  let nozMesh = null, nozInfo = null;
  {
    const NZ = new Builder();
    const s1 = NZ.count;
    NZ.loft(sweepRings([[0, NOZ.y, NOZ.p1], [0, NOZ.y, NOZ.p2]], circle(NN, NOZ.r)), { color: C.noz, uv: () => RM_TI });
    if (!T.far) NZ.addGeo(new THREE.TorusGeometry(NOZ.r + 0.01, 0.025, T.n(6, 4), NN), M4(0, NOZ.y, NOZ.p2 - 0.05), RM.gold, C.gold);
    if (!T.lod2) NZ.addGeo(new THREE.SphereGeometry(NOZ.r * 1.003, NN, T.n(12, 6)), M4(0, NOZ.y, NOZ.p2), RM_TI, C.noz);
    const s2 = NZ.count;
    const K = T.i(6, 2), path = []; for (let k = 0; k <= K; k++) path.push([0, NOZ.y, lerp(NOZ.p2, NOZ.exit - 0.06, k / K)]);
    NZ.loft(sweepRings(path, circle(NN, 1), { scale: (i, n) => nozR(path[i][2]) }), { color: nozCol, uv: () => RM_TI });
    // serrated petal edge, inner liner, turbine face
    const NP = T.far ? NN : Math.max(NN, 24), lipO = [], lipI = [], deep = [];
    for (let j = 0; j < NP; j++) {
      const a = (j / NP) * Math.PI * 2, tri = T.far ? 0 : Math.abs(((j / NP) * 12) % 1 - 0.5) * 2;
      const r = NOZ.rExit, sE = NOZ.exit - 0.06 + 0.07 * (1 - tri);
      lipO.push([Math.cos(a) * r, NOZ.y + Math.sin(a) * r, NOZ.exit - 0.06]);
      lipI.push([Math.cos(a) * r * 0.985, NOZ.y + Math.sin(a) * r * 0.985, sE]);
      deep.push([Math.cos(a) * r * 0.7, NOZ.y + Math.sin(a) * r * 0.7, NOZ.exit - 0.65]);
    }
    NZ.loft([lipO, lipI.map((p, j) => [p[0] * 1.015, p[1] + (p[1] - NOZ.y) * 0.015, p[2]])], { out: (p) => [p[0], p[1] - NOZ.y, 0], color: C.nozHot, uv: () => RM_TI });
    NZ.loft([lipI, deep], { out: (p) => [-p[0], -(p[1] - NOZ.y), 0], color: (p) => (p[2] > NOZ.exit - 0.3 ? C.nozHot : C.noz), uv: () => RM_TI });
    fan(NZ, deep, [0, 0, 1], RM_TI, C.nozFace);
    if (T.detail) NZ.addGeo(new THREE.ConeGeometry(0.12, 0.25, 12), M4(0, NOZ.y, NOZ.exit - 0.55, 1, 1, 1, Math.PI / 2, 0, 0), RM_TI, C.noz);
    const e = NZ.count;
    nozMesh = mkMesh('nozzle', NZ, mats.trim);
    nozInfo = { seg1: [s1, s2], seg2: [s2, e], p1: [0, NOZ.y, NOZ.p1], p2: [0, NOZ.y, NOZ.p2] };
  }

  // ---------- afterburner flame (additive; follows the nozzle) ----------
  let flame = null;
  const exit = new THREE.Object3D();
  exit.name = 'nozzle-exit';
  exit.matrixAutoUpdate = false;
  if (T.detail) {
    const FB = new Builder(), rad = T.high ? 20 : 12;
    const cone = (r0, r1, len, colr) => FB.addGeo(new THREE.CylinderGeometry(r1, r0, len, rad, T.high ? 3 : 1, true), M4(0, 0, len / 2, 1, 1, 1, Math.PI / 2, 0, 0), (p, u) => u, colr);
    cone(NOZ.rExit * 0.9, 0.12, 3.4, [1.0, 0.42, 0.14]);
    cone(NOZ.rExit * 0.62, 0.04, 2.1, [0.55, 0.62, 1.0]);
    FB.addGeo(new THREE.CircleGeometry(NOZ.rExit * 0.92, rad), M4(0, 0, 0.02), [0.5, 0.02], [1.0, 0.75, 0.45]);
    flame = new THREE.Mesh(FB.build(), mats.flame);
    flame.name = 'afterburner';
    flame.position.set(0, NOZ.y, NOZ.exit);
    flame.renderOrder = 5;
    flame.visible = false;
    flame.castShadow = false; flame.receiveShadow = false;
    flame.frustumCulled = false;
    exit.add(flame);
  }

  // ---------- lift fan rotor (spins, only while the doors are open) ----------
  let rotor = null;
  if (holes) {
    const RB = new Builder(), r = 0.47, nb = T.high ? 18 : 12;
    RB.addGeo(new THREE.SphereGeometry(0.12, T.n(14, 8), T.n(8, 4), 0, Math.PI * 2, 0, Math.PI / 2), M4(0, 0.02, 0, 1, 0.7, 1), RM.gold, C.gold);
    RB.addGeo(new THREE.CylinderGeometry(0.12, 0.13, 0.08, T.n(14, 8)), M4(0, -0.02, 0), RM_TI, C.noz);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2, rm = (r + 0.12) / 2;
      RB.addGeo(new THREE.BoxGeometry(r - 0.13, 0.012, 0.075), M4(Math.cos(a) * rm, 0, Math.sin(a) * rm, 1, 1, 1, 0.6, -a, 0, 'YXZ'), RM.steel, C.gearGrey);
    }
    RB.addGeo(new THREE.TorusGeometry(r, 0.018, 4, T.n(32, 12)), M4(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), RM_TI, C.noz);
    rotor = new THREE.Mesh(RB.build(), mats.trim);
    rotor.name = 'liftfan';
    rotor.position.set(0, 2.3, HOLE.fanTop.sc);
    rotor.visible = false;
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, colr] of [[-1, C.lensR], [1, C.lensG]]) {
    const w = wsec(WING.half - 0.05), p = [sg * (WING.half - 0.04), w.y, w.le + 0.35];
    lights.addGeo(new THREE.SphereGeometry(0.03, T.n(8, 4), T.n(6, 3)), M4(...p, 1, 0.6, 2.2), [0, 0], colr);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    lightPts.push({ p: [p[0], p[1], p[2] + 1.0], col: [1, 1, 1], kind: 'strobe' });
  }
  { const p = [0, NOZ.y + NOZ.r + 0.06, FUS_END - 0.05]; lights.addGeo(new THREE.SphereGeometry(0.025, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  const beaconPos = [0, surfY(10.2, 0) + 0.04, 10.2];
  const beaconGeo = new Builder();
  beaconGeo.addGeo(new THREE.SphereGeometry(0.05, T.n(12, 4), T.n(8, 3), 0, Math.PI * 2, 0, Math.PI / 2), M4(...beaconPos, 1, 0.8, 1.4), [0, 0]);
  lightPts.push({ p: [beaconPos[0], beaconPos[1] + 0.04, beaconPos[2]], col: [1, 0.1, 0.05], kind: 'beacon' });

  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  const gearGroup = new THREE.Group(); gearGroup.name = 'gear-pivot'; gearGroup.position.y = 1.3;
  meshes.gear = mkMesh('gear', gear, mats.trim); meshes.gear.position.y = -1.3; gearGroup.add(meshes.gear); group.add(gearGroup);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  meshes.beacon = mkMesh('beacon', beaconGeo, mats.beacon, { cast: false, receive: false }); group.add(meshes.beacon);
  if (glass.count) { meshes.glass = mkMesh('glass', glass, mats.glass, { cast: false, receive: false }); meshes.glass.renderOrder = 2; group.add(meshes.glass); }
  meshes.nozzle = nozMesh; group.add(nozMesh);
  group.add(exit);
  if (doorsMesh) { meshes.doors = doorsMesh; group.add(doorsMesh); }
  if (rotor) { meshes.rotor = rotor; group.add(rotor); }
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  // no propeller: inert stand-ins for the generic rig's prop/disc bookkeeping
  const propGroup = new THREE.Object3D(), propMesh = new THREE.Object3D(), disc = new THREE.Object3D();
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, gearGroup, flame, exit, rotor, doorInfo, nozInfo };
}

function toFin(sg, p) {
  const c = Math.cos(FIN.cant), sn = Math.sin(FIN.cant);
  const dx = sg * p[0] - FIN.x, dy = p[1] - FIN.y;
  return [p[2], dx * sn + dy * c];
}

// ---------- CPU posing of the door / nozzle meshes (only when a hook value changes) ----------
const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _ax = new THREE.Vector3();
function poser(mesh) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal;
  P.setUsage(THREE.DynamicDrawUsage); N.setUsage(THREE.DynamicDrawUsage);
  const rest = P.array.slice(), restN = N.array.slice();
  return (range, M) => {
    _n3.getNormalMatrix(M);
    const e = M.elements, n = _n3.elements, a = P.array, b = N.array;
    for (let i = range[0] * 3; i < range[1] * 3; i += 3) {
      const x = rest[i], y = rest[i + 1], z = rest[i + 2];
      a[i] = e[0] * x + e[4] * y + e[8] * z + e[12]; a[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; a[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const u = restN[i], v = restN[i + 1], w = restN[i + 2];
      b[i] = n[0] * u + n[3] * v + n[6] * w; b[i + 1] = n[1] * u + n[4] * v + n[7] * w; b[i + 2] = n[2] * u + n[5] * v + n[8] * w;
    }
    P.needsUpdate = true; N.needsUpdate = true;
  };
}
const rotAbout = (out, p, axis, ang) => out.makeTranslation(p[0], p[1], p[2]).multiply(_t.makeRotationAxis(_ax.set(...axis), ang)).multiply(_t.makeTranslation(-p[0], -p[1], -p[2]));

const MAX = { flap: 22 * D2R, flapDown: 30 * D2R, stab: 18 * D2R, stabRoll: 6 * D2R, rudder: 25 * D2R };
const RATE = { nozzle: 1 / 2.2, liftFan: 1 / 1.6, gear: 1 / 2.4, ab: 4 };

export function createF35(opts = {}) {
  // hook targets and current (eased) values, shared by the hooks and def.animate
  const J = {
    target: { nozzle: 0, liftFan: 0, gear: 1, ab: null }, cur: { nozzle: 0, liftFan: 0, gear: 1, ab: 0 },
    posed: { nozzle: -1, liftFan: -1, gear: -1 }, fanSpin: 0, t: 0, nozM: new THREE.Matrix4(), nozM1: new THREE.Matrix4(),
  };
  const pilotCtx = { stick: null, airspeed: 0, rpm: 0 };
  const def = {
    id: 'f35', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.06, pitch: -0.1 },
    portrait: { center: [0, 0.06, 0.2], cockpit: [0, 0.05, 0.2], fov: 88, pitch: -0.12 },
    dims: { ...F35_DIMS }, lod: [340, 200], rpm: { idle: 0, max: 0 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createF35Livery(q),
    createMaterials: (q, l, ctx) => createF35Materials(q, l, ctx),
    buildExterior: (q, mats, ctx) => buildF35Exterior(q, mats, ctx),
    buildCockpit: (q, mats, ctx) => buildF35Cockpit(q, mats, ctx),
    stick: { pos: STICK, move(stick, cur) { stick.rotation.set(-cur.elevator * 0.2, 0, -cur.aileron * 0.2); } },
    createPilot: (q, cfg, ctx) => {
      pilotCtx.stick = ctx.stick;
      const av = createAviator({ quality: q, cfg, seat: SEAT, outfit: 'flyer', legs: true, gripLocal: [0, 0.11, 0], elbowOut: 0.9, leftHand: (cur) => throttleKnob(cur.throttle) });
      // closed canopy: the scarf never streams (airspeed 0 keeps it tucked down behind the seat)
      return { get mesh() { return av.mesh; }, update: (dt, cur) => av.update(dt, cur, pilotCtx), setHideBody: av.setHideBody, setConfig: av.setConfig, get config() { return av.config; }, dispose: av.dispose };
    },
    onLivery(L, ext, fars) { J.fars = fars; },
    animate(ext, cur, dt) {
      const h = ext.hinges;
      const fl = Math.max(0, cur.flaps) * MAX.flapDown;
      h.flapR.rotation.x = fl - cur.aileron * MAX.flap;
      h.flapL.rotation.x = fl + cur.aileron * MAX.flap;
      const e = cur.elevator * MAX.stab;
      h.stabR.rotation.x = -(e + cur.aileron * MAX.stabRoll);
      h.stabL.rotation.x = -(e - cur.aileron * MAX.stabRoll);
      h.rudR.rotation.x = cur.rudder * MAX.rudder;
      h.rudL.rotation.x = cur.rudder * MAX.rudder;
      stepJet(ext, cur, dt);
    },
  };

  // the far LODs are baked into one mesh each (and the low-tier shadow proxy copies far2 vertex for vertex):
  // retracting collapses the gear's vertex range there, lowering restores it
  let farDown = true;
  function farGear(down) {
    if (down === farDown || !J.fars) return;
    farDown = down;
    const targets = J.fars.filter((f) => f.merged?.ranges.gear).map((f) => [f.merged.mesh.geometry, f.merged.ranges.gear]);
    const f2 = J.fars[1]?.merged;
    if (J.shadow && f2?.ranges.gear) targets.push([J.shadow.geometry, f2.ranges.gear]);
    for (const [g, [a, n]] of targets) {
      const P = g.attributes.position;
      if (!g.userData.gearRest) g.userData.gearRest = P.array.slice(a * 3, (a + n) * 3);
      if (down) P.array.set(g.userData.gearRest, a * 3);
      else P.array.fill(0, a * 3, (a + n) * 3);
      P.needsUpdate = true;
    }
  }
  function ease(k, rate, dt) { const d = J.target[k] - J.cur[k], m = rate * dt; J.cur[k] += Math.abs(d) <= m ? d : Math.sign(d) * m; }
  const smooth = (x) => x * x * (3 - 2 * x);
  let poseDoor = null, poseNoz = null;
  function stepJet(ext, cur, dt) {
    J.t += dt;
    ease('nozzle', RATE.nozzle, dt); ease('liftFan', RATE.liftFan, dt); ease('gear', RATE.gear, dt);
    const abT = J.target.ab == null ? THREE.MathUtils.smoothstep(cur.throttle, 0.95, 1.0) : J.target.ab;
    J.cur.ab += (abT - J.cur.ab) * (1 - Math.exp(-dt * RATE.ab * 3));
    // nozzle: two segments, each turning half the angle
    if (J.cur.nozzle !== J.posed.nozzle) {
      J.posed.nozzle = J.cur.nozzle;
      const a = smooth(J.cur.nozzle) * NOZ.maxDeg * D2R, I = ext.nozInfo;
      rotAbout(J.nozM1, I.p1, [1, 0, 0], a / 2);
      J.nozM.copy(J.nozM1).multiply(rotAbout(_m, I.p2, [1, 0, 0], a / 2));
      if (!poseNoz) poseNoz = poser(ext.meshes.nozzle);
      poseNoz(I.seg1, J.nozM1); poseNoz(I.seg2, J.nozM);
      ext.exit.matrix.copy(J.nozM); ext.exit.matrixWorldNeedsUpdate = true;
    }
    if (ext.doorInfo && J.cur.liftFan !== J.posed.liftFan) {
      J.posed.liftFan = J.cur.liftFan;
      if (!poseDoor) poseDoor = poser(ext.meshes.doors);
      const o = J.cur.liftFan;
      ext.doorInfo.forEach((d, i) => poseDoor(d.r, rotAbout(_m, d.p, d.axis, d.max * smooth(clamp(i === 1 ? o * 1.4 - 0.2 : i >= 2 ? o * 1.25 : o, 0, 1)))));
    }
    if (ext.rotor) {
      const spin = J.cur.liftFan;
      ext.rotor.visible = spin > 0.02;
      J.fanSpin += dt * (2 + 34 * spin * spin);
      ext.rotor.rotation.y = J.fanSpin;
    }
    if (J.cur.gear !== J.posed.gear) {
      J.posed.gear = J.cur.gear;
      const g = smooth(J.cur.gear);
      ext.gearGroup.scale.y = Math.max(0.02, g);
      ext.gearGroup.visible = g > 0.03;
      farGear(g > 0.5);
    }
    if (ext.flame) {
      const ab = J.cur.ab;
      ext.flame.visible = ab > 0.01;
      if (ext.flame.visible) {
        const fl = 0.9 + 0.06 * Math.sin(J.t * 53) + 0.04 * Math.sin(J.t * 31 + 1);
        ext.flame.scale.set(0.82 + 0.18 * ab, 0.82 + 0.18 * ab, (0.35 + 0.65 * ab) * fl);
        ext.flame.material.opacity = Math.min(1, ab * 1.2) * (0.92 + 0.08 * Math.sin(J.t * 41));
      }
    }
  }

  return assembleRig(def, opts).then((rig) => {
    const ext = rig._ext;
    // ---- visual hooks (docs/PLANES.md "f35") ----
    const set = (k, v, now) => { J.target[k] = clamp(+v || 0, 0, 1); if (now) J.cur[k] = J.target[k]; };
    rig.setNozzle = (a, now = false) => set('nozzle', a, now);
    rig.setLiftFan = (o, now = false) => set('liftFan', o, now);
    rig.setGear = (d, now = false) => set('gear', d, now);
    rig.setAfterburner = (v) => { J.target.ab = v == null ? null : clamp(+v || 0, 0, 1); };
    rig.jetState = () => ({ nozzle: J.cur.nozzle, nozzleDeg: smooth(J.cur.nozzle) * NOZ.maxDeg, liftFan: J.cur.liftFan, gear: J.cur.gear, afterburner: J.cur.ab, auto: J.target.ab == null });
    // exhaust point + direction in root-local coordinates (for FX / sound / ground blast)
    const _p = new THREE.Vector3(), _d = new THREE.Vector3();
    rig.exhaust = (outPos = new THREE.Vector3(), outDir = new THREE.Vector3()) => {
      _p.set(0, NOZ.y, NOZ.exit).applyMatrix4(J.nozM); _d.set(0, 0, 1).transformDirection(J.nozM);
      outPos.set(_p.x, _p.y - CG.y, _p.z - CG.s); outDir.copy(_d);
      return { pos: outPos, dir: outDir };
    };
    rig.liftFanPos = () => new THREE.Vector3(0, 2.3 - CG.y, HOLE.fanTop.sc - CG.s);
    J.shadow = rig.lod.levels[0].object.getObjectByName('plane-shadow');
    // single seat: the 'center' eye is inside the pilot's helmet too, so hide head + torso in both inside views
    const setView0 = rig.setView;
    rig.setView = (v) => { setView0(v); rig._pilot?.setHideBody(rig.view !== 'chase'); };
    rig.setView(rig.view);
    J.nozM.identity(); J.nozM1.identity(); ext.exit.matrix.identity();
    rig.update(0);
    return rig;
  });
}
