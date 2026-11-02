// events3: short weekend events (Fri–Sun) that fill the weeks between the big yearly events.
// js/events/calendar.js gives every free weekend one of these kinds in turn (week number mod 4),
// picks its holes from every course in COURSES (pick / must filters below) and a theme from THEME_LIST.
// Rewards are deliberately small next to the big events (see docs/notes/events3.md, "Balance"):
// at most ~185 coins, one wooden chest and two helpers for a perfect weekend.
const half = n => Math.max(3, Math.round(n / 2));
const moving = h => (h.features || []).some(f => f.type === 'windmill' || f.type === 'mover');
const rank = title => [
  { top: 1, reward: { coins: 80, helpers: { longSight: 1 } }, title },
  { top: 3, reward: { coins: 50 } },
  { top: 15, reward: { coins: 15 } },
];

export const WEEKEND_LADDER = { size: 14, pace: 2.2 };   // 14 bots + you; bots play more at weekends

export const WEEKEND_KINDS = [
  {
    kind: 'windmill', name: 'Windmill Weekend', holes: 5,
    blurb: 'Spinning sails and sliding blocks on every hole. Time your putts.',
    pick: moving, must: h => h.features.some(f => f.type === 'windmill'),
    currency: { id: 'pinwheels', name: 'Pinwheels', one: 'Pinwheel', icon: '🌀', colour: '#6fd0ff' },
    goals: n => [
      { id: 'g1', kind: 'rounds', target: 1, text: 'Play a weekend round', reward: { coins: 15 } },
      { id: 'g2', kind: 'currency', target: half(n), text: `Collect ${half(n)} pinwheels`, reward: { coins: 20 } },
      { id: 'g3', kind: 'rounds', target: 3, text: 'Play 3 weekend rounds', reward: { helpers: { steady: 1 } } },
      { id: 'g4', kind: 'points', target: 300, text: 'Reach 300 event points', reward: { coins: 30, chest: 'wood' } },
    ],
    rankRewards: rank('Mill Master'),
  },
  {
    kind: 'aces', name: 'Ace Hunt', holes: 5,
    blurb: 'Short holes, big rewards. Every hole in one is worth double points on the board.',
    scoring: { ace: 50 },
    pick: h => h.par <= 3,
    currency: { id: 'bullseyes', name: 'Bullseyes', one: 'Bullseye', icon: '🎯', colour: '#ff6464' },
    goals: n => [
      { id: 'g1', kind: 'rounds', target: 1, text: 'Play a weekend round', reward: { coins: 15 } },
      { id: 'g2', kind: 'currency', target: half(n), text: `Collect ${half(n)} bullseyes`, reward: { coins: 20 } },
      { id: 'g3', kind: 'aces', target: 1, text: 'Sink a hole in one', reward: { coins: 40 } },
      { id: 'g4', kind: 'points', target: 300, text: 'Reach 300 event points', reward: { coins: 30, chest: 'wood' } },
    ],
    rankRewards: rank('Ace of Aces'),
  },
  {
    kind: 'fewest', name: 'Fewest Strokes', holes: 5,
    blurb: 'A mixed card from every course. Go low: strokes under par score extra points.',
    scoring: { under: 18 },
    pick: () => true,
    currency: { id: 'flags', name: 'Flags', one: 'Flag', icon: '⛳', colour: '#f2c75c' },
    goals: n => [
      { id: 'g1', kind: 'rounds', target: 1, text: 'Play a weekend round', reward: { coins: 15 } },
      { id: 'g2', kind: 'currency', target: half(n), text: `Collect ${half(n)} flags`, reward: { coins: 20 } },
      { id: 'g3', kind: 'underPar', target: 2, text: 'Finish a round 2 under par', reward: { coins: 25, helpers: { mulligan: 1 } } },
      { id: 'g4', kind: 'points', target: 300, text: 'Reach 300 event points', reward: { coins: 30, chest: 'wood' } },
    ],
    rankRewards: rank('Low Card'),
  },
  {
    kind: 'crystals', name: 'Crystal Rush', holes: 6,
    blurb: 'Six holes glittering with crystals. Grab every last one before Sunday night.',
    pick: h => h.par <= 4,
    currency: { id: 'crystals', name: 'Crystals', one: 'Crystal', icon: '💎', colour: '#7fe0ff' },
    goals: n => [
      { id: 'g1', kind: 'rounds', target: 1, text: 'Play a weekend round', reward: { coins: 15 } },
      { id: 'g2', kind: 'currency', target: half(n), text: `Collect ${half(n)} crystals`, reward: { coins: 20 } },
      { id: 'g3', kind: 'currency', target: n, text: `Collect all ${n} crystals`, reward: { coins: 30, helpers: { magnet: 1 } } },
      { id: 'g4', kind: 'points', target: 300, text: 'Reach 300 event points', reward: { coins: 30, chest: 'wood' } },
    ],
    rankRewards: rank('Crystal Keeper'),
  },
];
