#!/usr/bin/env node
// Apple network chain (js/audio/applenet.js): direct → proxy fallback, session memory, timeouts, logging.
//   node tools/applenet_test.mjs
import { createAppleNet, isApple } from '../js/audio/applenet.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PREV = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/b1/x/mzaf_1.plus.aac.p.m4a';
const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/a.jpg/300x300bb.jpg';
const LOOK = 'https://itunes.apple.com/lookup?id=1,2&country=US&entity=song';
const BASE = 'https://games.br8t.com/gms/2d/clued/api';

const resp = (status, body = 'x', hdr = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => hdr[k.toLowerCase()] ?? null }, arrayBuffer: async () => new TextEncoder().encode(body).buffer, json: async () => JSON.parse(body) });

// mode: 'ok' | 'blackhole' (never answers until aborted) | 'refused' (TypeError at once, also how a CORS-less 404 looks)
function world({ apple = 'ok', proxy = 'ok', proxyStatus = 200 } = {}) {
  const calls = [];
  const fetch = (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    const isProxy = url.startsWith(BASE);
    const mode = isProxy ? proxy : apple;
    return new Promise((res, rej) => {
      const abort = () => rej(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
      if (init.signal?.aborted) return abort();
      init.signal?.addEventListener('abort', abort);
      if (mode === 'blackhole') return;
      if (mode === 'refused') return setTimeout(() => rej(new TypeError('Failed to fetch')), 5);
      const st = isProxy ? proxyStatus : 200;
      setTimeout(() => res(resp(st, url.includes('itunes') ? '{"resultCount":2}' : 'audio', isProxy ? { 'x-clued-cache': calls.filter((c) => c.url === url).length > 1 ? 'hit' : 'miss' } : {})), 5);
    });
  };
  const store = new Map();
  const logs = [];
  const mk = (opts = {}) => createAppleNet({ fetch, base: () => BASE, now: () => performance.now(), store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }, log: (tag, msg, data) => logs.push({ tag, msg, data }), firstByteMs: 120, totalMs: 400, ...opts });
  return { calls, logs, store, mk };
}
const read = (r) => r.arrayBuffer();

console.log('allowlist');
ok(isApple(PREV) && isApple(ART) && isApple(LOOK) && isApple('https://itunes.apple.com/search?term=x'), 'Apple preview, artwork, lookup and search recognised');
ok(!isApple('https://upload.wikimedia.org/a.mp3') && !isApple('https://music.apple.com/us/album/1') && !isApple('https://evil.com/itunes-assets/a.m4a') && !isApple('http://audio-ssl.itunes.apple.com/itunes-assets/a.m4a'), 'Wikimedia, Apple Music page links, lookalikes and http are not');

console.log('healthy network: direct only');
{
  const w = world(), n = w.mk();
  const r = await n.get(PREV, { read });
  ok(r.via === 'direct' && r.r.ok && w.calls.length === 1 && w.calls[0].url === PREV, 'preview fetched directly, proxy untouched');
  const j = await n.get(LOOK, { read: (x) => x.json(), what: 'json' });
  ok(j.via === 'direct' && j.body.resultCount === 2, 'lookup JSON direct');
  ok(!n.broken && n.src(ART) === ART && n.src(PREV) === PREV, 'not broken; img/audio srcs stay direct');
  ok(w.logs.some((l) => l.msg === 'direct.ok' && l.data.ms >= 0), 'direct.ok logged with ms');
  const other = await n.get('https://upload.wikimedia.org/a.mp3', { read });
  ok(other.via === 'other', 'non-Apple URLs are fetched plainly');
}

console.log('blackholed Apple (Edge laptop)');
{
  const w = world({ apple: 'blackhole' }), n = w.mk();
  const t0 = performance.now();
  const r = await n.get(PREV, { read });
  const dt = performance.now() - t0;
  ok(r.via === 'proxy' && r.r.ok, 'falls back to the proxy');
  ok(dt >= 110 && dt < 300, `gives direct only the first-byte timeout (${Math.round(dt)} ms for a 120 ms budget)`);
  ok(w.calls[1].url === `${BASE}/preview?u=${encodeURIComponent(PREV)}`, 'proxy URL is /preview?u=<encoded>');
  ok(n.broken && w.store.get('clued.appleDirect') === 'broken', 'session remembers direct is broken');
  const fail = w.logs.find((l) => l.msg === 'direct.fail');
  ok(fail && /timeout 120 ms \(connect\)/.test(fail.data.err) && fail.data.timedOut, 'direct.fail logged as a connect timeout');
  ok(w.logs.some((l) => l.msg === 'broken') && w.logs.some((l) => l.msg === 'proxy.ok'), 'broken + proxy.ok logged');
  const before = w.calls.length, t1 = performance.now();
  const r2 = await n.get(PREV.replace('mzaf_1', 'mzaf_2'), { read });
  ok(r2.via === 'proxy' && w.calls.length === before + 1 && w.calls[before].url.startsWith(BASE) && performance.now() - t1 < 80, 'next preview goes straight to the proxy (no direct attempt, no wait)');
  const j = await n.get(LOOK, { read: (x) => x.json(), what: 'json' });
  ok(j.via === 'proxy' && j.body.resultCount === 2 && w.calls.at(-1).url === `${BASE}/itunes?path=lookup&id=1%2C2&country=US&entity=song`, 'metadata lookups use /itunes?path=lookup too');
  await n.get(PREV, { read });
  ok(w.logs.some((l) => l.msg === 'proxy.ok.cachehit'), 'proxy cache hit logged');
  ok(n.src(ART) === `${BASE}/preview?u=${encodeURIComponent(ART)}` && n.src('https://upload.wikimedia.org/a.mp3') === 'https://upload.wikimedia.org/a.mp3', 'artwork src mapped to the proxy, others untouched');
  ok((await n.head(PREV)) === null, 'HEAD check skipped once broken (loader re-resolves dead previews)');
  const n2 = w.mk();
  ok(n2.broken && w.logs.some((l) => l.msg === 'broken.remembered'), 'a reload in the same tab remembers (sessionStorage)');
  const s = n.proxyUrl('https://itunes.apple.com/search?media=music&entity=song&limit=10&country=US&term=Queen%20X&callback=cb');
  ok(s === `${BASE}/itunes?path=search&media=music&entity=song&limit=10&country=US&term=Queen+X`, 'search proxied, callback stripped');
}

console.log('refused fast (extension / tracking prevention)');
{
  const w = world({ apple: 'refused' }), n = w.mk();
  const r = await n.get(PREV, { read });
  ok(r.via === 'proxy' && n.broken, 'TypeError → proxy → broken');
}

console.log('dead preview, healthy network: not marked broken');
{
  // 'dead' = Apple 404 without CORS headers → TypeError in the browser
  const w2 = world({ apple: 'refused', proxyStatus: 404 }), n2 = w2.mk();
  const r = await n2.get(PREV, { read });
  ok(r.via === 'proxy' && r.r.status === 404 && !n2.broken, 'proxy says 404 too → the file is gone, direct stays trusted');
  ok(w2.logs.some((l) => l.msg === 'proxy.bad'), 'proxy.bad logged');
}

console.log('both down');
{
  const w = world({ apple: 'refused', proxy: 'refused' }), n = w.mk();
  let err = null;
  try { await n.get(PREV, { read }); } catch (e) { err = e; }
  ok(err && /Failed to fetch/.test(err.message) && !n.broken, 'throws the direct error, not marked broken');
  ok(w.logs.some((l) => l.msg === 'proxy.fail'), 'proxy.fail logged');
}

console.log('HEAD');
{
  const w = world(), n = w.mk();
  ok((await n.head(PREV)) === true && w.calls[0].method === 'HEAD', 'healthy: direct HEAD true');
  const wb = world({ apple: 'blackhole' }), nb = wb.mk();
  const h = await nb.head(PREV);
  ok(h === true && nb.broken && wb.calls[1].url.startsWith(BASE) && wb.calls[1].method === 'HEAD', 'blackholed: proxy HEAD ok → broken');
  const wd = world({ apple: 'refused', proxyStatus: 404 }), nd = wd.mk();
  ok((await nd.head(PREV)) === false && !nd.broken, 'gone everywhere: false (refresh), not broken');
}

console.log('slow body: total timeout');
{
  const calls = [];
  const fetch = (url, init) => new Promise((res) => { calls.push(url); res({ ok: true, status: 200, headers: { get: () => null }, arrayBuffer: () => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }); });
  const n = createAppleNet({ fetch, base: () => BASE, firstByteMs: 50, totalMs: 100, log: () => {} });
  const t0 = performance.now();
  let err = null;
  try { await n.get(PREV, { read }); } catch (e) { err = e; }
  ok(err && performance.now() - t0 < 600 && calls.length === 2, `stalled body aborted on both legs (${Math.round(performance.now() - t0)} ms)`);
}

await sleep(10);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
