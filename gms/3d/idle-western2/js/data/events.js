// Random events (timed opportunities, never penalties). `art` picks the diegetic 3D actor in render/eventart.js
// (pigeon | limo | parade | wallet | bulk | rush | lucky) until western art exists. `lineless` events are placed in
// the hero shot instead of on a business. `frequent` events run on EVENT_GAP, the rest are weighted on SPECIAL_GAP.
// Reward kinds: cashSec {sec, jackpot, jackpotMult} · lineMult {mult, sec} · allMult {mult, sec}.
export const EVENTS = [
  { id: 'buzzard', art: 'pigeon', emoji: '🦅', name: 'Golden buzzard', frequent: true, lineless: true, lifeSec: 10, reward: { kind: 'cashSec', sec: 20, jackpot: 0.1, jackpotMult: 5 } },
  { id: 'stagecoach', art: 'limo', emoji: '🐴', name: 'Stagecoach', weight: 3, lifeSec: 20, reward: { kind: 'lineMult', mult: 7, sec: 30 } },
  { id: 'band', art: 'parade', emoji: '🎺', name: 'Brass band', weight: 2, lineless: true, lifeSec: 20, reward: { kind: 'allMult', mult: 2, sec: 60 } },
  { id: 'purse', art: 'wallet', emoji: '💰', name: 'Dropped purse', weight: 2, lineless: true, lifeSec: 15, reward: { kind: 'cashSec', sec: 40 } },
];
export const EVENT_GAP = [90, 180];
export const SPECIAL_GAP = [240, 420];
