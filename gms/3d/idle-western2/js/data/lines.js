// The businesses of Dribble Creek. ONE ROW PER BUSINESS — the row order is the street order and the unlock order.
// Business ids are STABLE (plots, saves and audio key off them): shine tubs livery saloon dentist garter undertaker jail bank.
// Numbers come from CURVE by row index (docs/ECONOMY.md). `build` = how the business is acquired (W13):
//   acq 'built' plays the 5-stage Mulligan build over T s; 'poker' | 'takeover' | 'bought' play a fixed-T cutscene.
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
  tapFloor: 1,
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
  tapRate: 8,
  tapBurst: 10,
  saveSec: 60,
  saveBestSec: 30,
};

export const BUSINESSES = [
  {
    id: 'shine', name: 'Spit & Shine', emoji: '🥾', district: 'lower', cycleSec: 2, unit: 'boot', actor: 'walker', tint: 0x8a5a3a,
    build: { acq: 'built', T: 6 },
    throughput: [['🧒', 'Another shoeshine kid'], ['🪑', 'Second stool'], ['🪧', '"NO HORSE" sign'], ['🫙', 'Bulk spit jar'], ['📣', 'Kid with a megaphone']],
    boosts: [['🫙', 'Better spit'], ['🧴', 'Mystery polish'], ['✨', 'Mirror finish'], ['🥇', 'Shine so bright it blinds']],
    manager: { name: "Lil' Nubbin", emoji: '🧒', bark: 'nubbin', trait: 'Works for Candy', kind: 'speed', value: 0.1, text: 'Works 10% faster' },
  },
  {
    id: 'tubs', name: 'Tuppenny Tubs', emoji: '🛁', district: 'lower', cycleSec: 3, unit: 'bath', actor: 'walker', tint: 0x6f9aa8,
    build: { acq: 'built', T: 8 }, sign: 'Water Changed Tuesdays',
    throughput: [['🛁', 'Another tub'], ['🔥', 'Bigger kettle'], ['🧼', 'Communal soap (one)'], ['🪣', 'Bucket on a rope'], ['👬', 'Tub for two (strangers)']],
    boosts: [['🦆', 'Rubber ducks'], ['🫧', 'Bubbles (soap-adjacent)'], ['🌸', 'Lavender, to hide it'], ['📅', 'Water changed Wednesdays too']],
    manager: { name: 'Pickles McGurk', emoji: '🥴', bark: 'pickles', trait: "He's Always Here Anyway", kind: 'offline', value: 3600, text: 'Offline cap +1 h' },
  },
  {
    id: 'livery', name: 'Hoof & Mouth Livery', emoji: '🐴', district: 'lower', cycleSec: 4, unit: 'horse', actor: 'courier', tint: 0xa8743f,
    build: { acq: 'built', T: 20 },
    throughput: [['🐴', 'Another stall'], ['🧲', 'Horseshoe rack'], ['🔨', 'Anvil that sparks'], ['🛞', 'Wagon hire'], ['📯', 'Pony express (ish)']],
    boosts: [['🥕', 'Carrots'], ['🪮', 'Mane braiding'], ['💩', '"Prairie fertiliser"'], ['🏇', 'Racing tack']],
    manager: { name: 'Hortense Hoofnagle', emoji: '👩‍🌾', bark: 'hortense', trait: 'Horse Whisperer', kind: 'shelf', value: 0.5, text: 'Shelf ×1.5' },
  },
  {
    id: 'saloon', name: 'The Thirsty Gizzard', emoji: '🥃', district: 'saloonrow', cycleSec: 5, unit: 'glass', actor: 'walker', tint: 0x9c4a2f,
    build: { acq: 'poker', T: 8 },
    throughput: [['🍺', 'Another tap'], ['🪑', 'Sturdier stools'], ['🃏', 'Card table'], ['🚪', 'Spring-loaded doors'], ['🧑‍🍳', 'Second barkeep']],
    boosts: [['🥃', 'Rotgut'], ['🎹', 'Piano tuning (it never was)'], ['🛁', '"House beer"'], ['💎', 'Chandelier to swing on']],
    manager: { name: 'Big Mabel Boggs', emoji: '💪', bark: 'mabel', trait: 'Nobody Leaves Without Paying', kind: 'sigma', value: 0.1, text: 'Sells 10% more on the spot' },
  },
  {
    id: 'dentist', name: 'Pull & Pray', emoji: '💈', district: 'saloonrow', cycleSec: 6, unit: 'tooth', actor: 'walker', tint: 0xc9473a,
    build: { acq: 'built', T: 30 }, sign: 'Barber · Dentist · Surgeon',
    throughput: [['💺', 'Another chair'], ['🪞', 'Mirror, for screaming'], ['🥃', 'Whiskey anaesthetic'], ['🔧', 'Bigger pliers'], ['🪚', 'Surgery Tuesdays']],
    boosts: [['🦷', 'Gold fillings'], ['🧴', 'Hot towels'], ['🪒', 'Sharper razor'], ['🙏', 'More praying']],
    manager: { name: '"Pliers" Pete', emoji: '😁', bark: 'pete', trait: 'Tooth Collector', kind: 'teeth', value: 50, text: 'Every 50th customer leaves a 🦷' },
  },
  {
    id: 'garter', name: 'The Velvet Garter', emoji: '🎀', sundayName: 'The Velvet Garter Dance Hall', district: 'saloonrow', cycleSec: 8, unit: 'gentleman', actor: 'walker', tint: 0xd98aa8,
    build: { acq: 'built', T: 45 }, sign: "A Gentlemen's Social Parlour",
    throughput: [['💃', 'Another hostess'], ['🛋️', 'Fainting couch'], ['🎻', 'String trio'], ['🪟', 'Wider back window'], ['🚪', 'Discreet side door']],
    boosts: [['🪶', 'Feather boas'], ['🍾', 'Champagne (cider)'], ['👠', 'Can-can line'], ['🤫', 'Discretion, extra']],
    manager: { name: 'Madame Lulu LaRue', emoji: '💋', bark: 'lulu', trait: 'Hears Everything First', kind: 'events', value: 0.5, text: 'Event rewards ×1.5' },
  },
  {
    id: 'undertaker', name: 'Boot Hill Undertakers', emoji: '⚰️', district: 'bankblock', cycleSec: 10, unit: 'client', actor: 'van', tint: 0x3e2f28,
    build: { acq: 'takeover', T: 8 },
    throughput: [['⚰️', 'Another gravedigger'], ['📏', 'Longer tape measure'], ['🐎', 'Faster hearse'], ['🎟️', 'Funeral tickets'], ['🪦', 'Bulk headstones']],
    boosts: [['🌹', 'Premium grief'], ['🎻', 'Weeping violinist'], ['🪵', 'Oak, for people with friends'], ['🦅', 'Trained vultures']],
    manager: { name: 'Mortimer Grimsby', emoji: '🎩', bark: 'mortimer', trait: 'Loves a Duel', kind: 'duel', value: 1, text: 'Duel rewards ×2' },
  },
  {
    id: 'jail', name: 'Sheriff & Jail', emoji: '⭐', district: 'bankblock', cycleSec: 12, unit: 'drunk', actor: 'walker', tint: 0x6a6a7a,
    build: { acq: 'bought', T: 8 },
    throughput: [['🔒', 'Another cell'], ['🗝️', 'Spare key (hidden)'], ['🛢️', 'Bigger barrel'], ['📜', 'More wanted posters'], ['🚓', 'Jail wagon']],
    boosts: [['🎻', 'Cell choir (fined for noise)'], ['🫘', 'Bail-worthy beans'], ['⭐', 'Bigger badge'], ['🧾', 'Fines for everything']],
    manager: { name: 'Sheriff Wendell Pryce', emoji: '😰', bark: 'wendell', trait: 'Prefers It Quiet', kind: 'quiet', value: 0.25, text: '+25% while no event is running' },
  },
  {
    id: 'bank', name: 'First & Last Bank', emoji: '🏦', district: 'bankblock', cycleSec: 15, unit: 'moneybag', actor: 'van', tint: 0x5f7a5a,
    build: { acq: 'bought', T: 8 }, sign: 'First & Last Bank of Dribble Creek',
    throughput: [['🧾', 'Another teller'], ['🪟', 'Teller cage'], ['🖋️', 'Fine print'], ['📈', 'Interest (theirs)'], ['🚂', 'Rail deposits']],
    boosts: [['🔐', 'Bigger vault'], ['🕳️', '"NO GUNS" sign'], ['🧂', 'Smelling salts'], ['💰', 'Compound interest (yours)']],
    manager: { name: 'Ebenezer Thrupp', emoji: '🧐', bark: 'thrupp', trait: 'Counts Twice', kind: 'cost', value: 0.05, text: 'Levels 5% cheaper here' },
  },
];

// rate(i) = rate0 · 3 · rateStep^(i−1); costs are rate × the per-row multipliers below (docs/ECONOMY.md §1).
export const CURVE = {
  rate0: 1, rateStep: 20,
  unlockPay: [50, 40, 90, 240, 420, 560, 720, 900, 1050],
  levelPay: [8, 25, 60, 140, 220, 340, 450, 580, 740],
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
    sundayName: b.sundayName || null, sign: b.sign || b.name,
    order: i,
    acq: b.build.acq, buildT: b.build.T,
    baseCost, levelCost, costGrowth: C.growth0 + C.growthStep * i, rate, cycleSec: b.cycleSec,
    managerCost: baseCost * ECON.hireMult,
    throughput: b.throughput.map(([glyph, name], k) => ({ glyph, name, cost: baseCost * C.thrBase * Math.pow(C.thrK, k), sigma: Math.min(1, ECON.sigma0 + ECON.sigmaStep * (k + 1)) })),
    boosts: b.boosts.map(([glyph, name], k) => ({ glyph, name, cost: baseCost * C.boostBase * Math.pow(C.boostK, k), mult: at(ECON.boostMult, k) })),
    storage: [0, 1, 2, 3].map((k) => baseCost * C.stoBase * Math.pow(C.stoK, k)),
    throughputGlyph: '+' + b.throughput[0][0],
    boostGlyph: '+' + b.boosts[0][0],
  };
});

export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));

// Gag links (DESIGN_CHALLENGE §5.1: cosmetic walkers with a token bonus). On when both are open and `from` is Lv ≥ minLv.
export const LINKS = [
  { id: 'tubs>saloon', from: 'tubs', to: 'saloon', mult: 0.05, minLv: 25, text: 'Bathwater sold as "house beer"' },
  { id: 'saloon>dentist', from: 'saloon', to: 'dentist', mult: 0.05, minLv: 25, text: 'Bar fights supply the dentist' },
  { id: 'garter>bank', from: 'garter', to: 'bank', mult: 0.05, minLv: 25, text: 'Hush money is a deposit too' },
];
