#!/usr/bin/env node
// Every Apple preview in data/music answers (a 2-byte range request per clip). Exit 1 on any dead preview.
//   node tools/au_previews.mjs [pack ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUSIC = path.join(ROOT, 'data/music');
const only = process.argv.slice(2);
const list = [];
for (const f of fs.readdirSync(MUSIC).filter((x) => x.endsWith('.json') && (!only.length || only.includes(x.replace(/\.json$/, ''))))) {
  const p = JSON.parse(fs.readFileSync(path.join(MUSIC, f), 'utf8'));
  for (const it of p.items) for (const a of it.media?.audio || []) if (a.apple) list.push({ pack: p.id, id: it.id, src: a.src });
}
let next = 0;
const bad = [];
async function probe(u) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { range: 'bytes=0-1' } });
      if (r.status === 206 || r.status === 200) return r.status;
      if (r.status === 404 || r.status === 403) return r.status;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return 0;
}
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < list.length) {
    const x = list[next++];
    const st = await probe(x.src);
    if (st !== 206 && st !== 200) bad.push(`${x.pack}/${x.id} ${st} ${x.src}`);
  }
}));
bad.forEach((b) => console.log('DEAD ' + b));
console.log(`${list.length - bad.length}/${list.length} previews answer`);
process.exit(bad.length ? 1 : 0);
