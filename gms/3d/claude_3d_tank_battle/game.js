// Tank Battle Royale — main entry. Wires modules and runs the loop.

import * as THREE from 'three';
import { CFG } from './src/config.js';
import { createSceneStack } from './src/scene.js';
import { buildWorld, updateClouds } from './src/world.js';
import { createInput, isTouch } from './src/input.js';
import { ParticleSystem } from './src/particles.js';
import { BulletSystem } from './src/bullets.js';
import { NameTagSystem } from './src/nameTag.js';
import { Battle } from './src/battle.js';
import { UI } from './src/ui.js';
import { Minimap } from './src/minimap.js';
import * as audio from './src/audio.js';

const container = document.getElementById('game-container');
const { renderer, scene, camera } = createSceneStack(container);
const { clouds } = buildWorld(scene);

const input = createInput(renderer.domElement);
const particles = new ParticleSystem(scene);
const bulletSystem = new BulletSystem(scene, particles);
const tagLayerEl = document.getElementById('tag-layer');
const nameTags = new NameTagSystem(tagLayerEl, camera);

const ui = new UI();
const minimap = new Minimap();
ui.minimap = minimap;
ui.showTitle();

const battle = new Battle({
  scene, bulletSystem, particles, nameTags, camera,
  ui, audio, totalTanks: CFG.match.totalTanks,
});
battle.nameTags = nameTags; // expose for UI live tag updates

ui.setOnPlay(() => {
  audio.ensureAudio();
  battle.start(ui.playerName);
});

document.getElementById('btn-play').addEventListener('click', () => {
  audio.ensureAudio();
  battle.start(ui.playerName);
});

// ── Player controller: writes inputs into the player Tank each frame ──
const _aimOut = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _camUp = new THREE.Vector3(0, 1, 0);
const _qTmp = new THREE.Quaternion();
const _vTmp = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const _mouseV = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.5); // y = 2.5

function getDesktopAimPoint(player) {
  _mouseV.set(input.mouse.x, input.mouse.y);
  raycaster.setFromCamera(_mouseV, camera);

  // Try tank hit first (auto-snap-ish to enemy under cursor)
  let bestHit = null, bestDist = 1.4;
  for (const t of battle.tanks) {
    if (!t.alive || t === player) continue;
    const center = t.root.position.clone(); center.y += 1.0;
    const d = raycaster.ray.distanceToPoint(center);
    if (d < bestDist) { bestDist = d; bestHit = center.clone(); }
  }
  if (bestHit) return bestHit;

  // Fallback: a horizontal plane at hull level
  if (raycaster.ray.intersectPlane(aimPlane, _aimOut)) return _aimOut.clone();
  return null;
}

function getTouchAimPoint(player) {
  let best = null, bestD = Infinity;
  for (const t of battle.tanks) {
    if (!t.alive || t === player) continue;
    const d = t.root.position.distanceTo(player.root.position);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) {
    const p = best.root.position.clone(); p.y += 1.0;
    return p;
  }
  // Fallback: ahead
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(player.root.quaternion);
  return player.root.position.clone().addScaledVector(fwd, 30).setY(2);
}

function updatePlayerInputs(dt) {
  const player = battle.player;
  if (!player || !player.alive) return;

  // Camera-relative movement
  camera.getWorldDirection(_camFwd);
  _camFwd.y = 0; _camFwd.normalize();

  let ix = 0, iy = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) iy += 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) iy -= 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ix -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ix += 1;
  if (input.joystick.active) {
    ix += input.joystick.x;
    iy += -input.joystick.y;
  }
  _camRight.crossVectors(_camFwd, _camUp).normalize();

  const inputLen = Math.sqrt(ix * ix + iy * iy);
  if (inputLen > 0.05) {
    const scale = Math.min(1, inputLen);
    const nx = (ix / inputLen) * scale;
    const ny = (iy / inputLen) * scale;
    _moveVec.copy(_camFwd).multiplyScalar(ny).addScaledVector(_camRight, nx);
    if (_moveVec.lengthSq() > 0.0001) {
      player.targetBodyYaw = Math.atan2(_moveVec.x, _moveVec.z);
      player.driveForward = scale;
    } else {
      player.driveForward = 0;
    }
  } else {
    player.driveForward = 0;
  }

  // Aim
  const aim = isTouch ? getTouchAimPoint(player) : getDesktopAimPoint(player);
  if (aim) player.aimPoint.copy(aim);

  // Fire
  player.wantsFire = !!input.firing;
}

// ── Damage tracking for player to flash hits ──
const playerHealthRef = { last: CFG.tank.maxHealth, lastPlayer: null };
function trackPlayerDamage() {
  const p = battle.player;
  if (!p) return;
  // Reset on new match (player object identity changes).
  if (p !== playerHealthRef.lastPlayer) {
    playerHealthRef.lastPlayer = p;
    playerHealthRef.last = p.health;
    return;
  }
  if (p.health < playerHealthRef.last) {
    audio.sfxDamage(1);
    ui.flashHit();
    if (p.lastHitFrom) {
      ui.showDamageDirection(p.lastHitFrom);
    }
  }
  playerHealthRef.last = p.health;
}

// ── Camera ──
const _camLookT = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
function updateCamera(dt) {
  // Always follow the player's wreck, even after death — avoids teleport-snap.
  const target = battle.player ? battle.player.root.position : _vTmp.set(0, 0, 0);

  _camDesired.set(target.x, target.y + CFG.camera.height, target.z - CFG.camera.distance);
  camera.position.lerp(_camDesired, Math.min(1, CFG.camera.lerp * dt));

  _camLookT.set(target.x, target.y + 2, target.z);
  if (battle.player && battle.player.alive) {
    const turret = battle.player.turret;
    turret.getWorldQuaternion(_qTmp);
    _vTmp.set(0, 0, 1).applyQuaternion(_qTmp);
    _camLookT.addScaledVector(_vTmp, CFG.camera.lookAhead);
  }
  camera.lookAt(_camLookT);
}

// ── Loop ──
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  updatePlayerInputs(dt);
  battle.update(dt);
  bulletSystem.update(dt, battle.tanks);
  particles.update(dt);
  trackPlayerDamage();

  updateClouds(clouds, dt);
  updateCamera(dt);
  nameTags.update();

  ui.tick();
  minimap.draw();

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// Touch UI visibility on resume
addEventListener('visibilitychange', () => {
  if (document.hidden) {
    input.firing = false;
    input.keys.clear();
  }
});
