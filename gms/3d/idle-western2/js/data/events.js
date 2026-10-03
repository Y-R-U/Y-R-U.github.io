// Timed opportunities, never penalties. `art` names the 3D actor (render/eventart.js; unknown keys fall back to a parcel).
// `frequent` events run on EVENT_GAP. Specials (the rest) are weighted on SPECIAL_GAP (≥ 8 min apart, W8): they spawn
// in a wind-up ('special:wind'), start only when the UI calls act 'special:begin' (hero visible, W9), else expire.
// `lineId` pins an event to a business; `lineless` events play in the hero shot; otherwise a random open business.
// Reward kinds: cashSec {sec, jackpot, jackpotMult, jackpotTeeth} · lineMult {mult, sec} · allMult {mult, sec}
//   duel {gold, silver (ms), cashSec, boxes, lineMult} · brawl {hitSec, max, silverAt, mults} · robbery {cashSec, max, tiers, teeth}.
export const EVENTS = [
  { id: 'tumbleweed', art: 'tumbleweed', emoji: '🌵', name: 'Golden Tumbleweed', frequent: true, lineless: true, lifeSec: 10, reward: { kind: 'cashSec', sec: 20, jackpot: 0.1, jackpotMult: 3, jackpotTeeth: 1 } },
  { id: 'duel', art: 'duel', emoji: '🤠', name: 'High Noon Duel', weight: 3, lineless: true, lifeSec: 25, game: { sec: 20 },
    reward: { kind: 'duel', gold: 380, silver: 550, cashSec: 10, boxes: { gold: 'gold', silver: 'silver', basic: 'basic' }, lineMult: { lineId: 'undertaker', mult: 2, sec: 60 } } },
  { id: 'brawl', art: 'brawl', emoji: '🍺', name: 'Bar Brawl', weight: 2, lineId: 'saloon', lifeSec: 25, game: { sec: 12, max: 7 },
    reward: { kind: 'brawl', hitSec: 4, max: 7, silverAt: 5, mults: [{ lineId: 'dentist', mult: 2, sec: 30 }, { lineId: 'jail', mult: 2, sec: 30 }] } },
  { id: 'robbery', art: 'robbery', emoji: '💰', name: 'Bank Robbery', weight: 2, lineId: 'bank', lifeSec: 25, game: { sec: 15, max: 24 },
    reward: { kind: 'robbery', cashSec: 30, max: 24, tiers: [[16, 'gold'], [9, 'silver'], [0, 'basic']], teeth: 2 } },
  { id: 'stagecoach', art: 'stagecoach', emoji: '🐎', name: 'Stagecoach', weight: 2, lifeSec: 30, reward: { kind: 'lineMult', mult: 4, sec: 30 } },
];
export const EVENT_GAP = [90, 180];
export const SPECIAL_GAP = [480, 600];
// Seconds from the first business opening to the first tumbleweed (scripted ~1:00) and the first special.
export const FIRST_EVENT = { frequent: 25, special: 300 };
