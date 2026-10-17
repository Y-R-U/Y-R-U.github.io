#!/usr/bin/env node
// Moves reviewed candidate pictures (data/candidates/*.json, refs "<pack>:new/<scene key>") into the live packs.
// Titles can have two candidates (Aaron picks one on review.html): at most one picture per title is promoted, the OK one;
// its siblings are dropped as "not chosen" (not Bad). Two OKs (shouldn't happen): the later `at`, else the first, logged.
//   OK  → the scene loses `cand`, its file moves media/cand/<pack>/ → the live media folder, the pack is rebuilt (mv_build).
//   Bad → the scene gets drop: true + dropWhy "Aaron review <date>: <reason> — <note>" in the prompts file (never regenerated
//         the same way) and its candidate file is deleted.
//   No verdict, or a verdict for a different src → left as a candidate.
// Input: the verdicts export, either
//   ssh br8t "sqlite3 -json /srv/data/clued/clued.db \"SELECT ref, src, verdict, reason, note, mark, at FROM img_review\"" > v.json
//   or the admin GET /api/admin/imgreview body ({ reviews: [...] }).
// Usage: node tools/img_promote.mjs v.json [--apply] [--no-index]   (dry run without --apply)
// --apply also runs mv_build (live + candidates), build_index, local_tags and leak_scan unless --no-index.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PACKS, sceneRel, candRef, momentFile } from './mv_paths.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!file) { console.log('usage: node tools/img_promote.mjs <verdicts.json> [--apply] [--no-index]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const rows = new Map((Array.isArray(raw) ? raw : raw.reviews || []).map(r => [r.ref, r]));
const day = new Date().toISOString().slice(0, 10);
const run = (...a) => execFileSync('node', a, { cwd: ROOT, stdio: 'inherit' });

let livePacks = [], candPacks = [];
for (const [packId, def] of Object.entries(PACKS)) {
  const pf = path.join(ROOT, def.prompts);
  if (!fs.existsSync(pf)) continue;
  const cfg = JSON.parse(fs.readFileSync(pf, 'utf8'));
  const sum = { ok: [], bad: {}, todo: 0, stale: [], missing: 0, twoOk: [], notChosen: 0, rejected: [] };
  const moves = [];
  for (const f of cfg.films) {
    // a title has up to two candidates on review.html: one OK picks it (the rest are "not chosen"); all Bad rejects it
    const cs = [];
    f.scenes.forEach((sc, i) => {
      if (!sc.cand || sc.drop) return;
      const key = `${f.id}-${i + 1}`, from = path.join(ROOT, sceneRel(packId, key, sc));
      if (!fs.existsSync(from)) { sum.missing++; return; }
      let r = rows.get(candRef(packId, key));
      if (r?.verdict && r.src && path.basename(r.src.split('?')[0]) !== momentFile(key)) { sum.stale.push(key); r = null; }
      cs.push({ sc, key, from, r: r?.verdict ? r : null });
    });
    if (!cs.length) continue;
    const oks = cs.filter(c => c.r?.verdict === 'ok');
    const bads = cs.filter(c => c.r?.verdict === 'bad');
    const drop = (c, why) => moves.push(() => { delete c.sc.cand; c.sc.drop = true; c.sc.dropWhy = why; fs.unlinkSync(c.from); });
    for (const c of bads) {
      const why = `Aaron review ${day}: ${c.r.reason || 'bad'}${c.r.note ? ` — ${c.r.note}` : ''}`;
      (sum.bad[c.r.reason || 'bad'] ||= []).push(`${f.name} (${c.key})${c.r.note ? `: ${c.r.note}` : ''}`);
      drop(c, why);
    }
    if (oks.length) {
      // both OK should not happen (the page clears the other); take the one marked later, else the first
      const pick = oks.reduce((a, b) => ((+b.r.at || 0) > (+a.r.at || 0) ? b : a));
      if (oks.length > 1) { sum.twoOk.push(`${f.name}: took ${pick.key} (${pick.r.at ? 'marked later' : 'first'}) over ${oks.filter(c => c !== pick).map(c => c.key).join(', ')}`); }
      sum.ok.push(`${f.name} (${pick.key})`);
      moves.push(() => {
        delete pick.sc.cand;
        const to = path.join(ROOT, sceneRel(packId, pick.key, pick.sc));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(pick.from, to);
      });
      for (const c of cs) if (c !== pick && !bads.includes(c)) { sum.notChosen++; drop(c, `Aaron review ${day}: not chosen (${pick.key} was picked)`); }
    } else if (cs.every(c => c.r?.verdict === 'bad')) sum.rejected.push(f.name);
    else sum.todo++;
  }
  const nBad = Object.values(sum.bad).reduce((s, l) => s + l.length, 0);
  if (!sum.ok.length && !nBad && !sum.todo && !sum.stale.length && !sum.missing) continue;
  console.log(`\n${packId}: ${sum.ok.length} titles OK → live, ${nBad} bad pictures dropped (${sum.rejected.length} titles rejected), ${sum.notChosen} not-chosen siblings dropped, ${sum.todo} titles still to review` +
    (sum.stale.length ? `, ${sum.stale.length} verdicts for an older picture (left as candidates)` : '') +
    (sum.missing ? `, ${sum.missing} candidate scenes without a file yet` : ''));
  for (const n of sum.ok) console.log('  ok ', n);
  for (const [why, l] of Object.entries(sum.bad)) for (const n of l) console.log(`  bad[${why}]`, n);
  for (const k of sum.stale) console.log('  stale', k);
  for (const t of sum.twoOk) console.log('  two OK:', t);
  if (APPLY && moves.length) {
    moves.forEach(m => m());
    fs.writeFileSync(pf, JSON.stringify(cfg, null, 1));
    if (sum.ok.length) livePacks.push(packId);
    candPacks.push(packId);
  }
}

if (!APPLY) { console.log('\nDry run. Rerun with --apply to move the files and rebuild.'); process.exit(0); }
for (const id of livePacks) run('tools/mv_build.mjs', id);
for (const id of candPacks) run('tools/mv_build.mjs', id, '--candidates');
if (livePacks.length && !args.includes('--no-index')) {
  run('tools/build_index.mjs');
  run('tools/local_tags.mjs');
  run('tools/leak_scan.mjs');
}
console.log(livePacks.length ? `\nLive packs rebuilt: ${livePacks.join(', ')}. Ship media/<pack folder> + data/ (static rsync).` : '\nNo live pack changed.');
