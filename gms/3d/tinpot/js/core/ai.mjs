import {lineClear} from './combat.mjs';
// An enemy that stopped to fire whenever the enemy was within 9 m would happily stand behind a
// boulder with no line of sight for the whole mission, and neither side could ever resolve it.
// No shot, no stopping.
export function updateAI(w,dt){for(const u of w.units){if(u.team!=='red'||u.hp<=0)continue;u.think=(u.think||0)-dt;if(u.think>0)continue;u.think=.6;const targets=w.units.filter(v=>v.team==='blue'&&v.hp>0).sort((a,b)=>Math.hypot(a.x-u.x,a.z-u.z)-Math.hypot(b.x-u.x,b.z-u.z));const target=targets[0];if(!target)continue;const distance=Math.hypot(target.x-u.x,target.z-u.z);if(distance<19||u.alerted){u.alerted=true;const clear=lineClear(w,u,target);u.ai=distance<9&&clear?'fire':'advance';u.path=distance<8&&clear?[]:w.grid.route(u,target.x,target.z);}else{u.ai='patrol';if(!u.path.length)u.path=w.grid.route(u,u.x+(w.random()-.5)*4,u.z+(w.random()-.5)*3);}}}
