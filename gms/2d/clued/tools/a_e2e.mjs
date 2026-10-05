#!/usr/bin/env node
// Lane A end-to-end: plays every structure with real clicks in headless Chrome.
// Needs: ~/.claude/bin/cdp start --port 9401 and the :8888 site server.
// Usage: node tools/a_e2e.mjs [outDir] [portrait|landscape|desktop] [scenario,...]
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const VP = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] }[MODE];
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ width: VP[0], height: VP[1], mobile: VP[2] });
let fails = 0;
const log = (...a) => console.log(`[${MODE}]`, ...a);
const screen = () => b.eval('document.body.dataset.screen');
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && e.getClientRects().length && !e.disabled); })()`;

async function fresh(settings = {}) {
  await b.goto(URL);
  await b.waitFor('window.__cluedReady');
  // timer Off: the default 10 s answer time can expire before the driver clicks with real packs (flake)
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify(${JSON.stringify({ timerSec: 0, bgm: false, ...settings })})); true`);
  await b.goto(URL);
  await b.waitFor('window.__cluedReady');
  await b.sleep(300);
}

// Answers until the play screen ends. pick(i) -> choice index. Handles handoffs and round cards.
async function playThrough({ max = 60, pick = i => i % 3, shotAt = -1, name = 'x', screenName = 'play' } = {}) {
  let answered = 0, idle = 0;
  for (let guard = 0; guard < max * 4 && (await screen()) === screenName; guard++) {
    if (await b.eval(vis('[data-act=ready]'))) { if (answered === 0) await b.shot(`${OUT}/${MODE}-${name}-handoff.png`); await b.click('[data-act=ready]'); continue; }
    if (await b.eval(vis('.reveal.show .next'))) { await b.click('.reveal.show .next'); await b.sleep(250); continue; }
    if (await b.eval(vis('.choices:not(.locked) .choice:not(:disabled)'))) {
      const n = await b.eval('document.querySelectorAll(".choices:not(.locked) .choice:not(:disabled)").length');
      if (answered === shotAt) await b.shot(`${OUT}/${MODE}-${name}-q.png`);
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: pick(answered) % n });
      answered++;
      await b.sleep(300);
      if (answered - 1 === shotAt) await b.shot(`${OUT}/${MODE}-${name}-reveal.png`);
      continue;
    }
    // non-choice formats (maps, boards) in mixed structures: answer through the test hook
    if (++idle > 10 && await b.eval('!!window.__cluedRun && !document.querySelector(".reveal.show")')) { await b.eval('window.__clued.answer("correct"); true'); answered++; idle = 0; await b.sleep(400); continue; }
    await b.sleep(200);
  }
  return answered;
}

async function expectResults(name) {
  await b.waitFor('document.body.dataset.screen === "results"', 20000);
  await b.sleep(900);
  await b.shot(`${OUT}/${MODE}-${name}-results.png`);
}

const scenarios = {
  async quick() {
    await fresh();
    await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
    await b.click('button.chip[data-v="5"]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    const n = await playThrough({ shotAt: 1, name: 'quick' });
    await expectResults('quick');
    if (n !== 5) throw new Error(`quick answered ${n}`);
    await b.click('[data-act=again]');
    await b.waitFor('document.body.dataset.screen === "play"');
    await b.waitFor(vis('.choice'), 20000);
  },
  async picker() {
    await fresh();
    await b.click('[data-mode=quick]'); await b.click('[data-format=tf]');
    await b.click('.picker .btn.small');
    await b.click('.th-exp');
    await b.shot(`${OUT}/${MODE}-picker.png`);
    await b.click('.pk input:not(:disabled)');
    const v = await b.eval('document.querySelector(".ts-txt b").textContent');
    if (!/1 pack/.test(v)) throw new Error('picker summary ' + v);
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    await playThrough({ name: 'tf', shotAt: 0 });
    await expectResults('tf');
  },
  async kids() {
    await fresh({ kids: true });
    await b.shot(`${OUT}/${MODE}-kids-home.png`);
    await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
    await b.shot(`${OUT}/${MODE}-kids-setup.png`);
    await b.click('button.chip[data-v="5"]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    const opts = await b.eval('document.querySelectorAll(".choice").length');
    if (opts > 3) throw new Error('kids should have <=3 answers, got ' + opts);
    if (await b.eval(vis('.ring'))) throw new Error('kids mode should have no timer by default');
    await playThrough({ name: 'kids', shotAt: 0, pick: () => 1 });
    await expectResults('kids');
  },
  async survival() {
    await fresh();
    await b.click('[data-mode=survival]'); await b.click('[data-format=mc]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    await b.eval('window.__clued.answer("wrong")'); await b.sleep(300);
    await b.shot(`${OUT}/${MODE}-survival-life.png`);
    await b.click('.reveal.show .next');
    for (let i = 0; i < 2; i++) { await b.waitFor(vis('.choices:not(.locked) .choice')); await b.eval('window.__clued.answer("wrong")'); await b.waitFor(vis('.reveal.show .next')); await b.sleep(300); await b.click('.reveal.show .next'); }
    await expectResults('survival');
  },
  async blitz() {
    await fresh();
    await b.click('[data-mode=blitz]'); await b.click('[data-format=tf]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    await b.shot(`${OUT}/${MODE}-blitz-q.png`);
    const t0 = Date.now();
    while ((await screen()) === 'play' && Date.now() - t0 < 75000) {
      if (await b.eval(vis('.choices:not(.locked) .choice'))) await b.eval('window.__clued.answer(Math.random() < .7 ? "correct" : "wrong")');
      await b.sleep(250);
    }
    await expectResults('blitz');
  },
  async ladder() {
    await fresh();
    await b.click('[data-mode=ladder]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.choice'), 20000);
    await b.sleep(600);
    await b.click('.lifeline[data-id=fifty]');
    await b.sleep(200);
    const gone = await b.eval('document.querySelectorAll(".choice.gone").length');
    const nOpts = await b.eval('document.querySelectorAll(".choice").length');
    if (gone !== Math.max(1, nOpts - 2)) throw new Error(`50:50 removed ${gone} of ${nOpts}`);   // 3-answer questions lose one
    await b.click('.lifeline[data-id=hint]');
    await b.shot(`${OUT}/${MODE}-ladder-q.png`);
    await b.eval('window.__clued.answer("correct")'); await b.waitFor(vis('.reveal.show .next')); await b.sleep(300); await b.click('.reveal.show .next');
    await b.waitFor(vis('.choices:not(.locked) .choice'));
    await b.sleep(400);
    await b.click('.lifeline[data-id=skip]');
    await b.waitFor(vis('.reveal.show .next'));
    await b.sleep(300);
    await b.click('.reveal.show .next');
    await b.waitFor(vis('.choices:not(.locked) .choice'));
    await b.sleep(400);
    await b.eval('window.__clued.answer("wrong")'); await b.waitFor(vis('.reveal.show .next')); await b.sleep(300); await b.click('.reveal.show .next');
    await expectResults('ladder');
  },
  async daily() {
    await fresh();
    await b.click('.daily-card');
    await b.shot(`${OUT}/${MODE}-daily.png`);
    await b.click('[data-daily=main] [data-act=play]');
    await b.waitFor(vis('.choice'), 20000);
    const q1 = await b.eval('window.__clued.state().q.id');
    await playThrough({ name: 'daily' });
    await expectResults('daily');
    await b.click('[data-act=home]');
    await b.click('.daily-card');
    if (!(await b.eval('!!document.querySelector("[data-daily=main] .share-grid")'))) throw new Error('daily not recorded');
    await fresh();
    await b.click('.daily-card'); await b.click('[data-daily=main] [data-act=play]');
    await b.waitFor(vis('.choice'), 20000);
    const q1b = await b.eval('window.__clued.state().q.id');
    if (q1 !== q1b) throw new Error(`daily not deterministic ${q1} vs ${q1b}`);
  },
  async party() {
    await fresh();
    await b.click('[data-mode=party]');
    await b.click('.player-row .kid-btn', { index: 1 });
    await b.shot(`${OUT}/${MODE}-party-setup.png`);
    await b.click('[data-act=next]');
    await b.click('[data-format=mc]');
    await b.click('button.chip[data-v="5"]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('[data-act=ready]'), 20000);
    const n = await playThrough({ name: 'party', shotAt: 1 });
    if (n !== 10) throw new Error('party answered ' + n);
    await expectResults('party');
  },
  async pubquiz() {
    await fresh();
    await b.click('[data-mode=pubquiz]');
    await b.click('[data-act=surprise]');
    await b.click('.joker');
    await b.shot(`${OUT}/${MODE}-pub-builder.png`);
    const rounds = await b.eval('document.querySelectorAll(".round-card").length');
    if (rounds < 2) throw new Error('surprise made ' + rounds);
    await b.click('[data-act=start]');
    await b.waitFor(vis('[data-act=ready]'), 20000);
    await b.shot(`${OUT}/${MODE}-pub-round.png`);
    await playThrough({ name: 'pub', max: 80 });
    await expectResults('pub');
  },
  async duel() {
    await fresh();
    await b.click('[data-mode=duel]'); await b.click('[data-format=mc]');
    await b.click('button.chip[data-v="5"]');
    await b.click('[data-act=start]');
    await b.waitFor(vis('.duel .choice'), 20000);
    await b.sleep(400);
    await b.shot(`${OUT}/${MODE}-duel.png`);
    for (let i = 0; i < 5; i++) {
      await b.waitFor(vis('.duel-half.p2 .choices:not(.locked) .choice'), 8000).catch(() => {});
      if ((await screen()) !== 'duel') break;
      const ans = await b.eval('window.__cluedDuel.answer');
      const n = await b.eval('document.querySelectorAll(".duel-half.p1 .choice").length');
      if (i % 2) { await b.click('.duel-half.p1 .choice', { index: (ans + 1) % n }); await b.sleep(200); }
      await b.click(`.duel-half.p${i % 3 ? 2 : 1} .choice`, { index: ans });
      await b.sleep(300);
      if (i === 0) await b.shot(`${OUT}/${MODE}-duel-answer.png`);
      await b.sleep(1800);
    }
    await expectResults('duel');
  },
  async menus() {
    await fresh();
    await b.click('[aria-label=Settings]');
    await b.shot(`${OUT}/${MODE}-settings.png`);
    await b.click('.back');
    await b.click('.home-foot .btn', { index: 1 });
    await b.waitFor('document.querySelector(".credits-pack")');
    await b.shot(`${OUT}/${MODE}-credits.png`);
    await b.click('.back');
    await b.click('[data-mode=learn]');
    await b.sleep(800);
    await b.shot(`${OUT}/${MODE}-learn.png`);
    await b.goto(URL); await b.waitFor('window.__cluedReady');
    await b.click('[data-mode=online]');
    await b.sleep(1000);
    await b.shot(`${OUT}/${MODE}-online.png`);
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  b.logs.length = 0;
  try { await fn(); log('ok', name); } catch (e) {
    fails++; log('FAIL', name, e.message);
    await b.shot(`${OUT}/${MODE}-${name}-FAIL.png`).catch(() => {});
  }
  const errs = b.logs.filter(l => /exception|\[error\]/.test(l));
  if (errs.length) { log('console errors in', name, '\n  ' + errs.slice(0, 5).join('\n  ')); }
}
b.close();
process.exit(fails ? 1 : 0);
