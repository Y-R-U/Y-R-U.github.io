#!/usr/bin/env node
// Flux art for NINE STRINGS. Everything here is art that never touches a frame
// budget (D2): portraits, backdrops, title, story panels. Entity sprites are
// procedural and are NOT generated here.
//
//   node tools/gen_art.mjs                 generate everything missing
//   node tools/gen_art.mjs --only title    just the ids matching a substring
//   node tools/gen_art.mjs --force         regenerate even if the file exists
//   node tools/gen_art.mjs --list          print the manifest and exit
//
// The queue serialises across sessions by itself - do not add a lockfile, it
// just fights the queue.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ART = join(HERE, '../art');
const API = process.env.MFLUX || 'http://127.0.0.1:7867';
const MODEL = 'flux2-klein-9b-mlx-4bit';
const STEPS = 12;

// The house style. Every prompt is suffixed with this, because consistency
// across a cast is a function of a shared suffix far more than of any one
// prompt's wording.
const STYLE =
  'dark gothic horror illustration, heavy chiaroscuro, near-black background, ' +
  'bone-white skin, wet black ink shadows, fine etched linework, volumetric haze, ' +
  'cinematic lighting, painterly, very high contrast, desaturated palette except ' +
  'one saturated accent colour, grim, solemn, no text, no watermark, no signature';

const P = (id, w, h, prompt) => ({ id, w, h, prompt: prompt + ', ' + STYLE });

const MANIFEST = [
  // ---- key art -------------------------------------------------------
  P('title', 768, 1024,
    'key art: a lone figure in a long coat stands in a flooded night street holding a pair of ' +
    'shears, surrounded by shambling corpses that hang from thin luminous crimson threads ' +
    'rising into the black sky above, the threads glowing like hot wire, rain, reflected light ' +
    'on wet cobbles'),

  // ---- the cast (DESIGN section 6) -----------------------------------
  P('char_wick', 640, 832,
    'portrait bust of a young lamplighter, soot-smeared face, short dark hair, heavy oilskin ' +
    'coat, carrying a small brass lamp whose amber flame is the only warm light, wary ' +
    'exhausted expression, three-quarter view'),
  P('char_vane', 640, 832,
    'portrait bust of a severe middle-aged nun in a ragged habit, a censer on a chain trailing ' +
    'pale green smoke around her, ash on her cheekbones, eyes closed in prayer, three-quarter view'),
  P('char_dredge', 640, 832,
    'portrait bust of a huge weathered gravedigger, grey stubble, leather apron over bare arms, ' +
    'a rusted bonesaw over one shoulder, mud and rain, flat unbothered expression, three-quarter view'),
  P('char_ilse', 640, 832,
    'portrait bust of a pale silent young woman with cropped white hair and a blindfold of grey ' +
    'silk, holding long silver shears, thin luminous cyan threads drift past her face, ' +
    'three-quarter view'),
  P('char_ash', 640, 832,
    'portrait bust of an old cardinal in scorched crimson vestments, a heavy iron bell at his ' +
    'belt, burn scars across one side of his face, furious zealous stare, embers in the air, ' +
    'three-quarter view'),
  P('char_hand', 640, 832,
    'portrait bust of a hooded figure whose face is in total shadow except two faint violet ' +
    'points of light, luminous violet threads run from its fingertips out of frame, calm and ' +
    'wrong, three-quarter view'),

  // ---- the Choirmasters (DESIGN section 7) ---------------------------
  P('boss_hollowth', 640, 832,
    'portrait of a monstrous bloated chorister demon, its ribcage cracked open into a second ' +
    'gaping singing mouth, tattered choir robes, crimson threads pouring from its throat, ' +
    'swollen and pale, horrifying'),
  P('boss_vellish', 640, 832,
    'portrait of a tall spindly weaver demon with far too many thin arms, each hand spinning ' +
    'luminous green thread, a face like a smooth eyeless mask, drowned chapel behind, water ' +
    'to its knees'),
  P('boss_morrow', 640, 832,
    'portrait of an elegant conductor demon in a burnt black tailcoat, no head but a floating ' +
    'crown of burning orange batons, both arms raised mid-downbeat, ash falling, an orchestra ' +
    'of corpses behind'),
  P('boss_ninth', 640, 832,
    'portrait of an immense pale figure seated on a throne of woven human thread, its whole ' +
    'body made of countless luminous violet strings pulled taut, a serene enormous face, ' +
    'cathedral darkness'),

  // ---- act backdrops (menu / stage-select / dialogue backgrounds) ----
  P('act1', 720, 1280,
    'empty flooded cobbled town street at night, gas lamps, overturned cart, black water, cold ' +
    'amber light, thin crimson threads drifting overhead, no people'),
  P('act2', 720, 1280,
    'drowned marsh at dusk, dead trees, a half-sunken stone chapel, mist over still green-black ' +
    'water, pale green light, thin threads caught on the branches, no people'),
  P('act3', 720, 1280,
    'burning ruined city avenue, collapsed tenements, ash falling like snow, ember-orange glow ' +
    'through smoke, a distant concert hall facade, no people'),
  P('act4', 720, 1280,
    'vast underground cathedral of bone and woven thread, impossible scale, violet light from ' +
    'far below, hanging cocoons, stairs descending into dark, no people'),
  P('sanctum', 720, 1280,
    'a small candlelit stone crypt used as a sanctuary, an altar of melted wax, shelves of ' +
    'relics and jars, warm gold candlelight against deep blue-black shadow, quiet and safe, ' +
    'no people'),
];

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const oi = args.indexOf('--only');
const ONLY = oi >= 0 ? args[oi + 1] : null;

if (args.includes('--list')) {
  for (const m of MANIFEST) console.log(`${m.id.padEnd(16)} ${m.w}x${m.h}`);
  process.exit(0);
}

const api = async (path, opts) => {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(ART, { recursive: true });

const todo = MANIFEST.filter((m) => (!ONLY || m.id.includes(ONLY)) &&
                                    (FORCE || !existsSync(join(ART, m.id + '.png'))));
if (!todo.length) { console.log('nothing to generate'); process.exit(0); }

const status = await (await api('/api/status')).json();
console.log(`mflux: warm=${status.worker_warm} depth=${status.queue_depth}`);
console.log(`generating ${todo.length} image(s)\n`);

// Submit the whole batch first. The worker stays warm across queued jobs, so
// back-to-back submission is dramatically cheaper than one-at-a-time.
const jobs = [];
for (const m of todo) {
  const body = JSON.stringify({
    mode: 'txt2img', prompt: m.prompt, model: MODEL,
    width: m.w, height: m.h, num_inference_steps: STEPS,
    seed: Math.abs([...m.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 100000,
    num_images: 1,
  });
  const { job_id } = await (await api('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })).json();
  jobs.push({ ...m, job_id });
  console.log(`  queued  ${m.id}  (${job_id})`);
}

console.log('');
let done = 0;
for (const j of jobs) {
  for (;;) {
    const job = await (await api(`/api/jobs/${j.job_id}`)).json();
    if (job.status === 'done') break;
    if (job.status === 'failed' || job.status === 'cancelled') {
      console.log(`  FAIL    ${j.id}  ${job.error || job.status}`);
      j.failed = true; break;
    }
    await sleep(3000);
  }
  if (j.failed) continue;
  const buf = Buffer.from(await (await api(`/api/jobs/${j.job_id}/file/0`)).arrayBuffer());
  const out = join(ART, j.id + '.png');
  writeFileSync(out, buf);
  done++;
  console.log(`  ok      ${j.id}  ${(buf.length / 1024).toFixed(0)}KB  -> art/${j.id}.png`);
}
console.log(`\n${done}/${jobs.length} generated`);
