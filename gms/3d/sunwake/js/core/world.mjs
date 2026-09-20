import {SEED} from './config.mjs';
import {moveCircleSwept,resolveOverlap,deepestOverlap} from './collision.mjs';
// Deterministic geography. Pure — no THREE, no DOM, no Math.random.
// Every chunk's island is a pure function of (SEED,cx,cz): the cache below is
// only a speed-up, so query order, eviction and session boundaries can never
// change what the world contains.
export const CHUNK=384;
export const BOAT_RADIUS=2.6;
export const MIN_ISLAND_RADIUS=26;
export const MAX_ISLAND_RADIUS=64;
export const OCCUPANCY=.55;
export const JITTER=64;               // CHUNK-2*JITTER = 256 m minimum separation
export const SHORE_TOP=1.60;   // TASKS A1 raised this from PLAN's +1.05
export const SHORE_BOTTOM=-2.0;
export const APRON_TOP=-1.45;  // TASKS A1 lowered this from PLAN's -0.95
export const SPAWN_CLEARANCE=90;
export const DESCRIPTOR_CACHE=256;
export const PROFILES=Object.freeze(['mesa','garden','split']);
export const chunkIndex=v=>Math.floor(v/CHUNK);

export function hash32(seed,cx,cz,salt){
  let h=Math.imul(seed^0x9e3779b9,0x85ebca6b);
  h=Math.imul(h^Math.imul(cx|0,0xc2b2ae35),0x27d4eb2f);
  h=Math.imul(h^Math.imul(cz|0,0x165667b1),0x9e3779b1);
  h=Math.imul(h^(salt|0),0x85ebca6b);
  h^=h>>>15;h=Math.imul(h,0x2545f491);h^=h>>>13;h=Math.imul(h,0x3b2ae1cb);h^=h>>>16;
  return h>>>0;
}
const unit=(cx,cz,salt)=>hash32(SEED,cx,cz,salt)/4294967296;

// PLAN §7. Fixed for this seed; coordinates are metres and clear of the origin.
export const LANDMARKS=Object.freeze([
  {id:'-1:0',cx:-1,cz:0,x:-210,z:160,radius:34,height:12,profile:'mesa',landmark:'Lantern Key'},
  {id:'-2:1',cx:-2,cz:1,x:-540,z:520,radius:40,height:14,profile:'garden',landmark:'Bell Garden'},
  {id:'0:2',cx:0,cz:2,x:170,z:920,radius:52,height:20,profile:'split',landmark:'Split Crown'},
  {id:'2:1',cx:2,cz:1,x:910,z:580,radius:48,height:16,profile:'mesa',landmark:'Cinder Steps'},
  {id:'1:-2',cx:1,cz:-2,x:570,z:-590,radius:36,height:21,profile:'split',landmark:'White Needle'},
  {id:'-2:-2',cx:-2,cz:-2,x:-580,z:-530,radius:58,height:18,profile:'garden',landmark:'Last Orchard'},
].map(island=>Object.freeze({...island,seed:hash32(SEED,island.cx,island.cz,7)})));
const LANDMARK_CHUNKS=new Map(LANDMARKS.map(island=>[island.id,island]));

// PLAN §4. One island at most per chunk, 55% occupancy, centre = chunk centre
// with independent +/-64 m jitter, radius 26-64 m. Because the jitter is under
// half the chunk, two neighbouring centres are always at least 256 m apart on
// their separating axis, and an island's whole collision circle always stays
// inside its own chunk.
export function generateIsland(cx,cz){
  const id=cx+':'+cz,landmark=LANDMARK_CHUNKS.get(id);
  if(landmark)return landmark;
  if(cx===0&&cz===0)return null;                       // the launch chunk is water
  if(unit(cx,cz,1)>=OCCUPANCY)return null;
  const x=(cx+.5)*CHUNK+(unit(cx,cz,2)*2-1)*JITTER;
  const z=(cz+.5)*CHUNK+(unit(cx,cz,3)*2-1)*JITTER;
  const radius=MIN_ISLAND_RADIUS+(MAX_ISLAND_RADIUS-MIN_ISLAND_RADIUS)*Math.pow(unit(cx,cz,4),1.6);
  if(Math.hypot(x,z)<radius+BOAT_RADIUS+SPAWN_CLEARANCE)return null;   // spawn water
  const height=Math.max(6,Math.min(24,radius*(.24+.20*unit(cx,cz,5))));
  return Object.freeze({id,cx,cz,x,z,radius,height,
    profile:PROFILES[hash32(SEED,cx,cz,6)%PROFILES.length],
    landmark:null,seed:hash32(SEED,cx,cz,7)});
}

/**
 * `generate` is injected only so a test can pin a fixture world; production
 * always uses the pure `generateIsland`. `cacheLimit` bounds the descriptor
 * cache — collision regenerates an uncached chunk immediately, so a bounded
 * cache can never mean a missing collider.
 */
export function createWorld({generate=generateIsland,cacheLimit=DESCRIPTOR_CACHE}={}){
  for(const island of LANDMARKS){
    if(Math.hypot(island.x,island.z)<island.radius+BOAT_RADIUS+SPAWN_CLEARANCE)throw new Error('Island '+island.id+' violates the spawn clearance');
    if(chunkIndex(island.x)!==island.cx||chunkIndex(island.z)!==island.cz)throw new Error('Island '+island.id+' is not in its own chunk');
  }
  const scratch={},pushOut={},spawn={x:0,z:0};
  // Insertion-ordered LRU-by-age. Purely a speed-up over `generate`.
  const cache=new Map();let generated=0,hits=0;
  function chunkIsland(cx,cz){
    const key=cx+':'+cz;
    if(cache.has(key)){hits++;return cache.get(key);}
    const island=generate(cx,cz);generated++;
    cache.set(key,island);
    if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);
    return island;
  }

  // PLAN §4.1. Grid DDA along the centre segment plus one neighbouring chunk in
  // every direction. Maximum island+boat radius is 66.6 m, under one chunk, so
  // that band provably contains every possible collider.
  function queryIslands(x0,z0,x1,z1,out=[]){
    out.length=0;
    if(![x0,z0,x1,z1].every(Number.isFinite))return out;
    const seen=scratch.seen||(scratch.seen=new Set());seen.clear();
    const visit=(cx,cz)=>{
      for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
        const island=chunkIsland(cx+ox,cz+oz);
        if(island&&!seen.has(island.id)){seen.add(island.id);out.push(island);}
      }
    };
    let cx=chunkIndex(x0),cz=chunkIndex(z0);
    const ex=chunkIndex(x1),ez=chunkIndex(z1),dx=x1-x0,dz=z1-z0;
    const sx=Math.sign(dx),sz=Math.sign(dz);
    let tMaxX=sx===0?Infinity:((sx>0?cx+1:cx)*CHUNK-x0)/dx,tMaxZ=sz===0?Infinity:((sz>0?cz+1:cz)*CHUNK-z0)/dz;
    const tDeltaX=sx===0?Infinity:CHUNK/Math.abs(dx),tDeltaZ=sz===0?Infinity:CHUNK/Math.abs(dz);
    visit(cx,cz);
    // Stop on the end cell OR once the next crossing is past the segment. A
    // segment that ends exactly on a chunk corner never matches its end cell
    // and, without the second test, the walk runs away across the world.
    for(let guard=0;(cx!==ex||cz!==ez)&&Math.min(tMaxX,tMaxZ)<=1&&guard<1<<16;guard++){
      // An exact corner tie visits both corner cells before stepping.
      if(tMaxX<tMaxZ){cx+=sx;tMaxX+=tDeltaX;}
      else if(tMaxZ<tMaxX){cz+=sz;tMaxZ+=tDeltaZ;}
      else {visit(cx+sx,cz);visit(cx,cz+sz);cx+=sx;cz+=sz;tMaxX+=tDeltaX;tMaxZ+=tDeltaZ;}
      visit(cx,cz);
    }
    visit(ex,ez);
    out.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    return out;
  }

  // Every island within `range` of the shore, nearest shore first. The sort key
  // is cached on a parallel array so the comparator does no maths — this runs
  // every frame over every streamed chunk.
  const gaps=new Map();
  function nearby(x,z,range,out=[]){
    out.length=0;gaps.clear();
    const minX=chunkIndex(x-range),maxX=chunkIndex(x+range),minZ=chunkIndex(z-range),maxZ=chunkIndex(z+range);
    for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
      const island=chunkIsland(cx,cz);if(!island)continue;
      const gap=Math.hypot(island.x-x,island.z-z)-island.radius;
      if(gap>range)continue;
      gaps.set(island.id,gap);out.push(island);
    }
    out.sort((a,b)=>gaps.get(a.id)-gaps.get(b.id));
    return out;
  }

  const shoreList=[];
  const world={
    landmarks:LANDMARKS,CHUNK,BOAT_RADIUS,chunkIsland,queryIslands,nearby,spawn,
    get cacheSize(){return cache.size;},get generated(){return generated;},get cacheHits(){return hits;},
    stats(){return {cacheSize:cache.size,cacheLimit,generated,hits};},
    sampleShoreDistance(x,z,range=600){let best=Infinity;for(const island of nearby(x,z,range,shoreList))best=Math.min(best,Math.hypot(x-island.x,z-island.z)-island.radius);return best;},
    // Injected into stepBoat. The boat has already been integrated to (b.x,b.z);
    // sweep that displacement from where it actually started.
    // `dt` is passed on so shore friction is a rate, not a per-step constant.
    resolveBoat(b,px,pz,dt){
      const result=moveCircleSwept({x:px,z:pz},{x:b.x-px,z:b.z-pz},{x:b.vx,z:b.vz},BOAT_RADIUS,queryIslands,scratch.move||(scratch.move={}),scratch,dt);
      b.x=result.x;b.z=result.z;b.vx=result.vx;b.vz=result.vz;
      return result;
    },
    clearSpawn(b){
      const candidates=queryIslands(b.x,b.z,b.x,b.z,scratch.spawnList||(scratch.spawnList=[]));
      resolveOverlap(b.x,b.z,BOAT_RADIUS,candidates,pushOut);b.x=pushOut.x;b.z=pushOut.z;return b;
    },
    // PLAN §4: a straight lerp between two safe positions can still cut the
    // corner off a convex shore, so the rendered centre is corrected too —
    // without touching simulation state.
    clearCentre(x,z,out={}){
      const candidates=queryIslands(x,z,x,z,scratch.centreList||(scratch.centreList=[]));
      return resolveOverlap(x,z,BOAT_RADIUS,candidates,out);
    },
    clearance(x,z){
      const candidates=queryIslands(x,z,x,z,scratch.checkList||(scratch.checkList=[]));
      return -deepestOverlap(x,z,BOAT_RADIUS,candidates);
    },
  };
  return world;
}
