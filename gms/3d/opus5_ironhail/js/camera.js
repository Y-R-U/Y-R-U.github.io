// Camera rig. Four modes share one smoothing pass: chase (over the hull,
// swinging with the turret), scope (down the barrel), drone (the outside angle
// that makes the drone worth having) and the shell-riding kill cam.

import * as THREE from 'three';
import { CAM } from './config.js';
import { clamp, lerp, damp, rand, angLerp } from './utils.js';
import { camera } from './render.js';
import { terrainHeight } from './terrain.js';
import { state } from './state.js';

const goal = new THREE.Vector3();
const look = new THREE.Vector3();
const _v = new THREE.Vector3();
let camYaw = 0;
let fov = CAM.baseFov;
let orbitA = 0;

export function setCamMode(mode) {
  if (state.camMode === mode) return;
  state.camMode = mode;
  state.hudDirty = true;
}

export function cycleCamMode() {
  const order = ['chase', 'scope', 'drone'];
  const i = order.indexOf(state.camMode);
  let next = order[(i + 1) % order.length];
  if (next === 'drone' && (!state.drone || !state.drone.alive)) next = 'chase';
  setCamMode(next);
}

export function resetCamera(tank) {
  if (!tank) return;
  camYaw = tank.yaw;
  const d = CAM.chaseDist * state.zoom;
  goal.set(
    tank.pos.x + Math.sin(camYaw) * d,
    tank.pos.y + CAM.chaseHeight * (0.7 + state.zoom * 0.4),
    tank.pos.z + Math.cos(camYaw) * d);
  camera.position.copy(goal);
  look.copy(tank.pos);
  camera.lookAt(look);
}

export function updateCamera(dt, rawDt) {
  const p = state.player;

  if (state.killcam && state.killcam.bolt && state.killcam.bolt.active) {
    updateKillCam(rawDt);
    return;
  }
  if (!p || (!p.alive && !state.spectateTank)) {
    orbitCamera(rawDt);
    return;
  }

  const focus = p.alive ? p : (state.spectateTank || p);

  if (state.camMode === 'drone' && state.drone && state.drone.alive) {
    droneCam(focus, dt);
  } else if (state.camMode === 'scope') {
    scopeCam(focus, dt);
  } else {
    chaseCam(focus, dt);
  }

  applyShake(rawDt);
  camera.lookAt(look);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = lerp(camera.fov, fov, damp(9, rawDt));
    camera.updateProjectionMatrix();
  }
}

function chaseCam(t, dt) {
  fov = CAM.baseFov;
  // the view swings behind the turret, so where you aim is where you look
  camYaw = angLerp(camYaw, t.turretYaw, damp(4.2, dt));
  const zoom = state.zoom;
  const dist = CAM.chaseDist * zoom;
  const height = CAM.chaseHeight * (0.62 + zoom * 0.42);
  goal.set(
    t.pos.x + Math.sin(camYaw) * dist,
    t.pos.y + height,
    t.pos.z + Math.cos(camYaw) * dist);

  // never clip into a hill
  const gh = terrainHeight(goal.x, goal.z) + 3.4;
  if (goal.y < gh) goal.y = gh;

  camera.position.lerp(goal, damp(6.5, dt));
  look.set(
    t.pos.x - Math.sin(camYaw) * CAM.chaseLook,
    t.pos.y + 2.6 + zoom * 1.2,
    t.pos.z - Math.cos(camYaw) * CAM.chaseLook);
}

function scopeCam(t, dt) {
  fov = CAM.scopeFov / clamp(state.zoom, 0.7, 1.6);
  const yaw = t.turretYaw;
  // sight sits above and just ahead of the mantlet, looking at the aim point
  // rather than up the barrel — gun elevation is the gun's business
  t.turretG.getWorldPosition(_v);
  goal.set(
    _v.x - Math.sin(yaw) * 2.2,
    _v.y + 1.5,
    _v.z - Math.cos(yaw) * 2.2);
  camera.position.lerp(goal, damp(14, dt));
  const a = state.aimGround;
  look.set(a.x, a.y + 0.8, a.z);
}

function droneCam(t, dt) {
  const d = state.drone;
  fov = 58;
  const back = 7 + state.zoom * 6;
  const yaw = d.scouting ? Math.atan2(-d.vel.x, -d.vel.z) : d.grp.rotation.y;
  goal.set(
    d.pos.x + Math.sin(yaw) * back,
    d.pos.y + 4.5 + state.zoom * 2,
    d.pos.z + Math.cos(yaw) * back);
  const gh = terrainHeight(goal.x, goal.z) + 2.5;
  if (goal.y < gh) goal.y = gh;
  camera.position.lerp(goal, damp(5, dt));
  // look at the ground ahead of the drone
  look.set(
    d.pos.x - Math.sin(yaw) * 16,
    terrainHeight(d.pos.x - Math.sin(yaw) * 16, d.pos.z - Math.cos(yaw) * 16) + 1,
    d.pos.z - Math.cos(yaw) * 16);
}

function updateKillCam(rawDt) {
  const kc = state.killcam;
  const b = kc.bolt;
  kc.t += rawDt;
  fov = 46;
  _v.copy(b.vel).normalize();
  goal.set(
    b.mesh.position.x - _v.x * 9 + kc.side * 3.2,
    b.mesh.position.y - _v.y * 4 + 2.6,
    b.mesh.position.z - _v.z * 9 + kc.side * 1.6);
  const gh = terrainHeight(goal.x, goal.z) + 1.6;
  if (goal.y < gh) goal.y = gh;
  camera.position.lerp(goal, damp(11, rawDt));
  look.copy(b.mesh.position);
  camera.lookAt(look);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = lerp(camera.fov, fov, damp(8, rawDt));
    camera.updateProjectionMatrix();
  }
}

// Slow orbit for menus and attract mode.
export function orbitCamera(dt, radius = 74, height = 30) {
  orbitA += dt * 0.055;
  fov = CAM.baseFov;
  goal.set(Math.sin(orbitA) * radius, height + Math.sin(orbitA * 1.7) * 6, Math.cos(orbitA) * radius);
  const gh = terrainHeight(goal.x, goal.z) + 8;
  if (goal.y < gh) goal.y = gh;
  camera.position.lerp(goal, damp(1.4, dt));
  look.set(0, 6, 0);
  camera.lookAt(look);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = lerp(camera.fov, fov, damp(6, dt));
    camera.updateProjectionMatrix();
  }
}

function applyShake(dt) {
  if (state.shake > 0.001) {
    camera.position.x += rand(-1, 1) * state.shake;
    camera.position.y += rand(-1, 1) * state.shake * 0.7;
    camera.position.z += rand(-1, 1) * state.shake;
    state.shake *= Math.pow(CAM.shakeDecay, dt);
  } else {
    state.shake = 0;
  }
}

export function adjustZoom(delta, maxZoom = CAM.zoomMax) {
  state.zoom = clamp(state.zoom + delta, CAM.zoomMin, maxZoom);
}

export function startKillCam(bolt) {
  state.killcam = { bolt, t: 0, side: Math.random() < 0.5 ? -1 : 1 };
}

export function endKillCam() {
  state.killcam = null;
  state.timeScale = 1;
}
