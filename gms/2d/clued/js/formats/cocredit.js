// Shared credits ("Ron Clements, John Musker"): a question names only the best-known person (most credits across the
// packs, ties to the first listed); the other co-credits never turn up as wrong options. Data: tools/trio_cocredit.mjs.
import FAME from './cocredit_data.js?v=202610171247';

export const CREDIT_KEYS = new Set(['director', 'author', 'inventor']);
const SPLIT = /\s*,\s*|\s+and\s+|\s*&\s*/i;
const norm = s => String(s ?? '').trim().toLowerCase();

export const people = v => (v == null || v === '' ? [] : Array.isArray(v) ? v.map(String) : String(v).split(SPLIT).map(s => s.trim()).filter(Boolean));
export const isCredit = key => CREDIT_KEYS.has(key);
export function leadOf(v) {
  const ps = people(v);
  let best = ps[0] ?? '', n = -1;
  for (const p of ps) { const f = FAME[norm(p)] || 0; if (f > n) { best = p; n = f; } }
  return best;
}
