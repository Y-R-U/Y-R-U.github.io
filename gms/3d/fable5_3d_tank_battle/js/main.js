// Boot + match lifecycle + main loop.

import * as THREE from 'three';
import {
  ZONE, PERSONALITIES, ACCENTS, NAME_POOL,
  NAME_KEY, MODE_KEY, DEFAULT_TANK_COUNT, SHOT_MODE, AUTO_MODE,
} from './config.js';
import { $, rand, clamp, damp, fmtTime, pickRandom, shuffled } from './utils.js';
import { state, aliveTanks } from './state.js';
import { AudioFX } from './audio.js';
import {
  initWorld, camera, composer, renderer,
  updateEnvironment, setZoneVisual,
} from './world.js';
import { initParticles, updateParticles, clearParticles, spawnExplosion } from './particles.js';
import { Tank, updateAllTanks } from './tanks.js';
import { initCombat, updateCombat, clearBolts } from './combat.js';
import { AIController } from './ai.js';
import { PlayerController } from './player.js';
import { initInput, input } from './input.js';
import { updatePickups, clearPickups } from './pickups.js';
import * as ui from './ui.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initWorld($('game-container'));
initParticles();
initCombat();

state.playerName = localStorage.getItem(NAME_KEY) || pickRandom(NAME_POOL);
state.tankCount = clamp(parseInt(localStorage.getItem(MODE_KEY), 10)
  || DEFAULT_TANK_COUNT, 2, 16);

function toggleMute() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  ui.updateMuteBtn(AudioFX.muted);
}

initInput(renderer.domElement, { onToggleMute: toggleMute });

ui.initUI({
  onPlay: () => startMatch(),
  onRetry: () => startMatch(),
  onMenu: () => goToTitle(),
  onSpectate: () => {
    ui.showSpectateBar(state.spectating ? state.spectating.name : '—',
      state.player ? state.player.place : '—');
  },
  onNameSave: (name) => {
    state.playerName = name;
    localStorage.setItem(NAME_KEY, name);
    ui.setPlayerNameUI(name);
    if (state.player) {
      state.player.name = name;
      ui.renameTag(state.player, name);
      ui.updateLeaderboard();
    }
  },
  onModeChange: (count) => {
    state.tankCount = count;
    localStorage.setItem(MODE_KEY, String(count));
  },
  onToggleMute: toggleMute,
});

ui.setPlayerNameUI(state.playerName);
ui.selectModePill(state.tankCount);
ui.updateMuteBtn(AudioFX.muted);

// ---------------------------------------------------------------------------
// Match setup / teardown
// ---------------------------------------------------------------------------

let countdownShown = -1;
let lbTimer = 0;
let fireworkTimer = 0;

function clearMatch() {
  for (const t of state.tanks) t.dispose();
  state.tanks = [];
  state.player = null;
  state.spectating = null;
  state.winner = null;
  clearBolts();
  clearParticles();
  clearPickups();
}

function resetZone() {
  state.zoneR = ZONE.startR;
  state.zoneShrinking = false;
  state.zoneTimer = ZONE.graceTime;
}

function pickNames(n, exclude) {
  const pool = shuffled(NAME_POOL.filter((x) => x !== exclude));
  return pool.slice(0, n);
}

function spawnTanks(count, withPlayer, spawnR = 40) {
  const aiCount = withPlayer ? count - 1 : count;
  const names = pickNames(aiCount, state.playerName);
  const accents = shuffled(ACCENTS.slice(1)).slice(0, aiCount);
  const personalities = shuffled(Object.values(PERSONALITIES));

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * spawnR;
    const z = Math.sin(angle) * spawnR;
    const isPlayer = withPlayer && i === 0;
    let tank;
    if (isPlayer) {
      tank = new Tank({ name: state.playerName, accent: ACCENTS[0], isPlayer: true });
      tank.controller = AUTO_MODE
        ? new AIController(tank, pickRandom(Object.values(PERSONALITIES)))
        : new PlayerController(tank);
      state.player = tank;
    } else {
      const idx = withPlayer ? i - 1 : i;
      const personality = personalities[idx % personalities.length];
      tank = new Tank({ name: names[idx], accent: accents[idx % accents.length],
        personality });
      tank.controller = new AIController(tank, personality);
    }
    tank.reset(x, z);
    state.tanks.push(tank);
  }
  state.placeCounter = count;
}

function startMatch() {
  clearMatch();
  resetZone();
  spawnTanks(state.tankCount, true);
  state.phase = 'countdown';
  state.countdown = 3.8;
  state.matchTime = 0;
  countdownShown = -1;
  ui.showMatchHUD();
  ui.buildTags();
  ui.updateLeaderboard();
  ui.updateHUD();
  ui.setZoneStatus('');
}

function goToTitle() {
  clearMatch();
  resetZone();
  ui.showTitle();
  state.phase = 'title';
  spawnTanks(Math.min(8, Math.max(4, state.tankCount)), false);
  ui.updateLeaderboard();
}

function restartAttract() {
  clearMatch();
  resetZone();
  spawnTanks(8, false);
}

// ---------------------------------------------------------------------------
// Zone (storm) logic
// ---------------------------------------------------------------------------

function updateZone(dt) {
  if (SHOT_MODE) {
    setZoneVisual(state.zoneR, true, state.time);
    return;
  }

  if (!state.zoneShrinking) {
    state.zoneTimer -= dt;
    if (state.zoneTimer <= 0) {
      state.zoneShrinking = true;
      if (state.phase === 'playing' || state.phase === 'spectate') {
        ui.showBanner('THE STORM IS CLOSING', true);
        AudioFX.horn();
      }
    }
  } else {
    state.zoneR = Math.max(ZONE.minR, state.zoneR - ZONE.shrinkRate * dt);
  }
  setZoneVisual(state.zoneR, state.zoneShrinking, state.time);

  // storm damage
  for (const t of aliveTanks()) {
    if (Math.hypot(t.pos.x, t.pos.z) > state.zoneR + 0.5) {
      t.damage(ZONE.dps * dt, null);
    }
  }

  // HUD status
  if (state.phase === 'playing' && state.player && state.player.alive) {
    const outside = Math.hypot(state.player.pos.x, state.player.pos.z) > state.zoneR + 0.5;
    if (outside) {
      ui.setZoneStatus('⚠ IN THE STORM — GET INSIDE ⚠', 'danger');
    } else if (!state.zoneShrinking) {
      ui.setZoneStatus('STORM IN ' + fmtTime(Math.max(0, state.zoneTimer)));
    } else if (state.zoneR > ZONE.minR) {
      ui.setZoneStatus('STORM CLOSING');
    } else {
      ui.setZoneStatus('FINAL ZONE');
    }
  } else {
    ui.setZoneStatus('');
  }
}

// ---------------------------------------------------------------------------
// Match end / spectate
// ---------------------------------------------------------------------------

function checkMatchEnd() {
  if (SHOT_MODE) return;
  const alive = aliveTanks();

  // player just died?
  if (state.phase === 'playing' && state.player && !state.player.alive) {
    state.phase = 'spectate';
    state.spectating = (state.player.lastAttacker && state.player.lastAttacker.alive)
      ? state.player.lastAttacker : alive[0] || null;
    AudioFX.dirge();
    ui.showDefeat({
      place: state.player.place,
      total: state.tankCount,
      kills: state.player.kills,
      time: fmtTime(state.matchTime),
      killer: state.player.lastAttacker ? state.player.lastAttacker.name : 'THE STORM',
    });
  }

  if (alive.length <= 1 && (state.phase === 'playing' || state.phase === 'spectate')) {
    const winner = alive[0] || null;
    state.winner = winner;
    if (winner) winner.place = 1;
    ui.updateLeaderboard();
    if (winner && winner.isPlayer) {
      state.phase = 'over';
      AudioFX.fanfare();
      ui.showVictory({ kills: winner.kills, time: fmtTime(state.matchTime) });
    } else {
      state.phase = 'over';
      ui.showBanner(winner ? 'WINNER: ' + winner.name : 'NO SURVIVORS', true);
      state.spectating = winner;
      // if the defeat popup was dismissed for spectating, surface the bar
      if (state.player && !state.player.alive &&
          $('gameover-popup').classList.contains('hidden')) {
        ui.showSpectateBar(winner ? winner.name : '—', state.player.place);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();

function cameraFocus() {
  if (state.phase === 'title') return null;
  if (state.player && state.player.alive) return state.player;
  if (state.spectating && state.spectating.alive) return state.spectating;
  const alive = aliveTanks();
  state.spectating = alive.sort((a, b) => b.kills - a.kills)[0] || state.spectating;
  if (state.spectating) ui.updateSpectateName(state.spectating.name);
  return state.spectating;
}

function updateCamera(dt) {
  const focus = cameraFocus();
  if (!focus) {
    const a = state.time * 0.07;
    camGoal.set(Math.sin(a) * 38, 13 + Math.sin(state.time * 0.21) * 2.5, Math.cos(a) * 38);
    camera.position.lerp(camGoal, damp(1.6, dt));
    camLook.set(0, 4, 0);
  } else {
    const fx = focus.pos.x * 0.94;
    const fz = focus.pos.z * 0.94;
    const isPlayer = focus === state.player;
    camGoal.set(
      fx + (isPlayer ? input.mouse.x * 1.6 : 0),
      10 + (isPlayer ? input.mouse.y * 1.2 : 0),
      fz + 14.5);
    camera.position.lerp(camGoal, damp(5, dt));
    camLook.set(fx, 2.2, fz - 7);
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
// Countdown
// ---------------------------------------------------------------------------

function updateCountdown(dt) {
  state.countdown -= dt;
  const n = Math.ceil(state.countdown);
  if (n !== countdownShown && n > 0) {
    countdownShown = n;
    ui.showBanner(String(n));
    AudioFX.tick();
  }
  if (state.countdown <= 0) {
    state.phase = 'playing';
    ui.showBanner('FIGHT!');
    AudioFX.horn();
  }
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

  const phase = state.phase;

  if (phase === 'countdown') {
    updateCountdown(dt);
    updateAllTanks(dt, false);
  } else if (phase === 'playing' || phase === 'spectate' || phase === 'over' ||
             phase === 'title') {
    if (phase !== 'over') state.matchTime += phase === 'title' ? 0 : dt;
    updateAllTanks(dt, phase !== 'over' || !state.winner || !state.winner.isPlayer);
    updateCombat(dt);
    updatePickups(dt);
    updateZone(dt);

    if (phase === 'title') {
      // attract mode runs forever
      if (aliveTanks().length <= 1) restartAttract();
    } else {
      checkMatchEnd();
    }

    // victory fireworks
    if (phase === 'over' && state.winner && state.winner.isPlayer) {
      fireworkTimer -= dt;
      if (fireworkTimer <= 0) {
        fireworkTimer = 0.65;
        spawnExplosion(new THREE.Vector3(
          state.winner.pos.x + rand(-14, 14), rand(8, 18),
          state.winner.pos.z + rand(-14, 14)),
        1.1, pickRandom([0x4df3ff, 0xff2d8f, 0xffb347, 0x86ff4d]));
      }
    }

    // throttled leaderboard refresh (hp bars), HUD every frame
    lbTimer -= dt;
    if (lbTimer <= 0 && phase !== 'title') {
      lbTimer = 0.5;
      ui.updateLeaderboard();
    }
    if (phase !== 'title') {
      ui.updateHUD();
      ui.updateTags();
    }
    ui.updateArrows();
  }

  updateParticles(dt);
  updateCamera(dt);
  composer.render();
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

window.__state = state;   // debugging / test hook

if (SHOT_MODE) {
  // staged, photogenic frame for thumbnails: all-AI brawl in a tight zone
  clearMatch();
  state.zoneR = 26;
  state.zoneShrinking = false;
  state.zoneTimer = 9999;
  spawnTanks(10, false, 16);
  state.phase = 'spectate';
  state.spectating = state.tanks[0];
  ui.showMatchHUD();
  $('spectate-bar').classList.add('hidden');
  ui.buildTags();
  ui.updateLeaderboard();
} else {
  goToTitle();
}

tick();
