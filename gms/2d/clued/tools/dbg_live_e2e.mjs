#!/usr/bin/env node
// Switching the debug log on reaches an already-open page without a reload (the 30 s idle check), and the first
// batch carries the page's earlier history. Local server + CLI as in dbg_e2e.mjs:
//   go build -o /tmp/clued-dbg ./server; CLUED_ADDR=127.0.0.1:8098 CLUED_DATA=/tmp/dbgdata-cl /tmp/clued-dbg &
//   ~/.claude/bin/cdp start --port 9510; node tools/dbg_live_e2e.mjs [--cli /tmp/clued-dbg --data /tmp/dbgdata-cl]
import { open } from './a_cdp.mjs';
import { execFileSync } from 'node:child_process';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CLI = arg('--cli', '/tmp/clued-dbg'), DATA = arg('--data', '/tmp/dbgdata-cl');
const API = 'http://127.0.0.1:8098/gms/2d/clued/api';
const cli = (...a) => execFileSync(CLI, a, { env: { ...process.env, CLUED_DATA: DATA }, encoding: 'utf8' });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

cli('debuglog', 'off'); cli('debuglog', 'clear');
const b = await open({ port: +arg('--port', 9510), width: 384, height: 854, mobile: true });
await b.goto(`http://localhost:8888/gms/2d/clued/?api=${encodeURIComponent(API)}`);
await b.waitFor(`document.body.dataset.screen === 'home'`, 20000);
await b.eval(`(import('./js/core/debuglog.js?v=202610181234').then(m => m.dlog('e2e', 'before-on', {})), true)`);
await sleep(3000);
ok(!(await b.eval('window.__cluedDbg.on')), 'off at boot');
cli('debuglog', 'on');
const t0 = Date.now();
await b.waitFor('window.__cluedDbg.on', 45000);
ok(true, `page switched itself on after ${Math.round((Date.now() - t0) / 1000)} s, no reload`);
await sleep(5000);
const dump = cli('debuglog', 'dump', '--since', '10m');
ok(/before-on/.test(dump), 'first batch carries history from before it was switched on');
ok(/page +boot/.test(dump), 'boot line included');
cli('debuglog', 'off');
await b.waitFor('!window.__cluedDbg.on', 45000);
ok(true, 'switching off reaches the page too');
await b.close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
