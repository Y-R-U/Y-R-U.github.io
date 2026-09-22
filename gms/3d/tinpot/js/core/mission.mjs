import {createUnit,applyKind} from './units.mjs';
import {pickKind} from '../data/soldiers.mjs';
import {centre} from './landscape.mjs';
// `holdLine` (missions 1 and 2 only) parks the enemies already on the map until the player has
// walked far enough forward to have obviously worked out that tapping moves you. It is a trigger
// on his progress, never a timer, and it never applies to wave reinforcements — a hold mission
// still has to be held.
export function beginMission(w,definition){w.mission={...definition,status:'active',wave:0,elapsed:0};
 if(definition.holdLine!==undefined)for(const u of w.units)if(u.team==='red')u.holds=true;if(definition.type==='escort'){const e=w.grid.point(w.grid.nearest(0,12));const u=createUnit(90,e.x,e.z,'blue','Inspector Biscuit');u.escort=true;u.active=false;u.hp=u.maxHp=120;u.speed=2.4;u.weapon=null;w.units.push(u);}return w;}
export function stepMission(w,dt){const m=w.mission;if(!m||m.status!=='active')return;m.elapsed+=dt;const soldiers=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0);if(!soldiers.length){m.status='defeat';m.reason='The paperwork has outlived the platoon.';return;}
 if(m.holdLine!==undefined&&soldiers.some(u=>u.z<=m.holdLine))for(const u of w.units)if(u.holds){u.holds=false;u.alerted=true;}
 while(m.wave<(m.waves||[]).length&&m.elapsed>=m.waves[m.wave].at){const wave=m.waves[m.wave++];for(let i=0;i<wave.count;i++){const rz=-19-i%2*2,p=w.grid.point(w.grid.nearest(centre(rz,w.map)+(i%3-1)*2.5,rz));const u=createUnit(1000+m.wave*20+i,p.x,p.z,'red');applyKind(u,pickKind(wave.mix||m.mix,i));u.alerted=true;w.units.push(u);}}
 const goal=w.map.goal;
 if(m.type==='escort'){const escort=w.units.find(u=>u.escort);if(escort.hp<=0){m.status='defeat';m.reason='The tea inspector has inspected his last tea.';return;}const leader=soldiers.slice().sort((a,b)=>Math.hypot(a.x-escort.x,a.z-escort.z)-Math.hypot(b.x-escort.x,b.z-escort.z))[0];if(Math.hypot(leader.x-escort.x,leader.z-escort.z)<8&&Math.hypot(leader.x-escort.x,leader.z-escort.z)>1.3&&!escort.path.length){const safe=w.grid.route(escort,leader.x,leader.z,w.fireMask);escort.path=safe.length?safe:w.grid.route(escort,leader.x,leader.z);}if(Math.hypot(escort.x-goal.x,escort.z-goal.z)<3)m.status='victory';}
 if(m.type==='clear'&&!w.units.some(u=>u.team==='red'&&u.hp>0)&&m.wave===(m.waves||[]).length)m.status='victory';
 if(m.type==='reach'&&soldiers.some(u=>Math.hypot(u.x-goal.x,u.z-goal.z)<3))m.status='victory';
 if(m.type==='hold'&&m.elapsed>=m.duration)m.status='victory';
 if(m.elapsed>=m.limit&&m.status==='active'){m.status='defeat';m.reason='The general grew bored. A tactical catastrophe.';}
}
