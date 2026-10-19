// DATA entry point (js/sim/SCHEMA.md). Pure ES modules, no three.js, no DOM.
import { RULES } from './rules.js';
import { ABILITIES } from './abilities.js';
import { UNITS, LAUNCH_SET, STARTERS } from './units.js';
import { ENEMIES, RIFT_RECRUITS } from './enemies.js';
import { SYNERGIES } from './synergies.js';
import { BUFFS } from './buffs.js';
import { MAPS, FEATURE_UNLOCKS, MAP_THEMES } from './maps.js';
import { ECONOMY } from './economy.js';
import { HQ } from './hq.js';
import { RECRUIT } from './recruit.js';
import { ARENA } from './arena.js';
import { EVENTS } from './events.js';
import { SCENES, CAST } from './story.js';

export const DATA = {
  version: 1,
  rules: RULES,
  statuses: {},
  abilities: ABILITIES,
  units: { ...UNITS, ...RIFT_RECRUITS },
  enemies: ENEMIES,
  synergies: SYNERGIES,
  buffs: BUFFS,
  maps: MAPS,
  economy: ECONOMY,
  hq: HQ,
  recruit: RECRUIT,
  arena: ARENA,
  events: EVENTS,
  // design-side extras (sim ignores): UI/hub/map consumers
  story: { scenes: SCENES, cast: CAST },
  features: FEATURE_UNLOCKS,
  mapThemes: MAP_THEMES,
  launchSet: LAUNCH_SET,
  starters: STARTERS,
};
export default DATA;
