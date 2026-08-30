// Client for tools/devserver.mjs. Every method resolves to {ok, ...} and never throws or rejects —
// a tool that gets {ok:false} shows a banner, it does not break.

const PORT = 8796;
const CANDIDATES = () => {
  const out = [];
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
    out.push('');
    if (location.port !== String(PORT)) out.push(`${location.protocol}//${location.hostname}:${PORT}`);
  }
  out.push(`http://127.0.0.1:${PORT}`);
  return out;
};

let base = null;
let resolving = null;
// With no dev server every call would otherwise re-probe three URLs; a status pill polling on a
// timer then fills the console with connection errors.
let failedAt = 0;
const RETRY_MS = 10000;
let last = { ok: false, devserver: false, kokoro: false, ace: false, flux: false };

async function fetchJSON(url, { method = 'GET', body, timeout = 8000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      method,
      signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    if (!r.ok) return { ok: false, status: r.status, error: (json && json.error) || `HTTP ${r.status}`, json };
    if (json === null) return { ok: false, error: 'response was not JSON', body: text.slice(0, 200) };
    return json.ok === undefined ? { ok: true, ...json } : json;
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timed out' : String(e.message || e), offline: true };
  } finally {
    clearTimeout(t);
  }
}

async function resolveBase(force = false) {
  if (base !== null) return base;
  if (resolving) return resolving;
  if (!force && failedAt && Date.now() - failedAt < RETRY_MS) return null;
  resolving = (async () => {
    for (const c of CANDIDATES()) {
      const r = await fetchJSON(`${c}/api/status`, { timeout: 2500 });
      if (r.ok && r.devserver) { base = c; failedAt = 0; last = { ...r, ok: true }; return base; }
    }
    base = null;
    failedAt = Date.now();
    return null;
  })().finally(() => { resolving = null; });
  return resolving;
}

async function call(path, opts) {
  const b = await resolveBase();
  if (b === null) return { ok: false, offline: true, error: 'no dev server' };
  const r = await fetchJSON(`${b}${path}`, opts);
  // A dev server that went away mid-session must be re-probed, not remembered as up.
  if (r.offline) { base = null; failedAt = Date.now(); last = { ok: false, devserver: false, kokoro: false, ace: false, flux: false }; }
  return r;
}

export const api = {
  get base() { return base; },

  // Cached probe. `force` re-asks; everything else reads the last answer, so a status pill can be
  // repainted without touching the network.
  async status({ force = false } = {}) {
    if (force) { base = null; failedAt = 0; }
    const b = await resolveBase(force);
    if (b === null) return { ok: false, devserver: false, kokoro: false, ace: false, flux: false, error: 'no dev server' };
    const r = await fetchJSON(`${b}/api/status`, { timeout: 3000 });
    if (r.ok) last = { ...r, ok: true };
    return r.ok ? last : { ok: false, devserver: false, kokoro: false, ace: false, flux: false, error: r.error };
  },

  async up() {
    const s = await this.status({ force: true });
    return { ok: !!s.devserver, base, devserver: !!s.devserver, kokoro: !!s.kokoro, ace: !!s.ace, flux: !!s.flux, error: s.error };
  },

  cached() { return last; },
  async online() { return (await resolveBase()) !== null; },

  save(path, json) { return call('/api/save', { method: 'POST', body: { path, json }, timeout: 15000 }); },
  load(path) { return call('/api/load', { method: 'POST', body: { path }, timeout: 15000 }); },
  ls(dir) { return call(`/api/ls?dir=${encodeURIComponent(dir)}`); },

  tts(job) { return call('/api/tts', { method: 'POST', body: job, timeout: 180000 }); },
  ttsBatch(jobs) { return call('/api/tts/batch', { method: 'POST', body: { jobs }, timeout: 900000 }); },

  music(job, onProgress) { return queued('/api/music', job, onProgress); },
  flux(job, onProgress) { return queued('/api/flux', job, onProgress); },

  job(id) { return call(`/api/job/${encodeURIComponent(id)}`, { timeout: 5000 }); },
  queue() { return call('/api/queue', { timeout: 5000 }); },
};

// ACE-Step and Flux share one GPU-sized slot, so the server queues them and answers immediately
// with a job id. Polling here keeps the caller's await looking synchronous.
async function queued(path, job, onProgress) {
  const start = await call(path, { method: 'POST', body: job, timeout: 15000 });
  if (!start.ok) return start;
  if (start.done) return start;
  const id = start.job;
  let ticks = 0;
  for (;;) {
    await sleep(ticks++ < 4 ? 700 : 2000);
    const s = await api.job(id);
    if (!s.ok) return s;
    onProgress?.(s);
    if (s.state === 'done') return { ok: true, ...s };
    if (s.state === 'error') return { ok: false, error: s.error || 'job failed', ...s };
    if (ticks > 1200) return { ok: false, error: 'gave up waiting after ~40 min', job: id };
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default api;
