export async function createAudio(){
 const tracks=await(await fetch('audio/music/tracks.json')).json();let context,unlocked=false,cue=null,voices=[],lastEvent=0,fireTimer=0,sfxCount=0;
 let settings={music:.45,sfx:.6,voice:.85};try{const stored=JSON.parse(localStorage.getItem('tinpot.audio'));if(stored)for(const k of ['music','sfx','voice'])if(Number.isFinite(stored[k]))settings[k]=Math.max(0,Math.min(1,stored[k]));}catch{}
 // One Audio element per track, kept forever. Creating a fresh one per cue and clearing its
 // src on fade-out aborts an in-flight media fetch (net::ERR_ABORTED) — which is exactly what
 // instant retry does: defeat music starts, you tap Again, and the download is cancelled.
 const pool={};
 function playCue(){if(!unlocked||!cue)return;for(const v of voices)v.target=0;const data=tracks[cue];let el=pool[cue];
  if(!el){el=pool[cue]=new Audio('audio/music/'+data.file);el.loop=data.loop!==false;el.volume=0;if(data.startAt)el.addEventListener('loadedmetadata',()=>{el.currentTime=data.startAt;},{once:true});}
  const existing=voices.find(v=>v.el===el);if(existing){existing.target=1;el.play().catch(()=>{});return;}
  try{el.currentTime=data.startAt||0;}catch{}
  voices.push({el,gain:0,target:1});el.play().catch(()=>{});}
 function change(next){if(cue===next)return;cue=next;playCue();}
 function unlock(){if(unlocked)return;unlocked=true;context=new AudioContext();context.resume().catch(()=>{});playCue();}
 addEventListener('pointerup',unlock,{once:true});addEventListener('keydown',unlock,{once:true});
 function effect(type){if(!context||!unlocked||settings.sfx===0)return;const now=context.currentTime,gain=context.createGain();gain.connect(context.destination);const loud=type==='explosion'?.28:type==='death'?.14:type==='fire'?.025:.08;gain.gain.setValueAtTime(loud*settings.sfx,now);const duration=type==='explosion'?.65:type==='death'?.28:type==='fire'?.5:.07;gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
 let source;if(type==='death'||type==='explosion'){source=context.createOscillator();source.type=type==='death'?'triangle':'sine';source.frequency.setValueAtTime(type==='death'?650:110,now);source.frequency.exponentialRampToValueAtTime(type==='death'?140:25,now+duration);}else{const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);source=context.createBufferSource();source.buffer=buffer;}source.connect(gain);source.start(now);source.stop(now+duration);source.onended=()=>{source.disconnect();gain.disconnect();};sfxCount++;}
 return {change,reset(){lastEvent=0;},settings(){return {...settings};},set(key,value){if(!['music','sfx','voice'].includes(key))return;settings[key]=Math.max(0,Math.min(1,value));try{localStorage.setItem('tinpot.audio',JSON.stringify(settings));}catch{}},update(w,dt,paused,speechDuck=0){for(let i=voices.length-1;i>=0;i--){const v=voices[i];v.gain+=(v.target-v.gain)*Math.min(1,dt*3);v.el.volume=Math.max(0,Math.min(1,v.gain*settings.music*(paused?.35:1)*(1-.72*speechDuck)));if(v.target===0&&v.gain<.005){v.el.pause();voices.splice(i,1);}}for(const e of w.events){if(e.id<=lastEvent)continue;lastEvent=e.id;if(!paused&&w.time-e.time<.2&&['shot','death','explosion'].includes(e.type))effect(e.type);}fireTimer-=dt;if(fireTimer<0&&!paused&&w.trees.some(t=>t.burn>0)){fireTimer=.5;effect('fire');}},snapshot(){return {cue,unlocked,voices:voices.map(v=>({file:v.el.currentSrc,time:v.el.currentTime,paused:v.el.paused,volume:v.el.volume,ready:v.el.readyState})),sfxCount,settings:{...settings}};}};
}
