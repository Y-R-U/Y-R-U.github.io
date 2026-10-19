import * as THREE from 'three';
import { BI, NB, orderOf } from './rig.js';
import { beastLoop, beastAction } from './anims_beast.js';

// Pose = Float32Array: 3 euler channels per bone, then pelvis offset (x,y,z). Machinery adapted from HEIRFRAME.
export const NCH = NB * 3 + 3;
export const PX = NB * 3;
const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a) => { a = clamp(a, 0, 1); return a * a * (3 - 2 * a); };

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
function RS(P, n, s, x, y, z) { const k = s === 'L' ? 1 : -1; R(P, n + s, x, y * k, z * k); }
function AS(P, n, s, x, y, z) { const k = s === 'L' ? 1 : -1; A(P, n + s, x, y * k, z * k); }
const pel = (P, x, y, z) => { P[PX] = x; P[PX + 1] = y; P[PX + 2] = z; };
const SIDES = ['L', 'R'];

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

// Analytic two-bone biped leg IK (HEIRFRAME). Foot target in root space (ankle point).
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
  const tx = -(phi + alpha), kx = PI - beta;
  R(P, 'thigh' + side, tx, 0, rz);
  R(P, 'shin' + side, kx, 0, 0);
  R(P, 'foot' + side, pitch - (P[0] + tx + kx), 0, -rz - P[2]);
}
// ---- forward kinematics on a pose (root space). ctx.rig = { off, parent }.
const _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fv = new THREE.Vector3();
export function fkBone(P, ctx, name, outP = new THREE.Vector3(), outQ = new THREE.Quaternion()) {
  const rig = ctx.rig, chain = [];
  for (let n = name; n; n = rig.parent[n]) chain.unshift(n);
  outP.set(0, 0, 0); outQ.identity();
  for (const n of chain) {
    const o = rig.off[n];
    _fv.set(o[0], o[1], o[2]);
    if (n === 'pelvis') _fv.set(o[0] + P[PX], o[1] + P[PX + 1], o[2] + P[PX + 2]);
    outP.add(_fv.applyQuaternion(outQ));
    const i = BI[n] * 3;
    _fe.set(P[i], P[i + 1], P[i + 2], orderOf(n));
    outQ.multiply(_fq.setFromEuler(_fe));
  }
  return { p: outP, q: outQ };
}
// point given in `bone`'s local frame -> root space
export function fkPoint(P, ctx, bone, local, out = new THREE.Vector3()) {
  const { p, q } = fkBone(P, ctx, bone, _kp, _kq);
  return out.set(local[0], local[1], local[2]).applyQuaternion(q).add(p);
}
const _kp = new THREE.Vector3(), _kq = new THREE.Quaternion(), _ap = new THREE.Vector3(), _aq = new THREE.Quaternion(), _at = new THREE.Vector3();
// Analytic 2-bone arm IK: puts the `side` hand joint on `target` (root space). Elbow bends forward/down; `out` swings it outward.
export function armIK(P, ctx, side, target, out = 0.25) {
  const D = ctx.D, s = side === 'L' ? 1 : -1;
  const { p, q } = fkBone(P, ctx, 'clav' + side, _ap, _aq);
  // shoulder joint (upArm origin) in clav space is off.upArm; express target in clav space relative to it
  _at.copy(target).sub(p).applyQuaternion(q.clone().invert());
  const o = ctx.rig.off['upArm' + side];
  let vx = _at.x - o[0], vy = _at.y - o[1], vz = -(_at.z - o[2]);
  const a = D.upArm, b = D.foreArm;
  const d = clamp(Math.hypot(vx, vy, vz), Math.abs(a - b) + 0.02, (a + b) * 0.999);
  const rz = Math.atan2(vx, -vy), phi = Math.atan2(vz, Math.hypot(vx, vy));
  const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const beta = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const tx = -(phi + alpha), kx = PI - beta;
  const i = BI['upArm' + side] * 3, f = BI['foreArm' + side] * 3;
  P[i] = -tx; P[i + 1] = 0; P[i + 2] = rz;
  P[f] = -kx; P[f + 1] = s * out; P[f + 2] = 0;
}
// Two-handed weapon: the off hand (default L) grabs `grip`, a point in handR space (e.g. the rifle foregrip).
export function twoHand(P, ctx, grip, side = 'L', out = 0.25) {
  const t = fkPoint(P, ctx, side === 'L' ? 'handR' : 'handL', grip, _tt);
  armIK(P, ctx, side, t, out);
}
const _tt = new THREE.Vector3();

function stanceX(ctx) { return ctx.D.hipX * (ctx.style.stance || 1.15); }
function plant(P, ctx, zl = 0.04, zr = -0.04, wide = 1, pl = 0, pr = 0) {
  const x = stanceX(ctx) * wide, y = ctx.D.ankle;
  legIK(P, ctx, 'L', x, y, zl, pl);
  legIK(P, ctx, 'R', -x, y, zr, pr);
}
const sc = (ctx) => ctx.D.leg / 0.86;

// ---------------- weapon hold poses (biped) ----------------
// k = 0 relaxed, 1 = combat ready / aimed
function hold(P, ctx, k = 0) {
  const w = ctx.style.weapon, br = Math.sin(ctx.t * 1.6) * 0.02;
  switch (w) {
    case 'shield':
      // shield arm: upper arm a little forward + out, forearm forward; shields are authored for exactly this pose (k = 0)
      RS(P, 'upArm', 'L', -0.35 - 0.2 * k + br, 0, 0.3);
      RS(P, 'foreArm', 'L', -1.2, 0, 0);
      RS(P, 'hand', 'L', 0, 0, 0);
      RS(P, 'upArm', 'R', -0.12 + br, 0.0, 0.3);
      RS(P, 'foreArm', 'R', -0.55 - 0.3 * k, 0, 0);
      RS(P, 'hand', 'R', -0.1, 0, 0);
      break;
    case 'rifle': {
      const a = lerp(-0.25, 0, k);
      RS(P, 'clav', 'R', 0, 0.05, 0);
      RS(P, 'upArm', 'R', -0.45 + a * 0.3 + br, 0.3, 0.22);
      RS(P, 'foreArm', 'R', -1.1 + a * 0.7, 0, 0);
      RS(P, 'hand', 'R', 0, 0, 0);
      RS(P, 'clav', 'L', 0, -0.15, 0);
      RS(P, 'upArm', 'L', -0.95 + a * 0.4 + br, 0.65, -0.12);
      RS(P, 'foreArm', 'L', -1.05 + a * 0.4, 0, 0);
      RS(P, 'hand', 'L', 0, 0, 0.2);
      break;
    }
    case 'cannon':
      RS(P, 'upArm', 'R', -0.2 + br, 0.25, 0.3);
      RS(P, 'foreArm', 'R', -1.3 - 0.1 * k, 0, 0);
      RS(P, 'hand', 'R', 0, 0, 0);
      RS(P, 'upArm', 'L', -0.75 + br, 0.7, -0.05);
      RS(P, 'foreArm', 'L', -1.05, 0, 0);
      RS(P, 'hand', 'L', 0, 0, 0.3);
      break;
    case 'blade':
      RS(P, 'upArm', 'R', -0.3 - 0.3 * k + br, 0.1, 0.3);
      RS(P, 'foreArm', 'R', -0.7 - 0.3 * k, 0, 0);
      RS(P, 'hand', 'R', 0.2, 0, 0);
      RS(P, 'upArm', 'L', -0.35 + br, -0.1, 0.32);
      RS(P, 'foreArm', 'L', -1.1, 0, 0);
      RS(P, 'hand', 'L', 0, 0, 0);
      break;
    case 'fists':
      for (const s of SIDES) {
        RS(P, 'upArm', s, -0.45 - 0.2 * k + (s === 'L' ? br : -br), -0.15, 0.42);
        RS(P, 'foreArm', s, -1.35 - 0.2 * k, 0, 0);
        RS(P, 'hand', s, 0.1, 0, 0);
      }
      break;
    default:
      for (const s of SIDES) {
        RS(P, 'upArm', s, 0.04 + br, 0.05, 0.25);
        RS(P, 'foreArm', s, -0.35, 0, 0);
        RS(P, 'hand', s, -0.06, 0, 0.04);
      }
  }
}

// ---------------- biped base loops ----------------
function idle(P, ctx, t) {
  const st = ctx.st, h = ctx.style.heavy || 0, s = sc(ctx);
  const br = Math.sin(t * 1.5), sw = Math.sin(t * 0.55);
  pel(P, sw * 0.022, (-0.05 - h * 0.05 + br * 0.006) * s, 0);
  R(P, 'pelvis', 0.04 * h, 0, sw * 0.025);
  R(P, 'spine', 0.04 + br * 0.01, 0, -sw * 0.018);
  R(P, 'chest', 0.02 + br * 0.02, 0, -sw * 0.012);
  for (const s2 of SIDES) RS(P, 'clav', s2, 0, 0, br * 0.025);
  R(P, 'neck', 0.0 + st.gp * 0.3, st.gy * 0.35, 0);
  R(P, 'head', st.gp * 0.6, st.gy * 0.6, st.tilt);
  hold(P, ctx, 0);
  plant(P, ctx, 0.1, -0.08, 1);
}

function gait(P, ctx) {
  const m = ctx.move, D = ctx.D, L = D.leg, st = ctx.style, heavy = st.heavy || 0;
  const duty = 0.6, lift = L * (0.16 + heavy * 0.04);
  const d = m.stride, ph = m.phase, fx = stanceX(ctx) * 0.95;
  const feet = {};
  for (const s of SIDES) {
    const p = (ph + (s === 'L' ? 0 : 0.5)) % 1;
    let z, y = D.ankle, pitch;
    if (p < duty) {
      const u = p / duty, hl = smooth((u - 0.7) / 0.3);
      z = d / 2 - d * u; y += hl * L * 0.05; pitch = hl * 0.5;
    } else {
      const u = (p - duty) / (1 - duty);
      const mt = -d * (1 - duty) / duty, u2 = u * u, u3 = u2 * u;
      z = (2 * u3 - 3 * u2 + 1) * (-d / 2) + (u3 - 2 * u2 + u) * mt + (-2 * u3 + 3 * u2) * (d / 2) + (u3 - u2) * mt;
      y += lift * Math.pow(Math.sin(PI * u), 1.2) + L * 0.05 * (1 - smooth(u / 0.3));
      pitch = lerp(0.5, -0.2, smooth(u));
    }
    feet[s] = [s === 'L' ? fx : -fx, y, z, pitch];
  }
  const zl = d > 1e-4 ? clamp(feet.L[2] / (d / 2), -1, 1) : 0;
  const s2 = Math.sin(TAU * ph);
  // heavy stomp: pelvis dips at each footfall
  const stomp = Math.pow(Math.abs(Math.cos(TAU * ph)), 6);
  pel(P, 0.035 * s2 * (1 + heavy), (-0.07 - heavy * 0.04) * sc(ctx) - stomp * 0.03 * (0.5 + heavy), 0);
  R(P, 'pelvis', 0.08, -0.12 * zl, 0.04 * s2);
  R(P, 'spine', 0.06, 0.08 * zl, -0.03 * s2);
  R(P, 'chest', 0.04, 0.08 * zl, -0.02 * s2);
  R(P, 'neck', -0.05, -0.05 * zl, 0);
  R(P, 'head', -0.04 + ctx.st.gp * 0.3, ctx.st.gy * 0.3, ctx.st.tilt);
  hold(P, ctx, 0.5);
  for (const s of SIDES) legIK(P, ctx, s, feet[s][0], feet[s][1], feet[s][2], feet[s][3]);
}

function victoryB(P, ctx, t) {
  idle(P, ctx, t);
  const u = Math.min(1, t / 0.6), k = smooth(u), pump = Math.max(0, Math.sin(t * 3.2)) * k;
  A(P, 'chest', -0.12 * k, 0.15 * k, 0);
  R(P, 'head', -0.2 * k, 0.1 * k, 0);
  const w = ctx.style.weapon;
  if (w === 'rifle' || w === 'cannon') {
    RS(P, 'upArm', 'R', lerp(-0.45, -2.6, k) + pump * 0.15, 0.1, 0.25);
    RS(P, 'foreArm', 'R', -0.2, 0, 0);
    RS(P, 'hand', 'R', -0.4, 0, 0);
  } else if (w === 'shield') {
    RS(P, 'upArm', 'R', lerp(-0.1, -2.7, k), 0, 0.3);
    RS(P, 'foreArm', 'R', -0.3 - pump * 0.4, 0, 0);
    A(P, 'pelvis', 0, 0, 0);
  } else if (w === 'blade') {
    RS(P, 'upArm', 'R', lerp(-0.3, -2.9, k), 0, 0.15);
    RS(P, 'foreArm', 'R', -0.15, 0, 0);
    RS(P, 'hand', 'R', -1.2 * k, 0, 0);
  } else {
    for (const s of SIDES) { RS(P, 'upArm', s, lerp(-0.45, -2.5, k) + (s === 'L' ? pump : -pump) * 0.2, 0, 0.5); RS(P, 'foreArm', s, -0.4, 0, 0); }
  }
}

// ---------------- biped one-shots: fn(P, u, ctx) ----------------
function shieldBash(P, u, ctx) {
  idle(P, ctx, ctx.t);
  const s = sc(ctx);
  pel(P, 0, kf(u, [[0, -0.05], [0.3, -0.12], [0.45, -0.1], [1, -0.05]]) * s, kf(u, [[0, 0], [0.3, -0.06], [0.45, 0.2], [0.7, 0.15], [1, 0]]) * s);
  R(P, 'spine', kf(u, [[0, 0.04], [0.3, -0.05], [0.45, 0.2], [1, 0.04]]), kf(u, [[0, 0], [0.3, 0.35], [0.45, -0.2], [1, 0]]), 0);
  RS(P, 'upArm', 'L', kf(u, [[0, -0.35], [0.3, -0.2], [0.45, -0.95], [0.7, -0.9], [1, -0.35]]), 0, kf(u, [[0, 0.3], [0.3, 0.4], [0.45, 0.1], [1, 0.3]]));
  RS(P, 'foreArm', 'L', kf(u, [[0, -1.2], [0.3, -1.45], [0.45, -0.7], [0.7, -0.75], [1, -1.2]]), 0, 0);
  plant(P, ctx, 0.22, -0.18, 1.1);
}
function shieldSlam(P, u, ctx) {
  idle(P, ctx, ctx.t);
  const s = sc(ctx);
  pel(P, 0, kf(u, [[0, -0.05], [0.35, 0.05], [0.55, -0.24], [0.8, -0.22], [1, -0.05]]) * s, kf(u, [[0, 0], [0.55, 0.15], [1, 0]]) * s);
  R(P, 'spine', kf(u, [[0, 0], [0.35, -0.2], [0.55, 0.35], [0.85, 0.3], [1, 0]]), 0, 0);
  R(P, 'chest', kf(u, [[0, 0], [0.35, -0.15], [0.55, 0.2], [1, 0]]), 0, 0);
  RS(P, 'upArm', 'L', kf(u, [[0, -0.35], [0.35, -1.9], [0.55, -0.7], [0.85, -0.7], [1, -0.35]]), 0, 0.28);
  RS(P, 'foreArm', 'L', kf(u, [[0, -1.2], [0.35, -0.9], [0.55, -0.9], [1, -1.2]]), 0, 0);
  RS(P, 'upArm', 'R', kf(u, [[0, -0.1], [0.35, -2.4], [0.55, -0.8], [1, -0.1]]), 0, 0.3);
  RS(P, 'foreArm', 'R', kf(u, [[0, -0.5], [0.35, -0.4], [0.55, -0.3], [1, -0.5]]), 0, 0);
  plant(P, ctx, 0.2, -0.2, 1.35);
}
function aimFire(P, u, ctx, recoil = 1, charge = 0) {
  idle(P, ctx, ctx.t);
  const up = kf(u, [[0, 0], [0.18, 1], [0.85, 1], [1, 0]]);
  const fireU = charge ? 0.68 : 0.32;
  const kick = kf(u, [[0, 0], [fireU - 0.01, 0], [fireU + 0.04, 1], [fireU + 0.3, 0], [1, 0]]) * recoil;
  pel(P, 0, -0.07 * sc(ctx) - 0.03 * up, -0.05 * kick);
  R(P, 'pelvis', 0.04, 0.1 * up, 0);
  R(P, 'spine', 0.04 - 0.05 * kick, 0.12 * up, 0);
  R(P, 'chest', -0.03 * kick, 0.1 * up, 0);
  R(P, 'neck', 0, -0.15 * up, 0); R(P, 'head', 0.05 * up, -0.1 * up, 0.12 * up);
  hold(P, ctx, up);
  A(P, 'upArmR', 0.25 * kick, 0, 0); A(P, 'foreArmR', -0.25 * kick, 0, 0);
  if (charge) { const c = kf(u, [[0, 0], [0.2, 0], [0.62, 1], [0.7, 0]]); A(P, 'chest', 0, 0, 0.01 * Math.sin(ctx.t * 70) * c); }
  plant(P, ctx, 0.18, -0.16, 1.15);
}
function burst(P, u, ctx) {
  aimFire(P, u, ctx, 0);
  const sh = Math.sin(u * 60) * kf(u, [[0, 0], [0.2, 1], [0.75, 1], [0.85, 0]]);
  A(P, 'chest', 0.02 * sh, 0, 0); A(P, 'upArmR', 0.05 * sh, 0, 0);
  P[PX + 2] -= 0.02 * Math.abs(sh);
}
function heavyShot(P, u, ctx) {
  idle(P, ctx, ctx.t);
  const k = kf(u, [[0, 0], [0.25, 1], [0.85, 1], [1, 0]]), kick = kf(u, [[0, 0], [0.54, 0], [0.58, 1], [0.85, 0]]);
  const s = sc(ctx);
  pel(P, 0, (-0.07 - 0.22 * k) * s, -0.12 * kick);
  R(P, 'spine', 0.1 * k - 0.2 * kick, 0.1 * k, 0);
  R(P, 'chest', 0.05 * k, 0.1 * k, 0);
  hold(P, ctx, 1);
  A(P, 'upArmR', -0.2 * k + 0.35 * kick, 0, 0);
  plant(P, ctx, 0.3, -0.25, 1.4, 0, 0.3);
}
function slash(P, u, ctx, alt = false) {
  const s = sc(ctx);
  idle(P, ctx, ctx.t);
  if (!alt) {
    pel(P, 0, kf(u, [[0, -0.05], [0.35, -0.12], [0.5, -0.16], [1, -0.05]]) * s, kf(u, [[0, 0], [0.5, 0.2], [1, 0]]) * s);
    const tw = kf(u, [[0, 0], [0.35, -0.6], [0.52, 0.65], [0.75, 0.5], [1, 0]]);
    R(P, 'pelvis', 0.05, tw * 0.4, 0); R(P, 'spine', 0.08, tw * 0.3, 0); R(P, 'chest', 0.06, tw * 0.4, 0);
    RS(P, 'upArm', 'R', kf(u, [[0, -0.3], [0.35, -2.0], [0.52, -1.2], [0.75, -0.6], [1, -0.3]]), kf(u, [[0, 0.1], [0.35, 0.9], [0.52, -0.6], [1, 0.1]]), kf(u, [[0, 0.3], [0.35, 0.8], [0.52, 0.2], [1, 0.3]]));
    RS(P, 'foreArm', 'R', kf(u, [[0, -0.7], [0.35, -1.5], [0.52, -0.1], [1, -0.7]]), 0, 0);
    RS(P, 'hand', 'R', kf(u, [[0, 0.2], [0.35, -0.6], [0.52, 0.7], [1, 0.2]]), 0, 0);
    plant(P, ctx, 0.28, -0.2, 1.3, 0, 0.25);
  } else {
    pel(P, 0, kf(u, [[0, -0.05], [0.3, -0.18], [0.5, -0.12], [1, -0.05]]) * s, kf(u, [[0, 0], [0.3, -0.1], [0.5, 0.35], [0.75, 0.3], [1, 0]]) * s);
    R(P, 'spine', kf(u, [[0, 0], [0.3, -0.1], [0.5, 0.25], [1, 0]]), kf(u, [[0, 0], [0.3, 0.4], [0.5, -0.1], [1, 0]]), 0);
    RS(P, 'upArm', 'R', kf(u, [[0, -0.3], [0.3, -0.4], [0.5, -1.55], [0.75, -1.5], [1, -0.3]]), 0, kf(u, [[0, 0.3], [0.3, 0.5], [0.5, 0.1], [1, 0.3]]));
    RS(P, 'foreArm', 'R', kf(u, [[0, -0.7], [0.3, -1.9], [0.5, -0.05], [1, -0.7]]), 0, 0);
    RS(P, 'hand', 'R', kf(u, [[0, 0.2], [0.3, 0.6], [0.5, -0.1], [1, 0.2]]), 0, 0);
    plant(P, ctx, 0.36, -0.24, 1.25, 0, 0.3);
  }
}
function punch(P, u, ctx, alt = false) {
  const s = sc(ctx);
  idle(P, ctx, ctx.t);
  if (!alt) {
    pel(P, 0, kf(u, [[0, -0.05], [0.3, -0.1], [0.45, -0.13], [1, -0.05]]) * s, kf(u, [[0, 0], [0.3, -0.05], [0.45, 0.16], [0.72, 0.12], [1, 0]]) * s);
    const tw = kf(u, [[0, 0], [0.3, -0.35], [0.45, 0.4], [0.75, 0.25], [1, 0]]);
    R(P, 'pelvis', 0.05, tw * 0.5, 0); R(P, 'spine', 0.08, tw * 0.4, 0); R(P, 'chest', 0.1, tw * 0.5, 0);
    RS(P, 'upArm', 'R', kf(u, [[0, -0.45], [0.3, 0.2], [0.45, -1.55], [0.72, -1.45], [1, -0.45]]), 0, kf(u, [[0, 0.42], [0.3, 0.5], [0.45, 0.08], [1, 0.42]]));
    RS(P, 'foreArm', 'R', kf(u, [[0, -1.35], [0.3, -2.0], [0.45, -0.05], [0.72, -0.2], [1, -1.35]]), 0, 0);
    plant(P, ctx, 0.25, -0.2, 1.25, 0, 0.25);
  } else {
    // uppercut
    pel(P, 0, kf(u, [[0, -0.05], [0.35, -0.22], [0.52, 0.02], [0.75, -0.02], [1, -0.05]]) * s, kf(u, [[0, 0], [0.52, 0.12], [1, 0]]) * s);
    R(P, 'spine', kf(u, [[0, 0], [0.35, 0.25], [0.52, -0.2], [1, 0]]), kf(u, [[0, 0], [0.35, -0.3], [0.52, 0.25], [1, 0]]), 0);
    RS(P, 'upArm', 'L', kf(u, [[0, -0.45], [0.35, 0.2], [0.52, -2.4], [0.75, -2.3], [1, -0.45]]), 0, 0.3);
    RS(P, 'foreArm', 'L', kf(u, [[0, -1.35], [0.35, -1.6], [0.52, -0.8], [1, -1.35]]), 0, 0);
    plant(P, ctx, 0.22, -0.18, 1.3);
  }
}
function castB(P, u, ctx) {
  idle(P, ctx, ctx.t);
  const s = sc(ctx), k = kf(u, [[0, 0], [0.45, 1], [0.6, 0.6], [1, 0]]);
  pel(P, 0, kf(u, [[0, -0.05], [0.45, 0.0], [0.6, -0.12], [1, -0.05]]) * s, 0);
  R(P, 'spine', -0.15 * k, 0, 0); R(P, 'chest', -0.2 * k, 0, 0); R(P, 'head', -0.25 * k, 0, 0);
  if (ctx.style.weapon !== 'shield' && ctx.style.weapon !== 'rifle' && ctx.style.weapon !== 'cannon') {
    for (const sd of SIDES) {
      RS(P, 'upArm', sd, kf(u, [[0, -0.3], [0.45, -2.2], [0.6, -1.5], [1, -0.3]]), 0, kf(u, [[0, 0.3], [0.45, 0.55], [0.6, 0.15], [1, 0.3]]));
      RS(P, 'foreArm', sd, kf(u, [[0, -0.6], [0.45, -0.4], [0.6, -0.1], [1, -0.6]]), 0, 0);
    }
  } else {
    RS(P, 'upArm', 'R', kf(u, [[0, -0.1], [0.45, -2.6], [0.6, -2.4], [1, -0.1]]), 0, 0.3);
    RS(P, 'foreArm', 'R', -0.3, 0, 0);
  }
  plant(P, ctx, 0.12, -0.12, 1.2);
}
// Overdrive per weapon: big, readable
function overdriveB(P, u, ctx) {
  const w = ctx.style.weapon, s = sc(ctx);
  idle(P, ctx, ctx.t);
  // shared wind-up: crouch + power surge, then leap/slam
  const crouch = kf(u, [[0, 0], [0.25, 1], [0.38, 0.3], [0.62, 0], [0.75, 1.2], [0.9, 0.9], [1, 0]]);
  const air = kf(u, [[0, 0], [0.32, 0], [0.48, 1], [0.6, 0.85], [0.66, 0], [1, 0]]);
  if (w === 'shield' || w === 'fists' || w === 'blade') {
    pel(P, 0, (-0.05 - 0.25 * crouch) * s + air * 0.9, kf(u, [[0, 0], [0.32, 0], [0.66, 0.6], [1, 0]]) * s);
    R(P, 'spine', 0.25 * crouch - 0.2 * air, w === 'blade' ? kf(u, [[0.4, 0], [0.66, TAU * 0.98]]) : 0, 0);
    R(P, 'chest', 0.15 * crouch, 0, 0);
    for (const sd of SIDES) {
      RS(P, 'upArm', sd, kf(u, [[0, -0.4], [0.25, 0.4], [0.48, -2.8], [0.66, -1.1], [0.9, -1.0], [1, -0.4]]), 0, 0.35);
      RS(P, 'foreArm', sd, kf(u, [[0, -0.8], [0.48, -0.3], [0.66, -0.2], [1, -0.8]]), 0, 0);
    }
    if (w === 'shield') { RS(P, 'upArm', 'L', kf(u, [[0, -0.35], [0.48, -1.6], [0.66, -0.5], [0.9, -0.5], [1, -0.35]]), 0, 0.3); RS(P, 'foreArm', 'L', kf(u, [[0, -1.2], [0.48, -1.0], [0.66, -1.0], [1, -1.2]]), 0, 0); }
    const fl = kf(u, [[0, 0], [0.35, 0], [0.48, 0.5], [0.62, 0], [1, 0]]);
    plant(P, ctx, 0.25 + fl * 0.3, -0.25 - fl * 0.2, 1.4);
    for (const sd of SIDES) AS(P, 'thigh', sd, -0.8 * fl, 0, 0), AS(P, 'shin', sd, 1.2 * fl, 0, 0);
  } else {
    // ranged: brace and unload a charged volley
    const k = kf(u, [[0, 0], [0.2, 1], [0.9, 1], [1, 0]]);
    const sh = Math.sin(u * 90) * kf(u, [[0, 0], [0.45, 0], [0.5, 1], [0.85, 1], [0.9, 0]]);
    pel(P, 0, (-0.08 - 0.18 * k) * s, -0.04 * Math.abs(sh));
    R(P, 'spine', 0.1 * k + 0.03 * sh, 0.1 * k, 0);
    R(P, 'chest', -0.05 * k, 0.1 * k, 0);
    hold(P, ctx, 1);
    A(P, 'upArmR', 0.08 * sh, 0, 0);
    plant(P, ctx, 0.32, -0.28, 1.45, 0, 0.3);
  }
}
function hitB(P, u, ctx) {
  const k = kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
  idle(P, ctx, ctx.t);
  A(P, 'pelvis', -0.06 * k, 0.1 * k * d, 0);
  P[PX + 2] = -0.08 * k; P[PX + 1] -= 0.04 * k;
  A(P, 'spine', -0.15 * k, 0.1 * k * d, 0.06 * k * d);
  A(P, 'chest', -0.2 * k, 0.12 * k * d, 0.05 * k * d);
  A(P, 'head', -0.3 * k, -0.2 * k * d, 0.2 * k * d);
  for (const s of SIDES) AS(P, 'upArm', s, -0.2 * k, 0, 0.3 * k);
  plant(P, ctx, 0.06, -0.1, 1.1);
}
function dieB(P, u, ctx) {
  const D = ctx.D, s = sc(ctx);
  const knee = D.thigh + 0.08 - D.hipY - D.pelvisY;
  const prone = 0.22 * s - D.pelvisY;
  const drop = kf(u, [[0, -0.05], [0.2, -0.16 * s], [0.42, knee], [0.55, knee], [0.8, prone + 0.05], [0.88, prone + 0.02], [0.94, prone + 0.05], [1, prone]]);
  const fall = kf(u, [[0, 0], [0.42, 0.15], [0.55, 0.25], [0.82, PI / 2 - 0.1], [0.9, PI / 2 - 0.18], [1, PI / 2 - 0.12]]);
  pel(P, 0, drop, kf(u, [[0, 0], [0.5, 0.05], [0.85, D.thigh * 0.9], [1, D.thigh * 0.9]]));
  R(P, 'pelvis', fall, kf(u, [[0, 0], [0.4, 0.1], [1, 0.25]]), 0);
  R(P, 'spine', kf(u, [[0, 0], [0.2, 0.25], [0.8, 0.05], [1, 0]]), 0, 0);
  R(P, 'chest', kf(u, [[0, 0], [0.2, 0.25], [0.8, 0.0], [1, 0]]), 0, kf(u, [[0.5, 0], [1, 0.12]]));
  R(P, 'neck', kf(u, [[0, 0], [0.2, 0.4], [0.8, 0.1], [1, -0.2]]), kf(u, [[0.6, 0], [1, 0.4]]), 0);
  R(P, 'head', kf(u, [[0, 0], [0.15, 0.5], [0.8, 0.2], [1, -0.1]]), kf(u, [[0.6, 0], [1, 0.6]]), 0);
  hold(P, ctx, 0);
  const ak = smooth((u - 0.2) / 0.5);
  for (const sd of SIDES) {
    const i = bi3('upArm' + sd);
    P[i] = lerp(P[i], kf(u, [[0.5, 0.1], [0.65, -0.7], [0.85, 0.1], [1, 0.2]]), ak);
    P[i + 2] = lerp(P[i + 2], (sd === 'L' ? 1 : -1) * 0.3, ak);
    const f = bi3('foreArm' + sd); P[f] = lerp(P[f], -0.3, ak);
  }
  const fk = smooth((u - 0.2) / 0.22);
  if (fk < 1) plant(P, ctx, 0.06, -0.06, 1.05);
  const T = new Float32Array(NCH);
  for (const sd of SIDES) {
    const lie = kf(u, [[0.5, 0], [0.82, 1]]);
    RS(T, 'thigh', sd, lerp(-0.1, 0.1, lie) - fall * (1 - lie) * 0.9, 0, 0.08 + 0.08 * lie);
    RS(T, 'shin', sd, lerp(PI / 2, sd === 'L' ? 0.2 : 0.55, lie), 0, 0);
    RS(T, 'foot', sd, lerp(0.5, 0.9, lie), 0, 0);
    for (const b of ['thigh', 'shin', 'foot']) {
      const i = bi3(b + sd);
      for (let c = 0; c < 3; c++) P[i + c] = lerp(P[i + c], T[i + c], fk);
    }
  }
}
function deployB(P, u, ctx) {
  idle(P, ctx, ctx.t);
  const s = sc(ctx);
  // body drops in (fx.bodyY), lands into a deep crouch, rises, head snaps up as it powers on
  const land = kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.6, 0.8], [0.85, 0], [1, 0]]);
  P[PX + 1] += -0.28 * land * s;
  A(P, 'spine', 0.35 * land, 0, 0); A(P, 'chest', 0.2 * land, 0, 0);
  A(P, 'head', 0.5 * kf(u, [[0, 0.4], [0.6, 0.6], [0.75, -0.25], [0.9, 0], [1, 0]]), 0, 0);
  for (const sd of SIDES) AS(P, 'upArm', sd, -0.2 * land, 0, 0.25 * land);
  plant(P, ctx, 0.2 * land + 0.08, -0.2 * land - 0.06, 1 + 0.35 * land);
}

// ---------------- hover rig (mages) ----------------
function hoverIdle(P, ctx, t) {
  const st = ctx.st, b = Math.sin(t * 1.8);
  pel(P, Math.sin(t * 0.7) * 0.03, b * 0.06, 0);
  R(P, 'pelvis', 0.06 + Math.sin(t * 1.1) * 0.03, 0, Math.sin(t * 0.9) * 0.03);
  R(P, 'spine', 0.02 + b * 0.015, 0, 0); R(P, 'chest', -0.02 + b * 0.02, 0, 0);
  R(P, 'neck', st.gp * 0.3, st.gy * 0.4, 0); R(P, 'head', st.gp * 0.5, st.gy * 0.5, st.tilt);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.3;
    RS(P, 'clav', s, 0, 0, b * 0.03);
    RS(P, 'upArm', s, -0.25 + Math.sin(t * 1.3 + ph) * 0.06, -0.1, 0.55 + Math.sin(t * 1.1 + ph) * 0.06);
    RS(P, 'foreArm', s, -0.8 + Math.sin(t * 1.5 + ph) * 0.1, 0, 0);
    RS(P, 'hand', s, 0.15, 0, -0.4);
    RS(P, 'thigh', s, -0.25 + Math.sin(t * 1.2 + ph) * 0.06, 0, 0.06);
    RS(P, 'shin', s, 0.45 + Math.sin(t * 1.2 + ph + 0.5) * 0.08, 0, 0);
    RS(P, 'foot', s, 0.5, 0, 0);
  }
}
function hoverAdvance(P, ctx, t) {
  hoverIdle(P, ctx, t);
  A(P, 'pelvis', 0.18, 0, 0); A(P, 'spine', -0.06, 0, 0);
  for (const s of SIDES) AS(P, 'thigh', s, 0.25, 0, 0), AS(P, 'upArm', s, 0.25, 0, -0.1);
}
const HA = {
  attack(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.35, 1], [0.5, 0.7], [1, 0]]), push = kf(u, [[0, 0], [0.4, 0], [0.48, 1], [0.8, 0.4], [1, 0]]);
    A(P, 'chest', -0.12 * k + 0.1 * push, 0.2 * k, 0);
    RS(P, 'upArm', 'R', lerp(-0.25, -1.5, k), lerp(-0.1, 0.25, k), lerp(0.55, 0.2, k));
    RS(P, 'foreArm', 'R', lerp(-0.8, -0.1, push), 0, 0);
    RS(P, 'hand', 'R', -0.5 * push, 0, 0);
    P[PX + 2] = -0.05 * push;
  },
  attack_alt(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.4, 1], [0.8, 1], [1, 0]]);
    P[PX + 1] += 0.15 * k;
    A(P, 'chest', -0.15 * k, 0, 0);
    for (const s of SIDES) { RS(P, 'upArm', s, lerp(-0.25, -1.4, k), 0.3 * k, lerp(0.55, 0.15, k)); RS(P, 'foreArm', s, lerp(-0.8, -0.2, k), 0, 0); }
  },
  cast(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.45, 1], [0.6, 1.1], [1, 0]]);
    P[PX + 1] += 0.25 * k;
    A(P, 'chest', -0.25 * k, 0, 0); A(P, 'head', -0.3 * k, 0, 0);
    for (const s of SIDES) { RS(P, 'upArm', s, lerp(-0.25, -2.5, k), 0, lerp(0.55, 0.45, k)); RS(P, 'foreArm', s, lerp(-0.8, -0.2, k), 0, 0); }
  },
  overdrive(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const rise = kf(u, [[0, 0], [0.4, 1], [0.8, 1], [1, 0]]), spread = kf(u, [[0, 0], [0.25, 0.4], [0.55, 1], [0.85, 1], [1, 0]]);
    P[PX + 1] += 0.7 * rise;
    A(P, 'pelvis', -0.1 * rise, 0, 0); A(P, 'chest', -0.3 * spread, 0, 0); A(P, 'head', -0.35 * spread, 0, 0);
    for (const s of SIDES) {
      RS(P, 'upArm', s, lerp(-0.25, -0.3, spread), 0, lerp(0.55, 1.45, spread));
      RS(P, 'foreArm', s, lerp(-0.8, -0.05, spread), 0, 0);
      RS(P, 'hand', s, 0, 0, lerp(-0.4, 0.4, spread));
      RS(P, 'thigh', s, lerp(-0.25, 0.05, spread), 0, 0.15 * spread);
      RS(P, 'shin', s, lerp(0.45, 0.15, spread), 0, 0);
    }
  },
  hit(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    A(P, 'pelvis', -0.35 * k, 0.15 * k * d, 0.2 * k * d); P[PX + 2] = -0.15 * k;
    A(P, 'head', -0.3 * k, 0, 0.2 * k * d);
  },
  die(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t * (1 - u));
    const g = 0.2 - ctx.D.pelvisY;
    pel(P, 0, kf(u, [[0, 0], [0.15, 0.12], [0.6, g], [0.7, g + 0.08], [0.8, g], [1, g]]), kf(u, [[0, 0], [1, -0.2]]));
    R(P, 'pelvis', kf(u, [[0, 0], [0.6, -0.4], [1, -1.25]]), kf(u, [[0, 0], [1, 0.4]]), kf(u, [[0, 0], [0.6, 0.3], [1, 0.25]]));
    R(P, 'spine', kf(u, [[0, 0], [0.6, 0.4], [1, 0.2]]), 0, 0);
    R(P, 'head', kf(u, [[0, 0], [0.5, 0.6], [1, 0.5]]), 0, 0);
    for (const s of SIDES) { RS(P, 'upArm', s, lerp(-0.25, 0.3, smooth(u)), 0, lerp(0.55, 0.3, smooth(u))); RS(P, 'foreArm', s, -0.3, 0, 0); RS(P, 'thigh', s, -0.6 * smooth(u), 0, 0.2); RS(P, 'shin', s, 1.2 * smooth(u), 0, 0); }
  },
  victory(P, u, ctx, t) {
    hoverIdle(P, ctx, t);
    const k = smooth(Math.min(1, t / 0.6));
    P[PX + 1] += 0.15 * k + Math.sin(t * 2.5) * 0.04;
    A(P, 'chest', -0.15 * k, 0, 0);
    for (const s of SIDES) { RS(P, 'upArm', s, lerp(-0.25, -2.2, k), 0, lerp(0.55, 0.7, k)); RS(P, 'foreArm', s, -0.3, 0, 0); }
  },
  deploy(P, u, ctx) {
    hoverIdle(P, ctx, ctx.t);
    const curl = kf(u, [[0, 1], [0.45, 1], [0.8, 0], [1, 0]]);
    A(P, 'spine', 0.5 * curl, 0, 0); A(P, 'chest', 0.3 * curl, 0, 0); A(P, 'head', 0.4 * curl, 0, 0);
    for (const s of SIDES) { AS(P, 'upArm', s, -0.5 * curl, 0, -0.3 * curl); AS(P, 'thigh', s, -0.8 * curl, 0, 0); AS(P, 'shin', s, 0.8 * curl, 0, 0); }
  },
};

// ---------------- quad rig (spider walkers) ----------------
// Legs: front = clav/upArm/foreArm/hand (hip on clav), back = thigh/shin/foot. Each leg's rest points along ±x.
export const QLEGS = [
  { up: 'upArmL', lo: 'foreArmL', s: 1, ph: 0, front: 1 },
  { up: 'upArmR', lo: 'foreArmR', s: -1, ph: 0.5, front: 1 },
  { up: 'thighL', lo: 'shinL', s: 1, ph: 0.5, front: 0 },
  { up: 'thighR', lo: 'shinR', s: -1, ph: 0, front: 0 },
];
function quadIK(P, ctx, leg, fx, fy, fz) {
  const D = ctx.D, hip = D.qhip[leg.up];
  // pelvis transform (pitch x, yaw y, roll z) + offset
  _e.set(P[0], P[1], P[2], 'YXZ');
  _q.setFromEuler(_e).invert();
  _v.set(fx - P[PX], fy - (D.pelvisY + P[PX + 1]), fz - P[PX + 2]).applyQuaternion(_q);
  let dx = _v.x - hip[0], dy = _v.y - hip[1], dz = _v.z - hip[2];
  dx *= leg.s;
  const a = D.femur, b = D.tibia;
  const yaw = Math.atan2(-dz, dx), r = Math.hypot(dx, dz);
  const L = clamp(Math.hypot(r, dy), Math.abs(a - b) + 0.02, (a + b) * 0.999);
  const th = Math.atan2(dy, r);
  const al = Math.acos(clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1));
  const be = Math.acos(clamp((a * a + b * b - L * L) / (2 * a * b), -1, 1));
  const z1 = th + al, z2 = -(PI - be);
  R(P, leg.up, 0, yaw * leg.s, z1 * leg.s);
  R(P, leg.lo, 0, 0, z2 * leg.s);
}
function quadFeet(ctx) {
  const D = ctx.D;
  return QLEGS.map((l) => { const h = D.qhip[l.up]; return [h[0] + l.s * D.qreach, D.ankle, h[2] + (l.front ? 0.18 : -0.18)]; });
}
function quadIdle(P, ctx, t, extra) {
  const st = ctx.st, b = Math.sin(t * 2.2);
  pel(P, Math.sin(t * 0.6) * 0.02, b * 0.02 - 0.02, 0);
  R(P, 'pelvis', Math.sin(t * 0.8) * 0.02, Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.7) * 0.02);
  R(P, 'neck', st.gp * 0.2, st.gy * 0.8, 0);
  R(P, 'head', -0.05 + st.gp * 0.2, 0, 0);
  extra && extra(P);
  const F = quadFeet(ctx);
  QLEGS.forEach((l, i) => quadIK(P, ctx, l, F[i][0], F[i][1], F[i][2]));
}
function quadWalk(P, ctx, t) {
  const m = ctx.move, D = ctx.D, d = m.stride, duty = 0.62;
  const F = quadFeet(ctx);
  const ph = m.phase;
  pel(P, 0, -0.02 + 0.025 * Math.sin(TAU * 2 * ph), 0);
  R(P, 'pelvis', 0.03, 0.04 * Math.sin(TAU * ph), 0.03 * Math.sin(TAU * ph));
  R(P, 'neck', 0, ctx.st.gy * 0.4, 0); R(P, 'head', 0, 0, 0);
  QLEGS.forEach((l, i) => {
    const p = (ph + l.ph) % 1;
    let z, y = D.ankle;
    if (p < duty) z = d / 2 - d * (p / duty);
    else { const u = (p - duty) / (1 - duty); z = -d / 2 + d * smooth(u); y += 0.22 * Math.sin(PI * u); }
    quadIK(P, ctx, l, F[i][0], y, F[i][2] + z);
  });
}
function quadAction(name) {
  return (P, u, ctx) => {
    let k = 0, kick = 0, rear = 0, drop = 0;
    if (name === 'attack' || name === 'attack_alt') {
      k = kf(u, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]);
      kick = name === 'attack' ? Math.abs(Math.sin(u * 30)) * kf(u, [[0, 0], [0.25, 0], [0.3, 1], [0.7, 1], [0.75, 0]]) : kf(u, [[0, 0], [0.5, 0], [0.54, 1], [0.8, 0]]);
    } else if (name === 'overdrive') {
      rear = kf(u, [[0, 0], [0.3, 1], [0.85, 1], [1, 0]]);
      kick = Math.abs(Math.sin(u * 50)) * kf(u, [[0, 0], [0.38, 0], [0.42, 1], [0.82, 1], [0.86, 0]]);
    } else if (name === 'cast') rear = kf(u, [[0, 0], [0.45, 0.6], [1, 0]]);
    else if (name === 'hit') kick = kf(u, [[0, 0], [0.12, 1], [1, 0]]) * 2;
    else if (name === 'deploy') drop = kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.7, 0.3], [1, 0]]);
    quadIdle(P, ctx, ctx.t, (Q) => {
      Q[PX + 1] += -0.12 * k + 0.15 * rear - 0.25 * drop;
      Q[PX + 2] = -0.06 * kick;
      Q[0] += -0.06 * kick - 0.32 * rear;
      Q[bi3('head')] += -0.15 * k - 0.12 * rear + 0.03 * kick;
      if (name === 'hit') Q[2] += 0.15 * kick * ctx.st.hitDir;
    });
  };
}
function quadDie(P, u, ctx) {
  const D = ctx.D, fold = smooth(u / 0.7);
  pel(P, 0, kf(u, [[0, 0], [0.15, 0.06], [0.6, -(D.pelvisY - 0.32)], [0.7, -(D.pelvisY - 0.38)], [0.8, -(D.pelvisY - 0.3)], [1, -(D.pelvisY - 0.3)]]), 0);
  R(P, 'pelvis', kf(u, [[0, 0], [0.6, 0.12], [1, 0.18]]), 0, kf(u, [[0, 0], [0.6, -0.15], [1, -0.2]]));
  R(P, 'neck', 0, kf(u, [[0, 0], [1, 0.6]]), 0); R(P, 'head', kf(u, [[0, 0], [1, 0.35]]), 0, 0);
  const F = quadFeet(ctx);
  QLEGS.forEach((l, i) => {
    const spread = 1 + 0.25 * fold;
    const h = D.qhip[l.up];
    quadIK(P, ctx, l, h[0] + (F[i][0] - h[0]) * spread, D.ankle, F[i][2] * spread);
    const tw = u > 0.65 ? Math.sin(u * 70 + i * 2) * (1 - u) * 0.4 : 0;
    A(P, l.lo, 0, 0, tw * l.s);
  });
}

// ---------------- registry ----------------
export const ACTIONS = {
  attack: { dur: 0.95, events: [['fire', 0.32]] },
  attack_alt: { dur: 1.3, events: [['cast', 0.2], ['fire', 0.68]] },
  cast: { dur: 1.2, events: [['cast', 0.55]] },
  overdrive: { dur: 2.2, events: [['cast', 0.2], ['impact', 0.66]] },
  hit: { dur: 0.42, events: [] },
  die: { dur: 1.9, events: [['down', 0.8]], hold: true },
  deploy: { dur: 1.5, events: [['land', 0.4], ['ready', 0.85]] },
};
// per-style event timing overrides
const EVENTS = {
  shield: { attack: [['impact', 0.45]], attack_alt: [['impact', 0.56]] },
  blade: { attack: [['impact', 0.5]], attack_alt: [['impact', 0.5]] },
  fists: { attack: [['impact', 0.45]], attack_alt: [['impact', 0.52]] },
  cannon: { attack: [['fire', 0.28], ['fire', 0.42], ['fire', 0.56], ['fire', 0.7]], attack_alt: [['cast', 0.25], ['fire', 0.56]],
    overdrive: [['cast', 0.2], ...[0.5, 0.56, 0.62, 0.68, 0.74, 0.8].map((u) => ['fire', u])] },
  rifle: { overdrive: [['cast', 0.2], ['fire', 0.52], ['fire', 0.64], ['fire', 0.76]] },
  beast: { attack: [['impact', 0.5]], attack_alt: [['impact', 0.5]], cast: [['cast', 0.5]], overdrive: [['cast', 0.25], ['impact', 0.68]] },
  orbs: { attack: [['fire', 0.48]], attack_alt: [['cast', 0.3], ['fire', 0.55]], overdrive: [['cast', 0.3], ['fire', 0.6]] },
  quad: { attack: [['fire', 0.32], ['fire', 0.42], ['fire', 0.52], ['fire', 0.62]], attack_alt: [['cast', 0.3], ['fire', 0.54]],
    overdrive: [['cast', 0.25], ...[0.44, 0.5, 0.56, 0.62, 0.68, 0.74, 0.8].map((u) => ['fire', u])] },
};
export function actionDef(name, style, M = {}) {
  const base = ACTIONS[name];
  if (!base) return null;
  const key = style.beast ? 'beast' : style.quad ? 'quad' : style.hover ? 'orbs' : style.weapon;
  const ev = M.events?.[name] || EVENTS[key]?.[name];
  const dur = M.durs?.[name] ?? style.durs?.[name] ?? base.dur;
  return { ...base, dur, events: ev || base.events };
}
export const LOOPS = new Set(['idle', 'advance', 'victory']);

function trackedFix(P) {
  // tracked chassis: the pelvis is the hull, it never crouches or pitches; legs have no geometry
  P[0] = 0; P[2] = 0; P[PX] *= 0.2; P[PX + 1] = Math.max(-0.02, P[PX + 1] * 0.25); P[PX + 2] *= 0.3;
}
export function evalLoop(name, P, ctx, t) {
  evalLoop0(name, P, ctx, t);
  if (ctx.style.tracked) trackedFix(P);
}
function evalLoop0(name, P, ctx, t) {
  P.fill(0);
  const st = ctx.style;
  if (st.beast) return beastLoop(name, P, ctx, t);
  if (st.quad) return name === 'advance' ? quadWalk(P, ctx, t) : quadIdle(P, ctx, t, name === 'victory' ? (Q) => { Q[0] -= 0.2 * smooth(t / 0.5); Q[PX + 1] += 0.08; } : null);
  if (st.hover) return name === 'advance' ? hoverAdvance(P, ctx, t) : name === 'victory' ? HA.victory(P, 0, ctx, t) : hoverIdle(P, ctx, t);
  if (name === 'advance') return gait(P, ctx);
  if (name === 'victory') return victoryB(P, ctx, t);
  return idle(P, ctx, t);
}
export function evalAction(name, P, u, ctx) {
  evalAction0(name, P, u, ctx);
  if (ctx.style.tracked) trackedFix(P);
}
function evalAction0(name, P, u, ctx) {
  P.fill(0);
  const st = ctx.style;
  if (st.beast) return beastAction(name, P, u, ctx);
  if (st.quad) return name === 'die' ? quadDie(P, u, ctx) : quadAction(name)(P, u, ctx);
  if (st.hover) return (HA[name] || HA.attack)(P, u, ctx);
  const w = st.weapon;
  switch (name) {
    case 'attack':
      if (w === 'shield') return shieldBash(P, u, ctx);
      if (w === 'blade') return slash(P, u, ctx);
      if (w === 'fists') return punch(P, u, ctx);
      if (w === 'cannon') return burst(P, u, ctx);
      return aimFire(P, u, ctx);
    case 'attack_alt':
      if (w === 'shield') return shieldSlam(P, u, ctx);
      if (w === 'blade') return slash(P, u, ctx, true);
      if (w === 'fists') return punch(P, u, ctx, true);
      if (w === 'cannon') return heavyShot(P, u, ctx);
      return aimFire(P, u, ctx, 1.6, 1);
    case 'cast': return castB(P, u, ctx);
    case 'overdrive': return overdriveB(P, u, ctx);
    case 'hit': return hitB(P, u, ctx);
    case 'die': return dieB(P, u, ctx);
    case 'deploy': return deployB(P, u, ctx);
  }
}

// Emissive power curve per action (1 = normal). Overdrive surges, die flickers out, deploy powers on.
export function powerCurve(name, u) {
  switch (name) {
    case 'overdrive': return kf(u, [[0, 1], [0.25, 2.6], [0.6, 3], [0.8, 2], [1, 1]]);
    case 'cast': return kf(u, [[0, 1], [0.5, 2.2], [1, 1]]);
    case 'attack_alt': return kf(u, [[0, 1], [0.3, 1.4], [0.62, 2.2], [0.75, 1], [1, 1]]);
    case 'die': return kf(u, [[0, 1], [0.08, 0.2], [0.12, 1.4], [0.2, 0.15], [0.26, 0.9], [0.45, 0.5], [0.5, 1], [0.8, 0.2], [1, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.4, 0], [0.5, 0.8], [0.55, 0.1], [0.62, 1], [0.7, 0.4], [0.85, 1.8], [1, 1]]);
    default: return 1;
  }
}
// Deploy drop-in height (applied to the inner body, never the root).
export const deployDrop = (u) => kf(u, [[0, 7], [0.4, 0]]) * (u < 0.4 ? 1 : 0);

// Pose library for per-model anim overrides: model.anims[name](P, u_or_t, ctx, LIB)
export const LIB = {
  NCH, PX, BI, kf, smooth, lerp, clamp, R, A, RS, AS, pel, legIK, plant, hold, fkBone, fkPoint, armIK, twoHand,
  idle, gait, victoryB, shieldBash, shieldSlam, aimFire, burst, heavyShot, slash, punch, castB, overdriveB, hitB, dieB, deployB,
  hoverIdle, hoverAdvance, hover: HA, quadIdle, quadWalk, quadIK, quadAction, quadDie, evalLoop, evalAction, powerCurve,
};
