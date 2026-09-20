import assert from 'node:assert/strict';
import {FIXED_DT} from '../js/core/config.mjs';
import {createWorld,generateIsland,LANDMARKS,BOAT_RADIUS,CHUNK,chunkIndex,hash32,SHORE_TOP,APRON_TOP,
  MAX_ISLAND_RADIUS,DESCRIPTOR_CACHE} from '../js/core/world.mjs';
import {moveCircleSwept,resolveOverlap,deepestOverlap} from '../js/core/collision.mjs';
import {createSimulation,tickSimulation,interpolateSimulation} from '../js/core/simulation.mjs';
import {forwardSpeed} from '../js/core/boat.mjs';

// Two worlds. The M4 approach cases keep the landmark-only fixture so their
// proven numbers stay comparable and a procedural neighbour can never quietly
// turn a head-on test into a slide. The M5 cases use the real infinite world.
const landmarksOnly=(cx,cz)=>LANDMARKS.find(i=>i.cx===cx&&i.cz===cz)||null;
const world=createWorld({generate:landmarksOnly});
const live=createWorld();
const HARD=island=>island.radius+BOAT_RADIUS;
const TOLERANCE=1e-6;
const REACH=MAX_ISLAND_RADIUS+BOAT_RADIUS+1;

// The invariant. `nearby` walks the chunk grid directly rather than the DDA the
// solver uses, so this is an independent check, not the same code twice. Every
// island's collision circle is contained in its own chunk (asserted in the world
// suite), so a chunk-rectangle scan cannot miss an overlapping island.
const scanList=[];
function clearanceIn(w,x,z){
  let worst=Infinity,who=null;
  for(const island of w.nearby(x,z,REACH,scanList)){
    const gap=Math.hypot(x-island.x,z-island.z)-HARD(island);
    if(gap<worst){worst=gap;who=island.id;}
  }
  return {gap:worst,island:who};
}
const clearance=(x,z)=>clearanceIn(world,x,z);
function assertClear(x,z,label){const c=clearance(x,z);assert.ok(c.gap>=-TOLERANCE,`${label}: inside ${c.island} by ${-c.gap} m`);return c;}
function assertClearLive(x,z,label){const c=clearanceIn(live,x,z);assert.ok(c.gap>=-TOLERANCE,`${label}: inside ${c.island} by ${-c.gap} m`);return c;}

// Drive the real simulation and assert after every single fixed step, on the
// simulated centre and on the interpolated render centre at five alphas.
function sail(name,spawn,input,seconds,collect={}){
  const s=createSimulation(spawn,world,0),render={},raw={x:0,z:0};
  let minGap=Infinity,rawViolations=0,skinViolations=0,contacts=0;
  assertClear(s.boat.x,s.boat.z,name+' spawn');
  for(let step=0;step<Math.round(seconds*60);step++){
    const px=s.boat.x,pz=s.boat.z;
    tickSimulation(s,typeof input==='function'?input(step/60):input);
    assert.ok(Object.values(s.boat).every(Number.isFinite),`${name}: non-finite state at step ${step}`);
    minGap=Math.min(minGap,assertClear(s.boat.x,s.boat.z,`${name} step ${step}`).gap);
    if(s.scratch.contact?.contacts)contacts+=s.scratch.contact.contacts;
    for(const alpha of [0,.25,.5,.75,1]){
      raw.x=px+(s.boat.x-px)*alpha;raw.z=pz+(s.boat.z-pz)*alpha;
      const gap=clearance(raw.x,raw.z).gap;
      if(gap<-TOLERANCE)rawViolations++;        // the chord cut past the hard radius
      if(gap<.001)skinViolations++;             // …or at least ate into the contact skin
      s.accumulator=alpha*FIXED_DT;interpolateSimulation(s,render);
      assertClear(render.x,render.z,`${name} render alpha ${alpha} step ${step}`);
    }
    s.accumulator=0;
  }
  Object.assign(collect,{minGap,rawViolations,skinViolations,contacts,speed:forwardSpeed(s.boat),x:s.boat.x,z:s.boat.z});
  return s;
}

// Independent of the DDA: scan every chunk in the segment's bounding box,
// expanded by one chunk, and keep the islands the segment actually touches.
function bruteForceBand(x0,z0,x1,z1,generate=landmarksOnly){
  const found=[];
  const minX=chunkIndex(Math.min(x0,x1))-1,maxX=chunkIndex(Math.max(x0,x1))+1;
  const minZ=chunkIndex(Math.min(z0,z1))-1,maxZ=chunkIndex(Math.max(z0,z1))+1;
  for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
    const island=generate(cx,cz);if(!island)continue;
    const dx=x1-x0,dz=z1-z0,len=dx*dx+dz*dz;
    const t=len>0?Math.max(0,Math.min(1,((island.x-x0)*dx+(island.z-z0)*dz)/len)):0;
    if(Math.hypot(x0+dx*t-island.x,z0+dz*t-island.z)<=island.radius+BOAT_RADIUS+1)found.push(island.id);
  }
  return found;
}

export function collision(){
  const key=LANDMARKS[0],report={};
  // Seeded case 12773: three tangent contacts send the remainder OUTSIDE the
  // initial DDA band. A frozen-band mutation penetrates an unqueried shore by
  // ~22 m. Keep that negative control: an endpoint check against the original
  // list would silently pass, whereas this independent spatial scan cannot.
  // NOTE: the deflected path depends on TANGENT_RETENTION, so this case has to
  // be re-derived whenever shore friction changes — scan the seeded sweeps for
  // a start/displacement whose frozen-band result is deep inside a shore that
  // the live band keeps clear. The previous case (seed 1399) stopped biting
  // when the per-step .92 damping became a per-second rate.
  {
    const p={x:-579.6440026560862,z:-563.8606989393151};
    const d={x:1164.5409456811835,z:1182.946746710677},v={x:d.x*60,z:d.z*60};
    const initial=live.queryIslands(p.x,p.z,p.x+d.x,p.z+d.z,[]);
    const frozen=(x0,z0,x1,z1,out)=>{out.length=0;out.push(...initial);return out;};
    const broken=moveCircleSwept(p,d,v,BOAT_RADIUS,frozen);
    const badGap=clearanceIn(live,broken.x,broken.z).gap;
    assert.ok(badGap < -2,'negative control must expose the original missed shore');
    const fixed=moveCircleSwept(p,d,v,BOAT_RADIUS,live.queryIslands);
    const goodGap=assertClearLive(fixed.x,fixed.z,'deflected chunk-band regression').gap;
    assert.equal(fixed.contacts,3);assert.equal(fixed.recovered,false);
    assert.equal(fixed.failed,false);
    report.deflectedBand={frozenBandClearance:badGap,fixedClearance:goodGap,contacts:fixed.contacts};
  }
  assert.equal(key.id,'-1:0');

  // The DDA band must be a superset of a brute-force scan in BOTH directions,
  // and repeating a query must return the identical list. It is deliberately
  // not asserted that the two directions agree exactly: a segment that grazes a
  // chunk corner picks up a different diagonal halo each way. That is harmless —
  // extra candidates are ID-sorted and only ever add clearance checks.
  for(const [x0,z0,x1,z1] of [[0,0,-400,300],[-400,300,0,0],[0,0,0,0],[5000,-5000,-5000,5000],[-210,160,-210,160],[-3000,-3000,3000,3000],[0,-4000,0,4000],[-4000,0,4000,0]]){
    const forward=world.queryIslands(x0,z0,x1,z1,[]).map(i=>i.id);
    assert.deepEqual(world.queryIslands(x0,z0,x1,z1,[]).map(i=>i.id),forward,'repeated query differs');
    assert.deepEqual([...forward].sort(),forward,'candidates are not in stable ID order');
    const backward=world.queryIslands(x1,z1,x0,z0,[]).map(i=>i.id);
    const brute=bruteForceBand(x0,z0,x1,z1);
    for(const id of brute){assert.ok(forward.includes(id),`DDA band missed ${id}`);assert.ok(backward.includes(id),`reversed DDA band missed ${id}`);}
  }
  for(const island of LANDMARKS){
    assert.equal(chunkIndex(island.x),island.cx);assert.equal(chunkIndex(island.z),island.cz);
    assert.ok(Math.hypot(island.x,island.z)>island.radius+BOAT_RADIUS+90,'spawn clearance');
    assert.ok(island.radius>=26&&island.radius<=64);
    assert.equal(island.seed,hash32(0x53554e57,island.cx,island.cz,7));
  }
  assert.equal(SHORE_TOP,1.60,'TASKS A1 shore wall top');assert.ok(APRON_TOP<=-1.45,'TASKS A1 apron');
  assert.ok(64+BOAT_RADIUS<CHUNK,'one chunk must contain the largest island plus the boat');

  // 1. Coincident spawn, and every degenerate overlap recovery.
  for(const [x,z,label] of [[key.x,key.z,'dead centre'],[key.x+1e-9,key.z,'a nanometre off centre'],[key.x+key.radius,key.z,'on the wall'],[key.x,key.z+.5,'just inside']]){
    const s=createSimulation({x,z},world,0);
    const c=assertClear(s.boat.x,s.boat.z,'coincident spawn: '+label);
    assert.ok(c.gap<=.01,`${label} should be pushed to the shore, not teleported (gap ${c.gap})`);
  }
  assert.equal(resolveOverlap(key.x,key.z,BOAT_RADIUS,[key],{}).x,key.x+HARD(key)+.001,'+X for a coincident centre');

  // 2. Single-call displacements from 0 to 10,000 m, straight through one island.
  // Deliberately a one-island world: with the full six, a long segment can hit a
  // different shore first and slide, which would make a tunnelling assertion
  // meaningless rather than strict.
  const out={},scratch={},solo=[key],soloQuery=(x0,z0,x1,z1,list=[])=>{list.length=0;list.push(key);return list;};
  const lengths=[0,1e-9,.001,.05,.5,1,2,5,10,25,50,100,250,500,1000,2500,5000,10000];
  let farthestPenetration=0,stopped=0;
  for(const length of lengths)for(let bearing=0;bearing<360;bearing+=15){
    const angle=bearing*Math.PI/180,dx=Math.cos(angle),dz=Math.sin(angle);
    // Start `length` away on the far side and drive straight at the centre.
    const start={x:key.x-dx*length,z:key.z-dz*length};
    moveCircleSwept(start,{x:dx*length*2,z:dz*length*2},{x:dx*8,z:dz*8},BOAT_RADIUS,soloQuery,out,scratch);
    const gap=Math.hypot(out.x-key.x,out.z-key.z)-HARD(key);
    assert.ok(gap>=-TOLERANCE,`${length} m on bearing ${bearing}: inside by ${-gap} m`);
    // It must stop on the near side; a tunnel would put it past the centre.
    if(length>HARD(key)){assert.ok((out.x-key.x)*dx+(out.z-key.z)*dz<=-key.radius,`tunnelled through at ${length} m on bearing ${bearing}`);stopped++;}
    farthestPenetration=Math.max(farthestPenetration,-gap);
  }
  report.longestDisplacement=Math.max(...lengths);
  report.blockedDisplacements=stopped;
  report.worstSingleCallPenetration=farthestPenetration;
  // The same sweeps against the whole world only have to stay clear.
  for(const length of lengths)for(let bearing=0;bearing<360;bearing+=15){
    const angle=bearing*Math.PI/180,dx=Math.cos(angle),dz=Math.sin(angle);
    const start={x:key.x-dx*length,z:key.z-dz*length};
    moveCircleSwept(start,{x:dx*length*2,z:dz*length*2},{x:dx*8,z:dz*8},BOAT_RADIUS,world.queryIslands,out,scratch);
    assertClear(out.x,out.z,`${length} m displacement on bearing ${bearing}, six islands`);
  }

  // 3. Seeded random sweeps, including starts already deep inside a shore.
  let seed=0x5117;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<20000;i++){
    const island=LANDMARKS[i%LANDMARKS.length],angle=random()*Math.PI*2,reach=random()*random()*400;
    const start={x:island.x+Math.cos(angle)*reach,z:island.z+Math.sin(angle)*reach};
    const heading=random()*Math.PI*2,length=random()**3*2000;
    const displacement={x:Math.cos(heading)*length,z:Math.sin(heading)*length};
    moveCircleSwept(start,displacement,{x:displacement.x*60,z:displacement.z*60},BOAT_RADIUS,world.queryIslands,out,scratch);
    assert.ok(Number.isFinite(out.x)&&Number.isFinite(out.z),'non-finite sweep result');
    assertClear(out.x,out.z,`random sweep ${i}`);
  }
  report.randomSweeps=20000;

  // 4. The named approaches, driven through the real boat model in live waves.
  const east=key.x+140,offset=HARD(key);
  report.headOn={};sail('head-on',{x:east,z:key.z,yaw:-Math.PI/2},{throttle:1},60,report.headOn);
  assert.ok(report.headOn.contacts>0,'head-on never touched the shore');
  assert.ok(report.headOn.minGap>=-TOLERANCE&&report.headOn.x>key.x,'head-on ended on the near side');
  assert.ok(Math.abs(report.headOn.speed)<1.2,'head-on should be stopped against the wall');

  report.tangent={};sail('tangent',{x:east,z:key.z+offset,yaw:-Math.PI/2},{throttle:1},60,report.tangent);
  assert.ok(report.tangent.minGap>=-TOLERANCE);
  assert.ok(report.tangent.x<key.x-key.radius,'tangent approach must slip past, not stick');

  report.oblique={};sail('oblique',{x:east,z:key.z+70,yaw:-Math.PI/2-.45},{throttle:1},70,report.oblique);
  assert.ok(report.oblique.contacts>0&&report.oblique.minGap>=-TOLERANCE);

  // Stern-first: spawn facing away from the island and drive astern into it.
  report.reverse={};sail('reverse',{x:east,z:key.z,yaw:Math.PI/2},{throttle:-1},120,report.reverse);
  assert.ok(report.reverse.contacts>0,'reverse never reached the shore');
  assert.ok(report.reverse.minGap>=-TOLERANCE&&report.reverse.x>key.x);

  // Held against the shore at full throttle for ten minutes in live waves. This
  // is the creep test: 36,000 sustained contacts must not walk the hull through.
  const rested=sail('at-rest',{x:key.x+HARD(key)+.02,z:key.z,yaw:-Math.PI/2},{throttle:1},600,report.atRest={});
  assert.ok(report.atRest.minGap>=-TOLERANCE,'at-rest drifted inside');
  assert.ok(Object.values(rested.boat).every(Number.isFinite));
  // Grinding along the wall under power and full rudder, the other creep shape.
  sail('grinding',{x:key.x+HARD(key)+.02,z:key.z,yaw:-Math.PI/2},{throttle:1,steer:1},300,report.grinding={});
  assert.ok(report.grinding.minGap>=-TOLERANCE,'grinding drifted inside');

  // Oblique sliding contact is where a straight render lerp actually cuts the
  // corner. If this is ever zero the render correction is untested, not unneeded.
  const grazing={};sail('grazing',{x:east,z:key.z+offset+2,yaw:-Math.PI/2-.06},{throttle:1},60,grazing);
  report.rawRenderLerpViolations=grazing.rawViolations+report.oblique.rawViolations+report.headOn.rawViolations;
  report.rawRenderLerpInsideSkin=grazing.skinViolations+report.oblique.skinViolations+report.headOn.skinViolations;
  // Honest note: at <=12 m/s a 1/60 s chord on a 36.6 m circle sags about 1.4e-4 m,
  // which the 1 mm CONTACT_SKIN already absorbs, so sliding contact alone never
  // pushes the raw lerp past the hard radius. That makes the render correction
  // untested by sailing, so it is falsified directly instead.
  assert.ok(report.rawRenderLerpInsideSkin>0,'sliding contact never even entered the skin — the grazing case is not grazing');
  const R=HARD(key)+.001,chord=.7;
  const mid={x:key.x+(Math.cos(0)+Math.cos(chord))/2*R,z:key.z+(Math.sin(0)+Math.sin(chord))/2*R};
  report.constructedChordCut=-clearance(mid.x,mid.z).gap;
  assert.ok(report.constructedChordCut>1e-3,'the constructed chord does not actually cut the shore');
  const corrected=world.clearCentre(mid.x,mid.z,{});
  assertClear(corrected.x,corrected.z,'corrected render centre of a cutting chord');
  assert.ok(corrected.pushed>0,'clearCentre did nothing to a chord that cuts in');
  report.minGap=Math.min(report.headOn.minGap,report.tangent.minGap,report.oblique.minGap,report.reverse.minGap,report.atRest.minGap,report.grinding.minGap,grazing.minGap);

  // 5. A deliberately hostile step: teleport-sized displacement every tick.
  const bolt=createSimulation({x:east,z:key.z,yaw:-Math.PI/2},world,0);
  const boltRender={};let boltRaw=0;
  for(let step=0;step<400;step++){
    const px=bolt.boat.x,pz=bolt.boat.z;
    bolt.boat.vx=-3000;bolt.boat.vz=(step%7-3)*400;
    tickSimulation(bolt,{throttle:1});
    assertClear(bolt.boat.x,bolt.boat.z,`bolt step ${step}`);
    for(const alpha of [0,.25,.5,.75,1]){
      if(clearance(px+(bolt.boat.x-px)*alpha,pz+(bolt.boat.z-pz)*alpha).gap<-TOLERANCE)boltRaw++;
      bolt.accumulator=alpha*FIXED_DT;interpolateSimulation(bolt,boltRender);
      assertClear(boltRender.x,boltRender.z,`bolt render alpha ${alpha} step ${step}`);
    }
    bolt.accumulator=0;
  }
  report.boltRawRenderLerpViolations=boltRaw;
  report.boltSteps=400;

  // ---------------------------------------------------------------- M5 -----
  // 6. The DDA band over the real infinite world, against an independent
  // chunk-rectangle scan, on segments long enough to cross dozens of chunks.
  let bandChecks=0,bandCandidates=0;
  for(const [x0,z0,x1,z1] of [[0,0,4000,3000],[4000,3000,0,0],[-9000,2000,9000,-2000],[0,0,0,12000],
      [0,0,12000,0],[1e5,1e5,1e5+800,1e5-600],[-2e5,3e5,-2e5-1500,3e5+1500],[384,384,384,384],[-768,0,768,0]]){
    const forward=live.queryIslands(x0,z0,x1,z1,[]).map(i=>i.id);
    assert.deepEqual(live.queryIslands(x0,z0,x1,z1,[]).map(i=>i.id),forward,'repeated live query differs');
    assert.deepEqual([...forward].sort(),forward,'live candidates are not in stable ID order');
    const backward=live.queryIslands(x1,z1,x0,z0,[]).map(i=>i.id);
    for(const id of bruteForceBand(x0,z0,x1,z1,generateIsland)){
      assert.ok(forward.includes(id),`live DDA band missed ${id}`);
      assert.ok(backward.includes(id),`reversed live DDA band missed ${id}`);
    }
    bandChecks++;bandCandidates+=forward.length;
  }
  report.liveBandSegments=bandChecks;report.liveBandCandidates=bandCandidates;

  // 7. 100,000 randomised sweeps scattered across the infinite world, including
  // starts already deep inside a shore and displacements up to 4 km.
  let liveSeed=0xC0FFEE;const rnd=()=>{liveSeed=(Math.imul(liveSeed,1664525)+1013904223)>>>0;return liveSeed/4294967296;};
  let cases=0,insideStarts=0,blocked=0,worstRandom=Infinity,maxCache=0;
  for(let i=0;i<100000;i++){
    // Bias hard toward the neighbourhood of a real island; the rest is open sea.
    const cx=Math.round((rnd()-.5)*600),cz=Math.round((rnd()-.5)*600);
    const island=generateIsland(cx,cz);
    const ax=island?island.x:(cx+.5)*CHUNK,az=island?island.z:(cz+.5)*CHUNK;
    const radius=island?island.radius:40;
    const angle=rnd()*Math.PI*2,reach=rnd()*rnd()*radius*3.5;
    const start={x:ax+Math.cos(angle)*reach,z:az+Math.sin(angle)*reach};
    if(island&&reach<radius)insideStarts++;
    const heading=rnd()*Math.PI*2,length=Math.pow(rnd(),3)*4000;
    const displacement={x:Math.cos(heading)*length,z:Math.sin(heading)*length};
    moveCircleSwept(start,displacement,{x:displacement.x*17,z:displacement.z*17},BOAT_RADIUS,live.queryIslands,out,scratch);
    assert.ok(Number.isFinite(out.x)&&Number.isFinite(out.z),`non-finite live sweep ${i}`);
    const gap=assertClearLive(out.x,out.z,`live random sweep ${i}`).gap;
    if(Number.isFinite(gap))worstRandom=Math.min(worstRandom,gap);
    if(out.contacts)blocked++;
    maxCache=Math.max(maxCache,live.cacheSize);
    cases++;
  }
  Object.assign(report,{liveRandomSweeps:cases,liveStartsInsideAShore:insideStarts,
    liveSweepsThatHitAShore:blocked,liveWorstRandomClearance:worstRandom,liveMaxCacheSize:maxCache});
  assert.equal(cases,100000);
  assert.ok(insideStarts>1000,'not enough sweeps started inside a shore to be a recovery test');
  assert.ok(blocked>5000,'the randomised sweeps barely touched anything');
  assert.ok(maxCache<=DESCRIPTOR_CACHE,`descriptor cache grew to ${maxCache}`);

  // 8. A ~20 km sailed route through the real world. Every fixed step is checked
  // on the simulated centre and on the interpolated render centre, and the
  // descriptor cache must stay bounded the whole way.
  const route=createSimulation({x:0,z:0,yaw:-Math.PI/2},live,0);
  const render={},raw={x:0,z:0};
  let travelled=0,steps=0,routeMin=Infinity,routeContacts=0,routeRaw=0,visited=new Set(),routeCache=0;
  let furthest=0,avoidList=[];
  const before=live.stats().generated;
  const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // An outward weaving spiral with a short-range shore-avoidance term: it covers
  // real ground instead of looping, and still grazes shores often enough for the
  // contact path to be exercised the whole way.
  while(travelled<20000&&steps<400000){
    const px=route.boat.x,pz=route.boat.z;
    const spread=Math.hypot(px,pz);
    const want=spread<60?-Math.PI/2:Math.atan2(px,pz)+.62*Math.sin(steps/9000);
    let steer=wrapAngle(want-route.boat.yaw)*1.6;
    for(const island of live.nearby(px,pz,90,avoidList)){
      const gap=Math.hypot(island.x-px,island.z-pz)-island.radius;
      const relative=wrapAngle(Math.atan2(island.x-px,island.z-pz)-route.boat.yaw);
      if(gap>34||Math.abs(relative)>1.15)continue;
      steer-=Math.sign(relative||1)*(1-gap/34)*2.2;
    }
    tickSimulation(route,{throttle:1,steer:Math.max(-1,Math.min(1,steer))});
    assert.ok(Object.values(route.boat).every(Number.isFinite),`route: non-finite state at step ${steps}`);
    travelled+=Math.hypot(route.boat.x-px,route.boat.z-pz);
    routeMin=Math.min(routeMin,assertClearLive(route.boat.x,route.boat.z,`route step ${steps}`).gap);
    if(route.scratch.contact?.contacts)routeContacts+=route.scratch.contact.contacts;
    for(const alpha of [.25,.5,.75]){
      raw.x=px+(route.boat.x-px)*alpha;raw.z=pz+(route.boat.z-pz)*alpha;
      if(clearanceIn(live,raw.x,raw.z).gap<-TOLERANCE)routeRaw++;
      route.accumulator=alpha*FIXED_DT;interpolateSimulation(route,render);
      assertClearLive(render.x,render.z,`route render alpha ${alpha} step ${steps}`);
    }
    route.accumulator=0;
    visited.add(chunkIndex(route.boat.x)+':'+chunkIndex(route.boat.z));
    furthest=Math.max(furthest,Math.hypot(route.boat.x,route.boat.z));
    routeCache=Math.max(routeCache,live.cacheSize);
    steps++;
  }
  Object.assign(report,{routeMetres:travelled,routeSteps:steps,routeMinClearance:routeMin,
    routeContacts,routeRawRenderLerpViolations:routeRaw,routeChunksEntered:visited.size,
    routeChunksGenerated:live.stats().generated-before,routeMaxCacheSize:routeCache,
    routeFurthestFromOrigin:furthest,
    routeEnd:{x:route.boat.x,z:route.boat.z}});
  assert.ok(travelled>=20000,`route only covered ${travelled} m`);
  assert.ok(routeMin>=-TOLERANCE,`route entered a shore by ${-routeMin} m`);
  assert.ok(routeContacts>0,'a 20 km route never met a single island — the world is empty');
  assert.ok(visited.size>40,`the route only entered ${visited.size} chunks`);
  assert.ok(furthest>6000,`the route never got further than ${furthest} m from the launch`);
  assert.ok(routeCache<=DESCRIPTOR_CACHE,`route grew the descriptor cache to ${routeCache}`);
  return report;
}
