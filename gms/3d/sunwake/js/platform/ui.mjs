import {ATLAS,islandName} from '../core/content.mjs';
import {courseTo} from '../core/exploration.mjs';
import {waterKind} from '../core/fishing.mjs';
import {UPGRADES,UPGRADE_KEYS,boardFor,eligibility,dayOf,canBuy,upgradeCost,chartRange,jobRange,
  DELIVERY_RANGE,VISIT_RANGE,MAX_ACTIVE} from '../core/jobs.mjs';
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
export function createUI({getState,getExploration,world,onChart,onPin,onSettings,onRestart,
  getJobs,getBerth,getFollow,getFishingLevel,onBoard,onTake,onDrop,onFollow,onBuy}){
 let last=-Infinity,lastChart=-Infinity,localChart=false,signature='';
 let boardIsland=null,boardDay=0;
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
  // A bought chart is literally a bigger chart: it draws more sea around the
  // boat and finds the ordinary islands further out. CHART_RANGE[0] is 1000 m,
  // which is exactly what was hard-coded here before any of this existed, so a
  // stock chart is pixel-identical to the one Aaron already sailed with.
  const range=chartRange(getJobs?.()||null);
  c.fillStyle='#123e49';c.fillRect(0,0,w,h);const scale=localChart?.28*(1000/range):.23,cx=localChart?s.x:150,cz=localChart?s.z:150;
  const xy=(x,z)=>[w/2+(x-cx)*scale,h/2-(z-cz)*scale];
  c.strokeStyle='#fff0d013';c.lineWidth=1;for(let x=0;x<w;x+=44){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=44){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  c.fillStyle='#fff0d080';c.font='12px system-ui';c.fillText('N ↑',18,26);c.fillText((localChart?'LOCAL WATERS':'APRICOT PASSAGE')+' · 500 m · '+range+' m chart',18,h-18);c.fillRect(18,h-40,500*scale,1);
  const ordinary=world.nearby(s.x,s.z,range,[]).filter(i=>!i.landmark),recorded=new Map(e.ordinaryVisits.map(i=>[i.id,i]));
  for(const i of ordinary)recorded.set(i.id,{...i,name:islandName(i)});
  for(const i of recorded.values()){const [x,y]=xy(i.x,i.z);c.fillStyle='#88a194';c.beginPath();c.arc(x,y,(i.radius||35)*scale,0,Math.PI*2);c.fill();if(e.ordinaryVisits.some(v=>v.id===i.id)){c.font='10px system-ui';c.fillText(i.name,x+8,y-8);}}
  for(const page of ATLAS){const [rx,ry]=xy(page.x,page.z),x=Math.max(14,Math.min(w-14,rx)),y=Math.max(14,Math.min(h-14,ry)),known=e.atlasIds.includes(page.id);
   c.strokeStyle=page.id===e.pin?'#ffc078':'#e0d3b3';c.fillStyle=known?'#d5b988':'#123e49';c.lineWidth=page.id===e.pin?3:1;c.beginPath();c.moveTo(x,y-7);c.lineTo(x+7,y);c.lineTo(x,y+7);c.lineTo(x-7,y);c.closePath();c.fill();c.stroke();
   c.fillStyle='#fff0d0';c.font='12px system-ui';c.fillText(page.landmark,Math.min(w-100,x+12),y+4);
  }
  // Where the job wants you. Drawn after the atlas so it is never underneath a
  // landmark diamond, and clamped to the edge so an off-chart destination still
  // tells you which way it lies.
  const following=getFollow?.();
  if(following){
   const [jx,jy]=xy(following.goal.x,following.goal.z);
   const x=Math.max(12,Math.min(w-12,jx)),y=Math.max(12,Math.min(h-12,jy));
   c.strokeStyle='#ffc078';c.lineWidth=2;c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.stroke();
   c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke();
   c.fillStyle='#ffc078';c.font='12px system-ui';
   c.fillText(following.name,Math.min(w-110,x+13),y+4);
  }
  const [rx,ry]=xy(s.x,s.z),x=Math.max(10,Math.min(w-10,rx)),y=Math.max(10,Math.min(h-10,ry));c.save();c.translate(x,y);c.rotate(s.yaw);c.fillStyle='#fff4d5';c.beginPath();c.moveTo(0,-10);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();c.restore();
  $('voyage-stats').textContent=(e.distanceM/1000).toFixed(2)+' km sailed · '+e.visitCount+' island visits recorded';
 }
 // The active jobs, on the water, where they are needed. Followed first.
 function paintLogbook(jobs,follow,sailing,s){
  const host=$('logbook');
  if(!sailing||!jobs||!jobs.active.length){host.hidden=true;host.textContent='';return;}
  // Rebuilt only when something a reader would notice changes: which jobs are in
  // hand, their progress, which one is followed, and the range to the nearest
  // 5 m. At 10 Hz over three short rows this is far cheaper than it looks.
  const key=jobs.active.map(j=>j.kind+j.id+j.progress+'@'+Math.round(jobRange(j,s)/5)).join('~')+'|'+(follow?follow.job.id:'');
  if(key===host.dataset.key)return;
  host.dataset.key=key;host.textContent='';host.hidden=false;
  for(const job of jobs.active){
   const row=document.createElement('div');
   row.className='entry'+(follow&&follow.job.id===job.id?' followed':'');
   const title=document.createElement('b');title.textContent=job.title;row.append(title);
   const detail=document.createElement('i');
   detail.textContent=job.kind==='catch'
    ?`${job.progress}/${job.count} landed · ◎ ${job.coins}`
    :`${Math.max(0,Math.round(jobRange(job,s)))} m to ${job.targetName} · ◎ ${job.coins}`;
   row.append(detail);host.append(row);
  }
 }
 // ---- the job board -------------------------------------------------------
 // Rebuilt from scratch every time it is opened. Three jobs, the logbook, the
 // chandlery. Nothing is hidden: a job you cannot take is drawn greyed with a
 // button that says why.
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const KIND_LABEL={cargo:'CARGO',catch:'CATCH',visit:'PASSAGE'};
 function jobCard(job,verdict,taken){
  const card=el('article','job'+(verdict.ok?'':' blocked'));
  card.dataset.id=job.id;card.dataset.kind=job.kind;
  card.append(el('span','kind',KIND_LABEL[job.kind]||job.kind.toUpperCase()));
  card.append(el('h4',null,job.title));
  card.append(el('p',null,job.detail));
  card.append(el('span','pay','◎ '+job.coins));
  // The button IS the reason. Aaron asked for ineligible jobs to be shown with
  // why, not hidden — so the thing you would have clicked tells you instead.
  const button=el('button',null,verdict.ok?'Take this job ↗':verdict.reason);
  button.disabled=!verdict.ok;
  if(!verdict.ok)button.title=verdict.reason;
  button.dataset.action='take';button.dataset.reason=verdict.ok?'':verdict.reason;
  if(verdict.ok)button.onclick=()=>{onTake?.(job);board();};
  card.append(button);
  if(taken)card.append(el('p','why','In your logbook'));
  return card;
 }
 function activeCard(job,followId){
  const card=el('article','job'+(followId===job.id?' followed':''));
  card.dataset.id=job.id;
  card.append(el('span','kind',KIND_LABEL[job.kind]||job.kind.toUpperCase()));
  card.append(el('h4',null,job.title));
  card.append(el('p',null,job.kind==='catch'
   ?`${job.progress} of ${job.count} landed. Any water will do.`
   :`Alongside ${job.targetName}. ${Math.round(job.distance)} m from ${job.from}.`));
  if(job.kind==='catch'){const bar=el('div','bar');const fill=el('i');fill.style.setProperty('--fill',Math.round(100*job.progress/job.count)+'%');bar.append(fill);card.append(bar);}
  card.append(el('span','pay','◎ '+job.coins+' on delivery'));
  const row=el('div','row');
  if(job.kind!=='catch'){
   const follow=el('button',null,followId===job.id?'Following ◆':'Follow ◇');
   follow.dataset.action='follow';
   follow.onclick=()=>{onFollow?.(followId===job.id?null:job.id);board();};
   row.append(follow);
  }
  const drop=el('button',null,'Give up');
  drop.dataset.action='drop';
  drop.onclick=()=>{onDrop?.(job.id);board();};
  row.append(drop);card.append(row);
  return card;
 }
 function shopCard(key,jobs){
  const spec=UPGRADES[key],level=jobs.upgrades[key]||1,verdict=canBuy(jobs,key),next=upgradeCost(key,level);
  const card=el('article','job'+(verdict.ok?'':' blocked'));
  card.dataset.key=key;
  card.append(el('span','kind',spec.name.toUpperCase()+' · '+level+' / '+spec.max));
  // The heading is what you would be buying, not what you already own.
  card.append(el('h4',null,level>=spec.max?spec.detail[level-1]:spec.detail[level]));
  card.append(el('p',null,level>=spec.max?'Nothing more to add.':'Now: '+spec.detail[level-1]));
  card.append(el('span','pay',next==null?'—':'◎ '+next));
  const button=el('button',null,verdict.ok?'Buy ↗':verdict.reason);
  button.disabled=!verdict.ok;button.dataset.action='buy';button.dataset.reason=verdict.ok?'':verdict.reason;
  if(verdict.ok)button.onclick=()=>{onBuy?.(key);board();};
  card.append(button);
  return card;
 }
 /** Repaint the whole board from the island the boat is berthed at. */
 function board(){
  const jobs=getJobs?.();const berth=getBerth?.();
  const island=berth?.island||boardIsland;
  if(!jobs||!island)return false;
  boardIsland=island;boardDay=dayOf(jobs.seconds);
  const s=getState();
  $('board-title').textContent=islandName(island);
  $('board-day').textContent='DAY '+(boardDay+1);
  $('board-coins').textContent='◎ '+jobs.coins;
  const shore=Math.hypot(s.x-island.x,s.z-island.z)-island.radius;
  const water=waterKind(shore);
  $('board-water').textContent=(island.landmark?'A harbour on '+island.landmark+'. ':'A small landing. ')
   +(water==='reef'?'Reef water right off the pier — the best fishing you will find.'
    :water==='shore'?'Inshore water here — better fishing than the open sea.'
    :'Open water off the head.')
   +` ${jobs.completed} job${jobs.completed===1?'':'s'} done · ${jobs.active.length}/${MAX_ACTIVE} in hand.`;
  const level=getFishingLevel?.()||1;
  const listing=boardFor(island,boardDay);
  const jobsHost=$('board-jobs');jobsHost.textContent='';
  if(!listing.length)jobsHost.append(el('p','empty','Nothing wanted here today.'));
  for(const job of listing){
   const taken=jobs.active.some(a=>a.id===job.id);
   jobsHost.append(jobCard(job,eligibility(job,{fishingLevel:level,upgrades:jobs.upgrades,active:jobs.active}),taken));
  }
  const activeHost=$('board-active');activeHost.textContent='';
  const followId=getFollow?.()?.job?.id||null;
  if(!jobs.active.length)activeHost.append(el('p','empty','Your logbook is empty. Take something off the board.'));
  for(const job of jobs.active)activeHost.append(activeCard(job,followId));
  const shopHost=$('board-shop');shopHost.textContent='';
  for(const key of UPGRADE_KEYS)shopHost.append(shopCard(key,jobs));
  return true;
 }
 $('berth-open').onclick=()=>onBoard?.(true);
 $('board-close').onclick=()=>onBoard?.(false);
 $('chart-open').onclick=()=>onChart(true);$('chart-close').onclick=()=>onChart(false);$('map-toggle').onclick=()=>{localChart=!localChart;$('map-toggle').textContent=localChart?'Show atlas waters':'Follow the boat';chart();};
 $('settings-open').onclick=()=>onSettings(true);$('settings-close').onclick=()=>onSettings(false);
 $('restart').onclick=()=>{$('restart-confirm').hidden=false;};$('restart-no').onclick=()=>{$('restart-confirm').hidden=true;};$('restart-yes').onclick=()=>{$('restart-confirm').hidden=true;onRestart();};
 return {refreshCards,chart,board,notice(text){$('notice').textContent=text;$('notice').hidden=false;},
  postcard(id){const page=ATLAS.find(i=>i.id===id);$('discovery-title').textContent=page.landmark;$('discovery-copy').textContent=page.postcard;$('discovery').hidden=false;refreshCards();},
  course:()=>course,
  update(now,force=false){if(!force&&now-last<.1)return;last=now;const s=getState(),e=getExploration();
   const sailing=s.mode==='water'&&!s.fixture;
   // A followed job outranks the atlas pin on the compass: if you have chosen to
   // sail somewhere for money, that is where the arrow points. `page` is still
   // what the atlas beacon lights when nothing is followed.
   const follow=getFollow?.()||null;
   const page=ATLAS.find(i=>i.id===e.pin);
   const target=follow?follow.goal:page;
   const label=follow?follow.name:page?.landmark;
   const jobs=getJobs?.()||null,berth=getBerth?.()||null;
   $('purse').hidden=!sailing||!jobs;
   if(jobs)$('purse').textContent='◎ '+jobs.coins;
   $('berth-open').hidden=!sailing||!berth?.open;
   if(berth?.open)$('berth-open').textContent='Job board · '+islandName(berth.island);
   $('berth-hint').hidden=!sailing||!berth||berth.open||!berth.reason;
   if(berth&&!berth.open)$('berth-hint').textContent=berth.reason;
   paintLogbook(jobs,follow,sailing,s);
   $('chart-open').textContent='Atlas '+e.atlasIds.length+'/6';$('course').hidden=!sailing;
   if(target){
    // The arrow must point somewhere a boat can actually go. A straight bearing
    // through the island you are moored against is what made the second leg feel
    // like a broken waypoint, so the course is routed around any blocking shore.
    world.nearby(s.x,s.z,Math.min(1200,Math.hypot(target.x-s.x,target.z-s.z)+120),courseIslands);
    courseTo(s,target,courseIslands,undefined,course);
    // The ARROW comes from the routed course; the NUMBER is the real range to
    // what the job wants. A delivery's routed goal is the standoff while the
    // landing is still behind the island, so `course.distance` there is the
    // range to the standoff — and the HUD and the logbook strip then printed
    // two different distances for the same job (826 m against 774 m).
    const distance=follow?Math.max(0,jobRange(follow.job,s)):course.distance,angle=course.bearing-s.yaw;
    // Closing rate over a two-second window: on a long empty leg this is the
    // only way to tell a correct course from a plausible one. Measured in
    // SIMULATION time — wall time disagrees with it whenever the game is
    // stepped by the test harness, or stalls, and the readout then lies.
    const clock=Number.isFinite(s.time)?s.time:now;
    const pinKey=follow?'job:'+follow.job.id:e.pin;
    if(pinKey!==course.pinWas){closing=0;closingFrom=distance;closingAt=clock;course.pinWas=pinKey;}
    else if(closingFrom===null){closing=0;closingFrom=distance;closingAt=clock;}
    else if(clock-closingAt>2||clock<closingAt){closing=(closingFrom-distance)/Math.max(.001,clock-closingAt);closingFrom=distance;closingAt=clock;}
    const trend=Math.abs(closing)<.3?'holding':closing>0?'closing':'opening';
    $('course-name').textContent=label||'A course';
    $('course-distance').textContent=Math.round(distance)+' m '+(follow&&follow.job.kind==='cargo'?'to the landing':'to shore')+' · '+trend;
    $('course-arrow').style.transform=`rotate(${angle}rad)`;
    $('course-arrow').style.color=course.blocked?'#ffb3a0':'';
   }else{closingFrom=null;course.goal=null;course.blocked=null;$('course-name').textContent='Beyond the chart';$('course-distance').textContent=(e.distanceM/1000).toFixed(2)+' km sailed';$('course-arrow').style.transform='none';$('course-arrow').style.color='';}
   const blocker=course.blocked&&courseIslands.find(i=>i.id===course.blocked);
   // How close the followed job actually is to paying out, in the same numbers
   // the model uses — DELIVERY_RANGE / VISIT_RANGE and ARRIVE_SPEED — so the
   // hint cannot drift away from the rule that completes the job.
   const jobGap=follow?jobRange(follow.job,s):Infinity;
   const jobRing=follow&&follow.job.kind==='cargo'?DELIVERY_RANGE:VISIT_RANGE;
   $('approach').textContent=
    s.aground?'Aground'+(blocker||s.agroundOn?' on '+name(courseIslands,s.agroundOn||course.blocked):'')+' — astern to back off, then steer round it.'
    :e.dwellId?'Hold this slow pace · '+Math.min(100,Math.round(e.dwell/2*100))+'%'
    :course.blocked?name(courseIslands,course.blocked)+' is across the course — the arrow leads round it.'
    :follow&&jobGap<=jobRing?'Ease below 5.8 kn to hand it over.'
    :follow&&jobGap<jobRing*4?(follow.job.kind==='cargo'?'The landing is right there — come inside '+DELIVERY_RANGE+' m and slow down.':'Close the shore and slow down.')
    :follow?'Hold the arrow. '+follow.name+' is '+Math.round(distance)+' m off.'
    :page&&Math.hypot(page.x-s.x,page.z-s.z)<page.radius+80?'Ease below 5.8 kn. Stay close for 2 seconds.'
    :e.atlasIds.length===0?'Follow the pin. Slow beside Lantern Key.'
    :page?'Hold the arrow. '+page.landmark+' is '+Math.round(course.distance)+' m off.'
    :'Six places. Take your time.';
   const sig=e.atlasIds.join('|')+e.pin;if(sig!==signature){signature=sig;refreshCards();}
   if(s.mode==='chart'&&(force||now-lastChart>=.5)){lastChart=now;chart();}
  }};
}
