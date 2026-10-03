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
  comboMax: 2,
  comboTaps: 20,
  comboWindow: 1.2,
  tapCrit: 0.03,
  tapCritMult: 5,
  saleCritMult: 3,
  critCap: 0.15,
  canValue: 2,
  boostMult: [2, 2, 2, 3],
  hireMult: 2,
};

const RAW = [
  ['lemonade', 'Lemonade', '🍋', 'oldtown', 2, 'cup', 'chef',
    [['🧍', 'Extra server'], ['🪧', 'Sandwich board'], ['🛒', 'Second cart'], ['🚲', 'Bike seller'], ['📢', 'Street crier']],
    [['🧊', 'Ice box'], ['🍋', 'Fresh lemons'], ['🍯', 'Honey syrup'], ['🌿', 'Mint sprigs']]],
  ['foodtruck', 'Food Truck', '🌮', 'oldtown', 3, 'taco', 'chef',
    [['🧑‍🍳', 'Second cook'], ['🪟', 'Wider hatch'], ['🪑', 'Picnic tables'], ['📱', 'Order app'], ['🚚', 'Second truck']],
    [['🌶️', 'Hot sauce'], ['🥑', 'Guacamole'], ['🧀', 'Extra cheese'], ['🔥', 'Charcoal grill']]],
  ['barber', 'Barber', '💈', 'oldtown', 4, 'chair', 'charmer',
    [['💺', 'Second chair'], ['🪞', 'Big mirror'], ['📰', 'Waiting magazines'], ['🗓️', 'Booking book'], ['💈', 'Neon pole']],
    [['✂️', 'Gold scissors'], ['🧴', 'Hot towels'], ['🪒', 'Straight razor'], ['🎵', 'Jukebox']]],
  ['cafe', 'Café', '☕', 'suburbs', 5, 'cup', 'chef',
    [['🧑‍🍳', 'Second barista'], ['🪟', 'Takeaway hatch'], ['🛵', 'Scooter delivery'], ['🪑', 'Garden seats'], ['📱', 'Mobile orders']],
    [['🫘', 'Single-origin beans'], ['🥐', 'Croissants'], ['🍰', 'Cake counter'], ['🎨', 'Latte art']]],
  ['carwash', 'Car Wash', '🧽', 'suburbs', 6, 'car', 'mechanic',
    [['🚿', 'Second hose'], ['🧹', 'Vacuum bay'], ['🚗', 'Second lane'], ['🤖', 'Wash arch'], ['🅿️', 'Queue lot']],
    [['🫧', 'Foam cannon'], ['✨', 'Wax shine'], ['🧽', 'Microfibre'], ['🌈', 'Rainbow rinse']]],
  ['petsalon', 'Pet Salon', '🐩', 'suburbs', 7, 'pet', 'charmer',
    [['🛁', 'Second tub'], ['🧺', 'Drying rack'], ['🚐', 'Pet taxi'], ['🦴', 'Waiting pen'], ['📅', 'Regulars club']],
    [['🎀', 'Bows'], ['🧴', 'Fancy shampoo'], ['💅', 'Paw-dicure'], ['👑', 'Show grooming']]],
  ['fishchips', 'Fish & Chips', '🐟', 'harbour', 8, 'portion', 'chef',
    [['🍟', 'Second fryer'], ['🪟', 'Hatch counter'], ['🛵', 'Moped runs'], ['🪑', 'Harbour benches'], ['📦', 'Takeaway boxes']],
    [['🐟', 'Day-boat cod'], ['🥫', 'Mushy peas'], ['🍋', 'Lemon wedges'], ['🧂', 'Sea salt']]],
  ['ferry', 'Ferry', '⛴️', 'harbour', 10, 'passenger', 'mechanic',
    [['🎟️', 'Ticket booth'], ['🚏', 'Second gangway'], ['🕰️', 'Timetable'], ['⛴️', 'Second ferry'], ['🌉', 'Night crossing']],
    [['⚓', 'New anchor'], ['🛟', 'Lifebuoys'], ['☕', 'Deck café'], ['🎶', 'Deck band']]],
  ['boatyard', 'Boatyard', '⛵', 'harbour', 12, 'boat', 'mechanic',
    [['🔨', 'Second slipway'], ['🏗️', 'Crane'], ['🚛', 'Trailer'], ['🧑‍🔧', 'Apprentice'], ['⚙️', 'Winch']],
    [['🪵', 'Teak decks'], ['🎨', 'Custom paint'], ['⛵', 'Racing sails'], ['🛥️', 'Motor launch']]],
  ['boutique', 'Boutique', '👗', 'downtown', 14, 'outfit', 'charmer',
    [['🛍️', 'Shop assistant'], ['🪞', 'Fitting rooms'], ['🧾', 'Tap to pay'], ['📦', 'Courier'], ['🌐', 'Web shop']],
    [['✨', 'Sequins'], ['🧵', 'Silk lining'], ['📸', 'Lookbook'], ['💎', 'Couture line']]],
  ['bistro', 'Bistro', '🍝', 'downtown', 16, 'plate', 'chef',
    [['🍽️', 'Extra waiter'], ['🪑', 'Terrace'], ['📖', 'Bookings'], ['🛵', 'Delivery'], ['🌙', 'Late sitting']],
    [['🍷', 'Wine list'], ['🧀', 'Cheese trolley'], ['🍰', 'Pastry chef'], ['⭐', 'Star chef']]],
  ['appstudio', 'App Studio', '💻', 'downtown', 20, 'app', 'banker',
    [['👩‍💻', 'Second dev'], ['🖥️', 'Bigger screens'], ['☁️', 'Cloud servers'], ['📈', 'App store ads'], ['🌍', 'Go global']],
    [['☕', 'Coffee machine'], ['🧠', 'AI assistant'], ['🎮', 'Game hit'], ['🦄', 'Unicorn round']]],
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

export const LINES = RAW.map(([id, name, emoji, district, cycleSec, unit, talent, thr, boosts], i) => {
  const C = CURVE;
  const rate = i === 0 ? C.rate0 : C.rate0 * 3 * Math.pow(C.rateStep, i - 1);
  const baseCost = Math.round(rate * C.unlockPay[i]);
  const levelCost = rate * C.levelPay[i];
  const g = C.growth0 + C.growthStep * i;
  return {
    id, name, emoji, district, unit, talent,
    order: i,
    baseCost, levelCost, costGrowth: g, rate, cycleSec,
    managerCost: baseCost * ECON.hireMult,
    throughput: thr.map(([glyph, nm], k) => ({ glyph, name: nm, cost: baseCost * C.thrBase * Math.pow(C.thrK, k), sigma: Math.min(1, ECON.sigma0 + ECON.sigmaStep * (k + 1)) })),
    boosts: boosts.map(([glyph, nm], k) => ({ glyph, name: nm, cost: baseCost * C.boostBase * Math.pow(C.boostK, k), mult: ECON.boostMult[k] })),
    storage: [0, 1, 2, 3].map((k) => baseCost * C.stoBase * Math.pow(C.stoK, k)),
    throughputGlyph: '+' + thr[0][0],
    boostGlyph: '+' + boosts[0][0],
  };
});

export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));

export const TALENTS = {
  chef: { id: 'chef', name: 'Chef', emoji: '🧑‍🍳', text: 'Food lines ×1.25', lines: ['lemonade', 'foodtruck', 'cafe', 'fishchips', 'bistro'], mult: 1.25 },
  charmer: { id: 'charmer', name: 'Charmer', emoji: '😎', text: 'Event rewards ×2', events: 2 },
  mechanic: { id: 'mechanic', name: 'Mechanic', emoji: '🔧', text: 'Car Wash, Ferry, Boatyard ×1.5', lines: ['carwash', 'ferry', 'boatyard'], mult: 1.5 },
  banker: { id: 'banker', name: 'Banker', emoji: '💼', text: 'All costs −10%', cost: 0.9 },
  dreamer: { id: 'dreamer', name: 'Dreamer', emoji: '💭', text: 'Offline cap +2 h', offlineSec: 7200 },
};
