import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const c=await CDP.launch({gpu:true});
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const out=process.env.TRANSPORT_OUTPUT_DIR||fileURLToPath(new URL('../docs/verification/',import.meta.url));
mkdirSync(out,{recursive:true});
const checks=[];
async function district(){return c.eval(`(()=>{const d=transport2.scenes.debug.district;return typeof d==='function'?d():d})()`);}
async function snapshot(id){return c.eval(`transport2.scenes.debug.snapshot(${JSON.stringify(id)})`);}
async function capture(name){console.log('Capturing '+name);await c.eval(`document.querySelector('#toast-stack').style.opacity='0'`);const {data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(data,'base64'));}
async function touch(selector){
 await c.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await c.frames(3);
 const p=await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:!!document.elementFromPoint(x,y)?.closest(${JSON.stringify(selector)})}})()`);assert(p.hit,'touch target is visible: '+selector);
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.frames(8);
}
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('window.transport2?.scenes?.debug.district',20000));await c.frames(12);
 const initial=await district();assert.equal(initial.sceneCount,1);assert.equal(initial.centralDepotCount,1);assert.deepEqual([...initial.siteIds].sort(),['grain','stone','timber']);checks.push('initial district has three businesses and one central depot in one scene');
 assert.equal(await c.eval('transport2.scenes.debug.focus'),null);checks.push('main camera starts in district overview');
 for(const id of initial.siteIds){const s=await snapshot(id);assert.equal(s.sceneUuid,initial.sceneUuid);}
 checks.push('all business cameras observe the same physical scene');
 await capture('district-overview-mobile');
 await c.eval(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.cash=1e14;for(const id of ['grain','timber','stone']){s.routes[id].unlocked=true;s.routes[id].fleet=7;s.routes[id].manager=true;}transport2.game.importSave(JSON.stringify(s));})()`);await c.frames(6);
 const shared=await district();await touch('[data-camera=grain]');assert.equal(await c.eval('transport2.scenes.debug.pinned'),true);assert.equal((await district()).sceneUuid,shared.sceneUuid);assert.equal((await district()).siteIds.length,3);checks.push('pinning a business moves the camera inside the existing district');
 await touch('#overview-button');assert.equal(await c.eval('transport2.scenes.debug.focus'),null);assert.equal((await district()).sceneUuid,shared.sceneUuid);checks.push('overview returns to the complete connected district');
 await c.eval(`window.__districtTick=transport2.game.tick;transport2.game.tick=()=>{};for(const s of Object.values(transport2.game.state.routes))s.progress=0;`);await c.frames(5);
 for(const id of ['grain','timber','stone']){
  const s=await snapshot(id),positions=s.vehicles.map(v=>[v.x,v.y,v.z].map(n=>n.toFixed(3)).join(','));assert.equal(new Set(positions).size,positions.length,'fleet loading positions must be distinct for '+id);
 }
 checks.push('multiple fleet trucks use distinct loading and queue positions');
 const traffic=await c.eval(`(()=>{const d=transport2.scenes.debug;return Object.fromEntries(['grain','timber','stone'].map(id=>[id,{bounds:[0,.18,.55,.64,.92,1].map(p=>({p,before:d.pose(id,p-.00001),after:d.pose(id,p+.00001)})),trace:Array.from({length:1001},(_,i)=>d.pose(id,i/1000)),loading:d.pose(id,.08),unloading:d.pose(id,.6),snapshot:d.snapshot(id)}]))})()`);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 for(const [id,t]of Object.entries(traffic)){
  for(const pair of t.bounds)assert(distance(pair.before,pair.after)<.2,'continuous route at '+id+' phase '+pair.p);
  assert.equal(t.loading.stage,'loading');assert.equal(t.unloading.stage,'unloading');
  assert(distance(t.loading,{x:t.snapshot.loadingBay[0],z:t.snapshot.loadingBay[2]})<.01);
  assert(distance(t.unloading,{x:t.snapshot.depotBay[0],z:t.snapshot.depotBay[2]})<.01);
  for(const pose of t.trace)assert([pose.x,pose.y,pose.z,pose.angle].every(Number.isFinite));
 }
 checks.push('all route phases and cycle wraps keep continuous physical truck positions');
 checks.push('business loading and central depot unloading use their physical bays');
 // Check actual world-space motion against the nearest one-way arterial tangent,
 // independently of the renderer's approximate onRoad/debug flags.
 function nearestRoad(p,half,radius){
  const x=Math.max(-half,Math.min(half,p.x));const candidates=[{x,z:radius,tx:1,tz:0},{x,z:-radius,tx:-1,tz:0}];
  const right=Math.max(-Math.PI/2,Math.min(Math.PI/2,Math.atan2(p.z,p.x-half)));
  candidates.push({x:half+radius*Math.cos(right),z:radius*Math.sin(right),tx:Math.sin(right),tz:-Math.cos(right)});
  let left=Math.atan2(p.z,p.x+half);if(left<0)left+=Math.PI*2;left=Math.max(Math.PI/2,Math.min(Math.PI*1.5,left));
  candidates.push({x:-half+radius*Math.cos(left),z:radius*Math.sin(left),tx:Math.sin(left),tz:-Math.cos(left)});
  return candidates.sort((a,b)=>distance(p,a)-distance(p,b))[0];
 }
 let driven=0;
 for(const [id,t]of Object.entries(traffic))for(let i=1;i<t.trace.length;i++){
  const a=t.trace[i-1],b=t.trace[i],road=nearestRoad(a,shared.road.half,shared.road.radius+(a.lane||0)),step=distance(a,b);
  if(distance(a,road)>.7||distance(b,nearestRoad(b,shared.road.half,shared.road.radius+(b.lane||0)))>.7||step<.001)continue;
  const flow=((b.x-a.x)*road.tx+(b.z-a.z)*road.tz)/step;assert(flow>-.05,'forward traffic on '+id+' at phase '+a.phase+' dot='+flow);driven++;
 }
 assert(driven>150,'enough physical arterial samples');checks.push('actual trucks travel forward along the shared one-way road');
 const audit=await c.eval('transport2.scenes.debug.audit()');
 for(const row of audit.rows){const s=await snapshot(row.id);assert.equal(row.sceneUuid,s.sceneUuid);assert.equal(row.siteUuid,s.siteUuid);assert.deepEqual(row.vehicleUuids,s.vehicles.map(v=>v.uuid));}
 checks.push('main scene and row views use identical site and vehicle objects');
 await c.eval('transport2.game.tick=window.__districtTick;delete window.__districtTick;');
 await c.eval(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.unlockedRegions=['meadow','industrial','coastal','alpine','aerospace'];for(const r of Object.values(s.routes)){r.unlocked=true;r.manager=true;r.fleet=3;}transport2.game.importSave(JSON.stringify(s));})()`);
 await touch('#network-filter');await c.frames(10);const network=await district();assert.equal(network.siteIds.length,15);assert.equal(network.sceneCount,1);assert.equal(network.centralDepotCount,1);assert.equal(await c.eval('transport2.scenes.debug.rendererCount'),1);checks.push('all fifteen listed businesses connect to one depot and one renderer');
 const networkTraffic=[];
 for(const id of network.siteIds){
  networkTraffic.push(await c.eval(`(()=>{const d=transport2.scenes.debug,id=${JSON.stringify(id)};return {id,vehicles:Array.from({length:7},(_,index)=>({loading:d.pose(id,.08,index),unloading:d.pose(id,.6,index),bounds:[0,.18,.55,.64,1].map(p=>[d.pose(id,p-.00001,index),d.pose(id,p+.00001,index)]),trace:Array.from({length:301},(_,i)=>d.pose(id,i/300,index))}))}})()`));
 }

 const parked=[];let networkDriven=0;
 for(const t of networkTraffic)for(const v of t.vehicles){
  parked.push(v.unloading);
  for(const [a,b]of v.bounds)assert(distance(a,b)<.3,'network route continuity '+t.id);
  for(let i=1;i<v.trace.length;i++){
   const a=v.trace[i-1],b=v.trace[i];assert([a.x,a.y,a.z,a.angle].every(Number.isFinite));
   const road=nearestRoad(a,network.road.half,network.road.radius+(a.lane||0)),step=distance(a,b);
   if(distance(a,road)>.7||distance(b,nearestRoad(b,network.road.half,network.road.radius+(b.lane||0)))>.7||step<.001)continue;
   const flow=((b.x-a.x)*road.tx+(b.z-a.z)*road.tz)/step;assert(flow>-.05,'network forward traffic '+t.id+' phase '+a.phase);networkDriven++;
  }
 }
 console.log('Network paths checked: '+networkDriven);assert(networkDriven>1000);assert.equal(new Set(parked.map(p=>[p.x,p.z].map(n=>n.toFixed(3)).join(','))).size,105);
 for(const p of parked)assert(distance(p,nearestRoad(p,network.road.half,network.road.radius-1.8))>1,'depot bay clear of arterial');
 checks.push('all 105 network vehicle paths stay continuous, use forward traffic and have distinct depot bays');
 await c.viewport(1440,1050,1,false);await c.eval('transport2.scenes.overview();document.querySelector("#operations-scroll").scrollTo(0,0)');await c.frames(20);await capture('district-network-desktop');
 for(const id of network.siteIds)assert.equal((await snapshot(id)).sceneUuid,network.sceneUuid);
 checks.push('network overview and every close-up retain one scene identity');
 assert.equal(c.errors.length,0,c.errors.join('\n'));writeFileSync(out+'/district-report.json',JSON.stringify({url,checks,initial,network,errors:c.errors},null,2));console.log(JSON.stringify(checks));
}finally{c.close();}
