// Scene-wide input. Pointer gestures, controls, and multi-touch never count as taps.
export function createTapInteraction({element,earn,onTap=()=>{}}){
 const effects=document.createElement('div');effects.className='tap-effects';effects.setAttribute('aria-hidden','true');element.append(effects);
 const pointers=new Set();let candidate=null;
 const control=target=>target?.closest?.('button,a,input,select,textarea,dialog,[data-no-earn]');
 function activate(clientX,clientY){
  const rect=element.getBoundingClientRect(),x=Math.max(14,Math.min(rect.width-14,clientX-rect.left)),y=Math.max(35,Math.min(rect.height-24,clientY-rect.top));
  const result=earn();if(!result?.ok)return;
  const earned=result.earned??0,combo=result.multiplier??1;
  const float=document.createElement('span');float.className='tap-money';const unit=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']].find(([size])=>earned>=size);float.textContent='+$'+(unit?(earned/unit[0]).toFixed(1)+unit[1]:(Math.round(earned*10)/10).toLocaleString('en-US'))+(combo>1?' · '+combo.toFixed(1)+'×':'');
  const ring=document.createElement('span');ring.className='tap-ripple';
  for(const node of [float,ring]){node.style.left=x+'px';node.style.top=y+'px';effects.append(node);setTimeout(()=>node.remove(),1000);}
  while(effects.children.length>40)effects.firstElementChild.remove();
  element.classList.remove('tap-lit');void element.offsetWidth;element.classList.add('tap-lit');
  onTap({earned,combo,x:x/rect.width,y:y/rect.height});
 }
 function down(e){pointers.add(e.pointerId);if(pointers.size>1){candidate=null;return;}if(e.button!==0||!e.isPrimary||control(e.target))return;candidate={id:e.pointerId,x:e.clientX,y:e.clientY};}
 function move(e){if(candidate?.id===e.pointerId&&Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)>12)candidate=null;}
 function up(e){const start=candidate;candidate=null;pointers.delete(e.pointerId);if(start?.id!==e.pointerId||pointers.size||control(e.target)||Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)return;activate(e.clientX,e.clientY);}
 function cancel(e){pointers.delete(e.pointerId);candidate=null;}
 function key(e){if(e.target!==element||!['Enter',' '].includes(e.key)||e.repeat)return;e.preventDefault();const rect=element.getBoundingClientRect();activate(rect.left+rect.width*.55,rect.top+rect.height*.5);}
 element.tabIndex=0;element.setAttribute('aria-label','Live transport scene. Tap, click, or press Enter to earn.');
 element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);element.addEventListener('keydown',key);
 return {destroy(){for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['keydown',key]])element.removeEventListener(name,fn);effects.remove();}};
}
