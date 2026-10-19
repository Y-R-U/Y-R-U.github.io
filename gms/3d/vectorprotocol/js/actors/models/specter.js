// SPECTER, experimental epic archer "Null Sniper" (sculptor-13). Brief: docs/ROSTER.md `specter`; look: refs/ref_battle_02.png.
// A heron-thin stilt biped that never quite touches the plate: very long thin legs en pointe over hover-glow pads, a long
// craned neck carrying a hooded single-lens head, a fanned mantle of floating black-glass slats, and a null rifle longer
// than its body (open twin rails, floating null rings, a void core in the receiver, a forked muzzle).
// VALUE: `accent` = black glass (most of it), `paint` = pale violet read-plates (hood, shoulder blades, rifle shroud, shin
// blades), `metal` = dark chrome struts, `trim` = pale lilac markers, `glow` = violet seams/rings, `eye` = the lens.
// Rank tiers (ROSTER): R0 battered (torn mantle, bare rails) · R1 base minus scope vanes · R2 base · R3 cloak shimmer
//   (fresnel overlay always on, rifle edge lights) · R4 ghost trail on idle + hardlight mantle vanes (silhouette) ·
//   R5 orbiting null orbs + a thin null halo behind the hood.
// Technique: one extra SkinnedMesh with its own cloned skeleton (additive fresnel "cloak" shader). It copies the live pose
// (shimmer / cloak) or a lagged pose (R4 ghost trail). Cloaking hides the real mesh (+ its proxy) and leaves the shimmer.
// unit.specterCloak(seconds) is called by js/fx/units/specter.js on the Null Shell stealth buff.
import { THREE, P, PS, plate, fin, discX, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const DIMS = {
  thigh: 0.44, shin: 0.5, ankle: 0.07, hipX: 0.085, hipY: -0.03, spine: 0.1, chest: 0.17, neck: 0.22, headOff: 0.03,
  clavX: 0.04, clavY: 0.16, shoulder: 0.13, upArm: 0.26, foreArm: 0.26, aux0: [0, 0.13, -0.09],
  parents: { aux1: 'chest', aux2: 'chest', aux3: 'chest' }, aux1: [0, 0.08, -0.02], aux2: [0.13, 0.15, -0.06], aux3: [-0.13, 0.15, -0.06],
};
const HOVER = 0.075;              // feet float this far over the plate
const RIFLE_LEN = 1.75;
const HAND_T = [-0.07, 1.2, 0.3]; // right hand (grip) in root space when aiming
const FOREGRIP = [0, 0.0, 0.46];

// Upper-body aim: a forward heron lean, neck craned along the rifle. k 0..1 low ready .. shouldered.
const _t = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
function aim(P, ctx, k = 1) {
  const { R, A, lerp, armIK } = L;
  A(P, 'pelvis', 0, -0.24 * k, 0);
  A(P, 'spine', 0.12 * k, -0.08 * k, 0);
  A(P, 'chest', 0.1 * k, -0.06 * k, 0);
  R(P, 'neck', 0.5 * k, 0.2 * k, 0);
  R(P, 'head', -0.62 * k, 0.18 * k, 0.06 * k);
  R(P, 'clavR', 0, -0.05 * k, 0.03 * k);
  armIK(P, ctx, 'R', _t.set(lerp(-0.16, HAND_T[0], k), lerp(0.95, HAND_T[1], k), lerp(0.18, HAND_T[2], k)), 0.35);
  R(P, 'handR', 0, 0, 0);
}
const RIG = makeRig(DIMS);
const AIM_P = new Float32Array(L.NCH);
{
  const ctx = { D: RIG.D, rig: RIG };
  L.R(AIM_P, 'pelvis', 0.03, 0, 0); L.R(AIM_P, 'spine', 0.05, 0, 0); L.R(AIM_P, 'chest', 0.02, 0, 0);
  aim(AIM_P, ctx, 1);
}
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const RIFLE_FRAME = poseFrame(RIG, poseOf(AIM_P), 'handR');
function rot(e, p) {
  const [x, y, z] = e, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  let [a, b, c] = p;
  [a, b] = [a * cz - b * sz, a * sz + b * cz];
  [a, c] = [a * cy + c * sy, -a * sy + c * cy];
  [b, c] = [b * cx - c * sx, b * sx + c * cx];
  return [a, b, c];
}
const GRIP = rot(RIFLE_FRAME, FOREGRIP);
const MZ = 0.3 + RIFLE_LEN * 0.74;
const MUZZLE = rot(RIFLE_FRAME, [0, 0.03, MZ + 0.06]);
const SCOPE_EYE = rot(RIFLE_FRAME, [0, 0.13, 0.05]);

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.018, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.014, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.02, 12), bone, slot, pos, rot);
}
const crystal = (b) => b.sph(4, 2);

// ---------- rifle ----------
function rifle(b, o) {
  const far = b.far, rk = o.rank, Ln = RIFLE_LEN, H = 'handR';
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    // skeletal stock running back to the shoulder: two struts + a pale butt plate
    for (const s of [1, -1]) b.add(b.cbox(0.014, 0.022, 0.4, 0.005), H, 'metal', [s * 0.022, 0.035 - 0.0, -0.2], [0.08, 0, 0]);
    P(b, H, 'paint', [0.05, 0.13, 0.05], [0, 0.0, -0.42], [0.1, 0, 0], { c: 0.014, tx: 0.8 });
    b.add(b.cbox(0.03, 0.03, 0.12, 0.008), H, 'accent', [0, 0.06, -0.33]);
    b.add(b.cbox(0.04, 0.12, 0.05, 0.012), H, 'metal', [0, -0.06, -0.02], [0.32, 0, 0]);    // pistol grip
    // receiver: black glass housing, pale shroud on top, the void core visible through side windows
    P(b, H, 'accent', [0.085, 0.12, 0.42], [0, 0.04, 0.16], [0, 0, 0], { c: 0.02, tx: 0.8, tz: 0.9 });
    P(b, H, 'paint', [0.07, 0.04, 0.36], [0, 0.115, 0.15], [0, 0, 0], { c: 0.012, tx: 0.7, tz: 0.85 });
    b.add(b.sph(12, 10), H, 'accent', [0, 0.04, 0.2], [0, 0, 0], [0.05, 0.05, 0.05]);
    b.add(b.tor(0.058, 0.009, 16, 4), H, 'glow', [0, 0.04, 0.2], [0, PI / 2, 0]);
    if (!far) b.add(b.tor(0.058, 0.006, 16, 3), H, 'glow', [0, 0.04, 0.2], [PI / 2, 0, 0]);
    for (const s of [1, -1]) b.add(b.cbox(0.006, 0.05, 0.12, 0.002), H, 'trim', [s * 0.045, 0.04, 0.06]);
    // twin open rails (the barrel is the gap between them) + a glowing null line down the middle
    const r0 = 0.36, rl = Ln * 0.66;
    for (const y of [0.075, -0.012]) b.add(b.cbox(0.03, 0.022, rl, 0.006), H, y > 0 ? 'paint' : 'accent', [0, y, r0 + rl / 2]);
    b.add(b.cyl(0.006, 0.006, rl * 0.98, 6), H, 'glow', [0, 0.032, r0 + rl / 2], [PI / 2, 0, 0]);
    if (rk >= 1) for (const s of [1, -1]) b.add(b.cbox(0.006, 0.07, 0.04, 0.002), H, 'metal', [s * 0.016, 0.032, r0 + 0.04]);
    // floating null rings round the barrel gap
    const nR = far ? 3 : 4;
    for (let i = 0; i < nR; i++) {
      const z = r0 + 0.14 + i * (rl - 0.2) / (nR - 1), R = 0.056 - i * 0.004;
      b.add(b.tor(R, 0.012, 18, 4), H, 'metal', [0, 0.032, z]);
      b.add(b.tor(R - 0.012, 0.005, 18, 3), H, 'glow', [0, 0.032, z]);
      if (rk >= 4 && !far) for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.012, 0], [0.006, 0.07]], 0.006, 0.002), H, 'glow', [s * (R + 0.004), 0.032, z], [0, PI / 2, -s * PI / 2]);
    }
    // forked muzzle: three prongs + a glow tip
    b.add(b.cbox(0.06, 0.1, 0.06, 0.012), H, 'accent', [0, 0.032, MZ - 0.1]);
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + i * 2 * PI / 3;
      b.add(fin(b, [[-0.012, 0], [0.012, 0], [0.004, 0.16], [-0.002, 0.17]], 0.012, 0.003), H, i ? 'paint' : 'metal',
        [Math.cos(a) * 0.03, 0.032 + Math.sin(a) * 0.03, MZ - 0.07], [PI / 2, 0, a - PI / 2]);
    }
    b.add(b.sph(8, 6), H, 'glow', [0, 0.032, MZ], [0, 0, 0], [0.016, 0.016, 0.03]);
    // long scope: chrome tube, eye lenses both ends, pale saddle
    b.add(b.cyl(0.022, 0.022, 0.34, 12), H, 'metal', [0, 0.16, 0.12], [PI / 2, 0, 0]);
    b.add(b.cyl(0.026, 0.026, 0.05, 12), H, 'accent', [0, 0.16, 0.3], [PI / 2, 0, 0]);
    b.add(b.cyl(0.02, 0.02, 0.012, 12), H, 'eye', [0, 0.16, 0.326], [PI / 2, 0, 0]);
    b.add(b.cyl(0.014, 0.014, 0.01, 10), H, 'eye', [0, 0.16, -0.05], [PI / 2, 0, 0]);
    P(b, H, 'accent', [0.04, 0.03, 0.12], [0, 0.135, 0.12], [0, 0, 0], { c: 0.008 });
    if (rk >= 2 && !far) for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.05, 0.0], [0.06, 0.14], [0.0, 0.2]], 0.006, 0.002), H, 'paint', [s * 0.022, 0.16, 0.08], [PI / 2, 0, s > 0 ? -0.3 : PI + 0.3]);
    // under-barrel fins (raked) + foregrip
    b.add(fin(b, [[0, 0], [0.22, 0], [0.32, -0.07], [0.04, -0.05]], 0.012, 0.003), H, 'paint', [0, -0.025, r0 + 0.05], [0, -PI / 2, 0]);
    b.add(b.cbox(0.035, 0.08, 0.04, 0.01), H, 'metal', [0, -0.05, FOREGRIP[2]]);
    // receiver radiator fins, a coolant line back to the stock, scope rings
    if (!far) for (let i = 0; i < 7; i++) for (const s of [1, -1]) b.add(b.cbox(0.012, 0.075, 0.016, 0.003), H, i % 3 ? 'metal' : 'paint', [s * 0.05, 0.035, 0.0 + i * 0.045]);
    if (!far) b.add(b.tube([[0.03, -0.0, 0.3], [0.05, -0.04, 0.12], [0.04, -0.03, -0.1], [0.02, 0.02, -0.3]], 0.008, 12, 5), H, 'glow');
    for (const z of [0.0, 0.24]) b.add(b.tor(0.026, 0.006, 14, 4), H, 'paint', [0, 0.16, z]);
    if (!far) for (let i = 0; i < 5; i++) b.add(b.cbox(0.036, 0.01, 0.01, 0.003), H, 'trim', [0, 0.134, 0.02 + i * 0.05]);
    // R3: edge lights along the rails
    if (rk >= 3) for (const s of [1, -1]) b.add(b.cbox(0.004, 0.004, rl * 0.85, 0.001), H, 'glow', [s * 0.017, 0.088, r0 + rl * 0.47]);
    if (rk === 0) b.add(b.cbox(0.05, 0.03, 0.08, 0.008), H, 'metal', [0, 0.1, 0.6], [0, 0.3, 0.2]);   // taped-on patch
  });
}

// ---------- body ----------
function head(b, o) {
  const rk = o.rank, far = b.far;
  // narrow faceplate, single round lens with a bezel, pale hood cowl swept back to a point
  b.add(plate(b, 0.1, 0.12, 0.15, { c: 0.02, tx: 0.7, tz: 0.75, bx: 0.85 }), 'head', 'accent', [0, 0.04, 0.03]);
  b.add(b.cyl(0.03, 0.03, 0.02, 16), 'head', 'metal', [0, 0.045, 0.105], [PI / 2, 0, 0]);
  b.add(b.cyl(0.021, 0.021, 0.026, 16), 'head', 'eye', [0, 0.045, 0.108], [PI / 2, 0, 0]);
  b.add(b.tor(0.034, 0.004, 16, 3), 'head', 'glow', [0, 0.045, 0.118]);
  b.add(b.cbox(0.06, 0.02, 0.05, 0.006), 'head', 'metal', [0, -0.025, 0.08]);
  if (!far) b.sym(b.cbox(0.012, 0.012, 0.012, 0.003), 'head', 'glow', [0.034, 0.0, 0.1]);
  // hood: shell over the top/back, cheek wings, rear point
  b.add(b.sph(16, 10, 0, PI * 2, 0, PI * 0.55), 'head', 'paint', [0, 0.04, -0.01], [-0.35, 0, 0], [0.085, 0.13, 0.13]);
  b.sym(fin(b, [[0, 0.1], [0.04, 0.08], [0.05, -0.06], [0.0, -0.08]], 0.012, 0.004), 'head', 'paint', [0.06, 0.04, 0.04], [0, -0.32, 0]);
  b.add(fin(b, [[0, 0], [0.12, 0.0], [0.26, 0.09], [0.02, 0.07]], 0.03, 0.008), 'head', 'paint', [0, 0.1, -0.04], [0, PI / 2, -0.3]);
  b.add(b.cbox(0.006, 0.006, 0.17, 0.002), 'head', 'glow', [0, 0.15, -0.12], [-0.4, 0, 0]);
  b.add(b.cbox(0.11, 0.008, 0.012, 0.003), 'head', 'trim', [0, 0.1, 0.085], [-0.3, 0, 0]);
  if (!far) for (let i = 0; i < 4; i++) b.add(b.tor(0.09 + i * 0.002, 0.004, 18, 3, PI * 0.9), 'head', i % 2 ? 'metal' : 'accent', [0, 0.05, -0.02 - i * 0.03], [0, PI / 2, PI / 2 + 0.15]);
  b.sym(b.cbox(0.02, 0.05, 0.03, 0.006), 'head', 'metal', [0.05, 0.0, 0.07]);
  // long neck: segmented chrome vertebrae with a glow core
  const nk = b.rig.D.neck, n = far ? 3 : 5;
  for (let i = 0; i < n; i++) b.add(b.cyl(0.032 - i * 0.002, 0.036 - i * 0.002, 0.026, 10), 'neck', i % 2 ? 'accent' : 'metal', [0, 0.02 + i * (nk - 0.04) / (n - 1), 0]);
  b.add(b.cyl(0.012, 0.012, nk, 6), 'neck', 'glow', [0, nk / 2, 0]);
  b.add(b.cbox(0.04, nk * 0.7, 0.02, 0.006), 'neck', 'paint', [0, nk * 0.45, -0.035]);
  if (rk >= 5) {
    // thin null halo behind the hood
    b.add(b.tor(0.15, 0.006, 32, 3), 'head', 'glow', [0, 0.1, -0.16], [-0.25, 0, 0]);
    b.add(b.tor(0.175, 0.003, 32, 3), 'head', 'trim', [0, 0.1, -0.16], [-0.25, 0, 0]);
  }
}

function torso(b, o) {
  const far = b.far, r = o.r;
  // narrow keeled chest, wasp waist, small pelvis
  P(b, 'chest', 'metal', [0.18, 0.2, 0.14], [0, 0.07, -0.01], [0, 0, 0], { c: 0.02 });
  P(b, 'chest', 'accent', [0.27, 0.2, 0.19], [0, 0.11, 0.01], [0.08, 0, 0], { c: 0.03, tx: 1.15, bx: 0.55, tz: 1.0, bz: 0.75 });
  b.sym(plate(b, 0.12, 0.13, 0.03, { c: 0.01, bx: 0.5 }), 'chest', 'paint', [0.055, 0.13, 0.105], [0.3, 0.32, 0.12]);
  b.add(b.ext([[-0.02, 0.1], [0.02, 0.1], [0.025, -0.08], [0, -0.12], [-0.025, -0.08]], 0.03, 0.006), 'chest', 'metal', [0, 0.08, 0.115], [0.12, 0, 0]);
  b.add(crystal(b), 'chest', 'glow', [0, 0.1, 0.125], [0, PI / 4, 0], [0.025, 0.04, 0.02]);
  b.add(b.tor(0.038, 0.007, 14, 4), 'chest', 'trim', [0, 0.1, 0.12], [0.2, 0, 0]);
  if (!far) for (const s of [1, -1]) b.add(b.box(0.13, 0.008, 0.008), 'chest', 'glow', [s * 0.06, 0.035, 0.1], [0.1, s * 0.4, s * 0.25]);
  // layered rib plates + cables to the shoulders + collar lamps
  for (let i = 0; i < 3; i++) b.sym(plate(b, 0.085 - i * 0.012, 0.025, 0.04, { c: 0.008 }), 'chest', i ? 'accent' : 'metal', [0.07 + i * 0.008, 0.035 - i * 0.03, 0.09 - i * 0.006], [0.2, 0.3, 0.2]);
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.04, 0.17, -0.06], [s * 0.1, 0.2, -0.04], [s * 0.14, 0.16, 0.0]], 0.01, 10, 5), 'chest', 'metal');
  lamp(b, 'chest', [0.09, 0.19, 0.06], [PI / 2 - 0.4, 0, 0], 0.012);
  b.add(b.tor(0.06, 0.01, 16, 4), 'chest', 'metal', [0, 0.2, -0.01], [PI / 2, 0, 0]);
  // back spine plate + power cell under the mantle
  P(b, 'chest', 'accent', [0.18, 0.2, 0.06], [0, 0.1, -0.1], [-0.1, 0, 0], { c: 0.015 });
  b.add(b.cyl(0.03, 0.03, 0.14, 10), 'chest', 'metal', [0, 0.09, -0.135]);
  b.add(b.cyl(0.018, 0.018, 0.1, 8), 'chest', 'glow', [0, 0.09, -0.15]);
  // shoulder blades (pale, swept back): the archer's top silhouette
  PS(b, 'upArm', 'accent', [0.12, 0.07, 0.18], [0.02, 0.035, -0.01], [0, 0, -0.35], { c: 0.018, tx: 0.7, tz: 0.8 });
  PS(b, 'upArm', 'accent', [0.1, 0.045, 0.15], [0.05, -0.02, -0.005], [0, 0, -0.55], { c: 0.012, tx: 0.8 });
  PS(b, 'upArm', 'trim', [0.1, 0.008, 0.008], [0.03, 0.068, 0.07], [0, 0, -0.35]);
  b.sym(fin(b, [[0, 0.02], [0.05, 0.03], [0.32, -0.08], [0.27, -0.11], [0, -0.03]], 0.016, 0.005), 'upArm', 'paint', [0.04, 0.06, -0.03], [0.2, 0.95, -0.3]);
  if (r >= 1) b.sym(fin(b, [[0, 0.01], [0.04, 0.01], [0.22, -0.08], [0.19, -0.09]], 0.012, 0.004), 'upArm', 'accent', [0.04, 0.03, -0.05], [0.4, 0.95, -0.5]);
  if (o.rank >= 3) b.sym(b.cbox(0.004, 0.004, 0.24, 0.001), 'upArm', 'glow', [0.12, 0.075, -0.13], [0.3, -0.35, 0]);
  // waist + pelvis
  b.add(b.cyl(0.05, 0.06, 0.12, 10), 'spine', 'metal', [0, 0.04, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.058 - i * 0.003, 0.007, 14, 3), 'spine', i === 1 ? 'glow' : 'accent', [0, 0.0 + i * 0.04, 0], [PI / 2, 0, 0]);
  P(b, 'pelvis', 'accent', [0.17, 0.09, 0.12], [0, -0.01, 0], [0, 0, 0], { c: 0.02 });
  P(b, 'pelvis', 'paint', [0.08, 0.12, 0.03], [0, -0.06, 0.07], [-0.15, 0, 0], { c: 0.01, bx: 0.4 });
  PS(b, 'pelvis', 'accent', [0.035, 0.16, 0.12], [0.1, -0.06, 0], [0, 0, 0.14], { c: 0.01 });
}

function armsB(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm;
  b.sym(b.cyl(0.024, 0.024, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.045);
  b.sym(b.cyl(0.026, 0.022, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.06, ua * 0.6, 0.065], [0.008, -ua * 0.55, 0], [0, 0, 0], { c: 0.012, tx: 1.1 });
  b.sym(discX(b, 0.032, 0.07, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(discX(b, 0.02, 0.074, 8), 'foreArm', 'glow', [0, 0, 0]);
  PS(b, 'foreArm', 'accent', [0.07, fa * 0.75, 0.075], [0.004, -fa * 0.55, 0], [0, 0, 0], { c: 0.014, tx: 0.8, tz: 0.8 });
  PS(b, 'foreArm', 'paint', [0.02, fa * 0.6, 0.06], [0.04, -fa * 0.5, 0], [0, 0, -0.06], { c: 0.006 });
  b.sym(b.cyl(0.008, 0.008, fa * 0.5, 6), 'foreArm', 'metal', [0, -0.08, -0.04]);
  // layered upper-arm guards, elbow piston, wrist lamp, a cable down the forearm
  for (let i = 0; i < 3; i++) PS(b, 'upArm', i % 2 ? 'paint' : 'accent', [0.075 - i * 0.008, 0.03, 0.08], [0.02 + i * 0.006, -0.03 - i * 0.035, 0], [0, 0, -0.25 - i * 0.1], { c: 0.006 });
  b.sym(b.cyl(0.011, 0.011, ua * 0.45, 8), 'upArm', 'metal', [0, -ua * 0.6, 0.035]);
  b.sym(b.cyl(0.006, 0.006, fa * 0.4, 6), 'foreArm', 'trim', [0, -0.06, 0.04]);
  lamp(b, 'foreArm', [0.04, -fa * 0.85, 0.02], [0, 0, PI / 2], 0.01);
  if (!b.far) b.sym(b.tube([[0.0, -0.02, -0.035], [0.02, -fa * 0.4, -0.045], [0.0, -fa * 0.9, -0.03]], 0.006, 10, 4), 'foreArm', 'metal');
  // long thin fingers (uncanny)
  b.sym(b.cbox(0.045, 0.07, 0.06, 0.012), 'hand', 'accent', [0, -0.035, 0.005]);
  if (!b.far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.012, 0.09, 0.012, 0.003), 'hand', 'metal', [-0.005, -0.11, -0.018 + i * 0.018], [0, 0, -0.15]);
}

function legsB(b, o) {
  const D = b.rig.D, th = D.thigh, sh = D.shin, far = b.far;
  // stilts: thin chrome struts, pale blade plates, glowing knee rings, toes en pointe over a hover pad
  b.sym(b.sph(10, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.05);
  b.sym(b.cyl(0.026, 0.02, th, 8), 'thigh', 'metal', [0, -th / 2, 0]);
  PS(b, 'thigh', 'accent', [0.095, th * 0.66, 0.1], [0.008, -th * 0.4, 0.01], [0, 0, 0.03], { c: 0.016, tx: 1.1, bx: 0.6, bz: 0.65 });
  PS(b, 'thigh', 'accent', [0.03, th * 0.5, 0.08], [0.055, -th * 0.36, 0.0], [0, 0, 0.06], { c: 0.008, bz: 0.7 });
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0.012, -th * 0.7], [0, -th * 0.78]], 0.014, 0.004), 'thigh', 'accent', [0.0, -0.05, 0.06], [0, 0, 0]);
  b.sym(b.cbox(0.006, th * 0.5, 0.006, 0.002), 'thigh', 'trim', [0.0, -0.05 - th * 0.3, 0.068]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.05, 0.008, 0.01, 0.002), 'thigh', i === 1 ? 'glow' : 'metal', [0.0, -0.12 - i * 0.05, 0.066]);
  b.sym(b.cyl(0.007, 0.007, th * 0.6, 6), 'thigh', 'metal', [0.03, -th * 0.45, -0.035]);
  b.sym(b.cyl(0.012, 0.012, th * 0.5, 8), 'thigh', 'trim', [-0.028, -th * 0.55, -0.02]);
  b.sym(b.cyl(0.018, 0.018, th * 0.3, 8), 'thigh', 'metal', [-0.028, -th * 0.25, -0.02]);
  if (!far) b.sym(b.cbox(0.05, 0.08, 0.05, 0.012), 'thigh', 'metal', [0.065, -0.05, -0.01]);
  b.sym(discX(b, 0.032, 0.07, 10), 'shin', 'metal', [0, 0, 0]);
  b.sym(b.tor(0.03, 0.006, 12, 3), 'shin', 'glow', [0, 0, 0.0], [0, PI / 2, 0]);
  b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.12]], 0.03, 0.006), 'shin', 'paint', [0, 0.01, 0.04], [-0.55, 0, 0]);
  b.sym(b.cyl(0.02, 0.012, sh, 8), 'shin', 'metal', [0, -sh / 2, 0]);
  PS(b, 'shin', 'accent', [0.05, sh * 0.5, 0.06], [0, -sh * 0.32, 0.01], [0, 0, 0], { c: 0.01, tx: 1.1, bx: 0.6, bz: 0.6 });
  // long raked calf blade behind the shin (stilt read from the side)
  b.sym(fin(b, [[-0.015, 0.0], [0.015, 0.0], [0.006, -sh * 0.7], [0, -sh * 0.78]], 0.012, 0.003), 'shin', 'accent', [0, -0.04, -0.022], [0.02, 0, 0]);
  if (o.r >= 1 && !far) b.sym(b.cbox(0.006, sh * 0.35, 0.006, 0.002), 'shin', 'glow', [0, -sh * 0.32, 0.045]);
  // foot: a pointed tip, the hover pad under it
  b.sym(b.sph(8, 6), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.03);
  b.sym(fin(b, [[-0.025, 0], [0.025, 0], [0.01, 0.14], [0, 0.16], [-0.01, 0.14]], 0.03, 0.006), 'foot', 'accent', [0, -D.ankle + 0.03, 0.0], [PI / 2, 0, 0]);
  b.sym(b.cbox(0.03, 0.02, 0.06, 0.006), 'foot', 'paint', [0, -D.ankle + 0.055, 0.04]);
  b.sym(fin(b, [[-0.012, 0], [0.012, 0], [0, 0.07]], 0.016, 0.004), 'foot', 'metal', [0, -D.ankle + 0.03, -0.02], [-PI / 2 - 0.4, 0, 0]);
  b.sym(b.cyl(0.035, 0.035, 0.006, 14), 'foot', 'glow', [0, -D.ankle + 0.005, 0.06]);
  if (!far) b.sym(b.tor(0.048, 0.003, 16, 3), 'foot', 'glow', [0, -D.ankle - 0.012, 0.06], [PI / 2, 0, 0]);
}

// mantle: floating black-glass slats in a fan off the back (aux0) and both shoulders (aux2/aux3); each slat has a pale
// inlay spine and a hardlight edge, and they rake back so the battle camera (looking down) sees the fan
function slat(b, bone, slot, x, len, w, rz, rx, edge, inlay = true) {
  b.scope([x, 0, 0], [rx, 0, rz], 1, () => {
    b.add(fin(b, [[-w / 2, 0], [w / 2, 0], [w * 0.34, -len * 0.8], [0, -len], [-w * 0.34, -len * 0.8]], 0.014, 0.005), bone, slot, [0, 0, 0]);
    if (inlay && !b.far) b.add(fin(b, [[-w * 0.12, -0.04], [w * 0.12, -0.04], [0, -len * 0.82]], 0.006, 0.002), bone, 'paint', [0, 0, 0.01]);
    if (edge) b.add(b.cbox(0.006, len * 0.74, 0.006, 0.002), bone, edge, [w * 0.44, -len * 0.38, 0.004], [0, 0, 0.12]);
    if (!b.far) b.add(b.cbox(w * 0.8, 0.018, 0.02, 0.005), bone, 'metal', [0, -0.02, 0.0]);
  });
}
function mantle(b, o) {
  const rk = o.rank, far = b.far, n = rk === 0 ? 4 : far ? 5 : 7;
  // collar bar the slats hang from
  b.add(b.cbox(0.3, 0.035, 0.05, 0.012), 'aux0', 'metal', [0, 0.01, 0]);
  b.add(b.cbox(0.24, 0.02, 0.03, 0.006), 'aux0', 'paint', [0, 0.035, 0.0]);
  if (!far) for (const x of [-0.11, 0, 0.11]) b.add(b.cyl(0.013, 0.013, 0.06, 8), 'aux0', 'glow', [x, 0.01, -0.01], [PI / 2, 0, 0]);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5, len = 0.9 - Math.abs(t) * 0.3 - (rk === 0 && i === 2 ? 0.4 : 0);
    slat(b, 'aux0', 'accent', t * 0.3, len, 0.085, t * 0.75, -0.32 - Math.abs(t) * 0.25, i % 2 ? 'glow' : 'trim');
  }
  if (rk >= 1) for (let i = 0; i < (far ? 3 : 5); i++) {
    const t = i / 4 - 0.5;
    slat(b, 'aux0', 'paint', t * 0.22, 0.42 - Math.abs(t) * 0.1, 0.05, t * 0.6, -0.2, null, false);
  }
  // side slats hang off the shoulders, swaying on their own bones
  for (const [bone, s] of [['aux2', 1], ['aux3', -1]]) {
    b.add(b.cbox(0.06, 0.03, 0.045, 0.01), bone, 'metal', [0, 0.01, 0]);
    lamp(b, bone, [s * 0.0, 0.03, 0.0], [0, 0, 0], 0.012, 'glow', false);
    const m = rk === 0 && s < 0 ? 1 : far ? 3 : 4;
    for (let i = 0; i < m; i++) slat(b, bone, 'accent', s * i * 0.035, 0.7 - i * 0.14, 0.075, s * (0.3 + i * 0.22), -0.3 - i * 0.05, i === 0 ? 'glow' : 'trim');
    if (o.r >= 1 && !far) slat(b, bone, 'paint', s * 0.07, 0.34, 0.03, s * 0.95, -0.25, null, false);
    // R4: long hardlight vanes sweeping out past the mantle (silhouette change)
    if (rk >= 4) slat(b, bone, 'glow', s * 0.05, 0.95, 0.026, s * 1.1, -0.45, null, false);
  }
}

function orbs(b, o) {
  if (o.rank < 5) return;
  // R5: three null orbs (black cores, violet rings) orbiting the chest on aux1
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3, R = 0.34, p = [Math.cos(a) * R, 0.05 * Math.sin(a * 2), Math.sin(a) * R];
    b.add(b.sph(12, 10), 'aux1', 'accent', p, [0, 0, 0], 0.04);
    b.add(b.tor(0.052, 0.006, 16, 3), 'aux1', 'glow', p, [PI / 2 + 0.4 * i, 0, 0.3]);
    b.add(b.sph(6, 4), 'aux1', 'eye', p, [0, 0, 0], 0.016);
  }
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  armsB(b, o);
  legsB(b, o);
  mantle(b, o);
  orbs(b, o);
  rifle(b, o);
}

// ---------- cloak / ghost overlay ----------
const CLOAK_VS = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * 0.006;
  #include <project_vertex>
  vN = normalize(normalMatrix * objectNormal); vV = -mvPosition.xyz; vY = transformed.y; vW = transformed;
}`;
const CLOAK_FS = /* glsl */`
uniform vec3 uColor; uniform vec3 uCore; uniform float uA, uTime, uCut, uFill;
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
void main() {
  float band = floor(vY * 34.0);
  float h = fract(sin(band * 91.7 + floor(uTime * 12.0)) * 437.58);
  if (h < uCut) discard;
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float wave = 0.5 + 0.5 * sin(vY * 22.0 - uTime * 5.0 + sin(vW.x * 30.0 + uTime * 2.0) * 1.5);
  float scan = 0.7 + 0.3 * sin(vY * 160.0 - uTime * 24.0);
  vec3 c = mix(uColor, uCore, f * f) * (uFill + f * 1.6) * (0.55 + 0.75 * wave) * scan;
  gl_FragColor = vec4(c * uA, 1.0);
}`;
function cloakMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x8a4dff) }, uCore: { value: new THREE.Color(0xf0e6ff) }, uA: { value: 0 }, uTime: { value: 0 }, uCut: { value: 0.1 }, uFill: { value: 0.06 } },
    vertexShader: CLOAK_VS, fragmentShader: CLOAK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function overlay(unit, ctx) {
  if (ctx.ov) return ctx.ov;
  const src = unit.mesh, sk = src.skeleton;
  const root = sk.bones[0].clone(true), byName = {};
  root.traverse((n) => { if (n.isBone) byName[n.name] = n; });
  const bones = sk.bones.map((bn) => byName[bn.name]);
  const m = new THREE.SkinnedMesh(src.geometry, cloakMat());
  m.add(root);
  m.bind(new THREE.Skeleton(bones, sk.boneInverses), src.bindMatrix.clone());
  m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.name = 'specter-cloak';
  unit.body.add(m);
  const dis = unit.dispose.bind(unit);
  unit.dispose = () => { m.material.dispose(); m.removeFromParent(); dis(); };
  ctx.ov = { m, bones, lag: [], lagT: 0 };
  return ctx.ov;
}
function copyPose(ov, src) {
  for (let i = 0; i < src.length; i++) { ov.bones[i].position.copy(src[i].position); ov.bones[i].quaternion.copy(src[i].quaternion); ov.bones[i].scale.copy(src[i].scale); }
}
// ring buffer of past poses for the R4 ghost trail
function pushLag(ov, src, t) {
  let rec = ov.lag.length >= 10 ? ov.lag.shift() : { t: 0, p: src.map(() => new THREE.Vector3()), q: src.map(() => new THREE.Quaternion()) };
  rec.t = t;
  for (let i = 0; i < src.length; i++) { rec.p[i].copy(src[i].position); rec.q[i].copy(src[i].quaternion); }
  ov.lag.push(rec);
}
function lagPose(ov, t) {
  const rec = ov.lag.find((r) => r.t >= t) || ov.lag[ov.lag.length - 1];
  if (!rec) return;
  for (let i = 0; i < ov.bones.length; i++) { ov.bones[i].position.copy(rec.p[i]); ov.bones[i].quaternion.copy(rec.q[i]); }
}

// cloak target per action (1 = gone, shimmer only)
const OD_CLOAK = 0.14, OD_FIRE = 0.64;
function cloakFor(a, u) {
  switch (a) {
    case 'overdrive': return u > OD_CLOAK && u < OD_FIRE ? 1 : 0;
    case 'deploy': return u < 0.38 ? 1 : 0;
    case 'die': return u > 0.82 ? 1 : 0;
    default: return 0;
  }
}

// ---------- anims ----------
function stand(P, ctx, t, k = 1) { L.idle(P, ctx, t); aim(P, ctx, k); }
const plantA = (P, ctx, s = 1) => L.plant(P, ctx, 0.2 * s, -0.17 * s, 1.25);
const anims = {
  idle(P, t, ctx) {
    stand(P, ctx, t, 0.92 + 0.03 * Math.sin(t * 1.1));
    // every ~6 s an uncanny twitch: the head snaps sideways, holds, snaps back
    const c = t % 6.3, tw = L.kf(c, [[0, 0], [4.6, 0], [4.64, 1], [5.2, 1], [5.26, 0]]);
    L.A(P, 'head', 0.1 * tw, -0.35 * tw, 0.4 * tw); L.A(P, 'neck', 0, -0.1 * tw, 0);
    L.A(P, 'chest', 0.015 * Math.sin(t * 0.8), 0, 0);
    plantA(P, ctx);
  },
  advance(P, t, ctx) { L.gait(P, ctx); aim(P, ctx, 0.72); L.A(P, 'neck', 0.12, 0, 0); L.A(P, 'head', -0.12, 0, 0); },
  // GHOST ROUND: still, then a sharp kick; the whole frame flickers on the shot (fire 0.3)
  attack(P, u, ctx) {
    stand(P, ctx, ctx.t, 1);
    const kick = L.kf(u, [[0, 0], [0.28, 0], [0.31, 1], [0.6, 0.15], [1, 0]]);
    const settle = L.kf(u, [[0, 0], [0.22, 1], [0.3, 1], [0.5, 0]]);
    P[L.PX + 1] -= 0.03 * settle; P[L.PX + 2] -= 0.09 * kick;
    L.A(P, 'chest', -0.18 * kick, 0.1 * kick, 0); L.A(P, 'spine', -0.08 * kick, 0.05 * kick, 0);
    L.A(P, 'clavR', 0, -0.22 * kick, 0); L.A(P, 'neck', -0.12 * kick, 0, 0); L.A(P, 'head', 0.05 * kick, 0, 0);
    plantA(P, ctx);
  },
  // charged null round: sinks lower on the stilts, the rifle trembles as the void core fills, heavy kick (fire 0.66)
  attack_alt(P, u, ctx) {
    stand(P, ctx, ctx.t, 1);
    const low = L.kf(u, [[0, 0], [0.22, 1], [0.86, 1], [1, 0]]);
    const shake = Math.sin(u * 85) * L.kf(u, [[0, 0], [0.25, 0], [0.62, 1], [0.66, 0]]);
    const kick = L.kf(u, [[0, 0], [0.64, 0], [0.68, 1], [0.95, 0]]);
    P[L.PX + 1] -= 0.12 * low; P[L.PX + 2] -= 0.1 * kick;
    L.A(P, 'spine', 0.08 * low, 0, 0); L.A(P, 'neck', 0.1 * low, 0, 0); L.A(P, 'head', -0.12 * low, 0, 0);
    L.A(P, 'chest', 0.012 * shake - 0.16 * kick, 0.012 * shake, 0);
    L.A(P, 'upArmR', 0.25 * kick, 0, 0);
    L.plant(P, ctx, 0.26, -0.22, 1.4);
  },
  // cloak sweep: rifle drops to the hip, the free hand drags the mantle across the body (cast 0.45)
  cast(P, u, ctx) {
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]), sw = L.kf(u, [[0, 0], [0.25, 0], [0.5, 1], [0.75, 1], [1, 0]]);
    stand(P, ctx, ctx.t, 1 - 0.5 * k);
    L.RS(P, 'upArm', 'L', L.lerp(-0.2, -1.5, sw), L.lerp(0.1, -0.7, sw), L.lerp(0.3, 0.1, sw));
    L.RS(P, 'foreArm', 'L', -0.6 * sw - 0.2, 0, 0);
    L.A(P, 'chest', -0.06 * k, -0.25 * sw, 0); L.A(P, 'head', 0.1 * k, 0.2 * sw, 0);
    P[L.PX + 1] -= 0.05 * k;
    plantA(P, ctx);
  },
  // SPECTRUM SNIPE: a deep lean back on the stilts (rifle raised over the front line), cloaked, trembles, decloaks on the shot
  overdrive(P, u, ctx) {
    stand(P, ctx, ctx.t, 1);
    const up = L.kf(u, [[0, 0], [0.16, 1], [0.86, 1], [1, 0]]);
    const shake = Math.sin(u * 95) * L.kf(u, [[0, 0], [0.3, 0], [OD_FIRE - 0.02, 1], [OD_FIRE, 0]]);
    const kick = L.kf(u, [[0, 0], [OD_FIRE - 0.01, 0], [OD_FIRE + 0.02, 1], [0.82, 0.3], [1, 0]]);
    P[L.PX + 1] -= 0.16 * up; P[L.PX + 2] -= 0.06 * up + 0.12 * kick;
    L.A(P, 'pelvis', -0.3 * up - 0.12 * kick, 0, 0);
    L.A(P, 'spine', -0.06 * up, 0, 0); L.A(P, 'chest', 0.012 * shake - 0.1 * kick, 0.01 * shake, 0);
    L.A(P, 'head', 0.14 * up, 0, 0);
    L.A(P, 'upArmR', 0.3 * kick, 0, 0);
    L.plant(P, ctx, 0.34 * up + 0.2 * (1 - up), -0.32 * up - 0.17 * (1 - up), 1.5);
  },
  hit(P, u, ctx) {
    stand(P, ctx, ctx.t, 1);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.12 * k, 0.1 * k * d, 0.06 * k * d); P[L.PX + 2] -= 0.08 * k; P[L.PX] += 0.03 * k * d;
    L.A(P, 'chest', -0.2 * k, 0, 0.1 * k * d); L.A(P, 'neck', -0.3 * k, 0, 0); L.A(P, 'head', -0.2 * k, 0.2 * k * d, 0.3 * k * d);
    plantA(P, ctx);
  },
  // die: the stilts buckle, it folds forward onto its knees, then topples and fades into the shimmer (down 0.62)
  die(P, u, ctx) {
    stand(P, ctx, ctx.t * (1 - u * 0.8), 1 - u);
    const kn = L.kf(u, [[0, 0], [0.12, 0.1], [0.4, 1], [1, 1]]), fall = L.kf(u, [[0.36, 0], [0.62, 1], [0.7, 0.93], [0.78, 1], [1, 1]]);
    const gl = u < 0.25 ? Math.sin(u * 150) * 0.04 * (1 - u / 0.25) : 0;
    P[L.PX + 1] -= 0.62 * kn + 0.32 * fall; P[L.PX + 2] += 0.1 * fall;
    L.A(P, 'pelvis', 0.3 * kn + 0.6 * fall + gl * 3, 0.1 * fall, 0.15 * fall);
    L.A(P, 'spine', 0.2 * fall, 0, 0); L.A(P, 'neck', 0.6 * kn - 0.4 * fall, 0, 0); L.A(P, 'head', 0.3 * fall, 0.3 * fall, 0.5 * fall);
    L.RS(P, 'upArm', 'L', L.lerp(-0.2, -0.9, fall), 0, 0.3);
    L.plant(P, ctx, 0.25, -0.22, 1.3, 0, 0.9 * kn);
  },
  // victory: rifle swung up to the vertical at its side, mantle flares, head tilts in that wrong way
  victory(P, t, ctx) {
    L.idle(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7));
    L.A(P, 'spine', -0.04 * k, 0, 0); L.A(P, 'chest', -0.06 * k, 0, 0);
    L.R(P, 'neck', 0.1 * k, 0, 0); L.R(P, 'head', -0.1 * k, 0.15 * k * Math.sin(t * 0.7), 0.35 * k);
    L.RS(P, 'upArm', 'R', L.lerp(-0.2, -0.25, k), 0, L.lerp(0.2, 0.25, k));
    L.RS(P, 'foreArm', 'R', L.lerp(-0.6, -1.55, k), 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0, -1.45, k), L.lerp(0, 0.3, k), 0);
    L.RS(P, 'upArm', 'L', -0.15, 0, 0.25 + 0.04 * Math.sin(t * 1.6)); L.RS(P, 'foreArm', 'L', -0.35, 0, 0);
    L.plant(P, ctx, 0.12, -0.12, 1.15);
  },
  // deploy: no drop. It is already there, cloaked and folded; decloaks (land 0.4), rises on the stilts into the aim (ready 0.85)
  deploy(P, u, ctx) {
    const rise = L.kf(u, [[0, 0], [0.38, 0], [0.8, 1], [1, 1]]);
    stand(P, ctx, ctx.t, rise);
    P[L.PX + 1] -= 0.4 * (1 - rise);
    L.A(P, 'spine', 0.4 * (1 - rise), 0, 0); L.A(P, 'neck', 0.5 * (1 - rise), 0, 0); L.A(P, 'head', -0.2 * (1 - rise), 0, 0);
    L.plant(P, ctx, 0.2, -0.17, 1.25);
  },
};

export default {
  id: 'specter', name: 'SPECTER', role: 'archer', faction: 'experimental', rarity: 'epic', realm: 'scifi', noDrop: true,
  rig: 'biped', dims: DIMS, height: 1.72, radius: 0.46, bodyScale: [1.2, 1, 1.12], walkSpeed: 1.3, cadence: 0.8, scheme: 'dark',
  style: { weapon: 'rifle', heavy: 0, stance: 1.25, grip: GRIP, gripOut: 0.5, freeHand: ['cast', 'victory', 'die'] },
  paint: {
    experimental: { paint: 0x8a72cc, accent: 0x0b0a12, trim: 0xe6dcff, glow: 0xa64dff, eye: 0xf0dcff },
    corporate: { paint: 0xbcd6ea, accent: 0x0a0e16, trim: 0xdcecff },
    rogue: { paint: 0xd8b0a4, accent: 0x110a0a, trim: 0xffd2c0 },
  },
  mats: {
    all: {
      accent: { rough: 0.24, metal: 0.35, env: 0.65, coat: 1, panel: { groove: 0.18, scale: 6 } },
      paint: { rough: 0.3, coat: 0.6, panel: { groove: 0.25 }, detail: { map: 'scratch', scale: 3, albedo: 0.2, rough: 0.35 } },
      metal: { color: 0x4c5264, metal: 0.95, rough: 0.3, panel: { groove: 0.1, scale: 9 } },
    },
  },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.1, 0.13], head: [0, 0.05, 0.1], scope: ['handR', SCOPE_EYE] },
  events: {
    attack: [['fire', 0.31]], attack_alt: [['cast', 0.22], ['fire', 0.67]], cast: [['cast', 0.45]],
    overdrive: [['cast', OD_CLOAK], ['fire', OD_FIRE + 0.01]], die: [['down', 0.62]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 0.85, attack_alt: 1.4, cast: 1.0, overdrive: 2.4, hit: 0.4, die: 1.9, deploy: 1.6 },
  extraDrawCalls: 0,
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
    const t = ctx.t, i0 = BI.aux0 * 3, i2 = BI.aux2 * 3, i3 = BI.aux3 * 3;
    // mantle wavers: back fan + the two shoulder fans out of phase; flares on the overdrive / victory
    const fl = act && act.name === 'overdrive' ? 0.25 : act && act.name === 'hit' ? 0.15 : 0;
    P[i0] = 0.06 + 0.05 * Math.sin(t * 1.3) + fl; P[i0 + 2] = 0.04 * Math.sin(t * 0.9);
    P[i2] = 0.05 + 0.06 * Math.sin(t * 1.6 + 1) + fl; P[i2 + 2] = 0.08 + 0.05 * Math.sin(t * 1.1) + fl * 0.8;
    P[i3] = 0.05 + 0.06 * Math.sin(t * 1.5 + 2.3) + fl; P[i3 + 2] = -0.08 - 0.05 * Math.sin(t * 1.2 + 0.7) - fl * 0.8;
    // R5 null orbs orbit
    const fast = act && act.name === 'overdrive' ? 3 : 1;
    P[BI.aux1 * 3 + 1] = t * 0.9 * fast; P[BI.aux1 * 3] = 0.15 * Math.sin(t * 0.5);
    // toes en pointe
    P[BI.footL * 3] += 0.35; P[BI.footR * 3] += 0.35;
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act, u = ctx.au, t = ctx.t, rk = unit.rank, body = unit.body;
    if (!unit.specterCloak) {
      unit.specterCloak = (sec) => { ctx.stealthT = Math.max(ctx.stealthT || 0, sec); };
      unit.extraDrawCalls = () => (ctx.ov && ctx.ov.m.visible ? 1 : 0) - (unit.mesh.visible ? 0 : unit.mesh.material.length);
    }
    // hover: the feet never touch the plate
    if (!(a === 'die' && u > 0.5)) body.position.y += HOVER + 0.012 * Math.sin(t * 1.7);
    else body.position.y += HOVER * Math.max(0, 1 - (u - 0.5) * 4);
    // cloak state: action windows, the stealth timer, and a brief uncloak whenever it fires
    if (ctx.stealthT > 0) ctx.stealthT -= dt;
    if (ctx.showT > 0) ctx.showT -= dt;
    if (a !== ctx.lastAct || u < (ctx.lastU ?? 0)) ctx.fired = 0;
    if ((a === 'attack' && u >= 0.31 || a === 'attack_alt' && u >= 0.67) && !ctx.fired) { ctx.fired = 1; ctx.showT = 0.35; ctx.pulse = 1; }
    if (a === 'cast' && u >= 0.45 && !ctx.fired) { ctx.fired = 1; ctx.pulse = 1.2; }
    if (a === 'hit' && !ctx.fired) { ctx.fired = 1; ctx.pulse = 0.8; }
    ctx.lastAct = a; ctx.lastU = u;
    let want = a ? cloakFor(a, u) : 0;
    if (ctx.stealthT > 0 && !(ctx.showT > 0) && a !== 'die') want = Math.max(want, 1);
    const prev = ctx.cloak || 0;
    ctx.cloak = prev + (want - prev) * (1 - Math.exp(-dt * 14));
    if (Math.abs(ctx.cloak - prev) > 0.002 && (want > 0.5) !== (prev > 0.5)) ctx.pulse = Math.max(ctx.pulse || 0, 1.3);
    ctx.pulse = Math.max(0, (ctx.pulse || 0) - dt * 3.2);
    const hidden = ctx.cloak > 0.5;
    if (unit.mesh) unit.mesh.visible = !hidden;
    for (const c of body.children) if (c.name && c.name.startsWith('unit-proxy')) c.visible = !hidden;
    // the overlay: shimmer (R3+), cloak, flicker pulses, R4 idle ghost trail
    const need = rk >= 3 || hidden || ctx.pulse > 0 || ctx.ov;
    if (!need) return;
    const ov = overlay(unit, ctx), U = ov.m.material.uniforms, src = unit.mesh.skeleton.bones;
    pushLag(ov, src, t);
    const trail = rk >= 4 && !a && unit.state.loop === 'idle' && !hidden && !(ctx.stealthT > 0);
    if (trail) { lagPose(ov, t - 0.22); ov.m.position.set(0.03 * Math.sin(t * 0.9), 0, -0.05); }
    else { copyPose(ov, src); ov.m.position.set(0, 0, 0); }
    const dead = unit.state.dead;
    // touch-up 2: the R3 shimmer was too faint at battle size: stronger base + a glint that rolls over it every ~3 s
    const glint = rk >= 3 && !dead ? Math.pow(Math.max(0, Math.sin(t * 2.1)), 10) * 0.45 : 0;
    const base = dead ? 0 : rk >= 3 ? (trail ? 0.6 : 0.6) + glint : 0;
    const A = Math.max(base + 0.05 * Math.sin(t * 4.3), hidden ? 0.75 + 0.15 * Math.sin(t * 7) : 0, ctx.pulse);
    U.uA.value = A; U.uTime.value = t;
    U.uCut.value = hidden ? 0.3 : trail ? 0.4 : rk >= 3 ? 0.12 : 0.15 + 0.2 * (1 - Math.min(1, ctx.pulse));
    U.uFill.value = hidden ? 0.02 : 0.16 + 0.2 * glint + 0.25 * Math.min(1, ctx.pulse);
    ov.m.visible = A > 0.01;
  },
  fxHints: { projectile: 'null_round', muzzleColor: 0xc58cff, impact: 'void_puncture', overdrive: 'spectrum_snipe', color: 0xa64dff },
  build,
};

