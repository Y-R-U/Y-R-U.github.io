// Clued server client: base URL, JSON requests, server clock, live room subscription (SSE → long-poll fallback).
import { idToken } from './ident.js?v=202610071438';

const DEFAULT_API = location.hostname === 'games.br8t.com' ? '/gms/2d/clued/api' : 'https://games.br8t.com/gms/2d/clued/api';

// ?api=http://127.0.0.1:PORT/gms/2d/clued/api points a local page at a local server (testing only).
// The shell strips the query on boot, so also read the original navigation URL.
export function bootParam(name) {
  try {
    const v = new URLSearchParams(location.search).get(name);
    if (v != null) return v;
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav?.name) return new URL(nav.name).searchParams.get(name);
  } catch (e) {}
  return null;
}

// Kept in sessionStorage too, so a reload of a stripped URL still finds it.
function localOverride() {
  const ok = v => v && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v);
  try {
    const v = bootParam('api');
    if (ok(v)) { sessionStorage.setItem('clued.api', v); return v.replace(/\/$/, ''); }
    const s = sessionStorage.getItem('clued.api');
    if (ok(s)) return s.replace(/\/$/, '');
  } catch (e) {}
  return null;
}
export const API_OVERRIDE = localOverride();
export const API = API_OVERRIDE || DEFAULT_API;

export class ApiError extends Error {
  constructor(status, code, message) { super(message || code || `HTTP ${status}`); this.status = status; this.code = code || 'error'; }
}

const FRIENDLY = {
  network: 'Can’t reach the Clued server. Check your connection and try again.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  room_not_found: 'That room doesn’t exist or has ended.',
  room_full: 'That room is full.',
  bad_name: 'Please pick a different name.',
  name_required: 'Type a name first.',
  kicked: 'The host removed you from this room.',
  too_large: 'That game is too big to share. Try fewer questions.',
  signin_required: 'This needs a free br8t sign-in right now.',
  paused: 'New games are paused for a little while. Please try again later.',
  public_full: 'All public game slots are busy right now.',
  started: 'This game has already started and isn’t taking new players.',
  challenge_not_found: 'This challenge has expired or the link is wrong.',
  busy: 'Clued is busy right now. Please try again soon.',
};
export const friendly = e => FRIENDLY[e?.code] || e?.message || 'Something went wrong.';

export async function req(method, path, body, { timeout = 12000, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = await idToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, cache: 'no-store' });
  } catch (e) {
    throw new ApiError(0, 'network', FRIENDLY.network);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new ApiError(res.status, data?.code, data?.error);
  return data;
}

/* --------------------------------------------------------- server clock */
let offset = 0, bestRtt = Infinity, synced = 0;
export const serverNow = () => Date.now() + offset;
export const clockInfo = () => ({ offset, rtt: bestRtt, synced });

// Keeps the lowest-RTT sample: its midpoint error is at most rtt/2.
export async function syncClock(samples = 5) {
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const { now } = await req('GET', '/time', undefined, { timeout: 5000 });
      const t1 = Date.now(), rtt = t1 - t0;
      if (rtt <= bestRtt || Date.now() - synced > 120000) { bestRtt = rtt; offset = now - (t0 + t1) / 2; synced = Date.now(); }
    } catch (e) { if (i === 0) return false; }
  }
  return true;
}

/* ------------------------------------------------------------- rooms */
export const rooms = {
  create: (body) => req('POST', '/rooms', body, { auth: true, timeout: 20000 }),
  status: () => req('GET', '/status', undefined, { timeout: 6000 }),
  listPublic: () => req('GET', '/rooms/public', undefined, { timeout: 8000 }),
  peek: code => req('GET', `/rooms/${encodeURIComponent(code)}`),
  join: (code, name, key) => req('POST', `/rooms/${encodeURIComponent(code)}/join`, { name, key }, { auth: true }),
  state: (code, key) => req('GET', `/rooms/${code}/state?k=${encodeURIComponent(key)}`),
  question: (code, key, i) => req('GET', `/rooms/${code}/q/${i}?k=${encodeURIComponent(key)}`),
  answer: (code, key, a) => req('POST', `/rooms/${code}/answer`, { key, ...a }),
  leave: (code, key) => req('POST', `/rooms/${code}/leave`, { key }),
  vote: (code, key, q) => req('POST', `/rooms/${code}/vote`, { key, q }),
  host: (code, key, action, extra = {}) => req('POST', `/rooms/${code}/${action}`, { key, ...extra }, { timeout: action === 'again' ? 20000 : 12000 }),
};

export const challenges = {
  create: body => req('POST', '/challenges', body, { auth: true, timeout: 20000 }),
  get: id => req('GET', `/challenges/${encodeURIComponent(id)}`),
  scores: id => req('GET', `/challenges/${encodeURIComponent(id)}/scores`),
  submit: (id, body) => req('POST', `/challenges/${encodeURIComponent(id)}/scores`, body, { auth: true }),
};

// Live room state. onState(state) fires only for newer versions. onEnd(code) for
// room_not_found / kicked / bad_key. Uses SSE, drops to long-polling if SSE keeps failing.
export function subscribe(code, key, { onState, onEnd, onLink } = {}) {
  let ver = -1, es = null, closed = false, mode = 'sse', fails = 0, firstMsg = false, pollTimer = null;
  const k = encodeURIComponent(key);
  const deliver = st => {
    if (!st || closed) return;
    if (st.you?.kicked) { end('kicked'); return; }
    if (st.expired) { end('room_not_found'); return; }
    if (st.ver > ver) { ver = st.ver; onState && onState(st); }
  };
  const end = why => { if (closed) return; close(); onEnd && onEnd(why); };
  const link = up => onLink && onLink(up, mode);

  function startSSE() {
    if (typeof EventSource === 'undefined') return startPoll();
    es = new EventSource(`${API}/rooms/${code}/events?k=${k}`);
    const onMsg = e => { firstMsg = true; fails = 0; link(true); try { deliver(JSON.parse(e.data)); } catch (err) {} };
    es.addEventListener('state', onMsg);
    es.addEventListener('kicked', () => end('kicked'));
    es.addEventListener('gone', () => end('room_not_found'));
    es.onerror = async () => {
      if (closed) return;
      link(false);
      fails++;
      // A closed EventSource means a non-stream reply (404/403/410): ask why.
      if (es.readyState === EventSource.CLOSED || fails >= 3) {
        es.close(); es = null;
        try { deliver(await rooms.state(code, key)); } catch (err) {
          if (['room_not_found', 'kicked', 'bad_key'].includes(err.code)) return end(err.code);
        }
        if (!firstMsg || fails >= 3) startPoll(); else setTimeout(() => !closed && startSSE(), 1500);
      }
    };
  }

  async function startPoll() {
    mode = 'poll';
    let backoff = 1000;
    while (!closed) {
      try {
        const st = await req('GET', `/rooms/${code}/state?k=${k}&since=${ver}`, undefined, { timeout: 30000 });
        link(true);
        backoff = 1000;
        deliver(st);
      } catch (err) {
        if (['room_not_found', 'kicked', 'bad_key'].includes(err.code)) return end(err.code);
        link(false);
        await new Promise(r => (pollTimer = setTimeout(r, backoff)));
        backoff = Math.min(10000, backoff * 2);
      }
    }
  }

  function close() {
    closed = true;
    if (es) { es.close(); es = null; }
    clearTimeout(pollTimer);
  }

  let forcePoll = bootParam('netpoll') === '1';
  try { forcePoll = forcePoll || sessionStorage.getItem('clued.netpoll') === '1'; } catch (e) {}
  if (forcePoll) startPoll(); else startSSE();
  return {
    close,
    get mode() { return mode; },
    async refresh() { try { deliver(await rooms.state(code, key)); } catch (e) {} },
    push: deliver,
  };
}
