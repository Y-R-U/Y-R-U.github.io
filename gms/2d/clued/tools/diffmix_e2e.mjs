#!/usr/bin/env node
// DIFFMIX e2e: the setup screen's ⓘ line follows the difficulty chips, and an Easy 10-question solo game plays a
// 6/3/1 blend that does not open on a hard one. `CDP_PORT=9610 node tools/diffmix_e2e.mjs OUT [portrait|landscape]`
import { open } from './a_cdp.mjs';
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open(MODE === 'landscape' ? { width: 854, height: 384, mobile: true } : { width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && (e.offsetParent || e.getClientRects().length)); })()`;
const note = () => b.eval(`document.querySelector('.diff-note')?.textContent || ''`);

await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.click('[data-mode=solo]'); await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.waitFor(vis('.diff-note'));
ok(/Any level/.test(await note()), `Mixed: "${await note()}"`);
const pick = async v => { await b.click(`[data-opt=difficulty] button.chip[data-v="${v}"]`); await b.sleep(150); };
await pick(3); ok(/^ⓘ Mostly hard/.test(await note()), `Hard: "${await note()}"`);
await pick(2); ok(/^ⓘ Mostly medium/.test(await note()), `Medium: "${await note()}"`);
await pick(1); ok(/^ⓘ Mostly easy, with a few medium and one hard$/.test(await note()), `Easy: "${await note()}"`);
const geo = await b.eval(`(() => { const n = document.querySelector('.diff-note'), r = n.getBoundingClientRect(), row = n.previousElementSibling.getBoundingClientRect(); return { h: r.height, w: r.right, vw: innerWidth, below: r.top >= row.bottom - 1, lines: Math.round(r.height / parseFloat(getComputedStyle(n).lineHeight)) }; })()`);
ok(geo.below && geo.w <= geo.vw && geo.lines <= 2, `note sits under the chips, ${geo.lines} line(s), inside the screen (${JSON.stringify(geo)})`);
await b.eval(`document.querySelector('[data-opt=difficulty]').scrollIntoView({ block: 'center' }); true`); await b.sleep(150);
await b.shot(`${OUT}/diffmix-${MODE}-setup.png`);

await b.click('button.chip[data-v="10"]');
await b.click('[data-act=start]');
await b.waitFor(vis('.choice'), 20000);
const lv = [];
for (let guard = 0; guard < 200 && (await b.eval('document.body.dataset.screen')) === 'play'; guard++) {
  if (await b.eval(vis('.reveal.show .next'))) { await b.click('.reveal.show .next'); await b.sleep(250); continue; }
  if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
    const q = await b.eval('(() => { const q = window.__cluedRun?.current(); return q ? JSON.stringify([q.id, q.lv]) : null; })()');
    if (q && !lv.some(x => x[0] === JSON.parse(q)[0])) lv.push(JSON.parse(q));
    await b.click('.choices:not(.locked) .choice:not(:disabled)');
    await b.sleep(300);
    continue;
  }
  await b.sleep(200);
}
const mix = [1, 2, 3].map(l => lv.filter(x => x[1] === l).length).join('/');
ok(lv.length === 10, `played ${lv.length} questions`);
ok(mix === '6/3/1', `Easy game mix ${mix} (target 6/3/1)`);
ok(lv[0]?.[1] !== 3, `opens on level ${lv[0]?.[1]}`);
const errs = b.logs.filter(l => /exception|\[error\]/.test(l));
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(fails ? `diffmix_e2e ${MODE}: ${fails} FAIL` : `diffmix_e2e ${MODE}: all ok`);
process.exit(fails ? 1 : 0);
