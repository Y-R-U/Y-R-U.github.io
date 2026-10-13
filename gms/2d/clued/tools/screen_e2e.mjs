#!/usr/bin/env node
// Lane SCREEN e2e: a Quick game on the Movies pack chosen by real clicks in the theme picker, then a two-round solo game
// (movies round + books round) answered by real clicks. Checks every question comes from the right pack, the new films and
// books show up, and nothing throws. `CDP_PORT=9600 node tools/screen_e2e.mjs OUT [portrait|landscape]`
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open(MODE === 'landscape' ? { width: 854, height: 384, mobile: true } : { width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && (e.offsetParent || e.getClientRects().length)); })()`;
const screen = () => b.eval('document.body.dataset.screen');

async function play(name) {
  const asked = [];
  for (let guard = 0; guard < 400 && (await screen()) === 'play'; guard++) {
    if (await b.eval(vis('[data-act=ready]'))) { await b.click('[data-act=ready]'); continue; }
    if (await b.eval(vis('.reveal.show .next'))) {
      if (asked.length === 3) await b.shot(`${OUT}/screen-${MODE}-${name}-reveal.png`);
      await b.click('.reveal.show .next'); await b.sleep(250); continue;
    }
    if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
      const q = await b.eval('(() => { const q = window.__cluedRun?.current(); return q ? JSON.stringify({ p: q.prompt, refs: q.refs, f: q.format }) : null; })()');
      if (q && !asked.includes(q)) asked.push(q);
      if (asked.length === 3) await b.shot(`${OUT}/screen-${MODE}-${name}-q.png`);
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: asked.length % 3 });
      await b.sleep(300);
      continue;
    }
    await b.sleep(200);
  }
  return asked.map(s => JSON.parse(s));
}
const packOf = q => String(q.refs?.[0] || '').split('/')[0];

await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);

// 1. Quick game, Movies only, picked in the theme picker
await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.click('.theme-sum button'); await b.sleep(200);
if (await b.eval(`document.querySelector('input.tick[aria-label="All themes"]')?.checked`)) await b.click('input.tick[aria-label="All themes"]');
await b.click('.th[data-theme=screen] .th-exp'); await b.sleep(200);
await b.click('.th[data-theme=screen] input.tick[aria-label="Movies"]'); await b.sleep(200);
const sum = await b.eval(`document.querySelector('.theme-sum .ts-txt')?.textContent || ''`);
ok(/1 pack/.test(sum) && /Movies/.test(sum), `picker shows Movies only ("${sum}")`);
await b.shot(`${OUT}/screen-${MODE}-picker.png`);
await b.click('button.chip[data-v="10"]');
await b.click('[data-act=start]');
await b.waitFor(vis('.choice'), 20000);
const g1 = await play('movies');
await b.waitFor('document.body.dataset.screen === "results"', 20000);
ok(g1.length === 10, `movies game asked ${g1.length}`);
ok(g1.every(q => packOf(q) === 'movies'), `every question from movies (${[...new Set(g1.map(packOf))].join(',')})`);

// 2. one solo game, two rounds: movies then books (hard, so the new long-tail items come up)
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.eval(`window.__clued.start({ structure: 'quick', rounds: [{ format: 'mc', packs: ['movies'], count: 8, opts: {}, difficulty: 3 }, { format: 'mc', packs: ['books'], count: 8, opts: {}, difficulty: 3 }] }); true`);
await b.waitFor(vis('.choice'), 20000);
const g2 = await play('rounds');
await b.waitFor('document.body.dataset.screen === "results"', 20000);
await b.shot(`${OUT}/screen-${MODE}-results.png`);
const packs = g2.map(packOf);
ok(g2.length === 16, `two-round game asked ${g2.length}`);
ok(packs.slice(0, 8).every(p => p === 'movies') && packs.slice(8).every(p => p === 'books'), `round 1 movies, round 2 books (${packs.join(',')})`);
const newIds = await b.eval(`(async () => { const m = await (await fetch('data/packs/movies.json')).json(); const bk = await (await fetch('data/packs/books.json')).json(); return [m.items.slice(77).map(i => 'movies/' + i.id), bk.items.slice(90).map(i => 'books/' + i.id)].flat(); })()`);
const hitNew = [...g1, ...g2].filter(q => (q.refs || []).some(r => newIds.includes(r) || newIds.includes(r.replace(/\/q:[a-z]+-/, '/'))));
ok(hitNew.length > 0, `${hitNew.length} of ${g1.length + g2.length} questions are about the new films/books`);
const errs = b.logs.filter(l => /exception|\[error\]/i.test(l));
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log([...g1, ...g2].slice(0, 26).map(q => `  ${packOf(q)} ${q.f}: ${q.p}`).join('\n'));
b.close();
console.log(fails ? `screen_e2e: ${fails} failure(s)` : 'screen_e2e: all passed');
process.exit(fails ? 1 : 0);
