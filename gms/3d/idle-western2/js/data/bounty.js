// "Fake Your Death" (W2). Bounty B = floor(scale · (allTime / e0)^power) over a whole outlaw career; each point is
// +perPoint income. The first fake death is always worth at least ×firstFloor. Each grave on Boot Hill adds +grave.
export const BOUNTY = {
  e0: 5e15,
  power: 0.15,
  scale: 10,
  perPoint: 0.1,
  firstFloor: 2,
  recommendGain: 1,
  grave: 0.01,
  starterCashPerPoint: 100,
  needDistrict: 'bankblock',
  needLine: 'undertaker',
};
