#!/usr/bin/env node
/** First-run coaching prompts, the duck crouch, and the shop tab highlight. */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const S = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots') + '/';
const srv = await serveWithUpload(); const c = await CDP.launch();
let fail=0; const ok=(n,v,x='')=>{v?0:fail++;console.log(`${v?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`)};
try {
  await c.viewport(844, 390, 1, true);
  // Fresh save -> the coach prompt must be up on the first fight.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(30);
  const coach = await c.eval(`window.__ragdojo.match.coach && window.__ragdojo.match.coach.text`);
  ok('first fight shows a punch prompt', coach === 'TAP THIS SIDE TO PUNCH', String(coach));
  await c.shot(S+'ui_coach.png');

  await c.eval(`window.__ragdojo.match.playerStrike()`);
  await c.frames(4);
  const c2 = await c.eval(`window.__ragdojo.match.coach && window.__ragdojo.match.coach.text`);
  ok('punching clears it and advances to the power hint', c2 === 'DRAW  /  FOR A POWER HIT', String(c2));
  const saved = await c.eval(`JSON.parse(localStorage.getItem('ragdojo.save.v2')).seen.punch === true`);
  ok('the prompt is remembered across sessions', saved);

  await c.waitFor(`!window.__ragdojo.match.player.attack`, 5000);   // let the punch finish
  await c.eval(`window.__ragdojo.match.playerSpecial('power')`);
  await c.frames(4);
  const c3 = await c.eval(`window.__ragdojo.match.coach`);
  ok('using power hit clears the last prompt', c3 === null);

  // Duck must lower the fighter, not float it.
  // Drive the real stick: main.js feeds input.block to the player every frame, so poking
  // setBlock directly is overwritten immediately.
  await c.eval(`window.__ragdojo.match.brains.length = 0`);
  await c.waitFor(`!window.__ragdojo.match.player.attack`, 5000);
  await c.frames(20);
  const before = await c.eval(`window.__ragdojo.match.player.rag.y[2]`);
  const base = await c.eval(`JSON.stringify((()=>{const b=window.__input ? null : null; const h=innerHeight,w=innerWidth,r=Math.min(84,h*0.21); return {x:r+26,y:h-r-20,r}})())`);
  const b = JSON.parse(base);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y + b.r * 0.75 }] });
  await c.frames(45);
  const duck = await c.eval(`(()=>{const p=window.__ragdojo.match.player; return {head:p.rag.y[2], footL:p.rag.y[8], footR:p.rag.y[10], drop:p.duckDrop, ground:742}})()`);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok('ducking lowers the head', duck.head > before + 12, `${before.toFixed(0)} -> ${duck.head.toFixed(0)}`);
  ok('ducking keeps the feet on the ground', Math.max(duck.footL,duck.footR) > 720, `lowest foot y ${Math.max(duck.footL,duck.footR).toFixed(0)} (ground 742)`);
  await c.shot(S+'ui_duck.png');

  // Shop tab highlight must match the list being shown.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  await c.eval(`document.getElementById('btnShop').click()`); await c.frames(4);
  await c.eval(`document.querySelector('#shop .tab[data-tab="perks"]').click()`); await c.frames(4);
  await c.eval(`document.getElementById('btnShopClose').click()`); await c.frames(4);
  await c.eval(`document.getElementById('btnShop').click()`); await c.frames(6);
  const st = await c.eval(`(()=>{const on=[...document.querySelectorAll('#shop .tab')].find(t=>t.classList.contains('on')); const first=document.querySelector('#shopList .card .cname'); return {on:on&&on.dataset.tab, first:first&&first.textContent}})()`);
  ok('reopened shop highlights the tab it is actually showing', st.on === 'moves' && /POWER HIT/.test(st.first||''), JSON.stringify(st));
  console.log(c.errors.length?'\nERRORS '+c.errors.slice(0,4).join(' | '):'\nno console errors');
} finally { c.close(); srv.close(); }
console.log(`\n${fail?fail+' fail':'all pass'}`);
process.exit(fail?1:0);
