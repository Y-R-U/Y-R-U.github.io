// Boot + match lifecycle + main loop.

import * as THREE from 'three';
import {
  MURDER, MURDER_PACE, PERSONALITIES, ACCENTS, NAME_POOL, TANK,
  DEFAULT_TANK_COUNT, SHOT_MODE, AUTO_MODE, NO_CLOUD, IS_TOUCH, SIM_SPEED,
} from './config.js';
import {
  loadCareer, loadSettings, saveSettings, beginMatch, noteKill, noteBounty, recordMatch,
  matchRecorded, resetCareer, modeFor, nemesis, CAREER_KEY, SETTINGS_KEY,
} from './career.js';
import {
  $, rand, clamp, damp, fmtTime, pickRandom, seedLayout, srand, sshuffled, todayKey, hashStr,
} from './utils.js';
import { state, aliveTanks } from './state.js';
import { AudioFX } from './audio.js';
import {
  initWorld, camera, composer, renderer, updateEnvironment, setQuality, qualityLevel, QUALITY,
  obstacles,
} from './world.js';
import { initMurder, setMurderVisual, spawnSwoop } from './murder.js';
import { initParticles, updateParticles, clearParticles, spawnExplosion } from './particles.js';
import { Tank, updateAllTanks } from './tanks.js';
import { initCombat, updateCombat, clearBolts } from './combat.js';
import { AIController } from './ai.js';
import { PlayerController, aim, updateLockRing } from './player.js';
import { initInput, input } from './input.js';
import { updatePickups, clearPickups } from './pickups.js';
import * as ui from './ui.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initWorld($('game-container'));
initMurder();
initParticles();
initCombat();

// Settings load (and the one-time legacy f5mr_* migration inside it) must run
// here, before the cloud import below — see the note in career.js.
const settings = loadSettings();
state.tankCount = clamp(parseInt(settings.mode, 10) || DEFAULT_TANK_COUNT, 2, 16);
state.playerName = settings.name || pickRandom(NAME_POOL);
if (!settings.name) saveSettings({ name: state.playerName });   // first-run callsign sticks
aim.autoFire = !!settings.autoFire;

// Optional br8t account layer — mirrors the career + settings keys to the
// player's account so progress follows them between devices. Deliberately
// fire-and-forget: if it can't load (offline, blocked, opened from file://) the
// import throws, we swallow it, and the game plays on with a purely local save
// with nothing missing but the avatar. Skipped under the staged/automated
// modes so test runs stay hermetic.
let cloudApi = null;
if (!NO_CLOUD) {
  import('./cloud.js').then((m) => { cloudApi = m; }).catch(() => { /* play on locally */ });
}

function toggleMute() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  ui.updateMuteBtn(AudioFX.muted);
}

initInput(renderer.domElement, { onToggleMute: toggleMute });

let lastWasDaily = false;

ui.initUI({
  onPlay: () => startMatch(false),
  onDaily: () => startMatch(true),
  onRetry: () => startMatch(lastWasDaily),
  onMenu: () => goToTitle(),
  onSpectate: () => {
    ui.showSpectateBar(state.spectating ? state.spectating.name : '—',
      state.player ? state.player.place : '—');
  },
  onNameSave: (name) => {
    state.playerName = name;
    saveSettings({ name });
    ui.setPlayerNameUI(name);
    if (state.player) {
      state.player.name = name;
      ui.renameTag(state.player, name);
      ui.updateLeaderboard();
    }
  },
  onModeChange: (count) => {
    state.tankCount = count;
    saveSettings({ mode: count });
    ui.updateCareerStrip(loadCareer(), modeFor(count).id);
  },
  onToggleMute: toggleMute,
  onToggleAutoFire: () => {
    aim.autoFire = !aim.autoFire;
    saveSettings({ autoFire: aim.autoFire });
    ui.setAutoFireUI(aim.autoFire);
  },
  onCareer: () => ui.openCareerPanel(loadCareer(), modeFor(state.tankCount).id),
});

ui.setPlayerNameUI(state.playerName);
ui.selectModePill(state.tankCount);
ui.updateMuteBtn(AudioFX.muted);
ui.setAutoFireUI(aim.autoFire);
ui.updateCareerStrip(loadCareer(), modeFor(state.tankCount).id);
ui.updateDailyUI(settings.daily, todayKey());

// ---------------------------------------------------------------------------
// Adaptive quality (touch devices): sample fps early in the first match and
// step the render tier down if the phone can't hold ~45 fps. The decision is
// remembered per device and never synced.
// ---------------------------------------------------------------------------

const QUALITY_KEY = 'f5mr.quality.v1';
const probe = { done: !IS_TOUCH, wait: 1.5, frames: 0, time: 0, fake: 0 };
try {
  const q = JSON.parse(localStorage.getItem(QUALITY_KEY) || 'null');
  if (q && Number.isFinite(q.level)) {
    setQuality(q.level);
    probe.done = true;
  }
} catch { /* storage blocked: probe again next visit */ }

function rememberQuality() {
  try { localStorage.setItem(QUALITY_KEY, JSON.stringify({ level: qualityLevel })); } catch {}
}

function updateQualityProbe(rawDt) {
  if (probe.done || state.phase !== 'playing') return;
  if (probe.wait > 0) { probe.wait -= rawDt; return; }
  probe.frames++;
  probe.time += rawDt;
  if (probe.time < 3) return;
  const fps = probe.fake || probe.frames / probe.time;
  probe.frames = 0;
  probe.time = 0;
  probe.wait = 1;
  if (fps < 45 && qualityLevel < QUALITY.length - 1) {
    setQuality(qualityLevel + 1);
    ui.callout(QUALITY[qualityLevel].bloom ? 'GRAPHICS EASED FOR SMOOTHER PLAY'
      : 'GLOW OFF FOR SMOOTHER PLAY', '#b9a48a', 'quality');
    rememberQuality();   // keep the step even if the next sample never comes
    if (qualityLevel < QUALITY.length - 1) return;   // sample again at the new tier
  }
  probe.done = true;
  rememberQuality();
}

// ---------------------------------------------------------------------------
// Match setup / teardown
// ---------------------------------------------------------------------------

let countdownShown = -1;
let lbTimer = 0;
let fireworkTimer = 0;
let nemesisTank = null;

function clearMatch() {
  for (const t of state.tanks) t.dispose();
  state.tanks = [];
  state.alive.length = 0;
  state.player = null;
  state.spectating = null;
  state.winner = null;
  aim.target = null;
  nemesisTank = null;
  clearBolts();
  clearParticles();
  clearPickups();
}

function resetZone(count) {
  const pace = count ? MURDER_PACE[modeFor(count).id] : null;
  state.pace = pace || { graceTime: MURDER.graceTime, shrinkRate: MURDER.shrinkRate };
  state.zoneR = MURDER.startR;
  state.zoneShrinking = false;
  state.zoneTimer = state.pace.graceTime;
}

function pickNames(n, exclude) {
  const pool = sshuffled(NAME_POOL.filter((x) => x !== exclude));
  return pool.slice(0, n);
}

// Scattered spawn points: random spots in an annulus, clear of cover and at
// least `gap` apart (the gap relaxes if a crowded field can't fit).
function spawnPoints(count, maxR) {
  const pts = [];
  let gap = clamp(Math.sqrt((Math.PI * maxR * maxR) / count) * 0.85, 9, 26);
  for (let tries = 0; pts.length < count; tries++) {
    if (tries > 0 && tries % 300 === 0) gap *= 0.85;
    const a = srand(0, Math.PI * 2);
    const r = Math.sqrt(srand(0.12, 1)) * maxR;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + TANK.radius + 1.5)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    pts.push({ x, z });
  }
  return pts;
}

function spawnTanks(count, withPlayer, spawnR = 40, ring = false) {
  const aiCount = withPlayer ? count - 1 : count;
  const names = pickNames(aiCount, state.playerName);
  const accents = sshuffled(ACCENTS.slice(1)).slice(0, aiCount);
  const personalities = sshuffled(Object.values(PERSONALITIES));
  const pts = ring
    ? Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.PI / 2;
      return { x: Math.cos(a) * spawnR, z: Math.sin(a) * spawnR };
    })
    : spawnPoints(count, spawnR);

  for (let i = 0; i < count; i++) {
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
    tank.reset(pts[i].x, pts[i].z);
    // spawn facing roughly inward, but not all at the same point
    tank.yaw = tank.turretYaw = Math.atan2(pts[i].x, pts[i].z) + srand(-0.6, 0.6);
    tank.grp.rotation.y = tank.yaw;
    state.tanks.push(tank);
  }
  // first roam points only once every tank is placed (they avoid each other)
  for (const t of state.tanks) if (t.controller.newRoamPoint) t.controller.newRoamPoint();
  state.placeCounter = count;
}

// Nemesis bounty: the personality that has killed you most turns up tagged.
function tagNemesis() {
  const n = nemesis();
  const pers = n && PERSONALITIES[n.name];
  if (!pers || !state.player) return;
  const ais = state.tanks.filter((t) => !t.isPlayer);
  let t = ais.find((x) => x.personality === pers);
  if (!t && ais.length) {
    t = ais[0];
    t.personality = pers;
    t.controller = new AIController(t, pers);
  }
  if (!t) return;
  t.nemesis = true;
  nemesisTank = t;
}

// Career: count the player's kills as they land, so a streak can be measured.
// The tally lives in memory only until the results screen banks it.
state.hooks.onKill = (attacker, victim) => {
  if (state.phase !== 'playing' && state.phase !== 'spectate') return;
  if (!state.player || attacker !== state.player) return;
  noteKill(victim.name, victim.personality ? victim.personality.label : null,
    state.matchTime);
  if (victim.nemesis) {
    noteBounty();
    ui.callout('☠ NEMESIS DOWN · BOUNTY +250', '#ffd750', 'bounty');
  }
};

// "HUNTER is stalking you" — occasional, never spammy.
state.hooks.onStalk = (ai) => {
  if (state.phase !== 'playing' || !state.player || !state.player.alive || !ai.personality) return;
  if (state.time - (ai.stalkCalledT || -99) < 25) return;
  const p = ai.personality;
  if (ui.callout(`${p.glyph} ${p.label.toUpperCase()} ${ai.name} ${p.verb}`, ai.accentCss,
    'stalk', 8)) {
    ai.stalkCalledT = state.time;
  }
};

function startMatch(daily) {
  lastWasDaily = !!daily;
  const count = daily ? 10 : state.tankCount;
  state.daily = daily ? todayKey() : null;
  seedLayout(daily ? hashStr('f5mr-daily-' + state.daily) : null);
  clearMatch();
  resetZone(count);
  state.tankCount = count;
  spawnTanks(count, true);
  if (!AUTO_MODE && !daily) tagNemesis();   // the daily field stays identical for all
  beginMatch(count);
  state.phase = 'countdown';
  state.countdown = 3.8;
  state.matchTime = 0;
  countdownShown = -1;
  ui.showMatchHUD();
  ui.buildTags();
  ui.updateLeaderboard();
  ui.updateHUD();
  ui.setZoneStatus('');
  if (daily) ui.callout('DAILY FIELD · ' + state.daily, '#9dff4d', 'daily');
}

function goToTitle() {
  seedLayout(null);
  clearMatch();
  // a daily match borrowed royale's count; restore the player's own mode
  state.tankCount = clamp(parseInt(loadSettings().mode, 10) || DEFAULT_TANK_COUNT, 2, 16);
  state.daily = null;
  resetZone(0);
  ui.showTitle();
  ui.updateDailyUI(loadSettings().daily, todayKey());
  state.phase = 'title';
  spawnTanks(Math.min(8, Math.max(4, state.tankCount)), false);
  ui.updateLeaderboard();
}

function restartAttract() {
  clearMatch();
  resetZone(0);
  spawnTanks(8, false);
}

// ---------------------------------------------------------------------------
// The murder (zone) logic
// ---------------------------------------------------------------------------

function updateZone(dt) {
  if (SHOT_MODE) {
    setMurderVisual(state.zoneR, true, state.time, dt);
    return;
  }

  if (!state.zoneShrinking) {
    state.zoneTimer -= dt;
    if (state.zoneTimer <= 0) {
      state.zoneShrinking = true;
      if (state.phase === 'playing' || state.phase === 'spectate') {
        ui.showBanner('THE MURDER CLOSES IN', true);
        AudioFX.horn();
        AudioFX.caw(0.9, 0.8);
      }
    }
  } else {
    state.zoneR = Math.max(MURDER.minR, state.zoneR - state.pace.shrinkRate * dt);
  }
  setMurderVisual(state.zoneR, state.zoneShrinking, state.time, dt);

  // Peck damage outside the ring lands in ticks (same total dps), each with
  // one distinct cue — not a hit sound every frame. Backwards: a peck can kill,
  // and death removes the tank from the live list.
  const alive = aliveTanks();
  for (let i = alive.length - 1; i >= 0; i--) {
    const t = alive[i];
    if (Math.hypot(t.pos.x, t.pos.z) <= state.zoneR + 0.5) { t.peckT = 0; continue; }
    t.peckT += dt;
    if (t.peckT < MURDER.peckEvery) continue;
    t.peckT -= MURDER.peckEvery;
    if (t.warded) continue;
    if (t.isPlayer || t.pos.distanceToSquared(camera.position) < 60 * 60) {
      spawnSwoop(t.pos, t.isPlayer ? 2 : 1);
    }
    t.damage(MURDER.dps * MURDER.peckEvery, null, 'peck');
  }

  // HUD status
  let outside = false;
  if (state.phase === 'playing' && state.player && state.player.alive) {
    outside = Math.hypot(state.player.pos.x, state.player.pos.z) > state.zoneR + 0.5;
    if (outside && state.player.warded) {
      ui.setZoneStatus('CROW-WARD · ' + Math.ceil(state.player.buffs.ward) + 's', 'ward');
    } else if (outside) {
      ui.setZoneStatus('⚠ IN THE MURDER — GET INSIDE ⚠', 'danger');
    } else if (!state.zoneShrinking) {
      ui.setZoneStatus('MURDER IN ' + fmtTime(Math.max(0, state.zoneTimer)));
    } else if (state.zoneR > MURDER.minR) {
      ui.setZoneStatus('MURDER CLOSING');
    } else {
      ui.setZoneStatus('FINAL CIRCLE');
    }
  } else {
    ui.setZoneStatus('');
  }
  zoneOutside = outside;
}
let zoneOutside = false;

// ---------------------------------------------------------------------------
// Match end / spectate
// ---------------------------------------------------------------------------

// Bank the player's match into the career, exactly once, as the results screen
// goes up. Never called mid-match, and never from the attract loop.
function bankMatch(won) {
  if (SHOT_MODE || !state.player || matchRecorded()) return null;
  const p = state.player;
  const killer = won ? null : p.killedBy;
  const place = won ? 1 : p.place;
  const summary = recordMatch({
    tankCount: state.tankCount,
    place,
    kills: p.kills,
    timeAlive: state.matchTime,
    won,
    killerLabel: killer && killer.personality ? killer.personality.label : null,
    name: p.name,
  });
  if (state.daily) {
    const s = loadSettings();
    const d = s.daily && s.daily.date === state.daily ? { ...s.daily }
      : { date: state.daily, best: 0, plays: 0 };
    d.plays = (d.plays || 0) + 1;
    if (!d.best || place < d.best) d.best = place;
    saveSettings({ daily: d });
  }
  ui.updateCareerStrip(summary.career, summary.mode.id);
  // Counts the match towards the sign-in nudge; the account layer picks when.
  if (cloudApi && cloudApi.matchFinished) cloudApi.matchFinished();
  return summary;
}

function checkMatchEnd() {
  if (SHOT_MODE) return;
  const alive = aliveTanks();

  // player just died?
  if (state.phase === 'playing' && state.player && !state.player.alive) {
    state.phase = 'spectate';
    state.spectating = (state.player.lastAttacker && state.player.lastAttacker.alive)
      ? state.player.lastAttacker : alive[0] || null;
    AudioFX.dirge();
    const summary = bankMatch(false);
    ui.showDefeat({
      place: state.player.place,
      total: state.tankCount,
      kills: state.player.kills,
      time: fmtTime(state.matchTime),
      killer: state.player.killedBy ? state.player.killedBy.name : 'THE MURDER',
      summary,
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
      const summary = bankMatch(true);
      ui.showVictory({ kills: winner.kills, time: fmtTime(state.matchTime), summary });
    } else {
      state.phase = 'over';
      // The player is already dead here, so their match was banked on defeat.
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
  let best = null;
  for (const t of aliveTanks()) if (!best || t.kills > best.kills) best = t;
  state.spectating = best || state.spectating;
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
    // Portrait: higher and further back, looking closer to the tank, so the
    // player sits mid-screen (above the thumbs) and flanks stay in view.
    const portrait = camera.aspect < 1;
    const height = portrait ? 23 : 10;
    const back = portrait ? 18.5 : 14.5;
    const ahead = portrait ? 4 : 7;
    camGoal.set(
      fx + (isPlayer ? input.mouse.x * 1.6 : 0),
      height + (isPlayer ? input.mouse.y * 1.2 : 0),
      fz + back);
    camera.position.lerp(camGoal, damp(5, dt));
    camLook.set(fx, 2.2, fz - ahead);
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
    if (nemesisTank) {
      const p = nemesisTank.personality;
      ui.callout(`☠ NEMESIS ${p.glyph} ${p.label.toUpperCase()} ${nemesisTank.name} IS HERE · BOUNTY +250`,
        nemesisTank.accentCss, 'nemesis');
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

// One simulation step. ?speed=N runs N of these per rendered frame.
function step(dt) {
  state.time += dt;
  const phase = state.phase;

  if (phase === 'countdown') {
    updateCountdown(dt);
    updateAllTanks(dt, false);
    setMurderVisual(state.zoneR, false, state.time, dt);
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
        1.1, pickRandom([0xffc24d, 0xff2d8f, 0x86ff4d, 0x4df3ff]));
      }
    }

    // throttled leaderboard refresh (hp bars)
    lbTimer -= dt;
    if (lbTimer <= 0 && phase !== 'title') {
      lbTimer = 0.5;
      ui.updateLeaderboard();
    }
  }
  updateParticles(dt);
}

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);

  updateEnvironment(state.time);
  for (let i = 0; i < SIM_SPEED; i++) step(dt);

  const phase = state.phase;
  if (phase !== 'title' && phase !== 'countdown') {
    ui.updateHUD();
    ui.updateTags();
  }
  if (phase !== 'countdown') ui.updateArrows();
  ui.updateInsideArrow(zoneOutside && phase === 'playing');
  updateLockRing();
  updateQualityProbe(raw);

  updateCamera(dt);
  composer.render();
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

window.__state = state;   // debugging / test hook
window.__fx = { AudioFX, renderer, setQuality, probe, aim };   // test hooks
window.__career = {       // test hook: inspect / wipe the career save
  keys: { career: CAREER_KEY, settings: SETTINGS_KEY },
  load: loadCareer, settings: loadSettings, reset: resetCareer,
};

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('gl-lost').classList.remove('hidden');
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  $('gl-lost').classList.add('hidden');
});

if (SHOT_MODE) {
  // staged, photogenic frame for thumbnails: all-AI brawl in a tight ring
  clearMatch();
  state.zoneR = 26;
  state.zoneShrinking = false;
  state.zoneTimer = 9999;
  spawnTanks(10, false, 16, true);
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
window.__mrBooted = true;   // the inline boot watchdog in index.html checks this
