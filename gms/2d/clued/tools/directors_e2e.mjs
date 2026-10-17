#!/usr/bin/env node
// Lane DIRECTORS e2e (solo only; production API requests are blocked): the People theme lists its sub-categories in the
// picker, a Quick game on People › Directors by real clicks, "Who directed this film?" over a movie-moments picture,
// the text version from the Directors pack, and games on the virtual packs (people~all, people~music).
//   CDP_PORT=9650 node tools/directors_e2e.mjs OUT [portrait|landscape]
import { open } from './a_cdp.mjs';
import { PROD_API } from './lib/localserver.mjs';
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const URL = 'http://localhost:8888/gms/2d/clued/?test&noauth=1';
const b = await open(MODE === 'landscape' ? { width: 854, height: 384, mobile: true } : { width: 384, height: 854, mobile: true });
await b.send('Network.setBlockedURLs', { urls: PROD_API });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && (e.offsetParent || e.getClientRects().length)); })()`;
const screen = () => b.eval('document.body.dataset.screen');
const cur = () => b.eval('(() => { const q = window.__cluedRun?.current(); return q ? JSON.stringify({ id: q.id, p: q.prompt, refs: q.refs, f: q.format, img: !!q.media?.img?.length, a: q.answerText }) : null; })()');

// answers every question; shoot(q) → a file name for a screenshot of that question (and its reveal), or null
async function play(shoot = () => null) {
  const asked = [];
  let shotNext = null;
  for (let guard = 0; guard < 600 && (await screen()) === 'play'; guard++) {
    if (await b.eval(vis('[data-act=ready]'))) { await b.click('[data-act=ready]'); continue; }
    if (await b.eval(vis('.reveal.show .next'))) {
      if (shotNext) { await b.sleep(400); await b.shot(`${OUT}/${shotNext}-reveal.png`); shotNext = null; }
      await b.click('.reveal.show .next'); await b.sleep(250); continue;
    }
    if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
      const s = await cur();
      const q = s && JSON.parse(s);
      if (q && !asked.some(x => x.id === q.id)) {
        asked.push(q);
        const name = shoot(q);
        if (name) { await b.sleep(600); await b.shot(`${OUT}/${name}.png`); shotNext = name; }
      }
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: asked.length % 3 });
      await b.sleep(300);
      continue;
    }
    await b.sleep(200);
  }
  return asked;
}
const packOf = q => String(q.refs?.[0] || '').split('/')[0];
const start = async rounds => {
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await b.eval(`window.__clued.start({ structure: 'quick', rounds: ${JSON.stringify(rounds)} }); true`);
  await b.waitFor(vis('.choice'), 20000);
};

await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);

// 1. the People theme in the picker: sub-categories, then a Quick game on Directors
await b.click('[data-mode=solo]'); await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.click('.theme-sum button'); await b.sleep(200);
if (await b.eval(`document.querySelector('input.tick[aria-label="All themes"]')?.checked`)) await b.click('input.tick[aria-label="All themes"]');
await b.click('.th[data-theme=people] .th-exp'); await b.sleep(250);
const names = await b.eval(`[...document.querySelectorAll('.th[data-theme=people] .pk-name')].map(e => e.textContent)`);
const want = ['All famous people', 'Actors', 'Directors', 'Musicians', 'Scientists & inventors', 'Writers', 'Sport stars', 'Leaders and rulers', 'Explorers'];
ok(want.every(n => names.includes(n)), `People lists ${names.join(' · ')}`);
const screenNames = await b.eval(`[...document.querySelectorAll('.th[data-theme=screen] .pk-name')].map(e => e.textContent)`);
ok(screenNames.includes('Directors'), `Screen lists Directors too (${screenNames.join(' · ')})`);
await b.eval(`document.querySelector('.th[data-theme=people]').scrollIntoView({ block: 'start' }); true`); await b.sleep(150);
await b.shot(`${OUT}/people-picker-${MODE}.png`);
await b.click('.th[data-theme=people] input.tick[aria-label="Directors"]'); await b.sleep(200);
const sum = await b.eval(`document.querySelector('.theme-sum .ts-txt')?.textContent || ''`);
ok(/1 pack/.test(sum) && /Directors/.test(sum), `picker shows Directors only ("${sum}")`);
await b.click('button.chip[data-v="10"]');
await b.click('[data-act=start]');
await b.waitFor(vis('.choice'), 20000);
const g1 = await play();
await b.waitFor('document.body.dataset.screen === "results"', 20000);
ok(g1.length === 10 && g1.every(q => packOf(q) === 'directors'), `Directors game: ${g1.length} questions, packs ${[...new Set(g1.map(packOf))]}`);

// 2. Screen: "Who directed this film?" over a movie-moments picture
let shotPic = false;
await start([{ format: 'mc', packs: ['movie-moments'], count: 30, opts: { source: 'facts', answers: 4 }, difficulty: 0 }]);
const g2 = await play(q => (!shotPic && q.p === 'Who directed this film?' && (shotPic = true) ? `directors-picture-${MODE}` : null));
const pics = g2.filter(q => q.p === 'Who directed this film?');
ok(pics.length > 0 && pics.every(q => q.img && packOf(q) === 'movie-moments'), `${pics.length} picture director questions (all with a still)`);

// 3. People › Directors: the text version names the film and year
let shotTxt = false;
await start([{ format: 'mc', packs: ['directors'], count: 20, opts: { source: 'questions', answers: 4 }, difficulty: 0 }]);
const g3 = await play(q => (!shotTxt && /^Who directed .+ \(\d{4}\)\?$/.test(q.p) && (shotTxt = true) ? `directors-text-${MODE}` : null));
const txt = g3.filter(q => /^Who directed .+ \(\d{4}\)\?$/.test(q.p));
ok(txt.length > 0 && txt.every(q => !q.img), `${txt.length} "Who directed X (year)?" questions, no picture`);

// 4. the virtual packs play in the browser
await start([{ format: 'mc', packs: ['people~all'], count: 8, opts: {}, difficulty: 0 }, { format: 'mc', packs: ['people~music'], count: 6, opts: {}, difficulty: 0 }]);
const g4 = await play();
ok(g4.length === 14, `people~all + people~music asked ${g4.length}`);
ok(g4.slice(8).every(q => packOf(q) === 'people~music' || /^people\//.test(q.refs?.[0] || '')), `people~music round stays on musicians (${[...new Set(g4.slice(8).map(packOf))]})`);

const errs = b.logs.filter(l => /exception|\[error\]/i.test(l) && !/ERR_BLOCKED_BY_CLIENT|blocked/i.test(l));
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log([...pics.slice(0, 3), ...txt.slice(0, 3), ...g4.slice(0, 4)].map(q => `  ${packOf(q)}: ${q.p} → ${q.a}`).join('\n'));
b.close();
console.log(fails ? `directors_e2e: ${fails} failure(s)` : 'directors_e2e: all passed');
process.exit(fails ? 1 : 0);
