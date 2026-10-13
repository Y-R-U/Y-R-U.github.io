#!/usr/bin/env node
// Clean in-country geography for the local focus → data/local/geo.json.
//   node tools/local_geo_build.mjs          fetch (Wikipedia population tables + Wikidata state capitals), build, validate
//   node tools/local_geo_build.mjs --check  validate the committed file only (offline; tools/local_test.mjs runs this)
// Populations come from ONE Wikipedia list per country (each city is labelled with that list's definition: urban area,
// city proper…), state capitals from Wikidata P36 with the overrides below. Network fetches are not reproducible
// offline (pages change): the built file records each page's revision id.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/local/geo.json');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const STATES = J('data/geo/states.json');
const NE = J('data/geo/cities.json').c;
const UA = { 'User-Agent': 'CluedLocalBuild/1.0 (https://games.br8t.com/gms/2d/clued/)' };

// kind: how the list counts people (shown in questions). phrase: "the {name} urban area" | "the city of {name}".
const SOURCES = {
  AUS: { kind: 'urban area', phrase: 'urban', tables: [{ page: 'List of cities in Australia by population', head: /Significant\s*Urban Area/i, name: 1, state: 2, pop: 3, min: 50000, year: 2025 }] },
  USA: { kind: 'city', phrase: 'city', tables: [{ page: 'List of United States cities by population', head: /^Municipality$/, name: 0, state: 1, stateCode: s => `US-${s}`, pop: 2, min: 200000, year: 2025 }] },
  CAN: { kind: 'population centre', phrase: 'urban', tables: [{ page: 'List of the largest population centres in Canada', head: /Population centre/, name: 1, state: 2, pop: 4, min: 100000, year: 2021 }] },
  NZL: { kind: 'urban area', phrase: 'urban', tables: [{ page: 'List of New Zealand urban areas by population', head: /^Name$/, name: 1, pop: 3, min: 30000, year: 2025 }] },
  GBR: { kind: 'built-up area', phrase: 'urban', tables: [
    { page: 'List of towns and cities in England by population', head: /Built-up area/, name: 1, pop: [2, 3], min: 150000, year: 2021, fixedState: 'GB-ENG' },
    { page: 'List of towns and cities in Scotland by population', head: /^Locality$/, name: 1, pop: 2, min: 100000, year: 2020, fixedState: 'GB-SCT' },
    { page: 'List of towns and cities in Wales by population', head: /^Welsh name$/, name: 0, pop: 2, min: 100000, year: 2021, fixedState: 'GB-WLS' }] },
  IND: { kind: 'city', phrase: 'city', tables: [{ page: 'List of cities in India by population', head: /State or Union territory/, name: 0, state: 1, pop: 2, min: 1000000, year: 2011 }] },
  JPN: { kind: 'city', phrase: 'city', tables: [{ page: 'List of cities in Japan', head: /City \(Special Ward\)/, name: 0, state: 2, pop: 3, min: 350000, year: 2020 }] },
  DEU: { kind: 'city', phrase: 'city', tables: [{ page: 'List of cities in Germany by population', head: /^City$/, name: 1, state: 2, pop: 3, min: 200000, year: 2021 }] },
  FRA: { kind: 'commune (city proper)', phrase: 'city', tables: [{ page: 'List of communes in France with over 20,000 inhabitants', head: /^Commune$/, name: 0, state: 2, pop: 5, min: 130000, year: 2023 }] },
  BRA: { kind: 'municipality', phrase: 'city', tables: [{ page: 'List of cities in Brazil by population', head: /^Municipality$/, name: 0, state: 1, pop: 2, min: 500000, year: 2025 }] },
};
// Wikidata P36 is wrong or awkward for these (Tokyo's is Shinjuku); null = never ask "capital of …" for that unit.
const CAPITAL_FIX = { 'JP-13': 'Tokyo', 'US-AK': 'Juneau', 'CA-NB': 'Fredericton', 'IN-OR': 'Bhubaneswar', 'IN-KA': 'Bengaluru', 'IN-CT': 'Raipur',
  'IN-TG': 'Hyderabad', 'FR-BFC': 'Dijon', 'FR-NOR': 'Rouen', 'US-DC': null, 'GB-ENG': 'London', 'GB-SCT': 'Edinburgh', 'GB-WLS': 'Cardiff', 'GB-NIR': 'Belfast',
  'DE-BE': 'Berlin', 'DE-HH': 'Hamburg', 'DE-HB': 'Bremen', 'IN-DL': 'New Delhi', 'IN-LD': 'Kavaratti', 'IN-JK': 'Srinagar', 'IN-LA': 'Leh', 'IN-DH': 'Daman',
  'IN-AP': 'Amaravati', 'IN-PY': 'Puducherry', 'IN-CH': 'Chandigarh', 'IN-AN': 'Port Blair', 'IN-MH': 'Mumbai', 'IN-HP': 'Shimla', 'IN-UT': 'Dehradun',
  'FR-COR': 'Ajaccio', 'BR-DF': 'Brasília', 'CA-NU': 'Iqaluit', 'CA-YT': 'Whitehorse', 'CA-NT': 'Yellowknife' };
// List spellings that differ from data/geo/states.json.
const STATE_ALIAS = { bremen: 'DE-HB', 'mecklenburg vorpommern': 'DE-MV', occitania: 'FR-OCC', 'distrito federal': 'BR-DF', 'federal district': 'BR-DF' };
// Separate cities closer than 15 km to a bigger one (the suburb check would flag them).
const SEPARATE = new Set(['NZL:Porirua', 'NZL:Lower Hutt', 'NZL:Upper Hutt', 'GBR:Bradford']);
// Never cities in their own right (parts of a bigger city in these lists' terms).
const TOKYO_WARDS = 'Chiyoda Chūō Minato Shinjuku Bunkyō Taitō Sumida Kōtō Shinagawa Meguro Ōta Setagaya Shibuya Nakano Suginami Toshima Kita Arakawa Itabashi Nerima Adachi Katsushika Edogawa'.split(' ');
const NOT_A_CITY = new Set([...TOKYO_WARDS, 'Kanata', 'White Rock', 'Villeurbanne', 'Saint-Denis', 'Ambattur', 'Cranbourne', 'Clyde', 'Paradise', 'Enterprise', 'Spring Valley', 'Sunrise Manor', 'Metairie', 'East Los Angeles', 'Brooklyn', 'Queens', 'Manhattan', 'The Bronx', 'Staten Island']);

const C_NAME = { AUS: 'Australia', USA: 'United States', CAN: 'Canada', NZL: 'New Zealand', GBR: 'United Kingdom', IND: 'India', JPN: 'Japan', DEU: 'Germany', FRA: 'France', BRA: 'Brazil' };
// A cell may list two states for a cross-border urban area ("Queensland New South Wales"): the first one named wins.
function stateOf(cell, byName) {
  const n = norm(cell);
  if (byName.has(n)) return byName.get(n);
  if (STATE_ALIAS[n]) return STATE_ALIAS[n];
  let best = null, at = Infinity;
  for (const [k, code] of [...byName, ...Object.entries(STATE_ALIAS)]) { const i = ` ${n} `.indexOf(` ${k} `); if (i >= 0 && (i < at || (i === at && k.length > best[0].length))) { best = [k, code]; at = i; } }
  return best?.[1] || null;
}
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/\d{4,}/); return m ? +m[0] : null; };

async function page(title) {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  Object.entries({ action: 'parse', page: title, prop: 'text|revid', format: 'json', formatversion: '2', redirects: '1' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: UA });
  const d = await r.json();
  if (!d.parse) throw new Error(`${title}: ${JSON.stringify(d.error || d).slice(0, 200)}`);
  return { html: d.parse.text, revid: d.parse.revid, title: d.parse.title };
}
const clean = s => s.replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/g, '').replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<br\s*\/?>/g, ' ')
  .replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/[‡†*§]/g, '').replace(/\s+/g, ' ').trim();
// Rows of cells, colspan/rowspan expanded.
function tableRows(html) {
  const rows = [], carry = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const out = [];
    let col = 0;
    const take = () => { while (carry[col]?.n > 0) { out[col] = carry[col].v; carry[col].n--; col++; } };
    for (const m of tr.matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)) {
      take();
      const span = +(/colspan="?(\d+)/.exec(m[2])?.[1] || 1), rs = +(/rowspan="?(\d+)/.exec(m[2])?.[1] || 1);
      const v = clean(m[3]);
      for (let k = 0; k < span; k++) { out[col] = v; if (rs > 1) carry[col] = { v, n: rs - 1 }; col++; }
    }
    take();
    rows.push({ cells: out, head: /<th/.test(tr) && !/<td/.test(tr) });
  }
  return rows;
}

async function capitals(cc) {
  const codes = Object.keys(STATES[cc]?.s || {});
  if (!codes.length) return {};
  const q = `SELECT ?iso ?capLabel WHERE { VALUES ?iso { ${codes.map(c => `"${c}"`).join(' ')} } ?s wdt:P300 ?iso . OPTIONAL { ?s p:P36 ?st . ?st ps:P36 ?cap . FILTER NOT EXISTS { ?st pq:P582 ?end } } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const u = new URL('https://query.wikidata.org/sparql');
  u.searchParams.set('query', q);
  const r = await fetch(u, { headers: { ...UA, Accept: 'application/sparql-results+json' } });
  const d = await r.json();
  const out = {};
  for (const b of d.results.bindings) {
    const iso = b.iso.value, cap = b.capLabel?.value;
    if (cap && !/^Q\d+$/.test(cap)) (out[iso] ||= new Set()).add(cap);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

async function build() {
  const out = { v: 1, built: new Date().toISOString().slice(0, 10), note: 'Built by tools/local_geo_build.mjs; validated by --check. Do not hand-edit: change the overrides in the tool.', countries: {} };
  for (const [cc, src] of Object.entries(SOURCES)) {
    const S = STATES[cc];
    const stateByName = new Map(Object.entries(S?.s || {}).map(([k, v]) => [norm(v.n), k]));
    const sources = [], cities = [];
    for (const t of src.tables) {
      const p = await page(t.page);
      sources.push({ name: `Wikipedia: ${p.title}`, url: `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(p.title.replace(/ /g, '_'))}&oldid=${p.revid}`, year: t.year });
      const tables = p.html.match(/<table class="[^"]*wikitable[\s\S]*?<\/table>/g) || [];
      const tb = tables.find(x => tableRows(x).slice(0, 3).some(r => r.cells.some(c => t.head.test(c))));
      if (!tb) throw new Error(`${cc}: table ${t.head} not found on ${t.page}`);
      const rows = tableRows(tb).filter(r => !r.head).slice(t.skipRows || 0);
      for (const { cells } of rows) {
        let name = cells[t.name];
        if (!name) continue;
        if (cc === 'JPN') { if (/^Tokyo Ward AA/.test(name)) name = 'Tokyo'; else if (/^Tokyo Ward/.test(name)) continue; name = name.replace(/^([A-Z][a-z]+)(?=[A-Z])/, '').trim() || name; }
        name = name.replace(/\s*\(built-up area\)$/, '').replace(/\s*\(.*?\)$/, '').replace(/\s*–\s*[A-Z].*$/, '').trim();
        if (norm(name) === norm(C_NAME[cc])) continue;
        const pop = [].concat(t.pop).map(i => num(cells[i])).find(Boolean);
        if (!pop || pop < t.min || NOT_A_CITY.has(name)) continue;
        let st = t.fixedState || null;
        if (!st && t.state != null && S) st = t.stateCode ? t.stateCode(cells[t.state]) : stateOf(cells[t.state], stateByName);
        if (S && !st) { console.warn(`  ${cc}: no state for ${name} (${cells[t.state]})`); continue; }
        if (cities.some(c => norm(c.n) === norm(name))) continue;
        cities.push({ n: name, ...(st ? { st } : {}), pop, year: t.year });
      }
    }
    cities.sort((a, b) => b.pop - a.pop);
    const states = {};
    if (S) {
      const caps = await capitals(cc);
      for (const [code, info] of Object.entries(S.s)) {
        let cap = code in CAPITAL_FIX ? CAPITAL_FIX[code] : caps[code]?.length === 1 ? caps[code][0] : null;
        if (cap) cap = cap.replace(/, .*$/, '').replace(/ \(.*\)$/, '').replace(/-shi$/, '');
        states[code] = { n: info.n, capital: cap };
        if (cap == null && !(code in CAPITAL_FIX)) console.warn(`  ${cc}: ${code} ${info.n} capital unclear: ${JSON.stringify(caps[code])}`);
      }
      sources.push({ name: 'Wikidata: capital (P36) of each first-level division', url: 'https://www.wikidata.org/wiki/Property:P36' });
    }
    out.countries[cc] = { unit: S?.l || null, kind: src.kind, phrase: src.phrase, sources, states: S ? states : null, cities };
    console.log(`${cc}: ${cities.length} cities, ${Object.keys(states).length} states`);
  }
  return out;
}

/* ---------------------------------------------------------------- validation */
const AUS_SPOT = {
  capitals: { 'AU-NSW': 'Sydney', 'AU-VIC': 'Melbourne', 'AU-QLD': 'Brisbane', 'AU-WA': 'Perth', 'AU-SA': 'Adelaide', 'AU-TAS': 'Hobart', 'AU-NT': 'Darwin', 'AU-ACT': 'Canberra' },
  pop: { Sydney: [4.6e6, 6e6], Melbourne: [4.6e6, 6e6], Brisbane: [2.2e6, 2.9e6], Perth: [1.9e6, 2.5e6], Adelaide: [1.2e6, 1.5e6], 'Gold Coast': [6e5, 8.5e5],
    Canberra: [4e5, 5.6e5], Hobart: [2e5, 2.8e5], Darwin: [1.1e5, 1.7e5], Townsville: [1.6e5, 2e5], Cairns: [1.4e5, 1.8e5], Geelong: [2.4e5, 3.3e5], Wollongong: [2.6e5, 3.3e5] },
  state: { Hobart: 'AU-TAS', 'Gold Coast': 'AU-QLD', Newcastle: 'AU-NSW', Geelong: 'AU-VIC', Darwin: 'AU-NT', Canberra: 'AU-ACT', Townsville: 'AU-QLD' },
  absent: ['Cranbourne', 'Clyde', 'Parramatta', 'Fremantle'],
};
const USA_SPOT = { capitals: { 'US-CA': 'Sacramento', 'US-NY': 'Albany', 'US-TX': 'Austin', 'US-FL': 'Tallahassee', 'US-IL': 'Springfield', 'US-PA': 'Harrisburg' } };
const PER_COUNTRY_MIN = { AUS: 15, USA: 40, CAN: 15, NZL: 10, GBR: 15, IND: 25, JPN: 25, DEU: 15, FRA: 10, BRA: 20 };
const dist = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dp = (b[1] - a[1]) * r; const x = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

export function validate(G) {
  const errs = [], warns = [];
  for (const [cc, C] of Object.entries(G.countries)) {
    if (!C.sources?.length || !C.sources.every(s => /^https:\/\//.test(s.url))) errs.push(`${cc}: sources missing`);
    if (C.cities.length < (PER_COUNTRY_MIN[cc] || 5)) errs.push(`${cc}: only ${C.cities.length} cities`);
    const seen = new Set();
    for (const c of C.cities) {
      if (seen.has(norm(c.n))) errs.push(`${cc}: duplicate ${c.n}`);
      seen.add(norm(c.n));
      if (!(c.pop >= 1e4 && c.pop <= 4e7)) errs.push(`${cc}: ${c.n} population ${c.pop} out of range`);
      if (NOT_A_CITY.has(c.n)) errs.push(`${cc}: ${c.n} is not a city`);
      if (C.states && !C.states[c.st]) errs.push(`${cc}: ${c.n} has unknown state ${c.st}`);
      if (/\d|\[|\]|Ward|built-up/.test(c.n)) errs.push(`${cc}: bad name "${c.n}"`);
    }
    if (C.states) {
      for (const [code, s] of Object.entries(C.states)) if (!s.capital && !(code in CAPITAL_FIX && CAPITAL_FIX[code] === null)) errs.push(`${cc}: ${code} ${s.n} has no capital`);
      const capNames = Object.values(C.states).map(s => s.capital).filter(Boolean);
      if (new Set(capNames).size !== capNames.length && cc !== 'IND') warns.push(`${cc}: two units share a capital`);
    }
    // a "city" sitting inside a bigger listed city is a suburb (urban-area lists only; city-proper lists have real neighbours)
    {
      const at = n => (NE[cc] || []).find(x => norm(x[0]) === norm(n));
      for (const c of C.cities) {
        const p = at(c.n); if (!p) continue;
        for (const b of C.cities) {
          if (b.pop <= c.pop) break;
          const q = at(b.n);
          const lim = C.phrase === 'urban' ? 15 : b.pop >= 2 * c.pop ? 10 : 0;
          if (q && !SEPARATE.has(`${cc}:${c.n}`) && dist([p[1], p[2]], [q[1], q[2]]) < lim) errs.push(`${cc}: ${c.n} is within ${lim} km of ${b.n} (suburb?)`);
        }
      }
    }
    // the same city in Natural Earth (metro populations): wildly different numbers mean the wrong place or a bad row
    for (const c of C.cities) {
      const ne = (NE[cc] || []).find(x => norm(x[0]) === norm(c.n));
      if (ne && ne[3] > 0) { const r = c.pop / ne[3]; if (r > 6 || r < 1 / 12) warns.push(`${cc}: ${c.n} ${c.pop} vs Natural Earth ${ne[3]}`); }
    }
  }
  const A = G.countries.AUS;
  if (!A) errs.push('AUS missing');
  else {
    for (const [code, cap] of Object.entries(AUS_SPOT.capitals)) if (A.states?.[code]?.capital !== cap) errs.push(`AUS spot: capital of ${code} should be ${cap}, got ${A.states?.[code]?.capital}`);
    for (const [n, [lo, hi]] of Object.entries(AUS_SPOT.pop)) { const c = A.cities.find(x => x.n === n); if (!c || c.pop < lo || c.pop > hi) errs.push(`AUS spot: ${n} population ${c?.pop} not in ${lo}–${hi}`); }
    for (const [n, st] of Object.entries(AUS_SPOT.state)) { const c = A.cities.find(x => x.n === n); if (c?.st !== st) errs.push(`AUS spot: ${n} should be in ${st}, got ${c?.st}`); }
    for (const n of AUS_SPOT.absent) if (A.cities.some(x => x.n === n)) errs.push(`AUS spot: ${n} must not be a city`);
  }
  for (const [code, cap] of Object.entries(USA_SPOT.capitals)) if (G.countries.USA?.states?.[code]?.capital !== cap) errs.push(`USA spot: capital of ${code} should be ${cap}, got ${G.countries.USA?.states?.[code]?.capital}`);
  return { errs, warns };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  let G;
  if (process.argv.includes('--check')) G = J('data/local/geo.json');
  else { G = await build(); mkdirSync(dirname(OUT), { recursive: true }); }
  const { errs, warns } = validate(G);
  warns.forEach(w => console.log('warn', w));
  errs.forEach(e => console.log('FAIL', e));
  if (!process.argv.includes('--check')) {
    if (errs.length) { console.log(`not written: ${errs.length} problems`); process.exit(1); }
    writeFileSync(OUT, JSON.stringify(G));
    console.log(`wrote ${OUT}`);
  }
  console.log(errs.length ? `${errs.length} problems` : `geo.json OK: ${Object.keys(G.countries).join(' ')}`);
  process.exit(errs.length ? 1 : 0);
}
