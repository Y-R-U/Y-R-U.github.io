import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const c=await CDP.launch({gpu:true});
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const out=process.env.TRANSPORT_OUTPUT_DIR||fileURLToPath(new URL('../docs/verification/',import.meta.url));mkdirSync(out,{recursive:true});const checks=[];
async function touch(selector){await c.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await c.frames(4);const p=await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,hit:!!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(${JSON.stringify(selector)}),disabled:e.disabled}})()`);assert(!p.disabled,selector+' enabled');assert(p.hit,selector+' receives touch');await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.frames(5);return p;}
async function capture(name){await c.eval(`document.querySelector('#toast-stack').style.opacity='0'`);const{data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(data,'base64'));}
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('transport2?.game?.freightInfo',20000));
 assert.equal(await c.eval('transport2.game.state.freight.completed'),0);assert.equal(await c.eval('transport2.game.freightInfo().offers.length'),0);checks.push('fresh company has no unearned freight jobs or equipment');
 await c.eval(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.cash=10000;for(const id of ['grain','timber','stone']){s.routes[id].unlocked=true;s.routes[id].manager=true;}transport2.game.importSave(JSON.stringify(s));window.__freightTick=transport2.game.tick;transport2.game.tick=()=>{};})()`);
 await touch('[data-tab=fleet]');await touch('[data-action=freightStart][data-id=grain]');assert.equal(await c.eval('transport2.game.freightInfo().status'),'active');checks.push('priority assignment starts through the visible Fleet control');
 await c.eval(`transport2.game.state.routes.grain.progress=.5;transport2.game.action('quality',transport2.game.state.settings.quality)`);assert.equal(await c.eval("transport2.game.action('freightLoad').ok"),false);checks.push('priority cargo cannot be loaded while truck is travelling');
 await c.eval(`transport2.game.state.routes.grain.progress=0;transport2.game.action('quality',transport2.game.state.settings.quality);document.querySelector('#operations-scroll').scrollTop=0`);await c.frames(15);await capture('priority-job-phone');
 const cash=await c.eval('transport2.game.state.cash');const target=await touch('#freight-action');assert(target.width>=44&&target.height>=44);assert.equal(await c.eval('transport2.game.freightInfo().active.priorityLoads'),1);assert.equal(await c.eval('transport2.game.state.cash'),cash);checks.push('44px scene control loads priority cargo without earning a scene tap');
 assert.equal(await c.eval("transport2.game.action('freightLoad').ok"),false);checks.push('priority load is single use');
 for(let i=0;i<3;i++)await c.eval(`window.__freightTick(transport2.game.stats('grain').duration)`);
 await c.frames(8);assert.equal(await c.eval('transport2.game.freightInfo().canClaim'),true);await capture('priority-complete-phone');
 await touch('#freight-action');assert.equal(await c.eval('transport2.game.state.freight.completed'),1);assert.equal(await c.eval("transport2.game.state.inventory.includes('dispatch-pennant')"),true);assert.equal(await c.eval("transport2.game.action('freightClaim').ok"),false);checks.push('three real delivery cycles yield a permanent tool and one reward claim');
 await touch('[data-info=grain]');await touch('[data-action=equip][data-id="dispatch-pennant|business:grain"]');assert.deepEqual(await c.eval('transport2.game.state.equipment.businesses.grain'),['dispatch-pennant']);checks.push('earned freight tool attaches through business information');
 await touch('#route-dialog .close-dialog');
 for(const [w,h]of [[320,740],[390,844],[430,844]]){
  await c.viewport(w,h,1,true);await c.eval(`transport2.game.action('freightStart','grain');transport2.game.state.routes.grain.progress=0;transport2.game.action('quality',transport2.game.state.settings.quality);document.querySelector('#operations-scroll').scrollTop=120`);await c.frames(8);
  const layout=await c.eval(`(()=>{const e=document.querySelector('#freight-action'),r=e.getBoundingClientRect(),hero=document.querySelector('.hero-panel').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,w:r.width,h:r.height,inside:r.top>=hero.top&&r.bottom<=hero.bottom,chip:document.querySelector('#freight-chip').getBoundingClientRect().toJSON(),hero:hero.toJSON()}})()`);assert(!layout.overflow);assert(layout.w>=44&&layout.h>=44&&layout.inside,JSON.stringify(layout));
 }
 checks.push('active job control remains visible and usable in all three folded portrait sizes');
 await c.eval('transport2.game.tick=window.__freightTick;delete window.__freightTick');assert.equal(c.errors.length,0,c.errors.join('\n'));writeFileSync(out+'/freight-browser-report.json',JSON.stringify({url,checks,errors:c.errors},null,2));console.log(JSON.stringify(checks));
}finally{c.close();}
