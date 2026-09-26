import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { BI, NB } from './rig.js';

// Pose = Float32Array: 3 euler channels per bone, then pelvis position offset (x,y,z).
export const NCH = NB * 3 + 3;
export const PX = NB * 3;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a) => { a = clamp(a, 0, 1); return a * a * (3 - 2 * a); };

// Piecewise smoothstep keyframes: keys = [[u,v], ...] sorted by u.
export function kf(u, keys) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (u < b[0]) return a[1] + (b[1] - a[1]) * smooth((u - a[0]) / (b[0] - a[0]));
  }
  return keys[keys.length - 1][1];
}

const bi3 = (n) => BI[n] * 3;
function R(P, n, x, y, z) { const i = bi3(n); P[i] = x; P[i + 1] = y; P[i + 2] = z; }
function A(P, n, x, y, z) { const i = bi3(n); P[i] += x; P[i + 1] += y; P[i + 2] += z; }
// Side-mirrored: y/z negated for the right side so values read the same for both.
function RS(P, n, s, x, y, z) { const k = s === 'L' ? 1 : -1; R(P, n + s, x, y * k, z * k); }
function AS(P, n, s, x, y, z) { const k = s === 'L' ? 1 : -1; A(P, n + s, x, y * k, z * k); }
const pel = (P, x, y, z) => { P[PX] = x; P[PX + 1] = y; P[PX + 2] = z; };

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

// Analytic two-bone leg IK. Foot target in root space (ankle point), pitch = world foot pitch (+ = toe down).
export function legIK(P, ctx, side, fx, fy, fz, pitch = 0) {
  const D = ctx.D, s = side === 'L' ? 1 : -1;
  _e.set(P[0], P[1], P[2], 'YXZ');
  _q.setFromEuler(_e).invert();
  _v.set(fx - P[PX], fy - (D.pelvisY + P[PX + 1]), fz - P[PX + 2]).applyQuaternion(_q);
  const vx = _v.x - s * D.hipX, vy = _v.y - D.hipY, vz = _v.z;
  const a = D.thigh, b = D.shin;
  const d = clamp(Math.hypot(vx, vy, vz), Math.abs(a - b) + 0.02, (a + b) * 0.9995);
  const h2 = Math.hypot(vx, vy);
  const rz = Math.atan2(vx, -vy);
  const phi = Math.atan2(vz, h2);
  const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const beta = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const tx = -(phi + alpha), kx = Math.PI - beta;
  R(P, 'thigh' + side, tx, 0, rz);
  R(P, 'shin' + side, kx, 0, 0);
  R(P, 'foot' + side, pitch - (P[0] + tx + kx), 0, -rz - P[2]);
}

// Highest pelvis offset that keeps both feet reachable.
function reachCap(ctx, fl, fr, px, pz) {
  const D = ctx.D, L = D.leg * 0.985;
  let cap = 1;
  for (const [f, s] of [[fl, 1], [fr, -1]]) {
    const dx = f[0] - (px + s * D.hipX), dz = f[2] - pz;
    const h = Math.sqrt(Math.max(0.01, L * L - dx * dx - dz * dz));
    cap = Math.min(cap, f[1] + h - D.hipY - D.pelvisY);
  }
  return cap;
}

function stanceX(ctx) { return ctx.D.hipX * (ctx.style.stance || 1); }

function plant(P, ctx, zl = 0.03, zr = -0.03, wide = 1, pl = 0, pr = 0) {
  const x = stanceX(ctx) * wide, y = ctx.D.ankle;
  legIK(P, ctx, 'L', x, y, zl, pl);
  legIK(P, ctx, 'R', -x, y, zr, pr);
}

function restArms(P, ctx) {
  const h = ctx.style.heavy || 0;
  for (const s of ['L', 'R']) {
    RS(P, 'upArm', s, 0.04, 0.05, 0.07 + h * 0.18);
    RS(P, 'foreArm', s, -0.16, 0, 0);
    RS(P, 'hand', s, -0.06, 0, 0.04);
  }
}

// ---------- base loops ----------
export function idle(P, ctx, t) {
  const st = ctx.st, h = ctx.style.heavy || 0, sc = ctx.D.leg / 0.86;
  const br = Math.sin(t * 1.7), sw = Math.sin(t * 0.45);
  pel(P, sw * 0.012, (-0.012 - h * 0.03 + br * 0.003) * sc, 0);
  R(P, 'pelvis', 0.02 * h, 0, sw * 0.015);
  R(P, 'spine', 0.02 + br * 0.008, 0, -sw * 0.01);
  R(P, 'chest', -0.03 + br * 0.018, 0, -sw * 0.008);
  for (const s of ['L', 'R']) RS(P, 'clav', s, 0, 0, br * 0.02);
  R(P, 'neck', 0.04 + st.gp * 0.3, st.gy * 0.35, 0);
  R(P, 'head', -0.02 + st.gp * 0.7, st.gy * 0.65, st.tilt);
  restArms(P, ctx);
  AS(P, 'hand', 'R', st.twitch, 0, 0);
  plant(P, ctx, 0.04, -0.04, 1);
}

export function gait(P, ctx) {
  const m = ctx.move, D = ctx.D, L = D.leg, st = ctx.style, g = m.g;
  const jank = st.jank || 0, heavy = st.heavy || 0;
  const duty = lerp(0.6, 0.34, g);
  const lift = L * lerp(0.11, 0.3, g);
  const armA = lerp(0.32, 0.8, g) * (st.arm || 1);
  const elbow = lerp(-0.28, -1.5, g);
  const lean = lerp(0.03, 0.17, g) + heavy * 0.06;
  const crouch = L * (lerp(0.015, 0.07, g) + heavy * 0.03);
  const yaw = lerp(0.1, 0.17, g);
  const sway = lerp(0.024, 0.012, g) * (1 + heavy);
  const d = m.stride, ph = m.phase;
  const fx = stanceX(ctx) * (1 - 0.22 * (st.elegance || 0)) + heavy * 0.02;
  const feet = {};
  for (const s of ['L', 'R']) {
    const off = s === 'L' ? 0 : 0.5 - jank * 0.05;
    const p = (ph + off) % 1;
    let z, y = D.ankle, pitch;
    const lf = s === 'L' ? 1 - jank * 0.45 : 1;
    if (p < duty) {
      const u = p / duty, hl = smooth((u - 0.68) / 0.32);
      z = d / 2 - d * u;
      y += hl * L * lerp(0.05, 0.09, g);
      pitch = hl * lerp(0.55, 0.9, g) - lerp(0.25, 0.1, g) * clamp(1 - u / 0.14, 0, 1);
    } else {
      const u = (p - duty) / (1 - duty);
      // Hermite: leaves and lands with ground-matched velocity, so the foot plants cleanly
      const mt = -d * (1 - duty) / duty, u2 = u * u, u3 = u2 * u;
      z = (2 * u3 - 3 * u2 + 1) * (-d / 2) + (u3 - 2 * u2 + u) * mt + (-2 * u3 + 3 * u2) * (d / 2) + (u3 - u2) * mt;
      y += lift * lf * Math.pow(Math.sin(Math.PI * Math.pow(u, lerp(1, 0.7, g))), 1.2);
      y += L * lerp(0.05, 0.09, g) * (1 - smooth(u / 0.3));
      pitch = lerp(lerp(0.55, 0.9, g), -lerp(0.25, 0.1, g), smooth(u));
    }
    feet[s] = [s === 'L' ? fx : -fx, y, z, pitch];
  }
  const zl = d > 1e-4 ? clamp(feet.L[2] / (d / 2), -1, 1) : 0;
  const zr = d > 1e-4 ? clamp(feet.R[2] / (d / 2), -1, 1) : 0;
  const s2 = Math.sin(TAU * ph);
  const px = sway * s2;
  let py = -crouch - L * lerp(0.0, 0.035, g) * Math.cos(TAU * 2 * ph + (g > 0.5 ? 0 : Math.PI));
  py = Math.min(py, reachCap(ctx, feet.L, feet.R, px, 0));
  pel(P, px, py, 0);
  R(P, 'pelvis', lean * 0.45, -yaw * zl, 0.035 * s2 * (1 + jank * 1.5));
  R(P, 'spine', lean * 0.35, yaw * 0.6 * zl, -0.02 * s2);
  R(P, 'chest', lean * 0.25 - 0.02, yaw * 0.8 * zl, -0.015 * s2);
  R(P, 'neck', -lean * 0.4, -yaw * 0.3 * zl, 0);
  R(P, 'head', -lean * 0.5 + ctx.st.gp * 0.3, -yaw * 0.3 * zl + ctx.st.gy * 0.3, ctx.st.tilt);
  for (const s of ['L', 'R']) {
    const other = s === 'L' ? zr : zl;
    const k = s === 'R' ? 1 - jank * 0.6 : 1;
    const fwd = -armA * other * k;
    RS(P, 'clav', s, 0, -0.08 * other * g, 0);
    RS(P, 'upArm', s, fwd - 0.04 * g, 0.08, 0.1 + heavy * 0.2 + 0.05 * g);
    RS(P, 'foreArm', s, elbow - Math.max(0, -fwd) * 0.5 - jank * (s === 'R' ? 0.4 : 0), 0, 0);
    RS(P, 'hand', s, -0.1, 0, 0.05);
  }
  for (const s of ['L', 'R']) legIK(P, ctx, s, feet[s][0], feet[s][1], feet[s][2], feet[s][3]);
}

export function talk(P, ctx, t) {
  idle(P, ctx, t);
  const a = Math.sin(t * 1.3), b = Math.sin(t * 2.1 + 1), c = Math.max(0, Math.sin(t * 0.7));
  RS(P, 'upArm', 'R', -0.45 - 0.2 * a, 0.2, 0.2 + 0.1 * b);
  RS(P, 'foreArm', 'R', -1.3 - 0.25 * b, 0, 0);
  RS(P, 'hand', 'R', 0.2, -0.9 - 0.3 * a, 0.2);
  RS(P, 'upArm', 'L', -0.15 - 0.35 * c, 0.1, 0.12 + 0.15 * c);
  RS(P, 'foreArm', 'L', -0.4 - 0.9 * c, 0, 0);
  RS(P, 'hand', 'L', 0, -0.7 * c, 0);
  A(P, 'head', 0.06 * Math.sin(t * 3.1) * c, 0.12 * a, 0.05 * b);
  A(P, 'chest', 0.02 * b, 0.06 * a, 0);
}

export function sit(P, ctx, t) {
  const D = ctx.D, br = Math.sin(t * 1.6);
  const seat = D.shin + D.ankle - D.hipY + 0.02;
  pel(P, 0, seat - D.pelvisY, -0.02);
  R(P, 'pelvis', -0.08, 0, 0);
  R(P, 'spine', 0.1 + br * 0.008, 0, 0);
  R(P, 'chest', 0.04 + br * 0.015, 0, 0);
  R(P, 'neck', 0.05 + ctx.st.gp * 0.3, ctx.st.gy * 0.35, 0);
  R(P, 'head', ctx.st.gp * 0.6, ctx.st.gy * 0.6, ctx.st.tilt);
  for (const s of ['L', 'R']) {
    RS(P, 'thigh', s, -1.45, 0, 0.06);
    RS(P, 'shin', s, 1.42, 0, 0);
    RS(P, 'foot', s, 0.06, 0, -0.06);
    RS(P, 'upArm', s, -0.38, 0.1, 0.06);
    RS(P, 'foreArm', s, -0.95, 0, 0);
    RS(P, 'hand', s, 0.2, 0, 0.1);
    RS(P, 'clav', s, 0, 0, br * 0.02);
  }
}

// ---------- one-shot actions: fn(P, u 0..1, ctx) ----------
function lookFwd(P, k = 0.85) {
  const y = P[bi3('pelvis') + 1] + P[bi3('spine') + 1] + P[bi3('chest') + 1];
  P[bi3('neck') + 1] -= y * k * 0.4;
  P[bi3('head') + 1] -= y * k * 0.6;
}

function punch(P, u, ctx) {
  const sc = ctx.D.leg / 0.86, h = ctx.style.heavy || 0;
  pel(P, 0, kf(u, [[0, -0.02], [0.3, -0.07], [0.45, -0.1], [1, -0.02]]) * sc, kf(u, [[0, 0], [0.3, -0.04], [0.45, 0.1], [0.72, 0.08], [1, 0]]) * sc);
  R(P, 'pelvis', 0.04, kf(u, [[0, 0], [0.3, -0.25], [0.45, 0.28], [0.75, 0.2], [1, 0]]), 0);
  R(P, 'spine', kf(u, [[0, 0.02], [0.45, 0.12], [1, 0.02]]), kf(u, [[0, 0], [0.3, -0.25], [0.45, 0.3], [0.75, 0.2], [1, 0]]), 0);
  R(P, 'chest', kf(u, [[0, 0], [0.45, 0.08], [1, 0]]), kf(u, [[0, 0], [0.3, -0.3], [0.45, 0.35], [0.75, 0.22], [1, 0]]), 0);
  lookFwd(P);
  RS(P, 'upArm', 'R', kf(u, [[0, -0.2], [0.3, 0.35], [0.45, -1.55], [0.72, -1.45], [1, -0.05]]), 0, kf(u, [[0, 0.1], [0.3, 0.3], [0.45, 0.02], [1, 0.1]]));
  RS(P, 'foreArm', 'R', kf(u, [[0, -0.5], [0.3, -2.1], [0.45, -0.05], [0.72, -0.2], [1, -0.2]]), 0, 0);
  RS(P, 'hand', 'R', 0, 0, 0);
  RS(P, 'upArm', 'L', kf(u, [[0, -0.2], [0.2, -0.65], [0.8, -0.65], [1, -0.05]]), 0.2, 0.25 + h * 0.2);
  RS(P, 'foreArm', 'L', kf(u, [[0, -0.5], [0.2, -2.0], [0.8, -2.0], [1, -0.2]]), 0, 0);
  plant(P, ctx, 0.16, -0.16, 1.2, 0, 0.2);
}

function slash(P, u, ctx) {
  const sc = ctx.D.leg / 0.86;
  pel(P, 0, kf(u, [[0, -0.02], [0.3, -0.08], [0.5, -0.12], [1, -0.02]]) * sc, kf(u, [[0, 0], [0.5, 0.12], [1, 0]]) * sc);
  const tw = kf(u, [[0, 0], [0.3, -0.5], [0.5, 0.55], [0.75, 0.45], [1, 0]]);
  R(P, 'pelvis', 0.05, tw * 0.4, 0);
  R(P, 'spine', 0.08, tw * 0.3, 0);
  R(P, 'chest', 0.06, tw * 0.4, 0);
  lookFwd(P);
  RS(P, 'upArm', 'R', kf(u, [[0, -0.2], [0.3, -1.3], [0.5, -1.4], [0.75, -0.9], [1, -0.05]]), kf(u, [[0, 0], [0.3, 0.9], [0.5, -0.9], [0.75, -0.9], [1, 0]]), kf(u, [[0, 0.1], [0.3, 0.9], [0.5, 0.3], [1, 0.1]]));
  RS(P, 'foreArm', 'R', kf(u, [[0, -0.3], [0.3, -1.6], [0.5, -0.1], [1, -0.2]]), 0, 0);
  RS(P, 'hand', 'R', 0, kf(u, [[0.3, 0.6], [0.5, -0.4], [1, 0]]), 0);
  RS(P, 'upArm', 'L', -0.3, 0.2, kf(u, [[0, 0.1], [0.5, 0.7], [1, 0.1]]));
  RS(P, 'foreArm', 'L', -0.6, 0, 0);
  plant(P, ctx, 0.2, -0.18, 1.3, 0, 0.25);
}

function heavy(P, u, ctx) {
  const sc = ctx.D.leg / 0.86;
  pel(P, 0, kf(u, [[0, -0.02], [0.2, -0.06], [0.42, 0.01], [0.56, -0.2], [0.8, -0.18], [1, -0.02]]) * sc, kf(u, [[0, 0], [0.42, -0.05], [0.56, 0.12], [1, 0]]) * sc);
  R(P, 'pelvis', kf(u, [[0, 0], [0.42, -0.1], [0.56, 0.35], [0.85, 0.3], [1, 0]]), 0, 0);
  R(P, 'spine', kf(u, [[0, 0], [0.42, -0.2], [0.56, 0.35], [0.85, 0.3], [1, 0]]), 0, 0);
  R(P, 'chest', kf(u, [[0, 0], [0.42, -0.25], [0.56, 0.3], [0.85, 0.25], [1, 0]]), 0, 0);
  R(P, 'neck', kf(u, [[0, 0], [0.42, 0.2], [0.56, -0.35], [1, 0]]), 0, 0);
  R(P, 'head', kf(u, [[0, 0], [0.42, 0.2], [0.56, -0.4], [1, 0]]), 0, 0);
  for (const s of ['L', 'R']) {
    RS(P, 'clav', s, 0, 0, kf(u, [[0, 0], [0.42, 0.25], [0.56, -0.1], [1, 0]]));
    RS(P, 'upArm', s, kf(u, [[0, -0.1], [0.42, -2.9], [0.56, -1.0], [0.85, -0.95], [1, -0.05]]), 0, kf(u, [[0, 0.1], [0.42, 0.25], [0.56, 0.02], [1, 0.1]]));
    RS(P, 'foreArm', s, kf(u, [[0, -0.2], [0.42, -0.9], [0.56, -0.15], [1, -0.2]]), 0, 0);
  }
  plant(P, ctx, 0.12, -0.12, 1.45);
}

function shoot(P, u, ctx) {
  const k = kf(u, [[0, 0], [0.12, 1], [0.3, 0.35], [1, 0]]);
  const up = kf(u, [[0, 0], [0.08, 1], [0.8, 1], [1, 0]]);
  pel(P, 0, -0.03, -0.02 * k);
  R(P, 'pelvis', 0, 0.15 * up, 0);
  R(P, 'spine', -0.03 * k, 0.1 * up, 0);
  R(P, 'chest', -0.06 * k, 0.12 * up, 0);
  lookFwd(P, 1);
  restArms(P, ctx);
  RS(P, 'clav', 'R', 0, -0.15 * up, 0.05 * up);
  RS(P, 'upArm', 'R', lerp(0.04, -1.52, up) + 0.28 * k, lerp(0.05, -0.2, up), lerp(0.07, 0.12, up));
  RS(P, 'foreArm', 'R', lerp(-0.16, -0.05, up) - 0.35 * k, 0, 0);
  RS(P, 'hand', 'R', 0.05 * up, 0, 0);
  RS(P, 'upArm', 'L', -0.25 * up, 0.1, 0.12);
  RS(P, 'foreArm', 'L', -0.7 * up, 0, 0);
  plant(P, ctx, 0.12, -0.1, 1.15);
}

function cast(P, u, ctx) {
  const sc = ctx.D.leg / 0.86;
  pel(P, 0, kf(u, [[0, -0.02], [0.4, 0.0], [0.55, -0.09], [1, -0.02]]) * sc, kf(u, [[0, 0], [0.55, 0.06], [1, 0]]));
  R(P, 'spine', kf(u, [[0, 0], [0.4, -0.15], [0.55, 0.12], [1, 0]]), 0, 0);
  R(P, 'chest', kf(u, [[0, 0], [0.4, -0.2], [0.55, 0.1], [1, 0]]), 0, 0);
  R(P, 'head', kf(u, [[0, 0], [0.4, -0.25], [0.55, 0.05], [1, 0]]), 0, 0);
  for (const s of ['L', 'R']) {
    RS(P, 'clav', s, 0, 0, kf(u, [[0, 0], [0.4, 0.2], [0.55, 0], [1, 0]]));
    RS(P, 'upArm', s, kf(u, [[0, 0], [0.4, -2.2], [0.55, -1.45], [0.85, -1.35], [1, 0]]), kf(u, [[0, 0], [0.55, -0.3], [1, 0]]), kf(u, [[0, 0.07], [0.4, 0.55], [0.55, 0.12], [1, 0.07]]));
    RS(P, 'foreArm', s, kf(u, [[0, -0.15], [0.4, -0.7], [0.55, -0.08], [1, -0.15]]), 0, 0);
    RS(P, 'hand', s, kf(u, [[0, 0], [0.55, -1.1], [0.85, -1.0], [1, 0]]), 0, 0);
  }
  plant(P, ctx, 0.1, -0.12, 1.2);
}

function roll(P, u, ctx) {
  const D = ctx.D, sc = D.leg / 0.86;
  const tuck = kf(u, [[0, 0], [0.18, 1], [0.78, 1], [1, 0]]);
  const spin = smooth((u - 0.12) / 0.7) * TAU;
  pel(P, 0, kf(u, [[0, -0.03], [0.18, -0.45], [0.5, -0.5], [0.8, -0.35], [1, -0.02]]) * sc, 0);
  R(P, 'pelvis', spin > Math.PI ? spin - TAU : spin, 0, 0);
  R(P, 'spine', 0.55 * tuck, 0, 0);
  R(P, 'chest', 0.45 * tuck, 0, 0);
  R(P, 'neck', 0.4 * tuck, 0, 0);
  R(P, 'head', 0.3 * tuck, 0, 0);
  for (const s of ['L', 'R']) {
    RS(P, 'upArm', s, -1.1 * tuck, 0, 0.1 + 0.25 * tuck);
    RS(P, 'foreArm', s, -0.2 - 1.6 * tuck, 0, 0);
  }
  if (tuck < 1) {
    const T = new Float32Array(NCH); T.set(P);
    plant(T, ctx, 0.12, -0.2, 1.1);
    for (const s of ['L', 'R']) for (const b of ['thigh', 'shin', 'foot']) {
      const i = bi3(b + s);
      for (let c = 0; c < 3; c++) P[i + c] = T[i + c] * (1 - tuck);
    }
  }
  for (const s of ['L', 'R']) {
    AS(P, 'thigh', s, -2.1 * tuck, 0, 0.1 * tuck);
    AS(P, 'shin', s, 2.3 * tuck, 0, 0);
    AS(P, 'foot', s, 0.4 * tuck, 0, 0);
  }
}

function dash(P, u, ctx) {
  const sc = ctx.D.leg / 0.86, k = kf(u, [[0, 0], [0.2, 1], [0.75, 1], [1, 0]]);
  pel(P, 0, -0.14 * k * sc, 0.08 * k);
  R(P, 'pelvis', 0.35 * k, 0.25 * k, 0);
  R(P, 'spine', 0.2 * k, 0.15 * k, 0);
  R(P, 'chest', 0.1 * k, 0.2 * k, 0);
  lookFwd(P, 1);
  for (const s of ['L', 'R']) {
    RS(P, 'upArm', s, -0.9 * k, 0.4 * k, 0.1 + 0.3 * k);
    RS(P, 'foreArm', s, -1.9 * k, 0, 0);
  }
  plant(P, ctx, 0.3 * k + 0.03, -0.35 * k - 0.03, 1.3, 0, 0.5 * k);
}

function hit(P, u, ctx) {
  const k = kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
  idle(P, ctx, ctx.t);
  A(P, 'pelvis', -0.05 * k, 0.1 * k * d, 0);
  P[PX + 2] = -0.05 * k; P[PX + 1] -= 0.03 * k;
  A(P, 'spine', -0.15 * k, 0.1 * k * d, 0.05 * k * d);
  A(P, 'chest', -0.2 * k, 0.15 * k * d, 0.05 * k * d);
  A(P, 'neck', -0.2 * k, 0, 0);
  A(P, 'head', -0.3 * k, -0.25 * k * d, 0.2 * k * d);
  for (const s of ['L', 'R']) { AS(P, 'upArm', s, -0.3 * k, 0, 0.4 * k); AS(P, 'foreArm', s, -0.5 * k, 0, 0); }
  plant(P, ctx, 0.05, -0.08, 1.1);
}

function die(P, u, ctx) {
  const D = ctx.D, sc = D.leg / 0.86;
  const knee = D.thigh + 0.05 - D.hipY - D.pelvisY;   // pelvis offset when kneeling
  const prone = 0.13 * sc - D.pelvisY;
  const drop = kf(u, [[0, -0.02], [0.22, -0.12 * sc], [0.45, knee], [0.55, knee], [0.8, prone + 0.04], [0.88, prone + 0.02], [0.94, prone + 0.05], [1, prone]]);
  const fall = kf(u, [[0, 0], [0.45, 0.12], [0.55, 0.2], [0.82, Math.PI / 2 - 0.02], [0.9, Math.PI / 2 - 0.1], [1, Math.PI / 2 - 0.04]]);
  pel(P, 0, drop, kf(u, [[0, 0], [0.5, 0.05], [0.85, D.thigh * 0.8], [1, D.thigh * 0.8]]));
  R(P, 'pelvis', fall, kf(u, [[0, 0], [0.4, 0.1], [1, 0.2]]), 0);
  R(P, 'spine', kf(u, [[0, 0], [0.22, 0.2], [0.8, 0.05], [1, 0]]), 0, 0);
  R(P, 'chest', kf(u, [[0, 0], [0.22, 0.25], [0.8, 0.0], [1, 0]]), 0, kf(u, [[0.5, 0], [1, 0.1]]));
  R(P, 'neck', kf(u, [[0, 0], [0.2, 0.4], [0.8, 0.1], [1, -0.2]]), kf(u, [[0.6, 0], [1, 0.5]]), 0);
  R(P, 'head', kf(u, [[0, 0], [0.15, 0.6], [0.8, 0.2], [1, -0.1]]), kf(u, [[0.6, 0], [1, 0.8]]), 0);
  for (const s of ['L', 'R']) {
    const k = s === 'L' ? 1 : 1.3;
    RS(P, 'clav', s, 0, 0, kf(u, [[0, 0], [0.2, -0.1], [1, -0.05]]));
    RS(P, 'upArm', s, kf(u, [[0, 0], [0.45, 0.1], [0.65, -0.6 * k], [0.85, 0.1], [1, 0.15]]), 0, kf(u, [[0, 0.07], [0.3, 0.02], [0.85, 0.2], [1, 0.25 * k]]));
    RS(P, 'foreArm', s, kf(u, [[0, -0.15], [0.3, -0.05], [0.65, -0.8], [0.85, -0.2], [1, -0.3]]), 0, 0);
    RS(P, 'hand', s, 0.3, 0, 0);
  }
  const fk = smooth((u - 0.22) / 0.2);
  if (fk < 1) plant(P, ctx, 0.04, -0.04, 1.05);
  const T = new Float32Array(NCH);
  for (const s of ['L', 'R']) {
    const lie = kf(u, [[0.5, 0], [0.82, 1]]);
    RS(T, 'thigh', s, lerp(-0.1, 0.1, lie) - fall * (1 - lie) * 0.9, 0, 0.05 + 0.08 * lie);
    RS(T, 'shin', s, lerp(Math.PI / 2, s === 'L' ? 0.15 : 0.5, lie), 0, 0);
    RS(T, 'foot', s, lerp(0.5, 0.9, lie), 0, 0);
    for (const b of ['thigh', 'shin', 'foot']) {
      const i = bi3(b + s);
      for (let c = 0; c < 3; c++) P[i + c] = lerp(P[i + c], T[i + c], fk);
    }
  }
}

// ---------- hover rig (drones) ----------
function hoverBase(P, ctx, t) {
  const v = ctx.move.v01;
  pel(P, 0, Math.sin(t * 2.1) * 0.05, 0);
  R(P, 'pelvis', 0.32 * v + Math.sin(t * 1.3) * 0.03, 0, Math.sin(t * 0.9) * 0.04);
  R(P, 'head', ctx.st.gp * 0.5 - 0.2 * v, ctx.st.gy * 1.4, 0);
  for (const s of ['L', 'R']) RS(P, 'upArm', s, -0.3 * v, 0, 0);
}

const H = {
  idle: (P, ctx, t) => hoverBase(P, ctx, t),
  talk: (P, ctx, t) => { hoverBase(P, ctx, t); A(P, 'head', 0.15 * Math.sin(t * 4), 0, 0); },
  sit: (P, ctx, t) => { hoverBase(P, ctx, t); P[PX + 1] = 0.3 - ctx.D.pelvisY; P[0] = 0; },
  attack_melee: (P, u, ctx) => { hoverBase(P, ctx, ctx.t); P[PX + 2] = kf(u, [[0, 0], [0.3, -0.2], [0.45, 0.7], [1, 0]]); P[0] = kf(u, [[0, 0], [0.3, -0.3], [0.45, 0.6], [1, 0]]); },
  attack_heavy: (P, u, ctx) => {
    hoverBase(P, ctx, ctx.t);
    P[PX + 1] = kf(u, [[0, 0], [0.4, 0.4], [0.6, 0.2], [1, 0]]);
    R(P, 'head', kf(u, [[0, 0], [0.4, 0.7], [0.8, 0.7], [1, 0]]), 0, 0);
    for (const s of ['L', 'R']) RS(P, 'upArm', s, kf(u, [[0, 0], [0.4, 0.5], [0.6, 0.3], [1, 0]]), 0, 0);
  },
  shoot: (P, u, ctx) => {
    hoverBase(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.12, 1], [0.4, 0], [1, 0]]);
    P[0] -= 0.15 * k; P[PX + 2] = -0.08 * k;
    for (const s of ['L', 'R']) RS(P, 'foreArm', s, 0, 0, 0), RS(P, 'upArm', s, 0.2 * k, 0, 0);
  },
  cast: (P, u, ctx) => { hoverBase(P, ctx, ctx.t); P[PX + 1] = kf(u, [[0, 0], [0.5, 0.25], [1, 0]]); R(P, 'head', 0, smooth(u) * TAU, 0); },
  dodge: (P, u, ctx) => { hoverBase(P, ctx, ctx.t); const r = smooth(u) * TAU; P[2] = r > Math.PI ? r - TAU : r; P[PX + 1] = kf(u, [[0, 0], [0.5, -0.2], [1, 0]]); },
  hit: (P, u, ctx) => { hoverBase(P, ctx, ctx.t); const k = kf(u, [[0, 0], [0.12, 1], [1, 0]]); P[0] -= 0.5 * k; P[2] += 0.4 * k * ctx.st.hitDir; P[PX + 2] = -0.15 * k; },
  die: (P, u, ctx) => {
    const g = 0.22 - ctx.D.pelvisY;
    pel(P, kf(u, [[0, 0], [1, 0.3]]), kf(u, [[0, 0], [0.15, 0.15], [0.7, g], [0.8, g + 0.12], [0.9, g], [1, g]]), kf(u, [[0, 0], [1, 0.4]]));
    R(P, 'pelvis', kf(u, [[0, 0], [0.7, 0.5], [1, 0.35]]), kf(u, [[0, 0], [0.7, 1.2]]), kf(u, [[0, 0], [0.7, 0.8], [1, 0.45]]));
    R(P, 'head', kf(u, [[0, 0], [0.5, 0.6], [1, 0.8]]), 0, 0);
    for (const s of ['L', 'R']) RS(P, 'upArm', s, 0.5 * smooth(u), 0, 0.4 * smooth(u));
  },
};


// ---------- quadruped (scrap_rat): FK trot, diagonal pairs ----------
const QLEGS = [['upArm', 'foreArm', 'L', 0], ['upArm', 'foreArm', 'R', 0.5], ['thigh', 'shin', 'L', 0.5], ['thigh', 'shin', 'R', 0]];
function qStance(P, splay = 0.75, bend = -1.1) {
  for (const [u, l, s] of QLEGS) { RS(P, u, s, 0, 0, splay); RS(P, l, s, 0, 0, bend); }
}
function qTail(P, t, k = 1) { R(P, 'aux0', 0.25 + 0.08 * Math.sin(t * 3.1) * k, 0.35 * Math.sin(t * 2.3) * k, 0); }
function qIdle(P, ctx, t) {
  const st = ctx.st;
  qStance(P);
  pel(P, 0, 0.004 * Math.sin(t * 5), 0);
  R(P, 'pelvis', 0, 0.04 * Math.sin(t * 0.8), 0);
  R(P, 'spine', 0, 0.06 * Math.sin(t * 0.8 + 1), 0);
  R(P, 'neck', 0.1 + st.gp + 0.05 * Math.max(0, Math.sin(t * 7)), st.gy * 0.6, 0);
  R(P, 'head', -0.05 + st.gp * 0.5, st.gy * 0.6, 0.1 * st.gy);
  R(P, 'aux1', 0.08 + 0.08 * Math.max(0, Math.sin(t * 11)), 0, 0);
  qTail(P, t);
}
function qTrot(P, ctx, t) {
  const m = ctx.move, L = 0.17;
  const A = Math.min(0.85, Math.atan2(m.stride / 2, L));
  const duty = 0.5;
  qStance(P);
  for (const [u, l, s, off] of QLEGS) {
    const p = (m.phase + off) % 1;
    let rx, lift = 0;
    if (p < duty) rx = -A + 2 * A * (p / duty);
    else { const w = (p - duty) / (1 - duty); rx = A - 2 * A * smooth(w); lift = Math.sin(Math.PI * w); }
    RS(P, u, s, rx, 0, 0.75 + 0.35 * lift);
    RS(P, l, s, 0, 0, -1.1 - 0.5 * lift);
  }
  const b = Math.sin(TAU * 2 * m.phase);
  pel(P, 0, 0.008 * b, 0);
  R(P, 'pelvis', 0.02 * b, 0.05 * Math.sin(TAU * m.phase), 0.03 * Math.sin(TAU * m.phase));
  R(P, 'spine', 0, -0.08 * Math.sin(TAU * m.phase), 0);
  R(P, 'neck', 0.05 - 0.02 * b, ctx.st.gy * 0.3, 0);
  R(P, 'head', 0, 0.06 * Math.sin(TAU * m.phase), 0);
  R(P, 'aux1', 0.06, 0, 0);
  qTail(P, t * 2.5, 1.4);
}
const QA = {
  attack_melee: (P, u, ctx) => {
    qIdle(P, ctx, ctx.t);
    pel(P, 0, kf(u, [[0, 0], [0.35, -0.03], [0.5, 0.02], [1, 0]]), kf(u, [[0, 0], [0.35, -0.05], [0.5, 0.12], [0.75, 0.08], [1, 0]]));
    R(P, 'pelvis', kf(u, [[0, 0], [0.35, -0.12], [0.5, 0.18], [1, 0]]), 0, 0);
    R(P, 'neck', kf(u, [[0, 0.1], [0.35, -0.35], [0.5, 0.35], [1, 0.1]]), 0, 0);
    R(P, 'aux1', kf(u, [[0, 0.1], [0.35, 0.9], [0.5, 0.0], [0.6, 0.5], [0.7, 0.0], [1, 0.1]]), 0, 0);
  },
  attack_heavy: (P, u, ctx) => {
    qIdle(P, ctx, ctx.t);
    const air = kf(u, [[0, 0], [0.25, 0], [0.45, 1], [0.6, 1], [0.7, 0], [1, 0]]);
    pel(P, 0, kf(u, [[0, 0], [0.25, -0.05], [0.45, 0.18], [0.62, 0.05], [0.7, 0], [1, 0]]), kf(u, [[0, 0], [0.25, -0.06], [0.62, 0.35], [1, 0.3]]));
    R(P, 'pelvis', kf(u, [[0, 0], [0.25, -0.2], [0.45, -0.35], [0.62, 0.3], [0.8, 0], [1, 0]]), 0, 0);
    R(P, 'aux1', kf(u, [[0, 0.1], [0.4, 1.0], [0.62, 0], [1, 0.1]]), 0, 0);
    for (const [a, l, s] of QLEGS) { AS(P, a, s, (a === 'upArm' ? -0.8 : 0.8) * air, 0, -0.3 * air); AS(P, l, s, 0, 0, 0.6 * air); }
  },
  dodge: (P, u, ctx) => {
    qIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.4, 1], [1, 0]]);
    pel(P, 0, 0.1 * k, 0);
    R(P, 'pelvis', 0, 0, kf(u, [[0, 0], [0.5, 0.5], [1, 0]]));
    for (const [a, l, s] of QLEGS) AS(P, a, s, 0, 0, 0.5 * k);
  },
  hit: (P, u, ctx) => {
    qIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.15, 1], [1, 0]]);
    pel(P, 0, 0.03 * k, -0.06 * k);
    R(P, 'pelvis', -0.3 * k, 0.3 * k * ctx.st.hitDir, 0.2 * k * ctx.st.hitDir);
    R(P, 'aux1', 0.8 * k, 0, 0);
    for (const [a, l, s] of QLEGS) AS(P, a, s, 0, 0, 0.4 * k);
  },
  die: (P, u, ctx) => {
    const flip = kf(u, [[0, 0], [0.15, 0.3], [0.45, Math.PI], [0.55, Math.PI - 0.2], [0.65, Math.PI], [1, Math.PI]]);
    const curl = kf(u, [[0, 0], [0.4, 0.6], [0.7, 1], [0.8, 0.8], [0.85, 1], [1, 1]]);
    qStance(P, lerp(0.75, 0.1, curl), lerp(-1.1, -1.9, curl));
    pel(P, 0, kf(u, [[0, 0], [0.2, 0.08], [0.45, -0.08], [1, -0.085]]), 0);
    R(P, 'pelvis', 0, 0, flip);
    R(P, 'neck', 0.4 * curl, 0, 0);
    R(P, 'aux1', 0.9 * curl, 0, 0);
    R(P, 'aux0', -0.3 * curl, 0, 0);
    if (u > 0.7) for (const [a, l, s] of QLEGS) AS(P, l, s, 0, 0, 0.25 * Math.sin(u * 60 + (s === 'L' ? 0 : 2)) * (1 - u) * 3);
  },
};
QA.shoot = QA.attack_melee; QA.cast = QA.attack_melee;
function quadBase(name, P, ctx, t) {
  if (name === 'sit') { qStance(P, 1.1, -1.6); pel(P, 0, -0.05, 0); qTail(P, t * 0.5); return; }
  const w = smooth((ctx.move.v - 0.05) / 0.4);
  if (w <= 0.001) return qIdle(P, ctx, t);
  qTrot(P, ctx, t);
  if (w < 0.999) { const T = ctx.tmp; T.fill(0); qIdle(T, ctx, t); for (let i = 0; i < NCH; i++) P[i] = lerp(T[i], P[i], w); }
}

export const ACTIONS = {
  attack_melee: { dur: 0.62, events: { impact: 0.45 }, upper: true },
  attack_heavy: { dur: 1.05, events: { impact: 0.56 } },
  shoot: { dur: 0.42, events: { fire: 0.12 }, upper: true },
  cast: { dur: 0.9, events: { cast: 0.55 }, upper: true },
  dodge: { dur: 0.6, events: {} },
  hit: { dur: 0.38, events: {} },
  die: { dur: 1.8, events: { down: 0.8 }, hold: true },
};
export const LOOPS = ['idle', 'walk', 'run', 'talk', 'sit'];

// Weapon held at low-ready in the right hand (gunner).
function carry(P, ctx) {
  const sw = ctx.move.g * Math.sin(TAU * ctx.move.phase) * 0.08;
  RS(P, 'clav', 'R', 0, 0.05, 0);
  RS(P, 'upArm', 'R', -0.42 + sw, 0.3, 0.14);
  RS(P, 'foreArm', 'R', -0.8, 0, 0);
  RS(P, 'hand', 'R', 0.1, 0, -0.1);
}

export function evalBase(name, P, ctx, t) {
  evalBase0(name, P, ctx, t);
  if (ctx.style.carry && !ctx.hover && !ctx.quad && name !== 'sit' && name !== 'talk') carry(P, ctx);
}
function evalBase0(name, P, ctx, t) {
  P.fill(0);
  if (ctx.hover) return (H[name] || H.idle)(P, ctx, t);
  if (ctx.quad) return quadBase(name, P, ctx, t);
  if (name === 'talk') return talk(P, ctx, t);
  if (name === 'sit') return sit(P, ctx, t);
  // locomotion: idle <-> walk/run by current speed
  const w = smooth((ctx.move.v - 0.05) / 0.45);
  if (w <= 0.001) return idle(P, ctx, t);
  gait(P, ctx);
  if (w < 0.999) {
    const T = ctx.tmp; T.fill(0); idle(T, ctx, t);
    for (let i = 0; i < NCH; i++) P[i] = lerp(T[i], P[i], w);
  }
}

export function evalAction(name, P, u, ctx) {
  P.fill(0);
  if (ctx.hover) return H[name](P, u, ctx);
  if (ctx.quad) return QA[name](P, u, ctx);
  const st = ctx.style;
  switch (name) {
    case 'attack_melee': return st.melee === 'slash' ? slash(P, u, ctx) : punch(P, u, ctx);
    case 'attack_heavy': return heavy(P, u, ctx);
    case 'shoot': return shoot(P, u, ctx);
    case 'cast': return cast(P, u, ctx);
    case 'dodge': return st.dodge === 'dash' ? dash(P, u, ctx) : roll(P, u, ctx);
    case 'hit': return hit(P, u, ctx);
    case 'die': return die(P, u, ctx);
  }
}

// Channels that belong to legs/pelvis (kept from locomotion when an upper-body action plays on the move).
export const LOWER = new Uint8Array(NCH);
for (const n of ['pelvis', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']) for (let c = 0; c < 3; c++) LOWER[bi3(n) + c] = 1;
LOWER[PX] = LOWER[PX + 1] = LOWER[PX + 2] = 1;

export const eyeCurve = (u) => kf(u, [[0, 1], [0.08, 0.25], [0.12, 1], [0.2, 0.15], [0.26, 0.8], [0.45, 0.5], [0.5, 0.9], [0.8, 0.25], [1, 0]]);
