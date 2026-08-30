#!/usr/bin/env node
// Batch bark generation from the terminal — the same plan the Characters tab runs, for when you
// want the whole cast done while you do something else.
//
//   node tools/devserver.mjs &                     # this needs the dev server for kokoro
//   node tools/vo/gen_barks.mjs --dry              # what would be generated, and why
//   node tools/vo/gen_barks.mjs                    # generate what changed, then sync the mirror
//   node tools/vo/gen_barks.mjs --who=greeter --cat=idle,greet --force
//   node tools/vo/gen_barks.mjs --sync             # only rewrite audio/vo/index.json
//   node tools/vo/gen_barks.mjs --prune            # list index entries whose line is gone
//
// data/vo.json is the ledger the tools read and write (the dev server only writes under data/);
// audio/vo/index.json is its mirror, which is where DEV_CONTRACT §8 says the sidecar lives.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planJobs, applyResults, pruneIndex, blankIndex, validateIndex, INDEX_DOC, INDEX_MIRROR,
  VO_DIR } from '../../js/dev/chars/vo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +(process.env.WF_DEV_PORT || 8796);
const BASE = process.env.WF_DEV_BASE || `http://127.0.0.1:${PORT}`;
const CHUNK = 40;

const flag = n => process.argv.includes(`--${n}`);
const opt = n => {
  const a = process.argv.find(x => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const list = n => (opt(n) || '').split(',').map(s => s.trim()).filter(Boolean);

const read = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch { return null; }
};
const write = (rel, doc) => {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n');
  return abs;
};

async function post(route, body, ms = 900000) {
  const r = await fetch(`${BASE}${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms) });
  return r.json();
}

function onDiskSet() {
  try {
    return new Set(fs.readdirSync(path.join(ROOT, VO_DIR))
      .filter(f => f.endsWith('.wav')).map(f => f.slice(0, -4)));
  } catch { return new Set(); }
}

function sync(index) {
  const problems = validateIndex(index);
  if (problems.length) {
    console.error(`refusing to mirror a broken index:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  write(INDEX_MIRROR, index);
  console.log(`mirrored ${Object.keys(index.clips).length} clips → ${INDEX_MIRROR}`);
}

const cast = read('data/characters.json')?.characters;
const barks = read('data/barks.json');
if (!cast || !barks) { console.error('data/characters.json or data/barks.json is missing'); process.exit(1); }
let index = read(INDEX_DOC) || blankIndex();

if (flag('sync')) { sync(index); process.exit(0); }

const who = list('who').length ? list('who') : Object.keys(cast).filter(k => cast[k].voice);
const categories = list('cat').length ? list('cat') : null;
const plan = planJobs({ cast, barks, index, who, categories, force: flag('force'), onDisk: onDiskSet() });

if (flag('prune')) {
  const all = planJobs({ cast, barks, index, who: Object.keys(cast) });
  const { index: next, orphans } = pruneIndex(index, all.live);
  if (!orphans.length) { console.log('no orphans'); process.exit(0); }
  console.log(orphans.map(o => `${o.key}  ${o.file}`).join('\n'));
  console.log(`\n${orphans.length} entries whose line no longer exists. The wav files are NOT deleted.`);
  write(INDEX_DOC, next);
  sync(next);
  process.exit(0);
}

console.log(`${plan.jobs.length} to generate, ${plan.skip.length} up to date`
  + (plan.noVoice.length ? `, ${plan.noVoice.length} lines with no voice set` : ''));
for (const n of plan.noVoice.slice(0, 5)) console.log(`  no voice: ${n.key}`);

if (flag('dry')) {
  for (const j of plan.jobs) console.log(`  ${j.why.padEnd(12)} ${j.key.padEnd(34)} ${j.voice} @${j.ttsSpeed}  ${j.text}`);
  process.exit(0);
}
if (!plan.jobs.length) { sync(index); process.exit(0); }

const up = await fetch(`${BASE}/api/status`).then(r => r.json()).catch(() => null);
if (!up?.devserver) { console.error(`no dev server at ${BASE} — run node tools/devserver.mjs`); process.exit(1); }
if (!up.kokoro) { console.error('the dev server cannot find kokoro; nothing would be written'); process.exit(1); }

const failed = [];
const t0 = Date.now();
for (let n = 0; n < plan.jobs.length; n += CHUNK) {
  const chunk = plan.jobs.slice(n, n + CHUNK);
  process.stdout.write(`  ${n + 1}–${n + chunk.length} of ${plan.jobs.length}… `);
  const r = await post('/api/tts/batch', { jobs: chunk.map(j => ({ voice: j.voice, text: j.text,
    speed: j.ttsSpeed, out: j.out })) });
  if (!r.results) { console.error(`\nbatch failed: ${r.error}`); break; }
  const applied = applyResults(index, chunk, r.results);
  index = applied.index;
  failed.push(...applied.failed);
  write(INDEX_DOC, index);
  console.log(`${chunk.length - applied.failed.length} written${applied.failed.length ? `, ${applied.failed.length} refused` : ''}`);
}
sync(index);
console.log(`\n${plan.jobs.length - failed.length}/${plan.jobs.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
// kokoro_say.py refuses a silent or too-short take. Those lines are defects in the script, not in
// the audio pipeline, so they are printed rather than retried.
for (const f of failed) console.error(`  REFUSED ${f.key}: ${f.error}`);
process.exit(failed.length ? 1 : 0);
