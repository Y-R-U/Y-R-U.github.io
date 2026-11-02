// Seasonal event (PLAN 2.8). Pure data. Dates are local calendar days; `end` is inclusive.
// TODO(frost theme agent): switch `theme` to 'frost' once js/themes/frost/ exists (Frost Fair skin,
// ref_christmas.jpg). Until then it plays on Sky Isles.
export default {
  id: 'frost-fair-2026', name: 'Frost Fair Festival', theme: 'sky', themeWanted: 'frost',
  start: '2026-12-01', end: '2027-01-06',
  blurb: 'Lanterns, snow and candy canes over the Sky Isles. Bring a scarf.',
  course: 'sky', holes: ['sky1', 'sky4', 'sky5', 'sky7', 'sky8', 'sky9'],
  currency: { id: 'canes', name: 'Candy canes', one: 'Candy cane', icon: '🍬', colour: '#ff5a6e' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 8, text: 'Collect 8 candy canes', reward: { coins: 60 } },
    { id: 'g3', kind: 'rounds', target: 5, text: 'Play 5 event rounds', reward: { helpers: { mulligan: 2 } } },
    { id: 'g4', kind: 'underPar', target: 3, text: 'Finish a round 3 under par', reward: { coins: 120 } },
    { id: 'g5', kind: 'currency', target: 18, text: 'Collect all 18 candy canes', reward: { coins: 150, helpers: { longSight: 2 } } },
    { id: 'g6', kind: 'points', target: 900, text: 'Reach 900 event points', reward: { coins: 250, helpers: { longSight: 2, mulligan: 2 } } },
  ],
  ladder: { seed: 1224, size: 29, pace: 1.1 },
  rankRewards: [
    { top: 1, reward: { coins: 600, helpers: { longSight: 3, mulligan: 3 } }, title: 'Frost Champion' },
    { top: 3, reward: { coins: 350, helpers: { longSight: 2, mulligan: 2 } } },
    { top: 10, reward: { coins: 150, helpers: { mulligan: 1 } } },
    { top: 30, reward: { coins: 50 } },
  ],
};
