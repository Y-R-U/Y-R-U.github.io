// Broker and lender portraits, generated on the local mflux queue and downsampled to the size the
// chat header actually draws them at. Run it once; the results are committed.
//
//   node tools/faces.mjs            # generate anything missing
//   node tools/faces.mjs --force    # regenerate everything

import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../assets/faces');
const HOST = 'http://192.168.0.236:7867';

const LOOK = 'head and shoulders portrait, looking straight at camera, one cool blue-white key light '
  + 'from the left and a warm amber rim from behind, dark out-of-focus industrial station interior, '
  + 'shallow depth of field, teal and amber colour grade, deep blacks, fine film grain, '
  + 'photographic, 85mm, no text, no logo';

const FACES = [
  { id: 'brann', p: 'a weathered man in his fifties, broad face, grey stubble, broken nose, worn high-collar work jacket with a yard pass clipped to it' },
  { id: 'otey', p: 'a woman in her forties with close-cropped dark hair, hard eyes, a faded burn scar along one cheek, quilted flight jacket' },
  { id: 'sabe', p: 'a wiry man in his thirties, deep brown skin, shaved head, small silver ear cuff, oil-stained coveralls open at the collar' },
  { id: 'merrow', p: 'a composed woman in her fifties, silver hair pinned back, rimless lenses, dark high-buttoned institutional coat' },
  { id: 'vosk', p: 'a lean man in his forties, slicked-back hair, thin smile, expensive dark coat over a cheap shirt' },
  { id: 'pell', p: 'an older woman in her sixties, soft face, pearl studs, immaculate charcoal suit, patient expression' },
  { id: 'veya', p: 'a woman in her early thirties, long dark hair tied back, freckles, half-smile, padded yard jacket with reflective tape' },
  { id: 'tolm', p: 'a heavyset man in his thirties, red beard, sunburnt, ear defenders slung round his neck, hi-vis over a work shirt' },
  { id: 'hask', p: 'a woman in her fifties, weathered olive skin, grey braid over one shoulder, missing front tooth, leather yard apron' },
];

const post = async (path, body) => {
  const r = await fetch(HOST + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
};
const get = async path => {
  const r = await fetch(HOST + path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = async p => access(p).then(() => true, () => false);

// LTX and Flux cannot both hold a worker in 24 GB, so a warm LTX has to be waited out.
async function waitForLtx() {
  for (let i = 0; i < 200; i++) {
    try {
      const s = await (await fetch('http://192.168.0.236:7866/api/status')).json();
      if (!s.worker_warm && !s.running_job_id) return;
    } catch { return; }
    if (i === 0) console.log('LTX is warm — waiting for it to release the GPU');
    await sleep(6000);
  }
  throw new Error('LTX never went idle');
}

// the seed is the position in FACES, not anything derived from the id — seven of the nine ids are
// four characters long and `id.length` drew the same portrait composition for all of them
async function generate(face, i) {
  const { job_id } = await post('/api/generate', {
    prompt: `${face.p}, ${LOOK}`,
    model: 'flux2-klein-4b',
    width: 512, height: 512,
    num_inference_steps: 16,
    seed: 1000 + i * 137,
    num_images: 1,
  });
  process.stdout.write(`${face.id} → job ${job_id} `);
  for (;;) {
    const j = await get(`/api/jobs/${job_id}`);
    if (j.status === 'done') break;
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error(`${face.id}: ${j.status} ${j.error || ''}`);
    process.stdout.write('.');
    await sleep(4000);
  }
  const png = resolve(OUT, `${face.id}.png`);
  const buf = Buffer.from(await (await fetch(`${HOST}/api/jobs/${job_id}/file/0`)).arrayBuffer());
  await writeFile(png, buf);
  const jpg = resolve(OUT, `${face.id}.jpg`);
  await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', '192', png, '--out', jpg]);
  await run('rm', [png]);
  console.log(' done');
}

const force = process.argv.includes('--force');
await mkdir(OUT, { recursive: true });
await waitForLtx();
for (const [i, f] of FACES.entries()) {
  if (!force && await exists(resolve(OUT, `${f.id}.jpg`))) { console.log(`${f.id} — already there`); continue; }
  await generate(f, i);
}
console.log('faces done');
