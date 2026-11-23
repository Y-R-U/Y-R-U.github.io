import * as THREE from 'three';
import { Builder, naca, airfoilLoop, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { sectionTable, secPt, skinPatch, wingPanel, spanSteps, propProxy, wheel, animateBig, finishBig, COCKPIT_STICK } from './jetkit.js';
import { buildGlassCockpit, glassPilot } from './glass_cockpit.js';

// "Peasant Express": an A320-ish twinjet. Low swept wing with sharklets, two underwing turbofans, conventional tail.
// Build frame: y = height above ground (wheels on y = 0), z = station aft of the nose tip, x = right.
// Real: length 37.6, span 35.8 over the sharklets, height 11.8, wing area 122.6 m².
export const CG = { s: 17.2, y: 3.55 };
export const LENGTH = 37.6;
// [s, yc, w, ht, hb, nt, nb, hy, ha, hh, belly fairing fy, fa, fb]
const KEYS = [
  [0, 3.02, 0.04, 0.04, 0.04, 2, 2, 0, 0, 0, 2, 0, 0],
  [0.25, 3.05, 0.45, 0.42, 0.44, 2, 2, 0, 0, 0, 2, 0, 0],
  [0.8, 3.13, 0.92, 0.88, 0.95, 2, 2, 0, 0, 0, 2, 0, 0],
  [1.6, 3.24, 1.32, 1.3, 1.38, 2, 2, 0, 0, 0, 2, 0, 0],
  [2.6, 3.37, 1.64, 1.66, 1.72, 2, 2, 0, 0, 0, 2, 0, 0],
  [3.6, 3.47, 1.85, 1.9, 1.88, 2, 2, 0, 0, 0, 2, 0, 0],
  [5.0, 3.54, 1.96, 2.04, 1.97, 2, 2, 0, 0, 0, 2, 0, 0],
  [6.2, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 2, 0, 0],
  [11.4, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 2.0, 0, 0],
  [12.6, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 1.95, 1.9, 0.55],
  [14.0, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 1.9, 2.35, 0.72],
  [19.6, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 1.9, 2.35, 0.72],
  [21.4, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 1.95, 1.9, 0.5],
  [22.8, 3.55, 1.98, 2.07, 2.0, 2, 2, 0, 0, 0, 2.0, 0, 0],
  [24.5, 3.58, 1.96, 2.06, 1.92, 2, 2, 0, 0, 0, 2, 0, 0],
  [27.0, 3.7, 1.82, 1.96, 1.62, 2, 2, 0, 0, 0, 2, 0, 0],
  [29.5, 3.88, 1.56, 1.74, 1.26, 2, 2, 0, 0, 0, 2, 0, 0],
  [32.0, 4.1, 1.18, 1.36, 0.88, 2, 2, 0, 0, 0, 2, 0, 0],
  [34.5, 4.36, 0.74, 0.86, 0.52, 2, 2, 0, 0, 0, 2, 0, 0],
  [36.6, 4.56, 0.32, 0.36, 0.24, 2, 2, 0, 0, 0, 2, 0, 0],
  [LENGTH, 4.62, 0.12, 0.13, 0.1, 2, 2, 0, 0, 0, 2, 0, 0],
];
export const FUS = sectionTable(KEYS);
const D2R = Math.PI / 180;
export const WING = { le0: 13.4, sweep: 0.5, rootC: 6.6, kinkC: 4.0, kink: 6.3, tipC: 1.5, tip: 16.9, y0: 2.25, dih: 0.09 };
export function wingPlan(x) {
  const ax = Math.max(0, x);
  const c = ax <= WING.kink ? lerp(WING.rootC, WING.kinkC, ax / WING.kink) : lerp(WING.kinkC, WING.tipC, clamp((ax - WING.kink) / (WING.tip - WING.kink), 0, 1));
  const u = clamp(ax / WING.tip, 0, 1);
  return { le: WING.le0 + ax * WING.sweep, c, y: WING.y0 + ax * WING.dih, thk: lerp(1.05, 0.8, u), twist: -0.03 * u };
}
const FOIL = naca(0.025, 0.4, 0.12);
const FLAPS = [[2.1, 6.2, 0.72], [6.4, 12.2, 0.74]];
const AIL = [12.4, 15.7, 0.76];
export const ENG = { x: 5.75, y: 1.52, s0: 12.3, s1: 16.8, r: 0.98 };
export const FIN = { y0: 4.9, top: 11.76, le0: 28.3, sweep: Math.tan(37 * D2R), rootC: 6.1, tipC: 2.05, hinge: 0.68 };
export const STAB = { y: 4.22, dih: 0.105, half: 6.25, le0: 31.5, sweep: Math.tan(32 * D2R), rootC: 3.7, tipC: 1.3, hinge: 0.7 };
export const GEAR = { main: { x: 3.8, s: 18.3, r: 0.58, w: 0.38, off: 0.42, top: 2.3 }, nose: { s: 5.1, x: 0.24, r: 0.38, w: 0.24, top: 1.62 } };
export const EYE = { x: -0.5, y: 4.6, s: 3.35, pitch: -0.1 };
// cockpit glass, right side (mirrored): [s0, s1, t0, t1] with t the polar angle from the top
export const PANES = [[2.05, 2.9, 0.06, 1.02], [2.98, 3.62, 0.5, 1.15]];
const WINDOWS = (() => { const o = []; for (let s = 6.6; s < 30.6; s += 0.53) if (!(s > 15.4 && s < 16.9)) o.push(s); return o; })();
const DOORS = [[4.25, 5.1], [15.6, 16.15], [16.2, 16.75], [30.9, 31.75]];

// ---------- livery: primary body, secondary tail and cheatline, the company name big, a crown on the fin ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.24, s0: -0.2, s1: 37.9, h0: 0.9, h1: 5.9, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.24, y1: 0.48, s0: -0.2, s1: 37.9, h0: 0.9, h1: 5.9, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.48, y1: 0.64, s0: 27.6, s1: 37.8, h0: 4.6, h1: 12.0, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.48, y1: 0.64, s0: 27.6, s1: 37.8, h0: 4.6, h1: 12.0, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.64, y1: 0.76, a0: -18.2, a1: 18.2, s0: 13.2, s1: 24.2, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.76, y1: 0.88, a0: -18.2, a1: 18.2, s0: 13.2, s1: 24.2, flip: true },
  tail: { x0: 0, x1: 0.5, y0: 0.88, y1: 0.975, a0: -6.6, a1: 6.6, s0: 31.3, s1: 37.0, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'gold', 'purple', 'white', 'radome', 'grey'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const cheat = (s) => FUS(s).yc - 0.5 + Math.max(0, s - 26) * 0.07;

function finCrown(c, T, L, x, y, h) {
  const flip = T.flip ? -1 : 1;
  c.save(); c.translate(x, y); c.scale(flip * h, h);
  c.fillStyle = L.accent;
  c.beginPath(); c.moveTo(-0.5, -0.32); c.lineTo(0.5, -0.32); c.lineTo(0.62, 0.3); c.lineTo(0.28, 0.02); c.lineTo(0, 0.42); c.lineTo(-0.28, 0.02); c.lineTo(-0.62, 0.3); c.closePath(); c.fill();
  for (const px of [-0.62, 0, 0.62]) { c.beginPath(); c.arc(px, px ? 0.36 : 0.48, 0.08, 0, 7); c.fill(); }
  c.fillRect(-0.5, -0.5, 1.0, 0.13);
  c.restore();
}

function createA320Livery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  { const g = rough.getContext('2d'); g.fillStyle = 'rgb(0,110,0)'; g.fillRect(0, 0, 256, 256); roughTex.needsUpdate = true; }
  function side(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 40, 7);
    c.fillStyle = shade(primary, 0.86); c.beginPath(); c.moveTo(-1, 0); for (let s = -1; s <= 38.2; s += 0.3) { const q = FUS(clamp(s, 0, LENGTH)); c.lineTo(s, q.yc - q.hb * 0.62); } c.lineTo(38.2, 0); c.closePath(); c.fill();
    // a swooping secondary cheatline that runs up into the tail, an accent pinstripe over it
    const band = (off, w, col, s0 = 0.5) => { c.fillStyle = col; c.beginPath(); for (let s = s0; s <= 37.8; s += 0.2) c.lineTo(s, cheat(s) + off + w / 2); for (let s = 37.8; s >= s0; s -= 0.2) c.lineTo(s, cheat(s) + off - w / 2); c.closePath(); c.fill(); };
    band(0, 0.42, secondary, 1.2); band(0.3, 0.08, accent, 2.0);
    c.fillStyle = secondary; c.beginPath(); for (let s = 27; s <= 38; s += 0.2) c.lineTo(s, cheat(s) + 0.2); c.lineTo(38, 7); c.lineTo(31, 7); c.closePath(); c.fill();
    // radome, cockpit glass, a row of cabin windows, doors
    c.fillStyle = '#3c4046'; c.beginPath(); c.moveTo(-1, 0); c.lineTo(0.55, 0); c.quadraticCurveTo(0.75, 3.0, 0.5, 4.2); c.lineTo(-1, 4.2); c.closePath(); c.fill();
    c.fillStyle = '#121820';
    for (const [s0, s1, t0, t1] of PANES) { const o = []; for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s0, s1, k / 6)), t0)); for (let k = 0; k <= 6; k++) o.push(secPt(FUS(lerp(s1, s0, k / 6)), t1)); c.beginPath(); o.forEach((q, i) => (i ? c.lineTo(q[2], q[1]) : c.moveTo(q[2], q[1]))); c.closePath(); c.fill(); }
    for (const s of WINDOWS) { const y = FUS(s).yc + 0.55; c.beginPath(); c.roundRect(s - 0.12, y - 0.17, 0.24, 0.34, 0.1); c.fill(); }
    c.strokeStyle = 'rgba(20,22,26,0.5)'; c.lineWidth = 0.025;
    for (const [s0, s1] of DOORS) { const y = FUS(s0).yc; c.beginPath(); c.roundRect(s0, y - (s1 - s0 < 0.7 ? 0.1 : 1.1), s1 - s0, s1 - s0 < 0.7 ? 1.0 : 1.85, 0.12); c.stroke(); }
    // the company (or player) name along the cabin, registration aft, a little crest by the front door
    const nameCol = pick(primary, [secondary, accent, '#15181d'], 2.6);
    A.text(c, T, String(L.display).toUpperCase(), 14.2, FUS(14).yc + 1.3, 15, 0.62, { font: '800', fill: nameCol });
    A.text(c, T, L.registration, 26.5, cheat(26.5) - 0.48, 2.6, 0.26, { font: '700', fill: pick(primary, ['#15181d', '#f4efe3'], 3) });
    crest(c, T, 6.0, FUS(6.0).yc + 1.3, 0.42, { field: ROYAL.purple, field2: ROYAL.crimson, gold: ROYAL.gold });
  }
  function fin(c, T, L) {
    c.fillStyle = L.secondary; c.fillRect(27, 4, 11, 8.2);
    c.fillStyle = shade(L.secondary, 0.8); c.fillRect(27, 11.4, 11, 0.8);
    finCrown(c, T, L, 33.0, 8.4, 1.9);
  }
  function wing(c, T, L, top) {
    c.fillStyle = top ? '#c4c8cc' : shade(L.primary, 0.82); c.fillRect(-19, 13, 38, 11.4);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.025;
    for (const sg of [-1, 1]) for (const [a, b, h] of [...FLAPS, AIL]) { const pa = wingPlan(a), pb = wingPlan(b); c.beginPath(); c.moveTo(sg * a, pa.le + pa.c * h); c.lineTo(sg * b, pb.le + pb.c * h); c.stroke(); }
    if (top) { c.fillStyle = 'rgba(40,44,50,0.25)'; c.fillRect(-1.6, 14.2, 3.2, 4.4); }
    else A.text(c, T, L.registration, 9.5, 18.2, 6, 1.3, { font: '700', fill: pick(shade(L.primary, 0.82), ['#15181d', '#f4efe3'], 3), plan: true });
  }
  function tail(c, L) { c.fillStyle = L.secondary; c.fillRect(-7, 31, 14, 6.4); }
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

function createA320Materials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1.1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.6, clearcoatRoughness: 0.15 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('a320-trim', { envMapIntensity: 1.1 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, disc, lights, beacon];
  return { paint, trim, disc, lights, beacon, all: () => list };
}

const COL = {
  tire: srgb('#16171a'), hub: srgb('#9aa0a6'), steel: srgb('#8e949a'), dark: srgb('#2b2d31'), black: srgb('#0c0d0f'),
  glass: srgb('#121a22'), frame: srgb('#2a2e35'), fan: srgb('#34373c'), lip: srgb('#c9ced3'), nacelle: srgb('#e9e9e4'),
  gearLeg: srgb('#c3c7cb'), bay: srgb('#5a5f63'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};
const finPlan = (y) => { const u = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 1); return { le: FIN.le0 + (y - FIN.y0) * FIN.sweep, c: lerp(FIN.rootC, FIN.tipC, u), thk: lerp(1.0, 0.85, u) }; };
export function stabPlan(x) { const ax = Math.abs(x), u = clamp(ax / STAB.half, 0, 1); return { le: STAB.le0 + ax * STAB.sweep, c: lerp(STAB.rootC, STAB.tipC, u), y: STAB.y + ax * STAB.dih, thk: lerp(1, 0.8, u) }; }

export function buildA320Exterior(quality, mats, ctx) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), beaconB = new Builder(), gear = new Builder();

  // ---------- fuselage: two half lofts (one atlas region each) ----------
  const N = T.n(40, 12);
  const st = [0, 0.05];
  { const ds = (s) => (s < 1.2 ? 0.25 : s < 6 ? 0.55 : s < 24 ? 2.2 : 0.9) / Math.max(0.3, T.k); let s = 0.05; while (s < LENGTH - 0.02) { s = Math.min(LENGTH, s + ds(s)); st.push(+s.toFixed(3)); } }
  for (const k of [11.4, 12.6, 14.0, 19.6, 21.4, 22.8]) if (!T.lod2 && !st.includes(k)) st.push(k);
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
  // APU exhaust in the tail cone
  if (!T.far) trim.addGeo(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 10, 1, true), M4(0, FUS(LENGTH).yc, LENGTH - 0.05, 1, 1, 1, Math.PI / 2, 0, 0), RM.darkMetal, COL.black);

  // ---------- wing: low, swept, kinked trailing edge, sharklets; flaps and ailerons ----------
  const nC = T.n(22, 8), wStep = T.step(1.5);
  const pieces = {};
  const hp = (x, h, sg) => { const w = wingPlan(x); const [yu, yl] = FOIL(h + 0.012); return [x * sg, w.y + ((yu + yl) / 2) * w.c * w.thk + w.twist * (h - 0.25) * w.c, w.le + (h + 0.012) * w.c]; };
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg), caps = [true, true];
    if (T.far) { wingPanel(body, wingPlan, S([0, WING.kink, WING.tip]), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps }); }
    else {
      const full = (a, b) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps });
      const cut = (a, b, h) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { cTo: h, regT: REG.wingT, regB: REG.wingB, caps });
      full(0, FLAPS[0][0]); cut(...FLAPS[0]); full(FLAPS[0][1], FLAPS[1][0]); cut(...FLAPS[1]); full(FLAPS[1][1], AIL[0]); cut(...AIL); full(AIL[1], WING.tip);
      const surf = (name, a, b, h) => {
        const B = new Builder();
        wingPanel(B, wingPlan, S(spanSteps(a + 0.04, b - 0.04, wStep)), FOIL, nC, { cFrom: h + 0.008, roundNose: true, regT: REG.wingT, regB: REG.wingB });
        const pa = hp(a + 0.04, h, sg), pb = hp(b - 0.04, h, sg);
        pieces[name] = sg > 0 ? { B, a: pa, b: pb } : { B, a: pb, b: pa };
      };
      const k = sg > 0 ? 'R' : 'L';
      surf('flapIn' + k, ...FLAPS[0]); surf('flapOut' + k, ...FLAPS[1]); surf('ail' + k, ...AIL);
      // flap-track fairings under the trailing edge
      if (T.detail) for (const x of [4.2, 8.0, 10.6]) { const w = wingPlan(x), z = w.le + w.c * 0.62; body.loft([[0, 0.02], [0.3, 0.16], [1.0, 0.2], [1.7, 0.04]].map(([dz, r]) => circle(T.n(8, 4), r).map(([a, b]) => [sg * x + a * 0.8, w.y - 0.1 + b * 1.3, z + dz])), { out: (p) => [p[0] - sg * x, p[1] - w.y + 0.1, 0], uv: () => sw('grey') }); }
    }
    // sharklet: the tip turned up and back
    if (!T.lod2) {
      const w = wingPlan(WING.tip), y0 = w.y, n = T.far ? 2 : 5, { loop } = airfoilLoop(naca(0, 0.4, 0.1), T.n(12, 6), 0, 1, false);
      const rings = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = u * 1.2, r = 0.45, x = WING.tip + Math.sin(a) * r * 0.9, y = y0 + (1 - Math.cos(a)) * r + u * u * 1.7;
        const c = lerp(w.c, 0.5, u), le = w.le + u * 1.2;
        rings.push(loop.map(([xc, yv]) => { const off = yv * c * 0.9; return [sg * (x - Math.sin(a) * off), y + Math.cos(a) * off, le + xc * c]; }));
      }
      body.loft(rings, { out: () => [sg, 0, 0], uv: () => sw('secondary'), capEnd: true, capUV: () => sw('secondary') });
    }
  }

  // ---------- engines: underwing nacelles on pylons, fan face + spinner, the core exhaust and plug ----------
  for (const sg of [1, -1]) {
    const x = sg * ENG.x, n = T.n(24, 8), L = ENG.s1 - ENG.s0;
    const prof = T.far ? [[0, 0.9], [0.2, 1], [0.7, 0.95], [1, 0.66]] : [[0, 0.88], [0.03, 0.97], [0.12, 1], [0.45, 1], [0.72, 0.94], [0.9, 0.78], [1, 0.66]];
    body.loft(prof.map(([u, r]) => circle(n, r * ENG.r).map(([a, b]) => [x + a, ENG.y + b * 0.97, ENG.s0 + u * L])), { out: (p) => [p[0] - x, p[1] - ENG.y, 0], uv: () => sw('white') });
    if (!T.far) {
      trim.addGeo(new THREE.TorusGeometry(ENG.r * 0.87, 0.06, T.n(8, 4), n), M4(x, ENG.y, ENG.s0 + 0.02), RM.chrome, COL.lip);
      trim.addGeo(new THREE.CircleGeometry(ENG.r * 0.85, n), M4(x, ENG.y, ENG.s0 + 0.3, 1, 1, 1, Math.PI, 0, 0), RM.darkMetal, COL.fan);
      trim.addGeo(new THREE.ConeGeometry(0.3, 0.55, T.n(14, 6)), M4(x, ENG.y, ENG.s0 + 0.04, 1, 1, 1, -Math.PI / 2, 0, 0), RM.chrome, COL.lip);
      // core nozzle + plug out of the back
      const cs = ENG.s1, core = [[0, 0.6], [0.6, 0.5], [0.9, 0.42]];
      trim.loft(core.map(([dz, r]) => circle(T.n(16, 6), r).map(([a, b]) => [x + a, ENG.y + b, cs + dz])), { out: (p) => [p[0] - x, p[1] - ENG.y, 0], color: COL.steel, uv: () => RM.steel });
      trim.addGeo(new THREE.ConeGeometry(0.36, 1.1, T.n(12, 6)), M4(x, ENG.y, cs + 1.2, 1, 1, 1, Math.PI / 2, 0, 0), RM.darkMetal, COL.dark);
    }
    // pylon up to the wing
    const w = wingPlan(ENG.x), yTop = w.y + 0.1, s0 = ENG.s0 + 1.4, s1 = w.le + w.c * 0.7, yb = ENG.y + ENG.r * 0.8, hw = 0.2;
    body.loft([[s0, yb, yb + 0.2], [ENG.s0 + 2.6, yb, yTop], [s1, yb + 0.25, yTop]].map(([s, y0, y1]) => [[x - hw, y1, s], [x + hw, y1, s], [x + hw, y0, s], [x - hw, y0, s]]), { uv: () => sw('primary'), capStart: true, capEnd: true, capUV: () => sw('primary') });
  }

  // ---------- tail: swept fin + rudder, low tailplane with elevators ----------
  const sym = naca(0, 0.4, 0.11);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const ys = spanSteps(FIN.y0 - 0.2, FIN.top, T.far ? 3.4 : T.step(0.9));
    const rings = ys.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), 0, T.far ? 1 : FIN.hinge, false); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); });
    body.loft(rings, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    if (!T.far) {
      const rud = new Builder(), ry = spanSteps(FIN.y0 + 0.4, FIN.top - 0.1, T.step(0.9));
      rud.loft(ry.map((y) => { const w = finPlan(y), { loop } = airfoilLoop(sym, T.n(16, 6), FIN.hinge + 0.01, 1, true); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); }), { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
      const hz = (y) => { const w = finPlan(y); return [0, y, w.le + (FIN.hinge + 0.015) * w.c]; };
      pieces.rudder = { B: rud, a: hz(FIN.y0 + 0.4), b: hz(FIN.top - 0.1) };
      // dorsal fillet
      body.loft([0, 1].map((u) => { const s = lerp(26.4, FIN.le0 + 0.8, u), y = FUS(s).yc + FUS(s).ht - 0.05; return [[-0.05, y, s], [0, y + u * 0.7, s + 0.6 * u], [0.05, y, s]]; }), { uv: finUV });
    }
    const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
    const xs = spanSteps(0, STAB.half, T.far ? STAB.half : T.step(1.2));
    for (const sg of [1, -1]) wingPanel(body, stabPlan, xs.map((x) => x * sg), sym, T.n(14, 6), T.far ? { uvT: tUV, uvB: tUV } : { cTo: STAB.hinge, uvT: tUV, uvB: tUV });
    if (!T.far) {
      const hpS = (x) => { const w = stabPlan(Math.abs(x)); return [x, w.y, w.le + (STAB.hinge + 0.015) * w.c]; };
      for (const sg of [1, -1]) {
        const elev = new Builder(), xa = 0.9, xb = STAB.half - 0.05;
        wingPanel(elev, stabPlan, spanSteps(xa, xb, T.step(1.2)).map((x) => x * sg), sym, T.n(14, 6), { cFrom: STAB.hinge + 0.01, roundNose: true, uvT: tUV, uvB: tUV });
        pieces[sg > 0 ? 'elevR' : 'elevL'] = sg > 0 ? { B: elev, a: hpS(xa), b: hpS(xb) } : { B: elev, a: hpS(-xb), b: hpS(-xa) };
      }
    }
  }

  // ---------- gear: twin-wheel mains from the wing roots, a twin nose gear (telescopes up for the retraction) ----------
  {
    const nW = T.n(18, 8), cols = { tire: COL.tire, hub: COL.hub };
    const whl = (c, r, w) => (T.far ? gear.addGeo(new THREE.CylinderGeometry(r, r, w, T.lod2 ? 6 : 8, 1), M4(c[0], c[1], c[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, COL.tire) : wheel(gear, c, r, w, nW, cols, RM));
    const G = GEAR.main;
    for (const sg of [1, -1]) {
      rod(gear, [sg * G.x, G.top, G.s - 0.1], [sg * G.x, G.r, G.s], 0.13, T.far ? 5 : 10, RM.chrome, COL.gearLeg);
      if (!T.far) { rod(gear, [sg * (G.x - G.off), G.r, G.s], [sg * (G.x + G.off), G.r, G.s], 0.08, 6, RM.steel, COL.steel); rod(gear, [sg * G.x, G.top - 0.1, G.s + 0.9], [sg * G.x, G.r + 0.6, G.s], 0.06, 6, RM.steel, COL.steel); }
      for (const d of [-G.off, G.off]) whl([sg * G.x + d, G.r, G.s], G.r, G.w);
    }
    const Nn = GEAR.nose;
    rod(gear, [0, Nn.top, Nn.s - 0.1], [0, Nn.r, Nn.s], 0.08, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
    if (!T.far) rod(gear, [-Nn.x - 0.1, Nn.r, Nn.s], [Nn.x + 0.1, Nn.r, Nn.s], 0.05, 6, RM.steel, COL.steel);
    for (const sg of [1, -1]) whl([sg * Nn.x, Nn.r, Nn.s], Nn.r, Nn.w);
  }

  // ---------- lights: nav on the wingtips, white tail light, beacons top and bottom, wing-tip strobes ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = wingPlan(WING.tip), p = [sg * (WING.tip + 0.05), w.y + 0.05, w.le + 0.25];
    lights.addGeo(new THREE.SphereGeometry(0.08, T.far ? 4 : 8, T.far ? 2 : 6), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    const q = [sg * (WING.tip + 0.05), w.y + 0.05, w.le + w.c - 0.1];
    lights.addGeo(new THREE.SphereGeometry(0.06, T.far ? 4 : 8, T.far ? 2 : 6), M4(...q), [0, 0], COL.lensW);
    lightPts.push({ p: q, col: [1, 1, 1], kind: 'strobe' });
  }
  { const p = [0, FUS(LENGTH).yc + 0.2, LENGTH - 0.1]; lights.addGeo(new THREE.SphereGeometry(0.06, 6, 4), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  for (const [s, top] of [[16.5, true], [17.5, false]]) {
    const p = secPt(FUS(s), top ? 0 : Math.PI), q = [0, p[1] + (top ? 0.08 : -0.06), s];
    beaconB.addGeo(new THREE.SphereGeometry(0.12, T.far ? 4 : 10, T.far ? 2 : 6), M4(...q, 1, 0.6, 1.5), [0, 0], [1, 1, 1]);
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
  gearPivot.position.y = 2.2;
  const gearMesh = mkMesh('gear', gear, mats.trim);
  gearMesh.position.y = -2.2;
  gearPivot.add(gearMesh);
  if (T.far) (ctx.farGear ||= []).push(gearPivot); else group.add(gearPivot);
  return { group, meshes, hinges, propGroup: propProxy(), propMesh: propProxy(), disc: propProxy(), lightPts, gearPivot };
}

const MAX = { aileron: 20 * D2R, elevUp: 28 * D2R, elevDown: 18 * D2R, rudder: 25 * D2R, flaps: 35 * D2R };
export const A320_DIMS = { length: LENGTH, span: 2 * (WING.tip + 0.5), height: 11.76, gearHeight: CG.y, groundPitch: 0, restHeight: CG.y };

const COCKPIT = {
  sec: FUS, eye: EYE, floorY: 3.6, shell: { s0: 1.7, s1: 4.4, inset: 0.06, holes: PANES, nt: 64 },
  panel: { s: 2.4, y0: 3.8, y1: 4.2, tilt: 0.2 }, glare: { y: 4.27, depth: 0.28 },
  seats: [-0.5, 0.5], seatS: 3.45, yoke: { s: 2.95, y: 4.05 }, pedestal: { s0: 2.55, s1: 3.5, w: 0.4, y: 3.95 },
  overhead: { s0: 2.75, s1: 3.6, y: 5.2, dip: 0.04, w: 0.42 }, levers: 2, aft: 4.4, label: 'PEASANT EXPRESS', dispSize: 0.18, dispX: [-0.82, -0.54, 0, 0.54, 0.82],
  n1: (r) => (r <= 120 ? r : r / 33),
};

export async function createA320(opts = {}) {
  let C = null;
  const def = {
    id: 'a320', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.04, s: EYE.s + 0.15, pitch: -0.08 },
    portrait: { center: [0, 0.04, 0.14], cockpit: [0.03, 0.04, 0.08], fov: 90, pitch: -0.1 },
    dims: A320_DIMS,
    lod: [520, 300], rpm: { idle: 22, max: 78 },
    createLivery: (q) => createA320Livery(q),
    createMaterials: (q, l, ctx) => { C = ctx; return createA320Materials(q, l, ctx); },
    buildExterior: (q, mats, ctx) => buildA320Exterior(q, mats, ctx),
    buildCockpit: (q, mats, ctx) => buildGlassCockpit(q, mats, ctx, COCKPIT),
    stick: COCKPIT_STICK(COCKPIT),
    createPilot: (q, cfg, ctx) => glassPilot(q, cfg, ctx, COCKPIT),
    animate: (ext, cur, dt, ctx) => animateBig(ext, cur, dt, ctx, MAX, { flapAft: 0.5 }),
  };
  return finishBig(await assembleRig(def, opts), C, opts);
}
