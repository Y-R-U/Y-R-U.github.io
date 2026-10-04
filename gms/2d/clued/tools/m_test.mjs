// Lane M data integrity test. Run: node tools/m_test.mjs [dataDir]   (default data/geo)
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UN_MEMBERS } from './m_tables.mjs';
import { REGIONS, STATE_VIEWS } from '../js/geo/regions.js';
import { features } from '../js/geo/topo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.argv[2] || join(ROOT, 'data/geo');
const J = f => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL', msg); } };

const C = J('countries.json'), S = J('states.json'), CI = J('cities.json'), M = J('marine-info.json'), F = J('flags.json');
const world = J('world.json');
const worldIds = new Set(features(world, 'countries').map(f => f.id));

// countries
ok(UN_MEMBERS.length === 193, 'UN list has 193 members, got ' + UN_MEMBERS.length);
for (const id of UN_MEMBERS) {
  const c = C[id];
  ok(c && c.k === 's', `UN member ${id} present as sovereign`);
  if (!c) continue;
  ok(worldIds.has(id), `${id} has world geometry`);
  ok(c.n && c.n.length > 2 && !/\[|-99/.test(c.n), `${id} name "${c.n}"`);
  ok(['AF', 'AS', 'EU', 'NA', 'SA', 'OC'].includes(c.c), `${id} continent ${c.c}`);
  ok(Array.isArray(c.lp) && c.lp.length === 2 && c.lp[0] >= c.bb[0] - 0.5 && c.lp[0] <= c.bb[2] + 0.5, `${id} label point inside bbox`);
  ok([1, 2, 3].includes(c.d), `${id} difficulty`);
}
for (const [id, c] of Object.entries(C)) if (c.k !== 'x') for (const n of c.nb) ok(C[n]?.nb.includes(id), `adjacency symmetric ${id}-${n}`);
const names = Object.values(C).filter(c => c.k !== 'x').map(c => c.n);
ok(new Set(names).size === names.length, 'country names unique');
const BORDERS = [['FRA', 'ESP'], ['USA', 'CAN'], ['USA', 'MEX'], ['CHN', 'IND'], ['RUS', 'CHN'], ['ITA', 'VAT'], ['ITA', 'SMR'], ['ZAF', 'LSO'],
  ['DEU', 'DNK'], ['BRA', 'URY'], ['GBR', 'IRL'], ['XKX', 'SRB'], ['FRA', 'MCO'], ['ESP', 'AND'], ['SOM', 'ETH'], ['ISR', 'PSE'], ['RUS', 'POL'],
  ['IND', 'BGD'], ['PER', 'ECU'], ['SSD', 'SDN'], ['CHE', 'LIE'], ['NOR', 'SWE'], ['KHM', 'THA'], ['ESH', 'MAR']];
for (const [a, b] of BORDERS) ok(C[a]?.nb.includes(b), `known border ${a}-${b}`);
for (const [a, b] of [['GBR', 'FRA'], ['JPN', 'KOR'], ['AUS', 'IDN'], ['USA', 'RUS'], ['ESP', 'ITA'], ['EGY', 'SAU']]) ok(!C[a]?.nb.includes(b), `no border ${a}-${b}`);
for (const id of ['AUS', 'JPN', 'NZL', 'ISL', 'MDG', 'LKA', 'CUB']) ok(C[id].nb.length === 0, `${id} has no land neighbours (${C[id].nb})`);
ok(C.CHN.nb.filter(n => C[n].k === 's').length === 14, 'China has 14 sovereign neighbours, got ' + C.CHN.nb.filter(n => C[n].k === 's'));
ok(C.RUS.nb.filter(n => C[n].k === 's').length === 14, 'Russia has 14 sovereign neighbours');
ok(C.EGY.cs?.includes('AS') && C.RUS.cs?.includes('AS'), 'transcontinental memberships');
for (const [id, c] of Object.entries({ FRA: 'EU', DEU: 'EU', GBR: 'EU', BRA: 'SA', ARG: 'SA', JPN: 'AS', IND: 'AS', KEN: 'AF', NGA: 'AF', AUS: 'OC', FJI: 'OC', MEX: 'NA', JAM: 'NA', MDV: 'AS', MUS: 'AF' })) ok(C[id]?.c === c, `${id} continent is ${c}`);

// files
const kb = f => statSync(join(DIR, f)).size / 1024;
ok(kb('world.json') < 300, `world.json < 300 KB (${kb('world.json').toFixed(0)})`);
ok(kb('countries.json') + kb('states.json') < 120, 'index (countries + states) < 120 KB');
for (const [k, r] of Object.entries(REGIONS)) {
  if (!r.file) continue;
  ok(existsSync(join(DIR, 'regions', r.file + '.json')), `region file ${r.file}`);
  const ids = new Set(features(JSON.parse(readFileSync(join(DIR, 'regions', r.file + '.json'), 'utf8')), 'countries').map(f => f.id));
  const members = r.members.ids || UN_MEMBERS.filter(id => C[id]?.c === r.members.continent);
  for (const id of members) ok(ids.has(id), `region ${k} file holds member ${id}`);
}

// states
const COUNTS = { USA: 51, CAN: 13, MEX: 32, BRA: 27, ARG: 24, CHL: 16, AUS: 8, IND: 36, CHN: 31, JPN: 47, KOR: 17, DEU: 16, FRA: 13, ESP: 19,
  ITA: 20, GBR: 4, CHE: 26, AUT: 9, POL: 16, SWE: 21, NLD: 12, TUR: 81, ZAF: 9, NGA: 37, EGY: 27, SAU: 13, THA: 77, MYS: 16 };
for (const iso of Object.keys(STATE_VIEWS)) {
  const s = S[iso];
  ok(s, `states index for ${iso}`);
  if (!s) continue;
  const ids = Object.keys(s.s);
  if (COUNTS[iso]) ok(ids.length === COUNTS[iso], `${iso} has ${COUNTS[iso]} subdivisions, got ${ids.length}`);
  const nm = Object.values(s.s).map(x => x.n);
  ok(nm.every(n => n && !/null|undefined|~merged/.test(n)) && new Set(nm).size === nm.length, `${iso} subdivision names clean and unique`);
  const topo = JSON.parse(readFileSync(join(DIR, 'states', iso + '.json'), 'utf8'));
  const fids = new Set(features(topo, 'states').map(f => f.id));
  ok(ids.every(id => fids.has(id)), `${iso} geometry for every subdivision`);
  ok(features(topo, 'context').length > 0 || iso === 'AUS', `${iso} has context countries`);
}
ok(S.USA.s['US-CA']?.n === 'California' && S.AUS.s['AU-VIC']?.n === 'Victoria' && S.IND.s['IN-KA']?.n === 'Karnataka', 'spot-check subdivision names');
ok(S.GBR.s['GB-SCT'] && S.FRA.s['FR-BRE']?.n === 'Brittany' && S.MEX.s['MX-DIF']?.n === 'Mexico City', 'grouped/renamed subdivisions');

// cities
const city = (iso, n) => (CI.c[iso] || []).find(c => c[0] === n);
for (const [iso, n] of [['FRA', 'Paris'], ['GBR', 'London'], ['JPN', 'Tokyo'], ['USA', 'New York'], ['BRA', 'São Paulo'], ['AUS', 'Sydney'], ['EGY', 'Cairo'], ['IND', 'Mumbai'], ['GRL', 'Nuuk']]) ok(city(iso, n), `city ${n} in ${iso}`);
const p = city('FRA', 'Paris'); ok(p && Math.abs(p[1] - 2.35) < 0.3 && Math.abs(p[2] - 48.86) < 0.3, 'Paris coordinates');
for (const iso of UN_MEMBERS) if (C[iso]?.pop > 2e7) ok((CI.c[iso] || []).length >= 4, `${iso} (pop ${Math.round(C[iso].pop / 1e6)}M) has >= 4 cities`);
for (const [iso, list] of Object.entries(CI.c)) {
  const b = C[iso]?.bb || [0, 0, 0, 0];
  for (const c of list) ok(c[1] >= b[0] - 0.5 && c[1] <= b[2] + 0.5 && c[2] >= b[1] - 0.5 && c[2] <= b[3] + 0.5, `${c[0]} lies within ${iso} bbox`);
}
ok(Object.keys(CI.s).length > 300, 'state city lists exist');
for (const [sid, list] of Object.entries(CI.s)) ok(list.every(c => c[0] && isFinite(c[1]) && isFinite(c[2])), `state cities ${sid} well-formed`);
const ca = CI.s['US-CA'] || []; ok(ca.some(c => c[0] === 'Los Angeles') && !ca.some(c => c[0] === 'Chicago'), 'US-CA cities are Californian');

// marine
for (const n of ['Mediterranean Sea', 'Caribbean Sea', 'Gulf of Mexico', 'Bay of Bengal', 'North Sea', 'Baltic Sea', 'Red Sea', 'Black Sea',
  'Arabian Sea', 'South China Sea', 'Hudson Bay', 'Persian Gulf', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean']) ok(Object.values(M).some(m => m.n === n), `marine ${n}`);
for (const g of ['atlantic-ocean', 'pacific-ocean', 'indian-ocean']) ok(M[g]?.k === 'ocean' && M[g].a > 4e7, `${g} is one ocean feature (north and south pieces merged)`);
ok(Object.values(M).every(m => m.n === m.n.trim() && m.n !== m.n.toUpperCase() && Array.isArray(m.lp)), 'marine names tidy, label points present');
const marineIds = new Set(features(J('marine.json'), 'marine').map(f => f.id));
ok(Object.keys(M).every(id => marineIds.has(id)), 'marine geometry for every marine name');

// flags
for (const id of UN_MEMBERS) if (id !== 'OMN') ok(F[id]?.src?.startsWith('https://upload.wikimedia.org/') && F[id].license && F[id].page, `flag for ${id}`);
ok(Object.values(F).every(f => /^(public domain|cc0|cc by)/i.test(f.license)), 'flag licences allowed');

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
