#!/usr/bin/env node
// Renders every effect in an OfflineAudioContext inside headless Chrome and asserts each one
// actually makes sound. A broken envelope is silent and looks perfectly fine in source.
//
//   node audio/tools/verify.mjs
//   node audio/tools/verify.mjs --json

import { spawn } from 'node:child_process';
import { existsSync, statSync, createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
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
    `--user-data-dir=/tmp/forge-audio-cdp-${process.pid}`,
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

function table(title, rows) {
  console.log(`\n${title}`);
  console.log(pad('id', 17) + pad('name', 24) + '     rms  rms|on    peak      dc   snd(s)  head  voi  leak  verdict');
  console.log('-'.repeat(115));
  let bad = 0;
  for (const r of rows) {
    const problems = [];
    if (!(r.rms > 0.0008)) problems.push('SILENT');
    if (r.peak > 1.0) problems.push('CLIP');
    if (r.nan) problems.push('NaN');
    if (Math.abs(r.dc) > 0.005) problems.push('DC');
    if (r.head > 0.02) problems.push('HEAD-CLICK');
    if (r.tailRms > 0.004) problems.push('CUT-OFF');
    if (r.leaked) problems.push('LEAK');
    if (problems.length) bad++;
    console.log(
      pad(r.id, 17) + pad((r.name || r.title || '').slice(0, 23), 24) +
      num(r.rms, 8, 4) + num(r.rmsOn, 8, 4) + num(r.peak, 8, 4) + num(r.dc, 8, 4) +
      num(r.sound, 8, 2) + num(r.head, 6, 3) + String(r.voices).padStart(5) +
      String(r.leaked ?? 0).padStart(6) + '  ' + (problems.length ? problems.join(',') : 'ok'));
  }
  console.log(`${rows.length - bad}/${rows.length} clean`);
  return bad;
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
      returnByValue: true, awaitPromise: true,
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

  // the lab page itself must boot clean, and must respond to real clicks
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/audio/index.html` });
  const pageOk = await waitFor('window.__lab && window.__lab.ready');
  const domCount = (await S('Runtime.evaluate', { expression: 'document.querySelectorAll(".card,.sfx").length', returnByValue: true })).result.value;
  console.log(`page boot: ${pageOk ? 'ok' : 'FAILED'}  (${domCount} cards rendered)`);
  const smoke = await evalJSON(`(async () => {
    const A = window.__lab, r = {};
    document.getElementById('gbtn').click();
    await new Promise(s => setTimeout(s, 300));
    r.ctxState = A.ctx.state;
    r.gateClosed = document.getElementById('gate').classList.contains('gone');
    // every bucket open, so every card is in the DOM and clickable
    document.querySelectorAll('.bucket.shut .buckethdr').forEach(h => h.click());
    const go = [...document.querySelectorAll('.sfx .go')];
    r.sfxButtons = go.length;
    go.forEach(b => b.click());
    await new Promise(s => setTimeout(s, 300));
    r.voicesAfterAll = A.eng.live.length;
    r.sliders = document.querySelectorAll('input[type=range]').length;
    r.notes = document.querySelectorAll('.field textarea').length;
    r.renames = document.querySelectorAll('.field input[type=text]').length;
    // move one sound between buckets and make sure it lands there
    const first = document.querySelector('.b-review .sfx .v-keep');
    const keepBefore = document.querySelectorAll('.b-keep .sfx').length;
    if (first) first.click();
    r.movedIntoKeep = document.querySelectorAll('.b-keep .sfx').length - keepBefore;
    r.report = A.report().split('\\n').length;
    return r;
  })()`);
  console.log('page smoke: ' + JSON.stringify(smoke));

  if (args.shot) {
    const dir = resolve(HERE, '../out'); mkdirSync(dir, { recursive: true });
    for (const [w, h, dpr, tab] of [[390, 2200, 2, 'sfx'], [1100, 1700, 1, 'sfx']]) {
      await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 500 });
      await S('Runtime.evaluate', { expression: `document.querySelector('#tabs button[data-tab=${tab}]').click(); scrollTo(0,0)` });
      await sleep(250);
      const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const p = join(dir, `page-${tab}-${w}.png`);
      writeFileSync(p, Buffer.from(data, 'base64'));
      console.log('  shot ' + p);
    }
    await S('Emulation.clearDeviceMetricsOverride');
  }
  const bootLogs = logs.splice(0);
  if (bootLogs.length) { console.log('page console:'); for (const l of bootLogs) console.log('  ' + l); }

  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/audio/tools/harness.html` });
  await waitFor('window.__ready');

  const r = await S('Runtime.evaluate', {
    expression: 'window.__verify.runAll().then(x => JSON.stringify(x))',
    returnByValue: true, awaitPromise: true, timeout: 300000,
  });
  if (!r.result.value) { console.error('no result', JSON.stringify(r).slice(0, 400)); process.exit(1); }
  const data = JSON.parse(r.result.value);

  let bad = 0;
  bad += table('SFX — one shot, full master chain', data.sfx);

  const L = data.leak;


  for (const l of logs) console.log('  ' + l);
  if (args.json) {
    mkdirSync(resolve(HERE, '../out'), { recursive: true });
    const p = resolve(HERE, '../out/verify.json');
    writeFileSync(p, JSON.stringify(data, null, 2));
    console.log('\nwrote ' + p);
  }
  console.log(bad ? `\n${bad} problem row(s)` : '\nall clean');

  await S('Browser.close').catch(() => {});
  proc.kill(); server.close();
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); for (const l of logs) console.error('  ' + l); process.exit(1); });
