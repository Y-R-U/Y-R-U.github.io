// Compound features (D15). Display names are placeholders until docs/DESIGN.md fixes them; the integrator can
// override any of them via createHubScene(engine, {names: {story: '...'}}).
export const FEATURES = [
  { id: 'story',    name: 'OPERATIONS', sub: 'Story missions', color: '#38e8ff', unlockHint: '' },
  { id: 'arena',    name: 'ARENA',      sub: 'Vector Protocol league', color: '#ff4fd8', unlockHint: 'Clear mission 2-4' },
  { id: 'events',   name: 'SPECIAL OPS', sub: 'Rotating events', color: '#ffb547', unlockHint: 'Clear mission 2-10' },
  { id: 'squad',    name: 'BARRACKS',   sub: 'Squad & formation', color: '#5cf2a6', unlockHint: '' },
  { id: 'workshop', name: 'WORKSHOP',   sub: 'Buffs & fabrication', color: '#ffd34d', unlockHint: 'Clear mission 2-3' },
  { id: 'recruit',  name: 'RECRUITMENT', sub: 'Hire new units', color: '#a77bff', unlockHint: 'Clear mission 1-4' },
  { id: 'hq',       name: 'HQ',         sub: 'Company skills', color: '#4f9dff', unlockHint: 'Clear mission 1-12' },
];
export const FEATURE_IDS = FEATURES.map((f) => f.id);

// Growth stages: 0 = cramped hangar + scrap yard, 1 = expanded yard, 2 = arena dome + tower, 3 = flagship compound.
export const STAGE_LEVELS = [1, 5, 12, 20];
export function stageForLevel(level = 1) {
  let s = 0;
  for (let i = 0; i < STAGE_LEVELS.length; i++) if (level >= STAGE_LEVELS[i]) s = i;
  return s;
}

// hub feature -> unlock key in DATA.features (js/data/maps.js FEATURE_UNLOCKS: levelId -> [keys])
export const UNLOCK_KEYS = { workshop: 'buffs', recruit: 'recruit_street', hq: 'hq', arena: 'arena', events: 'daily_ops' };
export function hintsFromFeatures(table = {}) {
  const out = {};
  for (const [levelId, keys] of Object.entries(table)) {
    const m = /^m(\d+)_l(\d+)$/.exec(levelId);
    for (const [fid, key] of Object.entries(UNLOCK_KEYS)) if (keys.includes(key)) out[fid] = m ? `Clear mission ${m[1]}-${m[2]}` : 'Clear ' + levelId;
  }
  return out;
}
