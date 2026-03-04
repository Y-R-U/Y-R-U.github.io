/* ===== GAME CONFIGURATION ===== */
const CONFIG = {
  // Canvas
  DESIGN_WIDTH: 390,
  DESIGN_HEIGHT: 700,

  // Gameplay
  BASE_HP: 500,
  GOLD_PER_SECOND: 2,
  STARTING_GOLD: 50,
  XP_PER_KILL: 10,
  GOLD_PER_KILL_BASE: 8,
  SPECIAL_COOLDOWN: 15000,
  SPECIAL_DAMAGE: 80,

  // Units spawn from base edges
  PLAYER_BASE_X: 0.06,  // fraction of canvas width
  ENEMY_BASE_X: 0.94,
  BASE_WIDTH: 50,
  BASE_HEIGHT: 80,
  GROUND_Y: 0.72,       // fraction of canvas height for ground level

  // Ages / Themes
  AGES: [
    {
      name: 'Scavenger Era',
      bgTheme: 'wasteland',
      color: '#a67c52',
      units: [
        { id: 'scout', name: 'Scout', hp: 30, atk: 8, speed: 1.8, range: 20, cost: 15, cooldown: 1500, type: 'melee' },
        { id: 'raider', name: 'Raider', hp: 55, atk: 14, speed: 1.2, range: 20, cost: 30, cooldown: 2500, type: 'melee' },
        { id: 'slinger', name: 'Slinger', hp: 25, atk: 10, speed: 1.0, range: 120, cost: 35, cooldown: 3000, type: 'ranged' },
      ],
      ageUpCost: 200,
    },
    {
      name: 'Militia Age',
      bgTheme: 'settlement',
      color: '#5a8f5a',
      units: [
        { id: 'militia', name: 'Militia', hp: 50, atk: 12, speed: 1.4, range: 20, cost: 20, cooldown: 1800, type: 'melee' },
        { id: 'pikeman', name: 'Pikeman', hp: 80, atk: 18, speed: 1.0, range: 30, cost: 45, cooldown: 3000, type: 'melee' },
        { id: 'archer', name: 'Archer', hp: 35, atk: 15, speed: 0.9, range: 140, cost: 50, cooldown: 3200, type: 'ranged' },
        { id: 'shieldbearer', name: 'Shield', hp: 130, atk: 6, speed: 0.7, range: 20, cost: 60, cooldown: 4000, type: 'tank' },
      ],
      ageUpCost: 500,
    },
    {
      name: 'Industrial Era',
      bgTheme: 'industrial',
      color: '#7a7a8a',
      units: [
        { id: 'rifleman', name: 'Rifleman', hp: 60, atk: 20, speed: 1.2, range: 160, cost: 40, cooldown: 2200, type: 'ranged' },
        { id: 'engineer', name: 'Engineer', hp: 45, atk: 10, speed: 1.0, range: 100, cost: 55, cooldown: 3500, type: 'ranged' },
        { id: 'cavalry', name: 'Cavalry', hp: 90, atk: 25, speed: 2.2, range: 20, cost: 70, cooldown: 4000, type: 'melee' },
        { id: 'cannon', name: 'Cannon', hp: 40, atk: 50, speed: 0.4, range: 200, cost: 100, cooldown: 6000, type: 'siege' },
      ],
      ageUpCost: 1200,
    },
    {
      name: 'Tech Revolution',
      bgTheme: 'tech',
      color: '#4a9ac9',
      units: [
        { id: 'trooper', name: 'Trooper', hp: 80, atk: 28, speed: 1.5, range: 150, cost: 55, cooldown: 2000, type: 'ranged' },
        { id: 'mech', name: 'Mech', hp: 200, atk: 35, speed: 0.8, range: 30, cost: 120, cooldown: 5000, type: 'tank' },
        { id: 'sniper', name: 'Sniper', hp: 40, atk: 60, speed: 0.7, range: 250, cost: 90, cooldown: 4500, type: 'ranged' },
        { id: 'drone', name: 'Drone', hp: 50, atk: 22, speed: 2.0, range: 130, cost: 65, cooldown: 2800, type: 'ranged' },
      ],
      ageUpCost: 3000,
    },
    {
      name: 'Neo Dominion',
      bgTheme: 'neo',
      color: '#9b59b6',
      units: [
        { id: 'plasmatroop', name: 'Plasma', hp: 100, atk: 40, speed: 1.4, range: 170, cost: 75, cooldown: 2200, type: 'ranged' },
        { id: 'titan', name: 'Titan', hp: 350, atk: 50, speed: 0.6, range: 35, cost: 180, cooldown: 6000, type: 'tank' },
        { id: 'nanoswarm', name: 'Swarm', hp: 60, atk: 30, speed: 2.5, range: 80, cost: 85, cooldown: 3000, type: 'melee' },
        { id: 'orbiter', name: 'Orbiter', hp: 70, atk: 70, speed: 0.5, range: 280, cost: 140, cooldown: 5500, type: 'siege' },
        { id: 'overlord', name: 'Overlord', hp: 500, atk: 60, speed: 0.4, range: 40, cost: 300, cooldown: 10000, type: 'tank' },
      ],
      ageUpCost: null, // final age
    }
  ],

  // Enemy nations
  ENEMY_NATIONS: [
    { name: 'Chaotic States of America', short: 'CSA', color: '#c0392b' },
    { name: 'New Austrazealand', short: 'NAZ', color: '#27ae60' },
    { name: 'Britashes', short: 'BRT', color: '#2c3e50' },
    { name: 'Frankenreich', short: 'FRK', color: '#2980b9' },
    { name: 'Canadoom', short: 'CND', color: '#e74c3c' },
    { name: 'Japocalypse', short: 'JPC', color: '#e67e22' },
    { name: 'Indestruction', short: 'IND', color: '#f39c12' },
    { name: 'Brazzillion', short: 'BRZ', color: '#2ecc71' },
    { name: 'Germageddon', short: 'GRM', color: '#34495e' },
    { name: 'Mexiterminate', short: 'MEX', color: '#1abc9c' },
    { name: 'Koreanihilation', short: 'KRN', color: '#8e44ad' },
    { name: 'Italypocalypse', short: 'ITP', color: '#d35400' },
    { name: 'Chinapocalypse', short: 'CHP', color: '#c0392b' },
    { name: 'Russination', short: 'RSN', color: '#7f8c8d' },
    { name: 'Swedestruction', short: 'SWD', color: '#3498db' },
  ],

  // Evolve upgrades (prestige system)
  EVOLVE_UPGRADES: [
    { id: 'ep_gold', name: 'Gold Rush', icon: '&#9733;', desc: '+20% gold income', maxLevel: 10, costBase: 1, costScale: 1.5 },
    { id: 'ep_hp', name: 'Fortify', icon: '&#9730;', desc: '+15% base HP', maxLevel: 10, costBase: 1, costScale: 1.5 },
    { id: 'ep_atk', name: 'War Doctrine', icon: '&#9876;', desc: '+10% unit attack', maxLevel: 10, costBase: 2, costScale: 1.8 },
    { id: 'ep_speed', name: 'Swift March', icon: '&#10148;', desc: '+8% unit speed', maxLevel: 5, costBase: 2, costScale: 2 },
    { id: 'ep_xp', name: 'Tactics', icon: '&#9670;', desc: '+25% XP gain', maxLevel: 5, costBase: 2, costScale: 2 },
    { id: 'ep_special', name: 'Artillery', icon: '&#9889;', desc: '+30% special dmg', maxLevel: 5, costBase: 3, costScale: 2 },
  ],

  // Wave scaling
  WAVE_HP_SCALE: 1.12,
  WAVE_ATK_SCALE: 1.08,
  WAVE_GOLD_REWARD: 50,
  WAVES_PER_BATTLE: 5,
};
