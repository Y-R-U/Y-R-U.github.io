// Player controller: same interface as AIController — writes moveInput,
// aimPoint and wantFire on its tank.
//
// Touch: auto-aim locks the nearest enemy you can actually see (cover blocks
// the lock), a tap on a tank switches the lock to it, and the optional
// auto-fire setting shoots whenever a visible lock is lined up.

import * as THREE from 'three';
import { IS_TOUCH } from './config.js';
import { input } from './input.js';
import { camera, scene } from './world.js';
import { state, aliveTanks } from './state.js';
import { leadAim } from './utils.js';
import { losClear } from './combat.js';
import { callout } from './ui.js';

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0); // y = 1
const _v = new THREE.Vector3();

export const aim = {
  target: null,      // current lock (or aim-assist pick on desktop)
  visible: false,    // line of sight to it is clear
  manual: false,     // chosen by tapping
  autoFire: false,   // setting, mirrored from settings by main.js
};

const AUTO_RANGE = 55;

function pickByTap(me, tx, ty) {
  let best = null, bd = 70 * 70;
  for (const t of aliveTanks()) {
    if (t === me) continue;
    _v.copy(t.pos);
    _v.y += 1.5;
    _v.project(camera);
    if (_v.z > 1) continue;
    const sx = (_v.x * 0.5 + 0.5) * innerWidth;
    const sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    const d = (sx - tx) ** 2 + (sy - ty) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export class PlayerController {
  constructor(tank) {
    this.tank = tank;
    this.blockedT = 0;
    aim.target = null;
    aim.manual = false;
    input.taps.length = 0;
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

    if (IS_TOUCH) this.touchAim(dt);
    else this.mouseAim();

    let fire = input.firing || input.touchFiring;
    if (!fire && aim.autoFire && aim.target && aim.visible) {
      const wantYaw = Math.atan2(-(me.aimPoint.x - me.pos.x), -(me.aimPoint.z - me.pos.z));
      let diff = wantYaw - me.turretYaw;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      fire = Math.abs(diff) < 0.12 && aim.target.pos.distanceTo(me.pos) < 45;
    }
    me.wantFire = fire;
  }

  touchAim(dt) {
    const me = this.tank;

    while (input.taps.length) {
      const tap = input.taps.shift();
      const t = pickByTap(me, tap.x, tap.y);
      if (t) {
        if (t !== aim.target || !aim.manual) callout('TARGET ' + t.name, t.accentCss, 'lock');
        aim.target = t;
        aim.manual = true;
        this.blockedT = 0;
      } else if (aim.manual) {
        aim.manual = false;   // tap on empty ground: back to auto-aim
      }
    }

    let t = aim.target;
    if (aim.manual) {
      // a manual lock holds until the tank dies, leaves range, or stays hidden
      const ok = t && t.alive && t.pos.distanceTo(me.pos) < AUTO_RANGE + 10;
      if (ok && !losClear(me.pos, t.pos)) this.blockedT += dt; else this.blockedT = 0;
      if (!ok || this.blockedT > 2.5) aim.manual = false;
    }
    if (!aim.manual) {
      // nearest enemy in sight; a new pick must be clearly closer (no flicker)
      let best = null, bd = AUTO_RANGE * AUTO_RANGE, fallback = null, fd = Infinity;
      for (const e of aliveTanks()) {
        if (e === me) continue;
        let d = e.pos.distanceToSquared(me.pos);
        if (d < fd) { fd = d; fallback = e; }
        if (e === t) d *= 0.7;
        if (d < bd && losClear(me.pos, e.pos)) { bd = d; best = e; }
      }
      t = best || fallback;
      aim.target = t;
    }

    aim.visible = !!(t && losClear(me.pos, t.pos));
    if (t) leadAim(me.aimPoint, me.pos, t);
  }

  mouseAim() {
    const me = this.tank;
    raycaster.setFromCamera(input.mouse, camera);
    // aim assist: snap to an enemy near the crosshair ray
    let best = null, bd = Infinity;
    for (const t of aliveTanks()) {
      if (t === me) continue;
      _v.copy(t.pos);
      _v.y = 1.0;
      if (raycaster.ray.distanceToPoint(_v) < 2.6) {
        const d = t.pos.distanceToSquared(me.pos);
        if (d < bd) { bd = d; best = t; }
      }
    }
    aim.target = best;
    aim.visible = !!(best && losClear(me.pos, best.pos));
    if (best) leadAim(me.aimPoint, me.pos, best);
    else if (raycaster.ray.intersectPlane(aimPlane, _v)) me.aimPoint.copy(_v);
  }
}

// ---------------------------------------------------------------------------
// Lock ring: a pulsing ground reticle under the current target
// ---------------------------------------------------------------------------

let ring = null;

export function updateLockRing() {
  if (!ring) {
    ring = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffc24d).multiplyScalar(1.8), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const outer = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.85, 40), mat);
    outer.rotation.x = -Math.PI / 2;
    ring.add(outer);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.9), mat);
      const a = i * Math.PI / 2;
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = a;
      tick.position.set(Math.sin(a) * 3.35, 0, Math.cos(a) * 3.35);
      ring.add(tick);
    }
    ring.userData.mat = mat;
    ring.position.y = 0.12;
    scene.add(ring);
  }
  const p = state.player;
  const t = aim.target;
  const show = !!(p && p.alive && p.controller instanceof PlayerController &&
    state.phase === 'playing' && t && t.alive);
  ring.visible = show;
  if (!show) return;
  ring.position.x = t.pos.x;
  ring.position.z = t.pos.z;
  ring.rotation.y = state.time * 1.4;
  const pulse = 1 + Math.sin(state.time * 7) * 0.05;
  ring.scale.setScalar(aim.visible ? pulse : 1.15);
  ring.userData.mat.opacity = aim.visible ? 0.9 : 0.3;
  ring.userData.mat.color.setHex(aim.manual ? 0xff2d8f : 0xffc24d).multiplyScalar(1.8);
}
