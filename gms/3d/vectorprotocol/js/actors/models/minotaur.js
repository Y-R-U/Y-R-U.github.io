// MINOTAUR, Labyrinth Brute (D21 fantasy, horde, epic tank, XL brute). sculptor-17.
// Hunched bull-headed brute: layered muscle masses, shaggy mane over the hump, goat-furred thighs on iron-shod hooves,
// curved horns, chained nose ring, a broken manacle on the left wrist and a huge double-bitted labrys in the right hand.
// Slots: paint = hide/fur, accent = leather + loincloth + war paint, metal = iron (axe, ring, chains, hooves), trim = horn/bone,
// glow = rage embers, eye = eyes. Jaw rides aux1 (on the head), tail rides aux0 (re-parented to the pelvis).
import { THREE, pod, fin, deform, PI } from '../kit.js';

export const MINO_DIMS = {
  thigh: 0.5, shin: 0.52, ankle: 0.16, hipX: 0.19, hipY: -0.06, spine: 0.18, chest: 0.32, neck: 0.22, headOff: 0.06,
  clavX: 0.14, clavY: 0.2, shoulder: 0.3, upArm: 0.44, foreArm: 0.42,
  offsets: { neck: [0, 0.22, 0.1], head: [0, 0.06, 0.1] },
  parents: { aux0: 'pelvis' }, aux0: [0, 0.02, -0.24], aux1: [0, -0.08, 0.12],
};
// axe hold frame on handR: model the labrys standing up (+Y) as if the forearm pointed forward (MODEL_GUIDE hold-frame trick)
const GRIP = [0, -0.1, 0.02], HOLD = [1.55, 0, 0];
const HAFT = [-0.5, 1.05];   // haft extent along +Y in the hold frame; the head sits at the top
const AXE_Y = 0.9;           // labrys head centre on the haft

// ---------- helpers ----------
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
function orient(dir, ref) {
  const y = dir.clone().normalize();
  let z = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y)));
  if (z.lengthSq() < 1e-6) z = V(1, 0, 0).cross(y);
  z.normalize();
  _m.makeBasis(V(0, 0, 0).crossVectors(y, z), y, z);
  _e.setFromRotationMatrix(_m, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
function tuftGeo(len, w, bend = 0.3, t = 0.34) {
  const ring = (y, k, z) => [[w * k, y, z], [0, y, z + t * w * k], [-w * k, y, z], [0, y, z - t * w * k]];
  const p = [...ring(0, 1, 0), ...ring(len * 0.5, 0.7, bend * len * 0.28), [0, len, bend * len]].flat(), idx = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, 4 + i, j, j, 4 + i, 4 + j, 4 + i, 8, 4 + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// lumpy smooth ellipsoid
function blob(b, r, amp = 0.04, seed = 1, ws = 16, hs = 12) {
  const g = b.sph(ws, hs), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 1 + amp * (Math.sin(x * 4.1 + seed) * Math.sin(y * 3.3 + seed * 1.7) + 0.5 * Math.sin(z * 5.7 + x * 2.3 + seed * 0.3));
    P.setXYZ(i, x * k * r[0], y * k * r[1], z * k * r[2]);
  }
  g.computeVertexNormals();
  return g;
}
// tapered tube along a Catmull-Rom curve (horns, tail), radius r0 -> r1, closed tip
function taper(b, pts, r0, r1, seg = 16, rs = 8) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
  const n = b.n(seg), m = b.n(rs), fr = c.computeFrenetFrames(n, false), pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = c.getPointAt(u), rad = r0 + (r1 - r0) * Math.pow(u, 0.9);
    for (let j = 0; j < m; j++) {
      const a = (j / m) * PI * 2, N = fr.normals[i], B = fr.binormals[i];
      pos.push(p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * rad, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * rad, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * rad);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * m + j, b2 = i * m + (j + 1) % m; idx.push(a, a + m, b2, b2, a + m, b2 + m); }
  const e = c.getPointAt(1), s = c.getPointAt(0);
  pos.push(e.x, e.y, e.z, s.x, s.y, s.z);
  const tip = (n + 1) * m, root = tip + 1;
  for (let j = 0; j < m; j++) { idx.push(n * m + j, n * m + (j + 1) % m, tip); idx.push(j, root, (j + 1) % m); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// hide detail: short fur strokes + mottling
function hideTex(g, w, h, r) {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, R = 15 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, R), v = r() < 0.5 ? 80 : 175;
    gr.addColorStop(0, `rgba(${v},${v},${v},0.3)`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, L = 4 + r() * 10, a = PI / 2 + (r() - 0.5) * 0.8, v = r() < 0.45 ? 170 + r() * 60 : 50 + r() * 40;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.2 + r() * 0.3})`; g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
}

const PAINT = {
  horde: { paint: 0x3b3534, accent: 0x40100c, trim: 0xd8c8a0 },
  order: { paint: 0x4c4f58, accent: 0x1f3a7a, trim: 0xd8d0bc },
  wild: { paint: 0x4f4636, accent: 0x2e5e28, trim: 0xc9b994 },
  legendary: { paint: 0x3a322e, accent: 0x40100c, trim: 0xf0b040 },
  corporate: { paint: 0x434a55, accent: 0x1d3f80, trim: 0xcdbb94 },
  rogue: { paint: 0x4a3f39, accent: 0x7a1d18, trim: 0xcdbb94 },
  experimental: { paint: 0x463f52, accent: 0x4a2a8a, trim: 0xcdbb94 },
};
const HIDE = { map: hideTex, scale: 2.4, albedo: 0.7, rough: 0.3, scratch: 0.15 };

function build(b, o) {
  const r = o.rank, far = b.far, D = b.rig.D, rnd = rng(31 + r);
  const sk = far ? 0.45 : 1;
  // shaggy fur over a bone-local ellipsoid: { c, r, n, len, flow, lift, keep, slot }
  function fur(bone, f, symm = false) {
    const n = Math.max(1, Math.round(f.n * sk)), flow = V(...f.flow).normalize();
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 40) {
      const d = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1), l2 = d.lengthSq();
      if (l2 > 1 || l2 < 0.01) continue;
      d.normalize();
      if (symm && d.x < 0) d.x = -d.x;
      if (f.keep && !f.keep(d)) continue;
      const nrm = V(d.x / f.r[0], d.y / f.r[1], d.z / f.r[2]).normalize();
      const p = V(f.c[0] + d.x * f.r[0], f.c[1] + d.y * f.r[1], f.c[2] + d.z * f.r[2]).addScaledVector(nrm, -0.02);
      const lift = f.lift ?? 0.35, L = f.len[0] + (f.len[1] - f.len[0]) * rnd();
      const dir = nrm.clone().multiplyScalar(lift).addScaledVector(flow, 1 - lift).normalize();
      const g = tuftGeo(L, 0.46 * L, 0.28, 0.34), rot = orient(dir, nrm.clone().negate()), slot = f.slot || 'paint';
      if (symm) b.sym(g, bone, slot, [p.x, p.y, p.z], rot); else b.add(g, bone, slot, [p.x, p.y, p.z], rot);
      placed++;
    }
  }

  // ---- torso: pelvis, belly, massive ribcage, pecs, lats, the hump ----
  b.add(blob(b, [0.27, 0.2, 0.21], 0.04, 1), 'pelvis', 'paint', [0, -0.02, 0]);
  b.sym(blob(b, [0.13, 0.15, 0.13], 0.04, 2, 12, 10), 'pelvis', 'paint', [0.1, -0.06, -0.1]);                   // glutes
  b.add(blob(b, [0.25, 0.22, 0.2], 0.04, 3), 'spine', 'paint', [0, 0.04, 0.02]);
  for (let i = 0; i < 3; i++) b.sym(blob(b, [0.06, 0.05, 0.03], 0.03, 4 + i, 10, 8), 'spine', 'paint', [0.06, 0.13 - i * 0.1, 0.19 - i * 0.005]);   // abs
  b.add(blob(b, [0.36, 0.3, 0.26], 0.04, 7), 'chest', 'paint', [0, 0.02, 0.0]);
  b.sym(blob(b, [0.17, 0.13, 0.1], 0.04, 8, 14, 10), 'chest', 'paint', [0.14, 0.08, 0.2], [0.1, 0.25, 0.1]);      // pecs
  b.sym(blob(b, [0.12, 0.22, 0.14], 0.04, 9, 12, 10), 'chest', 'paint', [0.27, -0.04, -0.04], [0, 0, 0.2]);       // lats
  b.add(blob(b, [0.32, 0.2, 0.26], 0.05, 10), 'chest', 'paint', [0, 0.22, -0.06]);                                  // trapezius hump
  // ---- neck + bull head ----
  b.add(blob(b, [0.2, 0.2, 0.21], 0.05, 11), 'neck', 'paint', [0, 0.0, 0.0]);
  b.add(blob(b, [0.15, 0.14, 0.16], 0.03, 12, 16, 12), 'head', 'paint', [0, 0.08, -0.01]);                        // cranium
  b.add(pod(b, 0, -0.26, [0.12, 0.125, 0.115, 0.1], 14), 'head', 'paint', [0, 0.04, 0.08], [-PI / 2 + 0.45, 0, 0], [1, 1, 0.82]);   // muzzle
  b.add(blob(b, [0.105, 0.075, 0.065], 0.03, 13, 14, 10), 'head', 'metal', [0, -0.075, 0.31]);                    // wet dark nose pad
  b.sym(b.sph(8, 6), 'head', 'metal', [0.045, -0.06, 0.37], [0, 0, 0], [0.022, 0.016, 0.01]);                      // nostrils
  b.sym(blob(b, [0.075, 0.032, 0.06], 0.05, 14, 10, 8), 'head', 'paint', [0.075, 0.15, 0.12], [0.15, 0.3, -0.35]); // heavy brow
  b.sym(b.sph(10, 8), 'head', 'eye', [0.088, 0.105, 0.135], [0, 0.5, -0.3], [0.026, 0.013, 0.016]);
  b.sym(deform(fin(b, [[0, -0.04], [0.16, -0.02], [0.18, 0.02], [0, 0.04]], 0.03, 0.01), (v) => { v.z += v.x * v.x * 0.8; }), 'head', 'paint', [0.13, 0.1, -0.05], [0, -0.3, -0.35]);   // ears
  // horns: thick, out-up-forward. R0 has a broken right horn, R4+ bigger with iron rings
  const hk = r >= 4 ? 1.18 : 1;
  const horn = [[0, 0, 0], [0.16, 0.03, -0.03], [0.28 * hk, 0.14 * hk, -0.02], [0.32 * hk, 0.3 * hk, 0.06], [0.27 * hk, 0.42 * hk, 0.17 * hk]];
  b.add(taper(b, horn, 0.065, 0.008, 16, 9), 'head', 'trim', [0.1, 0.17, 0.0]);
  b.add(taper(b, r === 0 ? horn.slice(0, 3).map((p, i) => (i === 2 ? [p[0] * 0.75, p[1] * 0.6, p[2]] : p)) : horn, 0.065, r === 0 ? 0.035 : 0.008, r === 0 ? 8 : 16, 9).scale(-1, 1, 1), 'head', 'trim', [-0.1, 0.17, 0.0]);
  if (r >= 4) for (const s of [1, -1]) b.add(b.tor(0.05, 0.012, 14, 5), 'head', 'metal', [s * 0.21, 0.2, -0.02], [0, PI / 2 + s * 0.3, 0]);
  // jaw (aux1): lower jaw, teeth, beard
  b.add(pod(b, 0, -0.22, [0.09, 0.085, 0.07, 0.05], 12), 'aux1', 'paint', [0, -0.01, -0.02], [-PI / 2 + 0.25, 0, 0], [1, 1, 0.55]);
  b.add(b.box(0.09, 0.012, 0.13), 'aux1', 'glow', [0, 0.02, 0.08]);
  if (!far) for (const x of [-0.04, 0.04]) b.add(b.cyl(0, 0.012, 0.035, 5), 'aux1', 'trim', [x, 0.03, 0.15]);
  for (let i = 0; i < (far ? 3 : 7); i++) {
    const a = (i / 6 - 0.5) * 1.2;
    b.add(tuftGeo(0.14 + 0.04 * Math.cos(a * 2), 0.05, 0.3), 'aux1', 'paint', [Math.sin(a) * 0.05, -0.04, 0.1 - Math.abs(a) * 0.04], orient(V(Math.sin(a) * 0.3, -1, 0.15), V(0, 0, -1)));
  }
  // nose ring + hanging chain (iron); the chain is what the Novaline handlers hold (STORY m7)
  b.add(b.tor(0.055, 0.013, 16, 6), 'head', 'metal', [0, -0.15, 0.35], [0.25, 0, 0]);
  for (let i = 0; i < (far ? 2 : 5); i++) b.add(b.tor(0.026, 0.008, 10, 4), 'head', 'metal', [0, -0.22 - i * 0.045, 0.34 - i * 0.012], [0.2, i % 2 ? PI / 2 : 0, 0]);

  // ---- mane over the hump, shoulders and neck ----
  fur('chest', { c: [0, 0.24, -0.06], r: [0.32, 0.2, 0.26], n: 70, len: [0.14, 0.24], flow: [0, -0.3, -1], lift: 0.42, keep: (d) => d.y > -0.1 });
  fur('neck', { c: [0, 0.0, 0.0], r: [0.2, 0.2, 0.21], n: 44, len: [0.14, 0.22], flow: [0, -0.5, -1], lift: 0.4, keep: (d) => d.z < 0.4 });
  fur('chest', { c: [0, 0.06, 0.2], r: [0.16, 0.16, 0.1], n: 10, len: [0.07, 0.11], flow: [0, -1, 0.2], lift: 0.25, keep: (d) => d.z > 0.3 && Math.abs(d.x) < 0.5 });   // chest tuft
  fur('head', { c: [0, 0.14, -0.02], r: [0.14, 0.1, 0.14], n: 16, len: [0.08, 0.14], flow: [0, 0.4, 0.6], lift: 0.5, keep: (d) => d.y > 0.3 });                     // forelock

  // ---- arms: deltoid, biceps/triceps, forearm, fists ----
  b.sym(blob(b, [0.17, 0.16, 0.18], 0.05, 15), 'upArm', 'paint', [-0.02, -0.03, 0]);
  b.sym(blob(b, [0.12, 0.2, 0.12], 0.04, 16, 12, 10), 'upArm', 'paint', [0.0, -0.22, 0.04]);
  b.sym(blob(b, [0.11, 0.19, 0.1], 0.04, 17, 12, 10), 'upArm', 'paint', [0.0, -0.2, -0.05]);
  b.sym(blob(b, [0.12, 0.08, 0.11], 0.04, 18, 10, 8), 'foreArm', 'paint', [0, -0.01, 0]);
  b.sym(pod(b, 0.0, -D.foreArm, [0.12, 0.125, 0.1, 0.085, 0.075], 12), 'foreArm', 'paint');
  b.sym(blob(b, [0.095, 0.105, 0.105], 0.04, 19, 12, 10), 'hand', 'paint', [0, -0.09, 0.02]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(blob(b, [0.022, 0.03, 0.028], 0.02, 20 + i, 8, 6), 'hand', 'paint', [-0.06 + i * 0.04, -0.17, 0.07]);
  // left: broken manacle + dangling chain; right: leather bracer
  b.add(b.tor(0.11, 0.022, 18, 6), 'foreArmL', 'metal', [0, -0.33, 0], [PI / 2, 0, 0], [1, 1, 1.4]);
  for (let i = 0; i < (far ? 2 : 5); i++) b.add(b.tor(0.028, 0.009, 10, 4), 'foreArmL', 'metal', [0.1, -0.36 - i * 0.05, 0.02], [0, i % 2 ? PI / 2 : 0, 0]);
  b.add(b.cyl(0.11, 0.1, 0.16, 14, true), 'foreArmR', 'accent', [0, -0.3, 0], [0, 0, 0], [1, 1, 1.05]);
  b.add(b.tor(0.107, 0.012, 16, 4), 'foreArmR', 'metal', [0, -0.23, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.1, 0.012, 16, 4), 'foreArmR', 'metal', [0, -0.37, 0], [PI / 2, 0, 0]);

  // ---- hips: belt, loincloth, tail ----
  b.add(b.tor(0.27, 0.035, 26, 6), 'pelvis', 'accent', [0, 0.05, 0.01], [PI / 2, 0, 0], [1, 0.82, 1]);
  b.add(b.cbox(0.13, 0.11, 0.04, 0.012), 'pelvis', 'metal', [0, 0.05, 0.235]);
  b.add(deform(b.ext([[-0.19, 0], [0.19, 0], [0.15, -0.5], [0.05, -0.56], [-0.06, -0.52], [-0.16, -0.48]], 0.025, 0.006), (v) => { v.z += v.y * v.y * 0.25; }), 'pelvis', 'accent', [0, 0.03, 0.22], [0.12, 0, 0]);
  b.add(deform(b.ext([[-0.22, 0], [0.22, 0], [0.18, -0.46], [-0.18, -0.5]], 0.025, 0.006), (v) => { v.z -= v.y * v.y * 0.3; }), 'pelvis', 'accent', [0, 0.03, -0.22], [-0.12, 0, 0]);
  b.add(taper(b, [[0, 0, 0], [0, -0.15, -0.08], [0, -0.38, -0.1], [0, -0.55, -0.06]], 0.03, 0.014, 10, 6), 'aux0', 'paint');
  b.add(tuftGeo(0.14, 0.05, 0.2), 'aux0', 'paint', [0, -0.52, -0.06], orient(V(0, -1, 0.1), V(0, 0, 1)));
  b.add(tuftGeo(0.12, 0.04, 0.2), 'aux0', 'paint', [0.02, -0.52, -0.07], orient(V(0.3, -1, 0), V(0, 0, 1)));

  // ---- legs: shaggy goat thighs, digitigrade-looking shins, iron-shod cloven hooves ----
  b.sym(blob(b, [0.16, 0.29, 0.17], 0.04, 24, 14, 10), 'thigh', 'paint', [0, -0.22, 0.01]);
  b.sym(blob(b, [0.1, 0.11, 0.1], 0.04, 25, 10, 8), 'shin', 'paint', [0, 0.0, 0.03]);                         // knee
  b.sym(blob(b, [0.1, 0.17, 0.11], 0.04, 26, 12, 10), 'shin', 'paint', [0, -0.15, -0.06]);                     // calf, set back
  b.sym(pod(b, -0.2, -D.shin + 0.02, [0.09, 0.08, 0.07, 0.08], 10), 'shin', 'paint', [0, 0, -0.02]);
  for (const x of [-0.055, 0.055]) b.sym(deform(b.rbox(0.095, 0.12, 0.21, 0.03), (v) => { v.x *= 1 - Math.max(0, v.z) * 1.4; }), 'foot', 'metal', [x, -0.095, 0.06]);
  b.sym(b.cyl(0.11, 0.125, 0.06, 12), 'foot', 'metal', [0, -0.02, 0.03]);
  fur('thigh', { c: [0, -0.24, 0.01], r: [0.17, 0.3, 0.18], n: 56, len: [0.13, 0.22], flow: [0, -1, -0.2], lift: 0.45, keep: (d) => d.y < 0.75 }, true);
  fur('shin', { c: [0, -D.shin + 0.1, 0], r: [0.085, 0.1, 0.085], n: 24, len: [0.12, 0.18], flow: [0, -1, 0.05], lift: 0.35 }, true);           // fetlock
  fur('upArm', { c: [-0.02, -0.03, 0], r: [0.17, 0.16, 0.18], n: 12, len: [0.08, 0.13], flow: [0.3, -1, -0.3], lift: 0.4, keep: (d) => d.y > 0.2 }, true);

  // ---- war paint (accent) / rage glow (R3+) ----
  const wp = r >= 3 ? 'glow' : 'accent';
  for (const s of [1, -1]) {
    b.add(b.tube([[s * 0.08, 0.2, 0.25], [s * 0.15, 0.1, 0.27], [s * 0.2, -0.02, 0.24]], 0.012, 8, 4), 'chest', wp);
    b.add(b.tube([[s * 0.06, 0.13, 0.26], [s * 0.13, 0.03, 0.27], [s * 0.17, -0.07, 0.24]], 0.01, 8, 4), 'chest', wp);
  }
  b.sym(b.tube([[0.12, -0.12, 0.08], [0.125, -0.2, 0.1], [0.12, -0.3, 0.08]], 0.011, 6, 4), 'upArm', wp, [-0.02, 0, 0]);
  b.add(b.tube([[-0.05, 0.03, 0.27], [0, 0.0, 0.3], [0.05, 0.03, 0.27]], 0.01, 6, 4), 'head', wp);
  if (r >= 1) b.sym(b.tube([[0.05, 0.13, 0.17], [0.08, 0.06, 0.2], [0.1, -0.02, 0.21]], 0.009, 6, 4), 'head', wp);

  // ---- the labrys (right hand, hold frame) ----
  b.scope(GRIP, HOLD, 1, () => {
    b.add(b.cyl(0.032, 0.036, HAFT[1] - HAFT[0], 10), 'handR', 'accent', [0, (HAFT[0] + HAFT[1]) / 2, 0]);
    for (const y of [-0.12, 0.12, 0.6]) b.add(b.tor(0.037, 0.008, 12, 4), 'handR', 'metal', [0, y, 0], [PI / 2, 0, 0]);
    b.add(b.cyl(0.045, 0.03, 0.08, 8), 'handR', 'metal', [0, HAFT[0] - 0.02, 0]);
    b.add(b.cyl(0.0, 0.04, 0.14, 8), 'handR', 'metal', [0, HAFT[1] + 0.07, 0]);                                       // top spike
    // double crescent blades in the haft's Y-Z plane, edges facing +-Z
    const wing = [[0.03, 0.1], [0.16, 0.15], [0.32, 0.29], [0.42, 0.4], [0.39, 0.2], [0.43, 0.0], [0.39, -0.2], [0.42, -0.4], [0.32, -0.29], [0.16, -0.15], [0.03, -0.1]];
    for (const s of [1, -1]) {
      const g = b.ext(wing.map(([x, y]) => [x * s, y]), 0.045, 0.012);
      b.add(deform(g, (v) => { const k = Math.abs(v.x) / 0.43; v.z *= 1 - 0.8 * k; }), 'handR', 'metal', [0, AXE_Y, 0], [0, PI / 2, 0]);
      if (r >= 3) b.add(b.tube([[0, 0.33, 0.36 * s], [0, 0.12, 0.445 * s], [0, 0, 0.465 * s], [0, -0.12, 0.445 * s], [0, -0.33, 0.36 * s]], 0.009, 12, 4), 'handR', 'glow', [0, AXE_Y, 0]);
    }
    b.add(b.cbox(0.08, 0.3, 0.08, 0.02), 'handR', 'metal', [0, AXE_Y, 0]);
    if (r >= 2) for (const y of [AXE_Y - 0.17, AXE_Y + 0.17]) b.add(b.tor(0.045, 0.01, 12, 4), 'handR', 'trim', [0, y, 0], [PI / 2, 0, 0]);
    if (r >= 5) b.sym(fin(b, [[0, -0.05], [0.04, 0], [0, 0.05], [-0.04, 0]], 0.05, 0.004), 'handR', 'glow', [0, AXE_Y, 0.2], [0, PI / 2, 0]);
  });

  // ---- rank ladder ----
  if (r >= 2) {
    // iron pauldron on the left shoulder (both at R4) + a leather strap across the chest
    for (const s of r >= 4 ? [1, -1] : [1]) {
      const bone = s > 0 ? 'upArmL' : 'upArmR';
      b.add(deform(b.sph(16, 10, 0, PI * 2, 0, PI * 0.5), (v) => { v.y *= 0.7; }), bone, 'metal', [s * 0.02, 0.02, 0], [0, 0, s * -0.35], [0.22, 0.2, 0.22]);
      for (let i = 0; i < (far ? 2 : 3); i++) b.add(b.cyl(0, 0.03, 0.15, 6), bone, 'trim', [s * (0.06 + i * 0.05), 0.12 - i * 0.02, -0.06 + i * 0.07], [0, 0, s * -(0.5 + i * 0.25)]);
    }
    b.add(b.tor(0.42, 0.03, 28, 5), 'chest', 'accent', [0, 0.0, 0.02], orient(V(0.62, 0.78, 0), V(-0.78, 0.62, 0)), [0.66, 1.18, 1]);
  }
  if (r >= 4) {
    // trophy skulls (bone) on the belt
    for (const s of [1, -1]) {
      b.add(blob(b, [0.055, 0.06, 0.06], 0.03, 40, 10, 8), 'pelvis', 'trim', [s * 0.22, -0.02, 0.15]);
      b.sym(b.sph(6, 4), 'pelvis', 'accent', [s * 0.22 + 0.02 * s, 0.0, 0.205], [0, 0, 0], 0.012);
    }
  }
  if (r >= 3) {
    // smouldering mane tips
    for (let i = 0; i < (far ? 3 : 10 + r * 2); i++) {
      const a = (rnd() - 0.5) * 2.4, y = 0.3 + rnd() * 0.1;
      b.add(tuftGeo(0.08 + rnd() * 0.05, 0.025, 0.3), 'chest', 'glow', [Math.sin(a) * 0.26, y, -0.06 - Math.cos(a) * 0.2], orient(V(Math.sin(a) * 0.5, 0.6, -1), V(0, 1, 0)));
    }
  }
  if (r >= 5) {
    // crown: a ring of embers between the horns
    b.add(b.tor(0.2, 0.012, 32, 4), 'head', 'glow', [0, 0.42, -0.08], [0.25, 0, 0]);
    for (let i = 0; i < (far ? 3 : 7); i++) { const a = (i / 7) * PI * 2; b.add(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.09]], 0.012, 0.003), 'head', 'glow', [Math.cos(a) * 0.2, 0.42 + Math.sin(a) * 0.2 * Math.cos(0.25), -0.08 + Math.sin(a) * 0.05], [0, 0, a - PI / 2]); }
  }
}

// ---------- anims (all 10 bespoke) ----------
const S2 = ['L', 'R'];
// hunched brute base: spine/chest pitched forward, neck/head up to look ahead, wide stance
function stance(P, ctx, t, L, k = {}) {
  const br = Math.sin(t * 1.3), sw = Math.sin(t * 0.5), st = ctx.st;
  L.pel(P, sw * 0.02 + (k.px || 0), -0.07 + br * 0.012 + (k.py || 0), k.pz || 0);
  L.R(P, 'pelvis', 0.12 + (k.pp || 0), k.py2 || 0, sw * 0.02 + (k.pr || 0));
  L.R(P, 'spine', 0.14 + br * 0.015 + (k.sp || 0), k.sy || 0, -sw * 0.015);
  L.R(P, 'chest', 0.12 - br * 0.035 + (k.cp || 0), k.cy || 0, k.cr || 0);
  for (const s of S2) L.RS(P, 'clav', s, 0, 0, br * 0.04 + (k.shrug || 0));
  L.R(P, 'neck', -0.25 + st.gp * 0.3 + (k.np || 0), st.gy * 0.35 * (k.look ?? 1), 0);
  L.R(P, 'head', -0.12 + st.gp * 0.4 + (k.hp || 0), st.gy * 0.4 * (k.look ?? 1), st.tilt + (k.ht || 0));
  L.R(P, 'aux1', 0.05 + (k.jaw || 0), 0, 0);
  L.R(P, 'aux0', 0.4 + Math.sin(t * 1.1) * 0.08, Math.sin(t * 0.8) * 0.25, 0);
}
// relaxed arms: left fist hanging, right hand low holding the labrys with its head near the floor in front
function arms(P, L, t, k = 0) {
  const br = Math.sin(t * 1.3) * 0.03;
  L.RS(P, 'upArm', 'L', -0.15 + br, 0.0, 0.32);
  L.RS(P, 'foreArm', 'L', -0.45, 0, 0);
  L.RS(P, 'hand', 'L', 0.0, 0, 0.1);
  L.RS(P, 'upArm', 'R', -0.25 - br - 0.4 * k, 0.2, 0.36);
  L.RS(P, 'foreArm', 'R', -0.5 - 0.6 * k, 0, 0);
  L.RS(P, 'hand', 'R', 0.75 - 1.0 * k, 0, -0.15);
}
// right arm rest values (raw channels, as arms() writes them) + raw keyframing of a bone's 3 channels
const IDLE_R = { upArmR: [-0.25, -0.2, -0.36], foreArmR: [-0.5, 0, 0], handR: [0.75, 0, 0.15] };
function keyR(P, L, bone, u, keys) {
  const i = L.BI[bone] * 3;
  for (let c = 0; c < 3; c++) P[i + c] = L.kf(u, keys.map(([k, v]) => [k, v[c]]));
}
const feet = (P, ctx, L, zl = 0.12, zr = -0.12, wide = 1.45, pl = 0, pr = 0) => L.plant(P, ctx, zl, zr, wide, pl, pr);

const anims = {
  idle(P, t, ctx, L) {
    // heavy breathing, a snort + head toss every few seconds, axe swaying low
    const sn = Math.max(0, Math.sin((t % 5.3) / 0.9 * PI)) * ((t % 5.3) < 0.9 ? 1 : 0);
    stance(P, ctx, t, L, { np: -0.15 * sn, hp: -0.25 * sn, ht: 0.12 * sn, jaw: 0.1 * sn, shrug: 0.04 * sn });
    arms(P, L, t);
    L.A(P, 'handR', Math.sin(t * 0.9) * 0.05, 0, 0);
    feet(P, ctx, L);
  },
  advance(P, t, ctx, L) {
    // stomping march: stock gait legs, hunched swaying torso, fist swinging, labrys carried forward
    L.gait(P, ctx);
    const ph = ctx.move.phase, s2 = Math.sin(PI * 2 * ph);
    L.A(P, 'pelvis', 0.08, 0, 0);
    L.R(P, 'spine', 0.2, 0.1 * s2, -0.04 * s2);
    L.R(P, 'chest', 0.16, 0.12 * s2, 0.03 * s2);
    L.R(P, 'neck', -0.35, -0.12 * s2, 0); L.R(P, 'head', -0.08, -0.08 * s2, 0);
    L.R(P, 'aux1', 0.1, 0, 0);
    L.R(P, 'aux0', 0.6, 0.3 * s2, 0);
    L.RS(P, 'upArm', 'L', -0.1 + 0.4 * s2, 0, 0.32); L.RS(P, 'foreArm', 'L', -0.6 - 0.2 * Math.max(0, s2), 0, 0); L.RS(P, 'hand', 'L', 0, 0, 0.1);
    L.RS(P, 'upArm', 'R', -0.45 - 0.15 * s2, 0.2, 0.36); L.RS(P, 'foreArm', 'R', -0.9, 0, 0); L.RS(P, 'hand', 'R', 0.3, 0, -0.15);
  },
  attack(P, u, ctx, L) {
    // SCYTHE SWEEP: coil right with the labrys out behind, sweep it flat across the front (impact 0.5), follow through left
    const kf = L.kf;
    const low = kf(u, [[0, 0], [0.3, 0.4], [0.5, 1], [0.7, 0.8], [1, 0]]);
    stance(P, ctx, ctx.t, L, { py: -0.12 * low, pz: 0.14 * kf(u, [[0, 0], [0.45, 1], [0.7, 0.8], [1, 0]]), sp: 0.1 * low, np: 0.1 * low, look: 0.3, jaw: 0.3 * low });
    const T = [[0, 0], [0.3, -0.45], [0.5, 0.7], [0.66, 0.85], [1, 0]];
    L.A(P, 'pelvis', 0, 0.15 * kf(u, T), 0); L.A(P, 'spine', 0, 0.3 * kf(u, T), 0); L.A(P, 'chest', 0, 0.55 * kf(u, T), 0);
    keyR(P, L, 'upArmR', u, [[0, IDLE_R.upArmR], [0.3, [-0.6, -0.2, -1.3]], [0.5, [-1.25, -0.5, 0.1]], [0.66, [-1.0, -0.7, 0.5]], [1, IDLE_R.upArmR]]);
    keyR(P, L, 'foreArmR', u, [[0, IDLE_R.foreArmR], [0.3, [-0.3, 0, 0]], [0.5, [-0.3, 0, 0]], [0.66, [-0.5, 0, 0]], [1, IDLE_R.foreArmR]]);
    keyR(P, L, 'handR', u, [[0, IDLE_R.handR], [0.3, [0.3, 0, -1.57]], [0.66, [0.25, 0, -1.57]], [1, IDLE_R.handR]]);
    L.RS(P, 'upArm', 'L', kf(u, [[0, -0.15], [0.3, -0.7], [0.5, 0.25], [1, -0.15]]), 0, kf(u, [[0, 0.32], [0.3, 0.55], [0.5, 0.6], [1, 0.32]]));
    L.RS(P, 'foreArm', 'L', -0.7, 0, 0);
    feet(P, ctx, L, 0.32, -0.2, 1.6, 0, 0.2);
  },
  attack_alt(P, u, ctx, L) {
    // OVERHEAD CLEAVE: both hands heave the labrys up behind the horns, chop down in front (impact 0.52), the head bites the floor
    const kf = L.kf;
    const up = kf(u, [[0, 0], [0.34, 1], [0.44, 1.05], [0.52, 0], [1, 0]]);
    const chop = kf(u, [[0, 0], [0.44, 0], [0.52, 1], [0.78, 1], [1, 0]]);
    stance(P, ctx, ctx.t, L, { py: 0.05 * up - 0.24 * chop, pz: 0.16 * chop, sp: -0.12 * up + 0.3 * chop, cp: -0.1 * up + 0.25 * chop, np: 0.3 * up - 0.15 * chop, hp: 0.15 * up, jaw: 0.4 * up + 0.2 * chop, look: 0.2 });
    keyR(P, L, 'upArmR', u, [[0, IDLE_R.upArmR], [0.34, [-2.45, -0.1, -0.16]], [0.44, [-2.5, -0.1, -0.16]], [0.52, [-0.9, -0.1, -0.3]], [0.78, [-0.85, -0.1, -0.3]], [1, IDLE_R.upArmR]]);
    keyR(P, L, 'foreArmR', u, [[0, IDLE_R.foreArmR], [0.34, [-0.55, 0, 0]], [0.52, [-0.1, 0, 0]], [0.78, [-0.15, 0, 0]], [1, IDLE_R.foreArmR]]);
    keyR(P, L, 'handR', u, [[0, IDLE_R.handR], [0.34, [0.45, 0, 0.0]], [0.44, [0.4, 0, 0]], [0.52, [1.5, 0, 0.15]], [0.78, [1.5, 0, 0.15]], [1, IDLE_R.handR]]);
    L.RS(P, 'upArm', 'L', -0.15 - 2.3 * up - 0.8 * chop, -0.1, 0.32 - 0.15 * up);
    L.RS(P, 'foreArm', 'L', -0.45 - 0.4 * up, 0, 0);
    feet(P, ctx, L, 0.34, -0.24, 1.6, 0, 0.25);
    // the left hand closes on the haft below the right fist while the axe is up and through the chop
    const g = Math.max(up, chop);
    if (g > 0.05) ikBlend(P, L, ctx, 'L', L.fkPoint(P, ctx, 'handR', [0, -0.1, -0.3]), g * 1.5);
  },
  cast(P, u, ctx, L) {
    // BLOODRAGE roar: chest thrown out, arms flung wide, head back, jaw wide (cast 0.4)
    const kf = L.kf, k = kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), sh = Math.sin(u * 60) * kf(u, [[0, 0], [0.35, 0], [0.4, 1], [0.8, 0]]);
    stance(P, ctx, ctx.t, L, { py: -0.06 * k, sp: -0.25 * k, cp: -0.3 * k + 0.02 * sh, np: -0.25 * k, hp: -0.5 * k, jaw: 0.55 * k, shrug: 0.12 * k, look: 1 - k });
    L.RS(P, 'upArm', 'L', -0.4 * k - 0.15, 0.3 * k, 0.32 + 0.95 * k);
    L.RS(P, 'foreArm', 'L', -0.45 - 0.7 * k, 0, 0);
    L.RS(P, 'upArm', 'R', -0.25 - 0.35 * k, 0.2 - 0.3 * k, 0.36 + 0.85 * k);
    L.RS(P, 'foreArm', 'R', -0.5 - 0.6 * k, 0, 0);
    L.RS(P, 'hand', 'R', 0.75 - 0.9 * k, 0, -0.15);
    feet(P, ctx, L, 0.16, -0.14, 1.6);
  },
  overdrive(P, u, ctx, L) {
    // GORE CHARGE: stamp the right hoof twice (cast 0.2), lower the horns, explode forward and toss the target (impact 0.62)
    const kf = L.kf;
    const stamp = u < 0.4 ? Math.max(0, Math.sin(u / 0.2 * PI * 2)) * kf(u, [[0, 0], [0.05, 1], [0.38, 1], [0.4, 0]]) : 0;
    const lower = kf(u, [[0, 0], [0.12, 1], [0.5, 1], [0.6, 0.6], [0.66, -0.3], [0.8, -0.2], [1, 0]]);
    const dash = kf(u, [[0, 0], [0.4, -0.08], [0.58, 0.42], [0.66, 0.46], [0.85, 0.3], [1, 0]]);
    const toss = kf(u, [[0, 0], [0.58, 0], [0.64, 1], [0.8, 0.6], [1, 0]]);
    stance(P, ctx, ctx.t, L, { py: -0.14 * lower + 0.06 * toss, pz: dash, pp: 0.25 * Math.max(0, lower), sp: 0.22 * Math.max(0, lower) - 0.25 * toss, cp: 0.2 * Math.max(0, lower) - 0.2 * toss,
      np: 0.55 * Math.max(0, lower) - 0.35 * toss, hp: 0.4 * Math.max(0, lower) - 0.5 * toss, jaw: 0.3 * toss + 0.15 * lower, look: 0 });
    L.RS(P, 'upArm', 'L', -0.6 * lower + 0.5 * toss, 0, 0.5 + 0.3 * toss);
    L.RS(P, 'foreArm', 'L', -0.9, 0, 0);
    L.RS(P, 'upArm', 'R', -0.25 - 0.3 * lower + 0.5 * toss, 0.2, 0.5 + 0.3 * toss);
    L.RS(P, 'foreArm', 'R', -0.7, 0, 0);
    L.RS(P, 'hand', 'R', 0.6, 0, -0.15);
    feet(P, ctx, L, 0.1 + dash * 0.9, -0.3 + dash * 0.4, 1.5, 0, 0);
    if (stamp > 0) { const i = L.BI.thighR * 3; P[i] -= 0.55 * stamp; P[L.BI.shinR * 3] += 0.75 * stamp; P[L.BI.footR * 3] -= 0.2 * stamp; }
  },
  hit(P, u, ctx, L) {
    const kf = L.kf, k = kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    stance(P, ctx, ctx.t, L, { pz: -0.06 * k, py: -0.03 * k, sp: -0.12 * k, cp: -0.08 * k, cr: 0.1 * k * d, np: -0.15 * k, hp: -0.15 * k, ht: 0.18 * k * d, jaw: 0.3 * k });
    arms(P, L, ctx.t);
    L.A(P, 'upArmL', 0.25 * k, 0, 0.15 * k); L.A(P, 'upArmR', 0.2 * k, 0, 0);
    feet(P, ctx, L, 0.1, -0.16, 1.45);
  },
  die(P, u, ctx, L) {
    // knees buckle, kneel swaying (0.1-0.45), topple forward face down (down 0.74), axe falls away
    const kf = L.kf, D = ctx.D;
    const kneel = kf(u, [[0, 0], [0.22, 1], [1, 1]]), fall = kf(u, [[0, 0], [0.45, 0], [0.74, 1], [0.8, 0.96], [1, 1]]);
    const sway = Math.sin(u * 14) * kf(u, [[0, 0], [0.2, 0.06], [0.45, 0.04], [0.5, 0]]);
    L.pel(P, 0, -0.62 * kneel - 0.32 * fall, 0.12 * kneel + 0.25 * fall);
    L.R(P, 'pelvis', 0.15 + 0.9 * fall, 0, sway);
    L.R(P, 'spine', 0.15 + 0.35 * fall, 0, -sway);
    L.R(P, 'chest', 0.2 + 0.2 * fall, 0, 0);
    L.R(P, 'neck', -0.2 * (1 - fall) + 0.2 * fall, 0, 0); L.R(P, 'head', -0.3 * kneel * (1 - fall) - 0.3 * fall, 0.4 * fall, 0.2 * fall);
    L.R(P, 'aux1', 0.35 * kneel, 0, 0);
    L.R(P, 'aux0', 0.2, 0, 0);
    L.RS(P, 'upArm', 'L', -0.2 - 1.2 * fall, 0, 0.3 + 0.3 * fall); L.RS(P, 'foreArm', 'L', -0.4 - 0.5 * fall, 0, 0);
    L.RS(P, 'upArm', 'R', -0.2 - 0.7 * fall, 0.2, 0.5 + 0.6 * fall); L.RS(P, 'foreArm', 'R', -0.2, 0, 0); L.RS(P, 'hand', 'R', 0.75 + 0.6 * kneel, 0, -0.15);
    // knees go to the floor: shins flat behind
    for (const s of S2) {
      const x = (s === 'L' ? 1 : -1) * D.hipX * 1.25;
      L.legIK(P, ctx, s, x, D.ankle * (1 - kneel) + 0.12 * kneel, (s === 'L' ? 0.1 : -0.12) * (1 - kneel) - 0.55 * kneel + 0.2 * fall, -0.9 * kneel);
    }
  },
  victory(P, t, ctx, L) {
    // the labrys raised high, roaring in pulses, left fist pounding the chest
    const k = L.smooth(Math.min(1, t / 0.6)), pump = Math.max(0, Math.sin(t * 2.6)), beat = Math.max(0, Math.sin(t * 5.2));
    stance(P, ctx, t, L, { sp: -0.08 * k, cp: -0.12 * k - 0.05 * pump, np: -0.2 * k, hp: -0.3 * k - 0.15 * pump, jaw: 0.25 * k + 0.35 * pump, look: 1 - k });
    L.RS(P, 'upArm', 'R', -0.25 - 2.35 * k - 0.15 * pump, 0.1, 0.36 + 0.15 * k);
    L.RS(P, 'foreArm', 'R', -0.5 + 0.25 * k, 0, 0);
    L.RS(P, 'hand', 'R', 0.75 - 0.9 * k, 0, -0.15);
    L.RS(P, 'upArm', 'L', -0.15 - 0.9 * k + 0.2 * beat, 0.5 * k, 0.32 + 0.1 * k);
    L.RS(P, 'foreArm', 'L', -0.45 - 1.6 * k, 0, 0);
    feet(P, ctx, L, 0.16, -0.14, 1.55);
  },
  deploy(P, u, ctx, L) {
    // falls from the sky (kit drop to 0.4): crashes into a three-point landing (fist + hooves), rises and roars (ready 0.85)
    const kf = L.kf;
    const crouch = kf(u, [[0, 0.3], [0.38, 0.3], [0.42, 1], [0.6, 1], [0.78, 0], [1, 0]]);
    const roar = kf(u, [[0, 0], [0.7, 0], [0.8, 1], [0.92, 1], [1, 0]]);
    stance(P, ctx, ctx.t, L, { py: -0.42 * crouch, pz: 0.05 * crouch, pp: 0.25 * crouch, sp: 0.25 * crouch - 0.2 * roar, cp: 0.2 * crouch - 0.2 * roar, np: -0.2 * crouch - 0.2 * roar, hp: -0.3 * roar, jaw: 0.5 * roar, look: 0 });
    L.RS(P, 'upArm', 'L', -0.15 - 0.55 * crouch, 0, 0.32 + 0.1 * crouch); L.RS(P, 'foreArm', 'L', -0.45 + 0.3 * crouch, 0, 0);
    L.RS(P, 'upArm', 'R', -0.25 - 0.1 * crouch, 0.2, 0.36 + 0.5 * roar); L.RS(P, 'foreArm', 'R', -0.5 - 0.5 * roar, 0, 0); L.RS(P, 'hand', 'R', 0.75 - 0.6 * roar, 0, -0.15);
    if (crouch > 0.35) ikBlend(P, L, ctx, 'L', V(0.42, 0.14, 0.45), (crouch - 0.35) / 0.5);
    feet(P, ctx, L, 0.3, -0.3, 1.6);
  },
};
// arm IK blended over the current FK arm pose by k (0 = keep FK, 1 = full IK)
function ikBlend(P, L, ctx, side, target, k, out = 0.3) {
  const i = L.BI['upArm' + side] * 3, keep = P.slice(i, i + 9);
  L.armIK(P, ctx, side, target, out);
  const w = Math.min(1, k);
  for (let j = 0; j < 9; j++) P[i + j] = keep[j] + (P[i + j] - keep[j]) * w;
}

export default {
  id: 'minotaur', name: 'MINOTAUR', role: 'tank', faction: 'horde', rarity: 'epic', realm: 'fantasy',
  rig: 'biped', dims: MINO_DIMS, height: 2.45, radius: 0.85, walkSpeed: 0.95, cadence: 0.68, scheme: 'dark',
  style: { weapon: 'blade', heavy: 1, stance: 1.45 },
  paint: PAINT,
  mats: {
    all: { paint: { detail: HIDE, rough: 0.72, metal: 0.0, panel: { grime: 0.14, grimeScale: 12, grimeRough: 0.1, stretch: 0.6 } },
      accent: { rough: 0.8, detail: { map: 'grime', scale: 2, albedo: 0.5, rough: 0.4 } },
      metal: { color: 0x5c5e64, metal: 0.8, rough: 0.42, detail: { map: 'scuff', scale: 2.4, albedo: 0.5, rough: 0.5, scratch: 0.5 } },
      trim: { metal: 0.05, rough: 0.5, detail: { map: 'scratch', scale: 2, albedo: 0.4, rough: 0.3 } },
      glow: { color: 0xff3a12 }, eye: { color: 0xff4a1a } },
  },
  sockets: { muzzle: ['handR', [0, -0.08, 0.98]], core: [0, 0.05, 0.26], head: [0, 0.2, 0.15], hand: [0, -0.1, 0.02],
    horns: ['head', [0, 0.3, 0.2]], nose: ['head', [0, -0.12, 0.38]], hoofR: ['footR', [0, -0.14, 0.08]], hoofL: ['footL', [0, -0.14, 0.08]] },
  events: { attack: [['impact', 0.5]], attack_alt: [['impact', 0.52]], cast: [['cast', 0.4]], overdrive: [['cast', 0.2], ['impact', 0.62]], die: [['down', 0.74]], deploy: [['land', 0.4], ['ready', 0.85]] },
  durs: { attack: 1.1, attack_alt: 1.25, cast: 1.4, overdrive: 2.4, hit: 0.45, die: 2.2, deploy: 1.7 },
  fxHints: { impact: 'cleave', overdrive: 'gore_charge' },
  build,
  anims,
};
