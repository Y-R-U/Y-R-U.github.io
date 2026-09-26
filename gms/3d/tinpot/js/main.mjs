import {createAudio} from './platform/audio.mjs';
import {createSpeech} from './platform/speech.mjs';
import {createHaptics} from './platform/haptics.mjs';
import {createAttract} from './ui/attract.mjs';
import {throwGrenade} from './core/combat.mjs';
import {groundFire,blastTrees,fireIntensityAt} from './core/forestSim.mjs';
import {damage} from './core/combat.mjs';
import {createUnit,applyKind} from './core/units.mjs';
import {purchase,assign,offer} from './core/economy.mjs';
import {UPGRADES} from './data/upgrades.mjs';
import {fillSquad} from './core/roster.mjs';
import * as THREE from 'three';
import {createScene} from './render/scene.mjs';
import {createTerrain} from './render/terrain.mjs';
import {createForest} from './render/forest.mjs';
import {createActors} from './render/actors.mjs';
import {createVFX} from './render/vfx.mjs';
import {createFire} from './render/fire.mjs';
import {createProps} from './render/props.mjs';
import {createWorld,orderMove,groundOrder,toggleUnit,setWeapon,tick,STEP,ARM_SECONDS} from './core/world.mjs';
import {WEAPONS} from './data/weapons.mjs';
import {VERSION} from './version.mjs';
import {newCampaign,campaignWorld,snapshotWorld,finishMission,markDeployment,rewind,canRetry,chooseRoute,continueWorld,atDepot,resupply} from './core/save.mjs';
import {loadCampaign,storeCampaign} from './platform/storage.mjs';
import {bindInput} from './platform/input.mjs';
import {createField} from './ui/field.mjs';
import {createHUD} from './ui/hud.mjs';
import {createScreens} from './ui/screens.mjs';
import {MISSIONS,endingFor} from './data/missions.mjs';
try {
 // 0.04.2 — how long the mission banner stays open before it folds down to the pause button
 // alone, and how long it comes back for after an unpause. Both are in sim seconds, so a paused
 // game never counts down and the banner is always up while he is reading it.
 const BANNER_OPEN=7,BANNER_AFTER_PAUSE=6;
 const canvas=document.getElementById('battlefield'),view=createScene(canvas),testing=new URLSearchParams(location.search).has('test');let campaign=loadCampaign(),w,terrain,forest,actors,vfx,fire,props,root,marker,armedMark,armedRing,armedFill,reachRing,mode='title',paused=false,result=null,lastSave=0,assignSlot=null,primer=false,bannerUntil=0,collapsed=false,notice='',noticeUntil=0,settingsReturn='title';
 // The coaching ledger. A teaching card is shown until the player has DONE the thing, then
 // never again in this campaign. Nothing he has already learned should still be nagging him.
 function teach(k){if(!campaign.taught)campaign.taught={};if(campaign.taught[k])return;campaign.taught[k]=true;save();}
 const sound=await createAudio();
 const speech=await createSpeech(sound);
 const haptics=createHaptics();let eventCursor=0,eulogy=null,eulogyKey=0;
 // One pass over the new events per frame, shared by the buzzer and the telegram.
 function drainEvents(){const fresh=[];for(const e of w.events)if(e.id>eventCursor)fresh.push(e);if(fresh.length)eventCursor=fresh[fresh.length-1].id;return fresh;}
 const attract=createAttract(intent=>{if(intent.type==='reset-demo')demo();if(intent.type==='demo-move')orderMove(w,intent.x,intent.z);if(intent.type==='demo-lob'){const u=w.units.find(u=>u.team==='blue'&&u.hp>0);if(u)throwGrenade(w,u,intent.x,intent.z);}});
 function demo(){load(createWorld({count:4,enemies:10}));for(const u of w.units)if(u.team==='blue')u.z=7+Math.floor(u.id/2)*1.6;attract.reset();}
 const hud=createHUD(document.getElementById('hud'),intent=>{if(mode!=='battle')return;
  // 0.04.3: while the grenade briefing is up the only thing a tap can do is dismiss it.
  if(primer){primer=false;paused=false;teach('grenade');bannerUntil=w.time+BANNER_AFTER_PAUSE;return;}
  if(intent.type==='toggle'){const u=w.units.find(u=>u.id===intent.id),before=u?.active;toggleUnit(w,intent.id);if(u&&before!==u.active)speech.command(u.active?'join':'hold',w,u.id);}
  if(intent.type==='weapon'){const changed=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0&&(intent.id==null||u.id===intent.id)&&u.weapon!==intent.weapon);setWeapon(w,intent.weapon,intent.id);if(changed.length&&w.equipped.includes(intent.weapon))speech.command(intent.weapon,w,changed[0].id);}
  // 0.04.2: unpausing leaves the banner up for a few seconds before it folds away again.
  if(intent.type==='pause'){paused=!paused;if(!paused)bannerUntil=w.time+BANNER_AFTER_PAUSE;}});
 const screens=createScreens(document.getElementById('screens'),intent=>{
 if(intent.type==='start'){if(campaign.mission>=MISSIONS.length){result=campaign.history.at(-1);mode='debrief';}else if(campaign.inProgress){load(campaignWorld(campaign));mode='battle';paused=false;}else mode='briefing';}
 if(intent.type==='settings'){settingsReturn=mode;mode='settings';}
 if(intent.type==='settings-close')mode=settingsReturn;
 if(intent.type==='volume'){sound.set(intent.id,intent.value);return;}
 if(['next','retry','new-campaign'].includes(intent.type)){if(intent.type==='new-campaign')campaign=newCampaign();fillSquad(campaign,MISSIONS[Math.min(campaign.mission,MISSIONS.length-1)].count);mode='barracks';save();}
 if(intent.type==='barracks'){fillSquad(campaign,MISSIONS[Math.min(campaign.mission,MISSIONS.length-1)].count);mode='barracks';}
 if(intent.type==='briefing')mode='briefing';
 if(intent.type==='deploy'){markDeployment(campaign);load(campaignWorld(campaign,{resume:false}));mode='battle';paused=false;if(w.mission.field)announce(w.mission.title+' · '+w.mission.brief);save();}
 if(intent.type==='retry-mission'&&rewind(campaign)){fillSquad(campaign,MISSIONS[Math.min(campaign.mission,MISSIONS.length-1)].count);load(campaignWorld(campaign));markDeployment(campaign,w.mission.field?w:null);mode='battle';paused=false;result=null;save();}
 if(intent.type==='depot-close'){resupply(campaign,w);mode='battle';paused=false;save();}
 if(intent.type==='save-exit'){save();mode='title';paused=false;demo();}
 if(intent.type==='buy'){if(purchase(campaign,intent.id)){if(mode==='depot')resupply(campaign,w);teach('upgrade');speech.offer('upgrade',w,{voice:'general',priority:60,ttl:4});}save();}
 if(intent.type==='assign-open')assignSlot=intent.slot;
 if(intent.type==='assign-close')assignSlot=null;
 if(intent.type==='assign'){assign(campaign,intent.slot,Number(intent.id));assignSlot=null;save();}
 showScreen();
 });
 // V3.3: after the first mission, point an arrow at the first upgrade he can actually afford.
 // It retires the moment he buys anything at all.
 function firstAffordable(offers){const spent=campaign.upgrades.armour>0||campaign.upgrades.rifle>0||campaign.upgrades.slots>1;
  if(campaign.taught?.upgrade||spent||campaign.mission<1)return null;
  return offers.find(o=>!o.locked&&!o.maxed&&o.affordable)?.id||null;}
 function showScreen(){sound.change(mode==='depot'?'barracks':mode==='battle'?'battle_march':mode==='debrief'?(result?.win?'victory':'defeat'):mode==='settings'?'title':mode);const offers=UPGRADES.map(u=>offer(campaign,u.id));screens.show(mode,{ending:endingFor(campaign),total:MISSIONS.length,hasSave:campaign.mission>0||!!campaign.inProgress,canRetry:canRetry(campaign),audio:sound.settings(),result,complete:campaign.mission>=MISSIONS.length,mission:mode==='depot'?w.mission:MISSIONS[Math.min(campaign.mission,MISSIONS.length-1)],campaign,offers,coachBuy:firstAffordable(offers),assignSlot});}

 function load(world){if(root){const geo=new Set(),mat=new Set();root.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)mat.add(o.material);});for(const g of geo)g.dispose();for(const m of mat)m.dispose();view.scene.remove(root);}root=new THREE.Group();view.scene.add(root);w=world;sound.reset();speech.reset();terrain=createTerrain(root,w.map);forest=createForest(root,w.trees);actors=createActors(root);vfx=createVFX(root);fire=createFire(root);props=createProps(root,w);marker=new THREE.Mesh(new THREE.RingGeometry(.7,.77,32),new THREE.MeshBasicMaterial({color:0xeee5ad,side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.visible=false;root.add(marker);
 // The armed-grenade marker: a red ring that pulses, with a disc inside it that drains away as
 // the fuse on the ORDER (not the grenade) runs down. And the reach ring, which shows how far
 // the lead grenadier can actually throw — walk past it and the throw falls short.
 armedRing=new THREE.Mesh(new THREE.RingGeometry(1.42,1.72,40),new THREE.MeshBasicMaterial({color:0xff5530,side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:false}));
 armedFill=new THREE.Mesh(new THREE.CircleGeometry(1.34,28),new THREE.MeshBasicMaterial({color:0xff9a4a,transparent:true,opacity:.42,depthWrite:false,depthTest:false}));
 armedMark=new THREE.Group();armedRing.rotation.x=armedFill.rotation.x=-Math.PI/2;armedRing.position.y=.09;armedFill.position.y=.08;armedFill.renderOrder=6;armedRing.renderOrder=7;armedMark.add(armedRing,armedFill);armedMark.visible=false;root.add(armedMark);
 reachRing=new THREE.Mesh(new THREE.RingGeometry(.9795,1,120),new THREE.MeshBasicMaterial({color:0xffd27a,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,depthTest:false}));
 reachRing.rotation.x=-Math.PI/2;reachRing.position.y=.06;reachRing.renderOrder=6;reachRing.visible=false;root.add(reachRing);
 notice=w.mission?.field?(w.mission.status==='intermission'?'OBJECTIVE COMPLETE · Visit the depot or choose your next route.':w.mission.title+' · '+w.mission.brief):'';noticeUntil=w.time+8;lastSave=w.time;eventCursor=0;eulogy=null;primer=false;bannerUntil=w.time+BANNER_OPEN;collapsed=false;}
 function save(){if((['battle','depot'].includes(mode)||(mode==='settings'&&settingsReturn==='depot'))&&['active','intermission'].includes(w.mission?.status))campaign.inProgress=snapshotWorld(w);storeCampaign(campaign);}
 demo();showScreen();
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();bindInput(canvas,intent=>{if(paused||mode!=='battle')return;ray.setFromCamera(new THREE.Vector2(intent.x/innerWidth*2-1,1-intent.y/innerHeight*2),view.camera);if(ray.ray.intersectPlane(plane,hit)){const did=groundOrder(w,hit.x,hit.z);if(did==='move')teach('move');else if(did==='arm')teach('grenade');}});
 document.getElementById('rotate-dismiss')?.addEventListener('click',()=>document.documentElement.classList.add('rotate-ok'));
 addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden){save();paused=true;}});
 let frames=0,last=0,acc=0;const snapshot=()=>({frames,time:w.time,mode,paused,graphics:{pitchDegrees:Math.atan2(view.camera.position.z,view.camera.position.y)*180/Math.PI,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,geometries:view.renderer.info.memory.geometries},audio:sound.snapshot(),speech:speech.snapshot(),haptics:{supported:haptics.supported,buzzes:haptics.count()},eulogy:eulogy&&{name:eulogy.name,kills:eulogy.kills},dpr:view.renderer.getPixelRatio(),equipped:w.equipped,trees:forest.count,burned:w.trees.filter(t=>t.dead).length,burning:w.trees.filter(t=>t.burn>0).length,fires:(w.fires||[]).length,alight:w.units.filter(u=>u.onFire>0&&u.hp>0).length,grenades:w.grenades.length,grenadeTargets:w.grenades.map(g=>({tx:+g.tx.toFixed(2),tz:+g.tz.toFixed(2)})),explosions:testing?w.events.filter(e=>e.type==='explosion').map(e=>({x:+e.x.toFixed(2),z:+e.z.toFixed(2)})):undefined,vfx:vfx.counts(),units:w.units.map(u=>({...u,path:u.path.length})),target:w.target,mission:w.mission,campaign:{mission:campaign.mission,credits:campaign.credits,roster:campaign.roster,history:campaign.history,flags:campaign.flags,choices:campaign.choices,pendingRoutes:campaign.pendingRoutes,taught:campaign.taught||{}},armed:w.armed?{...w.armed,left:+Math.max(0,w.armed.ready-w.time).toFixed(2)}:null,primer,banner:{collapsed,openUntil:+bannerUntil.toFixed(2)},split:w.split||0,coach:coachModel(),markers:{target:!!marker?.visible,armed:!!armedMark?.visible,reach:!!reachRing?.visible},field:{depotReady:atDepot(w),notice:w.time<noticeUntil?notice:null},version:VERSION,fortified:w.fortified});

 // ---------------------------------------------------------------- the teaching moments (V3)
 // One card at a time, in priority order, and every one of them retires itself. `campaign.taught`
 // is the ledger: once he has done the thing it is never explained again. The armed-grenade card
 // is not a lesson, it is a live readout, so it outranks everything and ignores the ledger.
 const bomber=()=>w.units.find(u=>u.team==='blue'&&!u.escort&&u.hp>0&&u.active&&u.weapon==='grenade');
 // True when the nearest man who could throw it can no longer reach the armed point — i.e. he
 // has walked away from his own grenade and it is going to fall short. Aaron has to be able to
 // SEE that before it happens; that is the entire lesson.
 const outOfReach=()=>{const a=w.armed;if(!a)return false;
  const crew=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0&&u.active&&u.weapon==='grenade');
  if(!crew.length)return false;
  return Math.min(...crew.map(u=>Math.hypot(u.x-a.x,u.z-a.z)))>WEAPONS.grenade.range;};
 // 0.04.1: the armed-grenade readout is NOT a coach card any more. It takes over the mission
 // banner at the top of the screen (see `armedModel`), because Aaron's complaint about it was
 // that it was legible and in the way. Nothing about the armed state floats over the grass.
 const armedModel=()=>w.armed&&mode==='battle'&&!w.art?{left:Math.max(0,Math.ceil(w.armed.ready-w.time)),short:outOfReach()}:null;
 function coachModel(){
  if(mode!=='battle'||w.art||w.armed||primer)return null;
  const t=campaign.taught||{};
  if(w.mission?.field)return null;
  if(!t.move)return {tone:'gold',eyebrow:'FIELD MANUAL, RULE ONE',title:'Tap to move to location',
   lines:['Anywhere on the grass. They walk there and shoot on their own.']};
  // The arm/cancel/move lesson is now the paused briefing in `primer` (0.04.3), so all that is
  // left here is the nudge that gets a grenade into somebody's hand in the first place.
  if(!t.grenade&&(w.equipped||[]).includes('grenade')&&!bomber())
   return {tone:'gold',eyebrow:'NEW: GRENADES',title:'Hand out the grenades',
    lines:['Tap ● on the left rail for the whole squad, or the ● on one man\u2019s card for just him.']};
  const alive=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0);
  if(!t.split&&w.mission?.id===1&&alive.length>1){
   const held=alive.find(u=>!u.active);
   return {tone:'gold',eyebrow:'THE WHOLE TACTICAL GAME',title:held?'Now bring him back':'Leave one man holding',
    arrow:(held||alive[alive.length-1]).id,
    lines:held?['Tap his card again and he rejoins the march.']:['Tap a helmet card below. He stays put and keeps shooting while the others swing wide.']};}
  return null;}
 function announce(text){notice=text;noticeUntil=w.time+8;bannerUntil=w.time+5;}
 function onward(id){if(!chooseRoute(campaign,id))return;const old=w;const next=continueWorld(campaign,old);load(next);markDeployment(campaign,w);mode='battle';paused=false;announce(w.mission.title+' · '+w.mission.brief);showScreen();save();}
 const field=createField((kind,id)=>{
  if(mode!=='battle'||paused)return;
  if(kind==='depot'){
   if(atDepot(w)){resupply(campaign,w);save();mode='depot';paused=true;showScreen();return;}
   setWeapon(w,'rifle');orderMove(w,w.map.depot.x,w.map.depot.z);announce('FIELD DEPOT · Move to the cross. Clear nearby enemies before opening.');
  }
  if(kind==='route'&&w.mission.status==='intermission'){
   const options=campaign.pendingRoutes||[],i=options.findIndex(r=>r.to===id);if(i<0)return;
   const x=options.length===1?0:i===0?-4:4,z=-14;
   if(w.units.some(u=>u.team==='blue'&&!u.escort&&u.hp>0&&Math.hypot(u.x-x,u.z-z)<3))onward(id);
   else{setWeapon(w,'rifle');orderMove(w,x,z);announce(options[i].detail);}
  }
 });
 function step(){tick(w);
  if(w.mission?.status==='intermission'){
   const route=campaign.pendingRoutes?.[0];
   if(campaign.pendingRoutes?.length===1&&MISSIONS[route.to]?.map===w.map.id&&w.time>=w.fieldWait)onward(route.to);
   return;
  }
  if(w.mission&&w.mission.status!=='active'&&mode==='battle'){
   result=finishMission(campaign,w);primer=false;paused=false;
   if(result.win&&w.mission.field&&!w.mission.ending){
    w.mission.status='intermission';w.fieldWait=w.time+7;
    // A cleared objective grants a ceasefire for travel and the optional depot.
    w.units=w.units.filter(u=>u.team==='blue');for(const u of w.units){u.path=[];u.onFire=0;u.panicking=0;}
    w.grenades=[];w.projectiles=[];w.armed=null;
    announce('COMPLETE · '+result.title+' · +'+result.reward+' brass. '+(w.mission.consequence||'Next orders incoming.'));
   }else{mode='debrief';showScreen();}save();
  }
 }
 const project3=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(view.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};};
 // Measures the camera tilt the way it is actually seen: how far up-screen a tree's canopy sits
 // from its own trunk base. Zero means the camera is vertical whatever the config claims.
 const tiltReport=()=>{const samples=[];for(const t of w.trees){if(t.height<3)continue;const b=project3(t.x,0,t.z);if(b.x<24||b.x>innerWidth-24||b.y<60||b.y>innerHeight-60)continue;const a=project3(t.x,t.height,t.z);const dx=a.x-b.x,dy=a.y-b.y;samples.push({x:+t.x.toFixed(2),z:+t.z.toFixed(2),h:+t.height.toFixed(2),dx:+dx.toFixed(2),dy:+dy.toFixed(2),px:+Math.hypot(dx,dy).toFixed(2),pxPerMetre:+(Math.hypot(dx,dy)/t.height).toFixed(3)});if(samples.length>=60)break;}
  const up=samples.filter(s=>s.dy<0).length;
  return {pitchDegrees:+(Math.atan2(view.camera.position.z,view.camera.position.y)*180/Math.PI).toFixed(3),fov:view.camera.fov,cameraHeight:+view.camera.position.y.toFixed(2),cameraZ:+view.camera.position.z.toFixed(2),worldOffsetPerMetre:+Math.tan(Math.atan2(view.camera.position.z,view.camera.position.y)).toFixed(4),samples,count:samples.length,fractionUpScreen:samples.length?+(up/samples.length).toFixed(3):0,minPx:samples.length?+Math.min(...samples.map(s=>s.px)).toFixed(2):0,medianPx:samples.length?+samples.map(s=>s.px).sort((a,b)=>a-b)[samples.length>>1].toFixed(2):0};};
 if(testing)window.tinpotTest={complete(){w.mission.status='victory';step();return snapshot();},state(){return structuredClone(campaign);},voice(event,id=0){return speech.offer(event,w,{unit:id,priority:70,ttl:4});},tilt:tiltReport,mission(n,credits=0){campaign=newCampaign();campaign.mission=n;campaign.credits=credits;if(n>=2)campaign.upgrades.slots=2;fillSquad(campaign,MISSIONS[n].count);markDeployment(campaign);load(campaignWorld(campaign,{resume:false}));mode='battle';paused=false;showScreen();return snapshot();},taught(){return campaign.taught;},torch(x,z,r=2.6,life=9){groundFire(w,x,z,r,life);},smite(n=99){let k=0;for(const u of w.units)if(u.team==='blue'&&!u.escort&&u.hp>0&&k<n){damage(w,u,9999);k++;}},actorSizes(){return actors.sizes();},lineup(z=2){w.units=w.units.filter(u=>u.team==='blue');['grunt','heavy','rusher'].forEach((k,i)=>{const p=w.grid.point(w.grid.nearest((i-1)*2.6,z));const u=applyKind(createUnit(400+i,p.x,p.z,'red'),k);u.think=1e9;u.yaw=Math.PI;w.units.push(u);});return snapshot();},burn(x,z,r=4){blastTrees(w,x,z,r);},heat(x,z){return fireIntensityAt(w,x,z);},freeze(){paused=true;},move(x,z){orderMove(w,x,z);},advance(n){for(let i=0;i<n;i++)if(mode==='battle')step();else if(mode==='title'){tick(w);attract.update(snapshot());}return snapshot();},fixture(name){mode='battle';paused=false;if(name==='title'){campaign=newCampaign();mode='title';demo();showScreen();return snapshot();}if(name==='campaign'){campaign=newCampaign();fillSquad(campaign,MISSIONS[0].count);markDeployment(campaign);load(campaignWorld(campaign,{resume:false}));showScreen();}else{load(createWorld({count:name==='art'?0:name==='m2'||name==='m3'?1:4,enemies:name==='art'||name==='m2'?0:name==='m3'?1:4}));w.art=name==='art';w.equipped=name==='m5'?['rifle','grenade','flamer']:['rifle'];}screens.show(mode);return snapshot();},save,project(x,z,y=0){return project3(x,y,z);}};
 const project3Ground=(x,z)=>project3(x,0,z);
 function frame(t=0){const dt=Math.min((t-last)/1000,.1);acc+=dt;last=t;while(acc>=STEP){if(!paused&&mode==='battle')step();else if(mode==='title'||(mode==='settings'&&settingsReturn==='title')){tick(w);attract.update(snapshot());}acc-=STEP;}const fresh=drainEvents();haptics.update(w,fresh,sound.settings().sfx>0);
  if(mode==='battle')for(const e of fresh)if(e.type==='death'&&e.team==='blue'&&!e.escort)eulogy={name:e.name,kills:e.kills||0,key:++eulogyKey,at:performance.now()};
  if(eulogy&&performance.now()-eulogy.at>2800)eulogy=null;
  // 0.04.3 — the first time a grenade is actually in somebody's hand, stop the war and explain
  // it properly, once, ever. `taught.grenade` is the same ledger the rest of the coaching uses,
  // so it cannot come back a second time even across a reload.
  if(mode==='battle'&&!w.art&&!primer&&!(campaign.taught||{}).grenade&&w.units.some(u=>u.team==='blue'&&!u.escort&&u.hp>0&&u.weapon==='grenade')){primer=true;paused=true;}
  // 0.04.2 — the banner folds down to the pause button alone once he has had time to read it.
  // Sim seconds, so a paused game never counts down; it stays open while armed (it is carrying
  // the countdown) and while the briefing is up.
  const armedLive=armedModel();
  collapsed=mode==='battle'&&!w.art&&!paused&&!primer&&!armedLive&&w.time>bannerUntil;
  const coach=coachModel();if(w.split===2)teach('split');
  terrain.update(w.time,w);forest.update(w);props.update();fire.update(w);actors.update(w,paused?0:dt);vfx.update(w,paused?0:dt);if(w.target){marker.visible=true;marker.position.set(w.target.x,.04,w.target.z);}
  {const a=w.armed,live=a&&mode==='battle',lead=bomber();
   armedMark.visible=!!live;
   if(live){armedMark.position.set(a.x,0,a.z);const k=Math.max(0,Math.min(1,(a.ready-w.time)/ARM_SECONDS)),beat=Math.sin(t/1000*11);
    armedFill.scale.setScalar(Math.max(.02,k));armedFill.material.opacity=.3+.22*k;
    armedRing.scale.setScalar(1+.085*beat);armedRing.material.opacity=.72+.28*beat;
    // Out of reach: the marker goes cold, because from here it can only fall short.
    const cold=outOfReach();armedRing.material.color.setHex(cold?0x93a2a6:0xff5530);armedFill.material.color.setHex(cold?0x7f8f8c:0xff9a4a);}
   const show=mode==='battle'&&lead&&(a||w.time<w.reachUntil);
   reachRing.visible=!!show;
   if(show){reachRing.position.set(lead.x,.06,lead.z);reachRing.scale.set(WEAPONS.grenade.range,1,WEAPONS.grenade.range);reachRing.material.opacity=a?.5:.4;}}field.update({hidden:mode!=='battle'||!w.mission?.field,w,campaign,project:project3Ground,depotReady:atDepot(w),notice:w.time<noticeUntil?notice:null});hud.update({field:!!w.mission?.field,hidden:mode!=='battle'||w.art,location:w.map.name,objective:w.mission?.status==='intermission'?'Complete · choose a route or visit the depot':w.mission?.objective,time:Math.floor(w.mission?.type==='hold'?Math.max(0,w.mission.duration-w.mission.elapsed):w.time),units:w.units.filter(u=>u.team==='blue'&&!u.escort).map(u=>({id:u.id,name:u.name,hp:u.hp,maxHp:u.maxHp,active:u.active,weapon:u.weapon})),equipped:w.equipped,kills:w.units.filter(u=>u.team==='red'&&u.hp<=0).length,losses:w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp<=0).length,paused:paused&&!primer,eulogy,armed:armedLive,collapsed,primer,hint:w.units.some(u=>u.team==='blue'&&u.active&&u.weapon==='grenade')?'TAP TO ARM · TAP THE MARKER TO CANCEL':undefined,coach,arrow:coach?.arrow??null});speech.update(w,fresh,dt,mode,mode==='battle'&&paused,campaign,result);sound.update(w,dt,paused||!['battle','title'].includes(mode),speech.duck());view.draw();frames++;if(!window.__ready){window.__ready=window.__TINPOT_BOOTED__=true;document.getElementById('boot').classList.add('hidden');}window.tinpot=snapshot();if(mode==='battle'&&w.mission&&w.time-lastSave>5){save();lastSave=w.time;}requestAnimationFrame(frame);}frame();
} catch(e){window.tinpotBootFail(e.message);throw e;}
