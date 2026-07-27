// GRUMPY BUGS — weapon visuals + strike choreography. Ballistics live in
// physics.js; this file makes the flying things look like things.
//
// LOCAL FRAME: every projectile flies +Z first. game.js `lookAt`s the mesh
// down the path each frame, so the nose belongs at +Z and the exhaust/fins at
// -Z. Spin is applied AFTER the lookAt (see `animateProjectile`) — writing to
// rotation.z directly does nothing, because lookAt overwrites the whole euler
// on the next frame.
//
// Anything that needs to move on its own (fuse sparks, dung flies, rocket
// plume, reticle rings) is parked in `userData.anim` and driven by
// `animateProjectile` / `animateReticle`, both called from the Battle loop.

import * as THREE from 'three';
import { mat } from './bugs.js';
const T = THREE;

// ---------------- small builders ----------------
const sph = (r, c, o, seg = 12) => new T.Mesh(new T.SphereGeometry(r, seg, Math.ceil(seg * 0.8)), mat(c, o));
const box = (x, y, z, c, o) => new T.Mesh(new T.BoxGeometry(x, y, z), mat(c, o));
const cyl = (r1, r2, h, c, o, seg = 10) => new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg), mat(c, o));
const cone = (r, h, c, o, seg = 10) => new T.Mesh(new T.ConeGeometry(r, h, seg), mat(c, o));
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };

// shared finishes
const STEEL = { metal: 0.85, rough: 0.28 };
const GLOSS = { rough: 0.18, metal: 0.05 };
const MATTE = { rough: 1, metal: 0 };

// ---------------- ACORN RPG ----------------
// A nut on a stick with an actual rocket bolted to it: scaly cupule cap,
// riveted steel collar, three swept fins, a lit motor. Nose at +Z.
function buildAcorn() {
  const g = new T.Group();
  const nut = 0xb8813f;

  const body = sph(0.135, nut, { rough: 0.42, metal: 0.05 }, 14);
  body.scale.set(1, 0.96, 1.55);
  body.position.z = 0.04;
  const tip = cone(0.075, 0.16, nut, { rough: 0.4 });
  at(tip, 0, 0, 0.26, Math.PI / 2, 0, 0);
  const tipDark = cone(0.045, 0.07, 0x8a5f2a, { rough: 0.5 });
  at(tipDark, 0, 0, 0.325, Math.PI / 2, 0, 0);
  g.add(body, tip, tipDark);

  // cupule — the scaly cap, built from rings of little flat scales so it reads
  // as a nut and not a brown ball
  const cap = new T.Group();
  cap.position.z = -0.115;
  const dome = new T.Mesh(new T.SphereGeometry(0.148, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
    mat(0x63421f, { rough: 0.92, flat: true }));
  at(dome, 0, 0, -0.03, -Math.PI / 2, 0, 0);
  cap.add(dome);
  // scales sit ON the dome surface, tilted tangent to it — placed on a flat
  // ring they read as debris stuck to the nut instead of part of the cap
  const R = 0.152;
  for (let ring = 0; ring < 3; ring++) {
    const th = 1.16 - ring * 0.36, n = ring === 2 ? 6 : 9;
    const r = R * Math.sin(th), z = -0.03 - R * Math.cos(th);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.42;
      const holder = new T.Group();
      holder.rotation.z = a;
      const sc = box(0.05, 0.046, 0.016, ring % 2 ? 0x714c25 : 0x553818, { flat: true, rough: 1 });
      at(sc, 0, r, z, -th, 0, 0);
      holder.add(sc);
      cap.add(holder);
    }
  }
  const stalk = cyl(0.016, 0.026, 0.16, 0x4d3418, MATTE, 6);
  at(stalk, 0, 0, -0.18, Math.PI / 2, 0, 0.25);
  cap.add(stalk);
  g.add(cap);

  // steel collar + rivets: the "weapons-grade" joke
  const collar = new T.Mesh(new T.TorusGeometry(0.128, 0.022, 8, 18), mat(0x9aa3ad, STEEL));
  collar.position.z = 0.02;
  g.add(collar);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const riv = sph(0.017, 0xd7dde4, STEEL, 6);
    at(riv, Math.cos(a) * 0.135, Math.sin(a) * 0.135, 0.02);
    g.add(riv);
  }

  // fins — three, swept back, red with a cream tip
  for (let i = 0; i < 3; i++) {
    const fin = new T.Group();
    fin.rotation.z = (i / 3) * Math.PI * 2 + 0.5;
    const blade = box(0.016, 0.115, 0.13, 0xd94436, { rough: 0.5 });
    at(blade, 0, 0.12, -0.185, 0.35, 0, 0);
    const edge = box(0.018, 0.03, 0.05, 0xf5efe0, { rough: 0.5 });
    at(edge, 0, 0.175, -0.23, 0.35, 0, 0);
    fin.add(blade, edge);
    g.add(fin);
  }

  // motor + plume (plume pulses in animateProjectile)
  const nozzle = cyl(0.062, 0.078, 0.06, 0x4a4038, { metal: 0.6, rough: 0.4 }, 10);
  at(nozzle, 0, 0, -0.25, Math.PI / 2, 0, 0);
  g.add(nozzle);
  const plume = new T.Group();
  plume.position.z = -0.3;
  const wash = cone(0.1, 0.44, 0xff8a3a, { emissive: 0xff5a10, emissiveIntensity: 1.1, opacity: 0.13 });
  at(wash, 0, 0, -0.24, -Math.PI / 2, 0, 0);
  const flame = cone(0.055, 0.3, 0xffb347, { emissive: 0xff7a1a, emissiveIntensity: 2.6, opacity: 0.7 });
  at(flame, 0, 0, -0.15, -Math.PI / 2, 0, 0);
  const core = cone(0.03, 0.17, 0xfff0c0, { emissive: 0xffe08a, emissiveIntensity: 3.2 });
  at(core, 0, 0, -0.08, -Math.PI / 2, 0, 0);
  plume.add(wash, flame, core);
  g.add(plume);

  g.userData.spin = 'z';
  g.userData.anim = { plume };
  return g;
}

// ---------------- BERRY BOMB ----------------
// Wet glossy berry, a green calyx, a taped-on detonator with a burning fuse.
// The pin is still in it. Somebody will notice eventually.
function buildBerry() {
  const g = new T.Group();

  const body = sph(0.155, 0xc42a3a, GLOSS, 16);
  body.scale.set(1, 0.95, 1);
  g.add(body);
  // three shallow lobes so it isn't a perfect ball
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const lobe = sph(0.088, 0xa81f2e, GLOSS, 10);
    at(lobe, Math.cos(a) * 0.11, -0.03, Math.sin(a) * 0.11);
    lobe.scale.set(1, 0.85, 1);
    g.add(lobe);
  }
  // a wet highlight blob — cheap specular that survives any light angle
  const gleam = sph(0.05, 0xff8f96, { rough: 0.05, opacity: 0.75 }, 8);
  at(gleam, -0.07, 0.11, 0.08);
  gleam.scale.set(1.5, 0.75, 1);
  g.add(gleam);

  // calyx: five leaves + stem
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = sph(0.055, 0x4a7d3a, { flat: true, rough: 0.7 }, 6);
    leaf.scale.set(1.5, 0.28, 0.75);
    at(leaf, Math.cos(a) * 0.07, 0.145, Math.sin(a) * 0.07, 0, -a, -0.35);
    g.add(leaf);
  }
  const stem = cyl(0.017, 0.024, 0.1, 0x5d4a24, MATTE, 6);
  at(stem, 0, 0.2, 0, 0, 0, 0.18);
  g.add(stem);

  // detonator collar, pin ring, fuse
  const band = new T.Mesh(new T.TorusGeometry(0.13, 0.018, 6, 16), mat(0x2f2a24, { rough: 0.6 }));
  at(band, 0, 0.05, 0, Math.PI / 2, 0, 0.2);
  const cap = cyl(0.035, 0.042, 0.05, 0x8a8f96, STEEL, 8);
  at(cap, 0.09, 0.13, 0.02, 0, 0, -0.5);
  const pin = new T.Mesh(new T.TorusGeometry(0.032, 0.008, 5, 10), mat(0xd9c04a, STEEL));
  at(pin, 0.15, 0.16, 0.02, 0.4, 0, -0.5);
  g.add(band, cap, pin);

  const fuse = new T.Group();
  fuse.position.set(0.1, 0.17, 0.02);
  for (let i = 0; i < 4; i++) {
    const s = cyl(0.011, 0.011, 0.05, 0x6b5a3a, MATTE, 5);
    at(s, Math.sin(i * 1.5) * 0.02, i * 0.042, Math.cos(i * 1.5) * 0.02, 0, 0, Math.sin(i) * 0.4);
    fuse.add(s);
  }
  const spark = makeFuseGlow();
  spark.position.set(0, 0.19, 0);
  fuse.add(spark);
  g.add(fuse);

  g.userData.spin = 'x';
  g.userData.anim = { spark };
  return g;
}

// ---------------- ROTTEN BERRY (cluster) ----------------
// The berry's forgotten cousin: collapsed, furred with mould, four bulges
// straining to become four separate problems.
function buildRotten() {
  const g = new T.Group();

  const body = sph(0.16, 0x4a3a6b, { rough: 0.85, metal: 0 }, 12);
  body.scale.set(1, 0.9, 1.02);
  g.add(body);
  // the four shards, half-swallowed
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const sh = sph(0.075, 0x6a52a0, { rough: 0.7 }, 8);
    at(sh, Math.cos(a) * 0.13, Math.sin(a * 1.7) * 0.07, Math.sin(a) * 0.13);
    const dent = sph(0.03, 0x2c2140, MATTE, 6);
    at(dent, Math.cos(a) * 0.185, Math.sin(a * 1.7) * 0.1, Math.sin(a) * 0.185);
    g.add(sh, dent);
  }
  // mould: pale fuzz, hugging the skin. Big lumps read as rocks glued on, so
  // it's many small flattened blobs instead
  for (let i = 0; i < 30; i++) {
    const a = i * 2.399, y = -0.95 + (i / 30) * 1.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const fuzz = sph(0.013 + (i % 3) * 0.005, i % 2 ? 0x8d9483 : 0x6f7a66, { rough: 1, flat: true }, 5);
    at(fuzz, Math.cos(a) * r * 0.168, y * 0.155, Math.sin(a) * r * 0.168);
    fuzz.lookAt(0, 0, 0);
    fuzz.scale.set(1.5, 1.5, 0.5);   // flattened along the radial axis
    g.add(fuzz);
  }
  // a weeping drip
  const drip = sph(0.038, 0x6f8a3a, { rough: 0.25, opacity: 0.9 }, 7);
  at(drip, 0.02, -0.17, 0.05);
  drip.scale.set(0.8, 1.5, 0.8);
  g.add(drip);

  g.userData.spin = 'x';
  return g;
}

// ---------------- DUNG BALL ----------------
// Lumpy, wet, strawy, and orbited by two extremely committed flies.
function buildDung() {
  const g = new T.Group();
  g.add(sph(0.235, 0x5a4327, { rough: 1, flat: true }, 9));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399, y = -0.85 + (i / 9) * 1.7;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const lump = sph(0.055 + (i % 3) * 0.022, i % 2 ? 0x6b5233 : 0x4a361f, { rough: 1, flat: true }, 6);
    at(lump, Math.cos(a) * r * 0.215, y * 0.215, Math.sin(a) * r * 0.215);
    g.add(lump);
  }
  // straw and grass ends poking out
  for (let i = 0; i < 7; i++) {
    const a = i * 1.9;
    const straw = cyl(0.006, 0.009, 0.12 + (i % 3) * 0.06, i % 2 ? 0xa8924f : 0x7d8a3f, MATTE, 4);
    at(straw, Math.cos(a) * 0.21, Math.sin(i * 2.1) * 0.16, Math.sin(a) * 0.21,
      Math.sin(i) * 1.2, a, Math.cos(i) * 1.1);
    g.add(straw);
  }
  // a damp shine so it reads as fresh. sorry.
  const shine = sph(0.09, 0x8a6f42, { rough: 0.12, opacity: 0.5 }, 7);
  at(shine, -0.09, 0.16, 0.1);
  shine.scale.set(1.4, 0.6, 1);
  g.add(shine);

  const flies = new T.Group();
  for (let i = 0; i < 2; i++) {
    const f = new T.Group();
    const bod = sph(0.028, 0x1b1b1f, { rough: 0.4 }, 6);
    bod.scale.z = 1.6;
    const eye = sph(0.016, 0x8a2f2f, { rough: 0.2 }, 5);
    eye.position.z = 0.035;
    f.add(bod, eye);
    for (const s of [-1, 1]) {
      const w = new T.Mesh(new T.PlaneGeometry(0.06, 0.03),
        mat(0xdfe9f5, { opacity: 0.42, side: T.DoubleSide, rough: 0.2 }));
      at(w, 0.03 * s, 0.02, -0.01, 0, 0, s * 0.4);
      f.add(w);
    }
    f.userData.phase = i * Math.PI;
    flies.add(f);
  }
  g.add(flies);

  g.userData.spin = 'roll';
  g.userData.anim = { flies };
  return g;
}

// ---------------- THE LOOGIE ----------------
// Translucent, stretched, with a darker nucleus and a tail of droplets that
// haven't caught up yet.
function buildLoogie() {
  const g = new T.Group();
  const goo = { rough: 0.05, metal: 0.1, opacity: 0.78 };
  const head = sph(0.115, 0xb8e858, goo, 14);
  head.scale.set(1, 0.94, 1.9);
  head.position.z = 0.05;
  const nucleus = sph(0.06, 0x86bb2f, { rough: 0.3, opacity: 0.85 }, 8);
  nucleus.scale.set(1, 0.9, 1.4);
  const nose = sph(0.06, 0xd4f58a, { rough: 0.02, opacity: 0.6 }, 8);
  nose.position.z = 0.24;
  g.add(head, nucleus, nose);
  for (let i = 0; i < 4; i++) {
    const d = sph(0.055 - i * 0.01, 0xb8e858, { rough: 0.05, opacity: 0.62 - i * 0.1 }, 7);
    at(d, Math.sin(i * 2.1) * 0.035, Math.cos(i * 1.7) * 0.03, -0.2 - i * 0.11);
    d.scale.set(1, 1, 1.3);
    g.add(d);
  }
  const gleam = sph(0.03, 0xf2ffd0, { rough: 0.02, opacity: 0.85 }, 6);
  at(gleam, -0.035, 0.055, 0.15);
  g.add(gleam);
  g.userData.anim = { wobble: g };
  return g;
}

// ---------------- BEE BOMB ----------------
// A proper little aerial bomb in wasp livery. +Z is the pointy end.
function buildBeeBomb() {
  const g = new T.Group();
  const dark = 0x2b2b2b;
  const body = sph(0.075, 0xd9a514, { rough: 0.45 }, 10);
  body.scale.set(1, 1, 1.9);
  const nose = cone(0.055, 0.1, dark, { rough: 0.4 });
  at(nose, 0, 0, 0.18, Math.PI / 2, 0, 0);
  g.add(body, nose);
  for (let i = 0; i < 2; i++) {
    const band = new T.Mesh(new T.TorusGeometry(0.072, 0.018, 6, 12), mat(dark, { rough: 0.5 }));
    band.position.z = -0.02 + i * 0.075;
    g.add(band);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = box(0.012, 0.075, 0.075, dark, { rough: 0.5 });
    at(fin, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.15, 0, 0, a);
    g.add(fin);
  }
  const ring = new T.Mesh(new T.TorusGeometry(0.05, 0.008, 5, 10), mat(dark, { rough: 0.5 }));
  ring.position.z = -0.185;
  g.add(ring);
  g.userData.spin = 'z';
  return g;
}

// ---------------- public: projectiles ----------------
const PROJ = {
  bazooka: buildAcorn, grenade: buildBerry, cluster: buildRotten,
  dungball: buildDung, loogie: buildLoogie, bee52: buildBeeBomb,
};

export function makeProjectile(weaponId) {
  const build = PROJ[weaponId];
  const g = build ? build() : (() => { const q = new T.Group(); q.add(sph(0.12, 0x333333, { rough: 0.6 }, 8)); return q; })();
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.userData.t = 0;
  return g;
}

export function makeBeeBomb() {
  const g = buildBeeBomb();
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.userData.t = 0;
  return g;
}

// Per-frame life for a flying projectile, called AFTER game.js has lookAt'd
// the mesh down the path — which is why the roll is applied here and not by
// assigning to rotation.z (lookAt would wipe it every frame).
export function animateProjectile(mesh, dt, roll = 0) {
  const u = mesh.userData;
  u.t = (u.t || 0) + dt;
  const t = u.t;
  if (u.spin === 'roll') mesh.rotateX(roll);
  else if (u.spin) mesh.rotateZ(roll);
  const a = u.anim;
  if (!a) return;
  if (a.plume) {
    const p = 0.82 + Math.sin(t * 47) * 0.18 + Math.sin(t * 13) * 0.06;
    a.plume.scale.set(0.85 + p * 0.2, 0.85 + p * 0.2, p);
  }
  if (a.spark) {
    const f = 0.8 + Math.sin(t * 33) * 0.25 + Math.sin(t * 71) * 0.12;
    a.spark.scale.setScalar(f);
  }
  if (a.flies) {
    for (const f of a.flies.children) {
      const ph = f.userData.phase + t * 6.5;
      f.position.set(Math.cos(ph) * 0.34, Math.sin(ph * 1.7) * 0.16, Math.sin(ph) * 0.34);
      f.rotation.y = -ph + Math.PI / 2;
    }
  }
  if (a.wobble) {
    a.wobble.scale.set(1 + Math.sin(t * 19) * 0.09, 1 + Math.sin(t * 19 + 2) * 0.09, 1 - Math.sin(t * 19) * 0.06);
  }
}

// fuse spark for bounce weapons
export function makeFuseGlow() {
  const s = sph(0.032, 0xffe27a, { emissive: 0xffb020, emissiveIntensity: 2.4 }, 7);
  const halo = sph(0.062, 0xffb020, { emissive: 0xff8a1a, emissiveIntensity: 1.4, opacity: 0.4 }, 6);
  s.add(halo);
  return s;
}

// ---------------- THE SHOE ----------------
// One colossal flip-flop of judgement. The sole is an extruded footprint
// outline, because from directly overhead — the only angle anyone ever sees it
// from — a disc reads as a coaster and a foot reads as doom.
// Half-width of the sole as a function of length. Catmull-Rom through these
// anchors, mirrored, gives a closed footprint: narrow heel, pinched arch, wide
// ball, rounded toe. Straight-line segments between dense samples are smooth
// enough and avoid the wobble a hand-placed bezier control point introduces.
const FOOT = [
  [-2.05, 0.02], [-1.92, 0.42], [-1.62, 0.66], [-1.15, 0.66], [-0.55, 0.60],
  [0.10, 0.68], [0.72, 0.86], [1.25, 0.94], [1.68, 0.88], [1.96, 0.58], [2.08, 0.04],
];
function catmull(pts, z) {
  let i = 1;
  while (i < pts.length - 2 && pts[i + 1][0] < z) i++;
  const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
  const t = Math.max(0, Math.min(1, (z - p1[0]) / (p2[0] - p1[0] || 1)));
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
}
function footShape(inset = 0) {
  const N = 34, z0 = FOOT[0][0], z1 = FOOT[FOOT.length - 1][0];
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const z = z0 + (z1 - z0) * (i / N);
    pts.push(new T.Vector2(Math.max(0.01, catmull(FOOT, z) - inset), z));
  }
  for (let i = N; i >= 0; i--) {
    const z = z0 + (z1 - z0) * (i / N);
    pts.push(new T.Vector2(-Math.max(0.01, catmull(FOOT, z) - inset), z));
  }
  return new T.Shape(pts);
}

export function makeShoe() {
  const g = new T.Group();

  const soleGeo = new T.ExtrudeGeometry(footShape(0),
    { depth: 0.2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  const sole = new T.Mesh(soleGeo, mat(0x2e6fd9, { rough: 0.62 }));
  at(sole, 0, -0.12, 0, -Math.PI / 2, 0, 0);

  const bedGeo = new T.ExtrudeGeometry(footShape(0.06),
    { depth: 0.09, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  const bed = new T.Mesh(bedGeo, mat(0x7aa8f0, { rough: 0.55 }));
  at(bed, 0, 0.09, 0, -Math.PI / 2, 0, 0);
  g.add(sole, bed);

  // worn patches where a heel and a ball of a foot have ground it down
  const heel = cyl(0.5, 0.5, 0.025, 0x5f8fd4, { rough: 0.9 }, 16);
  at(heel, 0, 0.19, -1.42);
  const ball = cyl(0.46, 0.46, 0.025, 0x5f8fd4, { rough: 0.9 }, 16);
  at(ball, 0, 0.19, 0.95);
  ball.scale.set(1.5, 1, 0.9);
  g.add(heel, ball);

  // Y-strap: a swept tube from each side of the sole up to the toe post
  for (const s of [-1, 1]) {
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(0.78 * s, 0.06, -0.35),
      new T.Vector3(0.72 * s, 0.42, 0.25),
      new T.Vector3(0.34 * s, 0.52, 0.95),
      new T.Vector3(0.05 * s, 0.44, 1.42),
    ]);
    const strap = new T.Mesh(new T.TubeGeometry(curve, 16, 0.1, 8, false), mat(0xf5f0e6, { rough: 0.5 }));
    g.add(strap);
  }
  const post = cyl(0.07, 0.1, 0.38, 0xf5f0e6, { rough: 0.5 }, 8);
  at(post, 0, 0.26, 1.45);
  const knot = sph(0.13, 0xe8e0cf, { rough: 0.5 }, 8);
  at(knot, 0, 0.46, 1.44);
  g.add(post, knot);

  // tread bars + one deeply unlucky stone
  for (let i = 0; i < 8; i++) {
    const z = -1.5 + i * 0.44;
    const bar = box(catmull(FOOT, z) * 1.5, 0.07, 0.16, 0x24589f, { rough: 0.9 });
    at(bar, 0, -0.32, z);
    g.add(bar);
  }
  const stone = sph(0.11, 0x9a9384, { rough: 1, flat: true }, 6);
  at(stone, 0.28, -0.34, -0.55);
  g.add(stone);

  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ---------------- BEE-52 ----------------
// Freelance wasp with a leather flight cap, goggles, a bomb rack and wings
// blurred by a translucent arc. Flies +Z.
export function makeBomber() {
  const g = new T.Group();
  const gold = 0xd9a514, dark = 0x232323;

  const thorax = sph(0.2, 0x4a3c1e, { rough: 0.6 }, 10);
  thorax.scale.set(1, 0.95, 1.15);
  thorax.position.z = 0.1;
  g.add(thorax);
  for (let i = 0; i < 4; i++) {
    const seg = sph(0.19 - i * 0.028, i % 2 ? dark : gold, { rough: 0.5 }, 9);
    seg.scale.set(1, 0.94, 0.62);
    seg.position.z = -0.13 - i * 0.1;
    g.add(seg);
  }
  const sting = cone(0.038, 0.16, dark, { rough: 0.4 });
  at(sting, 0, 0, -0.58, -Math.PI / 2, 0, 0);
  g.add(sting);

  // head, leather cap, goggles
  const head = sph(0.13, 0x3a3020, { rough: 0.55 }, 9);
  head.position.z = 0.32;
  const cap = new T.Mesh(new T.SphereGeometry(0.135, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(0x6b4a28, { rough: 0.8 }));
  at(cap, 0, 0.02, 0.31);
  g.add(head, cap);
  for (const s of [-1, 1]) {
    const rim = new T.Mesh(new T.TorusGeometry(0.055, 0.016, 6, 12), mat(0x8a5a2a, { rough: 0.5 }));
    at(rim, 0.062 * s, 0.045, 0.41);
    const lens = cyl(0.046, 0.046, 0.012, 0x9fd6ef, { rough: 0.08, metal: 0.4, opacity: 0.85 }, 10);
    at(lens, 0.062 * s, 0.045, 0.415, Math.PI / 2, 0, 0);
    const strap = box(0.02, 0.03, 0.1, 0x6b4a28, { rough: 0.8 });
    at(strap, 0.115 * s, 0.05, 0.36);
    g.add(rim, lens, strap);
  }
  const scarf = box(0.14, 0.05, 0.26, 0xc4342a, { rough: 0.85 });
  at(scarf, -0.02, -0.02, 0.16, 0.2, 0.3, 0);
  g.add(scarf);

  // wings: a solid blade plus a translucent blur arc
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new T.Group();
    w.position.set(0.14 * s, 0.14, 0.02);
    const blade = new T.Mesh(new T.PlaneGeometry(0.46, 0.17),
      mat(0xd8ecff, { opacity: 0.5, side: T.DoubleSide, rough: 0.15 }));
    at(blade, 0.23 * s, 0, 0);
    const blur = new T.Mesh(new T.CircleGeometry(0.3, 14, -0.7, 1.4),
      mat(0xcfe4ff, { opacity: 0.16, side: T.DoubleSide, rough: 0.2 }));
    at(blur, 0.12 * s, 0, 0, Math.PI / 2, 0, s > 0 ? 0 : Math.PI);
    w.add(blade, blur);
    w.userData.side = s;
    g.add(w); wings.push(w);
  }

  // bomb rack under the belly
  const rack = box(0.09, 0.04, 0.34, 0x4a4038, { metal: 0.5, rough: 0.5 });
  at(rack, 0, -0.19, -0.02);
  g.add(rack);
  for (let i = 0; i < 3; i++) {
    const bomb = sph(0.045, dark, { rough: 0.5 }, 6);
    bomb.scale.set(1, 1, 1.7);
    at(bomb, 0, -0.24, 0.1 - i * 0.12);
    g.add(bomb);
  }

  g.userData.wings = wings;
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

export function animateBomber(b, t) {
  for (const w of b.userData.wings) w.rotation.z = w.userData.side * (0.35 + Math.sin(t * 55) * 0.55);
  b.position.y += Math.sin(t * 9) * 0.004;
  b.rotation.z = Math.sin(t * 2.3) * 0.09;
}

// ---------------- reticle ----------------
// Called-from-the-sky targeting: corner brackets, a spinning dashed ring, a
// pulsing pip and a soft column of light, so the landing spot is legible even
// over a ledge that has already been chewed to bits.
export function makeReticle(color = 0xff5a3a) {
  const g = new T.Group();
  const glow = { emissive: color, emissiveIntensity: 1.5, rough: 0.3 };

  const ring = new T.Mesh(new T.TorusGeometry(0.72, 0.035, 8, 32), mat(color, glow));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  const dashes = new T.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = box(0.16, 0.03, 0.05, color, glow);
    at(d, Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0, -a, 0);
    dashes.add(d);
  }
  g.add(dashes);

  const brackets = new T.Group();
  for (let i = 0; i < 4; i++) {
    const holder = new T.Group();
    holder.rotation.y = -(Math.PI / 4 + (i / 4) * Math.PI * 2);
    const arm1 = box(0.3, 0.045, 0.05, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
    at(arm1, 1.28, 0, -0.16);
    const arm2 = box(0.05, 0.045, 0.3, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
    at(arm2, 1.15, 0, -0.03);
    holder.add(arm1, arm2);
    brackets.add(holder);
  }
  g.add(brackets);

  for (let i = 0; i < 2; i++) g.add(box(i ? 0.05 : 0.44, 0.03, i ? 0.44 : 0.05, color, glow));
  const dot = sph(0.1, 0xfff0d0, { emissive: color, emissiveIntensity: 2.2 }, 8);
  g.add(dot);

  const beam = new T.Mesh(new T.CylinderGeometry(0.62, 0.9, 3.2, 16, 1, true),
    mat(color, { emissive: color, emissiveIntensity: 0.6, opacity: 0.14, side: T.DoubleSide }));
  beam.position.y = 1.6;
  g.add(beam);

  g.userData.ring = ring;
  g.userData.anim = { dashes, brackets, dot, beam };
  g.userData.t = 0;
  return g;
}

export function animateReticle(g, dt) {
  const a = g.userData.anim;
  if (!a) return;
  const t = (g.userData.t = (g.userData.t || 0) + dt);
  a.dashes.rotation.y += dt * 1.4;
  a.brackets.rotation.y -= dt * 0.5;
  a.brackets.scale.setScalar(1 + Math.sin(t * 6) * 0.18);
  a.dot.scale.setScalar(1 + Math.sin(t * 9) * 0.25);
  a.beam.material.opacity = 0.1 + Math.abs(Math.sin(t * 2.2)) * 0.09;
}

// ---------------- dotted trajectory preview ----------------
export function makeTrajectory(n = 26) {
  const g = new T.Group();
  const geo = new T.SphereGeometry(0.055, 7, 6);
  // two materials, so the arc reads hot at the muzzle and cool at the apex
  const near = mat(0xfff0c0, { emissive: 0xffd070, emissiveIntensity: 1.6, opacity: 0.9 });
  const far = mat(0xcfe8ff, { emissive: 0x9fd0ff, emissiveIntensity: 1.1, opacity: 0.55 });
  for (let i = 0; i < n; i++) {
    const d = new T.Mesh(geo, i < n * 0.4 ? near : far);
    d.visible = false;
    g.add(d);
  }
  return g;
}
export function setTrajectory(g, path, upTo = 1.0) {
  const dots = g.children;
  const tMax = Math.min(path[path.length - 1].t, upTo);
  for (let i = 0; i < dots.length; i++) {
    const t = (i / (dots.length - 1)) * tMax;
    let p = null;
    for (let k = 1; k < path.length; k++) if (path[k].t >= t) { p = path[k]; break; }
    if (!p) { dots[i].visible = false; continue; }
    dots[i].visible = true;
    dots[i].position.set(p.x, p.y, p.z);
    dots[i].scale.setScalar(1.15 - (i / dots.length) * 0.7);
  }
}
