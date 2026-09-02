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
  // Locked moves must still show what they cost.
  await c.eval(`(()=>{window.__ragdojo.save.ink=0; document.getElementById('btnShop').click()})()`);
  await c.frames(6);
  const locked = await c.eval(`(()=>{const cards=[...document.querySelectorAll('#shopList .card')];
    const l=cards.find(x=>x.classList.contains('locked'));
    if(!l) return null;
    const btn=l.querySelector('.buy');
    return {name:l.querySelector('.cname').textContent, btn:btn&&btn.textContent, disabled:btn&&btn.disabled,
            note:(l.querySelector('.lv')||{}).textContent};})()`);
  ok('locked moves still show their price', !!locked && /\d/.test(locked.btn || ''), JSON.stringify(locked));
  await c.eval(`document.getElementById('btnShopClose').click()`); await c.frames(3);

  // The results panel must fit a landscape phone, button included.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&autoplay=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.waitFor('document.getElementById("results").classList.contains("show")', 60000);
  await c.frames(8);
  const fit = await c.eval(`(()=>{const b=document.getElementById('btnResult').getBoundingClientRect();
    const s=document.querySelector('#results .sheet').getBoundingClientRect();
    return {btnBottom:Math.round(b.bottom), btnTop:Math.round(b.top), vh:innerHeight,
            sheetH:Math.round(s.height), sheetBottom:Math.round(s.bottom)};})()`);
  ok('results button is fully on screen', fit.btnBottom <= fit.vh && fit.btnTop >= 0, JSON.stringify(fit));
  ok('results panel fits the viewport', fit.sheetBottom <= fit.vh + 1, `sheet ${fit.sheetH}px in ${fit.vh}px`);
  await c.shot(S+'ui_results_fit.png');

  // Facing: an enemy behind you must make you turn round.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.eval(`window.__ragdojo.match.brains.length = 0`);
  await c.frames(10);
  const faceBefore = await c.eval(`window.__ragdojo.match.player.facing`);
  await c.eval(`(()=>{const m=window.__ragdojo.match; const e=m.enemies[0];
    e.x = m.player.x - 260; e.place(e.x, m.world.groundY);})()`);
  await c.frames(12);
  const faceAfter = await c.eval(`window.__ragdojo.match.player.facing`);
  ok('player turns to face an enemy that got behind them', faceAfter === -1 && faceBefore === 1,
     `${faceBefore} -> ${faceAfter}`);

  // Attacking must root you, so a power hit cannot walk you over the body you floored.
  await c.eval(`(()=>{const m=window.__ragdojo.match, p=m.player;
    m.enemies[0].x = p.x + 300; m.enemies[0].place(m.enemies[0].x, m.world.groundY);
    p.attack=null; p.mode='live'; p.vx=0; window.__x0=p.x;})()`);
  await c.frames(4);
  await c.eval(`(()=>{const m=window.__ragdojo.match; m.playerSpecial('power');
    window.__drift=setInterval(()=>m.player.move(1, 1/60), 8)})()`);
  await c.frames(40);
  const drift = await c.eval(`(()=>{clearInterval(window.__drift); return Math.abs(window.__ragdojo.match.player.x - window.__x0)})()`);
  ok('attacking roots you in place', drift < 22, `drifted ${drift.toFixed(0)}u while power hitting`);

  // Sit just below the level-10 gate, win, and the results screen should announce 2 tracks.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&autoplay=1&unlock=1&level=9`);
  await c.waitFor('window.__state && window.__state.mode==="fight"',20000);
  await c.eval(`window.__ragdojo.save.level = 9`);
  await c.waitFor('document.getElementById("results").classList.contains("show")',70000);
  await c.frames(6);
  const un=await c.eval(`(()=>{const e=document.querySelector('#resBody .r.unlock'); return e?e.textContent:null})()`);
  const won=await c.eval(`document.getElementById('resTitle').textContent`);
  ok('crossing the level-10 gate announces new music', won!=='WIN' || /♪/.test(un||''), `${won}: ${un}`);
  await c.shot(S+'ui_unlock.png');
  // Settings lists the whole soundtrack with lock state.
  await c.eval(`document.getElementById('btnResult').click()`); await c.frames(6);
  await c.eval(`document.getElementById('btnSettings').click()`); await c.frames(6);
  const list=await c.eval(`(()=>{const rows=[...document.querySelectorAll('#setRows .r')];
    return {total:rows.length, locked:rows.filter(r=>r.classList.contains('lockedrow')).length,
            sets:rows.filter(r=>r.classList.contains('trackrow')&&!r.querySelector('[data-mute]')).length,
            heads:[...document.querySelectorAll('.musichead')].map(h=>h.textContent)};})()`);
  // 10 fight tracks plus the 4 set pieces. The set pieces were missing from this list, which
  // read as "there is more music in this game than the settings panel admits to".
  ok('settings lists the whole soundtrack', list.total===14, JSON.stringify(list));
  ok('the set pieces are listed too', list.sets===4, `${list.sets} un-mutable rows`);
  ok('locked tracks are shown as locked', list.locked>0 && list.locked<10, `${list.locked} locked`);
  await c.shot(S+'ui_soundtrack.png');
  console.log(c.errors.length?'\nERRORS '+c.errors.slice(0,4).join(' | '):'\nno console errors');
} finally { c.close(); srv.close(); }
console.log(`\n${fail?fail+' fail':'all pass'}`);
process.exit(fail?1:0);
