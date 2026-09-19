import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
import {QUALITY} from '../js/core/config.mjs';
const evidence=new URL('../docs/evidence/',import.meta.url).pathname;
const duration=Number(process.env.MOBILE_SECONDS||150),report={date:new Date().toISOString(),secondsPerPhase:duration,budgets:[],phases:[],physical:'NOT MET — no hardware available'};
const p=await connect();
const metrics=(portrait)=>({width:portrait?390:844,height:portrait?844:390,deviceScaleFactor:3,mobile:true});
async function boot(dense,portrait){try{await p.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}catch(e){if(!e.message.includes('TouchStart first'))throw e;}await p.goto(BASE+'?test=1'+(dense?'&fixture=dense':''),metrics(portrait));await p.send('Emulation.setCPUThrottlingRate',{rate:4});await p.wait('window.__SUNWAKE_BOOTED__');await p.send('Emulation.setTouchEmulationEnabled',{enabled:false});await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await p.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function touch(type,points){await p.send('Input.dispatchTouchEvent',{type,touchPoints:points});await p.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function tap(id){const r=await p.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1}})()`);await touch('touchStart',[r]);await touch('touchEnd',[r]);}
try{
 report.browser=await p.send('Browser.getVersion');await boot(true,false);
 report.graphics=await p.eval("(()=>{const g=document.getElementById('sea').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e.UNMASKED_RENDERER_WEBGL)})()");
 for(const tier of (process.env.SKIP_BUDGETS?[]:['high','standard','low','emergency'])){
  let max={calls:0,triangles:0,ornaments:0,geometryBytes:0};
  for(const pos of [{x:768,z:768},{x:896,z:960},{x:0,z:0}]){
   await p.eval(`sunwakeTest.setPose(${JSON.stringify(pos)});sunwakeTest.setQuality('${tier}')`);for(let i=0;i<30;i++)await p.eval('sunwakeTest.advance(1)');
   for(let a=0;a<8;a++){
    await p.eval(`sunwakeTest.setPose({x:${pos.x},z:${pos.z},yaw:${a*Math.PI/4}})`);const s=await p.eval('sunwake');
    max.calls=Math.max(max.calls,s.calls);max.triangles=Math.max(max.triangles,s.triangles);max.ornaments=Math.max(max.ornaments,s.islandStream.ornaments);max.geometryBytes=Math.max(max.geometryBytes,s.geometryBytes);
    assert.ok(s.calls<=QUALITY[tier].drawCap,`${tier} draws ${s.calls}`);assert.ok(s.triangles<=QUALITY[tier].triangleCap,`${tier} triangles ${s.triangles}`);assert.ok(s.islandStream.ornaments<=QUALITY[tier].ornaments,`${tier} ornaments ${s.islandStream.ornaments}`);assert.ok(s.geometryBytes<24*1024*1024,'geometry memory');assert.ok(s.width*s.height<=QUALITY[tier].pixelCap+2000,'pixel cap');
   }
  }
  report.budgets.push({tier,...max});await p.shot(evidence+`m7-dense-${tier}.png`);console.log('PASS dense budget',tier,JSON.stringify(max));
 }
 for(const [dense,portrait]of [[true,true],[true,false],[false,true],[false,false]]){
  await boot(dense,portrait);await p.eval('sunwakeTest.restartVoyage()');if(dense)await p.eval('sunwakeTest.setPose({x:768,z:768,yaw:0})');await p.eval('sunwakeTest.resumeTime()');
  // Genuine multitouch followed by cancel; no persistent programmatic input.
  await p.eval("window.__touchLog=[];for(const type of ['pointerdown','pointerup','pointercancel','blur','resize'])addEventListener(type,e=>window.__touchLog.push({type,id:e.pointerId,target:e.target.id,x:e.clientX,y:e.clientY}))");
  const points=await p.eval("['rudder','ahead'].map((id,i)=>{const r=document.getElementById(id).getBoundingClientRect();return {id:i+1,x:r.x+r.width/2+(i===0?25:0),y:r.y+r.height/2}})");await touch('touchStart',[points[0]]);await touch('touchStart',points);await sleep(700);assert.ok((await p.eval('sunwake.input')).throttle>0);await touch('touchCancel',[]);assert.equal((await p.eval('sunwake.input')).throttle,0);
  // Real chart/settings interactions and orientation cancellation before sampling.
  await tap('chart-open');assert.equal(await p.eval('sunwake.mode'),'chart');await p.shot(evidence+`m7-chart-${portrait?'portrait':'landscape'}.png`);await tap('chart-close');await tap('pause');await tap('settings-open');await p.shot(evidence+`m7-settings-${portrait?'portrait':'landscape'}.png`);await tap('settings-close');await tap('resume');
  if(duration>=60)await sleep(10000);
  await p.eval(`window.__perf={frames:[],last:performance.now(),sampling:true};(function collect(t){const q=window.__perf;if(!q.sampling)return;if(sunwake.mode==='water'&&!document.hidden){const dt=t-q.last;if(dt>0&&dt<1000)q.frames.push(dt);}q.last=t;requestAnimationFrame(collect);})(performance.now())`);
  const phase={dense,portrait,metrics:metrics(portrait),samples:[]},start=Date.now();
  while(Date.now()-start<duration*1000){await sleep(Math.min(10000,duration*1000-(Date.now()-start)));const s=await p.eval('sunwake');phase.samples.push({seconds:(Date.now()-start)/1000,tier:s.tier,scale:s.resolutionScale,width:s.width,height:s.height,calls:s.calls,triangles:s.triangles,ornaments:s.islandStream.ornaments,geometryBytes:s.geometryBytes,geometries:s.geometries,cache:s.worldStats.cacheSize,gpuMs:s.gpuMs,simulationMs:s.simulationMs,viewMs:s.viewMs,streamMs:s.streamMs,submitMs:s.submitMs,performance:s.performance});if(s.mode!=='water')throw new Error('Unexpected interruption during mobile sample');if(duration>=60&&phase.samples.length%3===0){await tap('chart-open');await tap('chart-close');}}
  phase.timings=await p.eval(`(()=>{const q=window.__perf;q.sampling=false;const a=q.frames.sort((a,b)=>a-b),p=n=>a[Math.floor(a.length*n)]||0;return {frames:a.length,p50:p(.5),p90:p(.9),p99:p(.99),fps:1000/(a.reduce((s,n)=>s+n,0)/a.length),over33ms:a.filter(n=>n>33.34).length,heap:performance.memory?.usedJSHeapSize}})()`);
  await p.shot(evidence+`m7-${dense?'dense':'open'}-${portrait?'portrait':'landscape'}.png`);report.phases.push(phase);await writeFile(evidence+'m7-mobile.json',JSON.stringify(report,null,2));console.log('MEASURED mobile',dense?'dense':'open',portrait?'portrait':'landscape',JSON.stringify(phase.timings));
 }
 assert.deepEqual(p.errors,[]);report.errors=p.errors;report.passed=true;
}catch(e){report.failure=e.stack;report.failedSnapshot=await p.eval('window.sunwake');report.touchLog=await p.eval('window.__touchLog');await p.shot(evidence+'m7-failure.png');throw e;}finally{await writeFile(evidence+'m7-mobile.json',JSON.stringify(report,null,2));await p.close();}
