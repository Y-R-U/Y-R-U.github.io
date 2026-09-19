import assert from 'node:assert/strict';
import {createWorld,generateIsland,LANDMARKS,hash32,chunkIndex,CHUNK,BOAT_RADIUS,
  MIN_ISLAND_RADIUS,MAX_ISLAND_RADIUS,OCCUPANCY,JITTER,SPAWN_CLEARANCE,SHORE_TOP,
  PROFILES,DESCRIPTOR_CACHE} from '../js/core/world.mjs';
import {islandField} from '../js/core/island-shape.mjs';

const ROW=100,HALF=ROW/2;
const coordinates=[];for(let cz=-HALF;cz<HALF;cz++)for(let cx=-HALF;cx<HALF;cx++)coordinates.push([cx,cz]);

// A descriptor reduced to exactly the bytes that matter, in chunk-id order, so
// two runs can be compared as one string regardless of the order they were asked.
const row=(key,island)=>island===null?key+'|-':
  [key,island.x,island.z,island.radius,island.height,island.profile,island.seed,island.landmark??''].join('|');
function collect(order,world){
  const map=new Map();
  for(const [cx,cz] of order)map.set(cx+':'+cz,world.chunkIsland(cx,cz));
  return [...map.keys()].sort().map(key=>row(key,map.get(key))).join('\n');
}

export function world(){
  const report={chunks:coordinates.length};

  // 1. Query order, cache size and session must not change the world.
  const reference=collect(coordinates,createWorld());
  const columnMajor=[...coordinates].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const reversed=[...coordinates].slice().reverse();
  let seed=0x9e37;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const shuffled=[...coordinates];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  // A spiral out from the origin is what actually sailing produces.
  const spiral=[...coordinates].sort((a,b)=>Math.hypot(a[0],a[1])-Math.hypot(b[0],b[1]));
  const orders=[['column-major',columnMajor,undefined],['reversed',reversed,undefined],
    ['shuffled',shuffled,undefined],['spiral',spiral,undefined],
    ['shuffled, 8-chunk cache',shuffled,8],['row-major, unbounded cache',coordinates,1e9]];
  for(const [name,order,cacheLimit] of orders){
    const world=createWorld(cacheLimit===undefined?{}:{cacheLimit});
    assert.equal(collect(order,world),reference,`${name} produced a different world`);
    if(cacheLimit===undefined)assert.ok(world.cacheSize<=DESCRIPTOR_CACHE,`cache grew to ${world.cacheSize}`);
    if(cacheLimit===8)assert.ok(world.cacheSize<=8,'explicit cache limit ignored');
  }
  // …and with no world object and no cache at all.
  assert.equal(coordinates.map(([cx,cz])=>row(cx+':'+cz,generateIsland(cx,cz))).sort().join('\n'),
    [...reference.split('\n')].sort().join('\n'),'the cacheless generator disagrees');
  report.orders=orders.length+1;

  // 2. Population shape.
  const islands=new Map();
  for(const [cx,cz] of coordinates){const island=generateIsland(cx,cz);if(island)islands.set(cx+':'+cz,island);}
  report.occupied=islands.size;
  report.occupancy=islands.size/coordinates.length;
  assert.ok(Math.abs(report.occupancy-OCCUPANCY)<.02,`occupancy ${report.occupancy}`);
  let smallest=Infinity,largest=0,lowest=Infinity,tallest=0;
  const profiles={};
  for(const island of islands.values()){
    assert.equal(island.id,island.cx+':'+island.cz);
    assert.ok(island.radius>=MIN_ISLAND_RADIUS-1e-9&&island.radius<=MAX_ISLAND_RADIUS+1e-9,`radius ${island.radius}`);
    assert.ok(island.height>=6-1e-9&&island.height<=24+1e-9,`height ${island.height}`);
    assert.ok(PROFILES.includes(island.profile));
    assert.equal(chunkIndex(island.x),island.cx);assert.equal(chunkIndex(island.z),island.cz);
    assert.equal(island.seed,hash32(0x53554e57,island.cx,island.cz,7));
    // The whole collision circle stays inside its own chunk. This is what makes
    // the DDA band provably complete, and it is a consequence of JITTER<CHUNK/2.
    const ox=island.x-island.cx*CHUNK,oz=island.z-island.cz*CHUNK,reach=island.radius+BOAT_RADIUS;
    assert.ok(ox>=CHUNK/2-JITTER-1e-9&&ox<=CHUNK/2+JITTER+1e-9,`x jitter ${ox}`);
    assert.ok(oz>=CHUNK/2-JITTER-1e-9&&oz<=CHUNK/2+JITTER+1e-9,`z jitter ${oz}`);
    assert.ok(ox-reach>=0&&ox+reach<=CHUNK,`${island.id} circle leaves its chunk in x`);
    assert.ok(oz-reach>=0&&oz+reach<=CHUNK,`${island.id} circle leaves its chunk in z`);
    smallest=Math.min(smallest,island.radius);largest=Math.max(largest,island.radius);
    lowest=Math.min(lowest,island.height);tallest=Math.max(tallest,island.height);
    profiles[island.profile]=(profiles[island.profile]||0)+1;
  }
  Object.assign(report,{smallestRadius:smallest,largestRadius:largest,lowest,tallest,profiles});
  assert.ok(Object.values(profiles).every(n=>n>islands.size/6),'a profile is starved');

  // 3. Open channels: neighbouring centres are 256 m apart on their separating
  // axis, so even two maximum-radius shores leave a 128 m channel.
  let closestCentres=Infinity,narrowestChannel=Infinity;
  for(const island of islands.values())for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
    if(!ox&&!oz)continue;
    const other=islands.get((island.cx+ox)+':'+(island.cz+oz));if(!other)continue;
    if(ox)assert.ok(Math.abs(island.x-other.x)>=CHUNK-2*JITTER-1e-9,`${island.id} and ${other.id} are too close in x`);
    if(oz)assert.ok(Math.abs(island.z-other.z)>=CHUNK-2*JITTER-1e-9,`${island.id} and ${other.id} are too close in z`);
    const centres=Math.hypot(island.x-other.x,island.z-other.z);
    closestCentres=Math.min(closestCentres,centres);
    narrowestChannel=Math.min(narrowestChannel,centres-island.radius-other.radius);
  }
  report.closestCentres=closestCentres;report.narrowestChannel=narrowestChannel;
  assert.ok(closestCentres>=CHUNK-2*JITTER-1e-9,`closest centres ${closestCentres}`);
  assert.ok(narrowestChannel>=CHUNK-2*JITTER-2*MAX_ISLAND_RADIUS-1e-9,`narrowest channel ${narrowestChannel}`);

  // 4. The launch is water. The origin chunk is reserved outright and any island
  // that would reach the 90 m spawn clearance is suppressed.
  assert.equal(generateIsland(0,0),null,'the origin chunk generated an island');
  for(let cx=-3;cx<=3;cx++)for(let cz=-3;cz<=3;cz++){
    const island=generateIsland(cx,cz);if(!island)continue;
    assert.ok(Math.hypot(island.x,island.z)>=island.radius+BOAT_RADIUS+SPAWN_CLEARANCE,
      `${island.id} is inside the spawn clearance`);
  }
  // 5. Authored landmarks override their whole chunk.
  for(const landmark of LANDMARKS)assert.equal(generateIsland(landmark.cx,landmark.cz),landmark,landmark.landmark+' was not placed');
  report.landmarks=LANDMARKS.length;

  // 6. Silhouette invariants, on the same pure module the renderer builds from.
  // Nothing above water may leave the collision circle, the wall top never drops
  // below the hard floor, and the terrain meets the wall exactly at the rim.
  const sample=[...islands.values()].filter((_,i)=>i%7===0).concat(LANDMARKS);
  let maxWallRadius=0,minWallTop=Infinity,maxWallTop=0,maxRimError=0,minHeight=Infinity,edgeSpread=0;
  for(const island of sample){
    const field=islandField(island),angles=128;
    let first=null,last=null;
    for(let i=0;i<angles;i++){
      const a=i/angles*Math.PI*2,wr=field.wallRadius(a),top=field.wallTop(a);
      assert.ok(wr<=island.radius+1e-12&&wr>=island.radius-.601,`wall radius ${wr} vs ${island.radius}`);
      assert.ok(top>=SHORE_TOP-1e-12&&top<=3.5+1e-12,`wall top ${top}`);
      maxWallRadius=Math.max(maxWallRadius,island.radius-wr);
      minWallTop=Math.min(minWallTop,top);maxWallTop=Math.max(maxWallTop,top);
      // Rim continuity: the terrain's outermost ring is the wall top itself.
      const rim=field.heightAt(Math.cos(a)*wr,Math.sin(a)*wr);
      maxRimError=Math.max(maxRimError,Math.abs(rim-top));
      for(let k=0;k<=24;k++){
        const r=wr*(1-k/24),h=field.heightAt(Math.cos(a)*r,Math.sin(a)*r);
        assert.ok(Number.isFinite(h)&&h>=SHORE_TOP-1e-9,`height ${h} at ${island.id}`);
        assert.ok(r<=island.radius+1e-12,'terrain sample outside the collision circle');
        minHeight=Math.min(minHeight,h);
      }
      const edges=field.edgeStations(a,[]);
      assert.equal(edges.length,3);
      assert.ok(edges.every((v,j)=>v>=0&&v<=1&&(j===0||v>=edges[j-1]-1e-12)),'terrace edges out of order');
      if(first===null)first=edges[0];last=edges[0];
      edgeSpread=Math.max(edgeSpread,Math.abs(edges[0]-first));
    }
    // A perfectly concentric rim would have zero spread. D1's whole point.
    assert.ok(edgeSpread>.02,`${island.id} first terrace edge is concentric (spread ${edgeSpread})`);
  }
  Object.assign(report,{shapeSamples:sample.length,maxWallRelief:maxWallRadius,minWallTop,maxWallTop,
    maxRimDiscontinuity:maxRimError,minTerrainHeight:minHeight,maxFirstEdgeSpread:edgeSpread});
  assert.ok(maxRimError<1e-9,`terrain and wall disagree at the rim by ${maxRimError} m`);

  // 7. The streaming ranges must be inside what the query band guarantees.
  assert.ok(MAX_ISLAND_RADIUS+BOAT_RADIUS<CHUNK/2-JITTER,'an island could reach outside its chunk');
  return report;
}
