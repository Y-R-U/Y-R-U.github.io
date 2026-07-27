// LONGSHOT — the rifle you actually hold.
//
// One procedural builder covering all seven guns in the armory, so buying up
// the catalogue visibly changes the thing in your hands: the R700's walnut
// gives way to a chassis stock, the barrel grows and gets fluted, brakes and
// bipods appear, the DMR swaps its bolt for a charging handle and a long box
// mag, the Whisper wears an integral can, the AMR is a different animal
// entirely, and the Meridian is a rail gun with coils that glow.
//
// LOCAL FRAME — the same convention everywhere in this file:
//     -Z = muzzle / downrange      +X = right      +Y = up
// The origin sits at the grip/magwell so the butt never pokes behind the eye.
// Everything is merged per material at the end: one draw call per material,
// not one per bolt head.

import * as THREE from 'three';

const T = THREE;

/* ── palettes ──────────────────────────────────────────────────────────────
   Kept deliberately desaturated: Meridian City is blue-grey and a bright gun
   reads as a toy against it.                                                */
const FINISH = {
  wood:  { color: 0x6a4526, roughness: 0.62, metalness: 0.05 },
  wood2: { color: 0x53341c, roughness: 0.68, metalness: 0.04 },
  olive: { color: 0x555c44, roughness: 0.78, metalness: 0.06 },
  tan:   { color: 0x7d7053, roughness: 0.8,  metalness: 0.05 },
  poly:  { color: 0x2b2f33, roughness: 0.72, metalness: 0.08 },
  grey:  { color: 0x4a5157, roughness: 0.6,  metalness: 0.25 },
  proto: { color: 0x2d3742, roughness: 0.32, metalness: 0.72 },
};
const STEEL   = { color: 0x51585e, roughness: 0.38, metalness: 0.85 };
const STEEL_D = { color: 0x33393e, roughness: 0.46, metalness: 0.78 };
const BLACK   = { color: 0x24282b, roughness: 0.55, metalness: 0.45 };
const BLACK2  = { color: 0x171a1c, roughness: 0.62, metalness: 0.3 };

/* ── per-rifle character ─────────────────────────────────────────────────── */
const LOOK = {
  r700:     { furniture:'wood',  barrel:0.60, bore:0.0145, brake:'none',  bipod:false, mag:'internal', action:'bolt', stock:'classic' },
  kestrel:  { furniture:'olive', barrel:0.66, bore:0.0155, brake:'small', bipod:true,  mag:'box',      action:'bolt', stock:'classic' },
  vantage:  { furniture:'poly',  barrel:0.70, bore:0.0175, brake:'match', bipod:true,  mag:'box',      action:'bolt', stock:'chassis', fluted:true },
  dmr8:     { furniture:'poly',  barrel:0.54, bore:0.0150, brake:'flash', bipod:false, mag:'longbox',  action:'semi', stock:'chassis' },
  whisper:  { furniture:'grey',  barrel:0.44, bore:0.0150, brake:'can',   bipod:true,  mag:'box',      action:'bolt', stock:'chassis' },
  longbow:  { furniture:'tan',   barrel:0.92, bore:0.0245, brake:'amr',   bipod:true,  mag:'bigbox',   action:'bolt', stock:'amr',     fluted:true, big:true },
  meridian: { furniture:'proto', barrel:0.76, bore:0.0180, brake:'coil',  bipod:true,  mag:'box',      action:'rail', stock:'skeleton', glow:0x6fd8ff },
};
const DEFAULT_LOOK = LOOK.r700;

/* ── scope tiers: bigger glass as you buy up ─────────────────────────────── */
const OPTIC = {
  mk2:    { tube:0.028, len:0.30, obj:0.040, oc:0.034, tint:0x1d4a66, glow:false },
  hawk:   { tube:0.030, len:0.34, obj:0.046, oc:0.036, tint:0x1d5570, glow:false },
  falcon: { tube:0.032, len:0.38, obj:0.052, oc:0.038, tint:0x225f7a, glow:false },
  owl:    { tube:0.034, len:0.40, obj:0.058, oc:0.040, tint:0x2a6f88, glow:true },
};

/* ── build helpers ─────────────────────────────────────────────────────────
   Parts are collected as {geometry, matrix, key} and merged at the end.     */
class Builder {
  constructor() { this.parts = new Map(); this.mats = new Map(); }
  mat(key, spec) {
    if (!this.mats.has(key)) {
      const m = new T.MeshStandardMaterial(spec);
      if (spec.emissive !== undefined) m.emissive = new T.Color(spec.emissive);
      if (spec.emissiveIntensity !== undefined) m.emissiveIntensity = spec.emissiveIntensity;
      this.mats.set(key, m);
    }
    return key;
  }
  add(key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new T.Matrix4().compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)),
      new T.Vector3(sx, sy, sz));
    const g = geo.clone();
    g.applyMatrix4(m);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  // a cylinder whose axis runs along Z — barrels, tubes, cans
  tube(key, r1, r2, len, x, y, z, seg = 12) {
    return this.add(key, new T.CylinderGeometry(r1, r2, len, seg), x, y, z, Math.PI / 2, 0, 0);
  }
  box(key, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(key, new T.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }
  build() {
    const group = new T.Group();
    for (const [key, geos] of this.parts) {
      if (!geos.length) continue;
      const merged = mergeGeos(geos);
      const mesh = new T.Mesh(merged, this.mats.get(key));
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      group.add(mesh);
      geos.length = 0;
    }
    return group;
  }
}

/* Minimal mergeBufferGeometries (position/normal/uv, non-indexed) so we don't
   need the addons util just for this. */
function mergeGeos(geos) {
  let total = 0;
  const parts = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    parts.push(ng);
    total += ng.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    const u = g.attributes.uv ? g.attributes.uv.array : null;
    const c = g.attributes.position.count;
    pos.set(p, o * 3);
    if (n) nor.set(n, o * 3);
    if (u) uv.set(u, o * 2);
    o += c;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/* ── the rifle ─────────────────────────────────────────────────────────────
   Returns { group, muzzle } — muzzle is an Object3D at the crown, so the
   muzzle flash and smoke can be hung off the actual end of the barrel.      */
export function buildRifleViewmodel(rifle, scope) {
  const L = Object.assign({}, DEFAULT_LOOK, LOOK[rifle && rifle.id] || {});
  const S = OPTIC[(scope && scope.id)] || OPTIC.mk2;
  const b = new Builder();

  const FUR = b.mat('fur', FINISH[L.furniture] || FINISH.poly);
  const FUR2 = b.mat('fur2', L.furniture === 'wood' ? FINISH.wood2 : Object.assign({}, FINISH[L.furniture] || FINISH.poly, { color: 0x22262a }));
  const MET = b.mat('met', STEEL);
  const MET_D = b.mat('metd', STEEL_D);
  const BLK = b.mat('blk', BLACK);
  const BLK2 = b.mat('blk2', BLACK2);
  // Two different glasses. The objective catches sky and reads blue; the
  // ocular is the one you'd have your eye against, so it is nearly black —
  // a bright disc there dominates the whole viewmodel.
  // Both are flat CircleGeometry, not cylinder caps: a capped cylinder's
  // radial triangles shade into a pinwheel under a directional light.
  const LENS = b.mat('lens', { color: S.tint, roughness: 0.16, metalness: 0.1,
    emissive: S.glow ? 0x0e2c3a : 0x000000, emissiveIntensity: S.glow ? 0.8 : 0 });
  const LENS_OC = b.mat('lensoc', { color: 0x0d1418, roughness: 0.22, metalness: 0.1,
    emissive: S.glow ? 0x07171e : 0x000000, emissiveIntensity: S.glow ? 0.5 : 0 });
  const GLOW = L.glow ? b.mat('glow', { color: L.glow, roughness: 0.3, metalness: 0.1,
    emissive: L.glow, emissiveIntensity: 1.6 }) : null;

  const big = !!L.big;                      // the .50 is a bigger gun all over
  const w = big ? 1.22 : 1.0;               // lateral scale-ish factor
  const RECV_LEN = big ? 0.42 : 0.34;

  /* ---- receiver + chassis ------------------------------------------------ */
  b.box(BLK, 0.072 * w, 0.078 * w, RECV_LEN, 0, 0.028, -0.06);
  b.box(FUR, 0.092 * w, 0.058 * w, 0.22 * w, 0, -0.018, -0.10);            // chassis shell
  // full-length top rail with slots
  b.box(BLK2, 0.086 * w, 0.030, 0.44, 0, 0.070, -0.09);
  for (let z = -0.29; z < 0.11; z += 0.030) b.box(BLK, 0.090 * w, 0.012, 0.010, 0, 0.083, z);

  /* ---- barrel ------------------------------------------------------------ */
  const bore = L.bore, bl = L.barrel;
  const barrelZ = -0.20 - bl / 2;
  b.tube(MET_D, bore * 1.35, bore * 1.2, bl * 0.45, 0, 0.03, -0.20 - bl * 0.22, 14);  // chamber end
  b.tube(MET_D, bore * 1.1, bore, bl * 0.6, 0, 0.03, -0.20 - bl * 0.7, 12);           // muzzle end
  if (L.fluted) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(BLK2, 0.007, 0.007, bl * 0.42,
        Math.cos(a) * bore * 1.2, 0.03 + Math.sin(a) * bore * 1.2, -0.24 - bl * 0.25);
    }
  }

  /* ---- muzzle device ----------------------------------------------------- */
  const muzzleZ = -0.20 - bl;
  let crownZ = muzzleZ;
  if (L.brake === 'small') {
    b.tube(BLK2, bore * 1.7, bore * 1.7, 0.055, 0, 0.03, muzzleZ - 0.028, 12);
    for (let i = 0; i < 2; i++) b.box(BLK2, bore * 4, 0.008, 0.010, 0, 0.03, muzzleZ - 0.018 - i * 0.018);
    crownZ = muzzleZ - 0.056;
  } else if (L.brake === 'match') {
    b.tube(BLK2, bore * 1.9, bore * 2.0, 0.085, 0, 0.03, muzzleZ - 0.043, 12);
    for (let i = 0; i < 3; i++) {
      b.box(BLK2, bore * 4.6, 0.009, 0.011, 0, 0.03, muzzleZ - 0.018 - i * 0.021);
      b.box(BLK2, 0.011, bore * 4.6, 0.011, 0, 0.03, muzzleZ - 0.028 - i * 0.021);
    }
    crownZ = muzzleZ - 0.086;
  } else if (L.brake === 'flash') {
    b.tube(BLK2, bore * 1.5, bore * 1.9, 0.06, 0, 0.03, muzzleZ - 0.03, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.box(BLK2, 0.007, 0.020, 0.05, Math.cos(a) * bore * 1.6, 0.03 + Math.sin(a) * bore * 1.6, muzzleZ - 0.03);
    }
    crownZ = muzzleZ - 0.06;
  } else if (L.brake === 'amr') {
    // three-chamber anti-materiel brake — the loudest thing in the city
    b.tube(BLK2, bore * 1.5, bore * 1.5, 0.16, 0, 0.03, muzzleZ - 0.08, 12);
    for (let i = 0; i < 3; i++) {
      b.box(MET_D, bore * 5.4, 0.055, 0.016, 0, 0.03, muzzleZ - 0.028 - i * 0.05);
    }
    b.tube(MET_D, bore * 1.8, bore * 1.7, 0.03, 0, 0.03, muzzleZ - 0.155, 12);
    crownZ = muzzleZ - 0.17;
  } else if (L.brake === 'can') {
    // integral suppressor: a fat shroud over most of the barrel
    b.tube(FUR2, 0.030, 0.030, 0.40, 0, 0.03, -0.20 - bl - 0.10, 16);
    for (let z = -0.05; z > -0.36; z -= 0.06) b.tube(BLK2, 0.032, 0.032, 0.008, 0, 0.03, -0.24 + z, 16);
    b.tube(BLK2, 0.031, 0.028, 0.02, 0, 0.03, muzzleZ - 0.29, 16);
    crownZ = muzzleZ - 0.30;
  } else if (L.brake === 'coil') {
    // rail accelerator: stacked coils down the last third of the barrel
    for (let i = 0; i < 5; i++) {
      b.tube(MET, 0.030, 0.030, 0.016, 0, 0.03, muzzleZ + 0.13 - i * 0.038, 14);
      b.tube(GLOW || BLK2, 0.026, 0.026, 0.008, 0, 0.03, muzzleZ + 0.112 - i * 0.038, 14);
    }
    b.tube(MET_D, 0.024, 0.020, 0.05, 0, 0.03, muzzleZ - 0.025, 14);
    crownZ = muzzleZ - 0.05;
  }

  /* ---- handguard / fore-end --------------------------------------------- */
  if (L.furniture === 'wood') {
    // classic sporter fore-end with a schnabel tip
    b.box(FUR, 0.062, 0.070, 0.36, 0, 0.0, -0.34);
    b.box(FUR2, 0.066, 0.030, 0.05, 0, -0.018, -0.515);
    b.box(FUR2, 0.058, 0.010, 0.30, 0, -0.036, -0.34);
  } else {
    b.box(BLK, 0.074 * w, 0.066 * w, 0.30, 0, 0.026, -0.36);
    for (let z = -0.25; z > -0.50; z -= 0.048) {
      b.box(BLK2, 0.078 * w, 0.016, 0.026, 0, 0.006, z);                  // M-LOK slots
      b.box(BLK2, 0.016, 0.070 * w, 0.026, 0.038 * w, 0.026, z);
    }
    b.box(BLK2, 0.050, 0.012, 0.26, 0, 0.062, -0.36);                     // fore rail
  }

  /* ---- bipod ------------------------------------------------------------- */
  if (L.bipod) {
    b.box(BLK2, 0.050, 0.032, 0.05, 0, -0.014, -0.47);
    for (const s of [-1, 1]) {
      b.add(MET_D, new T.CylinderGeometry(0.007, 0.006, 0.15, 8),
        s * 0.024, -0.075, -0.49, 0.55, 0, s * 0.42);
      b.box(BLK2, 0.024, 0.012, 0.03, s * 0.056, -0.138, -0.415);
    }
  }

  /* ---- action: bolt handle / charging handle / rail block ---------------- */
  if (L.action === 'bolt') {
    b.add(MET, new T.CylinderGeometry(0.010, 0.010, 0.075, 8), 0.058 * w, 0.032, 0.045, 0, 0, Math.PI / 2);
    b.add(MET, new T.CylinderGeometry(0.016, 0.016, 0.022, 10), 0.100 * w, 0.032, 0.045, 0, 0, Math.PI / 2);
    b.box(BLK2, 0.008, 0.034, 0.075, 0.038 * w, 0.030, -0.01);            // ejection port
  } else if (L.action === 'semi') {
    b.box(BLK2, 0.052, 0.014, 0.032, 0, 0.062, 0.095);                    // charging handle
    b.box(BLK2, 0.008, 0.036, 0.088, 0.038 * w, 0.030, -0.02);            // long port
    b.box(BLK, 0.036, 0.048, 0.05, 0, 0.040, -0.235);                     // gas block
    b.add(MET_D, new T.CylinderGeometry(0.008, 0.008, 0.22, 8), 0, 0.058, -0.34, Math.PI / 2, 0, 0); // gas tube
  } else {
    // rail action: a capacitor block instead of a bolt
    b.box(BLK2, 0.060, 0.044, 0.10, 0, 0.052, 0.055);
    if (GLOW) for (let i = 0; i < 3; i++) b.box(GLOW, 0.052, 0.005, 0.010, 0, 0.070, 0.020 + i * 0.026);
  }

  /* ---- magazine ---------------------------------------------------------- */
  if (L.mag === 'box') {
    b.box(BLK2, 0.048, 0.095, 0.078, 0, -0.082, -0.045);
    b.box(MET_D, 0.052, 0.012, 0.082, 0, -0.134, -0.045);
  } else if (L.mag === 'longbox') {
    b.box(BLK2, 0.048, 0.150, 0.076, 0, -0.108, -0.040, 0.16, 0, 0);
    b.box(MET_D, 0.052, 0.012, 0.080, 0, -0.186, -0.028, 0.16, 0, 0);
    for (let i = 0; i < 4; i++) b.box(BLK, 0.050, 0.005, 0.078, 0, -0.055 - i * 0.032, -0.046 - i * 0.005, 0.16, 0, 0);
  } else if (L.mag === 'bigbox') {
    b.box(BLK2, 0.060, 0.115, 0.10, 0, -0.092, -0.050);
    b.box(MET_D, 0.066, 0.014, 0.105, 0, -0.156, -0.050);
  } else {
    b.box(FUR2, 0.048, 0.030, 0.11, 0, -0.046, -0.05);                    // internal box floorplate
    b.box(MET_D, 0.052, 0.010, 0.115, 0, -0.062, -0.05);
  }

  /* ---- grip, trigger, guard --------------------------------------------- */
  if (L.stock === 'classic') {
    // a wrist rather than a pistol grip
    b.box(FUR, 0.048, 0.090, 0.13, 0, -0.052, 0.098, -0.22, 0, 0);
  } else {
    b.box(FUR, 0.046, 0.118, 0.056, 0, -0.098, 0.104, -0.26, 0, 0);
    for (let i = 0; i < 4; i++) b.box(BLK2, 0.048, 0.006, 0.058, 0, -0.062 - i * 0.024, 0.098 + i * 0.006, -0.26, 0, 0);
  }
  b.box(MET_D, 0.012, 0.032, 0.012, 0, -0.052, 0.044);                    // trigger
  b.box(BLK, 0.042, 0.008, 0.062, 0, -0.070, 0.032);                      // guard
  b.box(BLK, 0.042, 0.026, 0.008, 0, -0.058, 0.062);

  /* ---- stock ------------------------------------------------------------- */
  if (L.stock === 'classic') {
    b.box(FUR, 0.058, 0.098, 0.30, 0, -0.012, 0.245, -0.035, 0, 0);       // comb
    b.box(FUR, 0.060, 0.050, 0.16, 0, 0.036, 0.20, -0.10, 0, 0);          // cheekpiece
    b.box(BLK2, 0.062, 0.108, 0.024, 0, -0.030, 0.392, -0.035, 0, 0);     // recoil pad
  } else if (L.stock === 'skeleton') {
    b.box(FUR, 0.050, 0.056, 0.20, 0, 0.002, 0.215);
    b.box(BLK, 0.044, 0.014, 0.16, 0, 0.044, 0.215);                      // upper strut
    b.box(BLK, 0.044, 0.014, 0.16, 0, -0.038, 0.215);                     // lower strut
    b.box(FUR, 0.056, 0.030, 0.12, 0, 0.052, 0.205);                      // cheek riser
    b.box(BLK2, 0.062, 0.104, 0.024, 0, -0.006, 0.322);
    if (GLOW) b.box(GLOW, 0.030, 0.006, 0.10, 0, 0.020, 0.215);
  } else if (L.stock === 'amr') {
    b.box(FUR, 0.070, 0.084, 0.30, 0, -0.004, 0.245);
    b.box(FUR, 0.076, 0.034, 0.15, 0, 0.052, 0.225);                      // big cheek shelf
    b.box(BLK2, 0.082, 0.120, 0.030, 0, -0.014, 0.406);                   // thick pad
    b.box(MET_D, 0.024, 0.036, 0.06, 0, -0.062, 0.372);                   // monopod
  } else {
    b.box(BLK, 0.050, 0.062, 0.20, 0, -0.004, 0.215);                     // chassis tube
    b.box(FUR, 0.058, 0.030, 0.13, 0, 0.046, 0.205);                      // adjustable comb
    b.box(BLK2, 0.062, 0.104, 0.026, 0, -0.014, 0.328);
    b.box(MET_D, 0.020, 0.030, 0.05, 0, -0.056, 0.300);                   // monopod
    b.box(BLK2, 0.042, 0.016, 0.09, 0, 0.026, 0.255);
  }

  /* ---- optic ------------------------------------------------------------- */
  const scZ = -0.10, scY = 0.128 + (big ? 0.008 : 0);
  b.tube(BLK, S.tube, S.tube, S.len, 0, scY, scZ, 16);
  b.tube(BLK2, S.obj, S.obj, 0.085, 0, scY, scZ - S.len / 2 - 0.035, 16);          // objective bell
  b.add(LENS, new T.CircleGeometry(S.obj * 0.92, 22), 0, scY, scZ - S.len / 2 - 0.078, 0, Math.PI, 0);
  b.tube(BLK2, S.oc, S.oc, 0.07, 0, scY, scZ + S.len / 2 + 0.03, 16);              // ocular bell
  b.add(LENS_OC, new T.CircleGeometry(S.oc * 0.9, 22), 0, scY, scZ + S.len / 2 + 0.064, 0, 0, 0);
  b.tube(BLK, S.tube * 1.15, S.tube * 1.15, 0.022, 0, scY, scZ + S.len * 0.28, 16); // magnification ring
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(BLK2, 0.006, 0.006, 0.022, Math.cos(a) * S.tube * 1.15, scY + Math.sin(a) * S.tube * 1.15, scZ + S.len * 0.28);
  }
  b.add(BLK2, new T.CylinderGeometry(0.019, 0.019, 0.028, 12), 0, scY + S.tube + 0.014, scZ - 0.02);            // elevation turret
  b.add(BLK2, new T.CylinderGeometry(0.017, 0.017, 0.026, 12), S.tube + 0.013, scY, scZ - 0.02, 0, 0, Math.PI / 2); // windage
  b.box(MET_D, 0.046, 0.052, 0.026, 0, scY - 0.036, scZ - S.len * 0.28);           // rings
  b.box(MET_D, 0.046, 0.052, 0.026, 0, scY - 0.036, scZ + S.len * 0.24);
  if (scope && scope.rangefinder) b.box(BLK2, 0.030, 0.026, 0.05, -(S.tube + 0.020), scY, scZ - 0.05);
  if (scope && scope.smart && GLOW === null) {
    // the OWL's electronics box gets its own glow even on non-glowing rifles
    const OG = b.mat('oglow', { color: 0x7fe0ff, roughness: 0.3, metalness: 0.1, emissive: 0x7fe0ff, emissiveIntensity: 1.4 });
    b.box(OG, 0.014, 0.006, 0.03, -(S.tube + 0.020), scY + 0.014, scZ - 0.05);
  }

  /* ---- sling swivels ----------------------------------------------------- */
  b.box(MET_D, 0.020, 0.016, 0.014, 0, -0.040, -0.46);
  b.box(MET_D, 0.020, 0.016, 0.014, 0, -0.040, 0.28);

  const group = b.build();
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0.03, crownZ - 0.01);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  group.userData.rifleId = rifle && rifle.id;
  return group;
}

/* Dispose everything a previous viewmodel allocated. */
export function disposeViewmodel(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh) {
      o.geometry && o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    }
  });
}
