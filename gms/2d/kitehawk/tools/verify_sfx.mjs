#!/usr/bin/env node
// Renders every effect in an OfflineAudioContext inside headless Chrome and asserts each one
// actually makes sound — and, for the sustained sources, that it actually RESPONDS.
// A broken envelope is silent and looks perfectly fine in source. So does a continuous source
// whose parameters are wired to nothing.
//
//   node tools/verify_sfx.mjs
//   node tools/verify_sfx.mjs --json          also writes shots/audio/_gates.json
//   node tools/verify_sfx.mjs --only=rotary   filter the sustained tables
//   node tools/verify_sfx.mjs --nolab         skip the lab-page smoke test

import { spawn } from 'node:child_process';
import { existsSync, statSync, createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''), i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const PORT = 8931 + (process.pid % 150);
const CDP_PORT = 9631 + (process.pid % 150);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];

// ── thresholds, in one place so a regression is a diff and not an argument ──
const T = {
  rms: 0.0008,          // anything quieter than this is silent
  peak: 1.0,            // above this the master chain is clipping
  dc: 0.005,
  head: 0.02,           // a non-zero first sample is a click
  tailRms: 0.004,       // still making noise at the end of the render = cut off
  // A swept parameter must move rms, brightness or envelope modulation by this fraction. Bracketed
  // by measurement, not taste: with rotary's roughness wiring cut entirely the suite still reports
  // 0.218 (plateau-to-plateau variation in a noisy source), and the weakest genuinely wired
  // parameter in the set measures 0.462. 0.30 sits between them.
  resp: 0.30,
  release: 0.0008,      // rms in the last 400 ms of the render, 2.8 s after a release
  dropRatio: 0.02,      // released level as a fraction of running level
  pitch: 1.03,          // approach brightness / recede brightness at equal distance
  distRatio: 1.5,       // close pass rms / far rms
};

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

class CDP {
  constructor(url) { this.id = 0; this.pending = new Map(); this.url = url; }
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
        }
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

async function chrome() {
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=/tmp/kitehawk-audio-cdp-${process.pid}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return { proc, ws: (await r.json()).webSocketDebuggerUrl };
    } catch { await sleep(150); }
  }
  throw new Error('chrome did not come up');
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n, d = 4) => String(v == null ? '—' : (+v).toFixed(d)).padStart(n);

function oneShotProblems(r) {
  const p = [];
  if (!(r.rms > T.rms)) p.push('SILENT');
  if (r.peak > T.peak) p.push('CLIP');
  if (r.nan) p.push('NaN');
  if (Math.abs(r.dc) > T.dc) p.push('DC');
  if (r.head > T.head) p.push('HEAD-CLICK');
  if (r.tailRms > T.tailRms) p.push('CUT-OFF');
  if (r.leaked) p.push('LEAK');
  return p;
}

function tableOneShot(title, rows) {
  console.log(`\n${title}`);
  console.log(pad('id', 17) + pad('name', 26) + '     rms  rms|on    peak      dc   snd(s)  head  voi  leak  verdict');
  console.log('-'.repeat(117));
  let bad = 0;
  for (const r of rows) {
    const problems = oneShotProblems(r);
    if (problems.length) bad++;
    console.log(
      pad(r.id, 17) + pad((r.name || '').slice(0, 25), 26) +
      num(r.rms, 8, 4) + num(r.rmsOn, 8, 4) + num(r.peak, 8, 4) + num(r.dc, 8, 4) +
      num(r.sound, 8, 2) + num(r.head, 6, 3) + String(r.voices).padStart(5) +
      String(r.leaked ?? 0).padStart(6) + '  ' + (problems.length ? problems.join(',') : 'ok'));
  }
  console.log(`${rows.length - bad}/${rows.length} clean`);
  return bad;
}

function sweepProblems(r) {
  const p = [];
  if (!(r.rms > T.rms)) p.push('SILENT');
  if (r.resp < T.resp) p.push('NO-RESPONSE');
  if (r.peak > T.peak) p.push('CLIP');
  if (r.nan) p.push('NaN');
  if (r.release > T.release) p.push('STUCK');
  if (r.liveAfter !== 0) p.push('LEAK');
  return p;
}

function tableSweep(rows) {
  console.log('\nSUSTAINED — parameter sweep, min → max in 8 steps, then released');
  console.log(pad('id', 24) + pad('name', 28) + '    rms  respRms respBrt  respMod     resp  release  verdict');
  console.log('-'.repeat(120));
  let bad = 0;
  for (const r of rows) {
    const p = sweepProblems(r);
    if (p.length) bad++;
    console.log(pad(r.id, 24) + pad((r.name || '').slice(0, 27), 28) +
      num(r.rms, 7, 4) + num(r.respRms, 9, 3) + num(r.respBright, 8, 3) + num(r.respMod, 9, 3) +
      num(r.resp, 9, 3) + num(r.release, 9, 5) + '  ' + (p.length ? p.join(',') : 'ok'));
  }
  console.log(`${rows.length - bad}/${rows.length} clean`);
  return bad;
}

function flybyProblems(r) {
  const p = [];
  if (!(r.rms > T.rms)) p.push('SILENT');
  if (r.nan) p.push('NaN');
  if (r.doppler && r.pitchRatio < T.pitch) p.push('NO-DOPPLER');
  if (r.distRatio < T.distRatio) p.push('NO-DISTANCE');
  return p;
}

function tableFlyby(rows) {
  console.log('\nSUSTAINED — flyby at 700 wu/s, 2.5 s approach vs 2.5 s recede over mirrored distances');
  console.log(pad('id', 24) + pad('name', 26) + '    rms   pitch↑   raw    ref  cIn/cOut Hz  near/far  dop  verdict');
  console.log('-'.repeat(117));
  let bad = 0;
  for (const r of rows) {
    const p = flybyProblems(r);
    if (p.length) bad++;
    console.log(pad(r.id, 24) + pad((r.name || '').slice(0, 25), 26) +
      num(r.rms, 7, 4) + num(r.pitchRatio, 9, 3) + num(r.rawRatio, 6, 2) + num(r.refRatio, 7, 2) +
      String(r.centIn + '/' + r.centOut).padStart(12) + num(r.distRatio, 10, 2) +
      String(r.doppler ? 'yes' : 'n/a').padStart(5) + '  ' + (p.length ? p.join(',') : 'ok'));
  }
  console.log(`${rows.length - bad}/${rows.length} clean`);
  return bad;
}

function tableFacade(F) {
  console.log('\nFACADE — every method, context disabled then enabled');
  console.log(`  disabled: available=${F.offAvailable} ready=${F.offReady} sfx=${F.off.sfx} loop=${F.off.loop} voice=${F.off.voice}`);
  console.log(`  enabled:  available=${F.onAvailable} sfx=${F.on.sfx} loop=${F.on.loop} param=${F.on.param} place=${F.on.place}`);
  console.log(`  ${F.keys} keys mapped, ${F.deadKeys.length} dead; ${F.throws.length} exceptions${F.throws.length ? ': ' + F.throws.join('; ') : ''}`);
  const bad = (F.throws.length || !F.shapesOk || F.deadKeys.length) ? 1 : 0;
  console.log(`${1 - bad}/1 clean`);
  return bad;
}

function tablePool(rows) {
  console.log('\nPOOL — cap, stealing and release');
  let bad = 0;
  for (const r of rows) {
    const p = [];
    if (r.id === 'pool.cap') {
      if (r.live > r.cap) p.push('OVER-CAP');
      if (r.refused + r.stolen === 0) p.push('CAP-NOT-ENFORCED');
      if (r.nan) p.push('NaN');
      console.log(`  cap=${r.cap} asked=${r.asked} granted=${r.granted} live=${r.live} refused=${r.refused} stolen=${r.stolen} rms=${r.rms}  ${p.length ? p.join(',') : 'ok'}`);
    } else {
      if (r.drop > T.dropRatio) p.push('STUCK');
      if (r.live !== 0 || r.dying !== 0) p.push('LEAK');
      console.log(`  running=${r.rmsBefore} released=${r.rmsAfter} drop=${r.drop} live=${r.live} dying=${r.dying} idle=${r.idle}  ${p.length ? p.join(',') : 'ok'}`);
    }
    if (p.length) bad++;
  }
  console.log(`${rows.length - bad}/${rows.length} clean`);
  return bad;
}

// ── gate record (ARCHITECTURE §8.3 shape) ──
function gateRecord(data, counts) {
  const results = [];
  const push = (name, pass, value, threshold, op, unit, detail) =>
    results.push({ name, pass, value, threshold, op, unit, n: undefined, detail });

  const sfxBad = data.sfx.filter(r => oneShotProblems(r).length);
  push('A1 — every one-shot makes sound and is clean', sfxBad.length === 0,
    data.sfx.length - sfxBad.length, data.sfx.length, '>=', 'effects',
    `${data.sfx.length - sfxBad.length}/${data.sfx.length} clean; quietest ${Math.min(...data.sfx.map(r => r.rms)).toFixed(5)} rms (${data.sfx.reduce((a, b) => a.rms < b.rms ? a : b).id}); loudest peak ${Math.max(...data.sfx.map(r => r.peak)).toFixed(3)}` +
    (sfxBad.length ? `; failing: ${sfxBad.map(r => r.id + '(' + oneShotProblems(r).join('/') + ')').join(', ')}` : ''));

  const respBad = data.sweeps.filter(r => sweepProblems(r).some(x => x !== 'STUCK' && x !== 'LEAK'));
  const swBad = respBad;
  const worst = data.sweeps.reduce((a, b) => a.resp < b.resp ? a : b);
  push('A2 — every swept parameter changes the output', swBad.length === 0,
    +worst.resp.toFixed(4), T.resp, '>=', 'fraction',
    `weakest response is ${worst.id} at ${worst.resp} (rms ${worst.respRms}, brightness ${worst.respBright}, modulation ${worst.respMod}); ${data.sweeps.length - swBad.length}/${data.sweeps.length} sweeps clean; ${worst.id} rms sequence ${JSON.stringify(worst.seq)}` +
    (swBad.length ? `; failing: ${swBad.map(r => r.id + '(' + sweepProblems(r).join('/') + ')').join(', ')}` : ''));

  const rel = data.sweeps.reduce((a, b) => a.release > b.release ? a : b);
  const relBad = data.sweeps.filter(r => r.release > T.release || r.liveAfter !== 0);
  push('A3 — a released source goes silent', relBad.length === 0,
    +rel.release.toFixed(6), T.release, '<=', 'rms',
    `loudest 400 ms tail after release is ${rel.id} at ${rel.release} rms; every sweep ended with ${data.sweeps.every(r => r.liveAfter === 0) ? 'zero' : 'NON-ZERO'} live handles`);

  const dop = data.flybys.filter(r => r.doppler);
  const wd = dop.reduce((a, b) => a.pitchRatio < b.pitchRatio ? a : b);
  push('A4 — doppler shifts pitch up on approach', dop.every(r => r.pitchRatio >= T.pitch),
    +wd.pitchRatio.toFixed(3), T.pitch, '>=', 'ratio',
    `weakest is ${wd.id} at ${wd.pitchRatio}× approach/recede spectral centroid over mirrored 2.5 s windows, divided by the same seeded flyby rendered with doppler clamped off (210-2100 wu each side, 700 wu/s); ratios ${dop.map(r => r.id + '=' + r.pitchRatio + ' (raw ' + r.rawRatio + ' / ref ' + r.refRatio + ', centroid ' + r.centIn + ' Hz in vs ' + r.centOut + ' Hz out)').join(', ')}; stallBuffet and groundRoll are self-noise and are excluded by design`);

  const wf = data.flybys.reduce((a, b) => a.distRatio < b.distRatio ? a : b);
  push('A5 — distance attenuates', data.flybys.every(r => r.distRatio >= T.distRatio),
    +wf.distRatio.toFixed(2), T.distRatio, '>=', 'ratio',
    `weakest is ${wf.id} at ${wf.distRatio}× (near ${wf.nearRms} rms at the pass vs ${wf.farRms} rms at 2400 wu); ratios ${data.flybys.map(r => r.id + '=' + r.distRatio).join(', ')}`);

  const cap = data.pool.find(r => r.id === 'pool.cap');
  push('A6 — the pool caps concurrent sources', cap.live <= cap.cap && (cap.refused + cap.stolen) > 0,
    cap.live, cap.cap, '<=', 'sources',
    `asked for ${cap.asked} rotaries at cap ${cap.cap}: ${cap.granted} real handles, ${cap.live} live, ${cap.refused} refused, ${cap.stolen} stolen; render rms ${cap.rms}, nan ${cap.nan}`);

  const relp = data.pool.find(r => r.id === 'pool.release');
  push('A7 — release frees the slot', relp.drop <= T.dropRatio && relp.live === 0 && relp.dying === 0,
    +relp.drop.toFixed(5), T.dropRatio, '<=', 'ratio',
    `rotary+slipstream ran at ${relp.rmsBefore} rms and measured ${relp.rmsAfter} rms 2.2 s after release (${relp.drop}×); live ${relp.live}, dying ${relp.dying}, idle ${relp.idle}`);

  const F = data.facade;
  push('A9 — the facade is total with audio disabled', F.throws.length === 0 && F.shapesOk && F.deadKeys.length === 0,
    F.throws.length, 0, '<=', 'exceptions',
    `${F.off._calls} facade methods called with the context disabled and ${F.on._calls} with it enabled: ${F.throws.length} exceptions${F.throws.length ? ' (' + F.throws.join('; ') + ')' : ''}; available=${F.offAvailable} ready=${F.offReady}, sfx()=${F.off.sfx}, loop()=${F.off.loop}, voice()=${F.off.voice}; ${F.keys} game keys mapped, ${F.deadKeys.length} resolving to nothing${F.deadKeys.length ? ' (' + F.deadKeys.join(', ') + ')' : ''}`);

  if (data.lab) {
    push('A8 — the lab page boots and every card plays', !!data.lab.ok,
      data.lab.sfxButtons ?? 0, counts.oneShots, '>=', 'cards',
      `page ready ${data.lab.pageOk}; ${data.lab.cards} cards rendered; ${data.lab.sfxButtons} play buttons clicked; ${data.lab.sliders} sliders; ${data.lab.srcButtons} sustained holds; ctx ${data.lab.ctxState}; voices after firing everything ${data.lab.voicesAfterAll}`);
  }

  const pass = results.filter(r => r.pass).length;
  return {
    gate: 'audio',
    at: new Date().toISOString(),
    low: false, headed: false,
    viewport: null,
    counts,
    thresholds: T,
    results,
    pass, fail: results.length - pass, skipped: 0,
    artifacts: [],
  };
}

async function main() {
  const server = await serve();
  const { proc, ws } = await chrome();
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type))
      logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown')
      logs.push('[throw] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });

  const evalJSON = async expr => {
    const r = await S('Runtime.evaluate', {
      expression: `Promise.resolve(${expr}).then(v => JSON.stringify(v))`,
      returnByValue: true, awaitPromise: true, timeout: 120000,
    });
    return r.result.value == null ? null : JSON.parse(r.result.value);
  };
  const waitFor = async (expr, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
      if (r.result.value) return true;
      await sleep(150);
    }
    return false;
  };

  let lab = null;
  if (!args.nolab) {
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/sfxlab/index.html` });
    const pageOk = await waitFor('window.__lab && window.__lab.ready');
    const cards = (await S('Runtime.evaluate', { expression: 'document.querySelectorAll(".sfx").length', returnByValue: true })).result.value;
    console.log(`lab page boot: ${pageOk ? 'ok' : 'FAILED'}  (${cards} cards rendered)`);
    lab = await evalJSON(`(async () => {
      const A = window.__lab, r = {};
      document.getElementById('gbtn').click();
      await new Promise(s => setTimeout(s, 300));
      r.ctxState = A.ctx.state;
      r.gateClosed = document.getElementById('gate').classList.contains('gone');
      document.querySelectorAll('.bucket.shut .buckethdr').forEach(h => h.click());
      const go = [...document.querySelectorAll('.sfx .go')];
      r.sfxButtons = go.length;
      go.forEach(b => b.click());
      const holds = [...document.querySelectorAll('.sfx .hold')];
      r.srcButtons = holds.length;
      holds.forEach(b => b.click());
      await new Promise(s => setTimeout(s, 400));
      r.liveSources = A.eng.sources.live.length;
      holds.forEach(b => b.click());
      await new Promise(s => setTimeout(s, 200));
      r.sourcesAfterRelease = A.eng.sources.live.length;
      r.voicesAfterAll = A.eng.live.length;
      r.sliders = document.querySelectorAll('input[type=range]').length;
      r.report = A.report().split('\\n').length;
      return r;
    })()`);
    lab.pageOk = pageOk; lab.cards = cards;
    lab.ok = pageOk && lab.sfxButtons > 0 && lab.srcButtons > 0 && lab.sourcesAfterRelease === 0 && logs.length === 0;
    console.log('lab smoke: ' + JSON.stringify(lab));
    if (args.shot) {
      const dir = resolve(ROOT, 'shots/audio'); mkdirSync(dir, { recursive: true });
      for (const [w, h, dpr] of [[390, 2400, 2], [1100, 1800, 1]]) {
        await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 500 });
        await S('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
        await sleep(300);
        const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const f = join(dir, `lab-${w}.png`);
        writeFileSync(f, Buffer.from(data, 'base64'));
        console.log('  shot ' + f);
      }
      await S('Emulation.clearDeviceMetricsOverride');
    }
    const bootLogs = logs.splice(0);
    if (bootLogs.length) { console.log('lab console:'); for (const l of bootLogs) console.log('  ' + l); lab.ok = false; }
  }

  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/sfxlab/harness.html` });
  await waitFor('window.__ready');

  const r = await S('Runtime.evaluate', {
    expression: 'window.__verify.runAll().then(x => JSON.stringify(x))',
    returnByValue: true, awaitPromise: true, timeout: 600000,
  });
  if (!r.result.value) { console.error('no result', JSON.stringify(r).slice(0, 600)); process.exit(1); }
  const data = JSON.parse(r.result.value);
  data.lab = lab;

  const only = args.only ? String(args.only) : null;
  const f = rows => only ? rows.filter(x => x.id.startsWith(only)) : rows;

  let bad = 0;
  bad += tableOneShot('ONE-SHOT — full master chain', f(data.sfx));
  bad += tableSweep(f(data.sweeps));
  bad += tableFlyby(f(data.flybys));
  bad += tablePool(data.pool);
  bad += tableFacade(data.facade);

  for (const l of logs) console.log('  ' + l);

  const counts = {
    oneShots: data.sfx.length,
    sustained: new Set(data.flybys.map(x => x.id.split('.')[0])).size,
    sweeps: data.sweeps.length,
    rows: data.sfx.length + data.sweeps.length + data.flybys.length + data.pool.length + 1,
  };
  const rec = gateRecord(data, counts);
  const dir = resolve(ROOT, 'shots/audio');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '_gates.json'), JSON.stringify(rec, null, 2));
  if (args.json) writeFileSync(join(dir, 'verify.json'), JSON.stringify(data, null, 2));

  console.log('\nGATE RECORD  shots/audio/_gates.json');
  for (const x of rec.results) {
    console.log(`  ${x.pass ? 'PASS' : 'FAIL'}  ${x.name}`);
    console.log(`        ${x.value} ${x.op} ${x.threshold} ${x.unit || ''}`);
    console.log(`        ${x.detail}`);
  }
  const total = counts.rows;
  console.log(`\n${total - bad}/${total} rows clean   ·   gate ${rec.pass} pass / ${rec.fail} fail`);

  await S('Browser.close').catch(() => {});
  proc.kill(); server.close();
  process.exit(bad || rec.fail ? 1 : 0);
}

main().catch(e => { console.error(e); for (const l of logs) console.error('  ' + l); process.exit(1); });
