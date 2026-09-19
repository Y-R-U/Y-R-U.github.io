import {ATLAS,islandName} from './content.mjs';
export const DISCOVERY_SECONDS=2,DISCOVERY_MARGIN=32,DISCOVERY_SPEED=3,MAX_VISITS=256;
export function nearestGoal(state,boat){return ATLAS.filter(i=>!state.atlasIds.includes(i.id)).sort((a,b)=>Math.hypot(a.x-boat.x,a.z-boat.z)-Math.hypot(b.x-boat.x,b.z-boat.z))[0]||null;}
export function createExploration(save=null){return {atlasIds:[...(save?.atlasIds||[])],ordinaryVisits:[...(save?.ordinaryVisits||[])],visitCount:save?.visitCount||0,distanceM:save?.distanceM||0,pin:null,dwellId:null,dwell:0,complete:(save?.atlasIds.length||0)===6};}
export function pinGoal(state,id){if(ATLAS.some(i=>i.id===id)){state.pin=id;return true;}return false;}
export function stepExploration(state,boat,nearby,dt,events){
 if(!state.pin)state.pin=nearestGoal(state,boat)?.id||null;
 let candidate=null;
 if(Math.hypot(boat.vx,boat.vz)<DISCOVERY_SPEED){
  for(const i of nearby){
   if(state.atlasIds.includes(i.id)||state.ordinaryVisits.some(v=>v.id===i.id))continue;
   const d=Math.hypot(boat.x-i.x,boat.z-i.z);
   if(d>=i.radius+2.6-1e-6&&d<=i.radius+DISCOVERY_MARGIN){candidate=i;break;}
  }
 }
 if(!candidate){state.dwellId=null;state.dwell=0;return;}
 if(state.dwellId!==candidate.id){state.dwellId=candidate.id;state.dwell=0;}
 state.dwell+=dt;if(state.dwell+1e-9<DISCOVERY_SECONDS)return;
 state.dwell=0;state.dwellId=null;
 if(candidate.landmark){
  state.atlasIds.push(candidate.id);state.pin=nearestGoal(state,boat)?.id||null;
  events.push({type:'landmark',id:candidate.id});
  if(state.atlasIds.length===6&&!state.complete){state.complete=true;events.push({type:'complete'});}
 }else{
  state.ordinaryVisits.push({id:candidate.id,x:candidate.x,z:candidate.z,name:islandName(candidate)});
  if(state.ordinaryVisits.length>MAX_VISITS)state.ordinaryVisits.shift();
  state.visitCount++;events.push({type:'island',id:candidate.id,name:islandName(candidate)});
 }
}
