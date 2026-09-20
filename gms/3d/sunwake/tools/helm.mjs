import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect,BASE} from './cdp.mjs';
const evidence=fileURLToPath(new URL('../docs/evidence/',import.meta.url));await mkdir(evidence,{recursive:true});
const report={date:new Date().toISOString(),cases:[]};

// CDP touch, exactly as STATE.md's gotchas require:
//  - touchEnd names the points being LIFTED, not the ones left behind
//  - touchCancel must be sent with an EMPTY array
//  - pointer moves are coalesced onto rAF, so wait two frames after every dispatch
function helper(p){
  const touches=new Map();
  const settle=()=>p.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const send=async(type,points)=>{await p.send('Input.dispatchTouchEvent',{type,touchPoints:points});await settle();};
  return {
    async start(id,x,y){touches.set(id,{id,x,y});await send('touchStart',[...touches.values()].map(t=>({id:t.id,x:t.x,y:t.y})));},
    async move(id,x,y){const t=touches.get(id);t.x=x;t.y=y;await send('touchMove',[...touches.values()].map(t=>({id:t.id,x:t.x,y:t.y})));},
    async end(id){const t=touches.get(id);touches.delete(id);await send('touchEnd',[{id:t.id,x:t.x,y:t.y}]);},
    async cancel(){touches.clear();await send('touchCancel',[]);},
  };
}

// A phone reports coarse pointers and real touch points; without this the page
// cannot tell it is on a touch device and never offers the thumb hints.
const asPhone=async(p,size,fresh=false)=>{
  await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  // Clear BEFORE any page script runs. Clearing after boot and reloading does
  // NOT work: the game saves on `pagehide`, so navigating away immediately
  // writes the settings back and the next orientation inherits them.
  let injected=null;
  if(fresh)injected=(await p.send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear()}catch{}'})).identifier;
  await p.goto(BASE+'?test=1',size);
  if(injected){await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__');await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});}
};

const metrics={portrait:{width:390,height:844,deviceScaleFactor:3,mobile:true},
               landscape:{width:844,height:390,deviceScaleFactor:3,mobile:true}};

async function run(){
 // A fresh tab per orientation. Repeated navigations in one tab on SwiftShader
 // eventually fail to bring a WebGL2 context back, which looks like a game bug
 // and is not one.
 for(const [orientation,size] of Object.entries(metrics)){
  const p=await connect();
  try{
   await asPhone(p,size,true);
   await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__');
   assert.equal(await p.eval('window.__SUNWAKE_BOOTED__'),true,await p.eval('window.__SUNWAKE_FAILED__'));
   await p.eval(`document.getElementById('start').click()`);
   const t=helper(p);
   const W=size.width,H=size.height;

   // No permanent chrome, and the first-play hints are up.
   let s=await p.eval('sunwake.helm');
   assert.equal(s.scheme,'invisible',orientation+': invisible helm is not the default');
   assert.equal(s.zonesVisible,true,orientation+': the touch zones are not live');
   assert.equal(s.buttonsVisible,false,orientation+': the visible helm buttons are still on screen');
   assert.equal(await p.eval(`getComputedStyle(document.querySelector('.rudder-wrap')).display`),'none',orientation+': rudder button still rendered');
   assert.equal(await p.eval(`getComputedStyle(document.querySelector('.throttle-wrap')).display`),'none',orientation+': throttle buttons still rendered');
   assert.equal(s.hintsVisible,true,orientation+': first-play thumb hints are not shown');
   await p.shot(evidence+`p1-${orientation}-hints.png`);

   // Left half: a rudder appears where the thumb lands, anywhere.
   const lx=Math.round(W*0.22),ly=Math.round(H*0.72);
   await t.start(1,lx,ly);
   assert.equal((await p.eval('sunwake.input')).steer,0,orientation+': a bare touch already has rudder on');
   assert.equal(await p.eval(`document.getElementById('zone-steer').classList.contains('live')`),true,orientation+': the floating rudder did not appear');
   await t.move(1,lx+56,ly);
   let input=await p.eval('sunwake.input');
   assert.ok(input.steer>.85,`${orientation}: sliding right gave steer ${input.steer}`);
   await t.move(1,lx-56,ly);
   input=await p.eval('sunwake.input');
   assert.ok(input.steer<-.85,`${orientation}: sliding left gave steer ${input.steer}`);
   const readout=await p.eval(`document.getElementById('zone-steer').dataset.readout`);
   assert.match(readout,/PORT/,orientation+': rudder readout wrong: '+readout);

   // Right half: pressing is AHEAD, sliding down eases off and reverses.
   const rx=Math.round(W*0.78),ry=Math.round(H*0.72);
   await t.start(2,rx,ry);
   input=await p.eval('sunwake.input');
   assert.ok(input.throttle>.95,`${orientation}: pressing the right half gave throttle ${input.throttle}`);
   assert.ok(input.steer<-.85,`${orientation}: the second thumb disturbed the rudder (${input.steer})`);
   await t.move(2,rx,ry+80);
   input=await p.eval('sunwake.input');
   assert.ok(Math.abs(input.throttle)<.15,`${orientation}: sliding down 80 px gave throttle ${input.throttle}, expected about stop`);
   await t.move(2,rx,ry+160);
   input=await p.eval('sunwake.input');
   assert.ok(input.throttle<-.85,`${orientation}: sliding down 160 px gave throttle ${input.throttle}, expected astern`);
   assert.match(await p.eval(`document.getElementById('zone-throttle').dataset.readout`),/ASTERN/);
   await p.shot(evidence+`p1-${orientation}-live.png`);

   // Having steered AND used throttle, the hints go — and stay gone in the save.
   await p.eval('new Promise(r=>setTimeout(r,900))');
   s=await p.eval('sunwake.helm');
   assert.equal(s.used.steer,true);assert.equal(s.used.throttle,true);
   assert.equal(s.hintsVisible,false,orientation+': hints did not fade after using both controls');
   assert.equal(s.hintsDone,true,orientation+': the hints-done flag was not set');
   assert.equal(await p.eval(`JSON.parse(localStorage.getItem('sunwake-v1')).settings.helmHintsDone`),true,orientation+': hints-done was not persisted');

   // touchEnd names the point being lifted. Lifting the rudder must release it
   // and leave the throttle thumb alone.
   await t.end(1);
   input=await p.eval('sunwake.input');
   assert.equal(input.steer,0,orientation+': the released rudder stayed stuck on');
   assert.ok(input.throttle<-.85,orientation+': lifting one finger released the other');
   assert.equal(await p.eval(`document.getElementById('zone-steer').classList.contains('live')`),false,orientation+': the rudder ring is still drawn after release');
   await t.end(2);
   input=await p.eval('sunwake.input');
   assert.equal(input.throttle,0,orientation+': the released throttle stayed stuck on');

   // touchCancel takes an empty array, and must clear everything.
   await t.start(3,lx,ly);await t.move(3,lx+56,ly);
   assert.ok((await p.eval('sunwake.input')).steer>.85);
   await t.cancel();
   input=await p.eval('sunwake.input');
   assert.equal(input.steer,0,orientation+': touchCancel left the rudder on');
   assert.equal(await p.eval(`document.getElementById('zone-steer').classList.contains('live')`),false);

   // The boat actually moves under this scheme.
   await p.eval(`sunwakeTest.setPose({})`);
   await t.start(4,rx,ry);
   const before=await p.eval('sunwakeTest.advance(0)');
   await p.eval('sunwakeTest.setInput(null)');
   const after=await p.eval('sunwakeTest.advance(240)');
   const ran=Math.hypot(after.x-before.x,after.z-before.z);
   const way=after.vx*Math.sin(after.yaw)+after.vz*Math.cos(after.yaw);
   // From rest a 420 kg launch covers ~14 m in four seconds and is still
   // accelerating, so assert both the ground covered and the speed reached.
   assert.ok(ran>12,`${orientation}: four seconds of held throttle moved the boat ${ran.toFixed(1)} m`);
   assert.ok(way>5,`${orientation}: four seconds of held throttle reached only ${way.toFixed(2)} m/s`);
   report.cases.push({orientation,heldThrottleMetres:+ran.toFixed(1),heldThrottleSpeed:+way.toFixed(2)});
   await t.end(4);

   // Reload: hints stay gone, scheme persists, and the visible helm is a setting.
   await asPhone(p,size);
   await p.wait('window.__SUNWAKE_BOOTED__');
   await p.eval(`document.getElementById('start').click()`);
   s=await p.eval('sunwake.helm');
   assert.equal(s.hintsVisible,false,orientation+': the hints came back after a reload');
   assert.equal(s.scheme,'invisible');
   await p.eval(`document.getElementById('helm-mode').value='visible';document.getElementById('helm-mode').dispatchEvent(new Event('change'))`);
   s=await p.eval('sunwake.helm');
   assert.equal(s.scheme,'visible');
   assert.equal(s.zonesVisible,false,orientation+': the invisible zones stayed live after choosing the visible helm');
   assert.equal(s.buttonsVisible,true,orientation+': the visible helm did not come back');
   assert.equal(await p.eval(`getComputedStyle(document.querySelector('.rudder-wrap')).display`),'block');
   // and the old visible helm still works
   const r=await p.eval(`(()=>{const b=document.getElementById('ahead').getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`);
   await t.start(5,r.x,r.y);
   assert.ok((await p.eval('sunwake.input')).throttle>.95,orientation+': the visible AHEAD button stopped working');
   await t.end(5);
   await p.shot(evidence+`p1-${orientation}-visible-helm.png`);
   assert.ok(await p.eval('document.documentElement.scrollWidth<=innerWidth'),orientation+': horizontal overflow');
   Object.assign(report.cases.at(-1),{size,rudderReadout:readout});
   assert.deepEqual(p.errors,[],'Browser errors: '+JSON.stringify(p.errors));
   console.log('PASS helm',orientation);
  }finally{await p.close();}
 }
}
await run();
console.log(JSON.stringify(report,null,2));
