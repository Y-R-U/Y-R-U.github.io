#!/usr/bin/env node
// Learn mode end-to-end test with REAL input (touch on phones, mouse on desktop), driven through the
// qa daemon (tools/qa_cdp.mjs), which also collects every console error.
//
//   ~/.claude/bin/cdp start --port 9531 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/qa_cdp.mjs serve --ports=9531 --http=9631 --out=DIR &
//   node tools/learn_cdp.mjs --http=9631 [--size=360x740m | 1440x900] [--lessons=board,forks,...] [--fresh] [--shots]
//
// For each lesson: open it from the course map, then repeatedly ask window.__learnTest().expected()
// for the next correct action and perform it with real taps (squares via board.squareToScreen,
// quiz options and buttons via their DOM boxes). Practice games ask the engine (suggest()).
// Checks: lesson completes, stars recorded in localStorage `gambit.learn`, the map shows it done
// after a reload, ONE WebGL canvas the whole time, zero console errors.
import http from 'node:http';

const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const HTTP = +(opt.http || 9631);
const SIZE = String(opt.size || '360x740m');
const LESSONS = String(opt.lessons || 'board,checkmate,forks,square,routine').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails++; return c; };

function q(...cmds) {
  const body = JSON.stringify(cmds.flatMap((c, i) => (i ? [','] : []).concat(c)));
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: HTTP, method: 'POST', path: '/' }, s => {
      let d = ''; s.on('data', c => d += c); s.on('end', () => (s.statusCode === 200 ? res(d.trim()) : rej(new Error(d))));
    });
    r.on('error', rej); r.end(body);
  });
}
const ev = async expr => { const o = await q(['eval', expr]); try { return JSON.parse(o.split('\n').pop()); } catch { return o; } };
const tag = SIZE.replace(/m$/, '_m');

async function untilIdle(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await ev('(() => { const t = window.__learnTest && window.__learnTest(); return t && { busy: t.busy, ready: t.ready, kind: t.kind } })()');
    if (s && !s.busy && (s.ready || s.kind === 'quiz' || s.kind === 'cta')) return s;
    await sleep(150);
  }
  throw new Error('lesson stayed busy');
}

async function playLesson(id, { shots = false, wrongFirst = false } = {}) {
  console.log(`lesson ${id}`);
  await q(['eval', "location.hash = '#/learn', 1"], ['wait', '700'], ['eval', `document.querySelector('.ln-node[data-id="${id}"]').scrollIntoView({ block: 'center' }), 1`], ['wait', '200'],
    ['tap', `.ln-node[data-id="${id}"]`], ['until', `window.__learnTest && window.__learnTest() && window.__learnTest().lesson === '${id}' && window.__learnTest().ready`, '60000']);
  const nr = await ev("(() => { window.__lnR ||= new Set(); window.__lnR.add(window.__learnBoard().renderer); return window.__lnR.size })()");
  ok(nr === 1, `${id}: same shared board/renderer as before (${nr} renderer seen)`);
  let steps = 0, shotN = 0, didWrong = false;
  for (let guard = 0; guard < 220; guard++) {
    await untilIdle();
    const t = await ev('(() => { const t = window.__learnTest(); return { step: t.step, kind: t.kind, done: t.done, failed: t.failed, finished: t.finished, misses: t.misses, e: t.expected() } })()');
    if (t.finished) break;
    if (t.failed) { ok(false, `${id}: step ${t.step + 1} failed — ${await ev("document.querySelector('.ln-status').textContent")}`); await q(['tap', '[data-act=retry]']); continue; }
    if (shots && t.step !== steps) { steps = t.step; }
    let e = t.e;
    if (opt.v) console.log(`    step ${t.step + 1} ${t.kind} -> ${JSON.stringify(e)}`);
    if (e.kind === 'play') e = await ev('window.__learnTest().suggest()');
    if (wrongFirst && !didWrong && e.kind === 'move' && t.kind === 'move') {
      const w = await ev('window.__learnTest().wrongMove()');
      if (w) {
        didWrong = true;
        await q(['mv', w.from, w.to], ['wait', '500']);
        const st = await ev("({ cls: document.querySelector('.ln-status').className, txt: document.querySelector('.ln-status').textContent, misses: window.__learnTest().misses })");
        ok(/bad/.test(st.cls) && st.misses === t.misses + 1, `${id}: wrong move gives feedback ("${st.txt}") and counts a miss`);
        await q(['tap', '[data-act=hint]'], ['wait', '300']);
        const hs = await ev("document.querySelector('.ln-status').textContent");
        ok(/Hint/.test(hs), `${id}: hint shows ("${hs}")`);
        if (shots) await q(['shot', `${tag}_${id}_wrong_hint`]);
        continue;
      }
    }
    if (e.kind === 'next') {
      if (shots && (t.done || t.kind !== 'info')) await q(['shot', `${tag}_${id}_s${t.step + 1}_${t.kind}`]);
      await q(['tap', '[data-act=next]'], ['wait', '250']);
    } else if (e.kind === 'tap') await q(['sq', e.sq], ['wait', '120']);
    else if (e.kind === 'quiz') { if (shots) await q(['shot', `${tag}_${id}_s${t.step + 1}_quiz`]); await q(['tap', '.ln-opt', String(e.index)], ['wait', '200']); }
    else if (e.kind === 'move') {
      await q(['mv', e.from, e.to], ['wait', '350']);
      if (e.promotion || await ev("!!document.querySelector('.promo')")) {
        if (await ev("!!document.querySelector('.promo')")) { if (shots) await q(['shot', `${tag}_${id}_promo`]); await q(['tap', '.promo [data-p=q]'], ['wait', '300']); }
      }
      if (shots && shotN++ < 2) await q(['wait', '300'], ['shot', `${tag}_${id}_s${t.step + 1}_move${shotN}`]);
    } else { ok(false, `${id}: no expected action at step ${t.step + 1} (${JSON.stringify(e)})`); break; }
  }
  const fin = await ev('window.__learnTest().finished');
  ok(fin && fin.stars >= 1, `${id}: lesson finished, ${fin && fin.stars}★ (misses ${await ev('window.__learnTest().misses')})`);
  await q(['wait', '900']);
  if (shots) await q(['shot', `${tag}_${id}_done`]);
  const saved = await ev(`JSON.parse(localStorage.getItem('gambit.learn') || '{}')`);
  ok(saved.l && saved.l[id] >= 1, `${id}: progress saved (${JSON.stringify(saved.l && saved.l[id])}★)`);
  return fin;
}

setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(opt.timeout || 900) * 1000).unref();
(async () => {
  const [w, h, m] = SIZE.match(/^(\d+)x(\d+)(m?)$/).slice(1);
  await q(['size', w, h, ...(m ? ['m'] : [])]);
  if (opt.fresh) await q(['nav', '#/home'], ['eval', "localStorage.removeItem('gambit.learn'), 1"]);
  await q(['nav', '#/learn'], ['wait', '800']);
  if (opt.shots) await q(['shot', `${tag}_map_before`]);
  await q(['errs']);
  for (const [i, id] of LESSONS.entries()) await playLesson(id, { shots: !!opt.shots, wrongFirst: i === 1 });
  // persistence: reload and look at the map
  await q(['nav', '#/learn'], ['wait', '1000']);
  const done = await ev("[...document.querySelectorAll('.ln-node.st-done')].map(n => n.dataset.id)");
  ok(LESSONS.every(id => done.includes(id)), `after reload the map shows done: ${done.join(',')}`);
  if (opt.shots) await q(['shot', `${tag}_map_after`]);
  // one WebGL context across every lesson (the shared board host)
  await q(['eval', `document.querySelector('.ln-node[data-id="${LESSONS[0]}"]').scrollIntoView({ block: 'center' }), 1`], ['tap', `.ln-node[data-id="${LESSONS[0]}"]`], ['until', 'window.__learnTest && window.__learnTest() && window.__learnTest().ready', '60000']);
  const canv = await ev("document.querySelectorAll('canvas').length");
  ok(canv === 1, `WebGL canvases in the document during a lesson: ${canv}`);
  const errs = await q(['errs']);
  ok(/errors: 0$/.test(errs.trim().split('\n')[0]), `console: ${errs.split('\n')[0]}`);
  if (!/errors: 0/.test(errs)) console.log(errs);
  console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
