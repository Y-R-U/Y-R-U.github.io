#!/usr/bin/env node
// Moves reviewed candidate pictures (data/candidates/*.json) into the live packs. Refs: "<pack>:new/<key>" for titles not
// live yet, "<pack>:more/<key>" for extra pictures of titles already live (decided per title BEFORE this run's moves, the
// same rule mv_build uses), so rows left on an old ":new/" ref of a now-live title never count.
//   OK  → every OK picture is promoted (a title can keep both of its pictures, or gain an extra one): the scene loses `cand`,
//         its file moves media/cand/<pack>/ → the live media folder, the pack is rebuilt (mv_build).
//   Bad → the scene gets drop: true + dropWhy "Aaron review <date>: <reason> — <note>" in the prompts file (never regenerated
//         the same way) and its candidate file is deleted.
//   No verdict, or a verdict for a different src → left as a candidate (a sibling left over after an OK is offered again as a
//         "second picture"). Only with --finished (the review is explicitly over) is an unreviewed candidate of a title that
//         got an OK in this export dropped as "not chosen".
// Input: the verdicts export, either
//   ssh br8t "sqlite3 -json /srv/data/clued/clued.db \"SELECT ref, src, verdict, reason, note, mark, at FROM img_review\"" > v.json
//   or the admin GET /api/admin/imgreview body ({ reviews: [...] }).
// Usage: node tools/img_promote.mjs v.json [--apply] [--finished] [--no-index]   (dry run without --apply)
// --apply also runs mv_build (live + candidates), build_index, local_tags and leak_scan unless --no-index.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PACKS, sceneRel, refFor, hasLive, momentFile } from './mv_paths.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply'), FINISHED = args.includes('--finished');
if (!file) { console.log('usage: node tools/img_promote.mjs <verdicts.json> [--apply] [--finished] [--no-index]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const rows = new Map((Array.isArray(raw) ? raw : raw.reviews || []).map(r => [r.ref, r]));
const day = new Date().toISOString().slice(0, 10);
const run = (...a) => execFileSync('node', a, { cwd: ROOT, stdio: 'inherit' });

let livePacks = [], candPacks = [];
for (const [packId, def] of Object.entries(PACKS)) {
  const pf = path.join(ROOT, def.prompts);
  if (!fs.existsSync(pf)) continue;
  const cfg = JSON.parse(fs.readFileSync(pf, 'utf8'));
  const sum = { ok: [], extra: [], bad: {}, todo: 0, stale: [], missing: 0, notChosen: 0, rejected: [] };
  const moves = [];
  const exists = rel => fs.existsSync(path.join(ROOT, rel));
  for (const f of cfg.films) {
    const live = hasLive(exists, packId, f);
    const cs = [];
    f.scenes.forEach((sc, i) => {
      if (!sc.cand || sc.drop) return;
      const key = `${f.id}-${i + 1}`, from = path.join(ROOT, sceneRel(packId, key, sc));
      if (!fs.existsSync(from)) { sum.missing++; return; }
      let r = rows.get(refFor(packId, key, live));
      if (r?.verdict && r.src && path.basename(r.src.split('?')[0]) !== momentFile(key)) { sum.stale.push(key); r = null; }
      cs.push({ sc, key, from, r: r?.verdict ? r : null });
    });
    if (!cs.length) continue;
    const oks = cs.filter(c => c.r?.verdict === 'ok');
    const bads = cs.filter(c => c.r?.verdict === 'bad');
    const rest = cs.filter(c => !c.r);
    const drop = (c, why) => moves.push(() => { delete c.sc.cand; c.sc.drop = true; c.sc.dropWhy = why; fs.unlinkSync(c.from); });
    for (const c of bads) {
      const why = `Aaron review ${day}: ${c.r.reason || 'bad'}${c.r.note ? ` — ${c.r.note}` : ''}`;
      (sum.bad[c.r.reason || 'bad'] ||= []).push(`${f.name} (${c.key})${c.r.note ? `: ${c.r.note}` : ''}`);
      drop(c, why);
    }
    for (const c of oks) {
      (live ? sum.extra : sum.ok).push(`${f.name} (${c.key})`);
      moves.push(() => {
        delete c.sc.cand;
        const to = path.join(ROOT, sceneRel(packId, c.key, c.sc));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(c.from, to);
      });
    }
    if (FINISHED && oks.length) {
      const kept = oks.map(c => c.key).join(', ');
      for (const c of rest) { sum.notChosen++; drop(c, `Aaron review ${day}: not chosen (${kept} kept)`); }
    } else if (!oks.length && cs.every(c => c.r?.verdict === 'bad')) { if (!live) sum.rejected.push(f.name); }
    else if (rest.length) sum.todo++;
  }
  const nBad = Object.values(sum.bad).reduce((s, l) => s + l.length, 0);
  if (!sum.ok.length && !sum.extra.length && !nBad && !sum.todo && !sum.stale.length && !sum.missing) continue;
  console.log(`\n${packId}: ${sum.ok.length} pictures OK → live (new titles), ${sum.extra.length} extra pictures OK → live (titles already in), ${nBad} bad pictures dropped (${sum.rejected.length} titles rejected), ${sum.notChosen} unreviewed dropped as not chosen${FINISHED ? '' : ' (only with --finished)'}, ${sum.todo} titles still to review` +
    (sum.stale.length ? `, ${sum.stale.length} verdicts for an older picture (left as candidates)` : '') +
    (sum.missing ? `, ${sum.missing} candidate scenes without a file yet` : ''));
  for (const n of sum.ok) console.log('  ok ', n);
  for (const n of sum.extra) console.log('  extra', n);
  for (const [why, l] of Object.entries(sum.bad)) for (const n of l) console.log(`  bad[${why}]`, n);
  for (const k of sum.stale) console.log('  stale', k);
  if (APPLY && moves.length) {
    moves.forEach(m => m());
    fs.writeFileSync(pf, JSON.stringify(cfg, null, 1));
    if (sum.ok.length || sum.extra.length) livePacks.push(packId);
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
