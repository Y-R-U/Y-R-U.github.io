// The run orchestrator. Owns the frame order, the only writes to `state`, and
// the moment a run ends. Systems do not call each other — they are called from
// here, in this order, once each.

import { RUN, ROAD, TIERS, EFFECTS, ECON, GAMBLE, UPGRADE_BY_ID, AUTO_MODE, DEV_MODE } from './config.js';
import { state, resetRunState, tierDef } from './state.js';
import { emit, on } from './bus.js';
import { clamp, approach } from './utils.js';
import { P, addCash, clearLevel, bumpStats, unlock, save } from './save.js';

import { ctx, updateCamera, render } from './render.js';
import { updateInput, updateAutoThumb } from './input.js';
import { resetWorld, updateWorld, roadHalfAt } from './world.js';
import { resetArmy, updateArmy, addTroops, killTroops, setTier } from './army.js';
import { resetGates, updateGates, gateChoices } from './gates.js';
import { resetBarriers, updateBarriers } from './barriers.js';
import { resetEnemies, updateEnemies, enemyCount } from './enemies.js';
import { resetCombat, updateCombat } from './combat.js';
import { resetVfx, updateVfx } from './vfx.js';
import { resetHud, updateHud, showHud } from './hud.js';
import { updateMenus } from './menus.js';
import { updateHouse } from './house.js';
import { sfx, music } from './audio.js';

export const run = {
  active: false,
  autoplay: false,       // the main screen's backdrop uses the same pipeline
  level: null,
  endedAt: 0,
};

let outroT = 0;

// A cursor into the level's items for the kinds nobody else owns: bubbles,
// pickups and triggers. The list is sorted by z, so "what have we just passed"
// is a pointer that only ever moves forward — no scanning, no per-frame filter.
let itemCursor = 0;

// --------------------------------------------------------------------------
// Starting and ending
// --------------------------------------------------------------------------

export function startRun(level, { autoplay = false } = {}) {
  run.level = level;
  run.autoplay = autoplay;
  run.active = true;
  outroT = 0;

  resetRunState(level, autoplay ? null : P());
  state.phase = 'run';
  state.running = true;

  resetWorld(level);
  resetArmy(level);
  resetGates(level);
  resetBarriers(level);
  resetEnemies(level);
  resetCombat(level);
  resetVfx();
  itemCursor = 0;
  if (!autoplay) { resetHud(level); showHud(true); }

  emit('run:start', { level, autoplay });
  if (!autoplay) music('run');
  return level;
}

export function endRun(win) {
  if (!run.active) return;
  run.active = false;
  state.running = false;
  state.result = win ? 'win' : 'lose';
  run.endedAt = state.t;

  const stats = {
    win, level: run.level, autoplay: run.autoplay,
    troops: state.troops, peakTroops: state.peakTroops,
    kills: state.kills, cash: state.cash,
    dist: state.dist, gatesTaken: state.gatesTaken, bestGate: state.bestGate,
    stars: starsFor(),
  };

  if (!run.autoplay) {
    const reward = payout(stats);
    stats.reward = reward;
    if (reward > 0) addCash(reward, 'run');
    bumpStats({
      runs: 1, wins: win ? 1 : 0, losses: win ? 0 : 1,
      kills: state.kills, distance: Math.round(state.dist),
      bestSquad: state.peakTroops, bestGate: state.bestGate,
    });
    // Only story levels are "cleared". `levels.js:missionSpec` stamps chapter 5
    // on a mission, so recording one marked it cleared and every repeat after
    // that paid ECON.replayFactor — which is exactly backwards for the mode
    // whose whole job is to be farmed.
    if (win && run.level?.chapter && run.level.mode === 'story') {
      clearLevel(run.level.chapter, run.level.level, stats);
      advanceUnlocks();
    }
    sfx(win ? 'win' : 'lose');
    music('menu');
  }
  emit('run:end', stats);
  return stats;
}

// The unlock ladder. It lives here rather than in the UI because the order the
// buttons light up IS the shape of the game, and it must hold whether the
// player got there through story, a mission or a debug jump.
//
//   store   after c1l3 — the tutorial teaches gates first, then teaches that
//                        you are allowed to come back stronger
//   home    at the end of chapter 1 — the whole point of chapter 1
//   events  once the house has been seen, because chapter 2 is "go earn"
//   ch.3    when the debt is clear
//   ch.4    when contract work is done
function advanceUnlocks() {
  const p = P();
  const lvl = run.level || {};
  const { levelCount } = chaptersRef;
  if (lvl.chapter === 1 && lvl.level >= 3) unlock('store');
  if (lvl.chapter === 1 && levelCount && lvl.level >= levelCount(1)) {
    unlock('home');
    p.home.owned = true;
    p.home.lastCollect = Date.now();
    if (p.chapter < 2) p.chapter = 2;
    save(true);
  }
  if (lvl.chapter === 3 && levelCount && lvl.level >= levelCount(3)) {
    if (p.chapter < 4) { p.chapter = 4; p.level = 1; save(true); }
  }
}

// `army:count` is an announcement, not a request — so barriers.js saying "that
// body-check cost you 40 men" was landing nowhere and walking into a live wall
// was free. Map that one reason onto a real kill here. The guard stops army.js's
// own re-announcement from recursing.
let applyingBarrier = false;
on('army:count', (e) => {
  if (e.reason !== 'barrier' || e.delta >= 0 || applyingBarrier) return;
  applyingBarrier = true;
  try { killTroops(-e.delta, 'barrier'); } finally { applyingBarrier = false; }
});

// chapters.js is being written alongside this file; bind late so a missing
// export degrades to "no unlock" rather than a boot failure.
const chaptersRef = {};
import('./chapters.js').then((m) => Object.assign(chaptersRef, m)).catch(() => {});

on('debt:paid', ({ left }) => {
  if (left > 0) return;
  const p = P();
  unlock('events');
  if (p.chapter < 3) { p.chapter = 3; p.level = 1; save(true); }
});

on('unlock', ({ what }) => {
  if (what === 'home') unlock('events');
});

// Three stars is "you finished with an army", one is "you finished". The middle
// band is deliberately generous — stars are a nudge to replay, not a gate.
function starsFor() {
  if (state.result === 'lose') return 0;
  const peak = Math.max(1, state.peakTroops);
  const kept = state.troops / peak;
  return kept > 0.7 ? 3 : kept > 0.35 ? 2 : 1;
}

function payout(stats) {
  const lvl = run.level || {};
  const base = (lvl.reward ?? ECON.baseReward) + state.cash;
  const troopPay = state.peakTroops * ECON.perTroop;
  // Rate off the shop's own table, never a second copy of the number.
  const incomeMul = 1 + (P().upgrades.income || 0) * (UPGRADE_BY_ID.income?.per ?? 0);
  const repeat = lvl.mode === 'story' && lvl.chapter && P().cleared[`c${lvl.chapter}l${lvl.level}`]
    ? ECON.replayFactor : 1;
  const winMul = stats.win ? 1 : 0.25;   // losing still pays; a dead end is not a punishment
  return Math.round((base + troopPay) * incomeMul * repeat * winMul);
}

// Pause is a flag on the run, not a stop on the frame loop: the world still
// draws, the camera still eases, and the menus still animate over the top of a
// frozen battle. Stopping the loop makes a paused game look like a crash.
export function pauseRun(on = true) {
  if (!run.active) return false;
  state.running = !on;
  emit(on ? 'run:pause' : 'run:resume', { level: run.level });
  return on;
}
export const isPaused = () => run.active && !state.running;

// --------------------------------------------------------------------------
// Effects — the one place a gate, a pickup or a boss reward changes the squad
// --------------------------------------------------------------------------

export function applyEffect(effect, at) {
  if (!effect) return;
  // The `?` gate resolves to a real effect the moment you pass it, then falls
  // through to the switch below as whatever it rolled. Resolving here rather
  // than at spawn means the sign genuinely cannot be read ahead of time, which
  // is the entire product.
  if (effect.type === 'gamble') {
    const rolled = rollGamble();
    emit('hud:toast', { text: rolled.label, icon: rolled.good ? '🎲' : '💀' });
    sfx(rolled.good ? 'gate' : 'lose');
    applyEffect(rolled.effect, at);
    return;
  }
  const { type } = effect;
  let value = effect.value;
  const def = EFFECTS[type];

  switch (type) {
    case 'troops': addTroops(Math.round(value), 'gate'); break;
    case 'mult':   addTroops(Math.round(state.troops * (value - 1)), 'gate'); break;
    case 'loss':   killTroops(Math.round(value), 'trap'); break;
    case 'divide': killTroops(Math.round(state.troops * (1 - 1 / Math.max(1, value))), 'trap'); break;
    case 'tier':   promote(Math.max(1, Math.round(value || 1))); break;
    case 'weapon': state.dmgMul += 0.08 * value; state.rateMul += 0.02 * value; break;
    case 'cash':   state.cash += Math.round(value); break;
    case 'shield': state.shield += Math.round(value); break;
    case 'power':  state.powerups[effect.id || 'rapid'] = (state.powerups[effect.id || 'rapid'] || 0) + value; break;
    default: break;
  }
  state.gatesTaken++;
  if (def?.good && value > state.bestGate) state.bestGate = Math.round(value);
  emit('effect:apply', { type, value, at, good: def?.good !== false });
}

// Roll one `?` gate. Payouts that would be trivial late are scaled off the
// squad you actually have, so a `+8` reinforcement at level 2 is a doubling and
// at level 90 is still worth stopping for.
export function rollGamble() {
  let total = 0;
  for (const o of GAMBLE) total += o.w;
  let r = Math.random() * total;
  let pick = GAMBLE[GAMBLE.length - 1];
  for (const o of GAMBLE) { r -= o.w; if (r <= 0) { pick = o; break; } }

  let value = pick.value ?? 0;
  if (pick.scale) value = Math.max(pick.min || 1, Math.round(state.troops * pick.scale));
  if (pick.byLevel) value += pick.byLevel * (run.level?.level || 1);

  const good = EFFECTS[pick.type]?.good !== false;
  return { label: pick.label, good, effect: { type: pick.type, value, id: pick.id } };
}

// Promotion converts men into fewer, better men. That conversion is the entire
// reason a `▲` gate is a decision — take it with eight men and you have three.
export function promote(steps = 1) {
  const from = state.tier;
  const to = Math.min(TIERS.length - 1, from + steps);
  if (to === from) { addTroops(Math.round(state.troops * 0.15) + 2, 'gate'); return; }
  let n = state.troops;
  for (let i = from + 1; i <= to; i++) n = Math.max(1, Math.floor(n / TIERS[i].merge));
  state.tier = to;
  setTier(to);
  const prevCount = state.troops;
  state.troops = n;
  emit('army:tier', { tier: to, prev: from });
  emit('army:count', { count: n, delta: n - prevCount, reason: 'promote' });
  sfx('promote');
}

// --------------------------------------------------------------------------
// The frame
// --------------------------------------------------------------------------

export function updateGame(dt) {
  if (state.running) {
    state.t += dt;

    if (run.autoplay || AUTO_MODE) updateAutoThumb(dt, () => bestLane());
    else updateInput(dt);

    // Lateral: the leader chases targetX at a bounded rate, so a flick across
    // the screen is a fast slide and not a teleport.
    //
    // Clamped to the road's half-width AT THIS z, not the constant. A
    // `{kind:'narrow'}` pinched the geometry but not the player, so the squad
    // walked straight through the parapet and out over the water.
    const half = (roadHalfAt?.(state.z) ?? ROAD.halfW) || ROAD.halfW;
    const dx = clamp(state.targetX - state.x, -RUN.steerRate * dt, RUN.steerRate * dt);
    state.x = clamp(state.x + dx, -half, half);
    state.targetX = clamp(state.targetX, -half, half);

    // Forward: constant, except where the level says to hold station.
    const hold = state.bossMax > 0 && state.bossHp > 0;
    const v = hold ? 0 : RUN.speed;
    state.z += v * dt;
    state.dist = state.z;

    consumePassedItems();

    for (const k of Object.keys(state.powerups)) {
      state.powerups[k] -= dt;
      if (state.powerups[k] <= 0) delete state.powerups[k];
    }
  }

  updateMenus(dt);
  updateHouse(dt);
  updateWorld(dt);
  updateArmy(dt);
  updateGates(dt);
  updateBarriers(dt);
  updateEnemies(dt);
  updateCombat(dt);
  updateVfx(dt);
  updateCamera(dt);
  if (!run.autoplay) updateHud(dt);

  if (run.active && state.running) checkEnd();
  render();
}

// Bubbles fire on the way past; pickups need the leader to be near them in x.
// Anything else with a `kind` belongs to a system and is skipped here.
function consumePassedItems() {
  const items = run.level?.items;
  if (!items) return;
  while (itemCursor < items.length && items[itemCursor].z <= state.z) {
    const it = items[itemCursor++];
    if (it.kind === 'bubble') {
      if (!run.autoplay) emit('story:bubble', { who: it.who, text: it.text, ms: it.ms || 2600 });
    } else if (it.kind === 'pickup') {
      if (Math.abs(it.x - state.x) < 2.2) applyEffect(it.effect, { x: it.x, y: 1, z: it.z });
    } else if (it.kind === 'trigger') {
      emit('level:trigger', { id: it.id, action: it.action, z: it.z });
    }
  }
}

function checkEnd() {
  if (state.troops <= 0) { endRun(false); return; }
  const len = run.level?.length || 600;
  if (state.z >= len && enemyCount() <= 0) endRun(true);
}

// What the AI thumb aims at: the best-valued gate in the next window, or the
// gap in the enemy line if there is nothing to farm.
function bestLane() {
  const cs = gateChoices?.(state.z);
  if (cs && cs.length) {
    let best = cs[0];
    for (const c of cs) if ((c.score ?? 0) > (best.score ?? 0)) best = c;
    return best.x;
  }
  return Math.sin(state.z * 0.012) * ROAD.halfW * 0.6;
}

if (DEV_MODE) window.__hbGame = { run, state, startRun, endRun, applyEffect, promote };
