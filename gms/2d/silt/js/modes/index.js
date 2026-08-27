import { DEFAULT_CFG } from '../sim/world.js';
import flow from './flow.js';
import tide from './tide.js';
import jelly from './jelly.js';
import hourglass from './hourglass.js';
import alchemy from './alchemy.js';
import zen from './zen.js';
import { safeApi } from './api.js';
import { DEFAULT_BIOME, getBiome } from '../data/biomes.js';

export { safeApi } from './api.js';
export { chainPoints, makeScorer } from './score.js';

export const MODES = [flow, tide, jelly, hourglass, alchemy, zen];
export const MODE_IDS = MODES.map((m) => m.id);
export const byId = (id) => MODES.find((m) => m.id === id) || flow;

/**
 * The world config a mode wants, merged over the sim defaults.
 * `opts` reaches modes that vary by option — ALCHEMY levels are the only one.
 */
export function configFor(modeId, opts = {}) {
  const m = byId(modeId);
  const own = typeof m.worldCfgFor === 'function' ? m.worldCfgFor(opts) : m.worldCfg;
  return { ...DEFAULT_CFG, ...own, ...(opts.cfg || {}) };
}

export function biomeFor(modeId) {
  return getBiome(byId(modeId).biome || DEFAULT_BIOME);
}

/**
 * The reference host loop, so the game, the attract screen and the headless
 * tools all drive modes identically.
 *
 *   bot/input -> world.tick() -> onChain (if a chain fired) -> onTick
 *
 * onTick runs LAST, which is what lets score.js diff the score across a tick
 * boundary without knowing the engine's award formula.
 */
export function stepMode(mode, world, api, chainsBefore) {
  const before = chainsBefore === undefined ? world.chains : chainsBefore;
  if (world.chains > before && mode.onChain) {
    mode.onChain(world, api, world.clears.lastChain);
  }
  if (mode.onTick) mode.onTick(world, api);
}

export function startMode(mode, world, api) {
  const a = safeApi(api);
  if (mode.onStart) mode.onStart(world, a);
  return a;
}

export default MODES;
