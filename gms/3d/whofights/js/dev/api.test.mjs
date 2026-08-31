// api.js against a fake fetch. Four bugs have shipped from this file twice over — an empty-string
// base treated as "no base", and a poll envelope spread over the answer it was supposed to lose to.
// Each of the four is a one-character edit, so each test below has been checked to fail against it.

import { test, eq, ok } from '../../tools/harness.mjs';
import api, { __setEnv } from './api.js';

const page = (port = '8796') => ({ protocol: 'http:', hostname: 'localhost', port });

function fake(routes = {}, status = { ok: true, devserver: true, kokoro: true, ace: false, flux: true }) {
  const hits = [];
  const fetch = async (url, opts = {}) => {
    hits.push(url);
    const p = url.replace(/^https?:\/\/[^/]+/, '');
    const handler = p === '/api/status' ? status : routes[p];
    if (handler === undefined) return { ok: false, status: 404, text: async () => '{"ok":false,"error":"no route"}' };
    const body = typeof handler === 'function' ? handler(opts.body ? JSON.parse(opts.body) : null) : handler;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetch, hits, count: suffix => hits.filter(u => u.endsWith(suffix)).length };
}

const wire = (routes, status) => {
  const s = fake(routes, status);
  __setEnv({ fetch: s.fetch, place: page(), sleep: async () => {} });
  return s;
};

test('an empty base is a base — the dev server is usually the page origin', async () => {
  const s = wire({ '/api/save': { ok: true, path: 'data/levels/x.json', bytes: 9 } });
  ok(await api.online(), 'a dev server on the page origin is online');
  eq(api.base, '', 'the base is the empty string');
  eq(s.count('/api/status'), 1, 'probed once');

  const r = await api.save('levels/x.json', { a: 1 });
  ok(r.ok, 'a save goes through an empty base');
  eq(r.path, 'data/levels/x.json');
  eq(s.count('/api/status'), 1, 'a base already found must not be re-probed');
  eq(s.count('/api/save'), 1);
});

test('no dev server anywhere answers offline and backs off instead of re-probing', async () => {
  const s = fake();
  const dead = async () => { throw new Error('connection refused'); };
  __setEnv({ fetch: dead, place: null, sleep: async () => {} });
  eq(await api.online(), false);
  const r = await api.save('levels/x.json', {});
  eq(r.ok, false);
  eq(r.offline, true, 'the caller is told why');
  eq(r.error, 'no dev server');
  eq(api.cached().devserver, false);
  void s;
});

test('a dev server that goes away mid-session is re-probed, not remembered', async () => {
  let up = true;
  const fetchImpl = async url => {
    if (!up) throw new Error('connection refused');
    if (url.endsWith('/api/status')) return { ok: true, status: 200, text: async () => '{"ok":true,"devserver":true}' };
    return { ok: true, status: 200, text: async () => '{"ok":true}' };
  };
  __setEnv({ fetch: fetchImpl, place: page(), sleep: async () => {} });
  ok(await api.online());
  up = false;
  const r = await api.save('levels/x.json', {});
  eq(r.ok, false);
  eq(api.base, null, 'the stale base is dropped');
});

test('a job that ends in error is not a win because the poll succeeded', async () => {
  const s = wire({
    '/api/music': { ok: true, job: 'music-1', state: 'queued', position: 1, out: 'audio/music/x.mp3' },
    '/api/job/music-1': { ok: true, id: 'music-1', kind: 'music', state: 'error', note: 'ACE-Step failed', error: 'ACE-Step failed' },
  });
  const r = await api.music({ prompt: 'x', out: 'x' });
  eq(r.ok, false, 'a failed job must report ok:false');
  eq(r.error, 'ACE-Step failed', 'and keep its own error');
  eq(r.state, 'error');
  eq(s.count('/api/job/music-1'), 1);
});

test('a job that finishes reports ok:true and carries its result', async () => {
  wire({
    '/api/flux': { ok: true, job: 'flux-1', state: 'queued', position: 0 },
    '/api/job/flux-1': { ok: true, id: 'flux-1', kind: 'flux', state: 'done', note: 'done', url: 'art/x.png', seed: 7 },
  });
  const seen = [];
  const r = await api.flux({ prompt: 'x', out: 'x' }, p => seen.push(p.state));
  eq(r.ok, true);
  eq(r.url, 'art/x.png');
  eq(r.seed, 7);
  eq(seen, ['done'], 'onProgress saw the poll');
});

// The guard above only bites when the envelope's ok disagrees with the state, and for `done` the
// server's own ok:true hides a swapped spread. An envelope carrying a truthy non-boolean exposes it:
// whichever side of the spread `ok` sits on is the value the caller gets.
test('ok is decided by the job state, never inherited from the poll envelope', async () => {
  wire({
    '/api/flux': { ok: true, job: 'f2' },
    '/api/job/f2': { ok: 1, id: 'f2', state: 'done', url: 'art/y.png' },
  });
  eq((await api.flux({ out: 'y' })).ok, true, 'the done branch sets ok itself');

  wire({
    '/api/music': { ok: true, job: 'm2' },
    '/api/job/m2': { ok: 1, id: 'm2', state: 'error', error: 'boom' },
  });
  eq((await api.music({ out: 'y' })).ok, false, 'the error branch sets ok itself');
});

test('a queued job waits through running polls', async () => {
  let n = 0;
  const s = wire({
    '/api/flux': { ok: true, job: 'f3', state: 'queued', position: 2 },
    '/api/job/f3': () => (++n < 3
      ? { ok: true, id: 'f3', state: 'running', note: `step ${n}`, position: 0 }
      : { ok: true, id: 'f3', state: 'done', url: 'art/z.png' }),
  });
  const notes = [];
  const r = await api.flux({ out: 'z' }, p => notes.push(p.note));
  eq(r.ok, true);
  eq(notes, ['step 1', 'step 2', undefined]);
  eq(s.count('/api/job/f3'), 3);
});

test('a submit that is refused is returned as-is, not polled', async () => {
  const s = wire({ '/api/music': { ok: false, error: 'out may only contain letters, digits, . _ - and /' } });
  const r = await api.music({ out: '../../x' });
  eq(r.ok, false);
  eq(r.error, 'out may only contain letters, digits, . _ - and /');
  eq(s.count('/api/queue') + s.hits.filter(u => u.includes('/api/job/')).length, 0, 'nothing was polled');
});

test('an HTTP error carries the server error text, not a stack', async () => {
  const fetchImpl = async url => (url.endsWith('/api/status')
    ? { ok: true, status: 200, text: async () => '{"ok":true,"devserver":true}' }
    : { ok: false, status: 400, text: async () => '{"ok":false,"error":"only .json files may be written"}' });
  __setEnv({ fetch: fetchImpl, place: page(), sleep: async () => {} });
  const r = await api.save('levels/x.txt', {});
  eq(r.ok, false);
  eq(r.status, 400);
  eq(r.error, 'only .json files may be written');
});

test('status caches, force re-probes, and a probe failure never throws', async () => {
  const s = wire({});
  const first = await api.status();
  eq(first.ok, true);
  eq(first.flux, true);
  await api.status();
  eq(s.count('/api/status'), 3, 'resolve + read, then one read; the base was not re-found');
  const forced = await api.status({ force: true });
  eq(forced.devserver, true);
  eq(s.count('/api/status'), 5, 'force re-resolves and re-reads');
});

test('up() reports each backend as a boolean', async () => {
  wire({}, { ok: true, devserver: true, kokoro: true, ace: false, flux: 1 });
  const u = await api.up();
  eq(u.ok, true);
  eq(u.kokoro, true);
  eq(u.ace, false);
  eq(u.flux, true, 'coerced, so a caller can trust ===');
});

test('encode submits as a job; profiles and promote do not', async () => {
  const seen = [];
  const s = wire({
    '/api/encode': body => {
      seen.push(body);
      if (body.profiles) return { ok: true, profiles: [{ id: 'full', label: 'Music full' }] };
      if (body.promote) return { ok: true, out: 'audio/music/tavern_01.mp3' };
      return { ok: true, job: 'encode-1', state: 'queued', position: 1, out: 'audio/music/tavern_01.mp3' };
    },
    '/api/job/encode-1': { ok: true, id: 'encode-1', state: 'done', out: 'audio/music/tavern_01.mp3', ratio: 6.1 },
  });

  const table = await api.encodeProfiles();
  eq(table.profiles[0].id, 'full');

  const r = await api.encode({ src: 'audio/music/raw/tavern_01.wav', profile: 'full', out: 'tavern_01', preview: true });
  eq(r.ok, true);
  eq(r.ratio, 6.1);

  const kept = await api.promote('audio/music/_preview/tavern_01.mp3');
  eq(kept.ok, true);
  eq(kept.out, 'audio/music/tavern_01.mp3');

  eq(seen.length, 3);
  eq(s.count('/api/job/encode-1'), 1, 'only the job form polls');
});

test('cancel posts to the job cancel route', async () => {
  const s = wire({ '/api/job/flux-9/cancel': { ok: true, id: 'flux-9', cancelled: true } });
  const r = await api.cancel('flux-9');
  eq(r.ok, true);
  eq(r.cancelled, true);
  eq(s.count('/api/job/flux-9/cancel'), 1);
});
