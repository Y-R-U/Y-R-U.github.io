import * as THREE from 'three';
import { Builder, naca, airfoilLoop, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { sectionTable, secPt, skinPatch, wingPanel, spanSteps, propProxy, wheel, animateBig, finishBig, COCKPIT_STICK } from './jetkit.js';
import { buildGlassCockpit, glassPilot } from './glass_cockpit.js';

// "Monogrammed Lear": a Learjet-ish business jet. Low swept wing with tip tanks, two engines on the rear fuselage,
// T-tail with the royal monogram on the fin. Build frame: y = height above ground (wheels on y = 0), z = station aft
// of the nose tip, x = right. Real: length 14.8, span 12.0 over the tanks, height 3.7, wing area 23.5 m².
export const CG = { s: 7.7, y: 1.35 };
export const LENGTH = 14.6;
// [s, yc, w, ht, hb, nt, nb, hump hy, ha, hh, belly fairing fy, fa, fb]
const KEYS = [
  [0, 1.05, 0.03, 0.03, 0.03, 2, 2, 0, 0, 0, 0.75, 0, 0],
  [0.15, 1.06, 0.13, 0.12, 0.12, 2, 2, 0, 0, 0, 0.75, 0, 0],
  [0.45, 1.08, 0.25, 0.22, 0.24, 2, 2, 0, 0, 0, 0.75, 0, 0],
  [1.0, 1.11, 0.4, 0.34, 0.4, 2, 2, 0, 0, 0, 0.75, 0, 0],
  [1.8, 1.16, 0.54, 0.44, 0.54, 2.05, 2, 0, 0, 0, 0.75, 0, 0],
  [2.6, 1.22, 0.65, 0.52, 0.64, 2.1, 2.05, 0, 0, 0, 0.75, 0, 0],
  [3.0, 1.27, 0.7, 0.63, 0.7, 2.1, 2.05, 0, 0, 0, 0.75, 0, 0],
  [3.4, 1.31, 0.74, 0.74, 0.74, 2.15, 2.1, 0, 0, 0, 0.75, 0, 0],
  [3.8, 1.34, 0.77, 0.79, 0.77, 2.2, 2.1, 0, 0, 0, 0.75, 0, 0],
  [4.2, 1.35, 0.78, 0.8, 0.78, 2.2, 2.1, 0, 0, 0, 0.75, 0, 0],
  [6.2, 1.35, 0.78, 0.8, 0.78, 2.2, 2.1, 0, 0, 0, 0.75, 0, 0],
  [7.0, 1.35, 0.78, 0.8, 0.78, 2.2, 2.1, 0, 0, 0, 0.72, 0.8, 0.3],
  [8.6, 1.35, 0.78, 0.8, 0.78, 2.2, 2.1, 0, 0, 0, 0.72, 0.85, 0.32],
  [9.6, 1.36, 0.76, 0.78, 0.74, 2.2, 2.1, 0, 0, 0, 0.75, 0.5, 0.22],
  [10.4, 1.39, 0.7, 0.72, 0.64, 2.2, 2.1, 0, 0, 0, 0.75, 0, 0],
  [11.6, 1.47, 0.57, 0.6, 0.5, 2.15, 2.05, 0, 0, 0, 0.75, 0, 0],
  [12.9, 1.6, 0.4, 0.42, 0.32, 2.1, 2, 0, 0, 0, 0.75, 0, 0],
  [14.1, 1.74, 0.18, 0.2, 0.14, 2, 2, 0, 0, 0, 0.75, 0, 0],
  [LENGTH, 1.8, 0.04, 0.04, 0.04, 2, 2, 0, 0, 0, 0.75, 0, 0],
];
export const FUS = sectionTable(KEYS);
const D2R = Math.PI / 180;
export const WING = { le0: 6.2, sweep: Math.tan(13 * D2R), rootC: 2.9, tipC: 1.45, tip: 5.45, y0: 0.82, dih: Math.tan(2.5 * D2R), flap: [0.85, 3.6, 0.74], ail: [3.7, 5.15, 0.76] };
export function wingPlan(x) {
  const ax = Math.max(0, x), u = clamp(ax / WING.tip, 0, 1);
  return { le: WING.le0 + ax * WING.sweep, c: lerp(WING.rootC, WING.tipC, u), y: WING.y0 + ax * WING.dih, thk: lerp(1.0, 0.75, u), twist: -0.02 * u };
}
const FOIL = naca(0.02, 0.4, 0.13);
export const TANK = { x: 5.72, r: 0.3, s0: 6.05, s1: 9.6 };
export const ENG = { x: 1.3, y: 1.86, s0: 10.35, s1: 12.95, r: 0.4 };
export const FIN = { y0: 2.0, top: 3.6, le0: 11.55, sweep: Math.tan(40 * D2R), rootC: 2.55, tipC: 1.35, hinge: 0.7 };
export const STAB = { y: 3.64, half: 2.25, sweep: Math.tan(30 * D2R), rootC: 1.35, tipC: 0.72, hinge: 0.7 };
export const GEAR = { main: { x: 1.25, s: 8.3, r: 0.3, w: 0.2, top: 0.72 }, nose: { s: 2.4, r: 0.21, w: 0.14, top: 0.72 } };
export const EYE = { x: -0.33, y: 1.92, s: 3.95, pitch: -0.1 };
// cockpit glass, right side (mirrored): [s0, s1, t0, t1] with t the polar angle from the top
export const PANES = [[2.6, 3.45, 0.06, 1.0], [3.55, 4.15, 0.45, 1.1]];
const finPlan = (y) => { const u = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 1); return { le: FIN.le0 + (y - FIN.y0) * FIN.sweep, c: lerp(FIN.rootC, FIN.tipC, u), thk: lerp(1.05, 0.85, u) }; };
const stabLe0 = () => finPlan(FIN.top).le + 0.05;
export function stabPlan(x) { const ax = Math.abs(x), u = clamp(ax / STAB.half, 0, 1); return { le: stabLe0() + ax * STAB.sweep, c: lerp(STAB.rootC, STAB.tipC, u), y: STAB.y, thk: lerp(1, 0.8, u) }; }

// ---------- livery: primary body, secondary cheatline + fin, the royal monogram in gold ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.24, s0: -0.2, s1: 15.0, h0: 0.45, h1: 2.4, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.24, y1: 0.48, s0: -0.2, s1: 15.0, h0: 0.45, h1: 2.4, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.48, y1: 0.64, s0: 11.2, s1: 15.0, h0: 1.9, h1: 3.8, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.48, y1: 0.64, s0: 11.2, s1: 15.0, h0: 1.9, h1: 3.8, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.64, y1: 0.76, a0: -6.1, a1: 6.1, s0: 6.0, s1: 10.0, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.76, y1: 0.88, a0: -6.1, a1: 6.1, s0: 6.0, s1: 10.0, flip: true },
  tail: { x0: 0, x1: 0.5, y0: 0.88, y1: 0.975, a0: -2.4, a1: 2.4, s0: 12.8, s1: 15.0, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'gold', 'purple', 'white', 'radome'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const cheat = (s) => FUS(s).yc - 0.06 + Math.max(0, s - 10) * 0.035;   // cheatline centre, rising to the tail

// the royal cypher: the first letter of the player's name under a crown, gold on the fin
function monogram(c, T, L, x, y, h) {
  const ch = (String(L.display || 'K').match(/[A-Za-z0-9]/)?.[0] || 'K').toUpperCase();
  const flip = T.flip ? -1 : 1;
  c.save(); c.translate(x, y); c.scale(flip * h, -h);
  c.font = "italic 700 1px Georgia, 'Times New Roman', serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 0.06; c.strokeStyle = ROYAL.goldDark; c.strokeText(ch, 0, 0.12);
  c.fillStyle = ROYAL.gold; c.fillText(ch, 0, 0.12);
  // flourishes either side, and the crown above
  c.strokeStyle = ROYAL.gold; c.lineWidth = 0.045;
  for (const sgn of [-1, 1]) { c.beginPath(); c.moveTo(sgn * 0.36, 0.4); c.bezierCurveTo(sgn * 0.62, 0.3, sgn * 0.6, -0.05, sgn * 0.42, -0.1); c.stroke(); }
  c.fillStyle = ROYAL.gold;
  c.beginPath(); c.moveTo(-0.3, -0.38); c.lineTo(0.3, -0.38); c.lineTo(0.35, -0.6); c.lineTo(0.17, -0.48); c.lineTo(0, -0.66); c.lineTo(-0.17, -0.48); c.lineTo(-0.35, -0.6); c.closePath(); c.fill();
  c.fillStyle = ROYAL.crimson; c.fillRect(-0.27, -0.42, 0.54, 0.05);
  c.restore();
}

function createBizjetLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  { const g = rough.getContext('2d'); g.fillStyle = 'rgb(0,90,0)'; g.fillRect(0, 0, 256, 256); roughTex.needsUpdate = true; }
  function side(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 17, 3);
    // belly a shade lighter/darker, the cheatline in secondary with an accent pinstripe
    c.fillStyle = shade(primary, 0.88); c.beginPath(); c.moveTo(-1, 0); for (let s = -1; s <= 15.2; s += 0.2) c.lineTo(s, FUS(Math.max(0, s)).yc - 0.42); c.lineTo(15.2, 0); c.closePath(); c.fill();
    const band = (off, w, col) => { c.fillStyle = col; c.beginPath(); for (let s = 0.6; s <= 14.8; s += 0.1) c.lineTo(s, cheat(s) + off + w / 2); for (let s = 14.8; s >= 0.6; s -= 0.1) c.lineTo(s, cheat(s) + off - w / 2); c.closePath(); c.fill(); };
    band(0, 0.2, secondary); band(0.15, 0.035, accent); band(-0.15, 0.02, accent);
    // radome, cockpit glass frame (painted surround), cabin windows, the airstair door
    c.fillStyle = '#3a3e44'; c.beginPath(); c.moveTo(-1, 0); c.lineTo(0.3, 0); c.quadraticCurveTo(0.42, 1.06, 0.3, 2.2); c.lineTo(-1, 2.2); c.closePath(); c.fill();
    c.fillStyle = '#121820';
    for (const [s0, s1, t0, t1] of PANES) { const o = []; for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s0, s1, k / 6)), t0)); for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s1, s0, k / 6)), t1)); c.beginPath(); o.forEach((q, i) => (i ? c.lineTo(q[2], q[1]) : c.moveTo(q[2], q[1]))); c.closePath(); c.fill(); }
    for (let i = 0; i < 5; i++) { const s = 5.1 + i * 0.78; c.fillStyle = '#121820'; c.beginPath(); c.ellipse(s, FUS(s).yc + 0.2, 0.14, 0.19, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(200,200,200,0.5)'; c.lineWidth = 0.015; c.stroke(); }
    c.strokeStyle = 'rgba(20,22,26,0.45)'; c.lineWidth = 0.015; c.strokeRect(4.35, FUS(4.6).yc - 0.6, 0.62, 1.25);
    // the player's name forward, registration on the engine pylon area, a small crest by the door
    const nameCol = pick(primary, [secondary, accent, '#15181d'], 2.6);
    A.text(c, T, L.display, 7.2, FUS(7.2).yc + 0.55, 3.0, 0.24, { font: 'italic 800', fill: nameCol, family: "Georgia, 'Times New Roman', serif" });
    A.text(c, T, L.registration, 10.6, FUS(10.6).yc - 0.38, 1.2, 0.2, { font: '700', fill: pick(primary, ['#15181d', '#f4efe3'], 3) });
    crest(c, T, 4.0, FUS(4.0).yc + 0.25, 0.32, { field: ROYAL.purple, field2: ROYAL.crimson, gold: ROYAL.gold });
  }
  function fin(c, T, L) {
    c.fillStyle = L.secondary; c.fillRect(11, 1.8, 4.2, 2.2);
    c.fillStyle = L.accent; c.beginPath(); for (let y = 2.0; y <= 3.62; y += 0.1) { const w = finPlan(y); c.lineTo(w.le + w.c * 0.06, y); } for (let y = 3.62; y >= 2.0; y -= 0.1) { const w = finPlan(y); c.lineTo(w.le + w.c * 0.1, y); } c.closePath(); c.fill();
    const w = finPlan(2.85); monogram(c, T, L, w.le + w.c * 0.48, 2.82, 0.95);
  }
  function wing(c, T, L, top) {
    c.fillStyle = top ? shade(L.primary, 0.94) : shade(L.primary, 0.85); c.fillRect(-7, 5.8, 14, 4.4);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.012;
    for (const sg of [-1, 1]) for (const [a, b, h] of [WING.flap, WING.ail]) { const pa = wingPlan(a), pb = wingPlan(b); c.beginPath(); c.moveTo(sg * a, pa.le + pa.c * h); c.lineTo(sg * b, pb.le + pb.c * h); c.stroke(); }
    if (!top) A.text(c, T, L.registration, 0, 8.3, 4.5, 0.7, { font: '700', fill: pick(shade(L.primary, 0.85), ['#15181d', '#f4efe3'], 3), plan: true });
  }
  function tail(c, L) { c.fillStyle = L.secondary; c.fillRect(-3, 12.6, 6, 2.6); }
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
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, metal: '#b8bec4', dark: '#2a2c30', black: '#0d0e10', gold: ROYAL.gold, purple: ROYAL.purple, white: '#f2f2ee', radome: '#2a2d31' };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createBizjetMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1.1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.7, clearcoatRoughness: 0.12 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('bizjet-trim', { envMapIntensity: 1.1 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, disc, lights, beacon];
  return { paint, trim, disc, lights, beacon, all: () => list };
}

const COL = {
  tire: srgb('#16171a'), hub: srgb('#9aa0a6'), steel: srgb('#8e949a'), dark: srgb('#2b2d31'), black: srgb('#0c0d0f'),
  gold: srgb(ROYAL.gold), glass: srgb('#121a22'), frame: srgb('#2a2e35'), fan: srgb('#3a3d42'), lip: srgb('#c9ced3'),
  gearLeg: srgb('#c3c7cb'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

export function buildBizjetExterior(quality, mats, ctx) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), beaconB = new Builder(), gear = new Builder();

  // ---------- fuselage: two half lofts (one atlas region each) ----------
  const N = T.n(36, 12);
  const st = [0, 0.04];
  { const ds = (s) => (s < 1.2 ? 0.2 : s < 4.4 ? 0.35 : s < 10 ? 0.9 : 0.5) / Math.max(0.3, T.k); let s = 0.04; while (s < LENGTH - 0.02) { s = Math.min(LENGTH, s + ds(s)); st.push(+s.toFixed(3)); } }
  const ring = (s, t0, t1, n) => { const sec = FUS(s), r = []; for (let j = 0; j <= n; j++) r.push(secPt(sec, lerp(t0, t1, j / n))); return r; };
  const outF = (p, i) => [p[0], p[1] - FUS(st[i]).yc, 0];
  body.loft(st.map((s) => ring(s, 0, Math.PI, N / 2)), { closed: false, out: outF, uv: (p) => uvSide(REG.fusR, p[2], p[1]) });
  body.loft(st.map((s) => ring(s, Math.PI, 2 * Math.PI, N / 2)), { closed: false, out: outF, uv: (p) => uvSide(REG.fusL, p[2], p[1]) });
  fan(body, ring(LENGTH, 0, 2 * Math.PI, N).slice(0, -1), [0, 0, 1], sw('primary'));
  // cockpit glass (exterior skin patches; the flight deck's own shell has the holes)
  if (!T.lod2) for (const p of PANES) for (const sg of [1, -1]) {
    const [s0, s1, t0, t1] = p, ta = sg > 0 ? t0 : -t1, tb = sg > 0 ? t1 : -t0;
    if (!T.far) skinPatch(trim, FUS, s0 - 0.03, s1 + 0.03, ta - 0.02, tb + 0.02, 2, T.i(3, 1), 0.006, RM.paint, COL.frame);
    skinPatch(trim, FUS, s0, s1, ta, tb, T.i(3, 1), T.i(4, 2), 0.014, RM.glass, COL.glass);
  }

  // ---------- wing: low, swept, tip tanks; flaps and ailerons ----------
  const nC = T.n(22, 8), wStep = T.step(1.1);
  const pieces = {};
  const tUVT = (p) => uvPlan(REG.wingT, p[0], p[2]), tUVB = (p) => uvPlan(REG.wingB, p[0], p[2]);
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg), caps = [true, true];
    if (T.far) { wingPanel(body, wingPlan, S([0, WING.tip]), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps }); continue; }
    const full = (a, b) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps });
    const cut = (a, b, h) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { cTo: h, regT: REG.wingT, regB: REG.wingB, caps });
    full(0, WING.flap[0]); cut(...WING.flap); full(WING.flap[1], WING.ail[0]); cut(...WING.ail); full(WING.ail[1], WING.tip);
    const hp = (x, h) => { const w = wingPlan(x); const [yu, yl] = FOIL(h + 0.012); return [x * sg, w.y + ((yu + yl) / 2) * w.c * w.thk + w.twist * (h - 0.25) * w.c, w.le + (h + 0.012) * w.c]; };
    const surf = (name, a, b, h) => {
      const B = new Builder();
      wingPanel(B, wingPlan, S(spanSteps(a + 0.03, b - 0.03, wStep)), FOIL, nC, { cFrom: h + 0.008, roundNose: true, regT: REG.wingT, regB: REG.wingB });
      const pa = hp(a + 0.03, h), pb = hp(b - 0.03, h);
      pieces[name] = sg > 0 ? { B, a: pa, b: pb } : { B, a: pb, b: pa };
    };
    const k = sg > 0 ? 'R' : 'L';
    surf('flap' + k, ...WING.flap); surf('ail' + k, ...WING.ail);
  }
  // tip tanks: bodies of revolution with a small fin underneath (the Learjet's "Smart" tip-tank fins)
  for (const sg of [1, -1]) {
    const x = sg * TANK.x, w = wingPlan(WING.tip), y = w.y + 0.08, n = T.n(16, 6), L = TANK.s1 - TANK.s0;
    const prof = T.far ? [[0, 0.02], [0.15, 0.85], [0.6, 1], [1, 0.05]] : [[0, 0.02], [0.04, 0.45], [0.12, 0.8], [0.25, 0.97], [0.55, 1], [0.8, 0.85], [0.95, 0.4], [1, 0.05]];
    body.loft(prof.map(([u, r]) => circle(n, r * TANK.r).map(([a, b]) => [x + a, y + b, TANK.s0 + u * L])), { out: (p) => [p[0] - x, p[1] - y, 0], uv: () => sw('secondary') });
    if (!T.lod2) body.loft([0, 1].map((h) => [[x - 0.02, y - TANK.r * 0.8 - h * 0.12, TANK.s1 - 0.9 + h * 0.35], [x + 0.02, y - TANK.r * 0.8 - h * 0.12, TANK.s1 - 0.9 + h * 0.35], [x + 0.02, y - TANK.r * 0.8 - h * 0.12, TANK.s1 - 0.2], [x - 0.02, y - TANK.r * 0.8 - h * 0.12, TANK.s1 - 0.2]]), { uv: () => sw('secondary'), capEnd: true, capUV: () => sw('secondary') });
  }

  // ---------- engines: nacelles on short pylons, a dark fan face with a chrome lip, the exhaust ----------
  for (const sg of [1, -1]) {
    const x = sg * ENG.x, n = T.n(20, 8), L = ENG.s1 - ENG.s0;
    const prof = T.far ? [[0, 0.88], [0.2, 1], [0.75, 0.92], [1, 0.62]] : [[0, 0.86], [0.04, 0.95], [0.15, 1], [0.5, 1], [0.8, 0.9], [0.95, 0.72], [1, 0.62]];
    body.loft(prof.map(([u, r]) => circle(n, r * ENG.r).map(([a, b]) => [x + a, ENG.y + b, ENG.s0 + u * L])), { out: (p) => [p[0] - x, p[1] - ENG.y, 0], uv: () => sw('primary') });
    if (!T.far) {
      trim.addGeo(new THREE.TorusGeometry(ENG.r * 0.86, 0.035, T.n(8, 4), n), M4(x, ENG.y, ENG.s0 + 0.01), RM.chrome, COL.lip);
      trim.addGeo(new THREE.CircleGeometry(ENG.r * 0.84, n), M4(x, ENG.y, ENG.s0 + 0.12, 1, 1, 1, Math.PI, 0, 0), RM.darkMetal, COL.fan);
      trim.addGeo(new THREE.ConeGeometry(0.12, 0.22, T.n(12, 6)), M4(x, ENG.y, ENG.s0 + 0.02, 1, 1, 1, -Math.PI / 2, 0, 0), RM.chrome, COL.lip);
      trim.addGeo(new THREE.CircleGeometry(ENG.r * 0.6, n), M4(x, ENG.y, ENG.s1 - 0.03), RM.black, COL.black);
    }
    // pylon to the fuselage
    const pr = [ENG.s0 + 0.7, ENG.s0 + 1.9], xi = sg * (FUS(11.5).w * 0.7), xo = x - sg * ENG.r * 0.5;
    body.loft(pr.map((s) => [[xi, ENG.y + 0.1, s], [xo, ENG.y + 0.08, s], [xo, ENG.y - 0.08, s], [xi, ENG.y - 0.1, s]]), { uv: () => sw('primary'), capStart: true, capEnd: true, capUV: () => sw('primary') });
  }

  // ---------- T-tail: swept fin + rudder, stabiliser with elevators on top, a bullet fairing ----------
  const sym = naca(0, 0.4, 0.11);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const ys = spanSteps(FIN.y0 - 0.15, FIN.top, T.far ? 1.8 : T.step(0.45));
    const rings = ys.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), 0, T.far ? 1 : FIN.hinge, false); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); });
    body.loft(rings, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    if (!T.far) {
      const rud = new Builder(), ry = spanSteps(FIN.y0 + 0.1, FIN.top - 0.08, T.step(0.45));
      rud.loft(ry.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), FIN.hinge + 0.01, 1, true); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); }), { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
      const hz = (y) => { const w = finPlan(y); return [0, y, w.le + (FIN.hinge + 0.015) * w.c]; };
      pieces.rudder = { B: rud, a: hz(FIN.y0 + 0.1), b: hz(FIN.top - 0.08) };
    }
    const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
    const xs = spanSteps(0, STAB.half, T.step(0.9));
    for (const sg of [1, -1]) wingPanel(body, stabPlan, xs.map((x) => x * sg), sym, T.n(14, 6), T.far ? { uvT: tUV, uvB: tUV } : { cTo: STAB.hinge, uvT: tUV, uvB: tUV });
    if (!T.far) {
      const elev = new Builder();
      for (const sg of [1, -1]) wingPanel(elev, stabPlan, spanSteps(0.12, STAB.half - 0.04, T.step(0.9)).map((x) => x * sg), sym, T.n(14, 6), { cFrom: STAB.hinge + 0.01, roundNose: true, uvT: tUV, uvB: tUV });
      const e0 = stabPlan(0);
      pieces.elevator = { B: elev, a: [-1, STAB.y, e0.le + (STAB.hinge + 0.015) * e0.c], b: [1, STAB.y, e0.le + (STAB.hinge + 0.015) * e0.c] };
      // the bullet fairing where fin meets stab
      const bs = stabLe0() - 0.25, prof = [[0, 0.02], [0.2, 0.1], [0.5, 0.13], [1.4, 0.13], [1.75, 0.03]];
      body.loft(prof.map(([u, r]) => circle(T.n(12, 6), r).map(([a, b]) => [a, STAB.y + b, bs + u])), { out: (p) => [p[0], p[1] - STAB.y, 0], uv: () => sw('secondary') });
    }
  }

  // ---------- gear: trailing-link mains from the wing, a nose leg (telescopes up for the retraction) ----------
  {
    const nW = T.n(18, 8), cols = { tire: COL.tire, hub: COL.hub };
    const whl = (c, r, w) => (T.far ? gear.addGeo(new THREE.CylinderGeometry(r, r, w, T.lod2 ? 6 : 8, 1), M4(c[0], c[1], c[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, COL.tire) : wheel(gear, c, r, w, nW, cols, RM));
    const G = GEAR.main;
    for (const sg of [1, -1]) {
      rod(gear, [sg * G.x, G.top, G.s - 0.05], [sg * (G.x - 0.06), G.r, G.s], 0.06, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
      whl([sg * (G.x + 0.04), G.r, G.s], G.r, G.w);
    }
    const Nn = GEAR.nose;
    rod(gear, [0, Nn.top, Nn.s - 0.08], [0, Nn.r, Nn.s], 0.045, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
    whl([0, Nn.r, Nn.s], Nn.r, Nn.w);
  }

  // ---------- lights: nav on the tip tanks, white tail light, beacons on the fin tip and the belly ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = wingPlan(WING.tip), p = [sg * (TANK.x + TANK.r * 0.7), w.y + 0.1, TANK.s0 + 0.6];
    lights.addGeo(new THREE.SphereGeometry(0.05, T.far ? 4 : 8, T.far ? 2 : 6), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    const q = [sg * TANK.x, w.y + 0.02, TANK.s1 + 0.02];
    lights.addGeo(new THREE.SphereGeometry(0.04, T.far ? 4 : 8, T.far ? 2 : 6), M4(...q), [0, 0], COL.lensW);
    lightPts.push({ p: q, col: [1, 1, 1], kind: 'strobe' });
  }
  { const p = [0, FUS(LENGTH).yc, LENGTH + 0.03]; lights.addGeo(new THREE.SphereGeometry(0.04, 6, 4), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  for (const q of [[0, STAB.y + 0.16, stabLe0() + 0.6], [0, FUS(8.0).yc - FUS(8.0).hb - 0.33, 8.0]]) {
    beaconB.addGeo(new THREE.SphereGeometry(0.06, T.far ? 4 : 10, T.far ? 2 : 6), M4(...q, 1, 0.6, 1.5), [0, 0], [1, 1, 1]);
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
  gearPivot.position.y = 0.78;
  const gearMesh = mkMesh('gear', gear, mats.trim);
  gearMesh.position.y = -0.78;
  gearPivot.add(gearMesh);
  if (T.far) (ctx.farGear ||= []).push(gearPivot); else group.add(gearPivot);
  // no props: the rig pokes propGroup / propMesh / disc, so give it stand-ins
  return { group, meshes, hinges, propGroup: propProxy(), propMesh: propProxy(), disc: propProxy(), lightPts, gearPivot };
}

const MAX = { aileron: 18 * D2R, elevUp: 24 * D2R, elevDown: 16 * D2R, rudder: 25 * D2R, flaps: 40 * D2R };
export const BIZJET_DIMS = { length: 14.8, span: 2 * (TANK.x + TANK.r), height: 3.7, gearHeight: CG.y, groundPitch: 0, restHeight: CG.y };

const COCKPIT = {
  sec: FUS, eye: EYE, floorY: 0.88, shell: { s0: 2.4, s1: 4.6, inset: 0.05, holes: PANES, nt: 64 },
  panel: { s: 3.0, y0: 1.16, y1: 1.54, tilt: 0.2 }, glare: { y: 1.61, depth: 0.22 },
  seats: [-0.33, 0.33], seatS: 4.05, yoke: { s: 3.45, y: 1.48 }, pedestal: { s0: 3.15, s1: 4.0, w: 0.28, y: 1.22 },
  overhead: null, levers: 2, aft: 4.6, label: 'MONOGRAMMED LEAR', dispSize: 0.15, dispX: [-0.56, -0.32, 0, 0.32, 0.56],
  n1: (r) => (r <= 120 ? r : r / 33),
};

export async function createBizjet(opts = {}) {
  let C = null;
  const def = {
    id: 'bizjet', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.02, s: EYE.s + 0.12, pitch: -0.08 },
    portrait: { center: [0, 0.03, 0.12], cockpit: [0.03, 0.03, 0.08], fov: 90, pitch: -0.1 },
    dims: BIZJET_DIMS,
    lod: [360, 210], rpm: { idle: 25, max: 75 },
    createLivery: (q) => createBizjetLivery(q),
    createMaterials: (q, l, ctx) => { C = ctx; return createBizjetMaterials(q, l, ctx); },
    buildExterior: (q, mats, ctx) => buildBizjetExterior(q, mats, ctx),
    buildCockpit: (q, mats, ctx) => buildGlassCockpit(q, mats, ctx, COCKPIT),
    stick: COCKPIT_STICK(COCKPIT),
    createPilot: (q, cfg, ctx) => glassPilot(q, cfg, ctx, COCKPIT),
    animate: (ext, cur, dt, ctx) => animateBig(ext, cur, dt, ctx, MAX, { flapAft: 0.12 }),
  };
  return finishBig(await assembleRig(def, opts), C, opts);
}
