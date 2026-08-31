// The generated-clip ledger. Not a js/dev/data.js kind — that module is another agent's and its
// KINDS table is fixed — so this one talks to the api directly and keeps its own save report.
//
// DEV_CONTRACT §8: the ledger is data/vo.json and there is only one of it. The dev server writes
// nothing outside data/ (devserver.mjs dataPath), so that is the only path a browser can save to.

import { INDEX_DOC, CODEC, rawFile, blankIndex, validateIndex, mergeClips } from './vo.js';

const LS = 'wf.dev.vo.index';

export async function loadIndex(api) {
  const r = await api.load(INDEX_DOC);
  if (r.ok && r.json) return { doc: r.json, where: 'server' };
  // Only fall back to the static copy when no dev server answered. If it said "missing", fetching
  // the same path again just puts a 404 in the console for every author to learn to ignore.
  if (!r.missing) try {
    const res = await fetch(new URL(`../../../${INDEX_DOC}`, import.meta.url).href, { cache: 'no-store' });
    if (res.ok) return { doc: await res.json(), where: 'static' };
  } catch { /* not served */ }
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return { doc: JSON.parse(raw), where: 'local' };
  } catch { /* private mode */ }
  return { doc: blankIndex(), where: 'blank' };
}

export async function saveIndex(api, doc) {
  const problems = validateIndex(doc);
  const cur = await api.load(INDEX_DOC);
  const merged = mergeClips(cur.ok ? cur.json : null, doc);
  const r = await api.save(INDEX_DOC, merged);
  if (r.ok) return { ok: true, where: 'server', path: r.path, problems };
  try { localStorage.setItem(LS, JSON.stringify(merged)); }
  catch (e) { return { ok: false, where: 'local', problems,
    error: `${r.error}; localStorage also failed: ${e.message}` }; }
  // The draft is kept whatever went wrong, but only "there is no dev server" is a save. A server
  // that answered and refused leaves data/vo.json as something other than what the tab is showing,
  // and calling that ok:true is how a tool that has stopped saving goes on looking like one that is.
  if (r.offline) return { ok: true, where: 'local', problems,
    note: 'no dev server — kept in this browser only' };
  return { ok: false, where: 'local', problems, error: r.error,
    note: `the dev server refused it — kept in this browser only: ${r.error}` };
}

// What is genuinely on disk. An index entry whose file has been deleted must regenerate, and
// believing the ledger over the filesystem is how a cache silently stops caching.
export async function clipsOnDisk(api) {
  const r = await api.ls('audio/vo');
  if (!r.ok) return null;
  return new Set((r.files || []).filter(f => f.name.endsWith(CODEC.ext))
    .map(f => f.name.slice(0, -CODEC.ext.length)));
}

// The dev server's encode route. js/dev/api.js has no wrapper for it and is not this agent's file,
// so it is called directly off api.base. Its own CPU queue, so it never waits on the GPU slot.
export async function encodeClip(api, key, { profile = CODEC.profile } = {}) {
  // api.base is '' when the dev server IS the page's origin, so this has to test for null, not
  // for falsy. `if (!base)` rejected every same-origin encode as "no dev server".
  const base = api.base;
  if (base === null || base === undefined) return { ok: false, error: 'no dev server' };
  const go = async (path, opts) => {
    try {
      const r = await fetch(`${base}${path}`, opts);
      return await r.json();
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  };
  const start = await go('/api/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: rawFile(key), profile, out: key }) });
  if (!start.ok || !start.job) return start;
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, i < 6 ? 200 : 800));
    const s = await go(`/api/job/${encodeURIComponent(start.job)}`);
    if (s.state === 'done') return { ok: true, bytes: s.after?.bytes ?? 0, from: s.source?.bytes ?? 0 };
    if (s.state === 'error') return { ok: false, error: s.error || 'encode failed' };
  }
  return { ok: false, error: 'gave up waiting for the encode job' };
}

// audio/vo/raw is outside /api/ls's whitelist, but the dev server still serves it statically, so a
// HEAD answers the same question one file at a time. Bounded to the keys actually being planned.
export async function rawsOnDisk(keys, { concurrency = 12 } = {}) {
  const have = new Set();
  const queue = [...keys];
  const worker = async () => {
    for (let k = queue.pop(); k !== undefined; k = queue.pop()) {
      try {
        const r = await fetch(new URL(`../../../${rawFile(k)}`, import.meta.url).href,
          { method: 'HEAD', cache: 'no-store' });
        if (r.ok) have.add(k);
      } catch { /* not served — treated as absent */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return have;
}
