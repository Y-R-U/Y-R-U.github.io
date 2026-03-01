/**
 * gameData.js - Business, upgrade, and achievement definitions
 */

const GameData = (() => {

  const BUSINESSES = [
    {
      id: 'stable',
      name: 'Stable Hand',
      icon: '\uD83D\uDCA9', // poop emoji for shoveling
      desc: 'Muck out horse stalls for the town stable',
      baseCost: 15,
      baseIncome: 0.5,
      unlockCost: 0,
      costMult: 1.12
    },
    {
      id: 'prospector',
      name: 'Prospector',
      icon: '\u26CF\uFE0F', // pick
      desc: 'Pan for gold down at the creek',
      baseCost: 100,
      baseIncome: 3,
      unlockCost: 50,
      costMult: 1.12
    },
    {
      id: 'store',
      name: 'General Store',
      icon: '\uD83C\uDFEA', // convenience store
      desc: 'Sell supplies, tools, and provisions',
      baseCost: 500,
      baseIncome: 12,
      unlockCost: 500,
      costMult: 1.12
    },
    {
      id: 'saloon',
      name: 'Saloon',
      icon: '\uD83C\uDF7A', // beer
      desc: 'Whiskey, poker, and good times',
      baseCost: 3000,
      baseIncome: 50,
      unlockCost: 3000,
      costMult: 1.12
    },
    {
      id: 'ranch',
      name: 'Ranch',
      icon: '\uD83D\uDC04', // cow
      desc: 'Herd cattle and drive them to market',
      baseCost: 12000,
      baseIncome: 150,
      unlockCost: 15000,
      costMult: 1.12
    },
    {
      id: 'sheriff',
      name: "Sheriff's Office",
      icon: '\u2B50', // star
      desc: 'Collect bounties on outlaws',
      baseCost: 50000,
      baseIncome: 500,
      unlockCost: 75000,
      costMult: 1.12
    },
    {
      id: 'bank',
      name: 'Bank',
      icon: '\uD83C\uDFE6', // bank
      desc: 'Loans, savings, and interest',
      baseCost: 250000,
      baseIncome: 2000,
      unlockCost: 400000,
      costMult: 1.12
    },
    {
      id: 'mine',
      name: 'Mining Co.',
      icon: '\u2692\uFE0F', // hammer and pick
      desc: 'Deep shaft gold and silver mining',
      baseCost: 1500000,
      baseIncome: 10000,
      unlockCost: 2500000,
      costMult: 1.12
    },
    {
      id: 'railroad',
      name: 'Railroad',
      icon: '\uD83D\uDE82', // locomotive
      desc: 'Freight and passenger rail lines',
      baseCost: 10000000,
      baseIncome: 55000,
      unlockCost: 20000000,
      costMult: 1.12
    },
    {
      id: 'oil',
      name: 'Oil Derrick',
      icon: '\uD83D\uDEE2\uFE0F', // oil drum
      desc: 'Strike black gold!',
      baseCost: 75000000,
      baseIncome: 300000,
      unlockCost: 150000000,
      costMult: 1.12
    }
  ];

  // Milestone thresholds and their multipliers
  const MILESTONES = [
    { count: 10, mult: 2, label: '10 hired' },
    { count: 25, mult: 2, label: '25 hired' },
    { count: 50, mult: 3, label: '50 hired' },
    { count: 100, mult: 4, label: '100 hired' },
    { count: 200, mult: 4, label: '200 hired' },
    { count: 300, mult: 5, label: '300 hired' },
    { count: 500, mult: 10, label: '500 hired' }
  ];

  // Tap upgrades you can buy
  const TAP_UPGRADES = [
    { id: 'tap1', name: 'Sturdy Gloves', cost: 50, mult: 2, icon: '\uD83E\uDDE4', desc: 'Work harder, earn more per tap' },
    { id: 'tap2', name: 'Iron Shovel', cost: 500, mult: 2, icon: '\uD83E\uDE93', desc: 'Better tools, better pay' },
    { id: 'tap3', name: 'Horse & Cart', cost: 5000, mult: 3, icon: '\uD83D\uDC0E', desc: 'Move more, earn more' },
    { id: 'tap4', name: 'Dynamite', cost: 50000, mult: 3, icon: '\uD83E\uDDE8', desc: 'Explosive productivity!' },
    { id: 'tap5', name: 'Steam Engine', cost: 500000, mult: 5, icon: '\u2699\uFE0F', desc: 'Industrial revolution' },
    { id: 'tap6', name: 'Golden Pickaxe', cost: 5000000, mult: 5, icon: '\u2604\uFE0F', desc: 'Legendary tool of the West' }
  ];

  // Random events
  const EVENTS = [
    {
      id: 'tumbleweed',
      name: 'Tumbleweed',
      icon: '\uD83C\uDF3E', // sheaf of rice (closest to tumbleweed)
      desc: '2x income for 5 minutes',
      effect: 'income_mult',
      mult: 2,
      duration: 300,
      screenTime: 5,
      minInterval: 30,
      maxInterval: 90,
      cssClass: 'event-tumbleweed'
    },
    {
      id: 'nugget',
      name: 'Gold Nugget',
      icon: '\uD83D\uDCB0', // money bag
      desc: '100 seconds of income, instantly!',
      effect: 'instant_income',
      mult: 100, // 100x current income/sec
      duration: 0,
      screenTime: 3,
      minInterval: 60,
      maxInterval: 180,
      cssClass: 'event-nugget'
    },
    {
      id: 'wanted',
      name: 'Wanted Poster',
      icon: '\uD83D\uDCC4', // page
      desc: '100x tap value for 3 minutes',
      effect: 'tap_mult',
      mult: 100,
      duration: 180,
      screenTime: 4,
      minInterval: 90,
      maxInterval: 240,
      cssClass: 'event-wanted'
    },
    {
      id: 'dustdevil',
      name: 'Dust Devil',
      icon: '\uD83C\uDF2A\uFE0F', // tornado
      desc: '5x income for 1 minute',
      effect: 'income_mult',
      mult: 5,
      duration: 60,
      screenTime: 6,
      minInterval: 120,
      maxInterval: 300,
      cssClass: 'event-dustdevil'
    },
    {
      id: 'snakeoil',
      name: 'Snake Oil Salesman',
      icon: '\uD83E\uDDD4', // bearded person
      desc: 'Random boost for 2 minutes',
      effect: 'income_mult',
      mult: 0, // randomized 2-10 at spawn
      duration: 120,
      screenTime: 5,
      minInterval: 180,
      maxInterval: 600,
      cssClass: 'event-snakeoil'
    }
  ];

  // Achievements
  const ACHIEVEMENTS = [
    { id: 'first_tap', name: 'Howdy Partner', desc: 'Tap for the first time', icon: '\uD83D\uDC4B' },
    { id: 'first_hire', name: 'The Boss', desc: 'Hire your first worker', icon: '\uD83E\uDDD1\u200D\uD83C\uDF3E' },
    { id: 'earn_1k', name: 'Pocket Change', desc: 'Earn $1,000 total', icon: '\uD83D\uDCB5' },
    { id: 'earn_1m', name: 'Big Spender', desc: 'Earn $1,000,000 total', icon: '\uD83D\uDCB0' },
    { id: 'earn_1b', name: 'Tycoon', desc: 'Earn $1,000,000,000 total', icon: '\uD83E\uDD11' },
    { id: 'own_saloon', name: 'Barkeep', desc: 'Own a Saloon', icon: '\uD83C\uDF7A' },
    { id: 'own_railroad', name: 'Rail Baron', desc: 'Own a Railroad', icon: '\uD83D\uDE82' },
    { id: 'own_oil', name: 'Oil Magnate', desc: 'Own an Oil Derrick', icon: '\uD83D\uDEE2\uFE0F' },
    { id: 'prestige_1', name: 'Westward Ho!', desc: 'Move West for the first time', icon: '\u2B50' },
    { id: 'prestige_5', name: 'Pioneer', desc: 'Move West 5 times', icon: '\uD83C\uDFC5' },
    { id: 'tap_1000', name: 'Trigger Finger', desc: 'Tap 1,000 times', icon: '\uD83D\uDC46' },
    { id: 'tap_10000', name: 'Fastest Hand', desc: 'Tap 10,000 times', icon: '\u26A1' },
    { id: 'event_10', name: 'Lucky Break', desc: 'Catch 10 random events', icon: '\uD83C\uDF1F' },
    { id: 'all_biz', name: 'Empire Builder', desc: 'Own all 10 business types', icon: '\uD83C\uDFDB\uFE0F' }
  ];

  function getBusinessCost(biz, owned) {
    return Math.floor(biz.baseCost * Math.pow(biz.costMult, owned));
  }

  function getBusinessCostN(biz, owned, n) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += Math.floor(biz.baseCost * Math.pow(biz.costMult, owned + i));
    }
    return total;
  }

  function getMilestoneMultiplier(owned) {
    let mult = 1;
    for (const m of MILESTONES) {
      if (owned >= m.count) mult *= m.mult;
    }
    return mult;
  }

  return {
    BUSINESSES, MILESTONES, TAP_UPGRADES, EVENTS, ACHIEVEMENTS,
    getBusinessCost, getBusinessCostN, getMilestoneMultiplier
  };
})();
