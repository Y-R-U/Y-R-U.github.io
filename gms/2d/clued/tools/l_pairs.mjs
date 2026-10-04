// Lane L: list lookalike pairs whose facts barely differ (they need hand-written `differences` notes from C1).
// node tools/l_pairs.mjs [maxDiffering=0]
import { readFileSync, readdirSync } from 'node:fs';
const MAX = +(process.argv[2] ?? 0);
const dir = new URL('../data/packs/', import.meta.url);
let total = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const p = JSON.parse(readFileSync(new URL(f, dir)));
  const by = Object.fromEntries((p.items || []).map(i => [i.id, i]));
  const keys = Object.entries(p.factsMeta || {}).filter(([k, m]) => m.type !== 'text' && k !== 'kids').map(([k]) => k);
  const seen = new Set(), out = [];
  for (const a of p.items || []) for (const bid of a.lookalikes || []) {
    const b = by[bid]; if (!b) continue;
    const k = [a.id, bid].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
    if (a.differences || b.differences) continue;
    const diff = keys.filter(x => a.facts?.[x] != null && b.facts?.[x] != null && JSON.stringify(a.facts[x]) !== JSON.stringify(b.facts[x]));
    if (diff.length <= MAX) out.push(`${a.id} ↔ ${bid}${diff.length ? ' (' + diff.join(', ') + ')' : ''}`);
  }
  if (out.length) { console.log(`${p.id} (${out.length}/${seen.size} pairs):\n  ` + out.join('\n  ')); total += out.length; }
}
console.log(`total ${total}`);
