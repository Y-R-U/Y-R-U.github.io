#!/usr/bin/env node
// Lane SCREEN tests (offline): the cross-check rules reject conflicts, and the screen/book packs keep their invariants.
// A broken copy of each pack must fail. Usage: node tools/c2_screen_test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yearAgrees, agreedDirectors, agreedCountries, fameDifficulty } from './c2_screen_movies.mjs';
import { leadFacts } from './c2_screen_lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = id => JSON.parse(readFileSync(join(ROOT, 'data/packs', id + '.json'), 'utf8'));
const NAMES = new Set(Object.values(JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'))).map(c => c.n));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };

// rules
const L = id => ({ Q1: 'Joel Coen', Q2: 'Ethan Coen', Q3: 'Victor Fleming', Q4: 'King Vidor', Q5: 'John Lasseter', Q6: 'Lee Unkrich' }[id]);
ok(yearAgrees(1994, 1994, [1994]), 'year agrees');
ok(!yearAgrees(1994, 1995, [1994]), 'lead year conflict rejected');
ok(!yearAgrees(1994, 1994, [1993]), 'Wikidata year conflict rejected');
ok(!yearAgrees(1994, null, [1994]), 'missing lead year rejected');
ok(JSON.stringify(agreedDirectors(['Q3', 'Q4'], ['Q3'], '[[Victor Fleming]]', L)) === '["Q3"]', 'credited director kept');
ok(JSON.stringify(agreedDirectors(['Q5', 'Q6'], ['Q5'], '[[John Lasseter]]', L)) === '["Q5"]', 'co-director left to Wikidata only');
ok(JSON.stringify(agreedDirectors(['Q1', 'Q2'], [], '[[Coen brothers]]', L)) === '["Q1","Q2"]', 'duo article');
ok(agreedDirectors(['Q5'], ['Q3'], '[[Victor Fleming]]', L) === null, 'different director rejected');
ok(agreedDirectors([], ['Q3'], '[[Victor Fleming]]', L) === null, 'no Wikidata director rejected');
ok(agreedCountries({ lead: { isos: ['AUS'] }, ibIsos: [], p495: ['AUS', 'USA'] }).join() === 'AUS', 'country agreed');
ok(agreedCountries({ lead: { isos: ['AUS'] }, ibIsos: [], p495: ['USA'] }).length === 0, 'country conflict rejected');
ok(agreedCountries({ lead: { isos: [] }, ibIsos: [], p495: ['USA'] }).length === 0, 'single-source country rejected');
const lf = leadFacts('Parasite is a 2019 South Korean black comedy thriller film directed by Bong Joon Ho.');
ok(lf.year === 2019 && lf.isos.join() === 'KOR', 'lead sentence parsed');
ok(leadFacts('Dilwale Dulhania Le Jayenge is a 1995 Indian Hindi-language romantic film.').isos.join() === 'IND', 'language demonym not a second country');
ok(fameDifficulty(3, 70) === 2 && fameDifficulty(3, 30) === 3 && fameDifficulty(1, 10) === 2 && fameDifficulty(2, 99) === 1, 'fame nudges difficulty');

// pack invariants
function checkMovies(p) {
  const e = [];
  const byId = new Map(p.items.map(i => [i.id, i]));
  for (const it of p.items) {
    for (const c of [].concat(it.facts.country ?? [])) if (!NAMES.has(c)) e.push(`${it.id}: unknown country ${c}`);
    if (it.facts.stars && it.facts.stars.split(', ').length > 3) e.push(`${it.id}: more than 3 stars`);
    if (it.facts.bestPicture != null && typeof it.facts.bestPicture !== 'boolean') e.push(`${it.id}: bestPicture not a bool`);
  }
  for (const q of p.questions) {
    const it = byId.get(String(q.refs?.[0]).split('/')[1]);
    if (q.id.startsWith('star-') && (!it?.facts.stars?.split(', ').includes(q.answer) || q.wrong.some(w => it.facts.stars.split(', ').includes(w)))) e.push(`${q.id}: star answer/options`);
    if (q.id.startsWith('dir-') && it && (q.answer !== it.facts.director || q.wrong.includes(q.answer))) e.push(`${q.id}: director answer/options`);
    if (q.kind === 'mc' && new Set([q.answer, ...q.wrong]).size !== q.wrong.length + 1) e.push(`${q.id}: repeated option`);
  }
  if (p.items.filter(i => i.facts.bestPicture === true).length < 40) e.push('fewer than 40 Best Picture winners');
  return e;
}
function checkTv(p) {
  const e = [];
  const byId = new Map(p.items.map(i => [i.id, i]));
  for (const q of p.questions) {
    const it = byId.get(String(q.refs?.[0]).split('/')[1]);
    if (q.id.startsWith('net-') && (q.answer !== it?.facts.network || q.wrong.includes(q.answer) || new Set(q.wrong).size !== 3)) e.push(`${q.id}: network answer/options`);
    if (q.id.startsWith('star-') && (!it?.facts.stars?.split(', ').includes(q.answer) || q.wrong.some(w => it.facts.stars.split(', ').includes(w)))) e.push(`${q.id}: star answer/options`);
  }
  for (const it of p.items) for (const c of [].concat(it.facts.country)) if (!NAMES.has(c)) e.push(`${it.id}: unknown country ${c}`);
  return e;
}
function checkBooks(p) {
  const e = [];
  for (const it of p.items) {
    if (it.facts.country != null && !NAMES.has(it.facts.country)) e.push(`${it.id}: unknown country ${it.facts.country}`);
    if (it.firstLine && (it.facts.year >= 1930 || !/gutenberg\.org/.test(it.firstLineSource || ''))) e.push(`${it.id}: first line rule`);
  }
  if (p.items.filter(i => i.facts.country).length < p.items.length - 3) e.push('books without country');
  return e;
}
function checkActors(p) {
  const e = [];
  for (const it of p.items) {
    if (!it.gender) e.push(`${it.id}: no gender`);
    if (!it.facts.nationality) e.push(`${it.id}: no nationality`);
    for (const m of it.media?.img || []) if (!/^(CC0|CC BY|CC BY-SA|Public domain|PD)/i.test(m.license)) e.push(`${it.id}: licence ${m.license}`);
  }
  const g = new Map(p.items.map(i => [i.name, i.gender]));
  for (const q of p.questions.filter(q => q.id.startsWith('who-') && /\b(He|She)\b/.test(q.prompt))) if (q.wrong.some(w => g.get(w) !== g.get(q.answer))) e.push(`${q.id}: mixed-gender options`);
  return e;
}
// the first-billed star of famous films (including ones who also wrote/directed/produced) must be in facts.stars
const LEADS = { Rocky: 'Sylvester Stallone', 'First Blood': 'Sylvester Stallone', 'Crocodile Dundee': 'Paul Hogan', 'Crocodile Dundee II': 'Paul Hogan',
  'The Bodyguard': 'Kevin Costner', 'Mission: Impossible 2': 'Tom Cruise', Braveheart: 'Mel Gibson', 'Citizen Kane': 'Orson Welles', 'Annie Hall': 'Woody Allen',
  'Dances with Wolves': 'Kevin Costner', 'Top Gun: Maverick': 'Tom Cruise', Barbie: 'Margot Robbie', 'Furious 7': 'Vin Diesel', 'Deadpool & Wolverine': 'Ryan Reynolds',
  "Singin' in the Rain": 'Gene Kelly', 'Bonnie and Clyde': 'Warren Beatty', Unforgiven: 'Clint Eastwood', 'Million Dollar Baby': 'Clint Eastwood', Titanic: 'Leonardo DiCaprio',
  'Forrest Gump': 'Tom Hanks', Jaws: 'Roy Scheider', 'Mad Max': 'Mel Gibson', 'Die Hard': 'Bruce Willis', 'The Terminator': 'Arnold Schwarzenegger', Gladiator: 'Russell Crowe',
  'Toy Story': 'Tom Hanks', 'Pulp Fiction': 'John Travolta', 'The Godfather': 'Marlon Brando', Casablanca: 'Humphrey Bogart', 'Easy Rider': 'Peter Fonda' };
const CHECKS = { movies: checkMovies, tv: checkTv, books: checkBooks, actors: checkActors };
{
  const m = load('movies');
  for (const [name, lead] of Object.entries(LEADS)) {
    const it = m.items.find(i => i.name === name);
    if (!it) { ok(false, `lead check: ${name} not in movies`); continue; }
    if (lead) ok(String(it.facts.stars || '').split(', ').includes(lead), `${name}: ${lead} in stars (${it.facts.stars || '-'})`);
    const q = m.questions.find(q => q.id === 'star-' + it.id);
    if (q && lead) ok(!q.wrong.includes(lead), `${name}: lead is never a wrong option`);
  }
}
for (const [id, fn] of Object.entries(CHECKS)) { const e = fn(load(id)); e.slice(0, 10).forEach(m => console.error('FAIL', id, m)); ok(!e.length, `${id} invariants (${e.length})`); }

// broken copies must fail
const clone = o => JSON.parse(JSON.stringify(o));
const breaks = [
  ['movies', p => { const q = p.questions.find(q => q.id.startsWith('star-')); const it = p.items.find(i => 'star-' + i.id === q.id); q.wrong[0] = it.facts.stars.split(', ')[1] || q.answer; }],
  ['movies', p => { p.items.find(i => i.facts.country).facts.country = 'Narnia'; }],
  ['tv', p => { const q = p.questions.find(q => q.id.startsWith('net-')); q.wrong[1] = q.answer; }],
  ['books', p => { const i = p.items.find(i => i.facts.year > 1950); i.firstLine = 'x'; i.firstLineSource = 'https://www.gutenberg.org/ebooks/1'; }],
  ['actors', p => { const q = p.questions.find(q => q.id.startsWith('who-') && /\bShe\b/.test(q.prompt)); q.wrong[0] = p.items.find(i => i.gender === 'm').name; }],
];
for (const [id, mut] of breaks) { const p = clone(load(id)); mut(p); ok(CHECKS[id](p).length > 0, `broken ${id} copy caught`); }
console.log(`c2_screen_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
