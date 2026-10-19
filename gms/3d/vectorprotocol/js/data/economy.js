// EconomyDef — docs/ECONOMY.md explains every number. Balance-harness results override guesses.
import { SLOT_UNLOCKS } from './maps.js';
export const ECONOMY = {
  currencies: ['credits', 'scrap', 'chips', 'arena_tokens', 'event_marks'],
  start: { credits: 300, scrap: 0, chips: 0, units: [{ def: 'scrapper', level: 1 }, { def: 'gunner', level: 1 }], slots: 2 },
  xpCurve: { base: 100, growth: 1.08 },
  scrapXp: 1,
  levelCost: { creditsPerXp: 0.3 },
  levelCapByRank: [10, 20, 30, 40, 50, 60],
  startRank: { common: 0, rare: 1, epic: 2, legendary: 3 },
  maxRank: { common: 4, rare: 5, epic: 5, legendary: 5 }, // harness run 4: common cap 40 walled m6+
  rankUp: { shards: [14, 34, 54, 74, 94], credits: [700, 4000, 13500, 27000, 40000] }, // sim-3: slowed ~3× after the harness policy fix (smart finished in 6 h)
  dupeShards: { common: 10, rare: 10, epic: 10, legendary: 10 },
  abilityLevel: { max: 5, cost: { credits: [300, 1500, 5000, 12000], chips: [0, 3, 8, 20] }, capByRank: [1, 2, 3, 4, 5, 5] },
  slotUnlocks: SLOT_UNLOCKS,
  battleXp: { perLevel: 1.0 },
  replay: { rewardMult: 0.6 },
  lossXp: 0.25,
  // surplus shards (beyond what a unit still needs to reach max rank) → chips, per shard by rarity (sim-2)
  shardExchange: { to: 'chips', rate: { common: 1, rare: 1.5, epic: 2, legendary: 3 } },
  companyXp: { perBattle: 10, base: 200, growth: 1.2 },
};
export default ECONOMY;
