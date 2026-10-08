#!/usr/bin/env node
// Favourite picks: store slots, sanitising against today's packs/options, matching and labels.
// Usage: node tools/fav_test.mjs
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k), clear: () => mem.clear(),
};
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.error('FAIL', msg); } };

const store = await imp('js/core/store.js');
const model = await imp('js/ui/favmodel.js');
const index = JSON.parse(readFileSync(new URL('../data/index.json', import.meta.url)));

const listen = {
  id: 'listen', packless: false, supports: info => (info.path || '').startsWith('music/') || info.theme === 'music' ? true : 'Needs music',
  options: [
    { key: 'clip', label: 'Clip length', type: 'choice', values: [1, 2, 5, 10, 15], labels: ['1s', '2s', '5s', '10s', '15s'], default: 5, kidsValues: [5, 10, 15], kidsDefault: 10 },
    { key: 'art', label: 'Album artwork', type: 'choice', values: ['off', 'blur', 'on'], labels: ['Off', 'Blurred', 'On'], default: 'off', kidsHide: true },
    { key: 'answers', label: 'Answers', type: 'choice', values: [2, 3, 4, 6], default: 4, kidsValues: [2, 3], kidsDefault: 3 },
    { key: 'hard', label: 'Tricky mode', type: 'bool', default: false },
  ],
};
const map = { id: 'mapclick', packless: true, supports: () => true, options: [{ key: 'zoom', label: 'Zoom', type: 'bool', default: true }] };

// storage keys + sync
ok(store.KEYS.favs === 'clued.favs', 'key is clued.favs');
ok(store.SYNCED.includes('clued.favs'), 'clued.favs is cloud-synced');
const contract = readFileSync(new URL('../docs/CONTRACT.md', import.meta.url), 'utf8');
ok(/`clued\.favs`\*/.test(contract), 'CONTRACT lists clued.favs as synced');

// slots
{
  mem.clear();
  ok(store.getFavs('listen').length === 5 && store.getFavs('listen').every(x => x === null), 'empty = 5 nulls');
  store.setFav('listen', 0, { packs: ['hits-1980s'], count: 10, opts: { clip: 2 } });
  store.setFav('listen', 2, { packs: 'all', count: 5, opts: {} });
  let f = store.getFavs('listen');
  ok(f[0]?.packs?.[0] === 'hits-1980s' && f[2]?.count === 5 && !f[1] && !f[3] && !f[4], 'slots 1 and 3 saved independently');
  ok(typeof f[0].at === 'number', 'saved fav is stamped');
  ok(store.getFavs('listen:kids').every(x => !x), 'kids slots separate');
  ok(store.getFavs('mc').every(x => !x), 'per-format slots');
  store.setFav('listen', 0, { packs: ['hits-1990s'], count: 20, opts: {} });
  ok(store.getFavs('listen')[0].packs[0] === 'hits-1990s' && store.getFavs('listen')[2].count === 5, 'overwrite keeps others');
  store.clearFav('listen', 2);
  f = store.getFavs('listen');
  ok(!f[2] && f[0], 'clear removes only that slot');
  store.setFav('listen', 7, { packs: 'all' });
  store.setFav('listen', -1, { packs: 'all' });
  ok(store.getFavs('listen').filter(Boolean).length === 1, 'out-of-range slots ignored');
  store.setFav('listen', 1, null); store.setFav('listen', 1, { packs: 'oops' });
  ok(!store.getFavs('listen')[1], 'invalid fav refused');
  store.clearFav('listen', 0);
  ok(!JSON.parse(mem.get('clued.favs')).slots.listen, 'empty format list pruned');
  ok(JSON.parse(mem.get('clued.favs')).v === 1, 'versioned root');
  for (const bad of ['garbage{', '[]', '{"slots":[1,2]}', '{"slots":{"listen":"x"}}', '{"slots":{"listen":[1,"a",null,{"packs":7}]}}', 'null']) {
    mem.set('clued.favs', bad);
    let threw = false, got;
    try { got = store.getFavs('listen'); store.setFav('listen', 0, { packs: 'all' }); } catch (e) { threw = true; }
    ok(!threw && got.length === 5 && got.every(x => x === null), `corrupt store survives: ${bad}`);
  }
}

// cleaning against today's packs and options
{
  const fav = { packs: ['hits-1980s', 'hits-1990s', 'deleted-pack', 'mammals'], count: 99, difficulty: 7, timer: 4, opts: { clip: 2, art: 'neon', answers: 6, ghost: 1, hard: true } };
  const c = model.cleanFav(fav, listen, index);
  ok(JSON.stringify(c.packs) === '["hits-1980s","hits-1990s"]', `missing/unsupported packs dropped: ${c.packs}`);
  ok(c.gone === 2, `gone counts dropped packs: ${c.gone}`);
  ok(c.count === 50 && c.difficulty === 0 && !('timer' in c), 'count clamped, bad difficulty/timer dropped');
  ok(c.opts.clip === 2 && c.opts.answers === 6 && c.opts.hard === true && !('art' in c.opts) && !('ghost' in c.opts), 'invalid/unknown opts dropped');
  const allGone = model.cleanFav({ packs: ['nope', 'nada'], opts: {} }, listen, index);
  ok(allGone.packs === 'all' && allGone.gone === 2, 'all packs gone -> All themes');
  const k = model.cleanFav({ packs: 'all', opts: { clip: 2, art: 'on', answers: 6 }, timer: 20 }, listen, index, { kids: true });
  ok(!('clip' in k.opts) && !('art' in k.opts) && !('answers' in k.opts) && k.timer === 20, 'kids restrictions applied');
  ok(model.cleanFav({ packs: ['hits-1980s'], opts: {} }, map, index).packs === 'all', 'packless ignores packs');
  ok(model.cleanFav(null, listen, index) === null && model.cleanFav('x', listen, index) === null, 'null-safe');
  let threw = false;
  try { model.cleanFav({ packs: [null, 5, {}], opts: 'x', count: 'ten' }, listen, index); model.favLabel({ packs: [3] }, listen, null); } catch (e) { threw = true; }
  ok(!threw, 'garbage never crashes');
}

// matching
{
  const saved = { packs: ['hits-1990s', 'hits-1980s'], count: 10, difficulty: 0, timer: 10, opts: { clip: 2 } };
  const snap = { packs: ['hits-1980s', 'hits-1990s'], count: 10, difficulty: 0, timer: 10, opts: { clip: 2, art: 'off', answers: 4, hard: false } };
  ok(model.sameFav(saved, snap, listen, index), 'order-insensitive match, defaults fill missing opts');
  ok(!model.sameFav(saved, { ...snap, opts: { ...snap.opts, clip: 5 } }, listen, index), 'opt difference = no match');
  ok(!model.sameFav(saved, { ...snap, packs: ['hits-1980s'] }, listen, index), 'pack difference = no match');
  ok(!model.sameFav(saved, { ...snap, count: 20 }, listen, index), 'count difference = no match');
  const { timer, ...noTimer } = snap;
  ok(model.sameFav({ ...saved, timer: 30 }, noTimer, listen, index), 'fields the screen hides are ignored');
  ok(!model.sameFav({ ...saved, timer: 30 }, snap, listen, index), 'shown timer compared');
}

// labels
{
  const L = f => model.favLabel(f, listen, index);
  ok(model.shortTitle('Hits of the 1980s') === '80s' && model.shortTitle('Hits of the 2000s') === '00s', 'decade short titles');
  const a = L({ packs: ['hits-1980s', 'hits-1990s'], count: 10, opts: { clip: 2 } });
  ok(a === '80s+90s · 2s clip', `label: ${a}`);
  const b = L({ packs: 'all', count: 20, difficulty: 3, opts: { art: 'blur', hard: true }, timer: 5 });
  ok(b === 'All themes · 20 Qs · Hard · Album: blurred · Tricky mode · 5s timer', `label: ${b}`);
  const music = index.themes.find(t => t.id === 'music');
  const real = music.packs.filter(id => index.packs[id] && !index.packs[id].virtual);
  const c = L({ packs: real, opts: {} });
  ok(c === 'Music', `full theme collapses to its name: ${c}`);
  const d = L({ packs: ['hits-1960s', 'hits-1970s', 'hits-1980s', 'hits-1990s'], opts: {} });
  ok(d === '60s+70s +2', `long lists shorten: ${d}`);
  ok(model.favLabel({ packs: 'all', opts: {} }, map, index) === 'Standard picks', 'packless default label');
  ok(model.favLabel({ packs: 'all', opts: { zoom: false } }, map, index) === 'No zoom', 'packless bool label');
  ok(model.favLabel({ packs: 'all', opts: { clip: 10, answers: 3 } }, listen, index, { kids: true }) === 'All themes', 'kids defaults omitted');
  ok(model.favLabel({ packs: 'all', opts: {}, timer: 0 }, listen, index, { timerDefault: 0 }) === 'All themes', 'timer matching the player default is omitted');
  ok(model.favLabel({ packs: 'all', opts: {}, timer: 0 }, listen, index) === 'All themes · No timer', 'timer off labelled');
  ok(model.favKey(listen, true) === 'listen:kids' && model.favKey(listen, false) === 'listen', 'fav keys');
}

// reveal (2026-10-08): only Full image / Zoom; old pixel/tiles favourites fall back to Full; the zoom timing labels with Zoom
{
  const reveal = (await imp('js/formats/reveal.js')).default;
  const L = f => model.favLabel(f, reveal, index);
  const old = model.cleanFav({ packs: 'all', opts: { mode: 'pixel', answers: 3 } }, reveal, index);
  ok(old && !('mode' in old.opts) && old.opts.answers === 3, `old pixel fav: mode dropped (→ Full), rest kept: ${JSON.stringify(old?.opts)}`);
  ok(L({ packs: 'all', opts: { mode: 'tiles' } }) === 'All themes', 'old tiles fav labels as the default');
  ok(L({ packs: 'all', opts: { mode: 'full', fullAt: 65 } }) === 'All themes', 'zoom timing hidden for Full');
  const z = L({ packs: 'all', opts: { mode: 'zoom', fullAt: 80 } });
  ok(z === 'All themes · Picture: zoom · full at 80%', `zoom label carries the timing: ${z}`);
  ok(L({ packs: 'all', opts: { mode: 'zoom', fullAt: 50 } }) === 'All themes · Picture: zoom · full at 50%', 'zoom 50%');
  ok(!model.sameFav({ packs: 'all', opts: { mode: 'zoom', fullAt: 50 } }, { packs: 'all', opts: { mode: 'zoom', fullAt: 90 } }, reveal, index), 'different timings are different picks');
}

console.log(`fav_test: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
