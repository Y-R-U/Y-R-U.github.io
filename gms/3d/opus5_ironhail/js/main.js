// IRONHAIL — boot, screen routing and the main loop.

import * as THREE from 'three';
import { SHOT_MODE, DEV_MODE, AUTO_MODE, START_ARG, MISSION_ARG, ENV_ARG, SEED_ARG, IS_TOUCH } from './config.js';
import { $, fmtTime } from './utils.js';
import { loadProfile, profile, saveProfile, markDirty, markDailyClaimed, todayKey } from './save.js';
import {
  initRender, render, renderer, camera, lastFrame, actorRoot, scene,
  applyQuality, settingsQuality, qualityLevel, needFrame, frameDrawn, requestFrame,
  sunLight, bloomPass,
} from './render.js';
import { updateEnvironment, applyEnvironment } from './env.js';
import { flushTerrain, terrainHeight } from './terrain.js';
import { props, damageProp } from './props.js';
import { aimSolution, fireWeapon, activeShellCount } from './projectiles.js';
import { useUtility } from './utility.js';
import { UTILITIES } from './arsenal.js';
import { initInput, consume, setSensitivity, setAimSide, setInvertY } from './input.js';
import { updateCamera, orbitCamera, endKillCam } from './camera.js';
import { AudioFX } from './audio.js';
import { thump } from './haptics.js';
import { state } from './state.js';
import { on, emit } from './bus.js';
import { initBattleSystems, startBattle, updateBattle, startAttract, updateAttract, requestCutscene } from './battle.js';
import { skipCutscene, cineActive } from './cine.js';
import { playHighlights, highlightCount } from './highlights.js';
import { MISSIONS, MISSION_BY_ID, makeSkirmish, dailySeed, suggestedTier } from './missions.js';
import { initHUD, updateHUD, showHUD, resetHUD, showBanner, showToast, hideToast } from './hud.js';
import {
  initMenus, showMenu, showTitle, showCampaign, showBrief, showAttack, showGarage, showLadder, showResults, showPause, initRenameModal, refreshCurrentScreen,
} from './menus.js';
import { commanderLevel } from './save.js';
import { showPreview, hidePreview, updatePreview, previewVisible } from './preview.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadProfile();

// Everything the settings screen can change, pushed into the live systems.
// Called at boot and after every settings write, so a control-layout change
// takes effect without leaving the pause menu.
function applySettings() {
  const s = profile.settings;
  setSensitivity(s.sens || 1);
  setAimSide(s.aimSide);
  setInvertY(!!s.invertY);
  document.body.classList.toggle('pad-left', s.padSide === 'left');
  if (renderer && settingsQuality() !== qualityLevel) applyQuality();
  requestFrame();
}
applySettings();

initRender($('game-container'));
initBattleSystems();
initInput(renderer.domElement);

initHUD({
  onPause: () => pauseGame(true),
});

initMenus({
  onDeployMission: (id, replayCine) => {
    if (replayCine) requestCutscene(id);
    deployMission(id);
  },
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
  onSettings: () => applySettings(),
  onReplayHighlights: () => replayHighlights(),
  highlightCount: () => highlightCount(),
});

initRenameModal((name) => {
  profile.name = name;
  markDirty();
  refreshCurrentScreen();
  if (state.player) state.player.name = name;
});

// The AudioContext is created on the first gesture (input.js), not here: one
// born before a tap starts suspended and Android may never let it run.

// The br8t account layer is optional scenery: if it will not load, the game is
// unchanged. Unattended runs skip it so a soak never touches a real account.
let cloud = null;
if (!AUTO_MODE && !SHOT_MODE) {
  import('./cloud.js')
    .then((m) => { cloud = m; })
    .catch(() => { /* offline, blocked or file:// — local save only */ });
}

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
  document.body.classList.remove('paused');
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
  document.body.classList.remove('paused');
  startBattle(mission);
  resetHUD();
  showHUD(true);
  showBanner(mission.name, true);
}

function pauseGame(on) {
  if (!state.inBattle) return;
  state.paused = on;
  document.body.classList.toggle('paused', on);
  showMenu(on);
  if (on) { hideToast(); showPause(); }
  else if (state.screen === 'battle') { /* nothing to restore */ }
}

// A phone call, a notification or a switched tab should not cost you a hull.
// Backgrounded pages stop getting rAF anyway; this makes the stop explicit so
// you come back to the pause menu instead of a burning wreck.
function autoPause() {
  if (AUTO_MODE) return;        // unattended soak runs must keep running
  if (state.inBattle && !state.paused) pauseGame(true);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

let lastResults = null;

on('battle-over', (res) => {
  if (res.mission.daily) markDailyClaimed();
  saveProfile();
  lastResults = res;
  setTimeout(() => {
    showHUD(false);
    // The reel goes between the fight and the paperwork, because that is where
    // it is still about the fight. If there is nothing worth showing it never
    // interrupts — playHighlights says so and the results come straight up.
    if (!playHighlights(() => openResults(res))) openResults(res);
  }, res.win ? 1500 : 1900);
});

function openResults(res) {
  showMenu(true);
  showResults(res);
  // Counted here, not on `battle-over`: the account prompt must not open over
  // the victory film or the replay reel. The flag keeps a reel replay — which
  // comes back through this same panel — from counting as a second mission.
  if (cloud && !res.counted) { res.counted = true; cloud.missionFinished(); }
}

function replayHighlights() {
  const res = lastResults;
  if (!res) return;
  showMenu(false);
  if (!playHighlights(() => openResults(res))) openResults(res);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let devT = 0;

// The menu backdrop is scenery: it runs at ~30fps, and stands still while a
// list screen (campaign, settings, ladder...) is being read over it. A paused
// battle is likewise drawn once and left alone.
const MENU_STEP = 1 / 31;
const FROZEN_SCREENS = new Set(['campaign', 'attack', 'ladder', 'settings']);
let menuAcc = 0;

function backdropFrozen() {
  if (state.inBattle) return state.paused && !state.cine;
  return FROZEN_SCREENS.has(state.screen) && !$('menu').classList.contains('hidden');
}

function tick() {
  requestAnimationFrame(tick);
  let frameDt = clock.getDelta();
  perfProbe(frameDt);
  const throttled = !SHOT_MODE && (!state.inBattle || state.screen === 'results');
  if (throttled) {
    menuAcc += frameDt;
    if (menuAcc < MENU_STEP) return;
    frameDt = menuAcc;
    menuAcc = 0;
  }
  const frozen = backdropFrozen();
  if (frozen && !needFrame) {
    // still honour the keys that act on a frozen screen
    if (consume('pause') && state.inBattle && !state.cine) pauseGame(false);
    if (consume('mute')) toggleMuteKey();
    return;
  }
  const rawDt = Math.min(frameDt, 0.05);
  state.time += rawDt;
  const dt = rawDt * timeFx(frameDt);

  updateEnvironment(rawDt, state.time);

  if (consume('pause')) {
    // during a film the pause key is a skip key — pausing over a cutscene
    // gives you a menu on top of a moving camera and no way to read either
    if (state.cine) skipCutscene();
    else if (state.inBattle) pauseGame(!state.paused);
  }
  if (consume('mute')) toggleMuteKey();

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
  frameDrawn();

  if (DEV_MODE) {
    devT -= rawDt;
    if (devT <= 0) { devT = 0.25; drawDev(); }
  }
}

// ---------------------------------------------------------------------------
// Kill juice: hit-stop and the final-kill slow-motion
// ---------------------------------------------------------------------------
// Kept apart from state.timeScale, which the kill cam and the films own: this
// decays on wall-clock time and only ever *lowers* the scale, so it can stack
// with a kill cam without either one resetting the other.

const juice = { t: 0, scale: 1, cd: 0 };

function timeFx(frameDt) {
  if (juice.cd > 0) juice.cd -= frameDt;
  if (juice.t > 0) {
    juice.t -= frameDt;
    if (state.inBattle && !state.cine && !state.paused) return Math.min(state.timeScale, juice.scale);
  }
  return state.timeScale;
}

function hitStop(dur, scale) {
  if (AUTO_MODE) return;
  juice.scale = juice.t > 0 ? Math.min(juice.scale, scale) : scale;
  juice.t = Math.max(juice.t, dur);
}

on('player-hit', (e) => {
  // a penetrating shell (not splash) earns a beat; bursts get one per volley
  if (e.splash || !(e.dmg > 0) || juice.cd > 0 || state.phase !== 'playing') return;
  juice.cd = 0.4;
  hitStop(e.tank.alive ? 0.055 : 0.075, 0.06);
});

on('final-kill', () => {
  // replaces any hit-stop in flight: this one is slow motion, not a freeze
  if (!AUTO_MODE) { juice.t = 0.15; juice.scale = 0.22; }
  juice.cd = 1;
  thump('final');
});

function toggleMuteKey() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  showToast(AudioFX.muted ? 'SOUND OFF' : 'SOUND ON');
}

// ---------------------------------------------------------------------------
// First-battle performance probe (touch only)
// ---------------------------------------------------------------------------
// Every phone used to get pixel ratio 1.75, 2048 soft shadows and full-res
// bloom. The first real fight samples ~3s of frame times; a phone that cannot
// hold ~45fps is dropped to BALANCED on the spot and told so, once. The
// verdict is saved, and any choice made in Settings retires the probe.

const PROBE = { warm: 0.8, span: 3, minFps: 45 };
const probe = { t: 0, frames: 0, time: 0, result: null, fps: 0 };

function probeWanted() {
  if (!IS_TOUCH || AUTO_MODE || SHOT_MODE) return false;
  if (profile.settings.autoQ) return false;
  return settingsQuality() === 'high';
}

function perfProbe(frameDt) {
  if (probe.result || !state.inBattle || state.phase !== 'playing' || state.paused ||
      state.cine || document.hidden) {
    if (!state.inBattle) { probe.t = 0; probe.frames = 0; probe.time = 0; }
    return;
  }
  if (!probeWanted()) return;
  probe.t += frameDt;
  if (probe.t < PROBE.warm) return;
  probe.frames++;
  probe.time += Math.min(frameDt, 0.25);
  if (probe.time < PROBE.span) return;
  probe.fps = probe.frames / probe.time;
  if (probe.fps < PROBE.minFps) {
    probe.result = 'dropped';
    profile.settings.quality = 'balanced';
    profile.settings.autoQ = 'dropped';
    applyQuality('balanced');
    emit('toast', { text: 'GRAPHICS SET TO BALANCED FOR A SMOOTHER FIGHT · SETTINGS TO CHANGE', dur: 4.5 });
  } else {
    probe.result = 'kept';
    profile.settings.autoQ = 'kept';
  }
  saveProfile();
}

function updateKillCam(dt) {
  const kc = state.killcam;
  if (!kc) return;
  // once the shell has landed, hang on the impact for a beat — the explosion
  // is the payoff, and cutting on the frame of contact throws it away
  if (!kc.bolt.active && kc.hold == null) kc.hold = 0.55;
  if (kc.hold != null) kc.hold -= dt;
  if ((kc.hold != null && kc.hold <= 0) || kc.t > 3.4) endKillCam();
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
  damageProp,
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
  setSetting: (k, v) => { profile.settings[k] = v; applySettings(); markDirty(); refreshCurrentScreen(); },
  giveModule: (id) => { if (!profile.owned.modules.includes(id)) profile.owned.modules.push(id); markDirty(); },
  utils: { useUtility, UTILITIES },
  reelCount: () => highlightCount(),
  juice: () => ({ ...juice }),
  perf: () => ({ ...probe, quality: qualityLevel, pixelRatio: renderer.getPixelRatio(),
    shadows: renderer.shadowMap.enabled ? sunLight.shadow.mapSize.x : 0, bloom: !!(bloomPass && bloomPass.enabled) }),
  playReel: () => replayHighlights(),
  THREE, camera, actorRoot, scene, renderer,
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
