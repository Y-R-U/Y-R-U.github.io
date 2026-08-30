#!/usr/bin/env node
// Generates one dummy skin on the local mflux queue and writes it to art/skins/<out>.png with a
// sidecar .json recording exactly what made it, so any skin in the game can be regenerated.
//
//   node tools/skin/skin.mjs --desc="a rusted iron knight" --out=knight --seed=7
//   node tools/skin/skin.mjs --desc="…" --mode=txt2img          ← no pose reference
//   node tools/skin/skin.mjs --desc="…" --raw --prompt="…"      ← your own prompt, no wrapper
//
// The dev tab posts the same fields through the dev server's /api/skin; this file is the one that
// owns the prompt wrapper, and both routes call buildPrompt().

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS } from './layout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FLUX = process.env.WF_FLUX || 'http://localhost:7867';

// The reference is a grey mannequin in the exact UV projection, so every instruction is about NOT
// moving it. "Do not change the outline" is the single line that most changes the hit rate: without
// it Flux re-poses the figure, and a re-posed figure is a texture whose arms are painted on the
// background.
export function buildPrompt(desc, mode) {
  const look = 'flat matte hand-painted game texture, even flat lighting, no cast shadows, '
    + 'no ground shadow, plain solid white background, no text, no labels, no watermark, '
    + 'no border, full body from head to feet, orthographic, centred';
  if (mode === 'edit') {
    return `Paint this grey mannequin reference sheet as ${desc}. `
      + 'Keep both figures exactly where they are: same pose, same outline, same height, same '
      + 'width, same position on the sheet. The left figure is the front of the character and the '
      + 'right figure is the same character seen from behind. Paint clothing, armour, skin and '
      + 'detail onto the mannequin without changing its silhouette. Arms hang straight down at the '
      + `sides, legs straight, feet on the ground. ${look}.`;
  }
  return `Character texture sheet of ${desc}. Two full-body figures side by side at the same size: `
    + 'the left one is the front view, the right one is the back view of the same character. '
    + 'Standing straight, arms hanging down at the sides, legs together, feet flat. '
    + `${look}.`;
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jf(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

let uploaded = null;
export async function uploadRef(file) {
  if (uploaded && uploaded.file === file) return uploaded.path;
  const body = new FormData();
  body.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), 'ref.png');
  const r = await jf(`${FLUX}/api/upload`, { method: 'POST', body });
  uploaded = { file, path: r.path };
  return r.path;
}

export async function generate({ desc, prompt, mode = 'edit', seed, steps = 14, model = 'flux2-klein-4b',
  ref = 'art/skin/pose_ref.png', w = ATLAS.w, h = ATLAS.h, onNote } = {}) {
  const text = prompt || buildPrompt(desc, mode);
  const paths = mode === 'edit' ? [await uploadRef(resolve(ROOT, ref))] : [];
  const sub = await jf(`${FLUX}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt: text, model, width: w, height: h,
      num_inference_steps: +steps, seed: seed === undefined ? Date.now() % 100000 : +seed,
      num_images: 1, image_paths: paths }),
  });
  if (!sub.job_id) throw new Error(`mflux refused: ${JSON.stringify(sub).slice(0, 200)}`);
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    await sleep(2000);
    const j = await jf(`${FLUX}/api/jobs/${sub.job_id}`);
    onNote?.(j.status, j.events?.at(-1)?.message || '');
    if (j.status === 'done') {
      const buf = Buffer.from(await (await fetch(`${FLUX}/api/jobs/${sub.job_id}/file/0`)).arrayBuffer());
      return { buf, job: sub.job_id, prompt: text, seed: j.params?.seed ?? seed, mode, model,
        steps: +steps, ref: mode === 'edit' ? ref : null, seconds: (Date.now() - t0) / 1000 };
    }
    if (j.status === 'failed' || j.status === 'cancelled') throw new Error(`mflux ${j.status}: ${j.error || ''}`);
    if (i > 600) throw new Error('mflux did not finish in 20 minutes');
  }
}

export function writeSkin(name, r) {
  const dir = resolve(ROOT, 'art/skins');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${name}.png`), r.buf);
  const { buf, ...meta } = r;
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify({ id: name, ...meta, at: new Date().toISOString() }, null, 2));
  return `art/skins/${name}.png`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const name = args.out || `skin_${Date.now() % 100000}`;
  if (!args.desc && !args.prompt) {
    console.error('need --desc="…" (or --raw --prompt="…")');
    process.exit(1);
  }
  const r = await generate({
    desc: args.desc, prompt: args.raw ? args.prompt : null, mode: args.mode || 'edit',
    seed: args.seed, steps: args.steps || 14, model: args.model, ref: args.ref,
    onNote: (s, m) => process.stdout.write(`\r${name}: ${s} ${m}          `),
  });
  console.log(`\n${writeSkin(name, r)}  seed ${r.seed}  ${r.seconds.toFixed(0)}s`);
}
