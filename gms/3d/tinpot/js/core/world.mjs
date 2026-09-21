import {stepMission} from './mission.mjs';
import {rng} from './rng.mjs';
import {updateAI} from './ai.mjs';
import {stepForest} from './forestSim.mjs';
import {combat,throwGrenade,stepGrenades} from './combat.mjs';
import {treeLayout,createGrid} from './grid.mjs';
import {createUnit,moveUnit} from './units.mjs';
import clearing from '../data/maps/clearing.mjs';
import {centre} from './landscape.mjs';
export const STEP=1/60;
// Deployments are snapped to a walkable cell and the enemy line is laid out relative to the
// corridor's centre, not to x=0. Hard-coded spawns used to land inside the treeline once the
// corridor started bending properly: a unit standing in a blocked cell can never route out of
// it, so three enemies sat in the trees for the whole of mission 4 and the clear objective
// could not be met.
export const snapTo=(grid,x,z)=>{const i=grid.nearest(x,z);return i<0?{x,z}:grid.point(i);};
export function createWorld({map=clearing,count=1,enemies=0}={}){const trees=treeLayout(map),cover=(map.cover||[]).map(p=>({...p})),grid=createGrid(map,trees,cover);const units=Array.from({length:count},(_,i)=>{const p=snapTo(grid,map.spawn.x+(i%2)*1.5,map.spawn.z+Math.floor(i/2)*1.5);return createUnit(i,p.x,p.z,'blue',['Pvt. Crumb','Pvt. Spud','Pvt. Peas','Pvt. Titch'][i]);});for(let i=0;i<enemies;i++){const z=-8-Math.floor(i/3)*5,p=snapTo(grid,centre(z,map)+(i%3-1)*3,z);const u=createUnit(100+i,p.x,p.z,'red','Pvt. Other');u.hp=u.maxHp=65;u.speed=2.5;units.push(u);}return {map,trees,cover,grid,units,equipped:['rifle'],grenades:[],forestRevision:0,time:0,events:[],eventId:0,projectiles:[],random:rng(map.seed+20),target:null};}
export function orderMove(w,x,z){w.target={x,z};const active=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.active&&u.hp>0);active.forEach((u,i)=>{const offset=active.length>1?(i%2-.5)*1.6:0;u.path=w.grid.route(u,x+offset,z+Math.floor(i/2)*1.6);});}
export function tick(w,dt=STEP){if(w.mission&&w.mission.status!=='active')return;w.time+=dt;updateAI(w,dt);for(const u of w.units)moveUnit(u,w.grid,dt);combat(w,dt);stepGrenades(w,dt);stepForest(w,dt);stepMission(w,dt);}
export function toggleUnit(w,id){const u=w.units.find(u=>u.id===id&&u.team==='blue'&&u.hp>0);if(!u)return;if(u.active&&w.units.filter(v=>v.team==='blue'&&v.hp>0&&v.active).length===1)return;u.active=!u.active;if(!u.active)u.path=[];}
export function setWeapon(w,weapon,id=null){if(!w.equipped.includes(weapon))return;for(const u of w.units)if(u.team==='blue'&&!u.escort&&(id===null||id===u.id))u.weapon=weapon;}

export function groundOrder(w,x,z){const grenadiers=w.units.filter(u=>u.team==='blue'&&u.hp>0&&u.active&&u.weapon==='grenade');if(grenadiers.length){for(const u of grenadiers)if(u.cooldown<=0)throwGrenade(w,u,x,z);w.target={x,z};return;}orderMove(w,x,z);}
