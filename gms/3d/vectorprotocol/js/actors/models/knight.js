// RIFT KNIGHT, order rare tank, "Sworn of the Hollow Crown" (sculptor-18, D21 fantasy). Brief: docs/ROSTER.md `rift_knight`;
// look: refs/ref_fantasy_01.jpg (chunky painterly hero). Crowned great-helm, layered engraved steel plate, blue tabard + kite shield,
// longsword whose fuller glows rift-blue. VALUE: `paint` = bright engraved steel (dominant), `metal` = dark mail / leather under-layer,
// `accent` = faction cloth (blue tabard, shield field, cape), `trim` = gold edges + crown + inlay, `glow` = rift light, `eye` = visor slit.
// Rank tiers (rare default R1): R0 battered (no crown points, bare shield, short tabard) · R1 iron crown, tabard, emblem shield ·
//   R2 blue cape, extra pauldron lame + haute-piece, plume, poleyn fans · R3 rift runes: blade edges, shield rim + gem, crown gems glow ·
//   R4 gold-trimmed cape, gold wing crest on the helm, taller crown, glowing pauldron filigree · R5 the Hollow Crown: a floating spectral
//   crown of rift light above the helm, glowing cape hem.
// Technique: sword hilt authored in a blade frame on handR + aimBlade() IK (paladin.js pattern); kite shield authored in the guard pose
// with poseFrame; tabard front/back flaps on aux1/aux3 (re-parented to the pelvis) follow the thighs in post(); cape on aux0 + aux2.
import { THREE, P, PS, plate, fin, discX, poseFrame, makeRig, LIB, PI, BI } from '../kit.js';

const BLADE_A = 1.15;            // blade pitch in the hand frame (hand -Y = down the forearm)
const BL = 1.08, BW = 0.085;     // blade length / width
const GRIP_O = [0, -0.07, 0];    // fist centre on handR
const DIMS = {
  thigh: 0.45, shin: 0.44, ankle: 0.1, hipX: 0.13, hipY: -0.05, spine: 0.13, chest: 0.27, neck: 0.27, headOff: 0.04,
  clavX: 0.07, clavY: 0.23, shoulder: 0.25, upArm: 0.3, foreArm: 0.28, aux0: [0, 0.27, -0.2],
  parents: { aux1: 'pelvis', aux2: 'aux0', aux3: 'pelvis' },
  aux1: [0, -0.06, 0.17],     // tabard front flap hinge
  aux2: [0, -0.5, -0.06],     // lower cape hinge
  aux3: [0, -0.04, -0.17],    // tabard back flap hinge
};
const L = LIB;
const _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3(), _qf = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const QA_INV = new THREE.Quaternion().setFromEuler(new THREE.Euler(BLADE_A, 0, 0)).invert();
const kv = (u, keys) => [0, 1, 2].map((c) => L.kf(u, keys.map((k) => [k[0], k[1][c]])));

// ---------- pose helpers ----------
function guard(P, k = 0, br = 0) {
  L.RS(P, 'upArm', 'R', -0.3 - 0.2 * k + br, 0.12, 0.34);
  L.RS(P, 'foreArm', 'R', -0.72 - 0.25 * k, 0, 0);
  L.RS(P, 'upArm', 'L', -0.4 - 0.12 * k + br, -0.14, 0.3);
  L.RS(P, 'foreArm', 'L', -1.2, 0, 0);
  L.RS(P, 'hand', 'L', 0, 0, 0);
}
const G_HAND = [-0.42, 1.08, 0.22], G_DIR = [-0.25, -0.5, 0.83], G_YH = [-0.4, 0.9, 0.2];
function stance(P, ctx, t) {
  L.idle(P, ctx, t);
  const br = Math.sin(t * 1.4);
  L.A(P, 'chest', -0.04, 0, 0); L.A(P, 'spine', -0.01, 0.05, 0); L.A(P, 'pelvis', 0, 0.08, 0);
  L.A(P, 'neck', -0.03, -0.04, 0); L.A(P, 'head', 0.06, -0.04, 0);
  guard(P, 0, br * 0.02);
  L.plant(P, ctx, 0.19, -0.12, 1.3);
  swordIK(P, ctx, [G_HAND[0], G_HAND[1] + br * 0.012, G_HAND[2]], G_DIR, G_YH, 1, 0.45);
}
function aimBlade(P, ctx, dir, yh) {
  const { q } = L.fkBone(P, ctx, 'foreArmR', _p, _qf);
  _z.set(dir[0], dir[1], dir[2]).normalize();
  _y.set(yh[0], yh[1], yh[2]);
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-4) _y.set(1, 0, 0).addScaledVector(_z, -_z.x);
  _y.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _qb.setFromRotationMatrix(_m).multiply(QA_INV);
  _qb.premultiply(q.invert());
  _e.setFromQuaternion(_qb, 'YXZ');
  L.R(P, 'handR', _e.x, _e.y, _e.z);
}
const ARM_R = ['upArmR', 'foreArmR', 'handR'].map((n) => BI[n] * 3);
const _save = new Float32Array(9);
// sword hand IK: fist at `tgt` (root space), blade along `dir`; w blends from the current FK pose
function swordIK(P, ctx, tgt, dir, yh, w = 1, out = 0.3) {
  if (w <= 0.001) return;
  ARM_R.forEach((i, j) => { _save[j * 3] = P[i]; _save[j * 3 + 1] = P[i + 1]; _save[j * 3 + 2] = P[i + 2]; });
  L.armIK(P, ctx, 'R', _v.set(tgt[0], tgt[1], tgt[2]), out);
  aimBlade(P, ctx, dir, yh);
  if (w < 1) ARM_R.forEach((i, j) => { for (let c = 0; c < 3; c++) P[i + c] = _save[j * 3 + c] + (P[i + c] - _save[j * 3 + c]) * w; });
}

// guard pose -> shield frame on the left forearm
const RIG = makeRig(DIMS);
const REF = { D: RIG.D, rig: RIG, t: 0, style: { weapon: 'blade', heavy: 0.5, stance: 1.3 }, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI, move: { v: 0, phase: 0, stride: 0 } };
const HOLD_P = new Float32Array(L.NCH);
stance(HOLD_P, REF, 0);
const HOLD = Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [HOLD_P[i * 3], HOLD_P[i * 3 + 1], HOLD_P[i * 3 + 2]]]));
HOLD.pelvis = [HOLD.pelvis[0], HOLD.pelvis[1], 0];
const SHIELD_FRAME = poseFrame(RIG, HOLD, 'foreArmL');

// ---------- detail: engraved filigree on the steel (dark scroll grooves + bright worn edges) ----------
function engrave(g, w, h, r) {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
  const N = 5, cs = w / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = (i + 0.5) * cs + (j % 2) * cs * 0.5, cy = (j + 0.5) * cs, s = cs * (0.32 + r() * 0.1), fl = r() < 0.5 ? 1 : -1;
    g.lineCap = 'round';
    for (const [col, lw] of [['rgba(205,205,205,0.55)', 4.5], ['rgba(38,38,38,0.85)', 2.2]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k / 40 * PI * 3.2, rr = s * (1 - k / 46); g.lineTo(cx + fl * Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.stroke();
      g.beginPath(); g.moveTo(cx - s * 1.4, cy + s * 1.05); g.quadraticCurveTo(cx, cy + s * 0.2, cx + s * 1.4, cy + s * 1.05); g.stroke();
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, Ln = 6 + r() * 30, a = r() * 6.28;
    g.strokeStyle = `rgba(230,230,230,${0.25 + r() * 0.35})`; g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * Ln, y + Math.sin(a) * Ln); g.stroke();
  }
}

// ---------- small helpers ----------
function rivets(b, bone, slot, pts, r = 0.012, mirror = true) {
  if (b.far) return;
  for (const p of pts) (mirror ? b.sym : b.add).call(b, b.sph(8, 6), bone, slot, p, [0, 0, 0], r);
}
function addM(b, g, bone, slot, p, r = [0, 0, 0]) {
  b.add(g.clone(), bone, slot, p, r);
  b.add(g, bone, slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], [-1, 1, 1]);
}
// gold strip between two points (inlay lines on plates)
function inlay(b, bone, slot, a, c, w = 0.012, d = 0.012, mirror = false) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
  const g = b.cbox(w, len, d, Math.min(w, d) * 0.3);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  (mirror ? b.sym : b.add).call(b, g, bone, slot);
}
// crown silhouette (5 points) as a 2D outline, centred on x
const crownPts = (w, h, p) => [[-w, 0], [w, 0], [w, h], [w * 0.62, h * 0.55], [w * 0.35, h + p * 0.6], [w * 0.12, h * 0.6], [0, h + p], [-w * 0.12, h * 0.6], [-w * 0.35, h + p * 0.6], [-w * 0.62, h * 0.55], [-w, h]];

// ---------- parts ----------
function helm(b, o) {
  const rk = o.rank, far = b.far, y = 0.08, z = 0.015;
  // great-helm: rounded skull + straight-walled face, forward-keeled faceplate, horizontal visor slit, breaths, gorget
  b.add(b.sph(22, 14, 0, PI * 2, 0, PI * 0.55), 'head', 'paint', [0, y + 0.04, z], [0, 0, 0], [0.135, 0.13, 0.145]);
  b.add(b.cyl(0.135, 0.128, 0.16, 22), 'head', 'paint', [0, y - 0.03, z], [0, 0, 0], [1, 1, 1.07]);
  b.add(b.cyl(0.137, 0.137, 0.024, 22), 'head', 'trim', [0, y + 0.05, z], [0, 0, 0], [1, 1, 1.07]);
  b.add(b.cyl(0.14, 0.14, 0.02, 22), 'head', 'paint', [0, y - 0.11, z], [0, 0, 0], [1, 1, 1.07]);
  // faceplate: two angled halves meet in a keel (reads as a beak-like front in silhouette)
  b.add(b.cbox(0.03, 0.15, 0.03, 0.01), 'head', 'paint', [0, y - 0.04, z + 0.148]);
  b.add(b.cbox(0.012, 0.13, 0.02, 0.004), 'head', 'trim', [0, y - 0.04, z + 0.163]);
  b.add(b.cbox(0.2, 0.026, 0.03, 0.006), 'head', 'eye', [0, y + 0.035, z + 0.138]);
  b.add(b.tor(0.14, 0.012, 22, 4, PI * 0.8), 'head', 'paint', [0, y + 0.058, z], [PI / 2, 0, PI * 0.1 + PI / 2 - PI * 0.4], [1, 1.07, 1]);   // brow ridge over the slit
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.008, 0.035, 0.02, 0.002), 'head', 'metal', [0.04 + i * 0.017, y - 0.06, z + 0.142 - i * 0.012], [0, 0.35 + i * 0.1, 0]);
  rivets(b, 'head', 'trim', [[0.13, y - 0.07, z + 0.05], [0.12, y + 0.05, z + 0.08], [0.135, y - 0.07, z - 0.06]], 0.011);
  // crown: iron/gold circlet with five points (R0: plain band), gem sockets glow from R3
  const cH = rk >= 4 ? 0.075 : 0.05, cP = rk >= 4 ? 0.09 : 0.06;
  b.add(b.cyl(0.148, 0.143, 0.045, 24, true), 'head', 'trim', [0, y + 0.085, z], [0, 0, 0], [1, 1, 1.07]);
  if (rk >= 1) for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.52, tall = i % 2 === 0, h = tall ? cH + cP : cH * 0.9;
    const pt = fin(b, [[-0.032, 0], [0.032, 0], [0.018, h * 0.6], [0, h], [-0.018, h * 0.6]], 0.012, 0.004);
    b.add(pt, 'head', 'trim', [Math.sin(a) * 0.15, y + 0.095, z + Math.cos(a) * 0.158], [-0.12, a, 0]);
    if (tall && !far) b.add(b.sph(8, 6), 'head', rk >= 3 ? 'glow' : 'eye', [Math.sin(a) * 0.162, y + 0.11 + h * 0.15, z + Math.cos(a) * 0.17], [0, 0, 0], 0.014);
  }
  // R2 plume: a swept blue horsehair crest from the crown's back
  if (rk >= 2) {
    b.add(b.tube([[0, y + 0.15, z - 0.02], [0, y + 0.22, z - 0.1], [0, y + 0.19, z - 0.22], [0, y + 0.08, z - 0.3], [0, y - 0.05, z - 0.32]], 0.035, 14, 7), 'head', 'accent');
    b.add(b.cyl(0.03, 0.022, 0.06, 10), 'head', 'trim', [0, y + 0.14, z - 0.01]);
  }
  // R4: gold wing crest on the helm sides
  if (rk >= 4) for (const s of [1, -1]) {
    const w = fin(b, [[0, 0], [0.05, 0.01], [0.2, 0.12], [0.26, 0.24], [0.16, 0.16], [0.18, 0.21], [0.08, 0.12], [0.08, 0.16], [0, 0.08]], 0.018, 0.005);
    b.add(w, 'head', 'trim', [s * 0.135, y + 0.02, z - 0.02], [0, s > 0 ? -PI / 2 + 0.25 : PI / 2 - 0.25, 0], [s > 0 ? -1 : 1, 1, 1]);
  }
  // R5: the Hollow Crown, a spectral crown of rift light floating above the helm
  if (rk >= 5) {
    b.add(b.tor(0.2, 0.012, 32, 5), 'head', 'glow', [0, y + 0.36, z], [PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2;
      b.add(fin(b, [[-0.03, 0], [0.03, 0], [0, i % 2 ? 0.09 : 0.15]], 0.01, 0.003), 'head', 'glow', [Math.sin(a) * 0.2, y + 0.36, z + Math.cos(a) * 0.2], [0, a, 0]);
    }
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  // mail under-layer + barrel breastplate (ellipsoid) with a keel, gold neckline + engraved chevrons following the curve, gorget
  P(b, 'chest', 'metal', [0.48, 0.42, 0.32], [0, 0.1, -0.02], [0, 0, 0], { c: 0.05 });
  const BC = [0, 0.13, 0.02], BR = [0.29, 0.24, 0.21];
  b.add(b.sph(26, 18), 'chest', 'paint', BC, [0, 0, 0], BR);
  const ell = (a, e, k = 1.035) => [BC[0] + BR[0] * k * Math.sin(a) * Math.cos(e), BC[1] + BR[1] * k * Math.sin(e), BC[2] + BR[2] * k * Math.cos(a) * Math.cos(e)];
  const curve = (pts, r, slot = 'trim') => b.add(b.tube(pts, r, 16, 5), 'chest', slot);
  b.add(b.tube([-0.5, -0.2, 0.1, 0.4, 0.6].map((e) => ell(0, e, 1.0)), 0.02, 14, 6), 'chest', 'paint');
  curve([-1.1, -0.7, -0.35, 0, 0.35, 0.7, 1.1].map((a) => ell(a, 0.62 - Math.abs(a) * 0.12)), 0.012);
  for (const s of [1, -1]) {
    curve([[0.12, 0.5], [0.45, 0.3], [0.85, 0.12]].map(([a, e]) => ell(s * a, e)), 0.008);
    curve([[0.12, 0.2], [0.42, 0.02], [0.8, -0.14]].map(([a, e]) => ell(s * a, e)), 0.007);
  }
  curve([-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2].map((a) => ell(a, -0.55)), 0.01);
  b.add(b.cyl(0.15, 0.2, 0.08, 22), 'chest', 'paint', [0, 0.335, 0.0], [0, 0, 0], [1, 1, 0.9]);
  b.add(b.tor(0.15, 0.018, 22, 6), 'chest', 'trim', [0, 0.375, 0.0], [PI / 2, 0, 0], [1, 0.9, 1]);
  b.add(fin(b, crownPts(0.06, 0.035, 0.04), 0.02, 0.004), 'chest', 'trim', [0, 0.215, 0.224], [-0.2, 0, 0]);
  if (rk >= 3) b.add(b.sph(10, 8), 'chest', 'glow', [0, 0.235, 0.232], [0, 0, 0], [0.016, 0.016, 0.01]);
  rivets(b, 'chest', 'trim', [ell(0.95, 0.35, 1.0), ell(1.05, 0.0, 1.0), ell(0.9, -0.35, 1.0)], 0.012);
  // plackart + faulds (lames over the belly and hips)
  b.add(b.cyl(0.19, 0.18, 0.2, 18), 'spine', 'metal', [0, 0.07, -0.01], [0, 0, 0], [1, 1, 0.8]);
  b.add(b.sph(22, 12), 'spine', 'paint', [0, 0.06, 0.03], [0, 0, 0], [0.22, 0.12, 0.17]);
  b.add(b.tor(0.2, 0.01, 22, 4, PI), 'spine', 'trim', [0, 0.1, 0.03], [PI / 2, 0, 0], [1.05, 0.82, 1]);
  // belt: dark leather + gold buckle + side pouches
  b.add(b.cyl(0.19, 0.2, 0.07, 20), 'pelvis', 'metal', [0, 0.045, 0], [0, 0, 0], [1, 1, 0.82]);
  b.add(b.cbox(0.08, 0.075, 0.035, 0.01), 'pelvis', 'trim', [0, 0.045, 0.16]);
  if (!far) b.sym(b.rbox(0.07, 0.08, 0.05, 0.015), 'pelvis', 'metal', [0.17, 0.0, 0.08], [0, 0.6, 0]);
  P(b, 'pelvis', 'metal', [0.34, 0.2, 0.27], [0, -0.04, 0], [0, 0, 0], { c: 0.04 });
  for (let i = 0; i < 2; i++) PS(b, 'pelvis', 'paint', [0.14, 0.09, 0.2], [0.17 + i * 0.012, -0.0 - i * 0.07, 0.02], [0, 0, 0.22 + i * 0.06], { c: 0.02, bx: 1.15 });
  PS(b, 'pelvis', 'trim', [0.15, 0.014, 0.205], [0.185, -0.11, 0.02], [0, 0, 0.28]);
  // short blue skirt under the faulds (cloth), tabard flaps on aux1/aux3
  b.add(b.cyl(0.2, 0.25, 0.2, 18, true), 'pelvis', 'accent', [0, -0.11, 0], [0, 0, 0], [1, 1, 0.82]);
  const len = rk === 0 ? 0.42 : 0.56;
  const flap = (w, l) => [[-w, 0], [w, 0], [w * 0.9, -l * 0.86], [0, -l], [-w * 0.9, -l * 0.86]];
  for (const [bone, z, s] of [['aux1', 0.0, 1], ['aux3', 0.0, -1]]) {
    b.add(b.ext(flap(0.15, len), 0.022, 0.006), bone, 'accent', [0, 0, z]);
    b.add(b.ext(flap(0.165, len + 0.025), 0.012, 0.003), bone, 'trim', [0, 0.004, z - s * 0.012]);
    b.add(b.cbox(0.3, 0.03, 0.03, 0.008), bone, 'trim', [0, -0.005, z]);
  }
  // tabard emblem: gold crown over a white-steel bar
  if (rk >= 1) {
    b.add(fin(b, crownPts(0.075, 0.045, 0.05), 0.03, 0.005), 'aux1', 'trim', [0, -0.2, 0.012]);
    b.add(b.cbox(0.17, 0.02, 0.03, 0.006), 'aux1', 'trim', [0, -0.215, 0.012]);
    if (rk >= 3) b.add(b.cbox(0.012, 0.22, 0.026, 0.004), 'aux1', 'glow', [0, -0.38, 0.012]);
  }
}

function pauldrons(b, o) {
  const rk = o.rank, far = b.far;
  // domed spaulder + 3-4 stacked bell lames (frusta), gold edges, engraved; haute-piece neck guard at R2
  b.sym(b.sph(22, 12, 0, PI * 2, 0, PI * 0.5), 'upArm', 'paint', [0.04, 0.03, 0], [0, 0, -0.32], [0.19, 0.16, 0.21]);
  b.sym(b.cyl(0.19, 0.19, 0.03, 22), 'upArm', 'trim', [0.04, 0.025, 0], [0, 0, -0.32], [1, 1, 1.1]);
  const layers = rk >= 2 ? 4 : 3;
  for (let i = 0; i < layers; i++) {
    const r0 = 0.17 - i * 0.008, r1 = 0.2 - i * 0.008, y = -0.02 - i * 0.055, x = 0.06 + i * 0.022, rz = -0.36 - i * 0.07;
    b.sym(b.cyl(r0, r1, 0.06, 22), 'upArm', 'paint', [x, y, 0], [0, 0, rz], [1, 1, 1.08]);
    b.sym(b.cyl(r1 + 0.004, r1 + 0.004, 0.012, 22), 'upArm', 'trim', [x + 0.011 * 1.0, y - 0.03, 0], [0, 0, rz], [1, 1, 1.08]);
  }
  if (rk >= 2) {
    PS(b, 'upArm', 'paint', [0.035, 0.16, 0.3], [-0.02, 0.17, 0], [0, 0, 0.15], { c: 0.012, tz: 0.8 });
    PS(b, 'upArm', 'trim', [0.04, 0.018, 0.3], [-0.03, 0.25, 0], [0, 0, 0.15]);
  }
  // engraved gold scroll on the dome (glows rift-blue at R4)
  if (!far) {
    b.sym(b.tor(0.06, 0.007, 16, 3, PI * 1.4), 'upArm', rk >= 4 ? 'glow' : 'trim', [0.09, 0.13, 0.0], [0, 0, -0.45 + PI / 2]);
    rivets(b, 'upArm', 'trim', [[0.2, 0.0, 0.15], [0.2, 0.0, -0.15], [0.24, -0.08, 0.13]], 0.011);
  }
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, rk = o.rank;
  b.sym(b.cyl(0.06, 0.06, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  // mail sleeve + steel rerebrace
  b.sym(b.cyl(0.07, 0.062, ua, 12), 'upArm', 'metal', [0, -ua / 2, 0]);
  b.sym(b.cyl(0.085, 0.075, ua * 0.5, 16), 'upArm', 'paint', [0.0, -ua * 0.58, 0.0]);
  b.sym(b.cyl(0.088, 0.088, 0.014, 16), 'upArm', 'trim', [0.0, -ua * 0.34, 0]);
  // couter: elbow cop with a fan wing
  b.sym(b.sph(14, 10), 'foreArm', 'paint', [0, 0.0, -0.01], [0, 0, 0], [0.075, 0.075, 0.08]);
  b.sym(fin(b, [[0, -0.05], [0.07, -0.02], [0.08, 0.04], [0, 0.07]], 0.02, 0.006), 'foreArm', 'paint', [0.05, 0.0, -0.02], [0, PI / 2, 0]);
  // vambrace + flared gauntlet cuff
  b.sym(b.cyl(0.058, 0.05, fa * 0.9, 12), 'foreArm', 'metal', [0, -fa * 0.5, 0]);
  b.sym(b.cyl(0.072, 0.064, fa * 0.62, 16), 'foreArm', 'paint', [0.0, -fa * 0.52, 0]);
  b.sym(b.cbox(0.018, fa * 0.52, 0.02, 0.005), 'foreArm', 'trim', [0.07, -fa * 0.52, 0.0]);
  b.sym(b.cyl(0.085, 0.065, 0.08, 14), 'foreArm', 'paint', [0, -fa + 0.02, 0]);
  b.sym(b.cyl(0.087, 0.087, 0.012, 14), 'foreArm', 'trim', [0, -fa + 0.058, 0]);
  if (rk >= 3 && !far) b.sym(b.cbox(0.012, 0.11, 0.012, 0.003), 'foreArm', 'glow', [0.0, -fa * 0.5, 0.066]);
  // gauntlets: mail glove + steel back-of-hand lames
  for (const s of ['L', 'R']) {
    b.add(b.rbox(0.09, 0.11, 0.11, 0.025), 'hand' + s, 'metal', [0, -0.06, 0.005]);
    for (let i = 0; i < 2; i++) b.add(plate(b, 0.1, 0.045, 0.1, { c: 0.012, tx: 0.9 }), 'hand' + s, 'paint', [0, -0.035 - i * 0.04, 0.025], [0.25, 0, 0]);
  }
}

function legPlates(b, o) {
  const D = b.rig.D, far = b.far, rk = o.rank;
  // mail chausses
  b.sym(b.cyl(0.095, 0.075, D.thigh, 12), 'thigh', 'metal', [0, -D.thigh / 2, 0]);
  b.sym(b.cyl(0.07, 0.055, D.shin, 12), 'shin', 'metal', [0, -D.shin / 2, 0]);
  // cuisses (front thigh plates, two lames) + gold edge
  b.sym(b.sph(18, 14), 'thigh', 'paint', [0.0, -0.22, 0.025], [0.04, 0, 0], [0.105, 0.19, 0.1]);
  b.sym(b.cyl(0.1, 0.11, 0.07, 16), 'thigh', 'paint', [0.0, -0.03, 0.01], [0.1, 0, 0]);
  b.sym(b.cyl(0.113, 0.113, 0.012, 16), 'thigh', 'trim', [0.0, -0.068, 0.014], [0.1, 0, 0]);
  // poleyn (knee cop) + side fan (R2)
  b.sym(b.sph(14, 10), 'shin', 'paint', [0, 0.01, 0.06], [0, 0, 0], [0.085, 0.085, 0.075]);
  b.sym(b.sph(10, 8), 'shin', 'trim', [0, 0.01, 0.125], [0, 0, 0], [0.025, 0.025, 0.018]);
  if (rk >= 2) b.sym(fin(b, [[0, -0.06], [0.08, -0.03], [0.09, 0.05], [0, 0.08]], 0.018, 0.005), 'shin', 'paint', [0.06, 0.01, 0.02], [0, PI / 2, 0]);
  // greaves: full shin shell + front ridge
  b.sym(b.cyl(0.085, 0.07, D.shin * 0.78, 14), 'shin', 'paint', [0, -D.shin * 0.52, 0.006], [0, 0, 0], [1, 1, 1.1]);
  b.sym(b.cbox(0.02, D.shin * 0.7, 0.03, 0.006), 'shin', 'paint', [0, -D.shin * 0.52, 0.09]);
  b.sym(b.cyl(0.088, 0.088, 0.014, 14), 'shin', 'trim', [0, -D.shin * 0.14, 0.006], [0, 0, 0], [1, 1, 1.1]);
  if (rk >= 3 && !far) b.sym(b.cbox(0.01, D.shin * 0.4, 0.01, 0.003), 'shin', 'glow', [0.0, -D.shin * 0.5, 0.106]);
  // sabatons: layered toe lames
  b.sym(b.rbox(0.11, 0.075, 0.22, 0.03), 'foot', 'metal', [0, -D.ankle + 0.04, 0.05]);
  for (let i = 0; i < 3; i++) b.sym(plate(b, 0.115 - i * 0.008, 0.035, 0.08, { c: 0.01, tx: 0.85 }), 'foot', 'paint', [0, -D.ankle + 0.075 - i * 0.012, 0.0 + i * 0.065], [0.3, 0, 0]);
  b.sym(b.cyl(0.08, 0.075, 0.05, 12), 'foot', 'paint', [0, -D.ankle + 0.1, -0.01]);
}

function sword(b, o) {
  const rk = o.rank, far = b.far, H = 'handR';
  b.scope(GRIP_O, [BLADE_A, 0, 0], 1, () => {
    // leather grip, gold-wire bands, faceted pommel with a rift gem
    b.add(b.cyl(0.024, 0.026, 0.22, 10), H, 'metal', [0, 0, -0.02], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.026, 0.005, 10, 3), H, 'trim', [0, 0, -0.09 + i * 0.05]);
    b.add(b.sph(10, 8), H, 'trim', [0, 0, -0.15], [0, 0, 0], [0.045, 0.045, 0.04]);
    b.add(b.sph(8, 6), H, rk >= 3 ? 'glow' : 'eye', [0, 0, -0.192], [0, 0, 0], 0.016);
    // crossguard: long bar with downswept quillon tips and a gold ricasso block
    b.add(b.cbox(0.34, 0.036, 0.04, 0.01), H, 'trim', [0, 0, 0.1]);
    addM(b, fin(b, [[0, -0.02], [0.05, -0.02], [0.07, 0.035], [0.04, 0.02], [0, 0.02]], 0.04, 0.006), H, 'trim', [0.17, 0, 0.1], [PI / 2, 0, 0]);
    b.add(b.cbox(0.08, 0.05, 0.06, 0.012), H, 'trim', [0, 0, 0.115]);
    b.add(b.sph(8, 6), H, 'glow', [0, 0.0, 0.115], [0, 0, 0], [0.018, 0.03, 0.03]);
    // steel blade with a rift-blue fuller; edges light up at R3+
    const W = BW, z0 = 0.135;
    const body = [[-W / 2, 0], [W / 2, 0], [W * 0.46, BL * 0.84], [0, BL], [-W * 0.46, BL * 0.84]];
    b.add(b.ext(body, 0.022, 0.009), H, 'paint', [0, 0, z0], [PI / 2, 0, 0]);
    b.add(b.ext([[-W * 0.17, 0.02], [W * 0.17, 0.02], [W * 0.14, BL * 0.78], [0, BL * 0.84], [-W * 0.14, BL * 0.78]], 0.03, 0.004), H, 'glow', [0, 0, z0], [PI / 2, 0, 0]);
    if (rk >= 3) addM(b, b.cbox(0.008, 0.01, BL * 0.78, 0.003), H, 'glow', [W * 0.5, 0, z0 + BL * 0.4]);
  });
}

function shield(b, o) {
  const rk = o.rank, far = b.far;
  b.scope([0, 0, 0], SHIELD_FRAME, 1, () => b.scope([0.1, -0.13, 0.2], [0.06, 0.2, 0], 1, () => {
    const S = 'foreArmL';
    const kite = (k) => [[0, -0.58 * k], [0.2 * k, -0.2 * k], [0.26 * k, 0.12 * k], [0.24 * k, 0.26 * k], [0.12 * k, 0.32 * k], [0, 0.33 * k], [-0.12 * k, 0.32 * k], [-0.24 * k, 0.26 * k], [-0.26 * k, 0.12 * k], [-0.2 * k, -0.2 * k]];
    b.add(b.ext(kite(1.06), 0.05, 0.014), S, 'paint', [0, 0, -0.01]);
    b.add(b.ext(kite(0.95), 0.05, 0.012), S, 'accent', [0, 0, 0.012]);
    b.add(b.ext(kite(0.99), 0.03, 0.004), S, 'trim', [0, 0, 0.002]);
    if (rk === 0) { b.add(b.cbox(0.4, 0.04, 0.03, 0.008), S, 'metal', [0, 0.05, 0.04], [0, 0, 0.5]); }
    else {
      // heraldry: gold crown over a steel cross, gem boss
      b.add(b.cbox(0.05, 0.62, 0.025, 0.008), S, 'paint', [0, -0.12, 0.04]);
      b.add(b.cbox(0.38, 0.05, 0.025, 0.008), S, 'paint', [0, 0.06, 0.04]);
      b.add(fin(b, crownPts(0.1, 0.06, 0.07), 0.03, 0.006), S, 'trim', [0, 0.13, 0.045]);
      b.add(b.cyl(0.055, 0.065, 0.04, 16), S, 'trim', [0, 0.06, 0.048], [PI / 2, 0, 0]);
      b.add(b.sph(10, 8), S, rk >= 3 ? 'glow' : 'eye', [0, 0.06, 0.07], [0, 0, 0], [0.032, 0.032, 0.02]);
    }
    rivets(b, S, 'trim', [[0.21, 0.2, 0.03], [-0.21, 0.2, 0.03], [0.2, -0.12, 0.03], [-0.2, -0.12, 0.03], [0, -0.48, 0.03], [0, 0.3, 0.03]], 0.014, false);
    if (rk >= 3) {
      const e = kite(1.0);
      for (let i = 0; i < e.length; i++) {
        const a = e[i], c = e[(i + 1) % e.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 0.08) continue;
        b.add(b.cbox(0.012, len * 0.85, 0.014, 0.003), S, 'glow', [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.03], [0, 0, Math.atan2(c[1] - a[1], c[0] - a[0]) - PI / 2]);
      }
    }
    b.add(b.cbox(0.1, 0.32, 0.05, 0.015), S, 'metal', [0, -0.02, -0.045]);
  }));
}

function cape(b, o) {
  const rk = o.rank, far = b.far;
  if (rk < 2) return;
  // mantle bar with gold clasps; cape in two hinged panels (aux0 upper, aux2 lower, sway in post)
  b.add(b.cbox(0.48, 0.07, 0.08, 0.02), 'aux0', 'accent', [0, 0.0, 0.02]);
  b.sym(b.cyl(0.035, 0.035, 0.03, 12), 'aux0', 'trim', [0.2, 0.0, 0.07], [PI / 2, 0, 0]);
  const up = [[-0.25, 0], [0.25, 0], [0.29, -0.52], [-0.29, -0.52]];
  b.add(b.ext(up, 0.022, 0.006), 'aux0', 'accent', [0, 0, -0.01], [0.04, 0, 0]);
  const lo = [[-0.29, 0.03], [0.29, 0.03], [0.33, -0.48], [0.18, -0.55], [0.0, -0.5], [-0.18, -0.55], [-0.33, -0.48]];
  b.add(b.ext(lo, 0.022, 0.006), 'aux2', 'accent', [0, 0, -0.01]);
  if (rk >= 4) {
    b.add(b.ext([[0.29, 0], [0.315, 0], [0.355, -0.52], [0.325, -0.52]], 0.014, 0.003), 'aux0', 'trim', [0, 0, -0.012], [0.04, 0, 0]);
    b.add(b.ext([[-0.29, 0], [-0.315, 0], [-0.355, -0.52], [-0.325, -0.52]], 0.014, 0.003), 'aux0', 'trim', [0, 0, -0.012], [0.04, 0, 0]);
    b.add(b.ext(lo.map(([x, y]) => [x * 1.07, y * 1.06]), 0.012, 0.003), 'aux2', 'trim', [0, 0, -0.016]);
    b.add(fin(b, crownPts(0.11, 0.07, 0.08), 0.02, 0.005), 'aux0', 'trim', [0, -0.3, -0.03], [0, PI, 0]);
  }
  if (rk >= 5) b.add(b.ext(lo.map(([x, y]) => [x * 0.98, y < -0.4 ? y : -0.42]), 0.026, 0.003), 'aux2', 'glow', [0, 0, -0.012]);
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], 1.12, () => helm(b, o));
  torso(b, o);
  pauldrons(b, o);
  armsAndHands(b, o);
  legPlates(b, o);
  sword(b, o);
  shield(b, o);
  cape(b, o);
}

// ---------- anims ----------
const anims = {
  idle(P, t, ctx) {
    stance(P, ctx, t);
    // every ~9 s: two taunting raps of the blade's flat against the shield rim (Oathbound taunt)
    const c = t % 9, w = L.kf(c, [[0, 0], [5.6, 0], [6.0, 1], [7.6, 1], [8.1, 0]]);
    if (w > 0.001) {
      const rap = Math.max(0, Math.sin((c - 6.1) * 7.5)) * (c > 6.1 && c < 7.4 ? 1 : 0);
      swordIK(P, ctx, [0.0, 1.32 + 0.05 * rap, 0.42 - 0.04 * rap], [0.75, 0.55, 0.3], [0, 0, 1], w, 0.4);
      L.A(P, 'head', 0.1 * w, 0.1 * w, 0); L.A(P, 'chest', -0.02 * w, 0.12 * w, 0);
      L.A(P, 'upArmL', -0.1 * w, 0, 0);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'chest', -0.06, 0.06, 0); L.A(P, 'head', 0.05, -0.05, 0);
    guard(P, 0.5, 0);
    L.A(P, 'upArmL', -0.18, 0, 0);
    const sw = Math.sin(ctx.move.phase * PI * 2);
    swordIK(P, ctx, [-0.4, 1.1 + 0.02 * sw, 0.16], [-0.2, -0.35, 0.9], G_YH, 1, 0.45);
  },
  // Longsword Cut: shield high, blade wound over the right shoulder, diagonal cut down-left with a step (impact 0.42)
  attack(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.16, 1], [0.72, 1], [1, 0]]);
    const tw = L.kf(u, [[0, 0], [0.28, -0.5], [0.42, 0.5], [0.62, 0.55], [1, 0]]);
    const cut = L.kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.66, 1], [1, 0]]);
    L.pel(P, 0, -0.06 - 0.1 * cut, 0.15 * cut);
    L.A(P, 'pelvis', 0, tw * 0.25, 0); L.A(P, 'spine', 0.16 * cut - 0.06 * (1 - cut) * w, tw * 0.3, 0); L.A(P, 'chest', 0.06 * cut, tw * 0.4, 0);
    L.A(P, 'head', -0.05 * cut, -tw * 0.5, 0);
    L.A(P, 'upArmL', -0.2 * w + 0.15 * cut, 0, 0.1 * cut);
    swordIK(P, ctx,
      kv(u, [[0, [-0.48, 1.9, -0.1]], [0.28, [-0.48, 1.94, -0.12]], [0.42, [0.04, 1.06, 0.62]], [0.62, [0.3, 0.98, 0.38]], [1, [0.3, 0.98, 0.38]]]),
      kv(u, [[0, [-0.3, 0.55, -0.78]], [0.28, [-0.3, 0.55, -0.78]], [0.42, [0.55, -0.42, 0.72]], [0.62, [0.92, -0.32, -0.15]], [1, [0.92, -0.32, -0.15]]]),
      [0.55, 0.6, -0.3], w, 0.45);
    L.plant(P, ctx, 0.19 + 0.24 * cut, -0.12 - 0.12 * cut, 1.34 + 0.08 * cut, 0, 0.2 * cut);
  },
  // shield bash into a rising backhand: shield punches out (0.3), blade sweeps up from low left through the target (impact 0.48)
  attack_alt(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.12, 1], [0.78, 1], [1, 0]]);
    const bash = L.kf(u, [[0, 0], [0.18, -0.3], [0.3, 1], [0.42, 0.6], [0.6, 0], [1, 0]]);
    const sw = L.kf(u, [[0, 0], [0.36, 0], [0.48, 1], [0.66, 1], [1, 0]]);
    L.pel(P, 0, -0.08 - 0.06 * Math.max(bash, sw), 0.14 * Math.max(0, bash) + 0.1 * sw);
    L.A(P, 'pelvis', 0, 0.3 * Math.max(0, bash) - 0.35 * sw, 0); L.A(P, 'spine', 0.1 * Math.max(0, bash), 0.2 * Math.max(0, bash) - 0.3 * sw, 0);
    L.A(P, 'chest', 0, 0.15 * Math.max(0, bash) - 0.3 * sw, 0);
    L.A(P, 'upArmL', -0.75 * Math.max(0, bash), 0, -0.2 * Math.max(0, bash)); L.A(P, 'foreArmL', 0.5 * Math.max(0, bash), 0, 0);
    swordIK(P, ctx,
      kv(u, [[0, [-0.42, 1.08, 0.22]], [0.3, [-0.2, 0.92, 0.02]], [0.36, [0.1, 0.9, 0.12]], [0.48, [-0.12, 1.42, 0.62]], [0.66, [-0.5, 1.7, 0.3]], [1, [-0.5, 1.7, 0.3]]]),
      kv(u, [[0, G_DIR], [0.3, [0.6, -0.5, 0.6]], [0.36, [0.85, -0.3, 0.4]], [0.48, [-0.1, 0.25, 0.96]], [0.66, [-0.8, 0.5, 0.3]], [1, [-0.8, 0.5, 0.3]]]),
      [0, 1, 0], w, 0.4);
    L.plant(P, ctx, 0.19 + 0.26 * Math.max(0, bash), -0.12 - 0.1 * sw, 1.34);
  },
  // Oathbound: blade raised upright before the visor, then planted point-down as the oath is sworn (cast 0.55)
  cast(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.85, 1], [1, 0]]), plantK = L.kf(u, [[0, 0], [0.4, 0], [0.55, 1], [0.85, 1], [1, 0]]);
    L.A(P, 'head', 0.15 * plantK - 0.1 * k * (1 - plantK), 0, 0); L.A(P, 'chest', 0.06 * plantK - 0.06 * k, 0, 0);
    L.A(P, 'upArmL', -0.15 * k, 0, -0.1 * k);
    const up = [-0.08, 1.56, 0.32], dn = [-0.12, 1.02, 0.46];
    swordIK(P, ctx, [up[0] + (dn[0] - up[0]) * plantK, up[1] + (dn[1] - up[1]) * plantK, up[2] + (dn[2] - up[2]) * plantK],
      [0.02 * (1 - plantK), 1 - 2 * plantK, 0.1], [0, 0, 1], k, 0.35);
    P[L.PX + 1] += 0.03 * k - 0.07 * plantK;
  },
  // SHIELDWALL CHARGE: brace low behind the shield (cast 0.04), drive forward and slam the shield (impact 0.25 = sim release),
  // wrench the sword up over the shield rim and smite down (impact 0.5), then stand tall in guard
  overdrive(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.04, 1], [0.86, 1], [0.98, 0]]);
    const brace = L.kf(u, [[0, 0], [0.08, 1], [0.17, 1], [0.25, 0.4], [0.4, 0.5], [0.5, 0.9], [0.66, 0.8], [0.84, 0], [1, 0]]);
    const drive = L.kf(u, [[0, 0], [0.12, -0.15], [0.22, 1], [0.32, 1], [0.6, 0.9], [0.85, 0], [1, 0]]);
    const sh = L.kf(u, [[0, 0], [0.08, 0.7], [0.2, 1], [0.27, 1.2], [0.4, 0.6], [0.5, 0.4], [0.75, 0.5], [0.9, 0], [1, 0]]);
    const smite = L.kf(u, [[0, 0], [0.32, 0], [0.42, -1], [0.5, 1], [0.7, 1], [0.86, 0], [1, 0]]);
    L.pel(P, 0, -0.06 - 0.2 * brace, 0.36 * drive);
    const lead = sh * (1 - Math.abs(smite));
    L.A(P, 'pelvis', 0.08 * brace, -0.35 * lead, 0);
    L.A(P, 'spine', 0.22 * brace + 0.1 * Math.max(0, smite), -0.2 * lead, 0); L.A(P, 'chest', 0.08 * brace - 0.12 * Math.max(0, -smite), -0.15 * lead, 0);
    L.A(P, 'head', -0.2 * brace, 0.5 * lead, 0);
    // shield punched out front and centre
    L.RS(P, 'upArm', 'L', -0.4 - 0.75 * sh, -0.14 + 0.25 * sh, 0.3 - 0.12 * sh);
    L.RS(P, 'foreArm', 'L', -1.2 + 0.55 * sh, 0, 0);
    swordIK(P, ctx,
      kv(u, [[0, [-0.42, 1.08, 0.22]], [0.08, [-0.5, 1.1, -0.25]], [0.25, [-0.5, 1.15, -0.2]], [0.42, [-0.3, 2.0, 0.05]], [0.5, [-0.05, 1.05, 0.85]], [0.7, [-0.05, 1.0, 0.82]], [0.86, [-0.42, 1.08, 0.22]], [1, [-0.42, 1.08, 0.22]]]),
      kv(u, [[0, G_DIR], [0.08, [-0.4, 0.1, -0.9]], [0.25, [-0.4, 0.2, -0.9]], [0.42, [0, 0.5, -0.86]], [0.5, [0, -0.45, 0.9]], [0.7, [0, -0.45, 0.9]], [0.86, G_DIR], [1, G_DIR]]),
      [1, 0, 0], w, 0.35);
    L.plant(P, ctx, 0.2 + 0.38 * Math.max(0, drive), -0.14 - 0.2 * brace + 0.15 * Math.max(0, drive), 1.4 + 0.1 * brace, 0, 0.15 * brace);
  },
  hit(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.08 * k; P[L.PX + 1] -= 0.05 * k;
    L.A(P, 'pelvis', -0.05 * k, 0.08 * k * d, 0);
    L.A(P, 'spine', -0.12 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.14 * k, 0.1 * k * d, 0.04 * k * d);
    L.A(P, 'head', -0.22 * k, -0.15 * k * d, 0.12 * k * d);
    L.A(P, 'upArmL', -0.5 * k, 0, -0.1 * k); L.A(P, 'foreArmL', 0.25 * k, 0, 0);
    L.A(P, 'upArmR', 0.15 * k, 0, 0.12 * k);
    L.plant(P, ctx, 0.14, -0.16, 1.28);
  },
  // drops to a knee leaning on the planted sword, the shield slides off the arm, then topples sideways
  die(P, u, ctx) {
    const v = u < 0.3 ? u / 0.3 * 0.42 : u < 0.66 ? 0.42 + (u - 0.3) / 0.36 * 0.12 : 0.54 + (u - 0.66) / 0.34 * 0.46;
    L.dieB(P, v, ctx);
    const w = L.kf(u, [[0, 0], [0.22, 1], [0.62, 1], [0.76, 0]]);
    const slump = L.kf(u, [[0.3, 0], [0.62, 1]]);
    L.A(P, 'head', 0.45 * slump, 0, 0); L.A(P, 'chest', 0.15 * slump, 0, 0);
    swordIK(P, ctx, [-0.2, 0.84 - 0.08 * slump, 0.5], [0.02, -1, 0.15], [1, 0, 0], w, 0.4);
    L.A(P, 'upArmL', 0.3 * slump, 0, 0.3 * slump);
  },
  // lands on one knee behind the shield, sword planted; rises, sweeps the blade out and settles into guard (land 0.4, ready 0.85)
  deploy(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0.4], [0.32, 0.5], [0.4, 1], [0.62, 1], [0.84, 0], [1, 0]]);
    P[L.PX + 1] -= 0.4 * land; P[L.PX + 2] += 0.1 * land;
    L.A(P, 'spine', 0.28 * land, 0, 0); L.A(P, 'chest', 0.1 * land, 0, 0);
    L.A(P, 'head', L.kf(u, [[0, 0.3], [0.6, 0.4], [0.74, -0.25], [0.9, 0], [1, 0]]), 0, 0);
    L.A(P, 'upArmL', -0.45 * land, 0.2 * land, 0.0);
    swordIK(P, ctx, kv(u, [[0, [-0.26, 0.95, 0.48]], [0.62, [-0.26, 0.92, 0.48]], [0.76, [-0.62, 1.2, 0.2]], [1, G_HAND]]),
      kv(u, [[0, [0.02, -1, 0.15]], [0.62, [0.02, -1, 0.15]], [0.76, [-0.9, -0.15, 0.4]], [1, G_DIR]]), [1, 0, 0],
      L.kf(u, [[0, 1], [0.7, 1], [0.95, 0]]), 0.4);
    L.plant(P, ctx, 0.22 + 0.18 * land, -0.14 - 0.3 * land, 1.3, 0, 0.85 * land);
  },
  // sword raised to the sky, shield on the hip, a proud slow pump; the cape billows
  victory(P, t, ctx) {
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7)), pump = Math.max(0, Math.sin(t * 2.4)) * k;
    L.A(P, 'chest', -0.12 * k, 0.1 * k, 0); L.A(P, 'head', -0.22 * k, 0.1 * k, 0);
    L.A(P, 'upArmL', 0.25 * k, 0, 0.2 * k); L.A(P, 'foreArmL', 0.4 * k, 0, 0);
    swordIK(P, ctx, [-0.26, 2.12 + 0.06 * pump, 0.1], [0.08, 1, 0.08], [0, 0, 1], k, 0.3);
    ctx.capeAdd = (0.2 + 0.1 * Math.sin(t * 3.1)) * k;
    P[L.PX + 1] += 0.025 * pump;
  },
};

export default {
  id: 'knight', name: 'RIFT KNIGHT', role: 'tank', faction: 'order', rarity: 'rare', realm: 'fantasy',
  rig: 'biped', dims: DIMS, height: 1.98, radius: 0.62, walkSpeed: 1.25, cadence: 0.85, scheme: 'dark',
  style: { weapon: 'blade', heavy: 0.5, stance: 1.3 },
  mats: {
    all: {
      paint: { color: 0x8e98a6, metal: 0.45, rough: 0.6, env: 0.5,   /* robots touch-up: matte, read as chrome balls from above */ panel: { grime: 0.1, grimeScale: 16, stretch: 0.15 }, detail: { map: engrave, scale: 3.2, albedo: 0.85, rough: 0.45, scratch: 0.3 } },
      metal: { color: 0x34363c, metal: 0.7, rough: 0.55 },
      accent: { rough: 0.78 },
      trim: { rough: 0.26 },
      glow: { color: 0x48a8ff },
      eye: { color: 0x9fd8ff },
    },
  },
  sockets: { muzzle: ['handR', [0, GRIP_O[1] - Math.sin(BLADE_A) * (0.135 + BL * 0.8), Math.cos(BLADE_A) * (0.135 + BL * 0.8)]], core: [0, 0.17, 0.24], head: [0, 0.12, 0.15], hand: ['handR', [0, -0.08, 0]] },
  events: { attack: [['impact', 0.42]], attack_alt: [['impact', 0.3], ['impact', 0.48]], cast: [['cast', 0.55]], overdrive: [['cast', 0.04], ['impact', 0.25], ['impact', 0.5]], die: [['down', 0.84]], deploy: [['land', 0.4], ['ready', 0.85]] },
  durs: { attack: 0.95, attack_alt: 1.0, cast: 1.2, overdrive: 2.4, hit: 0.45, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.2), an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    // tabard flaps follow the legs (front flap swings with the forward thigh, back flap with the trailing one)
    const tl = P[BI.thighL * 3], tr = P[BI.thighR * 3], pel = P[BI.pelvis * 3];
    const flutter = 0.03 * Math.sin(t * 2.3) + 0.06 * mv * Math.sin(t * 9);
    P[BI.aux1 * 3] = Math.min(tl, tr, 0) * 0.85 - pel * 0.5 + flutter;
    P[BI.aux3 * 3] = Math.max(tl, tr, 0) * 0.85 - pel * 0.5 - flutter + 0.04;
    // cape: hangs back off the shoulders, billows when moving / charging
    let sway = 0.05 + 0.03 * Math.sin(t * 1.7) + 0.3 * mv, top = 0.03 * Math.sin(t * 1.3) + 0.12 * mv;
    if (an === 'overdrive') { const a = L.kf(u, [[0, 0], [0.22, 1], [0.6, 0.8], [0.9, 0], [1, 0]]); sway += 0.55 * a; top += 0.3 * a; }
    if (an === 'attack' || an === 'attack_alt') sway += 0.2 * L.kf(u, [[0, 0], [0.42, 1], [1, 0]]);
    if (an === 'deploy') sway += 0.8 * L.kf(u, [[0, 1], [0.38, 1], [0.5, 0.1], [1, 0]]);
    sway += ctx.capeAdd || 0; ctx.capeAdd = 0;
    if (an === 'die') sway *= 1 - u;
    P[BI.aux0 * 3] = top - P[BI.chest * 3] * 0.6 - P[BI.spine * 3] * 0.6; P[BI.aux2 * 3] = sway;
  },
  fxHints: { impact: 'rift_slash', overdrive: 'shieldwall_charge', color: 0x48a8ff, blade: 0x9fd8ff },
  build,
};
