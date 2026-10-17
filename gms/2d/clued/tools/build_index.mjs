#!/usr/bin/env node
// Validates every data/packs/*.json and data/music/*.json and writes data/index.json (CONTRACT.md). Packs with errors are left out and the exit code is 1.
// It also runs every registered format's generate() against every pack (seeded) and records how many questions each
// can really make in caps.formats / formatsEasy / formatsKids, so the picker only offers pairs that work.
// General-knowledge questions are also split by tag into virtual packs ("general~science") listed under that theme.
// Usage: node tools/build_index.mjs [--quiet] [--strict] [--nogen]   (--strict also fails on warnings)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES, validatePack, packCaps } from './c1_schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet'), strict = process.argv.includes('--strict'), nogen = process.argv.includes('--nogen');
const GEN_COUNT = 20, VIRTUAL_MIN = 12;
const { virtualView } = await import(pathToFileURL(join(ROOT, 'js/core/packs.js')).href);
// a pack can be listed under more themes than its own (the theme picker shows it in each); `people` is offered through
// its sub-categories (people~science …) and "All famous people" (people~all) instead of on its own
const ALSO_IN = { actors: ['people'], directors: ['screen'] };
const UNLISTED = new Set(['people']);
const THEME_ORDER = { people: ['people~all', 'actors', 'directors', 'people~music', 'people~science', 'people~literature', 'people~sport', 'leaders', 'explorers'] };

const THEME_META = {
  animals: ['Animals', '🦁'], nature: ['Nature', '🌿'], geography: ['Geography', '🌍'], screen: ['Screen', '🎬'],
  music: ['Music', '🎵'], books: ['Books & words', '📚'], genres: ['Genres', '🎭'], people: ['People', '🧑'], science: ['Science', '🔬'],
  art: ['Art', '🎨'], history: ['History', '🏛️'], sport: ['Sport', '⚽'], food: ['Food & drink', '🍜'],
  general: ['General knowledge', '💡'], kids: ['Kids', '🧸'],
};

const list = dir => { try { return readdirSync(join(ROOT, 'data', dir)).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort().map(f => `${dir}/${f}`); } catch { return []; } };
// packs/*.json (C1/C2) plus music/*.json (AU); `path` tells the loader where each lives
const files = [...list('packs'), ...list('music')];
const allErr = [], allWarn = [];
const packs = {};
const loaded = new Map();
const byTheme = Object.fromEntries(THEMES.map(t => [t, []]));

for (const f of files) {
  const id = f.replace(/^.*\//, '').replace(/\.json$/, '');
  if (packs[id]) { allErr.push(`pack ${id}: duplicate id (${f} and ${packs[id].path})`); continue; }
  let pack;
  try { pack = JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')); }
  catch (e) { allErr.push(`pack ${id}: invalid JSON (${e.message})`); continue; }
  const { errors, warnings } = validatePack(pack, id);
  allErr.push(...errors); allWarn.push(...warnings);
  if (errors.length) continue;
  addPack(id, f, pack);
  if (id === 'general') {
    // general~<theme>: the general questions tagged with that theme, offered inside the theme's tree
    const tags = {};
    for (const q of pack.questions || []) for (const t of q.tags || []) if (t !== 'general' && byTheme[t]) tags[t] = (tags[t] || 0) + 1;
    for (const [t, n] of Object.entries(tags)) {
      if (n < VIRTUAL_MIN) continue;
      const vid = `general~${t}`;
      const view = virtualPack(pack, t, THEME_META[t][0]);
      addPack(vid, f, view, { virtual: { of: 'general', tag: t } });
    }
  }
  // people~<group>: the sub-categories a pack declares (tools/c2_people_add.mjs GROUP_PACKS)
  for (const [g, meta] of Object.entries(pack.groupPacks || {})) {
    const v = { of: id, group: g };
    const view = virtualView(`${id}~${g}`, v, [pack], meta);
    if ((view.items || []).length < VIRTUAL_MIN) { allWarn.push(`pack ${id}~${g}: only ${view.items.length} items, not offered`); continue; }
    addPack(`${id}~${g}`, f, view, { virtual: v });
  }
}
// merged views (people~all) need their packs loaded first
for (const [id, pack] of [...loaded]) {
  const m = pack.mergePack;
  if (!m || packs[id].virtual) continue;
  const bases = m.of.map(x => loaded.get(x)).filter(Boolean);
  if (bases.length !== m.of.length) { allErr.push(`pack ${m.id}: missing ${m.of.filter(x => !loaded.has(x)).join(', ')}`); continue; }
  const v = { merge: m.of };
  addPack(m.id, packs[id].path, virtualView(m.id, v, bases, m), { virtual: v });
}
// Genres (data/genres.json, tools/genre_build.mjs): movies~scifi … one view per source pack, unlisted, and genre~scifi
// listed under Genres, which plays them all (each as its own pack, so wrong answers stay within a pack)
const GENRE_PART_MIN = 4;
const PART_NOUN = { movies: 'films', 'movie-moments': 'film pictures', tv: 'TV', 'tv-moments': 'TV pictures', books: 'books', 'book-moments': 'book pictures', 'screen-themes': 'theme tunes', 'kids-film-tv': 'film & TV songs' };
const genres = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data/genres.json'), 'utf8')); } catch { return null; } })();
for (const [g, meta] of Object.entries(genres?.genres || {})) {
  const parts = [];
  for (const [of, byG] of Object.entries(genres.packs || {})) {
    const base = loaded.get(of);
    if (!base || !byG[g]) continue;
    const id = `${of}~${g}`, v = { of, genre: g };
    const view = virtualView(id, v, [base], { title: PART_NOUN[of] ? `${meta.title} ${PART_NOUN[of]}` : `${meta.title}: ${base.title}`, genreIds: byG[g], adult: !!meta.adult });
    if (view.items.length < GENRE_PART_MIN) continue;
    addPack(id, packs[of].path, view, { virtual: v, ...(meta.adult ? { kidsSafe: false } : {}) }, { listed: false });
    parts.push(id);
  }
  if (!parts.length) continue;
  const v = { parts };
  const view = virtualView(`genre~${g}`, v, parts.map(id => loaded.get(id)), meta);
  addPack(`genre~${g}`, 'genres.json', view, { virtual: v, ...(meta.adult ? { kidsSafe: false } : {}) });
}
for (const [id, ts] of Object.entries(ALSO_IN)) if (packs[id]) for (const t of ts) if (!byTheme[t].includes(id)) byTheme[t].push(id);
for (const [t, order] of Object.entries(THEME_ORDER)) {
  const at = id => (order.includes(id) ? order.indexOf(id) : order.length);
  byTheme[t].sort((a, b) => at(a) - at(b));
}

function virtualPack(pack, tag, title) {
  return { ...pack, id: `general~${tag}`, title: `${title} questions`, theme: tag, questions: (pack.questions || []).filter(q => (q.tags || []).includes(tag)) };
}

function extraCaps(pack) {
  const items = pack.items || [];
  const fm = pack.factsMeta || {};
  const multi = Object.entries(fm).filter(([, m]) => m.type === 'cat' && m.exclusive === false).map(([k]) => k);
  const catBins = {};
  for (const [k, m] of Object.entries(fm)) {
    if (m.type !== 'cat' || m.exclusive === false) continue;
    const c = {};
    for (const it of items) { const v = it.facts?.[k]; if (v != null && !Array.isArray(v)) c[v] = (c[v] || 0) + 1; }
    const bins = Object.values(c).filter(n => n >= 4).length;
    if (bins) catBins[k] = bins;
  }
  return { multi, catBins, firstLines: items.filter(i => i.firstLine).length };
}

function addPack(id, f, pack, extra = {}, { listed = true } = {}) {
  const caps = packCaps(pack);
  const x = extraCaps(pack);
  caps.multi = x.multi;
  caps.catBins = x.catBins;
  caps.quotes = (caps.quotes || 0) + x.firstLines;
  packs[id] = {
    path: f, title: pack.title, theme: pack.theme, icon: pack.icon, kids: !!pack.kids,
    ...(ALSO_IN[id] ? { alsoIn: ALSO_IN[id] } : {}),
    items: (pack.items || []).length, questions: (pack.questions || []).length,
    ...(pack.notice ? { notice: pack.notice } : {}),
    ...(pack.kidsSafe === false ? { kidsSafe: false } : {}),
    ...extra,
    caps,
  };
  loaded.set(id, pack);
  if (!listed) return;
  if (!UNLISTED.has(id)) byTheme[pack.theme].push(id);
  if (pack.kids && pack.theme !== 'kids' && !extra.virtual) byTheme.kids.push(id);
}

if (!nogen) await formatCaps();

// Node can't fetch file: URLs, which the geo formats use for their data at import time; serve them from disk.
async function formatCaps() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    const s = String(u?.url || u);
    if (!s.startsWith('file:')) return realFetch(u, o);
    try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200, headers: { 'content-type': 'application/json' } }); }
    catch { return new Response('', { status: 404 }); }
  };
  const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
  const { MODULES } = await import(js('formats/index.js'));
  for (const m of MODULES) {
    try { await import(new URL(m, js('formats/index.js')).href); } catch (e) { allWarn.push(`format ${m}: failed to import in node (${e.message}); caps.formats skips it`); }
  }
  const reg = await import(js('formats/registry.js'));
  const { rngFrom } = await import(js('core/rng.js'));
  const { kidsView, partOk } = await import(js('core/spec.js'));
  const fmts = reg.listFormats().filter(f => !f.packless);
  const t0 = Date.now();
  for (const [id, info] of Object.entries(packs)) {
    const pack = loaded.get(id);
    const kv = info.kidsSafe === false ? null : kidsView(pack);
    const out = { formats: {}, formatsEasy: {}, formatsKids: {} };
    for (const fmt of fmts) {
      if (reg.supportsPack(fmt, { id, ...info }) !== true) continue;
      // a genre plays the parts this format can use (spec.js partsFor), each as its own pack
      const ps = (p, kids) => (info.virtual?.parts ? info.virtual.parts.filter(pid => partOk(fmt, packs[pid], kids)).map(pid => (kids ? kidsView(loaded.get(pid)) : loaded.get(pid))) : [p]);
      const run = (p, difficulty, kids) => {
        if (!p || (p.items || []).length + (p.questions || []).length === 0 || !ps(p, kids).length) return 0;
        const opts = reg.defaultOpts(fmt);
        if (kids) for (const o of fmt.options || []) if (o.kidsDefault != null) opts[o.key] = o.kidsDefault;
        try {
          const list = fmt.generate({ rng: rngFrom(`caps:${id}:${fmt.id}:${difficulty}:${kids}`), packs: ps(p, kids), count: GEN_COUNT, opts, difficulty, kids, avoid: new Set(), round: 0, spec: { seed: 'caps' } }) || [];
          return new Set(list.map(q => q.id)).size;
        } catch (e) { allWarn.push(`format ${fmt.id} on ${id}: generate threw (${e.message})`); return 0; }
      };
      out.formats[fmt.id] = run(pack, 0, false);
      out.formatsEasy[fmt.id] = run(pack, 1, false);
      out.formatsKids[fmt.id] = kv ? run(kv, 1, true) : 0;
    }
    Object.assign(info.caps, out);
  }
  globalThis.fetch = realFetch;
  if (!quiet) console.log(`build_index: format caps for ${fmts.length} formats × ${Object.keys(packs).length} packs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const index = {
  build: new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''),
  themes: THEMES.filter(t => byTheme[t].length).map(t => ({ id: t, title: THEME_META[t][0], icon: THEME_META[t][1], packs: byTheme[t] })),
  packs,
};

if (!quiet || allErr.length) {
  for (const w of allWarn.slice(0, quiet ? 0 : 60)) console.warn('warn:', w);
  if (allWarn.length > 60 && !quiet) console.warn(`… ${allWarn.length - 60} more warnings`);
  for (const e of allErr) console.error('ERROR:', e);
}
// Broken packs are left out of the index (so one lane can't block the rest) but the run still fails.
writeFileSync(join(ROOT, 'data/index.json'), JSON.stringify(index, null, 1) + '\n');
const skipped = files.map(f => f.replace(/^.*\//, '').replace(/\.json$/, '')).filter(id => !packs[id]);
console.log(`build_index: ${Object.keys(packs).length} packs indexed${skipped.length ? `, SKIPPED (errors): ${skipped.join(', ')}` : ''}; ${allErr.length} error(s), ${allWarn.length} warning(s) → data/index.json`);
if (allErr.length || (strict && allWarn.length)) process.exit(1);
