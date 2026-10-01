// Item registry. Block items reuse their block id (1..255); every other item has an id >= 256.
import { descFor } from './itemdesc.js';

// Build it with createItems(BLOCKS) so this file never hard-depends on the block registry's shape.

export const TIERS = ['lattice', 'basalt', 'ferrite', 'qubit'];
export const TIER_NAMES = { lattice: 'Lattice', basalt: 'Basalt', ferrite: 'Ferrite', qubit: 'Qubit' };
export const TIER_SPEED = [1, 2, 4, 6, 9];          // index = tier level (0 = bare hand)
export const TIER_DURABILITY = [0, 60, 132, 251, 1562];
export const TOOL_TYPES = {
  cutter: { name: 'Filament Cutter', dmg: [1, 2, 3, 4, 5] },
  saw: { name: 'Lattice Saw', dmg: [1, 3, 4, 5, 6] },
  scoop: { name: 'Grain Scoop', dmg: [1, 2, 2, 3, 4] },
  blade: { name: 'Arc Blade', dmg: [1, 4, 5, 6, 8] },
};
const TIER_COLOR = { lattice: [0.62, 0.5, 0.32], basalt: [0.42, 0.44, 0.5], ferrite: [0.75, 0.78, 0.84], qubit: [0.35, 0.95, 1] };

// charge = Charge points restored (20 = full), eat = hold time in s
const FOOD = [
  { key: 'sun_fruit', name: 'Sun Fruit', color: [1, 0.78, 0.2], charge: 4, eat: 1.0, desc: 'Grown in solar film. Sweet and warm.' },
  { key: 'scrap_egg', name: 'Scrap Egg', color: [0.85, 0.88, 0.92], charge: 2, eat: 1.0, cooked: 'baked_egg' },
  { key: 'ibis_fibre', name: 'Ibis Fibre', color: [0.95, 0.55, 0.6], charge: 2, eat: 1.2, cooked: 'seared_fibre' },
  { key: 'baked_egg', name: 'Baked Egg', color: [1, 0.9, 0.55], charge: 5, eat: 1.0 },
  { key: 'seared_fibre', name: 'Seared Fibre', color: [0.85, 0.42, 0.25], charge: 7, eat: 1.2 },
];

const MATERIALS = [
  { key: 'lattice_rod', name: 'Lattice Rod', color: [0.7, 0.55, 0.35] },
  { key: 'carbon_nodule', name: 'Carbon Nodule', color: [0.16, 0.17, 0.2], fuel: 8 },
  { key: 'ferrite_ingot', name: 'Ferrite Ingot', color: [0.8, 0.82, 0.88] },
  { key: 'aurum_wire', name: 'Aurum Wire', color: [1, 0.8, 0.3] },
  { key: 'qubit_crystal', name: 'Qubit Crystal', color: [0.4, 0.95, 1], glow: 1 },
];

// M2 additions. Item ids are assigned in order and saves store them: only ever APPEND to this list.
const EXTRA = [
  { key: 'protein_gel', name: 'Protein Gel', kind: 'food', color: [0.55, 0.95, 0.45], charge: 3, eat: 1.2, cooked: 'grilled_gel' },
  { key: 'grilled_gel', name: 'Grilled Gel', kind: 'food', color: [0.95, 0.6, 0.25], charge: 8, eat: 1.2 },
  { key: 'fibre_mesh', name: 'Fibre Mesh', kind: 'material', color: [0.85, 0.75, 0.55] },
  { key: 'silk_strand', name: 'Silk Strand', kind: 'material', color: [0.92, 0.95, 1] },
  { key: 'void_pearl', name: 'Void Pearl', kind: 'material', color: [0.6, 0.3, 1], glow: 1 },
  { key: 'gel_bead', name: 'Gel Bead', kind: 'material', color: [0.4, 1, 0.6], glow: 1, fuel: 4 },
  { key: 'pulse_charge', name: 'Pulse Charge', kind: 'material', color: [0.4, 0.95, 1], glow: 1, desc: 'Ammo for the Pulse Bow.' },
  { key: 'pulse_bow', name: 'Pulse Bow', kind: 'tool', stack: 1, color: [0.45, 0.9, 1],
    tool: { type: 'bow', tier: 'lattice', level: 1, speed: 1, dmg: 1, durability: 384 },
    desc: 'Hold use to charge, let go to fire. Needs Pulse Charges.' },
  // M3 farming
  { key: 'seed_scoop', name: 'Seed Scoop', kind: 'tool', stack: 1, color: [0.55, 0.9, 0.45],
    tool: { type: 'hoe', tier: 'lattice', level: 1, speed: 1, dmg: 1, durability: 131 },
    desc: 'Use on loam or photomoss to till a grow bed.' },
  { key: 'sun_seeds', name: 'Sun Seeds', kind: 'material', color: [0.75, 0.95, 0.35], plant: 'sun_crop_0',
    desc: 'Use on a grow bed to plant. Crops need light to grow.' },
  { key: 'sun_grain', name: 'Sun Grain', kind: 'material', color: [1, 0.85, 0.3], glow: 1 },
  { key: 'sun_bread', name: 'Sun Bread', kind: 'food', color: [0.95, 0.7, 0.35], charge: 9, eat: 1.4 },
];

export function createItems(blocks = []) {
  const list = [];
  const KEY = {};
  const add = (it) => { list[it.id] = it; KEY[it.key] = it.id; return it; };

  const blockList = Array.isArray(blocks) ? blocks : Object.values(blocks);
  for (const b of blockList) {
    if (!b || !b.id || b.id >= 256) continue;
    add({ id: b.id, key: b.key, name: b.name || b.key, kind: 'block', block: b.id, stack: 64,
      color: b.color || [0.7, 0.7, 0.7], glow: b.emissive || 0, placeable: !b.liquid });
  }

  let next = 256;
  for (const f of FOOD) add({ id: next++, kind: 'food', stack: 64, ...f, food: { charge: f.charge, eat: f.eat } });
  for (const m of MATERIALS) add({ id: next++, kind: 'material', stack: 64, ...m });
  for (const [type, t] of Object.entries(TOOL_TYPES)) {
    TIERS.forEach((tier, i) => {
      const level = i + 1;
      add({ id: next++, key: `${tier}_${type}`, name: `${TIER_NAMES[tier]} ${t.name.split(' ').pop()}`,
        fullName: type === 'saw' ? `${TIER_NAMES[tier]} Saw` : `${TIER_NAMES[tier]} ${t.name}`, kind: 'tool', stack: 1, color: TIER_COLOR[tier],
        tool: { type, tier, level, speed: TIER_SPEED[level], dmg: t.dmg[level], durability: TIER_DURABILITY[level] } });
    });
  }

  for (const x of EXTRA) {
    const it = { id: next++, stack: 64, ...x };
    if (it.kind === 'food') it.food = { charge: it.charge, eat: it.eat };
    add(it);
  }

  for (const it of list) if (it) it.desc = descFor(it);

  const get = (id) => (typeof id === 'string' ? list[KEY[id]] : list[id]);
  return {
    list, KEY, get,
    id: (key) => KEY[key],
    blocks: () => list.filter((it) => it && it.kind === 'block'),
    palette: () => list.filter((it) => it && it.kind === 'block' && it.placeable).map((it) => it.id),
    isFood: (id) => get(id)?.kind === 'food',
  };
}
