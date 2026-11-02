// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events2: around Easter 2027 (Sunday 28 March).
export default {
  series: 'egg-hunt', since: 2027, recur: 'yearly', name: 'Easter Egg Hunt', theme: 'sky',
  dates: { rule: 'easter', before: 8, after: 8 },   // 2027: 03-20 → 04-05
  blurb: 'Painted eggs are hidden all over the spring isles. Find every one.',
  course: 'festival', holes: ['fest1', 'sky4', 'fest4', 'sky14', 'fest6', 'fest7'],
  currency: { id: 'eggs', name: 'Painted eggs', one: 'Painted egg', icon: '🥚', colour: '#f2c94c' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 6, text: 'Find 6 painted eggs', reward: { coins: 50 } },
    { id: 'g3', kind: 'currency', target: 12, text: 'Find 12 painted eggs', reward: { coins: 80, helpers: { magnet: 1, longSight: 1 } } },
    { id: 'g4', kind: 'underPar', target: 2, text: 'Finish a round 2 under par', reward: { coins: 100, chest: 'silver' } },
    { id: 'g5', kind: 'currency', target: 18, text: 'Find all 18 painted eggs', reward: { coins: 180, helpers: { mulligan: 2 }, chest: 'silver' } },
    { id: 'g6', kind: 'points', target: 700, text: 'Reach 700 event points', reward: { coins: 220, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 328, size: 29, pace: 1.0 },
  rankRewards: [
    { top: 1, reward: { coins: 500, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Golden Egg' },
    { top: 3, reward: { coins: 300, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 150, helpers: { longSight: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
