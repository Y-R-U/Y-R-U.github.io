#!/usr/bin/env node
// Puzzle Rush checks: intro, countdown, solve climbs rating, strike, 3 strikes ends, time-out ends, best saved, results links.
//   ~/.claude/bin/cdp start --port 9541 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/rush_cdp.mjs [--sizes=390x844,1440x900]
import { writeFileSync, mkdirSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9541), ROOT = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/', OUT = args.out || '/tmp/gambit-rush';
const SIZES = String(args.sizes || '390x844,1440x900').split(',').map(s => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const errors = []; let passes = 0;
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
const send = (method, params = {}) => new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); }).then(m => { if (m.error) throw new Error(m.error.message); return m.result; });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const ok = (c, m) => { if (c) { passes++; console.log('  ok  ', m); } else { errors.push(m); console.log('  FAIL', m); } };
const waitFor = async (x, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(x)) return true; } catch { } await sleep(100); } throw new Error('timeout: ' + x); };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); console.log('  shot', `${OUT}/${n}.png`); };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const T = 'window.__rushTest && window.__rushTest()';
for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`, mobile = w < 900; console.log('==', tag);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, mobile });
  await send('Page.navigate', { url: `${ROOT}index.html?nocloud&t=${Date.now()}#/puzzles` });
  await sleep(400); await waitFor('window.__booted === true', 60000);
  await ev(`localStorage.removeItem('gambit.rush'); 1`);
  await waitFor(`!!document.querySelector('.pz-rushbar')`);
  ok(true, 'map shows the Rush bar');
  await ev(`document.querySelector('.pz-rushbar').click(); 1`);
  await waitFor(`document.querySelectorAll('.rush-mode').length === 2`);
  await shot(`intro-${tag}`);
  await ev(`document.querySelector('.rush-mode[data-mode="3"]').click(); 1`);
  await waitFor(`${T} && ${T}.ready`, 30000);
  ok(await ev(`${T}.running`), 'clock running after countdown');
  const r0 = await ev(`${T}.rating`);
  for (let i = 0; i < 6; i++) {
    const n = await ev(`${T}.n`);
    while (await ev(`${T}.n`) === n) { await waitFor(`${T}.ready || ${T}.n !== ${n}`); if (await ev(`${T}.n`) !== n) break; await ev(`${T}.playExpected()`); await sleep(50); }
  }
  ok(await ev(`${T}.score`) === 6, 'solved 6');
  await waitFor(`${T}.ready`);
  const r6 = await ev(`${T}.rating`);
  ok(r6 > r0 + 200, `puzzles get harder (${r0} → ${r6})`);
  await shot(`run-${tag}`);
  await ev(`${T}.playWrong()`); await sleep(150);
  ok(await ev(`${T}.strikes`) === 1, 'wrong move = strike 1');
  ok(await ev(`document.querySelectorAll('.rush-x i.on').length === 1`), 'strike shown');
  await waitFor(`${T}.ready`);
  await ev(`${T}.playWrong()`); await waitFor(`${T}.ready`); await ev(`${T}.playWrong()`);
  await waitFor(`!!document.querySelector('.rush-score')`, 8000);
  ok(await ev(`document.querySelector('.rush-score').textContent === '6'`), 'three strikes ends the run with score 6');
  ok(await ev(`JSON.parse(localStorage.getItem('gambit.rush')).best['3'] === 6`), 'best saved');
  ok(await ev(`document.querySelectorAll('.rush-log a[href^="#/puzzles/p/"]').length === 9`), 'results list 9 puzzles, linked');
  await shot(`done-${tag}`);
  // timeout
  await ev(`document.querySelector('[data-again]').click(); 1`);
  await waitFor(`${T} && ${T}.ready`, 30000);
  await ev(`${T}.burn(1e6); 1`);
  await waitFor(`!!document.querySelector('.rush-score')`, 3000);
  ok(await ev(`/Time/.test(document.querySelector('.rush-hero small').textContent)`), 'time-out ends the run');
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), 'no horizontal scroll');
}
console.log(`\n${passes} passed, ${errors.length} failed`); errors.forEach(e => console.log('  !', e));
ws.close(); process.exit(errors.length ? 1 : 0);
