import {stepMission} from './mission.mjs';
import {rng} from './rng.mjs';
import {updateAI} from './ai.mjs';
import {stepForest} from './forestSim.mjs';
import {combat,throwGrenade,stepGrenades,emit,revertToRifle} from './combat.mjs';
import {treeLayout,createGrid} from './grid.mjs';
import {createUnit,moveUnit,applyKind} from './units.mjs';
import {pickKind} from '../data/soldiers.mjs';
import clearing from '../data/maps/clearing.mjs';
import {centre} from './landscape.mjs';
export const STEP=1/60;
// Deployments are snapped to a walkable cell and the enemy line is laid out relative to the
// corridor's centre, not to x=0. Hard-coded spawns used to land inside the treeline once the
// corridor started bending properly: a unit standing in a blocked cell can never route out of
// it, so three enemies sat in the trees for the whole of mission 4 and the clear objective
// could not be met.
// The emplacement you left behind. Sandbags are LOW cover: they never block a boot, they block
// a bullet, and a man within `HUG` metres of one shoots straight over it. That asymmetry is the
// whole point of holding ground — the side that owns the bags fires out and cannot be fired at.
export function fortify(w){const cx=centre(-1,w.map);
 w.works=[...Array(9)].map((_,i)=>({id:i,type:'bag',x:cx+(i-4)*1.16,z:-1+(i%2)*.32,r:.7,hp:110,dead:false}));
 w.works.push({id:9,type:'pit',x:cx+3.9,z:3.1,r:1.45,hp:260,dead:false,open:true});
 w.fortified=true;return w;}
export const snapTo=(grid,x,z)=>{const i=grid.nearest(x,z);return i<0?{x,z}:grid.point(i);};
export function createWorld({map=clearing,count=1,enemies=0,mix=null,enemyZ=-8}={}){const trees=treeLayout(map),cover=(map.cover||[]).map(p=>({...p})),grid=createGrid(map,trees,cover);const units=Array.from({length:count},(_,i)=>{const p=snapTo(grid,map.spawn.x+(i%2)*1.5,map.spawn.z+Math.floor(i/2)*1.5);return createUnit(i,p.x,p.z,'blue',['Pvt. Crumb','Pvt. Spud','Pvt. Peas','Pvt. Titch'][i]);});for(let i=0;i<enemies;i++){const z=enemyZ-Math.floor(i/3)*5,p=snapTo(grid,centre(z,map)+(i%3-1)*3,z);const u=createUnit(100+i,p.x,p.z,'red');applyKind(u,pickKind(mix,i));units.push(u);}return {map,trees,cover,grid,units,equipped:['rifle'],grenades:[],forestRevision:0,time:0,events:[],eventId:0,projectiles:[],random:rng(map.seed+20),target:null,armed:null,reachUntil:0,split:0};}
// Your lads route around fire if they can and straight through it if you insist. A man who is
// actually alight finishes running out first and takes his orders afterwards. The AI does
// not get that second option (see ai.mjs) — walking into a firestorm has to be the player's
// idea, or it reads as broken instead of funny.
export function orderMove(w,x,z){w.target={x,z};emit(w,{type:'order',x,z});const active=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.active&&u.hp>0);active.forEach((u,i)=>{if(u.panicking>w.time)return;const offset=active.length>1?(i%2-.5)*1.6:0,tx=x+offset,tz=z+Math.floor(i/2)*1.6;const safe=w.grid.route(u,tx,tz,w.fireMask);u.path=safe.length?safe:w.grid.route(u,tx,tz);});}
export function tick(w,dt=STEP){if(w.mission?.status==='intermission'){w.time+=dt;for(const u of w.units)if(u.team==='blue'&&u.hp>0)moveUnit(u,w.grid,dt);return;}if(w.mission&&w.mission.status!=='active')return;w.time+=dt;updateAI(w,dt);for(const u of w.units)moveUnit(u,w.grid,dt);combat(w,dt);stepArmed(w);stepGrenades(w,dt);stepForest(w,dt);stepMission(w,dt);}
export function toggleUnit(w,id){const u=w.units.find(u=>u.id===id&&u.team==='blue'&&u.hp>0);if(!u)return;if(u.active&&w.units.filter(v=>v.team==='blue'&&v.hp>0&&v.active).length===1)return;u.active=!u.active;if(!u.active){u.path=[];w.split=1;}else if(w.split===1)w.split=2;}
export function setWeapon(w,weapon,id=null){if(!w.equipped.includes(weapon))return;for(const u of w.units)if(u.team==='blue'&&!u.escort&&(id===null||id===u.id))u.weapon=weapon;if(weapon==='grenade')w.reachUntil=w.time+REACH_SECONDS;}


// ---------------------------------------------------------------- the armed grenade
// The first human to play this killed one of his own men with his first grenade, because the
// tap was instant and irreversible and nothing told him he could not walk away from it. So a
// grenade tap now ARMS: a red marker sits on the ground for ARM_SECONDS and then the throw
// happens. The asymmetry is deliberate and is the whole design:
//
//   tap the marker      -> called off.
//   tap anywhere else   -> the squad MARCHES there and the grenade still goes, thrown from
//                          wherever the man is standing when the clock runs out. Walk out of
//                          range and it falls short, visibly, and that is your fault.
//
// Nothing here defuses it. Friendly fire is untouched; only the surprise was the problem.
export const ARM_SECONDS=2.4, CANCEL_RADIUS=2.2, REACH_SECONDS=2.6;
const bombers=w=>w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0&&u.active&&u.weapon==='grenade');
export function stepArmed(w){const a=w.armed;if(!a)return;const crew=bombers(w);
 if(!crew.length){w.armed=null;emit(w,{type:'disarm',x:a.x,z:a.z,reason:'nobody left'});return;}
 if(w.time<a.ready)return;
 // If every thrower is mid-cadence the order waits rather than silently evaporating.
 const ready=crew.filter(u=>u.cooldown<=0&&!(u.panicking>w.time));if(!ready.length)return;
 for(const u of ready){throwGrenade(w,u,a.x,a.z);revertToRifle(w,u);}w.armed=null;}
export function groundOrder(w,x,z){
 if(w.armed){if(Math.hypot(x-w.armed.x,z-w.armed.z)<=CANCEL_RADIUS){emit(w,{type:'disarm',x:w.armed.x,z:w.armed.z});w.armed=null;return 'disarm';}orderMove(w,x,z);return 'move';}
 if(bombers(w).length){w.armed={x,z,at:w.time,ready:w.time+ARM_SECONDS};w.reachUntil=w.time+ARM_SECONDS+.4;emit(w,{type:'arm',x,z});return 'arm';}
 orderMove(w,x,z);return 'move';}
