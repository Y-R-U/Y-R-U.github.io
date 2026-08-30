// node js/dev/data.test.mjs — the store as a pure module: no DOM, a fake api, a fake storage.
import { data, KINDS } from './data.js';

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('  FAIL', what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what} — got ${JSON.stringify(a)}`);

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}

function fakeApi(files = {}, { online = true } = {}) {
  const a = {
    saved: [], online: async () => online,
    load: async p => (online ? (p in files ? { ok: true, json: JSON.parse(files[p]) } : { ok: false, missing: true, error: 'not found' })
      : { ok: false, offline: true, error: 'no dev server' }),
    save: async (p, json) => {
      if (!online) return { ok: false, offline: true, error: 'no dev server' };
      files[p] = JSON.stringify(json, null, 2);
      a.saved.push(p);
      return { ok: true, path: p, bytes: files[p].length };
    },
    ls: async () => ({ ok: false, error: 'no' }),
    files,
  };
  return a;
}

async function fresh(opts) {
  const storage = fakeStorage();
  const api = fakeApi(opts?.files ?? {}, opts);
  data.configure({ api, storage, fetch: null, reset: true });
  return { api, storage };
}

// ── load ───────────────────────────────────────────────────────────────────
{
  const { api } = await fresh({ files: { 'data/characters.json': JSON.stringify({ version: 1, characters: { a: { name: 'A', body: 'none' } } }) } });
  const d = await data.load('characters');
  eq(d.characters.a.name, 'A', 'loads from the server');
  eq(data.source('characters'), 'server', 'source is server');
  ok(data.dirty('characters') === false, 'a freshly loaded doc is clean');

  await data.load('music');
  eq(data.source('music'), 'blank', 'a missing file falls back to the blank template');
  eq(data.get('music'), { version: 1, tracks: [], sets: [] }, 'blank music doc');
  ok(data.dirty('music') === true, 'a blank doc is dirty — it has never been written');
  void api;
}

// ── set / dirty / save ─────────────────────────────────────────────────────
{
  const { api } = await fresh({ files: { 'data/characters.json': JSON.stringify({ version: 1, characters: {} }) } });
  await data.load('characters');
  let heard = 0;
  const off = data.onChange('characters', () => heard++);
  data.mutate('characters', null, d => { d.characters.vail = { name: 'Vail', body: 'robed' }; });
  ok(heard === 1, 'onChange fired');
  ok(data.dirty('characters'), 'dirty after a mutate');
  const r = await data.save('characters');
  ok(r.ok && r.where === 'server', 'save landed on the server');
  ok(!data.dirty('characters'), 'clean after save');
  ok(JSON.parse(api.files['data/characters.json']).characters.vail.name === 'Vail', 'the bytes changed');
  off();
  data.mutate('characters', null, d => { d.characters.x = { name: 'X', body: 'none' }; });
  ok(heard === 1, 'unsubscribe works');
}

// ── setting the same value is not a change ─────────────────────────────────
{
  await fresh();
  await data.load('music');
  data.clearHistory();
  data.set('music', { version: 1, tracks: [], sets: [] });
  ok(data.canUndo() === false, 'an identical set records no history');
}

// ── undo / redo across the whole store ─────────────────────────────────────
{
  await fresh();
  await data.load('characters');
  await data.load('music');
  data.clearHistory();
  data.mutate('characters', null, d => { d.characters.a = { name: 'A', body: 'none' }; }, { label: 'add A' });
  data.mutate('music', null, d => { d.tracks.push({ id: 't1' }); }, { label: 'add track' });
  eq(data.get('music').tracks.length, 1, 'track added');
  data.undo();
  eq(data.get('music').tracks.length, 0, 'undo crossed back into music');
  ok(data.get('characters').characters.a, 'the characters edit is untouched');
  data.undo();
  ok(!data.get('characters').characters.a, 'second undo reached the other document');
  ok(data.canUndo() === false, 'stack empty');
  data.redo(); data.redo();
  eq(data.get('music').tracks.length, 1, 'redo replays both');
  ok(data.canRedo() === false, 'redo stack empty');
  data.mutate('music', null, d => { d.tracks.push({ id: 't2' }); });
  ok(data.canRedo() === false, 'a new edit clears the redo stack');
}

// ── coalescing ─────────────────────────────────────────────────────────────
{
  await fresh();
  await data.load('music');
  data.clearHistory();
  for (let i = 0; i < 20; i++) data.mutate('music', null, d => { d.sets = [{ id: 's', volume: i / 20 }]; }, { label: 'volume', coalesce: true });
  ok(data.historyLabels().length === 1, `20 coalesced drags are one undo (got ${data.historyLabels().length})`);
  data.undo();
  eq(data.get('music').sets, [], 'undo takes the whole drag back');
}

// ── offline: localStorage + the banner's raison d'être ─────────────────────
{
  const { storage } = await fresh({ online: false });
  await data.load('conversations');
  eq(data.source('conversations'), 'blank', 'offline with no draft starts blank');
  data.mutate('conversations', null, d => { d.nodes.hello = { lines: [{ who: 'a', text: 'hi' }] }; });
  const r = await data.save('conversations');
  ok(r.ok && r.where === 'local', 'offline save falls back to localStorage');
  ok(/no dev server/.test(r.note || ''), 'and says so');
  ok(storage.getItem('wf.dev.doc.conversations'), 'the draft is in storage');

  // Reload in a new session with the same storage: the draft comes back.
  data.configure({ api: { online: async () => false, load: async () => ({ ok: false, offline: true }), save: async () => ({ ok: false, offline: true }), ls: async () => ({ ok: false }) }, storage, fetch: null, reset: true });
  const back = await data.load('conversations');
  eq(back.nodes.hello.lines[0].text, 'hi', 'the draft survives a reload');
  eq(data.source('conversations'), 'local', 'source is local');
}

// ── a draft alongside a live server is flagged, not silently applied ───────
{
  const storage = fakeStorage();
  storage.setItem('wf.dev.doc.music', JSON.stringify({ at: Date.now(), doc: { version: 1, tracks: [{ id: 'draft' }], sets: [] } }));
  data.configure({ api: fakeApi({ 'data/music.json': JSON.stringify({ version: 1, tracks: [{ id: 'ondisk' }], sets: [] }) }), storage, fetch: null, reset: true });
  await data.load('music');
  eq(data.get('music').tracks[0].id, 'ondisk', 'the file wins while the server is up');
  ok(data.list().find(e => e.kind === 'music').staleDraft === true, 'the stale draft is flagged');
  data.applyDraft('music');
  eq(data.get('music').tracks[0].id, 'draft', 'and can be applied on purpose');
}

// ── save failure is reported, never swallowed ──────────────────────────────
{
  const storage = fakeStorage();
  const broken = { online: async () => true, load: async () => ({ ok: false, missing: true }),
    save: async () => ({ ok: false, error: 'EACCES' }), ls: async () => ({ ok: false }) };
  data.configure({ api: broken, storage, fetch: null, reset: true });
  await data.load('barks');
  const seen = [];
  data.onSave(r => seen.push(r));
  const r = await data.save('barks');
  ok(r.ok && r.where === 'local', 'a rejected server save still lands locally');
  ok(seen.length === 1 && seen[0].where === 'local', 'onSave saw it');
  ok(data.dirty('barks') === true, 'and the document stays dirty — the file did NOT change');
}

// ── revert ─────────────────────────────────────────────────────────────────
{
  await fresh({ files: { 'data/music.json': JSON.stringify({ version: 1, tracks: [{ id: 'a' }], sets: [] }) } });
  await data.load('music');
  data.mutate('music', null, d => { d.tracks = []; });
  data.revert('music');
  eq(data.get('music').tracks[0].id, 'a', 'revert restores the last saved bytes');
  ok(!data.dirty('music'), 'and is clean again');
}

// ── collections: one entry per level id ────────────────────────────────────
{
  await fresh({ files: { 'data/levels/hall.json': JSON.stringify({ version: 3, id: 'hall', name: 'Hall', objects: [], hotspots: [] }) } });
  await data.load('levels', 'hall');
  await data.load('levels', 'yard');
  eq(data.get('levels', 'hall').name, 'Hall', 'level loaded by id');
  eq(data.get('levels', 'yard').id, 'yard', 'a new level id gets a blank doc carrying its id');
  data.mutate('levels', 'yard', d => { d.hotspots.push({ id: 'hs.a', shape: { k: 'circle', x: 0, z: 0, r: 3 }, actions: [{ k: 'say', node: 'n' }] }); });
  ok(data.dirty('levels', 'yard') && !data.dirty('levels', 'hall'), 'dirty is per level');
  eq(data.dirtyKeys().sort(), ['levels:yard'], 'dirtyKeys names the collection entry');
  const r = await data.save('levels', 'yard');
  eq(r.path, 'data/levels/yard.json', 'saved to its own file');
}

// ── validation ─────────────────────────────────────────────────────────────
{
  await fresh();
  eq(data.validate('characters', { version: 1, characters: { a: { name: 'A' } } }), ['a: no body'], 'missing body');
  eq(data.validate('characters', { version: 1, characters: { a: { name: 'A', body: 'wobbly' } } }), ['a: body must be robed or none'], 'bad body');
  eq(data.validate('conversations', { version: 1, nodes: { a: { lines: [], choices: [{ goto: 'nope' }] } } }), ['a: choice goes to missing node nope'], 'dangling goto');
  eq(data.validate('music', { version: 1, tracks: [], sets: [{ id: 's', tracks: ['x'] }] }), ['set s: missing track x'], 'set names a missing track');
  eq(data.validate('levelIndex', [{ name: 'no id' }]), ['entry 0 has no id'], 'index entry with no id');
  eq(data.validate('levels', { id: 'l', hotspots: [{ id: 'h' }] }), ['hotspot h has neither shape nor attach'], 'hotspot with no placement');
  eq(data.validate('barks', { version: 1, shared: { nonsense: [] } }), ['unknown category nonsense'], 'bark category is a fixed set');
  ok(data.validate('levels', null).length === 1, 'null document');
  ok(Object.keys(KINDS).every(k => data.validate(k, undefined).length >= 0), 'no validator throws on undefined');
}

console.log(`data: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
