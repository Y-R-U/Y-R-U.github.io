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

const LS_DIRS = new Set(['data', 'data/levels', 'audio/vo', 'audio/music', 'art', 'tools/vo', 'js/dev/tabs']);
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
// data/ only, .json only, and the resolved path is checked against the resolved root: a symlink or
// a %2e%2e that survived decoding still cannot escape.
function dataPath(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path required');
  let rel = p.replace(/^\/+/, '');
  if (!rel.startsWith('data/')) rel = `data/${rel}`;
  if (!rel.endsWith('.json')) throw new Error('only .json files may be written');
  if (rel.includes('\0')) throw new Error('bad path');
  const abs = path.resolve(ROOT, rel);
  const base = path.resolve(ROOT, 'data') + path.sep;
  if (!abs.startsWith(base)) throw new Error('path escapes data/');
  return { abs, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
}

// Output names for generated assets: a flat-ish name under a fixed directory, never a path.
function assetPath(dir, name, ext) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('out required');
  const clean = name.replace(/\.[a-z0-9]+$/i, '');
  if (!/^[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*$/.test(clean) || clean.includes('..')) {
    throw new Error('out may only contain letters, digits, . _ - and /');
  }
  const abs = path.resolve(ROOT, dir, clean + ext);
  const base = path.resolve(ROOT, dir) + path.sep;
  if (!abs.startsWith(base)) throw new Error('out escapes ' + dir);
  return { abs, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
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

async function pump() {
  if (running || !pending.length) return;
  const job = pending.shift();
  pending.forEach((j, i) => { j.position = i + 1; });
  running = job;
  job.state = 'running';
  job.position = 0;
  job.startedAt = Date.now();
  try {
    job.result = await job.run(n => { job.note = n; });
    job.state = 'done';
    job.note = 'done';
  } catch (e) {
    job.state = 'error';
    job.error = String(e && e.message || e);
    job.note = job.error;
  }
  job.endedAt = Date.now();
  running = null;
  statusCache.at = 0;
  setTimeout(pump, 10);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function unload(base) {
  try { await fetch(`${base}/admin/unload`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(30000) }); } catch { /* 409 mid-job, or not running */ }
}

// Give the other resident model up to `timeout` to go away. Returning anyway is deliberate: a stuck
// wait is worse than a job that fails on its own out-of-memory error and says so.
async function freeVRAM(forKind, note) {
  note(`waiting for VRAM (${forKind})`);
  if (forKind === 'flux') await unload(ACE); else await unload(FLUX);
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const ltx = await probe(`${LTX}/api/status`);
    const flux = forKind === 'music' ? await probe(`${FLUX}/api/status`) : null;
    const busy = (ltx && ltx.worker_warm) || (flux && flux.worker_warm);
    if (!busy) return;
    note('waiting for another model to unload');
    await sleep(5000);
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

// ── static ─────────────────────────────────────────────────────────────────
async function serveStatic(req, res, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  let rel = decoded.replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const mount = MOUNTS.find(([prefix]) => decoded.startsWith(prefix));
  const root = mount ? mount[1] : ROOT;
  const abs = mount ? path.resolve(mount[1], decoded.slice(mount[0].length)) : path.resolve(ROOT, rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) return notFound(res);
  let st;
  try { st = await fsp.stat(abs); } catch { return notFound(res); }
  if (st.isDirectory()) return serveStatic(req, res, decoded.replace(/\/?$/, '/'));
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
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); };

// ── routes ─────────────────────────────────────────────────────────────────
const WRITE_ROUTES = new Set(['/api/save', '/api/tts', '/api/tts/batch', '/api/music', '/api/flux']);

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
    if (WRITE_ROUTES.has(p) && !remoteIsLocal(req)) {
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

  return send(res, 404, { ok: false, error: `no route ${p}` });
}

server.listen(PORT, '0.0.0.0', async () => {
  const s = await status();
  const nets = Object.values((await import('node:os')).networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`whofights dev server  ${ROOT}`);
  console.log(`  http://localhost:${PORT}/${nets.map(a => `  http://${a}:${PORT}/`).join('')}`);
  console.log(`  kokoro ${s.kokoro ? 'ok' : 'MISSING'} · ace ${s.ace ? 'up' : 'down'} · flux ${s.flux ? 'up' : 'down'}`);
});
