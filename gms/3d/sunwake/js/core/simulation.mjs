import {FIXED_DT} from './config.mjs';
import {createBoat,stepBoat} from './boat.mjs';
export function createSimulation(spawn={},world={},time=0){
  const boat=createBoat(spawn,world,time);
  return {boat,previous:{...boat},world,time,previousTime:time,accumulator:0,steps:0,scratch:{}};
}
export function tickSimulation(s,input,onStep){
  Object.assign(s.previous,s.boat);s.previousTime=s.time;
  stepBoat(s.boat,input,s.world,s.time,FIXED_DT,s.scratch);s.steps++;s.time+=FIXED_DT;
  onStep?.(s.boat,s.time,FIXED_DT,s.scratch);
}
export function stepSimulation(s,input,frameDt,onStep){
  s.accumulator+=Math.max(0,Math.min(Number.isFinite(frameDt)?frameDt:0,.067));let count=0;
  while(s.accumulator+1e-12>=FIXED_DT&&count<4){tickSimulation(s,input,onStep);s.accumulator=Math.max(0,s.accumulator-FIXED_DT);count++;}
  if(s.accumulator>=FIXED_DT)s.accumulator%=FIXED_DT;
  return count;
}
export function interpolateSimulation(s,out={}){
  const alpha=s.accumulator/FIXED_DT;
  for(const key of Object.keys(s.boat))out[key]=s.previous[key]+(s.boat[key]-s.previous[key])*alpha;
  out.time=s.previousTime+(s.time-s.previousTime)*alpha;
  // A straight lerp between two safe positions can cut a convex shore corner.
  // Correct the rendered centre only; simulation state is never touched.
  if(s.world?.clearCentre){const c=s.world.clearCentre(out.x,out.z,s.centre||(s.centre={}));out.x=c.x;out.z=c.z;}
  return out;
}
export function resetAccumulator(s){s.accumulator=0;Object.assign(s.previous,s.boat);s.previousTime=s.time;}
