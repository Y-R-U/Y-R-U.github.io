// iTunes Search API: lookup by trackId (CORS, JSONP fallback), stale-preview refresh, reveal badge.
import { dlog, modLoaded } from '../core/debuglog.js?v=202610100547';
import { net, appleSrc, proxyUrl } from './applenet.js?v=202610100547';
const MOD_ID = modLoaded('apple', import.meta.url);

const LOOKUP = 'https://itunes.apple.com/lookup';
const fresh = new Map(); // trackId -> Promise<track|null>

function jsonp(url) {
  return new Promise((res, rej) => {
    const cb = '__cluedItunes' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = (v, e) => { delete globalThis[cb]; s.remove(); clearTimeout(to); e ? rej(e) : res(v); };
    const to = setTimeout(() => done(null, new Error('jsonp timeout')), 8000);
    globalThis[cb] = (d) => done(d);
    s.onerror = () => done(null, new Error('jsonp error'));
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}

async function getJSON(url) {
  const t0 = globalThis.performance?.now() ?? 0, u = url.replace('https://itunes.apple.com', '').slice(0, 120);
  try {
    const { r, body, via } = await net.get(url, { read: (x) => x.json(), what: 'json' });
    if (r.ok) { dlog('apple', 'json', { u, via, n: body?.resultCount, ms: (globalThis.performance?.now() ?? 0) - t0 }); return body; }
    dlog('apple', 'json.bad', { u, via, status: r.status }, 'warn');
  } catch (e) { dlog('apple', 'json.fail', { u, err: String(e?.message || e) }, 'warn'); }
  // last resort when the proxy is down too; pointless once Apple is known to be blocked here
  if (globalThis.document && !net.broken) { dlog('apple', 'jsonp', { u }); return jsonp(url); }
  throw new Error('itunes lookup failed');
}

export const art = (url, px = 300) => (url ? url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, `/${px}x${px}bb.$2`) : '');

export async function lookup(ids, country = 'US') {
  const out = new Map();
  const list = [...new Set(ids.map(String))];
  for (let i = 0; i < list.length; i += 150) {
    const d = await getJSON(`${LOOKUP}?id=${list.slice(i, i + 150).join(',')}&country=${country}&entity=song`);
    for (const t of d?.results || []) if (t.trackId) out.set(String(t.trackId), t);
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// by trackId; if Apple has retired the id (labels re-issue albums), search for the same artist + title
export function refresh(trackId, term) {
  const k = String(trackId);
  if (!fresh.has(k)) {
    const p = lookup([k]).then((m) => m.get(k) || null).catch(() => null).then(async (t) => {
      if (t?.previewUrl || !term) return t;
      const d = await getJSON(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=US&term=${encodeURIComponent(term)}`).catch(() => null);
      const want = norm(term);
      const hit = (d?.results || []).find((r) => r.previewUrl && want.startsWith(norm(r.artistName).slice(0, 6)) && want.includes(norm(r.trackName).slice(0, 10))) || null;
      dlog('apple', 'search', { id: k, found: !!hit, newId: hit?.trackId }, hit ? 'info' : 'warn');
      return hit;
    });
    p.then((t) => dlog('apple', 'refresh', { id: k, ok: !!t?.previewUrl }));
    fresh.set(k, p);
  }
  return fresh.get(k);
}

// returns a working preview url for an audio media object ({src, apple:{trackId}}), refreshing if the stored one is dead
export async function previewUrl(a, check = false) {
  if (!a.apple?.trackId) return a.src;
  if (check && a.src) {
    const ok = await net.head(a.src);
    dlog('apple', 'head', { id: a.apple.trackId, ok, broken: net.broken });
    if (ok !== false) return a.src;   // null = network unknown: keep it, the clip loader re-resolves a dead one
  } else if (a.src && !check) return a.src;
  dlog('apple', 'preview.refresh', { am: MOD_ID, id: a.apple.trackId, had: !!a.src, check });
  const t = await refresh(a.apple.trackId, a.apple.term);
  if (t?.previewUrl) { a.src = t.previewUrl; if (t.trackViewUrl) a.apple.url = t.trackViewUrl; return a.src; }
  dlog('apple', 'preview.none', { id: a.apple.trackId }, 'warn');
  throw new Error('no preview for ' + a.apple.trackId);
}

// src + a one-shot swap to the server proxy if the artwork host is blocked (onerror)
export function artAttrs(url) {
  const s = appleSrc(url), px = proxyUrl(url);
  return `src="${esc(s)}"` + (px !== s ? ` data-px="${esc(px)}" onerror="this.onerror=null;this.src=this.dataset.px"` : '');
}
export function setArt(img, url) {
  const s = appleSrc(url), px = proxyUrl(url);
  if (px !== s) img.onerror = () => { img.onerror = null; dlog('applenet', 'img.fallback', { url: url.slice(-60) }, 'warn'); img.src = px; };
  img.src = s;
  return img;
}

const NOTE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 3v12.2a3.3 3.3 0 1 1-2-3V7.3l-8 1.8v8.1a3.3 3.3 0 1 1-2-3V5.4z"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// reveal card: artwork + title/artist + the "Listen on Apple Music" badge
export function revealHTML(a, { title = '', artist = '', year = '' } = {}) {
  const ap = a.apple || {};
  const img = ap.art ? `<img class="au-art" ${artAttrs(art(ap.art, 300))} alt="" width="150" height="150" loading="eager">` : '';
  const sub = [artist, year].filter(Boolean).map(esc).join(' · ');
  return `<div class="au-reveal">${img}<div class="au-meta"><div class="au-title">${esc(title)}</div>${sub ? `<div class="au-sub">${sub}</div>` : ''}` +
    (ap.url ? `<a class="au-apple" href="${esc(ap.url)}" target="_blank" rel="noopener">${NOTE}<span><small>Listen on</small>Apple Music</span></a>` : '') +
    `</div></div>`;
}

export const BADGE_CSS = `
.au-reveal{display:flex;gap:14px;align-items:center;text-align:left}
.au-art{width:min(150px,32vw);height:auto;aspect-ratio:1;border-radius:10px;box-shadow:0 6px 18px #0005;flex:none}
.au-meta{min-width:0;display:flex;flex-direction:column;gap:4px}
.au-title{font-weight:700;font-size:1.1em;line-height:1.2}
.au-sub{opacity:.75;font-size:.9em}
.au-apple{display:inline-flex;align-items:center;gap:8px;margin-top:6px;padding:6px 14px 6px 10px;border-radius:9px;background:#000;color:#fff;
 border:1px solid #a6a6a6;text-decoration:none;font:600 15px/1.05 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;align-self:flex-start;min-height:40px}
.au-apple small{display:block;font-size:10px;font-weight:500;letter-spacing:.02em;opacity:.9}
.au-apple svg{color:#fa2d48}
`;
