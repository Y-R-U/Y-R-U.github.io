// Everything you can bolt to a car or pull out of a chest: the dirty tricks,
// the six upgrade slots, and the loot tables that feed them.
//
// Skills are deliberately banded by RANGE, because range is the whole risk
// curve of this game: a contact-range foul looks like racing, a long-range one
// looks like exactly what it is. `susp` is the raw suspicion a use generates
// before distance, cameras and your stealth rating are applied.

import { pick, randInt, rand } from './utils.js';

// Where a thing can come from. Keeping this on the item itself means the shop,
// the crate roller and the prize checker all read the same list and can never
// disagree about whether something is for sale.
//   shop  — buyable outright, and expensive
//   crate — only ever falls out of a crate
//   prize — only ever handed over for winning something specific
//   start — you already have it
export const SOURCES = {
  start: { name: 'OWNED', css: '#9fb0c0' },
  shop:  { name: 'FOR SALE', css: '#ffb020' },
  crate: { name: 'CRATE ONLY', css: '#b765f0' },
  prize: { name: 'PRIZE ONLY', css: '#37c26a' },
};

// Sticker price by tier. The curve is deliberately brutal at the top: a tier 6
// part should be most of a season's earnings, not an afternoon's.
export const TIER_PRICE = [0, 0, 3500, 12000, 38000, 95000, 250000];
const RARITY_PRICE = { common: 2600, rare: 11000, epic: 42000, legendary: 160000 };

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

// How each trick is obtained. Most are for sale — cash has to be able to buy
// its way to a full loadout — but the two that decide races are not.
const SKILL_SOURCE = {
  slam: 'start', bullbar: 'start', smoke: 'start',
  jetwash: 'shop', oilslick: 'shop', pitspin: 'shop', tacks: 'shop',
  hooksaw: 'shop', grapple: 'shop', anchor: 'shop',
  emp: 'shop', shockwave: 'shop', ramjet: 'shop',
  scattergun: 'crate',
  wreckingball: 'prize',
};
const SKILL_PRIZE = {
  wreckingball: { kind: 'win', event: 'gauntlet', eventName: 'THE GAUNTLET' },
};
for (const s of SKILLS) {
  s.src = SKILL_SOURCE[s.id] || 'shop';
  s.price = s.src === 'shop' ? RARITY_PRICE[s.rarity] : 0;
  if (SKILL_PRIZE[s.id]) s.prize = SKILL_PRIZE[s.id];
}

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

// Each slot has a different shape of ladder, so no two upgrade paths feel the
// same: one slot's tier 5 is on the shelf, another's only ever falls out of a
// crate, and every slot's tier 6 is something you had to go and win.
const PART_SOURCE = {
  eng1: 'start', eng2: 'shop',  eng3: 'shop',  eng4: 'shop',  eng5: 'crate', eng6: 'prize',
  tyr1: 'start', tyr2: 'shop',  tyr3: 'shop',  tyr4: 'crate', tyr5: 'shop',  tyr6: 'prize',
  arm1: 'start', arm2: 'shop',  arm3: 'shop',  arm4: 'shop',  arm5: 'crate', arm6: 'crate',
  nit1: 'start', nit2: 'shop',  nit3: 'crate', nit4: 'shop',  nit5: 'shop',  nit6: 'prize',
  frm1: 'start', frm2: 'shop',  frm3: 'shop',  frm4: 'crate', frm5: 'shop',  frm6: 'prize',
  stl1: 'start', stl2: 'shop',  stl3: 'shop',  stl4: 'shop',  stl5: 'crate', stl6: 'prize',
};
const PART_PRIZE = {
  eng6: { kind: 'story', level: 100 },
  tyr6: { kind: 'win', event: 'ringoffire', eventName: 'RING OF FIRE' },
  nit6: { kind: 'win', event: 'championsinvite', eventName: "CHAMPION'S INVITE" },
  frm6: { kind: 'win', event: 'derby', eventName: 'DEMOLITION DERBY' },
  stl6: { kind: 'win', event: 'blackout', eventName: 'BLACKOUT RUN' },
};
for (const p of PARTS) {
  p.src = PART_SOURCE[p.id] || 'shop';
  p.price = p.src === 'shop' ? TIER_PRICE[p.tier] : 0;
  if (PART_PRIZE[p.id]) p.prize = PART_PRIZE[p.id];
}

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const partById = (id) => PART_BY_ID[id] || null;
export const partsForSlot = (slot) => PARTS.filter((p) => p.slot === slot);

export const STARTER_PARTS = { engine: 'eng1', tyres: 'tyr1', armour: 'arm1', nitro: 'nit1', frame: 'frm1', stealth: 'stl1' };

// Everything with a `prize` on it, for the checker that hands them over.
export const PRIZE_ITEMS = [
  ...PARTS.filter((p) => p.prize).map((p) => ({ kind: 'part', id: p.id, name: p.name, cond: p.prize })),
  ...SKILLS.filter((s) => s.prize).map((s) => ({ kind: 'skill', id: s.id, name: s.name, cond: s.prize })),
];

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------
// Anything you own can be taken up four marks. A mark scales how far the part
// departs from stock, so upgrading a good tier 3 gets you most of the way to a
// stock tier 4 — the cheap route to a fast car, right up until it isn't.
export const MAX_LEVEL = 5;
const LEVEL_GAIN = 0.16;
export const MARKS = ['', 'I', 'II', 'III', 'IV', 'V'];

export const levelMul = (lvl) => 1 + LEVEL_GAIN * (clampLevel(lvl) - 1);
const clampLevel = (l) => Math.max(1, Math.min(MAX_LEVEL, l || 1));

// Cost of going from `lvl` to `lvl + 1`. Cheap at first, then it runs away —
// the last mark on a tier 5 part costs more than most tier 5 parts do.
export function upgradeCost(item, lvl) {
  if (!item || clampLevel(lvl) >= MAX_LEVEL) return 0;
  const base = Math.max(1200, (item.price || TIER_PRICE[item.tier || 2] || 3500) * 0.18);
  const raw = base * Math.pow(2.7, clampLevel(lvl) - 1);
  // Round to something that reads like a price rather than a calculation.
  const mag = Math.pow(10, Math.max(2, Math.floor(Math.log10(raw)) - 1));
  return Math.round(raw / mag) * mag;
}


// ---------------------------------------------------------------------------
// Aggregated stats
// ---------------------------------------------------------------------------
const BASE_STATS = {
  top: 0, accel: 1, grip: 1, boostPow: 1, boostTime: 0, boostMax: 0,
  armour: 1, ram: 1, mass: 1, partHp: 1, stealth: 1, cd: 1, offroad: 1, hypeGain: 1,
};

const ADDITIVE = new Set(['top', 'boostTime', 'boostMax']);

// Fold one stat block into another, respecting whether a key adds or multiplies.
export function foldStats(out, stats, mul = 1) {
  for (const [k, v] of Object.entries(stats || {})) {
    if (out[k] == null) out[k] = ADDITIVE.has(k) ? 0 : 1;
    if (ADDITIVE.has(k)) out[k] += v * mul;
    else out[k] *= 1 + (v - 1) * mul;    // scale the *departure from stock*
  }
  return out;
}

// `levels` maps part id → mark (1..5); `chassis` is the car's own stat block.
export function statsFor(equipped, levels, chassis) {
  const out = { ...BASE_STATS };
  for (const slot of SLOTS) {
    const p = partById(equipped && equipped[slot.id]);
    if (!p) continue;
    foldStats(out, p.stats, levelMul(levels && levels[p.id]));
  }
  if (chassis) foldStats(out, chassis, 1);
  return out;
}

// A single number for "how good is this car", used to seed rival strength and
// to show a bar in the garage. Marks count for a fraction of a tier each, so
// a fully upgraded tier 4 outranks a stock tier 5.
export function powerRating(equipped, levels) {
  let sum = 0;
  for (const slot of SLOTS) {
    const p = partById(equipped && equipped[slot.id]);
    if (!p) { sum += 1; continue; }
    sum += p.tier + (clampLevel(levels && levels[p.id]) - 1) * 0.3;
  }
  return Math.round((sum / (SLOTS.length * 7.2)) * 100);
}

// ---------------------------------------------------------------------------
// Chests
// ---------------------------------------------------------------------------
// A crate is mostly an envelope of cash. That is deliberate: cash buys almost
// everything in this game now, so a crate that pays out is still a crate that
// got you closer to the part you actually want. The good stuff is rare enough
// that pulling it is an event, and a legendary out of a scrap crate is not a
// thing that happens at all.
export const CHEST_TIERS = {
  scrap: {
    name: 'SCRAP CRATE', css: '#9fb0c0', color: 0x9fb0c0,
    cash: [400, 950], picks: 1, cashChance: 0.72,
    weights: { common: 94, rare: 6, epic: 0, legendary: 0 },
  },
  parts: {
    name: 'PARTS CRATE', css: '#4aa3ef', color: 0x4aa3ef,
    cash: [950, 2300], picks: 2, cashChance: 0.58,
    weights: { common: 78, rare: 21, epic: 1, legendary: 0 },
  },
  contra: {
    name: 'CONTRABAND', css: '#b765f0', color: 0xb765f0,
    cash: [2300, 5400], picks: 2, cashChance: 0.42,
    weights: { common: 52, rare: 40, epic: 7.6, legendary: 0.4 },
  },
  sponsor: {
    name: 'SPONSOR VAULT', css: '#ffb020', color: 0xffb020,
    cash: [6200, 14500], picks: 3, cashChance: 0.28,
    weights: { common: 26, rare: 51, epic: 20, legendary: 3 },
  },
};

// `luck` (0..0.25, from the team facility) shifts weight up the rarity ladder
// without ever letting a scrap crate produce something it should not.
function rollRarity(weights, luck = 0) {
  const order = ['common', 'rare', 'epic', 'legendary'];
  const w = {};
  let total = 0;
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    const base = weights[k] || 0;
    w[k] = base > 0 ? base * (1 + luck * i * 1.6) : 0;
    total += w[k];
  }
  let r = Math.random() * total;
  for (const k of order) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'common';
}

// Prize items never appear in a crate — the whole point of them is that you had
// to go and win something.
const cratePool = (list, rarity) => list.filter((x) => x.rarity === rarity && x.src !== 'prize');

// Rolls the contents of a crate. `owned` lets us prefer things you do not have
// yet, which keeps mid-game crates from being three duplicate tyres.
export function rollChest(tierId, owned = { parts: [], skills: [] }, luck = 0) {
  const tier = CHEST_TIERS[tierId] || CHEST_TIERS.scrap;
  const items = [];

  for (let i = 0; i < tier.picks; i++) {
    if (Math.random() < tier.cashChance) {
      items.push({ kind: 'cash', amount: Math.round(rand(tier.cash[0], tier.cash[1]) * 0.55) });
      continue;
    }
    const rarity = rollRarity(tier.weights, luck);
    const wantSkill = Math.random() < (tierId === 'contra' ? 0.42 : 0.24);

    if (wantSkill) {
      const pool = cratePool(SKILLS, rarity);
      const fresh = pool.filter((s) => !owned.skills.includes(s.id));
      const s = pick(fresh.length ? fresh : pool.length ? pool : SKILLS.filter((x) => x.src !== 'prize'));
      if (!s || owned.skills.includes(s.id)) {
        items.push({ kind: 'cash', amount: randInt(400, 1100), why: s ? `duplicate ${s.name}` : 'nothing you need' });
      } else {
        items.push({ kind: 'skill', id: s.id, rarity: s.rarity });
      }
      continue;
    }

    const pool = cratePool(PARTS, rarity);
    const fresh = pool.filter((p) => !owned.parts.includes(p.id));
    const p = pick(fresh.length ? fresh : pool.length ? pool : PARTS.filter((x) => x.src !== 'prize'));
    if (!p || owned.parts.includes(p.id)) {
      items.push({ kind: 'cash', amount: randInt(450, 1300), why: p ? `duplicate ${p.name}` : 'nothing you need' });
    } else {
      items.push({ kind: 'part', id: p.id, rarity: p.rarity });
    }
  }

  items.push({ kind: 'cash', amount: Math.round(rand(tier.cash[0], tier.cash[1])) });
  return { tier: tierId, items };
}

// What finishing in a given position is worth. The brief: fourth or worse gets
// one crate, the podium gets two, three and four — and the extra ones a winner
// gets are the good ones, so position matters more than volume.
export function crateAward(position, eventTier = 1) {
  const rich = eventTier >= 4.5 ? 'sponsor' : eventTier >= 2.5 ? 'contra' : 'parts';
  const mid = eventTier >= 4.5 ? 'contra' : 'parts';
  if (position === 1) return [rich, mid, 'scrap', 'scrap'];
  if (position === 2) return [mid, 'scrap', 'scrap'];
  if (position === 3) return [mid, 'scrap'];
  return ['scrap'];
}

// What an on-track pickup crate is worth. Almost always cash or a boost — the
// crates you actually open are the ones you earned at the flag.
export function trackPickup() {
  const r = Math.random();
  if (r < 0.5) return { kind: 'cash', amount: randInt(300, 900) };
  if (r < 0.82) return { kind: 'boost' };
  if (r < 0.97) return { kind: 'crate', tier: 'scrap' };
  return { kind: 'crate', tier: 'parts' };
}
