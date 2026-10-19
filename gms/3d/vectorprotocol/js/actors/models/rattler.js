// RATTLER, rogue street gun (sculptor-7). Brief: docs/ROSTER.md `rattler`; faction-mates: scrapper / riot / barb.
// Lanky, slouched street kid of a robot: thin gunmetal limbs, black jacket torso, a big ORANGE hood cowl over a dark faceplate
// with two orange eye slits, a brass bandolier across the chest, and two compact SMGs (one per hand). Yellow graffiti tags.
//
// VALUE: `accent` = black jacket / cloth (base), `paint` = hazard orange on the read-shapes (hood, forearm guards, shin fronts,
// mags), `metal` = light gunmetal limbs + guns, `trim` = yellow (tags, brass, hazard stripes), `glow`/`eye` = orange.
// Rank ladder (o.rank): R0-1 base (R0 grimy, kit) · R2 extended stick mags + scarf strip · R3 tags glow orange, gun sight lamps ·
//   R4 hood fins + glowing hood rim + a third SMG holstered on the back (silhouette) · R5 floating graffiti crown above the hood.
// Rarity (o.r): rare+ left shoulder pad + knee pads · epic+ thigh holster + hood monocle lens · legendary gold chain (kit gold trim).
// Technique: both hands are IK'd to points in chest space, then each wrist is re-oriented exactly so its gun points along a wanted
// root-space direction (aimHand); guns are modelled in the "forearm forward" hold frame. The mags sit on aux2/aux3 (re-parented to
// the hands) and drop out / slap back in during the reload (cast) in tick().
import { THREE, P, PS, plate, fin, deform, makeRig, LIB, kf, PI, BI } from '../kit.js';

const GUN = { y: 0.05, L: 0.36, magZ: 0.07 };        // gun frame: receiver height above the grip, barrel length, mag position
const GRIP = [0, -0.05, 0.0];                         // gun-frame origin in hand space (inside the fist)
const DIMS = {
  thigh: 0.28, shin: 0.29, ankle: 0.07, hipX: 0.09, hipY: -0.04, spine: 0.11, chest: 0.16, neck: 0.12, headOff: 0.03,
  clavX: 0.05, clavY: 0.13, shoulder: 0.12, upArm: 0.24, foreArm: 0.23,
  aux0: [0, 0.06, -0.14], aux1: [0, 0.3, -0.02],
  // mags live in the hand frames (gun frame z = magZ, y below the grip)
  parents: { aux2: 'handL', aux3: 'handR' },
};
const GS = 1.2;                                       // gun scale (reads at battle size)
const HG = (p) => [GRIP[0] + p[0] * GS, GRIP[1] - p[2] * GS, GRIP[2] + p[1] * GS];    // gun frame (x, y up, z barrel) -> hand space (hold frame [PI/2,0,0])
DIMS.aux2 = DIMS.aux3 = HG([0, 0.025, GUN.magZ]);
const MAG0 = DIMS.aux2.slice();
const STYLE = { weapon: 'rifle', heavy: 0, stance: 1.3 };
const SLOUCH = { spine: 0.2, chest: 0.24, neck: 0.38, head: -0.55 };
// default hand targets in chest space (guns low, out front)
const HT = { L: [0.15, -0.13, 0.22], R: [-0.15, -0.13, 0.22] };

// ---------------- pose helpers ----------------
function slouch(P, k = 1) {
  LIB.A(P, 'spine', SLOUCH.spine * k, 0, 0); LIB.A(P, 'chest', SLOUCH.chest * k, 0, 0);
  LIB.A(P, 'neck', SLOUCH.neck * k, 0, 0); LIB.A(P, 'head', SLOUCH.head * k, 0, 0);
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _e = new THREE.Euler();
// hand to a chest-space point (elbow `out`)
function handTo(P, ctx, s, p, out = 0.5) {
  LIB.fkPoint(P, ctx, 'chest', p, _v);
  LIB.armIK(P, ctx, s, _v, out);
}
// orient the `s` wrist so its gun points along root-space dir (dx,dy,dz) with the gun's top rolled by `roll` (0 = up, + = outward)
function aimHand(P, ctx, s, dx, dy, dz, roll = 0) {
  const { q } = LIB.fkBone(P, ctx, 'foreArm' + s, _v, _q);
  _d.set(dx, dy, dz).normalize();
  const sg = s === 'L' ? 1 : -1;
  _u.set(Math.sin(roll) * sg, Math.cos(roll), 0);
  _u.addScaledVector(_d, -_u.dot(_d)).normalize();
  _y.copy(_d).negate();                         // hand -y = barrel
  _x.crossVectors(_y, _u);                      // x = y × z
  _m.makeBasis(_x, _y, _u);
  _qh.setFromRotationMatrix(_m);
  _qh.premultiply(q.invert());
  _e.setFromQuaternion(_qh, 'YXZ');
  LIB.R(P, 'hand' + s, _e.x, _e.y, _e.z);
}
// both guns: hands to chest-space targets (offsets), aim along yaw/pitch (per side spread), roll
function guns(P, ctx, o = {}) {
  const { lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, yaw = 0, pitch = -0.12, spread = 0.06, roll = 0, rollL = roll, rollR = roll, outL = 0.5, outR = 0.5, yawL = 0, yawR = 0, pitchL = 0, pitchR = 0 } = o;
  handTo(P, ctx, 'L', [HT.L[0] + lx, HT.L[1] + ly, HT.L[2] + lz], outL);
  handTo(P, ctx, 'R', [HT.R[0] + rx, HT.R[1] + ry, HT.R[2] + rz], outR);
  for (const s of ['L', 'R']) {
    const a = yaw + (s === 'L' ? spread + yawL : -spread + yawR), p = pitch + (s === 'L' ? pitchL : pitchR);
    aimHand(P, ctx, s, Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p), s === 'L' ? rollL : rollR);
  }
}
function stance(P, ctx, t) {
  LIB.idle(P, ctx, t);
  slouch(P);
  P[LIB.PX + 1] -= 0.05;
  P[LIB.PX + 2] -= 0.03;
  LIB.plant(P, ctx, 0.1, -0.1, 1.15);
}

// ---------------- greebles ----------------
function rodG(b, p, q, r, seg = 8) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, L, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
// graffiti tag: a seeded scribble of tube strokes on a plane (scope frame: x right, y up, face +z)
function tag(b, bone, slot, pos, rot3, w = 0.12, h = 0.06, seed = 1, strokes = 3) {
  if (b.far) return;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  b.scope(pos, rot3, 1, () => {
    for (let k = 0; k < strokes; k++) {
      const pts = [], n = 5, x0 = -w / 2 + (k / strokes) * w;
      for (let i = 0; i < n; i++) pts.push([x0 + (i / (n - 1)) * (w / strokes) * 1.3 + (rnd() - 0.5) * 0.015, (rnd() - 0.5) * h + Math.sin(i * 2 + k) * h * 0.3, 0]);
      b.add(b.tube(pts, 0.0065, 8, 4), bone, slot, [0, 0, 0]);
    }
    b.add(b.tube([[-w / 2, -h * 0.62, 0], [0, -h * 0.5, 0], [w / 2, -h * 0.7, 0]], 0.004, 6, 4), bone, slot, [0, 0, 0]);
  });
}
function lamp(b, bone, pos, rot3, r = 0.02, slot = 'glow') {
  b.add(b.cyl(r * 1.45, r * 1.45, 0.016, 10), bone, 'metal', pos, rot3);
  b.add(b.cyl(r, r, 0.022, 10), bone, slot, pos, rot3);
}

// ---------------- parts ----------------
function head(b, o) {
  const far = b.far, rk = o.rank, z = 0.02;
  // dark faceplate + two orange eye slits + respirator grille
  b.add(b.cyl(0.04, 0.05, 0.1, 10), 'neck', 'metal', [0, 0.05, 0]);
  b.add(b.sph(16, 12), 'head', 'metal', [0, 0.01, z], [0, 0, 0], [0.085, 0.095, 0.09]);
  P(b, 'head', 'accent', [0.13, 0.09, 0.05], [0, 0.015, z + 0.075], [0, 0, 0], { c: 0.02, tx: 0.9, bx: 0.8 });
  b.sym(b.cbox(0.045, 0.014, 0.02, 0.005), 'head', 'eye', [0.03, 0.03, z + 0.1], [0, 0, 0.18]);
  b.add(b.cbox(0.07, 0.035, 0.03, 0.01), 'head', 'metal', [0, -0.03, z + 0.095], [-0.2, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.055, 0.005, 0.01), 'head', 'accent', [0, -0.019 - i * 0.011, z + 0.112 - i * 0.002], [-0.2, 0, 0]);
  // hood cowl: open-front shell a little bigger than the head, dark lining, an overhanging brim over the eyes and a soft
  // back point; the cowl collar on the chest carries the drape down onto the shoulders
  const hood = (g) => deform(g, (v) => {
    if (v.y > 0) { v.z += 0.42 * v.y * v.y; v.y += 0.22 * v.y * Math.max(0, v.z); }   // beaked peak over the brow
    if (v.y < -0.15) { const k = -v.y - 0.15; v.x *= 1 + k * 0.7; v.z *= 1 + k * 0.35; }  // flares onto the shoulders
  });
  b.add(hood(b.sph(24, 14, PI * 0.8, PI * 1.4, 0, PI * 0.84)), 'head', 'paint', [0, 0.03, z - 0.02], [0.1, 0, 0], [0.13, 0.135, 0.145]);
  b.add(hood(b.sph(20, 12, PI * 0.78, PI * 1.44, 0, PI * 0.82)), 'head', 'accent', [0, 0.03, z - 0.02], [0.1, 0, 0], [0.118, 0.123, 0.133]);
  b.add(plate(b, 0.2, 0.12, 0.08, { c: 0.03, bx: 1.25, tx: 0.75 }), 'head', 'paint', [0, -0.06, z - 0.095], [0.5, 0, 0]);
  tag(b, 'head', rk >= 3 ? 'glow' : 'trim', [0.133, 0.04, z - 0.03], [0, PI / 2, -0.15], 0.09, 0.05, 3, 2);
  // headphones over the hood (it nods to its own beat in idle)
  b.add(b.tor(0.15, 0.011, 20, 5, PI * 0.9), 'head', 'metal', [0, 0.04, z - 0.02], [0, PI / 2, PI * 0.05], [1, 1.05, 1]);
  b.sym(b.cyl(0.05, 0.05, 0.04, 14), 'head', 'accent', [0.145, 0.02, z - 0.02], [0, 0, PI / 2]);
  b.sym(b.tor(0.042, 0.007, 14, 4), 'head', 'paint', [0.167, 0.02, z - 0.02], [0, PI / 2, 0]);
  b.sym(b.cyl(0.016, 0.016, 0.01, 8), 'head', rk >= 3 ? 'glow' : 'trim', [0.169, 0.02, z - 0.02], [0, 0, PI / 2]);
  if (o.r >= 2) {
    // monocle lens bolted over the right eye
    b.add(b.cyl(0.024, 0.024, 0.02, 12), 'head', 'metal', [-0.035, 0.03, z + 0.105], [PI / 2, 0, 0]);
    b.add(b.cyl(0.017, 0.017, 0.024, 12), 'head', 'eye', [-0.035, 0.03, z + 0.11], [PI / 2, 0, 0]);
  }
  if (rk >= 4) {
    // swept hood fins (rogue spikes)
    b.sym(fin(b, [[0, 0], [0.05, 0], [0.16, 0.13], [0.13, 0.14], [0.0, 0.05]], 0.016, 0.005), 'head', 'paint', [0.07, 0.1, z - 0.07], [0, -0.6, 0.35]);
    b.sym(b.box(0.006, 0.06, 0.006), 'head', 'glow', [0.13, 0.17, z - 0.12], [0.6, 0, 0.5]);
  }
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  // skinny frame + black jacket plates
  b.add(b.cyl(0.07, 0.08, 0.12, 10), 'spine', 'metal', [0, 0.05, 0]);
  for (let i = 0; i < 3; i++) b.add(b.tor(0.078, 0.009, 14, 4), 'spine', 'accent', [0, 0.01 + i * 0.04, 0], [PI / 2, 0, 0]);
  P(b, 'chest', 'accent', [0.3, 0.24, 0.2], [0, 0.03, 0.0], [0, 0, 0], { c: 0.04, tx: 1.1, bx: 0.85, tz: 0.95, bz: 0.85 });
  PS(b, 'chest', 'accent', [0.13, 0.13, 0.05], [0.07, 0.06, 0.1], [0.15, 0.15, 0], { c: 0.02 });          // jacket lapels
  P(b, 'chest', 'metal', [0.16, 0.08, 0.05], [0, -0.07, 0.095], [-0.1, 0, 0], { c: 0.015 });
  PS(b, 'chest', 'paint', [0.03, 0.18, 0.18], [0.15, 0.03, 0], [0, 0, -0.12], { c: 0.01 });               // orange side stripes
  // zip line + chest pocket + drawstrings hanging from the hood
  b.add(b.box(0.012, 0.2, 0.012), 'chest', 'metal', [0.0, 0.02, 0.105], [0.05, 0, 0]);
  if (!far) {
    b.add(b.cbox(0.07, 0.05, 0.02, 0.006), 'chest', 'accent', [-0.08, 0.1, 0.105], [0.1, 0, 0]);
    b.add(b.box(0.05, 0.006, 0.022), 'chest', 'trim', [-0.08, 0.124, 0.107], [0.1, 0, 0]);
    for (const x of [0.035, -0.035]) { b.add(b.tube([[x, 0.2, 0.09], [x * 1.2, 0.14, 0.115], [x * 1.1, 0.07, 0.12]], 0.005, 6, 4), 'chest', 'trim', [0, 0, 0]); b.add(b.cyl(0.009, 0.009, 0.02, 6), 'chest', 'metal', [x * 1.1, 0.06, 0.12]); }
  }
  // hood drape over the shoulders (cowl collar)
  b.add(b.lathe([[0.07, 0.22], [0.11, 0.19], [0.16, 0.12], [0.19, 0.06], [0.185, 0.03], [0.15, 0.04]], 18), 'chest', 'paint', [0, 0, -0.02], [-0.12, 0, 0], [1, 1, 0.92]);
  // bandolier: strap from the left shoulder to the right hip, brass shells
  const A = [0.13, 0.15, 0.115], B = [-0.14, -0.1, 0.105];
  b.add(rodG(b, A, B, 0.03, 6), 'chest', 'accent', [0, 0, 0], [0, 0, 0], [1, 1, 0.45]);
  if (!far) for (let i = 0; i < 7; i++) {
    const k = (i + 0.5) / 7, p = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k + 0.012];
    b.add(b.cyl(0.012, 0.012, 0.05, 6), 'chest', 'trim', p, [0, 0, -0.75]); b.add(b.cyl(0.008, 0.012, 0.012, 6), 'chest', 'metal', [p[0] - 0.017, p[1] + 0.017, p[2]], [0, 0, -0.75]);
  }
  b.add(rodG(b, [0.13, 0.15, -0.09], [-0.14, -0.1, -0.09], 0.02, 6), 'chest', 'metal', [0, 0, 0], [0, 0, 0], [1, 1, 0.5]);
  // back: graffiti on the jacket, a small battery + whip antenna
  tag(b, 'chest', rk >= 3 ? 'glow' : 'trim', [0, 0.06, -0.106], [0, PI, 0], 0.18, 0.08, 7, 3);
  b.add(b.cbox(0.12, 0.1, 0.06, 0.015), 'aux0', 'metal', [0, -0.02, -0.0]);
  b.add(b.cbox(0.04, 0.02, 0.01, 0.004), 'aux0', 'glow', [0.02, -0.0, -0.032]);
  for (const [x, slot] of [[0.085, 'paint'], [-0.085, 'trim']]) {
    b.add(b.cyl(0.026, 0.026, 0.12, 10), 'aux0', slot, [x, 0.0, -0.01]);
    b.add(b.cyl(0.018, 0.024, 0.025, 10), 'aux0', 'metal', [x, 0.07, -0.01]);
    b.add(b.cyl(0.008, 0.008, 0.012, 6), 'aux0', 'accent', [x, 0.088, -0.01]);
  }
  if (!far) b.add(b.cyl(0.004, 0.006, 0.3, 4), 'aux0', 'metal', [-0.04, 0.16, -0.02], [-0.3, 0, 0.2]);
  // pelvis: belt with pouches
  P(b, 'pelvis', 'metal', [0.22, 0.1, 0.16], [0, -0.01, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'accent', [0.26, 0.04, 0.19], [0, 0.03, 0], [0, 0, 0], { c: 0.01 });
  b.add(b.cbox(0.05, 0.035, 0.015, 0.006), 'pelvis', 'trim', [0, 0.03, 0.1]);
  for (const x of [0.1, -0.1]) b.add(b.cbox(0.05, 0.06, 0.04, 0.01), 'pelvis', 'accent', [x, -0.0, 0.08]);
  if (rk >= 2) {
    // scarf strip: knot at the throat, tail flutters back over the left shoulder
    b.add(b.tor(0.075, 0.018, 16, 5), 'chest', 'paint', [0, 0.17, 0.02], [PI / 2 + 0.2, 0, 0]);
    b.add(b.tube([[0.04, 0.16, -0.06], [0.08, 0.12, -0.12], [0.1, 0.02, -0.15], [0.12, -0.08, -0.16]], 0.016, 10, 4), 'chest', 'paint', [0, 0, 0], [0, 0, 0], [1, 1, 1]);
    b.add(b.tube([[0.04, 0.16, -0.06], [0.08, 0.12, -0.12], [0.1, 0.02, -0.15], [0.12, -0.08, -0.16]], 0.012, 10, 4), 'chest', 'trim', [0.012, 0, -0.008]);
  }
  if (o.r >= 3) {
    // legendary chain across the chest
    if (!far) for (let i = 0; i < 9; i++) { const k = i / 8, a = (k - 0.5) * 2.2; b.add(b.tor(0.012, 0.004, 8, 4), 'chest', 'trim', [Math.sin(a) * 0.13, 0.13 - Math.cos(a) * 0.08 + 0.02, 0.11 + Math.cos(a) * 0.02], [i % 2 ? 0 : PI / 2, 0, 0]); }
  }
}

function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  b.sym(b.cyl(0.03, 0.03, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.05);
  b.sym(b.cyl(0.028, 0.024, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.075, ua * 0.55, 0.075], [0.005, -ua * 0.4, 0], [0, 0, 0], { c: 0.015, tx: 1.15, tz: 1.15 });   // jacket sleeve
  b.sym(b.sph(10, 8), 'foreArm', 'metal', [0, 0, 0], [0, 0, 0], 0.04);
  b.sym(b.cyl(0.024, 0.02, fa, 8), 'foreArm', 'metal', [0, -fa / 2, 0]);
  PS(b, 'foreArm', 'paint', [0.07, fa * 0.6, 0.07], [0.004, -fa * 0.52, 0], [0, 0, 0], { c: 0.015, tx: 0.85, tz: 0.9 });
  if (!far) PS(b, 'foreArm', 'trim', [0.075, 0.012, 0.075], [0.004, -fa * 0.3, 0]);
  if (!far) b.sym(b.tube([[0.03, -0.02, -0.03], [0.04, -ua * 0.5, -0.04], [0.03, -ua + 0.02, -0.03]], 0.006, 8, 4), 'upArm', 'accent', [0, 0, 0]);
  // small fists
  b.sym(b.cbox(0.06, 0.07, 0.07, 0.015), 'hand', 'metal', [0, -0.045, 0.0]);
  b.sym(b.cbox(0.065, 0.03, 0.075, 0.01), 'hand', 'accent', [0, -0.085, 0.0]);
  // shoulder pad (rare+, left only: street-kit mismatched)
  if (o.r >= 1) {
    b.add(plate(b, 0.13, 0.04, 0.14, { c: 0.015, tx: 0.85 }), 'upArmL', 'paint', [0.03, 0.04, 0], [0, 0, -0.45]);
    if (!far) b.add(b.box(0.11, 0.008, 0.02), 'upArmL', 'trim', [0.03, 0.065, 0.05], [0, 0, -0.45]);
  }
}

// one SMG in a hand (gun frame: x, y up, z barrel; hold frame [PI/2,0,0] on the hand)
function smg(b, o, s) {
  const H = 'hand' + s, far = b.far, rk = o.rank, gy = GUN.y, L = GUN.L, sg = s === 'L' ? 1 : -1;
  b.scope(GRIP, [PI / 2, 0, 0], GS, () => {
    b.add(b.cbox(0.03, 0.08, 0.04, 0.008), H, 'metal', [0, -0.015, -0.005], [0.2, 0, 0]);                       // grip
    b.add(b.cbox(0.058, 0.075, 0.25, 0.014), H, 'metal', [0, gy, 0.06]);                                            // receiver
    b.add(b.cbox(0.06, 0.026, 0.16, 0.007), H, 'paint', [0, gy + 0.042, 0.05]);                                  // orange top cover
    b.add(b.cbox(0.062, 0.014, 0.035, 0.004), H, 'trim', [0, gy + 0.004, 0.15]);                                   // hazard band
    b.add(b.cyl(0.026, 0.026, 0.14, 10), H, 'accent', [0, gy + 0.005, 0.245], [PI / 2, 0, 0]);                      // barrel shroud
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.028, 0.028, 0.007, 10), H, 'metal', [0, gy + 0.005, 0.2 + i * 0.035], [PI / 2, 0, 0]);
    b.add(b.cyl(0.011, 0.011, 0.07, 8), H, 'metal', [0, gy + 0.005, L - 0.03], [PI / 2, 0, 0]);
    b.add(b.cyl(0.017, 0.015, 0.03, 8), H, 'metal', [0, gy + 0.005, L], [PI / 2, 0, 0]);                          // compensator
    b.add(b.cbox(0.008, 0.02, 0.012, 0.002), H, rk >= 3 ? 'glow' : 'trim', [0, gy + 0.055, 0.02]);               // rear sight
    b.add(b.cbox(0.035, 0.045, 0.07, 0.008), H, 'accent', [0, gy - 0.005, -0.09]);                                 // stub stock
    b.add(b.cbox(0.012, 0.03, 0.012, 0.003), H, 'metal', [0, gy - 0.05, 0.015]);                                  // trigger guard
    if (!far) { for (let i = 0; i < 5; i++) b.add(b.box(0.03, 0.008, 0.012), H, 'accent', [0, gy + 0.06, -0.02 + i * 0.03]); b.add(b.cbox(0.006, 0.025, 0.05, 0.002), H, 'accent', [sg * 0.03, gy + 0.01, 0.1]); }
    tag(b, H, rk >= 3 ? 'glow' : 'trim', [sg * 0.027, gy, 0.05], [0, sg * PI / 2, 0], 0.11, 0.035, s === 'L' ? 5 : 11, 2);
    if (rk >= 3) b.add(b.cyl(0.006, 0.006, 0.01, 6), H, 'glow', [0, gy + 0.04, L - 0.04]);
    if (o.r >= 3) b.add(b.cyl(0.019, 0.017, 0.03, 8), H, 'trim', [0, gy + 0.005, L - 0.005], [PI / 2, 0, 0]);
  });
  // mag on aux2/aux3 (hand frame), its joint is the mag well
  const A = s === 'L' ? 'aux2' : 'aux3', ext = rk >= 2;
  b.scope([0, 0, 0], [PI / 2, 0, 0], GS, () => {
    const len = ext ? 0.17 : 0.09;
    b.add(b.cbox(0.03, len, 0.035, 0.006), A, 'paint', [0, -len / 2, 0], [0.12, 0, 0]);
    b.add(b.cbox(0.034, 0.014, 0.039, 0.004), A, 'metal', [0, -len + 0.004, -len * 0.12], [0.12, 0, 0]);
    if (ext && !far) b.add(b.cbox(0.034, 0.01, 0.039, 0.003), A, 'trim', [0, -len * 0.5, -len * 0.06], [0.12, 0, 0]);
  });
}

function backGun(b, o) {
  if (o.rank < 4) return;
  // third SMG holstered diagonally on the back (aux0)
  b.scope([0, 0.02, -0.05], [0, PI, 0.7], 1, () => {
    b.add(b.cbox(0.05, 0.065, 0.2, 0.012), 'aux0', 'metal', [0, 0, 0], [PI / 2, 0, 0]);
    b.add(b.cbox(0.052, 0.022, 0.13, 0.006), 'aux0', 'paint', [0, 0, -0.035], [PI / 2, 0, 0]);
    b.add(b.cyl(0.02, 0.02, 0.16, 8), 'aux0', 'accent', [0, 0.16, 0]);
    b.add(b.cbox(0.03, 0.09, 0.035, 0.006), 'aux0', 'paint', [0, -0.02, 0.06], [-PI / 2, 0, 0]);
    b.add(b.cbox(0.06, 0.02, 0.07, 0.006), 'aux0', 'glow', [0, -0.1, 0]);
  });
}

// thin street legs: bare gunmetal struts, slim cargo-pant covers, knee pads, orange shin guards, chunky sneakers
function legsAndExtras(b, o) {
  const D = b.rig.D, th = D.thigh, sh = D.shin, far = b.far;
  b.sym(b.sph(12, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.055);
  b.sym(b.cyl(0.032, 0.028, th, 8), 'thigh', 'metal', [0, -th / 2, 0]);
  PS(b, 'thigh', 'accent', [0.085, th * 0.62, 0.09], [0.004, -th * 0.42, 0.005], [0, 0, 0.03], { c: 0.02, tx: 1.15, tz: 1.1, bx: 0.85, bz: 0.9 });
  if (!far) PS(b, 'thigh', 'accent', [0.03, 0.06, 0.05], [0.05, -th * 0.55, 0.0], [0, 0, 0.05], { c: 0.008 });   // cargo pocket
  b.sym(b.sph(10, 8), 'shin', 'metal', [0, 0, 0], [0, 0, 0], 0.045);
  PS(b, 'shin', 'accent', [0.075, 0.07, 0.05], [0, 0.0, 0.045], [-0.2, 0, 0], { c: 0.015, tx: 0.8 });          // knee pad
  b.sym(b.cyl(0.028, 0.022, sh, 8), 'shin', 'metal', [0, -sh / 2, 0]);
  PS(b, 'shin', 'paint', [0.07, sh * 0.55, 0.04], [0, -sh * 0.42, 0.04], [0.08, 0, 0], { c: 0.012, tx: 1.1, bx: 0.85 });
  if (!far) PS(b, 'shin', 'trim', [0.072, 0.012, 0.042], [0, -sh * 0.25, 0.045], [0.08, 0, 0]);
  if (!far) for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    b.add(rodG(b, [sx * 0.04, -0.04, -0.04], [sx * 0.04, -th + 0.04, -0.045], 0.011), 'thigh' + s, 'metal');
    b.add(rodG(b, [sx * 0.04, 0.0, -0.04], [sx * 0.04, -sh * 0.4, -0.035], 0.007), 'shin' + s, 'metal');
  }
  // sneakers: black upper, orange swoosh, thick sole, toe cap
  b.sym(b.sph(10, 8), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.035);
  PS(b, 'foot', 'accent', [0.09, 0.06, 0.2], [0, -D.ankle + 0.045, 0.04], [0, 0, 0], { c: 0.025, tx: 0.85, tz: 0.8 });
  PS(b, 'foot', 'metal', [0.1, 0.028, 0.23], [0, -D.ankle + 0.012, 0.045], [0, 0, 0], { c: 0.01 });
  PS(b, 'foot', 'paint', [0.092, 0.03, 0.06], [0, -D.ankle + 0.035, 0.13], [0.25, 0, 0], { c: 0.01 });
  if (!far) PS(b, 'foot', 'paint', [0.094, 0.012, 0.12], [0, -D.ankle + 0.05, 0.03], [0.2, 0, 0]);
  if (o.r >= 1) PS(b, 'shin', 'paint', [0.09, 0.08, 0.05], [0, 0.0, 0.065], [-0.25, 0, 0], { c: 0.02, tx: 0.8 });
  if (o.r >= 2) {
    // thigh holster + glow strip
    b.add(b.cbox(0.05, 0.13, 0.08, 0.012), 'thighR', 'accent', [-0.07, -0.14, 0.0], [0, 0, -0.08]);
    b.add(b.box(0.008, 0.08, 0.008), 'thighR', 'glow', [-0.096, -0.14, 0.03], [0, 0, -0.08]);
  }
  tag(b, 'thighL', o.rank >= 3 ? 'glow' : 'trim', [0.048, -0.12, 0.02], [0, PI / 2, 0.1], 0.07, 0.035, 13, 2);
}

function crown(b, o) {
  if (o.rank < 5) return;
  // floating graffiti crown above the hood (aux1 spins in tick)
  const A = 'aux1';
  const pts = [[-0.11, -0.04], [0.11, -0.04], [0.12, 0.05], [0.06, 0.0], [0.0, 0.08], [-0.06, 0.0], [-0.12, 0.05]];
  b.add(fin(b, pts, 0.018, 0.005), A, 'trim', [0, 0, 0]);
  b.add(fin(b, pts.map(([x, y]) => [x * 0.72, y * 0.72 - 0.005]), 0.026, 0.005), A, 'glow', [0, 0, 0]);
  for (const x of [-0.12, 0, 0.12]) b.add(b.sph(8, 6), A, 'glow', [x, x === 0 ? 0.095 : 0.065, 0], [0, 0, 0], 0.016);
  b.add(b.tor(0.14, 0.005, 28, 4), A, 'glow', [0, -0.07, 0], [PI / 2, 0, 0]);
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  arms(b, o);
  smg(b, o, 'L');
  smg(b, o, 'R');
  backGun(b, o);
  legsAndExtras(b, o);
  crown(b, o);
}

// ---------------- anims ----------------
const pulse = (u, t0, w = 0.03) => (u >= t0 ? Math.exp(-(u - t0) / w) : 0);
const ATK = [0.24, 0.3, 0.36, 0.42, 0.48, 0.54];                  // alternating R, L, R, ...
const ALT = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65];
const OD_N = 18, OD0 = 0.23, OD1 = 0.86;
const OD = Array.from({ length: OD_N }, (_, i) => OD0 + i * (OD1 - OD0) / (OD_N - 1));
const kicks = (u, list, w) => { let r = 0, l = 0; list.forEach((t0, i) => { const k = pulse(u, t0, w); if (i % 2) l += k; else r += k; }); return [l, r]; };

const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // head-nod to a beat, shoulder bob; every ~5.5 s it spins the right SMG round its trigger finger
    const beat = Math.sin(t * PI * 2 * 1.1), bob = Math.abs(Math.sin(t * PI * 1.1));
    L.A(P, 'neck', 0.06 * beat, 0, 0); L.A(P, 'head', 0.04 * beat, 0, 0.05 * Math.sin(t * 1.1));
    P[L.PX + 1] -= 0.012 * bob; L.A(P, 'chest', 0, 0.05 * Math.sin(t * 1.1 * PI), 0);
    const c = t % 5.5, lift = L.kf(c, [[0, 0], [3.6, 0], [3.85, 1], [4.75, 1], [5.0, 0]]), spin = L.kf(c, [[3.85, 0], [4.65, 1]]);
    guns(P, ctx, { pitch: -0.55 + 0.1 * bob, spread: 0.25, ly: 0.01 * bob, ry: 0.07 * lift, rz: 0.04 * lift, pitchR: 0.5 * lift });
    if (spin > 0 && spin < 1) L.A(P, 'handR', spin * PI * 2, 0, 0);
    L.A(P, 'head', 0.15 * lift, -0.3 * lift, 0);
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    slouch(P, 1.15);
    const sw = Math.sin(ctx.move.phase * PI * 2);
    guns(P, ctx, { pitch: -0.4, spread: 0.2, lz: 0.03 * sw, rz: -0.03 * sw, ly: 0.02, ry: 0.02 });
  },
  attack(P, u, ctx, L) {
    // SMG Burst: both guns snap up level and chatter, alternating R/L (fire 0.24..0.54), recoil per shot
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.16, 1], [0.66, 1], [0.9, 0]]);
    const [kl, kr] = kicks(u, ATK, 0.028);
    P[L.PX + 2] -= 0.012 * (kl + kr);
    L.A(P, 'spine', -0.04 * up, 0, 0); L.A(P, 'chest', -0.06 * up - 0.02 * (kl + kr), 0.02 * (kl - kr), 0);
    L.A(P, 'neck', -0.08 * up, 0, 0); L.A(P, 'head', 0.06 * up, 0, 0);
    guns(P, ctx, { pitch: L.lerp(-0.55, -0.06, up) + 0.12 * kl * 0 , pitchL: 0.14 * kl, pitchR: 0.14 * kr, spread: L.lerp(0.25, 0.05, up),
      ly: 0.12 * up, ry: 0.12 * up, lz: 0.1 * up - 0.035 * kl, rz: 0.1 * up - 0.035 * kr });
    L.plant(P, ctx, 0.12, -0.1, 1.1);
  },
  attack_alt(P, u, ctx, L) {
    // gangsta spray: drops into a crouch, both guns rolled flat (inward), 8 rounds sweeping the lane
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.2, 1], [0.75, 1], [0.95, 0]]);
    const sw = L.kf(u, [[0, 0], [0.28, 0.18], [0.68, -0.18], [1, 0]]);
    const [kl, kr] = kicks(u, ALT, 0.024);
    P[L.PX + 1] -= 0.07 * up; P[L.PX + 2] -= 0.01 * (kl + kr);
    L.A(P, 'pelvis', 0, sw * 0.4, 0); L.A(P, 'spine', 0.02 * up, sw * 0.3, 0); L.A(P, 'chest', -0.04 * up, sw * 0.3, -0.08 * up);
    L.A(P, 'head', 0.05 * up, -sw * 0.4, 0.15 * up);
    guns(P, ctx, { pitch: L.lerp(-0.5, -0.1, up), pitchL: 0.12 * kl, pitchR: 0.12 * kr, spread: 0.12, yaw: sw * 0.4,
      rollL: -1.45 * up, rollR: -1.45 * up, ly: 0.08 * up, ry: 0.12 * up, lz: 0.14 * up, rz: 0.12 * up, lx: -0.02 * up, rx: 0.02 * up });
    L.plant(P, ctx, 0.16, -0.14, 1.35, 0, 0.2 * up);
  },
  cast(P, u, ctx, L) {
    // reload: guns tip up together in front of the chest, mags drop (tick), fresh ones slapped in (cast 0.55), racks
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    const slap = pulse(u, 0.55, 0.05) + pulse(u, 0.62, 0.05);
    L.A(P, 'chest', -0.05 * k, 0, 0); L.A(P, 'neck', 0.1 * k, 0, 0); L.A(P, 'head', 0.25 * k, 0, 0);
    guns(P, ctx, { pitch: 0.6 * k - 0.55 * (1 - k), spread: -0.35 * k + 0.25 * (1 - k), ly: 0.1 * k + 0.02 * slap, ry: 0.1 * k, lx: -0.06 * k, rx: 0.06 * k, lz: 0.02 * k, rz: 0.02 * k });
    L.plant(P, ctx, 0.08, -0.08, 1.0);
  },
  overdrive(P, u, ctx, L) {
    // Spray & Pray: hops, arms flung wide, spins a full turn hosing both guns everywhere (fire 0.23..0.86), lands, cocky shrug
    stance(P, ctx, ctx.t);
    const D = ctx.D;
    const wide = L.kf(u, [[0, 0], [0.18, 1], [0.88, 1], [1, 0]]);
    const crouch = L.kf(u, [[0, 0], [0.1, 1], [0.2, 0], [0.86, 0], [0.92, 0.8], [1, 0]]);
    const hop = L.kf(u, [[0.18, 0], [0.26, 1], [0.62, 1], [0.72, 0]]);
    const spin = L.kf(u, [[0, 0], [0.26, 0], [0.7, PI * 2], [1, PI * 2]]);
    const wob = Math.sin(u * 70) * L.kf(u, [[0.2, 0], [0.25, 1], [0.84, 1], [0.88, 0]]);
    P[L.PX + 1] += -0.12 * crouch + 0.14 * hop; P[L.PX + 2] -= 0.04 * wide;
    L.A(P, 'pelvis', -0.1 * wide, spin, 0);
    L.A(P, 'spine', -0.18 * wide, 0.05 * wob, 0); L.A(P, 'chest', -0.12 * wide + 0.02 * wob, 0, 0.03 * wob);
    L.A(P, 'neck', -0.2 * wide, 0, 0); L.A(P, 'head', 0.1 * wide, 0, 0.1 * wob);
    guns(P, ctx, { pitch: L.lerp(-0.4, 0.05, wide) + 0.06 * wob, spread: L.lerp(0.2, 1.15, wide) + 0.1 * wob, lx: 0.2 * wide, rx: -0.2 * wide, ly: 0.18 * wide, ry: 0.18 * wide, lz: 0.02 * wide, rz: 0.02 * wide, outL: 0.5 + 0.6 * wide, outR: 0.5 + 0.6 * wide, rollL: 0.4 * wide, rollR: 0.4 * wide });
    // feet follow the spin; tucked during the hop
    const c = Math.cos(spin), s = Math.sin(spin), fx = D.hipX * 1.3 * (1 + 0.15 * crouch), tuck = 0.12 * hop;
    for (const [sd, x, z] of [['L', fx, 0.08], ['R', -fx, -0.08]]) L.legIK(P, ctx, sd, x * c + z * s, D.ankle + tuck + 0.14 * hop, -x * s + z * c, 0.3 * hop);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [0.4, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.06 * k;
    L.A(P, 'spine', -0.2 * k, 0.15 * k * d, 0.08 * k * d); L.A(P, 'chest', -0.2 * k, 0.1 * k * d, 0);
    L.A(P, 'head', -0.35 * k, -0.25 * k * d, 0.25 * k * d);
    guns(P, ctx, { pitch: -0.55 + 0.6 * k, spread: 0.3 + 0.4 * k, ly: 0.08 * k, ry: 0.08 * k, lx: 0.06 * k, rx: -0.06 * k });
    L.plant(P, ctx, 0.06, -0.1, 1.0);
  },
  die(P, u, ctx, L) {
    // spun half round by the hit, guns flung wide, drops to its knees, then pitches face-first (down 0.7)
    stance(P, ctx, ctx.t);
    const X = L.PX;
    const twist = L.kf(u, [[0, 0], [0.18, -1.1], [0.32, -0.8], [1, -0.85]]);
    const kneel = L.kf(u, [[0, 0], [0.12, 0.15], [0.4, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.42, 0.1], [0.68, 1.3], [0.74, 1.18], [0.8, 1.26], [1, 1.24]]);
    const drop = L.kf(u, [[0, 0], [0.4, -0.3], [0.68, -0.5], [0.74, -0.47], [1, -0.5]]);
    P[X + 1] += drop; P[X + 2] += 0.28 * L.kf(u, [[0.4, 0], [0.7, 1]]);
    L.A(P, 'pelvis', fall, twist, 0);
    L.A(P, 'spine', 0.12 * kneel - 0.2 * L.kf(u, [[0, 0], [0.15, 1], [0.35, 0]]), 0, 0.1 * kneel);
    L.A(P, 'head', -0.35 * L.kf(u, [[0, 0], [0.15, 1], [0.4, 0]]) + 0.3 * kneel, 0.4 * kneel, 0);
    const g = L.kf(u, [[0, 0], [0.18, 1], [1, 1]]);
    guns(P, ctx, { pitch: -0.55 - 0.5 * g, spread: 0.25 + 0.9 * g, ly: 0.05 * g, ry: 0.05 * g, lx: 0.12 * g, rx: -0.12 * g, outL: 1.2, outR: 1.2 });
    const lie = L.kf(u, [[0.42, 0], [0.72, 1]]);
    if (lie < 1) L.plant(P, ctx, 0.12 * kneel + 0.05, -0.24 * kneel - 0.05, 1.15, 0, 0.6 * kneel);
    if (lie > 0) for (const s of ['L', 'R']) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      P[i] = L.lerp(P[i], -0.2 - fall * 0.2, lie); P[i + 2] = L.lerp(P[i + 2], (s === 'L' ? 1 : -1) * 0.14, lie);
      P[j] = L.lerp(P[j], s === 'L' ? 0.4 : 0.9, lie); P[f] = L.lerp(P[f], 0.8, lie);
    }
  },
  victory(P, t, ctx, L) {
    // fires both guns into the air in turn, bouncing on the beat
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.4)), b2 = Math.abs(Math.sin(t * PI * 1.6));
    const pl = Math.max(0, Math.sin(t * PI * 3.2)) ** 6, pr = Math.max(0, Math.sin(t * PI * 3.2 + PI)) ** 6;
    P[L.PX + 1] += 0.035 * b2 * k;
    L.A(P, 'spine', -0.18 * k, 0, 0); L.A(P, 'chest', -0.15 * k, 0, 0.06 * Math.sin(t * PI * 1.6)); L.A(P, 'neck', -0.3 * k, 0, 0); L.A(P, 'head', -0.1 * k, 0, 0);
    guns(P, ctx, { pitch: L.lerp(-0.55, 1.25, k), spread: 0.35, pitchL: 0.12 * pl, pitchR: 0.12 * pr, ly: 0.36 * k - 0.03 * pl, ry: 0.36 * k - 0.03 * pr, lx: 0.06 * k, rx: -0.06 * k, lz: -0.04 * k, rz: -0.04 * k, outL: 0.8, outR: 0.8 });
    L.plant(P, ctx, 0.1, -0.08, 1.1);
  },
  deploy(P, u, ctx, L) {
    // three-point landing (0.4) with guns crossed, pops up, twirls both SMGs (0.7) and levels them (ready 0.85)
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.6, 0.9], [0.8, 0], [1, 0]]);
    const cross = L.kf(u, [[0, 1], [0.6, 1], [0.7, 0]]);
    const tw = L.kf(u, [[0.66, 0], [0.84, 1]]);
    P[L.PX + 1] -= 0.22 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0); L.A(P, 'head', -0.2 * land, 0, 0);
    guns(P, ctx, { pitch: L.lerp(-0.4, 0.9, cross), spread: L.lerp(0.15, -0.9, cross), lx: -0.12 * cross, rx: 0.12 * cross, ly: 0.18 * cross, ry: 0.2 * cross, lz: -0.04 * cross, rz: -0.02 * cross });
    if (tw > 0 && tw < 1) { L.A(P, 'handL', tw * PI * 2, 0, 0); L.A(P, 'handR', tw * PI * 2, 0, 0); }
    L.plant(P, ctx, 0.2 * land + 0.06, -0.24 * land - 0.06, 1 + 0.4 * land, 0, 0.4 * land);
  },
};

// mag offset along the hand's -y... in hand space the mag well axis is local -z (gun down); drop distance per action
function magDrop(name, u) {
  if (name !== 'cast') return 0;
  return kf(u, [[0, 0], [0.28, 0], [0.36, 0.5], [0.46, 0.5], [0.47, 0.18], [0.55, 0], [1, 0]]);
}

export default {
  id: 'rattler', name: 'RATTLER', role: 'archer', faction: 'rogue', rarity: 'common', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.2, radius: 0.42, walkSpeed: 1.25, cadence: 1.15, scheme: 'dark',
  style: { ...STYLE, freeHand: [] },
  // black jacket + hazard-orange hood/guards, yellow tags; other factions swap the hood colour
  paint: {
    rogue: { paint: 0xf2560a, accent: 0x1c1b20, trim: 0xf2c418 },
    corporate: { paint: 0x2f6fe0, accent: 0x1a1f2a, trim: 0xe8eef5 },
    experimental: { paint: 0x7a3ae0, accent: 0x1a1426, trim: 0xd8c0ff },
  },
  mats: {
    all: {
      paint: { rough: 0.6, coat: 0.12, metal: 0.05 }, accent: { rough: 0.7, metal: 0.1, coat: 0.05, panel: { groove: 0.2 } },
      metal: { color: 0x7d838e, metal: 0.85, rough: 0.36, panel: { groove: 0.12, scale: 9 } }, trim: { rough: 0.45, metal: 0.3 },
    },
    // keep the hazard orange vivid even on battered R0 primer (the hood is the read-shape)
    rogue: { paint: { color: 0xf2560a } },
  },
  sockets: {
    muzzle: ['handR', HG([0, GUN.y + 0.005, GUN.L + 0.03])], muzzleL: ['handL', HG([0, GUN.y + 0.005, GUN.L + 0.03])],
    core: [0, 0.04, 0.12], head: [0, 0.02, 0.1], hand: ['handR', HG([0, GUN.y, GUN.L])], handL: ['handL', HG([0, GUN.y, GUN.L])],
  },
  events: {
    attack: ATK.map((u) => ['fire', u]),
    attack_alt: ALT.map((u) => ['fire', u]),
    cast: [['cast', 0.55]],
    overdrive: [['cast', 0.05], ...OD.map((u) => ['fire', u])],
    die: [['down', 0.7]],
  },
  durs: { attack: 0.8, attack_alt: 1.0, cast: 1.1, overdrive: 2.6, die: 1.7 },
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, d = magDrop(st.action, ctx.su ?? 0);
    // the mag well axis in hand space is -z of the gun frame -> hand +y... gun "down" = hand +z? (HG maps gun -y to hand -z)
    for (const bi of [BI.aux2, BI.aux3]) bones[bi].position.set(MAG0[0], MAG0[1], MAG0[2] - 0.2 * d);
    for (const bi of [BI.aux2, BI.aux3]) bones[bi].scale.setScalar(d > 0.45 ? 0.001 : 1);
    if (unit.rank >= 5) { const bb = bones[BI.aux1]; bb.rotation.y = ctx.t * 1.6; bb.position.y = DIMS.aux1[1] + Math.sin(ctx.t * 2.1) * 0.015; }
  },
  fxHints: { projectile: 'smg', muzzleColor: 0xffa040, impact: 'spark', overdrive: 'spray_fan', color: 0xff6a1a },
  build,
};
