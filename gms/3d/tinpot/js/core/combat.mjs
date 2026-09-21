import {blastTrees,groundFire,igniteAround} from './forestSim.mjs';
import {WEAPONS} from '../data/weapons.mjs';
// A man within HUG metres of a sandbag shoots straight over it; anyone further away does not.
export const HUG=1.6;
export function emit(w,event){w.events.push({id:++w.eventId,time:w.time,...event});if(w.events.length>600)w.events.splice(0,100);}
export function damage(w,u,amount,source,cause='shot'){if(u.hp<=0||amount<=0)return;if(u.armour&&cause!=='fire'&&cause!=='flame')amount*=1-u.armour;u.hp=Math.max(0,u.hp-amount);u.hurt=w.time;u.hurtFrom=source?{x:source.x,z:source.z}:null;u.lastCause=cause;if(cause!=='fire'&&amount>=3&&u.hp>0)emit(w,{type:'hit',x:u.x,z:u.z,unit:u.id,team:u.team,amount,cause});if(!u.hp){u.state='dead';u.path=[];if(u.team==='blue'&&u.active&&!w.units.some(v=>v.team==='blue'&&!v.escort&&v.hp>0&&v.active)){const next=w.units.find(v=>v.team==='blue'&&!v.escort&&v.hp>0);if(next)next.active=true;}u.deathTime=w.time;const tank=WEAPONS[u.weapon]?.tank;if(tank)w.grenades.push({id:++w.eventId,source:u.id,x:u.x,z:u.z,tx:u.x,tz:u.z,born:w.time,life:.45,radius:tank.radius,damage:tank.damage,tank:true});if(source)source.kills++;emit(w,{type:'death',x:u.x,z:u.z,unit:u.id,team:u.team,escort:!!u.escort,cause,name:u.name,kills:u.kills,kind:u.kind||'grunt'});}}
export function combat(w,dt){
 for(const u of w.units){if(u.hp<=0)continue;u.cooldown=Math.max(0,u.cooldown-dt);const weapon=WEAPONS[u.weapon];if(!weapon)continue;const range=weapon.range*(u.team==='red'?.8:1);let target=null,nearest=range;
 for(const v of w.units){if(v.team===u.team||v.hp<=0)continue;const d=Math.hypot(u.x-v.x,u.z-v.z);if(d<nearest&&lineClear(w,u,v)){nearest=d;target=v;}}
 if(!target)continue;u.yaw=Math.atan2(target.x-u.x,target.z-u.z);if(!u.path.length)u.state='engage';if(u.cooldown>0)continue;u.cooldown=weapon.cadence*(u.team==='red'?1.5:1);if(u.weapon==='grenade'){throwGrenade(w,u,target.x,target.z);continue;}if(weapon.cone){spray(w,u,weapon);continue;}const hit=w.random()<Math.min(.95,weapon.accuracy+(u.veterancy||0)*.04)*(u.team==='red'?.55:1);w.projectiles.push({source:u.id,target:target.id,hit,x:u.x,z:u.z,tx:target.x,tz:target.z,life:nearest/weapon.speed,damage:weapon.damage*(1+(u.damageBonus||0))*(u.team==='red'?.65:1)});emit(w,{type:'shot',x:u.x,z:u.z,tx:target.x,tz:target.z,team:u.team});
 }
 for(const p of w.projectiles){p.life-=dt;if(p.life>0)continue;const victim=w.units.find(u=>u.id===p.target),source=w.units.find(u=>u.id===p.source);if(p.hit&&victim)damage(w,victim,p.damage,source);emit(w,{type:'impact',x:p.tx,z:p.tz});}w.projectiles=w.projectiles.filter(p=>p.life>0);
}
export function throwGrenade(w,u,x,z){const weapon=WEAPONS.grenade,d=Math.hypot(x-u.x,z-u.z),ratio=Math.min(1,weapon.range/Math.max(.1,d));const tx=u.x+(x-u.x)*ratio,tz=u.z+(z-u.z)*ratio;w.grenades.push({id:++w.eventId,source:u.id,x:u.x,z:u.z,tx,tz,born:w.time,life:weapon.fuse});u.cooldown=weapon.cadence;emit(w,{type:'lob',x:u.x,z:u.z,tx,tz});}
// A cone of flame: no projectile, no accuracy roll, and it does not care whose side you are on.
// The pool it leaves is what makes it dangerous to its owner — he is four metres from a fire he
// just lit, and the next order the player gives may well walk him into it.
export function spray(w,u,weapon){const ux=Math.sin(u.yaw),uz=Math.cos(u.yaw);
 for(const v of w.units){if(v.hp<=0||v===u)continue;const dx=v.x-u.x,dz=v.z-u.z,d=Math.hypot(dx,dz);if(d>weapon.range||d<.01)continue;
  if(Math.acos(Math.max(-1,Math.min(1,(dx*ux+dz*uz)/d)))>weapon.cone)continue;
  damage(w,v,weapon.damage*(1-d/weapon.range*.45),u,'flame');v.onFire=Math.max(v.onFire||0,1.6);}
 const tx=u.x+ux*weapon.range*.72,tz=u.z+uz*weapon.range*.72;
 groundFire(w,tx,tz,weapon.pool,weapon.poolLife,.9);igniteAround(w,tx,tz,weapon.pool*.8,.28);
 emit(w,{type:'flame',x:u.x,z:u.z,tx,tz,yaw:u.yaw,range:weapon.range,cone:weapon.cone,unit:u.id});}
export function stepGrenades(w,dt){for(const g of w.grenades){g.life-=dt;if(g.life>0)continue;const radius=g.radius||WEAPONS.grenade.radius,blast=g.damage||WEAPONS.grenade.damage;emit(w,{type:'explosion',x:g.tx,z:g.tz,tank:!!g.tank,radius});const source=w.units.find(u=>u.id===g.source);for(const u of w.units){const d=Math.hypot(u.x-g.tx,u.z-g.tz);if(d<radius)damage(w,u,blast*(1-d/radius*.65),g.tank?null:source);}blastTrees(w,g.tx,g.tz,radius);if(g.tank)groundFire(w,g.tx,g.tz,radius*.6,4.5,1);}w.grenades=w.grenades.filter(g=>g.life>0);}
export function lineClear(w,a,b){const d=Math.hypot(a.x-b.x,a.z-b.z);for(let s=.8;s<d;s+=.6){const t=s/d,i=w.grid.index(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);if(i<0||w.grid.blocked[i])return false;}
 for(const k of w.works||[]){if(k.dead||k.open)continue;
  if(Math.hypot(a.x-k.x,a.z-k.z)<=HUG||Math.hypot(b.x-k.x,b.z-k.z)<=HUG)continue;   // hugging your own bags
  const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  const u=len?Math.max(0,Math.min(1,((k.x-a.x)*dx+(k.z-a.z)*dz)/len)):0;
  if(Math.hypot(a.x+dx*u-k.x,a.z+dz*u-k.z)<k.r)return false;}
 return true;}
