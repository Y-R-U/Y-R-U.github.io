// Cars are built out of separable parts, because the whole point of this game
// is watching them come apart. Every panel is its own mesh with its own hit
// points; nothing is merged, so a bonnet can leave at 200km/h and the car
// carries on without it.
//
// Local space: forward is -Z, up is +Y, right is +X.

import * as THREE from 'three';
import { quality } from './render.js';
import { CRASH } from './config.js';
import { shadeHex, rand, pick } from './utils.js';

// ---------------------------------------------------------------------------
// Body styles
// ---------------------------------------------------------------------------
export const BODY_STYLES = {
  muscle: {
    name: 'MUSCLE', len: 4.5, wide: 2.0, ride: 0.42,
    bonnet: 1.55, boot: 1.0, roofLen: 1.55, roofH: 0.52, nose: 0.06, wheel: 0.46, spoiler: 'lip',
  },
  wedge: {
    name: 'WEDGE', len: 4.4, wide: 2.05, ride: 0.34,
    bonnet: 1.7, boot: 0.85, roofLen: 1.35, roofH: 0.42, nose: 0.16, wheel: 0.42, spoiler: 'wing',
  },
  stock: {
    name: 'STOCK', len: 4.3, wide: 1.95, ride: 0.46,
    bonnet: 1.25, boot: 1.15, roofLen: 1.8, roofH: 0.6, nose: 0.02, wheel: 0.44, spoiler: 'none',
  },
  van: {
    name: 'HAULER', len: 4.7, wide: 2.15, ride: 0.56,
    bonnet: 0.85, boot: 0.5, roofLen: 2.9, roofH: 1.0, nose: 0.0, wheel: 0.5, spoiler: 'none',
  },
  buggy: {
    name: 'BUGGY', len: 4.0, wide: 2.1, ride: 0.62,
    bonnet: 1.1, boot: 1.1, roofLen: 1.5, roofH: 0.55, nose: 0.0, wheel: 0.56, spoiler: 'cage', open: true,
  },
};

export const STYLE_IDS = Object.keys(BODY_STYLES);

// Every panel: how much punishment it takes and what it does when it goes.
// `hp` is a fraction of the car's part budget; `mass` drives debris tumble.
const PART_SPEC = {
  bonnet:     { hp: 0.55, mass: 0.9,  region: 'front' },
  boot:       { hp: 0.55, mass: 0.9,  region: 'rear' },
  roof:       { hp: 0.9,  mass: 1.2,  region: 'top' },
  windscreen: { hp: 0.3,  mass: 0.2,  region: 'front', glass: true },
  rearglass:  { hp: 0.28, mass: 0.2,  region: 'rear',  glass: true },
  doorL:      { hp: 0.62, mass: 0.8,  region: 'left' },
  doorR:      { hp: 0.62, mass: 0.8,  region: 'right' },
  bumperF:    { hp: 0.48, mass: 0.7,  region: 'front' },
  bumperR:    { hp: 0.48, mass: 0.7,  region: 'rear' },
  spoiler:    { hp: 0.35, mass: 0.5,  region: 'rear' },
  mirrorL:    { hp: 0.12, mass: 0.15, region: 'left' },
  mirrorR:    { hp: 0.12, mass: 0.15, region: 'right' },
  wheelFL:    { hp: 0.75, mass: 1.0,  region: 'front', wheel: true },
  wheelFR:    { hp: 0.75, mass: 1.0,  region: 'front', wheel: true },
  wheelRL:    { hp: 0.75, mass: 1.0,  region: 'rear',  wheel: true },
  wheelRR:    { hp: 0.75, mass: 1.0,  region: 'rear',  wheel: true },
};

export const PART_IDS = Object.keys(PART_SPEC);
export const partSpec = (id) => PART_SPEC[id];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function meshPart(id, geo, mat, pos, spec, partHpBudget) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = quality.shadows;
  m.name = id;
  m.userData.part = {
    id,
    hp: spec.hp * partHpBudget,
    maxHp: spec.hp * partHpBudget,
    mass: spec.mass,
    region: spec.region,
    glass: !!spec.glass,
    wheel: !!spec.wheel,
    home: new THREE.Vector3(pos[0], pos[1], pos[2]),
    dent: 0,
  };
  return m;
}

// ---------------------------------------------------------------------------
export function buildCar(opts = {}) {
  const style = BODY_STYLES[opts.style] || BODY_STYLES.stock;
  const bodyHex = opts.body != null ? opts.body : 0xe23c3c;
  const trimHex = opts.trim != null ? opts.trim : 0xffd166;
  const partHp = 100 * (opts.partHp || 1);

  const g = new THREE.Group();
  g.name = 'car';

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyHex });
  const bodyDark = new THREE.MeshLambertMaterial({ color: shadeHex(bodyHex, -0.35) });
  const trimMat = new THREE.MeshLambertMaterial({ color: trimHex });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x9ad8ee, transparent: true, opacity: 0.52,
  });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1a1c1f });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x501010 });
  for (const m of [bodyMat, bodyDark, trimMat, glassMat, tyreMat, rimMat, darkMat, lightMat, brakeMat]) m.__owned = true;

  const L = style.len, W = style.wide, R = style.ride;
  const halfL = L / 2;
  const cabinZ = (style.boot - style.bonnet) * 0.35;

  // --- chassis: the one thing that never leaves -----------------------------
  const chassis = new THREE.Mesh(box(W * 0.94, 0.5, L), bodyMat);
  chassis.position.set(0, R + 0.25, 0);
  chassis.castShadow = quality.shadows;
  chassis.name = 'chassis';
  chassis.userData.part = { id: 'chassis', hp: Infinity, maxHp: Infinity, core: true, region: 'core' };
  g.add(chassis);

  // side skirts / rocker panels give the silhouette some depth
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(box(0.14, 0.26, L * 0.78), bodyDark);
    skirt.position.set(sx * W * 0.48, R + 0.08, 0);
    skirt.name = 'skirt';
    g.add(skirt);
  }

  // --- bonnet and boot -----------------------------------------------------
  const bonnetZ = -(cabinZ + style.roofLen / 2 + style.bonnet / 2);
  const bonnet = meshPart('bonnet', box(W * 0.88, 0.16, style.bonnet), bodyMat,
    [0, R + 0.55, bonnetZ], PART_SPEC.bonnet, partHp);
  g.add(bonnet);

  const bootZ = cabinZ + style.roofLen / 2 + style.boot / 2;
  const boot = meshPart('boot', box(W * 0.88, 0.16, style.boot), bodyMat,
    [0, R + 0.55, bootZ], PART_SPEC.boot, partHp);
  g.add(boot);

  // --- cabin: roof, glass, driver ------------------------------------------
  if (!style.open) {
    const roof = new THREE.Group();
    const shell = new THREE.Mesh(box(W * 0.8, style.roofH, style.roofLen), bodyMat);
    shell.position.y = style.roofH / 2;
    shell.castShadow = quality.shadows;
    roof.add(shell);
    // pillars
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(box(0.12, style.roofH, 0.12), bodyDark);
        pillar.position.set(sx * W * 0.38, style.roofH / 2, sz * style.roofLen * 0.46);
        roof.add(pillar);
      }
    }
    const stripe = new THREE.Mesh(box(W * 0.2, 0.03, style.roofLen * 0.98), trimMat);
    stripe.position.y = style.roofH + 0.005;
    roof.add(stripe);
    roof.position.set(0, R + 0.6, cabinZ);
    roof.name = 'roof';
    roof.userData.part = {
      id: 'roof', hp: PART_SPEC.roof.hp * partHp, maxHp: PART_SPEC.roof.hp * partHp,
      mass: PART_SPEC.roof.mass, region: 'top',
      home: roof.position.clone(), dent: 0,
    };
    g.add(roof);

    const wind = meshPart('windscreen', box(W * 0.74, style.roofH * 0.95, 0.08), glassMat,
      [0, R + 0.6 + style.roofH * 0.48, cabinZ - style.roofLen * 0.5], PART_SPEC.windscreen, partHp);
    wind.rotation.x = -0.34;
    wind.userData.part.home.copy(wind.position);
    g.add(wind);

    const rearg = meshPart('rearglass', box(W * 0.72, style.roofH * 0.9, 0.08), glassMat,
      [0, R + 0.6 + style.roofH * 0.48, cabinZ + style.roofLen * 0.5], PART_SPEC.rearglass, partHp);
    rearg.rotation.x = 0.4;
    rearg.userData.part.home.copy(rearg.position);
    g.add(rearg);
  } else {
    // buggy: exposed roll cage instead of a roof
    const cage = new THREE.Group();
    const barGeo = box(0.1, 0.1, 1.5);
    for (const sx of [-1, 1]) {
      const hoop = new THREE.Mesh(box(0.1, 1.0, 0.1), darkMat);
      hoop.position.set(sx * W * 0.36, 0.5, cabinZ + 0.4);
      cage.add(hoop);
      const diag = new THREE.Mesh(barGeo, darkMat);
      diag.position.set(sx * W * 0.36, 0.85, cabinZ - 0.35);
      diag.rotation.x = 0.55;
      cage.add(diag);
    }
    const top = new THREE.Mesh(box(W * 0.78, 0.1, 0.12), darkMat);
    top.position.set(0, 1.0, cabinZ + 0.4);
    cage.add(top);
    cage.position.y = R + 0.5;
    cage.name = 'roof';
    cage.userData.part = {
      id: 'roof', hp: PART_SPEC.roof.hp * partHp * 1.5, maxHp: PART_SPEC.roof.hp * partHp * 1.5,
      mass: PART_SPEC.roof.mass, region: 'top', home: cage.position.clone(), dent: 0,
    };
    g.add(cage);
  }

  // driver — a helmet you can see once the roof has gone
  const driver = new THREE.Group();
  const torso = new THREE.Mesh(box(0.42, 0.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x2f3238 }));
  torso.position.y = 0.2;
  driver.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), trimMat);
  helmet.position.y = 0.56;
  driver.add(helmet);
  const visor = new THREE.Mesh(box(0.3, 0.11, 0.06), new THREE.MeshBasicMaterial({ color: 0x101418 }));
  visor.position.set(0, 0.58, -0.19);
  driver.add(visor);
  driver.position.set(0, R + 0.4, cabinZ + 0.1);
  driver.name = 'driver';
  g.add(driver);

  // --- doors ---------------------------------------------------------------
  for (const [id, sx] of [['doorL', -1], ['doorR', 1]]) {
    const d = meshPart(id, box(0.12, 0.5, style.roofLen * 1.15), bodyDark,
      [sx * W * 0.49, R + 0.4, cabinZ], PART_SPEC[id], partHp);
    g.add(d);
  }

  // --- bumpers -------------------------------------------------------------
  const noseZ = -halfL - 0.06;
  const bumperF = meshPart('bumperF', box(W * 1.02, 0.34, 0.34), darkMat,
    [0, R + 0.28, noseZ], PART_SPEC.bumperF, partHp);
  g.add(bumperF);
  const bumperR = meshPart('bumperR', box(W * 1.02, 0.34, 0.34), darkMat,
    [0, R + 0.28, halfL + 0.06], PART_SPEC.bumperR, partHp);
  g.add(bumperR);

  // headlights / tail lights ride on the body, not the bumpers
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(box(0.4, 0.16, 0.08), lightMat);
    hl.position.set(sx * W * 0.3, R + 0.52, -halfL + 0.04);
    g.add(hl);
    const tl = new THREE.Mesh(box(0.36, 0.14, 0.08), brakeMat);
    tl.position.set(sx * W * 0.3, R + 0.52, halfL - 0.04);
    tl.name = 'brakelight';
    g.add(tl);
  }

  // --- spoiler -------------------------------------------------------------
  if (style.spoiler !== 'none') {
    const sp = new THREE.Group();
    if (style.spoiler === 'wing') {
      const blade = new THREE.Mesh(box(W * 0.95, 0.07, 0.42), trimMat);
      blade.position.y = 0.42;
      sp.add(blade);
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(box(0.09, 0.42, 0.16), darkMat);
        strut.position.set(sx * W * 0.34, 0.21, 0);
        sp.add(strut);
      }
    } else if (style.spoiler === 'cage') {
      const bar = new THREE.Mesh(box(W * 0.9, 0.1, 0.1), darkMat);
      bar.position.y = 0.3;
      sp.add(bar);
    } else {
      const lip = new THREE.Mesh(box(W * 0.85, 0.1, 0.28), trimMat);
      lip.position.y = 0.1;
      lip.rotation.x = -0.25;
      sp.add(lip);
    }
    sp.position.set(0, R + 0.6, halfL - 0.25);
    sp.name = 'spoiler';
    sp.userData.part = {
      id: 'spoiler', hp: PART_SPEC.spoiler.hp * partHp, maxHp: PART_SPEC.spoiler.hp * partHp,
      mass: PART_SPEC.spoiler.mass, region: 'rear', home: sp.position.clone(), dent: 0,
    };
    g.add(sp);
  }

  // --- mirrors -------------------------------------------------------------
  for (const [id, sx] of [['mirrorL', -1], ['mirrorR', 1]]) {
    const m = meshPart(id, box(0.24, 0.12, 0.1), bodyDark,
      [sx * (W * 0.55), R + 0.68, cabinZ - style.roofLen * 0.5], PART_SPEC[id], partHp);
    g.add(m);
  }

  // --- wheels --------------------------------------------------------------
  const wr = style.wheel;
  const axleZ = halfL - wr - 0.32;
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, 0.36, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.38, 8);
  rimGeo.rotateZ(Math.PI / 2);

  const wheels = [];
  for (const [id, sx, sz] of [['wheelFL', -1, -1], ['wheelFR', 1, -1], ['wheelRL', -1, 1], ['wheelRR', 1, 1]]) {
    const hub = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    hub.add(tyre);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    hub.add(rim);
    hub.position.set(sx * (W * 0.5 - 0.03), wr, sz * axleZ);
    hub.name = id;
    hub.userData.part = {
      id, hp: PART_SPEC[id].hp * partHp, maxHp: PART_SPEC[id].hp * partHp,
      mass: PART_SPEC[id].mass, region: PART_SPEC[id].region, wheel: true,
      steer: sz < 0, home: hub.position.clone(), dent: 0, spin: 0,
    };
    g.add(hub);
    wheels.push(hub);
  }

  // --- exhaust / nose cone flourishes --------------------------------------
  if (style.nose > 0) {
    const nose = new THREE.Mesh(box(W * 0.7, 0.18, 0.5), trimMat);
    nose.position.set(0, R + 0.32, -halfL - 0.2);
    nose.name = 'nosecone';
    g.add(nose);
  }
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6), rimMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * 0.42, R + 0.16, halfL + 0.12);
    g.add(pipe);
  }

  g.userData.style = style;
  g.userData.wheels = wheels;
  g.userData.mats = { bodyMat, bodyDark, trimMat, glassMat, tyreMat, darkMat, brakeMat };
  g.userData.parts = {};
  g.traverse((o) => {
    if (o.userData.part && !o.userData.part.core) g.userData.parts[o.userData.part.id] = o;
  });
  g.userData.driver = driver;
  return g;
}

// ---------------------------------------------------------------------------
// Wheels turn and steer; brake lights come on. Cheap per-frame dressing that
// makes the low-poly boxes read as a car.
// ---------------------------------------------------------------------------
export function animateCarMesh(mesh, dt, speed, steer, braking) {
  const wheels = mesh.userData.wheels;
  if (!wheels) return;
  const spin = (speed / 0.45) * dt;
  for (const w of wheels) {
    if (w.parent !== mesh) continue;   // this one is lying on the track somewhere
    const p = w.userData.part;
    p.spin = (p.spin + spin) % (Math.PI * 2);
    w.rotation.x = p.spin;
    if (p.steer) w.rotation.y = steer * 0.42;
  }
  const bl = mesh.userData.mats && mesh.userData.mats.brakeMat;
  if (bl) bl.color.setHex(braking ? 0xff3020 : 0x501010);
}

// A quick colour scheme for a rival, deterministic per index.
export function liveryFor(i, palette) {
  const p = palette[i % palette.length];
  return { body: p.body, trim: p.trim, name: p.name };
}

export function randomStyle() {
  return pick(STYLE_IDS);
}
