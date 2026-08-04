// Corvain scores every option as a dot product of content weights against nine state terms,
// adds seeded noise, and executes one action per tick. All weights live in content/rival.js.

import content from './content.js';
import { applyOp } from './tactics.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function terms(state) {
  const prof = content.rival.profile;
  const perShipShare = prof.share / prof.ships;
  const capacity = Math.max(0.01, state.rival.ships * perShipShare);
  return {
    bias: 1,
    shareGap: state.share.player - state.share.rival,
    playerShare: state.share.player,
    cashNorm: state.rival.cash / 100000,
    idleShips: clamp(1 - state.share.rival / capacity, 0, 1),
    playerHeat: clamp(state.heat / content.balance.heat.threshold, 0, 1),
    weekNorm: state.week / 52,
    brandLocked: Object.values(state.locks).includes('player') ? 1 : 0,
    underCut: state.rival.undercutFor > 0 ? 1 : 0,
  };
}

export function score(option, t, mult) {
  let s = 0;
  for (const k of Object.keys(option.weights)) s += option.weights[k] * (t[k] ?? 0);
  return s * mult;
}

export function decide(state, rng) {
  const t = terms(state);
  const sc = content.rival.scoring;
  const mult = sc.moodMult[state.rival.mood] ?? 1;
  let best = null, bestScore = -Infinity;
  for (const opt of content.all('rivalOption')) {
    if ((state.rival.cooldowns[opt.id] || 0) > 0) continue;
    if (opt.requires?.cash != null && state.rival.cash < opt.requires.cash) continue;
    if (opt.cost > state.rival.cash) continue;
    const v = score(opt, t, opt.id === 'hold' ? 1 : mult) + sc.noise * rng.signed();
    if (v > bestScore) { bestScore = v; best = opt; }
  }
  if (!best || bestScore < content.rival.scoring.floor) best = content.get('rivalOption', 'hold');
  return best;
}

export function execute(state, option, emit) {
  const b = content.balance.rival;
  state.rival.cash -= option.cost;
  state.rival.cooldowns[option.id] = option.cooldown;
  state.rival.lastAction = option.id;

  for (const op of option.effect) {
    switch (op.op) {
      case 'lockBrand': state.locks[op.commodity] = 'rival'; break;
      case 'rivalShips': state.rival.ships = Math.max(1, state.rival.ships + op.delta); break;
      case 'rivalRep': state.rival.rep = clamp(state.rival.rep + op.delta, 0, 1); break;
      case 'ownCost': state.rival.costMult *= op.mult; break;
      case 'freightPrice':
        state.rival.undercutFor = b.effectWeeks;
        state.rival.freightMult = op.mult;
        break;
      case 'sharePull':
        state.rival.effects.push({ op, weeksLeft: b.effectWeeks });
        break;
      default:
        state.rival.effects.push({ op, weeksLeft: Infinity });
        break;
    }
  }
  if (option.id !== 'hold') emit({ t: 'rival', action: option.id, name: option.name, ships: state.rival.ships });
}

export function tickEffects(state) {
  if (state.rival.undercutFor > 0) state.rival.undercutFor -= 1;
  for (const k of Object.keys(state.rival.cooldowns)) {
    if (state.rival.cooldowns[k] > 0) state.rival.cooldowns[k] -= 1;
  }
  state.rival.effects = state.rival.effects.filter(e => (e.weeksLeft -= 1) > 0);
}

export function foldEffects(state, mods) {
  for (const e of state.rival.effects) applyOp(mods, e.op, 'rival');
}

export function earn(state, mods) {
  const b = content.balance.rival;
  const income = state.rival.ships * b.incomePerShip * (1 + (state.share.rival - content.rival.profile.share));
  const upkeep = state.rival.ships * b.upkeepPerShip * state.rival.costMult;
  state.rival.cash += income - upkeep + mods.rivalCash;
  if (state.rival.cash < b.woundedCash && state.rival.mood === 'steady') state.rival.mood = 'wounded';
  else if (state.share.player > b.aggressiveAt && state.rival.mood === 'steady') state.rival.mood = 'aggressive';
}

export default { terms, score, decide, execute, tickEffects, foldEffects, earn };
