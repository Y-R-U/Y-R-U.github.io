// Geo data loaders (cached). Everything lives under data/geo/ (built by tools/m_build.mjs).
import { REGIONS } from './regions.js?v=202610071438';

const base = new URL('../../data/geo/', import.meta.url);
const cache = new Map();
const G = { countries: null, states: null, cities: null, marine: null };

function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(new URL(path, base), { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.json();
    }).catch(e => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

export async function loadIndex() {
  if (G.countries) return G;
  const [c, s] = await Promise.all([getJSON('countries.json'), getJSON('states.json')]);
  G.countries = c; G.states = s;
  return G;
}

const unpackCity = ([n, lon, lat, pop, r, cap, s]) => ({ n, lon, lat, pop, r, cap: !!cap, s: s || null });
export async function loadCities() {
  if (G.cities) return G.cities;
  const raw = await getJSON('cities.json');
  const out = { c: {}, s: {} };
  for (const [k, l] of Object.entries(raw.c)) out.c[k] = l.map(unpackCity);
  for (const [k, l] of Object.entries(raw.s)) out.s[k] = l.map(unpackCity);
  return (G.cities = out);
}

export async function loadMarine() {
  if (G.marine) return G.marine;
  const [topo, info] = await Promise.all([getJSON('marine.json'), getJSON('marine-info.json')]);
  return (G.marine = { topo, info });
}

export const loadWorld = () => getJSON('world.json');
export const loadRegionFile = file => getJSON(`regions/${file}.json`);
export const loadStatesFile = iso => getJSON(`states/${iso}.json`);

// Sync accessors: valid after loadIndex()/loadCities()/loadMarine() resolved.
export const geo = G;
export const country = id => G.countries?.[id] || null;
export const countryName = id => G.countries?.[id]?.n || id;
export const stateInfo = (iso, sid) => G.states?.[iso]?.s?.[sid] || null;

// Which countries count as answers. 'states' = UN members + observers + Kosovo/Taiwan/W. Sahara; 'un'; 'all' adds territories.
export function isPlayable(id, set = 'states') {
  const c = G.countries?.[id];
  if (!c || c.k === 'x') return false;
  if (set === 'un') return c.k === 's';
  if (set === 'all') return true;
  return c.k === 's' || c.k === 'p';
}

export function countryIds({ set = 'states', continent = null, ids = null } = {}) {
  return Object.keys(G.countries || {}).filter(id => isPlayable(id, set)
    && (!continent || G.countries[id].c === continent || G.countries[id].cs?.includes(continent))
    && (!ids || ids.includes(id)));
}

// Countries a region view asks about (null = every playable country).
export function regionMembers(key, set = 'states') {
  const m = REGIONS[key]?.members;
  if (!m) return null;
  if (m.ids) return m.ids.filter(id => isPlayable(id, set));
  return countryIds({ set }).filter(id => G.countries[id].c === m.continent || m.extra?.includes(id));
}
