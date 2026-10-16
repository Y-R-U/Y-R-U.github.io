#!/usr/bin/env node
// Drops pictures Aaron marked Bad on review.html from live c1 packs. Records them in tools/img_bad.json
// (pack -> [src]) so c1_build never brings them back; candidate and movie/book-moment packs are img_promote's job.
// Usage: node tools/img_bad.mjs <verdicts.json> [--apply]   (export: see img_promote.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const SIDE = join(HERE, 'img_bad.json');
const SKIP = new Set(['movie-moments', 'book-moments', 'tv-moments']);

export const badList = () => (existsSync(SIDE) ? JSON.parse(readFileSync(SIDE, 'utf8')) : {});
// Replacement pictures for items that lost theirs (tools/img_add.json: pack -> id -> [media]), added when missing.
export function addImages(id, pack) {
  const add = existsSync(join(HERE, 'img_add.json')) ? JSON.parse(readFileSync(join(HERE, 'img_add.json'), 'utf8'))[id] || {} : {};
  for (const it of pack.items || []) for (const m of add[it.id] || []) {
    const img = (it.media ||= {}).img ||= [];
    if (!img.some(x => x.src === m.src)) img.push(m);
  }
}

export function dropBad(id, pack, list = badList()) {
  const bad = new Set(list[id] || []);
  let n = 0;
  for (const it of pack.items || []) {
    const img = it.media?.img;
    if (!img?.length) continue;
    const keep = img.filter(m => !bad.has(m.src));
    if (keep.length === img.length) continue;
    n += img.length - keep.length;
    if (keep.length) it.media.img = keep; else delete it.media.img;
  }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, flag] = process.argv.slice(2);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.reviews || [];
  const list = badList();
  for (const r of rows) {
    if (r.verdict !== 'bad' || r.ref.includes(':new/')) continue;
    const pid = r.ref.split('/')[0];
    if (SKIP.has(pid)) continue;
    (list[pid] ||= []).includes(r.src) || list[pid].push(r.src);
  }
  for (const pid of Object.keys(list)) {
    const path = join(ROOT, 'data/packs', pid + '.json');
    const text = readFileSync(path, 'utf8');
    const pack = JSON.parse(text);
    const had = new Set(pack.items.filter(it => it.media?.img?.length).map(it => it.id));
    const n = dropBad(pid, pack, list);
    const empty = pack.items.filter(it => had.has(it.id) && !it.media?.img?.length).map(it => it.id);
    console.log(`${pid}: ${n} picture(s) dropped${empty.length ? `; now without pictures: ${empty.join(', ')}` : ''}`);
    if (flag === '--apply' && n) writeFileSync(path, JSON.stringify(pack, null, text.startsWith('{\n') ? 1 : 0) + '\n');
  }
  if (flag === '--apply') writeFileSync(SIDE, JSON.stringify(list, null, 1) + '\n');
  else console.log('Dry run. Rerun with --apply.');
}
