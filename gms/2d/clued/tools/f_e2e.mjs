#!/usr/bin/env node
// Lane F end-to-end: plays each F format 3× with real clicks/drags/typing in headless Chrome and screenshots it.
// Needs: ~/.claude/bin/cdp start --port 9402 and the :8888 site server.
// Usage: node tools/f_e2e.mjs <outDir> [portrait|landscape|desktop] [format,...] [--kids]
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const KIDS = process.argv.includes('--kids');
const VP = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] }[MODE];
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const ALL = ['match', 'ladder', 'hilo', 'order', 'odd', 'sort', 'fake', 'reveal', 'silhouette', 'number', 'connect', 'blitz60', 'type', 'chain', 'lookalike', 'quote'];
const b = await open({ port: 9402, width: VP[0], height: VP[1], mobile: VP[2] });
const log = (...a) => console.log(`[${MODE}${KIDS ? ' kids' : ''}]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = () => b.eval('window.__clued.state().q');
const vis = sel => b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && e.getClientRects().length && !e.disabled); })()`);
const count = sel => b.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.getClientRects().length && !e.disabled && !e.hidden).length`);

async function center(sel, index = 0) {
  return b.eval(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.getClientRects().length && !e.hidden); const e = els[${index}]; if (!e) return null; e.scrollIntoView({block:'nearest'}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}
async function dragTo(from, to, steps = 12) {
  const m = (type, p) => b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await m('mousePressed', from);
  for (let i = 1; i <= steps; i++) { await m('mouseMoved', { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }); await sleep(16); }
  await m('mouseReleased', to);
  await sleep(150);
}
async function type(text) { await b.send('Input.insertText', { text }); await sleep(40); await b.click('.type-box .btn:not(:disabled)'); await sleep(120); }
const MORE = '[data-act=more]:not(:disabled), .f-more:not(:disabled)';
const wrongIdx = (n, a) => (a + 1) % n;

// One question, played like a person. good = aim for the right answer.
const PLAY = {
  async choice(Q, good) {
    const n = await count('.choices:not(.locked) .choice:not(:disabled)');
    const i = good ? Q.answer : wrongIdx(n, Q.answer);
    await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: i });
  },
  async ladder(Q, good) {
    for (let k = 0; k < 2 && (await count(MORE)); k++) { await b.click(MORE); await sleep(250); }
    if (Q.data.typed) { await b.click('.type-input'); await type(good ? Q.answerText : 'zzzz'); if (!good) { await type('zzzx'); await type('zzzy'); } }
    else await PLAY.choice(Q, good);
  },
  async reveal(Q, good) { if (await count(MORE)) { await b.click(MORE); await sleep(400); } await PLAY.choice(Q, good); },
  async match(Q, good) {
    for (let i = 0; i < Q.answer.length; i++) {
      const decoy = Q.data.right.findIndex((_, j) => !Q.answer.includes(j));
      const j = good || i ? Q.answer[i] : decoy >= 0 ? decoy : Q.answer[1];
      await b.click('.mt-t[data-side=l]', { index: i }); await b.click(`.mt-t[data-side=r][data-i="${j}"]`);
    }
    if (!good && Q.data.multi === false && (await b.eval('document.querySelector(".mt-foot .btn").disabled'))) { await b.click('.mt-t[data-side=l]', { index: 0 }); await b.click(`.mt-t[data-side=r][data-i="${Q.answer[0]}"]`); await b.click('.mt-t[data-side=l]', { index: 1 }); await b.click(`.mt-t[data-side=r][data-i="${Q.answer[0]}"]`); }
    if (await vis('.mt-foot .btn:not(:disabled)')) await b.click('.mt-foot .btn');
  },
  async order(Q, good) {
    // drag the first card to the bottom, then fix with the arrow buttons until it matches (or leave one swap if !good)
    const a = await center('.or-it', 0), z = await center('.or-it', Q.answer.length - 1);
    await dragTo(a, { x: z.x, y: z.y + 10 });
    for (let guard = 0; guard < 40; guard++) {
      const shown = await b.eval('[...document.querySelectorAll(".or-it")].map(e => +e.dataset.i)');
      const slot = shown.findIndex((v, s) => v !== Q.answer[s]);
      if (slot < 0) break;
      const at = shown.indexOf(Q.answer[slot]);
      await b.click(`.or-it[data-i="${Q.answer[slot]}"] .mv button`, { index: 0 });
      await sleep(80);
      void at;
    }
    if (!good) await b.click(`.or-it[data-i="${Q.answer[1]}"] .mv button`, { index: 0 });
    await b.click('.or-foot .btn');
  },
  async sort(Q, good) {
    for (let k = 0; k < Q.answer.length; k++) {
      await sleep(320);
      const bin = good || k ? Q.answer[k] : (Q.answer[k] + 1) % Q.data.bins.length;
      if (k % 2 === 0) {
        const from = await center('.so-card:not(.flown):not(.next):not(.gone)'), to = await center('.so-bin', bin);
        if (from && to) await dragTo(from, to); else await b.click('.so-bin', { index: bin });
      } else await b.click('.so-bin', { index: bin });
      await sleep(good ? 120 : 950);
    }
  },
  async number(Q, good) {
    const s = await center('.nb-slider');
    await dragTo({ x: s.x - 60, y: s.y }, { x: s.x + 40, y: s.y });
    if (good) {
      const digits = String(Math.round(Q.answer));
      if (/^\d+$/.test(digits)) for (const d of digits) await b.click('.nb-pad button', { index: d === '0' ? 9 : +d - 1 });
    }
    await b.click('.nb-go');
  },
  async connect(Q, good) {
    const G = Q.data.groups.length;
    if (!good) {
      const g0 = Q.answer.map((x, i) => (x === 0 ? i : -1)).filter(i => i >= 0);
      const others = Q.answer.map((x, i) => (x !== 0 ? i : -1)).filter(i => i >= 0);
      for (let t = 0; t < 4 && (await vis('.cn-t:not([hidden])')) && !(await vis('.reveal.show')); t++) {
        if (await vis('.cn-foot .btn:nth-child(2):not(:disabled)')) await b.click('.cn-foot .btn:nth-child(2)');
        for (const i of [...g0.slice(0, Q.data.size - 1), others[t]]) await b.click(`.cn-t[data-i="${i}"]`);
        await b.click('.cn-foot .btn.go');
        await sleep(500);
      }
      return;
    }
    for (let g = 0; g < G; g++) {
      const idx = Q.answer.map((x, i) => (x === g ? i : -1)).filter(i => i >= 0);
      for (const i of idx) await b.click(`.cn-t[data-i="${i}"]`);
      await b.click('.cn-foot .btn.go');
      await sleep(500);
    }
  },
  async blitz60(Q, good) {
    await b.click('.bz-start');
    const typeB = async t => { await b.send('Input.insertText', { text: t }); await b.click('.type-box .btn'); };
    const names = Q.data.targets.map(t => t.name);
    const list = good ? names : names.slice(0, 2);
    await typeB('notathing');
    for (const n of list) await typeB(n.toLowerCase());
    if (!good) { log('  waiting out the blitz clock…'); await b.waitFor('document.querySelector(".reveal.show")', 70000); }
  },
  async type(Q, good) {
    await b.click('.type-input');
    if (good) await type(Q.answerText.length > 6 ? Q.answerText.slice(0, -1) + 'x' : Q.answerText);
    else await b.click('.ty-row .btn');
  },
  async chain(Q, good) {
    for (let k = 0; k < Q.answer.length; k++) {
      await b.waitFor(`document.querySelectorAll(".ch-pick .choice:not(:disabled)").length > 0`, 4000);
      await b.click('.ch-pick .choice:not(:disabled)', { index: good || k ? Q.answer[k] : wrongIdx(Q.data.links[k].options.length, Q.answer[k]) });
      await sleep(good ? 550 : 1250);
    }
  },
};
const how = { odd: 'choice', fake: 'choice', hilo: 'choice', lookalike: 'choice', quote: 'choice', silhouette: 'reveal' };

let fails = 0;
for (const fmt of ONLY.length ? ONLY : ALL) {
  try {
    await b.goto(URL);
    await b.waitFor('window.__cluedReady');
    await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify(${JSON.stringify({ kids: KIDS })})); true`);
    await b.goto(URL);
    await b.waitFor('window.__cluedReady');
    const ok = await b.eval(`!!window.__cluedCtx.registry.getFormat(${JSON.stringify(fmt)})`);
    if (!ok) throw new Error('format not registered');
    await b.eval(`window.__clued.start({ structure: 'quick', format: ${JSON.stringify(fmt)}, count: 3, timer: ${KIDS ? 0 : 30}, kids: ${KIDS} }); true`);
    await b.waitFor('document.body.dataset.screen === "play" && window.__clued.state().q', 25000);
    const res = [];
    for (let r = 0; r < 3; r++) {
      await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelector(".stage .f-stage, .stage .q")`, 15000);
      await sleep(900);
      const Q = await q();
      const tag = `${OUT}/${MODE}${KIDS ? '-kids' : ''}-${fmt}-${r}`;
      await b.shot(`${tag}-q.png`);
      const good = r !== 1;
      await PLAY[how[fmt] || fmt](Q, good);
      await b.waitFor('document.querySelector(".reveal.show")', fmt === 'blitz60' ? 70000 : 12000);
      await sleep(700);
      await b.shot(`${tag}-a.png`);
      const st = await b.eval('window.__clued.state().run');
      const last = await b.eval('window.__clued.run().state.answers.at(-1)');
      res.push(`${last.correct ? '✓' : '✗'}${last.points}`);
      if (good && !last.correct && fmt !== 'type') { fails++; log(`  ${fmt} round ${r}: aimed right but marked wrong`, JSON.stringify(last).slice(0, 200)); }
      if (!good && last.correct) { fails++; log(`  ${fmt} round ${r}: aimed wrong but marked right`); }
      void st;
      await b.click('.reveal.show .next');
    }
    await b.waitFor('document.body.dataset.screen === "results"', 15000);
    const errs = b.logs.filter(l => /exception|error/i.test(l) && !/favicon|net::|Failed to load resource/i.test(l));
    if (errs.length) { fails++; log(`  ${fmt} console:`, errs.slice(-3).join(' | ')); }
    b.logs.length = 0;
    log(`${fmt.padEnd(11)} ok ${res.join(' ')}`);
  } catch (e) {
    fails++;
    log(`${fmt.padEnd(11)} FAIL ${e.message}`);
    try { await b.shot(`${OUT}/${MODE}${KIDS ? '-kids' : ''}-${fmt}-FAIL.png`); } catch (er) {}
    console.log(b.logs.slice(-5).join('\n'));
    b.logs.length = 0;
  }
}
b.close();
console.log(`f_e2e ${MODE}: ${fails ? fails + ' problem(s)' : 'all passed'}`);
process.exit(fails ? 1 : 0);
