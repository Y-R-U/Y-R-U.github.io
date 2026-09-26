import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
const p=await connect(),report={};
async function touch(x,y){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);}
async function click(sel){const r=await p.eval(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await touch(r.x,r.y);}
try{
 await p.goto(BASE+'?test=1',{width:320,height:568,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
 await p.eval('tinpotTest.mission(7,500);tinpotTest.complete();tinpotTest.move(0,5);tinpotTest.advance(180)');await sleep(100);
 report.overlapNegativeControl=await p.eval(`(()=>{const [a,b]=document.querySelectorAll('.exit-spot'),before=b.style.left;b.style.left=a.style.left;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();const bad=x.right+4>y.left;b.style.left=before;return bad;})()`);assert.ok(report.overlapNegativeControl,'overlap gate rejects deliberately colliding labels');
 await p.shot('docs/evidence/story-final-320.png');await click('[data-kind="depot"]');assert.equal(await p.eval('tinpot.mode'),'depot');
 await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:270,y:460}]});
 for(let i=1;i<=12;i++){await p.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:270,y:460-i*23}]});await sleep(18);}
 await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(300);
 report.swipeScroll=await p.eval('document.querySelector(".field-sheet").scrollTop');assert.ok(report.swipeScroll>80,'real touch swipe scrolls depot');
 const close=await p.eval('(()=>{const r=document.querySelector(".depot-dismiss").getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()');assert.ok(close.top>=0&&close.bottom<=568);await click('.depot-dismiss');assert.equal(await p.eval('tinpot.mode'),'battle');
 await p.eval('tinpotTest.mission(23,0);tinpotTest.complete()');await sleep(150);assert.equal(await p.eval('tinpot.mode'),'debrief');assert.ok(await p.eval('!!document.querySelector(".ending-sheet")'));await p.shot('docs/evidence/story-ending-320.png');
 assert.ok(await p.eval('document.querySelector(".ending-sheet").scrollWidth<=document.querySelector(".ending-sheet").clientWidth'));
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.eval('tinpotTest.mission(18,0)');await sleep(300);await p.send('Emulation.setCPUThrottlingRate',{rate:4});
 report.performance=await p.eval(`new Promise(resolve=>{const times=[];let last=performance.now();function sample(now){times.push(now-last);last=now;if(times.length<240)requestAnimationFrame(sample);else{times.shift();times.sort((a,b)=>a-b);resolve({profile:'Ministry battle / M5 ANGLE Metal / CPU4x / 390x844 DPR2',fps:1000/(times.reduce((a,b)=>a+b)/times.length),p95Ms:times[Math.floor(times.length*.95)],graphics:tinpot.graphics});}}requestAnimationFrame(sample);})`,30000);
 assert.ok(report.performance.fps>=55&&report.performance.p95Ms<=25,JSON.stringify(report.performance));await p.send('Emulation.setCPUThrottlingRate',{rate:1});assert.deepEqual(p.errors,[]);console.log(JSON.stringify(report));
}finally{await writeFile('docs/evidence/story-polish.json',JSON.stringify(report,null,2));await p.close();}
