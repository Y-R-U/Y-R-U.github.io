// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events4: two weeks round World Ocean Day (8 June) in the Sunken Reef theme: four Sunken Reef holes and
// three mirrored remixes of older holes (`mir-<id>`, js/events/remix.js) dressed as reef.
// Sunken Reef is gated (after Sugar Summit): for a player who hasn't opened it the reef holes are a
// TASTER — played and scored, but they record nothing and unlock nothing (EventRound.keepsProgress).
export default {
  series: 'deep-dive', since: 2027, recur: 'yearly', name: 'Deep Dive', theme: 'reef', themeFallback: 'sky',
  dates: { from: '06-01', to: '06-15' },   // between the late-Easter spring weekends and the Sky Games (06-26)
  blurb: 'The isles sink below the waves. Dive for pearls on the reef and on old holes turned inside out.',
  course: 'reef', holes: ['reef1', 'mir-fest3', 'reef3', 'mir-sky14', 'reef5', 'mir-fest8', 'reef9'],
  currency: { id: 'pearls', name: 'Pearls', one: 'Pearl', icon: '🦪', colour: '#f4e6ff' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Make your first dive', reward: { coins: 30 } },
    { id: 'g2', kind: 'currency', target: 7, text: 'Find 7 pearls', reward: { coins: 60 } },
    { id: 'g3', kind: 'currency', target: 14, text: 'Find 14 pearls', reward: { coins: 80, helpers: { magnet: 1, sticky: 1 } } },
    { id: 'g4', kind: 'underPar', target: 2, text: 'Finish a dive 2 under par', reward: { coins: 110, chest: 'silver' } },
    { id: 'g5', kind: 'currency', target: 21, text: 'Find all 21 pearls', reward: { coins: 160, helpers: { longSight: 2 }, chest: 'silver' } },
    { id: 'g6', kind: 'points', target: 800, text: 'Reach 800 event points', reward: { coins: 240, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 608, size: 29, pace: 1.05 },
  rankRewards: [
    { top: 1, reward: { coins: 550, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Pearl Diver' },
    { top: 3, reward: { coins: 320, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 150, helpers: { magnet: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
