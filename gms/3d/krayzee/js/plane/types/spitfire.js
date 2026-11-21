import * as THREE from 'three';
import { Builder, monotone, naca, airfoilLoop, sweepRings, circle, latheRings, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';
import { buildPanelCockpit, paintDial, COL as CK } from './cub_cockpit.js';

// Supermarine Spitfire-ish ("Teatime"). Build frame as the Pitts: y = height above ground with the datum LEVEL and the
// mains on y = 0; z = station aft of the propeller plane; x = right. Real: span 11.23, length 9.47, wing 22.5 m²,
// four-blade prop 3.27 m. Elliptical wing, retracting main gear (outward, into the wing), split flaps, sliding hood.
// On the ground at taxi speed the hood slides back and the seat rises on the royal booster cushion (no view over the nose).
export const CG = { s: 2.6, y: 1.75 };
export const THRUST_Y = 2.05;
export const MAIN = { s: 2.05, half: 0.84, r: 0.34, w: 0.16, pivot: [0.62, 1.02] };
export const TAILW = { s: 8.35, r: 0.11, y: 1.339 };
export const GROUND_PITCH = Math.atan2(TAILW.y, TAILW.s - MAIN.s);
export const OPEN = [3.32, 4.42];
export const SEAT = { x: 0, y: 2.05, s: 3.98 };
export const EYE = { x: 0, y: 2.72, s: 3.92, pitch: -0.1 };
const FLOOR = 1.6, SILL_T = 0.95, LIFT = { eye: 0.3, pilot: 0.24, hood: 0.62 };
export const PROP = { R: 1.635, blades: 4 };

// [station, halfWidth, top, bottom, waist, nTop, nBottom]
const FUS = [
  [0.12, 0.27, 2.32, 1.78, 2.05, 2.1, 2.1],
  [0.35, 0.32, 2.38, 1.68, 2.03, 2.3, 2.2],
  [0.8, 0.37, 2.43, 1.57, 2.02, 2.5, 2.4],
  [1.5, 0.4, 2.48, 1.46, 2.0, 2.6, 2.6],
  [2.2, 0.43, 2.52, 1.24, 1.98, 2.5, 2.8],
  [2.9, 0.46, 2.54, 1.08, 1.95, 2.4, 3.0],
  [3.6, 0.46, 2.52, 1.06, 1.93, 2.3, 3.0],
  [4.4, 0.41, 2.44, 1.14, 1.92, 2.2, 2.8],
  [5.4, 0.33, 2.33, 1.3, 1.92, 2.1, 2.5],
  [6.4, 0.25, 2.23, 1.47, 1.93, 2.0, 2.3],
  [7.4, 0.17, 2.14, 1.62, 1.94, 2.0, 2.2],
  [8.2, 0.1, 2.08, 1.74, 1.95, 2.0, 2.0],
  [8.75, 0.03, 2.03, 1.86, 1.95, 2, 2],
];
const FUS_END = 8.75;
const KEYS = FUS.map((k) => k[0]);
const FI = [1, 2, 3, 4, 5, 6].map((c) => monotone(KEYS, FUS.map((k) => k[c])));
export const fus = (s) => ({ w: FI[0](s), yt: FI[1](s), yb: FI[2](s), yw: FI[3](s), nt: FI[4](s), nb: FI[5](s) });
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
const sill = (s) => fusPt(fus(s), s, SILL_T);

// elliptical wing: 25 % chord line straight, chord c0·√(1 − (x/b)²), 6° dihedral outboard of the root
export const WING = { le0: 1.85, c0: 2.5, b: 5.62, y0: 1.15, root: 0.42, dih: Math.tan((6 * Math.PI) / 180), ail: [3.35, 5.0], ailH: 0.76, flap: [0.5, 2.95], flapH: 0.8 };
export function wingSec(x) {
  const ax = Math.min(Math.abs(x), WING.b - 0.004), k = ax / WING.b;
  const c = Math.max(0.12, WING.c0 * Math.sqrt(1 - k * k));
  return { le: WING.le0 + 0.25 * (WING.c0 - c), c, y: WING.y0 + Math.max(0, ax - WING.root) * WING.dih, thk: lerp(1, 0.72, k) };
}
const FOIL = naca(0.012, 0.4, 0.13);
export const STAB = { y: 1.97, half: 1.62, le: 7.72, c0: 1.02, hinge: 0.66 };
export const FIN = { y0: 2.08, top: 3.38, le0: 7.55, c0: 1.25, hinge: 0.62 };
const stabSec = (x) => { const k = Math.min(Math.abs(x), STAB.half - 0.003) / STAB.half, c = Math.max(0.08, STAB.c0 * Math.sqrt(1 - k * k)); return { le: STAB.le + 0.3 * (STAB.c0 - c), c }; };
const finSec = (y) => { const k = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 0.997), c = Math.max(0.06, FIN.c0 * Math.sqrt(1 - k * k)); return { le: FIN.le0 + 0.42 * (FIN.c0 - c) + 0.18 * k, c }; };

// ---------- livery: the player's primary over the top, secondary underneath, accent spinner + fuselage band ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.2, s0: -0.7, s1: 9.0, h0: 0.95, h1: 3.1, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.2, y1: 0.4, s0: -0.7, s1: 9.0, h0: 0.95, h1: 3.1, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.4, y1: 0.56, s0: 7.3, s1: 9.0, h0: 1.8, h1: 3.5, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.4, y1: 0.56, s0: 7.3, s1: 9.0, h0: 1.8, h1: 3.5, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.56, y1: 0.72, a0: -5.8, a1: 5.8, s0: 1.6, s1: 4.45, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.72, y1: 0.88, a0: -5.8, a1: 5.8, s0: 1.6, s1: 4.45, flip: true },
  tail: { x0: 0, x1: 0.5, y0: 0.88, y1: 0.975, a0: -1.75, a1: 1.75, s0: 7.6, s1: 8.9, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'primaryDark', 'white', 'gold', 'purple'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];

function roundel(c, x, y, r, L) {
  c.fillStyle = ROYAL.gold; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = ROYAL.purple; c.beginPath(); c.arc(x, y, r * 0.8, 0, 7); c.fill();
  c.fillStyle = '#f4efe3'; c.beginPath(); c.arc(x, y, r * 0.52, 0, 7); c.fill();
  c.fillStyle = L.accent; c.beginPath(); c.arc(x, y, r * 0.3, 0, 7); c.fill();
}
// a teapot in profile (nose art), metres, pointing forward (-s)
function teapot(c, x, y, h, col, line) {
  c.save(); c.translate(x, y); c.scale(h, h);
  c.fillStyle = col; c.strokeStyle = line; c.lineWidth = 0.05;
  c.beginPath(); c.ellipse(0, 0, 0.5, 0.36, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-0.42, 0.05); c.quadraticCurveTo(-0.75, 0.1, -0.85, 0.38); c.lineTo(-0.75, 0.4); c.quadraticCurveTo(-0.62, 0.2, -0.38, -0.08); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(0.55, 0.02, 0.2, -1.3, 1.3); c.lineWidth = 0.09; c.stroke(); c.lineWidth = 0.05;
  c.beginPath(); c.ellipse(0, 0.36, 0.28, 0.07, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.arc(0, 0.46, 0.07, 0, 7); c.fill(); c.stroke();
  // steam
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.04;
  for (const dx of [-0.95, -0.8]) { c.beginPath(); c.moveTo(dx, 0.48); c.bezierCurveTo(dx - 0.12, 0.62, dx + 0.1, 0.72, dx - 0.04, 0.88); c.stroke(); }
  c.restore();
}

function createSpitfireLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  { const g = rough.getContext('2d'); g.fillStyle = 'rgb(0,140,0)'; g.fillRect(0, 0, 256, 256); roughTex.needsUpdate = true; }
  // the camouflage line along the side: primary above, secondary below
  const split = (s) => (s < 2.0 ? fus(s).yw - 0.18 : fus(s).yw - 0.12 + (s - 2.0) * 0.012);
  function paintSide(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 11, 4);
    c.fillStyle = secondary; c.beginPath(); c.moveTo(-1, 0); for (let s = -1; s <= 9.2; s += 0.1) c.lineTo(s, split(s)); c.lineTo(9.2, 0); c.closePath(); c.fill();
    // cowl panel lines + fasteners, exhaust glare, the wing root fillet
    c.strokeStyle = 'rgba(10,10,12,0.35)'; c.lineWidth = 0.008;
    for (const s of [0.95, 1.6, 2.15]) { c.beginPath(); c.moveTo(s, fus(s).yb + 0.06); c.lineTo(s, fus(s).yt - 0.02); c.stroke(); }
    c.beginPath(); for (let s = 0.2; s <= 2.15; s += 0.05) c.lineTo(s, fus(s).yw + 0.28); c.stroke();
    for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(20,20,22,0.45)'; c.beginPath(); c.arc(0.3 + i * 0.16, fus(0.3 + i * 0.16).yw + 0.3, 0.008, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(25,22,20,0.28)'; c.beginPath(); c.moveTo(0.5, 2.12); c.lineTo(2.4, 2.02); c.lineTo(2.4, 2.16); c.lineTo(0.5, 2.26); c.closePath(); c.fill();
    // the fuselage band near the tail (accent) and the canopy-rail stripe
    c.fillStyle = accent; c.fillRect(6.7, 0, 0.34, 4);
    c.fillStyle = shade(primary, 0.78); c.beginPath(); for (let s = 3.2; s <= 4.6; s += 0.05) c.lineTo(s, sill(s)[1] + 0.02); for (let s = 4.6; s >= 3.2; s -= 0.05) c.lineTo(s, sill(s)[1] - 0.03); c.closePath(); c.fill();
    // cockpit door outline (left side) and a little step
    c.strokeStyle = 'rgba(10,10,12,0.4)'; c.strokeRect(3.45, sill(3.6)[1] - 0.38, 0.62, 0.36);
    roundel(c, 5.05, fus(5.05).yw + 0.04, 0.24, L);
    // name in script under the windscreen, a teapot, the registration aft of the roundel
    const nameCol = pick(primary, ['#f4efe3', secondary, accent], 2.6);
    A.text(c, T, L.display, 2.25, fus(2.25).yw + 0.12, 1.3, 0.15, { fill: nameCol, stroke: shade(primary, 0.55), strokeW: 5, slope: -0.03 });
    teapot(c, 2.95, fus(2.95).yw + 0.05, 0.13, '#f4efe3', '#2a2622');
    A.text(c, T, 'TEATIME', 2.95, fus(2.95).yw - 0.1, 0.5, 0.06, { font: '800', fill: pick(secondary, ['#f4efe3', '#15181d'], 3) });
    const regCol = pick(primary, ['#f4efe3', '#15181d', accent], 3);
    A.text(c, T, L.registration, 6.0, fus(6.0).yw - 0.22, 0.75, 0.15, { font: '700', fill: pick(secondary, ['#15181d', '#f4efe3'], 3) });
    A.text(c, T, L.registration, 7.6, fus(7.6).yw + 0.03, 0.55, 0.1, { font: '700', fill: regCol });
  }
  function paintFin(c, T, L) {
    c.fillStyle = L.primary; c.fillRect(7.0, 1.5, 2.2, 2.2);
    // fin flash: purple / gold / accent, a crest above
    const bands = [ROYAL.purple, ROYAL.gold, L.accent];
    bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(7.85 + i * 0.14, 2.15, 0.14, 0.55); });
    crest(c, T, 8.07, 2.98, 0.26, { field: ROYAL.purple, field2: ROYAL.crimson, gold: ROYAL.gold });
  }
  function paintWing(c, T, L, top) {
    const { primary, secondary } = L;
    c.fillStyle = top ? primary : secondary; c.fillRect(-6, 1.5, 12, 3);
    c.strokeStyle = 'rgba(0,0,0,0.32)'; c.lineWidth = 0.008;
    for (const sg of [-1, 1]) {
      const h = (x, f) => { const w = wingSec(x); return w.le + f * w.c; };
      c.beginPath(); c.moveTo(sg * WING.ail[0], h(WING.ail[0], WING.ailH)); c.lineTo(sg * WING.ail[1], h(WING.ail[1], WING.ailH)); c.stroke();
      c.beginPath(); for (let x = WING.root; x <= WING.b - 0.1; x += 0.1) c.lineTo(sg * x, h(x, 0.3)); c.stroke();
      if (top) roundel(c, sg * 3.9, h(3.9, 0.45), 0.42, L);
      else roundel(c, sg * 3.6, h(3.6, 0.42), 0.36, L);
      // gun ports and the cannon blister panel
      if (top) { c.fillStyle = shade(primary, 0.85); c.beginPath(); c.ellipse(sg * 1.95, h(1.95, 0.22), 0.09, 0.28, 0, 0, 7); c.fill(); }
    }
    if (!top) {
      A.text(c, T, L.registration, -1.7, 2.95, 1.6, 0.42, { font: '700', fill: pick(secondary, ['#15181d', '#f4efe3'], 3), plan: true });
      A.text(c, T, L.registration, 1.7, 2.95, 1.6, 0.42, { font: '700', fill: pick(secondary, ['#15181d', '#f4efe3'], 3), plan: true });
    }
  }
  function paintTail(c, L) { c.fillStyle = L.primary; c.fillRect(-2, 7.5, 4, 1.6); }
  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    A.region(ctx, REG.fusL, A.side(REG.fusL), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.fusR, A.side(REG.fusR), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.finL, A.side(REG.finL), (c, T) => paintFin(c, T, L));
    A.region(ctx, REG.finR, A.side(REG.finR), (c, T) => paintFin(c, T, L));
    A.region(ctx, REG.wingT, A.plan(REG.wingT), (c, T) => paintWing(c, T, L, true));
    A.region(ctx, REG.wingB, A.plan(REG.wingB), (c, T) => paintWing(c, T, L, false));
    A.region(ctx, REG.tail, A.plan(REG.tail), (c) => paintTail(c, L));
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, metal: '#a8aeb4', dark: '#2a2c30', black: '#0d0e10', primaryDark: shade(L.primary, 0.75), white: '#f2f2ee', gold: ROYAL.gold, purple: ROYAL.purple };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createSpitfireMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.25, clearcoatRoughness: 0.35 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('spitfire-trim');
  const prop = pbrMaterial('spitfire-prop');
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa9bccb, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, glass, disc, lights, beacon];
  return { paint, trim, prop, glass, disc, lights, beacon, all: () => list };
}

const C = {
  tire: srgb('#151618'), steel: srgb('#8f959b'), dark: srgb('#26282b'), black: srgb('#0d0e10'), leather: srgb('#3a2214'),
  int: srgb('#5d6a58'), intDark: srgb('#3d463a'), floor: srgb('#2a2622'), alu: srgb('#c3c8cd'), exhaust: srgb('#4d3a2e'),
  chrome: srgb('#d3d7db'), velvet: srgb('#5a1f8a'), gold: srgb(ROYAL.gold), blade: srgb('#1b1c1f'), tip: srgb('#e8c21c'),
  lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

// the sliding hood's cross-section at station s (bubble from the sills, half-width hw, top y)
const HOOD = { s0: 3.34, s1: 4.42, top: 2.98 };
function hoodRing(s, n) {
  const sl = sill(s), u = clamp((s - HOOD.s0) / (HOOD.s1 - HOOD.s0), 0, 1);
  const top = lerp(HOOD.top, fus(s).yt + 0.04, Math.max(0, (u - 0.72) / 0.28) ** 1.6);
  const hw = sl[0] * (1 - 0.35 * Math.max(0, (u - 0.75) / 0.25) ** 2);
  const r = [];
  for (let j = 0; j <= n; j++) { const a = lerp(-Math.PI / 2, Math.PI / 2, j / n); r.push([Math.sin(a) * hw, sl[1] + Math.cos(a) * (top - sl[1]), s]); }
  return r;
}

export function buildSpitfireExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const swP = () => sw('primary'), swS = () => sw('secondary'), swD = () => sw('dark'), swM = () => sw('metal');

  // ---------- fuselage: lower shell + side walls full length; the top cap outside the cockpit opening ----------
  const Nh = T.n(14, 4), Ns = T.n(6, 2), Nd = T.n(10, 4);
  const stations = T.far ? [0.12, 0.2, 0.35] : [0.12, 0.15, 0.2, 0.28, 0.4, 0.55];
  for (let s = 0.75; s < FUS_END; s += T.step(0.25)) stations.push(+s.toFixed(3));
  stations.push(...OPEN, FUS_END);
  const st = [...new Set(stations)].sort((a, b) => a - b);
  const arc = (s, t0, t1, N, inset = 0) => { const sec = fus(s), r = []; for (let j = 0; j <= N; j++) r.push(fusPt(sec, s, lerp(t0, t1, j / N), inset)); return r; };
  const out = (p) => [p[0], p[1] - fus(p[2]).yw, 0];
  // each loft keeps to one side so no triangle spans the left/right atlas regions (that drew a stripe down the spine)
  const uvR = (p) => uvSide(REG.fusR, p[2], p[1]), uvL = (p) => uvSide(REG.fusL, p[2], p[1]);
  body.loft(st.map((s) => arc(s, Math.PI / 2, Math.PI, Nh)), { closed: false, out, uv: uvR });
  body.loft(st.map((s) => arc(s, Math.PI, 1.5 * Math.PI, Nh)), { closed: false, out, uv: uvL });
  body.loft(st.map((s) => arc(s, SILL_T, Math.PI / 2, Ns)), { closed: false, out, uv: uvR });
  body.loft(st.map((s) => arc(s, -Math.PI / 2, -SILL_T, Ns)), { closed: false, out, uv: uvL });
  for (const [a, b] of [[st[0], OPEN[0]], [OPEN[1], FUS_END]]) {
    const ss = st.filter((s) => s >= a - 1e-6 && s <= b + 1e-6);
    body.loft(ss.map((s) => arc(s, 0, SILL_T, Nd / 2)), { closed: false, out, uv: uvR });
    body.loft(ss.map((s) => arc(s, -SILL_T, 0, Nd / 2)), { closed: false, out, uv: uvL });
  }
  {
    const ring = arc(FUS_END, 0, 2 * Math.PI, 2 * (Nh + Ns + Nd)).slice(0, -1);
    fan(body, ring, [0, 0, 1], sw('primary'));
    const ring0 = arc(st[0], 0, 2 * Math.PI, 2 * (Nh + Ns + Nd)).slice(0, -1);
    fan(body, ring0, [0, 0, -1], sw('accent'));
  }
  // chin intake, exhaust stubs, the carb air filter fairing
  {
    const prof = [[0.8, 0.02], [0.95, 0.11], [1.3, 0.14], [1.75, 0.12], [2.05, 0.03]];
    const n = T.n(12, 6);
    body.loft(prof.map(([s, r]) => { const yb = fus(s).yb; return circle(n, r * 1.25, r).map(([a, b]) => [a, yb + 0.02 + b * 0.8 - r * 0.2, s]); }), { out: (p) => [p[0], p[1] - fus(p[2]).yb, 0], uv: swS });
    if (!T.far) trim.addGeo(new THREE.CircleGeometry(0.1, T.n(12, 6)), M4(0, fus(0.95).yb - 0.02, 0.96, 1.25, 0.85, 1, Math.PI, 0, 0), RM.black, C.black);
  }
  if (!T.lod2) for (const sg of [-1, 1]) for (let i = 0; i < 6; i++) {
    const s = 0.55 + i * 0.19, x = sg * (fusHalfWidth(s, 2.2) + 0.015);
    trim.addGeo(new THREE.CylinderGeometry(0.03, 0.036, 0.1, T.n(8, 4), 1, false), M4(x + sg * 0.03, 2.2, s, 1, 1, 1.6, 0, 0, sg * (Math.PI / 2 - 0.35)), RM.darkMetal, C.exhaust);
  }

  // ---------- cockpit: tub, seat + armour plate, windscreen; the hood is its own group (it slides) ----------
  if (!T.far) {
    const [s0, s1] = OPEN;
    const U = (s, inset) => {
      const r = [], K = T.i(6, 3), sy = sill(s)[1];
      for (let k = 0; k <= K; k++) { const y = lerp(sy, FLOOR, k / K); r.push([-(fusHalfWidth(s, y) - inset), y, s]); }
      for (let k = 0; k <= K; k++) { const y = lerp(FLOOR, sy, k / K); r.push([fusHalfWidth(s, y) - inset, y, s]); }
      return r;
    };
    trim.loft([s0 + 0.01, (s0 + s1) / 2, s1 - 0.01].map((s) => U(s, 0.02)), { closed: false, out: (p) => [-p[0], -(p[1] - 2.0), 0], color: (p) => (p[1] < FLOOR + 0.02 ? C.floor : C.int), uv: () => RM.paint });
    for (const [s, facing] of [[s1 - 0.012, -1]]) {
      const ring = [...U(s, 0.02).slice(0, -1)];
      fan(trim, ring, [0, 0, facing], RM.paint, C.intDark);
    }
    // padded sill rails
    for (const sg of [-1, 1]) { const path = []; for (let k = 0; k <= 6; k++) { const s = lerp(s0, s1, k / 6), p = sill(s); path.push([sg * (p[0] - 0.01), p[1] + 0.005, s]); } trim.loft(sweepRings(path, circle(T.n(8, 4), 0.022)), { color: C.leather, uv: () => RM.leatherWorn }); }
    if (T.detail) {
      // bucket seat with the armour plate behind it and a purple cushion
      const ss = SEAT.s + 0.12;
      trim.addGeo(new THREE.CylinderGeometry(0.24, 0.22, 0.5, T.n(14), 1, true, -Math.PI / 2 - 1.1, 2.2), M4(0, SEAT.y + 0.12, ss, 1, 1, 0.75, 0.18, 0, 0), RM.darkMetal, C.intDark);
      trim.addGeo(new THREE.BoxGeometry(0.42, 0.5, 0.03), M4(0, SEAT.y + 0.36, ss + 0.2, 1, 1, 1, 0.12, 0, 0), RM.darkMetal, C.dark);
      trim.addGeo(new THREE.BoxGeometry(0.34, 0.06, 0.32), M4(0, SEAT.y - 0.06, SEAT.s), RM.cloth, C.velvet);
    }
  }
  // windscreen: a flat armoured front panel with curved quarter lights, on the deck ahead of the opening
  {
    const ws0 = 3.0, ws1 = OPEN[0] + 0.02, nW = T.n(12, 6), rows = [];
    for (let i = 0; i <= 2; i++) {
      const v = i / 2, s = lerp(ws0, ws1, v), base = fus(s), r = [];
      const hw = lerp(sill(ws0)[0] * 0.92, sill(ws1)[0] * 0.98, v), top = lerp(base.yt + 0.02, HOOD.top - 0.02, v);
      for (let j = 0; j <= nW; j++) {
        const a = lerp(-Math.PI / 2, Math.PI / 2, j / nW), fl = Math.abs(a) < 0.5 ? 0.92 : 1;
        r.push([Math.sin(a) * hw * fl, lerp(sill(s)[1], top, Math.cos(a) ** 0.6), s - (Math.abs(a) < 0.5 ? 0 : (1 - Math.cos(a)) * 0.04)]);
      }
      rows.push(r);
    }
    glass.loft(rows, { closed: false, out: () => [0, 0.4, -1] });
    if (!T.lod2) {
      trim.loft(sweepRings(rows[2], circle(T.n(6, 4), 0.018)), { color: C.dark, uv: () => RM.paint, capStart: true, capEnd: true });
      for (const sg of [-1, 1]) { const a = sg * 0.5, p0 = rows[0][Math.round(((a + Math.PI / 2) / Math.PI) * nW)], p2 = rows[2][Math.round(((a + Math.PI / 2) / Math.PI) * nW)]; rod(trim, p0, p2, 0.012, 4, RM.paint, C.dark); }
    }
  }

  // ---------- wings: elliptical, straight 25 % chord; ailerons, split flaps, radiators, cannon ----------
  const nC = T.n(22, 8), wingStep = T.step(0.42);
  const span = (a, b, step) => { const n = Math.max(1, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const ring = (x, loop) => { const w = wingSec(x); return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk, w.le + xc * w.c]); };
  const panel = (B, xs, cFrom, cTo, roundNose, caps = [true, true]) => {
    const { loop, topCount } = airfoilLoop(FOIL, nC, cFrom, cTo, roundNose);
    const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
    B.loft(xs.map((x) => ring(x, loop)), {
      out: () => [0, 1, 0],
      splits: [[0, top, (p) => uvPlan(REG.wingT, p[0], p[2])], [top, loop.length, (p) => uvPlan(REG.wingB, p[0], p[2])]],
      capStart: caps[0], capEnd: caps[1], capUV: swP,
    });
  };
  const tipXs = (sign, from) => {
    const r = span(from, WING.b - 0.45, wingStep), K = T.i(7, 3);
    for (let k = 1; k <= K; k++) r.push(WING.b - 0.45 + 0.449 * (1 - (1 - k / K) ** 1.7));
    return r.map((x) => x * sign);
  };
  const pieces = {};
  const { flap: FL, ail: AI } = WING;
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg);
    if (T.far) { panel(body, tipXs(sg, WING.root), 0, 1, false); continue; }
    panel(body, S(span(WING.root, FL[0], wingStep)), 0, 1, false);
    panel(body, S(span(FL[0], FL[1], wingStep)), 0, 1, false);   // split flaps hang under a full-depth wing
    panel(body, S(span(FL[1], AI[0], wingStep)), 0, 1, false);
    panel(body, S(span(AI[0], AI[1], wingStep)), 0, WING.ailH, false);
    panel(body, tipXs(sg, AI[1]), 0, 1, false);
    const a = AI[0] + 0.015, b = AI[1] - 0.015, B = new Builder();
    panel(B, S(span(a, b, wingStep)), WING.ailH + 0.006, 1, true);
    const hp = (x, f) => { const w = wingSec(x); const [yu, yl] = FOIL(f + 0.012); return [x, w.y + ((yu + yl) / 2) * w.c * w.thk, w.le + (f + 0.012) * w.c]; };
    pieces[sg > 0 ? 'ailR' : 'ailL'] = { B, a: hp(sg > 0 ? a : -b, WING.ailH), b: hp(sg > 0 ? b : -a, WING.ailH) };
    // split flap: a plate under the trailing edge, hinged at its leading edge
    const FB = new Builder(), fxs = span(FL[0] + 0.02, FL[1] - 0.02, wingStep).map((x) => x * sg);
    const low = (x, f, dy = 0) => { const w = wingSec(x); return [x, w.y + FOIL(f)[1] * w.c * w.thk - dy, w.le + f * w.c]; };
    FB.loft(fxs.map((x) => [low(x, WING.flapH, 0.004), low(x, 0.97, 0.004), low(x, 0.97, 0.022), low(x, WING.flapH, 0.022)]), { out: () => [0, -1, 0], uv: swS, capStart: true, capEnd: true, capUV: swS });
    const fa = low(sg > 0 ? FL[0] + 0.02 : -(FL[1] - 0.02), WING.flapH, 0.012), fb = low(sg > 0 ? FL[1] - 0.02 : -(FL[0] + 0.02), WING.flapH, 0.012);
    pieces[sg > 0 ? 'flapR' : 'flapL'] = { B: FB, a: fa, b: fb };
    // radiator under the wing (both wings on the Mk IX)
    {
      const x0 = sg * 1.45, rw = 0.3, n = T.n(10, 6);
      const prof = [[0.3, 0.02], [0.45, 0.17], [0.7, 0.22], [0.92, 0.2], [1.06, 0.13]];
      body.loft(prof.map(([f, d]) => { const w = wingSec(1.45), y = w.y + FOIL(f)[1] * w.c * w.thk, z = w.le + f * w.c; const r = []; for (let j = 0; j <= n; j++) { const a = lerp(0, Math.PI, j / n); r.push([x0 + Math.cos(a) * rw, y + 0.005 - Math.sin(a) * d, z]); } return r; }), { closed: false, out: (p) => [p[0] - x0, -1, 0], uv: swS });
      if (T.detail) { const w = wingSec(1.45); trim.addGeo(new THREE.PlaneGeometry(rw * 1.8, 0.16), M4(x0, w.y - 0.11, w.le + 0.45 * w.c - 0.002, 1, 1, 1, 0, Math.PI, 0), RM.black, C.black); }
    }
    // cannon barrels poking out of the leading edge
    if (!T.lod2) { const x = sg * 1.95, w = wingSec(1.95), y = w.y - 0.01; rod(trim, [x, y, w.le - 0.55], [x, y, w.le + 0.2], 0.022, T.n(8, 4), RM.darkMetal, C.dark); trim.addGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.22, T.n(10, 4)), M4(x, y, w.le - 0.08, 1, 1, 1, Math.PI / 2, 0, 0), RM.darkMetal, C.dark); }
  }
  // wing root fillets: a smooth fairing where the wing meets the belly
  if (!T.lod2) for (const sg of [1, -1]) {
    const rows = [];
    for (let k = 0; k <= T.i(6, 3); k++) {
      const s = lerp(WING.le0 + 0.15, WING.le0 + WING.c0 * 0.98, k / T.i(6, 3)), w = wingSec(WING.root);
      const f = (s - w.le) / w.c, yl = w.y + FOIL(clamp(f, 0, 1))[1] * w.c, xb = fusHalfWidth(s, yl + 0.02);
      rows.push([[sg * (xb - 0.02), yl + 0.16, s], [sg * (WING.root + 0.12), yl + 0.02, s], [sg * (WING.root + 0.12), yl - 0.01, s], [sg * (xb * 0.6), fus(s).yb + 0.01, s]]);
    }
    body.loft(rows, { closed: false, out: () => [sg, -0.5, 0], uv: swS });
  }

  // ---------- tail: elliptical stab + elevator, elliptical fin + rudder ----------
  const sym = naca(0, 0.4, 0.1);
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const xs = []; { const K = T.n(12, 4); for (let k = 0; k <= K; k++) xs.push(-STAB.half + 2 * STAB.half * (0.5 - 0.5 * Math.cos(Math.PI * k / K))); }
    const tr = (x, f0, f1, rn) => { const s = stabSec(x), { loop } = airfoilLoop(sym, T.n(12, 6), f0, f1, rn); return loop.map(([xc, yv]) => [x, STAB.y + yv * s.c, s.le + xc * s.c]); };
    if (T.far) body.loft(xs.map((x) => tr(x, 0, 1, false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
    else {
      body.loft(xs.map((x) => tr(x, 0, STAB.hinge, false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
      const elev = new Builder();
      for (const sg of [1, -1]) { const e = xs.filter((x) => x * sg >= 0.05); if (sg > 0) e.unshift(0.05); else e.push(-0.05); elev.loft(e.map((x) => tr(x, STAB.hinge + 0.01, 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP }); }
      const hy = (x) => { const s = stabSec(x); return [x, STAB.y, s.le + (STAB.hinge + 0.012) * s.c]; };
      pieces.elevator = { B: elev, a: hy(-1), b: hy(1) };
      pieces.elevator.a = [-1, STAB.y, STAB.le + STAB.hinge * STAB.c0]; pieces.elevator.b = [1, STAB.y, STAB.le + STAB.hinge * STAB.c0];
    }
    const ys = []; { const K = T.i(10, 4); for (let k = 0; k <= K; k++) ys.push(lerp(FIN.y0 - 0.12, FIN.top, Math.sin((Math.PI / 2) * k / K))); }
    const fr = (y, f0, f1, rn) => { const s = finSec(y), { loop } = airfoilLoop(sym, T.n(12, 6), f0, f1, rn); return loop.map(([xc, yv]) => [yv * s.c * 0.9, y, s.le + xc * s.c]); };
    if (T.far) body.loft(ys.map((y) => fr(y, 0, 1, false)), { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    else {
      body.loft(ys.map((y) => fr(y, 0, FIN.hinge, false)), { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
      const rud = new Builder();
      rud.loft(ys.slice(1).map((y) => fr(y, FIN.hinge + 0.01, 1, true)), { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
      const hz = (y) => { const s = finSec(y); return [0, y, s.le + (FIN.hinge + 0.012) * s.c]; };
      pieces.rudder = { B: rud, a: hz(ys[1]), b: hz(FIN.top - 0.02) };
    }
  }

  // ---------- gear: two legs (each its own pivot, retracting outward into the wing), a fixed tail wheel ----------
  const gearB = { L: new Builder(), R: new Builder() };
  for (const sg of [1, -1]) {
    const G = gearB[sg > 0 ? 'R' : 'L'], px = sg * MAIN.pivot[0], py = MAIN.pivot[1], ax = [sg * MAIN.half, MAIN.r, MAIN.s];
    rod(G, [px, py, MAIN.s], [ax[0] - sg * 0.07, ax[1] + 0.05, ax[2]], T.far ? 0.04 : 0.032, T.n(8, 4), RM.chrome, C.chrome);
    if (!T.far) rod(G, [ax[0] - sg * 0.1, ax[1], ax[2]], [ax[0] + sg * 0.03, ax[1], ax[2]], 0.025, 6, RM.steel, C.steel);
    const tire = new THREE.TorusGeometry(MAIN.r - MAIN.w * 0.42, MAIN.w * 0.45, T.n(10, 4), T.n(24, 8));
    tire.scale(1, 1, 1.15);
    G.addGeo(tire, M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, Math.PI / 2, 0), sw('black'), [1, 1, 1]);
    G.addGeo(new THREE.CylinderGeometry(MAIN.r * 0.62, MAIN.r * 0.62, MAIN.w * 0.7, T.n(16, 8)), M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, 0, Math.PI / 2), swM(), [1, 1, 1]);
    // the leg fairing door (painted underside colour)
    if (!T.lod2) {
      const d = [ax[0] - sg * 0.11, ax[1] + 0.22, ax[2] - 0.2], e = [px - sg * 0.02, py - 0.05, MAIN.s - 0.22];
      const rows = [0, 1].map((h) => [[lerp(d[0], e[0], h), lerp(d[1], e[1], h), d[2]], [lerp(d[0], e[0], h) - sg * 0.005, lerp(d[1], e[1], h), d[2] + 0.42]]);
      G.loft(rows, { closed: false, out: () => [sg, 0, 0], uv: swS });
      G.loft(rows.map((r) => r.map((p) => [p[0] + sg * 0.012, p[1], p[2]])), { closed: false, out: () => [-sg, 0, 0], uv: swS });
    }
  }
  {
    const ty = TAILW.y + TAILW.r, ts = TAILW.s;
    rod(trim, [0, fus(ts - 0.15).yb + 0.02, ts - 0.15], [0, ty + 0.04, ts], 0.028, T.n(8, 4), RM.paint, C.dark);
    const tw = new THREE.TorusGeometry(TAILW.r * 0.62, TAILW.r * 0.38, T.n(8, 4), T.n(16, 8));
    trim.addGeo(tw, M4(0, ty, ts, 1, 1, 1.3, 0, Math.PI / 2, 0), RM.rubber, C.tire);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
    const x = sg * (WING.b - 0.04), w = wingSec(WING.b - 0.04), p = [x, w.y, w.le + w.c * 0.4];
    lights.addGeo(new THREE.SphereGeometry(0.028, T.n(8, 4), T.n(6, 3)), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const s = finSec(2.4), p = [0, 2.4, s.le + s.c + 0.02]; lights.addGeo(new THREE.SphereGeometry(0.02, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }

  // ---------- spinner (accent, static, a body of revolution) + a four-blade Rotol prop ----------
  {
    const prof = [[-0.72, 0.0], [-0.64, 0.05], [-0.5, 0.11], [-0.33, 0.17], [-0.16, 0.225], [0.0, 0.258], [0.12, 0.27]];
    const rings = latheRings(T.far ? prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1) : prof, T.n(22, 8), 0, THRUST_Y);
    body.loft(rings, { out: (p) => [p[0], p[1] - THRUST_Y, 0], uv: () => sw('accent'), capEnd: true, capUV: () => sw('accent') });
  }
  const prop = new Builder();
  {
    const R = PROP.R, r0 = 0.2, K = T.i(12, 5), rs = [];
    for (let k = 0; k <= K; k++) rs.push(lerp(r0, R, k / K));
    for (let bI = 0; bI < PROP.blades; bI++) {
      const rot = (bI / PROP.blades) * Math.PI * 2 + Math.PI / 4, Rg = [];
      for (const r of rs) {
        const u = (r - r0) / (R - r0);
        let c = 0.2 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.05)) - 0.03 * u;
        if (u > 0.9) c *= Math.sqrt(Math.max(0.2, 1 - ((u - 0.9) / 0.1) ** 2));
        const t = lerp(0.2, 0.07, Math.min(1, u * 1.3)), phi = Math.atan(3.2 / (2 * Math.PI * Math.max(0.25, r))) + 0.05;
        const { loop } = airfoilLoop(naca(0.03, 0.4, t), T.n(10, 4), 0, 1, false);
        const cp = Math.cos(phi), sp = Math.sin(phi);
        Rg.push(loop.map(([xc, yv]) => { const a = (xc - 0.35) * c, b = yv * c, x = -cp * a - sp * b, z = sp * a - cp * b - 0.02; return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z]; }));
      }
      prop.loft(Rg, { out: () => [0, 0, -1], capEnd: true, capStart: true, color: (p) => (Math.hypot(p[0], p[1]) > R - 0.11 ? C.tip : C.blade), uv: (p) => (Math.hypot(p[0], p[1]) > R - 0.11 ? RM.paint : RM.black) });
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
  // gear legs: pivots on the wing underside, rotation.z swings each one outward and up into its well
  const gear = {};
  for (const k of ['L', 'R']) {
    const sg = k === 'R' ? 1 : -1, pv = new THREE.Group();
    pv.name = 'gear-pivot-' + k; pv.position.set(sg * MAIN.pivot[0], MAIN.pivot[1], MAIN.s);
    const g = gearB[k].build(); g.translate(-sg * MAIN.pivot[0], -MAIN.pivot[1], -MAIN.s);
    const m = new THREE.Mesh(g, mats.paint); m.name = 'gear' + k; m.castShadow = true; m.receiveShadow = true;
    pv.add(m); group.add(pv); gear[k] = pv;
  }
  // the sliding hood: glass bubble + frame hoops, moved aft by z
  const hood = new THREE.Group(); hood.name = 'hood';
  {
    const hb = new Builder(), hf = new Builder(), n = T.n(16, 6), K = T.i(7, 3), rows = [];   // closed position
    for (let k = 0; k <= K; k++) rows.push(hoodRing(lerp(HOOD.s0, HOOD.s1, k / K), n));
    hb.loft(rows, { closed: false, out: (p) => [p[0], p[1] - 2.3, 0] });
    if (!T.lod2) for (const r of [rows[0], rows[Math.round(K * 0.62)], rows[K]]) hf.loft(sweepRings(r, circle(T.n(6, 4), 0.014)), { color: C.dark, uv: () => RM.paint, capStart: true, capEnd: true });
    const hg = new THREE.Mesh(hb.build(), mats.glass); hg.name = 'glass'; hg.renderOrder = 2; hg.castShadow = false;
    const hm = new THREE.Mesh(hf.build(), mats.trim); hm.name = 'hood-frame'; hm.castShadow = true;
    hood.add(hg, hm); group.add(hood);
  }
  // the royal booster cushion: under the seat, it grows as the seat rises on the ground
  let cushion = null;
  if (!T.far) {
    const cb = new Builder();
    cb.addGeo(new THREE.BoxGeometry(0.36, 1, 0.34, 1, 1, 1), M4(0, 0.5, 0), RM.cloth, C.velvet);
    cb.addGeo(new THREE.BoxGeometry(0.37, 0.04, 0.35), M4(0, 1, 0), RM.gold, C.gold);
    cushion = new THREE.Mesh(cb.build(), mats.trim); cushion.name = 'cushion';
    cushion.position.set(0, SEAT.y - 0.09, SEAT.s); cushion.scale.y = 0.001; cushion.visible = false;
    group.add(cushion);
  }
  const propGroup = new THREE.Group();
  propGroup.position.set(0, THRUST_Y, 0);
  const propMesh = new THREE.Mesh(prop.build(), mats.prop);
  propMesh.name = 'prop'; propMesh.castShadow = true;
  propGroup.add(propMesh);
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.22, PROP.R, T.n(48, 16)), mats.disc);
  disc.position.z = -0.02; disc.renderOrder = 3; disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);
  return { group, meshes, hinges, gear, hood, cushion, propGroup, propMesh, disc, lightPts };
}

// ---------- cockpit: the blind-flying panel, spade-grip stick, throttle quadrant on the left wall, a teapot ----------
const PS = 3.3;
export const THROTTLE = { x: -0.36, y: 2.18, s: 3.72, len: 0.13 };
export const throttleKnob = (th) => { const a = (0.5 - th) * 0.95; return [THROTTLE.x + 0.03, THROTTLE.y + Math.cos(a) * THROTTLE.len, THROTTLE.s + Math.sin(a) * THROTTLE.len]; };
export const STICK = { pos: [0, FLOOR + 0.02, 3.72], len: 0.62 };
function spadeStick(sb, n, high) {
  const L = STICK.len;
  sb.addGeo(new THREE.ConeGeometry(0.07, 0.1, n(12), 1, true), M4(0, 0.05, 0), RM.leatherWorn, CK.leather);
  sb.addGeo(new THREE.CylinderGeometry(0.014, 0.016, L - 0.12, n(8)), M4(0, (L - 0.12) / 2 + 0.03, 0), RM.steel, CK.steel);
  sb.addGeo(new THREE.TorusGeometry(0.065, 0.014, n(6), n(18)), M4(0, L - 0.02, 0, 1, 1.1, 1), RM.rubber, CK.black);
  if (high) sb.addGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.02, n(8)), M4(0, L - 0.02, -0.06, 1, 1, 1, Math.PI / 2, 0, 0), RM.brass, CK.brass);
}
function spitfireCockpit(quality, mats, ctx) {
  const y0 = 1.98, sec = fus(PS), outline = [];
  const sy = sill(PS)[1];
  for (let k = 0; k <= 4; k++) { const y = lerp(y0, sy, k / 4); outline.push([fusHalfWidth(PS, y) - 0.03, y]); }
  for (let k = 1; k < 14; k++) { const p = fusPt(sec, PS, SILL_T - (2 * SILL_T * k) / 14, 0.03); outline.push([p[0], p[1]]); }
  for (let k = 4; k >= 0; k--) { const y = lerp(y0, sy, k / 4); outline.push([-(fusHalfWidth(PS, y) - 0.03), y]); }
  const d = 0.082, g = { asi: [-0.12, 2.34, d], ai: [0, 2.35, d], vsi: [0.12, 2.34, d], alt: [-0.12, 2.22, d], dg: [0, 2.21, d], tc: [0.12, 2.22, d], tach: [0.29, 2.27, 0.07] };
  return buildPanelCockpit(quality, mats, ctx, {
    name: 'spitfire', PS, outline, box: { x0: -0.48, x1: 0.48, y0, y1: sec.yt }, gauges: g, bezel: 'black', screws: '#666',
    inst: { asiMax: 400, asiArcs: { white: [61, 140], green: [70, 300], yellow: [300, 390], red: 390 } },
    paint(gg, txt, h) {
      gg.fillStyle = '#1f2120'; gg.fillRect(-0.5, y0, 1.0, 0.7);
      h.noise(2600, 0.07, true);
      // the blind-flying panel: a darker plate behind the six
      gg.fillStyle = '#141515'; gg.beginPath(); gg.roundRect(-0.185, 2.15, 0.37, 0.25, 0.012); gg.fill();
      for (const [k, l] of [['asi', 'KNOTS'], ['alt', 'ALT'], ['tach', 'RPM']]) txt(l, g[k][0], g[k][1] - g[k][2] / 2 - 0.012, 0.0085, '#e8e2cc', '700', 'Helvetica, Arial, sans-serif');
      paintDial(gg, 'oil', -0.29, 2.3, 0.06); paintDial(gg, 'oil', -0.29, 2.2, 0.06); paintDial(gg, 'clock', 0.29, 2.16, 0.055);
      txt('OIL', -0.29, 2.255, 0.008, '#e8e2cc', '700', 'Helvetica, Arial, sans-serif'); txt('COOLANT', -0.29, 2.155, 0.008, '#e8e2cc', '700', 'Helvetica, Arial, sans-serif');
      // brass placards: the royal tea switch
      gg.fillStyle = '#c99d48'; gg.beginPath(); gg.roundRect(-0.13, 2.04, 0.26, 0.05, 0.004); gg.fill();
      txt('TEA · BY ROYAL WARRANT', 0, 2.072, 0.0085, '#2a2418'); txt('ONE LUMP OR TWO', 0, 2.052, 0.007, '#2a2418', '600');
      gg.fillStyle = '#9c1b1b'; gg.beginPath(); gg.arc(0.2, 2.065, 0.014, 0, 7); gg.fill();
      txt('BOOST', 0.2, 2.04, 0.0065, '#e8e2cc', '700', 'Helvetica, Arial, sans-serif');
    },
    extras(B, n, high) {
      // throttle quadrant on the left wall, the reflector gunsight, a compass between the pedals, a teapot on the coaming
      B.addGeo(new THREE.BoxGeometry(0.04, 0.06, 0.24), M4(THROTTLE.x - 0.012, THROTTLE.y + 0.06, THROTTLE.s), RM.black, CK.black);
      B.addGeo(new THREE.BoxGeometry(0.05, 0.05, 0.08), M4(0, sec.yt - 0.01, PS + 0.03), RM.black, CK.black);
      if (high) B.addGeo(new THREE.BoxGeometry(0.05, 0.045, 0.003), M4(0, sec.yt + 0.035, PS + 0.04, 1, 1, 1, -0.6, 0, 0), RM.glass, srgb('#6f8a7a'));
      B.addGeo(new THREE.CylinderGeometry(0.06, 0.07, 0.07, n(14)), M4(0, FLOOR + 0.2, PS + 0.12), RM.black, CK.black);
      const tx = 0.3, ty = sec.yt - 0.02, tz = PS + 0.06;
      B.addGeo(new THREE.SphereGeometry(0.035, n(12), n(8)), M4(tx, ty + 0.03, tz, 1, 0.8, 1), RM.enamel, srgb('#f4efe3'));
      B.addGeo(new THREE.CylinderGeometry(0.006, 0.01, 0.05, n(6)), M4(tx - 0.04, ty + 0.04, tz, 1, 1, 1, 0, 0, 0.9), RM.enamel, srgb('#f4efe3'));
      B.addGeo(new THREE.TorusGeometry(0.018, 0.005, 4, n(10)), M4(tx + 0.035, ty + 0.03, tz), RM.enamel, srgb('#f4efe3'));
      B.addGeo(new THREE.SphereGeometry(0.01, n(8), 4), M4(tx, ty + 0.062, tz), RM.gold, CK.brass);
    },
    stick: (sb, n, high) => spadeStick(sb, n, high),
    throttle: {
      pos: [THROTTLE.x + 0.03, THROTTLE.y, THROTTLE.s], len: THROTTLE.len,
      build(tb) { tb.addGeo(new THREE.BoxGeometry(0.012, THROTTLE.len, 0.018), M4(0, THROTTLE.len / 2, 0), RM.steel, CK.steel); tb.addGeo(new THREE.SphereGeometry(0.021, 10, 8), M4(0, THROTTLE.len, 0, 1, 0.8, 1.2), RM.plastic, srgb('#111')); },
      anim(gr, th) { gr.rotation.x = (0.5 - th) * 0.95; },
    },
    rudder: { pos: [0, FLOOR + 0.12, 3.42], w: 0.42 },
    openDials: true,
  });
}

const D2R = Math.PI / 180;
const MAX = { aileron: 18 * D2R, elevUp: 26 * D2R, elevDown: 20 * D2R, rudder: 26 * D2R, flaps: 85 * D2R, gear: 76 * D2R };
export const SPITFIRE_DIMS = { length: 9.47, span: 2 * WING.b, height: 3.86, gearHeight: CG.y, groundPitch: GROUND_PITCH };

export async function createSpitfire(opts = {}) {
  const G = { gear: 1, gearShown: 1, lift: 1, liftT: null, posed: -1, fars: null, shadow: null, farDown: true, last: null, kt: 0 };
  const def = {
    id: 'spitfire', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.03, s: EYE.s + 0.06, pitch: -0.08 },
    portrait: { center: [0, 0.06, 0.18], cockpit: [0, 0.05, 0.16], fov: 90, pitch: -0.08 },
    dims: { ...SPITFIRE_DIMS, restHeight: CG.y * Math.cos(GROUND_PITCH) - (CG.s - MAIN.s) * Math.sin(GROUND_PITCH) },
    lod: [260, 150], rpm: { idle: 700, max: 2200 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createSpitfireLivery(q),
    createMaterials: (q, l) => createSpitfireMaterials(q, l),
    buildExterior: (q, mats) => buildSpitfireExterior(q, mats),
    buildCockpit: (q, mats, ctx) => spitfireCockpit(q, mats, ctx),
    stick: { pos: STICK.pos, move(stick, cur) { stick.rotation.set(cur.elevator * 0.25, 0, -cur.aileron * 0.25); } },
    createPilot: (q, cfg) => {
      const av = createAviator({ quality: q, cfg, seat: SEAT, outfit: 'flyer', gripLocal: [0, STICK.len - 0.02, 0], elbowOut: 0.3, leftHand: (cur) => throttleKnob(cur.throttle) });
      const still = { stick: null, airspeed: 0, rpm: 0 };
      // the hood is shut in flight: the scarf stays tucked
      return { get mesh() { return av.mesh; }, update: (dt, cur, c) => { still.stick = c.stick; av.update(dt, cur, still); }, setHideBody: av.setHideBody, setConfig: av.setConfig, get config() { return av.config; }, dispose: av.dispose };
    },
    onLivery(L, ext, fars) { G.fars = fars; },
    animate(ext, cur, dt) {
      const h = ext.hinges, a = cur.aileron * MAX.aileron;
      h.ailR.rotation.x = -a; h.ailL.rotation.x = a;
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
      const fl = clamp(cur.flaps, 0, 1) ** 0.7 * MAX.flaps;
      h.flapR.rotation.x = fl; h.flapL.rotation.x = fl;
      G.gearShown += clamp(G.gear - G.gearShown, -dt / 3.5, dt / 3.5);
      if (G.gearShown !== G.posed) {
        G.posed = G.gearShown;
        const k = 1 - G.gearShown, r = MAX.gear * (k * k * (3 - 2 * k));
        ext.gear.R.rotation.z = r; ext.gear.L.rotation.z = -r;
        farGear(G.gearShown > 0.5);
      }
      ext.hood.position.z = LIFT.hood * G.lift;
      if (ext.cushion) { ext.cushion.visible = G.lift > 0.02; ext.cushion.scale.y = Math.max(0.001, LIFT.pilot * G.lift); }
    },
  };
  // far LODs are one baked mesh each (and the low tier's shadow proxy copies far2): retracting collapses the gear range
  function farGear(down) {
    if (down === G.farDown || !G.fars) return;
    G.farDown = down;
    const targets = [];
    for (const k of ['gearL', 'gearR']) {
      for (const f of G.fars) if (f.merged?.ranges[k]) targets.push([f.merged.mesh.geometry, f.merged.ranges[k]]);
      if (G.shadow && G.fars[1]?.merged?.ranges[k]) targets.push([G.shadow.geometry, G.fars[1].merged.ranges[k]]);
    }
    for (const [g, [a, n]] of targets) {
      const P = g.attributes.position;
      if (!g.userData.gearRest) g.userData.gearRest = P.array.slice(a * 3, (a + n) * 3);
      if (down) P.array.set(g.userData.gearRest, a * 3); else P.array.fill(0, a * 3, (a + n) * 3);
      P.needsUpdate = true;
    }
  }
  const rig = await assembleRig(def, opts);
  const ext = rig._ext;
  G.shadow = rig.lod.levels[0].object.getObjectByName('plane-shadow');
  // ---- hooks: gear (also from setControls({ gear }), which traffic passes as ac.ctl), taxi pose ----
  rig.setGear = (v, now = false) => { G.gear = clamp(+v, 0, 1); if (now) G.gearShown = G.gear; };
  rig.gear = () => G.gearShown;
  const sc = rig.setControls;
  rig.setControls = (c = {}) => { sc(c); if (typeof c.gear === 'number' && Number.isFinite(c.gear)) G.gear = clamp(c.gear, 0, 1); };
  // null = automatic (slow on the ground: hood back, seat up); 0..1 forces it (viewer, tests)
  rig.setTaxiPose = (v) => { G.liftT = v == null ? null : clamp(+v, 0, 1); };
  rig.taxiPose = () => G.lift;
  const _p = new THREE.Vector3(), up0 = rig.update;
  rig.update = (dt = 0.016) => {
    dt = Math.min(0.1, Math.max(0, dt));
    rig.root.getWorldPosition(_p);
    if (G.last && dt > 0) G.kt += (Math.min(200, _p.distanceTo(G.last) / dt / 0.5144) - G.kt) * (1 - Math.exp(-dt * 3));
    (G.last ||= new THREE.Vector3()).copy(_p);
    const want = G.liftT ?? (G.gearShown > 0.99 && G.kt < 32 ? 1 : 0);
    G.lift += clamp(want - G.lift, -dt / 1.2, dt / 1.2);
    if (rig._pilot) rig._pilot.mesh.position.y = LIFT.pilot * G.lift;
    up0(dt);
  };
  const ve0 = rig.viewEye;
  rig.viewEye = (v, aspect, out) => { const r = ve0(v, aspect, out); r.eye.y += LIFT.eye * G.lift; r.pitch -= 0.06 * G.lift; return r; };
  // single seat: the 'center' eye is inside the pilot's head too
  const setView0 = rig.setView;
  rig.setView = (v) => { setView0(v); rig._pilot?.setHideBody(rig.view !== 'chase'); };
  rig.setView(rig.view);
  if (opts.gear != null) rig.setGear(opts.gear, true);
  rig.update(0);
  return rig;
}
