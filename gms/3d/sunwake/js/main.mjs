import {createScene} from './render/scene.mjs';
import {createSimulation,stepSimulation,tickSimulation,interpolateSimulation,resetAccumulator} from './core/simulation.mjs';
import {createInput} from './platform/input.mjs';
import {forwardSpeed} from './core/boat.mjs';
import {createWorld,generateIsland,LANDMARKS,hash32,CHUNK} from './core/world.mjs';
import {SEED} from './core/config.mjs';
import {createQuality} from './platform/quality.mjs';
import {createExploration,stepExploration,pinGoal,nearestGoal} from './core/exploration.mjs';
import {DEFAULT_SETTINGS} from './core/save.mjs';
import {ATLAS} from './core/content.mjs';
import {createFishing,startCast,stepFishing,canCast,reelIn,levelForXp,xpToNext,tensionBand} from './core/fishing.mjs';
import {createJobs,stepJobs,noteCatch,payFish,acceptJob,abandonJob,buyUpgrade,berthNear,dayOf,
  hullThrust,islandFromId,jobGoal,UPGRADES,BERTH_RANGE} from './core/jobs.mjs';
import {createStorage} from './platform/storage.mjs';
import {createUI} from './platform/ui.mjs';
import {createAudio} from './platform/audio.mjs';
const $=id=>document.getElementById(id),test=new URLSearchParams(location.search).get('test')==='1';
const storage=createStorage(text=>{$('notice').textContent=text;$('notice').hidden=false;}),saved=storage.load();
const dense=test&&new URLSearchParams(location.search).get('fixture')==='dense';
const world=createWorld(dense?{generate:(cx,cz)=>{const authored=LANDMARKS.find(i=>i.cx===cx&&i.cz===cz);if(authored)return authored;if(cx===0&&cz===0)return null;return {id:cx+':'+cz,cx,cz,x:(cx+.5)*CHUNK,z:(cz+.5)*CHUNK,radius:64,height:24,profile:['mesa','garden','split'][Math.abs(cx+cz)%3],landmark:null,seed:hash32(SEED,cx,cz,7)};}}:{}),settings={...DEFAULT_SETTINGS,...saved?.settings},audio=createAudio();
let exploration=createExploration(saved),fishing=createFishing(saved?.fishing),jobs=createJobs(saved?.jobs),simulation=createSimulation(saved?.position||{},world,0),testInput=null,last=performance.now(),hudAt=-Infinity,saveAt=0,discoveryUntil=0,followId=null;
// The rod you bought is the rod you fish with, and the hull you bought is extra
// newtons in `simulation.applyBonusThrust`. Both are read back out of the jobs
// state rather than duplicated into the fishing/boat saves, so there is exactly
// one place an upgrade is stored.
function applyUpgrades(){fishing.rod=jobs.upgrades.rod;simulation.bonusThrust=hullThrust(jobs);}
// Which island's board is in reach, and — if it is not open yet — why not.
// Called from the 10 Hz HUD path and from `snapshot`, never per frame.
//
// Deliberately NOT cached on simulation time. It was, for about an hour, and a
// teleport — `setPose`, which resets the clock to zero — handed back the stale
// `null` from before the jump, so the board simply never opened for the first
// quarter second at any island a test dropped the boat beside. A `world.nearby`
// over a 46 m radius is one or two chunks; there is nothing here worth caching.
const berthList=[];
function currentBerth(){
 // 'board' counts: you are still alongside while the board is open, and
 // `ui.board()` asks for the berth from inside `mode('board')`.
 if(!['water','board'].includes(state.mode)||state.fixture)return null;
 const known=island=>island.landmark
  ?exploration.atlasIds.includes(island.id)
  :exploration.ordinaryVisits.some(v=>v.id===island.id);
 return berthNear(simulation.boat,world.nearby(simulation.boat.x,simulation.boat.z,BERTH_RANGE,berthList),known);
}
// The job the compass is following, resolved to a routable goal. `jobGoal` hands
// back the target island's ID on a cargo drop so `courseTo` routes around every
// OTHER island but not around the one being delivered to.
function currentFollow(){
 if(!followId)return null;
 const job=jobs.active.find(j=>j.id===followId);
 if(!job||job.kind==='catch'){followId=null;return null;}
 // Resolved against the boat every time: a delivery aims at the standoff while
 // the landing is behind the island, and at the landing once it is in sight.
 const goal=jobGoal(job,simulation.boat);
 if(!goal)return null;
 return {job,goal,name:job.targetName,island:islandFromId(job.targetId)};
}
applyUpgrades();
exploration.pin=(exploration.atlasIds.length?nearestGoal(exploration,simulation.boat):ATLAS[0])?.id||null;
const state={...simulation.boat,time:0,near:false,mode:'title',controlled:false,fixture:false,aground:false,contactSeconds:0,reduced:settings.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches};
const view=createScene($('sea'),world);
const initialTier=(navigator.deviceMemory<=4||innerWidth*innerHeight*devicePixelRatio**2>4.4e6)?'low':'standard';
const quality=createQuality({apply:(tier,scale)=>view.setQuality(tier,scale),initial:settings.quality==='auto'?initialTier:settings.quality,mode:settings.quality});quality.start();
let simulationMs=0;
const touchCapable=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
let hintsFading=false;
const input=createInput({rudder:$('rudder'),ahead:$('ahead'),astern:$('astern'),
  zones:$('zones'),steerZone:$('zone-steer'),throttleZone:$('zone-throttle'),
  getScheme:()=>settings.helm,
  onFirstUse(used){
   // The hints go only when the player has actually done BOTH things. Then they
   // are done for good, in the save, not just for this session.
   if(!used.steer||!used.throttle||settings.helmHintsDone||hintsFading)return;
   hintsFading=true;$('thumbs').classList.add('fading');
   setTimeout(()=>{$('thumbs').hidden=true;},800);
   settings.helmHintsDone=true;save();
  },
  onPause(){if(state.mode==='water')mode('paused');else if(['paused','chart','board','settings'].includes(state.mode))mode('water');}});
function helmVisibility(value){
 const sailing=value==='water'&&!state.fixture,invisible=settings.helm==='invisible';
 // The speed readout lives inside #helm, so the invisible scheme keeps #helm on
 // screen and drops only the buttons — no permanent controls, but you can still
 // see how fast you are going.
 $('helm').hidden=!sailing;
 $('helm').inert=!sailing||invisible;
 $('helm').classList.toggle('status-only',invisible);
 $('zones').hidden=!sailing||!invisible;
 const wantHints=sailing&&invisible&&touchCapable&&!settings.helmHintsDone&&!hintsFading;
 $('thumbs').hidden=!wantHints;
 if(wantHints)$('thumbs').classList.remove('fading');
}
const ui=createUI({getState:()=>state,getExploration:()=>exploration,world,onChart:open=>mode(open?'chart':'water'),onPin:id=>{pinGoal(exploration,id);followId=null;ui.update(performance.now()/1000,true);},onSettings:open=>mode(open?'settings':'paused'),onRestart:restart,
  getJobs:()=>jobs,getBerth:currentBerth,getFollow:currentFollow,getFishingLevel:()=>levelForXp(fishing.xp),
  onBoard:open=>mode(open?'board':'water'),
  onTake(job){
   if(!acceptJob(jobs,job,{fishingLevel:levelForXp(fishing.xp),upgrades:jobs.upgrades,active:jobs.active},events))return;
   // Taking a delivery or a passage points the compass at it straight away:
   // the arrow is the only navigation this game has.
   if(job.kind!=='catch')followId=job.id;
   drainEvents();save();
  },
  onDrop(id){if(abandonJob(jobs,id,events)){if(followId===id)followId=null;drainEvents();save();}},
  onFollow(id){followId=id;save();},
  onBuy(key){if(buyUpgrade(jobs,key,events)){applyUpgrades();drainEvents();save();}}});
function save(){storage.save(simulation.boat,exploration,settings,fishing,jobs);saveAt=simulation.time;}
function restart(){exploration=createExploration();fishing=createFishing();jobs=createJobs();followId=null;exploration.pin=ATLAS[0].id;simulation=createSimulation({},world,0);applyUpgrades();Object.assign(state,simulation.boat,{time:0,fixture:false,controlled:false,aground:false,contactSeconds:0});view.effects.clear();view.resetCamera();$('discovery').hidden=true;saveAt=0;save();mode('water');render();}
$('sound').checked=settings.sound;$('reduced').checked=settings.reduced;$('quality').value=settings.quality;$('helm-mode').value=settings.helm;
$('helm-mode').onchange=()=>{settings.helm=$('helm-mode').value;input.clear();helmVisibility(state.mode);save();render();};
$('sound').onchange=()=>{settings.sound=$('sound').checked;audio.enable(settings.sound);save();};
$('reduced').onchange=()=>{settings.reduced=$('reduced').checked;state.reduced=settings.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;save();render();};
$('quality').onchange=()=>{settings.quality=$('quality').value;quality.setMode(settings.quality);save();render();};
$('cast').onclick=()=>{
 if(fishing.phase!=='idle'){reelIn(fishing);updateFishing();return;}
 if(startCast(fishing,simulation.boat,world.sampleShoreDistance(simulation.boat.x,simulation.boat.z),events))save();
 updateFishing();
};
function updateFishing(){
 const sailing=state.mode==='water'&&!state.fixture;
 $('fishing').hidden=!sailing;
 if(!sailing)return;
 const level=levelForXp(fishing.xp),busy=fishing.phase!=='idle';
 $('fish-skill').textContent=`Fishing ${level} · ${fishing.xp} xp`+(xpToNext(fishing.xp)?` · ${xpToNext(fishing.xp)} to next`:' · mastered');
 $('cast').disabled=!busy&&!canCast(fishing,simulation.boat);
 $('cast').firstChild.nodeValue=busy?'Reel in and stow ':'Cast a line ';
 $('fishing-live').hidden=!busy;
 if(!busy){$('fishing').classList.remove('taut');return;}
 const band=tensionBand(level,fishing.rod);
 $('tension-band').style.setProperty('--band-left',((.5-band/2)*100).toFixed(1)+'%');
 $('tension-band').style.setProperty('--band-width',(band*100).toFixed(1)+'%');
 $('tension-mark').style.setProperty('--mark',(fishing.tension*100).toFixed(1)+'%');
 const outside=Math.abs(fishing.tension-.5)>band/2;
 $('fishing').classList.toggle('taut',outside&&fishing.phase==='fighting');
 const water={reef:'over a reef',shore:'close in',open:'in open water'}[fishing.kind];
 $('fish-state').textContent=fishing.phase==='waiting'?`Line out ${water}. Waiting for a bite…`
  :fishing.phase==='fighting'?`Something is on. ${Math.round(fishing.progress*100)}% in`
  :fishing.phase==='landed'?'Landed.':'Gone.';
 $('fish-hint').textContent=fishing.phase!=='fighting'?'Hold the right of the screen, or space, to reel'
  :outside?(fishing.tension>.5?'Too tight — let it run':'Too slack — reel in'):'Good tension — keep it there';
}
$('discovery-close').onclick=()=>{$('discovery').hidden=true;};$('discovery-atlas').onclick=()=>{$('discovery').hidden=true;mode('chart');};
addEventListener('keydown',e=>{if(e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;if(e.code==='KeyM'&&state.mode!=='title')mode(state.mode==='chart'?'water':'chart');if(e.code==='KeyJ'&&state.mode!=='title'){if(state.mode==='board')mode('water');else if(currentBerth()?.open)mode('board');}if(e.code==='KeyQ'){settings.sound=!settings.sound;$('sound').checked=settings.sound;audio.enable(settings.sound);save();}});
addEventListener('pagehide',save);
addEventListener('keydown',e=>{if(e.code!=='Tab')return;const panel=state.mode==='chart'?$('chart'):state.mode==='board'?$('board'):state.mode==='settings'?$('settings'):null;if(!panel)return;const targets=[...panel.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length);if(!targets.length)return;const first=targets[0],last=targets.at(-1);if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}});
function updateHUD(){
  const degrees=((state.yaw*180/Math.PI)%360+360)%360,names=['N','NE','E','SE','S','SW','W','NW'];
  $('bearing').innerHTML=names[Math.round(degrees/45)%8]+' <span>'+String(Math.round(degrees)%360).padStart(3,'0')+'°</span>';
  $('speed').textContent=(Math.abs(forwardSpeed(state))*1.94384).toFixed(1)+' kn';
  $('turn').textContent=state.yaw<0?'Look east ↗':'Look west ↗';$('height').textContent=state.near?'Above the water':'At the waterline';
}
function render(dt=0){
  // Publish the routed course to the renderer's goal beacon. It falls back to
  // reading window.sunwake's pin on its own, but this hands it the whole course
  // object so a detour lights the island we are actually steering at.
  // Whatever the compass is actually aimed at gets the beacon: a followed job's
  // island when one is followed, the atlas pin otherwise.
  const follow=currentFollow();
  const page=follow?follow.island:ATLAS.find(i=>i.id===exploration.pin);
  // NOTE the order: ui.course()'s own `goal` is the island ID string, so it must
  // be spread BEFORE the island object or the beacon gets a string and silently
  // computes NaN ranges.
  view.setCourse?.(page?{...ui.course(),goal:page}:{goal:null});
  view.render(state,dt);const now=performance.now()/1000;if(now-hudAt>=.1||dt===0){updateHUD();updateFishing();ui.update(now,dt===0);const q=quality.snapshot();$('performance').textContent=`${q.fps.toFixed(0)} fps · ${q.tier} · ${Math.round(q.scale*100)}% resolution${q.emergencyOverride?' · performance override':''}${q.failed?' · 30 fps not sustained on this device':''}`;hudAt=now;}if(discoveryUntil&&simulation.time>discoveryUntil){$('discovery').hidden=true;discoveryUntil=0;}}
function mode(value){const previousMode=state.mode;state.mode=value;quality.reset();input.clear();testInput=null;resetAccumulator(simulation);last=performance.now();$('title').hidden=value!=='title';$('paused').hidden=value!=='paused';$('pause').hidden=value!=='water';$('chart-open').hidden=value!=='water';helmVisibility(value);$('fishing').hidden=value!=='water'||state.fixture;$('study').hidden=value!=='water'||!state.fixture;$('chart').hidden=value!=='chart';$('board').hidden=value!=='board';$('settings').hidden=value!=='settings';$('hud').inert=['chart','board','settings'].includes(value);audio.pause(value!=='water');if(value!=='water'&&value!=='title')save();ui.update(performance.now()/1000,true);if(value==='chart'){$('discovery').hidden=true;ui.refreshCards();ui.chart();$('chart-close').focus();}
 // The board is painted from the island you are actually alongside. If you have
 // drifted off it by the time it opens, fall back to the sea rather than show a
 // stale harbour.
 if(value==='board'){$('discovery').hidden=true;if(!ui.board()){mode('water');return;}$('board-close').focus();}
 if(value==='settings')$('settings-close').focus();if(value==='water'&&['chart','board','settings','paused'].includes(previousMode))$('sea').focus();}
$('start').textContent=saved?'Continue voyage ↗':'Cast off ↗';
$('start').onclick=()=>{state.fixture=false;audio.enable(settings.sound);mode('water');$('sea').focus();};$('pause').onclick=()=>mode('paused');$('resume').onclick=()=>mode('water');
$('turn').onclick=()=>fixtureView({yaw:state.yaw<0?Math.PI/2:-Math.PI/2});$('height').onclick=()=>fixtureView({near:!state.near});
addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='water')mode('paused');});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{state.reduced=settings.reduced||e.matches;render();});
const snapshot=()=>{const metrics=view.metrics();return {...state,...metrics,clearance:world.clearance(state.x,state.z),shoreDistance:world.sampleShoreDistance(state.x,state.z),exploration:JSON.parse(JSON.stringify(exploration)),fishing:{...fishing,level:levelForXp(fishing.xp),band:tensionBand(levelForXp(fishing.xp),fishing.rod),canCast:canCast(fishing,simulation.boat)},settings:{...settings},performance:quality.snapshot(),simulationMs,dense,islands:metrics.islandMeshes,worldStats:world.stats(),boat:{...simulation.boat},simulationTime:simulation.time,steps:simulation.steps,accumulator:simulation.accumulator,input:input.read(false),inputDevice:input.device,jobs:{coins:jobs.coins,earned:jobs.earned,completed:jobs.completed,seconds:jobs.seconds,day:dayOf(jobs.seconds),upgrades:{...jobs.upgrades},active:jobs.active.map(j=>({id:j.id,kind:j.kind,title:j.title,coins:j.coins,progress:j.progress,count:j.count||0,targetId:j.targetId||null,targetName:j.targetName||null,targetX:j.targetX??null,targetZ:j.targetZ??null,dropX:j.dropX??null,dropZ:j.dropZ??null})),follow:followId,berth:(()=>{const b=currentBerth();return b?{id:b.island.id,name:b.island.landmark||null,gap:b.gap,known:b.known,open:b.open,reason:b.reason}:null;})()},helm:{scheme:settings.helm,hintsDone:settings.helmHintsDone,used:{...input.used},zones:input.zones,hintsVisible:!$('thumbs').hidden,zonesVisible:!$('zones').hidden,buttonsVisible:!$('helm').hidden&&settings.helm!=='invisible'}};};
const discoveryList=[],events=[];
/**
 * Everything the model wants to tell the player. Pulled out of `onStep` so the
 * job board can drain it too: taking a job, giving one up and buying a rod all
 * raise events from a click, not from a simulation step.
 */
function drainEvents(){
 while(events.length){const event=events.shift();
  if(event.type==='landmark'){ui.postcard(event.id);audio.discover(ATLAS.findIndex(p=>p.id===event.id));discoveryUntil=simulation.time+10;view.boat.userData.discover?.(simulation.time);}
  if(event.type==='island'){ui.notice(event.name+' · arrival recorded');setTimeout(()=>{$('notice').hidden=true;},5000);}
  // Stow the rod the moment the fight ends. Resetting the phase at the end of
  // the HUD update instead left the panel painted with the finished state and
  // the cast button still saying "Reel in and stow".
  if(event.type==='landed'){
   // A fish is worth coins as well as xp, and it counts against any catch job
   // in the logbook. Both go through the jobs model, which raises its own
   // events — appended to this same queue and drained by this same loop.
   const species=fishing.species;
   const coins=species?payFish(jobs,species,event.kg,events):0;
   ui.notice(`${event.name} · ${event.kg.toFixed(2)} kg · +${event.xp} xp · ◎ ${coins}`);
   setTimeout(()=>{$('notice').hidden=true;},5000);audio.discover(2);fishing.phase='idle';
   noteCatch(jobs,event.id,events);
  }
  if(event.type==='level')ui.notice('Fishing level '+event.level);
  if(event.type==='lost'){ui.notice('The line came back empty — '+event.reason);setTimeout(()=>{$('notice').hidden=true;},5000);fishing.phase='idle';}
  if(event.type==='job-taken')ui.notice('Job taken · '+event.title+' · ◎ '+event.coins+' on delivery');
  if(event.type==='job-progress'){ui.notice(`${event.title} · ${event.progress} of ${event.count}`);setTimeout(()=>{$('notice').hidden=true;},5000);}
  if(event.type==='job-done'){
   if(followId===event.id)followId=null;
   ui.notice('Job complete · '+event.title+' · ◎ '+event.coins);
   setTimeout(()=>{$('notice').hidden=true;},6000);audio.discover(4);
  }
  if(event.type==='job-dropped'){ui.notice('Given up · '+event.title);setTimeout(()=>{$('notice').hidden=true;},4000);}
  if(event.type==='upgrade'){ui.notice(UPGRADES[event.key].name+' → '+event.level+' · ◎ '+event.cost);setTimeout(()=>{$('notice').hidden=true;},5000);}
  save();if(event.type==='complete')mode('chart');
 }
}
const onStep=(b,t,dt,scratch)=>{
 view.effects.step(b,t,dt,scratch);
 if(state.mode!=='water'||state.fixture)return;
 // Sustained shore contact under power with no way on is "aground". The HUD has
 // to say so: grinding silently along a shore at 0.4 kn while the compass still
 // reads 483 m is exactly what made the second leg look like a broken waypoint.
 state.contactSeconds=scratch.contact?.contacts?state.contactSeconds+dt:0;
 state.aground=state.contactSeconds>.6&&Math.hypot(b.vx,b.vz)<1.5;
 state.agroundOn=state.aground?scratch.contact?.island??state.agroundOn:null;
 exploration.distanceM+=Math.hypot(b.x-simulation.previous.x,b.z-simulation.previous.z);
 stepExploration(exploration,b,world.nearby(b.x,b.z,80,discoveryList),dt,events);
 stepFishing(fishing,b,dt,input.reeling,events);
 stepJobs(jobs,b,dt,events);
 drainEvents();
 audio.update(forwardSpeed(b));if(t-saveAt>=15)save();
};
function fixtureView(options={}){
  state.controlled=true;state.fixture=true;
  for(const k of ['time','x','z','yaw','near'])if(k in options){if(k!=='near'&&!Number.isFinite(options[k]))throw new Error('View values must be finite');state[k]=options[k];}
  simulation=createSimulation({x:state.x,z:state.z,yaw:state.yaw},world,state.time);applyUpgrades();Object.assign(state,simulation.boat);view.effects.clear();view.resetCamera();mode('water');render();return snapshot();
}
function setPose(options={}){
  for(const [key,value]of Object.entries(options))if(!['x','z','yaw','vx','vz','y','vy','pitch','roll','pitchRate','rollRate','yawRate'].includes(key)||!Number.isFinite(value))throw new Error('Invalid pose');
  simulation=createSimulation(options,world,0);applyUpgrades();Object.assign(state,simulation.boat,{time:0,near:false,fixture:false,controlled:true});view.effects.clear();view.resetCamera();mode('water');render();return snapshot();
}
Object.defineProperty(window,'sunwake',{get:()=>Object.freeze(snapshot())});
if(test)window.sunwakeTest=Object.freeze({snapshot,setView:fixtureView,setPose,reset:()=>setPose(),restartVoyage(){restart();state.controlled=true;return snapshot();},save,setInput(value){if(value===null){testInput=null;return;}for(const k of ['throttle','steer'])if(k in value&&(!Number.isFinite(value[k])||Math.abs(value[k])>1))throw new Error('Invalid input');testInput={throttle:value.throttle||0,steer:value.steer||0};},advance(ticks=1){if(!Number.isInteger(ticks)||ticks<0||ticks>36000)throw new Error('Invalid tick count');state.controlled=true;state.fixture=false;for(let i=0;i<ticks;i++)if(state.mode==='water'){tickSimulation(simulation,testInput||input.read(),onStep);Object.assign(state,simulation.boat,{time:simulation.time});view.updateCamera(state,1/60);}resetAccumulator(simulation);interpolateSimulation(simulation,state);render();return snapshot();},setQuality(tier){view.setQuality(tier);render();return snapshot();},setOrigin(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Origin must be finite');view.setOrigin(x,z);render();},probeWaves(x=state.x,z=state.z,time=state.time){if(![x,z,time].every(Number.isFinite))throw new Error('Probe values must be finite');const result=view.probeWaves(x,z,time);render();return result;},resumeTime(){state.controlled=false;state.fixture=false;resetAccumulator(simulation);last=performance.now();mode('water');},setReducedMotion(value){state.reduced=!!value;render();},
  // D1's hard constraint, measured on the geometry that is actually drawn:
  // no vertex above the decorative apron may leave the collision circle.
  islandAudit(){
    const report=[];
    for(const mesh of view.islands?.meshes||[]){
      const island=mesh.userData.island,position=mesh.geometry.attributes.position.array;
      let aboveWater=0,anywhere=0,lowest=Infinity,highest=-Infinity;
      for(let i=0;i<position.length;i+=3){
        const radius=Math.hypot(position[i],position[i+2]);
        anywhere=Math.max(anywhere,radius);
        if(position[i+1]>-1.45)aboveWater=Math.max(aboveWater,radius);
        lowest=Math.min(lowest,position[i+1]);highest=Math.max(highest,position[i+1]);
      }
      report.push({id:island.id,radius:island.radius,height:island.height,profile:island.profile,
        landmark:island.landmark,lod:mesh.userData.lod,aboveWater,anywhere,lowest,highest,
        triangles:position.length/9});
    }
    return report;
  },
  streamStats:()=>view.islands?.stats()??null});
render();window.sunwakeBoot();addEventListener('resize',()=>render());
function frame(now){const dt=Math.max(0,(now-last)/1000);last=now;
  if(!window.__SUNWAKE_FAILED__&&!state.controlled&&['title','water'].includes(state.mode)&&!document.hidden){if(state.mode==='water')quality.sample(dt*1000);const stepStart=performance.now();stepSimulation(simulation,state.mode==='water'?input.read():{},dt,onStep);simulationMs=performance.now()-stepStart;interpolateSimulation(simulation,state);render(Math.min(dt,.067));}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
