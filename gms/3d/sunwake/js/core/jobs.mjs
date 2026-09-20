import {generateIsland,hash32} from './world.mjs';
import {SEED} from './config.mjs';
import {islandName} from './content.mjs';
import {SPECIES,ROD_BAND} from './fishing.mjs';
import {mooringLayout} from './island-shape.mjs';

// The working part of the game: a job board at every island you have been to,
// coins, and three things to spend them on. Pure — no window, no DOM, no THREE.
// Every board is a pure function of (SEED, island, day), so looking at the same
// board twice shows the same three jobs, and an accepted job is stored as
// nothing more than (island, day, slot): a tampered save cannot invent a job or
// a reward, because the job is regenerated from the board it came from.

export const DAY_SECONDS=600;          // ten minutes of sailing is a day
export const BOARD_SIZE=3;
export const MAX_ACTIVE=3;
export const BERTH_RANGE=46;           // metres off the shore the board is in reach
export const BERTH_SPEED=2.2;          // and you have to have stopped
export const DELIVERY_RANGE=24;        // around the destination jetty's approach point
export const VISIT_RANGE=40;           // off the shore of the island you were sent to
export const ARRIVE_SPEED=3;
export const POOL_CHUNKS=4;            // halo of chunks scanned for destinations
export const POOL_MAX_RANGE=1800;

export const dayOf=seconds=>Math.max(0,Math.floor((Number.isFinite(seconds)?seconds:0)/DAY_SECONDS));

// Rod widens the tension band, hull pushes the launch along, chart shows more
// sea and lets you take the long passages. Three levels each, no trees.
export const UPGRADES=Object.freeze({
  rod:{key:'rod',name:'Rod',max:3,costs:Object.freeze([0,120,300]),
    detail:Object.freeze(['Split cane. Honest.','Braided line — a wider safe band.','Tournament blank — wider still.'])},
  hull:{key:'hull',name:'Hull',max:3,costs:Object.freeze([0,150,380]),
    detail:Object.freeze(['As she came.','Cleaned and faired — a little more speed, and she can carry heavy cargo.','Reworked leg and prop — faster again.'])},
  chart:{key:'chart',name:'Chart',max:3,costs:Object.freeze([0,90,260]),
    detail:Object.freeze(['Local waters.','A wider chart — longer passages open up.','The whole passage.'])},
});
export const HULL_THRUST=Object.freeze([0,150,330]);      // newtons added to the engine
export const CHART_RANGE=Object.freeze([1000,1500,2200]); // metres drawn around the boat
export const UPGRADE_KEYS=Object.freeze(['rod','hull','chart']);

export const CARGO=Object.freeze(['Lamp oil','Salt','Rope','Sawn timber','Preserves','Mail sack','Glass floats','Sailcloth','Kerosene','Seed crates']);
export const HEAVY_CARGO=Object.freeze(['Anchor chain','Millstone','Iron stock','Water tank','Roof slate']);

const unit=(a,b,salt)=>hash32(SEED,a,b,salt)/4294967296;
const clampInt=(v,lo,hi)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,Math.floor(v))):lo;
export const ISLAND_ID=/^-?\d{1,8}:-?\d{1,8}$/;
export function islandFromId(id){
  if(typeof id!=='string'||!ISLAND_ID.test(id))return null;
  const [cx,cz]=id.split(':').map(Number);
  return generateIsland(cx,cz);
}

/**
 * Candidate destinations around an island: every island in a chunk halo,
 * landmarks included, nearest first. Generated from `generateIsland` rather than
 * from the live world, so it does not depend on what happens to be streamed in.
 */
export function destinations(island,out=[]){
  out.length=0;
  for(let cx=island.cx-POOL_CHUNKS;cx<=island.cx+POOL_CHUNKS;cx++)for(let cz=island.cz-POOL_CHUNKS;cz<=island.cz+POOL_CHUNKS;cz++){
    if(cx===island.cx&&cz===island.cz)continue;
    const other=generateIsland(cx,cz);
    if(!other)continue;
    const distance=Math.hypot(other.x-island.x,other.z-island.z);
    if(distance>POOL_MAX_RANGE||distance<150)continue;
    out.push(other);
  }
  out.sort((a,b)=>{
    const da=Math.hypot(a.x-island.x,a.z-island.z),db=Math.hypot(b.x-island.x,b.z-island.z);
    return da===db?(a.id<b.id?-1:1):da-db;
  });
  return out;
}

const KINDS=Object.freeze(['cargo','catch','visit']);

function payFor(kind,distance,species,count,heavy){
  if(kind==='catch')return Math.round(16+species.xp*count*.85);
  if(kind==='visit')return Math.round(12+distance*.038);
  return Math.round((18+distance*.052)*(heavy?1.45:1));
}

/** One slot of one island's board on one day. Pure in every argument. */
export function jobAt(island,day,slot,pool=null){
  if(!island)return null;
  const d=day|0,s=slot|0;
  const r=salt=>unit((island.cx*7919+d*131)|0,(island.cz*104729+s*17)|0,salt);
  const kind=KINDS[(s+d)%KINDS.length];
  const id=`${island.id}|${d}|${s}`;
  const base={id,kind,islandId:island.id,day:d,slot:s,from:islandName(island),
    requires:{fishing:0,hull:1,chart:1},progress:0};
  if(kind==='catch'){
    // Weighted down the table, so most boards are catchable and the odd one is
    // a reason to level the rod up.
    const pickable=SPECIES.slice(0,Math.min(SPECIES.length,2+Math.floor(r(11)*4)));
    const species=pickable[Math.floor(r(12)*pickable.length)]||SPECIES[0];
    const count=species.level<=1?2+Math.floor(r(13)*4):species.level<=3?2+Math.floor(r(13)*3):1+Math.floor(r(13)*2);
    return Object.freeze({...base,speciesId:species.id,speciesName:species.name,count,
      title:`${count} × ${species.name}`,
      detail:`The kitchen here wants ${count} ${species.name.toLowerCase()}. Land them anywhere.`,
      coins:payFor(kind,0,species,count,false),
      requires:Object.freeze({fishing:species.level,hull:1,chart:1})});
  }
  const candidates=pool||destinations(island);
  if(!candidates.length)return null;
  // Cargo goes to the near half of the pool, a visit to the far half: a delivery
  // is an errand, a visit is an excuse to sail somewhere you have not been.
  const window=kind==='cargo'
    ?candidates.slice(0,Math.max(1,Math.min(9,candidates.length)))
    :candidates.slice(Math.min(2,candidates.length-1),Math.max(3,Math.min(22,candidates.length)));
  const target=window[Math.floor(r(21)*window.length)]||candidates[0];
  const distance=Math.hypot(target.x-island.x,target.z-island.z);
  const name=islandName(target);
  const chart=distance>1400?3:distance>1150?2:1;
  if(kind==='visit')return Object.freeze({...base,targetId:target.id,targetName:name,
    targetX:target.x,targetZ:target.z,targetRadius:target.radius,
    title:`Call at ${name}`,
    detail:`Someone wants word from ${name}. Sail there and be seen — ${Math.round(distance)} m.`,
    distance,coins:payFor(kind,distance,null,0,false),
    requires:Object.freeze({fishing:0,hull:1,chart})});
  const heavy=r(22)<.30;
  const goods=heavy?HEAVY_CARGO[Math.floor(r(23)*HEAVY_CARGO.length)]:CARGO[Math.floor(r(23)*CARGO.length)];
  const drop=mooringLayout(target);
  return Object.freeze({...base,targetId:target.id,targetName:name,
    targetX:target.x,targetZ:target.z,targetRadius:target.radius,
    dropX:drop.approach.x,dropZ:drop.approach.z,cargo:goods,heavy,
    title:`${goods} to ${name}`,
    detail:`Load ${goods.toLowerCase()} here and lay it alongside the landing at ${name} — ${Math.round(distance)} m.`,
    distance,coins:payFor(kind,distance,null,0,heavy),
    requires:Object.freeze({fishing:0,hull:heavy?2:1,chart})});
}

export function boardFor(island,day,out=[]){
  out.length=0;
  if(!island)return out;
  const pool=destinations(island);
  for(let slot=0;slot<BOARD_SIZE;slot++){const job=jobAt(island,day,slot,pool);if(job)out.push(job);}
  return out;
}

/**
 * Why a job cannot be taken, in the player's words. Aaron was explicit: an
 * ineligible job is shown, greyed, with the reason — never hidden. The skill and
 * upgrade gates are reported first because those are the ones worth reading; the
 * capacity ones are transient.
 */
export function eligibility(job,{fishingLevel=1,upgrades={},active=[]}={}){
  if(!job)return {ok:false,reason:'No job here'};
  const rod=upgrades.rod||1,hull=upgrades.hull||1,chart=upgrades.chart||1;
  if(job.requires.fishing>fishingLevel)return {ok:false,reason:`Needs fishing ${job.requires.fishing}`};
  if(job.requires.hull>hull)return {ok:false,reason:`Too heavy for this hull — needs hull ${job.requires.hull}`};
  if(job.requires.chart>chart)return {ok:false,reason:`Off your chart — needs chart ${job.requires.chart}`};
  if(active.some(a=>a.id===job.id))return {ok:false,reason:'Already in your logbook'};
  if(job.kind==='cargo'&&active.some(a=>a.kind==='cargo'))return {ok:false,reason:'Hold full — one cargo at a time'};
  if(active.length>=MAX_ACTIVE)return {ok:false,reason:`Logbook full — ${MAX_ACTIVE} jobs at a time`};
  return {ok:true,reason:'',rod};
}

export function createJobs(save=null){
  const raw=save&&typeof save==='object'?save:{};
  const upgrades={};
  for(const key of UPGRADE_KEYS)upgrades[key]=clampInt(raw.upgrades?.[key],1,UPGRADES[key].max);
  const state={coins:clampInt(raw.coins,0,1e9),earned:clampInt(raw.earned,0,1e12),
    completed:clampInt(raw.completed,0,1e9),seconds:Number.isFinite(raw.seconds)&&raw.seconds>0?Math.min(raw.seconds,1e9):0,
    upgrades,active:[],lastPay:0};
  const seen=new Set();
  for(const ref of Array.isArray(raw.active)?raw.active.slice(0,MAX_ACTIVE):[]){
    const island=islandFromId(ref?.island);
    if(!island)continue;
    const day=clampInt(ref.day,0,1e7),slot=clampInt(ref.slot,0,BOARD_SIZE-1);
    const job=jobAt(island,day,slot);
    if(!job||seen.has(job.id))continue;
    seen.add(job.id);
    // Progress is the only thing carried across from the save, and it can never
    // be at or past the finish: a save cannot hand you a completed job.
    state.active.push({...job,progress:job.kind==='catch'?clampInt(ref.progress,0,Math.max(0,job.count-1)):0});
  }
  return state;
}

export function encodeJobs(state){
  if(!state)return null;
  return {coins:Math.max(0,Math.floor(state.coins||0)),earned:Math.max(0,Math.floor(state.earned||0)),
    completed:Math.max(0,Math.floor(state.completed||0)),seconds:Math.max(0,state.seconds||0),
    upgrades:{...state.upgrades},
    active:state.active.map(job=>({island:job.islandId,day:job.day,slot:job.slot,progress:job.progress|0}))};
}

export function acceptJob(state,job,context,events){
  const verdict=eligibility(job,context);
  if(!verdict.ok)return false;
  state.active.push({...job,progress:0});
  events?.push({type:'job-taken',id:job.id,title:job.title,coins:job.coins});
  return true;
}

export function abandonJob(state,id,events){
  const index=state.active.findIndex(job=>job.id===id);
  if(index<0)return false;
  const [job]=state.active.splice(index,1);
  events?.push({type:'job-dropped',id:job.id,title:job.title});
  return true;
}

function finish(state,index,events){
  const [job]=state.active.splice(index,1);
  state.coins+=job.coins;state.earned+=job.coins;state.completed++;state.lastPay=job.coins;
  events?.push({type:'job-done',id:job.id,title:job.title,coins:job.coins,kind:job.kind});
  return job;
}

/** How far the boat still is from what a job wants, in metres. */
export function jobRange(job,boat){
  if(!job)return Infinity;
  if(job.kind==='cargo')return Math.hypot(boat.x-job.dropX,boat.z-job.dropZ);
  if(job.kind==='visit')return Math.hypot(boat.x-job.targetX,boat.z-job.targetZ)-job.targetRadius;
  return Infinity;
}

/**
 * The goal a routed course can be aimed at. For a delivery this is the jetty's
 * approach point carrying the TARGET ISLAND'S id, so `courseTo` routes around
 * every other island but does not treat the island you are delivering to as a
 * thing in the way — which would leave the arrow circling it forever.
 */
export function jobGoal(job){
  if(!job)return null;
  if(job.kind==='cargo')return {id:job.targetId,x:job.dropX,z:job.dropZ,radius:0};
  if(job.kind==='visit')return {id:job.targetId,x:job.targetX,z:job.targetZ,radius:job.targetRadius};
  return null;
}

export function stepJobs(state,boat,dt,events){
  state.seconds+=dt;
  const speed=Math.hypot(boat.vx||0,boat.vz||0);
  for(let i=state.active.length-1;i>=0;i--){
    const job=state.active[i];
    if(job.kind==='cargo'&&speed<=ARRIVE_SPEED&&jobRange(job,boat)<=DELIVERY_RANGE)finish(state,i,events);
    else if(job.kind==='visit'&&speed<=ARRIVE_SPEED&&jobRange(job,boat)<=VISIT_RANGE)finish(state,i,events);
  }
}

export function noteCatch(state,speciesId,events){
  for(let i=state.active.length-1;i>=0;i--){
    const job=state.active[i];
    if(job.kind!=='catch'||job.speciesId!==speciesId)continue;
    job.progress++;
    if(job.progress>=job.count)finish(state,i,events);
    else events?.push({type:'job-progress',id:job.id,title:job.title,progress:job.progress,count:job.count});
  }
}

/** Fish pay too, or fishing stops mattering the moment you have a job. */
export function coinsForFish(species,kg){
  const span=Math.max(1e-6,species.kg[1]-species.kg[0]);
  return Math.max(1,Math.round(species.xp*.42*(1+.9*((kg-species.kg[0])/span))));
}
export function payFish(state,species,kg,events){
  const coins=coinsForFish(species,kg);
  state.coins+=coins;state.earned+=coins;
  events?.push({type:'fish-pay',coins});
  return coins;
}

export function upgradeCost(key,level){
  const spec=UPGRADES[key];
  if(!spec||level>=spec.max)return null;
  return spec.costs[level];
}
export function canBuy(state,key){
  const spec=UPGRADES[key];
  if(!spec)return {ok:false,reason:'Nothing here'};
  const level=state.upgrades[key]||1;
  if(level>=spec.max)return {ok:false,reason:'Best there is'};
  const cost=spec.costs[level];
  if(state.coins<cost)return {ok:false,reason:`${cost - state.coins} more coins`,cost};
  return {ok:true,reason:'',cost};
}
export function buyUpgrade(state,key,events){
  const verdict=canBuy(state,key);
  if(!verdict.ok)return false;
  state.coins-=verdict.cost;
  state.upgrades[key]++;
  events?.push({type:'upgrade',key,level:state.upgrades[key],cost:verdict.cost});
  return true;
}

export const rodBand=state=>ROD_BAND[Math.min(ROD_BAND.length,state?.upgrades?.rod||1)-1];
export const hullThrust=state=>HULL_THRUST[Math.min(HULL_THRUST.length,state?.upgrades?.hull||1)-1];
export const chartRange=state=>CHART_RANGE[Math.min(CHART_RANGE.length,state?.upgrades?.chart||1)-1];

/**
 * The island whose board is within reach: the nearest one you have already been
 * to, close in, with the way off her. Takes a plain list so it stays pure.
 */
export function berthAt(boat,nearby,isKnown){
  if(Math.hypot(boat.vx||0,boat.vz||0)>BERTH_SPEED)return null;
  let best=null,bestGap=Infinity;
  for(const island of nearby||[]){
    if(!island)continue;
    const gap=Math.hypot(boat.x-island.x,boat.z-island.z)-island.radius;
    if(gap>BERTH_RANGE||gap>=bestGap)continue;
    if(isKnown&&!isKnown(island))continue;
    best=island;bestGap=gap;
  }
  return best;
}
