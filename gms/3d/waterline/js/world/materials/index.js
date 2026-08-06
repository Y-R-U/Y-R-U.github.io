// getMaterial(kit, surface) — the one dispatch every world module goes through.
//
// FROZEN after W0. A component fills in entries in its OWN materials/<kit>.js and never edits
// this file. Adding a surface name is additive and fine; renaming one is not.

import * as THREE from 'three';
import * as hull from './hull.js';
import * as bridge from './bridge.js';
import * as table from './table.js';

const KITS = { hull, bridge, table };

export const SURFACES = {
  // 'marker' is the red indicator on your own struck hull — brief step 6, REVIEW.md B2.
  hull: ['plate', 'deck', 'turret', 'rail', 'rust', 'boot', 'marker'],
  bridge: ['panel', 'glass', 'trim', 'seat', 'floor', 'screen'],
  table: ['glass', 'bezel', 'peg', 'pegHit', 'pegMiss', 'gridline'],
};

const cache = new Map();
let quality = null;

// Called once from main.js. Kits read the ladder (texCap, aniso) through it.
export function configureMaterials(q) {
  quality = q;
  q.onChange(key => { if (key === 'texCap' || key === '*') clear(); });
}

export function getMaterial(kit, surface) {
  const key = `${kit}:${surface}`;
  if (cache.has(key)) return cache.get(key);
  if (!KITS[kit]) throw new Error(`unknown material kit ${kit}`);
  if (!SURFACES[kit].includes(surface)) throw new Error(`unknown surface ${key} — add it to SURFACES first`);

  const m = KITS[kit].make?.(surface, quality) || grey(key);
  m.name = key;
  cache.set(key, m);
  return m;
}

// What every surface is until its kit fills it in: a matte grey that is obviously unfinished,
// not a plausible one that hides a missing implementation.
export function grey(label) {
  return new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.75, metalness: 0.05, name: label });
}

export function clear() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
