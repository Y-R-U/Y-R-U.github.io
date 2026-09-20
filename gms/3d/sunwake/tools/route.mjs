import assert from 'node:assert/strict';
import {ATLAS} from '../js/core/content.mjs';
import {createExploration,stepExploration,courseTo,pinGoal,nearestGoal,DISCOVERY_SPEED} from '../js/core/exploration.mjs';
import {createWorld,BOAT_RADIUS} from '../js/core/world.mjs';
import {moveCircleSwept,TANGENT_RETENTION,REFERENCE_DT} from '../js/core/collision.mjs';
import {createSimulation,tickSimulation} from '../js/core/simulation.mjs';
import {encodeSave,decodeSave,DEFAULT_SETTINGS} from '../js/core/save.mjs';

/**
 * The test that was missing.
 *
 * Every earlier suite proved a landmark could be discovered from a controlled
 * position, and proved Lantern Key was reachable from spawn — and then stopped.
 * Nothing sailed leg two, which is the leg Aaron could not sail: the straight
 * bearing from Lantern Key to Bell Garden clips Lantern Key's own shore, and the
 * boat ground along it at 0.4 kn while the compass cheerfully read 483 m.
 *
 * So: sail the entire six-landmark route, steering ONLY by the pin the game
 * itself sets and the bearing the HUD itself shows, and assert after every leg
 * that a discovery fired, the pin advanced, and the leg finished in a time a
 * human would tolerate. A pilot that is allowed to cheat by aiming at the
 * landmark's true position cannot see this class of bug.
 */

const MAX_LEG_SECONDS=240;   // 488 m at 8 m/s is ~61 s; 240 s is generous, not lax
const MAX_ROUTE_SECONDS=900;

// The autopilot is deliberately dumb: it holds the bearing the HUD would draw
// and nothing else. Whatever it cannot sail, a player holding the arrow cannot
// sail either.
function pilot(boat,course){
  const error=Math.atan2(Math.sin(course.bearing-boat.yaw),Math.cos(course.bearing-boat.yaw));
  const throttle=course.distance>62?1:course.distance>23?.05:0;
  return {steer:Math.max(-1,Math.min(1,error*2)),throttle};
}

export function route(){
  const world=createWorld(),simulation=createSimulation({},world,0),state=createExploration();
  state.pin=ATLAS[0].id;
  const events=[],islands=[],course={},legs=[];
  let ticks=0,legStart=0,legPin=state.pin,worstPenetration=0,groundedTicks=0,blockedTicks=0;

  assert.equal(state.pin,'-1:0','a fresh voyage starts pinned to Lantern Key');

  while(ticks<MAX_ROUTE_SECONDS*60&&state.atlasIds.length<6){
    const boat=simulation.boat,goal=ATLAS.find(p=>p.id===state.pin);
    assert.ok(goal,`pin ${state.pin} is not an atlas page at ${(ticks/60).toFixed(1)} s`);
    assert.ok(!state.atlasIds.includes(state.pin),'the pin must never point at a page already in the atlas');

    world.nearby(boat.x,boat.z,Math.min(1200,Math.hypot(goal.x-boat.x,goal.z-boat.z)+120),islands);
    courseTo(boat,goal,islands,undefined,course);
    assert.ok(Number.isFinite(course.bearing)&&Number.isFinite(course.distance),'course must be finite');
    if(course.blocked)blockedTicks++;

    const px=boat.x,pz=boat.z;
    tickSimulation(simulation,pilot(boat,course));
    // Exactly how main.mjs accrues it, so the odometer is tested too.
    state.distanceM+=Math.hypot(boat.x-simulation.previous.x,boat.z-simulation.previous.z);
    stepExploration(state,boat,world.nearby(boat.x,boat.z,80,islands),1/60,events);
    worstPenetration=Math.max(worstPenetration,-world.clearance(boat.x,boat.z));
    void px;void pz;
    if(simulation.scratch.contact?.contacts&&Math.hypot(boat.vx,boat.vz)<1.5)groundedTicks++;
    ticks++;

    while(events.length){
      const event=events.shift();
      if(event.type!=='landmark')continue;
      const seconds=(ticks-legStart)/60;
      assert.equal(event.id,legPin,`discovered ${event.id} while pinned to ${legPin}`);
      assert.ok(state.atlasIds.includes(event.id),'discovery did not enter the atlas');
      legs.push({landmark:ATLAS.find(p=>p.id===event.id).landmark,seconds:+seconds.toFixed(1),nextPin:state.pin});
      assert.ok(seconds<=MAX_LEG_SECONDS,`leg to ${event.id} took ${seconds.toFixed(1)} s — a player cannot be asked to hold a bearing that long`);
      if(state.atlasIds.length<6){
        assert.ok(state.pin&&state.pin!==event.id,`the pin did not advance after ${event.id}`);
        assert.equal(state.pin,nearestGoal(state,boat)?.id,'the pin must advance to the nearest undiscovered page');
      }else assert.equal(state.pin,null,'the pin clears when the atlas is complete');
      legStart=ticks;legPin=state.pin;
    }
  }

  assert.equal(state.atlasIds.length,6,`only ${state.atlasIds.length} landmarks found in ${(ticks/60).toFixed(0)} s`);
  assert.equal(legs.length,6);
  assert.ok(state.complete,'completion never fired');
  assert.ok(worstPenetration<=1e-6,`the route entered a shore by ${worstPenetration} m`);
  assert.ok(state.distanceM>3000,`only ${state.distanceM.toFixed(0)} m of water covered — the odometer is not accruing`);
  assert.ok(blockedTicks>0,'no leg was ever routed around a blocking shore — the detour path is untested by this route');
  assert.ok(groundedTicks/60<20,`${(groundedTicks/60).toFixed(0)} s of the route were spent pinned to a shore making no way`);

  // Shore friction is a RATE. Grind a circle along a shore at 8 m/s for one
  // second and the surviving tangential speed must match TANGENT_RETENTION, at
  // any step size. A per-step constant — the original .92, applied 60 times a
  // second — leaves 0.7% instead of 45% and glues the hull to anything it
  // brushes, which is how a 488 m leg became a five-minute grind.
  const friction={};
  for(const dt of [1/120,1/60,1/30]){
    const island=ATLAS[0],ring=island.radius+BOAT_RADIUS+.0005;
    let speed=8,angle=0;
    for(let step=0;step<Math.round(1/dt);step++){
      const at={x:island.x+Math.cos(angle)*ring,z:island.z+Math.sin(angle)*ring};
      // Tangential travel, with a small inward bias so contact is maintained.
      const tx=-Math.sin(angle),tz=Math.cos(angle);
      const nx=Math.cos(angle),nz=Math.sin(angle);
      const move={x:(tx*speed-nx*2)*dt,z:(tz*speed-nz*2)*dt};
      const result=moveCircleSwept(at,move,{x:tx*speed-nx*2,z:tz*speed-nz*2},BOAT_RADIUS,world.queryIslands,{},{},dt);
      assert.ok(result.contacts>0,`the grind probe lost contact at dt=${dt}`);
      speed=Math.abs(result.vx*tx+result.vz*tz);
      angle=Math.atan2(result.z-island.z,result.x-island.x);
    }
    friction[dt.toFixed(4)]=+(speed/8).toFixed(4);
    assert.ok(Math.abs(speed/8-TANGENT_RETENTION)<.06,
      `one second of grinding at dt=${dt} left ${(speed/8).toFixed(3)} of the tangential speed, not ${TANGENT_RETENTION}`);
  }
  assert.ok(Math.abs(TANGENT_RETENTION-Math.pow(Math.pow(TANGENT_RETENTION,REFERENCE_DT),60))<1e-9,'the reference step and the retention rate disagree');

  // The route must survive being saved and resumed mid-voyage exactly as it is.
  const text=encodeSave(simulation.boat,state,DEFAULT_SETTINGS),reloaded=decodeSave(text);
  assert.deepEqual([...reloaded.atlasIds].sort(),[...state.atlasIds].sort(),'atlas did not survive the save');
  const resumed=createExploration(reloaded);
  assert.equal(resumed.atlasIds.length,6);
  assert.equal(nearestGoal(resumed,simulation.boat),null,'a complete atlas has no next goal');

  // Same again from a half-finished save: reload after two landmarks and check
  // the pin comes back pointing at the third, not at something already found.
  const partial=decodeSave(encodeSave({x:-540,z:520,yaw:0},{atlasIds:['-1:0','-2:1'],ordinaryVisits:[],visitCount:0,distanceM:1234},DEFAULT_SETTINGS));
  const midway=createExploration(partial);
  midway.pin=nearestGoal(midway,partial.position)?.id||null;
  assert.equal(midway.pin,'0:2','a resumed two-page voyage must point at Split Crown');
  assert.equal(midway.atlasIds.length,2);
  assert.ok(Math.abs(midway.distanceM-1234)<1e-9,'distance sailed did not survive the save');

  // A hand-set pin is the player's course and a discovery must not steal it.
  const handed=createExploration();
  pinGoal(handed,'2:1');
  const orchard=ATLAS.find(p=>p.landmark==='Last Orchard');
  stepExploration(handed,{x:orchard.x+orchard.radius+6,z:orchard.z,vx:0,vz:0},[orchard],3,events);
  assert.ok(handed.atlasIds.includes(orchard.id),'the landmark beside the boat was not discovered');
  assert.equal(handed.pin,'2:1','a hand-set pin was stolen by an unrelated discovery');
  events.length=0;

  // A landmark always outranks an ordinary island for the two-second dwell,
  // whichever order the candidate list arrives in.
  for(const order of [0,1]){
    const both=createExploration(),key=ATLAS[0];
    const rock={id:'9:9',cx:9,cz:9,x:key.x+key.radius+10,z:key.z,radius:4,landmark:null};
    const list=order?[key,rock]:[rock,key];
    stepExploration(both,{x:key.x+key.radius+8,z:key.z,vx:0,vz:0},list,3,events);
    assert.ok(both.atlasIds.includes(key.id),`ordinary island stole the dwell (order ${order})`);
    events.length=0;
  }

  // A goal you are standing on is never "blocked" by itself.
  const key=ATLAS[0],hard={x:key.x+key.radius+BOAT_RADIUS+1,z:key.z};
  courseTo(hard,key,[key],undefined,course);
  assert.equal(course.blocked,null);
  assert.ok(course.distance<BOAT_RADIUS+2);

  // Standing against Lantern Key with Bell Garden pinned: the direct bearing is
  // blocked, and the advertised course must differ from it by a real angle.
  const bell=ATLAS.find(p=>p.landmark==='Bell Garden');
  const moored={x:-178.4,z:141.5};
  world.nearby(moored.x,moored.z,700,islands);
  courseTo(moored,bell,islands,undefined,course);
  assert.equal(course.blocked,key.id,'Lantern Key does not register as blocking the Bell Garden leg');
  const direct=Math.atan2(bell.x-moored.x,bell.z-moored.z);
  const detour=Math.abs(Math.atan2(Math.sin(course.bearing-direct),Math.cos(course.bearing-direct)));
  assert.ok(detour>5*Math.PI/180,`the detour bearing is only ${(detour*180/Math.PI).toFixed(1)}° off the blocked direct line`);
  // Moored against the rock with the rock between you and the goal, the advice
  // must be "run along it" — the better of the two tangents, not straight back
  // out to sea, and not the tangent that heads away from where you are going.
  const outward=Math.atan2(moored.x-key.x,moored.z-key.z),lean=Math.PI/2-Math.PI/6;
  const off=a=>Math.abs(Math.atan2(Math.sin(a-direct),Math.cos(a-direct)));
  assert.ok(detour<=Math.min(off(outward+lean),off(outward-lean))+1e-9,'moored advice is not the better of the two tangents');
  assert.ok(detour<off(outward),'moored advice is no better than pointing straight out to sea');
  const fromOutward=Math.abs(Math.atan2(Math.sin(course.bearing-outward),Math.cos(course.bearing-outward)))*180/Math.PI;
  assert.ok(fromOutward>45,`moored advice is only ${fromOutward.toFixed(1)}° off straight-out — it is not routing round the shore`);

  // The other branch: outside the avoidance ring, with the island mid-line. The
  // course must swing to a tangent, and the tangent must actually clear the rock.
  const offshore={x:key.x+260,z:key.z+40};
  world.nearby(offshore.x,offshore.z,900,islands);
  courseTo(offshore,{...key,id:'probe',x:key.x-260,z:key.z-40,radius:20},islands,undefined,course);
  assert.equal(course.blocked,key.id,'an island squarely across the line did not register as blocking');
  const ax=course.aimX-offshore.x,az=course.aimZ-offshore.z,len=Math.hypot(ax,az);
  const t=Math.max(0,Math.min(1,((key.x-offshore.x)*ax+(key.z-offshore.z)*az)/(len*len)));
  const miss=Math.hypot(offshore.x+ax*t-key.x,offshore.z+az*t-key.z)-(key.radius+BOAT_RADIUS);
  assert.ok(miss>-1e-6,`the tangent course still cuts ${(-miss).toFixed(2)} m into the blocking shore`);

  return {legs,routeSeconds:+(ticks/60).toFixed(1),worstPenetration,tangentMissMetres:+miss.toFixed(3),mooredAdviceDegreesOffOutward:+fromOutward.toFixed(1),groundedSeconds:+(groundedTicks/60).toFixed(1),
    blockedSeconds:+(blockedTicks/60).toFixed(1),tangentialSpeedAfterOneSecondGrinding:friction,detourDegrees:+(detour*180/Math.PI).toFixed(1),
    distanceKm:+(state.distanceM/1000).toFixed(2),discoverySpeedLimit:DISCOVERY_SPEED};
}
