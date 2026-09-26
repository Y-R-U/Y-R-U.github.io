import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
import {MISSIONS} from '../js/data/missions.mjs';
const p=await connect(),report={checks:[],missions:[],screens:[]},dir='docs/evidence/';
const pass=s=>{report.checks.push(s);console.log('PASS',s);};
async function touch(x,y){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(65);}
async function click(sel){const r=await p.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw Error('Missing '+${JSON.stringify(sel)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await touch(r.x,r.y);}
async function march(x,z){const r=await p.eval(`tinpotTest.project(${x},${z})`);await touch(r.x,r.y);}
async function state(){return p.eval('tinpotTest.advance(0)');}
async function shot(n){await p.shot(dir+n+'.png');report.screens.push(n);}
async function boot(){await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');}
try{
 await boot();await p.eval('tinpotTest.mission(7,500)');await p.eval('tinpotTest.complete()');await sleep(150);
 assert.equal((await state()).mode,'battle');assert.equal((await state()).campaign.pendingRoutes.length,2);await shot('story-crossroads');
 await click('[data-kind="depot"]');await p.eval('tinpotTest.advance(180)');await sleep(100);assert.ok((await state()).field.depotReady);await click('[data-kind="depot"]');assert.equal((await state()).mode,'depot');
 await shot('story-depot');const before=(await state()).campaign.credits;await click('[data-action="buy"][data-id="armour"]');assert.equal((await state()).campaign.credits,before-70);assert.equal((await state()).units[0].maxHp,125);pass('real touch reaches depot and upgrade changes living squad');
 await click('[data-action="settings"]');const frozen=(await state()).time;await sleep(350);assert.equal((await state()).time,frozen);await click('[data-action="settings-close"]');assert.equal((await state()).mode,'depot');pass('depot audio settings preserve paused field');
 await click('[data-action="save-exit"]');assert.equal((await state()).mode,'title');await boot();await click('[data-action="start"]');assert.equal((await state()).mission.id,7);assert.equal((await state()).mission.status,'intermission');assert.equal((await state()).campaign.pendingRoutes.length,2);pass('save/exit/reload resumes unresolved crossroads');
 // Walk to the ledger exit and confirm with its own physical button.
 for(let i=0;i<10&&(await state()).mission.id===7;i++){await click('[data-route="10"]');await p.eval('tinpotTest.advance(120)');await sleep(90);}
 assert.equal((await state()).mission.id,10);assert.ok((await state()).campaign.flags.ledger);pass('walking to and confirming a route records the selected story');
 // Controls at short and normal phone sizes; optional depot scrolls instead of overlapping.
 for(const [width,height] of [[320,568],[390,844],[430,932]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await p.eval('tinpotTest.mission(7,500);tinpotTest.complete();tinpotTest.move(0,5);tinpotTest.advance(180)');await sleep(120);
  const bounds=await p.eval(`[...document.querySelectorAll('#field-ui button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}})`);
  const exits=bounds.slice(1);if(exits.length===2)assert.ok(exits[0].r+4<=exits[1].x,'route buttons overlap');
  for(const r of bounds){assert.ok(r.w>=44&&r.h>=44&&r.x>=0&&r.y>=0&&r.r<=width&&r.b<=height,JSON.stringify(r));}
  const collisions=await p.eval(`(()=>{const field=[...document.querySelectorAll('#field-ui button')].map(b=>b.getBoundingClientRect()),hud=[...document.querySelectorAll('#hud button')].map(b=>b.getBoundingClientRect());return field.flatMap(a=>hud.filter(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top).map(b=>({field:{x:a.x,y:a.y},hud:{x:b.x,y:b.y}})));})()`);assert.deepEqual(collisions,[],'field controls must not overlap weapon/squad controls');
  assert.equal(await p.eval('document.documentElement.scrollWidth'),width);await shot('story-field-'+width);
  await click('[data-kind="depot"]');assert.equal((await state()).mode,'depot');await shot('story-shop-'+width);await click('[data-action="depot-close"]');assert.equal((await state()).mode,'battle');
 }
 pass('field controls and scrollable depot work at 320×568, 390×844, 430×932');
 // Unassisted combat: every objective on the village / radio route, only real ground touches.
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await p.eval('tinpotTest.mission(6,500);Object.assign(tinpotTest.taught(),{move:true,grenade:true,split:true})');
 let s=await state(),seen=new Set(),lastId=-1;
 for(let turn=0;turn<1200&&s.mode==='battle';turn++){
  const m=s.mission;
  if(!seen.has(m.id)){seen.add(m.id);await shot('story-operation-'+m.id);console.log('PLAY',m.id,m.title);}
  if(m.status==='intermission'){
   const routes=s.campaign.pendingRoutes;
   if(routes?.length===1&&MISSIONS[routes[0].to].map===m.map){s=await p.eval('tinpotTest.advance(120)');continue;}
   const next=routes.length>1?(m.id===7?8:16):routes[0].to;await click('[data-route="'+next+'"]');s=await p.eval('tinpotTest.advance(120)');await sleep(80);continue;
  }
  const lead=s.units.find(u=>u.team==='blue'&&!u.escort&&u.hp>0);if(!lead)break;
  if(m.type==='clear'){const enemy=s.units.filter(u=>u.team==='red'&&u.hp>0).sort((a,b)=>Math.hypot(a.x-lead.x,a.z-lead.z)-Math.hypot(b.x-lead.x,b.z-lead.z))[0];if(enemy)await march(enemy.x,enemy.z+5);}
  const goal=m.goal||{x:-1,z:-19};
  if(m.type==='reach')await march(goal.x,goal.z);
  if(m.type==='escort'){const e=s.units.find(u=>u.escort);if(Math.hypot(lead.x-e.x,lead.z-e.z)>5)await march(e.x,e.z-2);else await march(goal.x,Math.max(goal.z,e.z-4));}
  s=await p.eval('tinpotTest.advance(90)');await sleep(30);
 }
 assert.equal(s.mode,'debrief',JSON.stringify(s.mission));assert.equal(s.mission.id,23);assert.equal(s.mission.status,'victory');assert.equal(s.campaign.history.filter(r=>r.win).length,14);assert.equal(s.campaign.choices.length,2);report.missions=s.campaign.history;await shot('story-ending');pass('14 real combat objectives and both route choices reach the story ending');
 // Visit every new territory for visual review and renderer failures.
 for(const id of [8,10,12,14,16,18,21]){await p.eval(`tinpotTest.mission(${id},0)`);await sleep(150);await shot('story-territory-'+id);}
 assert.deepEqual(p.errors,[]);assert.ok(p.requests.every(r=>!r.url.startsWith('http')||r.url.startsWith(new URL(BASE).origin)));pass('all new territories render without browser, network or shader errors');
}catch(e){report.error=e.stack;report.snapshot=await state();await shot('story-failure');throw e;}finally{await writeFile(dir+'story-browser.json',JSON.stringify(report,null,2));await p.close();}
