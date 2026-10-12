#!/usr/bin/env node
/**
 * RAGDOJO event-art review: Aaron picks the picture-reveal art for each upcoming event, from
 * his phone on the home Wi-Fi. Candidates come from local Flux (mflux-queue :7867, which
 * serialises its own work — no lock here); nothing reaches the game until it is APPROVED.
 *
 *   node tools/eventart/server.mjs [--seed <dir of pngs + meta.json>]
 *
 *   node tools/eventart/server.mjs --republish   rewrite every approved picture + manifest entry, then exit
 *
 *   EVENTART_PORT  8023                     listens on 0.0.0.0 (the LAN)
 *   EVENTART_DATA  ~/.ragdojo/eventart      candidates, state, the access key and answers.json
 *   EVENTART_ART   $EVENTART_DATA/approved  the approved pictures (<event>.jpg) — server-only
 *   EVENTART_OUT   <game>/assets/events     manifest.json: choices + name box, NO images (public)
 *   FLUX_URL / LTX_URL                      http://localhost:7867 / :7866
 *
 * Approving writes the full picture to $EVENTART_ART (server/deploy.sh copies it to the arena
 * server, which hands each player only the squares they opened — server/eventart.go) and a
 * public manifest entry with the four shuffled choices; the ANSWER goes only to answers.json.
 * Neither the picture nor the answer ever enters the public repo.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir, networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EVENT_DEFS, windowOf, eventIdOf } from '../../js/events/calendar.js';
import { cleanOverlay } from '../../js/events/overlay.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '../..');
const PORT = +(process.env.EVENTART_PORT || 8023);
const HOST = process.env.EVENTART_HOST || '0.0.0.0';
const DATA = process.env.EVENTART_DATA || join(homedir(), '.ragdojo/eventart');
const OUT = process.env.EVENTART_OUT || join(GAME, 'assets/events');
const ART = process.env.EVENTART_ART || join(DATA, 'approved');
const FLUX = process.env.FLUX_URL || 'http://localhost:7867';
const LTX = process.env.LTX_URL || 'http://localhost:7866';
const CAND = join(DATA, 'candidates');
const STATE = join(DATA, 'state.json');
const ANSWERS = join(DATA, 'answers.json');
const MANIFEST = join(OUT, 'manifest.json');
const STYLE = 'hand-drawn pencil and black ink doodle on lined notebook paper, cream paper with faint blue ruled lines and a red margin line, ' +
  'sketchy wobbly graphite strokes, simple stick figures with round heads and single-line limbs, minimal colour, a few accents of red ink, ' +
  'flat even lighting, whole sheet visible, high contrast, clear bold silhouette';
const GEN = { mode: 'txt2img', model: 'flux2-klein-9b-mlx-4bit', width: 1024, height: 640, num_inference_steps: 10, num_images: 1 };
const RECOMMENDED = ['heroic_2', 'halloween_1', 'dojo_2'];

mkdirSync(CAND, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(ART, { recursive: true });
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { writeFileSync(f + '.tmp', JSON.stringify(v, null, 1) + '\n'); renameSync(f + '.tmp', f); };

const KEY = existsSync(join(DATA, 'key')) ? readFileSync(join(DATA, 'key'), 'utf8').trim() : (() => {
  const k = randomBytes(9).toString('base64url');
  writeFileSync(join(DATA, 'key'), k + '\n', { mode: 0o600 });
  return k;
})();

/** The reveal events a picture can be made for: what is running now and what comes next. */
function upcoming(now = Date.now()) {
  const out = [];
  for (const def of EVENT_DEFS.filter((d) => d.kind === 'reveal')) {
    const n = def.cadence === 'seasonal' ? 1 : def.cadence === 'weekly' ? 4 : 2;
    for (let t = now, found = 0, guard = 0; found < n && guard < 800; guard++) {
      const w = windowOf(def, t);
      if (!w) { t += 86400000; continue; }
      out.push({ id: eventIdOf(def, w), title: def.title, start: w.start, end: w.end, pass: def.pass, running: w.start <= now });
      found++; t = w.end;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

let state = readJSON(STATE, null);
function save() { writeJSON(STATE, state); }

function seed(dir) {
  // meta_dojo.json holds the regenerated dojo set: a later file wins for the same image.
  const byFile = new Map();
  for (const f of ['meta.json', 'meta_dojo.json']) for (const m of readJSON(join(dir, f), [])) byFile.set(m.file, m);
  const meta = [...byFile.values()];
  const notes = {};
  try {
    for (const m of readFileSync(join(dir, 'contact.html'), 'utf8').matchAll(/^\s+(\w+_\d): '(.*)',$/gm)) notes[m[1]] = m[2].replace(/\\'/g, "'");
  } catch {}
  const now = Date.now();
  const up = upcoming(now);
  const week = up.filter((e) => e.id.startsWith('reveal-week:'));
  const hal = up.find((e) => e.id.startsWith('halloween:'));
  const desc = (p) => p.replace(', ' + STYLE, '');
  // Answers and decoys come with the seed (themes.json), never from the game's public code.
  const given = readJSON(join(dir, 'themes.json'), {});
  const theme = (name, event) => ({ event, answer: '', decoys: [], desc: '', ...given[name] });
  state = {
    v: 1,
    themes: {
      heroic: theme('heroic', week[1]?.id || week[0]?.id || ''),
      halloween: theme('halloween', hal?.id || ''),
      dojo: theme('dojo', week[2]?.id || week[0]?.id || ''),
    },
    candidates: [],
  };
  for (const m of meta) {
    const id = basename(m.file, '.png');
    if (!existsSync(join(dir, m.file))) continue;
    copyFileSync(join(dir, m.file), join(CAND, m.file));
    (state.themes[m.theme] ||= theme(m.theme, '')).desc ||= desc(m.prompt);
    state.candidates.push({ id, theme: m.theme, file: m.file, prompt: m.prompt, seed: m.seed, status: 'pending',
      note: notes[id] || '', recommended: RECOMMENDED.includes(id), created: now });
  }
  save();
}

const seedArg = process.argv.indexOf('--seed');
if (!state) {
  if (seedArg > 0) seed(process.argv[seedArg + 1]);
  else { state = { v: 1, themes: {}, candidates: [] }; save(); }
}

// ── Flux ──────────────────────────────────────────────────────────────────────────────
const j = async (url, body) => {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
};

/** Flux and LTX cannot both hold a worker in 24 GB: wait for LTX to let go (it does after 120 s idle). */
async function ltxIdle(c) {
  for (let i = 0; i < 240; i++) {
    try { if (!(await j(LTX + '/api/status')).worker_warm) return; } catch { return; }
    c.status = 'waiting for LTX to go idle'; save();
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function generate(c) {
  try {
    c.status = 'queued'; save();
    await ltxIdle(c);
    const { job_id } = await j(FLUX + '/api/generate', { ...GEN, prompt: c.prompt, seed: c.seed });
    c.job = job_id; c.status = 'generating'; save();
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await j(`${FLUX}/api/jobs/${job_id}`);
      if (s.status === 'done') break;
      if (s.status === 'failed' || s.status === 'cancelled') throw new Error(s.error || s.status);
    }
    const r = await fetch(`${FLUX}/api/jobs/${job_id}/file/0`);
    if (!r.ok) throw new Error('download ' + r.status);
    writeFileSync(join(CAND, c.file), Buffer.from(await r.arrayBuffer()));
    c.status = 'pending'; c.error = ''; save();
  } catch (e) { c.status = 'failed'; c.error = String(e.message || e); save(); }
}
// Picks up anything left mid-generation by a restart.
if (!process.argv.includes('--republish')) for (const c of state.candidates) if (['queued', 'generating', 'waiting for LTX to go idle'].includes(c.status)) void generate(c);

function newCandidate(theme, prompt) {
  const n = 1 + state.candidates.filter((x) => x.theme === theme).reduce((m, x) => Math.max(m, +(x.id.split('_').pop()) || 0), 0);
  const c = { id: `${theme}_${n}`, theme, file: `${theme}_${n}.png`, prompt, seed: randomInt(1, 2 ** 31), status: 'queued', note: '', created: Date.now() };
  state.candidates.push(c);
  save();
  void generate(c);
  return c;
}

// ── approve ───────────────────────────────────────────────────────────────────────────
const slug = (id) => id.replace(/[^A-Za-z0-9-]+/g, '-');
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const k = randomInt(0, i + 1); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}

function themeOk(t) {
  const answer = String(t.answer || '').trim().toUpperCase();
  const decoys = (t.decoys || []).map((d) => String(d).trim().toUpperCase()).filter(Boolean);
  if (!answer || decoys.length < 3 || new Set([answer, ...decoys]).size < 4) throw new Error('needs an answer and three different decoys');
  return { answer, decoys };
}

/** The picture to the server-only folder; the public manifest gets choices + name box only. */
function publish(c) {
  const t = state.themes[c.theme], ev = c.approvedFor || t.event;
  const { answer, decoys } = themeOk(t);
  const name = slug(ev);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', '-z', '640', '1024', join(CAND, c.file), '--out', join(ART, name + '.jpg')], { stdio: 'ignore' });
  for (const old of [name + '.webp', name + '.jpg']) { try { unlinkSync(join(OUT, old)); } catch {} }
  const man = readJSON(MANIFEST, { v: 1, pictures: {} });
  man.v = 1; man.pictures ||= {};
  man.pictures[ev] = { w: 1024, h: 640, choices: shuffle([answer, ...decoys.slice(0, 3)]) };
  if (c.overlay) man.pictures[ev].overlay = c.overlay;
  writeJSON(MANIFEST, man);
  const ans = readJSON(ANSWERS, { v: 1, answers: {} });
  ans.answers[ev] = answer;
  writeJSON(ANSWERS, ans);
}

function approve(c) {
  const t = state.themes[c.theme];
  if (!t?.event) throw new Error('pick the event this picture is for first');
  themeOk(t);
  for (const x of state.candidates) if (x.status === 'approved' && x !== c && x.approvedFor === t.event) x.status = 'pending';
  c.approvedFor = t.event;
  publish(c);
  c.status = 'approved'; c.approvedAt = Date.now();
  save();
}

/** The overlay may say anything but the answer: it is drawn on the picture itself. */
function setOverlay(c, raw) {
  if (raw === null) delete c.overlay;
  else {
    const ov = cleanOverlay(raw);
    if (!ov) throw new Error('overlay needs x, y, w, h inside the picture (fractions 0-1)');
    const words = String(state.themes[c.theme]?.answer || '').toUpperCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => ov.text.toUpperCase().includes(w))) throw new Error('the overlay text would give the answer away');
    c.overlay = ov;
  }
  if (c.status === 'approved') {
    const man = readJSON(MANIFEST, { v: 1, pictures: {} });
    const e = man.pictures?.[c.approvedFor];
    if (e) { if (c.overlay) e.overlay = c.overlay; else delete e.overlay; writeJSON(MANIFEST, man); }
  }
  save();
}

function revoke(c) {
  const ev = c.approvedFor;
  const man = readJSON(MANIFEST, { v: 1, pictures: {} });
  const e = man.pictures?.[ev];
  for (const f of [join(ART, slug(ev) + '.jpg'), join(OUT, slug(ev) + '.webp'), join(OUT, slug(ev) + '.jpg')]) { try { unlinkSync(f); } catch {} }
  if (e) {
    delete man.pictures[ev];
    writeJSON(MANIFEST, man);
  }
  const ans = readJSON(ANSWERS, { v: 1, answers: {} });
  delete ans.answers[ev];
  writeJSON(ANSWERS, ans);
  c.status = 'pending'; delete c.approvedFor;
  save();
}

// ── http ──────────────────────────────────────────────────────────────────────────────
function view() {
  const man = readJSON(MANIFEST, { pictures: {} });
  return { events: upcoming(), themes: state.themes, candidates: state.candidates, approved: Object.keys(man.pictures || {}), out: OUT, art: ART };
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, readFileSync(join(HERE, 'index.html')), 'text/html; charset=utf-8');
  // The game's own overlay drawing (public repo code), so the preview matches the game exactly.
  const GAMEJS = { '/game/js/ink.js': 'js/ink.js', '/game/js/events/overlay.js': 'js/events/overlay.js' };
  if (GAMEJS[url.pathname]) return send(res, 200, readFileSync(join(GAME, GAMEJS[url.pathname])), 'text/javascript; charset=utf-8');
  const key = url.searchParams.get('k') || req.headers['x-key'];
  if (key !== KEY) return send(res, 403, { error: 'open the link printed when the tool started (it carries the key)' });
  if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
    const f = join(CAND, basename(url.pathname));
    if (!existsSync(f)) return send(res, 404, { error: 'no image' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60', 'Last-Modified': statSync(f).mtime.toUTCString() });
    return res.end(readFileSync(f));
  }
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, view());
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  let body = {};
  try { const chunks = []; for await (const ch of req) chunks.push(ch); body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
  const c = state.candidates.find((x) => x.id === body.id);
  try {
    switch (url.pathname) {
      case '/api/approve': if (!c) throw new Error('no such candidate'); approve(c); break;
      case '/api/revoke': if (!c || c.status !== 'approved') throw new Error('not approved'); revoke(c); break;
      case '/api/reject': if (!c) throw new Error('no such candidate'); if (c.status === 'approved') revoke(c); c.status = c.status === 'rejected' ? 'pending' : 'rejected'; save(); break;
      case '/api/overlay': if (!c) throw new Error('no such candidate'); setOverlay(c, body.overlay ?? null); break;
      case '/api/prompt': if (!c || typeof body.prompt !== 'string' || body.prompt.length < 10) throw new Error('prompt too short'); c.prompt = body.prompt.slice(0, 2000); save(); break;
      case '/api/regenerate': if (!c) throw new Error('no such candidate'); return send(res, 200, { ok: true, candidate: newCandidate(c.theme, c.prompt) });
      case '/api/theme': {
        const name = String(body.theme || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        if (!name) throw new Error('theme name');
        const t = state.themes[name] ||= { event: '', answer: '', decoys: [], desc: '' };
        if (typeof body.event === 'string') t.event = body.event;
        if (typeof body.answer === 'string') t.answer = body.answer.slice(0, 40).toUpperCase();
        if (Array.isArray(body.decoys)) t.decoys = body.decoys.slice(0, 3).map((d) => String(d).slice(0, 40).toUpperCase());
        if (typeof body.desc === 'string') t.desc = body.desc.slice(0, 1200);
        save();
        // New decoys (or answer) for a picture already approved: its choices change at once.
        for (const x of state.candidates) if (x.status === 'approved' && x.theme === name && (body.answer || body.decoys)) publish(x);
        if (body.generate) for (let i = 0; i < Math.min(4, +body.generate || 0); i++) newCandidate(name, `${t.desc}, ${STYLE}`);
        break;
      }
      default: return send(res, 404, { error: 'not found' });
    }
    send(res, 200, { ok: true, state: view() });
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
});

if (process.argv.includes('--republish')) {
  for (const c of state.candidates) if (c.status === 'approved') { publish(c); console.log(`republished ${c.id} -> ${c.approvedFor}`); }
  process.exit(0);
}

server.listen(PORT, HOST, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  RAGDOJO event art review — open on your phone (same Wi-Fi):\n`);
  for (const ip of ips.length ? ips : ['127.0.0.1']) console.log(`      http://${ip}:${PORT}/?k=${KEY}`);
  console.log(`\n  data ${DATA}\n  out  ${OUT}\n  (Ctrl-C to stop)\n`);
});
