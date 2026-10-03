export const SEASONS = [
  {
    id: 'hollows-eve', name: "Hollow's Eve", emoji: '🎃', token: '🍬', tokenName: 'candy',
    from: [10, 1], to: [11, 2],
    world: 'oldtown',
    witching: { from: 18, to: 24, mult: 2 },
    peak: { month: 10, day: 31, mult: 3 },
    awayRate: 0.5, awayCapSec: 4 * 3600,
    lines: [
      { id: 'witchbrew', name: "Witch's Brew", emoji: '🧪', basePlot: 'lemonade', cost: 0, rate: 1, levelCost: 8, growth: 1.15, cycleSec: 2, boosts: [['🦇', 'Bat wings'], ['🕸️', 'Spider silk']] },
      { id: 'pumpkinpie', name: 'Pumpkin Pie Wagon', emoji: '🥧', basePlot: 'foodtruck', cost: 3e3, rate: 15, levelCost: 200, growth: 1.16, cycleSec: 3, boosts: [['🎃', 'Giant pumpkins'], ['🌶️', 'Spiced crust']] },
      { id: 'hauntedcuts', name: 'Haunted Haircuts', emoji: '👻', basePlot: 'barber', cost: 3e5, rate: 250, levelCost: 6e3, growth: 1.17, cycleSec: 4, boosts: [['💀', 'Skull combs'], ['🕯️', 'Candlelit mirrors']] },
    ],
    boostCost: [60, 3000],
    boostMult: [2, 3],
    milestones: [25, 50, 100],
    ranks: [
      { xp: 2e3, reward: { crate: 'basic' } },
      { xp: 1e6, reward: { keepsake: 'pumpkinhead' } },
      { xp: 2.5e7, reward: { tickets: 5 } },
      { xp: 3e8, reward: { keepsake: 'cobweb' } },
      { xp: 2.5e9, reward: { crate: 'silver' } },
      { xp: 6e9, reward: { keepsake: 'batfamiliar' } },
      { xp: 1.2e10, reward: { keepsake: 'lantern' } },
      { xp: 1.7e10, reward: { manager: 'm_cuppula' } },
      { xp: 2.3e10, reward: { crate: 'gold' } },
      { xp: 2.9e10, reward: { keepsake: 'broom' } },
      { xp: 3.5e10, reward: { keepsake: 'skullwatch' } },
      { xp: 4.1e10, reward: { keepsake: 'cape', title: 'Night of the Living Dead-Rich' } },
    ],
  },
];

export const KEEPSAKES = {
  pumpkinhead: { id: 'pumpkinhead', season: 'hollows-eve', name: 'Pumpkin Head', emoji: '🎃', power: 0.03, crossGame: true },
  cobweb: { id: 'cobweb', season: 'hollows-eve', name: 'Cobweb Bunting', emoji: '🕸️', power: 0.05, crossGame: true },
  batfamiliar: { id: 'batfamiliar', season: 'hollows-eve', name: 'Bat Familiar', emoji: '🦇', power: 0.04, crossGame: true },
  lantern: { id: 'lantern', season: 'hollows-eve', name: 'Candle Lantern', emoji: '🕯️', power: 0.05, crossGame: true },
  broom: { id: 'broom', season: 'hollows-eve', name: "Witch's Broom", emoji: '🧹', power: 0.06, crossGame: true },
  skullwatch: { id: 'skullwatch', season: 'hollows-eve', name: 'Skull Pocket Watch', emoji: '💀', power: 0.06, crossGame: true },
  cape: { id: 'cape', season: 'hollows-eve', name: 'Vampire Cape', emoji: '🧛', power: 0.1, crossGame: true },
};
export const KEEPSAKE_TARGET = { character: 1, line: 4, manager: 4 };
