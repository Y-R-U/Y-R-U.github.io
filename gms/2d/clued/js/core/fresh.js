// FRESH: a rolling history of questions this device has shown (clued.seen, synced), so new games prefer unseen ones.
// Stored as one string of fixed-width tokens, oldest first: { v: 1, h: 'abcde…', g: [[new, total] × last 10 games] }.
import { KEYS, read, write } from './store.js?v=202610130751';
import { hashString } from './rng.js?v=202610130751';

export const SEEN_MAX = 3000, W = 5, SPEC_W = 4;
const SPACE = 36 ** W;

const flat = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
export function dupKey(q) {
  const p = flat(q.prompt);
  if (!p) return '';
  const a = q.answerText ?? (Array.isArray(q.options) && typeof q.answer === 'number' ? q.options[q.answer]?.text : q.answer);
  return p + '|' + flat(typeof a === 'object' ? JSON.stringify(a) : a);
}
export const tokOf = key => (hashString(key) % SPACE).toString(36).padStart(W, '0');
export const qTok = q => { const k = dupKey(q); return k ? tokOf(k) : ''; };

const split = (s, w = W) => { const out = []; for (let i = 0; i + w <= s.length; i += w) out.push(s.slice(i, i + w)); return out; };

function load() {
  const r = read(KEYS.seen);
  const h = r && typeof r.h === 'string' && /^[0-9a-z]*$/.test(r.h) ? r.h.slice(0, r.h.length - (r.h.length % W)) : '';
  const g = Array.isArray(r?.g) ? r.g.filter(x => Array.isArray(x) && x.length === 2).slice(-10) : [];
  return { h, g };
}

export function seenInfo() {
  const { h, g } = load();
  const games = g.length, asked = g.reduce((a, x) => a + (+x[1] || 0), 0), fresh = g.reduce((a, x) => a + (+x[0] || 0), 0);
  return { count: h.length / W, games, asked, fresh };
}

export const resetSeen = () => write(KEYS.seen, { v: 1, h: '', g: [] });

// Tokens of questions asked (in order). Re-asked ones move to the newest end; the oldest fall off past SEEN_MAX.
export function recordSeen(qs) {
  const toks = [...new Set((qs || []).map(q => (typeof q === 'string' ? q : qTok(q))).filter(t => t && t.length === W))];
  if (!toks.length) return 0;
  const { h, g } = load();
  const list = split(h), have = new Set(list), now = new Set(toks);
  const fresh = toks.filter(t => !have.has(t)).length;
  const kept = list.filter(t => !now.has(t)).concat(toks);
  write(KEYS.seen, { v: 1, h: kept.slice(-SEEN_MAX).join(''), g: [...g, [fresh, toks.length]].slice(-10) });
  return fresh;
}

// For buildQuestions: age(token) = 0 for the oldest seen, larger = more recent, undefined = never seen.
// `recent` (tokens or questions, e.g. a room's earlier games) counts as newer than anything in the history.
export function freshFrom({ recent = [] } = {}) {
  const ages = new Map();
  split(load().h).forEach((t, i) => ages.set(t, i));
  let n = ages.size;
  for (const x of recent) { const t = typeof x === 'string' ? x : qTok(x); if (t) ages.set(t, n++); }
  return { age: t => ages.get(t), size: ages.size };
}

// The ranking every build uses, live or replayed from spec.fresh: unseen first in generated order, then by the order of
// first demotion (oldest seen first). Live builds append their seen candidates to `d`, so a replay of spec.fresh
// reproduces the exact same choice without the history.
export function freshRanker(live, given = '') {
  const d = split(given, SPEC_W), idx = new Map();
  d.forEach((t, i) => { if (!idx.has(t)) idx.set(t, i); });
  const toks = new WeakMap();
  const tok = q => { let t = toks.get(q); if (t === undefined) { t = qTok(q); toks.set(q, t); } return t; };
  return {
    note(lists) {
      if (!live) return;
      const add = [];
      for (const q of lists.flat()) {
        const t = tok(q), s = t.slice(0, SPEC_W);
        if (!t || idx.has(s)) continue;
        const a = live.age(t);
        if (a !== undefined) { idx.set(s, -1); add.push([a, s]); }
      }
      add.sort((x, y) => x[0] - y[0]).forEach(([, s]) => { idx.set(s, d.length); d.push(s); });
    },
    rank(list) {
      const r = q => { const t = tok(q); return t ? idx.get(t.slice(0, SPEC_W)) ?? -1 : -1; };
      return list.map((q, i) => [r(q), i, q]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    },
    seenIn: list => list.filter(q => { const t = tok(q); return t && idx.has(t.slice(0, SPEC_W)); }).length,
    get spec() { return d.join(''); },
  };
}
