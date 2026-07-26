// The broadcast camera. Chase by default, but it follows the road's own up
// vector rather than world up — which is the only reason a loop reads as a
// loop instead of the picture turning upside down and staying there.

import * as THREE from 'three';
import { camera, setFov, baseFov } from './render.js';
import { CAM, DRIVE } from './config.js';
import { state } from './state.js';
import { profile } from './save.js';
import { clamp, clamp01, damp, lerp, rand } from './utils.js';

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const rig = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  fov: 68,
  ready: false,
  zoom: 1,
  orbit: 0,
};

export function resetCamera(car) {
  rig.ready = false;
  if (car) frameChase(car, 0, true);
}

// ---------------------------------------------------------------------------
export function updateCamera(dt) {
  const car = state.player;
  if (state.camMode === 'cine' || state.camMode === 'replay') return;   // owned elsewhere
  if (state.camMode === 'attract') { frameAttract(dt); return; }

  if (!car) return;
  if (car.mode === 'wreck' || car.respawnTimer > 0) frameWreck(car, dt);
  else frameChase(car, dt, false);

  applyShake(dt);
  camera.up.copy(rig.up);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  setFov(rig.fov);
}

function frameChase(car, dt, snap) {
  const tr = car.track;
  const f = car.frame.p ? car.frame : tr.frameAt(car.s);
  const speedFrac = clamp01(car.forwardSpeed / (DRIVE.topSpeed + car.stats.top));

  // Sit behind the car along the track, not behind its nose — a spinning car
  // should stay in shot rather than whipping the camera around with it.
  const back = CAM.dist * rig.zoom * (1 + speedFrac * 0.16);
  const up = CAM.height * rig.zoom + car.h * 0.6;

  // dir = +1 normally: sit BEHIND the car (-tan) and look AHEAD of it (+tan).
  // Getting this backwards puts the camera in front looking down the road you
  // have already driven, which reads as "I can only see where I've been".
  const dir = state.lookBack ? -1 : 1;
  _pos.copy(car.worldPos)
    .addScaledVector(f.tan, -back * dir)
    .addScaledVector(f.up, up)
    .addScaledVector(f.right, car.t * -0.16);

  _look.copy(car.worldPos)
    .addScaledVector(f.tan, CAM.look * dir)
    .addScaledVector(f.up, 1.2);

  // Blend the road's up with world up so gentle banking does not roll the
  // whole picture, but a loop still carries the camera over with it.
  _up.copy(f.up);
  if (f.up.y > 0.25) _up.lerp(UP_WORLD, 1 - CAM.bankLean).normalize();

  const rate = snap ? 1 : damp(CAM.lag, dt);
  const aimRate = snap ? 1 : damp(CAM.aimLag, dt);
  if (!rig.ready || snap) {
    rig.pos.copy(_pos); rig.look.copy(_look); rig.up.copy(_up);
    rig.ready = true;
  } else {
    rig.pos.lerp(_pos, rate);
    rig.look.lerp(_look, aimRate);
    rig.up.lerp(_up, damp(6, dt)).normalize();
  }

  const boostKick = car.boosting ? 10 : 0;
  rig.fov = lerp(rig.fov, baseFov() + speedFrac * 9 + boostKick, damp(4, dt || 0.016));
}

const UP_WORLD = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// The menu backdrop camera. Cuts between four shots on a timer, always pointed
// at whatever is happening near the front of the field, so a menu you leave
// open turns into a broadcast rather than a screensaver.
// ---------------------------------------------------------------------------
const attract = { t: 0, shot: 0, subject: 0, hold: 0 };

function frameAttract(dt) {
  const cars = state.cars;
  const tr = state.track;
  if (!cars.length || !tr) return;

  attract.t += dt;
  if (attract.t > attract.hold) {
    attract.t = 0;
    attract.hold = rand(4.2, 7.5);
    attract.shot = (attract.shot + 1 + Math.floor(Math.random() * 3)) % 4;
    // Prefer somebody in a fight: the tightest gap in the top half of the field.
    const front = state.order.filter((c) => c.alive && c.mode !== 'wreck').slice(0, Math.max(2, Math.ceil(cars.length / 2)));
    attract.subject = cars.indexOf(front[Math.floor(Math.random() * front.length)] || cars[0]);
    rig.ready = false;
  }

  const car = cars[clamp(attract.subject, 0, cars.length - 1)] || cars[0];
  if (!car) return;
  const f = car.frame.p ? car.frame : tr.frameAt(car.s);
  const w = tr.widthAt(car.s);

  if (attract.shot === 0) {                       // low chase, wide
    _pos.copy(car.worldPos).addScaledVector(f.tan, -11).addScaledVector(f.up, 2.4);
    _look.copy(car.worldPos).addScaledVector(f.tan, 10).addScaledVector(f.up, 1);
    rig.fov = baseFov() + 6;
  } else if (attract.shot === 1) {                // trackside pan
    const side = car.t >= 0 ? 1 : -1;
    tr.worldAt(car.s + 22, side * (w + 12), 4.5, _pos);
    _look.copy(car.worldPos);
    rig.fov = 40;
  } else if (attract.shot === 2) {                // helicopter
    tr.worldAt(car.s + 34, 0, 26, _pos);
    _look.copy(car.worldPos);
    rig.fov = 52;
  } else {                                        // wheel-height, looking back
    tr.worldAt(car.s + 30, car.t * 0.7, 0.8, _pos);
    _look.copy(car.worldPos);
    rig.fov = 36;
  }

  const rate = rig.ready ? damp(3.2, dt) : 1;
  if (!rig.ready) { rig.pos.copy(_pos); rig.look.copy(_look); rig.ready = true; }
  else { rig.pos.lerp(_pos, rate); rig.look.lerp(_look, damp(5, dt)); }
  rig.up.lerp(UP_WORLD, damp(4, dt)).normalize();

  camera.up.copy(rig.up);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  setFov(rig.fov);
}

function frameWreck(car, dt) {
  rig.orbit += dt * 0.75;
  const r = CAM.wreckDist;
  _pos.copy(car.worldPos).add(_v.set(Math.cos(rig.orbit) * r, CAM.wreckHeight, Math.sin(rig.orbit) * r));
  _look.copy(car.worldPos);
  rig.pos.lerp(_pos, damp(3.4, dt));
  rig.look.lerp(_look, damp(6, dt));
  rig.up.lerp(UP_WORLD, damp(4, dt)).normalize();
  rig.fov = lerp(rig.fov, baseFov() - 4, damp(3, dt));
}

function applyShake(dt) {
  if (state.shake <= 0) return;
  state.shake = Math.max(0, state.shake - CAM.shakeDecay * dt);
  if (!profile.settings.camShake) return;
  const k = state.shake * state.shake * 1.4;
  rig.pos.x += rand(-k, k);
  rig.pos.y += rand(-k, k) * 0.6;
  rig.pos.z += rand(-k, k);
}

// ---------------------------------------------------------------------------
// Cinematic helpers — used by cutscenes, the grid intro and the replay reel.
// ---------------------------------------------------------------------------
export function setCamera(pos, look, up) {
  camera.up.copy(up || UP_WORLD);
  camera.position.copy(pos);
  camera.lookAt(look);
  rig.pos.copy(pos);
  rig.look.copy(look);
  rig.ready = true;
}

// A slow dolly around a point, used for grid shots and cutscene beats.
export function orbitShot(target, radius, height, angle, fov) {
  _pos.set(
    target.x + Math.cos(angle) * radius,
    target.y + height,
    target.z + Math.sin(angle) * radius
  );
  setCamera(_pos, target, UP_WORLD);
  if (fov) setFov(fov);
}

// Track-relative shot: `along` metres up the road from s, `across` metres
// sideways, `above` metres up. Used for cutscenes that need to frame a corner.
export function trackShot(track, s, across, above, lookAhead = 30, fov = 46) {
  const p = track.worldAt(s, across, above, _v);
  const l = track.worldAt(s + lookAhead, 0, 1.2, _v2);
  setCamera(p, l, UP_WORLD);
  setFov(fov);
}

export function cameraZoom(z) { rig.zoom = clamp(z, 0.6, 2.2); }
export function getRig() { return rig; }
