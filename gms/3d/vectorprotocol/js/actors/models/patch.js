// PATCH, corporate common mage "Field Medic Drone" (sculptor-6). Brief: docs/ROSTER.md `patch`.
// A beach-ball clinic drone: glossy white upper shell with a red medical cross on a raised cap, mint equator band, dark gunmetal
// belly with a hover thruster, ONE big friendly lens that swivels inside the shell (head bone at the ball centre) under a blinking
// eyelid, four thin articulated repair arms underneath (front pair = arm bones: repair-beam emitter + claw; rear pair = leg bones:
// nanite syringe + scanner), and a glowing holo-cross hologram floating above it so it never gets lost on the board.
// VALUE: white `paint` dominant, mint `accent` bands, dark `metal` belly + arms, red `trim` crosses, mint `glow`, cyan `eye`.
// Rank tiers: R0 battered (dark scrap panel + tape on the top shell, glitching half holo-cross, taped crack, dented belly plate) · R1 base (clean) · R2 extra arm pair (aux2/aux3) + side lamps
//   · R3 rotating holo-cross ring with four orbiting mini-crosses · R4 hardlight stabiliser wings · R5 crown ring of crosses.
// Rarity (o.r): rare+ glowing equator seam · epic+ thruster ring + rear antenna; legendary = kit gold.
// Rig: hover. aux0 -> head (eyelid, blinks in post), aux1 -> pelvis (holo-cross, spins in post, swells in tick),
// aux2/aux3 -> chest (R2 extra arms, swing in post).
import { THREE, P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const BR = 0.29;   // ball radius
const DIMS = {
  hover: 0.6, thigh: 0.15, shin: 0.16, ankle: 0.02, hipX: 0.1, hipY: 0, spine: 0.04, chest: 0.06, neck: 0.1, headOff: 0,
  clavX: 0.06, clavY: -0.05, shoulder: 0.12, upArm: 0.17, foreArm: 0.17,
  offsets: { clavL: [0.06, -0.05, 0.08], thighL: [0.1, 0.0, -0.09] },
  parents: { aux0: 'head', aux1: 'pelvis', aux2: 'chest', aux3: 'chest' },
  aux0: [0, 0, 0], aux1: [0, 0.82, 0], aux2: [0.19, 0.02, -0.12], aux3: [-0.19, 0.02, -0.12],
};
const L = LIB;
const SIDES = ['L', 'R'];
const OD_REL = 0.167;
const C = [0, 0.1, 0];   // ball centre on the chest bone

function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.016, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}
// red cross on a white disc; frame: disc faces +y
function medCross(b, bone, pos, rot, s = 1, disc = true) {
  b.scope(pos, rot, s, () => {
    if (disc) {
      b.add(b.cyl(0.1, 0.105, 0.03, 24), bone, 'paint', [0, 0, 0]);
      b.add(b.tor(0.1, 0.008, 24, 4), bone, 'accent', [0, 0.012, 0], [PI / 2, 0, 0]);
    }
    b.add(b.cbox(0.15, 0.022, 0.048, 0.006), bone, 'trim', [0, 0.016, 0]);
    b.add(b.cbox(0.048, 0.022, 0.15, 0.006), bone, 'trim', [0, 0.016, 0]);
  });
}

function shellParts(b, o) {
  const rk = o.rank, r = o.r, far = b.far;
  // upper white shell + dark belly
  b.add(b.sph(40, 28, 0, PI * 2, 0, PI * 0.56), 'chest', 'paint', C, [0, 0, 0], BR);
  b.add(b.sph(26, 12, 0, PI * 2, PI * 0.56, PI * 0.44), 'chest', 'metal', C, [0, 0, 0], BR * 0.985);
  // mint equator band + lilac-free seam
  b.add(b.tor(BR + 0.004, 0.022, 40, 6), 'chest', 'accent', [C[0], C[1] - 0.05, C[2]], [PI / 2, 0, 0]);
  b.add(b.tor(BR + 0.012, r >= 1 ? 0.008 : 0.005, 40, 3), 'chest', 'glow', [C[0], C[1] - 0.05, C[2]], [PI / 2, 0, 0]);
  // equator bolts + belly grille ribs
  if (!far) for (let i = 0; i < 16; i++) { const a = i * PI / 8 + 0.1; b.add(b.cyl(0.011, 0.011, 0.014, 8), 'chest', 'metal', [Math.cos(a) * (BR + 0.022), C[1] - 0.05, Math.sin(a) * (BR + 0.022)], [0, -a, PI / 2]); }
  if (!far) for (let i = 0; i < 5; i++) b.add(b.tor(BR * (0.82 - i * 0.1), 0.006, 32, 3), 'chest', 'accent', [0, C[1] - BR * (0.58 + i * 0.07), 0], [PI / 2, 0, 0]);
  // raised medical cap on top with the red cross + a tiny holo projector lens
  medCross(b, 'chest', [0, C[1] + BR - 0.006, 0], [0, 0, 0], 1);
  b.add(b.cyl(0.018, 0.022, 0.02, 10), 'chest', 'eye', [0, C[1] + BR + 0.032, -0.06]);
  // side crosses (the camera sees a flank in battle)
  b.scope(C, [0, 0, 0], 1, () => {
    for (const s of [1, -1]) medCross(b, 'chest', [s * BR * 0.9, 0.075, -0.07], [0.27, -s * 0.27, -s * (PI / 2 - 0.36)], 0.6);
  });
  // stabiliser fins (cute ears) at the upper flanks
  b.sym(fin(b, [[0, 0], [0.09, 0.0], [0.16, 0.07], [0.13, 0.1], [0.02, 0.06]], 0.018, 0.005), 'chest', 'paint', [BR * 0.78, C[1] + 0.13, -0.08], [0, -0.55, 0.45]);
  b.sym(fin(b, [[0.03, 0.01], [0.09, 0.01], [0.14, 0.066], [0.12, 0.08]], 0.022, 0.003), 'chest', 'accent', [BR * 0.78, C[1] + 0.13, -0.08], [0, -0.55, 0.45]);
  if (rk >= 4) {
    // R4 hardlight stabiliser wings (silhouette change)
    for (const s of [1, -1]) b.scope([s * (BR * 0.78 + 0.1), C[1] + 0.18, -0.13], [0, s > 0 ? -0.55 : 0.55, s * 0.5], 1, () => {
      b.add(fin(b, [[0, 0], [s * 0.26, 0.04], [s * 0.34, 0.16], [s * 0.12, 0.09]], 0.012, 0.003), 'chest', 'glow', [0, 0, 0]);
      b.add(fin(b, [[0, -0.01], [s * 0.28, 0.025], [s * 0.36, 0.17], [s * 0.34, 0.17], [s * 0.26, 0.05]], 0.016, 0.003), 'chest', 'trim', [0, 0, 0]);
    });
  }
  // belly: thruster ring + glow disc + vents
  b.add(b.cyl(0.11, 0.13, 0.05, 20), 'chest', 'metal', [0, C[1] - BR + 0.01, 0]);
  b.add(b.cyl(0.1, 0.1, 0.012, 20), 'chest', 'glow', [0, C[1] - BR - 0.018, 0]);
  if (r >= 2) b.add(b.tor(0.12, 0.01, 24, 4), 'chest', 'glow', [0, C[1] - BR - 0.005, 0], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) {
    const a = i * PI / 3 + PI / 6;
    b.add(b.cbox(0.05, 0.012, 0.02, 0.004), 'chest', 'accent', [Math.cos(a) * 0.19, C[1] - 0.17, Math.sin(a) * 0.19], [0, -a, -0.75]);
  }
  // back: nanite canister (mint fluid capsule in a white frame) + clamps
  b.add(b.cbox(0.14, 0.17, 0.05, 0.015), 'chest', 'metal', [0, C[1] + 0.02, -BR + 0.02]);
  b.add(b.cyl(0.042, 0.042, 0.16, 14), 'chest', 'glow', [0, C[1] + 0.02, -BR - 0.03]);
  for (const y of [-0.07, 0.0, 0.07]) b.add(b.tor(0.046, 0.009, 14, 4), 'chest', y ? 'paint' : 'accent', [0, C[1] + 0.02 + y, -BR - 0.03], [PI / 2, 0, 0]);
  b.add(b.cyl(0.05, 0.05, 0.02, 14), 'chest', 'paint', [0, C[1] + 0.11, -BR - 0.03]);
  b.add(b.cyl(0.05, 0.05, 0.02, 14), 'chest', 'paint', [0, C[1] - 0.07, -BR - 0.03]);
  if (r >= 2) {
    b.add(b.cyl(0.005, 0.008, 0.22, 5), 'chest', 'metal', [0.06, C[1] + 0.3, -0.14], [-0.4, 0, -0.15]);
    b.add(b.sph(8, 6), 'chest', 'glow', [0.075, C[1] + 0.4, -0.19], [0, 0, 0], 0.016);
  }
  // R2 side lamps
  if (rk >= 2) lamp(b, 'chest', [BR * 0.96, C[1] - 0.03, 0.06], [0, 0, PI / 2], 0.022, 'eye');
  // R0-1 wear: a taped crack on the right flank, a dented belly plate
  if (rk <= 1 && !far) {
    b.add(b.box(0.005, 0.12, 0.006), 'chest', 'metal', [-BR * 0.93, C[1] + 0.04, 0.09], [0.2, 0.33, 0.25]);
    b.add(b.cbox(0.13, 0.04, 0.012, 0.004), 'chest', 'accent', [-BR * 0.93, C[1] + 0.04, 0.095], [0, -1.22, 0.7]);
    if (rk === 0) b.add(plate(b, 0.13, 0.1, 0.03, { c: 0.01 }), 'chest', 'accent', [0.12, C[1] - 0.17, 0.13], [0.7, 0.6, 0]);
  }
  // R0 (touch-up 2: R0 vs R1 must read from the battle camera): a dark scrap replacement panel bolted over the top-left of the
  // shell, a strip of mint tape across it, and the medical cap knocked askew
  if (rk === 0) {
    b.add(b.sph(16, 6, PI * 0.1, PI * 0.62, PI * 0.1, PI * 0.24), 'chest', 'metal', C, [0, 0, 0], BR + 0.006);
    b.add(b.cbox(0.3, 0.03, 0.012, 0.004), 'chest', 'accent', [0.09, C[1] + BR * 0.84, 0.07], [-0.55, 0.9, 0.42]);
    if (!far) for (let i = 0; i < 5; i++) {
      const a = PI * 0.1 + i * PI * 0.155, t = PI * 0.33, q = [Math.sin(t) * Math.cos(a) * (BR + 0.012), Math.cos(t) * (BR + 0.012), Math.sin(t) * Math.sin(a) * (BR + 0.012)];
      b.add(b.sph(6, 4), 'chest', 'trim', [q[0], C[1] + q[1], q[2]], [0, 0, 0], 0.011);
    }
  }
}

function lens(b, o) {
  // big friendly lens on the head bone (origin = ball centre): white bezel, dark recess, cyan iris, pupil, catchlight
  const z = BR - 0.012;
  b.add(b.tor(0.098, 0.03, 32, 8), 'head', 'paint', [0, 0, z], [0, 0, 0]);
  b.add(b.tor(0.072, 0.008, 28, 4), 'head', 'accent', [0, 0, z + 0.026], [0, 0, 0]);
  b.add(b.cyl(0.098, 0.098, 0.03, 28), 'head', 'metal', [0, 0, z - 0.004], [PI / 2, 0, 0]);
  b.add(b.sph(24, 12, 0, PI * 2, 0, PI * 0.5), 'head', 'eye', [0, 0, z + 0.005], [PI / 2, 0, 0], [0.074, 0.03, 0.074]);
  b.add(b.cyl(0.03, 0.03, 0.01, 18), 'head', 'metal', [0, 0, z + 0.035], [PI / 2, 0, 0]);
  b.add(b.sph(8, 6), 'head', 'paint', [0.03, 0.032, z + 0.038], [0, 0, 0], 0.012);
  // little antenna that turns with the gaze
  b.add(b.cyl(0.005, 0.008, 0.12, 5), 'head', 'metal', [-0.07, BR + 0.04, -0.05], [-0.35, 0, 0.3]);
  b.add(b.sph(8, 6), 'head', 'glow', [-0.09, BR + 0.1, -0.075], [0, 0, 0], 0.018);
  // eyelid (aux0): white shell band above the lens, mint edge; blinks by rotating down
  b.add(b.sph(24, 8, PI / 2 - 0.62, 1.24, PI * 0.1, PI * 0.31), 'aux0', 'paint', [0, 0, 0], [0, 0, 0], BR + 0.012);
  b.add(b.tor(BR + 0.012, 0.008, 24, 4, 1.18), 'aux0', 'accent', [0, Math.cos(PI * 0.41) * (BR + 0.012), 0], [PI / 2, 0, PI / 2 - 0.59], [Math.sin(PI * 0.41), Math.sin(PI * 0.41), 1]);
}

// four thin repair arms: rod segments with ball joints and white covers
function armSeg(b, bone, len, cover) {
  b.sym(b.sph(10, 8), bone, 'metal', [0, 0, 0], [0, 0, 0], 0.03);
  b.sym(b.cyl(0.016, 0.014, len, 8), bone, 'metal', [0, -len / 2, 0]);
  if (cover) PS(b, bone, cover, [0.045, len * 0.55, 0.045], [0, -len * 0.45, 0], [0, 0, 0], { c: 0.012, tx: 1.15, tz: 1.15 });
}
function arms(b, o) {
  const D = b.rig.D, far = b.far;
  armSeg(b, 'upArm', D.upArm, 'paint');
  armSeg(b, 'foreArm', D.foreArm, 'accent');
  armSeg(b, 'thigh', D.thigh, 'paint');
  armSeg(b, 'shin', D.shin, 'accent');
  // front right: repair-beam emitter (the muzzle)
  b.add(b.cyl(0.03, 0.022, 0.07, 12), 'handR', 'paint', [0, -0.04, 0]);
  b.add(b.tor(0.026, 0.007, 14, 4), 'handR', 'accent', [0, -0.07, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.012, 0.02, 0.04, 10), 'handR', 'metal', [0, -0.095, 0]);
  b.add(b.sph(10, 8), 'handR', 'glow', [0, -0.12, 0], [0, 0, 0], 0.02);
  // front left: three-finger claw
  b.add(b.cbox(0.05, 0.04, 0.05, 0.01), 'handL', 'paint', [0, -0.02, 0]);
  if (!far) for (let i = 0; i < 3; i++) {
    const a = i * PI * 2 / 3;
    b.scope([Math.cos(a) * 0.018, -0.04, Math.sin(a) * 0.018], [0, -a, 0], 1, () => b.add(fin(b, [[0, 0], [0.012, 0], [0.03, -0.05], [0.012, -0.08], [0.006, -0.05]], 0.012, 0.003), 'handL', 'metal', [0, 0, 0], [0, PI / 2, 0]));
  }
  // rear left: nanite syringe (glowing barrel + needle)
  b.add(b.cyl(0.022, 0.022, 0.08, 10), 'footL', 'glow', [0, -0.05, 0]);
  b.add(b.cyl(0.026, 0.026, 0.012, 10), 'footL', 'paint', [0, -0.008, 0]);
  b.add(b.cyl(0.026, 0.026, 0.012, 10), 'footL', 'paint', [0, -0.09, 0]);
  b.add(b.cyl(0.003, 0.006, 0.06, 5), 'footL', 'metal', [0, -0.125, 0]);
  // rear right: scanner head (lamp)
  b.add(b.cbox(0.05, 0.05, 0.06, 0.012), 'footR', 'paint', [0, -0.03, 0]);
  b.add(b.cyl(0.02, 0.02, 0.02, 12), 'footR', 'eye', [0, -0.03, 0.03], [PI / 2, 0, 0]);
  // R2: extra folded arm pair on aux2/aux3 (tools: mini saw + cross manipulator)
  if (o.rank >= 2) for (const [bone, s] of [['aux2', 1], ['aux3', -1]]) {
    b.add(b.sph(8, 6), bone, 'metal', [0, 0, 0], [0, 0, 0], 0.026);
    b.add(b.cyl(0.013, 0.012, 0.15, 7), bone, 'metal', [s * 0.03, -0.07, -0.01], [0, 0, s * 0.4]);
    b.add(b.cbox(0.035, 0.07, 0.035, 0.01), bone, 'paint', [s * 0.03, -0.06, -0.01], [0, 0, s * 0.4]);
    b.add(b.cyl(0.011, 0.011, 0.13, 7), bone, 'metal', [s * 0.1, -0.15, 0.04], [-0.8, 0, s * -0.3]);
    if (s > 0) b.add(b.cyl(0.034, 0.034, 0.008, 14), bone, 'trim', [s * 0.13, -0.19, 0.1], [0, 0, PI / 2]);
    else { b.add(b.cbox(0.05, 0.016, 0.016, 0.004), bone, 'accent', [s * 0.13, -0.2, 0.1]); b.add(b.cbox(0.016, 0.05, 0.016, 0.004), bone, 'accent', [s * 0.13, -0.2, 0.1]); }
  }
}

// holo-cross (aux1, above the ball); R3 ring + orbiting mini crosses; R5 crown of crosses
function holo(b, o) {
  const rk = o.rank, A = 'aux1';
  const cross = (s, slot, pos, rot = [0, 0, 0]) => b.scope(pos, rot, s, () => {
    b.add(b.cbox(0.3, 0.09, 0.09, 0.02), A, slot, [0, 0, 0]);
    b.add(b.cbox(0.09, 0.3, 0.09, 0.02), A, slot, [0, 0, 0]);
    b.add(b.cbox(0.09, 0.09, 0.3, 0.02), A, slot, [0, 0, 0]);
  });
  // R0: the projector is glitching: a smaller cross with one arm missing and no scan frame
  if (rk === 0) b.scope([0, -0.06, 0], [0, 0, 0.25], 0.72, () => {
    b.add(b.cbox(0.09, 0.3, 0.09, 0.02), A, 'glow', [0, 0, 0]);
    b.add(b.cbox(0.15, 0.09, 0.09, 0.02), A, 'glow', [0.075, 0, 0]);
    b.add(b.cbox(0.09, 0.09, 0.3, 0.02), A, 'glow', [0, 0, 0]);
  });
  else {
    cross(1, 'glow', [0, 0, 0]);
    // mint frame lines around the cross (hologram scan frame)
    b.add(b.tor(0.2, 0.007, 32, 3), A, 'accent', [0, -0.2, 0], [PI / 2, 0, 0]);
  }
  if (rk >= 3) {
    b.add(b.tor(0.28, 0.01, 40, 4), A, 'glow', [0, 0, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; cross(0.32, 'glow', [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [0, -a, 0]); }
  }
  if (rk >= 5) {
    b.add(b.tor(0.3, 0.006, 48, 3), A, 'trim', [0, -0.06, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = i * PI / 3 + 0.3; cross(0.26, 'glow', [Math.cos(a) * 0.3, -0.06, Math.sin(a) * 0.3], [0, -a, 0]); }
  }
}

function build(b, o) {
  shellParts(b, o);
  lens(b, o);
  arms(b, o);
  holo(b, o);
}

// ---------- anims ----------
// pose: front arms (L claw / R emitter) as [upArm x, z, foreArm x]; rear arms (thighs) likewise; hand/foot pitch
function limbs(P, t, k = {}) {
  const fl = k.front ?? [-0.55, 0.3, -0.75], rr = k.rear ?? [0.35, 0.32, -0.7];
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.9, w = Math.sin(t * 1.7 + ph) * (k.fidget ?? 0.06);
    const f = k[s] || fl;
    L.RS(P, 'upArm', s, f[0] + w, 0, f[1] + w * 0.5);
    L.RS(P, 'foreArm', s, f[2] - w, 0, 0);
    L.RS(P, 'hand', s, f[3] ?? -0.3, 0, 0);
    const r = k['r' + s] || rr;
    L.RS(P, 'thigh', s, r[0] - w * 0.7, 0, r[1]);
    L.RS(P, 'shin', s, r[2] + w, 0, 0);
    L.RS(P, 'foot', s, r[3] ?? -0.4, 0, 0);
  }
}
function base(P, ctx, t, bob = 1) {
  const st = ctx.st, b = Math.sin(t * 2.1);
  L.pel(P, Math.sin(t * 0.7) * 0.025, b * 0.065 * bob + 0.02, 0);
  L.R(P, 'pelvis', 0.04 + Math.sin(t * 1.3) * 0.03, 0, Math.sin(t * 0.9) * 0.04);
  L.R(P, 'chest', Math.sin(t * 2.1 + 0.6) * 0.03, 0, Math.sin(t * 1.1) * 0.03);
  // the lens swivels inside the shell (curious glances)
  L.R(P, 'neck', 0, 0, 0);
  L.R(P, 'head', st.gp * 0.9, st.gy * 1.1, st.tilt + Math.sin(t * 0.8) * 0.05);
  limbs(P, t);
}
const ARM_OUT = [-1.45, 0.15, -0.12, -0.2];

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~6 s: a happy little wiggle (shell rolls side to side, eye "smiles")
    const c = t % 6.1, k = L.kf(c, [[0, 0], [4.2, 0], [4.4, 1], [5.4, 1], [5.7, 0]]);
    if (k > 0) { L.A(P, 'chest', 0, Math.sin(t * 9) * 0.12 * k, Math.sin(t * 9) * 0.18 * k); L.A(P, 'head', -0.2 * k, 0, 0); ctx.smile = k; } else ctx.smile = 0;
  },
  advance(P, t, ctx) {
    base(P, ctx, t, 1.4);
    L.A(P, 'pelvis', 0.25, 0, 0); L.A(P, 'head', -0.2, 0, 0);
    limbs(P, t, { front: [0.2, 0.25, -0.5], rear: [0.7, 0.3, -0.3], fidget: 0.12 });
  },
  // MEND BEAM (battle basic): eye locks on, leans in, emitter arm extends (fire 0.3) and holds the beam, recoils
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.22, 1], [0.75, 1], [1, 0]]), kick = L.kf(u, [[0, 0], [0.28, 0], [0.32, 1], [0.5, 0.3], [0.8, 0.3], [1, 0]]);
    L.A(P, 'pelvis', 0.2 * k, 0, 0); L.A(P, 'chest', 0.1 * k - 0.08 * kick, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    const f = ARM_OUT.map((x, i) => L.lerp([-0.55, 0.3, -0.75, -0.3][i], x, k));
    f[0] += 0.15 * kick;
    limbs(P, ctx.t, { R: f, L: [-0.9 * k - 0.4, 0.5, -0.9, 0.2], fidget: 0.02 });
    P[L.PX + 2] -= 0.04 * kick;
  },
  // twin beams: both front arms (fire 0.35 + 0.4)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]), kick = L.kf(u, [[0, 0], [0.33, 0], [0.37, 1], [0.6, 0], [1, 0]]);
    L.A(P, 'pelvis', 0.18 * k, 0, 0); L.A(P, 'head', -0.2 * k, 0, 0);
    const f = ARM_OUT.map((x, i) => L.lerp([-0.55, 0.3, -0.75, -0.3][i], x, k));
    f[0] += 0.15 * kick;
    limbs(P, ctx.t, { front: f, fidget: 0.02 });
    P[L.PX + 2] -= 0.05 * kick;
  },
  // scan spin: a full turn with the scanner sweeping, then a beam (fire 0.6)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const spin = L.kf(u, [[0, 0], [0.1, 0], [0.5, PI * 2], [1, PI * 2]]) % (PI * 2);
    const k = L.kf(u, [[0, 0], [0.5, 0], [0.58, 1], [0.85, 1], [1, 0]]);
    L.A(P, 'pelvis', 0, spin, 0);
    P[L.PX + 1] += 0.06 * L.kf(u, [[0, 0], [0.2, 1], [0.5, 1], [0.6, 0]]);
    const f = ARM_OUT.map((x, i) => L.lerp([-0.55, 0.3, -0.75, -0.3][i], x, k));
    limbs(P, ctx.t, { R: f, rR: [-0.3, 0.9, -0.2, -0.8], fidget: 0.03 });
  },
  // TRIAGE FIELD: hops up, every arm flings out like a starfish (release 0.167), the holo-cross swells into a dome (tick), hangs, settles
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 0.4);
    const rise = L.kf(u, [[0, 0], [0.1, -0.3], [OD_REL, 1], [0.8, 1], [1, 0]]);
    const sp = L.kf(u, [[0, 0], [0.1, -0.4], [OD_REL, 1], [0.22, 1.15], [0.8, 1], [0.95, 0]]);
    P[L.PX + 1] += 0.45 * rise;
    L.A(P, 'pelvis', -0.15 * sp, 0, 0); L.A(P, 'head', -0.45 * Math.max(0, sp), 0, 0);
    const shake = Math.sin(u * 70) * 0.04 * L.kf(u, [[0.17, 0], [0.2, 1], [0.6, 1], [0.7, 0]]);
    const s = Math.max(0, sp), c = Math.min(0, sp);
    limbs(P, ctx.t, {
      front: [L.lerp(-0.55, -0.6, s) + 0.6 * c, L.lerp(0.3, 1.5, s) + shake, L.lerp(-0.75, -0.05, s) - 0.6 * c, 0.3 * s],
      rear: [L.lerp(0.35, 0.4, s), L.lerp(0.32, 1.5, s) - shake, L.lerp(-0.7, -0.05, s), 0.3 * s], fidget: 0.01,
    });
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.5, 0.35], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.12 * k; P[L.PX + 1] -= 0.06 * k;
    L.A(P, 'pelvis', -0.35 * k, 0.3 * k * d, 0.3 * k * d); L.A(P, 'head', 0.2 * k, -0.3 * k * d, 0);
    limbs(P, ctx.t, { front: [-0.1, 0.8 * k + 0.3, -0.3, 0.3], rear: [0.1, 0.8 * k + 0.3, -0.3, 0.3], fidget: 0 });
    ctx.squint = k;
  },
  // thrusters sputter, it drops onto the floor, bounces, rolls onto its side; arms go limp
  die(P, u, ctx) {
    const t = ctx.t;
    base(P, ctx, t * (1 - u * 0.8), 1 - u);
    const g = BR - ctx.D.pelvisY - (C[1] + DIMS.spine + DIMS.chest);
    const jit = Math.sin(u * 90) * 0.03 * L.kf(u, [[0, 1], [0.25, 1], [0.3, 0]]);
    P[L.PX + 1] = L.kf(u, [[0, 0.05], [0.25, 0.02], [0.5, g], [0.6, g + 0.1], [0.7, g], [0.76, g + 0.03], [0.82, g]]) + jit;
    P[L.PX] += 0.12 * L.kf(u, [[0.6, 0], [1, 1]]);
    L.R(P, 'pelvis', L.kf(u, [[0, 0], [0.5, 0.3], [1, 0.15]]), 0, L.kf(u, [[0, 0], [0.55, 0.2], [0.9, 1.25], [1, 1.2]]));
    L.R(P, 'head', L.kf(u, [[0, 0], [1, 0.4]]), L.kf(u, [[0, 0], [1, -0.3]]), 0);
    const lim = L.kf(u, [[0.3, 0], [0.6, 1]]);
    limbs(P, t, { front: [L.lerp(-0.55, 0.2, lim), L.lerp(0.3, 0.9, lim), L.lerp(-0.75, -0.1, lim), 0.4], rear: [L.lerp(0.35, -0.2, lim), L.lerp(0.32, 0.9, lim), -0.1, 0.4], fidget: 0.04 * (1 - u) });
    ctx.squint = L.kf(u, [[0.5, 0], [0.9, 0.7]]);
  },
  // happy bounces + spins, arms waving
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), hop = Math.abs(Math.sin(t * 4.2));
    P[L.PX + 1] += (0.12 * hop + 0.08) * k;
    L.A(P, 'pelvis', -0.1 * k, Math.sin(t * 1.4) * 0.9 * k, 0); L.A(P, 'head', -0.3 * k, 0, 0);
    limbs(P, t, { front: [-1.6 * k - 0.4, 0.6 + Math.sin(t * 8) * 0.3, -0.4, 0.2], rear: [0.4, 0.6 + Math.cos(t * 8) * 0.2, -0.4], fidget: 0.1 });
    ctx.smile = k;
  },
  // drops in curled up, squashes on landing, bobs up, eye opens, holo-cross pops on (tick)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t, 0);
    const curl = L.kf(u, [[0, 1], [0.4, 1], [0.7, 0]]), land = L.kf(u, [[0, 0], [0.38, 0], [0.42, 1], [0.55, -0.4], [0.7, 0.15], [0.85, 0]]);
    P[L.PX + 1] -= 0.22 * land;
    L.A(P, 'head', 0.4 * curl, 0, 0);
    limbs(P, ctx.t, { front: [L.lerp(-0.55, 0.6, curl), L.lerp(0.3, 0.05, curl), L.lerp(-0.75, -1.6, curl), 0], rear: [L.lerp(0.35, -0.6, curl), L.lerp(0.32, 0.05, curl), L.lerp(-0.7, -1.4, curl)], fidget: 0 });
    ctx.squint = L.kf(u, [[0, 1], [0.6, 1], [0.75, 0]]);
  },
};

const _a = new THREE.Vector3();
export default {
  id: 'patch', name: 'PATCH', role: 'mage', faction: 'corporate', rarity: 'common', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.45, radius: 0.42, walkSpeed: 1.25, scheme: 'light',
  style: { weapon: 'orbs' },
  paint: {
    corporate: { paint: 0xeef3f7, accent: 0x18bfae, trim: 0xe0262f },
    rogue: { paint: 0xe8e2da, accent: 0xff7a1a, trim: 0xd8262f },
    experimental: { paint: 0xe9e4f6, accent: 0x7c3cf0, trim: 0xd8262f },
  },
  mats: {
    all: { paint: { rough: 0.28, coat: 1, panel: { groove: 0.05, scale: 2.4 } }, accent: { rough: 0.3, panel: { groove: 0.15 } }, metal: { color: 0x3c424c, rough: 0.42, panel: { groove: 0.1 } }, trim: { rough: 0.35 } },
    corporate: { glow: { color: 0x3dffd0 } },
  },
  sockets: { muzzle: ['handR', [0, -0.13, 0]], core: [0, 0.1, 0.2], head: [0, 0.0, 0.22], hand: ['handL', [0, -0.08, 0]] },
  events: {
    cast: [['fire', 0.3]], attack: [['fire', 0.35], ['fire', 0.4]], attack_alt: [['cast', 0.2], ['fire', 0.6]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.5]],
  },
  durs: { cast: 1.1, attack: 1.0, attack_alt: 1.4, overdrive: 2.4, die: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, u = act ? Math.min(1, act.t / act.dur) : 0;
    ctx.gu = u; ctx.ga = act ? act.name : null;
    if (!act || (act.name !== 'hit' && act.name !== 'die' && act.name !== 'deploy')) ctx.squint = 0;
    if (!act || act.name !== 'idle') { if (act) ctx.smile = act.name === 'overdrive' ? 0.6 * L.kf(u, [[0.17, 0], [0.25, 1], [0.8, 1], [0.9, 0]]) : 0; }
    // eyelid: blink every ~3.7 s, squint on hits, "smile" (half-closed) when happy
    const c = t % 3.7, blink = L.kf(c, [[0, 0], [3.4, 0], [3.5, 1], [3.62, 0]]);
    const lid = Math.max(blink, ctx.squint || 0, (ctx.smile || 0) * 0.45);
    const i0 = BI.aux0 * 3; P[i0] = 0.62 * lid; P[i0 + 1] = 0; P[i0 + 2] = 0;
    // holo-cross: always upright-ish, spins; fast in the overdrive
    const i1 = BI.aux1 * 3, fast = act && act.name === 'overdrive' ? 4 : 1;
    ctx.spin = (ctx.spin || 0) + (ctx.dtc || 0.016) * 1.3 * fast;
    P[i1] = -P[0]; P[i1 + 1] = ctx.spin; P[i1 + 2] = -P[2];
    // R2 extra arms swing gently (reach out in the overdrive)
    const od = act && act.name === 'overdrive' ? L.kf(u, [[0.1, 0], [0.17, 1], [0.8, 1], [0.95, 0]]) : 0;
    for (const [n, s, ph] of [['aux2', 1, 0], ['aux3', -1, 2]]) {
      const i = BI[n] * 3;
      P[i] = 0.3 + Math.sin(t * 1.6 + ph) * 0.15 - 0.6 * od; P[i + 1] = 0; P[i + 2] = s * (0.2 + 0.9 * od);
    }
  },
  tick(unit, dt, ctx, bones) {
    ctx.dtc = dt;
    const a = unit.state.action, u = ctx.gu ?? 0;
    let s = 1;
    if (a === 'overdrive') s = 1 + 1.8 * kf(u, [[0, 0], [0.1, -0.3], [OD_REL, 1], [0.75, 1], [0.95, 0]]);
    else if (a === 'die' || unit.state.dead) s = kf(u, [[0, 1], [0.1, 0.3], [0.14, 1], [0.22, 0.2], [0.3, 0]]) * (unit.state.dead ? 0 : 1);
    else if (a === 'deploy') s = kf(u, [[0, 0], [0.62, 0], [0.7, 1.4], [0.8, 1]]);
    else if (a === 'cast' || a === 'attack') s = 1 + 0.25 * kf(u, [[0.2, 0], [0.32, 1], [0.6, 0]]);
    ctx.crossS = (ctx.crossS ?? 1) + (s - (ctx.crossS ?? 1)) * (1 - Math.exp(-dt * 16));
    const bob = Math.sin(ctx.t * 2.6) * 0.025;
    const ax = bones[BI.aux1];
    ax.scale.setScalar(Math.max(0.001, ctx.crossS));
    ax.position.set(0, 0.82 + bob + (ctx.crossS - 1) * 0.12, 0);
    void _a;
  },
  fxHints: { projectile: 'mend_beam', impact: 'heal', overdrive: 'triage_field', color: 0x3dffd0 },
  build,
};
