// Puzzle data loading: a small index (ids + ratings per region) up front, region chunks lazily.
const BASE = new URL('../../assets/puzzles/', import.meta.url).href;
const V = '2';   // bump when the shipped chunks change (cache-buster)

let indexP = null;
const chunks = new Map();

async function getJson(url) {
  const r = await fetch(url, { cache: 'default' });
  if (!r.ok) throw new Error(`puzzles: ${r.status} for ${url}`);
  return r.json();
}

/** -> {regions:[{id, nodes:[[id, rating, classic]]}], attribution} */
export function loadIndex() {
  if (!indexP) indexP = getJson(`${BASE}index.json?v=${V}`).catch(e => { indexP = null; throw e; });
  return indexP;
}

/** -> Map(id -> puzzle) for one region (cached). */
export function loadRegion(regionId) {
  if (!chunks.has(regionId)) {
    const p = getJson(`${BASE}${regionId}.json?v=${V}`)
      .then(list => new Map(list.map(x => [x.id, x])))
      .catch(e => { chunks.delete(regionId); throw e; });
    chunks.set(regionId, p);
  }
  return chunks.get(regionId);
}

export async function regionOf(id) {
  const idx = await loadIndex();
  for (const r of idx.regions) if (r.nodes.some(n => n[0] === id)) return r.id;
  return null;
}

export async function getPuzzle(id) {
  const reg = await regionOf(id);
  if (!reg) return null;
  const m = await loadRegion(reg);
  const p = m.get(id);
  return p ? { ...p, region: reg } : null;
}
