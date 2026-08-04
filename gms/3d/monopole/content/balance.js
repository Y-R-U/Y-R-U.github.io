// Tuning constants. Default export is an object, not an array — it is one namespace, not a list.
// `targets` is what `node sim.mjs 500` asserts, straight out of BUILD_PLAN §9.
//
// Expect to move first, in this order: loan.interestWeekly, market.priceStep,
// share.window, heat.threshold, offer.weekMin/weekMax. Everything else should hold.

export default Object.freeze({
  start: Object.freeze({
    cash: 40000, debt: 60000, rep: 0.5, heat: 0,
    ships: Object.freeze(['kite', 'kite', 'ossa']),
    share: Object.freeze({ player: 0.04, rival: 0.71, other: 0.25 }),
  }),

  // interestWeekly is a weekly rate on outstanding debt; 0.006 is ~36% a year.
  loan: Object.freeze({
    interestWeekly: 0.006, debtLimit: 40000,
    drawFee: 0.02, maxDraw: 80000,
  }),

  costs: Object.freeze({
    overheadWeekly: 650,
    fuelMult: 1.0,
    idleUpkeepMult: 0.45,
    moduleUpkeepMult: 1.0,
  }),

  // priceStep is the fraction of the gap to the clearing price a market closes each week.
  market: Object.freeze({
    priceStep: 0.35, noise: 0.03,
    stockDecayMult: 1.0,
    demandDrift: 0.004,
    freightBase: 34,
    feedWeeks: 3,
  }),

  mining: Object.freeze({
    yieldMult: 1.0, reserveDrainPerWeek: 0.004, richVeinChance: 0.12, richVeinMult: 1.45,
  }),

  // share is a trailing average of delivered value over `window` weeks; inertia damps the step.
  // rivalPerShip and otherBase are credits per week, and they set the scale the player is
  // measured against: 4 ships x 4800 + 6900 is the 71/25 split at week 1.
  share: Object.freeze({
    window: 6, inertia: 0.35, otherFloor: 0.10, otherDrift: -0.002,
    rivalPerShip: 4850, otherBase: 6600, undercutBoost: 1.06,
    reachTotal: 26500, reachDrift: 0.002,
  }),

  rival: Object.freeze({
    effectWeeks: 4, incomePerShip: 3400, upkeepPerShip: 1900,
    woundedCash: 24000, aggressiveAt: 0.16,
  }),

  contract: Object.freeze({ shortfallFrac: 0.12 }),

  // threshold is heat points; heat accrues per week from active grey and illegal tactics.
  heat: Object.freeze({
    threshold: 60, decayWeekly: 1.4,
    investigateBase: 0.06, investigatePerPoint: 0.004,
    repShield: 0.25, cooldownWeeks: 13,
  }),

  // the week window in which the first exclusivity offer may arrive
  offer: Object.freeze({
    // priceMult is a floor under the market price, not a premium over it
    weekMin: 9, weekMax: 13, brand: 'ryland', commodity: 'filament',
    tactic: 'exclusive_supply', units: 6, priceMult: 1.02,
  }),

  win: Object.freeze({
    monopoly: 0.50, duopoly: 0.35, checkFromWeek: 26, holdWeeks: 4,
  }),

  tick: Object.freeze({
    tickSeconds: 6, weeksPerQuarter: 13, speeds: Object.freeze([0, 1, 2, 4]), maxDwell: 3,
  }),

  targets: Object.freeze({
    offerByWeek13: 0.80,
    bustRateMax: 0.10,
    shareAtWeek13: Object.freeze({ min: 0.12, max: 0.25 }),
    runs: 500,
  }),
});
