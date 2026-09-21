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
export function createHUD(root,send){
 let signature='',refs=null,plaque=null;
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  send({type:b.dataset.action,id:b.dataset.id===undefined?null:Number(b.dataset.id),weapon:b.dataset.weapon});});

 function markup(model){return `<header class="mission-header"><div><div class="eyebrow">${escape(model.location||'BRAMBLE COMMON')} <span>• ${model.time}s</span></div><strong>${escape(model.objective||'Take a very small stroll')}</strong></div><button class="pause" data-action="pause" aria-label="${model.paused?'Resume':'Pause'}">${model.paused?'▶':'Ⅱ'}</button></header><div class="tally">${model.kills} ENEMY DOWN <span> / ${model.losses} OURS</span></div><div class="order-hint">${escape(model.hint||'TAP GROUND TO MARCH · THE LADS AIM')}</div><nav class="weapon-rail" aria-label="Squad weapons">${[...model.equipped].reverse().map(id=>`<button data-action="weapon" data-weapon="${id}" class="rail-button ${model.units.every(u=>u.weapon===id)?'selected':''}" aria-label="All soldiers: ${WEAPONS[id]?.name||id}"><b>${WEAPONS[id]?.icon||'●'}</b><small>${WEAPONS[id]?.name||id}</small></button>`).join('')}</nav><section class="unit-cards" aria-label="Squad">${model.units.map(u=>`<article class="unit-card ${u.active?'active':'holding'} ${u.hp<=0?'dead':''}"><div class="weapon-pips">${model.equipped.map(id=>`<button data-action="weapon" data-id="${u.id}" data-weapon="${id}" class="pip ${u.weapon===id?'selected':''}" aria-label="${escape(u.name)}: ${WEAPONS[id]?.name||id}">${WEAPONS[id]?.icon||'●'}</button>`).join('')}</div><button class="unit-toggle" data-action="toggle" data-id="${u.id}" ${u.hp<=0?'disabled':''} aria-pressed="${u.active}" aria-label="${escape(u.name)} ${u.active?'hold position':'join orders'}"><span class="helmet-icon">${u.hp<=0?'✝':'⏜'}</span><strong>${escape(u.name.replace(/^(Pvt\.|Cpl\.|Sgt\.) /,''))}</strong><span class="health"><i style="width:${u.hp/u.maxHp*100}%"></i></span><small>${u.hp<=0?'POSTHUMOUS':u.active?'WITH YOU':'HOLDING'}</small></button></article>`).join('')}</section>${model.paused?'<div class="pause-label">WAR ON TEA BREAK</div>':''}`;}

 return {update(model){
  const hidden=model.hidden||false;
  root.classList.toggle('hidden',hidden);
  if(!plaque){plaque=document.createElement('div');plaque.className='eulogy';plaque.setAttribute('aria-live','polite');(root.parentNode||document.body).appendChild(plaque);}
  const e=hidden?null:model.eulogy;
  plaque.classList.toggle('showing',!!e);
  if(e&&plaque.dataset.key!==String(e.key)){plaque.dataset.key=String(e.key);
   plaque.innerHTML=`<span class="eyebrow">A TELEGRAM</span><strong>${escape(e.name)}</strong><small>${e.kills} kill${e.kills===1?'':'s'} · ${escape(QUIPS[e.key%QUIPS.length])}</small>`;}
  root.classList.toggle('kit3',(model.equipped||[]).length>=3);
  if(hidden){signature='';refs=null;return;}
  const shape=JSON.stringify([model.location,model.objective,model.hint,model.equipped,model.paused,
   model.units.map(u=>[u.id,u.name,u.active,u.weapon,u.hp<=0])]);
  if(shape!==signature){
   signature=shape;root.innerHTML=markup(model);
   refs={clock:root.querySelector('.eyebrow span'),tally:root.querySelector('.tally'),
         bars:[...root.querySelectorAll('.health i')]};
  }
  if(!refs)return;
  const clock=`• ${model.time}s`;if(refs.clock&&refs.clock.textContent!==clock)refs.clock.textContent=clock;
  const tally=`${model.kills} ENEMY DOWN <span> / ${model.losses} OURS</span>`;
  if(refs.tally&&refs.tally.innerHTML!==tally)refs.tally.innerHTML=tally;
  model.units.forEach((u,i)=>{const bar=refs.bars[i];if(!bar)return;
   const w=Math.max(0,u.hp/u.maxHp*100).toFixed(1)+'%';if(bar.style.width!==w)bar.style.width=w;});
 }};
}
