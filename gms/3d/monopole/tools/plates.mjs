#!/usr/bin/env node
// Generates the case-file plate for any story in content/stories.js that does not have one yet.
// Submits every missing plate to the mflux-queue server in one go and lets the queue serialise —
// the worker stays warm across the batch, so eighteen plates cost one model load.
//
//   node tools/plates.mjs            # only the missing ones
//   node tools/plates.mjs --force    # redo everything
//   node tools/plates.mjs --only=lysine_adm,visy_amcor

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stories from '../content/stories.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/story');
const MFLUX = 'http://localhost:7867';
const LTX = 'http://localhost:7866';
const W = 1024, H = 432;

// The existing six plates set the look and the new ones have to sit beside them without reading
// as a different game: near-black ground, flat shaded volumes, one subject, no text of any kind.
const STYLE = 'Flat shaded illustration on a near-black charcoal background, muted desaturated palette, '
  + 'soft single light source from the upper left, clean geometric forms with visible edges, '
  + 'wide cinematic composition with generous empty space, no lettering, no numbers, no logos, '
  + 'no watermarks, no signatures, no people, not a photograph.';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const only = args.only ? new Set(String(args.only).split(',')) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Flux and LTX cannot both hold a worker in 24 GB, so wait the video queue out before starting.
async function waitForLtx() {
  for (let i = 0; i < 200; i++) {
    const s = await fetch(`${LTX}/api/status`).then(r => r.json()).catch(() => null);
    if (!s || (!s.worker_warm && !s.running_job_id && !s.queue_depth)) return;
    if (i === 0) console.log('LTX is warm — waiting for it to release the GPU…');
    await sleep(5000);
  }
  throw new Error('LTX never went idle');
}

const jobs = stories
  .filter(s => (only ? only.has(s.id) : true))
  .filter(s => args.force || !existsSync(resolve(OUT, `${s.id}.jpg`)))
  .filter(s => s.imagePrompt);

if (!jobs.length) { console.log('nothing to generate'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
await waitForLtx();
console.log(`queueing ${jobs.length} plates at ${W}×${H}`);

const queued = [];
for (const s of jobs) {
  // the prompt in the content file describes the subject; the style tail is this file's business
  const prompt = `${s.imagePrompt.replace(/^Illustration\.\s*/i, '')} ${STYLE}`;
  const r = await fetch(`${MFLUX}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt, model: 'flux2-klein-4b', width: W, height: H,
      num_inference_steps: 14, seed: 1000 + queued.length * 7,
    }),
  }).then(r => r.json());
  if (!r.job_id) { console.log(`  ✗ ${s.id}: ${JSON.stringify(r)}`); continue; }
  queued.push({ id: s.id, job: r.job_id });
  console.log(`  → ${s.id}  ${r.job_id}`);
}

let done = 0;
for (const q of queued) {
  let st = null;
  for (let i = 0; i < 900; i++) {
    st = await fetch(`${MFLUX}/api/jobs/${q.job}`).then(r => r.json()).catch(() => null);
    if (st && (st.status === 'done' || st.status === 'error' || st.status === 'failed')) break;
    await sleep(2000);
  }
  if (st?.status !== 'done') { console.log(`  ✗ ${q.id}: ${st?.status} ${st?.error || ''}`); continue; }
  const png = resolve(OUT, `${q.id}.png`);
  const buf = Buffer.from(await fetch(`${MFLUX}/api/jobs/${q.job}/file/0`).then(r => r.arrayBuffer()));
  writeFileSync(png, buf);
  // sips is the only image tool on this box; the plates ship as jpg to match the existing six
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', png,
    '--out', resolve(OUT, `${q.id}.jpg`)], { stdio: 'ignore' });
  execFileSync('rm', ['-f', png]);
  done++;
  console.log(`  ✓ ${q.id}  (${done}/${queued.length})`);
}
console.log(`done: ${done}/${queued.length}`);
