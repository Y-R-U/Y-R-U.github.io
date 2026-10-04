// Movie Moments generator. Resumable: a scene is done when media/moments/<id>-<n>.webp exists.
// Usage: node tools/mv_gen.mjs [--pack movie-moments] [--only id,id] [--batch 6]
// Rejected scenes: node tools/mv_gen.mjs --reject id-n[,id-n] (deletes the webp, bumps the seed attempt).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import os from 'os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PACKS = {
  'movie-moments': { prompts: 'tools/mv_prompts.json', media: 'media/moments' },
  'book-moments': { prompts: 'tools/mv_prompts_books.json', media: 'media/book-moments' },
  'song-pictures': { prompts: 'tools/mv_prompts_songs.json', media: 'media/song-pictures' },
};
const pack = PACKS[arg('pack', 'movie-moments')];
let cfg = JSON.parse(fs.readFileSync(path.join(ROOT, pack.prompts), 'utf8'));
const MEDIA = path.join(ROOT, pack.media);
const STATE = path.join(ROOT, 'tools', 'mv_state.json');
const RAW = process.env.MV_RAW || path.join(os.homedir(), '.cache', 'clued-mv');
const Q = 'http://localhost:7867', LTX = 'http://localhost:7866';
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
let state = load();
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJ = async u => (await fetch(u)).json();

if (arg('reject')) {
  for (const key of arg('reject').split(',')) {
    const s = state[key] || (state[key] = { attempt: 0 });
    s.attempt = (s.attempt || 0) + 1;
    s.rejected = (s.rejected || 0) + 1;
    try { fs.unlinkSync(path.join(MEDIA, key + '.webp')); } catch {}
    console.log('rejected', key, '-> attempt', s.attempt);
  }
  save();
  process.exit(0);
}

async function waitLtxIdle() {
  for (let i = 0; i < 60; i++) {
    try { if (!(await getJ(LTX + '/api/status')).worker_warm) return; } catch { return; }
    console.log('waiting for LTX worker to unload…');
    await sleep(5000);
  }
}

const only = arg('only') ? new Set(arg('only').split(',')) : null;
const failed = new Set();
function scan() {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, pack.prompts), 'utf8')); // prompt edits apply on the next pass
  const todo = [];
  for (const f of cfg.films) {
    if (only && !only.has(f.id)) continue;
    f.scenes.forEach((sc, i) => {
      const key = `${f.id}-${i + 1}`;
      if (sc.drop || failed.has(key) || fs.existsSync(path.join(MEDIA, key + '.webp'))) return;
      todo.push({ key, sc, i });
    });
  }
  return todo.sort((a, b) => a.i - b.i); // every film's first scene before any second scene
}

const batch = +arg('batch', 6);
const seedFor = key => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h % 90000) + (load()[key]?.attempt || 0) * 7919;
};

async function submit({ key, sc }) {
  const seed = seedFor(key);
  const body = {
    mode: 'txt2img', prompt: `${sc.p}, ${cfg.style}`, model: cfg.model,
    width: cfg.width, height: cfg.height, num_inference_steps: cfg.steps, guidance: 1.0, seed, num_images: 1,
  };
  const r = await (await fetch(Q + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  return { key, seed, job: r.job_id };
}

async function finish({ key, seed, job }) {
  for (;;) {
    const j = await getJ(`${Q}/api/jobs/${job}`);
    if (j.status === 'done') break;
    if (j.status === 'failed' || j.status === 'cancelled') { console.log('FAIL', key, j.error || j.status); failed.add(key); return; }
    await sleep(2500);
  }
  const raw = path.join(RAW, `${key}.png`);
  fs.writeFileSync(raw, Buffer.from(await (await fetch(`${Q}/api/jobs/${job}/file/0`)).arrayBuffer()));
  const out = path.join(MEDIA, `${key}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '82', '-resize', '640', '0', raw, '-o', out]);
  state = load();
  state[key] = { ...(state[key] || {}), seed, model: cfg.model, at: new Date().toISOString() };
  save();
  console.log('ok', key, Math.round(fs.statSync(out).size / 1024) + 'KB');
}

const pending = [];
process.on('SIGTERM', async () => {
  await Promise.all(pending.map(p => fetch(`${Q}/api/jobs/${p.job}`, { method: 'DELETE' }).catch(() => {})));
  process.exit(0);
});
await waitLtxIdle();
for (let todo = scan(); todo.length; todo = scan()) {
  console.log(todo.length, 'scenes to generate');
  let next = 0;
  while (next < todo.length || pending.length) {
    while (pending.length < batch && next < todo.length) { await waitLtxIdle(); pending.push(await submit(todo[next++])); }
    await finish(pending.shift());
  }
}
console.log('done');
