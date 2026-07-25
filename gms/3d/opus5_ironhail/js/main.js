// IRONHAIL — boot, screen routing and the main loop.

import * as THREE from 'three';
import { SHOT_MODE, DEV_MODE, START_ARG, MISSION_ARG, ENV_ARG, SEED_ARG } from './config.js';
import { $, fmtTime } from './utils.js';
import { loadProfile, profile, saveProfile, markDirty, markDailyClaimed, todayKey } from './save.js';
import { initRender, render, renderer, camera, lastFrame, actorRoot, scene } from './render.js';
import { updateEnvironment, applyEnvironment } from './env.js';
import { flushTerrain, terrainHeight } from './terrain.js';
import { props } from './props.js';
import { aimSolution, fireWeapon, activeShellCount } from './projectiles.js';
import { useUtility } from './utility.js';
import { UTILITIES } from './arsenal.js';
import { initInput, consume, setSensitivity } from './input.js';
import { updateCamera, orbitCamera, endKillCam, resetCamera } from './camera.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';
import { on, emit } from './bus.js';
import { initBattleSystems, startBattle, updateBattle, startAttract, updateAttract } from './battle.js';
import { MISSIONS, MISSION_BY_ID, makeSkirmish, dailySeed, suggestedTier } from './missions.js';
import { initHUD, updateHUD, showHUD, resetHUD, showBanner, showToast } from './hud.js';
import {
  initMenus, showMenu, showTitle, showCampaign, showBrief, showAttack, showGarage, showLadder, showResults, showPause, initRenameModal, refreshCurrentScreen,
} from './menus.js';
import { commanderLevel } from './save.js';
import { showPreview, hidePreview, updatePreview, previewVisible } from './preview.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadProfile();
setSensitivity(profile.settings.sens || 1);
initRender($('game-container'));
initBattleSystems();
initInput(renderer.domElement);

initHUD({
  onPause: () => pauseGame(true),
});

initMenus({
  onDeployMission: (id) => deployMission(id),
  onDeploySkirmish: (tier, daily) => deploySkirmish(tier, daily),
  onResume: () => pauseGame(false),
  onRestart: () => {
    const m = state.mission;
    pauseGame(false);
    if (m) launch(m);
  },
  onAbort: () => toMenus('title'),
  onNextMission: () => {
    const i = MISSIONS.findIndex((x) => state.mission && x.id === state.mission.id);
    const next = MISSIONS[i + 1];
    leaveBattle();
    if (next) showBrief(next.id); else showCampaign();
  },
  onSens: (s) => setSensitivity(s),
});

initRenameModal((name) => {
  profile.name = name;
  markDirty();
  refreshCurrentScreen();
  if (state.player) state.player.name = name;
});

AudioFX.init();

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------

function toMenus(which = 'title') {
  leaveBattle();
  switch (which) {
    case 'campaign': showCampaign(); break;
    case 'garage': showGarage(); break;
    case 'ladder': showLadder(); break;
    case 'attack': showAttack(); break;
    default: showTitle();
  }
}

function leaveBattle() {
  state.paused = false;
  state.inBattle = false;
  showHUD(false);
  showMenu(true);
  startAttract();
}

function deployMission(id) {
  const m = MISSION_BY_ID[id];
  if (!m) return;
  launch(m);
}

function deploySkirmish(tier, daily) {
  const seed = daily
    ? dailySeed(todayKey())
    : Math.floor(Math.random() * 1e6);
  const m = makeSkirmish(daily ? suggestedTier(commanderLevel().level) : tier, seed, { daily });
  launch(m);
}

function launch(mission) {
  showMenu(false);
  hidePreview();
  state.paused = false;
  startBattle(mission);
  resetHUD();
  showHUD(true);
  showBanner(mission.name, true);
}

function pauseGame(on) {
  if (!state.inBattle) return;
  state.paused = on;
  showMenu(on);
  if (on) showPause();
  else if (state.screen === 'battle') { /* nothing to restore */ }
}

on('battle-over', (res) => {
  if (res.mission.daily) markDailyClaimed();
  saveProfile();
  setTimeout(() => {
    showHUD(false);
    showMenu(true);
    showResults(res);
  }, res.win ? 1500 : 1900);
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let devT = 0;

function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  state.time += rawDt;
  const dt = rawDt * state.timeScale;

  updateEnvironment(rawDt, state.time);

  if (consume('pause')) {
    if (state.inBattle) pauseGame(!state.paused);
  }
  if (consume('mute')) {
    AudioFX.init();
    AudioFX.setMuted(!AudioFX.muted);
    showToast(AudioFX.muted ? 'SOUND OFF' : 'SOUND ON');
  }

  if (state.inBattle) {
    if (!state.paused) {
      updateBattle(dt, rawDt);
      updateKillCam(rawDt);
      updateCamera(dt, rawDt);
    }
    if (state.phase === 'playing' || state.phase === 'countdown') updateHUD(rawDt);
  } else if (state.screen === 'garage') {
    // the turntable takes over the camera; the fight behind it keeps running
    showPreview();
    updateAttract(dt);
    updatePreview(rawDt);
  } else {
    if (previewVisible()) hidePreview();
    updateAttract(dt);
    orbitCamera(rawDt);
  }

  flushTerrain();
  render();

  if (DEV_MODE) {
    devT -= rawDt;
    if (devT <= 0) { devT = 0.25; drawDev(); }
  }
}

function updateKillCam(dt) {
  const kc = state.killcam;
  if (!kc) return;
  if (!kc.bolt.active || kc.t > 2.4) {
    endKillCam();
    if (state.player) resetCamera(state.player);
  }
}

// ---------------------------------------------------------------------------
// Dev overlay
// ---------------------------------------------------------------------------

let devEl = null;
function drawDev() {
  if (!devEl) {
    devEl = document.createElement('div');
    devEl.id = 'dev';
    document.body.appendChild(devEl);
  }
  const p = state.player;
  devEl.textContent = [
    'phase ' + state.phase + (state.paused ? ' (paused)' : ''),
    'tanks ' + state.tanks.filter((t) => t.alive).length + '/' + state.tanks.length,
    'wind ' + state.wind.speed.toFixed(1),
    p ? 'hp ' + Math.round(p.hp) + ' spd ' + (p.speed || 0).toFixed(1) : '',
    state.objective ? 'obj ' + state.objective.kind + ' ' +
      Math.round(state.objective.progress * 10) / 10 + '/' + state.objective.goal : '',
    't ' + fmtTime(state.battleTime),
  ].filter(Boolean).join('  |  ');
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

window.__game = {
  state, profile,
  startMission: (id) => deployMission(id),
  startSkirmish: (tier) => deploySkirmish(tier || 0, false),
  giveScrap: (n) => { profile.scrap += n; markDirty(); refreshCurrentScreen(); },
  win: () => emit('force-win'),
  screens: { showTitle, showCampaign, showGarage, showLadder, showAttack },
  // test helpers
  terrainHeight,
  propList: props,
  props: () => props.map((p) => ({ kind: p.kind, alive: p.alive, state: p.state, hp: Math.round(p.hp) })),
  aimAt: (x, z) => {
    const p = state.player;
    if (!p) return null;
    const from = p.turretG.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3(x, terrainHeight(x, z), z);
    const sol = aimSolution(from, target, p.gun, 1);
    // snap the turret onto the wind-corrected bearing, not the raw one
    p.turretYaw = sol.yaw;
    p.turretG.rotation.y = p.turretYaw - p.yaw;
    p.barrelPitch = sol.pitch;
    p.aimSolution = sol;
    p.aimPoint.set(sol.aimX, target.y, sol.aimZ);
    return { pitch: sol.pitch, tof: sol.tof, dist: sol.dist, valid: sol.valid };
  },
  fireNow: () => {
    const p = state.player;
    if (!p) return false;
    p.fireTimer = 0;
    return fireWeapon(p);
  },
  shells: activeShellCount,
  utils: { useUtility, UTILITIES },
  THREE, camera, actorRoot, scene,
  info: () => ({
    calls: lastFrame.calls,
    tris: lastFrame.tris,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  }),
};

on('force-win', () => {
  if (state.objective) {
    state.objective.progress = state.objective.goal;
    for (const t of state.tanks) if (!t.isPlayer && t.alive) t.damage(1e6, state.player, state.player.pos);
  }
});

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

startAttract();

if (SHOT_MODE) {
  // staged, photogenic frame for the project thumbnail
  showMenu(false);
  showHUD(false);
  state.zoom = 1.2;
} else if (MISSION_ARG) {
  const m = MISSION_BY_ID[MISSION_ARG] ||
    makeSkirmish(parseInt(MISSION_ARG, 10) || 0, parseInt(SEED_ARG, 10) || 4242);
  showMenu(false);
  launch(m);
} else if (START_ARG === 'battle') {
  showMenu(false);
  launch(makeSkirmish(1, parseInt(SEED_ARG, 10) || 1234));
} else {
  showMenu(true);
  toMenus(START_ARG || 'title');
}

if (ENV_ARG && !state.inBattle) {
  const [time, biome] = ENV_ARG.split(',');
  applyEnvironment({ time, biome: biome || 'farmland', seed: 7 });
}

tick();
