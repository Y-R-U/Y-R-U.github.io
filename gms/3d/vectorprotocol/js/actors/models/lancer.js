// LANCER, corporate precision rail (EXEMPLAR: copy its structure). Brief: docs/ROSTER.md `lancer`; look: refs/ref_battle_02.png.
// Slim, long-legged (digitigrade look), swept-back blade fins on shoulders + head, rail rifle longer than its body,
// shouldered in a permanent aim (arrow-shaped silhouette). Gloss white + light grey, cyan coils.
// Rank tiers: R1 base · R2 fins lengthen + scope · R3 barrel coils glow · R4 hardlight fins (+ glowing edges).
// Technique shown here: an IK-built aim pose, the rifle authored in plain root space for that pose (poseFrame),
// the off hand locked to the foregrip (style.grip), and a re-parented aux bone (aux1 -> handR) for fins that unfold.
import { P, PS, plate, fin, discX, shell, legs, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.38, shin: 0.44, ankle: 0.1, hipX: 0.11, hipY: -0.04, spine: 0.11, chest: 0.2, neck: 0.23, headOff: 0.04,
  clavX: 0.05, clavY: 0.19, shoulder: 0.17, upArm: 0.27, foreArm: 0.26, aux0: [0, 0.15, -0.13],
  parents: { aux1: 'handR' }, aux1: [0, -0.02, 0.0],
};
const RIFLE_LEN = 1.6;          // rail rifle longer than the body
const HAND_T = [-0.09, 1.27, 0.3]; // right hand (grip) target in root space when aiming
const FOREGRIP = [0, 0.03, 0.42]; // foregrip relative to the grip, root-aligned aim frame

// Upper-body aim (k 0..1 = low ready .. shouldered). Writes torso + right arm; the left arm comes from style.grip.
function aim(P, ctx, k = 1) {
  const { R, A, lerp, armIK } = LIB;
  A(P, 'pelvis', 0, -0.32 * k, 0);
  A(P, 'spine', 0.02 * k, -0.12 * k, 0);
  A(P, 'chest', -0.02 * k, -0.08 * k, 0);
  R(P, 'neck', 0.02, 0.22 * k, 0);
  R(P, 'head', 0.06 * k, 0.28 * k, 0.1 * k);
  R(P, 'clavR', 0, -0.06 * k, 0.04 * k);
  armIK(P, ctx, 'R', _t.set(lerp(-0.16, HAND_T[0], k), lerp(1.05, HAND_T[1], k), lerp(0.22, HAND_T[2], k)), 0.35);
  R(P, 'handR', 0, 0, 0);
}
const _t = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
// armIK wants a Vector3-like with .x/.y/.z: kit vectors also work.

// Precompute the aim pose once (same math the runtime uses) -> rifle frame on handR + grip point for the off hand.
const RIG = makeRig(DIMS);
const AIM_P = new Float32Array(LIB.NCH);
{
  const ctx = { D: RIG.D, rig: RIG };
  LIB.R(AIM_P, 'pelvis', 0.03, 0, 0); LIB.R(AIM_P, 'spine', 0.05, 0, 0); LIB.R(AIM_P, 'chest', 0.02, 0, 0);
  aim(AIM_P, ctx, 1);
}
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const RIFLE_FRAME = poseFrame(RIG, poseOf(AIM_P), 'handR');
function rot(e, p) { // rotate p by Euler XYZ e (same as PartBuilder.scope)
  const [x, y, z] = e, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  let [a, b, c] = p;
  // XYZ intrinsic = Rx * Ry * Rz applied to the vector: Rz first
  [a, b] = [a * cz - b * sz, a * sz + b * cz];
  [a, c] = [a * cy + c * sy, -a * sy + c * cy];
  [b, c] = [b * cx - c * sx, b * sx + c * cx];
  return [a, b, c];
}
const GRIP = rot(RIFLE_FRAME, FOREGRIP);
const MUZZLE = rot(RIFLE_FRAME, [0, 0.06, 0.36 + RIFLE_LEN * 0.68]);

function rifle(b, o) {
  const far = b.far, rank = o.rank, L = RIFLE_LEN;
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    const H = 'handR';
    // receiver + stock (stock runs back to the shoulder)
    P(b, H, 'paint', [0.075, 0.13, 0.5], [0, 0.05, 0.12], [0, 0, 0], { c: 0.025, tx: 0.85 });
    P(b, H, 'accent', [0.06, 0.1, 0.3], [0, 0.03, -0.24], [0.06, 0, 0], { c: 0.02, tx: 0.7, bx: 1.1 });
    b.add(b.cbox(0.05, 0.13, 0.06, 0.012), H, 'metal', [0, -0.06, -0.02], [0.35, 0, 0]);
    b.add(b.cbox(0.05, 0.05, 0.14, 0.012), H, 'metal', [0, 0.07, -0.38]);
    // long split rail barrel
    for (const s of [1, -1]) b.add(b.cbox(0.022, 0.05, L * 0.62, 0.006), H, 'paint', [s * 0.026, 0.06, 0.36 + L * 0.31]);
    b.add(b.cyl(0.016, 0.016, L * 0.66, 8), H, 'metal', [0, 0.06, 0.36 + L * 0.33], [PI / 2, 0, 0]);
    b.add(b.cbox(0.08, 0.08, 0.08, 0.02), H, 'accent', [0, 0.06, 0.36 + L * 0.63]);
    b.add(b.cyl(0.02, 0.02, 0.02, 10), H, 'glow', [0, 0.06, 0.36 + L * 0.67], [PI / 2, 0, 0]);
    // glowing rail between the split barrel (the signature light line), clamp bands, heat vents
    b.add(b.cbox(0.012, 0.03, L * 0.6, 0.004), H, 'glow', [0, 0.06, 0.38 + L * 0.31]);
    for (let i = 0; i < 3; i++) b.add(b.cbox(0.085, 0.075, 0.035, 0.01), H, 'accent', [0, 0.06, 0.5 + i * L * 0.16]);
    if (rank >= 3) for (const s of [1, -1]) b.add(b.cbox(0.006, 0.006, L * 0.5, 0.002), H, 'glow', [s * 0.04, 0.09, 0.42 + L * 0.27]);
    // cyan strip on top of the receiver, side vents, accent panel
    b.add(b.cbox(0.014, 0.012, 0.36, 0.004), H, 'glow', [0, 0.125, 0.14]);
    for (const s of [1, -1]) {
      b.add(b.cbox(0.01, 0.07, 0.24, 0.003), H, 'accent', [s * 0.04, 0.05, 0.16]);
      if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.012, 0.012, 0.03, 0.003), H, 'metal', [s * 0.046, 0.03, 0.08 + i * 0.05]);
    }
    b.add(b.cbox(0.05, 0.03, 0.12, 0.008), H, 'metal', [0, -0.04, 0.24]);
    // foregrip
    b.add(b.cbox(0.04, 0.09, 0.05, 0.01), H, 'metal', [0, -0.02, FOREGRIP[2]]);
    // scope (R2)
    if (rank >= 2) {
      b.add(b.cyl(0.026, 0.026, 0.24, 10), H, 'metal', [0, 0.16, 0.08], [PI / 2, 0, 0]);
      b.add(b.cyl(0.022, 0.022, 0.01, 10), H, 'eye', [0, 0.16, 0.205], [PI / 2, 0, 0]);
    } else b.add(b.cbox(0.03, 0.04, 0.1, 0.01), H, 'metal', [0, 0.14, 0.1]);
  });
  // fold-out side fins on aux1 (re-parented to handR); post() unfolds them during overdrive
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    // side fins lie flat along the barrel (x-scale on aux1 unfolds them)
    b.sym(b.ext([[0, 0], [0.09, 0.05], [0.09, 0.38], [0, 0.45]], 0.014, 0.004), 'aux1', 'paint', [0.035, 0.06, 0.3], [PI / 2, 0, 0]);
    b.sym(b.cbox(0.02, 0.008, 0.36, 0.003), 'aux1', 'glow', [0.12, 0.06, 0.52]);
  });
}

function helm(b, o) {
  // elongated beak helm, cyan visor slit, swept-back blade fins
  b.add(plate(b, 0.15, 0.15, 0.24, { c: 0.03, tx: 0.72, tz: 0.8 }), 'head', 'paint', [0, 0.07, 0.02]);
  b.add(b.ext([[-0.06, 0], [0.06, 0], [0.04, 0.06], [0, 0.075], [-0.04, 0.06]], 0.2, 0.012), 'head', 'accent', [0, 0.0, 0.05]);
  P(b, 'head', 'paint', [0.09, 0.07, 0.17], [0, 0.04, 0.17], [-0.18, 0, 0], { c: 0.02, tx: 0.45, tz: 0.35, sz: 0.04 });
  b.add(b.cbox(0.13, 0.025, 0.04, 0.008), 'head', 'eye', [0, 0.085, 0.14], [0.12, 0, 0]);
  b.sym(discX(b, 0.032, 0.03, 16), 'head', 'metal', [0.077, 0.06, 0]);
  b.sym(b.cyl(0.004, 0.006, 0.12, 6), 'head', 'metal', [0.08, 0.09, -0.03], [-0.6, 0, -0.3]);
  b.add(b.cbox(0.1, 0.03, 0.05, 0.01), 'head', 'metal', [0, -0.01, 0.13]);
  if (!b.far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.08, 0.006, 0.02, 0.002), 'head', 'accent', [0, -0.005 + i * 0.01, 0.156]);
  const fl = o.rank >= 2 ? 1.25 : 1;
  b.sym(fin(b, [[0, 0], [0.05, 0], [-0.2 * fl, 0.13 * fl], [-0.23 * fl, 0.11 * fl]], 0.018, 0.005), 'head', 'paint', [0.05, 0.12, -0.02], [0.2, PI / 2 - 0.25, 0]);
  if (o.rank >= 4) b.sym(b.cbox(0.006, 0.006, 0.2 * fl, 0.002), 'head', 'glow', [0.06, 0.18, -0.1], [0.55, -0.25, 0]);
}

function torso(b, o) {
  P(b, 'chest', 'metal', [0.28, 0.32, 0.22], [0, 0.09, -0.01], [0, 0, 0], { c: 0.03 });
  // V chest: wide shoulders, narrow waist
  P(b, 'chest', 'paint', [0.42, 0.3, 0.27], [0, 0.14, 0.02], [0.08, 0, 0], { c: 0.045, tx: 1.15, bx: 0.58, tz: 1.05, bz: 0.8 });
  PS(b, 'chest', 'accent', [0.14, 0.17, 0.05], [0.075, 0.16, 0.15], [0.3, 0.3, 0.1], { c: 0.02, bx: 0.6 });
  b.add(b.cyl(0.035, 0.035, 0.03, 14), 'chest', 'glow', [0, 0.09, 0.14], [PI / 2 + 0.3, 0, 0]);
  b.add(b.tor(0.045, 0.01, 16, 5), 'chest', 'trim', [0, 0.09, 0.145], [0.3, 0, 0]);
  P(b, 'chest', 'paint', [0.3, 0.22, 0.1], [0, 0.14, -0.15], [0, 0, 0], { c: 0.03 });
  // back thruster + spine fins
  P(b, 'aux0', 'accent', [0.2, 0.2, 0.08], [0, 0, 0], [0, 0, 0], { c: 0.02 });
  for (const x of [0.06, -0.06]) {
    b.add(b.cyl(0.035, 0.045, 0.12, 10), 'aux0', 'metal', [x, -0.02, -0.07], [PI / 2 - 0.4, 0, 0]);
    b.add(b.cyl(0.028, 0.028, 0.02, 10), 'aux0', 'glow', [x, -0.04, -0.13], [PI / 2 - 0.4, 0, 0]);
  }
  b.add(b.cyl(0.1, 0.12, 0.15, 12), 'spine', 'metal', [0, 0.05, 0]);
  if (!b.far) for (let i = 0; i < 3; i++) b.add(b.tor(0.11 + i * 0.006, 0.008, 16, 4), 'spine', 'trim', [0, 0.0 + i * 0.045, 0], [PI / 2, 0, 0]);
  PS(b, 'chest', 'metal', [0.1, 0.12, 0.05], [0.13, 0.06, 0.12], [0.2, 0.3, 0.1], { c: 0.01 });
  if (!b.far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.08, 0.012, 0.02, 0.003), 'chest', 'accent', [0.13, 0.03 + i * 0.03, 0.15], [0.2, 0.3, 0.1]);
  P(b, 'spine', 'accent', [0.18, 0.1, 0.09], [0, 0.06, 0.09], [0.1, 0, 0], { c: 0.02 });
  P(b, 'pelvis', 'metal', [0.24, 0.12, 0.18], [0, -0.01, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'paint', [0.12, 0.15, 0.05], [0, -0.07, 0.1], [-0.1, 0, 0], { c: 0.015, bx: 0.55 });
  PS(b, 'pelvis', 'paint', [0.05, 0.2, 0.17], [0.14, -0.07, 0], [0, 0, 0.16], { c: 0.015 });
}

function armsAndBlades(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm;
  b.sym(b.cyl(0.04, 0.04, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.07);
  b.sym(b.cyl(0.04, 0.036, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.11, ua * 0.55, 0.12], [0.01, -ua * 0.58, 0], [0, 0, 0], { c: 0.02, tx: 1.1 });
  b.sym(discX(b, 0.05, 0.1, 12), 'foreArm', 'metal', [0, 0, 0]);
  PS(b, 'foreArm', 'paint', [0.13, fa * 0.78, 0.14], [0.005, -fa * 0.55, 0], [0, 0, 0], { c: 0.025, tx: 0.85, tz: 0.85 });
  PS(b, 'foreArm', 'accent', [0.06, fa * 0.5, 0.03], [0.005, -fa * 0.55, 0.075], [0, 0, 0], { c: 0.01 });
  // hands: compact gauntlets
  b.sym(b.cbox(0.07, 0.1, 0.09, 0.018), 'hand', 'metal', [0, -0.05, 0.005]);
  b.sym(b.cbox(0.075, 0.05, 0.095, 0.015), 'hand', 'accent', [0, -0.11, 0.005]);
  // shoulder pad + the swept blade (signature): long plate sweeping back and up
  PS(b, 'upArm', 'paint', [0.17, 0.12, 0.2], [0.03, 0.02, 0], [0, 0, -0.35], { c: 0.03, tx: 0.7, tz: 0.85 });
  const bl = o.rank >= 2 ? 1.18 : 1;
  b.sym(fin(b, [[0, 0.04], [0.08, 0.05], [0.5 * bl, -0.14 * bl], [0.42 * bl, -0.19 * bl], [0, -0.04]], 0.026, 0.008), 'upArm', 'paint', [0.07, 0.07, -0.03], [0.15, 0.95, -0.35]);
  b.sym(fin(b, [[0, 0.02], [0.06, 0.02], [0.36 * bl, -0.13 * bl], [0.3 * bl, -0.15 * bl]], 0.02, 0.006), 'upArm', 'accent', [0.06, 0.02, -0.05], [0.35, 0.95, -0.55]);
  if (o.rank >= 4) b.sym(b.cbox(0.006, 0.006, 0.38 * bl, 0.002), 'upArm', 'glow', [0.16, 0.08, -0.17], [0.3, -0.35, 0]);
  // cyan lamp on each pad (bezelled), layered pad plates, wrist guards, elbow pistons
  b.sym(b.cyl(0.03, 0.03, 0.018, 16), 'upArm', 'metal', [0.1, 0.06, 0.09], [1.1, 0, -0.4]);
  b.sym(b.cyl(0.022, 0.022, 0.026, 16), 'upArm', 'glow', [0.1, 0.06, 0.09], [1.1, 0, -0.4]);
  PS(b, 'upArm', 'accent', [0.15, 0.05, 0.18], [0.05, -0.05, 0], [0, 0, -0.42], { c: 0.015 });
  PS(b, 'upArm', 'paint', [0.13, 0.05, 0.16], [0.06, -0.09, 0], [0, 0, -0.5], { c: 0.015 });
  PS(b, 'foreArm', 'metal', [0.15, 0.04, 0.16], [0.005, -fa * 0.85, 0], [0, 0, 0], { c: 0.01 });
  PS(b, 'foreArm', 'paint', [0.03, fa * 0.4, 0.1], [0.07, -fa * 0.5, 0], [0, 0, -0.08], { c: 0.008 });
  b.sym(b.cyl(0.014, 0.014, ua * 0.6, 10), 'upArm', 'metal', [0, -ua * 0.5, -0.06]);
  b.sym(b.cyl(0.009, 0.009, fa * 0.4, 10), 'foreArm', 'metal', [0, -0.08, -0.065]);
  if (!b.far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.02, 0.05, 0.018, 0.004), 'hand', 'metal', [-0.005, -0.15, -0.025 + i * 0.025], [0, 0, -0.2]);
}

function backWings(b, o) {
  const k = o.rank >= 2 ? 1.2 : 1;
  // R4: second pair of hardlight wings; R5: halo
  if (o.rank >= 4) b.sym(fin(b, [[0, 0], [0.04, 0.0], [0.5, 0.12], [0.46, 0.16]], 0.012, 0.003), 'aux0', 'glow', [0.05, 0.0, -0.03], [-0.1, 0.55, -0.3]);
  if (o.rank >= 5) { b.add(b.tor(0.2, 0.012, 32, 5), 'aux0', 'glow', [0, 0.32, -0.04], [-0.3, 0, 0]); b.add(b.tor(0.24, 0.005, 32, 3), 'aux0', 'trim', [0, 0.32, -0.04], [-0.3, 0, 0]); }
  b.sym(fin(b, [[0, 0], [0.07, 0.02], [0.42 * k, 0.32 * k], [0.37 * k, 0.35 * k], [0.02, 0.1]], 0.022, 0.006), 'aux0', 'paint', [0.05, 0.02, -0.03], [-0.25, 0.45, 0]);
  if (o.r >= 1) b.sym(fin(b, [[0, 0], [0.04, 0.0], [0.38 * k, 0.3 * k], [0.36 * k, 0.32 * k]], 0.01, 0.003), 'aux0', 'glow', [0.055, 0.015, -0.012], [-0.25, 0.45, 0]);
}

function build(b, o) {
  helm(b, o);
  torso(b, o);
  armsAndBlades(b, o);
  backWings(b, o);
  legs(b, o, { w: 0.82, knee: 'spike', shin: 'slim', foot: 'point', thighSlot: 'paint', shellSlot: 'metal', shinPlateSlot: 'paint', kneeSlot: 'accent', footSlot: 'paint' });
  // digitigrade look: heel spur + long raked shin blade
  b.sym(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.16]], 0.04, 0.008), 'foot', 'metal', [0, -0.03, -0.05], [-2.3, 0, 0]);
  b.sym(plate(b, 0.07, 0.3, 0.05, { c: 0.012, tx: 0.6 }), 'shin', 'paint', [0, -0.22, -0.08], [-0.25, 0, 0]);
  b.sym(b.cyl(0.018, 0.018, 0.26, 8), 'thigh', 'metal', [0, -0.2, -0.08]);
  b.sym(b.cyl(0.012, 0.012, 0.16, 8), 'shin', 'metal', [0, -0.1, -0.09]);
  PS(b, 'thigh', 'accent', [0.05, 0.16, 0.13], [0.085, -0.2, 0.0], [0, 0, 0.06], { c: 0.012 });
  b.sym(b.cyl(0.018, 0.018, 0.02, 10), 'thigh', 'glow', [0.11, -0.12, 0.04], [0, 0, PI / 2]);
  rifle(b, o);
}

// ---- anims: aim-centric overrides on top of the stock biped set
const anims = {
  idle(P, t, ctx, L) { L.idle(P, ctx, t); aim(P, ctx, 0.92 + 0.03 * Math.sin(t * 1.3)); L.plant(P, ctx, 0.2, -0.16, 1.35); },
  advance(P, t, ctx, L) { L.gait(P, ctx); aim(P, ctx, 0.75); },
  victory(P, t, ctx, L) { L.victoryB(P, ctx, t); },
  attack(P, u, ctx, L) {
    L.idle(P, ctx, ctx.t); aim(P, ctx, 1);
    const kick = L.kf(u, [[0, 0], [0.29, 0], [0.33, 1], [0.6, 0], [1, 0]]);
    // rail recoil: shoulder punched back, torso rocks, head snaps
    L.A(P, 'chest', -0.2 * kick, 0.12 * kick, 0); L.A(P, 'spine', -0.1 * kick, 0.06 * kick, 0); P[L.PX + 2] -= 0.1 * kick;
    L.A(P, 'clavR', 0, -0.25 * kick, 0); L.A(P, 'head', -0.15 * kick, 0, 0);
    L.plant(P, ctx, 0.2, -0.16, 1.35);
  },
  attack_alt(P, u, ctx, L) {
    // charged rail: settles lower, trembles while charging, big kick
    L.idle(P, ctx, ctx.t); aim(P, ctx, 1);
    const low = L.kf(u, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]);
    const shake = Math.sin(u * 80) * L.kf(u, [[0, 0], [0.2, 0], [0.62, 1], [0.68, 0]]);
    const kick = L.kf(u, [[0, 0], [0.67, 0], [0.71, 1], [0.95, 0]]);
    P[L.PX + 1] -= 0.1 * low; P[L.PX + 2] -= 0.09 * kick;
    L.A(P, 'chest', 0.01 * shake - 0.14 * kick, 0.01 * shake, 0);
    L.A(P, 'upArmR', 0.28 * kick, 0, 0);
    L.plant(P, ctx, 0.26, -0.2, 1.45);
  },
  overdrive(P, u, ctx, L) {
    // kneel, fins unfold, charge, beam (fire ~0.62), recover
    L.idle(P, ctx, ctx.t); aim(P, ctx, 1);
    const kneel = L.kf(u, [[0, 0], [0.18, 1], [0.86, 1], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.61, 0], [0.64, 1], [0.8, 0.3], [1, 0]]);
    const shake = Math.sin(u * 90) * L.kf(u, [[0, 0], [0.3, 0], [0.6, 1], [0.62, 0]]);
    P[L.PX + 1] -= 0.36 * kneel; P[L.PX + 2] -= 0.04 + 0.12 * kick;
    L.A(P, 'spine', 0.12 * kneel - 0.1 * kick, 0, 0); L.A(P, 'chest', 0.01 * shake - 0.12 * kick, 0, 0);
    L.A(P, 'upArmR', 0.3 * kick, 0, 0);
    // left foot forward flat, right knee drops (foot target far behind -> IK folds the knee to the floor)
    L.plant(P, ctx, 0.36 * kneel + 0.2 * (1 - kneel), -0.16 - 0.4 * kneel, 1.3, 0, 0.9 * kneel);
  },
};

export default {
  id: 'lancer', name: 'LANCER', role: 'archer', faction: 'corporate', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.72, radius: 0.5, walkSpeed: 1.35, cadence: 0.95, scheme: 'light',
  style: { weapon: 'rifle', heavy: 0, stance: 1.35, grip: GRIP, gripOut: 0.5, freeHand: ['cast', 'victory'] },
  paint: { corporate: { paint: 0xe9eef5, accent: 0x2f6fe0, trim: 0x8a97ab } },
  mats: { all: { paint: { rough: 0.22, coat: 1 } } },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.09, 0.16], head: [0, 0.1, 0.1] },
  events: { attack: [['fire', 0.32]], attack_alt: [['cast', 0.2], ['fire', 0.69]], overdrive: [['cast', 0.3], ['fire', 0.62]] },
  durs: { attack: 0.9, attack_alt: 1.4, overdrive: 2.4 },
  anims,
  // aux1 fins (on the rifle) fold out sideways during overdrive
  tick(unit, dt, ctx, bones) {
    const act = unit.state.action;
    const target = act === 'overdrive' ? 1 : 0;
    ctx.finK = (ctx.finK || 0) + (target - (ctx.finK || 0)) * (1 - Math.exp(-dt * 8));
    bones[BI.aux1].scale.set(0.35 + 1.65 * ctx.finK, 1, 1);
  },
  fxHints: { projectile: 'rail', muzzleColor: 0x8af0ff, overdrive: 'pierce_beam', color: 0x1fd2ff },
  build,
};
