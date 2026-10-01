// Block registry. Ids are stable forever (saves store them): only append.
// TILES are paint hints for the procedural atlas (js/render/atlas.js); see docs/notes/world.md.

export const TILES = [];
const tileIx = new Map();
function tile(name, pattern, base, accent, o = {}) {
  if (tileIx.has(name)) return tileIx.get(name);
  const t = { index: TILES.length, name, pattern, fallback: null, base, accent, emissive: 0, glow: 'none', scale: 1, alpha: 'opaque', lip: null, ...o };
  TILES.push(t);
  tileIx.set(name, t.index);
  return t.index;
}

export const BLOCKS = [];
export const BLOCK = {};

const DEF = {
  emissive: 0, light: 0, solid: true, cutout: false, transparent: false, liquid: false, plant: false,
  waterlogged: false, hangs: false, climbable: false, climb: false, shape: 'cube', glow: 'none', hardness: 1, tool: null, tier: 0, drops: null, buildOnly: false,
};

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function block(id, key, name, tiles, o = {}) {
  const t = typeof tiles === 'number' ? { top: tiles, side: tiles, bottom: tiles } : tiles;
  const b = { id, key, name, tile: t, ...DEF, ...o };
  if (b.plant && b.shape === 'cube') b.shape = 'cross';
  b.color = o.color ? hexToRgb(o.color) : hexToRgb(TILES[t.top].base);
  if (b.drops === null) b.drops = key;
  BLOCKS[id] = b;
  BLOCK[key.toUpperCase()] = id;
  return b;
}

// --- natural terrain ---
block(0, 'air', 'Air', tile('air', 'noise', '#000000', '#000000', { alpha: 'cutout' }),
  { solid: false, transparent: true, hardness: 0, drops: 'none' });

const loamT = tile('loam_mesh', 'grain', '#6b4a35', '#8a6a4a', { scale: 1 });
block(1, 'photomoss', 'Photomoss', {
  top: tile('photomoss_top', 'film', '#4fbf57', '#9cf57a', { emissive: 0.08 }),
  side: tile('photomoss_side', 'grain', '#6b4a35', '#8a6a4a', { lip: { color: '#4fbf57', px: 4, ragged: true } }),
  bottom: loamT,
}, { hardness: 0.6, tool: 'scoop', drops: 'loam_mesh', color: '#4fbf57' });
block(2, 'loam_mesh', 'Loam Mesh', loamT, { hardness: 0.5, tool: 'scoop' });
block(3, 'basalt_matrix', 'Basalt Matrix', tile('basalt_matrix', 'lattice', '#5c6470', '#7d8794', { scale: 2 }),
  { hardness: 1.5, tool: 'cutter', drops: 'fractured_matrix' });
block(4, 'fractured_matrix', 'Fractured Matrix', tile('fractured_matrix', 'veins', '#59606b', '#8b95a3'),
  { hardness: 2, tool: 'cutter' });
block(5, 'coreplate', 'Coreplate', tile('coreplate', 'circuit', '#1d1f2b', '#3a2f6b', { emissive: 0.15 }),
  { hardness: -1, tool: null, drops: 'none' });
block(6, 'mirror_sand', 'Mirror Sand', tile('mirror_sand', 'mirror', '#e8dcc0', '#ffffff', { emissive: 0.05 }),
  { hardness: 0.5, tool: 'scoop' });
block(7, 'shard_gravel', 'Shard Gravel', tile('shard_gravel', 'noise', '#7a7f87', '#b7c4cf', { scale: 2 }),
  { hardness: 0.6, tool: 'scoop' });
block(8, 'polymer_clay', 'Polymer Clay', tile('polymer_clay', 'grain', '#8fa0b8', '#b6c4d8'),
  { hardness: 0.6, tool: 'scoop' });

// --- forest ---
block(9, 'carbon_log', 'Carbon Bark Log', {
  top: tile('carbon_log_top', 'rings', '#3a3330', '#4ad7c8', { emissive: 0.2 }),
  side: tile('carbon_log_side', 'lattice', '#2e2a2a', '#4a4442'),
  bottom: tile('carbon_log_top', 'rings', '#3a3330', '#4ad7c8'),
}, { hardness: 2, tool: 'saw' });
block(10, 'lattice_planks', 'Lattice Planks', tile('lattice_planks', 'lattice', '#b08a5c', '#d8b27e'),
  { hardness: 2, tool: 'saw' });
block(11, 'solar_leaves', 'Solar Film Leaves', tile('solar_leaves', 'film', '#2fa86a', '#e6d84a', { alpha: 'cutout', emissive: 0.25, glow: 'night' }),
  { cutout: true, emissive: 0.25, glow: 'night', hardness: 0.2, tool: 'saw', drops: 'none' });
block(12, 'data_vine', 'Data Vine', tile('data_vine', 'plant', '#1f8a7a', '#5cf2ff', { alpha: 'cutout', emissive: 0.7, glow: 'pulse' }),
  { solid: false, plant: true, cutout: true, emissive: 0.7, glow: 'pulse', light: 4, hardness: 0, tool: null, hangs: true, climbable: true, climb: true });
block(13, 'lumen_bloom', 'Lumen Bloom', tile('lumen_bloom', 'plant', '#3fae5a', '#ff7be0', { alpha: 'cutout', emissive: 0.9, glow: 'always' }),
  { solid: false, plant: true, cutout: true, emissive: 0.9, glow: 'always', light: 10, hardness: 0, tool: null });

// --- water / shore ---
block(14, 'water', 'Water', tile('water', 'water', '#2a8fd6', '#7fe8ff', { alpha: 'blend' }),
  { solid: false, liquid: true, transparent: true, hardness: -1, drops: 'none' });
block(15, 'server_kelp', 'Server Kelp', tile('server_kelp', 'plant', '#1e7a5e', '#4dffb8', { alpha: 'cutout', emissive: 0.6, glow: 'pulse' }),
  { solid: false, plant: true, waterlogged: true, cutout: true, emissive: 0.6, glow: 'pulse', light: 6, hardness: 0 });
block(16, 'chrome_shingle', 'Chrome Shingle', tile('chrome_shingle', 'mirror', '#a9b4c2', '#eaf3ff', { scale: 2 }),
  { hardness: 0.7, tool: 'scoop' });
block(17, 'clearglass', 'Clearglass', tile('clearglass', 'panel', '#cfefff', '#ffffff', { alpha: 'cutout' }),
  { transparent: true, cutout: true, hardness: 0.4, drops: 'none' });

// --- ores ---
const ore = (id, key, name, accent, o) => block(id, key, name,
  tile(key, 'ore', '#5c6470', accent, { emissive: o.emissive ?? 0.3, glow: 'always' }),
  { tool: 'cutter', hardness: 3, ...o });
ore(18, 'ore_carbon', 'Carbon Nodule Ore', '#20201f', { tier: 0, drops: 'carbon_nodule', emissive: 0 });
ore(19, 'ore_ferrite', 'Ferrite Ore', '#d98b5b', { tier: 1, emissive: 0.1 });
ore(20, 'ore_aurum', 'Aurum Wire Ore', '#ffd34d', { tier: 2, emissive: 0.4 });
ore(21, 'ore_qubit', 'Qubit Crystal Ore', '#7af0ff', { tier: 2, drops: 'qubit_crystal', emissive: 0.8, light: 3 });

// --- crafted / devices ---
block(22, 'glowbulb', 'Glowbulb', tile('glowbulb', 'bulb', '#fff2c4', '#ffd36b', { alpha: 'cutout', emissive: 1, glow: 'always' }),
  { solid: false, plant: true, cutout: true, emissive: 1, glow: 'always', light: 14, hardness: 0 });
block(23, 'fabricator', 'Fabricator', {
  top: tile('fabricator_top', 'circuit', '#3b4252', '#4ad7ff', { emissive: 0.6, glow: 'always' }),
  side: tile('fabricator_side', 'panel', '#d7dde6', '#4ad7ff', { emissive: 0.4, glow: 'always' }),
  bottom: tile('device_bottom', 'panel', '#3b4252', '#596173'),
}, { hardness: 2, tool: 'saw' });
block(24, 'reflow_oven', 'Reflow Oven', {
  top: tile('reflow_oven_top', 'panel', '#4a4f5a', '#ff8a3d', { emissive: 0.3 }),
  side: tile('reflow_oven_side', 'device', '#5a606c', '#ff8a3d', { emissive: 0.6, glow: 'always' }),
  bottom: tile('device_bottom', 'panel', '#3b4252', '#596173'),
}, { hardness: 3, tool: 'cutter' });
block(25, 'cache', 'Cache', {
  top: tile('cache_top', 'panel', '#8a7cc2', '#c8b8ff'),
  side: tile('cache_side', 'device', '#7465ad', '#c8b8ff', { emissive: 0.3 }),
  bottom: tile('device_bottom', 'panel', '#3b4252', '#596173'),
}, { hardness: 2, tool: 'saw' });
block(26, 'sleep_pod', 'Sleep Pod', {
  top: tile('sleep_pod_top', 'film', '#e9f1ff', '#7ab8ff', { emissive: 0.3 }),
  side: tile('sleep_pod_side', 'panel', '#d5deeb', '#7ab8ff', { emissive: 0.2 }),
  bottom: tile('device_bottom', 'panel', '#3b4252', '#596173'),
}, { hardness: 1, tool: 'saw' });
block(27, 'polymer_brick', 'Polymer Brick', tile('polymer_brick', 'brick', '#c9d2e0', '#8e9bb0'),
  { hardness: 2, tool: 'cutter' });

// --- builder decor: neon panels ---
const NEON = [
  ['cyan', '#18c8e8', '#9ffcff'], ['magenta', '#e02ab8', '#ffa3ee'], ['lime', '#7bdc2a', '#ddff9a'],
  ['amber', '#f0a020', '#ffe29a'], ['violet', '#8a4bf0', '#d4b8ff'], ['coral', '#ff6a5a', '#ffc4b8'],
  ['white', '#e8eef6', '#ffffff'], ['cobalt', '#2a5cf0', '#a8c0ff'],
];
NEON.forEach(([c, base, acc], i) => block(28 + i, 'neon_' + c, 'Neon Panel (' + c + ')',
  tile('neon_' + c, 'panel', base, acc, { emissive: 0.55, glow: 'always' }),
  { emissive: 0.55, glow: 'always', light: 0, hardness: 0.5, tool: null }));
block(36, 'light_panel', 'Light Panel', tile('light_panel', 'panel', '#fffbe8', '#ffffff', { emissive: 1, glow: 'always' }),
  { emissive: 1, glow: 'always', light: 15, hardness: 0.5 });

// --- M2 biomes, caves (appended; never renumber) ---
// `fallback` names an M1 pattern the atlas can use if it does not know the new pattern word.
block(37, 'fibre_stone', 'Fibre Stone', tile('fibre_stone', 'fibre', '#8c8fa6', '#c9cde6', { fallback: 'veins', scale: 1 }),
  { hardness: 1.8, tool: 'cutter' });
block(38, 'frost_lattice', 'Frost Lattice', {
  top: tile('frost_lattice_top', 'lattice', '#eef6ff', '#bfe4ff', { emissive: 0.05 }),
  side: tile('frost_lattice_side', 'fibre', '#8c8fa6', '#c9cde6', { fallback: 'veins', lip: { color: '#eef6ff', px: 5, ragged: true } }),
  bottom: tile('fibre_stone', 'fibre', '#8c8fa6', '#c9cde6'),
}, { hardness: 0.6, tool: 'scoop', color: '#eef6ff' });
block(39, 'glass_spire', 'Glass Spire', {
  top: tile('glass_spire_top', 'rings', '#7fd9c9', '#e8fffb', { emissive: 0.3, glow: 'night' }),
  side: tile('glass_spire_side', 'crystal', '#5cc8b4', '#e8fffb', { fallback: 'mirror', emissive: 0.3, glow: 'night' }),
  bottom: tile('glass_spire_top', 'rings', '#7fd9c9', '#e8fffb'),
}, { hardness: 0.6, tool: 'saw', emissive: 0.3, glow: 'night' });
block(40, 'mirror_tile', 'Mirror Tile', tile('mirror_tile', 'panel', '#d9e4ef', '#ffffff', { emissive: 0 }),
  { hardness: 2, tool: 'cutter' });
block(41, 'mirror_tile_cracked', 'Cracked Mirror Tile', tile('mirror_tile_cracked', 'veins', '#c3ceda', '#f4f9ff'),
  { hardness: 1.5, tool: 'cutter', drops: 'mirror_tile' });
block(42, 'crystal_turf', 'Crystal Turf', {
  top: tile('crystal_turf_top', 'mirror', '#8fdc8a', '#e6fff0', { emissive: 0.06 }),
  side: tile('crystal_turf_side', 'grain', '#6b4a35', '#8a6a4a', { lip: { color: '#8fdc8a', px: 3, ragged: false } }),
  bottom: loamT,
}, { hardness: 0.6, tool: 'scoop', drops: 'loam_mesh', color: '#8fdc8a' });
block(43, 'prism_flower', 'Prism Flower', tile('prism_flower', 'plant', '#5fbf7a', '#ffd0ff', { alpha: 'cutout', emissive: 0.8, glow: 'always' }),
  { solid: false, plant: true, cutout: true, emissive: 0.8, glow: 'always', light: 4, hardness: 0 });
block(44, 'seabed_node', 'Seabed Node', tile('seabed_node', 'circuit', '#1b2e4a', '#3dfff0', { emissive: 0.9, glow: 'pulse' }),
  { emissive: 0.9, glow: 'pulse', light: 10, hardness: 2, tool: 'cutter' });
block(45, 'kelp_bulb', 'Kelp Bulb', tile('kelp_bulb', 'bulb', '#2fd8a0', '#c4fff0', { alpha: 'cutout', emissive: 1, glow: 'pulse' }),
  { solid: false, plant: true, waterlogged: true, cutout: true, emissive: 1, glow: 'pulse', light: 9, hardness: 0, drops: 'server_kelp' });
block(46, 'glowcap', 'Glowcap', tile('glowcap', 'plant', '#3a4f7a', '#7affd4', { alpha: 'cutout', emissive: 0.9, glow: 'always' }),
  { solid: false, plant: true, cutout: true, emissive: 0.9, glow: 'always', light: 6, hardness: 0 });
block(47, 'filament_moss', 'Filament Moss', tile('filament_moss', 'plant', '#2a4060', '#9fb8ff', { alpha: 'cutout', emissive: 0.7, glow: 'pulse' }),
  { solid: false, plant: true, cutout: true, emissive: 0.7, glow: 'pulse', light: 4, hardness: 0, hangs: true });
block(48, 'mirror_sandstone', 'Mirror Sandstone', {
  top: tile('mirror_sandstone_top', 'mirror', '#d8c9a6', '#fff6dc'),
  side: tile('mirror_sandstone_side', 'brick', '#d2c29d', '#b9a77f'),
  bottom: tile('mirror_sandstone_top', 'mirror', '#d8c9a6', '#fff6dc'),
}, { hardness: 1.2, tool: 'cutter' });

// climb rail: the ladder. shape 'rail' = a thin panel drawn flat against its wall (see notes), no collision.
block(49, 'climb_rail', 'Climb Rail', tile('climb_rail', 'rail', '#3a4458', '#5cf2ff', { fallback: 'lattice', alpha: 'cutout', emissive: 0.5, glow: 'always' }),
  { solid: false, cutout: true, climbable: true, climb: true, shape: 'rail', emissive: 0.5, glow: 'always', hardness: 0.4, tool: 'saw' });

// --- farming (lane 4 grows crops; ids appended) ---
block(50, 'grow_bed', 'Grow Bed', {
  top: tile('grow_bed_top', 'furrows', '#4a3326', '#7be05a', { fallback: 'grain', emissive: 0.1 }),
  side: loamT, bottom: loamT,
}, { hardness: 0.6, tool: 'scoop', drops: 'loam_mesh', color: '#4a3326' });
const CROP = [['#3f9e4a', '#9cf57a', 0.1], ['#46b04f', '#c8f56a', 0.2], ['#4fbf57', '#ffe066', 0.35], ['#5ccf5a', '#ffd23d', 0.8]];
CROP.forEach(([base, acc, em], i) => block(51 + i, 'sun_crop_' + i, 'Sun Crop (stage ' + i + ')',
  tile('sun_crop_' + i, 'plant', base, acc, { alpha: 'cutout', emissive: em, glow: i === 3 ? 'always' : 'none', scale: 0.5 + i * 0.2 }),
  { solid: false, plant: true, cutout: true, emissive: em, glow: i === 3 ? 'always' : 'none', hardness: 0, drops: 'none', stage: i }));
block(55, 'bio_sapling', 'Bio Sapling', tile('bio_sapling', 'plant', '#2e2a2a', '#4fe0a0', { alpha: 'cutout', emissive: 0.3, glow: 'night', scale: 0.6 }),
  { solid: false, plant: true, cutout: true, emissive: 0.3, glow: 'night', hardness: 0 });

// representative colours matching lane 2's repainted tiles (js/render/atlas_styles.js STYLE): particles, map, icons
const REPAINT = {
  photomoss: '#1c9a86', loam_mesh: '#4a3f52', grow_bed: '#33293a', mirror_sand: '#aaa3c4', mirror_sandstone: '#a49cbe',
  basalt_matrix: '#3d4a60', fractured_matrix: '#465068', fibre_stone: '#7f86ad', crystal_turf: '#4fb8a6',
  polymer_clay: '#8f9cc4', shard_gravel: '#6f7890',
};
for (const k in REPAINT) BLOCKS[BLOCK[k.toUpperCase()]].color = hexToRgb(REPAINT[k]);

export const MAX_ID = BLOCKS.length - 1;

// Light helpers used by the world (and handy for the renderer).
// opacity: 15 = blocks light completely; otherwise extra attenuation on top of the normal 1 per step.
export const OPACITY = new Uint8Array(256);
export const EMIT = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
for (let i = 0; i < 256; i++) OPACITY[i] = 15;
for (const b of BLOCKS) {
  if (!b) continue;
  EMIT[b.id] = b.light;
  SOLID[b.id] = b.solid ? 1 : 0;
  if (b.id === 0 || b.plant || b.shape === 'rail' || (b.transparent && !b.liquid)) OPACITY[b.id] = 0;
  else if (b.liquid || b.cutout) OPACITY[b.id] = 1;
  else OPACITY[b.id] = 15;
}
