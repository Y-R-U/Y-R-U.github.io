import {WEAPONS} from '../data/weapons.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The HUD used to rebuild its whole innerHTML whenever *any* value in the model changed, which
// during a firefight is every single frame (HP and the clock both move). That quietly ate taps:
// a touchstart landed on a button, the DOM was replaced before the touchend, and Chrome then had
// no element to fire `click` on. The m5 rail-button gate caught it. So the structure is rebuilt
// only when the structure changes, and the moving numbers are written straight into cached nodes.
// Losing a named man gets a beat of its own: a small telegram under the mission banner. It sits
// in the top edge strip, never in the middle of the battlefield, and never takes a tap.
const QUIPS=['He had plans.','Posthumously adequate.','The paperwork will miss him.','A good lad, apparently.','He owed the mess three shillings.','Survived by his helmet.','Remembered, briefly.','His mother will be told something.'];
// The coaching card. One at a time, top edge strip only, `pointer-events:none`, and every one
// of them retires the moment the player has demonstrated the skill (see `taught` in save.mjs).
// It is a separate element rather than part of the HUD markup on purpose: rebuilding the HUD's
// innerHTML mid-gesture eats taps, and this thing changes far more often than the HUD structure.
export function createHUD(root,send){
 let signature='',refs=null,plaque=null,coach=null,primer=null;
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  send({type:b.dataset.action,id:b.dataset.id===undefined?null:Number(b.dataset.id),weapon:b.dataset.weapon});});

 function markup(model){return `<header class="mission-header"><div class="banner-text"><div class="eyebrow">${escape(model.location||'BRAMBLE COMMON')} <span>• ${model.time}s</span></div><strong>${escape(model.objective||'Take a very small stroll')}</strong></div><div class="armed-panel" aria-live="assertive"><div class="eyebrow armed-eyebrow">GRENADE ARMED</div><div class="armed-row"><b class="armed-clock">3</b><strong class="armed-line">Tap the marker to call it off.</strong></div></div><button class="pause" data-action="pause" aria-label="Pause">Ⅱ</button></header><div class="tally">${model.kills} ENEMY DOWN <span> / ${model.losses} OURS</span></div><div class="order-hint">${escape(model.hint||'TAP GROUND TO MARCH · THE LADS AIM')}</div><nav class="weapon-rail" aria-label="Squad weapons">${[...model.equipped].reverse().map(id=>`<button data-action="weapon" data-weapon="${id}" class="rail-button ${model.units.every(u=>u.weapon===id)?'selected':''}" aria-label="All soldiers: ${WEAPONS[id]?.name||id}"><b>${WEAPONS[id]?.icon||'●'}</b><small>${WEAPONS[id]?.name||id}</small></button>`).join('')}</nav><section class="unit-cards" aria-label="Squad">${model.units.map(u=>`<article class="unit-card ${u.active?'active':'holding'} ${u.hp<=0?'dead':''} ${model.arrow===u.id?'coached':''}">${model.arrow===u.id?'<span class="card-arrow" aria-hidden="true">▼</span>':''}<div class="weapon-pips">${model.equipped.map(id=>`<button data-action="weapon" data-id="${u.id}" data-weapon="${id}" class="pip ${u.weapon===id?'selected':''}" aria-label="${escape(u.name)}: ${WEAPONS[id]?.name||id}">${WEAPONS[id]?.icon||'●'}</button>`).join('')}</div><button class="unit-toggle" data-action="toggle" data-id="${u.id}" ${u.hp<=0?'disabled':''} aria-pressed="${u.active}" aria-label="${escape(u.name)} ${u.active?'hold position':'join orders'}"><span class="helmet-icon">${u.hp<=0?'✝':'⏜'}</span><strong>${escape(u.name.replace(/^(Pvt\.|Cpl\.|Sgt\.) /,''))}</strong><span class="health"><i style="width:${u.hp/u.maxHp*100}%"></i></span><small>${u.hp<=0?'POSTHUMOUS':u.active?'WITH YOU':'HOLDING'}</small></button></article>`).join('')}</section><div class="pause-label">WAR ON TEA BREAK</div>`;}

 return {update(model){
  const hidden=model.hidden||false;
  root.classList.toggle('hidden',hidden);
  if(!plaque){plaque=document.createElement('div');plaque.className='eulogy';plaque.setAttribute('aria-live','polite');(root.parentNode||document.body).appendChild(plaque);}
  const e=hidden?null:model.eulogy;
  plaque.classList.toggle('showing',!!e);
  if(e&&plaque.dataset.key!==String(e.key)){plaque.dataset.key=String(e.key);
   plaque.innerHTML=`<span class="eyebrow">A TELEGRAM</span><strong>${escape(e.name)}</strong><small>${e.kills} kill${e.kills===1?'':'s'} · ${escape(QUIPS[e.key%QUIPS.length])}</small>`;}
  // 0.04.3 — the one and only grenade briefing. It PAUSES, because everything else about
  // grenades is happening while men are being shot at. One tap anywhere dismisses it and the
  // war resumes; `campaign.taught.grenade` makes sure it is never seen twice.
  if(!primer){primer=document.createElement('div');primer.className='primer';
   primer.innerHTML=`<div class="primer-card" role="dialog" aria-modal="true" aria-label="How grenades work"><span class="eyebrow">A WORD ABOUT GRENADES</span><strong>One tap arms it. Nothing is in the air yet.</strong><ul><li><b>Tap the ground</b> and a red marker lands there, counting down.</li><li><b>Tap the marker</b> and it is called off. Still in his hand.</li><li><b>Tap anywhere else</b> and the lads march — it is still thrown, from wherever they end up. Walk too far and it falls short.</li></ul><small>They will lob it at each other just as cheerfully. That part is on you.</small><button class="primer-go" type="button">Understood</button></div>`;
   primer.addEventListener('click',()=>send({type:'primer-dismiss'}));
   (root.parentNode||document.body).appendChild(primer);}
  primer.classList.toggle('showing',!!(model.primer&&!hidden));
  if(!coach){coach=document.createElement('div');coach.className='coach';coach.setAttribute('aria-live','polite');(root.parentNode||document.body).appendChild(coach);}
  const c=hidden?null:model.coach;
  coach.classList.toggle('showing',!!c);
  // 0.04: once the banner has folded away there is no reason for a lesson to hang in the
  // middle of the grass — it slides up into the space the banner gave back. Not while a
  // telegram is up, because the telegram already pushes the coach down 88 px.
  const high=!!c&&!!model.collapsed&&!e;
  coach.classList.toggle('high',high);
  // The kill tally lives where a high card lands, so it steps out of the way for the few
  // seconds a lesson is up. Nothing is dead that early anyway.
  root.classList.toggle('coach-high',high);
  coach.classList.toggle('urgent',!!c&&c.tone==='red');
  if(c){const html=`<span class="eyebrow">${escape(c.eyebrow)}</span><strong>${escape(c.title)}</strong>${c.lines.map(l=>`<small>${escape(l)}</small>`).join('')}`;
   if(coach.dataset.sig!==html){coach.dataset.sig=html;coach.innerHTML=html;}}
  root.classList.toggle('kit3',(model.equipped||[]).length>=3);
  if(hidden){signature='';refs=null;return;}
  // NOTE what is NOT in here: `paused`, `armed` and `collapsed`. The pause button is the most
  // tapped control in the game and it lives in this markup, so none of the three states it can
  // be in may rebuild it. They are class toggles and textContent writes instead.
  const shape=JSON.stringify([model.location,model.objective,model.hint,model.equipped,model.arrow,
   model.units.map(u=>[u.id,u.name,u.active,u.weapon,u.hp<=0])]);
  if(shape!==signature){
   signature=shape;root.innerHTML=markup(model);
   refs={clock:root.querySelector('.eyebrow span'),tally:root.querySelector('.tally'),
         bars:[...root.querySelectorAll('.health i')],header:root.querySelector('.mission-header'),
         armedEyebrow:root.querySelector('.armed-eyebrow'),armedClock:root.querySelector('.armed-clock'),
         armedLine:root.querySelector('.armed-line'),pause:root.querySelector('.pause'),
         pauseLabel:root.querySelector('.pause-label')};
  }
  if(!refs)return;
  // 0.04.1 / 0.04.2. Both of these are a class on the header plus three textContent writes.
  // NEVER rebuild the markup for them: the pause button lives in here, and replacing the DOM
  // between touchstart and touchend leaves Chrome with nothing to fire `click` on. That bug
  // has already eaten a tap in this project. The button is also positioned absolutely against
  // the header's top-right corner, so it does not move a pixel in any of these states.
  const armed=model.armed||null;
  if(refs.pause){const glyph=model.paused?'▶':'Ⅱ';
   if(refs.pause.textContent!==glyph){refs.pause.textContent=glyph;refs.pause.setAttribute('aria-label',model.paused?'Resume':'Pause');}}
  if(refs.pauseLabel)refs.pauseLabel.classList.toggle('showing',!!model.paused);
  if(refs.header){refs.header.classList.toggle('armed',!!armed);
   refs.header.classList.toggle('collapsed',!!model.collapsed&&!armed);}
  if(armed&&refs.armedClock){
   const eyebrow=armed.short?'GRENADE ARMED \u00b7 OUT OF REACH':'GRENADE ARMED';
   const clock=armed.left>0?String(armed.left):'\u2014';
   const line=armed.short?'It will fall short from here. Tap the marker to call it off.'
    :'Tap the marker to call it off. Tap anywhere else and they march.';
   if(refs.armedEyebrow.textContent!==eyebrow)refs.armedEyebrow.textContent=eyebrow;
   if(refs.armedClock.textContent!==clock)refs.armedClock.textContent=clock;
   if(refs.armedLine.textContent!==line)refs.armedLine.textContent=line;
   refs.header.classList.toggle('short',!!armed.short);}
  const clock=`• ${model.time}s`;if(refs.clock&&refs.clock.textContent!==clock)refs.clock.textContent=clock;
  const tally=`${model.kills} ENEMY DOWN <span> / ${model.losses} OURS</span>`;
  if(refs.tally&&refs.tally.innerHTML!==tally)refs.tally.innerHTML=tally;
  model.units.forEach((u,i)=>{const bar=refs.bars[i];if(!bar)return;
   const w=Math.max(0,u.hp/u.maxHp*100).toFixed(1)+'%';if(bar.style.width!==w)bar.style.width=w;});
 }};
}
