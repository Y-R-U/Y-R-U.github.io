// The shock deck. One card at most per draw, drawn in js/sim/shocks.js.
//
// `weight` is a dot product against the exposure terms in shocks.js — leverage, thin, transit,
// heat, fleet, share — plus `base`. Negative terms are allowed and clamp at zero, which is how
// a card can only reach a player who is NOT overextended.
// `needs` gates a card out entirely when the state cannot support it.
// effect ops: cash{of,mult,cap} ship{lose|layUp,payout} contract{cancel,breakFrac}
// mod{kind,commodity|stage,mult,weeks} heat{add} reserve{site,mult}
// `of` bases: 'burn' one week of running costs, 'debt', 'cash', 'flat' 1000.
// Body tokens: {cash} {ship} {site} {weeks} {commodity} {brand}

export default Object.freeze([
  Object.freeze({
    id: 'hull_loss',
    title: 'You have lost a hull',
    needs: Object.freeze({ ships: 2 }),
    weight: Object.freeze({ base: 0.7, transit: 1.4, thin: 2.0, fleet: 0.7 }),
    effect: Object.freeze([
      Object.freeze({ op: 'ship', lose: 1, payout: 0.55 }),
      Object.freeze({ op: 'cash', of: 'burn', mult: -1.4, cap: 6000 }),
    ]),
    body: 'A hull seal let go on {ship} on the run out from {site}. The crew got clear in the tender. '
        + 'Underwriters settled at {payout} and paid it straight to the bank, because the bank owns '
        + 'the hull. You are left with the recovery bill and the work that ship was doing.',
  }),

  Object.freeze({
    id: 'drive_failure',
    title: 'A drive has failed',
    needs: Object.freeze({ ships: 1 }),
    weight: Object.freeze({ base: 1.3, transit: 1.7, thin: 1.0 }),
    effect: Object.freeze([
      Object.freeze({ op: 'ship', layUp: 4 }),
      Object.freeze({ op: 'cash', of: 'burn', mult: -1.9, cap: 9000 }),
    ]),
    body: '{ship} came back into {site} on one drive and will not be leaving it for {weeks} weeks. '
        + 'The yard wants {cash} and there is nobody else in the Reach who can do the work.',
  }),

  Object.freeze({
    id: 'contract_pulled',
    title: 'A buyer has walked',
    needs: Object.freeze({ contracts: 1 }),
    weight: Object.freeze({ base: 0.6, heat: 2.4, leverage: 1.0 }),
    effect: Object.freeze([
      Object.freeze({ op: 'contract', cancel: 1, breakFrac: 0.30 }),
    ]),
    body: '{brand} has cancelled the {commodity} agreement and taken its business elsewhere. '
        + 'The break clause runs to {cash}, and the tonnage you were holding for them is now yours '
        + 'to sell at whatever the market feels like paying.',
  }),

  Object.freeze({
    id: 'demand_collapse',
    title: 'The refit season is off',
    weight: Object.freeze({ base: 1.1, share: 1.7 }),
    effect: Object.freeze([
      Object.freeze({ op: 'mod', kind: 'demandMult', commodity: 'filament', mult: 0.58, weeks: 7 }),
    ]),
    body: 'Ossian Orbitals has deferred its refit season. Filament demand across the Reach falls '
        + 'by more than a third for the next {weeks} weeks, and everything already in your bond '
        + 'store was bought at the old price.',
  }),

  Object.freeze({
    id: 'fuel_spike',
    title: 'Reaction mass has doubled',
    weight: Object.freeze({ base: 1.2, transit: 1.7, fleet: 0.6 }),
    effect: Object.freeze([
      Object.freeze({ op: 'mod', kind: 'ownCost', stage: 'transit', mult: 1.6, weeks: 8 }),
    ]),
    body: 'A cracking plant on the far side of the Reach has gone offline and reaction mass has '
        + 'gone with it. Every leg you fly costs sixty per cent more for the next {weeks} weeks. '
        + 'Long routes are suddenly the expensive kind.',
  }),

  Object.freeze({
    id: 'berth_levy',
    title: 'An unscheduled berthing levy',
    weight: Object.freeze({ base: 1.5, fleet: 1.4, thin: 0.5 }),
    effect: Object.freeze([
      Object.freeze({ op: 'cash', of: 'burn', mult: -1.6, cap: 8000 }),
    ]),
    body: 'Ledger\'s berth authority has reassessed your moorings and backdated the difference. '
        + '{cash}, payable this week, with a schedule of works you did not ask for attached.',
  }),

  Object.freeze({
    id: 'margin_call',
    title: 'The bank has revalued you',
    needs: Object.freeze({ debt: 68000 }),
    weight: Object.freeze({ base: 0.2, leverage: 3.4, thin: 1.9 }),
    effect: Object.freeze([
      Object.freeze({ op: 'cash', of: 'debt', mult: -0.11, cap: 10000 }),
    ]),
    body: 'Your lender has taken a fresh look at what your hulls are worth and does not like the '
        + 'answer. {cash} of the facility has been called in this week. The line is still open; '
        + 'they simply want rather more of it back than you had planned on.',
  }),

  Object.freeze({
    id: 'inquiry_letter',
    title: 'A letter from the Reach Authority',
    needs: Object.freeze({ heat: 1 }),
    weight: Object.freeze({ base: 0.5, heat: 2.7, share: 1.1 }),
    effect: Object.freeze([
      Object.freeze({ op: 'heat', add: 7 }),
      Object.freeze({ op: 'cash', of: 'burn', mult: -0.9, cap: 5000 }),
    ]),
    body: 'The Authority would like your pricing correspondence for the last two quarters. It is '
        + 'not an investigation. It says so twice. Counsel has already billed {cash} for reading it, '
        + 'and you are now a name somebody has written down.',
  }),

  Object.freeze({
    id: 'seam_pinch',
    title: 'The seam has pinched out',
    weight: Object.freeze({ base: 1.0, transit: 0.9 }),
    effect: Object.freeze([
      Object.freeze({ op: 'reserve', site: 'kestrel', mult: 0.68 }),
    ]),
    body: 'The face your rigs have been working at Kestrel has narrowed to nothing. There is more '
        + 'ore in the belt, but it is thinner and further in, and every tonne from here costs more '
        + 'time than the last one did.',
  }),

  Object.freeze({
    id: 'salvage_claim',
    title: 'An old claim has paid',
    weight: Object.freeze({ base: 1.5, leverage: -1.3, thin: -1.4 }),
    effect: Object.freeze([
      Object.freeze({ op: 'cash', of: 'burn', mult: 2.1, cap: 11000 }),
    ]),
    body: 'A salvage claim you filed and forgot about has finally cleared: {cash}, in full, with '
        + 'interest. Books kept straight for long enough eventually pay you back for the trouble.',
  }),
]);
