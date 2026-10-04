#!/usr/bin/env node
// Reject photos after eyeballing a contact sheet: node tools/c1_skip.mjs <pack> item-id:index [item-id:index…]
// item-id=N caps that item at N photos. Index = position in the built pack (as labelled by c1_sheet.py). Stored by photo page in c1_src/_skip.json; rebuild after.
import { join } from 'node:path';
import { TOOLS, ROOT, readJSON, writeJSON } from './c1_lib.mjs';
const [pack, ...pairs] = process.argv.slice(2);
const p = readJSON(join(ROOT, 'data/packs', pack + '.json'));
const file = join(TOOLS, 'c1_src/_skip.json');
const skip = readJSON(file, {});
skip[pack] ||= {};
for (const pr of pairs) {
  if (pr.includes('=')) { const [id, n] = pr.split('='); (skip[pack]._max ||= {})[id] = +n; console.log('cap', id, n); continue; }
  const [id, idx] = pr.split(':');
  const it = p.items.find(i => i.id === id);
  const m = it?.media?.img?.[+idx];
  if (!m) { console.warn('no such photo', pr); continue; }
  (skip[pack][id] ||= []).includes(m.page) || skip[pack][id].push(m.page);
  console.log('skip', pr, m.page);
}
writeJSON(file, skip);
