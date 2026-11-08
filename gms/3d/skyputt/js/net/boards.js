// Online leaderboards client (boards agent, docs/notes/boards.md; server/boards.go).
//   Daily Challenge board per (day, hole) · course-round board per (course, round, week | all).
// Same server + identity as online rooms (net.js: defaultBase() respects ONLINE_PUBLIC, the token is
// the websocket hello's). Everything here fails quietly: no server, an older server without boards,
// offline or refused → `available()` is false / calls resolve null, and the screens hide the tab.
//
//   const b = createBoards({ net });   await b.available()
//   b.submitDaily({ day, hole, twist, try, strokes, gems, ms, name })   b.dailyBoard({ day, hole, scope })
//   b.submitRound({ course, round, week, scores, name })                b.roundBoard({ course, round, week, scope })
import { net as defaultNet, defaultBase } from './net.js';

const PENDING_KEY = 'skyputt.local.boards';
const PENDING_MAX = 12;
const PENDING_AGE = 36 * 3600e3;   // the server refuses a daily day after ~1.5 days anyway
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);

function readPending() {
  try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writePending(list) {
  try { if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-PENDING_MAX))); else localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ }
}

// Which course round a Round played: a nine of the course, or the whole course; null for a partial run.
export function roundIdFor(course, from, to) {
  const nine = course.nines?.find(n => n.from === from && n.to === to);
  if (nine) return nine.id;
  return from === 0 && to === course.holes.length ? 'all' : null;
}
// Every course round a board exists for, in map order: [{ course, round, name }]
export function roundList(courses) {
  return courses.flatMap(c => (c.nines?.length ? c.nines.map(n => ({ course: c.id, round: n.id, name: `${c.name} · ${n.name}`, par: c.holes.slice(n.from, n.to).reduce((a, h) => a + h.par, 0) }))
    : [{ course: c.id, round: 'all', name: c.name, par: c.holes.reduce((a, h) => a + h.par, 0) }]));
}

export function createBoards({ net = defaultNet, base = null, timeoutMs = 5000 } = {}) {
  let avail = null;   // Promise<boolean>, cached for the page's life once true
  const root = () => (base || net.base || defaultBase() || '').replace(/\/$/, '');

  async function call(method, path, body, { auth = true } = {}) {
    const b = root();
    if (!b) throw Object.assign(new Error('online not available here'), { code: 'unavailable' });
    const headers = {};
    if (auth) { const tok = await withTimeout(net.authToken(), 7000).catch(() => null); if (tok) headers.Authorization = `Bearer ${tok}`; else if (method === 'POST') throw Object.assign(new Error('no sign-in'), { code: 'no_token' }); }
    if (body) headers['Content-Type'] = 'application/json';
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try { res = await fetch(b + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctl.signal }); }
    catch { throw Object.assign(new Error('offline'), { code: 'offline' }); }
    finally { clearTimeout(t); }
    const j = await res.json().catch(() => ({}));
    if (res.status === 404) avail = Promise.resolve(false);   // an older server: hide the tabs from now on
    if (!res.ok) throw Object.assign(new Error(j.error || res.statusText), { code: j.code || `http_${res.status}`, status: res.status });
    return j;
  }

  // Feature detection: the server's /api/health says `boards: 1` (older servers don't).
  function available() {
    if (!avail) {
      avail = (async () => {
        if (!root()) return false;
        try {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
          const res = await fetch(root() + '/api/health', { cache: 'no-store', signal: ctl.signal });
          clearTimeout(t);
          const j = res.ok ? await res.json().catch(() => null) : null;
          return !!(j && j.ok && j.boards >= 1);
        } catch { return false; }
      })();
      avail.then(ok => { if (!ok) setTimeout(() => { avail = null; }, 60e3); });   // try again in a minute
    }
    return avail;
  }

  // A submission that couldn't reach the server waits in a small local queue and is retried the
  // next time a board is opened. Refusals (4xx) are dropped: retrying wouldn't change the answer.
  async function send(kind, body) {
    try { return await call('POST', `/${kind}`, body); }
    catch (e) {
      if (e.code === 'offline' || e.code === 'timeout' || e.code === 'rate_limited' || e.code === 'no_token' || (e.status >= 500)) {
        const list = readPending().filter(p => !(p.kind === kind && JSON.stringify(p.body) === JSON.stringify(body)));
        list.push({ kind, body, at: Date.now() });
        writePending(list);
      }
      return { ok: false, code: e.code };
    }
  }
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      const list = readPending().filter(p => Date.now() - p.at < PENDING_AGE);
      writePending([]);
      if (!list.length || !(await available())) { writePending(list); return; }
      for (const p of list) await send(p.kind, p.body);   // send() re-queues what still fails
    })().finally(() => { flushing = null; });
    return flushing;
  }

  async function submitDaily(r) {
    if (!(await available())) return null;
    return send('daily', { day: r.day, hole: r.hole, twist: r.twist, try: r.try, strokes: r.strokes, gems: r.gems | 0, ms: Math.round(r.ms || 0), name: r.name || '' });
  }
  async function submitRound(r) {
    if (!(await available())) return null;
    return send('ladder', { course: r.course, round: r.round, week: r.week, scores: r.scores, name: r.name || '' });
  }
  const qs = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const dailyBoard = ({ day, hole, scope = 'all', limit = 50 }) => call('GET', `/daily?${qs({ day, hole, scope, limit })}`);
  const roundBoard = ({ course, round, week = 'all', scope = 'all', limit = 50 }) => call('GET', `/ladder?${qs({ course, round, week, scope, limit })}`);

  return { available, submitDaily, submitRound, dailyBoard, roundBoard, flush, pending: readPending, root };
}

export const boards = createBoards();
