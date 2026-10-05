// GEO2 logic test: neighbours fairness, continent clue tiers + lines, determinism. Run: node tools/geo2_test.mjs
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crossings } from './geo2_bands.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 });
};
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const BUILD = readFileSync(join(ROOT, 'js/build.js'), 'utf8').match(/'(.+)'/)[1];
const NB = await import(js('geo/formats/neighbours.js') + '?v=' + BUILD);
const CT = await import(js('geo/formats/continent.js') + '?v=' + BUILD);
const { mulberry32, hashString } = await import(js('core/rng.js') + '?v=' + BUILD);
const C = JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'));
const rng = s => mulberry32(hashString(s));

let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; if (fails < 40) console.log('FAIL', msg); } };
const borders = (a, b) => C[a].nb.includes(b) || C[b].nb.includes(a);
const neighbours = NB.default, continent = CT.default;

// ---- neighbours: every pool country, every level, several seeds
for (const level of [1, 2, 3]) {
  for (const iso of NB.poolFor('pick', level)) for (const s of ['a', 'b', 'c']) {
    const q = NB.makeQuestion('pick', iso, level, rng(`${iso}${level}${s}`));
    if (!q) { ok(false, `pick ${iso} L${level} made no question`); continue; }
    const tag = `pick ${iso} L${level}`;
    ok(q.options.length === 6 && new Set(q.options.map(o => o.iso)).size === 6, `${tag} has 6 distinct options`);
    const right = q.answer.map(i => q.options[i].iso), wrong = q.options.filter((o, i) => !q.answer.includes(i)).map(o => o.iso);
    ok(right.length === q.data.need, `${tag} need ${q.data.need} = ${right.length} correct options`);
    ok(right.every(n => borders(iso, n)), `${tag} correct options border it: ${right}`);
    ok(wrong.every(n => !borders(iso, n)), `${tag} decoys never border it: ${wrong.filter(n => borders(iso, n))}`);
    ok([...right, ...wrong].every(n => !NB.DISPUTED.has(n) && n !== iso), `${tag} no disputed/self options`);
    ok(q.data.need <= NB.fullNb(iso).length, `${tag} need <= real neighbours`);
    ok(level !== 1 || q.data.need === 1, `${tag} easy asks for 1`);
    ok(level !== 2 || (q.data.need >= 2 && q.data.need <= 3), `${tag} medium asks for 2-3`);
    if (level === 3) {
      ok(right.slice().sort().join() === NB.fullNb(iso).join(), `${tag} hard holds every neighbour`);
      ok(!C[iso].nb.some(n => NB.DISPUTED.has(n)), `${tag} hard skips disputed borders`);
    }
    ok(/\d|both|Which of these borders/.test(q.prompt) && q.prompt.includes(C[iso].n), `${tag} prompt says how many: ${q.prompt}`);
  }
  for (const iso of NB.poolFor('count', level)) {
    const q = NB.makeQuestion('count', iso, level, rng(`c${iso}${level}`));
    const n = C[iso].nb.filter(x => C[x].k === 's' || C[x].k === 'p').length;
    ok(+q.answerText === n && q.options[q.answer].text === String(n), `count ${iso} answer ${q.answerText} = ${n}`);
    ok(q.options.length === 4 && new Set(q.options.map(o => o.text)).size === 4 && q.options.every(o => +o.text >= 1), `count ${iso} 4 distinct options >= 1`);
    ok(n >= 1, `count ${iso} never a 0-neighbour island`);
    ok(!C[iso].nb.some(x => NB.DISPUTED.has(x)) && NB.countable(iso), `count ${iso} has no disputed/overseas borders`);
    ok(/independent countries/.test(q.explain), `count ${iso} states the rule`);
  }
}
for (const bad of ['FRA', 'ESP', 'SRB', 'MAR', 'ISR', 'SUR']) ok(!NB.poolFor('count', 3).includes(bad), `count skips disputed-count country ${bad}`);
for (const isl of ['AUS', 'JPN', 'NZL', 'ISL', 'MDG', 'CUB', 'GBR_']) for (const k of ['pick', 'count', 'tap1']) ok(!NB.poolFor(k, k === 'tap1' ? 1 : 3).includes(isl), `${k} never asks island ${isl}`);
for (const l of [1, 2, 3]) ok(NB.poolFor('pick', l).includes('ESP') || l === 1, `Spain can be asked at level ${l}`);
ok(NB.makeQuestion('pick', 'ESP', 1, rng('e')).data.need === 1, 'Spain easy works');

// kids: one neighbour, all neighbours big enough at the default fit
const kidsPool = NB.poolFor('tap1', 1);
ok(kidsPool.length >= 20, 'kids pool has >= 20 countries: ' + kidsPool.length);
for (const iso of kidsPool) {
  const sz = NB.tapSizes(iso);
  ok(sz.every(s => s.side >= NB.KIDS_MIN.side && Math.min(s.w, s.h) >= NB.KIDS_MIN.thin), `kids ${iso} neighbours big enough: ${sz.map(s => s.id + ':' + s.side.toFixed(0)).join(' ')}`);
  ok(!C[iso].nb.some(n => NB.DISPUTED.has(n) || C[n].a < 1000), `kids ${iso} has no microstate/disputed neighbour`);
}
for (const tiny of ['ITA', 'FRA', 'ESP', 'CHE', 'AUT', 'ZAF', 'MYS']) ok(!kidsPool.includes(tiny), `kids never asks ${tiny} (tiny neighbour)`);
const kq = neighbours.generate({ rng: rng('k'), count: 20, opts: {}, kids: true });
ok(kq.length >= 15 && kq.every(q => q.data.kind === 'tap1' && kidsPool.includes(q.data.iso) && q.data.mistakes === 1), 'kids questions are tap-one from the kids pool');
const adult = neighbours.generate({ rng: rng('m'), count: 30, opts: { ask: 'mix' }, difficulty: 0 });
ok(adult.every(q => q.data.kind === 'pick' || q.data.kind === 'count'), 'adult mix never uses the map picker');
ok(adult.some(q => q.data.kind === 'pick') && adult.some(q => q.data.kind === 'count'), 'adult mix has both kinds');

// ---- continent
for (const [kind, v, expect] of [['lat', 6.4, ['AF', 'AS', 'SA']], ['lat', -33.9, ['AF', 'OC', 'SA']], ['lon', 2.3, ['AF', 'EU']], ['lon', -100, ['NA']]]) {
  const got = CT.crossesOf(kind, v);
  ok(expect.every(c => got.includes(c)) && (kind !== 'lon' || v !== -100 || got.length === 1), `${kind} ${v} crosses ${expect} (got ${got})`);
}
const tierWant = { 1: 'dot', 2: 'line', 3: 'name' };
for (const what of ['countries', 'cities', 'mix']) for (const d of [0, 1, 2, 3]) {
  const gen = () => continent.generate({ rng: rng(`ct${what}${d}`), count: 40, opts: { what }, difficulty: d });
  const qs = gen();
  ok(qs.length >= 30, `continent ${what} d${d} made ${qs.length}`);
  ok(JSON.stringify(qs) === JSON.stringify(gen()), `continent ${what} d${d} deterministic`);
  for (const q of qs) {
    const tag = `continent ${what} d${d} ${q.id}`;
    const own = C[q.data.iso].c;
    ok(q.options[q.answer].code === own && !C[q.data.iso].cs, `${tag} answer is the country's only continent`);
    if (d) ok(q.data.tier === tierWant[d], `${tag} tier ${q.data.tier}`);
    ok((q.data.tier === 'line') === !!q.data.line, `${tag} line only on the line tier`);
    ok(what !== 'cities' || q.data.city, `${tag} is a city`);
    if (q.data.city) {
      const mb = C[q.data.iso].mb;
      ok(q.data.city.lon >= mb[0] - 0.3 && q.data.city.lon <= mb[2] + 0.3 && q.data.city.lat >= mb[1] - 0.3 && q.data.city.lat <= mb[3] + 0.3, `${tag} city in the country's main part`);
      ok(!q.prompt.includes(C[q.data.iso].n), `${tag} prompt doesn't name the country`);
    }
    if (q.data.line) {
      const L = q.data.line, at = q.data.city || { lon: C[q.data.iso].lp[0], lat: C[q.data.iso].lp[1] };
      ok(Math.abs((L.kind === 'lat' ? at.lat : at.lon) - L.v) <= 0.13, `${tag} line passes within 0.13° of the place`);
      ok(L.crosses.includes(own), `${tag} line crosses its own continent`);
      const exact = [...crossings(L.kind, L.v)];
      ok(exact.every(c => L.crosses.includes(c)) && L.crosses.every(c => c === own || exact.includes(c)), `${tag} crosses ${L.crosses} match the polygons ${exact}`);
      const other = L.kind === 'lat' ? 'lon' : 'lat', ov = other === 'lat' ? at.lat : at.lon;
      const alt = new Set([...CT.crossesOf(other, ov), own]).size;
      ok(L.crosses.length >= alt, `${tag} picked the line crossing more continents (${L.crosses.length} vs ${alt})`);
      ok(L.crosses.length >= 2 || alt < 2, `${tag} line crosses >= 2 continents when possible`);
    }
  }
}
ok(continent.generate({ rng: rng('k'), count: 20, opts: {}, kids: true }).every(q => q.data.tier === 'dot' && !q.data.city && q.options.length === 3), 'kids continent: dot tier, countries, 3 buttons');
ok(continent.generate({ rng: rng('n'), count: 20, opts: { map: 'no' }, difficulty: 1 }).every(q => q.data.tier === 'name' && !q.data.map), 'map off = name only');
// every place the line tier can draw: the chosen line crosses the most continents
let strict = 0;
for (const pl of [...CT.cityPool().map(c => [c.lon, c.lat, C[c.iso].c]), ...Object.values(C).filter(c => c.k === 's' && !c.cs).map(c => [c.lp[0], c.lp[1], c.c])]) {
  const n = k => new Set([...CT.crossesOf(k, k === 'lat' ? pl[1] : pl[0]), pl[2]]).size;
  const L = CT.chooseLine(rng(String(pl)), pl[0], pl[1], pl[2]);
  if (n('lat') !== n('lon')) strict++;
  ok(L.crosses.length === Math.max(n('lat'), n('lon')), `line at ${pl} crosses the most continents (${L.kind} ${L.crosses.length} vs lat ${n('lat')} lon ${n('lon')})`);
}
ok(strict > 20, 'enough places where one line is strictly better: ' + strict);
const pool = CT.cityPool();
const names = new Map();
for (const c of pool) { ok(!names.has(c.n) || C[names.get(c.n)].c === C[c.iso].c, `city name ${c.n} unique across continents`); names.set(c.n, c.iso); }
ok(pool.length > 200, 'city pool size ' + pool.length);

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
