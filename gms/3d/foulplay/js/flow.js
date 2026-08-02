// Screen routing and the game's state machine. Menus emit intentions on the
// bus; this is the only module that acts on them, which keeps the UI free of
// game logic and the game free of DOM.

import { state, resetRaceState } from './state.js';
import {
  profile, saveProfile, addMoney, applyLadder, grantChest, takeChest, ownPart, ownSkill,
  checkPrizes, ownsCar, markUp, levelOf, itemById, autoFitPart,
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
import { rollChest, crateAward, dupeValue } from './arsenal.js';
import { team, conditionMet, recordWin, trackUnlocked } from './progress.js';
import { titleRoundEvent, resolveRound, titleById, roundName } from './titles.js';
import { TRACK_DEFS } from './trackgen.js';
import { render, setEnvironment } from './render.js';
import { updateAudio, playMusic } from './audio.js';
import { clearInput } from './input.js';
import { emit, on } from './bus.js';
import { $, clamp, pick } from './utils.js';
import { START_ARG, TRACK_ARG, LEVEL_ARG, LAPS_ARG, CARS_ARG, MODE_ARG, AUTO_MODE, DEV_MODE, SHOT_MODE, STEWARD } from './config.js';
import { previewAttack } from './attacks.js';

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
  on('chest:openAll', () => openAllChests());
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
  menus.hideCallout();
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
  // The grid used to stop dead here for a 230-word modal. All it says now is
  // the one thing needed in the next four seconds, under the thumb that has to
  // do it; the rest is taught where it happens (teach()) and the long version
  // waits in SETTINGS ▸ HOW THIS WORKS.
  const firstRace = !profile.tutorial.steer && !AUTO_MODE && !SHOT_MODE;
  menus.armSteerHint(firstRace);
  if (firstRace) { profile.tutorial.steer = true; saveProfile(true); }
  menus.hideCallout();
  teachT = 0;
  teachHold = 5;
}

// ---------------------------------------------------------------------------
// Teaching, at the moment the thing being taught starts to matter
// ---------------------------------------------------------------------------
// Each of these fires once per career off `profile.tutorial`, as a callout that
// does not pause anything and goes away on its own.
let teachT = 0;
let teachHold = 0;

function teach(dt) {
  if (AUTO_MODE || SHOT_MODE || state.attract || state.paused) return;
  if (profile.tutorial.attack && profile.tutorial.steward) return;
  const p = state.player;
  if (!p || state.phase !== 'racing') return;
  // One thing at a time. The first few seconds belong to DRAG TO STEER, and two
  // callouts on top of each other teach neither.
  teachHold -= dt;
  if (teachHold > 0) return;

  if (!profile.tutorial.steward && state.inCameraCone) {
    profile.tutorial.steward = true;
    saveProfile();
    teachHold = 9;
    menus.callout('🔴 ON AIR',
      'A broadcast camera is live on this stretch. Anything it films counts double with the stewards — the cameras sweep, so there is always a window.');
    return;
  }

  teachT -= dt;
  if (teachT > 0 || profile.tutorial.attack) return;
  teachT = 0.25;
  const pv = previewAttack(p, state.cars);
  if (!pv || !pv.ready || !pv.target || pv.dist > STEWARD.contactRange) return;
  profile.tutorial.attack = true;
  saveProfile();
  teachHold = 9;
  menus.callout('💥 CLOSE IN, THEN CHEAT',
    'From this close a dirty trick reads as a racing incident. From across the circuit it reads as exactly what it is — the attack button says which before you press it.');
  menus.pulseAttackButton();
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
  // Deliberately the average, not the peak `results.hype` now carries: a
  // lifetime total that suddenly banks ~100 a race would not line up with the
  // number already in anyone's save.
  profile.fame += Math.round(results.hypeAvg || 0);

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
    const out = resolveRound(ev.titleId, pass, ev.round);
    results.titleOutcome = out;
    results.titleName = titleById(ev.titleId).name;
    // Only when the round actually resolved — otherwise re-running a settled
    // round from RACE AGAIN pays its crate again, every time.
    if (pass && out && ev.chestOnClear) grantChest(ev.chestOnClear);
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
  menus.hideCallout();

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
// Opening a crate produces one of three things and the screen has to be able to
// say all three at once: money, a thing you did not have, and a mark on a thing
// you did. A run of ten crates piles up a dozen cash rows and four copies of the
// same part, so the results are ACCUMULATED — one money line, one line per item
// — and a duplicate is a mark rather than a consolation payout.
function newHaul() {
  return { crates: 0, tiers: [], cash: 0, fresh: [], marks: {}, best: 'scrap', pity: false };
}

const TIER_ORDER = ['scrap', 'parts', 'contra', 'sponsor'];

function openInto(haul, tierHint) {
  const tier = takeChest() || tierHint;
  if (!tier) return false;
  const owned = { parts: profile.garage.parts, skills: profile.garage.skills };
  const pity = (profile.dryCrates || 0) >= 9;
  const loot = rollChest(tier, owned, team().crateLuck, pity);
  let gotSomething = false;

  haul.crates++;
  haul.tiers.push(tier);
  if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(haul.best)) haul.best = tier;

  for (const item of loot.items) {
    if (item.pity) haul.pity = true;
    if (item.kind === 'cash') { haul.cash += item.amount; continue; }
    const isPart = item.kind === 'part';
    const got = isPart ? ownPart(item.id) : ownSkill(item.id);
    if (got) {
      // New. Note that `owned` above is a live reference into the profile, so
      // the next pick in this same crate already knows we have it.
      // A part that beats what is bolted on goes straight on the car — winning
      // something and driving off without it is the loop stopping one step short.
      haul.fresh.push({ kind: item.kind, id: item.id, fit: isPart ? autoFitPart(item.id) : null });
      gotSomething = true;
      continue;
    }
    // A second copy of something you own is a mark on it — the crate hands over
    // the upgrade you would otherwise have paid for. Once it is at the top mark
    // there is nowhere left to put it and it pays out instead.
    const n = markUp(item.id, 1);
    if (n) {
      const m = haul.marks[item.id] || (haul.marks[item.id] = {
        kind: item.kind, id: item.id, n: 0, from: levelOf(item.id) - n,
      });
      m.n += n;
      m.to = levelOf(item.id);
      // Marks move a part up the same ladder a tier does, so a racked part can
      // overtake the fitted one without ever being new.
      if (isPart) m.fit = autoFitPart(item.id) || m.fit;
      gotSomething = true;
    } else {
      haul.cash += dupeValue(itemById(item.id));
    }
  }

  profile.dryCrates = gotSomething ? 0 : (profile.dryCrates || 0) + 1;
  profile.stats.chestsOpened++;
  return true;
}

function finishHaul(haul) {
  if (haul.cash) addMoney(haul.cash);
  saveProfile(true);
  // The arpeggio belongs on the burst, not on the paint — renderChestResult
  // owns it now.
  menus.renderChestResult(haul, () => {
    if (profile.chests.length) goto('chests');
    else goto(afterRace === 'story' ? 'story' : afterRace === 'events' ? 'events' : 'garage');
  });
}

export function openChest(tierHint) {
  const haul = newHaul();
  if (!openInto(haul, tierHint)) { goto('garage'); return; }
  finishHaul(haul);
}

// The whole queue in one go. Six crates after a good event is six identical
// taps on CRACK IT OPEN and six screens that each say $900, which is not a
// reward, it is a chore.
export function openAllChests() {
  const haul = newHaul();
  let guard = 0;
  while (profile.chests.length && guard++ < 200) {
    // `continue`, not `break`: takeChest always shifts, so a junk entry from an
    // old save cannot loop here, and must not strand the rest of the pile.
    if (!openInto(haul)) continue;
  }
  if (!haul.crates) { goto('garage'); return; }
  finishHaul(haul);
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------
// The phone went to the home screen mid-race. Stop the world, and put the
// ordinary pause screen up so the player chooses when to go again rather than
// being dropped back into a corner at 250km/h. Deliberately NOT togglePause:
// a race that was already paused has to stay paused, and toggling would let it
// go the moment they came back.
export function pauseForBlur() {
  if (state.screen !== 'race' || state.paused) return;
  if (AUTO_MODE || SHOT_MODE) return;      // a harness has no home screen
  state.paused = true;
  menus.renderPause();
  menus.showScreen();
  clearInput();
}

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
    teach(dt);
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
