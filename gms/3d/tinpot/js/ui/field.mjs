// Small world-anchored controls. Only the labels catch taps; the battlefield remains playable.
export function createField(send){const root=document.createElement('div');root.id='field-ui';document.body.appendChild(root);let signature='';
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(b)send(b.dataset.kind,Number(b.dataset.route));});
 return {update({hidden,w,campaign,project,depotReady,notice}){
  root.hidden=hidden;if(hidden)return;
  const routes=w.mission?.status==='intermission'?campaign.pendingRoutes||[]:[];
  const signatureNext=JSON.stringify([w.map.id,routes.map(r=>r.to)]);
  if(signatureNext!==signature){signature=signatureNext;root.innerHTML='<div class="field-flash" aria-live="polite"></div><button class="field-spot depot-spot" data-kind="depot"><b>✚ FIELD DEPOT</b><small></small></button>'+routes.map((r,i)=>`<button class="field-spot exit-spot" data-kind="route" data-route="${r.to}" data-index="${i}"><b></b><small></small></button>`).join('');}
  const flash=root.querySelector('.field-flash');flash.textContent=notice||'';flash.hidden=!notice||routes.length>0;
  const set=(b,x,z,label,hint)=>{const point=project(x,z);b.style.left=Math.max(64,Math.min(innerWidth-64,point.x))+'px';b.style.top=Math.max(112,Math.min(innerHeight-250,point.y))+'px';b.querySelector('b').textContent=label;b.querySelector('small').textContent=hint;};
  const d=w.map.depot;set(root.querySelector('.depot-spot'),d.x,d.z,'✚ FIELD DEPOT',depotReady?'Open · upgrades / save':'Move here · safe when clear');
  for(const b of root.querySelectorAll('.exit-spot')){const i=Number(b.dataset.index),r=routes[i],x=routes.length===1?0:i===0?-4:4,z=-14;
   const near=w.units.some(u=>u.team==='blue'&&!u.escort&&u.hp>0&&Math.hypot(u.x-x,u.z-z)<3);
   set(b,x,z,r.label,near?'Continue →':'Move here →');if(routes.length>1)b.style.left=(innerWidth*(i===0?.27:.73))+'px';const rail=document.querySelector('#hud .weapon-rail');if(rail)b.style.top=Math.max(108,Math.min(parseFloat(b.style.top),rail.getBoundingClientRect().top-30))+'px';b.title=r.detail;b.classList.toggle('ready',near);}
 }};}
