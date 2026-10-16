#!/usr/bin/env node
// Look-alike options by level (Aaron 2026-10-16): easy picture questions offer no look-alike pair, medium at most
// one, hard keeps offering look-alikes. Uses the gems pack (item.look from tools/img_look.py). Exit 1 on failure.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { distractors, looksAlike } = await import(js('formats/registry.js'));
const pack = JSON.parse(await readFile(join(ROOT, 'data/packs/gems.json'), 'utf8'));
const pool = pack.items.filter(it => it.media?.img?.length).map(item => ({ item, pack: pack.id, ref: `${pack.id}/${item.id}` }));

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pairs = opts => { let p = 0; for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) if (looksAlike(opts[i].item, opts[j].item)) p++; return p; };

ok(pool.every(c => Array.isArray(c.item.look)), 'every gem has a colour signature');
const stats = { 1: [], 2: [], 3: [] };
for (const lv of [1, 2, 3]) for (const t of pool) for (let k = 0; k < 20; k++) {
  const w = distractors(rng, t, pool, 3, { lv });
  ok(w && w.length === 3, `lv${lv} ${t.item.id}: always 3 options`);
  if (w) stats[lv].push(pairs([t, ...w]));
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const share = (a, f) => a.filter(f).length / a.length;
console.log('look-alike pairs per question  easy', avg(stats[1]).toFixed(2), ' medium', avg(stats[2]).toFixed(2), ' hard', avg(stats[3]).toFixed(2));
// gems has 8 near-white stones; a few easy targets can't avoid every pair, so allow a small spill
ok(share(stats[1], p => p === 0) >= 0.9, `easy: no look-alike pair in ≥90% (${share(stats[1], p => p === 0).toFixed(2)})`);
ok(share(stats[2], p => p <= 1) >= 0.95, `medium: at most one pair in ≥95% (${share(stats[2], p => p <= 1).toFixed(2)})`);
ok(avg(stats[3]) > avg(stats[2]) && avg(stats[2]) >= avg(stats[1]), 'hard offers more look-alikes than medium, medium ≥ easy');
ok(share(stats[3], p => p >= 2) >= 0.4, `hard: 3+ similar options often (${share(stats[3], p => p >= 2).toFixed(2)})`);
console.log(`look_test: ${checks - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
