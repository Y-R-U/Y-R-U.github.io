import * as THREE from 'three';
import { Builder, naca, airfoilLoop, sweepRings, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { sectionTable, secPt, secR, skinPatch, wingPanel, spanSteps, spinPatch, spinMesh, propProxy, wheel, animateBig, finishBig, COCKPIT_STICK } from './jetkit.js';
import { buildGlassCockpit, glassPilot } from './glass_cockpit.js';

// Royal Hercules (C-130H-ish): high wing, four turboprops, sponson main gear, upswept tail with a working rear ramp.
// Build frame: y = height above ground (wheels on y = 0), z = station aft of the radome tip, x = right.
// Real: length 29.8, span 40.4, height 11.66, wing area 162 m², props 4.11 m Ø.
export const CG = { s: 13.2, y: 2.6 };
export const LENGTH = 29.8;
// [s, yc, w, ht, hb, nt, nb, top fairing hy, ha, hh, sponson fy, fa, fb]
const KEYS = [
  [0, 2.5, 0.04, 0.04, 0.04, 2, 2, 2.5, 0, 0, 1.5, 0, 0],
  [0.3, 2.5, 0.55, 0.45, 0.4, 2, 2, 2.5, 0, 0, 1.5, 0, 0],
  [0.7, 2.5, 0.95, 0.82, 0.75, 2, 2, 2.5, 0, 0, 1.5, 0, 0],
  [1.2, 2.5, 1.3, 1.05, 1.05, 2.1, 2.1, 2.5, 0, 0, 1.5, 0, 0],
  [1.6, 2.5, 1.55, 1.2, 1.25, 2.1, 2.2, 2.5, 0, 0, 1.5, 0, 0],
  [2.0, 2.55, 1.75, 1.5, 1.42, 2.2, 2.3, 2.5, 0, 0, 1.5, 0, 0],
  [2.5, 2.58, 1.95, 1.74, 1.6, 2.3, 2.4, 2.5, 0, 0, 1.5, 0, 0],
  [3.2, 2.6, 2.08, 1.8, 1.72, 2.4, 2.6, 2.5, 0, 0, 1.5, 0, 0],
  [4.2, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 2.5, 0, 0, 1.5, 0, 0],
  [9.6, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.9, 0.6, 0.4, 1.4, 1.5, 0.6],
  [10.6, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.95, 1.55, 0.72, 1.4, 2.1, 0.75],
  [11.6, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.95, 1.6, 0.72, 1.38, 2.55, 0.86],
  [15.6, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.95, 1.6, 0.72, 1.38, 2.55, 0.86],
  [16.8, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.9, 1.0, 0.5, 1.38, 2.5, 0.84],
  [18.0, 2.6, 2.15, 1.8, 1.8, 2.4, 2.8, 3.9, 0.5, 0.3, 1.45, 2.0, 0.7],
  [19.0, 2.66, 2.14, 1.74, 1.72, 2.4, 2.7, 3.9, 0, 0, 1.6, 0, 0],
  [20.5, 2.95, 2.06, 1.48, 1.45, 2.4, 2.5, 3.9, 0, 0, 1.6, 0, 0],
  [22.5, 3.35, 1.85, 1.1, 1.05, 2.3, 2.3, 3.9, 0, 0, 1.6, 0, 0],
  [24.5, 3.75, 1.55, 0.72, 0.7, 2.2, 2.2, 3.9, 0, 0, 1.6, 0, 0],
  [26.5, 4.08, 1.15, 0.42, 0.45, 2.1, 2.1, 3.9, 0, 0, 1.6, 0, 0],
  [28.3, 4.33, 0.62, 0.22, 0.25, 2, 2, 3.9, 0, 0, 1.6, 0, 0],
  [29.4, 4.45, 0.25, 0.1, 0.12, 2, 2, 3.9, 0, 0, 1.6, 0, 0],
  [LENGTH, 4.48, 0.05, 0.04, 0.04, 2, 2, 3.9, 0, 0, 1.6, 0, 0],
];
export const FUS = sectionTable(KEYS);

export const WING = { le0: 10.6, sweep: 0.035, rootC: 4.88, midC: 4.3, tipC: 2.6, mid: 10.2, tip: 20.2, y0: 4.78, dih: 0.044 };
export function wingPlan(x) {
  const ax = Math.max(0, x);
  const c = ax <= WING.mid ? lerp(WING.rootC, WING.midC, ax / WING.mid) : lerp(WING.midC, WING.tipC, (ax - WING.mid) / (WING.tip - WING.mid));
  const le = WING.le0 + ax * WING.sweep + (WING.rootC - c) * 0.22;
  const u = clamp(ax / WING.tip, 0, 1);
  return { le, c, y: WING.y0 + Math.max(0, ax - WING.mid) * WING.dih, thk: lerp(1.4, 1.0, u), twist: 0.03 * u };
}
const FOIL = naca(0.024, 0.4, 0.12);
const FLAPS = [[2.3, 7.85, 0.72], [8.2, 13.8, 0.72]];
const AIL = [14.1, 19.6, 0.74];
export const ENGINES = [4.95, 10.2];
export const PROP = { s: 7.0, y: 4.2, R: 2.055, blades: 4 };
// nacelle rings aft of the spinner: [dz, halfWidth, top, bottom]
const NAC = [[0, 0.42, 0.42, 0.42], [0.3, 0.55, 0.6, 0.62], [1.0, 0.6, 0.72, 0.7], [2.5, 0.6, 0.85, 0.64], [4.5, 0.55, 0.85, 0.48], [6.5, 0.45, 0.75, 0.28], [7.7, 0.18, 0.55, 0.08]];
export const STAB = { root: 0.3, le0: 24.9, sweep: 0.17, rootC: 4.0, tipC: 2.2, half: 8.03, y: 4.62, hinge: 0.68 };
export const FIN = { y0: 4.3, top: 11.66, le0: 21.6, sweep: 0.55, rootC: 6.6, tipC: 2.6, hinge: 0.66, fillet: 18.6, filletTop: 5.6 };
export const GEAR = { main: { x: 2.175, s: [13.6, 15.0], r: 0.7, w: 0.42, top: 1.9 }, nose: { s: 4.6, x: 0.28, r: 0.48, w: 0.32, top: 1.15 } };
export const RAMP = { s0: 18.7, s1: 24.6, t: 1.08 };
export const EYE = { x: -0.6, y: 3.95, s: 2.9, pitch: -0.1 };
// cockpit glass, right side (mirrored); the chin windows are painted/exterior-only (below the flight-deck floor)
export const PANES = [[1.5, 2.3, 0.015, 0.42], [1.62, 2.3, 0.47, 0.92], [2.42, 3.06, 0.47, 1.1], [3.16, 3.74, 0.52, 1.08], [2.42, 3.06, 0.12, 0.39]];
const CHIN = [[0.95, 1.55, 1.2, 1.62]];

// ---------- livery (royal-military: grey-green, royal roundels, a purple-and-gold fin flash) ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.22, s0: -0.3, s1: 30.2, h0: 0.5, h1: 5.0, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.22, y1: 0.44, s0: -0.3, s1: 30.2, h0: 0.5, h1: 5.0, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.44, y1: 0.6, s0: 18.3, s1: 28.6, h0: 4.2, h1: 11.9, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.44, y1: 0.6, s0: 18.3, s1: 28.6, h0: 4.2, h1: 11.9, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.6, y1: 0.73, a0: -20.7, a1: 20.7, s0: 10.3, s1: 15.9, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.73, y1: 0.86, a0: -20.7, a1: 20.7, s0: 10.3, s1: 15.9, flip: true },
  tail: { x0: 0, x1: 0.6, y0: 0.86, y1: 0.975, a0: -8.4, a1: 8.4, s0: 24.6, s1: 29.4, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'base', 'belly', 'purple', 'gold', 'dark', 'black', 'radome', 'baseDark'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const MR = { paint: 'rgb(0,175,0)', gold: 'rgb(0,58,255)', glass: 'rgb(0,22,0)', dark: 'rgb(0,150,0)' };
const BASE = '#66705f', BELLY = '#8a908d';
const bellyY = (s) => (s < 3 ? 1.6 : s < 18.6 ? 1.35 : 1.35 + (s - 18.6) * 0.32);

function paneOutline(p) {
  const [s0, s1, t0, t1] = p, pts = [], K = 6;
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(lerp(s0, s1, k / K)), t0));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(s1), lerp(t0, t1, k / K)));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(lerp(s1, s0, k / K)), t1));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(s0), lerp(t1, t0, k / K)));
  return pts.map((q) => [q[2], q[1]]);
}

function roundel(c, x, y, r, L, m) {
  const P = ROYAL;
  if (m) { c.fillStyle = MR.gold; c.beginPath(); c.arc(x, y, r * 0.78, 0, 7); c.arc(x, y, r * 0.55, 0, 7, true); c.fill(); return; }
  c.fillStyle = P.purple; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = P.gold; c.beginPath(); c.arc(x, y, r * 0.78, 0, 7); c.fill();
  c.fillStyle = L.secondary; c.beginPath(); c.arc(x, y, r * 0.55, 0, 7); c.fill();
  // little crown in the middle
  c.fillStyle = P.gold;
  const k = r * 0.32;
  c.beginPath(); c.moveTo(x - k, y - k * 0.55); c.lineTo(x + k, y - k * 0.55); c.lineTo(x + k * 1.1, y + k * 0.45); c.lineTo(x + k * 0.5, y + k * 0.05); c.lineTo(x, y + k * 0.7); c.lineTo(x - k * 0.5, y + k * 0.05); c.lineTo(x - k * 1.1, y + k * 0.45); c.closePath(); c.fill();
}

function createHercLivery(quality) {
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

  function side(c, T, L, m) {
    const P = ROYAL, f = (col, mrc = MR.paint) => (m ? mrc : col);
    c.fillStyle = f(BASE); c.fillRect(-1, 0, 33, 6);
    c.fillStyle = f(BELLY); c.beginPath(); c.moveTo(-1, 0); for (let s = -1; s <= 31; s += 0.25) c.lineTo(s, bellyY(s)); c.lineTo(31, 0); c.closePath(); c.fill();
    // black radome
    c.fillStyle = f('#22252a', MR.dark); c.beginPath(); c.moveTo(-1, 0); c.lineTo(0.95, 0); c.quadraticCurveTo(1.1, 2.6, 0.75, 3.45); c.lineTo(-1, 3.6); c.closePath(); c.fill();
    if (!m) {
      // panel lines, sponson and ramp outlines, crew door, paratroop doors
      c.strokeStyle = 'rgba(20,24,20,0.35)'; c.lineWidth = 0.02;
      for (const s of [4.2, 7.5, 10.6, 16.8, 18.7]) { c.beginPath(); c.moveTo(s, 0.6); c.lineTo(s, 4.6); c.stroke(); }
      c.beginPath(); c.moveTo(RAMP.s0, 0.9); for (let s = RAMP.s0; s <= RAMP.s1; s += 0.2) { const sec = FUS(s); c.lineTo(s, secPt(sec, Math.PI - RAMP.t)[1]); } c.stroke();
      c.strokeRect(5.0, 1.0, 0.9, 1.75);
      c.strokeRect(17.2, 1.15, 0.9, 1.85);
      c.fillStyle = '#1a1d20'; c.beginPath(); c.roundRect(5.2, 2.15, 0.45, 0.35, 0.08); c.fill(); c.beginPath(); c.roundRect(17.45, 2.3, 0.4, 0.35, 0.08); c.fill();
      // a few small cargo-hold windows
      for (const s of [6.8, 8.6, 11.1, 15.3]) { c.beginPath(); c.arc(s, 3.2, 0.13, 0, 7); c.fill(); }
      // "ROYAL AIR FARCE" along the cabin top, the player's name under the cockpit
      A.text(c, T, 'ROYAL AIR FARCE', 9.6, 3.9, 9.5, 0.42, { font: '800', fill: '#1b1f1a', family: "Georgia, 'Times New Roman', serif" });
      const nameCol = pick(BASE, [P.goldLight, '#ffffff'], 2.2);
      A.text(c, T, L.display.toUpperCase(), 3.0, 1.9, 2.4, 0.26, { font: 'italic 800', fill: nameCol });
      A.text(c, T, L.registration, 21.6, 2.85, 2.6, 0.42, { font: '700', fill: '#14171a' });
      // nose art: a crest under the cockpit
      crest(c, T, 4.5, 3.2, 0.62, { field: P.purple, field2: P.crimson, gold: P.gold });
    }
    // cockpit glass and chin windows
    c.fillStyle = f('#10161d', MR.glass);
    for (const p of [...PANES, ...CHIN]) { const o = paneOutline(p); c.beginPath(); o.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); }
    roundel(c, 20.0, 3.25, 0.62, L, m);
  }
  function fin(c, T, L, m) {
    const P = ROYAL, f = (col, mrc = MR.paint) => (m ? mrc : col);
    c.fillStyle = f(BASE); c.fillRect(17, 3, 13, 10);
    // fin flash: purple / gold / player secondary bands, a gold crown above
    const hg = (y) => FIN.le0 + (y - FIN.y0) * FIN.sweep + FIN.rootC * 0.0;
    const bands = [[P.purple, MR.paint], [P.gold, MR.gold], [L.secondary, MR.paint], [P.gold, MR.gold], [P.purple, MR.paint]];
    bands.forEach(([col, mc], i) => { c.fillStyle = f(col, mc); c.fillRect(24.0 + i * 0.42, 6.2, 0.42, 2.6); });
    if (!m) {
      c.fillStyle = P.gold; const cx = 25.05, cy = 9.6, k = 0.75;
      c.beginPath(); c.moveTo(cx - k, cy - k * 0.5); c.lineTo(cx + k, cy - k * 0.5); c.lineTo(cx + k * 1.15, cy + k * 0.55); c.lineTo(cx + k * 0.5, cy + k * 0.1); c.lineTo(cx, cy + k * 0.8); c.lineTo(cx - k * 0.5, cy + k * 0.1); c.lineTo(cx - k * 1.15, cy + k * 0.55); c.closePath(); c.fill();
      c.fillStyle = P.crimson; c.fillRect(cx - k * 0.95, cy - k * 0.5, k * 1.9, k * 0.22);
      A.text(c, T, L.registration, 25.3, 5.2, 3.6, 0.45, { font: '700', fill: '#14171a' });
      c.strokeStyle = 'rgba(20,24,20,0.35)'; c.lineWidth = 0.025;
      c.beginPath(); for (let y = 4.9; y <= 11.6; y += 0.4) { const w = finPlan(y); c.lineTo(w.leFin + FIN.hinge * w.cFin, y); } c.stroke();
    } else {
      c.fillStyle = MR.gold; const cx = 25.05, cy = 9.6, k = 0.75;
      c.beginPath(); c.moveTo(cx - k, cy - k * 0.5); c.lineTo(cx + k, cy - k * 0.5); c.lineTo(cx + k * 1.15, cy + k * 0.55); c.lineTo(cx + k * 0.5, cy + k * 0.1); c.lineTo(cx, cy + k * 0.8); c.lineTo(cx - k * 0.5, cy + k * 0.1); c.lineTo(cx - k * 1.15, cy + k * 0.55); c.closePath(); c.fill();
    }
  }
  function wing(c, T, L, top, m) {
    c.fillStyle = m ? MR.paint : top ? BASE : BELLY; c.fillRect(-21, 10, 42, 7);
    if (m) { for (const sg of [-1, 1]) { c.fillStyle = MR.gold; c.beginPath(); c.arc(sg * 16.5, 12.6, 0.75, 0, 7); c.fill(); } return; }
    c.strokeStyle = 'rgba(20,24,20,0.3)'; c.lineWidth = 0.03;
    for (const sg of [-1, 1]) {
      for (const [a, b, h] of [...FLAPS, AIL]) { const pa = wingPlan(a), pb = wingPlan(b); c.beginPath(); c.moveTo(sg * a, pa.le + pa.c * h); c.lineTo(sg * b, pb.le + pb.c * h); c.stroke(); }
      if (top) roundel(c, sg * 16.5, 12.6, 1.0, L, false);
      c.strokeStyle = 'rgba(20,24,20,0.45)'; c.strokeRect(sg > 0 ? 1.2 : -2.2, 11.2, 1.0, 2.8);
    }
    if (!top) A.text(c, T, L.registration, -9.5, 13.0, 5.5, 1.5, { font: '700', fill: '#14171a', plan: true });
  }
  function tail(c, m) {
    c.fillStyle = m ? MR.paint : BASE; c.fillRect(-9, 24, 18, 6);
    if (m) return;
    c.strokeStyle = 'rgba(20,24,20,0.3)'; c.lineWidth = 0.03;
    for (const sg of [-1, 1]) { c.beginPath(); for (let x = 0.3; x <= 8; x += 0.5) { const w = stabPlan(x); c.lineTo(sg * x, w.le + w.c * STAB.hinge); } c.stroke(); }
  }
  function draw(L) {
    for (const [cc, AA, m] of [[ctx, A, false], [mctx, MA, true]]) {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.fillStyle = m ? MR.paint : '#000'; cc.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
      AA.region(cc, REG.fusL, AA.side(REG.fusL), (c, T) => side(c, T, L, m));
      AA.region(cc, REG.fusR, AA.side(REG.fusR), (c, T) => side(c, T, L, m));
      AA.region(cc, REG.finL, AA.side(REG.finL), (c, T) => fin(c, T, L, m));
      AA.region(cc, REG.finR, AA.side(REG.finR), (c, T) => fin(c, T, L, m));
      AA.region(cc, REG.wingT, AA.plan(REG.wingT), (c, T) => wing(c, T, L, true, m));
      AA.region(cc, REG.wingB, AA.plan(REG.wingB), (c, T) => wing(c, T, L, false, m));
      AA.region(cc, REG.tail, AA.plan(REG.tail), (c) => tail(c, m));
      const W = cc.canvas.width, w = W / SW.length;
      const cols = m ? { gold: MR.gold, dark: MR.dark, black: MR.dark, radome: MR.dark }
        : { primary: L.primary, secondary: L.secondary, accent: L.accent, base: BASE, belly: BELLY, purple: ROYAL.purple, gold: ROYAL.gold, dark: '#2b2e31', black: '#0d0e10', radome: '#22252a', baseDark: shade(BASE, 0.8) };
      SW.forEach((k, i) => { cc.fillStyle = cols[k] || MR.paint; cc.fillRect(i * w, W * 0.98, w, W * 0.02); });
    }
    texture.needsUpdate = true; mrTex.needsUpdate = true;
  }
  return { texture, mrTex, draw, owns: (t) => t === texture || t === mrTex, dispose() { texture.dispose(); mrTex.dispose(); } };
}

function createHercMaterials(quality, livery, ctx) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.mrTex, metalnessMap: livery.mrTex, roughness: 1, metalness: 1, envMapIntensity: 0.9 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.15, clearcoatRoughness: 0.5 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('herc-trim', { envMapIntensity: 1.1 });
  const prop = pbrMaterial('herc-prop', { envMapIntensity: 1.1 });
  const propSpin = spinPatch(prop, 'herc', () => ctx.propAngle || 0);
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0 });
  // the rig's blur curve is tuned for 2700-rpm pistons; a T56 prop turns 1020, so the herc owns its blur (ctx.discBlur)
  Object.defineProperty(disc, 'opacity', { get: () => 2.2 * (ctx.discBlur ?? 0), set() {}, configurable: true });
  const discSpin = spinPatch(disc, 'herc-disc', () => ctx.discAngle || 0);
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, disc, lights, beacon];
  return { paint, trim, prop, propSpin, disc, discSpin, lights, beacon, all: () => list };
}

const COL = {
  tire: srgb('#16171a'), hub: srgb('#8f959b'), steel: srgb('#8e949a'), dark: srgb('#2b2d31'), black: srgb('#0c0d0f'),
  gold: srgb(ROYAL.gold), purple: srgb(ROYAL.purple), glass: srgb('#121a22'), frame: srgb('#2a2e35'), blade: srgb('#1d1f22'),
  exhaust: srgb('#4a4540'), hold: srgb('#4b4f49'), holdDark: srgb('#2f322e'), floor: srgb('#3a3d3a'), crate: srgb('#6b4a2a'),
  base: srgb(BASE), gearLeg: srgb('#b9bdc1'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

export function stabPlan(x) {
  const ax = Math.abs(x), u = clamp((ax - STAB.root) / (STAB.half - STAB.root), 0, 1);
  return { le: STAB.le0 + ax * STAB.sweep, c: lerp(STAB.rootC, STAB.tipC, u), y: STAB.y, thk: lerp(1.05, 0.85, u) };
}
// fin with a dorsal fillet: the fillet only moves the leading edge forward low down; the rudder hinge follows the fin proper
export function finPlan(y) {
  const u = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 1);
  const leFin = FIN.le0 + (y - FIN.y0) * FIN.sweep, cFin = lerp(FIN.rootC, FIN.tipC, u), te = leFin + cFin;
  const leFil = FIN.fillet + (y - FIN.y0) * ((FIN.le0 + (FIN.filletTop - FIN.y0) * FIN.sweep - FIN.fillet) / (FIN.filletTop - FIN.y0));
  const le = Math.min(leFin, leFil);
  return { le, c: te - le, leFin, cFin, thk: lerp(1.1, 0.75, u) };
}

export function buildHercExterior(quality, mats, ctx) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), beaconB = new Builder(), gear = new Builder(), rampB = new Builder();
  const sideUV = (p, right) => uvSide(right ? REG.fusR : REG.fusL, p[2], p[1]);

  // ---------- fuselage: three lofts so the rear ramp can be its own hinged piece ----------
  const N = T.n(40, 12);
  const st = [0, 0.05];
  {
    const ds = (s) => (s < 1 ? 0.15 : s < 4.2 ? 0.38 : s < 9.5 ? 2.0 : s < 18 ? 1.0 : 0.9) / Math.max(0.3, T.k);
    let s = 0.05;
    while (s < LENGTH - 0.03) { s = Math.min(LENGTH, s + ds(s)); st.push(+s.toFixed(3)); }
    for (const k of [RAMP.s0, RAMP.s1, LENGTH]) if (!st.includes(k)) st.push(k);
    st.sort((a, b) => a - b);
  }
  const ring = (s, t0, t1, n) => { const sec = FUS(s), r = []; for (let j = 0; j <= n; j++) r.push(secPt(sec, lerp(t0, t1, j / n))); return r; };
  const outF = (p, i, ss) => [p[0], p[1] - FUS(ss[i]).yc, 0];
  const loftArc = (ss, t0, t1, n, B = body, uv = null) => B.loft(ss.map((s) => ring(s, t0, t1, n)), { closed: false, out: (p, i) => outF(p, i, ss), uv: uv || ((p) => sideUV(p, p[0] >= 0)) });
  const front = st.filter((s) => s <= RAMP.s0), mid = st.filter((s) => s >= RAMP.s0 && s <= RAMP.s1), aft = st.filter((s) => s >= RAMP.s1);
  for (const ss of [front, aft]) { loftArc(ss, 0, Math.PI, N / 2); loftArc(ss, Math.PI, 2 * Math.PI, N / 2); }
  const nR = Math.max(2, Math.round((N / 2) * (RAMP.t / Math.PI)));
  loftArc(mid, 0, Math.PI - RAMP.t, N / 2 - nR);
  loftArc(mid, Math.PI + RAMP.t, 2 * Math.PI, N / 2 - nR);
  for (const [s, dir] of [[0, -1], [LENGTH, 1]]) fan(body, ring(s, 0, 2 * Math.PI, N).slice(0, -1), [0, 0, dir], sw(dir < 0 ? 'radome' : 'base'));
  // the ramp: lower aft skin + its floor, hinged at the front edge
  loftArc(mid, Math.PI - RAMP.t, Math.PI + RAMP.t, 2 * nR, rampB);
  const hingeY = secPt(FUS(RAMP.s0), Math.PI)[1];
  if (T.detail) {
    // cargo floor on the ramp's inside, the hold walls behind it (visible when the ramp is down)
    const fy = (s) => secPt(FUS(s), Math.PI, 0.12)[1];
    const rows = mid.map((s) => { const w = secPt(FUS(s), Math.PI - RAMP.t * 0.85, 0.12); return [[-Math.abs(w[0]), fy(s) + 0.04, s], [Math.abs(w[0]), fy(s) + 0.04, s]]; });
    rampB.loft(rows, { closed: false, out: () => [0, 1, 0], color: COL.floor, uv: () => RM.rubber });
    const hs = [16.5, 18.7, 20.5, 22.5, 24.6, 26.5];
    trim.loft(hs.map((s) => ring(s, 0, 2 * Math.PI, N).map((p) => { const sec = FUS(s); const k = (secR(sec, Math.atan2(p[0], p[1] - sec.yc)) - 0.1) / secR(sec, Math.atan2(p[0], p[1] - sec.yc)); return [p[0] * k, sec.yc + (p[1] - sec.yc) * k, s]; })), { out: (p, i) => [-p[0], -(p[1] - FUS(hs[i]).yc), 0], color: COL.hold, uv: () => RM.cloth });
    fan(trim, ring(16.5, 0, 2 * Math.PI, 24).slice(0, -1).map((p) => [p[0] * 0.95, FUS(16.5).yc + (p[1] - FUS(16.5).yc) * 0.95, 16.5]), [0, 0, 1], RM.cloth, COL.holdDark);
    trim.addGeo(new THREE.BoxGeometry(3.1, 0.06, 2.3), M4(0, 1.02, 17.6), RM.rubber, COL.floor);
    // the royal cargo: a crate with a crown on it
    trim.addGeo(new THREE.BoxGeometry(1.6, 1.3, 1.6), M4(0, 1.7, 17.3), RM.wood, COL.crate);
    trim.addGeo(new THREE.CylinderGeometry(0.35, 0.3, 0.3, 10, 1, true), M4(0, 2.5, 17.3), RM.gold, COL.gold);
    trim.addGeo(new THREE.SphereGeometry(0.3, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), M4(0, 2.6, 17.3, 1, 0.7, 1), RM.cloth, srgb('#8c1020'));
  }

  // cockpit glass
  if (!T.lod2) {
    for (const p of [...PANES, ...CHIN]) for (const sg of [1, -1]) {
      const [s0, s1, t0, t1] = p, ta = sg > 0 ? t0 : -t1, tb = sg > 0 ? t1 : -t0;
      if (!T.far) skinPatch(trim, FUS, s0 - 0.04, s1 + 0.04, ta - 0.02, tb + 0.02, 2, T.i(3, 1), 0.01, RM.paint, COL.frame);
      skinPatch(trim, FUS, s0, s1, ta, tb, T.i(3, 1), T.i(4, 2), 0.02, RM.glass, COL.glass);
    }
  }

  // ---------- wing (high, over the top of the fuselage) ----------
  const nC = T.n(24, 8), wStep = T.step(1.8);
  const pieces = {};
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg), caps = [true, true];
    if (T.far) { wingPanel(body, wingPlan, S([0, WING.mid, WING.tip]), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps }); continue; }
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
    // fuel pylon tanks under the outer wing (the classic C-130 external tanks)
    if (T.detail) {
      const x = 14.8, w = wingPlan(x), cy = w.y - 1.05, cz = w.le + w.c * 0.3, prof = [[-3.2, 0.03], [-2.7, 0.35], [-1.6, 0.6], [0.8, 0.62], [2.4, 0.4], [3.4, 0.05]];
      body.loft(prof.map(([dz, r]) => circle(T.n(16, 6), r).map(([a, b]) => [sg * x + a, cy + b, cz + dz])), { out: (p) => [p[0] - sg * x, p[1] - cy, 0], uv: () => sw('base') });
      body.loft([0, 1].map((h) => [[-0.12, -1.4], [0.12, -1.4], [0.12, 1.0], [-0.12, 1.0]].map(([a, b]) => [sg * x + a, lerp(cy + 0.5, w.y - 0.2, h), cz + b])), { uv: () => sw('base') });
    }
  }

  // ---------- nacelles + props ----------
  const propParts = [], discParts = [];
  for (const ex of ENGINES) for (const sg of [1, -1]) {
    const x = sg * ex, y = PROP.y, z0 = PROP.s + 0.25, n = T.n(20, 8);
    const rings = (T.far ? NAC.filter((_, i) => i % 2 === 0 || i === NAC.length - 1) : NAC).map(([dz, hw, top, bot]) => {
      const r = [];
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), up = c >= 0;
        const e = up ? 2.4 : 2.2, h = up ? top : bot;
        r.push([x + hw * Math.sign(s) * Math.abs(s) ** (2 / e), y + h * Math.sign(c) * Math.abs(c) ** (2 / e), z0 + dz]);
      }
      return r;
    });
    body.loft(rings, { out: (p, i) => [p[0] - x, p[1] - y, 0], uv: () => sw('base'), capEnd: true, capUV: () => sw('base') });
    if (T.detail) {
      // oil-cooler scoop under the nose, exhaust stack on the outboard side
      trim.addGeo(new THREE.BoxGeometry(0.42, 0.22, 0.9), M4(x, y - 0.66, z0 + 0.7), RM.darkMetal, COL.black);
      rod(trim, [x + sg * 0.5, y + 0.05, z0 + 3.2], [x + sg * 0.62, y + 0.05, z0 + 4.2], 0.13, 10, [0.6, 0.6], COL.exhaust);
    }
    const hub = [x, y, PROP.s];
    // spinner (a body of revolution, so it can stay static in the trim mesh) with a gold collar
    const spin = T.far ? [[-0.95, 0.03], [-0.45, 0.4], [0.25, 0.43]] : [[-0.95, 0.03], [-0.75, 0.26], [-0.45, 0.4], [-0.1, 0.45], [0.25, 0.43]];
    trim.loft(spin.map(([dz, r]) => circle(T.far ? 8 : T.n(16, 8), r).map(([a, b]) => [hub[0] + a, hub[1] + b, hub[2] + dz])), { out: (p) => [p[0] - hub[0], p[1] - hub[1], -0.3], color: COL.purple, uv: () => [0.35, 0.1] });
    if (!T.far) trim.loft([[-0.02, 0.455], [0.12, 0.455]].map(([dz, r]) => circle(T.n(16, 8), r).map(([a, b]) => [hub[0] + a, hub[1] + b, hub[2] + dz])), { out: (p) => [p[0] - hub[0], p[1] - hub[1], 0], color: COL.gold, uv: () => RM.gold });
    propParts.push({
      hub, build(B) {
        if (T.far) return;
        const pf = naca(0.03, 0.4, 0.1), K = T.i(10, 4), rs = [];
        for (let k = 0; k <= K; k++) rs.push(lerp(0.38, PROP.R, k / K));
        for (let bI = 0; bI < PROP.blades; bI++) {
          const rot = (bI / PROP.blades) * Math.PI * 2 + Math.PI / 4, R = [];
          for (const r of rs) {
            const u = (r - 0.38) / (PROP.R - 0.38);
            let c = 0.36 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.1)) - 0.06 * u;
            if (u > 0.92) c *= Math.sqrt(Math.max(0.15, 1 - ((u - 0.92) / 0.085) ** 2));
            const phi = Math.atan(2.6 / (2 * Math.PI * Math.max(0.3, r))) + 0.12, { loop } = airfoilLoop(pf, T.n(8, 4), 0, 1, false);
            const cp = Math.cos(phi), sp = Math.sin(phi);
            R.push(loop.map(([xc, yv]) => { const a = (xc - 0.35) * c, b = yv * c * lerp(1.4, 0.8, u); const xx = -cp * a - sp * b, zz = sp * a - cp * b; return [hub[0] + xx * Math.cos(rot) - r * Math.sin(rot), hub[1] + xx * Math.sin(rot) + r * Math.cos(rot), hub[2] + zz]; }));
          }
          B.loft(R, { out: () => [0, 0, -1], capEnd: true, color: (p) => (Math.hypot(p[0] - hub[0], p[1] - hub[1]) > PROP.R - 0.22 ? COL.gold : COL.blade), uv: (p) => (Math.hypot(p[0] - hub[0], p[1] - hub[1]) > PROP.R - 0.22 ? RM.gold : [0.55, 0.1]) });
        }
      },
    });
    discParts.push({ hub, build(B) { B.addGeo(new THREE.CircleGeometry(PROP.R, T.n(40, 16)), M4(hub[0], hub[1], hub[2] - 0.05), [0, 0], [1, 1, 1]); } });
  }

  // ---------- tail ----------
  const sym = naca(0, 0.4, 0.11);
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  {
    const xs = spanSteps(STAB.root, STAB.half, T.step(1.2));
    for (const sg of [1, -1]) wingPanel(body, stabPlan, xs.map((x) => x * sg), sym, T.n(16, 6), T.far ? { uvT: tUV, uvB: tUV } : { cTo: STAB.hinge, uvT: tUV, uvB: tUV });
    if (!T.far) {
      const hp = (x) => { const w = stabPlan(Math.abs(x)); return [x, w.y, w.le + (STAB.hinge + 0.015) * w.c]; };
      for (const sg of [1, -1]) {
        const elev = new Builder(), xa = 0.75, xb = STAB.half - 0.05;
        wingPanel(elev, stabPlan, spanSteps(xa, xb, T.step(1.2)).map((x) => x * sg), sym, T.n(16, 6), { cFrom: STAB.hinge + 0.01, roundNose: true, uvT: tUV, uvB: tUV });
        pieces[sg > 0 ? 'elevR' : 'elevL'] = sg > 0 ? { B: elev, a: hp(xa), b: hp(xb) } : { B: elev, a: hp(-xb), b: hp(-xa) };
      }
    }
  }
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const ys = [...spanSteps(FIN.y0, FIN.filletTop, T.far ? 1.3 : 0.4), ...spanSteps(FIN.filletTop, FIN.top, T.step(1.2)).slice(1)];
    const rings = ys.map((y) => {
      const w = finPlan(y), hf = T.far ? 1 : (w.leFin + FIN.hinge * w.cFin - w.le) / w.c;
      const { loop } = airfoilLoop(sym, T.n(18, 6), 0, hf, false);
      return loop.map(([xc, yv]) => [yv * Math.min(w.c, w.cFin * 1.3) * w.thk, y, w.le + xc * w.c]);
    });
    body.loft(rings, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    if (!T.far) {
      const rud = new Builder(), ry = spanSteps(FIN.y0 + 0.5, FIN.top - 0.05, T.step(1.2));
      const rr = ry.map((y) => { const w = finPlan(y), hf = (w.leFin + FIN.hinge * w.cFin - w.le) / w.c; const { loop } = airfoilLoop(sym, T.n(18, 6), hf + 0.01, 1, true); return loop.map(([xc, yv]) => [yv * Math.min(w.c, w.cFin * 1.3) * w.thk, y, w.le + xc * w.c]); });
      rud.loft(rr, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
      const hy = (y) => { const w = finPlan(y); return [0, y, w.leFin + (FIN.hinge + 0.015) * w.cFin]; };
      pieces.rudder = { B: rud, a: hy(FIN.y0 + 0.5), b: hy(FIN.top - 0.05) };
    }
  }

  // ---------- details: HF wire to the fin, antennas, a gold crown on the fin tip ----------
  if (T.detail) {
    const ft = finPlan(10.8);
    rod(trim, [0, FUS(5).yc + FUS(5).ht + 0.25, 5], [0, 10.8, ft.le + 0.4], 0.012, 4, RM.black, COL.black);
    rod(trim, [0, FUS(5).yc + FUS(5).ht, 5], [0, FUS(5).yc + FUS(5).ht + 0.25, 5], 0.03, 6, RM.paint, COL.dark);
    for (const s of [7, 9]) { const p = secPt(FUS(s), 0); trim.addGeo(new THREE.BoxGeometry(0.03, 0.28, 0.2), M4(0, p[1] + 0.12, s, 1, 1, 1, 0.45, 0, 0), RM.paint, COL.dark); }
  }
  if (!T.lod2) {
    const tip = finPlan(FIN.top), cz = tip.le + tip.c * 0.45, cy = FIN.top, n = T.far ? 8 : T.n(20, 10);
    trim.addGeo(new THREE.CylinderGeometry(0.42, 0.38, 0.32, n, 1, true), M4(0, cy + 0.16, cz), RM.gold, COL.gold);
    trim.addGeo(new THREE.SphereGeometry(0.36, n, T.far ? 3 : 6, 0, Math.PI * 2, 0, Math.PI / 2), M4(0, cy + 0.26, cz, 1, 0.7, 1), RM.cloth, srgb('#8c1020'));
    if (!T.far) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; trim.addGeo(new THREE.ConeGeometry(0.09, 0.3, 5), M4(Math.cos(a) * 0.42, cy + 0.45, cz + Math.sin(a) * 0.42), RM.gold, COL.gold); }
  }

  // ---------- gear ----------
  {
    const nW = T.n(20, 8), cols = { tire: COL.tire, hub: COL.hub };
    const whl = (c, r, w) => (T.far ? gear.addGeo(new THREE.CylinderGeometry(r, r, w, T.lod2 ? 6 : 8, 1), M4(c[0], c[1], c[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, COL.tire) : wheel(gear, c, r, w, nW, cols, RM));
    const G = GEAR.main;
    for (const sg of [1, -1]) for (const s of G.s) {
      rod(gear, [sg * (G.x - 0.25), G.top, s], [sg * (G.x - 0.25), G.r, s], 0.11, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
      if (!T.far) rod(gear, [sg * (G.x - 0.32), G.r, s], [sg * (G.x + 0.05), G.r, s], 0.06, 6, RM.steel, COL.steel);
      whl([sg * G.x, G.r, s], G.r, G.w);
    }
    const Nn = GEAR.nose;
    rod(gear, [0, Nn.top, Nn.s - 0.1], [0, Nn.r, Nn.s], 0.09, T.far ? 5 : 8, RM.chrome, COL.gearLeg);
    if (!T.far) rod(gear, [-Nn.x - 0.1, Nn.r, Nn.s], [Nn.x + 0.1, Nn.r, Nn.s], 0.05, 6, RM.steel, COL.steel);
    for (const sg of [1, -1]) whl([sg * Nn.x, Nn.r, Nn.s], Nn.r, Nn.w);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = wingPlan(WING.tip - 0.1), p = [sg * (WING.tip + 0.05), w.y, w.le + 0.3];
    lights.addGeo(new THREE.SphereGeometry(0.1, T.far ? 4 : 8, T.far ? 2 : 6), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    const q = [sg * (WING.tip + 0.05), w.y, w.le + w.c - 0.1];
    lights.addGeo(new THREE.SphereGeometry(0.08, T.far ? 4 : 8, T.far ? 2 : 6), M4(...q), [0, 0], COL.lensW);
    lightPts.push({ p: q, col: [1, 1, 1], kind: 'strobe' });
  }
  { const p = [0, FUS(LENGTH).yc, LENGTH + 0.05]; lights.addGeo(new THREE.SphereGeometry(0.08, 6, 4), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  for (const [s, top] of [[12.8, true], [9, false]]) {
    const p = secPt(FUS(s), top ? 0 : Math.PI), q = [0, p[1] + (top ? 0.22 : -0.08), s];
    beaconB.addGeo(new THREE.SphereGeometry(0.14, T.far ? 4 : 10, T.far ? 2 : 6), M4(...q, 1, 0.6, 1.5), [0, 0], [1, 1, 1]);
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
  // the ramp hinges at its forward bottom edge (rotation.x > 0 lowers it)
  const ramp = hinge(group, 'ramp', rampB, mats.paint, [-1, hingeY, RAMP.s0], [1, hingeY, RAMP.s0]);
  const gearPivot = new THREE.Group();
  gearPivot.name = 'gear-pivot';
  gearPivot.position.y = 1.7;
  const gearMesh = mkMesh('gear', gear, mats.trim);
  gearMesh.position.y = -1.7;
  gearPivot.add(gearMesh);
  if (T.far) (ctx.farGear ||= []).push(gearPivot); else group.add(gearPivot);
  const blades = spinMesh('prop', propParts, mats.prop, mats.propSpin || { update() {} });
  blades.castShadow = false;
  group.add(blades);
  let discMesh = null;
  if (!T.far) { discMesh = spinMesh('propDisc', discParts, mats.disc, mats.discSpin || { update() {} }); discMesh.renderOrder = 3; group.add(discMesh); }
  // the rig drives propGroup.rotation.z / propMesh.visible / disc.visible: stand-ins routed to the merged meshes
  const propGroup = propProxy(), propMesh = propProxy(), disc = propProxy();
  if (!T.far) {
    // blades always drawn (they spin at a readable, non-strobing rate); the disc fades in over them with rpm
    Object.defineProperty(propMesh, 'visible', { get: () => blades.visible, set() { blades.visible = true; } });
    Object.defineProperty(disc, 'visible', { get: () => discMesh.visible, set() { discMesh.visible = (ctx.discBlur ?? 0) > 0.01; } });
  }
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, gearPivot, ramp, rampMax: 0.52, blades, discMesh };
}

const D2R = Math.PI / 180;
const MAX = { aileron: 20 * D2R, elevUp: 30 * D2R, elevDown: 20 * D2R, rudder: 30 * D2R, flaps: 36 * D2R };
export const HERC_DIMS = { length: LENGTH, span: 2 * WING.tip, height: 11.66, gearHeight: CG.y, groundPitch: 0, restHeight: CG.y };

const COCKPIT = {
  sec: FUS, eye: EYE, floorY: 3.0, shell: { s0: 1.32, s1: 4.4, inset: 0.07, holes: PANES, nt: 64 },
  panel: { s: 1.98, y0: 3.08, y1: 3.6, tilt: 0.18 }, glare: { y: 3.67, depth: 0.3 },
  seats: [-0.6, 0.6], seatS: 3.12, yoke: { s: 2.42, y: 3.42 }, pedestal: { s0: 2.05, s1: 3.3, w: 0.45, y: 3.3 },
  overhead: { s0: 2.95, s1: 3.9, y: 4.3, dip: 0.04, w: 0.45 }, levers: 4, aft: 4.4, label: 'ROYAL HERCULES', dispSize: 0.2, dispX: [-0.92, -0.62, 0, 0.62, 0.92],
  n1: (r) => clamp((r / 1020) * 100, 0, 104),
};

export async function createHerc(opts = {}) {
  let C = null;
  const def = {
    id: 'herc', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.15, pitch: -0.08 },
    portrait: { center: [0, 0.05, 0.14], cockpit: [0.03, 0.05, 0.06], fov: 90, pitch: -0.1 },
    dims: HERC_DIMS,
    lod: [520, 300], rpm: { idle: 600, max: 420 },
    createLivery: (q) => createHercLivery(q),
    createMaterials: (q, l, ctx) => { C = ctx; return createHercMaterials(q, l, ctx); },
    buildExterior: (q, mats, ctx) => buildHercExterior(q, mats, ctx),
    buildCockpit: (q, mats, ctx) => buildGlassCockpit(q, mats, ctx, COCKPIT),
    stick: COCKPIT_STICK(COCKPIT),
    createPilot: (q, cfg, ctx) => glassPilot(q, cfg, ctx, COCKPIT),
    animate: (ext, cur, dt, ctx) => animateBig(ext, cur, dt, ctx, MAX, {
      flapAft: 0.5,
      // blades read as a slow spin (no 4-blade strobing) and a blur disc fades in above ~500 rpm
      extra: (e, cur, dt) => {
        const r = ctx.rpm ?? 600;
        ctx.discBlur = 0.9 * THREE.MathUtils.smoothstep(r, 450, 900);
        ctx.propAngle = ((ctx.propAngle || 0) - (0.6 + 2.6 * clamp((r - 200) / 650, 0, 1)) * Math.PI * 2 * dt) % (Math.PI * 200);
        ctx.discAngle = e.disc.rotation.z;
      },
    }),
  };
  return finishBig(await assembleRig(def, opts), C, opts);
}
