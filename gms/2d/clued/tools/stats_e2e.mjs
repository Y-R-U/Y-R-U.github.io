#!/usr/bin/env node
// Stats end-to-end with real clicks: quick game, daily, link challenge → each appears in the stats; home highlight,
// stats page (breakdowns, details, reset confirm), Settings entry, kids page. Screenshots in three viewports.
// Needs: ~/.claude/bin/cdp start --port 9480 -- --use-angle=metal and the :8888 site server.
// Usage: CDP_PORT=9480 node tools/stats_e2e.mjs [outDir]
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ port: 9480, width: 384, height: 854, dpr: 2, mobile: true });
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; console.log('ok  ', msg); } else { fails++; console.error('FAIL', msg); } };
const screen = () => b.eval('document.body.dataset.screen');
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && e.getClientRects().length && !e.disabled); })()`;
const stats = () => b.eval(`JSON.parse(localStorage.getItem('clued.stats') || '{}')`);
const home = async () => { await b.eval(`window.__cluedCtx.reset('home'); true`); await b.waitFor('document.body.dataset.screen === "home"'); await b.sleep(400); };

async function playThrough(screenName = 'play', max = 60) {
  let answered = 0, idle = 0;
  for (let guard = 0; guard < max * 4 && (await screen()) === screenName; guard++) {
    if (await b.eval(vis('[data-act=ready]'))) { await b.click('[data-act=ready]'); continue; }
    if (await b.eval(vis('.reveal.show .next'))) { await b.click('.reveal.show .next'); await b.sleep(250); continue; }
    if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
      const n = await b.eval('document.querySelectorAll(".choices:not(.locked) .choice:not(:disabled)").length');
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: answered % n });
      answered++; idle = 0;
      await b.sleep(300);
      continue;
    }
    if (++idle > 10 && await b.eval('!!window.__cluedRun && !document.querySelector(".reveal.show")')) { await b.eval('window.__clued.answer("correct"); true'); answered++; idle = 0; await b.sleep(400); continue; }
    if (screenName !== 'play' && await b.eval('!document.querySelector(".scr-challenge.playing, .playing")') && answered > 0) break;
    await b.sleep(200);
  }
  return answered;
}

async function shots(name, w, h, dpr, mobile) {
  await b.viewport(w, h, dpr, mobile);
  await b.sleep(500);
  const total = await b.eval('document.querySelector(".screen:not(.leaving)").scrollHeight');
  const step = h - 60;
  let i = 0;
  for (let y = 0; y < total && i < 6; y += step, i++) {
    await b.eval(`document.querySelector(".screen:not(.leaving)").scrollTop = ${y}; true`);
    await b.sleep(250);
    await b.shot(`${OUT}/stats-${name}-${i}.png`);
  }
  await b.eval(`document.querySelector(".screen:not(.leaving)").scrollTop = 0; true`);
  const overflow = await b.eval(`(() => { const s = document.querySelector('.screen:not(.leaving)'); return s.scrollWidth > s.clientWidth + 1; })()`);
  ok(!overflow, `${name}: no horizontal overflow`);
}

try {
  await b.goto(URL);
  await b.waitFor('window.__cluedReady', 20000);
  // Aaron's old line: 9 games · 105/128 right · best streak 14 (totals only, no detailed history)
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false }));
    localStorage.setItem('clued.stats', JSON.stringify({ games: 9, answered: 128, correct: 105, bestStreak: 14, best: { quick: 2100 }, daily: { last: '', results: {} } })); true`);
  await b.goto(URL);
  await b.waitFor('window.__cluedReady', 20000);
  await b.sleep(400);
  const line = await b.eval(`document.querySelector('.stats-line')?.textContent || ''`);
  ok(/tap for your stats/i.test(line) && /(14|82%|105)/.test(line), `home highlight from migrated totals: "${line}"`);
  await b.shot(`${OUT}/stats-home-portrait.png`);
  const first = await b.eval(`document.querySelector('.stats-line')?.dataset.tip`);
  const second = await b.eval(`(async () => { window.__cluedCtx.go('settings'); await new Promise(r => setTimeout(r, 300)); window.__cluedCtx.reset('home'); await new Promise(r => setTimeout(r, 400)); return document.querySelector('.stats-line')?.dataset.tip; })()`);
  ok(second && first && second !== first, `highlight rotates per visit (${first} → ${second})`);

  // quick game, real clicks
  await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
  await b.click('button.chip[data-v="5"]');
  await b.click('[data-act=start]');
  await b.waitFor(vis('.choice'), 25000);
  const n1 = await playThrough();
  await b.waitFor('document.body.dataset.screen === "results"', 20000);
  let s = await stats();
  ok(n1 === 5 && s.h?.[0]?.m === 'quick' && s.h[0].q === 5 && s.games === 10, `quick game recorded (answered ${n1}, history ${s.h?.[0]?.m}/${s.h?.[0]?.q}, games ${s.games})`);
  ok(s.h?.[0]?.du > 0 && s.h[0].du < 600, `quick game duration measured (${s.h?.[0]?.du}s)`);
  ok(s.h?.[0]?.pk?.length > 0 && s.f?.mc?.[1] === 5, `packs and format attributed (${JSON.stringify(s.h?.[0]?.pk)})`);

  // daily
  await home();
  await b.click('.daily-card');
  await b.click('[data-daily=main] [data-act=play]');
  await b.waitFor(vis('.choice'), 30000);
  await playThrough();
  await b.waitFor('document.body.dataset.screen === "results"', 20000);
  s = await stats();
  const today = new Date().toISOString().slice(0, 10);
  ok(s.h?.[0]?.m === 'daily' && s.h[0].dk === 'main' && s.dd?.[today] === 1, `daily recorded with its kind and calendar day (${s.h?.[0]?.m}, ${s.dd?.[today]})`);

  // link challenge (serverless)
  const url = await b.eval(`(async () => {
    const net = await import('./js/net/index.js?v=' + window.__clued.BUILD);
    const c = window.__cluedCtx;
    const spec = c.makeSpec('quick', [{ format: 'mc', count: 4 }], 'stats-lc');
    const { questions } = await c.buildQuestions(spec);
    return net.createLinkChallenge({ spec, title: 'Stats link', result: { questions, score: 700, correct: 2, answers: questions.map((q, i) => ({ i, correct: i < 2, stage: 0, ms: 1500 })) } }, 'Linky');
  })()`);
  await b.goto('about:blank');
  await b.goto(url.replace('/clued/#', '/clued/?test#'));
  await b.waitFor('window.__cluedReady', 20000);
  await b.waitFor(`document.querySelector('#net-lname')`, 20000);
  await b.eval(`(() => { const i = document.querySelector('#net-lname'); i.value = 'Me'; i.dispatchEvent(new Event('input')); return true; })()`);
  await b.click('[data-act=play]');
  await b.waitFor(vis('.choice'), 30000);
  await playThrough('linkchallenge');
  await b.waitFor(`!!document.querySelector('[data-act=reply]')`, 20000);
  s = await stats();
  ok(s.h?.[0]?.m === 'linkchallenge' && s.h[0].n === 2 && s.h[0].q === 4, `link challenge recorded with placing (${JSON.stringify(s.h?.[0])})`);

  // stats page from the home highlight
  await b.goto(URL);
  await b.waitFor('window.__cluedReady', 20000);
  await b.sleep(400);
  await b.click('.stats-line');
  await b.waitFor('document.body.dataset.screen === "stats"');
  await b.sleep(500);
  const rows = await b.eval(`[...document.querySelectorAll('.st-g .st-gt')].map(e => e.textContent)`);
  ok(rows.length === 3 && /Link challenge/.test(rows[0]) && /Daily/.test(rows[1]) && /Quick game/.test(rows[2]), `recent games list: ${JSON.stringify(rows)}`);
  const tiles = await b.eval(`[...document.querySelectorAll('.st-tile')].map(t => t.querySelector('.st-lbl').textContent + '=' + t.querySelector('.st-val').textContent)`);
  ok(tiles.length === 6 && tiles[0] === 'Games played=12' && tiles.some(t => t === 'Best streak=14'), `headline tiles ${JSON.stringify(tiles)}`);
  ok(await b.eval(`[...document.querySelectorAll('.st-row')].some(r => r.dataset.id === '_earlier' && /9 games/.test(r.textContent))`), 'earlier games row keeps the old 9 games');
  await shots('portrait', 384, 854, 2, true);
  await b.click('.st-g');
  ok(await b.eval(`!document.querySelector('.st-gd').hidden && /Played/.test(document.querySelector('.st-gd').textContent)`), 'tapping a recent game shows its details inline');
  await b.shot(`${OUT}/stats-detail.png`);
  await b.click('.st-seg .chip[data-kind=format]');
  ok(await b.eval(`[...document.querySelectorAll('.st-row')].some(r => r.dataset.id === 'mc')`), 'breakdown by game type');
  await b.click('.st-sort .chip[data-sort=acc]');
  const accs = await b.eval(`[...document.querySelectorAll('.st-row .st-ra b')].map(b => parseInt(b.textContent))`);
  ok(accs.every((x, i) => !i || accs[i - 1] >= x), `sorted by accuracy ${JSON.stringify(accs)}`);
  await b.click('.st-seg .chip[data-kind=theme]');
  ok(await b.eval(`document.querySelectorAll('.st-row').length > 0`), 'breakdown by theme');
  await b.click('[data-act=reset]');
  ok(await b.eval(`!document.querySelector('.st-confirm').hidden && !document.querySelector('#popups .pop')`), 'reset asks inline (no popup)');
  await b.shot(`${OUT}/stats-reset.png`);
  await b.click('.st-confirm .btn:not(.danger)');
  ok((await stats()).games === 12, 'cancel keeps the stats');
  await shots('landscape', 854, 384, 1, true);
  await shots('desktop', 1280, 800, 1, false);

  // Settings entry
  await b.viewport(384, 854, 2, true);
  await b.eval(`window.__cluedCtx.reset('settings'); true`);
  await b.waitFor('document.body.dataset.screen === "settings"');
  await b.click('[data-act=stats]');
  ok((await screen()) === 'stats', 'Settings opens the stats page');

  // kids
  await b.eval(`localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false, kids: true })); true`);
  await home();
  const kline = await b.eval(`document.querySelector('.stats-line')?.textContent || ''`);
  ok(/stars/i.test(kline), `kids highlight: "${kline}"`);
  await b.click('.stats-line');
  await b.waitFor('document.body.dataset.screen === "stats"');
  await b.sleep(400);
  ok(await b.eval(`!!document.querySelector('.st-kids .st-kstar') && document.title.length > 0`), 'kids stats page (stars + stickers)');
  await shots('kids', 384, 854, 2, true);
  await b.click('[data-act=grown]');
  ok(await b.eval(`!!document.querySelector('.st-grown .st-tiles')`), 'grown-up stats open below');

  // reset for real, then empty state + no home line
  await b.eval(`localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
  await b.eval(`window.__cluedCtx.reset('stats'); true`);
  await b.sleep(400);
  await b.click('[data-act=reset]'); await b.click('[data-act=reset-yes]');
  await b.sleep(300);
  ok((await stats()).games === 0 && await b.eval(`!!document.querySelector('.st-empty')`), 'reset clears and shows the empty state');
  await home();
  ok(await b.eval(`!document.querySelector('.stats-line')`), 'no home highlight with no games');
  const errs = b.logs.filter(l => /exception|\[error\]/.test(l) && !/favicon|ERR_|Failed to load resource/.test(l));
  ok(!errs.length, `no console errors ${errs.slice(0, 3).join(' | ')}`);
} catch (e) {
  fails++; console.error('FAIL (threw)', e.message);
  await b.shot(`${OUT}/stats-error.png`).catch(() => {});
}
console.log(`stats_e2e: ${passes} passed, ${fails} failed`);
b.close();
process.exit(fails ? 1 : 0);
