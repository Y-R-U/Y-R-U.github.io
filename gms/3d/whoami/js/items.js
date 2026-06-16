// Item database. `icon` is the HUD glyph; `model` (optional) is the pack asset
// used when the item appears in the world as a 3D pickup. `style` maps a weapon
// to a combat style the rig understands (sword=melee, crossbow=archery,
// staff=magic). food/heal numbers feed the survival + potion systems.

export const ITEMS = {
  // ── food ──
  apple:       { name: 'Apple',        icon: '🍎', cat: 'food', stack: true, value: 2,  food: 6,  model: 'apple' },
  carrot:      { name: 'Carrot',       icon: '🥕', cat: 'food', stack: true, value: 1,  food: 4,  model: 'carrot' },
  bread:       { name: 'Bread',        icon: '🍞', cat: 'food', stack: true, value: 3,  food: 9,  model: 'bread' },
  mushroom:    { name: 'Mushroom',     icon: '🍄', cat: 'food', stack: true, value: 1,  food: 3,  model: 'mushroom' },
  fish_raw:    { name: 'Raw Fish',     icon: '🐟', cat: 'food', stack: true, value: 3,  food: 3,  model: 'fish', raw: true, cooksTo: 'fish_cooked' },
  fish_cooked: { name: 'Cooked Fish',  icon: '🍤', cat: 'food', stack: true, value: 8,  food: 14, model: 'fish' },
  meat_raw:    { name: 'Raw Meat',     icon: '🥩', cat: 'food', stack: true, value: 2,  food: 3,  model: 'meat', raw: true, cooksTo: 'meat_cooked' },
  meat_cooked: { name: 'Cooked Meat',  icon: '🍖', cat: 'food', stack: true, value: 10, food: 16, model: 'meat' },

  // ── potions ──
  hpotion:     { name: 'Health Potion', icon: '🧪', cat: 'potion', stack: true, value: 15, heal: 25, food: 5, model: 'potion_red' },
  mpotion:     { name: 'Mana Potion',   icon: '🔵', cat: 'potion', stack: true, value: 12, mana: 30, model: 'potion_blue' },

  // ── tools (no skill needed — just owning them unlocks the action) ──
  waterskin:   { name: 'Waterskin',    icon: '🍶', cat: 'tool', stack: false, value: 5,  unique: true },
  axe:         { name: 'Axe',          icon: '🪓', cat: 'tool', stack: false, value: 20, model: 'axe' },
  tinderbox:   { name: 'Tinderbox',    icon: '🔦', cat: 'tool', stack: false, value: 10 },
  fishing_rod: { name: 'Fishing Rod',  icon: '🎣', cat: 'tool', stack: false, value: 15, model: 'fishing_pole' },

  // ── weapons (equip → sets combat style + bonus max-hit) ──
  sword:       { name: 'Bronze Sword', icon: '🗡️', cat: 'weapon', style: 'sword',    stack: false, value: 30, atk: 3, model: 'sword' },
  bow:         { name: 'Shortbow',     icon: '🏹', cat: 'weapon', style: 'crossbow', stack: false, value: 35, atk: 3, model: 'bow' },
  wand:        { name: 'Apprentice Wand', icon: '🪄', cat: 'weapon', style: 'staff', stack: false, value: 45, atk: 4 },

  // ── materials / loot / treasure ──
  logs:        { name: 'Logs',         icon: '🪵', cat: 'material', stack: true, value: 2, model: 'logs' },
  bones:       { name: 'Bones',        icon: '🦴', cat: 'material', stack: true, value: 1 },
  feather:     { name: 'Feather',      icon: '🪶', cat: 'material', stack: true, value: 1 },
  hide:        { name: 'Rat Hide',     icon: '🟫', cat: 'material', stack: true, value: 2 },
  gem:         { name: 'Gem',          icon: '💎', cat: 'treasure', stack: true, value: 40, model: 'gem' },
  gems:        { name: 'Gem Cluster',  icon: '💠', cat: 'treasure', stack: true, value: 65, model: 'gems' },
  gold_bar:    { name: 'Gold Bar',     icon: '🟨', cat: 'treasure', stack: true, value: 120, model: 'gold' },
};

export const item = (id) => ITEMS[id];

// Items the general store sells (id -> stock is infinite). Buy price = value.
export const STORE_STOCK = ['bread', 'apple', 'hpotion', 'mpotion', 'fishing_rod', 'axe', 'tinderbox', 'sword', 'bow', 'wand', 'waterskin'];
