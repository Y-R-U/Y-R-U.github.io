#!/usr/bin/env node
// Genres (data/genres.json → genre~scifi … in data/index.json). For every genre × format the picker offers, builds rounds
// as the game does (several seeds, mixed + blended levels, kids mode) and checks:
//   - the round fills, every question comes from one of the genre's parts and refs only that one part (a "which film"
//     question never offers a book), item refs are really in the genre;
//   - kids mode: adult genres (horror, crime, war) are never offered, others only ask about family items;
//   - every pack id from before the genres still exists; data/genres.json only names real items.
// Exit 1 on any failure.   node tools/genre_test.mjs [--quick]
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200, headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
};
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) await import(new URL(m, js('formats/index.js')).href);
const { listFormats, supportsPack } = await import(js('formats/registry.js'));
const { loadIndex, loadPack } = await import(js('core/packs.js'));
const { makeSpec, buildQuestions, partsFor } = await import(js('core/spec.js'));
const index = await loadIndex();
const genres = JSON.parse(readFileSync(join(ROOT, 'data/genres.json'), 'utf8'));
const QUICK = process.argv.includes('--quick');
const SEEDS = QUICK ? ['g1'] : ['g1', 'g2', 'g3'];

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; if (fails <= 60) console.log('FAIL', m); } };

// pack ids the genres must not have changed (every id in the index before the Genres lane)
const BEFORE = ['actors', 'anthems', 'artists', 'bees', 'birds', 'body', 'book-moments', 'books', 'capitals', 'cats', 'classical-piano',
  'classical-recordings', 'countries', 'currencies', 'dinosaurs', 'directors', 'dishes', 'dogs', 'elements', 'explorers', 'flags',
  'flowers', 'gems', 'general', 'general~animals', 'general~art', 'general~books', 'general~food', 'general~geography', 'general~history', 'general~music',
  'general~nature', 'general~science', 'general~screen', 'history', 'hits-1960s', 'hits-1970s',
  'hits-1980s', 'hits-1990s', 'hits-2000s', 'hits-2010s', 'hits-2020s', 'insects', 'instruments', 'inventions', 'jellyfish',
  'kids', 'kids-film-tv', 'kids-nature', 'landmarks', 'languages', 'leaders', 'mammals', 'movie-moments', 'movies', 'mushrooms',
  'music-artists', 'nursery-rhymes', 'one-hit-wonders', 'paintings', 'pd-melodies', 'people', 'people~all', 'people~literature',
  'people~music', 'people~science', 'people~sport', 'quotes', 'records', 'reptiles', 'screen-themes', 'sea', 'sharks', 'snakes',
  'space', 'spiders', 'sport', 'trees', 'tv', 'tv-moments', 'words'];
for (const id of BEFORE) ok(index.packs[id], `pack id ${id} still exists`);

// genres.json names real items only
for (const [p, byG] of Object.entries(genres.packs)) {
  const pack = await loadPack(p);
  const ids = new Set(pack.items.map(i => i.id));
  for (const [g, list] of Object.entries(byG)) for (const id of list) ok(ids.has(id), `genres.json ${p}/${g}: ${id} is in the pack`);
}

const theme = index.themes.find(t => t.id === 'genres');
ok(theme && theme.packs.length >= 6, 'Genres theme listed with its genres');
const ADULT = new Set(Object.entries(genres.genres).filter(([, m]) => m.adult).map(([g]) => g));
const fmts = listFormats().filter(f => !f.packless && !f.hidden);
const table = [];
for (const gid of theme?.packs || []) {
  const g = gid.split('~')[1], info = index.packs[gid];
  const parts = info.virtual.parts;
  ok(parts.every(p => index.packs[p] && !index.themes.some(t => t.packs.includes(p))), `${gid}: parts exist and are unlisted`);
  ok(ADULT.has(g) === (info.kidsSafe === false) && parts.every(p => (index.packs[p].kidsSafe === false) === ADULT.has(g)), `${gid}: kidsSafe matches adult`);
  const inGenre = new Map(parts.map(p => [p, new Set(genres.packs[index.packs[p].virtual.of]?.[g] || [])]));
  const row = [gid];
  for (const fmt of fmts) {
    for (const kids of [false, true]) {
      const offered = supportsPack(fmt, info, { kids }) === true && !(kids && info.kidsSafe === false);
      if (kids && ADULT.has(g)) ok(!offered, `${gid} × ${fmt.id}: never offered in kids mode`);
      if (!offered) { if (!kids) row.push(`${fmt.id}:-`); continue; }
      const use = partsFor(fmt, [gid], index, { kids });
      ok(use.length > 0, `${gid} × ${fmt.id}${kids ? ' (kids)' : ''}: has parts to play`);
      let built = 0;
      for (const seed of SEEDS) {
        for (const difficulty of kids ? [1] : [0, 2]) {
          const count = fmt.id === 'trio' ? 5 : 10;
          const spec = makeSpec('quick', [{ format: fmt.id, packs: [gid], count, difficulty, opts: kids ? { kids: true } : {} }], `${seed}:${fmt.id}`, { kids });
          let qs = [];
          try { ({ questions: qs } = await buildQuestions(spec, { sparesRatio: 0.2 })); } catch (e) { ok(false, `${gid} × ${fmt.id} ${seed}: ${e.message}`); continue; }
          built += qs.length;
          ok(qs.length >= Math.min(count, fmt.minPerPack || 5), `${gid} × ${fmt.id}${kids ? ' (kids)' : ''} ${seed} d${difficulty}: built ${qs.length}/${count}`);
          for (const q of qs) {
            const refPacks = new Set((q.refs || []).map(r => String(r).split('/')[0]));
            ok(refPacks.size <= 1, `${gid} × ${fmt.id}: one pack per question (${[...refPacks].join(', ')}) "${q.prompt}"`);
            const [rp] = refPacks;
            if (!rp) continue;
            ok(parts.includes(rp), `${gid} × ${fmt.id}: question from a part of the genre (${rp})`);
            const pack = await loadPack(rp);
            for (const r of q.refs) {
              const iid = String(r).split('/')[1];
              if (iid.startsWith('q:')) continue;
              ok(inGenre.get(rp)?.has(iid), `${gid} × ${fmt.id}: ${r} is in the genre`);
              if (kids) {
                const it = pack.items.find(x => x.id === iid);
                ok(it && it.kids !== false, `${gid} × ${fmt.id} (kids): ${r} is a family item`);
              }
            }
          }
        }
      }
      if (!kids) row.push(`${fmt.id}:${built}`);
    }
  }
  // a Picture round plays only the parts with pictures (no fallback to the books pack's trivia)
  if (supportsPack(fmts.find(f => f.id === 'mc'), info) === true) {
    const spec = makeSpec('quick', [{ format: 'mc', packs: [gid], count: 10, difficulty: 0, opts: { source: 'pictures', answers: 4 } }], `pic:${g}`);
    const { questions: qs } = await buildQuestions(spec, { sparesRatio: 0.2 });
    ok(qs.length === 10 && qs.every(q => q.media?.img?.length || q.options?.every(o => o.img)), `${gid}: picture round is all pictures (${qs.filter(q => q.media?.img?.length || q.options?.every(o => o.img)).length}/${qs.length})`);
  }
  table.push(row.join(' '));
}
console.log(table.join('\n'));
console.log(`genre_test: ${checks - fails}/${checks} passed`);
if (fails) process.exit(1);
