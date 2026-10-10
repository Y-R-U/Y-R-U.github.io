// Questions from rooms, challenges and P2P hosts are someone else's JSON: clean them before any format renders them.
export const FORMATS = new Set(['blitz60', 'chain', 'city-pick', 'connect', 'continent', 'fake', 'flag-map', 'hilo', 'ladder', 'listen',
  'lookalike', 'map-click', 'match', 'mc', 'neighbours', 'number', 'odd', 'order', 'pin-drop', 'quote', 'reveal', 'silhouette', 'sort',
  'tf', 'type', 'water-click']);
const KINDS = new Set(['mc', 'tf', 'number', 'order', 'quote']);
const URL_KEYS = new Set(['src', 'url', 'page', 'art', 'href', 'img', 'image', 'poster', 'thumb', 'previewUrl', 'trackViewUrl']);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const STR = ['id', 'prompt', 'answerText', 'explain', 'title'];
const MAX_DEPTH = 10, MAX_LIST = 600, MAX_STR = 4000;

export function safeUrl(v) {
  if (typeof v !== 'string' || !v) return null;
  try {
    const base = globalThis.location?.href || 'https://games.br8t.com/';
    const u = new URL(v, base);
    if (u.protocol === 'https:' || u.origin === new URL(base).origin) return v;
  } catch (e) {}
  return null;
}

function clean(v, key, depth) {
  if (typeof v === 'string') {
    if (URL_KEYS.has(key)) return safeUrl(v) ?? undefined;
    if (key === 'id') return v.slice(0, MAX_STR);
    return v.slice(0, MAX_STR).replace(/</g, '‹').replace(/>/g, '›');
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean' || v === null) return v;
  if (depth >= MAX_DEPTH || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) return v.slice(0, MAX_LIST).map(x => clean(x, '', depth + 1)).filter(x => x !== undefined);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (BAD_KEYS.has(k)) continue;
    const c = clean(x, k, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

// A safe copy of one question, or null when it can't be played.
export function cleanQuestion(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !FORMATS.has(raw.format)) return null;
    const q = clean(raw, '', 0);
    for (const k of STR) if (k in q && typeof q[k] !== 'string') { if (typeof q[k] === 'number') q[k] = String(q[k]); else delete q[k]; }
    if ('kind' in q && !KINDS.has(q.kind)) delete q.kind;
    if (q.data != null && (typeof q.data !== 'object' || Array.isArray(q.data))) return null;
    if (q.data?.kind != null && !(typeof q.data.kind === 'string' && /^[a-z0-9-]{1,24}$/.test(q.data.kind))) delete q.data.kind;
    if ('options' in q && !Array.isArray(q.options)) return null;
    if (q.options) q.options = q.options.filter(o => typeof o === 'string' || typeof o === 'number' || (o && typeof o === 'object' && !Array.isArray(o)));
    return q;
  } catch (e) { return null; }
}

export const cleanQuestions = list => (Array.isArray(list) ? list.map(cleanQuestion).filter(Boolean) : []);
