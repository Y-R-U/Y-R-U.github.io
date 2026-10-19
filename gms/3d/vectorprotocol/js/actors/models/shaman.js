// HORDE SHAMAN, "Bone-Drum Caller" (D21 fantasy, horde rare mage, M). Brief: docs/ROSTER.md `horde_shaman` (hunched
// minotaur-kin with bone drum and skull totem; red smoke). Look: refs/ref_fantasy_01.jpg (chunky painterly creatures).
// A hunched, pot-bellied orc caller: olive hide, short curled horns, tusks, big ears; a horned beast-skull headdress with a
// fan of red feathers; fur mantle + bone necklace; a hide frame drum slung on the left hip, beaten with a femur in the right fist;
// a gnarled totem staff in the left fist crowned with a horned skull that holds a spirit flame. Red war paint.
// VALUE: skin = olive hide (most of the body), paint = dark fur / wood / leather, accent = red cloth, feathers, war paint,
// metal = bone (skulls, tusks, horns, necklace, drum rim), trim = bronze (rings, bands), glow = spirit fire (eyes too: no eye slot).
// Rank tiers: R0 bare skull cap, no feathers, small drum · R1 base (skull headdress, 3 feathers) · R2 fur mantle grows, shoulder
//   skull, fetish strings, bigger necklace · R3 war paint and drum runes GLOW, staff skull burns with a spirit flame · R4 SILHOUETTE:
//   a back totem pole with skulls and a red banner, more feathers · R5 a ring of spirit flames orbits the head (most emissive).
// Bones: aux0 = back totem (chest), aux1 = headdress (head), aux2 = flame ring spinner (head), aux3 = jaw (head).
import { THREE, plate, fin, deform, pod, poseFrame, makeRig, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const DIMS = {
  thigh: 0.34, shin: 0.34, ankle: 0.09, hipX: 0.13, hipY: -0.05, spine: 0.12, chest: 0.16, neck: 0.3, headOff: 0.04,
  clavX: 0.08, clavY: 0.24, shoulder: 0.18, upArm: 0.3, foreArm: 0.28,
  aux0: [0, 0.3, -0.2], aux1: [0, 0.16, -0.01], aux2: [0, 0.12, 0], aux3: [0, -0.01, 0.06],
  parents: { aux2: 'head', aux3: 'head' },
};
// hunched staff hold (left arm): every anim's base pose; the staff is modelled upright in root space for it
const HUNCH = { pelvis: [0.1, 0, 0], spine: [0.16, 0, 0], chest: [0.2, 0, 0] };
const HOLD_L = { ...HUNCH, clavL: [0, 0, 0], upArmL: [-0.5, 0, 0.32], foreArmL: [-0.75, 0, 0], handL: [0, 0, 0] };
const RIG = makeRig(DIMS);
const STAFF_E = new THREE.Euler(...poseFrame(RIG, HOLD_L, 'handL'), 'XYZ');
const sv = (p) => new THREE.Vector3(...p).applyEuler(STAFF_E).toArray().map((x) => +x.toFixed(4));
const STAFF_TOP = 0.86;   // skull centre above the fist (root space, in the hold pose)
// drum: on the spine, front-left, head facing forward-right
const DRUM = { c: [0.17, -0.05, 0.2], r: 0.17, d: 0.12, rot: [0.25, -0.75, 0] };
const DRUM_N = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...DRUM.rot, 'XYZ'));
const DRUM_HEAD = DRUM.c.map((x, i) => x + DRUM_N.getComponent(i) * DRUM.d * 0.5);

const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const _c = new THREE.Vector3(), _p = new THREE.Vector3();
function branch(b, pts, r0, r1, seg = 8, rs = 6, wob = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const T = Math.max(2, b.n(seg)), R = Math.max(3, b.n(rs));
  const g = new THREE.TubeGeometry(curve, T, 1, R, false);
  const P = g.attributes.position;
  for (let i = 0; i <= T; i++) {
    curve.getPointAt(i / T, _c);
    const r = (r0 + (r1 - r0) * (i / T)) * (1 + wob * Math.sin(i * 2.3 + r0 * 50));
    for (let j = 0; j <= R; j++) { const k = i * (R + 1) + j; _p.fromBufferAttribute(P, k).sub(_c).multiplyScalar(r).add(_c); P.setXYZ(k, _p.x, _p.y, _p.z); }
  }
  g.computeVertexNormals();
  return g;
}
const shag = (g, a = 0.018, f = 38) => deform(g, (v) => { v.x += Math.sin(v.y * f + v.z * 13) * a; v.z += Math.cos(v.y * (f - 5) + v.x * 11) * a; v.y += Math.sin(v.x * 31) * a * 0.5; });
const lumpy = (g, a = 0.08) => deform(g, (v) => { v.multiplyScalar(1 + a * Math.sin(v.x * 9) * Math.cos(v.y * 7 + v.z * 5)); });
// feather: a long tapered vane with a quill (vane in `slot`, tip band in `tip`)
function feather(b, bone, slot, pos, rot, L = 0.3, w = 0.05, tip = null) {
  b.scope(pos, rot, 1, () => {
    b.add(fin(b, [[0, 0], [w * 0.6, L * 0.25], [w * 0.5, L * 0.8], [0, L], [-w * 0.5, L * 0.8], [-w * 0.6, L * 0.25]], 0.01, 0.003), bone, slot);
    if (tip) b.add(fin(b, [[w * 0.52, L * 0.72], [0, L], [-w * 0.52, L * 0.72], [0, L * 0.82]], 0.014, 0.002), bone, tip);
  });
}
// horned beast skull (faces +z), k = size
function skull(b, bone, pos, rot, k = 1, { horns = true, eyes = 'glow', jaw = true } = {}) {
  b.scope(pos, rot, k, () => {
    b.add(lumpy(b.sph(10, 8), 0.05), bone, 'metal', [0, 0, 0], [0, 0, 0], [0.09, 0.08, 0.1]);
    b.add(plate(b, 0.09, 0.07, 0.14, { c: 0.02, tx: 0.7, tz: 0.8 }), bone, 'metal', [0, -0.03, 0.08], [0.2, 0, 0]);
    for (const s of [1, -1]) {
      b.add(b.sph(6, 4), bone, eyes, [s * 0.035, 0.01, 0.085], [0, 0, 0], [0.02, 0.016, 0.01]);
      if (horns) b.add(branch(b, [[s * 0.07, 0.03, 0.0], [s * 0.15, 0.06, -0.02], [s * 0.2, 0.13, 0.03], [s * 0.19, 0.2, 0.08]], 0.026, 0.006, 6, 6), bone, 'metal');
    }
    if (jaw) for (let i = 0; i < 4; i++) b.add(b.cyl(0.0, 0.007, 0.025, 4), bone, 'metal', [(i - 1.5) * 0.017, -0.075, 0.125], [PI, 0, 0]);
  });
}

function build(b, o) {
  const r = o.rank, far = b.far, D = b.rig.D;
  const paintGlow = r >= 3 ? 'glow' : 'accent';

  // ---- hips: hide kilt flaps, red loincloth, belt with skull buckle
  b.add(pod(b, 0.1, -0.16, [0.16, 0.19, 0.18], 14), 'pelvis', 'skin', [0, 0, 0], [0, 0, 0], [1.1, 1, 0.9]);
  for (let i = 0; i < (far ? 5 : 8); i++) {
    const a = -PI * 0.85 + (i / 7) * PI * 1.7, x = Math.sin(a) * 0.2, z = Math.cos(a) * 0.17;
    b.add(shag(plate(b, 0.11, 0.22, 0.025, { c: 0.008, tx: 1.2, bx: 0.8 }), 0.008, 30), 'pelvis', 'paint', [x, -0.13, z], [Math.cos(a) * 0.25, a, -Math.sin(a) * 0.2]);
  }
  b.add(plate(b, 0.17, 0.32, 0.02, { c: 0.006, tx: 1.2, bx: 0.85 }), 'pelvis', 'accent', [0, -0.2, 0.2], [0.18, 0, 0]);
  b.add(b.tor(0.2, 0.025, 18, 5), 'pelvis', 'paint', [0, 0.02, 0.01], [PI / 2, 0, 0], [1.05, 0.88, 1]);
  skull(b, 'pelvis', [0, 0.0, 0.2], [0.1, 0, 0], 0.55, { horns: false });
  if (r >= 2 && !far) for (let i = 0; i < 3; i++) b.add(branch(b, [[-0.16 + i * 0.03, 0, 0.13 - i * 0.04], [-0.17 + i * 0.03, -0.1, 0.15 - i * 0.04], [-0.17 + i * 0.03, -0.2, 0.14 - i * 0.04]], 0.006, 0.004, 3, 3), 'pelvis', 'paint');

  // ---- belly + chest: pot belly, barrel chest, war paint, necklace
  b.add(pod(b, 0.2, -0.06, [0.2, 0.23, 0.2], 14), 'spine', 'skin', [0, 0, 0.03], [0, 0, 0], [1, 1, 0.95]);
  b.add(pod(b, 0.36, -0.04, [0.21, 0.25, 0.24, 0.17], 16), 'chest', 'skin', [0, 0, 0.0], [0, 0, 0], [1.1, 1, 0.85]);
  for (const s of [1, -1]) {
    // pectoral slabs + red war-paint claw stripes
    b.add(b.sph(10, 8), 'chest', 'skin', [s * 0.1, 0.2, 0.12], [0, 0, 0], [0.12, 0.1, 0.09]);
    for (let k = 0; k < 3; k++) b.add(b.cbox(0.016, 0.12, 0.01, 0.004), 'chest', paintGlow, [s * (0.06 + k * 0.035), 0.17 - k * 0.01, 0.205 - k * 0.012], [0.3, s * 0.35, s * (0.35 + k * 0.05)]);
  }
  // bone necklace: a ring of fangs + a centre skull
  const nn = far ? 6 : r >= 2 ? 13 : 9;
  for (let i = 0; i < nn; i++) {
    const a = -1.2 + (i / (nn - 1)) * 2.4, x = Math.sin(a) * 0.17, z = Math.cos(a) * 0.15 + 0.03;
    b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, -0.06]], 0.012, 0.003), 'chest', 'metal', [x, 0.33 - Math.cos(a) * 0.06, z], [0.4, a, 0]);
  }
  b.add(b.tor(0.17, 0.008, 16, 3, PI * 0.9), 'chest', 'paint', [0, 0.32, 0.05], [PI / 2 + 0.5, 0, PI * 0.05]);
  skull(b, 'chest', [0, 0.24, 0.22], [0.2, 0, 0], 0.45, { horns: r >= 2 });

  // ---- fur mantle over the shoulders + upper back (grows with rank)
  const mk = r >= 2 ? 1.15 : 1;
  b.add(shag(b.sph(14, 10, 0, TAU, 0, PI * 0.6), 0.02), 'chest', 'paint', [0, 0.28, -0.09], [0.35, 0, 0], [0.27 * mk, 0.15 * mk, 0.22 * mk]);
  // fur cloak down the back, ragged hem
  b.add(shag(deform(b.cbox(0.36 * mk, 0.5, 0.04, 0.012), (v) => { v.z -= Math.pow(Math.abs(v.x) / 0.18, 2) * 0.05; if (v.y < -0.2) v.y += Math.sin(v.x * 40) * 0.03; }), 0.012, 30), 'chest', 'paint', [0, 0.06, -0.21], [-0.12, 0, 0]);
  if (r >= 2 && !far) for (let k = 0; k < 3; k++) feather(b, 'chest', k % 2 ? 'metal' : 'accent', [-0.1 + k * 0.1, -0.12, -0.24], [PI + 0.1, 0, (k - 1) * 0.15], 0.14, 0.03);
  b.sym(shag(b.sph(12, 8), 0.022), 'clav', 'paint', [0.15, 0.04, -0.02], [0, 0, 0.3], [0.15 * mk, 0.11 * mk, 0.15 * mk]);
  if (r >= 2) skull(b, 'clavL', [0.2, 0.11, 0.02], [-0.2, 0.6, 0.2], 0.6, { horns: true });
  // strap for the drum (right shoulder -> left hip)
  b.add(branch(b, [[-0.17, 0.36, 0.08], [-0.05, 0.26, 0.21], [0.12, 0.08, 0.2], [0.2, -0.06, 0.12]], 0.018, 0.018, 8, 4), 'chest', 'paint');

  // ---- head: wide jaw, heavy brow, big ears, tusks, short horns, glowing eyes, war paint
  b.add(b.cyl(0.075, 0.09, 0.16, 10), 'neck', 'skin', [0, 0.02, 0.02], [0.3, 0, 0]);
  b.add(lumpy(b.sph(14, 12), 0.04), 'head', 'skin', [0, 0.08, 0.02], [0, 0, 0], [0.12, 0.12, 0.125]);
  b.add(plate(b, 0.2, 0.05, 0.08, { c: 0.018, tx: 0.85 }), 'head', 'skin', [0, 0.115, 0.1], [0.3, 0, 0]);
  b.add(b.sph(8, 6), 'head', 'skin', [0, 0.06, 0.135], [0, 0, 0], [0.04, 0.04, 0.04]);
  for (const s of [1, -1]) {
    b.add(b.sph(6, 4), 'head', 'glow', [s * 0.045, 0.085, 0.118], [0, 0, 0], [0.02, 0.012, 0.01]);
    b.add(fin(b, [[0, -0.03], [0.17, 0.02], [0.03, 0.04]], 0.016, 0.004), 'head', 'skin', [s * 0.1, 0.09, -0.01], [0, s * -0.35, s * 0.2]);
    b.add(b.cbox(0.05, 0.016, 0.012, 0.004), 'head', 'accent', [s * 0.05, 0.085, 0.124], [0, s * 0.3, s * -0.15]);
    b.add(branch(b, [[s * 0.08, 0.15, 0.0], [s * 0.15, 0.17, -0.02], [s * 0.18, 0.24, 0.02], [s * 0.15, 0.27, 0.06]], 0.022, 0.005, 6, 5), 'head', 'metal');
  }
  if (r >= 3) b.add(b.cbox(0.01, 0.06, 0.008, 0.003), 'head', 'glow', [0, 0.155, 0.13], [0.5, 0, 0]);
  // jaw (aux3) with tusks
  b.add(plate(b, 0.17, 0.06, 0.13, { c: 0.02, tx: 1.1, bx: 0.85 }), 'aux3', 'skin', [0, -0.02, 0.04]);
  for (const s of [1, -1]) b.add(branch(b, [[s * 0.06, 0.0, 0.1], [s * 0.065, 0.04, 0.115], [s * 0.05, 0.075, 0.12]], 0.014, 0.003, 4, 5), 'aux3', 'metal');

  // ---- headdress (aux1): horned beast skull worn on the head, a fan of feathers behind it
  if (r === 0) b.add(b.sph(10, 8, 0, TAU, 0, PI / 2), 'aux1', 'metal', [0, -0.03, 0.0], [0, 0, 0], [0.125, 0.07, 0.13]);
  else {
    skull(b, 'aux1', [0, 0.02, 0.06], [-0.15, 0, 0], 1.15, { horns: true, jaw: false, eyes: r >= 3 ? 'glow' : 'paint' });
    const nf = far ? 3 : [0, 3, 5, 5, 7, 9][r];
    for (let i = 0; i < nf; i++) {
      const a = (i / Math.max(1, nf - 1) - 0.5) * (nf > 3 ? 1.9 : 1.3), L = 0.3 + (1 - Math.abs(a)) * 0.08;
      feather(b, 'aux1', i % 2 ? 'paint' : 'accent', [Math.sin(a) * 0.05, 0.04, -0.07], [-0.55, 0, -a], L, 0.055, 'metal');
    }
  }

  // ---- arms: thick hide, leather bracers + bronze bands, fists
  b.sym(pod(b, 0.05, -D.upArm, [0.075, 0.085, 0.07, 0.06], 12), 'upArm', 'skin');
  b.sym(pod(b, 0.02, -D.foreArm, [0.065, 0.07, 0.06, 0.05], 12), 'foreArm', 'skin');
  b.sym(pod(b, -0.08, -0.25, [0.072, 0.075, 0.065], 10), 'foreArm', 'paint');
  b.sym(b.tor(0.074, 0.01, 12, 4), 'foreArm', 'trim', [0, -0.09, 0], [PI / 2, 0, 0]);
  b.sym(b.tor(0.088, 0.012, 12, 4), 'upArm', 'trim', [0, -0.1, 0], [PI / 2, 0, 0]);
  for (let k = 0; k < 2; k++) b.sym(b.cbox(0.012, 0.09, 0.008, 0.003), 'upArm', paintGlow, [0.07, -0.16 - k * 0.04, 0.035 - k * 0.03], [0, PI / 2, 0.5]);
  b.sym(b.rbox(0.075, 0.1, 0.09, 0.025), 'hand', 'skin', [0, -0.06, 0.01]);
  b.sym(b.rbox(0.07, 0.04, 0.075, 0.015), 'hand', 'skin', [-0.005, -0.11, 0.025], [0.5, 0, 0]);

  // ---- legs: hide thighs, leg wraps, big bare feet
  b.sym(pod(b, 0.04, -D.thigh, [0.1, 0.11, 0.09, 0.075], 12), 'thigh', 'skin');
  b.sym(pod(b, 0.0, -D.shin, [0.075, 0.08, 0.065, 0.055], 12), 'shin', 'skin');
  for (let k = 0; k < (far ? 2 : 4); k++) b.sym(b.tor(0.072 - k * 0.004, 0.014, 12, 4), 'shin', 'paint', [0, -0.1 - k * 0.055, 0], [PI / 2 + (k % 2 ? 0.15 : -0.15), 0, 0]);
  b.sym(b.rbox(0.12, 0.07, 0.2, 0.03), 'foot', 'skin', [0, -D.ankle + 0.035, 0.05]);
  if (!far) for (let k = 0; k < 3; k++) b.sym(b.cyl(0.0, 0.012, 0.03, 4), 'foot', 'metal', [-0.035 + k * 0.035, -D.ankle + 0.02, 0.155], [PI / 2, 0, 0]);
  if (r >= 2) b.sym(b.tor(0.1, 0.012, 12, 4), 'thigh', 'trim', [0, -0.07, 0], [PI / 2, 0, 0]);

  // ---- drum on the left hip (spine): hide head, bone rim, lashings, painted eye sigil, dangling feathers
  const dk = r === 0 ? 0.85 : 1;
  b.scope(DRUM.c, DRUM.rot, dk, () => {
    b.add(b.cyl(DRUM.r, DRUM.r * 0.96, DRUM.d, 18, true), 'spine', 'paint', [0, 0, 0], [PI / 2, 0, 0]);
    b.add(b.cyl(DRUM.r * 0.97, DRUM.r * 0.97, 0.01, 18), 'spine', 'metal', [0, 0, DRUM.d * 0.5], [PI / 2, 0, 0]);
    b.add(b.cyl(DRUM.r * 0.93, DRUM.r * 0.93, 0.01, 18), 'spine', 'metal', [0, 0, -DRUM.d * 0.5], [PI / 2, 0, 0]);
    for (const z of [1, -1]) b.add(b.tor(DRUM.r, 0.012, 18, 4), 'spine', 'metal', [0, 0, z * DRUM.d * 0.5]);
    if (!far) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.add(b.cbox(0.012, 0.012, DRUM.d * 1.04, 0.003), 'spine', 'paint', [Math.cos(a) * DRUM.r * 1.01, Math.sin(a) * DRUM.r * 1.01, 0], [0, 0, a]); }
    // sigil on the head: an eye + three claw strokes
    b.add(b.tor(0.05, 0.009, 14, 3), 'spine', paintGlow, [0, 0.01, DRUM.d * 0.5 + 0.007]);
    b.add(b.sph(6, 4), 'spine', paintGlow, [0, 0.01, DRUM.d * 0.5 + 0.006], [0, 0, 0], [0.018, 0.018, 0.004]);
    for (let k = 0; k < 3; k++) b.add(b.cbox(0.012, 0.05, 0.004, 0.002), 'spine', paintGlow, [-0.04 + k * 0.04, -0.09, DRUM.d * 0.5 + 0.007], [0, 0, (k - 1) * 0.3]);
    if (!far) for (let k = 0; k < (r >= 2 ? 3 : 2); k++) {
      const a = -1.9 - k * 0.35, p = [Math.cos(a) * DRUM.r, Math.sin(a) * DRUM.r, 0];
      b.add(b.cyl(0.003, 0.003, 0.08, 3), 'spine', 'paint', [p[0], p[1] - 0.04, p[2]]);
      feather(b, 'spine', k % 2 ? 'paint' : 'accent', [p[0], p[1] - 0.08, p[2]], [PI, 0, 0], 0.13, 0.03);
    }
  });

  // ---- drumstick (right fist): a femur, knob forward-down (hold frame: forearm points forward)
  b.scope([0, -0.08, 0.01], [PI / 2, 0, 0], 1, () => {
    b.add(b.cyl(0.016, 0.02, 0.3, 7), 'handR', 'metal', [0, 0, 0.1], [PI / 2, 0, 0]);
    b.add(lumpy(b.sph(8, 6), 0.1), 'handR', 'metal', [0, 0, 0.26], [0, 0, 0], [0.04, 0.035, 0.045]);
    b.add(b.sph(6, 5), 'handR', 'metal', [0, 0, -0.06], [0, 0, 0], [0.028, 0.025, 0.028]);
    b.add(b.tor(0.022, 0.006, 8, 3), 'handR', 'accent', [0, 0, 0.18]);
  });

  // ---- totem staff (left fist), modelled upright in the hunched hold pose
  b.scope([0, 0, 0], STAFF_E.toArray().slice(0, 3), 1, () => {
    b.add(branch(b, [[0, -0.86, 0.0], [0.015, -0.4, 0.01], [-0.01, 0.1, 0], [0.012, 0.5, 0.01], [0, STAFF_TOP - 0.06, 0]], 0.032, 0.026, 10, 6, 0.15), 'handL', 'paint');
    b.add(b.tor(0.026, 0.008, 10, 3), 'handL', 'trim', [0, 0.12, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.024, 0.008, 10, 3), 'handL', 'trim', [0, -0.12, 0], [PI / 2, 0, 0]);
    // forked crook holding the skull
    for (const s of [1, -1]) b.add(branch(b, [[0, STAFF_TOP - 0.1, 0], [s * 0.07, STAFF_TOP, -0.02], [s * 0.06, STAFF_TOP + 0.12, 0.0]], 0.014, 0.006, 5, 4), 'handL', 'paint');
    skull(b, 'handL', [0, STAFF_TOP, 0.0], [0.05, 0, 0], 0.85, { horns: true, eyes: 'glow' });
    // fetish strings: beads + feathers hanging under the skull
    const nh = far ? 1 : r >= 2 ? 4 : 2;
    for (let k = 0; k < nh; k++) {
      const a = k / nh * TAU + 0.5, x = Math.sin(a) * 0.05, z = Math.cos(a) * 0.05, L = 0.12 + hash(k) * 0.08;
      b.add(b.cyl(0.003, 0.003, L, 3), 'handL', 'paint', [x, STAFF_TOP - 0.1 - L / 2, z]);
      for (let j = 0; j < 2; j++) b.add(b.sph(5, 4), 'handL', j ? 'metal' : 'trim', [x, STAFF_TOP - 0.12 - j * 0.04, z], [0, 0, 0], 0.012);
      feather(b, 'handL', k % 2 ? 'paint' : 'accent', [x, STAFF_TOP - 0.1 - L, z], [PI, a, 0], 0.11, 0.028);
    }
    // R3+: spirit flame burning in the skull's crown
    if (r >= 3) for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU;
      b.add(fin(b, [[-0.03, 0], [0.03, 0], [0.012, 0.09 + k * 0.02], [0, 0.15 + k * 0.03], [-0.014, 0.08]], 0.02, 0.004), 'handL', 'glow', [Math.sin(a) * 0.012, STAFF_TOP + 0.05, Math.cos(a) * 0.012], [0, a, 0]);
    }
  });

  // ---- R4: back totem pole with stacked skulls + red banner + feathers
  if (r >= 4) {
    b.add(branch(b, [[0, -0.1, 0], [0.01, 0.3, -0.02], [0, 0.66, 0]], 0.022, 0.016, 8, 5), 'aux0', 'paint');
    b.add(b.cbox(0.34, 0.03, 0.03, 0.008), 'aux0', 'paint', [0, 0.5, 0]);
    skull(b, 'aux0', [0, 0.7, 0.01], [0, 0, 0], 0.7, { horns: true });
    skull(b, 'aux0', [0, 0.38, 0.02], [0.1, 0, 0], 0.5, { horns: false });
    b.add(plate(b, 0.3, 0.32, 0.012, { c: 0.004, bx: 0.7 }), 'aux0', 'accent', [0, 0.33, -0.02], [0.05, 0, 0]);
    for (const s of [1, -1]) { feather(b, 'aux0', 'accent', [s * 0.17, 0.5, 0], [PI, 0, s * 0.15], 0.2, 0.04, 'metal'); feather(b, 'aux0', 'paint', [s * 0.13, 0.5, 0.01], [PI, 0, s * 0.05], 0.16, 0.035); }
  }
  // ---- R5: ring of spirit flames orbiting the head (aux2 spins)
  if (r >= 5) {
    const n = far ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, R = 0.3;
      b.add(fin(b, [[-0.03, 0], [0.03, 0], [0.01, 0.07], [0, 0.12], [-0.012, 0.06]], 0.024, 0.004), 'aux2', 'glow', [Math.sin(a) * R, 0.02 * Math.sin(a * 2), Math.cos(a) * R], [0, a, 0]);
      b.add(b.sph(6, 4), 'aux2', 'glow', [Math.sin(a) * R, 0.0, Math.cos(a) * R], [0, 0, 0], 0.028);
    }
  }
}

// ---------------- anims ----------------
const DURS = { attack: 1.0, attack_alt: 1.35, cast: 1.2, overdrive: 2.6, hit: 0.45, die: 1.9, deploy: 1.6 };
const SIDES = ['L', 'R'];
const _t = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const STICK = 0.27;   // fist -> femur knob
const jaw = (P, L, v) => L.R(P, 'aux3', v, 0, 0);
// left arm: staff hold (k raises/thrusts it); right arm: relaxed with the femur
// the wrist cancels the arm's pitch so the staff stays upright; `thrust` then tips the skull forward at the target
function staffArm(P, L, lift = 0, thrust = 0, out = 0) {
  const dU = -0.9 * lift - 0.55 * thrust, dF = 0.35 * lift + 0.2 * thrust;
  L.R(P, 'clavL', 0, 0, 0);
  L.R(P, 'upArmL', -0.5 + dU, 0, 0.32 + 0.3 * out);
  L.R(P, 'foreArmL', -0.75 + dF, 0, 0);
  L.R(P, 'handL', -(dU + dF) + 0.75 * thrust, 0, -0.3 * out);
}
function stickArm(P, L, br = 0) { L.RS(P, 'upArm', 'R', -0.25 + br, 0.1, 0.25); L.RS(P, 'foreArm', 'R', -0.9, 0, 0); L.RS(P, 'hand', 'R', 0.1, 0, 0); }
// right fist strikes the drum: h = 0 resting on the drum head, 1 raised high; IK onto a point off the drum head
function beat(P, ctx, L, h) {
  // knob on the drum head: the fist sits one stick-length back toward the right shoulder; h lifts it up and back
  L.fkPoint(P, ctx, 'spine', DRUM_HEAD, _t);
  L.fkPoint(P, ctx, 'upArmR', [0, 0, 0], _s);
  _d.copy(_s).sub(_t).normalize();
  _t.addScaledVector(_d, STICK + 0.03).add(_s.set(0, 0.22 * h, -0.04 * h)).addScaledVector(DRUM_N, 0.02 + 0.08 * h);
  L.armIK(P, ctx, 'R', _t, 0.3);
  L.RS(P, 'hand', 'R', -0.75 * h, 0, 0);
}
function hunch(P, t, ctx, L, k = 1) {
  const br = Math.sin(t * 1.6), sw = Math.sin(t * 0.6);
  L.pel(P, sw * 0.018 * k, -0.06 + br * 0.006, 0);
  L.R(P, 'pelvis', 0.1, sw * 0.05 * k, sw * 0.02 * k);
  L.R(P, 'spine', 0.16 + br * 0.012, -sw * 0.04 * k, -sw * 0.015 * k);
  L.R(P, 'chest', 0.2 + br * 0.02, -sw * 0.03 * k, 0);
  L.R(P, 'neck', -0.18, ctx.st.gy * 0.35, 0);
  L.R(P, 'head', -0.2 + ctx.st.gp * 0.5, ctx.st.gy * 0.5, ctx.st.tilt);
  staffArm(P, L, 0.02 * br * k);
  stickArm(P, L, 0.03 * br);
  jaw(P, L, 0.05 + 0.03 * Math.max(0, Math.sin(t * 7)) * k);
  L.plant(P, ctx, 0.08, -0.08, 1.05);
}
const anims = {
  idle(P, t, ctx, L) {
    hunch(P, t, ctx, L);
    // mutters a chant: two soft drum taps every ~5 s, head bobbing, staff swaying
    const c = t % 5.4, k = L.kf(c, [[0, 0], [2.6, 0], [2.9, 1], [4.2, 1], [4.6, 0]]);
    if (k > 0) {
      const tap = Math.max(0, Math.sin((c - 2.9) * PI * 2.6));
      beat(P, ctx, L, 0.15 + 0.35 * tap);
      L.A(P, 'head', 0.1 * tap * k, 0, 0.06 * Math.sin(c * 3) * k);
      L.A(P, 'chest', 0, 0.05 * k, 0);
      jaw(P, L, 0.05 + 0.15 * tap * k);
    }
    staffArm(P, L, 0.05 * Math.sin(t * 1.2), 0, 0.1 * Math.sin(t * 0.7));
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    const ph = ctx.move.phase * TAU, s2 = Math.sin(ph);
    L.R(P, 'pelvis', 0.14, -0.08 * s2, 0.04 * s2);
    L.R(P, 'spine', 0.2, 0.08 * s2, -0.03 * s2);
    L.R(P, 'chest', 0.2, 0.06 * s2, 0);
    L.R(P, 'neck', -0.24, -0.04 * s2, 0); L.R(P, 'head', -0.1, -0.05 * s2, 0.05 * s2);
    // the staff strides out like a walking stick, the femur arm swings
    staffArm(P, L, 0.15 + 0.2 * Math.max(0, s2), 0.25 * Math.max(0, -s2), 0);
    stickArm(P, L, -0.35 * s2);
    jaw(P, L, 0.05);
  },
  cast(P, u, ctx, L) {
    // HEX BOLT (the battle's basic attack for mages): one hard drum strike (cast 0.3), then thrusts the totem staff at the
    // target and the skull spits a spirit flame (fire 0.58)
    hunch(P, ctx.t, ctx, L, 0.4);
    const strike = L.kf(u, [[0, 0], [0.18, 1], [0.3, 0], [0.42, 0.25], [0.7, 0]]);
    const ready = L.kf(u, [[0, 0], [0.15, 0.2], [0.42, 1], [0.5, 1.05], [0.58, 0.3], [0.8, 0.25], [1, 0]]);
    const thrust = L.kf(u, [[0, 0], [0.48, 0], [0.58, 1], [0.75, 0.9], [1, 0]]);
    if (u < 0.7) beat(P, ctx, L, strike);
    L.A(P, 'chest', -0.08 * ready + 0.12 * thrust, 0.2 * ready - 0.15 * thrust, 0);
    L.A(P, 'spine', 0.06 * thrust, 0.1 * ready - 0.1 * thrust, 0);
    staffArm(P, L, 0.6 * ready * (1 - thrust), thrust, 0.2 * ready);
    L.A(P, 'head', 0.12 * strike - 0.15 * ready, 0, 0);
    P[L.PX + 2] += 0.06 * thrust;
    jaw(P, L, 0.05 + 0.3 * thrust + 0.15 * strike);
    L.plant(P, ctx, 0.14, -0.1, 1.12);
  },
  attack(P, u, ctx, L) {
    // TOTEM JAB: raises the staff overhead, then rams the skull forward (fire 0.42)
    hunch(P, ctx.t, ctx, L, 0.4);
    const up = L.kf(u, [[0, 0], [0.3, 1], [0.4, 0.2], [1, 0]]), thrust = L.kf(u, [[0, 0], [0.32, 0], [0.42, 1], [0.65, 0.8], [1, 0]]);
    staffArm(P, L, up, thrust, 0.1);
    L.A(P, 'chest', -0.15 * up + 0.15 * thrust, 0.15 * up - 0.12 * thrust, 0);
    P[L.PX + 2] += 0.1 * thrust; P[L.PX + 1] -= 0.04 * thrust;
    stickArm(P, L, 0.4 * up);
    jaw(P, L, 0.05 + 0.3 * thrust);
    L.plant(P, ctx, 0.2, -0.12, 1.2);
  },
  attack_alt(P, u, ctx, L) {
    // DOUBLE BEAT + FLING: two drum strikes (cast 0.22, 0.38), then swings the staff skull round in an arc (fire 0.62)
    hunch(P, ctx.t, ctx, L, 0.4);
    const s1 = L.kf(u, [[0, 0], [0.12, 1], [0.22, 0], [0.3, 0.9], [0.38, 0], [0.5, 0.2], [0.7, 0]]);
    const swing = L.kf(u, [[0, 0], [0.4, 0], [0.52, -1], [0.62, 1], [0.8, 0.7], [1, 0]]);
    if (u < 0.6) beat(P, ctx, L, s1);
    else stickArm(P, L, -0.2);
    L.A(P, 'chest', 0.05 * Math.abs(swing), -0.3 * swing, 0);
    L.A(P, 'spine', 0, -0.15 * swing, 0);
    staffArm(P, L, 0.5 * Math.abs(swing), Math.max(0, swing), 0.5 * Math.max(0, -swing));
    L.A(P, 'head', 0.1 * s1, 0.2 * swing, 0);
    jaw(P, L, 0.05 + 0.2 * s1 + 0.3 * Math.max(0, swing));
    L.plant(P, ctx, 0.14, -0.12, 1.15);
  },
  overdrive(P, u, ctx, L) {
    // BLOOD TOTEM / war chant: hoists the staff and slams it into the floor (impact 0.22), then a frenzied drum roll
    // (cast 0.4 0.5 0.6 0.7), head thrown back, and a final roar with both arms up (cast 0.86)
    hunch(P, ctx.t, ctx, L, 0.3);
    const hoist = L.kf(u, [[0, 0], [0.14, 1], [0.22, 0], [1, 0]]);
    const plant = L.kf(u, [[0, 0], [0.16, 0], [0.22, 1], [0.78, 1], [0.84, 0.4], [1, 0]]);
    const roll = u > 0.3 && u < 0.76 ? Math.max(0, Math.sin((u - 0.3) * PI * 2 / 0.1)) : 0;
    const roar = L.kf(u, [[0, 0], [0.78, 0], [0.86, 1], [0.95, 1], [1, 0]]);
    const frenzy = L.kf(u, [[0, 0], [0.3, 0], [0.36, 1], [0.76, 1], [0.8, 0]]);
    L.pel(P, 0, -0.06 + 0.04 * hoist - 0.1 * plant + 0.05 * roar - 0.03 * roll, 0.04 * plant);
    L.A(P, 'spine', -0.1 * hoist + 0.05 * plant - 0.25 * roar - 0.08 * frenzy, 0.1 * Math.sin(u * 40) * frenzy, 0);
    L.A(P, 'chest', -0.15 * hoist - 0.2 * roar - 0.1 * frenzy, 0, 0.06 * Math.sin(u * 33) * frenzy);
    L.A(P, 'neck', 0.1 * roar, 0, 0);
    L.A(P, 'head', -0.35 * frenzy - 0.3 * roar + 0.1 * roll, 0.2 * Math.sin(u * 25) * frenzy, 0);
    // staff: hoisted up, then held planted (arm straight down-forward)
    staffArm(P, L, 1.1 * hoist + 0.9 * roar - 0.25 * plant * (1 - roar), 0, 0.2 * roar);
    if (frenzy > 0.05 && roar < 0.5) beat(P, ctx, L, 0.1 + 0.9 * roll);
    else { L.RS(P, 'upArm', 'R', -0.25 - 2.3 * roar - 0.6 * hoist, 0.1, 0.25 + 0.5 * roar); L.RS(P, 'foreArm', 'R', -0.9 + 0.5 * roar, 0, 0); }
    jaw(P, L, 0.05 + 0.25 * frenzy * (0.5 + 0.5 * roll) + 0.45 * roar);
    L.plant(P, ctx, 0.12, -0.12, 1.2 + 0.1 * plant);
  },
  hit(P, u, ctx, L) {
    hunch(P, ctx.t, ctx, L, 0.4);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.15 * k, 0.1 * k * d, 0.05 * k * d);
    L.A(P, 'chest', -0.2 * k, 0.12 * k * d, 0);
    L.A(P, 'head', -0.3 * k, -0.2 * k * d, 0.2 * k * d);
    staffArm(P, L, 0.3 * k, 0, 0.3 * k);
    L.AS(P, 'upArm', 'R', -0.3 * k, 0, 0.4 * k);
    jaw(P, L, 0.05 + 0.3 * k);
  },
  die(P, u, ctx, L) {
    // staggers, drops to its knees clutching the drum, then pitches forward onto its face (down 0.78)
    L.dieB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.15, 1], [1, 1]]);
    L.A(P, 'head', 0.2 * k, 0, 0.2 * k);
    staffArm(P, L, 0.4 * L.kf(u, [[0, 0], [0.3, 1], [0.6, 0]]), 0, 0.6 * k);
    jaw(P, L, 0.3 * k);
  },
  victory(P, t, ctx, L) {
    // war dance: stomps side to side, drums, staff shaken high over the head, roars on the beat
    hunch(P, t, ctx, L, 0.5);
    const k = L.smooth(Math.min(1, t / 0.5)), w = t * TAU * 0.9, beatK = Math.max(0, Math.sin(w * 2));
    L.pel(P, 0.05 * Math.sin(w) * k, -0.06 - 0.05 * beatK * k, 0);
    L.A(P, 'pelvis', 0, 0, 0.08 * Math.sin(w) * k);
    L.A(P, 'chest', -0.15 * k, 0.15 * Math.sin(w) * k, -0.06 * Math.sin(w) * k);
    L.A(P, 'head', -0.25 * k * beatK, 0, 0.1 * Math.sin(w) * k);
    staffArm(P, L, (1.3 + 0.2 * Math.sin(w * 2)) * k, 0, 0.3 * k);
    beat(P, ctx, L, 0.15 + 0.6 * beatK);
    jaw(P, L, 0.05 + 0.4 * beatK * k);
    L.plant(P, ctx, 0.08 + 0.05 * Math.sin(w), -0.08 - 0.05 * Math.sin(w), 1.15);
  },
  deploy(P, u, ctx, L) {
    // no drop: steps out of a burst of red smoke, crouched low, then rises with staff and fist raised (land 0.3, ready 0.8)
    hunch(P, ctx.t, ctx, L, 0.3);
    const crouch = L.kf(u, [[0, 1], [0.35, 1], [0.6, 0], [1, 0]]), rise = L.kf(u, [[0, 0], [0.45, 0], [0.62, 1], [0.8, 1], [1, 0]]);
    L.pel(P, 0, -0.06 - 0.22 * crouch + 0.03 * rise, 0);
    L.A(P, 'spine', 0.3 * crouch - 0.15 * rise, 0, 0); L.A(P, 'chest', 0.2 * crouch - 0.15 * rise, 0, 0);
    L.A(P, 'head', 0.2 * crouch - 0.35 * rise, 0, 0);
    staffArm(P, L, 1.2 * rise, 0, 0.2 * rise);
    L.RS(P, 'upArm', 'R', -0.25 - 1.6 * rise, 0.1, 0.25 + 0.3 * rise); L.RS(P, 'foreArm', 'R', -0.9 + 0.3 * rise, 0, 0);
    jaw(P, L, 0.05 + 0.4 * rise);
    L.plant(P, ctx, 0.12, -0.1, 1.05 + 0.3 * crouch);
  },
};

export default {
  id: 'shaman', name: 'HORDE SHAMAN', role: 'mage', faction: 'horde', rarity: 'rare', realm: 'fantasy',
  rig: 'biped', dims: DIMS, height: 1.72, radius: 0.6, walkSpeed: 0.95, cadence: 0.85, scheme: 'dark',
  style: { weapon: 'blade', heavy: 0.6, stance: 1.2 },
  noDrop: true,
  motes: { color: 0xff6a2a },
  paint: {
    horde: { skin: 0x5f6b44, paint: 0x3e2f28, accent: 0x9a2418, trim: 0xb88a4a },
    wild: { skin: 0x7a8a50, paint: 0x4a3828, accent: 0x3f7a33, trim: 0xc9a46a },
    order: { skin: 0x7a8890, paint: 0x3a3c44, accent: 0x2a4ea8, trim: 0xc9b07a },
  },
  mats: {
    all: {
      skin: { rough: 0.62, detail: { map: 'grime', scale: 3, albedo: 0.5, rough: 0.3 } },
      paint: { rough: 0.85, metal: 0 },
      accent: { rough: 0.8 },
      metal: { color: 0xd8ccae, metal: 0.0, rough: 0.55, detail: { map: 'scratch', scale: 3, albedo: 0.5, rough: 0.3 } },
      trim: { rough: 0.35 },
      glow: { color: 0xff5a1e },
    },
  },
  sockets: {
    muzzle: ['handL', sv([0, STAFF_TOP - 0.02, 0.09])], staff: ['handL', sv([0, STAFF_TOP, 0])],
    staffFoot: ['handL', sv([0, -0.86, 0])],
    drum: ['spine', DRUM_HEAD], hand: ['handR', [0, -0.1, 0.05]], core: [0, 0.2, 0.22], head: [0, 0.12, 0.1],
  },
  events: {
    cast: [['cast', 0.3], ['fire', 0.58]], attack: [['fire', 0.42]], attack_alt: [['cast', 0.22], ['cast', 0.38], ['fire', 0.62]],
    overdrive: [['impact', 0.22], ['cast', 0.4], ['cast', 0.5], ['cast', 0.6], ['cast', 0.7], ['cast', 0.86]],
    die: [['down', 0.8]], deploy: [['land', 0.3], ['ready', 0.8]],
  },
  durs: DURS,
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const a = unit.state.action, t = ctx.t;
    // flame ring spins (wild in the war chant); headdress feathers shiver on drum beats
    bones[BI.aux2].rotation.set(0.15, (t * (a === 'overdrive' ? 4 : 1.1)) % TAU, 0);
    const shiver = a === 'overdrive' || a === 'cast' || a === 'attack_alt' || unit.state.loop === 'victory' ? 1 : 0.25;
    bones[BI.aux1].rotation.set(Math.sin(t * 13) * 0.025 * shiver, 0, Math.sin(t * 9) * 0.03 * shiver);
  },
  fxHints: { projectile: 'spirit_flame', overdrive: 'war_chant', color: 0xff5a1e },
  build,
};
