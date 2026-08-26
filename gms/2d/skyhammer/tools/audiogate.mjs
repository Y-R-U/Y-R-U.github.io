#!/usr/bin/env node
/**
 * The music gate. Loads the real game in headless Chrome through tools/cdp.mjs, taps the real
 * start button with a real touch, then reads live state out of `window.__audio` — which track is
 * actually playing, whether its element is really advancing, the per-deck gain envelope across a
 * crossfade, and what happens when a file 404s or the player switches every track off.
 *
 *   node tools/audiogate.mjs                 # the suite
 *   node tools/audiogate.mjs --falsify       # break each thing on purpose; every named check MUST go red
 *   node tools/audiogate.mjs --only drop     # one check
 *   node tools/audiogate.mjs --gpu
 *
 * --falsify is the half that makes the other half mean anything. A check that has never been
 * seen to fail is not evidence (CONTRACTS §13).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { CDP, ROOT } from './cdp.mjs';
import { Touch } from './touch.mjs';
import { MUSIC_BY_ID } from '../js/data/music.js';

/**
 * cdp.mjs's own `serve()` answers every request with a plain 200 and no `Accept-Ranges`, and a
 * media element that cannot make a Range request reports `seekable.length === 0` and SILENTLY
 * IGNORES every seek — even on a fully buffered file. That made `startAt` untestable and looked
 * exactly like a bug in the game. GitHub Pages does serve ranges, so the harness was the liar.
 * cdp.mjs is frozen, so this is a local range-capable server instead; everything else still comes
 * from cdp.mjs.
 */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

async function serveRanges(root = ROOT) {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
      const st = await stat(f).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      const ext = f.slice(f.lastIndexOf('.'));
      const head = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m) {
        const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); return; }
        res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
        createReadStream(f, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...head, 'content-length': st.size });
      res.end(await readFile(f));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

async function rangeHarness(opts = {}) {
  const srv = await serveRanges();
  const cdp = await CDP.launch(opts);
  const close = () => { cdp.close(); srv.close(); };
  process.on('exit', close);
  return { cdp, base: srv.base, close };
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const FALSIFY = argv.includes('--falsify');
const GPU = argv.includes('--gpu');
const ONLY = arg('--only', '');

const PAIR_MARCH = 'battle_ww2_march', PAIR_HEAVY = 'battle_ww2_heavy';
const DWELL = 5.0;

/* ------------------------------------------------------------------------------- page helpers */

class Page {
  constructor(cdp) { this.cdp = cdp; }
  snap() { return this.cdp.eval('JSON.parse(JSON.stringify(window.__audio.snap()))'); }
  js(expr) { return this.cdp.eval(expr); }
  api(call) { return this.cdp.eval(`(()=>{try{return JSON.parse(JSON.stringify(window.__audio.api.${call} ?? null))}catch(e){return {__err:String(e&&e.message||e)}}})()`); }
  record(ms) { return this.cdp.eval(`window.__audio.record(${ms})`); }
  samples() { return this.cdp.eval('JSON.parse(JSON.stringify(window.__audio.samples()))'); }
}

async function boot(cdp, base, { url = '/index.html?level=a1-01&nofs=1&nosave' } = {}) {
  await cdp.viewport(844, 390, 1, true);
  await cdp.goto(base + url);
  await sleep(2200);
  const box = await cdp.eval(`(()=>{const b=document.getElementById('tapbtn');if(!b||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!box) throw new Error('TAP TO FLY never armed — the game did not finish loading');
  const t = new Touch(cdp);
  await t.tap(box.x, box.y);              // a real touch, which is the real autoplay gesture
  await sleep(900);
  return new Page(cdp);
}

/* ------------------------------------------------------------------------------------- checks */

const CHECKS = {};
const def = (name, fn) => { CHECKS[name] = fn; };

def('boot', async (p, cdp) => {
  const s = await p.snap();
  const ids = await p.js('window.__audio.manifest()');
  const bad = [];
  if (!s.ready) bad.push('audio never unlocked');
  if (s.ctxState !== 'running') bad.push(`AudioContext is ${s.ctxState}`);
  if (!s.manifestReady) bad.push('manifest never loaded');
  if (!ids || ids.length !== Object.keys(MUSIC_BY_ID).length) bad.push(`manifest has ${ids && ids.length} ids, js/data/music.js has ${Object.keys(MUSIC_BY_ID).length}`);
  if (s.decks.length !== 2) bad.push(`${s.decks.length} decks, expected 2`);
  if (cdp.errors.length) bad.push(`${cdp.errors.length} page error(s): ${cdp.errors[0]}`);
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `unlocked, ctx running, ${ids.length} tracks, 2 decks, 0 page errors` };
});

def('playing', async (p) => {
  const a = await p.snap();
  await sleep(1200);
  const b = await p.snap();
  const da = a.decks.find((d) => d.state === 'live'), db = b.decks.find((d) => d.state === 'live');
  const bad = [];
  if (!b.now || !b.now.id) bad.push('nowPlaying() is null');
  if (!db) bad.push('no live deck');
  else {
    if (db.err) bad.push(`media error code ${db.err} on ${db.id}`);
    if (db.readyState < 2) bad.push(`readyState ${db.readyState} — never got data`);
    if (db.paused) bad.push('element is paused');
    const adv = da && db && da.id === db.id ? db.time - da.time : db.time;
    if (adv < 0.5) bad.push(`currentTime advanced only ${adv.toFixed(3)}s in 1.2s — not actually playing`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `${b.now.id} playing, ct ${db.time.toFixed(2)}s, +${(db.time - (da ? da.time : 0)).toFixed(2)}s in 1.2s, readyState ${db.readyState}` };
});

def('network', async (p, cdp, st) => {
  const got = st.responses.filter((r) => /\/assets\/audio\/music\/.*\.mp3$/.test(r.url));
  const bad = got.filter((r) => r.status !== 200 && r.status !== 206);
  const off = cdp.offOrigin(st.base);
  const problems = [];
  if (!got.length) problems.push('no mp3 was ever requested — the game is not reading the music folder');
  if (bad.length) problems.push(`${bad.length} non-200: ${bad.slice(0, 3).map((r) => r.status + ' ' + r.url.split('/').pop()).join(', ')}`);
  if (off.length) problems.push('OFF-ORIGIN: ' + off.slice(0, 3).join(', '));
  return { ok: !problems.length, detail: problems.length ? problems.join('; ') : `${got.length} mp3 request(s), all 200, 0 off-origin` };
});

def('gaintrim', async (p) => {
  // Force a real handover: start() no-ops when the wanted track is already the live one, and then
  // the deck would still carry the gain it was given at boot. (That silently hid this check's
  // falsifier once.)
  await p.api(`music('battle_grim')`);
  await sleep(1600);
  await p.api(`music('${PAIR_MARCH}')`);
  await sleep(2000);                             // let the 1.2 s fade settle
  const s = await p.snap();
  const d = s.decks.find((x) => x.state === 'live');
  const expect = MUSIC_BY_ID[PAIR_MARCH].gainTrim;   // from js/data/music.js on the NODE side
  if (!d) return { ok: false, detail: 'no live deck' };
  const drift = Math.abs(d.gainRead - expect);
  const readVsAnalytic = Math.abs(d.gainRead - d.gain);
  return {
    ok: d.id === PAIR_MARCH && drift < 0.01 && readVsAnalytic < 0.01,
    detail: `${d.id} deck gain read ${d.gainRead.toFixed(4)} vs manifest gainTrim ${expect} (drift ${drift.toFixed(4)}); analytic ${d.gain.toFixed(4)} agrees to ${readVsAnalytic.toFixed(5)}`,
  };
});

def('startat', async (p) => {
  await p.api(`music('title_theme')`);
  await sleep(1600);
  const s = await p.snap();
  const d = s.decks.find((x) => x.state === 'live');
  const want = MUSIC_BY_ID.title_theme.startAt;
  if (!d || d.id !== 'title_theme') return { ok: false, detail: 'title_theme did not start' };
  return {
    ok: d.time >= want - 0.05,
    detail: `title_theme at ct ${d.time.toFixed(3)}s after 1.6s; manifest startAt ${want} (must be >= ${want})`,
  };
});

/** The march -> heavy drop, and the gain envelope across it. */
async function dropRun(p, { push = true } = {}) {
  await p.js(`window.__audio.pin(0)`);
  await p.api(`music('${PAIR_MARCH}')`);
  await sleep(DWELL * 1000 + 800);                 // clear the dwell window the change just armed
  const before = await p.snap();
  await p.record(4500);
  if (push) await p.js(`window.__audio.pin(1)`);
  await sleep(4800);
  const after = await p.snap();
  const samples = await p.samples();
  return { before, after, samples };
}

def('drop', async (p, cdp, st) => {
  const r = await dropRun(p, { push: !st.noPush });
  st.lastDrop = r;
  const sw = r.after.events.filter((e) => e.e === 'drop' && e.t >= r.before.clock);
  const ok = r.before.now && r.before.now.id === PAIR_MARCH
    && r.after.now && r.after.now.id === PAIR_HEAVY && r.after.heavy && sw.length >= 1;
  return {
    ok,
    detail: `${r.before.now && r.before.now.id} -> ${r.after.now && r.after.now.id}; heavy=${r.after.heavy}; drop events ${sw.length}`,
  };
});

def('envelope', async (p, cdp, st) => {
  const r = st.lastDrop || (st.lastDrop = await dropRun(p));
  const trim = MUSIC_BY_ID[PAIR_HEAVY].gainTrim;
  // The window is the whole handover — from the last sample where the OUTGOING deck is still at
  // full, to the first where it has reached zero. Sampling only the overlap would score a fade
  // that leaves a silent hole as "no crossfade" rather than as the hole it is.
  const g = (s, which) => (s.ida === which ? s.a : s.idb === which ? s.b : 0);
  const gr = (s, which) => (s.ida === which ? s.ar : s.idb === which ? s.br : 0);
  const seq = r.samples.map((s) => ({ t: s.t, out: g(s, PAIR_MARCH), in: g(s, PAIR_HEAVY), s }));
  let iEnd = seq.findIndex((x, i) => i > 0 && x.out <= 0.001 && seq[i - 1].out > 0.001);
  if (iEnd < 0) return { ok: false, detail: `${PAIR_MARCH} never faded out in ${r.samples.length} samples — no handover happened` };
  let iStart = iEnd;
  while (iStart > 0 && seq[iStart - 1].out < 0.98 * trim) iStart--;
  const win = seq.slice(iStart, iEnd + 1).map((x) => ({ a: x.out, b: x.in, ar: gr(x.s, PAIR_MARCH), br: gr(x.s, PAIR_HEAVY) }));
  if (win.length < 6) return { ok: false, detail: `handover window was only ${win.length} samples — it hard-cut` };
  const lin = win.map((s) => (s.a + s.b) / trim);
  const pow = win.map((s) => Math.sqrt(s.a * s.a + s.b * s.b) / trim);
  const mm = (v) => [Math.min(...v), Math.max(...v)];
  const [lo, hi] = mm(lin), [plo, phi] = mm(pow);
  // also confirm the two readbacks agree with the analytic curve, so this is real gain, not intent
  const drift = Math.max(...win.map((s) => Math.max(Math.abs(s.a - s.ar), Math.abs(s.b - s.br))));
  const bad = [];
  if (plo < 0.90) bad.push(`power sum dips to ${plo.toFixed(3)} — audible hole`);
  if (phi > 1.15) bad.push(`power sum peaks at ${phi.toFixed(3)} — doubling`);
  if (lo < 0.92) bad.push(`linear sum dips to ${lo.toFixed(3)}`);
  if (hi > 1.50) bad.push(`linear sum peaks at ${hi.toFixed(3)}`);
  if (drift > 0.02) bad.push(`analytic vs AudioParam readback differ by ${drift.toFixed(3)} — the envelope is not the real gain`);
  return {
    ok: !bad.length,
    detail: `${win.length} handover samples over ${(seq[iEnd].t - seq[iStart].t).toFixed(2)}s · power sum ${plo.toFixed(3)}..${phi.toFixed(3)} · linear sum ${lo.toFixed(3)}..${hi.toFixed(3)} · readback drift ${drift.toFixed(4)}`
      + (bad.length ? ' || ' + bad.join('; ') : ''),
  };
});

def('hysteresis', async (p) => {
  await p.js(`window.__audio.pin(0)`);
  await p.api(`music('${PAIR_MARCH}')`);
  await sleep(DWELL * 1000 + 600);
  await p.js(`window.__audio.pin(1)`);
  await sleep(2000);
  const hot = await p.snap();
  await p.js(`window.__audio.pin(0.5)`);            // above the 0.35 fall threshold: must STAY heavy
  await sleep(DWELL * 1000 + 2000);
  const mid = await p.snap();
  await p.js(`window.__audio.pin(0.1)`);            // below it: must fall back
  await sleep(DWELL * 1000 + 2500);
  const cold = await p.snap();
  const bad = [];
  if (!hot.heavy || hot.now.id !== PAIR_HEAVY) bad.push(`intensity 1.0 did not go heavy (${hot.now && hot.now.id})`);
  if (!mid.heavy || mid.now.id !== PAIR_HEAVY) bad.push(`intensity 0.5 fell out of heavy (${mid.now && mid.now.id}) — no hysteresis`);
  if (cold.heavy || cold.now.id !== PAIR_MARCH) bad.push(`intensity 0.1 stayed heavy (${cold.now && cold.now.id})`);
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `1.0 -> ${hot.now.id}; 0.5 -> ${mid.now.id} (held); 0.1 -> ${cold.now.id}` };
});

def('dwell', async (p) => {
  await p.js(`window.__audio.pin(0)`);
  await p.api(`music('${PAIR_MARCH}')`);
  await sleep(DWELL * 1000 + 600);
  const t0 = (await p.snap()).clock;      // the audio clock, so old drops from earlier checks do not count
  const T = 14000, STEP = 250;
  const until = Date.now() + T;
  let hi = true;
  while (Date.now() < until) { await p.js(`window.__audio.pin(${hi ? 1 : 0})`); hi = !hi; await sleep(STEP); }
  const s = await p.snap();
  const drops = s.events.filter((e) => e.e === 'drop' && e.t >= t0).length;
  const maxAllowed = Math.ceil(T / 1000 / DWELL) + 1;     // one per dwell window, plus slop
  return {
    ok: drops <= maxAllowed,
    detail: `intensity flipped ${Math.round(T / STEP)}x over ${T / 1000}s -> ${drops} music switches (cap ${maxAllowed}); dwell ${DWELL}s`,
  };
});

def('contexts', async (p) => {
  const WANT = {
    title: 'title', hangar: 'hangar', brief: 'hangar', battle: 'battle', boss: 'boss',
    victory: 'sting_win', defeat: 'sting_lose',
    flight: 'battle',                       // the legacy call site — must not go silent
    nonsense_context: 'battle',             // unknown -> battle, never silence
  };
  const got = [], bad = [];
  for (const [call, expect] of Object.entries(WANT)) {
    await p.api(`music('${call}')`);
    await sleep(1400);
    const s = await p.snap();
    const id = s.now && s.now.id;
    const ctx = id ? MUSIC_BY_ID[id].context : null;
    got.push(`${call}->${id || 'SILENT'}`);
    if (ctx !== expect) bad.push(`${call} gave ${id} (${ctx}), expected a ${expect} track`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : got.join(', ') };
});

def('mute', async (p) => {
  await p.api(`music('battle')`);
  await sleep(1600);
  const on = await p.snap();
  await p.api(`setMusic(false)`);
  await sleep(900);
  const off = await p.snap();
  await p.api(`setMusic(true)`);
  await sleep(1200);
  const back = await p.snap();
  const bad = [];
  if (!(on.musicBus > 0.4)) bad.push(`musicBus was ${on.musicBus} while music was on`);
  if (off.musicBus > 0.01) bad.push(`musicBus stayed at ${off.musicBus} after setMusic(false)`);
  if (!off.decks.every((d) => d.paused)) bad.push('a deck kept decoding while muted');
  if (!(back.musicBus > 0.4)) bad.push(`musicBus did not come back (${back.musicBus})`);
  if (!back.now) bad.push('nothing playing after setMusic(true)');
  if (back.decks.filter((d) => d.state === 'live').some((d) => d.paused)) bad.push('live deck still paused after setMusic(true)');
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `bus ${on.musicBus} -> ${off.musicBus} (decks paused) -> ${back.musicBus}, playing ${back.now.id}` };
});

def('fallback404', async (p, cdp) => {
  const errs0 = cdp.errors.length;
  const s0 = await p.snap();
  const victim = 'battle_tense';
  if (s0.now && s0.now.id === victim) await p.api(`music('battle_grim')`), await sleep(1500);
  await p.js(`window.__audio.breakTrack(${JSON.stringify(victim)})`);
  await p.api(`music('${victim}')`);              // ask for a track whose file is now missing
  await sleep(3000);
  const s1 = await p.snap();
  const bad = [];
  if (!s1.bad.includes(victim)) bad.push(`${victim} was not marked bad`);
  if (!s1.now || !s1.now.id) bad.push('fell to silence instead of the next track');
  else if (s1.now.id === victim) bad.push('still claims to be playing the broken track');
  const live = s1.decks.find((d) => d.state === 'live');
  if (live && live.err) bad.push(`live deck carries media error ${live.err}`);
  if (cdp.errors.length > errs0) bad.push(`page threw: ${cdp.errors[cdp.errors.length - 1]}`);
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `${victim} 404'd (media error ${s1.events.filter((e) => e.e === 'track-fail').slice(-1)[0]?.code}) -> marked bad -> fell through to ${s1.now.id}, deck error 0, 0 exceptions` };
});

def('disableall', async (p, cdp) => {
  const errs0 = cdp.errors.length;
  const all = Object.keys(MUSIC_BY_ID).reduce((o, k) => (o[k] = true, o), {});
  await p.js(`window.__audio.api.setDisabledTracks(${JSON.stringify(all)})`);
  await sleep(1800);
  const s = await p.snap();
  const bad = [];
  if (s.now) bad.push(`still playing ${s.now.id} with every track disabled`);
  if (cdp.errors.length > errs0) bad.push(`threw: ${cdp.errors[cdp.errors.length - 1]}`);
  const alive = await p.js('!!(window.__state && window.__state.frame >= 0) || true');
  if (!alive) bad.push('page is dead');
  await p.js(`window.__audio.api.setDisabledTracks({})`);   // put it back
  await p.api(`music('battle')`);
  await sleep(1800);
  const s2 = await p.snap();
  if (!s2.now) bad.push('did not come back after re-enabling every track');
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `all off -> silence (nowPlaying null), 0 exceptions; all on -> ${s2.now.id}` };
});

def('loop', async (p) => {
  // Shrink the loop point so the cross-loop happens in seconds instead of two minutes.
  const id = 'battle_grim';
  const row = await p.js(`(()=>{const t=window.__audio.rows().find(x=>x.id===${JSON.stringify(id)});
    if(!t) return null; t.loopEnd = (t.startAt||0) + 8; t.loopFadeS = 2;
    return {startAt:t.startAt, loopEnd:t.loopEnd, loopFadeS:t.loopFadeS};})()`);
  if (!row) return { ok: false, detail: `${id} is not in the manifest` };
  await p.api(`music('${id}')`);
  await sleep(2500);
  await p.record(6000);
  await sleep(6300);
  const s = await p.snap();
  const samples = await p.samples();
  const loops = s.events.filter((e) => e.e === 'loop');
  const trim = MUSIC_BY_ID[id].gainTrim;
  const win = samples.filter((x) => x.a > 0.001 && x.b > 0.001 && x.ida === id && x.idb === id);
  const pow = win.map((x) => Math.sqrt(x.a * x.a + x.b * x.b) / trim);
  const bad = [];
  if (!loops.length) bad.push(`no cross-loop fired in 8.8s with loopEnd ${row.loopEnd}`);
  if (win.length < 6) bad.push(`only ${win.length} samples had both decks on ${id} — it hard-cut instead of cross-looping`);
  else {
    const lo = Math.min(...pow), hi = Math.max(...pow);
    if (lo < 0.90 || hi > 1.15) bad.push(`loop power sum ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  }
  const live = s.decks.find((d) => d.state === 'live');
  if (live && live.id === id && live.time > row.loopEnd + 0.5) bad.push(`ran past loopEnd to ${live.time.toFixed(2)}s`);
  return {
    ok: !bad.length,
    detail: bad.length ? bad.join('; ')
      : `${loops.length} cross-loop(s) at loopEnd ${row.loopEnd}s, ${win.length} overlap samples, restarted at ct ${live ? live.time.toFixed(2) : '?'}s`,
  };
});

/** Last, because it leaves every file pointed at nothing: the "then to silence" leg. */
def('silence', async (p, cdp) => {
  const errs0 = cdp.errors.length;
  await p.js(`window.__audio.rows().forEach(t=>window.__audio.breakTrack(t.id))`);
  await p.api(`music('battle')`);
  await sleep(3500);
  const s = await p.snap();
  const bad = [];
  if (s.now) bad.push(`claims to be playing ${s.now.id} with every file missing`);
  if (s.bad.length < 2) bad.push(`only ${s.bad.length} track(s) marked bad — it gave up instead of falling through`);
  if (cdp.errors.length > errs0) bad.push(`page threw: ${cdp.errors[cdp.errors.length - 1]}`);
  const frames = await p.js('(()=>{const a=(window.__state&&window.__state.frame)||0; return new Promise(r=>setTimeout(()=>r(((window.__state&&window.__state.frame)||0)-a),600))})()');
  if (!(frames > 0)) bad.push(`the frame loop stopped (${frames} frames in 600 ms) — audio broke the game`);
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `all 22 files missing -> ${s.bad.length} marked bad, nowPlaying null, 0 exceptions, ${frames} frames still running in 600 ms` };
});

/* --------------------------------------------------------------------------------- falsifiers */

const FALSIFIERS = [
  {
    name: 'allbroken', check: 'playing',
    why: 'every mp3 points at a file that does not exist',
    setup: async (p) => { await p.js(`window.__audio.rows().forEach(t=>window.__audio.breakTrack(t.id))`); await p.api(`music('battle')`); await sleep(2000); },
  },
  {
    name: 'disableall', check: 'playing',
    why: 'the player has switched off every track',
    setup: async (p) => {
      const all = Object.keys(MUSIC_BY_ID).reduce((o, k) => (o[k] = true, o), {});
      await p.js(`window.__audio.api.setDisabledTracks(${JSON.stringify(all)})`);
      await p.api(`music('battle')`); await sleep(1800);
    },
  },
  {
    name: 'nointensity', check: 'drop',
    why: 'setIntensity is pinned at 0 — nothing ever asks for the heavy half',
    setup: async (p, st) => { st.noPush = true; },
  },
  {
    name: 'gapfade', check: 'envelope',
    why: 'the incoming deck is delayed by a whole fade, so the handover dips to silence',
    setup: async (p, st) => { await p.js(`window.__audio.bug('gap')`); st.lastDrop = null; },
  },
  {
    name: 'doublefade', check: 'envelope',
    why: 'the outgoing deck fades 5x too slowly, so both decks are loud at once',
    setup: async (p, st) => { await p.js(`window.__audio.bug('double')`); st.lastDrop = null; },
  },
  {
    name: 'nostartat', check: 'startat',
    why: 'title_theme.startAt forced back to 0 — the 2 s of dead air is played again',
    setup: async (p) => { await p.js(`(()=>{const t=window.__audio.rows().find(x=>x.id==='title_theme'); t.startAt=0; return t.startAt})()`); },
  },
  {
    name: 'wrongtrim', check: 'gaintrim',
    why: `${PAIR_MARCH}.gainTrim forced to 1.0 in the page, against js/data/music.js on disk`,
    setup: async (p) => { await p.js(`(()=>{const t=window.__audio.rows().find(x=>x.id===${JSON.stringify(PAIR_MARCH)}); t.gainTrim=1; return 1})()`); },
  },
  {
    name: 'nomute', check: 'mute',
    why: 'setMusic is stubbed out, so the music bus never drops',
    setup: async (p) => { await p.js(`(()=>{window.__audio.api.setMusic=()=>{};return 1})()`); },
  },
  {
    name: 'notitle', check: 'contexts',
    why: 'both title tracks switched off — music("title") has to fall through to a battle track',
    setup: async (p) => { await p.js(`window.__audio.api.setDisabledTracks({title_theme:true,title_chrome:true})`); },
  },
  {
    name: 'noloop', check: 'loop',
    why: 'loopEnd left at the full 118 s, so no cross-loop can fire inside the test window',
    setup: async (p) => {
      await p.js(`(()=>{const t=window.__audio.rows().find(x=>x.id==='battle_grim');
        t.loopEnd = 118.78; t.loopFadeS = 2; window.__audio.rows().__pin = true; return t.loopEnd})()`);
      // and stop the check from shrinking it again
      await p.js(`(()=>{const rows=window.__audio.rows(); const t=rows.find(x=>x.id==='battle_grim');
        Object.defineProperty(t,'loopEnd',{value:118.78,writable:false,configurable:false}); return t.loopEnd})()`);
    },
  },
];

/* -------------------------------------------------------------------------------------- driver */

async function runSuite(names) {
  const { cdp, base, close } = await rangeHarness({ gpu: GPU });
  const st = { base, responses: [] };
  cdp.on('Network.responseReceived', (r) => st.responses.push({ url: r.response.url, status: r.response.status }));
  const out = [];
  try {
    const p = await boot(cdp, base);
    for (const n of names) {
      let r;
      try { r = await CHECKS[n](p, cdp, st); }
      catch (e) { r = { ok: false, detail: 'threw: ' + (e && e.message || e) }; }
      out.push({ name: n, ...r });
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${n.padEnd(12)} ${r.detail}`);
    }
    if (cdp.errors.length) {
      console.log(`\n--- ${cdp.errors.length} page error(s) ---`);
      for (const l of cdp.errors.slice(0, 10)) console.log('  ' + l);
    }
  } finally { close(); }
  return out;
}

async function runFalsify() {
  console.log('FALSIFY — every line below must read RED. A check that cannot fail is not evidence.\n');
  const results = [];
  for (const f of FALSIFIERS) {
    const { cdp, base, close } = await rangeHarness({ gpu: GPU });
    const st = { base, responses: [] };
    cdp.on('Network.responseReceived', (r) => st.responses.push({ url: r.response.url, status: r.response.status }));
    let r;
    try {
      const p = await boot(cdp, base);
      await f.setup(p, st);
      try { r = await CHECKS[f.check](p, cdp, st); }
      catch (e) { r = { ok: false, detail: 'threw: ' + (e && e.message || e) }; }
    } catch (e) { r = { ok: false, detail: 'boot threw: ' + (e && e.message || e) }; }
    finally { close(); }
    const red = !r.ok;
    results.push({ ...f, red, detail: r.detail });
    console.log(`${red ? 'RED  ' : 'GREEN'} ${f.name.padEnd(12)} breaks "${f.check}" — ${f.why}`);
    console.log(`      -> ${r.detail}\n`);
  }
  const stillGreen = results.filter((r) => !r.red);
  console.log(stillGreen.length
    ? `${stillGreen.length} FALSIFIER(S) DID NOT GO RED: ${stillGreen.map((r) => r.name).join(', ')} — those checks prove nothing.`
    : `all ${results.length} falsifiers went red.`);
  return stillGreen.length === 0;
}

const ALL = Object.keys(CHECKS);
let ok = true;
if (FALSIFY) ok = await runFalsify();
else {
  const names = ONLY ? ONLY.split(',').filter((n) => CHECKS[n]) : ALL;
  const res = await runSuite(names);
  const fails = res.filter((r) => !r.ok);
  console.log(`\n${res.length - fails.length}/${res.length} passed` + (fails.length ? ` — FAILED: ${fails.map((r) => r.name).join(', ')}` : ''));
  ok = !fails.length;
}
process.exit(ok ? 0 : 1);
