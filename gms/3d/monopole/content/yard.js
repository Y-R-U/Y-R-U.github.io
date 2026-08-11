// The Ledger Yard sales floor: the units a hull is quoted in, the labels that point at it while it
// turns, what the yard is discounting this month, and how far a broker will come down.

// Every hull is sold as a multiple of one rated cruise, the way real freight is. 1.00 is the
// Kite-class, which is what the Alliance timed the Reach's schedules against when it opened it.
export const speedUnit = Object.freeze({
  name: 'Alliance standard',
  short: 'AS',
  blurb: 'One Alliance standard is the cruise the Reach’s schedules were written to — a loaded '
    + 'Kite-class, dock to dock. Everything else on the board is quoted against it.',
});

// Where on the hull each label points, as fractions of its bounding box: 0 is the tail, 1 the nose,
// and `up` is measured off the centreline. The kit is one tapered wedge on every class, so these
// land on the right lump of metal for all of them.
export const callouts = Object.freeze([
  Object.freeze({
    id: 'speed', at: Object.freeze({ along: 0.06, up: 0.10, side: 0.34 }),
    label: s => `${s.speed.toFixed(2)}× ${speedUnit.name}`,
    note: 'off the drive',
  }),
  Object.freeze({
    id: 'hold', at: Object.freeze({ along: 0.46, up: 0.52, side: -0.30 }),
    label: s => `${s.hold} t of hold`,
    note: 'sealed, one deck',
  }),
  Object.freeze({
    id: 'mine', at: Object.freeze({ along: 0.30, up: -0.42, side: 0.30 }),
    label: s => (s.mine > 0 ? `cuts ${s.mine} t a week` : null),
    note: 'gantry and cutting head',
  }),
  Object.freeze({
    id: 'upkeep', at: Object.freeze({ along: 0.72, up: 0.34, side: 0.32 }),
    label: s => `${s.upkeep} cr a week to run`,
    note: 'crew, air and fuel',
  }),
  Object.freeze({
    id: 'len', at: Object.freeze({ along: 0.94, up: -0.16, side: -0.30 }),
    label: s => `${s.hull.len} m over all`,
    note: 'nose to drive bell',
  }),
]);

// Seconds one label stands before the next takes over, and the fade at either end of that.
export const calloutTiming = Object.freeze({ hold: 3.4, fade: 0.45 });

// One tick is a week, so a window quoted in days only ever burns seven at a time: anything under a
// day dies at the very next tick whenever the player takes it, which is the point of quoting it in
// hours. `urgent` is where the chip goes hot.
export const time = Object.freeze({ daysPerWeek: 7, urgent: 2 });

// Nothing on this floor stands forever. A window is drawn from the band its cut falls in — the
// deeper the discount the less time you get to think about it, because that is the entire trick.
const band = (upTo, from, to) => Object.freeze({ upTo, from, to });

// The board always has something on offer, because a yard with nothing on offer is a yard nobody
// walks into. `everyWeeks` is how long a run of offers stands before the next one is drawn; each
// offer then runs its own window inside that block and can be gone long before the block is.
export const sale = Object.freeze({
  everyWeeks: 4,
  chance: 0.42,
  cuts: Object.freeze([0.10, 0.15, 0.20]),
  windows: Object.freeze([band(0.10, 13, 20), band(0.15, 5, 9), band(1.00, 0.4, 1.4)]),
  reasons: Object.freeze([
    'Yard clearance',
    'Ex-charter, returned',
    'End of the quarter',
    'Trade-in, unsold',
    'Two on the books, one buyer',
    'Repossessed, sold as seen',
    'Finance fell through',
    'Estate sale',
    'Last of the batch',
    'Make room for the new stock',
    'Owner took a berth elsewhere',
    'Surveyed and signed off',
  ]),
});

// What a broker will actually take off, and what it costs to ask. `firm` is the beat where they
// stop being friendly about it — asking past that is how you lose the discount you already had.
export const haggle = Object.freeze({
  tries: 2,
  base: 0.30,
  perTrait: Object.freeze({ haggler: 0.34, posh: 0.10, polite: 0.08, foulmouth: -0.10, namedropper: 0.14 }),
  perPersonality: Object.freeze({ sly: 0.16, hot: -0.08, deadpan: 0.06, warm: 0.10 }),
  perOrigin: Object.freeze({ silver: 0.10, gutter: -0.06 }),
  win: Object.freeze({ min: 0.03, max: 0.08 }),
  // pushing a broker who has already said no
  hardWin: 0.18,
  hardLoss: 0.04,
  // how long they will hold their own number, by how much of it they gave away. Nobody stands
  // behind a price they had to fight the yard for.
  holds: Object.freeze([band(0.05, 6, 9), band(0.07, 3, 4), band(1.00, 0.5, 1.0)]),
});

// The chip under the price. Windows are drawn in days and displayed in whatever unit makes the
// pressure legible — under a day it is hours, because "18 hours" reads as a deadline and "0.8
// days" reads as a number.
const hours = d => `${Math.max(1, Math.round(d * 24))} hour${Math.round(d * 24) === 1 ? '' : 's'}`;

export const countdown = Object.freeze({
  sale: d => (d < 1 ? `Off the board in ${hours(d)}` : d <= 1.6 ? 'Last day on the board'
    : `${Math.ceil(d)} days left on it`),
  deal: d => (d < 1 ? `Yours for ${hours(d)}` : d <= 1.6 ? 'Yours until morning'
    : `Held for ${Math.ceil(d)} days`),
});

export default Object.freeze({ speedUnit, callouts, calloutTiming, time, sale, haggle, countdown });
