// ELF RANGER, wild rare archer, "Verdance Watch" (sculptor-18, D21 fantasy). Brief: docs/ROSTER.md `elf_ranger`;
// look: refs/ref_fantasy_01.jpg (the white-haired elf in green). Slender hooded archer: leaf-hemmed green cloak, white hair, gold leaf
// clasps, leather bracers + tall boots, a quiver over the right shoulder and a gold-tipped recurve longbow.
// VALUE: `paint` = faction cloth (green hood / cloak / tunic), `accent` = dark leather + bow wood, `metal` = white hair, bowstring,
// fletching (re-tuned to a pale silver), `trim` = gold leaf work, `skin` = face + hands, `glow` = eyes + leaf magic (6 slots, no `eye`).
// Rank tiers (rare default R1): R0 battered (short ragged cloak, plain bow, no leaf mantle) · R1 hooded cloak, leaf mantle, gold clasp ·
//   R2 long leaf-hemmed cloak, gold circlet, bigger leaf pauldron, fuller quiver · R3 glowing bow runes, arrowhead, brooch, eyes brighter ·
//   R4 golden antler-branch crown with glowing leaves (silhouette), leaf wings on the mantle · R5 a halo of glowing leaves behind the head,
//   glowing cloak hem.
// Technique (a real bow draw): the bow is authored on handL in its aim frame (hand -Y along the arrow, bow up = +Y); setHandQ() puts the
// hand in that frame for any pitch. The string is two aux bones on handL (aux2 top tip, aux3 bottom tip) that post() aims at the nock
// point (right fingers while drawing, the rest point otherwise) and tick() stretches to length. The nocked arrow lives on aux1
// (re-parented to handR), aimed at the bow's arrow rest every frame and hidden after the loose until the hand comes back from the quiver.
import { THREE, fin, pod, PS, LIB, PI, BI } from '../kit.js';

const L = LIB;
const G = 0.07;                                   // bow grip distance in front of the wrist (aim frame)
const TIP = [0, 0.665, G - 0.11];                 // string anchor at the top limb (aim frame, wrist origin); bottom mirrors y
const REST = [0, 0, G - 0.11];                    // string rest point (brace height 0.12)
const ARROW_REST = [0.016, 0.02, G];              // arrow rest on the bow
const NOCK_R = [0, -0.085, 0.0];                  // nocking fingers on handR
const ARROW_LEN = 0.8;
const FRAME = [PI / 2, 0, 0];                     // aim frame -> handL frame (inverse of Q_AIM below)
function rot(e, p) {                              // rotate p by Euler XYZ e (same as PartBuilder.scope)
  const [x, y, z] = e, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  let [a, b, c] = p;
  [a, b] = [a * cz - b * sz, a * sz + b * cz];
  [a, c] = [a * cy + c * sy, -a * sy + c * cy];
  [b, c] = [b * cx - c * sx, b * sx + c * cx];
  return [a, b, c];
}
const TIP_T = rot(FRAME, TIP), TIP_B = rot(FRAME, [TIP[0], -TIP[1], TIP[2]]);
const REST_L = rot(FRAME, REST), AREST_L = rot(FRAME, ARROW_REST), HEAD_L = rot(FRAME, [0.016, 0.02, G + 0.13]);

const DIMS = {
  thigh: 0.46, shin: 0.45, ankle: 0.08, hipX: 0.09, hipY: -0.04, spine: 0.12, chest: 0.23, neck: 0.22, headOff: 0.06,
  clavX: 0.05, clavY: 0.19, shoulder: 0.14, upArm: 0.29, foreArm: 0.27, aux0: [0, 0.2, -0.1],
  parents: { aux1: 'handR', aux2: 'handL', aux3: 'handL' },
  aux1: NOCK_R, aux2: TIP_T, aux3: TIP_B,
};

// ---------- pose machinery ----------
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const _axX = new THREE.Vector3(1, 0, 0), _dn = new THREE.Vector3(0, -1, 0), _fw = new THREE.Vector3(0, 0, 1);
const qe = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const Q_REST_L = qe(-PI / 2 + 0.62, 0.25, -0.42);     // bow hanging low and canted
const Q_REST_R = qe(-0.9, 0.5, 0.6);
const qAim = (pitch, out = new THREE.Quaternion()) => out.setFromAxisAngle(_axX, -PI / 2 - pitch);
// set a hand's ROOT-space orientation (blend w) by solving its local rotation under the current forearm
function setHandQ(P, ctx, side, Q, w = 1) {
  const { q } = L.fkBone(P, ctx, 'foreArm' + side, _p, _q);
  _q2.copy(q).invert().multiply(Q);
  _e.setFromQuaternion(_q2, 'YXZ');
  const i = BI['hand' + side] * 3;
  P[i] += (_e.x - P[i]) * w; P[i + 1] += (_e.y - P[i + 1]) * w; P[i + 2] += (_e.z - P[i + 2]) * w;
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qr = new THREE.Quaternion();
const lerpV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The archer. k = aim (0 bow low .. 1 bow arm extended at the target), d = draw (0 fingers on the string at rest .. 1 anchored),
// pitch = aim elevation (rad), rh = optional right-hand override { to: [x,y,z] root wrist target, w } (loose follow-through, quiver).
function archer(P, ctx, { k = 0, d = 0, pitch = 0, rh = null, lean = 0 } = {}) {
  // torso turns side-on to the target while aiming; head stays on the target
  L.A(P, 'pelvis', 0, -0.42 * k, 0);
  L.A(P, 'spine', -0.04 * k - 0.25 * pitch * k + lean, -0.24 * k, 0.03 * k);
  L.A(P, 'chest', -0.03 * k - 0.15 * pitch * k, -0.2 * k, 0.04 * k);
  L.R(P, 'neck', 0.02 - 0.15 * pitch * k, 0.36 * k, 0);
  L.R(P, 'head', 0.04 - 0.3 * pitch * k, 0.46 * k, 0.12 * k);
  L.RS(P, 'clav', 'L', 0, 0, 0.0); L.RS(P, 'clav', 'R', 0, 0.06 * k, -0.06 * k);
  // bow arm
  const sh = L.fkPoint(P, ctx, 'upArmL', [0, 0, 0], _a);
  const reach = 0.52;
  const aimT = [sh.x - 0.02, sh.y + Math.sin(pitch) * reach - 0.03, sh.z + Math.cos(pitch) * reach];
  const lowT = [0.27, 0.98, 0.15];
  L.armIK(P, ctx, 'L', _b.fromArray(lerpV(lowT, aimT, L.smooth(k))), 0.15 + 0.2 * k);
  _qa.copy(Q_REST_L).slerp(qAim(pitch, _qr), L.smooth(k));
  setHandQ(P, ctx, 'L', _qa, 1);
  // draw arm: fingers on the string rest point -> anchored at the jaw
  const rest = L.fkPoint(P, ctx, 'handL', REST_L, _c);
  const anchor = L.fkPoint(P, ctx, 'head', [-0.035, 0.03, 0.075], _d);
  const nk = _n.copy(rest).lerp(anchor, L.smooth(d));
  _qb.copy(Q_REST_R).slerp(qAim(pitch, _qr), L.smooth(Math.max(k, d)));
  const off = _p.fromArray(NOCK_R).applyQuaternion(_qb);
  let tgt = nk.sub(off);
  if (rh && rh.w > 0) tgt = tgt.lerp(_b.fromArray(rh.to), rh.w);
  L.armIK(P, ctx, 'R', tgt, 0.3 + 0.55 * d);
  setHandQ(P, ctx, 'R', _qb, 1);
}
function base(P, ctx, t, wide = 1) {
  L.idle(P, ctx, t);
  L.R(P, 'pelvis', 0.02, 0, P[BI.pelvis * 3 + 2]);
  L.plant(P, ctx, 0.12, -0.12, wide);
}
const bw = (ctx, nock, vis, glow = 0) => { ctx.bw = { nock, vis, glow }; };
const quiverT = (P, ctx) => L.fkPoint(P, ctx, 'chest', [-0.12, 0.5, -0.12], _c).toArray();

// ---------- geometry helpers ----------
const leafPts = (len, w) => [[0, 0], [w * 0.5, len * 0.28], [w * 0.42, len * 0.68], [0, len], [-w * 0.42, len * 0.68], [-w * 0.5, len * 0.28]];
const leaf = (b, len, w, t = 0.012) => fin(b, leafPts(len, w), t, 0.003);
function addM(b, g, bone, slot, p, r = [0, 0, 0]) {
  b.add(g.clone(), bone, slot, p, r);
  b.add(g, bone, slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], [-1, 1, 1]);
}

// ---------- parts ----------
function head(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  // face: long elven oval, pointed chin, small nose, glowing almond eyes, white brows, long swept ears
  b.add(b.sph(18, 14), H, 'skin', [0, 0.095, 0.02], [0, 0, 0], [0.078, 0.1, 0.09]);
  b.add(b.sph(12, 10), H, 'skin', [0, 0.04, 0.05], [0.3, 0, 0], [0.05, 0.06, 0.05]);
  b.add(b.sph(8, 8), H, 'skin', [0, 0.083, 0.106], [-0.35, 0, 0], [0.011, 0.028, 0.014]);
  b.sym(b.sph(10, 6), H, 'glow', [0.031, 0.1, 0.097], [0, 0.35, 0.22], [0.024, 0.011, 0.01]);
  // ranger warpaint: a dark band across the eyes, so the face reads at battle size (eyes glow on top of it)
  b.sym(b.cbox(0.05, 0.026, 0.01, 0.004), H, 'accent', [0.034, 0.1, 0.09], [0, 0.38, 0.18]);
  b.sym(b.cbox(0.04, 0.011, 0.014, 0.003), H, 'accent', [0.032, 0.124, 0.096], [0, 0.3, 0.28]);
  b.add(b.cbox(0.012, 0.03, 0.01, 0.003), H, 'accent', [0, 0.055, 0.1], [-0.3, 0, 0]);
  b.sym(fin(b, [[0, -0.015], [0.03, 0.0], [0.13, 0.085], [0.02, 0.025], [0, 0.02]], 0.012, 0.004), H, 'skin', [0.07, 0.09, 0.0], [0.15, -0.55, 0.15]);
  // white hair: scalp, a swept fringe, long locks over the shoulders
  b.add(b.sph(18, 14), H, 'metal', [0, 0.118, -0.012], [0, 0, 0], [0.088, 0.1, 0.098]);
  b.add(b.tube([[0.075, 0.15, 0.05], [0.03, 0.185, 0.085], [-0.03, 0.17, 0.095], [-0.075, 0.13, 0.07]], 0.02, 12, 6), H, 'metal');
  b.add(b.tube([[0.06, 0.19, 0.03], [0.0, 0.205, 0.06], [-0.06, 0.18, 0.06]], 0.018, 10, 6), H, 'metal');
  for (const s of [1, -1]) b.add(b.tube([[s * 0.06, 0.12, 0.04], [s * 0.085, 0.04, 0.04], [s * 0.1, -0.06, 0.05], [s * 0.11, -0.17, 0.06]], 0.018, 12, 6), H, 'metal');
  // hood: cowl open at the face, drooping point at the back, gold edge
  b.add(b.sph(20, 14, PI / 2 + 1.0, PI * 2 - 2.0, 0, PI * 0.66), H, 'paint', [0, 0.115, -0.03], [-0.45, 0, 0], [0.118, 0.13, 0.13]);
  b.add(b.tube([[0, 0.2, -0.08], [0, 0.16, -0.15], [0, 0.07, -0.18], [0, -0.04, -0.17]], 0.034, 12, 7), H, 'paint');
  if (!far) b.add(b.tor(0.122, 0.009, 18, 4, PI * 0.95), H, 'trim', [0, 0.11, 0.0], [0.15 - PI / 2 + 0.3, PI / 2, 0], [1, 1.1, 1]);
  // circlet (R2) and antler-branch crown (R4)
  if (rk >= 2) {
    b.add(b.tor(0.09, 0.006, 22, 4, PI * 1.1), H, 'trim', [0, 0.155, 0.01], [PI / 2 - 0.25, 0, PI * 0.95 + PI / 2], [1, 1.12, 1]);
    b.add(leaf(b, 0.04, 0.025), H, rk >= 3 ? 'glow' : 'trim', [0, 0.15, 0.103], [-0.3, 0, 0]);
  }
  if (rk >= 4) for (const s of [1, -1]) {
    b.add(b.tube([[s * 0.07, 0.17, 0.03], [s * 0.1, 0.25, 0.0], [s * 0.12, 0.33, -0.05], [s * 0.15, 0.4, -0.06]], 0.011, 10, 5), H, 'trim');
    b.add(b.tube([[s * 0.1, 0.25, 0.0], [s * 0.17, 0.28, 0.0], [s * 0.21, 0.33, -0.01]], 0.008, 8, 4), H, 'trim');
    b.add(leaf(b, 0.07, 0.04), H, 'glow', [s * 0.15, 0.4, -0.06], [0, 0, -s * 0.4]);
    b.add(leaf(b, 0.06, 0.035), H, 'glow', [s * 0.21, 0.33, -0.01], [0, 0, -s * 1.0]);
  }
  if (rk >= 5) for (let i = 0; i < 12; i++) {
    const a = i / 12 * PI * 2;
    b.add(leaf(b, 0.08, 0.045, 0.008), H, 'glow', [Math.cos(a) * 0.24, 0.14 + Math.sin(a) * 0.24, -0.2], [0, 0, a - PI / 2]);
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  b.add(b.cyl(0.045, 0.05, 0.12, 10), 'neck', 'skin', [0, 0.03, 0.005]);
  // green tunic chest (tapered pod), leather bodice with gold lacing, baldric for the quiver, gold leaf brooch
  b.add(pod(b, 0.33, -0.03, [0.1, 0.165, 0.175, 0.15], 20), 'chest', 'paint', [0, 0, 0.0], [0, 0, 0], [1, 1, 0.74]);
  b.add(pod(b, 0.24, -0.04, [0.15, 0.13, 0.125, 0.135], 18), 'spine', 'accent', [0, 0, 0.0], [0, 0, 0], [1, 1, 0.78]);
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.05, 0.008, 0.01, 0.002), 'spine', 'trim', [0, 0.03 + i * 0.045, 0.102], [0, 0, (i % 2 ? 1 : -1) * 0.35]);
  b.add(b.tube([[-0.13, 0.3, 0.06], [-0.02, 0.16, 0.13], [0.1, 0.0, 0.11], [0.15, -0.08, 0.02]], 0.016, 14, 5), 'chest', 'accent');
  b.add(b.tube([[-0.13, 0.3, -0.06], [-0.02, 0.16, -0.14], [0.1, 0.0, -0.12], [0.15, -0.08, -0.02]], 0.016, 14, 5), 'chest', 'accent');
  // capelet / leaf mantle over the shoulders
  b.add(b.cyl(0.13, 0.25, 0.14, 22), 'chest', 'paint', [0, 0.28, -0.005], [0.05, 0, 0], [1, 1, 0.78]);
  b.add(b.tor(0.075, 0.016, 16, 6), 'chest', 'paint', [0, 0.35, 0.0], [PI / 2, 0, 0], [1, 0.9, 1]);
  if (rk >= 1) {
    const n = far ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, x = Math.sin(a) * 0.235, z = Math.cos(a) * 0.185;
      b.add(leaf(b, 0.11, 0.07), 'chest', i % 3 === 1 ? 'trim' : 'paint', [x, 0.235, z], [PI + 0.35 * Math.cos(a), a, 0]);
    }
  }
  b.add(leaf(b, 0.07, 0.045, 0.016), 'chest', 'trim', [0.0, 0.3, 0.12], [-0.4, 0, PI]);
  b.add(b.sph(8, 6), 'chest', rk >= 3 ? 'glow' : 'trim', [0.0, 0.27, 0.132], [0, 0, 0], 0.016);
  // belt + gold leaf buckle + pouch
  b.add(b.tor(0.135, 0.018, 22, 6), 'pelvis', 'accent', [0, 0.04, 0], [PI / 2, 0, 0], [1, 0.8, 1.4]);
  b.add(leaf(b, 0.06, 0.04, 0.014), 'pelvis', 'trim', [0, 0.01, 0.125], [0, 0, 0]);
  if (!far) b.add(b.rbox(0.06, 0.07, 0.04, 0.012), 'pelvis', 'accent', [-0.13, -0.02, 0.07], [0, -0.7, 0]);
  b.add(pod(b, 0.05, -0.16, [0.14, 0.15, 0.12], 18), 'pelvis', 'accent', [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
}

function limbs(b, o) {
  const D = b.rig.D, far = b.far, rk = o.rank;
  b.sym(b.cyl(0.04, 0.04, D.shoulder, 10), 'clav', 'paint', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  // sleeves (cloth) + leather bracers with gold bands; the bow arm wears a long archer's guard with an embossed leaf
  b.sym(b.sph(12, 10), 'upArm', 'paint', [0.01, -0.02, 0], [0, 0, 0], [0.065, 0.07, 0.065]);
  b.sym(b.cyl(0.055, 0.046, D.upArm, 12), 'upArm', 'paint', [0, -D.upArm / 2, 0]);
  b.sym(b.cyl(0.05, 0.04, D.foreArm * 0.4, 12), 'foreArm', 'paint', [0, -D.foreArm * 0.15, 0]);
  b.sym(b.cyl(0.05, 0.042, D.foreArm * 0.62, 12), 'foreArm', 'accent', [0, -D.foreArm * 0.62, 0]);
  for (const y of [0.36, 0.88]) b.sym(b.cyl(0.052, 0.052, 0.012, 12), 'foreArm', 'trim', [0, -D.foreArm * y, 0]);
  b.add(b.sph(12, 8), 'foreArmL', 'accent', [0, -D.foreArm * 0.6, -0.025], [0, 0, 0], [0.055, 0.12, 0.05]);
  b.add(leaf(b, 0.12, 0.05, 0.01), 'foreArmL', rk >= 3 ? 'glow' : 'trim', [0, -D.foreArm * 0.66, -0.072], [0, PI, PI]);
  // bow-arm leaf pauldron (layered leaves), bigger from R2; R4 leaf wings
  const pl = rk === 0 ? 0 : rk >= 2 ? 4 : 3;
  for (let i = 0; i < pl; i++) b.add(leaf(b, 0.15 + i * 0.015, 0.11, 0.014), 'upArmL', i % 2 ? 'trim' : 'paint', [0.05 + i * 0.012, 0.06 - i * 0.04, -0.03 + i * 0.03], [PI - 0.25, -PI / 2 + 0.25, 0.5 + i * 0.12]);
  // hands: slender, the draw hand in a dark archer's glove
  for (const [s, slot] of [['L', 'skin'], ['R', 'accent']]) {
    b.add(b.rbox(0.045, 0.085, 0.075, 0.016), 'hand' + s, slot, [0, -0.045, 0.004]);
    b.add(b.rbox(0.04, 0.05, 0.065, 0.014), 'hand' + s, slot, [0, -0.1, 0.01], [0.5, 0, 0]);
    b.add(b.rbox(0.025, 0.05, 0.025, 0.01), 'hand' + s, slot, [s === 'L' ? 0.025 : -0.025, -0.05, 0.035], [0.4, 0, 0]);
  }
  // legs: leather leggings, tall boots with gold cuffs, leaf knee guards, tunic tails on the thighs (no skirt clipping)
  b.sym(b.cyl(0.08, 0.06, D.thigh, 12), 'thigh', 'accent', [0, -D.thigh / 2, 0]);
  // quilted leather thigh guard on the outside, two buckled straps, a rounded knee cop
  b.sym(b.sph(12, 10, -0.6, 1.9, 0.25, PI * 0.55), 'thigh', 'accent', [0.0, -D.thigh * 0.5, 0], [0, 0, 0], [0.09, D.thigh * 0.45, 0.085]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.006, D.thigh * 0.36, 0.05, 0.002), 'thigh', 'trim', [0.088, -D.thigh * 0.5, -0.03 + i * 0.03], [0, 0, 0.04]);
  for (const y of [0.3, 0.72]) {
    b.sym(b.tor(0.074 - y * 0.012, 0.008, 16, 4), 'thigh', 'accent', [0, -D.thigh * y, 0], [PI / 2 + 0.12, 0, 0], [1, 1.05, 1]);
    if (!far) b.sym(b.cbox(0.022, 0.02, 0.01, 0.003), 'thigh', 'trim', [0, -D.thigh * y, 0.075 - y * 0.01], [0.12, 0, 0]);
  }
  b.sym(b.sph(12, 8, 0, PI * 2, 0, PI * 0.5), 'shin', 'accent', [0, 0.0, 0.035], [PI / 2 - 0.15, 0, 0], [0.06, 0.04, 0.065]);
  b.sym(b.tor(0.058, 0.006, 14, 3), 'shin', 'trim', [0, 0.0, 0.04], [-0.15, 0, 0]);
  b.sym(b.cyl(0.055, 0.045, D.shin * 0.5, 12), 'shin', 'accent', [0, -D.shin * 0.2, 0]);
  b.sym(b.cyl(0.062, 0.052, D.shin * 0.66, 14), 'shin', 'accent', [0, -D.shin * 0.64, 0]);
  b.sym(b.cyl(0.068, 0.062, 0.05, 14), 'shin', 'accent', [0, -D.shin * 0.32, 0.004], [-0.15, 0, 0]);
  b.sym(b.cyl(0.07, 0.07, 0.012, 14), 'shin', 'trim', [0, -D.shin * 0.3, 0.005], [-0.15, 0, 0]);
  // folded boot cuff flaring over the knee-side + a tooled leather greave down the front
  b.sym(b.cyl(0.085, 0.066, 0.07, 14, true), 'shin', 'accent', [0, -D.shin * 0.25, 0.006], [-0.15, 0, 0]);
  PS(b, 'shin', 'accent', [0.075, D.shin * 0.5, 0.025], [0, -D.shin * 0.62, 0.06], [0.04, 0, 0], { c: 0.01, tx: 1.1, bx: 0.75 });
  if (!far) PS(b, 'shin', 'trim', [0.05, 0.012, 0.012], [0, -D.shin * 0.42, 0.074], [0.04, 0, 0]);
  b.sym(leaf(b, 0.08, 0.045, 0.01), 'shin', 'trim', [0, -D.shin * 0.62, 0.075], [0.04, 0, PI]);
  b.sym(leaf(b, 0.17, 0.09, 0.014), 'shin', 'paint', [0, 0.06, 0.06], [0.15, 0, PI]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.tor(0.06 - i * 0.002, 0.007, 14, 3), 'shin', i === 1 ? 'trim' : 'accent', [0, -D.shin * (0.45 + i * 0.13), 0.0], [PI / 2 + (i % 2 ? 0.25 : -0.25), 0, 0]);
  b.sym(b.rbox(0.085, 0.07, 0.2, 0.03), 'foot', 'accent', [0, -D.ankle + 0.035, 0.05]);
  b.sym(fin(b, [[-0.04, 0], [0.04, 0], [0, 0.06]], 0.06, 0.01), 'foot', 'accent', [0, -D.ankle + 0.035, 0.15], [PI / 2, 0, 0]);
  for (const [z, ry] of [[0.07, 0], [-0.07, PI]]) {
    b.sym(leaf(b, 0.36, 0.17, 0.016), 'thigh', 'paint', [0.0, 0.04, z], [PI + (z > 0 ? -0.12 : 0.12), ry, 0]);
    if (rk >= 1 && !far) b.sym(leaf(b, 0.37, 0.18, 0.01), 'thigh', 'trim', [0.0, 0.045, z * 0.92], [PI + (z > 0 ? -0.12 : 0.12), ry, 0]);
  }
}

// cloth fold detail (touch-up 2): soft vertical drape bands + a few dark creases, tileable (integer frequencies); rgb 128 = neutral
function FOLDS(g, w, h, rnd) {
  const img = g.createImageData(w, h), d = img.data, cr = [0.17, 0.41, 0.63, 0.86].map((c) => c + (rnd() - 0.5) * 0.04);
  for (let y = 0; y < h; y++) {
    const sh = 0.012 * Math.sin((y / h) * PI * 2);
    for (let x = 0; x < w; x++) {
      const u = x / w + sh;
      let v = 128 + 42 * Math.sin(u * PI * 8 + 1.3 * Math.sin(u * PI * 4)) + 10 * Math.sin(u * PI * 22);
      for (const c of cr) { const dd = Math.abs(((u - c + 1.5) % 1) - 0.5); if (dd < 0.012) v -= 46 * (1 - dd / 0.012); }
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v)); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function cloak(b, o) {
  const rk = o.rank, far = b.far, A = 'aux0';
  // a thick lathed shell around the back (axis = body centre), leaf-cut hem; length by rank
  const len = rk === 0 ? 0.62 : rk === 1 ? 0.95 : 1.06, r0 = 0.17, r1 = 0.36, t = 0.016, arc = 3.7;
  const prof = [[r0, 0.02], [r1, -len], [r1 + t, -len], [r0 + t, 0.02], [r0, 0.02]];
  b.add(b.lathe(prof, 26, PI - arc / 2, arc), A, 'paint', [0, 0, 0.1]);
  // dark leather lining just inside the shell (reads at the open front edges) + a dark dyed hem band under the leaf hem
  b.add(b.lathe([[r0 - 0.004, 0.0], [r1 - 0.006, -len + 0.01], [r1 - 0.002, -len + 0.01], [r0, 0.0], [r0 - 0.004, 0.0]], 26, PI - arc / 2 - 0.02, arc + 0.04), A, 'accent', [0, 0, 0.1]);
  const hb = rk === 0 ? 0.08 : 0.15, rh = (y) => r0 + (r1 - r0) * (-y / len);
  b.add(b.lathe([[rh(-len + hb) + t * 0.6, -len + hb], [r1 + t * 1.6, -len - 0.004], [r1 + t * 2.4, -len - 0.004], [rh(-len + hb) + t * 1.6, -len + hb], [rh(-len + hb) + t * 0.6, -len + hb]], 26, PI - arc / 2 - 0.01, arc + 0.02), A, 'accent', [0, 0, 0.1]);
  const n = far ? 7 : 13;
  for (let i = 0; i < n; i++) {
    const a = PI - arc / 2 + 0.12 + (i / (n - 1)) * (arc - 0.24), r = r1 + 0.005;
    const L = (rk === 0 ? 0.08 : 0.14) + (i % 2) * 0.04;
    b.add(leaf(b, L, rk === 0 ? 0.08 : 0.11, 0.014), A, 'paint', [Math.sin(a) * r, -len + 0.02, 0.1 + Math.cos(a) * r], [PI, a + PI, 0]);
    if (rk >= 5) b.add(leaf(b, L * 0.6, 0.05, 0.016), A, 'glow', [Math.sin(a) * (r + 0.006), -len + 0.0, 0.1 + Math.cos(a) * (r + 0.006)], [PI, a + PI, 0]);
  }
  // fold ridges so the big cloak is not one flat cone from behind
  if (!far) for (let i = 0; i < 6; i++) {
    const a = PI - arc * 0.4 + (i / 5) * arc * 0.8, ra = (y) => r0 + (r1 - r0) * (-y / len) + 0.008;
    const pts = [-0.12, -0.45, -0.8, -len + 0.06].map((y) => [Math.sin(a) * ra(y), y, 0.1 + Math.cos(a) * ra(y)]);
    b.add(b.tube(pts, 0.014, 10, 4), A, i % 2 ? 'accent' : 'paint');
  }
  if (rk >= 2) b.add(b.lathe([[r1 + 0.002, -len + 0.08], [r1 + 0.002, -len + 0.05], [r1 + t + 0.004, -len + 0.05], [r1 + t + 0.004, -len + 0.08]], 26, PI - arc / 2, arc), A, 'trim', [0, 0, 0.1]);
  // back hair falls over the cloak
  b.add(b.tube([[0, 0.12, -0.04], [0, 0.02, -0.08], [0, -0.14, -0.1], [0, -0.3, -0.08]], 0.045, 12, 7), A, 'metal');
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.04, 0.12, -0.03], [s * 0.06, 0.0, -0.07], [s * 0.06, -0.18, -0.08]], 0.025, 10, 5), A, 'metal');
  if (rk >= 4) for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) b.add(leaf(b, 0.3 - i * 0.05, 0.12, 0.014), A, i === 1 ? 'trim' : 'paint', [s * (0.16 + i * 0.04), 0.06 - i * 0.04, -0.02], [0, 0, s * (-1.0 - i * 0.35)]);
  }
}

function quiver(b, o) {
  const rk = o.rank, far = b.far, C = 'chest';
  // leather quiver slung behind the right shoulder, gold bands, fletched arrows poking out
  b.scope([-0.07, 0.12, -0.27], [-0.15, 0, 0.45], 1, () => {
    b.add(b.cyl(0.06, 0.05, 0.5, 14), C, 'accent', [0, 0, 0]);
    for (const y of [0.22, 0.0, -0.2]) b.add(b.cyl(0.063, 0.063, 0.016, 14), C, 'trim', [0, y, 0]);
    b.add(leaf(b, 0.1, 0.06, 0.012), C, rk >= 3 ? 'glow' : 'trim', [0, 0.04, -0.06], [0, PI, 0]);
    const n = far ? 3 : rk >= 2 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, x = Math.cos(a) * 0.03, z = Math.sin(a) * 0.03, h = 0.32 + (i % 3) * 0.03;
      b.add(b.cyl(0.005, 0.005, h, 4), C, 'accent', [x, 0.18 + h / 2 - 0.1, z]);
      if (!far) b.add(fin(b, [[0, 0], [0.022, 0.02], [0.022, 0.08], [0, 0.06]], 0.004, 0.001), C, 'metal', [x, 0.18 + h - 0.16, z], [0, a, 0]);
      b.add(fin(b, [[0, 0], [-0.022, 0.02], [-0.022, 0.08], [0, 0.06]], 0.004, 0.001), C, 'paint', [x, 0.18 + h - 0.16, z], [0, a, 0]);
    }
  });
}

function bow(b, o) {
  const rk = o.rank, far = b.far, H = 'handL';
  b.scope([0, 0, 0], FRAME, 1, () => {
    // recurve longbow in the YZ plane: limbs bow back toward the archer, tips flick forward
    for (const s of [1, -1]) {
      const pts = [[0, 0.06, G], [0, 0.27, G - 0.032], [0, 0.47, G - 0.09], [0, 0.595, G - 0.135], [0, 0.675, G - 0.105], [0, 0.71, G - 0.055]].map(([x, y, z]) => [x, y * s, z]);
      b.add(b.tube(pts.slice(0, 4), 0.019, 14, 6), H, 'accent');
      b.add(b.tube(pts.slice(2), 0.012, 10, 5), H, 'accent');
      // gold leaf tips + riser leaves
      b.add(leaf(b, 0.09, 0.04, 0.01), H, rk >= 4 ? 'glow' : 'trim', [0, 0.7 * s, G - 0.07], [s > 0 ? -0.6 : PI + 0.6, PI / 2, 0]);
      b.add(leaf(b, 0.14, 0.05, 0.012), H, rk === 0 ? 'accent' : 'trim', [0.012, 0.08 * s, G + 0.004], [s > 0 ? -0.15 : PI + 0.15, PI / 2, 0]);
      if (rk >= 3 && !far) for (let i = 0; i < 3; i++) {
        const y = 0.2 + i * 0.125, z = G - 0.018 - i * 0.036;
        b.add(b.cbox(0.012, 0.05, 0.03, 0.004), H, 'glow', [0, y * s, z + 0.012], [-0.25 * s - i * 0.15 * s, 0, 0]);
      }
    }
    b.add(b.cyl(0.024, 0.024, 0.15, 12), H, 'paint', [0, 0, G]);
    b.add(b.cyl(0.026, 0.026, 0.012, 12), H, 'trim', [0, 0.075, G]);
    b.add(b.cyl(0.026, 0.026, 0.012, 12), H, 'trim', [0, -0.075, G]);
  });
  // bowstring halves (unit length along -Y; aimed + stretched every frame)
  for (const A of ['aux2', 'aux3']) b.add(b.cyl(0.0035, 0.0035, 1, 4), A, 'metal', [0, -0.5, 0]);
}

function arrow(b, o, bone = 'aux1') {
  const rk = o.rank, far = b.far;
  // along +Z from the nock
  b.add(b.cyl(0.0065, 0.0065, ARROW_LEN, 6), bone, 'accent', [0, 0, ARROW_LEN / 2], [PI / 2, 0, 0]);
  b.add(fin(b, [[-0.016, 0], [0.016, 0], [0.008, 0.05], [0, 0.07], [-0.008, 0.05]], 0.006, 0.002), bone, rk >= 3 ? 'glow' : 'trim', [0, 0, ARROW_LEN - 0.005], [PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * PI * 2;
    b.add(fin(b, [[0, 0], [0.022, 0.015], [0.022, 0.1], [0, 0.085]], 0.004, 0.001), bone, i === 0 ? 'paint' : 'metal', [0, 0, 0.03], [PI / 2, 0, a]);
  }
  if (!far) b.add(b.cyl(0.009, 0.009, 0.02, 6), bone, 'trim', [0, 0, 0.01], [PI / 2, 0, 0]);
}

function build(b, o) {
  b.scope([0, 0.0, 0.0], [0, 0, 0], 1.34, () => head(b, o));
  torso(b, o);
  limbs(b, o);
  cloak(b, o);
  quiver(b, o);
  bow(b, o);
  arrow(b, o);
}

// ---------- anims ----------
const anims = {
  // arrow nocked, bow low and canted; every ~8 s a half-draw to sight the field, then eases off
  idle(P, t, ctx) {
    base(P, ctx, t, 1.05);
    const c = t % 8, s = L.kf(c, [[0, 0], [4.6, 0], [5.3, 1], [6.6, 1], [7.3, 0]]);
    archer(P, ctx, { k: 0.55 * s, d: 0.35 * s });
    L.A(P, 'head', 0, Math.sin(t * 0.6) * 0.08 * (1 - s), 0);
    bw(ctx, 1, 1);
  },
  // light stalking run, low and quiet, bow forward
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'spine', 0.1, 0, 0); L.A(P, 'chest', 0.04, 0, 0); L.A(P, 'head', -0.08, 0, 0);
    P[L.PX + 1] -= 0.04;
    archer(P, ctx, { k: 0.15 });
    bw(ctx, 1, 1);
  },
  // Longbow: raise + draw to the jaw (0.12-0.32), loose (fire 0.36), string hand flies back, reach to the quiver, nock again
  attack(P, u, ctx) {
    base(P, ctx, ctx.t, 1.15);
    const k = L.kf(u, [[0, 0], [0.16, 1], [0.6, 1], [0.95, 0.1], [1, 0]]);
    const d = L.kf(u, [[0, 0], [0.12, 0.05], [0.32, 1], [0.36, 1], [0.37, 0], [1, 0]]);
    const back = L.kf(u, [[0.36, 0], [0.42, 1], [0.52, 1], [0.6, 0], [1, 0]]);
    const qv = L.kf(u, [[0.5, 0], [0.64, 1], [0.72, 1], [0.86, 0], [1, 0]]);
    archer(P, ctx, { k, d });
    if (back > 0.001 || qv > 0.001) {
      const a = L.fkPoint(P, ctx, 'head', [-0.06, 0.03, -0.12], _c).toArray();
      const rh = qv > back ? { to: quiverT(P, ctx), w: qv } : { to: a, w: back };
      archer(P, ctx, { k, d, rh });
    }
    L.A(P, 'chest', -0.03 * back, 0, 0);
    bw(ctx, u < 0.365 ? 1 : 0, u < 0.366 || u > 0.7 ? 1 : 0);
  },
  // double shot: draw-loose (fire 0.3), snatch a second arrow from the quiver, snap-loose again (fire 0.62)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t, 1.2);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.74, 1], [1, 0]]);
    const d = L.kf(u, [[0, 0], [0.1, 0.05], [0.27, 1], [0.3, 1], [0.31, 0], [0.5, 0], [0.58, 1], [0.62, 1], [0.63, 0], [1, 0]]);
    const qv = L.kf(u, [[0.31, 0], [0.4, 1], [0.44, 1], [0.5, 0], [1, 0]]);
    const back = L.kf(u, [[0.62, 0], [0.68, 1], [0.8, 1], [0.95, 0]]);
    const crouch = L.kf(u, [[0, 0], [0.15, 1], [0.7, 1], [1, 0]]);
    P[L.PX + 1] -= 0.08 * crouch;
    L.plant(P, ctx, 0.2, -0.16, 1.25);
    const a = L.fkPoint(P, ctx, 'head', [-0.06, 0.03, -0.12], _c).toArray();
    archer(P, ctx, { k, d, rh: qv > 0.001 ? { to: quiverT(P, ctx), w: qv } : { to: a, w: back } });
    bw(ctx, (u < 0.305 || (u > 0.5 && u < 0.625)) ? 1 : 0, (u < 0.306 || (u > 0.42 && u < 0.626) || u > 0.9) ? 1 : 0);
  },
  // Keen Eye: two fingers drawn across the eyes (they flare), then a breath over the nocked arrowhead (cast 0.55)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t, 1.05);
    const k = L.kf(u, [[0, 0], [0.25, 0.4], [0.8, 0.4], [1, 0]]);
    archer(P, ctx, { k });
    const eye = L.kf(u, [[0, 0], [0.2, 1], [0.45, 1], [0.6, 0], [1, 0]]);
    const tip = L.kf(u, [[0.45, 0], [0.6, 1], [0.85, 1], [1, 0]]);
    const ep = L.fkPoint(P, ctx, 'head', [-0.02 - 0.05 * L.kf(u, [[0.2, 0], [0.45, 1]]), 0.06, 0.2], _c).toArray();
    const hp = L.fkPoint(P, ctx, 'handL', HEAD_L, _d).toArray();
    const target = lerpV(ep, [hp[0] - 0.08, hp[1] + 0.08, hp[2] - 0.05], tip / Math.max(0.001, eye + tip));
    L.armIK(P, ctx, 'R', _b.fromArray(target), 0.35);
    const sh = Math.max(eye, tip);
    const i = BI.upArmR * 3;
    const save = [P[i], P[i + 1], P[i + 2]];
    archer(P, ctx, { k });
    for (let c = 0; c < 3; c++) P[i + c] = P[i + c] + (save[c] - P[i + c]) * sh;
    L.armIK(P, ctx, 'R', _b.fromArray(target), 0.35);
    L.A(P, 'head', 0.12 * eye - 0.1 * tip, 0, 0);
    bw(ctx, 1 - sh, 1, tip);
  },
  // ARROW RAIN: plant wide, lean back, draw high and loose three quick volleys into the sky (fire 0.18 = sim release, 0.36, 0.54),
  // hold the follow-through as the rain falls, then settle
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 1.35);
    const k = L.kf(u, [[0, 0], [0.08, 1], [0.8, 1], [1, 0]]);
    const pitch = 0.95 * L.kf(u, [[0, 0], [0.1, 1], [0.66, 1], [0.9, 0.2], [1, 0]]);
    const drawKeys = [[0, 0], [0.05, 0.1], [0.15, 1], [0.18, 1], [0.185, 0]];
    for (const f of [0.36, 0.54]) drawKeys.push([f - 0.11, 0], [f - 0.04, 1], [f, 1], [f + 0.005, 0]);
    drawKeys.push([1, 0]);
    const d = L.kf(u, drawKeys);
    const qvK = [[0.19, 0], [0.23, 1], [0.25, 0], [0.37, 0], [0.41, 1], [0.43, 0], [1, 0]];
    const qv = L.kf(u, qvK);
    const crouch = L.kf(u, [[0, 0], [0.06, 1], [0.15, 0.4], [0.7, 0.4], [1, 0]]);
    P[L.PX + 1] -= 0.12 * crouch;
    L.plant(P, ctx, 0.24, -0.22, 1.4);
    archer(P, ctx, { k, d, pitch, lean: -0.15 * k, rh: qv > 0.001 ? { to: quiverT(P, ctx), w: qv } : null });
    const loosed = (u > 0.185 && u < 0.25) || (u > 0.365 && u < 0.43) || u > 0.545;
    bw(ctx, loosed ? 0 : 1, loosed && u < 0.9 ? 0 : 1, 1);
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t, 1.05);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.5, 0.4], [1, 0]]), dd = ctx.st.hitDir;
    archer(P, ctx, { k: 0.2 * (1 - k) });
    P[L.PX + 2] -= 0.1 * k; P[L.PX + 1] -= 0.04 * k;
    L.A(P, 'spine', -0.15 * k, 0.12 * k * dd, 0.06 * k * dd); L.A(P, 'chest', -0.12 * k, 0.1 * k * dd, 0);
    L.A(P, 'head', -0.3 * k, -0.2 * k * dd, 0.15 * k * dd);
    L.A(P, 'upArmL', -0.6 * k, 0, 0.2 * k); L.A(P, 'foreArmL', -0.5 * k, 0, 0);
    bw(ctx, 1, 1);
  },
  // staggers, drops to the knees, the arrow falls away, folds onto the side clutching the bow
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const w = L.kf(u, [[0, 1], [0.3, 0.6], [0.6, 0]]);
    if (w > 0.001) {
      const i0 = BI.upArmL * 3, save = P.slice(i0, BI.handR * 3 + 3);
      archer(P, ctx, { k: 0 });
      for (let i = 0; i < save.length; i++) P[i0 + i] = save[i] + (P[i0 + i] - save[i]) * w;
    }
    bw(ctx, 0, u < 0.25 ? 1 : 0);
  },
  // drops in crouched with the cloak flared, rises, draws an arrow from the quiver and nocks it (land 0.4, ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t, 1.1);
    const land = L.kf(u, [[0, 0.35], [0.34, 0.5], [0.4, 1], [0.6, 0.9], [0.84, 0], [1, 0]]);
    P[L.PX + 1] -= 0.36 * land; P[L.PX + 2] += 0.06 * land;
    L.A(P, 'spine', 0.35 * land, 0, 0); L.A(P, 'head', -0.2 * land, 0, 0);
    L.plant(P, ctx, 0.2 + 0.1 * land, -0.12 - 0.26 * land, 1.2, 0, 0.8 * land);
    const qv = L.kf(u, [[0.5, 0], [0.62, 1], [0.7, 1], [0.84, 0]]);
    archer(P, ctx, { k: 0.2 * (1 - land), rh: { to: quiverT(P, ctx), w: qv } });
    bw(ctx, 1, u > 0.7 ? 1 : 0);
  },
  // triumph: wide stance, chest thrown back, bow thrust high and out in the bow hand, the draw hand flung wide; cloak billows.
  // Every ~4 s the bow sweeps in an arc overhead (a flourish that reads at battle size).
  victory(P, t, ctx) {
    base(P, ctx, t, 1.45);
    const k = L.smooth(Math.min(1, t / 0.6)), br = Math.sin(t * 2.2);
    const c = t % 4.2, sw = L.kf(c, [[0, 0], [2.6, 0], [3.1, 1], [3.6, 1], [4.1, 0]]);
    archer(P, ctx, { k: 0 });
    P[L.PX + 1] += 0.02 * k;
    L.A(P, 'pelvis', -0.06 * k, 0.15 * k, 0); L.A(P, 'spine', -0.12 * k, 0.1 * k, 0); L.A(P, 'chest', -0.16 * k, 0.12 * k, 0.05 * k);
    L.R(P, 'neck', -0.1 * k, 0.1 * k, 0); L.R(P, 'head', -0.25 * k, 0.15 * k, 0.1 * k);
    const ax = L.lerp(0.42, 0.05, sw), ay = L.lerp(2.0, 2.18, sw) + 0.03 * br;
    L.armIK(P, ctx, 'L', _b.set(ax, ay, 0.12).lerp(L.fkPoint(P, ctx, 'handL', [0, 0, 0], _c), 1 - k), 0.25);
    setHandQ(P, ctx, 'L', qe(-PI / 2 + 0.3 - 0.4 * sw, 0, 0.5 - 0.8 * sw), k);
    L.armIK(P, ctx, 'R', _d.set(-0.55, 1.62 + 0.03 * br, 0.18).lerp(L.fkPoint(P, ctx, 'handR', [0, 0, 0], _c), 1 - k), 0.4);
    ctx.capeAdd = 0.4 * k;
    bw(ctx, 0, 0);
  },
};

const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _qq = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function aimAux(P, ctx, parent, aux, from, to, rest, lenKey) {
  // aim `aux` (child of `parent`, rest offset `from` in parent space) so its rest axis points at root-space `to`
  const { q } = L.fkBone(P, ctx, parent, _s, _qi);
  _t.fromArray(from).applyQuaternion(q).add(_s);
  _u.copy(to).sub(_t);
  const len = _u.length();
  _u.applyQuaternion(q.invert()).normalize();
  _qq.setFromUnitVectors(rest, _u);
  _e.setFromQuaternion(_qq, 'YXZ');
  const i = BI[aux] * 3;
  P[i] = _e.x; P[i + 1] = _e.y; P[i + 2] = _e.z;
  if (lenKey) ctx[lenKey] = len;
}
const _nock = new THREE.Vector3(), _rest = new THREE.Vector3(), _ar = new THREE.Vector3();

export default {
  id: 'elf_ranger', name: 'ELF RANGER', role: 'archer', faction: 'wild', rarity: 'rare', realm: 'fantasy',
  rig: 'biped', dims: DIMS, height: 1.82, radius: 0.45, walkSpeed: 1.5, cadence: 1.05, scheme: 'bold',
  style: { weapon: 'bow', stance: 1.25 },
  paint: { wild: { paint: 0x2f6a2c, accent: 0x4a3524, trim: 0xd9b24a } },
  mats: {
    all: {
      paint: { rough: 0.85, panel: { grime: 0.08, grimeScale: 20, stretch: 1.2 }, detail: { map: FOLDS, scale: 2.4, albedo: 0.75, rough: 0.3, scratch: 0 } },
      accent: { rough: 0.6, metal: 0.05 },
      metal: { color: 0xe9eef2, metal: 0.15, rough: 0.45 },
      trim: { rough: 0.28 },
      skin: { color: 0xd99b74, rough: 0.5 },
    },
  },
  sockets: { muzzle: ['handL', HEAD_L], core: [0, 0.1, 0.13], head: [0, 0.14, 0.06], hand: ['handR', [0, -0.08, 0]], arrowRest: ['handL', AREST_L] },
  events: {
    attack: [['fire', 0.36]], attack_alt: [['fire', 0.3], ['fire', 0.62]], cast: [['cast', 0.55]],
    overdrive: [['cast', 0.04], ['fire', 0.18], ['fire', 0.36], ['fire', 0.54]], die: [['down', 0.84]], deploy: [['land', 0.4], ['ready', 0.85]],
  },
  durs: { attack: 1.05, attack_alt: 1.15, cast: 1.1, overdrive: 2.2, hit: 0.42, die: 1.8, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.4), an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    const s = ctx.bw || { nock: 1, vis: 1 };
    ctx.bw = null;
    // string: from both tips to the nock (fingers while held, the rest point otherwise)
    L.fkPoint(P, ctx, 'handL', REST_L, _rest);
    L.fkPoint(P, ctx, 'handR', [0, -0.085, 0.0], _nock);
    if (_nock.distanceTo(_rest) > 0.9) s.nock = 0;
    _nock.lerp(_rest, 1 - s.nock);
    aimAux(P, ctx, 'handL', 'aux2', TIP_T, _nock, _dn, 'lenT');
    aimAux(P, ctx, 'handL', 'aux3', TIP_B, _nock, _dn, 'lenB');
    // nocked arrow points from the fingers at the arrow rest
    L.fkPoint(P, ctx, 'handL', AREST_L, _ar);
    aimAux(P, ctx, 'handR', 'aux1', NOCK_R, _ar, _fw, null);
    ctx.arrowVis = s.vis;
    // cloak: hangs off the shoulders, swings back on the run and in the overdrive
    let sway = 0.06 + 0.03 * Math.sin(t * 1.6) + 0.35 * mv;
    if (an === 'overdrive') sway += 0.3 * L.kf(u, [[0, 0], [0.1, 1], [0.7, 0.8], [1, 0]]);
    if (an === 'deploy') sway += 0.9 * L.kf(u, [[0, 1], [0.38, 1], [0.5, 0.1], [1, 0]]);
    sway += ctx.capeAdd || 0; ctx.capeAdd = 0;
    if (an === 'die') sway *= 1 - u;
    P[BI.aux0 * 3] = sway - P[BI.chest * 3] - P[BI.spine * 3] * 0.8 - P[BI.pelvis * 3] * 0.5;
    P[BI.aux0 * 3 + 1] = -P[BI.chest * 3 + 1] * 0.4;
  },
  tick(unit, dt, ctx, bones) {
    bones[BI.aux2].scale.set(1, ctx.lenT || 0.74, 1);
    bones[BI.aux3].scale.set(1, ctx.lenB || 0.74, 1);
    const v = ctx.arrowVis ?? 1;
    bones[BI.aux1].scale.setScalar(v > 0.5 ? 1 : 1e-4);
  },
  fxHints: { projectile: 'leaf_arrow', impact: 'leaf_burst', overdrive: 'arrow_rain', color: 0x86ff6a },
  build,
};
