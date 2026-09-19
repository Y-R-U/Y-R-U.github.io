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
import {createStorage} from './platform/storage.mjs';
import {createUI} from './platform/ui.mjs';
import {createAudio} from './platform/audio.mjs';
const $=id=>document.getElementById(id),test=new URLSearchParams(location.search).get('test')==='1';
const storage=createStorage(text=>{$('notice').textContent=text;$('notice').hidden=false;}),saved=storage.load();
const dense=test&&new URLSearchParams(location.search).get('fixture')==='dense';
const world=createWorld(dense?{generate:(cx,cz)=>{const authored=LANDMARKS.find(i=>i.cx===cx&&i.cz===cz);if(authored)return authored;if(cx===0&&cz===0)return null;return {id:cx+':'+cz,cx,cz,x:(cx+.5)*CHUNK,z:(cz+.5)*CHUNK,radius:64,height:24,profile:['mesa','garden','split'][Math.abs(cx+cz)%3],landmark:null,seed:hash32(SEED,cx,cz,7)};}}:{}),settings={...DEFAULT_SETTINGS,...saved?.settings},audio=createAudio();
let exploration=createExploration(saved),simulation=createSimulation(saved?.position||{},world,0),testInput=null,last=performance.now(),hudAt=-Infinity,saveAt=0,discoveryUntil=0;
exploration.pin=(exploration.atlasIds.length?nearestGoal(exploration,simulation.boat):ATLAS[0])?.id||null;
const state={...simulation.boat,time:0,near:false,mode:'title',controlled:false,fixture:false,reduced:settings.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches};
const view=createScene($('sea'),world);
const initialTier=(navigator.deviceMemory<=4||innerWidth*innerHeight*devicePixelRatio**2>4.4e6)?'low':'standard';
const quality=createQuality({apply:(tier,scale)=>view.setQuality(tier,scale),initial:settings.quality==='auto'?initialTier:settings.quality,mode:settings.quality});quality.start();
let simulationMs=0;
const input=createInput({rudder:$('rudder'),ahead:$('ahead'),astern:$('astern'),onPause(){if(state.mode==='water')mode('paused');else if(['paused','chart','settings'].includes(state.mode))mode('water');}});
const ui=createUI({getState:()=>state,getExploration:()=>exploration,world,onChart:open=>mode(open?'chart':'water'),onPin:id=>{pinGoal(exploration,id);ui.update(performance.now()/1000,true);},onSettings:open=>mode(open?'settings':'paused'),onRestart:restart});
function save(){storage.save(simulation.boat,exploration,settings);saveAt=simulation.time;}
function restart(){exploration=createExploration();exploration.pin=ATLAS[0].id;simulation=createSimulation({},world,0);Object.assign(state,simulation.boat,{time:0,fixture:false,controlled:false});view.effects.clear();view.resetCamera();$('discovery').hidden=true;saveAt=0;save();mode('water');render();}
$('sound').checked=settings.sound;$('reduced').checked=settings.reduced;$('quality').value=settings.quality;
$('sound').onchange=()=>{settings.sound=$('sound').checked;audio.enable(settings.sound);save();};
$('reduced').onchange=()=>{settings.reduced=$('reduced').checked;state.reduced=settings.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;save();render();};
$('quality').onchange=()=>{settings.quality=$('quality').value;quality.setMode(settings.quality);save();render();};
$('discovery-close').onclick=()=>{$('discovery').hidden=true;};$('discovery-atlas').onclick=()=>{$('discovery').hidden=true;mode('chart');};
addEventListener('keydown',e=>{if(e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;if(e.code==='KeyM'&&state.mode!=='title')mode(state.mode==='chart'?'water':'chart');if(e.code==='KeyQ'){settings.sound=!settings.sound;$('sound').checked=settings.sound;audio.enable(settings.sound);save();}});
addEventListener('pagehide',save);
addEventListener('keydown',e=>{if(e.code!=='Tab')return;const panel=state.mode==='chart'?$('chart'):state.mode==='settings'?$('settings'):null;if(!panel)return;const targets=[...panel.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length);if(!targets.length)return;const first=targets[0],last=targets.at(-1);if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}});
function updateHUD(){
  const degrees=((state.yaw*180/Math.PI)%360+360)%360,names=['N','NE','E','SE','S','SW','W','NW'];
  $('bearing').innerHTML=names[Math.round(degrees/45)%8]+' <span>'+String(Math.round(degrees)%360).padStart(3,'0')+'°</span>';
  $('speed').textContent=(Math.abs(forwardSpeed(state))*1.94384).toFixed(1)+' kn';
  $('turn').textContent=state.yaw<0?'Look east ↗':'Look west ↗';$('height').textContent=state.near?'Above the water':'At the waterline';
}
function render(dt=0){view.render(state,dt);const now=performance.now()/1000;if(now-hudAt>=.1||dt===0){updateHUD();ui.update(now,dt===0);const q=quality.snapshot();$('performance').textContent=`${q.fps.toFixed(0)} fps · ${q.tier} · ${Math.round(q.scale*100)}% resolution${q.emergencyOverride?' · performance override':''}${q.failed?' · 30 fps not sustained on this device':''}`;hudAt=now;}if(discoveryUntil&&simulation.time>discoveryUntil){$('discovery').hidden=true;discoveryUntil=0;}}
function mode(value){const previousMode=state.mode;state.mode=value;quality.reset();input.clear();testInput=null;resetAccumulator(simulation);last=performance.now();$('title').hidden=value!=='title';$('paused').hidden=value!=='paused';$('pause').hidden=value!=='water';$('chart-open').hidden=value!=='water';$('helm').hidden=value!=='water'||state.fixture;$('study').hidden=value!=='water'||!state.fixture;$('chart').hidden=value!=='chart';$('settings').hidden=value!=='settings';$('hud').inert=['chart','settings'].includes(value);$('helm').inert=value!=='water';audio.pause(value!=='water');if(value!=='water'&&value!=='title')save();ui.update(performance.now()/1000,true);if(value==='chart'){$('discovery').hidden=true;ui.refreshCards();ui.chart();$('chart-close').focus();}if(value==='settings')$('settings-close').focus();if(value==='water'&&['chart','settings','paused'].includes(previousMode))$('sea').focus();}
$('start').textContent=saved?'Continue voyage ↗':'Cast off ↗';
$('start').onclick=()=>{state.fixture=false;audio.enable(settings.sound);mode('water');$('sea').focus();};$('pause').onclick=()=>mode('paused');$('resume').onclick=()=>mode('water');
$('turn').onclick=()=>fixtureView({yaw:state.yaw<0?Math.PI/2:-Math.PI/2});$('height').onclick=()=>fixtureView({near:!state.near});
addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='water')mode('paused');});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{state.reduced=settings.reduced||e.matches;render();});
const snapshot=()=>{const metrics=view.metrics();return {...state,...metrics,clearance:world.clearance(state.x,state.z),shoreDistance:world.sampleShoreDistance(state.x,state.z),exploration:JSON.parse(JSON.stringify(exploration)),settings:{...settings},performance:quality.snapshot(),simulationMs,dense,islands:metrics.islandMeshes,worldStats:world.stats(),boat:{...simulation.boat},simulationTime:simulation.time,steps:simulation.steps,accumulator:simulation.accumulator,input:input.read(false),inputDevice:input.device};};
const discoveryList=[],events=[];
const onStep=(b,t,dt,scratch)=>{
 view.effects.step(b,t,dt,scratch);
 if(state.mode!=='water'||state.fixture)return;
 exploration.distanceM+=Math.hypot(b.x-simulation.previous.x,b.z-simulation.previous.z);
 stepExploration(exploration,b,world.nearby(b.x,b.z,80,discoveryList),dt,events);
 while(events.length){const event=events.shift();
  if(event.type==='landmark'){ui.postcard(event.id);audio.discover(ATLAS.findIndex(p=>p.id===event.id));discoveryUntil=t+10;view.boat.userData.discover?.(t);}
  if(event.type==='island'){ui.notice(event.name+' · arrival recorded');setTimeout(()=>{$('notice').hidden=true;},5000);}
  save();if(event.type==='complete')mode('chart');
 }
 audio.update(forwardSpeed(b));if(t-saveAt>=15)save();
};
function fixtureView(options={}){
  state.controlled=true;state.fixture=true;
  for(const k of ['time','x','z','yaw','near'])if(k in options){if(k!=='near'&&!Number.isFinite(options[k]))throw new Error('View values must be finite');state[k]=options[k];}
  simulation=createSimulation({x:state.x,z:state.z,yaw:state.yaw},world,state.time);Object.assign(state,simulation.boat);view.effects.clear();view.resetCamera();mode('water');render();return snapshot();
}
function setPose(options={}){
  for(const [key,value]of Object.entries(options))if(!['x','z','yaw','vx','vz','y','vy','pitch','roll','pitchRate','rollRate','yawRate'].includes(key)||!Number.isFinite(value))throw new Error('Invalid pose');
  simulation=createSimulation(options,world,0);Object.assign(state,simulation.boat,{time:0,near:false,fixture:false,controlled:true});view.effects.clear();view.resetCamera();mode('water');render();return snapshot();
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
