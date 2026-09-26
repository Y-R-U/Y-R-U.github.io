import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {newCampaign,campaignWorld,continueWorld,finishMission,chooseRoute,markDeployment,rewind,snapshotWorld,parseSave,resupply,atDepot} from '../js/core/save.mjs';
import {MISSIONS,endingFor} from '../js/data/missions.mjs';
import {orderMove,tick} from '../js/core/world.mjs';
import {createChatter} from '../js/core/chatter.mjs';
import {rng} from '../js/core/rng.mjs';
function pilot(w){const squad=w.units.filter(u=>u.team==='blue'&&u.hp>0&&!u.escort),lead=squad[0];if(!lead)return;const m=w.mission;
 if(m.type==='clear'){const enemy=w.units.filter(u=>u.team==='red'&&u.hp>0).sort((a,b)=>Math.hypot(a.x-lead.x,a.z-lead.z)-Math.hypot(b.x-lead.x,b.z-lead.z))[0];if(enemy)orderMove(w,enemy.x,enemy.z+5);}
 if(m.type==='reach')orderMove(w,w.map.goal.x,w.map.goal.z);
 if(m.type==='escort'){const e=w.units.find(u=>u.escort);if(Math.hypot(lead.x-e.x,lead.z-e.z)>5)orderMove(w,e.x,e.z-2);else orderMove(w,w.map.goal.x,Math.max(w.map.goal.z,e.z-4));}}
const report={routes:[],checks:[]};const check=(label,fn)=>{fn();report.checks.push(label);console.log('PASS',label);};
for(const first of [8,10])for(const second of [14,16]){
 const c=newCampaign();c.mission=6;c.credits=100;c.upgrades={armour:1,rifle:1,slots:2};c.taught={move:true,split:true,grenade:true};let w=campaignWorld(c),results=[];
 for(let limit=0;limit<22;limit++){
  markDeployment(c,w);
  for(let i=0;i<w.mission.limit*60&&w.mission.status==='active';i++){if(i%60===0)pilot(w);tick(w);}
  const r=finishMission(c,w);results.push(r);assert.equal(r.win,true,JSON.stringify({first,second,result:r,crew:w.units.filter(u=>u.team==='blue').map(u=>({hp:u.hp,x:u.x,z:u.z}))}));
  if(c.mission===MISSIONS.length)break;
  const destination=c.pendingRoutes.length>1?(w.mission.id===7?first:second):c.pendingRoutes[0].to;
  assert.ok(chooseRoute(c,destination));w=continueWorld(c,w);
 }
 assert.equal(c.mission,MISSIONS.length);assert.equal(c.choices.length,2);assert.equal(results.length,14);report.routes.push({first,second,results,ending:endingFor(c)});console.log('PASS complete route',first,second,results.map(r=>r.id));
}
check('version-1 completed slice migrates into new story without losing roster',()=>{const c=newCampaign();c.version=1;c.mission=6;c.credits=231;const parsed=parseSave(JSON.stringify(c));assert.equal(parsed.version,2);assert.equal(parsed.mission,6);assert.equal(parsed.credits,231);assert.equal(campaignWorld(parsed).mission.id,6);});
check('crossroads survive reload without selecting a route or duplicating reward',()=>{const c=newCampaign();c.mission=7;const w=campaignWorld(c);w.mission.status='victory';finishMission(c,w);const brass=c.credits;finishMission(c,w);assert.equal(c.credits,brass);w.mission.status='intermission';c.inProgress=snapshotWorld(w);const restored=parseSave(JSON.stringify(c)),world=campaignWorld(restored);assert.equal(world.mission.id,7);assert.equal(world.mission.status,'intermission');assert.equal(restored.pendingRoutes.length,2);assert.equal(chooseRoute(restored,23),false);assert.equal(chooseRoute(restored,10),true);assert.ok(restored.flags.ledger);});
check('same territory keeps actual positions, wounds, forest and checkpoint on retry',()=>{const c=newCampaign();c.mission=6;const w=campaignWorld(c);const u=w.units[0];u.hp=61;u.z=2;w.trees[0].dead=true;w.mission.status='victory';finishMission(c,w);chooseRoute(c,7);const next=continueWorld(c,w);assert.equal(next,w);assert.equal(next.units[0].hp,61);assert.equal(next.units[0].z,2);assert.equal(next.trees[0].dead,true);markDeployment(c,next);next.units[0].hp=0;next.mission.status='defeat';finishMission(c,next);rewind(c);const back=campaignWorld(c);assert.equal(back.units[0].hp,61);assert.equal(back.units[0].z,2);assert.equal(back.trees[0].dead,true);assert.equal(c.history.length,1);});
check('depot refuses distant/enemy visits and heals only once per objective',()=>{const c=newCampaign();c.mission=6;const w=campaignWorld(c);assert.equal(atDepot(w),false);w.units=w.units.filter(u=>u.team==='blue');for(const u of w.units){u.x=0;u.z=5;u.hp=20;}assert.equal(resupply(c,w),true);assert.equal(w.units[0].hp,55);resupply(c,w);assert.equal(w.units[0].hp,55);});
check('branch decisions alter actual garrisons and reinforcement schedules',()=>{const c=newCampaign();c.mission=12;const before=campaignWorld(c).units.length;c.flags.villagers=true;assert.equal(campaignWorld(c).units.length,before-3);c.mission=18;const count=campaignWorld(c).units.length;c.flags.backdoor=true;assert.equal(campaignWorld(c).units.length,count-3);c.mission=19;c.flags.broadcast=true;assert.equal(campaignWorld(c).mission.waves.length,2);});
const clips=JSON.parse(await readFile(new URL('../audio/voices/manifest.json',import.meta.url))).clips;
function weighted(factory){const d=factory(clips,rng(111)),w={units:[{id:0,rosterId:0,hp:100,team:'blue',active:true}]};let plain=0;const ids=new Set();for(let i=0;i<1000;i++){const t=i*60;assert.ok(d.offer('move',w,t,{unit:0}));const q=d.take(w,t);if(q.clip.event==='ack')plain++;ids.add(q.clip.id);}assert.ok(plain>760&&plain<840,'80/20 weight: '+plain);assert.equal(ids.size,9);return plain;}
check('80 percent plain replies with all nine movement takes reachable',()=>{report.plainPer1000=weighted(createChatter);});
const source=await readFile(new URL('../js/core/chatter.mjs',import.meta.url),'utf8');const broken=source.replace('random()<.8','random()<.2');assert.notEqual(broken,source);const mutant=await import('data:text/javascript;base64,'+Buffer.from(broken).toString('base64'));assert.throws(()=>weighted(mutant.createChatter));console.log('REJECTED MUTANT reversed 80/20 weight');
check('hold responses never say going now',()=>{const d=createChatter(clips,rng(22)),w={units:[{id:0,rosterId:0,hp:100,team:'blue',active:false}]};for(let i=0;i<100;i++){d.offer('hold',w,i*60,{unit:0});assert.notEqual(d.take(w,i*60).clip.moveOnly,true);}});
await writeFile(new URL('../docs/evidence/story-unit.json',import.meta.url),JSON.stringify(report,null,2));
