#!/usr/bin/env node
/**
 * What survives a new game, and what you have to earn again.
 *
 * Bully mode is a reward for finishing THIS run. It used to be offered from the record book
 * to anyone who had ever won, so a fresh white belt could open the trophy and hand
 * themselves a black belt's standing — with the shop unlocked to match.
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const vis = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.classList.contains('show')})()`;
const shown = (id) => `!document.getElementById('${id}').classList.contains('hidden')`;

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 460, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=44`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(20);
  await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
  await c.waitFor('document.getElementById("victory").classList.contains("show")', 20000);
  ok('winning the final shows the record book', await c.eval(vis('#victory')));
  ok('a finished run offers BULLY MODE', await c.eval(shown('btnBully')));
  const heads = await c.eval(`[...document.querySelectorAll('#vicBody .vichead')].map(e=>e.textContent).join('|')`);
  ok('it splits this run from all time', heads === 'THIS RUN|ALL TIME', heads);
  const before = await c.eval(`JSON.stringify(window.__ragdojo.save.records)`);
  ok('all-time records are recorded', JSON.parse(before).championships >= 1, before);

  // NEW GAME is two-step, and only the second press does anything.
  await c.eval(`document.getElementById('btnAgain').click()`);
  await c.frames(4);
  ok('NEW GAME asks first', await c.eval(`document.getElementById('btnAgain').textContent`) !== 'NEW GAME'
    && await c.eval(vis('#victory')));
  await c.eval(`document.getElementById('btnAgain').click()`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 8000);

  const after = await c.eval(`JSON.stringify({
    records: window.__ragdojo.save.records,
    completed: window.__ragdojo.save.completed,
    everWon: window.__ragdojo.save.everWon,
    bully: window.__ragdojo.save.bully,
    level: window.__ragdojo.save.level,
    ink: window.__ragdojo.save.ink,
  })`);
  const A = JSON.parse(after);
  ok('a new game keeps the all-time records', JSON.stringify(A.records) === before);
  ok('a new game puts you back at the start', A.level === 0 && A.ink === 0 && A.bully === false);
  ok('a new game clears "this run is finished"', A.completed === false);
  ok('but remembers that you have won before', A.everWon === true);

  // The trophy is still there — the BULLY button behind it is not.
  ok('the trophy stays on the hub', await c.eval(shown('btnTrophy')));
  await c.eval(`document.getElementById('btnTrophy').click()`);
  await c.frames(6);
  ok('the record book opens from the hub', await c.eval(vis('#victory')));
  ok('and does NOT offer bully mode to a fresh run', await c.eval(shown('btnBully')) === false);
  const title = await c.eval(`document.querySelector('#victory h2').textContent`);
  ok('it calls itself the record book, not a victory', title === 'RECORD BOOK', title);
  ok('the all-time section survived', await c.eval(`document.body.innerHTML.includes('ALL TIME')`));

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 5).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
