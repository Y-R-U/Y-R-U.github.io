// Boot + wave lifecycle + aiming + camera + main loop.

import * as THREE from 'three';
import {
  SHOT_MODE, AUTO_MODE, IS_TOUCH, TANK, FIELD_R,
  waveSpec, diveCap, waveSpeedScale,
} from './config.js';
import { $, rand, damp } from './utils.js';
import { state, saveBest } from './state.js';
import { AudioFX } from './audio.js';
import { initWorld, camera, composer, renderer, updateEnvironment } from './world.js';
import { updateParticles, clearParticles, sparkBurst, featherBurst } from './particles.js';
import { initInput, input } from './input.js';
import { initPlayer, resetPlayer, updatePlayer, player } from './tank.js';
import {
  initCrows, spawnCrow, updateCrows, crows, bossCrow,
  aliveCount, threatCrows, clearCrows,
} from './crows.js';
import { updateCombat, clearShells } from './combat.js';
import * as ui from './ui.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initWorld($('game-container'));
initPlayer();
initCrows({
  getPlayerPos: () => player.pos,
  getPlayerVel: () => player.vel,
  damagePlayer,
});

function toggleMute() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  ui.updateMuteBtn(AudioFX.muted);
}

initInput(renderer.domElement, { onToggleMute: toggleMute });
ui.initUI({
  onPlay: startGame,
  onRetry: startGame,
  onMenu: goToTitle,
  onToggleMute: toggleMute,
});
ui.updateMuteBtn(AudioFX.muted);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function damagePlayer(dmg, fromPos) {
  if (state.phase !== 'playing' || SHOT_MODE) return;
  state.armor -= dmg;
  state.lastHitAt = state.time;
  state.shake = Math.min(state.shake + 0.22, 0.55);
  ui.flashHit();
  AudioFX.thud();
  sparkBurst(new THREE.Vector3(player.pos.x, 2.2, player.pos.z), 10, 0xff3020);
  if (state.armor <= 0) {
    state.armor = 0;
    gameOver();
  }
}

function startWave(n) {
  state.wave = n;
  state.waveDelay = -1;
  const spec = waveSpec(n);
  const ss = waveSpeedScale(n);
  for (let i = 0; i < spec.crows; i++) spawnCrow('crow', ss);
  for (let i = 0; i < spec.brutes; i++) spawnCrow('brute', ss);
  if (spec.boss) {
    spawnCrow('boss', ss);
    ui.showBanner('CORVUS REX');
  } else {
    ui.showBanner('WAVE ' + n);
  }
  AudioFX.horn();
}

function startGame() {
  clearCrows();
  clearShells();
  clearParticles();
  resetPlayer();
  state.phase = 'playing';
  state.score = 0;
  state.kills = 0;
  state.armor = 100;
  state.lastHitAt = -99;
  ui.showHUD();
  startWave(1);
}

function goToTitle() {
  clearCrows();
  clearShells();
  clearParticles();
  resetPlayer();
  state.phase = 'title';
  ui.showTitle();
  // attract murder wheeling over the parked tank
  for (let i = 0; i < 8; i++) spawnCrow(i === 0 ? 'brute' : 'crow', 1);
}

function gameOver() {
  state.phase = 'over';
  saveBest();
  sparkBurst(new THREE.Vector3(player.pos.x, 1.8, player.pos.z), 36, 0xffa030);
  featherBurst(new THREE.Vector3(player.pos.x, 2.5, player.pos.z), 8, 1.4);
  AudioFX.boom(true);
  AudioFX.dirge();
  ui.showGameOver({
    score: state.score, best: state.best, wave: state.wave, kills: state.kills,
  });
}

// ---------------------------------------------------------------------------
// Aiming. Desktop: mouse ray with a soft snap cone. Touch / auto: lock onto
// the most threatening crow. Returns whether the trigger is held.
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const aimPoint = new THREE.Vector3(0, 10, -40);
const tmpV = new THREE.Vector3();

function computeAim() {
  const autoAim = AUTO_MODE || SHOT_MODE || IS_TOUCH;

  if (!autoAim) {
    raycaster.setFromCamera(input.mouse, camera);
    const dir = raycaster.ray.direction;
    let best = null;
    let bestDot = TANK.aimAssistCos;
    for (const c of crows) {
      if (!c.alive) continue;
      tmpV.copy(c.pos).sub(camera.position);
      const d = tmpV.length();
      tmpV.divideScalar(d);
      const dot = tmpV.dot(dir);
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    if (best) {
      const lead = best.pos.distanceTo(player.pos) / TANK.shellSpeed;
      aimPoint.copy(best.pos).addScaledVector(best.vel, lead);
    } else {
      aimPoint.copy(camera.position).addScaledVector(dir, 90);
    }
    return input.firing;
  }

  let best = null;
  let bestD = Infinity;
  for (const c of crows) {
    if (!c.alive) continue;
    const threat = c.st === 'dive' || c.st === 'aim';
    const d = c.pos.distanceTo(player.pos) - (threat ? 60 : 0);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) {
    const lead = best.pos.distanceTo(player.pos) / TANK.shellSpeed;
    aimPoint.copy(best.pos).addScaledVector(best.vel, lead * 0.9);
    return AUTO_MODE || SHOT_MODE || input.touchFiring || input.firing;
  }
  aimPoint.set(player.pos.x, 12, player.pos.z - 40);
  return false;
}

// ---------------------------------------------------------------------------
// Auto-driver (?auto=1 soak testing): dodge divers, otherwise wander.
// ---------------------------------------------------------------------------

const autoMoveVec = { x: 0, y: 0 };
const wanderDir = { x: 1, y: 0 };
let wanderT = 0;

function autoMove(dt) {
  let danger = null;
  let dd = Infinity;
  for (const c of crows) {
    if (!c.alive || c.st !== 'dive') continue;
    const d = c.pos.distanceTo(player.pos);
    if (d < dd) { dd = d; danger = c; }
  }
  if (danger && dd < 28) {
    const dx = player.pos.x - danger.pos.x;
    const dz = player.pos.z - danger.pos.z;
    const l = Math.hypot(dx, dz) + 0.001;
    autoMoveVec.x = (dx / l) * 0.5 - dz / l;
    autoMoveVec.y = (dz / l) * 0.5 + dx / l;
  } else {
    wanderT -= dt;
    if (wanderT <= 0) {
      wanderT = rand(2, 4.5);
      const a = rand(0, Math.PI * 2);
      wanderDir.x = Math.cos(a);
      wanderDir.y = Math.sin(a);
    }
    autoMoveVec.x = wanderDir.x;
    autoMoveVec.y = wanderDir.y;
    const r = Math.hypot(player.pos.x, player.pos.z);
    if (r > FIELD_R - 12) {
      autoMoveVec.x = -player.pos.x / r;
      autoMoveVec.y = -player.pos.z / r;
    }
  }
  return autoMoveVec;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  if (SHOT_MODE) return;
  if (state.phase === 'title') {
    const a = state.time * 0.055;
    camGoal.set(Math.sin(a) * 42, 14 + Math.sin(state.time * 0.2) * 2.5, Math.cos(a) * 42);
    camera.position.lerp(camGoal, damp(1.5, dt));
    camLook.set(0, 7, 0);
  } else {
    camGoal.set(
      player.pos.x + input.mouse.x * 2.0,
      10 + input.mouse.y * 1.6,
      player.pos.z + 15);
    camera.position.lerp(camGoal, damp(5, dt));
    camLook.set(player.pos.x, 4.6, player.pos.z - 7);
  }

  if (state.shake > 0.001) {
    camera.position.x += rand(-1, 1) * state.shake;
    camera.position.y += rand(-1, 1) * state.shake * 0.6;
    camera.position.z += rand(-1, 1) * state.shake;
    state.shake *= Math.pow(0.001, dt);
  } else {
    state.shake = 0;
  }
  camera.lookAt(camLook);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  updateEnvironment(state.time);

  const playing = state.phase === 'playing';

  if (playing) {
    const wantFire = computeAim();
    // shot mode keeps the tank parked for the staged frame
    const move = SHOT_MODE ? { x: 0, y: 0 } : AUTO_MODE ? autoMove(dt) : null;
    updatePlayer(dt, aimPoint, wantFire, move);

    // armor regen after a quiet spell
    if (state.armor < 100 && state.time - state.lastHitAt > TANK.regenDelay) {
      state.armor = Math.min(100, state.armor + TANK.regenRate * dt);
    }
  } else if (state.phase === 'title') {
    // parked tank scans the sky
    player.turretG.rotation.y = Math.sin(state.time * 0.4) * 1.2;
    player.barrelG.rotation.x = 0.5 + Math.sin(state.time * 0.7) * 0.2;
  }

  updateCrows(dt, diveCap(state.wave), playing && !SHOT_MODE);
  updateCombat(dt);
  updateParticles(dt);

  if (playing) {
    ui.updateHUD(aliveCount());
    if (!SHOT_MODE) {
      // wave progression
      if (aliveCount() === 0) {
        if (state.waveDelay < 0) state.waveDelay = 2.0;
        state.waveDelay -= dt;
        if (state.waveDelay <= 0) startWave(state.wave + 1);
      }
      ui.updateArrows(threatCrows());
      ui.showBossBar(state.bossAlive);
      if (state.bossAlive && bossCrow) ui.updateBossBar(bossCrow.hp);
    }
  }

  updateCamera(dt);
  composer.render();
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

window.__state = state;                       // soak-test hook
window.__game = { state, crows, player };

if (SHOT_MODE) {
  // staged, photogenic frame for the thumbnail: the murder wheels low over
  // the tank against the sunset while the cannon tracks them
  ui.showHUD();
  state.phase = 'playing';
  state.score = 13650;
  state.wave = 4;
  // hero crows: close to camera, eyes blazing, glaring at the tank
  for (const [x, y, z] of [[2.8, 6.0, 4.5], [-6, 7.4, -2], [7, 7.5, -3]]) {
    const c = spawnCrow('crow', 1);
    c.pos.set(x, y, z);
    c.vel.set(0, 0, 0);
    c.alt = y;
    c.st = 'aim';
    c.aimT = 9999;
    c.diveT = 9999;
    c.hp = 9999;              // shells poof feathers but never break the pose
    c.grp.rotation.y = Math.atan2(-(0 - x), -(0 - z)) + Math.PI;
  }
  // the wheeling flock behind them
  for (let i = 0; i < 9; i++) {
    const c = spawnCrow('crow', 1);
    const a = (i / 9) * Math.PI * 2 + 1.4;
    const r = rand(12, 19);
    c.orbitA = a;
    c.orbitR = r;
    c.alt = rand(9, 16);
    c.pos.set(Math.cos(a) * r, c.alt, Math.sin(a) * r);
    c.vel.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(8);
    c.diveT = 9999;
    c.hp = 9999;
  }
  camera.position.set(4.5, 3.4, 12.5);
  camera.lookAt(0, 5.2, -20);
} else if (AUTO_MODE) {
  startGame();
} else {
  goToTitle();
}

tick();
