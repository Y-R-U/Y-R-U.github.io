// Remote debug log. Off unless the server's debugLogs setting is on (GET /status → debugLogs), which the client
// re-checks at boot, on visibility/pageshow, on screen changes and at the start of every game (max once a minute;
// every minute while on, so switching it off is picked up too). `?debug=1` forces it on for this tab (developers).
// dlog() always fills a 200-line ring so the first batch after switching on carries the recent history.
// No imports beyond BUILD so audio modules can use it in node tests. See docs/notes/DEBUGLOG.md.
import { BUILD } from '../build.js?v=202610101826';

const RING = 200, QUEUE_MAX = 3000, BATCH_LINES = 300, BATCH_BYTES = 56000, FLUSH_MS = 3000, CHECK_MS = 60000;

const rid = n => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');

// Snapshot now (values like ctx.state change later); big payloads are cut and sent as a string.
function safeData(d) {
  if (d === undefined) return undefined;
  try {
    const s = JSON.stringify(d, (k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: String(v.stack || '').slice(0, 600) }
      : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));
    if (s === undefined) return undefined;
    return s.length > 2000 ? s.slice(0, 2000) + '…' : JSON.parse(s);
  } catch (e) { return String(d).slice(0, 500); }
}

// env: { fetch, beacon, now, perf, setTimer, clearTimer, statusUrl, postUrl, device, session, build, ua, room }
export function createDebugLog(env) {
  const ring = [], queue = [];
  let on = false, forced = false, flushT = null, checkT = null, lastCheck = -Infinity, checking = null, sending = false;
  const stats = { sent: 0, batches: 0, checks: 0 };

  function push(line) {
    ring.push(line);
    if (ring.length > RING) ring.shift();
    if (on) { queue.push(line); if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX); }
  }

  function dlog(tag, msg, data, lvl = 'info') {
    push({ t: env.now(), p: Math.round(env.perf() * 10) / 10, lvl, tag: String(tag), msg: String(msg), d: safeData(data) });
  }

  function setOn(v, why) {
    v = !!(v || forced);
    if (v === on) return;
    on = v;
    if (on) {
      queue.splice(0, queue.length, ...ring);    // recent history first
      dlog('debug', 'on', { why, build: env.build(), history: ring.length });
      flushT = env.setTimer(flush, FLUSH_MS, true);
      checkT = env.setTimer(() => check(true), CHECK_MS, true);
    } else {
      dlog('debug', 'off', { why });
      env.clearTimer(flushT); env.clearTimer(checkT);
      flushT = checkT = null;
      queue.length = 0;
    }
  }

  function body(lines) {
    return JSON.stringify({ device: env.device, session: env.session, build: env.build(), ua: env.ua, room: env.room() || '',
      lines: lines.map(l => ({ t: l.t, p: l.p, lvl: l.lvl, tag: l.tag, msg: l.msg, data: l.d })) });
  }

  // Take up to BATCH_LINES lines / BATCH_BYTES from the queue.
  function take() {
    let n = Math.min(queue.length, BATCH_LINES), b = body(queue.slice(0, n));
    while (n > 1 && b.length > BATCH_BYTES) { n = Math.max(1, Math.floor(n / 2)); b = body(queue.slice(0, n)); }
    return { n, b };
  }

  async function flush() {
    if (!on || sending || !queue.length) return;
    sending = true;
    try {
      while (on && queue.length) {
        const { n, b } = take();
        const lines = queue.splice(0, n);
        let ok = false;
        try { const r = await env.fetch(env.postUrl, b, true); ok = !!r && (r.status === 200 || r.status === 204 || r.status === 413); if (r?.status === 204) setOn(false, 'server-204'); } catch (e) {}
        if (!ok) { queue.unshift(...lines); break; }   // network blip: retry on the next tick
        stats.sent += n; stats.batches++;
      }
    } finally { sending = false; }
  }

  // pagehide: no await possible, so beacon whatever is queued (each beacon ≤ 64 KB).
  function beaconAll() {
    if (!on) return;
    dlog('debug', 'beacon', { queued: queue.length });
    for (let i = 0; i < 4 && queue.length; i++) {
      const { n, b } = take();
      if (!env.beacon(env.postUrl, b)) break;
      queue.splice(0, n);
    }
  }

  // Ask the server whether to log. force = ignore the once-a-minute throttle (the periodic check while on).
  function check(force = false) {
    if (checking) return checking;
    if (!force && env.perf() - lastCheck < CHECK_MS) return Promise.resolve(on);
    lastCheck = env.perf();
    stats.checks++;
    checking = env.fetch(env.statusUrl).then(r => (r && r.ok ? r.json() : null)).then(s => {
      if (s && typeof s.debugLogs === 'boolean') setOn(s.debugLogs, 'server');
      return on;
    }).catch(() => on).finally(() => { checking = null; });
    return checking;
  }

  function force(v) { forced = !!v; setOn(forced, 'forced'); }

  return { dlog, check, flush, beaconAll, force, setOn, get on() { return on; }, session: env.session, device: env.device, ring, queue, stats, _body: body };
}

/* ------------------------------------------------------------- browser instance */
const G = globalThis;
const isBrowser = !!(G.document && G.location && G.fetch);

function apiBase() {
  const ok = v => v && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v);
  try {
    let v = new URLSearchParams(location.search).get('api');
    if (!v) { const nav = performance.getEntriesByType('navigation')[0]; if (nav?.name) v = new URL(nav.name).searchParams.get('api'); }
    if (!ok(v)) v = sessionStorage.getItem('clued.api');
    if (ok(v)) return v.replace(/\/$/, '');
  } catch (e) {}
  return location.hostname === 'games.br8t.com' ? '/gms/2d/clued/api' : 'https://games.br8t.com/gms/2d/clued/api';
}

function bootParam(name) {
  try {
    const v = new URLSearchParams(location.search).get(name);
    if (v != null) return v;
    const nav = performance.getEntriesByType('navigation')[0];
    return nav?.name ? new URL(nav.name).searchParams.get(name) : null;
  } catch (e) { return null; }
}

function deviceId() {
  try {
    let d = localStorage.getItem('clued.dbg.dev');
    if (!d) { d = rid(8); localStorage.setItem('clued.dbg.dev', d); }
    return d;
  } catch (e) { return 'x' + rid(7); }
}

function roomOf() {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('join') || q.get('p2p') || '';
  } catch (e) { return ''; }
}

let inst = G.__cluedDbg;   // one instance even if the module is loaded twice across a deploy
if (!inst) {
  const API = isBrowser ? apiBase() : '';
  inst = createDebugLog({
    fetch: (url, b, post) => (post
      ? G.fetch(url, { method: 'POST', body: b, keepalive: b.length < 60000, mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })
      : G.fetch(url, { cache: 'no-store', mode: 'cors', credentials: 'omit' })),
    beacon: (url, b) => { try { return !!G.navigator?.sendBeacon?.(url, new Blob([b], { type: 'text/plain' })); } catch (e) { return false; } },
    now: () => Date.now(),
    perf: () => (G.performance ? performance.now() : Date.now()),
    setTimer: (fn, ms) => setInterval(fn, ms),
    clearTimer: t => clearInterval(t),
    statusUrl: API + '/status', postUrl: API + '/debuglog',
    device: isBrowser ? deviceId() : 'node', session: rid(6), build: () => BUILD,
    ua: G.navigator?.userAgent || '', room: () => (isBrowser ? roomOf() : ''),
  });
  G.__cluedDbg = inst;
  if (isBrowser) install(inst);
}

export const dlog = inst.dlog;

// A page open across a deploy can evaluate a module twice (games.br8t.com ignores ?v=, see DEADTAP.md): each
// instrumented module reports its own instance id and URL; a second instance of the same file logs a warning.
export function modLoaded(name, url) {
  const id = rid(4), seen = (G.__cluedMods ||= {});
  const list = (seen[name] ||= []);
  list.push({ id, url: String(url).replace(/^.*\/js\//, 'js/') });
  inst.dlog('module', list.length > 1 ? 'loaded.again' : 'loaded', { mod: name, id, url: list.at(-1).url, n: list.length, others: list.length > 1 ? list.slice(0, -1) : undefined }, list.length > 1 ? 'warn' : 'info');
  return id;
}

// Which builds this page's scripts came from: module <script> tags, and every js/css resource grouped by ?v=.
// mixed = the same file loaded under two different ?v= values (a second module instance).
export function buildsSeen() {
  if (!isBrowser) return {};
  try {
    const scripts = [...document.querySelectorAll('script[type=module]')].map(s => (s.getAttribute('src') || 'inline').replace(/^.*\/js\//, 'js/'));
    const byV = {}, files = {};
    for (const e of performance.getEntriesByType('resource')) {
      const m = /\/gms\/2d\/clued\/(.+?\.(?:js|css))(?:\?(.*))?$/.exec(e.name);
      if (!m) continue;
      const v = new URLSearchParams(m[2] || '').get('v') || '-';
      byV[v] = (byV[v] || 0) + 1;
      (files[m[1]] ||= new Set()).add(v);
    }
    const mixed = Object.entries(files).filter(([, vs]) => vs.size > 1).slice(0, 12).map(([f, vs]) => f + '@' + [...vs].join('|'));
    const other = Object.entries(files).filter(([, vs]) => !vs.has(BUILD)).slice(0, 12).map(([f, vs]) => f + '@' + [...vs].join('|'));
    return { build: BUILD, scripts, byV, mixed: mixed.length ? mixed : undefined, notBuild: other.length ? other : undefined, mods: G.__cluedMods ? Object.fromEntries(Object.entries(G.__cluedMods).map(([k, v]) => [k, v.length])) : undefined };
  } catch (e) { return { err: String(e) }; }
}
export const debugOn = () => inst.on;
// Call at the start of a game / room: picks up the server setting without a reload (throttled to once a minute).
export const debugCheck = () => inst.check();
export const debugLog = inst;

function install(d) {
  // developer override: ?debug=1 for this tab (sessionStorage), ?debug=0 clears it
  try {
    const p = bootParam('debug');
    if (p === '1') sessionStorage.setItem('clued.debug', '1');
    if (p === '0') sessionStorage.removeItem('clued.debug');
    if (sessionStorage.getItem('clued.debug') === '1') d.force(true);
  } catch (e) {}

  for (const lvl of ['warn', 'error']) {
    const orig = console[lvl];
    console[lvl] = function (...args) {
      try { d.dlog('console', lvl, args.map(a => (a instanceof Error ? a : typeof a === 'object' ? a : String(a))), lvl); } catch (e) {}
      return orig.apply(this, args);
    };
  }
  addEventListener('error', e => d.dlog('window', 'error', { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, err: e.error }, 'error'));
  addEventListener('unhandledrejection', e => d.dlog('window', 'unhandledrejection', { reason: e.reason }, 'error'));
  document.addEventListener('visibilitychange', () => {
    d.dlog('page', 'visibility', { state: document.visibilityState });
    if (document.visibilityState === 'visible') d.check(); else d.flush();
  });
  addEventListener('pagehide', e => { d.dlog('page', 'pagehide', { persisted: e.persisted }); d.beaconAll(); });
  addEventListener('pageshow', e => { d.dlog('page', 'pageshow', { persisted: e.persisted }); if (e.persisted) d.check(); });
  addEventListener('focus', () => d.dlog('page', 'focus'));
  addEventListener('blur', () => d.dlog('page', 'blur'));
  // navigation: app.js sets body[data-screen] on every screen change
  const watch = () => {
    let last = document.body.dataset.screen;
    new MutationObserver(() => {
      const s = document.body.dataset.screen;
      if (s === last) return;
      d.dlog('nav', 'screen', { from: last, to: s, room: roomOf() || undefined });
      last = s;
      d.check();
    }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  };
  document.body ? watch() : addEventListener('DOMContentLoaded', watch, { once: true });

  const q = (() => { try { return new URL(performance.getEntriesByType('navigation')[0]?.name || location.href).search + location.search; } catch (e) { return location.search; } })();
  const testOnly = /[?&](test|soak)(=|&|$)/.test(q) && !/[?&]api=/.test(q);
  d.dlog('page', 'boot', { url: location.pathname + location.search, build: BUILD, ref: document.referrer ? new URL(document.referrer).host : '', w: innerWidth, h: innerHeight, dpr: devicePixelRatio, mem: navigator.deviceMemory, cores: navigator.hardwareConcurrency });
  if (!testOnly) d.check(true);
  addEventListener('load', () => setTimeout(() => d.dlog('page', 'builds', buildsSeen()), 0), { once: true });
  wrapAudioContext(d);
}

// Count every AudioContext the page creates (a second one is never unlocked: silent clips) and give each an id.
function wrapAudioContext(d) {
  const reg = (G.__cluedAC ||= { n: 0, ids: [] });
  for (const k of ['AudioContext', 'webkitAudioContext']) {
    const AC = G[k];
    if (!AC || AC.__cluedWrapped) continue;
    try {
      const W = class extends AC {
        constructor(...a) {
          super(...a);
          reg.n++;
          this.__id = 'ac' + reg.n + '-' + rid(3);
          reg.ids.push(this.__id);
          d.dlog('ctx', 'AudioContext.new', { id: this.__id, n: reg.n, state: this.state, by: String(new Error().stack || '').split('\n').slice(2, 4).map(l => l.trim().replace(/https?:\/\/[^/]+\/gms\/2d\/clued\//, '').slice(-90)) }, reg.n > 1 ? 'warn' : 'info');
        }
      };
      W.__cluedWrapped = true;
      G[k] = W;
    } catch (e) { d.dlog('ctx', 'wrap.fail', { k, err: String(e) }, 'warn'); }
  }
}
