import {createChatter} from '../core/chatter.mjs';

// All lines are shipped files. The running game never contacts the TTS service.
export async function createSpeech(sound){
 let manifest={clips:[],cast:{}};
 try{const response=await fetch('audio/voices/manifest.json');if(response.ok)manifest=await response.json();}catch{}
 const director=createChatter(manifest.clips),cache=new Map(),inflight=new Map();
 let context,gain,source,current=null,epoch=0,loading=false,unlocked=false,scene=null,world=null;
 let wave=0,burned=0,lastCount=0,nextIdle=0,lastCombat=-Infinity,lastOrder=-Infinity,lastAt=0,lastLine=null;
 let spoken=0,failed=0,duck=0,speakerKey='',suspended=false,history=[];
 const now=()=>performance.now()/1000;
 const live=w=>w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0);
 function markSpeaker(){
  const key=current?`${current.unit}:${current.clip.id}`:'';if(key===speakerKey)return;speakerKey=key;
  for(const card of document.querySelectorAll('.unit-card')){
   const speaking=current?.unit!=null&&card.querySelector('.unit-toggle')?.dataset.id===String(current.unit);
   card.classList.toggle('on-radio',!!speaking);
   if(speaking)card.setAttribute('title',current.clip.text);else card.removeAttribute('title');
  }
 }
 function stop(clear=true){epoch++;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}loading=false;current=null;if(clear)director.clear();markSpeaker();}
 function unlock(){
  if(!context){context=new AudioContext();gain=context.createGain();gain.connect(context.destination);}
  context.resume().then(()=>{unlocked=context.state==='running';}).catch(()=>{});
 }
 addEventListener('pointerup',unlock);addEventListener('keydown',unlock);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();context?.suspend().catch(()=>{});}else if(unlocked)context?.resume().catch(()=>{});});
 addEventListener('pagehide',()=>stop());
 async function buffer(clip){
  if(cache.has(clip.id)){const b=cache.get(clip.id);cache.delete(clip.id);cache.set(clip.id,b);return b;}
  if(inflight.has(clip.id))return inflight.get(clip.id);
  const task=(async()=>{const response=await fetch('audio/voices/'+clip.file);if(!response.ok)throw Error('Voice asset '+response.status);
   const decoded=await context.decodeAudioData(await response.arrayBuffer());cache.set(clip.id,decoded);
   while(cache.size>16)cache.delete(cache.keys().next().value);return decoded;})();
  inflight.set(clip.id,task);try{return await task;}finally{inflight.delete(clip.id);}
 }
 async function play(q,w){
  stop(false);current=q;loading=true;const ticket=epoch;
  try{const b=await buffer(q.clip);
   if(ticket!==epoch||document.hidden||suspended||sound.settings().voice===0||q.expires<=now()||(q.unit!=null&&!w.units.some(u=>u.id===q.unit&&u.hp>0))){if(ticket===epoch)stop(false);return;}
   loading=false;source=context.createBufferSource();source.buffer=b;source.connect(gain);gain.gain.value=sound.settings().voice;
   lastAt=now();lastLine={id:q.clip.id,text:q.clip.text,speaker:q.unit==null?manifest.cast[q.voice]?.name:w.units.find(u=>u.id===q.unit)?.name,event:q.event};
   history=[...history.slice(-11),{...lastLine,at:lastAt}];spoken++;markSpeaker();source.start();
   source.onended=()=>{if(ticket!==epoch)return;source.disconnect();source=null;current=null;director.ended(now());markSpeaker();};
  }catch{if(ticket===epoch){failed++;stop(false);director.ended(now());}}
 }
 function offer(event,w,options={}){if(document.hidden||sound.settings().voice===0)return false;return director.offer(event,w,now(),options);}
 function enter(mode,w,campaign,result){
  stop();scene=mode;world=w;wave=w.mission?.wave||0;burned=w.trees.filter(t=>t.dead).length;lastCount=live(w).length;
  lastCombat=lastOrder=now();nextIdle=now()+16+Math.random()*8;
  if(mode==='briefing')offer('brief'+Math.min(campaign.mission,5),w,{voice:'general',priority:80,ttl:20,delay:.25});
  if(mode==='battle'){
   if(w.mission?.type==='escort'){const inspector=w.units.find(u=>u.escort&&u.hp>0);if(inspector)offer('arrival',w,{unit:inspector.id,priority:35,ttl:8,delay:.4});}
   else offer('deploy',w,{voice:'general',priority:35,ttl:6,delay:.4});
  }
  if(mode==='barracks')offer('barracks',w,{voice:'general',priority:40,ttl:6,delay:.3});
  if(mode==='debrief')offer(campaign.mission>=6&&result?.win?'complete':result?.win?'win':'defeat',w,{voice:'general',priority:100,ttl:20,delay:.45});
 }
 function command(event,w,unit=null){if(suspended)return;lastOrder=now();return offer(event,w,{unit,priority:70,ttl:2.8,active:event==='hold'?false:event==='join'?true:null});}
 return {
  command,offer,reset(){stop();world=null;},stop,
  update(w,events,dt,mode,paused,campaign,result){
   if(scene!==mode||world!==w)enter(mode,w,campaign,result);
   suspended=!!paused||document.hidden||['title','settings'].includes(mode)||sound.settings().voice===0;
   if(suspended){stop();duck=0;return;}
   if(current?.unit!=null&&!w.units.some(u=>u.id===current.unit&&u.hp>0))stop(false);
   const t=now(),soldiers=live(w);
   if(mode==='battle'){
    for(const e of events){
     if(w.time-e.time>.7)continue;
     if(['shot','hit','death','explosion','flame'].includes(e.type))lastCombat=t;
     if(e.type==='order'){
      lastOrder=t;const crew=soldiers.filter(u=>u.active);
      if(crew.length){const blocked=crew.every(u=>!u.path.length&&Math.hypot(u.x-e.x,u.z-e.z)>3);offer(blocked?'blocked':'move',w,{priority:60,ttl:2.5});}
     }
     if(e.type==='arm')offer('arm',w,{unit:soldiers.find(u=>u.active&&u.weapon==='grenade')?.id??null,priority:92,ttl:2});
     if(e.type==='disarm'&&!e.reason)offer('cancel',w,{priority:92,ttl:2.5});
     if(e.type==='hit'&&e.team==='blue'){
      const u=w.units.find(u=>u.id===e.unit);
      const friendly=w.units.find(v=>v.team==='blue'&&v.id!==u?.id&&u?.hurtFrom&&Math.hypot(v.x-u.hurtFrom.x,v.z-u.hurtFrom.z)<.1);
      offer(friendly?'friendly':'hurt',w,{unit:e.unit,priority:friendly?94:80,ttl:2});
     }
     if(e.type==='death'&&e.team==='blue')offer('loss',w,{voice:'general',priority:85,ttl:5,delay:.8});
     if(e.type==='death'&&e.team==='red'&&Math.random()<.55)offer('kill',w,{priority:30,ttl:2});
    }
    const burning=soldiers.find(u=>u.onFire>0);if(burning)offer('fire',w,{unit:burning.id,priority:95,ttl:2});
    if(lastCount>1&&soldiers.length===1)offer('last',w,{voice:'general',priority:88,ttl:6,delay:1});lastCount=soldiers.length;
    if((w.mission?.wave||0)>wave){wave=w.mission.wave;offer('wave',w,{voice:'general',priority:75,ttl:5});}
    const charred=w.trees.filter(tree=>tree.dead).length;
    if(charred-burned>=15){burned=charred;offer('forest',w,{voice:'general',priority:25,ttl:2});}
    if(w.mission&&w.mission.limit-w.mission.elapsed<20&&w.mission.type!=='hold')offer('time',w,{voice:'general',priority:75,ttl:4});
    const inspector=w.units.find(u=>u.escort&&u.hp>0);
    if(inspector&&soldiers.length&&soldiers.every(u=>Math.hypot(u.x-inspector.x,u.z-inspector.z)>=8))offer('lost',w,{unit:inspector.id,priority:72,ttl:4});
    if(t>=nextIdle){nextIdle=t+20+Math.random()*12;
     if(t-lastCombat>5&&t-lastOrder>4){const speaker=inspector&&Math.random()<.45?inspector:soldiers[Math.floor(Math.random()*soldiers.length)];if(speaker)offer('idle',w,{unit:speaker.id,priority:10,ttl:1.8});}
    }
   }
   if(gain)gain.gain.value=sound.settings().voice;
   if(unlocked&&context.state==='running'&&!loading){const q=director.take(w,t,current);if(q)play(q,w);}
   duck+=(current&&!loading?1-duck:-duck)*Math.min(1,dt*9);
  },
  duck(){return duck;},
  snapshot(){return {available:manifest.clips.length,unlocked,speaking:!!source,loading,spoken,failed,cache:cache.size,duck,last:lastLine,current:current&&{id:current.clip.id,event:current.event,unit:current.unit,priority:current.priority},history:[...history],...director.snapshot()};}
 };
}
