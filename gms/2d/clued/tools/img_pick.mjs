#!/usr/bin/env node
// After the blind check: keep the best candidate scene per item, drop the rest (drop + dropWhy, file deleted).
// Best = the VLM named it first > in its top 3 > missed; a tie keeps the earlier scene (the more iconic idea).
// An item the VLM missed every time is dropped unless listed with --keep (my judgement from the contact sheet).
// Only items whose candidate scenes all have a file and a blind result are touched.
// Usage: node tools/img_pick.mjs [--pack movie-moments] [--keep id,id] [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { PACKS, sceneRel } from './mv_paths.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes('--' + k) ? args[args.indexOf('--' + k) + 1] : d);
const packId = arg('pack', 'movie-moments'), APPLY = args.includes('--apply');
const keep = new Set((arg('keep', '') || '').split(',').filter(Boolean));
const pf = path.join(ROOT, PACKS[packId].prompts);
const cfg = JSON.parse(fs.readFileSync(pf, 'utf8'));
const blindFile = path.join(ROOT, `tools/mv_blind_${packId}.json`);
const blind = fs.existsSync(blindFile) ? JSON.parse(fs.readFileSync(blindFile, 'utf8')) : {};
const score = r => (r === 1 ? 3 : r > 0 ? 2 : 1);
const sum = { kept: [], keptByHand: [], droppedItems: [], droppedScenes: 0, waiting: 0 };
const drops = [];

for (const f of cfg.films) {
  const live = f.scenes.some(s => !s.cand && !s.drop);
  const c = f.scenes.map((sc, i) => ({ sc, i, key: `${f.id}-${i + 1}` })).filter(x => x.sc.cand && !x.sc.drop);
  if (!c.length) continue;
  if (c.some(x => !fs.existsSync(path.join(ROOT, sceneRel(packId, x.key, x.sc))) || !blind[x.key])) { sum.waiting++; continue; }
  if (c.length === 1 && c[0].sc.picked) continue;
  const best = c.reduce((a, b) => (score(blind[b.key].rank) > score(blind[a.key].rank) ? b : a));
  const missed = !blind[best.key].rank;
  for (const x of c) {
    const r = blind[x.key];
    if (x === best && (!missed || keep.has(f.id) || live)) { x.sc.picked = true; continue; }
    const why = x === best
      ? `IMG blind check ${new Date().toISOString().slice(0, 10)}: the VLM could not name it (${r.guesses.join(' / ')})`
      : `IMG blind check ${new Date().toISOString().slice(0, 10)}: weaker candidate (rank ${r.rank || '-'} vs ${blind[best.key].rank || '-'} for scene ${best.i + 1})`;
    drops.push({ x, why });
  }
  if (!missed) sum.kept.push(`${best.key} (#${blind[best.key].rank})`);
  else if (keep.has(f.id) || live) sum.keptByHand.push(best.key);
  else sum.droppedItems.push(`${f.id}: ${blind[best.key].guesses.join(' / ')}`);
}
sum.droppedScenes = drops.length;
console.log(`${packId}: kept ${sum.kept.length} named by the VLM, ${sum.keptByHand.length} kept by hand, ${sum.droppedItems.length} items dropped, ${drops.length} scenes dropped, ${sum.waiting} items still waiting`);
for (const k of sum.keptByHand) console.log('  by hand', k);
for (const d of sum.droppedItems) console.log('  dropped item', d);
if (!APPLY) { console.log('dry run; --apply to write'); process.exit(0); }
for (const { x, why } of drops) {
  try { fs.unlinkSync(path.join(ROOT, sceneRel(packId, x.key, x.sc))); } catch {}
  x.sc.drop = true;
  x.sc.dropWhy = why;
}
fs.writeFileSync(pf, JSON.stringify(cfg, null, 1));
console.log('written; rebuild: node tools/mv_build.mjs', packId, '--candidates');
