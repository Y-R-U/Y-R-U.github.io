import assert from 'node:assert/strict';
import {ATLAS,islandName} from '../js/core/content.mjs';
import {createExploration,stepExploration,nearestGoal,MAX_VISITS} from '../js/core/exploration.mjs';
import {encodeSave,decodeSave,DEFAULT_SETTINGS} from '../js/core/save.mjs';
import {createWorld,generateIsland} from '../js/core/world.mjs';
import {createSimulation,tickSimulation} from '../js/core/simulation.mjs';
export function exploration(){
 const state=createExploration(),events=[],world=createWorld();
 for(const page of ATLAS){const boat={x:page.x+page.radius+20,z:page.z,vx:0,vz:0};assert.ok(world.clearance(boat.x,boat.z)>=0);
  stepExploration(state,boat,[page],1.9,events);assert.ok(!state.atlasIds.includes(page.id));
  stepExploration(state,{...boat,vx:3},[page],.1,events);assert.equal(state.dwell,0);
  stepExploration(state,boat,[page],1.9,events);assert.ok(!state.atlasIds.includes(page.id));
  stepExploration(state,boat,[],.1,events);assert.equal(state.dwell,0);
  for(let i=0;i<120;i++)stepExploration(state,boat,[page],1/60,events);
  assert.ok(state.atlasIds.includes(page.id));assert.equal(state.pin,nearestGoal(state,boat)?.id||null);
  stepExploration(state,boat,[page],4,events);
 }
 assert.equal(events.filter(e=>e.type==='landmark').length,6);assert.equal(events.filter(e=>e.type==='complete').length,1);
 for(let k=0;k<300;k++){const i={id:k+':10',cx:k,cz:10,x:k*384,z:4000,radius:30};stepExploration(state,{x:i.x+40,z:i.z,vx:0,vz:0},[i],2,events);}
 assert.equal(state.ordinaryVisits.length,MAX_VISITS);assert.equal(state.visitCount,300);assert.equal(islandName(generateIsland(-1,0)),'Lantern Key');
 const text=encodeSave({x:12,z:18,yaw:1},state,DEFAULT_SETTINGS),save=decodeSave(text);assert.equal(save.atlasIds.length,6);assert.equal(save.ordinaryVisits.length,256);
 for(const value of ['{','null','{}','{"version":9}',text.replace('"x":12','"x":1e999')])assert.equal(decodeSave(value),null);
 const dirty=JSON.parse(text);dirty.atlasIds.push('made-up',dirty.atlasIds[0]);dirty.ordinaryVisits.push({id:'<script>',x:1,z:2});assert.equal(decodeSave(JSON.stringify(dirty)).atlasIds.length,6);
 const page=ATLAS[0],s=createSimulation({x:page.x,z:page.z},world);assert.ok(world.clearance(s.boat.x,s.boat.z)>=0);assert.equal(s.boat.vx,0);
 // Sail the production launch from default spawn, steering by the actual pin.
 const route=createSimulation({},world),arrival=createExploration();let ticks=0;
 for(;ticks<7200&&!arrival.atlasIds.includes(page.id);ticks++){
  const b=route.boat,dist=Math.hypot(page.x-b.x,page.z-b.z),angle=Math.atan2(page.x-b.x,page.z-b.z),err=Math.atan2(Math.sin(angle-b.yaw),Math.cos(angle-b.yaw));
  tickSimulation(route,{steer:Math.max(-1,Math.min(1,err*2)),throttle:dist>page.radius+62?1:dist>page.radius+23?.05:0});
  stepExploration(arrival,route.boat,world.nearby(b.x,b.z,80,[]),1/60,[]);assert.ok(world.clearance(b.x,b.z)>=0);
 }
 assert.ok(arrival.atlasIds.includes(page.id),'Lantern Key reachable from spawn by sailing');
 return {landmarks:6,completionEvents:1,ordinaryVisits:state.visitCount,savedOrdinary:save.ordinaryVisits.length,lanternSailSeconds:ticks/60,saveBytes:text.length};
}
