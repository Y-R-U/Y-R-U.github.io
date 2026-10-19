// RIOT, rogue line breaker (sculptor-3). Brief: docs/ROSTER.md `riot`; look: refs/ref_battle_02.png enemy front-near (red shield tank).
// Stole a riot shield from the cops and kept their shotgun: tall armoured biped hunkered behind a white-trimmed slab shield,
// pump shotgun held at the chest with its barrel run through a notch in the shield's inner edge. Huge red pauldrons,
// riot helmet with an orange visor slit and a face cage, shell bandolier, battery pack on the back.
//
// VALUE: `accent` = dark gunmetal base armour, `paint` = gang red on the big read-shapes (pauldrons, helmet, chest, thighs,
// shin fronts), `trim` = off-white (shield face, police stripes, markers), `metal` = bare joints/gun, `glow`/`eye` = orange.
// Rank ladder (o.rank): R0 battered (mismatched right pauldron, bolted patch on a cracked shield corner) · R1 base ·
//   R2 spikes on the shield rim + studded pauldron crests · R3 shield heat-glow edges + hot notch, glowing belly vents ·
//   R4 twin shotgun barrels + exhaust stacks on the pack · R5 stolen police lightbar crown (spinning beacons) + burning skull eyes.
// Rarity (o.r): rare+ second pauldron layer · epic+ thigh plates + knee spikes · legendary horned helm crest.
// Technique: the whole hold pose is precomputed (stance()); shield authored in root space on foreArmL and the shotgun on
// handR (poseFrame), so the barrel sits in the notch exactly. The pump slide lives on aux1 (re-parented to handR) and racks
// in tick(); the R5 beacon reflector is aux2 (re-parented to aux0) spinning in tick().
import { THREE, P, PS, plate, fin, discX, legs, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.4, shin: 0.4, ankle: 0.13, hipX: 0.2, hipY: -0.06, spine: 0.14, chest: 0.28, neck: 0.25, headOff: 0.03,
  clavX: 0.11, clavY: 0.24, shoulder: 0.32, upArm: 0.36, foreArm: 0.35, aux0: [0, 0.2, -0.3],
  parents: { aux1: 'handR', aux2: 'aux0' }, aux1: [0, 0, 0], aux2: [0, 0.4, -0.02],
};
const HAND_T = [-0.25, 1.12, 0.3];          // right hand (shotgun grip) in root space at the hold
const SHIELD_C = [0.15, 0.96, 0.57];        // shield centre, root space, hold pose
const SH_W = 0.82, SH_H = 1.36, SH_T = 0.085;
const NOTCH_Y = 0.17;                       // notch height above the shield centre (barrel passes here)
const SHL = { up: [-0.3, 0, 0.14], fore: [-1.42, -0.55, 0] }; // shield-arm hold (left)
const LEAN = { spine: 0.07, chest: 0.05, neck: -0.04, head: -0.05 };
const PUMP0 = [0, -0.005, 0.5];             // pump fore-end, gun frame
const BARREL_Y = 0.045, BARREL_Z0 = 0.26, BARREL_L = 0.6;
const SH_YAW = 0.22;

const _t = new THREE.Vector3();
let HOLD_P = null;
function shieldArm(P, raise = 0, push = 0, yaw = 0) {
  LIB.R(P, 'upArmL', SHL.up[0] - raise - push, SHL.up[1] + yaw, SHL.up[2]);
  LIB.R(P, 'foreArmL', SHL.fore[0] + raise * 0.55 + push * 0.6, SHL.fore[1], SHL.fore[2]);
  LIB.R(P, 'handL', 0, 0, 0);
}
// right hand to the hold point, following the pelvis offset (relative to the reference pose) and a torso yaw
function gunArm(P, ctx, dx = 0, dy = 0, dz = 0, yaw = 0) {
  const H = HOLD_P || P, X = LIB.PX;
  const x = HAND_T[0] + dx, z = HAND_T[2] + dz, c = Math.cos(yaw), s = Math.sin(yaw);
  LIB.armIK(P, ctx, 'R', _t.set(x * c + z * s + P[X] - H[X], HAND_T[1] + dy + P[X + 1] - H[X + 1], -x * s + z * c + P[X + 2] - H[X + 2]), 0.35);
  LIB.R(P, 'handR', 0, 0, 0);
}
function lean(P, k = 1) {
  LIB.A(P, 'spine', LEAN.spine * k, 0, 0); LIB.A(P, 'chest', LEAN.chest * k, 0, 0);
  LIB.A(P, 'neck', LEAN.neck * k, 0, 0); LIB.A(P, 'head', LEAN.head * k, 0, 0);
}
function stance(P, ctx, t) {
  LIB.idle(P, ctx, t);
  lean(P);
  P[LIB.PX + 1] -= 0.04;
  shieldArm(P);
  gunArm(P, ctx);
  LIB.plant(P, ctx, 0.16, -0.14, 1.2);
}

// ---- precompute the hold -> shield frame (foreArmL) + gun frame (handR)
const RIG = makeRig(DIMS);
const REF_CTX = { D: RIG.D, rig: RIG, t: 0, style: { weapon: 'shield', heavy: 1, stance: 1.2 }, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI };
{ const h = new Float32Array(LIB.NCH); stance(h, REF_CTX, 0); HOLD_P = h; }
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const HOLD = poseOf(HOLD_P);
const SHIELD_FRAME = poseFrame(RIG, HOLD, 'foreArmL');
const GUN_FRAME = poseFrame(RIG, HOLD, 'handR');
const ELBOW = LIB.fkPoint(HOLD_P, REF_CTX, 'foreArmL', [0, 0, 0], new THREE.Vector3());
const HAND = LIB.fkPoint(HOLD_P, REF_CTX, 'handR', [0, 0, 0], new THREE.Vector3());
const _eu = new THREE.Euler(GUN_FRAME[0], GUN_FRAME[1], GUN_FRAME[2], 'XYZ');
const rot = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyEuler(_eu);
const GUN_AXIS = rot([0, 0, 1]).normalize();
DIMS.aux1 = rot(PUMP0).toArray();
const AUX1 = DIMS.aux1.slice();
const MUZZLE = rot([0, BARREL_Y, BARREL_Z0 + BARREL_L + 0.02]).toArray();
// shield offset from the elbow (root-aligned) and the notch x in shield space (where the barrel crosses the shield plane)
const SH_OFF = [SHIELD_C[0] - ELBOW.x, SHIELD_C[1] - ELBOW.y, SHIELD_C[2] - ELBOW.z];
const BARREL_X_AT_SHIELD = (HAND.x - SHIELD_C[0]) / Math.cos(SH_YAW);
const NOTCH_DY = HAND.y + BARREL_Y - SHIELD_C[1];

// ---------- greebles ----------
function lamp(b, bone, pos, rot3, r = 0.03, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.4, r * 1.4, 0.022, 14), bone, 'metal', pos, rot3);
  put(b.cyl(r, r, 0.032, 14), bone, slot, pos, rot3);
}
function vent(b, bone, pos, rot3, w, h, n = 4, mirror = false, slot = 'metal') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'accent', pos, rot3);
  if (b.far) return;
  b.scope(pos, rot3, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.2), 0.04, 0.003), bone, slot, [0, -h / 2 + (i + 0.5) * h / n, 0.012]); });
}
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.028) {
  const cyl = (p, q, rr) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
    const g = b.cyl(rr, rr, L, 10);
    g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
    g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    return g;
  };
  b.sym(cyl(a0, a1, r), boneA, 'metal');
  b.sym(cyl(b0, b1, r * 0.55), boneB, 'metal');
  b.sym(b.cyl(r * 1.3, r * 1.3, 0.03, 10), boneA, 'accent', a1);
}
function rivets(b, bone, slot, pts, rx = PI / 2, r = 0.012) {
  if (b.far) return;
  for (const p of pts) b.add(b.cyl(r, r, 0.014, 6), bone, slot, p, [rx, 0, 0]);
}
// one-sided parts: `put` mirrors positions/rotations onto the right side
function side(b, s, fn) {
  const put = (g, bone, slot, p = [0, 0, 0], r = [0, 0, 0], sc) => s === 'L'
    ? b.add(g, bone + 'L', slot, p, r, sc) : b.add(g, bone + 'R', slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], sc);
  fn(put);
}
const oct = (w, h, c) => [[-w / 2, -h / 2 + c], [-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c]];

// ---------- parts ----------
function head(b, o) {
  const y = 0.0, z = 0.07;
  // riot helmet: red dome, dark visor band with the orange slit, face cage, neck guard
  b.add(b.sph(22, 12, 0, PI * 2, 0, PI * 0.55), 'head', 'paint', [0, y + 0.1, z], [0, 0, 0], [0.17, 0.17, 0.19]);
  b.add(b.cyl(0.158, 0.165, 0.07, 20), 'head', 'accent', [0, y + 0.08, z], [0, 0, 0], [1, 1, 1.1]);
  b.add(b.cbox(0.27, 0.07, 0.1, 0.02), 'head', 'accent', [0, y + 0.075, z + 0.13]);
  b.add(b.cbox(0.22, 0.032, 0.03, 0.01), 'head', 'eye', [0, y + 0.08, z + 0.183]);
  // white police stripe over the crown (reads from the battle camera) + red brow peak
  b.add(b.cbox(0.05, 0.02, 0.32, 0.006), 'head', 'trim', [0, y + 0.262, z - 0.01]);
  P(b, 'head', 'paint', [0.28, 0.035, 0.08], [0, y + 0.13, z + 0.16], [0.35, 0, 0], { c: 0.012, tx: 0.85 });
  // face cage: frame + vertical bars
  b.add(b.cbox(0.2, 0.012, 0.02, 0.004), 'head', 'metal', [0, y - 0.035, z + 0.18]);
  if (!b.far) for (let i = 0; i < 5; i++) b.add(b.cyl(0.007, 0.007, 0.1, 5), 'head', 'metal', [-0.08 + i * 0.04, y + 0.01, z + 0.18]);
  b.add(b.cbox(0.17, 0.08, 0.07, 0.02), 'head', 'metal', [0, y - 0.0, z + 0.12]);
  P(b, 'head', 'accent', [0.2, 0.06, 0.1], [0, y - 0.06, z + 0.11], [-0.3, 0, 0], { c: 0.015, bx: 0.75 });
  // ear pods + neck guard
  b.sym(discX(b, 0.055, 0.05, 14), 'head', 'metal', [0.16, y + 0.06, z - 0.01]);
  b.sym(b.cyl(0.022, 0.022, 0.02, 10), 'head', 'glow', [0.187, y + 0.06, z - 0.01], [0, 0, PI / 2]);
  P(b, 'head', 'accent', [0.3, 0.08, 0.12], [0, y + 0.02, z - 0.15], [-0.4, 0, 0], { c: 0.02 });
  if (!b.far) b.add(b.cyl(0.006, 0.009, 0.22, 5), 'head', 'metal', [-0.12, y + 0.26, z - 0.09], [-0.35, 0, 0.25]);
  if (o.r >= 3) {
    // legendary: swept horns off the helmet
    b.sym(fin(b, [[0, 0], [0.06, 0], [0.2, 0.2], [0.17, 0.22], [0.0, 0.07]], 0.03, 0.008), 'head', 'trim', [0.12, y + 0.16, z - 0.02], [0, -0.5, 0.15]);
  }
}

// rogue gang skull stencil (red on the white shield face), frame +z out
function skull(b, bone, slot, pos, rot3, k = 1, eyes = 'accent') {
  b.scope(pos, rot3, k, () => {
    const cr = []; for (let i = 0; i <= 16; i++) { const a = PI * (i / 16); cr.push([Math.cos(a) * 0.15, 0.03 + Math.sin(a) * 0.15]); }
    cr.push([-0.15, -0.04], [-0.1, -0.08], [-0.1, -0.14], [0.1, -0.14], [0.1, -0.08], [0.15, -0.04]);
    b.add(b.ext(cr.reverse(), 0.012, 0.003), bone, slot, [0, 0, 0]);
    for (const s of [1, -1]) b.add(b.cyl(0.042, 0.035, 0.012, 10), bone, eyes, [s * 0.06, 0.0, 0.006], [PI / 2, 0, 0]);
    b.add(b.ext([[-0.02, -0.055], [0.02, -0.055], [0, -0.02]], 0.012, 0.002), bone, 'accent', [0, 0, 0.006]);
    for (let i = 0; i < 4; i++) b.add(b.box(0.012, 0.045, 0.014), bone, 'accent', [-0.045 + i * 0.03, -0.11, 0.006]);
    // crossed shotgun shells under the skull
    for (const s of [1, -1]) b.add(b.box(0.34, 0.035, 0.012), bone, slot, [0, -0.2, -0.001], [0, 0, s * 0.45]);
  });
}

function shield(b, o) {
  const far = b.far, rk = o.rank, W = SH_W, H = SH_H, T = SH_T;
  const bone = 'foreArmL';
  const nx = BARREL_X_AT_SHIELD, ny = NOTCH_DY, nw = rk >= 4 ? 0.13 : 0.09, nh = 0.09;
  // notched outline: the bite on the inner (-x) edge is where the barrel rests
  const L = -W / 2, R = W / 2, c = 0.08, nIn = Math.min(R - 0.1, nx + nw / 2) - L;
  const outline = [[L, -H / 2 + c], [L + c, -H / 2], [R - c, -H / 2], [R, -H / 2 + c], [R, H / 2 - c], [R - c, H / 2], [L + c, H / 2], [L, H / 2 - c],
    [L, ny + nh / 2], [L + nIn, ny + nh / 2], [L + nIn, ny - nh / 2], [L, ny - nh / 2]];
  b.scope([0, 0, 0], SHIELD_FRAME, 1, () => b.scope(SH_OFF, [-0.14, SH_YAW, 0], 1, () => {
    // body: dark core slab, off-white face, red frame
    b.add(b.ext(outline.slice().reverse(), T, 0.012), bone, 'accent', [0, 0, 0]);
    const fL = L + 0.06, fR = R - 0.07, fc = 0.05, fT = H / 2 - 0.07, fB = -H / 2 + 0.09, fn = L + nIn + 0.025;
    const face = [[fL, fB + fc], [fL + fc, fB], [fR - fc, fB], [fR, fB + fc], [fR, fT - fc], [fR - fc, fT], [fL + fc, fT], [fL, fT - fc],
      [fL, ny + nh / 2 + 0.03], [fn, ny + nh / 2 + 0.03], [fn, ny - nh / 2 - 0.03], [fL, ny - nh / 2 - 0.03]];
    b.add(b.ext(face.slice().reverse(), 0.02, 0.005), bone, 'trim', [0, 0, T / 2 + 0.006]);
    // red frame bars (outer + top/bottom), the inner edge stays dark around the notch
    b.add(b.cbox(0.06, H - 0.06, 0.03, 0.01), bone, 'paint', [R - 0.03, 0, T / 2 + 0.01]);
    b.add(b.cbox(W - 0.16, 0.06, 0.03, 0.01), bone, 'paint', [0.03, H / 2 - 0.03, T / 2 + 0.01]);
    b.add(b.cbox(W - 0.16, 0.08, 0.03, 0.01), bone, 'paint', [0.03, -H / 2 + 0.04, T / 2 + 0.01]);
    b.add(b.cbox(0.05, H * 0.36, 0.03, 0.01), bone, 'paint', [L + 0.025, -H * 0.27, T / 2 + 0.01]);
    // viewport slot near the top + gang skull + hazard band at the foot
    b.add(b.cbox(W * 0.5, 0.05, 0.02, 0.008), bone, 'accent', [0.1, H * 0.36, T / 2 + 0.018]);
    b.add(b.cbox(W * 0.46, 0.014, 0.02, 0.004), bone, rk >= 3 ? 'glow' : 'metal', [0.1, H * 0.36, T / 2 + 0.026]);
    skull(b, bone, 'paint', [0.06, -0.06, T / 2 + 0.022], [0, 0, 0], 1.1, rk >= 5 ? 'glow' : 'accent');
    // the old POLICE band, letters half scraped off and slashed through with gang red
    b.add(b.cbox(W * 0.64, 0.1, 0.012, 0.004), bone, 'accent', [0.06, H * 0.23, T / 2 + 0.018]);
    if (!far) for (let i = 0; i < 6; i++) if (i !== 2) b.add(b.box(0.045, i === 4 ? 0.035 : 0.06, 0.008), bone, 'trim', [-0.13 + i * 0.075, H * 0.23 + (i === 4 ? -0.012 : 0), T / 2 + 0.026]);
    b.add(b.box(W * 0.7, 0.03, 0.01), bone, 'paint', [0.06, H * 0.23, T / 2 + 0.031], [0, 0, 0.16]);
    // panel seams + a bash dent row of rivets across the middle
    b.add(b.box(W * 0.62, 0.008, 0.008), bone, 'metal', [0.06, -H * 0.31, T / 2 + 0.02]);
    if (!far) for (let i = 0; i < 7; i++) b.add(b.box(0.045, 0.06, 0.012), bone, 'accent', [-0.24 + i * 0.09, -H / 2 + 0.13, T / 2 + 0.02], [0, 0, 0.6]);
    // rivet rows down both sides
    if (!far) for (const x of [L + 0.07, R - 0.075]) for (let i = 0; i < 6; i++) b.add(b.cyl(0.012, 0.012, 0.016, 6), bone, 'metal', [x, -H * 0.42 + i * H * 0.16, T / 2 + 0.03], [PI / 2, 0, 0]);
    // notch lining (metal), barrel saddle
    b.add(b.cbox(nIn + 0.02, 0.022, T * 1.25, 0.006), bone, 'metal', [L + nIn / 2, ny - nh / 2 - 0.011, 0]);
    b.add(b.cbox(nIn + 0.02, 0.022, T * 1.25, 0.006), bone, 'metal', [L + nIn / 2, ny + nh / 2 + 0.011, 0]);
    // edge rims (top/bottom metal caps)
    b.add(b.cbox(W - 0.12, 0.035, T * 1.35, 0.01), bone, 'metal', [0, H / 2 - 0.015, 0]);
    b.add(b.cbox(W - 0.12, 0.045, T * 1.35, 0.01), bone, 'metal', [0, -H / 2 + 0.02, 0]);
    // rear: grip frame + arm straps + struts
    b.add(b.cbox(0.34, 0.5, 0.05, 0.015), bone, 'metal', [0.08, 0.1, -T / 2 - 0.025]);
    if (!far) for (const yy of [0.25, -0.05]) b.add(b.cyl(0.02, 0.02, 0.3, 8), bone, 'metal', [0.08, yy, -T / 2 - 0.07], [0, 0, PI / 2]);
    // R0: cracked corner patched with a bolted dark plate
    if (rk === 0) {
      b.add(b.ext([[R - 0.3, H / 2 - 0.02], [R - 0.02, H / 2 - 0.02], [R - 0.02, H / 2 - 0.34]], 0.03, 0.006), bone, 'accent', [0, 0, T / 2 + 0.03]);
      rivets(b, bone, 'trim', [[R - 0.08, H / 2 - 0.08, T / 2 + 0.045], [R - 0.2, H / 2 - 0.06, T / 2 + 0.045], [R - 0.06, H / 2 - 0.22, T / 2 + 0.045]]);
    }
    // R2: steel spikes along the top + outer rim
    if (rk >= 2) {
      const sp = (p, r, s = 1) => b.add(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.13 * s]], 0.035, 0.006), bone, 'metal', p, r);
      for (let i = 0; i < 5; i++) sp([-0.26 + i * 0.13, H / 2 + 0.0, 0], [0, 0, 0], i % 2 ? 1.1 : 1.6);
      for (let i = 0; i < 5; i++) sp([R + 0.0, H * 0.38 - i * 0.19, 0], [0, 0, -PI / 2], i % 2 ? 1.0 : 1.4);
      for (let i = 0; i < 3; i++) sp([-0.15 + i * 0.15, -H / 2, 0], [0, 0, PI], 0.6);
    }
    // R3: heat-glow edges + a hot notch
    if (rk >= 3) {
      b.add(b.cbox(0.03, H - 0.16, 0.03, 0.006), bone, 'glow', [R + 0.004, 0, 0]);
      b.add(b.cbox(W - 0.18, 0.03, 0.03, 0.006), bone, 'glow', [0.02, H / 2 + 0.004, T / 2]);
      b.add(b.cbox(W - 0.18, 0.03, 0.03, 0.006), bone, 'glow', [0.02, -H / 2 - 0.004, T / 2]);
      b.add(b.cbox(0.02, H * 0.36, 0.03, 0.006), bone, 'glow', [L - 0.002, -H * 0.27, 0]);
      b.add(b.cbox(nIn, 0.012, T * 1.3, 0.003), bone, 'glow', [L + nIn / 2, ny - nh / 2 - 0.0, 0]);
    }
  }));
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  P(b, 'chest', 'metal', [0.56, 0.46, 0.44], [0, 0.13, -0.03], [0, 0, 0], { c: 0.05 });
  // dark armoured barrel chest, red breastplate + layered pecs, white police chevron
  P(b, 'chest', 'accent', [0.78, 0.46, 0.5], [0, 0.18, 0.04], [0.08, 0, 0], { c: 0.08, tx: 1.12, bx: 0.74, tz: 1.0, bz: 0.82 });
  P(b, 'chest', 'paint', [0.5, 0.3, 0.08], [0, 0.22, 0.29], [0.28, 0, 0], { c: 0.03, tx: 1.15, bx: 0.7 });
  PS(b, 'chest', 'paint', [0.24, 0.22, 0.08], [0.2, 0.2, 0.27], [0.28, 0.36, 0.06], { c: 0.03, tx: 1.1, bx: 0.78 });
  PS(b, 'chest', 'trim', [0.16, 0.03, 0.03], [0.14, 0.33, 0.33], [0.28, 0.3, -0.3]);
  // gorget collar the helmet sinks into
  P(b, 'chest', 'paint', [0.46, 0.12, 0.3], [0, 0.36, 0.02], [-0.15, 0, 0], { c: 0.04, tx: 0.86, tz: 0.85 });
  P(b, 'chest', 'accent', [0.5, 0.06, 0.32], [0, 0.3, 0.03], [-0.15, 0, 0], { c: 0.02 });
  // shell bandolier: strap over the left shoulder to the right hip, red shells with steel caps
  b.scope([0, 0.17, 0.335], [0.26, 0, 0.62], 1, () => {
    b.add(b.cbox(0.62, 0.06, 0.02, 0.006), 'chest', 'accent', [0, 0, 0]);
    if (!far) for (let i = 0; i < 9; i++) {
      b.add(b.cyl(0.014, 0.014, 0.05, 8), 'chest', 'paint', [-0.26 + i * 0.065, 0.0, 0.016]);
      b.add(b.cyl(0.015, 0.015, 0.014, 8), 'chest', 'metal', [-0.26 + i * 0.065, -0.03, 0.016]);
    }
  });
  // belly: armoured ribs + orange heat slot
  b.add(b.cyl(0.21, 0.25, 0.2, 14), 'spine', 'metal', [0, 0.06, 0]);
  for (let i = 0; i < 3; i++) b.add(b.cbox(0.34 - i * 0.03, 0.04, 0.08, 0.01), 'spine', 'accent', [0, 0.14 - i * 0.055, 0.21 - i * 0.01], [0.1, 0, 0]);
  b.add(b.cbox(0.16, 0.022, 0.02, 0.006), 'chest', rk >= 3 ? 'glow' : 'accent', [0, 0.02, 0.29], [0.25, 0, 0]);
  b.add(b.cbox(0.2, 0.02, 0.02, 0.006), 'spine', 'glow', [0, 0.115, 0.255], [0.1, 0, 0]);
  if (rk >= 3) vent(b, 'spine', [0, 0.02, 0.24], [0.1, 0, 0], 0.18, 0.06, 3, false, 'glow');
  // the back: rising hump plates + battery pack with vents and cables
  P(b, 'chest', 'accent', [0.66, 0.24, 0.36], [0, 0.34, -0.14], [-0.35, 0, 0], { c: 0.06, tx: 0.84, tz: 0.85 });
  P(b, 'chest', 'paint', [0.22, 0.06, 0.32], [0, 0.46, -0.17], [-0.35, 0, 0], { c: 0.02, tx: 0.7 });
  P(b, 'aux0', 'accent', [0.5, 0.42, 0.22], [0, 0, 0], [0, 0, 0], { c: 0.05 });
  P(b, 'aux0', 'paint', [0.34, 0.08, 0.2], [0, 0.2, 0.0], [0, 0, 0], { c: 0.02 });
  b.add(b.box(0.05, 0.014, 0.22), 'aux0', 'trim', [0.1, 0.248, 0.0]);
  vent(b, 'aux0', [0.13, -0.03, -0.115], [0, 0, 0], 0.13, 0.22, 4, true);
  for (const x of [0.2, -0.2]) b.add(b.cyl(0.05, 0.05, 0.3, 12), 'aux0', 'metal', [x, -0.02, -0.06]);
  lamp(b, 'aux0', [0.2, 0.15, -0.06], [0, 0, 0], 0.025, 'glow', true);
  if (!far) b.sym(b.tube([[0.18, 0.12, 0.08], [0.3, 0.05, 0.05], [0.33, -0.12, 0.12]], 0.02, 10, 6), 'aux0', 'metal');
  if (rk >= 4) {
    // exhaust stacks rising from the pack
    for (const x of [0.15, -0.15]) {
      b.add(b.cyl(0.05, 0.06, 0.34, 12), 'aux0', 'metal', [x, 0.32, -0.08], [-0.25, 0, 0]);
      b.add(b.cyl(0.064, 0.064, 0.05, 12), 'aux0', 'accent', [x, 0.48, -0.12], [-0.25, 0, 0]);
      b.add(b.cyl(0.04, 0.04, 0.02, 10), 'aux0', 'glow', [x, 0.505, -0.128], [-0.25, 0, 0]);
      if (!far) for (const t of [0.22, 0.34]) b.add(b.cyl(0.062, 0.062, 0.02, 12), 'aux0', 'trim', [x, t, -0.08 + (t - 0.32) * 0.25], [-0.25, 0, 0]);
    }
  }
  if (rk >= 5) {
    // stolen police lightbar across the pack top, spinning beacons under clear domes (aux2 spins in tick)
    b.add(b.cbox(0.72, 0.06, 0.14, 0.02), 'aux0', 'metal', [0, 0.3, -0.02]);
    for (const x of [0.3, -0.3]) b.add(b.cyl(0.02, 0.02, 0.14, 6), 'aux0', 'metal', [x, 0.22, -0.02]);
    for (const x of [0.24, -0.24]) b.add(b.cbox(0.2, 0.09, 0.12, 0.025), 'aux0', x > 0 ? 'glow' : 'eye', [x, 0.37, -0.02]);
    b.add(b.cyl(0.05, 0.06, 0.08, 12), 'aux0', 'accent', [0, 0.36, -0.02]);
    b.add(b.cbox(0.11, 0.06, 0.012, 0.003), 'aux2', 'glow', [0, 0.0, 0]);
    b.add(b.cyl(0.015, 0.015, 0.08, 6), 'aux2', 'eye', [0, 0.0, 0]);
  }
  // pelvis: dark skirt, red codpiece, tassets with white edge
  P(b, 'pelvis', 'metal', [0.44, 0.2, 0.34], [0, -0.02, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'paint', [0.26, 0.22, 0.08], [0, -0.1, 0.19], [-0.12, 0, 0], { c: 0.03, bx: 0.6 });
  PS(b, 'pelvis', 'accent', [0.1, 0.3, 0.32], [0.29, -0.1, 0], [0, 0, 0.22], { c: 0.03, bx: 1.15 });
  PS(b, 'pelvis', 'paint', [0.02, 0.2, 0.24], [0.345, -0.1, 0], [0, 0, 0.22]);
  PS(b, 'pelvis', 'accent', [0.18, 0.2, 0.08], [0.13, -0.12, -0.17], [0.15, 0, 0.1], { c: 0.02 });
}

function pauldrons(b, o) {
  const rk = o.rank, far = b.far;
  for (const s of ['L', 'R']) side(b, s, (put) => {
    const junk = s === 'R' && rk === 0;
    // big rounded red shell over a dark rim, white stripe across the top
    put(plate(b, 0.46, 0.26, 0.5, { c: 0.07, tx: 0.74, tz: 0.8 }), 'upArm', junk ? 'accent' : 'paint', [0.07, 0.05, 0], [0, 0, -0.28]);
    if (!junk) put(plate(b, 0.3, 0.07, 0.4, { c: 0.025, tx: 0.85, tz: 0.9 }), 'upArm', 'paint', [0.04, 0.2, 0], [0, 0, -0.2]);
    put(plate(b, 0.44, 0.08, 0.48, { c: 0.03, tx: 0.95 }), 'upArm', 'accent', [0.1, -0.09, 0], [0, 0, -0.36]);
    if (!junk) put(b.box(0.25, 0.014, 0.06), 'upArm', 'trim', [0.045, 0.238, 0.0], [0, 0, -0.2]);
    if (o.r >= 1 && !junk) put(plate(b, 0.09, 0.3, 0.46, { c: 0.025, tz: 0.85 }), 'upArm', 'paint', [0.28, -0.07, 0], [0, 0, -0.5]);
    if (junk) rivets(b, 'upArmR', 'trim', [[-0.06, 0.2, 0.12], [-0.06, 0.2, -0.12], [-0.2, 0.15, 0.0]], 0);
    put(b.cbox(0.4, 0.03, 0.42, 0.008), 'upArm', 'metal', [0.13, -0.135, 0], [0, 0, -0.38]);
    put(b.cbox(0.05, 0.022, 0.4, 0.006), 'upArm', 'trim', [0.3, -0.06, 0], [0, 0, -0.9]);
    // front lamps + side marker
    put(b.cyl(0.042, 0.042, 0.022, 14), 'upArm', 'metal', [0.12, 0.05, 0.235], [PI / 2, 0, 0]);
    put(b.cyl(0.03, 0.03, 0.032, 14), 'upArm', 'glow', [0.12, 0.05, 0.24], [PI / 2, 0, 0]);
    put(b.cbox(0.05, 0.08, 0.02, 0.006), 'upArm', 'trim', [0.25, 0.0, 0.18], [0, 0.6, -0.28]);
    if (!far) for (const z of [-0.15, 0, 0.15]) put(b.cyl(0.012, 0.012, 0.02, 6), 'upArm', 'metal', [0.27, -0.02, z], [0, 0, PI / 2 - 0.28]);
    // R2: studded crest of short steel spikes
    if (rk >= 2) for (let i = 0; i < 3; i++) put(fin(b, [[-0.035, 0], [0.035, 0], [0, i === 1 ? 0.2 : 0.14]], 0.04, 0.008), 'upArm', 'metal', [0.12 + i * 0.03, 0.2 - i * 0.01, -0.13 + i * 0.13], [0, 0, -0.45]);
    if (rk >= 4) put(b.cbox(0.3, 0.012, 0.012, 0.003), 'upArm', 'glow', [0.13, -0.155, 0.2], [0, 0, -0.38]);
  });
}

function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  b.sym(b.cyl(0.06, 0.06, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(16, 12), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.115);
  b.sym(b.cyl(0.075, 0.065, ua, 12), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.19, ua * 0.5, 0.19], [0.02, -ua * 0.62, 0], [0, 0, 0], { c: 0.03, tx: 1.1, tz: 1.1 });
  PS(b, 'upArm', 'paint', [0.04, ua * 0.36, 0.14], [0.115, -ua * 0.62, 0], [0, 0, 0], { c: 0.012 });
  piston(b, 'upArm', [0, -0.08, -0.11], [0, -ua + 0.05, -0.12], 'foreArm', [0, 0.02, -0.12], [0, -0.14, -0.13], 0.026);
  b.sym(discX(b, 0.095, 0.2, 16), 'foreArm', 'metal', [0, 0, 0]);
  // forearms: dark armoured blocks with a red outer plate + white cuff
  PS(b, 'foreArm', 'accent', [0.24, fa * 0.78, 0.26], [0.01, -fa * 0.56, 0], [0, 0, 0], { c: 0.04, tx: 0.86, tz: 0.88 });
  PS(b, 'foreArm', 'paint', [0.04, fa * 0.6, 0.2], [0.13, -fa * 0.56, 0], [0, 0, -0.04], { c: 0.014, tz: 0.85 });
  PS(b, 'foreArm', 'trim', [0.26, 0.03, 0.28], [0.01, -fa * 0.22, 0]);
  vent(b, 'foreArm', [0.0, -fa * 0.55, -0.135], [0, PI, 0], 0.13, 0.12, 3, true);
  b.sym(b.cyl(0.02, 0.02, 0.02, 10), 'foreArm', 'glow', [0.148, -fa * 0.42, 0.06], [0, 0, PI / 2]);
  // left: shield grip fist; right hand lives in the gun frame
  b.add(b.cbox(0.13, 0.13, 0.14, 0.03), 'handL', 'metal', [0, -0.06, 0]);
  b.add(b.cbox(0.14, 0.06, 0.15, 0.02), 'handL', 'accent', [0, -0.12, 0.0]);
}

function shotgun(b, o) {
  const far = b.far, rk = o.rank, twin = rk >= 4;
  b.scope([0, 0, 0], GUN_FRAME, 1, () => {
    const H = 'handR';
    // gloved fist around the pistol grip
    b.add(b.cbox(0.11, 0.12, 0.13, 0.03), H, 'metal', [0, -0.02, 0.05]);
    b.add(b.cbox(0.12, 0.05, 0.12, 0.02), H, 'accent', [0.0, 0.03, 0.05]);
    b.add(b.cbox(0.045, 0.12, 0.06, 0.012), H, 'metal', [0, -0.07, 0.03], [0.3, 0, 0]);
    // receiver + folding stock under the forearm
    P(b, H, 'metal', [0.085, 0.11, 0.34], [0, 0.04, 0.12], [0, 0, 0], { c: 0.02, tx: 0.9 });
    P(b, H, 'paint', [0.09, 0.05, 0.22], [0, 0.085, 0.12], [0, 0, 0], { c: 0.012 });
    b.add(b.box(0.092, 0.012, 0.16), H, 'trim', [0, 0.064, 0.17]);
    b.add(b.cbox(0.05, 0.05, 0.3, 0.012), H, 'metal', [0, 0.02, -0.18]);
    b.add(b.cbox(0.06, 0.1, 0.05, 0.012), H, 'accent', [0, 0.0, -0.34]);
    b.add(b.cbox(0.03, 0.04, 0.06, 0.008), H, 'metal', [0, -0.04, 0.02]);
    // shell-feed tube + ejection port + side saddle with 4 spare shells
    b.add(b.cbox(0.01, 0.035, 0.08, 0.003), H, 'accent', [-0.045, 0.06, 0.14]);
    if (!far) for (let i = 0; i < 4; i++) {
      b.add(b.cyl(0.013, 0.013, 0.045, 8), H, 'paint', [0.05, 0.03, 0.04 + i * 0.032], [0, 0, 0]);
      b.add(b.cyl(0.014, 0.014, 0.012, 8), H, 'metal', [0.05, 0.0, 0.04 + i * 0.032]);
    }
    // barrel(s) with a ventilated heat shield + magazine tube
    const xs = twin ? [0.028, -0.028] : [0];
    for (const x of xs) {
      b.add(b.cyl(0.024, 0.024, BARREL_L, 12), H, 'metal', [x, BARREL_Y, BARREL_Z0 + BARREL_L / 2], [PI / 2, 0, 0]);
      b.add(b.cyl(0.03, 0.03, 0.06, 12), H, 'accent', [x, BARREL_Y, BARREL_Z0 + BARREL_L - 0.02], [PI / 2, 0, 0]);
      b.add(b.cyl(0.016, 0.016, 0.02, 10), H, 'glow', [x, BARREL_Y, BARREL_Z0 + BARREL_L + 0.005], [PI / 2, 0, 0]);
    }
    b.add(b.cbox(twin ? 0.1 : 0.06, 0.02, BARREL_L * 0.5, 0.006), H, 'accent', [0, BARREL_Y + 0.034, BARREL_Z0 + BARREL_L * 0.45]);
    if (!far) for (let i = 0; i < 5; i++) b.add(b.box(twin ? 0.1 : 0.062, 0.006, 0.02), H, 'metal', [0, BARREL_Y + 0.046, BARREL_Z0 + 0.12 + i * 0.07]);
    b.add(b.cyl(0.02, 0.02, BARREL_L * 0.7, 10), H, 'metal', [0, BARREL_Y - 0.048, BARREL_Z0 + BARREL_L * 0.35], [PI / 2, 0, 0]);
    b.add(b.cbox(twin ? 0.11 : 0.07, 0.03, 0.04, 0.008), H, 'trim', [0, BARREL_Y - 0.02, BARREL_Z0 + BARREL_L * 0.72]);
    if (rk >= 3) b.add(b.cbox(0.012, 0.01, BARREL_L * 0.4, 0.003), H, 'glow', [0, BARREL_Y + 0.05, BARREL_Z0 + BARREL_L * 0.45]);
    if (twin) b.add(b.cbox(0.11, 0.06, 0.05, 0.012), H, 'accent', [0, BARREL_Y, BARREL_Z0 + 0.04]);
  });
  // pump fore-end on aux1 (slides along the gun axis in tick)
  b.scope([0, 0, 0], GUN_FRAME, 1, () => {
    b.add(b.cbox(0.075, 0.06, 0.16, 0.018), 'aux1', 'accent', [0, 0, 0]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.box(0.08, 0.008, 0.012), 'aux1', 'metal', [0, -0.03, -0.055 + i * 0.036]);
    b.add(b.cbox(0.077, 0.012, 0.12, 0.004), 'aux1', 'paint', [0, 0.026, 0]);
  });
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  pauldrons(b, o);
  arms(b, o);
  shield(b, o);
  shotgun(b, o);
  legs(b, o, { w: 1.45, foot: 'claw', knee: o.r >= 2 ? 'spike' : 'cap', thighSlot: 'paint', shellSlot: 'accent', shinPlateSlot: 'paint', kneeSlot: 'accent', footSlot: 'accent' });
  piston(b, 'thigh', [0, -0.1, -0.12], [0, -0.33, -0.13], 'shin', [0, 0.0, -0.14], [0, -0.16, -0.14], 0.025);
  vent(b, 'shin', [0.0, -0.2, -0.16], [0, PI, 0], 0.12, 0.13, 3, true);
  lamp(b, 'shin', [0.07, -0.11, 0.2], [PI / 2 - 0.15, 0, 0], 0.02);
  PS(b, 'shin', 'trim', [0.14, 0.025, 0.02], [0, -0.3, 0.19], [0.12, 0, 0]);
  if (o.r >= 2) PS(b, 'thigh', 'accent', [0.06, 0.24, 0.22], [0.17, -0.18, 0], [0, 0, 0.08], { c: 0.02 });
}

// ---------------- anims ----------------
const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // peeks over the shield now and then; every ~7 s racks the pump (tick) with a small shrug
    const c = t % 7.3, peek = L.kf(c, [[0, 0], [2.2, 0], [2.6, 1], [3.6, 1], [4.0, 0]]);
    L.A(P, 'neck', -0.1 * peek, 0.15 * peek, 0); L.A(P, 'head', -0.12 * peek, 0.2 * peek, 0);
    const rack = L.kf(c, [[0, 0], [5.6, 0], [5.8, 1], [6.2, 0]]);
    L.A(P, 'chest', 0.04 * rack, -0.06 * rack, 0);
    gunArm(P, ctx, 0.02 * rack, 0.05 * rack, -0.04 * rack);
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    lean(P, 1.3);
    shieldArm(P, 0, 0.05);
    gunArm(P, ctx, 0, 0, 0);
  },
  attack(P, u, ctx, L) {
    // Slug Shot: brace, fire through the notch (0.3), recoil, rack (tick)
    stance(P, ctx, ctx.t);
    const brace = L.kf(u, [[0, 0], [0.22, 1], [0.7, 1], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.28, 0], [0.31, 1], [0.5, 0.25], [0.8, 0]]);
    P[L.PX + 1] -= 0.05 * brace; P[L.PX + 2] -= 0.05 * kick;
    L.A(P, 'spine', 0.04 * brace - 0.08 * kick, 0, 0); L.A(P, 'chest', -0.08 * kick, 0.05 * kick, 0);
    L.A(P, 'head', 0.05 * brace - 0.12 * kick, 0, 0);
    shieldArm(P, -0.04 * kick, 0.06 * brace);
    gunArm(P, ctx, 0, 0.04 * kick, -0.12 * kick);
    L.plant(P, ctx, 0.2, -0.18, 1.25);
  },
  attack_alt(P, u, ctx, L) {
    // shield shove then a point-blank blast through the gap (fire 0.33)
    stance(P, ctx, ctx.t);
    const shove = L.kf(u, [[0, 0], [0.1, -0.25], [0.22, 1], [0.5, 0.7], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.31, 0], [0.34, 1], [0.55, 0.2], [0.85, 0]]);
    P[L.PX + 2] += 0.12 * shove - 0.06 * kick; P[L.PX + 1] -= 0.04 * Math.abs(shove);
    L.A(P, 'spine', 0.1 * shove - 0.08 * kick, 0.1 * shove, 0); L.A(P, 'chest', 0.06 * shove - 0.1 * kick, 0.08 * shove, 0);
    shieldArm(P, 0.0, 0.45 * Math.max(0, shove), -0.15 * Math.max(0, shove));
    gunArm(P, ctx, 0, 0.04 * kick, 0.08 * shove - 0.14 * kick);
    L.plant(P, ctx, 0.2 + 0.14 * Math.max(0, shove), -0.2, 1.25);
  },
  cast(P, u, ctx, L) {
    // Riot Line: bangs the shotgun on the shield rim twice (taunt), shoulders hunch, head forward
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.12, 1], [0.85, 1], [1, 0]]);
    const bang = Math.max(0, Math.sin((u - 0.12) * PI * 6)) * L.kf(u, [[0, 0], [0.15, 1], [0.7, 1], [0.8, 0]]);
    L.A(P, 'chest', 0.06 * up, 0, 0); L.A(P, 'neck', 0.12 * up, 0, 0); L.A(P, 'head', 0.1 * up, 0, 0);
    shieldArm(P, 0.15 * up);
    gunArm(P, ctx, 0.12 * up, 0.26 * up - 0.12 * bang, 0.05 * up);
    L.plant(P, ctx, 0.2, -0.16, 1.3);
  },
  overdrive(P, u, ctx, L) {
    // Breach & Hold: hoist the shield, slam its edge into the floor (impact 0.26 = the FX hook's 0.6 s windup), crouch, blast through the gap (fire 0.335), hold
    stance(P, ctx, ctx.t);
    const lift = L.kf(u, [[0, 0], [0.15, 1], [0.21, 1], [0.26, 0], [1, 0]]);
    const brace = L.kf(u, [[0, 0], [0.23, 0], [0.26, 1], [0.84, 1], [1, 0]]);
    const hop = L.kf(u, [[0, 0], [0.13, 0], [0.2, 1], [0.26, 0], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.32, 0], [0.345, 1], [0.48, 0.35], [0.62, 0]]);
    P[L.PX + 1] += 0.14 * hop - 0.04 * lift - 0.3 * brace; P[L.PX + 2] += 0.06 * lift + 0.14 * brace - 0.08 * kick;
    L.A(P, 'spine', -0.18 * lift + 0.22 * brace - 0.1 * kick, 0, 0); L.A(P, 'chest', -0.1 * lift + 0.08 * brace - 0.08 * kick, 0, 0);
    L.A(P, 'head', -0.18 * lift + 0.05 * brace, 0, 0);
    shieldArm(P, 1.4 * lift - 0.2 * brace, 0.3 * brace);
    gunArm(P, ctx, 0.06 * lift, 0.32 * lift - 0.04 * brace + 0.05 * kick, -0.1 * lift - 0.18 * kick);
    L.plant(P, ctx, 0.16 + 0.2 * brace, -0.14 - 0.26 * brace, 1.2 + 0.35 * brace, 0, 0.5 * brace);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.08 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.14 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.12 * k, 0.1 * k * d, 0);
    L.A(P, 'head', -0.25 * k, -0.2 * k * d, 0.15 * k * d);
    shieldArm(P, 0.12 * k, -0.1 * k);
    gunArm(P, ctx, 0, 0.03 * k, -0.06 * k);
    L.plant(P, ctx, 0.12, -0.12, 1.2);
  },
  die(P, u, ctx, L) {
    // staggers back, shield arm sags, drops to its knees, then topples forward onto the shield
    stance(P, ctx, ctx.t);
    const sag = L.kf(u, [[0, 0], [0.2, 1], [1, 1]]);
    const kneel = L.kf(u, [[0, 0], [0.15, 0.1], [0.42, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.5, 0.15], [0.62, 0.3], [0.84, 1.3], [0.9, 1.2], [0.95, 1.27], [1, 1.25]]);
    const back = L.kf(u, [[0, 0], [0.12, 1], [0.3, 0]]);
    P[L.PX + 1] += L.kf(u, [[0, 0], [0.42, -0.4], [0.84, -0.7], [0.9, -0.66], [1, -0.7]]);
    P[L.PX + 2] += -0.12 * back + 0.45 * L.kf(u, [[0.5, 0], [0.86, 1]]);
    L.A(P, 'pelvis', fall, 0.1 * sag, 0);
    L.A(P, 'spine', -0.2 * back + 0.1 * kneel, 0, 0.05 * sag); L.A(P, 'head', 0.3 * kneel - 0.4 * L.kf(u, [[0.8, 0], [0.88, 1], [1, 0.8]]), 0.2 * sag, 0);
    shieldArm(P, -0.2 * sag, 0.3 * L.kf(u, [[0.5, 0], [0.85, 1]]));
    L.A(P, 'upArmL', 0, 0, 0.25 * sag);
    L.RS(P, 'upArm', 'R', L.lerp(P[BI.upArmR * 3], -0.3, sag), 0, 0.35 * sag);
    L.RS(P, 'foreArm', 'R', -0.6 * sag + P[BI.foreArmR * 3] * (1 - sag), 0, 0);
    const lie = L.kf(u, [[0.5, 0], [0.86, 1]]);
    if (lie < 1) L.plant(P, ctx, 0.15 * kneel + 0.05, -0.3 * kneel - 0.05, 1.2, 0, 0.6 * kneel);
    if (lie > 0) for (const s of ['L', 'R']) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      P[i] = L.lerp(P[i], -0.2 - fall * 0.2, lie); P[i + 2] = L.lerp(P[i + 2], (s === 'L' ? 1 : -1) * 0.15, lie);
      P[j] = L.lerp(P[j], s === 'L' ? 0.4 : 0.8, lie); P[f] = L.lerp(P[f], 0.8, lie);
    }
  },
  victory(P, t, ctx, L) {
    // plants the shield, hoists the shotgun overhead and racks it (tick), head thrown back
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6)), pump = Math.max(0, Math.sin(t * 3.4)) * k;
    L.A(P, 'chest', -0.14 * k, -0.12 * k, 0); L.A(P, 'head', -0.3 * k, -0.1 * k, 0);
    shieldArm(P, -0.1 * k, 0.15 * k);
    L.RS(P, 'upArm', 'R', L.lerp(P[BI.upArmR * 3], -2.75 + 0.15 * pump, k), 0.1, 0.2);
    L.RS(P, 'foreArm', 'R', L.lerp(P[BI.foreArmR * 3], -0.25 - 0.2 * pump, k), 0, 0);
    L.RS(P, 'hand', 'R', -0.3 * k, 0, 0);
    P[L.PX + 1] += 0.02 * pump;
    L.plant(P, ctx, 0.18, -0.16, 1.3);
  },
  deploy(P, u, ctx, L) {
    // drops in, slams the shield down on landing (0.4), rises, racks the pump (tick ~0.85)
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.64, 0.9], [0.84, 0], [1, 0]]);
    const pre = L.kf(u, [[0, 0], [0.2, 1], [0.38, 1], [0.42, 0]]);
    P[L.PX + 1] -= 0.34 * land; P[L.PX + 2] += 0.06 * land;
    L.A(P, 'spine', 0.35 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0); L.A(P, 'head', -0.25 * land + 0.2 * pre, 0, 0);
    shieldArm(P, 0.9 * pre - 0.2 * land, 0.25 * land);
    gunArm(P, ctx, 0, 0.15 * pre, -0.05 * land);
    L.plant(P, ctx, 0.28 * land + 0.12, -0.3 * land - 0.1, 1.2 + 0.3 * land, 0, 0.6 * land);
  },
};

// pump slide back (m) per action phase
function rackAt(name, u, t) {
  const r = (a, b) => kf(u, [[0, 0], [a, 0], [a + (b - a) * 0.4, 1], [b, 0]]);
  switch (name) {
    case 'attack': return r(0.5, 0.78);
    case 'attack_alt': return r(0.55, 0.8);
    case 'overdrive': return r(0.5, 0.64);
    case 'deploy': return r(0.82, 0.98);
    default: return 0;
  }
}

export default {
  id: 'riot', name: 'RIOT', role: 'tank', faction: 'rogue', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 2.0, radius: 0.78, walkSpeed: 1.0, cadence: 0.7, scheme: 'bold',
  style: { weapon: 'shield', heavy: 1, stance: 1.2 },
  // gang red over dark gunmetal, off-white police trim; other factions keep their bold palette with a dark accent
  paint: {
    rogue: { paint: 0xc21a1c, accent: 0x33363d, trim: 0xd6d1ca },
    corporate: { accent: 0x23293a }, experimental: { accent: 0x221b33 },
  },
  mats: { all: { paint: { rough: 0.46, coat: 0.3, metal: 0.15 }, accent: { rough: 0.48, metal: 0.55 }, trim: { rough: 0.45, metal: 0.1 } } },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.16, 0.34], head: [0, 0.1, 0.2], hand: ['handR', MUZZLE] },
  events: { attack: [['fire', 0.3]], attack_alt: [['fire', 0.33]], cast: [['cast', 0.22]], overdrive: [['cast', 0.05], ['impact', 0.26], ['fire', 0.335]] },
  durs: { attack: 1.0, attack_alt: 1.1, cast: 1.3, overdrive: 2.3, die: 2.1 },
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; ctx.sa = act ? act.name : ''; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state;
    let k = st.action ? rackAt(st.action, ctx.su, ctx.t) : 0;
    if (!st.action && st.loop === 'idle') { const c = ctx.t % 7.3; k = kf(c, [[0, 0], [5.6, 0], [5.75, 1], [6.0, 0]]); }
    if (!st.action && st.loop === 'victory') k = Math.max(0, Math.sin(ctx.t * 3.4 - 0.6));
    const s = 0.13 * k;
    bones[BI.aux1].position.set(AUX1[0] - GUN_AXIS.x * s, AUX1[1] - GUN_AXIS.y * s, AUX1[2] - GUN_AXIS.z * s);
    if (unit.rank >= 5) bones[BI.aux2].rotation.y = unit.dead ? 0 : ctx.t * 7;
  },
  fxHints: { projectile: 'slug', muzzleColor: 0xff7a2a, impact: 'shield_spark', overdrive: 'breach_cone', color: 0xff5418 },
  build,
};
