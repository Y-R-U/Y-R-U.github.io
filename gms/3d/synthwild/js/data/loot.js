// Loot for world-generated Caches (structures). Deterministic per (seed, x, y, z). Tune freely.
import { hashString, mulberry32 } from '../core/rng.js';

// entries: { key, w (weight), min, max }. rolls: [min, max] stacks per cache.
export const LOOT_TABLES = {
  // The guaranteed outpost near spawn: a kind first reward.
  starter: {
    rolls: [6, 6],
    guaranteed: [{ key: 'lattice_cutter', n: 1 }, { key: 'glowbulb', n: 8 }, { key: 'sun_bread', n: 3 }],
    entries: [
      { key: 'sun_fruit', w: 10, min: 2, max: 5 },
      { key: 'baked_egg', w: 6, min: 1, max: 3 },
      { key: 'lattice_planks', w: 8, min: 4, max: 10 },
      { key: 'lattice_rod', w: 6, min: 2, max: 6 },
      { key: 'carbon_nodule', w: 6, min: 2, max: 5 },
      { key: 'sun_seeds', w: 5, min: 2, max: 4 },
      { key: 'seed_scoop', w: 3, min: 1, max: 1 },
    ],
  },
  ruin: {
    rolls: [4, 8],
    entries: [
      { key: 'aurum_wire', w: 12, min: 1, max: 4 },
      { key: 'qubit_crystal', w: 4, min: 1, max: 2 },
      { key: 'ferrite_ingot', w: 10, min: 1, max: 5 },
      { key: 'sun_fruit', w: 12, min: 2, max: 5 },
      { key: 'baked_egg', w: 6, min: 1, max: 3 },
      { key: 'grilled_gel', w: 5, min: 1, max: 3 },
      { key: 'pulse_charge', w: 7, min: 4, max: 12 },
      { key: 'glowbulb', w: 8, min: 2, max: 6 },
      { key: 'clearglass', w: 5, min: 2, max: 8 },
      { key: 'basalt_cutter', w: 4, min: 1, max: 1 },
      { key: 'ferrite_blade', w: 3, min: 1, max: 1 },
      { key: 'ferrite_cutter', w: 2, min: 1, max: 1 },
      { key: 'pulse_bow', w: 2, min: 1, max: 1 },
      { key: 'void_pearl', w: 2, min: 1, max: 1 },
    ],
  },
  wreck: {
    rolls: [3, 6],
    entries: [
      { key: 'server_kelp', w: 10, min: 2, max: 8 },
      { key: 'ferrite_ingot', w: 8, min: 1, max: 4 },
      { key: 'aurum_wire', w: 5, min: 1, max: 3 },
      { key: 'protein_gel', w: 8, min: 1, max: 4 },
      { key: 'pulse_charge', w: 6, min: 4, max: 10 },
      { key: 'qubit_crystal', w: 2, min: 1, max: 1 },
      { key: 'basalt_saw', w: 3, min: 1, max: 1 },
    ],
  },
  outpost: {
    rolls: [3, 7],
    entries: [
      { key: 'carbon_nodule', w: 12, min: 2, max: 8 },
      { key: 'ferrite_ingot', w: 9, min: 1, max: 5 },
      { key: 'lattice_rod', w: 8, min: 2, max: 8 },
      { key: 'seared_fibre', w: 8, min: 1, max: 4 },
      { key: 'glowbulb', w: 8, min: 2, max: 8 },
      { key: 'basalt_scoop', w: 3, min: 1, max: 1 },
      { key: 'ferrite_cutter', w: 3, min: 1, max: 1 },
      { key: 'qubit_crystal', w: 2, min: 1, max: 2 },
    ],
  },
  vault: {
    rolls: [5, 9],
    entries: [
      { key: 'qubit_crystal', w: 8, min: 1, max: 3 },
      { key: 'aurum_wire', w: 10, min: 2, max: 6 },
      { key: 'ferrite_ingot', w: 10, min: 2, max: 8 },
      { key: 'void_pearl', w: 3, min: 1, max: 2 },
      { key: 'qubit_blade', w: 2, min: 1, max: 1 },
      { key: 'ferrite_cutter', w: 4, min: 1, max: 1 },
      { key: 'sun_bread', w: 8, min: 1, max: 4 },
      { key: 'pulse_charge', w: 6, min: 6, max: 16 },
    ],
  },
  observatory: {
    rolls: [3, 6],
    entries: [
      { key: 'clearglass', w: 12, min: 4, max: 12 },
      { key: 'light_panel', w: 6, min: 2, max: 6 },
      { key: 'aurum_wire', w: 8, min: 1, max: 4 },
      { key: 'qubit_crystal', w: 4, min: 1, max: 2 },
      { key: 'sun_seeds', w: 8, min: 2, max: 6 },
      { key: 'bio_sapling', w: 5, min: 1, max: 3 },
      { key: 'pulse_bow', w: 2, min: 1, max: 1 },
    ],
  },
  cache: {
    rolls: [3, 6],
    entries: [
      { key: 'sun_fruit', w: 12, min: 1, max: 4 },
      { key: 'sun_seeds', w: 6, min: 2, max: 5 },
      { key: 'seed_scoop', w: 2, min: 1, max: 1 },
      { key: 'lattice_planks', w: 10, min: 4, max: 12 },
      { key: 'lattice_rod', w: 8, min: 2, max: 6 },
      { key: 'carbon_nodule', w: 8, min: 1, max: 6 },
      { key: 'glowbulb', w: 6, min: 2, max: 6 },
      { key: 'ferrite_ingot', w: 4, min: 1, max: 3 },
      { key: 'lattice_cutter', w: 3, min: 1, max: 1 },
      { key: 'lattice_blade', w: 3, min: 1, max: 1 },
      { key: 'aurum_wire', w: 2, min: 1, max: 2 },
    ],
  },
};

export function lootTheme(biome) {
  if (biome === 'desert') return 'ruin';
  if (biome === 'ocean' || biome === 'deep_ocean' || biome === 'shore') return 'wreck';
  if (biome === 'mountains') return 'outpost';
  return 'cache';
}

// structure: the kind from world.structuresNear (ruin/outpost/vault/observatory) wins over the biome theme.
// Returns [{ slot, id, n, dur? }] for a 27-slot cache.
export function rollLoot(items, seed, x, y, z, biome, size = 27, structure = null) {
  const rnd = mulberry32(hashString(`${seed}|loot|${x}|${y}|${z}`));
  const t = LOOT_TABLES[structure] || LOOT_TABLES[lootTheme(biome)] || LOOT_TABLES.cache;
  const total = t.entries.reduce((a, e) => a + e.w, 0);
  const n = t.rolls[0] + Math.floor(rnd() * (t.rolls[1] - t.rolls[0] + 1));
  const free = [...Array(size).keys()];
  const out = [];
  for (const g of t.guaranteed || []) {
    const it = items.get(g.key);
    if (!it || !free.length) continue;
    const s = { slot: free.splice(Math.floor(rnd() * free.length), 1)[0], id: it.id, n: it.tool ? 1 : g.n };
    if (it.tool) s.dur = it.tool.durability;
    out.push(s);
  }
  for (let i = 0; i < n && free.length; i++) {
    let r = rnd() * total, e = t.entries[0];
    for (const x2 of t.entries) if ((r -= x2.w) <= 0) { e = x2; break; }
    const it = items.get(e.key);
    if (!it) continue;
    const slot = free.splice(Math.floor(rnd() * free.length), 1)[0];
    const cnt = Math.min(it.stack, e.min + Math.floor(rnd() * (e.max - e.min + 1)));
    const s = { slot, id: it.id, n: cnt };
    if (it.tool) { s.n = 1; s.dur = Math.max(1, Math.round(it.tool.durability * (0.4 + 0.6 * rnd()))); }
    out.push(s);
  }
  return out;
}
