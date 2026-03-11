// ============================================================
// Transport Empire - Game Configuration & Definitions
// ============================================================

const BUSINESS_DEFS = [
    {
        id: 'quarry', name: 'Quarry Run', icon: '\u26cf\ufe0f',
        desc: 'Haul stone from the quarry',
        baseCost: 10, baseEarning: 1, baseTime: 3,
        costMul: 1.12, vehicle: 'truck.glb',
        fromLabel: 'Quarry', toLabel: 'Depot',
        unlockCost: 0
    },
    {
        id: 'farm', name: 'Farm Delivery', icon: '\ud83c\udf3e',
        desc: 'Transport crops to the market',
        baseCost: 100, baseEarning: 8, baseTime: 5,
        costMul: 1.13, vehicle: 'van.glb',
        fromLabel: 'Farm', toLabel: 'Market',
        unlockCost: 500
    },
    {
        id: 'factory', name: 'Factory Freight', icon: '\ud83c\udfed',
        desc: 'Move goods from factory to warehouse',
        baseCost: 1200, baseEarning: 50, baseTime: 8,
        costMul: 1.14, vehicle: 'delivery.glb',
        fromLabel: 'Factory', toLabel: 'Warehouse',
        unlockCost: 5000
    },
    {
        id: 'oil', name: 'Oil Transport', icon: '\ud83d\udee2\ufe0f',
        desc: 'Haul oil to the refinery',
        baseCost: 15000, baseEarning: 350, baseTime: 10,
        costMul: 1.15, vehicle: 'truck-flat.glb',
        fromLabel: 'Oil Rig', toLabel: 'Refinery',
        unlockCost: 50000
    },
    {
        id: 'tech', name: 'Tech Logistics', icon: '\ud83d\udcbb',
        desc: 'Deliver electronics to data center',
        baseCost: 200000, baseEarning: 2500, baseTime: 12,
        costMul: 1.16, vehicle: 'delivery-flat.glb',
        fromLabel: 'Tech Lab', toLabel: 'Data Center',
        unlockCost: 500000
    },
    {
        id: 'luxury', name: 'Luxury Express', icon: '\ud83d\udc8e',
        desc: 'Premium courier for high-value goods',
        baseCost: 5000000, baseEarning: 20000, baseTime: 15,
        costMul: 1.17, vehicle: 'suv.glb',
        fromLabel: 'Boutique', toLabel: 'Airport',
        unlockCost: 10000000
    },
    {
        id: 'military', name: 'Defense Contract', icon: '\ud83d\udee1\ufe0f',
        desc: 'Secure military supply chain',
        baseCost: 100000000, baseEarning: 150000, baseTime: 18,
        costMul: 1.18, vehicle: 'ambulance.glb',
        fromLabel: 'Base', toLabel: 'Outpost',
        unlockCost: 200000000
    },
    {
        id: 'space', name: 'Space Cargo', icon: '\ud83d\ude80',
        desc: 'Interstellar freight hauling',
        baseCost: 5000000000, baseEarning: 1200000, baseTime: 20,
        costMul: 1.19, vehicle: 'firetruck.glb',
        fromLabel: 'Spaceport', toLabel: 'Station',
        unlockCost: 10000000000
    }
];

const UPGRADE_DEFS = [
    // Click power
    { id: 'click1', name: 'Better Gloves', icon: '\ud83e\udde4', desc: 'Double click earnings', cost: 50, type: 'click', mul: 2 },
    { id: 'click2', name: 'Power Tools', icon: '\ud83d\udd27', desc: '3x click earnings', cost: 500, type: 'click', mul: 3 },
    { id: 'click3', name: 'Hydraulic Press', icon: '\u2699\ufe0f', desc: '5x click earnings', cost: 25000, type: 'click', mul: 5 },
    { id: 'click4', name: 'Quantum Loader', icon: '\u269b\ufe0f', desc: '10x click earnings', cost: 5000000, type: 'click', mul: 10 },
    // Speed
    { id: 'speed1', name: 'Better Roads', icon: '\ud83d\udee3\ufe0f', desc: 'All routes 20% faster', cost: 200, type: 'speed', mul: 0.8, target: 'all' },
    { id: 'speed2', name: 'Highway System', icon: '\ud83d\udea7', desc: 'All routes 30% faster', cost: 10000, type: 'speed', mul: 0.7, target: 'all' },
    { id: 'speed3', name: 'Bullet Trains', icon: '\ud83d\ude84', desc: 'All routes 40% faster', cost: 500000, type: 'speed', mul: 0.6, target: 'all' },
    { id: 'speed4', name: 'Teleportation', icon: '\ud83d\udd2e', desc: 'All routes 50% faster', cost: 50000000, type: 'speed', mul: 0.5, target: 'all' },
    // Earnings
    { id: 'earn1', name: 'Logistics AI', icon: '\ud83e\udd16', desc: 'Quarry & Farm earn 2x', cost: 1000, type: 'earning', mul: 2, target: ['quarry', 'farm'] },
    { id: 'earn2', name: 'Supply Chain', icon: '\ud83d\udce6', desc: 'Factory & Oil earn 2x', cost: 50000, type: 'earning', mul: 2, target: ['factory', 'oil'] },
    { id: 'earn3', name: 'Global Network', icon: '\ud83c\udf10', desc: 'All routes earn 3x', cost: 2000000, type: 'earning', mul: 3, target: 'all' },
    { id: 'earn4', name: 'Monopoly', icon: '\ud83c\udfe6', desc: 'All routes earn 5x', cost: 500000000, type: 'earning', mul: 5, target: 'all' },
    // Managers (auto-collect)
    { id: 'mgr_quarry', name: 'Quarry Manager', icon: '\ud83d\udc77', desc: 'Auto-collect Quarry Run', cost: 150, type: 'manager', target: 'quarry' },
    { id: 'mgr_farm', name: 'Farm Manager', icon: '\ud83e\uddd1\u200d\ud83c\udf3e', desc: 'Auto-collect Farm Delivery', cost: 2000, type: 'manager', target: 'farm' },
    { id: 'mgr_factory', name: 'Factory Manager', icon: '\ud83d\udc68\u200d\ud83d\udcbc', desc: 'Auto-collect Factory Freight', cost: 25000, type: 'manager', target: 'factory' },
    { id: 'mgr_oil', name: 'Oil Manager', icon: '\ud83e\uddd1\u200d\ud83d\udd2c', desc: 'Auto-collect Oil Transport', cost: 300000, type: 'manager', target: 'oil' },
    { id: 'mgr_tech', name: 'Tech Manager', icon: '\ud83d\udc69\u200d\ud83d\udcbb', desc: 'Auto-collect Tech Logistics', cost: 5000000, type: 'manager', target: 'tech' },
    { id: 'mgr_luxury', name: 'Luxury Manager', icon: '\ud83e\uddd1\u200d\u2708\ufe0f', desc: 'Auto-collect Luxury Express', cost: 100000000, type: 'manager', target: 'luxury' },
    { id: 'mgr_military', name: 'Military Manager', icon: '\ud83c\udf96\ufe0f', desc: 'Auto-collect Defense Contract', cost: 2000000000, type: 'manager', target: 'military' },
    { id: 'mgr_space', name: 'Space Manager', icon: '\ud83d\udc68\u200d\ud83d\ude80', desc: 'Auto-collect Space Cargo', cost: 50000000000, type: 'manager', target: 'space' },
];

const ACHIEVEMENT_DEFS = [
    { id: 'earn100', name: 'Getting Started', desc: 'Earn $100 total', icon: '\ud83c\udfc1', check: s => s.totalEarned >= 100 },
    { id: 'earn10k', name: 'Small Business', desc: 'Earn $10,000 total', icon: '\ud83d\udcb0', check: s => s.totalEarned >= 10000 },
    { id: 'earn1m', name: 'Millionaire', desc: 'Earn $1,000,000 total', icon: '\ud83d\udcb5', check: s => s.totalEarned >= 1000000 },
    { id: 'earn1b', name: 'Billionaire', desc: 'Earn $1,000,000,000 total', icon: '\ud83d\udc8e', check: s => s.totalEarned >= 1000000000 },
    { id: 'earn1t', name: 'Trillionaire', desc: 'Earn $1T total', icon: '\ud83d\udc51', check: s => s.totalEarned >= 1000000000000 },
    { id: 'click50', name: 'Clicker', desc: 'Click 50 times', icon: '\ud83d\udc46', check: s => s.totalClicks >= 50 },
    { id: 'click500', name: 'Click Master', desc: 'Click 500 times', icon: '\ud83d\udd90\ufe0f', check: s => s.totalClicks >= 500 },
    { id: 'click5000', name: 'Click Legend', desc: 'Click 5,000 times', icon: '\u2b50', check: s => s.totalClicks >= 5000 },
    { id: 'biz2', name: 'Expanding', desc: 'Unlock 2 routes', icon: '\ud83d\udea2', check: s => s.unlockedCount >= 2 },
    { id: 'biz5', name: 'Empire Builder', desc: 'Unlock 5 routes', icon: '\ud83c\udf0d', check: s => s.unlockedCount >= 5 },
    { id: 'biz8', name: 'Transport Tycoon', desc: 'Unlock all 8 routes', icon: '\ud83d\ude80', check: s => s.unlockedCount >= 8 },
    { id: 'prestige1', name: 'Fresh Start', desc: 'Prestige once', icon: '\ud83d\udd04', check: s => s.totalPrestiges >= 1 },
    { id: 'prestige5', name: 'Serial Restarter', desc: 'Prestige 5 times', icon: '\ud83c\udf00', check: s => s.totalPrestiges >= 5 },
    { id: 'prestige10', name: 'Phoenix', desc: 'Prestige 10 times', icon: '\ud83c\udf1f', check: s => s.totalPrestiges >= 10 },
    { id: 'upgrade5', name: 'Upgrader', desc: 'Buy 5 upgrades', icon: '\u2b06\ufe0f', check: s => s.upgradeCount >= 5 },
    { id: 'upgrade15', name: 'Max Upgrades', desc: 'Buy 15 upgrades', icon: '\ud83d\udcaa', check: s => s.upgradeCount >= 15 },
    { id: 'event5', name: 'Lucky', desc: 'Catch 5 random events', icon: '\ud83c\udf40', check: s => s.eventsCaught >= 5 },
    { id: 'event25', name: 'Event Hunter', desc: 'Catch 25 random events', icon: '\ud83c\udfaf', check: s => s.eventsCaught >= 25 },
    { id: 'level50', name: 'Dedicated', desc: 'Get any route to level 50', icon: '\ud83c\udfc5', check: s => s.maxLevel >= 50 },
    { id: 'level100', name: 'Century', desc: 'Get any route to level 100', icon: '\ud83d\udc6e', check: s => s.maxLevel >= 100 },
];

const EVENT_DEFS = [
    { id: 'bonus_truck', icon: '\ud83d\ude9a', text: 'Bonus truck! Tap for 2x speed!', duration: 8, effect: 'speed', mul: 2, bonusDuration: 30 },
    { id: 'ad_banner', icon: '\ud83d\udcf0', text: 'Ad deal! Tap for 3x earnings!', duration: 6, effect: 'earning', mul: 3, bonusDuration: 20 },
    { id: 'gold_rush', icon: '\ud83c\udf1f', text: 'Gold rush! Tap for instant cash!', duration: 10, effect: 'cash', mul: 60 },
    { id: 'vip_client', icon: '\ud83d\udc51', text: 'VIP client! Tap for 5x earnings!', duration: 5, effect: 'earning', mul: 5, bonusDuration: 15 },
    { id: 'speed_boost', icon: '\u26a1', text: 'Turbo boost! Tap for 3x speed!', duration: 7, effect: 'speed', mul: 3, bonusDuration: 20 },
    { id: 'click_frenzy', icon: '\ud83d\udd25', text: 'Click frenzy! Tap for 10x clicks!', duration: 6, effect: 'click', mul: 10, bonusDuration: 15 },
];

const PRESTIGE_UPGRADES = [
    { id: 'p_earn', name: 'Empire Knowledge', desc: '+25% earnings per level', cost: 1, maxLevel: 20, effect: 0.25 },
    { id: 'p_speed', name: 'Express Routes', desc: '+10% speed per level', cost: 2, maxLevel: 10, effect: 0.10 },
    { id: 'p_click', name: 'Expert Hands', desc: '+50% click power per level', cost: 1, maxLevel: 15, effect: 0.50 },
    { id: 'p_start', name: 'Head Start', desc: 'Start with $500 per level', cost: 3, maxLevel: 10, effect: 500 },
    { id: 'p_cost', name: 'Negotiator', desc: '-5% route costs per level', cost: 2, maxLevel: 10, effect: 0.05 },
];

const SAVE_KEY = 'transport_empire_save';
