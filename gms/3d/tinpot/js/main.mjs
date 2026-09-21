import {createAudio} from './platform/audio.mjs';
import {createAttract} from './ui/attract.mjs';
import {throwGrenade} from './core/combat.mjs';
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
import {createWorld,orderMove,groundOrder,toggleUnit,setWeapon,tick,STEP} from './core/world.mjs';
import {newCampaign,campaignWorld,snapshotWorld,finishMission} from './core/save.mjs';
import {loadCampaign,storeCampaign} from './platform/storage.mjs';
import {bindInput} from './platform/input.mjs';
import {createHUD} from './ui/hud.mjs';
import {createScreens} from './ui/screens.mjs';
import {MISSIONS} from './data/missions.mjs';
try {
 const canvas=document.getElementById('battlefield'),view=createScene(canvas),testing=new URLSearchParams(location.search).has('test');let campaign=loadCampaign(),w,terrain,forest,actors,vfx,fire,props,root,marker,mode='title',paused=false,result=null,lastSave=0,assignSlot=null;
 const sound=await createAudio();
 const attract=createAttract(intent=>{if(intent.type==='reset-demo')demo();if(intent.type==='demo-move')orderMove(w,intent.x,intent.z);if(intent.type==='demo-lob'){const u=w.units.find(u=>u.team==='blue'&&u.hp>0);if(u)throwGrenade(w,u,intent.x,intent.z);}});
 function demo(){load(createWorld({count:4,enemies:10}));for(const u of w.units)if(u.team==='blue')u.z=7+Math.floor(u.id/2)*1.6;attract.reset();}
 const hud=createHUD(document.getElementById('hud'),intent=>{if(mode!=='battle')return;if(intent.type==='toggle')toggleUnit(w,intent.id);if(intent.type==='weapon')setWeapon(w,intent.weapon,intent.id);if(intent.type==='pause')paused=!paused;});
 const screens=createScreens(document.getElementById('screens'),intent=>{
 if(intent.type==='start'){if(campaign.mission>=MISSIONS.length){result=campaign.history.at(-1);mode='debrief';}else if(campaign.inProgress){load(campaignWorld(campaign));mode='battle';paused=false;}else mode='briefing';}
 if(intent.type==='settings')mode='settings';
 if(intent.type==='settings-close')mode='title';
 if(intent.type==='volume'){sound.set(intent.id,intent.value);return;}
 if(['next','retry','new-campaign'].includes(intent.type)){if(intent.type==='new-campaign')campaign=newCampaign();fillSquad(campaign,MISSIONS[Math.min(campaign.mission,5)].count);mode='barracks';save();}
 if(intent.type==='barracks'){fillSquad(campaign,MISSIONS[Math.min(campaign.mission,5)].count);mode='barracks';}
 if(intent.type==='briefing')mode='briefing';
 if(intent.type==='deploy'){load(campaignWorld(campaign,{resume:false}));mode='battle';paused=false;save();}
 if(intent.type==='buy'){purchase(campaign,intent.id);save();}
 if(intent.type==='assign-open')assignSlot=intent.slot;
 if(intent.type==='assign-close')assignSlot=null;
 if(intent.type==='assign'){assign(campaign,intent.slot,Number(intent.id));assignSlot=null;save();}
 showScreen();
 });
 function showScreen(){sound.change(mode==='battle'?'battle_march':mode==='debrief'?(result?.win?'victory':'defeat'):mode==='settings'?'title':mode);screens.show(mode,{hasSave:campaign.mission>0||!!campaign.inProgress,audio:sound.settings(),result,complete:campaign.mission>=MISSIONS.length,mission:MISSIONS[Math.min(campaign.mission,5)],campaign,offers:UPGRADES.map(u=>offer(campaign,u.id)),assignSlot});}

 function load(world){if(root){const geo=new Set(),mat=new Set();root.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)mat.add(o.material);});for(const g of geo)g.dispose();for(const m of mat)m.dispose();view.scene.remove(root);}root=new THREE.Group();view.scene.add(root);w=world;sound.reset();terrain=createTerrain(root,w.map);forest=createForest(root,w.trees);actors=createActors(root);vfx=createVFX(root);fire=createFire(root);props=createProps(root,w);marker=new THREE.Mesh(new THREE.RingGeometry(.7,.77,32),new THREE.MeshBasicMaterial({color:0xeee5ad,side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.visible=false;root.add(marker);lastSave=w.time;}
 function save(){if(mode==='battle'&&w.mission?.status==='active')campaign.inProgress=snapshotWorld(w);storeCampaign(campaign);}
 demo();showScreen();
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();bindInput(canvas,intent=>{if(paused||mode!=='battle')return;ray.setFromCamera(new THREE.Vector2(intent.x/innerWidth*2-1,1-intent.y/innerHeight*2),view.camera);if(ray.ray.intersectPlane(plane,hit))groundOrder(w,hit.x,hit.z);});
 addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden){save();paused=true;}});
 let frames=0,last=0,acc=0;const snapshot=()=>({frames,time:w.time,mode,paused,graphics:{pitchDegrees:Math.atan2(view.camera.position.z,view.camera.position.y)*180/Math.PI,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,geometries:view.renderer.info.memory.geometries},audio:sound.snapshot(),dpr:view.renderer.getPixelRatio(),equipped:w.equipped,trees:forest.count,burned:w.trees.filter(t=>t.dead).length,burning:w.trees.filter(t=>t.burn>0).length,grenades:w.grenades.length,vfx:vfx.counts(),units:w.units.map(u=>({...u,path:u.path.length})),target:w.target,mission:w.mission,campaign:{mission:campaign.mission,credits:campaign.credits,roster:campaign.roster,history:campaign.history},fortified:w.fortified});
 function step(){tick(w);if(w.mission&&w.mission.status!=='active'&&mode==='battle'){result=finishMission(campaign,w);mode='debrief';showScreen();save();}}
 const project3=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(view.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};};
 // Measures the camera tilt the way it is actually seen: how far up-screen a tree's canopy sits
 // from its own trunk base. Zero means the camera is vertical whatever the config claims.
 const tiltReport=()=>{const samples=[];for(const t of w.trees){if(t.height<3)continue;const b=project3(t.x,0,t.z);if(b.x<24||b.x>innerWidth-24||b.y<60||b.y>innerHeight-60)continue;const a=project3(t.x,t.height,t.z);const dx=a.x-b.x,dy=a.y-b.y;samples.push({x:+t.x.toFixed(2),z:+t.z.toFixed(2),h:+t.height.toFixed(2),dx:+dx.toFixed(2),dy:+dy.toFixed(2),px:+Math.hypot(dx,dy).toFixed(2),pxPerMetre:+(Math.hypot(dx,dy)/t.height).toFixed(3)});if(samples.length>=60)break;}
  const up=samples.filter(s=>s.dy<0).length;
  return {pitchDegrees:+(Math.atan2(view.camera.position.z,view.camera.position.y)*180/Math.PI).toFixed(3),fov:view.camera.fov,cameraHeight:+view.camera.position.y.toFixed(2),cameraZ:+view.camera.position.z.toFixed(2),worldOffsetPerMetre:+Math.tan(Math.atan2(view.camera.position.z,view.camera.position.y)).toFixed(4),samples,count:samples.length,fractionUpScreen:samples.length?+(up/samples.length).toFixed(3):0,minPx:samples.length?+Math.min(...samples.map(s=>s.px)).toFixed(2):0,medianPx:samples.length?+samples.map(s=>s.px).sort((a,b)=>a-b)[samples.length>>1].toFixed(2):0};};
 if(testing)window.tinpotTest={tilt:tiltReport,freeze(){paused=true;},move(x,z){orderMove(w,x,z);},advance(n){for(let i=0;i<n;i++)if(mode==='battle')step();else if(mode==='title'){tick(w);attract.update(snapshot());}return snapshot();},fixture(name){mode='battle';paused=false;if(name==='title'){campaign=newCampaign();mode='title';demo();showScreen();return snapshot();}if(name==='campaign'){campaign=newCampaign();fillSquad(campaign,MISSIONS[0].count);load(campaignWorld(campaign,{resume:false}));showScreen();}else{load(createWorld({count:name==='art'?0:name==='m2'||name==='m3'?1:4,enemies:name==='art'||name==='m2'?0:name==='m3'?1:4}));w.art=name==='art';w.equipped=name==='m5'?['rifle','grenade']:['rifle'];}screens.show(mode);return snapshot();},save,project(x,z,y=0){return project3(x,y,z);}};
 function frame(t=0){const dt=Math.min((t-last)/1000,.1);acc+=dt;last=t;while(acc>=STEP){if(!paused&&mode==='battle')step();else if(mode==='title'||mode==='settings'){tick(w);attract.update(snapshot());}acc-=STEP;}terrain.update(w.time,w);forest.update(w);props.update();fire.update(w);actors.update(w,paused?0:dt);vfx.update(w,paused?0:dt);if(w.target){marker.visible=true;marker.position.set(w.target.x,.04,w.target.z);}hud.update({hidden:mode!=='battle'||w.art,location:w.map.name,objective:w.mission?.objective,time:Math.floor(w.mission?.type==='hold'?Math.max(0,w.mission.duration-w.mission.elapsed):w.time),units:w.units.filter(u=>u.team==='blue'&&!u.escort).map(u=>({id:u.id,name:u.name,hp:u.hp,maxHp:u.maxHp,active:u.active,weapon:u.weapon})),equipped:w.equipped,kills:w.units.filter(u=>u.team==='red'&&u.hp<=0).length,losses:w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp<=0).length,paused,hint:w.units.some(u=>u.team==='blue'&&u.active&&u.weapon==='grenade')?'TAP TO LOB · SWITCH TO RIFLE TO MARCH':undefined});sound.update(w,dt,paused||!['battle','title'].includes(mode));view.draw();frames++;if(!window.__ready){window.__ready=window.__TINPOT_BOOTED__=true;document.getElementById('boot').classList.add('hidden');}window.tinpot=snapshot();if(mode==='battle'&&w.mission&&w.time-lastSave>5){save();lastSave=w.time;}requestAnimationFrame(frame);}frame();
} catch(e){window.tinpotBootFail(e.message);throw e;}
