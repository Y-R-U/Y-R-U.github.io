// Builds the tracked dusk tank mesh (visuals from Murder at Dusk), tinted
// with a per-tank accent color. Returns the group plus the refs systems need.

import * as THREE from 'three';
import { glowBasic } from './world.js';

const HULL_BASE = new THREE.Color(0x3f4434);   // weathered olive

export function buildTankMesh(accentHex, isPlayer) {
  const accent = new THREE.Color(accentHex);
  const grp = new THREE.Group();
  const leanG = new THREE.Group();
  grp.add(leanG);

  // hull color leans slightly toward the accent so silhouettes differ too
  const hullMat = new THREE.MeshStandardMaterial({
    color: HULL_BASE.clone().lerp(accent, 0.16),
    emissive: 0x141408, emissiveIntensity: 0.7,
    flatShading: true, roughness: 0.6, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1d1a16, flatShading: true, roughness: 0.8, metalness: 0.3 });
  const trimMat = glowBasic(accentHex, 1.5);

  // Hull (faces -z)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 3.6), hullMat);
  hull.position.y = 0.95;
  hull.castShadow = true;
  leanG.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.1), hullMat);
  glacis.position.set(0, 1.1, -1.95);
  glacis.rotation.x = 0.5;
  glacis.castShadow = true;
  leanG.add(glacis);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 2.4), hullMat);
  deck.position.y = 1.45;
  deck.castShadow = true;
  leanG.add(deck);

  // Tracks with accent trim strips
  [-1, 1].forEach((side) => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 4.0), darkMat);
    track.position.set(side * 1.35, 0.55, 0);
    track.castShadow = true;
    leanG.add(track);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 4.1), hullMat);
    guard.position.set(side * 1.35, 1.05, 0);
    leanG.add(guard);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 3.8), trimMat);
    trim.position.set(side * 1.76, 0.98, 0);
    leanG.add(trim);
  });

  // Only the player gets a real light — 16 point lights would crush the GPU
  if (isPlayer) {
    const glow = new THREE.PointLight(accentHex, 3.0, 8);
    glow.position.y = 1.6;
    leanG.add(glow);
  }

  // Turret
  const turretG = new THREE.Group();
  turretG.position.y = 1.85;
  leanG.add(turretG);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.0, 0.4, 8), hullMat);
  turretBase.castShadow = true;
  turretG.add(turretBase);

  const turretHead = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.5), hullMat);
  turretHead.position.y = 0.45;
  turretHead.castShadow = true;
  turretG.add(turretHead);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.06), trimMat);
  visor.position.set(0, 0.52, -0.76);
  turretG.add(visor);

  // Twin cannon
  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.55, -0.4);
  turretG.add(barrelG);

  const railGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6);
  const tipGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const muzzles = [];
  const muzzleFlash = [];
  [-0.24, 0.24].forEach((x) => {
    const rail = new THREE.Mesh(railGeo, darkMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0, -1.3);
    rail.castShadow = true;
    barrelG.add(rail);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.34), darkMat);
    brake.position.set(x, 0, -2.5);
    barrelG.add(brake);
    const tip = new THREE.Mesh(tipGeo, glowBasic(accentHex, 2.2));
    tip.position.set(x, 0, -2.62);
    tip.scale.setScalar(0.001);
    barrelG.add(tip);
    muzzleFlash.push(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -2.66);
    barrelG.add(muzzle);
    muzzles.push(muzzle);
  });

  // Antenna with accent beacon
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), darkMat);
  antenna.position.set(0.55, 1.05, 0.55);
  turretG.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), trimMat);
  beacon.position.set(0.55, 1.65, 0.55);
  turretG.add(beacon);

  return { grp, leanG, turretG, barrelG, muzzles, muzzleFlash };
}
