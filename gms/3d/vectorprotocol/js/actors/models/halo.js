// HALO, experimental epic mage "Stasis Mother" (sculptor-2). Brief: docs/ROSTER.md `halo`; look: refs/ref_battle_02.png enemy back (bubble mage).
// Tall floating mantis: triangular head with big compound eyes + long antennae on a thin neck, slender thorax with swept shoulder
// vanes, long thin arms folded in a praying pose with raptorial forearm blades, palm emitters, folded back wings, a segmented
// abdomen curling under the hover. It floats inside its own permanent violet bubble (kit aura) with a gyroscope of stasis rings.
// VALUE: `accent` = black-violet under-body (most of it), `paint` = saturated violet on head / vanes / blades / chest,
// `metal` = joints, `trim` = pale lilac markers + ring frames, `glow` = violet cores / veins, `eye` = pink-white compound eyes.
// Rank tiers (epic default R2): R0 battered, second wing pair torn short, metal ring frame · R1 base ring + head halo · R2 full wings, abdomen
//   glow rings (base) · R3 hex-node stasis ring + second ring, blade teeth, wing veins glow · R4 orbiting stasis motes on the
//   rings, third ring, halo crown spikes · R5 outer lattice cage = a second bubble layer, brighter halo.
// Technique: the stasis rings live on aux1 (re-parented to the pelvis) and precess in post(); tick() scales them out to bubble
// size in the overdrive and collapses them on death. The kit aura bubble is kept permanent by wrapping setShield (kit request).
import { THREE, P, PS, plate, fin, discX, shell, LIB, PI, BI } from '../kit.js';

const AURA = 0.38;
const DIMS = {
  hover: 0.95, thigh: 0.3, shin: 0.36, ankle: 0.04, hipX: 0.09, hipY: -0.04, spine: 0.13, chest: 0.22, neck: 0.2, headOff: 0.04,
  clavX: 0.05, clavY: 0.18, shoulder: 0.15, upArm: 0.34, foreArm: 0.36, aux0: [0, 0.18, -0.12],
  parents: { aux1: 'pelvis' }, aux1: [0, 0.3, 0], aux2: [0.45, 0.35, 0.15], aux3: [-0.45, 0.35, 0.15],
};
const L = LIB;
const SIDES = ['L', 'R'];

// mantis prayer: elbows low, forearms folded up, palms in front of the chest
function fold(P, k = 1, ph = 0) {
  for (const s of SIDES) {
    const o = s === 'L' ? 0 : 1.1;
    L.RS(P, 'upArm', s, L.lerp(-0.25, -0.4, k) + Math.sin(ph * 1.3 + o) * 0.04, -0.2 * k, L.lerp(0.55, 0.32, k));
    L.RS(P, 'foreArm', s, L.lerp(-0.8, -1.75, k) + Math.sin(ph * 1.6 + o) * 0.05, 0.2 * k, 0);
    L.RS(P, 'hand', s, 0.85 * k, 0, L.lerp(-0.4, -0.15, k));
  }
}
function base(P, ctx, t) {
  L.hoverIdle(P, ctx, t);
  // mantis head tilt every few seconds + forward-curious neck
  const c = t % 6.3, tilt = L.kf(c, [[0, 0], [3.6, 0], [3.9, 1], [4.9, 1], [5.3, 0]]);
  L.A(P, 'neck', 0.12, 0, 0); L.A(P, 'head', -0.1, 0, 0.35 * tilt);
  L.A(P, 'chest', -0.06, 0, 0);
  fold(P, 1, t);
  // legs drawn up and together like a mantis at rest
  for (const s of SIDES) L.AS(P, 'thigh', s, -0.2, 0, -0.05), L.AS(P, 'shin', s, 0.35, 0, 0);
}

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.025, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.018, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.026, 12), bone, slot, pos, rot);
}
// segmented pod along a polyline (abdomen / neck)
function segs(b, bone, pts, rs, slots, ring) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
    const dy = q[1] - pp[1], dz = q[2] - pp[2];
    const rx = Math.atan2(dz, -dy) * -1;
    b.add(b.sph(16, 12), bone, slots[i % slots.length], p, [rx, 0, 0], [rs[i], rs[i] * 1.15, rs[i]]);
    if (ring && i < pts.length - 1) b.add(b.tor(rs[i] * 0.92, rs[i] * 0.12, 16, 4), bone, ring, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [rx + PI / 2, 0, 0]);
  }
}

// ---------- parts ----------
function head(b, o) {
  const rk = o.rank, far = b.far, y = 0.05, z = 0.03;
  // triangular mantis face (wide brow, pointed chin) over a dark cranium
  b.add(b.sph(16, 12), 'head', 'accent', [0, y + 0.02, z - 0.04], [0, 0, 0], [0.1, 0.09, 0.11]);
  b.add(b.ext([[-0.13, 0.07], [0.13, 0.07], [0.11, 0.0], [0.025, -0.13], [-0.025, -0.13], [-0.11, 0.0]], 0.1, 0.016), 'head', 'paint', [0, y, z + 0.02], [-0.1, 0, 0]);
  b.add(b.ext([[-0.06, 0.03], [0.06, 0.03], [0.015, -0.1], [-0.015, -0.1]], 0.04, 0.008), 'head', 'accent', [0, y - 0.01, z + 0.07], [-0.1, 0, 0]);
  // dark mask between the compound eyes (touch-up 2: value contrast, the face read as two glowing balls)
  b.add(b.ext([[-0.085, 0.085], [0.085, 0.085], [0.07, 0.0], [0.03, -0.05], [-0.03, -0.05], [-0.07, 0.0]], 0.03, 0.008), 'head', 'accent', [0, y + 0.005, z + 0.07], [-0.1, 0, 0]);
  if (!far) b.sym(b.cbox(0.05, 0.006, 0.01, 0.002), 'head', 'glow', [0.035, y + 0.0, z + 0.088], [-0.1, 0, -0.35]);
  // compound eyes on the brow corners + a third ocellus
  b.sym(b.sph(16, 12), 'head', 'eye', [0.1, y + 0.045, z + 0.035], [0, 0.4, 0], [0.045, 0.055, 0.06]);
  b.sym(b.tor(0.05, 0.008, 16, 4), 'head', 'trim', [0.1, y + 0.045, z + 0.035], [0, PI / 2 + 0.4, 0], [1, 1.15, 1.1]);
  b.add(b.sph(8, 6), 'head', 'eye', [0, y + 0.05, z + 0.09], [0, 0, 0], 0.016);
  // cheek plates + secondary crest fins
  b.sym(plate(b, 0.03, 0.08, 0.08, { c: 0.01, bz: 0.6 }), 'head', 'accent', [0.085, y - 0.04, z + 0.05], [0, 0.3, 0.25]);
  b.sym(fin(b, [[0, 0], [0.04, 0], [-0.06, 0.08], [-0.08, 0.07]], 0.014, 0.004), 'head', 'paint', [0.06, y + 0.06, z - 0.02], [0.2, PI / 2 - 0.25, 0]);
  // mandible blades
  b.sym(fin(b, [[0, 0], [0.025, 0], [0.005, -0.07]], 0.014, 0.003), 'head', 'trim', [0.02, y - 0.11, z + 0.06], [0.3, 0, 0.2]);
  // brow ridge + crest
  b.add(b.cbox(0.2, 0.02, 0.04, 0.006), 'head', 'trim', [0, y + 0.07, z + 0.06], [-0.1, 0, 0]);
  b.add(fin(b, [[0, 0], [0.06, 0], [-0.08, 0.1], [-0.12, 0.09]], 0.02, 0.005), 'head', 'paint', [0, y + 0.06, z], [0, PI / 2, 0]);
  // long antennae curving up and back, glowing tips
  if (!far) for (const s of [1, -1]) {
    b.add(b.tube([[s * 0.04, y + 0.07, z + 0.05], [s * 0.09, y + 0.2, z + 0.04], [s * 0.16, y + 0.3, z - 0.08], [s * 0.2, y + 0.32, z - 0.2]], 0.006, 10, 4), 'head', 'metal');
    b.add(b.sph(8, 6), 'head', 'glow', [s * 0.2, y + 0.32, z - 0.2], [0, 0, 0], 0.016);
  }
  // halo behind the head (the unit's namesake); R4 adds crown spikes
  if (rk >= 1) {
    b.add(b.tor(0.17, 0.008, 32, 4), 'head', 'glow', [0, y + 0.08, z - 0.14], [-0.3, 0, 0]);
    b.add(b.tor(0.2, 0.005, 32, 3), 'head', 'trim', [0, y + 0.08, z - 0.14], [-0.3, 0, 0]);
  }
  if (rk >= 4) for (let i = 0; i < 7; i++) {
    const a = PI * 0.15 + i * PI * 0.7 / 6;
    b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, i === 3 ? 0.08 : 0.05]], 0.01, 0.003), 'head', 'glow', [Math.cos(a) * 0.2, y + 0.08 + Math.sin(a) * 0.2 * Math.cos(0.3), z - 0.14 - Math.sin(a) * 0.2 * Math.sin(0.3)], [-0.3, 0, a - PI / 2]);
  }
}

function body(b, o) {
  const rk = o.rank, far = b.far;
  // long thin segmented neck
  b.add(b.cyl(0.03, 0.035, 0.24, 10), 'neck', 'metal', [0, 0.1, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.038, 0.008, 12, 4), 'neck', 'accent', [0, 0.04 + i * 0.06, 0], [PI / 2, 0, 0]);
  // slender thorax: dark core, violet V plate, glowing sternum slit, lilac collar
  P(b, 'chest', 'metal', [0.2, 0.26, 0.16], [0, 0.08, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'accent', [0.36, 0.3, 0.22], [0, 0.11, 0.0], [0.06, 0, 0], { c: 0.045, tx: 1.15, bx: 0.5, bz: 0.75 });
  PS(b, 'chest', 'paint', [0.12, 0.12, 0.18], [0.13, 0.19, -0.02], [0, 0, -0.25], { c: 0.025, tx: 0.7 });
  P(b, 'chest', 'paint', [0.32, 0.2, 0.07], [0, 0.15, 0.11], [0.2, 0, 0], { c: 0.025, tx: 1.15, bx: 0.4 });
  b.add(b.ext([[-0.018, 0], [0.018, 0], [0.03, 0.09], [0, 0.14], [-0.03, 0.09]], 0.03, 0.006), 'chest', 'glow', [0, 0.02, 0.1], [0.12, 0, 0]);
  b.add(b.cbox(0.2, 0.025, 0.08, 0.008), 'chest', 'trim', [0, 0.235, 0.05], [0.3, 0, 0]);
  PS(b, 'chest', 'paint', [0.08, 0.14, 0.05], [0.1, 0.1, 0.08], [0.2, 0.35, 0.15], { c: 0.015, bx: 0.5 });
  lamp(b, 'chest', [0.07, 0.04, 0.105], [PI / 2 + 0.15, 0.3, 0], 0.014, 'eye');
  // carapace layering: dorsal shell, flank ribs, pectoral second layer, collar spikes
  P(b, 'chest', 'paint', [0.3, 0.24, 0.08], [0, 0.13, -0.11], [-0.25, 0, 0], { c: 0.03, tx: 1.1, bx: 0.6 });
  P(b, 'chest', 'accent', [0.24, 0.18, 0.05], [0, 0.11, -0.145], [-0.25, 0, 0], { c: 0.02, tx: 1.05, bx: 0.6 });
  for (let i = 0; i < 3; i++) PS(b, 'chest', i % 2 ? 'paint' : 'accent', [0.05, 0.045, 0.15 - i * 0.02], [0.16 - i * 0.012, 0.05 - i * 0.05, 0.0], [0, 0, 0.15 + i * 0.1], { c: 0.01, tz: 0.8 });
  PS(b, 'chest', 'accent', [0.13, 0.06, 0.04], [0.085, 0.215, 0.1], [0.5, 0.3, 0.1], { c: 0.012 });
  if (!b.far) for (let i = 0; i < 3; i++) b.sym(fin(b, [[-0.012, 0], [0.012, 0], [0, 0.06 - i * 0.012]], 0.012, 0.003), 'chest', 'trim', [0.04 + i * 0.045, 0.24 - i * 0.012, -0.06], [-0.6, 0, -0.3 - i * 0.2]);
  if (!b.far) for (const y of [0.06, 0.12, 0.18]) b.sym(b.cyl(0.008, 0.008, 0.012, 8), 'chest', 'trim', [0.15, y, 0.06], [0, 0, PI / 2]);
  // back: folded wings (two long leaf plates per side) with glowing veins at R3
  const wings = rk >= 2 ? 3 : 2;   // touch-up 2: R0 keeps a torn second pair (it read small and dim inside its bubble)
  for (let i = 0; i < wings; i++) {
    const len = (0.78 - i * 0.13) * (rk === 0 && i === 1 ? 0.62 : 1), ry = 0.22 + i * 0.16, wd = 1.5 - i * 0.15;
    const leaf = [[0, 0], [0.05 * wd, -0.02], [0.075 * wd, -len * 0.45], [0.05 * wd, -len * 0.8], [0, -len * 1.02], [-0.025 * wd, -len * 0.5]];
    const pos = [0.03 + i * 0.03, 0.02, -0.02 - i * 0.02], rot = [0.38, ry + 0.1, -0.42 - i * 0.26];   // splayed fan: a big read-shape from the battle camera
    b.sym(fin(b, leaf, 0.018, 0.005), 'aux0', i ? 'paint' : 'accent', pos, rot);
    // pale membrane panel inset on the wing + dark cross veins + a leading-edge spar
    b.scope(pos, rot, 1, () => {
      b.sym(fin(b, leaf.map(([x, y]) => [x * 0.62 + 0.01, y * 0.82 - 0.04]), 0.024, 0.003), 'aux0', i ? 'accent' : 'paint', [0, 0, 0]);
      if (!b.far) for (let j = 1; j <= 3; j++) b.sym(b.cbox(0.075 * wd, 0.008, 0.028, 0.002), 'aux0', 'metal', [0.025 * wd, -len * j * 0.22, 0], [0, 0, 0.25]);
      b.sym(b.tube([[0, 0, 0], [-0.02 * wd, -len * 0.5, 0], [0, -len, 0]], 0.009, 8, 4), 'aux0', 'metal', [0, 0, 0]);
    });
    if (rk >= 3) b.scope(pos, rot, 1, () => b.sym(b.cbox(0.006, len * 0.7, 0.006, 0.002), 'aux0', 'glow', [0.03, -len * 0.45, 0.012], [0, 0, 0.05]));
  }
  P(b, 'aux0', 'accent', [0.14, 0.14, 0.06], [0, 0, 0.02], [0, 0, 0], { c: 0.02 });
  b.add(b.cyl(0.03, 0.03, 0.02, 12), 'aux0', 'glow', [0, 0.0, -0.015], [PI / 2, 0, 0]);
  // wasp waist
  b.add(b.cyl(0.055, 0.075, 0.16, 10), 'spine', 'metal', [0, 0.05, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.07 - i * 0.006, 0.008, 14, 4), 'spine', 'accent', [0, 0.0 + i * 0.05, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.1, 0.1, 0.05], [0, 0.06, 0.06], [0.1, 0, 0], { c: 0.015, bx: 0.6 });
  // pelvis + segmented abdomen curling back under the hover
  P(b, 'pelvis', 'accent', [0.2, 0.1, 0.16], [0, 0, 0], [0, 0, 0], { c: 0.03 });
  const AB = [[0, -0.06, -0.07], [0, -0.17, -0.15], [0, -0.27, -0.25], [0, -0.35, -0.36], [0, -0.4, -0.47], [0, -0.41, -0.57]], AR = [0.118, 0.11, 0.096, 0.078, 0.06, 0.042];
  segs(b, 'pelvis', AB, AR, ['accent', 'paint'], rk >= 2 ? 'glow' : 'trim');
  // overlapping tergite plates on top of each segment + lateral spiracle lamps
  for (let i = 0; i < AB.length - 1; i++) {
    const [x, y, z] = AB[i], q = AB[i + 1], rx = Math.atan2(q[2] - z, -(q[1] - y)) * -1;
    b.add(b.sph(14, 8, 0, PI * 2, 0, PI * 0.42), 'pelvis', i % 2 ? 'accent' : 'paint', [x, y + AR[i] * 0.15, z - AR[i] * 0.2], [rx - 0.9, 0, 0], [AR[i] * 1.25, AR[i] * 1.1, AR[i] * 1.3]);
    if (!b.far && i < 4) b.sym(b.cyl(0.012, 0.012, 0.01, 8), 'pelvis', rk >= 2 ? 'glow' : 'trim', [AR[i] * 0.98, y, z], [0, 0, PI / 2]);
  }
  b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, -0.13]], 0.018, 0.004), 'pelvis', 'trim', [0, -0.42, -0.62], [-1.0, 0, 0]);
  // dorsal spines along the abdomen + hip guards
  if (!far) for (const [y, z, h] of [[0.0, -0.16, 0.07], [-0.1, -0.25, 0.08], [-0.2, -0.35, 0.07], [-0.29, -0.45, 0.06], [-0.34, -0.55, 0.045]]) b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, h]], 0.012, 0.003), 'pelvis', 'trim', [0, y, z], [-0.9, 0, 0]);
  PS(b, 'pelvis', 'paint', [0.05, 0.14, 0.14], [0.12, -0.04, 0.0], [0, 0, 0.25], { c: 0.015, bx: 0.7 });
  PS(b, 'pelvis', 'trim', [0.012, 0.11, 0.1], [0.148, -0.04, 0.0], [0, 0, 0.25]);
  // long coat-tail blades from the hips (the ref's flowing silhouette)
  b.sym(fin(b, [[0, 0], [0.07, 0], [0.04, -0.46], [0.0, -0.52]], 0.018, 0.005), 'pelvis', 'paint', [0.08, -0.02, 0.04], [-0.12, 0.25, 0.12]);
  b.sym(fin(b, [[0, 0], [0.05, 0], [0.03, -0.36], [0.0, -0.4]], 0.016, 0.004), 'pelvis', 'accent', [0.11, -0.03, -0.03], [0.12, 0.4, 0.18]);
}

function limbs(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  // shoulders: big swept-up violet vanes (above head level) + lilac edges
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.055);
  b.sym(b.cyl(0.03, 0.03, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.ext([[0, -0.04], [0.11, -0.05], [0.2, 0.12], [0.13, 0.4], [0.05, 0.16], [0, 0.04]], 0.03, 0.007), 'upArm', 'paint', [-0.01, 0.0, 0.02], [0, -0.3, -0.2]);
  b.sym(b.ext([[0.1, 0.0], [0.13, 0.0], [0.17, 0.14], [0.12, 0.34], [0.115, 0.3], [0.14, 0.14]], 0.036, 0.003), 'upArm', 'trim', [-0.01, 0.0, 0.02], [0, -0.3, -0.2]);
  b.sym(b.ext([[0, 0], [0.09, -0.02], [0.15, 0.12], [0.08, 0.24], [0.03, 0.1]], 0.024, 0.006), 'upArm', 'accent', [0.03, -0.03, -0.05], [0.25, -0.55, -0.45]);
  lamp(b, 'upArm', [0.08, 0.06, 0.06], [PI / 2, -0.3, 0], 0.018);
  // thin upper arm + dark sleeve plate
  b.sym(b.cyl(0.028, 0.024, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.08, ua * 0.6, 0.08], [0.005, -ua * 0.55, 0], [0, 0, 0], { c: 0.018, tx: 1.15, tz: 1.15 });
  PS(b, 'upArm', 'accent', [0.095, ua * 0.28, 0.095], [0.008, -ua * 0.3, 0], [0, 0, 0], { c: 0.016, tx: 0.85, tz: 0.85 });
  b.sym(b.tor(0.05, 0.008, 14, 4), 'upArm', 'trim', [0.005, -ua * 0.86, 0], [PI / 2, 0, 0]);
  b.sym(b.ext([[0, 0], [0.08, -0.03], [0.13, 0.1], [0.07, 0.2], [0.02, 0.08]], 0.02, 0.005), 'upArm', 'paint', [0.04, -0.02, -0.06], [0.45, -0.75, -0.6]);
  // forearm: raptorial blade along the outer edge, spike past the elbow; teeth at R3
  b.sym(discX(b, 0.035, 0.07, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(b.cyl(0.026, 0.02, fa, 8), 'foreArm', 'accent', [0, -fa / 2, 0]);
  b.sym(fin(b, [[0, 0.14], [0.045, 0.1], [0.075, -fa * 0.5], [0.035, -fa * 0.95], [-0.01, -fa * 0.6]], 0.024, 0.006), 'foreArm', 'paint', [0.03, 0, 0.0], [0, PI / 2, 0]);
  b.sym(fin(b, [[0, 0.1], [0.03, 0.07], [0.05, -fa * 0.45], [0.02, -fa * 0.8], [-0.005, -fa * 0.5]], 0.03, 0.003), 'foreArm', 'accent', [0.03, 0, 0.0], [0, PI / 2, 0]);
  PS(b, 'foreArm', 'paint', [0.06, fa * 0.4, 0.065], [0, -fa * 0.35, 0], [0, 0, 0], { c: 0.014, tx: 1.15, bx: 0.8 });
  b.sym(b.cbox(0.012, fa * 0.6, 0.012, 0.003), 'foreArm', rk >= 2 ? 'glow' : 'trim', [0.03, -fa * 0.45, -0.035]);
  if (rk >= 3 && !far) for (let i = 0; i < 4; i++) b.sym(fin(b, [[-0.008, 0], [0.008, 0], [0, 0.03]], 0.01, 0.002), 'foreArm', 'trim', [0.03, -0.08 - i * 0.06, -0.045], [PI * 0.6, 0, 0]);
  PS(b, 'foreArm', 'trim', [0.06, 0.02, 0.06], [0, -fa * 0.88, 0]);
  // palm emitters: dark hand, glowing palm disc, three long fingers
  b.sym(b.cbox(0.05, 0.08, 0.07, 0.012), 'hand', 'accent', [0, -0.04, 0]);
  b.sym(b.cyl(0.03, 0.03, 0.012, 14), 'hand', 'glow', [0.0, -0.05, 0.038], [PI / 2, 0, 0]);
  b.sym(b.tor(0.032, 0.006, 14, 4), 'hand', 'trim', [0.0, -0.05, 0.04]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.012, 0.09, 0.014, 0.003), 'hand', 'metal', [-0.015 + i * 0.015, -0.12, 0.02], [0.35, 0, 0]);
  // legs: thin, folded, ending in needle points
  b.sym(b.sph(10, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.045);
  b.sym(shell(b, -0.02, -D.thigh + 0.02, [0.06, 0.07, 0.05, 0.035], 7), 'thigh', 'accent');
  PS(b, 'thigh', 'paint', [0.1, D.thigh * 0.6, 0.06], [0.01, -D.thigh * 0.48, 0.04], [0, 0, 0], { c: 0.015, tx: 1.15, bx: 0.7 });
  PS(b, 'thigh', 'trim', [0.02, D.thigh * 0.45, 0.03], [0.065, -D.thigh * 0.48, 0.04], [0, 0, 0.05]);
  PS(b, 'thigh', 'accent', [0.12, D.thigh * 0.35, 0.09], [0.01, -D.thigh * 0.18, 0.01], [0, 0, 0], { c: 0.016, bx: 0.8, bz: 0.8 });
  b.sym(discX(b, 0.04, 0.05, 10), 'shin', 'trim', [0, 0, 0.03]);
  b.sym(discX(b, 0.03, 0.06, 10), 'shin', 'metal', [0, 0, 0]);
  b.sym(fin(b, [[-0.045, 0.02], [0.045, 0.02], [0.016, -D.shin], [0, -D.shin - 0.07], [-0.016, -D.shin]], 0.06, 0.008), 'shin', 'paint', [0, -0.01, 0.0], [0, PI / 2, 0]);
  b.sym(b.cbox(0.008, D.shin * 0.6, 0.008, 0.002), 'shin', 'glow', [0.022, -D.shin * 0.45, 0.0]);
}

function orb(b, o, bone) {
  const rk = o.rank;
  b.add(b.sph(16, 12), bone, 'glow', [0, 0, 0], [0, 0, 0], 0.05);
  b.add(b.tor(0.08, 0.006, 24, 4), bone, 'trim', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.092, 0.005, 24, 4), bone, 'trim', [0, 0, 0], [0.5, 0.9, 0]);
  // stasis clock ticks around the equator
  if (!b.far) for (let i = 0; i < 8; i++) { const a = i * PI / 4; b.add(b.cbox(0.012, 0.012, 0.03, 0.003), bone, i % 2 ? 'trim' : 'glow', [Math.cos(a) * 0.105, 0, Math.sin(a) * 0.105], [0, -a, 0]); }
  if (rk >= 3) b.add(b.tor(0.085, 0.004, 20, 3), bone, 'glow', [0, 0, 0], [1.2, 0, 0.4]);
}

function rings(b, o) {
  // gyroscope of stasis rings round the body (aux1 at chest height on the pelvis); precesses in post, swells in the overdrive
  const rk = o.rank, S = 'aux1', far = b.far;
  const ring = (R, tilt, yaw, glow) => {
    b.add(b.tor(R, 0.011, 64, 5), S, rk === 0 ? 'metal' : 'trim', [0, 0, 0], [PI / 2 + tilt, yaw, 0]);
    if (glow) b.add(b.tor(R - 0.022, 0.008, 64, 3), S, 'glow', [0, 0, 0], [PI / 2 + tilt, yaw, 0]);
  };
  ring(0.46, 0.35, 0, true);
  if (rk >= 3) ring(0.5, -0.9, 0.6, true);
  if (rk >= 4) ring(0.54, 1.25, -0.9, true);
  // hex nodes riding the first ring (R3), orbiting stasis motes (R4)
  const node = (R, tilt, yaw, a, slot, s) => {
    const p = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R).applyEuler(new THREE.Euler(tilt, yaw, 0, 'XYZ'));
    b.add(slot === 'glow' ? b.sph(10, 8) : b.cyl(1, 1, 0.5, 6), S, slot, p.toArray(), [PI / 2 + tilt, yaw, 0], s);
  };
  if (rk >= 2 && !far) for (let i = 0; i < 6; i++) node(0.46, 0.35, 0, i * PI / 3, 'paint', [0.03, 0.03, 0.03]);
  if (rk >= 4) for (let i = 0; i < 5; i++) node(0.5, -0.9, 0.6, i * PI * 0.4 + 0.3, 'glow', 0.03);
  if (rk >= 4) for (let i = 0; i < 4; i++) node(0.54, 1.25, -0.9, i * PI * 0.5, 'glow', 0.022);
  // R5: outer lattice cage (meridians + equator) = a second bubble layer
  if (rk >= 5) {
    for (let i = 0; i < 4; i++) b.add(b.tor(0.86, 0.006, 48, 3), S, 'glow', [0, 0.02, 0], [0, i * PI / 4, 0], [1, 1.25, 1]);
    b.add(b.tor(0.88, 0.008, 48, 3), S, 'glow', [0, 0.02, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.76, 0.005, 44, 3), S, 'trim', [0, 0.5, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.76, 0.005, 44, 3), S, 'trim', [0, -0.45, 0], [PI / 2, 0, 0]);
  }
}

function build(b, o) {
  // touch-up 2: every body part x1.12 round its own joint (head x1.25) so the mantis fills its bubble; rings stay at bubble size
  b.scope([0, 0, 0], [0, 0, 0], 1.25, () => head(b, o));
  b.scope([0, 0, 0], [0, 0, 0], 1.12, () => { body(b, o); limbs(b, o); });
  orb(b, o, 'aux2'); orb(b, o, 'aux3');
  rings(b, o);
}

// ---------- anims ----------
const anims = {
  idle(P, t, ctx) { base(P, ctx, t); },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.22, 0, 0); L.A(P, 'spine', -0.08, 0, 0); L.A(P, 'neck', -0.1, 0, 0);
    for (const s of SIDES) L.AS(P, 'thigh', s, 0.35, 0, 0), L.AS(P, 'shin', s, 0.2, 0, 0);
    for (const s of ['L', 'R']) L.AS(P, 'clav', s, 0, 0, 0.05);
  },
  // Null Pulse (the mage basic attack in battle): right arm unfolds, palm thrust, pulse at 0.48, refold
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.38, 1], [0.7, 1], [1, 0]]), kick = L.kf(u, [[0, 0], [0.46, 0], [0.5, 1], [0.75, 0.2], [1, 0]]);
    L.RS(P, 'upArm', 'R', L.lerp(-0.4, -1.5, k), L.lerp(-0.2, 0.15, k), L.lerp(0.32, 0.12, k));
    L.RS(P, 'foreArm', 'R', L.lerp(-1.75, -0.12, k) - 0.3 * kick, 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0.85, -0.9, k), 0, 0);
    L.A(P, 'chest', 0.08 * kick, 0.25 * k, 0); L.A(P, 'head', 0.05 * k, -0.2 * k, -0.2 * k);
    P[L.PX + 2] -= 0.08 * kick;
  },
  // both palms push a doubled pulse (fire 0.45)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.35, 1], [0.7, 1], [1, 0]]), kick = L.kf(u, [[0, 0], [0.42, 0], [0.47, 1], [0.8, 0]]);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.5, -1.35, k), L.lerp(-0.25, -0.1, k), L.lerp(0.3, 0.2, k));
      L.RS(P, 'foreArm', s, L.lerp(-1.75, -0.3, k) - 0.25 * kick, 0, 0);
      L.RS(P, 'hand', s, L.lerp(0.85, -1.0, k), 0, 0);
    }
    L.A(P, 'chest', 0.1 * kick - 0.08 * k, 0, 0);
    P[L.PX + 2] -= 0.1 * kick;
  },
  // arms sweep wide then clap shut: two pulses (0.4, 0.55)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const open = L.kf(u, [[0, 0], [0.3, 1], [0.42, 0.2], [0.55, 1], [0.7, 0.2], [1, 0]]), k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.5, -1.2, k), L.lerp(0, 0.9, open) * k, L.lerp(0.3, 0.25, k));
      L.RS(P, 'foreArm', s, L.lerp(-1.75, -0.2, k), 0, 0);
      L.RS(P, 'hand', s, -0.6 * k, 0, 0);
    }
    P[L.PX + 1] += 0.1 * k;
  },
  // STASIS BUBBLE: rises, arms fling wide into a star (release 0.17), rings swell to bubble size, hangs, settles
  overdrive(P, u, ctx) {
    ctx.odU = u;
    base(P, ctx, ctx.t);
    const rise = L.kf(u, [[0, 0], [0.17, 1], [0.8, 1], [1, 0]]);
    const spread = L.kf(u, [[0, 0], [0.1, 0.35], [0.17, 1], [0.28, 1.1], [0.75, 1], [0.92, 0]]);
    const curl = L.kf(u, [[0, 0], [0.1, 1], [0.17, 0], [1, 0]]);
    P[L.PX + 1] += 0.2 * rise;
    L.A(P, 'pelvis', -0.15 * spread + 0.3 * curl, 0, 0); L.A(P, 'spine', -0.1 * spread + 0.3 * curl, 0, 0);
    L.A(P, 'chest', -0.25 * spread + 0.2 * curl, 0, 0); L.A(P, 'head', -0.35 * spread + 0.3 * curl, 0, -0.3 * 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.5, -0.35, spread), L.lerp(-0.25, 0.1, spread), L.lerp(0.3, 1.55, spread));
      L.RS(P, 'foreArm', s, L.lerp(-1.75, -0.1, spread) - 0.3 * curl, 0, 0);
      L.RS(P, 'hand', s, 0, 0, L.lerp(-0.15, 0.6, spread));
      L.RS(P, 'thigh', s, L.lerp(-0.45, 0.1, spread) - 0.5 * curl, 0, 0.25 * spread);
      L.RS(P, 'shin', s, L.lerp(0.8, 0.12, spread) + 0.6 * curl, 0, 0);
    }
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.3 * k, 0.12 * k * d, 0.18 * k * d); P[L.PX + 2] -= 0.14 * k;
    L.A(P, 'head', -0.3 * k, 0, 0.25 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.2 * k, 0, 0.3 * k);
  },
  // stasis failure: curls up like a dead insect, drops, tips over
  die(P, u, ctx) {
    L.hover.die(P, u, ctx);
    const c = L.kf(u, [[0, 0], [0.3, 1], [1, 1]]);
    fold(P, 1, 0);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.3 * c, 0, -0.2 * c); L.AS(P, 'thigh', s, -0.9 * c, 0, -0.1 * c); L.AS(P, 'shin', s, 1.0 * c, 0, 0); }
    L.A(P, 'neck', 0.4 * c, 0, 0); L.A(P, 'head', 0.4 * c, 0, 0.3 * c);
  },
  // drifts down curled inside the bubble, unfolds, eyes on
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const curl = L.kf(u, [[0, 1], [0.45, 1], [0.8, 0], [1, 0]]);
    L.A(P, 'spine', 0.5 * curl, 0, 0); L.A(P, 'chest', 0.3 * curl, 0, 0); L.A(P, 'neck', 0.4 * curl, 0, 0); L.A(P, 'head', 0.3 * curl, 0, 0);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.3 * curl, 0, -0.2 * curl); L.AS(P, 'thigh', s, -0.9 * curl, 0, 0); L.AS(P, 'shin', s, 0.9 * curl, 0, 0); }
  },
  // slow pirouette with arms raised in a ring
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += (0.18 + Math.sin(t * 2.2) * 0.05) * k;
    L.A(P, 'pelvis', 0, t * 1.4 * k, 0); L.A(P, 'chest', -0.15 * k, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.5, -0.4, k), L.lerp(-0.25, 0, k), L.lerp(0.3, 2.6, k));
      L.RS(P, 'foreArm', s, L.lerp(-1.75, -0.7, k), 0, 0);
      L.RS(P, 'hand', s, 0, 0, 0.3 * k);
    }
  },
};

export default {
  id: 'halo', name: 'HALO', role: 'mage', faction: 'experimental', rarity: 'epic', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.72, radius: 0.54, walkSpeed: 1.1, scheme: 'bold', orbs: true, aura: AURA,
  bodyScale: [1.28, 1.05, 1.2],   // robots + touch-up: reads too thin inside its bubble at battle size (radius 0.54 also tightens the bubble)
  style: { weapon: 'orbs' },
  paint: { experimental: { paint: 0x7a3df0, accent: 0x15101f, trim: 0xd9c8ff } },
  mats: { all: { paint: { rough: 0.24, coat: 1 }, accent: { rough: 0.32, metal: 0.5 } } },
  sockets: { muzzle: ['aux3', [0, 0, 0]], core: [0, 0.12, 0.12], head: [0, 0.07, 0.08] },
  events: { cast: [['fire', 0.48]], attack: [['fire', 0.45]], attack_alt: [['fire', 0.4], ['fire', 0.55]], overdrive: [['cast', 0.05], ['fire', 0.17]], die: [['down', 0.62]] },
  durs: { cast: 1.1, attack: 1.0, attack_alt: 1.3, overdrive: 2.4, die: 1.8 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, i = BI.aux1 * 3;
    const fast = act && act.name === 'overdrive' ? 2.5 : 1;
    P[i] = 0.18 * Math.sin(t * 0.7); P[i + 1] = t * 0.9 * fast; P[i + 2] = 0.12 * Math.cos(t * 0.5);
  },
  tick(unit, dt, ctx, bones) {
    // keep the permanent bubble: the battle's setShield(0) after a hit would otherwise pop it (kit request in notes)
    if (!unit._haloAura) {
      unit._haloAura = true;
      const set = unit.setShield.bind(unit);
      unit.setShield = (v) => set(Math.max(AURA, v || 0));
    }
    const a = unit.state.action;
    let target = 1;
    if (a === 'overdrive') target = 1 + 1.15 * L.kf(ctx.odU || 0, [[0, 0], [0.1, -0.4], [0.17, 1], [0.75, 1], [0.95, 0]]);
    else if (a === 'die' || unit.state.dead) target = 0.15;
    else if (a === 'deploy') target = 0.4;
    ctx.ringK = (ctx.ringK ?? 1) + (target - (ctx.ringK ?? 1)) * (1 - Math.exp(-dt * 7));
    bones[BI.aux1].scale.setScalar(Math.max(0.05, ctx.ringK));
    if (a !== 'overdrive') ctx.odU = 0;
  },
  fxHints: { projectile: 'null_pulse', impact: 'stasis', overdrive: 'stasis_bubble', color: 0xb24dff },
  build,
};
