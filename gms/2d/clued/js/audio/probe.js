// Apple connectivity probe, only while remote debug logging is on (docs/notes/APPLEPROXY.md "Reading the probe").
// Runs at the start of a music round and logs, tag `probe`, what this device can and can't reach.
import { dlog, debugOn } from '../core/debuglog.js?v=202610101826';
import { proxyUrl } from './applenet.js?v=202610101826';

const G = globalThis;
const LOOKUP = 'https://itunes.apple.com/lookup?id=1444065075';
const WIKI = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/52/Hymni_i_Flamurit_instrumental.ogg/Hymni_i_Flamurit_instrumental.ogg.mp3';
const T = 8000;
let lastSeen = 0, running = null, seq = 0;

// a proxied src back to the Apple URL it stands for
const unproxy = (u) => { try { const x = new URL(u, G.location?.href); return x.pathname.endsWith('/api/preview') ? x.searchParams.get('u') : u; } catch { return u; } };
const ms = (t0) => Math.round(performance.now() - t0);
const errOf = (e) => ({ err: e?.name || 'Error', msg: String(e?.message || e).slice(0, 160) });

async function tFetch(url, init = {}) {
  const ac = new AbortController(), t0 = performance.now();
  const to = setTimeout(() => ac.abort(), T);
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', ...init, signal: ac.signal });
    const first = ms(t0);
    const b = await r.arrayBuffer();
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), bytes: b.byteLength, first, ms: ms(t0), cache: r.headers.get('x-clued-cache') || undefined };
  } catch (e) { return { ok: false, ...errOf(e), timedOut: ac.signal.aborted, ms: ms(t0) }; } finally { clearTimeout(to); }
}

function tJsonp(url) {
  return new Promise((res) => {
    const t0 = performance.now(), cb = '__cluedProbe' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = (r) => { delete G[cb]; s.remove(); clearTimeout(to); res({ ...r, ms: ms(t0) }); };
    const to = setTimeout(() => done({ ok: false, err: 'timeout', timedOut: true }), T);
    G[cb] = (d) => done({ ok: true, n: d?.resultCount });
    s.onerror = () => done({ ok: false, err: 'script error' });
    s.src = url + '&callback=' + cb;
    document.head.appendChild(s);
  });
}

function tAudio(url) {
  return new Promise((res) => {
    const t0 = performance.now(), a = new Audio(), ev = [];
    a.muted = true; a.preload = 'auto'; a.dataset.clued = 'probe';
    const done = (r) => { clearTimeout(to); a.onloadedmetadata = a.oncanplay = a.onerror = null; a.removeAttribute('src'); try { a.load(); } catch {} res({ ...r, ev, ms: ms(t0) }); };
    const to = setTimeout(() => done({ ok: false, err: 'stall', networkState: a.networkState, readyState: a.readyState }), T);
    a.onloadedmetadata = () => ev.push(['loadedmetadata', ms(t0)]);
    a.oncanplay = () => done({ ok: true, dur: a.duration });
    a.onerror = () => done({ ok: false, err: 'error', code: a.error?.code, msg: a.error?.message });
    a.src = url;   // no crossOrigin: an opaque media load, like a plain <audio> tag
    try { a.load(); } catch (e) { done({ ok: false, ...errOf(e) }); }
  });
}

function tImg(url) {
  return new Promise((res) => {
    const t0 = performance.now(), img = new Image();
    const done = (r) => { clearTimeout(to); img.onload = img.onerror = null; res({ ...r, ms: ms(t0) }); };
    const to = setTimeout(() => done({ ok: false, err: 'stall' }), T);
    img.onload = () => done({ ok: img.naturalWidth > 0, w: img.naturalWidth });
    img.onerror = () => done({ ok: false, err: 'error' });
    img.src = url + (url.includes('?') ? '&' : '?') + 'p=' + Date.now();
  });
}

async function env() {
  const n = G.navigator || {}, c = n.connection || {};
  let storageAccess;
  try { storageAccess = typeof document.hasStorageAccess === 'function' ? await document.hasStorageAccess() : 'absent'; } catch (e) { storageAccess = 'error ' + e?.name; }
  return {
    onLine: n.onLine, conn: c.effectiveType ? { type: c.effectiveType, saveData: c.saveData, downlink: c.downlink, rtt: c.rtt } : null,
    ua: n.userAgent, brands: n.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`), platform: n.userAgentData?.platform,
    edge: /Edg\//.test(n.userAgent || ''), hasStorageAccess: storageAccess, requestStorageAccess: typeof document.requestStorageAccess === 'function',
    dnt: n.doNotTrack, gpc: n.globalPrivacyControl, cookies: n.cookieEnabled, origin: G.location?.origin,
  };
}

export async function runProbe(qs, why = '') {
  const q = qs.find((x) => x?.data?.a?.apple) || qs[0];
  const a = q?.data?.a || {};
  const preview = a.apple ? unproxy(a.src || '') : '';
  const artwork = q?.data?.artImg?.src ? unproxy(q.data.artImg.src) : '';
  const id = ++seq, t0 = performance.now();
  dlog('probe', 'start', { id, why, preview: preview.slice(-70), artwork: artwork.slice(-60), ...(await env()) });
  const R = { start: { id } };
  const run = (name, p) => p.then((r) => { R[name] = r; dlog('probe', name, { id, ...r, onLine: navigator.onLine }, r.ok ? 'info' : 'warn'); });
  const range = { headers: { Range: 'bytes=0-1023' } };
  await Promise.all([
    run('lookup.cors', tFetch(LOOKUP)),
    run('lookup.jsonp', tJsonp(LOOKUP)),
    preview && run('preview.cors.range', tFetch(preview, range)),
    preview && run('preview.audio', tAudio(preview)),
    artwork && run('artwork.img', tImg(artwork)),
    preview && run('proxy.preview', tFetch(proxyUrl(preview), range)),
    run('proxy.lookup', tFetch(proxyUrl(LOOKUP))),
    artwork && run('proxy.artwork', tImg(proxyUrl(artwork))),
    run('control.wikimedia', tFetch(WIKI, range)),
  ].filter(Boolean));
  const sum = Object.fromEntries(Object.entries(R).filter(([k]) => k !== 'start').map(([k, v]) => [k, v.ok ? `ok ${v.ms}ms` : `${v.err || 'status ' + v.status} ${v.ms}ms`]));
  dlog('probe', 'summary', { id, why, ms: ms(t0), ...sum });
  G.__cluedProbeLast = { id, why, R, sum };
  return R;
}

// once per music round: a probe runs when a listen round starts (prepare, or the first preload/render after two quiet minutes)
export function maybeProbe(qs, why) {
  if (!debugOn()) return null;
  const now = Date.now(), fresh = now - lastSeen > 120000;
  lastSeen = now;
  if (running || !fresh) return null;
  running = runProbe(qs, why).catch((e) => dlog('probe', 'fail', errOf(e), 'warn')).finally(() => { running = null; });
  return running;
}
