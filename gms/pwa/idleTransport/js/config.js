// ============================================================
// Idle Transport Empire - Game Configuration
// ============================================================

const ROUTES = [
    {
        id: 'mine', name: 'Mine Haul', icon: '\u26cf\ufe0f',
        desc: 'Haul ore from the mine to the smelter',
        baseCost: 10, baseEarn: 1, baseTime: 3,
        costMul: 1.12, vehicle: 'truck.glb',
        from: 'Mine', to: 'Smelter', unlockCost: 0,
        roomColor: [0.45, 0.32, 0.22],  // brown
        floorColor: [0.35, 0.25, 0.18],
        accentColor: [0.7, 0.5, 0.2]
    },
    {
        id: 'farm', name: 'Farm Delivery', icon: '\ud83c\udf3e',
        desc: 'Transport crops to the market',
        baseCost: 100, baseEarn: 8, baseTime: 5,
        costMul: 1.13, vehicle: 'van.glb',
        from: 'Farm', to: 'Market', unlockCost: 500,
        roomColor: [0.25, 0.42, 0.22],
        floorColor: [0.2, 0.32, 0.18],
        accentColor: [0.4, 0.7, 0.25]
    },
    {
        id: 'factory', name: 'Factory Freight', icon: '\ud83c\udfed',
        desc: 'Ship goods to the warehouse',
        baseCost: 1200, baseEarn: 50, baseTime: 8,
        costMul: 1.14, vehicle: 'delivery.glb',
        from: 'Factory', to: 'Warehouse', unlockCost: 5000,
        roomColor: [0.3, 0.33, 0.45],
        floorColor: [0.22, 0.24, 0.32],
        accentColor: [0.4, 0.5, 0.75]
    },
    {
        id: 'oil', name: 'Oil Transport', icon: '\ud83d\udee2\ufe0f',
        desc: 'Haul crude to the refinery',
        baseCost: 15000, baseEarn: 350, baseTime: 10,
        costMul: 1.15, vehicle: 'truck-flat.glb',
        from: 'Oil Rig', to: 'Refinery', unlockCost: 50000,
        roomColor: [0.35, 0.3, 0.2],
        floorColor: [0.28, 0.24, 0.16],
        accentColor: [0.8, 0.6, 0.15]
    },
    {
        id: 'tech', name: 'Tech Logistics', icon: '\ud83d\udcbb',
        desc: 'Deliver servers to the data center',
        baseCost: 200000, baseEarn: 2500, baseTime: 12,
        costMul: 1.16, vehicle: 'sedan-sports.glb',
        from: 'Lab', to: 'Data Center', unlockCost: 500000,
        roomColor: [0.18, 0.32, 0.42],
        floorColor: [0.14, 0.24, 0.32],
        accentColor: [0.2, 0.6, 0.85]
    },
    {
        id: 'luxury', name: 'Luxury Express', icon: '\ud83d\udc8e',
        desc: 'Premium courier for VIP cargo',
        baseCost: 5000000, baseEarn: 20000, baseTime: 15,
        costMul: 1.17, vehicle: 'suv-luxury.glb',
        from: 'Boutique', to: 'Airport', unlockCost: 10000000,
        roomColor: [0.4, 0.22, 0.35],
        floorColor: [0.3, 0.18, 0.28],
        accentColor: [0.75, 0.35, 0.65]
    },
    {
        id: 'military', name: 'Defense Contract', icon: '\ud83d\udee1\ufe0f',
        desc: 'Secure military supply chain',
        baseCost: 100000000, baseEarn: 150000, baseTime: 18,
        costMul: 1.18, vehicle: 'ambulance.glb',
        from: 'Base', to: 'Outpost', unlockCost: 200000000,
        roomColor: [0.22, 0.3, 0.22],
        floorColor: [0.18, 0.24, 0.18],
        accentColor: [0.35, 0.55, 0.3]
    },
    {
        id: 'space', name: 'Space Cargo', icon: '\ud83d\ude80',
        desc: 'Interstellar freight hauling',
        baseCost: 5000000000, baseEarn: 1200000, baseTime: 20,
        costMul: 1.19, vehicle: 'race-future.glb',
        from: 'Spaceport', to: 'Station', unlockCost: 10000000000,
        roomColor: [0.15, 0.15, 0.3],
        floorColor: [0.1, 0.1, 0.22],
        accentColor: [0.3, 0.3, 0.8]
    }
];

const UPGRADES = [
    // Click power
    { id: 'c1', name: 'Better Gloves', icon: '\ud83e\udde4', desc: '2x click earnings', cost: 50, type: 'click', mul: 2 },
    { id: 'c2', name: 'Power Tools', icon: '\ud83d\udd27', desc: '3x click earnings', cost: 500, type: 'click', mul: 3 },
    { id: 'c3', name: 'Hydraulic Press', icon: '\u2699\ufe0f', desc: '5x click earnings', cost: 25000, type: 'click', mul: 5 },
    { id: 'c4', name: 'Quantum Loader', icon: '\u269b\ufe0f', desc: '10x click earnings', cost: 5000000, type: 'click', mul: 10 },
    // Speed
    { id: 's1', name: 'Paved Roads', icon: '\ud83d\udee3\ufe0f', desc: 'All routes 20% faster', cost: 200, type: 'speed', mul: 0.8, target: 'all' },
    { id: 's2', name: 'Highway System', icon: '\ud83d\udea7', desc: 'All routes 30% faster', cost: 10000, type: 'speed', mul: 0.7, target: 'all' },
    { id: 's3', name: 'Bullet Trains', icon: '\ud83d\ude84', desc: 'All routes 40% faster', cost: 500000, type: 'speed', mul: 0.6, target: 'all' },
    { id: 's4', name: 'Warp Drive', icon: '\ud83d\udd2e', desc: 'All routes 50% faster', cost: 50000000, type: 'speed', mul: 0.5, target: 'all' },
    // Earnings
    { id: 'e1', name: 'Logistics AI', icon: '\ud83e\udd16', desc: 'Mine & Farm earn 2x', cost: 1000, type: 'earn', mul: 2, target: ['mine', 'farm'] },
    { id: 'e2', name: 'Supply Chain', icon: '\ud83d\udce6', desc: 'Factory & Oil earn 2x', cost: 50000, type: 'earn', mul: 2, target: ['factory', 'oil'] },
    { id: 'e3', name: 'Global Network', icon: '\ud83c\udf10', desc: 'All routes earn 3x', cost: 2000000, type: 'earn', mul: 3, target: 'all' },
    { id: 'e4', name: 'Monopoly', icon: '\ud83c\udfe6', desc: 'All routes earn 5x', cost: 500000000, type: 'earn', mul: 5, target: 'all' },
    // Managers (auto-collect)
    { id: 'm_mine', name: 'Mine Foreman', icon: '\ud83d\udc77', desc: 'Auto-collect Mine Haul', cost: 150, type: 'manager', target: 'mine' },
    { id: 'm_farm', name: 'Farm Hand', icon: '\ud83e\uddd1\u200d\ud83c\udf3e', desc: 'Auto-collect Farm Delivery', cost: 2000, type: 'manager', target: 'farm' },
    { id: 'm_factory', name: 'Shift Lead', icon: '\ud83d\udc68\u200d\ud83d\udcbc', desc: 'Auto-collect Factory Freight', cost: 25000, type: 'manager', target: 'factory' },
    { id: 'm_oil', name: 'Rig Boss', icon: '\ud83e\uddd1\u200d\ud83d\udd2c', desc: 'Auto-collect Oil Transport', cost: 300000, type: 'manager', target: 'oil' },
    { id: 'm_tech', name: 'IT Director', icon: '\ud83d\udc69\u200d\ud83d\udcbb', desc: 'Auto-collect Tech Logistics', cost: 5000000, type: 'manager', target: 'tech' },
    { id: 'm_luxury', name: 'Concierge', icon: '\ud83e\uddd1\u200d\u2708\ufe0f', desc: 'Auto-collect Luxury Express', cost: 100000000, type: 'manager', target: 'luxury' },
    { id: 'm_military', name: 'General', icon: '\ud83c\udf96\ufe0f', desc: 'Auto-collect Defense Contract', cost: 2000000000, type: 'manager', target: 'military' },
    { id: 'm_space', name: 'Commander', icon: '\ud83d\udc68\u200d\ud83d\ude80', desc: 'Auto-collect Space Cargo', cost: 50000000000, type: 'manager', target: 'space' },
];

const ACHIEVEMENTS = [
    { id: 'e100', name: 'First Haul', desc: 'Earn $100', icon: '\ud83c\udfc1', check: s => s.totalEarned >= 100 },
    { id: 'e10k', name: 'Small Biz', desc: 'Earn $10K', icon: '\ud83d\udcb0', check: s => s.totalEarned >= 10000 },
    { id: 'e1m', name: 'Millionaire', desc: 'Earn $1M', icon: '\ud83d\udcb5', check: s => s.totalEarned >= 1e6 },
    { id: 'e1b', name: 'Billionaire', desc: 'Earn $1B', icon: '\ud83d\udc8e', check: s => s.totalEarned >= 1e9 },
    { id: 'e1t', name: 'Trillionaire', desc: 'Earn $1T', icon: '\ud83d\udc51', check: s => s.totalEarned >= 1e12 },
    { id: 'cl50', name: 'Clicker', desc: 'Click 50 times', icon: '\ud83d\udc46', check: s => s.totalClicks >= 50 },
    { id: 'cl500', name: 'Click Master', desc: 'Click 500 times', icon: '\ud83d\udd90\ufe0f', check: s => s.totalClicks >= 500 },
    { id: 'cl5k', name: 'Click Legend', desc: 'Click 5000 times', icon: '\u2b50', check: s => s.totalClicks >= 5000 },
    { id: 'r2', name: 'Expanding', desc: 'Unlock 2 routes', icon: '\ud83d\udea2', check: s => s.routeCount >= 2 },
    { id: 'r5', name: 'Empire Builder', desc: 'Unlock 5 routes', icon: '\ud83c\udf0d', check: s => s.routeCount >= 5 },
    { id: 'r8', name: 'Transport Tycoon', desc: 'Unlock all 8 routes', icon: '\ud83d\ude80', check: s => s.routeCount >= 8 },
    { id: 'p1', name: 'Fresh Start', desc: 'Prestige once', icon: '\ud83d\udd04', check: s => s.totalPrestiges >= 1 },
    { id: 'p5', name: 'Serial Restarter', desc: 'Prestige 5 times', icon: '\ud83c\udf00', check: s => s.totalPrestiges >= 5 },
    { id: 'p10', name: 'Phoenix', desc: 'Prestige 10 times', icon: '\ud83c\udf1f', check: s => s.totalPrestiges >= 10 },
    { id: 'u5', name: 'Upgrader', desc: 'Buy 5 upgrades', icon: '\u2b06\ufe0f', check: s => s.upgradeCount >= 5 },
    { id: 'u15', name: 'Fully Upgraded', desc: 'Buy 15 upgrades', icon: '\ud83d\udcaa', check: s => s.upgradeCount >= 15 },
    { id: 'ev5', name: 'Lucky', desc: 'Catch 5 events', icon: '\ud83c\udf40', check: s => s.eventsCaught >= 5 },
    { id: 'ev25', name: 'Event Hunter', desc: 'Catch 25 events', icon: '\ud83c\udfaf', check: s => s.eventsCaught >= 25 },
    { id: 'l50', name: 'Dedicated', desc: 'Route to level 50', icon: '\ud83c\udfc5', check: s => s.maxLevel >= 50 },
    { id: 'l100', name: 'Century', desc: 'Route to level 100', icon: '\ud83d\udc6e', check: s => s.maxLevel >= 100 },
];

const EVENTS = [
    { id: 'truck', icon: '\ud83d\ude9a', text: 'Bonus truck! Tap for 2x speed!', dur: 8, effect: 'speed', mul: 2, bonusDur: 30 },
    { id: 'ad', icon: '\ud83d\udcf0', text: 'Ad deal! Tap for 3x earnings!', dur: 6, effect: 'earn', mul: 3, bonusDur: 20 },
    { id: 'gold', icon: '\ud83c\udf1f', text: 'Gold rush! Tap for instant cash!', dur: 10, effect: 'cash', mul: 60 },
    { id: 'vip', icon: '\ud83d\udc51', text: 'VIP client! Tap for 5x earnings!', dur: 5, effect: 'earn', mul: 5, bonusDur: 15 },
    { id: 'turbo', icon: '\u26a1', text: 'Turbo! Tap for 3x speed!', dur: 7, effect: 'speed', mul: 3, bonusDur: 20 },
    { id: 'frenzy', icon: '\ud83d\udd25', text: 'Click frenzy! 10x clicks!', dur: 6, effect: 'click', mul: 10, bonusDur: 15 },
];

const PRESTIGE_DEFS = [
    { id: 'pe', name: 'Empire Knowledge', desc: '+25% earnings /lv', cost: 1, max: 20, val: 0.25 },
    { id: 'ps', name: 'Express Routes', desc: '+10% speed /lv', cost: 2, max: 10, val: 0.10 },
    { id: 'pc', name: 'Expert Hands', desc: '+50% click power /lv', cost: 1, max: 15, val: 0.50 },
    { id: 'pm', name: 'Head Start', desc: '+$500 starting cash /lv', cost: 3, max: 10, val: 500 },
    { id: 'pr', name: 'Negotiator', desc: '-5% route costs /lv', cost: 2, max: 10, val: 0.05 },
];

const SAVE_KEY = 'idle_transport_empire_v1';

// Scene constants
const ROOM_WIDTH = 22;
const ROOM_HEIGHT = 3.2;
const ROOM_GAP = 0.3;
const ROOM_DEPTH = 5;
const ROAD_START_X = -8;
const ROAD_END_X = 8;
