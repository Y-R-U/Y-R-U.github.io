#!/usr/bin/env node
// Settings › br8t Pass: the code box renders and a signed-out player is told to sign in.
// Needs: ~/.claude/bin/cdp start --port 9401 and the :8888 site server.
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(400);
await b.click('.home-foot .btn'); await b.sleep(800);
ok(await b.eval(`!!document.querySelector('[data-set=pass] input.field')`), 'pass code box shown');
await b.eval(`document.querySelector('[data-set=pass]').scrollIntoView(); true`);
await b.click('[data-act=redeem]'); await b.sleep(300);
ok(/Type the code/.test(await b.eval(`document.querySelector('[data-set=pass] p').textContent`)), 'empty code asks for one');
await b.eval(`document.querySelector('[data-set=pass] input').value = 'BR8T-AAAA-BBBB-CCCC'; true`);
await b.click('[data-act=redeem]'); await b.sleep(3000);
const msg = await b.eval(`document.querySelector('[data-set=pass] p').textContent`);
ok(/Sign in first/.test(msg), `signed out: ${msg}`);
await b.shot(`${OUT}/pass-settings.png`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
