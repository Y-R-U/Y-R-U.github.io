export const HOUSING = [
  { tier: 0, id: 'bench', name: 'Park Bench', emoji: '🪑', cost: 0, mult: 1, offlineCapSec: 3600, xp: 0 },
  { tier: 1, id: 'bedsit', name: 'Bedsit', emoji: '🛏️', cost: 2e3, mult: 1.1, offlineCapSec: 2 * 3600, xp: 0.5, minAge: 0 },
  { tier: 2, id: 'apartment', name: 'Apartment', emoji: '🏢', cost: 5e6, mult: 1.25, offlineCapSec: 3 * 3600, xp: 0.5, minAge: 27, unlocks: 'partner' },
  { tier: 3, id: 'starter', name: 'Starter House', emoji: '🏠', cost: 5e8, mult: 1.5, offlineCapSec: 4 * 3600, xp: 0.5, minAge: 37, unlocks: 'kids' },
  { tier: 4, id: 'family', name: 'Family Home', emoji: '🏡', cost: 5e10, mult: 2, offlineCapSec: 6 * 3600, xp: 0.5, minAge: 44, unlocks: 'more kids' },
  { tier: 5, id: 'mansion', name: 'Mansion', emoji: '🏰', cost: 2e12, mult: 3, offlineCapSec: 8 * 3600, xp: 0.5, minAge: 52 },
];

export const PARTNERS = [
  { id: 'accountant', emoji: '🧮', perk: 'All costs −5%', cost: 0.95 },
  { id: 'entrepreneur', emoji: '🚀', perk: 'Income +10%', mult: 1.1 },
  { id: 'homebody', emoji: '🛋️', perk: 'Offline +1 h', offlineSec: 3600 },
];
export const PARTNER_NAMES = ['Robin', 'Alex', 'Sam', 'Jo', 'Kit', 'Noor', 'Remy', 'Ava', 'Theo', 'Mina', 'Luca', 'Iris'];
export const KID_NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Elsie', 'Finn', 'Gigi', 'Hugo', 'Ivy', 'Jude', 'Kai', 'Lola', 'Milo', 'Nell', 'Otis', 'Pia'];
export const HEIR_NAMES = ['Mags', 'Bert', 'Dot', 'Reg', 'Flo', 'Stan', 'Vi', 'Ned'];

export const LIFE = {
  ageMax: 72,
  xpYears: 1,
  xp: { unlock: 0.4, permit: 0.8, milestone: 0.02, partner: 0.3, birth: 0.2, dog: 0.2, perMinute: 0.5 },
  kidStages: [['baby', 0], ['toddler', 2], ['kid', 5], ['teen', 15]],
  firstBirthGap: 1,
  birthGap: 2,
  heirAge: 60,
  kidsAt: { 3: 1, 4: 3, 5: 3 },
  kidWorkMult: 1.1,
  dogPigeonChance: 1 / 3,
};

export const LEGACY = {
  e0: 6e17,
  power: 0.15,
  scale: 10,
  perPoint: 0.1,
  firstFloor: 2,
  recommendGain: 1,
  portrait: 0.01,
  plaque: 0.05,
  museum: 0.02,
  starterCashPerPoint: 100,
};
