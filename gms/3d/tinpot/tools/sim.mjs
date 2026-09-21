import {purchase} from '../js/core/economy.mjs';
import {newCampaign} from '../js/core/save.mjs';
import {damage} from '../js/core/combat.mjs';
import {createGrid} from '../js/core/grid.mjs';
import {WEAPONS} from '../js/data/weapons.mjs';
import {throwGrenade} from '../js/core/combat.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createWorld,orderMove,tick,fortify} from '../js/core/world.mjs';
import {lineClear} from '../js/core/combat.mjs';
import {centre} from '../js/core/landscape.mjs';
import {blastTrees} from '../js/core/forestSim.mjs';
import {campaignWorld,finishMission} from '../js/core/save.mjs';
import {createUnit,applyKind} from '../js/core/units.mjs';
import {SOLDIERS} from '../js/data/soldiers.mjs';
import {MISSIONS} from '../js/data/missions.mjs';
import {ignite,fireIntensityAt,groundFire} from '../js/core/forestSim.mjs';
import {updateAI} from '../js/core/ai.mjs';
const report={date:new Date().toISOString(),tests:[]};
const arrived=w=>assert.ok(Math.hypot(w.units[0].x-.5,w.units[0].z+19.5)<.15,'walk did not reach destination');
const w=createWorld();orderMove(w,0,-20);assert.throws(()=>arrived(w),'negative control: unmoving soldier must fail arrival gate');
for(let i=0;i<1800;i++){tick(w);const u=w.units[0];assert.equal(w.grid.blocked[w.grid.index(u.x,u.z)],0,'soldier entered blocked cell');}arrived(w);assert.ok(w.units[0].steps>29);report.tests.push({name:'walks entire corridor without teleporting or entering a blocked cell',distance:w.units[0].steps,position:{x:w.units[0].x,z:w.units[0].z}});
const b=createWorld();orderMove(b,0,-20);for(let i=0;i<1800;i++)tick(b);assert.deepEqual(w.units,b.units);report.tests.push({name:'deterministic fixed-step movement'});
const fight=createWorld({enemies:1});orderMove(fight,0,0);for(let i=0;i<3600;i++)tick(fight);assert.equal(fight.units[1].hp,0);assert.ok(fight.units[0].hp>0);assert.ok(fight.events.some(e=>e.type==='shot'));report.tests.push({name:'autonomous duel, projectile damage and death',survivorHP:fight.units[0].hp,shots:fight.events.filter(e=>e.type==='shot').length});
const burn=createWorld();burn.map={width:16,depth:16};burn.trees=Array.from({length:16},(_,i)=>({id:i,x:i-7.5,z:.5,radius:1,height:3,hp:100,burn:0,dead:false}));burn.grid=createGrid(burn.map,burn.trees);burn.units[0].x=.5;burn.units[0].z=4.5;assert.equal(burn.grid.route(burn.units[0],.5,-4.5).length,0,'negative control: unburned wall is impassable');throwGrenade(burn,burn.units[0],.5,.5);for(let i=0;i<500;i++)tick(burn);assert.ok(burn.trees.some(t=>t.dead));assert.ok(burn.grid.route(burn.units[0],.5,-4.5).length>0,'burn opens a route');orderMove(burn,.5,-4.5);for(let i=0;i<600;i++){tick(burn);assert.equal(burn.grid.blocked[burn.grid.index(burn.units[0].x,burn.units[0].z)],0);}assert.ok(burn.units[0].z<-4);assert.ok(burn.units[0].hp<100,'friendly blast damages own man');report.tests.push({name:'grenade destroys impassable wall; soldier walks through new route; friendly fire',burned:burn.trees.filter(t=>t.dead).length,hp:burn.units[0].hp});
const detour=createWorld();detour.trees=[{id:0,x:.5,z:.5,radius:2,height:3,hp:100,burn:0,dead:false}];detour.grid=createGrid({width:12,depth:12},detour.trees);detour.units[0].x=.5;detour.units[0].z=4.5;assert.equal(detour.grid.blocked[detour.grid.index(.5,.5)],1,'direct route has an obstacle');orderMove(detour,.5,-4.5);for(let i=0;i<600;i++){tick(detour);assert.equal(detour.grid.blocked[detour.grid.index(detour.units[0].x,detour.units[0].z)],0);}assert.ok(detour.units[0].z<-4);assert.ok(detour.units[0].steps>12,'must physically detour around the obstacle');report.tests.push({name:'blocked direct route takes a real detour',distance:detour.units[0].steps});
const squad=createWorld({count:2});squad.units[1].active=false;damage(squad,squad.units[0],1000);assert.equal(squad.units[1].active,true);report.tests.push({name:'last active death hands orders to a living soldier'});
// ---------------------------------------------------------------- fire is a weapon system
// A stand of trees, lit. Everything below measures men against it. Small radii so a soldier can
// legitimately stand beside a tree without being inside its blocked footprint; the wall bed uses
// fat ones on a 2 m pitch so it seals the map from edge to edge.
function fireBed({trees=1,radius=.75,pitch=2,gap=false}={}){const f=createWorld({count:2});f.map={width:24,depth:24};
 f.trees=Array.from({length:trees},(_,i)=>({id:i,x:.5,z:i*pitch-(trees-1)*pitch/2,radius,height:5,hp:400,burn:0,dead:false,shade:.5})).filter(t=>!gap||t.z!==0);
 f.trees.forEach((t,i)=>t.id=i);f.grid=createGrid(f.map,f.trees);f.treeBuckets=null;return f;}
const heat=fireBed();const parked=heat.units[0],beside=heat.units[1];
parked.x=1.2;parked.z=.8;parked.active=false;parked.panicUntil=Infinity;   // pinned: he is not going anywhere
beside.x=7.5;beside.z=.5;beside.active=false;beside.panicUntil=Infinity;
assert.equal(heat.grid.blocked[heat.grid.index(parked.x,parked.z)],0,'negative control: the pinned man is on open ground, not inside a tree');
ignite(heat,heat.trees[0]);for(let i=0;i<16;i++)tick(heat);
assert.ok(fireIntensityAt(heat,parked.x,parked.z)>.3,'negative control: the pinned man must actually be standing in it');
assert.equal(fireIntensityAt(heat,beside.x,beside.z),0,'negative control: the bystander must not be');
for(let i=0;i<60*8;i++)tick(heat);
assert.equal(parked.hp,0,'a man parked in fire must die');
assert.equal(beside.hp,100,'a man seven metres away must not even notice');
report.tests.push({name:'fire kills the man standing in it and spares the man beside him',parkedHP:parked.hp,besideHP:beside.hp,secondsToDie:+parked.deathTime.toFixed(2)});

// Damage ramps with intensity, and charred-but-out ground is safe.
const ramp=fireBed();ignite(ramp,ramp.trees[0]);for(let i=0;i<16;i++)tick(ramp);
const close=fireIntensityAt(ramp,1.0,.5),far=fireIntensityAt(ramp,2.0,.5),outside=fireIntensityAt(ramp,4,.5);
assert.ok(close>far&&far>outside&&outside===0,'intensity must fall off with distance');
ramp.trees[0].hp=1;for(let i=0;i<60*20;i++)tick(ramp);
assert.ok(ramp.trees[0].dead,'the tree burns down');
assert.equal(ramp.fires.length,0,'and its ground fire burns out');
assert.equal(fireIntensityAt(ramp,.5,.5),0,'charred-but-out ground is safe');
const scarWalker=ramp.units[0];scarWalker.x=.5;scarWalker.z=.5;scarWalker.hp=100;scarWalker.onFire=0;scarWalker.panicUntil=Infinity;
for(let i=0;i<60*5;i++)tick(ramp);assert.equal(scarWalker.hp,100,'standing on a cold scar costs nothing');
report.tests.push({name:'intensity ramps with distance; burnt-out scar is safe',close:+close.toFixed(3),far:+far.toFixed(3),outside});

// Panic: not pinned, he runs out and lives.
const flee=fireBed();const runner=flee.units[0];runner.x=1.2;runner.z=.8;runner.active=false;flee.units[1].x=11.5;flee.units[1].z=11.5;
ignite(flee,flee.trees[0]);
for(let i=0;i<60*8;i++)tick(flee);
assert.ok(runner.hp>0,'an unpinned man panics out of the fire and lives');
assert.ok(Math.hypot(runner.x-.5,runner.z-.5)>2.4,'he actually left, he did not stand there politely');
assert.ok(flee.events.some(e=>e.type==='panic'),'and the renderer is told about it');
report.tests.push({name:'a man in fire panics out rather than standing in it politely',hp:+runner.hp.toFixed(1),distance:+Math.hypot(runner.x-.5,runner.z-.5).toFixed(2)});

// A burning treeline is a real wall while it burns: the AI will not route through it.
const wall=fireBed({trees:13,radius:1.2,gap:true});const red=wall.units[1];red.team='red';red.id=100;red.alerted=true;red.think=0;
wall.units[0].x=-11.5;wall.units[0].z=.5;wall.units[0].weapon=null;red.x=9.5;red.z=.5;  // out of rifle range: this test is about feet, not bullets
updateAI(wall,1);assert.ok(red.path.length>0,'negative control: with the wood unlit the enemy comes straight at you');
for(const t of wall.trees)ignite(wall,t);
for(let i=0;i<30;i++)tick(wall);
red.think=0;red.panicking=0;updateAI(wall,1);
assert.equal(red.ai,'waits','the enemy must not walk into a burning treeline');
assert.equal(red.path.length,0);
assert.ok(wall.fireMaskHot,'and the mask that stopped him is live');
let waited=0;while(wall.fireMaskHot&&waited<60*40){tick(wall);waited++;}
assert.ok(red.hp>0,'he waited it out rather than cooking');
red.think=0;red.panicking=0;red.alerted=true;updateAI(wall,1);
assert.ok(!wall.fireMaskHot,'the fire eventually goes out');
assert.ok(red.path.length>0,'and then he comes through the gap he was waiting behind');
report.tests.push({name:'burning treeline is a wall the AI waits behind, and a gap once it is out',burnedTrees:wall.trees.filter(t=>t.dead).length,secondsHeldOff:+(waited/60).toFixed(1)});

// The player may still order men into it. That is the joke; it has to cost.
const insist=fireBed({trees:13,radius:1.2,gap:true});const mule=insist.units[0];mule.x=6.5;mule.z=.5;insist.units[1].hp=0;
for(const t of insist.trees)ignite(insist,t);
for(let i=0;i<20;i++)tick(insist);
orderMove(insist,-6.5,.5);assert.ok(mule.path.length>0,'an order through fire is still obeyed');
const before=mule.hp;for(let i=0;i<60*6;i++)tick(insist);
assert.ok(mule.hp<before,'and it hurts');
report.tests.push({name:'the player can march men into a firestorm; the forest charges for it',hp:+mule.hp.toFixed(1)});

// ---------------------------------------------------------------- V3 the flamethrower
// Open ground, no trees: everything below is about the weapon, not the wood.
function bare(count=2,enemies=0){const f=createWorld({count,enemies});f.map={width:32,depth:32};f.trees=[];f.burning=[];f.fires=[];f.grid=createGrid(f.map,[]);f.treeBuckets=new Map();
 f.units.forEach((u,i)=>{u.x=0;u.z=i*1.2;u.path=[];u.panicUntil=Infinity;});return f;}
// Three men in a wedge in front of him, one behind. The one behind must survive.
const flame=bare(1);
const gunner=flame.units[0];gunner.weapon='flamer';gunner.x=0;gunner.z=6;gunner.yaw=Math.PI;   // facing -z
for(let i=0;i<3;i++){const e=createUnit(200+i,(i-1)*1.1,2.2,'red','Pvt. Kindling');e.hp=e.maxHp=65;e.panicUntil=Infinity;e.think=1e9;flame.units.push(e);}
const behind=createUnit(210,0,8.4,'blue','Pvt. Sensible');behind.panicUntil=Infinity;flame.units.push(behind);
for(let i=0;i<60*6;i++)tick(flame);
assert.ok(flame.units.filter(u=>u.team==='red').every(u=>u.hp<=0),'a cone of flame clears the wedge in front of it');
assert.equal(behind.hp,100,'and the man standing behind him is untouched');
report.tests.push({name:'flamer burns down everything in the cone and nothing behind it',seconds:+flame.units[2].deathTime.toFixed(2)});

// It is genuinely dangerous to its owner: it leaves a pool four metres in front of him.
const own=bare(2);const arsonist=own.units[0],mate=own.units[1];
arsonist.weapon='flamer';arsonist.x=0;arsonist.z=6;arsonist.yaw=Math.PI;mate.x=1.0;mate.z=3.4;   // mate is in the wedge. Poor mate.
const foe=createUnit(220,0,1.5,'red','Pvt. Bait');foe.hp=foe.maxHp=400;foe.think=1e9;foe.panicUntil=Infinity;own.units.push(foe);
for(let i=0;i<60*4;i++)tick(own);
assert.ok(mate.hp<100,'the flamer hoses his own side without hesitation');
assert.ok((own.fires||[]).length>0,'and leaves burning ground in front of him');
arsonist.panicUntil=0;orderMove(own,0,0);                 // the player marches him into his own fire
const owner=arsonist.hp;for(let i=0;i<60*4;i++)tick(own);
assert.ok(arsonist.hp<owner,'and it will absolutely take the man holding it');
report.tests.push({name:'the flamer is a danger to its owner and his friends',mateHP:+mate.hp.toFixed(1),ownerHP:+arsonist.hp.toFixed(1)});

// Kill a man holding one and the tank goes up.
const cook=bare(2);const carrier=cook.units[0],bystander=cook.units[1];
carrier.weapon='flamer';carrier.x=0;carrier.z=0;bystander.x=2.4;bystander.z=0;
const neighbour=bystander.hp;damage(cook,carrier,9999);
for(let i=0;i<60;i++)tick(cook);
assert.ok(cook.events.some(e=>e.type==='explosion'&&e.tank),'a dead flamer cooks off');
assert.ok(bystander.hp<neighbour-40,'and it takes his neighbour with him');
report.tests.push({name:'a dead flamer cooks off and takes his neighbour with him',neighbourHP:+bystander.hp.toFixed(1),radius:WEAPONS.flamer.tank.radius});

// ---------------------------------------------------------------- V4 three kinds of enemy
// Rifle rounds bounce off the heavy; a grenade and a flame do not care about his plate.
function lone(kind){const f=bare(1);const e=applyKind(createUnit(300,0,0,'red'),kind);e.think=1e9;e.panicUntil=Infinity;f.units.push(e);f.units[0].x=0;f.units[0].z=40;f.units[0].panicUntil=Infinity;return {f,e};}
const rifled=lone('heavy');for(let i=0;i<10;i++)damage(rifled.f,rifled.e,25,null,'shot');
const plain=lone('grunt');for(let i=0;i<10;i++)damage(plain.f,plain.e,25,null,'shot');
assert.equal(rifled.e.hp,SOLDIERS.heavy.hp-10*25*(1-SOLDIERS.heavy.armour),'the heavy eats a chunk of every bullet');
assert.equal(plain.e.hp,0);
const burnt=lone('heavy');damage(burnt.f,burnt.e,200,null,'fire');
assert.equal(burnt.e.hp,0,'but armour does nothing against fire');
const flamed=lone('heavy');damage(flamed.f,flamed.e,200,null,'flame');
assert.equal(flamed.e.hp,0,'or against the flamer');
report.tests.push({name:'the heavy shrugs off rifles and not fire',heavyAfter10Rifles:rifled.e.hp,armour:SOLDIERS.heavy.armour});

// The rusher is quick, brittle, and does not brake.
assert.ok(SOLDIERS.heavy.armour>=.4&&SOLDIERS.heavy.hp>=SOLDIERS.grunt.hp*2,'the heavy must be a wall');
assert.ok(SOLDIERS.rusher.speed>SOLDIERS.blue.speed&&SOLDIERS.rusher.hp<SOLDIERS.grunt.hp/1.5,'rusher must be faster than you and made of paper');
assert.ok(SOLDIERS.heavy.speed<SOLDIERS.grunt.speed/1.5,'the heavy must lumber');
const dash=bare(1);const prey=dash.units[0];prey.x=.5;prey.z=-7.5;prey.path=[];prey.panicUntil=Infinity;prey.weapon=null;
const whip=applyKind(createUnit(310,.5,13.5,'red'),'rusher');whip.alerted=true;whip.panicUntil=Infinity;dash.units.push(whip);
const plod=applyKind(createUnit(311,4.5,13.5,'red'),'heavy');plod.alerted=true;plod.panicUntil=Infinity;dash.units.push(plod);
for(let i=0;i<60*6;i++)tick(dash);
const rusherGap=Math.hypot(whip.x-prey.x,whip.z-prey.z),heavyGap=Math.hypot(plod.x-prey.x,plod.z-prey.z);
assert.ok(rusherGap<heavyGap-6,'in six seconds the rusher is on you and the heavy is still coming: '+rusherGap.toFixed(1)+' vs '+heavyGap.toFixed(1));
assert.ok(dash.events.some(e=>e.type==='shot'&&e.team==='red'),'and he closes to bayonet range and uses it');
assert.ok(prey.hp<100,'a lone man gets hurt by a rusher');
report.tests.push({name:'the rusher closes and the heavy lumbers',rusherGap:+rusherGap.toFixed(2),heavyGap:+heavyGap.toFixed(2),preyHP:+prey.hp.toFixed(1)});

// Later missions really are nastier: no heavies in the first two, plenty by the last.
const kinds=m=>[...(m.mix||[]),...(m.waves||[]).flatMap(v=>v.mix||m.mix||[])];
assert.ok(!kinds(MISSIONS[0]).includes('heavy')&&!kinds(MISSIONS[0]).includes('rusher'),'mission one teaches with grunts only');
assert.ok(kinds(MISSIONS[5]).filter(k=>k==='heavy').length>=3,'the last post is full of heavies');
report.tests.push({name:'mission data escalates the mix',perMission:MISSIONS.map(m=>kinds(m).join('/'))});

// ---------------------------------------------------------------- V5 the emplacement
// Sandbags block bullets, never boots, and never the man hugging them.
const dig=createWorld({count:2});
const cx=centre(-1,dig.map),north={x:cx,z:-5.5},south={x:cx,z:3.5};
assert.ok(lineClear(dig,north,south),'negative control: before you dig in, that lane is open');
fortify(dig);
const bags=dig.works.filter(k=>k.type==='bag'),line=bags[4];
assert.equal(lineClear(dig,north,south),false,'a bullet across the bags is stopped');
assert.ok(lineClear(dig,{x:cx,z:line.z+1.2},north),'but the man hugging his own bags shoots straight over them');
// Boots are not stopped: the bags are not in the pathing grid at all.
dig.units[0].x=cx;dig.units[0].z=line.z+5;orderMove(dig,cx,line.z-5);
for(let i=0;i<60*10;i++)tick(dig);
assert.ok(dig.units[0].z<line.z-4,'you can still walk over your own sandbags');
// A grenade flattens one and opens the line.
const wreck=createWorld({count:1});fortify(wreck);const bag=wreck.works[4];
assert.equal(lineClear(wreck,{x:bag.x,z:bag.z-6},{x:bag.x,z:bag.z+6}),false,'negative control: intact before the blast');
blastTrees(wreck,bag.x,bag.z,4.2);
assert.ok(wreck.works.filter(k=>k.dead).length>=1,'a grenade flattens sandbags');
assert.ok(lineClear(wreck,{x:bag.x,z:bag.z-6},{x:bag.x,z:bag.z+6}),'and the gap is a firing lane');
report.tests.push({name:'sandbags stop bullets, not boots, and a grenade opens a lane',bags:dig.works.length,flattened:wreck.works.filter(k=>k.dead).length});

// Territory: what a won mission leaves behind is there the next time you see the place.
const land=newCampaign();const first=campaignWorld(land);
assert.ok(!first.works,'negative control: nothing is dug in on the first visit');
first.trees[3].dead=true;first.trees[7].dead=true;first.mission.status='victory';
finishMission(land,first);
const second=campaignWorld(land);
assert.equal(second.map.id,'clearing','mission two is the same ground');
assert.ok(second.works&&second.works.length>=9,'the emplacement you won is standing next time');
assert.ok(second.trees[3].dead&&second.trees[7].dead,'and so are the burn scars');
assert.equal(second.trees[4].dead,false,'negative control: trees you did not burn are still trees');
report.tests.push({name:'a won mission leaves its emplacement and its burn scars on the map',works:second.works.length,scars:second.trees.filter(t=>t.dead).length});

const money=newCampaign();money.credits=500;assert.equal(purchase(money,'armour'),false);assert.equal(money.credits,500);money.mission=1;assert.equal(purchase(money,'armour'),true);assert.equal(money.credits,430);assert.equal(purchase(money,'slots'),false);money.mission=2;assert.equal(purchase(money,'slots'),true);assert.equal(purchase(money,'slots'),false);money.credits=0;assert.equal(purchase(money,'rifle'),false);report.tests.push({name:'economy rejects locked, maxed and unaffordable purchases'});
await writeFile(new URL('../docs/evidence/sim.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
