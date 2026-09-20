// node js/render/tests/steering.test.mjs
//
// Low-speed steering authority (ROADMAP, requested by the gameplay builder).
// `yawTarget` scaled with |u|/(|u|+2), so a boat pinned against a shore at
// ~0 m/s had no steering at all: no way on, no rudder, no way off the rock.
//
// Falsified against the fix: set WASH_TURN to 0 in js/core/boat.mjs and the
// first case goes red with "never cleared the shore in 40 s" on all six
// bearings, at exactly 0.00 m/s. That is the bug, reproduced.
//
// The other three cases are the guard rails, and they are the reason the
// constant is throttle-scaled and falls off as a cube: an outboard steers by
// vectoring its own thrust, so this must not become free rotation for a
// drifting boat, and must not touch the measured cruising turn.
import assert from 'node:assert/strict';
import {createWorld,LANDMARKS,BOAT_RADIUS} from '../../core/world.mjs';
import {createBoat,stepBoat,forwardSpeed} from '../../core/boat.mjs';
import {FIXED_DT} from '../../core/config.mjs';

const flat={sampleWave(x,z,t,out){return Object.assign(out,{height:0,dx:0,dz:0,dt:0});}};
const run=(b,input,seconds,world=flat)=>{const s={};for(let i=0;i<Math.round(seconds*60);i++)stepBoat(b,input,world,i/60,FIXED_DT,s);return b;};

const world=createWorld(),island=LANDMARKS[0],clears=[];
// Driven straight at the rock with the helm hard over, which is the position a
// player is in after the pin walks them into a shore.
for(const a of [0,1,2,3,4,5]){
  const x=island.x+Math.cos(a)*(island.radius+BOAT_RADIUS-.05),z=island.z+Math.sin(a)*(island.radius+BOAT_RADIUS-.05);
  const b=createBoat({x,z,yaw:Math.atan2(island.x-x,island.z-z)},world,0),scratch={};
  let off=null;
  for(let i=0;i<60*40;i++){
    stepBoat(b,{throttle:1,steer:1},world,i/60,FIXED_DT,scratch);
    if(Math.hypot(b.x-island.x,b.z-island.z)-island.radius-BOAT_RADIUS>3){off=i/60;break;}
  }
  assert.ok(off!==null,`bearing ${a}: never cleared the shore in 40 s`);
  assert.ok(off<20,`bearing ${a}: took ${off.toFixed(1)} s to clear`);
  clears.push(off);
}

// The helm alone must still do nothing at all to a boat with the engine shut.
const start=createBoat({},flat),drifting=run(createBoat({},flat),{steer:1},6);
assert.equal(drifting.yawRate,0,'rudder alone turned a boat with no throttle');
assert.equal(drifting.yaw,start.yaw,'rudder alone changed a drifting boat heading');

// And the cruising turn the handling gate measures must be untouched.
const cruise=run(createBoat({},flat),{throttle:1},30);
const turning=run({...cruise},{throttle:1,steer:1},30);
assert.ok(turning.yawRate>=.38&&turning.yawRate<=.48,`cruise turn ${turning.yawRate}`);
assert.ok(Math.abs(turning.yawRate-.4300)<.002,`cruise turn drifted to ${turning.yawRate}`);

// Astern with the helm over still swings the other way, as it did before.
const astern=run(createBoat({},flat),{throttle:-1},30);
const asternTurn=run({...astern},{throttle:-1,steer:1},10);
assert.ok(asternTurn.yawRate<0,`astern turn ${asternTurn.yawRate}`);

// Identical trajectories at 30, 60 and 120 Hz: the new term is a pure function
// of state, so the fixed step still makes the frame rate invisible.
const {createSimulation,stepSimulation}=await import('../../core/simulation.mjs');
const paths=[];
for(const hz of [30,60,120]){const s=createSimulation();for(let f=0;f<hz*30;f++)stepSimulation(s,{throttle:1,steer:.6},1/hz);paths.push(s.boat);}
assert.deepEqual(paths[0],paths[1]);assert.deepEqual(paths[1],paths[2]);

console.log('PASS low-speed steering',JSON.stringify({
  bearings:clears.length,slowestClearSeconds:Math.max(...clears),fastestClearSeconds:Math.min(...clears),
  driftingYawRate:drifting.yawRate,cruiseTurnRate:turning.yawRate,asternTurnRate:asternTurn.yawRate,
  ahead:forwardSpeed(cruise),astern:forwardSpeed(astern)},null,2));
