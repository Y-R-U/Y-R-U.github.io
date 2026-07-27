// GRUMPY BUGS — procedural insects. One model per species, all primitives,
// all comedy: enormous googly eyes, faction outfits, cosmetic hats, and a
// generic procedural rig (idle/walk/aim/flinch/celebrate/panic/dead).
// Bug local +Z is forward, origin at the feet.
//
// What makes them read as bugs rather than toys: chitin is a semi-metal with a
// low roughness (so it catches the rim light along every curve), bodies are
// built from overlapping segments with a darker belly underneath, and every leg
// ends in a foot. The eyes carry the performance, so they get a real highlight.

import * as THREE from 'three';
const T = THREE;

// ---------------- materials ----------------
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

// the finishes every bug is built from
export const FINISH = {
  chitin: { rough: 0.4, metal: 0.2 },      // ant/wasp/mantis body plate
  shell: { rough: 0.2, metal: 0.42 },      // beetle elytra: proper bug sheen
  fuzz: { rough: 0.95, metal: 0, flat: true },
  horn: { rough: 0.35, metal: 0.1 },
  eyeW: { rough: 0.08, metal: 0.02 },
};
const shade = (c, k = 0.62) => new T.Color(c).multiplyScalar(k).getHex();
const tint = (c, k = 1.25) => new T.Color(c).multiplyScalar(k).getHex();

const sph = (r, c, o, seg = 12) => new T.Mesh(new T.SphereGeometry(r, seg, Math.ceil(seg * 0.82)), mat(c, o));
const cyl = (r1, r2, h, c, o, seg = 10) => new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg), mat(c, o));
const box = (x, y, z, c, o) => new T.Mesh(new T.BoxGeometry(x, y, z), mat(c, o));
const cone = (r, h, c, o, seg = 12) => new T.Mesh(new T.ConeGeometry(r, h, seg), mat(c, o));
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };

// ---------------- googly eyes ----------------
// White + pupil + a fixed specular pip. Without the pip the eyes go dead at
// half the light angles, and the eyes are the entire performance.
function makeEye(r = 0.085) {
  const g = new T.Group();
  const white = sph(r, 0xffffff, FINISH.eyeW, 14);
  const pupil = sph(r * 0.46, 0x141414, { rough: 0.22 }, 10);
  pupil.position.z = r * 0.72;
  const shine = sph(r * 0.19, 0xffffff, { rough: 0.05, emissive: 0xffffff, emissiveIntensity: 0.55 }, 6);
  shine.position.set(-r * 0.3, r * 0.34, r * 0.8);
  const rim = new T.Mesh(new T.TorusGeometry(r * 0.98, r * 0.1, 6, 16), mat(0x2a2a2e, { rough: 0.6 }));
  rim.position.z = r * 0.12;
  g.add(white, pupil, shine, rim);
  g.userData = { pupil, r, shine };
  return g;
}

// ---------------- legs ----------------
// Femur, tibia, and a foot. The foot is what stops a leg reading as a pipe.
function makeLeg(len, color, thick = 0.028) {
  const g = new T.Group();
  const joint = shade(color, 0.55);
  const upper = cyl(thick, thick * 0.82, len * 0.55, color, FINISH.chitin, 7);
  upper.position.y = -len * 0.27;
  const knee = sph(thick * 1.15, joint, FINISH.chitin, 7);
  knee.position.y = -len * 0.5;
  const lowerG = new T.Group();
  lowerG.position.y = -len * 0.5;
  const lower = cyl(thick * 0.8, thick * 0.5, len * 0.55, color, FINISH.chitin, 7);
  lower.position.y = -len * 0.26;
  const foot = cyl(thick * 0.55, thick * 0.3, len * 0.16, joint, FINISH.chitin, 6);
  at(foot, 0, -len * 0.55, len * 0.05, -1.1, 0, 0);
  for (const s of [-1, 1]) {          // a couple of bristles, because insects
    const bristle = cyl(0.004, 0.002, thick * 2.4, joint, FINISH.chitin, 4);
    at(bristle, thick * 0.4 * s, -len * 0.34, 0, 0, 0, s * 0.9);
    lowerG.add(bristle);
  }
  lowerG.add(lower, foot);
  lowerG.rotation.x = 0.7;
  g.add(upper, knee, lowerG);
  g.userData = { lowerG };
  return g;
}

// ---------------- faction outfits ----------------
function makeOutfit(kind, accent) {
  const g = new T.Group();
  if (kind === 'fedora') {
    const crown = cyl(0.1, 0.13, 0.11, 0x3a3230, { rough: 0.85 }); crown.position.y = 0.05;
    const brim = cyl(0.2, 0.2, 0.02, 0x3a3230, { rough: 0.85 });
    const dent = cyl(0.055, 0.055, 0.04, 0x2b2422, { rough: 0.9 }); dent.position.y = 0.105;
    const band = cyl(0.125, 0.13, 0.035, accent, { rough: 0.6 }); band.position.y = 0.02;
    const feather = box(0.01, 0.09, 0.03, 0xf2e28a, { rough: 0.7 });
    at(feather, 0.11, 0.07, -0.05, 0, 0, -0.4);
    g.add(crown, brim, dent, band, feather);
  } else if (kind === 'hardhat') {
    const dome = sph(0.15, accent, { rough: 0.28, metal: 0.1 }); dome.scale.y = 0.72; dome.position.y = 0.03;
    const brim = cyl(0.19, 0.19, 0.025, accent, { rough: 0.28, metal: 0.1 });
    const ridge = box(0.03, 0.06, 0.28, tint(accent, 1.15), { rough: 0.3 }); ridge.position.y = 0.09;
    const lamp = cyl(0.032, 0.032, 0.03, 0xdfe6ee, { metal: 0.7, rough: 0.25 }, 8);
    at(lamp, 0, 0.045, 0.15, Math.PI / 2, 0, 0);
    g.add(dome, brim, ridge, lamp);
  } else if (kind === 'tophat') {
    const crown = cyl(0.11, 0.11, 0.22, 0x1b1520, { rough: 0.5 }); crown.position.y = 0.11;
    const brim = cyl(0.18, 0.18, 0.02, 0x1b1520, { rough: 0.5 });
    const band = cyl(0.115, 0.115, 0.04, accent, { rough: 0.55 }); band.position.y = 0.03;
    const buckle = box(0.05, 0.04, 0.01, 0xd9c04a, { metal: 0.7, rough: 0.3 });
    at(buckle, 0, 0.03, 0.115);
    g.add(crown, brim, band, buckle);
  } else if (kind === 'tie') {
    const knot = box(0.05, 0.045, 0.03, accent, { rough: 0.6 });
    const strip = box(0.055, 0.16, 0.025, accent, { rough: 0.6 }); strip.position.y = -0.1;
    const tip = cone(0.04, 0.05, accent, { rough: 0.6 }); tip.rotation.x = Math.PI; tip.position.y = -0.2;
    const collar = box(0.11, 0.035, 0.02, 0xf2f0ea, { rough: 0.8 });
    at(collar, 0, 0.035, -0.005);
    g.add(knot, strip, tip, collar);
    g.userData.isTie = true;
  } else if (kind === 'strawhat') {
    const crownS = cyl(0.105, 0.125, 0.08, 0xd9c069, { rough: 0.95 }); crownS.position.y = 0.045;
    const brimS = cone(0.22, 0.055, 0xd9c069, { rough: 0.95, flat: true }, 16); brimS.position.y = 0.015;
    const cord = new T.Mesh(new T.TorusGeometry(0.115, 0.011, 5, 14), mat(0x6b5a3a, { rough: 0.9 }));
    at(cord, 0, 0.025, 0, Math.PI / 2, 0, 0);
    g.add(crownS, brimS, cord);
  }
  return g;
}

// ---------------- cosmetic hats ----------------
export function makeHat(id) {
  const g = new T.Group();
  if (id === 'cone') {
    const c = cone(0.13, 0.26, 0xe86a1f, { rough: 0.75 }); c.position.y = 0.12;
    const stripe = cyl(0.085, 0.1, 0.05, 0xf5f0e6, { rough: 0.7 }); stripe.position.y = 0.12;
    const base = box(0.24, 0.025, 0.24, 0xe86a1f, { rough: 0.8 });
    g.add(c, stripe, base);
  } else if (id === 'party') {
    const c = cone(0.1, 0.24, 0xd94fd0, { rough: 0.6 }); c.position.y = 0.11;
    const pom = sph(0.045, 0xffe94a, { rough: 0.6 }); pom.position.y = 0.24;
    for (let i = 0; i < 4; i++) {
      const dot = sph(0.017, i % 2 ? 0x5ab8ff : 0xffe94a, { rough: 0.5 }, 6);
      const a = i * 1.9;
      at(dot, Math.cos(a) * 0.075, 0.06 + i * 0.035, Math.sin(a) * 0.075);
      g.add(dot);
    }
    g.add(c, pom);
  } else if (id === 'chef') {
    const base = cyl(0.11, 0.11, 0.08, 0xf7f5ee, { rough: 0.9 }); base.position.y = 0.03;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const puff = sph(0.075, 0xf7f5ee, { rough: 0.9 }, 8);
      at(puff, Math.cos(a) * 0.075, 0.12, Math.sin(a) * 0.075);
      g.add(puff);
    }
    const top = sph(0.09, 0xf7f5ee, { rough: 0.9 }); top.scale.y = 0.8; top.position.y = 0.16;
    g.add(base, top);
  } else if (id === 'cowboy') {
    const dome = sph(0.1, 0x8a5a2a, { rough: 0.85 }); dome.scale.y = 0.75; dome.position.y = 0.05;
    const brim = cyl(0.21, 0.22, 0.022, 0x8a5a2a, { rough: 0.85 }, 16);
    const band = cyl(0.105, 0.105, 0.03, 0x4a3018, { rough: 0.9 }); band.position.y = 0.025;
    for (const s of [-1, 1]) {           // the brim curls up at the sides
      const curl = cyl(0.09, 0.09, 0.02, 0x8a5a2a, { rough: 0.85 }, 10);
      at(curl, 0.17 * s, 0.03, 0, 0, 0, -s * 0.55);
      g.add(curl);
    }
    g.add(dome, brim, band);
  } else if (id === 'viking') {
    const dome = sph(0.13, 0x8f9aa6, { metal: 0.65, rough: 0.3 }); dome.scale.y = 0.72;
    const rim = new T.Mesh(new T.TorusGeometry(0.128, 0.018, 6, 16), mat(0x6b747f, { metal: 0.7, rough: 0.35 }));
    at(rim, 0, 0.01, 0, Math.PI / 2, 0, 0);
    const nose = box(0.03, 0.09, 0.02, 0x8f9aa6, { metal: 0.65, rough: 0.3 });
    at(nose, 0, -0.03, 0.125);
    for (const s of [-1, 1]) {
      const horn = cone(0.045, 0.17, 0xf2ead2, { rough: 0.6 });
      at(horn, 0.13 * s, 0.08, 0, 0.15, 0, -s * 0.95);
      g.add(horn);
    }
    g.add(dome, rim, nose);
  } else if (id === 'crown') {
    const band = cyl(0.1, 0.11, 0.07, 0xf2c53d, { metal: 0.8, rough: 0.22 }); band.position.y = 0.03;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = cone(0.026, 0.08, 0xf2c53d, { metal: 0.8, rough: 0.22 });
      at(spike, Math.cos(a) * 0.095, 0.095, Math.sin(a) * 0.095);
      const gem = sph(0.02, [0xd94436, 0x4a8ae0, 0x5ec46a][i % 3], { rough: 0.1, metal: 0.2 }, 6);
      at(gem, Math.cos(a) * 0.108, 0.04, Math.sin(a) * 0.108);
      g.add(spike, gem);
    }
    g.add(band);
  } else if (id === 'halo') {
    const ring = new T.Mesh(new T.TorusGeometry(0.12, 0.022, 8, 24),
      mat(0xffe94a, { emissive: 0xffd94a, emissiveIntensity: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16;
    ring.userData.float = true;
    const glow = new T.Mesh(new T.TorusGeometry(0.12, 0.055, 8, 20),
      mat(0xffd94a, { emissive: 0xffc020, emissiveIntensity: 0.8, opacity: 0.22 }));
    glow.rotation.x = Math.PI / 2; glow.position.y = 0.16;
    glow.userData.float = true;
    g.add(ring, glow);
  }
  return g;
}

// ---------------- species builders ----------------
// Every builder returns parts hooked into the shared rig contract:
// { root, body, head, eyes[], legs[], extras:{wings?,antennae?,arms?} }

function buildAnt(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.3; root.add(body);
  const dark = shade(color, 0.7), belly = shade(color, 0.5);

  // gaster: three tapering segments, so it reads as an ant and not an egg
  const gaster = new T.Group(); gaster.position.set(0, 0.01, -0.26);
  for (let i = 0; i < 3; i++) {
    const seg = sph(0.185 - i * 0.045, i % 2 ? dark : color, FINISH.chitin, 12);
    seg.scale.set(1, 0.92, 0.72);
    seg.position.z = -i * 0.1;
    gaster.add(seg);
  }
  const gasterBelly = sph(0.15, belly, FINISH.chitin, 10);
  gasterBelly.scale.set(0.92, 0.6, 1.25);
  at(gasterBelly, 0, -0.07, -0.06);
  gaster.add(gasterBelly);
  body.add(gaster);

  const petiole = cyl(0.045, 0.055, 0.1, dark, FINISH.chitin, 7);
  at(petiole, 0, 0.01, -0.1, Math.PI / 2, 0, 0);
  const thorax = sph(0.13, color, FINISH.chitin);
  thorax.scale.set(1, 0.95, 1.1);
  const hump = sph(0.075, dark, FINISH.chitin, 10);
  at(hump, 0, 0.09, -0.02);
  body.add(petiole, thorax, hump);

  const head = new T.Group(); head.position.set(0, 0.09, 0.19);
  const skull = sph(0.16, color, FINISH.chitin);
  skull.scale.set(0.95, 1, 0.95);
  const jawPlate = sph(0.1, dark, FINISH.chitin, 10);
  at(jawPlate, 0, -0.06, 0.09);
  jawPlate.scale.set(1, 0.7, 0.9);
  head.add(skull, jawPlate);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.075); at(e, 0.075 * s, 0.05, 0.115); head.add(e); eyes.push(e);
  }
  for (const s of [-1, 1]) {            // mandibles — hooked, not spikes
    const m = cone(0.032, 0.1, accent, FINISH.horn); at(m, 0.05 * s, -0.08, 0.13, 1.4, 0, -s * 0.5);
    const hook = cone(0.02, 0.05, accent, FINISH.horn); at(hook, 0.075 * s, -0.1, 0.19, 2.2, 0, -s * 0.9);
    head.add(m, hook);
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(0.06 * s, 0.13, 0.08);
    const seg = cyl(0.016, 0.012, 0.18, dark, FINISH.chitin, 6); seg.position.y = 0.09; a.add(seg);
    const tip = cyl(0.012, 0.009, 0.12, dark, FINISH.chitin, 6);
    at(tip, 0, 0.2, 0.04, 0.7, 0, 0); a.add(tip);
    const knob = sph(0.018, accent, FINISH.chitin, 6); at(knob, 0, 0.245, 0.09); a.add(knob);
    a.rotation.set(-0.4, 0, s * 0.35); head.add(a); antennae.push(a);
  }
  body.add(head);

  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.34, dark);
    at(leg, 0.11 * s, 0.28, 0.08 - i * 0.13, 0, 0, s * 0.85);
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { antennae }, headY: 0.39, scale: 1 };
}

function buildBeetle(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.3; root.add(body);
  const dark = shade(color, 0.62);

  // elytra: two halves with a real seam gap, plus a pronotum plate
  for (const s of [-1, 1]) {
    const half = sph(0.255, color, FINISH.shell, 14);
    half.scale.set(0.52, 0.8, 1.12);
    at(half, 0.115 * s, 0.06, -0.07);
    const ridge = box(0.012, 0.02, 0.4, shade(color, 0.75), FINISH.shell);
    at(ridge, 0.19 * s, 0.16, -0.07, 0.1, 0, s * 0.12);
    body.add(half, ridge);
  }
  const seam = box(0.022, 0.16, 0.46, dark, FINISH.shell);
  at(seam, 0, 0.16, -0.07);
  const under = sph(0.23, dark, { rough: 0.6, metal: 0.1 }, 10);
  under.scale.set(1, 0.5, 1.05);
  at(under, 0, -0.06, -0.07);
  const pronotum = sph(0.17, shade(color, 0.85), FINISH.shell, 12);
  pronotum.scale.set(1.05, 0.7, 0.62);
  at(pronotum, 0, 0.03, 0.13);
  body.add(seam, under, pronotum);

  // hi-vis stripe across the shell
  const stripe = new T.Mesh(new T.TorusGeometry(0.235, 0.032, 8, 24, Math.PI),
    mat(accent, { emissive: accent, emissiveIntensity: 0.3, rough: 0.4 }));
  at(stripe, 0, 0.1, -0.09, Math.PI / 2.2, 0, Math.PI);
  body.add(stripe);

  const head = new T.Group(); head.position.set(0, 0.02, 0.26);
  const skull = sph(0.125, dark, FINISH.chitin);
  skull.scale.set(1, 0.9, 0.95);
  const horn = cone(0.038, 0.18, tint(color, 1.15), FINISH.horn);
  at(horn, 0, 0.1, 0.06, -0.5, 0, 0);
  const hornTip = cone(0.018, 0.06, 0xe8dcc0, FINISH.horn);
  at(hornTip, 0, 0.19, 0.11, -0.5, 0, 0);
  head.add(skull, horn, hornTip);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.065); at(e, 0.07 * s, 0.03, 0.09); head.add(e); eyes.push(e);
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(0.06 * s, 0.07, 0.09);
    const seg = cyl(0.012, 0.01, 0.13, dark, FINISH.chitin, 5); seg.position.y = 0.065; a.add(seg);
    for (let k = 0; k < 3; k++) {       // clubbed tip — beetles, not ants
      const plate = box(0.05, 0.012, 0.035, dark, FINISH.chitin);
      at(plate, 0, 0.13 + k * 0.02, 0.01 * k, 0, 0, 0.2);
      a.add(plate);
    }
    a.rotation.set(-0.3, 0, s * 0.5); head.add(a); antennae.push(a);
  }
  body.add(head);

  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.26, 0x2c3448, 0.036);
    at(leg, 0.17 * s, 0.24, 0.1 - i * 0.14, 0, 0, s * 0.7);
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { antennae }, headY: 0.32, scale: 1 };
}

function buildSpider(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.34; root.add(body);
  const dark = shade(color, 0.6);

  const abdomen = sph(0.22, color, { rough: 0.62, metal: 0.08 }, 14);
  abdomen.scale.set(1, 1.05, 1.2);
  at(abdomen, 0, 0.08, -0.22);
  // hairy: stubby bristles laid over the abdomen, each pointing outward
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399, y = -0.9 + (i / 22) * 1.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const h = cyl(0.008, 0.002, 0.07, dark, FINISH.fuzz, 4);
    const px = Math.cos(a) * r * 0.21, py = y * 0.23, pz = Math.sin(a) * r * 0.25;
    at(h, px, 0.08 + py, -0.22 + pz);
    h.lookAt(px * 3, 0.08 + py * 3, -0.22 + pz * 3);
    h.rotateX(Math.PI / 2);
    body.add(h);
  }
  const marking = sph(0.1, accent, { rough: 0.5 }, 10);
  marking.scale.set(1, 0.5, 1.2);
  at(marking, 0, 0.245, -0.22);
  const mark2 = sph(0.06, accent, { rough: 0.5 }, 8);   // hourglass, obviously
  mark2.scale.set(1, 0.4, 1.1);
  at(mark2, 0, 0.24, -0.06);
  const spinneret = cone(0.04, 0.08, dark, FINISH.chitin, 8);
  at(spinneret, 0, 0.02, -0.42, -1.9, 0, 0);
  const front = sph(0.145, shade(color, 0.82), { rough: 0.55, metal: 0.1 }, 12);
  front.position.z = 0.05;
  body.add(abdomen, marking, mark2, spinneret, front);

  const head = new T.Group(); head.position.set(0, 0.04, 0.14);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.07); at(e, 0.06 * s, 0.04, 0.08); head.add(e); eyes.push(e);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const little = makeEye(0.028);
    at(little, 0.11 * s - s * k * 0.035, 0.1 - k * 0.035, 0.06);
    head.add(little); eyes.push(little);
  }
  for (const s of [-1, 1]) {            // chelicerae + fangs
    const chel = cyl(0.032, 0.026, 0.08, dark, FINISH.chitin, 6);
    at(chel, 0.04 * s, -0.05, 0.09);
    const fang = cone(0.022, 0.08, 0xf0e8f5, FINISH.horn);
    at(fang, 0.04 * s, -0.11, 0.11, Math.PI - 0.3, 0, 0);
    const palp = cyl(0.018, 0.012, 0.14, dark, FINISH.chitin, 5);
    at(palp, 0.09 * s, -0.04, 0.12, 1.1, 0, s * 0.5);
    head.add(chel, fang, palp);
  }
  body.add(head);

  const legs = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.42, dark, 0.026);
    const band = new T.Mesh(new T.TorusGeometry(0.028, 0.009, 5, 10), mat(accent, { rough: 0.6 }));
    at(band, 0, -0.12, 0, Math.PI / 2, 0, 0);
    leg.add(band);
    at(leg, 0.1 * s, 0.36, 0.1 - i * 0.1, 0, 0, s * (1.0 - i * 0.06));
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 1.7;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: {}, headY: 0.38, scale: 1 };
}

function buildWasp(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.36; root.add(body);
  const dark = 0x232323;

  // striped abdomen on a proper wasp waist
  const abd = new T.Group(); at(abd, 0, 0.02, -0.26, 0.35, 0, 0);
  for (let i = 0; i < 4; i++) {
    const ring = sph(0.165 - i * 0.024, i % 2 === 0 ? color : dark, FINISH.chitin, 12);
    ring.scale.set(1, 1, 0.6);
    ring.position.z = -i * 0.082;
    abd.add(ring);
  }
  const sting = cone(0.035, 0.14, dark, FINISH.horn);
  at(sting, 0, -0.09, -0.55, Math.PI - 0.35, 0, 0);
  abd.add(sting);
  const waist = cyl(0.03, 0.05, 0.12, dark, FINISH.chitin, 7);
  at(waist, 0, 0, -0.15, 1.35, 0, 0);
  const thorax = sph(0.14, 0x38342c, FINISH.chitin, 12);
  thorax.scale.set(1, 0.95, 1.05);
  const fur = sph(0.145, 0x6b5c3a, FINISH.fuzz, 8);
  fur.scale.set(1, 0.65, 0.8);
  at(fur, 0, 0.06, 0.02);
  body.add(abd, waist, thorax, fur);

  const head = new T.Group(); head.position.set(0, 0.08, 0.16);
  const skull = sph(0.14, color, FINISH.chitin);
  skull.scale.set(0.9, 1, 0.9);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.07); at(e, 0.065 * s, 0.03, 0.1); head.add(e); eyes.push(e);
    const brow = box(0.085, 0.022, 0.022, dark, { rough: 0.6 });   // permanently unimpressed
    at(brow, 0.065 * s, 0.108, 0.112, 0, 0, s * 0.45);
    const plate = sph(0.05, 0x2b2b30, { rough: 0.25, metal: 0.15 }, 8);
    plate.scale.set(0.6, 1.3, 1);
    at(plate, 0.115 * s, 0.02, 0.03);
    head.add(brow, plate);
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(0.05 * s, 0.11, 0.09);
    const seg = cyl(0.012, 0.009, 0.16, dark, FINISH.chitin, 5); seg.position.y = 0.08; a.add(seg);
    const bend = cyl(0.009, 0.007, 0.11, dark, FINISH.chitin, 5);
    at(bend, 0, 0.17, 0.04, 0.9, 0, 0); a.add(bend);
    a.rotation.set(-0.3, 0, s * 0.4); head.add(a); antennae.push(a);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new T.Group();
    w.position.set(0.1 * s, 0.16, -0.08);
    const pane = new T.Mesh(new T.PlaneGeometry(0.34, 0.13),
      mat(0xcfe4ff, { opacity: 0.4, side: T.DoubleSide, rough: 0.12, metal: 0.2 }));
    at(pane, 0.17 * s, 0, 0);
    for (let k = 0; k < 3; k++) {       // veins, so it isn't a plain rectangle
      const vein = box(0.3, 0.006, 0.006, 0x9fb6cf, { opacity: 0.5, rough: 0.3 });
      at(vein, 0.17 * s, 0.03 - k * 0.03, 0.001);
      w.add(vein);
    }
    w.add(pane);
    w.rotation.set(0, s * 0.7, s * 0.5);
    w.userData.side = s;
    body.add(w); wings.push(w);
  }
  body.add(head);

  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.3, 0x38342c, 0.025);
    at(leg, 0.1 * s, 0.32, 0.08 - i * 0.11, 0, 0, s * 0.8);
    leg.userData.phase = (i + (s > 0 ? 0 : 0.5)) * 2.1;
    leg.userData.side = s;
    root.add(leg); legs.push(leg);
  }
  return { root, body, head, eyes, legs, extras: { wings, antennae }, headY: 0.44, scale: 1 };
}

function buildMantis(color, accent) {
  const root = new T.Group();
  const body = new T.Group(); body.position.y = 0.42; root.add(body);
  const dark = shade(color, 0.7);

  const abdomen = sph(0.16, color, FINISH.chitin, 12);
  abdomen.scale.set(0.9, 1, 1.6);
  at(abdomen, 0, -0.06, -0.28, -0.35, 0, 0);
  for (let i = 0; i < 4; i++) {         // segment plates along the back
    const plate = sph(0.115 - i * 0.014, dark, FINISH.chitin, 8);
    plate.scale.set(1, 0.4, 0.5);
    at(plate, 0, 0.02 + i * 0.02, -0.16 - i * 0.12, -0.35, 0, 0);
    body.add(plate);
  }
  const thorax = cyl(0.085, 0.115, 0.34, color, FINISH.chitin, 10);
  at(thorax, 0, 0.08, 0, 0.45, 0, 0);
  const collar = cyl(0.09, 0.075, 0.1, dark, FINISH.chitin, 10);
  at(collar, 0, 0.24, 0.07, 0.45, 0, 0);
  body.add(abdomen, thorax, collar);

  const head = new T.Group(); head.position.set(0, 0.3, 0.1);
  const skull = cone(0.13, 0.2, color, FINISH.chitin);
  at(skull, 0, 0, 0, Math.PI, 0, 0);
  skull.scale.set(1.15, 1, 0.8);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEye(0.062); at(e, 0.1 * s, 0.05, 0.05); head.add(e); eyes.push(e);
    const stalk = cyl(0.04, 0.05, 0.05, color, FINISH.chitin, 7);
    at(stalk, 0.075 * s, 0.05, 0.03, 0, 0, Math.PI / 2);
    head.add(stalk);
  }
  const mouth = box(0.07, 0.03, 0.02, dark, FINISH.chitin);
  at(mouth, 0, -0.09, 0.06);
  head.add(mouth);
  for (let i = 0; i < 3; i++) {         // wispy sensei beard
    const beard = cone(0.016, 0.11 + i * 0.03, 0xe8e4d0, FINISH.fuzz, 6);
    at(beard, (i - 1) * 0.03, -0.14 - i * 0.01, 0.05, Math.PI, 0, (i - 1) * 0.2);
    head.add(beard);
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const a = cyl(0.008, 0.004, 0.28, dark, FINISH.chitin, 5);
    at(a, 0.05 * s, 0.19, 0.02, 0, 0, s * 0.5);
    head.add(a); antennae.push(a);
  }

  // raptorial arms — spiked, folded, ready
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(0.1 * s, 0.2, 0.12);
    const upper = cyl(0.03, 0.026, 0.2, color, FINISH.chitin, 8); upper.position.y = -0.09;
    const elbow = sph(0.036, dark, FINISH.chitin, 8); elbow.position.y = -0.2;
    arm.add(upper, elbow);
    const fore = new T.Group(); fore.position.y = -0.2;
    const spike = cyl(0.028, 0.016, 0.22, accent, FINISH.chitin, 8); spike.position.y = 0.1; fore.add(spike);
    for (let i = 0; i < 5; i++) {       // the serrated inner edge
      const tooth = cone(0.011, 0.035, 0xf0f4e0, FINISH.horn, 5);
      at(tooth, 0, 0.03 + i * 0.043, 0.024, Math.PI / 2.1, 0, 0);
      fore.add(tooth);
    }
    const claw = cone(0.014, 0.06, 0xf0f4e0, FINISH.horn, 6);
    at(claw, 0, 0.23, 0.01, -0.2, 0, 0);
    fore.add(claw);
    fore.rotation.x = -2.4;
    arm.add(fore);
    arm.rotation.x = 0.7;
    body.add(arm); arms.push(arm);
  }
  body.add(head);

  const legs = [];
  for (let i = 0; i < 2; i++) for (const s of [-1, 1]) {
    const leg = makeLeg(0.44, color, 0.023);
    at(leg, 0.09 * s, 0.4, -0.05 - i * 0.14, 0, 0, s * 0.75);
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
    if (o.userData.isTie) o.position.set(0, -0.02, species === 'wasp' ? 0.2 : 0.16);
    else o.position.y = species === 'mantis' ? 0.12 : 0.13;
    parts.head.add(o);
    rig.outfitG = o;
  }
  if (hat && hat !== 'none') {
    const h = makeHat(hat);
    h.position.y = (rig.outfitG && !rig.outfitG.userData.isTie) ? 0.3 : 0.14;
    parts.head.add(h);
    rig.hatG = h;
  }
  parts.root.scale.setScalar(big);
  parts.root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
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

  // legs — the lower segment counter-swings so the foot stays under the bug
  // instead of the whole leg pivoting like a windscreen wiper
  for (const leg of rig.legs) {
    const ph = leg.userData.phase, s = leg.userData.side;
    const base = leg.userData.baseRotX ?? (leg.userData.baseRotX = leg.rotation.x);
    let swing;
    if (st === 'panic') swing = Math.sin(t * 30 + ph) * 0.9;
    else if (walk > 0.05) swing = Math.sin(t * 10 + ph) * 0.55 * walk;
    else swing = Math.sin(t * 2 + ph) * 0.04;
    if (st === 'celebrate') swing = Math.sin(t * 8 + ph + s) * 0.7;
    leg.rotation.x = base + swing;
    const lower = leg.userData.lowerG;
    if (lower) lower.rotation.x = 0.7 - swing * 0.55;
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

// gravestone for the fallen (scale-popped in by fx)
export function makeGravestone(accent) {
  const g = new T.Group();
  const stone = 0x9aa3ad;
  const slab = box(0.26, 0.3, 0.08, stone, { rough: 0.92 }); slab.position.y = 0.15;
  const top = cyl(0.13, 0.13, 0.08, stone, { rough: 0.92 });
  at(top, 0, 0.3, 0, Math.PI / 2, 0, 0);
  const rip = box(0.16, 0.1, 0.02, accent, { rough: 0.7 }); at(rip, 0, 0.18, 0.045);
  // a mound of turned earth and one wilted flower
  const mound = sph(0.2, 0x5f4a2c, { rough: 1, flat: true }, 8);
  mound.scale.set(1, 0.32, 0.8);
  mound.position.y = 0.02;
  const stem = cyl(0.008, 0.01, 0.14, 0x4a7d3a, { rough: 0.9 }, 4);
  at(stem, 0.13, 0.08, 0.06, 0, 0, 0.5);
  const bloom = sph(0.035, 0xd9a0b0, { rough: 0.7 }, 6);
  bloom.scale.set(1, 0.6, 1);
  at(bloom, 0.16, 0.14, 0.06);
  g.add(mound, slab, top, rip, stem, bloom);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
