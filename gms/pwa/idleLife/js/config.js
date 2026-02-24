// ============================================================
// LIFE IDLE - Game Configuration  v2.0
// All game data: jobs, businesses, upgrades, events, prestige, achievements
// ============================================================

const VERSION = '2.0.0';

// Spritesheet layout: 128x128 per tile, 8 columns wide
const SPRITE = {
  tileSize: 128,
  cols: 8,
  path: 'assets/spritesheet.png',
  exists: false
};

// ============================================================
// PRESTIGE CONFIG
// ============================================================
const PRESTIGE_CONFIG = {
  unlockAt: 1e8,   // $100M total earned in a single run to unlock prestige
  // Points earned = max(1, floor(log10(totalEarned / 1e4) * 4))
  //   $100M → 16 pts  |  $1B → 20 pts  |  $1T → 32 pts  |  $1Qa → 44 pts
  calcPoints: total => Math.max(1, Math.floor(Math.log10(total / 1e4) * 4)),
  // Each accumulated point adds 10% to all income & click power
  calcMultiplier: points => 1 + points * 0.1
};

// ============================================================
// CHARACTER STAGES  (emoji fallbacks while spritesheet missing)
// ============================================================
const CHARACTER_STAGES = [
  { emoji: '🧹', label: 'Street Sweeper',  unlockCoins: 0      },
  { emoji: '🪧', label: 'Worker',           unlockCoins: 5000   },
  { emoji: '👔', label: 'Employee',         unlockCoins: 5e5    },
  { emoji: '💼', label: 'Professional',     unlockCoins: 5e7    },
  { emoji: '🏪', label: 'Small Business',   unlockCoins: 1e10   },
  { emoji: '🏬', label: 'Entrepreneur',     unlockCoins: 1e13   },
  { emoji: '🏛️', label: 'Corporation',      unlockCoins: 1e16   },
  { emoji: '🚀', label: 'Space Mogul',      unlockCoins: 1e19   }
];

// ============================================================
// JOBS  — slower progression than v1
// incomePerWorker and clickBonus both reduced ~3–5×
// costHireBase increased ~1.5×
// ============================================================
const JOBS = [
  {
    id: 'sweeper',
    name: 'Street Sweeper',
    emoji: '🧹',
    description: 'Sweep streets for loose change.',
    unlockAt: 0,
    costHireBase: 15,
    costGrowth: 1.07,
    incomePerWorker: 0.08,
    clickBonus: 0.08,
    spriteRow: 1, spriteCol: 0
  },
  {
    id: 'sign_holder',
    name: 'Sign Holder',
    emoji: '🪧',
    description: 'Hold advertising signs on street corners.',
    unlockAt: 150,
    costHireBase: 120,
    costGrowth: 1.08,
    incomePerWorker: 0.35,
    clickBonus: 0.18,
    spriteRow: 1, spriteCol: 1
  },
  {
    id: 'paper_delivery',
    name: 'Newspaper Delivery',
    emoji: '📰',
    description: 'Early morning paper routes.',
    unlockAt: 1500,
    costHireBase: 900,
    costGrowth: 1.09,
    incomePerWorker: 1.5,
    clickBonus: 0.5,
    spriteRow: 1, spriteCol: 2
  },
  {
    id: 'fast_food',
    name: 'Fast Food Worker',
    emoji: '🍔',
    description: 'Flip burgers and work the register.',
    unlockAt: 12000,
    costHireBase: 5000,
    costGrowth: 1.10,
    incomePerWorker: 8,
    clickBonus: 1.5,
    spriteRow: 1, spriteCol: 3
  },
  {
    id: 'office_assist',
    name: 'Office Assistant',
    emoji: '🖨️',
    description: 'Filing, printing, and making coffee.',
    unlockAt: 120000,
    costHireBase: 30000,
    costGrowth: 1.11,
    incomePerWorker: 40,
    clickBonus: 5,
    spriteRow: 1, spriteCol: 4
  },
  {
    id: 'security',
    name: 'Security Guard',
    emoji: '🛡️',
    description: 'Keep the premises safe.',
    unlockAt: 800000,
    costHireBase: 180000,
    costGrowth: 1.12,
    incomePerWorker: 250,
    clickBonus: 15,
    spriteRow: 1, spriteCol: 5
  }
];

// ============================================================
// BUSINESSES  — costs ~4× higher, base income ~2.5× lower than v1
// incomeGrowth reduced to slow compounding:
//   Small 1.9, Medium 2.1, Large 2.3, Corp 2.6, Multinational 3.0
// ============================================================
const BUSINESSES = [
  // ── Small ──────────────────────────────────────────────────
  {
    id: 'food_truck',
    name: 'Food Truck',
    emoji: '🚚',
    tier: 'Small',
    description: 'Hit the streets with your own mobile kitchen.',
    unlockAt: 800000,
    baseCost: 3e6,
    levelCostMultiplier: 3.8,
    baseIncome: 800,
    incomeGrowth: 1.9,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 0
  },
  {
    id: 'barber',
    name: 'Barber Shop',
    emoji: '💈',
    tier: 'Small',
    description: 'Fresh cuts for the neighbourhood.',
    unlockAt: 8e6,
    baseCost: 1.5e7,
    levelCostMultiplier: 3.8,
    baseIncome: 3500,
    incomeGrowth: 1.9,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 1
  },
  {
    id: 'cafe',
    name: 'Corner Café',
    emoji: '☕',
    tier: 'Small',
    description: 'Artisan coffee and pastries.',
    unlockAt: 5e7,
    baseCost: 8e7,
    levelCostMultiplier: 3.8,
    baseIncome: 17000,
    incomeGrowth: 1.9,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 2
  },
  // ── Medium ─────────────────────────────────────────────────
  {
    id: 'restaurant',
    name: 'Restaurant',
    emoji: '🍽️',
    tier: 'Medium',
    description: 'Full-service dining experience.',
    unlockAt: 2.5e8,
    baseCost: 3e8,
    levelCostMultiplier: 4.2,
    baseIncome: 85000,
    incomeGrowth: 2.1,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 3
  },
  {
    id: 'boutique',
    name: 'Boutique Store',
    emoji: '👗',
    tier: 'Medium',
    description: 'High-end fashion retail.',
    unlockAt: 1.5e9,
    baseCost: 2e9,
    levelCostMultiplier: 4.2,
    baseIncome: 425000,
    incomeGrowth: 2.1,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 4
  },
  {
    id: 'carwash',
    name: 'Car Wash',
    emoji: '🚗',
    tier: 'Medium',
    description: 'Automated wash and detail services.',
    unlockAt: 7e9,
    baseCost: 1e10,
    levelCostMultiplier: 4.2,
    baseIncome: 2.1e6,
    incomeGrowth: 2.1,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 5
  },
  // ── Large ──────────────────────────────────────────────────
  {
    id: 'hotel',
    name: 'Luxury Hotel',
    emoji: '🏨',
    tier: 'Large',
    description: 'Five-star hospitality empire.',
    unlockAt: 4e10,
    baseCost: 6e10,
    levelCostMultiplier: 5,
    baseIncome: 10.5e6,
    incomeGrowth: 2.3,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 6
  },
  {
    id: 'mall',
    name: 'Shopping Mall',
    emoji: '🏬',
    tier: 'Large',
    description: 'Anchor store for an entire district.',
    unlockAt: 2.5e11,
    baseCost: 4e11,
    levelCostMultiplier: 5,
    baseIncome: 52.5e6,
    incomeGrowth: 2.3,
    maxLevel: 10,
    spriteRow: 2, spriteCol: 7
  },
  {
    id: 'techco',
    name: 'Tech Company',
    emoji: '💻',
    tier: 'Large',
    description: 'Software products used globally.',
    unlockAt: 1.2e12,
    baseCost: 2e12,
    levelCostMultiplier: 5,
    baseIncome: 263e6,
    incomeGrowth: 2.3,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 0
  },
  // ── Corp ───────────────────────────────────────────────────
  {
    id: 'chain',
    name: 'Restaurant Chain',
    emoji: '🍟',
    tier: 'Corp',
    description: 'Hundreds of locations nationwide.',
    unlockAt: 6e12,
    baseCost: 1e13,
    levelCostMultiplier: 6,
    baseIncome: 1.3e9,
    incomeGrowth: 2.6,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 1
  },
  {
    id: 'logistics',
    name: 'Logistics Corp',
    emoji: '🚛',
    tier: 'Corp',
    description: 'Fleet of trucks crossing continents.',
    unlockAt: 3.5e13,
    baseCost: 6e13,
    levelCostMultiplier: 6,
    baseIncome: 6.5e9,
    incomeGrowth: 2.6,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 2
  },
  {
    id: 'realestate',
    name: 'Real Estate Empire',
    emoji: '🏙️',
    tier: 'Corp',
    description: 'Skyscrapers in every major city.',
    unlockAt: 2e14,
    baseCost: 3.5e14,
    levelCostMultiplier: 6,
    baseIncome: 33e9,
    incomeGrowth: 2.6,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 3
  },
  // ── Multinational ──────────────────────────────────────────
  {
    id: 'intlcorp',
    name: 'International Corp',
    emoji: '🌐',
    tier: 'Multinational',
    description: 'Operations spanning six continents.',
    unlockAt: 1.2e15,
    baseCost: 2e15,
    levelCostMultiplier: 8,
    baseIncome: 165e9,
    incomeGrowth: 3.0,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 4
  },
  {
    id: 'techgiant',
    name: 'Tech Giant',
    emoji: '🛰️',
    tier: 'Multinational',
    description: 'Satellites, AI, and everything else.',
    unlockAt: 7e15,
    baseCost: 1.2e16,
    levelCostMultiplier: 8,
    baseIncome: 825e9,
    incomeGrowth: 3.0,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 5
  },
  {
    id: 'megacorp',
    name: 'Global Conglomerate',
    emoji: '👑',
    tier: 'Multinational',
    description: 'You own it all. The world is yours.',
    unlockAt: 4e16,
    baseCost: 8e16,
    levelCostMultiplier: 10,
    baseIncome: 4.1e12,
    incomeGrowth: 3.0,
    maxLevel: 10,
    spriteRow: 3, spriteCol: 6
  },
  // ── Space ──────────────────────────────────────────────────
  {
    id: 'space_tourism',
    name: 'Space Tourism',
    emoji: '🚀',
    tier: 'Space',
    description: 'Send wealthy clients to orbit and beyond.',
    unlockAt: 5e17,
    baseCost: 8e17,
    levelCostMultiplier: 12,
    baseIncome: 2e15,
    incomeGrowth: 3.5,
    maxLevel: 15,
    spriteRow: 3, spriteCol: 7
  },
  {
    id: 'space_mining',
    name: 'Space Mining',
    emoji: '⛏️',
    tier: 'Space',
    description: 'Extract ultra-rare minerals from asteroids.',
    unlockAt: 4e18,
    baseCost: 7e18,
    levelCostMultiplier: 12,
    baseIncome: 1e16,
    incomeGrowth: 3.5,
    maxLevel: 15,
    spriteRow: 4, spriteCol: 0
  },
  {
    id: 'space_megacity',
    name: 'Space Megacity',
    emoji: '🌌',
    tier: 'Space',
    description: "Humanity's first off-world metropolis.",
    unlockAt: 3e19,
    baseCost: 5e19,
    levelCostMultiplier: 14,
    baseIncome: 5e16,
    incomeGrowth: 4.0,
    maxLevel: 15,
    spriteRow: 4, spriteCol: 1
  },
  // ── Galactic ───────────────────────────────────────────────
  {
    id: 'galactic_corp',
    name: 'Galactic Corp',
    emoji: '🌠',
    tier: 'Galactic',
    description: 'Trade across star systems. You are legend.',
    unlockAt: 2e20,
    baseCost: 4e20,
    levelCostMultiplier: 18,
    baseIncome: 2.5e17,
    incomeGrowth: 4.5,
    maxLevel: 10,
    spriteRow: 4, spriteCol: 2
  }
];

// ============================================================
// UPGRADES  — costs ~3× higher than v1 to match slower pace
// ============================================================
const UPGRADES = [
  // ── Click upgrades ──────────────────────────────────────────
  { id: 'click_1', name: 'Better Technique',    emoji: '👆', type: 'click', multiplier: 2,  cost: 300,     unlockAt: 0,       description: '2× tap power.' },
  { id: 'click_2', name: 'Calloused Hands',      emoji: '💪', type: 'click', multiplier: 2,  cost: 15000,   unlockAt: 3000,    description: '2× tap power again.' },
  { id: 'click_3', name: 'Work Ethic',           emoji: '⚡', type: 'click', multiplier: 3,  cost: 300000,  unlockAt: 60000,   description: '3× tap power.' },
  { id: 'click_4', name: 'Power Tapping',        emoji: '🤜', type: 'click', multiplier: 5,  cost: 15e6,    unlockAt: 3e6,     description: '5× tap power.' },
  { id: 'click_5', name: 'Automation Assistant', emoji: '🤖', type: 'click', multiplier: 10, cost: 3e9,     unlockAt: 6e8,     description: '10× tap power.' },

  // ── Job upgrades ────────────────────────────────────────────
  { id: 'swp_up1', name: 'Better Broom',         emoji: '🧹', type: 'job', targetId: 'sweeper',       multiplier: 2, cost: 300,      unlockAt: 75,      description: '2× Sweeper income.' },
  { id: 'swp_up2', name: 'Industrial Sweeper',   emoji: '🚜', type: 'job', targetId: 'sweeper',       multiplier: 5, cost: 8000,     unlockAt: 3000,    description: '5× Sweeper income.' },
  { id: 'sgn_up1', name: 'Eye-Catching Sign',    emoji: '📢', type: 'job', targetId: 'sign_holder',   multiplier: 2, cost: 3000,     unlockAt: 800,     description: '2× Sign Holder income.' },
  { id: 'sgn_up2', name: 'LED Sign',             emoji: '💡', type: 'job', targetId: 'sign_holder',   multiplier: 5, cost: 60000,    unlockAt: 15000,   description: '5× Sign Holder income.' },
  { id: 'ppr_up1', name: 'Electric Bike',        emoji: '🛵', type: 'job', targetId: 'paper_delivery', multiplier: 2, cost: 15000,   unlockAt: 5000,    description: '2× Paper Delivery.' },
  { id: 'ppr_up2', name: 'Drone Delivery',       emoji: '🚁', type: 'job', targetId: 'paper_delivery', multiplier: 5, cost: 500000,  unlockAt: 100000,  description: '5× Paper Delivery.' },
  { id: 'fst_up1', name: 'Extra Fryer',          emoji: '🍟', type: 'job', targetId: 'fast_food',     multiplier: 2, cost: 100000,   unlockAt: 35000,   description: '2× Fast Food income.' },
  { id: 'fst_up2', name: 'Drive-Thru',           emoji: '🚘', type: 'job', targetId: 'fast_food',     multiplier: 5, cost: 3e6,      unlockAt: 600000,  description: '5× Fast Food income.' },
  { id: 'ofc_up1', name: 'Standing Desk',        emoji: '🖥️', type: 'job', targetId: 'office_assist', multiplier: 2, cost: 800000,   unlockAt: 250000,  description: '2× Office income.' },
  { id: 'ofc_up2', name: 'AI Copilot',           emoji: '🤖', type: 'job', targetId: 'office_assist', multiplier: 5, cost: 25e6,     unlockAt: 6e6,     description: '5× Office income.' },
  { id: 'sec_up1', name: 'Better Equipment',     emoji: '🔦', type: 'job', targetId: 'security',      multiplier: 2, cost: 5e6,      unlockAt: 1.5e6,   description: '2× Security income.' },
  { id: 'sec_up2', name: 'Smart Surveillance',   emoji: '📡', type: 'job', targetId: 'security',      multiplier: 5, cost: 100e6,    unlockAt: 30e6,    description: '5× Security income.' },

  // ── Business upgrades ───────────────────────────────────────
  { id: 'ftk_up1', name: 'Signature Menu',       emoji: '📋', type: 'business', targetId: 'food_truck', multiplier: 2, cost: 12e6,   unlockAt: 4e6,     description: '2× Food Truck.' },
  { id: 'bar_up1', name: 'Premium Tools',        emoji: '✂️', type: 'business', targetId: 'barber',     multiplier: 2, cost: 50e6,   unlockAt: 20e6,    description: '2× Barber Shop.' },
  { id: 'caf_up1', name: 'Specialty Beans',      emoji: '🫘', type: 'business', targetId: 'cafe',       multiplier: 2, cost: 250e6,  unlockAt: 80e6,    description: '2× Café income.' },
  { id: 'rst_up1', name: 'Michelin Star',        emoji: '⭐', type: 'business', targetId: 'restaurant', multiplier: 3, cost: 2e9,    unlockAt: 600e6,   description: '3× Restaurant.' },
  { id: 'btq_up1', name: 'Designer Partnership', emoji: '🤝', type: 'business', targetId: 'boutique',   multiplier: 3, cost: 12e9,   unlockAt: 4e9,     description: '3× Boutique.' },
  { id: 'cwr_up1', name: 'Express Lane',         emoji: '💨', type: 'business', targetId: 'carwash',    multiplier: 3, cost: 50e9,   unlockAt: 16e9,    description: '3× Car Wash.' },
  { id: 'htl_up1', name: 'Rooftop Bar',          emoji: '🥂', type: 'business', targetId: 'hotel',      multiplier: 3, cost: 250e9,  unlockAt: 80e9,    description: '3× Hotel.' },
  { id: 'mll_up1', name: 'VIP Shopping',         emoji: '💎', type: 'business', targetId: 'mall',       multiplier: 3, cost: 1.5e12, unlockAt: 500e9,   description: '3× Mall income.' },
  { id: 'tch_up1', name: 'IPO',                  emoji: '📈', type: 'business', targetId: 'techco',     multiplier: 5, cost: 10e12,  unlockAt: 3e12,    description: '5× Tech Company.' },

  // ── Global upgrades ─────────────────────────────────────────
  { id: 'global_1', name: 'Market Expansion',    emoji: '🌱', type: 'global', multiplier: 2, cost: 5e10,  unlockAt: 1.5e10, description: '2× ALL income.' },
  { id: 'global_2', name: 'Investor Relations',  emoji: '📊', type: 'global', multiplier: 2, cost: 5e13,  unlockAt: 1.5e13, description: '2× ALL income.' },
  { id: 'global_3', name: 'Tax Optimization',    emoji: '📑', type: 'global', multiplier: 3, cost: 5e16,  unlockAt: 1.5e16, description: '3× ALL income.' },
  { id: 'global_4', name: 'Galactic Trade Routes', emoji: '🌠', type: 'global', multiplier: 5, cost: 5e19, unlockAt: 1.5e19, description: '5× ALL income.' }
];

// ============================================================
// ACHIEVEMENTS  (persist through prestige)
// ============================================================
const ACHIEVEMENTS = [
  // Lifetime earnings
  { id: 'earn_1k',     name: 'Getting Started',   emoji: '🌱', desc: 'Earn $1,000 lifetime',          type: 'lifetimeEarned',  threshold: 1e3   },
  { id: 'earn_100k',   name: 'Hustler',            emoji: '💸', desc: 'Earn $100K lifetime',           type: 'lifetimeEarned',  threshold: 1e5   },
  { id: 'earn_1m',     name: 'Millionaire',        emoji: '💰', desc: 'Earn $1M lifetime',             type: 'lifetimeEarned',  threshold: 1e6   },
  { id: 'earn_1b',     name: 'Billionaire',        emoji: '🏦', desc: 'Earn $1B lifetime',             type: 'lifetimeEarned',  threshold: 1e9   },
  { id: 'earn_1t',     name: 'Trillionaire',       emoji: '🌍', desc: 'Earn $1T lifetime',             type: 'lifetimeEarned',  threshold: 1e12  },
  { id: 'earn_1q',     name: 'Quadrillionaire',    emoji: '👑', desc: 'Earn $1Qa lifetime',            type: 'lifetimeEarned',  threshold: 1e15  },
  // Workers
  { id: 'workers_10',  name: 'First Crew',         emoji: '👷', desc: 'Hire 10 workers total',         type: 'totalWorkers',    threshold: 10    },
  { id: 'workers_50',  name: 'Workforce',          emoji: '🏗️', desc: 'Hire 50 workers',               type: 'totalWorkers',    threshold: 50    },
  { id: 'workers_200', name: 'Big Employer',       emoji: '🏭', desc: 'Hire 200 workers',              type: 'totalWorkers',    threshold: 200   },
  // Tapping
  { id: 'taps_100',    name: 'Tapper',             emoji: '👆', desc: 'Tap 100 times',                 type: 'totalTaps',       threshold: 100   },
  { id: 'taps_1000',   name: 'Grinder',            emoji: '💪', desc: 'Tap 1,000 times',               type: 'totalTaps',       threshold: 1000  },
  { id: 'taps_10000',  name: 'Legendary Tapper',   emoji: '🤜', desc: 'Tap 10,000 times',              type: 'totalTaps',       threshold: 10000 },
  // Businesses
  { id: 'biz_first',   name: 'Entrepreneur',       emoji: '🏪', desc: 'Build your first business',     type: 'bizOwned',        threshold: 1     },
  { id: 'biz_5',       name: 'Diversified',        emoji: '📊', desc: 'Own 5 business types',          type: 'bizOwned',        threshold: 5     },
  { id: 'biz_all',     name: 'Monopoly',           emoji: '🌐', desc: 'Own every business type',       type: 'bizOwned',        threshold: 19    },
  // Upgrades
  { id: 'upg_first',   name: 'Investor',           emoji: '⬆️', desc: 'Buy your first upgrade',        type: 'upgradeCount',    threshold: 1     },
  { id: 'upg_10',      name: 'Optimizer',          emoji: '📈', desc: 'Buy 10 upgrades',               type: 'upgradeCount',    threshold: 10    },
  { id: 'max_biz',     name: 'Perfectionist',      emoji: '💎', desc: 'Max out any business to Lv.MAX', type: 'maxBiz',         threshold: 1     },
  // Prestige
  { id: 'prestige_1',  name: 'Reborn',             emoji: '⭐', desc: 'Prestige for the first time',   type: 'prestigeLevel',   threshold: 1     },
  { id: 'prestige_3',  name: 'Veteran',            emoji: '🌟', desc: 'Prestige 3 times',              type: 'prestigeLevel',   threshold: 3     },
  { id: 'prestige_10', name: 'Legend',             emoji: '💫', desc: 'Prestige 10 times',             type: 'prestigeLevel',   threshold: 10    },
  // Space era
  { id: 'space_age',   name: 'Space Age',          emoji: '🚀', desc: 'Build Space Tourism',           type: 'ownSpecificBiz',  targetId: 'space_tourism' },
  { id: 'galactic',    name: 'Galactic',           emoji: '🌌', desc: 'Build Galactic Corp',           type: 'ownSpecificBiz',  targetId: 'galactic_corp' }
];

// ============================================================
// RANDOM EVENTS
// ============================================================
const RANDOM_EVENTS = [
  {
    id: 'investment',
    label: '📈 Investment Opportunity! Tap to 2× income for 5 min!',
    duration: 300,
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
    duration: 0,
    bonusMultiplier: 60,
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
// MILESTONE MESSAGES
// ============================================================
const MILESTONES = [
  { coins: 500,    msg: 'First $500! Every empire starts somewhere. 💪' },
  { coins: 5000,   msg: '$5,000! You\'re scraping it together! 🌟' },
  { coins: 100000, msg: '$100K! Real money now. 💼' },
  { coins: 1e7,    msg: '$10 Million! The business is booming! 🏪' },
  { coins: 1e9,    msg: 'BILLIONAIRE! You\'re playing a different game now. 🚀' },
  { coins: 1e12,   msg: 'TRILLIONAIRE! Governments notice you. 👑' },
  { coins: 1e15,   msg: 'QUADRILLIONAIRE! You ARE the economy. 🌍' },
  { coins: 1e18,   msg: 'QUINTILLIONAIRE! The stars are yours. 🌌' }
];

// ============================================================
// NUMBER FORMATTING SUFFIXES  (extended for Space era)
// ============================================================
const SUFFIXES = [
  { value: 1e30, symbol: 'No'  },
  { value: 1e27, symbol: 'Oc'  },
  { value: 1e24, symbol: 'Sp'  },
  { value: 1e21, symbol: 'Sx'  },
  { value: 1e18, symbol: 'Qi'  },
  { value: 1e15, symbol: 'Qa'  },
  { value: 1e12, symbol: 'T'   },
  { value: 1e9,  symbol: 'B'   },
  { value: 1e6,  symbol: 'M'   },
  { value: 1e3,  symbol: 'K'   }
];
