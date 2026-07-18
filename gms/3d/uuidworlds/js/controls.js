// controls.js — one finger looks, two fingers move, tap a car to drive it.
// Desktop: mouse-drag look, WASD/QE move, wheel dolly.

import * as THREE from 'three';
import { WORLD_R } from './world.js';

export class FreeFly {
  constructor(dom, camera) {
    this.dom = dom;
    this.cam = camera;
    this.enabled = false;
    this.lookOnly = false;   // room mode: look around, feet stay put
    this.baseYaw = 0; this.basePitch = 0;
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.moveIn = new THREE.Vector3();  // accumulated touch move input
    this.keys = new Set();
    this.onTap = null;
    this.getGroundH = () => 0;
    this.pointers = new Map();
    this.pinchDist = 0;

    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e));
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.moveIn.z -= Math.sign(e.deltaY) * 14;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = e.x;
    this.vel.set(0, 0, 0);
    this.moveIn.set(0, 0, 0);
  }

  _down(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!this.enabled) return;
    if (this.pointers.size === 1) {
      // look
      this.yaw -= dx * 0.0042;
      this.pitch -= dy * 0.0042;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    } else if (this.pointers.size === 2 && !this.lookOnly) {
      // move: avg drag = fwd/strafe, pinch = climb
      this.moveIn.x += dx * 0.05;
      this.moveIn.z += dy * 0.09;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.moveIn.y += (d - this.pinchDist) * 0.06;
      this.pinchDist = d;
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    const dt = performance.now() - p.t;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (dt < 320 && moved < 12 && this.onTap) {
      const r = this.dom.getBoundingClientRect();
      this.onTap(new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ), e);
    }
  }

  update(dt) {
    if (!this.enabled) return;
    if (this.lookOnly) {
      this.cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      return;
    }
    const sp = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 66 : 26;
    const acc = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) acc.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) acc.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) acc.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) acc.x += 1;
    if (this.keys.has('KeyQ')) acc.y -= 1;
    if (this.keys.has('KeyE') || this.keys.has('Space')) acc.y += 1;
    // touch move input decays into velocity
    acc.x += this.moveIn.x * 0.55;
    acc.z -= this.moveIn.z * 0.55;
    acc.y += this.moveIn.y * 0.55;
    this.moveIn.multiplyScalar(Math.max(0, 1 - dt * 6));

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const world = acc.applyQuaternion(q);
    this.vel.lerp(world.multiplyScalar(sp), Math.min(1, dt * 5));
    this.cam.position.addScaledVector(this.vel, dt);

    // bounds
    const p = this.cam.position;
    const rr = Math.hypot(p.x, p.z);
    if (rr > WORLD_R) { p.x *= WORLD_R / rr; p.z *= WORLD_R / rr; }
    const gh = this.getGroundH(p.x, p.z) + 1.6;
    if (p.y < gh) p.y = gh;
    if (p.y > 500) p.y = 500;

    this.cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}

// ── arcade car ───────────────────────────────────────────────────────────────
export class DriveController {
  constructor(camera, joy) {
    this.cam = camera;
    this.joy = joy;          // {x: -1..1 steer, y: -1..1 throttle} from ui
    this.keys = new Set();
    this.vehicle = null;
    this.world = null;
    this.speed = 0;
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  enter(world, vehicle) {
    this.world = world;
    this.vehicle = vehicle;
    vehicle.driven = true;
    this.speed = 0;
  }

  exit() {
    if (this.vehicle) {
      this.vehicle.driven = false;
      this.vehicle.parked = true; // it stays where you left it
    }
    const v = this.vehicle;
    this.vehicle = null;
    return v;
  }

  update(dt) {
    const v = this.vehicle;
    if (!v) return;
    let throttle = this.joy.y, steer = this.joy.x;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) throttle = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) throttle = -1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer = 1;

    const MAX = 30;
    this.speed += throttle * 26 * dt;
    this.speed -= this.speed * 1.1 * dt;                       // drag
    this.speed = Math.max(-10, Math.min(MAX, this.speed));
    if (Math.abs(this.speed) > 0.5) {
      v.yaw -= steer * 2.1 * dt * Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed);
    }
    let nx = v.x + Math.sin(v.yaw) * this.speed * dt;
    let nz = v.z + Math.cos(v.yaw) * this.speed * dt;

    // building collisions: circle pushout
    for (const c of this.world.colliders) {
      const dx = nx - c.x, dz = nz - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + 1.4 && d > 0.001) {
        const push = (c.r + 1.4 - d);
        nx += (dx / d) * push; nz += (dz / d) * push;
        this.speed *= 0.6;
      }
    }
    // stay out of deep water and inside the world
    const h = this.world.terrainH(nx, nz);
    if (this.world.hasWater && h < this.world.waterY + 0.3) {
      this.speed *= 0.4;
    } else {
      v.x = nx; v.z = nz;
    }
    const rr = Math.hypot(v.x, v.z);
    if (rr > WORLD_R - 10) { v.x *= (WORLD_R - 10) / rr; v.z *= (WORLD_R - 10) / rr; this.speed *= 0.5; }

    v.groundY = Math.max(this.world.plateauY, this.world.terrainH(v.x, v.z));
    v.bounce = v.groundY - this.world.plateauY;

    // chase cam
    const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const target = new THREE.Vector3(v.x, v.groundY, v.z);
    const camPos = target.clone().addScaledVector(fwd, -9.5).add(new THREE.Vector3(0, 4.6, 0));
    const gh = this.world.terrainH(camPos.x, camPos.z) + 1.2;
    if (camPos.y < gh) camPos.y = gh;
    this.cam.position.lerp(camPos, Math.min(1, dt * 4.5));
    const lookP = target.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1.6, 0));
    this.cam.lookAt(lookP);
  }
}
