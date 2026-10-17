#!/usr/bin/env node
// Hat-trick, end to end with real taps in headless Chrome (CDP_PORT, default 9405; the :8888 site server).
//   node tools/trio_e2e.mjs <outDir> portrait|landscape|desktop   films 3/2/1/0 right + songs, books, countries, movies
//   node tools/trio_e2e.mjs <outDir> room                         local clued server (go build) + 2 Chromes (CDP_PORT and
//                                                                 CDP_PORT+1): the server scores each player's rows
// Start the Chromes first: ~/.claude/bin/cdp start --port 9405 -- --use-angle=metal (and 9406 for room).
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
const PORT = +process.env.CDP_PORT || 9405;
const SITE = 'http://localhost:8888/gms/2d/clued/';
const SIZES = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] };
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) pass++; else { fail++; console.log(`  FAIL ${m} ${x}`); } };
const HARD = setTimeout(() => { console.log('FATAL: over 8 min'); process.exit(1); }, 8 * 60 * 1000); HARD.unref();

const qOf = b => b.eval('(() => { const q = window.__cluedRoom?.q?.() || window.__clued.state().q; return q && { answer: q.answer, rows: q.rows.map(r => r.options.length), labels: q.rows.map(r => r.label), id: q.id, layout: q.data.layout }; })()');
// .screen:not(.leaving): the last game's screen lingers 180 ms with its own chips and reveal (a fast restart matched them)
const chip = (r, i) => `.screen:not(.leaving) .stage .tr-chip[data-r="${r}"][data-i="${i}"]`;
const lastRec = b => b.eval('window.__clued.run().state.answers.at(-1)');
const fits = b => b.eval(`(() => { const s = document.querySelector('.stage'), l = document.querySelector('.stage .tr-lock'), c = [...document.querySelectorAll('.stage .tr-chip')];
  return { scroll: s.scrollHeight - s.clientHeight, lock: l ? Math.round(l.getBoundingClientRect().bottom - innerHeight) : 0, chips: Math.round(Math.max(...c.map(x => x.getBoundingClientRect().bottom)) - innerHeight), h: document.documentElement.scrollWidth - innerWidth }; })()`);
const reveal = b => b.eval(`(() => { const r = document.querySelector('.screen:not(.leaving) .reveal.show'); return r && { cls: r.className, title: r.querySelector('.rv-title')?.textContent, mark: r.querySelector('.rv-mark')?.textContent, pts: r.querySelector('.pts:not(.hat)')?.textContent || '', hat: r.querySelector('.pts.hat')?.textContent || '', top: !!document.querySelector('.screen:not(.leaving) .stage .tr-top')?.offsetParent }; })()`);
// picks per row: the right one where right[i], else the next option
const picksFor = (Q, rightRows) => Q.answer.map((a, i) => (rightRows.includes(i) ? a : (a + 1) % Q.rows[i]));

async function tapAll(b, picks, from = 0) { for (const [r, i] of picks.entries()) await b.click(chip(r + from, i)); }

async function solo() {
  const [w, hgt, mobile] = SIZES[MODE] || SIZES.portrait;
  const b = await open({ port: PORT, width: w, height: hgt, mobile });
  await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ kids: false })); true`);
  await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
  const tag = MODE;

  // films from pictures: 3, 2, 1 and 0 right
  const streaks = [];
  await b.eval(`window.__clued.start({ structure: 'quick', format: 'trio', packs: ['movie-moments'], count: 4, timer: 20 }); true`);
  for (let r = 0; r < 4; r++) {
    await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .tr-chip').length >= 12`, 20000);
    await sleep(700);
    const Q = await qOf(b);
    ok(Q.layout === 'pic' && Q.labels.join() === 'Film,Director,Year' && Q.rows.every(n => n === 4), `q${r} picture + Film/Director/Year`, JSON.stringify(Q));
    if (r === 0) {
      const secs = +(await b.eval(`document.querySelector('.ring b')?.textContent`));
      ok(secs >= 26 && secs <= 30, `timer = answer time 20 s + 10 s (ring ${secs})`);
    }
    const f = await fits(b);
    ok(f.scroll <= 1 && f.lock <= 0 && f.chips <= 0 && f.h <= 1, `q${r} fits the screen without scrolling`, JSON.stringify(f));
    ok(await b.eval(`document.querySelector('.stage .tr-lock').disabled`), `q${r} Lock in disabled before picks`);
    const want = [[0, 1, 2], [0, 2], [1], []][r];
    const picks = picksFor(Q, want);
    if (r === 1) {
      // change a pick: tap a wrong one first, then the final one
      await b.click(chip(0, (picks[0] + 2) % 4));
      ok(await b.eval(`document.querySelector('${chip(0, (picks[0] + 2) % 4)}').getAttribute('aria-pressed') === 'true'`), 'a tap picks');
    }
    await tapAll(b, picks.slice(0, 2));
    ok(await b.eval(`document.querySelector('.stage .tr-lock').disabled`), `q${r} Lock in still disabled with a row unpicked`);
    await tapAll(b, picks.slice(2), 2);
    ok(await b.eval(`document.querySelectorAll('.stage .tr-chip[aria-pressed=true]').length === 3`), `q${r} one pick per row`);
    if (r === 0) await b.shot(`${OUT}/${tag}-film-q.png`);
    ok(!(await b.eval(`document.querySelector('.stage .tr-lock').disabled`)), `q${r} Lock in enabled`);
    await b.click('.stage .tr-lock');
    await b.waitFor('document.querySelector(".screen:not(.leaving) .reveal.show")', 10000);
    await sleep(700);
    const rec = await lastRec(b), rv = await reveal(b);
    streaks.push(rec.streak);
    const n = want.length;
    if (n === 3) ok(rec.correct && rec.hat === 100 && rec.points >= 200 && /Hat-trick/.test(rv.title) && /good/.test(rv.cls) && rv.pts === `+${rec.points - 100}` && rv.hat === '+100 hat-trick', 'q0 3/3 = Hat-trick, correct, speed points + 100 bonus shown apart', JSON.stringify([rec, rv]));
    else if (n) ok(!rec.correct && rec.partial && rec.points > 0 && rec.points <= Math.round(500 * n / 3) && rv.title === `${n} of 3 right` && /partial/.test(rv.cls) && rv.mark === `${n}/3` && !rv.top && rv.pts === `+${rec.points}`, `q${r} ${n}/3 = partial ${rec.points} ≤ ${Math.round(500 * n / 3)}`, JSON.stringify([rec, rv]));
    else ok(!rec.correct && !rec.points && /bad/.test(rv.cls), 'q3 0/3 = wrong, 0 points', JSON.stringify([rec, rv]));
    const marks = await b.eval(`[...document.querySelectorAll('.stage .tr-row')].map(r => r.querySelector('.tk').textContent + [...r.querySelectorAll('.tr-chip')].map(c => /\\bok\\b/.test(c.className) ? 'O' : /\\bmiss\\b/.test(c.className) ? 'M' : /\\bbad\\b/.test(c.className) ? 'B' : '.').join(''))`);
    ok(marks.every((m, i) => (want.includes(i) ? m[0] === '✓' && m.includes('O') : m[0] === '✗' && m.includes('M') && m.includes('B'))), `q${r} rows marked right / wrong / missed`, JSON.stringify(marks));
    ok((await fits(b)).h <= 1, `q${r} no horizontal scroll after the reveal`);
    const next = await b.eval(`(() => { const n = document.querySelector('.screen:not(.leaving) .reveal.show .next'); if (!n) return null; const r = n.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })()`);
    ok(next, `q${r} Next is on screen`);
    if (r === 0 || r === 1) await b.shot(`${OUT}/${tag}-film-reveal${n}.png`);
    await b.click('.reveal.show .next');
  }
  await b.waitFor('document.body.dataset.screen === "results"', 15000);
  ok(streaks.join() === '1,0,0,0', `only the hat-trick counts for the streak (${streaks})`);

  // other subjects: one question each, a screenshot of the question and the reveal
  for (const [name, packs, labels, layout] of [
    ['movies', ['movies'], /^Director,Year(,Starring)?$/, 'text'],
    ['songs', ['hits-1980s'], /^Song,Artist,Year$/, 'audio'],
    ['books', ['books'], /^Author,Year$/, 'text'],
    ['countries', ['countries'], /^Country,Capital(,Continent)?$/, 'pic'],
  ]) {
    await b.eval(`window.__clued.start({ structure: 'quick', format: 'trio', packs: ${JSON.stringify(packs)}, count: 1, timer: 20, difficulty: 1 }); true`);
    await b.waitFor(`window.__clued.state().run?.answers === 0 && document.querySelectorAll('.stage .tr-chip').length >= 8`, 25000);
    await sleep(name === 'songs' ? 2500 : 800);
    const Q = await qOf(b);
    ok(Q.layout === layout && labels.test(Q.labels.join()), `${name}: ${layout} variant ${Q.labels.join('/')}`, JSON.stringify(Q));
    const f = await fits(b);
    ok(f.scroll <= 1 && f.lock <= 0 && f.chips <= 0 && f.h <= 1, `${name}: fits the screen`, JSON.stringify(f));
    if (name === 'songs') {
      const st = await b.eval(`document.querySelector('.tr-st')?.textContent`);
      ok(!!(await b.eval(`document.querySelector('.stage .tr-play')`)) && !/would not load/.test(st), `songs: clip player (${st})`);
    }
    await b.shot(`${OUT}/${tag}-${name}-q.png`);
    await tapAll(b, picksFor(Q, Q.answer.map((_, i) => i).slice(0, Q.rows.length - 1)));
    await b.click('.stage .tr-lock');
    await b.waitFor('document.querySelector(".screen:not(.leaving) .reveal.show")', 10000);
    await sleep(700);
    const rec = await lastRec(b);
    ok(!rec.correct && rec.partial && rec.points > 0, `${name}: all but one row right is partial`, JSON.stringify(rec));
    if (name === 'songs') ok(await b.eval(`!!document.querySelector('.screen:not(.leaving) .reveal.show .au-reveal')`), 'songs: the reveal credits the track');
    await b.shot(`${OUT}/${tag}-${name}-reveal.png`);
    await b.click('.reveal.show .next');
    await b.waitFor('document.body.dataset.screen === "results"', 15000);
  }

  // timeout: what was picked is scored as locked at the deadline (minimum speed points); unpicked rows are shown,
  // never marked wrong; nothing picked scores nothing
  for (const [k, label] of [[2, 'two right picked'], [0, 'nothing picked']]) {
    await b.eval(`window.__clued.start({ structure: 'quick', format: 'trio', packs: ['movie-moments'], count: 1, timer: 3 }); true`);
    await b.waitFor(`window.__clued.state().run?.answers === 0 && document.querySelectorAll('.screen:not(.leaving) .stage .tr-chip').length >= 12`, 20000);
    const Q = await qOf(b);
    for (let r = 0; r < k; r++) await b.click(chip(r, Q.answer[r]));
    await b.waitFor('document.querySelector(".screen:not(.leaving) .reveal.show")', 20000);
    await sleep(500);
    const rec = await lastRec(b), rv = await reveal(b);
    const marks = await b.eval(`[document.querySelectorAll('.screen:not(.leaving) .stage .tr-chip.bad').length, document.querySelectorAll('.screen:not(.leaving) .stage .tr-chip.ok').length, document.querySelectorAll('.screen:not(.leaving) .stage .tr-chip.miss').length, [...document.querySelectorAll('.screen:not(.leaving) .stage .tk')].map(t => t.textContent).join('')]`);
    if (k) ok(rec.timeout && rec.auto && !rec.correct && rec.points === 67 && /partial/.test(rv.cls) && rv.mark === '2/3' && /Time's up · 2 of 3 right/.test(rv.title), `timeout, ${label}: scores 2/3 of minimum speed (67)`, JSON.stringify([rec, rv]));
    else ok(rec.timeout && !rec.points && /bad/.test(rv.cls) && rv.title === "Time's up", `timeout, ${label}: 0 points`, JSON.stringify([rec, rv]));
    ok(marks[0] === 0 && marks[1] === k && marks[2] === 3 - k && marks[3] === '✓'.repeat(k) + '–'.repeat(3 - k), `timeout, ${label}: unpicked rows shown, none marked wrong`, JSON.stringify(marks));
    if (k) await b.shot(`${OUT}/${tag}-timeout-partial.png`);
    await b.click('.reveal.show .next');
    await b.waitFor('document.body.dataset.screen === "results"', 15000);
  }

  // kids mode: Hat-trick is not offered
  await b.eval(`localStorage.setItem('clued.settings', JSON.stringify({ kids: true })); true`);
  await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
  await b.eval(`window.__cluedCtx?.go ? window.__cluedCtx.go('formats', { structure: 'quick' }) : null; true`);
  await sleep(800);
  const tile = await b.eval(`(() => { const t = document.querySelector('.tile[data-format=trio]'); return t ? t.disabled : 'none'; })()`);
  ok(tile === true || tile === 'none', `kids: the Hat-trick tile is off (${tile})`);

  const errs = b.logs.filter(l => /exception|\[error\]/i.test(l) && !/favicon|net::|Failed to load resource/i.test(l));
  ok(!errs.length, 'no console errors', errs.slice(-3).join(' | '));
  b.close();
}

async function room() {
  const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const dir = mkdtempSync(join(tmpdir(), 'clued-trio-'));
  execFileSync('go', ['build', '-o', join(dir, 'clued'), '.'], { cwd: join(HERE, '..', 'server'), env: { ...process.env, CGO_ENABLED: '0' } });
  const srv = spawn(join(dir, 'clued'), [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dir, 'data'), CLUED_ORIGINS: 'http://localhost:8888' }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
    delete process.env.CDP_PORT;
    const host = await open({ port: PORT }), ann = await open({ port: PORT + 1, width: 854, height: 384 });
    try { await roomPlay(host, ann, API); } catch (e) { await host.shot(`${OUT}/room-fail-host.png`); await ann.shot(`${OUT}/room-fail-ann.png`); throw e; }
    host.close(); ann.close();
  } finally { srv.kill(); rmSync(dir, { recursive: true, force: true }); }
}

async function roomPlay(host, ann, API) {
  const q = `noauth=1&api=${encodeURIComponent(API)}`;
  await host.goto(`${SITE}?${q}`); await host.waitFor('window.__cluedReady', 20000);
  await host.eval(`localStorage.clear(); localStorage.setItem('clued.online', JSON.stringify({ rounds: [{ format: 'trio', packs: ['movie-moments'], count: 3, opts: {}, difficulty: 0 }] })); true`);
  await host.goto(`${SITE}?${q}`); await host.waitFor('window.__cluedReady', 20000);
  await host.eval(`import('./js/net/index.js?v=' + window.__clued.BUILD).then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host]');
  await host.waitFor(`document.querySelector('.round-card')?.textContent.includes('Hat-trick')`, 10000);
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
  const total = await host.eval('window.__cluedRoom.st.total');
  ok(total === 3, 'room has 3 hat-trick questions', total);
  let lastQ = -1;
  for (let guard = 0; guard < 400 && lastQ < total - 1; guard++) {
    const st = await host.eval('window.__cluedRoom.st && { phase: window.__cluedRoom.st.phase, q: window.__cluedRoom.st.q, deadline: window.__cluedRoom.st.qDeadline, start: window.__cluedRoom.st.qStart }');
    if (!st || st.phase !== 'question' || st.q === lastQ) { await sleep(200); continue; }
    lastQ = st.q;
    if (st.deadline && st.start) ok(Math.abs(st.deadline - st.start - 20000) < 1500, `q${st.q}: room answer time = 10 s + 10 s (${st.deadline - st.start})`);
    for (const [b, who] of [[host, 'host'], [ann, 'ann']]) {
      await b.waitFor(`document.querySelectorAll('.stage .tr-chip:not([disabled])').length >= 12 && window.__cluedRoom.q()`, 20000);
      await sleep(300);
      const Q = await qOf(b);
      // host: all right. Ann: 2 right on q0, all right on q1, 1 right on q2
      const unlocked = who === 'ann' && st.q === 2;
      const want = who === 'host' || st.q === 1 ? [0, 1, 2] : st.q === 0 ? [0, 2] : [1];
      if (unlocked) { await b.click(chip(0, (Q.answer[0] + 1) % 4)); await b.click(chip(0, Q.answer[0])); await b.click(chip(1, Q.answer[1])); }
      else { await tapAll(b, picksFor(Q, want)); await b.click('.stage .tr-lock'); }
      b.expect = unlocked ? 2 : want.length;
      b.unlocked = unlocked;
      if (who === 'ann' && st.q === 0) await ann.shot(`${OUT}/room-ann-picked.png`);
    }
    await host.waitFor(`window.__cluedRoom.st.phase === 'reveal' && window.__cluedRoom.st.q === ${st.q}`, 40000);
    await sleep(900);
    for (const [b, who] of [[host, 'host'], [ann, 'ann']]) {
      const last = await b.eval('window.__cluedRoom.st.you.last');
      const n = b.expect;
      ok(!!last && last.correct === (n === 3), `q${st.q} ${who}: server says correct=${n === 3}`, JSON.stringify(last));
      if (n === 3) ok(last.points >= 200 && last.hat === 100, `q${st.q} ${who}: hat-trick scores speed points + 100`, JSON.stringify(last));
      else if (b.unlocked) ok(last.points === 67 && !last.correct, `q${st.q} ${who}: picks never locked in are scored at the deadline (67)`, JSON.stringify(last));
      else ok(last.points > 0 && last.points <= Math.round(500 * n / 3), `q${st.q} ${who}: ${n}/3 → ≤ ${Math.round(500 * n / 3)}`, JSON.stringify(last));
      const shown = await b.eval(`document.querySelector('.screen:not(.leaving) .reveal.show .pts:not(.hat)')?.textContent || ''`);
      const note = await host.eval(`[...document.querySelectorAll('.net-row')].find(r => r.textContent.includes('${who === 'host' ? 'Hosty' : 'Ann'}'))?.querySelector('.net-note-row')?.textContent || ''`);
      ok(n === 3 ? !/◐|✗/.test(note) : /^◐/.test(note), `q${st.q} ${who}: scoreboard row ${n === 3 ? 'right' : 'partly right'} (${note})`);
      ok(shown === `+${last.points - (last.hat || 0)}`, `q${st.q} ${who}: the card shows the server's points (${shown})`);
    }
    if (st.q === 0) { await host.shot(`${OUT}/room-host-reveal.png`); await ann.shot(`${OUT}/room-ann-reveal.png`); }
    if (st.q === 2) await ann.shot(`${OUT}/room-ann-timeout.png`);
  }
  ok(lastQ === total - 1, 'played every room question');
  console.log('  scores', (await host.eval('window.__cluedRoom.st.players.map(p => p.name + ":" + p.score)')).join(' '));
}

try { await (MODE === 'room' ? room() : solo()); } catch (e) { fail++; console.log('  FAIL', e.message); }
console.log(`trio_e2e ${MODE}: ${pass} passed, ${fail} failed → ${OUT}`);
process.exit(fail ? 1 : 0);
