// ELF SAGE, wild epic mage, "Keeper of the Lumen Staff" (sculptor-21, D21 fantasy). Brief: docs/ROSTER.md `elf_sage`;
// look: refs/ref_fantasy_01.jpg (the white-haired elf in green robes holding a staff topped with a glowing blue crystal).
// Same elven language as ELF RANGER (sculptor-18): white hair, long swept ears, leaf-cut mantle + hems, gold leaf work, skin slot.
// A tall serene sage in a floor-length green robe (legs hidden: an upper bell on the pelvis + one robe panel per thigh that
// swings with the leg + a front tabard and a back panel on aux2/aux3 that follow the stride), wide bell sleeves, a long leaf-hemmed
// cloak, and a gnarled staff taller than she is, its head a wooden cradle around a floating blue lumen crystal (aux1).
// VALUE: `paint` = green robe/cloak, `accent` = dark wood + leather + the dark inner tabard + lash lines, `metal` = white hair,
// `trim` = gold leaf work, `skin` = face + hands, `glow` = the blue crystal, eyes, gem and runes (6 slots, no `eye`).
// Face read (the ranger's open issue): head scaled 1.32, warmer skin, big glowing eyes under dark lash lines, a blue brow gem,
// white hair framing the face, ears long enough to break the silhouette.
// Rank tiers (epic default R2): R0 battered (short frayed cloak, bare crooked staff, small crystal, no mantle) · R1 leaf mantle,
//   gold hems, sash · R2 gold circlet + blue brow gem, gold crystal cradle, two shards orbit the crystal, embroidered tabard ·
//   R3 glowing staff runes + hem leaves, brighter eyes · R4 a fan of gold leaves rising behind the head (silhouette) + four shards ·
//   R5 a floating ring of light behind the head with glowing leaves, glowing cloak hem.
// Staff technique: the staff is authored on handR along +Z (rest frame). setHandQ() (from elf_ranger) turns the hand so its +Z
// points wherever the staff should; staff(P, ctx, {...}) = IK the hand to a root-space grip point + orient the staff.
import { THREE, fin, pod, LIB, PI, BI } from '../kit.js';

const L = LIB;
const CRY = [0, -0.02, 1.16];                     // crystal centre on handR (rest frame, staff axis = +Z)
const BUTT = -0.98;                               // staff butt (z on handR)
const DIMS = {
  thigh: 0.46, shin: 0.45, ankle: 0.08, hipX: 0.09, hipY: -0.04, spine: 0.12, chest: 0.23, neck: 0.22, headOff: 0.06,
  clavX: 0.05, clavY: 0.19, shoulder: 0.14, upArm: 0.29, foreArm: 0.27, aux0: [0, 0.2, -0.1],
  parents: { aux1: 'handR' }, aux1: CRY, aux2: [0, -0.04, 0.165], aux3: [0, -0.06, -0.16],
};

// ---------- pose machinery ----------
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const qe = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const Q_BASE = qe(-PI / 2, 0, 0);                 // hand +Z -> up, fingers (-Y) -> forward
const _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion();
// root-space staff orientation: fwd > 0 tips the crystal forward, side > 0 tips it to the unit's right, yaw turns the grip
function qStaff(fwd, side, yaw = 0, out = _qs) {
  _e.set(fwd, yaw, side, 'YXZ');
  return out.setFromEuler(_e).multiply(Q_BASE);
}
function setHandQ(P, ctx, side, Q, w = 1) {
  const { q } = L.fkBone(P, ctx, 'foreArm' + side, _p, _q);
  _q2.copy(q).invert().multiply(Q);
  _e.setFromQuaternion(_q2, 'YXZ');
  const i = BI['hand' + side] * 3;
  P[i] += (_e.x - P[i]) * w; P[i + 1] += (_e.y - P[i + 1]) * w; P[i + 2] += (_e.z - P[i + 2]) * w;
}
// right hand grips the staff at root-space `at`; staff tipped by fwd/side
function staff(P, ctx, at, fwd = 0, side = 0.05, yaw = 0, out = 0.35) {
  L.armIK(P, ctx, 'R', _b.fromArray(at), out);
  setHandQ(P, ctx, 'R', qStaff(fwd, side, yaw), 1);
}
// left hand: IK to a point, palm orientation by euler (root space)
function palm(P, ctx, at, rx = 0, ry = 0, rz = 0, out = 0.3, w = 1) {
  L.armIK(P, ctx, 'L', _a.fromArray(at), out);
  setHandQ(P, ctx, 'L', _qt.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), w);
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GRIP = [-0.27, 0.99, 0.1];                  // idle grip: staff planted at the right side
const PALM0 = [0.2, 1.02, 0.16];                  // idle left hand: open at the waist, palm up
function base(P, ctx, t, wide = 1) {
  L.idle(P, ctx, t);
  L.R(P, 'pelvis', 0.02, 0, P[BI.pelvis * 3 + 2]);
  L.plant(P, ctx, 0.06, -0.06, wide);
}

// ---------- geometry helpers ----------
const leafPts = (len, w) => [[0, 0], [w * 0.5, len * 0.28], [w * 0.42, len * 0.68], [0, len], [-w * 0.42, len * 0.68], [-w * 0.5, len * 0.28]];
const leaf = (b, len, w, t = 0.012) => fin(b, leafPts(len, w), t, 0.003);
const crystal = (b) => b.sph(6, 2);
// lathe with the profile authored top-down along the OUTER surface (reversed so faces point outward)
const rl = (b, pts, seg) => b.lathe([...pts].reverse(), seg);
// leaf-cut hem around a lathe ring (bone space): n leaves hanging off radius r at height y
function hem(b, bone, slot, n, r, y, len, w, a0 = 0, arc = PI * 2, cz = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (arc >= PI * 2 - 1e-3 ? i / n : i / (n - 1)) * arc;
    b.add(leaf(b, len * (i % 2 ? 0.85 : 1), w, 0.012), bone, slot, [Math.sin(a) * r, y + 0.01, cz + Math.cos(a) * r], [PI, a + PI, 0]);
  }
}

// ---------- parts ----------
function head(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  // face: long elven oval, pointed chin, small nose; big glowing almond eyes under dark lash lines; silver brows
  b.add(b.sph(20, 16), H, 'skin', [0, 0.095, 0.02], [0, 0, 0], [0.077, 0.1, 0.09]);
  b.add(b.sph(12, 10), H, 'skin', [0, 0.042, 0.05], [0.3, 0, 0], [0.05, 0.058, 0.05]);
  b.add(b.sph(8, 8), H, 'skin', [0, 0.08, 0.104], [-0.35, 0, 0], [0.009, 0.022, 0.011]);
  b.sym(b.sph(10, 6), H, 'glow', [0.03, 0.1, 0.093], [0, 0.35, 0.18], [0.022, 0.0105, 0.008]);
  b.sym(b.cbox(0.042, 0.007, 0.012, 0.003), H, 'accent', [0.031, 0.1105, 0.094], [0, 0.32, 0.2]);
  b.sym(b.cbox(0.038, 0.008, 0.012, 0.003), H, 'metal', [0.032, 0.126, 0.094], [0, 0.3, 0.26]);
  // long swept ears through the hair
  b.sym(fin(b, [[0, -0.018], [0.035, 0.0], [0.16, 0.1], [0.025, 0.03], [0, 0.024]], 0.014, 0.004), H, 'skin', [0.07, 0.09, 0.0], [0.18, -0.55, 0.18]);
  // white hair: scalp, centre-parted fringe framing the face, long front locks over the chest
  b.add(b.sph(20, 14), H, 'metal', [0, 0.12, -0.014], [0, 0, 0], [0.087, 0.1, 0.097]);
  for (const s of [1, -1]) {
    b.add(b.tube([[s * 0.005, 0.2, 0.06], [s * 0.05, 0.19, 0.075], [s * 0.08, 0.14, 0.07], [s * 0.085, 0.07, 0.06]], 0.02, 12, 6), H, 'metal');
    b.add(b.tube([[s * 0.07, 0.12, 0.035], [s * 0.09, 0.04, 0.045], [s * 0.105, -0.04, 0.06], [s * 0.115, -0.09, 0.07]], 0.022, 14, 6), H, 'metal');
    b.add(b.tube([[s * 0.075, 0.1, 0.0], [s * 0.1, 0.02, 0.01], [s * 0.125, -0.06, 0.025], [s * 0.135, -0.1, 0.03]], 0.02, 12, 6), H, 'metal');
    if (!far) for (let i = 0; i < 3; i++) b.add(b.tube([[s * 0.01, 0.205 - i * 0.004, 0.05 - i * 0.05], [s * 0.06, 0.19 - i * 0.01, 0.03 - i * 0.055], [s * 0.09, 0.13 - i * 0.02, -0.01 - i * 0.05]], 0.016, 10, 5), H, 'metal');
  }
  // R0-1: a plain leaf clasp in the hair · R2 gold circlet + blue brow gem
  if (rk >= 2) {
    b.add(b.tor(0.088, 0.006, 24, 4, PI * 1.15), H, 'trim', [0, 0.152, 0.008], [PI / 2 - 0.22, 0, PI * 0.925 + PI / 2], [1, 1.12, 1]);
    b.add(b.cbox(0.02, 0.026, 0.01, 0.004), H, 'trim', [0, 0.143, 0.1], [-0.25, 0, PI / 4]);
    b.add(crystal(b), H, 'glow', [0, 0.143, 0.106], [-0.25, 0, 0], [0.012, 0.02, 0.008]);
  } else b.add(leaf(b, 0.05, 0.03), H, 'trim', [0.07, 0.17, 0.02], [0, 0.4, -0.9]);
  // R4: a fan of gold leaves rising behind the head · R5: a ring of light with glowing leaves
  if (rk >= 4) for (let i = 0; i < 9; i++) {
    const a = (i - 4) * 0.3;
    b.add(leaf(b, 0.3 - Math.abs(i - 4) * 0.03, 0.09, 0.012), H, i % 2 === 0 && rk >= 5 ? 'glow' : 'trim', [Math.sin(a) * 0.06, 0.15, -0.1], [-0.4, 0, -a]);
  }
  if (rk >= 5) {
    b.add(b.tor(0.27, 0.007, 40, 3), H, 'glow', [0, 0.17, -0.18], [0.12, 0, 0]);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * PI * 2;
      b.add(leaf(b, 0.07, 0.04, 0.008), H, i % 2 ? 'glow' : 'trim', [Math.cos(a) * 0.27, 0.17 + Math.sin(a) * 0.27, -0.18 - Math.sin(a) * 0.03], [0, 0, a - PI / 2]);
    }
  }
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  b.add(b.cyl(0.045, 0.05, 0.12, 10), 'neck', 'skin', [0, 0.03, 0.005]);
  // robe bodice (green), crossed V neckline with gold edges over a dark inner robe, high collar
  b.add(pod(b, 0.33, -0.03, [0.1, 0.16, 0.17, 0.15], 20), 'chest', 'paint', [0, 0, 0.0], [0, 0, 0], [1, 1, 0.76]);
  b.add(pod(b, 0.24, -0.04, [0.15, 0.135, 0.13, 0.14], 18), 'spine', 'paint', [0, 0, 0.0], [0, 0, 0], [1, 1, 0.8]);
  b.add(b.ext([[-0.045, 0], [0.045, 0], [0.0, -0.1]], 0.012, 0.003), 'chest', 'skin', [0, 0.335, 0.118], [-0.15, 0, 0]);
  for (const s of [1, -1]) b.add(b.tube([[s * 0.06, 0.345, 0.1], [s * 0.025, 0.25, 0.13], [-s * 0.01, 0.12, 0.135]], 0.011, 10, 5), 'chest', 'trim');
  b.add(b.cyl(0.1, 0.13, 0.08, 20, true), 'chest', 'paint', [0, 0.37, -0.02], [-0.1, 0, 0], [1, 1, 0.85]);
  // mantle: leaf-cut capelet over the shoulders (ranger language), gold leaf brooch
  b.add(b.cyl(0.13, 0.26, 0.15, 22), 'chest', 'paint', [0, 0.28, -0.005], [0.05, 0, 0], [1, 1, 0.78]);
  if (rk >= 1) {
    const n = far ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, x = Math.sin(a) * 0.245, z = Math.cos(a) * 0.192;
      b.add(leaf(b, 0.12, 0.075), 'chest', i % 3 === 1 ? 'trim' : 'paint', [x, 0.23, z], [PI + 0.35 * Math.cos(a), a, 0]);
    }
  }
  b.add(leaf(b, 0.075, 0.05, 0.016), 'chest', 'trim', [0.0, 0.285, 0.13], [-0.4, 0, PI]);
  b.add(b.sph(8, 6), 'chest', 'glow', [0.0, 0.26, 0.142], [0, 0, 0], 0.017);
  // sash: dark leather wrap, gold leaf buckle, hanging tails (R1+)
  b.add(b.tor(0.162, 0.026, 24, 6), 'pelvis', 'accent', [0, 0.06, 0], [PI / 2, 0, 0], [1, 0.82, 1.6]);
  b.add(b.tor(0.166, 0.006, 24, 3), 'pelvis', 'trim', [0, 0.03, 0], [PI / 2, 0, 0], [1, 0.82, 1]);
  b.add(leaf(b, 0.08, 0.05, 0.016), 'pelvis', 'trim', [0, 0.025, 0.142], [0, 0, 0]);
  if (rk >= 1) for (const s of [1, -1]) b.add(b.ext([[-0.022, 0], [0.022, 0], [0.02, -0.34], [0, -0.38], [-0.02, -0.34]], 0.01, 0.003), 'pelvis', 'accent', [s * 0.07, 0.03, 0.15], [0.06, 0, s * 0.06]);
}

// cloth drape detail (touch-up 2): soft vertical fold bands + a few dark creases, tileable; rgb 128 = neutral
function FOLDS(g, w, h, rnd) {
  const img = g.createImageData(w, h), d = img.data, cr = [0.13, 0.38, 0.6, 0.84].map((c) => c + (rnd() - 0.5) * 0.04);
  for (let y = 0; y < h; y++) {
    const sh = 0.015 * Math.sin((y / h) * PI * 2);
    for (let x = 0; x < w; x++) {
      const u = x / w + sh;
      let v = 128 + 44 * Math.sin(u * PI * 6 + 1.4 * Math.sin(u * PI * 4)) + 12 * Math.sin(u * PI * 18) + (rnd() - 0.5) * 6;
      for (const c of cr) { const dd = Math.abs(((u - c + 1.5) % 1) - 0.5); if (dd < 0.014) v -= 50 * (1 - dd / 0.014); }
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v)); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function robe(b, o) {
  const rk = o.rank, far = b.far, D = b.rig.D;
  // upper skirt: a bell on the pelvis to the knees
  b.add(rl(b, [[0.15, 0.08], [0.17, -0.05], [0.235, -0.3], [0.27, -0.5], [0.255, -0.5], [0.14, 0.08]], 34), 'pelvis', 'paint', [0, 0, 0]);
  // lower robe: one wide panel per leg (thigh bone), hip to the floor, swings with the leg; gold hem band + leaf-cut hem
  const len = D.thigh + D.shin + D.ankle - 0.05;
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 0.02 : -0.02;
    b.add(rl(b, [[0.15, -0.22], [0.2, -len * 0.62], [0.23, -len], [0.215, -len], [0.135, -0.22]], 30), 'thigh' + s, 'paint', [x, 0, 0]);
    // drape folds: raised ridges fanning down the panel (silhouette ripple at the hem)
    if (!far) for (const a of [-2.3, -1.4, -0.6, 0.9, 1.7, 2.6]) {
      const rr = (y) => (y > -len * 0.62 ? 0.15 + 0.05 * (-0.22 - y) / (len * 0.62 - 0.22) : 0.2 + 0.03 * (-len * 0.62 - y) / (len * 0.38)) + 0.004;
      const aa = (s === 'L' ? 1 : -1) * a;
      b.add(b.tube([-0.3, -0.55, -0.8, -len + 0.03].map((y) => [x + Math.sin(aa) * rr(y), y, Math.cos(aa) * rr(y)]), 0.012, 10, 4), 'thigh' + s, 'paint');
    }
    b.add(rl(b, [[0.225, -len + 0.07], [0.235, -len + 0.012], [0.243, -len + 0.012], [0.233, -len + 0.07]], 22), 'thigh' + s, 'trim', [x, 0, 0]);
    if (rk >= 1) hem(b, 'thigh' + s, rk >= 3 && (s === 'L') ? 'glow' : 'paint', far ? 6 : 10, 0.226, -len + 0.005, 0.07, 0.07, 0, PI * 2);
    // gold leaf vine climbing the robe front beside the tabard
    if (rk >= 1 && !far) for (let i = 0; i < 5; i++) {
      const f = 0.3 + i * 0.13, rr = 0.15 + (0.23 - 0.15) * f, a = (s === 'L' ? -1 : 1) * 0.45 + (s === 'L' ? 1 : -1) * 0.1 * (i % 2);
      b.add(leaf(b, 0.07, 0.035, 0.008), 'thigh' + s, 'trim', [x + Math.sin(a) * (rr + 0.006), -0.22 - (len - 0.22) * f, Math.cos(a) * (rr + 0.006)], [0, a, (i % 2 ? 0.6 : -0.6)]);
    }
  }
  // front tabard (aux2): dark inner panel with gold edges + leaf embroidery; back panel (aux3)
  const tl = len + 0.02;
  b.add(b.ext([[-0.085, 0], [0.085, 0], [0.11, -tl], [0, -tl - 0.07], [-0.11, -tl]], 0.016, 0.004), 'aux2', 'accent', [0, 0, 0.0]);
  for (const s of [1, -1]) b.add(b.tube([[s * 0.088, 0, 0.01], [s * 0.1, -tl * 0.5, 0.012], [s * 0.112, -tl, 0.012], [0, -tl - 0.075, 0.012]], 0.009, 14, 4), 'aux2', 'trim');
  if (rk >= 2) for (let i = 0; i < (far ? 2 : 4); i++) b.add(leaf(b, 0.1, 0.055, 0.008), 'aux2', rk >= 3 && i === 3 ? 'glow' : 'trim', [0, -0.18 - i * 0.17, 0.012], [0, 0, PI]);
  b.add(b.ext([[-0.12, 0], [0.12, 0], [0.16, -tl], [-0.16, -tl]], 0.016, 0.004), 'aux3', 'paint', [0, 0, 0.0]);
  // shoe tips peeking out under the hem
  b.sym(b.rbox(0.075, 0.06, 0.2, 0.028), 'foot', 'accent', [0, -D.ankle + 0.03, 0.06]);
  b.sym(fin(b, [[-0.035, 0], [0.035, 0], [0, 0.07]], 0.05, 0.01), 'foot', 'accent', [0, -D.ankle + 0.03, 0.16], [PI / 2, 0, 0]);
  b.sym(b.cyl(0.05, 0.05, 0.25, 10), 'shin', 'accent', [0, -D.shin * 0.62, 0]);
}

function arms(b, o) {
  const D = b.rig.D, rk = o.rank, far = b.far;
  b.sym(b.cyl(0.045, 0.045, D.shoulder, 10), 'clav', 'paint', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 10), 'upArm', 'paint', [0.01, -0.02, 0], [0, 0, 0], [0.068, 0.072, 0.068]);
  b.sym(b.cyl(0.058, 0.064, D.upArm, 12), 'upArm', 'paint', [0, -D.upArm / 2, 0]);
  // bell sleeves: flare from the elbow, gold cuff band, leaf-cut cuff from R1
  const fl = D.foreArm * 0.92;
  b.sym(rl(b, [[0.06, 0.02], [0.08, -fl * 0.45], [0.13, -fl], [0.12, -fl], [0.05, 0.02]], 18), 'foreArm', 'paint', [0, 0, 0]);
  b.sym(rl(b, [[0.122, -fl + 0.05], [0.133, -fl + 0.005], [0.14, -fl + 0.005], [0.13, -fl + 0.05]], 18), 'foreArm', 'trim', [0, 0, 0]);
  b.sym(b.cyl(0.035, 0.032, 0.12, 10), 'foreArm', 'skin', [0, -D.foreArm * 0.8, 0]);
  if (rk >= 1 && !far) for (const s of ['L', 'R']) hem(b, 'foreArm' + s, 'paint', 7, 0.128, -fl, 0.05, 0.05);
  // hands: the staff hand is a closed grip, the casting hand open with long fingers
  b.add(b.rbox(0.05, 0.085, 0.075, 0.018), 'handR', 'skin', [0, -0.045, 0.004]);
  b.add(b.rbox(0.05, 0.05, 0.07, 0.018), 'handR', 'skin', [0, -0.085, 0.03], [0.6, 0, 0]);
  b.add(b.rbox(0.045, 0.085, 0.07, 0.016), 'handL', 'skin', [0, -0.045, 0.004]);
  for (let i = 0; i < 4; i++) b.add(b.rbox(0.011, 0.06, 0.013, 0.005), 'handL', 'skin', [-0.016 + i * 0.011, -0.11, 0.018 - i * 0.003], [0.15, 0, 0]);
  b.add(b.rbox(0.013, 0.05, 0.014, 0.005), 'handL', 'skin', [0.025, -0.06, 0.035], [0.5, 0, -0.5]);
  if (rk >= 3) b.add(b.tor(0.035, 0.005, 12, 3), 'handL', 'glow', [0, -0.07, 0.0], [0, 0, 0]);
}

function cloak(b, o) {
  const rk = o.rank, far = b.far, A = 'aux0';
  const len = rk === 0 ? 0.85 : 1.28, r0 = 0.17, r1 = 0.38, t = 0.016, arc = 3.6;
  b.add(b.lathe([[r0, 0.02], [r1, -len], [r1 + t, -len], [r0 + t, 0.02], [r0, 0.02]], 32, PI - arc / 2, arc), A, 'paint', [0, 0, 0.1]);
  const n = far ? 7 : 13;
  for (let i = 0; i < n; i++) {
    const a = PI - arc / 2 + 0.12 + (i / (n - 1)) * (arc - 0.24), r = r1 + 0.005;
    const ll = (rk === 0 ? 0.07 : 0.13) + (i % 2) * 0.04;
    b.add(leaf(b, ll, rk === 0 ? 0.07 : 0.11, 0.014), A, rk >= 5 && i % 2 ? 'glow' : 'paint', [Math.sin(a) * r, -len + 0.02, 0.1 + Math.cos(a) * r], [PI, a + PI, 0]);
  }
  if (rk >= 1) b.add(b.lathe([[r1 + 0.002, -len + 0.09], [r1 + 0.002, -len + 0.055], [r1 + t + 0.004, -len + 0.055], [r1 + t + 0.004, -len + 0.09]], 26, PI - arc / 2, arc), A, 'trim', [0, 0, 0.1]);
  // the long white hair falls down the back over the cloak
  b.add(b.tube([[0, 0.13, -0.04], [0, 0.02, -0.085], [0, -0.2, -0.11], [0, -0.42, -0.1]], 0.055, 14, 8), A, 'metal');
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.045, 0.13, -0.03], [s * 0.065, 0.0, -0.075], [s * 0.07, -0.25, -0.09], [s * 0.06, -0.36, -0.085]], 0.03, 12, 5), A, 'metal');
}

function staffGeo(b, o) {
  const rk = o.rank, far = b.far, H = 'handR';
  // gnarled wood shaft along +Z, gold grip bands + ferrule
  const sh = [[0, 0, BUTT], [0.006, 0.004, -0.6], [-0.006, 0.0, -0.2], [0.004, -0.006, 0.25], [-0.004, 0.004, 0.65], [0.0, -0.006, 0.93]];
  b.add(b.tube(sh, 0.021, 26, 7), H, 'accent');
  if (!far) for (const z of [-0.45, 0.42]) b.add(b.sph(8, 6), H, 'accent', [0.003, 0, z], [0, 0, 0], [0.028, 0.028, 0.045]);
  b.add(b.cyl(0.026, 0.02, 0.06, 10), H, 'trim', [0, 0, BUTT + 0.02], [PI / 2, 0, 0]);
  for (const z of [-0.09, 0.09]) b.add(b.cyl(0.026, 0.026, 0.016, 12), H, rk === 0 ? 'accent' : 'trim', [0, 0, z], [PI / 2, 0, 0]);
  // head: three wooden tines curling up around the crystal (R0: two bare twigs), gold leaves on the tips
  const n = rk === 0 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a);
    const pts = [[0, 0, 0.9], [c * 0.05, s * 0.05, 0.98], [c * 0.085, s * 0.085, 1.08], [c * 0.075, s * 0.075, 1.2], [c * 0.035, s * 0.035, 1.27]];
    b.add(b.tube(pts.map(([x, y, z]) => [x, y + CRY[1], z]), 0.014, 14, 5), H, rk >= 2 ? 'trim' : 'accent');
    b.add(leaf(b, 0.07, 0.035, 0.008), H, rk >= 3 ? 'glow' : 'trim', [c * 0.04, s * 0.04 + CRY[1], 1.27], [-PI / 2 + 0.5 * s, 0, -0.5 * c]);
    if (rk >= 1) b.add(leaf(b, 0.11, 0.05, 0.01), H, 'trim', [c * 0.03, s * 0.03 + CRY[1] - 0.005, 0.86], [PI / 2 + 0.5 * s, 0, 0.6 * c]);
  }
  b.add(b.tor(0.035, 0.01, 14, 5), H, 'trim', [0, CRY[1], 0.9], [0, 0, 0]);
  // R3 runes along the shaft
  if (rk >= 3 && !far) for (let i = 0; i < 5; i++) b.add(b.cbox(0.012, 0.03, 0.05, 0.004), H, 'glow', [Math.cos(i * 2.1) * 0.02, Math.sin(i * 2.1) * 0.02, 0.2 + i * 0.13], [0, 0, i * 2.1]);
  // the lumen crystal (aux1 floats + spins): elongated, faceted, inner shards
  const big = rk === 0 ? 0.75 : 1;
  b.add(crystal(b), 'aux1', 'glow', [0, 0, 0], [PI / 2, 0, 0], [0.068 * big, 0.17 * big, 0.068 * big]);
  b.add(crystal(b), 'aux1', 'glow', [0, 0, -0.01], [PI / 2, 0.5, 0.3], [0.04 * big, 0.11 * big, 0.04 * big]);
  const sn = rk >= 4 ? 4 : rk >= 2 ? 2 : 0;
  for (let i = 0; i < sn; i++) {
    const a = i / sn * PI * 2;
    b.add(crystal(b), 'aux1', 'glow', [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.02 * (i % 2 ? 1 : -1)], [PI / 2, a, 0], [0.018, 0.045, 0.018]);
  }
}

function build(b, o) {
  b.scope([0, 0.0, 0.0], [0, 0, 0], 1.32, () => head(b, o));
  torso(b, o);
  robe(b, o);
  arms(b, o);
  cloak(b, o);
  staffGeo(b, o);
}

// ---------- anims ----------
const anims = {
  // serene: staff planted at the side, left palm open; every ~7 s she lifts the palm and a breath of light rises from it
  idle(P, t, ctx) {
    base(P, ctx, t, 1);
    const c = t % 7, g = L.kf(c, [[0, 0], [4.2, 0], [5.0, 1], [6.0, 1], [6.8, 0]]), br = Math.sin(t * 1.5);
    staff(P, ctx, [GRIP[0], GRIP[1] + 0.01 * br, GRIP[2]], 0.02, 0.06);
    palm(P, ctx, mix(PALM0, [0.17, 1.24, 0.24], g), -0.9 - 0.6 * g, 0.2, -0.6 + 0.5 * g);
    L.A(P, 'head', -0.12 * g, 0.2 * g, 0);
  },
  // unhurried glide: short steps under the robe, the staff walks with her (swings forward on the left step)
  advance(P, t, ctx) {
    L.gait(P, ctx);
    const ph = ctx.move.phase * PI * 2, s = Math.sin(ph);
    L.A(P, 'spine', 0.04, 0, 0); L.A(P, 'head', -0.04, 0, 0);
    staff(P, ctx, [-0.29, 1.0 + 0.03 * Math.cos(ph * 2), 0.14 + 0.1 * s], 0.08 + 0.12 * s, 0.07);
    palm(P, ctx, [0.21, 0.98, 0.1 - 0.08 * s], -0.6, 0.2, -0.4);
  },
  // LUMEN BOLT (battle plays `cast` for a mage's basic): draw the staff back, thrust the crystal at the target (fire 0.42),
  // the left palm pushes after it, hold, recover
  cast(P, u, ctx) {
    base(P, ctx, ctx.t, 1.15);
    const back = L.kf(u, [[0, 0], [0.28, 1], [0.4, 0], [1, 0]]), thr = L.kf(u, [[0.3, 0], [0.42, 1], [0.66, 1], [0.95, 0]]);
    P[L.PX + 2] += 0.05 * thr - 0.03 * back;
    L.A(P, 'pelvis', 0, 0.12 * back - 0.1 * thr, 0);
    L.A(P, 'spine', -0.06 * back + 0.1 * thr, 0.2 * back - 0.12 * thr, 0);
    L.A(P, 'chest', -0.05 * back + 0.06 * thr, 0.12 * back - 0.08 * thr, 0);
    L.A(P, 'head', 0.05 * thr, -0.1 * back, 0);
    const g = mix(mix(GRIP, [-0.28, 1.12, -0.02], back), [-0.2, 1.22, 0.38], thr);
    staff(P, ctx, g, -0.3 * back + 0.95 * thr, 0.06 + 0.1 * back - 0.06 * thr, 0, 0.4);
    const pl = mix(mix(PALM0, [0.05, 1.3, 0.12], back), [0.1, 1.32, 0.42], thr);
    palm(P, ctx, pl, -1.4 * Math.max(back, thr), 0.3 * thr, -0.3, 0.35);
    L.plant(P, ctx, 0.14 + 0.06 * thr, -0.1, 1.15);
  },
  // sweeping arc: the crystal swings from high on the right across the front, a bolt flies at the bottom of the arc (fire 0.48)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t, 1.2);
    const up = L.kf(u, [[0, 0], [0.3, 1], [0.44, 0.2], [0.5, 0], [1, 0]]), sw = L.kf(u, [[0.3, 0], [0.48, 1], [0.7, 1], [1, 0]]);
    L.A(P, 'pelvis', 0, 0.2 * up - 0.18 * sw, 0);
    L.A(P, 'spine', -0.08 * up + 0.08 * sw, 0.15 * up - 0.15 * sw, 0);
    L.A(P, 'chest', -0.05 * up + 0.05 * sw, 0.15 * up - 0.12 * sw, 0);
    const g = mix(mix(GRIP, [-0.33, 1.35, -0.05], up), [-0.12, 1.1, 0.34], sw);
    staff(P, ctx, g, -0.1 * up + 1.15 * sw, 0.06 + 0.55 * up - 0.45 * sw, 0, 0.45);
    palm(P, ctx, mix(PALM0, [0.26, 1.16, 0.2], Math.max(up, sw)), -0.8, 0.3, -0.9 * Math.max(up, sw), 0.4);
    L.plant(P, ctx, 0.16, -0.12, 1.2);
  },
  // VERDANT BLOOM: lift the staff and strike the butt on the floor (cast 0.45), the left hand sweeps out over the allies
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t, 1.15);
    const up = L.kf(u, [[0, 0], [0.32, 1], [0.42, 1], [0.46, 0], [1, 0]]), hit = L.kf(u, [[0.42, 0], [0.46, 1], [0.6, 0.6], [1, 0]]);
    const sweep = L.kf(u, [[0.42, 0], [0.62, 1], [0.85, 1], [1, 0]]);
    P[L.PX + 1] += 0.04 * up - 0.06 * hit;
    L.A(P, 'spine', -0.08 * up + 0.12 * hit, 0, 0); L.A(P, 'head', -0.15 * up + 0.1 * hit, 0, 0);
    staff(P, ctx, [GRIP[0] + 0.03 * up, GRIP[1] + 0.3 * up - 0.04 * hit, GRIP[2] + 0.08 * up + 0.08 * hit], 0.05 + 0.05 * hit, 0.04);
    const pl = mix(mix(PALM0, [0.08, 1.38, 0.22], up), [0.5, 1.3, 0.22], sweep);
    palm(P, ctx, pl, -1.0 - 0.3 * up, 0.3, -0.4 - 0.6 * sweep, 0.35);
    L.plant(P, ctx, 0.1, -0.08, 1.2);
  },
  // SANCTUARY GROVE: lifts the staff high overhead, the crystal blazes (cast 0.14), she rises with it, then drives the staff
  // down into the ground (impact 0.55) and spreads her arms wide while the grove grows
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 1.3);
    const lift = L.kf(u, [[0, 0], [0.18, 1], [0.48, 1], [0.55, 0], [1, 0]]), plantK = L.kf(u, [[0.48, 0], [0.55, 1], [0.9, 1], [1, 0]]);
    const spread = L.kf(u, [[0.5, 0], [0.62, 1], [0.88, 1], [1, 0]]), rise = L.kf(u, [[0.1, 0], [0.3, 1], [0.48, 1], [0.55, -0.6], [0.7, 0], [1, 0]]);
    P[L.PX + 1] += 0.06 * rise;
    L.A(P, 'spine', -0.12 * lift + 0.14 * plantK - 0.12 * spread, 0, 0);
    L.A(P, 'chest', -0.12 * lift - 0.1 * spread, 0, 0);
    L.A(P, 'neck', -0.15 * lift, 0, 0); L.A(P, 'head', -0.3 * lift - 0.15 * spread, 0, 0);
    const g = mix(mix(GRIP, [-0.22, 1.74, 0.12], lift), [-0.18, 1.0, 0.3], plantK);
    staff(P, ctx, g, 0.05 * plantK, 0.02 - 0.02 * lift, 0, 0.5);
    const pl = mix(mix(PALM0, [0.42, 1.78, 0.1], lift), [0.62, 1.42, 0.06], spread);
    palm(P, ctx, pl, -1.2 * lift - 0.4 * spread, 0.2, -0.3 - 1.0 * Math.max(lift, spread), 0.4);
    L.plant(P, ctx, 0.12 + 0.06 * plantK, -0.12, 1.3);
      },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t, 1.05);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.5, 0.4], [1, 0]]), dd = ctx.st.hitDir;
    P[L.PX + 2] -= 0.1 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.15 * k, 0.12 * k * dd, 0.06 * k * dd); L.A(P, 'chest', -0.12 * k, 0.1 * k * dd, 0);
    L.A(P, 'head', -0.3 * k, -0.2 * k * dd, 0.15 * k * dd);
    staff(P, ctx, mix(GRIP, [-0.3, 1.05, 0.0], k), -0.25 * k, 0.15 * k);
    palm(P, ctx, mix(PALM0, [0.2, 1.3, 0.25], k), -1.2 * k, 0.2, -0.4);
  },
  // sinks to the knees still holding the staff upright, then slumps forward; the staff tips over and lies across the floor
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const hold = L.kf(u, [[0, 1], [0.45, 1], [0.7, 0]]);
    const grip = L.fkPoint(P, ctx, 'chest', [-0.28, 0.0, 0.18], _c).toArray();
    if (hold > 0.001) {
      const sv = P.slice(BI.upArmR * 3, BI.handR * 3 + 3);
      staff(P, ctx, grip, 0.05, 0.1);
      for (let i = 0; i < sv.length; i++) P[BI.upArmR * 3 + i] = sv[i] + (P[BI.upArmR * 3 + i] - sv[i]) * hold;
    }
    setHandQ(P, ctx, 'R', qStaff(L.lerp(0.05, 0.3, 1 - hold), L.lerp(0.1, 1.45, L.kf(u, [[0.45, 0], [0.82, 1]])), 0.3), 1);
  },
  // falls in kneeling with the cloak flared, rises and twirls the staff once, sets the butt down (land 0.4, ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t, 1.1);
    const land = L.kf(u, [[0, 0.35], [0.34, 0.5], [0.4, 1], [0.6, 0.85], [0.84, 0], [1, 0]]);
    const tw = L.kf(u, [[0.55, 0], [0.82, 1]]), tap = L.kf(u, [[0.78, 0], [0.85, 1], [0.95, 0]]);
    P[L.PX + 1] -= 0.34 * land + 0.02 * tap;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'head', -0.25 * land, 0, 0);
    L.plant(P, ctx, 0.2 + 0.1 * land, -0.12 - 0.24 * land, 1.2, 0, 0.8 * land);
    staff(P, ctx, mix(GRIP, [-0.3, 0.75, 0.25], land), 0.2 * land + Math.sin(tw * PI) * 0.6, 0.06 - Math.sin(tw * PI * 2) * 0.5);
    palm(P, ctx, mix(PALM0, [0.25, 0.8, 0.2], land), -0.6, 0.2, -0.5);
  },
  // the staff raised high in triumph, crystal blazing; the left hand over the heart
  victory(P, t, ctx) {
    base(P, ctx, t, 1.1);
    const k = L.smooth(Math.min(1, t / 0.7)), br = Math.sin(t * 2.2);
    staff(P, ctx, mix(GRIP, [-0.3, 1.72 + 0.03 * br, 0.12], k), 0.0, 0.06 - 0.16 * k);
    palm(P, ctx, mix(PALM0, [0.05, 1.42, 0.17], k), -0.3, -0.5 * k, -1.2 * k, 0.4);
    L.A(P, 'chest', -0.1 * k, 0.08 * k, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    ctx.capeAdd = 0.2 * k;
  },
};

export default {
  id: 'elf_sage', name: 'ELF SAGE', role: 'mage', faction: 'wild', rarity: 'epic', realm: 'fantasy',
  rig: 'biped', dims: DIMS, height: 1.85, radius: 0.48, walkSpeed: 0.9, cadence: 1.15, scheme: 'bold',
  style: { weapon: 'staff', stance: 0.95 },
  paint: { wild: { paint: 0x1f5a34, accent: 0x33241a, trim: 0xe0b450, glow: 0x1e64ff }, order: { glow: 0x7fd0ff }, horde: { glow: 0xffa040 } },
  mats: {
    all: {
      paint: { rough: 0.8, panel: { grime: 0.1, grimeScale: 14, stretch: 1.6 }, detail: { map: FOLDS, scale: 2.2, albedo: 0.8, rough: 0.3, scratch: 0 } },
      accent: { rough: 0.62, metal: 0.05 },
      metal: { color: 0xeef2f6, metal: 0.12, rough: 0.42 },
      trim: { rough: 0.26 },
      skin: { color: 0xe9b593, rough: 0.48 },
    },
    // touch-up 2: deep sapphire crystal, not white-blue: a lower fixed glow intensity keeps the hue under bloom (overdrive still surges it)
    wild: { glow: { ei: 1.9 } },
  },
  sockets: { muzzle: ['aux1', [0, 0, 0]], muzzleL: ['handL', [0, -0.09, 0.04]], core: [0, 0.1, 0.13], head: [0, 0.16, 0.06], hand: ['handL', [0, -0.09, 0.04]], crystal: ['aux1', [0, 0, 0]] },
  events: {
    attack: [['fire', 0.48]], attack_alt: [['cast', 0.45]], cast: [['fire', 0.42]],
    overdrive: [['cast', 0.14], ['impact', 0.55]], die: [['down', 0.84]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 1.0, attack_alt: 1.3, cast: 1.1, overdrive: 2.4, hit: 0.42, die: 1.9, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.2), an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    // crystal: slow spin about the staff axis, fast while casting
    const sp = an === 'overdrive' || an === 'cast' ? 4 : 1;
    ctx.spin = (ctx.spin || 0) + (ctx.dtc || 0.016) * sp;
    const ci = BI.aux1 * 3; P[ci] = 0; P[ci + 1] = 0; P[ci + 2] = ctx.spin;
    // robe tabard (front) / back panel follow the leading / trailing leg
    const tl = P[BI.thighL * 3], tr = P[BI.thighR * 3];
    P[BI.aux2 * 3] = Math.min(0, tl, tr) * 0.95 - 0.07; P[BI.aux2 * 3 + 2] = (P[BI.thighL * 3 + 2] + P[BI.thighR * 3 + 2]) * 0.3;
    P[BI.aux3 * 3] = Math.max(0, tl, tr) * 0.95 + 0.06;
    // cloak + back hair: hang off the shoulders, swing back on the move and in the overdrive
    let sway = 0.05 + 0.03 * Math.sin(t * 1.4) + 0.3 * mv;
    if (an === 'overdrive') sway += 0.35 * L.kf(u, [[0, 0], [0.5, 0.3], [0.58, 1], [0.9, 0.6], [1, 0]]);
    if (an === 'deploy') sway += 0.9 * L.kf(u, [[0, 1], [0.38, 1], [0.5, 0.1], [1, 0]]);
    sway += ctx.capeAdd || 0; ctx.capeAdd = 0;
    if (an === 'die') sway *= 1 - u;
    P[BI.aux0 * 3] = sway - P[BI.chest * 3] - P[BI.spine * 3] * 0.8 - P[BI.pelvis * 3] * 0.5;
    P[BI.aux0 * 3 + 1] = -P[BI.chest * 3 + 1] * 0.4;
  },
  tick(unit, dt, ctx, bones) {
    ctx.dtc = dt;
    // the crystal floats in its cradle: a slow bob along the staff
    if (!ctx.cr) ctx.cr = bones[BI.aux1].position.clone();
    const an = unit.state.action;
    bones[BI.aux1].position.copy(ctx.cr);
    bones[BI.aux1].position.z += 0.025 * Math.sin(ctx.t * 2.1) + (an === 'overdrive' ? 0.04 : 0);
  },
  fxHints: { projectile: 'lumen_bolt', impact: 'lumen_burst', overdrive: 'sanctuary_grove', color: 0x3aa0ff },
  build,
};
