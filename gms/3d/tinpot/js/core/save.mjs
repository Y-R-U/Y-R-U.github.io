import {fillSquad,settleRoster,rank} from './roster.mjs';
import {createWorld,snapTo,fortify} from './world.mjs';
import {beginMission} from './mission.mjs';
import {STORY_MAPS} from '../data/maps/story.mjs';
import {MISSIONS,routesFor} from '../data/missions.mjs';
import clearing from '../data/maps/clearing.mjs';
import ravine from '../data/maps/ravine.mjs';
const MAPS={clearing,ravine,...STORY_MAPS};
// `taught` is the coaching ledger: once the player has demonstrated a skill it is never
// explained to him again, in this mission or any later one.
export function newCampaign(){return {version:2,flags:{},choices:[],pendingRoutes:null,mission:0,credits:0,roster:[],slots:[],nextRecruit:0,maps:{},upgrades:{armour:0,rifle:0,slots:1},inProgress:null,history:[],taught:{}};}
export function parseSave(raw){try{const c=typeof raw==='string'?JSON.parse(raw):raw;if(c&&!c.taught)c.taught={};if(c?.version===1){c.version=2;c.flags={};c.choices=[];c.pendingRoutes=null;}if(!c||c.version!==2||!Number.isInteger(c.mission)||c.mission<0||c.mission>MISSIONS.length||!Array.isArray(c.roster)||!Array.isArray(c.slots)||!c.maps||!c.upgrades)return newCampaign();return c;}catch{return newCampaign();}}
export function campaignWorld(c,{resume=true}={}){const savedId=resume&&c.inProgress?.missionId;const base=MISSIONS[Number.isInteger(savedId)?savedId:Math.min(c.mission,MISSIONS.length-1)];const def={...base,waves:base.waves?.map(x=>({...x}))};if(def.id===12&&c.flags?.villagers)def.enemies-=3;if(def.id===18&&c.flags?.backdoor)def.enemies-=3;if(def.id===19&&c.flags?.broadcast)def.waves=def.waves.slice(0,-1);const men=fillSquad(c,def.count),map={...MAPS[def.map],...(def.goal?{goal:def.goal}:{})};const w=createWorld({map,count:def.count,enemies:def.enemies,mix:def.mix,enemyZ:def.enemyZ});const territory=c.maps[def.map];if(territory){for(const id of territory.burned||[]){const t=w.trees[id];if(t){t.dead=true;t.hp=0;t.fallTime=-10;}}if(territory.fortified)fortify(w);w.grid.rebuild();w.forestRevision++;}const kit=['rifle'];if(c.mission>=2&&c.upgrades.slots>=2)kit.push('grenade');if(c.mission>=3&&c.upgrades.slots>=2)kit.push('flamer');w.equipped=kit;w.units.filter(u=>u.team==='blue').forEach((u,i)=>{const man=men[i];u.rosterId=man.id;u.name=rank(man)+' '+man.name;u.veterancy=man.xp;u.hp=u.maxHp=100+c.upgrades.armour*25;u.damageBonus=c.upgrades.rifle*.15;const p=snapTo(w.grid,u.x,def.spawnZ??map.spawn.z+Math.floor(i/2)*1.6);u.x=p.x;u.z=p.z;});beginMission(w,def);
 if(resume&&c.inProgress?.missionId===def.id){const s=c.inProgress;if(s.cover)for(const c of s.cover)Object.assign(w.cover.find(p=>p.id===c.id)||{},c);w.units=s.units;w.time=s.time;w.fireClock=s.fireClock||0;w.target=s.target||null;w.mission=s.mission;w.grenades=s.grenades;w.projectiles=s.projectiles;w.random.setState(s.randomState);for(const t of s.trees)Object.assign(w.trees[t.id],t);w.grid.rebuild();w.forestRevision++;w.fortified=s.fortified;if(s.works)w.works=s.works;w.fires=s.fires||[];w.armed=s.armed||null;w.split=s.split||0;w.eventId=s.eventId||0;w.fieldWait=s.fieldWait||0;w.depotUsed=!!s.depotUsed;for(const u of w.units)if(u.hp<=0)w.events.push({id:++w.eventId,time:w.time,type:'death',x:u.x,z:u.z,unit:u.id});}
 return w;}
// Instant retry. A mission is ninety seconds and the men are permanent, so a loss has to cost a
// tap rather than a funeral — but only back to the state you deployed in. Everything a lost
// mission changed (dead men, spent credits, burn scars, the mission counter) is rolled back
// together, or retrying becomes a way to farm brass off your own casualties.
export function markDeployment(c,w=null){c.rewind={field:w?snapshotWorld(w):null,flags:{...c.flags},choices:structuredClone(c.choices||[]),pendingRoutes:structuredClone(c.pendingRoutes),historyLength:c.history.length,mission:c.mission,credits:c.credits,nextRecruit:c.nextRecruit,slots:[...c.slots],roster:structuredClone(c.roster),upgrades:{...c.upgrades},maps:structuredClone(c.maps)};return c;}
export const canRetry=c=>!!c.rewind;
export function rewind(c){const r=c.rewind;if(!r)return false;c.mission=r.mission;c.credits=r.credits;c.nextRecruit=r.nextRecruit;c.slots=[...r.slots];c.roster=structuredClone(r.roster);c.upgrades={...r.upgrades};c.maps=structuredClone(r.maps);c.inProgress=r.field?structuredClone(r.field):null;c.flags={...r.flags};c.choices=structuredClone(r.choices||[]);c.pendingRoutes=structuredClone(r.pendingRoutes||null);c.history=c.history.slice(0,r.historyLength??Math.max(0,c.history.length-1));return true;}
export function snapshotWorld(w){return {missionId:w.mission.id,time:w.time,fireClock:w.fireClock||0,target:w.target,mission:structuredClone(w.mission),units:structuredClone(w.units),cover:structuredClone(w.cover),trees:w.trees.filter(t=>t.dead||t.burn>0||t.charred).map(t=>({...t})),grenades:structuredClone(w.grenades),projectiles:structuredClone(w.projectiles),randomState:w.random.getState(),fortified:!!w.fortified,works:structuredClone(w.works||null),fires:structuredClone(w.fires||[]),armed:w.armed?{...w.armed}:null,split:w.split||0,eventId:w.eventId,fieldWait:w.fieldWait||0,depotUsed:!!w.depotUsed};}
export function finishMission(c,w){if(w.mission.settled)return c.history.at(-1);w.mission.settled=true;settleRoster(c,w);const win=w.mission.status==='victory';c.maps[w.map.id]={burned:w.trees.filter(t=>t.dead).map(t=>t.id),fortified:win||!!w.fortified};const result={id:w.mission.id,title:w.mission.title,win,kills:w.units.filter(u=>u.team==='red'&&u.hp<=0).length,losses:w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp<=0).length,seconds:Math.ceil(w.mission.elapsed),reward:win?w.mission.reward:0,reason:w.mission.reason};c.history.push(result);if(win){c.credits+=result.reward;c.mission=w.mission.ending?MISSIONS.length:(w.mission.next??w.mission.routes?.[0].to??w.mission.id+1);c.pendingRoutes=w.mission.field&&!w.mission.ending?routesFor(w.mission):null;}c.inProgress=null;return result;}

// Route selection is explicit and validated: a reload at a crossroads cannot choose for you.
export function chooseRoute(c,id){const route=c.pendingRoutes?.find(r=>r.to===id);if(!route)return false;
 c.mission=id;c.flags||={};c.choices||=[];if(route.flag){c.flags[route.flag]=true;c.choices.push({at:c.history.at(-1)?.id,to:id,label:route.label});}c.pendingRoutes=null;c.inProgress=null;return true;}
// Reuse the actual field on a shared territory: no heal, reposition or regrowing forest.
export function continueWorld(c,previous){
 const next=campaignWorld(c,{resume:false});
 if(previous.map.id!==next.map.id)return next;
 const soldiers=next.units.filter(u=>u.team==='blue'&&!u.escort).map(u=>{
  const old=previous.units.find(v=>v.rosterId===u.rosterId&&v.team==='blue'&&!v.escort&&v.hp>0);
  return old?{...u,x:old.x,z:old.z,hp:Math.min(old.hp,u.maxHp),weapon:next.equipped.includes(old.weapon)?old.weapon:'rifle',active:old.active,path:[]}:u;
 });
 if(!soldiers.some(u=>u.active)&&soldiers.length)soldiers[0].active=true;
 const escort=next.units.find(u=>u.escort);if(escort&&soldiers[0]){escort.x=soldiers[0].x;escort.z=soldiers[0].z+1;}
 previous.map=next.map;previous.units=[...soldiers,...next.units.filter(u=>u.team==='red'||u.escort)];previous.mission=next.mission;previous.equipped=next.equipped;
 previous.grenades=[];previous.projectiles=[];previous.armed=null;previous.target=null;previous.fieldWait=0;previous.depotUsed=false;return previous;
}
export function atDepot(w){const d=w.map.depot;if(!d||!w.mission?.field)return false;
 const crew=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0);
 return crew.some(u=>Math.hypot(u.x-d.x,u.z-d.z)<3)&&!w.units.some(u=>u.team==='red'&&u.hp>0&&crew.some(v=>Math.hypot(u.x-v.x,u.z-v.z)<13))&&!w.grenades.length&&!w.projectiles.length&&!w.armed&&!crew.some(u=>u.onFire>0);
}
export function resupply(c,w){if(!atDepot(w))return false;
 // One free field dressing per objective. Reopening the shop never farms health.
 for(const u of w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0)){
  const max=100+c.upgrades.armour*25;u.hp=Math.min(max,u.hp+Math.max(0,max-u.maxHp)+(w.depotUsed?0:35));u.maxHp=max;u.damageBonus=c.upgrades.rifle*.15;
 }w.depotUsed=true;w.equipped=['rifle'];if(c.upgrades.slots>=2)w.equipped.push('grenade','flamer');return true;
}
