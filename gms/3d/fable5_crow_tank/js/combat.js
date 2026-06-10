// Flak shells: glowing tracers with segment-vs-sphere hit checks against
// every living crow.

import * as THREE from 'three';
import { TANK } from './config.js';
import { rand, segHitsSphere } from './utils.js';
import { scene, glowBasic } from './world.js';
import { crows, damageCrow } from './crows.js';
import { dustPuff } from './particles.js';

const shells = [];
const freeMeshes = [];

const shellGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5);
shellGeo.rotateX(Math.PI / 2);   // align length with +z so lookAt orients it
const shellMat = glowBasic(0xffc24d, 2.4);

const tmpPrev = new THREE.Vector3();
const tmpAim = new THREE.Vector3();

export function spawnShell(pos, dir) {
  const mesh = freeMeshes.pop() || new THREE.Mesh(shellGeo, shellMat);
  mesh.position.copy(pos);
  mesh.visible = true;
  if (!mesh.parent) scene.add(mesh);

  // tiny spread keeps long bursts from feeling laser-perfect
  tmpAim.copy(dir).normalize();
  tmpAim.x += rand(-0.012, 0.012);
  tmpAim.y += rand(-0.012, 0.012);
  tmpAim.z += rand(-0.012, 0.012);
  tmpAim.normalize();

  const vel = new THREE.Vector3().copy(tmpAim).multiplyScalar(TANK.shellSpeed);
  mesh.lookAt(tmpPrev.copy(pos).add(tmpAim));
  shells.push({ mesh, vel, life: TANK.shellLife });
}

export function updateCombat(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.life -= dt;
    tmpPrev.copy(s.mesh.position);
    s.mesh.position.addScaledVector(s.vel, dt);

    let dead = s.life <= 0;

    if (!dead && s.mesh.position.y <= 0) {
      dustPuff(new THREE.Vector3(s.mesh.position.x, 0.15, s.mesh.position.z), 0.5);
      dead = true;
    }

    if (!dead) {
      for (const c of crows) {
        if (!c.alive) continue;
        if (segHitsSphere(tmpPrev, s.mesh.position, c.pos, c.hitR + TANK.hitR)) {
          damageCrow(c, 1, s.mesh.position.clone());
          dead = true;
          break;
        }
      }
    }

    if (dead) {
      s.mesh.visible = false;
      freeMeshes.push(s.mesh);
      shells.splice(i, 1);
    }
  }
}

export function clearShells() {
  for (const s of shells) {
    s.mesh.visible = false;
    freeMeshes.push(s.mesh);
  }
  shells.length = 0;
}
