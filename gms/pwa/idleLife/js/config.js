// ============================================================
// LIFE IDLE - Game Configuration
// All game data: jobs, businesses, upgrades, events
// ============================================================

const VERSION = '1.0.0';

// Spritesheet layout: 128x128 per tile, 8 columns wide
// Row 0 (y=0):   Character stages 0–7
// Row 1 (y=128): Job icons 0–7
// Row 2 (y=256): Business icons 0–9
// Row 3 (y=384): Business icons 10–17
// Row 4 (y=512): UI elements (coin, star, lightning, event)
const SPRITE = {
  tileSize: 128,
  cols: 8,
  path: 'assets/spritesheet.png',
  exists: false // set to true once spritesheet.png is placed in /assets/
};

// ============================================================
// CHARACTER STAGES  (emoji fallbacks while spritesheet missing)
// ============================================================
const CHARACTER_STAGES = [
  { emoji: '🧹', label: 'Street Sweeper',  minPrestige: 0 },
  { emoji: '🪧', label: 'Worker',           minPrestige: 0,  unlockCoins: 500 },
  { emoji: '👔', label: 'Employee',         minPrestige: 0,  unlockCoins: 50000 },
  { emoji: '💼', label: 'Professional',     minPrestige: 0,  unlockCoins: 5e6 },
  { emoji: '🏪', label: 'Small Business',   minPrestige: 0,  unlockCoins: 1e9 },
  { emoji: '🏬', label: 'Entrepreneur',     minPrestige: 0,  unlockCoins: 1e12 },
  { emoji: '🏛️', label: 'Corporation',      minPrestige: 0,  unlockCoins: 1e15 },
  { emoji: '🌍', label: 'Mogul',            minPrestige: 0,  unlockCoins: 1e18 }
];

// ============================================================
// JOBS  (hire workers; each worker generates income/sec)
// ============================================================
// unlockAt: total coins EVER EARNED to unlock this job
// costHireBase: cost of first worker
// costGrowth: multiplier per worker hired (cookie-clicker style)
// incomePerWorker: coins/sec per worker owned
// clickBonus: coins per click added per worker owned
// spriteRow/Col: position on spritesheet row 1
// ============================================================
const JOBS = [
  {
    id: 'sweeper',
    name: 'Street Sweeper',
    emoji: '🧹',
    description: 'Sweep streets in front of businesses for loose change.',
    unlockAt: 0,
    costHireBase: 10,
    costGrowth: 1.07,
    incomePerWorker: 0.1,
    clickBonus: 0.5,
    spriteRow: 1, spriteCol: 0
  },
  {
    id: 'sign_holder',
    name: 'Sign Holder',
    emoji: '🪧',
    description: 'Hold advertising signs on street corners.',
    unlockAt: 100,
    costHireBase: 75,
    costGrowth: 1.08,
    incomePerWorker: 0.5,
    clickBonus: 1,
    spriteRow: 1, spriteCol: 1
  },
  {
    id: 'paper_delivery',
    name: 'Newspaper Delivery',
    emoji: '📰',
    description: 'Early morning paper routes.',
    unlockAt: 1000,
    costHireBase: 500,
    costGrowth: 1.09,
    incomePerWorker: 2,
    clickBonus: 3,
    spriteRow: 1, spriteCol: 2
  },
  {
    id: 'fast_food',
    name: 'Fast Food Worker',
    emoji: '🍔',
    description: 'Flip burgers and work the register.',
    unlockAt: 8000,
    costHireBase: 3000,
    costGrowth: 1.10,
    incomePerWorker: 10,
    clickBonus: 8,
    spriteRow: 1, spriteCol: 3
  },
  {
    id: 'office_assist',
    name: 'Office Assistant',
    emoji: '🖨️',
    description: 'Filing, printing, and making coffee.',
    unlockAt: 80000,
    costHireBase: 20000,
    costGrowth: 1.11,
    incomePerWorker: 60,
    clickBonus: 30,
    spriteRow: 1, spriteCol: 4
  },
  {
    id: 'security',
    name: 'Security Guard',
    emoji: '🛡️',
    description: 'Keep the premises safe.',
    unlockAt: 500000,
    costHireBase: 100000,
    costGrowth: 1.12,
    incomePerWorker: 350,
    clickBonus: 100,
    spriteRow: 1, spriteCol: 5
  }
];

// ============================================================
// BUSINESSES  (own & level up; generate passive income/sec)
// ============================================================
// unlockAt: total coins EVER EARNED to show in shop
// baseCost: cost at level 1
// levelCostMultiplier: cost to level up is baseCost * levelCostMultiplier^(currentLevel)
// baseIncome: coins/sec at level 1
// incomeGrowth: income multiplier per level
// maxLevel: maximum upgrade level
// spriteRow/Col: position on spritesheet rows 2-3
// ============================================================
const BUSINESSES = [
  // -- Small Businesses --
  {
    id: 'food_truck',
    name: 'Food Truck',
    emoji: '🚚',
    tier: 'Small',
    description: 'Hit the streets with your own mobile kitchen.',
    unlockAt: 200000,
    baseCost: 500000,
    levelCostMultiplier: 3.5,
    baseIncome: 2000,
    incomeGrowth: 2.2,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 0
  },
  {
    id: 'barber',
    name: 'Barber Shop',
    emoji: '💈',
    tier: 'Small',
    description: 'Fresh cuts for the neighbourhood.',
    unlockAt: 2000000,
    baseCost: 2000000,
    levelCostMultiplier: 3.5,
    baseIncome: 8000,
    incomeGrowth: 2.2,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 1
  },
  {
    id: 'cafe',
    name: 'Corner Café',
    emoji: '☕',
    tier: 'Small',
    description: 'Artisan coffee and pastries.',
    unlockAt: 1e7,
    baseCost: 1e7,
    levelCostMultiplier: 3.5,
    baseIncome: 40000,
    incomeGrowth: 2.2,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 2
  },
  // -- Medium Businesses --
  {
    id: 'restaurant',
    name: 'Restaurant',
    emoji: '🍽️',
    tier: 'Medium',
    description: 'Full-service dining experience.',
    unlockAt: 4e7,
    baseCost: 5e7,
    levelCostMultiplier: 4,
    baseIncome: 200000,
    incomeGrowth: 2.5,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 3
  },
  {
    id: 'boutique',
    name: 'Boutique Store',
    emoji: '👗',
    tier: 'Medium',
    description: 'High-end fashion retail.',
    unlockAt: 2e8,
    baseCost: 2.5e8,
    levelCostMultiplier: 4,
    baseIncome: 1e6,
    incomeGrowth: 2.5,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 4
  },
  {
    id: 'carwash',
    name: 'Car Wash',
    emoji: '🚗',
    tier: 'Medium',
    description: 'Automated wash and detail services.',
    unlockAt: 8e8,
    baseCost: 1e9,
    levelCostMultiplier: 4,
    baseIncome: 5e6,
    incomeGrowth: 2.5,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 5
  },
  // -- Large Businesses --
  {
    id: 'hotel',
    name: 'Luxury Hotel',
    emoji: '🏨',
    tier: 'Large',
    description: 'Five-star hospitality empire.',
    unlockAt: 4e9,
    baseCost: 5e9,
    levelCostMultiplier: 5,
    baseIncome: 25e6,
    incomeGrowth: 3,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 6
  },
  {
    id: 'mall',
    name: 'Shopping Mall',
    emoji: '🏬',
    tier: 'Large',
    description: 'Anchor store for an entire district.',
    unlockAt: 2e10,
    baseCost: 2.5e10,
    levelCostMultiplier: 5,
    baseIncome: 125e6,
    incomeGrowth: 3,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 7
  },
  {
    id: 'techco',
    name: 'Tech Company',
    emoji: '💻',
    tier: 'Large',
    description: 'Software products used globally.',
    unlockAt: 8e10,
    baseCost: 1e11,
    levelCostMultiplier: 5,
    baseIncome: 600e6,
    incomeGrowth: 3,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 0
  },
  // -- Corporations --
  {
    id: 'chain',
    name: 'Restaurant Chain',
    emoji: '🍟',
    tier: 'Corp',
    description: 'Hundreds of locations nationwide.',
    unlockAt: 4e11,
    baseCost: 5e11,
    levelCostMultiplier: 6,
    baseIncome: 3e9,
    incomeGrowth: 3.5,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 1
  },
  {
    id: 'logistics',
    name: 'Logistics Corp',
    emoji: '🚛',
    tier: 'Corp',
    description: 'Fleet of trucks crossing continents.',
    unlockAt: 2e12,
    baseCost: 2e12,
    levelCostMultiplier: 6,
    baseIncome: 15e9,
    incomeGrowth: 3.5,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 2
  },
  {
    id: 'realestate',
    name: 'Real Estate Empire',
    emoji: '🏙️',
    tier: 'Corp',
    description: 'Skyscrapers in every major city.',
    unlockAt: 8e12,
    baseCost: 1e13,
    levelCostMultiplier: 6,
    baseIncome: 80e9,
    incomeGrowth: 3.5,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 3
  },
  // -- Multinationals --
  {
    id: 'intlcorp',
    name: 'International Corp',
    emoji: '🌐',
    tier: 'Multinational',
    description: 'Operations spanning six continents.',
    unlockAt: 4e13,
    baseCost: 5e13,
    levelCostMultiplier: 8,
    baseIncome: 400e9,
    incomeGrowth: 4,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 4
  },
  {
    id: 'techgiant',
    name: 'Tech Giant',
    emoji: '🛰️',
    tier: 'Multinational',
    description: 'Satellites, AI, and everything else.',
    unlockAt: 2e14,
    baseCost: 2.5e14,
    levelCostMultiplier: 8,
    baseIncome: 2e12,
    incomeGrowth: 4,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 5
  },
  {
    id: 'megacorp',
    name: 'Global Conglomerate',
    emoji: '👑',
    tier: 'Multinational',
    description: 'You own it all. The world is yours.',
    unlockAt: 1e15,
    baseCost: 1e15,
    levelCostMultiplier: 10,
    baseIncome: 1e13,
    incomeGrowth: 4.5,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 6
  }
];

// ============================================================
// UPGRADES  (one-time purchases; multiply income/clicks)
// ============================================================
// type: 'click' | 'job' | 'business' | 'global'
// targetId: job or business id (or 'all')
// multiplier: income multiplied by this
// unlockAt: total coins ever earned
// ============================================================
const UPGRADES = [
  // --- Click upgrades ---
  { id: 'click_1',  name: 'Better Technique',      emoji: '👆', type: 'click', multiplier: 2,  cost: 100,     unlockAt: 0,      description: 'Double your tap power.' },
  { id: 'click_2',  name: 'Calloused Hands',        emoji: '💪', type: 'click', multiplier: 2,  cost: 5000,    unlockAt: 1000,   description: 'Double tap power again.' },
  { id: 'click_3',  name: 'Work Ethic',             emoji: '⚡', type: 'click', multiplier: 3,  cost: 100000,  unlockAt: 20000,  description: 'Triple your tap power.' },
  { id: 'click_4',  name: 'Power Tapping',          emoji: '🤜', type: 'click', multiplier: 5,  cost: 5e6,     unlockAt: 1e6,    description: '5× tap power.' },
  { id: 'click_5',  name: 'Automation Assistant',   emoji: '🤖', type: 'click', multiplier: 10, cost: 1e9,     unlockAt: 2e8,    description: '10× tap power.' },

  // --- Job upgrades ---
  { id: 'swp_up1',  name: 'Better Broom',           emoji: '🧹', type: 'job', targetId: 'sweeper',     multiplier: 2, cost: 200,     unlockAt: 50,     description: '2× Street Sweeper income.' },
  { id: 'swp_up2',  name: 'Industrial Sweeper',     emoji: '🚜', type: 'job', targetId: 'sweeper',     multiplier: 5, cost: 5000,    unlockAt: 2000,   description: '5× Street Sweeper income.' },
  { id: 'sgn_up1',  name: 'Eye-Catching Sign',      emoji: '📢', type: 'job', targetId: 'sign_holder', multiplier: 2, cost: 1500,    unlockAt: 500,    description: '2× Sign Holder income.' },
  { id: 'sgn_up2',  name: 'LED Sign',               emoji: '💡', type: 'job', targetId: 'sign_holder', multiplier: 5, cost: 30000,   unlockAt: 10000,  description: '5× Sign Holder income.' },
  { id: 'ppr_up1',  name: 'Electric Bike',          emoji: '🛵', type: 'job', targetId: 'paper_delivery', multiplier: 2, cost: 8000, unlockAt: 3000,   description: '2× Paper Delivery income.' },
  { id: 'ppr_up2',  name: 'Drone Delivery',         emoji: '🚁', type: 'job', targetId: 'paper_delivery', multiplier: 5, cost: 200000, unlockAt: 50000, description: '5× Paper Delivery income.' },
  { id: 'fst_up1',  name: 'Extra Fryer',            emoji: '🍟', type: 'job', targetId: 'fast_food',   multiplier: 2, cost: 50000,   unlockAt: 20000,  description: '2× Fast Food income.' },
  { id: 'fst_up2',  name: 'Drive-Thru',             emoji: '🚘', type: 'job', targetId: 'fast_food',   multiplier: 5, cost: 1e6,     unlockAt: 300000, description: '5× Fast Food income.' },
  { id: 'ofc_up1',  name: 'Standing Desk',          emoji: '🖥️', type: 'job', targetId: 'office_assist', multiplier: 2, cost: 300000, unlockAt: 100000, description: '2× Office income.' },
  { id: 'ofc_up2',  name: 'AI Copilot',             emoji: '🤖', type: 'job', targetId: 'office_assist', multiplier: 5, cost: 8e6,    unlockAt: 2e6,   description: '5× Office income.' },
  { id: 'sec_up1',  name: 'Better Equipment',       emoji: '🔦', type: 'job', targetId: 'security',    multiplier: 2, cost: 2e6,     unlockAt: 600000, description: '2× Security income.' },
  { id: 'sec_up2',  name: 'Smart Surveillance',     emoji: '📡', type: 'job', targetId: 'security',    multiplier: 5, cost: 40e6,    unlockAt: 15e6,   description: '5× Security income.' },

  // --- Business upgrades ---
  { id: 'ftk_up1',  name: 'Signature Menu',         emoji: '📋', type: 'business', targetId: 'food_truck',  multiplier: 2, cost: 2e6,   unlockAt: 1e6,   description: '2× Food Truck income.' },
  { id: 'bar_up1',  name: 'Premium Tools',          emoji: '✂️', type: 'business', targetId: 'barber',      multiplier: 2, cost: 8e6,   unlockAt: 4e6,   description: '2× Barber Shop income.' },
  { id: 'caf_up1',  name: 'Specialty Beans',        emoji: '🫘', type: 'business', targetId: 'cafe',        multiplier: 2, cost: 40e6,  unlockAt: 20e6,  description: '2× Café income.' },
  { id: 'rst_up1',  name: 'Michelin Star',          emoji: '⭐', type: 'business', targetId: 'restaurant',  multiplier: 3, cost: 500e6, unlockAt: 200e6, description: '3× Restaurant income.' },
  { id: 'btq_up1',  name: 'Designer Partnership',   emoji: '🤝', type: 'business', targetId: 'boutique',    multiplier: 3, cost: 3e9,   unlockAt: 1e9,   description: '3× Boutique income.' },
  { id: 'cwr_up1',  name: 'Express Lane',           emoji: '💨', type: 'business', targetId: 'carwash',     multiplier: 3, cost: 12e9,  unlockAt: 5e9,   description: '3× Car Wash income.' },
  { id: 'htl_up1',  name: 'Rooftop Bar',            emoji: '🥂', type: 'business', targetId: 'hotel',       multiplier: 3, cost: 60e9,  unlockAt: 25e9,  description: '3× Hotel income.' },
  { id: 'mll_up1',  name: 'VIP Shopping',           emoji: '💎', type: 'business', targetId: 'mall',        multiplier: 3, cost: 300e9, unlockAt: 100e9, description: '3× Mall income.' },
  { id: 'tch_up1',  name: 'IPO',                    emoji: '📈', type: 'business', targetId: 'techco',      multiplier: 5, cost: 2e12,  unlockAt: 500e9, description: '5× Tech Company income.' },

  // --- Global upgrades ---
  { id: 'global_1', name: 'Market Expansion',       emoji: '🌱', type: 'global', multiplier: 2,  cost: 1e10,  unlockAt: 5e9,   description: '2× ALL income.' },
  { id: 'global_2', name: 'Investor Relations',     emoji: '📊', type: 'global', multiplier: 2,  cost: 1e13,  unlockAt: 5e12,  description: '2× ALL income.' },
  { id: 'global_3', name: 'Tax Optimization',       emoji: '📑', type: 'global', multiplier: 3,  cost: 1e16,  unlockAt: 5e15,  description: '3× ALL income.' }
];

// ============================================================
// RANDOM EVENTS
// ============================================================
const RANDOM_EVENTS = [
  {
    id: 'investment',
    label: '📈 Investment Opportunity! Tap to 2× income for 5 min!',
    duration: 300, // seconds
    multiplier: 2,
    color: '#FFD700',
    probability: 0.3
  },
  {
    id: 'viral',
    label: '🔥 Going Viral! Tap to 3× clicks for 2 min!',
    duration: 120,
    multiplier: 3,
    type: 'click',
    color: '#FF6B35',
    probability: 0.2
  },
  {
    id: 'tax_break',
    label: '💸 Tax Break! Tap for free $$$!',
    duration: 0, // instant
    bonusMultiplier: 60, // 60 seconds of income instantly
    color: '#00FF88',
    probability: 0.3
  },
  {
    id: 'market_boom',
    label: '🚀 Market Boom! Tap to 5× income for 1 min!',
    duration: 60,
    multiplier: 5,
    color: '#A855F7',
    probability: 0.2
  }
];

// ============================================================
// MILESTONE MESSAGES  (shown as toast notifications)
// ============================================================
const MILESTONES = [
  { coins: 100,    msg: 'First $100! Every journey starts somewhere. 💪' },
  { coins: 1000,   msg: 'Four figures! You\'re on your way! 🌟' },
  { coins: 10000,  msg: '$10,000 earned! Time to think bigger.' },
  { coins: 1e6,    msg: 'MILLIONAIRE! The hustle pays off! 🥳' },
  { coins: 1e9,    msg: 'BILLIONAIRE! You\'re playing a different game now. 🚀' },
  { coins: 1e12,   msg: 'TRILLIONAIRE! Governments notice you. 👑' },
  { coins: 1e15,   msg: 'QUADRILLIONAIRE! You ARE the economy. 🌍' }
];

// ============================================================
// NUMBER FORMATTING SUFFIXES
// ============================================================
const SUFFIXES = [
  { value: 1e18, symbol: 'Qi' },
  { value: 1e15, symbol: 'Qa' },
  { value: 1e12, symbol: 'T' },
  { value: 1e9,  symbol: 'B' },
  { value: 1e6,  symbol: 'M' },
  { value: 1e3,  symbol: 'K' }
];
