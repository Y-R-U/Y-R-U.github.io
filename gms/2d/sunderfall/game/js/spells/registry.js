/**
 * The spell registry — the module `main.js` probes for a `SPELLS` export.
 *
 * `SPELLS` is a plain array of spell definitions in the ARCHITECTURE §7 shape.
 * The cast-circle system, focus, XP and the pick-1-of-3 offers hang off it as
 * extra properties (`SPELLS.byId`, `SPELLS.createSystem`, `SPELLS.system`) so
 * that main.js's one-line `ctx.spells = mods.spells.SPELLS` still hands the UI
 * everything it needs.
 *
 * The system boots itself: main publishes `window.__sunderfall` *before* it
 * imports optional modules, so importing this file is enough to wire the whole
 * thing up. Nothing else has to call anything.
 */

import { FIRE_SPELLS } from './schools/fire.js';
import { STORM_SPELLS } from './schools/storm.js';
import { EARTH_SPELLS } from './schools/earth.js';
import { DECAY_SPELLS } from './schools/decay.js';
import { VOID_SPELLS } from './schools/void.js';
import { LIFE_SPELLS } from './schools/life.js';
import { attachIcons } from './icons.js';
import { createSpellSystem, SLOTS, CIRCLE_UNLOCK, xpForLevel } from './system.js';
import { SCHOOL } from './fx.js';

export const SCHOOLS = ['fire', 'storm', 'earth', 'decay', 'void', 'life'];
export const SCHOOL_COLORS = SCHOOL;

export const SPELLS = attachIcons([
  ...FIRE_SPELLS,
  ...STORM_SPELLS,
  ...EARTH_SPELLS,
  ...DECAY_SPELLS,
  ...VOID_SPELLS,
  ...LIFE_SPELLS,
]);

const byId = new Map();
for (const s of SPELLS) byId.set(s.id, s);

SPELLS.byId = byId;
SPELLS.get = (id) => byId.get(id);
SPELLS.ofSchool = (school) => SPELLS.filter((s) => s.school === school);
SPELLS.schools = SCHOOLS;
SPELLS.colors = SCHOOL;
SPELLS.SLOTS = SLOTS;
SPELLS.CIRCLE_UNLOCK = CIRCLE_UNLOCK;
SPELLS.xpForLevel = xpForLevel;
SPELLS.system = null;

/** Idempotent. Safe to call from anywhere; the first caller wins. */
SPELLS.createSystem = function (ctx, opts) {
  if (SPELLS.system) return SPELLS.system;
  SPELLS.system = createSpellSystem(ctx, SPELLS, opts);
  ctx.spellSystem = SPELLS.system;
  return SPELLS.system;
};

export { createSpellSystem };

// Boot against the live game if there is one. A test harness that wants its own
// ctx simply imports this file before main.js publishes, then calls createSystem.
if (typeof window !== 'undefined' && window.__sunderfall && window.__sunderfall.bus) {
  try {
    SPELLS.createSystem(window.__sunderfall);
  } catch (e) {
    console.error('[spells] boot failed', e);
  }
}
