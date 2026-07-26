// Screen routing and the game's state machine. Menus emit intentions on the
// bus; this is the only module that acts on them, which keeps the UI free of
// game logic and the game free of DOM.

import { state, resetRaceState } from './state.js';
import { profile, saveProfile, addMoney, applyLadder, grantChest, takeChest, ownPart, ownSkill } from './save.js';
import { startRace, updateRace, teardownRace, forceEnd } from './race.js';
import { updateHud, showHud, initHud, resetHud, banner } from './hud.js';
import { playHighlights, updateHighlightPlayback, isReplaying, stopPlayback } from './highlights.js';
import { playCutscene, updateCine, cineActive, stopCine } from './cine.js';
import * as menus from './menus.js';
import { levelEvent, cutsceneFor, storyLength, isLevelUnlocked } from './story.js';
import { eventById, quickEvent, dailyEvent } from './events.js';
import { rollChest } from './arsenal.js';
import { render, setEnvironment } from './render.js';
import { updateAudio, playMusic, sfx } from './audio.js';
import { clearInput } from './input.js';
import { emit, on } from './bus.js';
import { $, clamp } from './utils.js';
import { START_ARG, TRACK_ARG, LEVEL_ARG, LAPS_ARG, CARS_ARG, MODE_ARG, AUTO_MODE, DEV_MODE, SHOT_MODE } from './config.js';

let pendingResults = null;
let afterRace = null;

export function boot() {
  initHud();
  wire();

  if (SHOT_MODE) { stageShot(); return; }

  if (START_ARG === 'race' || TRACK_ARG) {
    beginEvent(quickEvent({
      track: TRACK_ARG || undefined,
      laps: LAPS_ARG || undefined,
      cars: CARS_ARG || undefined,
      mode: MODE_ARG || 'quick',
    }));
    return;
  }
  if (START_ARG === 'story') { goto('story'); return; }
  if (START_ARG === 'garage') { goto('garage'); return; }
  if (LEVEL_ARG) { startStoryLevel(parseInt(LEVEL_ARG, 10) || 1); return; }

  goto('title');
}

// ?shot=1 — drive the pack around for a few seconds with the AI, then drop the
// UI so a headless browser can grab a clean frame for the project thumbnail.
function stageShot() {
  profile.tutorial.steer = true;
  profile.garage.loadout = ['slam', 'pitspin', 'hooksaw'];
  profile.garage.skills = profile.garage.skills.concat(['pitspin', 'hooksaw']);
  beginEvent(quickEvent({ track: TRACK_ARG || 'circus', cars: 8, laps: 3 }));
  if (state.player) state.player.autoDrive = true;
  const at = parseFloat(new URLSearchParams(location.search).get('at') || '0') || 11;
  const iv = setInterval(() => {
    if (state.phase !== 'racing' || state.raceTime < at) return;
    clearInterval(iv);
    showHud(false);
    const pad = document.getElementById('btn-pad');
    if (pad) pad.classList.add('hidden');
    const pause = document.getElementById('btn-pause');
    if (pause) pause.classList.remove('show');
    window.__shotReady = true;
  }, 100);
}

function wire() {
  on('nav', ({ to, arg }) => goto(to, arg));
  on('race:begin', (ev) => beginEvent(ev));
  on('story:play', ({ level }) => startStoryLevel(level));
  on('race:done', (results) => onRaceDone(results));
  on('chest:open', ({ tier }) => openChest(tier));
  on('input:pause', () => togglePause());
  on('replay:skip', () => {
    stopPlayback();
    menus.showReplayOverlay(false);
    state.screen = 'results';
    menus.renderResults(pendingResults);
    menus.showScreen();
  });
  on('replay:again', (r) => {
    if (!r || !r.highlights || !r.highlights.length) return;
    state.screen = 'replay';
    menus.hideScreen();
    menus.showReplayOverlay(true);
    playHighlights(r.highlights, () => {
      menus.showReplayOverlay(false);
      state.screen = 'results';
      menus.renderResults(pendingResults);
      menus.showScreen();
    });
  });

  const pause = $('btn-pause');
  if (pause) pause.addEventListener('click', () => togglePause());
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export function goto(screen, arg) {
  if (state.screen === 'race' && screen !== 'race') {
    teardownRace();
    showHud(false);
    document.getElementById('btn-pause').classList.remove('show');
  }
  state.screen = screen;
  state.paused = false;
  clearInput();

  switch (screen) {
    case 'title': menus.renderTitle(); playMusic('menu'); break;
    case 'story': menus.renderStory(); playMusic('menu'); break;
    case 'quick': menus.renderQuick(); playMusic('menu'); break;
    case 'events': menus.renderEvents(); playMusic('menu'); break;
    case 'garage': menus.renderGarage(arg); playMusic('menu'); break;
    case 'ladder': menus.renderLadder(); break;
    case 'settings': menus.renderSettings(); break;
    case 'stats': menus.renderStats(); break;
    case 'results': menus.renderResults(pendingResults); break;
    case 'chests': menus.renderChestQueue(profile.chests); break;
    case 'race': menus.hideScreen(); break;
    default: menus.renderTitle();
  }
  if (screen !== 'race') menus.showScreen();
}

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------
export function beginEvent(ev) {
  if (!ev) return;
  menus.hideScreen();
  state.screen = 'race';
  afterRace = ev.mode === 'story' ? 'story' : ev.mode === 'event' ? 'events' : 'quick';
  startRace(ev);
  showHud(true);
  document.getElementById('btn-pause').classList.add('show');
  playMusic('race');
  banner('GET READY', 'plain', 1.4);
  // ?auto and ?shot are unattended hooks — nothing may block the race.
  if (!profile.tutorial.steer && !AUTO_MODE && !SHOT_MODE) showTutorial();
}

// The core rule of this game is not guessable from the buttons, so it gets said
// out loud exactly once, on the grid, with the race paused behind it.
function showTutorial() {
  profile.tutorial.steer = true;
  saveProfile(true);
  state.paused = true;
  menus.popup('HOW THIS WORKS', `
    <p><b>DRIVE:</b> hold anywhere on the left of the screen and slide to steer.
    Pull your thumb down to brake and get the back out. The throttle looks after itself,
    and if you get knocked sideways the car straightens itself back up.</p>
    <p><b>🔥 BOOST</b> spends one nitro. <b>💥 ATTACK</b> fires whichever dirty trick you have
    equipped that is loaded and has somebody in range.</p>
    <p><b>THE RULE:</b> hitting people with your car is completely legal — it is a free-for-all.
    Using the <i>equipment</i> is not. But a trick used from right alongside somebody looks
    exactly like a racing incident, and a trick used from the other side of the circuit looks
    like exactly what it is. The attack button tells you which one it will be before you press it.</p>
    <p><b>👁 STEWARDS</b> fills up when you are seen. Fill it and they open an investigation.
    <b>📣 CROWD</b> fills up when you do something worth watching — and a crowd that is enjoying
    itself will talk the stewards out of the fine.</p>
    <p>Watch for the red <b>ON AIR</b> light. The cameras do not all point at you all the time.</p>
  `, [{
    label: "GO RACING", primary: true, act: () => {
      menus.closePopup();
      state.paused = false;
    },
  }]);
}

export function startStoryLevel(level) {
  const n = clamp(level, 1, storyLength());
  const ev = levelEvent(n);
  const cine = cutsceneFor(n, 'pre');
  const go = () => beginEvent(ev);
  if (cine && !profile.story.seenCine.includes(cine.id)) {
    profile.story.seenCine.push(cine.id);
    saveProfile();
    runCutscene(cine, go);
  } else {
    go();
  }
}

function runCutscene(script, done) {
  menus.hideScreen();
  state.screen = 'cine';
  playCutscene(script, () => {
    state.screen = 'race';
    done && done();
  });
}

function onRaceDone(results) {
  pendingResults = results;
  const ev = results.event || {};

  // --- money -------------------------------------------------------------
  const net = results.net;
  addMoney(net);
  profile.stats.races++;
  profile.stats.laps += results.laps;
  if (results.position === 1) profile.stats.wins++;
  if (results.position <= 3) profile.stats.podiums++;
  if (results.retired) profile.stats.dnf++;
  profile.stats.fouls += results.fouls;
  profile.stats.cleanFouls += results.cleanFouls;
  profile.stats.investigations += results.investigations;
  profile.stats.finesPaid += results.fines;
  profile.stats.wrecksCaused += results.wrecksCaused;
  profile.stats.partsOff += results.partsKnockedOff;
  profile.stats.bestAir = Math.max(profile.stats.bestAir, results.bestAir || 0);
  profile.stats.driftTime += results.driftTime || 0;
  profile.fame += Math.round(results.hype);

  // --- ladder ------------------------------------------------------------
  if (ev.mode === 'quick' || ev.mode === 'event') {
    profile.quick.races++;
    if (results.position === 1) { profile.quick.wins++; profile.quick.streak++; }
    else profile.quick.streak = 0;
    profile.quick.bestStreak = Math.max(profile.quick.bestStreak, profile.quick.streak);
    if (results.position <= 3) profile.quick.podiums++;
    profile.quick.best = Math.min(profile.quick.best, results.position);
    results.rankBefore = profile.rank;
    results.rankAfter = applyLadder(results.position, results.fieldSize, ev.purseTier || 1);
  }

  // --- objectives / progression -------------------------------------------
  if (ev.mode === 'story') {
    const pass = checkObjective(ev, results);
    results.objectivePassed = pass;
    results.objective = ev.objective;
    if (pass) {
      const prev = profile.story.cleared[ev.level];
      profile.story.cleared[ev.level] = Math.max(prev || 0, results.position === 1 ? 3 : results.position <= 3 ? 2 : 1);
      if (profile.story.level <= ev.level) profile.story.level = Math.min(storyLength(), ev.level + 1);
      if (ev.chestOnClear && !prev) grantChest(ev.chestOnClear);
    }
  } else if (ev.mode === 'event') {
    const pass = checkObjective(ev, results);
    results.objectivePassed = pass;
    results.objective = ev.objective;
    if (pass && !profile.events.cleared[ev.id]) {
      profile.events.cleared[ev.id] = true;
      if (ev.chestOnClear) grantChest(ev.chestOnClear);
    }
  }

  // Crates go straight into the profile, so quitting to the menu with three
  // unopened crates does not quietly throw them away.
  const before = profile.chests.length;
  for (const t of results.chests || []) grantChest(t);
  // A podium always pays a crate — the loop has to keep feeding the garage.
  if (results.position <= 3 && ev.mode !== 'story') grantChest(results.position === 1 ? 'parts' : 'scrap');
  results.crates = profile.chests.length - before;

  saveProfile(true);
  state.screen = 'results';
  showHud(false);

  // Roll the highlights first, then the results card — and if that was the last
  // race of the season, the closing scene comes before either of them.
  const showResults = () => { menus.renderResults(pendingResults); menus.showScreen(); };
  const finale = ev.mode === 'story' && ev.level === storyLength() && results.objectivePassed
    ? cutsceneFor(ev.level, 'post') : null;
  if (finale && !profile.story.seenCine.includes(finale.id)) {
    profile.story.seenCine.push(finale.id);
    saveProfile(true);
    runCutscene(finale, () => { state.screen = 'results'; showResults(); });
    return;
  }
  if (profile.settings.highlights !== false && results.highlights && results.highlights.length) {
    state.screen = 'replay';
    menus.hideScreen();
    menus.showReplayOverlay(true);
    playHighlights(results.highlights, () => {
      menus.showReplayOverlay(false);
      state.screen = 'results';
      showResults();
    });
  } else {
    showResults();
  }
}

function checkObjective(ev, r) {
  const o = ev.objective;
  if (!o) return r.position <= (ev.targetPos || 3);
  switch (o.kind) {
    case 'win': return r.position === 1;
    case 'podium': return r.position <= 3;
    case 'top': return r.position <= (o.n || 3);
    case 'finish': return r.finished && !r.retired;
    case 'wreck': return r.wrecksCaused >= (o.n || 1) && r.position <= (o.pos || 8);
    case 'parts': return r.partsKnockedOff >= (o.n || 3) && r.position <= (o.pos || 8);
    case 'clean': return r.position <= (o.pos || 3) && r.investigations === 0;
    case 'stealth': return r.position <= (o.pos || 3) && r.suspicionPeak < (o.max || 45);
    case 'hype': return r.hype >= (o.n || 60) && r.position <= (o.pos || 5);
    case 'survive': return !r.retired;
    case 'nofines': return r.fines === 0 && r.position <= (o.pos || 3);
    default: return r.position <= 3;
  }
}

// ---------------------------------------------------------------------------
// Chests
// ---------------------------------------------------------------------------
export function openChest(tierHint) {
  const tier = takeChest() || tierHint;
  if (!tier) { goto('garage'); return; }
  const loot = rollChest(tier, { parts: profile.garage.parts, skills: profile.garage.skills });
  let cash = 0;
  for (const item of loot.items) {
    if (item.kind === 'cash') cash += item.amount;
    else if (item.kind === 'part') ownPart(item.id);
    else if (item.kind === 'skill') ownSkill(item.id);
  }
  if (cash) addMoney(cash);
  profile.stats.chestsOpened++;
  saveProfile(true);
  sfx('chest');
  menus.renderChestResult(tier, loot, () => {
    if (profile.chests.length) goto('chests');
    else goto(afterRace === 'story' ? 'story' : afterRace === 'events' ? 'events' : 'garage');
  });
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------
export function togglePause() {
  if (state.screen !== 'race') return;
  state.paused = !state.paused;
  if (state.paused) {
    menus.renderPause();
    menus.showScreen();
    clearInput();
  } else {
    menus.hideScreen();
  }
}

export function quitRace() {
  state.paused = false;
  const back = afterRace || 'title';
  goto(back === 'story' ? 'story' : back === 'events' ? 'events' : 'quick');
}

export function restartRace() {
  const ev = state.event;
  state.paused = false;
  menus.hideScreen();
  if (ev) beginEvent(ev);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
export function update(dt) {
  if (cineActive()) { updateCine(dt); return; }
  if (state.screen === 'replay' || isReplaying()) { updateHighlightPlayback(dt); return; }
  if (state.screen === 'race' && !state.paused) {
    updateRace(dt);
    updateHud(dt);
  }
}

// Drawn once per frame, however many simulation steps that frame took.
export function present(dt) {
  render();
  updateAudio(dt);
}

export { pendingResults as lastResults };
