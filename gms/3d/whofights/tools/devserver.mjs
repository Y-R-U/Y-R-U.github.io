// Authoring server for the dev tools: static files plus the routes in docs/DEV_CONTRACT.md §2.
// Node, no dependencies.  node tools/devserver.mjs [--port 8796]
//
// The shipped game never talks to this. It is only ever reached from a machine on the LAN, and
// every route that writes refuses a caller that is not loopback or private.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(argOf('--port') || process.env.WF_DEV_PORT || 8796);
const ACE = process.env.WF_ACE || 'http://localhost:8001';
const FLUX = process.env.WF_FLUX || 'http://localhost:7867';
const LTX = process.env.WF_LTX || 'http://localhost:7866';
const KOKORO_PY = process.env.WF_KOKORO_PY || '/Users/aaronair/.local/share/uv/tools/abogen/bin/python';
const KOKORO_SCRIPT = path.join(ROOT, 'tools/vo/kokoro_say.py');

// index.html's importmap points at `../../lib/three/...`, which the browser normalises to /lib/...
// — above this server's root. Without these read-only mounts the game cannot boot under it at all.
const MOUNTS = [
  ['/lib/', path.resolve(ROOT, '../../lib')],
  ['/assets/', path.resolve(ROOT, '../../../assets')],
];

const LS_DIRS = new Set(['data', 'data/levels', 'audio/vo', 'audio/music', 'art', 'art/skin', 'art/skins', 'tools/vo', 'js/dev/tabs']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.md': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith(flag + '='));
  return eq ? eq.slice(flag.length + 1) : null;
}

// ── who is allowed to write ────────────────────────────────────────────────
// Same rule as js/dev/gate.js, applied to the *caller* rather than the page. Loopback is taken as
// the whole /8 here because Node reports whatever the socket says.
function remoteIsLocal(req) {
  let a = req.socket.remoteAddress || '';
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || /^127\./.test(a)) return true;
  if (/^fe80:/i.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a)) return true;
  return /^(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(a);
}

// A page on the open internet sitting in Aaron's browser can reach localhost. The socket check
// cannot see that; the Origin header can.
function originOK(req) {
  const o = req.headers.origin;
  if (!o || o === 'null') return true;
  try {
    const u = new URL(o);
    const h = u.hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127\./.test(h) || h.endsWith('.local')
      || /^(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(h);
  } catch { return false; }
}

const send = (res, code, obj, extra = {}) => {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-store', ...extra });
  res.end(body);
};

async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new Error(`body over ${limit} bytes`);
    chunks.push(c);
  }
  if (!n) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// ── paths ──────────────────────────────────────────────────────────────────
const SAFE_REL = /^[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*$/;

// data/ only, .json only, and the resolved path is checked against the resolved root, so neither a
// symlink nor an escape sequence gets out. Nothing here decodes, so the charset has to be narrow
// too: a literal `%2e%2e` is a perfectly legal directory name and used to accrete junk under data/
// that then showed up in /api/ls.
function dataPath(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path required');
  let rel = p.replace(/^\/+/, '');
  if (!rel.startsWith('data/')) rel = `data/${rel}`;
  if (!rel.endsWith('.json')) throw new Error('only .json files may be written');
  if (!SAFE_REL.test(rel) || rel.includes('..')) {
    throw new Error('path may only contain letters, digits, . _ - and /');
  }
  const abs = path.resolve(ROOT, rel);
  const base = path.resolve(ROOT, 'data') + path.sep;
  if (!abs.startsWith(base)) throw new Error('path escapes data/');
  return { abs, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
}

// Output names for generated assets: a flat-ish name under a fixed directory, never a path.
// The extension is stripped only when it is the one being written. Stripping any trailing dot-suffix
// turned `tavern.v2` and `tavern.v3` into the same `tavern.mp3`, and both calls reported success.
function assetPath(dir, name, ext) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('out required');
  const clean = name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
  if (!SAFE_REL.test(clean) || clean.includes('..')) {
    throw new Error('out may only contain letters, digits, . _ - and /');
  }
  const abs = path.resolve(ROOT, dir, clean + ext);
  const base = path.resolve(ROOT, dir) + path.sep;
  if (!abs.startsWith(base)) throw new Error('out escapes ' + dir);
  return { abs, name: clean, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
}

// Temp file then rename: a killed process leaves either the old document or the new one, never
// half of one. This is the whole reason /api/save exists rather than a plain fs.writeFile.
async function writeAtomic(abs, text) {
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally { await fh.close(); }
  await fsp.rename(tmp, abs);
  return Buffer.byteLength(text);
}

// ── backend probes, passive ────────────────────────────────────────────────
// ACE-Step and mflux both unload after 120 s idle. /admin/status and /api/status are the endpoints
// that do NOT wake them, which is why the status route uses those and nothing else.
let statusCache = { at: 0, val: null };

async function probe(url, ms = 1200) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function status() {
  if (Date.now() - statusCache.at < 3000 && statusCache.val) return statusCache.val;
  const [ace, flux, ltx] = await Promise.all([
    probe(`${ACE}/admin/status`), probe(`${FLUX}/api/status`), probe(`${LTX}/api/status`),
  ]);
  const val = {
    ok: true, devserver: true, root: ROOT, port: PORT,
    kokoro: fs.existsSync(KOKORO_PY) && fs.existsSync(KOKORO_SCRIPT),
    ace: !!ace, flux: !!flux,
    detail: {
      kokoroPython: KOKORO_PY,
      aceLoaded: ace ? !!ace.loaded : null,
      fluxWarm: flux ? !!flux.worker_warm : null,
      fluxQueue: flux ? flux.queue_depth : null,
      ltxWarm: ltx ? !!ltx.worker_warm : null,
    },
    queue: queueSummary(),
  };
  statusCache = { at: Date.now(), val };
  return val;
}

// ── the one GPU slot ───────────────────────────────────────────────────────
// ACE-Step and Flux cannot co-reside in 24 GB, so both go through this queue and only one runs.
// LTX is not ours but holds ~16 GB when warm, so a job waits for it to drop first.
const jobs = new Map();
const pending = [];
let running = null;
const JOB_KEEP = 200;
const VRAM_POLL_MS = +(process.env.WF_VRAM_POLL_MS || 5000);

function queueSummary() {
  return { running: running ? { id: running.id, kind: running.kind, note: running.note } : null,
    waiting: pending.length };
}

function enqueue(kind, run, meta) {
  const id = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const job = { id, kind, state: 'queued', note: 'queued', at: Date.now(), ...meta, run };
  jobs.set(id, job);
  pending.push(job);
  job.position = pending.length;
  // Scheduled, not called: the POST response must describe the queue as the caller found it.
  setTimeout(pump, 0);
  return job;
}

// runMusic and runFlux bound themselves; runSkin hands off to tools/skin/skin.mjs and inherits
// whatever that does, and one run that never settled used to strand every job behind it.
// Abandoned, not killed — nothing here can stop a fetch already in flight, it just stops holding the
// slot, and freeVRAM is what keeps the abandoned model off the next job.
async function runJob(job) {
  job.state = 'running';
  job.position = 0;
  job.startedAt = Date.now();
  const capMin = +(process.env.WF_JOB_MAX_MIN || 45);
  let timer;
  const guard = new Promise((_, reject) => {
    job.abort = why => { clearTimeout(timer); job.abort = null; reject(new Error(why)); };
    timer = setTimeout(() => job.abort?.(`abandoned after ${capMin} min`), capMin * 60000);
  });
  try {
    job.result = await Promise.race([job.run(n => { job.note = n; }), guard]);
    job.state = 'done';
    job.note = 'done';
  } catch (e) {
    job.state = 'error';
    job.error = String(e && e.message || e);
    job.note = job.error;
  } finally {
    clearTimeout(timer);
    job.abort = null;
    job.endedAt = Date.now();
  }
}

// /api/job reads this map, so a record has to outlive its run — but an authoring session that never
// restarts would otherwise grow it without bound. Insertion order means the oldest go first.
function prune() {
  for (const [id, j] of jobs) {
    if (jobs.size <= JOB_KEEP) return;
    if (j.state === 'done' || j.state === 'error') jobs.delete(id);
  }
}

function cancelJob(j) {
  if (j.state === 'done' || j.state === 'error') return false;
  if (j.abort) { j.abort('cancelled'); return true; }
  for (const q of [pending, encodePending]) {
    const i = q.indexOf(j);
    if (i >= 0) q.splice(i, 1);
  }
  pending.forEach((x, i) => { x.position = i + 1; });
  encodePending.forEach((x, i) => { x.position = i + 1; });
  j.state = 'error';
  j.error = 'cancelled';
  j.note = 'cancelled';
  j.endedAt = Date.now();
  return true;
}

async function pump() {
  if (running || !pending.length) return;
  const job = pending.shift();
  pending.forEach((j, i) => { j.position = i + 1; });
  running = job;
  await runJob(job);
  running = null;
  statusCache.at = 0;
  prune();
  setTimeout(pump, 10);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 409 is "mid-job, ask again later", which is not the same as "gone" — swallowing it is how a flux
// job used to start while ACE-Step was still resident.
async function unload(base) {
  try {
    const r = await fetch(`${base}/admin/unload`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(30000) });
    return r.status === 409 ? 'busy' : 'gone';
  } catch { return 'unreachable'; }
}

// ACE-Step reports residency as `loaded` on /admin/status, mflux as `worker_warm` on /api/status.
const ACE_RESIDENT = { status: `${ACE}/admin/status`, field: 'loaded' };
const FLUX_RESIDENT = { status: `${FLUX}/api/status`, field: 'worker_warm' };

// Give the other resident model up to 150 s to go away. Returning anyway is deliberate: a stuck wait
// is worse than a job that fails on its own out-of-memory error and says so. What is not optional is
// polling the backend we just asked to unload — that is the whole point of the queue.
async function freeVRAM(forKind, note) {
  note(`waiting for VRAM (${forKind})`);
  const other = forKind === 'flux' ? ACE_RESIDENT : FLUX_RESIDENT;
  const base = forKind === 'flux' ? ACE : FLUX;
  let state = await unload(base);
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const [ltx, s] = await Promise.all([probe(`${LTX}/api/status`), probe(other.status)]);
    if (state !== 'busy' && !(ltx && ltx.worker_warm) && !(s && s[other.field])) return;
    note('waiting for another model to unload');
    await sleep(VRAM_POLL_MS);
    if (state === 'busy') state = await unload(base);
  }
}

async function runMusic(body, note) {
  const { abs, rel } = assetPath('audio/music', body.out, '.mp3');
  await freeVRAM('music', note);
  note('submitting to ACE-Step');
  const submit = await postJSON(`${ACE}/release_task`, {
    prompt: String(body.prompt || ''),
    lyrics: String(body.lyrics || ''),
    thinking: body.lyrics ? true : false,
    audio_duration: Math.max(15, Math.min(480, +body.seconds || 60)),
    inference_steps: +body.steps || 4,
    batch_size: 1, audio_format: 'mp3', task_type: 'text2music',
    vocal_language: body.language || 'en',
  }, 60000);
  const taskId = submit?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step refused the task: ${JSON.stringify(submit).slice(0, 200)}`);
  for (let i = 0; ; i++) {
    await sleep(2500);
    const q = await postJSON(`${ACE}/query_result`, { task_id_list: [taskId] }, 30000);
    const row = q?.data?.[0];
    if (!row) throw new Error('ACE-Step lost the task');
    note(row.progress_text || `generating (${i * 2.5 | 0}s)`);
    if (row.status === 2) throw new Error(`ACE-Step failed: ${row.progress_text || 'no reason given'}`);
    if (row.status === 1) {
      // `result` comes back as a JSON string, not an object.
      const parsed = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
      const file = parsed?.[0]?.file;
      if (!file) throw new Error('ACE-Step reported success with no file');
      note('downloading');
      const bytes = await download(file.startsWith('http') ? file : `${ACE}${file}`);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, bytes);
      return { url: rel, bytes: bytes.length, seconds: +body.seconds || null, task: taskId };
    }
    if (i > 600) throw new Error('ACE-Step did not finish in 25 minutes');
  }
}

async function runFlux(body, note) {
  const { abs, rel } = assetPath('art', body.out, '.png');
  await freeVRAM('flux', note);
  note('submitting to mflux');
  const submit = await postJSON(`${FLUX}/api/generate`, {
    mode: body.mode || 'txt2img',
    prompt: String(body.prompt || ''),
    model: body.model || 'flux2-klein-4b',
    width: +body.width || 512, height: +body.height || 512,
    num_inference_steps: +body.steps || 12,
    seed: body.seed === undefined || body.seed === null ? (Date.now() % 100000) : +body.seed,
    num_images: 1,
    ...(body.mode === 'edit' ? { image_paths: body.image_paths || [] } : {}),
  }, 60000);
  const jobId = submit?.job_id;
  if (!jobId) throw new Error(`mflux refused the job: ${JSON.stringify(submit).slice(0, 200)}`);
  for (let i = 0; ; i++) {
    await sleep(2000);
    const j = await getJSON(`${FLUX}/api/jobs/${jobId}`, 30000);
    note(j?.running_last_event || j?.status || 'generating');
    if (j?.status === 'done') {
      note('downloading');
      const bytes = await download(`${FLUX}/api/jobs/${jobId}/file/0`);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, bytes);
      return { url: rel, bytes: bytes.length, seed: submit.seed ?? null, job: jobId };
    }
    if (j?.status === 'failed' || j?.status === 'cancelled') throw new Error(`mflux job ${j.status}: ${j.error || ''}`);
    if (i > 900) throw new Error('mflux did not finish in 30 minutes');
  }
}

async function runSkin(body, note) {
  const { abs, rel } = assetPath('art/skins', body.id, '.png');
  const { generate, writeSkin } = await import('./skin/skin.mjs');
  await freeVRAM('flux', note);
  note('submitting to mflux');
  const r = await generate({
    prompt: body.prompt, mode: body.mode, seed: body.seed, steps: body.steps || 14,
    model: body.model, ref: body.ref, onNote: (st, m) => note(m || st),
  });
  writeSkin(body.id, r);
  return { url: rel, bytes: r.buf.length, seed: r.seed, prompt: r.prompt, job: r.job, abs };
}

// Bare `fetch` throws a context-free "fetch failed" for a backend that is simply not running, which
// reaches the tab as an unreadable job error.
async function reach(url, opts) {
  try { return await fetch(url, opts); }
  catch (e) {
    const why = e.name === 'TimeoutError' ? 'timed out' : (e.cause?.code || e.message || e);
    throw new Error(`${new URL(url).origin} unreachable (${why}) — is the backend running?`);
  }
}

async function postJSON(url, body, ms = 30000) {
  const r = await reach(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${url} → non-JSON: ${text.slice(0, 200)}`); }
}
async function getJSON(url, ms = 30000) {
  const r = await reach(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}
async function download(url) {
  const r = await reach(url, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`download ${url} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ── kokoro ─────────────────────────────────────────────────────────────────
async function tts(jobList) {
  if (!fs.existsSync(KOKORO_PY)) throw new Error(`kokoro python missing: ${KOKORO_PY}`);
  const prepared = jobList.map(j => {
    const { abs, rel } = assetPath('audio/vo', j.out, '.wav');
    return { rel, job: { voice: j.voice || 'am_echo', text: String(j.text ?? ''),
      speed: Math.max(0.5, Math.min(2, +j.speed || 1)), out: abs,
      ...(j.keep_words ? { keep_words: +j.keep_words } : {}),
      ...(j.overlap ? { overlap: +j.overlap } : {}) } };
  });
  for (const p of prepared) if (!p.job.text.trim()) throw new Error('a job has no text');
  const tmp = path.join(ROOT, `tools/vo/.jobs-${process.pid}-${Date.now()}.json`);
  await fsp.writeFile(tmp, JSON.stringify(prepared.map(p => p.job)));
  try {
    const out = await run(KOKORO_PY, [KOKORO_SCRIPT, tmp], 15 * 60 * 1000);
    const line = out.stdout.split('\n').reverse().find(l => l.includes('\x1e'));
    if (!line) throw new Error(`kokoro produced no result record. stderr: ${out.stderr.slice(-400)}`);
    const recs = JSON.parse(line.slice(line.indexOf('\x1e') + 1));
    return recs.map((r, i) => {
      const rel = prepared[i]?.rel;
      if (r.error) return { ok: false, out: rel, error: r.error };
      return { ok: true, url: rel, seconds: r.sec, rms: r.rms, peak: r.peak, wpm: r.wpm,
        bytes: fs.existsSync(prepared[i].job.out) ? fs.statSync(prepared[i].job.out).size : 0 };
    });
  } finally { fsp.unlink(tmp).catch(() => {}); }
}

function run(cmd, args, ms) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, ms);
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-400)}`));
      else resolve({ stdout, stderr });
    });
  });
}


// ── audio encoding ─────────────────────────────────────────────────────────
// Compression quality is a listening judgement, not a measurement — this house already has a scar
// from a machine score that rated 1990s-sounding speech at 90.7 %. So the server only runs ffmpeg
// and reports sizes; which profile is good enough is decided by ear in the tools.
//
// Every encode reads a **raw** source. Re-encoding an already-compressed file stacks generation
// loss, and that is audible well before it is measurable.

const ENCODE_SRC_DIRS = ['audio/music/raw', 'audio/vo/raw', 'audio/music', 'audio/vo'];
const ENCODE_OUT_DIRS = ['audio/music', 'audio/vo'];

// Music filters lifted verbatim from ../../2d/skyhammer/tools/compress_music.sh, which is where
// these numbers were measured. `radio` is steep on purpose: a single lowpass is a gentle rolloff
// that does not read as a wireless, and the band limiting is what makes 40 kbps inaudible.
const RADIO_FILTER = 'highpass=f=450:poles=2,highpass=f=450:poles=2,lowpass=f=2600:poles=2,'
  + 'lowpass=f=2600:poles=2,lowpass=f=2600:poles=2,acompressor=threshold=-20dB:ratio=5:attack=8:release=180,'
  + 'volume=1.7,alimiter=limit=0.94';
const FULL_FILTER = 'acompressor=threshold=-18dB:ratio=3:attack=12:release=250,volume=1.15,alimiter=limit=0.95';

const ENCODE_PROFILES = {
  full: { ext: '.mp3', label: 'Music full — 56 kbps mono @ 32 kHz', kind: 'music',
    args: ['-af', FULL_FILTER, '-ac', '1', '-ar', '32000', '-b:a', '56k'] },
  radio: { ext: '.mp3', label: 'Music radio — bandpassed, 40 kbps mono @ 22 kHz', kind: 'music',
    args: ['-af', RADIO_FILTER, '-ac', '1', '-ar', '22050', '-b:a', '40k'] },
  rich: { ext: '.mp3', label: 'Music rich — 96 kbps stereo @ 44.1 kHz', kind: 'music',
    args: ['-af', FULL_FILTER, '-ac', '2', '-ar', '44100', '-b:a', '96k'] },
  lossless: { ext: '.mp3', label: 'Music untouched — 192 kbps stereo, for A/B only', kind: 'music',
    args: ['-ac', '2', '-ar', '44100', '-b:a', '192k'] },
  voice: { ext: '.mp3', label: 'Voice — 32 kbps mono @ 24 kHz', kind: 'voice',
    args: ['-ac', '1', '-ar', '24000', '-b:a', '32k'] },
  'voice-lo': { ext: '.mp3', label: 'Voice small — 24 kbps mono @ 22 kHz', kind: 'voice',
    args: ['-ac', '1', '-ar', '22050', '-b:a', '24k'] },
  // Opus at 24 kbps beats mp3 at twice that on speech, and 96 clips is where it starts to matter.
  'voice-opus': { ext: '.ogg', label: 'Voice opus — 24 kbps mono @ 24 kHz', kind: 'voice',
    args: ['-c:a', 'libopus', '-ac', '1', '-ar', '24000', '-b:a', '24k', '-application', 'voip'] },
  'voice-opus-hi': { ext: '.ogg', label: 'Voice opus clear — 40 kbps mono @ 24 kHz', kind: 'voice',
    args: ['-c:a', 'libopus', '-ac', '1', '-ar', '24000', '-b:a', '40k', '-application', 'voip'] },
};

function underDir(rel, dirs, what) {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error(`${what} required`);
  const clean = rel.replace(/^\/+/, '');
  if (clean.includes('\0') || clean.includes('..')) throw new Error(`bad ${what}`);
  const abs = path.resolve(ROOT, clean);
  for (const d of dirs) {
    const base = path.resolve(ROOT, d) + path.sep;
    if (abs.startsWith(base)) return { abs, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
  }
  throw new Error(`${what} must be under ${dirs.join(' or ')}`);
}

async function mediaInfo(abs) {
  const st = await fsp.stat(abs).catch(() => null);
  if (!st) return null;
  let probe = {};
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration,bit_rate:stream=sample_rate,channels,codec_name', '-of', 'json', abs], 20000);
    const j = JSON.parse(stdout);
    const s0 = (j.streams || [])[0] || {};
    probe = { seconds: +(+(j.format?.duration || 0)).toFixed(2), bitrate: +j.format?.bit_rate || null,
      sampleRate: +s0.sample_rate || null, channels: s0.channels ?? null, codec: s0.codec_name || null };
  } catch { /* ffprobe missing, or a file it will not read */ }
  return { bytes: st.size, ...probe };
}

// The preview lives beside the shipped file so the tool can play both from the same origin, and in
// a directory of its own so a discarded take is never mistaken for the real one.
const previewOf = out => path.join(path.dirname(out), '_preview', path.basename(out));

// Everything an encode can be rejected for, resolved once so the route and the job cannot disagree.
function checkEncode(body) {
  const profile = ENCODE_PROFILES[body.profile || 'full'];
  if (!profile) throw new Error(`unknown profile "${body.profile}"`);
  const src = underDir(body.src, ENCODE_SRC_DIRS, 'src');
  const named = assetPath(outDirFor(body), stripDir(body), profile.ext);
  const outRel = body.preview ? previewOf(named.rel) : named.rel;
  const outAbs = path.resolve(ROOT, outRel);
  if (outAbs === src.abs) throw new Error('refusing to encode a file over itself');
  return { profile, src, outRel, outAbs };
}

const outDirFor = body => ENCODE_OUT_DIRS.find(d => (body.out || '').replace(/^\/+/, '').startsWith(`${d}/`))
  || (ENCODE_PROFILES[body.profile || 'full'].kind === 'voice' ? 'audio/vo' : 'audio/music');

const stripDir = body => (body.out || '').replace(/^\/+/, '').replace(new RegExp(`^${outDirFor(body)}/`), '');

async function runEncode(body, note) {
  const { profile, src, outRel, outAbs } = checkEncode(body);
  if (!(await fsp.stat(src.abs).catch(() => null))) throw new Error(`no source at ${src.rel}`);
  const before = await mediaInfo(outAbs);
  note(`encoding ${src.rel} → ${outRel} (${body.profile || 'full'})`);
  await fsp.mkdir(path.dirname(outAbs), { recursive: true });
  // ffmpeg writes progressively, so a kill mid-run would leave a truncated clip where the old one
  // was. Encode beside it and rename, the same rule /api/save follows.
  const tmp = `${outAbs}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}${profile.ext}`;
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src.abs, ...profile.args, tmp], 20 * 60 * 1000);
    await fsp.rename(tmp, outAbs);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  const after = await mediaInfo(outAbs);
  const source = await mediaInfo(src.abs);
  return {
    src: src.rel, out: outRel, url: `/${outRel}`, profile: body.profile || 'full',
    label: profile.label, preview: !!body.preview,
    source, before, after,
    ratio: after && source?.bytes ? +(source.bytes / after.bytes).toFixed(2) : null,
  };
}

// Keeping a preview is a rename, not a re-encode: the bytes the ear approved are the bytes that
// ship. A discarded preview is simply left where it is.
async function promotePreview(body) {
  const from = underDir(body.promote, ENCODE_OUT_DIRS, 'promote');
  if (!path.dirname(from.abs).endsWith(`${path.sep}_preview`)) throw new Error('promote must name a file under _preview/');
  const to = path.resolve(path.dirname(path.dirname(from.abs)), path.basename(from.abs));
  const outRel = path.relative(ROOT, to).split(path.sep).join('/');
  await fsp.rename(from.abs, to);
  return { ok: true, out: outRel, url: `/${outRel}`, from: from.rel, ...(await mediaInfo(to)) };
}

// Encoding is CPU, not GPU, so it gets a queue of its own rather than waiting behind ACE-Step and
// mflux. Same job records, so /api/job/<id> and /api/queue read it without knowing the difference.
const encodePending = [];
let encodeRunning = null;

function enqueueEncode(body) {
  const id = `encode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const job = { id, kind: 'encode', state: 'queued', note: 'queued', at: Date.now(),
    out: body.out || '', run: note => runEncode(body, note) };
  jobs.set(id, job);
  encodePending.push(job);
  job.position = encodePending.length;
  setTimeout(pumpEncode, 0);
  return job;
}

async function pumpEncode() {
  if (encodeRunning || !encodePending.length) return;
  const job = encodePending.shift();
  encodePending.forEach((j, i) => { j.position = i + 1; });
  encodeRunning = job;
  await runJob(job);
  encodeRunning = null;
  prune();
  setTimeout(pumpEncode, 10);
}

// ── static ─────────────────────────────────────────────────────────────────
async function serveStatic(req, res, urlPath) {
  let decoded;
  // A malformed escape (`/%zz`) threw straight out of the request handler, and an unhandled
  // rejection takes the whole server down with it.
  try { decoded = decodeURIComponent(urlPath); } catch { return notFound(res); }
  let rel = decoded.replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const mount = MOUNTS.find(([prefix]) => decoded.startsWith(prefix));
  const root = mount ? mount[1] : ROOT;
  const abs = mount ? path.resolve(mount[1], decoded.slice(mount[0].length)) : path.resolve(ROOT, rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) return notFound(res);
  let st;
  try { st = await fsp.stat(abs); } catch { return notFound(res); }
  // Recurse on the raw path — passing `decoded` decoded it a second time.
  if (st.isDirectory()) return serveStatic(req, res, urlPath.replace(/\/?$/, '/'));
  const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const head = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  // The sound studio scrubs long wavs; without Range, Safari will not seek in them at all.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? +range[1] : Math.max(0, st.size - (+range[2] || 0));
    const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return pipe(fs.createReadStream(abs, { start, end }), res);
  }
  res.writeHead(200, { ...head, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  pipe(fs.createReadStream(abs), res);
}

// An unhandled 'error' on the stream is another way to kill the process outright.
const pipe = (stream, res) => stream.on('error', () => res.destroy()).pipe(res);

const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); };

// ── routes ─────────────────────────────────────────────────────────────────
const WRITE_ROUTES = new Set(['/api/save', '/api/tts', '/api/tts/batch', '/api/music', '/api/flux', '/api/encode', '/api/skin']);
const isWriteRoute = p => WRITE_ROUTES.has(p) || (p.startsWith('/api/job/') && p.endsWith('/cancel'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    const origin = req.headers.origin;
    if (origin && originOK(req)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (!originOK(req)) return send(res, 403, { ok: false, error: 'origin is not local' });
    if (isWriteRoute(p) && !remoteIsLocal(req)) {
      return send(res, 403, { ok: false, error: `writes are refused from ${req.socket.remoteAddress}` });
    }
    try {
      return await route(req, res, p, url);
    } catch (e) {
      return send(res, 400, { ok: false, error: String(e && e.message || e) });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  return serveStatic(req, res, p);
});

async function route(req, res, p, url) {
  if (p === '/api/status') return send(res, 200, await status());

  if (p === '/api/queue') {
    return send(res, 200, { ok: true, ...queueSummary(),
      jobs: [...jobs.values()].slice(-40).map(j => ({ id: j.id, kind: j.kind, state: j.state,
        note: j.note, position: j.position, out: j.out, at: j.at })) });
  }

  if (p.startsWith('/api/job/') && p.endsWith('/cancel')) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
    const j = jobs.get(decodeURIComponent(p.slice('/api/job/'.length, -'/cancel'.length)));
    if (!j) return send(res, 404, { ok: false, error: 'no such job' });
    if (!cancelJob(j)) return send(res, 200, { ok: false, id: j.id, state: j.state, error: 'job already finished' });
    return send(res, 200, { ok: true, id: j.id, cancelled: true });
  }

  if (p.startsWith('/api/job/')) {
    const j = jobs.get(decodeURIComponent(p.slice('/api/job/'.length)));
    if (!j) return send(res, 404, { ok: false, error: 'no such job' });
    return send(res, 200, { ok: true, id: j.id, kind: j.kind, state: j.state, note: j.note,
      position: j.position, error: j.error || null, ...(j.result || {}) });
  }

  if (p === '/api/ls') {
    const dir = (url.searchParams.get('dir') || 'data').replace(/^\/+|\/+$/g, '');
    if (!LS_DIRS.has(dir)) return send(res, 400, { ok: false, error: `dir not listable: ${dir}`, allowed: [...LS_DIRS] });
    const abs = path.resolve(ROOT, dir);
    let names = [];
    try { names = await fsp.readdir(abs); } catch { return send(res, 200, { ok: true, dir, files: [], missing: true }); }
    const files = [];
    for (const n of names) {
      if (n.startsWith('.')) continue;
      const st = await fsp.stat(path.join(abs, n)).catch(() => null);
      if (st) files.push({ name: n, size: st.size, mtime: st.mtimeMs, dir: st.isDirectory() });
    }
    return send(res, 200, { ok: true, dir, files });
  }

  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
  const body = await readBody(req);

  if (p === '/api/load') {
    const { abs, rel } = dataPath(body.path);
    try {
      const text = await fsp.readFile(abs, 'utf8');
      return send(res, 200, { ok: true, path: rel, json: JSON.parse(text), bytes: text.length });
    } catch (e) {
      if (e.code === 'ENOENT') return send(res, 200, { ok: false, missing: true, path: rel, error: 'not found' });
      return send(res, 200, { ok: false, path: rel, error: `unreadable: ${e.message}` });
    }
  }

  if (p === '/api/save') {
    if (body.json === undefined) throw new Error('json required');
    const { abs, rel } = dataPath(body.path);
    const bytes = await writeAtomic(abs, JSON.stringify(body.json, null, 2) + '\n');
    return send(res, 200, { ok: true, path: rel, bytes });
  }

  if (p === '/api/tts' || p === '/api/tts/batch') {
    const list = p === '/api/tts' ? [body] : (body.jobs || []);
    if (!Array.isArray(list) || !list.length) throw new Error('no jobs');
    if (list.length > 400) throw new Error('batch capped at 400 jobs');
    const results = await tts(list);
    if (p === '/api/tts') {
      const r = results[0];
      return send(res, 200, r.ok ? { ok: true, ...r } : { ok: false, error: r.error, out: r.out });
    }
    return send(res, 200, { ok: results.every(r => r.ok), results,
      failed: results.filter(r => !r.ok).length });
  }

  if (p === '/api/music' || p === '/api/flux') {
    const kind = p === '/api/music' ? 'music' : 'flux';
    // Fail on a bad `out` here rather than 20 minutes later inside the queue.
    const { rel } = assetPath(kind === 'music' ? 'audio/music' : 'art', body.out, kind === 'music' ? '.mp3' : '.png');
    const job = enqueue(kind, note => (kind === 'music' ? runMusic(body, note) : runFlux(body, note)), { out: rel });
    return send(res, 200, { ok: true, job: job.id, state: job.state, position: job.position,
      out: rel, waiting: pending.length, note: 'poll /api/job/<id>' });
  }

  // Additive route, owned by the skinning experiment. It is /api/flux plus the two things a skin
  // needs and an image does not: the pose reference uploaded to mflux as an edit input, and a
  // sidecar recording the prompt, so any skin in the game can be regenerated from what it shipped
  // with. Same GPU queue as everything else.
  if (p === '/api/skin') {
    const { buildPrompt } = await import('./skin/skin.mjs');
    const id = body.id || 'skin';
    const { rel } = assetPath('art/skins', id, '.png');
    const mode = body.mode === 'txt2img' ? 'txt2img' : 'edit';
    const prompt = body.raw && body.prompt ? String(body.prompt) : buildPrompt(String(body.desc || ''), mode);
    const job = enqueue('flux', note => runSkin({ ...body, id, mode, prompt }, note), { out: rel });
    return send(res, 200, { ok: true, job: job.id, state: job.state, position: job.position,
      out: rel, prompt, waiting: pending.length, note: 'poll /api/job/<id>' });
  }

  if (p === '/api/encode') {
    if (body.promote) return send(res, 200, await promotePreview(body));
    if (body.profiles) {
      return send(res, 200, { ok: true, profiles: Object.entries(ENCODE_PROFILES)
        .map(([id, v]) => ({ id, label: v.label, kind: v.kind, ext: v.ext, args: v.args.join(' ') })) });
    }
    // Validated here, not inside the job: a bad path or an unknown profile is a mistake in the
    // request, and the caller should hear about it now rather than by polling.
    checkEncode(body);
    const job = enqueueEncode(body);
    return send(res, 200, { ok: true, job: job.id, state: job.state, position: job.position,
      out: job.out, waiting: encodePending.length, note: 'poll /api/job/<id>' });
  }

  return send(res, 404, { ok: false, error: `no route ${p}` });
}

// Only the CLI entry point listens, so a test can import the guards above without a server coming up.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '0.0.0.0', async () => {
    const s = await status();
    const nets = Object.values((await import('node:os')).networkInterfaces()).flat()
      .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    console.log(`whofights dev server  ${ROOT}`);
    console.log(`  http://localhost:${PORT}/${nets.map(a => `  http://${a}:${PORT}/`).join('')}`);
    console.log(`  kokoro ${s.kokoro ? 'ok' : 'MISSING'} · ace ${s.ace ? 'up' : 'down'} · flux ${s.flux ? 'up' : 'down'}`);
  });
}

export { ROOT, dataPath, assetPath, underDir, originOK, remoteIsLocal, isWriteRoute, checkEncode,
  outDirFor, stripDir, ENCODE_PROFILES, ENCODE_SRC_DIRS, ENCODE_OUT_DIRS, LS_DIRS, server,
  enqueue, cancelJob, prune, jobs, queueSummary, freeVRAM };
