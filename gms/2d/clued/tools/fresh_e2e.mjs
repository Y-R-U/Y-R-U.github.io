#!/usr/bin/env node
// FRESH e2e: two solo games in a row (the second avoids the first's questions), the history count in Settings, Reset
// through the confirm popup, and the stats line. `CDP_PORT=9580 node tools/fresh_e2e.mjs OUT [portrait|landscape]`
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open(MODE === 'landscape' ? { width: 854, height: 384, mobile: true } : { width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && (e.offsetParent || e.getClientRects().length)); })()`;
const screen = () => b.eval('document.body.dataset.screen');
const seen = () => b.eval(`(JSON.parse(localStorage.getItem('clued.seen') || '{}').h || '').length / 5`);

async function play(name) {
  const asked = [];
  for (let guard = 0; guard < 200 && (await screen()) === 'play'; guard++) {
    if (await b.eval(vis('.reveal.show .next'))) { await b.click('.reveal.show .next'); await b.sleep(250); continue; }
    if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
      const q = await b.eval('(() => { const q = window.__cluedRun?.current(); return q ? JSON.stringify([q.prompt, q.answerText ?? q.options?.[q.answer]?.text ?? q.answer]) : null; })()');
      if (q && !asked.includes(q)) asked.push(q);
      if (asked.length === 2) await b.shot(`${OUT}/fresh-${MODE}-${name}-q.png`);
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: asked.length % 2 });
      await b.sleep(300);
      continue;
    }
    await b.sleep(200);
  }
  return asked;
}

await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);

await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.click('button.chip[data-v="10"]');
await b.click('[data-act=start]');
await b.waitFor(vis('.choice'), 20000);
const g1 = await play('g1');
await b.waitFor('document.body.dataset.screen === "results"', 20000);
ok(g1.length === 10, `game 1 asked ${g1.length}`);
ok(await seen() === 10, `history holds game 1 (${await seen()})`);

await b.click('[data-act=again]');
await b.waitFor('document.body.dataset.screen === "play"');
await b.waitFor(vis('.choice'), 20000);
const g2 = await play('g2');
await b.waitFor('document.body.dataset.screen === "results"', 20000);
const rep = g2.filter(q => g1.includes(q));
ok(g2.length === 10, `game 2 asked ${g2.length}`);
ok(rep.length === 0, `game 2 repeats none of game 1 (${rep.length})`);
ok(await seen() === 20, `history holds both games (${await seen()})`);

await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.click('.home-foot .btn'); await b.sleep(600);
await b.eval(`document.querySelector('[data-set=seen]')?.scrollIntoView({ block: 'center' }); true`); await b.sleep(200);
const label = await b.eval(`document.querySelector('[data-seen=count]')?.textContent || ''`);
ok(/^20 questions remembered/.test(label), `Settings shows "${label}"`);
await b.shot(`${OUT}/fresh-${MODE}-settings.png`);
await b.click('[data-act=seen-reset]'); await b.sleep(400);
ok(await b.eval(vis('.pop-card')), 'Reset asks first (popup, not confirm())');
await b.shot(`${OUT}/fresh-${MODE}-reset-pop.png`);
await b.click('.pop-actions .btn.ghost'); await b.sleep(400);
ok(await seen() === 20, 'Cancel keeps the history');
await b.click('[data-act=seen-reset]'); await b.sleep(400);
await b.click('.pop-actions .btn.danger'); await b.sleep(400);
ok(await seen() === 0, 'Reset empties the history');
ok(/^None yet/.test(await b.eval(`document.querySelector('[data-seen=count]')?.textContent || ''`)), 'label updates');

// stats line: seeded history of two games
await b.eval(`localStorage.setItem('clued.seen', JSON.stringify({ v: 1, h: 'aaaaabbbbbccccc', g: [[10, 10], [8, 10]] })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.eval(`window.__clued.go ? window.__clued.go('stats') : null; true`);
if ((await screen()) !== 'stats') { await b.click('.home-foot .btn'); await b.sleep(500); await b.click('[data-act=stats]'); await b.sleep(600); }
const line = await b.eval(`document.querySelector('[data-stat=seen]')?.textContent || ''`);
ok(/3 questions seen · 90% of the questions in your last 2 games were new to you/.test(line), `stats line "${line}"`);
await b.shot(`${OUT}/fresh-${MODE}-stats.png`);

// public room list: the server's local {cc, level} shows as a focus badge (fetch stubbed: the list lives on the server)
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.eval(`(() => {
  const real = window.fetch;
  const row = (code, title, local) => ({ code, title, formats: ['mc'], packs: ['general'], kids: false, difficulty: 0, host: 'Ann', players: 2, phase: 'lobby', q: 0, total: 10, answerSec: 15, ...(local ? { local } : {}) });
  window.fetch = (u, o) => String(u?.url || u).includes('/rooms/public') ? Promise.resolve(new Response(JSON.stringify({ now: Date.now(), max: 5,
    rooms: [row('AAAAA', 'Tokyo night', { cc: 'JPN', level: 'most' }), row('BBBBB', 'Bad', { cc: '<b>x', level: 'all' }), row('CCCCC', 'Plain')] }), { headers: { 'content-type': 'application/json' } })) : real(u, o);
  return true; })()`);
await b.click('[data-mode=online]');
await b.waitFor(`document.querySelectorAll('.net-pub').length === 3`, 15000); await b.sleep(300);
const badges = await b.eval(`[...document.querySelectorAll('.net-pub')].map(c => c.querySelector('[data-badge=local]')?.textContent || '')`);
ok(badges[0] === '📍 Japan focus' && badges[1] === '' && badges[2] === '', `public list focus badges ${JSON.stringify(badges)}`);
await b.eval(`document.querySelector('.net-pub')?.scrollIntoView({ block: 'center' }); true`); await b.sleep(200);
await b.shot(`${OUT}/fresh-${MODE}-publist.png`);

const errs = b.logs.filter(l => /exception|\[error\]/.test(l));
ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
