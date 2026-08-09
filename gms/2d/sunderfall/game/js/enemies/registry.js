/**
 * The id -> definition table, kept in its own module so a unit can spawn another
 * unit (the oozelord splitting, the Seam calling adds) without importing `index.js`
 * and creating a cycle.
 */

import { makeEnemy } from './base.js';

export const ENEMIES = Object.create(null);

export function register(def) {
  ENEMIES[def.id] = def;
  return def;
}

export function spawnEnemyById(world, id, x, y, opts) {
  const def = ENEMIES[id];
  if (!def) { console.warn('[enemies] unknown id', id); return null; }
  return makeEnemy(world, def, x, y, opts);
}
