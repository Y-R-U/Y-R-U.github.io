// Screen routing and the game's state machine. Menus emit intentions on the
// bus; this is the only module that acts on them, which keeps the UI free of
// game logic and the game free of DOM.

import { state, resetRaceState } from './state.js';
import {
  profile, saveProfile, addMoney, applyLadder, grantChest, takeChest, ownPart, ownSkill,
  checkPrizes, ownsCar,
} from './save.js';
import { startRace, updateRace, teardownRace, forceEnd } from './race.js';
import { updateHud, showHud, initHud, resetHud, banner } from './hud.js';
import {
  playHighlights, updateHighlightPlayback, isReplaying, stopPlayback,
  playSaved, stepClip, saveCurrentClip, clearHighlights,
} from './highlights.js';
import { playCutscene, updateCine, cineActive, stopCine } from './cine.js';
import * as menus from './menus.js';
import { levelEvent, cutsceneFor, storyLength, isLevelUnlocked } from './story.js';
import { eventById, quickEvent, dailyEvent } from './events.js';
import { rollChest, crateAward } from './arsenal.js';
import { team, conditionMet, recordWin, trackUnlocked } from './progress.js';
import { titleRoundEvent, resolveRound, titleById, roundName } from './titles.js';
import { TRACK_DEFS } from './trackgen.js';
import { render, setEnvironment } from './render.js';
import { updateAudio, playMusic, sfx } from './audio.js';
import { clearInput } from './input.js';
import { emit, on } from './bus.js';
import { $, clamp, pick } from './utils.js';
import { START_ARG, TRACK_ARG, LEVEL_ARG, LAPS_ARG, CARS_ARG, MODE_ARG, AUTO_MODE, DEV_MODE, SHOT_MODE } from './config.js';

let pendingResults = null;
let afterRace = null;
let activeTitle = null;

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

  on('replay:step', ({ dir }) => stepClip(dir));
  on('replay:keep', () => {
    if (saveCurrentClip()) banner('SAVED TO MEMORIES', 'good', 1.2);
  });

  on('title:race', ({ id }) => {
    const ev = titleRoundEvent(id);
    if (!ev) return;
    beginEvent(ev);
  });

  // A memory is a saved clip plus enough of the field to rebuild it. Watching
  // one spins up an empty race on the right circuit purely as a stage.
  on('memory:play', ({ index }) => {
    const mem = (profile.memories || [])[index];
    if (!mem) return;
    playSaved(mem, () => goto('career'));
  });

  const pause = $('btn-pause');
  if (pause) pause.addEventListener('click', () => togglePause());
}

// ---------------------------------------------------------------------------
// Attract mode — a real race, nobody driving, running behind the menus
// ---------------------------------------------------------------------------
// It is the same race code with the AI on the player's car and the HUD off,
// which is why it costs almost nothing to maintain. If the frame rate cannot
// carry it the loop switches itself off and remembers, so a slow phone quietly
// gets a still menu instead of a bad one.
const ATTRACT_SCREENS = new Set(['title', 'story', 'quick', 'events', 'titles', 'bracket', 'ladder']);
let attractWatch = 0;
let attractSlow = 0;

function attractAllowed() {
  return profile.settings.attract !== false && !SHOT_MODE && !AUTO_MODE;
}

function startAttract() {
  if (state.attract || !attractAllowed()) return;
  const open = TRACK_DEFS.filter((d) => trackUnlocked(d.id));
  const def = pick(open.length ? open : TRACK_DEFS);
  const ev = quickEvent({ track: def.id, cars: 6, laps: 40 });
  ev.attract = true;
  startRace(ev);
  state.attract = true;
  state.camMode = 'attract';
  attractWatch = 0;
  attractSlow = 0;
  for (const c of state.cars) c.autoDrive = true;
  // Nobody is going to watch a highlights reel of the menu, so stop recording
  // one — that is a ring buffer and a pile of event listeners for nothing.
  clearHighlights();
  showHud(false);
}

function stopAttract() {
  if (!state.attract) return;
  state.attract = false;
  teardownRace();
  state.camMode = 'chase';
}

// One cheap guard, deliberately hard to trip: five seconds of grace to warm up,
// then six seconds spent under twenty frames a second before we give up on it.
// A guard that fires on a single stutter is worse than no guard, because it
// takes away a feature the player asked for over a hiccup.
function watchAttract(dt) {
  if (!state.attract || DEV_MODE) return;
  attractWatch += dt;
  if (attractWatch < 5) return;
  if (dt > 1 / 20) attractSlow += dt; else attractSlow = Math.max(0, attractSlow - dt * 0.6);
  if (attractSlow > 6) {
    profile.settings.attract = false;
    saveProfile();
    stopAttract();
    menus.notify('The racing behind the menus was costing you frames, so it has been switched off. Settings will turn it back on.');
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export function goto(screen, arg) {
  if (state.screen === 'race' && screen !== 'race' && !state.attract) {
    teardownRace();
    showHud(false);
    document.getElementById('btn-pause').classList.remove('show');
  }
  state.screen = screen;
  state.paused = false;
  clearInput();

  // The browsing screens get a live race behind them; the ones with their own
  // 3D room do not, because two WebGL contexts fighting is a bad trade.
  if (ATTRACT_SCREENS.has(screen)) startAttract();
  else stopAttract();

  switch (screen) {
    case 'title': menus.renderTitle(); playMusic('menu'); break;
    case 'story': menus.renderStory(); playMusic('menu'); break;
    case 'quick': menus.renderQuick(); playMusic('menu'); break;
    case 'events': menus.renderEvents(); playMusic('menu'); break;
    case 'titles': menus.renderTitles(); playMusic('menu'); break;
    case 'bracket': menus.renderBracket(arg); playMusic('menu'); break;
    case 'garage': menus.renderGarage(arg); playMusic('menu'); break;
    case 'shop': menus.renderShop(arg); playMusic('menu'); break;
    case 'showroom': menus.renderShowroom(); playMusic('menu'); break;
    case 'career': menus.renderCareer(arg); playMusic('menu'); break;
    case 'ladder': menus.renderLadder(); break;
    case 'settings': menus.renderSettings(); break;
    case 'stats': menus.renderCareer('numbers'); break;
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
  stopAttract();
  menus.hideScreen();
  state.screen = 'race';
  afterRace = ev.mode === 'story' ? 'story'
    : ev.mode === 'event' ? 'events'
    : ev.mode === 'title' ? 'titles' : 'quick';
  activeTitle = ev.mode === 'title' ? ev.titleId : null;
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
  // The team takes its cut of the good news and softens the bad: a bigger
  // outfit negotiates better prizes and repairs its own cars cheaper.
  const tm = team();
  const teamCut = Math.round(results.prize * (tm.prize - 1));
  const repairSaved = Math.round(results.damageBill * (1 - tm.repair));
  results.teamBonus = teamCut;
  results.damageBill -= repairSaved;
  results.pickupCash = state.pickupCash || 0;
  results.net = results.prize + results.hypeBonus + teamCut + results.pickupCash
    - results.damageBill - results.fines;

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

  // --- the bookmaker -------------------------------------------------------
  // Settles on any ranked result, so you cannot park a bet and go and win an
  // easy story level with it.
  if (profile.bet && (ev.mode === 'quick' || ev.mode === 'event') && !ev.attract) {
    const bet = profile.bet;
    const won = betPaysOut(bet.id, results);
    results.bet = { ...bet, won, payout: won ? Math.round(bet.stake * bet.odds) : 0 };
    if (won) addMoney(results.bet.payout);
    profile.bet = null;
  }

  // --- what you actually won ----------------------------------------------
  // Recorded before anything reads it, because half the gates in the game are
  // phrased as "win at X" and the prize checker runs immediately after.
  if (results.position === 1) recordWin(ev.track, ev.mode === 'event' ? ev.id : null);

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
    if (pass) {
      recordWin(null, ev.id);
      if (!profile.events.cleared[ev.id]) {
        profile.events.cleared[ev.id] = true;
        if (ev.chestOnClear) grantChest(ev.chestOnClear);
      }
    }
  } else if (ev.mode === 'title') {
    const pass = checkObjective(ev, results);
    results.objectivePassed = pass;
    results.objective = ev.objective;
    const out = resolveRound(ev.titleId, pass);
    results.titleOutcome = out;
    results.titleName = titleById(ev.titleId).name;
    if (pass && ev.chestOnClear) grantChest(ev.chestOnClear);
    if (out && out.champion) {
      grantChest('sponsor');
      grantChest('sponsor');
      recordWin(null, 'title-' + ev.titleId);
    }
  }

  // Crates go straight into the profile, so quitting to the menu with three
  // unopened crates does not quietly throw them away.
  const before = profile.chests.length;
  for (const t of results.chests || []) grantChest(t);
  // The flag pays the crates now, by position: fourth or worse gets one, and a
  // winner gets four with the good one on top. It is the only reliable source
  // of them, which is what stops a lucky lap being worth a season of racing.
  if (!ev.attract) {
    for (const t of crateAward(results.position, ev.tier || 1)) grantChest(t);
  }
  results.crates = profile.chests.length - before;

  // Anything gated on "win this" is handed over the moment it becomes true.
  results.prizesWon = checkPrizes(conditionMet);

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

function betPaysOut(id, r) {
  switch (id) {
    case 'win': return r.position === 1;
    case 'podium': return r.position <= 3;
    case 'wreck': return r.wrecksCaused >= 3 && r.finished && !r.retired;
    case 'clean': return r.position <= 3 && r.investigations === 0;
    default: return false;
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
    // A bracket round is not about winning the race, it is about beating one
    // specific person in it. If they are not classified at all, you beat them.
    case 'beat': {
      const them = (r.classified || []).find((c) => c.name === o.name);
      if (!them) return !r.retired;
      return !r.retired && r.position < them.pos;
    }
    default: return r.position <= 3;
  }
}

// ---------------------------------------------------------------------------
// Chests
// ---------------------------------------------------------------------------
export function openChest(tierHint) {
  const tier = takeChest() || tierHint;
  if (!tier) { goto('garage'); return; }
  const owned = { parts: profile.garage.parts, skills: profile.garage.skills };
  const pity = (profile.dryCrates || 0) >= 9;
  const loot = rollChest(tier, owned, team().crateLuck, pity);
  let cash = 0;
  let gotSomething = false;
  for (const item of loot.items) {
    if (item.kind === 'cash') cash += item.amount;
    else if (item.kind === 'part') { ownPart(item.id); gotSomething = true; }
    else if (item.kind === 'skill') { ownSkill(item.id); gotSomething = true; }
  }
  profile.dryCrates = gotSomething ? 0 : (profile.dryCrates || 0) + 1;
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
    return;
  }
  // The menu backdrop is the same race loop with nobody at the wheel.
  if (state.attract) {
    updateRace(dt);
    watchAttract(dt);
  }
}

// Drawn once per frame, however many simulation steps that frame took.
export function present(dt) {
  render();
  updateAudio(dt);
}

export { pendingResults as lastResults };
