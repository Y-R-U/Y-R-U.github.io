// js/dev/chars/voindex.js — the ledger's own save report, with the api and localStorage faked.
import { test, eq, ok } from '../../../tools/harness.mjs';
import { saveIndex } from './voindex.js';

const LS = 'wf.dev.vo.index';
const store = new Map();

// Every test file shares one process, so the stub goes in for the length of a test and comes back
// out — js/editor/store.test.mjs installs its own and whichever imported last would otherwise win.
async function withStorage(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  store.clear();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k) };
  try { return await fn(globalThis.localStorage); }
  finally { if (had) globalThis.localStorage = prev; else delete globalThis.localStorage; }
}

const doc = () => ({ version: 1, clips: { vail__idle__01: { who: 'vail', category: 'idle', i: 0,
  text: 'Bored now.', voice: 'bf_emma', hash: 'abcd1234' } } });

const api = save => ({ load: async () => ({ ok: false, missing: true }), save: async () => save });

test('a dev server that refuses the write is a failed save', () => withStorage(async () => {
  const r = await saveIndex(api({ ok: false, error: 'EACCES' }), doc());
  ok(r.ok === false, 'not ok — the file on disk is not what the tab is showing');
  ok(/EACCES/.test(r.error), 'the reason is in `error`, which barkui.js toasts');
  ok(/EACCES/.test(r.note), 'and in `note`');
  ok(store.get(LS), 'the draft is kept all the same');
  eq(r.where, 'local');
}));

test('no dev server at all is still a save', () => withStorage(async () => {
  const r = await saveIndex(api({ ok: false, offline: true, error: 'no dev server' }), doc());
  ok(r.ok === true && r.where === 'local', 'offline is the one local case that worked');
  ok(/no dev server/.test(r.note), 'and says why');
  ok(store.get(LS), 'the draft is in storage');
}));

test('a server write reports the path, and a doubly-failed write names both', () => withStorage(async ls => {
  const good = await saveIndex({ load: async () => ({ ok: false, missing: true }),
    save: async () => ({ ok: true, path: 'data/vo.json' }) }, doc());
  eq([good.ok, good.where, good.path], [true, 'server', 'data/vo.json']);

  ls.setItem = () => { throw new Error('QuotaExceeded'); };
  const bad = await saveIndex(api({ ok: false, error: 'EACCES' }), doc());
  ok(bad.ok === false && /EACCES/.test(bad.error) && /QuotaExceeded/.test(bad.error), 'both reasons');
}));

test('the report carries the validation problems of what was written', () => withStorage(async () => {
  const broken = { version: 1, clips: { vail__idle__01: { who: 'vail', category: 'nonsense', i: 0, text: 'x' } } };
  const r = await saveIndex(api({ ok: false, error: 'EACCES' }), broken);
  ok(r.problems.some(p => /unknown category nonsense/.test(p)), 'validateIndex ran');
}));
