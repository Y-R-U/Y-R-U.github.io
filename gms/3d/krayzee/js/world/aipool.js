// WORLD (C2): the AI types an airport can take. attract draws from the live array it was given, so the pool is refilled
// in place on every airport switch: at the Palace Lawn only what fits its 240 m lawn (no C172, no jets).
import { onLayoutChange, AIRPORT } from './layout.js';
import { canUse } from '../../data/airports/kingdom.js';
import { AI_JETS } from '../flight/attract.js';

export function aiPool(base) {
  const pool = [...base], jets = [...AI_JETS.pool];
  const fill = (def) => {
    const ok = (def.aiTypes || base).filter((t) => canUse(def, t).ok && !canUse(def, t).vertical);
    pool.splice(0, pool.length, ...(ok.length ? ok : base));
    AI_JETS.pool.splice(0, AI_JETS.pool.length, ...jets.filter((t) => canUse(def, t).ok && !canUse(def, t).vertical));
  };
  fill(AIRPORT);
  onLayoutChange(fill);
  return pool;
}
