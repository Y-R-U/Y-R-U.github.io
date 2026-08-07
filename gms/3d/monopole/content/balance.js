// Tuning constants. Default export is an object, not an array — it is one namespace, not a list.
// `targets` is what `node sim.mjs 500` asserts, straight out of BUILD_PLAN §9.
//
// Expect to move first, in this order: loan.interestWeekly, market.priceStep,
// share.window, heat.threshold, offer.weekMin/weekMax. Everything else should hold.

export default Object.freeze({
  // ships is empty: the first act is buying a hull from the shipyard, and the cash covers it.
  start: Object.freeze({
    cash: 82000, debt: 42000, rep: 0.5, heat: 0,
    ships: Object.freeze([]),
    share: Object.freeze({ player: 0.04, rival: 0.71, other: 0.25 }),
  }),

  // interestWeekly is a weekly rate on outstanding debt; 0.012 is ~87% a year.
  // debtLimit is the overdraft the bank tolerates past zero cash, NOT the credit line
  // (that is maxDraw). Small on purpose — it is the whole bust lever.
  loan: Object.freeze({
    interestWeekly: 0.012, debtLimit: 29000,
    drawFee: 0.02, maxDraw: 94000,
  }),

  costs: Object.freeze({
    overheadWeekly: 650,
    fuelMult: 1.0,
    idleUpkeepMult: 0.45,
    moduleUpkeepMult: 1.0,
  }),

  // priceStep is the fraction of the gap to the clearing price a market closes each week.
  market: Object.freeze({
    priceStep: 0.35, noise: 0.05,
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
    // Share taken by a tactic rather than by carrying freight. It accumulates into the share
    // *target* while the tactic runs and erodes slowly once it stops — applying it to the current
    // value instead let the inertia term claw 65% of it back the following week, which is why
    // going grey used to buy nothing at all.
    pullCap: 0.32, pullDecay: 0.005,
    reachTotal: 27600, reachDrift: 0.002,
  }),

  rival: Object.freeze({
    effectWeeks: 4, incomePerShip: 3400, upkeepPerShip: 1900,
    woundedCash: 24000, aggressiveAt: 0.16,
  }),

  contract: Object.freeze({ shortfallFrac: 0.12 }),

  // threshold is heat points; heat accrues per week from active grey and illegal tactics.
  heat: Object.freeze({
    threshold: 34, decayWeekly: 1.5,
    investigateBase: 0.06, investigatePerPoint: 0.0016,
    repShield: 0.25, cooldownWeeks: 13,
    revokeAt: 3, revokeRep: 0.02,
  }),

  // baseChance is the weekly draw for a company with no exposure at all; strainChance is what
  // the strain dot product adds on top. safeRunway is weeks of costs that count as slack.
  shock: Object.freeze({
    graceWeeks: 4, cooldownWeeks: 4,
    baseChance: 0.033, strainChance: 0.22,
    // A flat weekly hazard makes surviving strictly worse: a well-run company is ground down by
    // nothing but time, and the live game has no week limit. The whole draw decays toward
    // ageFloor over ageWeeks as the company proves itself — strain still sets the shape, so
    // overextension is punished at week 60 exactly as hard relative to caution as at week 6.
    ageFloor: 0.40, ageWeeks: 38,
    safeRunway: 9, fleetNorm: 6, shareNorm: 0.35,
    strain: Object.freeze({ leverage: 0.42, thin: 0.52, heat: 0.14, transit: 0.12 }),
  }),

  warn: Object.freeze({
    runwayWeeks: 5, leverageFrac: 0.55, heatFrac: 0.7, repeatWeeks: 5,
  }),

  // the week window in which the first exclusivity offer may arrive
  offer: Object.freeze({
    // priceMult is a floor under the market price, not a premium over it
    weekMin: 10, weekMax: 15, brand: 'ryland', commodity: 'filament',
    tactic: 'exclusive_supply', units: 6, priceMult: 1.02,
  }),

  // Three tiers, judged on the deadline. `seasonWeeks` is the date the Reach is re-surveyed and
  // your standing is recorded; the player may keep playing after it and improve at any later
  // quarter. holdWeeks/checkFromWeek still give an early clinch: hold a tier that long before the
  // deadline and the season is called there and then.
  win: Object.freeze({
    monopoly: 0.45, duopoly: 0.35, oligopoly: 0.22,
    seasonWeeks: 52, reviewEvery: 13,
    checkFromWeek: 30, holdWeeks: 4,
  }),

  tick: Object.freeze({
    tickSeconds: 6, weeksPerQuarter: 13, speeds: Object.freeze([0, 1, 2, 4]), maxDwell: 3,
  }),

  // bustRate is a band, not a ceiling — a game you cannot lose has no decision in it.
  // caughtWhenIllegal is measured over the runs that actually took an illegal tactic, and its job
  // is the floor. A cartel left running is a near-certain conviction by construction — 14 heat a
  // week against a threshold of 34 that sheds 1.5 — so the ceiling is 1.0 on every difficulty.
  targets: Object.freeze({
    // week 20, not 13: nothing sells until about week 7 and the trailing average needs six weeks
    // after that, so a week-13 reading is mostly the seeded history rather than the company
    shareAtWeek: 20,
    offerByWeek13: 0.80,
    bustRate: Object.freeze({ min: 0.05, max: 0.18 }),
    // the base start is the medium origin's shape — no fleet, the same opening purchase, the same
    // single production line — so it carries the same band. The old 25% ceiling described a
    // company that was handed three hulls and started selling in week two.
    shareAtWeek13: Object.freeze({ min: 0.12, max: 0.28 }),
    greyReachable: 0.85,
    greyReachableByWeek16: 0.60,
    illegalTaken: 0.15,
    caughtWhenIllegal: Object.freeze({ min: 0.35, max: 1.0 }),
    // an unlock is when the player is shown the tactic and its real-world story, so this is the
    // assertion that the educational payload is reachable at all
    tacticsByWeek20: 3,
    investigatedOnce: 0.25,
    // the split is the whole point of the shock deck: if caution and greed bust at the same rate
    // the shocks are noise
    carefulBustMax: 0.06,
    carelessBustMin: 0.20,
    runs: 500,
  }),
});
