// ARBITER, corporate epic mage "Command Node" (sculptor-20). Brief: docs/ROSTER.md `arbiter`. "Middle management, perfected."
// A tall, thin biped in a navy long-coat with white lapel plates and a glowing cyan tie, a tall narrow node head (white slab,
// navy faceplate, one vertical visor strip, twin antennae), long arms, the left hand folded behind its back. Weapon: a staff-like
// command antenna (crossbar, relay dishes, beacon) held upright in the right hand. Signature: a ring of command drones orbiting
// at shoulder height. Directive Pulse = the beacon fires a pulse that relays through the nearest drone (FX). Executive Override =
// staff planted, left arm raised, the drones form a ring overhead and drop orders onto every ally.
// VALUE: `accent` = navy (coat, trousers, faceplate, drone bellies), `paint` = white (lapels, shoulders, shins, head, drones),
// `metal` = dark gunmetal joints + shaft, `trim` = amber-gold markers (tie clip, rings, staff bands), `glow` = cyan (tie, lamps,
// drone halos, holo panels), `eye` = cyan visor + drone lenses.
// Rank tiers (epic default R2): R0 battered: snapped antenna, two drones, short coat, no mantle, bare staff top · R1 three plain
//   drones, navy mantle · R2 (base) staff relay dishes, layered shoulder boards, gold hem + board edges, lapel pins · R3 drones gain
//   light trails + a hardlight orbit ring, glowing coat hem, staff light segments, ear rings glow · R4 holo org-chart panels flanking
//   the head + head fins (silhouette), glowing rotors · R5 four drones, gold staff crown ring, a second outer drone halo.
// Round 6 (robots) sculpt pass: a bigger, darker coat (flared frock skirt, navy mantle + shoulder boards, white only as piping)
// and fewer, larger drones (R0 2 · R1-R4 3 · R5 4) with navy shells and a white equator band, so it reads from the battle camera.
// Rig: biped. aux2 (chest) = the drone ring (spins in tick; rises overhead in the overdrive, falls on death), aux0 (chest) = R4 holo
// panels (bob in tick). The staff is authored in the right hand's idle hold frame (HOLD_FRAME, computed at load).
import { THREE, P, PS, plate, fin, discX, legs, makeRig, poseFrame, LIB, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  thigh: 0.37, shin: 0.39, ankle: 0.08, hipX: 0.09, hipY: -0.04, spine: 0.16, chest: 0.24, neck: 0.12, headOff: 0.04,
  clavX: 0.05, clavY: 0.17, shoulder: 0.14, upArm: 0.31, foreArm: 0.3,
  parents: { aux2: 'chest' },
  aux0: [0, 0.3, -0.12], aux2: [0, 0.2, 0],
};
const DR = 0.56;            // drone orbit radius
const droneCount = (rk) => (rk >= 5 ? 4 : rk === 0 ? 2 : 3);
const droneAngle = (i, n) => (i / n) * PI * 2 + 0.3;
const OD_REL = 0.167;
const STAFF_UP = 0.98, STAFF_DN = 0.9;   // staff extent above / below the grip

// ---------- hold pose for the staff (right hand, idle) ----------
const RIG = makeRig(DIMS);
const RCTX = { D: RIG.D, rig: RIG };
const GRIP_T = [-0.27, 0.9, 0.1];
const _t = new THREE.Vector3();
const HOLD_P = new Float32Array(L.NCH);
const HCTX = { D: RIG.D, rig: RIG, boneIndex: BI, t: 0, style: { weapon: 'none', heavy: 0, stance: 1.0 }, st: { gy: 0, gp: 0, ty: 0, tp: 0, tilt: 0, hitDir: 1 }, move: { v: 0, phase: 0, stride: 0 } };
base(HOLD_P, HCTX, 0);
const HOLD = {};
for (const [n, i] of Object.entries(BI)) HOLD[n] = [HOLD_P[i * 3], HOLD_P[i * 3 + 1], HOLD_P[i * 3 + 2]];
const HOLD_FRAME = poseFrame(RIG, HOLD, 'handR');
const GRIP = [0, -0.07, 0.01];
function fr(p) { const v = new THREE.Vector3(...p).applyEuler(new THREE.Euler(...HOLD_FRAME, 'XYZ')); return [v.x + GRIP[0], v.y + GRIP[1], v.z + GRIP[2]]; }
const TIP = fr([0, STAFF_UP + 0.02, 0]);

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.016, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.014, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.022, 12), bone, slot, pos, rot);
}
function piston(b, bone, a, c, r = 0.012) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
  const rx = Math.atan2(dz, -dy), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  b.sym(b.cyl(r * 1.4, r * 1.4, len * 0.55, 8), bone, 'metal', [a[0] + dx * 0.27, a[1] + dy * 0.27, a[2] + dz * 0.27], [rx + PI, 0, 0]);
  b.sym(b.cyl(r * 0.65, r * 0.65, len, 6), bone, 'trim', m, [rx + PI, 0, 0]);
}

// ---------- head: the node ----------
function head(b, o) { b.scope([0, 0, 0], [0, 0, 0], 1.2, () => head0(b, o)); }
function head0(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  b.add(b.rbox(0.13, 0.27, 0.15, 0.035), H, 'paint', [0, 0.13, -0.005]);
  b.add(b.cbox(0.105, 0.19, 0.03, 0.01), H, 'accent', [0, 0.125, 0.068]);
  b.add(b.cbox(0.02, 0.15, 0.022, 0.006), H, 'eye', [0, 0.13, 0.082]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.022, 0.008, 0.014, 0.002), H, i < 2 || rk >= 3 ? 'glow' : 'metal', [0.03, 0.08 + i * 0.03, 0.083]);
  // brow chevron + top cap
  b.add(b.ext([[-0.05, 0], [0, -0.022], [0.05, 0], [0.05, 0.014], [0, -0.008], [-0.05, 0.014]], 0.02, 0.003), H, 'trim', [0, 0.235, 0.075], [-0.05, 0, 0]);
  P(b, H, 'accent', [0.12, 0.03, 0.14], [0, 0.272, -0.005], [0, 0, 0], { c: 0.01, tx: 0.85, tz: 0.85 });
  // jaw / chin block, ear discs
  b.add(b.cbox(0.09, 0.05, 0.11, 0.012), H, 'metal', [0, 0.0, 0.01]);
  b.sym(discX(b, 0.04, 0.03, 14), H, 'accent', [0.072, 0.14, -0.01]);
  b.sym(b.tor(0.032, 0.006, 16, 3), H, rk >= 3 ? 'glow' : 'trim', [0.088, 0.14, -0.01], [0, PI / 2, 0]);
  // antennae: twin masts off the ear discs (R0: the right one snapped)
  for (const s of [1, -1]) {
    const broken = rk === 0 && s < 0, len = broken ? 0.06 : 0.2;
    b.add(b.cyl(0.006, 0.008, len, 6), H, 'metal', [s * (0.085 + len * 0.18), 0.17 + len / 2, -0.03], [0, 0, -s * 0.35]);
    if (!broken) b.add(b.sph(8, 6), H, 'glow', [s * (0.085 + len * 0.36), 0.17 + len * 0.95, -0.03], [0, 0, 0], 0.014);
    if (!broken && !far) b.add(b.tor(0.014, 0.004, 10, 3), H, 'trim', [s * (0.085 + len * 0.22), 0.17 + len * 0.6, -0.03], [PI / 2, 0, -s * 0.35]);
  }
  // head greebles: side vents, rear spine, crown bezel
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.012, 0.008, 0.06, 0.002), H, 'metal', [0.066, 0.05 + i * 0.022, -0.02]);
  b.add(b.cbox(0.02, 0.2, 0.03, 0.006), H, 'accent', [0, 0.14, -0.08]);
  if (!far) b.add(b.tor(0.06, 0.006, 4, 3), H, 'trim', [0, 0.262, -0.005], [PI / 2, 0, PI / 4], [1.1, 1.2, 1]);
  // R4: swept head fins (silhouette)
  if (rk >= 4) {
    b.sym(fin(b, [[0, 0], [0.05, 0.0], [-0.12, 0.13], [-0.15, 0.12]], 0.02, 0.004), H, 'paint', [0.066, 0.2, -0.05], [0, PI / 2 + 0.25, 0.05]);
    b.sym(fin(b, [[0.01, 0.005], [0.03, 0.005], [-0.12, 0.12], [-0.13, 0.115]], 0.024, 0.003), H, 'glow', [0.066, 0.2, -0.05], [0, PI / 2 + 0.25, 0.05]);
  }
  b.add(b.cyl(0.035, 0.045, 0.14, 10), 'neck', 'metal', [0, -0.02, 0]);
  if (!far) b.add(b.tor(0.042, 0.006, 14, 3), 'neck', 'trim', [0, -0.05, 0], [PI / 2, 0, 0]);
}

// ---------- torso: long-coat, lapels, the tie ----------
function torso(b, o) {
  const rk = o.rank, far = b.far;
  P(b, 'chest', 'metal', [0.22, 0.24, 0.16], [0, 0.09, -0.01], [0, 0, 0], { c: 0.025 });
  P(b, 'chest', 'accent', [0.42, 0.3, 0.25], [0, 0.1, -0.005], [0.04, 0, 0], { c: 0.04, tx: 1.22, bx: 0.72, bz: 0.85 });
  // white lapel plates forming a V
  PS(b, 'chest', 'paint', [0.13, 0.25, 0.04], [0.08, 0.11, 0.122], [0.06, -0.15, -0.32], { c: 0.012, tx: 1.25, bx: 0.6 });
  // the tie: cyan light, gold clip
  b.add(b.ext([[-0.011, 0], [0.011, 0], [0.017, -0.16], [0, -0.2], [-0.017, -0.16]], 0.02, 0.004), 'chest', 'glow', [0, 0.205, 0.126], [0.1, 0, 0]);
  b.add(b.cbox(0.05, 0.03, 0.022, 0.005), 'chest', 'trim', [0, 0.215, 0.126], [0.1, 0, 0]);
  b.add(b.cbox(0.045, 0.01, 0.024, 0.003), 'chest', 'trim', [0, 0.11, 0.124], [0.12, 0, 0]);
  // collar: tall white stand-up collar behind the neck
  b.add(b.tor(0.075, 0.018, 20, 5, PI * 1.25), 'chest', 'paint', [0, 0.235, -0.0], [PI / 2 + 0.25, 0, PI * 0.5 - PI * 0.625]);
  if (rk >= 2 && !far) {
    // lapel pins (badge + rank bars)
    b.add(b.cyl(0.018, 0.018, 0.012, 6), 'chest', 'trim', [0.085, 0.16, 0.122], [PI / 2 - 0.1, 0, 0]);
    b.add(b.cyl(0.01, 0.01, 0.014, 6), 'chest', 'glow', [0.085, 0.16, 0.126], [PI / 2 - 0.1, 0, 0]);
    for (let i = 0; i < 3; i++) b.add(b.cbox(0.03, 0.006, 0.01, 0.002), 'chest', i ? 'trim' : 'glow', [-0.085, 0.17 - i * 0.012, 0.12]);
  }
  // back: comms pack with a grille, the drone uplink
  P(b, 'chest', 'accent', [0.2, 0.2, 0.08], [0, 0.1, -0.11], [0, 0, 0], { c: 0.02, tx: 0.85 });
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.14, 0.01, 0.02, 0.003), 'chest', 'metal', [0, 0.04 + i * 0.03, -0.155]);
  lamp(b, 'chest', [0.065, 0.17, -0.155], [PI / 2, 0, 0], 0.012);
  b.add(b.cyl(0.006, 0.006, 0.18, 6), 'chest', 'metal', [0.07, 0.29, -0.13]);
  b.add(b.sph(6, 5), 'chest', 'glow', [0.07, 0.385, -0.13], [0, 0, 0], 0.012);
  // coat front: buttons, a pocket square, piping along the lapels
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.011, 0.011, 0.012, 10), 'chest', 'trim', [0.045, 0.02 + i * 0.045, 0.118], [PI / 2 + 0.08, 0, 0]);
  b.add(b.cbox(0.04, 0.025, 0.012, 0.004), 'chest', 'paint', [-0.085, 0.12, 0.118], [0.06, 0, 0.15]);
  if (!far) PS(b, 'chest', 'glow', [0.006, 0.2, 0.01], [0.115, 0.1, 0.105], [0.06, -0.15, -0.32]);
  // back: antenna array off the comms pack, cables to the head
  if (rk >= 1) for (const [x, h] of [[-0.06, 0.12], [0.0, 0.2], [0.04, 0.09]]) {
    b.add(b.cyl(0.004, 0.006, h, 6), 'chest', 'metal', [x, 0.22 + h / 2, -0.15]);
    b.add(b.sph(6, 5), 'chest', x === 0 ? 'eye' : 'glow', [x, 0.22 + h, -0.15], [0, 0, 0], 0.009);
  }
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.06, 0.18, -0.15], [s * 0.07, 0.26, -0.12], [s * 0.05, 0.31, -0.07]], 0.008, 10, 5), 'chest', 'metal');
  if (rk >= 2) {
    b.add(b.sph(12, 6, 0, PI * 2, 0, PI * 0.45), 'chest', 'paint', [-0.06, 0.18, -0.17], [-PI / 2 - 0.4, 0, 0], [0.05, 0.03, 0.05]);
    b.add(b.cyl(0.003, 0.003, 0.05, 4), 'chest', 'metal', [-0.06, 0.2, -0.2], [-0.4 - PI / 2, 0, 0]);
  }
  // waist: belt with a buckle
  b.add(b.cyl(0.095, 0.11, 0.26, 12), 'spine', 'metal', [0, 0.11, 0]);
  P(b, 'spine', 'accent', [0.24, 0.14, 0.17], [0, 0.13, 0.0], [0, 0, 0], { c: 0.03, tx: 1.15, bx: 0.95 });
  b.add(b.cyl(0.115, 0.12, 0.05, 14), 'spine', 'accent', [0, -0.01, 0]);
  b.add(b.cbox(0.05, 0.035, 0.02, 0.006), 'spine', 'trim', [0, -0.01, 0.12]);
  if (!far) PS(b, 'spine', 'metal', [0.05, 0.06, 0.04], [0.1, -0.02, 0.07], [0, -0.5, 0], { c: 0.008 });
  if (!b.far) for (let i = 0; i < 3; i++) PS(b, 'spine', 'paint', [0.05, 0.02, 0.03], [0.07, 0.08 + i * 0.035, 0.085], [0.05, 0.2, 0], { c: 0.006 });
  // abdomen between the hips and the waist joint
  b.add(b.cyl(0.1, 0.115, 0.2, 12), 'pelvis', 'metal', [0, 0.08, 0]);
  P(b, 'pelvis', 'accent', [0.2, 0.12, 0.15], [0, 0.1, 0.01], [0, 0, 0], { c: 0.025, tx: 1.1 });
  if (!far) for (let i = 0; i < 2; i++) b.add(b.cbox(0.12, 0.012, 0.02, 0.003), 'pelvis', 'metal', [0, 0.07 + i * 0.04, 0.085]);
  // hips + coat skirt (front panels) + the long coat tails behind (to the knee)
  P(b, 'pelvis', 'accent', [0.26, 0.12, 0.2], [0, -0.01, 0], [0, 0, 0], { c: 0.03, bx: 0.9 });
  PS(b, 'pelvis', 'accent', [0.11, 0.26, 0.03], [0.08, -0.12, 0.11], [-0.12, 0.1, 0.06], { c: 0.01, bx: 1.1 });
  PS(b, 'pelvis', 'paint', [0.014, 0.24, 0.032], [0.028, -0.12, 0.125], [-0.12, 0.1, 0.06], { c: 0.003 });
  // the frock coat: a flared lathe skirt from the waist to below the knee, open at the front (R0 ragged-short)
  const hemY = rk === 0 ? -0.4 : -0.52, gap = 1.25;
  const outer = [[0.17, 0.08], [0.195, -0.02], [0.22, -0.18], [0.245, -0.36], [0.27, hemY]];
  const shellPts = [...outer, [0.255, hemY], ...outer.slice(0, -1).reverse().map(([r, y]) => [r - 0.016, y])];
  b.add(b.lathe(shellPts.reverse(), 28, gap / 2, PI * 2 - gap), 'pelvis', 'accent', [0, 0, -0.01], [0, 0, 0], [1, 1, 0.92]);
  // white piping down both front edges + a hem band (gold R2+, light strip R3+)
  for (const s of [1, -1]) {
    const a = s * gap / 2;
    b.add(b.tube(outer.map(([r, y]) => [Math.sin(a) * (r + 0.004), y, Math.cos(a) * (r + 0.004) * 0.92 - 0.01]), 0.009, 12, 5), 'pelvis', 'paint');
  }
  b.add(b.tor(0.272, 0.011, 28, 4, PI * 2 - gap), 'pelvis', rk >= 2 ? 'trim' : 'metal', [0, hemY + 0.012, -0.01], [PI / 2, 0, PI / 2 - (PI - gap / 2) + PI], [1, 0.92, 1]);
  if (rk >= 3) b.add(b.tor(0.274, 0.006, 28, 3, PI * 2 - gap), 'pelvis', 'glow', [0, hemY + 0.035, -0.01], [PI / 2, 0, PI / 2 - (PI - gap / 2) + PI], [1, 0.92, 1]);
  // back vent seam + two tail buttons
  if (!far) {
    b.add(b.cbox(0.012, 0.3, 0.02, 0.004), 'pelvis', 'metal', [0, hemY + 0.16, -0.26]);
    for (const s of [1, -1]) b.add(b.cyl(0.014, 0.014, 0.012, 10), 'pelvis', 'trim', [s * 0.05, 0.0, -0.215], [PI / 2, 0, 0]);
  }
  if (rk >= 3) {
    PS(b, 'pelvis', 'glow', [0.092, 0.01, 0.034], [0.075, -0.205, 0.11], [-0.12, 0.1, 0.06], { c: 0.003 });
    b.add(b.cyl(0.03, 0.03, 0.012, 6), 'chest', 'glow', [-0.09, 0.07, 0.137], [PI / 2 + 0.06, 0, 0]);
  }
  PS(b, 'pelvis', 'accent', [0.05, 0.2, 0.15], [0.13, -0.08, -0.01], [0, 0, 0.12], { c: 0.01 });
}

// ---------- arms: suit shoulders, long sleeves, slender hands ----------
function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  b.sym(b.cyl(0.032, 0.032, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.05);
  // squared shoulder boards (white) over a navy cap; R2 adds the layered board + gold edge
  const S = D.shoulder;
  PS(b, 'clav', 'accent', [0.2, 0.11, 0.21], [S + 0.01, 0.03, 0], [0, 0, -0.15], { c: 0.02, tx: 0.85 });
  // squared navy shoulder boards, white piping on the outer edge (R2: layered board + gold edge)
  PS(b, 'clav', 'accent', [0.25, 0.05, 0.25], [S + 0.03, 0.095, 0], [0, 0, -0.2], { c: 0.014 });
  PS(b, 'clav', 'paint', [0.02, 0.055, 0.255], [S + 0.155, 0.07, 0], [0, 0, -0.2], { c: 0.006 });
  lamp(b, 'clav', [S + 0.09, 0.115, 0.1], [0, 0, -0.2 - PI / 2], 0.013, 'glow');
  if (rk >= 2) {
    PS(b, 'clav', 'accent', [0.04, 0.14, 0.24], [S + 0.15, 0.0, 0], [0, 0, -0.25], { c: 0.008 });
    PS(b, 'clav', 'trim', [0.24, 0.014, 0.022], [S + 0.03, 0.115, 0.118], [0, 0, -0.2], { c: 0.004 });
  }
  if (rk >= 1) {
    // navy mantle capelet over the shoulders and upper back (the big read-shape from the battle camera), white collar piping
    P(b, 'chest', 'accent', [0.56, 0.06, 0.32], [0, 0.275, -0.03], [-0.12, 0, 0], { c: 0.024, tx: 0.72, bx: 1.0, tz: 0.8 });
    P(b, 'chest', 'accent', [0.52, 0.24, 0.045], [0, 0.16, -0.175], [0.18, 0, 0], { c: 0.014, tx: 1.05, bx: 0.78 });
    P(b, 'chest', 'paint', [0.5, 0.016, 0.05], [0, 0.045, -0.2], [0.18, 0, 0], { c: 0.005 });
    if (rk >= 2) P(b, 'chest', 'trim', [0.4, 0.012, 0.05], [0, 0.03, -0.205], [0.18, 0, 0], { c: 0.004 });
  }
  b.sym(b.cyl(0.046, 0.052, ua * 0.92, 12), 'upArm', 'accent', [0, -ua * 0.5, 0]);
  piston(b, 'upArm', [0.0, -ua * 0.25, -0.045], [0.0, -ua * 0.95, -0.04], 0.009);
  b.sym(discX(b, 0.04, 0.09, 12), 'foreArm', 'metal', [0, 0, 0]);
  PS(b, 'foreArm', 'paint', [0.07, 0.06, 0.06], [0, 0.0, -0.035], [0, 0, 0], { c: 0.014 });
  PS(b, 'foreArm', 'paint', [0.09, fa * 0.74, 0.09], [0, -fa * 0.5, 0], [0, 0, 0], { c: 0.018, tx: 1.1, tz: 1.1, bx: 0.85, bz: 0.85 });
  PS(b, 'foreArm', 'accent', [0.08, 0.03, 0.08], [0, -fa * 0.9, 0], [0, 0, 0], { c: 0.008 });
  PS(b, 'foreArm', 'glow', [0.012, fa * 0.4, 0.012], [0.035, -fa * 0.5, 0.03], [0, 0, 0]);
  // left wrist: holo quota display
  b.add(b.cbox(0.012, 0.06, 0.05, 0.003), 'foreArmL', 'eye', [0.043, -fa * 0.7, 0.0]);
  // hands: slender, long fingers
  b.sym(b.cbox(0.045, 0.07, 0.06, 0.012), 'hand', 'metal', [0, -0.035, 0]);
  b.sym(b.cbox(0.048, 0.035, 0.035, 0.006), 'hand', 'paint', [0, -0.03, -0.018]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.011, 0.075, 0.012, 0.003), 'hand', 'metal', [-0.014 + i * 0.014, -0.1, 0.006], [0.25, 0, 0]);
}

// ---------- the command antenna (right hand, authored upright in the idle hold frame) ----------
function staff(b, o) {
  const rk = o.rank, far = b.far, H = 'handR';
  b.scope(GRIP, HOLD_FRAME, 1, () => {
    b.add(b.cyl(0.013, 0.013, STAFF_UP + STAFF_DN, 10), H, 'metal', [0, (STAFF_UP - STAFF_DN) / 2, 0]);
    b.add(b.cyl(0.022, 0.022, 0.16, 10), H, 'accent', [0, 0, 0]);
    for (const [y0, y1] of [[0.25, 0.62], [-0.62, -0.25]]) {
      b.add(b.cyl(0.021, 0.021, y1 - y0, 10), H, 'paint', [0, (y0 + y1) / 2, 0]);
      b.add(b.cyl(0.025, 0.025, 0.018, 10), H, 'trim', [0, y0, 0]);
      b.add(b.cyl(0.025, 0.025, 0.018, 10), H, 'trim', [0, y1, 0]);
      if (rk >= 3) b.add(b.cbox(0.008, (y1 - y0) * 0.8, 0.044, 0.002), H, 'glow', [0, (y0 + y1) / 2, 0]);
    }
    b.add(b.cyl(0.03, 0.006, 0.08, 8), H, 'trim', [0, -STAFF_DN - 0.03, 0]);
    if (!far) { const hel = []; for (let i = 0; i <= 24; i++) { const a = i * 0.9, y = -0.2 + i * 0.017; hel.push([Math.cos(a) * 0.022, y, Math.sin(a) * 0.022]); } b.add(b.tube(hel, 0.0045, 48, 4), H, rk >= 3 ? 'glow' : 'trim'); }
    // top: crossbar, relay dishes (R2+), beacon + ring, spike
    const T = STAFF_UP;
    b.add(b.cyl(0.03, 0.022, 0.06, 10), H, 'paint', [0, T - 0.16, 0]);
    b.add(b.cbox(0.26, 0.022, 0.024, 0.006), H, 'metal', [0, T - 0.1, 0]);
    for (const s of [1, -1]) {
      b.add(b.cbox(0.02, 0.07, 0.02, 0.005), H, 'paint', [s * 0.12, T - 0.08, 0]);
      if (rk >= 2) {
        b.add(b.sph(12, 6, 0, PI * 2, 0, PI * 0.42), H, 'trim', [s * 0.15, T - 0.055, 0], [0, 0, s * PI / 2], [0.05, 0.03, 0.05]);
        b.add(b.cyl(0.003, 0.003, 0.05, 4), H, 'metal', [s * 0.17, T - 0.055, 0], [0, 0, PI / 2]);
      }
      if (!far) b.add(b.sph(6, 5), H, 'glow', [s * 0.12, T - 0.04, 0], [0, 0, 0], 0.011);
    }
    if (rk >= 1) {
      b.add(b.sph(14, 10), H, 'glow', [0, T, 0], [0, 0, 0], 0.045);
      b.add(b.tor(0.07, 0.007, 28, 4), H, rk >= 5 ? 'trim' : 'glow', [0, T, 0], [0.4, 0, 0]);
      if (rk >= 5) b.add(b.tor(0.095, 0.006, 32, 4), H, 'glow', [0, T, 0], [-0.5, 0.6, 0]);
    } else b.add(b.cbox(0.05, 0.05, 0.05, 0.01), H, 'metal', [0, T - 0.02, 0]);
    b.add(b.cyl(0.004, 0.008, 0.14, 6), H, 'trim', [0, T + 0.1, 0]);
    b.add(b.sph(6, 5), H, 'eye', [0, T + 0.175, 0], [0, 0, 0], 0.01);
  });
}

// ---------- drones (aux2 ring) ----------
function droneAt(b, o, a, k = 1, outer = false) {
  const rk = o.rank, far = b.far, H = 'aux2', R = outer ? DR + 0.2 : DR;
  const d = [Math.cos(a), 0, Math.sin(a)];
  // face along the orbit tangent of travel (decreasing angle) so the lens leads
  const yaw = Math.atan2(Math.sin(a), -Math.cos(a));
  b.scope([d[0] * R, outer ? 0.12 : 0, d[2] * R], [0, yaw, 0], k * (rk >= 3 ? 2.05 : rk >= 2 ? 1.95 : 1.85), () => {
    // navy shell (top), white equator band, dark belly; one cyan lamp on top + the lens in front
    b.add(b.sph(18, 12, 0, PI * 2, 0, PI * 0.5), H, 'accent', [0, 0, 0], [0, 0, 0], [0.062, 0.05, 0.077]);
    b.add(b.sph(16, 8, 0, PI * 2, PI * 0.5, PI * 0.5), H, 'metal', [0, 0.0, 0], [0, 0, 0], [0.062, 0.036, 0.077]);
    b.add(b.tor(1, 0.13, 24, 4), H, 'paint', [0, 0.0, 0], [PI / 2, 0, 0], [0.064, 0.077, 0.075]);
    b.add(b.cyl(0.024, 0.024, 0.022, 12), H, 'eye', [0, 0.008, 0.07], [PI / 2, 0, 0]);
    b.add(b.tor(0.028, 0.005, 12, 3), H, 'trim', [0, 0.008, 0.079]);
    b.add(b.cyl(0.01, 0.013, 0.012, 10), H, 'glow', [0, 0.05, -0.005]);
    // stub rotors (dark; glowing only at R4+)
    for (const s of [1, -1]) {
      b.add(b.cbox(0.045, 0.012, 0.016, 0.003), H, 'metal', [s * 0.078, 0.008, -0.012]);
      b.add(b.cyl(0.03, 0.03, 0.008, 12), H, rk >= 4 ? 'glow' : 'metal', [s * 0.108, 0.014, -0.012]);
    }
    if (!far) for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.035, 0.0], [0.0, 0.04]], 0.007, 0.002), H, 'accent', [s * 0.028, 0.02, -0.074], [0, s * 0.3, 0]);
    b.add(b.cyl(0.018, 0.024, 0.016, 10), H, 'metal', [0, -0.04, 0]);
    b.add(b.cyl(0.014, 0.014, 0.006, 10), H, 'glow', [0, -0.049, 0]);
  });
  // R3+: light trail behind (arcs at larger angles; the ring spins toward decreasing angle)
  if (rk >= 3) {
    const segs = far ? 2 : 3;
    for (let j = 0; j < segs; j++) {
      const st = a + 0.2 + j * 0.15;
      b.scope([0, outer ? 0.12 : 0, 0], [0, -st, 0], 1, () => b.add(b.tor(R, 0.016 - j * 0.004, 5, 3, 0.15), H, 'glow', [0, 0, 0], [PI / 2, 0, 0]));
    }
  }
}
function drones(b, o) {
  const rk = o.rank, n = droneCount(rk);
  for (let i = 0; i < n; i++) droneAt(b, o, droneAngle(i, n));
  // R3+: a hardlight orbit ring the drones ride on (reads as an ellipse from the battle camera)
  if (rk >= 3) b.add(b.tor(DR, 0.007, 64, 3), 'aux2', 'glow', [0, -0.01, 0], [PI / 2, 0, 0]);
  if (rk >= 5) b.add(b.tor(DR + 0.2, 0.005, 64, 3), 'aux2', 'glow', [0, 0.11, 0], [PI / 2, 0, 0]);
}

// ---------- R4 holo org-chart panels (aux0) ----------
function orgChart(b, o) {
  if (o.rank < 4) return;
  const H = 'aux0', far = b.far;
  const box = (x, y, w, h, t = 0.006) => {
    b.add(b.box(w, t, t), H, 'glow', [x, y + h / 2, 0]); b.add(b.box(w, t, t), H, 'glow', [x, y - h / 2, 0]);
    b.add(b.box(t, h, t), H, 'glow', [x - w / 2, y, 0]); b.add(b.box(t, h, t), H, 'glow', [x + w / 2, y, 0]);
  };
  for (const s of [1, -1]) {
    b.scope([s * 0.32, 0.06, 0.04], [-0.35, s * 0.55, 0], 1, () => {
      box(0, 0, 0.3, 0.24, 0.008);
      box(0, 0.06, 0.07, 0.04);
      if (!far) {
        b.add(b.box(0.005, 0.04, 0.005), H, 'glow', [0, 0.02, 0]);
        b.add(b.box(0.17, 0.005, 0.005), H, 'glow', [0, 0.0, 0]);
        for (const x of [-0.085, 0, 0.085]) { b.add(b.box(0.005, 0.03, 0.005), H, 'glow', [x, -0.015, 0]); box(x, -0.05, 0.05, 0.035); }
        b.add(b.box(0.26, 0.005, 0.004), H, 'eye', [0, 0.1, 0]);
      }
    });
  }
}

function build(b, o) {
  head(b, o); torso(b, o); arms(b, o);
  legs(b, o, { w: 0.9, knee: 'cap', shin: 'slim', foot: 'point', thighSlot: 'accent', shellSlot: 'accent', shinPlateSlot: 'accent', kneeSlot: 'metal', footSlot: 'accent', outerSlot: 'metal', heelSlot: 'metal' });
  const D = b.rig.D;
  piston(b, 'thigh', [0.0, -D.thigh * 0.25, -0.07], [0.0, -D.thigh * 0.95, -0.06], 0.01);
  if (!b.far) {
    PS(b, 'thigh', 'paint', [0.012, D.thigh * 0.5, 0.11], [0.085, -D.thigh * 0.45, 0.01], [0, 0, 0.04], { c: 0.003 });
    PS(b, 'shin', 'glow', [0.01, D.shin * 0.3, 0.01], [0.0, -D.shin * 0.35, 0.12], [0.12, 0, 0]);
    PS(b, 'shin', 'metal', [0.05, 0.03, 0.05], [0.0, -D.shin * 0.82, 0.09], [0, 0, 0], { c: 0.008 });
  }
  staff(b, o); drones(b, o); orgChart(b, o);
}

// ---------- anims ----------
function arm(P, ctx, s, x, y, z, w = 1, out = 0.3) {
  if (w <= 0.001) return;
  const P0 = w < 1 ? P.slice() : null;
  L.armIK(P, ctx, s, _t.set(x, y, z), out);
  if (P0) for (const n of ['clav', 'upArm', 'foreArm', 'hand']) { const i = BI[n + s] * 3; for (let c = 0; c < 3; c++) P[i + c] = L.lerp(P0[i + c], P[i + c], w); }
}
function base(P, ctx, t) {
  L.idle(P, ctx, t);
  L.A(P, 'spine', -0.04, 0, 0); L.A(P, 'chest', -0.05, 0, 0); L.A(P, 'neck', 0.04, 0, 0);
  const br = Math.sin(t * 1.4) * 0.008;
  arm(P, ctx, 'R', GRIP_T[0], GRIP_T[1] + br, GRIP_T[2], 1, 0.35);
  L.RS(P, 'hand', 'R', 0, 0, 0);
  // left hand folded behind the back
  arm(P, ctx, 'L', 0.06, 0.98 + br, -0.17, 1, 0.6);
  L.RS(P, 'hand', 'L', 0.3, 0, 0.2);
  L.plant(P, ctx, 0.05, -0.05, 1.05);
}

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~8 s: checks the quota display on its left wrist
    const c = t % 8.4, k = L.kf(c, [[0, 0], [5.0, 0], [5.4, 1], [6.8, 1], [7.3, 0]]);
    if (k > 0) {
      arm(P, ctx, 'L', 0.12, 1.2, 0.25, k, 0.5);
      L.AS(P, 'hand', 'L', 0, 0, -0.9 * k);
      L.A(P, 'neck', 0.15 * k, 0.15 * k, 0); L.A(P, 'head', 0.2 * k, 0.2 * k, 0);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    const ph = ctx.move.phase * PI * 2, sw = Math.sin(ph) * 0.04;
    L.A(P, 'chest', -0.04, 0, 0);
    arm(P, ctx, 'R', GRIP_T[0], GRIP_T[1] + 0.03 + Math.abs(sw), GRIP_T[2] + sw * 2, 1, 0.35);
    L.RS(P, 'hand', 'R', -0.15 + sw * 2, 0, 0);
    arm(P, ctx, 'L', 0.06, 0.98, -0.17, 1, 0.6);
  },
  // DIRECTIVE PULSE (battle basic): lifts the antenna and tips it at the target, the beacon fires (fire 0.42)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.25, 1], [0.7, 1], [0.95, 0]]), tip = L.kf(u, [[0, 0], [0.32, 0], [0.42, 1], [0.6, 0.9], [0.9, 0]]);
    L.A(P, 'chest', 0.03 * tip, 0.12 * w, 0); L.A(P, 'head', 0.05 * tip, -0.1 * w, 0);
    arm(P, ctx, 'R', L.lerp(-0.26, -0.18, tip), L.lerp(1.25, 1.18, tip), L.lerp(0.2, 0.36, tip), w, 0.4);
    L.AS(P, 'hand', 'R', L.lerp(0.95, 2.0, tip) * w, 0, 0);
    L.plant(P, ctx, 0.12 * w, -0.08 * w, 1.15);
  },
  // staff thrust: steps in, levels the antenna like a pointer (fire 0.4)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.2, 1], [0.72, 1], [1, 0]]), th = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.65, 1], [1, 0]]);
    P[L.PX + 2] += 0.08 * th; P[L.PX + 1] -= 0.03 * th;
    L.A(P, 'spine', 0.08 * th, 0.15 * w, 0); L.A(P, 'chest', 0.04 * th, 0.12 * w, 0);
    arm(P, ctx, 'R', L.lerp(-0.25, -0.12, th), L.lerp(1.15, 1.2, th), L.lerp(0.15, 0.5, th), w, 0.35);
    L.AS(P, 'hand', 'R', L.lerp(0.6, 2.3, th) * w, 0, 0);
    L.plant(P, ctx, 0.22 * w, -0.14 * w, 1.25);
  },
  // the delegation: the LEFT hand comes out from behind the back and points (fire 0.45); the drones dart forward (tick)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]), pt = L.kf(u, [[0, 0], [0.35, 0], [0.45, 1], [0.7, 1], [0.9, 0]]);
    L.A(P, 'chest', 0, -0.2 * w, 0); L.A(P, 'head', 0.05 * w, -0.1 * w, 0);
    arm(P, ctx, 'L', L.lerp(0.2, 0.14, pt), L.lerp(1.3, 1.36, pt), L.lerp(0.1, 0.62, pt), w, 0.4);
    L.AS(P, 'hand', 'L', -0.3 * pt, 0, 0);
    L.plant(P, ctx, 0.14 * w, -0.06, 1.1);
  },
  // EXECUTIVE OVERRIDE: lifts the antenna and stamps it on the floor (impact 0.12), the left arm shoots up (release 0.167) and the
  // drones rise into a ring overhead (tick); holds, then lowers the arm and straightens the tie
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const lift = L.kf(u, [[0, 0], [0.08, 1], [0.12, 0]]), st = L.kf(u, [[0.08, 0], [0.12, 1], [0.85, 1], [0.97, 0]]);
    const up = L.kf(u, [[0, 0], [0.1, 0], [OD_REL, 1], [0.78, 1], [0.92, 0]]);
    const tr = Math.sin(u * 70) * 0.012 * L.kf(u, [[0.2, 0], [0.25, 1], [0.7, 1], [0.75, 0]]);
    P[L.PX + 1] += 0.03 * lift - 0.05 * st + 0.04 * up;
    L.A(P, 'spine', -0.06 * up + 0.08 * lift, 0, 0); L.A(P, 'chest', -0.1 * up, 0.15 * st, 0);
    L.A(P, 'neck', -0.08 * up, 0, 0); L.A(P, 'head', -0.18 * up, -0.1 * st, 0);
    // staff: up, then planted forward of the right foot (stays upright)
    arm(P, ctx, 'R', -0.28, L.lerp(1.08, 0.92, st), L.lerp(0.18, 0.3, st), Math.max(lift, st), 0.35);
    L.AS(P, 'hand', 'R', -0.1 * st, 0, 0);
    arm(P, ctx, 'L', 0.18 + tr, 2.08 + tr, 0.12, up, 0.25);
    L.AS(P, 'hand', 'L', 0.6 * up, 0, 0);
    L.plant(P, ctx, 0.08 + 0.08 * st, -0.1 - 0.06 * st, 1.15 + 0.2 * st);
  },
  hit(P, u, ctx) {
    L.hitB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]);
    arm(P, ctx, 'R', GRIP_T[0] - 0.04 * k, GRIP_T[1] + 0.05 * k, GRIP_T[2] - 0.05 * k, 1, 0.35);
    L.AS(P, 'hand', 'R', 0.2 * k, 0, -0.15 * k);
    arm(P, ctx, 'L', 0.2, 1.05, -0.05, k, 0.5);
  },
  // drones drop (tick), the antenna slips, it folds at the knees and topples (down 0.8)
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.15, 1], [0.45, 1], [0.6, 0]]);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.4 * k, 0, 0.15 * k), L.AS(P, 'foreArm', s, -0.4 * k, 0, 0);
  },
  // straightens its tie (left hand to the knot), then raises the antenna; the drones circle faster (tick)
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6)), c = t % 3.2;
    const tie = L.kf(c, [[0, 0], [0.3, 1], [1.1, 1], [1.4, 0], [3.2, 0]]) * k;
    const raise = L.kf(c, [[0, 0], [1.3, 0], [1.7, 1], [2.8, 1], [3.2, 0]]) * k;
    arm(P, ctx, 'L', 0.03, 1.27 + 0.01 * Math.sin(t * 9) * tie, 0.15, tie, 0.5);
    L.AS(P, 'hand', 'L', -1.2 * tie, 0, 0);
    L.A(P, 'head', 0.15 * tie - 0.2 * raise, 0, 0);
    arm(P, ctx, 'R', -0.28, 1.35, 0.12, raise, 0.35);
    L.A(P, 'chest', -0.06 * raise, 0, 0);
  },
  // lands in a crouch with the antenna folded to its chest; the drones pop out of the back pack (tick) as it stands (ready)
  deploy(P, u, ctx) {
    L.deployB(P, u, ctx);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.6, 0.8], [0.85, 0], [1, 0]]);
    arm(P, ctx, 'R', GRIP_T[0], GRIP_T[1] - 0.1 * land, GRIP_T[2], 1, 0.35);
    arm(P, ctx, 'L', 0.12, 1.0, 0.1, land, 0.4);
  },
};

// ---------- drone ring driver ----------
function spinRate(a, u) {
  switch (a) {
    case 'overdrive': return 1.2 + 8 * L.kf(u, [[0.05, 0], [0.17, 1], [0.8, 1], [1, 0]]);
    case 'cast': return 1.2 + 3 * L.kf(u, [[0.1, 0], [0.42, 1], [0.8, 0]]);
    case 'attack_alt': return 1.2 + 5 * L.kf(u, [[0.2, 0], [0.45, 1], [0.8, 0]]);
    case 'deploy': return 1.2 + 10 * L.kf(u, [[0.6, 0], [0.75, 1], [1, 0]]);
    case 'victory': return 2.6;
    case 'die': return 3 * (1 - L.clamp(u / 0.4, 0, 1));
    default: return 1.2;
  }
}
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const CHAIN = ['pelvis', 'spine', 'chest'].map((n) => BI[n]);

export default {
  id: 'arbiter', name: 'ARBITER', role: 'mage', faction: 'corporate', rarity: 'epic', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.78, radius: 0.5, walkSpeed: 1.2, cadence: 0.85, scheme: 'light',
  bodyScale: [1.3, 1.04, 1.24],
  style: { weapon: 'none', heavy: 0, stance: 1.0 },
  paint: {
    corporate: { paint: 0xeef2f8, accent: 0x1c2f66, trim: 0xf2b636 },
    rogue: { paint: 0xe6dfd6, accent: 0x3a1517, trim: 0xff8a2a },
    experimental: { paint: 0xe6e1f3, accent: 0x261a50, trim: 0xd7a2ff },
  },
  mats: {
    all: {
      paint: { rough: 0.24, coat: 1, panel: { groove: 0.15, scale: 2.8 } },
      accent: { rough: 0.36, metal: 0.25, panel: { groove: 0.3, scale: 4.5, rim: 0.22 } },
      metal: { color: 0x2c313b, rough: 0.36, metal: 0.85, panel: { groove: 0.1, scale: 8, rim: 0.2 } },
      trim: { rough: 0.3 },
    },
  },
  sockets: {
    muzzle: ['handR', TIP], hand: ['handR', [0, -0.08, 0.02]], handL: ['handL', [0, -0.11, 0.02]], core: [0, 0.13, 0.13], head: [0, 0.14, 0.09],
    beacon: ['handR', TIP],
    ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => { const a = droneAngle(i % 3, 3); return ['d' + i, ['aux2', [Math.cos(a) * DR, 0, Math.sin(a) * DR]]]; })),
  },
  events: {
    cast: [['fire', 0.42]], attack: [['fire', 0.4]], attack_alt: [['fire', 0.45]],
    overdrive: [['cast', 0.04], ['impact', 0.12], ['fire', OD_REL]], die: [['down', 0.8]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { cast: 1.0, attack: 1.0, attack_alt: 1.1, overdrive: 2.4, hit: 0.42, die: 2.0, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act || (unit.state.dead ? 'die' : unit.state.loop === 'victory' ? 'victory' : null);
    const u = ctx.act ? ctx.au : unit.state.dead ? 1 : 0;
    const t = ctx.t;
    ctx.spin = (ctx.spin || 0) + dt * spinRate(a, u);
    const ring = bones[BI.aux2];
    if (!ctx.dSock) {
      ctx.dSock = true;
      const n = droneCount(unit.rank);
      for (let i = 0; i < 6; i++) { const so = unit.sockets['d' + i], a = droneAngle(i % n, n); so?.position.set(Math.cos(a) * DR, 0, Math.sin(a) * DR); }
    }
    // rest: shoulder height, a slight wobble; driven targets are authored in body (pelvis-parent) space and mapped into the chest
    let y = 0, fwd = 0, tilt = 0.08 * Math.sin(t * 0.7), sc = 1, flat = 0;
    if (a === 'overdrive') {
      const k = L.kf(u, [[0.03, 0], [0.17, 1], [0.82, 1], [0.95, 0]]);
      y = 0.62 * k; sc = 1 + 0.35 * k; flat = k;
    } else if (a === 'attack_alt') {
      const k = L.kf(u, [[0.3, 0], [0.45, 1], [0.65, 1], [0.85, 0]]);
      fwd = 0.25 * k; y = 0.05 * k;
    } else if (a === 'die') {
      const k = L.kf(u, [[0.05, 0], [0.4, 1]]);
      y = -1.12 * k * k; flat = k; sc = 1 + 0.2 * k;
    } else if (a === 'deploy') {
      sc = L.kf(u, [[0, 0.02], [0.62, 0.02], [0.78, 1.1], [0.9, 1]]);
    } else if (a === 'victory') {
      y = 0.08 + 0.03 * Math.sin(t * 2);
    } else if (a === 'hit') {
      tilt += 0.3 * L.kf(u, [[0, 0], [0.12, 1], [1, 0]]) * Math.sin(t * 28);
    }
    // keep the ring level in body space (cancel the chest's rotation) so it orbits, not wobbles with the torso
    _m.identity();
    for (const i of CHAIN) { bones[i].updateMatrix(); _m.multiply(bones[i].matrix); }
    _m.decompose(_v, _q, _s);
    const qi = _q.clone().invert();
    _v.set(DIMS.aux2[0], DIMS.aux2[1] + y, DIMS.aux2[2] + fwd);
    ring.position.copy(_v);
    ring.quaternion.copy(qi).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * (1 - flat), ctx.spin, 0.06 * (1 - flat), 'XYZ')));
    ring.scale.setScalar(Math.max(1e-3, sc));
    if (unit.rank >= 4) bones[BI.aux0].position.set(DIMS.aux0[0], DIMS.aux0[1] + 0.02 * Math.sin(t * 1.6), DIMS.aux0[2]);
  },
  fxHints: { projectile: 'directive_pulse', impact: 'order_stamp', overdrive: 'executive_override', color: 0x2ee6ff },
  build,
};
