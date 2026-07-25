// Procedural tanks. Four hull classes × seven gun mounts × camo, each built as
// three merged meshes (hull, turret, barrel) so a tank costs three draw calls.

import * as THREE from 'three';
import { Parts, G, plateMat, emitMat, mixHex } from './meshkit.js';
import { glowBasic } from './render.js';
import { CAMOS } from './arsenal.js';

const HULLS = {
  mainline: { len: 4.9, wid: 2.9, hullH: 1.05, deckH: 0.5, trackW: 0.82, trackH: 1.05,
              turretY: 1.95, turretR: 1.0, wheels: 5, skirt: true },
  scout:    { len: 4.3, wid: 2.5, hullH: 0.85, deckH: 0.42, trackW: 0.7, trackH: 0.92,
              turretY: 1.62, turretR: 0.82, wheels: 4, skirt: false },
  siege:    { len: 5.6, wid: 3.5, hullH: 1.25, deckH: 0.62, trackW: 1.0, trackH: 1.25,
              turretY: 2.25, turretR: 1.24, wheels: 6, skirt: true },
  hunter:   { len: 5.2, wid: 3.0, hullH: 1.0, deckH: 0.55, trackW: 0.86, trackH: 1.02,
              turretY: 1.88, turretR: 1.05, wheels: 5, skirt: true },
};

export function camoOf(id) { return CAMOS[id] || CAMOS.olive; }

// ---------------------------------------------------------------------------

export function buildTank({
  chassis = 'mainline', weaponKind = 'direct', hull = 0x4a5138,
  accent = 0xffc24d, isPlayer = false, boss = false,
} = {}) {
  if (chassis === 'truck') return buildHauler(hull, accent);
  const H = HULLS[chassis] || HULLS.mainline;
  const base = hull;
  const dark = mixHex(base, 0x0a0a0c, 0.62);
  const mid = mixHex(base, 0x000000, 0.22);
  const light = mixHex(base, 0xffffff, 0.16);
  const track = 0x1c1a18;
  const rubber = 0x131211;

  const grp = new THREE.Group();
  const tiltG = new THREE.Group();     // terrain pitch/roll
  const leanG = new THREE.Group();     // suspension
  grp.add(tiltG);
  tiltG.add(leanG);

  // ---- hull -------------------------------------------------------------
  const P = new Parts();
  const A = new Parts();               // glowing accent trim

  const y0 = H.trackH * 0.62;
  // belly + main box
  P.add(G.box(), mid, [0, y0 + H.hullH * 0.42, 0], [0, 0, 0], [H.wid * 0.92, H.hullH, H.len]);
  // sloped glacis at the front (-z)
  P.add(G.box(), light, [0, y0 + H.hullH * 0.6, -H.len * 0.44], [0.52, 0, 0],
    [H.wid * 0.86, H.hullH * 0.72, H.len * 0.28]);
  // rear plate
  P.add(G.box(), dark, [0, y0 + H.hullH * 0.5, H.len * 0.47], [-0.18, 0, 0],
    [H.wid * 0.84, H.hullH * 0.8, 0.4]);
  // upper deck
  P.add(G.box(), base, [0, y0 + H.hullH + H.deckH * 0.4, H.len * 0.02], [0, 0, 0],
    [H.wid * 0.7, H.deckH, H.len * 0.62]);

  // tracks, road wheels, drive sprockets
  for (const side of [-1, 1]) {
    const tx = side * (H.wid * 0.5 - H.trackW * 0.42);
    P.add(G.box(), track, [tx, H.trackH * 0.5, 0], [0, 0, 0], [H.trackW, H.trackH, H.len * 1.02]);
    // rounded ends
    P.add(G.cyl(9), track, [tx, H.trackH * 0.5, -H.len * 0.5], [0, 0, Math.PI / 2],
      [H.trackH, H.trackW, H.trackH]);
    P.add(G.cyl(9), track, [tx, H.trackH * 0.5, H.len * 0.5], [0, 0, Math.PI / 2],
      [H.trackH, H.trackW, H.trackH]);
    for (let i = 0; i < H.wheels; i++) {
      const z = (i / (H.wheels - 1) - 0.5) * H.len * 0.82;
      P.add(G.cyl(8), rubber, [tx, H.trackH * 0.44, z], [0, 0, Math.PI / 2],
        [H.trackH * 0.72, H.trackW * 1.04, H.trackH * 0.72]);
    }
    // track links along the top run
    for (let i = 0; i < 7; i++) {
      const z = (i / 6 - 0.5) * H.len * 0.96;
      P.add(G.box(), mixHex(track, 0x555050, 0.4), [tx, H.trackH * 0.99, z], [0, 0, 0],
        [H.trackW * 0.95, 0.1, H.len * 0.1]);
    }
    if (H.skirt) {
      P.add(G.box(), mid, [tx, H.trackH * 0.95, 0], [0, 0, 0], [H.trackW * 1.12, 0.16, H.len * 0.98]);
      // side skirt armour
      P.add(G.box(), light, [side * H.wid * 0.52, H.trackH * 0.72, H.len * 0.06], [0, 0, side * 0.06],
        [0.16, H.hullH * 0.62, H.len * 0.74]);
    }
    // accent stripe low on the flank — reads at distance, catches bloom
    A.add(G.box(), accent, [side * (H.wid * 0.53), y0 + H.hullH * 0.62, H.len * 0.1], [0, 0, 0],
      [0.07, 0.09, H.len * 0.5]);
  }

  // stowage, tools, exhausts, lights
  P.add(G.box(), dark, [H.wid * 0.28, y0 + H.hullH + H.deckH * 0.9, H.len * 0.32], [0, 0.2, 0],
    [0.7, 0.42, 1.1]);
  P.add(G.box(), dark, [-H.wid * 0.3, y0 + H.hullH + H.deckH * 0.85, H.len * 0.36], [0, -0.15, 0],
    [0.5, 0.34, 0.8]);
  for (const side of [-1, 1]) {
    P.add(G.cyl(6), mixHex(0x6a5238, 0x000000, 0.3),
      [side * H.wid * 0.34, y0 + H.hullH + H.deckH * 0.75, H.len * 0.46], [Math.PI / 2, 0, 0],
      [0.22, 0.9, 0.22]);
  }
  // headlights
  for (const side of [-1, 1]) {
    A.add(G.cyl(7), 0xfff0c0, [side * H.wid * 0.3, y0 + H.hullH * 0.85, -H.len * 0.52],
      [Math.PI / 2, 0, 0], [0.3, 0.12, 0.3]);
  }

  if (boss) {
    // cage armour + extra plate for the act bosses
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        P.add(G.box(), dark, [side * H.wid * 0.58, y0 + 0.5 + i * 0.4, (i - 1.5) * 0.9],
          [0, 0, 0], [0.1, 0.34, 0.7]);
      }
    }
    P.add(G.box(), light, [0, y0 + H.hullH * 0.95, -H.len * 0.5], [0.4, 0, 0],
      [H.wid * 0.7, 0.3, 0.9]);
  }

  const hullMesh = P.mesh(plateMat);
  leanG.add(hullMesh);
  const hullAccent = A.mesh(emitMat, { shadow: false });
  if (hullAccent) leanG.add(hullAccent);

  // ---- turret -----------------------------------------------------------
  const turretG = new THREE.Group();
  turretG.position.y = H.turretY;
  leanG.add(turretG);

  const T = new Parts();
  const TA = new Parts();
  const tr = H.turretR;
  T.add(G.cyl(9), mid, [0, 0, 0], [0, 0, 0], [tr * 2, 0.42, tr * 2.1]);
  T.add(G.box(), base, [0, 0.42, 0.1], [0, 0, 0], [tr * 1.6, 0.62, tr * 1.9]);
  // sloped cheeks
  for (const side of [-1, 1]) {
    T.add(G.box(), light, [side * tr * 0.78, 0.4, -tr * 0.5], [0, side * 0.42, 0],
      [tr * 0.5, 0.6, tr * 1.1]);
  }
  // mantlet
  T.add(G.box(), light, [0, 0.4, -tr * 1.02], [0, 0, 0], [tr * 1.15, 0.66, 0.55]);
  // commander cupola + hatch
  T.add(G.cyl(8), mid, [tr * 0.34, 0.82, tr * 0.2], [0, 0, 0], [0.72, 0.34, 0.72]);
  T.add(G.cyl(8), dark, [tr * 0.34, 0.99, tr * 0.2], [0, 0, 0], [0.66, 0.09, 0.66]);
  // sight block
  T.add(G.box(), dark, [-tr * 0.42, 0.78, -tr * 0.35], [0, 0, 0], [0.4, 0.26, 0.5]);
  TA.add(G.box(), accent, [-tr * 0.42, 0.78, -tr * 0.62], [0, 0, 0], [0.3, 0.12, 0.05]);
  // stowage basket on the bustle
  T.add(G.box(), dark, [0, 0.5, tr * 1.15], [0, 0, 0], [tr * 1.3, 0.5, 0.5]);
  // smoke launchers
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      T.add(G.cyl(6), dark, [side * (tr * 0.6 + i * 0.16), 0.62, -tr * 0.75],
        [Math.PI / 2 - 0.5, 0, 0], [0.14, 0.34, 0.14]);
    }
  }
  // antenna + beacon
  T.add(G.cyl(4), dark, [tr * 0.6, 1.4, tr * 0.5], [0, 0, 0.05], [0.05, 1.4, 0.05]);
  TA.add(G.ico(0), accent, [tr * 0.62, 2.12, tr * 0.5], [0, 0, 0], 0.14);
  if (isPlayer) {
    // drone landing pad on the rear deck
    T.add(G.cyl(6), dark, [0, 0.76, tr * 1.15], [0, 0, 0], [0.9, 0.1, 0.9]);
    TA.add(G.cyl(6), accent, [0, 0.82, tr * 1.15], [0, 0, 0], [0.62, 0.04, 0.62]);
  }

  const turretMesh = T.mesh(plateMat);
  turretG.add(turretMesh);
  const turretAccent = TA.mesh(emitMat, { shadow: false });
  if (turretAccent) turretG.add(turretAccent);

  // ---- barrel -----------------------------------------------------------
  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.4, -tr * 1.0);
  turretG.add(barrelG);

  const B = new Parts();
  const muzzles = [];
  const flashes = [];
  const flashMat = glowBasic(accent, 2.4, { transparent: true, opacity: 0.95, depthWrite: false });
  const addMuzzle = (x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    barrelG.add(o);
    muzzles.push(o);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), flashMat);
    f.position.set(x, y, z - 0.1);
    f.scale.setScalar(0.001);
    barrelG.add(f);
    flashes.push(f);
  };

  const gunTint = mixHex(dark, 0x000000, 0.2);
  switch (weaponKind) {
    case 'burst': {
      for (const x of [-0.24, 0.24]) {
        B.add(G.cyl(7), gunTint, [x, 0, -1.5], [Math.PI / 2, 0, 0], [0.2, 3.0, 0.2]);
        B.add(G.box(), dark, [x, 0, -2.9], [0, 0, 0], [0.3, 0.3, 0.5]);
        addMuzzle(x, 0, -3.1);
      }
      B.add(G.box(), mid, [0, 0, -0.4], [0, 0, 0], [0.9, 0.5, 0.9]);
      break;
    }
    case 'arc': {
      // short fat mortar tube, mounted nose-up
      B.add(G.taper(9), gunTint, [0, 0.34, -0.75], [Math.PI / 2 - 0.3, 0, 0], [0.72, 2.0, 0.72]);
      B.add(G.cyl(9), dark, [0, 0.72, -1.35], [Math.PI / 2 - 0.3, 0, 0], [0.82, 0.28, 0.82]);
      B.add(G.box(), mid, [0, 0.1, -0.2], [0, 0, 0], [1.0, 0.6, 0.8]);
      addMuzzle(0, 0.82, -1.5);
      break;
    }
    case 'salvo': {
      // boxed rocket pod: 2 rows of tubes
      B.add(G.box(), mid, [0, 0.24, -0.9], [0, 0, 0], [1.7, 0.9, 1.9]);
      for (let r = 0; r < 2; r++) {
        for (let cIdx = 0; cIdx < 3; cIdx++) {
          const x = (cIdx - 1) * 0.5;
          const y = 0.05 + r * 0.42;
          B.add(G.cyl(6), gunTint, [x, y, -1.3], [Math.PI / 2, 0, 0], [0.34, 1.7, 0.34]);
          if (r === 0 && cIdx === 1) addMuzzle(x, y, -1.85);
        }
      }
      addMuzzle(-0.5, 0.05, -1.85);
      addMuzzle(0.5, 0.47, -1.85);
      break;
    }
    case 'rail': {
      B.add(G.box(), gunTint, [0, 0.12, -2.0], [0, 0, 0], [0.22, 0.5, 4.4]);
      B.add(G.box(), gunTint, [0, -0.12, -2.0], [0, 0, 0], [0.22, 0.5, 4.4]);
      for (let i = 0; i < 4; i++) {
        B.add(G.box(), mid, [0, 0, -0.8 - i * 0.9], [0, 0, 0], [0.62, 0.62, 0.22]);
      }
      B.add(G.box(), mid, [0, 0, -0.2], [0, 0, 0], [0.9, 0.9, 0.9]);
      addMuzzle(0, 0, -4.3);
      break;
    }
    case 'cluster': {
      B.add(G.cyl(8), gunTint, [0, 0.1, -1.5], [Math.PI / 2, 0, 0], [0.5, 3.1, 0.5]);
      B.add(G.cyl(8), dark, [0, 0.1, -3.05], [Math.PI / 2, 0, 0], [0.62, 0.5, 0.62]);
      B.add(G.box(), mid, [0, 0.1, -0.35], [0, 0, 0], [0.95, 0.7, 0.9]);
      addMuzzle(0, 0.1, -3.35);
      break;
    }
    default: {
      // direct-fire main gun with muzzle brake and thermal sleeve
      const L = weaponKind === 'direct' ? 3.9 : 3.4;
      B.add(G.cyl(8), gunTint, [0, 0, -L * 0.5], [Math.PI / 2, 0, 0], [0.34, L, 0.34]);
      B.add(G.cyl(8), mid, [0, 0, -L * 0.28], [Math.PI / 2, 0, 0], [0.46, L * 0.42, 0.46]);
      B.add(G.box(), dark, [0, 0, -L * 0.94], [0, 0, 0], [0.46, 0.46, 0.62]);
      B.add(G.box(), dark, [0, 0, -L * 0.86], [0, 0, 0], [0.62, 0.2, 0.3]);
      B.add(G.box(), mid, [0, 0, -0.15], [0, 0, 0], [0.8, 0.62, 0.7]);
      addMuzzle(0, 0, -L - 0.15);
      break;
    }
  }
  const barrelMesh = B.mesh(plateMat);
  if (barrelMesh) barrelG.add(barrelMesh);

  return {
    grp, tiltG, leanG, turretG, barrelG,
    hullMesh, turretMesh, barrelMesh,
    muzzles, muzzleFlash: flashes, flashMat,
    dims: H,
    accentMeshes: [hullAccent, turretAccent].filter(Boolean),
  };
}

// The escort mission's fuel hauler. It reuses the whole Tank pipeline (terrain
// physics, armour facing, AI targeting) so it only needs a different body.
function buildHauler(hull, accent) {
  const grp = new THREE.Group();
  const tiltG = new THREE.Group();
  const leanG = new THREE.Group();
  grp.add(tiltG);
  tiltG.add(leanG);

  const base = hull;
  const dark = mixHex(base, 0x0a0a0c, 0.68);
  const mid = mixHex(base, 0x000000, 0.2);
  const P = new Parts();
  const A = new Parts();

  // chassis rails + flatbed
  P.add(G.box(), dark, [0, 0.85, 0.3], [0, 0, 0], [2.5, 0.34, 7.4]);
  // cab
  P.add(G.box(), base, [0, 1.7, -2.6], [0, 0, 0], [2.6, 1.5, 2.2]);
  P.add(G.box(), 0x1a2028, [0, 2.05, -3.66], [0, 0, 0], [2.1, 0.8, 0.14]);
  P.add(G.box(), mid, [0, 2.55, -2.4], [0, 0, 0], [2.4, 0.2, 1.8]);
  // exhaust stack
  P.add(G.cyl(6), dark, [1.1, 2.6, -1.7], [0, 0, 0], [0.24, 1.9, 0.24]);
  // wheels
  for (const sx of [-1, 1]) {
    for (const z of [-2.7, 0.9, 2.5]) {
      P.add(G.cyl(10), 0x141312, [sx * 1.32, 0.78, z], [0, 0, Math.PI / 2], [1.55, 0.6, 1.55]);
    }
  }
  A.add(G.box(), accent, [0, 1.05, 0.3], [0, 0, 0], [2.62, 0.09, 5.2]);
  for (const sx of [-1, 1]) {
    A.add(G.cyl(7), 0xfff0c0, [sx * 0.9, 1.6, -3.7], [Math.PI / 2, 0, 0], [0.32, 0.12, 0.32]);
  }

  const hullMesh = P.mesh(plateMat);
  leanG.add(hullMesh);
  const hullAccent = A.mesh(emitMat, { shadow: false });
  if (hullAccent) leanG.add(hullAccent);

  // "turret" = the tank of fuel on the back, so hits read as hits
  const turretG = new THREE.Group();
  turretG.position.set(0, 1.05, 1.5);
  leanG.add(turretG);
  const T = new Parts();
  T.add(G.cyl(12), mixHex(base, 0xffffff, 0.2), [0, 1.0, 0], [Math.PI / 2, 0, 0], [2.1, 4.6, 2.1]);
  T.add(G.cyl(12), dark, [0, 1.0, -2.3], [Math.PI / 2, 0, 0], [2.15, 0.24, 2.15]);
  T.add(G.cyl(12), dark, [0, 1.0, 2.3], [Math.PI / 2, 0, 0], [2.15, 0.24, 2.15]);
  T.add(G.box(), dark, [0, 2.15, 0], [0, 0, 0], [0.7, 0.4, 0.9]);
  const turretMesh = T.mesh(plateMat);
  turretG.add(turretMesh);

  const barrelG = new THREE.Group();
  turretG.add(barrelG);
  const dummy = new THREE.Object3D();
  dummy.position.set(0, 1, -2.6);
  barrelG.add(dummy);

  return {
    grp, tiltG, leanG, turretG, barrelG,
    hullMesh, turretMesh, barrelMesh: null,
    muzzles: [dummy], muzzleFlash: [], flashMat: null,
    dims: { len: 8, wid: 2.8, turretY: 1.05, turretR: 1.1 },
    accentMeshes: hullAccent ? [hullAccent] : [],
  };
}

// A small quadcopter — the player's eye in the sky.
export function buildDrone(accent = 0x6ae4ff) {
  const grp = new THREE.Group();
  const P = new Parts();
  const A = new Parts();
  const body = 0x22262c;
  const dark = 0x14161a;

  P.add(G.box(), body, [0, 0, 0], [0, 0, 0], [0.9, 0.26, 1.3]);
  P.add(G.box(), mixHex(body, 0xffffff, 0.15), [0, 0.18, -0.1], [0, 0, 0], [0.6, 0.2, 0.8]);
  A.add(G.ico(0), accent, [0, 0.06, -0.62], [0, 0, 0], 0.22);          // camera eye
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    P.add(G.box(), dark, [sx * 0.42, 0, sz * 0.5], [0, sx * sz * 0.6, 0], [0.62, 0.09, 0.12]);
    P.add(G.cyl(8), dark, [sx * 0.78, 0.02, sz * 0.86], [0, 0, 0], [0.34, 0.1, 0.34]);
    A.add(G.cyl(6), accent, [sx * 0.78, -0.1, sz * 0.86], [0, 0, 0], [0.12, 0.05, 0.12]);
  }
  const mesh = P.mesh(plateMat, { shadow: false });
  grp.add(mesh);
  const acc = A.mesh(emitMat, { shadow: false });
  if (acc) grp.add(acc);

  // spinning rotor discs
  const rotors = [];
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x9fb4c4, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.46, 12), rotorMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(sx * 0.78, 0.1, sz * 0.86);
    grp.add(r);
    rotors.push(r);
  }
  return { grp, mesh, rotors };
}
