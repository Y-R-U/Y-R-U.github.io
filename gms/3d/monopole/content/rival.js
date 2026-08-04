// Corvain Drayage. Each tick the sim scores every option as a dot product of `weights` against
// the terms below, adds seeded noise, and executes the winner. Weights are the whole balance
// surface — tune these, never the scoring code.
//
// bias        1
// shareGap    player.share - rival.share, roughly -0.7..+0.5
// playerShare 0..1
// cashNorm    rival.cash / 100000
// idleShips   rival ships with no leg, / rival ships
// playerHeat  player.heat / heatThreshold, clamped 0..1
// weekNorm    week / 52
// brandLocked 1 while the player holds any exclusive brand lock, else 0
// underCut    1 if the rival already undercut freight in the last 4 weeks, else 0

export default Object.freeze([
  Object.freeze({
    id: 'expand_capacity',
    name: 'Order another hull',
    cost: 21000, cooldown: 6,
    requires: Object.freeze({ cash: 34000 }),
    weights: Object.freeze({
      bias: 0.30, shareGap: -0.55, playerShare: 0.40, cashNorm: 0.45,
      idleShips: -1.80, playerHeat: 0, weekNorm: -0.20, brandLocked: 0.10, underCut: 0,
    }),
    effect: Object.freeze([Object.freeze({ op: 'rivalShips', delta: 1 })]),
  }),

  Object.freeze({
    id: 'undercut_freight',
    name: 'Undercut freight',
    cost: 0, cooldown: 8,
    requires: Object.freeze({ cash: 8000 }),
    weights: Object.freeze({
      bias: 0.42, shareGap: 0.35, playerShare: 0.85, cashNorm: 0.25,
      idleShips: 0.30, playerHeat: 0, weekNorm: 2.40, brandLocked: 0.20, underCut: -0.70,
    }),
    effect: Object.freeze([
      Object.freeze({ op: 'freightPrice', mult: 0.88 }),
      Object.freeze({ op: 'sharePull', perWeek: -0.008 }),
    ]),
  }),

  Object.freeze({
    id: 'own_supply_deal',
    name: 'Sign its own supply deal',
    cost: 24000, cooldown: 10,
    requires: Object.freeze({ cash: 32000 }),
    weights: Object.freeze({
      bias: -0.10, shareGap: 0.60, playerShare: 0.50, cashNorm: 0.45,
      idleShips: 0, playerHeat: 0, weekNorm: 0.30, brandLocked: 1.10, underCut: 0.10,
    }),
    effect: Object.freeze([
      Object.freeze({ op: 'lockBrand', brand: 'harrow', commodity: 'filament', owner: 'rival' }),
      Object.freeze({ op: 'ownPrice', commodity: 'filament', mult: 1.12, owner: 'rival' }),
    ]),
  }),

  Object.freeze({
    id: 'buy_brand',
    name: 'Buy out a brand',
    cost: 62000, cooldown: 26,
    requires: Object.freeze({ cash: 78000 }),
    weights: Object.freeze({
      bias: -0.55, shareGap: 0.80, playerShare: 0.95, cashNorm: 1.20,
      idleShips: 0, playerHeat: 0, weekNorm: 0.35, brandLocked: 0.45, underCut: 0,
    }),
    effect: Object.freeze([
      Object.freeze({ op: 'lockBrand', brand: 'ryland', commodity: 'filament', owner: 'rival' }),
      Object.freeze({ op: 'sharePull', perWeek: -0.014 }),
    ]),
  }),

  Object.freeze({
    id: 'cut_costs',
    name: 'Cut costs',
    cost: 0, cooldown: 8,
    requires: null,
    weights: Object.freeze({
      bias: 0.20, shareGap: 0.15, playerShare: 0.10, cashNorm: -1.10,
      idleShips: 0.35, playerHeat: 0, weekNorm: 0.10, brandLocked: 0, underCut: 0.20,
    }),
    effect: Object.freeze([
      Object.freeze({ op: 'ownCost', stage: 'upkeep', mult: 0.86, owner: 'rival' }),
      Object.freeze({ op: 'rivalRep', delta: -0.05 }),
    ]),
  }),

  Object.freeze({
    id: 'hold',
    name: 'Hold',
    cost: 0, cooldown: 0,
    requires: null,
    weights: Object.freeze({
      bias: 0.42, shareGap: -0.30, playerShare: -0.25, cashNorm: 0.10,
      idleShips: 0, playerHeat: 0.55, weekNorm: -0.10, brandLocked: 0, underCut: 0.15,
    }),
    effect: Object.freeze([]),
  }),
]);

export const profile = Object.freeze({
  id: 'corvain', name: 'Corvain Drayage Co.', station: 'drayyard', palette: 'corvain',
  cash: 118000, debt: 0, ships: 4, share: 0.71, mood: 'steady', rep: 0.6,
  classes: Object.freeze(['kite', 'kite', 'kite', 'ossa']),
});

export const scoring = Object.freeze({
  noise: 0.16,
  floor: 0.05,
  moodMult: Object.freeze({ steady: 1.0, aggressive: 1.25, wounded: 0.75, cartel: 0.6 }),
});
