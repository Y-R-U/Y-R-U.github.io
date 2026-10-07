#!/usr/bin/env node
// Favourite picks, real clicks: node tools/fav_e2e.mjs <outDir> portrait|landscape|desktop   (CDP_PORT, default 9430)
import { open } from './a_cdp.mjs';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/fav';
const MODE = process.argv[3] || 'portrait';
const VP = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] }[MODE];
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ port: 9430, width: VP[0], height: VP[1], mobile: VP[2], dpr: MODE === 'portrait' ? 2 : 1 });
let fails = 0;
const ok = (c, m) => { console.log(`[${MODE}] ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const favs = () => b.eval(`JSON.parse(localStorage.getItem('clued.favs') || 'null')`);
const onChip = key => b.eval(`document.querySelector('[data-opt=${key}] .chip.on')?.dataset.v`);
const shot = n => b.shot(`${OUT}/${MODE}-${n}.png`);

async function boot(settings = {}, clear = true) {
  await b.goto(URL); await b.waitFor('window.__cluedReady');
  if (clear) await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify(${JSON.stringify({ timerSec: 0, bgm: false, ...settings })})); true`);
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
}
async function toListenSetup() {
  await b.click('[data-mode=quick]'); await b.click('[data-format=listen]');
  await b.waitFor(`document.body.dataset.screen === 'setup'`);
  await b.sleep(250);
}
async function hold(sel, ms = 800) {
  const p = await b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await b.sleep(ms);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await b.sleep(200);
}

try {
  await boot();
  await toListenSetup();
  ok(await b.eval(`!!document.querySelector('[data-fav=save]') && document.querySelector('[data-fav=quick]').hidden`), 'save control shown, no quick picks yet');
  await shot('1-empty');
  await b.click('.picker .btn.small');
  await b.click('.th[data-theme=music] .th-exp');
  await b.click('input.tick[aria-label="Hits of the 1980s"]');
  await b.click('input.tick[aria-label="Hits of the 1990s"]');
  await b.click('.picker .btn.small');
  await b.click('[data-opt=clip] .chip[data-v="2"]');
  await b.click('[data-fav=heart]');
  let f = await favs();
  ok(JSON.stringify(f?.slots?.listen?.[0]?.packs) === '["hits-1980s","hits-1990s"]' && f.slots.listen[0].opts.clip === 2, '♥ saved to slot 1');
  ok(await b.eval(`document.querySelector('[data-fav=heart]').classList.contains('on')`), 'heart lit when picks match');
  await b.click('[data-opt=answers] .chip[data-v="6"]');
  ok(!(await b.eval(`document.querySelector('[data-fav=heart]').classList.contains('on')`)), 'heart unlit after a change');
  await b.click('.fs-slot[data-slot="3"]');
  f = await favs();
  ok(f.slots.listen[2]?.opts.answers === 6 && f.slots.listen[0].opts.answers === 4, 'saved to slot 3, slot 1 untouched');
  await shot('2-saved');

  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await toListenSetup();
  ok(await b.eval(`document.querySelectorAll('[data-fav=quick] .fq').length === 2`), 'after reload: 2 quick picks');
  ok((await onChip('answers')) === '4' && (await onChip('clip')) === '5', 'fresh setup shows defaults');
  await shot('3-reload');
  await b.click('.fq[data-slot="3"]');
  await b.sleep(200);
  ok((await onChip('answers')) === '6' && (await onChip('clip')) === '2', 'quick pick 3 applied options');
  ok(await b.eval(`document.querySelector('.theme-sum .ts-txt').textContent.includes('Hits of the 1980s') && document.querySelector('.theme-sum .ts-txt').textContent.includes('2 packs')`), 'quick pick 3 applied packs');
  ok(await b.eval(`document.querySelector('.fq[data-slot="3"]').classList.contains('match') && document.querySelector('.fs-slot[data-slot="3"]').classList.contains('match')`), 'slot 3 marked as current');
  await shot('4-applied');

  await b.click('[data-opt=clip] .chip[data-v="10"]');
  await b.click('.fs-slot[data-slot="1"]');
  ok(await b.eval(`document.querySelector('.fs-slot[data-slot="1"]').classList.contains('armed')`), 'filled slot asks before replacing');
  ok((await favs()).slots.listen[0].opts.clip === 2, 'not replaced on first tap');
  await shot('5-armed');
  await b.click('.fs-slot[data-slot="1"]');
  f = await favs();
  ok(f.slots.listen[0].opts.clip === 10 && f.slots.listen[0].opts.answers === 6, 'second tap replaced slot 1');

  await b.click('[data-clear="3"]');
  ok(!(await favs()).slots.listen[2], '× cleared slot 3');
  await shot('6-cleared');
  await b.click('[data-fav=undo]');
  ok(!!(await favs()).slots.listen[2], 'undo restored slot 3');
  await hold('.fs-slot[data-slot="3"]');
  f = await favs();
  ok(!f.slots.listen[2] && !!f.slots.listen[0], 'long-press cleared slot 3 only');
  ok(await b.eval(`document.querySelectorAll('[data-fav=quick] .fq').length === 1`), 'quick row down to 1');

  // pub quiz round builder
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await b.click('[data-mode=pubquiz]');
  await b.click('[data-act=add-round]');
  await b.click('.pop .tile[data-format=listen]');
  await b.waitFor(`document.body.dataset.screen === 'pqround'`);
  await b.sleep(250);
  ok(await b.eval(`document.querySelectorAll('[data-fav=quick] .fq').length === 1`), 'pub quiz builder shows the listen fav');
  await b.click('.fq[data-slot="1"]');
  await b.sleep(200);
  await shot('7-pubquiz');
  await b.click('[data-act=save-round]');
  await b.sleep(300);
  const r = await b.eval(`JSON.parse(localStorage.getItem('clued.pubquiz')).rounds.at(-1)`);
  ok(r.format === 'listen' && JSON.stringify(r.packs) === '["hits-1980s","hits-1990s"]' && r.opts.clip === 10 && r.opts.answers === 6, 'pub quiz round got the fav picks');

  // online host setup
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await b.click('[data-mode=online]');
  await b.waitFor(`!!document.querySelector('[data-act=host]')`);
  await b.click('[data-act=host]');
  await b.click('[data-act=add-round]');
  ok(await b.waitFor(`document.querySelectorAll('.pop .rp-fav[data-fav-format=listen]').length === 1`), 'host add-round picker lists the listen fav');
  await b.click('.pop .tile[data-format=listen]');
  await b.waitFor(`!!document.querySelector('[data-fav=quick] .fq')`);
  await b.click('.fq[data-slot="1"]');
  ok((await onChip('clip')) === '10', 'host setup quick pick applied');
  await shot('8-host');

  // a removed pack never crashes
  await b.eval(`(() => { const f = JSON.parse(localStorage.getItem('clued.favs')); f.slots.listen[4] = { packs: ['gone-pack', 'hits-1980s'], opts: { clip: 99 }, count: 5 }; localStorage.setItem('clued.favs', JSON.stringify(f)); return true; })()`);
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await toListenSetup();
  await b.click('.fq[data-slot="5"]');
  ok((await onChip('clip')) === '5' && (await b.eval(`document.querySelector('.theme-sum .ts-txt').textContent.includes('1 pack')`)), 'stale fav applied gracefully');

  // kids
  await boot({ kids: true });
  await toListenSetup();
  await b.click('[data-fav=heart]');
  ok(!!(await favs())?.slots?.['listen:kids']?.[0], 'kids fav saved under listen:kids');
  await b.click('.fs-slot[data-slot="2"]');
  ok((await favs()).slots['listen:kids'].filter(Boolean).length === 1, 'identical picks not duplicated into slot 2');
  await b.click('[data-opt=clip] .chip[data-v="15"]');
  await b.click('.fs-slot[data-slot="2"]');
  ok((await favs()).slots['listen:kids'][1]?.opts.clip === 15, 'kids slot 2 saved');
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await toListenSetup();
  await shot('9-kids');
  await b.eval(`document.querySelector('[data-fav=save]').scrollIntoView({ block: 'center' }); true`);
  await b.click('.fs-slot[data-slot="1"]');
  await shot('9-kids-save');
  const sz = await b.eval(`document.querySelector('.fs-slot').getBoundingClientRect().width`);
  ok(sz >= 50, `kids targets are bigger (${sz}px)`);
} catch (e) {
  fails++; console.log(`[${MODE}] FAIL`, e.message); await shot('FAIL').catch(() => {});
}
const errs = b.logs.filter(l => /exception|\[error\]/.test(l));
if (errs.length) console.log(`[${MODE}] console errors:\n  ` + errs.slice(0, 8).join('\n  '));
b.close();
process.exit(fails ? 1 : 0);
