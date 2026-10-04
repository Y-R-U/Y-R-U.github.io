// CLUED geo pipeline: Natural Earth -> data/geo/*.json. Run: node tools/m_build.mjs [--fetch]
// Sources are cached in tools/m_cache/src (gitignored). mapshaper lives in tools/m_cache/node_modules.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, STATE_VIEWS } from '../js/geo/regions.js';
import { UN_MEMBERS, EXTRA_STATES, NAME_FIX, ALT_NAMES, CONTINENT_FIX, MULTI_CONTINENT, ID_FIX, MERGE_INTO, DROP_A3, NONPLAY_A3, STATE_RULES, MARINE_PARENT } from './m_tables.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools/m_cache');
const SRC = join(CACHE, 'src');
const TMP = join(CACHE, 'tmp');
const OUT = join(ROOT, 'data/geo');
const MS = join(CACHE, 'node_modules/.bin/mapshaper');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = ['ne_10m_admin_0_countries_lakes', 'ne_10m_admin_1_states_provinces_lakes', 'ne_10m_populated_places', 'ne_10m_geography_marine_polys'];

mkdirSync(SRC, { recursive: true }); mkdirSync(TMP, { recursive: true }); mkdirSync(join(OUT, 'states'), { recursive: true }); mkdirSync(join(OUT, 'regions'), { recursive: true });

async function fetchSources() {
  for (const f of FILES) {
    const p = join(SRC, f + '.geojson');
    if (existsSync(p) && !process.argv.includes('--fetch')) continue;
    console.log('fetch', f);
    const r = await fetch(NE + f + '.geojson');
    if (!r.ok) throw new Error(r.status + ' ' + f);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
}

const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p, o) => writeFileSync(p, JSON.stringify(o));
const ms = (...args) => execFileSync(MS, [...args.flat(), '-quiet'], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 30 });
const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;

// ---------- geometry helpers ----------
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function ringArea(ring) { // spherical excess approximation, km^2
  const R = 6371.0088; let s = 0;
  for (let i = 0, n = ring.length; i < n - 1; i++) {
    const [l1, p1] = ring[i], [l2, p2] = ring[i + 1];
    s += (l2 - l1) * Math.PI / 180 * (2 + Math.sin(p1 * Math.PI / 180) + Math.sin(p2 * Math.PI / 180));
  }
  return Math.abs(s * R * R / 2);
}
const polyArea = p => Math.max(0, ringArea(p[0]) - p.slice(1).reduce((s, r) => s + ringArea(r), 0));
function bboxOf(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [r2(w), r2(s), r2(e), r2(n)];
}
// bbox of the parts that matter (>= 15% of the largest part), so far islands don't stretch fly-to.
function mainBbox(polys) {
  const areas = polys.map(polyArea); const max = Math.max(...areas);
  return bboxOf(polys.filter((p, i) => areas[i] >= max * 0.15));
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolys = (x, y, polys) => polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
function hav(a, b) {
  const R = 6371, t = Math.PI / 180, dLa = (b[1] - a[1]) * t, dLo = (b[0] - a[0]) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Pole of inaccessibility-lite: centroid of the largest part if it is inside, else the best grid sample.
function labelPoint(polys) {
  const big = polys.map(p => [polyArea(p), p]).sort((a, b) => b[0] - a[0])[0]?.[1];
  if (!big) return null;
  const [w, s, e, n] = bboxOf([big]);
  let best = null, bestD = -1;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const x = w + (e - w) * i / 12, y = s + (n - s) * j / 12;
    if (!inPolys(x, y, [big])) continue;
    let d = Infinity;
    for (const [px, py] of big[0]) d = Math.min(d, (px - x) ** 2 + (py - y) ** 2);
    if (d > bestD) { bestD = d; best = [r3(x), r3(y)]; }
  }
  return best || [r3(big[0][0][0]), r3(big[0][0][1])];
}

// Shared-arc adjacency from a TopoJSON object.
function topoNeighbours(topo, objName) {
  const geoms = topo.objects[objName].geometries;
  const arcOwners = new Map();
  geoms.forEach((g, gi) => {
    const rings = g.type === 'Polygon' ? g.arcs : g.type === 'MultiPolygon' ? g.arcs.flat() : [];
    for (const ring of rings) for (const a of ring) {
      const k = a < 0 ? ~a : a;
      if (!arcOwners.has(k)) arcOwners.set(k, new Set());
      arcOwners.get(k).add(gi);
    }
  });
  const nb = geoms.map(() => new Set());
  for (const owners of arcOwners.values()) if (owners.size > 1) for (const a of owners) for (const b of owners) if (a !== b) nb[a].add(b);
  return geoms.map((g, i) => [...nb[i]].map(j => geoms[j].properties.id));
}

// ---------- countries ----------
function countryId(p) {
  if (MERGE_INTO[p.ADM0_A3]) return MERGE_INTO[p.ADM0_A3];
  if (ID_FIX[p.ADM0_A3]) return ID_FIX[p.ADM0_A3];
  if (p.ISO_A3_EH && p.ISO_A3_EH !== '-99') return p.ISO_A3_EH;
  return p.ADM0_A3;
}

function prepCountries() {
  const src = readJSON(join(SRC, 'ne_10m_admin_0_countries_lakes.geojson'));
  const meta = {};
  const feats = [];
  const CONT = { Africa: 'AF', Asia: 'AS', Europe: 'EU', 'North America': 'NA', 'South America': 'SA', Oceania: 'OC', Antarctica: 'AN' };
  for (const f of src.features) {
    const p = f.properties;
    if (DROP_A3.includes(p.ADM0_A3)) continue;
    const id = countryId(p);
    feats.push({ type: 'Feature', properties: { id }, geometry: f.geometry });
    if (MERGE_INTO[p.ADM0_A3]) continue;
    if (meta[id]) throw new Error('duplicate country id ' + id + ' from ' + p.ADM0_A3);
    const kind = NONPLAY_A3.includes(p.ADM0_A3) || id === 'ATA' ? 'x' : UN_MEMBERS.includes(id) ? 's' : EXTRA_STATES.includes(id) ? 'p' : 't';
    meta[id] = {
      src: p.ADM0_A3, n: NAME_FIX[id] || p.NAME_EN || p.NAME, k: kind, c: CONTINENT_FIX[id] || CONT[p.CONTINENT], pop: p.POP_EST,
      q: p.WIKIDATAID, lpNE: [r3(p.LABEL_X), r3(p.LABEL_Y)],
    };
    if (MULTI_CONTINENT[id]) meta[id].cs = MULTI_CONTINENT[id];
    if (ALT_NAMES[id]) meta[id].alt = ALT_NAMES[id];
  }
  writeJSON(join(TMP, 'a0.geojson'), { type: 'FeatureCollection', features: feats });
  // dissolve merged pieces (Somaliland -> SOM etc.), keep topology for adjacency
  ms(join(TMP, 'a0.geojson'), '-dissolve', 'id', '-o', join(TMP, 'a0d.geojson'), 'format=geojson');
  ms(join(TMP, 'a0d.geojson'), '-simplify', 'interval=300', 'keep-shapes', '-o', join(TMP, 'a0topo.json'), 'format=topojson', 'no-quantization');
  const topo = readJSON(join(TMP, 'a0topo.json'));
  const objName = Object.keys(topo.objects)[0];
  const nbs = topoNeighbours(topo, objName);
  const geoms = topo.objects[objName].geometries;
  const full = readJSON(join(TMP, 'a0d.geojson'));
  const byId = Object.fromEntries(full.features.map(f => [f.properties.id, f]));
  geoms.forEach((g, i) => {
    const m = meta[g.properties.id]; if (!m) return;
    m.nb = nbs[i].filter(x => meta[x] && meta[x].k !== 'x').sort();
  });
  for (const [id, m] of Object.entries(meta)) {
    const polys = polysOf(byId[id]?.geometry);
    m.a = Math.round(polys.reduce((s, p) => s + polyArea(p), 0));
    m.bb = bboxOf(polys);
    m.mb = mainBbox(polys);
    m.lp = inPolys(...m.lpNE, polys) ? m.lpNE : labelPoint(polys) || m.lpNE;
    delete m.lpNE;
    m.nb ||= [];
  }
  return meta;
}

function difficultyOf(m) {
  if (m.k === 'x') return 3;
  if (m.a > 900000 || m.pop > 60e6) return 1;
  if (m.a < 20000 || (m.pop < 1.5e6 && m.a < 120000)) return 3;
  return 2;
}

// ---------- world + region files ----------
function buildWorld(meta) {
  const a0d = join(TMP, 'a0d.geojson');
  const out = join(OUT, 'world.json');
  ms(a0d, '-filter-islands', 'min-area=60km2', '-simplify', 'interval=9000', 'keep-shapes',
    '-filter-slivers', 'min-area=30km2', '-rename-layers', 'countries', '-o', out, 'format=topojson', 'quantization=20000');
  return out;
}

const lonIn = (lon, w, e) => { while (lon < w) lon += 360; return lon <= e; };
function bboxHits(bb, frame, pad) {
  const [w, s, e, n] = [frame[0] - pad, frame[1] - pad, frame[2] + pad, frame[3] + pad];
  if (bb[3] < s || bb[1] > n) return false;
  if (bb[2] - bb[0] > 300) return true;
  return lonIn(bb[0], w, e) || lonIn(bb[2], w, e) || (bb[0] <= w && bb[2] >= e) || lonIn(bb[0] + (bb[2] - bb[0]) / 2, w, e);
}

function buildRegions(meta) {
  const a0d = join(TMP, 'a0d.geojson');
  const sizes = {};
  for (const [key, r] of Object.entries(REGIONS)) {
    if (!r.file) continue;
    const span = Math.max(r.frame[2] - r.frame[0], r.frame[3] - r.frame[1]);
    const ids = Object.entries(meta).filter(([id, m]) => id !== 'ATA' && bboxHits(m.bb, r.frame, span * 0.6)).map(([id]) => id);
    const interval = Math.round(span * 60); // metres; Europe ~4 km, Caribbean ~1.6 km
    const ids2 = JSON.stringify(ids);
    const out = join(OUT, 'regions', r.file + '.json');
    const pd = span * 0.5, pv = span * 0.9, f = r.frame;
    const clip = f[2] <= 180 ? ['-clip', `bbox=${[Math.max(-180, f[0] - pd), Math.max(-89, f[1] - pv), Math.min(180, f[2] + pd), Math.min(89, f[3] + pv)].join(',')}`] : [];
    ms(a0d, '-filter', `${ids2}.includes(id)`, ...clip, '-filter-islands', `min-area=${Math.max(2, Math.round(span / 6))}km2`,
      '-simplify', `interval=${interval}`, 'keep-shapes', '-rename-layers', 'countries', '-o', out, 'format=topojson', 'quantization=60000');
    sizes[key] = statSync(out).size;
  }
  return sizes;
}

// ---------- states ----------
function buildStates(meta) {
  const src = readJSON(join(SRC, 'ne_10m_admin_1_states_provinces_lakes.geojson'));
  const out = {};
  for (const iso of Object.keys(STATE_VIEWS)) {
    const rule = STATE_RULES[iso] || {};
    const feats = [];
    for (const f of src.features) {
      const p = f.properties;
      if (p.adm0_a3 !== iso || !p.name || !f.geometry) continue;
      if (rule.drop?.includes(p.name) || rule.dropCode?.includes(p.iso_3166_2)) continue;
      let id = /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(p.iso_3166_2 || '') ? p.iso_3166_2 : p.adm1_code, name = p.name_en || p.name;
      if (rule.groupBy) {
        const key = p[rule.groupBy];
        const g = rule.groups[key];
        if (!g) continue;
        [id, name] = g;
      }
      if (rule.mergeInto?.[p.name]) { id = rule.mergeInto[p.name]; name = '~merged'; }
      if (rule.rename?.[id]) name = rule.rename[id];
      if (rule.strip) name = name.replace(rule.strip, '');
      feats.push({ type: 'Feature', properties: { id, name, type: p.type_en || '' }, geometry: f.geometry });
    }
    feats.sort((a, b) => (a.properties.name === '~merged') - (b.properties.name === '~merged'));
    const tmp = join(TMP, `s_${iso}.geojson`);
    writeJSON(tmp, { type: 'FeatureCollection', features: feats });
    const dis = join(TMP, `s_${iso}_d.geojson`);
    ms(tmp, '-dissolve', 'id', 'copy-fields=name,type', '-o', dis, 'format=geojson');
    const d = readJSON(dis);
    const view = STATE_VIEWS[iso];
    const fr = view.frame || meta[iso].mb;
    const span = Math.max(fr[2] - fr[0], (fr[3] - fr[1]));
    const interval = Math.max(150, Math.round(span * 75));
    const states = d.features.map(f => {
      const polys = polysOf(f.geometry);
      return { id: f.properties.id, n: f.properties.name, t: f.properties.type, a: Math.round(polys.reduce((s, p) => s + polyArea(p), 0)), bb: bboxOf(polys), mb: mainBbox(polys), lp: labelPoint(polys), polys };
    });
    // context: neighbouring countries for the backdrop
    const pad = span * 0.6;
    const ctxIds = Object.entries(meta).filter(([id, m]) => id !== iso && id !== 'ATA' && bboxHits(m.bb, fr, pad)).map(([id]) => id);
    const ctxPath = join(TMP, `s_${iso}_ctx.geojson`);
    ms(join(TMP, 'a0d.geojson'), '-filter', `${JSON.stringify(ctxIds)}.includes(id)`, '-clip', `bbox=${[fr[0] - pad, Math.max(-89, fr[1] - pad), fr[2] + pad, Math.min(89, fr[3] + pad)].join(',')}`,
      '-o', ctxPath, 'format=geojson');
    const file = join(OUT, 'states', iso + '.json');
    const stripped = join(TMP, `s_${iso}_s.geojson`);
    writeJSON(stripped, { type: 'FeatureCollection', features: d.features.map(f => { const st = states.find(x => x.id === f.properties.id); return { type: 'Feature', properties: { id: st.id, n: st.n, lp: st.lp, mb: st.mb }, geometry: f.geometry }; }) });
    ms('-i', stripped, ctxPath, 'combine-files', '-rename-layers', 'states,context', '-filter-islands', `min-area=${Math.max(0.5, span / 8)}km2`, 'target=*',
      '-simplify', `interval=${interval}`, 'keep-shapes', 'target=*', '-o', file, 'format=topojson', 'quantization=40000', 'target=*');
    out[iso] = states;
  }
  return out;
}

// ---------- cities ----------
function buildCities(meta, statesByIso) {
  const src = readJSON(join(SRC, 'ne_10m_populated_places.geojson'));
  const countryCities = {}; const stateCities = {};
  const a0 = readJSON(join(TMP, 'a0d.geojson'));
  const polysById = Object.fromEntries(a0.features.map(f => [f.properties.id, polysOf(f.geometry)]));
  const all = src.features.map(f => f.properties).filter(p => p.POP_MAX > 0 && p.NAME)
    .sort((a, b) => b.POP_MAX - a.POP_MAX);
  for (const p of all) {
    const lon = r3(p.LONGITUDE), lat = r3(p.LATITUDE);
    // assign by geometry, not by the ADM0_A3 tag (which follows sovereignty, e.g. Greenland towns tagged DNK)
    let iso = p.ADM0_A3 === 'SOL' ? 'SOM' : p.ADM0_A3;
    if (!polysById[iso] || !inPolys(lon, lat, polysById[iso])) {
      const hit = Object.keys(meta).find(id => { const b = meta[id].bb; return lon >= b[0] - 0.1 && lon <= b[2] + 0.1 && lat >= b[1] - 0.1 && lat <= b[3] + 0.1 && inPolys(lon, lat, polysById[id] || []); });
      if (hit) iso = hit; else if (!meta[iso]) continue;
    }
    const c = { n: p.NAME, lon, lat, pop: p.POP_MAX, r: p.SCALERANK };
    if (p.ADM0CAP === 1) c.cap = 1;
    const list = (countryCities[iso] ||= []);
    if (list.length >= 25) continue;
    if (list.some(o => o.n === c.n || hav([o.lon, o.lat], [lon, lat]) < 8)) continue;
    const st = statesByIso[iso]?.find(s => lon >= s.bb[0] && lon <= s.bb[2] && lat >= s.bb[1] && lat <= s.bb[3] && inPolys(lon, lat, s.polys));
    if (st) c.s = st.id;
    list.push(c);
  }
  // per-state lists (deeper than the country top 25)
  for (const [iso, states] of Object.entries(statesByIso)) {
    for (const p of all) {
      if (p.ADM0_A3 !== iso) continue;
      const lon = r3(p.LONGITUDE), lat = r3(p.LATITUDE);
      const st = states.find(s => lon >= s.bb[0] && lon <= s.bb[2] && lat >= s.bb[1] && lat <= s.bb[3] && inPolys(lon, lat, s.polys));
      if (!st) continue;
      const list = (stateCities[st.id] ||= []);
      if (list.length >= 12 || list.some(o => o.n === p.NAME || hav([o.lon, o.lat], [lon, lat]) < 5)) continue;
      const c = { n: p.NAME, lon, lat, pop: p.POP_MAX, r: p.SCALERANK };
      if (p.ADM0CAP === 1) c.cap = 1;
      list.push(c);
    }
  }
  return { countryCities, stateCities };
}

// ---------- marine ----------
function buildMarine() {
  const src = readJSON(join(SRC, 'ne_10m_geography_marine_polys.geojson'));
  const keep = ['ocean', 'sea', 'gulf', 'bay', 'strait', 'channel', 'sound'];
  const title = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
  const info = {};
  const feats = [];
  for (const f of src.features) {
    const p = f.properties;
    if (!keep.includes(p.featurecla) || !p.name || !f.geometry) continue;
    if (p.scalerank > 5) continue;
    const name = title(p.name_en || p.name).replace(/\s+/g, ' ').trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!info[id]) {
      const polys = polysOf(f.geometry);
      info[id] = { n: name, k: p.featurecla, r: p.scalerank };
      const grp = name.match(/^(North|South) (Atlantic|Pacific) Ocean$/);
      if (grp) info[id].g = grp[2].toLowerCase() + '-ocean';
      if (MARINE_PARENT[name]) info[id].p = MARINE_PARENT[name];
      info[id]._polys = polys;
    } else info[id]._polys.push(...polysOf(f.geometry));
    feats.push({ type: 'Feature', properties: { id }, geometry: f.geometry });
  }
  for (const m of Object.values(info)) {
    m.a = Math.round(m._polys.reduce((s, p) => s + polyArea(p), 0));
    m.bb = bboxOf(m._polys); m.mb = mainBbox(m._polys); m.lp = labelPoint(m._polys);
    delete m._polys;
  }
  const tmp = join(TMP, 'marine.geojson');
  writeJSON(tmp, { type: 'FeatureCollection', features: feats });
  const out = join(OUT, 'marine.json');
  ms(tmp, '-dissolve', 'id', '-simplify', 'interval=12000', 'keep-shapes', '-rename-layers', 'marine', '-o', out, 'format=topojson', 'quantization=20000');
  return info;
}

// ---------- main ----------
await fetchSources();
console.log('countries…');
const meta = prepCountries();
for (const m of Object.values(meta)) m.d = difficultyOf(m);
const worldPath = buildWorld(meta);
console.log('regions…');
const regionSizes = buildRegions(meta);
console.log('states…');
const statesByIso = buildStates(meta);
console.log('cities…');
const { countryCities, stateCities } = buildCities(meta, statesByIso);
console.log('marine…');
const marine = buildMarine();

const countries = {};
for (const [id, m] of Object.entries(meta).sort()) {
  const { src: _s, ...rest } = m;
  if (STATE_VIEWS[id]) rest.st = 1;
  countries[id] = rest;
}
writeJSON(join(OUT, 'countries.json'), countries);
const pack = c => { const a = [c.n, c.lon, c.lat, +c.pop.toPrecision(3), c.r]; if (c.cap || c.s) a.push(c.cap ? 1 : 0); if (c.s) a.push(c.s); return a; };
const citiesOut = { c: {}, s: {} };
for (const [iso, l] of Object.entries(countryCities)) citiesOut.c[iso] = l.slice(0, 16).map(pack);
for (const [sid, l] of Object.entries(stateCities)) citiesOut.s[sid] = l.slice(0, 8).map(pack);
writeJSON(join(OUT, 'cities.json'), citiesOut);
const states = {};
for (const [iso, list] of Object.entries(statesByIso)) {
  states[iso] = { l: STATE_VIEWS[iso].label, s: Object.fromEntries(list.map(s => [s.id, { n: s.n, a: s.a }])) };
}
writeJSON(join(OUT, 'states.json'), states);
writeJSON(join(OUT, 'marine-info.json'), marine);
rmSync(join(TMP, 'a0topo.json'), { force: true });

const kb = p => (statSync(p).size / 1024).toFixed(0) + ' KB';
console.log('world', kb(worldPath), '| countries.json', kb(join(OUT, 'countries.json')), '| cities', kb(join(OUT, 'cities.json')),
  '| states.json', kb(join(OUT, 'states.json')), '| marine', kb(join(OUT, 'marine.json')), '| marine-info', kb(join(OUT, 'marine-info.json')));
console.log('regions', Object.fromEntries(Object.entries(regionSizes).map(([k, v]) => [k, (v / 1024).toFixed(0) + ' KB'])));
console.log('states', Object.fromEntries(Object.keys(STATE_VIEWS).map(k => [k, kb(join(OUT, 'states', k + '.json'))])));
