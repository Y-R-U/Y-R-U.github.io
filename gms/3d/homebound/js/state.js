// Live run state. One mutable singleton every system reads. `game.js` owns the
// writes, with two documented exceptions it delegates to: `army.js` owns
// `state.troops` (because `applyEffect` hands troops/loss/mult/divide straight
// to it) and `enemies.js` owns `state.bossHp`/`state.bossMax`. Everything else
// asks over the bus. That rule is why six systems share one object without a race.

import { RUN, TIERS } from './config.js';

export const state = {
  phase: 'boot',        // boot | main | run | outro | home | store
  running: false,
  t: 0,                 // seconds since run start
  dist: 0,              // metres travelled this run
  level: null,          // the LevelDef currently loaded
  seed: 0,

  // the squad
  troops: RUN.startTroops,
  tier: 0,              // index into TIERS
  shield: 0,            // absorbs losses before men die
  x: 0,                 // leader's lateral position
  targetX: 0,
  z: 0,                 // leader's distance along the road

  // multipliers applied to every unit's output, from base upgrades + pickups
  dmgMul: 1,
  rateMul: 1,
  armour: 0,            // 0..0.9 fraction of incoming losses ignored
  powerups: {},         // id → seconds remaining

  // scoring
  cash: 0,
  kills: 0,
  peakTroops: 0,
  gatesTaken: 0,
  bestGate: 0,

  // the run's verdict
  result: null,         // null | 'win' | 'lose'
  bossHp: 0,
  bossMax: 0,

  // camera shake, written by anything, decayed by render.js
  shake: 0,
};

export function resetRunState(level, profile) {
  state.t = 0;
  state.dist = 0;
  state.level = level;
  state.seed = level?.seed || 0;
  state.troops = level?.startTroops ?? RUN.startTroops;
  state.tier = level?.startTier ?? 0;
  state.shield = 0;
  state.x = 0;
  state.targetX = 0;
  state.z = 0;
  state.dmgMul = 1;
  state.rateMul = 1;
  state.armour = 0;
  state.powerups = {};
  state.cash = 0;
  state.kills = 0;
  state.peakTroops = state.troops;
  state.gatesTaken = 0;
  state.bestGate = 0;
  state.result = null;
  state.bossHp = 0;
  state.bossMax = 0;
  state.shake = 0;
  if (profile) applyBaseUpgrades(profile);
  return state;
}

// Base upgrades are folded in once, at run start. Nothing during a run ever
// reads the profile — that keeps the autoplay backdrop on the main screen from
// having to care whose save it is running under.
export function applyBaseUpgrades(profile) {
  const up = profile?.upgrades || {};
  state.troops = Math.max(state.troops, 1 + (up.squad || 0));
  state.tier = Math.max(state.tier, Math.min(up.start || 0, TIERS.length - 1));
  state.dmgMul = 1 + (up.damage || 0) * 0.08;
  state.rateMul = 1 + (up.rate || 0) * 0.04;
  state.armour = Math.min(0.75, (up.armour || 0) * 0.05);
  state.peakTroops = state.troops;
}

export const tierDef = () => TIERS[Math.max(0, Math.min(TIERS.length - 1, state.tier))];

// One unit's damage per second, all multipliers folded in. combat.js scales by
// the number of men, capped at GUN.fireCap visible shooters.
export const unitDps = () => tierDef().dps * state.dmgMul;
export const squadDps = () => unitDps() * state.troops;
