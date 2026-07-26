// The RPG layer, as pure data + pure functions: chassis, guns, utilities,
// upgrade tracks, costs, XP and the world-ladder curve. Nothing here touches
// the DOM or the scene, so it can be unit-tested in node.

// ---------------------------------------------------------------------------
// Hulls
// ---------------------------------------------------------------------------

export const CHASSIS = {
  mainline: {
    id: 'mainline', name: 'MAINLINE', class: 'MEDIUM',
    hp: 190, speed: 17.5, accel: 44, traverse: 1.9, mass: 1.0,
    armour: 1.0, droneMul: 1.0, cost: 0, unlockLevel: 1,
    blurb: 'The workhorse. Nothing spectacular, nothing fatal.',
  },
  scout: {
    id: 'scout', name: 'HARRIER', class: 'LIGHT',
    hp: 135, speed: 25, accel: 66, traverse: 2.7, mass: 0.72,
    armour: 0.78, droneMul: 1.35, cost: 1800, unlockLevel: 4,
    blurb: 'Fast, thin-skinned, and carries the best uplink in the fleet.',
  },
  siege: {
    id: 'siege', name: 'BULWARK', class: 'HEAVY',
    hp: 305, speed: 12, accel: 30, traverse: 1.35, mass: 1.7,
    armour: 1.32, droneMul: 0.85, cost: 5200, unlockLevel: 8,
    blurb: 'A moving redoubt. Slow enough that you had better hit first.',
  },
  hunter: {
    id: 'hunter', name: 'REVENANT', class: 'DESTROYER',
    hp: 215, speed: 20, accel: 52, traverse: 2.2, mass: 1.1,
    armour: 1.12, droneMul: 1.15, cost: 12500, unlockLevel: 14,
    blurb: 'Prototype hull off the Ashworks line. Everything, slightly better.',
  },
};

// ---------------------------------------------------------------------------
// Main guns. Every shell is a real ballistic body — `speed` is muzzle
// velocity, `arc` picks the low or high firing solution, `wind` how much the
// crosswind pushes it.
// ---------------------------------------------------------------------------

export const WEAPONS = {
  ap76: {
    id: 'ap76', name: 'MK76 AP CANNON', short: 'AP76', kind: 'direct',
    dmg: 30, splashR: 3.2, splashDmg: 9, speed: 132, reload: 2.25,
    pen: 0.95, arc: 'low', wind: 0.15, shells: 1, spread: 0.006,
    craterR: 3.0, craterD: 0.55, propMul: 1.0, tracer: 0xffd27a,
    cost: 0, unlockLevel: 1,
    blurb: 'Flat, fast, dependable. Punches through frontal plate.',
  },
  twin30: {
    id: 'twin30', name: 'TWIN 30 AUTOCANNON', short: 'TWIN30', kind: 'burst',
    dmg: 12, splashR: 2.2, splashDmg: 4, speed: 168, reload: 2.7,
    pen: 0.55, arc: 'low', wind: 0.1, shells: 3, burstGap: 0.11, spread: 0.011,
    craterR: 1.8, craterD: 0.22, propMul: 0.8, tracer: 0x9dff6a,
    cost: 950, unlockLevel: 2,
    blurb: 'Three-round burst. Shreds light hulls and drones alike.',
  },
  he120: {
    id: 'he120', name: '120mm HE HOWITZER', short: 'HE120', kind: 'direct',
    dmg: 42, splashR: 8.5, splashDmg: 26, speed: 94, reload: 3.4,
    pen: 0.5, arc: 'low', wind: 0.35, shells: 1, spread: 0.008,
    craterR: 6.0, craterD: 1.5, propMul: 1.9, tracer: 0xff9a3c,
    cost: 2400, unlockLevel: 3,
    blurb: 'Wide blast. Removes the cover as well as the crew.',
  },
  mortar: {
    id: 'mortar', name: 'SIEGE MORTAR', short: 'MORTAR', kind: 'arc',
    dmg: 58, splashR: 11, splashDmg: 34, speed: 60, reload: 4.4,
    pen: 0.45, arc: 'high', wind: 1.0, shells: 1, spread: 0.012,
    craterR: 8.0, craterD: 2.3, propMul: 2.6, tracer: 0xffe066,
    cost: 4800, unlockLevel: 5,
    blurb: 'Drops straight down behind cover. Read the wind or waste it.',
  },
  rockets: {
    id: 'rockets', name: 'HAILSTORM ROCKET POD', short: 'ROCKETS', kind: 'salvo',
    dmg: 18, splashR: 5.2, splashDmg: 13, speed: 76, reload: 5.0,
    pen: 0.5, arc: 'low', wind: 0.55, shells: 5, burstGap: 0.13, spread: 0.028,
    craterR: 3.6, craterD: 0.85, propMul: 1.6, tracer: 0xff5a8a,
    cost: 7400, unlockLevel: 7,
    blurb: 'Five in the air at once. Saturation beats precision.',
  },
  rail: {
    id: 'rail', name: 'TEMPEST RAILGUN', short: 'RAILGUN', kind: 'rail',
    dmg: 82, splashR: 1.2, splashDmg: 4, speed: 380, reload: 5.3,
    pen: 1.5, arc: 'low', wind: 0.02, shells: 1, spread: 0.002,
    craterR: 2.0, craterD: 0.4, propMul: 1.2, tracer: 0x6ae4ff,
    cost: 13800, unlockLevel: 10,
    blurb: 'Effectively flat. Passes through trees, walls and turret rings.',
  },
  cluster: {
    id: 'cluster', name: 'CLUSTERFALL SHELL', short: 'CLUSTER', kind: 'cluster',
    dmg: 20, splashR: 5.4, splashDmg: 14, speed: 72, reload: 6.0,
    pen: 0.45, arc: 'high', wind: 0.85, shells: 1, submunitions: 6,
    spread: 0.01, craterR: 3.4, craterD: 0.7, propMul: 1.7, tracer: 0xc8a4ff,
    cost: 19500, unlockLevel: 13,
    blurb: 'Splits at the top of the arc. Nowhere under it is safe.',
  },
};

// ---------------------------------------------------------------------------
// Utility slot — charges, spent on a button, refilled between battles.
// ---------------------------------------------------------------------------

export const UTILITIES = {
  repair: {
    id: 'repair', name: 'FIELD REPAIR', short: 'REPAIR', charges: 2,
    cooldown: 10, heal: 0.42, dur: 2.6, cost: 0, unlockLevel: 1,
    blurb: 'Welds 42% of your hull back on over three seconds.',
  },
  smoke: {
    id: 'smoke', name: 'SMOKE SCREEN', short: 'SMOKE', charges: 3,
    cooldown: 9, dur: 7, radius: 13, cost: 700, unlockLevel: 2,
    blurb: 'Blinds every gunner who had a line on you.',
  },
  boost: {
    id: 'boost', name: 'NITRO SURGE', short: 'NITRO', charges: 3,
    cooldown: 8, dur: 3.6, mul: 1.9, ram: 34, cost: 1600, unlockLevel: 4,
    blurb: 'Doubles your top speed and turns your hull into the weapon.',
  },
  emp: {
    id: 'emp', name: 'EMP BURST', short: 'EMP', charges: 2,
    cooldown: 14, radius: 27, dur: 3.6, cost: 3400, unlockLevel: 6,
    blurb: 'Seizes enemy turret rings and drops drones out of the sky.',
  },
  mines: {
    id: 'mines', name: 'SCATTER MINES', short: 'MINES', charges: 2,
    cooldown: 11, count: 4, dmg: 55, radius: 6, cost: 5600, unlockLevel: 9,
    blurb: 'Four proximity charges in your wake. Let them chase you.',
  },
  strike: {
    id: 'strike', name: 'DRONE STRIKE', short: 'STRIKE', charges: 2,
    cooldown: 18, shells: 6, dmg: 46, radius: 9, cost: 9800, unlockLevel: 11,
    blurb: 'Your drone paints a target and the sky answers. Needs a mark.',
  },
};

// ---------------------------------------------------------------------------
// Modules — one-off systems you either have bolted on or you do not. Unlike
// the upgrade tracks these have no levels, and a couple of them change how
// the game is played rather than what the numbers are.
// ---------------------------------------------------------------------------

export const MODULES = {
  firecon: {
    id: 'firecon', name: 'FIRE CONTROL COMPUTER', short: 'FIRE CONTROL',
    icon: '🎚', cost: 900, unlockLevel: 1,
    blurb: 'Lays the gun on the nearest contact, leads it perfectly, corrects ' +
           'the full crosswind and stabilises the shot on the move.',
    note: 'On loan through act one. Switch it off in Settings any time you ' +
          'want the shot to be yours.',
  },
  rangefinder: {
    id: 'rangefinder', name: 'LASER RANGEFINDER', short: 'RANGEFINDER',
    icon: '📐', cost: 1400, unlockLevel: 3,
    blurb: 'Paints the exact impact point and the drop to it, so a cold ' +
           'first round lands where the second one would have.',
    note: 'Widens the aim-assist cone and keeps the impact marker lit even ' +
          'when the shell is going where you pointed.',
  },
};

export function moduleCost(id) {
  return (MODULES[id] && MODULES[id].cost) || 0;
}

// ---------------------------------------------------------------------------
// Upgrade tracks — five levels each, each level multiplies a derived stat.
// ---------------------------------------------------------------------------

export const UPGRADES = {
  hull:    { id: 'hull',    name: 'HULL PLATING',  icon: '🛡', base: 260,
             perLevel: '+11% hull, −4% damage taken' },
  engine:  { id: 'engine',  name: 'POWERPLANT',    icon: '⚙', base: 240,
             perLevel: '+7% speed, +9% acceleration' },
  turret:  { id: 'turret',  name: 'TURRET RING',   icon: '🎯', base: 200,
             perLevel: '+13% traverse speed' },
  loader:  { id: 'loader',  name: 'AUTOLOADER',    icon: '⏱', base: 320,
             perLevel: '−6.5% reload time' },
  optics:  { id: 'optics',  name: 'OPTICS SUITE',  icon: '🔭', base: 220,
             perLevel: '+aim assist, lead ghost, deeper zoom' },
  gunnery: { id: 'gunnery', name: 'GUNNERY CREW',  icon: '💥', base: 380,
             perLevel: '+8% shell damage, −12% spread' },
  workshop:{ id: 'workshop',name: 'FIELD WORKSHOP',icon: '🔧', base: 260,
             perLevel: '+0.7 hp/s repair out of contact' },
  uplink:  { id: 'uplink',  name: 'DRONE UPLINK',  icon: '📡', base: 300,
             perLevel: '+drone range, altitude, hull and ping rate' },
};

export const MAX_UP_LEVEL = 5;

export function upgradeCost(track, level) {
  const base = UPGRADES[track].base;
  return Math.round(base * Math.pow(1.82, level));
}

export function weaponLevelCost(weapon, level) {
  const base = Math.max(260, (WEAPONS[weapon].cost || 400) * 0.34);
  return Math.round(base * Math.pow(1.7, level));
}

export const MAX_WEAPON_LEVEL = 5;

// ---------------------------------------------------------------------------
// Camo — cosmetic only, but it is what people actually grind for.
// ---------------------------------------------------------------------------

export const CAMOS = {
  olive:    { id: 'olive',    name: 'FIELD OLIVE',   hull: 0x616b47, accent: 0xffc24d, cost: 0 },
  sand:     { id: 'sand',     name: 'DUST OCHRE',    hull: 0xa08a5c, accent: 0xffe08a, cost: 400 },
  slate:    { id: 'slate',    name: 'GUNSLATE',      hull: 0x515c69, accent: 0x8ad4ff, cost: 900 },
  winter:   { id: 'winter',   name: 'HOARFROST',     hull: 0xb2bec6, accent: 0x6ae4ff, cost: 1600 },
  crimson:  { id: 'crimson',  name: 'RED MARSHAL',   hull: 0x82322a, accent: 0xff5a4a, cost: 3200 },
  ash:      { id: 'ash',      name: 'ASHWORKS',      hull: 0x453c40, accent: 0xff7a30, cost: 5400 },
  jungle:   { id: 'jungle',   name: 'DEEP THICKET',  hull: 0x425c44, accent: 0x9dff6a, cost: 7800 },
  gold:     { id: 'gold',     name: 'MARSHAL GOLD',  hull: 0x8e7130, accent: 0xffd750, cost: 24000,
              rankReq: 1000, blurb: 'Top 1,000 only.' },
};

// ---------------------------------------------------------------------------
// XP / commander level
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 30;

export function xpForLevel(level) {
  // XP needed to go from `level` to `level + 1`
  return Math.round(150 * Math.pow(level, 1.42));
}

export function levelFromXp(totalXp) {
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (totalXp - spent < need) break;
    spent += need;
    level++;
  }
  return { level, into: totalXp - spent, need: level >= MAX_LEVEL ? 0 : xpForLevel(level) };
}

// ---------------------------------------------------------------------------
// World ladder. You enter the season around 150,000th out of a few million
// and climb. Anchors are interpolated in log space so every battle moves the
// number visibly, but #1 is a season-long grind.
// ---------------------------------------------------------------------------

const RANK_ANCHORS = [
  [0, 150000], [400, 128000], [1200, 92000], [3000, 54000], [6500, 28000],
  [13000, 14500], [24000, 7200], [42000, 3200], [68000, 1400], [100000, 620],
  [145000, 240], [205000, 88], [285000, 32], [385000, 11], [510000, 4],
  [660000, 1],
];

export const LADDER_SIZE = 2846019;   // "players in the season"

export function rankFromBP(bp) {
  bp = Math.max(0, bp);
  const A = RANK_ANCHORS;
  if (bp >= A[A.length - 1][0]) return 1;
  for (let i = 0; i < A.length - 1; i++) {
    const [b0, r0] = A[i], [b1, r1] = A[i + 1];
    if (bp <= b1) {
      const t = (bp - b0) / (b1 - b0);
      // interpolate the rank logarithmically for a smooth climb
      const r = Math.exp(Math.log(r0) + (Math.log(r1) - Math.log(r0)) * t);
      return Math.max(1, Math.round(r));
    }
  }
  return 1;
}

export function bpForRank(targetRank) {
  // inverse of rankFromBP, by bisection — used for "next tier at" readouts
  let lo = 0, hi = RANK_ANCHORS[RANK_ANCHORS.length - 1][0];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rankFromBP(mid) > targetRank) lo = mid; else hi = mid;
  }
  return Math.round(hi);
}

export const TIERS = [
  { max: 1,       name: 'GRAND MARSHAL', colour: '#ffd750' },
  { max: 10,      name: 'MARSHAL',       colour: '#ffb347' },
  { max: 100,     name: 'LEGEND',        colour: '#ff7a5a' },
  { max: 1000,    name: 'ELITE',         colour: '#c8a4ff' },
  { max: 5000,    name: 'TITANIUM',      colour: '#8ad4ff' },
  { max: 15000,   name: 'STEEL',         colour: '#9dd0c0' },
  { max: 40000,   name: 'IRON',          colour: '#b9a48a' },
  { max: 90000,   name: 'BRONZE',        colour: '#c08a54' },
  { max: Infinity, name: 'RECRUIT',      colour: '#8a8a8a' },
];

export function tierFor(rank) {
  for (const t of TIERS) if (rank <= t.max) return t;
  return TIERS[TIERS.length - 1];
}

export function nextTier(rank) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (TIERS[i].max < rank) return TIERS[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Derived stats — the single place where a save file becomes tank numbers.
// ---------------------------------------------------------------------------

export function derivedStats(profile) {
  const ch = CHASSIS[profile.chassis] || CHASSIS.mainline;
  const u = profile.upgrades;
  const w = WEAPONS[profile.weapon] || WEAPONS.ap76;
  const wl = (profile.weaponLevels && profile.weaponLevels[profile.weapon]) || 0;

  const hp = ch.hp * (1 + 0.11 * u.hull);
  const dmgTakenMul = (1 / ch.armour) * (1 - 0.04 * u.hull);
  const gunMul = (1 + 0.08 * u.gunnery) * (1 + 0.1 * wl);
  const mods = (profile.owned && profile.owned.modules) || [];
  const hasRangefinder = mods.indexOf('rangefinder') >= 0;

  return {
    chassis: ch,
    hpMax: Math.round(hp),
    speed: ch.speed * (1 + 0.07 * u.engine),
    accel: ch.accel * (1 + 0.09 * u.engine),
    traverse: ch.traverse * (1 + 0.13 * u.turret),
    dmgTakenMul,
    regen: 0.7 * u.workshop,
    modules: { firecon: mods.indexOf('firecon') >= 0, rangefinder: hasRangefinder },
    assistRange: 3.0 + 0.9 * u.optics + (hasRangefinder ? 2.4 : 0),
    leadQuality: clamp01(0.35 + 0.16 * u.optics),
    zoomMax: 1.85 + 0.28 * u.optics,
    droneMul: ch.droneMul * (1 + 0.16 * u.uplink),
    weapon: weaponStats(profile.weapon, wl, u),
    utility: utilityStats(profile.utility),
  };
}

export function weaponStats(weaponId, level = 0, upgrades = null) {
  const w = WEAPONS[weaponId] || WEAPONS.ap76;
  const gun = upgrades ? (1 + 0.08 * upgrades.gunnery) : 1;
  const loader = upgrades ? (1 - 0.065 * upgrades.loader) : 1;
  const spreadMul = upgrades ? Math.pow(0.88, upgrades.gunnery) : 1;
  const lvlMul = 1 + 0.1 * level;
  return {
    ...w,
    level,
    dmg: w.dmg * lvlMul * gun,
    splashDmg: w.splashDmg * lvlMul * gun,
    splashR: w.splashR * (1 + 0.04 * level),
    reload: w.reload * loader * (1 - 0.03 * level),
    spread: w.spread * spreadMul,
    craterR: w.craterR * (1 + 0.05 * level),
  };
}

export function utilityStats(utilityId) {
  return UTILITIES[utilityId] || UTILITIES.repair;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Scrap/XP payout shape shared by campaign and skirmish results.
export function payout({ score, difficulty, win, stars = 0 }) {
  const diffMul = 0.8 + difficulty * 0.45;
  const base = score * diffMul;
  return {
    scrap: Math.round((win ? base * 1.0 : base * 0.4) + (win ? 120 : 30) + stars * 90),
    xp: Math.round((win ? base * 0.7 : base * 0.3) + (win ? 90 : 25) + stars * 60),
  };
}
