// GRUDGE BUGS — procedural insects. One model per species, all primitives,
// all comedy: enormous googly eyes, faction outfits, cosmetic hats, and a
// generic procedural rig (idle/walk/aim/flinch/celebrate/panic/dead).
// Bug local +Z is forward, origin at the feet.

import * as THREE from 'three';
const T = THREE;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new T.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0.05,
      flatShading: opts.flat ?? false, transparent: !!opts.opacity,
      opacity: opts.opacity ?? 1, emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1, side: opts.side ?? T.FrontSide,
    }));
  }
  return matCache.get(key);
}
const sph = (r, c, o) => new T.Mesh(new T.SphereGeometry(r, 12, 10), mat(c, o));
const cyl = (r1, r2, h, c, o) => new T.Mesh(new T.CylinderGeometry(r1, r2, h, 10), mat(c, o));
const box = (x, y, z, c, o) => new T.Mesh(new T.BoxGeometry(x, y, z), mat(c, o));
const cone = (r, h, c, o) => new T.Mesh(new T.ConeGeometry(r, h, 12), mat(c, o));

// ---------------- googly eyes ----------------
function makeEye(r = 0.085) {
  const g = new T.Group();
  const white = sph(r, 0xffffff, { rough: 0.35 });
  const pupil = sph(r * 0.45, 0x141414, { rough: 0.3 });
  pupil.position.z = r * 0.72;
  g.add(white, pupil);
  g.userData = { pupil, r };
  return g;
}

// ---------------- legs (single bent look via two joined cylinders) ----------------
function makeLeg(len, color, thick = 0.028) {
  const g = new T.Group();
  const upper = cyl(thick, thick * 0.85, len * 0.55, color);
  upper.position.y = -len * 0.27;
  const lowerG = new T.Group();
  lowerG.position.y = -len * 0.5;
  const lower = cyl(thick * 0.85, thick * 0.6, len * 0.55, color);
  lower.position.y = -len * 0.26;
  lowerG.add(lower);
  lowerG.rotation.x = 0.7;
  g.add(upper, lowerG);
  g.userData = { lowerG };
  return g;
}

// ---------------- faction outfits ----------------
function makeOutfit(kind, accent) {
  const g = new T.Group();
  if (kind === 'fedora') {
    const crown = cyl(0.1, 0.13, 0.11, 0x3a3230); crown.position.y = 0.05;
    const brim = cyl(0.2, 0.2, 0.02, 0x3a3230);
    const band = cyl(0.125, 0.13, 0.035, accent); band.position.y = 0.02;
    g.add(crown, brim, band);
  } else if (kind === 'hardhat') {
    const dome = sph(0.15, accent, { rough: 0.4 }); dome.scale.y = 0.72; dome.position.y = 0.03;
    const brim = cyl(0.19, 0.19, 0.025, accent, { rough: 0.4 });
    g.add(dome, brim);
  } else if (kind === 'tophat') {
    const crown = cyl(0.11, 0.11, 0.22, 0x1b1520); crown.position.y = 0.11;
    const brim = cyl(0.18, 0.18, 0.02, 0x1b1520);
    const band = cyl(0.115, 0.115, 0.04, accent); band.position.y = 0.03;
    g.add(crown, brim, band);
  } else if (kind === 'tie') {
    const knot = box(0.05, 0.045, 0.03, accent);
    const strip = box(0.055, 0.16, 0.025, accent); strip.position.y = -0.1;
    const tip = cone(0.04, 0.05, accent); tip.rotation.x = Math.PI; tip.position.y = -0.2;
    g.add(knot, strip, tip);
    g.userData.isTie = true;
  } else if (kind === 'strawhat') {
    const crownS = cyl(0.12, 0.15, 0.09, 0xd9c069); crownS.position.y = 0.04;
    const brimS = cyl(0.3, 0.32, 0.018, 0xd9c069);
    g.add(crownS, brimS);
  }
  return g;
}

// ---------------- cosmetic hats ----------------
export function makeHat(id) {
  const g = new T.Group();
  if (id === 'cone') {
    const c = cone(0.13, 0.26, 0xe86a1f); c.position.y = 0.12;
    const stripe = cyl(0.085, 0.1, 0.05, 0xf5f0e6); stripe.position.y = 0.12;
    const base = box(0.22, 0.02, 0.22, 0xe86a1f);
    g.add(c, stripe, base);
  } else if (id === 'party') {
    const c = cone(0.1, 0.24, 0xd94fd0); c.position.y = 0.11;
    const pom = sph(0.045, 0xffe94a); pom.position.y = 0.24;
    g.add(c, pom);
  } else if (id === 'chef') {
    const base = cyl(0.11, 0.11, 0.08, 0xf7f5ee); base.position.y = 0.03;
    const puff = sph(0.14, 0xf7f5ee); puff.scale.y = 0.75; puff.position.y = 0.12;
    g.add(base, puff);
  } else if (id === 'cowboy') {
    const dome = sph(0.1, 0x8a5a2a); dome.scale.y = 0.75; dome.position.y = 0.04;
    const brim = cyl(0.2, 0.21, 0.022, 0x8a5a2a);
    brim.geometry = brim.geometry.clone();
    g.add(dome, brim);
  } else if (id === 'viking') {
    const dome = sph(0.13, 0x8f9aa6, { metal: 0.6, rough: 0.35 }); dome.scale.y = 0.7;
    for (const s of [-1, 1]) {
      const horn = cone(0.045, 0.16, 0xf2ead2);
      horn.position.set(0.13 * s, 0.07, 0); horn.rotation.z = -s * 0.9;
      g.add(horn);
    }
    g.add(dome);
  } else if (id === 'crown') {
    const band = cyl(0.1, 0.11, 0.07, 0xf2c53d, { metal: 0.7, rough: 0.3 }); band.position.y = 0.03;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = cone(0.026, 0.07, 0xf2c53d, { metal: 0.7, rough: 0.3 });
      spike.position.set(Math.cos(a) * 0.095, 0.09, Math.sin(a) * 0.095);
      g.add(spike);
    }
    g.add(band);
  } else if (id === 'halo') {
    const ring = new T.Mesh(new T.TorusGeometry(0.12, 0.02, 8, 24),
      mat(0xffe94a, { emissive: 0xffd94a, emissiveIntensity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16;
    ring.userData.float = true;
    g.add(ring);
  }
  return g;
}

// ---------------- species builders ----------------
// Every builder returns parts hooked into the shared rig contract:
// { root, body, head, eyes[], legs[], extras:{wings?,antennae?,arms?,tail?} }

function buildAnt(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.3; root.add(body);
  const abdomen = sph(0.19, color); abdomen.scale.set(1, 0.92, 1.25); abdomen.position.z = -0.26;
  const thorax = sph(0.13, color); thorax.scale.set(1, 0.95, 1.1);
  const head = new T.Group(); head.position.set(0, 0.09, 0.19);
  const skull = sph(0.16, color); skull.scale.set(0.95, 1, 0.95);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.075); e.position.set(0.075 * s, 0.05, 0.115); head.add(e); eyes.push(e);
  }
  // mandibles
  for (const s of [-1, 1]) {
    const m = cone(0.03, 0.09, accent); m.position.set(0.05 * s, -0.07, 0.13);
    m.rotation.set(1.4, 0, -s * 0.5); head.add(m);
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(0.06 * s, 0.13, 0.08);
    const seg = cyl(0.015, 0.012, 0.18, color); seg.position.y = 0.09; a.add(seg);
    const tip = cyl(0.012, 0.01, 0.12, color); tip.position.set(0, 0.2, 0.04); tip.rotation.x = 0.7; a.add(tip);
    a.rotation.set(-0.4, 0, s * 0.35); head.add(a); antennae.push(a);
  }
  body.add(abdomen, thorax, head);
  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.34, color);
    leg.position.set(0.11 * s, 0.28, 0.08 - i * 0.13);
    leg.rotation.z = s * 0.85;
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { antennae }, headY: 0.39, scale: 1 };
}

function buildBeetle(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.3; root.add(body);
  const shell = sph(0.26, color); shell.scale.set(1, 0.82, 1.15); shell.position.set(0, 0.05, -0.06);
  const shine = sph(0.262, 0xffffff, { opacity: 0.13, rough: 0.2 });
  shine.scale.set(0.95, 0.75, 1.1); shine.position.copy(shell.position); shine.position.y += 0.02;
  const seam = box(0.012, 0.2, 0.5, accent); seam.position.set(0, 0.2, -0.06);
  // hi-vis stripe across the shell
  const stripe = new T.Mesh(new T.TorusGeometry(0.24, 0.03, 8, 24, Math.PI),
    mat(accent, { emissive: accent, emissiveIntensity: 0.25 }));
  stripe.rotation.set(0, 0, Math.PI); stripe.position.set(0, 0.1, -0.06); stripe.rotation.x = Math.PI / 2.2;
  const head = new T.Group(); head.position.set(0, 0.02, 0.24);
  const skull = sph(0.13, color);
  head.add(skull);
  const horn = cone(0.035, 0.16, color); horn.position.set(0, 0.1, 0.06); horn.rotation.x = -0.5;
  head.add(horn);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.065); e.position.set(0.07 * s, 0.03, 0.09); head.add(e); eyes.push(e);
  }
  body.add(shell, shine, seam, stripe, head);
  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.26, 0x2c3448, 0.035);
    leg.position.set(0.17 * s, 0.24, 0.1 - i * 0.14);
    leg.rotation.z = s * 0.7;
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: {}, headY: 0.32, scale: 1 };
}

function buildSpider(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.34; root.add(body);
  const abdomen = sph(0.22, color); abdomen.scale.set(1, 1.05, 1.2); abdomen.position.set(0, 0.08, -0.22);
  const marking = sph(0.1, accent); marking.scale.set(1, 0.5, 1.2); marking.position.set(0, 0.24, -0.22);
  const front = sph(0.14, color); front.position.z = 0.05;
  const head = new T.Group(); head.position.set(0, 0.04, 0.14);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.07); e.position.set(0.06 * s, 0.04, 0.08); head.add(e); eyes.push(e);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const little = makeEye(0.028);
    little.position.set(0.11 * s - s * k * 0.035, 0.1 - k * 0.035, 0.06);
    head.add(little); eyes.push(little);
  }
  for (const s of [-1, 1]) {
    const fang = cone(0.022, 0.07, 0xf0e8f5); fang.rotation.x = Math.PI;
    fang.position.set(0.035 * s, -0.06, 0.1); head.add(fang);
  }
  body.add(abdomen, marking, front, head);
  const legs = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.42, color, 0.025);
    leg.position.set(0.1 * s, 0.36, 0.1 - i * 0.1);
    leg.rotation.z = s * (1.0 - i * 0.06);
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 1.7;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: {}, headY: 0.38, scale: 1 };
}

function buildWasp(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.36; root.add(body);
  // striped abdomen
  const abd = new T.Group(); abd.position.set(0, 0.02, -0.24); abd.rotation.x = 0.35;
  for (let i = 0; i < 4; i++) {
    const ring = sph(0.16 - i * 0.02, i % 2 === 0 ? color : 0x232323);
    ring.scale.set(1, 1, 0.62); ring.position.z = -i * 0.085;
    abd.add(ring);
  }
  const sting = cone(0.035, 0.12, 0x232323); sting.rotation.x = Math.PI - 0.35; sting.position.set(0, -0.1, -0.56);
  abd.add(sting);
  const thorax = sph(0.13, 0x38342c);
  const head = new T.Group(); head.position.set(0, 0.08, 0.16);
  const skull = sph(0.14, color); skull.scale.set(0.9, 1, 0.9);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.07); e.position.set(0.065 * s, 0.03, 0.1); head.add(e); eyes.push(e);
    const brow = box(0.08, 0.02, 0.02, 0x232323);           // permanently unimpressed
    brow.position.set(0.065 * s, 0.105, 0.11); brow.rotation.z = s * 0.45;
    head.add(brow);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new T.Mesh(new T.PlaneGeometry(0.34, 0.13),
      mat(0xcfe4ff, { opacity: 0.4, side: T.DoubleSide, rough: 0.2 }));
    w.position.set(0.1 * s, 0.16, -0.08);
    w.rotation.z = s * 0.5; w.rotation.y = s * 0.7;
    w.userData.side = s;
    body.add(w); wings.push(w);
  }
  body.add(abd, thorax, head);
  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.3, 0x38342c, 0.024);
    leg.position.set(0.1 * s, 0.32, 0.08 - i * 0.11);
    leg.rotation.z = s * 0.8;
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { wings }, headY: 0.44, scale: 1 };
}

function buildMantis(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.42; root.add(body);
  const abdomen = sph(0.16, color); abdomen.scale.set(0.9, 1, 1.6); abdomen.position.set(0, -0.06, -0.28); abdomen.rotation.x = -0.35;
  const thorax = cyl(0.09, 0.12, 0.34, color); thorax.rotation.x = 0.45; thorax.position.y = 0.08;
  const head = new T.Group(); head.position.set(0, 0.3, 0.1);
  const skull = cone(0.13, 0.2, color); skull.rotation.x = Math.PI; skull.scale.set(1.15, 1, 0.8);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.06); e.position.set(0.1 * s, 0.05, 0.05); head.add(e); eyes.push(e);
  }
  // wispy sensei beard
  const beard = cone(0.03, 0.12, 0xe8e4d0); beard.rotation.x = Math.PI; beard.position.set(0, -0.13, 0.05);
  head.add(beard);
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = cyl(0.008, 0.005, 0.26, color); a.position.set(0.05 * s, 0.18, 0.02); a.rotation.z = s * 0.5;
    head.add(a); antennae.push(a);
  }
  // prayer arms
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(0.1 * s, 0.2, 0.12);
    const upper = cyl(0.028, 0.024, 0.2, color); upper.position.y = -0.09; arm.add(upper);
    const fore = new T.Group(); fore.position.y = -0.2;
    const spike = cyl(0.024, 0.015, 0.22, accent); spike.position.y = 0.1; fore.add(spike);
    fore.rotation.x = -2.4;
    arm.add(fore);
    arm.rotation.x = 0.7;
    body.add(arm); arms.push(arm);
  }
  body.add(abdomen, thorax, head);
  const legs = [];
  for (let i = 0; i < 2; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.44, color, 0.022);
    leg.position.set(0.09 * s, 0.4, -0.05 - i * 0.14);
    leg.rotation.z = s * 0.75;
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { arms, antennae }, headY: 0.72, scale: 1 };
}

const BUILDERS = { ant: buildAnt, beetle: buildBeetle, spider: buildSpider, wasp: buildWasp, mantis: buildMantis };

// ---------------- public: build a bug ----------------
export function buildBugMesh(species, color, accent, { outfit = null, hat = null, big = 1 } = {}) {
  const parts = BUILDERS[species](color, accent);
  const rig = {
    ...parts, species, t: Math.random() * 10, state: 'idle', blink: 0,
    walkAmt: 0, faceDir: 1, lookTarget: null, flinchT: 0, hopT: 0,
  };
  if (outfit) {
    const o = makeOutfit(outfit, accent);
    if (o.userData.isTie) { o.position.set(0, -0.02, parts.species === 'wasp' ? 0.2 : 0.16); parts.head.add(o); }
    else { o.position.y = parts.species === 'mantis' ? 0.12 : 0.13; parts.head.add(o); }
    rig.outfitG = o;
  }
  if (hat && hat !== 'none') {
    const h = makeHat(hat);
    h.position.y = (rig.outfitG && !rig.outfitG.userData.isTie) ? 0.3 : 0.14;
    parts.head.add(h);
    rig.hatG = h;
  }
  parts.root.scale.setScalar(big);
  parts.root.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
  return rig;
}

// ---------------- shared procedural animation ----------------
export function animateBug(rig, dt) {
  rig.t += dt;
  const t = rig.t;
  const body = rig.body, head = rig.head;
  // blink
  rig.blink -= dt;
  if (rig.blink < -3 - Math.random() * 3) rig.blink = 0.13;
  const blinkS = rig.blink > 0 ? 0.15 : 1;
  for (const e of rig.eyes) e.scale.y += (blinkS - e.scale.y) * Math.min(1, dt * 30);

  // pupils wander / look
  for (const e of rig.eyes) {
    const p = e.userData.pupil; if (!p) continue;
    const wx = rig.lookTarget ? rig.lookTarget.x : Math.sin(t * 0.7 + e.id) * 0.3;
    const wy = rig.lookTarget ? rig.lookTarget.y : Math.cos(t * 0.5) * 0.2;
    p.position.x += (wx * e.userData.r * 0.5 - p.position.x) * dt * 6;
    p.position.y += (wy * e.userData.r * 0.5 - p.position.y) * dt * 6;
  }

  const st = rig.state;
  const walk = rig.walkAmt;         // 0..1 set by mover
  // body bob + breathing
  const bob = st === 'panic' ? Math.sin(t * 26) * 0.04
    : walk > 0.05 ? Math.abs(Math.sin(t * 10)) * 0.05 * walk
    : Math.sin(t * 2.2) * 0.012;
  body.position.y = body.userData.baseY ?? (body.userData.baseY = body.position.y);
  body.position.y = body.userData.baseY + bob + (st === 'celebrate' ? Math.abs(Math.sin(t * 8)) * 0.12 : 0);
  body.rotation.z = st === 'celebrate' ? Math.sin(t * 8) * 0.15 : Math.sin(t * 1.7) * 0.02;
  body.rotation.x = st === 'aim' ? -0.12 : st === 'panic' ? Math.sin(t * 20) * 0.25 : 0;

  // head
  head.rotation.y = st === 'panic' ? Math.sin(t * 18) * 0.5 : Math.sin(t * 0.9) * 0.12;
  head.rotation.x = st === 'aim' ? -0.18 : st === 'dead' ? 0.6 : Math.sin(t * 1.3) * 0.06;
  if (rig.flinchT > 0) {
    rig.flinchT -= dt;
    head.rotation.x = -0.5 + Math.sin(rig.flinchT * 40) * 0.2;
    body.rotation.z = Math.sin(rig.flinchT * 35) * 0.12;
  }

  // legs
  for (const leg of rig.legs) {
    const ph = leg.userData.phase, s = leg.userData.side;
    const base = leg.userData.baseRotX ?? (leg.userData.baseRotX = leg.rotation.x);
    if (st === 'panic') leg.rotation.x = base + Math.sin(t * 30 + ph) * 0.9;
    else if (walk > 0.05) leg.rotation.x = base + Math.sin(t * 10 + ph) * 0.55 * walk;
    else leg.rotation.x = base + Math.sin(t * 2 + ph) * 0.04;
    if (st === 'celebrate') leg.rotation.x = base + Math.sin(t * 8 + ph + s) * 0.7;
  }

  // species extras
  const ex = rig.extras;
  if (ex.wings) for (const w of ex.wings) {
    const s = w.userData.side;
    const flap = st === 'panic' || st === 'celebrate' ? 60 : 38;
    w.rotation.z = s * (0.5 + Math.sin(t * flap) * 0.55);
  }
  if (ex.antennae) for (let i = 0; i < ex.antennae.length; i++) {
    ex.antennae[i].rotation.x = -0.4 + Math.sin(t * 3 + i * 2) * (st === 'panic' ? 0.6 : 0.15);
  }
  if (ex.arms) for (let i = 0; i < ex.arms.length; i++) {
    ex.arms[i].rotation.x = st === 'celebrate' ? -1.6 + Math.sin(t * 8 + i) * 0.4
      : st === 'aim' ? -0.2 : 0.7 + Math.sin(t * 1.8 + i * 2.1) * 0.08;
  }
  if (rig.hatG) for (const m of rig.hatG.children) {
    if (m.userData.float) { m.position.y = 0.16 + Math.sin(t * 2.5) * 0.02; m.rotation.z = t * 0.8; }
  }
}

// simple gravestone for the fallen (they get scale-popped in by fx)
export function makeGravestone(accent) {
  const g = new T.Group();
  const slab = box(0.26, 0.3, 0.08, 0x9aa3ad); slab.position.y = 0.15;
  const top = cyl(0.13, 0.13, 0.08, 0x9aa3ad); top.rotation.x = Math.PI / 2; top.position.y = 0.3;
  const rip = box(0.16, 0.1, 0.02, accent); rip.position.set(0, 0.18, 0.045);
  g.add(slab, top, rip);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}
