// The run orchestrator. Owns the frame order, the only writes to `state`, and
// the moment a run ends. Systems do not call each other — they are called from
// here, in this order, once each.

import { RUN, ROAD, TIERS, EFFECTS, ECON, AUTO_MODE, DEV_MODE } from './config.js';
import { state, resetRunState, tierDef } from './state.js';
import { emit, on } from './bus.js';
import { clamp, approach } from './utils.js';
import { P, addCash, clearLevel, bumpStats } from './save.js';

import { ctx, updateCamera, render } from './render.js';
import { updateInput, updateAutoThumb } from './input.js';
import { resetWorld, updateWorld } from './world.js';
import { resetArmy, updateArmy, addTroops, killTroops, setTier } from './army.js';
import { resetGates, updateGates, gateChoices } from './gates.js';
import { resetBarriers, updateBarriers } from './barriers.js';
import { resetEnemies, updateEnemies, enemyCount } from './enemies.js';
import { resetCombat, updateCombat } from './combat.js';
import { resetVfx, updateVfx } from './vfx.js';
import { resetHud, updateHud, showHud } from './hud.js';
import { sfx, music } from './audio.js';

export const run = {
  active: false,
  autoplay: false,       // the main screen's backdrop uses the same pipeline
  level: null,
  endedAt: 0,
};

let outroT = 0;

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
    win, level: run.level,
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
    if (win && run.level?.chapter) clearLevel(run.level.chapter, run.level.level, stats);
    sfx(win ? 'win' : 'lose');
    music('menu');
  }
  emit('run:end', stats);
  return stats;
}

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
  const incomeMul = 1 + (P().upgrades.income || 0) * 0.06;
  const repeat = lvl.chapter && P().cleared[`c${lvl.chapter}l${lvl.level}`] ? ECON.replayFactor : 1;
  const winMul = stats.win ? 1 : 0.25;   // losing still pays; a dead end is not a punishment
  return Math.round((base + troopPay) * incomeMul * repeat * winMul);
}

// --------------------------------------------------------------------------
// Effects — the one place a gate, a pickup or a boss reward changes the squad
// --------------------------------------------------------------------------

export function applyEffect(effect, at) {
  if (!effect) return;
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
    const dx = clamp(state.targetX - state.x, -RUN.steerRate * dt, RUN.steerRate * dt);
    state.x = clamp(state.x + dx, -ROAD.halfW, ROAD.halfW);

    // Forward: constant, except where the level says to hold station.
    const hold = state.bossMax > 0 && state.bossHp > 0;
    const v = hold ? 0 : RUN.speed;
    state.z += v * dt;
    state.dist = state.z;

    for (const k of Object.keys(state.powerups)) {
      state.powerups[k] -= dt;
      if (state.powerups[k] <= 0) delete state.powerups[k];
    }
  }

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
