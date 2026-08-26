// Extra game modes besides Story. Data-driven so js/modes/** can run any of them from
// these tables without a mode-specific code path per mode.

import { ENEMIES } from './enemies.js';

// ---------------------------------------------------------------------------- survival
// Endless waves over one arena length. `tiers` escalate by elapsed seconds, cycling
// the same act enemy pools gen_levels.mjs uses, with an hp/count multiplier per tier.
export const SURVIVAL = {
  id: 'survival', name: 'Survival', biome: 'farmland', length: 9000,
  startTimeOfDay: 'day', startWeather: 'clear',
  spawnIntervalStart: 3.2, spawnIntervalMin: 1.1, spawnIntervalDecayPerTier: 0.18,
  tiers: [
    { atSeconds: 0,   pool: ['scout', 'hut', 'flakLight'],                          hpMult: 1.0, countMult: 1.0 },
    { atSeconds: 60,  pool: ['bf109', 'bunker', 'flakLight'],                        hpMult: 1.15, countMult: 1.15 },
    { atSeconds: 120, pool: ['fw190', 'depot', 'flakHeavy'],                         hpMult: 1.3, countMult: 1.3 },
    { atSeconds: 180, pool: ['he111', 'halftrack', 'flakHeavy', 'sam_site'],          hpMult: 1.5, countMult: 1.45 },
    { atSeconds: 260, pool: ['proto_jet', 'mig_ghost', 'reactor', 'laser_turret'],    hpMult: 1.75, countMult: 1.6 },
    { atSeconds: 340, pool: ['jet_fighter', 'stealth_drone', 'aa_carrier'],           hpMult: 2.0, countMult: 1.8 },
    { atSeconds: 420, pool: ['cyber_interceptor', 'drone_swarm', 'mech_walker', 'plasma_nest'], hpMult: 2.4, countMult: 2.1 },
  ],
  // every full tier survived past the last one repeats the final tier with +12%/tier compounding
  overflowHpMultPerTier: 1.12, overflowCountMultPerTier: 1.06,
  scoreMoneyPerKill: 1.0, // straight moneyPerKill from tuning.ECON, no bonus multiplier
  bonusEvery: 90, bonusReward: { money: 400, xp: 90 }, // a balloon drop every 90s survived
};

// ------------------------------------------------------------------------- time attack
// Replays any unlocked story level against the clock. No stars, just a ledger.
export const TIME_ATTACK = {
  id: 'timeattack', name: 'Time Attack',
  unlockRule: 'levelCompletedOnce', // any level the player has beaten once in Story
  goldTimeFactor: 0.55,   // finish under 55% of the level's par -> gold
  silverTimeFactor: 0.8,  // under 80% -> silver
  reward: { gold: { money: 500, xp: 150 }, silver: { money: 250, xp: 80 }, none: { money: 100, xp: 30 } },
  ghostReplay: true,      // engine's call how; data only flags that a best-run ghost is expected
};

// --------------------------------------------------------------------------- boss rush
// All five bosses back to back, full refuel between, no hangar shopping mid-run.
export const BOSS_RUSH = {
  id: 'bossrush', name: 'Boss Rush',
  order: ['boss_ironduke', 'boss_leviathan', 'boss_blacksigma', 'boss_behemoth', 'boss_orbitalmother'],
  hpMultPerStage: 1.0,     // bosses are already tuned to their act; no extra scaling stage-to-stage
  refuelBetween: true, healBetween: 0.5, // heal to 50% hp between bosses, not full — it should hurt
  reward: { money: 30000, xp: 6000 }, // paid only on clearing all five
  partialReward: { moneyPerBossDown: 3000, xpPerBossDown: 500 },
};

// -------------------------------------------------------------------- weekly special event
// Deterministic from the ISO week number so every player sees the same event the same
// week with no server. `getWeeklyEvent(date)` is the only thing engine code should call.
export const WEEKLY_EVENTS = [
  { id: 'double_money',   name: 'Payday',        desc: 'All money rewards doubled.', moneyMult: 2.0 },
  { id: 'night_ops',      name: 'Night Ops',     desc: 'Every level forced to night/storm.', forceTimeOfDay: 'night', forceWeather: 'storm' },
  { id: 'flak_alley',     name: 'Flak Alley',    desc: 'Triple flak density, but flak pays double.', flakDensityMult: 3.0, flakMoneyMult: 2.0 },
  { id: 'balloon_rush',   name: 'Balloon Rush',  desc: 'Balloons everywhere, worth triple.', balloonDensityMult: 4.0, balloonMoneyMult: 3.0 },
  { id: 'ace_rematch',    name: 'Ace Rematch',   desc: 'The Baron shows up as an extra wave on every level.', extraRivalWave: true },
  { id: 'boss_gauntlet',  name: 'Boss Gauntlet', desc: 'This week is just Boss Rush with a bonus.', forcesMode: 'bossrush', bonusMoneyMult: 1.5 },
  // forcesMode is what makes survivalNoHeal reachable at all: without it the event resolves to a
  // Story base and the flag is dead data, since mode select routes to 'survival' OR 'event', never
  // both. Same shape as boss_gauntlet. (MODES agent, 2026-08-27 — manager may reverse.)
  { id: 'iron_economy',   name: 'Iron Economy',  desc: 'No repairs between waves in Survival. Higher payout.', forcesMode: 'survival', survivalNoHeal: true, moneyMult: 1.4 },
];

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getWeeklyEvent(date = new Date()) {
  const week = isoWeekNumber(date) + date.getFullYear() * 53;
  return WEEKLY_EVENTS[week % WEEKLY_EVENTS.length];
}

export const MODES = { survival: SURVIVAL, timeattack: TIME_ATTACK, bossrush: BOSS_RUSH };

// sanity: every enemy id referenced above must exist (checked at import time, not just
// by tools/gen_levels.mjs, since this file never flows through that validator).
for (const tier of SURVIVAL.tiers) {
  for (const id of tier.pool) {
    if (!ENEMIES[id]) throw new Error(`modes.js: SURVIVAL tier references unknown enemy id '${id}'`);
  }
}
