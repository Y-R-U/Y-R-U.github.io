// WARDEN-3, corporate security patrol frame (sculptor-7). Brief: docs/ROSTER.md `warden`; look: refs/ref_battle_02.png (corporate tanks).
// Surplus mall-cop chassis: squat, wide-stanced, boxy off-white torso, small domed head with one cyan visor slit,
// stun baton (right) and a round riot buckler strapped across the left forearm. Signature: police light bar on the shoulders
// (amber left, cyan right, strobing). Still says PROPERTY OF HALVORSEN across the battery pack.
//
// VALUE (light unit, guide §9.1 inverted): `paint` = off-white panels (dominant), `accent` = navy panels/stripes,
// `metal` = dark navy-gunmetal joints, `trim` = AMBER lamps only (emissive), `glow` = cyan, `eye` = cyan visor.
// Rank ladder (o.rank): R0-1 scuffed paint (kit), dented buckler, mismatched bare-metal right pauldron + rivets ·
//   R2 full panels (matched pauldron, chest plates) + chest number "03" · R3 hardlight edge on the buckler + baton coil glow ·
//   R4 hardlight hex frame around the buckler (silhouette) + light-bar masts · R5 floating holo badge crown above the head.
// Rarity (o.r): rare+ second pauldron layer + forehead lamp · epic+ thigh plates + knee lamps · legendary gold dome crest.
// Technique: hold pose precomputed; the buckler is authored in root space on foreArmL (poseFrame). The light-bar strobes are
// aux2 (amber) / aux3 (cyan), re-parented to the chest and scaled on/off in tick(); the R5 badge is aux1 spinning in tick().
import { THREE, P, PS, plate, fin, discX, arcH, legs, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.3, shin: 0.3, ankle: 0.11, hipX: 0.17, hipY: -0.06, spine: 0.12, chest: 0.22, neck: 0.19, headOff: 0.04,
  clavX: 0.1, clavY: 0.16, shoulder: 0.24, upArm: 0.27, foreArm: 0.26,
  aux0: [0, 0.1, -0.24], aux1: [0, 0.36, -0.02],
  parents: { aux2: 'chest', aux3: 'chest' }, aux2: [0.18, 0.44, -0.15], aux3: [-0.18, 0.44, -0.15],
};
const STYLE = { weapon: 'shield', heavy: 0.85, stance: 1.45 };
const BAR = [0, 0.4, -0.15];                 // light-bar housing centre (chest space)
const SQ = { spine: 0.06, chest: 0.05, neck: -0.03, head: -0.05 };
const BK_R = 0.28;                             // buckler radius
const BAT = { grip: [0, -0.07, 0.0], tip: 0.5 }; // baton along hand +z from the grip

// ---------------- pose helpers ----------------
function squat(P, k = 1) {
  LIB.A(P, 'spine', SQ.spine * k, 0, 0); LIB.A(P, 'chest', SQ.chest * k, 0, 0);
  LIB.A(P, 'neck', SQ.neck * k, 0, 0); LIB.A(P, 'head', SQ.head * k, 0, 0);
  P[LIB.PX + 1] -= 0.035 * k;
}
// buckler arm: left hand IK'd to a point in front of the chest (chest space), so the forearm lies across the body
const SH_T = [0.17, -0.01, 0.3];
const _sv = new THREE.Vector3();
function shieldArm(P, ctx, raise = 0, push = 0, yaw = 0, out = 0) {
  LIB.fkPoint(P, ctx, 'chest', [SH_T[0] + yaw, SH_T[1] + raise, SH_T[2] + push], _sv);
  LIB.armIK(P, ctx, 'L', _sv, 0.9 + out);
  LIB.R(P, 'handL', 0, 0, 0.2);
}
// right arm (baton): offsets from the guard pose
function batonArm(P, ux = 0, uz = 0, fx = 0, hx = 0, uy = 0) {
  LIB.RS(P, 'upArm', 'R', -0.2 + ux, uy, 0.26 + uz);
  LIB.RS(P, 'foreArm', 'R', -0.72 + fx, 0, 0);
  LIB.RS(P, 'hand', 'R', 0.55 + hx, 0, -0.15);
}
function stance(P, ctx, t) {
  LIB.idle(P, ctx, t);
  squat(P);
  shieldArm(P, ctx);
  batonArm(P);
  LIB.plant(P, ctx, 0.12, -0.1, 1.0);
}

// ---- precompute the hold -> buckler frame on foreArmL (root-space authoring)
const RIG = makeRig(DIMS);
const REF_CTX = { D: RIG.D, rig: RIG, t: 0, style: STYLE, st: { gy: 0, gp: 0, tilt: 0, hitDir: 1 }, boneIndex: BI };
const HOLD_P = new Float32Array(LIB.NCH); stance(HOLD_P, REF_CTX, 0);
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const HOLD = poseOf(HOLD_P);
const BK_FRAME = poseFrame(RIG, HOLD, 'foreArmL');
const ELB = LIB.fkPoint(HOLD_P, REF_CTX, 'foreArmL', [0, 0, 0], new THREE.Vector3());
const WRI = LIB.fkPoint(HOLD_P, REF_CTX, 'handL', [0, 0, 0], new THREE.Vector3());
const BK = (() => {
  const f = WRI.clone().sub(ELB).normalize();
  const n = new THREE.Vector3(0.22, 0, 1).addScaledVector(f, -new THREE.Vector3(0.22, 0, 1).dot(f)).normalize();
  const c = ELB.clone().addScaledVector(f, RIG.D.foreArm * 0.52).addScaledVector(n, 0.085);
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), x = new THREE.Vector3().crossVectors(y, n);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n), 'XYZ');
  return { off: c.clone().sub(ELB).toArray(), rot: [e.x, e.y, e.z] };
})();

// ---------------- greebles ----------------
function lamp(b, bone, pos, rot3, r = 0.025, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.02, 12), bone, 'metal', pos, rot3);
  put(b.cyl(r, r, 0.028, 12), bone, slot, pos, rot3);
}
function vent(b, bone, pos, rot3, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'metal', pos, rot3);
  if (b.far) return;
  b.scope(pos, rot3, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.3), 0.035, 0.003), bone, 'accent', [0, -h / 2 + (i + 0.5) * h / n, 0.01]); });
}
function rivets(b, bone, slot, pts, rx = PI / 2, r = 0.011, mirror = false) {
  if (b.far) return;
  for (const p of pts) (mirror ? b.sym : b.add).call(b, b.cyl(r, r, 0.014, 6), bone, slot, p, [rx, 0, 0]);
}
function rodG(b, p, q, r, seg = 8) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, L, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
// hydraulic piston across a joint: cylinder on boneA, rod on boneB (mirrored L/R)
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.024) {
  b.sym(rodG(b, a0, a1, r, 10), boneA, 'metal');
  b.sym(rodG(b, b0, b1, r * 0.55, 8), boneB, 'metal');
  b.sym(b.cyl(r * 1.35, r * 1.35, 0.025, 10), boneA, 'accent', a1);
}
// 7-segment stencil numerals facing +z of the scope frame
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function stencil(b, bone, slot, text, pos, rot3, h = 0.07) {
  const w = h * 0.55, t = h * 0.16, gap = w * 1.5;
  b.scope(pos, rot3, 1, () => {
    [...text].forEach((ch, i) => {
      const cx = (i - (text.length - 1) / 2) * gap;
      for (const s of SEG[ch] || '') {
        const hz = s === 'a' || s === 'd' || s === 'g';
        const x = cx + (s === 'b' || s === 'c' ? w / 2 : s === 'e' || s === 'f' ? -w / 2 : 0);
        const y = s === 'a' ? h / 2 : s === 'd' ? -h / 2 : s === 'g' ? 0 : s === 'b' || s === 'f' ? h / 4 : -h / 4;
        b.add(hz ? b.box(w * 0.8, t, 0.008) : b.box(t, h * 0.42, 0.008), bone, slot, [x, y, 0]);
      }
    });
  });
}
// faux stencil lettering: a row of small blocks (PROPERTY OF HALVORSEN at this size)
function letters(b, bone, slot, pos, rot3, n, h = 0.022, seed = 3) {
  if (b.far) return;
  b.scope(pos, rot3, 1, () => {
    let x = 0; const ws = [];
    for (let i = 0; i < n; i++) { const w = i % 9 === 8 ? 0 : h * (0.5 + ((i * 7 + seed) % 5) * 0.08); ws.push(w); x += w ? w + h * 0.25 : h * 0.7; }
    let cx = -x / 2;
    for (const w of ws) { if (w) { b.add(b.box(w, h, 0.006), bone, slot, [cx + w / 2, 0, 0]); cx += w + h * 0.25; } else cx += h * 0.7; }
  });
}

// ---------------- parts ----------------
function head(b, o) {
  const y = 0.0, z = 0.025;
  b.add(b.cyl(0.07, 0.085, 0.14, 12), 'neck', 'metal', [0, 0.08, 0.0]);
  // small dome + navy brow band + wrap-around visor slit
  b.add(b.sph(22, 12, 0, PI * 2, 0, PI * 0.5), 'head', 'paint', [0, y + 0.06, z], [0, 0, 0], [0.138, 0.13, 0.145]);
  b.add(b.cyl(0.14, 0.13, 0.075, 22), 'head', 'accent', [0, y + 0.025, z], [0, 0, 0], [1, 1, 1.05]);
  b.add(arcH(b, 0.142, 0.026, 2.3, 26, 8), 'head', 'metal', [0, y + 0.04, z], [0, 0, 0], [1, 0.8, 1.05]);
  b.add(arcH(b, 0.156, 0.013, 1.9, 26, 6), 'head', 'eye', [0, y + 0.042, z], [0, 0, 0], [1, 0.9, 1.04]);
  // chin / jaw block + cheek grilles
  P(b, 'head', 'metal', [0.17, 0.07, 0.1], [0, y - 0.03, z + 0.09], [-0.2, 0, 0], { c: 0.02, bx: 0.75 });
  if (!b.far) for (let i = 0; i < 3; i++) b.add(b.box(0.11, 0.008, 0.01), 'head', 'accent', [0, y - 0.016 - i * 0.017, z + 0.142 - i * 0.004], [-0.2, 0, 0]);
  // dome ridge stripe (navy) front-to-back: reads from the battle camera
  b.add(b.cbox(0.045, 0.02, 0.24, 0.008), 'head', 'accent', [0, y + 0.188, z - 0.01], [0.04, 0, 0]);
  // ear sensors: amber lamp left, mic boom right
  b.sym(discX(b, 0.045, 0.05, 14), 'head', 'metal', [0.14, y + 0.035, z - 0.01]);
  b.add(b.cyl(0.02, 0.02, 0.02, 10), 'head', 'trim', [0.168, y + 0.035, z - 0.01], [0, 0, PI / 2]);
  if (!b.far) {
    b.add(rodG(b, [-0.16, y + 0.02, z + 0.0], [-0.1, y - 0.04, z + 0.13], 0.007), 'head', 'metal');
    b.add(b.sph(8, 6), 'head', 'accent', [-0.1, y - 0.04, z + 0.135], [0, 0, 0], 0.016);
    b.add(b.cyl(0.005, 0.008, 0.22, 5), 'head', 'metal', [0.15, y + 0.14, z - 0.07], [-0.25, 0, -0.1]);
    b.add(b.sph(8, 6), 'head', 'glow', [0.162, y + 0.25, z - 0.1], [0, 0, 0], 0.014);
  }
  if (o.r >= 1) lamp(b, 'head', [0, y + 0.115, z + 0.12], [PI / 2 - 0.75, 0, 0], 0.017, 'glow', false);
  if (o.r >= 3) b.add(fin(b, [[-0.1, 0], [0.12, 0], [0.06, 0.08], [-0.06, 0.07]], 0.03, 0.008), 'head', 'trim', [0, y + 0.19, z - 0.02], [0, PI / 2, 0]);
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  // frame + boxy off-white chest, wider at the top
  P(b, 'chest', 'metal', [0.5, 0.4, 0.36], [0, 0.06, -0.01], [0, 0, 0], { c: 0.04 });
  P(b, 'chest', 'paint', [0.62, 0.34, 0.42], [0, 0.08, 0.01], [0, 0, 0], { c: 0.06, tx: 1.06, bx: 0.84, tz: 0.96, bz: 0.88 });
  // layered front plate + navy waist band wrapping the torso
  P(b, 'chest', 'paint', [0.44, 0.2, 0.07], [0, 0.13, 0.215], [0.1, 0, 0], { c: 0.025, tx: 1.05, bx: 0.85 });
  P(b, 'chest', 'accent', [0.6, 0.06, 0.4], [0, -0.06, 0.0], [0, 0, 0], { c: 0.02, tx: 0.96 });
  P(b, 'chest', 'accent', [0.34, 0.08, 0.26], [0, 0.255, 0.0], [0, 0, 0], { c: 0.03, tx: 0.82, tz: 0.8 });   // collar
  PS(b, 'chest', 'accent', [0.08, 0.26, 0.05], [0.27, 0.08, 0.2], [0.05, 0.25, 0], { c: 0.015 });          // side stripes
  if (rk >= 2) {
    // full panels: side armour cheeks + upper pec plates, chest number
    PS(b, 'chest', 'paint', [0.1, 0.24, 0.3], [0.31, 0.06, 0.0], [0, 0, -0.08], { c: 0.025, tx: 0.9 });
    PS(b, 'chest', 'paint', [0.18, 0.1, 0.06], [0.14, 0.24, 0.19], [0.35, 0.1, 0], { c: 0.02 });
    stencil(b, 'chest', 'accent', '03', [-0.1, 0.11, 0.255], [0.1, 0, 0], 0.09);
  } else {
    // starter: exposed frame where the cheek panels were (bare struts + cable)
    PS(b, 'chest', 'metal', [0.05, 0.2, 0.22], [0.29, 0.05, 0.0], [0, 0, -0.08], { c: 0.01 });
    if (!far) b.sym(b.tube([[0.31, 0.15, 0.08], [0.33, 0.05, 0.1], [0.31, -0.04, 0.06]], 0.012, 8, 5), 'chest', 'accent', [0, 0, 0]);
    stencil(b, 'chest', 'accent', '3', [-0.12, 0.11, 0.255], [0.1, 0, 0], 0.08);
  }
  // badge (left chest) + walkie on the right strap
  b.add(fin(b, [[-0.04, 0.03], [0.04, 0.03], [0.035, -0.015], [0, -0.045], [-0.035, -0.015]], 0.015, 0.004), 'chest', 'metal', [0.13, 0.16, 0.262], [0.1, 0, 0]);
  b.add(b.cyl(0.012, 0.012, 0.018, 8), 'chest', 'glow', [0.13, 0.16, 0.272], [PI / 2 + 0.1, 0, 0]);
  b.add(b.cbox(0.06, 0.1, 0.04, 0.01), 'chest', 'metal', [-0.2, 0.2, 0.235], [0.15, 0, 0]);
  if (!far) {
    b.add(b.cyl(0.005, 0.005, 0.1, 5), 'chest', 'metal', [-0.215, 0.29, 0.23], [0.1, 0, 0.15]);
    b.add(b.box(0.03, 0.012, 0.01), 'chest', 'glow', [-0.2, 0.23, 0.258], [0.15, 0, 0]);
    rivets(b, 'chest', 'metal', [[0.18, 0.04, 0.255], [-0.18, 0.04, 0.255], [0.18, 0.21, 0.24], [-0.06, 0.21, 0.24]]);
  }
  // abdomen + utility belt
  b.add(b.cyl(0.18, 0.2, 0.18, 12), 'spine', 'metal', [0, 0.06, 0]);
  for (let i = 0; i < 2; i++) b.add(b.tor(0.195 - i * 0.008, 0.013, 18, 4), 'spine', 'accent', [0, 0.02 + i * 0.07, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.3, 0.12, 0.1], [0, 0.07, 0.15], [0.12, 0, 0], { c: 0.025, tx: 1.1 });
  P(b, 'pelvis', 'metal', [0.42, 0.16, 0.3], [0, -0.01, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'accent', [0.48, 0.06, 0.34], [0, 0.04, 0], [0, 0, 0], { c: 0.015 });                      // belt
  b.add(b.cbox(0.09, 0.05, 0.02, 0.008), 'pelvis', 'metal', [0, 0.04, 0.175]);                              // buckle
  P(b, 'pelvis', 'paint', [0.22, 0.17, 0.07], [0, -0.07, 0.165], [-0.12, 0, 0], { c: 0.022, bx: 0.62 });
  for (const [x, w] of [[0.2, 0.08], [0.11, 0.07], [-0.2, 0.08]]) b.add(b.cbox(w, 0.08, 0.06, 0.012), 'pelvis', 'accent', [x, 0.0, 0.16 - Math.abs(x) * 0.15]);
  PS(b, 'pelvis', 'paint', [0.07, 0.2, 0.26], [0.25, -0.07, 0], [0, 0, 0.16], { c: 0.02, bx: 1.1 });
  b.add(b.cbox(0.06, 0.14, 0.09, 0.012), 'pelvis', 'metal', [-0.28, -0.04, -0.06]);                         // cuff case
}

function shoulders(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank;
  b.sym(b.cyl(0.05, 0.05, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.095);
  b.sym(b.cyl(0.058, 0.05, ua, 10), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.14, ua * 0.5, 0.14], [0.01, -ua * 0.62, 0], [0, 0, 0], { c: 0.02, tx: 1.1, tz: 1.1 });
  b.sym(discX(b, 0.07, 0.14, 12), 'foreArm', 'metal', [0, 0, 0]);
  piston(b, 'upArm', [0.0, -ua * 0.35, -0.07], [0.0, -ua * 0.9, -0.075], 'foreArm', [0.0, 0.02, -0.07], [0.0, -fa * 0.3, -0.06], 0.018);
  // forearms: right = white bracer, left = navy (under the buckler)
  b.add(plate(b, 0.17, fa * 0.78, 0.18, { c: 0.03, tx: 0.86, tz: 0.88 }), 'foreArmR', 'paint', [-0.005, -fa * 0.55, 0]);
  b.add(plate(b, 0.06, fa * 0.5, 0.03, { c: 0.01 }), 'foreArmR', 'accent', [-0.005, -fa * 0.55, 0.095]);
  b.add(plate(b, 0.16, fa * 0.78, 0.17, { c: 0.03, tx: 0.86, tz: 0.88 }), 'foreArmL', 'accent', [0.005, -fa * 0.55, 0]);
  // gauntlets
  b.sym(b.cbox(0.12, 0.11, 0.13, 0.025), 'hand', 'metal', [0, -0.06, 0.01]);
  b.sym(b.cbox(0.125, 0.055, 0.14, 0.018), 'hand', 'accent', [0, -0.125, 0.012]);
  // boxy pauldrons: navy under-dome + off-white cap with a navy stripe
  b.sym(b.sph(16, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.03, 0.02, 0], [0, 0, -0.3], [0.15, 0.12, 0.17]);
  const cap = (s, slot) => {
    const put = (g, bone, sl, p, r) => s === 'L' ? b.add(g, bone + 'L', sl, p, r) : b.add(g, bone + 'R', sl, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]]);
    put(plate(b, 0.27, 0.075, 0.3, { c: 0.03, tx: 0.88, tz: 0.9 }), 'upArm', slot, [0.07, 0.07, 0], [0, 0, -0.38]);
    put(plate(b, 0.23, 0.1, 0.27, { c: 0.025 }), 'upArm', slot, [0.1, -0.01, 0], [0, 0, -0.55]);
    if (slot === 'paint') put(b.box(0.05, 0.012, 0.31), 'upArm', 'accent', [0.08, 0.112, 0], [0, 0, -0.38]);
    else if (!b.far) for (const zz of [-0.1, 0, 0.1]) put(b.cyl(0.013, 0.013, 0.014, 6), 'upArm', 'accent', [0.08, 0.11, zz], [0, 0, -0.38]);
  };
  cap('L', 'paint');
  cap('R', rk >= 2 ? 'paint' : 'metal');          // R0-1: mismatched bare replacement plate on the right
  if (o.r >= 1) PS(b, 'upArm', 'accent', [0.2, 0.05, 0.28], [0.15, -0.075, 0], [0, 0, -0.75], { c: 0.015 });
  b.sym(b.box(0.022, 0.012, 0.2), 'upArm', 'glow', [0.165, -0.04, 0], [0, 0, -0.55]);
}

function lightBar(b, o) {
  const far = b.far, [bx, by, bz] = BAR;
  // shoulder struts + housing
  for (const x of [0.2, -0.2]) b.add(rodG(b, [x, 0.22, -0.1], [x, by - 0.02, bz], 0.018, 8), 'chest', 'metal');
  b.add(b.cbox(0.72, 0.045, 0.14, 0.015), 'chest', 'metal', [bx, by, bz]);
  b.add(b.cbox(0.74, 0.012, 0.15, 0.004), 'chest', 'accent', [bx, by - 0.026, bz]);
  b.sym(b.cbox(0.05, 0.07, 0.15, 0.02), 'chest', 'accent', [0.355, by + 0.02, bz]);
  // dark smoked lenses (the strobes on aux2/aux3 light them up) + a centre speaker
  for (const x of [0.07, 0.17, 0.27]) b.sym(b.cbox(0.088, 0.048, 0.11, 0.012), 'chest', 'metal', [x, by + 0.04, bz]);
  b.add(b.cbox(0.06, 0.05, 0.11, 0.012), 'chest', 'accent', [0, by + 0.04, bz]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.045, 0.006, 0.112), 'chest', 'metal', [0, by + 0.028 + i * 0.012, bz]);
  // strobes: amber (unit's left) on aux2, cyan (right) on aux3; offsets around each bone's joint
  for (const dx of [-0.1, 0, 0.1]) {
    b.add(b.cbox(0.092, 0.052, 0.114, 0.013), 'aux2', 'trim', [dx, 0.04 + by - DIMS.aux2[1], 0]);
    b.add(b.cbox(0.092, 0.052, 0.114, 0.013), 'aux3', 'glow', [dx, 0.04 + by - DIMS.aux3[1], 0]);
  }
  // cable from the light bar into the battery pack
  if (!far) b.add(b.tube([[0.08, by - 0.02, bz - 0.06], [0.1, by - 0.1, bz - 0.1], [0.08, 0.2, -0.27]], 0.012, 8, 5), 'chest', 'accent', [0, 0, 0]);
  if (o.rank >= 4) {
    // twin comms masts on the bar ends
    for (const s of [1, -1]) {
      b.add(b.cyl(0.007, 0.011, 0.3, 6), 'chest', 'metal', [s * 0.34, by + 0.19, bz - 0.02], [-0.12, 0, -s * 0.08]);
      b.add(b.sph(8, 6), 'chest', s > 0 ? 'trim' : 'glow', [s * 0.352, by + 0.34, bz - 0.04], [0, 0, 0], 0.02);
    }
  }
}

function pack(b, o) {
  // battery pack on the back, stencilled PROPERTY OF HALVORSEN
  P(b, 'aux0', 'paint', [0.44, 0.32, 0.14], [0, 0, -0.02], [0, 0, 0], { c: 0.03, tx: 0.94 });
  P(b, 'aux0', 'accent', [0.4, 0.07, 0.03], [0, 0.08, -0.095], [0, 0, 0], { c: 0.01 });
  letters(b, 'aux0', 'paint', [0, 0.08, -0.112], [0, PI, 0], 18, 0.024, 2);
  vent(b, 'aux0', [0.1, -0.06, -0.095], [0, PI, 0], 0.15, 0.12, 4);
  vent(b, 'aux0', [-0.1, -0.06, -0.095], [0, PI, 0], 0.15, 0.12, 4);
  b.add(b.cbox(0.06, 0.04, 0.03, 0.01), 'aux0', 'glow', [0, -0.13, -0.095]);
  b.sym(b.cyl(0.035, 0.035, 0.3, 10), 'aux0', 'metal', [0.24, 0, -0.02]);
  b.sym(b.cyl(0.04, 0.04, 0.02, 10), 'aux0', 'accent', [0.24, 0.15, -0.02]);
}

function buckler(b, o) {
  const far = b.far, rk = o.rank, R = BK_R, bone = 'foreArmL';
  b.scope([0, 0, 0], BK_FRAME, 1, () => b.scope(BK.off, BK.rot, 1, () => {
    // convex off-white face (dented at R0-1), navy rim + band, metal boss with an amber lamp
    let dish = b.lathe([[0, 0.05], [0.09, 0.044], [0.17, 0.03], [R - 0.012, 0.01], [R, -0.004], [R - 0.02, -0.022], [0, -0.022]], 28);
    dish.rotateX(PI / 2);
    if (rk < 2) {
      const dents = [[0.11, 0.09, 0.07, 0.022], [-0.08, -0.13, 0.05, 0.016]];
      dish = dish.toNonIndexed();
      const pa = dish.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        if (z < 0) continue;
        let d = 0; for (const [dx, dy, r, k] of dents) d += k * Math.exp(-((x - dx) ** 2 + (y - dy) ** 2) / (r * r));
        pa.setZ(i, z - d);
      }
      dish.deleteAttribute('normal'); dish.computeVertexNormals();
    }
    b.add(dish, bone, 'accent', [0, 0, 0]);
    b.add(b.tor(R, 0.024, 32, 6), bone, 'paint', [0, 0, -0.002]);
    b.add(b.tor(0.185, 0.009, 28, 4), bone, 'metal', [0, 0, 0.032]);
    b.add(b.cyl(0.062, 0.07, 0.035, 16), bone, 'metal', [0, 0, 0.055], [PI / 2, 0, 0]);
    b.add(b.cyl(0.032, 0.032, 0.02, 14), bone, 'trim', [0, 0, 0.075], [PI / 2, 0, 0]);
    // SECURITY band across the upper face (navy with white blocks)
    b.add(b.cbox(0.3, 0.055, 0.02, 0.006), bone, 'paint', [0, 0.12, 0.044], [-0.22, 0, 0]);
    letters(b, bone, 'accent', [0, 0.12, 0.056], [-0.22, 0, 0], 8, 0.024, 5);
    if (!far) for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + 0.2; b.add(b.cyl(0.012, 0.012, 0.016, 6), bone, 'paint', [Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0.014], [PI / 2, 0, 0]); }
    // straps + mount block to the forearm
    b.add(b.cbox(0.1, 0.16, 0.06, 0.015), bone, 'metal', [0, 0, -0.05]);
    if (rk >= 3) {
      b.add(b.tor(R + 0.012, 0.009, 36, 4), bone, 'glow', [0, 0, 0.004]);
      if (!far) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; b.add(b.cbox(0.03, 0.012, 0.02, 0.004), bone, 'glow', [Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0.01], [0, 0, a + PI / 2]); }
    }
    if (rk >= 4) {
      // hardlight hex frame projected around the buckler: six bars + emitter nodes
      const H = R + 0.13;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * PI * 2 + PI / 6, a1 = a0 + PI / 3;
        const p0 = [Math.cos(a0) * H, Math.sin(a0) * H, 0.01], p1 = [Math.cos(a1) * H, Math.sin(a1) * H, 0.01];
        b.add(rodG(b, p0, p1, 0.009, 5), bone, 'glow');
        b.add(rodG(b, [Math.cos(a0) * (R + 0.01), Math.sin(a0) * (R + 0.01), 0.005], p0, 0.006, 4), bone, 'glow');
        b.add(b.cbox(0.035, 0.035, 0.03, 0.008), bone, 'metal', [Math.cos(a0) * (R + 0.01), Math.sin(a0) * (R + 0.01), 0.005]);
      }
    }
  }));
}

function baton(b, o) {
  const far = b.far, H = 'handR', [gx, gy, gz] = BAT.grip, L = BAT.tip;
  const Z = (g, z0, slot, extra) => b.add(g, H, slot, [gx, gy, gz + z0], [PI / 2, 0, 0], extra);
  Z(b.cyl(0.03, 0.03, 0.03, 10), -0.09, 'metal');
  Z(b.cyl(0.024, 0.024, 0.16, 10), -0.0, 'accent');
  if (!far) for (const z of [-0.05, 0, 0.05]) Z(b.tor(0.025, 0.006, 10, 4), z, 'metal');
  Z(b.cyl(0.046, 0.046, 0.022, 14), 0.09, 'metal');
  Z(b.cyl(0.02, 0.022, 0.28, 10), 0.24, 'accent');
  Z(b.cyl(0.017, 0.017, 0.1, 10), L - 0.06, 'glow');
  for (const z of [L - 0.1, L - 0.06, L - 0.02]) Z(b.tor(0.026, 0.006, 12, 4), z, o.rank >= 3 ? 'glow' : 'metal');
  if (o.r >= 1 && !far) for (const z of [0.16, 0.22]) Z(b.tor(0.023, 0.004, 10, 4), z, 'metal');
  b.add(b.sph(10, 8), H, 'metal', [gx, gy, gz + L], [0, 0, 0], 0.025);
  if (!far) b.symLocal(fin(b, [[-0.012, 0], [0.012, 0], [0, 0.07]], 0.01, 0.003), H, 'metal', [gx + 0.02, gy, gz + L - 0.01], [PI / 2, 0, -0.35]);
}

function legsAndExtras(b, o) {
  const D = b.rig.D;
  legs(b, o, { w: 1.28, foot: 'wide', thighSlot: 'paint', shellSlot: 'accent', shinPlateSlot: 'paint', kneeSlot: 'accent', footSlot: 'accent', outerSlot: 'metal', heelSlot: 'metal' });
  // big knee pads + toe caps + knee pistons
  PS(b, 'shin', 'paint', [0.19, 0.17, 0.09], [0, 0.0, 0.14], [-0.25, 0, 0], { c: 0.03, tx: 0.8 });
  PS(b, 'foot', 'paint', [0.24, 0.06, 0.1], [0, -D.ankle + 0.08, 0.2], [0.25, 0, 0], { c: 0.02, tx: 0.8 });
  piston(b, 'thigh', [0.1, -0.06, -0.06], [0.1, -D.thigh * 0.85, -0.07], 'shin', [0.1, -0.02, -0.06], [0.1, -D.shin * 0.45, -0.05], 0.018);
  if (o.r >= 2) {
    PS(b, 'thigh', 'paint', [0.08, 0.2, 0.22], [0.17, -0.13, 0], [0, 0, 0.08], { c: 0.02 });
    lamp(b, 'shin', [0, -0.01, 0.19], [PI / 2 - 0.25, 0, 0], 0.017, 'trim');
  }
  if (o.rank >= 2) PS(b, 'shin', 'accent', [0.06, 0.18, 0.16], [0.13, -0.18, 0], [0, 0, 0.04], { c: 0.015 });
}

function crown(b, o) {
  if (o.rank < 5) return;
  // floating holo badge above the head (aux1 spins in tick)
  const A = 'aux1';
  const badge = [[-0.09, 0.06], [-0.03, 0.08], [0, 0.11], [0.03, 0.08], [0.09, 0.06], [0.08, -0.03], [0, -0.11], [-0.08, -0.03]];
  b.add(fin(b, badge, 0.02, 0.005), A, 'trim', [0, 0, 0]);
  b.add(fin(b, badge.map(([x, y]) => [x * 0.68, y * 0.68]), 0.03, 0.006), A, 'glow', [0, 0, 0]);
  b.add(b.tor(0.15, 0.007, 32, 4), A, 'glow', [0, -0.02, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.17, 0.004, 32, 4), A, 'trim', [0, -0.02, 0], [PI / 2, 0, 0]);
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  shoulders(b, o);
  lightBar(b, o);
  pack(b, o);
  buckler(b, o);
  baton(b, o);
  legsAndExtras(b, o);
  crown(b, o);
}

// ---------------- anims ----------------
const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // patrol scan: slow head sweep; every ~6.2 s taps the baton on the buckler twice
    const scan = Math.sin(t * 0.55) * 0.35;
    L.A(P, 'neck', 0, scan * 0.5, 0); L.A(P, 'head', 0, scan * 0.6, 0);
    const c = t % 6.2, tap = L.kf(c, [[0, 0], [3.9, 0], [4.25, 1], [5.3, 1], [5.7, 0]]);
    const knock = Math.max(0, Math.sin((c - 4.3) * PI * 4)) * L.kf(c, [[4.25, 0], [4.35, 1], [5.2, 1], [5.3, 0]]);
    batonArm(P, -0.55 * tap - 0.12 * knock, -0.3 * tap, -0.4 * tap + 0.1 * knock, -0.2 * tap, 0.35 * tap);
    shieldArm(P, ctx, 0.02 * tap, 0, -0.03 * tap);
    L.A(P, 'head', 0.12 * tap, -0.25 * tap, 0);
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    squat(P, 1.2);
    const sw = Math.sin(ctx.move.phase * PI * 2);
    shieldArm(P, ctx, 0, 0.03);
    batonArm(P, 0.12 * sw, 0, -0.1, 0.1, 0);
  },
  attack(P, u, ctx, L) {
    // Baton Strike: wind the baton up behind the head, chop down onto the target (impact 0.42), recover
    stance(P, ctx, ctx.t);
    const step = L.kf(u, [[0, 0], [0.3, 0.2], [0.42, 1], [0.7, 0.8], [1, 0]]);
    const tw = L.kf(u, [[0, 0], [0.28, -0.4], [0.43, 0.32], [0.7, 0.2], [1, 0]]);
    P[L.PX + 2] += 0.16 * step; P[L.PX + 1] -= 0.06 * step;
    L.A(P, 'pelvis', 0, tw * 0.3, 0); L.A(P, 'spine', 0.08 * step, tw * 0.4, 0); L.A(P, 'chest', 0.06 * step - 0.1 * L.kf(u, [[0, 0], [0.28, 1], [0.4, 0]]), tw * 0.4, 0);
    L.A(P, 'head', 0, -tw * 0.6, 0);
    L.RS(P, 'upArm', 'R', L.kf(u, [[0, -0.2], [0.28, -2.75], [0.35, -2.8], [0.43, -1.0], [0.68, -0.9], [1, -0.2]]), 0, L.kf(u, [[0, 0.26], [0.28, 0.5], [0.43, 0.15], [1, 0.26]]));
    L.RS(P, 'foreArm', 'R', L.kf(u, [[0, -0.72], [0.28, -1.65], [0.35, -1.75], [0.43, -0.2], [0.68, -0.3], [1, -0.72]]), 0, 0);
    L.RS(P, 'hand', 'R', L.kf(u, [[0, 0.42], [0.28, -0.2], [0.43, 0.7], [0.68, 0.6], [1, 0.42]]), 0, 0);
    shieldArm(P, ctx, -0.03 * step, 0, 0.04 * step);
    L.plant(P, ctx, 0.12 + 0.2 * step, -0.12, 1.05, 0, 0.2 * step);
  },
  attack_alt(P, u, ctx, L) {
    // buckler punch (0.28) then a straight shock jab with the baton (impact 0.52)
    stance(P, ctx, ctx.t);
    const bash = L.kf(u, [[0, 0], [0.12, -0.3], [0.28, 1], [0.42, 0.3], [1, 0]]);
    const jab = L.kf(u, [[0, 0], [0.36, -0.35], [0.52, 1], [0.72, 0.85], [1, 0]]);
    P[L.PX + 2] += 0.1 * Math.max(0, bash) + 0.12 * Math.max(0, jab); P[L.PX + 1] -= 0.05 * Math.abs(jab);
    L.A(P, 'spine', 0.06 * bash + 0.05 * jab, 0.25 * bash - 0.3 * Math.max(0, jab), 0);
    L.A(P, 'chest', 0, 0.15 * bash - 0.2 * Math.max(0, jab), 0);
    shieldArm(P, ctx, 0.02 * Math.max(0, bash), 0.2 * Math.max(0, bash), -0.04 * bash);
    const j = Math.max(0, jab), cock = Math.max(0, -jab);
    L.RS(P, 'upArm', 'R', L.lerp(-0.2, -1.35, j) + 0.3 * cock, -0.15 * j, 0.26 - 0.18 * j + 0.15 * cock);
    L.RS(P, 'foreArm', 'R', L.lerp(-0.72, -0.12, j) - 0.9 * cock, 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0.42, 1.25, j), 0, 0);
    L.plant(P, ctx, 0.14 + 0.18 * j, -0.12 - 0.05 * j, 1.05, 0, 0.25 * j);
  },
  cast(P, u, ctx, L) {
    // Riot Protocol: buckler up high, baton raised and crackling, light bar strobes (cast 0.4)
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]);
    const shake = Math.sin(u * 90) * L.kf(u, [[0.3, 0], [0.4, 1], [0.75, 1], [0.8, 0]]);
    P[L.PX + 1] += 0.03 * k;
    L.A(P, 'spine', -0.08 * k, 0, 0); L.A(P, 'chest', -0.08 * k, 0, 0.02 * shake); L.A(P, 'head', -0.15 * k, 0, 0);
    shieldArm(P, ctx, 0.3 * k, 0.04 * k, 0, 0.3 * k);
    batonArm(P, -2.3 * k, 0.15 * k, 0.35 * k, -0.55 * k + 0.08 * shake, 0);
    L.plant(P, ctx, 0.1, -0.1, 1.1);
  },
  overdrive(P, u, ctx, L) {
    // Lockdown: rises with the baton overhead, slams it into the floor on one knee (impact 0.29 = the sim's 0.6 s windup), holds, rises
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.18, 1], [0.24, 1], [0.29, 0], [1, 0]]);
    const slam = L.kf(u, [[0, 0], [0.22, 0], [0.29, 1], [0.8, 1], [0.95, 0]]);
    const shake = Math.sin(u * 140) * L.kf(u, [[0.06, 0], [0.12, 1], [0.24, 1], [0.27, 0]]);
    P[L.PX + 1] += 0.06 * up - 0.3 * slam; P[L.PX + 2] += 0.1 * slam;
    L.A(P, 'spine', -0.15 * up + 0.3 * slam, 0.12 * slam, 0); L.A(P, 'chest', -0.1 * up + 0.12 * slam, 0.1 * slam, 0.02 * shake);
    L.A(P, 'head', -0.3 * up - 0.15 * slam, 0, 0);
    shieldArm(P, ctx, 0.12 * up - 0.06 * slam, 0.08 * slam, 0.03 * slam);
    L.RS(P, 'upArm', 'R', L.lerp(L.lerp(-0.2, -2.95, up), -1.05, slam), 0, L.lerp(0.26, 0.2, up));
    L.RS(P, 'foreArm', 'R', L.lerp(L.lerp(-0.72, -0.15, up), -0.15, slam) + 0.05 * shake, 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(L.lerp(0.42, -0.5, up), 0.95, slam), 0, 0);
    // kneel: left foot forward, right knee down behind
    L.plant(P, ctx, 0.12 + 0.2 * slam, -0.1 - 0.3 * slam, 1.05 + 0.1 * slam, 0, 0.9 * slam);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.14 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.14 * k, 0.1 * k * d, 0);
    L.A(P, 'head', -0.3 * k, -0.2 * k * d, 0.2 * k * d);
    shieldArm(P, ctx, 0.08 * k, -0.04 * k);
    batonArm(P, 0.3 * k, 0.2 * k, 0.3 * k, 0, 0);
    L.plant(P, ctx, 0.1, -0.12, 1.0);
  },
  die(P, u, ctx, L) {
    // staggers back, knees buckle, sits down hard, then tips over onto its back (down 0.72)
    stance(P, ctx, ctx.t);
    const D = ctx.D, X = L.PX;
    const back = L.kf(u, [[0, 0], [0.1, 1], [0.25, 0.6], [0.4, 0]]);
    const sit = L.kf(u, [[0, 0], [0.18, 0], [0.45, 1], [1, 1]]);
    const lie = L.kf(u, [[0, 0], [0.48, 0], [0.72, 1], [0.78, 0.92], [0.84, 1], [1, 1]]);
    const pelX = -0.15 * sit - 1.1 * lie;
    P[X + 1] = L.lerp(P[X + 1], 0.24 - D.pelvisY, sit) - 0.08 * lie; P[X + 2] = -0.08 * back - 0.12 * sit - 0.12 * lie;
    L.R(P, 'pelvis', pelX, 0.15 * sit, 0.05 * lie);
    L.A(P, 'spine', -0.15 * back + 0.18 * sit - 0.1 * lie, 0, 0.05 * sit);
    L.A(P, 'chest', -0.1 * back + 0.12 * sit - 0.1 * lie, 0, 0);
    L.A(P, 'neck', 0.2 * sit, 0, 0); L.A(P, 'head', 0.25 * sit - 0.2 * lie, 0.4 * lie, 0.25 * lie);
    // arms: buckler arm flops out, baton arm sprawls
    shieldArm(P, ctx, -0.15 * sit, -0.05 * sit, 0.05 * sit);
    L.A(P, 'upArmL', 0.5 * lie, 0, 0.7 * lie);
    batonArm(P, 0.25 * sit + 0.6 * lie, 0.6 * lie, 0.4 * sit, 0.2 * lie, 0);
    // legs: FK, thighs forward along the floor, knees up a little
    const legK = L.kf(u, [[0, 0], [0.15, 0], [0.4, 1], [1, 1]]);
    if (legK < 1) L.plant(P, ctx, 0.1 + 0.15 * legK, -0.1 + 0.1 * legK, 1.1);
    for (const s of ['L', 'R']) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3, sg = s === 'L' ? 1 : -1;
      const thW = L.lerp(-1.25, -1.5, lie) + (s === 'L' ? 0.1 : -0.05) * lie;
      P[i] = L.lerp(P[i], thW - pelX, legK); P[i + 1] = L.lerp(P[i + 1], 0, legK); P[i + 2] = L.lerp(P[i + 2], sg * (0.22 + 0.1 * lie), legK);
      P[j] = L.lerp(P[j], L.lerp(1.2, s === 'L' ? 0.5 : 0.25, lie), legK);
      P[f] = L.lerp(P[f], L.lerp(0.1, -0.4, lie), legK);
    }
  },
  victory(P, t, ctx, L) {
    // twirls the baton every ~2.8 s, then points it skyward; buckler at the chest, little bounce, light bar strobing (tick)
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), c = t % 2.8;
    const twirl = L.kf(c, [[0, 0], [0.2, 0], [0.9, 1], [2.8, 1]]);
    const bounce = Math.max(0, Math.sin(t * 5.2)) * k;
    P[L.PX + 1] += 0.025 * bounce;
    L.A(P, 'spine', -0.1 * k, 0, 0); L.A(P, 'chest', -0.12 * k, 0.15 * k, 0); L.A(P, 'head', -0.25 * k, 0.2 * k, 0);
    shieldArm(P, ctx, 0.1 * k, 0);
    batonArm(P, -2.2 * k - 0.1 * bounce, 0.2 * k, 0.1 * k, (-0.7 + twirl * PI * 4) * k, 0);
    L.plant(P, ctx, 0.12, -0.1, 1.05);
  },
  deploy(P, u, ctx, L) {
    // crouched landing behind the buckler (0.4), stands, raps the baton on the buckler (ready 0.85)
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.62, 0.85], [0.84, 0], [1, 0]]);
    const rap = Math.max(0, Math.sin((u - 0.72) * PI * 10)) * L.kf(u, [[0.7, 0], [0.74, 1], [0.9, 1], [0.94, 0]]);
    const reach = L.kf(u, [[0, 0], [0.66, 0], [0.72, 1], [0.92, 1], [1, 0]]);
    P[L.PX + 1] -= 0.28 * land;
    L.A(P, 'spine', 0.35 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0);
    L.A(P, 'head', 0.45 * L.kf(u, [[0, 0.4], [0.6, 0.6], [0.75, -0.2], [0.9, 0], [1, 0]]), 0, 0);
    shieldArm(P, ctx, 0.06 * land, 0.04 * land);
    batonArm(P, -0.55 * reach - 0.12 * rap + 0.3 * land, -0.3 * reach + 0.25 * land, -0.4 * reach + 0.1 * rap, -0.2 * reach, 0.35 * reach);
    L.plant(P, ctx, 0.2 * land + 0.1, -0.2 * land - 0.08, 1 + 0.35 * land);
  },
};

// light-bar strobe pattern: [amber, cyan] on/off. Idle alternates slowly; actions strobe fast (police double flash)
function strobe(name, t, u, dead) {
  if (dead) return [0, 0];
  const dbl = (c) => (c < 0.12 || (c > 0.2 && c < 0.32)) ? 1 : 0;
  const fast = (rate) => { const c = (t * rate) % 1; return [dbl(c), dbl((c + 0.5) % 1)]; };
  switch (name) {
    case 'cast': return u > 0.25 && u < 0.85 ? fast(2.2) : [1, 1];
    case 'overdrive': return u > 0.05 && u < 0.92 ? fast(2.6) : [1, 1];
    case 'victory': return fast(1.6);
    case 'hit': return [u > 0.3 ? 1 : 0, u > 0.3 ? 1 : 0];
    case 'die': { const f = (Math.sin(t * 47) > 0.2 ? 1 : 0) * (u < 0.55 ? 1 : 0); return [f, u < 0.3 ? f : 0]; }
    case 'deploy': return u < 0.5 ? [0, 0] : u < 0.8 ? fast(2.4) : [1, 0];
    default: { const c = (t / 1.8) % 1; return [c < 0.5 ? 1 : 0, c >= 0.5 ? 1 : 0]; }
  }
}

export default {
  id: 'warden', name: 'WARDEN-3', role: 'tank', faction: 'corporate', rarity: 'common', realm: 'scifi', mirrorSide: 'player',   // buckler (left arm) faces the camera when mirrored on the player side (battle calls unit.setMirror)
  rig: 'biped', dims: DIMS, height: 1.56, radius: 0.62, walkSpeed: 0.95, cadence: 0.85, scheme: 'light',
  style: STYLE,
  // off-white panels, navy stripes, amber lamps; other factions keep their light palette with an amber lamp trim
  paint: {
    corporate: { paint: 0xd6dbe2, accent: 0x1d3263, trim: 0xffa53a },
    rogue: { paint: 0xd8d0c6, accent: 0x8a1416, trim: 0xffa53a },
    experimental: { paint: 0xdcd6ea, accent: 0x4a2596, trim: 0xffa53a },
  },
  mats: {
    all: {
      paint: { rough: 0.42, coat: 0.45, metal: 0.1 }, accent: { rough: 0.4, metal: 0.45 },
      metal: { color: 0x343c4c, metal: 0.8, rough: 0.4, panel: { groove: 0.15, scale: 9 } },
      trim: { emissive: 0xff8a1a, ei: 1.6, rough: 0.35, metal: 0.2 },
    },
  },
  sockets: { muzzle: ['handR', [BAT.grip[0], BAT.grip[1], BAT.tip]], core: [0, 0.12, 0.27], head: [0, 0.05, 0.14], hand: ['handR', [BAT.grip[0], BAT.grip[1], BAT.tip]] },
  events: { attack: [['impact', 0.42]], attack_alt: [['impact', 0.52]], cast: [['cast', 0.4]], overdrive: [['cast', 0.05], ['impact', 0.29]], die: [['down', 0.72]] },
  durs: { attack: 0.95, attack_alt: 1.05, cast: 1.2, overdrive: 2.1, die: 2.0 },
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state;
    const name = st.action || (st.loop === 'victory' ? 'victory' : 'idle');
    const [a, c] = strobe(name, ctx.t, ctx.su ?? 0, unit.dead && !st.action);
    const s = (k) => Math.max(0.001, k);
    bones[BI.aux2].scale.set(1, s(a), s(a));
    bones[BI.aux3].scale.set(1, s(c), s(c));
    if (unit.rank >= 5) { const bb = bones[BI.aux1]; bb.rotation.y = ctx.t * 1.3; bb.position.y = DIMS.aux1[1] + Math.sin(ctx.t * 1.7) * 0.02; }
  },
  fxHints: { projectile: 'melee', muzzleColor: 0x8af0ff, impact: 'shock', overdrive: 'lockdown_ring', color: 0x1fd2ff },
  build,
};
