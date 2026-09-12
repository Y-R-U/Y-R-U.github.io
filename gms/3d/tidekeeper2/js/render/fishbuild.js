/* Assembling a whole animal from the parts in fishgeo.js. */

import * as THREE from 'three';
import { clamp, lerp, smooth, rr, rnd, vnoise, TAU } from '../util.js';
import { FIN, profile, centreline, patternAt, Buf, Z3, ball, ribbon } from './fishgeo.js';

export function buildFish(sp) {
  if (sp.shape === 'jelly')    return buildJelly(sp);
  if (sp.shape === 'snail')    return buildSnail(sp);
  if (sp.shape === 'shrimp')   return buildShrimp(sp);
  if (sp.shape === 'seahorse') return buildSeahorse(sp);
  return buildFinfish(sp);
}

function buildFinfish(sp) {
  const B = sp.body, G = new Buf();
  const RINGS = 34, SEGS = 18;
  const yAt = t => centreline(B, t) + profile(B, t)[0];
  const yBt = t => centreline(B, t) - profile(B, t)[0];

  /* ── body ──────────────────────────────────────────────────────────── */
  const rows = [];
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const [ry, rz] = profile(B, t);
    const cy = centreline(B, t), x = 0.5 - t;
    const row = [];
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * TAU;
      const sy = Math.sin(a), sz = Math.cos(a);
      /* a fish cross-section is fuller below and slightly flat along the back */
      const keel = 1 + 0.16 * Math.max(0, -sy);
      const flat = 1 - 0.20 * Math.pow(Math.abs(sy), 3);
      const y = cy + sy * ry * keel, z = sz * rz * flat;
      const ny = clamp((y - (cy - ry)) / Math.max(1e-4, 2 * ry), 0, 1);
      const col = patternAt(sp, t, ny, sz, false);
      /* the two lines that read as a face: the mouth and the gill plate */
      const mouth = Math.exp(-Math.pow((t - 0.012) / 0.022, 2)) * Math.exp(-Math.pow((ny - 0.40) / 0.24, 2));
      const gill = Math.exp(-Math.pow((t - 0.215) / 0.012, 2)) * smooth(0.05, 0.5, ny);
      const dark = clamp(mouth * 0.85 + gill * 0.38, 0, 0.9);
      col[0] *= 1 - dark * 0.8; col[1] *= 1 - dark * 0.8; col[2] *= 1 - dark * 0.72;
      row.push(G.vert(x, y, z, col, t, FIN.BODY, Z3));
    }
    rows.push(row);
  }
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < SEGS; j++) {
      const j2 = (j + 1) % SEGS;
      G.quad(rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j]);
    }
  /* cap the snout */
  const nose = patternAt(sp, 0, 0.45, 0, false);
  nose[0] *= 0.35; nose[1] *= 0.35; nose[2] *= 0.4;
  const snoutV = G.vert(0.505, centreline(B, 0), 0, nose, 0, FIN.BODY, Z3);
  for (let j = 0; j < SEGS; j++) G.tri(snoutV, rows[0][(j + 1) % SEGS], rows[0][j]);

  const veil = B.veil || 0;

  /* ── caudal fin ────────────────────────────────────────────────────── */
  const TL = B.tail;
  if (TL && TL.h > 0.03) {
    const th = TL.h * 0.5 * (1 + veil * 0.2), tl = TL.len * (1 + veil * 0.6);
    const cutFor = (type, vv) => {
      const av = Math.abs(vv);
      switch (type) {
        case 'forked': return 0.40 + 0.60 * av;
        case 'lunate': return 0.22 + 0.78 * Math.pow(av, 1.5);
        case 'lyre':   return 0.34 + 0.66 * Math.pow(av, 2.6);
        case 'round':  return Math.sqrt(Math.max(0.06, 1 - vv * vv));
        case 'fan':    return 1 - 0.10 * (1 - av);
        default:       return 1 - 0.06 * (1 - av);   // veil
      }
    };
    ribbon(G, sp, 8, 11, (u, v) => {
      const vv = v * 2 - 1;
      const spread = th * (0.30 + 0.70 * Math.pow(u, 0.72));
      const wob = TL.type === 'veil'
        ? (Math.sin(vv * 6.2 + u * 4.2) * 0.055 + Math.sin(vv * 2.1 - u * 2.4) * 0.030) * u : 0;
      return { x: -0.5 - u * tl * cutFor(TL.type, vv),
               y: vv * spread + wob + centreline(B, 1),
               z: vv * 0.012 * (1 - u * 0.5),
               t: 0.95, ny: vv * 0.5 + 0.5, nz: 0 };
    }, FIN.CAUDAL, Z3, u => 1.0 + u * 0.4);
  }

  /* ── dorsal ────────────────────────────────────────────────────────── */
  const D = B.dorsal;
  if (D && D.h > 0.02) {
    const put = (t0, t1, h, nu) => ribbon(G, sp, nu, 4, (u, v) => {
      const t = t0 + u * (t1 - t0);
      const shape = Math.pow(Math.sin(Math.PI * clamp(u * 0.9 + 0.06, 0, 1)), 0.52);
      return { x: 0.5 - t, y: yAt(t) + v * h * shape, z: (v - 0.5) * 0.012, t, ny: 0.92, nz: 0 };
    }, FIN.DORSAL, Z3, u => t0 + u * (t1 - t0));

    if (D.kind === 'spiny' && sp.body.spines) {
      const N = 12, t0 = D.start, t1 = Math.min(0.93, t0 + D.len);
      for (let s = 0; s < N; s++) {
        const t = t0 + (s / (N - 1)) * (t1 - t0);
        const h = D.h * (0.55 + 0.45 * Math.sin(Math.PI * (0.18 + 0.82 * (s / (N - 1)))));
        ribbon(G, sp, 6, 2, (u, v) => {
          const vv = (v - 0.5) * 2, w = 0.028 * (1 - u * 0.78);
          return { x: 0.5 - t - u * 0.14 + vv * 0.004, y: yAt(t) + u * h, z: vv * w, t, ny: 0.92, nz: vv };
        }, FIN.DORSAL, Z3, () => t);
      }
    } else if (D.kind === 'two') {
      put(D.start, D.start + D.len * 0.46, D.h * 0.74, 7);
      put(D.start + D.len * 0.52, Math.min(0.93, D.start + D.len), D.h * 0.60, 7);
    } else {
      put(D.start, Math.min(0.94, D.start + D.len), D.h * (1 + veil * 0.35), 10);
    }
  }

  /* ── anal fin ──────────────────────────────────────────────────────── */
  const A = B.anal;
  if (A && A.h > 0.02) {
    const t0 = A.start, t1 = Math.min(0.95, t0 + A.len);
    ribbon(G, sp, 8, 4, (u, v) => {
      const t = t0 + u * (t1 - t0);
      const shape = Math.pow(Math.sin(Math.PI * clamp(u * 0.88 + 0.08, 0, 1)), 0.5);
      return { x: 0.5 - t, y: yBt(t) - v * A.h * (1 + veil * 0.45) * shape,
               z: (v - 0.5) * 0.012, t, ny: 0.10, nz: 0 };
    }, FIN.DORSAL, Z3, u => t0 + u * (t1 - t0));
  }

  /* ── pectorals ─────────────────────────────────────────────────────── */
  const P = B.pect;
  if (P && P.len > 0.03) {
    const tp = 0.27, xr = 0.5 - tp;
    const [, pz] = profile(B, tp);
    const zr = pz * 0.88, yr = centreline(B, tp) - profile(B, tp)[0] * 0.16;
    const long = P.kind === 'long';
    for (const side of [1, -1]) {
      const pivot = [xr, yr, zr * side];
      ribbon(G, sp, 7, 5, (u, v) => {
        const vv = v * 2 - 1;
        const spread = P.len * (long ? 0.44 : 0.30) * Math.pow(Math.sin(Math.PI * clamp(0.1 + u * 0.9, 0, 1)), 0.62);
        const droop = -u * P.len * (long ? 0.20 : 0.10);
        return { x: xr - u * P.len * 0.60 + vv * spread * 0.5,
                 y: yr + droop + vv * spread * 0.72,
                 z: (zr + u * P.len * (long ? 0.58 : 0.40)) * side,
                 t: tp + u * 0.62, ny: 0.5 + vv * 0.45, nz: side };
      }, side > 0 ? FIN.PECT_L : FIN.PECT_R, pivot, () => tp);
    }
  }

  /* ── pelvics ───────────────────────────────────────────────────────── */
  const V = B.pelvic;
  if (V && V.kind !== 'none' && V.len > 0.03) {
    const tv = 0.40, xr = 0.5 - tv;
    const [vy, vz] = profile(B, tv);
    const yr = centreline(B, tv) - vy * 0.88, zr = vz * 0.45;
    const thread = V.kind === 'thread';
    for (const side of [1, -1]) {
      const pivot = [xr, yr, zr * side];
      ribbon(G, sp, thread ? 8 : 5, 3, (u, v) => {
        const vv = v * 2 - 1;
        const w = (thread ? 0.030 : V.len * 0.34) * (1 - u * (thread ? 0.72 : 0.35));
        const sway = thread ? Math.sin(u * 2.6) * 0.06 : 0;
        return { x: xr - u * V.len * (thread ? 0.42 : 0.55) + vv * w * 0.4 + sway,
                 y: yr - u * V.len * (thread ? 0.88 : 0.62),
                 z: (zr + u * V.len * 0.22) * side + vv * w,
                 t: tv, ny: 0.06, nz: side };
      }, side > 0 ? FIN.PELV_L : FIN.PELV_R, pivot, () => tv + 0.2);
    }
  }

  /* ── barbels ───────────────────────────────────────────────────────── */
  if (B.barbels) {
    const n = B.barbels, col = patternAt(sp, 0.04, 0.35, 0, false);
    col[3] = 0.9;
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const row = Math.floor(k / 2);
      const [by, bz] = profile(B, 0.05);
      const ox = 0.5 - 0.05, oy = centreline(B, 0.05) - by * (0.3 + row * 0.22), oz = bz * 0.5 * side;
      const A2 = [], Bb = [];
      for (let s = 0; s <= 5; s++) {
        const u = s / 5, w = 0.009 * (1 - u * 0.7);
        const x = ox - u * 0.12 * (1 + row * 0.2), y = oy - u * 0.09 - Math.sin(u * 2) * 0.02;
        const z = oz + side * u * 0.05;
        A2.push(G.vert(x, y + w, z, col, 0.08, FIN.BARBEL, [ox, oy, oz]));
        Bb.push(G.vert(x, y - w, z, col, 0.08, FIN.BARBEL, [ox, oy, oz]));
      }
      for (let s = 0; s < 5; s++) G.quad(A2[s], Bb[s], Bb[s + 1], A2[s + 1]);
    }
  }

  /* ── eyes: sclera, iris, pupil, and a hard specular dot ────────────── */
  const te = 0.135, [ey, ez] = profile(B, te);
  const eyeY = centreline(B, te) + ey * 0.34;
  const eyeZ = ez * 0.82;
  const eyeR = clamp(Math.max(ey, 0.03) * 0.44 * (B.eye || 1), 0.014, 0.062);
  const irisHex = sp.pal.accent2 ?? 0x201a14;
  const iris = new THREE.Color(irisHex);
  for (const side of [1, -1]) {
    /* a dark socket, a coloured iris ring, a big pupil and one small catch
       light — an eye that is mostly white reads as a headlamp */
    ball(G, 0.5 - te, eyeY, eyeZ * side, eyeR, [0.30, 0.29, 0.26, 1, 0], te, FIN.RIGID, 6, 8);
    ball(G, 0.5 - te + eyeR * 0.30, eyeY, eyeZ * side * 1.06, eyeR * 0.86,
         [iris.r * 0.42 + 0.06, iris.g * 0.42 + 0.05, iris.b * 0.42 + 0.05, 1, 0], te, FIN.RIGID, 5, 8);
    ball(G, 0.5 - te + eyeR * 0.48, eyeY, eyeZ * side * 1.1, eyeR * 0.62, [0.02, 0.02, 0.03, 1, 0], te, FIN.RIGID, 5, 8);
    ball(G, 0.5 - te + eyeR * 0.60, eyeY + eyeR * 0.36, eyeZ * side * 1.13, eyeR * 0.15,
         [1, 1, 1, 1, 0.2], te, FIN.RIGID, 4, 6);
  }

  const g = G.build();
  g.userData.wave = B.wave;
  return g;
}

/* ── moon jelly ──────────────────────────────────────────────────────────── */
function buildJelly(sp) {
  const G = new Buf(), RINGS = 14, SEGS = 22;
  const grid = [];
  for (let i = 0; i <= RINGS; i++) {
    const a = (i / RINGS) * (Math.PI * 0.56), row = [];
    for (let j = 0; j < SEGS; j++) {
      const b = (j / SEGS) * TAU;
      const r = Math.sin(a) * 0.46, x = 0.44 - (1 - Math.cos(a)) * 0.52;
      const col = patternAt(sp, i / RINGS, 1 - i / RINGS, 0, false);
      row.push(G.vert(x, r * Math.sin(b), r * Math.cos(b), col, i / RINGS, FIN.BODY, Z3));
    }
    grid.push(row);
  }
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < SEGS; j++) { const j2 = (j + 1) % SEGS; G.quad(grid[i][j], grid[i][j2], grid[i + 1][j2], grid[i + 1][j]); }
  /* the four horseshoe gonads that make a moon jelly recognisable */
  for (let k = 0; k < 4; k++) {
    const b = (k / 4) * TAU + 0.4, col = [0.80, 0.64, 1.0, 0.75, 1.6];
    const ring = [];
    for (let j = 0; j <= 12; j++) {
      const a2 = (j / 12) * Math.PI * 1.5 - 0.75, cr = 0.19, rr2 = 0.055;
      ring.push(G.vert(0.30, Math.cos(b) * cr + Math.cos(a2) * rr2 * Math.cos(b) - Math.sin(a2) * rr2 * Math.sin(b),
                       Math.sin(b) * cr + Math.cos(a2) * rr2 * Math.sin(b) + Math.sin(a2) * rr2 * Math.cos(b),
                       col, 0.6, FIN.BODY, Z3));
    }
    for (let j = 0; j < 12; j++) G.tri(ring[j], ring[j + 1], ring[0]);
  }
  /* oral arms and tentacle fringe */
  for (let k = 0; k < 4; k++) {
    const b = (k / 4) * TAU + 0.78, col = [0.88, 0.96, 1.0, 0.5, 1.0], A = [], Bb = [];
    for (let s = 0; s <= 9; s++) {
      const u = s / 9, w = 0.07 * (1 - u * 0.8), x = -0.02 - u * 0.72, rr2 = 0.10 * (1 - u * 0.55);
      A.push(G.vert(x, Math.sin(b) * rr2 + w, Math.cos(b) * rr2, col, 0.7 + u * 0.5, FIN.TENT, Z3));
      Bb.push(G.vert(x, Math.sin(b) * rr2 - w, Math.cos(b) * rr2, col, 0.7 + u * 0.5, FIN.TENT, Z3));
    }
    for (let s = 0; s < 9; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
  }
  for (let k = 0; k < 20; k++) {
    const b = (k / 20) * TAU, col = [0.74, 0.94, 1.0, 0.42, 1.1], A = [], Bb = [];
    const len = 0.34 + (k % 3) * 0.16;
    for (let s = 0; s <= 6; s++) {
      const u = s / 6, x = -0.06 - u * len, rr2 = 0.44 * (1 - u * 0.25);
      A.push(G.vert(x, Math.sin(b) * rr2, Math.cos(b) * rr2 + 0.007, col, 0.8 + u * 0.6, FIN.TENT, Z3));
      Bb.push(G.vert(x, Math.sin(b) * rr2, Math.cos(b) * rr2 - 0.007, col, 0.8 + u * 0.6, FIN.TENT, Z3));
    }
    for (let s = 0; s < 6; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
  }
  const g = G.build(); g.userData.wave = 0; g.userData.jelly = true;
  return g;
}

/* ── mystery snail ───────────────────────────────────────────────────────── */
function buildSnail(sp) {
  const G = new Buf(), STEPS = 52, SEGS = 12, TURNS = 2.5;
  const rows = [];
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS, a = u * TAU * TURNS, coil = 0.42 * Math.pow(u, 0.85);
    const cx = -0.02 + Math.cos(a) * coil * 0.9, cy = 0.16 + Math.sin(a) * coil, cz = (u - 0.5) * 0.16;
    const tube = 0.055 + 0.19 * Math.pow(u, 1.15), row = [];
    for (let j = 0; j < SEGS; j++) {
      const b = (j / SEGS) * TAU;
      const col = patternAt(sp, u, 0.55 + Math.sin(b) * 0.4, 0, false);
      row.push(G.vert(cx + Math.cos(b) * tube * 0.7, cy + Math.sin(b) * tube, cz + Math.cos(b) * tube * 0.9,
                      col, u, FIN.RIGID, Z3));
    }
    rows.push(row);
  }
  for (let s = 0; s < STEPS; s++) for (let j = 0; j < SEGS; j++) {
    const j2 = (j + 1) % SEGS; G.quad(rows[s][j], rows[s][j2], rows[s + 1][j2], rows[s + 1][j]);
  }
  const fc = [0.95, 0.89, 0.74, 1, 0], fr = [];
  for (let s = 0; s <= 9; s++) {
    const u = s / 9, row = [];
    for (let j = 0; j <= 6; j++) {
      const v = j / 6 - 0.5;
      row.push(G.vert(0.34 - u * 0.7, -0.16 + Math.sin(Math.PI * u) * 0.05,
        v * 0.21 * Math.sin(Math.PI * clamp(u * 0.9 + 0.08, 0, 1)), fc, u, FIN.BODY, Z3));
    }
    fr.push(row);
  }
  for (let s = 0; s < 9; s++) for (let j = 0; j < 6; j++) G.quad(fr[s][j], fr[s][j + 1], fr[s + 1][j + 1], fr[s + 1][j]);
  for (const side of [1, -1]) {
    const A = [], Bb = [];
    for (let s = 0; s <= 5; s++) {
      const u = s / 5;
      A.push(G.vert(0.34 + u * 0.17, -0.10 + u * 0.17, side * 0.055 + 0.007, fc, u, FIN.TENT, Z3));
      Bb.push(G.vert(0.34 + u * 0.17, -0.10 + u * 0.17, side * 0.055 - 0.007, fc, u, FIN.TENT, Z3));
    }
    for (let s = 0; s < 5; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
    ball(G, 0.51, 0.07, side * 0.055, 0.018, [0.04, 0.03, 0.03, 1, 0], 0.9, FIN.TENT, 4, 6);
  }
  const g = G.build(); g.userData.wave = 0; g.userData.upright = true;
  return g;
}

/* ── shrimp (cherry and cleaner both) ────────────────────────────────────── */
function buildShrimp(sp) {
  const G = new Buf(), STEPS = 16, SEGS = 11;
  const rows = [];
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS, bend = Math.pow(u, 1.7) * 0.26;
    const cx = 0.46 - u * 0.92, cy = -0.02 + bend;
    const r = 0.115 * Math.pow(Math.sin(Math.PI * clamp(u * 0.86 + 0.09, 0, 1)), 0.42) * (1 - u * 0.25);
    const row = [];
    for (let j = 0; j < SEGS; j++) {
      const b = (j / SEGS) * TAU;
      const col = patternAt(sp, u, 0.5 + Math.sin(b) * 0.45, 0, false);
      const seg = Math.abs(Math.sin(u * 24)) > 0.78 ? 0.86 : 1;
      col[0] *= seg; col[1] *= seg; col[2] *= seg;
      row.push(G.vert(cx + Math.cos(b) * r * 0.25, cy + Math.sin(b) * r, Math.cos(b) * r * 0.92, col, u, FIN.BODY, Z3));
    }
    rows.push(row);
  }
  for (let s = 0; s < STEPS; s++) for (let j = 0; j < SEGS; j++) {
    const j2 = (j + 1) % SEGS; G.quad(rows[s][j], rows[s][j2], rows[s + 1][j2], rows[s + 1][j]);
  }
  const tc = [...new THREE.Color(sp.pal.fin).toArray(), 0.75, 0];
  for (const side of [-1, 0, 1]) {
    const A = [], Bb = [];
    for (let s = 0; s <= 4; s++) {
      const u = s / 4;
      A.push(G.vert(-0.46 - u * 0.22, 0.24 + u * 0.06, side * u * 0.11 + 0.009, tc, 1 + u * 0.3, FIN.CAUDAL, Z3));
      Bb.push(G.vert(-0.46 - u * 0.22, 0.24 + u * 0.06, side * u * 0.11 - 0.009, tc, 1 + u * 0.3, FIN.CAUDAL, Z3));
    }
    for (let s = 0; s < 4; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
  }
  const ac = [1, 1, 1, 0.34, 0.3];
  for (const side of [1, -1]) for (const k of [0, 1]) {
    const A = [], Bb = [];
    for (let s = 0; s <= 8; s++) {
      const u = s / 8;
      const x = 0.5 + u * 0.62, y = 0.02 + Math.sin(u * 2.1 + k) * 0.10 * u, z = side * (0.04 + u * 0.16 * (k ? 1.5 : 0.6));
      A.push(G.vert(x, y + 0.005, z, ac, 0.2 + u, FIN.TENT, Z3));
      Bb.push(G.vert(x, y - 0.005, z, ac, 0.2 + u, FIN.TENT, Z3));
    }
    for (let s = 0; s < 8; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
  }
  const lc = [...new THREE.Color(sp.pal.belly).toArray(), 0.9, 0];
  for (let i = 0; i < 5; i++) for (const side of [1, -1]) {
    const u0 = 0.18 + i * 0.11, A = [], Bb = [];
    for (let s = 0; s <= 3; s++) {
      const u = s / 3;
      A.push(G.vert(0.46 - u0 * 0.92 - u * 0.04, -0.10 - u * 0.14, side * (0.06 + u * 0.09) + 0.005, lc, u0, FIN.TENT, Z3));
      Bb.push(G.vert(0.46 - u0 * 0.92 - u * 0.04, -0.10 - u * 0.14, side * (0.06 + u * 0.09) - 0.005, lc, u0, FIN.TENT, Z3));
    }
    for (let s = 0; s < 3; s++) G.quad(A[s], Bb[s], Bb[s + 1], A[s + 1]);
  }
  for (const side of [1, -1]) {
    ball(G, 0.45, 0.05, side * 0.075, 0.030, [0.04, 0.03, 0.03, 1, 0], 0.05, FIN.RIGID, 5, 7);
    ball(G, 0.47, 0.065, side * 0.082, 0.012, [1, 1, 1, 1, 0.6], 0.05, FIN.RIGID, 4, 6);
  }
  const g = G.build(); g.userData.wave = 0.18;
  return g;
}

/* ── seahorse: built upright, because that is the whole point ────────────── */
function buildSeahorse(sp) {
  const G = new Buf(), STEPS = 34, SEGS = 11;
  const spine = [];
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS;
    let x, y, r;
    if (u < 0.16) { const k = u / 0.16; x = 0.08 + k * 0.10; y = 0.52 - k * 0.12; r = 0.055 + k * 0.035; }
    else if (u < 0.30) { const k = (u - 0.16) / 0.14; x = 0.18 - k * 0.16; y = 0.40 - k * 0.10; r = 0.09 + k * 0.03; }
    else if (u < 0.62) { const k = (u - 0.30) / 0.32; x = 0.02 + Math.sin(k * 2.1) * 0.07; y = 0.30 - k * 0.34; r = 0.12 - k * 0.02; }
    else { const k = (u - 0.62) / 0.38, a = k * 4.2;
      x = 0.04 - Math.sin(a) * 0.16 * k; y = -0.04 - k * 0.18 + (1 - Math.cos(a)) * 0.10 * k; r = 0.10 * (1 - k * 0.85); }
    spine.push([x, y, r, u]);
  }
  const rows = [];
  for (const [cx, cy, r, u] of spine) {
    const row = [];
    for (let j = 0; j < SEGS; j++) {
      const b = (j / SEGS) * TAU;
      const ridge = 1 + 0.17 * Math.abs(Math.sin(b * 3.5)) * Math.abs(Math.sin(u * 26));
      const col = patternAt(sp, u, 0.5 + Math.sin(b) * 0.45, 0, false);
      row.push(G.vert(cx + Math.cos(b) * r * ridge, cy + Math.sin(b) * r * 0.5 * ridge,
                      Math.cos(b + 1.57) * r * ridge, col, u, u > 0.6 ? FIN.TENT : FIN.BODY, Z3));
    }
    rows.push(row);
  }
  for (let s = 0; s < rows.length - 1; s++) for (let j = 0; j < SEGS; j++) {
    const j2 = (j + 1) % SEGS; G.quad(rows[s][j], rows[s][j2], rows[s + 1][j2], rows[s + 1][j]);
  }
  const sc = patternAt(sp, 0.05, 0.6, 0, false), sr = [];
  for (let s = 0; s <= 6; s++) {
    const u = s / 6, row = [];
    for (let j = 0; j < 8; j++) {
      const b = (j / 8) * TAU, r = 0.045 * (1 - u * 0.45);
      row.push(G.vert(0.17 + u * 0.23, 0.40 - u * 0.03 + Math.sin(b) * r, Math.cos(b) * r, sc, 0.04, FIN.RIGID, Z3));
    }
    sr.push(row);
  }
  for (let s = 0; s < 6; s++) for (let j = 0; j < 8; j++) {
    const j2 = (j + 1) % 8; G.quad(sr[s][j], sr[s][j2], sr[s + 1][j2], sr[s + 1][j]);
  }
  for (let k = 0; k < 3; k++) ball(G, 0.07 + k * 0.015, 0.56 + k * 0.014, (k - 1) * 0.03, 0.028, sc, 0.02, FIN.RIGID, 4, 6);
  const dc = patternAt(sp, 0.5, 0.5, 0, true, 0.5, 0.5);
  const da = [], db = [];
  for (let s = 0; s <= 9; s++) {
    const u = s / 9, y = 0.22 - u * 0.26;
    const h = 0.12 * Math.pow(Math.sin(Math.PI * clamp(u * 0.9 + 0.06, 0, 1)), 0.5);
    da.push(G.vert(-0.055 - h, y, 0.011, dc, 0.45, FIN.DORSAL, Z3));
    db.push(G.vert(-0.055 - h, y, -0.011, dc, 0.45, FIN.DORSAL, Z3));
  }
  for (let s = 0; s < 9; s++) G.quad(da[s], db[s], db[s + 1], da[s + 1]);
  for (const side of [1, -1]) {
    ball(G, 0.12, 0.44, side * 0.062, 0.034, [0.9, 0.86, 0.76, 1, 0], 0.05, FIN.RIGID, 5, 7);
    ball(G, 0.135, 0.445, side * 0.072, 0.018, [0.04, 0.03, 0.02, 1, 0], 0.05, FIN.RIGID, 4, 6);
    ball(G, 0.145, 0.455, side * 0.078, 0.008, [1, 1, 1, 1, 0.7], 0.05, FIN.RIGID, 3, 5);
  }
  const g = G.build(); g.userData.wave = 0; g.userData.upright = true; g.userData.seahorse = true;
  return g;
}
