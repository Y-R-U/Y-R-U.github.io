// Level registry: built-in JSONs (fetched) + custom editor levels
// (localStorage). `?level=custom:<id>` plays a custom map.

import { customLevels } from './save.js';

export const BUILTIN = ['palmbay', 'docks'];
const cache = new Map();

export async function getLevel(id = 'palmbay') {
  if (id?.startsWith('custom:')) {
    const cid = id.slice(7);
    const lv = customLevels()[cid];
    if (lv) return lv;
    console.warn('custom level not found:', cid, '— falling back to palmbay');
    id = 'palmbay';
  }
  if (!BUILTIN.includes(id)) id = 'palmbay';
  if (!cache.has(id)) {
    cache.set(id, await fetch(`levels/${id}.json`).then(r => r.json()));
  }
  return cache.get(id);
}
