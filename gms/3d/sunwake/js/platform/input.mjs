import {clamp} from '../core/math.mjs';
export function createInput({rudder,ahead,astern,onPause}){
  const keys=new Set(),pointers=new Map(),pulses={chartPressed:false,pausePressed:false,mutePressed:false};let device='keyboard';
  const axes=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  const down=code=>Number(keys.has(code));
  function clear(){keys.clear();pointers.clear();rudder.style.setProperty('--helm','0px');for(const element of [rudder,ahead,astern]){element.classList.remove('held');}}
  addEventListener('keydown',e=>{
    if(axes.has(e.code)){e.preventDefault();keys.add(e.code);device='keyboard';}
    if(!e.repeat&&['Escape','KeyP','KeyM','KeyQ'].includes(e.code)){
      e.preventDefault();if(e.code==='KeyM')pulses.chartPressed=true;else if(e.code==='KeyQ')pulses.mutePressed=true;else {pulses.pausePressed=true;onPause();}
    }
  });
  addEventListener('keyup',e=>{if(axes.has(e.code)){e.preventDefault();keys.delete(e.code);}});
  function set(e,element){const p=pointers.get(e.pointerId);if(!p)return;device='pointer';if(element===rudder){const r=rudder.getBoundingClientRect(),raw=clamp((e.clientX-r.x-r.width/2)/48,-1,1);p.value=Math.abs(raw)<.08?0:Math.sign(raw)*(Math.abs(raw)-.08)/.92;rudder.style.setProperty('--helm',`${raw*48}px`);}}
  for(const element of [rudder,ahead,astern]){
    element.addEventListener('pointerdown',e=>{e.preventDefault();if([...pointers.values()].some(p=>p.element===element))return;device='pointer';pointers.set(e.pointerId,{element,value:element===ahead?1:element===astern?-1:0});element.setPointerCapture(e.pointerId);element.classList.add('held');set(e,element);});
    element.addEventListener('pointermove',e=>set(e,element));
    const release=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);element.classList.remove('held');if(element===rudder)rudder.style.setProperty('--helm','0px');};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,release);
    element.addEventListener('contextmenu',e=>e.preventDefault());
  }
  for(const event of ['blur','orientationchange'])addEventListener(event,clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  let portrait=innerWidth<innerHeight;addEventListener('resize',()=>{const next=innerWidth<innerHeight;if(next!==portrait)clear();portrait=next;});
  return {clear,read(consume=true){let throttle=0,steer=0;if(device==='keyboard'){throttle=Number(!!(down('KeyW')||down('ArrowUp')))-Number(!!(down('KeyS')||down('ArrowDown')));steer=Number(!!(down('KeyD')||down('ArrowRight')))-Number(!!(down('KeyA')||down('ArrowLeft')));}else for(const p of pointers.values()){if(p.element===rudder)steer=p.value;else throttle+=p.value;}
    const result={throttle:clamp(throttle,-1,1),steer,...pulses};if(consume)for(const key of Object.keys(pulses))pulses[key]=false;return result;},get device(){return device;}};
}
