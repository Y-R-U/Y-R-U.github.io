import { spend } from './economy.js';
import { unit } from './hash.js';

// DOM cosmetics (name plate, count badge, victory emote, toast style) and the crowd colour; the 3D crowd
// cosmetics (hat, leader, flag, trail, ring) are added below.
export const SHOP = {
  color: [
    { id: 'blue', name: 'Empire Blue', color: 0x2f7bff, price: 0 },
    { id: 'red', name: 'Legion Red', color: 0xff3a3a, price: 250 },
    { id: 'gold', name: 'Sunflower', color: 0xffbf1a, price: 250 },
    { id: 'purple', name: 'Violet', color: 0x9b4dff, price: 250 },
    { id: 'green', name: 'Lime', color: 0x2fd14a, price: 250 },
    { id: 'orange', name: 'Tangerine', color: 0xff8320, price: 250 },
    { id: 'pink', name: 'Bubblegum', color: 0xff58c0, price: 250 },
    { id: 'cyan', name: 'Aqua', color: 0x19d3e6, price: 250 },
    { id: 'mint', name: 'Mint', color: 0x3dffb0, price: 600 },
    { id: 'coral', name: 'Coral', color: 0xff7a5c, price: 600 },
    { id: 'indigo', name: 'Indigo', color: 0x4b3cff, price: 700 },
    { id: 'teal', name: 'Deep Teal', color: 0x00a896, price: 800 },
    { id: 'lemon', name: 'Lemon', color: 0xeaff3a, price: 900 },
    { id: 'magenta', name: 'Magenta', color: 0xe6007a, price: 1000 },
    { id: 'ruby', name: 'Ruby', color: 0xb3002d, price: 1200 },
    { id: 'uv', name: 'Ultraviolet', color: 0x7a00ff, price: 1500 },
  ],
  plate: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'gold', name: 'Gold Trim', price: 400 },
    { id: 'neon', name: 'Neon', price: 500 },
    { id: 'candy', name: 'Candy', price: 600 },
    { id: 'carbon', name: 'Carbon', price: 700 },
    { id: 'rainbow', name: 'Rainbow', price: 1500 },
  ],
  badge: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'bubble', name: 'Bubble', price: 400 },
    { id: 'jewel', name: 'Jewel', price: 600 },
    { id: 'star', name: 'Superstar', price: 900 },
  ],
  emote: [
    { id: 'gg', name: 'GG', glyph: '👍', price: 0 },
    { id: 'cool', name: 'Cool', glyph: '😎', price: 300 },
    { id: 'flex', name: 'Flex', glyph: '💪', price: 300 },
    { id: 'fire', name: 'On Fire', glyph: '🔥', price: 400 },
    { id: 'party', name: 'Party', glyph: '🎉', price: 400 },
    { id: 'clown', name: 'Clown', glyph: '🤡', price: 500 },
    { id: 'salute', name: 'Salute', glyph: '🫡', price: 500 },
    { id: 'crown', name: 'Royal', glyph: '👑', price: 800 },
  ],
  toast: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'comic', name: 'Comic', price: 500 },
    { id: 'neon', name: 'Neon', price: 600 },
    { id: 'royal', name: 'Royal', price: 900 },
  ],
};
// Crowd cosmetics drawn by the renderer (R3, CONTRACT.md "Crowd cosmetics"). `level` / `league` gate the
// purchase: a few are earned by climbing, not only bought.
Object.assign(SHOP, {
  hat: [
    { id: 'none', name: 'No hat', price: 0 },
    { id: 'cap', name: 'Cap', price: 300 },
    { id: 'beanie', name: 'Beanie', price: 350 },
    { id: 'headband', name: 'Headband', price: 350 },
    { id: 'party', name: 'Party Hat', price: 500 },
    { id: 'hardhat', name: 'Hard Hat', price: 600 },
    { id: 'chef', name: 'Chef', price: 700, level: 4 },
    { id: 'cowboy', name: 'Cowboy', price: 800, level: 5 },
    { id: 'tophat', name: 'Top Hat', price: 1000, level: 8 },
    { id: 'wizard', name: 'Wizard', price: 1300, level: 10 },
    { id: 'crown', name: 'Crowns', price: 2000, league: 3 },
    { id: 'halo', name: 'Halo', price: 2500, league: 5 },
  ],
  leader: [
    { id: 'none', name: 'Classic', price: 0 },
    { id: 'mascot', name: 'Mascot', price: 900, level: 3 },
    { id: 'robot', name: 'Robot', price: 1200, level: 6 },
    { id: 'caped', name: 'Caped Hero', price: 1600, level: 9 },
    { id: 'king', name: 'The King', price: 3000, league: 4 },
  ],
  flag: [
    { id: 'none', name: 'No flag', price: 0 },
    { id: 'star', name: 'Star', price: 400 },
    { id: 'heart', name: 'Heart', price: 400 },
    { id: 'paw', name: 'Paw', price: 450 },
    { id: 'sun', name: 'Sun', price: 500 },
    { id: 'moon', name: 'Moon', price: 500 },
    { id: 'bolt', name: 'Bolt', price: 600, level: 3 },
    { id: 'flame', name: 'Flame', price: 700, level: 5 },
    { id: 'skull', name: 'Skull', price: 800, level: 7 },
    { id: 'diamond', name: 'Diamond', price: 1200, league: 3 },
    { id: 'crown', name: 'Royal', price: 1800, league: 5 },
  ],
  trail: [
    { id: 'none', name: 'No trail', price: 0 },
    { id: 'dust', name: 'Dust', price: 350 },
    { id: 'petals', name: 'Petals', price: 600 },
    { id: 'hearts', name: 'Hearts', price: 700, level: 3 },
    { id: 'confetti', name: 'Confetti', price: 900, level: 5 },
    { id: 'smoke', name: 'Smoke', price: 900, level: 6 },
    { id: 'sparkle', name: 'Sparkle', price: 1400, league: 2 },
    { id: 'lightning', name: 'Lightning', price: 2200, league: 4 },
  ],
  ring: [
    { id: 'solid', name: 'Solid', price: 0 },
    { id: 'dashed', name: 'Dashed', price: 400 },
    { id: 'double', name: 'Double', price: 700, level: 4 },
    { id: 'pulse', name: 'Pulse', price: 1000, level: 7 },
    { id: 'flame', name: 'Flame', price: 2000, league: 4 },
  ],
});
export const CROWD_SLOTS = ['hat', 'leader', 'flag', 'trail', 'ring'];

export const SLOTS = Object.keys(SHOP);
export const item = (slot, id) => (SHOP[slot] || []).find((x) => x.id === id) || SHOP[slot][0];
export const owns = (save, slot, id) => (save.owned[slot] || []).includes(id) || item(slot, id).price === 0;
export const unlocked = (save, it) => (save.level || 1) >= (it.level || 0) && (save.league || 0) >= (it.league || 0);

// The setCrowds fields for an equip set (unknown / 'none' ids are left out: today's look).
export function crowdCosmetics(eq = {}) {
  const out = {};
  for (const slot of CROWD_SLOTS) {
    const id = eq[slot];
    if (!id || id === 'none' || (slot === 'ring' && id === 'solid') || !(SHOP[slot] || []).some((x) => x.id === id)) continue;
    out[slot] = id;
  }
  if (out.hat) out.hatShare = 0.6;
  return out;
}

// A plausible look for a bot of a league: more and fancier items higher up, only what it could have unlocked.
export function botCosmetics(key, league = 0) {
  let n = 0;
  const rnd = () => unit('cos:' + key + ':' + n++);
  const level = 2 + league * 3;
  const fake = { level, league };
  const share = 0.18 + league * 0.09;
  const eq = {};
  for (const slot of CROWD_SLOTS) {
    if (rnd() > share * (slot === 'hat' ? 1.6 : slot === 'leader' ? 0.6 : 1)) continue;
    const pool = SHOP[slot].filter((it) => it.price > 0 && unlocked(fake, it));
    if (pool.length) eq[slot] = pool[Math.floor(rnd() * pool.length)].id;
  }
  return crowdCosmetics(eq);
}

export function buy(save, slot, id) {
  const it = (SHOP[slot] || []).find((x) => x.id === id);
  if (!it) return { ok: false, why: 'unknown' };
  if (owns(save, slot, id)) return { ok: false, why: 'owned' };
  if (!unlocked(save, it)) return { ok: false, why: 'locked' };
  if (!spend(save, it.price)) return { ok: false, why: 'coins' };
  save.owned[slot] = [...(save.owned[slot] || []), id];
  save.equip[slot] = id;
  return { ok: true };
}

export function equip(save, slot, id) {
  if (!owns(save, slot, id)) return false;
  save.equip[slot] = id;
  return true;
}
