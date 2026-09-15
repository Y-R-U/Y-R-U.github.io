import {level,fishHealing} from './state.mjs';
import {JOBS,GOODS,canMaster,nextMastery,cycleSeconds,gather,masteryBenefit,price,trade,createChallenge,stepChallenge,strikeChallenge,awardMastery} from './professions.mjs';

export function createProfessions({getState,getPlayer,save,notify,onGather,onMastery,onOpen}){
 const $=id=>document.getElementById(id);
 let activity=null,challenge=null,held=false,holdPointer=null,lastShop='';
 function stop(){activity=null;held=false;$('work').hidden=true;document.body.classList.remove('working');}
 function render(){
  const s=getState();$('coins').textContent=`◈ ${s.coins.toLocaleString()}`;
  $('work').hidden=!activity;document.body.classList.toggle('working',!!activity);
  if(activity){const job=JOBS[activity.object.kind],skill=job.skill;
   $('workTitle').textContent=activity.waiting?'Ready to gather':job.verb;$('workDetail').textContent=`${s.mastery[skill]>0?'Auto':'Manual'} · Level ${level(s.xp[skill])} · ${activity.collected} gathered`;
   const available=canMaster(s,skill);$('masteryBtn').hidden=!available;
   $('masteryBtn').textContent=s.mastery[skill]===0?'✧ Unlock auto skill':`✧ Skill up · Rank ${s.mastery[skill]+1}`;
   $('gatherAgain').hidden=!activity.waiting;$('gatherAgain').textContent=activity.object.kind==='fish'?'Cast again':activity.object.kind==='wood'?'Cut again':'Mine again';
   $('workNext').textContent=available?'A mastery challenge is ready':s.mastery[skill]>=20?'All mastery ranks earned':`${s.mastery[skill]===0?'Unlock auto':'Next mastery'} · Level ${nextMastery(s,skill)}`;
  }
  if($('shop').open)renderShop();
 }
 function start(object){
  if(activity?.object===object){if(activity.waiting){activity.waiting=false;activity.elapsed=0;render();}return;}
  activity={object,elapsed:0,collected:0,waiting:false};render();notify(getState().mastery[JOBS[object.kind].skill]>0?'Working automatically. Move away or tap Stop to finish.':'One action per tap. Earn level 5 mastery to unlock automatic work.');
 }
 function tick(dt,paused){
  if(challenge&&$('mastery').open&&!document.hidden&&document.hasFocus()){
   stepChallenge(challenge,dt,held);renderChallenge();
  }
  if(!activity||paused)return;
  const p=getPlayer(),o=activity.object;
  if(Math.hypot(p.x-o.x,p.z-o.z)>2.5){stop();return;}
  if(activity.waiting)return;
  const s=getState(),duration=cycleSeconds(s,o.kind);activity.elapsed+=dt;
  $('workProgress').style.width=`${Math.min(100,activity.elapsed/duration*100)}%`;
  if(activity.elapsed>=duration){activity.elapsed=0;const result=gather(s,o.kind);if(!result){stop();notify('Your supplies are full. Sell some at a shop.');return;}
   activity.collected+=result.count;activity.waiting=s.mastery[result.job.skill]===0;onGather(result,o);save();render();
  }
 }
 function release(){held=false;holdPointer=null;$('reel').classList.remove('holding');}
 function startChallenge(){
  if(!activity)return;challenge=createChallenge(getState(),JOBS[activity.object.kind].skill);if(!challenge)return;
  release();onOpen();$('mastery').showModal();renderChallenge();
 }
 function renderChallenge(){
  const c=challenge;if(!c)return;const s=getState(),fishing=c.skill==='Fishing',wood=c.skill==='Woodcutting',playing=c.status==='playing';
  $('masteryTitle').textContent=`${c.skill} · Rank ${c.rank+1}`;
  $('masteryInstructions').textContent=(c.rank===0?'Win to unlock automatic work. ':'')+(fishing?'Hold to reel the fish in. Release to ease tension. Fill the catch bar before 35 seconds; a full tension bar snaps the line.':wood?'Land six cuts in the gold band. Tap Cut or press Space. Three misses end the attempt.':'Strike six glowing cracks. Tap a lit stone or press its number. Three wrong strikes end the attempt.');
  $('fishingChallenge').hidden=!fishing;$('woodChallenge').hidden=!wood;$('miningChallenge').hidden=fishing||wood;
  $('mastery').querySelector('.challengeFish').style.right=`${6+70*Math.min(1,c.progress)}%`;
  $('mastery').querySelector('.fishingScene i').style.width=`${72-65*Math.min(1,c.progress)}%`;
  $('catchBar').style.width=`${c.progress*100}%`;$('tensionBar').style.width=`${Math.min(100,c.tension*100)}%`;
  $('tensionBar').parentElement.classList.toggle('danger',c.tension>.78);
  $('catchText').textContent=`${Math.round(c.progress*100)}% landed`;$('tensionText').textContent=`${Math.round(c.tension*100)}% tension`;
  $('cutCursor').style.left=`${c.cursor*100}%`;$('cutZone').style.width=`${( .28+c.over*.008)*100}%`;
  $('miningChallenge').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('weak',i===c.target);b.disabled=!playing;b.setAttribute('aria-label',`Stone ${i+1}${i===c.target?' glowing weak point':''}`);});
  $('reel').disabled=$('cut').disabled=!playing;
  if(c.status==='won'){
   if(awardMastery(s,c)){release();if(activity){activity.waiting=false;activity.elapsed=0;}save();onMastery(c.skill);render();}
  }
  const won=c.status==='claimed';
  $('challengeStatus').textContent=won?`Mastery earned! ${c.rank===0?'Automatic work unlocked. ':''}${masteryBenefit(s,c.skill)}`:playing?`${Math.ceil((fishing?35:30)-c.elapsed)}s remaining${fishing?' · Space also reels':` · ${c.hits}/6 hits · ${c.misses}/3 misses`}`:({snapped:'The line snapped.',escaped:fishing?'The fish escaped.':'Time ran out.',missed:'Three strikes missed.'}[c.status]||'Attempt ended.')+' Your supplies are safe. Try again.';
  $('retryMastery').hidden=playing||won;$('closeMastery').textContent=playing?'Cancel challenge':'Continue working';
 }
 function openShop(name){stop();onOpen();lastShop='';$('shopTitle').textContent=name;$('tradeMessage').textContent='Buy supplies or sell what you gather. Story items stay with you.';$('shop').showModal();renderShop();}
 function renderShop(){
  const s=getState(),signature=JSON.stringify([s.coins,s.bag,s.mastery]);$('shopCoins').textContent=`${s.coins.toLocaleString()} coins`;
  if(signature===lastShop)return;lastShop=signature;
  $('shopGoods').innerHTML=Object.entries(GOODS).map(([item,g])=>`<section class="shopGood"><div><strong>${g.name}</strong><small>Owned ${s.bag[item]}${item==='fish'?` · Heals ${fishHealing(s)}`:''}</small></div><div class="tradeButtons"><button data-item="${item}" data-side="buy" data-quantity="1" ${s.coins<price(s,item,'buy')?'disabled':''}>Buy · ${price(s,item,'buy')}◈</button><button data-item="${item}" data-side="sell" data-quantity="1" ${s.bag[item]<1?'disabled':''}>Sell · ${price(s,item,'sell')}◈</button><button data-item="${item}" data-side="sell" data-quantity="10" ${s.bag[item]<10?'disabled':''}>Sell 10 · ${price(s,item,'sell')*10}◈</button></div></section>`).join('');
 }
 $('shopGoods').onclick=e=>{const b=e.target.closest('button[data-item]');if(!b||b.disabled)return;const s=getState(),{item,side,quantity}=b.dataset;
  if(trade(s,item,side,+quantity)){const message=`${side==='buy'?'Bought':'Sold'} ${quantity} ${GOODS[item].name.toLowerCase()} for ${price(s,item,side)*quantity} coins.`;$('tradeMessage').textContent=message;onGather(null);save();render();}
 };
 $('closeShop').onclick=()=>$('shop').close();
 $('gatherAgain').onclick=()=>{if(activity)start(activity.object);};
 $('stopWork').onclick=stop;$('masteryBtn').onclick=startChallenge;
 $('closeMastery').onclick=()=>$('mastery').close();
 $('retryMastery').onclick=()=>{challenge=createChallenge(getState(),challenge.skill);release();renderChallenge();};
 $('mastery').addEventListener('close',()=>{release();challenge=null;render();});
 $('reel').addEventListener('pointerdown',e=>{if(e.button!==0||holdPointer!==null||challenge?.status!=='playing')return;e.preventDefault();holdPointer=e.pointerId;held=true;$('reel').classList.add('holding');$('reel').setPointerCapture(e.pointerId);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])$('reel').addEventListener(name,e=>{if(e.pointerId===holdPointer)release();});
 $('cut').onclick=()=>{if(challenge){strikeChallenge(challenge);renderChallenge();}};
 $('miningChallenge').innerHTML=Array.from({length:9},(_,i)=>`<button type="button" data-cell="${i}">${i+1}<span>✧</span></button>`).join('');
 $('miningChallenge').onclick=e=>{const b=e.target.closest('[data-cell]');if(b&&challenge){strikeChallenge(challenge,+b.dataset.cell);renderChallenge();}};
 addEventListener('keydown',e=>{if(!$('mastery').open||challenge?.status!=='playing')return;
  if(e.code==='Space'){e.preventDefault();if(e.repeat)return;if(challenge.skill==='Fishing'){held=true;$('reel').classList.add('holding');}else if(challenge.skill==='Woodcutting'){strikeChallenge(challenge);renderChallenge();}}
  else if(challenge.skill==='Mining'&&/^Digit[1-9]$/.test(e.code)&&!e.repeat){e.preventDefault();strikeChallenge(challenge,+e.code.slice(-1)-1);renderChallenge();}
 });
 addEventListener('keyup',e=>{if(e.code==='Space')release();});addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 return {start,stop,tick,render,openShop,get active(){return activity;},get challenge(){return challenge;},get modalOpen(){return $('mastery').open||$('shop').open;}};
}
