// Physical projectiles: ballista bolts (fast darts), cannonballs and catapult
// boulders (ballistic arcs). Instant effects (frost pulse, chain zap) live in
// fx.js — these are the ones that fly.

import * as THREE from 'three';
import { M, mesh } from './utils.js';

let scene = null;
const actives = [];

export function initProjectiles(s) { scene = s; }

export function tickProjectiles(dt) {
  for (let i = actives.length - 1; i >= 0; i--) {
    if (!actives[i].tick(dt)) {
      scene.remove(actives[i].obj);
      actives[i].dispose?.();
      actives.splice(i, 1);
    }
  }
}
export function clearProjectiles() {
  for (const a of actives) { scene.remove(a.obj); a.dispose?.(); }
  actives.length = 0;
}

// ── ballista bolt: fast, flat dart ──
const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4).rotateX(Math.PI / 2);
const tipGeo = new THREE.ConeGeometry(0.04, 0.12, 4).rotateX(Math.PI / 2);
const shaftMat = M(0x8a6340);
const tipMat = M(0x9aa6b8, { metalness: 0.5, roughness: 0.4 });

export function launchBolt(from, to, onArrive) {
  const g = new THREE.Group();
  g.add(mesh(shaftGeo, shaftMat, 0, 0, 0, false));
  g.add(mesh(tipGeo, tipMat, 0, 0, 0.32, false));
  g.position.copy(from);
  g.lookAt(to);
  scene.add(g);
  const dist = from.distanceTo(to), speed = 26;
  let s = 0;
  actives.push({
    obj: g,
    tick(dt) {
      s += (speed * dt) / Math.max(dist, 0.001);
      if (s >= 1) { onArrive?.(); return false; }
      g.position.lerpVectors(from, to, s);
      return true;
    },
  });
}

// ── ballistic ball (cannonball / boulder): arcs to the target point ──
const ballGeo = new THREE.SphereGeometry(1, 10, 8);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const ballMat = M(0x2a2d33, { metalness: 0.55, roughness: 0.45 });
const rockMat = M(0x77706a);

export function launchBall(from, to, { boulder = false, onArrive } = {}) {
  const m = mesh(boulder ? rockGeo : ballGeo, boulder ? rockMat : ballMat, 0, 0, 0, false);
  m.castShadow = true;
  m.scale.setScalar(boulder ? 0.34 : 0.17);
  m.position.copy(from);
  scene.add(m);
  const dist = from.distanceTo(to);
  const speed = boulder ? 11 : 15;
  const arcH = boulder ? Math.max(2.2, dist * 0.34) : Math.max(0.8, dist * 0.16);
  const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
  let s = 0;
  actives.push({
    obj: m,
    tick(dt) {
      s += (speed * dt) / Math.max(dist, 0.001);
      if (s >= 1) { onArrive?.(); return false; }
      m.position.lerpVectors(from, to, s);
      m.position.y += 4 * arcH * s * (1 - s);
      m.rotateOnAxis(spin, dt * 7);
      return true;
    },
  });
  return dist / speed;   // flight time (for lead prediction upstream)
}

// flight-time estimates used to lead moving targets
export const flightTime = (from, to, boulder) => from.distanceTo(to) / (boulder ? 11 : 15);
export const boltTime = (from, to) => from.distanceTo(to) / 26;
