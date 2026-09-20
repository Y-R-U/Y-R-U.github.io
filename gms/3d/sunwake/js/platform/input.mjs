import {clamp} from '../core/math.mjs';
// Left zone: a rudder that appears wherever the thumb lands. Right zone: a
// throttle lever whose touch point is FULL AHEAD, because that is what a player
// means by pressing the right of the screen; sliding down eases off and then
// goes astern. Nothing is drawn until a thumb is down.
export const STEER_TRAVEL=56,STEER_DEADZONE=6,THROTTLE_TRAVEL=72,THROTTLE_DEADZONE=8;
export function createInput({rudder,ahead,astern,zones,steerZone,throttleZone,onPause,getScheme=()=>'invisible',onFirstUse}){
  const keys=new Set(),pointers=new Map(),pulses={chartPressed:false,pausePressed:false,mutePressed:false};let device='keyboard';
  const axes=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  const reelKeys=new Set(['Space']);
  const down=code=>Number(keys.has(code));
  const zoneState=new Map();   // element -> {id,ox,oy,value}
  const used={steer:false,throttle:false};
  function paint(element){
    const live=zoneState.get(element);
    element.classList.toggle('live',!!live);
    if(!live){element.removeAttribute('data-readout');return;}
    element.style.setProperty('--ox',live.ox+'px');element.style.setProperty('--oy',live.oy+'px');
    if(element===steerZone){
      element.style.setProperty('--kx',clamp(live.dx,-STEER_TRAVEL,STEER_TRAVEL)+'px');element.style.setProperty('--ky','0px');
      const v=Math.round(Math.abs(live.value)*100);
      element.dataset.readout=Math.abs(live.value)<.04?'AMIDSHIPS':(live.value<0?'PORT ':'STARBOARD ')+v;
    }else{
      // The knob shows the lever position, so it is clamped to the ring: at full
      // astern the raw offset is 144 px and the knob would slide off the bottom
      // of its own ring and vanish.
      element.style.setProperty('--kx','0px');
      element.style.setProperty('--ky',clamp(-live.value*56,-56,56)+'px');
      element.dataset.readout=live.value>.04?'AHEAD '+Math.round(live.value*100):live.value<-.04?'ASTERN '+Math.round(-live.value*100):'STOP';
    }
  }
  function clearZone(element){zoneState.delete(element);paint(element);}
  function clear(){
    keys.clear();pointers.clear();rudder.style.setProperty('--helm','0px');
    for(const element of [rudder,ahead,astern])element.classList.remove('held');
    for(const element of [steerZone,throttleZone])if(element)clearZone(element);
  }
  addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;
    if(axes.has(e.code)||reelKeys.has(e.code)){e.preventDefault();keys.add(e.code);if(axes.has(e.code))device='keyboard';}
    if(!e.repeat&&['Escape','KeyP','KeyM','KeyQ'].includes(e.code)){
      e.preventDefault();if(e.code==='KeyM')pulses.chartPressed=true;else if(e.code==='KeyQ')pulses.mutePressed=true;else {pulses.pausePressed=true;onPause();}
    }
  });
  addEventListener('keyup',e=>{if(axes.has(e.code)||reelKeys.has(e.code)){e.preventDefault();keys.delete(e.code);}});
  function set(e,element){const p=pointers.get(e.pointerId);if(!p)return;device='pointer';if(element===rudder){const r=rudder.getBoundingClientRect(),raw=clamp((e.clientX-r.x-r.width/2)/48,-1,1);p.value=Math.abs(raw)<.08?0:Math.sign(raw)*(Math.abs(raw)-.08)/.92;rudder.style.setProperty('--helm',`${raw*48}px`);}}
  for(const element of [rudder,ahead,astern]){
    element.addEventListener('pointerdown',e=>{e.preventDefault();if([...pointers.values()].some(p=>p.element===element))return;device='pointer';pointers.set(e.pointerId,{element,value:element===ahead?1:element===astern?-1:0});element.setPointerCapture(e.pointerId);element.classList.add('held');set(e,element);});
    element.addEventListener('pointermove',e=>set(e,element));
    const release=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);element.classList.remove('held');if(element===rudder)rudder.style.setProperty('--helm','0px');};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,release);
    element.addEventListener('contextmenu',e=>e.preventDefault());
  }

  // The invisible zones. One pointer per zone; a second finger in the same half
  // is ignored rather than fighting the first.
  function track(element,e){
    const live=zoneState.get(element);if(!live||live.id!==e.pointerId)return;
    const rect=element.getBoundingClientRect();
    live.dx=e.clientX-rect.x-live.ox;live.dy=e.clientY-rect.y-live.oy;
    if(element===steerZone){
      const raw=clamp(live.dx/STEER_TRAVEL,-1,1),dead=STEER_DEADZONE/STEER_TRAVEL;
      live.value=Math.abs(raw)<dead?0:Math.sign(raw)*(Math.abs(raw)-dead)/(1-dead);
      if(Math.abs(live.value)>.25&&!used.steer){used.steer=true;onFirstUse?.(used);}
    }else{
      // Touch point is full ahead; sliding down eases off and reverses.
      const eased=live.dy<=THROTTLE_DEADZONE?0:(live.dy-THROTTLE_DEADZONE);
      live.value=clamp(1-eased/THROTTLE_TRAVEL,-1,1);
      if(!used.throttle){used.throttle=true;onFirstUse?.(used);}
    }
    paint(element);
  }
  for(const element of [steerZone,throttleZone]){
    if(!element)continue;
    element.addEventListener('pointerdown',e=>{
      if(getScheme()!=='invisible')return;
      e.preventDefault();if(zoneState.has(element))return;
      device='pointer';const rect=element.getBoundingClientRect();
      zoneState.set(element,{id:e.pointerId,ox:e.clientX-rect.x,oy:e.clientY-rect.y,dx:0,dy:0,value:element===throttleZone?1:0});
      element.setPointerCapture(e.pointerId);
      if(element===throttleZone&&!used.throttle){used.throttle=true;onFirstUse?.(used);}
      paint(element);
    });
    element.addEventListener('pointermove',e=>track(element,e));
    const release=e=>{const live=zoneState.get(element);if(live&&live.id===e.pointerId)clearZone(element);};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,release);
    element.addEventListener('contextmenu',e=>e.preventDefault());
  }

  for(const event of ['blur','orientationchange'])addEventListener(event,clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  let portrait=innerWidth<innerHeight;addEventListener('resize',()=>{const next=innerWidth<innerHeight;if(next!==portrait)clear();portrait=next;});
  return {clear,used,
    read(consume=true){
      let throttle=0,steer=0;
      if(device==='keyboard'){
        throttle=Number(!!(down('KeyW')||down('ArrowUp')))-Number(!!(down('KeyS')||down('ArrowDown')));
        steer=Number(!!(down('KeyD')||down('ArrowRight')))-Number(!!(down('KeyA')||down('ArrowLeft')));
      }else{
        for(const p of pointers.values()){if(p.element===rudder)steer=p.value;else throttle+=p.value;}
        const s=steerZone&&zoneState.get(steerZone),t=throttleZone&&zoneState.get(throttleZone);
        if(s)steer=s.value;
        if(t)throttle+=t.value;
      }
      const result={throttle:clamp(throttle,-1,1),steer,...pulses};
      if(consume)for(const key of Object.keys(pulses))pulses[key]=false;
      return result;
    },
    // Reeling is a single held touch: the throttle half of the screen while a
    // fish is on, or the space bar on a keyboard. Deliberately the same thumb
    // the player already has down.
    get reeling(){return keys.has('Space')||(throttleZone?zoneState.has(throttleZone):false)||[...pointers.values()].some(p=>p.element===ahead);},
    get device(){return device;},
    get zones(){return {steer:steerZone&&zoneState.has(steerZone)?{...zoneState.get(steerZone)}:null,throttle:throttleZone&&zoneState.has(throttleZone)?{...zoneState.get(throttleZone)}:null};}};
}
