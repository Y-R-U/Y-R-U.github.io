// Visual themes for story maps. A MapDef picks one with `theme` (falls back by realm/order).
// realm 'scifi' = neon hex nodes on a light-rail road; 'fantasy' = stone medallions on a cobbled road;
// 'rift' = fantasy road with violet sci-fi energy (the crossover maps, D21).
export const THEMES = {
  docks:   { realm: 'scifi',   accent: '#38e8ff', warm: '#ff9a3a', bg: ['#04101c', '#0b2a3a', '#06121e'], name: 'Harbor' },
  slums:   { realm: 'scifi',   accent: '#ff4fd8', warm: '#38e8ff', bg: ['#0c0418', '#2a0c3a', '#0a0614'], name: 'Undercity' },
  spires:  { realm: 'scifi',   accent: '#4fb8ff', warm: '#dff6ff', bg: ['#030a1c', '#0c2450', '#050a18'], name: 'Spires' },
  wastes:  { realm: 'scifi',   accent: '#ffb547', warm: '#ff5a3a', bg: ['#1a0a10', '#4a1e22', '#120808'], name: 'Badlands' },
  skyport: { realm: 'scifi',   accent: '#5cf2ff', warm: '#a77bff', bg: ['#02061a', '#101c48', '#030614'], name: 'Skyport' },
  lab:     { realm: 'scifi',   accent: '#b07bff', warm: '#38e8ff', bg: ['#0a0418', '#24104a', '#08041a'], name: 'Lab' },
  league:  { realm: 'scifi',   accent: '#38e8ff', warm: '#b07bff', bg: ['#040a20', '#10204a', '#050818'], name: 'League' },
  spirewar:{ realm: 'scifi',   accent: '#38e8ff', warm: '#ff4a3a', bg: ['#0a0812', '#2a1420', '#08060c'], name: 'Halcyon Reach' },
  core:    { realm: 'scifi',   accent: '#ffc23a', warm: '#a855f7', bg: ['#05030a', '#1a1030', '#05030a'], name: 'Protocol' },
  rift:    { realm: 'rift',    accent: '#c07bff', warm: '#7dff9a', bg: ['#080414', '#1c1438', '#06100c'], name: 'Rift' },
  forest:  { realm: 'fantasy', accent: '#ffd36a', warm: '#9dff7a', bg: ['#050c08', '#13281a', '#060a06'], name: 'Verdance' },
  citadel: { realm: 'fantasy', accent: '#ffc35a', warm: '#ff7a3a', bg: ['#06080e', '#1a2232', '#0a0a0e'], name: 'Citadel' },
};
const ORDER = ['docks', 'slums', 'league', 'skyport', 'lab', 'forest', 'spirewar', 'core'];
// design's map ids (js/data/maps.js) -> theme
const BY_MAP = { m1: 'docks', m2: 'slums', m3: 'league', m4: 'skyport', m5: 'lab', m6: 'forest', m7: 'spirewar', m8: 'core' };

export function themeFor(map, index = 0) {
  if (BY_MAP[map?.id]) return { id: BY_MAP[map.id], ...THEMES[BY_MAP[map.id]] };
  const key = typeof map?.theme === 'string' ? map.theme : map?.theme?.id;
  if (key && THEMES[key]) return { id: key, ...THEMES[key] };
  if (map?.realm === 'fantasy') return { id: 'forest', ...THEMES.forest };
  const id = ORDER[index % ORDER.length];
  return { id, ...THEMES[id] };
}

export function backdropUrl(map, theme) {
  if (map?.backdrop) return new URL('../../' + map.backdrop.replace(/^\.?\//, ''), import.meta.url).href;
  return new URL('../../assets/maps/' + (map?.id || theme.id) + '.jpg', import.meta.url).href;
}

// small version for the chapter list (only for our own generated backdrops)
export function thumbUrl(map, theme) {
  const full = backdropUrl(map, theme);
  return /assets\/maps\/m\d+\.jpg$/.test(full) ? full.replace(/\.jpg$/, '_thumb.jpg') : full;
}
