import * as THREE from 'three';
import { Builder, naca, airfoilLoop, sweepRings, circle, latheRings, streamline, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan, ROYAL } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { sectionTable, secPt, secR, loftFuselage, skinPatch, wingPanel, spanSteps, spinPatch, spinMesh, propProxy, wheel, animateBig, finishBig, COCKPIT_STICK } from './jetkit.js';
import { buildGlassCockpit, glassPilot } from './glass_cockpit.js';

// Royal Jumbo (747-400-ish). Build frame: y = height above ground (wheels on y = 0), z = station aft of the nose tip,
// x = right. Real: length 70.6, span 64.4 (winglets), height 19.4, wing area 525 m², fuselage width 6.5.
export const CG = { s: 32.6, y: 4.8 };
export const LENGTH = 70.6;
// [s, yc, w, ht, hb, nt, nb, hump hy, ha, hh, fairing fy, fa, fb]
const KEYS = [
  [0, 4.6, 0.04, 0.04, 0.04, 2, 2, 4.6, 0, 0, 5, 0, 0],
  [0.25, 4.6, 0.62, 0.66, 0.6, 2, 2, 4.6, 0, 0, 5, 0, 0],
  [0.7, 4.62, 1.05, 1.12, 1.02, 2, 2, 4.9, 0.5, 0.55, 5, 0, 0],
  [1.4, 4.7, 1.55, 1.65, 1.5, 2, 2, 5.6, 0.95, 1.05, 5, 0, 0],
  [2.4, 4.85, 2.05, 2.2, 2.0, 2, 2, 6.45, 1.4, 1.5, 5, 0, 0],
  [3.6, 5.05, 2.5, 2.65, 2.45, 2, 2, 7.25, 1.8, 1.75, 5, 0, 0],
  [5.0, 5.25, 2.85, 2.95, 2.8, 2, 2, 7.8, 2.02, 2.02, 5, 0, 0],
  [6.8, 5.45, 3.1, 3.15, 3.1, 2, 2, 8.05, 2.18, 2.15, 5, 0, 0],
  [9.0, 5.58, 3.22, 3.27, 3.3, 2, 2, 8.15, 2.26, 2.2, 5, 0, 0],
  [12, 5.6, 3.25, 3.3, 3.4, 2, 2, 8.15, 2.28, 2.2, 5, 0, 0],
  [19, 5.6, 3.25, 3.3, 3.4, 2, 2, 8.15, 2.28, 2.2, 5, 1, 1],
  [21.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 8.15, 2.28, 2.2, 4.4, 2.8, 1.6],
  [23.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 8.15, 2.28, 2.2, 3.75, 3.45, 1.75],
  [26, 5.6, 3.25, 3.3, 3.4, 2, 2, 8.0, 2.3, 2.05, 3.65, 3.62, 1.72],
  [28.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 7.6, 2.35, 1.75, 3.65, 3.62, 1.72],
  [30.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 7.0, 2.4, 1.6, 3.65, 3.62, 1.72],
  [32.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 6.0, 1.2, 0.6, 3.65, 3.62, 1.72],
  [38.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 6.0, 1.0, 0.5, 3.65, 3.62, 1.72],
  [42, 5.6, 3.25, 3.3, 3.4, 2, 2, 6.0, 1.0, 0.5, 3.9, 3.25, 1.65],
  [45, 5.6, 3.25, 3.3, 3.4, 2, 2, 6.0, 1.0, 0.5, 4.6, 2.4, 1.4],
  [46.5, 5.6, 3.25, 3.3, 3.4, 2, 2, 6.0, 1.0, 0.5, 5, 1, 1],
  [50, 5.75, 3.15, 3.15, 3.2, 2, 2, 6.0, 1.0, 0.5, 5, 1, 1],
  [54, 6.1, 2.92, 2.8, 2.8, 2, 2, 6.0, 1.0, 0.5, 5, 1, 1],
  [58, 6.55, 2.55, 2.35, 2.3, 2, 2, 6.5, 1.0, 0.5, 6, 1, 1],
  [62, 6.95, 2.05, 1.85, 1.75, 2, 2, 7, 0.5, 0.5, 7, 0.5, 0.5],
  [66, 7.35, 1.4, 1.3, 1.05, 2, 2, 7.3, 0, 0, 7.3, 0, 0],
  [69.2, 7.6, 0.7, 0.62, 0.5, 2, 2, 7.6, 0, 0, 7.6, 0, 0],
  [70.6, 7.7, 0.38, 0.36, 0.33, 2, 2, 7.7, 0, 0, 7.7, 0, 0],
];
export const FUS = sectionTable(KEYS);

// wing planform (x >= 0): LE swept ~40°, trailing-edge kink at x = 12, 7° dihedral
export const WING = { root: 3.0, le0: 24.5, sweep: 0.839, te0: 40.0, kink: 12, teK: 41.5, tip: 31.2, teTip: 52.0, y0: 3.3, dih: 0.1228 };
export function wingPlan(x) {
  const ax = Math.max(0, x), xr = Math.max(0, ax - WING.root);
  const le = ax < WING.root ? WING.le0 - (WING.root - ax) * 0.4 : WING.le0 + xr * WING.sweep;
  const te = ax <= WING.kink ? lerp(WING.te0, WING.teK, clamp((ax - WING.root) / (WING.kink - WING.root), 0, 1)) : lerp(WING.teK, WING.teTip, (ax - WING.kink) / (WING.tip - WING.kink));
  const u = clamp(xr / (WING.tip - WING.root), 0, 1);
  return { le, c: te - le, y: WING.y0 + xr * WING.dih, thk: lerp(1.12, 0.7, u), twist: 0.035 * u };
}
const FOIL = naca(0.022, 0.42, 0.12);
const FLAPS = [[3.3, 11.8, 0.73], [12.6, 21.6, 0.75]];
const AIL = [22.4, 29.8, 0.77];
export const ENGINES = [{ x: 11.9, y: 2.85, lip: 27.4 }, { x: 21.0, y: 3.95, lip: 35.6 }];
const NAC = { lipR: 1.33, maxR: 1.5, fanZ: 0.78, fanR: 1.2 };
export const STAB = { root: 0.8, le0: 58.6, sweep: 0.754, rootC: 8.6, tipC: 2.6, half: 11.1, y0: 6.6, dih: 0.1228, hinge: 0.7 };
export const FIN = { y0: 8.3, top: 18.9, le0: 54.0, sweep: 1.0, rootC: 12.4, tipC: 4.2, hinge: 0.7 };
export const GEAR = {
  r: 0.62, w: 0.5, nose: { s: 8.8, x: 0.38, r: 0.6, w: 0.42, top: 3.4 },
  bogies: [{ x: 5.4, s: 33.6, top: 3.05 }, { x: 1.9, s: 36.4, top: 2.25 }], axle: 0.73, track: 0.56,
};
export const EYE = { x: -0.55, y: 9.05, s: 5.5, pitch: -0.12 };
export const DOORS = [9.3, 17.3, 41.2, 52.6];
// cockpit glass (right side; mirrored): [s0, s1, t0, t1] on the fuselage polar grid
export const PANES = [[3.2, 4.6, 0.014, 0.29], [4.72, 5.75, 0.322, 0.53], [5.87, 6.42, 0.345, 0.5]];

// ---------- livery atlas ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.21, s0: -0.3, s1: 71, h0: 1.7, h1: 10.6, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.21, y1: 0.42, s0: -0.3, s1: 71, h0: 1.7, h1: 10.6, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.42, y1: 0.56, s0: 53.5, s1: 70, h0: 7.8, h1: 19.6, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.42, y1: 0.56, s0: 53.5, s1: 70, h0: 7.8, h1: 19.6, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.56, y1: 0.7, a0: -32.6, a1: 32.6, s0: 23.2, s1: 53, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.7, y1: 0.84, a0: -32.6, a1: 32.6, s0: 23.2, s1: 53, flip: true },
  tail: { x0: 0, x1: 0.62, y0: 0.84, y1: 0.975, a0: -11.6, a1: 11.6, s0: 58, s1: 70, flip: false },
};
const SW = ['primary', 'secondary', 'accent', 'purple', 'purpleDark', 'gold', 'grey', 'dark', 'black', 'white', 'belly'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];
const MR = { paint: 'rgb(0,92,0)', gold: 'rgb(0,58,255)', glass: 'rgb(0,22,0)', grey: 'rgb(0,128,40)', dark: 'rgb(0,150,0)' };
const cheatY = (s) => (s < 46 ? 5.43 : 5.43 + 2.45 * clamp((s - 46) / 19, 0, 1) ** 1.6);

function paneOutline(p, side = 1) {
  const [s0, s1, t0, t1] = p, pts = [], K = 6;
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(lerp(s0, s1, k / K)), t0));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(s1), lerp(t0, t1, k / K)));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(lerp(s1, s0, k / K)), t1));
  for (let k = 0; k <= K; k++) pts.push(secPt(FUS(s0), lerp(t1, t0, k / K)));
  return pts.map((q) => [q[2], q[1], q[0] * side]);
}

function createJumboLivery(quality) {
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
    const P = ROYAL;
    const f = (col, mrc = MR.paint) => (m ? mrc : col);
    c.fillStyle = f(L.primary); c.fillRect(-1, 0, 74, 12);
    // purple belly under a gold cheat line that sweeps up into the tail
    c.fillStyle = f(P.purple);
    c.beginPath(); c.moveTo(-1, 0); for (let s = -1; s <= 72; s += 0.5) c.lineTo(s, cheatY(s) - 0.08); c.lineTo(72, 0); c.closePath(); c.fill();
    const band = (y0, y1) => { c.beginPath(); for (let s = -1; s <= 72; s += 0.5) c.lineTo(s, cheatY(s) + y0); for (let s = 72; s >= -1; s -= 0.5) c.lineTo(s, cheatY(s) + y1); c.closePath(); };
    c.fillStyle = f(P.gold, MR.gold); band(-0.08, 0.1); c.fill();
    c.fillStyle = f(P.goldLight, MR.gold); band(0.17, 0.21); c.fill();
    if (!m) {
      c.fillStyle = P.purpleLight; band(-0.32, -0.27); c.fill();
      // soft belly shading
      const g = c.createLinearGradient(0, 2, 0, 4.2); g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(-1, 1.5, 74, 3);
    }
    // radome shade + panel lines
    if (!m) {
      c.strokeStyle = 'rgba(40,40,50,0.22)'; c.lineWidth = 0.025;
      for (const s of [1.15, 11.5, 22.5, 33, 46.5, 58, 66.5]) { c.beginPath(); c.moveTo(s, 1.5); c.lineTo(s, 10.6); c.stroke(); }
    }
    // cockpit glass (painted too, for the far LODs without panes)
    c.fillStyle = f('#10161d', MR.glass);
    for (const p of PANES) { const o = paneOutline(p); c.beginPath(); o.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); }
    // doors
    const door = (s, gold) => {
      c.lineWidth = gold ? 0.07 : 0.035; c.strokeStyle = f(gold ? P.gold : 'rgba(60,60,72,0.6)', gold ? MR.gold : MR.paint);
      c.beginPath(); c.roundRect(s - 0.54, 5.62, 1.08, 1.95, 0.18); c.stroke();
      c.fillStyle = f('#1a2129', MR.glass); c.beginPath(); c.roundRect(s - 0.13, 6.48, 0.26, 0.36, 0.1); c.fill();
    };
    DOORS.forEach((s, i) => door(s, i === 0));
    // main-deck windows
    c.fillStyle = f('#1a2129', MR.glass);
    for (let s = 7.4; s < 60.5; s += 0.508) {
      if (DOORS.some((d) => Math.abs(s - d) < 0.95)) continue;
      if (s > 27.2 && s < 28.6) continue;
      c.beginPath(); c.roundRect(s - 0.13, 6.45, 0.26, 0.38, 0.11); c.fill();
    }
    // upper-deck windows and the ROYAL hump title
    for (let s = 12.6; s < 22.4; s += 0.56) { c.beginPath(); c.roundRect(s - 0.13, 8.6, 0.26, 0.34, 0.11); c.fill(); }
    if (!m) {
      A.text(c, T, 'ROYAL', 17.2, 9.6, 11, 0.95, { font: '800', family: "Georgia, 'Times New Roman', serif", fill: P.gold, stroke: P.purpleDark, strokeW: 6 });
      crest(c, T, 7.1, 7.55, 1.35, { field: P.purple, field2: P.crimson, gold: P.gold });
      // gold crown over the royal door
      c.fillStyle = P.gold;
      c.beginPath(); const cx = DOORS[0], cy = 7.72; c.moveTo(cx - 0.3, cy); c.lineTo(cx + 0.3, cy); c.lineTo(cx + 0.34, cy + 0.22); c.lineTo(cx + 0.15, cy + 0.12); c.lineTo(cx, cy + 0.28); c.lineTo(cx - 0.15, cy + 0.12); c.lineTo(cx - 0.34, cy + 0.22); c.closePath(); c.fill();
      const nameCol = pick(L.primary, [P.purple, P.purpleDark, '#14171c'], 3);
      A.text(c, T, L.display.toUpperCase(), 36.5, 7.55, 18, 0.95, { font: 'italic 800', fill: nameCol, stroke: null });
      const regCol = pick(L.primary, ['#15181d', P.purple], 4);
      A.text(c, T, L.registration, 59.2, 6.75, 4.2, 0.48, { font: '700', fill: regCol });
      // the accent pinstripe is the player's own colour
      c.fillStyle = L.accent; band(0.27, 0.31); c.fill();
    } else {
      c.fillStyle = MR.gold;
      A.text(c, T, 'ROYAL', 17.2, 9.6, 11, 0.95, { font: '800', family: "Georgia, 'Times New Roman', serif", fill: MR.gold, stroke: MR.gold, strokeW: 6 });
      c.beginPath(); c.ellipse(7.1, 7.5, 0.55, 0.75, 0, 0, 7); c.fill();
    }
    // APU exhaust soot
    c.fillStyle = f('#2a2a2e', MR.dark); c.fillRect(70.2, 0, 2, 12);
  }
  function fin(c, T, L, m) {
    const P = ROYAL, f = (col, mrc = MR.paint) => (m ? mrc : col);
    c.fillStyle = f(P.purple); c.fillRect(50, 6, 25, 15);
    if (!m) {
      // gold sunburst behind the crest
      c.save(); c.translate(62.6, 13.6);
      for (let i = 0; i < 18; i++) { c.rotate(Math.PI / 9); c.fillStyle = i % 2 ? 'rgba(214,167,64,0.16)' : 'rgba(214,167,64,0.07)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(9, -0.9); c.lineTo(9, 0.9); c.closePath(); c.fill(); }
      c.restore();
    }
    c.fillStyle = f(P.gold, MR.gold);
    c.beginPath(); for (let y = 7.8; y <= 19.6; y += 0.4) c.lineTo(FIN.le0 + (y - FIN.y0) * FIN.sweep + 0.6, y); for (let y = 19.6; y >= 7.8; y -= 0.4) c.lineTo(FIN.le0 + (y - FIN.y0) * FIN.sweep - 1, y); c.closePath(); c.fill();
    c.fillRect(50, 8.4, 25, 0.22);
    if (!m) crest(c, T, 62.8, 13.5, 4.9, { field: P.purpleDark, field2: P.crimson, gold: P.gold });
    else { c.beginPath(); c.ellipse(62.8, 13.5, 1.6, 2.2, 0, 0, 7); c.fill(); }
  }
  function wing(c, T, L, top, m) {
    const P = ROYAL, f = (col, mrc = MR.grey) => (m ? mrc : col);
    c.fillStyle = f(P.wingGrey); c.fillRect(-34, 22, 68, 32);
    if (m) return;
    c.strokeStyle = 'rgba(40,44,52,0.28)'; c.lineWidth = 0.04;
    for (const sg of [-1, 1]) {
      for (const [a, b, h] of [...FLAPS, AIL]) { const pa = wingPlan(a), pb = wingPlan(b); c.beginPath(); c.moveTo(sg * a, pa.le + pa.c * h); c.lineTo(sg * b, pb.le + pb.c * h); c.stroke(); }
      // spar / panel lines
      c.beginPath(); for (let x = 3; x <= 31; x += 1) { const p = wingPlan(x); c.lineTo(sg * x, p.le + p.c * 0.15); } c.stroke();
      c.beginPath(); for (let x = 3; x <= 31; x += 1) { const p = wingPlan(x); c.lineTo(sg * x, p.le + p.c * 0.62); } c.stroke();
      // gold wingtip band
      c.fillStyle = P.gold; const t0 = wingPlan(30.4); c.beginPath(); c.moveTo(sg * 30.4, t0.le - 1); c.lineTo(sg * 30.7, t0.le - 1); c.lineTo(sg * 30.7, t0.le + t0.c + 1); c.lineTo(sg * 30.4, t0.le + t0.c + 1); c.fill();
      if (top) {
        // walkway outline near the root
        c.strokeStyle = 'rgba(30,30,36,0.25)'; c.lineWidth = 0.05; c.strokeRect(sg > 0 ? 3.8 : -5.0, 30, 1.2, 7);
      }
    }
    const regCol = '#1b1e24';
    if (!top) A.text(c, T, L.registration, -17.5, 39.5, 13, 3.2, { font: '700', fill: regCol, plan: true });
    if (top) A.text(c, T, L.registration, 17.5, 39.5, 11, 2.6, { font: '700', fill: 'rgba(27,30,36,0.75)', plan: true });
  }
  function tail(c, m) {
    c.fillStyle = m ? MR.grey : ROYAL.wingGrey; c.fillRect(-12, 57, 24, 14);
    if (m) return;
    c.strokeStyle = 'rgba(40,44,52,0.3)'; c.lineWidth = 0.04;
    for (const sg of [-1, 1]) { c.beginPath(); for (let x = 0.8; x <= 11; x += 0.5) { const le = STAB.le0 + x * STAB.sweep, ch = lerp(STAB.rootC, STAB.tipC, x / STAB.half); c.lineTo(sg * x, le + ch * STAB.hinge); } c.stroke(); }
    c.fillStyle = ROYAL.purple; for (const sg of [-1, 1]) c.fillRect(sg > 0 ? 10.3 : -11.6, 57, 1.3, 14);
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
      const cols = m ? { gold: MR.gold, grey: MR.grey, dark: MR.dark, black: MR.dark }
        : { primary: L.primary, secondary: L.secondary, accent: L.accent, purple: ROYAL.purple, purpleDark: ROYAL.purpleDark, gold: ROYAL.gold, grey: ROYAL.wingGrey, dark: '#26282d', black: '#0d0e10', white: '#f2f2ee', belly: ROYAL.belly };
      SW.forEach((k, i) => { cc.fillStyle = cols[k] || MR.paint; cc.fillRect(i * w, W * 0.98, w, W * 0.02); });
    }
    texture.needsUpdate = true; mrTex.needsUpdate = true;
  }
  return { texture, mrTex, draw, owns: (t) => t === texture || t === mrTex, dispose() { texture.dispose(); mrTex.dispose(); } };
}

function createJumboMaterials(quality, livery, ctx) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.mrTex, metalnessMap: livery.mrTex, roughness: 1, metalness: 1, envMapIntensity: 1.1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.55, clearcoatRoughness: 0.12 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('jumbo-trim', { envMapIntensity: 1.2 });
  const fanMat = pbrMaterial('jumbo-fan', { envMapIntensity: 1.1 });
  const fanSpin = spinPatch(fanMat, 'jumbo', () => ctx.fanAngle || 0);
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, fanMat, disc, lights, beacon];
  return { paint, trim, fan: fanMat, fanSpin, disc, lights, beacon, all: () => list };
}

const COL = {
  tire: srgb('#16171a'), hub: srgb('#9ea3a8'), steel: srgb('#8e949a'), dark: srgb('#2b2d31'), black: srgb('#0c0d0f'),
  gold: srgb(ROYAL.gold), goldLight: srgb(ROYAL.goldLight), velvet: srgb('#8c1020'), pearl: srgb('#f3efe6'), ruby: srgb('#c3102a'),
  glass: srgb('#121a22'), frame: srgb('#2a2e35'), duct: srgb('#3a3d43'), fanDark: srgb('#17191d'), titanium: srgb('#9aa0a8'),
  exhaust: srgb('#55504a'), chrome: srgb('#d3d7db'), carpet: srgb('#b0141f'), carpetDark: srgb('#7a0d16'), white: srgb('#f0efe9'),
  lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7], gearLeg: srgb('#c6c9cd'),
};

export function buildJumboExterior(quality, mats, ctx) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), lights = new Builder(), beaconB = new Builder(), gear = new Builder();
  const sideUV = (p, right) => uvSide(right ? REG.fusR : REG.fusL, p[2], p[1]);

  // ---------- fuselage ----------
  const N = T.n(44, 12);
  const st = [0, 0.05];
  {
    const ds = (s) => (s < 1 ? 0.16 : s < 6.5 ? 0.45 : s < 11 ? 1.1 : s < 21 ? 3.2 : s < 33 ? 1.6 : s < 46 ? 3.3 : 1.9) / Math.max(0.3, T.k);
    let s = 0.05;
    while (s < LENGTH - 0.05) { s = Math.min(LENGTH, s + ds(s)); st.push(+s.toFixed(3)); }
    for (const k of [46.5, 70.1, LENGTH]) if (!st.includes(k)) st.push(k);
    st.sort((a, b) => a - b);
  }
  loftFuselage(body, FUS, st, N, sideUV);
  { // APU tail cone cap
    const sec = FUS(LENGTH), ring = [];
    for (let j = 0; j < N; j++) ring.push(secPt(sec, (j / N) * Math.PI * 2));
    fan(body, ring, [0, 0, 1], sw('dark'));
    const sec0 = FUS(0), ring0 = [];
    for (let j = 0; j < N; j++) ring0.push(secPt(sec0, (j / N) * Math.PI * 2));
    fan(body, ring0, [0, 0, -1], sw('primary'));
  }
  // cockpit glass: dark glossy panes standing just proud of the skin (single-sided, so invisible from inside)
  if (!T.lod2) {
    for (const p of PANES) for (const sg of [1, -1]) {
      const [s0, s1, t0, t1] = p, ta = sg > 0 ? t0 : -t1, tb = sg > 0 ? t1 : -t0;
      skinPatch(trim, FUS, s0 - 0.05, s1 + 0.05, ta - 0.02, tb + 0.02, 2, T.i(4, 1), 0.012, RM.paint, COL.frame);
      skinPatch(trim, FUS, s0, s1, ta, tb, T.i(4, 1), T.i(5, 2), 0.022, RM.glass, COL.glass);
    }
    if (T.detail) for (const sg of [1, -1]) {
      // windscreen wipers parked along the lower sill
      const a = secPt(FUS(3.3), sg * 0.06, -0.04), b = secPt(FUS(3.38), sg * 0.24, -0.04);
      rod(trim, a, b, 0.016, 5, RM.black, COL.black);
    }
  }

  // ---------- wings ----------
  const nC = T.n(26, 8), wStep = T.step(2.4);
  const pieces = {};
  const segsFor = (sg) => {
    const S = (a) => a.map((x) => x * sg);
    const caps = [true, true];
    const full = (a, b) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps });
    const cut = (a, b, h) => wingPanel(body, wingPlan, S(spanSteps(a, b, wStep)), FOIL, nC, { cTo: h, regT: REG.wingT, regB: REG.wingB, caps });
    if (T.far) {
      wingPanel(body, wingPlan, S([2.6, WING.kink, 21.6, WING.tip]), FOIL, nC, { regT: REG.wingT, regB: REG.wingB, caps });
      if (!T.lod2) winglet(body, sg, T);
      return;
    }
    full(2.6, FLAPS[0][0]);
    cut(FLAPS[0][0], FLAPS[0][1], FLAPS[0][2]);
    full(FLAPS[0][1], FLAPS[1][0]);
    cut(FLAPS[1][0], FLAPS[1][1], FLAPS[1][2]);
    full(FLAPS[1][1], AIL[0]);
    cut(AIL[0], AIL[1], AIL[2]);
    full(AIL[1], WING.tip);
    const hp = (x, h) => { const w = wingPlan(x); const [yu, yl] = FOIL(h + 0.012); return [x * sg, w.y + ((yu + yl) / 2) * w.c * w.thk + w.twist * (h - 0.25) * w.c, w.le + (h + 0.012) * w.c]; };
    const surf = (name, a, b, h) => {
      const B = new Builder();
      wingPanel(B, wingPlan, S(spanSteps(a + 0.04, b - 0.04, wStep)), FOIL, nC, { cFrom: h + 0.008, roundNose: true, regT: REG.wingT, regB: REG.wingB });
      const pa = hp(a + 0.04, h), pb = hp(b - 0.04, h);
      pieces[name] = sg > 0 ? { B, a: pa, b: pb } : { B, a: pb, b: pa };
    };
    const k = sg > 0 ? 'R' : 'L';
    if (T.far) return;
    surf('flapIn' + k, ...FLAPS[0]);
    surf('flapOut' + k, ...FLAPS[1]);
    surf('ail' + k, ...AIL);
    // winglet: bends up through 60° to stand 30° off vertical, swept and tapered, purple
    if (!T.lod2) winglet(body, sg, T);
  };
  segsFor(1); segsFor(-1);
  // flap-track fairings (canoes) under the trailing edge
  if (!T.far) for (const sg of [1, -1]) for (const x of [6.5, 10.2, 14.6, 18.6]) {
    const w = wingPlan(x), z0 = w.le + w.c * 0.5, z1 = w.le + w.c + 2.0, yb = w.y + FOIL(0.6)[1] * w.c * w.thk;
    const path = [], K = T.i(8, 3);
    for (let k = 0; k <= K; k++) { const u = k / K; path.push([sg * x, yb + 0.1 - 0.5 * Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) ** 0.5 + 0.25 * u * u, lerp(z0, z1, u)]); }
    body.loft(sweepRings(path, circle(T.n(10, 4), 1), { scale: (i, n) => { const u = i / (n - 1); const k = Math.sin(Math.PI * clamp(0.03 + u * 0.97, 0, 1)) ** 0.35; return [0.3 * k + 0.02, 0.5 * k + 0.02]; }, upHint: [0, 1, 0] }), { uv: () => sw('grey'), capStart: true, capEnd: true, capUV: () => sw('grey') });
  }

  // ---------- engines: purple nacelles with gold lips, spinning fans ----------
  const fanParts = [];
  for (const E of ENGINES) for (const sg of [1, -1]) {
    const x = sg * E.x, y = E.y, z0 = E.lip, nL = T.n(28, 10);
    const outer = T.far ? [[0, NAC.lipR + 0.05], [0.4, NAC.maxR], [2.6, 1.46], [4.05, 1.18]] : [[0, NAC.lipR + 0.05], [0.1, 1.43], [0.4, NAC.maxR], [1.4, NAC.maxR + 0.02], [2.6, 1.46], [3.5, 1.32], [4.05, 1.18]];
    body.loft(outer.map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [p[0] - x, p[1] - y, 0], uv: () => sw('purple') });
    // gold inlet lip, dark duct, closing disc behind the fan
    const lip = T.far ? [[0.14, 1.23], [-0.03, 1.33], [0.1, 1.43]] : [[0.14, 1.23], [0.02, 1.27], [-0.03, 1.33], [0.0, 1.39], [0.1, 1.43]];
    trim.loft(lip.map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [p[0] - x, p[1] - y, -4], color: COL.gold, uv: () => RM.gold });
    if (!T.far) trim.loft([[0.14, 1.23], [NAC.fanZ + 0.1, NAC.fanR + 0.02]].map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [-(p[0] - x), -(p[1] - y), 0], color: COL.duct, uv: () => RM.darkMetal });
    trim.addGeo(new THREE.CircleGeometry(NAC.fanR + 0.03, nL), M4(x, y, z0 + (T.far ? 0.15 : NAC.fanZ + 0.12), 1, 1, 1, 0, Math.PI, 0), RM.black, COL.fanDark);
    // gold band round the cowl
    if (!T.far) trim.loft([[1.55, NAC.maxR + 0.025], [1.75, NAC.maxR + 0.025]].map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [p[0] - x, p[1] - y, 0], color: COL.gold, uv: () => RM.gold });
    // fan exit, core cowl, core nozzle, plug
    if (!T.far) trim.loft([[3.95, 1.2], [4.05, 1.13], [3.7, 1.0]].map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [-(p[0] - x), -(p[1] - y), 0], color: COL.dark, uv: () => RM.darkMetal });
    const core = T.far ? [[3.8, 1.02], [5.55, 0.7]] : [[3.5, 1.02], [4.4, 0.98], [5.1, 0.82], [5.55, 0.7]];
    trim.loft(core.map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [p[0] - x, p[1] - y, 0], color: COL.titanium, uv: () => RM.steel });
    const plug = T.far ? [[5.45, 0.56], [6.65, 0.04]] : [[5.45, 0.56], [5.9, 0.45], [6.4, 0.22], [6.65, 0.04]];
    trim.loft(plug.map(([dz, r]) => circle(T.n(14, 6), r).map(([a, b]) => [x + a, y + b, z0 + dz])), { out: (p) => [p[0] - x, p[1] - y, 0], color: COL.exhaust, uv: () => [0.6, 0.5], capEnd: false });
    if (!T.far) trim.loft([[5.5, 0.69], [5.56, 0.58]].map(([dz, r]) => circle(nL, r).map(([a, b]) => [x + a, y + b, z0 + dz])), { closed: true, color: COL.black, uv: () => RM.black });
    // pylon: vertical streamline fin from the cowl top up into the wing
    {
      const w = wingPlan(E.x), yb = y + NAC.maxR - 0.12, yt = w.y + 0.1, n = T.n(12, 6), K = 2, rings = [];
      for (let k = 0; k <= K; k++) {
        const u = k / K, za = lerp(z0 + 0.7, z0 + 1.4, u), zb = lerp(z0 + 4.3, w.le + w.c * 0.55, u), c = zb - za;
        rings.push(streamline(n, c, 0.5).map(([a, b]) => [x + a, lerp(yb, yt, u), za + b + 0.35 * c]));
      }
      body.loft(rings, { out: () => [0, 1, 0], uv: () => sw('purpleDark'), capStart: true, capEnd: false, capUV: () => sw('purpleDark') });
    }
    // fan: wide-chord twisted blades + spinner with a white swirl, built around the hub for the spin shader
    const hub = [x, y, z0 + NAC.fanZ];
    const nb = T.far ? 0 : T.high ? 22 : 16;
    fanParts.push({
      hub, build(B) {
        const R0 = 0.42, R1 = NAC.fanR, K = T.far ? 2 : 4;
        for (let i = 0; i < nb; i++) {
          const a0 = (i / nb) * Math.PI * 2, rings = [];
          for (let k = 0; k <= K; k++) {
            const r = lerp(R0, R1, k / K), tw = lerp(0.95, 0.35, k / K), ch = lerp(0.26, 0.36, k / K), th = lerp(0.03, 0.008, k / K);
            const a = a0 + 0.12 * (k / K);
            const pts = [[-ch / 2, -th], [ch / 2, -th], [ch / 2, th], [-ch / 2, th]].map(([u, v]) => {
              const tu = u * Math.cos(tw) - v * Math.sin(tw), tv = u * Math.sin(tw) + v * Math.cos(tw);
              return [hub[0] + Math.cos(a) * r - Math.sin(a) * tu, hub[1] + Math.sin(a) * r + Math.cos(a) * tu, hub[2] + tv];
            });
            rings.push(pts);
          }
          B.loft(rings, { color: COL.titanium, uv: () => [0.3, 0.9], capEnd: true });
        }
        // spinner
        const sp = [[-0.42, 0.02], [-0.32, 0.2], [-0.15, 0.34], [0.05, 0.42], [0.18, 0.43]];
        const ns = T.far ? 8 : T.n(18, 8);
        const rings = sp.map(([dz, r]) => circle(ns, r).map(([a, b]) => [hub[0] + a, hub[1] + b, hub[2] + dz]));
        B.loft(rings, { out: (p) => [p[0] - hub[0], p[1] - hub[1], -0.3], color: COL.dark, uv: () => [0.35, 0.2] });
        if (!T.far) {
          // white swirl painted on the spinner (shows the rotation like the real ones)
          const path = [];
          for (let k = 0; k <= 10; k++) { const u = k / 10, dz = lerp(-0.41, 0.12, u), r = 0.02 + 0.41 * Math.sin(Math.PI / 2 * u) * 1.0 + 0.01; const a = u * 2.2; path.push([hub[0] + Math.cos(a) * r, hub[1] + Math.sin(a) * r, hub[2] + dz]); }
          B.loft(sweepRings(path, circle(4, 0.022), {}), { color: COL.white, uv: () => [0.3, 0] });
        }
      },
    });
  }

  // ---------- tail ----------
  const sym = naca(0, 0.4, 0.1);
  const stabPlan = (x) => {
    const ax = Math.abs(x), u = clamp((ax - STAB.root) / (STAB.half - STAB.root), 0, 1);
    return { le: STAB.le0 + ax * STAB.sweep, c: lerp(STAB.rootC, STAB.tipC, u), y: STAB.y0 + ax * STAB.dih, thk: lerp(1.05, 0.8, u) };
  };
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  {
    const xs = spanSteps(STAB.root, STAB.half, T.step(1.4));
    for (const sg of [1, -1]) {
      wingPanel(body, stabPlan, xs.map((x) => x * sg), sym, T.n(18, 6), { cTo: STAB.hinge, uvT: tUV, uvB: tUV });
    }
    const hp = (x) => { const w = stabPlan(Math.abs(x)); return [x, w.y, w.le + (STAB.hinge + 0.015) * w.c]; };
    for (const sg of [1, -1]) {
      const elev = new Builder(), xa = 1.6, xb = STAB.half - 0.05;
      wingPanel(elev, stabPlan, spanSteps(xa, xb, T.step(1.4)).map((x) => x * sg), sym, T.n(18, 6), { cFrom: STAB.hinge + 0.01, roundNose: true, uvT: tUV, uvB: tUV });
      pieces[sg > 0 ? 'elevR' : 'elevL'] = sg > 0 ? { B: elev, a: hp(xa), b: hp(xb) } : { B: elev, a: hp(-xb), b: hp(-xa) };
    }
  }
  const finPlan = (y) => { const u = clamp((y - FIN.y0) / (FIN.top - FIN.y0), 0, 1); return { le: FIN.le0 + (y - FIN.y0) * FIN.sweep, c: lerp(FIN.rootC, FIN.tipC, u), thk: lerp(1.1, 0.75, u) }; };
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.finR : REG.finL, p[2], p[1]);
  {
    const ys = spanSteps(FIN.y0, FIN.top, T.step(1.6));
    const rings = ys.map((y) => { const w = finPlan(y); const { loop } = airfoilLoop(sym, T.n(20, 6), 0, FIN.hinge, false); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); });
    body.loft(rings, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
    const rud = new Builder();
    const ry = spanSteps(FIN.y0 + 0.8, FIN.top - 0.05, T.step(1.6));
    const rr = ry.map((y) => { const w = finPlan(y); const { loop } = airfoilLoop(sym, T.n(20, 6), FIN.hinge + 0.01, 1, true); return loop.map(([xc, yv]) => [yv * w.c * w.thk, y, w.le + xc * w.c]); });
    rud.loft(rr, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    const hy = (y) => { const w = finPlan(y); return [0, y, w.le + (FIN.hinge + 0.015) * w.c]; };
    pieces.rudder = { B: rud, a: hy(FIN.y0 + 0.8), b: hy(FIN.top - 0.05) };
  }
  // a gold crown on the fin tip (with a velvet cap and a ruby)
  const finTip = finPlan(FIN.top), crownZ = finTip.le + finTip.c * 0.45, crownY = FIN.top + 0.02;
  if (T.far && !T.lod2) {
    trim.addGeo(new THREE.CylinderGeometry(0.85, 0.78, 0.58, 8, 1, true), M4(0, crownY + 0.29, crownZ), RM.gold, COL.gold);
    trim.addGeo(new THREE.SphereGeometry(0.72, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), M4(0, crownY + 0.5, crownZ, 1, 0.75, 1), RM.cloth, COL.velvet);
  }
  if (!T.far) {
    const n = T.n(24, 10), R = 0.85, H = 0.58;
    trim.addGeo(new THREE.CylinderGeometry(R, R * 0.92, H, n, 1, true), M4(0, crownY + H / 2, crownZ), RM.gold, COL.gold);
    trim.addGeo(new THREE.TorusGeometry(R * 0.96, 0.06, 6, n), M4(0, crownY + 0.03, crownZ, 1, 1, 1, Math.PI / 2, 0, 0), RM.gold, COL.goldLight);
    trim.addGeo(new THREE.SphereGeometry(R * 0.86, n, T.i(8, 4), 0, Math.PI * 2, 0, Math.PI / 2), M4(0, crownY + H - 0.05, crownZ, 1, 0.75, 1), RM.cloth, COL.velvet);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, px = Math.cos(a) * R, pz = Math.sin(a) * R;
      trim.addGeo(new THREE.ConeGeometry(0.17, 0.55, 6), M4(px, crownY + H + 0.24, crownZ + pz, 1, 1, 0.5, 0, -a, 0), RM.gold, COL.gold);
      trim.addGeo(new THREE.SphereGeometry(0.09, 8, 6), M4(px, crownY + H + 0.55, crownZ + pz), RM.enamel, COL.pearl);
    }
    trim.addGeo(new THREE.SphereGeometry(0.15, 10, 8), M4(0, crownY + H + 0.68, crownZ), RM.gold, COL.gold);
    trim.addGeo(new THREE.BoxGeometry(0.08, 0.44, 0.08), M4(0, crownY + H + 0.98, crownZ), RM.gold, COL.gold);
    trim.addGeo(new THREE.BoxGeometry(0.3, 0.08, 0.08), M4(0, crownY + H + 1.05, crownZ), RM.gold, COL.gold);
    trim.addGeo(new THREE.SphereGeometry(0.09, 8, 6), M4(R * 0.99, crownY + H * 0.5, crownZ, 0.6, 1, 1), RM.glass, COL.ruby);
    trim.addGeo(new THREE.SphereGeometry(0.09, 8, 6), M4(-R * 0.99, crownY + H * 0.5, crownZ, 0.6, 1, 1), RM.glass, COL.ruby);
  }

  // ---------- details ----------
  if (T.detail) {
    // antennas (blade on top, belly), pitot probes
    for (const [s, top] of [[14, true], [27.5, true], [44, true], [24, false], [47, false]]) {
      const sec = FUS(s), p = secPt(sec, top ? 0 : Math.PI);
      trim.addGeo(new THREE.BoxGeometry(0.035, 0.32, 0.22), M4(0, p[1] + (top ? 0.12 : -0.12), s, 1, 1, 1, top ? 0.45 : -0.45, 0, 0), RM.paint, COL.frame);
    }
    for (const sg of [1, -1]) {
      const p = secPt(FUS(2.4), sg * 1.2);
      rod(trim, p, [p[0] + sg * 0.22, p[1] - 0.04, p[2] - 0.12], 0.025, 6, RM.chrome, COL.chrome);
    }
  }

  // ---------- landing gear (own mesh so it can retract) ----------
  {
    const nW = T.n(20, 8), cols = { tire: COL.tire, hub: COL.hub };
    const N0 = GEAR.nose;
    rod(gear, [0, N0.top, N0.s - 0.15], [0, N0.r + 0.05, N0.s], 0.13, T.n(10, 6), RM.chrome, COL.gearLeg);
    if (T.detail) rod(gear, [0, N0.top - 0.3, N0.s - 0.15], [0, N0.r + 1.2, N0.s + 0.9], 0.06, 6, RM.steel, COL.steel);
    if (!T.far) rod(gear, [-N0.x - 0.15, N0.r, N0.s], [N0.x + 0.15, N0.r, N0.s], 0.07, 8, RM.steel, COL.steel);
    const whl = (c, r, w) => (T.far ? gear.addGeo(new THREE.CylinderGeometry(r, r, w, T.lod2 ? 6 : 8, 1), M4(c[0], c[1], c[2], 1, 1, 1, 0, 0, Math.PI / 2), RM.rubber, COL.tire) : wheel(gear, c, r, w, nW, cols, RM));
    for (const sg of [1, -1]) whl([sg * N0.x, N0.r, N0.s], N0.r, N0.w);
    for (const bg of GEAR.bogies) for (const sg of [1, -1]) {
      const bx = sg * bg.x, y = GEAR.r;
      rod(gear, [bx, bg.top, bg.s - 0.2], [bx, y + 0.35, bg.s], 0.17, T.far ? 5 : T.n(10, 6), RM.chrome, COL.gearLeg);
      if (T.detail) rod(gear, [bx - sg * 1.1, bg.top + 0.1, bg.s + 0.3], [bx, y + 1.3, bg.s], 0.07, 6, RM.steel, COL.steel);
      gear.addGeo(new THREE.BoxGeometry(0.22, 0.24, GEAR.axle * 2 + 0.3), M4(bx, y + 0.22, bg.s), RM.steel, COL.steel);
      for (const dz of [-GEAR.axle, GEAR.axle]) {
        if (!T.far) rod(gear, [bx - GEAR.track - 0.2, y, bg.s + dz], [bx + GEAR.track + 0.2, y, bg.s + dz], 0.07, 8, RM.steel, COL.steel);
        for (const dx of [-GEAR.track, GEAR.track]) whl([bx + dx, y, bg.s + dz], GEAR.r, GEAR.w);
      }
    }
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, COL.lensR], [1, COL.lensG]]) {
    const w = wingPlan(WING.tip - 0.2), p = [sg * (WING.tip + 0.05), w.y + 0.05, w.le + 0.3];
    lights.addGeo(new THREE.SphereGeometry(0.12, T.far ? 4 : T.n(8, 4), T.far ? 2 : T.n(6, 3)), M4(...p, 0.8, 0.8, 1.4), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
    const q = [sg * (WING.tip + 0.05), w.y + 0.05, w.le + w.c - 0.1];
    lights.addGeo(new THREE.SphereGeometry(0.1, T.far ? 4 : T.n(8, 4), T.far ? 2 : T.n(6, 3)), M4(...q), [0, 0], COL.lensW);
    lightPts.push({ p: q, col: [1, 1, 1], kind: 'strobe' });
  }
  { const p = [0, FUS(LENGTH).yc, LENGTH + 0.02]; lights.addGeo(new THREE.SphereGeometry(0.1, 8, 6), M4(...p), [0, 0], COL.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }
  for (const [s, top] of [[28.8, true], [30, false]]) {
    const p = secPt(FUS(s), top ? 0 : Math.PI), q = [0, p[1] + (top ? 0.08 : -0.08), s];
    beaconB.addGeo(new THREE.SphereGeometry(0.16, T.far ? 4 : T.n(10, 6), T.far ? 2 : T.n(6, 4)), M4(...q, 1, 0.6, 1.5), [0, 0], [1, 1, 1]);
    lightPts.push({ p: q, col: [1, 0.1, 0.06], kind: 'beacon' });
  }

  // ---------- royal stairs with a red carpet (hidden unless rig.setStairs(true)) ----------
  let stairs = null;
  if (T.detail) {
    const sb = new Builder(), sd = DOORS[0], sill = 5.6, xs = -secR(FUS(sd), Math.PI / 2) - 0.25;
    const nStep = 26, rise = sill / nStep, run = 0.27, w = 1.3;
    for (let i = 0; i < nStep; i++) {
      const y = sill - (i + 1) * rise, x = xs - 1.2 - i * run;
      sb.addGeo(new THREE.BoxGeometry(run + 0.04, 0.06, w), M4(x, y + rise - 0.03, sd), RM.steel, COL.steel);
      sb.addGeo(new THREE.BoxGeometry(run + 0.02, 0.025, w * 0.72), M4(x, y + rise + 0.012, sd), RM.cloth, COL.carpet);
      sb.addGeo(new THREE.BoxGeometry(0.02, rise, w * 0.72), M4(x + run / 2 + 0.01, y + rise / 2 + 0.01, sd), RM.cloth, COL.carpetDark);
    }
    const x0 = xs - 1.2 + run / 2, x1 = xs - 1.2 - (nStep - 1) * run - run / 2;
    sb.addGeo(new THREE.BoxGeometry(1.45, 0.08, w + 0.1), M4(xs - 0.6, sill - 0.04, sd), RM.steel, COL.steel);
    sb.addGeo(new THREE.BoxGeometry(1.4, 0.03, w * 0.8), M4(xs - 0.6, sill + 0.005, sd), RM.cloth, COL.carpet);
    for (const dz of [-w / 2, w / 2]) {
      rod(sb, [x0 + 0.2, sill - 0.1, sd + dz], [x1, 0.15, sd + dz], 0.07, 6, RM.paint, srgb(ROYAL.purple));
      rod(sb, [x0 + 0.6, sill + 1.0, sd + dz], [x1 + 0.1, 1.05, sd + dz], 0.035, 8, RM.gold, COL.gold);
      for (let k = 0; k <= 4; k++) { const u = k / 4, px = lerp(x0 + 0.5, x1 + 0.15, u), py = lerp(sill, 0.1, u); rod(sb, [px, py, sd + dz], [px, py + 1.0, sd + dz], 0.025, 6, RM.gold, COL.gold); }
    }
    sb.addGeo(new THREE.BoxGeometry(3.4, 0.9, 2.2), M4(x1 + 0.4, 0.75, sd), RM.paint, srgb(ROYAL.purple));
    for (const dx of [-1.1, 1.1]) for (const dz of [-0.9, 0.9]) wheel(sb, [x1 + 0.4 + dx, 0.3, sd + dz], 0.3, 0.22, 10, { tire: COL.tire, hub: COL.hub }, RM);
    // a red carpet rolled out on the ground from the foot of the stairs
    sb.addGeo(new THREE.BoxGeometry(9, 0.02, w * 0.75), M4(x1 - 4.5, 0.012, sd), RM.cloth, COL.carpet);
    stairs = mkMesh('stairs', sb, mats.trim);
    stairs.visible = false;
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
  // gear: scaled up into the belly when retracted (pivot at the wheel-well height)
  const gearPivot = new THREE.Group();
  gearPivot.name = 'gear-pivot';
  gearPivot.position.y = 2.6;
  const gearMesh = mkMesh('gear', gear, mats.trim);
  gearMesh.position.y = -2.6;
  gearPivot.add(gearMesh);
  if (T.far) { (ctx.farGear ||= []).push(gearPivot); } else group.add(gearPivot);
  if (stairs) group.add(stairs);
  let fanMesh = null;
  if (!T.lod2) { fanMesh = spinMesh('fan', fanParts, mats.fan, mats.fanSpin || { update() {} }); fanMesh.castShadow = false; group.add(fanMesh); }
  // the rig's prop handling sees inert stand-ins; the fans spin through the shader (ctx.fanAngle)
  const propGroup = propProxy(), propMesh = propProxy(), disc = propProxy();
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts, gearPivot, stairs, fanMesh };
}

const D2R = Math.PI / 180;
const MAX = { aileron: 20 * D2R, elevUp: 25 * D2R, elevDown: 17 * D2R, rudder: 25 * D2R, flaps: 30 * D2R };
export const JUMBO_DIMS = { length: LENGTH, span: 2 * (WING.tip + 1.0), height: 19.4, gearHeight: CG.y, groundPitch: 0, restHeight: CG.y };

// N1 % from whatever the engine model sends: values up to 120 are already N1 %, bigger ones are fan rpm (≈ 3300 at 100 %)
export const n1 = (r) => (r <= 120 ? r : r / 33);

// glass cockpit layout for the jumbo's upper-deck flight deck
const COCKPIT = {
  sec: FUS, eye: EYE, floorY: 7.95, shell: { s0: 3.05, s1: 7.2, inset: 0.07, holes: PANES, nt: 64 },
  panel: { s: 4.5, y0: 8.0, y1: 8.62, tilt: 0.16 }, glare: { y: 8.72, depth: 0.36 },
  seats: [-0.55, 0.55], seatS: 5.75, yoke: { s: 4.98, y: 8.5 }, pedestal: { s0: 4.55, s1: 5.85, w: 0.5, y: 8.3 },
  overhead: { s0: 4.8, s1: 6.2, y: 9.92 }, levers: 4, aft: 7.2, label: 'ROYAL JUMBO', dispSize: 0.25, dispX: [-1.02, -0.7, 0, 0.7, 1.02], n1,
};

export async function createJumbo(opts = {}) {
  let C = null;
  const def = {
    id: 'jumbo', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.15, pitch: -0.1 },
    portrait: { center: [0, 0.06, 0.16], cockpit: [0.03, 0.05, 0.06], fov: 90, pitch: -0.12 },
    dims: JUMBO_DIMS,
    // rpm is N1 % (JETCORE's convention: idle 22 .. max 100); shaft-rpm-sized values are also accepted (see n1())
    lod: [900, 520], rpm: { idle: 22, max: 78 },
    createLivery: (q) => createJumboLivery(q),
    createMaterials: (q, l, ctx) => { C = ctx; return createJumboMaterials(q, l, ctx); },
    buildExterior: (q, mats, ctx) => buildJumboExterior(q, mats, ctx),
    buildCockpit: (q, mats, ctx) => buildGlassCockpit(q, mats, ctx, COCKPIT),
    stick: COCKPIT_STICK(COCKPIT),
    createPilot: (q, cfg, ctx) => glassPilot(q, cfg, ctx, COCKPIT),
    animate: (ext, cur, dt, ctx) => animateBig(ext, cur, dt, ctx, MAX, { fanRate: (r) => 0.5 + 5.5 * clamp((n1(r) - 15) / 85, 0, 1) }),
  };
  return finishBig(await assembleRig(def, opts), C, opts);
}

function winglet(B, sg, T) {
  const tip = wingPlan(WING.tip), K = T.i(6, 3), H = 1.95, { loop } = airfoilLoop(naca(0.02, 0.4, 0.1), T.n(16, 6), 0, 1, false);
  const rings = [], phis = [];
  let px = WING.tip, py = tip.y;
  for (let i = 0; i <= K; i++) {
    const u = i / K, phi = (Math.PI / 3) * clamp(u / 0.3, 0, 1) ** 0.8;
    if (i) { const pu = (i - 0.5) / K, pp = (Math.PI / 3) * clamp(pu / 0.3, 0, 1) ** 0.8; px += Math.cos(pp) * H / K; py += Math.sin(pp) * H / K; }
    const ch = lerp(tip.c, 1.1, u ** 0.7), le = tip.le + lerp(0, tip.c - 1.1 + 0.55, u ** 0.8), th = lerp(tip.thk, 0.8, u);
    phis.push(phi);
    rings.push(loop.map(([xc, yv]) => { const t = yv * ch * th; return [sg * (px - Math.sin(phi) * t), py + Math.cos(phi) * t, le + xc * ch]; }));
  }
  B.loft(rings, { out: (p, i) => [-sg * Math.sin(phis[i]), Math.cos(phis[i]), 0], uv: () => sw('purple'), capEnd: true, capUV: () => sw('gold') });
}
