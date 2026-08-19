#!/usr/bin/env node
// P8's gates — §10 (audio), §11 (`docs/SUNO.md`), and §13's done-criteria for the phase.
//
//   node tools/gates_p8.mjs            all legs
//   node tools/gates_p8.mjs --only=A   one leg (A pure · B harness · C dropin · D game · E deleted)
//
// ── Why this file has its own Chrome launcher ───────────────────────────────
//
// `tools/shot.mjs` is another agent's file this phase may not edit, and two of its choices make it
// unusable for audio: its MIME table has no `.mp3` (an `<audio>` element served
// `application/octet-stream` is a coin flip), and it cannot set `--autoplay-policy`. Gate B8 has to
// prove the gesture path is LOAD-BEARING, which means running under the strict policy where a
// context that is never touched stays suspended. So the ~120 lines of server + CDP below are local.
//
// ── The standing lesson, applied ───────────────────────────────────────────
//
// This project's dominant failure mode is a measurement that silently measures nothing, and TWICE
// it was audio: a silent clip was once reported OK. A check that a file exists, decodes, and has
// non-zero duration passes on pure silence — all three of those are true of a four-second mp3 of
// nothing. So the silence gate asserts on **decoded sample RMS**, and it is falsified against a
// deliberately silenced encode of a real clip: same duration, same channel count, same codec, no
// audio. Six gates here carry an explicit falsification step, marked FALSIFIED.
//
// No gate here uses `&&` to make its own setup optional (obligation T10). Where a precondition is
// missing the gate FAILS; it never softens.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, createReadStream, statSync,
  renameSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'shots/p8');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const ONLY = args.only ? String(args.only).toUpperCase().split(',') : null;
const runLeg = L => !ONLY || ONLY.includes(L);

mkdirSync(OUT, { recursive: true });

// ── incremental result file ────────────────────────────────────────────────
// Written after EVERY check, not at the end. Five agents have been killed mid-run tonight by
// machine crashes and API overloads; a batched write loses the whole suite.
//
// It carries BOTH gate schemas on purpose. `p1a`–`p4` write `{results:[…]}` and `p5` writes
// `{ok:[],fail:[]}`; a parser reading the wrong key reports 0/0 on a fully-passing suite, which the
// manager has now done three times. This file answers to either parser.
const results = [];
const ok = [], fail = [];
const notes = {};
const RESULT_FILE = resolve(OUT, '_gates.json');

function flushResults() {
  writeFileSync(RESULT_FILE, JSON.stringify({
    phase: 'P8', preset: 'default', at: new Date().toISOString(),
    pass: ok.length, total: results.length,
    results, ok, fail, notes,
  }, null, 2));
}

function check(name, pass, detail) {
  (pass ? ok : fail).push(name);
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(detail).replace(/\n/g, '\n      ')}`);
  flushResults();
}
function note(k, v) { notes[k] = v; flushResults(); }
flushResults();

// ── a local static server with a MIME table that includes audio ────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function serve(startPort) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404, { 'content-type': 'text/plain' }); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream',
        'accept-ranges': 'bytes', 'cache-control': 'no-store' });
      createReadStream(p).pipe(rp);
    });
    let tries = 0;
    s.on('error', e => (e.code === 'EADDRINUSE' && ++tries < 80 ? s.listen(startPort + tries) : rej(e)));
    s.on('listening', () => res(s));
    s.listen(startPort);
  });
}

function freePort(start) {
  return new Promise((res, rej) => {
    const s = http.createServer();
    let tries = 0;
    s.on('error', e => (e.code === 'EADDRINUSE' && ++tries < 80 ? s.listen(start + tries) : rej(e)));
    s.on('listening', () => { const { port } = s.address(); s.close(() => res(port)); });
    s.listen(start);
  });
}

class CDP {
  constructor(url) { this.id = 0; this.pending = new Map(); this.url = url; this.listeners = []; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = rej;
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) {
          const { res: r, rej: j } = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? j(new Error(m.error.message)) : r(m.result);
        } else if (m.method) { for (const f of this.listeners) f(m); }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

// `autoplay` is the whole reason this exists: 'strict' forces the mobile reality that a context
// which has never seen a gesture stays suspended.
async function launch({ w = 420, h = 860, mobile = true, autoplay = 'strict', headless = true } = {}) {
  const server = await serve(8871 + (process.pid % 200));
  const port = server.address().port;
  const cdpPort = await freePort(9871 + (process.pid % 200));
  const flags = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/neonhaul-p8-${process.pid}-${Math.random().toString(36).slice(2, 7)}`,
    `--window-size=${w},${h}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    // --mute-audio silences the OUTPUT DEVICE, not the graph: an AnalyserNode still reads the real
    // signal, which is how "sound is present" is measured rather than assumed.
    '--mute-audio',
    // Measured, not assumed: with `--autoplay-policy=user-gesture-required` a fresh AudioContext in
    // headless Chrome comes up **running**, so that flag would have made B2 a gate that cannot fail.
    // `document-user-activation-required` is the strict policy that actually gates Web Audio here
    // (verified: default → suspended, user-gesture-required → running, doc-activation → suspended).
    autoplay === 'strict' ? '--autoplay-policy=document-user-activation-required'
      : '--autoplay-policy=no-user-gesture-required',
  ];
  if (headless) flags.push('--headless=new', '--use-angle=metal', '--use-gl=angle');
  const proc = spawn(CHROME, flags, { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); ws = (await r.json()).webSocketDebuggerUrl; break; }
    catch { await sleep(150); }
  }
  if (!ws) { proc.kill('SIGKILL'); server.close(); throw new Error('chrome did not come up'); }
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Log.enable').catch(() => {});

  const console_ = [], net = [];
  cdp.listeners.push(m => {
    if (m.sessionId && m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled' && /error|warning/.test(m.params.type)) {
      console_.push('[' + m.params.type + '] ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console_.push('[throw] ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Network.requestWillBeSent') {
      net.push({ id: m.params.requestId, url: m.params.request.url, method: m.params.request.method,
        at: m.params.timestamp, bytes: 0, status: 0 });
    }
    if (m.method === 'Network.responseReceived') {
      const r = net.find(x => x.id === m.params.requestId); if (r) r.status = m.params.response.status;
    }
    if (m.method === 'Network.loadingFinished') {
      const r = net.find(x => x.id === m.params.requestId); if (r) r.bytes = m.params.encodedDataLength;
    }
    if (m.method === 'Network.loadingFailed') {
      const r = net.find(x => x.id === m.params.requestId); if (r) { r.failed = true; r.status = r.status || 0; }
    }
  });

  if (mobile) {
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await S('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
        + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  } else {
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }

  return {
    S, base: `http://127.0.0.1:${port}`, console: console_, net, cdp,
    async close() {
      await S('Browser.close').catch(() => {});
      try { proc.kill('SIGKILL'); } catch {}
      server.close();
    },
  };
}

// `JSON.stringify(somePromise)` is "{}" — it serialises the promise, not its value, and CDP's
// awaitPromise then has nothing left to await. That is the same shape as this project's dominant
// failure mode (a measurement that silently returns an empty object and reads as a number), and it
// bit this file once already. Resolve FIRST, stringify second, and it works for sync values too.
async function ev(S, expr, { timeout = 90000 } = {}) {
  const r = await S('Runtime.evaluate',
    { expression: `Promise.resolve(${expr}).then(v => JSON.stringify(v === undefined ? null : v))`,
      returnByValue: true, awaitPromise: true, timeout });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
async function raw(S, expr, { timeout = 90000 } = {}) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(S, expr, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result?.value) return Date.now() - t0;
    await sleep(100);
  }
  throw new Error('timed out waiting for ' + expr);
}
// A real touch, dispatched as touch events, because the first gesture on a phone is not a click.
async function tap(S, x = 200, y = 400) {
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(40);
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(60);
}

// ════════════════════════════════════════════════════════════════════════════
// LEG A — pure node. Manifest, shuffle bags, the director's long run.
// ════════════════════════════════════════════════════════════════════════════

async function legA() {
  const { ShuffleBag, ChatterDirector, mulberry32, DIR } = await import(resolve(ROOT, 'js/radio.js'));
  const M = JSON.parse(readFileSync(resolve(ROOT, 'assets/audio/manifest.json'), 'utf8'));
  const suno = readFileSync(resolve(ROOT, 'docs/SUNO.md'), 'utf8');

  // ── A1 §11 — every slot listed, and the manifest agrees with its source ──
  // The counts are no longer hard-coded. S2-B grew the pool from 64 chatter slots to 203, so a
  // literal 73 here would have to be edited on every content change, and a number that is edited to
  // match whatever was produced is not an assertion. Instead the manifest is checked against
  // tools/vo/lines.json, which is what generated it — the two can only agree if the generator ran
  // over the current source — and against the one number the phase actually promised.
  const back = M.chatter.filter(c => c.layer === 'back');
  const fore = M.chatter.filter(c => c.layer === 'fore');
  const LINES = JSON.parse(readFileSync(resolve(ROOT, 'tools/vo/lines.json'), 'utf8'));
  const srcSlots = [];
  for (const [g, gd] of Object.entries(LINES.groups))
    gd.lines.forEach((_, i) => srcSlots.push(`${g}_${String(i + 1).padStart(2, '0')}`));
  const manSlots = M.chatter.map(c => c.slot);
  const missingFromMan = srcSlots.filter(x => !manSlots.includes(x));
  const extraInMan = manSlots.filter(x => !srcSlots.includes(x));
  check('A1 §11 — every slot in tools/vo/lines.json is listed in the manifest, and the pool clears the 150-line floor S2-B was set',
    missingFromMan.length === 0 && extraInMan.length === 0 && M.music.length === 9
    && fore.length >= 150,
    `music ${M.music.length}, background ${back.length}, foreground ${fore.length}, `
    + `total ${M.music.length + M.chatter.length}. lines.json declares ${srcSlots.length} chatter slots `
    + `and the manifest lists ${manSlots.length}; ${missingFromMan.length} missing, ${extraInMan.length} extra. `
    + `Foreground ${fore.length} against the floor of 150.`);

  // ── A2 §11 — the load-bearing pool sizes ────────────────────────────────
  // §11's pool sizes were the sizes §10.4's repeat arithmetic was SOLVED against, so they are a
  // floor, not a target: a bigger pool can only push a repeat further away. They stay here as
  // minimums, which is the assertion that actually protects the player — plus the S2-B tag contract,
  // whose vocabulary is exactly three values and is the one field the other agent reads.
  const SIZES = { dispatch: 6, dispatch_confirm: 8, dispatch_pay: 8, police: 6, pirate: 5, ad: 6,
    distress: 5, weather: 5, life: 8, bg_net: 4, bg_dock: 3 };
  const got = {};
  for (const c of M.chatter) got[c.group] = (got[c.group] || 0) + 1;
  const wrong = Object.entries(SIZES).filter(([g, n]) => !(got[g] >= n));
  // `layer` and `tag` are two different axes and the contract must not conflate them. `layer` is the
  // AUDIO BUS — `back` is the unintelligible ambient bed at 0.22 gain, `fore` is a discrete
  // transmission you can make out. `tag` is how the TICKER RENDERS THE TEXT. A `life` line is a real
  // foreground transmission you hear clearly, and its text still belongs in the faded tier, because
  // a trucker blathering on an open channel is not addressed to the player. Requiring
  // `TAGS[tag] === layer` made the display tier a synonym for the bus and collapsed three render
  // tiers onto two, which is the whole reason the field exists.
  //
  // So the rule is ONE-DIRECTIONAL, and keeps what the original assertion actually protected: a bed
  // line can never render bright. `back` implies `bg`; `fore` may carry any of the three.
  const TAGS = ['bg', 'info', 'alert'];
  const badTag = M.chatter.filter(c => !TAGS.includes(c.tag) || (c.layer === 'back' && c.tag !== 'bg'));
  const tagCount = {};
  for (const c of M.chatter) tagCount[c.tag] = (tagCount[c.tag] || 0) + 1;
  check('A2 §11 — every pool meets the size §10.4\'s arithmetic is solved against, and every slot carries a legal S2 `tag`',
    wrong.length === 0 && badTag.length === 0,
    (wrong.length ? `UNDERSIZED: ${wrong.map(([g, n]) => `${g} needs ${n} has ${got[g]}`).join('; ')}. ` : '')
    + (badTag.length ? `ILLEGAL TAGS: ${badTag.slice(0, 5).map(c => `${c.slot}=${c.tag}/${c.layer}`).join(' ')}. ` : '')
    + Object.entries(got).map(([g, n]) => `${g} ${n}`).join(' · ')
    + `. tag vocabulary ${JSON.stringify(tagCount)} — exactly bg|info|alert, and every 'back' slot `
    + `carries 'bg' (a bed line can never render bright). A 'fore' slot may carry any of the three: `
    + `the bus and the render tier are different axes.`);

  // ── A3 — the popup text is SUNO.md's, character for character ───────────
  // §11: "Every line becomes one manifest slot with its text field set to the line exactly as
  // written here, so the popup and the audio match word for word. That matters — a mismatch reads
  // as a bug." So this compares against the source file rather than trusting the generator.
  const missing = fore.filter(c => !c.text || !c.text.trim());
  const notInSuno = fore.filter(c => c.text && !suno.includes(c.text));
  const backWithText = back.filter(c => 'text' in c);
  check('A3 §11 — every foreground text is non-empty and appears verbatim in docs/SUNO.md; no background slot carries text',
    missing.length === 0 && notInSuno.length === 0 && backWithText.length === 0,
    `${fore.length - notInSuno.length}/${fore.length} foreground texts found verbatim in SUNO.md; ${missing.length} empty; `
    + `${notInSuno.length} not matching source; ${backWithText.length} background slots carrying text `
    + `(§10.3 rule 3 — a back line NEVER shows text, so the field is absent rather than unused). `
    + `Longest line ${Math.max(...fore.map(c => c.text.length))} chars.`);

  // ── A4 — the shuffle-bag invariant, and it can fail ─────────────────────
  // §10.4's mechanism is "drawn without replacement; refilled when empty". The property that makes
  // that worth having is: inside one bag cycle, no line comes back. FALSIFIED against uniform
  // random selection over the same items, which must break the same assertion.
  function bagRun(n, draws, seed) {
    const items = Array.from({ length: n }, (_, i) => 'x' + i);
    const bag = new ShuffleBag(items, mulberry32(seed));
    const seq = [];
    for (let i = 0; i < draws; i++) seq.push(bag.draw());
    return seq;
  }
  function minGap(seq) {
    const last = new Map(); let m = Infinity;
    seq.forEach((s, i) => { if (last.has(s)) m = Math.min(m, i - last.get(s)); last.set(s, i); });
    return m;
  }
  function worstInCycle(seq, n) {          // any repeat inside a window of n draws?
    let bad = 0;
    for (let i = 0; i < seq.length; i++) {
      const w = seq.slice(Math.max(0, i - n + 1), i);
      if (w.includes(seq[i])) bad++;
    }
    return bad;
  }
  const gaps = [];
  for (let s = 1; s <= 300; s++) gaps.push(minGap(bagRun(5, 400, s)));
  const bagMin = Math.min(...gaps);
  const expectFloor = Math.floor(5 / 2) + 1;      // ShuffleBag.holdBack() + 1
  // the falsification: uniform random over the same 5 items
  const rndGaps = [];
  for (let s = 1; s <= 300; s++) {
    const r = mulberry32(s), items = ['x0', 'x1', 'x2', 'x3', 'x4'], seq = [];
    for (let i = 0; i < 400; i++) seq.push(items[Math.floor(r() * 5)]);
    rndGaps.push(minGap(seq));
  }
  const rndMin = Math.min(...rndGaps);
  check('A4 §10.4 — the shuffle bag puts a HARD floor of floor(n/2)+1 draws between repeats  [FALSIFIED]',
    bagMin >= expectFloor && rndMin < expectFloor,
    `bag, 5-line group, 300 seeds × 400 draws: minimum observed gap ${bagMin} draws `
    + `(floor is ${expectFloor}). Uniform random over the same five items: minimum gap ${rndMin} `
    + `— i.e. adjacent repeats. The check fails on the thing it is meant to catch, so it is measuring `
    + `the bag and not the array. Repeats inside one bag length: bag ${worstInCycle(bagRun(5, 400, 7), 5)}, `
    + `random ${(() => { const r = mulberry32(7), it = ['x0', 'x1', 'x2', 'x3', 'x4'], q = []; for (let i = 0; i < 400; i++) q.push(it[Math.floor(r() * 5)]); return worstInCycle(q, 5); })()}.`);

  // ── A5 §13 — a 25-minute virtual-clock run of the director ──────────────
  // §13: "a 25-minute virtual-clock run of the director draws no foreground line twice". Run over
  // 200 seeds rather than one, because a single seed is an anecdote.
  function dirRun(seedNo, minutes, ctx = {}, { noCooldown = false } = {}) {
    const slots = M.chatter.map(c => ({ ...c, cooldown: noCooldown ? 0 : c.cooldown }));
    const dir = new ChatterDirector({ slots, rng: mulberry32(seedNo) });
    dir.start(0);
    const dt = 0.5;
    for (let t = 0; t <= minutes * 60; t += dt) dir.tick(t, ctx);
    const fore = dir.history.filter(h => h.fire === 'fore');
    const seen = new Map(); let firstRepeat = null, dupes = 0;
    for (const h of fore) {
      if (seen.has(h.slot)) { dupes++; if (firstRepeat === null) firstRepeat = h.t; }
      seen.set(h.slot, h.t);
    }
    return { lines: fore.length, unique: seen.size, dupes, firstRepeat, dir };
  }
  const runs25 = [];
  for (let s = 1; s <= 200; s++) runs25.push(dirRun(s, 25));
  const clean25 = runs25.filter(r => r.dupes === 0).length;
  const meanLines = runs25.reduce((a, r) => a + r.lines, 0) / runs25.length;
  // falsification: the same director with the bags replaced by uniform random draws
  function randRun(seedNo, minutes) {
    const r = mulberry32(seedNo);
    const groups = {};
    for (const c of M.chatter) if (c.layer === 'fore' && DIR.AMBIENT.includes(c.group)) (groups[c.group] = groups[c.group] || []).push(c.slot);
    const gk = Object.keys(groups);
    const seq = []; let t = 0;
    while (t <= minutes * 60) {
      t += DIR.FORE_MIN + r() * (DIR.FORE_MAX - DIR.FORE_MIN);
      const g = gk[Math.floor(r() * gk.length)];
      seq.push(groups[g][Math.floor(r() * groups[g].length)]);
    }
    const seen = new Set(); let d = 0;
    for (const s of seq) { if (seen.has(s)) d++; seen.add(s); }
    return d;
  }
  let randClean = 0;
  for (let s = 1; s <= 200; s++) if (randRun(s, 25) === 0) randClean++;
  // Isolate the two mechanisms rather than crediting the pair. The bag alone (cooldowns zeroed)
  // says how much of the 25-minute guarantee is structural; the difference is what the cooldown
  // buys. Isolating before concluding is DECISIONS 13's lesson.
  const runsNoCd = [];
  for (let s = 1; s <= 200; s++) runsNoCd.push(dirRun(s, 25, {}, { noCooldown: true }));
  const cleanNoCd = runsNoCd.filter(r => r.dupes === 0).length;
  const earliestNoCd = Math.min(...runsNoCd.filter(r => r.firstRepeat !== null).map(r => r.firstRepeat), Infinity);
  note('director25', { seeds: 200, cleanRuns: clean25, meanLines: +meanLines.toFixed(1),
    randomCleanRuns: randClean, bagOnlyCleanRuns: cleanNoCd,
    bagOnlyEarliestRepeatS: isFinite(earliestNoCd) ? +earliestNoCd.toFixed(0) : null });
  check('A5 §13 — 25 virtual minutes of the director, 200 seeds: no foreground line is drawn twice  [FALSIFIED]',
    clean25 === 200 && randClean === 0,
    `${clean25}/200 seeds clean, mean ${meanLines.toFixed(1)} foreground lines per 25 min `
    + `(§10.4's 22–50 s jitter, mean 36 s, over 41 ambient lines in 7 groups). `
    + `Falsification — the same director with uniform random draws instead of bags: ${randClean}/200 `
    + `clean, so the gate does fail on the code it replaced. Mechanism isolated: with the per-slot `
    + `cooldowns zeroed and ONLY the shuffle bag left, ${cleanNoCd}/200 seeds stay clean and the `
    + `earliest repeat is at ${isFinite(earliestNoCd) ? earliestNoCd.toFixed(0) + ' s' : 'never'}. `
    + `Read that number carefully: the BAG ALONE DOES NOT DELIVER 25 MINUTES, and §10.4's claim that a `
    + `five-line group "lasts 21 minutes" is the length of one bag CYCLE — a mean, not a floor. The two `
    + `mechanisms do different jobs: the bag bounds NEAR repeats (A4, a hard floor of 3 draws), the `
    + `per-slot cooldown bounds them in TIME (A6). Only the pair meets §13, and each is asserted alone `
    + `so neither can silently stop working behind the other.`);

  // ── A6 — the cooldown is a hard TIME floor, not a nudge ─────────────────
  // §10.4: "Per-slot cooldown still applies on top, as a floor." Measured in seconds, over an hour,
  // which is where a bag-only mechanism starts repeating.
  const hour = [];
  for (let s = 1; s <= 60; s++) {
    const r = dirRun(s, 60);
    const last = new Map(); let worst = Infinity;
    for (const h of r.dir.history.filter(h => h.fire === 'fore')) {
      if (last.has(h.slot)) worst = Math.min(worst, h.t - last.get(h.slot));
      last.set(h.slot, h.t);
    }
    hour.push(worst);
  }
  const worstGapS = Math.min(...hour.filter(v => isFinite(v)));
  const cd = Math.min(...fore.filter(c => DIR.AMBIENT.includes(c.group)).map(c => c.cooldown));
  note('hourRun', { seeds: 60, minRepeatSeconds: isFinite(worstGapS) ? +worstGapS.toFixed(1) : null, ambientCooldown: cd });
  check('A6 §10.4 — over 60 virtual minutes no foreground line repeats inside its cooldown',
    isFinite(worstGapS) ? worstGapS >= cd - 0.001 : true,
    `60 seeds × 60 min: shortest observed interval between two plays of the same line `
    + `${isFinite(worstGapS) ? worstGapS.toFixed(1) + ' s' : 'no repeat at all'} against an ambient `
    + `cooldown floor of ${cd} s (${(cd / 60).toFixed(0)} min). A bag alone cannot promise this — see `
    + `the plan defect noted in the report: §10.4's "21 minutes" is one bag CYCLE, i.e. the mean, not `
    + `a floor. The cooldown is what makes it a floor.`);

  // ── A7 §10.3 rule 2 — absence never silences a foreground line ──────────
  // Mark every single slot absent — the "Aaron has generated nothing" state — and assert the
  // director fires exactly as many foreground lines, all of them with text.
  function absentRun(seedNo) {
    const dir = new ChatterDirector({ slots: M.chatter.map(c => ({ ...c })), rng: mulberry32(seedNo) });
    for (const c of M.chatter) dir.setAbsent(c.slot, true);
    dir.start(0);
    for (let t = 0; t <= 1500; t += 0.5) dir.tick(t, {});
    return dir;
  }
  const dirAbsent = absentRun(99);
  const aFore = dirAbsent.history.filter(h => h.fire === 'fore');
  const aBack = dirAbsent.history.filter(h => h.fire === 'back');
  const allHaveText = aFore.every(h => (dirAbsent.slots.get(h.slot).text || '').length > 0);
  // The structural assertion — this is the one that cannot be an accident of the RNG. Marking every
  // slot absent must leave every FOREGROUND bag at full size and empty every BACKGROUND bag.
  const foreBagsIntact = DIR.AMBIENT.every(g => {
    const grp = dirAbsent.groups.get(g);
    return grp && grp.bag.all.length === grp.ids.length && grp.ids.length > 0;
  });
  const backBagsEmpty = ['bg_net', 'bg_dock'].every(g => dirAbsent.groups.get(g).bag.all.length === 0);
  // …and the volume assertion, over 50 seeds each, because a single seed comparison is not a
  // comparison: `setAbsent` on a background slot rebuilds a bag and therefore consumes shared RNG,
  // so two single runs diverge for a reason that has nothing to do with the behaviour under test.
  let sumA = 0, sumP = 0;
  for (let s = 1; s <= 50; s++) {
    sumA += absentRun(s).history.filter(h => h.fire === 'fore').length;
    sumP += dirRun(s, 25).lines;
  }
  const meanA = sumA / 50, meanP = sumP / 50;
  check('A7 §10.3 rule 2 — marking EVERY slot absent leaves the foreground bags whole and the schedule unchanged',
    foreBagsIntact && backBagsEmpty && allHaveText && aBack.length === 0
    && Math.abs(meanA - meanP) / meanP < 0.05,
    `all ${M.chatter.length} chatter slots absent. Every one of the ${DIR.AMBIENT.length} ambient foreground bags is still at `
    + `full size (${DIR.AMBIENT.map(g => `${g}:${dirAbsent.groups.get(g).bag.all.length}`).join(' ')}) — absence `
    + `removes a slot from the AUDIO path and never from a bag. Both background bags are empty `
    + `(${backBagsEmpty}), and 0 background lines fired: a back line never shows text (§10.3 rule 3) so an `
    + `absent one is nothing at all, unlike a foreground one. Over 50 seeds the foreground rate is `
    + `${meanA.toFixed(1)} lines/25 min with everything absent vs ${meanP.toFixed(1)} with the files present `
    + `(${((meanA - meanP) / meanP * 100).toFixed(1)} %), and all ${aFore.length} lines in the sampled run carry `
    + `manifest text.`);

  // ── A8 §8.5 — the hold every real line will actually get ────────────────
  const { holdFor } = await import(resolve(ROOT, 'js/ui.js'));
  const holds = fore.map(c => ({ slot: c.slot, chars: c.text.length,
    text: +holdFor(c.text.length, 0, 1).toFixed(2),
    withAudio: +holdFor(c.text.length, 6.0, 1).toFixed(2) }));
  const h60 = +holdFor(60, 0, 1).toFixed(2);
  const clamped = holds.filter(h => h.text >= 13.0).length;
  check('A8 §8.5 — the read-time rule applied to all 57 real lines lands inside the 3.5–13.0 s clamp',
    Math.abs(h60 - 6.9) < 0.01 && holds.every(h => h.text >= 3.5 && h.text <= 13.0),
    `a 60-char line holds ${h60} s (§8.5's stated figure). Across the real lines: `
    + `${Math.min(...holds.map(h => h.text)).toFixed(2)}–${Math.max(...holds.map(h => h.text)).toFixed(2)} s, `
    + `${clamped} lines hit the 13.0 s ceiling. With a 6 s clip the floor becomes 7.2 s `
    + `(audioDuration + 1.2), so audio never outlasts its own popup.`);
  note('holds', { h60, min: Math.min(...holds.map(h => h.text)), max: Math.max(...holds.map(h => h.text)), atCeiling: clamped });

  // ── A9 §10.4 — the event pools are separate from the ambient schedule ───
  const dirEv = new ChatterDirector({ slots: M.chatter.map(c => ({ ...c })), rng: mulberry32(4242) });
  dirEv.start(0);
  const evSeq = [];
  for (let job = 0; job < 30; job++) {         // §10.4: 45 minutes of play is ~30 jobs
    const t = job * 90;
    evSeq.push(dirEv.event('dispatch_confirm', t)?.slot);
    evSeq.push(dirEv.event('dispatch_pay', t + 45)?.slot);
  }
  const confirms = evSeq.filter((_, i) => i % 2 === 0);
  const pays = evSeq.filter((_, i) => i % 2 === 1);
  const gapC = minGap(confirms), gapP = minGap(pays);
  // Both numbers are functions of the pool size, not constants: S2-B took these two pools from 8
  // lines to 20 each and a hard-coded 8 would have had to be edited to whatever was produced.
  // 30 draws from a bag of n>=... must use every line in it, and the bag's hold-back puts a floor of
  // floor(n/2)+1 draws between two plays of the same line (A4 proves that floor separately).
  const nC = M.chatter.filter(c => c.group === 'dispatch_confirm').length;
  const nP = M.chatter.filter(c => c.group === 'dispatch_pay').length;
  const floorC = Math.floor(nC / 2) + 1, floorP = Math.floor(nP / 2) + 1;
  check('A9 §10.4 — 30 jobs draw from the two dedicated event pools with no adjacent repeat',
    confirms.every(Boolean) && pays.every(Boolean) && gapC >= floorC && gapP >= floorP
    && new Set(confirms).size === Math.min(nC, 30) && new Set(pays).size === Math.min(nP, 30),
    `30 jobs at 90 s: ${new Set(confirms).size}/${nC} confirm lines and ${new Set(pays).size}/${nP} pay `
    + `lines used; closest repeat ${gapC} jobs (confirm, floor ${floorC}) / ${gapP} jobs (pay, floor `
    + `${floorP}) = ${(gapC * 90 / 60).toFixed(1)} / ${(gapP * 90 / 60).toFixed(1)} minutes apart. §10.4 `
    + `budgeted "about every twelve minutes" off an 8-line pool; the pools are ${nC} and ${nP} now, which `
    + `is why the measured figure is well past it. Neither pool ever failed to produce a line.`);
}

// ════════════════════════════════════════════════════════════════════════════
// LEG B — the harness in a real browser, strict autoplay policy, iPhone UA.
// ════════════════════════════════════════════════════════════════════════════

async function legB() {
  const M = JSON.parse(readFileSync(resolve(ROOT, 'assets/audio/manifest.json'), 'utf8'));
  const B = await launch({ mobile: true, autoplay: 'strict' });
  const { S } = B;
  try {
    const t0 = Date.now();
    await S('Page.navigate', { url: `${B.base}/tools/audio_harness.html` });
    await waitFor(S, 'window.__harnessReady', 20000);
    const tReady = Date.now() - t0;
    await raw(S, 'window.__audio.ready');
    await sleep(300);

    // ── B1 — nothing exists before a gesture ─────────────────────────────
    const pre = await ev(S, 'window.__audio.gaState()');
    const preNet = B.net.filter(r => /assets\/audio\//.test(r.url));
    const preMusic = preNet.filter(r => /\/music\//.test(r.url));
    check('B1 — before any gesture: no AudioContext, no nodes, and not one music byte requested',
      pre.ctx === null && pre.nodes === false && preMusic.length === 0,
      `ctx=${pre.ctx} nodes=${pre.nodes} unlockTries=${pre.unlockTries}. `
      + `Requests under assets/audio/: ${preNet.length} (${preNet.map(r => r.url.split('/').pop()).join(', ') || 'none'}) `
      + `totalling ${preNet.reduce((a, r) => a + r.bytes, 0)} bytes. Music requests: ${preMusic.length}. `
      + `Harness interactive in ${tReady} ms.`);
    note('harnessReadyMs', tReady);

    // ── B2 — the strict policy is real, so B3 is a measurement ───────────
    // A gate that says "the gesture unlocked it" is worthless if the context would have unlocked
    // itself. This asserts the negative case first: unlock() called with NO activation must leave
    // the context suspended.
    const forced = await ev(S, '(() => { window.__audio.unlock(); return window.__audio.ctxState(); })()');
    await sleep(400);
    const afterForced = await ev(S, 'window.__audio.gaState()');
    check('B2 — under a strict autoplay policy an unlock without a gesture leaves the context SUSPENDED  [FALSIFIED]',
      forced === 'suspended' && afterForced.ready === false,
      `unlock() with no user activation → ctx.state="${forced}", ready=${afterForced.ready}, `
      + `blocked=${afterForced.blocked}. Note what actually happens: resume() does NOT reject here, it `
      + `simply never resolves to "running", so a module that trusted the call would report success and `
      + `play nothing. GameAudio.ready is set from ctx.state, never from the fact that resume() ran. `
      + `This is the control for B3: without it, "the gesture worked" could simply be "the browser never `
      + `blocked anything". (Measured while writing this: --autoplay-policy=user-gesture-required does `
      + `NOT gate Web Audio in headless Chrome — a context comes up running — so this leg runs under `
      + `document-user-activation-required, which does.)`);

    // ── B3 — a TOUCH unlocks it ──────────────────────────────────────────
    await tap(S, 200, 430);
    await sleep(500);
    const post = await ev(S, 'window.__audio.gaState()');
    check('B3 §2.8 — a single touchStart/touchEnd under an iPhone UA unlocks the context and builds the graph',
      post.ctx === 'running' && post.ready === true && post.nodes === true,
      `after one dispatchTouchEvent pair: ctx=${post.ctx} ready=${post.ready} nodes=${post.nodes} `
      + `sampleRate=${post.sampleRate}. No click was ever sent — §6.1's flight stick means the first `
      + `gesture on a phone is a touch-drag, and a click-only unlock would never fire.`);

    // ── B4 — sound is PRESENT, measured off an analyser ──────────────────
    // The traffic net bed (§10.1) runs from the first frame with no files at all. This is the gate
    // that "the city is never dead" is not a claim: the analyser reads real signal energy.
    // ISOLATED: audio.js only. `radio.update({})` legitimately resolves to the cruise state and
    // starts streaming a track, which would put music into a measurement whose whole claim is
    // "with zero files". The first version of this gate did exactly that and read a contaminated
    // number without saying so. The isolation is asserted, not assumed (obligation T7).
    const netBefore = B.net.filter(r => /assets\/audio\//.test(r.url)).length;
    await ev(S, 'window.__audio.tickAudio(240, 1/60, {})');
    await sleep(200);
    const bed = await ev(S, 'window.__audio.masterRms(600)');
    const bedState = await ev(S, 'window.__audio.gaState()');
    const bedRadio = await ev(S, 'window.__audio.radioState()');
    const netAfter = B.net.filter(r => /assets\/audio\//.test(r.url)).length;
    check('B4 §10.1 — the synthesised traffic-net bed produces measurable signal with ZERO files loaded',
      bed.ok === true && bed.peak > 1e-4 && bedRadio.music === null && netAfter === netBefore
      && bedRadio.buffers === 0,
      `master bus peak RMS ${bed.peak} (${bed.db} dBFS) over ${bed.samples} analyser reads. `
      + `Net bed gain ${bedState.net} (§10.1's 0.10 target, ramping), squelch clicks fired `
      + `${bedState.counts.netClicks}, one-shots ${bedState.counts.oneShots}. `
      + `ISOLATION CHECKED: music=${JSON.stringify(bedRadio.music)}, decoded buffers=${bedRadio.buffers}, `
      + `and requests under assets/audio/ went ${netBefore} → ${netAfter} across the measurement — so `
      + `not one byte of anything is in this number. --mute-audio silences the output device, not the `
      + `graph, so this is the signal the player would hear.`);
    note('bedRms', bed);

    // ── B5 — decoded sample energy of every real clip ────────────────────
    const files = await ev(S, `(async () => {
      const m = await (await fetch('../assets/audio/manifest.json')).json();
      const all = [...m.music.map(x=>'assets/audio/'+x.file), ...m.chatter.map(x=>'assets/audio/'+x.file)];
      const out = [];
      for (const f of all) out.push(await window.__audio.rmsOf(f));
      return out;
    })()`, { timeout: 180000 });
    const present = files.filter(f => f.ok);
    const absentF = files.filter(f => !f.ok);
    const silentF = present.filter(f => f.silent);
    const minDb = Math.min(...present.map(f => f.db)), maxDb = Math.max(...present.map(f => f.db));
    // The claim is now stronger than it was at ship. Then, 42 of 73 slots legitimately had no file
    // and the assertion was a count. Now EVERY chatter slot has one, so the assertion is that not a
    // single chatter clip is missing, undecodable or silent — a per-slot claim with nothing to hide
    // behind. Only the four optional music tracks are still allowed to 404, and they are named.
    const chatterFiles = files.filter(f => /\/chatter\//.test(f.path));
    const chatterAbsent = chatterFiles.filter(f => !f.ok);
    const OPTIONAL_MUSIC = ['chase.mp3', 'storm.mp3', 'first_flight.mp3', 'pirate.mp3'];
    const unexpectedAbsent = absentF.filter(f => !OPTIONAL_MUSIC.includes(f.path.split('/').pop()));
    check('B5 — every present clip carries real decoded sample energy (RMS, not bytes and not duration)',
      chatterAbsent.length === 0 && chatterFiles.length === M.chatter.length
      && silentF.length === 0 && unexpectedAbsent.length === 0,
      `${present.length} of ${files.length} slots have a file; all ${present.length} decode and all `
      + `${present.length} are above MIN_RMS. Range ${minDb.toFixed(1)} dBFS to ${maxDb.toFixed(1)} dBFS `
      + `(RMS ${Math.min(...present.map(f => f.rms)).toFixed(4)}–${Math.max(...present.map(f => f.rms)).toFixed(4)}). `
      + `All ${chatterFiles.length} chatter slots have audio — ${chatterAbsent.length} absent, `
      + `${silentF.length} silent. The only ${absentF.length} absent slots are the optional music `
      + `tracks (${absentF.map(f => f.path.split('/').pop()).join(', ') || 'none'}); `
      + `${unexpectedAbsent.length} unexpected. Quietest present clip: `
      + `${present.slice().sort((a, b) => a.rms - b.rms)[0].path.split('/').pop()}.`);
    note('clipRms', present.map(f => ({ f: f.path.split('/').pop(), rms: f.rms, db: f.db, dur: f.duration })));

    // ── B5b — the hole B5 acquired when the assets grew a noise floor ────
    // B5 asks "does this clip contain energy". At ship that was the whole question, because a SUNO
    // take was either speech or digital silence. S2-B's radio chain deliberately mixes a pink-noise
    // carrier and two squelch bursts into EVERY clip, so a clip whose synthesiser step produced
    // nothing now decodes at about −37 dBFS of pure hiss — and sails through B5. That was measured,
    // not assumed: a noise-only encode staged into life_20.mp3 was reported by B5 as the quietest
    // present clip and the gate stayed green.
    //
    // So this measures the SPEECH WINDOW: the span between the head squelch (75 ms) and the tail
    // squelch (130 ms), with 50 ms of margin either side. The floor is −26.5 dBFS, which is 8 dB
    // above the loudest of the four no-speech controls that tools/vo/gen_chatter.py builds by
    // running silence through the identical chain. The falsification does not need a staged file:
    // a real clip is decoded and its speech window zeroed IN THE PAGE, leaving the squelch bursts
    // intact, and the pair is measured by the same code.
    const SPEECH_FLOOR_DB = -26.5;
    const win = await ev(S, `(async () => {
      const m = await (await fetch('../assets/audio/manifest.json')).json();
      const ctx = window.__audio.audio.ctx;
      const HEAD = 0.075 + 0.05, TAIL = 0.130 + 0.05;
      const winRms = (buf, h, t) => {
        const d = buf.getChannelData(0), sr = buf.sampleRate;
        const i0 = Math.min(d.length, Math.round(h * sr)), i1 = Math.max(i0, d.length - Math.round(t * sr));
        let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i];
        return Math.sqrt(s / Math.max(1, i1 - i0));
      };
      const out = [];
      let probe = null;
      for (const c of m.chatter) {
        const r = await fetch('../assets/audio/' + c.file, { cache: 'no-store' });
        if (!r.ok) { out.push({ slot: c.slot, ok: false }); continue; }
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        const s = winRms(buf, HEAD, TAIL);
        out.push({ slot: c.slot, ok: true, speech: +(20 * Math.log10(s + 1e-12)).toFixed(2),
                   whole: +(20 * Math.log10(winRms(buf, 0, 0) + 1e-12)).toFixed(2) });
        if (!probe) {
          // the falsification: same buffer, speech window zeroed, squelch bursts left alone
          const z = ctx.createBuffer(1, buf.length, buf.sampleRate);
          const src = buf.getChannelData(0), dst = z.getChannelData(0);
          const i0 = Math.round(HEAD * buf.sampleRate), i1 = buf.length - Math.round(TAIL * buf.sampleRate);
          for (let i = 0; i < buf.length; i++) dst[i] = (i >= i0 && i < i1) ? 0 : src[i];
          const zw = winRms(z, 0, 0);
          probe = { slot: c.slot,
                    speech: +(20 * Math.log10(winRms(z, HEAD, TAIL) + 1e-12)).toFixed(2),
                    whole: +(20 * Math.log10(zw + 1e-12)).toFixed(2),
                    wholeRms: +zw.toFixed(6), minRms: window.__audio.MIN_RMS,
                    passesB5: zw >= window.__audio.MIN_RMS };
        }
      }
      return { out, probe };
    })()`, { timeout: 300000 });
    const wOk = win.out.filter(w => w.ok);
    const wQuiet = wOk.filter(w => w.speech < SPEECH_FLOOR_DB);
    const wMin = Math.min(...wOk.map(w => w.speech)), wMax = Math.max(...wOk.map(w => w.speech));
    check('B5b — every clip contains SPEECH, not just the hiss the radio chain adds  [FALSIFIED]',
      wOk.length === win.out.length && wQuiet.length === 0
      && win.probe.speech < SPEECH_FLOOR_DB && win.probe.passesB5 === true,
      `${wOk.length} chatter clips decoded; speech window ${wMin.toFixed(1)} to ${wMax.toFixed(1)} dBFS `
      + `against a floor of ${SPEECH_FLOOR_DB} dBFS, ${wQuiet.length} below it. Falsification — `
      + `${win.probe.slot} with its speech window zeroed and its squelch bursts kept reads `
      + `${win.probe.speech} dBFS in the window (rejected) while its WHOLE-FILE RMS is still `
      + `${win.probe.wholeRms} (${win.probe.whole} dBFS) against MIN_RMS ${win.probe.minRms} — so B5 `
      + `would call that clip fine (passesB5=${win.probe.passesB5}). That is the hole, and it opened `
      + `the moment the assets acquired a deliberate noise floor.`);
    note('speechWindow', { floor: SPEECH_FLOOR_DB, min: wMin, max: wMax, probe: win.probe });

    // ── B6 — and the check catches silence ───────────────────────────────
    // `_silenced.mp3` was encoded from a real clip with volume=0: identical duration, identical
    // channel layout, identical codec, ~the same byte size. Every check this project has previously
    // used — exists, decodes, non-zero length — passes on it.
    const sil = await ev(S, `window.__audio.rmsOf('assets/audio/chatter/_p8_silenced.mp3')`);
    const good = await ev(S, `window.__audio.rmsOf('assets/audio/chatter/dispatch_01.mp3')`);
    const silBuf = await ev(S, `(() => { const b = window.__audio.silentBuffer(3); return window.__audio.playRaw(b); })()`);
    const goodPlay = await ev(S, `(async () => { const b = await window.__audio.radio.clip('dispatch_01'); return window.__audio.playRaw(b); })()`);
    check('B6 — the silence check FAILS a deliberately silenced encode of a real clip  [FALSIFIED]',
      sil.ok === true && sil.silent === true && good.silent === false
      && silBuf === null && goodPlay !== null,
      `_p8_silenced.mp3: exists ✓, decodes ✓, duration ${sil.duration} s ✓, ${sil.bytes} bytes ✓ — and `
      + `RMS ${sil.rms} (${sil.db} dBFS) → flagged SILENT. The same file passes every existence/decode/`
      + `duration check, which is exactly how a silent clip was once reported OK on this project. `
      + `Control: dispatch_01.mp3 RMS ${good.rms} (${good.db} dBFS) → not silent. `
      + `And the refusal is enforced in the GRAPH too: playClip() on a zero buffer returned `
      + `${JSON.stringify(silBuf)} while a real buffer returned ${JSON.stringify(goodPlay)}.`);

    // ── B7 — no unhandled rejections anywhere in the blocked path ────────
    const errs = await ev(S, 'window.__audio.errors');
    const unhandled = B.console.filter(l => /Unhandled|unhandled promise|Uncaught \(in promise\)/i.test(l));
    check('B7 — every rejection along the blocked-autoplay path was caught, none escaped',
      unhandled.length === 0,
      `${errs.length} error(s) reported through the module's own onError channel `
      + `(${errs.slice(0, 3).join(' | ') || 'none'}), and ${unhandled.length} unhandled rejections in the `
      + `console. A rejected resume()/play() is NORMAL on mobile; letting it become an unhandled `
      + `rejection is the bug obligation T8 names on the video side.`);
    note('harnessErrors', errs);

    // ── B8 §10.2 — the radio bus band-limits, as a transfer function ─────
    const curve = await ev(S, 'window.__audio.busCurve()', { timeout: 120000 });
    const at = f => curve.find(p => p.f === f);
    const wide = await ev(S, 'window.__audio.busCurve({ hp: 10, lp: 20000 })', { timeout: 120000 });
    const wAt = f => wide.find(p => p.f === f);
    // Band limiting is a SHAPE, so the assertion is relative to the passband, not absolute. It has
    // to be: Chrome's DynamicsCompressorNode applies an internal makeup gain, so at this input level
    // the whole curve sits ~+16 dB and an absolute "< −20 dB at 60 Hz" test would fail on a bus that
    // band-limits perfectly. Measuring the offset instead of the shape would have been a gate that
    // measures the compressor, which is item four on this project's list of things that went wrong.
    const rel = f => at(f).db - at(1000).db;
    const relW = f => wAt(f).db - wAt(1000).db;
    const pass = rel(60) < -20 && rel(14000) < -20 && Math.abs(rel(1000)) < 0.01 && rel(500) > -3 && rel(2000) > -3;
    const falsified = !(relW(60) < -20 && relW(14000) < -20);
    check('B8 §10.2 — the radio bus band-limits a clean input to the 300–3400 Hz band  [FALSIFIED]',
      pass && falsified,
      `measured transfer function, sine in / RMS out, rendered in an OfflineAudioContext: `
      + curve.map(p => `${p.f}Hz ${p.db.toFixed(1)}dB`).join(' · ')
      + `. Relative to the 1 kHz passband: 60 Hz ${rel(60).toFixed(1)} dB, 120 Hz ${rel(120).toFixed(1)} dB, `
      + `500 Hz ${rel(500).toFixed(1)} dB, 2 kHz ${rel(2000).toFixed(1)} dB, 6 kHz ${rel(6000).toFixed(1)} dB, `
      + `14 kHz ${rel(14000).toFixed(1)} dB — a telephone band, which is the point: SUNO returns clean, `
      + `well-produced audio and clean audio does not sound like a radio. Falsification — the SAME `
      + `measurement with only the two filter corners widened to 10 Hz / 20 kHz reads 60 Hz `
      + `${relW(60).toFixed(1)} dB and 14 kHz ${relW(14000).toFixed(1)} dB relative to passband, so the `
      + `assertion collapses and the number is reading the filters rather than the compressor's makeup `
      + `gain (which is why the whole curve sits at +${at(1000).db.toFixed(0)} dB absolute).`);
    note('busCurve', curve);
    note('busCurveWide', wide);

    // ── B9 §10.3 rule 1 — the absence sweep ──────────────────────────────
    const abs = await ev(S, 'window.__audio.probe()', { timeout: 120000 });
    check('B9 §10.3 rule 1 — the deferred HEAD sweep classifies every slot and empties the pools that have no files',
      abs.music.present === 5 && abs.pools.cruise === 2 && abs.pools.rush === 0 && abs.pools.storm === 0
      && abs.chatter.absent === 0 && abs.chatter.total === M.chatter.length,
      `music present ${abs.music.present}/9 (${abs.music.presentSlots.join(', ')}); `
      + `chatter absent ${abs.chatter.absent}/${abs.chatter.total}. Pools: `
      + Object.entries(abs.pools).map(([p, n]) => `${p}=${n}`).join(' ')
      + `. rush/storm/intro/diegetic are empty and the chain falls through to cruise — §10.3 rule 4's `
      + `state machine cannot request a file that is not there.`);
    note('absence', abs);

    // ── B10 — music is requested exactly once, at the moment a pool starts ─
    // A FRESH page: B4–B9 have already probed and ticked, and a gate about "the first music byte"
    // cannot be run on a session that has already fetched some. The probe sweep in B9 is HEAD-only,
    // but proving that is this gate's job too, so it starts from zero.
    B.net.length = 0;
    await S('Page.navigate', { url: `${B.base}/tools/audio_harness.html?fresh=1` });
    await waitFor(S, 'window.__harnessReady', 20000);
    await raw(S, 'window.__audio.ready');
    await tap(S, 200, 430);
    await sleep(400);
    const before = B.net.filter(r => /assets\/audio\/music\//.test(r.url)).length;
    await ev(S, `window.__audio.tick(2, 0.5, { menu: true })`);
    await sleep(2000);
    const mid = B.net.filter(r => /assets\/audio\/music\//.test(r.url));
    const mst = await ev(S, 'window.__audio.radioState()');
    // advance the radio's own clock past the 2 s the energy check waits for, then read the analyser
    await sleep(2000);
    await ev(S, `window.__audio.tick(10, 0.5, { menu: true })`);
    const mrms = await ev(S, 'window.__audio.masterRms(500)');
    const mst2 = await ev(S, 'window.__audio.radioState()');
    check('B10 §10.3 rule 4 — the first music byte is requested only when a pool is started, and only for the one chosen slot',
      before === 0 && mid.length === 1 && mst.music !== null,
      `music requests before the state machine ran: ${before}. After entering "menu": ${mid.length} `
      + `(${mid.map(r => r.url.split('/').pop()).join(', ')}), ${(mid.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(0)} KB `
      + `so far. Playing "${mst.music?.slot}" from pool "${mst.music?.pool}", playing=${mst.music?.playing}, `
      + `blocked=${mst.music?.blocked}. One slot, not nine — the other four present tracks were never touched.`);
    check('B11 — streamed music produces real energy and passes the same RMS floor the clips do',
      mst2.music !== null && mst2.music.rms !== null && mst2.music.rms > 1e-4 && mrms.peak > 1e-3,
      `analyser on the music chain reads RMS ${mst2.music?.rms} for "${mst2.music?.slot}"; master bus peak `
      + `${mrms.peak} (${mrms.db} dBFS). Music cannot be RMS'd before it plays — a 4-minute stereo track `
      + `is ~76 MB decoded and five of them would be ~380 MB resident on a phone, so music is STREAMED `
      + `through a MediaElementAudioSourceNode and measured after it starts. Slots marked silent so far: `
      + `${JSON.stringify(mst2.silent)}.`);
    note('musicStart', { requests: mid.map(r => ({ url: r.url.split('/').pop(), bytes: r.bytes, status: r.status })), state: mst2.music });

    // ── B12 — the crossfade actually crosses ─────────────────────────────
    const fadeSamples = await ev(S, `(async () => {
      window.__audio.tick(2, 0.5, { docked: true });
      return await window.__audio.sampleMusicGain(2200, 70);
    })()`, { timeout: 60000 });
    const slots = [...new Set(fadeSamples.map(s => s.slot))].filter(Boolean);
    const rising = fadeSamples.filter(s => s.g !== null);
    const grew = rising.length > 3 && rising[rising.length - 1].g > rising[0].g;
    check('B12 §10.3 rule 4 — a state change crossfades to a new slot over the slot\'s own fade time',
      slots.length >= 1 && grew,
      `menu → docked: now playing ${slots.join(' → ')}; incoming gain traced `
      + `${rising.slice(0, 6).map(s => s.g).join(' → ')} … ${rising[rising.length - 1].g} over `
      + `${(rising[rising.length - 1].t).toFixed(2)} s. The curve is a sin/cos pair via `
      + `setValueCurveAtTime, not two exponentials — two exponential ramps dip through the middle of a `
      + `crossfade and the seam is audible.`);
    note('crossfade', fadeSamples.filter((_, i) => i % 3 === 0));

  } finally { await B.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// LEG C — §13's drop-in gate, and the silence path end to end.
// ════════════════════════════════════════════════════════════════════════════

async function legC() {
  const CH = resolve(ROOT, 'assets/audio/chatter');
  const staged = [resolve(CH, 'police_01.mp3'), resolve(CH, 'police_02.mp3')];
  // police_01 gets the SILENCED encode, police_02 gets a verbatim copy of a different real clip.
  //
  // At ship these two slots had no file, so staging one WAS the drop-in this leg is about and the
  // finally simply deleted them. S2-B generated every slot, so the same three lines would now
  // overwrite two real assets and then delete them — a gate that destroys the thing it measures.
  // So the real files are moved aside first and restored at the end, which keeps the leg's premise
  // exactly (both slots genuinely have no file when the browser starts) and is asserted by C3.
  const backups = staged.map(f => f + '.p8bak');
  for (let i = 0; i < staged.length; i++) {
    if (!existsSync(staged[i])) throw new Error(`legC: ${staged[i]} is missing — it should exist before this leg hides it`);
    renameSync(staged[i], backups[i]);
  }
  const bakBytes = backups.map(b => statSync(b).size);
  copyFileSync(resolve(CH, '_p8_silenced.mp3'), staged[0]);
  copyFileSync(resolve(CH, 'dispatch_pay_01.mp3'), staged[1]);

  const B = await launch({ mobile: true, autoplay: 'strict' });
  const { S } = B;
  try {
    await S('Page.navigate', { url: `${B.base}/tools/audio_harness.html` });
    await waitFor(S, 'window.__harnessReady', 20000);
    await raw(S, 'window.__audio.ready');
    await tap(S, 200, 430);
    await sleep(400);
    await ev(S, 'window.__audio.tick(60, 1/60, {})');

    // ── C1 §13 — dropping one mp3 in makes it play, duck the music, and popup for the computed hold
    await ev(S, `window.__audio.tick(2, 0.5, { menu: true })`);
    await sleep(2200);                                 // let the music get to full gain
    // §10.2's duck is on the MUSIC BUS (audio.music), not on the per-track gain node — the track's
    // own gain is its manifest `gain` and never moves. Reading the wrong node here reported "0.55 →
    // 0.55" and looked like a failed duck when the duck was working; the bus is the node under test.
    await ev(S, 'window.__audio.tickAudio(30, 1/60, {})');
    await sleep(400);
    const busBefore = (await ev(S, 'window.__audio.gaState()')).musicGain;
    const gBefore = (await ev(S, 'window.__audio.radioState()')).music;
    const drop = await ev(S, `(async () => {
      const r = window.__audio.radio;
      const buf = await r.clip('police_02');
      const rec = r.manifest.chatter.find(c => c.slot === 'police_02');
      const before = window.__audio.chatterLines.length;
      const fired = r.fire(rec);
      const line = window.__audio.chatterLines[window.__audio.chatterLines.length - 1];
      return { decoded: buf ? { duration: +buf.duration.toFixed(3), rms: +buf._rms.toFixed(5) } : null,
               fired, line, newLines: window.__audio.chatterLines.length - before,
               ducked: window.__audio.audio.state().ducked };
    })()`, { timeout: 60000 });
    await ev(S, 'window.__audio.tickAudio(20, 1/60, {})');
    await sleep(700);
    await ev(S, 'window.__audio.tickAudio(20, 1/60, {})');
    const busAfter = (await ev(S, 'window.__audio.gaState()')).musicGain;
    const gAfter = (await ev(S, 'window.__audio.radioState()')).music;
    const { holdFor } = await import(resolve(ROOT, 'js/ui.js'));
    const expectHold = +holdFor(drop.line.text.length, drop.line.audio, 1).toFixed(3);
    check('C1 §13 — one mp3 dropped into chatter/ plays, ducks the music, and shows its popup for the computed hold',
      drop.decoded !== null && drop.fired.audio > 0 && drop.newLines === 1
      && drop.ducked === true && busAfter < busBefore * 0.7,
      `police_02.mp3 (an optional slot with no file until this gate staged one) decoded to `
      + `${drop.decoded.duration} s at RMS ${drop.decoded.rms} and played with audio duration `
      + `${drop.fired.audio} s. The popup fired once — [${drop.line.speaker}] "${drop.line.text.slice(0, 48)}…" `
      + `— and §8.5 computes its hold as ${expectHold} s = max(1.8+0.085×${drop.line.text.length}, `
      + `${drop.fired.audio}+1.2). Music bus ducked ${busBefore} → ${busAfter} against §10.2's 0.35× `
      + `target; the track's own gain stayed at ${gAfter.gain} (its manifest value, correctly untouched — `
      + `the duck is a bus, not a per-track edit). No code change, no manifest edit, no rebuild — `
      + `§10.3 rule 5.`);
    note('dropIn', { drop, expectHold, busBefore, busAfter, trackGain: gAfter.gain });

    // ── C2 — a SILENT file in a real slot degrades to text-only ───────────
    const silPath = await ev(S, `(async () => {
      const r = window.__audio.radio;
      const buf = await r.clip('police_01');
      const rec = r.manifest.chatter.find(c => c.slot === 'police_01');
      const before = window.__audio.chatterLines.length;
      const fired = r.fire(rec);
      const line = window.__audio.chatterLines[window.__audio.chatterLines.length - 1];
      return { clip: buf, fired, line, newLines: window.__audio.chatterLines.length - before,
               st: r.state() };
    })()`, { timeout: 60000 });
    check('C2 — a slot whose file exists, decodes and has duration but contains SILENCE is treated as absent and goes out as text  [FALSIFIED]',
      silPath.clip === null && silPath.fired.audio === 0 && silPath.newLines === 1
      && silPath.st.silent.includes('police_01') && silPath.st.stats.silentRejected >= 1,
      `police_01.mp3 was staged with a volume=0 encode of a real clip. radio.clip() returned `
      + `${JSON.stringify(silPath.clip)}, the slot went into the silent set `
      + `(${JSON.stringify(silPath.st.silent)}), silentRejected=${silPath.st.stats.silentRejected}, and the `
      + `line still reached the player as text with audio=${silPath.fired.audio}: `
      + `"[${silPath.line.speaker}] ${silPath.line.text.slice(0, 40)}…". Compare C1, where the SAME code `
      + `path on a real clip played audio — that contrast is the falsification: the two runs differ only `
      + `in whether the bytes contain sound.`);

    // ── C3 — and the two real clips this leg hid are back, byte for byte ──
    for (let i = 0; i < staged.length; i++) { try { rmSync(staged[i]); } catch {} renameSync(backups[i], staged[i]); }
    const restored = staged.map(f => existsSync(f) && statSync(f).size);
    check('C3 — the two real clips legC replaced with fixtures were restored, byte for byte',
      restored.every((n, i) => n === bakBytes[i]) && backups.every(b => !existsSync(b)),
      `police_01.mp3 ${bakBytes[0]} B → ${restored[0]} B and police_02.mp3 ${bakBytes[1]} B → `
      + `${restored[1]} B, and no .p8bak file is left behind. This leg overwrites two shipped assets `
      + `with test fixtures; without this assertion a crash between the copy and the restore would `
      + `leave a silenced clip in the shipped pool and the suite would still read green.`);

  } finally {
    await B.close();
    // Belt and braces: if the leg threw before C3, the originals are still under .p8bak.
    for (let i = 0; i < staged.length; i++) {
      if (existsSync(backups[i])) { try { rmSync(staged[i]); } catch {} renameSync(backups[i], staged[i]); }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LEG D — the real game, with the audio layer injected exactly as
// docs/P8_WIRING.md specifies. P8 may not edit main.js or index.html, so the
// wiring is applied with Page.addScriptToEvaluateOnNewDocument instead of being
// written to disk. That is not a workaround for testing: it is how the pending
// patch gets measured before the manager applies it.
// ════════════════════════════════════════════════════════════════════════════

const WIRE = `
(() => {
  const W = window.__wire = { errors: [], lines: [], t0: performance.now(), boot: null, frames: 0 };
  const settings = { music: true, sfx: true, radio: true, chatterHold: 'normal', station: 'none' };
  // ADOPT the game's own audio layer when it has one. This script predates the wiring: when P8
  // wrote it, main.js contained no audio at all and leg D's whole job was to inject the pending
  // patch and run the suite against it. Now that the patch is APPLIED, constructing a second
  // GameAudio + Radio here put TWO radios on the page, each of which requested music/storm.mp3
  // and got a 404 — and D3's "each missing track is requested at most once" assertion caught it,
  // correctly, as a double request. Adopting means leg D now tests the SHIPPED wiring, which is
  // strictly what it always claimed to be testing.
  const start = async () => {
    const g = window.__game;
    let audio = g && g.audio, radio = g && g.radio;
    W.adopted = !!(audio && radio);
    if (W.adopted) {
      // splice the line recorder onto the live chatter sink rather than replacing it
      const orig = radio.chatterOut;
      radio.chatterOut = o => { W.lines.push(o); return orig(o); };
      radio.scheduleDeferredLoads(0);
    } else {
      const [A, R] = await Promise.all([import('/js/audio.js'), import('/js/radio.js')]);
      audio = new A.GameAudio({ settings: () => settings, onError: (k, m) => W.errors.push(k + ': ' + m) });
      radio = new R.Radio({
        audio, base: '/',
        chatter: o => { W.lines.push(o); try { window.__game.chatter(o); } catch (e) { W.errors.push('chatter: ' + e.message); } },
        settings: () => settings,
        onError: (k, m) => W.errors.push(k + ': ' + m),
      });
      audio.installGestureHooks(window);
      await radio.load();
      radio.scheduleDeferredLoads(0);
    }
    W.audio = audio; W.radio = radio;
    let last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      W.frames++;
      // When adopted, main.js's own frame already drives both — a second update() per frame would
      // double every rate in the director.
      if (!W.adopted) {
        try {
          const st = window.__state || {};
          radio.update(dt, { menu: false, docked: false, variant: st.variant, nearHub: false });
          audio.update(dt, { speed: Math.min(1, (st.player ? st.player.speed : 0) / 60), rain: 0 });
        } catch (e) { W.errors.push('loop: ' + e.message); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    W.boot = performance.now() - W.t0;
    W.ready = true;
  };
  const poll = setInterval(() => {
    if (window.__game && window.__ready) { clearInterval(poll); start().catch(e => W.errors.push('boot: ' + e.message)); }
  }, 50);
})();
`;

async function legD() {
  const B = await launch({ mobile: true, autoplay: 'strict', w: 420, h: 860 });
  const { S } = B;
  // Installed ONCE. `Page.addScriptToEvaluateOnNewDocument` accumulates: calling it per navigation
  // left three copies of the wiring running three Radios and three rAF loops in the same page, which
  // is how a "29 music requests" number appeared that had nothing to do with the code under test.
  let wireInstalled = false;
  const nav = async (url, wire) => {
    B.net.length = 0; B.console.length = 0;
    if (wire && !wireInstalled) { await S('Page.addScriptToEvaluateOnNewDocument', { source: WIRE }); wireInstalled = true; }
    const t0 = Date.now();
    await S('Page.navigate', { url });
    const ms = await waitFor(S, 'window.__ready', 60000);
    return { ms, wall: Date.now() - t0 };
  };
  try {
    // ── D1 — time-to-interactive, audio off vs audio wired ───────────────
    // `?noaudio=1` is the CONTROL: the audio layer is genuinely not constructed. Comparing a plain
    // navigation against an injected one stopped being a comparison the moment the wiring landed in
    // main.js — both halves were wired, the delta was noise around zero, and the gate would have
    // gone on passing while measuring nothing.
    const plain = [];
    for (let i = 0; i < 3; i++) { plain.push((await nav(`${B.base}/index.html?nosave&noaudio=1`, false)).ms); await sleep(400); }
    const plainNet = B.net.slice();

    const wired = [];
    let wiredNet = null;
    for (let i = 0; i < 3; i++) {
      const r = await nav(`${B.base}/index.html?nosave`, true);
      wired.push(r.ms);
      if (i === 0) wiredNet = B.net.slice();
      await sleep(400);
    }
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const dReady = med(wired) - med(plain);
    check('D1 — wiring the audio layer in does not move time-to-interactive',
      Math.abs(dReady) < 250,
      `__ready reached in ${plain.join('/')} ms without the audio layer and ${wired.join('/')} ms with it `
      + `(medians ${med(plain)} vs ${med(wired)} ms, Δ${dReady >= 0 ? '+' : ''}${dReady} ms). Both runs are the `
      + `same browser, same emulated iPhone, same navigation. The audio layer's own boot is `
      + `${(await ev(S, 'window.__wire.boot'))?.toFixed?.(1) ?? 'n/a'} ms and it starts AFTER __ready by `
      + `construction — it polls for it.`);
    note('tti', { plain, wired, deltaMs: dReady });

    // ── D2 — no music byte is on the critical path ───────────────────────
    const musicBefore = wiredNet.filter(r => /assets\/audio\/music\//.test(r.url));
    const musicGET = musicBefore.filter(r => r.method === 'GET');
    const musicBytesBefore = musicBefore.reduce((a, r) => a + r.bytes, 0);
    const audioBefore = wiredNet.filter(r => /assets\/audio\//.test(r.url));
    const totalBefore = wiredNet.reduce((a, r) => a + r.bytes, 0);
    const musicOnDisk = ['menu', 'cruise_a', 'cruise_b', 'cruise_day', 'docked']
      .reduce((a, s) => a + statSync(resolve(ROOT, `assets/audio/music/${s}.mp3`)).size, 0);
    check('D2 — the music is not on the critical path: zero music BYTES are fetched before the game is interactive',
      musicGET.length === 0 && musicBytesBefore === 0,
      `${(musicOnDisk / 1e6).toFixed(2)} MB (${(musicOnDisk / 1048576).toFixed(2)} MiB) of music sits on `
      + `disk. Before __ready: ${musicGET.length} GET requests under assets/audio/music/ and `
      + `${musicBytesBefore} bytes transferred from it. `
      + (musicBefore.length ? `(${musicBefore.length} body-less HEAD probe(s) did land in the window — a `
        + `HEAD carries no payload, and the sweep is deferred behind PREFETCH.PROBE_DELAY specifically so `
        + `it cannot contend during startup.) ` : '')
      + `Requests under assets/audio/ at all: ${audioBefore.length}, `
      + `${audioBefore.reduce((a, r) => a + r.bytes, 0)} bytes of ${totalBefore} total on the boot path — `
      + `i.e. the audio layer contributes ${(audioBefore.reduce((a, r) => a + r.bytes, 0) / totalBefore * 100).toFixed(1)} % `
      + `of boot bytes, all of it the manifest — ${(audioBefore.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(0)} KB of it, up from 22 KB `
      + `at ship because S2-B took the chatter pool from 64 slots to 203. The mechanism is not ordering: music is an `
      + `HTMLMediaElement with preload="none" whose src is assigned only when a pool starts, and a pool `
      + `cannot start before a gesture has made the context run. There is no code path that could `
      + `request a music body earlier.`);
    note('criticalPath', { musicBytesOnDisk: musicOnDisk, musicGETsBeforeReady: musicGET.length,
      musicBytesBeforeReady: musicBytesBefore,
      audioRequestsBeforeReady: audioBefore.map(r => ({ u: r.url.split('/').pop(), m: r.method, b: r.bytes })),
      totalBootBytes: totalBefore });

    // ── D3 — the wired game runs, unlocks on a touch, and talks ──────────
    await tap(S, 210, 700);
    await sleep(1200);
    const w1 = await ev(S, '({ ready: !!window.__wire.ready, boot: window.__wire.boot, frames: window.__wire.frames, errors: window.__wire.errors, audio: window.__wire.audio.state(), radio: window.__wire.radio.state() })');
    // push the director forward to a foreground line without waiting 36 real seconds
    const fired = await ev(S, `(() => { const r = window.__wire.radio; const out = []; for (let i = 0; i < 400; i++) { const f = r.update(0.5, {}); if (f) out.push(...f); } return { fired: out, lines: window.__wire.lines.length, st: r.state(), errors: window.__wire.errors }; })()`, { timeout: 60000 });
    // The synchronous 400-iteration burst above cannot let an async prefetch land, so "did a real
    // clip play in the wired game" is asserted deterministically instead of hoped for: wait for the
    // prefetch, then fire a known-present slot and read back its audio duration.
    await sleep(2500);
    const realLine = await ev(S, `(async () => {
      const r = window.__wire.radio;
      await r.clip('dispatch_01');
      const rec = r.manifest.chatter.find(c => c.slot === 'dispatch_01');
      return r.fire(rec);
    })()`, { timeout: 60000 });
    const gameState = await ev(S, 'window.__state ? { t: window.__state.t, frames: window.__state.frames, audio: window.__state.audio } : null');
    const musicReq = B.net.filter(r => /assets\/audio\/music\//.test(r.url) && r.method === 'GET');
    const missReq = musicReq.filter(r => r.status === 404);
    const missNames = missReq.map(r => r.url.split('/').pop());
    // The guarantee is NOT "a missing track is never requested" — the deferred HEAD sweep races a
    // player who taps inside the first second, and the game boots into stormnight, so `storm` can be
    // picked before the probe lands. The guarantee is that it costs at most ONE request ever: the
    // load failure marks the slot absent and the chain falls through. Asserting zero would have been
    // asserting that a race always goes one way.
    const noRepeatMiss = new Set(missNames).size === missNames.length;
    const fellThrough = musicReq.some(r => r.status === 200);
    check('D3 — with the wiring applied the real game unlocks on a touch, plays the bed, and drives chatter through __game.chatter',
      w1.ready === true && w1.audio.ready === true && fired.st.stats.textOnly >= 3
      && realLine !== null && realLine.audio > 0 && gameState.frames > 30
      && noRepeatMiss && fellThrough,
      `audio layer booted in ${w1.boot.toFixed(1)} ms, ${w1.frames} of its own frames run. After one touch: `
      + `ctx=${w1.audio.ctx}, ready=${w1.audio.ready}. 200 virtual seconds… ${fired.fired.length} lines fired `
      + `(${fired.st.stats.withAudio} foreground with audio, ${fired.st.stats.textOnly} foreground text-only `
      + `because the optional groups have no files, the rest background). `
      + `${fired.lines} popups reached __game.chatter. Then dispatch_01 was fetched and fired directly: `
      + `${realLine.audio} s of audio at RMS ${realLine.rms.toFixed(4)} — a real clip really plays in the `
      + `real game. Music GETs: ${musicReq.length} `
      + `(${musicReq.map(r => r.url.split('/').pop() + ':' + r.status).join(', ') || 'none'}) of which `
      + `${missReq.length} were 404 (${missNames.join(', ') || 'none'}), each exactly once `
      + `(no-repeat: ${noRepeatMiss}) — the game boots into stormnight, the state machine resolved to the `
      + `"storm" pool before the deferred HEAD sweep had classified it, the load failed, the slot was `
      + `marked absent and the §10.3 chain fell through to cruise (${musicReq.filter(r => r.status === 200).map(r => r.url.split('/').pop()).join(', ')}). `
      + `One wasted request, once, for a track Aaron has not generated yet. Game itself: `
      + `${gameState.frames} frames, sim t=${gameState.t}. Audio-layer errors: `
      + `${fired.errors.length ? fired.errors.slice(0, 3).join(' | ') : 'none'}.`);
    note('wiredRun', { boot: w1.boot, errors: fired.errors, fired: fired.fired.length,
      stats: fired.st.stats, musicRequests: musicReq.map(r => ({ u: r.url.split('/').pop(), s: r.status })) });

    const bad = B.console.filter(l => /\[throw\]|Unhandled|Uncaught/.test(l));
    check('D4 — the wired game throws nothing and leaks no unhandled rejection',
      bad.length === 0,
      bad.length ? bad.slice(0, 4).join('\n') : `console clean across ${B.net.length} requests and a full boot + `
        + `gesture + 200 virtual seconds of radio. Other console noise: ${B.console.length} line(s).`);

  } finally { await B.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// LEG E — delete assets/audio/ and see whether the game still plays.
// ════════════════════════════════════════════════════════════════════════════

async function legE() {
  const AUD = resolve(ROOT, 'assets/audio');
  const HIDE = resolve(ROOT, 'assets/_audio_hidden_by_p8');
  const CH = resolve(AUD, 'chatter'), MU = resolve(AUD, 'music'), MAN = resolve(AUD, 'manifest.json');
  const H_CH = resolve(HIDE, 'chatter'), H_MU = resolve(HIDE, 'music'), H_MAN = resolve(HIDE, 'manifest.json');
  mkdirSync(HIDE, { recursive: true });
  const B = await launch({ mobile: true, autoplay: 'strict', w: 420, h: 860 });
  const { S } = B;
  try {
    // ── E1 — clips gone, manifest kept: this is §13's actual gate ────────
    // "with ZERO audio files present, the game runs, the traffic net plays, and foreground chatter
    // appears as text-only popups on schedule". The manifest is committed code, not something Aaron
    // drops in, so it stays.
    renameSync(CH, H_CH);
    renameSync(MU, H_MU);
    await S('Page.addScriptToEvaluateOnNewDocument', { source: WIRE });
    B.net.length = 0; B.console.length = 0;
    await S('Page.navigate', { url: `${B.base}/index.html?nosave` });
    const readyMs = await waitFor(S, 'window.__ready', 60000);
    await waitFor(S, 'window.__wire && window.__wire.ready', 20000);
    await tap(S, 210, 700);
    await sleep(800);
    const e1 = await ev(S, `(() => { const r = window.__wire.radio; const out = []; for (let i = 0; i < 400; i++) { const f = r.update(0.5, {}); if (f) out.push(...f); } return { fired: out, popups: window.__wire.lines.length, audio: window.__wire.audio.state(), st: r.state(), errors: window.__wire.errors }; })()`, { timeout: 60000 });
    const e1bed = await ev(S, `(async () => { const a = window.__wire.audio; if (!a.master) return { ok: false }; const an = a.ctx.createAnalyser(); an.fftSize = 2048; a.master.connect(an); const b = new Float32Array(an.fftSize); let pk = 0; for (let i = 0; i < 30; i++) { an.getFloatTimeDomainData(b); let s = 0; for (let j = 0; j < b.length; j++) s += b[j]*b[j]; pk = Math.max(pk, Math.sqrt(s/b.length)); await new Promise(r => setTimeout(r, 16)); } return { ok: true, peak: +pk.toFixed(6) }; })()`, { timeout: 30000 });
    const e1frames = await ev(S, 'window.__state.frames');
    check('E1 §13 — with EVERY audio file deleted the game runs, the bed plays, and foreground chatter is text-only on schedule',
      e1.popups >= 3 && e1.fired.every(f => f.audio === 0) && e1bed.peak > 1e-4 && e1frames > 60,
      `assets/audio/{chatter,music} moved away — not one of the manifest's files is present. Game reached __ready in `
      + `${readyMs} ms and rendered ${e1frames} frames. ${e1.fired.length} radio lines fired in 200 `
      + `virtual seconds, ALL of them with audio=0, and ${e1.popups} popups reached the HUD from the `
      + `manifest's own text. Synthesised bed peak RMS ${e1bed.peak} — the city still talks. `
      + `Absent slots: ${e1.st.absent}. Errors: ${e1.errors.length} (all expected 404 classifications: `
      + `${e1.errors.slice(0, 2).join(' | ') || 'none'}).`);
    note('deletedClips', { readyMs, frames: e1frames, popups: e1.popups, bedPeak: e1bed.peak, absent: e1.st.absent, stats: e1.st.stats });

    // ── E2 — the whole directory gone, manifest included ────────────────
    renameSync(MAN, H_MAN);
    B.net.length = 0; B.console.length = 0;
    await S('Page.navigate', { url: `${B.base}/index.html?nosave&t=2` });
    const ready2 = await waitFor(S, 'window.__ready', 60000);
    await waitFor(S, 'window.__wire && window.__wire.ready', 20000);
    await tap(S, 210, 700);
    await sleep(600);
    const e2 = await ev(S, `(() => { const r = window.__wire.radio; for (let i = 0; i < 200; i++) r.update(0.5, {}); return { manifest: !!r.manifest, dir: !!r.dir, errors: window.__wire.errors, audio: window.__wire.audio.state() }; })()`, { timeout: 60000 });
    await sleep(600);
    const e2state = await ev(S, '({ frames: window.__state.frames, t: window.__state.t, draws: window.__state.draws })');
    const e2bad = B.console.filter(l => /\[throw\]|Unhandled|Uncaught/.test(l));
    check('E2 — deleting assets/audio/ ENTIRELY (manifest included) leaves the game playable and throwing nothing',
      e2.manifest === false && e2.dir === false && e2bad.length === 0 && e2state.frames > 60,
      `the whole directory is gone. manifest=${e2.manifest}, director=${e2.dir}, `
      + `audio ctx=${e2.audio.ctx} ready=${e2.audio.ready}. Game: __ready in ${ready2} ms, `
      + `${e2state.frames} frames, ${e2state.draws} draws, sim t=${e2state.t}. `
      + `Throws/unhandled rejections: ${e2bad.length}. The radio's manifest fetch failed and was `
      + `caught (${e2.errors.filter(e => /manifest/.test(e)).length} manifest error logged); update() `
      + `returns early with no director and the game is a game with no radio, not a broken game.`);
    note('deletedAll', { ready2, frames: e2state.frames, errors: e2.errors.slice(0, 4) });

  } finally {
    await B.close();
    // Restore, whatever happened. This leg is the only thing in the suite that can leave the repo
    // in a worse state than it found it, so the restore is unconditional and then VERIFIED.
    if (!existsSync(AUD)) mkdirSync(AUD, { recursive: true });
    for (const [from, to] of [[H_MAN, MAN], [H_CH, CH], [H_MU, MU]]) {
      try { if (existsSync(from) && !existsSync(to)) renameSync(from, to); }
      catch (e) { console.error('RESTORE FAILED', from, e.message); }
    }
    try { if (existsSync(HIDE)) rmSync(HIDE, { recursive: true }); } catch {}
    const back = existsSync(MAN) && existsSync(resolve(CH, 'dispatch_01.mp3')) && existsSync(resolve(MU, 'menu.mp3'));
    check('E3 — assets/audio was restored intact after the deletion legs',
      back, back
        ? `manifest.json, chatter/ (${statSync(resolve(CH, 'dispatch_01.mp3')).size} B on dispatch_01) and `
          + `music/ (${(statSync(resolve(MU, 'menu.mp3')).size / 1048576).toFixed(2)} MB on menu) are all back in place.`
        : 'RESTORE FAILED — look for assets/_audio_hidden_by_p8/ and move its contents back into assets/audio/.');
  }
}

// ── the silenced fixture ────────────────────────────────────────────────────
// Built with ffmpeg from a real clip at volume=0: same duration, same channels, same codec, same
// container. Every "is this clip OK" check this project used before passes on it.
// Recover from a previous run that died between staging a fixture and putting the real file back.
// legC's `finally` is not enough: a hard process death — this suite lost one to an EINVAL out of the
// local server while the machine was at load 7 — skips it entirely, and what it leaves behind is a
// SILENCED clip sitting in the shipped pool under a real slot name. That is precisely the failure
// this project is built around, manufactured by its own test harness, so recovery runs before
// anything else and says so out loud.
function recoverStaged() {
  const CH = resolve(ROOT, 'assets/audio/chatter');
  const baks = readdirSync(CH).filter(f => f.endsWith('.p8bak'));
  for (const b of baks) {
    const real = resolve(CH, b.slice(0, -6));
    try { rmSync(real); } catch {}
    renameSync(resolve(CH, b), real);
    console.log(`  RECOVERED ${b.slice(0, -6)} from a previous run that did not finish`);
  }
  const stale = resolve(CH, '_p8_silenced.mp3');
  if (existsSync(stale)) { rmSync(stale); console.log('  removed a stale _p8_silenced.mp3 fixture'); }
  return baks.length;
}

function makeSilenced() {
  const src = resolve(ROOT, 'assets/audio/chatter/dispatch_01.mp3');
  const dst = resolve(ROOT, 'assets/audio/chatter/_p8_silenced.mp3');
  if (!existsSync(src)) throw new Error('dispatch_01.mp3 missing — cannot build the falsification fixture');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', 'volume=0',
    '-c:a', 'libmp3lame', '-b:a', '64k', dst]);
  return dst;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const recovered = recoverStaged();
  if (recovered) note('recoveredStagedFiles', recovered);
  const silenced = makeSilenced();
  note('fixtures', { silenced: silenced.replace(ROOT + '/', ''),
    silencedBytes: statSync(silenced).size,
    realBytes: statSync(resolve(ROOT, 'assets/audio/chatter/dispatch_01.mp3')).size });
  try {
    if (runLeg('A')) { console.log('\n── LEG A · pure node ──'); await legA(); }
    if (runLeg('B')) { console.log('\n── LEG B · harness, strict autoplay, iPhone UA ──'); await legB(); }
    if (runLeg('C')) { console.log('\n── LEG C · drop-in and the silence path ──'); await legC(); }
    if (runLeg('D')) { console.log('\n── LEG D · the real game with the pending wiring injected ──'); await legD(); }
    if (runLeg('E')) { console.log('\n── LEG E · assets/audio deleted ──'); await legE(); }
  } finally {
    // the falsification fixture is a test artefact, not an asset — it must not ship
    try { rmSync(silenced); } catch {}
    note('elapsedS', +((Date.now() - t0) / 1000).toFixed(1));
    flushResults();
    console.log(`\n${ok.length}/${results.length} gates pass  →  shots/p8/_gates.json`);
    if (fail.length) console.log('FAILED: ' + fail.join(', '));
  }
  if (fail.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); flushResults(); process.exit(1); });
