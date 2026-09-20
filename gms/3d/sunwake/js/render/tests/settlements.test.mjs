import assert from 'node:assert/strict';
import {generateIsland,LANDMARKS,createWorld,BOAT_RADIUS,SHORE_TOP} from '../../core/world.mjs';
import {CONTACT_SKIN} from '../../core/collision.mjs';
import {islandField,mooringLayout} from '../../core/island-shape.mjs';
const world=createWorld(),islands=[...LANDMARKS];
for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++){const island=generateIsland(x,z);if(island)islands.push(island);}
let seams=0,minimumApproach=Infinity,maximumContactError=0;
for(const island of islands){
 const dock=mooringLayout(island),field=islandField(island,{harbour:true});
 assert.deepEqual(dock,mooringLayout({...island}),'handover depends only on the descriptor');
 assert.ok(Math.hypot(dock.deck.x-island.x,dock.deck.z-island.z)<island.radius);
 const clearance=world.sampleShoreDistance(dock.approach.x,dock.approach.z)-BOAT_RADIUS;minimumApproach=Math.min(minimumApproach,clearance);assert.ok(clearance>1.99);
 // Sweep into the visual landing. Collision still stops on the original circle,
 // without needing a separate jetty/post collider or changing the hull.
 const b={x:dock.deck.x,z:dock.deck.z,vx:-dock.nx*4,vz:-dock.nz*4};
 world.resolveBoat(b,dock.approach.x,dock.approach.z,1/60);
 const error=Math.abs(Math.hypot(b.x-island.x,b.z-island.z)-island.radius-BOAT_RADIUS-CONTACT_SKIN);
 maximumContactError=Math.max(maximumContactError,error);assert.ok(error<1e-4);
 for(let k=0;k<128;k++){
  const a=k/128*Math.PI*2,r=field.wallRadius(a),top=field.wallTop(a);
  assert.ok(r<=island.radius&&r>=island.radius-dock.inset-.601);
  assert.ok(top>=SHORE_TOP);
  assert.ok(Math.abs(field.heightAt(Math.cos(a)*r,Math.sin(a)*r)-top)<1e-8,'visual inlet has an open seam');seams++;
 }
}
console.log('PASS settlement handovers / inlet seams',JSON.stringify({islands:islands.length,seams,minimumApproach,maximumContactError},null,2));
