// duration is in quarters; 0 means permanent. heat is points added per week while active,
// against the investigation threshold in balance.js — legal tactics add none.
// effect ops the sim implements: lockBrand{brand,commodity} rivalPrice{commodity,mult}
// ownPrice{commodity,mult} ownCost{stage,mult} rivalCash{perWeek} sharePull{perWeek}
// absorb{ships,share} demandPull{commodity,frac} demandMult{commodity,mult}
// decayMult{commodity,mult} rivalMood{set}.  commodity '*' means every commodity;
// ownCost stages are 'transit' 'refine' 'upkeep' 'wages'.

export default Object.freeze([
  Object.freeze({
    id: 'exclusive_supply',
    name: 'Exclusive Supply Agreement',
    band: 'legal',
    blurb: 'Ryland Coil Works sells filament in the Reach through you and nobody else.',
    unlock: Object.freeze({ share: 0.08, cash: 8000 }),
    cost: 22000, heat: 0, duration: 8,
    effect: Object.freeze([
      Object.freeze({ op: 'lockBrand', brand: 'ryland', commodity: 'filament' }),
      Object.freeze({ op: 'rivalPrice', commodity: 'filament', mult: 1.18 }),
      Object.freeze({ op: 'demandPull', commodity: 'filament', frac: 0.14 }),
    ]),
    penalty: null,
    story: 'bunnings_ryobi',
  }),

  Object.freeze({
    id: 'vertical_integration',
    name: 'Vertical Integration',
    band: 'legal',
    blurb: 'Own the belt claim, the refinery and the hulls. Nobody prices you.',
    unlock: Object.freeze({ share: 0.16, cash: 12000, modules: Object.freeze(['refinery', 'coilline']) }),
    cost: 34000, heat: 0, duration: 0,
    effect: Object.freeze([
      Object.freeze({ op: 'ownCost', stage: 'transit', mult: 0.82 }),
      Object.freeze({ op: 'ownCost', stage: 'refine', mult: 0.88 }),
      Object.freeze({ op: 'demandPull', commodity: 'ore', frac: 0.06 }),
    ]),
    penalty: null,
    story: 'ford_rouge',
  }),

  Object.freeze({
    id: 'price_guarantee',
    name: 'Lowest Price Guarantee',
    band: 'legal',
    blurb: 'Beat any filament price in the Reach by ten per cent. Costs nothing while you are the only seller.',
    unlock: Object.freeze({ share: 0.20, cash: 5000 }),
    requires: Object.freeze({ dominance: Object.freeze({ commodity: 'filament', share: 0.5 }) }),
    cost: 12000, heat: 0, duration: 6,
    effect: Object.freeze([
      Object.freeze({ op: 'demandPull', commodity: 'filament', frac: 0.14 }),
      Object.freeze({ op: 'ownPrice', commodity: 'filament', mult: 1.06 }),
      Object.freeze({ op: 'rivalPrice', commodity: 'filament', mult: 0.94 }),
    ]),
    penalty: null,
    story: 'bunnings_guarantee',
  }),

  Object.freeze({
    id: 'brand_buyout',
    name: 'Brand Buyout',
    band: 'grey',
    blurb: 'Buy Harrow Filament outright. Corvain loses the last brand anyone asks for by name.',
    unlock: Object.freeze({ share: 0.16, cash: 9000 }),
    cost: 26000, heat: 9, duration: 0,
    effect: Object.freeze([
      Object.freeze({ op: 'absorb', ships: 1, share: 0.08 }),
      Object.freeze({ op: 'lockBrand', brand: 'harrow', commodity: 'filament' }),
      Object.freeze({ op: 'rivalPrice', commodity: 'filament', mult: 1.34 }),
      Object.freeze({ op: 'demandPull', commodity: 'filament', frac: 0.12 }),
    ]),
    penalty: Object.freeze({ fine: 21000, shareLoss: 0.06, repLoss: 0.25, ban: false }),
    story: 'meta_instagram',
  }),

  Object.freeze({
    id: 'below_cost',
    name: 'Below-Cost Pricing',
    band: 'grey',
    blurb: 'Sell every hold under what it cost to fill. Whoever runs out of cash first stops.',
    unlock: Object.freeze({ share: 0.12, cash: 6000 }),
    cost: 0, heat: 6, duration: 2,
    effect: Object.freeze([
      Object.freeze({ op: 'ownPrice', commodity: '*', mult: 0.88 }),
      Object.freeze({ op: 'demandPull', commodity: '*', frac: 0.24 }),
      Object.freeze({ op: 'rivalCash', perWeek: -2600 }),
      Object.freeze({ op: 'sharePull', perWeek: 0.012 }),
    ]),
    penalty: Object.freeze({ fine: 15000, shareLoss: 0.05, repLoss: 0.2, ban: false }),
    story: 'boral_predatory',
  }),

  Object.freeze({
    id: 'spec_collusion',
    name: 'Specification Collusion',
    band: 'illegal',
    blurb: 'Agree with Corvain on a coil that fails at a thousand hours. The Reach buys filament forever.',
    unlock: Object.freeze({ share: 0.17, cash: 7000 }),
    cost: 18000, heat: 14, duration: 8,
    effect: Object.freeze([
      Object.freeze({ op: 'decayMult', commodity: 'filament', mult: 2.2 }),
      Object.freeze({ op: 'demandMult', commodity: 'filament', mult: 1.35 }),
      Object.freeze({ op: 'ownPrice', commodity: 'filament', mult: 1.22 }),
      Object.freeze({ op: 'rivalPrice', commodity: 'filament', mult: 1.22 }),
      Object.freeze({ op: 'rivalMood', set: 'cartel' }),
    ]),
    penalty: Object.freeze({ fine: 37000, shareLoss: 0.14, repLoss: 0.5, ban: true }),
    story: 'phoebus_cartel',
  }),
]);
