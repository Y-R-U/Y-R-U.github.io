// Fabrication (no grid: the panel lists only what you can make, one tap each) and Reflow Oven smelting.
// Keys are item keys from items.js (block items use their block key).
// station: null = hand fabrication (the MC 2x2 equivalent), 'fabricator' = needs a Fabricator panel open.

const TOOL_COST = { cutter: 3, saw: 3, scoop: 1, blade: 2 };
const TIER_MAT = { lattice: 'lattice_planks', basalt: 'fractured_matrix', ferrite: 'ferrite_ingot', qubit: 'qubit_crystal' };

export const RECIPES = [
  { out: 'lattice_planks', n: 4, in: { carbon_log: 1 }, station: null },
  { out: 'lattice_rod', n: 4, in: { lattice_planks: 2 }, station: null },
  { out: 'fabricator', n: 1, in: { lattice_planks: 4 }, station: null },
  { out: 'glowbulb', n: 4, in: { carbon_nodule: 1, lattice_rod: 1 }, station: null },
  { out: 'glowbulb', n: 2, in: { lumen_bloom: 1, lattice_rod: 1 }, station: null },
  { out: 'sun_bread', n: 1, in: { sun_grain: 3 }, station: null },
  { out: 'seed_scoop', n: 1, in: { lattice_planks: 2, lattice_rod: 2 }, station: 'fabricator' },
  { out: 'cache', n: 1, in: { lattice_planks: 8 }, station: 'fabricator' },
  { out: 'reflow_oven', n: 1, in: { fractured_matrix: 8 }, station: 'fabricator' },
  { out: 'sleep_pod', n: 1, in: { fibre_mesh: 3, lattice_planks: 3 }, station: 'fabricator' },
  { out: 'sleep_pod', n: 1, in: { ibis_fibre: 6, lattice_planks: 3 }, station: 'fabricator' },
  { out: 'climb_rail', n: 4, in: { lattice_planks: 3 }, station: 'fabricator' },
  { out: 'mirror_tile', n: 4, in: { mirror_sandstone: 4 }, station: 'fabricator' },
  { out: 'polymer_brick', n: 4, in: { polymer_clay: 4 }, station: 'fabricator' },
  { out: 'basalt_matrix', n: 1, in: { fractured_matrix: 1 }, station: 'fabricator' },
  { out: 'light_panel', n: 2, in: { clearglass: 1, aurum_wire: 1 }, station: 'fabricator' },
  { out: 'pulse_bow', n: 1, in: { lattice_rod: 3, silk_strand: 3 }, station: 'fabricator' },
  { out: 'pulse_charge', n: 8, in: { carbon_nodule: 1, lattice_rod: 1 }, station: 'fabricator' },
  { out: 'neon_cyan', n: 4, in: { clearglass: 1, gel_bead: 1 }, station: 'fabricator' },
  { out: 'neon_magenta', n: 4, in: { clearglass: 1, void_pearl: 1 }, station: 'fabricator' },
  { out: 'neon_amber', n: 4, in: { clearglass: 1, aurum_wire: 1 }, station: 'fabricator' },
];
for (const [type, cost] of Object.entries(TOOL_COST)) {
  for (const [tier, mat] of Object.entries(TIER_MAT)) {
    RECIPES.push({ out: `${tier}_${type}`, n: 1, in: { [mat]: cost, lattice_rod: 2 }, station: 'fabricator' });
  }
}

// Oven: one input item -> one output item in SMELT_TIME seconds of burning fuel.
export const SMELT_TIME = 5;
export const OVEN = [
  { out: 'ferrite_ingot', in: 'ore_ferrite' },
  { out: 'aurum_wire', in: 'ore_aurum' },
  { out: 'clearglass', in: 'mirror_sand' },
  { out: 'carbon_nodule', in: 'carbon_log' },
  { out: 'baked_egg', in: 'scrap_egg' },
  { out: 'seared_fibre', in: 'ibis_fibre' },
  { out: 'grilled_gel', in: 'protein_gel' },
];
// Fuel: number of items one unit smelts.
export const FUEL = { carbon_nodule: 8, gel_bead: 4, carbon_log: 1.5, lattice_planks: 1.5, lattice_rod: 0.5 };

export function smeltResult(items, id) {
  const key = items.get(id)?.key;
  const r = OVEN.find((o) => o.in === key);
  return r ? items.id(r.out) : null;
}
export function fuelValue(items, id) { return FUEL[items.get(id)?.key] || 0; }

function have(items, inv, r) {
  return Object.entries(r.in).every(([k, n]) => inv.count(items.id(k)) >= n);
}

// What can be made right now. station: null (hand) or 'fabricator'.
export function available(items, inv, station = null) {
  return RECIPES.filter((r) => (!r.station || r.station === station) && items.get(r.out) && have(items, inv, r));
}

// Recipes you're close to: you hold at least one ingredient. Sorted by how little is missing.
export function almost(items, inv, station = null, max = 8) {
  const out = [];
  const seen = new Set();
  for (const r of RECIPES) {
    if ((r.station && r.station !== station) || have(items, inv, r) || seen.has(r.out)) continue;
    let missing = 0, got = 0;
    const need = [];
    for (const [k, n] of Object.entries(r.in)) {
      const c = Math.floor(inv.count(items.id(k)));
      got += Math.min(c, n);
      if (c < n) { missing += n - c; need.push({ key: k, n: n - c }); }
    }
    if (!got) continue;
    seen.add(r.out);
    out.push({ r, missing, need });
  }
  return out.sort((a, b) => a.missing - b.missing).slice(0, max);
}

export function make(items, inv, r) {
  if (!have(items, inv, r)) return false;
  for (const [k, n] of Object.entries(r.in)) inv.removeId(items.id(k), n);
  const left = inv.add(items.id(r.out), r.n);
  return { ok: true, overflow: left };
}
