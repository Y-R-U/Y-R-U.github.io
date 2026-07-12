// Item database. `icon` is the HUD glyph. `heal` = HP restored on eating.
// `tool` marks gathering tools (axe/pickaxe/net/rod work from the pack, RS
// mobile-style — no equipping needed); `tier` orders tool quality. Weapons
// equip into the single weapon slot and carry RS-ish atk (accuracy) and
// str (max-hit) bonuses. Coins are a counter, not a slot.

export const ITEMS = {
  // ── food ──
  raw_shrimp:  { name: 'Raw Shrimp',   icon: '🦐', cat: 'food', stack: true, value: 2,  raw: true, cooksTo: 'shrimp', cookLvl: 1 },
  shrimp:      { name: 'Shrimp',       icon: '🍤', cat: 'food', stack: true, value: 5,  heal: 3 },
  raw_trout:   { name: 'Raw Trout',    icon: '🐟', cat: 'food', stack: true, value: 12, raw: true, cooksTo: 'trout', cookLvl: 15 },
  trout:       { name: 'Trout',        icon: '🍣', cat: 'food', stack: true, value: 25, heal: 7 },
  raw_beef:    { name: 'Raw Beef',     icon: '🥩', cat: 'food', stack: true, value: 3,  raw: true, cooksTo: 'beef', cookLvl: 1 },
  beef:        { name: 'Cooked Beef',  icon: '🍖', cat: 'food', stack: true, value: 8,  heal: 4 },
  bread:       { name: 'Bread',        icon: '🍞', cat: 'food', stack: true, value: 8,  heal: 5 },
  burnt_food:  { name: 'Burnt Food',   icon: '🌚', cat: 'food', stack: true, value: 0 },

  // ── tools (work from the pack; best tier wins) ──
  bronze_axe:     { name: 'Bronze Axe',     icon: '🪓', cat: 'tool', tool: 'axe',     tier: 1, speed: 1.0,  stack: false, value: 20 },
  iron_axe:       { name: 'Iron Axe',       icon: '🪓', cat: 'tool', tool: 'axe',     tier: 2, speed: 1.35, stack: false, value: 60 },
  bronze_pickaxe: { name: 'Bronze Pickaxe', icon: '⛏️', cat: 'tool', tool: 'pickaxe', tier: 1, speed: 1.0,  stack: false, value: 25 },
  iron_pickaxe:   { name: 'Iron Pickaxe',   icon: '⛏️', cat: 'tool', tool: 'pickaxe', tier: 2, speed: 1.35, stack: false, value: 70 },
  small_net:      { name: 'Small Net',      icon: '🕸️', cat: 'tool', tool: 'net',     tier: 1, stack: false, value: 8 },
  fishing_rod:    { name: 'Fishing Rod',    icon: '🎣', cat: 'tool', tool: 'rod',     tier: 1, stack: false, value: 15 },
  tinderbox:      { name: 'Tinderbox',      icon: '🔥', cat: 'tool', tool: 'tinderbox', tier: 1, stack: false, value: 5 },
  hammer:         { name: 'Hammer',         icon: '🔨', cat: 'tool', tool: 'hammer',  tier: 1, stack: false, value: 5 },

  // ── weapons (equip → accuracy + max-hit bonuses) ──
  bronze_sword: { name: 'Bronze Sword', icon: '🗡️', cat: 'weapon', stack: false, value: 40,  atk: 4,  str: 6,  req: 1 },
  iron_sword:   { name: 'Iron Sword',   icon: '⚔️', cat: 'weapon', stack: false, value: 120, atk: 9,  str: 12, req: 10 },

  // ── materials ──
  logs:        { name: 'Logs',        icon: '🪵', cat: 'material', stack: true, value: 4 },
  oak_logs:    { name: 'Oak Logs',    icon: '🟫', cat: 'material', stack: true, value: 9 },
  copper_ore:  { name: 'Copper Ore',  icon: '🟠', cat: 'material', stack: true, value: 4 },
  tin_ore:     { name: 'Tin Ore',     icon: '⚪', cat: 'material', stack: true, value: 4 },
  iron_ore:    { name: 'Iron Ore',    icon: '🔴', cat: 'material', stack: true, value: 12 },
  bronze_bar:  { name: 'Bronze Bar',  icon: '🟧', cat: 'material', stack: true, value: 12 },
  iron_bar:    { name: 'Iron Bar',    icon: '⬜', cat: 'material', stack: true, value: 30 },
  bones:       { name: 'Bones',       icon: '🦴', cat: 'material', stack: true, value: 2 },
  feather:     { name: 'Feather',     icon: '🪶', cat: 'material', stack: true, value: 1 },
  cowhide:     { name: 'Cowhide',     icon: '🟤', cat: 'material', stack: true, value: 3 },
};

export const item = (id) => ITEMS[id];

// General store stock (infinite; buy price = value)
export const STORE_STOCK = ['tinderbox', 'hammer', 'small_net', 'fishing_rod', 'bread',
  'bronze_axe', 'bronze_pickaxe', 'bronze_sword'];

// ── smelting (at a furnace) ──
export const SMELT = [
  { id: 'bronze_bar', name: 'Bronze Bar', icon: '🟧', lvl: 1,  needs: { copper_ore: 1, tin_ore: 1 }, xp: 12 },
  { id: 'iron_bar',   name: 'Iron Bar',   icon: '⬜', lvl: 15, needs: { iron_ore: 1 }, xp: 25, fail: 0.35 },  // iron can crumble, like RS
];

// ── smithing (at an anvil, needs a hammer) ──
export const SMITH = [
  { id: 'bronze_sword',   lvl: 1,  bar: 'bronze_bar', bars: 1 },
  { id: 'bronze_axe',     lvl: 3,  bar: 'bronze_bar', bars: 1 },
  { id: 'bronze_pickaxe', lvl: 5,  bar: 'bronze_bar', bars: 1 },
  { id: 'iron_sword',     lvl: 15, bar: 'iron_bar', bars: 1 },
  { id: 'iron_axe',       lvl: 17, bar: 'iron_bar', bars: 1 },
  { id: 'iron_pickaxe',   lvl: 20, bar: 'iron_bar', bars: 1 },
];
