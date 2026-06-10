// Harvest pumpkins: glowing repair pickups that spawn inside the ring.

import * as THREE from 'three';
import { PICKUP } from './config.js';
import { rand } from './utils.js';
import { scene, obstacles, glowBasic, camera } from './world.js';
import { spawnFlash, spawnRing } from './particles.js';
import { AudioFX } from './audio.js';
import { state, aliveTanks } from './state.js';

const PUMPKIN = 0xffa030;
const bodyGeo = new THREE.SphereGeometry(0.62, 8, 6);
const stemGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.4, 5);
const bodyMat = glowBasic(PUMPKIN, 1.6);
const stemMat = new THREE.MeshBasicMaterial({ color: 0x4a6a20 });
const shellMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(PUMPKIN).multiplyScalar(1.1),
  transparent: true, opacity: 0.2,
  blending: THREE.AdditiveBlending, depthWrite: false });

let spawnTimer = 4;

function spawnPickup() {
  // find a clear spot inside the ring
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(4, Math.max(6, state.zoneR * 0.8));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.5)) continue;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.y = 0.78;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.62;
    const shell = new THREE.Mesh(bodyGeo, shellMat);
    shell.scale.setScalar(1.5);
    grp.add(body, stem, shell);
    grp.position.set(x, 1.3, z);
    scene.add(grp);
    state.pickups.push({ grp, pos: grp.position, life: PICKUP.lifetime,
      alive: true, phase: rand(0, Math.PI * 2) });
    return;
  }
}

function removePickup(pk) {
  pk.alive = false;
  scene.remove(pk.grp);
  const i = state.pickups.indexOf(pk);
  if (i >= 0) state.pickups.splice(i, 1);
}

export function clearPickups() {
  while (state.pickups.length) removePickup(state.pickups[0]);
  spawnTimer = 4;
}

export function updatePickups(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = PICKUP.interval;
    if (state.pickups.length < PICKUP.max) spawnPickup();
  }

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0 ||
        Math.hypot(pk.pos.x, pk.pos.z) > state.zoneR) {  // the murder ate it
      removePickup(pk);
      continue;
    }
    pk.grp.rotation.y += 1.8 * dt;
    pk.grp.position.y = 1.3 + Math.sin(state.time * 2.2 + pk.phase) * 0.25;

    for (const t of aliveTanks()) {
      if (t.hp >= 100 && !t.isPlayer) continue;  // AI at full hp ignores them
      const d = Math.hypot(t.pos.x - pk.pos.x, t.pos.z - pk.pos.z);
      if (d < PICKUP.radius + 1.2) {
        t.heal(PICKUP.heal);
        spawnFlash(pk.pos, 1.4, PUMPKIN);
        spawnRing(pk.pos, 3, PUMPKIN);
        if (t.isPlayer) AudioFX.pickup();
        else AudioFX.hit(0.15 / (1 + t.pos.distanceTo(camera.position) / 35));
        removePickup(pk);
        break;
      }
    }
  }
}
