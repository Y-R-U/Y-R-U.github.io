// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events2: plays on the 'candy' theme (js/themes/candy/, built by the candy agent). If that theme is
// missing or fails to load, the round uses `themeFallback` (main.js) instead of greybox.
export default {
  series: 'candy-carnival', since: 2027, recur: 'yearly', name: 'Candy Carnival', theme: 'candy', themeFallback: 'sky',
  // between the Lantern Festival and the Egg Hunt with 2 free days each side, at most 24 days (2027: 02-24 → 03-17)
  dates: { rule: 'between', after: 'lunar-lanterns', before: 'egg-hunt', gap: 3, max: 24, from: '02-24', to: '03-17' },
  blurb: 'The isles turn to sugar: bumper cars, toboggans and lollipops everywhere.',
  // courses3: Sugar Summit's Lollipop Loops replaces sky11 (3 pickups each, so still 18 lollipops)
  course: 'festival', holes: ['fest2', 'fest5', 'sky16', 'fest8', 'sugar6', 'fest3'],
  currency: { id: 'lollipops', name: 'Lollipops', one: 'Lollipop', icon: '🍭', colour: '#ff4f9a' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 6, text: 'Collect 6 lollipops', reward: { coins: 50 } },
    { id: 'g3', kind: 'rounds', target: 4, text: 'Play 4 event rounds', reward: { helpers: { guard: 1, sticky: 1 }, chest: 'wood' } },
    { id: 'g4', kind: 'underPar', target: 2, text: 'Finish a round 2 under par', reward: { coins: 100, helpers: { magnet: 1 } } },
    { id: 'g5', kind: 'currency', target: 18, text: 'Collect all 18 lollipops', reward: { coins: 150, helpers: { longSight: 2 }, chest: 'silver' } },
    { id: 'g6', kind: 'points', target: 750, text: 'Reach 750 event points', reward: { coins: 220, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 3141, size: 29, pace: 1.0 },
  rankRewards: [
    { top: 1, reward: { coins: 550, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Sugar Royalty' },
    { top: 3, reward: { coins: 320, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 150, helpers: { mulligan: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
