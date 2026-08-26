// The one dispatch point. DISPATCH ON THE `shape` STRING and degrade gracefully — data/enemies.js
// carries 39 enemies and 5 multi-part bosses and is still growing, so a missing shape must render
// as an obvious placeholder and never throw and never render nothing.

import { buildGround, depthFor, hasShape } from './ground.js';
import { buildAircraft, hasAircraft } from './aircraft.js';
import { buildBoss, hasBoss } from './boss.js';
import { PICKUP, livery } from '../palette.js';

export { depthFor };

export function classify(shape) {
  if (!shape) return 'ground';
  if (hasAircraft(shape)) return 'air';
  if (shape.startsWith('boss_')) return 'boss';
  if (hasShape(shape)) return 'ground';
  if (shape.startsWith('e_') || /jet|plane|fighter|drone|delta|stealth/.test(shape)) return 'air';
  return 'ground';
}

/**
 * @returns BufferGeometry, merged, vertex-coloured, already normalised for its class:
 *   ground: x[-1,1] y[0,2] z[-1,1]  -> scale by (w, h*1.2, depth)
 *   boss:   x[-1,1] y[-1,1]         -> scale by (w, h, depth)
 *   air:    length 1 nose-right     -> uniform scale by len
 */
export function buildModel(shape, pal, opts = {}) {
  const kind = classify(shape);
  if (kind === 'air') return buildAircraft(shape, livery(opts.livery || 'enemy'), pal.fx.accent);
  if (kind === 'boss') return buildBoss(shape, pal);
  return buildGround(shape, pal, PICKUP);
}

/** Cache keyed by everything that can change the geometry. Cleared on a palette swap. */
export function makeModelCache() {
  const map = new Map();
  return {
    get(shape, pal, palKey, opts = {}) {
      const k = `${shape}|${palKey}|${opts.livery || ''}`;
      let g = map.get(k);
      if (!g) { g = buildModel(shape, pal, opts); map.set(k, g); }
      return g;
    },
    size() { return map.size; },
    clear() { for (const g of map.values()) g.dispose(); map.clear(); },
  };
}
