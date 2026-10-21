import * as THREE from 'three';
import { Builder, monotone, naca, airfoilLoop, sweepRings, streamline, circle, latheRings, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';
import { buildTigerCockpit, throttleKnob } from './tiger_cockpit.js';

// DH.82A Tiger Moth ("Grandfather's Moth"). Build frame: y = height above ground with the fuselage datum LEVEL and
// the main wheels on y = 0; z = station aft of the propeller hub face; x = right. On the ground it sits tail-down
// at GROUND_PITCH (3-point attitude). Real: span 8.94, length 7.29, height 2.68, prop 1.98, wing area 22.2 m².
export const CG = { s: 2.2, y: 1.25 };
export const THRUST_Y = 1.43;
export const MAIN = { s: 1.62, half: 0.8, r: 0.31, w: 0.1 };
export const TAILW = { s: 6.6, r: 0.085, y: 0.98 };
export const GROUND_PITCH = Math.atan2(TAILW.y, TAILW.s - MAIN.s);
export const COCKPITS = [[1.86, 2.48], [2.86, 3.52]];
export const SEAT = { x: 0, y: 1.27, s: 3.36 };
export const EYE = { x: 0, y: 1.93, s: 3.3, pitch: -0.18 };

// [station, halfWidth, top, bottom, waist (top longeron), nTop, nBottom]
const FUS = [
  [0.12, 0.1, 1.53, 1.33, 1.43, 2, 2],
  [0.16, 0.15, 1.57, 1.18, 1.42, 2.2, 2.4],
  [0.26, 0.18, 1.6, 1.06, 1.45, 2.4, 3],
  [0.45, 0.205, 1.62, 0.98, 1.46, 2.6, 6],
  [0.9, 0.22, 1.64, 0.94, 1.48, 2.8, 6],
  [1.2, 0.27, 1.67, 0.91, 1.5, 3, 6],
  [1.38, 0.335, 1.72, 0.9, 1.53, 3, 7],
  [1.7, 0.365, 1.77, 0.89, 1.56, 2.6, 8],
  [2.4, 0.372, 1.8, 0.9, 1.58, 2.4, 8],
  [3.4, 0.36, 1.8, 0.94, 1.59, 2.4, 8],
  [4.3, 0.3, 1.74, 1.03, 1.56, 2.4, 7],
  [5.2, 0.22, 1.65, 1.14, 1.52, 2.4, 6],
  [6.1, 0.135, 1.57, 1.25, 1.48, 2.3, 5],
  [6.55, 0.075, 1.525, 1.31, 1.455, 2.2, 4],
  [6.8, 0.022, 1.5, 1.35, 1.445, 2, 3],
];
const KEYS = FUS.map((k) => k[0]);
const FI = [1, 2, 3, 4, 5, 6].map((c) => monotone(KEYS, FUS.map((k) => k[c])));
export const fus = (s) => ({ w: FI[0](s), yt: FI[1](s), yb: FI[2](s), yw: FI[3](s), nt: FI[4](s), nb: FI[5](s) });
// t: 0 = top, pi/2 = right waist, pi = bottom
export function fusPt(sec, s, t, inset = 0) {
  const sn = Math.sin(t), cs = Math.cos(t), top = cs >= 0;
  const e = 2 / (top ? sec.nt : sec.nb);
  const x = (sec.w - inset) * Math.sign(sn) * Math.abs(sn) ** e;
  const y = top ? sec.yw + (sec.yt - inset - sec.yw) * Math.abs(cs) ** e : sec.yw - (sec.yw - sec.yb - inset) * Math.abs(cs) ** e;
  return [x, y, s];
}
export function fusHalfWidth(s, y) {
  const sec = fus(s), top = y >= sec.yw;
  const h = top ? (y - sec.yw) / (sec.yt - sec.yw) : (sec.yw - y) / (sec.yw - sec.yb);
  const n = top ? sec.nt : sec.nb;
  return sec.w * Math.max(0, 1 - Math.min(1, h) ** n) ** (1 / n);
}

// Wings: constant chord, outer panels swept, rounded raked tips.
const CH = 1.32, SWEEP = 0.115;
export const UPPER = { le0: 1.3, y: 2.33, centre: 0.62, half: 4.47, dihedral: Math.tan((3 * Math.PI) / 180) };
export const LOWER = { le0: 1.8, y: 0.985, root: 0.36, half: 4.4, dihedral: Math.tan((4.5 * Math.PI) / 180), ail: [1.95, 3.9], hinge: 0.74 };
export function upperSec(x) {
  const ax = Math.abs(x), W = UPPER;
  let le = W.le0 + Math.max(0, ax - W.centre) * SWEEP, c = CH, thk = 1;
  let y = W.y + Math.max(0, ax - W.centre) * W.dihedral;
  const tip = W.half - 0.42;
  if (ax > tip) { const k = (ax - tip) / (W.half - tip); const te = le + c - 0.1 * k ** 2.4; le += 0.55 * k ** 2.2; c = Math.max(0.02, te - le); thk = Math.sqrt(Math.max(0.03, 1 - k ** 2.4)); y -= 0.02 * k; }
  return { le, c, y, thk };
}
export function lowerSec(x) {
  const ax = Math.max(LOWER.root, Math.abs(x)), W = LOWER;
  let le = W.le0 + (ax - W.root) * SWEEP, c = CH, thk = 1;
  let y = W.y + (ax - W.root) * W.dihedral;
  const tip = W.half - 0.42;
  if (ax > tip) { const k = (ax - tip) / (W.half - tip); const te = le + c - 0.1 * k ** 2.4; le += 0.55 * k ** 2.2; c = Math.max(0.02, te - le); thk = Math.sqrt(Math.max(0.03, 1 - k ** 2.4)); y -= 0.02 * k; }
  return { le, c, y, thk };
}
export const STAB = { y: 1.5, half: 1.45, le: 5.92, hinge: 6.46, te: 6.81 };
export const RUD = { hinge: 6.79, bot: 1.16, top: 2.38 };
export const FOIL = naca(0.045, 0.4, 0.105);
const STRUT_X = 2.95;

// ---------- livery atlas ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.2, s0: -0.05, s1: 7.4, h0: 0.8, h1: 1.95, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.2, y1: 0.4, s0: -0.05, s1: 7.4, h0: 0.8, h1: 1.95, flip: true },
  rudL: { x0: 0, x1: 0.33, y0: 0.4, y1: 0.56, s0: 6.1, s1: 7.35, h0: 1.0, h1: 2.42, flip: false },
  rudR: { x0: 0.33, x1: 0.66, y0: 0.4, y1: 0.56, s0: 6.1, s1: 7.35, h0: 1.0, h1: 2.42, flip: true },
  tail: { x0: 0.66, x1: 1, y0: 0.4, y1: 0.56, a0: -1.6, a1: 1.6, s0: 5.85, s1: 6.95, flip: false },
  uwT: { x0: 0, x1: 1, y0: 0.56, y1: 0.69, a0: -4.6, a1: 4.6, s0: 1.2, s1: 3.2, flip: false },
  uwB: { x0: 0, x1: 1, y0: 0.69, y1: 0.78, a0: -4.6, a1: 4.6, s0: 1.2, s1: 3.2, flip: true },
  lwT: { x0: 0, x1: 1, y0: 0.78, y1: 0.88, a0: -4.5, a1: 4.5, s0: 1.7, s1: 3.6, flip: false },
  lwB: { x0: 0, x1: 1, y0: 0.88, y1: 0.975, a0: -4.5, a1: 4.5, s0: 1.7, s1: 3.6, flip: true },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'primaryDark', 'white'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];

function createTigerLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  // roughness (G): doped fabric satin, metal cowl smoother
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  {
    const g = rough.getContext('2d');
    g.fillStyle = 'rgb(0,195,0)'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(0,95,0)';
    for (const r of [REG.fusL, REG.fusR]) { const T = A.side(r), k = 256 / S; g.save(); g.setTransform(T.a * k, 0, 0, T.d * k, T.e * k, T.f * k); g.fillRect(0.1, 0.8, 1.28, 1.2); g.restore(); }
    roughTex.needsUpdate = true;
  }

  const ribs = (c, x0, x1, s0, s1, step, base) => {
    // rib tapes + faint fabric sag shading between them
    for (let x = x0; x <= x1 + 1e-6; x += step) {
      const g = c.createLinearGradient(x, 0, x + step, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
      c.fillStyle = g; c.fillRect(x, s0, step, s1 - s0);
      c.fillStyle = shade(base, 1.06); c.fillRect(x - 0.018, s0, 0.036, s1 - s0);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x - 0.019, s0, 0.004, s1 - s0); c.fillRect(x + 0.015, s0, 0.004, s1 - s0);
    }
  };

  function paintSide(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 10, 3);
    // fabric stringer shading on the rear decking + longeron line
    c.fillStyle = 'rgba(0,0,0,0.05)';
    for (let k = 0; k < 4; k++) { c.beginPath(); for (let s = 3.5; s <= 6.8; s += 0.1) { const f = fus(s); c.lineTo(s, f.yw + (f.yt - f.yw) * (0.25 + k * 0.22)); } for (let s = 6.8; s >= 3.5; s -= 0.1) { const f = fus(s); c.lineTo(s, f.yw + (f.yt - f.yw) * (0.25 + k * 0.22) - 0.012); } c.closePath(); c.fill(); }
    // metal forward fuselage + cowl in secondary
    c.fillStyle = secondary;
    c.beginPath(); c.moveTo(-1, 0); c.lineTo(1.38, 0); c.lineTo(1.38, 3); c.lineTo(-1, 3); c.closePath(); c.fill();
    c.fillStyle = shade(secondary, 0.9);
    c.beginPath(); c.moveTo(1.38, 0); c.lineTo(1.84, 0); c.lineTo(1.84, 1.56); c.lineTo(1.38, 1.53); c.closePath(); c.fill();
    // cowl panel lines, louvres, Dzus fasteners
    c.strokeStyle = 'rgba(10,10,12,0.55)'; c.lineWidth = 0.007;
    c.beginPath(); c.moveTo(0.3, 1.47); c.lineTo(1.36, 1.5); c.moveTo(0.28, 1.0); c.lineTo(1.36, 0.95); c.moveTo(1.36, 0.85); c.lineTo(1.36, 1.75); c.moveTo(0.85, 1.48); c.lineTo(0.85, 0.96); c.moveTo(1.84, 0.85); c.lineTo(1.84, 1.6); c.stroke();
    // small cooling louvres high on the cowl, cylinder-head bulges low down
    for (let i = 0; i < 9; i++) { const x = 0.45 + i * 0.075; c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.roundRect(x, 1.36, 0.045, 0.014, 0.006); c.fill(); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x, 1.375, 0.045, 0.004); }
    for (let i = 0; i < 4; i++) { const x = 0.5 + i * 0.2, g = c.createRadialGradient(x, 1.1, 0.01, x, 1.1, 0.08); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(0,0,0,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); c.fillStyle = g; c.beginPath(); c.ellipse(x, 1.1, 0.08, 0.06, 0, 0, 7); c.fill(); }
    for (let i = 0; i < 6; i++) for (const y of [1.45, 1.03]) { c.fillStyle = 'rgba(20,20,22,0.6)'; c.beginPath(); c.arc(0.4 + i * 0.18, y, 0.009, 0, 7); c.fill(); }
    // cheat line along the top longeron, accent pinstripes
    c.fillStyle = accent;
    c.beginPath(); for (let s = 0.2; s <= 7.0; s += 0.05) c.lineTo(s, fus(s).yw + 0.01); for (let s = 7.0; s >= 0.2; s -= 0.05) c.lineTo(s, fus(s).yw - 0.035); c.closePath(); c.fill();
    c.fillStyle = shade(primary, 0.86);
    c.beginPath(); for (let s = 1.84; s <= 7.0; s += 0.05) c.lineTo(s, fus(s).yb + 0.06); for (let s = 7.0; s >= 1.84; s -= 0.05) c.lineTo(s, fus(s).yb - 0.1); c.closePath(); c.fill();
    // footstep + locker door
    c.strokeStyle = 'rgba(10,10,12,0.45)'; c.lineWidth = 0.006;
    c.fillStyle = 'rgba(10,10,12,0.75)'; c.beginPath(); c.roundRect(2.62, 1.05, 0.12, 0.06, 0.02); c.fill();
    // fabric lacing along the bottom longeron
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let s = 1.9; s < 6.9; s += 0.06) c.fillRect(s, fus(s).yb + 0.035, 0.03, 0.006);
    const nameCol = pick(primary, [secondary, accent], 3);
    const sl = Math.atan2(fus(5.2).yw - fus(4.0).yw, 1.2) * 0.6;
    A.text(c, T, L.display, 4.5, (fus(4.5).yw + fus(4.5).yb) / 2 + 0.03, 1.75, 0.27, { fill: nameCol, stroke: accent !== nameCol ? accent : null, slope: -sl });
    const regCol = pick(primary, ['#15181d', secondary], 4.2);
    A.text(c, T, L.registration, 5.95, (fus(5.95).yw + fus(5.95).yb) / 2 + 0.01, 0.85, 0.13, { font: '700', fill: regCol, slope: -sl });
  }
  function paintRudder(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(6.0, 0.8, 2, 2);
    // rudder in secondary with an accent edge band, crest in the middle
    c.fillStyle = accent; c.fillRect(RUD.hinge - 0.008, 0.8, 1, 2);
    c.fillStyle = secondary; c.fillRect(RUD.hinge + 0.03, 0.8, 1, 2);
    crest(c, T, RUD.hinge + 0.25, 1.66, 0.46, { field: shade(secondary, 0.65), field2: accent === '#e8b21c' ? '#a3162a' : shade(accent, 0.8), gold: '#e3bc55' });
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.006;
    for (let y = 1.2; y < 2.3; y += 0.16) { c.beginPath(); c.moveTo(RUD.hinge, y); c.lineTo(7.4, y + 0.02); c.stroke(); }
  }
  function paintTail(c, L) {
    c.fillStyle = L.primary; c.fillRect(-2, 5.9, 4, 1.4);
    ribs(c, -1.4, 1.4, 5.9, 7.2, 0.24, L.primary);
    c.fillStyle = L.accent; c.fillRect(-2, STAB.hinge - 0.01, 4, 0.02);
  }
  function paintWing(c, T, L, which) {
    const { primary, secondary, accent } = L;
    const up = which[0] === 'u', top = which[1] === 'T';
    c.fillStyle = primary; c.fillRect(-5, 1, 10, 3);
    ribs(c, up ? -4.2 : -4.2, 4.2, 1, 4, 0.29, primary);
    // tips in secondary with an accent pinstripe
    for (const sg of [-1, 1]) {
      c.fillStyle = secondary; c.fillRect(sg > 0 ? 3.75 : -6, 1, 2.25, 3);
      c.fillStyle = accent; c.fillRect(sg > 0 ? 3.7 : -3.75, 1, 0.05, 3);
    }
    const sec = up ? upperSec : lowerSec;
    // leading-edge plywood / slat line
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.008;
    for (const sg of [-1, 1]) {
      c.beginPath(); for (let x = 0.4; x <= 4.0; x += 0.1) { const w = sec(x * sg); c.lineTo(x * sg, w.le + 0.16); } c.stroke();
      if (up && top) { c.beginPath(); c.moveTo(sg * 2.2, upperSec(2.2).le + 0.1); c.lineTo(sg * 3.9, upperSec(3.9).le + 0.1); c.stroke(); }
    }
    if (!up) {
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.008;
      for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * LOWER.ail[0], lowerSec(LOWER.ail[0]).le + LOWER.hinge * CH); c.lineTo(sg * LOWER.ail[1], lowerSec(LOWER.ail[1]).le + LOWER.hinge * CH); c.stroke(); }
      if (top) {
        // black anti-slip walkways at the roots
        c.fillStyle = '#18191b';
        for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 0.36, 1.86); c.lineTo(sg * 0.78, 1.91); c.lineTo(sg * 0.78, 2.62); c.lineTo(sg * 0.36, 2.62); c.closePath(); c.fill(); }
      }
    }
    if (up) {
      // centre-section tank in secondary
      c.fillStyle = secondary; c.fillRect(-0.62, 1, 1.24, 3);
      c.fillStyle = accent; c.fillRect(-0.64, 1, 0.025, 3); c.fillRect(0.615, 1, 0.025, 3);
      if (top) { c.fillStyle = '#c9ced3'; c.beginPath(); c.arc(0, 1.68, 0.045, 0, 7); c.fill(); c.fillStyle = '#5d6166'; c.beginPath(); c.arc(0, 1.68, 0.025, 0, 7); c.fill(); }
    }
    const colT = pick(primary, ['#15181d', secondary], 4.2), nameCol = pick(primary, [secondary, accent], 3);
    if (up && top) {
      A.text(c, T, L.display, -2.15, 2.03, 2.65, 0.74, { fill: nameCol, stroke: accent !== nameCol ? accent : null, strokeW: 7, plan: true });
      A.text(c, T, L.registration, 2.15, 2.03, 2.65, 0.66, { font: '700', fill: colT, plan: true });
    }
    if (!up && !top) for (const sg of [-1, 1]) A.text(c, T, L.registration, sg * 2.4, 2.48, 2.7, 0.62, { font: '700', fill: colT, plan: true });
  }
  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    A.region(ctx, REG.fusL, A.side(REG.fusL), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.fusR, A.side(REG.fusR), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.rudL, A.side(REG.rudL), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.rudR, A.side(REG.rudR), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.tail, A.plan(REG.tail), (c) => paintTail(c, L));
    for (const k of ['uwT', 'uwB', 'lwT', 'lwB']) A.region(ctx, REG[k], A.plan(REG[k]), (c, T) => paintWing(c, T, L, k.slice(0, 1) + k.slice(2)));
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, metal: '#a7acb1', dark: '#24262a', black: '#0c0d0f', primaryDark: shade(L.primary, 0.8), white: '#f2f2ee' };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createTigerMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.12, clearcoatRoughness: 0.45 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('tiger-trim');
  const prop = pbrMaterial('tiger-prop', { clearcoat: high ? 0.8 : 0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb8c6cf, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const interior = pbrMaterial('tiger-int');
  const list = [paint, trim, prop, glass, disc, lights, beacon, interior];
  return { paint, trim, prop, glass, disc, lights, beacon, interior, all: () => list };
}

const COL = {
  tire: srgb('#151618'), steel: srgb('#8f959b'), dark: srgb('#26282b'), black: srgb('#0d0e10'), leather: srgb('#4a2b18'),
  int: srgb('#5d6152'), intDark: srgb('#3d4036'), floor: srgb('#5a4630'), wood: srgb('#6a3418'), woodDark: srgb('#4a2010'),
  brass: srgb('#c79a45'), alu: srgb('#9aa0a5'), exhaust: srgb('#5c4a3e'), exhaustHot: srgb('#7d5b46'), chrome: srgb('#d3d7db'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

export function buildTigerExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const swP = () => sw('primary'), swS = () => sw('secondary');

  // ---------- fuselage: lower shell full length, decking with the two cockpit openings left open ----------
  const Nh = T.n(12, 4), Nd = T.n(12, 4);
  const stations = T.far ? [0.12, 0.165, 0.25] : [0.12, 0.13, 0.145, 0.165, 0.2, 0.25, 0.32];
  for (let s = 0.42; s < 6.76; s += T.step(0.16)) stations.push(+s.toFixed(3));
  for (const [a, b] of COCKPITS) stations.push(a, b);
  stations.push(6.8);
  const st = [...new Set(stations)].sort((a, b) => a - b);
  const arc = (s, t0, t1, N, inset = 0) => { const sec = fus(s), r = []; for (let j = 0; j <= N; j++) r.push(fusPt(sec, s, lerp(t0, t1, j / N), inset)); return r; };
  const out = (p) => [p[0], p[1] - fus(p[2]).yw, 0];
  const sideUV = (p) => uvSide(p[0] >= 0 ? REG.fusR : REG.fusL, p[2], p[1]);
  // right half then left half so UV regions never blend across the keel
  body.loft(st.map((s) => arc(s, Math.PI / 2, Math.PI, Nh)), { closed: false, out, uv: sideUV });
  body.loft(st.map((s) => arc(s, Math.PI, 1.5 * Math.PI, Nh)), { closed: false, out, uv: sideUV });
  const deckSpans = [[st[0], COCKPITS[0][0]], [COCKPITS[0][1], COCKPITS[1][0]], [COCKPITS[1][1], 6.8]];
  for (const [a, b] of deckSpans) {
    const ss = st.filter((s) => s >= a - 1e-6 && s <= b + 1e-6);
    body.loft(ss.map((s) => arc(s, 0, Math.PI / 2, Nd)), { closed: false, out, uv: sideUV });
    body.loft(ss.map((s) => arc(s, -Math.PI / 2, 0, Nd)), { closed: false, out, uv: sideUV });
  }
  // nose and stern caps
  for (const [s, dir] of [[st[0], -1], [6.8, 1]]) {
    const ring = arc(s, 0, 2 * Math.PI, 2 * (Nh + Nd)).slice(0, -1);
    fan(body, ring, [0, 0, dir], sw(dir < 0 ? 'secondary' : 'primary'));
  }

  // ---------- cockpits: coaming rolls, inner tubs, bulkheads, seats, windscreens ----------
  const floorY = 1.0;
  for (const [ci, [s0, s1]] of COCKPITS.entries()) {
    // padded leather coaming around the opening
    const path = [];
    const nA = T.n(18, 6), nS = T.i(6, 2);
    for (let j = 0; j <= nA; j++) path.push(fusPt(fus(s0), s0, lerp(-Math.PI / 2, Math.PI / 2, j / nA)));
    for (let k = 1; k < nS; k++) { const s = lerp(s0, s1, k / nS); path.push(fusPt(fus(s), s, Math.PI / 2)); }
    for (let j = 0; j <= nA; j++) path.push(fusPt(fus(s1), s1, lerp(Math.PI / 2, -Math.PI / 2, j / nA)));
    for (let k = 1; k < nS; k++) { const s = lerp(s1, s0, k / nS); path.push(fusPt(fus(s), s, -Math.PI / 2)); }
    path.push(path[0], path[1]);
    if (!T.lod2) trim.loft(sweepRings(path, circle(T.n(10, 4), 0.017)), { color: COL.leather, uv: () => RM.leatherWorn });
    // inner tub: U section inside the shell
    const U = (s, inset) => {
      const sec = fus(s), r = [], K = T.i(5, 2);
      for (let k = 0; k <= K; k++) { const y = lerp(sec.yw, floorY, k / K); r.push([-(fusHalfWidth(s, y) - inset), y, s]); }
      for (let k = 0; k <= K; k++) { const y = lerp(floorY, sec.yw, k / K); r.push([fusHalfWidth(s, y) - inset, y, s]); }
      return r;
    };
    const tubSt = [s0 + 0.01, (s0 + s1) / 2, s1 - 0.01];
    trim.loft(tubSt.map((s) => U(s, 0.018)), { closed: false, out: (p) => [-p[0], -(p[1] - 1.4), 0], color: (p) => (p[1] < floorY + 0.02 ? COL.floor : COL.int), uv: () => RM.cloth });
    for (const [s, facing] of [[s0 + 0.012, 1], [s1 - 0.012, -1]]) {
      const ring = [...U(s, 0.018).slice(0, -1)];
      const top = arc(s, Math.PI / 2, -Math.PI / 2, T.n(10, 4), 0.02).slice(1, -1);
      ring.push(...top.reverse().map((p) => [p[0], p[1], s]).reverse());
      fan(trim, ring, [0, 0, facing], RM.cloth, facing > 0 ? COL.intDark : COL.int);
    }
    if (T.detail) {
      // bucket seat back + cushion
      const ss = s1 - 0.16;
      trim.addGeo(new THREE.CylinderGeometry(0.24, 0.22, 0.42, T.n(14), 1, true, -Math.PI / 2 - 1.1, 2.2), M4(0, floorY + 0.36, ss, 1, 1, 0.7), RM.darkMetal, COL.dark);
      trim.addGeo(new THREE.BoxGeometry(0.4, 0.07, 0.36), M4(0, floorY + 0.17, ss - 0.12), RM.leather, COL.leather);
      trim.addGeo(new THREE.BoxGeometry(0.36, 0.3, 0.05), M4(0, floorY + 0.38, ss + 0.11, 1, 1, 1, 0.12, 0, 0), RM.leather, COL.leather);
    }
    // windscreen: small curved perspex with a thin aluminium rim and side posts
    const ws = s0 - 0.035, wsH = ci === 0 ? 0.12 : 0.13, R = 0.22, span = 0.62, nW = T.n(12, 4);
    const yb = fus(ws).yt - 0.045, rake = 0.55;
    const rows = [];
    for (let i = 0; i <= 2; i++) {
      const v = i / 2, h = v * wsH, r = [];
      for (let j = 0; j <= nW; j++) {
        const a = lerp(-span, span, j / nW);
        const drop = (1 - Math.cos(a)) * 0.16 * (1 - v);
        r.push([Math.sin(a) * R * (1 - 0.12 * v), yb + h - drop, ws + h * Math.tan(rake) - (Math.cos(a) - 1) * R * 0.5]);
      }
      rows.push(r);
    }
    glass.loft(rows, { closed: false, out: () => [0, 0.3, -1] });
    if (!T.lod2) {
      const rim = (pts) => trim.loft(sweepRings(pts, circle(T.n(6, 4), 0.004)), { color: COL.alu, uv: () => RM.steel, capStart: true, capEnd: true });
      rim(rows[2]);
    }
  }

  // ---------- wings ----------
  const nC = T.n(22, 6), wingStep = T.step(0.36);
  const span = (a, b, step) => { const n = Math.max(1, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const ring = (secFn, x, loop, bump) => {
    const w = secFn(x);
    return loop.map(([xc, yv], j) => {
      let yy = yv * w.c * w.thk;
      if (bump && yv > 0) yy += bump(x) * Math.sin(Math.PI * Math.min(1, xc / 0.95)) ** 0.9 * (xc < 0.95 ? 1 : 0);
      return [x, w.y + yy, w.le + xc * w.c];
    });
  };
  const panel = (B, secFn, xs, cFrom, cTo, roundNose, regT, regB, caps = [true, true], bump = null) => {
    const { loop, topCount } = airfoilLoop(FOIL, nC, cFrom, cTo, roundNose);
    const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
    B.loft(xs.map((x) => ring(secFn, x, loop, bump)), {
      out: () => [0, 1, 0],
      splits: [[0, top, (p) => uvPlan(regT, p[0], p[2])], [top, loop.length, (p) => uvPlan(regB, p[0], p[2])]],
      capStart: caps[0], capEnd: caps[1], capUV: () => sw('primary'),
    });
  };
  const tipXs = (half, sign, from) => {
    const r = span(from, half - 0.42, wingStep);
    const K = T.i(6, 2);
    for (let k = 1; k <= K; k++) r.push(half - 0.42 + 0.42 * (1 - (1 - k / K) ** 1.6));
    return r.map((x) => x * sign);
  };
  // upper wing: one loft tip to tip, fuel tank bulge over the centre section
  const tank = (x) => { const ax = Math.abs(x); return ax < 0.5 ? 0.085 : ax < 0.62 ? 0.085 * (1 - ((ax - 0.5) / 0.12) ** 2) : 0; };
  {
    const xs = [...tipXs(UPPER.half, -1, UPPER.centre).reverse(), -0.56, -0.5, -0.25, 0, 0.25, 0.5, 0.56, ...tipXs(UPPER.half, 1, UPPER.centre)];
    panel(body, upperSec, xs, 0, 1, false, REG.uwT, REG.uwB, [true, true], tank);
  }
  // lower wings with ailerons
  const H = LOWER.hinge, A0 = LOWER.ail[0], A1 = LOWER.ail[1];
  const pieces = {};
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg);
    const inner = span(LOWER.root, A0, wingStep);
    panel(body, lowerSec, S(inner), 0, 1, false, REG.lwT, REG.lwB);
    panel(body, lowerSec, S(span(A0, A1, wingStep)), 0, H, false, REG.lwT, REG.lwB);
    panel(body, lowerSec, tipXs(LOWER.half, sg, A1), 0, 1, false, REG.lwT, REG.lwB);
    const a = A0 + 0.015, b = A1 - 0.015;
    const B = new Builder();
    panel(B, lowerSec, S(span(a, b, wingStep)), H + 0.006, 1, true, REG.lwT, REG.lwB);
    const hp = (x) => { const w = lowerSec(x); const [yu, yl] = FOIL(H + 0.012); return [x, w.y + ((yu + yl) / 2) * w.c, w.le + (H + 0.012) * w.c]; };
    pieces[sg > 0 ? 'ailR' : 'ailL'] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
  }

  // ---------- struts (paint, secondary) ----------
  const strutProf = (c, t) => streamline(T.n(12, 4), c, t);
  const strut = (B, a, b, c = 0.068, t = 0.022, uv = swP) => {
    const path = [];
    for (let k = 0; k <= 3; k++) path.push([lerp(a[0], b[0], k / 3), lerp(a[1], b[1], k / 3), lerp(a[2], b[2], k / 3)]);
    B.loft(sweepRings(path, strutProf(c, t), { upHint: [0, 0, 1] }), { uv, capStart: true, capEnd: true, capUV: uv });
  };
  const lowTop = (x, f) => { const w = lowerSec(x); return [x, w.y + FOIL(f)[0] * w.c * w.thk - 0.005, w.le + f * w.c]; };
  const upBot = (x, f) => { const w = upperSec(x); return [x, w.y + FOIL(f)[1] * w.c * w.thk + 0.005, w.le + f * w.c]; };
  const strutPts = [];
  for (const sg of [1, -1]) {
    const xl = sg * STRUT_X, xu = sg * (STRUT_X + 0.08);
    for (const f of [0.18, 0.66]) {
      const a = lowTop(xl, f), b = upBot(xu, f + 0.04);
      strut(body, a, b);
      strutPts.push({ sg, f, a, b });
    }
    // cabane: front + rear legs and a diagonal
    const cf = [sg * 0.29, fus(1.4).yw + 0.03, 1.4], cr = [sg * 0.33, fus(2.05).yw + 0.03, 2.05];
    const uf = upBot(sg * 0.4, 0.15), ur = upBot(sg * 0.4, 0.7);
    const swM = () => sw('metal');
    strut(body, cf, uf, 0.05, 0.02, swM); strut(body, cr, ur, 0.05, 0.02, swM);
    if (T.detail) strut(body, cf, ur, 0.04, 0.016, swM);
  }

  // ---------- rigging wires (streamline RAF wires) ----------
  if (!T.lod2) {
    const wr = T.high ? 0.0055 : T.low ? 0.0075 : 0.01, ws = T.high ? 6 : 4;
    const wire = (a, b) => { const prof = circle(ws, 1).map(([x, y]) => [x * wr * 1.6, y * wr * 0.6]); trim.loft(sweepRings([a, b], prof, { upHint: [0, 0, 1] }), { color: COL.steel, uv: () => RM.chrome }); };
    for (const sg of [1, -1]) {
      const rootLow = (f) => { const w = lowerSec(sg * 0.42); return [sg * 0.42, w.y + 0.02, w.le + f * w.c]; };
      const rootUp = (f) => upBot(sg * 0.42, f);
      for (const f of [0.18, 0.66]) {
        const sp = strutPts.find((p) => p.sg === sg && p.f === f);
        // flying wires (doubled on the front spar) and landing wires
        wire(rootLow(f), [sp.b[0] - sg * 0.04, sp.b[1] + 0.01, sp.b[2]]);
        if (f < 0.5 && T.detail) wire([rootLow(f)[0], rootLow(f)[1], rootLow(f)[2] + 0.05], [sp.b[0] - sg * 0.04, sp.b[1] + 0.01, sp.b[2] + 0.05]);
        wire(rootUp(f + 0.04), [sp.a[0] - sg * 0.04, sp.a[1] + 0.01, sp.a[2]]);
      }
      if (T.detail) {
        // incidence wire between the interplane struts, tail bracing
        const fr = strutPts.filter((p) => p.sg === sg);
        wire(fr[0].a, fr[1].b);
        wire([sg * 0.9, STAB.y + 0.02, STAB.le + 0.25], [0, 1.98, 6.62]);
        wire([sg * 0.9, STAB.y - 0.02, STAB.le + 0.25], [sg * 0.05, fus(6.3).yb + 0.02, 6.3]);
      }
    }
  }

  // ---------- tail ----------
  const sym = naca(0, 0.4, 0.085);
  const stabSec = (x) => {
    const ax = Math.abs(x), k = clamp((ax - (STAB.half - 0.4)) / 0.4, 0, 1);
    const le = STAB.le + 0.08 * (ax / STAB.half) + 0.34 * k ** 2.2, te = STAB.te - 0.08 * k ** 2.6 - (ax < 0.16 ? 0.24 * (1 - ax / 0.16) ** 0.5 : 0);
    return { le, te, c: te - le, thk: Math.sqrt(Math.max(0.05, 1 - k ** 3)) };
  };
  const tailRing = (x, f0, f1, roundNose) => {
    const s = stabSec(x), fh = (STAB.hinge - s.le) / s.c;
    const { loop } = airfoilLoop(sym, T.n(14, 6), f0 === 'h' ? fh + 0.012 : f0, f1 === 'h' ? fh : f1, roundNose);
    return loop.map(([xc, yv]) => [x, STAB.y + yv * s.c * s.thk, s.le + xc * s.c]);
  };
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  const stabXs = []; { const K = T.n(14, 4); for (let k = 0; k <= K; k++) stabXs.push(-STAB.half + 2 * STAB.half * (0.5 - 0.5 * Math.cos(Math.PI * k / K))); }
  body.loft(stabXs.map((x) => tailRing(x, 0, 'h', false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  const elev = new Builder();
  for (const sg of [1, -1]) {
    const xs = stabXs.filter((x) => x * sg >= 0.07);
    if (sg > 0) xs.unshift(0.07); else xs.push(-0.07);
    elev.loft(xs.map((x) => tailRing(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  }
  pieces.elevator = { B: elev, a: [-1, STAB.y, STAB.hinge + 0.012], b: [1, STAB.y, STAB.hinge + 0.012] };
  // fin + rudder (DH outline: small fin, big rounded rudder with a horn balance)
  const sym10 = naca(0, 0.4, 0.09);
  const finLe = (y) => lerp(6.2, 6.66, (y - 1.49) / (2.06 - 1.49)) - 0.07 * Math.sin(Math.PI * clamp((y - 1.49) / 0.57, 0, 1));
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.rudR : REG.rudL, p[2], p[1]);
  {
    const ys = []; const K = T.i(8, 3);
    for (let k = 0; k <= K; k++) ys.push(lerp(1.47, 2.04, k / K));
    const R = ys.map((y) => {
      const le = finLe(y), te = RUD.hinge - 0.012, c = te - le;
      const { loop } = airfoilLoop(sym10, T.n(12, 6), 0, 1, false);
      return loop.map(([xc, yv]) => [yv * c * (y > 2.0 ? 0.6 : 1), y, le + xc * c]);
    });
    body.loft(R, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
  }
  const rudTe = (y) => { const t = clamp((y - RUD.bot) / (RUD.top - RUD.bot), 0, 1); return RUD.hinge + 0.05 + 0.45 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.9) ** 2)) ** 0.6; };
  const rudLe = (y) => (y > 2.06 ? RUD.hinge - 0.15 * Math.sin(Math.PI * clamp((y - 2.06) / (RUD.top - 2.06), 0, 1) ** 0.6) : y < 1.33 ? RUD.hinge + 0.012 + 0.1 * ((1.33 - y) / 0.27) ** 2 : RUD.hinge + 0.012);
  {
    const rud = new Builder(), ys = [], K = T.i(14, 5);
    for (let k = 0; k <= K; k++) ys.push(lerp(RUD.bot, RUD.top, 0.5 - 0.5 * Math.cos(Math.PI * k / K)));
    const R = ys.map((y) => {
      let le = rudLe(y), te = rudTe(y);
      const t = (y - RUD.bot) / (RUD.top - RUD.bot);
      if (t < 0.03 || t > 0.97) te = Math.max(le + 0.03, te);
      const c = Math.max(0.02, te - le), thk = Math.sqrt(Math.max(0.05, 1 - (2 * t - 1) ** 8));
      const { loop } = airfoilLoop(sym10, T.n(12, 6), 0, 1, false);
      return loop.map(([xc, yv]) => [yv * c * thk * 0.9, y, le + xc * c]);
    });
    rud.loft(R, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    pieces.rudder = { B: rud, a: [0, RUD.bot, RUD.hinge + 0.015], b: [0, RUD.top, RUD.hinge + 0.015] };
  }

  // ---------- landing gear ----------
  const axle = (sg) => [sg * MAIN.half, MAIN.r, MAIN.s];
  for (const sg of [1, -1]) {
    const ax = axle(sg);
    const legTop = [sg * 0.31, fus(1.36).yb + 0.06, 1.36], rearTop = [sg * 0.33, fus(2.1).yb + 0.03, 2.1], vTop = [sg * 0.04, fus(1.8).yb + 0.01, 1.8];
    const near = [ax[0] - sg * 0.07, ax[1] + 0.06, ax[2] - 0.01];
    // shock leg with a fairing sleeve (paint), rear strut and the V radius rod (steel)
    strut(body, legTop, near, 0.09, 0.05, swS);
    rod(trim, rearTop, [near[0], near[1], near[2] + 0.02], 0.022, T.n(8, 4), RM.paint, COL.dark);
    rod(trim, vTop, [near[0] + sg * 0.02, near[1] - 0.03, near[2]], 0.02, T.n(8, 4), RM.paint, COL.dark);
    // wheel: tyre, spoked hub under a fabric disc cover (paint secondary)
    const tire = new THREE.TorusGeometry(MAIN.r - MAIN.w * 0.45, MAIN.w * 0.45, T.n(10, 4), T.n(28, 10));
    tire.scale(1, 1, 1.15);
    trim.addGeo(tire, M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, Math.PI / 2, 0), RM.rubber, COL.tire);
    const disc = new THREE.SphereGeometry(1, T.n(20, 8), T.n(6, 3));
    body.addGeo(disc, M4(ax[0], ax[1], ax[2], 0.035, MAIN.r - MAIN.w * 0.7, MAIN.r - MAIN.w * 0.7), swS, [1, 1, 1]);
    if (T.detail) trim.addGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, COL.steel);
  }
  // tailwheel on a leaf spring
  {
    const ty = TAILW.y + TAILW.r, ts = TAILW.s;
    rod(trim, [0, fus(6.38).yb + 0.01, 6.38], [0, ty + 0.05, ts - 0.03], 0.018, T.n(6, 4), RM.paint, COL.dark);
    rod(trim, [0, ty + 0.05, ts - 0.03], [0, ty, ts], 0.014, T.n(6, 4), RM.steel, COL.steel);
    const tw = new THREE.TorusGeometry(TAILW.r * 0.62, TAILW.r * 0.38, T.n(8, 4), T.n(16, 8));
    trim.addGeo(tw, M4(0, ty, ts, 1, 1, 1.3, 0, Math.PI / 2, 0), RM.rubber, COL.tire);
    trim.addGeo(new THREE.CylinderGeometry(TAILW.r * 0.32, TAILW.r * 0.32, 0.05, T.n(10, 6)), M4(0, ty, ts, 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, COL.steel);
  }

  // ---------- engine details ----------
  {
    // long exhaust pipe down the left side, fishtail end
    const ex = [[-0.17, 1.02, 0.42], [-0.25, 0.98, 0.55], [-0.3, 0.98, 0.9], [-0.33, 0.99, 1.5], [-0.375, 1.0, 2.2], [-0.385, 1.0, 2.75]];
    trim.loft(sweepRings(ex, circle(T.n(10, 4), 0.042)), { color: (p) => (p[2] < 1.0 ? COL.exhaustHot : COL.exhaust), uv: () => [0.7, 0.4], capStart: true, capEnd: false });
    if (T.detail) {
      trim.addGeo(new THREE.CylinderGeometry(0.03, 0.046, 0.16, T.n(10, 6), 1, true), M4(-0.385, 1.0, 2.83, 1.6, 1, 0.6, Math.PI / 2, 0, 0), [0.7, 0.4], COL.exhaust);
      // carb intake (right), oil tank cap, venturi + pitot
      trim.addGeo(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 10), M4(0.21, 0.98, 0.75, 1, 1, 1, Math.PI / 2 + 0.2, 0, 0), RM.darkMetal, COL.black);
      trim.addGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), M4(0, 1.645, 0.7), RM.chrome, COL.chrome);
      trim.addGeo(new THREE.CylinderGeometry(0.018, 0.026, 0.16, 10), M4(-0.41, 1.4, 2.0, 1, 1, 1, Math.PI / 2, 0, 0), RM.steel, COL.steel);
      const pit = lowTop(-STRUT_X, 0.18);
      rod(trim, [pit[0], pit[1] + 0.55, pit[2] + 0.02], [pit[0], pit[1] + 0.55, pit[2] - 0.25], 0.008, 6, RM.chrome, COL.chrome);
      // fuel sight gauge under the tank, filler cap on top
      trim.addGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), M4(0.12, upBot(0.12, 0.6)[1] - 0.05, upBot(0.12, 0.6)[2]), RM.glass, srgb('#d9c38a'));
      // footsteps and hand grip
      trim.addGeo(new THREE.BoxGeometry(0.02, 0.03, 0.18), M4(-0.385, 1.43, 3.0), RM.chrome, COL.chrome);
    }
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = upperSec(sg * (UPPER.half - 0.05));
    const p = [sg * (UPPER.half - 0.04), w.y, w.le + 0.06];
    lights.addGeo(new THREE.SphereGeometry(0.03, T.n(8, 4), T.n(6, 3)), M4(...p, 0.8, 0.8, 1.3), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const p = [0, 1.5, rudTe(1.5) + 0.01]; lights.addGeo(new THREE.SphereGeometry(0.025, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }

  // ---------- propeller: varnished laminated wood, brass leading-edge tipping, bolted boss ----------
  const prop = new Builder();
  {
    const PR = 0.99, hubR = 0.095;
    prop.addGeo(new THREE.CylinderGeometry(hubR, hubR, 0.13, T.n(18, 8)), M4(0, 0, 0.0, 1, 1, 1, Math.PI / 2, 0, 0), RM.varnish, COL.wood);
    prop.addGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.025, T.n(16, 8)), M4(0, 0, -0.075, 1, 1, 1, Math.PI / 2, 0, 0), RM.steel, COL.steel);
    prop.addGeo(new THREE.SphereGeometry(0.05, T.n(12, 6), T.n(6, 3), 0, Math.PI * 2, 0, Math.PI / 2), M4(0, 0, -0.087, 1, 1, 0.6, -Math.PI / 2, 0, 0), RM.steel, COL.steel);
    if (T.detail) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; prop.addGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6), M4(Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.093, 1, 1, 1, Math.PI / 2, 0, 0), RM.brass, COL.brass); }
    const pfoil = (t) => naca(0.035, 0.4, t);
    const rs = []; const K = T.i(16, 5);
    for (let k = 0; k <= K; k++) rs.push(lerp(0.07, PR, k / K));
    rs.splice(rs.length - 1, 0, PR - 0.02, PR - 0.008);
    for (const rot of [0, Math.PI]) {
      const R = [];
      for (const r of rs) {
        const u = (r - 0.07) / (PR - 0.07);
        let c = r < 0.16 ? lerp(0.1, 0.15, (r - 0.07) / 0.09) : 0.15 + 0.02 * Math.sin(Math.PI * Math.min(1, (r - 0.16) / 0.7)) - 0.05 * u * u;
        if (r > PR - 0.06) c *= Math.sqrt(Math.max(0.12, 1 - ((r - (PR - 0.06)) / 0.062) ** 2));
        const t = lerp(0.5, 0.09, Math.min(1, u * 1.4));
        const phi = Math.atan(1.5 / (2 * Math.PI * Math.max(0.12, r)));
        const { loop } = airfoilLoop(pfoil(t), T.n(10, 4), 0, 1, false);
        const cp = Math.cos(phi), sp = Math.sin(phi);
        R.push(loop.map(([xc, yv]) => {
          const a = (xc - 0.35) * c, b = yv * c;
          const x = -cp * a - sp * b, z = sp * a - cp * b - 0.01;
          return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z];
        }));
      }
      prop.loft(R, {
        out: () => [0, 0, -1], capEnd: true, capStart: true,
        color: (p) => { const r = Math.hypot(p[0], p[1]); return r > PR - 0.09 ? COL.brass : r < 0.11 ? COL.wood : lerpC(COL.wood, COL.woodDark, 0.5 + 0.5 * Math.sin(r * 31 + p[2] * 90)); },
        uv: (p) => (Math.hypot(p[0], p[1]) > PR - 0.09 ? RM.brass : RM.varnish),
      });
    }
  }

  // ---------- assemble ----------
  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  meshes.glass = mkMesh('glass', glass, mats.glass, { cast: false, receive: false }); meshes.glass.renderOrder = 2; group.add(meshes.glass);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  const propGroup = new THREE.Group();
  propGroup.position.set(0, THRUST_Y, 0.06);
  const propMesh = new THREE.Mesh(prop.build(), mats.prop);
  propMesh.name = 'prop'; propMesh.castShadow = true;
  propGroup.add(propMesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.99, T.n(48, 16)), mats.disc);
  disc.position.z = -0.02; disc.renderOrder = 3; disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts };
}

const D2R = Math.PI / 180;
const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const MAX = { aileron: 18 * D2R, elevUp: 27 * D2R, elevDown: 20 * D2R, rudder: 24 * D2R };

export const TIGER_DIMS = { length: 7.29, span: 8.94, height: 2.68, gearHeight: CG.y, groundPitch: GROUND_PITCH };

export function createTiger(opts = {}) {
  const def = {
    id: 'tiger', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.06, pitch: -0.07 },
    portrait: { center: [0, 0.08, 0.16], cockpit: [0, 0.06, 0.14], fov: 90, pitch: -0.1 },
    // gearHeight = CG height over the main contact with the datum level; restHeight = CG height in the 3-point attitude
    dims: { ...TIGER_DIMS, restHeight: CG.y * Math.cos(GROUND_PITCH) - (CG.s - MAIN.s) * Math.sin(GROUND_PITCH) },
    lod: [240, 140], rpm: { idle: 650, max: 1500 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createTigerLivery(q),
    createMaterials: (q, l) => createTigerMaterials(q, l),
    buildExterior: (q, mats) => buildTigerExterior(q, mats),
    buildCockpit: (q, mats, ctx) => buildTigerCockpit(q, mats, ctx),
    stick: {
      pos: [0, 1.0, 3.08],
      move(stick, cur) { stick.rotation.set(cur.elevator * 0.24, 0, -cur.aileron * 0.24); },
    },
    createPilot: (q, cfg, ctx) => createAviator({
      quality: q, cfg, seat: SEAT, outfit: 'flyer', gripLocal: [0, 0.47, 0],
      leftHand: (cur) => throttleKnob(cur.throttle), elbowOut: 0.25,
      passengers: cfg.passenger === false ? [] : [{ kind: 'corgi', at: [0, 1.38, 2.3] }],
    }),
    animate(ext, cur) {
      const h = ext.hinges;
      h.ailR.rotation.x = -cur.aileron * MAX.aileron * (cur.aileron > 0 ? 1 : 0.55);
      h.ailL.rotation.x = cur.aileron * MAX.aileron * (cur.aileron < 0 ? 1 : 0.55);
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
    },
  };
  return assembleRig(def, opts);
}
