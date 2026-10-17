#!/usr/bin/env node
// Genres for the screen, book and theme-tune packs → data/genres.json (read by build_index and js/core/packs.js, which
// build the Genres theme's virtual packs from it). Pack rebuilds never touch it: items are keyed by pack + item id, and
// an item that disappears from its pack simply drops out of the genre.
//   1. every film / TV show / book is resolved to its Wikidata item (Wikipedia title from tools/c2_src, else
//      "Name (YEAR film)", "Name (film)", "Name" …), accepted only when the item's own year (films/TV) or author (books)
//      agrees with the pack;
//   2. its genres (P136) and kinds (P31) are mapped to our genres by RULES below; books also read their pack genre,
//      family films/shows their kids flag;
//   3. tools/genre_hand.json adds or drops genres by hand ({ "add": { "movies/jaws": ["horror"] }, "drop": {…} }).
// Movie/TV/Book Moments and the theme-tune packs inherit the genres of the same film, show or book.
//   node tools/genre_build.mjs [--offline]   (--offline: cache only)   report: tools/c2_reports/genres.txt
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(os.homedir(), '.cache/clued-genre');
fs.mkdirSync(CACHE, { recursive: true });
const OFFLINE = process.argv.includes('--offline');
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/; support@br8t.com)';

// Westerns were left out (13 films, 4 shows, 4 pictures: too few for most round types).
// adult: never in kids mode (the genre's packs are kidsSafe:false and every item in them kids:false)
export const GENRES = {
  scifi: { title: 'Sci-fi', icon: '🚀' },
  horror: { title: 'Horror', icon: '🧟', adult: true },
  fantasy: { title: 'Fantasy', icon: '🐉' },
  crime: { title: 'Crime & thrillers', icon: '🕵️', adult: true },
  comedy: { title: 'Comedy', icon: '😂' },
  family: { title: 'Family & animation', icon: '🧸' },
  war: { title: 'War', icon: '🪖', adult: true },
  romance: { title: 'Romance', icon: '💘' },
  superhero: { title: 'Superheroes', icon: '🦸' },
};
// Wikidata genre / kind labels → our genres; the first rule matching a label wins (the first rule ignores labels too broad
// to mean a genre: "thriller film" covers Jaws and Interstellar, "comedy drama" most dramas)
const RULES = [
  [/^(comedy drama|speculative fiction.*|monster film|ghost film|ghost story|supernatural film|thriller( film| television series)?|suspense film|action thriller|techno-thriller|erotic thriller|adult animated.*|satir.*|political satire|religious satire|menippean satire|chivalric romance|anime( film| television series)?)$/, []],
  [/space western/, ['scifi', 'western']],
  [/superhero/, ['superhero']],
  [/romantic comedy/, ['romance', 'comedy']],
  [/science fiction|sci-fi|space opera|cyberpunk|post-apocalyptic|apocalyptic|time.travel|alien invasion|tech.noir|biopunk|steampunk|kaiju|scientific romance|planetary romance|merveilleux scientifique|mecha|stitchpunk/, ['scifi']],
  [/comedy horror|horror comedy|zombie comedy/, ['horror', 'comedy']],
  [/horror|slasher|zombie|vampire|werewolf|splatter|satanic/, ['horror']],
  [/fantasy|sword and sorcery|wuxia/, ['fantasy']],
  [/crime|heist|gangster|mafia|detective|mystery|noir|police|legal (drama|fiction)|trial film|whodunit|\bspy\b|espionage|psychological thriller|political thriller|cloak and dagger|conspiracy|prison film/, ['crime']],
  [/sitcom|comedy|parody|farce|mockumentary|sketch|slapstick|humou?r|stand-up/, ['comedy']],
  [/\banimat|children's|family (film|television)|picture book|puppet/, ['family']],
  [/\bwar\b|military|holocaust/, ['war']],
  [/western/, ['western']],
  [/romance|romantic|love story|chick flick/, ['romance']],
];
const BOOK_GENRE = { 'science fiction': ['scifi'], horror: ['horror'], fantasy: ['fantasy'], mystery: ['crime'], thriller: ['crime'], romance: ['romance'], "children's": ['family'], 'picture book': ['family'] };

const SOURCES = [
  { pack: 'movies', dir: 'packs', kind: 'film', primary: true },
  { pack: 'tv', dir: 'packs', kind: 'tv', primary: true },
  { pack: 'books', dir: 'packs', kind: 'book', primary: true },
  { pack: 'movie-moments', dir: 'packs', kind: 'film' },
  { pack: 'tv-moments', dir: 'packs', kind: 'tv' },
  { pack: 'book-moments', dir: 'packs', kind: 'book' },
  { pack: 'screen-themes', dir: 'music', kind: it => (it.facts?.type === 'tv' ? 'tv' : 'film') },
  { pack: 'kids-film-tv', dir: 'music', kind: it => (it.facts?.type === 'tv' ? 'tv' : 'film') },
];

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the /, '').replace(/[^a-z0-9]+/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const load = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const WP_F = path.join(CACHE, 'wp.json'), WD_F = path.join(CACHE, 'wd.json'), LB_F = path.join(CACHE, 'labels.json');
const wp = load(WP_F), wd = load(WD_F), labels = load(LB_F);
const save = () => { fs.writeFileSync(WP_F, JSON.stringify(wp)); fs.writeFileSync(WD_F, JSON.stringify(wd)); fs.writeFileSync(LB_F, JSON.stringify(labels)); };

async function getJSON(u) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (r.ok) { await sleep(150); return r.json(); }
      await sleep(1500 * (i + 1));
    } catch { await sleep(1500 * (i + 1)); }
  }
  throw new Error(`fetch failed ${u}`);
}

// Wikipedia titles → { qid, desc } (null = no page), via redirects
async function wpLookup(titles) {
  const todo = [...new Set(titles)].filter(t => !(t in wp));
  if (OFFLINE) return;
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item|wikibase-shortdesc|disambiguation&titles=${encodeURIComponent(part.join('|'))}`);
    const q = j.query || {};
    const map = new Map(part.map(t => [t, t]));
    for (const n of q.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of q.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const pages = Object.values(q.pages || {});
    for (const [t, final] of map) {
      const p = pages.find(x => x.title === final);
      wp[t] = p && !p.missing && p.pageprops?.wikibase_item && !('disambiguation' in (p.pageprops || {})) ? { qid: p.pageprops.wikibase_item, desc: p.pageprops['wikibase-shortdesc'] || '', title: final } : null;
    }
    process.stdout.write(`\r  wikipedia ${Math.min(i + 50, todo.length)}/${todo.length}`);
  }
  if (todo.length) process.stdout.write('\n');
  save();
}

const ids = (e, p) => (e?.claims?.[p] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const years = (e, ps) => ps.flatMap(p => (e?.claims?.[p] || []).map(c => +String(c.mainsnak?.datavalue?.value?.time || '').slice(1, 5)).filter(Boolean));
async function wdLookup(qids) {
  const todo = [...new Set(qids)].filter(q => !(q in wd));
  if (OFFLINE) return;
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels&languages=en&ids=${part.join('|')}`);
    for (const [q, e] of Object.entries(j.entities || {})) {
      wd[q] = { label: e.labels?.en?.value || '', p136: ids(e, 'P136'), p31: ids(e, 'P31'), p50: ids(e, 'P50'), y: years(e, ['P577', 'P580']) };
    }
    process.stdout.write(`\r  wikidata ${Math.min(i + 50, todo.length)}/${todo.length}`);
  }
  if (todo.length) process.stdout.write('\n');
  save();
}
async function labelLookup(qids) {
  const todo = [...new Set(qids)].filter(q => !(q in labels));
  if (OFFLINE) return;
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${part.join('|')}`);
    for (const [q, e] of Object.entries(j.entities || {})) labels[q] = e.labels?.en?.value || q;
  }
  save();
}

// display name → Wikipedia title from the c2 sources
async function sourceTitles() {
  const out = { film: new Map(), tv: new Map(), book: new Map() };
  const rows = s => String(s || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).map(l => l.split('|'));
  const imp = async f => import(pathToFileURL(path.join(ROOT, 'tools/c2_src', f)).href).catch(() => ({}));
  const { FILMS_MORE } = await imp('films_more.mjs');
  for (const [t] of rows(FILMS_MORE)) { const [wt, disp] = t.split('='); out.film.set(norm(disp || wt.replace(/\s*\([^)]*\)$/, '')), wt); }
  const { SHOWS } = await imp('tv.mjs'), { SHOWS_MORE } = await imp('tv_more.mjs');
  for (const r of [...rows(SHOWS), ...rows(SHOWS_MORE)]) if (r[1]) out.tv.set(norm(r[1]), r[0]);
  const { BOOKS } = await imp('books.mjs'), { BOOKS_MORE } = await imp('books_more.mjs');
  for (const r of [...rows(BOOKS), ...rows(BOOKS_MORE)]) if (r[1]) out.book.set(norm(r[1]), r[0]);
  return out;
}

const KIND_RE = { film: /\bfilm\b|\bmovie\b/i, tv: /television|\btv\b|series|sitcom|soap|programme|show|anime/i, book: /novel|book|novella|story|stories|poem|play|memoir|fiction|series|children|fable|tale/i };
const surname = a => String(a || '').split(/,| and | & /)[0].trim().split(/\s+/).pop().toLowerCase();

function candidates(w, titles) {
  const n = w.name, y = w.year;
  const known = titles[w.kind].get(norm(n));
  if (w.kind === 'film') return [known, y && `${n} (${y} film)`, `${n} (film)`, n].filter(Boolean);
  if (w.kind === 'tv') return [known, y && `${n} (${y} TV series)`, `${n} (TV series)`, `${n} (American TV series)`, `${n} (British TV series)`, n].filter(Boolean);
  const s = w.author ? String(w.author).split(/\s+/).pop() : '';
  return [known, `${n} (novel)`, s && `${n} (${s} novel)`, `${n} (book)`, n].filter(Boolean);
}
function accept(w, hit) {
  if (!hit) return false;
  const e = wd[hit.qid];
  if (!e) return false;
  if (!KIND_RE[w.kind].test(hit.desc) && !(w.kind === 'book' && w.author && hit.desc.toLowerCase().includes(surname(w.author)))) return false;
  if (w.kind === 'book') {
    if (!w.author) return true;
    const authors = e.p50.map(q => (labels[q] || '').toLowerCase());
    return authors.some(a => a.includes(surname(w.author))) || hit.desc.toLowerCase().includes(surname(w.author));
  }
  if (!w.year) return true;
  const slack = w.kind === 'tv' ? 2 : 1;
  return e.y.some(y => Math.abs(y - w.year) <= slack) || new RegExp(`\\b${w.year}\\b`).test(hit.desc);
}

function mapLabels(qs) {
  const out = new Set(), why = [];
  for (const q of qs) {
    const l = (labels[q] || '').toLowerCase();
    for (const [re, gs] of RULES) if (re.test(l)) { gs.forEach(g => out.add(g)); if (gs.length) why.push(l); break; }
  }
  return { genres: out, why };
}

async function main() {
  const packs = {};
  for (const s of SOURCES) packs[s.pack] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', s.dir, s.pack + '.json'), 'utf8'));
  // works: one per film / show / book; the primary pack's item names it
  const works = [], byKey = new Map();
  const yearOf = it => +it.facts?.year || null;
  for (const s of SOURCES.filter(s => s.primary)) {
    for (const it of packs[s.pack].items) {
      const w = { key: `${s.pack}/${it.id}`, kind: s.kind, name: it.name, year: yearOf(it), author: it.facts?.author, kids: it.facts?.kids === true, bookGenre: [].concat(it.facts?.genre || []), members: [[s.pack, it.id]] };
      works.push(w);
      byKey.set(`${s.kind}:${it.id}`, w);
      byKey.set(`${s.kind}:${norm(it.name)}:${w.year}`, w);
      if (!byKey.has(`${s.kind}:${norm(it.name)}`)) byKey.set(`${s.kind}:${norm(it.name)}`, w);
    }
  }
  for (const s of SOURCES.filter(s => !s.primary)) {
    for (const it of packs[s.pack].items) {
      const kind = typeof s.kind === 'function' ? s.kind(it) : s.kind, y = yearOf(it);
      const near = w => w && (!y || !w.year || Math.abs(w.year - y) <= 1);
      let w = [byKey.get(`${kind}:${it.id}`), byKey.get(`${kind}:${norm(it.name)}:${y}`), byKey.get(`${kind}:${norm(it.name)}`)].find(near);
      if (!w) {
        w = { key: `${s.pack}/${it.id}`, kind, name: it.name, year: y, author: it.facts?.author, kids: it.facts?.kids === true, bookGenre: [], members: [] };
        works.push(w);
      }
      w.members.push([s.pack, it.id]);
      if (it.facts?.kids === true) w.kids = true;
    }
  }
  const titles = await sourceTitles();
  await wpLookup(works.flatMap(w => candidates(w, titles)));
  await wdLookup(works.flatMap(w => candidates(w, titles).map(t => wp[t]?.qid).filter(Boolean)));
  await labelLookup(works.flatMap(w => candidates(w, titles).flatMap(t => (wp[t] ? wd[wp[t].qid]?.p50 || [] : []))));
  for (const w of works) {
    const t = candidates(w, titles).find(t => accept(w, wp[t]));
    w.qid = t ? wp[t].qid : null;
    w.title = t ? wp[t].title : null;
  }
  await labelLookup(works.flatMap(w => (w.qid ? [...wd[w.qid].p136, ...wd[w.qid].p31] : [])));

  const hand = load(path.join(ROOT, 'tools/genre_hand.json'));
  const report = [], unresolved = [];
  for (const w of works) {
    const e = w.qid ? wd[w.qid] : null;
    const { genres, why } = mapLabels(e ? [...e.p136, ...e.p31] : []);
    for (const g of w.bookGenre) for (const x of BOOK_GENRE[g] || []) { genres.add(x); why.push(`pack:${g}`); }
    if (w.kids) { genres.add('family'); why.push('kids flag'); }
    for (const g of hand.add?.[w.key] || []) { genres.add(g); why.push(`hand+${g}`); }
    for (const g of hand.drop?.[w.key] || []) { genres.delete(g); why.push(`hand-${g}`); }
    // a family film is never horror (Coraline, Ghostbusters II stay family): hand-add it to be both
    if (genres.has('horror') && genres.has('family') && !(hand.add?.[w.key] || []).includes('horror')) { genres.delete('horror'); why.push('family≠horror'); }
    w.genres = [...genres].filter(g => GENRES[g]).sort();
    if (!w.qid) unresolved.push(w);
    report.push(`${w.key.padEnd(48)} ${(w.qid || '—').padEnd(11)} [${w.genres.join(',')}]  ${e ? e.p136.map(q => labels[q]).join('; ') : ''}${why.length ? `  {${why.filter(x => /^(pack|kids|hand|family)/.test(x)).join('; ')}}` : ''}`);
  }
  const out = { note: 'Built by tools/genre_build.mjs; hand fixes in tools/genre_hand.json.', genres: GENRES, packs: {} };
  for (const s of SOURCES) out.packs[s.pack] = Object.fromEntries(Object.keys(GENRES).map(g => [g, []]));
  for (const w of works) for (const [p, id] of w.members) for (const g of w.genres) out.packs[p][g].push(id);
  for (const p of Object.values(out.packs)) for (const g of Object.keys(p)) { p[g] = [...new Set(p[g])].sort(); if (!p[g].length) delete p[g]; }
  fs.writeFileSync(path.join(ROOT, 'data/genres.json'), JSON.stringify(out) + '\n');
  const counts = ['', ...Object.keys(GENRES).map(g => `${g.padEnd(10)} ${SOURCES.map(s => `${s.pack}:${out.packs[s.pack][g]?.length || 0}`).join('  ')}`)];
  fs.mkdirSync(path.join(ROOT, 'tools/c2_reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tools/c2_reports/genres.txt'), [`${works.length} works, ${unresolved.length} not found on Wikidata: ${unresolved.map(w => w.key).join(', ')}`, ...counts, '', ...report].join('\n') + '\n');
  console.log(`genre_build: ${works.length} works, ${unresolved.length} unresolved → data/genres.json, tools/c2_reports/genres.txt`);
  console.log(counts.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
