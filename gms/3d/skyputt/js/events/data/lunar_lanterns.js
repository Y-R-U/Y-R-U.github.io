// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events2: Lunar New Year 2027 (Feb 6) through the Lantern Festival (Feb 20). Mixes Festival Isles
// holes (course 'festival') with Sky Isles ones: event holes may come from any course (eventHoles()).
export default {
  series: 'lunar-lanterns', since: 2027, recur: 'yearly', name: 'Lunar Lantern Festival', theme: 'frost',
  dates: { rule: 'lunar', before: 10, after: 15 },   // 2027: 01-27 → 02-21
  blurb: 'Lanterns over the winter isles for the New Year. Lucky envelopes on every fairway.',
  course: 'festival', holes: ['fest1', 'fest6', 'sky10', 'fest4', 'sky13', 'fest9'],
  currency: { id: 'envelopes', name: 'Lucky envelopes', one: 'Lucky envelope', icon: '🧧', colour: '#e8323c' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play an event round', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 8, text: 'Collect 8 lucky envelopes', reward: { coins: 60, helpers: { magnet: 1 } } },
    { id: 'g3', kind: 'aces', target: 1, text: 'Sink a hole in one', reward: { coins: 88 } },
    { id: 'g4', kind: 'underPar', target: 3, text: 'Finish a round 3 under par', reward: { helpers: { longSight: 2, steady: 1 }, chest: 'silver' } },
    { id: 'g5', kind: 'currency', target: 18, text: 'Collect all 18 lucky envelopes', reward: { coins: 168, helpers: { mulligan: 2 } } },
    { id: 'g6', kind: 'points', target: 888, text: 'Reach 888 event points', reward: { coins: 288, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 2027, size: 29, pace: 1.05 },
  rankRewards: [
    { top: 1, reward: { coins: 888, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Lantern Keeper' },
    { top: 3, reward: { coins: 388, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 168, helpers: { mulligan: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 58 } },
  ],
};
