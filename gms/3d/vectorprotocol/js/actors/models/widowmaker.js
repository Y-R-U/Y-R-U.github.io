// WIDOWMAKER, rogue legendary archer "Ghost Contract" (sculptor-9). Also the model of map 3's boss CORONA (boss_corona,
// corporate tint, x1.35). Brief: docs/ROSTER.md `widowmaker`. Tall, thin, long-legged sniper in a tattered cloak of panels,
// a hooded head with one gold scope-eye, high cloak fins framing the head, an anti-materiel rifle longer than her body
// (huge muzzle brake, long scope, folding bipod), a black-widow hourglass on the chest.
// VALUE: `accent` = black armour/cloak (most of the surface; pearl white in the corporate tint = CORONA, the league champion),
// `paint` = gold on the read-shapes (hood crest, fins, rifle receiver, cloak edges), `metal` = gunmetal joints/barrel,
// `trim` = rogue oxblood lining (navy for corporate), `glow` = faction lights (muzzle, hourglass, vents), `eye` = the gold eye.
// Rank tiers (legendary default R3): R0 short cloak, no scope shade · R1 full cloak · R2 shoulder blades, 3rd cloak row, scope
//   sunshade · R3 hourglass + rifle lights, reticle crown behind the head (base) · R4 hardlight cloak: glowing hems, two pairs
//   of spider-leg fins arching off the back · R5 the gold eye leaves a trail, cloak edges glow, brighter reticle crown.
// Technique: lancer-style precomputed aim pose -> RIFLE_FRAME on handR (rifle authored in plain root space); `aimRifle()`
// orients the rifle along any root-space direction (recoil climb, prone, shouldered victory). aux1 (handR) = bolt carrier that
// cycles in tick(); aux2 (handR) = bipod, folds/unfolds by quaternion in tick(); aux0 (chest) / aux3 (aux0) = the cloak rows.
// Overdrive LAST LIGHT: the cloak glitches her out of sight, she reappears prone on the bipod, fires (0.23), rises.
import { THREE, P, PS, plate, fin, discX, legs, poseFrame, makeRig, LIB, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.43, shin: 0.45, ankle: 0.1, hipX: 0.1, hipY: -0.04, spine: 0.11, chest: 0.2, neck: 0.24, headOff: 0.04,
  clavX: 0.05, clavY: 0.19, shoulder: 0.15, upArm: 0.3, foreArm: 0.29,
  parents: { aux1: 'handR', aux2: 'handR', aux3: 'aux0' },
  aux0: [0, 0.2, -0.13], aux3: [0, -0.4, -0.05],
};
const L = LIB;
const HAND_T = [-0.1, 1.36, 0.22];  // right hand (grip) in root space when aiming
const BORE = 0.06;                  // bore height above the grip (rifle space)
const FOREGRIP = [0, -0.005, 0.36]; // handguard grip for the off hand (rifle space)
const RL = 1.5;                     // muzzle distance from the grip

function aimBody(P, k = 1) {
  L.A(P, 'pelvis', 0, -0.32 * k, 0);
  L.A(P, 'spine', 0.02 * k, -0.12 * k, 0);
  L.A(P, 'chest', -0.02 * k, -0.08 * k, 0);
  L.R(P, 'neck', 0.04 * k, 0.24 * k, 0);
  L.R(P, 'head', 0.1 * k, 0.3 * k, 0.12 * k);
  L.R(P, 'clavR', 0, -0.06 * k, 0.04 * k);
}
const _t = new THREE.Vector3();
// precompute the aim pose -> rifle frame on handR
const RIG = makeRig(DIMS);
const AIM_P = new Float32Array(L.NCH);
{
  const ctx = { D: RIG.D, rig: RIG };
  L.R(AIM_P, 'pelvis', 0.03, 0, 0); L.R(AIM_P, 'spine', 0.05, 0, 0); L.R(AIM_P, 'chest', 0.02, 0, 0);
  aimBody(AIM_P, 1);
  L.armIK(AIM_P, ctx, 'R', _t.set(HAND_T[0], HAND_T[1], HAND_T[2]), 0.35);
  L.R(AIM_P, 'handR', 0, 0, 0);
}
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const RIFLE_FRAME = poseFrame(RIG, poseOf(AIM_P), 'handR');
const Q_RF = new THREE.Quaternion().setFromEuler(new THREE.Euler(RIFLE_FRAME[0], RIFLE_FRAME[1], RIFLE_FRAME[2], 'XYZ'));
const Q_RF_INV = Q_RF.clone().invert();
const rot = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(Q_RF).toArray();
const GRIP = rot(FOREGRIP);
const MUZZLE = rot([0, BORE, RL + 0.02]);
const AXIS = rot([0, 0, 1]), XAX = new THREE.Vector3(...rot([1, 0, 0]));
const BIPOD = rot([0, BORE - 0.05, 0.86]);
DIMS.aux1 = [0, 0, 0];
DIMS.aux2 = BIPOD;

// ---------- pose helpers ----------
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
const _qf = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
// orient handR so the rifle points along `dir` (root space) with its top toward `up`
function aimRifle(P, ctx, dir, up = [0, 1, 0]) {
  const { q } = L.fkBone(P, ctx, 'foreArmR', _p, _qf);
  _z.set(dir[0], dir[1], dir[2]).normalize();
  _y.set(up[0], up[1], up[2]); _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-4) _y.set(0, 0, -1).addScaledVector(_z, -_z.z);
  _y.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _qb.setFromRotationMatrix(_m).multiply(Q_RF_INV);
  _qb.premultiply(q.invert());
  _e.setFromQuaternion(_qb, 'YXZ');
  L.R(P, 'handR', _e.x, _e.y, _e.z);
}
function hold(P, ctx, tgt, dir, up, out = 0.35) {
  L.armIK(P, ctx, 'R', _t.set(tgt[0], tgt[1], tgt[2]), out);
  aimRifle(P, ctx, dir, up);
}
function kv(u, keys) { return [0, 1, 2].map((c) => L.kf(u, keys.map((k) => [k[0], k[1][c]]))); }
// shouldered aim stance; k = 1 fully on the scope
function stance(P, ctx, t, k = 1) {
  L.idle(P, ctx, t);
  const br = Math.sin(t * 1.2);
  aimBody(P, k);
  hold(P, ctx, [HAND_T[0], HAND_T[1] + br * 0.006, HAND_T[2]], [0, br * 0.006, 1]);
  L.plant(P, ctx, 0.22, -0.2, 1.4);
}

// ---------- greebles ----------
function lamp(b, bone, pos, rot2, r = 0.022, slot = 'eye', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.018, 14), bone, 'metal', pos, rot2);
  put(b.cyl(r, r, 0.026, 14), bone, slot, pos, rot2);
}
function cylAB(b, p, q, r0, r1 = r0, seg = 10) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], Ln = Math.hypot(dx, dy, dz);
  const g = b.cyl(r1, r0, Ln, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
// tattered cloak blade hanging down from its top edge (jagged hem); n picks the hem cut
function rag(b, len, w, n, t = 0.016) {
  const cut = [[0.86, 0.74, 1, 0.8, 0.92], [0.95, 0.8, 0.88, 1, 0.78], [0.8, 1, 0.84, 0.9, 0.7]][n % 3];
  return fin(b, [[-w / 2, 0], [w / 2, 0], [w * 0.5, -len * cut[0]], [w * 0.22, -len * cut[1]], [0, -len * cut[2]], [-w * 0.24, -len * cut[3]], [-w * 0.5, -len * cut[4]]], t, 0.005);
}
const hourglass = (b, h, w, d) => [b.ext([[-w, h], [w, h], [0, 0.004]], d, 0.003), b.ext([[0, -0.004], [w, -h], [-w, -h]], d, 0.003)];

// ---------- parts ----------
function head(b, o) {
  const rk = o.rank, far = b.far, y = 0.08;
  // black glass skull deep inside a tall pointed hood (cowl peaks forward over the face), gold crest + hood edges
  b.add(b.rbox(0.12, 0.16, 0.16, 0.045), 'head', 'metal', [0, y - 0.005, 0.0]);
  P(b, 'head', 'accent', [0.2, 0.24, 0.24], [0, y + 0.04, -0.03], [0.18, 0, 0], { c: 0.03, tx: 0.35, tz: 0.55, sz: 0.06 });
  P(b, 'head', 'paint', [0.03, 0.06, 0.26], [0, y + 0.15, -0.0], [0.18, 0, 0], { c: 0.008, tx: 0.6, sz: 0.04 });
  b.add(fin(b, [[0.13, -0.01], [0.17, 0.0], [0.04, 0.09], [-0.22, 0.12], [-0.27, 0.09], [-0.06, 0.04]], 0.018, 0.005), 'head', 'paint', [0, y + 0.12, 0.02], [0, PI / 2, 0]);
  // hood sides frame the face: long flaps sweeping down to the collar, gold inner edge
  PS(b, 'head', 'accent', [0.035, 0.26, 0.22], [0.095, y - 0.02, 0.0], [0.12, 0, -0.1], { c: 0.01, bz: 0.6, tz: 0.8 });
  PS(b, 'head', 'paint', [0.01, 0.22, 0.012], [0.08, y - 0.02, 0.105], [0.12, 0, -0.1]);
  PS(b, 'head', 'trim', [0.008, 0.2, 0.18], [0.115, y - 0.02, -0.005], [0.12, 0, -0.1]);
  PS(b, 'head', 'accent', [0.03, 0.22, 0.12], [0.07, y + 0.05, -0.12], [-0.35, 0, -0.3], { c: 0.008, tx: 0.4 });
  b.sym(fin(b, [[0, 0], [0.05, 0], [0.09, 0.12], [0.07, 0.13]], 0.016, 0.004), 'head', 'paint', [0.1, y + 0.02, -0.08], [0, PI / 2 + 0.3, -0.2]);
  // brow peak (the cowl's point) overhanging the face, dark mask, chin
  b.add(fin(b, [[-0.08, 0], [0.08, 0], [0.0, 0.1]], 0.03, 0.006), 'head', 'accent', [0, y + 0.1, 0.11], [PI / 2 + 0.55, 0, PI]);
  P(b, 'head', 'accent', [0.12, 0.1, 0.03], [0, y - 0.03, 0.085], [-0.08, 0, 0], { c: 0.01, bx: 0.6 });
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.05, 0.007, 0.014, 0.002), 'head', 'metal', [0.025, y - 0.045 - i * 0.013, 0.103], [-0.08, 0, 0]);
  P(b, 'head', 'paint', [0.06, 0.03, 0.05], [0, y - 0.09, 0.07], [-0.3, 0, 0], { c: 0.008, bx: 0.6 });
  // the scope-eye: gold bezel, gunmetal tube, gold lens
  const ex = -0.03, ey = y + 0.02;
  b.add(b.cyl(0.036, 0.04, 0.03, 18), 'head', 'paint', [ex, ey, 0.09], [PI / 2, 0, 0]);
  b.add(b.cyl(0.026, 0.03, 0.07, 16), 'head', 'metal', [ex, ey, 0.12], [PI / 2, 0, 0]);
  b.add(b.tor(0.029, 0.006, 16, 4), 'head', 'paint', [ex, ey, 0.153]);
  b.add(b.cyl(0.023, 0.023, 0.02, 16), 'head', 'eye', [ex, ey, 0.152], [PI / 2, 0, 0]);
  if (!far) { b.add(b.cyl(0.005, 0.005, 0.16, 5), 'head', 'metal', [0.075, y + 0.08, -0.04], [-0.5, 0, -0.25]); lamp(b, 'head', [0.08, y + 0.03, 0.05], [0, 0, PI / 2], 0.012, 'glow', false); }
  if (rk >= 5) {
    // the eye trail: a long gold streak sweeping back from the lens past the hood
    b.add(fin(b, [[0, -0.012], [0.02, 0.0], [-0.42, 0.03], [-0.46, 0.022]], 0.008, 0.002), 'head', 'eye', [ex - 0.03, ey + 0.005, 0.14], [0, PI / 2 + 0.12, 0]);
    b.add(fin(b, [[0, -0.008], [0.015, 0.0], [-0.3, 0.05], [-0.32, 0.045]], 0.006, 0.002), 'head', 'glow', [ex - 0.03, ey + 0.012, 0.13], [0.1, PI / 2 + 0.1, 0]);
  }
  // crown element: a floating gold reticle behind the head (R3+), brighter at R5
  if (rk >= 3) {
    const R = rk >= 5 ? 0.2 : 0.16, z = -0.2;
    b.add(b.tor(R, 0.008, 36, 4), 'head', rk >= 5 ? 'glow' : 'paint', [0, y + 0.06, z], [0.15, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2;
      b.add(b.cbox(0.012, 0.08, 0.01, 0.003), 'head', i % 2 ? 'paint' : 'glow', [Math.sin(a) * R, y + 0.06 + Math.cos(a) * R * 0.99, z - Math.cos(a) * 0.02], [0.15, 0, -a]);
    }
    b.add(b.tor(R * 0.42, 0.005, 24, 3), 'head', 'paint', [0, y + 0.06, z + 0.005], [0.15, 0, 0]);
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  // slim black chest, gold V plates, hourglass emblem, segmented waist
  P(b, 'chest', 'metal', [0.28, 0.28, 0.2], [0, 0.07, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'accent', [0.38, 0.3, 0.25], [0, 0.11, 0.01], [0.06, 0, 0], { c: 0.04, tx: 1.18, bx: 0.58, tz: 1.0, bz: 0.8 });
  PS(b, 'chest', 'paint', [0.13, 0.2, 0.045], [0.085, 0.13, 0.13], [0.2, 0.3, 0.14], { c: 0.018, tx: 1.1, bx: 0.5 });
  PS(b, 'chest', 'trim', [0.15, 0.012, 0.02], [0.08, 0.235, 0.145], [0.25, 0.3, 0.2]);
  b.scope([0, 0.05, 0.142], [0.08, 0, 0], 1, () => {
    b.add(b.cbox(0.08, 0.13, 0.02, 0.006), 'chest', 'metal', [0, 0, -0.008]);
    for (const g of hourglass(b, 0.055, 0.03, 0.02)) b.add(g, 'chest', rk >= 3 ? 'glow' : 'trim', [0, 0, 0.004]);
  });
  // ribbed flanks under the V plates, neck cables
  if (!far) for (let i = 0; i < 4; i++) PS(b, 'chest', 'metal', [0.05, 0.014, 0.16], [0.16, 0.02 + i * 0.045, 0.0], [0, 0, 0.18]);
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.05, 0.26, 0.04], [s * 0.04, 0.34, 0.02], [s * 0.03, 0.42, 0.0]], 0.01, 8, 4), 'chest', 'metal');
  // high collar + the cloak fins rising behind the head
  P(b, 'chest', 'accent', [0.22, 0.09, 0.18], [0, 0.26, -0.02], [0, 0, 0], { c: 0.025, tx: 0.8 });
  for (const s of [1, -1]) {
    const F = [[0, 0], [0.08, 0], [0.15, 0.22], [0.14, 0.4], [0.09, 0.6], [0.06, 0.5], [0.05, 0.3], [0.02, 0.12]];
    const E = [[0.07, 0.02], [0.09, 0.02], [0.16, 0.22], [0.15, 0.4], [0.1, 0.59], [0.09, 0.56], [0.135, 0.4], [0.14, 0.23]];
    b.add(fin(b, F, 0.024, 0.006), 'chest', 'accent', [s * 0.08, 0.22, -0.11], [-0.4, s > 0 ? 0.8 : PI - 0.8, s * 0.12]);
    b.add(fin(b, E, 0.032, 0.004), 'chest', 'paint', [s * 0.08, 0.22, -0.11], [-0.4, s > 0 ? 0.8 : PI - 0.8, s * 0.12]);
    if (rk >= 4) b.add(fin(b, E.map(([x, y]) => [x + 0.006, y * 0.98]), 0.036, 0.003), 'chest', 'glow', [s * 0.08, 0.226, -0.11], [-0.4, s > 0 ? 0.8 : PI - 0.8, s * 0.12]);
    // chest harness strap + pouch
    b.add(b.cbox(0.03, 0.34, 0.012, 0.004), 'chest', 'trim', [s * 0.0, 0.1, 0.15], [0.12, 0, s * 0.55]);
  }
  // back: spine plate + twin cloak-field emitters
  P(b, 'chest', 'accent', [0.26, 0.24, 0.08], [0, 0.11, -0.13], [-0.05, 0, 0], { c: 0.02, tx: 1.1 });
  for (const s of [1, -1]) { b.add(b.cyl(0.025, 0.03, 0.08, 10), 'chest', 'metal', [s * 0.07, 0.06, -0.18], [PI / 2, 0, 0]); b.add(b.cyl(0.018, 0.018, 0.01, 10), 'chest', rk >= 3 ? 'glow' : 'accent', [s * 0.07, 0.06, -0.222], [PI / 2, 0, 0]); }
  P(b, 'chest', 'metal', [0.18, 0.2, 0.08], [0, 0.08, -0.19], [0, 0, 0], { c: 0.02 });
  P(b, 'chest', 'paint', [0.15, 0.04, 0.085], [0, 0.18, -0.195], [0, 0, 0], { c: 0.01 });
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.13, 0.012, 0.02, 0.003), 'chest', i % 2 ? 'accent' : 'metal', [0, 0.0 + i * 0.03, -0.235]);
  for (const s of [1, -1]) {
    b.add(b.cyl(0.012, 0.012, 0.3, 8), 'chest', 'metal', [s * 0.1, 0.12, -0.2], [0.25, 0, s * 0.3]);
    b.add(b.sph(8, 6), 'chest', rk >= 3 ? 'glow' : 'paint', [s * 0.145, 0.265, -0.165], [0, 0, 0], 0.016);
  }
  // belt tassets under the cloak, side holster
  PS(b, 'pelvis', 'accent', [0.12, 0.2, 0.035], [0.09, -0.1, 0.11], [-0.12, -0.25, 0.08], { c: 0.01, bx: 0.8 });
  PS(b, 'pelvis', 'paint', [0.11, 0.015, 0.04], [0.09, -0.01, 0.12], [-0.12, -0.25, 0.08]);
  PS(b, 'pelvis', 'accent', [0.12, 0.18, 0.035], [0.1, -0.09, -0.11], [0.12, 0.25, 0.08], { c: 0.01, bx: 0.8 });
  b.add(b.cyl(0.09, 0.11, 0.15, 12), 'spine', 'metal', [0, 0.05, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.1 + i * 0.006, 0.008, 16, 4), 'spine', 'accent', [0, 0.0 + i * 0.045, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.12, 0.08, 0.06], [0, 0.07, 0.09], [0.1, 0, 0], { c: 0.015, bx: 0.7 });
  P(b, 'pelvis', 'metal', [0.24, 0.13, 0.18], [0, -0.01, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'trim', [0.25, 0.025, 0.19], [0, 0.045, 0]);
  P(b, 'pelvis', 'accent', [0.1, 0.2, 0.04], [0, -0.09, 0.1], [-0.1, 0, 0], { c: 0.012, bx: 0.5 });
  PS(b, 'pelvis', 'paint', [0.04, 0.2, 0.15], [0.135, -0.08, 0], [0, 0, 0.18], { c: 0.012 });
  // ammo pouch belt: big anti-materiel rounds (gold tips) on the left hip
  if (!far) for (let i = 0; i < 4; i++) {
    b.add(b.cyl(0.013, 0.013, 0.1, 8), 'pelvis', 'paint', [0.1 + i * 0.022, 0.02, 0.08 - i * 0.03], [0.15, 0, 0]);
    b.add(b.cyl(0.0, 0.013, 0.03, 8), 'pelvis', 'metal', [0.1 + i * 0.022, 0.085, 0.09 - i * 0.03], [0.15, 0, 0]);
  }
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, rk = o.rank;
  b.sym(b.cyl(0.035, 0.035, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.065);
  b.sym(b.cyl(0.04, 0.035, ua, 10), 'upArm', 'accent', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.1, ua * 0.5, 0.11], [0.01, -ua * 0.6, 0], [0, 0, 0], { c: 0.02, tx: 1.1 });
  // small layered pauldron (gold over black)
  PS(b, 'upArm', 'accent', [0.15, 0.08, 0.17], [0.03, 0.02, 0], [0, 0, -0.35], { c: 0.025, tx: 0.7, tz: 0.85 });
  PS(b, 'upArm', 'paint', [0.13, 0.05, 0.15], [0.05, -0.03, 0], [0, 0, -0.5], { c: 0.015, tx: 0.8 });
  PS(b, 'upArm', 'trim', [0.12, 0.012, 0.14], [0.055, -0.06, 0], [0, 0, -0.5]);
  if (rk >= 2) {
    // swept shoulder blades
    b.sym(fin(b, [[0, 0.03], [0.07, 0.04], [0.42, -0.1], [0.36, -0.14], [0, -0.03]], 0.02, 0.006), 'upArm', 'accent', [0.06, 0.05, -0.04], [0.15, 0.95, -0.4]);
    b.sym(fin(b, [[0.05, 0.02], [0.08, 0.025], [0.4, -0.105], [0.38, -0.115]], 0.026, 0.004), 'upArm', 'paint', [0.06, 0.05, -0.04], [0.15, 0.95, -0.4]);
  }
  b.sym(discX(b, 0.045, 0.09, 12), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(b.cyl(0.036, 0.032, fa * 0.9, 10), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
  PS(b, 'foreArm', 'paint', [0.1, fa * 0.6, 0.11], [0.006, -fa * 0.58, 0], [0, 0, 0], { c: 0.02, tx: 1.15, tz: 1.12, bx: 0.85, bz: 0.85 });
  PS(b, 'foreArm', 'accent', [0.105, 0.02, 0.115], [0.006, -fa * 0.32, 0]);
  if (rk >= 3) PS(b, 'foreArm', 'glow', [0.008, fa * 0.4, 0.008], [0.056, -fa * 0.58, 0.03], [0, 0, -0.04]);
  b.sym(b.cyl(0.011, 0.011, ua * 0.6, 8), 'upArm', 'metal', [0, -ua * 0.5, -0.05]);
  b.sym(b.cyl(0.007, 0.007, fa * 0.4, 8), 'foreArm', 'paint', [0, -0.08, -0.05]);
  PS(b, 'upArm', 'paint', [0.105, 0.02, 0.115], [0.01, -ua * 0.35, 0]);
  P(b, 'foreArmL', 'metal', [0.05, 0.1, 0.07], [0.05, -fa * 0.62, 0.02], [0, 0, 0], { c: 0.01 });
  b.add(b.cbox(0.012, 0.06, 0.05, 0.003), 'foreArmL', rk >= 3 ? 'glow' : 'eye', [0.076, -fa * 0.62, 0.02]);
  PS(b, 'foreArm', 'trim', [0.11, 0.018, 0.12], [0.006, -fa * 0.86, 0]);
  for (const s of ['L', 'R']) {
    b.add(b.rbox(0.065, 0.09, 0.085, 0.018), 'hand' + s, 'accent', [0, -0.05, 0.005]);
    b.add(b.cbox(0.068, 0.04, 0.088, 0.012), 'hand' + s, 'paint', [0, -0.03, 0.01]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.018, 0.05, 0.016, 0.004), 'hand' + s, 'metal', [(s === 'L' ? -0.005 : 0.005), -0.11, -0.022 + i * 0.022], [0, 0, s === 'L' ? -0.2 : 0.2]);
  }
}

function rifle(b, o) {
  const rk = o.rank, far = b.far, y = BORE, H = 'handR';
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    // pistol grip + trigger guard
    b.add(b.cbox(0.04, 0.12, 0.055, 0.012), H, 'metal', [0, -0.045, -0.015], [0.35, 0, 0]);
    b.add(b.tor(0.025, 0.006, 10, 4, PI), H, 'metal', [0, -0.01, 0.045], [0, PI / 2, PI]);
    // receiver: black core, gold side plates, orange vents, red stripe
    P(b, H, 'accent', [0.075, 0.12, 0.44], [0, y, 0.14], [0, 0, 0], { c: 0.02, tx: 0.88 });
    for (const s of [1, -1]) {
      b.add(plate(b, 0.012, 0.085, 0.3, { c: 0.004, tx: 0.9 }), H, 'paint', [s * 0.041, y + 0.005, 0.13]);
      if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.01, 0.045, 0.012, 0.003), H, rk >= 3 ? 'glow' : 'metal', [s * 0.048, y + 0.005, 0.24 + i * 0.03]);
    }
    b.add(b.cbox(0.08, 0.012, 0.3, 0.004), H, 'trim', [0, y + 0.064, 0.14]);
    b.add(b.cbox(0.03, 0.016, 0.9, 0.004), H, 'metal', [0, y + 0.058, 0.62]);
    if (!far) for (let i = 0; i < 12; i++) b.add(b.cbox(0.034, 0.008, 0.02, 0.002), H, 'metal', [0, y + 0.068, 0.3 + i * 0.065]);
    for (const s of [1, -1]) b.add(plate(b, 0.02, 0.05, 0.12, { c: 0.006 }), H, 'accent', [s * 0.05, y - 0.02, 0.02]);
    if (!far) b.add(b.tube([[0.02, y + 0.02, -0.08], [0.06, y + 0.06, -0.02], [0.05, y + 0.12, 0.02]], 0.006, 8, 4), H, 'trim');
    // magazine (big rounds)
    b.add(plate(b, 0.05, 0.13, 0.09, { c: 0.01, bz: 0.85 }), H, 'accent', [0, y - 0.11, 0.15], [-0.25, 0, 0]);
    b.add(b.cbox(0.055, 0.015, 0.09, 0.004), H, 'paint', [0, y - 0.155, 0.165], [-0.25, 0, 0]);
    // skeletal stock to the shoulder: top bar, lower strut, cheek rest, butt pad
    b.add(b.cbox(0.04, 0.035, 0.34, 0.01), H, 'accent', [0, y + 0.02, -0.22]);
    b.add(cylAB(b, [0, y - 0.05, -0.05], [0, y - 0.1, -0.33], 0.013), H, 'metal');
    b.add(plate(b, 0.045, 0.04, 0.16, { c: 0.01, tx: 0.8 }), H, 'paint', [0, y + 0.055, -0.2]);
    b.add(b.cbox(0.05, 0.19, 0.04, 0.012), H, 'metal', [0, y - 0.04, -0.4]);
    b.add(b.cbox(0.055, 0.2, 0.025, 0.008), H, 'accent', [0, y - 0.04, -0.428]);
    // handguard: octagonal shroud with gold rings, side slots
    b.add(b.cyl(0.042, 0.046, 0.62, 10), H, 'accent', [0, y, 0.67], [PI / 2, 0, PI / 8]);
    for (let i = 0; i < 4; i++) b.add(b.cyl(0.049, 0.049, 0.025, 10), H, i === 3 ? 'trim' : 'paint', [0, y, 0.42 + i * 0.16], [PI / 2, 0, PI / 8]);
    if (!far) for (const s of [1, -1]) for (let i = 0; i < 4; i++) b.add(b.cbox(0.01, 0.022, 0.07, 0.004), H, 'metal', [s * 0.044, y, 0.48 + i * 0.13]);
    if (rk >= 3) for (const s of [1, -1]) b.add(b.cbox(0.006, 0.006, 0.5, 0.002), H, 'glow', [s * 0.03, y + 0.036, 0.66]);
    // fluted barrel + the muzzle brake (glowing ports)
    b.add(b.cyl(0.02, 0.022, 0.5, 10), H, 'metal', [0, y, 1.2], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.026, 0.026, 0.02, 10), H, 'accent', [0, y, 1.04 + i * 0.1], [PI / 2, 0, 0]);
    b.add(b.cbox(0.085, 0.07, 0.15, 0.016), H, 'accent', [0, y, RL - 0.06]);
    b.add(b.cbox(0.09, 0.025, 0.155, 0.008), H, 'paint', [0, y + 0.04, RL - 0.06]);
    for (let i = 0; i < 3; i++) b.add(b.cbox(0.092, 0.045, 0.022, 0.004), H, 'glow', [0, y - 0.004, RL - 0.11 + i * 0.045]);
    for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.05, 0.0], [0.05, 0.02], [0, 0.04]], 0.012, 0.003), H, 'paint', [s * 0.044, y + 0.035, RL - 0.12], [0, s * PI / 2, 0]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.024, 0.024, 0.012, 10), H, 'paint', [0, y, 1.0 + i * 0.12], [PI / 2, 0, 0]);
    b.add(b.cyl(0.018, 0.018, 0.01, 10), H, 'glow', [0, y, RL + 0.012], [PI / 2, 0, 0]);
    // scope: long tube on gold rings, objective bell + gold lens, ocular, turrets, sunshade (R2)
    const sy = y + 0.13;
    b.add(b.cyl(0.028, 0.028, 0.46, 12), H, 'accent', [0, sy, 0.14], [PI / 2, 0, 0]);
    b.add(b.cyl(0.046, 0.03, 0.1, 14), H, 'accent', [0, sy, 0.4], [PI / 2, 0, 0]);
    b.add(b.cyl(0.04, 0.04, 0.01, 14), H, 'metal', [0, sy, 0.452], [PI / 2, 0, 0]);
    b.add(b.cyl(0.013, 0.013, 0.012, 10), H, 'eye', [0, sy, 0.456], [PI / 2, 0, 0]);
    b.add(b.cyl(0.036, 0.03, 0.06, 12), H, 'accent', [0, sy, -0.1], [PI / 2, 0, 0]);
    for (const z of [0.02, 0.24]) { b.add(b.cyl(0.034, 0.034, 0.02, 12), H, 'paint', [0, sy, z], [PI / 2, 0, 0]); b.add(b.cbox(0.024, 0.07, 0.02, 0.005), H, 'metal', [0, sy - 0.05, z]); }
    b.add(b.cyl(0.016, 0.016, 0.03, 10), H, 'paint', [0, sy + 0.04, 0.13]);
    b.add(b.cyl(0.016, 0.016, 0.03, 10), H, 'paint', [-0.04, sy, 0.13], [0, 0, PI / 2]);
    if (rk >= 2) b.add(b.cyl(0.048, 0.048, 0.09, 14, true), H, 'paint', [0, sy, 0.49], [PI / 2, 0, 0]);
    if (!far) {
      b.add(b.tube([[0.03, y - 0.02, -0.36], [0.06, y - 0.16, -0.05], [0.06, y - 0.14, 0.3], [0.03, y - 0.03, 0.55]], 0.008, 10, 4), H, 'trim');
      for (const z of [-0.06, 0.3]) b.add(b.cyl(0.03, 0.03, 0.012, 10), H, 'metal', [0, sy, z], [PI / 2, 0, 0]);
      b.add(b.cbox(0.05, 0.03, 0.06, 0.008), H, 'metal', [0, y - 0.04, 0.86]);
    }
  });
  // bolt carrier + handle (aux1, slides back in tick), on the right side
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    b.add(b.cbox(0.02, 0.04, 0.12, 0.006), 'aux1', 'metal', [-0.045, y + 0.02, 0.08]);
    b.add(cylAB(b, [-0.05, y + 0.02, 0.05], [-0.1, y - 0.01, 0.04], 0.008), 'aux1', 'metal');
    b.add(b.sph(10, 8), 'aux1', 'paint', [-0.105, y - 0.014, 0.04], [0, 0, 0], 0.017);
  });
  // bipod (aux2, hinge under the handguard; deployed = legs down, folded forward in tick)
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    const A = 'aux2';
    b.add(b.cbox(0.06, 0.03, 0.05, 0.008), A, 'metal', [0, 0, 0]);
    for (const s of [1, -1]) {
      b.add(cylAB(b, [s * 0.02, -0.01, 0], [s * 0.1, -0.3, 0.04], 0.011), A, 'metal');
      b.add(cylAB(b, [s * 0.06, -0.14, 0.02], [s * 0.1, -0.3, 0.04], 0.015), A, 'accent');
      b.add(b.sph(8, 6), A, 'paint', [s * 0.1, -0.31, 0.04], [0, 0, 0], 0.02);
    }
  });
}

function cloak(b, o) {
  const rk = o.rank, far = b.far;
  // mantle across the shoulders (aux0), upper row of tattered panels, lower row (aux3) flaring out, side wraps
  b.add(b.cbox(0.4, 0.06, 0.09, 0.02), 'aux0', 'accent', [0, 0.02, 0.03]);
  b.add(b.cbox(0.36, 0.022, 0.1, 0.008), 'aux0', 'paint', [0, 0.055, 0.03]);
  for (const s of [1, -1]) {
    b.add(plate(b, 0.16, 0.035, 0.16, { c: 0.012, tx: 0.8 }), 'aux0', 'accent', [s * 0.2, 0.06, 0.06], [0, 0, s * 0.35]);
    b.add(b.cbox(0.15, 0.012, 0.15, 0.004), 'aux0', 'paint', [s * 0.205, 0.08, 0.06], [0, 0, s * 0.35]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.009, 0.009, 0.012, 6), 'aux0', 'metal', [s * (0.14 + i * 0.05), 0.075 + (0.06 - i * 0.03) * 0.3, 0.12]);
  }
  const panel = (bone, x, y, z, len, w, rz, ry, slot, edge, n, tilt) => {
    b.scope([x, y, z], [tilt, ry, rz], 1, () => {
      b.add(rag(b, len, w, n), bone, slot, [0, 0, 0]);
      if (edge) b.add(b.cbox(0.012, len * 0.7, 0.022, 0.003), bone, edge, [w * 0.47, -len * 0.37, 0.003]);
      if (!far) b.add(b.cyl(0.012, 0.012, 0.03, 8), bone, 'metal', [0, -0.025, 0], [PI / 2, 0, 0]);
    });
  };
  const up = rk >= 1 ? [-0.2, -0.12, -0.04, 0.04, 0.12, 0.2] : [-0.12, 0, 0.12];
  up.forEach((x, i) => panel('aux0', x, 0.0, -0.03 - Math.abs(x) * 0.25, 0.48 - Math.abs(x) * 0.3, 0.1, x * 0.8, x * 0.6, i % 2 ? 'trim' : 'accent', i % 2 ? null : 'paint', i, 0.14));
  if (rk >= 2) [-0.16, -0.08, 0.0, 0.08, 0.16].forEach((x, i) => panel('aux0', x, -0.02, -0.05 - Math.abs(x) * 0.25, 0.4 - Math.abs(x) * 0.3, 0.07, x * 0.8, x * 0.6, 'accent', null, i + 1, 0.16));
  if (rk === 0) return;
  const lo = rk >= 2 ? [-0.3, -0.21, -0.12, -0.04, 0.04, 0.12, 0.21, 0.3] : [-0.24, -0.12, 0, 0.12, 0.24];
  lo.forEach((x, i) => {
    const ax = Math.abs(x), len = 0.74 - ax * 0.5 + ((i * 7) % 3) * 0.07;
    panel('aux3', x * 1.1, 0.02, -0.02 - ax * 0.32, len, 0.1, x * 1.15, x * 1.0, 'accent', rk >= 4 ? 'glow' : 'paint', i + 1, 0.1);
    if (!far && i % 2) panel('aux3', x * 1.1, 0.0, -0.01 - ax * 0.32, len * 0.7, 0.04, x * 1.15, x * 1.0, 'trim', null, i + 2, 0.1);
  });
  if (rk >= 5) for (const x of [-0.25, 0, 0.25]) b.add(b.cbox(0.4 * 0.5, 0.008, 0.012, 0.002), 'aux3', 'glow', [x, -0.36 + Math.abs(x) * 0.3, -0.06 - Math.abs(x) * 0.3], [0, x * 0.9, 0]);
  // side wraps around the hips
  for (const s of [1, -1]) { panel('aux3', s * 0.27, 0.04, 0.05, 0.56, 0.12, s * 0.4, s * 1.25, 'accent', 'paint', s > 0 ? 4 : 5, 0.05); panel('aux3', s * 0.3, 0.02, -0.06, 0.62, 0.1, s * 0.55, s * 0.95, 'accent', null, s > 0 ? 2 : 3, 0.06); }
}

// R4: two pairs of spider-leg fins arching up and out from the back (the widow's legs), hardlight tips
function legFins(b, o) {
  for (const [k, ry, rz, y] of [[1, 0.5, -0.5, 0.18], [0.85, 0.9, -0.3, 0.08]]) {
    const seg = [[0.0, 0.0, 0.0], [0.16 * k, 0.24 * k, -0.06], [0.36 * k, 0.32 * k, -0.12], [0.5 * k, 0.12 * k, -0.16]];
    b.scope([0.06, y, -0.15], [0, 0, 0], 1, () => {
      for (let i = 0; i < 3; i++) {
        const a = seg[i], c = seg[i + 1], p0 = [a[0], a[1], a[2] - a[0] * Math.sin(ry) * 0.6], p1 = [c[0], c[1], c[2] - c[0] * Math.sin(ry) * 0.6];
        b.sym(cylAB(b, p0, p1, 0.022 - i * 0.005, 0.016 - i * 0.005, 8), 'chest', i === 2 ? 'glow' : 'accent');
        if (i < 2) b.sym(b.sph(8, 6), 'chest', 'paint', p1, [0, 0, 0], 0.026 - i * 0.005);
      }
    });
  }
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  armsAndHands(b, o);
  rifle(b, o);
  cloak(b, o);
  if (o.rank >= 4) legFins(b, o);
  legs(b, o, { w: 0.84, knee: 'spike', shin: 'slim', foot: 'point', thighSlot: 'accent', shellSlot: 'accent', shinPlateSlot: 'accent', kneeSlot: 'accent', footSlot: 'accent', outerSlot: 'accent' });
  b.sym(b.cyl(0.016, 0.016, 0.03, 10), 'shin', 'paint', [0, 0.05, 0.11], [PI / 2, 0, 0]);
  // knee pistons, thigh holster pouch, ankle cuffs
  b.sym(cylAB(b, [0, -0.08, -0.09], [0, -0.36, -0.1], 0.014), 'thigh', 'metal');
  b.sym(cylAB(b, [0, 0.0, -0.1], [0, -0.14, -0.1], 0.008), 'shin', 'paint');
  P(b, 'thighR', 'accent', [0.06, 0.16, 0.12], [-0.11, -0.22, 0.02], [0, 0, -0.06], { c: 0.015 });
  b.add(b.cbox(0.065, 0.03, 0.125, 0.008), 'thighR', 'paint', [-0.112, -0.15, 0.02], [0, 0, -0.06]);
  PS(b, 'shin', 'trim', [0.11, 0.025, 0.11], [0, -0.4, 0.0]);
  PS(b, 'thigh', 'accent', [0.15, 0.12, 0.05], [0.01, -0.05, 0.1], [-0.15, 0, 0.05], { c: 0.012, bx: 1.1 });
  PS(b, 'thigh', 'paint', [0.13, 0.015, 0.05], [0.01, -0.11, 0.115], [-0.15, 0, 0.05]);
  b.sym(cylAB(b, [0, -0.25, -0.08], [0, -0.42, -0.06], 0.012), 'shin', 'metal');
  b.sym(b.cyl(0.02, 0.02, 0.02, 10), 'shin', 'accent', [0, -0.25, -0.08]);
  PS(b, 'foot', 'paint', [0.06, 0.02, 0.1], [0, -0.03, 0.12], [0.2, 0, 0], { c: 0.005 });
  PS(b, 'shin', 'paint', [0.035, 0.26, 0.02], [0, -0.17, 0.12], [0.12, 0, 0], { c: 0.006, tx: 0.6 });
  PS(b, 'shin', 'paint', [0.1, 0.03, 0.1], [0, -0.04, 0.06], [-0.3, 0, 0], { c: 0.008 });
  // stiletto heel spur, raked shin blade, thigh straps
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.17]], 0.035, 0.006), 'foot', 'paint', [0, -0.04, -0.05], [-2.4, 0, 0]);
  b.sym(plate(b, 0.06, 0.3, 0.045, { c: 0.01, tx: 0.55 }), 'shin', 'accent', [0, -0.2, -0.075], [-0.22, 0, 0]);
  b.sym(b.cyl(0.016, 0.016, 0.26, 8), 'thigh', 'metal', [0, -0.2, -0.075]);
  PS(b, 'thigh', 'paint', [0.03, 0.14, 0.1], [0.085, -0.2, 0.0], [0, 0, 0.06], { c: 0.01 });
  PS(b, 'thigh', 'trim', [0.17, 0.02, 0.17], [0.0, -0.1, 0.0], [0, 0, 0.04]);
  if (o.rank >= 3) b.sym(b.cyl(0.014, 0.014, 0.02, 10), 'thigh', 'glow', [0.106, -0.13, 0.04], [0, 0, PI / 2]);
}

// ---------- anims ----------
const FWD = [0, 0, 1];
const anims = {
  idle(P, t, ctx) {
    stance(P, ctx, t);
    // every ~9 s: lifts her head off the scope and scans the field, then settles back
    const c = t % 9, w = L.kf(c, [[0, 0], [5.6, 0], [6.0, 1], [7.6, 1], [8.1, 0]]);
    if (w > 0.001) {
      const s = Math.sin((c - 6) * 2.2);
      L.A(P, 'neck', -0.1 * w, -0.25 * w + 0.3 * s * w, -0.1 * w); L.A(P, 'head', -0.12 * w, 0.15 * s * w, -0.1 * w);
      hold(P, ctx, [HAND_T[0] - 0.02 * w, HAND_T[1] - 0.05 * w, HAND_T[2]], [0, -0.12 * w, 1]);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    aimBody(P, 0.55);
    L.A(P, 'spine', 0.08, 0, 0); L.A(P, 'head', -0.06, 0, 0);
    hold(P, ctx, [-0.12, 1.2, 0.2], [0, -0.3, 1]);
  },
  // Long Rifle: one heavy shot (fire 0.25): shoulder punched back, muzzle climbs, bolt cycles (tick)
  attack(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const set = L.kf(u, [[0, 0], [0.18, 1], [0.25, 1], [0.3, 0], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.245, 0], [0.27, 1], [0.45, 0.35], [0.75, 0], [1, 0]]);
    L.A(P, 'chest', -0.2 * kick, 0.12 * kick, 0); L.A(P, 'spine', -0.08 * kick, 0.05 * kick, 0);
    L.A(P, 'head', -0.12 * kick + 0.05 * set, 0, 0); P[L.PX + 2] -= 0.09 * kick; P[L.PX + 1] -= 0.02 * set;
    hold(P, ctx, [HAND_T[0], HAND_T[1] + 0.06 * kick, HAND_T[2] - 0.1 * kick], [0, 0.42 * kick, 1]);
    L.plant(P, ctx, 0.22, -0.2, 1.4);
  },
  // kneeling shot: drops to one knee, steadies (tremble), fires (0.42), rises
  attack_alt(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const kneel = L.kf(u, [[0, 0], [0.26, 1], [0.78, 1], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.415, 0], [0.44, 1], [0.62, 0.3], [0.85, 0], [1, 0]]);
    const tr = Math.sin(u * 90) * L.kf(u, [[0.2, 0], [0.3, 1], [0.41, 0.4], [0.42, 0]]) * 0.004;
    P[L.PX + 1] -= 0.4 * kneel; P[L.PX + 2] -= 0.03 + 0.07 * kick;
    L.A(P, 'spine', 0.1 * kneel - 0.1 * kick, 0, 0); L.A(P, 'chest', -0.14 * kick, 0.08 * kick, 0);
    hold(P, ctx, [HAND_T[0], HAND_T[1] - 0.4 * kneel + 0.05 * kick + tr, HAND_T[2] + 0.04 * kneel - 0.08 * kick], [0, 0.35 * kick + tr, 1]);
    L.plant(P, ctx, 0.36 * kneel + 0.22 * (1 - kneel), -0.2 - 0.38 * kneel, 1.3, 0, 0.9 * kneel);
  },
  // Ghost Net: rifle lowered one-handed, the free hand sweeps the cloak up across the visor (cast 0.45)
  cast(P, u, ctx) {
    stance(P, ctx, ctx.t, 0.5);
    const k = L.kf(u, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]), sw = L.kf(u, [[0, 0], [0.3, 0], [0.45, 1], [0.8, 1], [1, 0]]);
    hold(P, ctx, [-0.16, 1.18, 0.12], [0.05, -0.75, 0.5]);
    L.armIK(P, ctx, 'L', _t.set(L.lerp(0.3, -0.05, sw), L.lerp(1.2, 1.62, sw), L.lerp(0.05, 0.22, sw)), 0.5);
    L.A(P, 'head', 0.15 * k, -0.2 * k, 0); L.A(P, 'chest', 0.05 * k, -0.2 * sw, 0);
    ctx.cloakAdd = 0.35 * sw;
  },
  // LAST LIGHT: cloak flare -> vanishes (tick) -> reappears prone on the bipod -> fires (0.23) -> slides back -> rises
  overdrive(P, u, ctx) {
    ctx.odU = u;
    stance(P, ctx, ctx.t);
    const pr = L.kf(u, [[0, 0], [0.11, 0], [0.19, 1], [0.64, 1], [0.86, 0], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.228, 0], [0.245, 1], [0.4, 0.5], [0.6, 0.3], [1, 0]]);
    const flare = L.kf(u, [[0, 0], [0.05, 1], [0.1, 0.6], [0.2, 0], [1, 0]]);
    ctx.cloakAdd = 0.7 * flare + 0.25 * kick;
    if (pr > 0.001) {
      const D = ctx.D;
      L.pel(P, 0, L.lerp(P[L.PX + 1], 0.22 - D.pelvisY, pr), L.lerp(P[L.PX + 2], 0.12 - 0.1 * kick, pr));
      L.R(P, 'pelvis', L.lerp(P[0], 1.42, pr), L.lerp(P[1], -0.08, pr), 0);
      L.A(P, 'spine', -0.12 * pr, 0.04 * pr, 0); L.A(P, 'chest', -0.22 * pr - 0.06 * kick, 0.06 * pr, 0);
      L.R(P, 'neck', L.lerp(P[BI.neck * 3], -0.5, pr), L.lerp(P[BI.neck * 3 + 1], 0.2, pr), 0);
      L.R(P, 'head', L.lerp(P[BI.head * 3], -0.4, pr), L.lerp(P[BI.head * 3 + 1], 0.25, pr), 0.1 * pr);
      const ht = [L.lerp(HAND_T[0], -0.08, pr), L.lerp(HAND_T[1], 0.33 + 0.04 * kick, pr), L.lerp(HAND_T[2], 0.92 - 0.08 * kick, pr)];
      hold(P, ctx, ht, [0, 0.14 * kick, 1], [0, 1, 0], L.lerp(0.35, 0.9, pr));
      // legs straight back along the floor, toes down
      const hz = 0.08 - 0.1 * kick, fz = L.lerp(0.22, hz - 0.84, pr), fz2 = L.lerp(-0.2, hz - 0.82, pr);
      L.legIK(P, ctx, 'L', L.lerp(0.14, 0.2, pr), L.lerp(D.ankle, 0.1, pr), fz, 1.25 * pr);
      L.legIK(P, ctx, 'R', L.lerp(-0.14, -0.16, pr), L.lerp(D.ankle, 0.1, pr), fz2, 1.25 * pr);
    } else hold(P, ctx, HAND_T, [0, 0.25 * flare, 1]);
  },
  hit(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'pelvis', -0.05 * k, 0.1 * k * d, 0);
    L.A(P, 'spine', -0.14 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.18 * k, 0.1 * k * d, 0.05 * k * d);
    L.A(P, 'head', -0.3 * k, -0.2 * k * d, 0.18 * k * d);
    hold(P, ctx, [HAND_T[0], HAND_T[1] + 0.06 * k, HAND_T[2] - 0.08 * k], [0, 0.3 * k, 1]);
    L.plant(P, ctx, 0.2, -0.2, 1.3);
    ctx.cloakAdd = 0.4 * k;
  },
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const w = L.kf(u, [[0, 1], [0.35, 0]]);
    if (w > 0.001) hold(P, ctx, [HAND_T[0], HAND_T[1] - 0.2, HAND_T[2]], [0, -0.6, 1], [0, 1, 0]);
    ctx.cloakAdd = 0.3 * L.kf(u, [[0, 0], [0.4, 1], [0.8, 0.2], [1, 0]]);
  },
  // drops in with the cloak spread like wings, lands on one knee (land 0.4), rises into the aim (ready 0.85)
  deploy(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0.3], [0.32, 0.4], [0.4, 1], [0.62, 1], [0.84, 0], [1, 0]]);
    const k = L.kf(u, [[0, 0.3], [0.62, 0.3], [0.85, 1], [1, 1]]);
    P[L.PX + 1] -= 0.36 * land; P[L.PX + 2] += 0.04 * land;
    L.A(P, 'spine', 0.25 * land, 0, 0); L.A(P, 'chest', 0.1 * land, 0, 0);
    L.A(P, 'head', L.kf(u, [[0, 0.3], [0.6, 0.35], [0.75, -0.15], [0.9, 0], [1, 0]]), 0, 0);
    hold(P, ctx, [L.lerp(-0.2, HAND_T[0], k), L.lerp(1.05, HAND_T[1], k) - 0.3 * land, L.lerp(0.1, HAND_T[2], k)], [0, L.lerp(-0.6, 0, k), 1]);
    L.plant(P, ctx, 0.26 + 0.12 * land, -0.18 - 0.3 * land, 1.3, 0, 0.85 * land);
    ctx.cloakAdd = 0.8 * L.kf(u, [[0, 1], [0.38, 1], [0.5, 0.1], [1, 0]]);
  },
  // rifle propped on the shoulder, barrel to the sky, free hand on the hip, a slow cocky head tilt
  victory(P, t, ctx) {
    L.idle(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7)), s = Math.sin(t * 1.4);
    L.A(P, 'pelvis', 0, 0.2 * k, 0.05 * k); L.A(P, 'chest', -0.08 * k, -0.15 * k, 0);
    L.A(P, 'head', -0.12 * k, 0.25 * k, 0.15 * k * s);
    hold(P, ctx, [L.lerp(HAND_T[0], -0.24, k), L.lerp(HAND_T[1], 1.42, k), L.lerp(HAND_T[2], 0.08, k)], [L.lerp(0, -0.05, k), L.lerp(0, 1, k), L.lerp(1, -0.2, k)], [0, L.lerp(1, 0, k), L.lerp(0, -1, k)]);
    L.armIK(P, ctx, 'L', _t.set(0.22, 1.08, 0.0), 0.8);
    L.plant(P, ctx, 0.12, -0.08, 1.15);
    ctx.cloakAdd = (0.15 + 0.08 * Math.sin(t * 2.3)) * k;
  },
};

// one-shots record their name + normalised time for tick()
for (const n of ['attack', 'attack_alt', 'cast', 'overdrive', 'hit', 'die', 'deploy']) {
  const f = anims[n];
  anims[n] = (P, u, ctx, Lb) => { ctx.an = n; ctx.au = u; f(P, u, ctx, Lb); };
}
const BOLT_AX = new THREE.Vector3(...AXIS);
const _q = new THREE.Quaternion();
export default {
  id: 'widowmaker', name: 'WIDOWMAKER', role: 'archer', faction: 'rogue', rarity: 'legendary', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.72, radius: 0.5, walkSpeed: 1.3, cadence: 0.9, scheme: 'dark',
  style: { weapon: 'rifle', heavy: 0, stance: 1.4, grip: GRIP, gripOut: 0.55, freeHand: ['cast', 'victory'] },
  // gold primary on the read-shapes in every tint; black armour (pearl white for CORONA's corporate tint); gold eye always
  mats: {
    all: {
      paint: { color: 0xf2b23c, metal: 0.72, rough: 0.25, coat: 0.8, coatRough: 0.05, env: 1.05, emissive: 0x2a1600, ei: 1, panel: { scale: 4.5, groove: 0.4, vary: 0.06 } },
      accent: { color: 0x0f0e12, metal: 0.5, rough: 0.3, coat: 1, env: 0.85 },
      trim: { color: 0x6e0d12, metal: 0.4, rough: 0.32, coat: 1, emissive: 0x000000, ei: 0, env: 0.8 },
      eye: { color: 0xffc23a, ei: 4.5 },
    },
    corporate: { accent: { color: 0xaeb7c4, metal: 0.35, rough: 0.28, coat: 1, env: 0.75 }, trim: { color: 0x1b2a4a } },
    experimental: { trim: { color: 0x3a1670 } },
  },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.08, 0.15], head: [-0.034, 0.11, 0.16], hand: ['handR', [0, -0.08, 0]] },
  events: { attack: [['fire', 0.25]], attack_alt: [['fire', 0.42]], cast: [['cast', 0.45]], overdrive: [['cast', 0.04], ['fire', 0.23]], die: [['down', 0.82]], deploy: [['land', 0.4], ['ready', 0.85]] },
  durs: { attack: 1.0, attack_alt: 1.3, cast: 1.1, overdrive: 2.6, hit: 0.45, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.2), an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    let sway = 0.06 + 0.04 * Math.sin(t * 1.7) + 0.3 * mv, top = 0.03 * Math.sin(t * 1.3 + 0.5) + 0.1 * mv;
    sway += ctx.cloakAdd || 0; top += 0.4 * (ctx.cloakAdd || 0); ctx.cloakAdd = 0;
    if (an === 'die') sway *= 1 - u * 0.6;
    P[BI.aux0 * 3] = top; P[BI.aux3 * 3] = sway;
    P[BI.aux3 * 3 + 2] = 0.04 * Math.sin(t * 1.1);
  },
  // bolt cycles after each shot, bipod unfolds for the prone shot, the cloak glitches her out of sight
  tick(unit, dt, ctx, bones) {
    const a = unit.state.action === ctx.an ? ctx.an : null, u = ctx.au || 0, st = ctx._wm || (ctx._wm = { bip: 0 });
    let bolt = 0;
    if (a === 'attack') bolt = L.kf(u, [[0.4, 0], [0.5, 1], [0.62, 1], [0.72, 0]]);
    if (a === 'attack_alt') bolt = L.kf(u, [[0.55, 0], [0.64, 1], [0.72, 1], [0.8, 0]]);
    if (a === 'overdrive') bolt = L.kf(u, [[0.42, 0], [0.5, 1], [0.56, 1], [0.64, 0]]);
    bones[BI.aux1].position.copy(BOLT_AX).multiplyScalar(-0.09 * bolt);
    const bt = a === 'overdrive' && u > 0.1 && u < 0.7 ? 1 : 0;
    st.bip += (bt - st.bip) * (1 - Math.exp(-dt * 10));
    bones[BI.aux2].quaternion.copy(_q.setFromAxisAngle(XAX, -PI * 0.47 * (1 - st.bip)));
    let vis = true;
    if (a === 'overdrive') {
      const r = Math.sin(u * 517) * 0.5 + 0.5;
      if (u > 0.06 && u < 0.13) vis = r > (u - 0.06) / 0.07;
      else if (u >= 0.13 && u < 0.2) vis = false;
      else if (u >= 0.2 && u < 0.225) vis = r < (u - 0.2) / 0.025;
    }
    unit.body.visible = vis;
  },
  fxHints: { projectile: 'slug', muzzleColor: 0xffa23a, impact: 'punch_through', overdrive: 'last_light', color: 0xffc23a },
  build,
};
