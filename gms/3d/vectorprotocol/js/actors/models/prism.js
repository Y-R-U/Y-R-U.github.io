// PRISM, experimental rare archer "Spectrum Lancer" (sculptor-5). Brief: docs/ROSTER.md `prism`; look: refs/ref_battle_02.png (purple units).
// A floating inverted three-sided prism of black glass, point-down, with a glowing crystal core in its front face, a small
// diamond head hovering over the top face, two slim detached arms ending in refracting crystal emitters, and a lone
// crystal hanging under the apex. The core fires the beam; the arms bracket it like a lens assembly.
// VALUE: `accent` = black glass (most of it, glossy, reflects the arena), `paint` = violet edge rails + inlays,
// `metal` = dark chrome frame, `trim` = pale cyan hardlight edges (faintly emissive), `glow` = violet cores, `eye` = pink-white.
// Violet glow + cyan trim + pink eye = the spectrum the beam is split into.
// Rank tiers: R0 battered (cracked, no top inlay) · R1 base solid prism · R2 the prism splits into 3 floating facets around a
//   naked core column · R3 rainbow caustic strips on the facets + glowing emitter claws · R4 a floating halo of shards behind
//   the head · R5 crown: a hardlight triangle frame above the head + an outer ring of shards.
// Technique: the 3 facets are thick triangle slabs on aux0/aux2/aux3 (re-parented to the chest, joints at the chest
// origin); post() yaws them as one around the core, tick() pushes each out along its face normal (breathing, attack spread,
// overdrive split, death). The halo/crown live on aux1 (head) and spin in post().
import { THREE, P, PS, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  hover: 0.75, thigh: 0.2, shin: 0.2, ankle: 0.04, hipX: 0.1, hipY: -0.04, spine: 0.12, chest: 0.3, neck: 0.2, headOff: 0.07,
  clavX: 0.06, clavY: 0.1, shoulder: 0.29, upArm: 0.25, foreArm: 0.25,
  parents: { aux2: 'chest', aux3: 'chest' }, aux0: [0, 0, 0], aux2: [0, 0, 0], aux3: [0, 0, 0], aux1: [0, 0.02, -0.12],
};
// the prism (chest space): top triangle at y TOP, apex below
const TOP = 0.19, R = 0.37, APEX = [0, -0.56, 0.0];
const VB = [0, TOP, -R], VL = [R * Math.sin(PI / 3), TOP, R * 0.5], VR = [-R * Math.sin(PI / 3), TOP, R * 0.5];
// facets: [bone, corner, corner] (+ apex); front = aux3, left (+x) = aux2, right = aux0
const FACETS = [['aux3', VL, VR], ['aux2', VB, VL], ['aux0', VR, VB]];
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const NORMALS = FACETS.map(([, a, c]) => {
  const n = v3(c).sub(v3(a)).cross(v3(APEX).sub(v3(a))).normalize();
  const mid = v3(a).add(v3(c)).add(v3(APEX)).multiplyScalar(1 / 3);
  if (n.dot(mid) < 0) n.negate();
  return n;
});

// ---------- geometry helpers ----------
const facet = (g) => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; };
// thick triangle slab: triangle (a,b,c) shrunk toward its centroid by s, extruded outward along n by th
function triSlab(b, a, c2, d, n, th, s = 1, inset = 0) {
  const ctr = v3(a).add(v3(c2)).add(v3(d)).multiplyScalar(1 / 3);
  const P3 = [a, c2, d].map((p) => v3(p).sub(ctr).multiplyScalar(s).add(ctr).addScaledVector(n, inset));
  const Q3 = P3.map((p) => p.clone().addScaledVector(n, th));
  // outer face slightly smaller = a chamfered bevel
  const qc = Q3[0].clone().add(Q3[1]).add(Q3[2]).multiplyScalar(1 / 3);
  Q3.forEach((q) => q.sub(qc).multiplyScalar(0.94).add(qc));
  const tris = [[Q3[0], Q3[1], Q3[2]], [P3[0], P3[2], P3[1]]];
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tris.push([P3[i], P3[j], Q3[j]], [P3[i], Q3[j], Q3[i]]); }
  const pos = [];
  for (const t of tris) {
    // keep every triangle facing outward from the slab centre
    const e = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));
    const m = t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3);
    const sc = ctr.clone().addScaledVector(n, th * 0.5 + inset);
    const tt = e.dot(m.clone().sub(sc)) < 0 ? [t[0], t[2], t[1]] : t;
    for (const p of tt) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = new Float32Array(pos.length / 3 * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// thin bar between two points
function bar(b, bone, slot, a, c, w = 0.014, d = w) {
  const A = v3(a), C = v3(c), len = A.distanceTo(C);
  const g = w === d && w >= 0.014 ? b.cyl(w * 0.6, w * 0.6, len, 8) : b.box(w, len, d);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  b.add(g, bone, slot, A.add(C).multiplyScalar(0.5).toArray(), [e.x, e.y, e.z]);
}
// brilliant-cut gem: 8 facets, crown + pavilion (unit height ~1.6, use scale)
const crystal = (b) => facet(b.lathe([[0, -1], [0.62, 0.15], [0.5, 0.5], [0, 0.62]], 16));
// pyramid (inverted, 3-sided) as a faceted lathe, rotated so a face looks forward
function pyramid(b, r, top, bot, h = 0.04) {
  const g = facet(b.lathe([[0, bot], [r, top - h], [r * 0.92, top], [0, top + 0.001]], 3));
  g.rotateY(PI);
  return g;
}
function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow') {
  b.add(b.cyl(r * 1.45, r * 1.45, 0.016, 12), bone, 'metal', pos, rot);
  b.add(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}

// ---------- parts ----------
function body(b, o) {
  const rk = o.rank, r = o.r, far = b.far, split = rk >= 2;
  const fc = NORMALS[0], ctrF = v3(VL).add(v3(VR)).add(v3(APEX)).multiplyScalar(1 / 3);
  if (!split) {
    // solid black-glass prism with violet edge rails and the core set into the front face
    b.add(pyramid(b, R, TOP, APEX[1]), 'chest', 'accent', [0, 0, 0]);
    for (const v of [VB, VL, VR]) bar(b, 'chest', 'paint', [v[0] * 1.02, v[1] - 0.01, v[2] * 1.02], [APEX[0], APEX[1] + 0.03, APEX[2]], 0.03, 0.03);
    if (rk === 0 && !far) bar(b, 'chest', 'metal', [0.1, 0.05, 0.16], [-0.06, -0.2, 0.1], 0.008, 0.012); // crack
    // inlaid circuitry lines + edge lamps on all three faces
    FACETS.forEach(([, a, c], i) => {
      const n = NORMALS[i], ctr = v3(a).add(v3(c)).add(v3(APEX)).multiplyScalar(1 / 3);
      const sh = (p, k) => v3(p).sub(ctr).multiplyScalar(k).add(ctr).addScaledVector(n, 0.004).toArray();
      bar(b, 'chest', 'paint', sh(a, 0.72), sh(APEX, 0.6), 0.012, 0.01); bar(b, 'chest', 'paint', sh(c, 0.72), sh(APEX, 0.6), 0.012, 0.01);
      bar(b, 'chest', 'trim', sh(a, 0.8), sh(c, 0.8), 0.01, 0.01);
      b.add(triSlab(b, a, c, APEX, n, 0.014, 0.58, 0.0), 'chest', 'paint');
      if (!far) for (let j = 1; j < 5; j++) for (const p of [a, c]) b.add(b.cyl(0.009, 0.009, 0.01, 8), 'chest', 'glow', v3(p).lerp(v3(APEX), j / 5).sub(ctr).multiplyScalar(0.84).add(ctr).addScaledVector(n, 0.004).toArray(), [Math.asin(-n.y) + PI / 2, Math.atan2(n.x, n.z), 0]);
    });
  } else {
    // naked core column + three floating facets
    b.add(pyramid(b, R * 0.6, TOP - 0.03, APEX[1] + 0.12), 'chest', 'metal', [0, 0, 0]);
    b.add(crystal(b), 'chest', 'glow', [0, -0.08, 0], [0, PI / 6, 0], [0.13, 0.22, 0.13]);
    for (let i = 0; i < 4; i++) b.add(b.tor(0.15 - i * 0.03, 0.01, 20, 4), 'chest', i % 2 ? 'trim' : 'metal', [0, 0.1 - i * 0.12, 0], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(crystal(b), 'chest', 'eye', [Math.cos(a) * 0.12, -0.02 + (i % 2) * 0.08, Math.sin(a) * 0.12], [0, -a, 0.3], [0.015, 0.03, 0.015]); }
    FACETS.forEach(([bone, a, c], i) => {
      const n = NORMALS[i];
      b.add(triSlab(b, a, c, APEX, n, 0.045, 0.94, 0.0), bone, 'accent');
      b.add(triSlab(b, a, c, APEX, n, 0.02, 0.9, -0.022), bone, 'paint');
      b.add(triSlab(b, a, c, APEX, n, 0.012, 0.56, 0.045), bone, 'paint');
      // raised hardlight frame round the inlay, a crystal spur at each outer corner, rivet row along the top edge
      const cF = v3(a).add(v3(c)).add(v3(APEX)).multiplyScalar(1 / 3);
      const sf = (p, k, o) => v3(p).sub(cF).multiplyScalar(k).add(cF).addScaledVector(n, o).toArray();
      bar(b, bone, 'trim', sf(a, 0.66, 0.06), sf(c, 0.66, 0.06), 0.014); bar(b, bone, 'trim', sf(c, 0.66, 0.06), sf(APEX, 0.66, 0.06), 0.014); bar(b, bone, 'trim', sf(APEX, 0.66, 0.06), sf(a, 0.66, 0.06), 0.014);
      b.add(triSlab(b, a, c, APEX, n, 0.008, 0.36, 0.058), bone, 'accent');
      if (!far) {
        for (const p of [a, c]) b.add(crystal(b), bone, i % 2 ? 'trim' : 'glow', sf(p, 1.04, 0.03), [Math.asin(-n.y), Math.atan2(n.x, n.z), 0.6], [0.022, 0.06, 0.022]);
        for (let j = 1; j < 8; j++) b.add(b.cyl(0.008, 0.008, 0.012, 8), bone, 'metal', v3(sf(a, 0.9, 0.05)).lerp(v3(sf(c, 0.9, 0.05)), j / 8).toArray(), [Math.asin(-n.y) + PI / 2, Math.atan2(n.x, n.z), 0]);
      }
      const ctr = v3(a).add(v3(c)).add(v3(APEX)).multiplyScalar(1 / 3);
      if (!far) for (const p of [a, c, APEX]) {
        const q = v3(p).sub(ctr).multiplyScalar(0.86).add(ctr).addScaledVector(n, 0.05);
        b.add(b.cbox(0.05, 0.05, 0.03, 0.01), bone, 'metal', q.toArray(), [Math.asin(-n.y), Math.atan2(n.x, n.z), 0]);
      }
      if (!far) for (let j = 1; j < 5; j++) for (const p of [a, c]) {
        const q = v3(p).lerp(v3(APEX), j / 5).sub(ctr).multiplyScalar(0.8).add(ctr).addScaledVector(n, 0.048);
        b.add(b.cyl(0.009, 0.009, 0.01, 8), bone, 'glow', q.toArray(), [Math.asin(-n.y) + PI / 2, Math.atan2(n.x, n.z), 0]);
      }
      // violet frame along the two long edges + cyan top edge
      const sh = (p, k = 0.94) => { const ctr = v3(a).add(v3(c)).add(v3(APEX)).multiplyScalar(1 / 3); return v3(p).sub(ctr).multiplyScalar(k).add(ctr).addScaledVector(n, 0.05).toArray(); };
      bar(b, bone, 'paint', sh(a, 0.9), sh(APEX, 0.86), 0.022, 0.022);
      bar(b, bone, 'paint', sh(c, 0.9), sh(APEX, 0.86), 0.022, 0.022);
      bar(b, bone, 'trim', sh(a, 0.9), sh(c, 0.9), 0.016, 0.016);
      if (r >= 2) bar(b, bone, 'glow', sh(a, 0.82), sh(c, 0.82), 0.008, 0.008);
      // R3: rainbow caustic strips (violet / cyan / pink) slanting across the facet
      if (rk >= 3 && !far) ['glow', 'trim', 'eye'].forEach((slot, j) => {
        const p0 = v3(sh(a, 0.7)).lerp(v3(sh(c, 0.7)), 0.25 + j * 0.2), p1 = v3(sh(APEX, 0.55)).lerp(v3(sh(c, 0.55)), 0.15 + j * 0.15);
        bar(b, bone, slot, p0.addScaledVector(n, 0.004).toArray(), p1.addScaledVector(n, 0.004).toArray(), 0.007, 0.004);
      });
    });
  }
  // front core (on the front facet when split): faceted crystal in a chrome bezel, a pink inner spark
  const coreBone = split ? 'aux3' : 'chest', cp = ctrF.clone().addScaledVector(fc, split ? 0.06 : 0.02).add(new THREE.Vector3(0, 0.03, 0));
  cp.addScaledVector(fc, 0.012);
  b.add(b.tor(0.11, 0.018, 24, 5), coreBone, 'metal', cp.toArray(), [PI / 2 - 0.35, 0, 0]);
  b.add(b.tor(0.13, 0.006, 24, 3), coreBone, 'glow', cp.toArray(), [PI / 2 - 0.35, 0, 0]);
  b.add(crystal(b), coreBone, 'glow', cp.clone().addScaledVector(fc, 0.03).toArray(), [-0.35, 0, 0], [0.085, 0.13, 0.07]);
  b.add(crystal(b), coreBone, 'eye', cp.clone().addScaledVector(fc, 0.08).toArray(), [-0.35, 0, 0], [0.03, 0.045, 0.03]);
  // core cage: a second tilted ring, six satellite chips and a back plate
  b.add(b.tor(0.095, 0.008, 28, 4), coreBone, 'trim', cp.clone().addScaledVector(fc, 0.03).toArray(), [PI / 2 - 0.35, 0.5, 0.4]);
  b.add(b.cyl(0.12, 0.12, 0.012, 6), coreBone, 'metal', cp.clone().addScaledVector(fc, -0.004).toArray(), [PI / 2 - 0.35, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(crystal(b), coreBone, i % 2 ? 'eye' : 'glow', cp.clone().add(new THREE.Vector3(Math.cos(a) * 0.17, Math.sin(a) * 0.17 * 0.94, Math.sin(a) * 0.17 * 0.34)).addScaledVector(fc, 0.03).toArray(), [-0.35, 0, a - PI / 2], [0.014, 0.035, 0.014]); }
  if (!far) for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4;
    const q = cp.clone().add(new THREE.Vector3(Math.cos(a) * 0.14, Math.sin(a) * 0.14 * Math.cos(0.35), Math.sin(a) * 0.14 * Math.sin(0.35))).addScaledVector(fc, 0.01);
    b.add(b.cbox(0.012, 0.03, 0.012, 0.003), coreBone, 'trim', q.toArray(), [-0.35, 0, a - PI / 2]);
  }
  // top face: violet triangular inlay, cyan hardlight outline, three corner lamps (what the battle camera sees most)
  const tri = (k, y) => [VB, VL, VR].map((p) => [p[0] * k, y, p[2] * k]);
  if (rk >= 1) {
    const [p0, p1, p2] = tri(0.66, TOP + 0.012);
    b.add(triSlab(b, p0, p1, p2, new THREE.Vector3(0, 1, 0), 0.02, 1), 'chest', 'paint');
  }
  const [t0, t1, t2] = tri(0.93, TOP + 0.01);
  bar(b, 'chest', 'trim', t0, t1, 0.018); bar(b, 'chest', 'trim', t1, t2, 0.018); bar(b, 'chest', 'trim', t2, t0, 0.018);
  if (!far) for (const p of tri(0.93, TOP + 0.02)) lamp(b, 'chest', p, [0, 0, 0], 0.016, 'glow');
  b.add(b.cyl(0.07, 0.09, 0.05, 6), 'chest', 'metal', [0, TOP + 0.03, -0.02]);
  if (!far) for (const [x, z, ry] of [[0.13, 0.06, -PI / 6], [-0.13, 0.06, PI / 6], [0, -0.17, 0]]) {
    b.add(b.cbox(0.11, 0.02, 0.05, 0.006), 'chest', 'metal', [x, TOP + 0.025, z], [0, ry, 0]);
    for (let j = 0; j < 3; j++) b.add(b.box(0.09, 0.006, 0.006), 'chest', 'glow', [x + Math.sin(ry) * (j - 1) * 0.014, TOP + 0.037, z + Math.cos(ry) * (j - 1) * 0.014], [0, ry, 0]);
  }
  b.add(b.tor(0.08, 0.008, 18, 3), 'chest', 'glow', [0, TOP + 0.06, -0.02], [PI / 2, 0, 0]);
  // shoulder pylons at the top corners (where the detached arms hover)
  b.sym(b.cbox(0.08, 0.06, 0.1, 0.015), 'chest', 'metal', [0.27, TOP - 0.02, 0.05]);
  b.sym(b.cyl(0.03, 0.03, 0.05, 10), 'chest', 'glow', [0.315, TOP - 0.02, 0.05], [0, 0, PI / 2]);
  b.sym(fin(b, [[0, 0], [0.06, 0], [0.12, 0.16], [0.09, 0.17]], 0.02, 0.005), 'chest', 'paint', [0.27, TOP, -0.02], [0, PI / 2 + 0.4, 0]);
  b.sym(b.cbox(0.02, 0.1, 0.02, 0.005), 'chest', 'trim', [0.3, TOP + 0.05, 0.0], [0, 0, -0.5]);
  // under the apex: a hanging crystal on a hardlight ring (pelvis)
  b.add(crystal(b), 'pelvis', 'glow', [0, -0.27, 0], [0, PI / 4, 0], [0.05, 0.13, 0.05]);
  b.add(b.tor(0.09, 0.008, 20, 3), 'pelvis', 'trim', [0, -0.22, 0], [PI / 2, 0, 0]);
  if (!far) b.add(b.tor(0.13, 0.005, 24, 3), 'pelvis', 'glow', [0, -0.3, 0], [PI / 2 + 0.3, 0, 0]);
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; b.add(crystal(b), 'pelvis', i ? 'paint' : 'trim', [Math.cos(a) * 0.06, -0.22, Math.sin(a) * 0.06], [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], [0.025, 0.07, 0.025]); }
  b.add(b.cyl(0.03, 0.05, 0.06, 6), 'pelvis', 'metal', [0, -0.15, 0]);
}

function head(b, o) {
  const rk = o.rank, y = 0.07;
  // floating diamond head: black glass octahedron, a wraparound eye band, a cyan crest shard
  b.add(facet(b.sph(4, 2)), 'head', 'accent', [0, y, 0], [0, PI / 4, 0], [0.12, 0.15, 0.12]);
  b.add(b.cbox(0.17, 0.028, 0.09, 0.01), 'head', 'eye', [0, y + 0.01, 0.045], [0, 0, 0]);
  b.add(b.cbox(0.19, 0.012, 0.1, 0.004), 'head', 'trim', [0, y + 0.04, 0.04]);
  b.add(crystal(b), 'head', rk >= 1 ? 'paint' : 'accent', [0, y + 0.19, -0.02], [0.2, PI / 4, 0], [0.03, 0.08, 0.03]);
  b.sym(fin(b, [[0, 0], [0.04, 0.02], [0.09, 0.1], [0.07, 0.11]], 0.016, 0.004), 'head', 'paint', [0.06, y + 0.03, -0.01], [0, 0.3, -0.2]);
  if (o.r >= 3) b.sym(crystal(b), 'head', 'trim', [0.1, y + 0.13, -0.03], [0, 0, -0.5], [0.022, 0.07, 0.022]);
  b.add(b.tor(0.06, 0.008, 16, 3), 'neck', 'glow', [0, 0.04, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.03, 0.045, 0.06, 6), 'neck', 'metal', [0, 0.0, 0]);
  if (!b.far) for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; b.add(crystal(b), 'head', i === 2 ? 'trim' : 'paint', [Math.sin(a) * 0.06, y + 0.13 + (i === 2 ? 0.03 : 0), -0.03 - Math.cos(a) * 0.02], [0, 0, -a * 0.8], [0.012, 0.045, 0.012]); }
  b.sym(b.cbox(0.02, 0.05, 0.05, 0.006), 'head', 'metal', [0.105, y + 0.01, 0.0]);
}

function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  // floating shoulder node (no clav geometry: the arms hang off the prism by hardlight)
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.07);
  b.sym(b.tor(0.065, 0.008, 16, 3), 'upArm', 'glow', [0, 0, 0], [0, 0, PI / 2]);
  b.sym(fin(b, [[0, 0], [0.08, 0.02], [0.15, 0.14], [0.11, 0.17], [0.02, 0.07]], 0.024, 0.006), 'upArm', 'paint', [0.02, 0.02, -0.02], [0, -0.3, -0.25]);
  // slim segmented arm: black glass sleeve over chrome, violet cuff
  b.sym(b.cyl(0.034, 0.03, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  b.sym(facet(b.cyl(0.066, 0.045, ua * 0.7, 6)), 'upArm', 'accent', [0, -ua * 0.5, 0]);
  b.sym(discX(b, 0.05, 0.1, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(facet(b.cyl(0.045, 0.072, fa * 0.75, 6)), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
  b.sym(facet(b.cyl(0.078, 0.078, 0.04, 6)), 'foreArm', 'paint', [0, -fa * 0.88, 0]);
  b.sym(facet(b.cyl(0.05, 0.07, 0.1, 6)), 'foreArm', 'paint', [0, -fa * 0.32, 0.0]);
  if (!far) b.sym(b.box(0.008, fa * 0.5, 0.008), 'foreArm', 'trim', [0.04, -fa * 0.5, 0.02]);
  for (const y of [-0.04, -ua + 0.03]) b.sym(b.tor(0.04, 0.008, 14, 4), 'upArm', 'trim', [0, y, 0], [PI / 2, 0, 0]);
  b.sym(b.cyl(0.012, 0.012, ua * 0.8, 6), 'upArm', 'paint', [0, -ua * 0.5, -0.045]);
  b.sym(b.cyl(0.06, 0.04, 0.04, 6), 'foreArm', 'metal', [0, -fa + 0.01, 0]);
  if (!far) b.sym(b.tube([[0, -0.03, -0.04], [0.03, -0.12, -0.07], [0, -fa + 0.04, -0.04]], 0.008, 8, 4), 'foreArm', 'metal');
  b.sym(fin(b, [[0, 0], [0.05, 0.01], [0.1, 0.09], [0.08, 0.1]], 0.016, 0.004), 'upArm', 'accent', [0.03, -0.01, -0.05], [0.3, -0.6, -0.5]);
  b.sym(b.tor(0.06, 0.006, 20, 4), 'hand', 'trim', [0, -0.1, 0], [PI / 2, 0, 0]);
  b.sym(b.tor(0.045, 0.005, 20, 4), 'hand', 'glow', [0, -0.16, 0], [PI / 2, 0, 0]);
  // shoulder guard: a small triangular glass plate, two forearm fins
  b.sym(triSlab(b, [0.0, 0.07, 0.09], [0.13, 0.03, 0.0], [0.0, 0.07, -0.09], new THREE.Vector3(0.3, 1, 0).normalize(), 0.025, 1), 'upArm', 'accent');
  bar(b, 'upArmL', 'paint', [0.0, 0.1, 0.09], [0.13, 0.06, 0.0], 0.014); bar(b, 'upArmR', 'paint', [0.0, 0.1, 0.09], [-0.13, 0.06, 0.0], 0.014);
  b.sym(fin(b, [[0, 0.02], [0.05, 0], [0.03, -0.18], [0, -0.2]], 0.014, 0.004), 'foreArm', 'paint', [0.06, -0.06, -0.01], [0, PI / 2, 0]);
  b.sym(fin(b, [[0, 0.02], [0.04, 0], [0.025, -0.14], [0, -0.16]], 0.012, 0.004), 'foreArm', 'accent', [0.0, -0.06, -0.065], [0, 0, 0]);
  // floating lens plates around the emitter
  if (!far) for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3 + PI / 6, c = [Math.cos(a) * 0.1, -0.15, Math.sin(a) * 0.1];
    b.sym(triSlab(b, [c[0], c[1] + 0.05, c[2]], [c[0] + Math.sin(a) * 0.03, c[1] - 0.04, c[2] - Math.cos(a) * 0.03], [c[0] - Math.sin(a) * 0.03, c[1] - 0.04, c[2] + Math.cos(a) * 0.03], new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.008, 1), 'hand', 'trim');
  }
  // refracting emitter: three claws around a long crystal
  b.sym(b.cyl(0.03, 0.02, 0.05, 8), 'hand', 'metal', [0, -0.02, 0]);
  b.sym(crystal(b), 'hand', 'glow', [0, -0.13, 0], [0, PI / 4, 0], [0.05, 0.14, 0.05]);
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3;
    b.sym(fin(b, [[0, 0], [0.018, 0], [0.008, -0.13], [0, -0.14]], 0.012, 0.003), 'hand', rk >= 3 ? 'trim' : 'paint', [Math.cos(a) * 0.035, -0.035, Math.sin(a) * 0.035], [0, -a + PI / 2, 0.15]);
  }
}

function halo(b, o) {
  const rk = o.rank, S = 'aux1', far = b.far;
  if (rk < 4) return;
  // R4: halo of shards (spins about its own axis in post)
  const n = far ? 6 : 10, Rr = 0.24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    b.add(crystal(b), S, i % 2 ? 'glow' : 'trim', [Math.cos(a) * Rr, Math.sin(a) * Rr, 0], [0, 0, a - PI / 2], [0.018, 0.06, 0.018]);
  }
  b.add(b.tor(Rr, 0.004, 40, 3), S, 'glow', [0, 0, 0]);
  if (rk >= 5) {
    // crown: hardlight triangle frame above + an outer shard ring
    const T = [0, 1, 2].map((i) => { const a = PI / 2 + i * 2 * PI / 3; return [Math.cos(a) * 0.36, Math.sin(a) * 0.36 + 0.06, 0]; });
    for (let i = 0; i < 3; i++) bar(b, S, 'glow', T[i], T[(i + 1) % 3], 0.014, 0.014);
    for (const p of T) b.add(crystal(b), S, 'trim', p, [0, 0, 0], [0.03, 0.05, 0.03]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + 0.3; b.add(crystal(b), S, 'eye', [Math.cos(a) * 0.44, Math.sin(a) * 0.44, -0.02], [0, 0, a - PI / 2], [0.015, 0.045, 0.015]); }
  }
}

function build(b, o) {
  body(b, o);
  head(b, o);
  arms(b, o);
  halo(b, o);
}

// ---------- anims ----------
function base(P, ctx, t) {
  L.hoverIdle(P, ctx, t);
  L.A(P, 'pelvis', -0.04, 0, 0);
  L.A(P, 'chest', 0, 0.12 * Math.sin(t * 0.45), 0);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.9, br = Math.sin(t * 1.2 + ph);
    L.RS(P, 'clav', s, 0, 0, 0);
    L.RS(P, 'upArm', s, -0.3 + br * 0.06, -0.2, 0.55 + br * 0.05);
    L.RS(P, 'foreArm', s, -0.75 + Math.sin(t * 1.5 + ph) * 0.08, 0.2, 0);
    L.RS(P, 'hand', s, 0.1, 0, -0.1);
  }
}
const _ik = new THREE.Vector3();
function aimHands(P, ctx, k, spread = 0.14, z = 0.55, y = 1.08) {
  const P0 = P.slice();
  L.armIK(P, ctx, 'L', _ik.set(spread, y, z), 0.5);
  L.armIK(P, ctx, 'R', _ik.set(-spread, y, z), 0.5);
  for (const s of SIDES) L.RS(P, 'hand', s, -1.2, 0, 0);
  for (let i = 0; i < P.length; i++) P[i] = L.lerp(P0[i], P[i], k);
}
const OD_F = [0.24, 0.36, 0.48, 0.6];

const anims = {
  idle(P, t, ctx) { base(P, ctx, t); },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.2, 0, 0); L.A(P, 'chest', 0.08, 0, 0);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.4, 0, -0.1);
  },
  // PRISM BOLT: the emitters swing in to frame the core, facets open, the core fires (0.42), recoil
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]), kick = L.kf(u, [[0, 0], [0.4, 0], [0.44, 1], [0.7, 0]]);
    aimHands(P, ctx, k, 0.15 + 0.05 * kick, 0.5 - 0.06 * kick);
    P[L.PX + 2] -= 0.1 * kick; P[L.PX + 1] += 0.04 * k;
    L.A(P, 'chest', -0.12 * kick + 0.05 * k, 0, 0); L.A(P, 'pelvis', -0.08 * kick, 0, 0);
  },
  // spin-shot: the body spins a full turn (facets fan out), fires coming round (0.55)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]), spin = L.kf(u, [[0.1, 0], [0.55, 1]]), kick = L.kf(u, [[0.53, 0], [0.57, 1], [0.8, 0]]);
    P[L.PX + 1] += 0.1 * k; P[L.PX + 2] -= 0.08 * kick;
    L.A(P, 'spine', 0, spin * PI * 2, 0);
    for (const s of SIDES) L.RS(P, 'upArm', s, L.lerp(-0.3, -0.9, kick), -0.2, L.lerp(0.55, 1.3, k * (1 - kick))), L.RS(P, 'foreArm', s, L.lerp(-0.75, -0.2, k), 0, 0);
    L.A(P, 'chest', -0.1 * kick, 0, 0);
  },
  // arms raised in a V, facets lift, the core pulses (cast 0.5)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.4, 1], [0.65, 1], [1, 0]]);
    P[L.PX + 1] += 0.14 * k;
    L.A(P, 'chest', -0.1 * k, 0, 0);
    for (const s of SIDES) L.RS(P, 'upArm', s, L.lerp(-0.3, -0.6, k), -0.2, L.lerp(0.55, 2.3, k)), L.RS(P, 'foreArm', s, L.lerp(-0.75, -0.3, k), 0, 0);
  },
  // REFRACTION BEAM: rises, splits wide, spins, fires four refracted beams (0.24..0.6), reassembles
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const rise = L.kf(u, [[0, 0], [0.18, 1], [0.8, 1], [1, 0]]), wide = L.kf(u, [[0, 0], [0.16, 1], [0.75, 1], [0.92, 0]]);
    const spin = L.kf(u, [[0.18, 0], [0.7, 1]]);
    P[L.PX + 1] += 0.45 * rise;
    L.A(P, 'spine', -0.1 * wide, spin * PI * 4, 0); L.A(P, 'chest', -0.15 * wide, 0, 0); L.A(P, 'head', -0.25 * wide, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.3, -0.15, wide), 0, L.lerp(0.55, 1.5, wide));
      L.RS(P, 'foreArm', s, L.lerp(-0.75, -0.05, wide), 0, 0);
      L.RS(P, 'hand', s, 0, 0, 0.4 * wide);
    }
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.3 * k, 0, 0.2 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'chest', -0.1 * k, 0.3 * k * d, 0); L.A(P, 'head', -0.3 * k, 0, 0.3 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.3 * k, 0, 0.3 * k);
  },
  // the light goes out: flickers, the facets fall away (tick), the column tips over onto its point
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u));
    const g = 0.2 - ctx.D.pelvisY;
    const drop = L.kf(u, [[0, 0], [0.2, 0.08], [0.55, g + 0.12], [0.62, g + 0.2], [0.7, g + 0.14], [1, g + 0.14]]);
    P[L.PX + 1] = drop;
    L.A(P, 'pelvis', L.kf(u, [[0, 0], [0.55, 0.1], [1, 1.25]]), L.kf(u, [[0, 0], [1, 0.5]]), L.kf(u, [[0, 0], [0.6, 0.2], [1, 0.3]]));
    L.A(P, 'head', L.kf(u, [[0, 0], [0.6, 0.6], [1, 0.9]]), 0, 0);
    for (const s of SIDES) L.RS(P, 'upArm', s, L.lerp(-0.3, 0.2, L.smooth(u)), 0, L.lerp(0.55, 0.15, L.smooth(u))), L.RS(P, 'foreArm', s, -0.1, 0, 0);
  },
  // slow rising spin with both emitters raised, facets orbiting
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += (0.2 + 0.05 * Math.sin(t * 2)) * k;
    L.A(P, 'spine', 0, t * 1.2 * k, 0); L.A(P, 'head', -0.2 * k, 0, 0);
    for (const s of SIDES) L.RS(P, 'upArm', s, L.lerp(-0.3, -0.5, k), 0, L.lerp(0.55, 2.4, k)), L.RS(P, 'foreArm', s, L.lerp(-0.75, -0.2, k), 0, 0);
  },
  // the facets fly in and lock round the core (land 0.4), arms unfold, the core lights (ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const fold = L.kf(u, [[0, 1], [0.45, 1], [0.8, 0], [1, 0]]);
    L.A(P, 'spine', 0, (1 - L.kf(u, [[0, 0], [0.45, 1]])) * PI, 0);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.2 * fold, 0, -0.45 * fold), L.AS(P, 'foreArm', s, -0.9 * fold, 0, 0);
  },
};

// facet push-out (m) and yaw (rad) per action
function facetState(name, u, t) {
  switch (name) {
    case 'attack': return [kf(u, [[0, 0], [0.3, 0.06], [0.44, 0.13], [0.7, 0.03], [1, 0]]), 0];
    case 'attack_alt': return [kf(u, [[0, 0], [0.3, 0.12], [0.6, 0.12], [1, 0]]), -kf(u, [[0.1, 0], [0.6, 1]]) * PI * 2];
    case 'cast': return [kf(u, [[0, 0], [0.5, 0.1], [1, 0]]), kf(u, [[0, 0], [1, 1]]) * PI * 2];
    case 'overdrive': return [kf(u, [[0, 0], [0.16, 0.32], [0.75, 0.3], [0.92, 0]]), -kf(u, [[0.1, 0], [0.75, 1]]) * PI * 6];
    case 'hit': return [kf(u, [[0, 0], [0.08, 0.1], [0.5, 0]]), 0];
    case 'deploy': return [kf(u, [[0, 1.4], [0.4, 0], [1, 0]]), -kf(u, [[0, 0], [0.42, 1]]) * PI * 2];
    case 'die': return [kf(u, [[0, 0], [0.3, 0.06], [0.6, 0.35], [1, 0.45]]), kf(u, [[0, 0], [0.5, 0.6]])];
    default: return [0, 0];
  }
}
const _o = new THREE.Vector3();
const FB = FACETS.map(([n]) => BI[n]);

export default {
  id: 'prism', name: 'PRISM', role: 'archer', faction: 'experimental', rarity: 'rare', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.62, radius: 0.55, walkSpeed: 1.1, scheme: 'bold',
  style: { weapon: 'orbs' },
  paint: { experimental: { paint: 0x6a2ee0, accent: 0x07060c, trim: 0xa6f2ff, glow: 0xb24dff, eye: 0xffc8f6 } },
  mats: {
    all: {
      accent: { rough: 0.08, metal: 0.65, env: 1.25, coat: 1, coatRough: 0.03, panel: { groove: 0.12, scale: 3 }, detail: { map: 'scratch', scale: 2, albedo: 0.2, rough: 0.5 } },
      paint: { rough: 0.22, coat: 1, panel: { groove: 0.2 } },
      metal: { color: 0x7d8494, metal: 0.95, rough: 0.2, panel: { groove: 0.08, scale: 9 } },
    },
    experimental: { trim: { emissive: 0x2fb8ff, ei: 0.9, metal: 0.3, rough: 0.2 } },
  },
  sockets: { muzzle: ['chest', [0, -0.06, 0.26]], core: [0, -0.05, 0.2], head: [0, 0.08, 0.07], hand: ['handR', [0, -0.18, 0]], handL: ['handL', [0, -0.18, 0]] },
  events: {
    attack: [['fire', 0.42]], attack_alt: [['fire', 0.55]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.05], ...OD_F.map((u) => ['fire', u])], die: [['down', 0.6]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 1.0, attack_alt: 1.2, cast: 1.1, overdrive: 2.5, hit: 0.42, die: 1.9, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    const name = act ? act.name : null, u = act ? Math.min(1, act.t / act.dur) : 0, t = ctx.t;
    let [push, yaw] = name ? facetState(name, u, t) : [0, 0];
    // idle: every ~6.5 s the facets turn a third of a revolution around the core
    if (!name) yaw += kf(t % 6.5, [[0, 0], [4.4, 0], [5.8, 1]]) * PI * 2 + Math.sin(t * 0.8) * 0.06;
    if (!name && ctx.lastLoop === 'victory') yaw += t * 2.4;
    ctx.fPush = push + 0.05 + 0.015 * Math.sin(t * 1.6); ctx.fYaw = yaw;
    for (const i of FB) P[i * 3 + 1] = yaw;
    // halo spins in its own plane
    P[BI.aux1 * 3 + 2] = t * 0.7 * (name === 'overdrive' ? 4 : 1);
  },
  tick(unit, dt, ctx, bones) {
    ctx.lastLoop = unit.state.loop;
    if (!ctx.rest) ctx.rest = FB.map((i) => bones[i].position.clone());
    const c = Math.cos(ctx.fYaw || 0), s = Math.sin(ctx.fYaw || 0), dead = unit.state.action === 'die' || unit.state.dead;
    FB.forEach((bi, i) => {
      const n = NORMALS[i];
      _o.set(n.x * c + n.z * s, n.y, -n.x * s + n.z * c).multiplyScalar(ctx.fPush || 0);
      if (dead) _o.y -= (ctx.fPush || 0) * 1.4;
      bones[bi].position.copy(ctx.rest[i]).add(_o);
    });
  },
  fxHints: { projectile: 'spectrum_beam', impact: 'refraction', overdrive: 'refraction_beam', color: 0xb24dff },
  build,
};
