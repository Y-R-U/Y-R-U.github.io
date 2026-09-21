import assert from 'node:assert/strict';
import {createWorld,generateIsland,LANDMARKS,BOAT_RADIUS} from '../js/core/world.mjs';
import {createSimulation,tickSimulation,applyBonusThrust} from '../js/core/simulation.mjs';
import {createExploration,courseTo,COURSE_CLEARANCE} from '../js/core/exploration.mjs';
import {encodeSave,decodeSave,validateSave,DEFAULT_SETTINGS} from '../js/core/save.mjs';
import {mooringLayout} from '../js/core/island-shape.mjs';
import {islandName} from '../js/core/content.mjs';
import {SPECIES,tensionBand,levelForXp,LEVEL_XP} from '../js/core/fishing.mjs';
import {createJobs,encodeJobs,boardFor,jobAt,destinations,eligibility,acceptJob,abandonJob,
  stepJobs,noteCatch,payFish,coinsForFish,jobRange,jobGoal,lineOfSightToDrop,berthAt,berthNear,dayOf,dayProgress,
  canBuy,buyUpgrade,upgradeCost,rodBand,hullThrust,chartRange,islandFromId,
  UPGRADES,UPGRADE_KEYS,CHART_RANGE,HULL_THRUST,BOARD_SIZE,MAX_ACTIVE,DAY_SECONDS,
  DELIVERY_RANGE,VISIT_RANGE,ARRIVE_SPEED,BERTH_RANGE,BERTH_SPEED,STANDOFF} from '../js/core/jobs.mjs';

/**
 * The jobs suite.
 *
 * The scar this project keeps reopening is a number that is right while the
 * thing it describes is unreachable: the compass read 483 m while the hull was
 * welded to a rock. So the centrepiece here is not "does acceptJob return true"
 * — it is **sail the job**. Take a delivery off a real board, steer only by the
 * bearing `courseTo` publishes, and assert the coins land. If the drop point
 * were inside an island, or the routed arrow pointed through one, this fails
 * with a timeout rather than with a green tick.
 */

const DT=1/60;
/**
 * TRUE signed clearance, in metres, of a boat centre from the nearest shore.
 *
 * `world.clearance()` is NOT this: it returns `-deepestOverlap()`, which is
 * clamped at zero, so it reads 0.000 for a point in the middle of the ocean and
 * 0.000 for a point resting exactly on a shore. An assertion written against it
 * — `clearance > 0` — can never pass, and `worstPenetration <= 1e-3` can never
 * fail. Both of those were in the first draft of this file and the first one
 * went red against a build with no bug in it at all. Measure it here instead.
 */
const shoreGap=(world,x,z,scratch=[])=>{
  let worst=Infinity;
  for(const island of world.nearby(x,z,400,scratch))worst=Math.min(worst,Math.hypot(x-island.x,z-island.z)-island.radius-BOAT_RADIUS);
  return worst;
};
// Same dumb autopilot as tools/route.mjs: it holds the published bearing and
// nothing else. Whatever it cannot sail, a player holding the arrow cannot.
function pilot(boat,course){
  const error=Math.atan2(Math.sin(course.bearing-boat.yaw),Math.cos(course.bearing-boat.yaw));
  // A gentler ramp than tools/route.mjs's, because a delivery goal has no radius
  // and the last 60 m are a real manoeuvre rather than an arrival. It is still
  // bearing-only: it sees nothing the compass does not publish.
  const throttle=course.distance>90?1:course.distance>34?.35:course.distance>12?.08:0;
  return {steer:Math.max(-1,Math.min(1,error*2)),throttle};
}

/** Sail a live jobs state toward a followed job until it pays, or give up. */
function sail(world,jobs,job,{from,limit=400,thrust=0}={}){
  const simulation=createSimulation(from,world,0);
  simulation.bonusThrust=thrust;
  const events=[],islands=[],course={};
  let seconds=0,worstPenetration=0;
  assert.ok(jobGoal(job,simulation.boat),'a followed job must publish a goal');
  let legs=new Set();
  while(seconds<limit&&jobs.active.includes(job)){
    const boat=simulation.boat;
    // Re-resolved every tick, exactly as main.mjs does it: a delivery switches
    // from the standoff leg to the run-in as soon as the drop comes into view.
    const goal=jobGoal(job,boat);
    if(goal.leg)legs.add(goal.leg);
    world.nearby(boat.x,boat.z,Math.min(1200,Math.hypot(goal.x-boat.x,goal.z-boat.z)+120),islands);
    courseTo(boat,goal,islands,undefined,course);
    assert.ok(Number.isFinite(course.bearing)&&Number.isFinite(course.distance),'course must be finite');
    tickSimulation(simulation,pilot(boat,course));
    stepJobs(jobs,boat,DT,events);
    worstPenetration=Math.max(worstPenetration,-shoreGap(world,boat.x,boat.z,islands));
    seconds+=DT;
  }
  return {seconds:+seconds.toFixed(2),events,boat:simulation.boat,worstPenetration,legs:[...legs],
    done:!jobs.active.includes(job)};
}

const ctx=(jobs,level=1)=>({fishingLevel:level,upgrades:jobs.upgrades,active:jobs.active});

export function jobs(){
  const report={};
  const world=createWorld();
  const lantern=LANDMARKS[0];

  // ---- the board is a pure function of (island, day) -----------------------
  const a=boardFor(lantern,0),b=boardFor(lantern,0);
  assert.equal(a.length,BOARD_SIZE,'a board is three jobs');
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),'the same board twice must be the same board');
  assert.deepEqual([...new Set(a.map(j=>j.kind))].sort(),['cargo','catch','visit'],'every board offers all three kinds');
  assert.notDeepEqual(a.map(j=>j.title),boardFor(lantern,1).map(j=>j.title),'a new day is a new board');
  assert.notDeepEqual(a.map(j=>j.title),boardFor(LANDMARKS[1],0).map(j=>j.title),'a different island is a different board');
  for(const island of LANDMARKS)for(const day of [0,1,2,7,99]){
    for(const job of boardFor(island,day)){
      assert.ok(job.coins>0&&Number.isSafeInteger(job.coins),`${job.id} must pay a whole number of coins`);
      assert.ok(job.title&&job.detail,`${job.id} must read as a job`);
      assert.notEqual(job.targetId,island.id,'no job may send you where you already are');
      assert.equal(job.islandId,island.id);
      assert.equal(job.day,day);
    }
  }
  assert.equal(dayOf(0),0);assert.equal(dayOf(DAY_SECONDS-1e-9),0);assert.equal(dayOf(DAY_SECONDS),1);
  assert.equal(dayOf(-500),0,'a negative clock must not produce a negative day');
  assert.ok(dayProgress(DAY_SECONDS*2.5)>.49&&dayProgress(DAY_SECONDS*2.5)<.51);
  report.boards={islands:LANDMARKS.length,days:5,perBoard:BOARD_SIZE};

  // ---- every advertised drop point is navigable water ----------------------
  // The waypoint bug in its purest form: a destination that reads correctly and
  // cannot be reached. `deck` is INSIDE the collider; `approach` must not be.
  let checkedDrops=0,worstDropClearance=Infinity;
  for(const island of LANDMARKS)for(let day=0;day<12;day++)for(const job of boardFor(island,day)){
    if(job.kind!=='cargo')continue;
    const target=islandFromId(job.targetId);
    assert.ok(target,`${job.id} names an island that does not exist`);
    const layout=mooringLayout(target);
    assert.equal(job.dropX,layout.approach.x,'the drop must be the jetty approach point');
    assert.equal(job.dropZ,layout.approach.z);
    const clearance=shoreGap(world,job.dropX,job.dropZ);
    worstDropClearance=Math.min(worstDropClearance,clearance);
    assert.ok(clearance>0,`${job.id} drops cargo ${(-clearance).toFixed(2)} m inside solid rock`);
    // ROADMAP promises `approach` is a safe boat centre 2 m outside contact.
    assert.ok(Math.abs(clearance-2)<1e-6,`${job.id}: the approach margin is ${clearance.toFixed(3)} m, not the promised 2 m`);
    // And the negative control the roadmap warns about: `deck` genuinely IS
    // inside the collider, so an assertion that a drop point is clear water is
    // an assertion that can fail.
    assert.ok(shoreGap(world,layout.deck.x,layout.deck.z)<0,'the deck must be inside the collider, or this check proves nothing');
    checkedDrops++;
  }
  report.drops={checked:checkedDrops,worstDropClearance:+worstDropClearance.toFixed(4)};

  // ---- ineligible jobs are SHOWN, with the reason --------------------------
  // Aaron was explicit about this. The board never filters; `eligibility` is
  // what greys a card out, and it always hands back words a player can read.
  const fresh=createJobs(null);
  assert.equal(fresh.coins,0);assert.deepEqual(fresh.upgrades,{rod:1,hull:1,chart:1});assert.deepEqual(fresh.active,[]);
  const day0=boardFor(lantern,0);
  const gated=day0.find(j=>j.requires.fishing>1);
  assert.ok(gated,'Lantern Key day 0 is the fixture for the skill gate');
  const verdict=eligibility(gated,ctx(fresh,1));
  assert.equal(verdict.ok,false);
  assert.match(verdict.reason,/^Needs fishing \d+$/,'the reason must name the skill and the number');
  assert.equal(verdict.reason,`Needs fishing ${gated.requires.fishing}`);
  assert.equal(boardFor(lantern,0).length,BOARD_SIZE,'a gated job is still on the board');
  assert.ok(eligibility(gated,ctx(fresh,gated.requires.fishing)).ok,'meeting the gate opens it');
  // …and a gated job cannot be taken by asking nicely.
  const cheat=createJobs(null);
  assert.equal(acceptJob(cheat,gated,ctx(cheat,1),[]),false);
  assert.equal(cheat.active.length,0);
  assert.equal(cheat.coins,0);

  // Heavy cargo needs a better hull; a long passage needs a better chart.
  let heavy=null,far=null;
  for(const island of LANDMARKS)for(let day=0;day<40&&!(heavy&&far);day++)for(const job of boardFor(island,day)){
    if(job.requires.hull>1&&!heavy)heavy=job;
    if(job.requires.chart>1&&!far)far=job;
  }
  assert.ok(heavy,'the hull gate must actually occur on a real board');
  assert.ok(far,'the chart gate must actually occur on a real board');
  assert.match(eligibility(heavy,ctx(fresh)).reason,/needs hull 2/);
  assert.match(eligibility(far,ctx(fresh)).reason,/needs chart [23]/);
  const stocked=createJobs({upgrades:{rod:1,hull:3,chart:3}});
  assert.ok(eligibility(heavy,ctx(stocked)).ok,'a bought hull clears the hull gate');
  assert.ok(eligibility(far,ctx(stocked)).ok,'a bought chart clears the chart gate');
  assert.equal(eligibility(null,ctx(fresh)).ok,false,'a missing job is not eligible');
  report.gates={fishing:gated.requires.fishing,hull:heavy.requires.hull,chart:far.requires.chart};

  // ---- capacity gates ------------------------------------------------------
  const full=createJobs(null);
  const takeable=[];
  for(let day=0;takeable.length<MAX_ACTIVE+1&&day<60;day++)for(const island of LANDMARKS){
    for(const job of boardFor(island,day))
      if(job.kind==='visit'&&eligibility(job,ctx(full,20)).ok&&!takeable.some(t=>t.id===job.id))takeable.push(job);
  }
  assert.ok(takeable.length>MAX_ACTIVE,'need more than a logbook-full of takeable passages for this check');
  for(let i=0;i<MAX_ACTIVE;i++)assert.ok(acceptJob(full,takeable[i],ctx(full,20),[]),'logbook must accept up to the cap');
  const overflow=eligibility(takeable[MAX_ACTIVE],ctx(full,20));
  assert.equal(overflow.ok,false);
  assert.match(overflow.reason,/Logbook full/);
  assert.equal(eligibility(full.active[0],ctx(full,20)).reason,'Already in your logbook');
  // One cargo at a time — the hold rule.
  const hold=createJobs(null);
  const cargoJobs=[];
  for(let day=0;cargoJobs.length<2&&day<60;day++)for(const island of LANDMARKS)
    for(const job of boardFor(island,day))if(job.kind==='cargo'&&eligibility(job,ctx(hold,20)).ok&&!cargoJobs.some(c=>c.id===job.id))cargoJobs.push(job);
  assert.ok(acceptJob(hold,cargoJobs[0],ctx(hold,20),[]));
  assert.match(eligibility(cargoJobs[1],ctx(hold,20)).reason,/Hold full/);

  // ---- SAIL THE JOB --------------------------------------------------------
  // The whole point. Take a real delivery off Lantern Key's day-0 board, start
  // where a player would (moored against Lantern Key, inside its ring, which is
  // the position that broke leg two), hold the published bearing, and check the
  // purse afterwards.
  const played=createJobs(null);
  const delivery=day0.find(j=>j.kind==='cargo');
  assert.ok(eligibility(delivery,ctx(played,1)).ok,'the fixture delivery must be takeable at level 1');
  const takenEvents=[];
  assert.ok(acceptJob(played,delivery,ctx(played,1),takenEvents));
  assert.equal(takenEvents.at(-1).type,'job-taken');
  assert.equal(played.coins,0,'a job pays on delivery, never on acceptance');
  const active=played.active[0];
  const voyage=sail(world,played,active,{from:{x:-178,z:141}});
  assert.ok(voyage.done,`the delivery was never handed over — ${voyage.seconds} s holding the arrow, still ${Math.round(jobRange(active,voyage.boat))} m off`);
  assert.equal(played.coins,delivery.coins,'the coins must actually arrive');
  assert.equal(played.earned,delivery.coins);
  assert.equal(played.completed,1);
  assert.equal(played.active.length,0,'a delivered job leaves the logbook');
  const done=voyage.events.find(e=>e.type==='job-done');
  assert.ok(done&&done.coins===delivery.coins,'a completion must announce itself');
  assert.ok(jobRange(active,voyage.boat)<=DELIVERY_RANGE,'handover happened outside the delivery ring');
  assert.ok(Math.hypot(voyage.boat.vx,voyage.boat.vz)<=ARRIVE_SPEED,'handover happened at speed');
  assert.ok(voyage.worstPenetration<=1e-3,`the sailed route entered a shore by ${voyage.worstPenetration.toFixed(4)} m`);
  // The two-leg approach must actually have been used. Without this the whole
  // standoff fix could be dead code and every other assertion here would still
  // be green — the bug it fixes only shows up when the drop is on the far side.
  assert.ok(voyage.legs.includes('standoff'),'the run-in from the standoff was never exercised');
  assert.ok(voyage.legs.includes('drop'),'the delivery never switched to the run-in leg');
  // And the geometry that makes the standoff safe: it is well outside the ring
  // `courseTo` avoids, and it is on the jetty's bearing.
  const standGap=shoreGap(world,delivery.standX,delivery.standZ);
  assert.ok(standGap>COURSE_CLEARANCE,`the standoff is only ${standGap.toFixed(1)} m clear — inside the avoidance ring`);
  const dropBearing=Math.atan2(delivery.dropZ-delivery.targetZ,delivery.dropX-delivery.targetX);
  const standBearing=Math.atan2(delivery.standZ-delivery.targetZ,delivery.standX-delivery.targetX);
  assert.ok(Math.abs(Math.atan2(Math.sin(standBearing-dropBearing),Math.cos(standBearing-dropBearing)))<1e-9,
    'the standoff must sit on the jetty bearing, or the run-in is not a straight line');
  // Line of sight is what switches the legs, and it has to be able to say no.
  const farSide={x:delivery.targetX-(delivery.dropX-delivery.targetX)*4,z:delivery.targetZ-(delivery.dropZ-delivery.targetZ)*4};
  assert.equal(lineOfSightToDrop(delivery,farSide),false,'the drop must NOT be in sight from behind the island');
  assert.equal(jobGoal(delivery,farSide).leg,'standoff');
  assert.equal(lineOfSightToDrop(delivery,{x:delivery.standX,z:delivery.standZ}),true,'the drop must be in sight from the standoff');
  assert.equal(jobGoal(delivery,{x:delivery.standX,z:delivery.standZ}).leg,'drop');
  report.delivery={title:delivery.title,metres:Math.round(delivery.distance),seconds:voyage.seconds,
    coins:delivery.coins,legs:voyage.legs,standoffClearance:+standGap.toFixed(2)};

  // A passage job pays the same way, from the same start.
  const walker=createJobs(null);
  const passage=day0.find(j=>j.kind==='visit');
  assert.ok(acceptJob(walker,passage,ctx(walker,1),[]));
  const trip=sail(world,walker,walker.active[0],{from:{x:-178,z:141},limit:500});
  assert.ok(trip.done,`the passage to ${passage.targetName} was never completed in ${trip.seconds} s`);
  assert.equal(walker.coins,passage.coins);
  report.passage={title:passage.title,metres:Math.round(passage.distance),seconds:trip.seconds};

  // Sailing PAST the destination at speed must not pay: the handover has a
  // speed gate, and without it a job completes while you are still under way.
  const speeder=createJobs(null);
  assert.ok(acceptJob(speeder,passage,ctx(speeder,1),[]));
  const flying={x:passage.targetX,z:passage.targetZ+passage.targetRadius+5,vx:ARRIVE_SPEED+4,vz:0};
  stepJobs(speeder,flying,DT,[]);
  assert.equal(speeder.active.length,1,'a job must not complete while the boat is still making way');
  assert.equal(speeder.coins,0);
  flying.vx=0;
  stepJobs(speeder,flying,DT,[]);
  assert.equal(speeder.active.length,0,'…and must complete once she is stopped');

  // ---- catch jobs ----------------------------------------------------------
  const angler=createJobs(null);
  let catchJob=null;
  for(let day=0;!catchJob&&day<40;day++)for(const job of boardFor(lantern,day))
    if(job.kind==='catch'&&job.requires.fishing<=1)catchJob=job;
  assert.ok(catchJob,'a level-1 catch job must exist somewhere on Lantern Key');
  assert.ok(acceptJob(angler,catchJob,ctx(angler,1),[]));
  const tracked=angler.active[0];
  const catchEvents=[];
  noteCatch(angler,'kingfish',catchEvents);
  assert.equal(tracked.progress,0,'the wrong fish is not progress');
  for(let i=1;i<catchJob.count;i++){
    noteCatch(angler,catchJob.speciesId,catchEvents);
    assert.equal(angler.active.length,1,'the job must stay open until the count is met');
    assert.equal(tracked.progress,i);
  }
  noteCatch(angler,catchJob.speciesId,catchEvents);
  assert.equal(angler.active.length,0,'the last fish closes the job');
  assert.equal(angler.coins,catchJob.coins);
  assert.ok(catchEvents.some(e=>e.type==='job-progress'));
  assert.ok(catchEvents.some(e=>e.type==='job-done'));
  // A catch job is never a place: it publishes no goal, so the compass cannot
  // be pointed at it and claim a destination that does not exist.
  assert.equal(jobGoal(catchJob,{x:0,z:0}),null);
  assert.equal(jobRange(catchJob,{x:0,z:0}),Infinity);
  report.catchJob={title:catchJob.title,count:catchJob.count,coins:catchJob.coins};

  // ---- fish pay ------------------------------------------------------------
  const purse=createJobs(null);
  for(const species of SPECIES){
    const small=coinsForFish(species,species.kg[0]),big=coinsForFish(species,species.kg[1]);
    assert.ok(small>=1&&Number.isSafeInteger(small),species.id+' must pay a whole coin');
    assert.ok(big>small,species.id+': a bigger fish must be worth more');
  }
  const fishEvents=[];
  const paid=payFish(purse,SPECIES[0],SPECIES[0].kg[0],fishEvents);
  assert.equal(purse.coins,paid);assert.equal(purse.earned,paid);
  assert.equal(fishEvents[0].type,'fish-pay');
  assert.ok(coinsForFish(SPECIES.at(-1),SPECIES.at(-1).kg[1])>coinsForFish(SPECIES[0],SPECIES[0].kg[1]),'a rarer fish must be worth more');

  // ---- the chandlery -------------------------------------------------------
  const shop=createJobs(null);
  for(const key of UPGRADE_KEYS){
    const blocked=canBuy(shop,key);
    assert.equal(blocked.ok,false);
    assert.match(blocked.reason,/^\d+ more coins$/,`${key} must say how short you are`);
    assert.equal(blocked.reason,`${UPGRADES[key].costs[1]} more coins`);
  }
  shop.coins=10000;
  for(const key of UPGRADE_KEYS){
    let level=1;
    while(level<UPGRADES[key].max){
      const cost=upgradeCost(key,level),before=shop.coins;
      assert.ok(cost>0);
      assert.ok(buyUpgrade(shop,key,[]));
      level++;
      assert.equal(shop.upgrades[key],level);
      assert.equal(shop.coins,before-cost,'buying must take the coins');
    }
    assert.equal(upgradeCost(key,UPGRADES[key].max),null);
    assert.equal(canBuy(shop,key).reason,'Best there is');
    assert.equal(buyUpgrade(shop,key,[]),false,'a maxed upgrade cannot be bought again');
    assert.equal(shop.upgrades[key],UPGRADES[key].max);
  }
  assert.equal(canBuy(shop,'submarine').ok,false,'an unknown upgrade is not a purchase');
  assert.equal(buyUpgrade(shop,'submarine',[]),false);
  // Each upgrade has to DO something measurable.
  assert.ok(tensionBand(1,3)>tensionBand(1,1),'a bought rod widens the safe band');
  assert.equal(rodBand(shop),rodBand({upgrades:{rod:3}}));
  assert.ok(chartRange(shop)>chartRange(createJobs(null)),'a bought chart shows more sea');
  assert.deepEqual([...CHART_RANGE],[...CHART_RANGE].slice().sort((x,y)=>x-y),'chart ranges must grow');
  assert.ok(hullThrust(shop)>0&&hullThrust(createJobs(null))===0,'a stock hull adds exactly nothing');
  // …and the hull is newtons on the water, not a number in a panel.
  const stock=createSimulation({},world,0),tuned=createSimulation({},world,0);
  tuned.bonusThrust=hullThrust(shop);
  for(let i=0;i<60*30;i++){tickSimulation(stock,{throttle:1,steer:0});tickSimulation(tuned,{throttle:1,steer:0});}
  const stockSpeed=Math.hypot(stock.boat.vx,stock.boat.vz),tunedSpeed=Math.hypot(tuned.boat.vx,tuned.boat.vz);
  assert.ok(tunedSpeed>stockSpeed+.1,`a bought hull must be faster: ${tunedSpeed.toFixed(3)} vs ${stockSpeed.toFixed(3)} m/s`);
  // A stock hull must be bit-identical to the game Aaron already sailed.
  const control=createSimulation({},world,0);
  for(let i=0;i<600;i++)tickSimulation(control,{throttle:1,steer:.3});
  const controlNoThrust=createSimulation({},world,0);
  controlNoThrust.bonusThrust=0;
  for(let i=0;i<600;i++)tickSimulation(controlNoThrust,{throttle:1,steer:.3});
  assert.equal(controlNoThrust.boat.x,control.boat.x,'bonusThrust 0 must change nothing at all');
  assert.equal(controlNoThrust.boat.z,control.boat.z);
  report.upgrades={stockSpeed:+stockSpeed.toFixed(3),tunedSpeed:+tunedSpeed.toFixed(3),
    band:{stock:+tensionBand(1,1).toFixed(3),bought:+tensionBand(1,3).toFixed(3)},
    chart:[...CHART_RANGE],hull:[...HULL_THRUST]};

  // ---- berthing ------------------------------------------------------------
  const layout=mooringLayout(lantern);
  const alongside={x:layout.approach.x,z:layout.approach.z,vx:0,vz:0};
  const known=()=>true,unknown=()=>false;
  assert.equal(berthAt(alongside,[lantern],known)?.id,lantern.id);
  assert.equal(berthAt(alongside,[lantern],unknown),null,'an unrecorded island has no board');
  assert.equal(berthAt({...alongside,vx:BERTH_SPEED+1},[lantern],known),null,'you cannot read a board at speed');
  const near=berthNear(alongside,[lantern],unknown);
  assert.equal(near.open,false);
  assert.match(near.reason,/record this island/,'an unrecorded island must say what is missing');
  const moving=berthNear({...alongside,vx:BERTH_SPEED+1},[lantern],known);
  assert.equal(moving.open,false);
  assert.match(moving.reason,/throttle/);
  assert.equal(berthNear(alongside,[lantern],known).open,true);
  assert.equal(berthNear(alongside,[lantern],known).reason,'');
  const offshore={x:lantern.x+lantern.radius+BERTH_RANGE+40,z:lantern.z,vx:0,vz:0};
  assert.equal(berthNear(offshore,[lantern],known),null,'out of range is no berth at all');
  assert.equal(berthNear(alongside,[],known),null);
  // The berth is reachable: the approach point the board opens at is water.
  assert.ok(shoreGap(world,alongside.x,alongside.z)>0,'the berth must not be inside the island');
  // …and an ORDINARY island has one too, which is the reason to stop at one.
  let ordinary=null;
  for(let cx=-3;cx<=3&&!ordinary;cx++)for(let cz=-3;cz<=3;cz++){
    const island=generateIsland(cx,cz);
    if(island&&!island.landmark){ordinary=island;break;}
  }
  assert.ok(ordinary,'the world must contain ordinary islands');
  const ordinaryBerth=mooringLayout(ordinary);
  assert.ok(shoreGap(world,ordinaryBerth.approach.x,ordinaryBerth.approach.z)>0);
  assert.equal(boardFor(ordinary,0).length,BOARD_SIZE,'an ordinary island has a board of its own');
  assert.notDeepEqual(boardFor(ordinary,0).map(j=>j.title),boardFor(lantern,0).map(j=>j.title));
  report.ordinary={id:ordinary.id,name:islandName(ordinary),board:boardFor(ordinary,0).map(j=>j.title)};

  // ---- the save ------------------------------------------------------------
  const live=createJobs(null);
  live.coins=473;live.earned=980;live.completed=4;live.seconds=DAY_SECONDS*3+12;
  live.upgrades.rod=2;live.upgrades.chart=3;
  const keeper=boardFor(lantern,dayOf(live.seconds)).find(j=>j.kind==='visit');
  assert.ok(acceptJob(live,keeper,ctx(live,20),[]));
  const counter=boardFor(lantern,dayOf(live.seconds)).find(j=>j.kind==='catch');
  if(counter&&eligibility(counter,ctx(live,20)).ok){acceptJob(live,counter,ctx(live,20),[]);live.active.at(-1).progress=1;}
  const boat={x:12,z:-30,yaw:.4},exploration=createExploration();
  const text=encodeSave(boat,exploration,DEFAULT_SETTINGS,null,live);
  const back=decodeSave(text);
  assert.ok(back,'a save with jobs must still be a valid save');
  assert.equal(back.jobs.coins,473);
  assert.equal(back.jobs.completed,4);
  assert.deepEqual(back.jobs.upgrades,{rod:2,hull:1,chart:3});
  const restored=createJobs(back.jobs);
  assert.equal(restored.coins,473);
  assert.equal(restored.active.length,live.active.length,'accepted jobs must survive a reload');
  assert.equal(restored.active[0].id,live.active[0].id);
  assert.equal(restored.active[0].title,live.active[0].title,'a reloaded job is the same job, regenerated');
  assert.equal(restored.active[0].coins,live.active[0].coins);
  assert.equal(dayOf(restored.seconds),3,'the in-game day survives a reload');
  if(live.active[1])assert.equal(restored.active[1].progress,live.active[1].progress,'catch progress survives');

  // Aaron's existing voyage: a save written before any of this existed must
  // load, keep the atlas and the odometer, and simply start with an empty purse.
  const legacy={version:1,seed:back.seed,position:{x:-178,z:141,yaw:1.1},
    atlasIds:['-1:0'],ordinaryVisits:[],visitCount:2,distanceM:4212,settings:DEFAULT_SETTINGS};
  const migrated=validateSave(legacy);
  assert.ok(migrated,'a pre-jobs save is not an invalid save');
  assert.deepEqual(migrated.atlasIds,['-1:0'],'the atlas must survive the migration');
  assert.equal(migrated.distanceM,4212,'the odometer must survive the migration');
  assert.equal(migrated.visitCount,2);
  assert.equal(migrated.position.x,-178);
  assert.equal(migrated.jobs.coins,0);
  assert.deepEqual(migrated.jobs.upgrades,{rod:1,hull:1,chart:1});
  assert.deepEqual(migrated.jobs.active,[]);
  assert.ok(migrated.fishing,'and the pre-fishing migration still works too');
  // A save written WITHOUT a jobs argument is still valid — the old call site.
  assert.ok(decodeSave(encodeSave(boat,exploration,DEFAULT_SETTINGS)),'encodeSave must still work with three arguments');

  // ---- hostile saves -------------------------------------------------------
  // A save is a file on the player's disk. None of these may manufacture money,
  // a job, or an upgrade.
  const hostile=[
    {name:'negative coins',raw:{coins:-9999},check:s=>assert.equal(s.coins,0)},
    {name:'infinite coins',raw:{coins:Infinity},check:s=>assert.ok(Number.isSafeInteger(s.coins))},
    {name:'string coins',raw:{coins:'1e12'},check:s=>assert.equal(s.coins,0)},
    {name:'upgrade past the top',raw:{upgrades:{rod:99,hull:99,chart:99}},
      check:s=>assert.deepEqual(s.upgrades,{rod:3,hull:3,chart:3})},
    {name:'upgrade below the bottom',raw:{upgrades:{rod:0,hull:-4,chart:null}},
      check:s=>assert.deepEqual(s.upgrades,{rod:1,hull:1,chart:1})},
    {name:'unknown upgrade key',raw:{upgrades:{submarine:3}},
      check:s=>assert.deepEqual(Object.keys(s.upgrades).sort(),[...UPGRADE_KEYS].sort())},
    {name:'invented job',raw:{active:[{island:'9999:9999',day:0,slot:0,progress:0}]},
      check:s=>assert.deepEqual(s.active,[])},
    {name:'malformed island id',raw:{active:[{island:'../../etc/passwd',day:0,slot:0}]},
      check:s=>assert.deepEqual(s.active,[])},
    {name:'slot off the end of the board',raw:{active:[{island:'-1:0',day:0,slot:77,progress:0}]},
      check:s=>assert.ok(s.active.every(j=>j.slot<BOARD_SIZE))},
    {name:'more jobs than the logbook holds',
      raw:{active:Array.from({length:40},(_,i)=>({island:'-1:0',day:i,slot:0,progress:0}))},
      check:s=>assert.ok(s.active.length<=MAX_ACTIVE)},
    {name:'a job already finished',raw:{active:[{island:'-1:0',day:1,slot:0,progress:1e9}]},
      check:s=>{for(const job of s.active)if(job.kind==='catch')assert.ok(job.progress<job.count,'a save must never hand back a completed job');}},
    {name:'duplicate jobs',raw:{active:[{island:'-1:0',day:0,slot:2,progress:0},{island:'-1:0',day:0,slot:2,progress:0}]},
      check:s=>assert.equal(new Set(s.active.map(j=>j.id)).size,s.active.length)},
    {name:'negative clock',raw:{seconds:-1e9},check:s=>assert.ok(s.seconds>=0)},
    {name:'garbage',raw:{coins:{},upgrades:'yes',active:'lots',seconds:'soon'},
      check:s=>{assert.equal(s.coins,0);assert.deepEqual(s.active,[]);assert.equal(s.seconds,0);}},
  ];
  for(const {name,raw,check} of hostile){
    const state=createJobs(raw);
    check(state);
    // Whatever it was, it must round-trip cleanly and never pay out.
    const round=createJobs(encodeJobs(state));
    assert.deepEqual(encodeJobs(round),encodeJobs(state),`${name} must be stable across a round trip`);
    assert.ok(round.coins>=0&&Number.isSafeInteger(round.coins),name+': coins must stay sane');
    for(const key of UPGRADE_KEYS)assert.ok(round.upgrades[key]>=1&&round.upgrades[key]<=UPGRADES[key].max,name+': '+key);
  }
  report.hostileSaves=hostile.length;

  // ---- destinations --------------------------------------------------------
  for(const island of LANDMARKS){
    const pool=destinations(island);
    assert.ok(pool.length>0,islandName(island)+' has nowhere to send you');
    assert.ok(pool.every(i=>i.id!==island.id));
    for(let i=1;i<pool.length;i++){
      const previous=Math.hypot(pool[i-1].x-island.x,pool[i-1].z-island.z);
      const current=Math.hypot(pool[i].x-island.x,pool[i].z-island.z);
      assert.ok(current>=previous-1e-9,'the destination pool must be sorted by distance');
    }
    assert.deepEqual(destinations(island).map(i=>i.id),pool.map(i=>i.id),'the pool must be deterministic');
  }
  assert.equal(islandFromId('-1:0').id,'-1:0');
  assert.equal(islandFromId('0:0'),null,'the launch chunk is water');
  assert.equal(islandFromId('nonsense'),null);
  assert.equal(islandFromId(null),null);

  // ---- abandoning ----------------------------------------------------------
  const quitter=createJobs(null);
  assert.ok(acceptJob(quitter,passage,ctx(quitter,20),[]));
  const dropEvents=[];
  assert.ok(abandonJob(quitter,passage.id,dropEvents));
  assert.equal(dropEvents[0].type,'job-dropped');
  assert.equal(quitter.active.length,0);
  assert.equal(quitter.coins,0,'giving up pays nothing');
  assert.equal(abandonJob(quitter,'not-a-job',[]),false);

  return report;
}
