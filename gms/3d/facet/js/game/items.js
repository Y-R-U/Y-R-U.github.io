// Item definitions. `glyph` is what the inventory slot draws. Emoji specifically: the dingbat
// blocks (⚔ ⚱ ⬬) have no glyph in most mobile font stacks and come out as tofu, and emoji is the
// only icon set every phone is guaranteed to have. `tint` survives for the slot wash and 3D pickups.

export const SLOTS = [
  'head', 'neck', 'earL', 'earR', 'shoulders',
  'back', 'torso', 'gloves', 'waist',
  'handL', 'handR',
  'braceletL', 'braceletR',
  'ring1', 'ring2', 'ring3', 'ring4', 'ring5',
  'ring6', 'ring7', 'ring8', 'ring9', 'ring10',
  'legs', 'feet', 'ammo',
];

export const SLOT_LABEL = {
  head: 'Head', neck: 'Neck', earL: 'Left ear', earR: 'Right ear', shoulders: 'Shoulders',
  back: 'Back', torso: 'Torso', gloves: 'Gloves', waist: 'Waist',
  handL: 'Left hand', handR: 'Right hand',
  braceletL: 'Left wrist', braceletR: 'Right wrist',
  ring1: 'Ring', ring2: 'Ring', ring3: 'Ring', ring4: 'Ring', ring5: 'Ring',
  ring6: 'Ring', ring7: 'Ring', ring8: 'Ring', ring9: 'Ring', ring10: 'Ring',
  legs: 'Legs', feet: 'Feet', ammo: 'Ammo',
};

const D = {
  sword: {
    name: 'Iron sword', glyph: '🗡️', tint: '#c8ccd2', slot: 'handR', kind: 'weapon',
    weapon: { style: 'melee', range: 1.9, swing: 1.6, min: 3, max: 7, mana: 0 },
  },
  staff: {
    name: 'Oak staff', glyph: '🪄', tint: '#a8804e', slot: 'handR', kind: 'weapon',
    weapon: { style: 'magic', range: 9, swing: 2.2, min: 2, max: 9, mana: 4, bolt: '#a8d8ff' },
  },
  shield: { name: 'Round shield', glyph: '🛡️', tint: '#8a6a48', slot: 'handL', kind: 'armour', armour: 3 },
  cap: { name: 'Leather cap', glyph: '🧢', tint: '#8a6242', slot: 'head', kind: 'armour', armour: 2 },
  jerkin: { name: 'Leather jerkin', glyph: '🦺', tint: '#7a5638', slot: 'torso', kind: 'armour', armour: 4 },
  trousers: { name: 'Wool trousers', glyph: '👖', tint: '#6d6a58', slot: 'legs', kind: 'armour', armour: 2 },
  boots: { name: 'Boots', glyph: '🥾', tint: '#5d4130', slot: 'feet', kind: 'armour', armour: 1 },

  // `belt` and `pack` are the two items that change the inventory's shape.
  belt: { name: 'Tooled belt', glyph: '🪢', tint: '#8a6242', slot: 'waist', kind: 'armour', beltRows: 1 },
  backpack: { name: 'Canvas pack', glyph: '🎒', tint: '#7d8f6a', slot: 'back', kind: 'armour', packRows: 4 },

  ring: { name: 'Copper ring', glyph: '💍', tint: '#c89a5e', slot: 'ring1', kind: 'jewel' },
  bracelet: { name: 'Bone bracelet', glyph: '📿', tint: '#ddd2b8', slot: 'braceletL', kind: 'jewel' },
  amulet: { name: 'Amulet', glyph: '🧿', tint: '#d8c86a', slot: 'neck', kind: 'jewel' },

  hpot: { name: 'Health draught', glyph: '❤️', tint: '#d4574f', kind: 'use', stack: 10, heal: 22 },
  mpot: { name: 'Mana draught', glyph: '💙', tint: '#5f8fd6', kind: 'use', stack: 10, mana: 18 },
  apple: { name: 'Apple', glyph: '🍎', tint: '#c1654a', kind: 'use', stack: 20, heal: 5 },
  bread: { name: 'Bread', glyph: '🍞', tint: '#d0a45c', kind: 'use', stack: 20, heal: 9 },

  log: { name: 'Oak log', glyph: '🪵', tint: '#8b6243', kind: 'material', stack: 50 },
  stone: { name: 'Stone', glyph: '🪨', tint: '#8c8e93', kind: 'material', stack: 50 },
  coin: { name: 'Coins', glyph: '🪙', tint: '#e0b657', kind: 'material', stack: 9999 },
  feather: { name: 'Feather', glyph: '🪶', tint: '#e6e6e2', kind: 'material', stack: 99 },
};

export const ITEMS = D;
export function item(id) { return D[id] || null; }
export function stackOf(id) { return D[id]?.stack || 1; }

// A ring fits any of the ten finger slots, not just the one it names.
export function fitsSlot(id, slot) {
  const it = D[id];
  if (!it || !it.slot) return false;
  if (it.slot.startsWith('ring')) return slot.startsWith('ring');
  if (it.slot.startsWith('bracelet')) return slot.startsWith('bracelet');
  if (it.slot === 'earL' || it.slot === 'earR') return slot === 'earL' || slot === 'earR';
  return it.slot === slot;
}
