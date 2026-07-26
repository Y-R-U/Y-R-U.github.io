// Camera rig. Four modes share one smoothing pass: chase (over the hull,
// swinging with the turret), scope (down the barrel), drone (the outside angle
// that makes the drone worth having) and the shell-riding kill cam.

import * as THREE from 'three';
import { CAM } from './config.js';
import { clamp, lerp, damp, rand, angLerp } from './utils.js';
import { camera } from './render.js';
import { terrainHeight } from './terrain.js';
import { updateCine } from './cine.js';
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

  // a cutscene owns the camera outright — no chase smoothing underneath it
  if (state.cine) {
    updateCine(rawDt);
    return;
  }
  if (state.killcam) {
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
  if (b.active) {
    // riding the shell in
    _v.copy(b.vel).normalize();
    kc.impact.copy(b.mesh.position);
    goal.set(
      b.mesh.position.x - _v.x * 9 + kc.side * 3.2,
      b.mesh.position.y - _v.y * 4 + 2.6,
      b.mesh.position.z - _v.z * 9 + kc.side * 1.6);
  } else {
    // the shell has landed — hold on the impact for a beat so the kill lands,
    // easing in a touch so the hold reads as a shot, not a frozen frame
    goal.set(
      kc.impact.x - _v.x * 7.2 + kc.side * 3.6,
      kc.impact.y + 3.4,
      kc.impact.z - _v.z * 7.2 + kc.side * 1.8);
    look.lerp(kc.impact, damp(6, rawDt));
  }
  const gh = terrainHeight(goal.x, goal.z) + 1.6;
  if (goal.y < gh) goal.y = gh;
  camera.position.lerp(goal, damp(b.active ? 11 : 3.4, rawDt));
  if (b.active) look.copy(b.mesh.position);
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

// `homeYaw` is the bearing the gun fired on. Keeping it is the whole point:
// see endKillCam().
export function startKillCam(bolt, homeYaw = null) {
  state.killcam = {
    bolt, t: 0, hold: null,
    side: Math.random() < 0.5 ? -1 : 1,
    homeYaw: homeYaw != null ? homeYaw : camYaw,
    impact: new THREE.Vector3().copy(bolt.mesh.position),
  };
}

// Put the rig back down the line the shot went. resetCamera() cannot do this
// job — it frames the *hull*, and the hull is not where you were looking. Come
// out of a shell cam on hull yaw after a traverse and the view is suddenly
// pointing off to one side of the target you just shot at, which is exactly
// the moment you need to see.
export function endKillCam() {
  const kc = state.killcam;
  state.killcam = null;
  state.timeScale = 1;
  const t = state.player;
  if (!kc || !t || !t.alive) return;
  camYaw = kc.homeYaw;
  fov = CAM.baseFov;
  const zoom = state.zoom;
  const dist = CAM.chaseDist * zoom;
  goal.set(
    t.pos.x + Math.sin(camYaw) * dist,
    t.pos.y + CAM.chaseHeight * (0.62 + zoom * 0.42),
    t.pos.z + Math.cos(camYaw) * dist);
  const gh = terrainHeight(goal.x, goal.z) + 3.4;
  if (goal.y < gh) goal.y = gh;
  camera.position.copy(goal);
  look.set(
    t.pos.x - Math.sin(camYaw) * CAM.chaseLook,
    t.pos.y + 2.6 + zoom * 1.2,
    t.pos.z - Math.cos(camYaw) * CAM.chaseLook);
  camera.lookAt(look);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// The bearing the shell cam will hand back — the player controller freezes the
// turret against it so nothing wanders off mid-flight.
export function killCamYaw() {
  return state.killcam ? state.killcam.homeYaw : null;
}
