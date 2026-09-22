import {lineClear} from './combat.mjs';
// An enemy that stopped to fire whenever the enemy was within 9 m would happily stand behind a
// boulder with no line of sight for the whole mission, and neither side could ever resolve it.
// No shot, no stopping.
//
// Fire: the AI routes with `w.fireMask` as a wall. If the only way to you is through flames it
// waits for the fire to burn out instead of walking in — otherwise a firestorm reads as a bug
// rather than as a joke. A man who is actually alight stops thinking and runs (see forestSim).
export function safeRoute(w,u,x,z,allowFire=false){const safe=w.grid.route(u,x,z,w.fireMask);if(safe.length)return safe;if(!w.fireMaskHot)return w.grid.route(u,x,z);return allowFire?w.grid.route(u,x,z):[];}
export function updateAI(w,dt){for(const u of w.units){if(u.team!=='red'||u.hp<=0)continue;
 if(u.panicking>w.time){u.ai='panic';continue;}
 // Parked by the mission's holdLine (see mission.mjs). He still shoots anything that walks into
 // his range — he simply will not come and find you until you have crossed the line.
 if(u.holds){u.ai='holds';u.path=[];u.think=.6;continue;}
 u.think=(u.think||0)-dt;if(u.think>0)continue;u.think=.6;
 const targets=w.units.filter(v=>v.team==='blue'&&v.hp>0).sort((a,b)=>Math.hypot(a.x-u.x,a.z-u.z)-Math.hypot(b.x-u.x,b.z-u.z));const target=targets[0];if(!target)continue;
 const distance=Math.hypot(target.x-u.x,target.z-u.z),sight=u.kind==='rusher'?26:u.kind==='heavy'?21:19,hold=u.kind==='rusher'?1.4:u.kind==='heavy'?10:8,stop=hold+1;
 if(distance<sight||u.alerted){u.alerted=true;const clear=lineClear(w,u,target);
  u.ai=distance<stop&&clear?'fire':'advance';
  if(distance<hold&&clear){u.path=[];continue;}
  // The rusher does not brake. He commits to a point past you and works it out afterwards.
  if(u.kind==='rusher'&&distance<7){const over=1+1.9;const tx=target.x+(target.x-u.x)/distance*over,tz=target.z+(target.z-u.z)/distance*over;const lunge=safeRoute(w,u,tx,tz);u.path=lunge.length?lunge:safeRoute(w,u,target.x,target.z);u.ai='lunge';continue;}
  // Sandbags are a firing position for whoever reaches them. If he cannot see you and there
  // are bags within seven metres he goes to them rather than standing in the open being shot.
  if(!clear&&w.works){const near=w.works.filter(k=>!k.dead&&!k.open).map(k=>({k,d:Math.hypot(k.x-u.x,k.z-u.z)})).filter(o=>o.d<7&&o.d>1.3).sort((a,b)=>a.d-b.d)[0];
   if(near){const hug=safeRoute(w,u,near.k.x+(u.x-near.k.x)/near.d*1.1,near.k.z+(u.z-near.k.z)/near.d*1.1);if(hug.length){u.path=hug;u.ai='cover';continue;}}}
  const path=safeRoute(w,u,target.x,target.z);
  if(!path.length&&w.fireMaskHot){u.path=[];u.ai='waits';continue;}
  u.path=path;
 }else{u.ai='patrol';if(!u.path.length)u.path=safeRoute(w,u,u.x+(w.random()-.5)*4,u.z+(w.random()-.5)*3);}}}
