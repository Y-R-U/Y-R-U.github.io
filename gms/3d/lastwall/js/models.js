// LASTWALL — hand-built humanoid + weapon meshes, all primitives.
// Every body part is its OWN mesh under a named joint pivot, so ragdoll.js can
// detach/reattach them and dismember. Never merge these geometries.
import * as THREE from 'three';
import { LITE } from './config.js';
import { rand } from './utils.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.userData.shared = true; // never dispose on level teardown
export const mat = (c, e = 0, ei = 0) => {
  const m = new THREE.MeshLambertMaterial({ color: c });
  if (e) { m.emissive = new THREE.Color(e); m.emissiveIntensity = ei || 1; }
  return m;
};

function part(parent, name, w, h, d, m, px, py, pz, mx = 0, my = 0, mz = 0) {
  const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(px, py, pz);
  const mesh = new THREE.Mesh(BOX, m);
  mesh.scale.set(w, h, d); mesh.position.set(mx, my, mz);
  mesh.castShadow = !LITE;
  pivot.add(mesh); parent.add(pivot);
  return { pivot, mesh, name };
}

// palettes per kind — [coat/torso, skin, legs, accent]
const KINDS = {
  hero:     { s: 1.00, torso: 0x8a5a2e, skin: 0xd9a878, legs: 0x3e3a33, accent: 0x2e6e4e, hunch: 0.04, reach: 0 },
  shambler: { s: 0.98, torso: 0x5a6248, skin: 0x91a06d, legs: 0x474a3a, accent: 0x3a4030, hunch: 0.38, reach: 1.15 },
  sprinter: { s: 0.94, torso: 0x6e3f34, skin: 0xb06a52, legs: 0x4a332c, accent: 0x30201a, hunch: 0.52, reach: 1.35 },
  brute:    { s: 1.55, torso: 0x424d42, skin: 0x6a7a5c, legs: 0x38402f, accent: 0x222a20, hunch: 0.30, reach: 0.7, broad: 1.35 },
  bloater:  { s: 1.15, torso: 0xb0b070, skin: 0xc8c884, legs: 0x8a8a58, accent: 0x6a6a3c, hunch: 0.22, reach: 0.9, bulb: true },
  boss:     { s: 1.9,  torso: 0x3a2f3f, skin: 0x7a5a74, legs: 0x2c2430, accent: 0x14202c, hunch: 0.26, reach: 0.8, broad: 1.4 },
};

const jitter = (c, amt = 0.06) => new THREE.Color(c).offsetHSL(rand(-amt, amt), rand(-amt, amt), rand(-amt, amt));

// Skeleton (scale 1): hip@1.0, thigh .5, shin .5, chest pivot 1.06→neck 1.66, shoulders ±.34@+.52
export function makeHumanoid(kind = 'shambler', opt = {}) {
  const K = KINDS[kind] || KINDS.shambler;
  const s = K.s * (opt.scale || 1), broad = K.broad || 1;
  const group = new THREE.Group();               // at feet
  const body = new THREE.Group(); body.position.y = s; group.add(body); // hip origin
  const zed = kind !== 'hero';
  const cT = zed ? jitter(K.torso) : new THREE.Color(K.torso);
  const cS = zed ? jitter(K.skin, 0.04) : new THREE.Color(K.skin);
  const cL = zed ? jitter(K.legs) : new THREE.Color(K.legs);

  const mT = mat(cT), mS = mat(cS), mL = mat(cL), mA = mat(K.accent);
  const P = {};
  // pelvis + chest + head
  P.pelvis = part(body, 'pelvis', .5 * s * broad, .26 * s, .3 * s, mL, 0, 0, 0, 0, .04 * s, 0);
  P.chest  = part(P.pelvis.pivot, 'chest', .56 * s * broad, .55 * s, .34 * s, mT, 0, .08 * s, 0, 0, .34 * s, 0);
  P.head   = part(P.chest.pivot, 'head', .34 * s, .4 * s, .36 * s, mS, 0, .62 * s, 0, 0, .22 * s, .02 * s);
  if (K.bulb) { // bloater belly + pustules
    const belly = new THREE.Mesh(BOX, mat(K.skin, 0x9aff3a, .55));
    belly.scale.set(.62 * s, .5 * s, .5 * s); belly.position.set(0, .22 * s, .1 * s);
    P.chest.pivot.add(belly); P.chest.extra = belly;
  }
  if (kind === 'hero') { // backpack + glowing cure vial
    const pack = new THREE.Mesh(BOX, mA); pack.scale.set(.4 * s, .44 * s, .18 * s); pack.position.set(0, .3 * s, -.26 * s);
    const vial = new THREE.Mesh(BOX, mat(0x184a30, 0x35ff88, 1.6)); vial.scale.set(.1 * s, .26 * s, .1 * s); vial.position.set(.12 * s, .34 * s, -.37 * s);
    P.chest.pivot.add(pack, vial);
  }
  if (kind === 'boss') { // spiked pauldrons
    for (const sx of [-1, 1]) {
      const sp = new THREE.Mesh(BOX, mA); sp.scale.set(.26 * s, .3 * s, .3 * s); sp.position.set(sx * .42 * s, .55 * s, 0); sp.rotation.z = sx * .3;
      P.chest.pivot.add(sp);
    }
  }
  // eyes (zombies glow)
  if (zed) {
    const eye = new THREE.Mesh(BOX, mat(0x220000, kind === 'boss' ? 0xff2a6a : 0xffc03a, 2));
    eye.scale.set(.26 * s, .05 * s, .04 * s); eye.position.set(0, .24 * s, .2 * s);
    P.head.pivot.add(eye);
  }
  // arms: shoulder pivots on chest
  for (const [sfx, sx] of [['L', -1], ['R', 1]]) {
    P['uarm' + sfx] = part(P.chest.pivot, 'uarm' + sfx, .16 * s, .42 * s, .16 * s, mT, sx * .36 * s * broad, .52 * s, 0, 0, -.19 * s, 0);
    P['farm' + sfx] = part(P['uarm' + sfx].pivot, 'farm' + sfx, .14 * s, .42 * s, .15 * s, mS, 0, -.42 * s, 0, 0, -.19 * s, 0);
  }
  // legs: hip pivots on pelvis
  for (const [sfx, sx] of [['L', -1], ['R', 1]]) {
    P['thigh' + sfx] = part(P.pelvis.pivot, 'thigh' + sfx, .2 * s, .46 * s, .22 * s, mL, sx * .17 * s * broad, -.02 * s, 0, 0, -.23 * s, 0);
    P['shin' + sfx]  = part(P['thigh' + sfx].pivot, 'shin' + sfx, .17 * s, .46 * s, .19 * s, mS, 0, -.48 * s, 0, 0, -.22 * s, 0);
    const foot = new THREE.Mesh(BOX, mA); foot.scale.set(.18 * s, .1 * s, .3 * s); foot.position.set(0, -.48 * s, .06 * s);
    P['shin' + sfx].pivot.add(foot); P['shin' + sfx].foot = foot;
  }
  // hand attach for weapons (right forearm tip)
  const handR = new THREE.Group(); handR.position.set(0, -.4 * s, .02 * s); P.farmR.pivot.add(handR);

  const h = {
    group, body, parts: P, kind, K, s, handR, phase: rand(Math.PI * 2),
    // locomotion + idle. speed: 0..1 walk-run blend. Combat poses applied by caller AFTER.
    animate(t, speed = 0, dt = 0) {
      const ph = t * (6 + speed * 5.5) + this.phase, sw = (0.25 + speed * 0.65);
      const L = Math.sin(ph), R = Math.sin(ph + Math.PI);
      P.thighL.pivot.rotation.x = L * sw; P.thighR.pivot.rotation.x = R * sw;
      P.shinL.pivot.rotation.x = Math.max(0, -L) * sw * 1.4 + .08;
      P.shinR.pivot.rotation.x = Math.max(0, -R) * sw * 1.4 + .08;
      body.position.y = this.s * (1 + Math.abs(Math.cos(ph)) * 0.05 * speed - K.hunch * 0.18);
      P.chest.pivot.rotation.x = K.hunch + Math.sin(ph * 2) * 0.03 * speed;
      P.head.pivot.rotation.x = -K.hunch * 0.7;
      P.chest.pivot.rotation.y = Math.sin(ph) * 0.06 * speed;
      if (K.reach) { // zombie arms-forward grasp + shiver
        const g = Math.sin(t * 2.1 + this.phase) * 0.08;
        P.uarmL.pivot.rotation.set(-K.reach + L * .12 + g, 0, -.18);
        P.uarmR.pivot.rotation.set(-K.reach + R * .12 - g, 0, .18);
        P.farmL.pivot.rotation.x = -.35 + g; P.farmR.pivot.rotation.x = -.35 - g;
      } else {
        P.uarmL.pivot.rotation.set(R * sw * .8, 0, -.08);
        P.uarmR.pivot.rotation.set(L * sw * .8, 0, .08);
        P.farmL.pivot.rotation.x = -.3 - Math.max(0, R) * .5;
        P.farmR.pivot.rotation.x = -.3 - Math.max(0, L) * .5;
      }
    },
    // world-space joint positions for ragdoll conversion
    joints() {
      const v = n => { const p = new THREE.Vector3(); P[n].pivot.getWorldPosition(p); return p; };
      const tip = (n, len) => { const p = new THREE.Vector3(0, -len * this.s, 0); P[n].pivot.localToWorld(p); return p; };
      const headTop = new THREE.Vector3(0, .44 * this.s, 0); P.head.pivot.localToWorld(headTop);
      return {
        hip: v('pelvis'), neck: v('head'), head: headTop,
        shL: v('uarmL'), shR: v('uarmR'),
        elbL: v('farmL'), elbR: v('farmR'),
        handL: tip('farmL', .42), handR: tip('farmR', .42),
        kneeL: v('shinL'), kneeR: v('shinR'),
        footL: tip('shinL', .48), footR: tip('shinR', .48),
      };
    },
  };
  return h;
}

// ---------- weapons (grip at origin, barrel +Z) ----------
const wmats = {
  metal: mat(0x5a5f66), dark: mat(0x2e3136), wood: mat(0x6e4a2a),
  glowP: mat(0x3a2a5e, 0x8a5aff, 1.6), glowO: mat(0x5e2a1a, 0xff7a2a, 1.5),
};
for (const m of Object.values(wmats)) m.userData.shared = true; // module singletons — never dispose
function wbox(g, m, w, h, d, x, y, z, rx = 0) {
  const b = new THREE.Mesh(BOX, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b;
}
export function makeWeaponMesh(id) {
  const g = new THREE.Group(); const muzzle = new THREE.Group(); g.add(muzzle);
  switch (id) {
    case 'pipe': wbox(g, wmats.metal, .07, .07, .9, 0, 0, .3); wbox(g, wmats.dark, .1, .1, .16, 0, 0, -.06); muzzle.position.set(0, 0, .75); break;
    case 'bat': wbox(g, wmats.wood, .09, .09, 1.0, 0, 0, .35); wbox(g, wmats.metal, .12, .12, .3, 0, 0, .68); muzzle.position.set(0, 0, .85); break;
    case 'sledge': wbox(g, wmats.wood, .08, .08, 1.15, 0, 0, .4); wbox(g, wmats.metal, .34, .22, .22, 0, 0, .95); muzzle.position.set(0, 0, .95); break;
    case 'scrap': wbox(g, wmats.dark, .09, .18, .3, 0, .04, .1); wbox(g, wmats.metal, .06, .06, .3, 0, .12, .3); muzzle.position.set(0, .12, .46); break;
    case 'repeater': wbox(g, wmats.dark, .1, .2, .42, 0, .04, .12); wbox(g, wmats.metal, .07, .07, .5, 0, .14, .35); wbox(g, wmats.wood, .09, .12, .18, 0, -.04, -.08); muzzle.position.set(0, .14, .62); break;
    case 'longiron': wbox(g, wmats.metal, .07, .1, 1.0, 0, .1, .3); wbox(g, wmats.wood, .09, .16, .4, 0, 0, -.1); muzzle.position.set(0, .12, .82); break;
    case 'scatter': wbox(g, wmats.wood, .11, .16, .5, 0, 0, 0); wbox(g, wmats.metal, .09, .12, .6, 0, .06, .45); muzzle.position.set(0, .06, .78); break;
    case 'stitcher': wbox(g, wmats.dark, .12, .22, .5, 0, .02, .1); wbox(g, wmats.metal, .05, .05, .4, 0, .1, .42); wbox(g, wmats.metal, .08, .2, .1, 0, -.14, .16); muzzle.position.set(0, .1, .64); break;
    case 'flame': wbox(g, wmats.dark, .14, .2, .55, 0, .02, .1); wbox(g, wmats.glowO, .1, .1, .5, 0, .08, .45); wbox(g, wmats.glowO, .16, .3, .16, 0, -.1, -.05); muzzle.position.set(0, .08, .72); break;
    case 'maul': wbox(g, wmats.dark, .1, .1, 1.5, 0, 0, .5); wbox(g, wmats.glowP, .5, .34, .34, 0, 0, 1.2); wbox(g, wmats.metal, .56, .16, .16, 0, 0, 1.2); muzzle.position.set(0, 0, 1.2); break;
    case 'howler': wbox(g, wmats.dark, .18, .24, .7, 0, 0, .15); wbox(g, wmats.glowP, .26, .26, .3, 0, .02, .6); wbox(g, wmats.dark, .3, .3, .06, 0, .02, .78); muzzle.position.set(0, .02, .8); break;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = !LITE; });
  return { group: g, muzzle };
}
