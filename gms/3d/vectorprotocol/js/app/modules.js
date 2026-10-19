// Integration points owned by other agents. D19: a module is only imported once it exists, so each
// entry is switched on here (by the ui agent) when its owner's notes say it has landed.
// Every load is a dynamic import in try/catch: a broken module degrades to the ui stub, never a dead boot.
const AVAILABLE = {
  engine: '../engine/engine.js',        // battle agent: createEngine
  units: '../actors/units.js',          // robots agent: createUnit, MODELS, renderPortrait, createTurntable
  fixture: '../sim/fixture_data.js',    // sim agent: example DATA
  data: '../data/index.js',             // design agent: DATA
  game_state: '../sim/game_state.js',   // sim agent: createGame facade
  progression: '../sim/progression.js', // sim agent: cost helpers
  sim_battle: '../sim/battle.js',       // sim agent: createBattle stepper (pure)
  stats: '../sim/stats.js',             // sim agent: unitPower, activeSynergies
  battle: '../battle/battle.js',        // battle agent: createBattleScene
  hub: '../hub/hub.js',                 // hub agent: createHubScene
  map: '../map/story_map.js',           // hub agent: createStoryMap
  audio: '../audio/audio.js',           // audio agent: route music, UI sounds, forBattle
};

const cache = new Map();
export const loaded = {};

export async function load(key) {
  if (cache.has(key)) return cache.get(key);
  const path = AVAILABLE[key];
  const p = path ? import(path).then((m) => { loaded[key] = true; return m; }).catch((e) => {
    console.warn('[modules] ' + key + ' unavailable, using stub:', e.message);
    loaded[key] = false; return null;
  }) : Promise.resolve(null);
  if (!path) loaded[key] = false;
  cache.set(key, p);
  return p;
}

export const status = () => Object.fromEntries(Object.keys(AVAILABLE).map((k) => [k, loaded[k] ?? (AVAILABLE[k] ? 'pending' : 'stub')]));
