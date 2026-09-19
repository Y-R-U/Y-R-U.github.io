import assert from 'node:assert/strict';
import {BOAT,FIXED_DT} from '../js/core/config.mjs';
import {createBoat,stepBoat,forwardSpeed,targetImmersion,hullPoint} from '../js/core/boat.mjs';
import {createSimulation,stepSimulation,resetAccumulator} from '../js/core/simulation.mjs';
const flat={sampleWave(x,z,t,out){return Object.assign(out,{height:0,dx:0,dz:0,dt:0});}};
function run(b,input,seconds,world=flat){const scratch={};for(let i=0;i<Math.round(seconds*60);i++)stepBoat(b,input,world,i/60,FIXED_DT,scratch);return b;}
export function handling(){
  const settled=run(createBoat({y:.7,pitch:.12,roll:-.15},flat),{},15);
  assert.ok(Math.abs(.25-settled.y-targetImmersion)<.02);assert.ok(Math.abs(settled.pitch)<.001&&Math.abs(settled.roll)<.001);
  const ahead=run(createBoat({},flat),{throttle:1},30),reverse=run(createBoat({},flat),{throttle:-1},30);
  assert.ok(forwardSpeed(ahead)>=7.5&&forwardSpeed(ahead)<=8.5);assert.ok(forwardSpeed(reverse)>=-2.4&&forwardSpeed(reverse)<=-1.8);
  const turning=run({...ahead},{throttle:1,steer:1},30);assert.ok(turning.yawRate>=.38&&turning.yawRate<=.48);
  const coast=createBoat({vx:-8},flat);let coastTime=0;while(forwardSpeed(coast)>1&&coastTime<30){stepBoat(coast,{},flat,coastTime,FIXED_DT,{});coastTime+=FIXED_DT;}assert.ok(coastTime>=8&&coastTime<=15);
  const yaw=run(createBoat({yawRate:1},flat),{},5);assert.ok(Math.abs(yaw.yawRate)<.0001);
  const resting=run(createBoat({},flat),{steer:1},3);assert.equal(resting.yawRate,0);
  const reverseTurn=run({...reverse},{throttle:-1,steer:1},10);assert.ok(reverseTurn.yawRate<0);
  // Verify point velocities against the exact render-transform finite difference.
  const b={...ahead,pitch:.1,roll:-.13,yawRate:.4,pitchRate:.2,rollRate:-.3,vy:.5},p=hullPoint(b,BOAT.points[3]),e=1e-6;
  const moved={...b,x:b.x+b.vx*e,y:b.y+b.vy*e,z:b.z+b.vz*e,pitch:b.pitch+b.pitchRate*e,roll:b.roll+b.rollRate*e,yaw:b.yaw+b.yawRate*e},q=hullPoint(moved,BOAT.points[3]);
  for(const axis of ['x','y','z'])assert.ok(Math.abs((q[axis]-p[axis])/e-p['v'+axis])<1e-5);
  let maxPitch=0,maxRoll=0;const live=createBoat(),scratch={};
  for(let i=0;i<600*60;i++){const t=i/60;stepBoat(live,{throttle:Math.sin(t/35)>.1?1:Math.sin(t/35)<-.6?-1:0,steer:Math.sin(t/11)}, {},t,FIXED_DT,scratch);assert.ok(Object.values(live).every(Number.isFinite));maxPitch=Math.max(maxPitch,Math.abs(live.pitch));maxRoll=Math.max(maxRoll,Math.abs(live.roll));}
  assert.ok(maxPitch<=9*Math.PI/180,`pitch ${maxPitch*180/Math.PI}`);assert.ok(maxRoll<=12*Math.PI/180,`roll ${maxRoll*180/Math.PI}`);
  const trajectories=[];
  for(const hz of [30,60,120]){const s=createSimulation();for(let frame=0;frame<hz*60;frame++)stepSimulation(s,{throttle:1,steer:.6},1/hz);assert.equal(s.steps,3600);trajectories.push(s.boat);}
  assert.deepEqual(trajectories[0],trajectories[1]);assert.deepEqual(trajectories[1],trajectories[2]);
  const stalled=createSimulation();assert.equal(stepSimulation(stalled,{},10),4);assert.ok(stalled.accumulator<FIXED_DT);resetAccumulator(stalled);assert.equal(stalled.accumulator,0);
  return {immersion:.25-settled.y,ahead:forwardSpeed(ahead),reverse:forwardSpeed(reverse),turnRate:turning.yawRate,coastTime,maxPitchDegrees:maxPitch*180/Math.PI,maxRollDegrees:maxRoll*180/Math.PI,trajectorySteps:3600,liveWaveSeconds:600};
}
