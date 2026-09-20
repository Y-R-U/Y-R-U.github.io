// Kept under render ownership while the gameplay builder owns tools/.
// Run: node js/render/tests/hull.test.mjs
import assert from 'node:assert/strict';
import {createBoat,stepBoat,hullPoint,MIN_FREEBOARD} from '../../core/boat.mjs';
import {sampleWave} from '../../core/waves.mjs';
import {createWorld,LANDMARKS} from '../../core/world.mjs';
const sheer=[[-2.3,.64,.46],[-1.65,.82,.46],[-.8,.85,.47],[.2,.82,.49],[1.15,.64,.54],[1.9,.32,.63],[2.3,.012,.70]];
let worst=Infinity,steps=0,backstops=0,maxLift=0;
function measure(b,time){
  for(const [z,x,y] of sheer)for(const side of [-1,1]){
    const p=hullPoint(b,[x*side,y,z]),w=sampleWave(p.x,p.z,time,{}),gap=p.y-w.height;
    worst=Math.min(worst,gap);assert.ok(gap>=MIN_FREEBOARD-1e-8,`gunwale ${gap} at ${time}s heading ${b.yaw}`);
  }
}
// Head seas previously sank the gunwale 3.44 m; handling never measured it.
for(let heading=0;heading<16;heading++){
  const b=createBoat({yaw:heading*Math.PI/8}),scratch={};
  for(let i=0;i<7200;i++){
    stepBoat(b,{throttle:1},{},i/60,1/60,scratch);measure(b,(i+1)/60);steps++;
    if(scratch.freeboardLift){backstops++;maxLift=Math.max(maxLift,scratch.freeboardLift);}
  }
}
const headingBackstops=backstops;
assert.equal(headingBackstops,0,'ordinary head seas must be handled by buoyancy, not projection');
// Turning, reversing, resting and colliding in the actual archipelago.
const world=createWorld(),b=createBoat({},world),scratch={};
for(let i=0;i<36000;i++){
  const t=i/60;
  stepBoat(b,{throttle:Math.sin(t/35)>.1?1:Math.sin(t/35)<-.6?-1:0,steer:Math.sin(t/11)},world,t,1/60,scratch);
  measure(b,t+1/60);steps++;assert.ok(world.clearance(b.x,b.z)>=-1e-8);
  if(scratch.freeboardLift){backstops++;maxLift=Math.max(maxLift,scratch.freeboardLift);}
}
const sailingMinimum=worst;
// Invalid saved positions inside a shore must solve buoyancy after push-out.
for(const island of LANDMARKS)for(let t=0;t<12;t+=.5){
  const spawn=createBoat({x:island.x,z:island.z,yaw:t},world,t);measure(spawn,t);
  assert.ok(world.clearance(spawn.x,spawn.z)>=-1e-8);
}
// Abnormal submerged state: recovery must be immediate, physical, and finite.
const submerged=createBoat({y:-4,vy:-10}),guard={};stepBoat(submerged,{},world,0,1/60,guard);
measure(submerged,1/60);assert.ok(guard.freeboardLift>0);assert.ok(Object.values(submerged).every(Number.isFinite));
console.log('PASS hull freeboard',JSON.stringify({steps,sailingMinimum,worstGunwaleClearance:worst,headingBackstops,backstops,maxLift,submergedRecovery:guard.freeboardLift},null,2));
