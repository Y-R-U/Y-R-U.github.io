#!/usr/bin/env node
// Saved sets on the host screen: save a 2-round set, reset, load it back; full-screen button in bars.
// Needs: ~/.claude/bin/cdp start --port 9401 and the :8888 site server.
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.click('.tile[data-mode="online"]'); await b.sleep(2500);
await b.click('[data-act=host]'); await b.sleep(1500);
ok(await b.eval('document.body.dataset.screen') === 'host', 'host screen');
ok(await b.eval('!!document.querySelector("header.bar .fs-btn")'), 'full-screen button in the top bar');
ok(await b.eval('!!document.querySelector("[data-act=sets-load]")'), 'Sets button shows before any set');
await b.click('[data-act=add-round]'); await b.sleep(500);
await b.click('.pop .tile[data-format]', { index: 1 }); await b.sleep(800);
await b.click('[data-act=save-round]'); await b.sleep(800);
const n1 = await b.eval('document.querySelectorAll(".round-card").length');
ok(n1 === 2, `two rounds (${n1})`);
await b.click('[data-act=sets-save]'); await b.sleep(400);
await b.eval(`document.querySelector('.pop input').value = 'Friday quiz'; true`);
await b.shot(`${OUT}/sets-save.png`);
await b.click('.pop .btn.primary'); await b.sleep(500);
ok(await b.eval('document.querySelector(".set-name")?.textContent') === 'Friday quiz', 'set name shown');
await b.click('[data-act=rounds-reset]'); await b.sleep(400);
ok(await b.eval('document.querySelectorAll(".round-card").length') === 1, 'reset to one round');
await b.click('[data-act=sets-load]'); await b.sleep(500);
ok(await b.eval('document.querySelector(".pop .set-tab[aria-selected=true]")?.dataset.tab') === 'mine', 'popup opens on My sets');
await b.shot(`${OUT}/sets-list.png`);
await b.click('.pop .set-row:not(.no-del) .set-load'); await b.sleep(1200);
ok(await b.eval('document.querySelectorAll(".round-card").length') === 2, 'loaded set has two rounds');
await b.shot(`${OUT}/sets-loaded.png`);
const stored = await b.eval(`JSON.parse(localStorage.getItem('clued.sets')).list.length`);
ok(stored === 1, 'one set stored');
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
