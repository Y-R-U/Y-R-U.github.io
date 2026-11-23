import * as THREE from 'three';
import { Builder, naca, airfoilLoop, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { sectionTable, secPt, skinPatch, wingPanel, spanSteps, spinPatch, spinMesh, propProxy, wheel, animateBig, finishBig } from './jetkit.js';

// "Commoner Shuttle": a Dash 8 Q400-ish turboprop (AI only: no flight deck). High straight wing, two long nacelles
// with six-blade props and the main gear in them, a T-tail. Build frame: y = height above ground (wheels on y = 0),
// z = station aft of the nose tip, x = right. Real: length 32.8, span 28.4, height 8.3, wing area 63 m², props 4.1 m Ø.
export const CG = { s: 14.6, y: 2.45 };
export const LENGTH = 32.8;
// [s, yc, w, ht, hb, nt, nb, wing-root fairing hy, ha, hh, fy, fa, fb]
const KEYS = [
  [0, 2.05, 0.03, 0.03, 0.03, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [0.3, 2.08, 0.36, 0.33, 0.33, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [0.9, 2.15, 0.72, 0.66, 0.68, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [1.7, 2.25, 1.0, 0.98, 1.0, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [2.7, 2.36, 1.22, 1.22, 1.22, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [3.8, 2.43, 1.32, 1.32, 1.32, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [5.0, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [11.8, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [12.6, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.62, 0.7, 0.25, 1, 0, 0],
  [13.4, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.66, 1.0, 0.32, 1, 0, 0],
  [16.4, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.66, 1.0, 0.32, 1, 0, 0],
  [17.6, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.6, 0.5, 0.2, 1, 0, 0],
  [18.4, 2.45, 1.35, 1.35, 1.35, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [22.0, 2.46, 1.35, 1.35, 1.33, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [25.5, 2.62, 1.29, 1.32, 1.08, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [28.0, 2.82, 1.04, 1.12, 0.72, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [30.5, 3.0, 0.68, 0.84, 0.45, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [32.2, 3.2, 0.28, 0.36, 0.18, 2, 2, 3.7, 0, 0, 1, 0, 0],
  [LENGTH, 3.25, 0.07, 0.08, 0.06, 2, 2, 3.7, 0, 0, 1, 0, 0],
];
export const FUS = sectionTable(KEYS);
const D2R = Math.PI / 180;
export const WING = { le0: 13.0, rootC: 2.95, tipC: 1.3, inner: 4.6, tip: 14.2, y0: 3.86, dih: 0.045 };
export function wingPlan(x) {
  const ax = Math.max(0, x);
  const c = ax <= WING.inner ? WING.rootC : lerp(WING.rootC, WING.tipC, clamp((ax - WING.inner) / (WING.tip - WING.inner), 0, 1));
  const u = clamp(ax / WING.tip, 0, 1);
  return { le: WING.le0 + ax * 0.012 + (WING.rootC - c) * 0.2, c, y: WING.y0 + Math.max(0, ax - WING.inner) * WING.dih, thk: lerp(1.15, 0.9, u), twist: 0.02 * u };
}
const FOIL = naca(0.03, 0.4, 0.15);
const FLAPS = [[1.45, 3.75, 0.7], [4.7, 9.6, 0.7]];
const AIL = [9.9, 13.5, 0.74];
export const ENG_X = 4.2;
export const PROP = { s: 11.0, y: 3.36, R: 2.05, blades: 6 };
// nacelle rings aft of the spinner: [dz, halfWidth, top, bottom]
const NAC = [[0, 0.4, 0.4, 0.4], [0.3, 0.5, 0.56, 0.58], [1.0, 0.54, 0.66, 0.66], [2.5, 0.54, 0.72, 0.7], [5.0, 0.52, 0.72, 0.66], [7.0, 0.42, 0.62, 0.42], [8.5, 0.14, 0.38, 0.08]];
export const FIN = { y0: 3.5, top: 8.05, le0: 24.9, sweep: Math.tan(33 * D2R), rootC: 4.7, tipC: 2.7, hinge: 0.66 };
export const STAB = { y: 8.12, half: 4.0, sweep: Math.tan(9 * D2R), rootC: 2.5, tipC: 1.35, hinge: 0.64 };
export const GEAR = { main: { x: ENG_X, s: 15.6, r: 0.48, w: 0.3, off: 0.27, top: 2.75 }, nose: { s: 2.6, x: 0.2, r: 0.32, w: 0.2, top: 1.16 } };
// cockpit glass, right side (mirrored): [s0, s1, t0, t1] with t the polar angle from the top
export const PANES = [[1.45, 2.25, 0.1, 0.92], [2.32, 2.9, 0.6, 1.12]];
const WINDOWS = (() => { const o = []; for (let s = 5.4; s < 23.0; s += 0.76) o.push(s); return o; })();
const DOORS = [[3.6, 4.4], [23.6, 24.4]];

const finPlan = (y) => { const u = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 1); return { le: FIN.le0 + (y - FIN.y0) * FIN.sweep, c: lerp(FIN.rootC, FIN.tipC, u), thk: lerp(1.05, 0.85, u) }; };
const stabLe0 = () => finPlan(FIN.top).le + 0.1;
export function stabPlan(x) { const ax = Math.abs(x), u = clamp(ax / STAB.half, 0, 1); return { le: stabLe0() + ax * STAB.sweep, c: lerp(STAB.rootC, STAB.tipC, u), y: STAB.y, thk: lerp(1, 0.85, u) }; }

// ---------- livery: primary body, secondary tail + belly band, the company name, a big roundel on the fin ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.24, s0: -0.2, s1: 33.1, h0: 0.9, h1: 4.2, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.24, y1: 0.48, s0: -0.2, s1: 33.1, h0: 0.9, h1: 4.2, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.48, y1: 0.64, s0: 24.3, s1: 33.0, h0: 3.3, h1: 8.4, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.48, y1: 0.64, s0: 24.3, s1: 33.0, h0: 3.3, h1: 8.4, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.64, y1: 0.76, a0: -15, a1: 15, s0: 12.6, s1: 16.6, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.76, y1: 0.88, a0: -15, a1: 15, s0: 12.6, s1: 16.6, flip: true },
  tail: { x0: 0, x1: 0.5, y0: 0.88, y1: 0.975, a0: -4.3, a1: 4.3, s0: 27.4, s1: 31.4, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'gold', 'purple', 'white', 'radome', 'grey'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const band = (s) => FUS(s).yc - 0.55 + Math.max(0, s - 24) * 0.09;

function createDash8Livery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  { const g = rough.getContext('2d'); g.fillStyle = 'rgb(0,120,0)'; g.fillRect(0, 0, 256, 256); roughTex.needsUpdate = true; }
  function side(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 35, 5);
    // secondary belly sweeping up into the tail, an accent stripe along its top edge
    c.fillStyle = secondary; c.beginPath(); c.moveTo(-1, 0); for (let s = 1.0; s <= 33.2; s += 0.2) c.lineTo(s, band(s)); c.lineTo(33.2, 0); c.closePath(); c.fill();
    c.fillStyle = accent; c.beginPath(); for (let s = 1.6; s <= 33.2; s += 0.2) c.lineTo(s, band(s) + 0.12); for (let s = 33.2; s >= 1.6; s -= 0.2) c.lineTo(s, band(s) + 0.02); c.closePath(); c.fill();
    c.fillStyle = '#3c4046'; c.beginPath(); c.moveTo(-1, 0); c.lineTo(0.42, 0); c.quadraticCurveTo(0.6, 2.05, 0.4, 2.8); c.lineTo(-1, 2.8); c.closePath(); c.fill();
    c.fillStyle = '#121820';
    for (const [s0, s1, t0, t1] of PANES) { const o = []; for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s0, s1, k / 6)), t0)); for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s1, s0, k / 6)), t1)); c.beginPath(); o.forEach((q, i) => (i ? c.lineTo(q[2], q[1]) : c.moveTo(q[2], q[1]))); c.closePath(); c.fill(); }
    for (const s of WINDOWS) { c.beginPath(); c.ellipse(s, FUS(s).yc + 0.32, 0.13, 0.17, 0, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(20,22,26,0.5)'; c.lineWidth = 0.025;
    for (const [s0, s1] of DOORS) { const y = FUS(s0).yc; c.beginPath(); c.roundRect(s0, y - 0.95, s1 - s0, 1.7, 0.12); c.stroke(); }
    const nameCol = pick(primary, [secondary, accent, '#15181d'], 2.6);
    A.text(c, T, String(L.display).toUpperCase(), 21.4, FUS(21).yc + 0.9, 5.2, 0.48, { font: '800', fill: nameCol });
    A.text(c, T, L.registration, 7.4, FUS(7.4).yc + 0.9, 2.2, 0.26, { font: '700', fill: pick(primary, ['#15181d', '#f4efe3'], 3) });
    crest(c, T, 5.2, FUS(5.2).yc + 0.95, 0.32, { field: ROYAL.purple, field2: ROYAL.crimson, gold: ROYAL.gold });
  }
  function fin(c, T, L) {
    c.fillStyle = L.secondary; c.fillRect(24, 3, 9.5, 5.6);
    // the commoners' badge: an accent disc with the company's initial
    const w = finPlan(6.0), cx = w.le + w.c * 0.45, cy = 6.0, r = 1.05, flip = T.flip ? -1 : 1;
    c.fillStyle = L.accent; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.save(); c.translate(cx, cy); c.scale(flip * r * 1.3, -r * 1.3);
    c.font = "800 1px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = pick(L.accent, [L.secondary, '#15181d', '#ffffff'], 2.4);
    c.fillText((String(L.display).match(/[A-Za-z0-9]/)?.[0] || 'K').toUpperCase(), 0, 0.06);
    c.restore();
  }
  function wing(c, T, L, top) {
    c.fillStyle = top ? shade(L.primary, 0.95) : shade(L.primary, 0.84); c.fillRect(-16, 12, 32, 5);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.02;
    for (const sg of [-1, 1]) for (const [a, b, h] of [...FLAPS, AIL]) { const pa = wingPlan(a), pb = wingPlan(b); c.beginPath(); c.moveTo(sg * a, pa.le + pa.c * h); c.lineTo(sg * b, pb.le + pb.c * h); c.stroke(); }
    if (!top) A.text(c, T, L.registration, 9.0, 14.4, 5, 1.0, { font: '700', fill: pick(shade(L.primary, 0.84), ['#15181d', '#f4efe3'], 3), plan: true });
  }
  function tail(c, L) { c.fillStyle = L.secondary; c.fillRect(-5, 27, 10, 5); }
  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    A.region(ctx, REG.fusL, A.side(REG.fusL), (c, T) => side(c, T, L));
    A.region(ctx, REG.fusR, A.side(REG.fusR), (c, T) => side(c, T, L));
    A.region(ctx, REG.finL, A.side(REG.finL), (c, T) => fin(c, T, L));
    A.region(ctx, REG.finR, A.side(REG.finR), (c, T) => fin(c, T, L));
    A.region(ctx, REG.wingT, A.plan(REG.wingT), (c, T) => wing(c, T, L, true));
    A.region(ctx, REG.wingB, A.plan(REG.wingB), (c, T) => wing(c, T, L, false));
    A.region(ctx, REG.tail, A.plan(REG.tail), (c) => tail(c, L));
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, metal: '#b8bec4', dark: '#2a2c30', black: '#0d0e10', gold: ROYAL.gold, purple: ROYAL.purple, white: '#f2f2ee', radome: '#3c4046', grey: '#c4c8cc' };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createDash8Materials(quality, livery, ctx) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1.0 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.4, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('dash8-trim', { envMapIntensity: 1.1 });
  const prop = pbrMaterial('dash8-prop', { envMapIntensity: 1.1 });
  const propSpin = spinPatch(prop, 'dash8', () => ctx.propAngle || 0);
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0 });
  // like the Herc: a slow-turning turboprop owns its blur (ctx.discBlur), not the rig's piston curve
  Object.defineProperty(disc, 'opacity', { get: () => 2.2 * (ctx.discBlur ?? 0), set() {}, configurable: true });
  const discSpin = spinPatch(disc, 'dash8-disc', () => ctx.discAngle || 0);
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, disc, lights, beacon];
  return { paint, trim, prop, propSpin, disc, discSpin, lights, beacon, all: () => list };
}

const COL = {
  tire: srgb('#16171a'), hub: srgb('#9aa0a6'), steel: srgb('#8e949a'), dark: srgb('#2b2d31'), black: srgb('#0c0d0f'),
  glass: srgb('#121a22'), frame: srgb('#2a2e35'), blade: srgb('#1d1f22'), spinner: srgb('#e9e9e4'), exhaust: srgb('#4a4540'),
  gearLeg: srgb('#c3c7cb'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

export function buildDash8Exterior(quality, mats, ctx) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), beaconB = new Builder(), gear = new Builder();

  // ---------- fuselage ----------
  const N = T.n(36, 12);
  const st = [0, 0.04];
  { const ds = (s) => (s < 1.2 ? 0.22 : s < 5 ? 0.5 : s < 23 ? 1.6 : 0.8) / Math.max(0.3, T.k); let s = 0.04; while (s < LENGTH - 0.02) { s = Math.min(LENGTH, s + ds(s)); st.push(+s.toFixed(3)); } }
  for (const k of [11.8, 12.6, 13.4, 16.4, 17.6, 18.4]) if (!T.lod2 && !st.includes(k)) st.push(k);
  st.sort((a, b) => a - b);
  const ring = (s, t0, t1, n) => { const sec = FUS(s), r = []; for (let j = 0; j <= n; j++) r.push(secPt(sec, lerp(t0, t1, j / n))); return r; };
  const outF = (p, i) => [p[0], p[1] - FUS(st[i]).yc, 0];
  body.loft(st.map((s) => ring(s, 0, Math.PI, N / 2)), { closed: false, out: outF, uv: (p) => uvSide(REG.fusR, p[2], p[1]) });
  body.loft(st.map((s) => ring(s, Math.PI, 2 * Math.PI, N / 2)), { closed: false, out: outF, uv: (p) => uvSide(REG.fusL, p[2], p[1]) });
  fan(body, ring(LENGTH, 0, 2 * Math.PI, N).slice(0, -1), [0, 0, 1], sw('secondary'));
  if (!T.lod2) for (const p of PANES) for (const sg of [1, -1]) {
    const [s0, s1, t0, t1] = p, ta = sg > 0 ? t0 : -t1, tb = sg > 0 ? t1 : -t0;
    if (!T.far) skinPatch(trim, FUS, s0 - 0.03, s1 + 0.03, ta - 0.02, tb + 0.02, 2, T.i(3, 1), 0.006, RM.paint, COL.frame);
    skinPatch(trim, FUS, s0, s1, ta, tb, T.i(3, 1), T.i(4, 2), 0.014, RM.glass, COL.glass);
  }

  // ---------- wing: high, straight, tapered outboard of the nacelles ----------
  const nC = T.n(22, 8), wStep = T.step(1.4);
  const pieces = {};
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg), caps = [true, true];
    if (T.far) { wingPanel(body, wingPlan, S([0, WING.inner, WING.tip]), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps }); continue; }
    const full = (a, b) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps });
    const cut = (a, b, h) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { cTo: h, regT: REG.wingT, regB: REG.wingB, caps });
    full(0, FLAPS[0][0]); cut(...FLAPS[0]); full(FLAPS[0][1], FLAPS[1][0]); cut(...FLAPS[1]); full(FLAPS[1][1], AIL[0]); cut(...AIL); full(AIL[1], WING.tip);
    const hp = (x, h) => { const w = wingPlan(x); const [yu, yl] = FOIL(h + 0.012); return [x * sg, w.y + ((yu + yl) / 2) * w.c * w.thk + w.twist * (h - 0.25) * w.c, w.le + (h + 0.012) * w.c]; };
    const surf = (name, a, b, h) => {
      const B = new Builder();
      wingPanel(B, wingPlan, S(spanSteps(a + 0.04, b - 0.04, wStep)), FOIL, nC, { cFrom: h + 0.008, roundNose: true, regT: REG.wingT, regB: REG.wingB });
      const pa = hp(a + 0.04, h), pb = hp(b - 0.04, h);
      pieces[name] = sg > 0 ? { B, a: pa, b: pb } : { B, a: pb, b: pa };
    };
    const k = sg > 0 ? 'R' : 'L';
    surf('flapIn' + k, ...FLAPS[0]); surf('flapOut' + k, ...FLAPS[1]); surf('ail' + k, ...AIL);
  }

  // ---------- nacelles + six-blade props (one spin mesh for both) ----------
  const propParts = [], discParts = [];
  for (const sg of [1, -1]) {
    const x = sg * ENG_X, y = PROP.y, z0 = PROP.s + 0.25, n = T.n(20, 8);
    const rings = (T.far ? NAC.filter((_, i) => i % 2 === 0 || i === NAC.length - 1) : NAC).map(([dz, hw, top, bot]) => {
      const r = [];
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), up = c >= 0;
        const e = up ? 2.3 : 2.2, h = up ? top : bot;
        r.push([x + hw * Math.sign(s) * Math.abs(s) ** (2 / e), y + h * Math.sign(c) * Math.abs(c) ** (2 / e), z0 + dz]);
      }
      return r;
    });
    body.loft(rings, { out: (p) => [p[0] - x, p[1] - y, 0], uv: () => sw('primary'), capEnd: true, capUV: () => sw('primary') });
    if (T.detail) {
      trim.addGeo(new THREE.BoxGeometry(0.36, 0.2, 0.8), M4(x, y - 0.6, z0 + 0.6), RM.darkMetal, COL.black);
      rod(trim, [x + sg * 0.46, y + 0.2, z0 + 2.6], [x + sg * 0.56, y + 0.22, z0 + 3.4], 0.12, 10, [0.6, 0.6], COL.exhaust);
    }
    const hub = [x, y, PROP.s];
    const spin = T.far ? [[-0.9, 0.03], [-0.4, 0.36], [0.25, 0.4]] : [[-0.9, 0.03], [-0.7, 0.22], [-0.4, 0.35], [-0.1, 0.4], [0.25, 0.4]];
    trim.loft(spin.map(([dz, r]) => circle(T.far ? 8 : T.n(16, 8), r).map(([a, b]) => [hub[0] + a, hub[1] + b, hub[2] + dz])), { out: (p) => [p[0] - hub[0], p[1] - hub[1], -0.3], color: COL.spinner, uv: () => RM.paint });
    propParts.push({
      hub, build(B) {
        if (T.far) return;
        const pf = naca(0.03, 0.4, 0.1), K = T.i(8, 4), rs = [];
        for (let k = 0; k <= K; k++) rs.push(lerp(0.36, PROP.R, k / K));
        for (let bI = 0; bI < PROP.blades; bI++) {
          const rot = (bI / PROP.blades) * Math.PI * 2, R = [];
          for (const r of rs) {
            const u = (r - 0.36) / (PROP.R - 0.36);
            // scimitar-ish: wide in the middle, swept tip
            let c = 0.26 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.05)) - 0.06 * u;
            if (u > 0.9) c *= Math.sqrt(Math.max(0.15, 1 - ((u - 0.9) / 0.105) ** 2));
            const sweep = 0.25 * u * u, phi = Math.atan(2.4 / (2 * Math.PI * Math.max(0.3, r))) + 0.1, { loop } = airfoilLoop(pf, T.n(8, 4), 0, 1, false);
            const cp = Math.cos(phi), sp = Math.sin(phi);
            R.push(loop.map(([xc, yv]) => { const a = (xc - 0.35) * c - sweep, b = yv * c * lerp(1.4, 0.8, u); const xx = -cp * a - sp * b, zz = sp * a - cp * b; return [hub[0] + xx * Math.cos(rot) - r * Math.sin(rot), hub[1] + xx * Math.sin(rot) + r * Math.cos(rot), hub[2] + zz]; }));
          }
          B.loft(R, { out: () => [0, 0, -1], capEnd: true, color: COL.blade, uv: () => [0.55, 0.1] });
        }
      },
    });
    discParts.push({ hub, build(B) { B.addGeo(new THREE.CircleGeometry(PROP.R, T.n(40, 16)), M4(hub[0], hub[1], hub[2] - 0.05), [0, 0], [1, 1, 1]); } });
  }

  // ---------- T-tail: swept fin + rudder, the tailplane on top with elevators, a bullet fairing; dorsal fillet ----------
  const sym = naca(0, 0.4, 0.12);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  {
    const ys = spanSteps(FIN.y0 - 0.15, FIN.top, T.far ? 2.4 : T.step(0.7));
    const rings = ys.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), 0, T.far ? 1 : FIN.hinge, false); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); });
    body.loft(rings, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    if (!T.far) {
      const rud = new Builder(), ry = spanSteps(FIN.y0 + 0.4, FIN.top - 0.1, T.step(0.7));
      rud.loft(ry.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), FIN.hinge + 0.01, 1, true); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); }), { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
      const hz = (y) => { const w = finPlan(y); return [0, y, w.le + (FIN.hinge + 0.015) * w.c]; };
      pieces.rudder = { B: rud, a: hz(FIN.y0 + 0.4), b: hz(FIN.top - 0.1) };
      body.loft([0, 1].map((u) => { const s = lerp(21.8, FIN.le0 + 0.6, u), y = FUS(s).yc + FUS(s).ht - 0.05; return [[-0.05, y, s], [0, y + u * 0.55, s + 0.5 * u], [0.05, y, s]]; }), { uv: finUV });
    }
    const xs = spanSteps(0, STAB.half, T.far ? STAB.half : T.step(0.9));
    for (const sg of [1, -1]) wingPanel(body, stabPlan, xs.map((x) => x * sg), sym, T.n(14, 6), T.far ? { uvT: tUV, uvB: tUV } : { cTo: STAB.hinge, uvT: tUV, uvB: tUV });
    if (!T.far) {
      const elev = new Builder();
      for (const sg of [1, -1]) wingPanel(elev, stabPlan, spanSteps(0.15, STAB.half - 0.05, T.step(0.9)).map((x) => x * sg), sym, T.n(14, 6), { cFrom: STAB.hinge + 0.01, roundNose: true, uvT: tUV, uvB: tUV });
      const e0 = stabPlan(0);
      pieces.elevator = { B: elev, a: [-1, STAB.y, e0.le + (STAB.hinge + 0.015) * e0.c], b: [1, STAB.y, e0.le + (STAB.hinge + 0.015) * e0.c] };
      const bs = stabLe0() - 0.35, prof = [[0, 0.02], [0.3, 0.13], [0.8, 0.17], [2.3, 0.17], [2.8, 0.04]];
      body.loft(prof.map(([u, r]) => circle(T.n(12, 6), r).map(([a, b]) => [a, STAB.y + b, bs + u])), { out: (p) => [p[0], p[1] - STAB.y, 0], uv: () => sw('secondary') });
    }
  }

  // ---------- gear: twin-wheel mains down from the nacelles, a twin nose gear ----------
  {
    const nW = T.n(18, 8), cols = { tire: COL.tire, hub: COL.hub };
    const whl = (c, r, w) => (T.far ? gear.addGeo(new THREE.CylinderGeometry(r, r, w, T.lod2 ? 6 : 8, 1), M4(c[0], c[1], c[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, COL.tire) : wheel(gear, c, r, w, nW, cols, RM));
    const G = GEAR.main;
    for (const sg of [1, -1]) {
      rod(gear, [sg * G.x, G.top, G.s - 0.3], [sg * G.x, G.r, G.s], 0.1, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
      if (!T.far) { rod(gear, [sg * (G.x - G.off), G.r, G.s], [sg * (G.x + G.off), G.r, G.s], 0.06, 6, RM.steel, COL.steel); rod(gear, [sg * G.x, G.top, G.s + 0.9], [sg * G.x, G.r + 0.7, G.s], 0.05, 6, RM.steel, COL.steel); }
      for (const d of [-G.off, G.off]) whl([sg * G.x + d, G.r, G.s], G.r, G.w);
    }
    const Nn = GEAR.nose;
    rod(gear, [0, Nn.top, Nn.s - 0.1], [0, Nn.r, Nn.s], 0.06, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
    if (!T.far) rod(gear, [-Nn.x - 0.08, Nn.r, Nn.s], [Nn.x + 0.08, Nn.r, Nn.s], 0.04, 6, RM.steel, COL.steel);
    for (const sg of [1, -1]) whl([sg * Nn.x, Nn.r, Nn.s], Nn.r, Nn.w);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = wingPlan(WING.tip - 0.05), p = [sg * (WING.tip + 0.04), w.y, w.le + 0.2];
    lights.addGeo(new THREE.SphereGeometry(0.07, T.far ? 4 : 8, T.far ? 2 : 6), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    const q = [sg * (WING.tip + 0.04), w.y, w.le + w.c - 0.1];
    lights.addGeo(new THREE.SphereGeometry(0.05, T.far ? 4 : 8, T.far ? 2 : 6), M4(...q), [0, 0], COL.lensW);
    lightPts.push({ p: q, col: [1, 1, 1], kind: 'strobe' });
  }
  { const tp = stabPlan(0), p = [0, STAB.y + 0.18, tp.le + tp.c * 0.9]; lights.addGeo(new THREE.SphereGeometry(0.05, 6, 4), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  for (const [s, top] of [[19.0, true], [15.0, false]]) {
    const p = secPt(FUS(s), top ? 0 : Math.PI), q = [0, p[1] + (top ? 0.08 : -0.05), s];
    beaconB.addGeo(new THREE.SphereGeometry(0.1, T.far ? 4 : 10, T.far ? 2 : 6), M4(...q, 1, 0.6, 1.5), [0, 0], [1, 1, 1]);
    lightPts.push({ p: q, col: [1, 0.1, 0.06], kind: 'beacon' });
  }

  // ---------- assemble ----------
  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  meshes.beacon = mkMesh('beacon', beaconB, mats.beacon, { cast: false, receive: false }); group.add(meshes.beacon);
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  const gearPivot = new THREE.Group();
  gearPivot.name = 'gear-pivot';
  gearPivot.position.y = 2.7;
  const gearMesh = mkMesh('gear', gear, mats.trim);
  gearMesh.position.y = -2.7;
  gearPivot.add(gearMesh);
  if (T.far) (ctx.farGear ||= []).push(gearPivot); else group.add(gearPivot);
  const blades = spinMesh('prop', propParts, mats.prop, mats.propSpin || { update() {} });
  blades.castShadow = false;
  group.add(blades);
  let discMesh = null;
  if (!T.far) { discMesh = spinMesh('propDisc', discParts, mats.disc, mats.discSpin || { update() {} }); discMesh.renderOrder = 3; group.add(discMesh); }
  const propGroup = propProxy(), propMesh = propProxy(), disc = propProxy();
  if (!T.far) {
    Object.defineProperty(propMesh, 'visible', { get: () => blades.visible, set() { blades.visible = true; } });
    Object.defineProperty(disc, 'visible', { get: () => discMesh.visible, set() { discMesh.visible = (ctx.discBlur ?? 0) > 0.01; } });
  }
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, gearPivot, blades, discMesh };
}

const MAX = { aileron: 20 * D2R, elevUp: 26 * D2R, elevDown: 18 * D2R, rudder: 26 * D2R, flaps: 35 * D2R };
export const DASH8_DIMS = { length: LENGTH, span: 2 * WING.tip, height: 8.3, gearHeight: CG.y, groundPitch: 0, restHeight: CG.y };

export async function createDash8(opts = {}) {
  let C = null;
  const def = {
    id: 'dash8', cg: CG, eye: { x: -0.45, y: 3.05, s: 2.5, pitch: -0.1 },
    dims: DASH8_DIMS,
    lod: [480, 280], rpm: { idle: 600, max: 420 },
    createLivery: (q) => createDash8Livery(q),
    createMaterials: (q, l, ctx) => { C = ctx; return createDash8Materials(q, l, ctx); },
    buildExterior: (q, mats, ctx) => buildDash8Exterior(q, mats, ctx),
    animate: (ext, cur, dt, ctx) => animateBig(ext, cur, dt, ctx, MAX, {
      flapAft: 0.4,
      extra: (e, cur, dt) => {
        const r = ctx.rpm ?? 600;
        ctx.discBlur = 0.9 * THREE.MathUtils.smoothstep(r, 450, 900);
        ctx.propAngle = ((ctx.propAngle || 0) - (0.5 + 2.2 * clamp((r - 200) / 650, 0, 1)) * Math.PI * 2 * dt) % (Math.PI * 200);
        ctx.discAngle = e.disc.rotation.z;
      },
    }),
  };
  return finishBig(await assembleRig(def, opts), C, opts);
}
