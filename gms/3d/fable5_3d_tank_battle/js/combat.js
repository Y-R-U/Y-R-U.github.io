// Bolts: pooled, accent-colored, owned. Handles firing (reads each tank's
// wantFire), flight, and collisions vs tanks and obstacles.

import * as THREE from 'three';
import { TANK } from './config.js';
import { rand } from './utils.js';
import { scene, obstacles, camera } from './world.js';
import { spawnFlash, spawnRing, spawnDebris } from './particles.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';

const POOL_SIZE = 70;
const bolts = [];
const boltMats = new Map();   // accent hex -> shared material
const _tmpV = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function initCombat() {
  const geo = new THREE.BoxGeometry(0.14, 0.14, 1.7);
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.visible = false;
    scene.add(mesh);
    bolts.push({ mesh, vel: new THREE.Vector3(), life: 0, active: false, owner: null });
  }
}

function matFor(accent) {
  if (!boltMats.has(accent)) {
    boltMats.set(accent, new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(2.2) }));
  }
  return boltMats.get(accent);
}

function fireFrom(tank) {
  const b = bolts.find((x) => !x.active);
  if (!b) return;
  tank.barrelSide = 1 - tank.barrelSide;
  const muzzle = tank.muzzles[tank.barrelSide];
  muzzle.getWorldPosition(_tmpV);
  _dir.copy(tank.aimPoint).sub(_tmpV).normalize();

  // base spread on top of whatever error the controller already applied
  const a = rand(-TANK.spread, TANK.spread);
  const cos = Math.cos(a), sin = Math.sin(a);
  const x = _dir.x * cos - _dir.z * sin;
  const z = _dir.x * sin + _dir.z * cos;
  _dir.x = x; _dir.z = z;

  b.active = true;
  b.owner = tank;
  b.mesh.visible = true;
  b.mesh.material = matFor(tank.accent);
  b.mesh.position.copy(_tmpV);
  b.vel.copy(_dir).multiplyScalar(TANK.boltSpeed);
  b.mesh.lookAt(_tmpV.add(_dir));
  b.life = TANK.boltLife;

  const tip = tank.muzzleFlash[tank.barrelSide];
  tip.scale.setScalar(1);
  AudioFX.pew(1 / (1 + tank.pos.distanceTo(camera.position) / 35) * 1.5);
}

function killBolt(b) {
  b.active = false;
  b.owner = null;
  b.mesh.visible = false;
}

export function clearBolts() {
  for (const b of bolts) killBolt(b);
}

export function updateCombat(dt) {
  // firing
  for (const t of state.tanks) {
    if (!t.alive || !t.wantFire || t.fireTimer > 0) continue;
    t.fireTimer = TANK.fireCd * rand(0.92, 1.08);
    fireFrom(t);
  }

  // flight + collisions
  for (const b of bolts) {
    if (!b.active) continue;
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    const p = b.mesh.position;

    if (b.life <= 0 || p.y < 0) {
      killBolt(b);
      continue;
    }

    // obstacles (all are taller than bolt height)
    let hit = false;
    for (const o of obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      if (dx * dx + dz * dz < o.r * o.r) {
        spawnFlash(p, 0.8, 0x9a4dff);
        spawnRing(p, 1.4, 0x9a4dff);
        killBolt(b);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // tanks
    for (const t of state.tanks) {
      if (!t.alive || t === b.owner) continue;
      _tmpV.copy(t.pos);
      _tmpV.y += 1.0;
      const rr = TANK.radius + 0.35;
      if (p.distanceToSquared(_tmpV) < rr * rr) {
        const owner = b.owner;   // killBolt clears it — capture for kill credit
        spawnFlash(p, 1.0, owner ? owner.accent : 0xffffff);
        spawnDebris(p, 3, 0.6);
        AudioFX.hit(1 / (1 + t.pos.distanceTo(camera.position) / 35));
        killBolt(b);
        t.damage(TANK.boltDmg * rand(0.9, 1.1), owner);
        break;
      }
    }
  }
}
