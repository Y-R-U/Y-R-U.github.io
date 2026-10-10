// Builds the tracked dusk tank mesh (visuals from Murder at Dusk), tinted
// with a per-tank accent color. Returns the group plus the refs systems need.
//
// Geometry is shared by every tank and materials are cached per accent (the
// palette is fixed), so building a tank allocates no GPU resources and match
// restarts cannot leak. Nothing here ever needs disposing.

import * as THREE from 'three';
import { glowBasic } from './world.js';

const HULL_BASE = new THREE.Color(0x3f4434);   // weathered olive

const G = {
  hull: new THREE.BoxGeometry(2.4, 0.7, 3.6),
  glacis: new THREE.BoxGeometry(2.1, 0.55, 1.1),
  deck: new THREE.BoxGeometry(1.8, 0.4, 2.4),
  track: new THREE.BoxGeometry(0.7, 0.85, 4.0),
  guard: new THREE.BoxGeometry(0.78, 0.12, 4.1),
  trim: new THREE.BoxGeometry(0.06, 0.07, 3.8),
  turretBase: new THREE.CylinderGeometry(0.85, 1.0, 0.4, 8),
  turretHead: new THREE.BoxGeometry(1.3, 0.6, 1.5),
  visor: new THREE.BoxGeometry(0.85, 0.12, 0.06),
  rail: new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6),
  tip: new THREE.SphereGeometry(0.15, 8, 6),
  brake: new THREE.BoxGeometry(0.2, 0.2, 0.34),
  antenna: new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4),
  beacon: new THREE.SphereGeometry(0.07, 6, 4),
  bubble: new THREE.IcosahedronGeometry(2.9, 1),
};

const darkMat = new THREE.MeshStandardMaterial({
  color: 0x1d1a16, flatShading: true, roughness: 0.8, metalness: 0.3 });
const bubbleMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x4dc4ff).multiplyScalar(1.3), transparent: true, opacity: 0.22,
  wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });

const accentMats = new Map();
function matsFor(accentHex) {
  let m = accentMats.get(accentHex);
  if (!m) {
    const accent = new THREE.Color(accentHex);
    m = {
      // hull color leans slightly toward the accent so silhouettes differ too
      hull: new THREE.MeshStandardMaterial({
        color: HULL_BASE.clone().lerp(accent, 0.16),
        emissive: 0x141408, emissiveIntensity: 0.7,
        flatShading: true, roughness: 0.6, metalness: 0.35 }),
      trim: glowBasic(accentHex, 1.5),
      tip: glowBasic(accentHex, 2.2),
    };
    accentMats.set(accentHex, m);
  }
  return m;
}

function part(geo, mat, parent, shadow) {
  const mesh = new THREE.Mesh(geo, mat);
  if (shadow) mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildTankMesh(accentHex) {
  const M = matsFor(accentHex);
  const grp = new THREE.Group();
  const leanG = new THREE.Group();
  grp.add(leanG);

  // Hull (faces -z)
  part(G.hull, M.hull, leanG, true).position.y = 0.95;
  const glacis = part(G.glacis, M.hull, leanG, true);
  glacis.position.set(0, 1.1, -1.95);
  glacis.rotation.x = 0.5;
  part(G.deck, M.hull, leanG, true).position.y = 1.45;

  // Tracks with accent trim strips
  [-1, 1].forEach((side) => {
    part(G.track, darkMat, leanG, true).position.set(side * 1.35, 0.55, 0);
    part(G.guard, M.hull, leanG).position.set(side * 1.35, 1.05, 0);
    part(G.trim, M.trim, leanG).position.set(side * 1.76, 0.98, 0);
  });

  // Turret
  const turretG = new THREE.Group();
  turretG.position.y = 1.85;
  leanG.add(turretG);
  part(G.turretBase, M.hull, turretG, true);
  part(G.turretHead, M.hull, turretG, true).position.y = 0.45;
  part(G.visor, M.trim, turretG).position.set(0, 0.52, -0.76);

  // Twin cannon
  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.55, -0.4);
  turretG.add(barrelG);

  const muzzles = [];
  const muzzleFlash = [];
  [-0.24, 0.24].forEach((x) => {
    const rail = part(G.rail, darkMat, barrelG, true);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0, -1.3);
    part(G.brake, darkMat, barrelG).position.set(x, 0, -2.5);
    const tip = part(G.tip, M.tip, barrelG);
    tip.position.set(x, 0, -2.62);
    tip.scale.setScalar(0.001);
    muzzleFlash.push(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -2.66);
    barrelG.add(muzzle);
    muzzles.push(muzzle);
  });

  // Antenna with accent beacon
  part(G.antenna, darkMat, turretG).position.set(0.55, 1.05, 0.55);
  part(G.beacon, M.trim, turretG).position.set(0.55, 1.65, 0.55);

  // Shield bubble, shown while the shield pickup is active
  const bubble = part(G.bubble, bubbleMat, grp);
  bubble.position.y = 1.3;
  bubble.visible = false;

  return { grp, leanG, turretG, barrelG, muzzles, muzzleFlash, bubble };
}
