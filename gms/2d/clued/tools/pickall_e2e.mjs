#!/usr/bin/env node
// Pick all, end to end with real taps in headless Chrome (CDP_PORT, default 9590; the :8888 site server).
//   node tools/pickall_e2e.mjs <outDir> portrait|landscape      solo adult round + kids round, screenshots
//   node tools/pickall_e2e.mjs <outDir> room                     local clued server (go build) + 2 Chromes
//                                                                 (CDP_PORT and CDP_PORT+1): two players pick
//                                                                 differently; the server's points follow the rule
// Start the Chromes first: ~/.claude/bin/cdp start --port 9590 -- --use-angle=metal (and 9591 for room).
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { open } from './a_cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const PORT = +process.env.CDP_PORT || 9590;
const SITE = 'http://localhost:8888/gms/2d/clued/';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) pass++; else { fail++; console.log(`  FAIL ${m} ${x}`); } };
const HARD = setTimeout(() => { console.log('FATAL: over 8 min'); process.exit(1); }, 8 * 60 * 1000); HARD.unref();

const qOf = b => b.eval('(() => { const q = window.__cluedRoom?.q?.() || window.__clued.state().q; return q && { answer: q.answer, n: q.options.length, need: q.data.need, id: q.id, kids: !!q.kids, layout: q.data.layout }; })()');
const tiles = b => b.eval(`[...document.querySelectorAll('.stage .pa-tile')].map(t => ({ on: t.getAttribute('aria-pressed') === 'true', cls: t.className, dis: t.disabled }))`);
const tap = (b, i) => b.click('.stage .pa-tile', { index: i });
const lastRec = b => b.eval('window.__clued.run().state.answers.at(-1)');
const wrongOf = Q => [...Array(Q.n).keys()].filter(i => !Q.answer.includes(i));
const noHScroll = b => b.eval('document.documentElement.scrollWidth <= innerWidth + 1');

async function solo() {
  const L = MODE === 'landscape';
  const b = await open({ port: PORT, width: L ? 854 : 384, height: L ? 384 : 854, mobile: true });
  const boot = async kids => {
    await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
    await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ kids: ${kids} })); true`);
    await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
  };
  await boot(false);
  await b.eval(`window.__clued.start({ structure: 'quick', format: 'pickall', packs: ['general', 'countries', 'birds'], count: 4, timer: 30, opts: { tiles: 8 } }); true`);
  for (let r = 0; r < 4; r++) {
    await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .pa-tile').length`, 20000);
    await sleep(500);
    const Q = await qOf(b);
    ok(Q.n >= 6 && Q.n <= 8 && Q.n >= 2 * Q.need && Q.need >= 2 && Q.need <= 4 && Q.answer.length === Q.need, `q${r} shape 6–8 tiles, 2–4 right`, JSON.stringify(Q));
    ok(await b.eval(`document.querySelector('.stage .pa-lock').disabled`), `q${r} Lock in disabled before any pick`);
    if (r === 0) await b.shot(`${OUT}/${MODE}-q.png`);
    const W = wrongOf(Q);
    let picks;
    if (r === 0) picks = Q.answer;                                   // all right
    else if (r === 1) picks = [...Q.answer.slice(0, -1), W[0]];       // one wrong
    else if (r === 2) picks = W.slice(0, Q.need);                     // all wrong
    else {                                                            // over-pick: the extra tap is refused, then unpick and fix
      for (const i of W.slice(0, Q.need)) await tap(b, i);
      await tap(b, Q.answer[0]);
      const t = await tiles(b);
      ok(t.filter(x => x.on).length === Q.need && !t[Q.answer[0]].on, 'q3 a pick beyond the count is refused');
      ok(/Unpick/.test(await b.eval(`document.querySelector('.stage .pa-top').textContent`)), 'q3 says "Unpick one first"');
      await tap(b, W[0]);
      ok((await tiles(b)).filter(x => x.on).length === Q.need - 1, 'q3 tapping a picked tile unpicks it');
      picks = [Q.answer[0]];
    }
    for (const i of picks) await tap(b, i);
    if (r === 1) await b.shot(`${OUT}/${MODE}-picked.png`);
    ok(!(await b.eval(`document.querySelector('.stage .pa-lock').disabled`)), `q${r} Lock in enabled at ${Q.need} picks`);
    await b.click('.stage .pa-lock');
    await b.waitFor('document.querySelector(".reveal.show")', 10000);
    await sleep(600);
    const rec = await lastRec(b), t = await tiles(b);
    const sel = r === 3 ? [...W.slice(1, Q.need), Q.answer[0]] : picks;
    const hits = sel.filter(i => Q.answer.includes(i)).length, frac = hits / Q.need;
    if (r === 0) ok(rec.correct && rec.points >= 100, 'all right = correct with speed points', JSON.stringify(rec));
    else ok(!rec.correct && (frac > 0 ? rec.points > 0 && rec.points <= Math.round(500 * frac) : rec.points === 0), `q${r} partial = base × ${frac.toFixed(2)}`, JSON.stringify(rec));
    ok(Q.answer.every(i => /\b(ok|miss)\b/.test(t[i].cls)) && W.every(i => /\b(bad|dim)\b/.test(t[i].cls)), `q${r} reveal marks right / wrong / missed`);
    if (r === 1) ok(t.some(x => /\bmiss\b/.test(x.cls)) && t.some(x => /\bbad\b/.test(x.cls)), 'q1 shows a missed and a wrong tile');
    if (r === 1) { const m = await b.eval(`[document.querySelector('.reveal.show .rv-mark')?.textContent, document.querySelector('.reveal.show').className, document.querySelectorAll('.reveal.show .rv-extra').length]`); ok(m[0] === `${hits}/${Q.need}` && /partial/.test(m[1]) && m[2] === 0, `q1 partial card shows ${hits}/${Q.need}, no extra points line`, JSON.stringify(m)); }
    ok(await noHScroll(b), `q${r} no horizontal scroll`);
    if (r === 1) await b.shot(`${OUT}/${MODE}-reveal.png`);
    await b.click('.reveal.show .next');
  }
  await b.waitFor('document.body.dataset.screen === "results"', 15000);
  // timeout: the picks so far count as locked at the deadline (minimum speed points); missed tiles shown, none wrong
  await b.eval(`window.__clued.start({ structure: 'quick', format: 'pickall', packs: ['general', 'countries', 'birds'], count: 1, timer: 3, opts: { tiles: 6 } }); true`);
  await b.waitFor(`window.__clued.state().run?.answers === 0 && document.querySelectorAll('.stage .pa-tile').length`, 20000);
  {
    await sleep(500);
    const Q = await qOf(b);
    await tap(b, Q.answer[0]);
    ok((await tiles(b))[Q.answer[0]].on, 'timeout: the pick registered before time ran out');
    await b.waitFor('document.querySelector(".reveal.show")', 20000);
    await sleep(500);
    const rec = await lastRec(b), t = await tiles(b);
    ok(rec.timeout && rec.auto && !rec.correct && rec.points === Math.round(100 / Q.need), `timeout: 1 of ${Q.need} picked scores ${Math.round(100 / Q.need)}`, JSON.stringify(rec));
    ok(!t.some(x => /\bbad\b/.test(x.cls)) && t.filter(x => /\bmiss\b/.test(x.cls)).length === Q.need - 1, 'timeout: missed tiles shown, none marked wrong');
    await b.shot(`${OUT}/${MODE}-timeout.png`);
    await b.click('.reveal.show .next');
    await b.waitFor('document.body.dataset.screen === "results"', 15000);
  }
  // kids: 4–5 tiles, 2 right, pictures where the pack has them, read aloud, auto lock-in at 2 picks
  await boot(true);
  await b.eval(`window.__clued.start({ structure: 'quick', format: 'pickall', packs: ['birds', 'sea', 'kids'], count: 3, timer: 0, kids: true }); true`);
  for (let r = 0; r < 3; r++) {
    await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .pa-tile').length`, 20000);
    await sleep(500);
    const Q = await qOf(b);
    ok(Q.n >= 4 && Q.n <= 5 && Q.need === 2, `kids q${r}: 4–5 tiles, 2 right`, JSON.stringify(Q));
    ok(await b.eval(`!document.querySelector('.stage .pa-lock') && !!document.querySelector('.stage .q-prompt .speak-q')`), `kids q${r}: no lock button, 🔊 on the prompt`);
    if (Q.layout === 'images') ok(await b.eval(`document.querySelectorAll('.stage .pa-tile img').length === ${Q.n}`), `kids q${r}: pictures`);
    if (r === 0) await b.shot(`${OUT}/${MODE}-kids-q.png`);
    for (const i of Q.answer) await tap(b, i);
    await b.waitFor('document.querySelector(".reveal.show")', 6000);
    ok((await lastRec(b)).correct, `kids q${r}: auto lock-in after 2 picks`);
    ok(await noHScroll(b), `kids q${r} no horizontal scroll`);
    if (r === 0) { await sleep(500); await b.shot(`${OUT}/${MODE}-kids-reveal.png`); }
    await b.click('.reveal.show .next');
  }
  const errs = b.logs.filter(l => /exception|\[error\]/i.test(l) && !/favicon|net::|Failed to load resource/i.test(l));
  ok(!errs.length, 'no console errors', errs.slice(-3).join(' | '));
  b.close();
}

async function room() {
  const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const dir = mkdtempSync(join(tmpdir(), 'clued-pa-'));
  execFileSync('go', ['build', '-o', join(dir, 'clued'), '.'], { cwd: join(HERE, '..', 'server'), env: { ...process.env, CGO_ENABLED: '0' } });
  const srv = spawn(join(dir, 'clued'), [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dir, 'data'), CLUED_ORIGINS: 'http://localhost:8888' }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
    delete process.env.CDP_PORT;   // a_cdp prefers it over the port argument
    const host = await open({ port: PORT }), ann = await open({ port: PORT + 1 });
    try { await roomPlay(host, ann, API); } catch (e) { await host.shot(`${OUT}/room-fail-host.png`); await ann.shot(`${OUT}/room-fail-ann.png`); throw e; }
    host.close(); ann.close();
  } finally { srv.kill(); rmSync(dir, { recursive: true, force: true }); }
}

async function roomPlay(host, ann, API) {
  {
    const q = `noauth=1&api=${encodeURIComponent(API)}`;
    await host.goto(`${SITE}?${q}`); await host.waitFor('window.__cluedReady', 20000);
    await host.eval(`localStorage.clear(); localStorage.setItem('clued.online', JSON.stringify({ rounds: [{ format: 'pickall', packs: ['general', 'countries'], count: 4, opts: { tiles: 6 }, difficulty: 0 }] })); true`);
    await host.goto(`${SITE}?${q}`); await host.waitFor('window.__cluedReady', 20000);
    await host.eval(`import('./js/net/index.js?v=' + window.__clued.BUILD).then(() => window.__cluedCtx.go('online'))`);
    await host.click('[data-act=host]');
    await host.waitFor(`document.querySelector('.round-card')?.textContent.includes('Pick all')`, 10000);
    await host.eval(`document.querySelector('[data-field=name]').value = ''; true`);
    await host.click('[data-field=name]'); await host.send('Input.insertText', { text: 'Hosty' });
    await host.click('[data-act=create]');
    await host.waitFor(`document.querySelector('.net-link')?.textContent`, 30000);
    const link = await host.eval(`document.querySelector('.net-link').textContent`);
    await ann.goto(`http://${link}&noauth=1`);
    await ann.waitFor(`document.querySelector('[data-field=name]')`, 20000);
    await ann.eval(`document.querySelector('[data-field=name]').value = ''; true`);
    await ann.click('[data-field=name]'); await ann.send('Input.insertText', { text: 'Ann' });
    await ann.click('[data-act=join]');
    await ann.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000);
    await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 10000);
    await host.click('[data-act=start]');
    const total = (await host.eval('window.__cluedRoom.st.total'));
    ok(total === 4, 'room has 4 pick-all questions', total);
    let lastQ = -1, sawPartial = false;
    for (let guard = 0; guard < 400 && lastQ < total - 1; guard++) {
      const st = await host.eval('window.__cluedRoom.st && { phase: window.__cluedRoom.st.phase, q: window.__cluedRoom.st.q }');
      if (!st || st.phase !== 'question' || st.q === lastQ) { await sleep(200); continue; }
      lastQ = st.q;
      for (const [b, who] of [[host, 'host'], [ann, 'ann']]) {
        await b.waitFor(`document.querySelectorAll('.stage .pa-tile:not([disabled])').length >= 6 && window.__cluedRoom.q()`, 20000);
        await sleep(300);
        const Q = await qOf(b);
        const W = wrongOf(Q);
        // host: all right. Ann: one wrong on q0/q2, all right on q1, all wrong on q3
        const picks = who === 'host' || st.q === 1 ? Q.answer : st.q === 3 ? W.slice(0, Q.need) : [...Q.answer.slice(0, -1), W[0]];
        for (const i of picks) await tap(b, i);
        await b.click('.stage .pa-lock');
        b.expect = { need: Q.need, hits: picks.filter(i => Q.answer.includes(i)).length };
        if (who === 'ann' && st.q === 0) await ann.shot(`${OUT}/room-ann-picked.png`);
      }
      await host.waitFor(`window.__cluedRoom.st.phase === 'reveal' && window.__cluedRoom.st.q === ${st.q}`, 40000);
      await sleep(800);
      for (const [b, who] of [[host, 'host'], [ann, 'ann']]) {
        const last = await b.eval('window.__cluedRoom.st.you.last');
        const { need, hits } = b.expect;
        const frac = hits / need, right = hits === need;
        ok(!!last && last.correct === right, `q${st.q} ${who}: server says correct=${right}`, JSON.stringify(last));
        if (right) ok(last.points >= 100, `q${st.q} ${who}: all right scores speed points`, JSON.stringify(last));
        else if (frac > 0) { sawPartial = true; ok(last.points > 0 && last.points <= Math.round(500 * frac), `q${st.q} ${who}: partial ${hits}/${need} → ≤ ${Math.round(500 * frac)}`, JSON.stringify(last)); }
        else ok(last.points === 0, `q${st.q} ${who}: ${hits}/${need} right scores 0`, JSON.stringify(last));
      }
      if (st.q === 0) { await host.shot(`${OUT}/room-host-reveal.png`); await ann.shot(`${OUT}/room-ann-reveal.png`); }
    }
    ok(lastQ === total - 1, 'played every room question');
    console.log(`  partial credit ${sawPartial ? 'seen' : 'not drawn this run (only 2-answer questions got a wrong pick)'}`);
    const s = await host.eval('window.__cluedRoom.st.players.map(p => p.name + ":" + p.score)');
    console.log('  scores', s.join(' '));
  }
}

try { await (MODE === 'room' ? room() : solo()); } catch (e) { fail++; console.log('  FAIL', e.message); }
console.log(`pickall_e2e ${MODE}: ${pass} passed, ${fail} failed → ${OUT}`);
process.exit(fail ? 1 : 0);
