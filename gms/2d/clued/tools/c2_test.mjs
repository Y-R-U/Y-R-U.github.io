#!/usr/bin/env node
// Lane C2 pack tests: C1 schema validation plus fact sanity for every C2 pack, and a self-test proving each check
// catches a deliberately broken copy. Usage: node tools/c2_test.mjs [extra-pack.json ...]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from './c1_schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const C2_PACKS = ['countries', 'capitals', 'currencies', 'flags', 'landmarks', 'languages', 'movies', 'actors', 'people', 'leaders', 'explorers', 'artists', 'paintings', 'books', 'quotes', 'words', 'history', 'tv'];
const CONTINENTS = new Set(['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']);
const NOW = 2026;
const words = s => String(s).trim().split(/\s+/).length;

export function checkPack(p) {
  const err = [];
  const E = (m) => err.push(`${p.id}: ${m}`);
  const { errors } = validatePack(p, p.id);
  err.push(...errors);
  const items = p.items || [], qs = p.questions || [];
  if (items.length && items.filter(i => i.difficulty === 1).length < 15) E(`only ${items.filter(i => i.difficulty === 1).length} difficulty-1 items (need 15)`);
  for (const x of [...items, ...qs]) if (![1, 2, 3].includes(x.difficulty)) E(`${x.id}: missing difficulty`);
  for (const [k, m] of Object.entries(p.factsMeta || {})) {
    const used = items.filter(i => i.facts?.[k] != null).length >= 4;
    if (!used) continue;
    if (m.type === 'cat' && m.exclusive !== false && !m.ask) E(`factsMeta.${k}: exclusive cat fact needs an "ask" template`);
    if ((m.type === 'num' || m.type === 'year') && !m.askHigh) E(`factsMeta.${k}: needs an "askHigh" template`);
  }
  for (const q of qs) {
    if (q.kind === 'mc' && (q.wrong || []).includes(q.answer)) E(`${q.id}: answer among wrong options`);
    if (q.kind === 'order' && new Set(q.answer).size !== q.answer.length) E(`${q.id}: repeated order entries`);
  }
  if (p.kids) {
    const n = items.filter(i => i.difficulty === 1 && i.media?.img?.length).length;
    if (n < 15) E(`kids pack has only ${n} easy items with images`);
  }
  const f = i => i.facts || {};
  const year = (y, lo, hi) => typeof y === 'number' && Number.isInteger(y) && y >= lo && y <= hi && y !== 0;
  switch (p.id) {
    case 'countries':
      for (const i of items) {
        if (!(f(i).population > 0)) E(`${i.id}: population must be positive`);
        if (!(f(i).areaKm2 > 0)) E(`${i.id}: area must be positive`);
        const c = [].concat(f(i).continent || []);
        if (!c.length || !c.every(x => CONTINENTS.has(x))) E(`${i.id}: bad or missing continent`);
        if (!f(i).capital && !i.capitalNote) E(`${i.id}: no capital`);
      }
      if (items.length < 190) E(`only ${items.length} countries`);
      break;
    case 'capitals': case 'flags': case 'landmarks':
      for (const i of items) { const c = [].concat(f(i).continent || []); if (!c.length || !c.every(x => CONTINENTS.has(x))) E(`${i.id}: bad or missing continent`); }
      if (p.id === 'flags') for (const i of items) if (f(i).flagDisputed && i.media?.img?.length) E(`${i.id}: disputed flag must not be a question image`);
      if (p.id === 'landmarks') for (const i of items) if (f(i).built != null && !year(f(i).built, -3000, NOW)) E(`${i.id}: built year out of range`);
      break;
    case 'movies': {
      const tops = new Map();
      for (const i of items) {
        if (!year(f(i).year, 1900, NOW)) E(`${i.id}: release year out of range`);
        if (f(i).boxOfficeUSD != null && !(f(i).boxOfficeUSD > 1e6)) E(`${i.id}: implausible box office`);
        if (f(i).topOfYear) { if (tops.has(f(i).year)) E(`${i.id}: second top film of ${f(i).year} (also ${tops.get(f(i).year)})`); tops.set(f(i).year, i.id); }
        if (i.quote && words(i.quote) > 10) E(`${i.id}: film quote over 10 words`);
        if (i.quote && !/wikiquote\.org/.test(i.quoteSource || '')) E(`${i.id}: quote without Wikiquote source`);
      }
      break;
    }
    case 'people': case 'leaders': case 'explorers': case 'artists': case 'actors':
      for (const i of items) {
        if (f(i).born != null && !year(f(i).born, -800, 2015)) E(`${i.id}: birth year out of range`);
        if (f(i).died != null && !year(f(i).died, -800, NOW)) E(`${i.id}: death year out of range`);
        if (f(i).born != null && f(i).died != null && !(f(i).died > f(i).born && f(i).died - f(i).born < 120)) E(`${i.id}: impossible lifespan`);
      }
      break;
    case 'paintings':
      for (const i of items) if (f(i).year != null && !year(f(i).year, 1250, 2000)) E(`${i.id}: painting year out of range`);
      break;
    case 'books':
      for (const i of items) {
        if (!year(f(i).year, -800, NOW)) E(`${i.id}: publication year out of range`);
        if (!f(i).author) E(`${i.id}: no author`);
        if (i.firstLine && (f(i).year >= 1930 || !/gutenberg\.org/.test(i.firstLineSource || ''))) E(`${i.id}: first line only allowed for pre-1930 Gutenberg books`);
        if (!i.summary || words(i.summary) > 45) E(`${i.id}: summary missing or too long`);
      }
      break;
    case 'quotes':
      for (const i of items) for (const q of i.quotes || []) {
        if (!/wikiquote\.org/.test(q.source || '')) E(`${i.id}: quote without Wikiquote source`);
        if (words(q.text) > 40) E(`${i.id}: quote too long`);
      }
      break;
    case 'history': {
      const byName = new Map(items.map(i => [i.name, i]));
      for (const i of items) if (!year(f(i).year, -3000, NOW)) E(`${i.id}: year out of range`);
      for (const q of qs.filter(q => q.kind === 'order')) {
        const ys = q.answer.map(n => byName.get(n)?.facts.year);
        if (ys.some(y => y == null) || ys.some((y, k) => k && y < ys[k - 1])) E(`${q.id}: timeline not in order`);
      }
      break;
    }
    case 'tv':
      for (const i of items) if (!year(f(i).year, 1936, NOW)) E(`${i.id}: first-aired year out of range`);
      break;
  }
  return err;
}

// Self-test: each broken copy must be caught.
function selfTest(load) {
  const clone = o => JSON.parse(JSON.stringify(o));
  const cases = [
    ['countries', p => { p.items[0].facts.population = -5; }, 'population'],
    ['countries', p => { delete p.items[1].facts.continent; }, 'continent'],
    ['movies', p => { const t = p.items.filter(i => i.facts.topOfYear); t[1].facts.year = t[0].facts.year; }, 'second top film'],
    ['movies', p => { const i = p.items.find(i => i.quote); i.quote = 'one two three four five six seven eight nine ten eleven'; }, 'over 10 words'],
    ['books', p => { const i = p.items.find(i => i.facts.year > 1950); i.firstLine = 'A modern opening.'; i.firstLineSource = 'https://www.gutenberg.org/ebooks/1'; }, 'first line'],
    ['history', p => { const q = p.questions.find(q => q.kind === 'order'); q.answer.reverse(); }, 'not in order'],
    ['people', p => { p.items[0].facts.died = p.items[0].facts.born - 10; }, 'lifespan'],
    ['flags', p => { const i = p.items.find(i => i.facts.flagDisputed); i.media.img = [p.items[5].media.img[0]]; }, 'disputed flag'],
    ['words', p => { p.items.forEach(i => { if (i.difficulty === 1) i.difficulty = 2; }); }, 'difficulty-1'],
  ];
  let bad = 0;
  for (const [id, mut, expect] of cases) {
    const p = clone(load(id));
    mut(p);
    if (!checkPack(p).some(e => e.includes(expect))) { bad++; console.error(`SELF-TEST FAIL: broken ${id} (${expect}) was not caught`); }
  }
  return bad;
}

const load = id => JSON.parse(readFileSync(join(ROOT, 'data/packs', id + '.json'), 'utf8'));
let fails = 0;
for (const id of C2_PACKS) {
  let p;
  try { p = load(id); } catch (e) { console.error(`${id}: cannot load (${e.message})`); fails++; continue; }
  const errs = checkPack(p);
  for (const e of errs) console.error('FAIL', e);
  fails += errs.length;
}
for (const extra of process.argv.slice(2)) {
  const errs = checkPack(JSON.parse(readFileSync(extra, 'utf8')));
  for (const e of errs) console.error('FAIL', e);
  fails += errs.length;
}
fails += selfTest(load);
console.log(fails ? `c2_test: ${fails} failure(s)` : `c2_test: all ${C2_PACKS.length} C2 packs pass; self-test caught every broken copy`);
process.exit(fails ? 1 : 0);
