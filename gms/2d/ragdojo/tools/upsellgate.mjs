#!/usr/bin/env node
/** The upgrade panel leads with what the player was reaching for: the Pass for Pass events and the online allowance. */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
import { readFileSync } from 'node:fs';
const srv = await serveWithUpload(); const c = await CDP.launch();
let fail = 0; const ok = (n, v, x = '') => { v ? 0 : fail++; console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const order = `(()=>{const o=[...document.querySelectorAll('#premium .offer')].map(e=>e.querySelector('span').id); const b=[...document.querySelectorAll('#premium button')].map(e=>e.id).filter(id=>id==='btnPass'||id==='btnCheckout'); return {o, b, title: document.getElementById('premiumTitle').textContent, why: document.getElementById('premiumWhy').classList.contains('hidden') ? '' : document.getElementById('premiumWhy').textContent}})()`;
try {
  await c.viewport(844, 390, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor(`window.__ragdojo && document.getElementById('hub').classList.contains('show')`, 20000);
  await c.eval(`window.__ragdojo.openUpgrade(null, 'pass')`);
  let s = await c.eval(order);
  ok('Pass context: the Pass offer comes first', s.o[0] === 'pricePass', s.o.join(','));
  ok('Pass context: the Pass button comes first', s.b[0] === 'btnPass', s.b.join(','));
  ok('Pass context: says what each product opens', /need the br8t Pass/.test(s.why) && /Support.*opens CYBER \+ DEITIES and 10 online battles a day/.test(s.why), s.why);
  ok('Pass context: titled BR8T PASS', s.title === 'BR8T PASS', s.title);
  await c.eval(`document.getElementById('btnPremiumClose').click(); window.__ragdojo.openUpgrade()`);
  s = await c.eval(order);
  ok('plain upgrade: Support first, no Pass note', s.o[0] === 'priceSupporter' && s.b[0] === 'btnCheckout' && !s.why && s.title === 'SUPPORT THE DEV', JSON.stringify(s));
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  ok('the arena and events panels open it in Pass context', (main.match(/openUpgrade: \(\) => openUpgrade\(null, 'pass'\)/g) || []).length === 2);
  ok('no console errors', !c.errors.length, c.errors.join(' | '));
} finally { c.close(); srv.close?.(); }
console.log(fail ? `${fail} FAILED` : 'upsellgate: all pass');
process.exit(fail ? 1 : 0);
