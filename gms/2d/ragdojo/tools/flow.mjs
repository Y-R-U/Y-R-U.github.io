#!/usr/bin/env node
/** Walks the whole game: hub -> shop -> fight -> results -> victory. Captures each screen. */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots');
const W = 900, H = 420;
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const vis = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.classList.contains('show')})()`;

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(W, H, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  ok('boots to hub', await c.eval(vis('#hub')));
  await c.frames(20);
  await c.shot(join(SHOTS, 'flow_hub.png'));

  // Shop
  await c.eval(`(()=>{window.__ragdojo.save.ink = 5000; document.getElementById('btnShop').click()})()`);
  await c.frames(6);
  ok('shop opens', await c.eval(vis('#shop')));
  const cards = await c.eval(`document.querySelectorAll('#shopList .card').length`);
  ok('shop lists moves', cards >= 8, `${cards} cards`);
  const glyphCanvases = await c.eval(`document.querySelectorAll('#shopList .card canvas').length`);
  ok('moves show gesture glyphs', glyphCanvases >= 8, `${glyphCanvases} glyph canvases`);
  await c.frames(30);
  await c.shot(join(SHOTS, 'flow_shop.png'));

  const before = await c.eval(`JSON.stringify(window.__ragdojo.save.moves)`);
  await c.eval(`(()=>{const b=[...document.querySelectorAll('#shopList .buy')].find(b=>!b.disabled); b && b.click()})()`);
  await c.frames(4);
  const after = await c.eval(`JSON.stringify(window.__ragdojo.save.moves)`);
  ok('buying changes the save', before !== after);

  await c.eval(`document.querySelector('#shop .tab[data-tab="perks"]').click()`);
  await c.frames(6);
  const perkCards = await c.eval(`document.querySelectorAll('#shopList .card').length`);
  ok('skills tab lists perks', perkCards >= 10, `${perkCards} perks`);
  await c.eval(`document.getElementById('btnShopClose').click()`);
  await c.frames(4);

  // A whole fight, driven by the AI player.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&autoplay=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  const won = await c.waitFor('document.getElementById("results").classList.contains("show")', 60000);
  ok('fight reaches the results screen', won);
  const resTitle = await c.eval(`document.getElementById('resTitle').textContent`);
  ok('results shows an outcome', !!resTitle, resTitle);
  const rows = await c.eval(`document.querySelectorAll('#resBody .r').length`);
  ok('results itemises the fight', rows >= 4, `${rows} rows`);
  await c.frames(10);
  await c.shot(join(SHOTS, 'flow_results.png'));

  // Escape routes. Both of these were missing: pause had no way out, and a loss offered
  // nothing but TRY AGAIN, so a fight you could not win was a dead end.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&level=3`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.eval(`document.getElementById('btnPause').click()`);
  await c.frames(6);
  ok('pause opens the panel', await c.eval(vis('#settings')));
  ok('pause offers QUIT TO MENU',
    await c.eval(`!document.getElementById('btnQuit').classList.contains('hidden')`));
  await c.eval(`document.getElementById('btnQuit').click()`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 8000);
  ok('quitting a fight returns to the hub', await c.eval(vis('#hub')));

  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&level=3`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(20);
  await c.eval(`window.__ragdojo.match.player.hurt(99999, {from:[0,0], kb:600, stagger:1})`);
  await c.waitFor('document.getElementById("results").classList.contains("show")', 20000);
  ok('losing shows the results screen', await c.eval(`document.getElementById('resTitle').textContent`) === 'KNOCKED OUT');
  ok('a loss offers a way back to the menu',
    await c.eval(`!document.getElementById('btnResMenu').classList.contains('hidden')`));
  await c.eval(`document.getElementById('btnResMenu').click()`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 8000);
  ok('MENU after a loss returns to the hub', await c.eval(vis('#hub')));

  // Victory: jump to the final fight with a maxed save and kill the boss.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=44`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(20);
  await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
  const vic = await c.waitFor('document.getElementById("victory").classList.contains("show")', 20000);
  ok('final win shows the victory screen', vic);
  const score = await c.eval(`document.querySelector('#vicBody .r.big b')?.textContent`);
  ok('victory shows a final score', !!score, `score=${score}`);
  const bully = await c.eval(`!!document.getElementById('btnBully')`);
  ok('victory offers bully mode', bully);
  await c.frames(40);
  await c.shot(join(SHOTS, 'flow_victory.png'));

  await c.eval(`document.getElementById('btnBully').click()`);
  await c.frames(10);
  const bullyOn = await c.eval(`window.__ragdojo.save.bully === true && Object.keys(window.__ragdojo.save.moves).length >= 8`);
  ok('bully mode maxes the save', bullyOn);

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 10).join('\n')}` : '\nno console errors');
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
