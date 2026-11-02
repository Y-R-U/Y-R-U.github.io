// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
export default {
  series: 'spooky-open', since: 2026, recur: 'yearly', name: 'Spooky Hollow Open', theme: 'spooky',
  dates: { from: '10-20', to: '11-08' },
  blurb: 'The Muni goes dark for Halloween. Pumpkins hide on every fairway.',
  course: 'sky', holes: ['sky2', 'sky3', 'sky5', 'sky6', 'sky8', 'sky9'],
  currency: { id: 'pumpkins', name: 'Pumpkins', one: 'Pumpkin', icon: '🎃', colour: '#ff8a2a' },
  // goals: kind = currency (total collected) | rounds (event rounds finished) | underPar (best round,
  // strokes under par) | aces (holes in one during the event) | points (event points)
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 6, text: 'Collect 6 pumpkins', reward: { coins: 50 } },
    { id: 'g3', kind: 'underPar', target: 2, text: 'Finish a round 2 under par', reward: { helpers: { longSight: 2, magnet: 1 } } },
    { id: 'g4', kind: 'currency', target: 15, text: 'Collect 15 pumpkins', reward: { coins: 120, helpers: { mulligan: 1 }, chest: 'silver' } },
    { id: 'g5', kind: 'aces', target: 1, text: 'Sink a hole in one', reward: { coins: 100 } },
    { id: 'g6', kind: 'points', target: 600, text: 'Reach 600 event points', reward: { coins: 200, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 1031, size: 29, pace: 1.0 },
  rankRewards: [
    { top: 1, reward: { coins: 500, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Pumpkin King' },
    { top: 3, reward: { coins: 300, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 150, helpers: { longSight: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
