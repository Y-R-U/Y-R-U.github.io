import {createScene} from './render/scene.mjs';
import {createSimulation,stepSimulation,tickSimulation,interpolateSimulation,resetAccumulator} from './core/simulation.mjs';
import {createInput} from './platform/input.mjs';
import {forwardSpeed} from './core/boat.mjs';
import {createWorld} from './core/world.mjs';
const $=id=>document.getElementById(id),test=new URLSearchParams(location.search).get('test')==='1';
const world=createWorld();
let simulation=createSimulation({},world,0),testInput=null,last=performance.now();
const state={...simulation.boat,time:0,near:false,mode:'title',controlled:false,fixture:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
const view=createScene($('sea'),world);
const input=createInput({rudder:$('rudder'),ahead:$('ahead'),astern:$('astern'),onPause(){if(state.mode==='water')mode('paused');else if(state.mode==='paused')mode('water');}});
function updateHUD(){
  const degrees=((state.yaw*180/Math.PI)%360+360)%360,names=['N','NE','E','SE','S','SW','W','NW'];
  $('bearing').innerHTML=names[Math.round(degrees/45)%8]+' <span>'+String(Math.round(degrees)%360).padStart(3,'0')+'°</span>';
  $('speed').textContent=(Math.abs(forwardSpeed(state))*1.94384).toFixed(1)+' kn';
  $('turn').textContent=state.yaw<0?'Look east ↗':'Look west ↗';$('height').textContent=state.near?'Above the water':'At the waterline';
}
function render(dt=0){view.render(state,dt);updateHUD();}
function mode(value){state.mode=value;input.clear();testInput=null;resetAccumulator(simulation);last=performance.now();$('title').hidden=value!=='title';$('paused').hidden=value!=='paused';$('pause').hidden=value!=='water';$('helm').hidden=value!=='water'||state.fixture;$('study').hidden=value!=='water'||!state.fixture;}
$('start').onclick=()=>{state.fixture=false;mode('water');$('sea').focus();};$('pause').onclick=()=>mode('paused');$('resume').onclick=()=>mode('water');
$('turn').onclick=()=>fixtureView({yaw:state.yaw<0?Math.PI/2:-Math.PI/2});$('height').onclick=()=>fixtureView({near:!state.near});
addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='water')mode('paused');});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{state.reduced=e.matches;render();});
const snapshot=()=>{const metrics=view.metrics();return {...state,...metrics,clearance:world.clearance(state.x,state.z),shoreDistance:world.sampleShoreDistance(state.x,state.z),islands:metrics.islandMeshes,worldStats:world.stats(),boat:{...simulation.boat},simulationTime:simulation.time,steps:simulation.steps,accumulator:simulation.accumulator,input:input.read(false),inputDevice:input.device};};
const onStep=(b,t,dt,scratch)=>view.effects.step(b,t,dt,scratch);
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
if(test)window.sunwakeTest=Object.freeze({snapshot,setView:fixtureView,setPose,reset:()=>setPose(),setInput(value){if(value===null){testInput=null;return;}for(const k of ['throttle','steer'])if(k in value&&(!Number.isFinite(value[k])||Math.abs(value[k])>1))throw new Error('Invalid input');testInput={throttle:value.throttle||0,steer:value.steer||0};},advance(ticks=1){if(!Number.isInteger(ticks)||ticks<0||ticks>36000)throw new Error('Invalid tick count');state.controlled=true;state.fixture=false;for(let i=0;i<ticks;i++)if(state.mode==='water'){tickSimulation(simulation,testInput||input.read(),onStep);Object.assign(state,simulation.boat,{time:simulation.time});view.updateCamera(state,1/60);}resetAccumulator(simulation);interpolateSimulation(simulation,state);render();return snapshot();},setQuality(tier){view.setQuality(tier);render();return snapshot();},setOrigin(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Origin must be finite');view.setOrigin(x,z);render();},probeWaves(x=state.x,z=state.z,time=state.time){if(![x,z,time].every(Number.isFinite))throw new Error('Probe values must be finite');const result=view.probeWaves(x,z,time);render();return result;},resumeTime(){state.controlled=false;state.fixture=false;resetAccumulator(simulation);last=performance.now();mode('water');},setReducedMotion(value){state.reduced=!!value;render();},
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
  if(!window.__SUNWAKE_FAILED__&&!state.controlled&&state.mode!=='paused'&&!document.hidden){stepSimulation(simulation,state.mode==='water'?input.read():{},dt,onStep);interpolateSimulation(simulation,state);render(Math.min(dt,.067));}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
