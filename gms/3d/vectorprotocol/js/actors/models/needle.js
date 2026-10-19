// NEEDLE, experimental common archer "Prism Drone" (sculptor-12). Brief: docs/ROSTER.md `needle`; PRISM's humble little cousin.
// A small floating black-glass diamond (octahedron) with violet facet inlays and pale-cyan hardlight edges, one big lens in the
// front (chrome housing, iris blades that spin when it fires, a pink-white core), a little hood over the lens like an eyelid,
// two swept fin-wings on the shoulder bones (they flap, flare and fold), a tail stabiliser, a thruster ring and a crystal
// hanging under the bottom point.
// VALUE (same language as PRISM): `accent` = black glass (most of it), `paint` = violet inlays + wing skins, `metal` = dark chrome,
// `trim` = pale cyan hardlight edges, `glow` = violet cores, `eye` = pink-white lens core. 6 slots.
// Rank tiers (ROSTER R0–1 base · R2 extra fins · R3 orbiting mini-prisms), plus:
//   R0 battered: chipped left wing tip, cracked inlay, taped antenna · R1 base · R2 a lower pair of fins (X-wing) + tail spurs ·
//   R3 three mini-prisms orbit the body (aux2) · R4 a tilted hardlight gyro ring round the body (aux3) · R5 crown: a floating
//   triangle sigil with crystals above the drone (aux3).
// Bones: chest = diamond · head = lens (glances) · aux1 (on head) = iris blades (spin) · upArmL/R = wings · foreArmL/R = R2 lower
//   fins · aux0 (chest, back) = tail · aux2 / aux3 (chest) = mini-prism orbit / gyro ring + crown.
import { THREE, fin, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  hover: 0.64, thigh: 0.08, shin: 0.08, ankle: 0.02, hipX: 0.04, hipY: -0.02, spine: 0.06, chest: 0.1, neck: 0.02, headOff: 0.0,
  clavX: 0.0, clavY: 0.04, shoulder: 0.15, upArm: 0.05, foreArm: 0.05,
  aux0: [0, 0.02, -0.17], aux1: [0, 0.027, 0.3], aux2: [0, 0.02, 0], aux3: [0, 0.02, 0],
  parents: { aux2: 'chest', aux3: 'chest' },
};
// diamond (chest space): top/bottom points + 4 equator corners at 45 degrees (a face looks forward)
const RT = 0.225, YT = 0.37, YB = -0.33, YC = 0.02;
const TOP = [0, YT, 0], BOT = [0, YB, 0];
const EQ = [0, 1, 2, 3].map((i) => { const a = PI / 4 + i * PI / 2; return [Math.cos(a) * RT, YC, Math.sin(a) * RT]; });
const FACES = [];
for (let i = 0; i < 4; i++) { const a = EQ[i], c = EQ[(i + 1) % 4]; FACES.push([a, c, TOP], [c, a, BOT]); }

// ---------- helpers (crystal language shared with PRISM) ----------
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const facet = (g) => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; };
const crystal = (b) => facet(b.lathe([[0, -1], [0.62, 0.15], [0.5, 0.5], [0, 0.62]], 8));
function triGeo(pts) {
  const g = new THREE.BufferGeometry(), pos = [];
  for (const t of pts) for (const p of t) pos.push(p.x, p.y, p.z);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}
const normalOf = (a, c, d) => { const n = v3(c).sub(v3(a)).cross(v3(d).sub(v3(a))).normalize(); const m = v3(a).add(v3(c)).add(v3(d)); if (n.dot(m) < 0) n.negate(); return n; };
// thick triangle slab: triangle shrunk toward its centroid by s, lifted along n by inset, extruded th
function triSlab(a, c, d, th, s = 1, inset = 0) {
  const n = normalOf(a, c, d), ctr = v3(a).add(v3(c)).add(v3(d)).multiplyScalar(1 / 3);
  const P3 = [a, c, d].map((p) => v3(p).sub(ctr).multiplyScalar(s).add(ctr).addScaledVector(n, inset));
  const Q3 = P3.map((p) => p.clone().addScaledVector(n, th));
  const qc = Q3[0].clone().add(Q3[1]).add(Q3[2]).multiplyScalar(1 / 3);
  Q3.forEach((q) => q.sub(qc).multiplyScalar(0.9).add(qc));
  const tris = [[Q3[0], Q3[1], Q3[2]], [P3[0], P3[2], P3[1]]];
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tris.push([P3[i], P3[j], Q3[j]], [P3[i], Q3[j], Q3[i]]); }
  const sc = ctr.clone().addScaledVector(n, th * 0.5 + inset);
  return triGeo(tris.map((t) => { const e = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])); const m = t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3); return e.dot(m.sub(sc)) < 0 ? [t[0], t[2], t[1]] : t; }));
}
function bar(b, bone, slot, a, c, w = 0.012) {
  const A = v3(a), C = v3(c), len = A.distanceTo(C);
  const g = b.cyl(w * 0.6, w * 0.6, len, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize()));
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  b.add(g, bone, slot);
}
const lerp3 = (a, c, u) => [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u];
const scale3 = (p, k, ctr = [0, YC, 0]) => [ctr[0] + (p[0] - ctr[0]) * k, ctr[1] + (p[1] - ctr[1]) * k, ctr[2] + (p[2] - ctr[2]) * k];

// ---------- parts ----------
function body(b, o) {
  const far = b.far, rk = o.rank;
  // black-glass octahedron
  const pts = FACES.map(([a, c, d]) => [v3(a), v3(c), v3(d)]);
  b.add(triGeo(pts.map((t) => { const n = normalOf(...t.map((p) => p.toArray())); const e = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])); return e.dot(n) < 0 ? [t[0], t[2], t[1]] : t; })), 'chest', 'accent');
  // violet inlay on every facet (the top four also get an inner black plate + cyan frame: what the battle camera sees)
  FACES.forEach(([a, c, d], i) => {
    const up = i % 2 === 0;
    if (rk === 0 && i === 2) { b.add(triSlab(a, c, d, 0.01, 0.62, 0.002), 'chest', 'metal'); return; }   // R0: a dead, cracked facet
    b.add(triSlab(a, c, d, 0.012, 0.8, 0.002), 'chest', 'paint');
    if (up && !far) {
      b.add(triSlab(a, c, d, 0.008, 0.26, 0.014), 'chest', 'accent');
      const n = normalOf(a, c, d), ctr = v3(a).add(v3(c)).add(v3(d)).multiplyScalar(1 / 3);
      const sh = (p) => v3(p).sub(ctr).multiplyScalar(0.5).add(ctr).addScaledVector(n, 0.02).toArray();
      bar(b, 'chest', 'trim', sh(a), sh(c), 0.008); bar(b, 'chest', 'trim', sh(c), sh(d), 0.008); bar(b, 'chest', 'trim', sh(d), sh(a), 0.008);
    }
  });
  if (!far) FACES.forEach(([a, c, d], i) => {
    const n = normalOf(a, c, d), ctr = v3(a).add(v3(c)).add(v3(d)).multiplyScalar(1 / 3);
    const rot = [Math.asin(-n.y) + PI / 2, Math.atan2(n.x, n.z), 0];
    for (let j = 1; j < 4; j++) for (const p of [a, c]) {
      const q = v3(p).lerp(v3(d), j / 4).sub(ctr).multiplyScalar(0.84).add(ctr).addScaledVector(n, 0.006);
      b.add(b.cyl(0.008, 0.008, 0.01, 8), 'chest', i % 2 ? 'metal' : 'glow', q.toArray(), rot);
    }
    if (i % 2 === 1) {
      // lower facets: a little slatted vent
      const q = ctr.clone().addScaledVector(n, 0.012), rr = [Math.asin(-n.y), Math.atan2(n.x, n.z), 0];
      b.add(b.cbox(0.08, 0.05, 0.012, 0.004), 'chest', 'metal', q.toArray(), rr);
      for (let k = 0; k < 3; k++) b.add(b.box(0.065, 0.005, 0.016), 'chest', 'glow', q.clone().addScaledVector(n, 0.002).add(new THREE.Vector3(0, -0.015 + k * 0.015, 0)).toArray(), rr);
    }
  });
  if (!far) for (let i = 0; i < 4; i++) for (let j = 1; j < 5; j++) b.add(b.sph(6, 4), 'chest', 'metal', lerp3(scale3(EQ[i], 1.05), scale3(EQ[(i + 1) % 4], 1.05), j / 5), [0, 0, 0], 0.009);
  if (rk === 0 && !far) { bar(b, 'chest', 'glow', scale3(EQ[1], 1.01), lerp3(scale3(EQ[1], 1.01), TOP, 0.4), 0.006); }
  // hardlight edges: equator ring (cyan) + the 4 upper edges (violet) + lower edges (chrome)
  for (let i = 0; i < 4; i++) {
    const a = scale3(EQ[i], 1.03), c = scale3(EQ[(i + 1) % 4], 1.03);
    bar(b, 'chest', 'trim', a, c, 0.016);
    bar(b, 'chest', 'paint', a, scale3(TOP, 1.0, [0, YC, 0]), 0.013);
    bar(b, 'chest', 'metal', a, scale3(BOT, 1.0, [0, YC, 0]), 0.012);
    // corner nodes: chrome cap + glow dot
    b.add(b.cyl(0.022, 0.022, 0.03, 8), 'chest', 'metal', a, [0, -(PI / 4 + i * PI / 2), PI / 2]);
    if (!far) b.add(b.sph(6, 4), 'chest', 'glow', scale3(EQ[i], 1.13), [0, 0, 0], 0.012);
  }
  // equator belt: four chamfered armour bands with a glow strip, clamps at the corners
  for (let i = 0; i < 4; i++) {
    const a = scale3(EQ[i], 1.0), c = scale3(EQ[(i + 1) % 4], 1.0), m = lerp3(a, c, 0.5), L2 = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const ry = -Math.atan2(c[2] - a[2], c[0] - a[0]);
    b.add(b.cbox(L2 * 0.78, 0.05, 0.03, 0.01), 'chest', 'metal', [m[0] * 1.08, m[1], m[2] * 1.08], [0, ry, 0]);
    b.add(b.cbox(L2 * 0.6, 0.012, 0.034, 0.003), 'chest', 'glow', [m[0] * 1.09, m[1], m[2] * 1.09], [0, ry, 0]);
    if (!far) for (const u of [0.18, 0.82]) { const q = lerp3(a, c, u); b.add(b.cbox(0.02, 0.07, 0.04, 0.005), 'chest', 'trim', [q[0] * 1.09, q[1], q[2] * 1.09], [0, ry, 0]); }
  }
  // lower facets: black glass frame plates
  if (!far) FACES.forEach(([a, c, d], i) => { if (i % 2) b.add(triSlab(a, c, d, 0.008, 0.82, 0.004), 'chest', 'accent'); });
  // top crest: four small hardlight fins round the top point
  if (!far) for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; b.add(fin(b, [[0, 0], [0.05, 0], [0.012, 0.09]], 0.01, 0.003), 'chest', i % 2 ? 'paint' : 'trim', [Math.cos(a) * 0.035, YT - 0.06, Math.sin(a) * 0.035], [0, -a, 0]); }
  // top cap: chrome bead + cyan crest crystal + R0 taped stub antenna
  b.add(b.cyl(0.03, 0.04, 0.03, 8), 'chest', 'metal', [0, YT - 0.005, 0]);
  b.add(crystal(b), 'chest', o.rank >= 1 ? 'trim' : 'paint', [0, YT + 0.06, -0.02], [0.25, PI / 4, 0], [0.022, 0.06, 0.022]);
  b.add(b.cyl(0.004, 0.006, 0.16, 5), 'chest', 'metal', [0.05, YT + 0.05, -0.06], [-0.3, 0, -0.35]);
  if (rk === 0) b.add(b.cyl(0.008, 0.008, 0.025, 6), 'chest', 'accent', [0.07, YT + 0.08, -0.08], [-0.3, 0, -0.35]);
  else b.add(b.sph(6, 4), 'chest', 'glow', [0.078, YT + 0.12, -0.085], [0, 0, 0], 0.012);
  // underside: thruster ring + a crystal hanging off the bottom point
  b.add(b.tor(0.085, 0.012, 18, 4), 'chest', 'metal', [0, YB + 0.08, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.07, 0.007, 18, 3), 'chest', 'glow', [0, YB + 0.07, 0], [PI / 2, 0, 0]);
  b.add(crystal(b), 'chest', 'glow', [0, YB - 0.07, 0], [PI, PI / 4, 0], [0.032, 0.09, 0.032]);
  if (!far) for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; b.add(crystal(b), 'chest', i ? 'paint' : 'trim', [Math.cos(a) * 0.04, YB - 0.02, Math.sin(a) * 0.04], [PI + Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], [0.014, 0.045, 0.014]); }
}

// the lens is the read-shape: authored at 1x, built LK x bigger round the head joint (iris aux1 + sockets scaled to match)
const LK = 1.35;
function lens(b, o) { b.scope([0, 0, 0], [0, 0, 0], LK, () => lens0(b, o)); }
function lens0(b, o) {
  const far = b.far, Z = 0.19, Y = 0.02;
  // chrome barrel poking out of the front facets: stacked rings, focus rails, cyan bezel, dark glass dome, violet ring + core
  b.add(b.cyl(0.13, 0.115, 0.1, 24), 'head', 'metal', [0, Y, Z - 0.03], [PI / 2, 0, 0]);
  b.add(b.cyl(0.14, 0.14, 0.022, 24), 'head', 'accent', [0, Y, Z - 0.07], [PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) b.add(b.tor(0.124 - i * 0.004, 0.007, 28, 4), 'head', i % 2 ? 'trim' : 'metal', [0, Y, Z - 0.055 + i * 0.03]);
  if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; b.add(b.cbox(0.014, 0.014, 0.09, 0.004), 'head', 'metal', [Math.cos(a) * 0.132, Y + Math.sin(a) * 0.132, Z - 0.03]); }
  b.add(b.tor(0.122, 0.014, 28, 6), 'head', 'trim', [0, Y, Z + 0.024]);
  b.add(b.tor(0.1, 0.008, 28, 4), 'head', 'glow', [0, Y, Z + 0.026]);
  b.add(b.sph(20, 10, 0, PI * 2, 0, PI * 0.5), 'head', 'accent', [0, Y, Z + 0.016], [PI / 2, 0, 0], [0.098, 0.04, 0.098]);
  b.add(b.tor(0.05, 0.006, 20, 3), 'head', 'glow', [0, Y, Z + 0.05]);
  b.add(crystal(b), 'head', 'eye', [0, Y, Z + 0.06], [PI / 2, 0, 0], [0.028, 0.045, 0.028]);
  // petal ring round the bezel (reads as a camera aperture housing from above)
  if (!far) for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; b.add(b.cbox(0.03, 0.016, 0.03, 0.005), 'head', i % 2 ? 'metal' : 'paint', [Math.cos(a) * 0.145, Y + Math.sin(a) * 0.145, Z - 0.01], [0, 0, a]); }
  // eyelid hood over the top of the lens, two little brow fins
  b.add(b.cyl(0.135, 0.135, 0.09, 16, false, PI * 0.58, PI * 0.84), 'head', 'accent', [0, Y + 0.012, Z - 0.005], [PI / 2, 0, 0], [1.08, 1, 1.08]);
  b.add(b.cyl(0.137, 0.137, 0.012, 16, false, PI * 0.58, PI * 0.84), 'head', 'paint', [0, Y + 0.012, Z + 0.04], [PI / 2, 0, 0], [1.08, 1, 1.08]);
  if (!far) b.sym(fin(b, [[0, 0], [0.05, 0.01], [0.09, 0.06], [0.07, 0.065], [0.02, 0.03]], 0.012, 0.003), 'head', 'trim', [0.06, Y + 0.12, Z - 0.03], [0, 0.2, -0.15]);
  // side range-finder pods
  b.sym(b.cyl(0.022, 0.022, 0.06, 8), 'head', 'metal', [0.15, Y - 0.05, Z - 0.06], [PI / 2, 0, 0]);
  if (!far) b.sym(b.cyl(0.014, 0.014, 0.008, 8), 'head', 'glow', [0.15, Y - 0.05, Z - 0.028], [PI / 2, 0, 0]);
  // iris blades on aux1 (spin about the lens axis in post)
  const n = far ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    b.add(fin(b, [[0, 0], [0.035, -0.008], [0.05, 0.012], [0.01, 0.02]], 0.004, 0.001), 'aux1', 'metal', [Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.0], [0, 0, a + 1.2]);
  }
}

// one fin-wing in the shoulder bone's frame: swept back, slight dihedral, violet skin over black glass, cyan leading edge, glow tip
function wing(b, o, bone, scale = 1, chipped = false, down = 0) {
  const far = b.far, s = scale;
  const tip = chipped ? 0.2 : 0.27;
  const outline = [[0, -0.05], [0.09, -0.055], [tip, 0.07], [tip + 0.02, 0.15], [tip - 0.06, 0.12], [0.07, 0.06], [0, 0.05]].map(([x, y]) => [x * s, y * s]);
  b.scope([0.0, 0, 0], [-PI / 2, 0, 0.18 - down], 1, () => {
    b.sym(fin(b, outline, 0.026 * s, 0.006), bone, 'accent', [0.02, 0, 0]);
    b.sym(fin(b, outline.map(([x, y]) => [x * 0.86 + 0.02 * s, y * 0.8]), 0.032 * s, 0.004), bone, 'paint', [0.02, 0, 0]);
    // leading edge
    const le = [[0.02 + 0.09 * s, -0.055 * s, 0], [0.02 + (tip + 0.02) * s, 0.15 * s, 0]];
    b.sym((() => { const A = v3(le[0]), C = v3(le[1]), g = b.cyl(0.008, 0.008, A.distanceTo(C), 6); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize())); g.translate((le[0][0] + le[1][0]) / 2, (le[0][1] + le[1][1]) / 2, 0); return g; })(), bone, 'trim');
    if (!chipped) b.sym(crystal(b), bone, 'glow', [0.02 + (tip + 0.03) * s, 0.16 * s, 0], [0, 0, -0.45], [0.016, 0.04, 0.016]);
    // wingtip nacelle: chrome pod along the chord with a violet intake ring and a cyan tail light
    if (!down) {
      const nx = 0.02 + (tip - 0.02) * s, ny = 0.06 * s;
      b.sym(b.cyl(0.022 * s, 0.016 * s, 0.16 * s, 16), bone, 'metal', [nx, ny, 0], [0, 0, 0]);
      b.sym(b.tor(0.022 * s, 0.005, 16, 4), bone, 'glow', [nx, ny - 0.08 * s, 0], [PI / 2, 0, 0]);
      b.sym(b.cyl(0.012 * s, 0.012 * s, 0.01, 12), bone, 'trim', [nx, ny + 0.082 * s, 0]);
    }
    if (!far) for (let i = 0; i < 4; i++) b.sym(b.box(0.006, 0.09 * s, 0.04 * s), bone, 'metal', [0.05 * s + i * 0.05 * s, 0.03 * s + i * 0.022 * s, 0], [0, 0, 0.45]);
    b.sym(fin(b, outline.map(([x, y]) => [x * 0.55 + 0.01, y * 0.5 - 0.01]), 0.04 * s, 0.004), bone, 'accent', [0.02, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.sym(b.box(0.05 * s, 0.006, 0.046 * s), bone, 'glow', [0.06 * s + i * 0.045 * s, 0.03 * s + i * 0.025 * s, 0], [0, 0, 0.5]);
  });
  // hinge
  b.sym(b.sph(10, 6), bone, 'metal', [0, 0, 0], [0, 0, 0], 0.032 * s);
  b.sym(b.cyl(0.02 * s, 0.02 * s, 0.05, 8), bone, 'trim', [0, 0, 0], [0, 0, PI / 2]);
}

function tail(b, o) {
  const bn = 'aux0', far = b.far, rk = o.rank;
  // vertical stabiliser + a small rear thruster
  b.add(fin(b, [[0, -0.04], [0.02, -0.05], [0.18, 0.08], [0.16, 0.12], [0.02, 0.06]], 0.02, 0.005), bn, 'accent', [0, 0.04, 0.03], [0, -PI / 2, 0]);
  b.add(fin(b, [[0.01, -0.03], [0.15, 0.08], [0.13, 0.1], [0.01, 0.04]], 0.026, 0.004), bn, 'paint', [0, 0.04, 0.03], [0, -PI / 2, 0]);
  b.add(b.cyl(0.04, 0.05, 0.06, 12), bn, 'metal', [0, -0.03, 0.04], [PI / 2, 0, 0]);
  b.add(b.cyl(0.032, 0.032, 0.01, 12), bn, 'glow', [0, -0.03, 0.006], [PI / 2, 0, 0]);
  if (rk >= 2 && !far) b.sym(fin(b, [[0, 0], [0.08, 0.0], [0.11, 0.05], [0.02, 0.03]], 0.014, 0.003), bn, 'trim', [0.03, -0.06, 0.04], [0, -0.4, -0.6]);
}

function orbit(b, o) {
  if (o.rank < 3) return;
  const bn = 'aux2', R = 0.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2, p = [Math.cos(a) * R, 0.04 * Math.sin(a * 2), Math.sin(a) * R];
    b.add(crystal(b), bn, 'accent', p, [0, -a, 0.2], [0.05, 0.12, 0.05]);
    b.add(crystal(b), bn, i === 0 ? 'trim' : 'glow', p, [0, -a, 0.2], [0.032, 0.13, 0.032]);
    b.add(b.tor(0.05, 0.006, 14, 3), bn, 'paint', p, [PI / 2, 0, 0]);
  }
}

function gyro(b, o) {
  const rk = o.rank, bn = 'aux3', far = b.far;
  if (rk < 4) return;
  // tilted hardlight belt around the diamond with four nodes
  b.scope([0, -0.02, 0], [PI / 2 + 0.32, 0, 0.18], 1, () => {
    b.add(b.tor(0.34, 0.014, 48, 5), bn, 'trim', [0, 0, 0]);
    b.add(b.tor(0.32, 0.007, 48, 3), bn, 'glow', [0, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(b.cbox(0.045, 0.045, 0.045, 0.01), bn, 'metal', [Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0], [0, 0, a]); }
  });
  if (rk < 5) return;
  // crown sigil: inverted triangle + three crystals floating over the top point
  const T = [0, 1, 2].map((i) => { const a = PI / 2 + i * 2 * PI / 3; return [Math.cos(a) * 0.12, YT + 0.2, Math.sin(a) * 0.12]; });
  for (let i = 0; i < 3; i++) bar(b, bn, 'glow', T[i], T[(i + 1) % 3], 0.012);
  for (const p of T) b.add(crystal(b), bn, 'trim', [p[0], p[1] + 0.02, p[2]], [0, 0, 0], [0.018, 0.045, 0.018]);
  if (!far) b.add(crystal(b), bn, 'eye', [0, YT + 0.27, 0], [0, PI / 4, 0], [0.02, 0.05, 0.02]);
}

function build(b, o) {
  body(b, o);
  lens(b, o);
  wing(b, o, 'upArm', 1.55, false);
  if (o.rank === 0 && !b.far) b.add(b.box(0.03, 0.012, 0.03), 'upArmL', 'metal', [0.36, 0.02, -0.1]);   // patch on the chipped tip
  if (o.rank >= 2) wing(b, o, 'foreArm', 0.95, false, 0.75);
  tail(b, o);
  orbit(b, o);
  gyro(b, o);
  if (o.r >= 1 && !b.far) for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; b.add(b.cbox(0.02, 0.05, 0.02, 0.005), 'chest', 'trim', [Math.cos(a) * 0.1, YT - 0.12, Math.sin(a) * 0.1], [0, -a, 0.6]); }
}

// ---------- anims ----------
// wings: flap = dihedral (rad), sweep = back-sweep (rad), pitch; lower fins follow with an anhedral bias
function wings(P, flap, sweep = 0, pitch = 0, fins = 0) {
  for (const s of SIDES) {
    L.RS(P, 'clav', s, 0, 0, 0);
    L.RS(P, 'upArm', s, pitch, sweep, flap);
    L.RS(P, 'foreArm', s, 0, 0, -0.2 * flap + fins);
    L.RS(P, 'hand', s, 0, 0, 0);
  }
}
function base(P, ctx, t) {
  L.hoverIdle(P, ctx, t);
  P[L.PX + 1] += 0.04 * Math.sin(t * 2.6);
  L.A(P, 'chest', 0, 0.1 * Math.sin(t * 0.5), 0.05 * Math.sin(t * 0.9));
  const f = Math.sin(t * 7.5) * 0.05 + Math.sin(t * 1.3) * 0.06;
  wings(P, 0.05 + f, 0.05, 0);
}
const OD_F = [0.3, 0.38, 0.46, 0.54];
const anims = {
  // idle: buzzes, bobs; every ~5.2 s a "crush" moment: leans toward the target, lens tilts, wings flutter fast, a happy hop
  idle(P, t, ctx) {
    base(P, ctx, t);
    const c = t % 5.2, k = kf(c, [[0, 0], [3.4, 0], [3.7, 1], [4.6, 1], [5.0, 0]]);
    const flut = Math.sin(t * 30) * 0.18 * k;
    L.A(P, 'pelvis', 0.18 * k, 0, 0.12 * k); L.A(P, 'head', 0.05 * k, 0, -0.25 * k);
    P[L.PX + 1] += 0.06 * k * Math.abs(Math.sin(t * 6));
    wings(P, 0.25 * k + flut + 0.05, 0.05, 0);
  },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.28, 0, 0); L.A(P, 'head', -0.15, 0, 0);
    wings(P, 0.12 + Math.sin(t * 9) * 0.06, 0.45, 0.1);
  },
  // PRISM DART: wings flare back, the body draws back and the lens focuses (iris spin in post), fires at 0.4, recoil
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.32, 1], [0.42, 0.6], [1, 0]]), kick = kf(u, [[0.38, 0], [0.42, 1], [0.7, 0]]);
    P[L.PX + 2] -= 0.06 * k + 0.1 * kick; P[L.PX + 1] += 0.03 * k;
    L.A(P, 'pelvis', -0.12 * k - 0.15 * kick, 0, 0);
    wings(P, 0.35 * k - 0.2 * kick, -0.35 * k + 0.5 * kick, 0);
  },
  // double tap: fires (0.3), snaps through a quick barrel roll, fires again (0.5)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const roll = kf(u, [[0.32, 0], [0.46, 1]]) * PI * 2, k = kf(u, [[0, 0], [0.2, 1], [0.7, 1], [1, 0]]);
    const kick = kf(u, [[0.28, 0], [0.31, 1], [0.4, 0], [0.48, 0], [0.51, 1], [0.7, 0]]);
    L.A(P, 'pelvis', -0.1 * k, 0, roll); P[L.PX + 2] -= 0.08 * kick; P[L.PX + 1] += 0.06 * k;
    wings(P, 0.3 * k, -0.2 * k + 0.3 * kick, 0);
  },
  // OVERCHARGE: spins up a full turn, rises, wings fully raised, the core flashes (cast 0.5)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.35, 1], [0.7, 1], [1, 0]]), spin = kf(u, [[0.1, 0], [0.6, 1]]);
    P[L.PX + 1] += 0.16 * k;
    L.A(P, 'spine', 0, spin * PI * 2, 0); L.A(P, 'head', -0.2 * k, 0, 0);
    wings(P, 0.9 * k + Math.sin(u * 60) * 0.1 * k, -0.2 * k, 0);
  },
  // PRISM VOLLEY: rises, tilts nose-down, spins twice while the lens fires four darts in a fan (0.3..0.54), settles
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const rise = kf(u, [[0, 0], [0.2, 1], [0.75, 1], [0.95, 0]]), spin = kf(u, [[0.24, 0], [0.62, 1]]);
    const wide = kf(u, [[0, 0], [0.18, 1], [0.7, 1], [0.9, 0]]);
    P[L.PX + 1] += 0.4 * rise;
    L.A(P, 'pelvis', 0.15 * wide, 0, 0);
    L.A(P, 'spine', 0, spin * PI * 4, 0); L.A(P, 'head', 0.25 * wide, 0, 0);
    wings(P, 0.7 * wide + Math.sin(u * 50) * 0.08 * wide, -0.35 * wide, 0, -0.5 * wide);
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir, w = Math.sin(u * 28) * (1 - u);
    L.A(P, 'pelvis', -0.35 * k, 0.2 * d * k, 0.45 * w * d); P[L.PX + 2] -= 0.14 * k; P[L.PX + 1] -= 0.06 * k;
    wings(P, -0.3 * k + 0.3 * w, 0.3 * k, 0);
  },
  // sputters, spirals down onto the plate point-first and tips over (down 0.72)
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u));
    const sp = kf(u, [[0, 0], [0.06, 1], [0.3, 1], [0.36, 0.3]]), jit = Math.sin(u * 110) * sp;
    const g = 0.28 - ctx.D.pelvisY;
    const drop = kf(u, [[0, 0], [0.3, 0.02], [0.68, g], [0.74, g + 0.05], [0.8, g], [1, g - 0.04]]);
    const spin = kf(u, [[0.25, 0], [0.7, 1]]), tip = kf(u, [[0.7, 0], [0.86, 1.2], [0.92, 1.05], [1, 1.1]]);
    P[L.PX + 1] = drop;
    L.A(P, 'pelvis', 0.2 * jit + 0.3 * spin, 0, 1.1 * tip + 0.3 * jit);
    L.A(P, 'spine', 0, spin * PI * 3, 0);
    L.A(P, 'head', 0.3 * spin, 0, 0);
    wings(P, -0.4 * spin + 0.3 * jit, 0.2, 0, -0.3 * spin);
  },
  // happy: hops, barrel roll every ~2.4 s, wings flapping
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), c = t % 2.4;
    const roll = kf(c, [[1.2, 0], [1.7, 1]]) * PI * 2;
    P[L.PX + 1] += (0.15 + 0.1 * Math.abs(Math.sin(t * 5))) * k;
    L.A(P, 'pelvis', 0, 0, roll * k); L.A(P, 'head', -0.25 * k, 0, 0);
    wings(P, (0.4 + Math.sin(t * 14) * 0.35) * k, 0, 0);
  },
  // drops in tumbling with wings folded, catches itself on landing (0.4), pops up, unfolds the wings, lens lights (ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const fold = kf(u, [[0, 1], [0.45, 1], [0.75, 0]]), tumble = kf(u, [[0, 0], [0.4, 1]]);
    const catchK = kf(u, [[0.38, 0], [0.44, 1], [0.6, -0.4], [0.75, 0]]);
    L.A(P, 'pelvis', (1 - tumble) * PI * 2 + 0.2 * catchK, 0, 0);
    P[L.PX + 1] -= 0.12 * Math.max(0, catchK) - 0.06 * Math.min(0, catchK);
    wings(P, L.lerp(0.1, -1.1, fold), L.lerp(0.05, 0.9, fold), 0, -0.4 * fold);
  },
};

// iris spin (rad) per action
function irisK(name, u, t) {
  switch (name) {
    case 'attack': return kf(u, [[0, 0], [0.4, 3], [1, 3.5]]);
    case 'attack_alt': return kf(u, [[0, 0], [0.3, 2.5], [0.5, 5], [1, 5.5]]);
    case 'overdrive': return kf(u, [[0, 0], [0.6, 12], [1, 13]]);
    case 'cast': return kf(u, [[0, 0], [0.5, 4], [1, 5]]);
    default: return 0.4 * Math.sin(t * 0.7);
  }
}

export default {
  id: 'needle', name: 'NEEDLE', role: 'archer', faction: 'experimental', rarity: 'common', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.2, radius: 0.46, bodyScale: [1.18, 1.18, 1.18], walkSpeed: 1.2, scheme: 'bold',
  style: { weapon: 'orbs' },
  paint: { experimental: { paint: 0x7a3cf0, accent: 0x07060c, trim: 0xa6f2ff, glow: 0xb24dff, eye: 0xffc8f6 } },
  mats: {
    all: {
      accent: { rough: 0.08, metal: 0.65, env: 1.25, coat: 1, coatRough: 0.03, panel: { groove: 0.12, scale: 4 }, detail: { map: 'scratch', scale: 2, albedo: 0.2, rough: 0.5 } },
      paint: { rough: 0.22, coat: 1, panel: { groove: 0.15 } },
      metal: { color: 0x7d8494, metal: 0.95, rough: 0.2, panel: { groove: 0.08, scale: 9 } },
      eye: { ei: 6 },   // lens core always hot: it is the unit's identity at 80 px
    },
    experimental: { trim: { emissive: 0x2fb8ff, ei: 0.9, metal: 0.3, rough: 0.2 } },
  },
  motes: { color: 0xc07aff, size: 0.07 },
  sockets: {
    muzzle: ['head', [0, 0.027, 0.38]], core: [0, 0.04, 0.14], head: [0, 0.1, 0.1],
    hand: ['upArmR', [-0.3, 0, -0.12]], handL: ['upArmL', [0.3, 0, -0.12]], lens: ['head', [0, 0.027, 0.31]],
  },
  events: {
    attack: [['fire', 0.4]], attack_alt: [['fire', 0.3], ['fire', 0.5]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.05], ...OD_F.map((u) => ['fire', u])], die: [['down', 0.72]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 0.8, attack_alt: 0.9, cast: 1.0, overdrive: 2.0, hit: 0.4, die: 1.6, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    const name = act ? act.name : null, u = act ? Math.min(1, act.t / act.dur) : 0, t = ctx.t;
    P[BI.aux1 * 3 + 2] = irisK(name, u, t);
    P[BI.aux2 * 3 + 1] = t * (name === 'overdrive' ? 5 : 1.1);
    P[BI.aux3 * 3 + 1] = -t * (name === 'overdrive' ? 3 : 0.6);
    // tail wags with the turn
    P[BI.aux0 * 3 + 1] = 0.15 * Math.sin(t * 1.4);
    // robots touch-up: tip the lens up toward the high battle camera (it faced sideways and read as wings + a dark diamond)
    if (name !== 'die') P[BI.head * 3] -= 0.6;
  },
  tick(unit, dt, ctx, bones) {
    // mini-prisms bob in their orbit, gyro + crown bob; all collapse on death
    const t = ctx.t, d = unit.state.action === 'die' || unit.dead;
    const o = bones[BI.aux2], g = bones[BI.aux3];
    o.position.y = ctx.D.aux2[1] + 0.03 * Math.sin(t * 2.2);
    o.scale.setScalar(d ? Math.max(0.001, o.scale.x - dt * 1.5) : 1);
    g.position.y = ctx.D.aux3[1] + 0.02 * Math.sin(t * 1.7 + 1);
    g.scale.setScalar(d ? Math.max(0.001, g.scale.x - dt * 1.5) : 1);
  },
  fxHints: { projectile: 'crystal_needle', impact: 'shard', overdrive: 'prism_volley', color: 0xb24dff },
  build,
};
