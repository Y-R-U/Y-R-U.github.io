import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {ATLAS} from '../js/core/content.mjs';
import {connect,BASE} from './cdp.mjs';
const evidence=new URL('../docs/evidence/',import.meta.url).pathname,report={date:new Date().toISOString(),landmarks:[]};
const p=await connect();
async function click(id){const r=await p.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
const held=new Set();async function keys(wanted){for(const code of new Set([...held,...wanted]))if(held.has(code)!==wanted.includes(code)){const down=wanted.includes(code);await p.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:code.slice(3).toLowerCase(),code});if(down)held.add(code);else held.delete(code);}}
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');await p.eval('sunwakeTest.restartVoyage()');
 // No pose/teleport after restart: real W/A/S/D dispatch drives the production helm.
 const key=ATLAS[0];let ticks=0;
 for(;ticks<6000;ticks+=15){const s=await p.eval('sunwake');if(s.exploration.atlasIds.includes(key.id))break;
  const d=Math.hypot(key.x-s.x,key.z-s.z),err=Math.atan2(Math.sin(Math.atan2(key.x-s.x,key.z-s.z)-s.yaw),Math.cos(Math.atan2(key.x-s.x,key.z-s.z)-s.yaw)),speed=Math.hypot(s.vx,s.vz),target=d>key.radius+62?8:d>key.radius+18?1.7:0;
  const wanted=[];if(err>.035)wanted.push('KeyD');if(err<-.035)wanted.push('KeyA');if(speed<target-.15)wanted.push('KeyW');else if(speed>target+.4)wanted.push('KeyS');await keys(wanted);await p.eval('sunwakeTest.advance(15)');
  if(ticks===1200)await p.shot(evidence+'m6-first-sail.png');
 }
 await keys([]);assert.ok(ticks<6000);report.firstSail={seconds:ticks/60,snapshot:await p.eval('sunwake')};await p.shot(evidence+'m6-lantern-discovered.png');
 for(const page of ATLAS.slice(1)){
  await p.eval(`sunwakeTest.setPose({x:${page.x+page.radius+22},z:${page.z},yaw:-Math.PI/2});sunwakeTest.resumeTime()`);
  await p.wait(`sunwake.exploration.atlasIds.includes('${page.id}')`,30000);
  // Freeze after real RAF dwell; don't move or change the discovery state.
  await p.eval('sunwakeTest.advance(0)');await p.shot(evidence+'m6-'+page.art+'.png');
  report.landmarks.push({name:page.landmark,snapshot:await p.eval('sunwake')});
 }
 assert.equal(await p.eval('sunwake.exploration.atlasIds.length'),6);assert.equal(await p.eval('sunwake.mode'),'chart');
 await p.shot(evidence+'m6-atlas-complete.png');await p.eval("document.getElementById('chart').scrollTop=450");await p.shot(evidence+'m6-postcards.png');
 await click('chart-close'); // sticky header keeps the close action reachable after scrolling
 assert.equal(await p.eval('sunwake.mode'),'water');
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'});const before=await p.eval('sunwake');await p.eval('sunwakeTest.advance(180)');await p.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'});const after=await p.eval('sunwake');assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>2);
 await p.eval('sunwakeTest.save()');const saved=await p.eval("JSON.parse(localStorage.getItem('sunwake-v1'))");await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');const loaded=await p.eval('sunwake');assert.equal(loaded.exploration.atlasIds.length,6);assert.ok(Math.hypot(loaded.x-saved.position.x,loaded.z-saved.position.z)<.001);assert.equal(loaded.vx,0);assert.equal(loaded.vz,0);report.reload=loaded;
 // Inject on the next document, after pagehide's legitimate save.
 const injection=await p.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('sunwake-v1','{broken');"});await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');assert.equal(await p.eval('sunwake.exploration.atlasIds.length'),0);assert.match(await p.eval("document.getElementById('notice').textContent"),/unreadable/);await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
 // Storage denial must leave a playable launch.
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:"Storage.prototype.getItem=function(){throw new Error('denied')};Storage.prototype.setItem=function(){throw new Error('denied')};"});await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');await click('start');await click('pause');assert.equal(await p.eval('sunwake.mode'),'paused');assert.match(await p.eval("document.getElementById('notice').textContent"),/session/);
 assert.deepEqual(p.errors,[]);report.errors=p.errors;report.passed=true;console.log('PASS M6 real-input first sail, six discoveries, completion, persistence, corrupt/denied storage');
}catch(e){report.failure=e.stack;throw e;}finally{await writeFile(evidence+'m6-browser.json',JSON.stringify(report,null,2));await p.close();}
