// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events2: a mid-year event with a neutral name (it is summer in the north and winter in the south).
export default {
  series: 'sky-games', since: 2027, recur: 'yearly', name: 'Midyear Sky Games', theme: 'sky',
  dates: { from: '06-26', to: '07-18' },
  blurb: 'Three weeks of trick-shot games across the Festival Isles. Win medals, climb the board.',
  course: 'festival', holes: ['fest2', 'fest3', 'sky11', 'fest5', 'fest7', 'sky17', 'fest9'],
  currency: { id: 'medals', name: 'Medals', one: 'Medal', icon: '🏅', colour: '#f2b33c' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 10, text: 'Win 10 medals', reward: { coins: 70 } },
    { id: 'g3', kind: 'aces', target: 2, text: 'Sink 2 holes in one', reward: { coins: 120, helpers: { power: 1, ghost: 1 } } },
    { id: 'g4', kind: 'rounds', target: 6, text: 'Play 6 event rounds', reward: { helpers: { mulligan: 2, steady: 1 }, chest: 'silver' } },
    { id: 'g5', kind: 'underPar', target: 3, text: 'Finish a round 3 under par', reward: { coins: 160 } },
    { id: 'g6', kind: 'currency', target: 21, text: 'Win all 21 medals', reward: { coins: 180, helpers: { longSight: 2 } } },
    { id: 'g7', kind: 'points', target: 1100, text: 'Reach 1100 event points', reward: { coins: 300, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 707, size: 29, pace: 1.15 },
  rankRewards: [
    { top: 1, reward: { coins: 650, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Sky Games Champion' },
    { top: 3, reward: { coins: 380, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 160, helpers: { mulligan: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
