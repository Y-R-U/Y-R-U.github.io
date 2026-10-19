// Data loader: js/data/index.js if present (default export DATA), else the sim fixture.
// Dynamic import so a missing file never breaks boot (D19).
import FIXTURE_DATA from './fixture_data.js';
import { prepareData } from './battle.js';

let cached = null;
export async function loadData({ force = false } = {}) {
  if (cached && !force) return cached;
  let d = null;
  try {
    const m = await import('../data/index.js');
    d = m.default || m.DATA || null;
  } catch (e) {
    if (!/Cannot find|Failed to fetch|ERR_MODULE_NOT_FOUND|404|error loading/i.test(String(e?.message || e))) {
      // A real syntax/runtime error in js/data — surface it, but keep the game booting.
      console.warn('[sim] js/data/index.js failed to load, using fixture data:', e);
    }
  }
  cached = prepareData(d || FIXTURE_DATA);
  cached._source = d ? 'js/data' : 'fixture';
  return cached;
}
export function fixtureData() { return prepareData(FIXTURE_DATA); }
