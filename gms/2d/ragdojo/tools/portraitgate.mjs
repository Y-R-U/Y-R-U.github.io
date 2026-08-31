#!/usr/bin/env node
/**
 * Portrait shows the landscape game rotated rather than a blocking prompt, and touch still
 * lands where it should through that rotation. The CSS transform and Input.localPoint must
 * stay in step; this is what catches them drifting apart.
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const S = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots') + '/';
const srv=await serveWithUpload(); const c=await CDP.launch();
let fail=0; const ok=(n,v,x='')=>{v?0:fail++;console.log(`${v?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`)};
try{
  // A portrait phone.
  await c.viewport(390, 844, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode==="fight"',20000);
  await c.frames(20);
  const geo = await c.eval(`(()=>{const a=document.getElementById('app'), cv=document.getElementById('game');
    return {appW:a.clientWidth, appH:a.clientHeight, vw:innerWidth, vh:innerHeight,
            canvasW:cv.clientWidth, canvasH:cv.clientHeight,
            rotated:matchMedia('(orientation: portrait) and (max-width: 860px)').matches,
            hint:document.getElementById('rotate').classList.contains('show')};})()`);
  ok('portrait renders the game in landscape', geo.canvasW > geo.canvasH, JSON.stringify(geo));
  ok('app fills the screen sideways', geo.appW === geo.vh && geo.appH === geo.vw);
  ok('rotate hint is shown but not blocking', geo.hint);
  await c.shot(S+'ui_portrait.png');

  // The stick must still work through the rotation.
  await c.eval(`window.__ragdojo.match.brains.length=0`);
  await c.frames(10);
  const x0 = await c.eval(`window.__ragdojo.match.player.x`);
  // Element-local stick base -> screen coords via the same transform the CSS applies.
  const pt = await c.eval(`(()=>{const h=innerHeight,w=innerWidth;
    const eh=w, ew=h;                       // element is 100vh x 100vw
    const r=Math.min(84, eh*0.21), lx=r+26, ly=eh-r-20;
    return {sx: w - ly, sy: lx, lx, ly};})()`);
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt.sx,y:pt.sy}]});
  // Drag "right" in element space = +lx = +screenY.
  await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt.sx,y:pt.sy+60}]});
  await c.frames(35);
  const x1 = await c.eval(`window.__ragdojo.match.player.x`);
  const knob = await c.eval(`JSON.stringify(window.__ragdojo && null)`);
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  ok('stick works through the rotation', x1 > x0 + 8, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);

  // And landscape must be untouched.
  await c.viewport(844, 390, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode==="fight"',20000);
  await c.frames(15);
  const land = await c.eval(`(()=>{const a=document.getElementById('app');
    return {appW:a.clientWidth, vw:innerWidth, hint:document.getElementById('rotate').classList.contains('show'),
            rotated:matchMedia('(orientation: portrait) and (max-width: 860px)').matches};})()`);
  ok('landscape is unaffected', land.appW === land.vw && !land.rotated && !land.hint, JSON.stringify(land));
  const lx0 = await c.eval(`window.__ragdojo.match.player.x`);
  await c.eval(`window.__ragdojo.match.brains.length=0`); await c.frames(8);
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:108,y:288}]});
  await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:170,y:288}]});
  await c.frames(35);
  const lx1 = await c.eval(`window.__ragdojo.match.player.x`);
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  ok('landscape stick still works', lx1 > lx0 + 8, `${lx0.toFixed(0)} -> ${lx1.toFixed(0)}`);
  console.log(c.errors.length?'\nERRORS '+c.errors.slice(0,4).join(' | '):'\nno console errors');
} finally { c.close(); srv.close(); }
console.log(fail?`\n${fail} fail`:'\nall pass');
process.exit(fail?1:0);
