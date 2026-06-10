// The player's flak tank: low-poly olive-drab tracked hull with a twin
// anti-air cannon. Movement is world-relative (WASD / joystick); the turret
// chases an aim point supplied by main.js each frame.

import * as THREE from 'three';
import { TANK, FIELD_R } from './config.js';
import { clamp, damp, angLerp } from './utils.js';
import { scene, obstacles, glowBasic } from './world.js';
import { input } from './input.js';
import { AudioFX } from './audio.js';
import { spawnShell } from './combat.js';
import { state } from './state.js';

export const player = {
  grp: null,
  hullG: null,
  turretG: null,
  barrelG: null,
  muzzles: [],
  flash: [],
  pos: null,
  vel: new THREE.Vector3(),
  yaw: 0,
  fireT: 0,
  recoil: 0,
  muzzleIdx: 0,
  alive: true,
};

export function initPlayer() {
  const grp = buildTankMesh();
  scene.add(grp.grp);
  Object.assign(player, grp);
  player.pos = grp.grp.position;
}

export function resetPlayer() {
  player.pos.set(0, 0, 0);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.fireT = 0;
  player.recoil = 0;
  player.alive = true;
  player.grp.visible = true;
  player.hullG.rotation.y = 0;
}

function buildTankMesh() {
  const grp = new THREE.Group();
  const hullG = new THREE.Group();
  grp.add(hullG);

  const olive = new THREE.MeshStandardMaterial({
    color: 0x4a5238, emissive: 0x141a0c, emissiveIntensity: 0.6,
    flatShading: true, roughness: 0.65, metalness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x23201c, flatShading: true, roughness: 0.8, metalness: 0.3 });
  const amberTrim = glowBasic(0xffb347, 1.5);

  // hull faces -z
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 3.6), olive);
  hull.position.y = 0.95;
  hull.castShadow = true;
  hullG.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.1), olive);
  glacis.position.set(0, 1.1, -1.95);
  glacis.rotation.x = 0.5;
  glacis.castShadow = true;
  hullG.add(glacis);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 2.4), olive);
  deck.position.y = 1.45;
  deck.castShadow = true;
  hullG.add(deck);

  // tracks
  [-1, 1].forEach((side) => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 4.0), steel);
    track.position.set(side * 1.35, 0.55, 0);
    track.castShadow = true;
    hullG.add(track);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 4.1), olive);
    guard.position.set(side * 1.35, 1.05, 0);
    hullG.add(guard);
    // headlight + tail light
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), amberTrim);
    head.position.set(side * 0.85, 1.18, -2.12);
    hullG.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), glowBasic(0xff3b30, 1.4));
    tail.position.set(side * 0.85, 1.1, 2.06);
    hullG.add(tail);
  });

  // headlight beam glow (helps the dusk mood)
  const lamp = new THREE.PointLight(0xffb347, 2.2, 9);
  lamp.position.set(0, 1.4, -2.4);
  hullG.add(lamp);

  // turret: yaw group on the deck, pitch group for the twin cannon
  const turretG = new THREE.Group();
  turretG.position.y = 1.85;
  hullG.add(turretG);

  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.4, 8), olive);
  turretBase.castShadow = true;
  turretG.add(turretBase);

  const turretHead = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.5), olive);
  turretHead.position.y = 0.45;
  turretHead.castShadow = true;
  turretG.add(turretHead);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.06), amberTrim);
  visor.position.set(0, 0.52, -0.76);
  turretG.add(visor);

  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.55, -0.4);
  turretG.add(barrelG);

  const railGeo = new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6);
  const tipGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const muzzles = [];
  const flash = [];
  [-0.24, 0.24].forEach((x) => {
    const rail = new THREE.Mesh(railGeo, steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0, -1.3);
    rail.castShadow = true;
    barrelG.add(rail);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.34), steel);
    brake.position.set(x, 0, -2.5);
    barrelG.add(brake);
    const tip = new THREE.Mesh(tipGeo, glowBasic(0xffd24d, 2.2));
    tip.position.set(x, 0, -2.62);
    tip.scale.setScalar(0.001);
    barrelG.add(tip);
    flash.push(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -2.66);
    barrelG.add(muzzle);
    muzzles.push(muzzle);
  });

  // antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), steel);
  antenna.position.set(0.55, 1.05, 0.55);
  turretG.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glowBasic(0xffb347, 1.8));
  beacon.position.set(0.55, 1.65, 0.55);
  turretG.add(beacon);

  return { grp, hullG, turretG, barrelG, muzzles, flash };
}

// ---------------------------------------------------------------------------
// Per-frame update. aimPoint is a world-space Vector3 the turret should
// track; wantFire fires when the cooldown allows. move is a Vector2 from the
// AI when auto-driving, otherwise input is read directly.
// ---------------------------------------------------------------------------

const tmpDir = new THREE.Vector3();

export function updatePlayer(dt, aimPoint, wantFire, moveOverride = null) {
  if (!player.alive) return;

  // --- movement ---
  let mx = 0, mz = 0;
  if (moveOverride) {
    mx = moveOverride.x; mz = moveOverride.y;
  } else {
    if (input.keys.KeyW || input.keys.ArrowUp) mz -= 1;
    if (input.keys.KeyS || input.keys.ArrowDown) mz += 1;
    if (input.keys.KeyA || input.keys.ArrowLeft) mx -= 1;
    if (input.keys.KeyD || input.keys.ArrowRight) mx += 1;
    if (input.joyActive) { mx = input.joy.x; mz = input.joy.y; }
  }
  const mLen = Math.hypot(mx, mz);
  if (mLen > 1) { mx /= mLen; mz /= mLen; }

  player.vel.x += mx * TANK.accel * dt;
  player.vel.z += mz * TANK.accel * dt;
  const drag = 1 - Math.min(TANK.damp * dt, 0.95);
  player.vel.x *= drag;
  player.vel.z *= drag;
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > TANK.maxSpeed) {
    player.vel.x *= TANK.maxSpeed / sp;
    player.vel.z *= TANK.maxSpeed / sp;
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  // fence + obstacle collisions (circles on the ground plane)
  const rMax = FIELD_R - 2.2;
  const d = Math.hypot(player.pos.x, player.pos.z);
  if (d > rMax) {
    player.pos.x *= rMax / d;
    player.pos.z *= rMax / d;
  }
  for (const o of obstacles) {
    const dx = player.pos.x - o.x, dz = player.pos.z - o.z;
    const dist = Math.hypot(dx, dz);
    const minD = o.r + TANK.radius;
    if (dist < minD && dist > 0.001) {
      player.pos.x = o.x + (dx / dist) * minD;
      player.pos.z = o.z + (dz / dist) * minD;
    }
  }

  // hull turns toward travel direction; slight accel lean
  if (sp > 1.2) {
    const targetYaw = Math.atan2(-player.vel.x, -player.vel.z);
    player.hullG.rotation.y = angLerp(player.hullG.rotation.y, targetYaw, damp(TANK.turnRate, dt));
  }
  player.hullG.rotation.x = clamp(player.vel.z * 0.012, -0.07, 0.07);
  player.hullG.rotation.z = clamp(-player.vel.x * 0.012, -0.07, 0.07);

  // --- turret aim (world-space yaw + barrel pitch) ---
  tmpDir.copy(aimPoint).sub(player.pos);
  tmpDir.y -= 2.4;  // approx barrel height
  const flat = Math.hypot(tmpDir.x, tmpDir.z);
  const wantYawWorld = Math.atan2(-tmpDir.x, -tmpDir.z);
  const wantPitch = clamp(Math.atan2(tmpDir.y, flat), -0.08, 1.25);
  const turretYaw = wantYawWorld - player.hullG.rotation.y;
  player.turretG.rotation.y = angLerp(player.turretG.rotation.y, turretYaw, damp(14, dt));
  player.barrelG.rotation.x = angLerp(player.barrelG.rotation.x, wantPitch, damp(14, dt));

  // --- firing ---
  player.fireT -= dt;
  if (wantFire && player.fireT <= 0) {
    player.fireT = TANK.fireCd;
    fireOnce();
  }

  // recoil + muzzle flash decay
  player.recoil = Math.max(0, player.recoil - dt * 8);
  player.barrelG.position.z = -0.4 + player.recoil * 0.22;
  for (const f of player.flash) {
    f.scale.multiplyScalar(1 - Math.min(dt * 18, 0.9));
  }
}

const muzzlePos = new THREE.Vector3();
const muzzleDir = new THREE.Vector3();

function fireOnce() {
  player.muzzleIdx = (player.muzzleIdx + 1) % player.muzzles.length;
  const muzzle = player.muzzles[player.muzzleIdx];
  muzzle.getWorldPosition(muzzlePos);
  muzzle.getWorldDirection(muzzleDir);
  muzzleDir.negate();   // Object3D forward is +z; barrel points -z
  spawnShell(muzzlePos, muzzleDir);
  player.flash[player.muzzleIdx].scale.setScalar(1);
  player.recoil = 1;
  state.shake = Math.min(state.shake + 0.015, 0.08);
  AudioFX.shot();
}
