export const EVENTS = [
  { id: 'pigeon', emoji: '🕊️', name: 'Golden pigeon', lifeSec: 10, reward: { kind: 'cashSec', sec: 20, jackpot: 0.1, jackpotMult: 5 } },
  { id: 'limo', emoji: '⭐', name: 'Celebrity limo', weight: 3, lifeSec: 20, reward: { kind: 'lineMult', mult: 7, sec: 30 } },
  { id: 'parade', emoji: '🎺', name: 'Parade', weight: 2, lifeSec: 20, reward: { kind: 'allMult', mult: 2, sec: 60 } },
  { id: 'wallet', emoji: '👛', name: 'Lost wallet', weight: 2, lifeSec: 15, reward: { kind: 'tickets', n: 2 } },
  { id: 'bulk', emoji: '📦', name: 'Bulk order', weight: 2, lifeSec: 20, reward: { kind: 'order', needSec: 40, windowSec: 120, cashSec: 90, crate: 'basic' } },
  { id: 'rush', emoji: '⏰', name: 'Rush Hour', weight: 2, lifeSec: 30, game: { sec: 15, max: 24 }, reward: { kind: 'rush', cashSec: 30, tiers: [[16, 'gold'], [9, 'silver'], [0, 'basic']] } },
  { id: 'lucky', emoji: '🎁', name: 'Lucky Delivery', weight: 1, lifeSec: 10, district: 'suburbs', game: { hits: 3 }, reward: { kind: 'lucky', crate: 'silver' } },
];
export const EVENT_GAP = [90, 180];
export const SPECIAL_GAP = [240, 420];
