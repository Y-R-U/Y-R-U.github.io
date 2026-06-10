// Builds the hover-tank mesh (visuals from Drone Storm), tinted with a
// per-tank accent color. Returns the group plus the refs systems need.

import * as THREE from 'three';
import { neonBasic } from './world.js';

const HULL_BASE = new THREE.Color(0x39406b);

export function buildTankMesh(accentHex, isPlayer) {
  const accent = new THREE.Color(accentHex);
  const grp = new THREE.Group();
  const leanG = new THREE.Group();
  grp.add(leanG);

  // hull color leans slightly toward the accent so silhouettes differ too
  const hullMat = new THREE.MeshStandardMaterial({
    color: HULL_BASE.clone().lerp(accent, 0.16),
    emissive: 0x0c0a22, emissiveIntensity: 1,
    flatShading: true, roughness: 0.45, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161a2e, flatShading: true, roughness: 0.7, metalness: 0.3 });
  const trimMat = neonBasic(accentHex, 1.5);

  // Hull (faces -z)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.62, 3.5), hullMat);
  hull.position.y = 0.62;
  hull.castShadow = true;
  leanG.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 2.5), hullMat);
  deck.position.y = 1.1;
  deck.castShadow = true;
  leanG.add(deck);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.0), hullMat);
  glacis.position.set(0, 0.78, -1.95);
  glacis.rotation.x = 0.5;
  glacis.castShadow = true;
  leanG.add(glacis);

  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 3.3), darkMat);
    skirt.position.set(side * 1.42, 0.5, 0);
    skirt.castShadow = true;
    leanG.add(skirt);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 3.0), trimMat);
    trim.position.set(side * 1.62, 0.52, 0);
    leanG.add(trim);
  });

  // Hover pads
  const padGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.14, 8);
  const padMats = [];
  for (const [px, pz] of [[-0.95, -1.25], [0.95, -1.25], [-0.95, 1.25], [0.95, 1.25]]) {
    const padMat = new THREE.MeshBasicMaterial({
      color: accent.clone().multiplyScalar(1.5), transparent: true, opacity: 0.9 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(px, 0.18, pz);
    leanG.add(pad);
    padMats.push(padMat);
  }

  // Only the player gets a real light — 16 point lights would crush the GPU
  if (isPlayer) {
    const glow = new THREE.PointLight(accentHex, 4, 7);
    glow.position.y = 0.25;
    leanG.add(glow);
  }

  // Turret
  const turretG = new THREE.Group();
  turretG.position.y = 1.42;
  leanG.add(turretG);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.95, 0.34, 8), hullMat);
  turretBase.castShadow = true;
  turretG.add(turretBase);

  const turretHead = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.52, 1.5), hullMat);
  turretHead.position.y = 0.4;
  turretHead.castShadow = true;
  turretG.add(turretHead);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.06), trimMat);
  visor.position.set(0, 0.46, -0.76);
  turretG.add(visor);

  // Twin laser rails
  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.42, -0.55);
  turretG.add(barrelG);

  const railGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.3, 6);
  const tipGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const muzzles = [];
  const muzzleFlash = [];
  [-0.2, 0.2].forEach((x) => {
    const rail = new THREE.Mesh(railGeo, darkMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0, -1.15);
    rail.castShadow = true;
    barrelG.add(rail);
    const tip = new THREE.Mesh(tipGeo, neonBasic(accentHex, 2.2));
    tip.position.set(x, 0, -2.3);
    tip.scale.setScalar(0.001);
    barrelG.add(tip);
    muzzleFlash.push(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -2.35);
    barrelG.add(muzzle);
    muzzles.push(muzzle);
  });

  // Antenna with accent beacon
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), darkMat);
  antenna.position.set(0.5, 0.95, 0.55);
  turretG.add(antenna);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), trimMat);
  antennaTip.position.set(0.5, 1.5, 0.55);
  turretG.add(antennaTip);

  return { grp, leanG, turretG, barrelG, muzzles, muzzleFlash, padMats };
}
