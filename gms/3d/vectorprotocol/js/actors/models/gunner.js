// GUNNER, corporate suppression unit (STARTER). Brief: docs/ROSTER.md `gunner`; look: refs/ref_battle_02.png player back-near.
// Decommissioned riot-control gunner: bulky forward-leaning upper body, low helm with mismatched twin sensor eyes,
// ammo drum backpack feeding a belt that arcs down to a big hip-held rotary cannon. Matte black + gunmetal, cyan eyes + barrel tips.
// Starter wear: scuffed stencils ("07"), a bolted-on patch plate, a bent antenna, one replaced (smaller) eye.
// Rank tiers: R0-1 base · R2 armoured belt cover + shoulder lamp · R3 glowing cyan heat rings on the barrels
//   (beyond the brief: R4 hip ammo boxes + shin guards · R5 back cooling fins with glow edges).
// Rarity (o.r): rare+ extra shoulder plating + gun glow strip · epic+ thigh plates + vent lamps · legendary sensor crown + muzzle brake.
// Technique: IK hip-hold pose precomputed once; gun authored in root space (poseFrame); the off hand locks to the side
// handle (style.grip); the barrel cluster lives on aux1 (re-parented to handR) and spins about the gun axis in tick().
import { THREE, P, PS, plate, fin, discX, legs, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.36, shin: 0.37, ankle: 0.11, hipX: 0.15, hipY: -0.05, spine: 0.12, chest: 0.22, neck: 0.15, headOff: 0.03,
  clavX: 0.07, clavY: 0.2, shoulder: 0.27, upArm: 0.28, foreArm: 0.27, aux0: [0, 0.27, -0.32],
  parents: { aux1: 'handR' }, aux1: [0, 0, 0],
};
const HAND_T = [-0.27, 0.97, 0.26];       // right hand (rear grip) in root space at the hip hold
const SIDE_GRIP = [0.13, 0.06, 0.34];      // left-hand handle, gun frame (root-aligned, origin = right hand joint)
const BARREL_C = [0, 0.075, 0.32];         // barrel cluster axis start (gun frame)
const BL = 0.72;                           // barrel length
const HUNCH = { spine: 0.1, chest: 0.12, neck: -0.08, head: -0.1 };

const _t = new THREE.Vector3();
// Upper body: forward hunch + right hand to the hip hold (k 0..1 lowers/raises the gun a little). Left arm = style.grip.
function gunArm(P, ctx, dx = 0, dy = 0, dz = 0, yaw = 0) {
  // follow the pelvis offset relative to the reference hold, and the torso yaw
  const H = HOLD_P || P, X = LIB.PX;
  const x = HAND_T[0] + dx, z = HAND_T[2] + dz, c = Math.cos(yaw), s = Math.sin(yaw);
  LIB.armIK(P, ctx, 'R', _t.set(x * c + z * s + P[X] - H[X], HAND_T[1] + dy + P[X + 1] - H[X + 1], -x * s + z * c + P[X + 2] - H[X + 2]), 0.3);
  LIB.R(P, 'handR', 0, 0, 0);
}
function hunch(P, k = 1) {
  LIB.A(P, 'spine', HUNCH.spine * k, 0, 0); LIB.A(P, 'chest', HUNCH.chest * k, 0, 0);
  LIB.A(P, 'neck', HUNCH.neck * k, 0, 0); LIB.A(P, 'head', HUNCH.head * k, 0, 0);
}
// the base stance every anim starts from (feet planted wide, knees bent, gun at the hip)
function stance(P, ctx, t) {
  const L = LIB;
  L.idle(P, ctx, t);
  hunch(P);
  P[L.PX + 1] -= 0.035;
  gunArm(P, ctx);
}

// ---- precompute the hold pose -> gun frame on handR, grip + muzzle + barrel axis in hand space
const RIG = makeRig(DIMS);
const REF_CTX = { D: RIG.D, rig: RIG, t: 0, style: { weapon: 'cannon', heavy: 0.7, stance: 1.4 }, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI };
let HOLD_P = null;
{ const h = new Float32Array(LIB.NCH); stance(h, REF_CTX, 0); HOLD_P = h; }
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const HOLD = poseOf(HOLD_P);
const GUN_FRAME = poseFrame(RIG, HOLD, 'handR');
const _eu = new THREE.Euler(GUN_FRAME[0], GUN_FRAME[1], GUN_FRAME[2], 'XYZ');
const rot = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyEuler(_eu);
const GRIP = rot(SIDE_GRIP).toArray();
const BARREL_AXIS = rot([0, 0, 1]).normalize();
const AUX1 = rot(BARREL_C).toArray();
DIMS.aux1 = AUX1;
const MUZZLE = rot([0, BARREL_C[1], BARREL_C[2] + BL + 0.06]).toArray();
// root-space (hold pose) point -> bone-local bind offset, for parts that must meet across two bones (the ammo belt)
function toBone(bone, p) {
  const { p: bp, q } = LIB.fkBone(HOLD_P, REF_CTX, bone, new THREE.Vector3(), new THREE.Quaternion());
  return new THREE.Vector3(p[0], p[1], p[2]).sub(bp).applyQuaternion(q.invert());
}
const HAND_HOLD = LIB.fkPoint(HOLD_P, REF_CTX, 'handR', [0, 0, 0], new THREE.Vector3());

// stencil 7-segment numerals ("chipped" = a seeded segment drops a corner) on a plate face; frame +z out, readable from the front
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function stencil(b, bone, slot, text, pos, rot3, h = 0.07, chip = 0) {
  const w = h * 0.55, t = h * 0.14, gap = w * 1.45;
  b.scope(pos, rot3, 1, () => {
    [...text].forEach((ch, i) => {
      const cx = (i - (text.length - 1) / 2) * gap; // +x = the viewer's right when the text faces them
      const segs = SEG[ch] || '';
      for (const s of segs) {
        if (chip && ((ch.charCodeAt(0) * 7 + s.charCodeAt(0) * 3 + i) % chip) === 0) continue;
        const hz = s === 'a' || s === 'd' || s === 'g';
        const x = cx + (s === 'b' || s === 'c' ? w / 2 : s === 'e' || s === 'f' ? -w / 2 : 0);
        const y = s === 'a' ? h / 2 : s === 'd' ? -h / 2 : s === 'g' ? 0 : s === 'b' || s === 'f' ? h / 4 : -h / 4;
        b.add(hz ? b.box(w * 0.78, t, 0.006) : b.box(t, h * 0.42, 0.006), bone, slot, [x, y, 0]);
      }
    });
  });
}
// round lamp: bezel + lens
function lamp(b, bone, pos, rot3, r = 0.025, slot = 'glow', sym = true) {
  const put = sym ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.4, r * 1.4, 0.02, 12), bone, 'metal', pos, rot3);
  put(b.cyl(r, r, 0.028, 12), bone, slot, pos, rot3);
}
// bare-metal chips on a plate edge (wear)
function chips(b, bone, list) { if (b.far) return; for (const [p, r, s] of list) b.add(b.box(s[0], s[1], s[2]), bone, 'metal', p, r); }

function head(b, o) {
  const y = 0.03, z = 0.1;
  // low wide helm: dome shell, forward brim, dark face, chin guard
  b.add(plate(b, 0.3, 0.15, 0.28, { c: 0.04, tx: 0.8, tz: 0.82 }), 'head', 'paint', [0, y + 0.05, z - 0.02]);
  P(b, 'head', 'accent', [0.34, 0.045, 0.2], [0, y + 0.1, z + 0.08], [0.18, 0, 0], { c: 0.015, tx: 0.85 });
  b.add(b.cbox(0.24, 0.1, 0.06, 0.02), 'head', 'metal', [0, y - 0.005, z + 0.11]);
  P(b, 'head', 'paint', [0.2, 0.06, 0.1], [0, y - 0.07, z + 0.1], [-0.3, 0, 0], { c: 0.02, bx: 0.7 });
  for (let i = 0; i < 3; i++) b.add(b.box(0.12, 0.008, 0.01), 'head', 'accent', [0, y - 0.055 - i * 0.016, z + 0.15 - i * 0.004], [-0.3, 0, 0]);
  // twin sensor eyes: left original (big), right a replaced smaller unit with a scope ring
  b.add(b.cyl(0.05, 0.05, 0.03, 16), 'head', 'trim', [0.06, y + 0.005, z + 0.135], [PI / 2, 0, 0]);
  b.add(b.cyl(0.039, 0.039, 0.035, 16), 'head', 'eye', [0.06, y + 0.005, z + 0.142], [PI / 2, 0, 0]);
  b.add(b.cyl(0.04, 0.04, 0.05, 12), 'head', 'metal', [-0.062, y + 0.0, z + 0.13], [PI / 2, 0, 0]);
  b.add(b.tor(0.034, 0.007, 14, 4), 'head', 'trim', [-0.062, y + 0.0, z + 0.158]);
  b.add(b.cyl(0.026, 0.026, 0.04, 12), 'head', 'eye', [-0.062, y + 0.0, z + 0.15], [PI / 2, 0, 0]);
  // ear discs + antenna (left straight, right bent: wear)
  b.sym(discX(b, 0.05, 0.05, 12), 'head', 'metal', [0.16, y + 0.03, z - 0.04]);
  b.sym(discX(b, 0.03, 0.055, 10), 'head', 'accent', [0.165, y + 0.03, z - 0.04]);
  if (!b.far) {
    b.add(b.cyl(0.006, 0.009, 0.24, 5), 'head', 'metal', [0.17, y + 0.17, z - 0.08], [-0.25, 0, -0.15]);
    b.add(b.cyl(0.012, 0.012, 0.02, 8), 'head', 'glow', [0.185, y + 0.29, z - 0.11]);
    b.add(b.cyl(0.006, 0.008, 0.11, 5), 'head', 'metal', [-0.17, y + 0.11, z - 0.07], [-0.1, 0, 0.2]);
    b.add(b.cyl(0.006, 0.006, 0.09, 5), 'head', 'metal', [-0.2, y + 0.19, z - 0.06], [0.2, 0, 1.0]);
  }
  // helm stripe + chip marks
  b.add(b.box(0.05, 0.012, 0.2), 'head', 'trim', [0.07, y + 0.125, z - 0.02], [0.1, 0, 0]);
  b.add(b.box(0.022, 0.014, 0.22), 'head', 'glow', [-0.02, y + 0.127, z - 0.02], [0.1, 0, 0]);
  chips(b, 'head', [[[0.12, y + 0.11, z + 0.15], [0.2, 0, 0.3], [0.03, 0.012, 0.01]], [[-0.09, y + 0.12, z + 0.06], [0.1, 0.4, 0], [0.02, 0.01, 0.02]]]);
  if (o.r >= 3) {
    // legendary sensor crown: raised targeting array
    b.add(b.cbox(0.16, 0.05, 0.08, 0.015), 'head', 'trim', [0, y + 0.15, z - 0.05]);
    for (const x of [-0.05, 0, 0.05]) b.add(b.cyl(0.008, 0.008, 0.12 + (x === 0 ? 0.06 : 0), 6), 'head', 'trim', [x, y + 0.22 + (x === 0 ? 0.03 : 0), z - 0.06]);
    b.add(b.cbox(0.12, 0.018, 0.02, 0.006), 'head', 'glow', [0, y + 0.17, z - 0.005]);
  }
}

function torso(b, o) {
  const far = b.far;
  // frame
  P(b, 'chest', 'metal', [0.5, 0.42, 0.38], [0, 0.11, -0.03], [0, 0, 0], { c: 0.05 });
  // bulky chest: big tapered matte plate, raised collar that the head sinks into
  P(b, 'chest', 'paint', [0.66, 0.38, 0.44], [0, 0.15, 0.04], [0.12, 0, 0], { c: 0.07, tx: 1.15, bx: 0.74, tz: 1.0, bz: 0.82 });
  P(b, 'chest', 'accent', [0.52, 0.12, 0.26], [0, 0.31, -0.14], [-0.35, 0, 0], { c: 0.04, tx: 0.78, tz: 0.8 });
  PS(b, 'chest', 'paint', [0.14, 0.16, 0.24], [0.17, 0.4, 0.0], [-0.1, 0, -0.35], { c: 0.03, tx: 0.7 });
  // pec plates: left original, right a bolted-on patch (accent, rivets) = starter wear
  b.add(plate(b, 0.24, 0.2, 0.07, { c: 0.03, tx: 1.08, bx: 0.8 }), 'chest', 'paint', [0.14, 0.2, 0.25], [0.3, 0.22, 0.04]);
  b.add(plate(b, 0.22, 0.17, 0.06, { c: 0.012, tx: 0.95 }), 'chest', 'accent', [-0.145, 0.19, 0.255], [0.32, -0.2, -0.06]);
  if (!far) for (const [x, yy] of [[-0.06, 0.26], [-0.23, 0.26], [-0.07, 0.12], [-0.22, 0.12]]) b.add(b.cyl(0.011, 0.011, 0.02, 6), 'chest', 'trim', [x, yy, 0.29 - (yy - 0.12) * 0.25], [PI / 2 + 0.32, 0, 0]);
  stencil(b, 'chest', 'trim', '07', [0.14, 0.2, 0.292], [0.3, 0.22, 0.04], 0.085, 5);
  // core + belly vents
  b.add(b.tor(0.06, 0.016, 18, 5), 'chest', 'metal', [0, 0.05, 0.27], [0.3, 0, 0]);
  b.add(b.cyl(0.046, 0.046, 0.03, 16), 'chest', 'glow', [0, 0.05, 0.265], [PI / 2 + 0.3, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.2, 0.014, 0.02, 0.005), 'chest', 'metal', [0, -0.03 - i * 0.03, 0.235 - i * 0.008], [0.2, 0, 0]);
  b.sym(b.cyl(0.018, 0.018, 0.02, 10), 'chest', 'glow', [0.24, 0.06, 0.2], [PI / 2 + 0.2, 0.5, 0]);
  if (o.r >= 2) for (const x of [0.06, -0.06]) b.add(b.cbox(0.04, 0.012, 0.02, 0.004), 'chest', 'glow', [x, 0.33, 0.17], [0.6, 0, 0]);
  // abdomen + pelvis skirt
  b.add(b.cyl(0.17, 0.2, 0.2, 10), 'spine', 'metal', [0, 0.06, 0]);
  for (let i = 0; i < 2; i++) b.add(b.tor(0.185 - i * 0.01, 0.014, 18, 4), 'spine', 'accent', [0, 0.02 + i * 0.07, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.3, 0.12, 0.12], [0, 0.07, 0.14], [0.15, 0, 0], { c: 0.03, tx: 1.1 });
  P(b, 'pelvis', 'metal', [0.38, 0.17, 0.3], [0, -0.01, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'paint', [0.22, 0.2, 0.07], [0, -0.09, 0.17], [-0.12, 0, 0], { c: 0.025, bx: 0.6 });
  PS(b, 'pelvis', 'paint', [0.08, 0.26, 0.28], [0.24, -0.09, 0], [0, 0, 0.2], { c: 0.025, bx: 1.12 });
  PS(b, 'pelvis', 'accent', [0.02, 0.14, 0.18], [0.29, -0.09, 0], [0, 0, 0.2]);
  chips(b, 'chest', [[[0.27, 0.27, 0.16], [0, 0, 0.5], [0.04, 0.012, 0.03]], [[-0.3, 0.1, 0.12], [0, 0.3, 0.2], [0.012, 0.05, 0.03]], [[0.05, 0.34, 0.2], [0.3, 0, 0], [0.05, 0.01, 0.012]]]);
  if (o.rank >= 4) {
    // hip ammo boxes
    PS(b, 'pelvis', 'accent', [0.1, 0.13, 0.17], [0.3, -0.14, 0.04], [0, 0, 0.1], { c: 0.02 });
    b.sym(b.box(0.11, 0.02, 0.18), 'pelvis', 'trim', [0.305, -0.08, 0.04], [0, 0, 0.1]);
  }
}

function shoulders(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm;
  // arm frame
  b.sym(b.cyl(0.055, 0.055, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.11);
  b.sym(b.cyl(0.065, 0.055, ua, 10), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.17, ua * 0.5, 0.17], [0.015, -ua * 0.6, 0], [0, 0, 0], { c: 0.025, tx: 1.1, tz: 1.1 });
  b.sym(discX(b, 0.08, 0.16, 12), 'foreArm', 'metal', [0, 0, 0]);
  PS(b, 'foreArm', 'paint', [0.22, fa * 0.8, 0.23], [0.01, -fa * 0.55, 0], [0, 0, 0], { c: 0.035, tx: 0.84, tz: 0.86 });
  PS(b, 'foreArm', 'accent', [0.12, fa * 0.5, 0.04], [0.01, -fa * 0.55, 0.125], [0, 0, 0], { c: 0.012 });
  PS(b, 'foreArm', 'metal', [0.235, 0.03, 0.245], [0.01, -fa * 0.2, 0]);
  if (o.r >= 1) PS(b, 'foreArm', 'glow', [0.018, fa * 0.36, 0.018], [0.12, -fa * 0.55, 0.04], [0, 0, 0]);
  // gauntlets
  b.sym(b.cbox(0.13, 0.12, 0.14, 0.025), 'hand', 'metal', [0, -0.06, 0.01]);
  b.sym(b.cbox(0.135, 0.06, 0.15, 0.02), 'hand', 'accent', [0, -0.13, 0.015]);
  // big layered pauldrons (bulky upper body): dark dome + gunmetal rim plates
  b.sym(b.sph(18, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.04, 0.02, 0], [0, 0, -0.34], [0.19, 0.14, 0.21]);
  PS(b, 'upArm', 'paint', [0.3, 0.07, 0.34], [0.09, -0.08, 0], [0, 0, -0.42], { c: 0.025, tx: 0.95 });
  PS(b, 'upArm', 'paint', [0.26, 0.06, 0.3], [0.11, -0.14, 0], [0, 0, -0.5], { c: 0.02 });
  b.sym(b.box(0.2, 0.016, 0.26), 'upArm', 'trim', [0.1, -0.045, 0.0], [0, 0, -0.42]);
  lamp(b, 'upArm', [0.14, 0.1, 0.15], [1.0, 0, -0.5], 0.02);
  b.sym(b.box(0.03, 0.012, 0.22), 'upArm', 'glow', [0.1, 0.15, -0.02], [0, 0, -0.55]);
  if (o.r >= 1) PS(b, 'upArm', 'accent', [0.2, 0.16, 0.06], [0.1, 0.0, 0.17], [0.4, 0.3, -0.35], { c: 0.02 });
  // stencil on the left pad
  stencil(b, 'upArmL', 'trim', '4', [0.17, 0.11, 0.0], [0, PI / 2 - 0.15, -0.6], 0.07, 0);
  if (o.rank >= 2) {
    // shoulder lamp (left pauldron): housing + big lens
    b.add(b.cbox(0.11, 0.09, 0.12, 0.02), 'upArmL', 'metal', [0.12, 0.17, 0.06], [0, 0, -0.3]);
    b.add(b.cyl(0.042, 0.048, 0.04, 14), 'upArmL', 'trim', [0.12, 0.18, 0.13], [PI / 2, 0, 0]);
    b.add(b.cyl(0.034, 0.034, 0.045, 14), 'upArmL', 'eye', [0.12, 0.18, 0.137], [PI / 2, 0, 0]);
  }
}

function drum(b, o) {
  const far = b.far;
  // back frame + straps
  P(b, 'chest', 'metal', [0.42, 0.34, 0.12], [0, 0.14, -0.24], [0, 0, 0], { c: 0.03 });
  // ammo drum (axis x) on aux0
  b.add(b.cyl(0.25, 0.25, 0.42, 20), 'aux0', 'accent', [0, 0, -0.04], [0, 0, PI / 2]);
  b.add(b.tor(0.252, 0.012, 24, 4), 'aux0', 'glow', [0, 0, -0.04], [0, PI / 2, 0]);
  b.sym(b.tor(0.252, 0.01, 24, 4), 'aux0', 'paint', [0.1, 0, -0.04], [0, PI / 2, 0]);
  b.sym(b.cyl(0.265, 0.265, 0.04, 20), 'aux0', 'paint', [0.2, 0, -0.04], [0, 0, PI / 2]);
  b.sym(b.cyl(0.14, 0.14, 0.02, 12), 'aux0', 'metal', [0.225, 0, -0.04], [0, 0, PI / 2]);
  b.sym(b.cyl(0.04, 0.04, 0.03, 8), 'aux0', 'glow', [0.235, 0, -0.04], [0, 0, PI / 2]);
  if (!far) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; b.add(b.box(0.36, 0.022, 0.022), 'aux0', 'metal', [0, Math.cos(a) * 0.252, -0.04 + Math.sin(a) * 0.252], [a, 0, 0]); }
  lamp(b, 'aux0', [0.12, 0.25, -0.04], [0, 0, 0], 0.02);
  // ammo counter window (cyan)
  b.add(b.box(0.2, 0.03, 0.02), 'aux0', 'glow', [0.0, 0.13, -0.27], [0.5, 0, 0]);
  stencil(b, 'aux0', 'trim', '07', [0.0, -0.06, -0.29], [0, PI, 0], 0.08, 4);
  // feed chute on the right end, curving down
  b.add(b.cbox(0.1, 0.16, 0.14, 0.02), 'aux0', 'metal', [-0.25, -0.15, 0.0]);
  if (o.rank >= 4) {
    // comms masts on the drum frame (silhouette) with cyan tips
    for (const [x, h] of [[0.16, 0.42], [0.22, 0.3]]) {
      b.add(b.cyl(0.008, 0.012, h, 6), 'aux0', 'metal', [x, 0.2 + h / 2, 0.06], [-0.15, 0, -0.1]);
      b.add(b.cyl(0.016, 0.016, 0.03, 8), 'aux0', 'glow', [x + 0.02, 0.2 + h, 0.06 - h * 0.15]);
    }
    b.add(b.cbox(0.12, 0.08, 0.06, 0.015), 'aux0', 'metal', [0.18, 0.2, 0.08]);
  }
  if (o.rank >= 5) {
    // cooling fins on the drum frame, glow edges
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
      b.add(fin(b, [[0, 0], [0.07, 0], [0.18, 0.32 - i * 0.05], [0.13, 0.34 - i * 0.05]], 0.018, 0.004), 'aux0', 'paint', [s * (0.07 + i * 0.06), 0.22, 0.02], [0, s > 0 ? -PI / 2 : PI / 2, s * 0.25]);
      b.add(b.box(0.01, 0.16 - i * 0.03, 0.01), 'aux0', 'glow', [s * (0.07 + i * 0.05), 0.3 - i * 0.02, 0.02], [0, 0, -s * 0.5]);
    }
  }
}

// ammo belt: drum feed -> drooping arc under the right elbow -> gun feed. Split between chest and handR so it
// meets seamlessly in the hold pose (both halves follow their bone in action poses).
function belt(b, o) {
  const a = LIB.fkPoint(HOLD_P, REF_CTX, 'aux0', [-0.22, -0.18, 0.02], new THREE.Vector3());
  const g = HAND_HOLD.clone().add(new THREE.Vector3(-0.1, 0.02, -0.05));
  const m1 = a.clone().lerp(g, 0.35).add(new THREE.Vector3(-0.1, -0.2, 0));
  const m2 = a.clone().lerp(g, 0.7).add(new THREE.Vector3(-0.06, -0.16, 0));
  const curve = new THREE.CatmullRomCurve3([a, m1, m2, g]);
  const pts = curve.getPoints(16);
  const cover = o.rank >= 2;
  const half = (bone, from, to) => {
    const loc = pts.slice(from, to + 1).map((p) => toBone(bone, p.toArray()));
    b.add(b.tube(loc.map((v) => v.toArray()), cover ? 0.045 : 0.034, 12, 6), bone, cover ? 'paint' : 'metal', [0, 0, 0]);
    if (b.far) return;
    // cartridge links along the belt (or armoured cover segments at R2)
    for (let i = 0; i < loc.length - 1; i++) {
      const p = loc[i].clone().lerp(loc[i + 1], 0.5), d = loc[i + 1].clone().sub(loc[i]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      if (cover) b.add(b.cbox(0.1, 0.07, 0.05, 0.012), bone, 'accent', p.toArray(), [e.x, e.y, e.z]);
      else b.add(b.box(0.1, 0.04, 0.03), bone, 'trim', p.toArray(), [e.x, e.y, e.z]);
    }
  };
  half('chest', 0, 9);
  half('handR', 9, 16);
}

function gun(b, o) {
  const far = b.far, rank = o.rank, r = o.r;
  const [, by, bz] = BARREL_C;
  b.scope([0, 0, 0], GUN_FRAME, 1, () => {
    const H = 'handR';
    // rear grip (in the fist) + receiver
    b.add(b.cbox(0.05, 0.15, 0.06, 0.012), H, 'metal', [0, -0.02, 0.0], [0.25, 0, 0]);
    P(b, H, 'paint', [0.19, 0.19, 0.44], [0, by + 0.01, 0.06], [0, 0, 0], { c: 0.04, tx: 0.86, tz: 0.95 });
    P(b, H, 'accent', [0.15, 0.08, 0.3], [0, by + 0.12, 0.04], [0, 0, 0], { c: 0.025, tx: 0.8 });
    b.add(b.cbox(0.2, 0.05, 0.12, 0.012), H, 'metal', [0, by - 0.1, 0.18]);
    // feed port (belt side) + side handle for the left hand
    b.add(b.cbox(0.06, 0.1, 0.12, 0.015), H, 'metal', [-0.11, by - 0.01, -0.03]);
    b.add(b.cyl(0.022, 0.022, 0.14, 8), H, 'metal', [SIDE_GRIP[0] - 0.05, SIDE_GRIP[1], SIDE_GRIP[2]], [0, 0, PI / 2]);
    b.add(b.cbox(0.05, 0.06, 0.05, 0.012), H, 'accent', [SIDE_GRIP[0] + 0.02, SIDE_GRIP[1], SIDE_GRIP[2]]);
    // motor housing + top shroud over the barrels
    b.add(b.cyl(0.1, 0.1, 0.12, 16), H, 'metal', [0, by, bz - 0.04], [PI / 2, 0, 0]);
    b.add(b.cyl(0.108, 0.108, 0.02, 16), H, 'trim', [0, by, bz - 0.1], [PI / 2, 0, 0]);
    b.add(b.cyl(0.095, 0.095, BL * 0.5, 14, true, -PI / 2 - 0.9, 1.8), H, 'accent', [0, by, bz + BL * 0.27], [PI / 2, 0, 0]);
    b.add(b.box(0.02, 0.02, BL * 0.48), H, r >= 1 ? 'glow' : 'trim', [0, by + 0.098, bz + BL * 0.27]);
    // stencil on the receiver (left side, toward the viewer in battle)
    stencil(b, H, 'trim', '12', [0.097, by + 0.02, 0.06], [0, PI / 2, 0], 0.06, 3);
    chips(b, H, [[[0.09, by + 0.1, 0.24], [0, 0, 0.3], [0.03, 0.01, 0.04]], [[-0.09, by - 0.07, 0.1], [0, 0, 0.2], [0.012, 0.03, 0.05]]]);
    if (rank >= 2) {
      // riot-control gun shield (old police kit): plate above + wings beside the barrel, viewing slit
      P(b, H, 'paint', [0.46, 0.22, 0.035], [0, by + 0.2, bz + 0.02], [-0.18, 0, 0], { c: 0.02, tx: 0.82 });
      for (const sx of [1, -1]) P(b, H, 'paint', [0.13, 0.2, 0.03], [sx * 0.17, by + 0.0, bz + 0.0], [0, sx * -0.25, 0], { c: 0.015, bx: 0.8 });
      b.add(b.box(0.2, 0.018, 0.04), H, 'glow', [0, by + 0.23, bz + 0.03], [-0.18, 0, 0]);
      b.add(b.box(0.44, 0.02, 0.045), H, 'trim', [0, by + 0.31, bz]);
      if (!far) for (const sx of [0.17, -0.17]) b.add(b.cyl(0.012, 0.012, 0.05, 6), H, 'metal', [sx, by + 0.17, bz + 0.04], [PI / 2, 0, 0]);
    }
    if (r >= 3) {
      // legendary muzzle brake shroud (static, gold trim)
      b.add(b.cyl(0.1, 0.11, 0.08, 12, true), H, 'trim', [0, by, bz + BL + 0.0], [PI / 2, 0, 0]);
    }
  });
  // spinning barrel cluster on aux1 (origin on the gun axis)
  b.scope([0, 0, 0], GUN_FRAME, 1, () => {
    const A = 'aux1', nb = far ? 4 : 6;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * PI * 2, x = Math.cos(a) * 0.048, y = Math.sin(a) * 0.048;
      b.add(b.cyl(0.02, 0.02, BL, 7), A, 'metal', [x, y, BL / 2], [PI / 2, 0, 0]);
      b.add(b.cyl(0.013, 0.013, 0.02, 7), A, 'glow', [x, y, BL + 0.005], [PI / 2, 0, 0]);
    }
    b.add(b.cyl(0.03, 0.03, BL * 0.95, 8), A, 'metal', [0, 0, BL * 0.48], [PI / 2, 0, 0]);
    for (const [zz, rr] of [[BL * 0.42, 0.078], [BL * 0.93, 0.08]]) {
      b.add(b.cyl(rr, rr, 0.045, 14), A, 'accent', [0, 0, zz], [PI / 2, 0, 0]);
      if (!far) b.add(b.box(0.02, rr * 2.1, 0.03), A, 'metal', [0, 0, zz]);
    }
    b.add(b.tor(0.074, 0.008, 18, 4), A, 'glow', [0, 0, BL * 0.955]);
    if (rank >= 3) for (const zz of [0.62, 0.72, 0.82]) b.add(b.tor(0.072, 0.011, 18, 4), A, 'glow', [0, 0, BL * zz]);
  });
}

function legsAndExtras(b, o) {
  legs(b, o, { w: 1.22, foot: 'wide', thighSlot: 'paint', shellSlot: 'accent', kneeSlot: 'paint', footSlot: 'paint' });
  // knee pads (riot gear) + toe caps
  PS(b, 'shin', 'accent', [0.17, 0.2, 0.09], [0, 0.0, 0.13], [-0.2, 0, 0], { c: 0.03, tx: 0.8 });
  b.sym(b.cyl(0.02, 0.02, 0.02, 10), 'shin', 'glow', [0.0, -0.02, 0.18], [PI / 2 - 0.2, 0, 0]);
  if (o.r >= 2) PS(b, 'thigh', 'accent', [0.07, 0.22, 0.2], [0.16, -0.17, 0], [0, 0, 0.08], { c: 0.02 });
  if (o.rank >= 4) PS(b, 'shin', 'paint', [0.21, 0.24, 0.06], [0, -0.2, 0.16], [0.1, 0, 0], { c: 0.02, tx: 1.1 });
  chips(b, 'shinL', [[[0.06, 0.03, 0.18], [0.2, 0, 0.4], [0.04, 0.012, 0.01]]]);
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  shoulders(b, o);
  drum(b, o);
  belt(b, o);
  gun(b, o);
  legsAndExtras(b, o);
}

// ---------------- anims ----------------
// shot pulses: sum of short recoil kicks at the given u times
const pulses = (u, times, w = 0.035) => times.reduce((s, t0) => s + (u >= t0 ? Math.exp(-(u - t0) / w) : 0), 0);
const ATK = [0.32, 0.39, 0.46, 0.53, 0.6];
const ALT = [0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72];
const OD_FIRE = 0.22, OD_N = 14;
const OD = Array.from({ length: OD_N }, (_, i) => OD_FIRE + i * (0.92 - OD_FIRE) / (OD_N - 1));

const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // every ~6 s: glance down at the gun and give it a little shake (it has never been cleaned)
    const c = t % 6.5, k = L.kf(c, [[0, 0], [4.6, 0], [4.9, 1], [5.8, 1], [6.2, 0]]);
    L.A(P, 'neck', 0.12 * k, -0.25 * k, 0); L.A(P, 'head', 0.25 * k, -0.2 * k, 0.15 * k);
    const shake = Math.sin(t * 28) * L.kf(c, [[5.0, 0], [5.15, 1], [5.5, 1], [5.6, 0]]);
    gunArm(P, ctx, 0, 0.015 * shake, 0.01 * shake);
    L.plant(P, ctx, 0.12, -0.1, 1.05);
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    hunch(P, 1.15);
    const bob = Math.sin(ctx.move.phase * PI * 4) * 0.02;
    gunArm(P, ctx, 0, bob, 0.02);
  },
  attack(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.22, 1], [0.8, 1], [1, 0]]);
    const kick = pulses(u, ATK);
    P[L.PX + 1] -= 0.04 * up; P[L.PX + 2] -= 0.025 * kick;
    L.A(P, 'spine', 0.04 * up - 0.03 * kick, 0.05 * up, 0);
    L.A(P, 'chest', -0.03 * kick, 0.05 * up, 0);
    L.A(P, 'head', -0.04 * kick, -0.05 * up, 0);
    gunArm(P, ctx, 0, 0.04 * up + 0.02 * kick, -0.03 * kick);
    L.plant(P, ctx, 0.2, -0.18, 1.2);
  },
  attack_alt(P, u, ctx, L) {
    // sweeping burst: torso hoses across the lane
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]);
    const sw = L.kf(u, [[0, 0], [0.25, 0.22], [0.75, -0.22], [1, 0]]);
    const kick = pulses(u, ALT, 0.03);
    P[L.PX + 1] -= 0.06 * up; P[L.PX + 2] -= 0.02 * kick;
    L.A(P, 'pelvis', 0, sw * 0.4, 0); L.A(P, 'spine', 0.05 * up, sw * 0.4, 0); L.A(P, 'chest', -0.025 * kick, sw * 0.3, 0);
    L.A(P, 'head', 0, -sw * 0.6, 0);
    gunArm(P, ctx, 0, 0.03 * up + 0.015 * kick, -0.025 * kick, sw * 1.1);
    L.plant(P, ctx, 0.22, -0.2, 1.3);
  },
  cast(P, u, ctx, L) {
    // vent + rack: lifts the gun, barrels blow heat, slaps the drum
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]);
    L.A(P, 'chest', -0.12 * k, -0.15 * k, 0); L.A(P, 'head', -0.15 * k, -0.4 * k, 0);
    gunArm(P, ctx, 0.04 * k, 0.18 * k, -0.06 * k);
    L.plant(P, ctx, 0.14, -0.12, 1.1);
  },
  overdrive(P, u, ctx, L) {
    // plant very wide, drop low, then hose the whole front line far->near (yaw sweep), shaking hard
    stance(P, ctx, ctx.t);
    const low = L.kf(u, [[0, 0], [0.16, 1], [0.94, 1], [1, 0]]);
    const sw = L.kf(u, [[0, 0], [0.18, 0.38], [0.94, -0.38], [1, 0]]);
    const hose = L.kf(u, [[0, 0], [OD_FIRE - 0.01, 0], [OD_FIRE + 0.02, 1], [0.92, 1], [0.95, 0]]);
    const sh = Math.sin(u * 260) * hose;
    P[L.PX + 1] -= 0.17 * low; P[L.PX + 2] -= 0.05 * hose + 0.012 * sh;
    L.A(P, 'pelvis', 0, sw * 0.35, 0);
    L.A(P, 'spine', 0.08 * low + 0.02 * sh, sw * 0.4, 0);
    L.A(P, 'chest', -0.06 * hose, sw * 0.35, 0.015 * sh);
    L.A(P, 'neck', -0.05 * low, 0, 0); L.A(P, 'head', -0.12 * low, -sw * 0.5, 0);
    gunArm(P, ctx, 0, 0.05 * low + 0.012 * sh, -0.04 * hose, sw * 1.1);
    L.plant(P, ctx, 0.36, -0.32, 1.6, 0, 0.25);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.16 * k, 0.1 * k * d, 0.05 * k * d);
    L.A(P, 'chest', -0.18 * k, 0.1 * k * d, 0.05 * k * d);
    L.A(P, 'head', -0.3 * k, -0.2 * k * d, 0.2 * k * d);
    gunArm(P, ctx, 0, 0.08 * k, -0.05 * k);
    L.plant(P, ctx, 0.08, -0.1, 1.1);
  },
  die(P, u, ctx, L) {
    // knees buckle, the gun drags it forward: kneel, then topple face-first over the cannon
    stance(P, ctx, ctx.t);
    const D = ctx.D;
    const kneel = L.kf(u, [[0, 0], [0.1, 0.2], [0.38, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.4, 0.1], [0.5, 0.15], [0.78, 1.25], [0.84, 1.15], [0.9, 1.22], [1, 1.2]]);
    const drop = L.kf(u, [[0, 0], [0.38, -0.36], [0.78, -0.62], [0.84, -0.58], [1, -0.62]]);
    P[L.PX + 1] += drop; P[L.PX + 2] += 0.35 * L.kf(u, [[0.4, 0], [0.8, 1]]);
    L.A(P, 'pelvis', fall, 0.1 * kneel, 0);
    L.A(P, 'spine', 0.15 * kneel, 0, 0); L.A(P, 'chest', 0.1 * kneel, 0, 0.05 * kneel);
    L.A(P, 'head', 0.3 * kneel - 0.4 * L.kf(u, [[0.75, 0], [0.85, 1], [1, 0.7]]), 0.3 * kneel, 0);
    gunArm(P, ctx, 0.06 * kneel, -0.12 * kneel, 0.05 * kneel);
    // legs: fold to the knees, then trail behind the falling body
    const lie = L.kf(u, [[0.42, 0], [0.82, 1]]);
    if (lie < 1) {
      L.plant(P, ctx, 0.2 * kneel + 0.05, -0.3 * kneel - 0.05, 1.15, 0, 0.6 * kneel);
    }
    if (lie > 0) for (const s of ['L', 'R']) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      P[i] = L.lerp(P[i], -0.25 - fall * 0.2, lie); P[i + 2] = L.lerp(P[i + 2], (s === 'L' ? 1 : -1) * 0.12, lie);
      P[j] = L.lerp(P[j], s === 'L' ? 0.5 : 0.9, lie); P[f] = L.lerp(P[f], 0.8, lie);
    }
  },
  victory(P, t, ctx, L) {
    // hoists the cannon skyward, barrels spinning, little bounce
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6)), bounce = Math.max(0, Math.sin(t * 5.5)) * k;
    P[L.PX + 1] += 0.03 * bounce;
    L.A(P, 'spine', -0.12 * k, 0, 0); L.A(P, 'chest', -0.18 * k, 0.12 * k, 0); L.A(P, 'head', -0.25 * k, 0.15 * k, 0.1 * k * Math.sin(t * 2.7));
    gunArm(P, ctx, 0, 0.2 * k + 0.04 * bounce, 0.1 * k);
    L.A(P, 'handR', -0.75 * k, 0, 0);
    L.RS(P, 'upArm', 'L', L.lerp(-0.3, -2.6, k) - 0.15 * bounce, 0, 0.35); L.RS(P, 'foreArm', 'L', -0.5 - 0.3 * bounce, 0, 0); L.RS(P, 'hand', 'L', 0, 0, 0);
    L.plant(P, ctx, 0.14, -0.12, 1.15);
  },
  deploy(P, u, ctx, L) {
    // lands in a deep crouch, gun braced, then racks up and points it forward
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.62, 0.85], [0.85, 0], [1, 0]]);
    P[L.PX + 1] -= 0.26 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0);
    L.A(P, 'head', 0.4 * L.kf(u, [[0, 0.4], [0.6, 0.6], [0.75, -0.25], [0.9, 0], [1, 0]]), 0, 0);
    const rack = L.kf(u, [[0, 0], [0.7, 0], [0.78, 1], [0.9, 0]]);
    gunArm(P, ctx, 0, -0.1 * land + 0.08 * rack, 0.02 * land);
    L.plant(P, ctx, 0.2 * land + 0.1, -0.2 * land - 0.08, 1 + 0.35 * land);
  },
};

// barrel spin (rad/s) wanted per action phase
function spinTarget(name, u) {
  switch (name) {
    case 'attack': return kf(u, [[0, 6], [0.25, 30], [0.65, 30], [1, 8]]);
    case 'attack_alt': return kf(u, [[0, 6], [0.25, 32], [0.75, 32], [1, 8]]);
    case 'overdrive': return kf(u, [[0, 4], [0.18, 48], [0.92, 48], [1, 10]]);
    case 'cast': return kf(u, [[0, 0], [0.3, 14], [1, 0]]);
    case 'victory': return 18;
    case 'deploy': return kf(u, [[0, 0], [0.75, 0], [0.8, 22], [1, 4]]);
    case 'die': return 0;
    default: return 0;
  }
}
const _q1 = new THREE.Quaternion();

export default {
  id: 'gunner', name: 'GUNNER', role: 'archer', faction: 'corporate', rarity: 'common', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.62, radius: 0.58, walkSpeed: 1.05, cadence: 0.82, scheme: 'dark',
  style: { weapon: 'cannon', heavy: 0.7, stance: 1.4, grip: GRIP, gripOut: 0.45, freeHand: ['victory'] },
  // matte black + gunmetal, off-white stencils
  paint: { corporate: { paint: 0x23272f, accent: 0x34709e, trim: 0xc8ced6 } },   // robots touch-up: accent steel-blue = corporate read at battle size
  mats: { all: { paint: { rough: 0.55, coat: 0.15 }, accent: { rough: 0.42, metal: 0.55, panel: { groove: 0.25 } }, metal: { color: 0x737b87, metal: 0.85, rough: 0.38, panel: { groove: 0.12, scale: 9 } } } },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.06, 0.28], head: [0, 0.06, 0.14], hand: ['handR', [0, -0.08, 0]] },
  events: {
    attack: ATK.map((u) => ['fire', u]),
    attack_alt: ALT.map((u) => ['fire', u]),
    cast: [['cast', 0.4]],
    overdrive: [['cast', 0.05], ...OD.map((u) => ['fire', u])],
  },
  durs: { attack: 0.95, attack_alt: 1.25, cast: 1.1, overdrive: 2.8, die: 1.9 },
  anims,
  tick(unit, dt, ctx, bones) {
    const st = unit.state;
    let target = 0;
    if (st.action) target = spinTarget(st.action, ctx.gu ?? 0);
    else if (st.loop === 'victory') target = 18;
    ctx.spinV = (ctx.spinV || 0) + (target - (ctx.spinV || 0)) * (1 - Math.exp(-dt * (target > (ctx.spinV || 0) ? 7 : 1.6)));
    ctx.spinA = ((ctx.spinA || 0) + ctx.spinV * dt) % (PI * 2);
    bones[BI.aux1].quaternion.copy(_q1.setFromAxisAngle(BARREL_AXIS, ctx.spinA));
  },
  // the current action's u for tick(): post() sees `act`
  post(P, ctx, act) { ctx.gu = act ? Math.min(1, act.t / act.dur) : 0; },
  fxHints: { projectile: 'gatling', muzzleColor: 0x8af0ff, impact: 'spark', overdrive: 'tracer_hose', color: 0x1fd2ff },
  build,
};
