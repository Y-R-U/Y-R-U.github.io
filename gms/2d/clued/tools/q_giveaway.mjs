// Drops pack questions whose prompt gives the answer away ("What is the capital of Mexico?" → Mexico City), using the
// same givesAway() test the formats apply at play time (js/formats/registry.js). Every builder calls dropGiveaways()
// before writing a pack; `node tools/q_giveaway.mjs [packId…]` applies it to the packs on disk.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { givesAway } from '../js/formats/registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function giveaway(q) {
  if (q.leakOk) return false;
  if ((q.kind || 'mc') === 'mc' && typeof q.answer === 'string') return givesAway(q.answer, q.prompt, q.wrong || []);
  if (q.kind === 'number' && Math.abs(Number(q.answer)) >= 1000) return new RegExp(`(^|[^\\d.,])${Number(q.answer)}([^\\d]|$)`).test(q.prompt);
  return false;
}

export function dropGiveaways(pack) {
  const out = (pack.questions || []).filter(giveaway);
  if (out.length) pack.questions = pack.questions.filter(q => !out.includes(q));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ids = process.argv.slice(2);
  const dir = join(ROOT, 'data/packs');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
    const id = f.replace(/\.json$/, '');
    if (ids.length && !ids.includes(id)) continue;
    const pack = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const gone = dropGiveaways(pack);
    if (!gone.length) continue;
    writeFileSync(join(dir, f), JSON.stringify(pack, null, 1) + '\n');
    console.log(`${id}: dropped ${gone.length}`);
    for (const q of gone) console.log(`   ${q.id}: ${q.prompt} → ${q.answer}`);
  }
}
