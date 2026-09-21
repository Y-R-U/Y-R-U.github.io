import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect,BASE} from './cdp.mjs';
const evidence=fileURLToPath(new URL('../docs/evidence/',import.meta.url));await mkdir(evidence,{recursive:true});

/**
 * Plays the jobs loop through the real DOM: berth at a real island, read a real
 * board, take a job, SAIL it steering only by the arrow the HUD draws, get paid,
 * spend the money, and reload the page to prove the purse survived.
 *
 * Nothing here calls into `core/jobs.mjs`. Everything is a click, a key, or a
 * value read back out of an element — because the Node suite already proves the
 * model and what is left to prove is the wiring.
 */
const LANTERN={x:-179.3,z:136.6};      // Lantern Key's jetty approach point
let p=await connect();
const allErrors=[];
const report={date:new Date().toISOString(),steps:[]};
const note=(name,detail)=>{report.steps.push({name,...detail});console.log('PASS',name);};

const boardCards=sel=>slowEval(`[...document.querySelectorAll('${sel} .job')].map(n=>({
  id:n.dataset.id||null,kind:n.dataset.kind||null,key:n.dataset.key||null,
  title:n.querySelector('h4').textContent,blocked:n.classList.contains('blocked'),
  pay:n.querySelector('.pay')?.textContent||null,
  buttons:[...n.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled,reason:b.dataset.reason||'',action:b.dataset.action}))}))`);
const hud=()=>slowEval(`({purse:document.getElementById('purse').textContent,
  purseHidden:document.getElementById('purse').hidden,
  berthHidden:document.getElementById('berth-open').hidden,
  berthText:document.getElementById('berth-open').textContent,
  berthHint:document.getElementById('berth-hint').hidden?null:document.getElementById('berth-hint').textContent,
  logbookHidden:document.getElementById('logbook').hidden,
  logbook:[...document.querySelectorAll('#logbook .entry')].map(n=>n.textContent),
  courseName:document.getElementById('course-name').textContent,
  courseDistance:document.getElementById('course-distance').textContent,
  approach:document.getElementById('approach').textContent,
  notice:document.getElementById('notice').hidden?null:document.getElementById('notice').textContent})`);
const click=id=>slowEval(`document.getElementById('${id}').click()`);
// Sailing into fresh chunks builds new island and settlement geometry, and on
// this machine's SwiftShader that can take tens of seconds inside one synchronous
// Runtime.evaluate. The 20 s default in cdp.mjs reads as a hang; it is not one.
const SLOW=240000;
const slowEval=expression=>p.eval(expression,SLOW);
/**
 * Reload the game on a FRESH CDP target.
 *
 * STATE.md's gotcha, hit again here: repeated navigations in one tab eventually
 * lose the WebGL2 context on SwiftShader, and the page then never reaches
 * `__SUNWAKE_BOOTED__`. It looks exactly like a boot bug and is not one.
 * `localStorage` is per-origin, not per-tab, so a new target still sees the save
 * the old one wrote — which is the whole point of these checks.
 *
 * `before` runs as a new-document script on the new target, so it can edit the
 * save before any page script runs. That matters: the game saves on `pagehide`,
 * so mutating localStorage and then navigating writes the live state straight
 * back over the edit.
 */
async function reload(before=null){
  allErrors.push(...p.errors);
  try{await p.close();}catch{}
  p=await connect();
  let id=null;
  if(before)id=(await p.send('Page.addScriptToEvaluateOnNewDocument',{source:before})).identifier;
  await p.goto(BASE+'?test=1',{width:1024,height:640,deviceScaleFactor:1,mobile:false});
  await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__',90000);
  assert.equal(await slowEval('window.__SUNWAKE_BOOTED__'),true,await slowEval('window.__SUNWAKE_FAILED__'));
  if(id)await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:id});
}
const TRACE=process.env.TRACE==='1';
const trace=m=>{if(TRACE)console.error('>>',m,new Date().toISOString());};

// Hold the bearing the ARROW is drawing, read back out of its CSS transform —
// the same trick tools/route.mjs's browser replay uses. If the HUD lies, this
// autopilot drives into a rock and the run times out.
// One steering correction per rendered HUD frame (6 ticks = 0.1 s), because the
// arrow is only redrawn when the HUD is. That is also the fastest a human could
// react to it. Chunked so no single Runtime.evaluate outruns the CDP timeout.
const AUTOPILOT=`window.__sail=(steps)=>{
  const arrow=document.getElementById('course-arrow');
  for(let i=0;i<steps;i++){
    // Capture the completion toast at the instant it appears: it hides itself
    // after six seconds and a chunked run reads the HUD long after that.
    if(!sunwake.jobs.active.length){window.__lastNotice=window.__lastNotice||'';break;}
    {const n=document.getElementById('notice');if(!n.hidden&&/Job complete/.test(n.textContent))window.__lastNotice=n.textContent;}
    const m=/rotate\\(([-0-9.e]+)rad\\)/.exec(arrow.style.transform);
    const error=m?parseFloat(m[1]):0;
    const distance=parseFloat(document.getElementById('course-distance').textContent)||0;
    const throttle=distance>90?1:distance>34?.35:distance>12?.08:0;
    sunwakeTest.setInput({steer:Math.max(-1,Math.min(1,error*2)),throttle});
    sunwakeTest.advance(6);
  }
  {const n=document.getElementById('notice');if(!n.hidden&&/Job complete/.test(n.textContent))window.__lastNotice=n.textContent;}
  return {jobs:sunwake.jobs,x:sunwake.x,z:sunwake.z,seconds:sunwake.simulationTime,notice:window.__lastNotice||null};}`;

try{
 const clear=(await p.send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear()}catch{}'})).identifier;
 await p.goto(BASE+'?test=1',{width:1024,height:640,deviceScaleFactor:1,mobile:false});
 await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__',90000);
 assert.equal(await slowEval('window.__SUNWAKE_BOOTED__'),true,await slowEval('window.__SUNWAKE_FAILED__'));
 await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clear});
 report.browser=await p.send('Browser.getVersion');

 // ---- a fresh voyage has an empty purse and no harbour in reach -----------
 await click('start');
 // This suite proves DOM and model wiring, not pixels, and the autopilot sails
 // through chunks the renderer has never built. At the default tier one
 // `advance` call spanning a fresh chunk can spend well over a minute inside
 // SwiftShader building island and settlement geometry, which reads as a hang.
 // The low tier builds far less and changes nothing this file asserts.
 await slowEval(`sunwakeTest.setQuality('low')`);
 let h=await hud();
 assert.equal(h.purse,'◎ 0');
 assert.equal(h.berthHidden,true,'a job board appeared in open water');
 assert.equal(h.logbookHidden,true);
 assert.deepEqual(await slowEval('sunwake.jobs.active'),[]);
 note('fresh voyage: empty purse, no board',{purse:h.purse});

 // ---- an UNRECORDED island says what is missing, and then records itself --
 // This is the reason to stop at an ordinary island: come alongside and the
 // prompt tells you the board is two seconds away.
 await slowEval(`sunwakeTest.setPose({x:${LANTERN.x},z:${LANTERN.z}});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(1)`);
 h=await hud();
 assert.equal(h.berthHidden,true,'the board opened at an island that was never recorded');
 assert.match(h.berthHint||'',/record this island/,'no prompt told the player what was missing');
 note('unrecorded island prompts instead of opening',{hint:h.berthHint});

 await slowEval('sunwakeTest.advance(140)');   // the two-second discovery dwell
 h=await hud();
 assert.deepEqual(await slowEval('sunwake.exploration.atlasIds'),['-1:0']);
 assert.equal(h.berthHidden,false,'the board did not open after the island was recorded');
 assert.equal(h.berthText,'Job board · Lantern Key');
 assert.equal(h.berthHint,null);
 await p.shot(evidence+'p2-jobs-berth.png',SLOW);
 note('recorded island opens its board',{button:h.berthText});

 // ---- the board itself -----------------------------------------------------
 await click('berth-open');
 assert.equal(await slowEval('sunwake.mode'),'board');
 const cards=await boardCards('#board-jobs');
 assert.equal(cards.length,3,'a board is three jobs');
 assert.deepEqual(cards.map(c=>c.kind).sort(),['cargo','catch','visit']);
 // The requirement Aaron was explicit about: shown, greyed, with the reason.
 const gated=cards.find(c=>c.blocked);
 assert.ok(gated,'nothing on this board is gated — the fixture is wrong');
 assert.equal(gated.buttons[0].disabled,true,'a gated job was still clickable');
 assert.match(gated.buttons[0].text,/^Needs fishing \d+$/,'the disabled button must carry the reason');
 assert.equal(gated.buttons[0].text,gated.buttons[0].reason);
 assert.ok(cards.filter(c=>!c.blocked).length>=1,'every job on the board was blocked');
 const shop=await boardCards('#board-shop');
 assert.equal(shop.length,3);
 for(const item of shop){
   assert.equal(item.buttons[0].disabled,true,'an upgrade was affordable with nothing in the purse');
   assert.match(item.buttons[0].text,/^\d+ more coins$/,'the chandlery must say how short you are');
 }
 await p.shot(evidence+'p2-jobs-board.png',SLOW);
 note('board shows three jobs, ineligible ones greyed with the reason',
   {gated:gated.title,reason:gated.buttons[0].text,shop:shop.map(s=>s.buttons[0].text)});

 // ---- take the delivery ----------------------------------------------------
 const delivery=cards.find(c=>c.kind==='cargo'&&!c.blocked);
 assert.ok(delivery,'no takeable delivery on the fixture board');
 await slowEval(`[...document.querySelectorAll('#board-jobs .job')].find(n=>n.dataset.id===${JSON.stringify(delivery.id)}).querySelector('button').click()`);
 const active=await slowEval('sunwake.jobs.active');
 assert.equal(active.length,1,'the job never reached the logbook');
 assert.equal(active[0].kind,'cargo');
 assert.equal(await slowEval('sunwake.jobs.coins'),0,'a job paid out on acceptance');
 const logged=await boardCards('#board-active');
 assert.equal(logged.length,1);
 assert.ok(logged[0].buttons.some(b=>/Following/.test(b.text)),'taking a delivery did not point the compass at it');
 note('job taken',{title:delivery.title,pay:delivery.pay});

 await click('board-close');
 assert.equal(await slowEval('sunwake.mode'),'water');
 h=await hud();
 assert.equal(h.logbookHidden,false,'the logbook strip never appeared on the water');
 assert.equal(h.logbook.length,1);
 assert.equal(h.courseName,active[0].targetName,'the compass is not following the job');
 assert.match(h.courseDistance,/m to the landing/);
 await p.shot(evidence+'p2-jobs-underway.png',SLOW);
 note('compass follows the delivery',{courseName:h.courseName,distance:h.courseDistance});

 // ---- SAIL IT --------------------------------------------------------------
 // Deliberately started on the WRONG SIDE of the destination: 220 m out, on the
 // bearing opposite the jetty. That is the exact geometry that made the arrow
 // point straight through the rock (see ROADMAP), and it is the leg worth
 // sailing in a browser. The long haul across open water is already sailed end
 // to end in `tools/jobs.mjs`; repeating it here only buys wall-clock while
 // Chrome streams islands synchronously.
 const far=await slowEval(`(()=>{const j=sunwake.jobs.active[0];
   const cx=j.targetX,cz=j.targetZ,ux=j.dropX-cx,uz=j.dropZ-cz,len=Math.hypot(ux,uz);
   const x=cx-ux/len*220,z=cz-uz/len*220;
   sunwakeTest.setPose({x,z,yaw:0});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(2);
   return {x,z,dropX:j.dropX,dropZ:j.dropZ,cx,cz};})()`);
 trace('dropped in on the far side at '+Math.round(far.x)+','+Math.round(far.z));
 // `;1` only keeps CDP from serialising the function object as `{}`; it is not
 // load-bearing. (It was briefly blamed for a timeout that turned out to be the
 // renderer streaming islands — see STATE.md.)
 await slowEval(AUTOPILOT+';1');
 let sailed=null,seconds=0;
 for(let i=0;i<30&&(await slowEval('sunwake.jobs.active.length'))>0;i++){
   trace('sail chunk '+i);
   sailed=await slowEval('window.__sail(60)');seconds+=6;
   trace('sailed to '+Math.round(sailed.x)+','+Math.round(sailed.z)+' active='+sailed.jobs.active.length);
 }
 const paid=await slowEval('sunwake.jobs');
 assert.equal(paid.active.length,0,`the delivery never handed over — ${seconds} s holding the on-screen arrow from the far side of the island, ended at ${Math.round(sailed.x)}, ${Math.round(sailed.z)} with the landing at ${Math.round(far.dropX)}, ${Math.round(far.dropZ)}`);
 assert.equal(paid.completed,1);
 assert.ok(paid.coins>0,'the job completed and paid nothing');
 assert.equal('◎ '+paid.coins,(await hud()).purse,'the purse in the HUD disagrees with the model');
 assert.equal(paid.follow,null,'a finished job is still being followed');
 h=await hud();
 assert.equal(h.logbookHidden,true,'the logbook strip is still showing a finished job');
 const toast=sailed.notice||h.notice||'';
 assert.match(toast,/Job complete/,'no "Job complete" notice was ever shown');
 assert.ok(toast.includes(String(paid.coins)),'the notice did not name the payment');
 await p.shot(evidence+'p2-jobs-paid.png',SLOW);
 note('delivery sailed by the on-screen arrow and paid',{seconds,coins:paid.coins,notice:toast});

 // ---- fish pay too ---------------------------------------------------------
 const before=paid.coins;
 // Six ticks per steering decision, as above: `advance(1)` renders a full frame
 // every tick and 6,000 of those is minutes of SwiftShader, not a test.
 await slowEval(`window.__fish=(steps)=>{
   for(let k=0;k<steps;k++){
     if(sunwake.fishing.phase==='idle'){
       // A handover ends at up to ARRIVE_SPEED, which is faster than a cast is
       // allowed at. Carry on stepping until she has settled rather than giving
       // up — the first draft broke out here and never wet a line.
       if(!sunwake.fishing.canCast){sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(6);continue;}
       document.getElementById('cast').click();
     }
     const want=sunwake.fishing.tension<.5;
     if(want!==window.__held){window.__held=want;dispatchEvent(new KeyboardEvent(want?'keydown':'keyup',{code:'Space',bubbles:true}));}
     sunwakeTest.setInput({throttle:0,steer:0});
     sunwakeTest.advance(6);
     if(sunwake.jobs.coins>${before})break;
   }
   dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
   return {coins:sunwake.jobs.coins,xp:sunwake.fishing.xp,casts:sunwake.fishing.casts};};1`);
 let fishResult={coins:before};
 for(let i=0;i<10&&fishResult.coins<=before;i++)fishResult=await slowEval('window.__fish(200)');
 assert.ok(fishResult.coins>before,`landing a fish paid no coins after ${fishResult.casts} casts`);
 note('a landed fish pays',{before,after:fishResult.coins,casts:fishResult.casts});

 // ---- the chandlery refuses a purse that is short -------------------------
 // A passage job is sailed end to end in the Node suite; repeating that 1.7 km
 // here would only buy wall-clock. What is left to prove in the DOM is the gate.
 await slowEval(`sunwakeTest.setPose({x:${LANTERN.x},z:${LANTERN.z}});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(2)`);
 await click('berth-open');
 const stillShort=(await boardCards('#board-shop')).find(c=>c.key==='chart');
 assert.equal(stillShort.buttons[0].disabled,true,'the chandlery let a poor sailor buy');
 await click('board-close');
 const purseNow=await slowEval('sunwake.jobs.coins');
 note('the chandlery refuses a short purse',{coins:purseNow,says:stillShort.buttons[0].text});

 // ---- the purse survives a reload -----------------------------------------
 const saved=await slowEval('sunwake.jobs');
 await slowEval('sunwakeTest.save()');
 await reload();
 assert.equal(await slowEval(`document.getElementById('start').textContent`),'Continue voyage ↗','the reload lost the voyage');
 await click('start');
 await slowEval(`sunwakeTest.setQuality('low')`);
 const reloaded=await slowEval('sunwake.jobs');
 assert.equal(reloaded.coins,saved.coins,'coins did not survive the reload');
 assert.equal(reloaded.completed,saved.completed,'the job count did not survive the reload');
 assert.deepEqual(reloaded.upgrades,saved.upgrades);
 assert.equal((await hud()).purse,'◎ '+saved.coins);
 note('purse survives a reload',{coins:reloaded.coins,completed:reloaded.completed});

 // ---- a pre-jobs save is migrated, not thrown away ------------------------
 // Exactly Aaron's situation: a real voyage written before any of this existed.
 //
 // The mutation MUST run as a new-document script. The game saves on `pagehide`,
 // so editing localStorage and then navigating writes the live state straight
 // back over the edit and the test silently proves nothing.
 await reload(`try{
   const raw=JSON.parse(localStorage.getItem('sunwake-v1'));
   delete raw.jobs;raw.atlasIds=['-1:0'];raw.distanceM=4212;raw.visitCount=2;
   localStorage.setItem('sunwake-v1',JSON.stringify(raw));
 }catch{}`);
 assert.equal(await slowEval(`document.getElementById('start').textContent`),'Continue voyage ↗',
   'a save written before jobs existed was rejected — Aaron would lose his voyage');
 await click('start');
 await slowEval(`sunwakeTest.setQuality('low')`);
 const migrated=await slowEval(`({jobs:sunwake.jobs,atlas:sunwake.exploration.atlasIds,distance:sunwake.exploration.distanceM})`);
 assert.deepEqual(migrated.atlas,['-1:0'],'the atlas was lost in the migration');
 assert.equal(migrated.distance,4212,'the odometer was lost in the migration');
 assert.equal(migrated.jobs.coins,0);
 assert.deepEqual(migrated.jobs.upgrades,{rod:1,hull:1,chart:1});
 note('a pre-jobs save is migrated, not invalidated',migrated);

 // ---- buying, and what a purchase actually changes -------------------------
 // The purse is set through the save, which is the only surface a player could
 // reach anyway, and every clamp in `createJobs` runs on the way back in.
 await reload(`try{
   const raw=JSON.parse(localStorage.getItem('sunwake-v1'));
   raw.jobs={...(raw.jobs||{}),coins:9999};
   localStorage.setItem('sunwake-v1',JSON.stringify(raw));
 }catch{}`);
 await click('start');
 await slowEval(`sunwakeTest.setQuality('low')`);
 assert.equal(await slowEval('sunwake.jobs.coins'),9999);
 const bandBefore=await slowEval('sunwake.fishing.band');
 const chartBefore=await slowEval(`(()=>{document.getElementById('chart-open').click();const t=document.getElementById('chart-map');return sunwake.jobs.upgrades.chart})()`);
 await slowEval(`document.getElementById('chart-close').click()`);
 await slowEval(`sunwakeTest.setPose({x:${LANTERN.x},z:${LANTERN.z}});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(140)`);
 await click('berth-open');
 const rich=await boardCards('#board-shop');
 for(const item of rich)assert.equal(item.buttons[0].disabled,false,'a full purse still could not buy '+item.key);
 await slowEval(`[...document.querySelectorAll('#board-shop .job')].find(n=>n.dataset.key==='rod').querySelector('button').click()`);
 assert.equal(await slowEval('sunwake.jobs.upgrades.rod'),2,'buying a rod did not raise the rod level');
 assert.equal(await slowEval('sunwake.jobs.coins'),9999-120,'buying a rod did not cost anything');
 await slowEval(`[...document.querySelectorAll('#board-shop .job')].find(n=>n.dataset.key==='hull').querySelector('button').click()`);
 await slowEval(`[...document.querySelectorAll('#board-shop .job')].find(n=>n.dataset.key==='chart').querySelector('button').click()`);
 await p.shot(evidence+'p2-jobs-chandlery.png',SLOW);
 await click('board-close');
 const bandAfter=await slowEval('sunwake.fishing.band');
 assert.ok(bandAfter>bandBefore,`a bought rod did not widen the band: ${bandBefore} → ${bandAfter}`);
 assert.equal(await slowEval('sunwake.jobs.upgrades.chart'),chartBefore+1);
 // The hull is newtons on the water, measured by sailing.
 await slowEval(`sunwakeTest.setPose({x:0,z:-2000});sunwakeTest.setInput({throttle:1,steer:0});sunwakeTest.advance(1800)`);
 const tuned=await slowEval('Math.hypot(sunwake.boat.vx,sunwake.boat.vz)');
 // Stock is 7.983 m/s, hull 2 is 8.614 (measured in Node over the same 1,800
 // ticks). 8.3 sits between them, so this fails if the purchase does nothing.
 assert.ok(tuned>8.3,`a bought hull is not faster on the water: ${tuned.toFixed(3)} m/s against 7.983 stock`);
 note('upgrades bought and measured',{band:{before:bandBefore,after:bandAfter},topSpeed:+tuned.toFixed(3)});

 // ---- a bigger chart draws more sea ---------------------------------------
 await slowEval(`document.getElementById('chart-open').click()`);
 const chartLabel=await slowEval(`(()=>{const c=document.getElementById('chart-map').getContext('2d');return sunwake.jobs.upgrades.chart})()`);
 assert.equal(chartLabel,chartBefore+1);
 await p.shot(evidence+'p2-jobs-chart.png',SLOW);
 await slowEval(`document.getElementById('chart-close').click()`);

 // ---- an ORDINARY island has a board of its own ---------------------------
 // The answer to "ordinary islands are scenery": sail to one, be recorded, and
 // there is a different set of three jobs and the same chandlery.
 // The island is found through the page's own geography modules, so the fixture
 // cannot drift away from the world the game actually generates.
 const spot=await slowEval(`(async()=>{
   const {createWorld}=await import('./js/core/world.mjs');
   const w=createWorld();
   const list=w.nearby(0,0,900,[]).filter(i=>!i.landmark);
   if(!list.length)return null;
   const {mooringLayout}=await import('./js/core/island-shape.mjs');
   const m=mooringLayout(list[0]);
   return {id:list[0].id,x:m.approach.x,z:m.approach.z};})()`);
 assert.ok(spot,'the world has no ordinary island within 900 m of the launch');
 await slowEval(`sunwakeTest.setPose({x:${spot.x},z:${spot.z}});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(140)`);
 h=await hud();
 assert.equal(h.berthHidden,false,`an ordinary island (${spot.id}) has no job board`);
 await click('berth-open');
 const ordinaryCards=await boardCards('#board-jobs');
 assert.equal(ordinaryCards.length,3,'an ordinary island offered no work');
 assert.notEqual(await slowEval(`document.getElementById('board-title').textContent`),'Lantern Key');
 assert.equal((await boardCards('#board-shop')).length,3,'no chandlery at an ordinary island');
 await p.shot(evidence+'p2-jobs-ordinary.png',SLOW);
 await click('board-close');
 note('ordinary islands are worth stopping at',
   {id:spot.id,titles:ordinaryCards.map(c=>c.title)});

 allErrors.push(...p.errors);
 assert.deepEqual(allErrors,[],'browser errors: '+JSON.stringify(allErrors));
 assert.ok(p.requests.filter(r=>r.url.startsWith('http')).every(r=>r.url.startsWith(new URL(BASE).origin)),'an external request was made');
 report.errors=allErrors;
 console.log(JSON.stringify(report,null,2));
}finally{await p.close();}
