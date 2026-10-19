// Async PvP vs generated rival companies (sim arena.js). No energy: unlimited matches.
export const ARENA = {
  startRating: 1000, k: 32, rivalPower: [0.9, 1.2], lossReward: 0.3,
  xp: 260, // unit XP per arena win (×lossXp on a loss) — arena is a real XP source (D10)
  tiers: [
    { id: 'scrap', name: 'Scrap League', minRating: 0, reward: { arena_tokens: 4, credits: 100, scrap: 150 } },
    { id: 'bronze', name: 'Bronze', minRating: 1100, reward: { arena_tokens: 5, credits: 160, scrap: 250 } },
    { id: 'silver', name: 'Silver', minRating: 1250, reward: { arena_tokens: 6, credits: 260, scrap: 400 } },
    { id: 'gold', name: 'Gold', minRating: 1400, reward: { arena_tokens: 8, credits: 400, scrap: 600 } },
    { id: 'neon', name: 'Neon', minRating: 1600, reward: { arena_tokens: 11, credits: 600, scrap: 900 } },
    { id: 'vector', name: 'Vector Elite', minRating: 1850, reward: { arena_tokens: 15, credits: 880, scrap: 1300 } },
  ],
  seasonDays: 7,
  seasonRewards: { scrap: { chips: 20 }, bronze: { chips: 40 }, silver: { chips: 70 }, gold: { chips: 110 }, neon: { chips: 160 }, vector: { chips: 240 } },
  shop: [
    { id: 'shards_pick', name: '5 shards (any owned unit)', item: { shardsChoice: 5 }, cost: { arena_tokens: 120 } },
    { id: 'scrap_crate', name: 'Scrap crate', item: { scrap: 1500 }, cost: { arena_tokens: 40 } },
    { id: 'stim', name: 'Stim Pack', item: { buff: 'stim_pack', n: 1 }, cost: { arena_tokens: 15 } },
    { id: 'plating', name: 'Plating Kit', item: { buff: 'plating_kit', n: 1 }, cost: { arena_tokens: 15 } },
    { id: 'overclock_core', name: 'Overclock Core', item: { buff: 'overclock_core', n: 1 }, cost: { arena_tokens: 45 } },
    { id: 'chips', name: '20 chips', item: { chips: 20 }, cost: { arena_tokens: 80 } },
  ],
};
export default ARENA;
