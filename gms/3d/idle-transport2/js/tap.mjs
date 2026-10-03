// Scene-wide input. Pointer gestures, controls, and multi-touch never count as taps.
export function createTapInteraction({element,earn,onTap=()=>{}}){
 const effects=document.createElement('div');effects.className='tap-effects';effects.setAttribute('aria-hidden','true');element.append(effects);
 const pointers=new Set();let candidate=null,lastFloat=null,serial=0;
 const control=target=>target?.closest?.('button,a,input,select,textarea,dialog,[data-no-earn]');
 function activate(clientX,clientY){
  const rect=element.getBoundingClientRect(),x=Math.max(14,Math.min(rect.width-14,clientX-rect.left)),y=Math.max(35,Math.min(rect.height-24,clientY-rect.top));
  const result=earn();if(!result?.ok)return;
  const earned=result.earned??0,combo=result.multiplier??1;
  const stamp=performance.now(),close=lastFloat&&lastFloat.node.isConnected&&stamp-lastFloat.at<220&&Math.hypot(x-lastFloat.x,y-lastFloat.y)<48;
  const float=close?lastFloat.node:document.createElement('span');
  const total=earned+(close?lastFloat.total:0),unit=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']].find(([size])=>total>=size);
  float.className='tap-money';float.textContent='+$'+(unit?(total/unit[0]).toFixed(1)+unit[1]:(Math.round(total*10)/10).toLocaleString('en-US'))+(combo>1?' · '+combo.toFixed(1)+'×':'');
  if(!close){
   const side=(serial++%3-1)*18;
   float.style.left=Math.max(52,Math.min(rect.width-52,x+side))+'px';float.style.top=y+'px';effects.append(float);
   setTimeout(()=>float.remove(),1000);
  }
  lastFloat={node:float,total,x,y,at:stamp};
  const ring=document.createElement('span');ring.className='tap-ripple';ring.style.left=x+'px';ring.style.top=y+'px';effects.append(ring);setTimeout(()=>ring.remove(),650);
  while(effects.querySelectorAll('.tap-money').length>6)effects.querySelector('.tap-money').remove();
  while(effects.querySelectorAll('.tap-ripple').length>8)effects.querySelector('.tap-ripple').remove();
  // A fresh ripple carries tap feedback without forcing synchronous layout.
  onTap({earned,combo,x:x/rect.width,y:y/rect.height});
 }
 function down(e){pointers.add(e.pointerId);if(pointers.size>1){candidate=null;return;}if(e.button!==0||!e.isPrimary||control(e.target))return;candidate={id:e.pointerId,x:e.clientX,y:e.clientY};}
 function move(e){if(candidate?.id===e.pointerId&&Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)>12)candidate=null;}
 function up(e){const start=candidate;candidate=null;pointers.delete(e.pointerId);if(start?.id!==e.pointerId||pointers.size||control(e.target)||Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)return;activate(e.clientX,e.clientY);}
 function cancel(e){pointers.delete(e.pointerId);candidate=null;}
 function reset(){pointers.clear();candidate=null;}
 function visibility(){if(document.hidden)reset();}
 function key(e){if(e.target!==element||!['Enter',' '].includes(e.key)||e.repeat)return;e.preventDefault();const rect=element.getBoundingClientRect();activate(rect.left+rect.width*.55,rect.top+rect.height*.5);}
 element.tabIndex=0;element.setAttribute('aria-label','Live transport scene. Tap, click, or press Enter to earn.');
 element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);element.addEventListener('keydown',key);
 window.addEventListener('blur',reset);window.addEventListener('pagehide',reset);document.addEventListener('visibilitychange',visibility);
 return {destroy(){for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['keydown',key]])element.removeEventListener(name,fn);window.removeEventListener('blur',reset);window.removeEventListener('pagehide',reset);document.removeEventListener('visibilitychange',visibility);effects.remove();}};
}
