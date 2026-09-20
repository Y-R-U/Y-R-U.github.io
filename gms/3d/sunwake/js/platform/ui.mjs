import {ATLAS,islandName} from '../core/content.mjs';
import {courseTo} from '../core/exploration.mjs';
const $=id=>document.getElementById(id);
// Original code-drawn postcard illustrations: no downloads or runtime image generation.
export function drawPostcard(canvas,page){
 const c=canvas.getContext('2d'),w=canvas.width=480,h=canvas.height=240;
 const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#a993a3');g.addColorStop(.65,'#efba94');g.addColorStop(1,'#306672');c.fillStyle=g;c.fillRect(0,0,w,h);
 c.fillStyle='#fff0ca';c.beginPath();c.arc(363,63,22,0,Math.PI*2);c.fill();
 c.fillStyle='#51757a';c.fillRect(0,178,w,62);
 for(let i=0;i<8;i++){c.fillStyle=i%2?'#74908a':'#658486';c.fillRect(0,183+i*7,w,1);}
 c.fillStyle='#64736b';c.beginPath();c.moveTo(52,190);c.lineTo(102,167);c.lineTo(171,154);c.lineTo(212,120);c.lineTo(287,139);c.lineTo(346,169);c.lineTo(416,190);c.closePath();c.fill();
 c.fillStyle='#e0ca9c';const rect=(x,y,w,h)=>c.fillRect(x,y,w,h),tri=(x,y,w,h)=>{c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x+w/2,y);c.lineTo(x,y-h);c.closePath();c.fill();};
 if(page.art==='lantern'){rect(226,77,24,82);rect(220,68,36,12);c.fillStyle='#ffe6a0';rect(229,57,18,13);tri(238,57,42,13);}
 if(page.art==='bells'){rect(181,94,9,73);rect(290,94,9,73);rect(179,91,122,10);c.fillStyle='#d7a85b';for(let i=0;i<3;i++){rect(201+i*33,101,2,16+i*4);tri(203+i*33,140+i*4,23,25);}}
 if(page.art==='crown'){tri(209,161,52,107);tri(269,168,57,118);}
 if(page.art==='cinder'){c.fillStyle='#ae7250';for(let i=0;i<3;i++)rect(150+i*20,157-i*13,155-i*32,14);c.fillStyle='#ffe3a0';tri(229,121,25,34);}
 if(page.art==='needle')tri(236,166,35,128);
 if(page.art==='orchard'){c.fillStyle='#334e47';for(let i=0;i<6;i++)tri(158+i*31,166+Math.abs(i-2)*3,23,53+(i%3)*12);}
 c.fillStyle='#e4c39c';c.fillRect(75,189,325,3);
}
export function createUI({getState,getExploration,world,onChart,onPin,onSettings,onRestart}){
 let last=-Infinity,lastChart=-Infinity,localChart=false,signature='';
 // Reused every HUD tick: no per-frame allocation on the 10 Hz path.
 const courseIslands=[],course={};
 let closingFrom=null,closingAt=-Infinity,closing=0;
 const cards=$('cards');
 for(const page of ATLAS){const card=document.createElement('article');card.className='atlas-card';card.dataset.id=page.id;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',page.landmark+' illustration');drawPostcard(canvas,page);card.append(canvas);
  const number=document.createElement('small');number.textContent='PAGE '+String(page.number).padStart(2,'0');card.append(number);
  const title=document.createElement('h3');title.textContent=page.landmark;card.append(title);
  const copy=document.createElement('p');copy.textContent=page.postcard;card.append(copy);
  const button=document.createElement('button');button.textContent='Pin on compass ◇';button.onclick=()=>{onPin(page.id);refreshCards();};card.append(button);cards.append(card);
 }
 function refreshCards(){const e=getExploration();for(const card of cards.children){const known=e.atlasIds.includes(card.dataset.id);card.classList.toggle('undiscovered',!known);card.querySelector('p').hidden=!known;card.querySelector('button').textContent=e.pin===card.dataset.id?'Pinned on compass ◆':known?'Revisit · pin ◇':'Set course ◇';}
  $('atlas-count').textContent=e.atlasIds.length+' / 6';$('chart-title').textContent=e.complete?"The chart ends. The sea doesn't.":'An atlas of the last light.';
 }
 const name=(list,id)=>{const i=(list||[]).find(v=>v.id===id);return i?(i.landmark||islandName(i)):'an island';};
 function chart(){const s=getState(),e=getExploration(),canvas=$('chart-map'),c=canvas.getContext('2d');const w=canvas.width=800,h=canvas.height=440;
  c.fillStyle='#123e49';c.fillRect(0,0,w,h);const scale=localChart?.28:.23,cx=localChart?s.x:150,cz=localChart?s.z:150;
  const xy=(x,z)=>[w/2+(x-cx)*scale,h/2-(z-cz)*scale];
  c.strokeStyle='#fff0d013';c.lineWidth=1;for(let x=0;x<w;x+=44){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=44){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  c.fillStyle='#fff0d080';c.font='12px system-ui';c.fillText('N ↑',18,26);c.fillText(localChart?'LOCAL WATERS · 500 m':'APRICOT PASSAGE · 500 m',18,h-18);c.fillRect(18,h-40,500*scale,1);
  const ordinary=world.nearby(s.x,s.z,1000,[]).filter(i=>!i.landmark),recorded=new Map(e.ordinaryVisits.map(i=>[i.id,i]));
  for(const i of ordinary)recorded.set(i.id,{...i,name:islandName(i)});
  for(const i of recorded.values()){const [x,y]=xy(i.x,i.z);c.fillStyle='#88a194';c.beginPath();c.arc(x,y,(i.radius||35)*scale,0,Math.PI*2);c.fill();if(e.ordinaryVisits.some(v=>v.id===i.id)){c.font='10px system-ui';c.fillText(i.name,x+8,y-8);}}
  for(const page of ATLAS){const [rx,ry]=xy(page.x,page.z),x=Math.max(14,Math.min(w-14,rx)),y=Math.max(14,Math.min(h-14,ry)),known=e.atlasIds.includes(page.id);
   c.strokeStyle=page.id===e.pin?'#ffc078':'#e0d3b3';c.fillStyle=known?'#d5b988':'#123e49';c.lineWidth=page.id===e.pin?3:1;c.beginPath();c.moveTo(x,y-7);c.lineTo(x+7,y);c.lineTo(x,y+7);c.lineTo(x-7,y);c.closePath();c.fill();c.stroke();
   c.fillStyle='#fff0d0';c.font='12px system-ui';c.fillText(page.landmark,Math.min(w-100,x+12),y+4);
  }
  const [rx,ry]=xy(s.x,s.z),x=Math.max(10,Math.min(w-10,rx)),y=Math.max(10,Math.min(h-10,ry));c.save();c.translate(x,y);c.rotate(s.yaw);c.fillStyle='#fff4d5';c.beginPath();c.moveTo(0,-10);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();c.restore();
  $('voyage-stats').textContent=(e.distanceM/1000).toFixed(2)+' km sailed · '+e.visitCount+' island visits recorded';
 }
 $('chart-open').onclick=()=>onChart(true);$('chart-close').onclick=()=>onChart(false);$('map-toggle').onclick=()=>{localChart=!localChart;$('map-toggle').textContent=localChart?'Show atlas waters':'Follow the boat';chart();};
 $('settings-open').onclick=()=>onSettings(true);$('settings-close').onclick=()=>onSettings(false);
 $('restart').onclick=()=>{$('restart-confirm').hidden=false;};$('restart-no').onclick=()=>{$('restart-confirm').hidden=true;};$('restart-yes').onclick=()=>{$('restart-confirm').hidden=true;onRestart();};
 return {refreshCards,chart,notice(text){$('notice').textContent=text;$('notice').hidden=false;},
  postcard(id){const page=ATLAS.find(i=>i.id===id);$('discovery-title').textContent=page.landmark;$('discovery-copy').textContent=page.postcard;$('discovery').hidden=false;refreshCards();},
  course:()=>course,
  update(now,force=false){if(!force&&now-last<.1)return;last=now;const s=getState(),e=getExploration(),page=ATLAS.find(i=>i.id===e.pin);
   $('chart-open').textContent='Atlas '+e.atlasIds.length+'/6';$('course').hidden=s.mode!=='water'||s.fixture;
   if(page){
    // The arrow must point somewhere a boat can actually go. A straight bearing
    // through the island you are moored against is what made the second leg feel
    // like a broken waypoint, so the course is routed around any blocking shore.
    world.nearby(s.x,s.z,Math.min(1200,Math.hypot(page.x-s.x,page.z-s.z)+120),courseIslands);
    courseTo(s,page,courseIslands,undefined,course);
    const distance=course.distance,angle=course.bearing-s.yaw;
    // Closing rate over a two-second window: on a long empty leg this is the
    // only way to tell a correct course from a plausible one. Measured in
    // SIMULATION time — wall time disagrees with it whenever the game is
    // stepped by the test harness, or stalls, and the readout then lies.
    const clock=Number.isFinite(s.time)?s.time:now;
    if(e.pin!==course.pinWas){closing=0;closingFrom=distance;closingAt=clock;course.pinWas=e.pin;}
    else if(closingFrom===null){closing=0;closingFrom=distance;closingAt=clock;}
    else if(clock-closingAt>2||clock<closingAt){closing=(closingFrom-distance)/Math.max(.001,clock-closingAt);closingFrom=distance;closingAt=clock;}
    const trend=Math.abs(closing)<.3?'holding':closing>0?'closing':'opening';
    $('course-name').textContent=page.landmark;
    $('course-distance').textContent=Math.round(distance)+' m to shore · '+trend;
    $('course-arrow').style.transform=`rotate(${angle}rad)`;
    $('course-arrow').style.color=course.blocked?'#ffb3a0':'';
   }else{closingFrom=null;course.goal=null;course.blocked=null;$('course-name').textContent='Beyond the chart';$('course-distance').textContent=(e.distanceM/1000).toFixed(2)+' km sailed';$('course-arrow').style.transform='none';$('course-arrow').style.color='';}
   const blocker=course.blocked&&courseIslands.find(i=>i.id===course.blocked);
   $('approach').textContent=
    s.aground?'Aground'+(blocker||s.agroundOn?' on '+name(courseIslands,s.agroundOn||course.blocked):'')+' — astern to back off, then steer round it.'
    :e.dwellId?'Hold this slow pace · '+Math.min(100,Math.round(e.dwell/2*100))+'%'
    :course.blocked?name(courseIslands,course.blocked)+' is across the course — the arrow leads round it.'
    :page&&Math.hypot(page.x-s.x,page.z-s.z)<page.radius+80?'Ease below 5.8 kn. Stay close for 2 seconds.'
    :e.atlasIds.length===0?'Follow the pin. Slow beside Lantern Key.'
    :page?'Hold the arrow. '+page.landmark+' is '+Math.round(course.distance)+' m off.'
    :'Six places. Take your time.';
   const sig=e.atlasIds.join('|')+e.pin;if(sig!==signature){signature=sig;refreshCards();}
   if(s.mode==='chart'&&(force||now-lastChart>=.5)){lastChart=now;chart();}
  }};
}
