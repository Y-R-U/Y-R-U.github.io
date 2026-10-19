// SOVEREIGN PALADIN, corporate legendary tank (sculptor-2). Brief: docs/ROSTER.md `paladin`; look: refs/ref_battle_02.png player mid (gold blade).
// Heroic knight: broad V chest, tapered waist, layered gold pauldrons, swept crest helm, white-gold energy longsword (right),
// small kite shield (left forearm), a fin-cape of layered gold plates down the back, triangle emblem on the chest.
// VALUE: `paint` = polished gold on the big read-shapes, `accent` = black under-suit, `metal` = gunmetal joints/pistons,
// `trim` = platinum edges + blade body, `glow` = white-gold blade/emblem light, `eye` = faction lamps (corporate cyan).
// Rank tiers (legendary default R3): R0 battered, short cape, bare shield · R1 full cape · R2 third pauldron layer, pauldron
//   crest fins, knee spikes, extra tassets · R3 blade edge lights, emblem core, shield edge light, pauldron light strips (base)
//   · R4 tall crest + crown spikes, cape gains outer plates + hardlight edges, rim strips · R5 floating gold sigil behind the head,
//   hardlight blade edges + light trails (fx), glowing cape spines.
// Technique: the longsword blade lives on aux1 (re-parented to handR) so it can be scaled into a 6 m greatsword in tick();
// `aimBlade()` solves the hand rotation so the blade points along any root-space direction (IK slash paths);
// the lower cape is on aux2 (re-parented to aux0) and sways in post(); the R5 sigil spins on aux3 (re-parented to chest).
import { THREE, P, PS, plate, fin, discX, legs, poseFrame, makeRig, LIB, PI, BI } from '../kit.js';

const BLADE_A = 1.15;             // blade pitch in the hand frame (hand -Y = down the forearm)
const BL = 1.32, BW = 0.15;       // blade length / width
const GRIP_O = [0, -0.075, 0];    // fist centre on handR
const GUARD = 0.13;               // guard distance from the fist along the blade axis
const sA = Math.sin(BLADE_A), cA = Math.cos(BLADE_A);
const DIMS = {
  thigh: 0.44, shin: 0.44, ankle: 0.12, hipX: 0.15, hipY: -0.05, spine: 0.14, chest: 0.3, neck: 0.29, headOff: 0.03,
  clavX: 0.08, clavY: 0.24, shoulder: 0.3, upArm: 0.32, foreArm: 0.31, aux0: [0, 0.2, -0.27],
  parents: { aux1: 'handR', aux2: 'aux0', aux3: 'chest' },
  aux1: [0, GRIP_O[1] - sA * GUARD, cA * GUARD],   // blade root (top of the guard) in hand space
  aux2: [0, -0.46, -0.07],                         // lower cape hinge
  aux3: [0, 0.74, -0.42],                           // R5 sigil, behind the head
};
const L = LIB;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3(), _qf = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const QA_INV = new THREE.Quaternion().setFromEuler(new THREE.Euler(BLADE_A, 0, 0)).invert();

// ---------- pose helpers ----------
// guard: sword low and forward (blade angled down like the ref), kite shield on the forearm in front of the body
function guard(P, k = 0, br = 0) {
  L.RS(P, 'upArm', 'R', -0.3 - 0.2 * k + br, 0.12, 0.36);
  L.RS(P, 'foreArm', 'R', -0.72 - 0.25 * k, 0, 0);
  L.RS(P, 'hand', 'R', 0.08, 0, 0);
  L.RS(P, 'upArm', 'L', -0.42 - 0.12 * k + br, -0.12, 0.3);
  L.RS(P, 'foreArm', 'L', -1.15, 0, 0);
  L.RS(P, 'hand', 'L', 0, 0, 0);
}
function stance(P, ctx, t) {
  L.idle(P, ctx, t);
  const br = Math.sin(t * 1.5);
  L.A(P, 'chest', -0.05, 0, 0); L.A(P, 'spine', -0.01, 0, 0);
  L.A(P, 'neck', -0.04, 0, 0); L.A(P, 'head', 0.06, 0, 0);
  guard(P, 0, br * 0.02);
  L.plant(P, ctx, 0.17, -0.1, 1.28);
  swordIK(P, ctx, [G_HAND[0], G_HAND[1] + br * 0.01, G_HAND[2]], G_DIR, G_YH, 1, 0.45);
}
const G_HAND = [-0.44, 1.12, 0.2], G_DIR = [-0.3, -0.42, 0.86], G_YH = [-0.35, 0.9, 0.2];
// rotate handR so the blade points along `dir` (root space); `yh` = the blade's thickness axis hint (normal of the swing plane)
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
// sword hand IK: fist at `tgt`, blade along `dir`; w blends from the current FK pose
function swordIK(P, ctx, tgt, dir, yh, w = 1, out = 0.3) {
  if (w <= 0.001) return;
  ARM_R.forEach((i, j) => { _save[j * 3] = P[i]; _save[j * 3 + 1] = P[i + 1]; _save[j * 3 + 2] = P[i + 2]; });
  L.armIK(P, ctx, 'R', _v.set(tgt[0], tgt[1], tgt[2]), out);
  aimBlade(P, ctx, dir, yh);
  if (w < 1) ARM_R.forEach((i, j) => { for (let c = 0; c < 3; c++) P[i + c] = _save[j * 3 + c] + (P[i + c] - _save[j * 3 + c]) * w; });
}
// keyframed vectors: keys = [[u, [x,y,z]], ...]
function kv(u, keys) {
  return [0, 1, 2].map((c) => L.kf(u, keys.map((k) => [k[0], k[1][c]])));
}

// ---- precompute the guard pose -> shield frame on the left forearm
const RIG = makeRig(DIMS);
const REF = { D: RIG.D, rig: RIG, t: 0, style: { weapon: 'blade', heavy: 0.55, stance: 1.3 }, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI, move: { v: 0, phase: 0, stride: 0 } };
const HOLD_P = new Float32Array(L.NCH);
stance(HOLD_P, REF, 0);
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const HOLD = poseOf(HOLD_P);
HOLD.pelvis = [HOLD.pelvis[0], HOLD.pelvis[1], 0];
const SHIELD_FRAME = poseFrame(RIG, HOLD, 'foreArmL');

// ---------- greebles (bulwark patterns) ----------
function lamp(b, bone, pos, rot, r = 0.03, slot = 'eye', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.022, 14), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.032, 14), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.2), 0.04, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.012]); });
}
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.024) {
  const cyl = (p, q, rr) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], Ln = Math.hypot(dx, dy, dz);
    const g = b.cyl(rr, rr, Ln, 10);
    g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
    g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    return g;
  };
  b.sym(cyl(a0, a1, r), boneA, 'metal');
  b.sym(cyl(b0, b1, r * 0.55), boneB, 'trim');
  b.sym(b.cyl(r * 1.3, r * 1.3, 0.03, 10), boneA, 'accent', a1);
}
function rivets(b, bone, slot, pts, r = 0.011) {
  if (b.far) return;
  for (const p of pts) b.sym(b.cyl(r, r, 0.012, 6), bone, slot, p[0], p[1] || [PI / 2, 0, 0]);
}
// mirrored pair on an off-centre bone (b.sym would mirror across the body's x = 0)
function addM(b, g, bone, slot, p, r = [0, 0, 0]) {
  b.add(g.clone(), bone, slot, p, r);
  b.add(g, bone, slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], [-1, 1, 1]);
}
// triangle emblem outline (point up), as a thick ring
function triangle(b, R, w, d) {
  const pts = [], inner = [];
  for (let i = 0; i < 3; i++) { const a = PI / 2 + i * 2 * PI / 3; pts.push([Math.cos(a) * R, Math.sin(a) * R]); inner.push([Math.cos(a) * (R - w * 2), Math.sin(a) * (R - w * 2)]); }
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes.push(new THREE.Path(inner.reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -d / 2);
  return g;
}
const triFill = (b, R, d) => b.ext([0, 1, 2].map((i) => { const a = PI / 2 + i * 2 * PI / 3; return [Math.cos(a) * R, Math.sin(a) * R]; }), d, 0.004);

// ---------- parts ----------
function helm(b, o) {
  const rk = o.rank, far = b.far, y = 0.07, z = 0.03;
  // black under-hood + gold helm shell with a forward brow peak and cheek guards
  b.add(b.rbox(0.22, 0.2, 0.24, 0.05), 'head', 'accent', [0, y, z]);
  P(b, 'head', 'paint', [0.25, 0.13, 0.27], [0, y + 0.07, z - 0.005], [0.1, 0, 0], { c: 0.04, tx: 0.62, tz: 0.82 });
  P(b, 'head', 'paint', [0.2, 0.05, 0.1], [0, y + 0.05, z + 0.13], [0.35, 0, 0], { c: 0.018, tx: 0.7 });
  PS(b, 'head', 'paint', [0.05, 0.16, 0.2], [0.115, y - 0.02, z + 0.03], [0, 0, -0.1], { c: 0.016, bz: 0.65, bx: 0.6 });
  PS(b, 'head', 'trim', [0.012, 0.13, 0.16], [0.142, y - 0.02, z + 0.05], [0, 0, -0.1]);
  // faceplate: dark mask, cyan T-visor, chin vents
  b.add(plate(b, 0.17, 0.12, 0.06, { c: 0.018, bx: 0.55 }), 'head', 'accent', [0, y - 0.035, z + 0.12], [-0.08, 0, 0]);
  b.add(b.cbox(0.15, 0.028, 0.03, 0.008), 'head', 'eye', [0, y + 0.02, z + 0.148], [0.05, 0, 0]);
  b.add(b.cbox(0.026, 0.06, 0.028, 0.006), 'head', 'eye', [0, y - 0.015, z + 0.15]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.03, 0.008, 0.02, 0.002), 'head', 'metal', [0.045, y - 0.05 - i * 0.014, z + 0.148]);
  b.sym(discX(b, 0.045, 0.05, 14), 'head', 'metal', [0.12, y, z - 0.03]);
  b.sym(b.cyl(0.02, 0.02, 0.02, 10), 'head', 'eye', [0.146, y, z - 0.03], [0, 0, PI / 2]);
  // swept crest: a tall gold blade from the brow over the crown, platinum spine (taller at R4)
  const ck = rk >= 4 ? 1.35 : 1;
  b.add(fin(b, [[0.12, 0], [0.16, 0.05], [0.02, 0.14 * ck], [-0.22 * ck, 0.22 * ck], [-0.26 * ck, 0.18 * ck], [-0.08, 0.04]], 0.03, 0.008), 'head', 'paint', [0, y + 0.1, z], [0, PI / 2, 0]);
  b.add(fin(b, [[0.1, 0.02], [0.12, 0.04], [0.0, 0.12 * ck], [-0.2 * ck, 0.2 * ck], [-0.21 * ck, 0.185 * ck], [-0.02, 0.09 * ck]], 0.036, 0.004), 'head', 'trim', [0, y + 0.1, z], [0, PI / 2, 0]);
  // swept side wings
  b.sym(fin(b, [[0, 0], [0.05, 0], [-0.14, 0.12], [-0.17, 0.1]], 0.02, 0.005), 'head', 'paint', [0.11, y + 0.06, z - 0.02], [0.1, PI / 2 - 0.35, 0]);
  if (rk >= 3) b.add(b.cbox(0.006, 0.006, 0.18, 0.002), 'head', 'glow', [0, y + 0.19, z - 0.04], [-0.55, 0, 0]);
  if (rk >= 4) {
    // crown: five gold spikes rising from a platinum circlet
    b.add(b.tor(0.125, 0.012, 24, 5, PI * 1.2), 'head', 'trim', [0, y + 0.1, z], [PI / 2 + 0.15, 0, PI * 0.9 + PI]);
    for (let i = 0; i < 5; i++) {
      const a = -0.95 + i * 0.475, h = i === 2 ? 0 : (i % 2 ? 0.13 : 0.1);
      if (!h) continue;
      b.add(fin(b, [[-0.022, 0], [0.022, 0], [0, h]], 0.018, 0.004), 'head', 'paint', [Math.sin(a) * 0.125, y + 0.11, z + Math.cos(a) * 0.125], [-0.25, a, 0]);
    }
    b.sym(fin(b, [[0, 0], [0.012, 0], [-0.13, 0.11], [-0.14, 0.1]], 0.026, 0.004), 'head', 'glow', [0.113, y + 0.07, z - 0.02], [0.1, PI / 2 - 0.35, 0]);
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  // under-suit frame + black barrel chest + gold V breastplate (broad top, tapered to the waist)
  P(b, 'chest', 'metal', [0.5, 0.42, 0.36], [0, 0.11, -0.03], [0, 0, 0], { c: 0.04 });
  P(b, 'chest', 'accent', [0.66, 0.38, 0.42], [0, 0.12, 0.0], [0.06, 0, 0], { c: 0.06, tx: 1.18, bx: 0.66, tz: 1.0, bz: 0.82 });
  P(b, 'chest', 'paint', [0.62, 0.26, 0.12], [0, 0.17, 0.2], [0.22, 0, 0], { c: 0.04, tx: 1.15, bx: 0.55 });
  PS(b, 'chest', 'paint', [0.24, 0.2, 0.08], [0.16, 0.04, 0.22], [0.12, 0.3, 0.12], { c: 0.03, tx: 1.05, bx: 0.6 });
  PS(b, 'chest', 'trim', [0.26, 0.022, 0.03], [0.15, 0.27, 0.26], [0.22, 0.3, 0.2]);
  // collar ridge (platinum) + gorget
  P(b, 'chest', 'trim', [0.36, 0.045, 0.1], [0, 0.29, 0.14], [0.4, 0, 0], { c: 0.015, tx: 0.8 });
  P(b, 'chest', 'accent', [0.26, 0.1, 0.22], [0, 0.3, 0.0], [0, 0, 0], { c: 0.03, tx: 0.75 });
  // triangle emblem on the sternum: platinum frame, black field, white-gold core (R3+)
  b.scope([0, 0.13, 0.275], [0.22, 0, 0], 1, () => {
    b.add(triFill(b, 0.115, 0.02), 'chest', 'accent', [0, 0, 0]);
    b.add(triangle(b, 0.12, 0.018, 0.03), 'chest', 'trim', [0, 0, 0.005]);
    b.add(triFill(b, 0.05, 0.03), 'chest', rk >= 3 ? 'glow' : 'eye', [0, -0.005, 0.01]);
  });
  rivets(b, 'chest', 'trim', [[[0.26, 0.2, 0.25]], [[0.2, 0.0, 0.27]], [[0.06, 0.32, 0.28]]]);
  if (rk >= 3) PS(b, 'chest', 'glow', [0.2, 0.012, 0.012], [0.16, 0.0, 0.265], [0.12, 0.3, 0.12]);
  // back: gold mantle yoke that carries the cape, twin thrusters under it
  P(b, 'chest', 'paint', [0.56, 0.2, 0.16], [0, 0.3, -0.21], [-0.3, 0, 0], { c: 0.04, tx: 0.8 });
  P(b, 'chest', 'accent', [0.42, 0.3, 0.12], [0, 0.1, -0.24], [0, 0, 0], { c: 0.03 });
  vent(b, 'chest', [0, 0.08, -0.305], [0, PI, 0], 0.2, 0.14, 4);
  // waist: segmented black abdomen, gold belt with platinum buckle
  b.add(b.cyl(0.15, 0.18, 0.2, 14), 'spine', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.165 + i * 0.01, 0.01, 20, 4), 'spine', 'accent', [0, 0.0 + i * 0.055, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'trim', [0.3, 0.1, 0.12], [0, 0.11, 0.13], [0.1, 0, 0], { c: 0.025, tx: 1.15 });
  P(b, 'spine', 'accent', [0.24, 0.08, 0.11], [0, 0.02, 0.135], [0, 0, 0], { c: 0.02, bx: 0.8 });
  P(b, 'pelvis', 'paint', [0.4, 0.07, 0.3], [0, 0.04, 0], [0, 0, 0], { c: 0.02 });
  b.add(b.cbox(0.1, 0.06, 0.04, 0.012), 'pelvis', 'trim', [0, 0.04, 0.16]);
  b.add(b.cyl(0.018, 0.018, 0.02, 10), 'pelvis', 'eye', [0, 0.04, 0.182], [PI / 2, 0, 0]);
  // pelvis: black hips, long gold faulds (knight skirt) front and sides
  P(b, 'pelvis', 'metal', [0.36, 0.18, 0.28], [0, -0.04, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'paint', [0.2, 0.26, 0.05], [0, -0.13, 0.17], [-0.12, 0, 0], { c: 0.02, bx: 0.55 });
  b.add(b.cbox(0.012, 0.2, 0.012, 0.003), 'pelvis', rk >= 3 ? 'glow' : 'trim', [0, -0.12, 0.2], [-0.12, 0, 0]);
  PS(b, 'pelvis', 'paint', [0.06, 0.3, 0.24], [0.21, -0.12, 0.01], [0, 0, 0.2], { c: 0.02, bx: 1.15, bz: 1.1 });
  PS(b, 'pelvis', 'trim', [0.015, 0.26, 0.2], [0.245, -0.12, 0.01], [0, 0, 0.2]);
  PS(b, 'pelvis', 'accent', [0.14, 0.24, 0.05], [0.12, -0.12, -0.15], [0.15, 0, 0.12], { c: 0.02 });
  if (rk >= 2) PS(b, 'pelvis', 'paint', [0.1, 0.2, 0.04], [0.12, -0.11, 0.155], [-0.15, -0.25, 0.1], { c: 0.015, bx: 0.7 });
}

function pauldrons(b, o) {
  const rk = o.rank;
  // three stacked gold plates over a black under-layer, platinum edges, cyan lamp, swept crest fin (R2+)
  b.sym(b.sph(20, 12, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.03, 0.0, 0], [0, 0, -0.3], [0.17, 0.15, 0.19]);
  const layers = rk >= 2 ? 3 : 2;
  for (let i = 0; i < layers; i++) {
    const w = 0.36 - i * 0.025, d = 0.42 - i * 0.03, y = 0.09 - i * 0.1, x = 0.07 + i * 0.035, rz = -0.32 - i * 0.16;
    PS(b, 'upArm', i === 1 ? 'trim' : 'paint', [w, 0.1, d], [x, y, 0], [0, 0, rz], { c: 0.035, tx: 0.85, tz: 0.88 });
    PS(b, 'upArm', i === 1 ? 'paint' : 'trim', [w * 0.94, 0.02, d * 0.95], [x + 0.008, y - 0.055, 0], [0, 0, rz]);
    PS(b, 'upArm', 'accent', [w * 0.92, 0.04, d * 0.9], [x + 0.01, y - 0.075, 0], [0, 0, rz]);
  }
  // raised front cowl + rear guard
  PS(b, 'upArm', 'paint', [0.18, 0.12, 0.05], [0.07, 0.14, 0.17], [0.4, 0, -0.3], { c: 0.02, tx: 0.7 });
  PS(b, 'upArm', 'accent', [0.2, 0.12, 0.05], [0.07, 0.12, -0.18], [-0.4, 0, -0.3], { c: 0.02, tx: 0.7 });
  lamp(b, 'upArm', [0.16, 0.1, 0.19], [1.15, 0, -0.35], 0.03);
  lamp(b, 'upArm', [0.24, -0.02, 0.15], [1.2, 0, -0.7], 0.018);
  rivets(b, 'upArm', 'trim', [[[0.2, 0.08, -0.12], [0, 0, -0.32 + PI / 2]], [[0.25, -0.03, -0.1], [0, 0, -0.5 + PI / 2]]]);
  if (rk >= 2) {
    b.sym(fin(b, [[0, 0], [0.16, 0], [0.04, 0.2], [-0.05, 0.22]], 0.03, 0.007), 'upArm', 'paint', [0.11, 0.14, -0.02], [0, PI / 2, -0.35]);
    b.sym(b.cbox(0.012, 0.012, 0.2, 0.003), 'upArm', 'trim', [0.12, 0.215, 0.0], [0.7, 0, -0.35]);
  }
  if (rk >= 3) b.sym(b.cbox(0.012, 0.012, 0.32, 0.003), 'upArm', 'glow', [0.2, 0.025, 0], [0, 0, -0.48]);
  if (rk >= 4) b.sym(fin(b, [[0, 0], [0.03, 0], [-0.08, 0.26], [-0.1, 0.25]], 0.014, 0.003), 'upArm', 'glow', [0.13, 0.17, -0.06], [0, PI / 2, -0.45]);
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  b.sym(b.cyl(0.055, 0.055, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.1);
  b.sym(b.cyl(0.065, 0.058, ua, 12), 'upArm', 'accent', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.15, ua * 0.42, 0.16], [0.02, -ua * 0.62, 0.01], [0, 0, 0], { c: 0.025, tx: 1.1, tz: 1.1 });
  PS(b, 'upArm', 'trim', [0.155, 0.02, 0.165], [0.02, -ua * 0.4, 0.01]);
  piston(b, 'upArm', [0, -0.12, -0.09], [0, -ua + 0.05, -0.095], 'foreArm', [0, 0.02, -0.095], [0, -0.12, -0.1], 0.02);
  // elbow cop + gold vambrace with a platinum ridge, black inner sleeve
  b.sym(discX(b, 0.075, 0.17, 14), 'foreArm', 'metal', [0, 0, 0]);
  PS(b, 'foreArm', 'paint', [0.13, 0.1, 0.07], [0.0, 0.0, 0.09], [-0.5, 0, 0], { c: 0.02, tx: 0.6 });
  b.sym(b.cyl(0.06, 0.052, fa * 0.9, 10), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
  PS(b, 'foreArm', 'paint', [0.15, fa * 0.62, 0.16], [0.012, -fa * 0.58, 0], [0, 0, 0], { c: 0.03, tx: 1.15, tz: 1.12, bx: 0.85, bz: 0.85 });
  PS(b, 'foreArm', 'trim', [0.02, fa * 0.5, 0.06], [0.088, -fa * 0.58, 0.02], [0, 0, -0.04]);
  PS(b, 'foreArm', 'trim', [0.16, 0.022, 0.17], [0.012, -fa * 0.88, 0]);
  if (!far) b.sym(b.cyl(0.016, 0.016, 0.02, 10), 'foreArm', 'eye', [0.09, -fa * 0.4, 0.06], [0, 0, PI / 2]);
  // gauntlets: right fist closed on the hilt, left grip behind the shield
  for (const s of ['L', 'R']) {
    b.add(b.rbox(0.1, 0.12, 0.12, 0.022), 'hand' + s, 'accent', [0, -0.065, 0.005]);
    b.add(plate(b, 0.105, 0.07, 0.1, { c: 0.016, tx: 0.85 }), 'hand' + s, 'paint', [0, -0.05, 0.03], [0.3, 0, 0]);
    b.add(b.cbox(0.11, 0.035, 0.11, 0.01), 'hand' + s, 'trim', [0, -0.125, 0.01]);
  }
}

function sword(b, o) {
  const rk = o.rank, far = b.far;
  // hilt on handR, authored along +z in the blade frame
  b.scope(GRIP_O, [BLADE_A, 0, 0], 1, () => {
    const H = 'handR';
    b.add(b.cyl(0.026, 0.026, 0.25, 10), H, 'accent', [0, 0, -0.01], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.tor(0.028, 0.006, 10, 4), H, 'trim', [0, 0, -0.1 + i * 0.045]);
    b.add(b.sph(12, 8), H, 'paint', [0, 0, -0.15], [0, 0, 0], [0.042, 0.042, 0.05]);
    b.add(b.cyl(0.016, 0.016, 0.02, 8), H, 'eye', [0, 0, -0.195], [PI / 2, 0, 0]);
    // crossguard: swept gold wings with a cyan gem and platinum edges
    b.add(b.cbox(0.13, 0.06, 0.06, 0.015), H, 'paint', [0, 0, GUARD - 0.02]);
    addM(b, fin(b, [[0, -0.03], [0.07, -0.03], [0.2, 0.05], [0.18, 0.075], [0.06, 0.03], [0, 0.03]], 0.04, 0.008), H, 'paint', [0.04, 0, GUARD - 0.03], [PI / 2, 0, 0]);
    addM(b, fin(b, [[0.06, 0.02], [0.19, 0.06], [0.185, 0.07], [0.06, 0.035]], 0.046, 0.003), H, 'trim', [0.04, 0, GUARD - 0.03], [PI / 2, 0, 0]);
    b.add(b.cyl(0.024, 0.024, 0.072, 12), H, 'eye', [0, 0, GUARD - 0.02], [0, 0, 0]);
  });
  // blade on aux1 (origin at the top of the guard): platinum body, white-gold energy core, edge lights at R3+
  const A = 'aux1', W = BW;
  b.add(b.cyl(0.05, 0.06, 0.05, 14), A, 'paint', [0, 0, 0.012], [PI / 2, 0, 0]);
  b.add(b.tor(0.05, 0.01, 14, 4), A, 'glow', [0, 0, 0.035]);
  const body = [[-W / 2, 0], [W / 2, 0], [W * 0.48, BL * 0.8], [W * 0.15, BL * 0.95], [0, BL], [-W * 0.15, BL * 0.95], [-W * 0.48, BL * 0.8]];
  b.add(b.ext(body, 0.026, 0.01), A, 'trim', [0, 0, 0.04], [PI / 2, 0, 0]);
  const core = [[-W * 0.28, 0], [W * 0.28, 0], [W * 0.26, BL * 0.8], [0, BL * 0.96], [-W * 0.26, BL * 0.8]];
  b.add(b.ext(core, 0.036, 0.006), A, 'glow', [0, 0, 0.05], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(W * 0.9, 0.04, 0.03, 0.008), A, 'paint', [0, 0, 0.09 + i * 0.05]);
  if (rk >= 3) addM(b, b.cbox(0.01, 0.012, BL * 0.78, 0.003), A, 'glow', [W * 0.5, 0, 0.04 + BL * 0.4], [0, 0, 0]);
  if (rk >= 5) addM(b, fin(b, [[0, 0], [0.03, 0], [0.012, BL * 0.7], [0, BL * 0.72]], 0.008, 0.002), A, 'glow', [W * 0.5, 0, 0.12], [PI / 2, 0, 0]);
}

function shield(b, o) {
  const rk = o.rank, far = b.far;
  b.scope([0, 0, 0], SHIELD_FRAME, 1, () => b.scope([0.13, -0.1, 0.17], [0.05, 0.55, 0], 1, () => {
    const S = 'foreArmL';
    const kite = (k, s = 1) => [[0, -0.46 * k], [0.24 * k * s, 0.02 * k], [0.24 * k * s, 0.24 * k], [0.15 * k, 0.33 * k], [-0.15 * k, 0.33 * k], [-0.24 * k * s, 0.24 * k], [-0.24 * k * s, 0.02 * k]];
    b.add(b.ext(kite(1.04), 0.05, 0.012), S, 'accent', [0, 0, -0.012]);
    b.add(b.ext(kite(0.94), 0.05, 0.012), S, 'paint', [0, 0, 0.008]);
    // platinum boss ridge + triangle emblem with a glowing core
    b.add(b.cbox(0.03, 0.62, 0.03, 0.008), S, 'trim', [0, -0.06, 0.036]);
    b.add(b.cbox(0.36, 0.028, 0.03, 0.008), S, 'trim', [0, 0.15, 0.036]);
    b.add(triangle(b, 0.12, 0.016, 0.03), S, 'trim', [0, 0.02, 0.04]);
    b.add(triFill(b, 0.05, 0.03), S, rk >= 3 ? 'glow' : 'eye', [0, 0.012, 0.042]);
    if (!far) for (const [x, y2] of [[0.17, 0.24], [-0.17, 0.24], [0.17, 0.03], [-0.17, 0.03], [0, -0.36]]) b.add(b.cyl(0.013, 0.013, 0.02, 6), S, 'trim', [x, y2, 0.036], [PI / 2, 0, 0]);
    if (rk >= 3) {
      const e = kite(1.0);
      for (let i = 0; i < e.length; i++) {
        const a = e[i], c = e[(i + 1) % e.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 0.1) continue;
        b.add(b.cbox(0.012, len * 0.9, 0.012, 0.003), S, 'glow', [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.02], [0, 0, Math.atan2(c[1] - a[1], c[0] - a[0]) - PI / 2]);
      }
    }
    // grip bracket behind
    b.add(b.cbox(0.12, 0.3, 0.05, 0.015), S, 'metal', [0, 0.0, -0.05]);
  }));
}

function cape(b, o) {
  const rk = o.rank, far = b.far;
  // feathered fin-cape: staggered rows of gold / platinum blades hanging from the mantle (aux0 upper row, aux2 lower row sways)
  b.add(b.cbox(0.44, 0.08, 0.1, 0.02), 'aux0', 'accent', [0, 0.02, 0.02]);
  b.add(b.cbox(0.4, 0.03, 0.11, 0.01), 'aux0', 'trim', [0, 0.065, 0.02]);
  if (!far) for (const x of [-0.16, 0, 0.16]) b.add(b.cyl(0.028, 0.028, 0.02, 12), 'aux0', 'eye', [x, 0.02, 0.075], [PI / 2, 0, 0]);
  const blade = (bone, x, y, z, len, w, rz, slot, ridge, tilt = 0.12) => {
    const pts = [[-w / 2, 0], [w / 2, 0], [w * 0.4, -len * 0.85], [0, -len], [-w * 0.4, -len * 0.85]];
    b.add(fin(b, pts, 0.02, 0.006), bone, slot, [x, y, z], [tilt, 0, rz]);
    if (ridge) b.add(fin(b, pts.map(([a, c]) => [a * 0.25, c * 0.92]), 0.03, 0.004), bone, ridge, [x, y, z - 0.004], [tilt, 0, rz]);
  };
  const up = rk >= 1 ? [-0.15, -0.05, 0.05, 0.15] : [-0.1, 0, 0.1];
  up.forEach((x, i) => blade('aux0', x, 0.0, -0.02 - Math.abs(x) * 0.25, 0.5 - Math.abs(x) * 0.4, 0.1, x * 0.9, i % 2 ? 'trim' : 'paint', rk >= 5 ? 'glow' : i % 2 ? 'paint' : 'trim'));
  if (rk >= 4) for (const s of [1, -1]) {
    // outer wing blades flare out like a mantle of swords
    blade('aux0', s * 0.22, 0.03, -0.08, 0.62, 0.075, s * 0.55, 'paint', 'glow', 0.25);
    blade('aux0', s * 0.27, 0.04, -0.1, 0.48, 0.06, s * 0.8, 'trim', 'paint', 0.3);
  }
  if (rk === 0) return;
  // lower row: black base blades with narrower gold overlays, staggered between the upper row
  const lo = [-0.2, -0.1, 0, 0.1, 0.2];
  for (const x of lo) {
    const ax = Math.abs(x), len = 0.56 - ax * 0.5;
    blade('aux2', x * 1.1, 0.02, -0.03 - ax * 0.25, len, 0.1, x * 0.7, 'accent', null, 0.08);
    blade('aux2', x * 1.1, 0.0, -0.05 - ax * 0.25, len * 0.85, 0.06, x * 0.7, ax > 0.15 ? 'trim' : 'paint', rk >= 4 && !far ? 'glow' : null, 0.08);
  }
  // twin thrusters peeking out under the mantle
  for (const x of [0.13, -0.13]) {
    b.add(b.cyl(0.04, 0.05, 0.12, 12), 'aux0', 'metal', [x, -0.02, 0.05], [PI / 2 - 0.6, 0, 0]);
    b.add(b.cyl(0.032, 0.032, 0.02, 12), 'aux0', rk >= 3 ? 'glow' : 'accent', [x, -0.05, 0.0], [PI / 2 - 0.6, 0, 0]);
  }
}

function sigil(b, o) {
  // R5: floating gold sigil behind the head (spins on aux3): triangle in a double ring with radiating blades
  const S = 'aux3', K = 1.4;
  b.add(b.tor(0.3 * K, 0.018, 44, 5), S, 'glow', [0, 0, 0]);
  b.add(b.tor(0.345 * K, 0.011, 44, 4), S, 'trim', [0, 0, 0]);
  b.add(b.tor(0.2 * K, 0.008, 36, 3), S, 'glow', [0, 0, 0]);
  b.add(triangle(b, 0.25 * K, 0.026, 0.03), S, 'paint', [0, 0, 0]);
  b.add(triFill(b, 0.08 * K, 0.03), S, 'glow', [0, -0.01, 0]);
  for (let i = 0; i < 12; i++) {
    const a = i * PI / 6, long = i % 2 === 0, r0 = 0.36 * K, h = long ? 0.2 : 0.1;
    b.add(fin(b, [[-0.026, 0], [0.026, 0], [0, h]], 0.016, 0.004), S, long ? 'paint' : 'glow', [Math.cos(a) * r0, Math.sin(a) * r0, 0], [0, 0, a - PI / 2]);
  }
}

// extra plating density: tassets, ribs, collar, pauldron ridges, knee cops, sabatons
function plating(b, o) {
  const D = b.rig.D, far = b.far, rk = o.rank;
  // layered tassets riding the thighs
  PS(b, 'thigh', 'accent', [0.19, 0.16, 0.05], [0.02, -0.04, 0.15], [-0.2, 0, 0.06], { c: 0.02, bx: 1.1 });
  PS(b, 'thigh', 'paint', [0.17, 0.13, 0.05], [0.02, -0.03, 0.17], [-0.24, 0, 0.06], { c: 0.02, bx: 1.12, tx: 0.9 });
  PS(b, 'thigh', 'trim', [0.16, 0.018, 0.05], [0.02, -0.1, 0.19], [-0.24, 0, 0.06]);
  if (rk >= 2) PS(b, 'thigh', 'paint', [0.06, 0.2, 0.15], [0.12, -0.05, 0.0], [0, 0, 0.12], { c: 0.015, bx: 1.1 });
  // rib plates down the flanks + high collar behind the head
  PS(b, 'chest', 'accent', [0.06, 0.24, 0.26], [0.29, 0.08, -0.01], [0, 0, 0.14], { c: 0.02, bx: 0.8 });
  if (!far) for (let i = 0; i < 3; i++) PS(b, 'chest', 'trim', [0.065, 0.014, 0.22], [0.295, 0.0 + i * 0.07, -0.01], [0, 0, 0.14]);
  P(b, 'chest', 'paint', [0.36, 0.13, 0.06], [0, 0.34, -0.13], [-0.55, 0, 0], { c: 0.02, tx: 0.75 });
  P(b, 'chest', 'trim', [0.32, 0.02, 0.065], [0, 0.4, -0.16], [-0.55, 0, 0]);
  // abdomen bands
  if (!far) for (let i = 0; i < 2; i++) P(b, 'spine', 'paint', [0.26 - i * 0.03, 0.02, 0.06], [0, 0.155 - i * 0.075, 0.18], [0.1, 0, 0]);
  // ribbed pauldron crowns
  if (!far) for (let i = 0; i < 3; i++) PS(b, 'upArm', 'trim', [0.02, 0.035, 0.32], [0.04 + i * 0.07, 0.15 - i * 0.025, 0], [0, 0, -0.32]);
  vent(b, 'upArm', [0.2, -0.13, -0.12], [0, -0.9, -0.75], 0.11, 0.08, 3, true);
  // knee cops + sabaton plates
  PS(b, 'shin', 'trim', [0.13, 0.07, 0.05], [0, 0.07, 0.16], [-0.35, 0, 0], { c: 0.015, tx: 0.7 });
  PS(b, 'foot', 'trim', [0.13, 0.03, 0.12], [0, -D.ankle + 0.125, 0.12], [0.32, 0, 0], { c: 0.01 });
  PS(b, 'foot', 'accent', [0.12, 0.03, 0.1], [0, -D.ankle + 0.1, 0.22], [0.25, 0, 0], { c: 0.01 });
  // forearm cuffs
  PS(b, 'foreArm', 'accent', [0.17, 0.05, 0.18], [0.012, -D.foreArm * 0.25, 0], [0, 0, 0], { c: 0.012 });
}

function build(b, o) {
  b.scope([0, 0.01, 0], [0, 0, 0], 1.12, () => helm(b, o));
  plating(b, o);
  torso(b, o);
  pauldrons(b, o);
  armsAndHands(b, o);
  sword(b, o);
  shield(b, o);
  cape(b, o);
  legs(b, o, { w: 1.18, knee: o.rank >= 2 ? 'spike' : 'cap', foot: 'point', thighSlot: 'accent', shellSlot: 'accent', shinPlateSlot: 'paint', kneeSlot: 'paint', footSlot: 'paint' });
  // thigh plates, knee pistons, greave ridges, sabaton lamps
  PS(b, 'thigh', 'trim', [0.15, 0.24, 0.07], [0.02, -0.22, 0.12], [0.05, 0, 0.04], { c: 0.02, tx: 1.1, bx: 0.8 });
  PS(b, 'thigh', 'paint', [0.15, 0.02, 0.075], [0.02, -0.095, 0.125]);
  piston(b, 'thigh', [0, -0.1, -0.11], [0, -0.38, -0.12], 'shin', [0, 0.0, -0.13], [0, -0.16, -0.13], 0.022);
  PS(b, 'shin', 'trim', [0.025, 0.24, 0.03], [0, -0.17, 0.2], [0.12, 0, 0]);
  lamp(b, 'shin', [0.08, -0.08, 0.17], [PI / 2 - 0.12, 0, 0], 0.016);
  PS(b, 'shin', 'paint', [0.06, 0.2, 0.16], [0.12, -0.2, 0], [0, 0, 0.06], { c: 0.015 });
  if (o.rank >= 3) PS(b, 'shin', 'glow', [0.01, 0.16, 0.01], [0.155, -0.2, 0.05], [0, 0, 0.06]);
  if (o.rank >= 4) {
    b.sym(b.cbox(0.012, 0.26, 0.012, 0.003), 'thigh', 'glow', [0.11, -0.2, 0.09]);
    PS(b, 'chest', 'glow', [0.012, 0.22, 0.012], [0.3, 0.16, 0.12], [0.06, 0, 0.5]);
  }
  if (o.rank >= 5) sigil(b, o);
}

// ---------- anims ----------
const anims = {
  idle(P, t, ctx) {
    stance(P, ctx, t);
    // every ~8.5 s: an oath salute (blade raised upright before the visor), then back to guard
    const c = t % 8.5, w = L.kf(c, [[0, 0], [5.4, 0], [5.9, 1], [6.9, 1], [7.5, 0]]);
    if (w > 0.001) {
      swordIK(P, ctx, [-0.1, 1.5, 0.32], [0.02, 1, 0.12], [0, 0, 1], w);
      L.A(P, 'head', 0.12 * w, 0, 0); L.A(P, 'chest', -0.04 * w, 0, 0);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'chest', -0.08, 0, 0); L.A(P, 'head', 0.05, 0, 0);
    guard(P, 0.4, 0);
    L.A(P, 'upArmL', -0.15, 0, 0);
  },
  // Arc Blade: big diagonal cut from high right to low left, step in (impact 0.42)
  attack(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.16, 1], [0.72, 1], [1, 0]]);
    const tw = L.kf(u, [[0, 0], [0.28, -0.55], [0.42, 0.5], [0.62, 0.6], [1, 0]]);
    const cut = L.kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.66, 1], [1, 0]]);
    L.pel(P, 0, (-0.06 - 0.1 * cut) * 1.0, 0.16 * cut);
    L.A(P, 'pelvis', 0, tw * 0.25, 0); L.A(P, 'spine', 0.18 * cut - 0.06 * (1 - cut) * w, tw * 0.3, 0); L.A(P, 'chest', 0.06 * cut, tw * 0.4, 0);
    L.A(P, 'head', -0.05 * cut, -tw * 0.5, 0);
    L.A(P, 'upArmL', 0.25 * cut - 0.2 * (tw < 0 ? -tw : 0), 0, 0.15 * cut);
    swordIK(P, ctx,
      kv(u, [[0, [-0.5, 1.95, -0.08]], [0.28, [-0.5, 1.98, -0.08]], [0.42, [0.06, 1.08, 0.62]], [0.62, [0.34, 1.0, 0.36]], [1, [0.34, 1.0, 0.36]]]),
      kv(u, [[0, [-0.3, 0.6, -0.75]], [0.28, [-0.3, 0.6, -0.75]], [0.42, [0.55, -0.42, 0.72]], [0.62, [0.92, -0.32, -0.15]], [1, [0.92, -0.32, -0.15]]]),
      [0.55, 0.6, -0.3], w, 0.45);
    L.plant(P, ctx, 0.17 + 0.24 * cut, -0.1 - 0.14 * cut, 1.32 + 0.1 * cut, 0, 0.2 * cut);
  },
  // thrust: pull back, lunge, blade straight into the target (impact 0.42)
  attack_alt(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.14, 1], [0.75, 1], [1, 0]]);
    const back = L.kf(u, [[0, 0], [0.3, 1], [0.4, 0], [1, 0]]);
    const ln = L.kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.7, 0.9], [1, 0]]);
    L.pel(P, 0, -0.06 - 0.12 * ln, -0.08 * back + 0.3 * ln);
    L.A(P, 'pelvis', 0, -0.3 * back + 0.25 * ln, 0); L.A(P, 'spine', 0.12 * ln, -0.15 * back + 0.1 * ln, 0); L.A(P, 'chest', 0.05 * ln, -0.15 * back + 0.1 * ln, 0);
    L.A(P, 'upArmL', 0.35 * ln, 0, 0.25 * ln); L.A(P, 'foreArmL', 0.4 * ln, 0, 0);
    swordIK(P, ctx,
      kv(u, [[0, [-0.34, 1.36, -0.3]], [0.3, [-0.34, 1.36, -0.3]], [0.42, [-0.1, 1.42, 0.92]], [0.7, [-0.1, 1.4, 0.86]], [1, [-0.1, 1.4, 0.86]]]),
      [0.06, 0.06, 1], [0, 1, 0], w, 0.35);
    L.plant(P, ctx, 0.17 + 0.4 * ln, -0.1 - 0.22 * ln, 1.3, 0, 0.3 * ln);
  },
  // Oath of Steel: blade upright before the visor, shield to the heart (cast 0.5)
  cast(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.35, 1], [0.8, 1], [1, 0]]), bow = L.kf(u, [[0, 0], [0.35, 0.6], [0.5, -0.4], [0.8, -0.2], [1, 0]]);
    L.A(P, 'head', 0.3 * bow, 0, 0); L.A(P, 'chest', 0.08 * bow - 0.08 * k, 0, 0);
    L.A(P, 'upArmL', -0.25 * k, 0, -0.15 * k);
    swordIK(P, ctx, kv(u, [[0, [-0.1, 1.52, 0.33]], [0.5, [-0.1, 1.58, 0.36]], [1, [-0.1, 1.52, 0.33]]]), [0.02, 1, 0.1], [0, 0, 1], k);
    P[L.PX + 1] += 0.04 * k;
  },
  // JUDGEMENT ARC: leap, greatsword overhead, slam down the lane (impact 0.23 = the sim's release), kneel in the crack, rise
  overdrive(P, u, ctx) {
    ctx.odU = u;
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.035, 1], [0.84, 1], [0.97, 0]]);
    const crouch = L.kf(u, [[0, 0], [0.05, 1], [0.1, 0], [0.19, 0], [0.23, 1.15], [0.6, 1], [0.74, 0.5], [0.86, 0], [1, 0]]);
    const air = L.kf(u, [[0, 0], [0.06, 0], [0.13, 1], [0.19, 0.55], [0.23, 0], [1, 0]]);
    const arch = L.kf(u, [[0, 0], [0.13, 1], [0.19, 0.6], [0.23, -1], [0.6, -0.9], [0.8, 0], [1, 0]]);
    const tr = Math.sin(u * 120) * L.kf(u, [[0, 0], [0.23, 1], [0.5, 0.6], [0.6, 0]]);
    L.pel(P, 0, -0.06 - 0.36 * crouch + 0.45 * air, 0.1 * air + 0.12 * crouch);
    L.A(P, 'spine', -0.18 * arch * (arch > 0 ? 1 : 0.6) + 0.01 * tr, 0, 0); L.A(P, 'chest', -0.12 * arch, 0, 0);
    L.A(P, 'head', -0.25 * Math.max(0, arch) + 0.1 * Math.max(0, -arch), 0, 0);
    // free arm flung out wide for balance, shield high
    const fl = L.kf(u, [[0, 0], [0.1, 1], [0.6, 1], [0.85, 0]]);
    L.RS(P, 'upArm', 'L', L.lerp(-0.42, -0.9, fl), L.lerp(-0.12, 0.5, fl), L.lerp(0.3, 1.25, fl));
    L.RS(P, 'foreArm', 'L', L.lerp(-1.15, -0.5, fl), 0, 0);
    swordIK(P, ctx,
      kv(u, [[0, [-0.4, 1.18, 0.15]], [0.05, [-0.48, 1.1, -0.16]], [0.14, [-0.12, 2.42, -0.06]], [0.19, [-0.06, 2.36, 0.12]], [0.23, [-0.04, 1.02, 0.74]], [0.6, [-0.04, 0.98, 0.72]], [0.76, [-0.32, 1.2, 0.4]], [1, [-0.32, 1.2, 0.4]]]),
      kv(u, [[0, [-0.3, -0.4, 0.85]], [0.05, [-0.55, -0.45, -0.7]], [0.14, [0, 0.55, -0.83]], [0.19, [0, 0.97, 0.25]], [0.23, [0, -0.3, 0.95]], [0.6, [0, -0.3, 0.95]], [0.76, [-0.25, 0.1, 0.96]], [1, [-0.25, 0.1, 0.96]]]),
      [1, 0, 0], w, 0.3);
    // kneel: left foot forward, right knee to the floor while planted
    L.plant(P, ctx, 0.2 + 0.32 * crouch, -0.12 - 0.36 * crouch, 1.3 + 0.1 * crouch, 0, 0.85 * Math.min(1, crouch));
    if (air > 0) for (const s of ['L', 'R']) L.AS(P, 'thigh', s, -0.5 * air, 0, 0), L.AS(P, 'shin', s, 0.9 * air, 0, 0), L.AS(P, 'foot', s, -0.3 * air, 0, 0);
  },
  hit(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.08 * k; P[L.PX + 1] -= 0.04 * k;
    L.A(P, 'pelvis', -0.05 * k, 0.08 * k * d, 0);
    L.A(P, 'spine', -0.14 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.16 * k, 0.1 * k * d, 0.04 * k * d);
    L.A(P, 'head', -0.25 * k, -0.15 * k * d, 0.15 * k * d);
    // shield snaps up to cover
    L.A(P, 'upArmL', -0.45 * k, 0, -0.1 * k); L.A(P, 'foreArmL', 0.2 * k, 0, 0);
    L.A(P, 'upArmR', 0.15 * k, 0, 0.15 * k);
    L.plant(P, ctx, 0.12, -0.14, 1.25);
  },
  // falls to a knee with the sword planted, slumps over it, then pitches forward
  die(P, u, ctx) {
    const v = u < 0.3 ? u / 0.3 * 0.42 : u < 0.62 ? 0.42 + (u - 0.3) / 0.32 * 0.13 : 0.55 + (u - 0.62) / 0.38 * 0.45;
    L.dieB(P, v, ctx);
    const w = L.kf(u, [[0, 0], [0.22, 1], [0.6, 1], [0.74, 0]]);
    const slump = L.kf(u, [[0.3, 0], [0.6, 1]]);
    L.A(P, 'head', 0.4 * slump, 0, 0); L.A(P, 'chest', 0.15 * slump, 0, 0);
    swordIK(P, ctx, [-0.22, 0.86 - 0.08 * slump, 0.5], [0.02, -1, 0.15], [1, 0, 0], w, 0.4);
    L.A(P, 'upArmL', -0.3 * w, 0, 0);
  },
  // superhero landing on one knee, sword planted, rises and sweeps the blade out (land 0.4, ready 0.85)
  deploy(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0.4], [0.32, 0.5], [0.4, 1], [0.62, 1], [0.84, 0], [1, 0]]);
    P[L.PX + 1] -= 0.4 * land; P[L.PX + 2] += 0.1 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.12 * land, 0, 0);
    L.A(P, 'head', L.kf(u, [[0, 0.3], [0.6, 0.45], [0.74, -0.25], [0.9, 0], [1, 0]]), 0, 0);
    L.A(P, 'upArmL', 0.2 * land, 0, 0.4 * land);
    swordIK(P, ctx, kv(u, [[0, [-0.24, 0.95, 0.5]], [0.62, [-0.24, 0.92, 0.5]], [0.76, [-0.6, 1.2, 0.2]], [1, [-0.6, 1.2, 0.2]]]),
      kv(u, [[0, [0.02, -1, 0.15]], [0.62, [0.02, -1, 0.15]], [0.76, [-0.9, -0.15, 0.4]], [1, [-0.9, -0.15, 0.4]]]), [1, 0, 0],
      L.kf(u, [[0, 1], [0.7, 1], [0.95, 0]]), 0.4);
    L.plant(P, ctx, 0.2 + 0.18 * land, -0.12 - 0.3 * land, 1.3, 0, 0.85 * land);
  },
  // greatsword salute to the sky, cape flowing, a slow pump
  victory(P, t, ctx) {
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7)), pump = Math.max(0, Math.sin(t * 2.6)) * k;
    L.A(P, 'chest', -0.12 * k, 0.12 * k, 0); L.A(P, 'head', -0.2 * k, 0.1 * k, 0);
    L.A(P, 'upArmL', 0.1 * k, 0, 0.35 * k);
    swordIK(P, ctx, [-0.24, 2.18 + 0.06 * pump, 0.12], [0.1, 1, 0.06], [0, 0, 1], k, 0.3);
    ctx.capeAdd = (0.25 + 0.12 * Math.sin(t * 3.1)) * k;
    P[L.PX + 1] += 0.03 * pump;
  },
};

export default {
  id: 'paladin', name: 'SOVEREIGN PALADIN', role: 'tank', faction: 'corporate', rarity: 'legendary', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 2.1, radius: 0.72, walkSpeed: 1.2, cadence: 0.8, scheme: 'bold',
  style: { weapon: 'blade', heavy: 0.55, stance: 1.3 },
  // gold primary for every tint (legendary unit); faction colour stays in the lamps + seams
  mats: {
    all: {
      paint: { color: 0xffc84c, metal: 0.62, rough: 0.26, coat: 0.8, coatRough: 0.05, env: 1.05, emissive: 0x2a1a00, ei: 1, panel: { scale: 3.6, groove: 0.45, vary: 0.07 } },
      accent: { color: 0x141218, metal: 0.55, rough: 0.3, coat: 1, env: 0.9 },
      trim: { color: 0xdfe4ec, metal: 0.92, rough: 0.16, coat: 0.6, env: 1.1 },
      glow: { color: 0xffb030, ei: 2.8 },   // robots touch-up: saturated gold at a lower intensity so the blade keeps its hue under bloom
    },
  },
  sockets: { muzzle: ['aux1', [0, 0, BL * 0.82]], core: [0, 0.17, 0.3], head: [0, 0.1, 0.16], hand: ['handR', [0, -0.08, 0]] },
  events: { attack: [['impact', 0.42]], attack_alt: [['impact', 0.42]], cast: [['cast', 0.5]], overdrive: [['cast', 0.04], ['impact', 0.23]], die: [['down', 0.82]], deploy: [['land', 0.4], ['ready', 0.85]] },
  durs: { attack: 1.0, attack_alt: 1.05, cast: 1.2, overdrive: 2.6, hit: 0.45, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.2), an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    let sway = 0.04 + 0.03 * Math.sin(t * 1.9) + 0.32 * mv, top = 0.02 * Math.sin(t * 1.4) + 0.1 * mv;
    if (an === 'overdrive') { const a = L.kf(u, [[0, 0], [0.13, 1], [0.23, -0.3], [0.4, 0.2], [0.8, 0.1], [1, 0]]); sway += 0.6 * a; top += 0.25 * a; }
    if (an === 'attack' || an === 'attack_alt') sway += 0.25 * L.kf(u, [[0, 0], [0.42, 1], [1, 0]]);
    if (an === 'deploy') sway += 0.8 * L.kf(u, [[0, 1], [0.38, 1], [0.5, 0.1], [1, 0]]);
    sway += ctx.capeAdd || 0; ctx.capeAdd = 0;
    if (an === 'die') sway *= 1 - u;
    P[BI.aux0 * 3] = top; P[BI.aux2 * 3] = sway;
    P[BI.aux1 * 3] = BLADE_A;
    P[BI.aux3 * 3 + 2] = t * 0.45;
    P[BI.aux3 * 3 + 1] = Math.sin(t * 0.7) * 0.15;
  },
  // blade extends into the greatsword during Judgement Arc
  tick(unit, dt, ctx, bones) {
    const od = unit.state.action === 'overdrive';
    const target = od ? L.kf(ctx.odU || 0, [[0, 0], [0.05, 0], [0.13, 1], [0.66, 1], [0.78, 0]]) : 0;
    ctx.gs = (ctx.gs || 0) + (target - (ctx.gs || 0)) * (1 - Math.exp(-dt * 14));
    const k = ctx.gs;
    bones[BI.aux1].scale.set(1 + 0.7 * k, 1 + 0.5 * k, 1 + 1.75 * k);
    if (!od) ctx.odU = 0;
  },
  fxHints: { impact: 'gold_arc', overdrive: 'judgement_arc', color: 0xffc23a, blade: 0xffd98a },
  build,
};
