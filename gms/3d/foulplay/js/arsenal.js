// Everything you can bolt to a car or pull out of a chest: the dirty tricks,
// the six upgrade slots, and the loot tables that feed them.
//
// Skills are deliberately banded by RANGE, because range is the whole risk
// curve of this game: a contact-range foul looks like racing, a long-range one
// looks like exactly what it is. `susp` is the raw suspicion a use generates
// before distance, cameras and your stealth rating are applied.

import { pick, randInt, rand } from './utils.js';

export const RARITY = {
  common:    { name: 'COMMON',    color: 0x9fb0c0, css: '#9fb0c0', mul: 1.0 },
  rare:      { name: 'RARE',      color: 0x4aa3ef, css: '#4aa3ef', mul: 1.0 },
  epic:      { name: 'EPIC',      color: 0xb765f0, css: '#b765f0', mul: 1.0 },
  legendary: { name: 'LEGENDARY', color: 0xffb020, css: '#ffb020', mul: 1.0 },
};

// ---------------------------------------------------------------------------
// Dirty tricks
// ---------------------------------------------------------------------------
// band:   contact (<6m) | close (<14m) | mid (<26m) | long (<44m)
// effect: consumed by attacks.js
export const SKILLS = [
  {
    id: 'slam', name: 'SIDE SLAM', icon: '💥', rarity: 'common', band: 'contact',
    range: 6.5, cd: 3.4, susp: 26, hype: 10, dmg: 34, push: 30,
    blurb: 'A hard shove into whoever is alongside. Looks like a racing incident because it basically is one.',
    tip: 'Cheapest foul in the game. Get level with them first.',
  },
  {
    id: 'bullbar', name: 'BULL RAM', icon: '🐂', rarity: 'common', band: 'contact',
    range: 9, cd: 4.2, susp: 30, hype: 12, dmg: 40, push: 16,
    blurb: 'Punts the car directly ahead. They go light, you keep the momentum.',
    tip: 'Best used into a corner — they arrive at the wall, not the apex.',
  },
  {
    id: 'pitspin', name: 'PIT HOOK', icon: '🌀', rarity: 'rare', band: 'contact',
    range: 8, cd: 6.5, susp: 44, hype: 22, dmg: 18, push: 12, spin: 3.1,
    blurb: 'Clips a rear quarter and sends them around. Almost always ends in the barrier.',
    tip: 'Aim for their back half. A spin at speed is a wreck.',
  },
  {
    id: 'hooksaw', name: 'HOOK SAW', icon: '🪚', rarity: 'rare', band: 'contact',
    range: 5.5, cd: 7, susp: 52, hype: 20, dmg: 26, push: 5, shear: 3, dur: 1.8,
    blurb: 'Kicks a blade out of the sill for two seconds. Strips panels off anything it touches.',
    tip: 'Parts come off, cars keep going. Great for the crowd, bad for their aero.',
  },
  {
    id: 'jetwash', name: 'JET WASH', icon: '🌬️', rarity: 'common', band: 'close',
    range: 15, cd: 5, susp: 34, hype: 8, dmg: 8, push: 20, rear: true,
    blurb: 'Rear-facing blast that shoves whoever is drafting you off their line.',
    tip: 'Deniable — most stewards call it dirty air.',
  },
  {
    id: 'oilslick', name: 'OIL SLICK', icon: '🛢️', rarity: 'common', band: 'drop',
    range: 0, cd: 9, susp: 30, hype: 14, drop: 'oil', dur: 12,
    blurb: 'Dumps sump oil behind you. Anyone through it loses the back end completely.',
    tip: 'Technically a mechanical failure. Technically.',
  },
  {
    id: 'tacks', name: 'CALTROPS', icon: '🔩', rarity: 'rare', band: 'drop',
    range: 0, cd: 10, susp: 40, hype: 16, drop: 'tacks', dur: 14,
    blurb: 'Scatters spikes. Shreds a tyre and the car limps for the rest of the lap.',
    tip: 'Lay them on the racing line before a fast corner.',
  },
  {
    id: 'smoke', name: 'SMOKE SCREEN', icon: '💨', rarity: 'common', band: 'drop',
    range: 0, cd: 8, susp: 16, hype: 6, drop: 'smoke', dur: 8,
    blurb: 'A wall of smoke. Rivals inside it lose their line and lift.',
    tip: 'The safest thing in the game to be seen doing.',
  },
  {
    id: 'emp', name: 'EMP PULSE', icon: '⚡', rarity: 'epic', band: 'close',
    range: 17, cd: 11, susp: 62, hype: 18, stun: 1.4, dmg: 6,
    blurb: 'Kills every engine and nitro system in a ring around you.',
    tip: 'Electronics leave a trace. Use it away from the cameras.',
  },
  {
    id: 'shockwave', name: 'SHOCKWAVE', icon: '🔊', rarity: 'epic', band: 'close',
    range: 20, cd: 10, susp: 58, hype: 24, dmg: 30, push: 26, radial: true,
    blurb: 'A pressure ring that throws everything nearby sideways at once.',
    tip: 'Turns a pack into a pile-up. The crowd goes berserk.',
  },
  {
    id: 'grapple', name: 'MAG HOOK', icon: '🧲', rarity: 'rare', band: 'mid',
    range: 30, cd: 8.5, susp: 66, hype: 20, pull: 26, dmg: 12,
    blurb: 'Latches the car ahead and reels you in — they lose speed, you gain it.',
    tip: 'Long range means long odds with the stewards.',
  },
  {
    id: 'anchor', name: 'DRAG ANCHOR', icon: '⚓', rarity: 'rare', band: 'mid',
    range: 28, cd: 9, susp: 60, hype: 16, slow: 0.55, dur: 2.6, dmg: 10,
    blurb: 'Fires a hook that drags the leader back into your clutches.',
    tip: 'Perfect on the run to the line. Wildly illegal.',
  },
  {
    id: 'scattergun', name: 'SCATTER GUN', icon: '🔫', rarity: 'epic', band: 'long',
    range: 46, cd: 7, susp: 84, hype: 26, dmg: 44, shear: 2,
    blurb: 'A spread of bolts down the straight. Windows, mirrors and bodywork go.',
    tip: 'Everybody sees this one. Everybody.',
  },
  {
    id: 'ramjet', name: 'RAM JET', icon: '🚀', rarity: 'epic', band: 'close',
    range: 22, cd: 9.5, susp: 54, hype: 30, dmg: 68, push: 34, selfDmg: 22, lunge: 34,
    blurb: 'Lights a solid-fuel charge and turns your car into the weapon.',
    tip: 'It hurts you too. Worth it.',
  },
  {
    id: 'wreckingball', name: 'WRECKING BALL', icon: '🏗️', rarity: 'legendary', band: 'close',
    range: 13, cd: 15, susp: 96, hype: 44, dmg: 90, push: 42, shear: 5, dur: 3.2,
    blurb: 'Swings a chained ball out of the boot. Nothing it touches stays whole.',
    tip: 'You will be investigated. Make it worth the fine.',
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillById = (id) => SKILL_BY_ID[id] || null;

// The three you start with are all contact-range: the game teaches "get close
// before you cheat" through the loadout, not through a tutorial box.
export const STARTER_SKILLS = ['slam', 'bullbar', 'smoke'];

// ---------------------------------------------------------------------------
// Upgrade slots
// ---------------------------------------------------------------------------
export const SLOTS = [
  { id: 'engine',  name: 'ENGINE',  icon: '⚙️', blurb: 'Top speed and how fast you get there.' },
  { id: 'tyres',   name: 'TYRES',   icon: '🛞', blurb: 'Grip, and how sideways you can go.' },
  { id: 'armour',  name: 'ARMOUR',  icon: '🛡️', blurb: 'How much you shrug off, and how hard you hit.' },
  { id: 'nitro',   name: 'NITRO',   icon: '🔥', blurb: 'Boost strength, length and how many you can carry.' },
  { id: 'frame',   name: 'FRAME',   icon: '🔧', blurb: 'Mass — who moves when two cars disagree.' },
  { id: 'stealth', name: 'STEALTH', icon: '🕶️', blurb: 'How little the stewards notice.' },
];

// stat keys: top(+m/s) accel(x) grip(x) boostPow(x) boostTime(+s) boostMax(+)
//            armour(x taken) ram(x dealt) mass(x) partHp(x) stealth(x susp) cd(x)
export const PARTS = [
  // ENGINE ------------------------------------------------------------------
  { id: 'eng1', slot: 'engine', name: 'Stock Four',        rarity: 'common',    tier: 1, stats: { top: 0,  accel: 1.00 } },
  { id: 'eng2', slot: 'engine', name: 'Turbo Six',         rarity: 'common',    tier: 2, stats: { top: 4,  accel: 1.07 } },
  { id: 'eng3', slot: 'engine', name: 'Blown V8',          rarity: 'rare',      tier: 3, stats: { top: 8,  accel: 1.14 } },
  { id: 'eng4', slot: 'engine', name: 'Twin-Turbo V10',    rarity: 'epic',      tier: 4, stats: { top: 12, accel: 1.21 } },
  { id: 'eng5', slot: 'engine', name: 'Rotary Screamer',   rarity: 'epic',      tier: 5, stats: { top: 15, accel: 1.28, grip: 0.96 } },
  { id: 'eng6', slot: 'engine', name: 'Quad-Turbo Proto',  rarity: 'legendary', tier: 6, stats: { top: 20, accel: 1.36 } },
  // TYRES -------------------------------------------------------------------
  { id: 'tyr1', slot: 'tyres', name: 'Street Radials',     rarity: 'common',    tier: 1, stats: { grip: 1.00 } },
  { id: 'tyr2', slot: 'tyres', name: 'Track Slicks',       rarity: 'common',    tier: 2, stats: { grip: 1.08 } },
  { id: 'tyr3', slot: 'tyres', name: 'Rally Knobblies',    rarity: 'rare',      tier: 3, stats: { grip: 1.12, offroad: 1.5 } },
  { id: 'tyr4', slot: 'tyres', name: 'Sticky Compound',    rarity: 'rare',      tier: 4, stats: { grip: 1.20 } },
  { id: 'tyr5', slot: 'tyres', name: 'Adaptive Slicks',    rarity: 'epic',      tier: 5, stats: { grip: 1.28, top: 2 } },
  { id: 'tyr6', slot: 'tyres', name: 'Graphene Grips',     rarity: 'legendary', tier: 6, stats: { grip: 1.38, offroad: 1.3 } },
  // ARMOUR ------------------------------------------------------------------
  { id: 'arm1', slot: 'armour', name: 'Bare Panels',       rarity: 'common',    tier: 1, stats: { armour: 1.00, ram: 1.00 } },
  { id: 'arm2', slot: 'armour', name: 'Steel Plate',       rarity: 'common',    tier: 2, stats: { armour: 0.90, ram: 1.06, top: -1 } },
  { id: 'arm3', slot: 'armour', name: 'Roll Cage',         rarity: 'rare',      tier: 3, stats: { armour: 0.80, ram: 1.12, partHp: 1.2 } },
  { id: 'arm4', slot: 'armour', name: 'Bar Frame',         rarity: 'rare',      tier: 4, stats: { armour: 0.72, ram: 1.24, partHp: 1.3 } },
  { id: 'arm5', slot: 'armour', name: 'Composite Shell',   rarity: 'epic',      tier: 5, stats: { armour: 0.62, ram: 1.28, partHp: 1.5, top: 2 } },
  { id: 'arm6', slot: 'armour', name: 'Reactive Plating',  rarity: 'legendary', tier: 6, stats: { armour: 0.50, ram: 1.42, partHp: 1.8 } },
  // NITRO -------------------------------------------------------------------
  { id: 'nit1', slot: 'nitro', name: 'Small Bottle',       rarity: 'common',    tier: 1, stats: { boostPow: 1.00, boostTime: 0,   boostMax: 0 } },
  { id: 'nit2', slot: 'nitro', name: 'Twin Bottle',        rarity: 'common',    tier: 2, stats: { boostPow: 1.05, boostTime: 0.3, boostMax: 0 } },
  { id: 'nit3', slot: 'nitro', name: 'Purge System',       rarity: 'rare',      tier: 3, stats: { boostPow: 1.10, boostTime: 0.5, boostMax: 1 } },
  { id: 'nit4', slot: 'nitro', name: 'Cryo Feed',          rarity: 'rare',      tier: 4, stats: { boostPow: 1.16, boostTime: 0.7, boostMax: 1 } },
  { id: 'nit5', slot: 'nitro', name: 'Overpressure Rig',   rarity: 'epic',      tier: 5, stats: { boostPow: 1.22, boostTime: 1.0, boostMax: 2 } },
  { id: 'nit6', slot: 'nitro', name: 'Afterburner',        rarity: 'legendary', tier: 6, stats: { boostPow: 1.32, boostTime: 1.4, boostMax: 3 } },
  // FRAME -------------------------------------------------------------------
  { id: 'frm1', slot: 'frame', name: 'Stock Chassis',      rarity: 'common',    tier: 1, stats: { mass: 1.00 } },
  { id: 'frm2', slot: 'frame', name: 'Reinforced Rails',   rarity: 'common',    tier: 2, stats: { mass: 1.08, partHp: 1.1 } },
  { id: 'frm3', slot: 'frame', name: 'Heavy Ballast',      rarity: 'rare',      tier: 3, stats: { mass: 1.18, accel: 0.97 } },
  { id: 'frm4', slot: 'frame', name: 'Battering Frame',    rarity: 'rare',      tier: 4, stats: { mass: 1.26, ram: 1.12 } },
  { id: 'frm5', slot: 'frame', name: 'Tungsten Core',      rarity: 'epic',      tier: 5, stats: { mass: 1.38, ram: 1.18, partHp: 1.2 } },
  { id: 'frm6', slot: 'frame', name: 'Juggernaut Spine',   rarity: 'legendary', tier: 6, stats: { mass: 1.55, ram: 1.3, armour: 0.9 } },
  // STEALTH -----------------------------------------------------------------
  { id: 'stl1', slot: 'stealth', name: 'Nothing To Hide',  rarity: 'common',    tier: 1, stats: { stealth: 1.00 } },
  { id: 'stl2', slot: 'stealth', name: 'Tinted Glass',     rarity: 'common',    tier: 2, stats: { stealth: 0.92 } },
  { id: 'stl3', slot: 'stealth', name: 'Cam Jammer',       rarity: 'rare',      tier: 3, stats: { stealth: 0.82 } },
  { id: 'stl4', slot: 'stealth', name: 'Marshal Payoff',   rarity: 'rare',      tier: 4, stats: { stealth: 0.72 } },
  { id: 'stl5', slot: 'stealth', name: 'Broadcast Splice', rarity: 'epic',      tier: 5, stats: { stealth: 0.60, hypeGain: 1.15 } },
  { id: 'stl6', slot: 'stealth', name: 'Ghost Protocol',   rarity: 'legendary', tier: 6, stats: { stealth: 0.44, hypeGain: 1.2 } },
];

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const partById = (id) => PART_BY_ID[id] || null;
export const partsForSlot = (slot) => PARTS.filter((p) => p.slot === slot);

export const STARTER_PARTS = { engine: 'eng1', tyres: 'tyr1', armour: 'arm1', nitro: 'nit1', frame: 'frm1', stealth: 'stl1' };

// ---------------------------------------------------------------------------
// Aggregated stats
// ---------------------------------------------------------------------------
const BASE_STATS = {
  top: 0, accel: 1, grip: 1, boostPow: 1, boostTime: 0, boostMax: 0,
  armour: 1, ram: 1, mass: 1, partHp: 1, stealth: 1, cd: 1, offroad: 1, hypeGain: 1,
};

const ADDITIVE = new Set(['top', 'boostTime', 'boostMax']);

export function statsFor(equipped) {
  const out = { ...BASE_STATS };
  for (const slot of SLOTS) {
    const p = partById(equipped && equipped[slot.id]);
    if (!p) continue;
    for (const [k, v] of Object.entries(p.stats)) {
      if (out[k] == null) out[k] = ADDITIVE.has(k) ? 0 : 1;
      if (ADDITIVE.has(k)) out[k] += v;
      else out[k] *= v;
    }
  }
  return out;
}

// A single number for "how good is this car", used to seed rival strength and
// to show a bar in the garage.
export function powerRating(equipped) {
  let sum = 0;
  for (const slot of SLOTS) {
    const p = partById(equipped && equipped[slot.id]);
    sum += p ? p.tier : 1;
  }
  return Math.round((sum / (SLOTS.length * 6)) * 100);
}

// ---------------------------------------------------------------------------
// Chests
// ---------------------------------------------------------------------------
export const CHEST_TIERS = {
  scrap:   { name: 'SCRAP CRATE',  css: '#9fb0c0', color: 0x9fb0c0, cash: [140, 340],   weights: { common: 74, rare: 24, epic: 2,  legendary: 0 } },
  parts:   { name: 'PARTS CRATE',  css: '#4aa3ef', color: 0x4aa3ef, cash: [320, 780],   weights: { common: 48, rare: 42, epic: 9,  legendary: 1 } },
  contra:  { name: 'CONTRABAND',   css: '#b765f0', color: 0xb765f0, cash: [700, 1600],  weights: { common: 20, rare: 46, epic: 29, legendary: 5 } },
  sponsor: { name: 'SPONSOR VAULT', css: '#ffb020', color: 0xffb020, cash: [1600, 3600], weights: { common: 4,  rare: 30, epic: 46, legendary: 20 } },
};

function rollRarity(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'common';
}

// Rolls the contents of a chest. `owned` lets us prefer things you do not have
// yet, which keeps mid-game chests from being three duplicate tyres.
export function rollChest(tierId, owned = { parts: [], skills: [] }) {
  const tier = CHEST_TIERS[tierId] || CHEST_TIERS.scrap;
  const items = [];
  const picks = tierId === 'sponsor' ? 3 : tierId === 'contra' ? 3 : 2;

  for (let i = 0; i < picks; i++) {
    const rarity = rollRarity(tier.weights);
    const wantSkill = Math.random() < (tierId === 'contra' ? 0.45 : 0.26);

    if (wantSkill) {
      const pool = SKILLS.filter((s) => s.rarity === rarity);
      const fresh = pool.filter((s) => !owned.skills.includes(s.id));
      const s = pick(fresh.length ? fresh : pool.length ? pool : SKILLS);
      if (owned.skills.includes(s.id)) {
        items.push({ kind: 'cash', amount: randInt(180, 460), why: `duplicate ${s.name}` });
      } else {
        items.push({ kind: 'skill', id: s.id, rarity: s.rarity });
      }
      continue;
    }

    const pool = PARTS.filter((p) => p.rarity === rarity);
    const fresh = pool.filter((p) => !owned.parts.includes(p.id));
    const p = pick(fresh.length ? fresh : pool.length ? pool : PARTS);
    if (owned.parts.includes(p.id)) {
      items.push({ kind: 'cash', amount: randInt(200, 520), why: `duplicate ${p.name}` });
    } else {
      items.push({ kind: 'part', id: p.id, rarity: p.rarity });
    }
  }

  items.push({ kind: 'cash', amount: Math.round(rand(tier.cash[0], tier.cash[1])) });
  return { tier: tierId, items };
}

// What the on-track pickup crates contain — weighted toward the cheap end.
export function trackChestTier() {
  const r = Math.random();
  if (r < 0.62) return 'scrap';
  if (r < 0.9) return 'parts';
  if (r < 0.99) return 'contra';
  return 'sponsor';
}
