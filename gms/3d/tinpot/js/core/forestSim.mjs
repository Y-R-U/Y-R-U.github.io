import {emit} from './combat.mjs';
export function ignite(w,t){if(t.dead||t.burn>0)return;t.burn=5+w.random()*4;t.heat=0;w.forestRevision++;}
export function fell(w,t){if(t.dead)return;t.dead=true;t.hp=0;t.fallTime=w.time;w.forestRevision++;w.terrainDirty=true;emit(w,{type:'tree',x:t.x,z:t.z});}
export function blastTrees(w,x,z,radius){for(const c of w.cover||[]){if(c.dead)continue;const d=Math.hypot(c.x-x,c.z-z);if(d<radius+1){c.hp-=140*(1-d/(radius+1));if(c.hp<=0){c.dead=true;w.terrainDirty=true;w.forestRevision++;}}}for(const t of w.trees){const d=Math.hypot(t.x-x,t.z-z);if(d>radius+1||t.dead)continue;ignite(w,t);t.hp-=Math.max(0,140*(1-d/(radius+1)));if(t.hp<=0)fell(w,t);}}
export function stepForest(w,dt){
 w.fireClock=(w.fireClock||0)+dt;if(w.fireClock<.25)return;const elapsed=w.fireClock;w.fireClock=0;const burning=w.trees.filter(t=>t.burn>0);
 for(const t of burning){t.burn=Math.max(0,t.burn-elapsed);t.hp-=elapsed*32;if(t.hp<=0)fell(w,t);if(t.burn===0){w.forestRevision++;continue;}t.heat=(t.heat||0)+elapsed;if(t.heat<1.25)continue;t.heat=0;
 // Sparse neighbourhood buckets are built once from stable map coordinates.
 if(!w.treeBuckets){w.treeBuckets=new Map();for(const v of w.trees){const key=Math.floor(v.x/4)+','+Math.floor(v.z/4);if(!w.treeBuckets.has(key))w.treeBuckets.set(key,[]);w.treeBuckets.get(key).push(v);}}
 const bx=Math.floor(t.x/4),bz=Math.floor(t.z/4);for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const v of w.treeBuckets.get(x+','+z)||[]){if(v.dead||v.burn>0)continue;const dx=v.x-t.x,dz=v.z-t.z;if(Math.hypot(dx,dz)<2.6&&w.random()<.24+(dx>0?.24:0))ignite(w,v);}
 }
 if(w.terrainDirty){w.grid.rebuild();w.terrainDirty=false;}
}
