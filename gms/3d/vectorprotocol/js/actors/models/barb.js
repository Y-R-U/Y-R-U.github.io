// BARB, rogue needle hunter (sculptor-3). Brief: docs/ROSTER.md `barb`; look: refs/ref_battle_02.png enemy back-near (black-red spiky archer).
// Thin angular biped in a crouched hunter stance, long needle rifle shouldered, the back covered in long blood-red spines like a
// porcupine plus big swept blade-spines off the shoulder blades (the ref's red "wings"). Fires poisoned flechettes, looks made of them.
//
// VALUE: `paint` = near-black armour (most of the body), `accent` = blood red (spines, chevrons, crest), `metal` = gunmetal joints,
// rifle barrel, `trim` = small orange markers, `glow`/`eye` = orange-red (eye slit, vents, spine tips from R3).
// Rank ladder (o.rank): R0 battered (broken spines, kit grime) · R1 base · R2 more + longer spines · R3 spine tips glow red,
//   rifle rail glows · R4 spines flex and ripple (tick) + forearm blades · R5 hardlight thorn crown behind the head.
// Rarity (o.r): rare+ shoulder blade-spines · epic+ thigh spike plates + rifle scope · legendary gold crest on the helm.
// Technique: aim pose precomputed at module load (lancer pattern) with the crouch baked in; rifle authored in root space on handR,
// off hand on the foregrip via style.grip. Spines live on three bones: aux0 (centre quills, on the chest), aux2/aux3 (left/right
// blade fans, re-parented to the chest) so tick() can fan them open on overdrive/victory/deploy and ripple them at R4.
import { THREE, P, PS, plate, fin, discX, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.36, shin: 0.42, ankle: 0.1, hipX: 0.11, hipY: -0.04, spine: 0.12, chest: 0.2, neck: 0.17, headOff: 0.03,
  clavX: 0.05, clavY: 0.17, shoulder: 0.15, upArm: 0.27, foreArm: 0.26, aux0: [0, 0.13, -0.12],
  parents: { aux2: 'chest', aux3: 'chest' }, aux2: [0.1, 0.16, -0.1], aux3: [-0.1, 0.16, -0.1],
};
const CROUCH = 0.2;
const RIFLE_LEN = 1.45;
const HAND_T = [-0.1, 1.03, 0.3];   // right hand (grip) in root space at the aim
const FOREGRIP = [0, 0.02, 0.4];      // foregrip relative to the grip, root-aligned aim frame
const _t = new THREE.Vector3();
let HOLD_P = null;

// crouch + forward lean + rifle-shoulder yaw; k = 0 upright .. 1 full hunter crouch
function crouch(P, k = 1) {
  P[LIB.PX + 1] -= CROUCH * k;
  LIB.A(P, 'pelvis', 0.16 * k, -0.3 * k, 0);
  LIB.A(P, 'spine', 0.14 * k, -0.08 * k, 0);
  LIB.A(P, 'chest', 0.08 * k, -0.06 * k, 0);
  LIB.R(P, 'neck', -0.16 * k, 0.2 * k, 0);
  LIB.R(P, 'head', -0.14 * k, 0.24 * k, 0.08 * k);
}
// right hand on the aim point, following the pelvis offset relative to the reference pose
function aim(P, ctx, dx = 0, dy = 0, dz = 0) {
  const H = HOLD_P || P, X = LIB.PX;
  LIB.R(P, 'clavR', 0, -0.06, 0.04);
  LIB.armIK(P, ctx, 'R', _t.set(HAND_T[0] + dx + P[X] - H[X], HAND_T[1] + dy + P[X + 1] - H[X + 1], HAND_T[2] + dz + P[X + 2] - H[X + 2]), 0.35);
  LIB.R(P, 'handR', 0, 0, 0);
}
function stance(P, ctx, t) {
  LIB.idle(P, ctx, t);
  crouch(P);
  aim(P, ctx);
  LIB.plant(P, ctx, 0.24, -0.2, 1.55, 0, 0.2);
}

// ---- precompute the aim -> rifle frame on handR, foregrip + muzzle in hand space
const RIG = makeRig(DIMS);
const REF_CTX = { D: RIG.D, rig: RIG, t: 0, style: { weapon: 'rifle', heavy: 0, stance: 1.4 }, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI };
{ const h = new Float32Array(LIB.NCH); stance(h, REF_CTX, 0); HOLD_P = h; }
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const RIFLE_FRAME = poseFrame(RIG, poseOf(HOLD_P), 'handR');
const _eu = new THREE.Euler(RIFLE_FRAME[0], RIFLE_FRAME[1], RIFLE_FRAME[2], 'XYZ');
const rot = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyEuler(_eu).toArray();
const GRIP = rot(FOREGRIP);
const MUZZLE = rot([0, 0.05, 0.36 + RIFLE_LEN * 0.66 + 0.06]);

// ---------- spine builders ----------
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// round quill: cone from base along dir; R3 glowing tip cap
function quill(b, bone, base, dir, len, r, glowTip) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_up, _d);
  const g = b.cyl(0.002, r, len, 7); g.translate(0, len / 2, 0); g.applyQuaternion(_q); g.translate(base[0], base[1], base[2]);
  b.add(g, bone, 'accent');
  if (glowTip) {
    const tl = len * 0.3, t = b.cyl(0.001, r * 0.5, tl, 5); t.translate(0, len - tl / 2 + 0.003, 0); t.applyQuaternion(_q); t.translate(base[0], base[1], base[2]);
    b.add(t, bone, 'glow');
  }
  // dark socket collar
  const c = b.cyl(r * 1.35, r * 1.5, 0.03, 6); c.applyQuaternion(_q); c.translate(base[0], base[1], base[2]);
  b.add(c, bone, 'paint');
}
// flat blade-spine: long axis along dir, broad face spread toward `side` (wing-like), slight curve
function blade(b, bone, base, dir, len, w, side, glowTip, slot = 'accent') {
  const Y = new THREE.Vector3(...dir).normalize();
  const X = new THREE.Vector3(...side); X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  _m.makeBasis(X, Y, Z).setPosition(base[0], base[1], base[2]);
  const pts = [[-w * 0.5, 0], [w * 0.5, 0], [w * 0.42, len * 0.35], [w * 0.12, len * 0.78], [0, len], [-w * 0.2, len * 0.62], [-w * 0.45, len * 0.25]];
  const g = fin(b, pts, 0.022, 0.006); g.applyMatrix4(_m);
  b.add(g, bone, slot);
  // dark spine ridge down the blade
  const rg = b.cbox(0.012, len * 0.7, 0.03, 0.004); rg.translate(0, len * 0.38, 0); rg.applyMatrix4(_m);
  b.add(rg, bone, 'paint');
  if (glowTip) {
    const tp = fin(b, [[-w * 0.16, len * 0.68], [w * 0.2, len * 0.68], [0, len + 0.006]], 0.028, 0.004); tp.applyMatrix4(_m);
    b.add(tp, bone, 'glow');
  }
}

function spines(b, o) {
  const rk = o.rank, far = b.far, glow = rk >= 3;
  const more = rk >= 2, lk = more ? 1.18 : 1;
  // centre quills on aux0: rows across the upper back, raking up + back, fanning out with x
  const rows = more ? 4 : 3, cols = more ? 6 : 5;
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (far && (r + c) % 2) continue;
    const u = cols > 1 ? c / (cols - 1) - 0.5 : 0;
    const x = u * (0.2 + r * 0.03), y = 0.1 - r * 0.075, z = -0.03 - Math.abs(u) * 0.04;
    const broken = rk === 0 && hash(n + 3) < 0.25;
    const len = (0.34 + 0.22 * hash(n) + (r === 0 ? 0.1 : 0)) * lk * (broken ? 0.4 : 1) * (1 - Math.abs(u) * 0.35);
    quill(b, 'aux0', [x, y, z], [x * 3.4, 0.85 - r * 0.15, -1.0 - r * 0.15], len, 0.016 + 0.006 * hash(n + 9), glow && !broken);
    // spine-root lights (robots touch-up): orange-red sockets where the quills leave the armour, every other quill from R1
    if (rk >= 1 && !far && n % 2 === 0) b.add(b.sph(8, 6), 'aux0', 'glow', [x, y, z + 0.005], [0, 0, 0], 0.02 + 0.006 * (rk >= 3));
    n++;
  }
  // lower back: short static quills down the spine (the back is covered, not just the shoulders)
  const low = more ? 7 : 5;
  for (let i = 0; i < low; i++) {
    if (far && i % 2) continue;
    const u = i / (low - 1) - 0.5;
    quill(b, 'spine', [u * 0.16, 0.12 - Math.abs(u) * 0.06, -0.1], [u * 1.6, 0.35, -1], (0.2 + 0.1 * hash(i + 40)) * lk, 0.013, glow);
    if (i % 2 === 0) quill(b, 'chest', [u * 0.24, 0.02, -0.13], [u * 2, 0.5, -1], (0.26 + 0.1 * hash(i + 60)) * lk, 0.014, glow);
  }
  // short inner row between the long quills (density without length)
  if (!far) for (let c = 0; c < cols + 1; c++) {
    const u = c / cols - 0.5, x = u * 0.22;
    quill(b, 'aux0', [x, 0.05, -0.0], [x * 3, 1, -0.6], (0.16 + 0.08 * hash(c + 80)) * lk, 0.012, false);
  }
  // back plate the quills sprout from (on chest so it never fans)
  P(b, 'chest', 'paint', [0.3, 0.26, 0.08], [0, 0.17, -0.15], [-0.2, 0, 0], { c: 0.025, tx: 0.8, bx: 0.7 });
  P(b, 'chest', 'accent', [0.12, 0.2, 0.05], [0, 0.17, -0.19], [-0.2, 0, 0], { c: 0.015, tx: 0.6 });
  // blade fans (aux2 = left, aux3 = right): the big swept red wings of the silhouette
  for (const [bone, s] of [['aux2', 1], ['aux3', -1]]) {
    const L = (a) => [a[0] * s, a[1], a[2]];
    b.add(b.cbox(0.08, 0.08, 0.08, 0.02), bone, 'metal', [0, 0, 0]);
    const set = [
      // [dir, len, w]
      [[0.3, 1.0, -0.35], 0.78, 0.15],
      [[0.95, 0.55, -0.6], 0.7, 0.13],
      [[0.8, -0.1, -0.9], 0.58, 0.11],
    ];
    if (more) set.push([[0.15, 0.75, -1.0], 0.6, 0.1]);
    if (o.r >= 1) set.push([[1.0, 0.15, 0.15], 0.42, 0.08]);
    set.forEach(([d, len, w], i) => {
      const broken = rk === 0 && i === 1;
      blade(b, bone, [0, 0.01, 0], L(d), len * lk * (broken ? 0.45 : 1), w, [s, 0, 0.3], glow && !broken);
    });
    if (!far) for (let i = 0; i < (more ? 6 : 4); i++) quill(b, bone, L([0.02 + (i % 2) * 0.02, -0.02 - i * 0.025, -0.02]), L([0.5 + 0.25 * (i % 2), 0.45 - i * 0.15, -1]), (0.24 + 0.08 * hash(i + 20)) * lk, 0.013, glow);
    // R4: a second, longer pair of blades rakes back (silhouette change)
    if (rk >= 4) blade(b, bone, [0, 0.0, -0.02], L([0.45, 0.35, -1]), 0.85, 0.12, [s, 0.3, 0], true);
  }
  // R5: hardlight thorn crown behind the head
  if (rk >= 5) {
    b.add(b.tor(0.26, 0.016, 32, 5), 'aux0', 'glow', [0, 0.36, 0.06], [-0.35, 0, 0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      const cx = Math.cos(a) * 0.26, cy = Math.sin(a) * 0.26;
      quill(b, 'aux0', [cx, 0.36 + cy * Math.cos(0.35), 0.06 + cy * Math.sin(0.35)], [Math.cos(a), Math.sin(a) * Math.cos(0.35), Math.sin(a) * Math.sin(0.35)], 0.17, 0.016, true);
    }
    b.add(b.tor(0.3, 0.007, 32, 3), 'aux0', 'trim', [0, 0.36, 0.06], [-0.35, 0, 0]);
  }
}

// ---------- body ----------
function head(b, o) {
  const y = 0.02, z = 0.05;
  // narrow forward-swept wedge helm, V eye slit, red crest raking back
  b.add(plate(b, 0.14, 0.12, 0.22, { c: 0.03, tx: 0.7, tz: 0.8 }), 'head', 'paint', [0, y + 0.06, z]);
  P(b, 'head', 'paint', [0.1, 0.06, 0.12], [0, y + 0.04, z + 0.14], [-0.25, 0, 0], { c: 0.02, tx: 0.4, tz: 0.4, sz: 0.04 });
  b.add(b.cbox(0.11, 0.05, 0.05, 0.012), 'head', 'metal', [0, y + 0.07, z + 0.1]);
  for (const s of [1, -1]) b.add(b.cbox(0.055, 0.016, 0.02, 0.005), 'head', 'eye', [s * 0.028, y + 0.075, z + 0.127], [0.1, 0, s * 0.35]);
  // mandible plates + cheek spikes
  b.sym(plate(b, 0.03, 0.08, 0.12, { c: 0.008, tx: 0.6 }), 'head', 'paint', [0.06, y + 0.0, z + 0.09], [0.3, 0.2, 0]);
  b.sym(fin(b, [[-0.015, 0], [0.015, 0], [0, 0.09]], 0.02, 0.004), 'head', 'accent', [0.075, y + 0.06, z - 0.02], [-1.2, 0.5, 0]);
  b.add(fin(b, [[0, 0], [0.05, 0], [-0.17, 0.12], [-0.2, 0.1]], 0.022, 0.006), 'head', 'accent', [0, y + 0.12, z + 0.06], [0, PI / 2, 0]);
  if (o.r >= 1) b.sym(fin(b, [[0, 0], [0.03, 0], [-0.14, 0.08], [-0.16, 0.07]], 0.014, 0.004), 'head', 'accent', [0.04, y + 0.11, z + 0.02], [0.1, PI / 2 - 0.3, 0]);
  b.sym(discX(b, 0.03, 0.03, 12), 'head', 'metal', [0.07, y + 0.05, z - 0.02]);
  b.sym(b.cyl(0.004, 0.006, 0.12, 5), 'head', 'metal', [0.06, y + 0.12, z - 0.05], [-0.7, 0, -0.35]);
  if (!b.far) for (let i = 0; i < 3; i++) b.sym(b.box(0.006, 0.03, 0.05), 'head', 'metal', [0.075, y + 0.03 + i * 0.012, z + 0.04]);
  if (o.r >= 3) b.add(fin(b, [[0, 0], [0.07, 0], [-0.22, 0.18], [-0.25, 0.15]], 0.016, 0.004), 'head', 'trim', [0, y + 0.14, z + 0.0], [0, PI / 2, 0]);
}

function torso(b, o) {
  const far = b.far;
  P(b, 'chest', 'metal', [0.26, 0.28, 0.2], [0, 0.09, -0.01], [0, 0, 0], { c: 0.03 });
  // narrow V chest, red chevrons, angular pecs
  P(b, 'chest', 'paint', [0.38, 0.27, 0.25], [0, 0.13, 0.02], [0.08, 0, 0], { c: 0.04, tx: 1.15, bx: 0.55, tz: 1.05, bz: 0.8 });
  PS(b, 'chest', 'accent', [0.15, 0.15, 0.05], [0.08, 0.15, 0.14], [0.3, 0.35, 0.12], { c: 0.02, bx: 0.6 });
  PS(b, 'chest', 'paint', [0.13, 0.024, 0.03], [0.06, 0.12, 0.175], [0.3, 0.3, -0.5]);
  PS(b, 'chest', 'trim', [0.06, 0.014, 0.02], [0.09, 0.2, 0.16], [0.3, 0.3, -0.5]);
  b.add(b.cyl(0.026, 0.026, 0.02, 12), 'chest', 'glow', [0, 0.19, 0.15], [PI / 2 + 0.3, 0, 0]);
  b.add(b.tor(0.034, 0.008, 14, 4), 'chest', 'trim', [0, 0.19, 0.155], [0.3, 0, 0]);
  // collar spikes + shoulder yokes
  PS(b, 'chest', 'paint', [0.12, 0.06, 0.16], [0.14, 0.25, -0.01], [0, 0, -0.35], { c: 0.015 });
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.1]], 0.02, 0.004), 'chest', 'accent', [0.12, 0.28, 0.05], [-0.3, 0, -0.5]);
  // ribbed waist + ab plates
  b.add(b.cyl(0.085, 0.1, 0.14, 10), 'spine', 'metal', [0, 0.05, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.094 + i * 0.006, 0.007, 14, 4), 'spine', 'paint', [0, 0.01 + i * 0.04, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.16, 0.08, 0.08], [0, 0.07, 0.08], [0.1, 0, 0], { c: 0.02 });
  b.add(b.cbox(0.08, 0.012, 0.02, 0.004), 'spine', 'glow', [0, 0.02, 0.105]);
  // venom belt: two poison vials on the back of the hips + pouches, a strap harness over the chest
  for (const s of [1, -1]) {
    b.add(b.cyl(0.028, 0.028, 0.12, 10), 'pelvis', 'metal', [s * 0.09, 0.0, -0.1], [0.3, 0, s * 0.2]);
    b.add(b.cyl(0.02, 0.02, 0.09, 10), 'pelvis', 'glow', [s * 0.09, 0.0, -0.11], [0.3, 0, s * 0.2]);
    if (!far) for (const y of [0.055, -0.055]) b.add(b.cyl(0.03, 0.03, 0.012, 10), 'pelvis', 'paint', [s * 0.09, y * Math.cos(0.3), -0.1 + y * Math.sin(0.3)], [0.3, 0, s * 0.2]);
    b.add(b.cbox(0.05, 0.06, 0.04, 0.01), 'pelvis', 'paint', [s * 0.13, 0.0, 0.05]);
  }
  b.add(b.tor(0.13, 0.008, 20, 4, PI), 'pelvis', 'metal', [0, 0.03, 0], [PI / 2, 0, 0]);
  if (!far) {
    b.add(b.box(0.03, 0.3, 0.012), 'chest', 'metal', [0.0, 0.14, 0.155], [0.3, 0, 0.7]);
    for (let i = 0; i < 4; i++) b.add(b.cyl(0.006, 0.006, 0.05, 5), 'chest', 'accent', [-0.07 + i * 0.045, 0.06 + i * 0.055, 0.16 - i * 0.012], [0.3 + PI / 2, 0, 0.7]);
  }
  // pelvis: dark skirt, spiked tassets with red edges
  P(b, 'pelvis', 'metal', [0.22, 0.11, 0.16], [0, -0.01, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'paint', [0.11, 0.14, 0.05], [0, -0.07, 0.09], [-0.1, 0, 0], { c: 0.015, bx: 0.5 });
  b.sym(fin(b, [[-0.05, 0], [0.05, 0], [0.02, -0.18], [-0.01, -0.22]], 0.025, 0.006), 'pelvis', 'paint', [0.13, -0.02, 0], [0, PI / 2, 0.2]);
  b.sym(fin(b, [[-0.01, 0], [0.012, 0], [0.004, -0.2]], 0.026, 0.004), 'pelvis', 'accent', [0.142, -0.03, 0.04], [0, PI / 2, 0.2]);
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  b.sym(b.cyl(0.035, 0.035, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.065);
  b.sym(b.cyl(0.038, 0.034, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.1, ua * 0.55, 0.11], [0.01, -ua * 0.58, 0], [0, 0, 0], { c: 0.02, tx: 1.1 });
  // angular pauldron with a red edge + a back-raking spike
  PS(b, 'upArm', 'accent', [0.16, 0.1, 0.19], [0.03, 0.02, 0], [0, 0, -0.4], { c: 0.03, tx: 0.65, tz: 0.8 });
  PS(b, 'upArm', 'paint', [0.13, 0.03, 0.18], [0.07, -0.04, 0], [0, 0, -0.55], { c: 0.008 });
  b.sym(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.16]], 0.025, 0.005), 'upArm', 'accent', [0.06, 0.05, -0.04], [-1.0, 0, -0.6]);
  b.sym(discX(b, 0.045, 0.09, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.12]], 0.024, 0.005), 'foreArm', 'accent', [0, 0.0, -0.05], [-2.4, 0, 0]);
  PS(b, 'foreArm', 'paint', [0.11, fa * 0.78, 0.12], [0.005, -fa * 0.55, 0], [0, 0, 0], { c: 0.02, tx: 0.8, tz: 0.85 });
  PS(b, 'foreArm', 'accent', [0.03, fa * 0.62, 0.1], [0.06, -fa * 0.55, 0.0], [0, 0, -0.05], { c: 0.008 });
  b.sym(b.cyl(0.012, 0.012, 0.012, 8), 'foreArm', 'glow', [0.062, -fa * 0.25, 0.04], [0, 0, PI / 2]);
  if (o.rank >= 4) b.sym(fin(b, [[0, 0], [0.04, 0], [0.01, -0.3], [-0.01, -0.32]], 0.016, 0.004), 'foreArm', 'accent', [0.06, -0.04, -0.02], [0, PI / 2, 0.1]);
  b.sym(b.cbox(0.06, 0.09, 0.08, 0.016), 'hand', 'metal', [0, -0.045, 0.005]);
  b.sym(b.cbox(0.065, 0.045, 0.085, 0.012), 'hand', 'paint', [0, -0.1, 0.005]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(fin(b, [[-0.008, 0], [0.008, 0], [0, -0.05]], 0.014, 0.003), 'hand', 'metal', [-0.005, -0.12, -0.025 + i * 0.025], [0, PI / 2, 0]);
}

function rifle(b, o) {
  const far = b.far, rank = o.rank, L = RIFLE_LEN;
  b.scope([0, 0, 0], RIFLE_FRAME, 1, () => {
    const H = 'handR';
    // receiver + skeletal stock
    P(b, H, 'paint', [0.07, 0.12, 0.46], [0, 0.04, 0.12], [0, 0, 0], { c: 0.02, tx: 0.8 });
    b.add(b.cbox(0.074, 0.02, 0.3, 0.006), H, 'accent', [0, 0.09, 0.14]);
    b.add(b.cbox(0.04, 0.03, 0.3, 0.008), H, 'metal', [0, 0.05, -0.24], [0.08, 0, 0]);
    b.add(b.cbox(0.03, 0.025, 0.26, 0.006), H, 'metal', [0, -0.03, -0.22], [-0.12, 0, 0]);
    b.add(b.cbox(0.05, 0.1, 0.04, 0.01), H, 'paint', [0, 0.01, -0.37]);
    b.add(b.cbox(0.04, 0.11, 0.05, 0.01), H, 'metal', [0, -0.06, -0.01], [0.35, 0, 0]);
    // flechette drum on the left of the receiver: red quills poking out of a dark cylinder
    b.add(b.cyl(0.055, 0.055, 0.07, 14), H, 'paint', [0.07, 0.03, 0.14], [0, 0, PI / 2]);
    b.add(b.cyl(0.04, 0.04, 0.075, 12), H, 'accent', [0.07, 0.03, 0.14], [0, 0, PI / 2]);
    if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(b.cyl(0.004, 0.006, 0.05, 4), H, 'accent', [0.1, 0.03 + Math.cos(a) * 0.03, 0.14 + Math.sin(a) * 0.03], [0, 0, PI / 2]); }
    // long needle barrel: thin core, shroud, vent rings, three-prong muzzle
    b.add(b.cyl(0.013, 0.013, L * 0.68, 8), H, 'metal', [0, 0.05, 0.36 + L * 0.34], [PI / 2, 0, 0]);
    b.add(b.cbox(0.05, 0.05, L * 0.3, 0.012), H, 'paint', [0, 0.05, 0.36 + L * 0.15]);
    b.add(b.cbox(0.052, 0.012, L * 0.26, 0.004), H, 'accent', [0, 0.076, 0.36 + L * 0.15]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.024, 0.024, 0.018, 10), H, 'metal', [0, 0.05, 0.36 + L * (0.34 + i * 0.07)], [PI / 2, 0, 0]);
    b.add(b.cyl(0.022, 0.018, 0.06, 10), H, 'paint', [0, 0.05, 0.36 + L * 0.66], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; b.add(fin(b, [[-0.008, 0], [0.008, 0], [0, 0.07]], 0.01, 0.002), H, 'accent', [Math.cos(a) * 0.02, 0.05 + Math.sin(a) * 0.02, 0.36 + L * 0.66 + 0.03], [PI / 2, a, 0]); }
    b.add(b.cyl(0.008, 0.008, 0.015, 8), H, 'glow', [0, 0.05, 0.36 + L * 0.66 + 0.03], [PI / 2, 0, 0]);
    // under-barrel spike (bayonet) + foregrip
    b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, 0.22]], 0.012, 0.003), H, 'accent', [0, 0.0, 0.36 + L * 0.42], [PI / 2, 0, 0]);
    b.add(b.cbox(0.035, 0.08, 0.045, 0.01), H, 'metal', [0, -0.02, FOREGRIP[2]]);
    if (rank >= 3) b.add(b.cbox(0.008, 0.008, L * 0.42, 0.002), H, 'glow', [0.028, 0.06, 0.36 + L * 0.3]);
    if (o.r >= 2) {
      b.add(b.cyl(0.022, 0.022, 0.2, 10), H, 'metal', [0, 0.15, 0.08], [PI / 2, 0, 0]);
      b.add(b.cyl(0.018, 0.018, 0.01, 10), H, 'eye', [0, 0.15, 0.185], [PI / 2, 0, 0]);
      b.add(b.cbox(0.02, 0.05, 0.03, 0.006), H, 'metal', [0, 0.11, 0.08]);
    } else b.add(b.cbox(0.025, 0.035, 0.08, 0.008), H, 'metal', [0, 0.12, 0.08]);
  });
}

// thin digitigrade-look legs: angular thigh plate, knee blade, slim shin strut + plate, raked calf fin, three-claw foot
function hunterLegs(b, o) {
  const D = b.rig.D, th = D.thigh, sh = D.shin, far = b.far;
  b.sym(b.sph(12, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.065);
  b.sym(b.cyl(0.035, 0.03, th, 8), 'thigh', 'metal', [0, -th / 2, 0]);
  PS(b, 'thigh', 'paint', [0.12, th * 0.78, 0.14], [0.01, -th * 0.42, 0.02], [0, 0, 0.04], { c: 0.025, tx: 1.15, bx: 0.6, tz: 1.1, bz: 0.7 });
  PS(b, 'thigh', 'paint', [0.03, th * 0.5, 0.11], [0.07, -th * 0.4, 0.0], [0, 0, 0.08], { c: 0.008 });
  PS(b, 'thigh', 'accent', [0.03, th * 0.55, 0.03], [0.03, -th * 0.42, 0.1], [0.05, 0, 0.35]);
  b.sym(b.cyl(0.016, 0.016, 0.2, 8), 'thigh', 'metal', [0, -0.17, -0.065]);
  b.sym(b.cyl(0.014, 0.014, 0.02, 10), 'thigh', 'glow', [0.085, -0.09, 0.03], [0, 0, PI / 2]);
  if (o.r >= 2) b.sym(fin(b, [[-0.035, 0], [0.035, 0], [0.0, 0.15]], 0.025, 0.006), 'thigh', 'accent', [0.08, -0.12, 0], [0, 0, -1.25]);
  // knee: disc + forward blade
  b.sym(discX(b, 0.045, 0.1, 12), 'shin', 'metal', [0, 0, 0]);
  b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0.005, 0.17]], 0.05, 0.008), 'shin', 'paint', [0, 0.0, 0.05], [-0.35, 0, 0]);
  b.sym(fin(b, [[-0.008, 0], [0.008, 0], [0.002, 0.13]], 0.052, 0.004), 'shin', 'accent', [0, 0.01, 0.06], [-0.35, 0, 0]);
  // shin: strut + long front plate + raked calf fin
  b.sym(b.cyl(0.03, 0.024, sh, 8), 'shin', 'metal', [0, -sh / 2, 0]);
  PS(b, 'shin', 'paint', [0.09, sh * 0.72, 0.06], [0, -sh * 0.45, 0.045], [0.06, 0, 0], { c: 0.015, tx: 1.2, bx: 0.55 });
  PS(b, 'shin', 'paint', [0.07, sh * 0.5, 0.07], [0, -sh * 0.4, -0.035], [0, 0, 0], { c: 0.015, tx: 1.1, bx: 0.7 });
  b.sym(fin(b, [[0, 0], [0.045, 0.0], [0.0, -sh * 0.62]], 0.02, 0.005), 'shin', 'accent', [0, -0.04, -0.07], [0, PI / 2, -0.22]);
  b.sym(b.cyl(0.012, 0.012, sh * 0.5, 8), 'shin', 'metal', [0, -sh * 0.3, -0.06]);
  if (!far) b.sym(b.cyl(0.012, 0.012, 0.012, 8), 'shin', 'glow', [0.0, -sh * 0.22, 0.078], [PI / 2, 0, 0]);
  // foot: ankle ball, slim sole, three claws + heel spur
  b.sym(b.sph(10, 8), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.045);
  PS(b, 'foot', 'paint', [0.1, 0.05, 0.16], [0, -D.ankle + 0.035, 0.04], [0, 0, 0], { c: 0.015, tx: 0.8 });
  for (const x of [-0.035, 0, 0.035]) b.sym(fin(b, [[-0.018, 0], [0.018, 0], [0, 0.12]], 0.025, 0.005), 'foot', 'metal', [x, -D.ankle + 0.03, 0.11], [PI / 2 - 0.15, 0, 0]);
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.14]], 0.03, 0.006), 'foot', 'metal', [0, -0.03, -0.05], [-2.3, 0, 0]);
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  armsAndHands(b, o);
  spines(b, o);
  hunterLegs(b, o);
  rifle(b, o);
}

// ---------------- anims ----------------
// re-plant the gait's feet after a crouch so the stalk walk stays low without sliding
const _fl = new THREE.Vector3(), _fr = new THREE.Vector3();
function lowGait(P, ctx, k) {
  LIB.gait(P, ctx);
  LIB.fkPoint(P, ctx, 'footL', [0, 0, 0], _fl); LIB.fkPoint(P, ctx, 'footR', [0, 0, 0], _fr);
  const yl = _fl.y, yr = _fr.y;
  crouch(P, k);
  LIB.legIK(P, ctx, 'L', _fl.x * 1.35, yl, _fl.z, 0);
  LIB.legIK(P, ctx, 'R', _fr.x * 1.35, yr, _fr.z, 0);
}
const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // predator scan: every ~4.6 s the head snaps left, holds, snaps right, back to the sights
    const c = t % 4.6, k1 = L.kf(c, [[0, 0], [2.6, 0], [2.68, 1], [3.2, 1], [3.28, -0.8], [3.8, -0.8], [3.9, 0]]);
    L.A(P, 'head', -0.05 * Math.abs(k1), 0.55 * k1, 0.1 * k1); L.A(P, 'neck', 0, 0.2 * k1, 0);
    L.A(P, 'chest', 0.01 * Math.sin(t * 1.3), 0.02 * Math.sin(t * 0.7), 0);
  },
  advance(P, t, ctx, L) {
    lowGait(P, ctx, 0.75);
    aim(P, ctx, 0, 0.02, 0);
  },
  attack(P, u, ctx, L) {
    // Needle Burst: three quick flechettes (fire 0.3 / 0.37 / 0.44), a twitch per shot
    stance(P, ctx, ctx.t);
    let kick = 0;
    for (const f of [0.3, 0.37, 0.44]) kick += L.kf(u, [[0, 0], [f - 0.005, 0], [f + 0.015, 1], [f + 0.06, 0], [1, 0]]);
    const settle = L.kf(u, [[0, 0], [0.2, 1], [0.6, 1], [1, 0]]);
    P[L.PX + 1] -= 0.03 * settle; P[L.PX + 2] -= 0.03 * kick;
    L.A(P, 'chest', -0.06 * kick, 0.04 * kick, 0); L.A(P, 'head', -0.05 * kick, 0, 0);
    aim(P, ctx, 0, 0.015 * kick, -0.05 * kick);
    L.plant(P, ctx, 0.24, -0.2, 1.55, 0, 0.2);
  },
  attack_alt(P, u, ctx, L) {
    // snap shot: drops to one knee, fires a fan (fire 0.32), springs back up
    stance(P, ctx, ctx.t);
    const kneel = L.kf(u, [[0, 0], [0.22, 1], [0.6, 1], [0.85, 0]]);
    const kick = L.kf(u, [[0, 0], [0.31, 0], [0.34, 1], [0.5, 0.2], [0.7, 0]]);
    P[L.PX + 1] -= 0.2 * kneel; P[L.PX + 2] -= 0.05 * kick;
    L.A(P, 'spine', 0.05 * kneel - 0.1 * kick, 0, 0); L.A(P, 'chest', -0.08 * kick, 0.06 * kick, 0);
    aim(P, ctx, 0, 0.02 * kick, -0.07 * kick);
    L.plant(P, ctx, 0.3 * kneel + 0.24 * (1 - kneel), -0.2 - 0.32 * kneel, 1.55, 0, 0.2 + 0.9 * kneel);
  },
  cast(P, u, ctx, L) {
    // Venom Rounds: tips the rifle up, slaps a fresh poison drum home (cast 0.45), spines rattle (tick)
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.2, 1], [0.75, 1], [1, 0]]);
    const slap = L.kf(u, [[0, 0], [0.38, 0], [0.45, 1], [0.6, 0]]);
    L.A(P, 'chest', -0.06 * up, -0.1 * up, 0); L.A(P, 'head', 0.1 * up, -0.35 * up, 0.1 * up);
    aim(P, ctx, 0.04 * up, 0.16 * up, -0.1 * up);
    L.armIK(P, ctx, 'L', _t.set(L.lerp(0.05, -0.02, slap) + P[L.PX] - HOLD_P[L.PX], 1.16 + 0.14 * up + P[L.PX + 1] - HOLD_P[L.PX + 1], 0.28 + P[L.PX + 2] - HOLD_P[L.PX + 2]), 0.35);
  },
  overdrive(P, u, ctx, L) {
    // Thornstorm: rises onto its toes and arches back as the spines flare (tick), then hunches hard and storms the lane (fire 0.27..0.7)
    stance(P, ctx, ctx.t);
    const rise = L.kf(u, [[0, 0], [0.16, 1], [0.24, 1], [0.28, 0], [1, 0]]);
    const storm = L.kf(u, [[0, 0], [0.25, 0], [0.29, 1], [0.7, 1], [0.86, 0], [1, 0]]);
    const shake = Math.sin(u * 110) * storm;
    P[L.PX + 1] += 0.16 * rise - 0.06 * storm; P[L.PX + 2] -= 0.05 * rise + 0.02 * shake;
    L.A(P, 'pelvis', -0.18 * rise, 0.3 * rise, 0);
    L.A(P, 'spine', -0.3 * rise + 0.16 * storm, 0.08 * rise, 0); L.A(P, 'chest', -0.25 * rise + 0.08 * storm + 0.015 * shake, 0, 0);
    L.A(P, 'neck', -0.2 * rise, -0.2 * rise, 0); L.A(P, 'head', -0.35 * rise, -0.2 * rise, 0);
    aim(P, ctx, 0.02 * rise, 0.22 * rise + 0.01 * shake, -0.1 * rise - 0.03 * Math.abs(shake));
    L.plant(P, ctx, 0.24 + 0.06 * storm, -0.2 - 0.1 * storm, 1.55 + 0.15 * storm, -0.5 * rise, 0.2 - 0.5 * rise);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [0.45, 0.35], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.08 * k; P[L.PX + 1] += 0.03 * k;
    L.A(P, 'spine', -0.2 * k, 0.12 * k * d, 0.08 * k * d); L.A(P, 'chest', -0.15 * k, 0.1 * k * d, 0);
    L.A(P, 'head', -0.3 * k, -0.25 * k * d, 0.2 * k * d);
    aim(P, ctx, 0, 0.05 * k, -0.08 * k);
    L.plant(P, ctx, 0.2, -0.2, 1.5, 0, 0.2);
  },
  die(P, u, ctx, L) {
    // rifle drops, it staggers, folds over sideways and curls on the floor, spines drooping (tick)
    stance(P, ctx, ctx.t);
    const sag = L.kf(u, [[0, 0], [0.18, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.35, 0.1], [0.75, 1], [0.82, 0.92], [0.88, 1], [1, 0.98]]);
    P[L.PX + 1] += L.kf(u, [[0, 0], [0.35, -0.2], [0.75, -0.62], [0.82, -0.58], [1, -0.62]]);
    P[L.PX] += 0.25 * fall;
    L.A(P, 'pelvis', 0.3 * fall, 0.2 * fall, 1.25 * fall);
    L.A(P, 'spine', 0.25 * sag, 0, 0.1 * sag); L.A(P, 'chest', 0.2 * sag, 0.15 * sag, 0);
    L.A(P, 'head', 0.4 * sag, 0.3 * fall, -0.3 * fall);
    for (const s of ['L', 'R']) { L.RS(P, 'upArm', s, L.lerp(P[BI['upArm' + s] * 3], -0.6, sag), 0, 0.4 * sag); L.RS(P, 'foreArm', s, L.lerp(P[BI['foreArm' + s] * 3], -1.6, sag), 0, 0); }
    const lie = L.kf(u, [[0.3, 0], [0.78, 1]]);
    if (lie < 1) L.plant(P, ctx, 0.24, -0.2, 1.55, 0, 0.2);
    if (lie > 0) for (const s of ['L', 'R']) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      P[i] = L.lerp(P[i], -1.1, lie); P[i + 2] = L.lerp(P[i + 2], 0.1, lie);
      P[j] = L.lerp(P[j], 1.7, lie); P[f] = L.lerp(P[f], 0.5, lie);
    }
  },
  victory(P, t, ctx, L) {
    // stands tall, rifle propped on its shoulder, spines fanned proudly (tick), head tilts at the crowd
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6));
    P[L.PX + 1] += CROUCH * 0.8 * k;
    L.A(P, 'pelvis', -0.16 * k, 0.3 * k, 0); L.A(P, 'spine', -0.18 * k, 0.05 * k, 0); L.A(P, 'chest', -0.12 * k, 0, 0);
    L.A(P, 'head', 0.1 * k, -0.1 * k + 0.12 * Math.sin(t * 1.3) * k, 0.15 * Math.sin(t * 0.9) * k);
    aim(P, ctx, -0.12 * k, 0.32 * k, -0.26 * k);
    L.plant(P, ctx, 0.12, -0.08, 1.2);
  },
  deploy(P, u, ctx, L) {
    // three-point landing (left hand on the floor, 0.4), spines snap open (tick), rises into the aim
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.66, 0.9], [0.86, 0], [1, 0]]);
    P[L.PX + 1] -= 0.3 * land; P[L.PX + 2] += 0.04 * land;
    L.A(P, 'spine', 0.4 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0); L.A(P, 'head', -0.3 * land, 0, 0);
    aim(P, ctx, 0, -0.1 * land, -0.05 * land);
    if (land > 0.01) L.armIK(P, ctx, 'L', _t.set(L.lerp(0.25, 0.22, land), L.lerp(1.0, 0.12, land), L.lerp(0.3, 0.42, land)), 0.4);
    L.plant(P, ctx, 0.3 * land + 0.24 * (1 - land), -0.34 * land - 0.2 * (1 - land), 1.55 + 0.2 * land, 0, 0.2 + 0.7 * land);
  },
};

// spine fan target per action (0 folded .. 1 fully flared), plus rattle amplitude
function fanAt(name, u) {
  switch (name) {
    case 'overdrive': return kf(u, [[0, 0], [0.12, 0.6], [0.24, 1.15], [0.3, 1], [0.72, 1], [0.92, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.4, 0], [0.46, 1], [0.7, 0.8], [0.95, 0]]);
    case 'cast': return kf(u, [[0, 0], [0.4, 0], [0.48, 0.55], [0.8, 0.3], [1, 0]]);
    case 'hit': return kf(u, [[0, 0], [0.1, 0.35], [1, 0]]);
    case 'attack': return kf(u, [[0, 0], [0.3, 0.12], [0.6, 0]]);
    case 'die': return kf(u, [[0, 0], [0.2, -0.3], [1, -0.7]]);
    default: return 0;
  }
}

export default {
  id: 'barb', name: 'BARB', role: 'archer', faction: 'rogue', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.65, radius: 0.5, walkSpeed: 1.2, cadence: 1.0, scheme: 'dark',
  style: { weapon: 'rifle', heavy: 0, stance: 1.4, grip: GRIP, gripOut: 0.45, freeHand: ['cast', 'deploy'] },
  // near-black armour, blood-red spines, orange markers; other factions keep the dark scheme
  paint: { rogue: { paint: 0x24212a, accent: 0xb3121a, trim: 0xff7a1a } },
  mats: { all: { paint: { rough: 0.3, coat: 0.8 }, accent: { rough: 0.26, coat: 1, metal: 0.15 }, metal: { color: 0x7a818c } }, rogue: { glow: { color: 0xff2c18 } } },
  sockets: { muzzle: ['handR', MUZZLE], core: [0, 0.12, 0.14], head: [0, 0.08, 0.1] },
  events: { attack: [['fire', 0.3], ['fire', 0.37], ['fire', 0.44]], attack_alt: [['fire', 0.33]], cast: [['cast', 0.45]], overdrive: [['cast', 0.05], ['fire', 0.27]] },
  durs: { attack: 0.9, attack_alt: 1.0, cast: 1.2, overdrive: 2.4, die: 1.9 },
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, t = ctx.t;
    let f = st.action ? fanAt(st.action, ctx.su) : st.loop === 'victory' ? 0.65 : 0;
    if (unit.dead) f = -0.7;
    if (!st.action && st.loop === 'victory') f *= Math.min(1, (ctx.vt = (ctx.vt || 0) + dt) / 0.4); else ctx.vt = 0;
    ctx.fan = f;
    const flex = unit.rank >= 4 && !unit.dead ? 1 : 0.25 * (unit.dead ? 0 : 1);
    const rip = (i) => flex * (0.05 * Math.sin(t * 2.3 + i) + 0.025 * Math.sin(t * 5.1 + i * 2));
    const odShake = st.action === 'overdrive' ? Math.sin(t * 60) * 0.04 * Math.max(0, ctx.fan) : 0;
    const k = Math.max(0, ctx.fan), droop = Math.min(0, ctx.fan);
    bones[BI.aux0].rotation.set(0.45 * k + 0.5 * droop + rip(0) + odShake, 0, 0);
    bones[BI.aux0].scale.setScalar(1 + 0.3 * Math.max(0, k));
    bones[BI.aux2].rotation.set(0.3 * k + 0.6 * droop + rip(1), -0.3 * k, -1.2 * k - rip(2) + odShake);
    bones[BI.aux3].rotation.set(0.3 * k + 0.6 * droop + rip(3), 0.3 * k, 1.2 * k + rip(4) - odShake);
    bones[BI.aux2].scale.setScalar(1 + 0.18 * Math.max(0, k)); bones[BI.aux3].scale.setScalar(1 + 0.18 * Math.max(0, k));
  },
  fxHints: { projectile: 'needle', muzzleColor: 0xff3a1a, impact: 'needles', overdrive: 'thornstorm', color: 0xff3020 },
  build,
};
