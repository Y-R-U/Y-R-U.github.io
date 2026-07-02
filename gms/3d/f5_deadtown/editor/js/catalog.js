// The editor palette: every placeable thing, grouped, with sensible default
// colliders/scales (the game only reads what the level doc says — these are
// just good starting values). Model names = pack entries (assets/pack.index).

export const CATALOG = [
  { cat: '🏠 Buildings', items: [
    { model: 'bld_family_a', name: 'Family House A', collide: { type: 'box', hx: 6, hz: 5 } },
    { model: 'bld_family_b', name: 'Family House B', collide: { type: 'box', hx: 6, hz: 5 } },
    { model: 'bld_house_a',  name: 'House A',        collide: { type: 'box', hx: 6, hz: 6 } },
    { model: 'bld_house_b',  name: 'House B',        collide: { type: 'box', hx: 6, hz: 6 } },
    { model: 'bld_cafe',     name: 'Café',           collide: { type: 'box', hx: 6, hz: 5 } },
    { model: 'bld_burger',   name: 'Burger Joint',   collide: { type: 'box', hx: 6, hz: 5 } },
    { model: 'bld_police',   name: 'Police Station', collide: { type: 'box', hx: 8, hz: 7 } },
    { model: 'bld_block',    name: 'Apartments',     collide: { type: 'box', hx: 8, hz: 6 } },
    { model: 'bld_cabin',    name: 'Cabin',          collide: { type: 'box', hx: 5, hz: 5 } },
    { model: 'bld_carwash',  name: 'Car Wash',       collide: { type: 'box', hx: 7, hz: 6 } },
  ] },
  { cat: '🚗 Vehicles', items: [
    { model: 'car_broken',  name: 'Broken Car',    collide: { type: 'circle', r: 2.4 } },
    { model: 'car_wreck',   name: 'Wrecked Car A', collide: { type: 'circle', r: 2.4 } },
    { model: 'car_wreck_b', name: 'Wrecked Car B', collide: { type: 'circle', r: 2.4 } },
    { model: 'car_police',  name: 'Police Cruiser', collide: { type: 'circle', r: 2.4 } },
    { model: 'bus_wreck',   name: 'Wrecked Bus',   collide: { type: 'circle', r: 3.0 } },
  ] },
  { cat: '🚧 Street', items: [
    { model: 'lamp_city',    name: 'City Lamp',    collide: { type: 'circle', r: 0.5 } },
    { model: 'lamp_road',    name: 'Road Lamp',    collide: { type: 'circle', r: 0.5 } },
    { model: 'barrier',      name: 'Barrier',      collide: { type: 'circle', r: 1.2 } },
    { model: 'barrier_dmg',  name: 'Barrier (dmg)', collide: { type: 'circle', r: 1.2 } },
    { model: 'barricade',    name: 'Barricade',    collide: { type: 'circle', r: 1.0 } },
    { model: 'barrier_traf', name: 'Traffic Barrier', collide: { type: 'circle', r: 0.9 } },
    { model: 'barrel',       name: 'Barrel',       collide: { type: 'circle', r: 0.85 } },
    { model: 'crate',        name: 'Crate',        collide: { type: 'circle', r: 0.85 } },
    { model: 'bin',          name: 'Bin',          collide: { type: 'circle', r: 0.85 } },
    { model: 'roadsign',     name: 'Road Sign',    collide: { type: 'circle', r: 0.6 } },
  ] },
  { cat: '🛋 Furniture', items: [
    { model: 'bed',          name: 'Bed',          collide: { type: 'circle', r: 1.6 } },
    { model: 'bed_wood',     name: 'Wood Bed',     collide: { type: 'circle', r: 1.6 } },
    { model: 'wardrobe',     name: 'Wardrobe',     collide: { type: 'circle', r: 1.0 } },
    { model: 'shelf',        name: 'Shelf',        collide: { type: 'circle', r: 0.9 } },
    { model: 'table_coffee', name: 'Table',        collide: { type: 'circle', r: 1.0 } },
    { model: 'chair',        name: 'Chair',        collide: { type: 'circle', r: 0.6 } },
    { model: 'tv_table',     name: 'TV Table',     collide: { type: 'circle', r: 0.8 } },
    { model: 'television',   name: 'Television (static screen)', collide: { type: 'none' }, y: 0.9 },
    { model: 'rug',          name: 'Rug',          collide: { type: 'none' } },
    { model: 'lamp_floor',   name: 'Floor Lamp',   collide: { type: 'none' } },
    { model: 'curtains',     name: 'Curtains',     collide: { type: 'none' } },
    { model: 'pc',           name: 'Computer',     collide: { type: 'none' } },
    { model: 'door_house',   name: 'Door',         collide: { type: 'none' } },
    { model: 'door_wood',    name: 'Wood Door',    collide: { type: 'none' } },
  ] },
];

export const WEAPON_IDS = ['bat', 'axe', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'machinegun'];
export const AMMO_IDS = ['9mm', 'shells', 'rifle'];
export const ZOMBIE_TYPES = ['walker', 'woman', 'runner', 'brute', 'skeleton'];
export const HOTSPOT_TYPES = ['exit', 'dialog', 'item', 'note', 'trigger'];
export const ENV_PRESETS = ['dusk', 'overcast', 'night', 'interior'];
export const FLOORS = ['street', 'grass', 'dirt', 'wood', 'tile', 'concrete'];

export const MARKERS = [
  { kind: 'hotspot', type: 'exit',    icon: '🚪', name: 'Exit hotspot' },
  { kind: 'hotspot', type: 'dialog',  icon: '💬', name: 'Dialog hotspot' },
  { kind: 'hotspot', type: 'item',    icon: '🔍', name: 'Item / search' },
  { kind: 'hotspot', type: 'note',    icon: '📄', name: 'Note' },
  { kind: 'hotspot', type: 'trigger', icon: '⚠️', name: 'Trigger (ambush)' },
  { kind: 'spawn',   icon: '🧟', name: 'Zombie spawn zone' },
  { kind: 'start',   icon: '🚩', name: 'Player start' },
];
export const PICKUPS = [
  { kind: 'pickup', pkind: 'weapon', icon: '🔫', name: 'Weapon pickup' },
  { kind: 'pickup', pkind: 'ammo',   icon: '📦', name: 'Ammo pickup' },
  { kind: 'pickup', pkind: 'medkit', icon: '🩹', name: 'Medkit' },
];
