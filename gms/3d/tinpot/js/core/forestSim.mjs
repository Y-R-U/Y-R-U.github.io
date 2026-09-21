import {emit,damage} from './combat.mjs';
// Fire is a weapon system, not decoration. Everything that burns hurts whatever is standing in
// it — yours, theirs, the tea inspector. Intensity falls off with distance and with how much
// burn a tree has left, so charred-but-out ground is safe and a fresh blaze is not.
export const FIRE={dps:27,selfDps:10,linger:2.8,panic:.14,spread:.5};
export const fireRadius=t=>(t.radius||1)*.85+1.35;
// A tree burns once. Without `charred` a trunk that survives its own fire can be relit by the
// ground fire it just made, and the wood never stops burning.
export function ignite(w,t){if(t.dead||t.burn>0||t.charred)return;t.burn=5+w.random()*4;t.heat=0;w.forestRevision++;}
export function fell(w,t){if(t.dead)return;t.dead=true;t.hp=0;t.fallTime=w.time;w.forestRevision++;w.terrainDirty=true;emit(w,{type:'tree',x:t.x,z:t.z});}
export function groundFire(w,x,z,r=1.7,life=4.2,strength=1){const fires=w.fires||(w.fires=[]);if(fires.length>90)return;for(const f of fires)if(Math.hypot(f.x-x,f.z-z)<r*.55){f.life=Math.max(f.life,life);f.strength=Math.max(f.strength,strength);return;}fires.push({id:++w.eventId,x,z,r,life,max:life,strength});}
export function buckets(w){if(!w.treeBuckets){w.treeBuckets=new Map();for(const v of w.trees){const key=Math.floor(v.x/4)+','+Math.floor(v.z/4);if(!w.treeBuckets.has(key))w.treeBuckets.set(key,[]);w.treeBuckets.get(key).push(v);}}return w.treeBuckets;}
export function igniteAround(w,x,z,radius,chance=1){const b=buckets(w),bx=Math.floor(x/4),bz=Math.floor(z/4);for(let i=bx-1;i<=bx+1;i++)for(let j=bz-1;j<=bz+1;j++)for(const v of b.get(i+','+j)||[]){if(v.dead||v.burn>0)continue;if(Math.hypot(v.x-x,v.z-z)<radius&&w.random()<chance)ignite(w,v);}}
export function blastTrees(w,x,z,radius){for(const k of w.works||[]){if(k.dead)continue;const d=Math.hypot(k.x-x,k.z-z);if(d<radius+.5){k.hp-=150*(1-d/(radius+.5));if(k.hp<=0)k.dead=true;}}for(const c of w.cover||[]){if(c.dead)continue;const d=Math.hypot(c.x-x,c.z-z);if(d<radius+1){c.hp-=140*(1-d/(radius+1));if(c.hp<=0){c.dead=true;w.terrainDirty=true;w.forestRevision++;}}}for(const t of w.trees){const d=Math.hypot(t.x-x,t.z-z);if(d>radius+1||t.dead)continue;ignite(w,t);t.hp-=Math.max(0,140*(1-d/(radius+1)));if(t.hp<=0)fell(w,t);}}
// How fiercely a point is burning, 0..1.35. Read from the cached burning list so this stays
// cheap enough to ask once per unit per fire tick.
export function fireIntensityAt(w,x,z){let f=0;
 for(const t of w.burning||[]){const r=fireRadius(t),d=Math.hypot(t.x-x,t.z-z);if(d>=r)continue;const v=Math.min(1,t.burn/3)*(1-d/r);if(v>f)f=v;}
 for(const g of w.fires||[]){const d=Math.hypot(g.x-x,g.z-z);if(d>=g.r)continue;const v=g.strength*Math.min(1,g.life/1.2)*(1-d/g.r*.7);if(v>f)f=v;}
 return Math.min(1.35,f);}
// A route planner reads this, so it is deliberately one cell fatter than the damage field: the
// AI keeps a respectful distance instead of singeing its eyebrows on the way past.
export function rebuildFireMask(w){const g=w.grid,n=g.blocked.length;if(!w.fireMask||w.fireMask.length!==n)w.fireMask=new Uint8Array(n);const m=w.fireMask;m.fill(0);
 const mark=(x,z,r)=>{for(let zz=Math.floor(z-r);zz<=Math.ceil(z+r);zz++)for(let xx=Math.floor(x-r);xx<=Math.ceil(x+r);xx++){const i=g.index(xx,zz);if(i<0)continue;const p=g.point(i);if(Math.hypot(p.x-x,p.z-z)<=r)m[i]=1;}};
 let hot=0;for(const t of w.burning||[]){mark(t.x,t.z,fireRadius(t)+.9);hot++;}for(const f of w.fires||[]){mark(f.x,f.z,f.r+.9);hot++;}
 w.fireMaskHot=hot>0;return m;}
// The way out: the nearest walkable cell that is not on fire, and a route to it.
export function escapeRoute(w,u){const g=w.grid;
 // A man whose own cell has been blocked — a tree fell on it, cover collapsed round him — can
 // never route out of one (D18). Fire is exactly when that happens, so he gets one step to the
 // nearest open cell first. One cell, on foot: not a teleport, and the D18 bug stays visible.
 let from=u,lead=null;const here=g.index(u.x,u.z);
 if(here<0||g.blocked[here]){const n=g.nearest(u.x,u.z);if(n<0)return null;lead=g.point(n);from=lead;}
 for(const r of [3.2,5.4,8]){let best=null,bestScore=-1;for(let a=0;a<12;a++){const ang=a/12*Math.PI*2+(u.id%7)*.21,x=from.x+Math.cos(ang)*r,z=from.z+Math.sin(ang)*r,i=g.index(x,z);if(i<0||g.blocked[i])continue;const p=g.point(i);if(fireIntensityAt(w,p.x,p.z)>.02)continue;const score=1/(1+Math.hypot(p.x-from.x,p.z-from.z));if(score>bestScore){bestScore=score;best=p;}}
  if(best){const path=g.route(from,best.x,best.z);if(path.length||lead)return lead?[lead,...path]:path;}}
 return lead?[lead]:null;}
const ahead=(w,u)=>{if(!u.path.length)return 1;const p=u.path[Math.min(u.path.length-1,3)],q=u.path[u.path.length-1];return Math.max(fireIntensityAt(w,p.x,p.z),fireIntensityAt(w,q.x,q.z));};
function burnUnits(w,dt){for(const u of w.units){
 if(u.hp<=0){u.onFire=0;u.inFire=0;continue;}
 const f=fireIntensityAt(w,u.x,u.z);u.inFire=f;
 if(f>.05){u.onFire=Math.max(u.onFire||0,FIRE.linger*Math.min(1,f*1.7));damage(w,u,FIRE.dps*f*dt,null,'fire');}
 if(u.onFire>0){u.onFire=Math.max(0,u.onFire-dt);damage(w,u,FIRE.selfDps*dt,null,'fire');
  if(!u.alight){u.alight=true;emit(w,{type:'alight',x:u.x,z:u.z,unit:u.id,team:u.team});}
  // A man on fire is a fire. He will take the treeline with him if you let him run into it.
  if(w.random()<FIRE.spread*dt)igniteAround(w,u.x,u.z,1.9,.7);
 }else if(u.alight){u.alight=false;emit(w,{type:'doused',x:u.x,z:u.z,unit:u.id});}
 if(u.hp<=0)continue;
 // Panic only if standing in it AND not already running somewhere cooler. A man marching out
 // of a fire is already doing the right thing; interrupting him makes him oscillate.
 if((f>FIRE.panic||u.onFire>0)&&(u.panicUntil||0)<=w.time&&ahead(w,u)>.05){u.panicUntil=w.time+.7;const esc=escapeRoute(w,u);if(esc){u.path=esc;u.panicking=w.time+1.4;if(!u.panicked){u.panicked=true;emit(w,{type:'panic',x:u.x,z:u.z,unit:u.id});}}}
 if(u.onFire<=0&&f<=.05)u.panicked=false;
}}
export function stepForest(w,dt){
 w.fireClock=(w.fireClock||0)+dt;if(w.fireClock<.25)return;const elapsed=w.fireClock;w.fireClock=0;const burning=w.trees.filter(t=>t.burn>0);
 for(const t of burning){t.burn=Math.max(0,t.burn-elapsed);t.hp-=elapsed*32;if(t.hp<=0){if(!t.dead)groundFire(w,t.x,t.z,(t.radius||1)*.8+.9,2.6+w.random()*2.2,.85);fell(w,t);}if(t.burn===0){t.charred=true;w.forestRevision++;continue;}t.heat=(t.heat||0)+elapsed;if(t.heat<1.25)continue;t.heat=0;
 // Sparse neighbourhood buckets are built once from stable map coordinates.
 const b=buckets(w);
 const bx=Math.floor(t.x/4),bz=Math.floor(t.z/4);for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const v of b.get(x+','+z)||[]){if(v.dead||v.burn>0)continue;const dx=v.x-t.x,dz=v.z-t.z;if(Math.hypot(dx,dz)<2.6&&w.random()<.24+(dx>0?.24:0))ignite(w,v);}
 }
 w.burning=w.trees.filter(t=>t.burn>0);
 if(w.fires&&w.fires.length){for(const g of w.fires){g.life-=elapsed;if(g.life>0&&w.random()<.09)igniteAround(w,g.x,g.z,g.r*.85,.3);}w.fires=w.fires.filter(g=>g.life>0);}
 rebuildFireMask(w);
 burnUnits(w,elapsed);
 if(w.terrainDirty){w.grid.rebuild();w.terrainDirty=false;}
}
