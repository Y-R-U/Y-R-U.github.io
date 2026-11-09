// Seasonal event (PLAN 2.8). Pure data. events3: recurs yearly; `dates` is the rule (js/events/calendar.js)
// and each year's run is `${series}-${year}` (own save, ladder, goals). Local days, `end` inclusive.
// events4: a ball-hits event. Three ghost-AI rivals (js/events/rivals.js: recorded by the real AI before
// the round, seeded by run id + round number, so a round is reproducible) share every hole with you,
// and ball hits are forced ON whatever the Ball hits setting (notes/ballhit.md rules: knocked out of
// bounds = +1 to the ball's owner). Knock-outs and beating rivals on the card earn crowns and points.
// Wood3 is on Hollow Woods (gated after the front nine): a taster for players who haven't opened it.
export default {
  series: 'battle-royale', since: 2027, recur: 'yearly', name: 'Battle Royale Cup', theme: 'sky',
  dates: { from: '09-03', to: '09-26' },   // late summer, well clear of the Sky Games (→ 07-18) and Spooky Open (10-20 →)
  blurb: 'Three rivals on every hole and ball hits always on. Knock them off the island, beat them on the card.',
  course: 'festival', holes: ['sky1', 'fest5', 'mir-sky16', 'wood3', 'fest2'],
  twist: { collide: true, rivals: 3, bonus: { knockout: 2, beat: 1 } },
  rivals: { skill: [0.3, 0.6] },
  scoring: { knockout: 15, beat: 10 },
  currency: { id: 'crowns', name: 'Crowns', one: 'Crown', icon: '👑', colour: '#ffcf3c' },
  goals: [
    { id: 'g1', kind: 'rounds', target: 1, text: 'Play a Cup round', reward: { coins: 30 } },
    { id: 'g2', kind: 'knockouts', target: 1, text: 'Knock a rival out of bounds', reward: { coins: 60, helpers: { power: 1 } } },
    { id: 'g3', kind: 'beaten', target: 5, text: 'Finish ahead of 5 rivals', reward: { coins: 80, helpers: { guard: 1, steady: 1 } } },
    { id: 'g4', kind: 'wins', target: 1, text: 'Win a round (beat all three)', reward: { coins: 120, chest: 'silver' } },
    { id: 'g5', kind: 'knockouts', target: 5, text: 'Knock out 5 rivals', reward: { coins: 150, helpers: { mulligan: 2 }, chest: 'silver' } },
    { id: 'g6', kind: 'currency', target: 30, text: 'Collect 30 crowns', reward: { coins: 160, helpers: { longSight: 2 } } },
    { id: 'g7', kind: 'points', target: 900, text: 'Reach 900 event points', reward: { coins: 260, helpers: { longSight: 2, mulligan: 2 }, chest: 'gold' } },
  ],
  ladder: { seed: 9119, size: 29, pace: 1.1 },
  rankRewards: [
    { top: 1, reward: { coins: 600, helpers: { longSight: 3, mulligan: 3 }, chest: 'gold' }, title: 'Last Ball Standing' },
    { top: 3, reward: { coins: 350, helpers: { longSight: 2, mulligan: 2 }, chest: 'silver' } },
    { top: 10, reward: { coins: 160, helpers: { power: 1 }, chest: 'wood' } },
    { top: 30, reward: { coins: 50 } },
  ],
};
