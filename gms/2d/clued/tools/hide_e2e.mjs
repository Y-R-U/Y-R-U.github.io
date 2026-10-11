#!/usr/bin/env node
// Home-page hide chips: kids switch and daily card hide from home and come back from Settings.
// Needs: ~/.claude/bin/cdp start --port 9401 and the :8888 site server.
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const has = sel => b.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(400);
ok(await has('.kids-toggle') && await has('.daily-card'), 'both shown by default');
await b.shot(`${OUT}/hide-home.png`);
await b.click('[data-hide=homeKids]'); await b.sleep(500);
ok(!(await has('.kids-toggle')) && await has('.daily-card'), 'kids switch hidden');
await b.click('[data-hide=homeDaily]'); await b.sleep(500);
ok(!(await has('.daily-card')), 'daily hidden');
await b.shot(`${OUT}/hide-home-after.png`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(400);
ok(!(await has('.kids-toggle')) && !(await has('.daily-card')), 'stays hidden after reload');
await b.click('.home-foot .btn'); await b.sleep(600);
await b.shot(`${OUT}/hide-settings.png`);
await b.click('input[data-key=homeKids]'); await b.click('input[data-key=homeDaily]'); await b.sleep(200);
await b.click('header.bar .back'); await b.sleep(600);
ok(await has('.kids-toggle') && await has('.daily-card'), 'both back after Settings');
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
