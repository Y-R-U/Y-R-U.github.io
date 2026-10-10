// Apple network chain (docs/notes/APPLEPROXY.md): direct with a short first-byte timeout, then the Clued
// server proxy. The first time direct fails where the proxy works, the session goes straight to the proxy.
import { dlog, modLoaded } from '../core/debuglog.js?v=202610101826';
modLoaded('applenet', import.meta.url);

const G = globalThis;
const APPLE_RE = /^https:\/\/(audio-ssl\.itunes\.apple\.com\/itunes-assets\/|itunes\.apple\.com\/(lookup|search)\?|is[1-5]-ssl\.mzstatic\.com\/image\/thumb\/)/;
export const isApple = (u) => APPLE_RE.test(String(u || ''));

function apiBase() {
  const ok = (v) => v && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v);
  try {
    let v = new URLSearchParams(location.search).get('api');
    if (!v) { const nav = performance.getEntriesByType('navigation')[0]; if (nav?.name) v = new URL(nav.name).searchParams.get('api'); }
    if (!ok(v)) v = sessionStorage.getItem('clued.api');
    if (ok(v)) return v.replace(/\/$/, '');
  } catch (e) {}
  return location.hostname === 'games.br8t.com' ? '/gms/2d/clued/api' : 'https://games.br8t.com/gms/2d/clued/api';
}

const short = (u) => { try { const x = new URL(u, 'http://x'); return x.host + (x.pathname + x.search).slice(-48); } catch { return String(u).slice(-60); } };

// env: { fetch, base, now, store (get/set), log, firstByteMs, totalMs }
export function createAppleNet(env) {
  const KEY = 'clued.appleDirect';
  let broken = false;
  try { broken = env.store?.get(KEY) === 'broken'; } catch (e) {}
  const log = env.log || (() => {});
  const firstByteMs = env.firstByteMs ?? 5000, totalMs = env.totalMs ?? 20000;
  const now = env.now || (() => Date.now());
  if (broken) log('applenet', 'broken.remembered', {});

  function proxyUrl(u) {
    if (!isApple(u)) return u;
    const x = new URL(u);
    if (x.host === 'itunes.apple.com') {
      const q = new URLSearchParams(x.search);
      q.delete('callback');
      return `${env.base()}/itunes?path=${x.pathname.slice(1)}&${q}`;
    }
    return `${env.base()}/preview?u=${encodeURIComponent(u)}`;
  }

  function markBroken(why) {
    if (broken) return;
    broken = true;
    try { env.store?.set(KEY, 'broken'); } catch (e) {}
    log('applenet', 'broken', why, 'warn');
  }

  // fetch with an abort timer: firstMs until the headers arrive, then totalMs for the body (read via `read`)
  async function timed(url, init, firstMs, read) {
    const ac = new AbortController();
    let phase = 'connect';
    let t = setTimeout(() => ac.abort(), firstMs);
    const t0 = now();
    try {
      const r = await env.fetch(url, { ...init, signal: ac.signal });
      clearTimeout(t);
      phase = 'body';
      t = setTimeout(() => ac.abort(), totalMs);
      const body = r.ok && read ? await read(r) : null;
      return { r, body, ms: now() - t0, first: null };
    } catch (e) {
      const err = ac.signal.aborted ? `timeout ${phase === 'connect' ? firstMs : totalMs} ms (${phase})` : `${e?.name || 'Error'}: ${e?.message || e}`;
      throw Object.assign(new Error(err), { ms: now() - t0, phase, timedOut: ac.signal.aborted });
    } finally { clearTimeout(t); }
  }

  // GET an Apple URL through the chain. read(r) consumes the body (arrayBuffer / json). Returns { r, body, via, ms }.
  async function get(url, { read, init = {}, what = 'media' } = {}) {
    if (!isApple(url)) {
      const px = /\/api\/(preview|itunes)\?/.test(url);
      const res = await timed(url, init, totalMs, read);
      if (px) log('applenet', res.r.headers?.get?.('x-clued-cache') === 'hit' ? 'proxy.ok.cachehit' : 'proxy.ok', { what, url: short(url), status: res.r.status, ms: res.ms });
      return { ...res, via: px ? 'proxy' : 'other' };
    }
    const viaProxy = async (directErr) => {
      const pu = proxyUrl(url);
      try {
        const res = await timed(pu, { mode: 'cors', credentials: 'omit' }, 15000, read);
        const cache = res.r.headers?.get?.('x-clued-cache') || '';
        if (!res.r.ok) {
          log('applenet', 'proxy.bad', { what, url: short(url), status: res.r.status, ms: res.ms }, 'warn');
          return { ...res, via: 'proxy' };
        }
        log('applenet', cache === 'hit' ? 'proxy.ok.cachehit' : 'proxy.ok', { what, url: short(url), status: res.r.status, cache, ms: res.ms });
        if (directErr) markBroken({ what, url: short(url), directErr: directErr.message, directMs: directErr.ms });
        return { ...res, via: 'proxy' };
      } catch (e) {
        log('applenet', 'proxy.fail', { what, url: short(url), err: e.message, ms: e.ms }, 'warn');
        throw directErr || e;
      }
    };
    if (broken) { log('applenet', 'skip.direct', { what, url: short(url) }); return viaProxy(null); }
    try {
      const res = await timed(url, { mode: 'cors', credentials: 'omit', ...init }, firstByteMs, read);
      if (res.r.ok) log('applenet', 'direct.ok', { what, url: short(url), status: res.r.status, ms: res.ms });
      else log('applenet', 'direct.bad', { what, url: short(url), status: res.r.status, ms: res.ms }, 'warn');
      return { ...res, via: 'direct' };
    } catch (e) {
      log('applenet', 'direct.fail', { what, url: short(url), err: e.message, ms: e.ms, timedOut: !!e.timedOut }, 'warn');
      return viaProxy(e);
    }
  }

  // HEAD check of a preview: true = it exists, false = gone, null = unknown (network)
  async function head(url) {
    if (broken) return null;
    try {
      const { r, ms } = await timed(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' }, firstByteMs);
      log('applenet', 'head.direct', { url: short(url), status: r.status, ms });
      return r.ok;
    } catch (e) {
      log('applenet', 'head.direct.fail', { url: short(url), err: e.message, ms: e.ms }, 'warn');
      try {
        const { r, ms } = await timed(proxyUrl(url), { method: 'HEAD', mode: 'cors', credentials: 'omit' }, 15000);
        log('applenet', 'head.proxy', { url: short(url), status: r.status, ms });
        if (r.ok) markBroken({ what: 'head', url: short(url), directErr: e.message, directMs: e.ms });
        return r.status === 404 ? false : r.ok ? true : null;
      } catch (e2) {
        log('applenet', 'head.proxy.fail', { url: short(url), err: e2.message }, 'warn');
        return null;
      }
    }
  }

  // for <img>/<audio> src: the proxy once direct is known broken
  const src = (u) => (broken && isApple(u) ? proxyUrl(u) : u);

  return { get, head, src, proxyUrl, markBroken, get broken() { return broken; }, _reset() { broken = false; try { env.store?.set(KEY, ''); } catch (e) {} } };
}

const isBrowser = !!(G.document && G.location && G.fetch);
let base = null;
export const net = G.__cluedAppleNet || (G.__cluedAppleNet = createAppleNet({
  fetch: (...a) => G.fetch(...a),
  base: () => (base ??= isBrowser ? apiBase() : 'https://games.br8t.com/gms/2d/clued/api'),
  now: () => (G.performance ? performance.now() : Date.now()),
  store: { get: (k) => G.sessionStorage?.getItem(k), set: (k, v) => G.sessionStorage?.setItem(k, v) },
  log: (...a) => dlog(...a),
}));
export const appleSrc = (u) => net.src(u);
export const proxyUrl = (u) => net.proxyUrl(u);
