// Player controller: same interface as AIController — writes moveInput,
// aimPoint and wantFire on its tank.

import * as THREE from 'three';
import { TANK, IS_TOUCH } from './config.js';
import { input } from './input.js';
import { camera } from './world.js';
import { aliveTanks } from './state.js';

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0); // y = 1
const _v = new THREE.Vector3();

export class PlayerController {
  constructor(tank) {
    this.tank = tank;
  }

  update(dt) {
    const me = this.tank;

    // movement
    let mx = 0, mz = 0;
    if (input.keys['KeyW'] || input.keys['ArrowUp']) mz -= 1;
    if (input.keys['KeyS'] || input.keys['ArrowDown']) mz += 1;
    if (input.keys['KeyA'] || input.keys['ArrowLeft']) mx -= 1;
    if (input.keys['KeyD'] || input.keys['ArrowRight']) mx += 1;
    if (input.joyActive) { mx = input.joy.x; mz = input.joy.y; }
    me.moveInput.x = mx;
    me.moveInput.z = mz;

    // aiming
    const enemies = aliveTanks().filter((t) => t !== me);
    if (IS_TOUCH) {
      // auto-aim the nearest enemy
      let best = null, bd = Infinity;
      for (const t of enemies) {
        const d = t.pos.distanceToSquared(me.pos);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) {
        const lead = best.pos.distanceTo(me.pos) / TANK.boltSpeed * 0.85;
        me.aimPoint.set(
          best.pos.x + best.vel.x * lead, 1.0, best.pos.z + best.vel.z * lead);
      }
    } else {
      raycaster.setFromCamera(input.mouse, camera);
      // aim assist: snap to an enemy near the crosshair ray
      let best = null, bd = Infinity;
      for (const t of enemies) {
        _v.copy(t.pos);
        _v.y = 1.0;
        const rayDist = raycaster.ray.distanceToPoint(_v);
        if (rayDist < 2.6) {
          const d = t.pos.distanceToSquared(me.pos);
          if (d < bd) { bd = d; best = t; }
        }
      }
      if (best) {
        const lead = best.pos.distanceTo(me.pos) / TANK.boltSpeed * 0.85;
        me.aimPoint.set(
          best.pos.x + best.vel.x * lead, 1.0, best.pos.z + best.vel.z * lead);
      } else if (raycaster.ray.intersectPlane(aimPlane, _v)) {
        me.aimPoint.copy(_v);
      }
    }

    me.wantFire = input.firing || input.touchFiring;
  }
}
