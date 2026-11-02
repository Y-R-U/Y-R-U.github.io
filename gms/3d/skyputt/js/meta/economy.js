// Economy (PLAN 2.10): coin income per hole, the shop catalogue and prices, and seeded chests. Pure.
//
// Income (measured, see docs/notes/meta.md): a hole pays 2 coins per star (+5 for a hole in one), a
// finished round of 6+ holes adds 2 per hole, and each crystal pays 5 coins the first time only.
//   3-star front nine, replayed: 9 × 6 + 18 = 72 coins (+5 per ace, so ~85 for a strong round).
//   First clean pass of the front nine: about 72 + 135 (27 crystals) ≈ 210.
// Prices are set against ~75 coins per round: a helper is under one round, a colour ball ~2,
// a patterned ball 3-5, a trail 3-10, the glowing ball ~12 and the gold ball ~20.
import { rng } from '../events/events.js';
import { HELPERS } from './helpers.js';

export const COINS_PER_STAR = 2, ACE_COINS = 5, ROUND_COINS_PER_HOLE = 2, ROUND_MIN_HOLES = 6;
export function holeCoins({ stars, picked, ace }) { return picked ? 0 : stars * COINS_PER_STAR + (ace ? ACE_COINS : 0); }
export function roundCoins(holes) { return holes >= ROUND_MIN_HOLES ? holes * ROUND_COINS_PER_HOLE : 0; }

export const HELPER_PRICES = { longSight: 30, mulligan: 40, magnet: 60, steady: 45, sticky: 35, power: 45, guard: 50, ghost: 55 };

// Ball skins: base colour, pattern (drawn by js/meta/cosmetics.js), material feel.
export const BALLS = [
  { id: 'classic', name: 'Classic', price: 0, base: '#f7f7f4', pattern: 'stripe', accent: '#e8463a' },
  { id: 'cherry', name: 'Cherry', price: 120, base: '#e8463a', pattern: 'stripe', accent: '#fff4ec' },
  { id: 'ocean', name: 'Ocean', price: 120, base: '#2f7fe0', pattern: 'stripe', accent: '#bfe6ff' },
  { id: 'lime', name: 'Lime', price: 120, base: '#7bd23f', pattern: 'stripe', accent: '#1f5a1a' },
  { id: 'candy', name: 'Candy Swirl', price: 220, base: '#fff2f8', pattern: 'swirl', accent: '#ff5fa8' },
  { id: 'polka', name: 'Polka', price: 220, base: '#ffd23f', pattern: 'dots', accent: '#e8463a' },
  { id: 'checker', name: 'Checkers', price: 300, base: '#f4f4f4', pattern: 'checker', accent: '#22242c' },
  { id: 'starry', name: 'Starry Night', price: 400, base: '#1c2a6b', pattern: 'stars', accent: '#ffe27a' },
  { id: 'glow', name: 'Glow Ball', price: 900, base: '#c8fbff', pattern: 'plain', accent: '#5ff0ff', glow: true },
  { id: 'gold', name: 'Gold Ball', price: 1500, base: '#f2c75c', pattern: 'plain', accent: '#b9862a', metal: true },
];
// Trails while the ball rolls: ribbon colours along the tail, or sparkles.
export const TRAILS = [
  { id: 'none', name: 'No trail', price: 0, colors: [] },
  { id: 'streak', name: 'Streak', price: 250, colors: ['#ffffff', '#cfe9ff'] },
  { id: 'ember', name: 'Ember', price: 450, colors: ['#ffe27a', '#ff8a2a', '#e8463a'] },
  { id: 'rainbow', name: 'Rainbow', price: 600, colors: ['#ff5f5f', '#ffb347', '#ffe55f', '#6fe39a', '#5fb8ff', '#b07cff'] },
  { id: 'sparkle', name: 'Stardust', price: 750, colors: ['#fff6c4', '#f2c75c'], sparkle: true },
];
export const BALL_BY_ID = Object.fromEntries(BALLS.map(b => [b.id, b]));
export const TRAIL_BY_ID = Object.fromEntries(TRAILS.map(t => [t.id, t]));

// ---- chests ----
export const CHESTS = {
  wood: { name: 'Wooden Chest', coins: [15, 40], helpers: [1, 2], cosmetic: 0 },
  silver: { name: 'Silver Chest', coins: [40, 90], helpers: [2, 3], cosmetic: 0 },
  gold: { name: 'Golden Chest', coins: [100, 200], helpers: [3, 4], cosmetic: 0.25 },
};
const HELPER_WEIGHT = { longSight: 3, mulligan: 2, magnet: 2, steady: 2, sticky: 2, power: 2, guard: 2, ghost: 1 };
export const STAR_CHEST_EVERY = 3;     // every 3rd 3-star hole earns a wooden chest...
export const STAR_CHESTS_PER_DAY = 3;  // ...at most this many per day (no farming hole 1 forever)

// Contents of chest number `serial` for this save. Pure function of (seed, serial, kind, owned
// cosmetics), so reloading the page can never reroll a chest: the serial only moves on after the
// grant is saved. → { coins, helpers: { id: n }, cosmetic: { type: 'ball'|'trail', id } | null }
export function rollChest(seed, serial, kind, owned = []) {
  const C = CHESTS[kind] || CHESTS.wood;
  const r = rng(((seed >>> 0) ^ Math.imul(serial + 1, 0x9E3779B1)) >>> 0);
  r(); r();
  const span = ([a, b]) => a + Math.floor(r() * (b - a + 1));
  const coins = Math.round(span(C.coins) / 5) * 5;
  const helpers = {};
  const ids = HELPERS.map(h => h.id), tot = ids.reduce((a, id) => a + HELPER_WEIGHT[id], 0);
  for (let n = span(C.helpers); n > 0; n--) {
    let x = r() * tot, id = ids[0];
    for (const k of ids) { x -= HELPER_WEIGHT[k]; if (x < 0) { id = k; break; } }
    helpers[id] = (helpers[id] || 0) + 1;
  }
  let cosmetic = null;
  const roll = r();
  if (roll < C.cosmetic) {
    const pool = [...BALLS.map(b => ({ type: 'ball', ...b })), ...TRAILS.map(t => ({ type: 'trail', ...t }))]
      .filter(x => x.price > 0 && x.price <= 600 && !owned.includes(`${x.type}:${x.id}`));
    if (pool.length) { const x = pool[Math.floor(r() * pool.length)]; cosmetic = { type: x.type, id: x.id }; }
  }
  return { coins, helpers, cosmetic };
}
