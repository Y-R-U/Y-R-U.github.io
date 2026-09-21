import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
const evidence=new URL('../docs/evidence/',import.meta.url).pathname,report={date:new Date().toISOString(),missions:[],screens:[],performance:[]};
const p=await connect();
async function touch(x,y){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(60);}
async function click(selector){const r=await p.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await touch(r.x,r.y);}
async function march(x,z){const r=await p.eval(`tinpotTest.project(${x},${z})`);assert.ok(r.x>0&&r.x<390&&r.y>0&&r.y<844,'march target is on screen');await touch(r.x,r.y);}
async function shot(name){await p.shot(evidence+name+'.png');report.screens.push(name);}
try{
 await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('title')");await sleep(150);await click('[data-action="start"]');await shot('m9-first-orders');await click('[data-action="deploy"]');
 for(let mission=0;mission<6;mission++){
  let s=await p.eval('tinpotTest.advance(0)');assert.equal(s.mission.id,mission);await shot('m9-mission-'+(mission+1)+'-start');
  for(let i=0;i<100&&s.mode==='battle';i++){
   const lead=s.units.find(u=>u.team==='blue'&&!u.escort&&u.hp>0),m=s.mission;
   if(m.type==='clear'){const enemy=s.units.filter(u=>u.team==='red'&&u.hp>0).sort((a,b)=>Math.hypot(a.x-lead.x,a.z-lead.z)-Math.hypot(b.x-lead.x,b.z-lead.z))[0];if(enemy)await march(enemy.x,enemy.z+5);}
   if(m.type==='reach')await march(0,-20);
   if(m.type==='escort'){const escort=s.units.find(u=>u.escort);if(escort){if(Math.hypot(lead.x-escort.x,lead.z-escort.z)>5)await march(escort.x,escort.z-2);else await march(-2,Math.max(-19,escort.z-4));}}
   s=await p.eval('tinpotTest.advance(90)');
  }
  assert.equal(s.mode,'debrief');assert.equal(s.mission.status,'victory',JSON.stringify(s));report.missions.push(s.campaign.history.at(-1));await shot('m9-mission-'+(mission+1)+'-victory');console.log('PASS campaign mission',mission+1,s.mission.title);
  if(mission<5){await click('[data-action="next"]');if(mission===0)await click('[data-action="buy"][data-id="armour"]');if(mission===1)await click('[data-action="buy"][data-id="slots"]');if(mission===2)await click('[data-action="buy"][data-id="rifle"]');await shot('m9-barracks-'+(mission+1));await click('[data-action="briefing"]');await click('[data-action="deploy"]');
   // V3: from A Slight Detour one man carries the flamer for the rest of the campaign. If that
   // makes a mission unwinnable it is a balance bug, not a harness problem.
   if(mission===2){const kit=await p.eval('tinpotTest.advance(0)');assert.ok(kit.equipped.includes('flamer'),'flamer must unlock at mission 4: '+JSON.stringify(kit.equipped));await click('.pip[data-id="0"][data-weapon="flamer"]');assert.equal((await p.eval('tinpotTest.advance(0)')).units[0].weapon,'flamer','the third pip must actually equip it');await shot('v3-flamer-equipped');}}
 }
 assert.equal((await p.eval('tinpotTest.advance(0)')).campaign.mission,6);
 // V2 instant retry: lose on purpose, and get back on the field in one tap at every width.
 for(const [width,height] of [[320,740],[390,844],[430,932]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
  await p.eval("tinpotTest.fixture('campaign')");await sleep(150);
  const deployed=await p.eval('tinpotTest.advance(0)');assert.equal(deployed.mode,'battle');
  const man=deployed.campaign.roster[0];assert.ok(man.alive,'negative control: he starts the mission alive');
  await p.eval('tinpotTest.smite()');const lost=await p.eval('tinpotTest.advance(4)');
  assert.equal(lost.mode,'debrief');assert.equal(lost.mission.status,'defeat');
  assert.equal(lost.campaign.roster[0].alive,false,'negative control: losing really does bury him');
  const buttons=await p.eval(`[...document.querySelectorAll('#screens .screen-bottom button')].map(b=>{const r=b.getBoundingClientRect();return {action:b.dataset.action,w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);
  assert.ok(buttons.some(b=>b.action==='retry-mission'),'defeat debrief must offer a retry: '+JSON.stringify(buttons));
  for(const b of buttons){assert.ok(b.w>=44&&b.h>=44,JSON.stringify(b));assert.ok(b.x>=0&&b.y>=0&&b.right<=width+.1&&b.bottom<=height+.1,JSON.stringify(b));}
  if(width===390)await shot('v2-defeat-retry');
  await click('[data-action="retry-mission"]');
  const again=await p.eval('tinpotTest.advance(0)');
  assert.equal(again.mode,'battle','retry must put you straight back on the field');
  assert.equal(again.mission.id,0);
  assert.equal(again.campaign.roster[0].alive,true,'and the pre-mission roster must be intact');
  assert.equal(again.campaign.history.length,0,'the failed attempt is not kept on the record');
  assert.ok(again.units.filter(u=>u.team==='blue'&&u.hp>0).length>0);
  report.screens.push('retry@'+width);
 }
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 // A fresh title and a four-man, two-weapon battlefield at each phone width.
 for(const [width,height] of [[320,740],[390,844],[430,932]]){await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await p.eval("tinpotTest.fixture('m5')");await sleep(200);const rects=await p.eval(`[...document.querySelectorAll('#hud button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.ariaLabel,w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);for(const r of rects){assert.ok(r.w>=44&&r.h>=44,JSON.stringify(r));assert.ok(r.x>=0&&r.y>=0&&r.right<=width+.1&&r.bottom<=height+.1,JSON.stringify(r));}assert.equal(await p.eval('document.documentElement.scrollWidth'),width);const visibility=await p.eval(`(()=>{const top=document.querySelector('.unit-cards').getBoundingClientRect().top;return tinpot.units.filter(u=>u.team==='blue').map(u=>({point:tinpotTest.project(u.x,u.z),top}));})()`);for(const v of visibility)assert.ok(v.point.y<v.top-10,'deployed soldier hidden behind cards: '+JSON.stringify(v));await shot('m9-phone-'+width);}
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.eval("tinpotTest.fixture('title')");await p.send('Emulation.setCPUThrottlingRate',{rate:4});await sleep(1000);
 report.browser=await p.send('Browser.getVersion');report.gpu=await p.eval(`(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)})()`);
 report.performance.push(await p.eval(`new Promise(resolve=>{const times=[];let last=performance.now();function sample(now){times.push(now-last);last=now;if(times.length<240)requestAnimationFrame(sample);else{times.shift();times.sort((a,b)=>a-b);resolve({profile:'390x844 DPR2, CPU 4x throttle, real-time live title battle',fps:1000/(times.reduce((a,b)=>a+b)/times.length),medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],graphics:tinpot.graphics});}}requestAnimationFrame(sample);})`,30000));assert.ok(report.performance[0].fps>=55&&report.performance[0].p95Ms<=25,'performance below profile gate');await p.send('Emulation.setCPUThrottlingRate',{rate:1});await shot('m9-title-final');
 const jpg=await p.send('Page.captureScreenshot',{format:'jpeg',quality:90});await writeFile(evidence+'tinpot.jpg',Buffer.from(jpg.data,'base64'));
 assert.deepEqual(p.errors,[],'Console/network/shader errors');assert.ok(p.requests.every(r=>!r.url.startsWith('http')||r.url.startsWith(new URL(BASE).origin)),'No external requests');report.errors=p.errors;report.passed=true;console.log(JSON.stringify(report.performance));
}catch(e){report.error=e.stack;report.snapshot=await p.eval('window.tinpot');await p.shot(evidence+'m9-failure.png');throw e;}finally{await writeFile(evidence+'release.json',JSON.stringify(report,null,2));await p.close();}
