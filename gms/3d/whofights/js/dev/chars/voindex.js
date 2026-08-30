// The generated-clip ledger. Not a js/dev/data.js kind — that module is another agent's and its
// KINDS table is fixed — so this one talks to the api directly and keeps its own save report.
//
// DEV_CONTRACT §8 puts the sidecar at audio/vo/index.json. The dev server will only write under
// data/ (devserver.mjs dataPath), so the authoritative copy the tools read and write is
// data/vo.json and `node tools/vo/gen_barks.mjs --sync` mirrors it out to audio/vo/index.json.
// Flagged in the handoff report — one write route for audio/vo/ would collapse the two.

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
  catch (e) { return { ok: false, error: `${r.error}; localStorage also failed: ${e.message}` }; }
  return { ok: true, where: 'local', problems, note: r.error };
}

// What is genuinely on disk. An index entry whose file has been deleted must regenerate, and
// believing the ledger over the filesystem is how a cache silently stops caching.
export async function clipsOnDisk(api) {
  const r = await api.ls('audio/vo');
  if (!r.ok) return null;
  return new Set((r.files || []).filter(f => f.name.endsWith(CODEC.ext))
    .map(f => f.name.slice(0, -CODEC.ext.length)));
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
