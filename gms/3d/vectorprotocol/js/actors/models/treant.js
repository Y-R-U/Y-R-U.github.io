// TREANT, "Old Growth" (D21 fantasy, wild epic tank, XL). Brief: docs/ROSTER.md `treant`, look: refs/ref_fantasy_01.jpg.
// Also map 6's boss ELDERBARK (boss_elderbark, legendary, battle passes rank 5): key the ancient look off o.r >= 3.
// Hunched walking oak: a ridged bark trunk built from layered slabs, a face set low in the trunk (heavy V brow, glowing eyes,
// knot nose, a jaw on aux3 that opens with a heartwood glow), mossy boulder shoulders with leaf clumps, long gnarled
// branch-bundle arms with twig claws that reach the knees, root-flared shins and splayed root feet.
// VALUE: paint = dark bark (most of the surface), metal = pale lichen / weathered heartwood (ridge slabs, claws, beard),
// accent = moss + leaves (bright yellow-green), trim = amber (mushroom caps, blossoms, sap knots), glow = green magic, eye = eyes.
// Rank tiers: R0 bare twigs, one shoulder stripped, no moss beard · R1 base (moss shoulders, small crown)
//   · R2 second bark layer on shoulders/back, fuller crown, mushrooms, hanging moss · R3 heartwood crack + sap veins + glowing
//   knot runes on the forearms · R4 SILHOUETTE: a tall antler-branch canopy grows from the back, blossoms · R5 a floating ring of
//   glowing leaves over the crown, the most emissive state.
// Boss (o.r >= 3, ELDERBARK): colossal and ancient: pale lichen-armour slabs, a towering canopy, a long lichen beard,
//   Novaline's broken shackles + chains on both wrists (story: "Novaline wrapped its roots in their chains"), runestones in the halo.
// Bones: aux0 = back canopy (chest), aux1 = crown (head; sways), aux2 = halo spinner (head), aux3 = jaw (head).
import { THREE, plate, fin, deform, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const DIMS = {
  thigh: 0.42, shin: 0.42, ankle: 0.12, hipX: 0.22, hipY: -0.06, spine: 0.14, chest: 0.2, neck: 0.5, headOff: 0.02,
  clavX: 0.16, clavY: 0.38, shoulder: 0.3, upArm: 0.5, foreArm: 0.48,
  aux0: [0, 0.46, -0.24], aux1: [0, 0.26, 0.02], aux2: [0, 0.98, -0.14], aux3: [0, 0.04, 0.12],
  parents: { aux2: 'head', aux3: 'head' },
};

// ---------------- geometry helpers ----------------
const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const lerpA = (rs, t) => { const f = t * (rs.length - 1), i = Math.min(rs.length - 2, Math.floor(f)); return rs[i] + (rs[i + 1] - rs[i]) * (f - i); };
// Ridged bark trunk along y (y0 bottom -> y1 top), radius profile rs (bottom..top). Vertical grooves (n ridges) that twist,
// plus knotty noise. Smooth shading, closed caps.
function ridged(b, y0, y1, rs, { n = 7, amp = 0.14, twist = 0.25, seg = 26, hs = 6, sx = 1, sz = 1, seed = 1, gn = 0.05, cx = 0, cz = 0 } = {}) {
  const S = Math.max(8, b.n(seg)), H = Math.max(2, Math.round(hs * (b.q === 'low' ? 0.6 : 1)));
  const pos = [], idx = [];
  for (let i = 0; i <= H; i++) {
    const t = i / H, y = y0 + (y1 - y0) * t, r = lerpA(rs, t);
    for (let j = 0; j < S; j++) {
      const a = (j / S) * TAU;
      const f = Math.abs(Math.sin((a * n) / 2 + t * twist * TAU + seed));
      const noise = gn * (Math.sin(a * 3 + seed * 5 + t * 7) * 0.6 + Math.sin(a * 5 - t * 11 + seed) * 0.4);
      const k = r * (1 - amp * (1 - Math.sqrt(f)) + noise);
      pos.push(cx + Math.sin(a) * k * sx, y, cz + Math.cos(a) * k * sz);
    }
  }
  for (let i = 0; i < H; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, c = i * S + ((j + 1) % S), d = a + S, e = c + S;
    idx.push(a, c, d, c, e, d);
  }
  const bot = pos.length / 3; pos.push(cx, y0, cz); const top = bot + 1; pos.push(cx, y1, cz);
  for (let j = 0; j < S; j++) { const j2 = (j + 1) % S; idx.push(bot, j2, j); idx.push(top, H * S + j, H * S + j2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// flattened ridged lozenge: one raised bark slab (faces +z), w wide, h tall, d thick
function slab(b, w, h, d, seed = 1, seg = 14) {
  return ridged(b, -h / 2, h / 2, [w * 0.32, w * 0.5, w * 0.52, w * 0.44, w * 0.22], { n: 6, amp: 0.2, seg, hs: 4, sz: d / w, seed, gn: 0.08 });
}
// tapered tube through pts (r0 at the start, r1 at the tip)
const _c = new THREE.Vector3(), _p = new THREE.Vector3();
function branch(b, pts, r0, r1, seg = 8, rs = 6, wob = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const T = Math.max(2, b.n(seg)), R = Math.max(3, b.n(rs));
  const g = new THREE.TubeGeometry(curve, T, 1, R, false);
  const P = g.attributes.position;
  for (let i = 0; i <= T; i++) {
    curve.getPointAt(i / T, _c);
    const r = (r0 + (r1 - r0) * Math.pow(i / T, 0.9)) * (1 + wob * Math.sin(i * 2.3 + r0 * 50));
    for (let j = 0; j <= R; j++) { const k = i * (R + 1) + j; _p.fromBufferAttribute(P, k).sub(_c).multiplyScalar(r).add(_c); P.setXYZ(k, _p.x, _p.y, _p.z); }
  }
  g.computeVertexNormals();
  return g;
}
// leaf clump: lumpy low-poly ball (flat facets read as painted leaf masses)
function clump(b, seed = 1, segs = 7) {
  return deform(b.sph(segs, Math.max(4, segs - 2)), (v) => {
    const n = 1 + 0.22 * Math.sin(v.x * 9 + seed) * Math.cos(v.y * 7 - seed * 2) + 0.12 * Math.sin(v.z * 13 + seed * 3);
    v.multiplyScalar(n);
  });
}
const lump = (b, seed = 1, a = 0.12) => deform(b.sph(9, 7), (v) => { v.multiplyScalar(1 + a * Math.sin(v.x * 7 + seed) * Math.cos(v.z * 6 + v.y * 4 + seed)); });
// ring of bark slabs around a vertical body section (bone-relative), facing outward
function barkRing(b, bone, slot, { y, R, sz = 0.8, n = 8, a0 = -PI, a1 = PI, w = 0.2, h = 0.34, d = 0.07, tilt = 0.12, seed = 1, skip }) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * ((i + 0.5) / n) + (hash(seed + i) - 0.5) * 0.2;
    if (skip?.(a, i)) continue;
    const yy = y + (hash(seed * 3 + i) - 0.5) * h * 0.35;
    const k = 0.85 + hash(seed * 7 + i) * 0.35;
    b.add(slab(b, w * k, h * k, d, seed + i), bone, typeof slot === 'function' ? slot(i, a) : slot,
      [Math.sin(a) * R, yy, Math.cos(a) * R * sz], [-tilt, a, (hash(seed + i * 5) - 0.5) * 0.3]);
  }
}
// twisted bundle of tapered vines between two points along -y of a limb bone
function bundle(b, bone, slot, len, r, { n = 3, spread = 0.055, twist = 1.4, seed = 1, taper = 0.8, top = 0.04 } = {}) {
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, a = (k / n) * TAU + t * twist + seed;
      const s = spread * (1 - 0.3 * Math.sin(t * PI));
      pts.push([Math.sin(a) * s, top - (len + top) * t, Math.cos(a) * s]);
    }
    b.add(branch(b, pts, r * (0.9 + 0.2 * hash(seed + k)), r * taper, 7, 7), bone, slot);
  }
}

// ---------------- build ----------------
function build(b, o) {
  const r = o.rank, far = b.far, boss = o.r >= 3, D = b.rig.D;
  const lichen = (i) => (boss ? (i % 3 === 1 ? 'paint' : 'metal') : (i % 3 === 1 ? 'metal' : 'paint'));

  // ---- pelvis + waist: root mass, hanging root skirt
  b.add(ridged(b, -0.22, 0.16, [0.24, 0.3, 0.31, 0.28], { sz: 0.85, seed: 2 }), 'pelvis', 'paint');
  b.add(ridged(b, -0.06, 0.26, [0.27, 0.25, 0.27, 0.3], { sz: 0.82, seed: 3, twist: 0.4 }), 'spine', 'paint');
  for (let i = 0; i < (far ? 4 : 9); i++) {
    const a = -PI * 0.8 + (i / 8) * PI * 1.6 + (hash(i) - 0.5) * 0.2, R = 0.27;
    const x = Math.sin(a) * R, z = Math.cos(a) * R * 0.85, L = 0.22 + hash(i + 4) * 0.16;
    b.add(branch(b, [[x * 0.9, -0.05, z * 0.9], [x * 1.1, -0.15, z * 1.12], [x * 1.12, -0.12 - L, z * 1.18]], 0.045, 0.012, 5, 5), 'pelvis', i % 3 ? 'paint' : 'metal');
  }

  const bulk = boss ? 1.12 : 1;
  b.scope([0, 0, 0], [0, 0, 0], bulk, () => upper(b, o, r, far, boss, lichen));
  limbs(b, o, r, far, boss);
}
function upper(b, o, r, far, boss, lichen) {
  const D = b.rig.D, bark = boss ? 'metal' : 'paint';   // ELDERBARK: ancient grey lichen bark on the whole upper body
  // ---- upper trunk (chest): ridged core + layered slabs, heartwood crack at the front
  b.add(ridged(b, -0.08, 0.56, [0.3, 0.36, 0.42, 0.45, 0.4], { sz: 0.76, seed: 4, twist: 0.3, hs: 7 }), 'chest', bark);
  barkRing(b, 'chest', lichen, { y: 0.14, R: 0.36, sz: 0.78, n: far ? 6 : 11, w: 0.14, h: 0.42, d: 0.07, seed: 11, skip: (a) => Math.abs(a) < 0.3 });
  barkRing(b, 'chest', 'paint', { y: 0.42, R: 0.41, sz: 0.76, n: far ? 5 : 10, w: 0.15, h: 0.36, d: 0.07, seed: 21, a0: -PI * 0.75, a1: PI * 0.75, skip: (a) => Math.abs(a) < 0.25 });
  if (r >= 2) barkRing(b, 'chest', lichen, { y: 0.3, R: 0.44, sz: 0.74, n: far ? 3 : 7, w: 0.15, h: 0.44, d: 0.08, seed: 31, a0: PI * 0.55, a1: PI * 1.45 });
  // heart: a vertical split between two thick slabs; heartwood glows through
  for (const s of [1, -1]) b.add(slab(b, 0.18, 0.42, 0.1, 40 + s), 'chest', 'paint', [s * 0.1, 0.24, 0.31], [0.1, s * 0.3, s * -0.12]);
  b.add(lump(b, 3, 0.2), 'chest', 'glow', [0, 0.24, 0.27], [0, 0, 0], [0.07, 0.17, 0.05]);
  if (r >= 3) {
    b.add(fin(b, [[0, 0.24], [0.03, 0.1], [-0.01, 0], [0.025, -0.12], [0, -0.24], [-0.02, -0.1], [0.012, 0.0], [-0.02, 0.12]], 0.02, 0.004), 'chest', 'glow', [0, 0.24, 0.335], [0.1, 0, 0]);
    // sap veins: thin glowing cracks running over the trunk
    if (!far) for (let i = 0; i < (boss ? 8 : 5); i++) {
      const a = -1.1 + i * (2.2 / ((boss ? 8 : 5) - 1)), R = 0.42;
      if (Math.abs(a) < 0.25) continue;
      const pts = [0, 1, 2, 3].map((k) => { const aa = a + k * 0.12 * (a > 0 ? 1 : -1), yy = 0.05 + k * 0.13; return [Math.sin(aa) * R * (1 - k * 0.02), yy, Math.cos(aa) * R * 0.78]; });
      b.add(branch(b, pts, 0.008, 0.004, 5, 3), 'chest', 'glow');
    }
  }

  // ---- neck hump + head (face set low in the trunk)
  b.add(ridged(b, -0.12, 0.16, [0.38, 0.33, 0.2], { sz: 0.8, seed: 5, cz: -0.06 }), 'neck', bark);
  // moss mantle over the hump and upper back (the battle camera sees the top of the unit first)
  if (r >= 1) {
    b.add(clump(b, 140, 10), 'neck', 'accent', [0, 0.1, -0.12], [0.3, 0, 0], [0.3, 0.1, 0.22]);
    b.add(clump(b, 141, 9), 'chest', 'accent', [0.12, 0.5, -0.24], [0.6, 0.3, 0], [0.2, 0.08, 0.16]);
    b.add(clump(b, 142, 9), 'chest', 'accent', [-0.14, 0.46, -0.26], [0.7, -0.2, 0], [0.18, 0.08, 0.15]);
    if (r >= 2) for (let k = 0; k < (far ? 2 : 5); k++) b.add(branch(b, [[-0.2 + k * 0.1, 0.48, -0.3], [-0.21 + k * 0.1, 0.32, -0.36], [-0.2 + k * 0.1, 0.12 - hash(k) * 0.12, -0.36]], 0.016, 0.006, 4, 3, 0.3), 'chest', 'accent');
  }
  b.add(ridged(b, -0.12, 0.3, [0.15, 0.17, 0.17, 0.14, 0.07], { sz: 0.92, seed: 6, cz: 0.08, n: 6, amp: 0.1 }), 'head', bark);
  for (const s of [1, -1]) {
    // heavy V brow
    b.add(plate(b, 0.17, 0.065, 0.12, { c: 0.02, tx: 0.8, tz: 0.7 }), 'head', 'paint', [s * 0.075, 0.17, 0.2], [0.35, s * 0.25, s * -0.32]);
    b.add(b.sph(8, 6), 'head', 'eye', [s * 0.068, 0.12, 0.215], [0, 0, 0], [0.034, 0.024, 0.022]);
    // cheek knots
    b.add(lump(b, 7 + s), 'head', 'paint', [s * 0.12, 0.05, 0.16], [0, 0, 0], [0.06, 0.07, 0.06]);
  }
  b.add(branch(b, [[0, 0.15, 0.22], [0, 0.08, 0.27], [0, 0.03, 0.28]], 0.035, 0.022, 4, 6), 'head', 'paint');
  // jaw (aux3) with the mouth glow behind it
  b.add(plate(b, 0.22, 0.08, 0.14, { c: 0.025, tx: 1.1, bx: 0.7 }), 'aux3', 'paint', [0, -0.07, 0.04], [0.15, 0, 0]);
  b.add(b.cbox(0.13, 0.03, 0.06, 0.01), 'head', 'glow', [0, -0.01, 0.17]);
  // beard: hanging moss + root strands from the jaw (lichen beard for the boss)
  const nb = far ? 3 : r === 0 ? 3 : boss ? 9 : 6;
  for (let i = 0; i < nb; i++) {
    const x = (i / (nb - 1) - 0.5) * 0.2, L = 0.18 + hash(i + 9) * 0.14 + (boss ? 0.16 : 0);
    b.add(branch(b, [[x, -0.08, 0.06], [x * 1.1, -0.1 - L * 0.5, 0.12], [x * 1.2, -0.12 - L, 0.1]], 0.022, 0.008, 5, 4, 0.2), 'aux3', boss || i % 2 ? 'metal' : (r >= 1 ? 'accent' : 'paint'));
  }

  // ---- crown (aux1): a mossy cap on the skull, twisted forked twigs poking out of it, leaf tufts on the twig ends
  if (r >= 1) {
    b.add(clump(b, 99, 9), 'aux1', 'accent', [0, 0.0, -0.05], [0, 0, 0], [0.19, 0.09, 0.17]);
    b.add(clump(b, 98, 8), 'aux1', 'accent', [0.08, 0.05, -0.12], [0.4, 0, 0], [0.13, 0.08, 0.12]);
    b.add(clump(b, 97, 8), 'aux1', 'accent', [-0.09, 0.04, -0.1], [0.2, 0, 0.3], [0.12, 0.08, 0.12]);
  }
  const nc = far ? 4 : [4, 6, 8, 8, 9, 10][r];
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * TAU + 0.4 + hash(i) * 0.3, s = 0.8 + hash(i + 2) * 0.45, up = 0.24 + hash(i + 3) * 0.16;
    const back = Math.cos(a) > 0.3 ? 0.4 : 1;   // front twigs short (keep the face clear)
    const tip = [Math.sin(a) * 0.24 * s, (up * s + 0.06) * back + 0.04, Math.cos(a) * 0.14 * s - 0.1];
    const mid = [tip[0] * 0.45 + (hash(i + 5) - 0.5) * 0.06, tip[1] * 0.55, tip[2] * 0.5];
    b.add(branch(b, [[Math.sin(a) * 0.04, -0.04, Math.cos(a) * 0.04 - 0.04], mid, tip], 0.03, 0.007, 6, 5, 0.15), 'aux1', i % 4 === 3 ? 'metal' : 'paint');
    const fk = [mid[0] + (tip[0] - mid[0]) * 0.4 + Math.sin(a + 1.4) * 0.09, mid[1] + 0.12 * back, mid[2] + Math.cos(a + 1.4) * 0.06];
    if (!far) b.add(branch(b, [mid, [(mid[0] + fk[0]) / 2, (mid[1] + fk[1]) / 2 + 0.02, (mid[2] + fk[2]) / 2], fk], 0.016, 0.005, 4, 4), 'aux1', 'paint');
    if (r >= 1) {
      const ks = (0.06 + hash(i + 7) * 0.03) * (r >= 2 ? 1.15 : 1);
      b.add(clump(b, i + 1, 6), 'aux1', 'accent', [tip[0], tip[1] + 0.01, tip[2]], [hash(i) * 3, hash(i + 1) * 3, 0], [ks * 1.2, ks, ks * 1.2]);
      if (!far && r >= 2 && i % 2 === 0) b.add(clump(b, i + 50, 5), 'aux1', 'accent', fk, [0, 0, 0], [ks * 0.8, ks * 0.7, ks * 0.8]);
    }
  }

  // ---- shoulders (clav): bark boulders, moss caps, leaf clumps, a sprouting branch
  {
    const both = (g, slot, p, rot, sc) => b.sym(g, 'clav', slot, p, rot, sc);
    const leftOnly = r === 0;   // R0: the right shoulder is stripped bare (no moss, no leaves)
    const moss = (g, slot, p, rot, sc) => (leftOnly ? b.add(g, 'clavL', slot, p, rot, sc) : b.sym(g, 'clav', slot, p, rot, sc));
    both(lump(b, 11, 0.16), bark, [0.24, 0.02, -0.02], [0, 0, 0], [0.24, 0.2, 0.25]);
    both(slab(b, 0.26, 0.3, 0.08, 50), boss ? 'metal' : 'paint', [0.36, 0.0, 0.0], [0, PI / 2, -0.3]);
    both(slab(b, 0.22, 0.26, 0.07, 52), 'paint', [0.22, 0.03, 0.22], [-0.3, 0.2, 0]);
    if (r >= 2 || boss) {
      both(slab(b, 0.24, 0.3, 0.07, 54), boss ? 'metal' : 'paint', [0.3, 0.12, -0.12], [0.3, 0.9, -0.5]);
      both(slab(b, 0.2, 0.24, 0.07, 56), 'paint', [0.4, -0.1, 0.1], [0, 1.3, -0.2]);
    }
    moss(clump(b, 20, 9), 'accent', [0.23, 0.15, -0.02], [0, 0, 0], [0.24, 0.1, 0.24]);
    if (r >= 1) moss(clump(b, 23), 'accent', [0.32, 0.2, -0.08], [0.4, 0.3, 0], [0.14, 0.11, 0.14]);
    // sprouting branch: up and out (the shoulder silhouette from above)
    const tip = [0.42, 0.5 + (boss ? 0.18 : 0), -0.18];
    both(branch(b, [[0.24, 0.1, -0.06], [0.32, 0.3, -0.12], tip], 0.04, 0.01, 6, 5, 0.12), 'paint');
    both(branch(b, [[0.3, 0.26, -0.1], [0.38, 0.36, 0.0], [0.36, 0.44, 0.06]], 0.018, 0.006, 4, 4), 'paint');
    if (r >= 1) { both(clump(b, 30), 'accent', [tip[0], tip[1] + 0.02, tip[2]], [0, 0, 0], [0.1, 0.08, 0.1]); both(clump(b, 31, 5), 'accent', [0.36, 0.45, 0.06], [0, 0, 0], [0.06, 0.05, 0.06]); }
    both(branch(b, [[0.3, 0.2, -0.1], [0.44, 0.3, -0.04], [0.5, 0.38, 0.02]], 0.022, 0.008, 4, 4), 'metal');
    if (r >= 2 && !far) for (let k = 0; k < 3; k++) {
      const p = [0.16 + k * 0.07, 0.14 + (k % 2) * 0.03, 0.12 - k * 0.03];
      both(b.cyl(0.012, 0.015, 0.05, 6), 'metal', p);
      both(b.sph(8, 5, 0, TAU, 0, PI / 2), 'trim', [p[0], p[1] + 0.025, p[2]], [0, 0, 0], [0.04 - k * 0.006, 0.025, 0.04 - k * 0.006]);
    }
    if (r >= 2 && !far) for (let k = 0; k < 3; k++) both(branch(b, [[0.34 + k * 0.04, 0.0, 0.08 - k * 0.08], [0.38 + k * 0.04, -0.14, 0.1 - k * 0.08], [0.37 + k * 0.04, -0.26 - k * 0.04, 0.08 - k * 0.08]], 0.014, 0.006, 4, 3, 0.3), 'accent');
  }

}
function limbs(b, o, r, far, boss) {
  const D = b.rig.D;
  // ---- arms: twisted vine bundles, knots, slabs; hands with twig claws
  b.sym(lump(b, 61), 'upArm', 'paint', [0, 0.0, 0], [0, 0, 0], [0.13, 0.13, 0.13]);
  bundle(b, 'upArmL', 'paint', D.upArm, 0.075, { seed: 1 }); bundle(b, 'upArmR', 'paint', D.upArm, 0.075, { seed: 2 });
  b.sym(lump(b, 62), 'foreArm', 'paint', [0, 0.0, 0], [0, 0, 0], [0.12, 0.11, 0.12]);
  bundle(b, 'foreArmL', 'paint', D.foreArm, 0.075, { n: 4, seed: 3, spread: 0.075, taper: 1.0, twist: 2.0 }); bundle(b, 'foreArmR', 'paint', D.foreArm, 0.075, { n: 4, seed: 4, spread: 0.075, taper: 1.0, twist: 2.0 });
  b.sym(slab(b, 0.1, 0.36, 0.05, 70), 'foreArm', boss ? 'metal' : 'paint', [0.1, -0.22, -0.02], [0, PI / 2, 0.08]);
  if (r >= 2 && !far) for (let k = 0; k < 3; k++) b.sym(branch(b, [[0.02 + k * 0.03, -0.08, -0.08 + k * 0.05], [0.04 + k * 0.03, -0.2, -0.1 + k * 0.05], [0.03 + k * 0.03, -0.32 - k * 0.05, -0.09 + k * 0.05]], 0.012, 0.005, 4, 3, 0.3), 'foreArm', 'accent');
  if (r >= 1) b.sym(clump(b, 72, 6), 'foreArm', 'accent', [0.04, -0.06, -0.06], [0, 0, 0], [0.09, 0.06, 0.09]);
  if (r >= 2 && !far) b.sym(slab(b, 0.14, 0.24, 0.05, 73), 'upArm', 'paint', [0.07, -0.2, -0.02], [0, PI / 2, 0.1]);
  if (r >= 3 && !far) for (let k = 0; k < 3; k++) b.sym(b.sph(6, 4), 'foreArm', 'glow', [0.105, -0.12 - k * 0.11, 0.02 * k], [0, 0, 0], [0.012, 0.028, 0.02]);
  // hands: knotted fist + four claws + thumb
  b.sym(lump(b, 80, 0.18), 'hand', 'paint', [0, -0.07, 0.02], [0, 0, 0], [0.12, 0.12, 0.12]);
  for (let k = 0; k < 4; k++) {
    const x = 0.06 - k * 0.04, L = 0.28 - Math.abs(k - 1.5) * 0.03;
    const pts = [[x, -0.12, 0.02], [x * 1.2, -0.12 - L * 0.55, 0.06], [x * 1.25, -0.12 - L * 0.9, 0.14], [x * 1.2, -0.12 - L, 0.2]];
    b.sym(branch(b, pts, 0.032, 0.012, 5, 5), 'hand', 'paint');
    b.sym(b.cyl(0.0, 0.014, 0.06, 5), 'hand', 'metal', pts[3], [1.2, 0, 0]);
  }
  b.sym(branch(b, [[-0.06, -0.08, 0.06], [-0.1, -0.16, 0.14], [-0.08, -0.22, 0.2]], 0.03, 0.012, 4, 5), 'hand', 'paint');

  // ---- legs: ridged trunks, root-flared shins, splayed root feet
  b.sym(ridged(b, -D.thigh - 0.02, 0.08, [0.13, 0.145, 0.17, 0.18], { seed: 8, sz: 0.95, amp: 0.18 }), 'thigh', 'paint');
  b.sym(ridged(b, -D.shin + 0.02, 0.06, [0.23, 0.15, 0.12, 0.125, 0.14], { seed: 9, twist: 0.4, amp: 0.2 }), 'shin', 'paint');
  if (!far) { bundle(b, 'shinL', 'paint', D.shin - 0.06, 0.035, { n: 3, seed: 5, spread: 0.13, twist: 2.4, taper: 1.3 }); bundle(b, 'shinR', 'paint', D.shin - 0.06, 0.035, { n: 3, seed: 6, spread: 0.13, twist: -2.4, taper: 1.3 }); }
  b.sym(slab(b, 0.12, 0.32, 0.05, 90), 'thigh', 'paint', [0.06, -0.2, 0.13], [0, 0.3, 0]);
  if (boss) b.sym(slab(b, 0.12, 0.26, 0.05, 91), 'shin', 'metal', [0.0, -0.16, 0.13], [0.05, 0, 0]);
  if (r >= 1) b.sym(clump(b, 92, 7), 'thigh', 'accent', [0.1, -0.04, -0.06], [0, 0, 0], [0.12, 0.07, 0.12]);
  if (r >= 2 && !far) for (let k = 0; k < 2; k++) {
    const p = [0.17, -0.12 - k * 0.07, 0.04 + k * 0.04];
    b.sym(b.sph(8, 5, 0, TAU, 0, PI / 2), 'thigh', 'trim', p, [0, 0, -1.2], [0.035, 0.02, 0.035]);
  }
  for (let k = 0; k < (far ? 4 : 7); k++) {
    const a = -1.5 + (k / 6) * 3.0 + (k % 2) * 0.12, L = (Math.abs(a) < 0.8 ? 0.36 : 0.26) + hash(k + 40) * 0.08;
    const dx = Math.sin(a) * 0.6, dz = Math.cos(a);
    const pts = [[dx * 0.08, 0.06, dz * 0.06], [dx * L * 0.45, -0.05, dz * L * 0.5], [dx * L * 0.8, -D.ankle + 0.02, dz * L * 0.85], [dx * L, -D.ankle - 0.005, dz * L]];
    b.sym(branch(b, pts, 0.07, 0.016, 6, 5), 'foot', 'paint');
  }
  b.sym(lump(b, 95), 'foot', 'paint', [0, -0.02, 0.02], [0, 0, 0], [0.18, 0.12, 0.2]);

  // ---- R4+: antler canopy on the back (aux0)
  if (r >= 4 || boss) {
    const big = boss ? 1.35 : 1;
    const arms4 = [[0.22, 0.6, -0.08], [-0.24, 0.66, -0.12], [0.08, 0.86, -0.22], [-0.1, 0.78, 0.0], [0.36, 0.42, -0.25], [-0.38, 0.46, -0.2]];
    arms4.forEach((t, i) => {
      if (far && i > 3) return;
      const tip = t.map((x) => x * big);
      const mid = [tip[0] * 0.45, tip[1] * 0.5, tip[2] * 0.4 - 0.04];
      b.add(branch(b, [[0, 0, 0], mid, tip], 0.07 * big, 0.016, 7, 6), 'aux0', i % 2 ? 'paint' : (boss ? 'metal' : 'paint'));
      // forks
      const f1 = [tip[0] + (tip[0] > 0 ? 0.12 : -0.12) * big, tip[1] - 0.08 * big, tip[2] + 0.06];
      b.add(branch(b, [mid, [(mid[0] + f1[0]) / 2, (mid[1] + f1[1]) / 2 + 0.06, (mid[2] + f1[2]) / 2], f1], 0.035 * big, 0.01, 5, 5), 'aux0', 'paint');
      b.add(clump(b, 200 + i, 8), 'aux0', 'accent', tip, [i, i * 2, 0], [0.17, 0.13, 0.17].map((x) => x * big * (0.85 + 0.3 * hash(i + 300))));
      if (!far) b.add(clump(b, 220 + i, 6), 'aux0', 'accent', f1, [i, 0, i], [0.1, 0.08, 0.1].map((x) => x * big));
      // blossoms
      if (!far) for (let k = 0; k < 3; k++) b.add(b.sph(6, 4), 'aux0', 'trim', [tip[0] + (hash(i * 9 + k) - 0.5) * 0.24 * big, tip[1] + 0.08 * big + (hash(i * 7 + k) - 0.4) * 0.1, tip[2] + (hash(i * 5 + k) - 0.5) * 0.24], [0, 0, 0], 0.025 * big);
    });
  }

  // ---- R5: floating halo of glowing leaves (+ runestones for the boss) on aux2 (spins)
  if (r >= 5) {
    const n = far ? 6 : boss ? 12 : 10, R = boss ? 0.42 : 0.34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (boss && i % 3 === 0) {
        b.add(plate(b, 0.07, 0.11, 0.04, { c: 0.012, tx: 0.7 }), 'aux2', 'metal', [Math.sin(a) * R, 0.02, Math.cos(a) * R], [0, a, 0]);
        b.add(b.cbox(0.012, 0.06, 0.012, 0.003), 'aux2', 'glow', [Math.sin(a) * (R + 0.022), 0.02, Math.cos(a) * (R + 0.022)], [0, a, 0]);
      } else b.add(fin(b, [[0, -0.06], [0.03, -0.01], [0, 0.06], [-0.03, -0.01]], 0.012, 0.003), 'aux2', 'glow', [Math.sin(a) * R, 0.03 * Math.sin(a * 3), Math.cos(a) * R], [0.3, a + PI / 2, 0.4]);
    }
  }

  // ---- boss: Novaline's broken shackles on both wrists, chain links dangling
  if (boss) {
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      b.add(b.cyl(0.14, 0.14, 0.1, 12, true), 'foreArm' + s, 'metal', [0, -0.4, 0]);
      b.add(b.tor(0.14, 0.022, 14, 5), 'foreArm' + s, 'metal', [0, -0.35, 0], [PI / 2, 0, 0]);
      b.add(b.tor(0.14, 0.022, 14, 5), 'foreArm' + s, 'metal', [0, -0.45, 0], [PI / 2, 0, 0]);
      for (let k = 0; k < (far ? 2 : 5); k++) b.add(b.tor(0.035, 0.011, 8, 4), 'foreArm' + s, 'metal', [sx * 0.15, -0.44 - k * 0.06, 0.02], [0, k % 2 ? PI / 2 : 0, 0]);
      b.add(b.cbox(0.06, 0.04, 0.02, 0.006), 'foreArm' + s, 'glow', [sx * 0.0, -0.4, 0.145]);
    }
    // the Warden's sigil: a glowing rune ring carved around the heart
    b.scope([0, 0, 0], [0, 0, 0], 1.12, () => {
      b.add(b.tor(0.13, 0.012, 20, 4), 'chest', 'glow', [0, 0.24, 0.345], [0.1, 0, 0]);
      if (!far) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; b.add(b.cbox(0.014, 0.05, 0.012, 0.003), 'chest', 'glow', [Math.sin(a) * 0.17, 0.24 + Math.cos(a) * 0.17, 0.335], [0.1, 0, -a]); }
    });
    // willow curtains of moss hanging from the canopy
    if (!far) for (let k = 0; k < 8; k++) {
      const a = -1.3 + k * 0.37, x = Math.sin(a) * 0.5, z = -0.1 + Math.cos(a) * 0.12, L = 0.35 + hash(k + 60) * 0.25;
      b.add(branch(b, [[x, 0.62, z], [x * 1.05, 0.62 - L * 0.5, z + 0.02], [x * 1.08, 0.62 - L, z]], 0.018, 0.007, 4, 3, 0.3), 'aux0', 'accent');
    }
    // a snapped chain across the chest
    if (!far) for (let k = 0; k < 7; k++) { const a = -0.9 + k * 0.28; b.add(b.tor(0.04, 0.012, 8, 4), 'chest', 'metal', [Math.sin(a) * 0.5, 0.06 + k * 0.055, Math.cos(a) * 0.4], [0, a + (k % 2 ? PI / 2 : 0), 0.6]); }
  }
}

// ---------------- anims ----------------
const DURS = { attack: 1.15, attack_alt: 1.0, cast: 1.3, overdrive: 2.4, hit: 0.5, die: 2.2, deploy: 1.8 };
const SIDES = ['L', 'R'];
const dampOsc = (s, f = 26, d = 6) => (s <= 0 ? 0 : Math.exp(-s * d) * Math.sin(s * f));
function arm(P, L, s, ux, uy, uz, fx, hx = 0) { L.RS(P, 'upArm', s, ux, uy, uz); L.RS(P, 'foreArm', s, fx, 0, 0); L.RS(P, 'hand', s, hx, 0, 0); }
// hunched stance: slow creaking sway, heavy breath, arms hanging forward like branches
function stance(P, t, ctx, L, k = 1) {
  const br = Math.sin(t * 1.05), sw = Math.sin(t * 0.42);
  L.pel(P, sw * 0.02 * k, -0.07 + br * 0.008, 0);
  L.R(P, 'pelvis', 0.1, sw * 0.04 * k, sw * 0.02 * k);
  L.R(P, 'spine', 0.12 + br * 0.015, -sw * 0.03 * k, -sw * 0.015 * k);
  L.R(P, 'chest', 0.16 + br * 0.02, -sw * 0.03 * k, 0);
  L.R(P, 'neck', -0.14, ctx.st.gy * 0.3, 0);
  L.R(P, 'head', -0.14 + ctx.st.gp * 0.5, ctx.st.gy * 0.5, ctx.st.tilt * 0.6);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, a = Math.sin(t * 0.8 + ph) * 0.04 * k;
    L.RS(P, 'clav', s, 0, 0, br * 0.03);
    arm(P, L, s, -0.18 + a, 0.05, 0.2, -0.32 - a * 0.5, -0.2);
  }
  L.R(P, 'aux3', 0.02 + 0.02 * Math.max(0, br), 0, 0);
  L.plant(P, ctx, 0.08, -0.1, 1);
}
const jaw = (P, L, v) => L.R(P, 'aux3', v, 0, 0);
const anims = {
  idle(P, t, ctx, L) {
    stance(P, t, ctx, L);
    // every ~7 s: rolls its shoulders, flexes the claws and creaks its head to one side
    const c = t % 7.2, k = L.kf(c, [[0, 0], [4.6, 0], [5.2, 1], [6.1, 1], [6.8, 0]]);
    L.A(P, 'chest', -0.06 * k, 0.12 * k * Math.sin(c * 2.4), 0);
    L.A(P, 'head', 0, 0.2 * k, 0.18 * k);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.1 * k, 0, 0.1 * k); L.AS(P, 'hand', s, -0.35 * k, 0, 0); }
    jaw(P, L, 0.02 + 0.1 * k * Math.max(0, Math.sin(c * 5)));
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    const ph = ctx.move.phase * TAU, s2 = Math.sin(ph);
    L.A(P, 'pelvis', 0.04, 0, 0.03 * s2);
    L.R(P, 'spine', 0.16, 0.1 * s2, -0.04 * s2);
    L.R(P, 'chest', 0.18, 0.08 * s2, -0.03 * s2);
    L.R(P, 'neck', -0.16, -0.08 * s2, 0); L.R(P, 'head', -0.12, -0.06 * s2, 0.04 * s2);
    for (const s of SIDES) {
      const k = s === 'L' ? -1 : 1;
      arm(P, L, s, -0.25 + 0.38 * s2 * k, 0.05, 0.24, -0.4 - 0.15 * Math.max(0, s2 * k), -0.2);
    }
    jaw(P, L, 0.04);
  },
  attack(P, u, ctx, L) {
    // ROOT SLAM: both arms swing up overhead (clasped), the trunk arches, then hammers the ground in front (impact 0.5)
    stance(P, ctx.t, ctx, L, 0.5);
    const up = L.kf(u, [[0, 0], [0.36, 1], [0.42, 1.05], [0.5, 0], [1, 0]]);
    const dn = L.kf(u, [[0, 0], [0.42, 0], [0.5, 1], [0.72, 1], [0.95, 0], [1, 0]]);
    const s = (u - 0.5) * DURS.attack;
    L.pel(P, 0, -0.07 + 0.04 * up - 0.14 * dn, 0.16 * dn);
    L.A(P, 'spine', -0.2 * up + 0.24 * dn, 0, 0);
    L.A(P, 'chest', -0.22 * up + 0.22 * dn + 0.04 * dampOsc(s), 0, 0);
    L.A(P, 'neck', 0.1 * up - 0.1 * dn, 0, 0);
    L.A(P, 'head', 0.18 * up, 0, 0);
    for (const s2 of SIDES) arm(P, L, s2, L.lerp(-0.18, -2.75, up) + L.lerp(0, -1.0, dn), 0, L.lerp(0.2, -0.12, up) + 0.08 * dn, L.lerp(-0.32, -0.5, up) + 0.2 * dn, -0.2 - 0.3 * up);
    jaw(P, L, 0.05 + 0.25 * up + 0.2 * dn);
    L.plant(P, ctx, 0.2 * dn + 0.08, -0.12 - 0.1 * dn, 1 + 0.25 * dn);
  },
  attack_alt(P, u, ctx, L) {
    // BRANCH SWEEP: twists away with the right arm cocked wide, then backhands across the front (impact 0.46), follow-through
    stance(P, ctx.t, ctx, L, 0.5);
    const wind = L.kf(u, [[0, 0], [0.32, 1], [0.38, 1.05], [0.48, -0.6], [0.62, -0.8], [0.9, 0], [1, 0]]);
    const reach = L.kf(u, [[0, 0], [0.32, 0.6], [0.44, 1], [0.6, 0.8], [0.9, 0], [1, 0]]);
    L.A(P, 'pelvis', 0, -0.18 * wind, 0);
    L.A(P, 'spine', 0.04 * reach, -0.3 * wind, 0);
    L.A(P, 'chest', 0.06 * reach, -0.32 * wind, -0.08 * wind);
    L.A(P, 'head', 0, 0.35 * wind, 0);
    arm(P, L, 'R', -0.18 - 1.25 * reach, 0.25 * wind, 0.2 + 1.0 * Math.max(0, wind) + 0.25 * reach, -0.32 + 0.22 * reach, -0.3);
    L.AS(P, 'upArm', 'L', 0.25 * wind, 0, 0.2 * reach);
    P[L.PX + 2] += 0.08 * reach;
    jaw(P, L, 0.06 + 0.18 * reach);
    L.plant(P, ctx, 0.14, -0.16, 1.15);
  },
  cast(P, u, ctx, L) {
    // DEEP ROOTS: sinks into a wide stance, claws dig into the floor, head tilts back as the sap rises (cast 0.5)
    stance(P, ctx.t, ctx, L, 0.4);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), rise = L.kf(u, [[0, 0], [0.4, 0], [0.55, 1], [0.85, 1], [1, 0]]);
    L.pel(P, 0, -0.07 - 0.16 * k, -0.03 * k);
    L.A(P, 'spine', 0.18 * k - 0.16 * rise, 0, 0);
    L.A(P, 'chest', 0.14 * k - 0.2 * rise, 0, 0);
    L.A(P, 'neck', -0.06 * rise, 0, 0); L.A(P, 'head', -0.3 * rise, 0, 0);
    for (const s of SIDES) arm(P, L, s, -0.45 * k, 0, 0.2 + 0.45 * k, -0.25 * k - 0.3, -0.6 * k);
    jaw(P, L, 0.03 + 0.25 * rise);
    L.plant(P, ctx, 0.1, -0.12, 1 + 0.35 * k);
  },
  overdrive(P, u, ctx, L) {
    // GRASP OF AGES: rears up to full height, arms flung wide, ROARS (cast 0.1); plunges both claws into the floor (impact 0.52),
    // then heaves back, dragging the roots up under the enemy front (impact 0.74); recovers
    stance(P, ctx.t, ctx, L, 0.3);
    const rear = L.kf(u, [[0, 0], [0.12, 1], [0.4, 1], [0.48, 0], [1, 0]]);
    const plunge = L.kf(u, [[0, 0], [0.44, 0], [0.52, 1], [0.66, 1], [0.74, 0.4], [0.86, 0.3], [1, 0]]);
    const heave = L.kf(u, [[0, 0], [0.64, 0], [0.74, 1], [0.86, 1], [1, 0]]);
    const s = (u - 0.52) * DURS.overdrive, shake = Math.sin(u * 140) * L.kf(u, [[0, 0], [0.1, 1], [0.38, 1], [0.42, 0]]);
    L.pel(P, 0, -0.07 + 0.07 * rear - 0.24 * plunge + 0.04 * heave, 0.12 * plunge - 0.06 * heave);
    L.A(P, 'pelvis', -0.1 * rear, 0, 0);
    L.A(P, 'spine', -0.2 * rear + 0.32 * plunge - 0.25 * heave, 0, 0.02 * shake);
    L.A(P, 'chest', -0.26 * rear + 0.3 * plunge - 0.2 * heave + 0.05 * dampOsc(s), 0, 0);
    L.A(P, 'neck', 0.12 * rear - 0.1 * plunge, 0, 0); L.A(P, 'head', -0.4 * rear + 0.03 * shake - 0.15 * heave, 0, 0);
    for (const s2 of SIDES) {
      arm(P, L, s2, -0.18 - 0.25 * rear - 1.15 * plunge + 0.55 * heave, 0, 0.2 + 2.0 * rear + 0.15 * plunge, -0.32 + 0.05 * rear + 0.25 * plunge - 0.4 * heave, 0.3 * rear - 0.4 * plunge);
    }
    jaw(P, L, 0.03 + 0.45 * rear + 0.2 * heave);
    L.plant(P, ctx, 0.12 + 0.12 * plunge, -0.16 - 0.1 * plunge, 1.1 + 0.3 * plunge);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx.t, ctx, L, 0.4);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.5, 0.35], [1, 0]]), d = ctx.st.hitDir, s = u * DURS.hit;
    P[L.PX + 2] -= 0.14 * k; P[L.PX + 1] -= 0.04 * k;
    L.A(P, 'spine', -0.2 * k, 0.12 * k * d, 0.08 * k * d);
    L.A(P, 'chest', -0.24 * k, 0.1 * k * d, 0.04 * d * dampOsc(s, 20, 5));
    L.A(P, 'head', -0.25 * k, -0.2 * k * d, 0.15 * k * d);
    for (const s2 of SIDES) L.AS(P, 'upArm', s2, 0.35 * k + 0.15 * dampOsc(s, 18, 5), 0, 0.45 * k);
    jaw(P, L, 0.25 * k);
  },
  die(P, u, ctx, L) {
    // TIMBER: legs buckle, it creaks and sways, then topples backwards like a felled tree (down 0.62), one bounce, settles
    stance(P, ctx.t * (1 - u), ctx, L, 1 - u);
    const sag = L.kf(u, [[0, 0], [0.2, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.22, 0.05], [0.3, -0.04], [0.62, 1.36], [0.68, 1.22], [0.76, 1.38], [1, 1.34]]);
    const H = 1.02, th = Math.max(0, fall);
    if (fall > 0.02) {
      // pivot the whole tree about the heels: legs straight, pelvis swings back over them
      L.R(P, 'pelvis', -th, 0.25 * th, 0.12 * th);
      L.pel(P, 0, H * Math.cos(th) - H + 0.3 * Math.sin(th), -H * Math.sin(th) * 0.95);
      for (const s of SIDES) { L.RS(P, 'thigh', s, 0.06, 0, 0.08); L.RS(P, 'shin', s, 0.1, 0, 0); L.RS(P, 'foot', s, th * 0.6, 0, 0); }
    } else {
      L.A(P, 'pelvis', 0, 0, 0.05 * Math.sin(u * 30) * sag);
      P[L.PX + 1] -= 0.06 * sag;
    }
    L.A(P, 'spine', -0.1 * sag, 0, 0); L.A(P, 'chest', -0.1 * sag, 0, 0.1 * sag);
    L.A(P, 'head', 0.2 * sag, 0.3 * sag, 0);
    for (const s of SIDES) { const f = L.smooth(fall / 1.3); arm(P, L, s, L.lerp(-0.18, 0.35, f), 0, L.lerp(0.2, 1.25, f) + (s === 'L' ? 0.15 : -0.1) * f, L.lerp(-0.32, -0.15, f), -0.1); }
    jaw(P, L, 0.35 * sag);
  },
  victory(P, t, ctx, L) {
    // raises both arms like a great tree in a gale, roaring, crown tossing; pounds the chest on the beat
    stance(P, t, ctx, L);
    const k = L.smooth(Math.min(1, t / 0.6)), w = t * TAU * 0.5, beat = Math.max(0, Math.sin(w));
    L.A(P, 'spine', -0.14 * k, 0.12 * Math.sin(w * 0.5) * k, 0); L.A(P, 'chest', -0.2 * k, 0, 0.06 * Math.sin(w) * k);
    L.A(P, 'head', -0.35 * k * (0.5 + 0.5 * beat), 0, 0);
    for (const s of SIDES) {
      const ph = s === 'L' ? 0 : Math.PI, pump = 0.5 + 0.5 * Math.sin(w + ph);
      arm(P, L, s, L.lerp(-0.18, -0.35 - 0.3 * pump, k), 0, L.lerp(0.2, 2.1 + 0.35 * pump, k), L.lerp(-0.32, -0.5 + 0.3 * pump, k), 0.2 * k);
    }
    P[L.PX + 1] += 0.03 * beat * k;
    jaw(P, L, 0.05 + 0.35 * beat * k);
  },
  deploy(P, u, ctx, L) {
    // no drop: it grows out of the plate (tick scales it up from a curled stump), roots grab (land 0.3), unfurls (ready 0.85)
    stance(P, ctx.t, ctx, L, 0.4);
    const curl = L.kf(u, [[0, 1], [0.35, 1], [0.7, 0], [1, 0]]);
    const stretch = L.kf(u, [[0, 0], [0.55, 0], [0.72, 1], [0.86, 1], [1, 0]]);
    L.pel(P, 0, -0.07 - 0.32 * curl + 0.03 * stretch, 0);
    L.A(P, 'spine', 0.45 * curl - 0.15 * stretch, 0, 0);
    L.A(P, 'chest', 0.4 * curl - 0.2 * stretch, 0, 0);
    L.A(P, 'neck', 0.3 * curl, 0, 0); L.A(P, 'head', 0.3 * curl - 0.35 * stretch, 0, 0);
    for (const s of SIDES) arm(P, L, s, -0.18 - 0.6 * curl - 0.2 * stretch, 0, 0.2 - 0.1 * curl + 1.7 * stretch, -0.32 - 1.0 * curl + 0.1 * stretch, -0.3);
    jaw(P, L, 0.05 + 0.4 * stretch);
    L.plant(P, ctx, 0.08, -0.1, 1 + 0.3 * curl);
  },
};

export default {
  id: 'treant', name: 'TREANT', role: 'tank', faction: 'wild', rarity: 'epic', realm: 'fantasy',
  rig: 'biped', dims: DIMS, height: 2.45, radius: 0.85, walkSpeed: 0.75, cadence: 0.55, scheme: 'dark',
  style: { weapon: 'fists', heavy: 1, stance: 1.25 },
  noDrop: true,
  motes: { color: 0x9dff5a },
  paint: {
    wild: { paint: 0x5c4630, accent: 0x3e6624, trim: 0xd99030 },
    horde: { paint: 0x3e2f2a, accent: 0x9a3a1a, trim: 0xe0a040 },
    order: { paint: 0x5a5a60, accent: 0x5a8aa8, trim: 0xcfd8e0 },
  },
  mats: {
    all: {
      paint: { rough: 0.78, metal: 0.0, detail: { map: barkMap, scale: 2.2, albedo: 0.9, rough: 0.4 }, panel: { grime: 0.2, grimeScale: 9 } },
      accent: { rough: 0.9, detail: { map: 'grime', scale: 3, albedo: 0.5, rough: 0.2 } },
      metal: { color: 0x6c705a, metal: 0.0, rough: 0.72, detail: { map: barkMap, scale: 2.6, albedo: 0.7, rough: 0.3 } },
      trim: { rough: 0.45, metal: 0.1 },
    },
  },
  sockets: {
    muzzle: ['handR', [0, -0.34, 0.16]], hand: ['handR', [0, -0.3, 0.12]], handL: ['handL', [0, -0.3, 0.12]],
    core: [0, 0.24, 0.36], head: [0, 0.18, 0.2], heart: ['chest', [0, 0.24, 0.36]], crown: ['aux1', [0, 0.25, -0.05]],
  },
  events: {
    attack: [['impact', 0.5]], attack_alt: [['impact', 0.46]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.1], ['impact', 0.52], ['impact', 0.74]], die: [['down', 0.62]], deploy: [['land', 0.3], ['ready', 0.85]],
  },
  durs: DURS,
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const a = unit.state.action, t = ctx.t, u = ctx.su, dead = unit.dead;
    // crown + canopy sway (stronger when it moves or roars)
    const gust = a === 'overdrive' ? kf(u, [[0, 0], [0.1, 1], [0.45, 1], [0.55, 0.3], [1, 0]]) : a === 'attack' || a === 'attack_alt' ? 0.5 : unit.state.loop === 'victory' ? 0.7 : 0;
    const sw = dead ? 0 : 0.04 + 0.1 * gust;
    bones[BI.aux1].rotation.set(Math.sin(t * 1.3) * sw + Math.sin(t * 9) * 0.04 * gust, 0, Math.sin(t * 0.9 + 1) * sw);
    bones[BI.aux0].rotation.set(Math.sin(t * 1.1 + 2) * sw * 0.7, 0, Math.sin(t * 0.8) * sw * 0.8 + Math.sin(t * 11) * 0.03 * gust);
    // halo spins
    bones[BI.aux2].rotation.set(0.12, (t * (a === 'overdrive' ? 2.2 : 0.5)) % TAU, 0.05);
    // deploy: grows from a curled stump
    const g = a === 'deploy' ? 0.3 + 0.7 * kf(u, [[0, 0], [0.3, 0.35], [0.72, 1], [0.8, 1.04], [0.9, 1]]) : 1;
    bones[0].scale.setScalar(g);
    if (g !== 1) bones[0].position.multiplyScalar(g);
  },
  fxHints: { impact: 'root_slam', overdrive: 'grasp_of_ages', color: 0x86ff6a },
  build,
};

// bark: long vertical fibres + knots (rgb 0.5 = neutral; alpha from brightness)
function barkMap(g, w, h, r) {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) {
    const x = r() * w, y = r() * h, L = 30 + r() * 140, c = r() < 0.6 ? 60 + r() * 40 : 170 + r() * 40;
    g.strokeStyle = `rgba(${c | 0},${c | 0},${c | 0},${0.25 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (r() - 0.5) * 12, y + L * 0.33, x + (r() - 0.5) * 12, y + L * 0.66, x + (r() - 0.5) * 8, y + L); g.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = r() * w, y = r() * h, R = 4 + r() * 10;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(40,40,40,0.8)'); gr.addColorStop(0.6, 'rgba(90,90,90,0.4)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, R * 0.7, R * 1.4, 0, 0, TAU); g.fill();
  }
}
