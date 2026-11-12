import { spend } from './economy.js';

// Only cosmetics that work without renderer changes: the crowd colour (setCrowds takes one per crowd),
// DOM name plates and count badges, the victory emote, and the style of your own big toasts.
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
export const SLOTS = Object.keys(SHOP);
export const item = (slot, id) => (SHOP[slot] || []).find((x) => x.id === id) || SHOP[slot][0];
export const owns = (save, slot, id) => (save.owned[slot] || []).includes(id) || item(slot, id).price === 0;

export function buy(save, slot, id) {
  const it = (SHOP[slot] || []).find((x) => x.id === id);
  if (!it) return { ok: false, why: 'unknown' };
  if (owns(save, slot, id)) return { ok: false, why: 'owned' };
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
