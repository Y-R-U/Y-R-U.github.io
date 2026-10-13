#!/usr/bin/env node
// Lane SCREEN additive build: appends the hand-listed films / TV shows / actors / books to the packs ON DISK, keeping
// every item the C2 builders made (and their questions) unchanged. Idempotent: it first strips its own additions.
//   node tools/c2_screen_add.mjs movies|tv|actors|books|all
// The full builders (c2_build_movies/tv/people/books) call the same extend* functions, so a rebuild yields the same.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PACKS, writePack } from './c2_lib.mjs';

const which = process.argv[2] || 'all';
const load = id => JSON.parse(readFileSync(join(PACKS, id + '.json'), 'utf8'));
const run = async (id, mod, strip, extend) => {
  const m = await import(mod);
  const report = [];
  const pack = m[strip](load(id));
  await m[extend](pack, s => report.push(s));
  writePack(pack);
  writeFileSync(join(ROOT, `tools/c2_reports/screen_${id}.txt`), report.join('\n') + '\n');
  console.log(report.filter(l => /^(DROPPED|movies|tv|actors|books):?/.test(l)).slice(-400).join('\n'));
};
if (which === 'movies' || which === 'all') await run('movies', './c2_screen_movies.mjs', 'stripMovies', 'extendMovies');
if (which === 'tv' || which === 'all') await run('tv', './c2_screen_tv.mjs', 'stripTv', 'extendTv');
if (which === 'actors' || which === 'all') { await run('actors', './c2_screen_actors.mjs', 'stripActors', 'extendActors'); (await import('./c2_gender.mjs')).run(); }
if (which === 'books' || which === 'all') await run('books', './c2_screen_books.mjs', 'stripBooks', 'extendBooks');
