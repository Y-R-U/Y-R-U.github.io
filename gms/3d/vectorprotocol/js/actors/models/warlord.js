// WARLORD, rogue legendary tank "Gang Sovereign" (sculptor-9). Also the model of map 2's boss REDLINE (boss_redline, x1.35).
// Brief: docs/ROSTER.md `warlord`. A towering gang-king: head sunk between huge spiked gold pauldrons, curling horns, a spiked
// crown, a throne back of twin exhaust stacks framing the head, long gorilla arms dragging two huge chainblades with glowing
// teeth, trophy skulls chained to the belt, a tattered banner tabard.
// VALUE: `paint` = gold on the read-shapes (pauldrons, helm, chest, blades), `accent` = black armour (most of the body),
// `metal` = gunmetal joints / guide bars, `trim` = rogue red lacquer stripes (navy / violet in other tints), `glow` = faction
// teeth / vents / sigils, `eye` = slit eyes.
// Rank tiers (legendary default R3): R0 battered: no crown, short stacks · R1 crown circlet · R2 3rd pauldron layer + extra spikes,
//   knee spikes, banner tails · R3 glowing teeth, throne sigil, vents (base) · R4 trophy plates bolted on both pauldrons + a
//   spiked trophy skull, taller stacks, rim strips · R5 burning horn tips (flicker on aux1), floating ember crown (aux3).
// Technique: chainblades are authored in each hand's bind frame (blade axis = Rx(BLADE_A) * +z); `aimBlade()` solves the hand
// rotation so a blade points along any root-space direction. The chain teeth live on aux0 (handR) / aux2 (handL) and slide along
// the blade axis in tick() (sawtooth = the chain runs; fast when revving). Overdrive spins the whole body (pelvis yaw, feet pivot).
import { THREE, P, PS, plate, fin, discX, legs, LIB, PI, BI } from '../kit.js';

const BLADE_A = 1.0;               // blade pitch in the hand frame (hand -Y = down the forearm)
const sA = Math.sin(BLADE_A), cA = Math.cos(BLADE_A);
const AX = [0, -sA, cA];           // blade axis in hand space
const GRIP_O = [0, -0.09, 0];      // fist centre on the hand bone
const BL = 0.96, BW = 0.17, B0 = 0.3;   // bar length / height / start along the axis (from the fist)
const SP = 0.062;                  // chain tooth spacing
const DIMS = {
  thigh: 0.47, shin: 0.47, ankle: 0.13, hipX: 0.19, hipY: -0.06, spine: 0.15, chest: 0.26, neck: 0.25, headOff: 0.04,
  clavX: 0.1, clavY: 0.24, shoulder: 0.34, upArm: 0.38, foreArm: 0.36,
  parents: { aux0: 'handR', aux1: 'head', aux2: 'handL', aux3: 'head' },
  aux0: [0, 0, 0], aux2: [0, 0, 0], aux1: [0, 0.68, 0.07], aux3: [0, 0.6, -0.02],
};
const L = LIB;
const _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3(), _qf = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const QA_INV = new THREE.Quaternion().setFromEuler(new THREE.Euler(BLADE_A, 0, 0)).invert();

// ---------- pose helpers ----------
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function kv(u, keys) { return [0, 1, 2].map((c) => L.kf(u, keys.map((k) => [k[0], k[1][c]]))); }
// rotate hand `side` so its blade points along `dir` (root space), teeth edge toward `yh`
function aimBlade(P, ctx, side, dir, yh) {
  const { q } = L.fkBone(P, ctx, 'foreArm' + side, _p, _qf);
  _z.set(dir[0], dir[1], dir[2]).normalize();
  _y.set(yh[0], yh[1], yh[2]);
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-4) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
  _y.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _qb.setFromRotationMatrix(_m).multiply(QA_INV);
  _qb.premultiply(q.invert());
  _e.setFromQuaternion(_qb, 'YXZ');
  L.R(P, 'hand' + side, _e.x, _e.y, _e.z);
}
const ARM = { L: ['upArmL', 'foreArmL', 'handL'].map((n) => BI[n] * 3), R: ['upArmR', 'foreArmR', 'handR'].map((n) => BI[n] * 3) };
const _save = new Float32Array(9);
// fist of `side` at `tgt`, blade along `dir`; w blends from the current FK pose
function bladeIK(P, ctx, side, tgt, dir, yh, w = 1, out = 0.35) {
  if (w <= 0.001) return;
  const ch = ARM[side];
  ch.forEach((i, j) => { _save[j * 3] = P[i]; _save[j * 3 + 1] = P[i + 1]; _save[j * 3 + 2] = P[i + 2]; });
  L.armIK(P, ctx, side, _v.set(tgt[0], tgt[1], tgt[2]), out);
  aimBlade(P, ctx, side, dir, yh);
  if (w < 1) ch.forEach((i, j) => { for (let c = 0; c < 3; c++) P[i + c] = _save[j * 3 + c] + (P[i + c] - _save[j * 3 + c]) * w; });
}
// mirrored pair of blades: left values given, right = x-mirrored
const mx = (v) => [-v[0], v[1], v[2]];
function twin(P, ctx, tgt, dir, yh, w = 1, out = 0.35) {
  bladeIK(P, ctx, 'L', tgt, dir, yh, w, out);
  bladeIK(P, ctx, 'R', mx(tgt), mx(dir), mx(yh), w, out);
}
// feet planted, pivoting with the body yaw `a`; lift raises both feet (hop during the spin)
function plantRot(P, ctx, a, zl, zr, wide = 1, lift = 0) {
  const x = ctx.D.hipX * (ctx.style.stance || 1.15) * wide, y = ctx.D.ankle + lift;
  const l = rotY([x, y, zl], a), r = rotY([-x, y, zr], a);
  L.legIK(P, ctx, 'L', l[0], l[1], l[2]);
  L.legIK(P, ctx, 'R', r[0], r[1], r[2]);
}
// hunched gang-king stance: chest forward, head low and level, heavy breathing in the shoulders
const S_HAND = [0.47, 1.02, 0.24], S_DIR = [0.32, -0.62, 0.72], S_YH = [0.1, 0.6, 0.8];
function stance(P, ctx, t) {
  L.idle(P, ctx, t);
  const br = Math.sin(t * 1.3);
  L.pel(P, 0, -0.08 + br * 0.008, 0);
  L.A(P, 'spine', 0.08, 0, 0); L.A(P, 'chest', 0.1 + br * 0.015, 0, 0);
  L.A(P, 'neck', -0.08, 0, 0); L.A(P, 'head', -0.12 - br * 0.01, 0, 0);
  L.R(P, 'clavL', 0, 0, br * 0.03); L.R(P, 'clavR', 0, 0, -br * 0.03);
  L.plant(P, ctx, 0.14, -0.12, 1.3);
  twin(P, ctx, [S_HAND[0], S_HAND[1] + br * 0.012, S_HAND[2]], S_DIR, S_YH, 1, 0.45);
}

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.03, slot = 'eye', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.022, 14), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.032, 14), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false, slot = 'metal') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.2), 0.04, 0.003), bone, slot, [0, -h / 2 + (i + 0.5) * h / n, 0.012]); });
}
function cylAB(b, p, q, r0, r1 = r0, seg = 10) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], Ln = Math.hypot(dx, dy, dz);
  const g = b.cyl(r1, r0, Ln, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.026) {
  b.sym(cylAB(b, a0, a1, r), boneA, 'metal');
  b.sym(cylAB(b, b0, b1, r * 0.55), boneB, 'paint');
  b.sym(b.cyl(r * 1.3, r * 1.3, 0.03, 10), boneA, 'accent', a1);
}
function rivets(b, bone, slot, pts, r = 0.012) {
  if (b.far) return;
  for (const p of pts) b.sym(b.cyl(r, r, 0.014, 6), bone, slot, p[0], p[1] || [PI / 2, 0, 0]);
}
const spike = (b, w, h, t = 0.05) => fin(b, [[-w / 2, 0], [w / 2, 0], [w * 0.08, h * 0.85], [0, h], [-w * 0.08, h * 0.85]], t, h < 0.12 ? 0 : 0.008);
// curved tapering horn: list of [x,y,z] points (bone space), radius r0 -> r1
function horn(b, bone, slot, pts, r0, r1, ringSlot) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + (r1 - r0) * (i / n), rb = r0 + (r1 - r0) * ((i + 1) / n);
    b.sym(cylAB(b, pts[i], pts[i + 1], ra, rb, 9), bone, slot);
    if (i < n - 1) b.sym(b.sph(10, 6), bone, slot, pts[i + 1], [0, 0, 0], rb);
    if (ringSlot && (i === 0 || i === 2)) {
      const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]];
      const c = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
      b.sym(cylAB(b, c.map((v, k) => v - d[k] * 0.12), c.map((v, k) => v + d[k] * 0.12), ra * 1.18, ra * 1.12, 10), bone, ringSlot);
    }
  }
}
// robot skull trophy (faces +z), centred at the origin of the current scope
function skull(b, bone, pos, rot, k = 1, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  b.scope(pos, rot, k, () => {
    put(b.rbox(0.11, 0.1, 0.11, 0.035), bone, 'metal', [0, 0.01, 0]);
    put(b.cbox(0.08, 0.04, 0.06, 0.01), bone, 'metal', [0, -0.045, 0.02]);
    put(b.cbox(0.085, 0.022, 0.02, 0.005), bone, 'accent', [0, 0.012, 0.055]);
    if (!b.far) for (const x of [-0.025, 0.025]) put(b.cyl(0.014, 0.014, 0.02, 8), bone, 'glow', [x, 0.012, 0.062], [PI / 2, 0, 0]);
    if (!b.far) for (let i = 0; i < 4; i++) put(b.cbox(0.012, 0.018, 0.012, 0.003), bone, 'trim', [-0.027 + i * 0.018, -0.06, 0.05]);
  });
}

// ---------- parts ----------
function helm(b, o) {
  const rk = o.rank, far = b.far, y = 0.08, z = 0.04;
  // black under-hood + heavy gold dome with a central ridge, jutting bulldog jaw, brow plate
  b.add(b.rbox(0.25, 0.22, 0.26, 0.06), 'head', 'accent', [0, y, z]);
  P(b, 'head', 'paint', [0.28, 0.13, 0.29], [0, y + 0.075, z - 0.01], [0.12, 0, 0], { c: 0.045, tx: 0.66, tz: 0.8 });
  P(b, 'head', 'trim', [0.035, 0.05, 0.3], [0, y + 0.145, z - 0.01], [0.12, 0, 0], { c: 0.01, tx: 0.7 });
  P(b, 'head', 'paint', [0.27, 0.06, 0.1], [0, y + 0.04, z + 0.14], [0.45, 0, 0], { c: 0.02, tx: 0.8, bx: 1.05 });
  PS(b, 'head', 'paint', [0.06, 0.17, 0.22], [0.13, y - 0.02, z + 0.02], [0, 0, -0.08], { c: 0.018, bz: 0.7, bx: 0.7 });
  // jaw: wide black mandible with a gold chin guard, metal grille teeth
  P(b, 'head', 'accent', [0.24, 0.1, 0.14], [0, y - 0.085, z + 0.12], [-0.1, 0, 0], { c: 0.025, bx: 1.15, tx: 0.95 });
  P(b, 'head', 'paint', [0.18, 0.05, 0.08], [0, y - 0.125, z + 0.17], [-0.25, 0, 0], { c: 0.015, bx: 0.8 });
  if (!far) for (let i = 0; i < 5; i++) b.add(b.cbox(0.022, 0.035, 0.02, 0.005), 'head', 'metal', [-0.06 + i * 0.03, y - 0.075, z + 0.195], [-0.1, 0, 0]);
  // angry slanted slit eyes under the brow
  b.sym(b.cbox(0.075, 0.02, 0.025, 0.006), 'head', 'eye', [0.055, y + 0.005, z + 0.165], [0.05, 0.15, 0.22]);
  b.sym(b.cbox(0.022, 0.012, 0.02, 0.004), 'head', 'eye', [0.1, y + 0.022, z + 0.155], [0.05, 0.3, 0.5]);
  b.sym(discX(b, 0.05, 0.05, 14), 'head', 'metal', [0.14, y, z - 0.02]);
  // horns: black, gold-banded, curling out and up from the temples
  const hp = [[0.13, y + 0.05, z - 0.03], [0.25, y + 0.08, z - 0.04], [0.35, y + 0.15, z - 0.02], [0.41, y + 0.26, z + 0.02], [0.41, y + 0.37, z + 0.04], [0.36, y + 0.45, z + 0.02]];
  horn(b, 'head', 'accent', hp, 0.06, 0.014, 'paint');
  // crown: gold circlet with alternating spikes, red gems (R1+)
  if (rk >= 1) {
    b.add(b.tor(0.12, 0.016, 24, 5), 'head', 'paint', [0, y + 0.13, z - 0.01], [PI / 2 + 0.12, 0, 0]);
    for (let i = 0; i < 7; i++) {
      const a = -1.35 + i * 0.45, h = i % 2 ? 0.075 : 0.12;
      b.scope([Math.sin(a) * 0.12, y + 0.13 + 0.015 * Math.cos(a), z - 0.01 + Math.cos(a) * 0.12], [0, a, 0], 1, () => b.add(spike(b, 0.05, h, 0.02), 'head', 'paint', [0, 0, 0], [0.22, 0, 0]));
      if (!far && i % 2 === 0) b.add(b.cyl(0.014, 0.014, 0.012, 8), 'head', rk >= 3 ? 'glow' : 'trim', [Math.sin(a) * 0.135, y + 0.14, z - 0.01 + Math.cos(a) * 0.135], [PI / 2, a, 0]);
    }
  }
}

function crownFloat(b) {
  // R5: floating ember crown above the head (aux3 bobs and turns)
  const S = 'aux3';
  b.add(b.tor(0.2, 0.014, 32, 5), S, 'glow', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.23, 0.008, 32, 4), S, 'paint', [0, -0.01, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 9; i++) {
    const a = i * PI * 2 / 9, h = i % 3 === 0 ? 0.17 : 0.09;
    b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, h]], 0.016, 0), S, i % 3 === 0 ? 'paint' : 'glow', [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], [0, a, 0]);
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  // trapezoid barrel chest: black frame, gold breastplate (broad top, tapered), red trim chevrons, orange vents
  P(b, 'chest', 'metal', [0.62, 0.46, 0.42], [0, 0.12, -0.04], [0, 0, 0], { c: 0.05 });
  P(b, 'chest', 'accent', [0.86, 0.44, 0.5], [0, 0.1, 0.0], [0.08, 0, 0], { c: 0.07, tx: 1.2, bx: 0.6, tz: 1.0, bz: 0.8 });
  P(b, 'chest', 'paint', [0.7, 0.22, 0.13], [0, 0.18, 0.22], [0.3, 0, 0], { c: 0.05, tx: 1.18, bx: 0.7 });
  PS(b, 'chest', 'paint', [0.28, 0.22, 0.09], [0.17, 0.06, 0.25], [0.15, 0.32, 0.12], { c: 0.035, tx: 1.05, bx: 0.55 });
  PS(b, 'chest', 'trim', [0.3, 0.025, 0.03], [0.16, 0.16, 0.29], [0.18, 0.32, 0.18]);
  PS(b, 'chest', 'trim', [0.24, 0.025, 0.03], [0.15, -0.04, 0.29], [0.1, 0.32, 0.1]);
  // sternum: crowned-skull boss plate (sigil glows R3+)
  b.scope([0, 0.11, 0.3], [0.2, 0, 0], 1, () => {
    b.add(plate(b, 0.15, 0.17, 0.05, { c: 0.02, bx: 0.6, tx: 1.05 }), 'chest', 'accent', [0, 0, 0]);
    b.add(b.rbox(0.09, 0.08, 0.04, 0.02), 'chest', 'paint', [0, 0.01, 0.02]);
    for (const x of [-0.022, 0.022]) b.add(b.cyl(0.013, 0.013, 0.02, 8), 'chest', rk >= 3 ? 'glow' : 'eye', [x, 0.015, 0.045], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) b.add(spike(b, 0.03, 0.05, 0.015), 'chest', 'paint', [-0.03 + i * 0.03, 0.055, 0.02], [0, 0, 0]);
  });
  rivets(b, 'chest', 'metal', [[[0.3, 0.3, 0.26]], [[0.24, 0.02, 0.28]], [[0.07, 0.36, 0.3]]]);
  vent(b, 'chest', [0.27, 0.13, 0.27], [0.12, 0.42, 0.1], 0.1, 0.09, 3, true, rk >= 3 ? 'glow' : 'metal');
  // gorget: a ring of jagged black collar plates the head sinks into (kingly mantle)
  P(b, 'chest', 'accent', [0.36, 0.12, 0.3], [0, 0.27, -0.02], [0, 0, 0], { c: 0.04, tx: 0.8 });
  for (let i = 0; i < 7; i++) {
    const a = -1.3 + i * 0.433;
    b.scope([Math.sin(a) * 0.21, 0.28, Math.cos(a) * 0.13 - 0.07], [0, a, 0], 1, () => b.add(spike(b, 0.1, 0.13 + (i % 2) * 0.04, 0.03), 'chest', i % 2 ? 'paint' : 'accent', [0, 0, 0], [0.5, 0, 0]));
  }
  // waist: segmented abdomen, wide belt with a gold skull buckle
  b.add(b.cyl(0.19, 0.22, 0.22, 14), 'spine', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.2 + i * 0.012, 0.012, 20, 4), 'spine', 'accent', [0, -0.01 + i * 0.06, 0], [PI / 2, 0, 0]);
  P(b, 'pelvis', 'accent', [0.5, 0.11, 0.36], [0, 0.05, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'trim', [0.51, 0.025, 0.37], [0, 0.085, 0]);
  skull(b, 'pelvis', [0, 0.05, 0.19], [0, 0, 0], 1.25);
  // trophy chains: hanging skulls on both hips (rival gang heads)
  for (const s of [1, -1]) {
    const x0 = s * 0.2;
    if (!far) for (let i = 0; i < 4; i++) b.add(b.tor(0.018, 0.006, 8, 4), 'pelvis', 'metal', [x0 + s * 0.018 * i, 0.02 - i * 0.04, 0.17 - i * 0.01], [0, i % 2 ? PI / 2 : 0, 0]);
    skull(b, 'pelvis', [x0 + s * 0.08, -0.17, 0.15], [0.1, s * 0.4, s * 0.15], 0.85);
  }
  // hips: black, gold faulds; front banner tabard (tattered red-black)
  P(b, 'pelvis', 'metal', [0.42, 0.2, 0.32], [0, -0.04, 0], [0, 0, 0], { c: 0.04 });
  PS(b, 'pelvis', 'paint', [0.07, 0.32, 0.28], [0.25, -0.13, 0.0], [0, 0, 0.22], { c: 0.025, bx: 1.15, bz: 1.1 });
  PS(b, 'pelvis', 'trim', [0.018, 0.28, 0.24], [0.288, -0.13, 0.0], [0, 0, 0.22]);
  b.add(plate(b, 0.2, 0.34, 0.035, { c: 0.008, bx: 0.85 }), 'pelvis', 'accent', [0, -0.2, 0.2], [-0.08, 0, 0]);
  b.add(plate(b, 0.06, 0.32, 0.04, { c: 0.006 }), 'pelvis', 'trim', [0, -0.2, 0.215], [-0.08, 0, 0]);
  if (rk >= 2) {
    b.add(fin(b, [[-0.1, 0], [0.1, 0], [0.08, -0.12], [0.03, -0.07], [-0.01, -0.14], [-0.05, -0.08], [-0.1, -0.13]], 0.03, 0.004), 'pelvis', 'accent', [0, -0.37, 0.235], [-0.08, 0, 0]);
    PS(b, 'pelvis', 'accent', [0.16, 0.26, 0.05], [0.14, -0.13, -0.18], [0.18, 0, 0.12], { c: 0.02 });
  }
}

function throne(b, o) {
  const rk = o.rank, far = b.far;
  // throne back: twin gold-banded exhaust stacks rising behind the shoulders, a spiked crest bar and a black backrest
  const H = rk === 0 ? 0.6 : rk >= 4 ? 0.98 : 0.86;
  for (const s of [1, -1]) {
    const x = s * 0.27, z = -0.3;
    b.add(b.cyl(0.07, 0.085, H, 14), 'chest', 'accent', [x, 0.15 + H / 2, z]);
    for (let i = 0; i < 3; i++) b.add(b.cyl(0.082, 0.082, 0.04, 14), 'chest', i === 1 ? 'trim' : 'paint', [x, 0.25 + i * H * 0.3, z]);
    b.add(b.cyl(0.095, 0.07, 0.12, 14), 'chest', 'paint', [x, 0.2 + H, z]);
    b.add(b.cyl(0.06, 0.06, 0.02, 12), 'chest', rk >= 3 ? 'glow' : 'metal', [x, 0.26 + H, z]);
    b.add(spike(b, 0.06, 0.16, 0.04), 'chest', 'paint', [x + s * 0.06, 0.18 + H, z], [0, 0, -s * 0.6]);
    if (!far) b.add(b.tor(0.06, 0.012, 12, 4), 'chest', 'metal', [x, 0.15 + H * 0.15, z], [PI / 2, 0, 0]);
  }
  // backrest panel between the stacks
  P(b, 'chest', 'accent', [0.36, 0.48, 0.05], [0, 0.52, -0.31], [-0.08, 0, 0], { c: 0.02, tx: 0.7 });
  P(b, 'chest', 'paint', [0.04, 0.46, 0.07], [0, 0.52, -0.33], [-0.08, 0, 0], { c: 0.01, tx: 0.6 });
  for (const s of [1, -1]) P(b, 'chest', 'trim', [0.03, 0.42, 0.065], [s * 0.17, 0.5, -0.31], [-0.08, 0, s * 0.12], { c: 0.008 });
  P(b, 'chest', 'paint', [0.54, 0.05, 0.09], [0, 0.79, -0.32], [-0.08, 0, 0], { c: 0.015 });
  P(b, 'chest', 'paint', [0.46, 0.04, 0.09], [0, 0.27, -0.29], [-0.08, 0, 0], { c: 0.012 });
  // crest: a fan of spikes over the backrest (the crown of the throne)
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.32, h = i === 2 ? 0.28 : i % 2 ? 0.16 : 0.2;
    b.add(spike(b, 0.07, h, 0.035), 'chest', i === 2 ? 'paint' : 'accent', [Math.sin(a) * 0.18, 0.8 + Math.cos(a) * 0.02, -0.33], [-0.08, 0, -a * 0.8]);
  }
  // gang sigil on the backrest (front face, behind the head): crossed blades under a crown
  if (rk >= 3) {
    b.scope([0, 0.62, -0.275], [-0.08, 0, 0], 0.8, () => {
      for (const s of [1, -1]) b.add(b.cbox(0.02, 0.26, 0.012, 0.004), 'chest', 'glow', [0, 0, 0], [0, 0, s * 0.6]);
      for (let i = 0; i < 3; i++) b.add(spike(b, 0.04, 0.07, 0.012), 'chest', 'glow', [-0.05 + i * 0.05, 0.1, 0], [0, 0, 0]);
    });
  }
  // back plate + vents
  P(b, 'chest', 'paint', [0.56, 0.3, 0.12], [0, 0.18, -0.25], [-0.15, 0, 0], { c: 0.035 });
  vent(b, 'chest', [0, 0.12, -0.32], [0, PI, 0], 0.26, 0.14, 4, false, rk >= 3 ? 'glow' : 'metal');
}

function pauldrons(b, o) {
  const rk = o.rank;
  // huge stacked gold plates over a black dome, red trim edges, spikes, amber lamps
  b.sym(b.sph(20, 12, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.03, 0.02, 0], [0, 0, -0.3], [0.22, 0.2, 0.24]);
  const layers = rk >= 2 ? 3 : 2;
  for (let i = 0; i < layers; i++) {
    const w = 0.44 - i * 0.03, d = 0.5 - i * 0.035, y = 0.12 - i * 0.11, x = 0.08 + i * 0.04, rz = -0.3 - i * 0.17;
    PS(b, 'upArm', i === 1 ? 'accent' : 'paint', [w, 0.11, d], [x, y, 0], [0, 0, rz], { c: 0.04, tx: 0.84, tz: 0.88 });
    PS(b, 'upArm', 'trim', [w * 0.94, 0.022, d * 0.95], [x + 0.008, y - 0.06, 0], [0, 0, rz]);
    PS(b, 'upArm', 'accent', [w * 0.9, 0.04, d * 0.9], [x + 0.01, y - 0.08, 0], [0, 0, rz]);
  }
  PS(b, 'upArm', 'paint', [0.2, 0.13, 0.06], [0.08, 0.16, 0.2], [0.45, 0, -0.3], { c: 0.02, tx: 0.7 });
  PS(b, 'upArm', 'accent', [0.22, 0.13, 0.06], [0.08, 0.14, -0.21], [-0.45, 0, -0.3], { c: 0.02, tx: 0.7 });
  // spikes: a big horn spike rising from each pauldron, smaller rakes behind
  b.sym(spike(b, 0.1, 0.3, 0.07), 'upArm', 'accent', [0.12, 0.19, 0.02], [0, 0, -0.3]);
  b.sym(spike(b, 0.07, 0.18, 0.05), 'upArm', 'paint', [0.2, 0.15, -0.12], [-0.5, 0, -0.6]);
  if (rk >= 2) b.sym(spike(b, 0.06, 0.15, 0.045), 'upArm', 'accent', [0.24, 0.1, 0.14], [0.45, 0, -0.8]);
  lamp(b, 'upArm', [0.2, 0.1, 0.22], [1.15, 0, -0.35], 0.028, rk >= 3 ? 'glow' : 'eye');
  rivets(b, 'upArm', 'metal', [[[0.22, 0.09, -0.15], [0, 0, -0.3 + PI / 2]], [[0.28, -0.02, -0.12], [0, 0, -0.5 + PI / 2]], [[0.27, -0.02, 0.13], [0, 0, -0.5 + PI / 2]]]);
  if (!b.far) for (let i = 0; i < 3; i++) PS(b, 'upArm', 'metal', [0.022, 0.035, 0.4], [0.05 + i * 0.08, 0.18 - i * 0.03, 0], [0, 0, -0.3]);
  if (rk >= 3) b.sym(b.cbox(0.012, 0.012, 0.38, 0.003), 'upArm', 'glow', [0.25, 0.04, 0], [0, 0, -0.48]);
  if (rk >= 4) {
    // trophy plates: scavenged rival-gang armour bolted over each pauldron, stencilled skull + bolts; skull spiked on the left
    b.scope([0.24, 0.0, 0.0], [0, 0, -0.62], 1, () => {
      PS(b, 'upArm', 'metal', [0.05, 0.24, 0.3], [0, 0, 0], [0, 0, 0], { c: 0.02, bz: 0.85 });
      PS(b, 'upArm', 'trim', [0.056, 0.03, 0.31], [0, 0.07, 0]);
      PS(b, 'upArm', 'trim', [0.056, 0.03, 0.31], [0, -0.07, 0]);
      b.sym(b.rbox(0.03, 0.08, 0.08, 0.02), 'upArm', 'glow', [0.02, 0, 0.02]);
      if (!b.far) for (const [yy, zz] of [[0.09, 0.12], [-0.09, 0.12], [0.09, -0.12], [-0.09, -0.12]]) b.sym(b.cyl(0.014, 0.014, 0.02, 6), 'upArm', 'paint', [0.03, yy, zz], [0, 0, PI / 2]);
    });
    skull(b, 'upArmL', [0.2, 0.27, -0.06], [-0.2, 0.5, -0.3], 1.1);
    b.add(spike(b, 0.03, 0.2, 0.025), 'upArmL', 'metal', [0.2, 0.25, -0.06], [0, 0.5, -0.3]);
    b.sym(b.cbox(0.012, 0.18, 0.012, 0.003), 'chest', 'glow', [0.34, 0.16, 0.16], [0.1, 0, 0.5]);
  }
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, rk = o.rank;
  b.sym(b.cyl(0.07, 0.07, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.12);
  b.sym(b.cyl(0.085, 0.075, ua, 12), 'upArm', 'accent', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.19, ua * 0.4, 0.2], [0.02, -ua * 0.64, 0.01], [0, 0, 0], { c: 0.03, tx: 1.1, tz: 1.1 });
  PS(b, 'upArm', 'trim', [0.195, 0.02, 0.205], [0.02, -ua * 0.43, 0.01]);
  piston(b, 'upArm', [0, -0.13, -0.11], [0, -ua + 0.05, -0.115], 'foreArm', [0, 0.02, -0.115], [0, -0.13, -0.12], 0.024);
  // elbow cop with a spike, massive gold gauntlet with an exhaust pipe and vents
  b.sym(discX(b, 0.09, 0.2, 14), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(spike(b, 0.07, 0.15, 0.05), 'foreArm', 'accent', [0, 0.0, -0.08], [-1.26, 0, 0]);
  b.sym(b.cyl(0.085, 0.07, fa * 0.9, 12), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
  PS(b, 'foreArm', 'accent', [0.21, fa * 0.64, 0.22], [0.012, -fa * 0.6, 0], [0, 0, 0], { c: 0.035, tx: 1.18, tz: 1.12, bx: 0.88, bz: 0.88 });
  PS(b, 'foreArm', 'paint', [0.07, fa * 0.6, 0.06], [0.07, -fa * 0.6, 0.09], [0, 0, -0.05], { c: 0.015, tx: 1.2, bx: 0.8 });
  PS(b, 'foreArm', 'paint', [0.22, 0.04, 0.23], [0.012, -fa * 0.82, 0], [0, 0, 0], { c: 0.01 });
  PS(b, 'foreArm', 'trim', [0.215, 0.024, 0.225], [0.012, -fa * 0.36, 0]);
  PS(b, 'foreArm', 'accent', [0.23, 0.05, 0.24], [0.012, -fa * 0.9, 0], [0, 0, 0], { c: 0.012 });
  vent(b, 'foreArm', [0.0, -fa * 0.6, 0.118], [0, 0, 0], 0.11, 0.1, 3, true, rk >= 3 ? 'glow' : 'metal');
  b.sym(b.cyl(0.024, 0.028, 0.2, 10), 'foreArm', 'metal', [0.11, -fa * 0.55, -0.07], [0, 0, 0.12]);
  b.sym(b.cyl(0.03, 0.024, 0.04, 10), 'foreArm', 'paint', [0.122, -fa * 0.55 + 0.11, -0.07], [0, 0, 0.12]);
  if (!far) b.sym(b.cyl(0.018, 0.018, 0.02, 10), 'foreArm', 'eye', [0.115, -fa * 0.3, 0.06], [0, 0, PI / 2]);
  // fists clamped on the chainblade hilts, knuckle studs
  for (const s of ['L', 'R']) {
    b.add(b.rbox(0.13, 0.14, 0.15, 0.03), 'hand' + s, 'accent', [0, -0.08, 0.005]);
    b.add(plate(b, 0.135, 0.08, 0.12, { c: 0.02, tx: 0.85 }), 'hand' + s, 'paint', [0, -0.06, 0.035], [0.3, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(spike(b, 0.03, 0.04, 0.02), 'hand' + s, 'metal', [-0.04 + i * 0.04, -0.11, 0.09], [PI / 2 - 0.3, 0, 0]);
  }
}

// chainblade on hand `H`, teeth on `T` (an aux bone re-parented to that hand); s = outward side (+1 left hand)
function chainblade(b, o, H, T, s) {
  const rk = o.rank, far = b.far;
  b.scope(GRIP_O, [BLADE_A, 0, 0], 1, () => {
    // hilt + pommel
    b.add(b.cyl(0.032, 0.032, 0.24, 10), H, 'metal', [0, 0, -0.02], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.034, 0.007, 10, 4), H, 'trim', [0, 0, -0.1 + i * 0.05]);
    b.add(b.cyl(0.05, 0.04, 0.05, 10), H, 'paint', [0, 0, -0.16], [PI / 2, 0, 0]);
    // motor housing: black block, gold cover, exhaust pipe on the outer side, glowing intake
    b.add(b.rbox(0.12, 0.2, 0.22, 0.03), H, 'accent', [0, 0, 0.18]);
    b.add(plate(b, 0.13, 0.16, 0.14, { c: 0.025, tx: 0.8 }), H, 'paint', [0, 0.01, 0.17], [0, 0, 0]);
    b.add(b.cbox(0.135, 0.03, 0.16, 0.008), H, 'trim', [0, -0.06, 0.17]);
    b.add(b.cyl(0.026, 0.03, 0.18, 10), H, 'metal', [s * 0.075, 0.05, 0.1], [PI / 2 - 0.5, 0, 0]);
    b.add(b.cyl(0.02, 0.02, 0.02, 10), H, rk >= 3 ? 'glow' : 'accent', [s * 0.075, 0.095, 0.02], [PI / 2 - 0.5, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.012, 0.11, 0.016, 0.004), H, rk >= 3 ? 'glow' : 'metal', [s * 0.063, -0.01, 0.12 + i * 0.04]);
    b.add(b.cyl(0.035, 0.035, 0.14, 12), H, 'metal', [0, 0, 0.18], [0, 0, PI / 2]);
    // guide bar: black core plate, gold spine, red stripe, gunmetal rails along both edges, nose sprocket
    const z0 = B0, zc = B0 + BL / 2;
    b.add(b.cbox(0.036, BW, BL, 0.01), H, 'accent', [0, 0, zc]);
    b.add(b.cbox(0.044, BW * 0.36, BL * 0.9, 0.008), H, 'paint', [0, 0, zc - 0.01]);
    b.add(b.cbox(0.048, 0.012, BL * 0.8, 0.003), H, 'trim', [0, 0, zc - 0.03]);
    for (const e of [1, -1]) b.add(b.cbox(0.028, 0.016, BL, 0.005), H, 'metal', [0, e * BW / 2, zc]);
    b.add(discX(b, BW / 2 + 0.005, 0.04, 18), H, 'metal', [0, 0, z0 + BL]);
    b.add(discX(b, 0.03, 0.05, 10), H, 'paint', [0, 0, z0 + BL]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.012, 0.012, 0.05, 6), H, 'metal', [0, 0, z0 + 0.12 + i * 0.22], [0, 0, PI / 2]);
    // chain teeth (slide along the axis on T): raked wedges on both edges
    const n = Math.floor((BL - 0.04) / SP);
    const tooth = fin(b, [[-0.026, 0], [0.024, 0], [0.006, 0.026], [-0.016, 0.03]], 0.032, 0);
    const tip = fin(b, [[-0.016, 0.022], [0.008, 0.022], [-0.002, 0.042], [-0.018, 0.046]], 0.026, 0);
    const tslot = rk >= 2 ? 'glow' : 'trim';
    for (let i = 0; i < n; i++) {
      const z = z0 + 0.02 + i * SP;
      for (const [e, rx] of [[1, 0], [-1, PI]]) {
        b.add(tooth.clone(), T, 'metal', [0, e * (BW / 2 + 0.004), z], [rx, PI / 2, 0]);
        b.add(tip.clone(), T, tslot, [0, e * (BW / 2 + 0.004), z], [rx, PI / 2, 0]);
      }
    }
  });
}

// plating density: tassets, ribs, collar, knee cops, sabatons
function plating(b, o) {
  const D = b.rig.D, far = b.far, rk = o.rank;
  PS(b, 'thigh', 'accent', [0.22, 0.17, 0.06], [0.02, -0.05, 0.17], [-0.2, 0, 0.06], { c: 0.02, bx: 1.1 });
  PS(b, 'thigh', 'paint', [0.2, 0.1, 0.06], [0.02, -0.02, 0.19], [-0.24, 0, 0.06], { c: 0.02, bx: 1.12, tx: 0.9 });
  PS(b, 'thigh', 'trim', [0.19, 0.02, 0.05], [0.02, -0.115, 0.215], [-0.24, 0, 0.06]);
  PS(b, 'chest', 'accent', [0.07, 0.28, 0.3], [0.36, 0.1, -0.02], [0, 0, 0.16], { c: 0.02, bx: 0.8 });
  if (!far) for (let i = 0; i < 3; i++) PS(b, 'chest', 'metal', [0.075, 0.016, 0.26], [0.365, 0.02 + i * 0.08, -0.02], [0, 0, 0.16]);
  if (!far) for (let i = 0; i < 2; i++) P(b, 'spine', 'paint', [0.3 - i * 0.04, 0.025, 0.07], [0, 0.17 - i * 0.08, 0.21], [0.1, 0, 0]);
  PS(b, 'shin', 'paint', [0.16, 0.08, 0.06], [0, 0.08, 0.19], [-0.35, 0, 0], { c: 0.015, tx: 0.7 });
  PS(b, 'foot', 'trim', [0.17, 0.035, 0.14], [0, -D.ankle + 0.14, 0.14], [0.32, 0, 0], { c: 0.01 });
  PS(b, 'foot', 'accent', [0.16, 0.035, 0.12], [0, -D.ankle + 0.11, 0.26], [0.25, 0, 0], { c: 0.01 });
  if (!far) for (const x of [-0.05, 0.05]) b.sym(spike(b, 0.03, 0.08, 0.03), 'foot', 'metal', [x, -D.ankle + 0.05, 0.33], [PI / 2, 0, 0]);
  PS(b, 'foreArm', 'accent', [0.22, 0.05, 0.23], [0.012, -D.foreArm * 0.2, 0], [0, 0, 0], { c: 0.012 });
}

function build(b, o) {
  b.scope([0, -0.02, 0.03], [0, 0, 0], 1.28, () => helm(b, o));
  if (o.rank >= 5) {
    crownFloat(b);
    // burning horn tips: flame tongues on aux1 (sits between the tips; y-scale flickers in tick)
    for (const [k, h, rz] of [[1, 0.24, -0.2], [0.7, 0.16, 0.35], [0.6, 0.14, -0.7]]) {
      b.sym(fin(b, [[-0.032 * k, 0], [0.032 * k, 0], [0.012, h * 0.6], [0, h], [-0.016, h * 0.55]], 0.032, 0), 'aux1', 'glow', [0.46, -0.01, 0], [0, 0, rz]);
      b.sym(fin(b, [[-0.032 * k, 0], [0.032 * k, 0], [0.012, h * 0.6], [0, h], [-0.016, h * 0.55]], 0.032, 0), 'aux1', 'glow', [0.46, -0.01, 0], [0, PI / 2, rz]);
    }
  }
  plating(b, o);
  torso(b, o);
  throne(b, o);
  pauldrons(b, o);
  armsAndHands(b, o);
  chainblade(b, o, 'handL', 'aux2', 1);
  chainblade(b, o, 'handR', 'aux0', -1);
  legs(b, o, { w: 1.38, knee: o.rank >= 2 ? 'spike' : 'cap', foot: 'wide', thighSlot: 'accent', shellSlot: 'accent', shinPlateSlot: 'paint', kneeSlot: 'paint', footSlot: 'accent', outerSlot: 'paint' });
  PS(b, 'thigh', 'accent', [0.2, 0.26, 0.08], [0.02, -0.24, 0.15], [0.05, 0, 0.04], { c: 0.025, tx: 1.1, bx: 0.8 });
  PS(b, 'thigh', 'paint', [0.06, 0.24, 0.09], [0.06, -0.24, 0.16], [0.05, 0, 0.04], { c: 0.012, bx: 0.7 });
  PS(b, 'thigh', 'trim', [0.2, 0.022, 0.085], [0.02, -0.105, 0.155]);
  piston(b, 'thigh', [0, -0.1, -0.13], [0, -0.4, -0.14], 'shin', [0, 0.0, -0.15], [0, -0.17, -0.15], 0.026);
  PS(b, 'shin', 'trim', [0.03, 0.26, 0.035], [0, -0.18, 0.24], [0.12, 0, 0]);
  lamp(b, 'shin', [0.1, -0.08, 0.2], [PI / 2 - 0.12, 0, 0], 0.018, o.rank >= 3 ? 'glow' : 'eye');
  PS(b, 'shin', 'accent', [0.07, 0.24, 0.2], [0.15, -0.22, 0], [0, 0, 0.06], { c: 0.015 });
  vent(b, 'shin', [0.0, -0.3, -0.16], [0, PI, 0], 0.12, 0.1, 3, true);
  if (o.rank >= 4) b.sym(b.cbox(0.012, 0.28, 0.012, 0.003), 'thigh', 'glow', [0.14, -0.22, 0.1]);
}

// ---------- anims ----------
const UP = [0, 1, 0];
const anims = {
  idle(P, t, ctx) {
    stance(P, ctx, t);
    // every ~7.5 s: scrapes the chainblades across each other in front of the chest (sharpening), then back
    const c = t % 7.5, w = L.kf(c, [[0, 0], [4.6, 0], [5.1, 1], [6.2, 1], [6.8, 0]]);
    if (w > 0.001) {
      const s = Math.sin((c - 5.1) * 7) * 0.08;
      bladeIK(P, ctx, 'L', [0.2, 1.42 + s, 0.42], [-0.55, 0.45, 0.7], [0, 0, 1], w, 0.5);
      bladeIK(P, ctx, 'R', [-0.2, 1.36 - s, 0.4], [0.55, 0.5, 0.7], [0, 0, 1], w, 0.5);
      L.A(P, 'head', 0.1 * w, 0, 0);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'spine', 0.06, 0, 0); L.A(P, 'chest', 0.1, 0, 0); L.A(P, 'head', -0.14, 0, 0);
    const sw = Math.sin(ctx.move.phase * PI * 2) * 0.05;
    twin(P, ctx, [0.5, 1.0 + sw, 0.12], [0.35, -0.72, 0.58], S_YH, 1, 0.5);
  },
  // Chainblade: right blade high-back -> diagonal cleave across the lane (impact 0.42), left blade drawn back
  attack(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.16, 1], [0.72, 1], [1, 0]]);
    const tw = L.kf(u, [[0, 0], [0.28, -0.55], [0.42, 0.5], [0.62, 0.6], [1, 0]]);
    const cut = L.kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.66, 1], [1, 0]]);
    L.pel(P, 0, -0.08 - 0.1 * cut, 0.16 * cut);
    L.A(P, 'pelvis', 0, tw * 0.25, 0); L.A(P, 'spine', 0.18 * cut, tw * 0.3, 0); L.A(P, 'chest', 0.06 * cut, tw * 0.4, 0);
    L.A(P, 'head', -0.05 * cut, -tw * 0.5, 0);
    bladeIK(P, ctx, 'R',
      kv(u, [[0, [-0.55, 2.05, -0.1]], [0.28, [-0.58, 2.1, -0.12]], [0.42, [0.05, 1.12, 0.68]], [0.62, [0.4, 1.02, 0.4]], [1, [0.4, 1.02, 0.4]]]),
      kv(u, [[0, [-0.3, 0.6, -0.75]], [0.28, [-0.3, 0.65, -0.7]], [0.42, [0.55, -0.42, 0.72]], [0.62, [0.92, -0.32, -0.15]], [1, [0.92, -0.32, -0.15]]]),
      [0.55, 0.6, -0.3], w, 0.5);
    bladeIK(P, ctx, 'L', kv(u, [[0, S_HAND], [0.3, [0.58, 1.12, -0.12]], [0.5, [0.6, 1.08, -0.2]], [1, S_HAND]]),
      kv(u, [[0, S_DIR], [0.3, [0.5, -0.4, -0.75]], [1, S_DIR]]), S_YH, w, 0.5);
    L.plant(P, ctx, 0.14 + 0.24 * cut, -0.12 - 0.14 * cut, 1.34 + 0.1 * cut, 0, 0.2 * cut);
  },
  // Cross-chop: both blades raised high, chop down into an X (impact 0.46)
  attack_alt(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.14, 1], [0.75, 1], [1, 0]]);
    const up = L.kf(u, [[0, 0], [0.32, 1], [0.42, 0], [1, 0]]);
    const ch = L.kf(u, [[0, 0], [0.34, 0], [0.46, 1], [0.7, 0.9], [1, 0]]);
    L.pel(P, 0, -0.08 + 0.05 * up - 0.16 * ch, -0.05 * up + 0.28 * ch);
    L.A(P, 'spine', -0.18 * up + 0.22 * ch, 0, 0); L.A(P, 'chest', -0.12 * up + 0.1 * ch, 0, 0);
    L.A(P, 'head', 0.1 * up - 0.06 * ch, 0, 0);
    twin(P, ctx,
      kv(u, [[0, S_HAND], [0.32, [0.42, 2.12, -0.05]], [0.46, [0.16, 1.22, 0.62]], [0.72, [0.18, 1.12, 0.56]], [1, S_HAND]]),
      kv(u, [[0, S_DIR], [0.32, [0.25, 0.6, -0.75]], [0.46, [-0.62, -0.35, 0.7]], [0.72, [-0.65, -0.4, 0.62]], [1, S_DIR]]),
      [0, 0.3, 1], w, 0.55);
    L.plant(P, ctx, 0.14 + 0.32 * ch, -0.12 - 0.12 * ch, 1.36, 0, 0.25 * ch);
  },
  // Blood Money: revs both blades high and wide, throws the head back and roars (cast 0.5)
  cast(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.35, 1], [0.8, 1], [1, 0]]);
    const roar = L.kf(u, [[0, 0], [0.4, 0], [0.5, 1], [0.8, 1], [1, 0]]);
    L.A(P, 'chest', -0.18 * roar, 0, 0); L.A(P, 'spine', -0.08 * roar, 0, 0);
    L.A(P, 'head', -0.35 * roar, 0, 0); L.A(P, 'neck', -0.15 * roar, 0, 0);
    twin(P, ctx, [0.78, 1.72 + 0.04 * Math.sin(u * 60) * roar, 0.12], [0.55, 0.7, 0.3], [0, 0, 1], k, 0.4);
    P[L.PX + 1] += 0.03 * roar;
  },
  // FRENZY: wind-up with blades wide, then two full spinning cleaves (impacts 0.23 / 0.4), crossed blades overhead, recover
  overdrive(P, u, ctx) {
    const wind = L.kf(u, [[0, 0], [0.12, 1], [0.18, 1], [0.22, 0], [1, 0]]);
    const spin = L.kf(u, [[0, 0], [0.17, 0], [0.5, 1], [1, 1]]);
    const a = -spin * PI * 4 + 0.6 * wind;
    const wide = L.kf(u, [[0, 0], [0.1, 1], [0.52, 1], [0.6, 0], [1, 0]]);
    const cross = L.kf(u, [[0, 0], [0.55, 0], [0.64, 1], [0.84, 1], [0.97, 0]]);
    const hop = Math.max(0, Math.sin(Math.min(1, Math.max(0, (u - 0.17) / 0.33)) * PI * 2)) * 0.07;
    const crouch = L.kf(u, [[0, 0], [0.1, 1], [0.17, 0.8], [0.25, 0.45], [0.5, 0.45], [0.56, 0.9], [0.64, 0], [1, 0]]);
    stance(P, ctx, ctx.t);
    L.pel(P, 0, -0.08 - 0.2 * crouch + hop, 0.05 * wide);
    L.R(P, 'pelvis', 0.04, a, 0);
    L.A(P, 'spine', 0.15 * crouch - 0.15 * cross, 0, 0); L.A(P, 'chest', 0.06 * crouch - 0.12 * cross, 0, 0);
    L.A(P, 'head', -0.12 * crouch - 0.3 * cross, 0, 0);
    // blades out wide like rotor blades (flat, slightly forward), then crossed overhead
    const hw = rotY([0.72, 1.3, 0.3], a), dw = rotY([0.62, -0.55, 0.55], a);
    const hs = S_HAND, hx = [0.22, 2.12, 0.18], dx = [-0.6, 0.72, 0.3];
    const k1 = wide * (1 - cross), k0 = 1 - Math.max(wide, cross);
    const tgt = [0, 1, 2].map((i) => hs[i] * k0 + hw[i] * k1 + hx[i] * cross);
    const dir = [0, 1, 2].map((i) => S_DIR[i] * k0 + dw[i] * k1 + dx[i] * cross);
    const yh = [0, 1, 2].map((i) => S_YH[i] * k0 + rotY([0, 0.2, 1], a)[i] * k1 + [0, 0, 1][i] * cross);
    const tgtR = rotY(mx(rotY(tgt, -a)), a), dirR = rotY(mx(rotY(dir, -a)), a), yhR = rotY(mx(rotY(yh, -a)), a);
    bladeIK(P, ctx, 'L', tgt, dir, yh, 1, 0.4);
    bladeIK(P, ctx, 'R', tgtR, dirR, yhR, 1, 0.4);
    plantRot(P, ctx, a, 0.14 + 0.1 * wide, -0.12 - 0.08 * wide, 1.3 + 0.25 * crouch, hop * 1.5);
    ctx.rev = 1;
  },
  hit(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'pelvis', -0.04 * k, 0.07 * k * d, 0);
    L.A(P, 'spine', -0.12 * k, 0.08 * k * d, 0.04 * k * d); L.A(P, 'chest', -0.14 * k, 0.1 * k * d, 0.04 * k * d);
    L.A(P, 'head', -0.22 * k, -0.15 * k * d, 0.12 * k * d);
    twin(P, ctx, [0.6, 1.1, 0.12], [0.6, -0.5, 0.6], S_YH, k * 0.6, 0.5);
    L.plant(P, ctx, 0.1, -0.15, 1.28);
  },
  // drops to its knees with both blades stabbed into the floor, slumps between them, then pitches forward
  die(P, u, ctx) {
    const v = u < 0.3 ? u / 0.3 * 0.42 : u < 0.62 ? 0.42 + (u - 0.3) / 0.32 * 0.13 : 0.55 + (u - 0.62) / 0.38 * 0.45;
    L.dieB(P, v, ctx);
    const w = L.kf(u, [[0, 0], [0.22, 1], [0.6, 1], [0.74, 0]]);
    const slump = L.kf(u, [[0.3, 0], [0.6, 1]]);
    L.A(P, 'head', 0.45 * slump, 0, 0); L.A(P, 'chest', 0.15 * slump, 0, 0);
    twin(P, ctx, [0.42, 0.95 - 0.1 * slump, 0.52], [0.12, -1, 0.2], [0, 0, 1], w, 0.5);
  },
  // drops in: lands in a crouch with both blades slammed into the floor (land 0.4), rises and revs them out (ready 0.85)
  deploy(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0.4], [0.32, 0.5], [0.4, 1], [0.62, 1], [0.84, 0], [1, 0]]);
    P[L.PX + 1] -= 0.38 * land; P[L.PX + 2] += 0.06 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.15 * land, 0, 0);
    L.A(P, 'head', L.kf(u, [[0, 0.1], [0.6, 0.1], [0.74, -0.4], [0.9, -0.1], [1, 0]]), 0, 0);
    twin(P, ctx, kv(u, [[0, [0.55, 1.5, 0.1]], [0.4, [0.55, 0.78, 0.45]], [0.62, [0.55, 0.8, 0.45]], [0.78, [0.85, 1.55, 0.1]], [1, S_HAND]]),
      kv(u, [[0, [0.4, 0.6, 0.5]], [0.4, [0.25, -0.92, 0.3]], [0.62, [0.25, -0.92, 0.3]], [0.78, [0.6, 0.6, 0.4]], [1, S_DIR]]), [0, 0, 1], 1, 0.45);
    L.plant(P, ctx, 0.18 + 0.16 * land, -0.12 - 0.26 * land, 1.3 + 0.2 * land, 0, 0.6 * land);
    if (u > 0.62) ctx.rev = 1;
  },
  // blades raised in a V over the throne, roaring pumps
  victory(P, t, ctx) {
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7)), pump = Math.max(0, Math.sin(t * 2.4)) * k;
    L.A(P, 'chest', -0.2 * k, 0, 0); L.A(P, 'spine', -0.06 * k, 0, 0); L.A(P, 'head', -0.3 * k - 0.1 * pump, 0, 0);
    twin(P, ctx, [0.6, 2.05 + 0.08 * pump, 0.1], [0.45, 0.85, 0.2], [0, 0, 1], k, 0.4);
    P[L.PX + 1] += 0.03 * pump;
    ctx.rev = pump > 0.3 ? 1 : 0;
  },
};

export default {
  id: 'warlord', name: 'WARLORD', role: 'tank', faction: 'rogue', rarity: 'legendary', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 2.15, radius: 0.8, walkSpeed: 1.0, cadence: 0.7, scheme: 'dark',
  style: { weapon: 'blade', heavy: 1, stance: 1.3 },
  // gold primary in every tint (legendary); black armour; trim = faction lacquer (rogue red)
  mats: {
    all: {
      paint: { color: 0xf2b23c, metal: 0.72, rough: 0.27, coat: 0.75, coatRough: 0.06, env: 1.05, emissive: 0x2a1600, ei: 1, panel: { scale: 3.4, groove: 0.45, vary: 0.08 } },
      accent: { color: 0x121014, metal: 0.55, rough: 0.34, coat: 1, env: 0.85 },
      trim: { color: 0xb3141b, metal: 0.35, rough: 0.3, coat: 1, emissive: 0x000000, ei: 0, env: 0.8 },
    },
    corporate: { trim: { color: 0xe8edf3, metal: 0.5, rough: 0.25 } },
    experimental: { trim: { color: 0x6a2fd6 } },
  },
  sockets: { muzzle: ['handR', [0, -0.09 - sA * (B0 + BL * 0.8), cA * (B0 + BL * 0.8)]], core: [0, 0.16, 0.3], head: [0, 0.12, 0.18], hand: ['handR', [0, -0.09, 0]] },
  events: { attack: [['impact', 0.42]], attack_alt: [['impact', 0.46]], cast: [['cast', 0.5]], overdrive: [['cast', 0.04], ['impact', 0.23], ['impact', 0.4]], die: [['down', 0.82]], deploy: [['land', 0.4], ['ready', 0.85]] },
  durs: { attack: 1.0, attack_alt: 1.1, cast: 1.15, overdrive: 2.6, hit: 0.45, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t;
    P[BI.aux3 * 3 + 1] = t * 0.6;
    P[BI.aux3 * 3] = Math.sin(t * 0.9) * 0.08;
  },
  // chain teeth run along the bars (fast while revving / attacking), R5 horn flames flicker, ember crown bobs
  tick(unit, dt, ctx, bones) {
    const a = unit.state.action;
    const fast = a === 'attack' || a === 'attack_alt' || a === 'overdrive' || a === 'cast' || ctx.rev;
    ctx.rev = 0;
    const tv = a === 'die' || unit.dead ? 0 : fast ? 9 : 0.35;
    ctx.cv = (ctx.cv ?? 0.35) + (tv - (ctx.cv ?? 0.35)) * (1 - Math.exp(-dt * 6));
    ctx.ch = ((ctx.ch || 0) + dt * ctx.cv / SP) % 1;
    const o = ctx.ch * SP;
    bones[BI.aux0].position.set(AX[0] * o, AX[1] * o, AX[2] * o);
    bones[BI.aux2].position.set(AX[0] * o, AX[1] * o, AX[2] * o);
    const f = 1 + 0.18 * Math.sin(ctx.t * 23) + 0.12 * Math.sin(ctx.t * 37);
    bones[BI.aux1].scale.set(1, f, 1);
    bones[BI.aux3].position.set(0, 0.6 + 0.03 * Math.sin(ctx.t * 1.7), -0.02);
  },
  fxHints: { impact: 'chain_grind', overdrive: 'frenzy_vortex', color: 0xff6a1a, teeth: 0xff7a1a },
  build,
};
