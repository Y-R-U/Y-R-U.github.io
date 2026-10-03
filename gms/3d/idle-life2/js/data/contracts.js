export const CONTRACTS = [
  { id: 'ot1', district: 'oldtown', emoji: '🏘️', text: 'Open all 3 Old Town lines', kind: 'ownDistrict', n: 3, reward: { tickets: 3 } },
  { id: 'ot2', district: 'oldtown', emoji: '🍋', text: 'Lemonade Lv 25', kind: 'lineLevel', lineId: 'lemonade', n: 25, reward: { tickets: 3 } },
  { id: 'ot3', district: 'oldtown', emoji: '🧺', text: 'Sell 10 piles', kind: 'pileTaps', n: 10, reward: { tickets: 2, crate: 'basic' } },
  { id: 'ot4', district: 'oldtown', emoji: '🛏️', text: 'Move into the Bedsit', kind: 'housing', n: 1, reward: { tickets: 3 } },
  { id: 'sb1', district: 'suburbs', emoji: '🕴', text: 'Hire 3 managers', kind: 'managers', n: 3, reward: { tickets: 4 } },
  { id: 'sb2', district: 'suburbs', emoji: '☕', text: 'Café Lv 25', kind: 'lineLevel', lineId: 'cafe', n: 25, reward: { tickets: 4, crate: 'basic' } },
  { id: 'sb3', district: 'suburbs', emoji: '🏡', text: 'Open all 3 Suburbs lines', kind: 'ownDistrict', n: 3, reward: { tickets: 4 } },
  { id: 'sb4', district: 'suburbs', emoji: '🧽', text: 'Car Wash Lv 25', kind: 'lineLevel', lineId: 'carwash', n: 25, reward: { tickets: 4, crate: 'basic' } },
  { id: 'hb1', district: 'harbour', emoji: '⚓', text: 'Open all 3 Harbour lines', kind: 'ownDistrict', n: 3, reward: { tickets: 6, crate: 'silver' } },
  { id: 'hb2', district: 'harbour', emoji: '🚚', text: 'Fully staff any line', kind: 'sigmaMax', n: 1, reward: { tickets: 5 } },
  { id: 'hb3', district: 'harbour', emoji: '🔗', text: 'Start the supply link', kind: 'supply', n: 1, reward: { tickets: 5 } },
  { id: 'hb4', district: 'harbour', emoji: '💞', text: 'Find a partner', kind: 'partner', n: 1, reward: { tickets: 5, crate: 'basic' } },
  { id: 'dt1', district: 'downtown', emoji: '🏙️', text: 'Open all 3 Downtown lines', kind: 'ownDistrict', n: 3, reward: { tickets: 8, crate: 'gold' } },
  { id: 'dt2', district: 'downtown', emoji: '🌙', text: 'Start a night shift', kind: 'nightShift', n: 1, reward: { tickets: 6 } },
  { id: 'dt3', district: 'downtown', emoji: '🎒', text: 'Equip 3 items', kind: 'equipped', n: 3, reward: { tickets: 6, crate: 'silver' } },
  { id: 'dt4', district: 'downtown', emoji: '🍝', text: 'Bistro Lv 50', kind: 'lineLevel', lineId: 'bistro', n: 50, reward: { tickets: 8, crate: 'silver' } },
];

export const DAILY_POOL = [
  { id: 'taps', emoji: '👆', text: 'Tap the town 200 times', stat: 'taps', n: 200 },
  { id: 'piles', emoji: '🧺', text: 'Sell 12 piles', stat: 'pileTaps', n: 12 },
  { id: 'events', emoji: '🕊️', text: 'Claim 3 events', stat: 'events', n: 3 },
  { id: 'levels', emoji: '⬆', text: 'Buy 40 levels', stat: 'levels', n: 40 },
  { id: 'upgrades', emoji: '🧍', text: 'Buy 3 upgrades', stat: 'upgrades', n: 3 },
  { id: 'couriers', emoji: '🛵', text: 'Tip 3 couriers', stat: 'couriers', n: 3, district: 'suburbs', needStat: 'couriers' },
  { id: 'rush', emoji: '⏰', text: 'Play a Rush Hour', stat: 'rush', n: 1 },
  { id: 'pigeons', emoji: '🕊️', text: 'Catch 2 golden pigeons', stat: 'pigeons', n: 2 },
];
export const DAILY_REWARD = { tickets: 2, crate: 'basic' };
export const DAILY_BONUS = { crate: 'silver' };

export const GIFT = [
  { tickets: 2 }, { crate: 'basic' }, { tickets: 4 }, { crate: 'silver' }, { tickets: 6 }, { crate: 'silver' }, { crate: 'gold', tickets: 5 },
];
