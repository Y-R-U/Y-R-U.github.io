import {level,fishHealing} from './state.mjs';
import {JOBS,GOODS,canMaster,nextMastery,workSeconds,gather,recipeInfo,craft,RECIPES,toolCost,buyTool,masteryBenefit,price,trade,createChallenge,stepChallenge,strikeChallenge,awardMastery} from './professions.mjs';

export function createProfessions({getState,getPlayer,save,notify,onGather,onMastery,onOpen}){
 const $=id=>document.getElementById(id);
 let activity=null,challenge=null,held=false,holdPointer=null,lastShop='',lastWorkshop='';
 const artisan=()=>activity&&['fire','forge'].includes(activity.object.kind);
 const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
 function stop(){activity=null;held=false;$('work').hidden=true;document.body.classList.remove('working');}
 function render(){
  const s=getState();$('coins').textContent=`◈ ${s.coins.toLocaleString()}`;
  $('work').hidden=!activity;document.body.classList.toggle('working',!!activity);
  if(activity){const job=JOBS[activity.object.kind],skill=job.skill;
   $('workTitle').textContent=activity.recipe?RECIPES[activity.recipe].name:activity.waiting?'Ready to gather':job.verb;$('workDetail').textContent=`${s.mastery[skill]>0?'Auto':'Manual'} · Level ${level(s.xp[skill])} · ${activity.collected} ${artisan()?'made':'gathered'}`;
   const available=canMaster(s,skill);$('masteryBtn').hidden=!available;
   $('masteryBtn').textContent=s.mastery[skill]===0?'✧ Unlock auto skill':`✧ Skill up · Rank ${s.mastery[skill]+1}`;
   $('gatherAgain').hidden=!activity.waiting||!!artisan();
   $('workRecipes').hidden=!artisan();$('workRecipes').textContent=activity.remaining>0&&activity.waiting?'Continue batch':'Recipes';
   $('workBatch').hidden=!artisan();$('workBatch').textContent=artisan()?(activity.remaining>0?`${activity.remaining} left in batch${activity.waiting?' · Tap Continue for the next item':''}`:activity.collected?'Batch complete. Choose a recipe.':'Choose a recipe to begin.'):'';$('gatherAgain').textContent=activity.object.kind==='fish'?'Cast again':activity.object.kind==='wood'?'Cut again':'Mine again';
   $('workNext').textContent=available?'A mastery challenge is ready':s.mastery[skill]>=20?'All mastery ranks earned':`${s.mastery[skill]===0?'Unlock auto':'Next mastery'} · Level ${nextMastery(s,skill)}`;
  }
  if($('shop').open)renderShop();
  if($('workshop').open)renderWorkshop();
 }
 function start(object,recipe=null,quantity=0,waiting=false){
  if(!recipe&&activity?.object===object){if(activity.waiting){activity.waiting=false;activity.elapsed=0;render();}return;}
  activity={object,recipe,remaining:quantity,elapsed:0,collected:0,waiting};render();notify(getState().mastery[JOBS[object.kind].skill]>0?'Working automatically. Move away or tap Stop to finish.':'One action per tap. Earn level 5 mastery to unlock automatic work.');
 }
 function tick(dt,paused){
  if(challenge&&$('mastery').open&&!document.hidden&&document.hasFocus()){
   stepChallenge(challenge,dt,held);renderChallenge();
  }
  if(!activity||paused)return;
  const p=getPlayer(),o=activity.object;
  if(Math.hypot(p.x-o.x,p.z-o.z)>2.5){stop();return;}
  if(activity.waiting)return;
  const s=getState(),duration=workSeconds(s,o.kind);activity.elapsed+=dt;
  $('workProgress').style.width=`${Math.min(100,activity.elapsed/duration*100)}%`;
  if(activity.elapsed>=duration){activity.elapsed=0;const result=artisan()?craft(s,activity.recipe):gather(s,o.kind);if(!result){activity.waiting=true;notify(artisan()?recipeInfo(s,activity.recipe)?.reason||'Choose a recipe first.':'Your supplies are full. Sell some at a shop.');render();return;}
   if(artisan())activity.remaining--;
   activity.collected+=result.count;activity.waiting=s.mastery[result.job.skill]===0||(artisan()&&activity.remaining<=0);onGather(result,o);save();render();
  }
 }
 function release(){held=false;holdPointer=null;for(const id of ['reel','stoke'])$(id).classList.remove('holding');}
 function startChallenge(){
  if(!activity)return;challenge=createChallenge(getState(),JOBS[activity.object.kind].skill);if(!challenge)return;
  release();onOpen();if($('workshop').open)$('workshop').close();renderChallenge();$('mastery').showModal();
 }
 function renderChallenge(){
  const c=challenge;if(!c)return;const s=getState(),fishing=c.skill==='Fishing',wood=c.skill==='Woodcutting',smith=c.skill==='Smithing',cooking=c.skill==='Cooking',playing=c.status==='playing';
  $('masteryTitle').textContent=`${c.skill} · Rank ${c.rank+1}`;
  $('masteryInstructions').textContent=(c.rank===0?'Win to unlock automatic work. ':'')+(fishing?'Hold to reel the fish in. Release to ease tension. Fill the catch bar before 35 seconds; a full tension bar snaps the line.':wood?'Land six cuts in the gold band. Tap Cut or press Space. Three misses end the attempt.':smith?'Hit the glowing anvil zone six times. The target alternates after each hit. Tap Hammer or press Space. Three misses end the attempt.':cooking?'Hold to stoke the fire, release to cool it. Keep the heat inside the gold band to finish the meal. Full heat burns the attempt.':'Strike six glowing cracks. Tap a lit stone or press its number. Three wrong strikes end the attempt.');
  $('fishingChallenge').hidden=!fishing;$('woodChallenge').hidden=!(wood||smith);$('miningChallenge').hidden=c.skill!=='Mining';$('cookingChallenge').hidden=!cooking;
  $('cut').textContent=smith?'Hammer · Space':'Cut · Space';$('woodChallenge').classList.toggle('anvil',smith);
  $('heatCursor').style.left=`${Math.min(100,c.heat*100)}%`;$('heatZone').style.width=`${(26+c.over*.6)}%`;
  $('cookBar').style.width=`${c.progress*100}%`;$('heatText').textContent=`${Math.round(c.heat*100)}% heat · ${Math.round(c.progress*100)}% cooked`;
  $('mastery').querySelector('.challengeFish').style.right=`${6+70*Math.min(1,c.progress)}%`;
  $('mastery').querySelector('.fishingScene i').style.width=`${72-65*Math.min(1,c.progress)}%`;
  $('catchBar').style.width=`${c.progress*100}%`;$('tensionBar').style.width=`${Math.min(100,c.tension*100)}%`;
  $('tensionBar').parentElement.classList.toggle('danger',c.tension>.78);
  $('catchText').textContent=`${Math.round(c.progress*100)}% landed`;$('tensionText').textContent=`${Math.round(c.tension*100)}% tension`;
  $('cutCursor').style.left=`${c.cursor*100}%`;$('cutZone').style.width=`${(smith?.24+c.over*.006:.28+c.over*.008)*100}%`;$('cutZone').style.left=`${smith?(c.hits%2?30:70):50}%`;
  $('miningChallenge').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('weak',i===c.target);b.disabled=!playing;b.setAttribute('aria-label',`Stone ${i+1}${i===c.target?' glowing weak point':''}`);});
  $('stoke').disabled=$('reel').disabled=$('cut').disabled=!playing;
  if(c.status==='won'){
   if(awardMastery(s,c)){release();if(activity){activity.waiting=!!artisan()&&activity.remaining<=0;activity.elapsed=0;}save();onMastery(c.skill);render();}
  }
  const won=c.status==='claimed';
  text('challengeStatus',won?`Mastery earned! ${c.rank===0?'Automatic work unlocked. ':''}${masteryBenefit(s,c.skill)}`:playing?`${Math.ceil((fishing?35:30)-c.elapsed)}s remaining${(fishing||cooking)?' · Hold Space or the button':` · ${c.hits}/6 hits · ${c.misses}/3 misses`}`:({burnt:'The meal burned.',snapped:'The line snapped.',escaped:fishing?'The fish escaped.':'Time ran out.',missed:'Three strikes missed.'}[c.status]||'Attempt ended.')+' Your supplies are safe. Try again.');
  $('retryMastery').hidden=playing||won;$('closeMastery').textContent=playing?'Cancel challenge':'Continue working';
 }
 function openShop(name){stop();onOpen();lastShop='';$('shopTitle').textContent=name;$('tradeMessage').textContent='Buy supplies or sell what you gather. Story items stay with you.';$('shop').showModal();renderShop();}
 function renderShop(){
  const s=getState(),signature=JSON.stringify([s.coins,s.bag,s.mastery,s.tools]);$('shopCoins').textContent=`${s.coins.toLocaleString()} coins`;
  if(signature===lastShop)return;lastShop=signature;renderTools();
  $('shopGoods').innerHTML=Object.entries(GOODS).map(([item,g])=>`<section class="shopGood"><div><strong>${g.name}</strong><small>Owned ${s.bag[item]}${item==='fish'?` · Heals ${fishHealing(s)}`:''}</small></div><div class="tradeButtons"><button data-item="${item}" data-side="buy" data-quantity="1" ${s.coins<price(s,item,'buy')?'disabled':''}>Buy · ${price(s,item,'buy')}◈</button><button data-item="${item}" data-side="sell" data-quantity="1" ${s.bag[item]<1?'disabled':''}>Sell · ${price(s,item,'sell')}◈</button><button data-item="${item}" data-side="sell" data-quantity="10" ${s.bag[item]<10?'disabled':''}>Sell 10 · ${price(s,item,'sell')*10}◈</button></div></section>`).join('');
 }
 function renderTools(){const s=getState();$('shopTools').innerHTML=Object.keys(s.tools).map(skill=>`<section class="shopGood"><strong>${skill} tool · Tier ${s.tools[skill]}</strong><small>${Math.round(s.tools[skill]*20)}% faster work · ${s.tools[skill]===3?'Fully upgraded':'Next tier adds 20% speed'}</small><button data-tool="${skill}" ${toolCost(s,skill)===null||s.coins<toolCost(s,skill)?'disabled':''}>${toolCost(s,skill)===null?'Maximum tier':`Upgrade · ${toolCost(s,skill)} coins`}</button></section>`).join('');}
 $('shopTools').onclick=e=>{const b=e.target.closest('[data-tool]');if(b&&!b.disabled&&buyTool(getState(),b.dataset.tool)){save();lastShop='';render();$('tradeMessage').textContent=`${b.dataset.tool} tool upgraded. Equip it automatically while gathering.`;}};
 function openWorkshop(object){
  if(!activity||activity.object!==object)start(object,object.kind==='fire'?'meal':'ingot',0,true);
  onOpen();lastWorkshop='';$('workshopTitle').textContent=object.kind==='fire'?'The hearth kitchen':'The copper forge';$('workshop').showModal();renderWorkshop();
 }
 function renderWorkshop(){
  if(!artisan())return;const s=getState(),skill=JOBS[activity.object.kind].skill;
  const sig=JSON.stringify([s.bag,s.xp,s.mastery,s.bladeTier,$('craftQuantity').value]);
  $('workshopMastery').hidden=!canMaster(s,skill);$('workshopMastery').textContent=s.mastery[skill]?'✧ Next mastery challenge':'✧ Unlock automatic work';
  $('workshopMode').textContent=`${skill} level ${level(s.xp[skill])} · ${s.mastery[skill]?'Automatic batches unlocked':'Manual: one action per tap. Level 5 mastery unlocks automatic batches.'}`;
  if(sig===lastWorkshop)return;lastWorkshop=sig;
  $('recipes').innerHTML=Object.keys(RECIPES).filter(id=>RECIPES[id].station===activity.object.kind).map(id=>{const r=recipeInfo(s,id);return `<section class="shopGood"><strong>${r.name}${id==='temper'?` · Tier ${Math.min(5,s.bladeTier+1)}/5`:''}</strong><p>${r.description}</p><small>${Object.entries(r.ingredients).map(([item,n])=>`${GOODS[item].name}: ${s.bag[item]}/${n}`).join(' · ')}<br>+${r.xp} ${r.skill} XP · Requires level ${r.requiredLevel}</small><button data-recipe="${id}" ${r.available?'':'disabled'}>${r.available?id==='temper'?'Temper once':'Start selected batch':r.reason}</button></section>`;}).join('');
 }
 $('recipes').onclick=e=>{const b=e.target.closest('[data-recipe]');if(!b||b.disabled||!artisan())return;const r=recipeInfo(getState(),b.dataset.recipe);if(!r?.available)return;
  const max=Math.min(...Object.entries(r.ingredients).map(([item,n])=>Math.floor(getState().bag[item]/n)),999);
  const quantity=b.dataset.recipe==='temper'?1:Math.min(max,$('craftQuantity').value==='all'?max:+$('craftQuantity').value);
  start(activity.object,b.dataset.recipe,quantity);$('workshop').close();
 };
 $('workRecipes').onclick=()=>{if(!artisan())return;if(activity.waiting&&activity.remaining>0){if(recipeInfo(getState(),activity.recipe)?.available){activity.waiting=false;activity.elapsed=0;render();}else openWorkshop(activity.object);}else openWorkshop(activity.object);};
 $('workshopMastery').onclick=startChallenge;$('closeWorkshop').onclick=()=>$('workshop').close();$('craftQuantity').onchange=()=>{lastWorkshop='';renderWorkshop();};
 $('shopGoods').onclick=e=>{const b=e.target.closest('button[data-item]');if(!b||b.disabled)return;const s=getState(),{item,side,quantity}=b.dataset;
  if(trade(s,item,side,+quantity)){const message=`${side==='buy'?'Bought':'Sold'} ${quantity} ${GOODS[item].name.toLowerCase()} for ${price(s,item,side)*quantity} coins.`;$('tradeMessage').textContent=message;onGather(null);save();render();}
 };
 $('closeShop').onclick=()=>$('shop').close();
 $('gatherAgain').onclick=()=>{if(activity)start(activity.object);};
 $('stopWork').onclick=stop;$('masteryBtn').onclick=startChallenge;
 $('closeMastery').onclick=()=>$('mastery').close();
 $('retryMastery').onclick=()=>{challenge=createChallenge(getState(),challenge.skill);release();renderChallenge();};
 $('mastery').addEventListener('close',()=>{release();challenge=null;render();});
 for(const id of ['reel','stoke']){
  $(id).addEventListener('pointerdown',e=>{if(e.button!==0||holdPointer!==null||challenge?.status!=='playing')return;e.preventDefault();holdPointer=e.pointerId;held=true;$(id).classList.add('holding');$(id).setPointerCapture(e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])$(id).addEventListener(event,e=>{if(e.pointerId===holdPointer)release();});
 }
 $('cut').onclick=()=>{if(challenge){strikeChallenge(challenge);renderChallenge();}};
 $('miningChallenge').innerHTML=Array.from({length:9},(_,i)=>`<button type="button" data-cell="${i}">${i+1}<span>✧</span></button>`).join('');
 $('miningChallenge').onclick=e=>{const b=e.target.closest('[data-cell]');if(b&&challenge){strikeChallenge(challenge,+b.dataset.cell);renderChallenge();}};
 addEventListener('keydown',e=>{if(!$('mastery').open||challenge?.status!=='playing')return;
  if(e.code==='Space'){e.preventDefault();if(e.repeat)return;if(['Fishing','Cooking'].includes(challenge.skill)){held=true;$(challenge.skill==='Fishing'?'reel':'stoke').classList.add('holding');}else if(['Woodcutting','Smithing'].includes(challenge.skill)){strikeChallenge(challenge);renderChallenge();}}
  else if(challenge.skill==='Mining'&&/^Digit[1-9]$/.test(e.code)&&!e.repeat){e.preventDefault();strikeChallenge(challenge,+e.code.slice(-1)-1);renderChallenge();}
 });
 addEventListener('keyup',e=>{if(e.code==='Space')release();});addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 return {start,stop,tick,render,openShop,openWorkshop,get active(){return activity;},get challenge(){return challenge;},get modalOpen(){return $('mastery').open||$('shop').open||$('workshop').open;}};
}
