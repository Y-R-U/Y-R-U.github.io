// The businesses. ONE ROW PER BUSINESS — the row order is the street order and the unlock order.
// Adding a business: append a row here, add js/render/plots/<id>.js, register it in js/render/plots/index.js. Nothing else.
// Numbers are placeholders until the economy lane tunes CURVE (see docs/ENGINE.md).
export const ECON = {
  pileMult: 1.0,
  returnHarvest: 1.5,
  sigma0: 0.6,
  sigmaWalkIn: 0.35,
  sigmaStep: 0.08,
  sigmaPrice: 1.1,
  shelfSec: 180,
  shelfStep: 2,
  milestones: [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000],
  milestoneMult: 2,
  tapK: 0.12,
  bootTap: 2,
  comboMax: 2,
  comboTaps: 20,
  comboWindow: 1.2,
  tapCrit: 0.03,
  tapCritMult: 5,
  saleCritMult: 3,
  critCap: 0.15,
  boostMult: [2, 2, 2, 3],
  hireMult: 2,
  offlineCapSec: 7200,
};

// actor: what leaves the plot with each sale (state/shipments.js SPEC: walker | courier | van | drone | boat).
// tint: van/marker colour. manager: the business's own hireable manager (state/managers.js trait kinds).
export const BUSINESSES = [
  {
    id: 'stable', name: 'Stable', emoji: '🐎', district: 'main', cycleSec: 2, unit: 'horse', actor: 'walker', tint: 0xc58a4a,
    throughput: [['🧑‍🌾', 'Stable hand'], ['🪧', 'Painted sign'], ['🐴', 'Second stall'], ['🛞', 'Wagon hire'], ['📯', 'Pony express']],
    boosts: [['🥕', 'Carrots'], ['🧽', 'Curry comb'], ['🏇', 'Racing tack'], ['🏆', 'Prize stud']],
    manager: { name: 'Dusty Pete', emoji: '🤠', trait: 'Quick Hands', kind: 'speed', value: 0.1, text: 'Works 10% faster' },
  },
  {
    id: 'saloon', name: 'Saloon', emoji: '🍺', district: 'main', cycleSec: 3, unit: 'glass', actor: 'walker', tint: 0x9c4a2f,
    throughput: [['🧑‍🍳', 'Second barkeep'], ['🎹', 'Piano man'], ['🃏', 'Card table'], ['🪑', 'More stools'], ['🚪', 'Swing doors']],
    boosts: [['🥃', 'Rotgut'], ['🍾', 'Fancy bottles'], ['🎵', 'Dance hall'], ['💎', 'Chandelier']],
    manager: { name: 'Big Martha', emoji: '👩‍🦰', trait: 'Bouncer', kind: 'sigma', value: 0.1, text: 'Sells 10% more on the spot' },
  },
  {
    id: 'store', name: 'General Store', emoji: '🛒', district: 'main', cycleSec: 4, unit: 'crate', actor: 'van', tint: 0x6f8f4e,
    throughput: [['🧍', 'Shop clerk'], ['📦', 'Back room'], ['🛻', 'Supply wagon'], ['📜', 'Mail order'], ['🚂', 'Rail freight']],
    boosts: [['🥫', 'Canned beans'], ['🧨', 'Dynamite'], ['🎩', 'Big hats'], ['⛏️', 'Gold pans']],
    manager: { name: 'Mr Pennywhistle', emoji: '🧔', trait: 'Penny Pincher', kind: 'cost', value: 0.05, text: 'Levels 5% cheaper here' },
  },
];

export const CURVE = {
  rate0: 1, rateStep: 20,
  unlockPay: [50, 40, 150, 280, 420, 560, 720, 900, 1050, 1150, 1250, 1350],
  levelPay: [8, 25, 60, 140, 220, 340, 450, 580, 740, 950, 1200, 1500],
  growth0: 1.1, growthStep: 0.004,
  thrK: 6, thrBase: 3,
  boostK: 8, boostBase: 40,
  stoK: 10, stoBase: 6,
};

const at = (arr, i) => arr[Math.min(i, arr.length - 1)];

export const LINES = BUSINESSES.map((b, i) => {
  const C = CURVE;
  const rate = i === 0 ? C.rate0 : C.rate0 * 3 * Math.pow(C.rateStep, i - 1);
  const baseCost = Math.round(rate * at(C.unlockPay, i));
  const levelCost = rate * at(C.levelPay, i);
  return {
    id: b.id, name: b.name, emoji: b.emoji, district: b.district, unit: b.unit, actor: b.actor || 'walker', tint: b.tint ?? 0xffffff,
    order: i,
    baseCost, levelCost, costGrowth: C.growth0 + C.growthStep * i, rate, cycleSec: b.cycleSec,
    managerCost: baseCost * ECON.hireMult,
    throughput: b.throughput.map(([glyph, name], k) => ({ glyph, name, cost: baseCost * C.thrBase * Math.pow(C.thrK, k), sigma: Math.min(1, ECON.sigma0 + ECON.sigmaStep * (k + 1)) })),
    boosts: b.boosts.map(([glyph, name], k) => ({ glyph, name, cost: baseCost * C.boostBase * Math.pow(C.boostK, k), mult: at(ECON.boostMult, k) })),
    storage: [0, 1, 2, 3].map((k) => baseCost * C.stoBase * Math.pow(C.stoK, k)),
  };
});

export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
